import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORPHAN_THRESHOLD_MINUTES = 120;
const MAX_EMAIL_RETRIES = 3;
const EMAIL_RETRY_WINDOW_HOURS = 24;

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "FellowFlow <noreply@fellowflow.online>";
    const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://fellowflow.online";

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const cutoff = new Date(
      Date.now() - ORPHAN_THRESHOLD_MINUTES * 60 * 1000
    ).toISOString();
    const results: Record<string, unknown> = {};

    // ─── 1. Reconcile pending payments against Stripe ───
    const { data: stalePendingPayments } = await supabase
      .from("payments")
      .select("id, stripe_session_id, registration_id, amount")
      .eq("status", "pending")
      .lt("updated_at", cutoff);

    let expiredByStripe = 0;
    let completedByStripe = 0;
    let stripeCheckFailed = 0;
    let stripeSessionsExpired = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    if (stalePendingPayments && stalePendingPayments.length > 0 && stripeKey) {
      for (const payment of stalePendingPayments) {
        if (!payment.stripe_session_id) {
          await supabase
            .from("payments")
            .update({ status: "expired" })
            .eq("id", payment.id)
            .eq("status", "pending");
          expiredByStripe++;
          continue;
        }

        try {
          const res = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${payment.stripe_session_id}`,
            { headers: { Authorization: `Bearer ${stripeKey}` } }
          );

          if (!res.ok) {
            stripeCheckFailed++;
            continue;
          }

          const session = await res.json();

          if (session.status === "expired" || session.status === "canceled") {
            await supabase
              .from("payments")
              .update({ status: "expired" })
              .eq("id", payment.id)
              .eq("status", "pending");
            expiredByStripe++;
          } else if (session.status === "open") {
            try {
              await fetch(
                `https://api.stripe.com/v1/checkout/sessions/${payment.stripe_session_id}/expire`,
                { method: "POST", headers: { Authorization: `Bearer ${stripeKey}` } }
              );
              stripeSessionsExpired++;
            } catch (err) {
              console.error(`Failed to expire Stripe session ${payment.stripe_session_id}:`, err);
            }
            await supabase
              .from("payments")
              .update({ status: "expired" })
              .eq("id", payment.id)
              .eq("status", "pending");
            expiredByStripe++;
          } else if (
            session.status === "complete" &&
            session.payment_status === "paid"
          ) {
            const expectedCents = Math.round(Number(payment.amount) * 100);
            const stripeCents = session.amount_total ?? 0;

            if (stripeCents !== expectedCents) {
              await supabase.from("webhook_failures").insert({
                stripe_event_id: `reconciliation_${payment.id}`,
                event_type: "reconciliation.amount_mismatch",
                session_id: payment.stripe_session_id,
                registration_id: payment.registration_id,
                failure_reason: `Reconciliation amount mismatch: Stripe ${stripeCents}c vs expected ${expectedCents}c`,
                payload: { payment_id: payment.id, stripe_amount: stripeCents, expected_amount: expectedCents },
              });
              stripeCheckFailed++;
              continue;
            }

            await supabase
              .from("payments")
              .update({
                status: "completed",
                stripe_payment_intent_id: session.payment_intent,
                webhook_received_at: new Date().toISOString(),
              })
              .eq("id", payment.id)
              .eq("status", "pending");

            const { data: reg } = await supabase
              .from("registrations")
              .select("id, group_id, first_name, last_name, email, computed_amount, explanation_detail, event_id, events(name)")
              .eq("id", payment.registration_id)
              .single();

            if (reg?.group_id) {
              await supabase
                .from("registrations")
                .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
                .eq("group_id", reg.group_id)
                .eq("status", "pending");
            } else if (reg) {
              await supabase
                .from("registrations")
                .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
                .eq("id", reg.id)
                .eq("status", "pending");
            }

            if (reg && resendKey) {
              const evtData = reg.events as unknown as { name: string } | null;
              const eventName = evtData?.name || "Event";
              const amountDisplay = `$${Number(reg.computed_amount).toFixed(2)}`;
              const receiptUrl = `${appUrl}/register/receipt/${reg.id}`;

              try {
                const emailRes = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: resendFrom,
                    to: reg.email,
                    subject: `Registration Confirmed — ${eventName}`,
                    html: buildConfirmationHtml(reg.first_name, reg.last_name, eventName, amountDisplay, reg.id, receiptUrl),
                  }),
                });

                if (emailRes.ok) {
                  emailsSent++;
                  await supabase.from("email_logs").insert({
                    recipient: reg.email,
                    email_type: "confirmation_reconciliation",
                    registration_id: reg.id,
                    status: "sent",
                  });
                } else {
                  const errBody = await emailRes.text();
                  emailsFailed++;
                  await supabase.from("email_logs").insert({
                    recipient: reg.email,
                    email_type: "confirmation_reconciliation",
                    registration_id: reg.id,
                    status: "failed",
                    error_message: `HTTP ${emailRes.status}: ${errBody}`,
                  });
                }
              } catch (emailErr) {
                emailsFailed++;
                await supabase.from("email_logs").insert({
                  recipient: reg.email,
                  email_type: "confirmation_reconciliation",
                  registration_id: reg.id,
                  status: "failed",
                  error_message: emailErr instanceof Error ? emailErr.message : String(emailErr),
                });
              }
            }

            completedByStripe++;
          }
        } catch (err) {
          console.error(`Stripe check failed for session ${payment.stripe_session_id}:`, err);
          stripeCheckFailed++;
        }
      }
    } else if (stalePendingPayments && stalePendingPayments.length > 0) {
      const staleIds = stalePendingPayments.map((p: { id: string }) => p.id);
      await supabase
        .from("payments")
        .update({ status: "expired" })
        .in("id", staleIds)
        .eq("status", "pending");
      expiredByStripe = staleIds.length;
    }

    results.stale_payments_checked = stalePendingPayments?.length ?? 0;
    results.payments_expired = expiredByStripe;
    results.stripe_sessions_expired = stripeSessionsExpired;
    results.payments_completed_by_reconciliation = completedByStripe;
    results.reconciliation_emails_sent = emailsSent;
    results.reconciliation_emails_failed = emailsFailed;
    results.stripe_check_failed = stripeCheckFailed;

    // ─── 2. Cancel orphaned registrations (pending, no payment, old) ───
    const { data: orphanedRegs } = await supabase
      .from("registrations")
      .select("id, group_id")
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (orphanedRegs && orphanedRegs.length > 0) {
      const regIds = orphanedRegs.map((r: { id: string }) => r.id);

      const { data: paymentsForRegs } = await supabase
        .from("payments")
        .select("registration_id")
        .in("registration_id", regIds)
        .in("status", ["pending", "completed"]);

      const regsWithPayment = new Set(
        (paymentsForRegs ?? []).map((p: { registration_id: string }) => p.registration_id)
      );

      const groupIds = [
        ...new Set(
          orphanedRegs
            .filter((r: { group_id: string | null }) => r.group_id)
            .map((r: { group_id: string }) => r.group_id)
        ),
      ];

      const groupsWithPayment = new Set<string>();
      for (const gid of groupIds) {
        const { data: groupMembers } = await supabase
          .from("registrations")
          .select("id")
          .eq("group_id", gid);

        if (groupMembers) {
          const memberIds = groupMembers.map((m: { id: string }) => m.id);
          const { data: gPayments } = await supabase
            .from("payments")
            .select("id")
            .in("registration_id", memberIds)
            .in("status", ["pending", "completed"]);

          if (gPayments && gPayments.length > 0) {
            groupsWithPayment.add(gid);
          }
        }
      }

      const toCancel = orphanedRegs.filter(
        (r: { id: string; group_id: string | null }) => {
          if (regsWithPayment.has(r.id)) return false;
          if (r.group_id && groupsWithPayment.has(r.group_id)) return false;
          return true;
        }
      );

      if (toCancel.length > 0) {
        const cancelIds = toCancel.map((r: { id: string }) => r.id);
        await supabase
          .from("registrations")
          .update({ status: "cancelled" })
          .in("id", cancelIds)
          .eq("status", "pending");
        results.orphaned_registrations_cancelled = cancelIds.length;
      } else {
        results.orphaned_registrations_cancelled = 0;
      }
    } else {
      results.orphaned_registrations_cancelled = 0;
    }

    // ─── 3. Retry failed emails (durable delivery) ───
    let emailsRetried = 0;
    let emailsRetrySucceeded = 0;
    let emailsRetryFailed = 0;

    if (resendKey) {
      const retryCutoff = new Date(
        Date.now() - EMAIL_RETRY_WINDOW_HOURS * 60 * 60 * 1000
      ).toISOString();

      const { data: failedEmails } = await supabase
        .from("email_logs")
        .select("id, recipient, email_type, registration_id, group_id, retry_count, metadata")
        .eq("status", "failed")
        .lt("retry_count", MAX_EMAIL_RETRIES)
        .gt("created_at", retryCutoff)
        .order("created_at", { ascending: true })
        .limit(10);

      if (failedEmails && failedEmails.length > 0) {
        for (const emailLog of failedEmails) {
          emailsRetried++;

          try {
            let emailSubject = "";
            let emailHtml = "";

            if (emailLog.email_type === "confirmation_webhook" || emailLog.email_type === "confirmation_reconciliation") {
              // Solo confirmation email retry
              const { data: reg } = await supabase
                .from("registrations")
                .select("id, first_name, last_name, email, computed_amount, explanation_detail, event_id, events(name)")
                .eq("id", emailLog.registration_id)
                .single();

              if (!reg) {
                console.log(`Skipping retry for email_log ${emailLog.id}: registration not found`);
                continue;
              }

              const evtData = reg.events as unknown as { name: string } | null;
              const eventName = evtData?.name || "Event";
              const amountDisplay = `$${Number(reg.computed_amount).toFixed(2)}`;
              const receiptUrl = `${appUrl}/register/receipt/${reg.id}`;

              emailSubject = `Registration Confirmed — ${eventName}`;
              emailHtml = buildConfirmationHtml(reg.first_name, reg.last_name, eventName, amountDisplay, reg.id, receiptUrl);
            } else if (emailLog.email_type === "group_receipt_webhook") {
              // Group receipt email retry
              if (!emailLog.group_id) {
                console.log(`Skipping retry for email_log ${emailLog.id}: no group_id`);
                continue;
              }

              const { data: groupRegs } = await supabase
                .from("registrations")
                .select("id, first_name, last_name, email, computed_amount, category, age_at_event, is_full_duration, is_staying_in_motel, num_days, event_id, events(name)")
                .eq("group_id", emailLog.group_id)
                .order("created_at", { ascending: true });

              if (!groupRegs || groupRegs.length === 0) {
                console.log(`Skipping retry for email_log ${emailLog.id}: group not found`);
                continue;
              }

              const primaryReg = groupRegs[0];
              const evtData = primaryReg.events as unknown as { name: string } | null;
              const eventName = evtData?.name || "Event";
              const receiptUrl = `${appUrl}/register/receipt/${primaryReg.id}`;

              const members = groupRegs.map((r: Record<string, unknown>) => {
                let attendance = "Full Conference";
                if (!r.is_full_duration) {
                  attendance = r.is_staying_in_motel ? "Partial — Motel" : `${r.num_days} Day(s)`;
                }
                return {
                  name: `${r.first_name} ${r.last_name}`,
                  category: r.category as string,
                  ageAtEvent: r.age_at_event as number,
                  amount: Number(r.computed_amount),
                  attendance,
                };
              });

              const subtotal = members.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);
              const grandTotal = subtotal;

              emailSubject = `Group Registration Confirmed — ${eventName}`;
              emailHtml = buildGroupReceiptHtml(eventName, members, subtotal, grandTotal, primaryReg.id as string, receiptUrl);
            } else {
              console.log(`Skipping retry for email_log ${emailLog.id}: unknown type ${emailLog.email_type}`);
              continue;
            }

            // Send the retry email
            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: resendFrom,
                to: emailLog.recipient,
                subject: emailSubject,
                html: emailHtml,
              }),
            });

            if (emailRes.ok) {
              emailsRetrySucceeded++;
              await supabase
                .from("email_logs")
                .update({
                  status: "sent",
                  retry_count: emailLog.retry_count + 1,
                  last_retry_at: new Date().toISOString(),
                  error_message: null,
                })
                .eq("id", emailLog.id);
            } else {
              const errBody = await emailRes.text();
              emailsRetryFailed++;
              await supabase
                .from("email_logs")
                .update({
                  retry_count: emailLog.retry_count + 1,
                  last_retry_at: new Date().toISOString(),
                  error_message: `Retry ${emailLog.retry_count + 1} failed: HTTP ${emailRes.status}: ${errBody}`,
                })
                .eq("id", emailLog.id);
            }
          } catch (retryErr) {
            emailsRetryFailed++;
            await supabase
              .from("email_logs")
              .update({
                retry_count: emailLog.retry_count + 1,
                last_retry_at: new Date().toISOString(),
                error_message: `Retry ${emailLog.retry_count + 1} exception: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
              })
              .eq("id", emailLog.id);
          }
        }
      }
    }

    results.emails_retried = emailsRetried;
    results.emails_retry_succeeded = emailsRetrySucceeded;
    results.emails_retry_failed = emailsRetryFailed;

    // ─── 4. Report health metrics ───
    const { count: unresolvedFailures } = await supabase
      .from("webhook_failures")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false);

    const { count: failedEmailsCount } = await supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");

    const { count: exhaustedRetries } = await supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("retry_count", MAX_EMAIL_RETRIES);

    results.unresolved_webhook_failures = unresolvedFailures ?? 0;
    results.failed_emails_total = failedEmailsCount ?? 0;
    results.failed_emails_exhausted_retries = exhaustedRetries ?? 0;

    console.log("Cleanup results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
    });
  } catch (err) {
    console.error("Cleanup function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── Email HTML builders ───

function buildConfirmationHtml(
  firstName: string,
  lastName: string,
  eventName: string,
  amountDisplay: string,
  registrationId: string,
  receiptUrl: string
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><tr><td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:32px 40px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Registration Confirmed</h1></td></tr><tr><td style="padding:32px 40px;"><p style="margin:0 0 16px;color:#18181b;font-size:16px;">Hi <strong>${firstName}</strong>,</p><p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">Your registration for <strong>${eventName}</strong> has been confirmed.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin:0 0 24px;"><tr><td style="padding:20px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Attendee</td><td style="padding:4px 0;color:#18181b;font-size:13px;text-align:right;font-weight:600;">${firstName} ${lastName}</td></tr><tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Event</td><td style="padding:4px 0;color:#18181b;font-size:13px;text-align:right;font-weight:600;">${eventName}</td></tr><tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid #e4e4e7;"></td></tr><tr><td style="padding:4px 0;color:#71717a;font-size:14px;font-weight:600;">Amount</td><td style="padding:4px 0;color:#0ea5e9;font-size:18px;text-align:right;font-weight:700;">${amountDisplay}</td></tr></table></td></tr></table><p style="margin:0 0 8px;color:#71717a;font-size:12px;">Confirmation ID</p><p style="margin:0 0 24px;color:#3f3f46;font-size:12px;font-family:monospace;word-break:break-all;">${registrationId}</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 0;"><a href="${receiptUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">View Receipt</a></td></tr></table></td></tr><tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;"><p style="margin:0;color:#a1a1aa;font-size:12px;">FellowFlow — Conference Registration</p></td></tr></table></td></tr></table></body></html>`;
}

function buildGroupReceiptHtml(
  eventName: string,
  members: { name: string; category: string; ageAtEvent: number; amount: number; attendance: string }[],
  subtotal: number,
  grandTotal: number,
  primaryRegistrationId: string,
  receiptUrl: string
): string {
  const memberRows = members.map(m =>
    `<tr><td style="padding:8px 0;color:#18181b;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0;">${m.name}<br><span style="font-weight:400;color:#71717a;font-size:12px;">${m.category} · Age ${m.ageAtEvent} · ${m.attendance}</span></td><td style="padding:8px 0;color:#18181b;font-size:13px;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0;">${m.amount === 0 ? 'FREE' : `$${m.amount.toFixed(2)}`}</td></tr>`
  ).join('');

  const totalDisplay = grandTotal === 0 ? 'FREE' : `$${grandTotal.toFixed(2)}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><tr><td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:32px 40px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Group Registration Confirmed</h1><p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${members.length} registrant${members.length > 1 ? 's' : ''} for ${eventName}</p></td></tr><tr><td style="padding:32px 40px;"><p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">Your group registration has been confirmed. Here is your receipt:</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin:0 0 16px;"><tr><td style="padding:16px 20px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0 8px;color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Registrant</td><td style="padding:4px 0 8px;color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Amount</td></tr>${memberRows}</table></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin:0 0 24px;"><tr><td style="padding:16px 20px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0;color:#71717a;font-size:13px;">Subtotal</td><td style="padding:6px 0;color:#18181b;font-size:13px;text-align:right;">$${subtotal.toFixed(2)}</td></tr><tr><td colspan="2" style="padding:8px 0 0;border-top:2px solid #e4e4e7;"></td></tr><tr><td style="padding:4px 0;color:#18181b;font-size:16px;font-weight:700;">Total Paid</td><td style="padding:4px 0;color:#0ea5e9;font-size:20px;text-align:right;font-weight:700;">${totalDisplay}</td></tr></table></td></tr></table><p style="margin:0 0 8px;color:#71717a;font-size:12px;">Confirmation ID</p><p style="margin:0 0 24px;color:#3f3f46;font-size:12px;font-family:monospace;word-break:break-all;">${primaryRegistrationId}</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 0;"><a href="${receiptUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">View Full Receipt</a></td></tr></table></td></tr><tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;"><p style="margin:0;color:#a1a1aa;font-size:12px;">FellowFlow — Conference Registration</p></td></tr></table></td></tr></table></body></html>`;
}
