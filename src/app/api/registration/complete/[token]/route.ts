import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

type RouteParams = { params: Promise<{ token: string }> };

const completeSchema = z.object({
  phone: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  city: z.string().optional(),
  churchId: z.string().uuid().optional(),
  churchNameCustom: z.string().optional(),
});

// GET /api/registration/complete/[token] — fetch draft/invited registration by completion token
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    const { data: reg, error } = await supabase
      .from("registrations")
      .select("*, events(*)")
      .eq("completion_token", token)
      .in("status", ["draft", "invited"])
      .single();

    if (error || !reg) {
      return NextResponse.json(
        { error: "Registration not found or already completed" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      registration: reg,
      event: reg.events,
    });
  } catch (error) {
    console.error("Fetch completion registration error:", error);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}

// POST /api/registration/complete/[token] — complete a draft/invited registration
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch the registration
    const { data: reg, error: fetchError } = await supabase
      .from("registrations")
      .select("*, events(*, pricing_config(*))")
      .eq("completion_token", token)
      .in("status", ["draft", "invited"])
      .single();

    if (fetchError || !reg) {
      return NextResponse.json(
        { error: "Registration not found or already completed" },
        { status: 404 }
      );
    }

    // Build update payload
    const updates: Record<string, unknown> = {
      status: "pending",
      completion_token: null, // Consume the token
    };

    if (parsed.data.phone) updates.phone = parsed.data.phone;
    if (parsed.data.gender) updates.gender = parsed.data.gender;
    if (parsed.data.city) updates.city = parsed.data.city;
    if (parsed.data.churchId) {
      updates.church_id = parsed.data.churchId;
      updates.church_name_custom = null;
    } else if (parsed.data.churchNameCustom) {
      updates.church_name_custom = parsed.data.churchNameCustom;
      updates.church_id = null;
    }

    // Update the registration
    const { data: updated, error: updateError } = await supabase
      .from("registrations")
      .update(updates)
      .eq("id", reg.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ registration: updated });
  } catch (error) {
    console.error("Complete registration error:", error);
    return NextResponse.json({ error: "Failed to complete registration" }, { status: 500 });
  }
}
