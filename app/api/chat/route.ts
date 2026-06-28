import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
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
import { TOOL_DEFINITIONS, executeTool } from "@/lib/claude/tools";

const CUSTOMER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_TOOL_ITERATIONS = 10;

function authenticate(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token === process.env.API_KEY;
}

function sse(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>;

/**
 * Runs the agentic tool-call loop until Claude returns a final text response.
 * All tool calls are resolved before any streaming begins.
 */
async function runToolLoop(
  initialMessages: Anthropic.MessageParam[]
): Promise<{
  finalText: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolsUsed: string[];
  iterations: number;
}> {
  let messages: Anthropic.MessageParam[] = initialMessages;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];
  let iterations = 0;
  let finalText = "";

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        toolsUsed.push(block.name);

        let resultContent: string;
        let isError = false;

        try {
          const result = executeTool(block.name, block.input as Record<string, string>);
          resultContent = JSON.stringify(result);
        } catch (err) {
          resultContent = JSON.stringify({
            error: err instanceof Error ? err.message : "Tool execution failed",
          });
          isError = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
          ...(isError && { is_error: true }),
        });
      }

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    } else {
      // stop_reason is "end_turn" or "max_tokens" — extract final text
      const textBlock = response.content.find((b) => b.type === "text");
      finalText = textBlock?.type === "text" ? textBlock.text : "";
      break;
    }
  }

  return { finalText, totalInputTokens, totalOutputTokens, toolsUsed, iterations };
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
      {
        error: "customerId must be alphanumeric (letters, digits, hyphens, underscores, max 64 chars)",
        requestId,
      },
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
        const initialMessages: Anthropic.MessageParam[] = [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: message.trim() },
        ];

        const { finalText, totalInputTokens, totalOutputTokens, toolsUsed, iterations } =
          await runToolLoop(initialMessages);

        const tokensUsed = totalInputTokens + totalOutputTokens;
        const cost =
          totalInputTokens * INPUT_COST_PER_TOKEN +
          totalOutputTokens * OUTPUT_COST_PER_TOKEN;
        const latencyMs = Date.now() - startTime;

        logger.info("Tool loop completed", requestId, {
          customerId,
          iterations,
          toolsUsed,
          toolCallCount: toolsUsed.length,
        });

        // Emit final text as a single delta (tool loop already resolved)
        if (finalText) {
          controller.enqueue(sse({ type: "delta", text: finalText }));
        }

        incrementMetrics(latencyMs, cost, tokensUsed);
        logger.logChatRequest(requestId, customerId, tokensUsed, cost, latencyMs, toolsUsed);

        controller.enqueue(
          sse({
            type: "done",
            tokensUsed,
            cost: parseFloat(cost.toFixed(6)),
            toolsUsed,
            iterations,
            requestId,
          })
        );
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        logger.error("Claude API error", requestId, {
          customerId,
          latencyMs,
          error: err instanceof Error ? err.message : String(err),
        });
        controller.enqueue(
          sse({ type: "error", message: "Claude API unavailable", requestId })
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
