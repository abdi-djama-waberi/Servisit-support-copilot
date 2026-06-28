import { createHmac, timingSafeEqual } from "crypto";

export function verifyWebhookSecret(secret: string | null): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!secret || !expected) return false;

  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(expected);

  if (secretBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(secretBuf, expectedBuf);
}

export function verifyWebhookHmac(payload: string, signature: string | null): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  let sigHex = signature;
  // Strip "sha256=" prefix if present
  if (signature.startsWith("sha256=")) {
    sigHex = signature.slice(7);
  }

  try {
    const sigBuf = Buffer.from(sigHex, "hex");
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
