import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`dup-check:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { email, eventId } = await request.json();

    if (!email || !eventId) {
      return NextResponse.json({ error: "Missing email or eventId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: registrations, error } = await supabase
      .from("registrations")
      .select(
        "id, status, category, is_full_duration, num_days, computed_amount, explanation_code, created_at, confirmed_at"
      )
      .eq("event_id", eventId)
      .ilike("email", email.trim())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Duplicate check error:", error);
      return NextResponse.json({ error: "Check failed" }, { status: 500 });
    }

    // Only return non-cancelled registrations
    const active = (registrations ?? []).filter(
      (r) => r.status !== "cancelled" && r.status !== "refunded"
    );

    return NextResponse.json({
      hasDuplicates: active.length > 0,
      registrations: active.map((r) => ({
        id: r.id,
        status: r.status,
        category: r.category,
        isFullDuration: r.is_full_duration,
        numDays: r.num_days,
        amount: Number(r.computed_amount),
        explanationCode: r.explanation_code,
        registeredAt: r.created_at,
        confirmedAt: r.confirmed_at,
      })),
    });
  } catch (error) {
    console.error("Duplicate check error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
