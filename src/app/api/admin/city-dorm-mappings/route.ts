import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

// GET /api/admin/city-dorm-mappings?eventId=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: mappings, error } = await supabase
      .from("city_dorm_assignments")
      .select("*, motels(id, name, auto_assignable, total_rooms)")
      .eq("event_id", eventId)
      .order("city")
      .order("priority");

    if (error) throw error;

    // Also fetch available auto-assignable motels for the dropdown
    const { data: motels } = await supabase
      .from("motels")
      .select("id, name, auto_assignable, total_rooms")
      .eq("event_id", eventId)
      .eq("auto_assignable", true)
      .eq("is_active", true)
      .order("name");

    // Fetch bed availability stats per motel
    const { data: bedStats } = await supabase.rpc("get_motel_bed_stats", {
      p_event_id: eventId,
    });

    return NextResponse.json({ mappings, motels, bedStats });
  } catch (error) {
    console.error("Fetch city-dorm mappings error:", error);
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 });
  }
}

const createSchema = z.object({
  eventId: z.string().uuid(),
  city: z.string().min(1).max(200),
  motelId: z.string().uuid(),
  priority: z.number().int().min(1).max(99).default(1),
});

// POST /api/admin/city-dorm-mappings — create a new mapping
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventId, city, motelId, priority } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("city_dorm_assignments")
      .insert({ event_id: eventId, city, motel_id: motelId, priority })
      .select("*, motels(id, name, auto_assignable, total_rooms)")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "This city→dorm mapping already exists" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Create city-dorm mapping error:", error);
    return NextResponse.json({ error: "Failed to create mapping" }, { status: 500 });
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  priority: z.number().int().min(1).max(99).optional(),
  motelId: z.string().uuid().optional(),
});

// PATCH /api/admin/city-dorm-mappings — update a mapping
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { id, priority, motelId } = parsed.data;
    const supabase = await createClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (priority !== undefined) updates.priority = priority;
    if (motelId !== undefined) updates.motel_id = motelId;

    const { data, error } = await supabase
      .from("city_dorm_assignments")
      .update(updates)
      .eq("id", id)
      .select("*, motels(id, name, auto_assignable, total_rooms)")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Update city-dorm mapping error:", error);
    return NextResponse.json({ error: "Failed to update mapping" }, { status: 500 });
  }
}

// DELETE /api/admin/city-dorm-mappings?id=...
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("city_dorm_assignments")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete city-dorm mapping error:", error);
    return NextResponse.json({ error: "Failed to delete mapping" }, { status: 500 });
  }
}
