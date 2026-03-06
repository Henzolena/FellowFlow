import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Logger } from "@/lib/logger";

function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// We need to mock getStripe before importing the module
const mockConstructEvent = vi.fn();

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

// Import after mocks are set up
import { verifyWebhookEvent } from "./webhook-verifier";

describe("verifyWebhookEvent", () => {
  let log: Logger;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    log = mockLogger();
    mockConstructEvent.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns ok with event when signature verification succeeds", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const fakeEvent = { id: "evt_1", type: "checkout.session.completed" };
    mockConstructEvent.mockReturnValue(fakeEvent);

    const result = verifyWebhookEvent('{"id":"evt_1"}', "sig_test", log);

    expect(result).toEqual({ ok: true, event: fakeEvent });
    expect(mockConstructEvent).toHaveBeenCalledWith('{"id":"evt_1"}', "sig_test", "whsec_test");
  });

  it("returns error when signature verification fails", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const result = verifyWebhookEvent('{"id":"evt_1"}', "bad_sig", log);

    expect(result).toEqual({ ok: false, status: 400, error: "Invalid signature" });
    expect(log.error).toHaveBeenCalledWith("Signature verification failed", expect.any(Object));
  });

  it("rejects when no webhook secret is configured and not in local dev", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", writable: true });

    const result = verifyWebhookEvent('{"id":"evt_1"}', "sig_test", log);

    expect(result).toEqual({ ok: false, status: 500, error: "Webhook secret not configured" });
    expect(log.error).toHaveBeenCalledWith("STRIPE_WEBHOOK_SECRET not configured — webhook rejected");
  });

  it("allows insecure webhooks in local dev mode", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    process.env.ALLOW_INSECURE_WEBHOOKS = "true";

    const body = '{"id":"evt_dev","type":"checkout.session.completed"}';
    const result = verifyWebhookEvent(body, "sig_test", log);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe("evt_dev");
    }
    expect(log.warn).toHaveBeenCalled();
  });

  it("rejects in dev mode when ALLOW_INSECURE_WEBHOOKS is not set", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    delete process.env.ALLOW_INSECURE_WEBHOOKS;

    const result = verifyWebhookEvent('{"id":"evt_1"}', "sig_test", log);

    expect(result).toEqual({ ok: false, status: 500, error: "Webhook secret not configured" });
  });
});
