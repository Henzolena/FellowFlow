import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { receiptLookupSchema } from "@/lib/validations/api";
import type { Registration, Event, PricingConfig } from "@/types/database";

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

const REG_SELECT =
  "id, first_name, last_name, email, phone, date_of_birth, age_at_event, category, " +
  "is_full_duration, is_staying_in_motel, num_days, selected_days, selected_meal_ids, tshirt_size, computed_amount, explanation_code, " +
  "explanation_detail, status, confirmed_at, created_at, group_id, event_id, " +
  "attendance_type, public_confirmation_code, gender, city, church_id, church_name_custom, access_tier, " +
  "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold), payments(*), " +
  "lodging_assignments(id, bed_id, notes, beds(bed_label, bed_type, rooms(room_number, motels(name))))";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`receipt-verify:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  try {
    const body = await request.json();
    const parsed = receiptLookupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { confirmationId, lastName } = parsed.data;

    const supabase = createAdminClient();

    // Look up by UUID or public confirmation code
    const isUUID = UUID_REGEX.test(confirmationId);
    const column = isUUID ? "id" : "public_confirmation_code";

    const { data, error } = await supabase
      .from("registrations")
      .select(REG_SELECT)
      .eq(column, confirmationId)
      .single<Record<string, unknown>>();

    if (error || !data) {
      return NextResponse.json(
        { error: "No registration found. Please check your confirmation ID and last name." },
        { status: 404 }
      );
    }

    // Case-insensitive last name comparison
    const dbLastName = (data.last_name as string) || "";
    if (dbLastName.toLowerCase().trim() !== lastName.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "No registration found. Please check your confirmation ID and last name." },
        { status: 404 }
      );
    }

    // ─── Group context ───
    const groupId = data.group_id as string | null;
    let groupMembers: Record<string, unknown>[] | null = null;
    let groupPricing: { subtotal: number; surcharge: number; surchargeLabel: string | null; mealTotal: number; grandTotal: number } | null = null;

    if (groupId) {
      const { data: siblings } = await supabase
        .from("registrations")
        .select(REG_SELECT)
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (siblings && siblings.length > 0) {
        groupMembers = siblings as unknown as Record<string, unknown>[];

        // Compute group pricing for surcharge display
        const eventId = data.event_id as string;
        const { data: pricing } = await supabase
          .from("pricing_config")
          .select("*")
          .eq("event_id", eventId)
          .single<PricingConfig>();

        if (pricing) {
          const eventData = data.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;
          const result = computeGroupPricing(
            (siblings as unknown as Registration[]).map((r) => ({
              dateOfBirth: r.date_of_birth,
              isFullDuration: r.is_full_duration,
              isStayingInMotel: r.is_staying_in_motel ?? undefined,
              numDays: r.num_days ?? undefined,
              selectedDays: r.selected_days ?? undefined,
            })),
            { ...eventData, id: eventId, is_active: true, created_at: "", updated_at: "", description: null } as Event,
            pricing
          );

          // Compute meal costs from selected_meal_ids
          let mealTotal = 0;
          for (const s of siblings as unknown as Registration[]) {
            const mealIds = s.selected_meal_ids;
            if (mealIds && mealIds.length > 0) {
              const pricePerMeal = s.category === "child" ? pricing.meal_price_child : pricing.meal_price_adult;
              mealTotal += mealIds.length * pricePerMeal;
            }
          }

          groupPricing = {
            subtotal: result.subtotal,
            surcharge: result.surcharge,
            surchargeLabel: result.surchargeLabel,
            mealTotal,
            grandTotal: result.grandTotal + mealTotal,
          };
        }
      }
    }

    // Always compute individual mealTotal for this registrant
    let mealTotal = 0;
    const mealIds = data.selected_meal_ids as string[] | null;
    if (mealIds && mealIds.length > 0) {
      const eventId = data.event_id as string;
      const { data: mealPricing } = await supabase
        .from("pricing_config")
        .select("meal_price_adult, meal_price_child")
        .eq("event_id", eventId)
        .single();
      if (mealPricing) {
        const category = data.category as string;
        const pricePerMeal = category === "child" ? mealPricing.meal_price_child : mealPricing.meal_price_adult;
        mealTotal = mealIds.length * pricePerMeal;
      }
    }

    return NextResponse.json({
      registration: data,
      mealTotal,
      ...(groupMembers ? { groupMembers, groupPricing } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
