import type { SupabaseClient } from "@supabase/supabase-js";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import { computeGroupPricing } from "@/lib/pricing/engine";
import type { Logger } from "@/lib/logger";
import type { Registration, Event, PricingConfig } from "@/types/database";

/**
 * Send a solo confirmation email and log the result.
 */
export function dispatchSoloConfirmation(
  supabase: SupabaseClient,
  registrationId: string,
  log: Logger
): void {
  // Fire-and-forget: fetch registration data then send email
  Promise.resolve(
    supabase
      .from("registrations")
      .select("first_name, last_name, email, computed_amount, explanation_detail, event_id, events(name)")
      .eq("id", registrationId)
      .single()
  ).then(({ data: reg }) => {
      if (!reg) {
        log.warn("Registration not found for email dispatch", { registrationId });
        return;
      }

      const evtData = reg.events as unknown as { name: string } | null;
      return sendConfirmationEmail({
        to: reg.email,
        firstName: reg.first_name,
        lastName: reg.last_name,
        eventName: evtData?.name || "Event",
        amount: Number(reg.computed_amount),
        isFree: false,
        registrationId,
        explanationDetail: reg.explanation_detail,
      }).then(() => {
        log.info("Confirmation email sent", { registrationId });
        supabase.from("email_logs").insert({
          recipient: reg.email,
          email_type: "confirmation_webhook",
          registration_id: registrationId,
          status: "sent",
        });
      });
    }).catch((err: unknown) => {
      log.error("Confirmation email failed", {
        registrationId,
        error: err instanceof Error ? err.message : String(err),
      });
      supabase.from("email_logs").insert({
        recipient: "unknown",
        email_type: "confirmation_webhook",
        registration_id: registrationId,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Send a group receipt or solo confirmation email for a group,
 * depending on the number of registrants.
 */
export function dispatchGroupConfirmation(
  supabase: SupabaseClient,
  groupId: string,
  log: Logger
): void {
  Promise.resolve(
    supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, computed_amount, explanation_detail, " +
        "category, age_at_event, is_full_duration, is_staying_in_motel, num_days, " +
        "date_of_birth, event_id, " +
        "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)"
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
  ).then(async ({ data: groupRegs }) => {
      const rows = groupRegs as unknown as Record<string, unknown>[];
      if (!rows || rows.length === 0) {
        log.warn("No group registrations found for email dispatch", { groupId });
        return;
      }

      const primaryReg = rows[0];
      const evtData = primaryReg.events as unknown as { name: string } | null;
      const isSoloInGroup = rows.length === 1;

      if (isSoloInGroup) {
        await sendConfirmationEmail({
          to: primaryReg.email as string,
          firstName: primaryReg.first_name as string,
          lastName: primaryReg.last_name as string,
          eventName: evtData?.name || "Event",
          amount: Number(primaryReg.computed_amount),
          isFree: false,
          registrationId: primaryReg.id as string,
          explanationDetail: primaryReg.explanation_detail as string | null,
        });
        log.info("Solo confirmation email sent (group of 1)", { registrationId: primaryReg.id, groupId });
        await supabase.from("email_logs").insert({
          recipient: primaryReg.email as string,
          email_type: "confirmation_webhook",
          registration_id: primaryReg.id as string,
          status: "sent",
        });
        return;
      }

      // Multiple registrants — compute group pricing for surcharge display
      const eventId = primaryReg.event_id as string;
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
        const eventObj = primaryReg.events as unknown as Pick<
          Event,
          "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold"
        >;
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

      await sendGroupReceiptEmail({
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
      });

      log.info("Group receipt email sent", { groupId, memberCount: rows.length });
      await supabase.from("email_logs").insert({
        recipient: primaryReg.email as string,
        email_type: "group_receipt_webhook",
        group_id: groupId,
        status: "sent",
      });
    }).catch((err: unknown) => {
      log.error("Group notification dispatch failed", {
        groupId,
        error: err instanceof Error ? err.message : String(err),
      });
      supabase.from("email_logs").insert({
        recipient: "unknown",
        email_type: "group_receipt_webhook",
        group_id: groupId,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      });
    });
}
