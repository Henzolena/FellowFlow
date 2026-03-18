import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/meals/available?token=UUID  (secure links)
// GET /api/meals/available?code=FF26-HENOK-1234  (manual lookup fallback)
// Public endpoint — fetches available meals for a registration
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    const code = request.nextUrl.searchParams.get("code");
    if (!token && !code) {
      return NextResponse.json({ error: "Token or confirmation code required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Find the registration by secure_token (preferred) or public_confirmation_code (manual lookup)
    let query = supabase
      .from("registrations")
      .select("id, first_name, last_name, email, category, event_id, attendance_type, status, public_confirmation_code, secure_token, events(name, start_date, end_date)")
      .eq("status", "confirmed");

    if (token) {
      query = query.eq("secure_token", token);
    } else {
      query = query.eq("public_confirmation_code", code!.toUpperCase());
    }

    const { data: reg, error: regError } = await query.single();

    if (regError || !reg) {
      return NextResponse.json({ error: "Registration not found or not confirmed" }, { status: 404 });
    }

    // Only KOTE users can purchase meals — other attendance types have meals included
    if (reg.attendance_type !== "kote") {
      return NextResponse.json({ error: "Meals are already included in your registration. Only KOTE (day camper) attendees need to purchase meals separately." }, { status: 400 });
    }

    // Fetch pricing config for meal prices
    const { data: pricing } = await supabase
      .from("pricing_config")
      .select("meal_price_adult, meal_price_child")
      .eq("event_id", reg.event_id)
      .single();

    const mealPriceAdult = pricing?.meal_price_adult ?? 12;
    const mealPriceChild = pricing?.meal_price_child ?? 8;
    const unitPrice = reg.category === "child" ? mealPriceChild : mealPriceAdult;

    // Fetch all meal services for this event
    const { data: meals } = await supabase
      .from("service_catalog")
      .select("id, service_name, service_code, meal_type, service_date, start_time, end_time")
      .eq("event_id", reg.event_id)
      .eq("service_category", "meal")
      .eq("is_active", true)
      .order("service_date")
      .order("display_order");

    // Fetch existing entitlements for this registration's meals
    const mealIds = (meals || []).map((m) => m.id);
    const { data: entitlements } = await supabase
      .from("service_entitlements")
      .select("service_id, status, quantity_used")
      .eq("registration_id", reg.id)
      .in("service_id", mealIds.length > 0 ? mealIds : ["00000000-0000-0000-0000-000000000000"]);

    const entitlementMap = new Map(
      (entitlements || []).map((e) => [e.service_id, e])
    );

    // Fetch purchase history
    const { data: purchases } = await supabase
      .from("meal_purchases")
      .select("id, total_amount, payment_method, payment_status, created_at, meal_purchase_items(service_id, unit_price)")
      .eq("registration_id", reg.id)
      .eq("payment_status", "completed")
      .order("created_at", { ascending: false });

    // Build meal availability list
    const now = new Date();
    const mealList = (meals || []).map((meal) => {
      const ent = entitlementMap.get(meal.id);
      const isPurchased = ent && (ent.status === "allowed" || ent.status === "paid_extra");
      const isUsed = ent && ent.quantity_used > 0;

      // Check if meal is in the future (allow purchase only for future meals)
      let isFuture = true;
      if (meal.service_date) {
        const mealDate = new Date(meal.service_date + "T23:59:59");
        isFuture = mealDate >= now;
      }

      return {
        id: meal.id,
        service_name: meal.service_name,
        meal_type: meal.meal_type,
        service_date: meal.service_date,
        start_time: meal.start_time,
        end_time: meal.end_time,
        isPurchased: !!isPurchased,
        isUsed: !!isUsed,
        isFuture,
        canPurchase: isFuture && !isPurchased,
      };
    });

    const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;

    return NextResponse.json({
      registration: {
        id: reg.id,
        firstName: reg.first_name,
        lastName: reg.last_name,
        category: reg.category,
        attendanceType: reg.attendance_type,
        confirmationCode: reg.public_confirmation_code,
        secureToken: reg.secure_token,
      },
      event: {
        name: event?.name,
        startDate: event?.start_date,
        endDate: event?.end_date,
      },
      unitPrice,
      meals: mealList,
      purchases: purchases || [],
    });
  } catch (error) {
    console.error("Fetch available meals error:", error);
    return NextResponse.json({ error: "Failed to fetch meals" }, { status: 500 });
  }
}
