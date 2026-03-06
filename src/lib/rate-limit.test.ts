import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  // Use unique keys per test to avoid cross-test state
  let keyCounter = 0;
  function uniqueKey() {
    return `test:${Date.now()}:${++keyCounter}`;
  }

  it("allows first request within limit", () => {
    const key = uniqueKey();
    const result = rateLimit(key, 5, 60_000);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.remaining).toBe(4);
    }
  });

  it("allows requests up to the limit", () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(key, 5, 60_000);
      expect(result.success).toBe(true);
    }
  });

  it("blocks requests beyond the limit", () => {
    const key = uniqueKey();
    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 60_000);
    }
    // Next request should be blocked
    const result = rateLimit(key, 3, 60_000);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("decrements remaining count correctly", () => {
    const key = uniqueKey();
    const r1 = rateLimit(key, 5, 60_000);
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.remaining).toBe(4);

    const r2 = rateLimit(key, 5, 60_000);
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.remaining).toBe(3);

    const r3 = rateLimit(key, 5, 60_000);
    expect(r3.success).toBe(true);
    if (r3.success) expect(r3.remaining).toBe(2);
  });

  it("uses different windows for different keys", () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();

    // Exhaust key1
    for (let i = 0; i < 2; i++) rateLimit(key1, 2, 60_000);
    expect(rateLimit(key1, 2, 60_000).success).toBe(false);

    // key2 should still work
    expect(rateLimit(key2, 2, 60_000).success).toBe(true);
  });

  it("resets after window expires", async () => {
    const key = uniqueKey();
    // Use a very short window
    for (let i = 0; i < 2; i++) rateLimit(key, 2, 50);
    expect(rateLimit(key, 2, 50).success).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit(key, 2, 50).success).toBe(true);
  });
});
