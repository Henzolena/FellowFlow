import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computePricing } from "@/lib/pricing/engine";
import { registrationSchema } from "@/lib/validations/registration";
import type { Event, PricingConfig } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registrationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = await createClient();

    // Get event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", data.eventId)
      .eq("is_active", true)
      .single<Event>();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Get pricing
    const { data: pricing, error: pricingError } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("event_id", data.eventId)
      .single<PricingConfig>();

    if (pricingError || !pricing) {
      return NextResponse.json(
        { error: "Pricing not configured" },
        { status: 404 }
      );
    }

    // Validate numDays doesn't exceed event duration
    if (!data.isFullDuration && data.numDays && data.numDays > event.duration_days) {
      return NextResponse.json(
        { error: `Number of days cannot exceed event duration (${event.duration_days} days)` },
        { status: 400 }
      );
    }

    // Server-side pricing computation (source of truth)
    const pricingResult = computePricing(
      {
        dateOfBirth: data.dateOfBirth,
        isFullDuration: data.isFullDuration,
        isStayingInMotel: data.isStayingInMotel,
        numDays: data.numDays,
      },
      event,
      pricing
    );

    // Get current user if authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Create registration
    const { data: registration, error: regError } = await supabase
      .from("registrations")
      .insert({
        event_id: data.eventId,
        user_id: user?.id ?? null,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        date_of_birth: data.dateOfBirth,
        age_at_event: pricingResult.ageAtEvent,
        category: pricingResult.category,
        is_full_duration: data.isFullDuration,
        is_staying_in_motel: data.isStayingInMotel ?? null,
        num_days: data.numDays ?? null,
        computed_amount: pricingResult.amount,
        explanation_code: pricingResult.explanationCode,
        explanation_detail: pricingResult.explanationDetail,
        status: pricingResult.amount === 0 ? "confirmed" : "pending",
        confirmed_at: pricingResult.amount === 0 ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (regError) {
      console.error("Registration create error:", regError);
      return NextResponse.json(
        { error: "Failed to create registration" },
        { status: 500 }
      );
    }

    return NextResponse.json({ registration });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
