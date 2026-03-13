import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "@/lib/logger";
import { selectedDaysToDateStrings } from "@/lib/date-utils";

/**
 * Auto-generate service entitlements for a confirmed registration
 * based on attendance_type and access_tier.
 *
 * Rules:
 * - full_conference → main_service + all meals
 * - partial         → main_service + all meals (for days attending)
 * - kote            → main_service only (no meals by default)
 * - STAFF           → main_service + all meals + custom
 */
export async function generateEntitlements(
  supabase: SupabaseClient,
  registrationId: string,
  eventId: string,
  log: Logger
): Promise<{ created: number; skipped: number }> {
  // 1. Fetch the registration to determine entitlement rules
  const { data: reg, error: regError } = await supabase
    .from("registrations")
    .select("attendance_type, access_tier, is_full_duration, num_days, selected_days, selected_meal_ids, event_id, events(start_date)")
    .eq("id", registrationId)
    .single();

  if (regError || !reg) {
    log.error("Cannot generate entitlements — registration not found", { registrationId });
    return { created: 0, skipped: 0 };
  }

  // 2. Fetch all active services for this event (include service_date for day filtering)
  const { data: services } = await supabase
    .from("service_catalog")
    .select("id, service_category, meal_type, service_date")
    .eq("event_id", eventId)
    .eq("is_active", true);

  if (!services || services.length === 0) {
    log.debug("No active services for event — skipping entitlement generation", { eventId });
    return { created: 0, skipped: 0 };
  }

  // 3. Determine which services this registrant is entitled to
  const attendanceType = reg.attendance_type || "full_conference";
  const accessTier = reg.access_tier || "FULL_ACCESS";

  // Build set of allowed dates for partial/kote registrants
  const selectedDays: number[] | null = reg.selected_days;
  // Supabase join: events is an object (single FK) but TS may see it as array
  const rawEvents = reg.events;
  const eventData = Array.isArray(rawEvents) ? rawEvents[0] : rawEvents;
  const eventStartDate: string | undefined = eventData?.start_date;
  let allowedDates: Set<string> | null = null;

  if (selectedDays && selectedDays.length > 0 && eventStartDate) {
    allowedDates = new Set(selectedDaysToDateStrings(eventStartDate, selectedDays));
  }

  // Helper: check if a service falls on an allowed day
  function isServiceOnAllowedDay(serviceDate: string | null): boolean {
    // No date filter = allow all (full_conference or no selected_days)
    if (!allowedDates) return true;
    // Service has no date = allow (undated services like main_service)
    if (!serviceDate) return true;
    return allowedDates.has(serviceDate);
  }

  const entitled: string[] = [];
  for (const svc of services) {
    const cat = svc.service_category;

    // Main service — everyone gets it, but only for their selected days
    if (cat === "main_service") {
      if (isServiceOnAllowedDay(svc.service_date)) {
        entitled.push(svc.id);
      }
      continue;
    }

    // Meals — depends on attendance type, access tier, AND selected days
    if (cat === "meal") {
      // KOTE attendees don't get meals by default
      if (attendanceType === "kote" && accessTier !== "STAFF") {
        continue;
      }
      // Only grant meals for days the registrant is attending
      if (isServiceOnAllowedDay(svc.service_date)) {
        entitled.push(svc.id);
      }
      continue;
    }

    // Custom services — only STAFF get custom by default
    // (admins can manually grant to others)
    if (cat === "custom") {
      if (accessTier === "STAFF") {
        entitled.push(svc.id);
      }
      continue;
    }
  }

  // 4. Build entitlement rows
  type EntitlementRow = { registration_id: string; service_id: string; status: "allowed" | "paid_extra"; quantity_allowed: number; quantity_used: number };
  const rows: EntitlementRow[] = entitled.map((serviceId) => ({
    registration_id: registrationId,
    service_id: serviceId,
    status: "allowed" as const,
    quantity_allowed: 1,
    quantity_used: 0,
  }));

  // 4b. Add paid_extra entitlements for wizard-purchased meals (selected_meal_ids)
  const selectedMealIds: string[] | null = reg.selected_meal_ids;
  if (selectedMealIds && selectedMealIds.length > 0) {
    for (const mealServiceId of selectedMealIds) {
      // Only add if not already in the "allowed" set (avoid duplicates)
      if (!entitled.includes(mealServiceId)) {
        rows.push({
          registration_id: registrationId,
          service_id: mealServiceId,
          status: "paid_extra" as const,
          quantity_allowed: 1,
          quantity_used: 0,
        });
      }
    }
    log.info("Adding paid_extra meal entitlements from registration", {
      registrationId,
      mealCount: selectedMealIds.length,
    });
  }

  if (rows.length === 0) {
    log.debug("No entitlements to create for registration", { registrationId, attendanceType });
    return { created: 0, skipped: 0 };
  }

  // 5. Upsert entitlements (skip existing to support manual overrides)
  const { data: inserted, error: insertError } = await supabase
    .from("service_entitlements")
    .upsert(rows, { onConflict: "registration_id,service_id", ignoreDuplicates: true })
    .select("id");

  if (insertError) {
    log.error("Failed to create entitlements", { registrationId, error: insertError.message });
    return { created: 0, skipped: 0 };
  }

  const created = inserted?.length || 0;
  const skipped = rows.length - created;

  log.info("Entitlements generated", {
    registrationId,
    attendanceType,
    accessTier,
    totalServices: services.length,
    entitled: entitled.length,
    paidMeals: selectedMealIds?.length ?? 0,
    created,
    skipped,
  });

  return { created, skipped };
}

/**
 * Generate entitlements for all registrations in a group.
 */
export async function generateGroupEntitlements(
  supabase: SupabaseClient,
  groupId: string,
  eventId: string,
  log: Logger
): Promise<{ totalCreated: number }> {
  const { data: registrations } = await supabase
    .from("registrations")
    .select("id")
    .eq("group_id", groupId);

  if (!registrations || registrations.length === 0) {
    return { totalCreated: 0 };
  }

  let totalCreated = 0;
  for (const reg of registrations) {
    const result = await generateEntitlements(supabase, reg.id, eventId, log);
    totalCreated += result.created;
  }

  log.info("Group entitlements generated", {
    groupId,
    memberCount: registrations.length,
    totalCreated,
  });

  return { totalCreated };
}
