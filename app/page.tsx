"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./components/ChatMessage";
import { MetricCard } from "./components/MetricCard";

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  cost?: number;
  latencyMs?: number;
  streaming?: boolean;
  error?: boolean;
};

type MetricsData = {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  activeRequests: number;
};

type NavItem = { id: string; label: string; icon: React.ReactNode };

// ─── SVG icons ───────────────────────────────────────────────────────────────

function IconChat() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconTickets() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z" />
    </svg>
  );
}
function IconMetrics() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", icon: <IconChat /> },
  { id: "tickets", label: "Tickets", icon: <IconTickets /> },
  { id: "metrics", label: "Metrics", icon: <IconMetrics /> },
  { id: "settings", label: "Settings", icon: <IconSettings /> },
];

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm the ServesIT Support Copilot. I can look up tickets, check asset status, and help troubleshoot IT issues for your customers.\n\nTry asking: \"What's the status of ticket INC-4471?\" or \"Show me all VPN assets.\"",
  provider: "claude",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeNav, setActiveNav] = useState("chat");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Metrics polling ──────────────────────────────────────────────────────

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) return;
      const data: MetricsData = await res.json();
      setMetrics(data);
    } catch {
      // network error — keep showing last known values
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    const userMsgId = `u-${Date.now()}`;
    const aiMsgId = `a-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text },
      { id: aiMsgId, role: "assistant", content: "", streaming: true },
    ]);

    const startTime = Date.now();

    try {
      const res = await fetch("/api/ui/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, customerId: "demo-user" }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;

            if (event.type === "delta" && typeof event.text === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId ? { ...m, content: m.content + event.text } : m
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        streaming: false,
                        provider: event.providerUsed as string | undefined,
                        cost: typeof event.cost === "number" ? event.cost : undefined,
                        latencyMs: Date.now() - startTime,
                      }
                    : m
                )
              );
              setIsStreaming(false);
              fetchMetrics();
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        streaming: false,
                        content: "Sorry, I couldn't process that request. Please try again.",
                        error: true,
                      }
                    : m
                )
              );
              setIsStreaming(false);
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                streaming: false,
                content: "Connection error. Please check your network and try again.",
                error: true,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, fetchMetrics]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Metric card data ─────────────────────────────────────────────────────

  const metricCards = [
    {
      label: "Total Requests",
      value: metrics ? metrics.totalRequests.toLocaleString() : "—",
      sub: "since last restart",
    },
    {
      label: "Total Cost",
      value: metrics ? `$${metrics.totalCost.toFixed(4)}` : "—",
      sub: "across all providers",
    },
    {
      label: "Avg Latency",
      value: metrics ? `${(metrics.averageLatency / 1000).toFixed(2)}s` : "—",
      sub: "end-to-end",
    },
    {
      label: "Active Sessions",
      value: metrics ? metrics.activeRequests.toString() : "—",
      sub: "in-flight right now",
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-[#0A1628] text-white overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="hidden md:flex w-[200px] shrink-0 flex-col bg-[#0D1E35] border-r border-[#1A3456]/50 h-full">
        {/* Logo */}
        <div className="p-5 pb-4 border-b border-[#1A3456]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white leading-none">ServesIT</div>
              <div className="text-[10px] text-blue-400 font-medium mt-0.5">Copilot</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-blue-600/15 text-blue-400 border border-blue-600/25"
                    : "text-gray-500 hover:bg-[#112347] hover:text-gray-200 border border-transparent"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#1A3456]/50">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Primary Provider</div>
          <div className="text-xs text-gray-400 font-medium">Gemini 2.0 Flash</div>
          <div className="text-[10px] text-gray-600 mt-0.5">v0.1.0</div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-[#1A3456]/50 flex items-center px-5 justify-between bg-[#0A1628]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Mobile logo */}
            <div className="flex md:hidden items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
            </div>
            <h1 className="text-sm font-semibold text-white">Support Copilot</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium text-green-400">Live</span>
            </div>
            {metrics && (
              <span className="hidden sm:block text-[10px] text-gray-600">
                {metrics.activeRequests} active
              </span>
            )}
          </div>
        </header>

        {/* Metrics bar */}
        <section className="shrink-0 px-5 py-3 border-b border-[#1A3456]/50 grid grid-cols-2 md:grid-cols-4 gap-3">
          {metricCards.map((card) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              sub={card.sub}
              loading={metricsLoading}
            />
          ))}
        </section>

        {/* Chat area */}
        <main className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scrollbar-thin">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              provider={msg.provider}
              cost={msg.cost}
              latencyMs={msg.latencyMs}
              streaming={msg.streaming}
              error={msg.error}
            />
          ))}
          <div ref={bottomRef} />
        </main>

        {/* Input bar */}
        <footer className="shrink-0 border-t border-[#1A3456]/50 p-4 bg-[#0A1628]">
          {/* Mobile nav strip */}
          <div className="flex md:hidden gap-1 mb-3 overflow-x-auto pb-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                  activeNav === item.id
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
              placeholder="Ask about a ticket, asset, or customer…"
              className="flex-1 min-w-0 resize-none bg-[#112347] border border-[#1A3456] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
              style={{ maxHeight: "120px", overflowY: "auto" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="shrink-0 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium shadow-lg shadow-blue-900/30"
            >
              {isStreaming ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <IconSend />
              )}
              <span className="hidden sm:inline">{isStreaming ? "Working…" : "Send"}</span>
            </button>
          </div>
          <p className="text-[10px] text-gray-700 mt-2 text-center">
            Press <kbd className="bg-[#1A3456] px-1 py-0.5 rounded text-[9px]">Enter</kbd> to send · <kbd className="bg-[#1A3456] px-1 py-0.5 rounded text-[9px]">Shift+Enter</kbd> for new line
          </p>
        </footer>
      </div>
    </div>
  );
}
