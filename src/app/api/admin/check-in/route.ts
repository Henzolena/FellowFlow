import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const checkInSchema = z.object({
  code: z.string().min(1),
  eventId: z.string().uuid(),
  method: z.enum(["qr_scan", "manual", "code_entry"]).default("qr_scan"),
  notes: z.string().optional(),
});

const undoCheckInSchema = z.object({
  registrationId: z.string().uuid(),
});

// POST /api/admin/check-in — check in a registrant by confirmation code or ID
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = checkInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { code, eventId, method, notes } = parsed.data;
    const supabase = await createClient();

    // Look up registration by public_confirmation_code or UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    const query = supabase
      .from("registrations")
      .select("id, first_name, last_name, email, status, attendance_type, access_tier, public_confirmation_code, checked_in, event_id, church_id, church_name_custom, gender, city")
      .eq("event_id", eventId);

    if (isUuid) {
      query.eq("id", code);
    } else {
      query.eq("public_confirmation_code", code.toUpperCase());
    }

    const { data: reg, error: regError } = await query.single();

    if (regError || !reg) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    // Validate status
    if (reg.status !== "confirmed" && reg.status !== "pending") {
      return NextResponse.json({
        error: `Cannot check in — registration status is "${reg.status}"`,
        registration: reg,
      }, { status: 400 });
    }

    // Check if already checked in
    if (reg.checked_in) {
      return NextResponse.json({
        error: "Already checked in",
        registration: reg,
        alreadyCheckedIn: true,
      }, { status: 409 });
    }

    // Get wristband color from event config
    const { data: event } = await supabase
      .from("events")
      .select("wristband_config")
      .eq("id", eventId)
      .single();

    const wristbandConfig = (event?.wristband_config || []) as Array<{
      access_tier: string;
      color: string;
      label: string;
    }>;
    const accessTier = reg.access_tier || "FULL_ACCESS";
    const mapping = wristbandConfig.find((w) => w.access_tier === accessTier);
    const wristbandColor = mapping?.color || "Green";

    // Create check-in record
    const { data: checkIn, error: checkInError } = await supabase
      .from("check_ins")
      .insert({
        registration_id: reg.id,
        event_id: eventId,
        checked_in_by: auth.userId,
        wristband_color: wristbandColor,
        access_tier: accessTier,
        method,
        notes: notes || null,
      })
      .select()
      .single();

    if (checkInError) {
      if (checkInError.code === "23505") {
        return NextResponse.json({
          error: "Already checked in",
          registration: reg,
          alreadyCheckedIn: true,
        }, { status: 409 });
      }
      throw checkInError;
    }

    // Mark registration as checked in
    await supabase
      .from("registrations")
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq("id", reg.id);

    return NextResponse.json({
      success: true,
      checkIn,
      registration: { ...reg, checked_in: true },
      wristband: {
        color: wristbandColor,
        label: mapping?.label || "Full Access",
        accessTier,
      },
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
  }
}

// DELETE /api/admin/check-in — undo a check-in
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = undoCheckInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error: deleteError } = await supabase
      .from("check_ins")
      .delete()
      .eq("registration_id", parsed.data.registrationId);

    if (deleteError) throw deleteError;

    await supabase
      .from("registrations")
      .update({ checked_in: false, checked_in_at: null })
      .eq("id", parsed.data.registrationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Undo check-in error:", error);
    return NextResponse.json({ error: "Failed to undo check-in" }, { status: 500 });
  }
}

// GET /api/admin/check-in?eventId=... — get check-in stats
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get totals
    const [
      { count: totalRegistrations },
      { count: checkedIn },
      { data: recentCheckIns },
      { data: byAccessTier },
    ] = await Promise.all([
      supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("status", ["confirmed", "pending"]),
      supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("checked_in", true),
      supabase
        .from("check_ins")
        .select("*, registrations(first_name, last_name, public_confirmation_code, attendance_type)")
        .eq("event_id", eventId)
        .order("checked_in_at", { ascending: false })
        .limit(20),
      supabase
        .from("check_ins")
        .select("access_tier, wristband_color")
        .eq("event_id", eventId),
    ]);

    // Count by tier
    const tierCounts: Record<string, { count: number; color: string }> = {};
    (byAccessTier || []).forEach((ci) => {
      const tier = ci.access_tier || "FULL_ACCESS";
      if (!tierCounts[tier]) tierCounts[tier] = { count: 0, color: ci.wristband_color || "" };
      tierCounts[tier].count++;
    });

    return NextResponse.json({
      totalRegistrations: totalRegistrations || 0,
      checkedIn: checkedIn || 0,
      remaining: (totalRegistrations || 0) - (checkedIn || 0),
      recentCheckIns: recentCheckIns || [],
      byAccessTier: tierCounts,
    });
  } catch (error) {
    console.error("Check-in stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
