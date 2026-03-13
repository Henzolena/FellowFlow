import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { Event, PricingConfig } from "@/types/database";
import { z } from "zod";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const quoteGroupSchema = z.object({
  eventId: z.string().uuid(),
  registrants: z.array(
    z.object({
      dateOfBirth: z.string().min(1),
      isFullDuration: z.boolean(),
      isStayingInMotel: z.boolean().optional(),
      numDays: z.number().int().min(1).optional(),
      selectedDays: z.array(z.number().int().min(1).max(10)).optional(),
      attendanceType: z.enum(["full_conference", "partial", "kote"]).optional(),
      mealServiceIds: z.array(z.string().uuid()).optional(),
    })
  ).min(1).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`quote-group:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = quoteGroupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventId, registrants } = parsed.data;
    const supabase = await createClient();

    const { data: event } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("is_active", true)
      .single<Event>();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { data: pricing } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("event_id", eventId)
      .single<PricingConfig>();

    if (!pricing) {
      return NextResponse.json({ error: "Pricing not configured" }, { status: 404 });
    }

    // Validate numDays does not exceed event duration for partial attendance
    for (const r of registrants) {
      if (!r.isFullDuration && r.numDays && r.numDays > event.duration_days) {
        return NextResponse.json(
          { error: `numDays (${r.numDays}) cannot exceed event duration (${event.duration_days} days)` },
          { status: 400 }
        );
      }
    }

    const serverRegistrationDate = new Date().toISOString();
    const result = computeGroupPricing(
      registrants.map((r) => ({
        dateOfBirth: r.dateOfBirth,
        isFullDuration: r.isFullDuration,
        isStayingInMotel: r.isStayingInMotel,
        numDays: r.isFullDuration ? undefined : r.numDays,
        selectedDays: r.selectedDays,
        attendanceType: r.attendanceType,
        registrationDate: serverRegistrationDate,
      })),
      event,
      pricing
    );

    // Compute meal costs per registrant
    const mealCounts = registrants.map((r) => r.mealServiceIds?.length ?? 0);
    const mealItems = result.items.map((item, i) => {
      const count = mealCounts[i];
      const pricePerMeal = item.category === "child" ? pricing.meal_price_child : pricing.meal_price_adult;
      return { mealCount: count, mealPriceEach: pricePerMeal, mealTotal: count * pricePerMeal };
    });
    const mealGrandTotal = mealItems.reduce((sum, m) => sum + m.mealTotal, 0);

    return NextResponse.json({
      items: result.items.map((item, i) => ({
        category: item.category,
        ageAtEvent: item.ageAtEvent,
        amount: item.amount,
        explanationCode: item.explanationCode,
        explanationDetail: item.explanationDetail,
        mealCount: mealItems[i].mealCount,
        mealPriceEach: mealItems[i].mealPriceEach,
        mealTotal: mealItems[i].mealTotal,
      })),
      subtotal: result.subtotal,
      surcharge: result.surcharge,
      surchargeLabel: result.surchargeLabel,
      mealTotal: mealGrandTotal,
      grandTotal: result.grandTotal + mealGrandTotal,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
