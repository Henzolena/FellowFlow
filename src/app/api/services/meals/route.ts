import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/services/meals?eventId=...
 * Public endpoint: returns active meal services for an event.
 * Used by the registration wizard to let KOTE users select meals.
 */
export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("service_catalog")
      .select("id, service_name, service_code, service_category, meal_type, service_date, start_time, end_time, display_order")
      .eq("event_id", eventId)
      .eq("service_category", "meal")
      .eq("is_active", true)
      .order("service_date", { ascending: true, nullsFirst: false })
      .order("display_order", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ meals: data || [] });
  } catch (error) {
    console.error("Fetch meals error:", error);
    return NextResponse.json({ error: "Failed to fetch meals" }, { status: 500 });
  }
}
