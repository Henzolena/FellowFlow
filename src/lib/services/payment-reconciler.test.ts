import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconcilePayment, expirePayment } from "./payment-reconciler";
import type { Logger } from "@/lib/logger";
import type Stripe from "stripe";

// ─── Helpers ───

function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function mockSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    amount_total: 5000,
    payment_intent: "pi_test_456",
    metadata: { registration_id: "reg-1" },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

function createMockSupabase(paymentRow: Record<string, unknown> | null, updateResult?: { data: unknown[] | null; error: unknown }) {
  const chain: QueryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: paymentRow, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  // When update is called, .select().eq().eq() returns data
  if (updateResult) {
    let updateCallCount = 0;
    chain.select.mockImplementation(() => {
      updateCallCount++;
      // First select is the lookup, subsequent selects are after update
      if (updateCallCount > 1) {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue(updateResult),
            }),
          }),
        };
      }
      return chain;
    });
  }

  const supabase = {
    from: vi.fn().mockReturnValue(chain),
  };

  return { supabase: supabase as any, chain };
}

// ─── Tests ───

describe("reconcilePayment", () => {
  let log: Logger;

  beforeEach(() => {
    log = mockLogger();
  });

  it("fails when session has no registration_id in metadata", async () => {
    const session = mockSession({ metadata: {} });
    const { supabase } = createMockSupabase(null);

    const result = await reconcilePayment(supabase, session, "evt_1", log);

    expect(result).toEqual({ action: "failed", reason: "No registration_id in session metadata" });
    expect(log.error).toHaveBeenCalledWith("No registration_id in session metadata", expect.any(Object));
  });

  it("fails and logs to webhook_failures when no payment record exists", async () => {
    const session = mockSession();
    const { supabase, chain } = createMockSupabase(null);

    const result = await reconcilePayment(supabase, session, "evt_1", log);

    expect(result).toEqual({ action: "failed", reason: "No payment record" });
    expect(log.error).toHaveBeenCalledWith("No payment record for session", expect.any(Object));
    // Should insert into webhook_failures
    expect(chain.insert).toHaveBeenCalled();
  });

  it("skips when payment is already completed", async () => {
    const session = mockSession();
    const { supabase } = createMockSupabase({ id: "pay-1", status: "completed", amount: 50 });

    const result = await reconcilePayment(supabase, session, "evt_1", log);

    expect(result).toEqual({ action: "skipped", reason: "already_completed" });
    expect(log.info).toHaveBeenCalledWith("Payment already completed — first-write wins", expect.any(Object));
  });

  it("fails when amount mismatches", async () => {
    const session = mockSession({ amount_total: 9999 });
    const { supabase, chain } = createMockSupabase({ id: "pay-1", status: "pending", amount: 50 });

    const result = await reconcilePayment(supabase, session, "evt_1", log);

    expect(result.action).toBe("failed");
    expect((result as { reason: string }).reason).toContain("Amount mismatch");
    expect(log.error).toHaveBeenCalledWith("Amount mismatch", expect.any(Object));
    expect(chain.insert).toHaveBeenCalled();
  });

  it("succeeds when amounts match and payment is pending", async () => {
    const session = mockSession({ amount_total: 5000 });
    const payment = { id: "pay-1", status: "pending", amount: 50 };

    // Build a more detailed mock for the update path
    const selectFn = vi.fn();
    const eqFn = vi.fn();
    const updateFn = vi.fn();
    const insertFn = vi.fn();

    const callCount = 0;

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "webhook_failures") {
          return { insert: insertFn.mockResolvedValue({ data: null, error: null }) };
        }
        // payments table
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: payment, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: "pay-1" }], error: null }),
              }),
            }),
          }),
        };
      }),
    } as any;

    const result = await reconcilePayment(supabase, session, "evt_1", log);

    expect(result).toEqual({ action: "confirmed", paymentId: "pay-1" });
    expect(log.info).toHaveBeenCalledWith("Updating payment to completed", expect.any(Object));
  });

  it("detects concurrent write when update returns empty array", async () => {
    const session = mockSession({ amount_total: 5000 });
    const payment = { id: "pay-1", status: "pending", amount: 50 };

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "webhook_failures") {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: payment, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }),
    } as any;

    const result = await reconcilePayment(supabase, session, "evt_1", log);

    expect(result).toEqual({ action: "skipped", reason: "concurrent_write" });
    expect(log.warn).toHaveBeenCalledWith("Payment already updated — concurrent write", expect.any(Object));
  });
});

describe("expirePayment", () => {
  it("updates payment status to expired", async () => {
    const log = mockLogger();
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateFn }),
    } as any;

    const session = mockSession();
    await expirePayment(supabase, session, "evt_expire_1", log);

    expect(supabase.from).toHaveBeenCalledWith("payments");
    expect(log.info).toHaveBeenCalledWith("Session expired", expect.objectContaining({ sessionId: "cs_test_123" }));
  });
});
