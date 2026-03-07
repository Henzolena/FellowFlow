import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail } from "@/lib/email/resend";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resendConfirmationSchema } from "@/lib/validations/api";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`resend-confirm:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  try {
    const body = await request.json();
    const parsed = resendConfirmationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { registrationId, email } = parsed.data;

    const supabase = createAdminClient();

    // Verify the email matches the registration (prevents abuse)
    const { data, error } = await supabase
      .from("registrations")
      .select(
        "id, first_name, last_name, email, computed_amount, explanation_detail, status, " +
        "category, attendance_type, public_confirmation_code, gender, city, church_id, church_name_custom, " +
        "events(name, start_date, end_date)"
      )
      .eq("id", registrationId)
      .single<Record<string, unknown>>();

    if (error || !data) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    // Email must match (case-insensitive)
    if ((data.email as string).toLowerCase().trim() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const evtData = data.events as unknown as { name: string; start_date: string; end_date: string } | null;
    const amount = Number(data.computed_amount);

    // Resolve church name
    let churchName: string | null = data.church_name_custom as string | null;
    if (!churchName && data.church_id) {
      const { data: ch } = await supabase.from("churches").select("name").eq("id", data.church_id).single();
      churchName = ch?.name || null;
    }

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
      gender: data.gender as string | null,
      city: data.city as string | null,
      churchName,
    });

    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
