import type { SupabaseClient } from "@supabase/supabase-js";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import { computeGroupPricing } from "@/lib/pricing/engine";
import type { Logger } from "@/lib/logger";
import type { Registration, Event, PricingConfig } from "@/types/database";

/**
 * Send a solo confirmation email and log the result.
 */
export async function dispatchSoloConfirmation(
  supabase: SupabaseClient,
  registrationId: string,
  log: Logger
): Promise<void> {
  try {
    const { data: reg } = await supabase
      .from("registrations")
      .select(
        "first_name, last_name, email, computed_amount, explanation_detail, event_id, " +
        "category, attendance_type, public_confirmation_code, gender, city, church_id, church_name_custom, " +
        "events(name, start_date, end_date)"
      )
      .eq("id", registrationId)
      .single<Record<string, unknown>>();

    if (!reg) {
      log.warn("Registration not found for email dispatch", { registrationId });
      return;
    }

    const evtData = reg.events as unknown as { name: string; start_date: string; end_date: string } | null;

    // Resolve church name
    let churchName: string | null = (reg.church_name_custom as string | null);
    if (!churchName && reg.church_id) {
      const { data: ch } = await supabase.from("churches").select("name").eq("id", reg.church_id as string).single();
      churchName = ch?.name || null;
    }

    await sendConfirmationEmail({
      to: reg.email as string,
      firstName: reg.first_name as string,
      lastName: reg.last_name as string,
      eventName: evtData?.name || "Event",
      eventStartDate: evtData?.start_date,
      eventEndDate: evtData?.end_date,
      amount: Number(reg.computed_amount),
      isFree: false,
      registrationId,
      confirmationCode: reg.public_confirmation_code as string | undefined,
      explanationDetail: reg.explanation_detail as string | null,
      attendanceType: reg.attendance_type as string | undefined,
      category: reg.category as string | undefined,
      gender: reg.gender as string | null,
      city: reg.city as string | null,
      churchName,
    });

    log.info("Confirmation email sent", { registrationId });
    await supabase.from("email_logs").insert({
      recipient: reg.email as string,
      email_type: "confirmation_webhook",
      registration_id: registrationId,
      status: "sent",
    });
  } catch (err: unknown) {
    log.error("Confirmation email failed", {
      registrationId,
      error: err instanceof Error ? err.message : String(err),
    });
    await supabase.from("email_logs").insert({
      recipient: "unknown",
      email_type: "confirmation_webhook",
      registration_id: registrationId,
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Send a group receipt or solo confirmation email for a group,
 * depending on the number of registrants.
 */
export async function dispatchGroupConfirmation(
  supabase: SupabaseClient,
  groupId: string,
  log: Logger
): Promise<void> {
  try {
    const { data: groupRegs } = await supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, computed_amount, explanation_detail, " +
        "category, age_at_event, is_full_duration, is_staying_in_motel, num_days, " +
        "date_of_birth, event_id, attendance_type, public_confirmation_code, " +
        "gender, city, church_id, church_name_custom, " +
        "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)"
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    const rows = groupRegs as unknown as Record<string, unknown>[];
    if (!rows || rows.length === 0) {
      log.warn("No group registrations found for email dispatch", { groupId });
      return;
    }

    const primaryReg = rows[0];
    const evtData = primaryReg.events as unknown as { name: string; start_date: string; end_date: string } | null;
    const isSoloInGroup = rows.length === 1;

    // Resolve church name helper
    async function resolveChurch(churchId: unknown, custom: unknown): Promise<string | null> {
      if (custom) return custom as string;
      if (!churchId) return null;
      const { data: ch } = await supabase.from("churches").select("name").eq("id", churchId as string).single();
      return ch?.name || null;
    }

    if (isSoloInGroup) {
      const churchName = await resolveChurch(primaryReg.church_id, primaryReg.church_name_custom);
      await sendConfirmationEmail({
        to: primaryReg.email as string,
        firstName: primaryReg.first_name as string,
        lastName: primaryReg.last_name as string,
        eventName: evtData?.name || "Event",
        eventStartDate: evtData?.start_date,
        eventEndDate: evtData?.end_date,
        amount: Number(primaryReg.computed_amount),
        isFree: false,
        registrationId: primaryReg.id as string,
        confirmationCode: primaryReg.public_confirmation_code as string | undefined,
        explanationDetail: primaryReg.explanation_detail as string | null,
        attendanceType: primaryReg.attendance_type as string | undefined,
        category: primaryReg.category as string | undefined,
        gender: primaryReg.gender as string | null,
        city: primaryReg.city as string | null,
        churchName,
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

    // Resolve church names and build member data with all fields
    const membersWithDetails = await Promise.all(
      rows.map(async (r) => {
        const churchName = await resolveChurch(r.church_id, r.church_name_custom);
        const at = (r.attendance_type as string) || "full_conference";
        return {
          firstName: r.first_name as string,
          lastName: r.last_name as string,
          category: r.category as string,
          ageAtEvent: r.age_at_event as number,
          amount: Number(r.computed_amount),
          attendance: at === "full_conference" ? "Full Conference" : at === "kote" ? "KOTE" : `${r.num_days || "?"} Day(s)`,
          confirmationCode: r.public_confirmation_code as string | undefined,
          gender: r.gender as string | null,
          city: r.city as string | null,
          churchName,
        };
      })
    );

    await sendGroupReceiptEmail({
      to: primaryReg.email as string,
      eventName: evtData?.name || "Event",
      eventStartDate: evtData?.start_date,
      eventEndDate: evtData?.end_date,
      members: membersWithDetails,
      subtotal,
      surcharge,
      surchargeLabel,
      grandTotal,
      isFree: false,
      primaryRegistrationId: primaryReg.id as string,
      primaryConfirmationCode: primaryReg.public_confirmation_code as string | undefined,
    });

    log.info("Group receipt email sent", { groupId, memberCount: rows.length });
    await supabase.from("email_logs").insert({
      recipient: primaryReg.email as string,
      email_type: "group_receipt_webhook",
      group_id: groupId,
      status: "sent",
    });
  } catch (err: unknown) {
    log.error("Group notification dispatch failed", {
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
    await supabase.from("email_logs").insert({
      recipient: "unknown",
      email_type: "group_receipt_webhook",
      group_id: groupId,
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}
