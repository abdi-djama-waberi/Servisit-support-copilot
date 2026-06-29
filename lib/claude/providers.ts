import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI, type Part, type Content } from "@google/generative-ai";
import { anthropic, CLAUDE_MODEL, SYSTEM_PROMPT, INPUT_COST_PER_TOKEN, OUTPUT_COST_PER_TOKEN } from "@/lib/claude/client";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/claude/tools";
import { type ErrorMode, triggerSimulatedError } from "@/lib/claude/error-simulator";

export type ProviderName = "claude" | "gpt4o" | "gemini";

export type ConversationMessage = { role: "user" | "assistant"; content: string };

export type ProviderRunInput = {
  message: string;
  history: ConversationMessage[];
  simulateError?: ErrorMode;
};

export type ProviderRunOutput = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  toolsUsed: string[];
  iterations: number;
};

export type ProviderDef = {
  name: ProviderName;
  model: string;
  costPerInputToken: number;
  costPerOutputToken: number;
  run: (input: ProviderRunInput) => Promise<ProviderRunOutput>;
};

const MAX_TOOL_ITERATIONS = 10;

// ─── Claude ─────────────────────────────────────────────────────────────────

type AnthropicToolUse = Extract<Anthropic.ContentBlock, { type: "tool_use" }>;

async function runClaude(input: ProviderRunInput): Promise<ProviderRunOutput> {
  triggerSimulatedError(input.simulateError);

  let messages: Anthropic.MessageParam[] = [
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: input.message },
  ];

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
        (b): b is AnthropicToolUse => b.type === "tool_use"
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        toolsUsed.push(block.name);
        let resultContent: string;
        let isError = false;
        try {
          resultContent = JSON.stringify(executeTool(block.name, block.input as Record<string, string>));
        } catch (err) {
          resultContent = JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed" });
          isError = true;
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultContent, ...(isError && { is_error: true }) });
      }

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    } else {
      const textBlock = response.content.find((b) => b.type === "text");
      finalText = textBlock?.type === "text" ? textBlock.text : "";
      break;
    }
  }

  return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, toolsUsed, iterations };
}

// ─── GPT-4o ─────────────────────────────────────────────────────────────────

const GPT4O_MODEL = "gpt-4o-2024-11-20";

function toOpenAITools(): OpenAI.Chat.ChatCompletionTool[] {
  return TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

async function runGPT4o(input: ProviderRunInput): Promise<ProviderRunOutput> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools = toOpenAITools();

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...input.history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: input.message },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];
  let iterations = 0;
  let finalText = "";

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await openai.chat.completions.create({
      model: GPT4O_MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });

    totalInputTokens += response.usage?.prompt_tokens ?? 0;
    totalOutputTokens += response.usage?.completion_tokens ?? 0;

    const choice = response.choices[0];

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls?.length) {
      messages.push(choice.message);
      const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") continue;
        toolsUsed.push(tc.function.name);
        let result: unknown;
        try {
          result = executeTool(tc.function.name, JSON.parse(tc.function.arguments) as Record<string, string>);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Tool execution failed" };
        }
        toolResultMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      messages.push(...toolResultMessages);
    } else {
      finalText = choice.message.content ?? "";
      break;
    }
  }

  return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, toolsUsed, iterations };
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.0-flash";

function toGeminiFunctionDeclarations() {
  return TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    parameters: t.input_schema as Record<string, unknown>,
  }));
}

async function runGemini(input: ProviderRunInput): Promise<ProviderRunOutput> {
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const model = genai.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ functionDeclarations: toGeminiFunctionDeclarations() as any }],
  });

  const geminiHistory: Content[] = input.history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];
  let iterations = 0;
  let finalText = "";

  // First message is the user's text; subsequent sends are tool result Parts
  let nextMessage: string | Part[] = input.message;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const result = await chat.sendMessage(nextMessage);
    const response = result.response;

    totalInputTokens += response.usageMetadata?.promptTokenCount ?? 0;
    totalOutputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const responseParts: Part[] = [];

      for (const fc of functionCalls) {
        toolsUsed.push(fc.name);
        let toolResult: unknown;
        try {
          toolResult = executeTool(fc.name, fc.args as Record<string, string>);
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : "Tool execution failed" };
        }
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: toolResult as Record<string, unknown>,
          },
        });
      }

      nextMessage = responseParts;
    } else {
      finalText = response.text();
      break;
    }
  }

  return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, toolsUsed, iterations };
}

// ─── Provider registry ───────────────────────────────────────────────────────

// Priority order: Gemini (free tier) → GPT-4o → Claude (requires paid credits)
export const PROVIDERS: ProviderDef[] = [
  {
    name: "gemini",
    model: GEMINI_MODEL,
    // gemini-2.0-flash: $0.10/1M input, $0.40/1M output (free tier available)
    costPerInputToken: 0.10 / 1_000_000,
    costPerOutputToken: 0.40 / 1_000_000,
    run: runGemini,
  },
  {
    name: "gpt4o",
    model: GPT4O_MODEL,
    // gpt-4o-2024-11-20: $2.50/1M input, $10.00/1M output
    costPerInputToken: 2.5 / 1_000_000,
    costPerOutputToken: 10 / 1_000_000,
    run: runGPT4o,
  },
  {
    name: "claude",
    model: CLAUDE_MODEL,
    costPerInputToken: INPUT_COST_PER_TOKEN,
    costPerOutputToken: OUTPUT_COST_PER_TOKEN,
    run: runClaude,
  },
];
