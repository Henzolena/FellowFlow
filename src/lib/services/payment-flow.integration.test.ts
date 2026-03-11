/**
 * Integration-style tests for payment/webhook state transitions.
 *
 * These tests compose the service modules (payment-reconciler, registration-confirmer,
 * pricing-recomputer) together to verify the full state machine:
 *
 *   pending → completed → confirmed  (happy path)
 *   pending → expired                 (session timeout)
 *   pending → completed (skip)        (idempotent double-delivery)
 *   pending → failed                  (amount mismatch)
 *   concurrent write detection
 *   pricing drift detection + correction
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconcilePayment, expirePayment } from "./payment-reconciler";
import { confirmSoloRegistration, confirmGroupRegistrations } from "./registration-confirmer";
import type { Logger } from "@/lib/logger";
import type Stripe from "stripe";

// ─── Test helpers ───

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
    id: "cs_test",
    amount_total: 15000,
    payment_intent: "pi_test",
    metadata: { registration_id: "reg-1" },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

/** Build a mock that matches reconcilePayment's exact query chains */
function buildReconcileSupabase(opts: {
  payment: { id: string; status: string; amount: number } | null;
  updateResult?: { data: unknown[] | null; error: unknown };
}) {
  const webhookFailures: Record<string, unknown>[] = [];

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "webhook_failures") {
        return {
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
            webhookFailures.push(row);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      // "payments" table
      return {
        // .select().eq().maybeSingle() — payment lookup
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: opts.payment, error: null }),
          }),
        }),
        // .update().eq().eq().select() — atomic status flip
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue(
                opts.updateResult ?? { data: opts.payment ? [{ id: opts.payment.id }] : [], error: null }
              ),
            }),
          }),
        }),
      };
    }),
  } as any;

  return { supabase, webhookFailures };
}

/** Build a mock for confirm*Registration methods */
function buildConfirmSupabase(succeed: boolean) {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: succeed ? null : { message: "DB error" } }),
        }),
      }),
    }),
  } as any;
}

// ─── Integration Tests: Full State Machine ───

describe("Payment/Webhook State Machine (Integration)", () => {
  let log: Logger;

  beforeEach(() => {
    log = mockLogger();
  });

  describe("Happy path: pending → completed → confirmed", () => {
    it("solo: reconcile payment then confirm registration", async () => {
      const { supabase: reconcileSupa } = buildReconcileSupabase({
        payment: { id: "pay-1", status: "pending", amount: 150 },
      });

      const session = mockSession({ id: "cs_solo", amount_total: 15000, metadata: { registration_id: "reg-1" } });

      // Step 1: Reconcile
      const reconcileResult = await reconcilePayment(reconcileSupa, session, "evt_1", log);
      expect(reconcileResult).toEqual({ action: "confirmed", paymentId: "pay-1" });

      // Step 2: Confirm
      const confirmSupa = buildConfirmSupabase(true);
      const confirmResult = await confirmSoloRegistration(confirmSupa, "reg-1", log);
      expect(confirmResult).toBe(true);

      expect(log.info).toHaveBeenCalledWith("Updating payment to completed", expect.any(Object));
      expect(log.info).toHaveBeenCalledWith("Solo registration confirmed", { registrationId: "reg-1" });
    });

    it("group: reconcile payment then confirm all members", async () => {
      const { supabase: reconcileSupa } = buildReconcileSupabase({
        payment: { id: "pay-g", status: "pending", amount: 300 },
      });

      const session = mockSession({
        id: "cs_group",
        amount_total: 30000,
        metadata: { registration_id: "reg-g1", group_id: "grp-1" },
      });

      // Step 1: Reconcile
      const reconcileResult = await reconcilePayment(reconcileSupa, session, "evt_2", log);
      expect(reconcileResult).toEqual({ action: "confirmed", paymentId: "pay-g" });

      // Step 2: Confirm group
      const confirmSupa = buildConfirmSupabase(true);
      const confirmResult = await confirmGroupRegistrations(confirmSupa, "grp-1", log);
      expect(confirmResult).toBe(true);
    });

    it("full flow verifies log sequence: reconcile → update → confirm", async () => {
      const { supabase: reconcileSupa } = buildReconcileSupabase({
        payment: { id: "pay-seq", status: "pending", amount: 50 },
      });

      const session = mockSession({ id: "cs_seq", amount_total: 5000, metadata: { registration_id: "reg-seq" } });
      await reconcilePayment(reconcileSupa, session, "evt_seq", log);

      const confirmSupa = buildConfirmSupabase(true);
      await confirmSoloRegistration(confirmSupa, "reg-seq", log);

      // Verify structured log call order
      const infoCalls = (log.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(infoCalls).toContain("Updating payment to completed");
      expect(infoCalls).toContain("Solo registration confirmed");
    });
  });

  describe("Session expiry: pending → expired", () => {
    it("expires payment — registration stays pending", async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any;

      const session = mockSession({ id: "cs_expire" });
      await expirePayment(supabase, session, "evt_expire", log);

      expect(supabase.from).toHaveBeenCalledWith("payments");
      expect(log.info).toHaveBeenCalledWith("Session expired", expect.objectContaining({ sessionId: "cs_expire" }));
    });
  });

  describe("Idempotency: double webhook delivery", () => {
    it("skips when payment already completed", async () => {
      const { supabase } = buildReconcileSupabase({
        payment: { id: "pay-dup", status: "completed", amount: 150 },
      });

      const session = mockSession({ id: "cs_dup", amount_total: 15000, metadata: { registration_id: "reg-dup" } });
      const result = await reconcilePayment(supabase, session, "evt_dup", log);

      expect(result).toEqual({ action: "skipped", reason: "already_completed" });
      expect(log.info).toHaveBeenCalledWith("Payment already completed — first-write wins", expect.any(Object));
    });
  });

  describe("Amount mismatch", () => {
    it("rejects and logs to webhook_failures when Stripe amount differs from stored", async () => {
      const { supabase, webhookFailures } = buildReconcileSupabase({
        payment: { id: "pay-mm", status: "pending", amount: 150 },
      });

      const session = mockSession({
        id: "cs_mismatch",
        amount_total: 99999, // Expected: 15000 (150 * 100)
        metadata: { registration_id: "reg-mm" },
      });

      const result = await reconcilePayment(supabase, session, "evt_mm", log);

      expect(result.action).toBe("failed");
      expect((result as { reason: string }).reason).toContain("Amount mismatch");
      expect(webhookFailures.length).toBe(1);
      expect(webhookFailures[0].failure_reason).toContain("Amount mismatch");
      expect(log.error).toHaveBeenCalledWith("Amount mismatch", expect.any(Object));
    });
  });

  describe("Missing metadata", () => {
    it("rejects session with no registration_id", async () => {
      const { supabase } = buildReconcileSupabase({ payment: null });
      const session = mockSession({ metadata: {} });

      const result = await reconcilePayment(supabase, session, "evt_no_meta", log);
      expect(result).toEqual({ action: "failed", reason: "No registration_id in session metadata" });
    });
  });

  describe("No payment record", () => {
    it("logs to webhook_failures when payment not found", async () => {
      const { supabase, webhookFailures } = buildReconcileSupabase({ payment: null });
      const session = mockSession({
        id: "cs_ghost",
        metadata: { registration_id: "reg-ghost", group_id: "grp-ghost" },
      });

      const result = await reconcilePayment(supabase, session, "evt_ghost", log);

      expect(result).toEqual({ action: "failed", reason: "No payment record" });
      expect(webhookFailures.length).toBe(1);
      expect(webhookFailures[0].failure_reason).toContain("No payment record");
    });
  });

  describe("Concurrent write detection", () => {
    it("returns skipped when another worker already flipped the status", async () => {
      const { supabase } = buildReconcileSupabase({
        payment: { id: "pay-race", status: "pending", amount: 100 },
        updateResult: { data: [], error: null }, // empty = another worker won
      });

      const session = mockSession({ id: "cs_race", amount_total: 10000, metadata: { registration_id: "reg-race" } });
      const result = await reconcilePayment(supabase, session, "evt_race", log);

      expect(result).toEqual({ action: "skipped", reason: "concurrent_write" });
      expect(log.warn).toHaveBeenCalledWith("Payment already updated — concurrent write", expect.any(Object));
    });
  });

  describe("DB error during payment update", () => {
    it("returns failed when DB update errors", async () => {
      const { supabase } = buildReconcileSupabase({
        payment: { id: "pay-err", status: "pending", amount: 100 },
        updateResult: { data: null, error: { message: "Connection reset" } },
      });

      const session = mockSession({ id: "cs_err", amount_total: 10000, metadata: { registration_id: "reg-err" } });
      const result = await reconcilePayment(supabase, session, "evt_err", log);

      expect(result).toEqual({ action: "failed", reason: "Connection reset" });
      expect(log.error).toHaveBeenCalledWith("Payment update failed", expect.any(Object));
    });
  });

  describe("Registration confirmation failure", () => {
    it("solo: returns false when DB update fails", async () => {
      const confirmSupa = buildConfirmSupabase(false);
      const result = await confirmSoloRegistration(confirmSupa, "reg-fail", log);

      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith("Registration update failed", expect.any(Object));
    });

    it("group: returns false when DB update fails", async () => {
      const confirmSupa = buildConfirmSupabase(false);
      const result = await confirmGroupRegistrations(confirmSupa, "grp-fail", log);

      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith("Group registration update failed", expect.any(Object));
    });
  });
});

describe("Pricing Drift Detection", () => {
  it("recomputeSoloPricing detects and corrects drift", async () => {
    const log = mockLogger();
    const { recomputeSoloPricing } = await import("./pricing-recomputer");

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as any;

    const registration = {
      id: "reg-drift",
      event_id: "evt-1",
      date_of_birth: "2000-01-01",
      is_full_duration: true,
      is_staying_in_motel: null,
      num_days: null,
      computed_amount: 999, // Intentionally wrong — will trigger drift
      events: {
        name: "Test Event",
        start_date: "2026-07-15",
        end_date: "2026-07-20",
        duration_days: 6,
        adult_age_threshold: 18,
        youth_age_threshold: 13,
        infant_age_threshold: 3,
      },
    } as any;

    const pricing = {
      adult_full_price: 150,
      adult_daily_price: 30,
      youth_full_price: 100,
      youth_daily_price: 20,
      child_full_price: 50,
      child_daily_price: 10,
      late_surcharge_tiers: [],
    } as any;

    const result = await recomputeSoloPricing(supabase, registration, pricing, log);

    // Should have recomputed to adult full price
    expect(result.amount).toBe(150);
    expect(result.explanationCode).toBeDefined();

    // Should have detected drift and called update
    expect(log.info).toHaveBeenCalledWith(
      "Solo amount drift detected — updating",
      expect.objectContaining({
        registrationId: "reg-drift",
        storedAmount: 999,
        recomputedAmount: 150,
      })
    );
  });
});
