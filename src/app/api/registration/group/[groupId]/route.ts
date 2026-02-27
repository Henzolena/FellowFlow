import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGroupPricing } from "@/lib/pricing/engine";
import type { Registration, Event, PricingConfig } from "@/types/database";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;

    if (!groupId) {
      return NextResponse.json({ error: "Group ID required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: registrations, error } = await supabase
      .from("registrations")
      .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (error || !registrations || registrations.length === 0) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const primaryReg = registrations[0];
    const eventData = primaryReg.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;

    // Compute group pricing for surcharge
    const { data: pricing } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("event_id", primaryReg.event_id)
      .single<PricingConfig>();

    let pricingInfo = {
      subtotal: 0,
      surcharge: 0,
      surchargeLabel: null as string | null,
      grandTotal: 0,
    };

    const subtotal = registrations.reduce(
      (sum: number, r: Registration) => sum + Number(r.computed_amount),
      0
    );

    if (pricing) {
      const groupResult = computeGroupPricing(
        registrations.map((r: Registration) => ({
          dateOfBirth: r.date_of_birth,
          isFullDuration: r.is_full_duration,
          isStayingInMotel: r.is_staying_in_motel ?? undefined,
          numDays: r.num_days ?? undefined,
        })),
        {
          ...eventData,
          id: primaryReg.event_id,
          is_active: true,
          created_at: "",
          updated_at: "",
          description: null,
        } as Event,
        pricing
      );
      pricingInfo = {
        subtotal: groupResult.subtotal,
        surcharge: groupResult.surcharge,
        surchargeLabel: groupResult.surchargeLabel,
        grandTotal: groupResult.grandTotal,
      };
    } else {
      pricingInfo = {
        subtotal,
        surcharge: 0,
        surchargeLabel: null,
        grandTotal: subtotal,
      };
    }

    // Strip the events join from registration objects before returning
    const cleanRegistrations = registrations.map(({ events, ...rest }: Record<string, unknown>) => rest);

    return NextResponse.json({
      registrations: cleanRegistrations,
      pricing: pricingInfo,
    });
  } catch (error) {
    console.error("Group fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
