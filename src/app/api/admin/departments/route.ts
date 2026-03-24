import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");

    // If no eventId provided, list all events that have departments
    if (!eventId) {
      const { data: events, error } = await supabase
        .from("events")
        .select("id, name, start_date, end_date, is_active")
        .order("start_date", { ascending: false });

      if (error) throw error;

      // For each event, get department count
      const eventsWithCounts = await Promise.all(
        (events ?? []).map(async (evt) => {
          const { count } = await supabase
            .from("conference_departments")
            .select("id", { count: "exact", head: true })
            .eq("event_id", evt.id);
          return { ...evt, department_count: count ?? 0 };
        })
      );

      // Only return events that have departments
      return NextResponse.json(
        eventsWithCounts.filter((e) => e.department_count > 0)
      );
    }

    // Fetch departments with responsibilities
    const { data: departments, error: deptError } = await supabase
      .from("conference_departments")
      .select(`
        *,
        department_responsibilities(*)
      `)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });

    if (deptError) throw deptError;

    // Sort responsibilities within each department
    const sorted = (departments ?? []).map((d) => ({
      ...d,
      department_responsibilities: (d.department_responsibilities ?? []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          a.sort_order - b.sort_order
      ),
    }));

    // Fetch committee members
    const { data: members, error: memberError } = await supabase
      .from("conference_committee_members")
      .select(`
        *,
        conference_departments(slug, name_en, name_am)
      `)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });

    if (memberError) throw memberError;

    return NextResponse.json({
      departments: sorted,
      committee_members: members ?? [],
    });
  } catch (error) {
    console.error("Fetch departments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch department data" },
      { status: 500 }
    );
  }
}
