import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const eventId = searchParams.get("eventId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("registrations")
      .select("*, events(name), payments(*)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventId) query = query.eq("event_id", eventId);
    if (status) query = query.eq("status", status);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Normalize: ensure payments is always an array for each registration
    const normalized = (data || []).map((reg: Record<string, unknown>) => ({
      ...reg,
      payments: Array.isArray(reg.payments)
        ? reg.payments
        : reg.payments
        ? [reg.payments]
        : [],
    }));

    return NextResponse.json({
      registrations: normalized,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error("Fetch registrations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch registrations" },
      { status: 500 }
    );
  }
}
