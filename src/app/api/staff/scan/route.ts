import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const scanSchema = z.object({
  code: z.string().min(1),
  serviceId: z.string().uuid(),
  eventId: z.string().uuid(),
  pin: z.string().min(1),
  stationLabel: z.string().optional(),
});

/**
 * POST /api/staff/scan
 * Staff-accessible service scan — validates PIN, then performs the same
 * entitlement check and usage logging as the admin endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = scanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { code, serviceId, eventId, pin, stationLabel } = parsed.data;
    const supabase = createAdminClient();

    // Validate staff PIN
    const { data: staffCode } = await supabase
      .from("staff_access_codes")
      .select("id, role, label")
      .eq("event_id", eventId)
      .eq("pin_code", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffCode) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
    }

    const scannedBy = `staff:${staffCode.role}:${staffCode.label || staffCode.id.slice(0, 8)}`;

    // 1. Look up registration
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    const query = supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, status, attendance_type, access_tier, " +
        "public_confirmation_code, gender, city, church_id, church_name_custom, " +
        "checked_in, category, computed_amount"
      )
      .eq("event_id", eventId);

    if (isUuid) {
      query.eq("id", code);
    } else {
      query.eq("public_confirmation_code", code.toUpperCase());
    }

    const { data: reg, error: regError } = await query.single<Record<string, unknown>>();

    if (regError || !reg) {
      return NextResponse.json({
        result: "denied",
        reason: "Registration not found",
        code,
      }, { status: 404 });
    }

    // 2. Check registration status
    if (reg.status !== "confirmed" && reg.status !== "pending") {
      await logUsage(supabase, reg.id as string, serviceId, scannedBy, "denied", `Registration status: ${reg.status}`, stationLabel);
      return NextResponse.json({
        result: "denied",
        reason: `Registration status is "${reg.status}"`,
        registration: sanitizeReg(reg),
      }, { status: 400 });
    }

    // 3. Fetch the service
    const { data: service } = await supabase
      .from("service_catalog")
      .select("*")
      .eq("id", serviceId)
      .single();

    if (!service || !service.is_active) {
      return NextResponse.json({ result: "denied", reason: "Service not found or inactive" }, { status: 404 });
    }

    // 4. Check entitlement
    const { data: entitlement } = await supabase
      .from("service_entitlements")
      .select("*")
      .eq("registration_id", reg.id as string)
      .eq("service_id", serviceId)
      .single<Record<string, unknown>>();

    if (!entitlement) {
      await logUsage(supabase, reg.id as string, serviceId, scannedBy, "not_entitled", "No entitlement record found", stationLabel);
      return NextResponse.json({
        result: "not_entitled",
        reason: `Not entitled to ${service.service_name}`,
        registration: sanitizeReg(reg),
        service: { name: service.service_name, category: service.service_category },
      });
    }

    if (entitlement.status === "blocked") {
      await logUsage(supabase, reg.id as string, serviceId, scannedBy, "blocked", "Entitlement is blocked", stationLabel);
      return NextResponse.json({
        result: "blocked",
        reason: `Access to ${service.service_name} is blocked`,
        registration: sanitizeReg(reg),
        service: { name: service.service_name, category: service.service_category },
      });
    }

    const qtyUsed = Number(entitlement.quantity_used);
    const qtyAllowed = Number(entitlement.quantity_allowed);

    // 5. Check duplicate usage
    if (qtyUsed >= qtyAllowed) {
      const { data: lastUsage } = await supabase
        .from("service_usage_logs")
        .select("scanned_at")
        .eq("registration_id", reg.id as string)
        .eq("service_id", serviceId)
        .eq("result", "approved")
        .order("scanned_at", { ascending: false })
        .limit(1)
        .single();

      await logUsage(supabase, reg.id as string, serviceId, scannedBy, "duplicate", "Already redeemed", stationLabel);
      return NextResponse.json({
        result: "duplicate",
        reason: `Already redeemed ${service.service_name}`,
        lastUsedAt: lastUsage?.scanned_at || null,
        registration: sanitizeReg(reg),
        service: { name: service.service_name, category: service.service_category },
      });
    }

    // 6. Approve
    await logUsage(supabase, reg.id as string, serviceId, scannedBy, "approved", null, stationLabel);

    await supabase
      .from("service_entitlements")
      .update({
        quantity_used: qtyUsed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entitlement.id as string);

    let churchName: string | null = reg.church_name_custom as string | null;
    if (!churchName && reg.church_id) {
      const { data: ch } = await supabase.from("churches").select("name").eq("id", reg.church_id as string).single();
      churchName = ch?.name || null;
    }

    return NextResponse.json({
      result: "approved",
      reason: null,
      registration: { ...sanitizeReg(reg), churchName },
      service: {
        name: service.service_name,
        category: service.service_category,
        mealType: service.meal_type,
        serviceDate: service.service_date,
      },
      usage: { quantityUsed: qtyUsed + 1, quantityAllowed: qtyAllowed },
    });
  } catch (error) {
    console.error("Staff scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}

/**
 * GET /api/staff/scan?eventId=...&pin=...
 * Returns available services for this event (filtered by staff role).
 */
export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId");
    const pin = request.nextUrl.searchParams.get("pin");

    if (!eventId || !pin) {
      return NextResponse.json({ error: "eventId and pin required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Validate PIN
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

    // Fetch services filtered by role
    let categoryFilter: string[] = [];
    switch (staffCode.role) {
      case "meals":
        categoryFilter = ["meal"];
        break;
      case "auditorium":
        categoryFilter = ["main_service"];
        break;
      default:
        categoryFilter = ["main_service", "meal", "custom"];
    }

    const { data: services } = await supabase
      .from("service_catalog")
      .select("id, service_name, service_code, service_category, meal_type, service_date, start_time, end_time")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .in("service_category", categoryFilter)
      .order("service_date", { ascending: true })
      .order("display_order", { ascending: true });

    return NextResponse.json({ services: services || [], role: staffCode.role });
  } catch (error) {
    console.error("Staff scan GET error:", error);
    return NextResponse.json({ error: "Failed to fetch services" }, { status: 500 });
  }
}

/* ── Helpers ──────────────────────────────────────────────────────── */

async function logUsage(
  supabase: ReturnType<typeof createAdminClient>,
  registrationId: string,
  serviceId: string,
  scannedBy: string,
  result: string,
  reason: string | null,
  stationLabel?: string
) {
  await supabase.from("service_usage_logs").insert({
    registration_id: registrationId,
    service_id: serviceId,
    scanned_by: scannedBy,
    result,
    reason,
    station_label: stationLabel || null,
  });
}

function sanitizeReg(reg: Record<string, unknown>) {
  return {
    id: reg.id,
    firstName: reg.first_name,
    lastName: reg.last_name,
    status: reg.status,
    attendanceType: reg.attendance_type,
    accessTier: reg.access_tier,
    confirmationCode: reg.public_confirmation_code,
    gender: reg.gender,
    city: reg.city,
    category: reg.category,
    checkedIn: reg.checked_in,
  };
}
