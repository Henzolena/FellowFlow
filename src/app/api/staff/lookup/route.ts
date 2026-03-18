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

    // Look up registration (simple query — no nested joins)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    const query = supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, status, attendance_type, access_tier, " +
        "public_confirmation_code, gender, category, checked_in"
      )
      .eq("event_id", eventId);

    if (isUuid) {
      query.eq("id", code);
    } else {
      query.eq("public_confirmation_code", code.toUpperCase());
    }

    const { data: regRaw, error: regError } = await query.maybeSingle();

    if (regError) {
      console.error("Staff lookup query error:", regError);
      return NextResponse.json({ error: "Lookup query failed" }, { status: 500 });
    }

    if (!regRaw) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const reg = regRaw as unknown as Record<string, unknown>;

    // Fetch lodging assignment separately (avoids deep nested join issues)
    let lodgingInfo = null;
    const { data: assignmentRaw } = await supabase
      .from("lodging_assignments")
      .select("id, bed_id")
      .eq("registration_id", reg.id as string)
      .maybeSingle();

    if (assignmentRaw) {
      // Fetch bed → room → motel in steps
      const { data: bedRaw } = await supabase
        .from("beds")
        .select("id, bed_label, bed_type, max_occupants, room_id")
        .eq("id", assignmentRaw.bed_id)
        .single();

      if (bedRaw) {
        const bed = bedRaw as Record<string, unknown>;
        const { data: roomRaw } = await supabase
          .from("rooms")
          .select("id, room_number, room_type, floor, motel_id")
          .eq("id", bed.room_id as string)
          .single();

        let motelName: string | null = null;
        let motelAutoAssignable: boolean | null = null;
        let roomInfo: Record<string, unknown> | null = null;
        if (roomRaw) {
          roomInfo = roomRaw as Record<string, unknown>;
          const { data: motelRaw } = await supabase
            .from("motels")
            .select("id, name, auto_assignable")
            .eq("id", roomInfo.motel_id as string)
            .single();
          const motel = motelRaw as Record<string, unknown> | null;
          motelName = motel?.name as string | null;
          motelAutoAssignable = motel?.auto_assignable as boolean | null;
        }

        lodgingInfo = {
          bedLabel: bed.bed_label ?? null,
          bedType: bed.bed_type ?? null,
          roomNumber: roomInfo?.room_number ?? null,
          roomType: roomInfo?.room_type ?? null,
          floor: roomInfo?.floor ?? null,
          motelName,
          isHotel: motelAutoAssignable === false,
        };
      }
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
