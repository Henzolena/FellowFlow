import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const steps: Record<string, unknown> = {};

  // Step 1: Check env vars
  steps.envVars = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasResendKey: !!process.env.RESEND_API_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  };

  // Step 2: Try creating Supabase admin client
  try {
    const supabase = createAdminClient();
    steps.supabaseClient = "OK";

    // Step 3: Try a simple query
    const { data, error } = await supabase
      .from("events")
      .select("id, name")
      .limit(1);

    steps.supabaseQuery = error
      ? { error: error.message, code: error.code, details: error.details }
      : { ok: true, rowCount: data?.length ?? 0 };

    // Step 4: Try querying registrations (same as check-duplicate)
    const { data: regs, error: regError } = await supabase
      .from("registrations")
      .select("id, status, created_at")
      .limit(1);

    steps.registrationQuery = regError
      ? { error: regError.message, code: regError.code, details: regError.details }
      : { ok: true, rowCount: regs?.length ?? 0 };

  } catch (err) {
    steps.supabaseClient = {
      error: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
    };
  }

  return NextResponse.json(steps);
}
