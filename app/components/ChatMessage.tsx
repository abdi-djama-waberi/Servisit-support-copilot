type Props = {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  cost?: number;
  latencyMs?: number;
  streaming?: boolean;
  error?: boolean;
};

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  gpt4o: "GPT-4o",
  gemini: "Gemini",
};

export function ChatMessage({ role, content, provider, cost, latencyMs, streaming, error }: Props) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? "bg-blue-600 text-white rounded-br-sm"
              : error
              ? "bg-red-950/60 border border-red-800/40 text-red-300 rounded-bl-sm"
              : "bg-[#152B50] border border-[#1A3456]/60 text-gray-100 rounded-bl-sm"
          }`}
        >
          {content || (streaming ? "" : "​")}
          {streaming && (
            <span className="inline-block w-[2px] h-[14px] bg-blue-400 ml-0.5 align-middle rounded-sm animate-blink" />
          )}
        </div>

        {/* Provider / cost / latency tag — AI messages only, after streaming completes */}
        {!isUser && !streaming && (provider || cost !== undefined || latencyMs !== undefined) && (
          <div className="flex items-center gap-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {provider && (
              <span className="text-[10px] text-blue-400/70 bg-blue-900/20 border border-blue-800/20 rounded px-1.5 py-0.5 font-medium">
                {PROVIDER_LABELS[provider] ?? provider}
              </span>
            )}
            {cost !== undefined && (
              <span className="text-[10px] text-gray-600">${cost.toFixed(5)}</span>
            )}
            {latencyMs !== undefined && (
              <span className="text-[10px] text-gray-600">{(latencyMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
