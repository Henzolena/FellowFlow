/**
 * Simple in-memory sliding-window rate limiter.
 * Keyed by IP (or any string). No external dependencies.
 *
 * Limitation: per-instance only — resets on deploy/restart.
 * For multi-instance deployments, swap with Redis-backed limiter.
 * See /RATE_LIMIT_UPGRADE.md for Upstash/Redis migration guide.
 */

type WindowEntry = { count: number; resetAt: number };

const windows = new Map<string, WindowEntry>();

// Cleanup stale entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of windows) {
    if (now > entry.resetAt) {
      windows.delete(key);
    }
  }
}

type RateLimitResult =
  | { success: true; remaining: number }
  | { success: false; remaining: 0; retryAfterMs: number };

/**
 * Check and consume one request from the rate limit budget.
 *
 * @param key      - Unique key, typically `${routeName}:${ip}`
 * @param limit    - Max requests per window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return {
      success: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count += 1;
  return { success: true, remaining: limit - entry.count };
}

/**
 * Extract client IP from request headers (works behind Netlify/Vercel proxies).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
