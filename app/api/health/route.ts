import { NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";

export async function GET(): Promise<NextResponse> {
  const requestId = generateRequestId();

  logger.info("Health check", requestId);

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      requestId,
    },
    { status: 200 }
  );
}
