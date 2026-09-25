import { setTimeout as delay } from 'node:timers/promises';

/** Retry gateway throttling within the caller's existing slice time budget. */
export async function fetchWithRateLimitRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const maxRetries = 16;
  for (let attempt = 0; ; attempt += 1) {
    options.signal?.throwIfAborted();
    const response = await fetch(url, options);
    if (response.status !== 429 || attempt >= maxRetries) return response;

    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryDate = retryAfter === null ? NaN : Date.parse(retryAfter);
    const requestedDelay = Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0;
    // Spread workers out rather than sending another synchronized burst.
    const backoff = Math.min(30_000, 2_000 * 2 ** attempt) + Math.random() * 2_000;
    await response.body?.cancel();
    await delay(Math.max(requestedDelay, backoff), undefined, {
      signal: options.signal ?? undefined,
    });
  }
}
