import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const updateRoomSchema = z.object({
  room_number: z.string().min(1).optional(),
  room_type: z.enum(["standard", "double", "suite", "accessible"]).optional(),
  capacity: z.number().int().min(1).optional(),
  floor: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ motelId: string; roomId: string }> };

// PATCH /api/admin/motels/[motelId]/rooms/[roomId]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { roomId } = await params;
    const body = await request.json();
    const parsed = updateRoomSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rooms")
      .update(parsed.data)
      .eq("id", roomId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Update room error:", error);
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

// DELETE /api/admin/motels/[motelId]/rooms/[roomId]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { motelId, roomId } = await params;
    const supabase = await createClient();
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) throw error;

    // Update motel total_rooms
    const { data: totalData } = await supabase
      .from("rooms")
      .select("id", { count: "exact" })
      .eq("motel_id", motelId);
    await supabase
      .from("motels")
      .update({ total_rooms: totalData?.length ?? 0 })
      .eq("id", motelId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete room error:", error);
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
