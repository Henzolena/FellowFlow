import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import { computeGroupPricing } from "@/lib/pricing/engine";
import Stripe from "stripe";
import type { Registration, Event, PricingConfig } from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Environment helpers                                               */
/* ------------------------------------------------------------------ */
function isLocalDev(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_INSECURE_WEBHOOKS === "true"
  );
}

/* ------------------------------------------------------------------ */
/*  POST /api/webhooks/stripe                                         */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  /* ---------- Verify event signature ---------- */
  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } else if (isLocalDev()) {
      event = JSON.parse(body) as Stripe.Event;
      console.warn(
        "⚠️  [DEV ONLY] Webhook signature verification skipped — ALLOW_INSECURE_WEBHOOKS is true"
      );
    } else {
      console.error(
        "🚨 STRIPE_WEBHOOK_SECRET is not configured. Webhook rejected. " +
          "Set this variable in production immediately."
      );
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  /* ---------- Idempotency: check stripe event ID ---------- */
  const supabase = createAdminClient();
  const stripeEventId = event.id; // e.g. evt_1abc...

  const { data: existingEvent } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (existingEvent) {
    console.log(`↩️  Event ${stripeEventId} already processed — skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  /* ---------- Process event ---------- */
  try {
    console.log(`📥 Processing webhook event: ${event.type} (${stripeEventId})`);
    
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const registrationId = session.metadata?.registration_id;
        const groupId = session.metadata?.group_id;

        console.log(`🔍 Session ID: ${session.id}, Registration ID: ${registrationId}, Group ID: ${groupId}`);

        if (!registrationId) {
          console.error("❌ No registration_id in session metadata");
          break;
        }

        // Guard: check the payment row exists and is still pending
        const { data: payment, error: fetchError } = await supabase
          .from("payments")
          .select("id, status, amount")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        console.log(`💳 Payment lookup result:`, { payment, fetchError });

        if (!payment) {
          console.error(`❌ No payment record for session ${session.id}`);
          await supabase.from("webhook_failures").insert({
            stripe_event_id: stripeEventId,
            event_type: event.type,
            session_id: session.id,
            registration_id: registrationId ?? null,
            group_id: groupId ?? null,
            failure_reason: "No payment record found for Stripe session",
            payload: { session_id: session.id, amount_total: session.amount_total },
          });
          break;
        }

        if (payment.status === "completed") {
          console.log(`✓ Payment ${payment.id} already completed — first-write wins`);
          break;
        }

        // ─── Stripe amount validation ───
        const expectedAmountCents = Math.round(Number(payment.amount) * 100);
        const stripeAmountCents = session.amount_total ?? 0;

        if (stripeAmountCents !== expectedAmountCents) {
          const reason = `Amount mismatch: Stripe charged ${stripeAmountCents} cents, expected ${expectedAmountCents} cents (stored $${payment.amount})`;
          console.error(`🚨 ${reason}`);
          await supabase.from("webhook_failures").insert({
            stripe_event_id: stripeEventId,
            event_type: event.type,
            session_id: session.id,
            registration_id: registrationId ?? null,
            group_id: groupId ?? null,
            failure_reason: reason,
            payload: { session_id: session.id, stripe_amount: stripeAmountCents, expected_amount: expectedAmountCents },
          });
          break;
        }

        console.log(`🔄 Updating payment ${payment.id} to completed (amount validated: ${stripeAmountCents} cents)...`);

        // Atomic update: first write wins via status check
        const { error: paymentError, data: updatedPayment } = await supabase
          .from("payments")
          .update({
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_event_id: stripeEventId,
            status: "completed",
            webhook_received_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending") // Only update if still pending
          .select("id");

        console.log(`💳 Payment update result:`, { updatedPayment, paymentError });

        if (paymentError) {
          console.error("❌ Payment update failed:", paymentError.message);
          break;
        }

        if (!updatedPayment || updatedPayment.length === 0) {
          console.log(`⚠️ Payment for session ${session.id} was already updated — skipping`);
          break;
        }

        // ─── Group confirmation: confirm ALL registrations in the group ───
        if (groupId) {
          const { error: groupRegError } = await supabase
            .from("registrations")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
            })
            .eq("group_id", groupId)
            .eq("status", "pending");

          if (groupRegError) {
            console.error("Group registration update failed:", groupRegError.message);
          }

          // Send ONE consolidated group receipt email
          const { data: groupRegs } = await supabase
            .from("registrations")
            .select(
              "id, first_name, last_name, email, computed_amount, explanation_detail, " +
              "category, age_at_event, is_full_duration, is_staying_in_motel, num_days, " +
              "date_of_birth, event_id, " +
              "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)"
            )
            .eq("group_id", groupId)
            .order("created_at", { ascending: true });

          const rows = groupRegs as unknown as Record<string, unknown>[];
          if (rows && rows.length > 0) {
            const primaryReg = rows[0];
            const evtData = primaryReg.events as unknown as { name: string } | null;
            const eventId = primaryReg.event_id as string;
            const isSoloInGroup = rows.length === 1;

            if (isSoloInGroup) {
              // Single registrant in group — send solo confirmation email
              sendConfirmationEmail({
                to: primaryReg.email as string,
                firstName: primaryReg.first_name as string,
                lastName: primaryReg.last_name as string,
                eventName: evtData?.name || "Event",
                amount: Number(primaryReg.computed_amount),
                isFree: false,
                registrationId: primaryReg.id as string,
                explanationDetail: primaryReg.explanation_detail as string | null,
              }).then(() => {
                supabase.from("email_logs").insert({
                  recipient: primaryReg.email as string,
                  email_type: "confirmation_webhook",
                  registration_id: primaryReg.id as string,
                  status: "sent",
                });
              }).catch((err) => {
                console.error("Solo confirmation email failed:", err);
                supabase.from("email_logs").insert({
                  recipient: primaryReg.email as string,
                  email_type: "confirmation_webhook",
                  registration_id: primaryReg.id as string,
                  status: "failed",
                  error_message: err instanceof Error ? err.message : String(err),
                });
              });
            } else {
              // Multiple registrants — send group receipt email
              const { data: pricing } = await supabase
                .from("pricing_config")
                .select("*")
                .eq("event_id", eventId)
                .single<PricingConfig>();

              let subtotal = rows.reduce((sum, r) => sum + Number(r.computed_amount), 0);
              let surcharge = 0;
              let surchargeLabel: string | null = null;
              let grandTotal = subtotal;

              if (pricing) {
                const eventObj = primaryReg.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;
                const result = computeGroupPricing(
                  (rows as unknown as Registration[]).map((r) => ({
                    dateOfBirth: r.date_of_birth,
                    isFullDuration: r.is_full_duration,
                    isStayingInMotel: r.is_staying_in_motel ?? undefined,
                    numDays: r.num_days ?? undefined,
                  })),
                  { ...eventObj, id: eventId, is_active: true, created_at: "", updated_at: "", description: null } as Event,
                  pricing
                );
                subtotal = result.subtotal;
                surcharge = result.surcharge;
                surchargeLabel = result.surchargeLabel;
                grandTotal = result.grandTotal;
              }

              function attendanceLabel(r: Record<string, unknown>): string {
                if (r.is_full_duration) return "Full Conference";
                if (r.is_staying_in_motel) return "Partial — Motel";
                return `${r.num_days} Day(s)`;
              }

              sendGroupReceiptEmail({
                to: primaryReg.email as string,
                eventName: evtData?.name || "Event",
                members: rows.map((r) => ({
                  firstName: r.first_name as string,
                  lastName: r.last_name as string,
                  category: r.category as string,
                  ageAtEvent: r.age_at_event as number,
                  amount: Number(r.computed_amount),
                  attendance: attendanceLabel(r),
                })),
                subtotal,
                surcharge,
                surchargeLabel,
                grandTotal,
                isFree: false,
                primaryRegistrationId: primaryReg.id as string,
              }).then(() => {
                supabase.from("email_logs").insert({
                  recipient: primaryReg.email as string,
                  email_type: "group_receipt_webhook",
                  group_id: groupId,
                  status: "sent",
                });
              }).catch((err) => {
                console.error("Group receipt email failed:", err);
                supabase.from("email_logs").insert({
                  recipient: primaryReg.email as string,
                  email_type: "group_receipt_webhook",
                  group_id: groupId,
                  status: "failed",
                  error_message: err instanceof Error ? err.message : String(err),
                });
              });
            }
          }

          console.log(
            `✅ Group ${groupId} (${groupRegs?.length ?? 0} registrations) confirmed via payment (event: ${stripeEventId})`
          );
        } else {
          // ─── Solo confirmation ───
          const { error: regError } = await supabase
            .from("registrations")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
            })
            .eq("id", registrationId)
            .eq("status", "pending");

          if (regError) {
            console.error("Registration update failed:", regError.message);
          }

          // Send confirmation email
          const { data: reg } = await supabase
            .from("registrations")
            .select("first_name, last_name, email, computed_amount, explanation_detail, event_id, events(name)")
            .eq("id", registrationId)
            .single();

          if (reg) {
            const evtData = reg.events as unknown as { name: string } | null;
            sendConfirmationEmail({
              to: reg.email,
              firstName: reg.first_name,
              lastName: reg.last_name,
              eventName: evtData?.name || "Event",
              amount: Number(reg.computed_amount),
              isFree: false,
              registrationId,
              explanationDetail: reg.explanation_detail,
            }).then(() => {
              supabase.from("email_logs").insert({
                recipient: reg.email,
                email_type: "confirmation_webhook",
                registration_id: registrationId,
                status: "sent",
              });
            }).catch((err) => {
              console.error("Confirmation email failed:", err);
              supabase.from("email_logs").insert({
                recipient: reg.email,
                email_type: "confirmation_webhook",
                registration_id: registrationId,
                status: "failed",
                error_message: err instanceof Error ? err.message : String(err),
              });
            });
          }

          console.log(
            `✅ Registration ${registrationId} confirmed via payment (event: ${stripeEventId})`
          );
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        await supabase
          .from("payments")
          .update({
            stripe_event_id: stripeEventId,
            status: "expired",
            webhook_received_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending"); // Only expire if still pending

        console.log(`⏰ Session ${session.id} expired (event: ${stripeEventId})`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
