import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { createRequestLogger } from "@/lib/logger";
import { generateEntitlements, generateGroupEntitlements } from "@/lib/services/entitlement-generator";
import { z } from "zod";

const overrideSchema = z.object({
  registrationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  status: z.enum(["allowed", "blocked", "waived", "paid_extra"]),
  quantityAllowed: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const bulkGenerateSchema = z.object({
  eventId: z.string().uuid(),
  registrationIds: z.array(z.string().uuid()).optional(),
});

// GET /api/admin/entitlements?registrationId=... — get entitlements for a registration
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const registrationId = request.nextUrl.searchParams.get("registrationId");
    const eventId = request.nextUrl.searchParams.get("eventId");

    const supabase = await createClient();

    if (registrationId) {
      const { data, error } = await supabase
        .from("service_entitlements")
        .select("*, service_catalog(*)")
        .eq("registration_id", registrationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return NextResponse.json({ entitlements: data || [] });
    }

    if (eventId) {
      // Summary: count entitlements per service for the event
      const { data: services } = await supabase
        .from("service_catalog")
        .select("id, service_name, service_code, service_category, meal_type, service_date")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("service_date", { ascending: true })
        .order("display_order", { ascending: true });

      if (!services || services.length === 0) {
        return NextResponse.json({ services: [], summary: [] });
      }

      const serviceIds = services.map((s) => s.id);
      const { data: entitlements } = await supabase
        .from("service_entitlements")
        .select("service_id, status, quantity_used")
        .in("service_id", serviceIds);

      const summary = services.map((svc) => {
        const ents = (entitlements || []).filter((e) => e.service_id === svc.id);
        return {
          ...svc,
          totalEntitled: ents.filter((e) => e.status === "allowed" || e.status === "waived" || e.status === "paid_extra").length,
          totalBlocked: ents.filter((e) => e.status === "blocked").length,
          totalUsed: ents.filter((e) => e.quantity_used > 0).length,
        };
      });

      return NextResponse.json({ summary });
    }

    return NextResponse.json({ error: "registrationId or eventId required" }, { status: 400 });
  } catch (error) {
    console.error("Fetch entitlements error:", error);
    return NextResponse.json({ error: "Failed to fetch entitlements" }, { status: 500 });
  }
}

// POST /api/admin/entitlements — bulk generate entitlements for event or override a single one
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const supabase = await createClient();
    const log = createRequestLogger(request, "entitlements");

    // Check if this is a bulk generate request
    if (body.eventId && !body.serviceId) {
      const parsed = bulkGenerateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
      }

      const { eventId, registrationIds } = parsed.data;

      if (registrationIds && registrationIds.length > 0) {
        // Generate for specific registrations
        let totalCreated = 0;
        for (const regId of registrationIds) {
          const result = await generateEntitlements(supabase, regId, eventId, log);
          totalCreated += result.created;
        }
        return NextResponse.json({ totalCreated, registrationCount: registrationIds.length }, { status: 201 });
      }

      // Generate for ALL confirmed/pending registrations in event
      const { data: registrations } = await supabase
        .from("registrations")
        .select("id, group_id")
        .eq("event_id", eventId)
        .in("status", ["confirmed", "pending"]);

      if (!registrations || registrations.length === 0) {
        return NextResponse.json({ totalCreated: 0, registrationCount: 0 }, { status: 200 });
      }

      // Process unique registrations (dedup by group)
      const processedGroups = new Set<string>();
      let totalCreated = 0;

      for (const reg of registrations) {
        if (reg.group_id && processedGroups.has(reg.group_id)) continue;
        if (reg.group_id) {
          processedGroups.add(reg.group_id);
          const result = await generateGroupEntitlements(supabase, reg.group_id, eventId, log);
          totalCreated += result.totalCreated;
        } else {
          const result = await generateEntitlements(supabase, reg.id, eventId, log);
          totalCreated += result.created;
        }
      }

      return NextResponse.json({
        totalCreated,
        registrationCount: registrations.length,
      }, { status: 201 });
    }

    // Single entitlement override
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { registrationId, serviceId, status, quantityAllowed, notes } = parsed.data;

    const { data, error } = await supabase
      .from("service_entitlements")
      .upsert(
        {
          registration_id: registrationId,
          service_id: serviceId,
          status,
          quantity_allowed: quantityAllowed ?? 1,
          granted_by: auth.userId,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "registration_id,service_id" }
      )
      .select("*, service_catalog(*)")
      .single();

    if (error) throw error;
    return NextResponse.json({ entitlement: data }, { status: 201 });
  } catch (error) {
    console.error("Entitlement operation error:", error);
    return NextResponse.json({ error: "Failed to process entitlement" }, { status: 500 });
  }
}

// DELETE /api/admin/entitlements?id=... — remove an entitlement
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
      .from("service_entitlements")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete entitlement error:", error);
    return NextResponse.json({ error: "Failed to delete entitlement" }, { status: 500 });
  }
}
