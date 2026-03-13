import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { z } from "zod";

const purchaseSchema = z.object({
  confirmationCode: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1, "Select at least one meal"),
});

// POST /api/meals/purchase — Create a Stripe checkout session for meal purchases
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { confirmationCode, serviceIds } = parsed.data;
    const supabase = createAdminClient();

    // Find the registration
    const { data: reg } = await supabase
      .from("registrations")
      .select("id, first_name, last_name, email, category, event_id, status, public_confirmation_code")
      .eq("public_confirmation_code", confirmationCode.toUpperCase())
      .eq("status", "confirmed")
      .single();

    if (!reg) {
      return NextResponse.json({ error: "Registration not found or not confirmed" }, { status: 404 });
    }

    // Fetch pricing
    const { data: pricing } = await supabase
      .from("pricing_config")
      .select("meal_price_adult, meal_price_child")
      .eq("event_id", reg.event_id)
      .single();

    const mealPriceAdult = pricing?.meal_price_adult ?? 12;
    const mealPriceChild = pricing?.meal_price_child ?? 8;
    const unitPrice = reg.category === "child" ? mealPriceChild : mealPriceAdult;

    // Validate services
    const { data: services } = await supabase
      .from("service_catalog")
      .select("id, service_name, meal_type, service_date")
      .in("id", serviceIds)
      .eq("service_category", "meal")
      .eq("is_active", true);

    if (!services || services.length === 0) {
      return NextResponse.json({ error: "No valid meals found" }, { status: 400 });
    }

    // Check for already-purchased meals
    const validIds = services.map((s) => s.id);
    const { data: existing } = await supabase
      .from("service_entitlements")
      .select("service_id")
      .eq("registration_id", reg.id)
      .in("service_id", validIds)
      .in("status", ["allowed", "paid_extra"]);

    const alreadyPurchased = new Set((existing || []).map((e) => e.service_id));
    const newServices = services.filter((s) => !alreadyPurchased.has(s.id));

    if (newServices.length === 0) {
      return NextResponse.json({ error: "All selected meals are already purchased" }, { status: 409 });
    }

    const totalAmount = newServices.length * unitPrice;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create a meal_purchases record (pending until Stripe confirms)
    const { data: purchase, error: purchaseError } = await supabase
      .from("meal_purchases")
      .insert({
        registration_id: reg.id,
        event_id: reg.event_id,
        total_amount: totalAmount,
        payment_method: "stripe",
        payment_status: "pending",
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    // Create purchase items
    const items = newServices.map((s) => ({
      meal_purchase_id: purchase.id,
      service_id: s.id,
      unit_price: unitPrice,
    }));

    await supabase.from("meal_purchase_items").insert(items);

    // Build Stripe line items
    const lineItems = newServices.map((s) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: s.service_name,
          description: `Meal for ${reg.first_name} ${reg.last_name}`,
        },
        unit_amount: Math.round(unitPrice * 100),
      },
      quantity: 1,
    }));

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${appUrl}/meals/${encodeURIComponent(confirmationCode)}?success=true&purchase_id=${purchase.id}`,
      cancel_url: `${appUrl}/meals/${encodeURIComponent(confirmationCode)}?cancelled=true`,
      customer_email: reg.email,
      metadata: {
        type: "meal_purchase",
        meal_purchase_id: purchase.id,
        registration_id: reg.id,
        event_id: reg.event_id,
      },
    });

    // Update purchase with stripe session id
    await supabase
      .from("meal_purchases")
      .update({ stripe_session_id: session.id })
      .eq("id", purchase.id);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Meal purchase error:", error);
    return NextResponse.json({ error: "Failed to create payment session" }, { status: 500 });
  }
}
