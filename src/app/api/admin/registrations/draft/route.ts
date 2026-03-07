import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { sendPrefillInvitationEmail } from "@/lib/email/resend";

const PREFILL_TOKEN_EXPIRY_DAYS = 7;

const draftSchema = z.object({
  eventId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  city: z.string().optional(),
  churchId: z.string().uuid().optional(),
  churchNameCustom: z.string().optional(),
  attendanceType: z.enum(["full_conference", "partial", "kote"]).default("full_conference"),
  notes: z.string().optional(),
  sendEmail: z.boolean().default(false),
});

// POST /api/admin/registrations/draft — create a draft/invited registration
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const v = parsed.data;
    const supabase = await createClient();
    const completionToken = uuidv4();

    // Generate 6-digit invitation code for security
    const invitationCode = String(Math.floor(100000 + Math.random() * 900000));

    // Fetch admin profile for invited_by_admin
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", auth.userId)
      .single();
    const adminIdentity = adminProfile?.full_name || adminProfile?.email || auth.userId;

    // Fetch event for email content
    const { data: event } = await supabase
      .from("events")
      .select("name, start_date, end_date")
      .eq("id", v.eventId)
      .single();

    // Generate public confirmation code
    const { data: codeResult } = await supabase.rpc("generate_public_confirmation_code", {
      p_first_name: v.firstName,
    });
    const publicCode = codeResult || `FF26-${v.firstName.substring(0, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Determine access tier
    const accessTier = v.attendanceType === "kote" ? "KOTE_ACCESS" : "FULL_ACCESS";

    // Token expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PREFILL_TOKEN_EXPIRY_DAYS);

    const status = v.sendEmail ? "invited" : "draft";

    const { data, error } = await supabase
      .from("registrations")
      .insert({
        event_id: v.eventId,
        first_name: v.firstName,
        last_name: v.lastName,
        email: v.email,
        phone: v.phone || null,
        date_of_birth: "1990-01-01",
        age_at_event: 36,
        category: "adult",
        is_full_duration: v.attendanceType === "full_conference",
        attendance_type: v.attendanceType,
        num_days: v.attendanceType === "full_conference" ? null : 1,
        computed_amount: 0,
        explanation_code: "FULL_ADULT",
        status,
        gender: v.gender || null,
        city: v.city || null,
        church_id: v.churchId || null,
        church_name_custom: v.churchNameCustom || null,
        public_confirmation_code: publicCode,
        access_tier: accessTier,
        completion_token: completionToken,
        invitation_code: invitationCode,
        registration_source: "admin_prefill",
        admin_notes: v.notes || null,
        prefill_token_expires_at: expiresAt.toISOString(),
        invited_by_admin: adminIdentity,
      })
      .select()
      .single();

    if (error) throw error;

    // Build completion link
    const completionUrl = `/register/complete/${completionToken}`;

    // Send invitation email if requested
    let emailSent = false;
    if (v.sendEmail && event) {
      try {
        await sendPrefillInvitationEmail({
          to: v.email,
          firstName: v.firstName,
          lastName: v.lastName,
          eventName: event.name,
          eventStartDate: event.start_date,
          eventEndDate: event.end_date,
          attendanceType: v.attendanceType,
          completionUrl,
          invitationCode,
          adminNotes: v.notes,
          expiresAt: expiresAt.toISOString(),
        });
        emailSent = true;
      } catch (emailErr) {
        console.error("Failed to send prefill invitation email:", emailErr);
      }
    }

    return NextResponse.json({
      registration: data,
      completionToken,
      completionUrl,
      invitationCode,
      emailSent,
    }, { status: 201 });
  } catch (error) {
    console.error("Create draft registration error:", error);
    return NextResponse.json({ error: "Failed to create draft registration" }, { status: 500 });
  }
}
