import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";
import { incrementMetrics, trackActiveRequest } from "@/app/api/metrics/route";
import { type ConversationMessage } from "@/lib/claude/providers";
import { routeWithFallback } from "@/lib/claude/fallback-router";

// Internal UI endpoint — no bearer auth required (same-origin dashboard only).
// Add rate limiting before exposing to untrusted callers in production.
const CUSTOMER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function sse(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const requestId = generateRequestId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", requestId }, { status: 400 });
  }

  const { message, customerId, conversationHistory } = body as Record<string, unknown>;

  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "message must be a non-empty string", requestId }, { status: 400 });
  }

  if (typeof customerId !== "string" || !CUSTOMER_ID_RE.test(customerId)) {
    return NextResponse.json({ error: "invalid customerId", requestId }, { status: 400 });
  }

  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? (conversationHistory as ConversationMessage[]).filter(
        (h) => h && typeof h.role === "string" && typeof h.content === "string"
      )
    : [];

  logger.info("UI chat request received", requestId, {
    customerId,
    messageLength: message.trim().length,
  });

  trackActiveRequest(1);
  const startTime = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await routeWithFallback({
          message: message.trim(),
          history,
          requestId,
        });

        const latencyMs = Date.now() - startTime;

        if (!result.success) {
          logger.error("All providers exhausted on UI chat", requestId, { customerId, latencyMs });
          controller.enqueue(sse({ type: "error", message: "Service temporarily unavailable", requestId }));
          return;
        }

        incrementMetrics(latencyMs, result.cost, result.tokensUsed);
        logger.logChatRequest(
          requestId, customerId, result.tokensUsed, result.cost, latencyMs,
          result.toolsUsed, result.providerUsed, result.failedProviders, result.retryCount
        );

        controller.enqueue(sse({ type: "delta", text: result.text }));
        controller.enqueue(
          sse({
            type: "done",
            tokensUsed: result.tokensUsed,
            cost: parseFloat(result.cost.toFixed(6)),
            providerUsed: result.providerUsed,
            toolsUsed: result.toolsUsed,
            failedProviders: result.failedProviders,
            retryCount: result.retryCount,
            latencyMs,
            requestId,
          })
        );
      } catch (err) {
        logger.error("Unexpected error in UI chat handler", requestId, {
          errorName: err instanceof Error ? err.name : "UnknownError",
        });
        controller.enqueue(sse({ type: "error", message: "Internal server error", requestId }));
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
