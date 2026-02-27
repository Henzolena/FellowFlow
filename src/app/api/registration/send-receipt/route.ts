import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { Registration, Event, PricingConfig } from "@/types/database";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`send-receipt:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  try {
    const { confirmationId, lastName } = await request.json();

    if (!confirmationId || !lastName) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(confirmationId)) {
      return NextResponse.json({ error: "Invalid confirmation ID." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, computed_amount, explanation_detail, " +
        "group_id, event_id, category, age_at_event, is_full_duration, is_staying_in_motel, " +
        "num_days, date_of_birth, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)"
      )
      .eq("id", confirmationId)
      .single<Record<string, unknown>>();

    if (error || !data) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const dbLastName = (data.last_name as string) || "";
    if (dbLastName.toLowerCase().trim() !== lastName.toLowerCase().trim()) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const evtData = data.events as unknown as { name: string } | null;
    const groupId = data.group_id as string | null;

    // ─── Group receipt ───
    if (groupId) {
      const { data: siblings } = await supabase
        .from("registrations")
        .select(
          "id, first_name, last_name, email, computed_amount, category, age_at_event, " +
          "is_full_duration, is_staying_in_motel, num_days, date_of_birth"
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      const rows = siblings as unknown as Record<string, unknown>[];
      if (rows.length > 0) {
        // Compute group pricing for surcharge
        const eventId = data.event_id as string;
        const { data: pricing } = await supabase
          .from("pricing_config")
          .select("*")
          .eq("event_id", eventId)
          .single<PricingConfig>();

        let subtotal = 0;
        let surcharge = 0;
        let surchargeLabel: string | null = null;
        let grandTotal = 0;

        subtotal = rows.reduce((sum, r) => sum + Number(r.computed_amount), 0);

        if (pricing) {
          const eventObj = data.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;
          const result = computeGroupPricing(
            (rows as unknown as Registration[]).map((r) => ({
              dateOfBirth: r.date_of_birth,
              isFullDuration: r.is_full_duration,
              isStayingInMotel: r.is_staying_in_motel ?? undefined,
              numDays: r.num_days ?? undefined,
            })),
            { ...eventObj, id: eventId, is_active: true, created_at: "", updated_at: "", description: null } as Event,
            pricing
          );
          subtotal = result.subtotal;
          surcharge = result.surcharge;
          surchargeLabel = result.surchargeLabel;
          grandTotal = result.grandTotal;
        } else {
          grandTotal = subtotal;
        }

        function attendanceLabel(r: Record<string, unknown>): string {
          if (r.is_full_duration) return "Full Conference";
          if (r.is_staying_in_motel) return "Partial — Motel";
          return `${r.num_days} Day(s)`;
        }

        await sendGroupReceiptEmail({
          to: data.email as string,
          eventName: evtData?.name || "Event",
          members: rows.map((r) => ({
            firstName: r.first_name as string,
            lastName: r.last_name as string,
            category: r.category as string,
            ageAtEvent: r.age_at_event as number,
            amount: Number(r.computed_amount),
            attendance: attendanceLabel(r),
          })),
          subtotal,
          surcharge,
          surchargeLabel,
          grandTotal,
          isFree: grandTotal === 0,
          primaryRegistrationId: data.id as string,
        });

        return NextResponse.json({ sent: true });
      }
    }

    // ─── Solo receipt ───
    const amount = Number(data.computed_amount);
    await sendConfirmationEmail({
      to: data.email as string,
      firstName: data.first_name as string,
      lastName: data.last_name as string,
      eventName: evtData?.name || "Event",
      amount,
      isFree: amount === 0,
      registrationId: data.id as string,
      explanationDetail: data.explanation_detail as string | null,
    });

    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
