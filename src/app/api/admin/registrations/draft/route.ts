import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

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
  status: z.enum(["draft", "invited"]).default("draft"),
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

    // Generate public confirmation code
    const { data: codeResult } = await supabase.rpc("generate_public_confirmation_code", {
      p_first_name: v.firstName,
    });
    const publicCode = codeResult || `FF26-${v.firstName.substring(0, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Determine access tier
    const accessTier = v.attendanceType === "kote" ? "KOTE_ACCESS" : "FULL_ACCESS";

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
        num_days: null,
        computed_amount: 0,
        explanation_code: "FULL_ADULT",
        status: v.status,
        gender: v.gender || null,
        city: v.city || null,
        church_id: v.churchId || null,
        church_name_custom: v.churchNameCustom || null,
        public_confirmation_code: publicCode,
        access_tier: accessTier,
        completion_token: completionToken,
      })
      .select()
      .single();

    if (error) throw error;

    // Build completion link
    const completionUrl = `/register/complete/${completionToken}`;

    return NextResponse.json({
      registration: data,
      completionToken,
      completionUrl,
    }, { status: 201 });
  } catch (error) {
    console.error("Create draft registration error:", error);
    return NextResponse.json({ error: "Failed to create draft registration" }, { status: 500 });
  }
}
