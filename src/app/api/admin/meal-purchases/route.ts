import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const sellMealsSchema = z.object({
  registrationId: z.string().uuid(),
  eventId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1, "Select at least one meal"),
  paymentMethod: z.enum(["cash", "card"]),
  notes: z.string().optional(),
});

// GET /api/admin/meal-purchases?registrationId=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const registrationId = request.nextUrl.searchParams.get("registrationId");
    const eventId = request.nextUrl.searchParams.get("eventId");

    const supabase = await createClient();

    let query = supabase
      .from("meal_purchases")
      .select("*, meal_purchase_items(*, service_catalog(*))")
      .order("created_at", { ascending: false });

    if (registrationId) query = query.eq("registration_id", registrationId);
    if (eventId) query = query.eq("event_id", eventId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Fetch meal purchases error:", error);
    return NextResponse.json({ error: "Failed to fetch meal purchases" }, { status: 500 });
  }
}

// POST /api/admin/meal-purchases — Admin sells meals (cash/card), creates entitlements
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = sellMealsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { registrationId, eventId, serviceIds, paymentMethod, notes } = parsed.data;
    const supabase = await createClient();

    // Fetch registration to determine meal price (adult vs child)
    const { data: reg } = await supabase
      .from("registrations")
      .select("category, event_id")
      .eq("id", registrationId)
      .single();

    if (!reg) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    // Fetch pricing config for meal prices
    const { data: pricing } = await supabase
      .from("pricing_config")
      .select("meal_price_adult, meal_price_child")
      .eq("event_id", eventId)
      .single();

    const mealPriceAdult = pricing?.meal_price_adult ?? 12;
    const mealPriceChild = pricing?.meal_price_child ?? 8;
    const unitPrice = reg.category === "child" ? mealPriceChild : mealPriceAdult;

    // Verify these services exist and are meals
    const { data: services } = await supabase
      .from("service_catalog")
      .select("id, service_name, service_category, meal_type, service_date")
      .in("id", serviceIds)
      .eq("service_category", "meal")
      .eq("is_active", true);

    if (!services || services.length === 0) {
      return NextResponse.json({ error: "No valid meal services found" }, { status: 400 });
    }

    const validServiceIds = services.map((s) => s.id);
    const totalAmount = validServiceIds.length * unitPrice;

    // Check for already-purchased meals (existing entitlements with paid_extra)
    const { data: existing } = await supabase
      .from("service_entitlements")
      .select("service_id")
      .eq("registration_id", registrationId)
      .in("service_id", validServiceIds)
      .in("status", ["allowed", "paid_extra"]);

    const alreadyPurchased = new Set((existing || []).map((e) => e.service_id));
    const newServiceIds = validServiceIds.filter((id) => !alreadyPurchased.has(id));

    if (newServiceIds.length === 0) {
      return NextResponse.json({ error: "All selected meals are already purchased" }, { status: 409 });
    }

    const finalAmount = newServiceIds.length * unitPrice;

    // Create meal purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from("meal_purchases")
      .insert({
        registration_id: registrationId,
        event_id: eventId,
        total_amount: finalAmount,
        payment_method: paymentMethod,
        payment_status: "completed",
        purchased_by: auth.userId,
        notes: notes || null,
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    // Create purchase items
    const items = newServiceIds.map((serviceId) => ({
      meal_purchase_id: purchase.id,
      service_id: serviceId,
      unit_price: unitPrice,
    }));

    const { error: itemsError } = await supabase
      .from("meal_purchase_items")
      .insert(items);

    if (itemsError) throw itemsError;

    // Create service entitlements for each purchased meal
    const entitlements = newServiceIds.map((serviceId) => ({
      registration_id: registrationId,
      service_id: serviceId,
      status: "paid_extra" as const,
      quantity_allowed: 1,
      quantity_used: 0,
      granted_by: auth.userId,
      notes: `Meal purchase #${purchase.id.slice(0, 8)} (${paymentMethod})`,
    }));

    const { error: entitlementError } = await supabase
      .from("service_entitlements")
      .upsert(entitlements, { onConflict: "registration_id,service_id" });

    if (entitlementError) {
      console.error("Entitlement creation failed:", entitlementError);
    }

    return NextResponse.json({
      purchase,
      mealsAdded: newServiceIds.length,
      totalAmount: finalAmount,
      unitPrice,
      skipped: alreadyPurchased.size,
    }, { status: 201 });
  } catch (error) {
    console.error("Sell meals error:", error);
    return NextResponse.json({ error: "Failed to process meal purchase" }, { status: 500 });
  }
}
