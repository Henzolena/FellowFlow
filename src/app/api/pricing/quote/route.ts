import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computePricing } from "@/lib/pricing/engine";
import type { Event, PricingConfig } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
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
