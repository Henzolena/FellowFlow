import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const updateMotelSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  is_active: z.boolean().optional(),
});

// PATCH /api/admin/motels/[motelId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ motelId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { motelId } = await params;
    const body = await request.json();
    const parsed = updateMotelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("motels")
      .update(parsed.data)
      .eq("id", motelId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Update motel error:", error);
    return NextResponse.json({ error: "Failed to update motel" }, { status: 500 });
  }
}

// DELETE /api/admin/motels/[motelId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ motelId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { motelId } = await params;
    const supabase = await createClient();
    const { error } = await supabase.from("motels").delete().eq("id", motelId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete motel error:", error);
    return NextResponse.json({ error: "Failed to delete motel" }, { status: 500 });
  }
}
