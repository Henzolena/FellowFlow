import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();

    // Get the active event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("is_active", true)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "No active event found" }, { status: 404 });
    }

    // Fetch venue with all related data
    const { data: venues, error: venueError } = await supabase
      .from("venues")
      .select(`
        *,
        venue_facilities(*, order:sort_order),
        venue_rates(*, order:sort_order),
        venue_meal_schedule(*, order:sort_order)
      `)
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    if (venueError) throw venueError;

    return NextResponse.json(venues ?? []);
  } catch (error) {
    console.error("Fetch venues error:", error);
    return NextResponse.json({ error: "Failed to fetch venue information" }, { status: 500 });
  }
}
