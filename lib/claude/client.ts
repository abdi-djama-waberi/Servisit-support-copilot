import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CLAUDE_MODEL = "claude-sonnet-4-6";

// Pricing per token (claude-sonnet-4-6: $3/1M input, $15/1M output)
export const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
export const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export const SYSTEM_PROMPT = `You are an expert IT support specialist for ServesIT, a managed service provider based in the UAE. \
Your role is to help customers resolve technical issues efficiently and professionally. \
Provide clear, step-by-step troubleshooting guidance. \
If an issue requires escalation, let the customer know and suggest they create a support ticket. \
Always be polite, patient, and thorough in your responses.`;

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
