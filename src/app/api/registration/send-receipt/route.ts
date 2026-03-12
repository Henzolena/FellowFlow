import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { receiptLookupSchema } from "@/lib/validations/api";
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
    const body = await request.json();
    const parsed = receiptLookupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { confirmationId, lastName } = parsed.data;

    const supabase = createAdminClient();

    // Look up by UUID or public confirmation code
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUUID = UUID_REGEX.test(confirmationId);
    const column = isUUID ? "id" : "public_confirmation_code";

    const { data, error } = await supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, computed_amount, explanation_detail, " +
        "group_id, event_id, category, access_tier, age_at_event, is_full_duration, is_staying_in_motel, " +
        "num_days, date_of_birth, attendance_type, public_confirmation_code, " +
        "gender, city, church_id, church_name_custom, " +
        "events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold), " +
        "lodging_assignments(id, bed_id, beds(bed_label, rooms(room_number, motels(name))))"
      )
      .eq(column, confirmationId)
      .single<Record<string, unknown>>();

    if (error || !data) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const dbLastName = (data.last_name as string) || "";
    if (dbLastName.toLowerCase().trim() !== lastName.toLowerCase().trim()) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const evtData = data.events as unknown as { name: string; start_date: string; end_date: string } | null;
    const groupId = data.group_id as string | null;

    // Resolve church name from church_id or church_name_custom
    async function resolveChurchName(churchId: string | null, custom: string | null): Promise<string | null> {
      if (custom) return custom;
      if (!churchId) return null;
      const { data: ch } = await supabase.from("churches").select("name").eq("id", churchId).single();
      return ch?.name || null;
    }

    // Extract lodging info from nested lodging_assignments join
    function extractLodging(row: Record<string, unknown>): { dormName: string | null; bedLabel: string | null } {
      const raw = row.lodging_assignments as unknown;
      // PostgREST returns object (not array) when FK has unique constraint
      const la = Array.isArray(raw) ? raw[0] : raw as { beds?: { bed_label?: string; rooms?: { motels?: { name?: string } } } } | null;
      return {
        dormName: la?.beds?.rooms?.motels?.name || null,
        bedLabel: la?.beds?.bed_label || null,
      };
    }

    // ─── Group receipt (only for actual multi-person groups) ───
    if (groupId) {
      const { data: siblings } = await supabase
        .from("registrations")
        .select(
          "id, first_name, last_name, email, computed_amount, category, access_tier, age_at_event, " +
          "is_full_duration, is_staying_in_motel, num_days, date_of_birth, " +
          "attendance_type, public_confirmation_code, gender, city, church_id, church_name_custom, " +
          "lodging_assignments(id, bed_id, beds(bed_label, rooms(room_number, motels(name))))"
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      const rows = siblings as unknown as Record<string, unknown>[];
      if (rows.length > 1) {
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
              selectedDays: r.selected_days ?? undefined,
              attendanceType: r.attendance_type,
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

        // Resolve church names for all members
        const membersWithChurch = await Promise.all(
          rows.map(async (r) => {
            const churchName = await resolveChurchName(
              r.church_id as string | null,
              r.church_name_custom as string | null
            );
            const at = (r.attendance_type as string) || "full_conference";
            return {
              firstName: r.first_name as string,
              lastName: r.last_name as string,
              category: r.category as string,
              ageAtEvent: r.age_at_event as number,
              amount: Number(r.computed_amount),
              attendance: at === "full_conference" ? "Full Conference" : at === "kote" ? "KOTE" : `${r.num_days || "?"} Day(s)`,
              attendanceType: r.attendance_type as string | undefined,
              accessTier: r.access_tier as string | undefined,
              confirmationCode: r.public_confirmation_code as string | undefined,
              gender: r.gender as string | null,
              city: r.city as string | null,
              churchName,
              ...extractLodging(r),
            };
          })
        );

        const primaryRow = rows[0];
        await sendGroupReceiptEmail({
          to: data.email as string,
          eventName: evtData?.name || "Event",
          eventStartDate: evtData?.start_date,
          eventEndDate: evtData?.end_date,
          members: membersWithChurch,
          subtotal,
          surcharge,
          surchargeLabel,
          grandTotal,
          isFree: grandTotal === 0,
          primaryRegistrationId: data.id as string,
          primaryConfirmationCode: primaryRow.public_confirmation_code as string | undefined,
        });

        return NextResponse.json({ sent: true });
      }
    }

    // ─── Solo receipt ───
    const amount = Number(data.computed_amount);
    const churchName = await resolveChurchName(
      data.church_id as string | null,
      data.church_name_custom as string | null
    );

    const lodging = extractLodging(data);
    await sendConfirmationEmail({
      to: data.email as string,
      firstName: data.first_name as string,
      lastName: data.last_name as string,
      eventName: evtData?.name || "Event",
      eventStartDate: evtData?.start_date,
      eventEndDate: evtData?.end_date,
      amount,
      isFree: amount === 0,
      registrationId: data.id as string,
      confirmationCode: data.public_confirmation_code as string | undefined,
      explanationDetail: data.explanation_detail as string | null,
      attendanceType: data.attendance_type as string | undefined,
      category: data.category as string | undefined,
      accessTier: data.access_tier as string | undefined,
      gender: data.gender as string | null,
      city: data.city as string | null,
      churchName,
      dormName: lodging.dormName,
      bedLabel: lodging.bedLabel,
    });

    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
