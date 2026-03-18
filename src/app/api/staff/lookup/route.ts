import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const lookupSchema = z.object({
  code: z.string().min(1),
  eventId: z.string().uuid(),
  pin: z.string().min(1),
});

/**
 * POST /api/staff/lookup
 * Staff-accessible registration lookup — returns lodging info for proctor/motel roles.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { code, eventId, pin } = parsed.data;
    const supabase = createAdminClient();

    // Validate staff PIN
    const { data: staffCode } = await supabase
      .from("staff_access_codes")
      .select("id, role")
      .eq("event_id", eventId)
      .eq("pin_code", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffCode) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
    }

    // Look up registration
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    const query = supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, status, attendance_type, access_tier, " +
        "public_confirmation_code, gender, category, checked_in, " +
        "lodging_assignments(id, beds(id, label, bed_type, max_occupants, rooms(id, room_number, room_type, floor, motels(id, name))))"
      )
      .eq("event_id", eventId);

    if (isUuid) {
      query.eq("id", code);
    } else {
      query.eq("public_confirmation_code", code.toUpperCase());
    }

    const { data: reg, error: regError } = await query.single<Record<string, unknown>>();

    if (regError || !reg) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    // Extract lodging info
    const assignments = Array.isArray(reg.lodging_assignments) ? reg.lodging_assignments : [];
    const lodging = assignments.length > 0 ? assignments[0] : null;

    let lodgingInfo = null;
    if (lodging && typeof lodging === "object") {
      const bed = (lodging as Record<string, unknown>).beds as Record<string, unknown> | null;
      const room = bed ? (bed.rooms as Record<string, unknown> | null) : null;
      const motel = room ? (room.motels as Record<string, unknown> | null) : null;

      lodgingInfo = {
        bedLabel: bed?.label ?? null,
        bedType: bed?.bed_type ?? null,
        roomNumber: room?.room_number ?? null,
        roomType: room?.room_type ?? null,
        floor: room?.floor ?? null,
        motelName: motel?.name ?? null,
      };
    }

    return NextResponse.json({
      registration: {
        id: reg.id,
        firstName: reg.first_name,
        lastName: reg.last_name,
        email: reg.email,
        status: reg.status,
        attendanceType: reg.attendance_type,
        accessTier: reg.access_tier,
        confirmationCode: reg.public_confirmation_code,
        gender: reg.gender,
        category: reg.category,
        checkedIn: reg.checked_in,
      },
      lodging: lodgingInfo,
      staffRole: staffCode.role,
    });
  } catch (error) {
    console.error("Staff lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
