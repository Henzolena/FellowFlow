import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const createMotelSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  address: z.string().optional(),
});

// GET /api/admin/motels?eventId=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("motels")
      .select("*, rooms(*, beds(*))")
      .eq("event_id", eventId)
      .order("name");

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Fetch motels error:", error);
    return NextResponse.json({ error: "Failed to fetch motels" }, { status: 500 });
  }
}

// POST /api/admin/motels
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = createMotelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("motels")
      .insert({
        event_id: parsed.data.eventId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        address: parsed.data.address || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Create motel error:", error);
    return NextResponse.json({ error: "Failed to create motel" }, { status: 500 });
  }
}
