import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computePricing } from "@/lib/pricing/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { Event, PricingConfig } from "@/types/database";

// 30 requests per 60 seconds per IP
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`pricing-quote:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      console.warn(`Rate limit hit: pricing-quote from ${ip}`);
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }

    const body = await request.json();
    const { eventId, dateOfBirth, isFullDuration, isStayingInMotel, numDays } = body;

    if (!eventId || !dateOfBirth || typeof isFullDuration !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("is_active", true)
      .single<Event>();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { data: pricing, error: pricingError } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("event_id", eventId)
      .single<PricingConfig>();

    if (pricingError || !pricing) {
      return NextResponse.json(
        { error: "Pricing not configured" },
        { status: 404 }
      );
    }

    const result = computePricing(
      { dateOfBirth, isFullDuration, isStayingInMotel, numDays },
      event,
      pricing
    );

    return NextResponse.json({
      ...result,
      eventName: event.name,
      durationDays: event.duration_days,
    });
  } catch (error) {
    console.error("Pricing quote error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
