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
      .select("id, first_name, last_name, email, computed_amount, explanation_detail, status, events(name)")
      .eq("id", registrationId)
      .single<Record<string, unknown>>();

    if (error || !data) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    // Email must match (case-insensitive)
    if ((data.email as string).toLowerCase().trim() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const evtData = data.events as unknown as { name: string } | null;
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
