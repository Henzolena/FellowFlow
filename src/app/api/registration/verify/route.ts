import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

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
      .select(
        "id, first_name, last_name, email, phone, date_of_birth, age_at_event, category, " +
        "is_full_duration, is_staying_in_motel, num_days, computed_amount, explanation_code, " +
        "explanation_detail, status, confirmed_at, created_at, " +
        "events(name, start_date, end_date, duration_days), payments(*)"
      )
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

    return NextResponse.json({ registration: data });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
