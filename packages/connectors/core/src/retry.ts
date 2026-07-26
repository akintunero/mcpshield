export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export function createRetryHandler(options: RetryOptions = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 }) {
  return async function retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        lastError = e;
        if (attempt < options.maxRetries && isRetryable(e)) {
          const delay = Math.min(options.baseDelayMs * Math.pow(2, attempt), options.maxDelayMs);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError!;
  };
}

function isRetryable(e: any): boolean {
  const status = e.statusCode || e.status || e.code;
  if (!status) return true;
  // Retry on 429 (rate limit), 5xx (server errors), and network errors
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}
