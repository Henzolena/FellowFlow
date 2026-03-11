import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { adminCreateEventSchema, adminUpdateEventSchema } from "@/lib/validations/api";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

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
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();
    const body = await request.json();
    const parsed = adminCreateEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const v = parsed.data;
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        name: v.name,
        description: v.description || null,
        start_date: v.startDate,
        end_date: v.endDate,
        adult_age_threshold: v.adultAgeThreshold,
        youth_age_threshold: v.youthAgeThreshold,
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Create pricing config
    const { error: pricingError } = await supabase
      .from("pricing_config")
      .insert({
        event_id: event.id,
        adult_full_price: v.pricing?.adultFullPrice ?? 0,
        adult_daily_price: v.pricing?.adultDailyPrice ?? 0,
        youth_full_price: v.pricing?.youthFullPrice ?? 0,
        youth_daily_price: v.pricing?.youthDailyPrice ?? 0,
        child_full_price: v.pricing?.childFullPrice ?? 0,
        child_daily_price: v.pricing?.childDailyPrice ?? 0,
        kote_daily_price: v.pricing?.koteDailyPrice ?? 10,
        lodging_fee: v.pricing?.lodgingFee ?? 0,
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
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();
    const body = await request.json();
    const parsed = adminUpdateEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const v = parsed.data;
    const { error: eventError } = await supabase
      .from("events")
      .update({
        name: v.name,
        description: v.description || null,
        start_date: v.startDate,
        end_date: v.endDate,
        adult_age_threshold: v.adultAgeThreshold,
        youth_age_threshold: v.youthAgeThreshold,
        is_active: v.isActive,
      })
      .eq("id", v.id);

    if (eventError) throw eventError;

    if (v.pricing) {
      const { error: pricingError } = await supabase
        .from("pricing_config")
        .upsert({
          event_id: v.id,
          adult_full_price: v.pricing.adultFullPrice,
          adult_daily_price: v.pricing.adultDailyPrice,
          youth_full_price: v.pricing.youthFullPrice,
          youth_daily_price: v.pricing.youthDailyPrice,
          child_full_price: v.pricing.childFullPrice,
          child_daily_price: v.pricing.childDailyPrice,
          kote_daily_price: v.pricing.koteDailyPrice ?? 10,
          lodging_fee: v.pricing.lodgingFee ?? 0,
        }, { onConflict: "event_id" });

      if (pricingError) throw pricingError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update event error:", error);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}
