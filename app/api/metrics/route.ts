import { NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";

// In-memory counters. In production these would come from a metrics store (Redis, Datadog, etc.).
let totalRequests = 0;
let totalCost = 0;
let totalLatencyMs = 0;
let activeRequests = 0;

export function incrementMetrics(latencyMs: number, cost = 0): void {
  totalRequests++;
  totalCost += cost;
  totalLatencyMs += latencyMs;
}

export function trackActiveRequest(delta: 1 | -1): void {
  activeRequests = Math.max(0, activeRequests + delta);
}

export async function GET(): Promise<NextResponse> {
  const requestId = generateRequestId();

  logger.info("Metrics requested", requestId);

  return NextResponse.json(
    {
      totalRequests,
      totalCost: parseFloat(totalCost.toFixed(6)),
      averageLatency: totalRequests > 0 ? parseFloat((totalLatencyMs / totalRequests).toFixed(2)) : 0,
      activeRequests,
      requestId,
    },
    { status: 200 }
  );
}
