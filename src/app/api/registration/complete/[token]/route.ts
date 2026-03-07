import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { computePricing } from "@/lib/pricing/engine";
import type { Event, PricingConfig } from "@/types/database";

type RouteParams = { params: Promise<{ token: string }> };

const completeSchema = z.object({
  phone: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  city: z.string().optional(),
  churchId: z.string().uuid().optional(),
  churchNameCustom: z.string().optional(),
  dateOfBirth: z.string().optional(),
  attendanceType: z.enum(["full_conference", "partial", "kote"]).optional(),
  isStayingInMotel: z.boolean().optional(),
  numDays: z.number().int().min(1).optional(),
});

// GET /api/registration/complete/[token] — fetch draft/invited registration by completion token
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    const { data: reg, error } = await supabase
      .from("registrations")
      .select("*, events(*, pricing_config(*))")
      .eq("completion_token", token)
      .in("status", ["draft", "invited"])
      .single();

    if (error || !reg) {
      return NextResponse.json(
        { error: "Registration not found or already completed" },
        { status: 404 }
      );
    }

    // Check token expiry
    if (reg.prefill_token_expires_at && new Date(reg.prefill_token_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation link has expired. Please contact the admin for a new link." },
        { status: 410 }
      );
    }

    return NextResponse.json({
      registration: reg,
      event: reg.events,
    });
  } catch (error) {
    console.error("Fetch completion registration error:", error);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}

// POST /api/registration/complete/[token] — complete a draft/invited registration
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch the registration with event + pricing
    const { data: reg, error: fetchError } = await supabase
      .from("registrations")
      .select("*, events(*, pricing_config(*))")
      .eq("completion_token", token)
      .in("status", ["draft", "invited"])
      .single();

    if (fetchError || !reg) {
      return NextResponse.json(
        { error: "Registration not found or already completed" },
        { status: 404 }
      );
    }

    // Check token expiry
    if (reg.prefill_token_expires_at && new Date(reg.prefill_token_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation link has expired." },
        { status: 410 }
      );
    }

    const v = parsed.data;
    const event = reg.events as unknown as Event & { pricing_config: PricingConfig[] };
    const pricing = Array.isArray(event.pricing_config) ? event.pricing_config[0] : event.pricing_config;

    // Determine final values (user input overrides admin pre-fill where provided)
    const dateOfBirth = v.dateOfBirth || reg.date_of_birth;
    const attendanceType = v.attendanceType || reg.attendance_type;
    const isFullDuration = attendanceType === "full_conference";
    const isStayingInMotel = v.isStayingInMotel ?? reg.is_staying_in_motel ?? false;
    const numDays = v.numDays ?? reg.num_days;

    // Recompute pricing with actual user data
    let computedAmount = 0;
    let ageAtEvent = reg.age_at_event;
    let category = reg.category;
    let explanationCode = reg.explanation_code;
    let explanationDetail = reg.explanation_detail;
    let accessTier = reg.access_tier;

    if (pricing) {
      const pricingResult = computePricing(
        {
          dateOfBirth,
          isFullDuration,
          isStayingInMotel,
          numDays: numDays ?? undefined,
          attendanceType: attendanceType as "full_conference" | "partial" | "kote",
        },
        event,
        pricing
      );

      computedAmount = pricingResult.amount;
      ageAtEvent = pricingResult.ageAtEvent;
      category = pricingResult.category;
      explanationCode = pricingResult.explanationCode;
      explanationDetail = pricingResult.explanationDetail;
      accessTier = attendanceType === "kote" ? "KOTE_ACCESS" : "FULL_ACCESS";
    }

    // Build update payload
    const updates: Record<string, unknown> = {
      status: computedAmount === 0 ? "confirmed" : "pending",
      confirmed_at: computedAmount === 0 ? new Date().toISOString() : null,
      completion_token: null, // Consume the token
      date_of_birth: dateOfBirth,
      age_at_event: ageAtEvent,
      category,
      attendance_type: attendanceType,
      is_full_duration: isFullDuration,
      is_staying_in_motel: isStayingInMotel,
      num_days: numDays,
      computed_amount: computedAmount,
      explanation_code: explanationCode,
      explanation_detail: explanationDetail,
      access_tier: accessTier,
    };

    if (v.phone) updates.phone = v.phone;
    if (v.gender) updates.gender = v.gender;
    if (v.city) updates.city = v.city;
    if (v.churchId) {
      updates.church_id = v.churchId;
      updates.church_name_custom = null;
    } else if (v.churchNameCustom) {
      updates.church_name_custom = v.churchNameCustom;
      updates.church_id = null;
    }

    // Update the registration
    const { data: updated, error: updateError } = await supabase
      .from("registrations")
      .update(updates)
      .eq("id", reg.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ registration: updated });
  } catch (error) {
    console.error("Complete registration error:", error);
    return NextResponse.json({ error: "Failed to complete registration" }, { status: 500 });
  }
}
