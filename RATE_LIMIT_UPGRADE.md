# Rate Limiting: Upgrade Path for Multi-Instance Deployments

## Current State

`src/lib/rate-limit.ts` uses an **in-memory sliding-window** limiter. This is:

- ✅ Zero dependencies
- ✅ Works perfectly for single-instance deployments (Netlify, single Vercel region)
- ❌ Resets on every deploy or cold start
- ❌ Not shared across multiple instances / serverless invocations

## When to Upgrade

Upgrade to a shared store when **any** of these are true:

- You scale to multiple server instances (e.g., multi-region Vercel, K8s pods)
- You observe rate limits being bypassed after frequent deploys
- You need persistent rate limiting across cold starts (serverless)

## Option A: Upstash Redis (Recommended for Serverless)

Upstash provides a serverless Redis with a generous free tier and an official rate-limit SDK.

### 1. Install

```bash
npm install @upstash/ratelimit @upstash/redis
```

### 2. Environment Variables

```env
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 3. Replace `src/lib/rate-limit.ts`

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Create named limiters
const limiters = {
  "pricing-quote": new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "60 s"),
    prefix: "rl:pricing-quote",
  }),
  "reg-create": new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "rl:reg-create",
  }),
};

type LimiterName = keyof typeof limiters;

type RateLimitResult =
  | { success: true; remaining: number }
  | { success: false; remaining: 0; retryAfterMs: number };

export async function rateLimit(
  key: string,
  limiterName: LimiterName
): Promise<RateLimitResult> {
  const limiter = limiters[limiterName];
  const { success, remaining, reset } = await limiter.limit(key);

  if (!success) {
    return {
      success: false,
      remaining: 0,
      retryAfterMs: Math.max(0, reset - Date.now()),
    };
  }

  return { success: true, remaining };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
```

### 4. Update Route Callers

The function signature changes slightly — the `limit` and `windowMs` params are replaced by a limiter name:

```typescript
// Before (in-memory)
const rl = rateLimit(`pricing-quote:${ip}`, 30, 60_000);

// After (Upstash)
const rl = await rateLimit(ip, "pricing-quote");
```

Note the `await` — Upstash calls are async.

## Option B: Redis (Self-Hosted / Managed)

If you already have a Redis instance (AWS ElastiCache, Railway, etc.):

```bash
npm install ioredis
```

Use a standard sliding-window or token-bucket implementation with `ioredis`. The `@upstash/ratelimit` package also supports generic Redis clients.

## Option C: Edge Middleware Rate Limiting

For Vercel/Netlify Edge, you can rate-limit at the CDN edge before hitting your API:

- **Vercel**: Use `@vercel/kv` + Edge Middleware
- **Netlify**: Use Netlify Blobs or Deno KV in Edge Functions

This is the most performant option since it rejects requests before they reach your serverless functions.

## Fallback Strategy

The current in-memory limiter is still valuable as a **local fallback**. Consider keeping it alongside Redis:

```typescript
// If Redis is unavailable, fall back to in-memory
try {
  return await redisRateLimit(key, limiterName);
} catch {
  console.warn("Redis rate-limit unavailable, falling back to in-memory");
  return inMemoryRateLimit(key, limit, windowMs);
}
```

This ensures rate limiting never completely disappears during Redis outages.
