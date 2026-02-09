import { randomUUID } from 'node:crypto';

// --- ids --------------------------------------------------------------------

/** Generate a RFC-4122 v4 UUID. */
export function uuid(): string {
  return randomUUID();
}

/** Generate a short, prefixed id, e.g. `scan_a1b2c3d4`. */
export function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/** Build a deterministic finding instance id from a catalog id + resource id. */
export function findingInstanceId(catalogId: string, resourceId: string): string {
  return `${catalogId}:${resourceId}`;
}

// --- time -------------------------------------------------------------------

/** Current time as an ISO-8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Resolve after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Result -----------------------------------------------------------------

/** A discriminated success/failure result without throwing. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Run an async function, capturing thrown errors into a {@link Result}. */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// --- retry ------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 3. */
  retries?: number;
  /** Base delay in ms for exponential backoff. Default 200. */
  baseDelayMs?: number;
  /** Maximum delay in ms between attempts. Default 5000. */
  maxDelayMs?: number;
  /** Predicate deciding whether an error is retryable. Default: always. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry (useful for logging). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Retry an async operation with exponential backoff and full jitter.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error, attempt)) {
        break;
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.floor(Math.random() * backoff);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// --- misc -------------------------------------------------------------------

/** Exhaustiveness helper for discriminated unions. */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/** Group items by a string key. */
export function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (out[key] ??= []).push(item);
  }
  return out;
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to a fixed number of decimal places. */
export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
