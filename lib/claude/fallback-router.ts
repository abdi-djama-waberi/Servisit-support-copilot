import { logger } from "@/lib/logging/logger";
import { PROVIDERS, type ProviderName, type ConversationMessage } from "@/lib/claude/providers";
import { type ErrorMode } from "@/lib/claude/error-simulator";

const MAX_ATTEMPTS_PER_PROVIDER = 3;
// Exponential backoff delays between retry attempts: 1s → 2s → (4s if there were a 4th)
const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FallbackResult =
  | {
      success: true;
      text: string;
      providerUsed: ProviderName;
      tokensUsed: number;
      cost: number;
      toolsUsed: string[];
      iterations: number;
      failedProviders: ProviderName[];
      retryCount: number;
    }
  | {
      success: false;
      failedProviders: ProviderName[];
      retryCount: number;
    };

export type RouterInput = {
  message: string;
  history: ConversationMessage[];
  simulateError?: ErrorMode;
  requestId: string;
};

export async function routeWithFallback(input: RouterInput): Promise<FallbackResult> {
  const failedProviders: ProviderName[] = [];
  let totalRetryCount = 0;

  for (const provider of PROVIDERS) {
    let lastError: unknown;
    let providerSucceeded = false;
    let providerRetries = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      // Exponential backoff before retry attempts (not before the first)
      if (attempt > 1) {
        const delay = BACKOFF_DELAYS_MS[attempt - 2]; // 1s before attempt 2, 2s before attempt 3
        logger.warn(`Retrying ${provider.name} (attempt ${attempt}/${MAX_ATTEMPTS_PER_PROVIDER}) after ${delay}ms`, input.requestId, {
          provider: provider.name,
          attempt,
          delayMs: delay,
        });
        await sleep(delay);
        providerRetries++;
        totalRetryCount++;
      }

      try {
        // Only simulate the error on Claude's first attempt; fallback providers run normally
        const simulateError = provider.name === "claude" ? input.simulateError : undefined;

        const result = await provider.run({
          message: input.message,
          history: input.history,
          simulateError,
        });

        const cost =
          result.inputTokens * provider.costPerInputToken +
          result.outputTokens * provider.costPerOutputToken;

        logger.info(`Provider ${provider.name} succeeded`, input.requestId, {
          provider: provider.name,
          model: provider.model,
          attempt,
          retries: providerRetries,
          toolCallCount: result.toolsUsed.length,
          iterations: result.iterations,
        });

        providerSucceeded = true;

        return {
          success: true,
          text: result.text,
          providerUsed: provider.name,
          tokensUsed: result.inputTokens + result.outputTokens,
          cost,
          toolsUsed: result.toolsUsed,
          iterations: result.iterations,
          failedProviders,
          retryCount: totalRetryCount,
        };
      } catch (err) {
        lastError = err;

        logger.warn(`Provider ${provider.name} attempt ${attempt} failed`, input.requestId, {
          provider: provider.name,
          attempt,
          errorName: err instanceof Error ? err.name : "UnknownError",
          // Never surface raw error messages — log the class name only
        });
      }

      if (providerSucceeded) break;
    }

    if (!providerSucceeded) {
      logger.error(`Provider ${provider.name} exhausted all ${MAX_ATTEMPTS_PER_PROVIDER} attempts`, input.requestId, {
        provider: provider.name,
        errorName: lastError instanceof Error ? lastError.name : "UnknownError",
        retriesUsed: providerRetries,
      });
      failedProviders.push(provider.name);
    }
  }

  logger.error("All providers failed — no response available", input.requestId, {
    failedProviders,
    totalRetryCount,
  });

  return { success: false, failedProviders, retryCount: totalRetryCount };
}
