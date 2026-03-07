import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { computePricing } from "@/lib/pricing/engine";
import type { Event, PricingConfig } from "@/types/database";

type RouteParams = { params: Promise<{ token: string }> };

const completeSchema = z.object({
  invitationCode: z.string().min(1, "Invitation code is required"),
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

// Strip sensitive fields from registration before returning to client
function sanitizeRegistration(reg: Record<string, unknown>) {
  const { completion_token, invitation_code, ...safe } = reg;
  return safe;
}

// GET /api/registration/complete/[token]?code=XXXXXX — fetch draft/invited registration
// Uses admin client to bypass RLS (public endpoint for unauthenticated users)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    const supabase = createAdminClient();

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

    // If registration has an invitation code, verify it
    if (reg.invitation_code) {
      if (!code) {
        // Return minimal info — enough for the UI to show the code prompt
        return NextResponse.json({
          requiresCode: true,
          registration: {
            first_name: reg.first_name,
            event_name: (reg.events as Record<string, unknown>)?.name || "Event",
          },
        });
      }
      if (code.toUpperCase() !== reg.invitation_code.toUpperCase()) {
        return NextResponse.json(
          { error: "Invalid invitation code", requiresCode: true },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      registration: sanitizeRegistration(reg),
      event: reg.events,
    });
  } catch (error) {
    console.error("Fetch completion registration error:", error);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}

// POST /api/registration/complete/[token] — complete a draft/invited registration
// Uses admin client to bypass RLS (public endpoint for unauthenticated users)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createAdminClient();

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

    // Verify invitation code
    if (reg.invitation_code) {
      if (parsed.data.invitationCode.toUpperCase() !== reg.invitation_code.toUpperCase()) {
        return NextResponse.json(
          { error: "Invalid invitation code" },
          { status: 403 }
        );
      }
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
      invitation_code: null, // Consume the invitation code
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

    return NextResponse.json({ registration: sanitizeRegistration(updated as Record<string, unknown>) });
  } catch (error) {
    console.error("Complete registration error:", error);
    return NextResponse.json({ error: "Failed to complete registration" }, { status: 500 });
  }
}
