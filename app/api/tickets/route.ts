import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";
import { verifyWebhookHmac } from "@/lib/auth/verifyWebhook";

const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

function isValidPriority(value: unknown): value is Priority {
  return typeof value === "string" && (VALID_PRIORITIES as readonly string[]).includes(value);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  // Read raw body text for HMAC verification before parsing JSON
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-secret");

  if (!verifyWebhookHmac(rawBody, signature)) {
    logger.warn("Unauthorized ticket request: invalid webhook signature", requestId);
    return NextResponse.json(
      { error: "Unauthorized: invalid webhook signature", requestId },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    logger.warn("Invalid JSON body in ticket request", requestId);
    return NextResponse.json(
      { error: "Invalid JSON body", requestId },
      { status: 400 }
    );
  }

  const { subject, description, priority, customerId } = body as Record<string, unknown>;

  const missing: string[] = [];
  if (typeof subject !== "string" || subject.trim() === "") missing.push("subject");
  if (typeof description !== "string" || description.trim() === "") missing.push("description");
  if (typeof customerId !== "string" || customerId.trim() === "") missing.push("customerId");

  if (missing.length > 0) {
    logger.warn("Ticket validation failed: missing fields", requestId, { missing });
    return NextResponse.json(
      { error: `Missing or empty required fields: ${missing.join(", ")}`, requestId },
      { status: 400 }
    );
  }

  if (!isValidPriority(priority)) {
    logger.warn("Ticket validation failed: invalid priority", requestId, { priority });
    return NextResponse.json(
      { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}`, requestId },
      { status: 400 }
    );
  }

  logger.info("Ticket request received", requestId, { customerId, priority });

  const response = {
    ticketId: generateRequestId(),
    created: new Date().toISOString(),
    requestId,
  };

  logger.info("Ticket created", requestId, { ticketId: response.ticketId, customerId, priority });

  return NextResponse.json(response, { status: 201 });
}
