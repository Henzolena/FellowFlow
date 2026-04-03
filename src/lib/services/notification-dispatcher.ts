import type { SupabaseClient } from "@supabase/supabase-js";
import { sendConfirmationEmail, sendGroupReceiptEmail, sendAdminNotificationEmail } from "@/lib/email/resend";
import type { AdminNotificationMember } from "@/lib/email/resend";
import { computeGroupPricing, computeAge, computeMealPrice } from "@/lib/pricing/engine";
import type { Logger } from "@/lib/logger";
import type { Registration, Event, PricingConfig } from "@/types/database";
import { formatSelectedDays } from "@/lib/date-utils";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extract lodging info from nested lodging_assignments join
function extractLodging(row: Record<string, unknown>): { dormName: string | null; bedLabel: string | null } {
  const raw = row.lodging_assignments as unknown;
  // PostgREST returns object (not array) when FK has unique constraint
  const la = Array.isArray(raw) ? raw[0] : raw as { beds?: { bed_label?: string; rooms?: { motels?: { name?: string } } } } | null;
  return {
    dormName: la?.beds?.rooms?.motels?.name || null,
    bedLabel: la?.beds?.bed_label || null,
  };
}

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
        "category, access_tier, attendance_type, public_confirmation_code, secure_token, gender, city, church_id, church_name_custom, selected_days, selected_meal_ids, tshirt_size, " +
        "events(name, start_date, end_date), " +
        "lodging_assignments(id, bed_id, beds(bed_label, rooms(room_number, motels(name))))"
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

    const lodging = extractLodging(reg);

    // Compute meal total for solo registrant using age-based pricing
    let soloMealTotal = 0;
    const mealIds = reg.selected_meal_ids as string[] | null;
    if (mealIds && mealIds.length > 0) {
      const { data: pricing } = await supabase
        .from("pricing_config")
        .select("*")
        .eq("event_id", reg.event_id as string)
        .single<PricingConfig>();
      if (pricing && evtData?.start_date && reg.date_of_birth) {
        const ageAtEvent = computeAge(reg.date_of_birth as string, evtData.start_date);
        const pricePerMeal = computeMealPrice(ageAtEvent, (reg.attendance_type as string) as "full_conference" | "partial" | "kote", pricing);
        soloMealTotal = mealIds.length * pricePerMeal;
      }
    }

    try {
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
        secureToken: reg.secure_token as string | undefined,
        explanationDetail: reg.explanation_detail as string | null,
        attendanceType: reg.attendance_type as string | undefined,
        category: reg.category as string | undefined,
        accessTier: reg.access_tier as string | undefined,
        gender: reg.gender as string | null,
        city: reg.city as string | null,
        churchName,
        selectedDays: reg.selected_days as number[] | null,
        dormName: lodging.dormName,
        bedLabel: lodging.bedLabel,
        selectedMealIds: reg.selected_meal_ids as string[] | null,
        mealTotal: soloMealTotal,
        tshirtSize: reg.tshirt_size as string | null,
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
        recipient: reg.email as string || "unknown",
        email_type: "confirmation_webhook",
        registration_id: registrationId,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      });
    }

    // Notify admins (independent — fires even if confirmation email failed)
    await delay(600);
    const at = (reg.attendance_type as string) || "full_conference";
    const soloMealCount = (reg.selected_meal_ids as string[] | null)?.length ?? 0;
    await dispatchAdminNotification(supabase, {
      eventName: evtData?.name || "Event",
      eventStartDate: evtData?.start_date,
      eventEndDate: evtData?.end_date,
      registrantEmail: reg.email as string,
      members: [{
        firstName: reg.first_name as string,
        lastName: reg.last_name as string,
        category: reg.category as string,
        amount: Number(reg.computed_amount),
        attendance: at === "full_conference"
          ? "Full Conference"
          : at === "kote"
          ? (reg.selected_days && evtData?.start_date ? `KOTE · ${formatSelectedDays(evtData.start_date, reg.selected_days as number[])}` : "KOTE")
          : (reg.selected_days && evtData?.start_date ? formatSelectedDays(evtData.start_date, reg.selected_days as number[]) : "Partial"),
        confirmationCode: reg.public_confirmation_code as string | undefined,
        gender: reg.gender as string | null,
        city: reg.city as string | null,
        churchName,
        dormName: lodging.dormName,
        bedLabel: lodging.bedLabel,
        mealCount: soloMealCount,
        tshirtSize: reg.tshirt_size as string | null,
      }],
      grandTotal: Number(reg.computed_amount) + soloMealTotal,
      isFree: Number(reg.computed_amount) === 0 && soloMealTotal === 0,
      isPaid: true,
      primaryRegistrationId: registrationId,
      registeredAt: new Date().toISOString(),
      mealTotal: soloMealTotal > 0 ? soloMealTotal : undefined,
    }, log);
  } catch (err: unknown) {
    log.error("Solo dispatch failed", {
      registrationId,
      error: err instanceof Error ? err.message : String(err),
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
        "category, access_tier, age_at_event, is_full_duration, is_staying_in_motel, num_days, selected_days, selected_meal_ids, tshirt_size, " +
        "date_of_birth, event_id, attendance_type, public_confirmation_code, secure_token, " +
        "gender, city, church_id, church_name_custom, " +
        "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold), " +
        "lodging_assignments(id, bed_id, beds(bed_label, rooms(room_number, motels(name))))"
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
      const soloLodging = extractLodging(primaryReg);

      // Compute meal total for solo-in-group using age-based pricing
      let soloGroupMealTotal = 0;
      const soloMealIds = primaryReg.selected_meal_ids as string[] | null;
      if (soloMealIds && soloMealIds.length > 0) {
        const { data: soloPricing } = await supabase
          .from("pricing_config")
          .select("*")
          .eq("event_id", primaryReg.event_id as string)
          .single<PricingConfig>();
        if (soloPricing && evtData?.start_date && primaryReg.date_of_birth) {
          const soloAge = computeAge(primaryReg.date_of_birth as string, evtData.start_date);
          const pricePerMeal = computeMealPrice(soloAge, (primaryReg.attendance_type as string) as "full_conference" | "partial" | "kote", soloPricing);
          soloGroupMealTotal = soloMealIds.length * pricePerMeal;
        }
      }

      try {
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
          secureToken: primaryReg.secure_token as string | undefined,
          explanationDetail: primaryReg.explanation_detail as string | null,
          attendanceType: primaryReg.attendance_type as string | undefined,
          category: primaryReg.category as string | undefined,
          accessTier: primaryReg.access_tier as string | undefined,
          gender: primaryReg.gender as string | null,
          city: primaryReg.city as string | null,
          churchName,
          selectedDays: primaryReg.selected_days as number[] | null,
          dormName: soloLodging.dormName,
          bedLabel: soloLodging.bedLabel,
          selectedMealIds: primaryReg.selected_meal_ids as string[] | null,
          mealTotal: soloGroupMealTotal,
          tshirtSize: primaryReg.tshirt_size as string | null,
        });
        log.info("Solo confirmation email sent (group of 1)", { registrationId: primaryReg.id, groupId });
        await supabase.from("email_logs").insert({
          recipient: primaryReg.email as string,
          email_type: "confirmation_webhook",
          registration_id: primaryReg.id as string,
          status: "sent",
        });
      } catch (err: unknown) {
        log.error("Solo-in-group confirmation email failed", {
          registrationId: primaryReg.id,
          groupId,
          error: err instanceof Error ? err.message : String(err),
        });
        await supabase.from("email_logs").insert({
          recipient: primaryReg.email as string || "unknown",
          email_type: "confirmation_webhook",
          registration_id: primaryReg.id as string,
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        });
      }

      // Notify admins (independent — fires even if confirmation email failed)
      await delay(600);
      const soloAt = (primaryReg.attendance_type as string) || "full_conference";
      const soloInGroupMealCount = (primaryReg.selected_meal_ids as string[] | null)?.length ?? 0;
      await dispatchAdminNotification(supabase, {
        eventName: evtData?.name || "Event",
        eventStartDate: evtData?.start_date,
        eventEndDate: evtData?.end_date,
        registrantEmail: primaryReg.email as string,
        members: [{
          firstName: primaryReg.first_name as string,
          lastName: primaryReg.last_name as string,
          category: primaryReg.category as string,
          amount: Number(primaryReg.computed_amount),
          attendance: soloAt === "full_conference"
            ? "Full Conference"
            : soloAt === "kote"
            ? (primaryReg.selected_days && evtData?.start_date ? `KOTE · ${formatSelectedDays(evtData.start_date, primaryReg.selected_days as number[])}` : "KOTE")
            : (primaryReg.selected_days && evtData?.start_date ? formatSelectedDays(evtData.start_date, primaryReg.selected_days as number[]) : "Partial"),
          confirmationCode: primaryReg.public_confirmation_code as string | undefined,
          gender: primaryReg.gender as string | null,
          city: primaryReg.city as string | null,
          churchName,
          dormName: soloLodging.dormName,
          bedLabel: soloLodging.bedLabel,
          mealCount: soloInGroupMealCount,
          tshirtSize: primaryReg.tshirt_size as string | null,
        }],
        grandTotal: Number(primaryReg.computed_amount) + soloGroupMealTotal,
        isFree: Number(primaryReg.computed_amount) === 0 && soloGroupMealTotal === 0,
        isPaid: true,
        groupId,
        primaryRegistrationId: primaryReg.id as string,
        registeredAt: new Date().toISOString(),
        mealTotal: soloGroupMealTotal > 0 ? soloGroupMealTotal : undefined,
      }, log);
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
          selectedDays: r.selected_days ?? undefined,
          attendanceType: r.attendance_type,
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
          attendance: at === "full_conference"
            ? "Full Conference"
            : at === "kote"
            ? (r.selected_days && evtData?.start_date ? `KOTE · ${formatSelectedDays(evtData.start_date, r.selected_days as number[])}` : "KOTE")
            : (r.selected_days && evtData?.start_date ? formatSelectedDays(evtData.start_date, r.selected_days as number[]) : `${r.num_days || "?"} Day(s)`),
          attendanceType: r.attendance_type as string | undefined,
          accessTier: r.access_tier as string | undefined,
          confirmationCode: r.public_confirmation_code as string | undefined,
          secureToken: r.secure_token as string | undefined,
          gender: r.gender as string | null,
          city: r.city as string | null,
          churchName,
          selectedDays: r.selected_days as number[] | null,
          selectedMealIds: r.selected_meal_ids as string[] | null,
          mealCount: ((r.selected_meal_ids as string[] | null) || []).length,
          tshirtSize: r.tshirt_size as string | null,
          ...extractLodging(r),
        };
      })
    );

    // Compute meal total from selected_meal_ids using age-based pricing
    let mealTotal = 0;
    if (pricing && evtData?.start_date) {
      for (const r of rows as unknown as Registration[]) {
        const mealIds = r.selected_meal_ids;
        if (mealIds && mealIds.length > 0 && r.date_of_birth) {
          const age = computeAge(r.date_of_birth, evtData.start_date);
          const pricePerMeal = computeMealPrice(age, (r.attendance_type ?? "full_conference") as "full_conference" | "partial" | "kote", pricing);
          mealTotal += mealIds.length * pricePerMeal;
        }
      }
      grandTotal += mealTotal;
    }

    try {
      await sendGroupReceiptEmail({
        to: primaryReg.email as string,
        eventName: evtData?.name || "Event",
        eventStartDate: evtData?.start_date,
        eventEndDate: evtData?.end_date,
        members: membersWithDetails,
        subtotal,
        surcharge,
        surchargeLabel,
        mealTotal,
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
      log.error("Group receipt email failed", {
        groupId,
        error: err instanceof Error ? err.message : String(err),
      });
      await supabase.from("email_logs").insert({
        recipient: primaryReg.email as string || "unknown",
        email_type: "group_receipt_webhook",
        group_id: groupId,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      });
    }

    // Notify admins (independent — fires even if group receipt email failed)
    await delay(600);
    await dispatchAdminNotification(supabase, {
      eventName: evtData?.name || "Event",
      eventStartDate: evtData?.start_date,
      eventEndDate: evtData?.end_date,
      registrantEmail: primaryReg.email as string,
      members: membersWithDetails.map((m) => ({
        firstName: m.firstName,
        lastName: m.lastName,
        category: m.category,
        amount: m.amount,
        attendance: m.attendance,
        confirmationCode: m.confirmationCode,
        gender: m.gender,
        city: m.city,
        churchName: m.churchName,
        dormName: m.dormName,
        bedLabel: m.bedLabel,
        mealCount: m.mealCount,
        tshirtSize: m.tshirtSize,
      })),
      grandTotal,
      isFree: grandTotal === 0,
      isPaid: true,
      groupId,
      primaryRegistrationId: primaryReg.id as string,
      registeredAt: new Date().toISOString(),
      subtotal,
      surcharge,
      surchargeLabel,
      mealTotal: mealTotal > 0 ? mealTotal : undefined,
    }, log);
  } catch (err: unknown) {
    log.error("Group notification dispatch failed", {
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ── Admin notification ──────────────────────────────────────────── */

export async function dispatchAdminNotification(
  supabase: SupabaseClient,
  payload: {
    eventName: string;
    eventStartDate?: string;
    eventEndDate?: string;
    registrantEmail: string;
    registrantPhone?: string | null;
    members: AdminNotificationMember[];
    grandTotal: number;
    isFree: boolean;
    isPaid: boolean;
    groupId?: string | null;
    primaryRegistrationId: string;
    registeredAt: string;
    subtotal?: number;
    surcharge?: number;
    surchargeLabel?: string | null;
    mealTotal?: number;
  },
  log: Logger
): Promise<void> {
  try {
    // Fetch all admin & super_admin emails
    const { data: admins, error } = await supabase
      .from("profiles")
      .select("email")
      .in("role", ["admin", "super_admin"]);

    if (error || !admins || admins.length === 0) {
      log.warn("No admin emails found for notification", { error: error?.message });
      return;
    }

    const adminEmails = admins.map((a) => a.email).filter(Boolean) as string[];
    log.info("Sending admin notification (batched)", { recipients: adminEmails.length, primaryRegistrationId: payload.primaryRegistrationId });

    // Single API call with all admin emails — avoids Resend 2 req/s rate limit
    await sendAdminNotificationEmail({ ...payload, to: adminEmails });

    log.info("Admin notification sent successfully", { recipients: adminEmails.length });
    await supabase.from("email_logs").insert({
      recipient: adminEmails.join(", "),
      email_type: "admin_notification",
      registration_id: payload.primaryRegistrationId,
      group_id: payload.groupId || null,
      status: "sent",
    });
  } catch (err) {
    log.error("Admin notification dispatch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
