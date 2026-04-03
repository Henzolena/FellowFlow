import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-assign a bed to a registration based on city→dorm mapping.
 *
 * Algorithm:
 * 1. Look up city_dorm_assignments for the registrant's city, ordered by priority
 * 2. For each mapped dorm, find the first available bed (not at max occupants)
 * 3. Create a lodging_assignment and mark bed as occupied if at capacity
 * 4. If city has no mapping, fall back to '__default__' mapping
 * 5. If all mapped dorms are full, return null (admin review needed)
 */
export async function autoAssignBed(
  supabase: SupabaseClient,
  params: {
    registrationId: string;
    eventId: string;
    city: string;
    gender?: string | null;
    assignedBy?: string;
    checkInDate?: string;
    checkOutDate?: string;
  }
): Promise<{ bedId: string; motelName: string; bedLabel: string } | null> {
  const { registrationId, eventId, city, gender, assignedBy, checkInDate, checkOutDate } = params;

  // 1. Get city→dorm mappings: first try exact city, then fall back to __default__
  const { data: cityMappings } = await supabase
    .from("city_dorm_assignments")
    .select("motel_id, priority, city, motels(name, gender)")
    .eq("event_id", eventId)
    .eq("city", city)
    .order("priority", { ascending: true });

  const { data: defaultMappings } = await supabase
    .from("city_dorm_assignments")
    .select("motel_id, priority, city, motels(name, gender)")
    .eq("event_id", eventId)
    .eq("city", "__default__")
    .order("priority", { ascending: true });

  // City-specific first, then defaults as overflow
  let mappings = [...(cityMappings || []), ...(defaultMappings || [])];

  if (!mappings.length) return null;

  // 2. Filter by gender: only consider dorms matching registrant's gender (or ungendered dorms)
  if (gender) {
    mappings = mappings.filter((m) => {
      const dormGender = (m.motels as unknown as { name: string; gender: string | null })?.gender;
      return dormGender === null || dormGender === gender;
    });
    // Sort so gender-matched dorms come first, then ungendered
    mappings.sort((a, b) => {
      const aGender = (a.motels as unknown as { name: string; gender: string | null })?.gender;
      const bGender = (b.motels as unknown as { name: string; gender: string | null })?.gender;
      if (aGender === gender && bGender !== gender) return -1;
      if (bGender === gender && aGender !== gender) return 1;
      return 0;
    });
  }

  if (!mappings.length) return null;

  // 3. For each mapped dorm, find an available bed
  for (const mapping of mappings) {
    const motelId = mapping.motel_id;
    const motelName = (mapping.motels as unknown as { name: string })?.name || "Unknown";

    // Find beds in this dorm that have capacity
    // A bed is available when current lodging_assignment count < max_occupants
    const { data: availableBeds } = await supabase
      .rpc("find_available_bed", {
        p_motel_id: motelId,
      });

    if (availableBeds && availableBeds.length > 0) {
      const bed = availableBeds[0];

      // 3. Create lodging assignment
      // assigned_by is UUID (foreign key) — only use if it looks like a valid UUID
      const isUuid = assignedBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedBy);
      const { error: assignError } = await supabase
        .from("lodging_assignments")
        .insert({
          registration_id: registrationId,
          bed_id: bed.id,
          check_in_date: checkInDate || null,
          check_out_date: checkOutDate || null,
          assigned_by: isUuid ? assignedBy : null,
          notes: `Auto-assigned (${assignedBy || "system"}) from city: ${city}`,
        });

      if (assignError) {
        // Possible race condition — bed was taken. Try next bed.
        console.error("[bed-auto-assign] Assignment failed, trying next:", assignError.message);
        continue;
      }

      // 4. Update bed occupancy: mark as occupied if at max capacity
      const { count: currentCount } = await supabase
        .from("lodging_assignments")
        .select("*", { count: "exact", head: true })
        .eq("bed_id", bed.id);

      if ((currentCount ?? 0) >= bed.max_occupants) {
        await supabase
          .from("beds")
          .update({ is_occupied: true })
          .eq("id", bed.id);
      }

      // Also mark registration as staying in motel
      await supabase
        .from("registrations")
        .update({ is_staying_in_motel: true })
        .eq("id", registrationId);

      return {
        bedId: bed.id,
        motelName,
        bedLabel: bed.bed_label,
      };
    }
  }

  // 5. All mapped dorms full — return null for admin review
  return null;
}

/**
 * Release a bed assignment and update occupancy.
 */
export async function releaseBedAssignment(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<void> {
  // Get the bed_id before deleting
  const { data: assignment } = await supabase
    .from("lodging_assignments")
    .select("bed_id")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return;

  // Delete the assignment
  await supabase
    .from("lodging_assignments")
    .delete()
    .eq("id", assignmentId);

  // Re-check occupancy
  const { count } = await supabase
    .from("lodging_assignments")
    .select("*", { count: "exact", head: true })
    .eq("bed_id", assignment.bed_id);

  const { data: bed } = await supabase
    .from("beds")
    .select("max_occupants")
    .eq("id", assignment.bed_id)
    .single();

  if (bed && (count ?? 0) < bed.max_occupants) {
    await supabase
      .from("beds")
      .update({ is_occupied: false })
      .eq("id", assignment.bed_id);
  }
}
