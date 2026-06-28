import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";
import { incrementMetrics, trackActiveRequest } from "@/app/api/metrics/route";
import { type ConversationMessage } from "@/lib/claude/providers";
import { routeWithFallback } from "@/lib/claude/fallback-router";
import { isErrorMode } from "@/lib/claude/error-simulator";

const CUSTOMER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function authenticate(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token === process.env.API_KEY;
}

function sse(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const requestId = generateRequestId();

  if (!authenticate(req)) {
    logger.warn("Unauthorized chat request", requestId);
    return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logger.warn("Invalid JSON body in chat request", requestId);
    return NextResponse.json({ error: "Invalid JSON body", requestId }, { status: 400 });
  }

  const { message, customerId, conversationHistory, _simulateError } =
    body as Record<string, unknown>;

  if (typeof message !== "string" || message.trim() === "") {
    logger.warn("Chat validation failed: empty message", requestId);
    return NextResponse.json(
      { error: "message must be a non-empty string", requestId },
      { status: 400 }
    );
  }

  if (typeof customerId !== "string" || !CUSTOMER_ID_RE.test(customerId)) {
    logger.warn("Chat validation failed: invalid customerId", requestId, { customerId });
    return NextResponse.json(
      {
        error: "customerId must be alphanumeric (letters, digits, hyphens, underscores, max 64 chars)",
        requestId,
      },
      { status: 400 }
    );
  }

  const simulateError = isErrorMode(_simulateError) ? _simulateError : undefined;

  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? (conversationHistory as ConversationMessage[]).filter(
        (h) => h && typeof h.role === "string" && typeof h.content === "string"
      )
    : [];

  logger.info("Chat request received", requestId, {
    customerId,
    messageLength: message.trim().length,
    historyLength: history.length,
    ...(simulateError && { simulateError }),
  });

  trackActiveRequest(1);
  const startTime = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await routeWithFallback({
          message: message.trim(),
          history,
          simulateError,
          requestId,
        });

        const latencyMs = Date.now() - startTime;

        if (!result.success) {
          logger.error("All providers exhausted", requestId, {
            customerId,
            latencyMs,
            failedProviders: result.failedProviders,
            retryCount: result.retryCount,
          });
          controller.enqueue(
            sse({ type: "error", message: "Service temporarily unavailable", requestId })
          );
          return;
        }

        incrementMetrics(latencyMs, result.cost, result.tokensUsed);
        logger.logChatRequest(
          requestId,
          customerId,
          result.tokensUsed,
          result.cost,
          latencyMs,
          result.toolsUsed,
          result.providerUsed,
          result.failedProviders,
          result.retryCount
        );

        controller.enqueue(sse({ type: "delta", text: result.text }));
        controller.enqueue(
          sse({
            type: "done",
            tokensUsed: result.tokensUsed,
            cost: parseFloat(result.cost.toFixed(6)),
            providerUsed: result.providerUsed,
            toolsUsed: result.toolsUsed,
            iterations: result.iterations,
            failedProviders: result.failedProviders,
            retryCount: result.retryCount,
            requestId,
          })
        );
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        logger.error("Unexpected error in chat handler", requestId, {
          customerId,
          latencyMs,
          errorName: err instanceof Error ? err.name : "UnknownError",
        });
        controller.enqueue(
          sse({ type: "error", message: "Internal server error", requestId })
        );
      } finally {
        trackActiveRequest(-1);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Request-Id": requestId,
    },
  });
}
