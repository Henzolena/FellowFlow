import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const createServiceSchema = z.object({
  eventId: z.string().uuid(),
  serviceName: z.string().min(1).max(100),
  serviceCode: z.string().min(1).max(50),
  serviceCategory: z.enum(["main_service", "meal", "custom"]),
  mealType: z.enum(["breakfast", "lunch", "dinner"]).nullable().optional(),
  serviceDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  scanLimitPerAttendee: z.number().int().min(1).default(1),
  requiresPayment: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
});

const generateMealsSchema = z.object({
  eventId: z.string().uuid(),
  meals: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1),
  startDate: z.string(),
  endDate: z.string(),
  breakfastTime: z.object({ start: z.string(), end: z.string() }).optional(),
  lunchTime: z.object({ start: z.string(), end: z.string() }).optional(),
  dinnerTime: z.object({ start: z.string(), end: z.string() }).optional(),
});

const updateServiceSchema = z.object({
  id: z.string().uuid(),
  serviceName: z.string().min(1).max(100).optional(),
  serviceDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  scanLimitPerAttendee: z.number().int().min(1).optional(),
  requiresPayment: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  displayOrder: z.number().int().optional(),
});

// GET /api/admin/services?eventId=...
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
      .from("service_catalog")
      .select("*")
      .eq("event_id", eventId)
      .order("service_date", { ascending: true, nullsFirst: false })
      .order("display_order", { ascending: true })
      .order("service_category", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ services: data || [] });
  } catch (error) {
    console.error("Fetch services error:", error);
    return NextResponse.json({ error: "Failed to fetch services" }, { status: 500 });
  }
}

// POST /api/admin/services — create a single service OR generate daily meals
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const supabase = await createClient();

    // Check if this is a "generate meals" request
    if (body.meals) {
      const parsed = generateMealsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
      }
      const { eventId, meals, startDate, endDate, breakfastTime, lunchTime, dinnerTime } = parsed.data;

      const timeDefaults: Record<string, { start: string; end: string }> = {
        breakfast: breakfastTime || { start: "07:00", end: "09:00" },
        lunch: lunchTime || { start: "12:00", end: "14:00" },
        dinner: dinnerTime || { start: "18:00", end: "20:00" },
      };

      const rows: Record<string, unknown>[] = [];
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");
      let dayIndex = 0;

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

        for (const meal of meals) {
          const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);
          rows.push({
            event_id: eventId,
            service_name: `${mealLabel} — ${dateLabel}`,
            service_code: `${meal}_${dateStr}`,
            service_category: "meal",
            meal_type: meal,
            service_date: dateStr,
            start_time: timeDefaults[meal].start,
            end_time: timeDefaults[meal].end,
            scan_limit_per_attendee: 1,
            display_order: dayIndex * 10 + meals.indexOf(meal),
          });
        }
        dayIndex++;
      }

      if (rows.length === 0) {
        return NextResponse.json({ error: "No meals to generate" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("service_catalog")
        .upsert(rows, { onConflict: "event_id,service_code", ignoreDuplicates: true })
        .select();

      if (error) throw error;
      return NextResponse.json({ services: data, created: data?.length || 0 }, { status: 201 });
    }

    // Single service creation
    const parsed = createServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const v = parsed.data;
    const { data, error } = await supabase
      .from("service_catalog")
      .insert({
        event_id: v.eventId,
        service_name: v.serviceName,
        service_code: v.serviceCode,
        service_category: v.serviceCategory,
        meal_type: v.mealType || null,
        service_date: v.serviceDate || null,
        start_time: v.startTime || null,
        end_time: v.endTime || null,
        scan_limit_per_attendee: v.scanLimitPerAttendee,
        requires_payment: v.requiresPayment,
        notes: v.notes || null,
        display_order: v.displayOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Service code already exists for this event" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ service: data }, { status: 201 });
  } catch (error) {
    console.error("Create service error:", error);
    return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
  }
}

// PATCH /api/admin/services — update a service
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = updateServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...updates } = parsed.data;
    const supabase = await createClient();

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.serviceName !== undefined) dbUpdates.service_name = updates.serviceName;
    if (updates.serviceDate !== undefined) dbUpdates.service_date = updates.serviceDate;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.scanLimitPerAttendee !== undefined) dbUpdates.scan_limit_per_attendee = updates.scanLimitPerAttendee;
    if (updates.requiresPayment !== undefined) dbUpdates.requires_payment = updates.requiresPayment;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;

    const { data, error } = await supabase
      .from("service_catalog")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ service: data });
  } catch (error) {
    console.error("Update service error:", error);
    return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
  }
}

// DELETE /api/admin/services?id=...
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
      .from("service_catalog")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete service error:", error);
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}
