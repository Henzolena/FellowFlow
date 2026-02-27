import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select("*, pricing_config(*)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Fetch events error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        name: body.name,
        description: body.description || null,
        start_date: body.startDate,
        end_date: body.endDate,
        adult_age_threshold: body.adultAgeThreshold ?? 18,
        youth_age_threshold: body.youthAgeThreshold ?? 13,
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Create pricing config
    const { error: pricingError } = await supabase
      .from("pricing_config")
      .insert({
        event_id: event.id,
        adult_full_price: body.pricing?.adultFullPrice ?? 0,
        adult_daily_price: body.pricing?.adultDailyPrice ?? 0,
        youth_full_price: body.pricing?.youthFullPrice ?? 0,
        youth_daily_price: body.pricing?.youthDailyPrice ?? 0,
        child_full_price: body.pricing?.childFullPrice ?? 0,
        child_daily_price: body.pricing?.childDailyPrice ?? 0,
        motel_stay_free: body.pricing?.motelStayFree ?? true,
      });

    if (pricingError) throw pricingError;

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("Create event error:", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { error: eventError } = await supabase
      .from("events")
      .update({
        name: body.name,
        description: body.description || null,
        start_date: body.startDate,
        end_date: body.endDate,
        adult_age_threshold: body.adultAgeThreshold ?? 18,
        youth_age_threshold: body.youthAgeThreshold ?? 13,
        is_active: body.isActive ?? true,
      })
      .eq("id", body.id);

    if (eventError) throw eventError;

    if (body.pricing) {
      const { error: pricingError } = await supabase
        .from("pricing_config")
        .upsert({
          event_id: body.id,
          adult_full_price: body.pricing.adultFullPrice,
          adult_daily_price: body.pricing.adultDailyPrice,
          youth_full_price: body.pricing.youthFullPrice,
          youth_daily_price: body.pricing.youthDailyPrice,
          child_full_price: body.pricing.childFullPrice,
          child_daily_price: body.pricing.childDailyPrice,
          motel_stay_free: body.pricing.motelStayFree ?? true,
        }, { onConflict: "event_id" });

      if (pricingError) throw pricingError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update event error:", error);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}
