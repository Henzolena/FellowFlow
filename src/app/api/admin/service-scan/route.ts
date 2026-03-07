import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const scanSchema = z.object({
  code: z.string().min(1),
  serviceId: z.string().uuid(),
  eventId: z.string().uuid(),
  stationLabel: z.string().optional(),
});

const statsSchema = z.object({
  eventId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
});

// POST /api/admin/service-scan — scan attendee for a specific service
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = scanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { code, serviceId, eventId, stationLabel } = parsed.data;
    const supabase = await createClient();

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
      await logUsage(supabase, reg.id as string, serviceId, auth.userId, "denied", `Registration status: ${reg.status}`, stationLabel);
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
      await logUsage(supabase, reg.id as string, serviceId, auth.userId, "not_entitled", "No entitlement record found", stationLabel);
      return NextResponse.json({
        result: "not_entitled",
        reason: `Not entitled to ${service.service_name}`,
        registration: sanitizeReg(reg),
        service: { name: service.service_name, category: service.service_category },
      });
    }

    if (entitlement.status === "blocked") {
      await logUsage(supabase, reg.id as string, serviceId, auth.userId, "blocked", "Entitlement is blocked", stationLabel);
      return NextResponse.json({
        result: "blocked",
        reason: `Access to ${service.service_name} is blocked`,
        registration: sanitizeReg(reg),
        service: { name: service.service_name, category: service.service_category },
      });
    }

    const qtyUsed = Number(entitlement.quantity_used);
    const qtyAllowed = Number(entitlement.quantity_allowed);

    // 5. Check duplicate usage (quantity limit)
    if (qtyUsed >= qtyAllowed) {
      // Fetch last usage for display
      const { data: lastUsage } = await supabase
        .from("service_usage_logs")
        .select("scanned_at")
        .eq("registration_id", reg.id as string)
        .eq("service_id", serviceId)
        .eq("result", "approved")
        .order("scanned_at", { ascending: false })
        .limit(1)
        .single();

      await logUsage(supabase, reg.id as string, serviceId, auth.userId, "duplicate", "Already redeemed", stationLabel);
      return NextResponse.json({
        result: "duplicate",
        reason: `Already redeemed ${service.service_name}`,
        lastUsedAt: lastUsage?.scanned_at || null,
        registration: sanitizeReg(reg),
        service: { name: service.service_name, category: service.service_category },
      });
    }

    // 6. Approve! Log usage and increment quantity_used
    await logUsage(supabase, reg.id as string, serviceId, auth.userId, "approved", null, stationLabel);

    await supabase
      .from("service_entitlements")
      .update({
        quantity_used: qtyUsed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entitlement.id as string);

    // Resolve church name for display
    let churchName: string | null = reg.church_name_custom as string | null;
    if (!churchName && reg.church_id) {
      const { data: ch } = await supabase.from("churches").select("name").eq("id", reg.church_id as string).single();
      churchName = ch?.name || null;
    }

    return NextResponse.json({
      result: "approved",
      reason: null,
      registration: {
        ...sanitizeReg(reg),
        churchName,
      },
      service: {
        name: service.service_name,
        category: service.service_category,
        mealType: service.meal_type,
        serviceDate: service.service_date,
      },
      usage: {
        quantityUsed: qtyUsed + 1,
        quantityAllowed: qtyAllowed,
      },
    });
  } catch (error) {
    console.error("Service scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}

// GET /api/admin/service-scan?eventId=...&serviceId=... — usage stats
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const eventId = request.nextUrl.searchParams.get("eventId");
    const serviceId = request.nextUrl.searchParams.get("serviceId");

    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const supabase = await createClient();

    if (serviceId) {
      // Stats for a specific service
      const [
        { count: totalEntitled },
        { count: totalUsed },
        { data: recentScans },
      ] = await Promise.all([
        supabase
          .from("service_entitlements")
          .select("*", { count: "exact", head: true })
          .eq("service_id", serviceId)
          .in("status", ["allowed", "waived", "paid_extra"]),
        supabase
          .from("service_entitlements")
          .select("*", { count: "exact", head: true })
          .eq("service_id", serviceId)
          .gt("quantity_used", 0),
        supabase
          .from("service_usage_logs")
          .select("*, registrations(first_name, last_name, public_confirmation_code)")
          .eq("service_id", serviceId)
          .order("scanned_at", { ascending: false })
          .limit(30),
      ]);

      return NextResponse.json({
        serviceId,
        totalEntitled: totalEntitled || 0,
        totalUsed: totalUsed || 0,
        remaining: (totalEntitled || 0) - (totalUsed || 0),
        recentScans: recentScans || [],
      });
    }

    // Overview stats for all services in the event
    const { data: services } = await supabase
      .from("service_catalog")
      .select("id, service_name, service_code, service_category, meal_type, service_date, is_active")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("service_date", { ascending: true })
      .order("display_order", { ascending: true });

    if (!services || services.length === 0) {
      return NextResponse.json({ services: [], stats: {} });
    }

    // Batch fetch entitlement counts
    const serviceIds = services.map((s) => s.id);
    const { data: entitlements } = await supabase
      .from("service_entitlements")
      .select("service_id, quantity_used")
      .in("service_id", serviceIds)
      .in("status", ["allowed", "waived", "paid_extra"]);

    const stats: Record<string, { entitled: number; used: number }> = {};
    for (const svc of services) {
      stats[svc.id] = { entitled: 0, used: 0 };
    }
    for (const ent of entitlements || []) {
      if (stats[ent.service_id]) {
        stats[ent.service_id].entitled++;
        if (ent.quantity_used > 0) stats[ent.service_id].used++;
      }
    }

    return NextResponse.json({
      services,
      stats,
    });
  } catch (error) {
    console.error("Service scan stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}

/* ── Helpers ──────────────────────────────────────────────────────── */

async function logUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
