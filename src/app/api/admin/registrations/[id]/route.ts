import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const supabase = await createClient();

    const { data: raw, error } = await supabase
      .from("registrations")
      .select(
        "*, " +
        "events(name, start_date, end_date, duration_days), " +
        "payments(*), " +
        "check_ins(*), " +
        "service_entitlements(*, service_catalog(*)), " +
        "lodging_assignments(*, beds(*, rooms(*, motels(name))))"
      )
      .eq("id", id)
      .single<Record<string, unknown>>();

    if (error) throw error;
    if (!raw) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Resolve church name
    let churchName: string | null = raw.church_name_custom as string | null;
    if (!churchName && raw.church_id) {
      const { data: ch } = await supabase
        .from("churches")
        .select("name")
        .eq("id", raw.church_id as string)
        .single();
      churchName = ch?.name || null;
    }

    // Fetch email logs for this registration
    const { data: emailLogs } = await supabase
      .from("email_logs")
      .select("id, email_type, status, error_message, created_at")
      .or(`registration_id.eq.${id},group_id.eq.${raw.group_id || "00000000-0000-0000-0000-000000000000"}`)
      .order("created_at", { ascending: false })
      .limit(20);

    const toArray = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);

    // Compute meal total from selected_meal_ids
    let mealTotal = 0;
    const mealIds = raw.selected_meal_ids as string[] | null;
    if (mealIds && mealIds.length > 0) {
      const { data: pricing } = await supabase
        .from("pricing_config")
        .select("meal_price_adult, meal_price_child")
        .eq("event_id", raw.event_id as string)
        .single();
      if (pricing) {
        const category = raw.category as string;
        const pricePerMeal = category === "child" ? pricing.meal_price_child : pricing.meal_price_adult;
        mealTotal = mealIds.length * pricePerMeal;
      }
    }

    // Normalize arrays
    const normalized = {
      ...raw,
      church_name_resolved: churchName,
      meal_total: mealTotal,
      payments: toArray(raw.payments),
      check_ins: toArray(raw.check_ins),
      service_entitlements: toArray(raw.service_entitlements),
      lodging_assignments: toArray(raw.lodging_assignments),
      email_logs: emailLogs || [],
    };

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Fetch registration error:", error);
    return NextResponse.json(
      { error: "Failed to fetch registration" },
      { status: 500 }
    );
  }
}
