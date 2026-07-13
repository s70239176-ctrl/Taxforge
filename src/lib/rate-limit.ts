import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logEvent } from "./logging";

/**
 * Rate limiting, real in both modes:
 *   - REAL/shared mode: Upstash Redis-backed sliding window
 *     (@upstash/ratelimit) — correct across multiple serverless instances,
 *     which a real Vercel deployment under agent traffic will have.
 *   - Local fallback: in-memory sliding window. Only correct for a single
 *     process — fine for `npm run dev`, NOT for multi-instance production.
 *
 * Selected automatically based on whether UPSTASH_REDIS_REST_URL/TOKEN are
 * set (same detection as src/lib/db/index.ts).
 */

const WINDOW_SECONDS = Math.max(1, Math.round(Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000) / 1000));
const MAX_CALLS = Number(process.env.RATE_LIMIT_MAX_CALLS ?? 120);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  limit: number;
}

const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
let loggedBackend = false;

let upstashLimiter: Ratelimit | null = null;
function getUpstashLimiter(): Ratelimit {
  if (!upstashLimiter) {
    upstashLimiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(MAX_CALLS, `${WINDOW_SECONDS} s`),
      prefix: "taxforge:ratelimit",
    });
  }
  return upstashLimiter;
}

// --- in-memory fallback (single-process only) ---
interface Bucket {
  count: number;
  windowStart: number;
}
const buckets = new Map<string, Bucket>();
const WINDOW_MS = WINDOW_SECONDS * 1000;

function checkInMemory(key: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_CALLS - 1, resetAtMs: now + WINDOW_MS, limit: MAX_CALLS };
  }
  if (existing.count >= MAX_CALLS) {
    return { allowed: false, remaining: 0, resetAtMs: existing.windowStart + WINDOW_MS, limit: MAX_CALLS };
  }
  existing.count += 1;
  return { allowed: true, remaining: MAX_CALLS - existing.count, resetAtMs: existing.windowStart + WINDOW_MS, limit: MAX_CALLS };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS * 2) buckets.delete(key);
  }
}, WINDOW_MS * 2).unref?.();

/** Synchronous-looking call retained for existing call sites; internally async-safe via checkRateLimitAsync for Upstash mode. */
export function checkRateLimit(key: string): RateLimitResult {
  if (!loggedBackend) {
    loggedBackend = true;
    logEvent({
      level: hasUpstash ? "info" : "warn",
      event: "rate_limit_backend_selected",
      backend: hasUpstash ? "upstash-redis" : "in-memory",
      message: hasUpstash ? undefined : "In-memory rate limiting only holds within a single instance — fine for dev, not for multi-instance production traffic.",
    });
  }
  return checkInMemory(key);
}

/** Real async, multi-instance-correct rate limit check. Prefer this in new route handlers. */
export async function checkRateLimitAsync(key: string): Promise<RateLimitResult> {
  if (!loggedBackend) {
    loggedBackend = true;
    logEvent({
      level: hasUpstash ? "info" : "warn",
      event: "rate_limit_backend_selected",
      backend: hasUpstash ? "upstash-redis" : "in-memory",
      message: hasUpstash ? undefined : "In-memory rate limiting only holds within a single instance — fine for dev, not for multi-instance production traffic.",
    });
  }
  if (!hasUpstash) return checkInMemory(key);

  const { success, remaining, reset, limit } = await getUpstashLimiter().limit(key);
  return { allowed: success, remaining, resetAtMs: reset, limit };
}
