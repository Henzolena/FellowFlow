import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const createMotelSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  address: z.string().optional(),
});

// GET /api/admin/motels?eventId=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("motels")
      .select("*, rooms(*, beds(*))")
      .eq("event_id", eventId)
      .order("name");

    if (error) throw error;

    // Fetch current assignment counts per bed for accurate capacity display
    const allBedIds: string[] = [];
    for (const motel of data || []) {
      for (const room of (motel as { rooms: { beds: { id: string }[] }[] }).rooms) {
        for (const bed of room.beds) {
          allBedIds.push(bed.id);
        }
      }
    }

    const bedCounts: Record<string, number> = {};
    const bedGenders: Record<string, string[]> = {};
    if (allBedIds.length > 0) {
      const { data: assignments } = await supabase
        .from("lodging_assignments")
        .select("bed_id, registrations(gender)")
        .in("bed_id", allBedIds);

      for (const a of assignments || []) {
        bedCounts[a.bed_id] = (bedCounts[a.bed_id] || 0) + 1;
        const reg = a.registrations as unknown as { gender: string | null } | null;
        if (reg?.gender) {
          if (!bedGenders[a.bed_id]) bedGenders[a.bed_id] = [];
          bedGenders[a.bed_id].push(reg.gender);
        }
      }
    }

    // Attach current_occupants + occupant_genders to each bed
    const enriched = (data || []).map((motel: Record<string, unknown>) => ({
      ...motel,
      rooms: ((motel.rooms as Record<string, unknown>[]) || []).map((room) => ({
        ...room,
        beds: ((room.beds as Record<string, unknown>[]) || []).map((bed) => ({
          ...bed,
          current_occupants: bedCounts[(bed as { id: string }).id] || 0,
          occupant_genders: bedGenders[(bed as { id: string }).id] || [],
        })),
      })),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Fetch motels error:", error);
    return NextResponse.json({ error: "Failed to fetch motels" }, { status: 500 });
  }
}

// POST /api/admin/motels
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = createMotelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("motels")
      .insert({
        event_id: parsed.data.eventId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        address: parsed.data.address || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Create motel error:", error);
    return NextResponse.json({ error: "Failed to create motel" }, { status: 500 });
  }
}
