import type { SupabaseClient } from "@supabase/supabase-js";
import { computePricing, computeGroupPricing } from "@/lib/pricing/engine";
import type { Logger } from "@/lib/logger";
import type { Registration, Event, PricingConfig } from "@/types/database";

type EventFields = Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;

/**
 * Recompute a solo registration's pricing server-side.
 * Updates the DB if the stored amount has drifted.
 */
export async function recomputeSoloPricing(
  supabase: SupabaseClient,
  registration: Registration & { events: EventFields },
  pricing: PricingConfig,
  log: Logger
) {
  const serverRegistrationDate = new Date().toISOString();
  const result = computePricing(
    {
      dateOfBirth: registration.date_of_birth,
      isFullDuration: registration.is_full_duration,
      isStayingInMotel: registration.is_staying_in_motel ?? undefined,
      numDays: registration.num_days ?? undefined,
      selectedDays: registration.selected_days ?? undefined,
      attendanceType: registration.attendance_type,
      registrationDate: serverRegistrationDate,
    },
    { ...registration.events, id: registration.event_id, is_active: true, created_at: "", updated_at: "", description: null } as Event,
    pricing
  );

  if (result.amount !== Number(registration.computed_amount)) {
    log.info("Solo amount drift detected — updating", {
      registrationId: registration.id,
      storedAmount: registration.computed_amount,
      recomputedAmount: result.amount,
    });
    await supabase.from("registrations").update({
      computed_amount: result.amount,
      explanation_code: result.explanationCode,
      explanation_detail: result.explanationDetail,
    }).eq("id", registration.id);
  }

  return result;
}

/**
 * Recompute group pricing server-side.
 * Updates any individual registrations whose amounts have drifted.
 */
export async function recomputeGroupPricing(
  supabase: SupabaseClient,
  registrations: (Registration & { events: EventFields })[],
  pricing: PricingConfig,
  log: Logger
) {
  const primaryReg = registrations[0];
  const eventData = primaryReg.events;
  const serverRegistrationDate = new Date().toISOString();

  const groupResult = computeGroupPricing(
    registrations.map((r) => ({
      dateOfBirth: r.date_of_birth,
      isFullDuration: r.is_full_duration,
      isStayingInMotel: r.is_staying_in_motel ?? undefined,
      numDays: r.num_days ?? undefined,
      selectedDays: r.selected_days ?? undefined,
      attendanceType: r.attendance_type,
      registrationDate: serverRegistrationDate,
    })),
    { ...eventData, id: primaryReg.event_id, is_active: true, created_at: "", updated_at: "", description: null } as Event,
    pricing
  );

  for (let i = 0; i < registrations.length; i++) {
    const r = registrations[i];
    const recomputed = groupResult.items[i];
    if (recomputed.amount !== Number(r.computed_amount)) {
      log.info("Group amount drift detected — updating", {
        registrationId: r.id,
        storedAmount: r.computed_amount,
        recomputedAmount: recomputed.amount,
      });
      await supabase.from("registrations").update({
        computed_amount: recomputed.amount,
        explanation_code: recomputed.explanationCode,
        explanation_detail: recomputed.explanationDetail,
      }).eq("id", r.id);
    }
  }

  return groupResult;
}
