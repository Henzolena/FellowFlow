import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const assignSchema = z.object({
  registrationId: z.string().uuid(),
  bedId: z.string().uuid(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  notes: z.string().optional(),
});

const unassignSchema = z.object({
  assignmentId: z.string().uuid(),
});

// GET /api/admin/lodging?eventId=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get all lodging assignments for this event's registrations
    const { data, error } = await supabase
      .from("lodging_assignments")
      .select(`
        *,
        beds!inner(*, rooms!inner(*, motels!inner(*))),
        registrations!inner(id, first_name, last_name, email, status, event_id, attendance_type, public_confirmation_code)
      `)
      .eq("registrations.event_id", eventId);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Fetch lodging assignments error:", error);
    return NextResponse.json({ error: "Failed to fetch lodging" }, { status: 500 });
  }
}

// POST /api/admin/lodging — assign a registration to a bed
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const userId = auth.userId;

    // Check bed capacity — count current assignments vs max_occupants
    const { data: bedData } = await supabase
      .from("beds")
      .select("max_occupants")
      .eq("id", parsed.data.bedId)
      .single();

    if (!bedData) {
      return NextResponse.json({ error: "Bed not found" }, { status: 404 });
    }

    const { count: currentCount } = await supabase
      .from("lodging_assignments")
      .select("*", { count: "exact", head: true })
      .eq("bed_id", parsed.data.bedId);

    if ((currentCount ?? 0) >= bedData.max_occupants) {
      return NextResponse.json(
        { error: `Bed is at full capacity (${currentCount}/${bedData.max_occupants})` },
        { status: 409 }
      );
    }

    // Check registration doesn't already have a bed
    const { data: existingReg } = await supabase
      .from("lodging_assignments")
      .select("id")
      .eq("registration_id", parsed.data.registrationId)
      .maybeSingle();

    if (existingReg) {
      return NextResponse.json({ error: "Registration already has a bed assigned" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("lodging_assignments")
      .insert({
        registration_id: parsed.data.registrationId,
        bed_id: parsed.data.bedId,
        check_in_date: parsed.data.checkInDate || null,
        check_out_date: parsed.data.checkOutDate || null,
        assigned_by: userId,
        notes: parsed.data.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Mark bed as occupied if now at capacity
    const { count: newCount } = await supabase
      .from("lodging_assignments")
      .select("*", { count: "exact", head: true })
      .eq("bed_id", parsed.data.bedId);

    if ((newCount ?? 0) >= bedData.max_occupants) {
      await supabase.from("beds").update({ is_occupied: true }).eq("id", parsed.data.bedId);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Assign lodging error:", error);
    return NextResponse.json({ error: "Failed to assign lodging" }, { status: 500 });
  }
}

// DELETE /api/admin/lodging — unassign
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = unassignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get the bed_id before deleting
    const { data: assignment } = await supabase
      .from("lodging_assignments")
      .select("bed_id")
      .eq("id", parsed.data.assignmentId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("lodging_assignments")
      .delete()
      .eq("id", parsed.data.assignmentId);

    if (error) throw error;

    // Re-check occupancy: only mark unoccupied if below capacity
    const { count: remaining } = await supabase
      .from("lodging_assignments")
      .select("*", { count: "exact", head: true })
      .eq("bed_id", assignment.bed_id);

    const { data: bedInfo } = await supabase
      .from("beds")
      .select("max_occupants")
      .eq("id", assignment.bed_id)
      .single();

    if (bedInfo && (remaining ?? 0) < bedInfo.max_occupants) {
      await supabase.from("beds").update({ is_occupied: false }).eq("id", assignment.bed_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unassign lodging error:", error);
    return NextResponse.json({ error: "Failed to unassign lodging" }, { status: 500 });
  }
}
