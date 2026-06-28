export function validateApiKey(key: string | null | undefined): boolean {
  return key === process.env.API_KEY;
}

export function validateWebhookSecret(secret: string | null | undefined): boolean {
  return secret === process.env.WEBHOOK_SECRET;
}
