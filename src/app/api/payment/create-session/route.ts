import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionSchema } from "@/lib/validations/api";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createRequestLogger } from "@/lib/logger";
import { recomputeSoloPricing, recomputeGroupPricing } from "@/lib/services/pricing-recomputer";
import { reuseExistingSession, createAndPersistSession } from "@/lib/services/session-manager";
import { computeMealPrice } from "@/lib/pricing/engine";
import type { Registration, Event, PricingConfig } from "@/types/database";
import { registrationProductId, surchargeProductId, mealProductId } from "@/lib/stripe/product-map";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request, "create-session");
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`create-session:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { registrationId, groupId } = parsed.data;
    const supabase = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (groupId) {
      return handleGroupPayment(supabase, groupId, appUrl, log);
    }

    return handleSoloPayment(supabase, registrationId!, appUrl, log);
  } catch (error) {
    log.error("Payment session error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to create payment session" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Solo payment (single registration)                                 */
/* ------------------------------------------------------------------ */
async function handleSoloPayment(
  supabase: ReturnType<typeof createAdminClient>,
  registrationId: string,
  appUrl: string,
  log: ReturnType<typeof createRequestLogger>
) {
  const { data: registration, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)")
    .eq("id", registrationId)
    .single<
      Registration & {
        events: Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;
      }
    >();

  if (error || !registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (registration.status === "confirmed") {
    return NextResponse.json({ error: "Registration already confirmed" }, { status: 400 });
  }

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("*")
    .eq("event_id", registration.event_id)
    .single<PricingConfig>();

  if (!pricing) {
    return NextResponse.json({ error: "Pricing not configured" }, { status: 404 });
  }

  const recomputed = await recomputeSoloPricing(supabase, registration, pricing, log);

  if (recomputed.amount === 0) {
    return NextResponse.json({ error: "No payment required for free registrations" }, { status: 400 });
  }

  // Reuse existing open Stripe session if available
  const existing = await reuseExistingSession(supabase, registrationId, log);
  if (existing) {
    return NextResponse.json(existing);
  }

  const ln = encodeURIComponent(registration.last_name);

  // Build line items linked to Stripe products
  const lineItems: { price_data: { currency: string; product?: string; product_data?: { name: string; description: string }; unit_amount: number }; quantity: number; metadata?: Record<string, string> }[] = [];

  const regProduct = registrationProductId(pricing.id, recomputed.explanationCode);
  const attendeeInfo = `${registration.first_name} ${registration.last_name} (${registration.category})`;
  const eventDates = registration.events.start_date && registration.events.end_date 
    ? `${new Date(registration.events.start_date).toLocaleDateString()} - ${new Date(registration.events.end_date).toLocaleDateString()}`
    : '';
  
  lineItems.push({
    price_data: {
      currency: "usd",
      product_data: { 
        name: `Registration: ${registration.events.name}`,
        description: `${attendeeInfo}\n${recomputed.explanationDetail}\n${eventDates}` 
      },
      unit_amount: Math.round(recomputed.baseAmount * 100),
    },
    quantity: 1,
    metadata: {
      attendee_name: `${registration.first_name} ${registration.last_name}`,
      attendee_email: registration.email,
      registration_type: recomputed.explanationCode,
      registration_id: registration.id,
      event_name: registration.events.name,
      category: registration.category,
      is_full_duration: registration.is_full_duration.toString(),
      num_days: registration.num_days?.toString() || 'N/A',
      stripe_product_id: regProduct || 'dynamic' // Keep reference for dashboard tracking
    }
  });

  // Separate surcharge line item linked to the surcharge product
  if (recomputed.surcharge > 0) {
    const surProduct = surchargeProductId(recomputed.surchargeLabel);
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { 
          name: recomputed.surchargeLabel || "Late Registration Surcharge", 
          description: `Applied to registration for ${attendeeInfo}` 
        },
        unit_amount: Math.round(recomputed.surcharge * 100),
      },
      quantity: 1,
      metadata: {
        surcharge_type: recomputed.surchargeLabel || 'late_fee',
        attendee_name: `${registration.first_name} ${registration.last_name}`,
        registration_id: registration.id,
        event_name: registration.events.name,
        base_amount: recomputed.baseAmount.toString(),
        surcharge_amount: recomputed.surcharge.toString(),
        stripe_product_id: surProduct || 'dynamic' // Keep reference for dashboard tracking
      }
    });
  }

  const result = await createAndPersistSession({
    supabase,
    log,
    registrationId,
    eventId: registration.event_id,
    customerEmail: registration.email,
    amount: recomputed.amount,
    lineItems,
    successUrl: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&registration_id=${registrationId}&ln=${ln}`,
    cancelUrl: `${appUrl}/register/review?registration_id=${registrationId}&ln=${ln}&cancelled=true`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sessionId: result.sessionId, url: result.url });
}

/* ------------------------------------------------------------------ */
/*  Group payment (multiple registrations, one checkout)               */
/* ------------------------------------------------------------------ */
async function handleGroupPayment(
  supabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  appUrl: string,
  log: ReturnType<typeof createRequestLogger>
) {
  const { data: registrations, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)")
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (error || !registrations || registrations.length === 0) {
    return NextResponse.json({ error: "Group registrations not found" }, { status: 404 });
  }

  const primaryReg = registrations[0];
  const eventData = primaryReg.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("*")
    .eq("event_id", primaryReg.event_id)
    .single<PricingConfig>();

  if (!pricing) {
    return NextResponse.json({ error: "Pricing not configured" }, { status: 404 });
  }

  const groupResult = await recomputeGroupPricing(supabase, registrations, pricing, log);
  const { surcharge, surchargeLabel, grandTotal } = groupResult;

  // Compute meal costs from stored selected_meal_ids (age-based pricing)
  let mealGrandTotal = 0;
  type LineItem = { price_data: { currency: string; product?: string; product_data?: { name: string; description: string }; unit_amount: number }; quantity: number; metadata?: Record<string, string> };
  const mealLineItems: LineItem[] = [];
  for (const r of registrations as Registration[]) {
    const mealIds = r.selected_meal_ids;
    if (mealIds && mealIds.length > 0) {
      const pricePerMeal = computeMealPrice(r.age_at_event, r.attendance_type, pricing);
      if (pricePerMeal > 0) {
        // Create one line item per meal service linked to the Stripe meal product
        for (const serviceId of mealIds) {
          const mealProd = mealProductId(serviceId);
          // Fetch meal service details for description
          const { data: service } = await supabase
            .from("service_catalog")
            .select("name, meal_date, meal_name")
            .eq("id", serviceId)
            .single();
          
          const mealDescription = service 
            ? `${r.first_name} ${r.last_name} - ${service.meal_name} on ${new Date(service.meal_date).toLocaleDateString()}`
            : `${r.first_name} ${r.last_name} - Meal`;
          
          mealLineItems.push({
            price_data: {
              currency: "usd",
              product_data: {
                name: `Meal: ${service?.meal_name || 'Meal'}`,
                description: mealDescription
              },
              unit_amount: Math.round(pricePerMeal * 100),
            },
            quantity: 1,
            metadata: {
              attendee_name: `${r.first_name} ${r.last_name}`,
              attendee_email: r.email,
              registration_id: r.id,
              service_id: serviceId,
              meal_price: pricePerMeal.toString(),
              age_at_event: r.age_at_event?.toString() || '',
              attendance_type: r.attendance_type,
              group_id: groupId || '',
              stripe_product_id: mealProd || 'dynamic' // Keep reference for dashboard tracking
            }
          });
          mealGrandTotal += pricePerMeal;
        }
      }
    }
  }

  const totalWithMeals = grandTotal + mealGrandTotal;

  if (totalWithMeals === 0) {
    return NextResponse.json({ error: "No payment required" }, { status: 400 });
  }

  // Reuse existing open Stripe session if available
  const existing = await reuseExistingSession(supabase, primaryReg.id, log);
  if (existing) {
    return NextResponse.json(existing);
  }

  // Build line items from recomputed amounts — linked to Stripe products
  const lineItems: LineItem[] = [];
  for (let i = 0; i < registrations.length; i++) {
    const r = registrations[i] as Registration;
    const item = groupResult.items[i];
    if (item.amount === 0) continue; // FREE_INFANT — skip
    const regProduct = registrationProductId(pricing.id, item.explanationCode);
    const attendeeInfo = `${r.first_name} ${r.last_name} (${r.category})`;
    const eventDates = eventData.start_date && eventData.end_date 
      ? `${new Date(eventData.start_date).toLocaleDateString()} - ${new Date(eventData.end_date).toLocaleDateString()}`
      : '';
    
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { 
          name: `Registration: ${r.first_name} ${r.last_name}`,
          description: `${attendeeInfo}\n${item.explanationDetail || `Registration for ${eventData.name}`}\n${eventDates}` 
        },
        unit_amount: Math.round(item.amount * 100),
      },
      quantity: 1,
      metadata: {
        attendee_name: `${r.first_name} ${r.last_name}`,
        attendee_email: r.email,
        registration_type: item.explanationCode,
        registration_id: r.id,
        event_name: eventData.name,
        category: r.category,
        is_full_duration: r.is_full_duration.toString(),
        num_days: r.num_days?.toString() || 'N/A',
        group_id: groupId || '',
        stripe_product_id: regProduct || 'dynamic' // Keep reference for dashboard tracking
      }
    });
  }

  if (surcharge > 0) {
    const surProduct = surchargeProductId(surchargeLabel);
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { 
          name: surchargeLabel || "Late Registration Surcharge", 
          description: `Applied once to group total for ${registrations.length} registrants` 
        },
        unit_amount: Math.round(surcharge * 100),
      },
      quantity: 1,
      metadata: {
        surcharge_type: surchargeLabel || 'late_fee',
        group_id: groupId || '',
        event_name: eventData.name,
        num_registrants: registrations.length.toString(),
        grand_total: grandTotal.toString(),
        surcharge_amount: surcharge.toString(),
        stripe_product_id: surProduct || 'dynamic' // Keep reference for dashboard tracking
      }
    });
  }

  // Add meal line items
  lineItems.push(...mealLineItems);

  const ln = encodeURIComponent(primaryReg.last_name);
  const result = await createAndPersistSession({
    supabase,
    log,
    registrationId: primaryReg.id,
    groupId,
    eventId: primaryReg.event_id,
    customerEmail: primaryReg.email,
    amount: totalWithMeals,
    lineItems,
    successUrl: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&group_id=${groupId}&registration_id=${primaryReg.id}&ln=${ln}`,
    cancelUrl: `${appUrl}/register/review?group_id=${groupId}&registration_id=${primaryReg.id}&ln=${ln}&cancelled=true`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sessionId: result.sessionId, url: result.url });
}
