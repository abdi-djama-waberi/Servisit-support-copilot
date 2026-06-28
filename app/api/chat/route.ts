import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/utils/generateRequestId";
import { logger } from "@/lib/logging/logger";

// customerId must be a non-empty alphanumeric string (letters, digits, hyphens, underscores)
const CUSTOMER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function authenticate(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token === process.env.API_KEY;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  if (!authenticate(req)) {
    logger.warn("Unauthorized chat request", requestId);
    return NextResponse.json(
      { error: "Unauthorized", requestId },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logger.warn("Invalid JSON body in chat request", requestId);
    return NextResponse.json(
      { error: "Invalid JSON body", requestId },
      { status: 400 }
    );
  }

  const { message, customerId } = body as Record<string, unknown>;

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
      { error: "customerId must be alphanumeric (letters, digits, hyphens, underscores, max 64 chars)", requestId },
      { status: 400 }
    );
  }

  logger.info("Chat request received", requestId, { customerId, messageLength: message.length });

  const response = {
    id: generateRequestId(),
    timestamp: new Date().toISOString(),
    status: "received",
    requestId,
  };

  logger.info("Chat request processed", requestId, { customerId });

  return NextResponse.json(response, { status: 200 });
}
