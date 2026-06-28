type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  meta?: Record<string, unknown>;
}

function log(level: LogLevel, message: string, requestId?: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(requestId && { requestId }),
    ...(meta && { meta }),
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (message: string, requestId?: string, meta?: Record<string, unknown>) =>
    log("info", message, requestId, meta),
  warn: (message: string, requestId?: string, meta?: Record<string, unknown>) =>
    log("warn", message, requestId, meta),
  error: (message: string, requestId?: string, meta?: Record<string, unknown>) =>
    log("error", message, requestId, meta),
  debug: (message: string, requestId?: string, meta?: Record<string, unknown>) =>
    log("debug", message, requestId, meta),
  logChatRequest: (
    requestId: string,
    customerId: string,
    tokensUsed: number,
    cost: number,
    latencyMs: number,
    toolsUsed: string[] = [],
    providerUsed = "claude",
    failedProviders: string[] = [],
    retryCount = 0
  ) =>
    log("info", "Chat request completed", requestId, {
      customerId,
      tokensUsed,
      cost: parseFloat(cost.toFixed(6)),
      latencyMs,
      toolsUsed,
      toolCallCount: toolsUsed.length,
      providerUsed,
      failedProviders,
      retryCount,
    }),
};
