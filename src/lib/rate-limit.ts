/**
 * Minimal in-memory sliding-window rate limiter, keyed by agent id / API key
 * / IP. Fine for a single-instance demo deployment; swap for a Redis-backed
 * limiter (e.g. Upstash) the moment this runs on more than one instance,
 * since in-memory state won't be shared across processes.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_CALLS = Number(process.env.RATE_LIMIT_MAX_CALLS ?? 120);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  limit: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_CALLS - 1, resetAtMs: now + WINDOW_MS, limit: MAX_CALLS };
  }

  if (existing.count >= MAX_CALLS) {
    return {
      allowed: false,
      remaining: 0,
      resetAtMs: existing.windowStart + WINDOW_MS,
      limit: MAX_CALLS,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: MAX_CALLS - existing.count,
    resetAtMs: existing.windowStart + WINDOW_MS,
    limit: MAX_CALLS,
  };
}

// Periodic cleanup so the map doesn't grow unbounded across a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS * 2) buckets.delete(key);
  }
}, WINDOW_MS * 2).unref?.();
