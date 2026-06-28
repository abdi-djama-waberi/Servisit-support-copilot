export type ErrorMode =
  | "rate_limit"
  | "auth_error"
  | "timeout"
  | "service_unavailable"
  | "invalid_request"
  | "network_error";

export const ERROR_MODES: ErrorMode[] = [
  "rate_limit",
  "auth_error",
  "timeout",
  "service_unavailable",
  "invalid_request",
  "network_error",
];

export function isErrorMode(value: unknown): value is ErrorMode {
  return typeof value === "string" && (ERROR_MODES as string[]).includes(value);
}

export class SimulatedRateLimitError extends Error {
  readonly status = 429;
  readonly code = "rate_limit_error";
  constructor() {
    super("Simulated rate limit exceeded (429) — too many requests");
    this.name = "RateLimitError";
  }
}

export class SimulatedAuthenticationError extends Error {
  readonly status = 401;
  readonly code = "authentication_error";
  constructor() {
    super("Simulated authentication failure (401) — invalid API key");
    this.name = "AuthenticationError";
  }
}

export class SimulatedTimeoutError extends Error {
  readonly code = "timeout_error";
  constructor() {
    super("Simulated request timeout — response exceeded 30 seconds");
    this.name = "TimeoutError";
  }
}

export class SimulatedServiceUnavailableError extends Error {
  readonly status = 503;
  readonly code = "service_unavailable";
  constructor() {
    super("Simulated service unavailable (503) — provider is down");
    this.name = "ServiceUnavailableError";
  }
}

export class SimulatedInvalidRequestError extends Error {
  readonly status = 400;
  readonly code = "invalid_request_error";
  constructor() {
    super("Simulated invalid request (400) — malformed request payload");
    this.name = "InvalidRequestError";
  }
}

export class SimulatedNetworkError extends Error {
  readonly code = "network_error";
  constructor() {
    super("Simulated network failure — no response received from provider");
    this.name = "NetworkError";
  }
}

/** Throws the appropriate simulated error. No-op if mode is undefined. */
export function triggerSimulatedError(mode: ErrorMode | undefined): void {
  if (!mode) return;
  switch (mode) {
    case "rate_limit":
      throw new SimulatedRateLimitError();
    case "auth_error":
      throw new SimulatedAuthenticationError();
    case "timeout":
      throw new SimulatedTimeoutError();
    case "service_unavailable":
      throw new SimulatedServiceUnavailableError();
    case "invalid_request":
      throw new SimulatedInvalidRequestError();
    case "network_error":
      throw new SimulatedNetworkError();
  }
}
