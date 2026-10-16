export const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Bounded exponential retry helper; callers must reuse the same idempotency key. */
export async function retry(operation, { attempts = 5, deadline = Date.now() + 30000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random = Math.random, now = Date.now } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    try { return await operation(attempt); }
    catch (error) {
      const status = error?.status ?? error?.statusCode;
      if (attempt >= attempts || !(error?.temporary === true || RETRYABLE.has(status)) || now() >= deadline) throw error;
      const cap = Math.min(10000, 500 * (2 ** (attempt - 1)));
      await sleep(cap * (0.5 + random() * 0.5));
    }
  }
}
