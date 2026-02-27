import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { Registration, Event, PricingConfig } from "@/types/database";

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

const REG_SELECT =
  "id, first_name, last_name, email, phone, date_of_birth, age_at_event, category, " +
  "is_full_duration, is_staying_in_motel, num_days, computed_amount, explanation_code, " +
  "explanation_detail, status, confirmed_at, created_at, group_id, event_id, " +
  "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold), payments(*)";

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
    const { confirmationId, lastName } = await request.json();

    if (!confirmationId || !lastName) {
      return NextResponse.json(
        { error: "Confirmation ID and last name are required." },
        { status: 400 }
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(confirmationId)) {
      return NextResponse.json(
        { error: "Invalid confirmation ID format." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("registrations")
      .select(REG_SELECT)
      .eq("id", confirmationId)
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
    let groupPricing: { subtotal: number; surcharge: number; surchargeLabel: string | null; grandTotal: number } | null = null;

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
          const eventData = data.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold">;
          const result = computeGroupPricing(
            (siblings as unknown as Registration[]).map((r) => ({
              dateOfBirth: r.date_of_birth,
              isFullDuration: r.is_full_duration,
              isStayingInMotel: r.is_staying_in_motel ?? undefined,
              numDays: r.num_days ?? undefined,
            })),
            { ...eventData, id: eventId, is_active: true, created_at: "", updated_at: "", description: null } as Event,
            pricing
          );
          groupPricing = {
            subtotal: result.subtotal,
            surcharge: result.surcharge,
            surchargeLabel: result.surchargeLabel,
            grandTotal: result.grandTotal,
          };
        }
      }
    }

    return NextResponse.json({
      registration: data,
      ...(groupMembers ? { groupMembers, groupPricing } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
