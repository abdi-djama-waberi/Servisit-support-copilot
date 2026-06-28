import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";
import { incrementMetrics, trackActiveRequest } from "@/app/api/metrics/route";
import {
  anthropic,
  CLAUDE_MODEL,
  SYSTEM_PROMPT,
  INPUT_COST_PER_TOKEN,
  OUTPUT_COST_PER_TOKEN,
  type ConversationMessage,
} from "@/lib/claude/client";

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

  const { message, customerId, conversationHistory } = body as Record<string, unknown>;

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
      { error: "customerId must be alphanumeric (letters, digits, hyphens, underscores, max 64 chars)", requestId },
      { status: 400 }
    );
  }

  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? (conversationHistory as ConversationMessage[]).filter(
        (h) => h && typeof h.role === "string" && typeof h.content === "string"
      )
    : [];

  logger.info("Chat request received", requestId, {
    customerId,
    messageLength: message.trim().length,
    historyLength: history.length,
  });

  trackActiveRequest(1);
  const startTime = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: "user" as const, content: message.trim() },
          ],
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(sse({ type: "delta", text: event.delta.text }));
          }
        }

        const final = await claudeStream.finalMessage();
        const inputTokens = final.usage.input_tokens;
        const outputTokens = final.usage.output_tokens;
        const tokensUsed = inputTokens + outputTokens;
        const cost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
        const latencyMs = Date.now() - startTime;

        incrementMetrics(latencyMs, cost, tokensUsed);
        logger.logChatRequest(requestId, customerId, tokensUsed, cost, latencyMs);

        controller.enqueue(sse({ type: "done", tokensUsed, cost: parseFloat(cost.toFixed(6)), requestId }));
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        logger.error("Claude API error", requestId, {
          customerId,
          latencyMs,
          error: err instanceof Error ? err.message : String(err),
        });
        controller.enqueue(sse({ type: "error", message: "Claude API unavailable", requestId }));
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
