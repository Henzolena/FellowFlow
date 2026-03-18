import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const createSchema = z.object({
  eventId: z.string().uuid(),
  role: z.enum(["auditorium", "proctor", "motel", "meals"]),
  pinCode: z.string().min(1).max(20),
  label: z.string().max(100).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
  label: z.string().max(100).optional(),
  pinCode: z.string().min(1).max(20).optional(),
});

/** GET /api/admin/staff-codes?eventId=... */
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
      .from("staff_access_codes")
      .select("*")
      .eq("event_id", eventId)
      .order("role")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Fetch staff codes error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

/** POST /api/admin/staff-codes — create new access code */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const v = createSchema.parse(body);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("staff_access_codes")
      .insert({
        event_id: v.eventId,
        role: v.role,
        pin_code: v.pinCode,
        label: v.label || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "This PIN is already in use for this event" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    console.error("Create staff code error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

/** PATCH /api/admin/staff-codes — update an access code */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const v = updateSchema.parse(body);

    const supabase = await createClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (v.isActive !== undefined) updates.is_active = v.isActive;
    if (v.label !== undefined) updates.label = v.label;
    if (v.pinCode !== undefined) updates.pin_code = v.pinCode;

    const { data, error } = await supabase
      .from("staff_access_codes")
      .update(updates)
      .eq("id", v.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Update staff code error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

/** DELETE /api/admin/staff-codes?id=... */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("staff_access_codes")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete staff code error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
