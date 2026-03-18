import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const authSchema = z.object({
  eventId: z.string().uuid(),
  pin: z.string().min(1).max(20),
});

/**
 * POST /api/staff/auth
 * Validates a staff PIN code and returns the associated role.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const v = authSchema.parse(body);

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("staff_access_codes")
      .select("id, role, label")
      .eq("event_id", v.eventId)
      .eq("pin_code", v.pin)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Staff auth query error:", error);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
    }

    return NextResponse.json({
      role: data.role,
      label: data.label,
      accessId: data.id,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Staff auth error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
