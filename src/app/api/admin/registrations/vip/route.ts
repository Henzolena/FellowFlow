import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";
import { generateEntitlements } from "@/lib/services/entitlement-generator";
import { sendConfirmationEmail } from "@/lib/email/resend";
import { createLogger } from "@/lib/logger";

const vipSchema = z.object({
  eventId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  city: z.string().optional(),
  churchId: z.string().uuid().optional(),
  churchNameCustom: z.string().optional(),
  notes: z.string().optional(),
  sendEmail: z.boolean().default(true),
});

// POST /api/admin/registrations/vip — create a confirmed VIP registration (no payment)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = vipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const v = parsed.data;
    const supabase = await createClient();

    // Fetch admin profile
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", auth.userId)
      .single();
    const adminIdentity = adminProfile?.full_name || adminProfile?.email || auth.userId;

    // Fetch event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", v.eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Generate public confirmation code
    const { data: codeResult } = await supabase.rpc("generate_public_confirmation_code", {
      p_first_name: v.firstName,
    });
    const publicCode = codeResult || `FF26-${v.firstName.substring(0, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Resolve church name for email
    let churchName: string | null = null;
    if (v.churchId) {
      const { data: church } = await supabase.from("churches").select("name").eq("id", v.churchId).single();
      churchName = church?.name || null;
    } else if (v.churchNameCustom) {
      churchName = v.churchNameCustom;
    }

    const now = new Date().toISOString();

    const { data: registration, error: regError } = await supabase
      .from("registrations")
      .insert({
        event_id: v.eventId,
        first_name: v.firstName,
        last_name: v.lastName,
        email: v.email,
        phone: v.phone || null,
        date_of_birth: "1980-01-01",
        age_at_event: 45,
        category: "adult",
        is_full_duration: true,
        attendance_type: "full_conference",
        num_days: null,
        computed_amount: 0,
        explanation_code: "FULL_ADULT",
        explanation_detail: "VIP — payment waived by admin",
        status: "confirmed",
        confirmed_at: now,
        gender: v.gender || null,
        city: v.city || null,
        church_id: v.churchId || null,
        church_name_custom: v.churchNameCustom || null,
        public_confirmation_code: publicCode,
        access_tier: "VIP",
        registration_source: "admin_direct",
        payment_waived: true,
        admin_notes: v.notes || null,
        invited_by_admin: adminIdentity,
      })
      .select()
      .single();

    if (regError) throw regError;

    // Generate entitlements (VIP gets full access to all services)
    const log = createLogger("vip-registration");
    try {
      await generateEntitlements(supabase, registration.id, v.eventId, log);
    } catch (entErr) {
      console.error("VIP entitlement generation failed (non-fatal):", entErr);
    }

    // Send confirmation email
    let emailSent = false;
    if (v.sendEmail) {
      try {
        await sendConfirmationEmail({
          to: v.email,
          firstName: v.firstName,
          lastName: v.lastName,
          eventName: event.name,
          eventStartDate: event.start_date,
          eventEndDate: event.end_date,
          amount: 0,
          isFree: true,
          registrationId: registration.id,
          confirmationCode: publicCode,
          explanationDetail: "VIP — Complimentary Access",
          attendanceType: "full_conference",
          category: "adult",
          gender: v.gender,
          city: v.city,
          churchName,
        });
        emailSent = true;
      } catch (emailErr) {
        console.error("VIP confirmation email failed (non-fatal):", emailErr);
      }
    }

    return NextResponse.json({
      registration,
      emailSent,
    }, { status: 201 });
  } catch (error) {
    console.error("Create VIP registration error:", error);
    return NextResponse.json({ error: "Failed to create VIP registration" }, { status: 500 });
  }
}
