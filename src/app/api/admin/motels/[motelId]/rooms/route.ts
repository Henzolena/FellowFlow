import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { z } from "zod";

const createRoomSchema = z.object({
  room_number: z.string().min(1),
  room_type: z.enum(["standard", "double", "suite", "accessible"]).default("standard"),
  capacity: z.number().int().min(1).default(2),
  floor: z.number().int().optional(),
  notes: z.string().optional(),
});

const bulkCreateSchema = z.object({
  prefix: z.string().min(1),
  count: z.number().int().min(1).max(100),
  room_type: z.enum(["standard", "double", "suite", "accessible"]).default("standard"),
  capacity: z.number().int().min(1).default(2),
  floor: z.number().int().optional(),
  bedsPerRoom: z.number().int().min(1).max(20).default(2),
  bed_type: z.enum(["single", "double", "bunk_top", "bunk_bottom", "queen", "king", "floor"]).default("single"),
});

// GET /api/admin/motels/[motelId]/rooms
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ motelId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { motelId } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("*, beds(*)")
      .eq("motel_id", motelId)
      .order("room_number");

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Fetch rooms error:", error);
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
  }
}

// POST /api/admin/motels/[motelId]/rooms
// Supports single room or bulk creation via ?bulk=true
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ motelId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { motelId } = await params;
    const body = await request.json();
    const isBulk = request.nextUrl.searchParams.get("bulk") === "true";
    const supabase = await createClient();

    if (isBulk) {
      const parsed = bulkCreateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
      }
      const { prefix, count, room_type, capacity, floor, bedsPerRoom, bed_type } = parsed.data;

      // Create rooms
      const roomInserts = Array.from({ length: count }, (_, i) => ({
        motel_id: motelId,
        room_number: `${prefix}${String(i + 1).padStart(2, "0")}`,
        room_type,
        capacity,
        floor: floor ?? null,
      }));

      const { data: rooms, error: roomError } = await supabase
        .from("rooms")
        .insert(roomInserts)
        .select();

      if (roomError) throw roomError;

      // Create beds for each room
      const bedInserts = rooms.flatMap((room) =>
        Array.from({ length: bedsPerRoom }, (_, i) => ({
          room_id: room.id,
          bed_label: `Bed ${i + 1}`,
          bed_type,
        }))
      );

      const { error: bedError } = await supabase.from("beds").insert(bedInserts);
      if (bedError) throw bedError;

      // Update motel total_rooms count
      const { data: totalData } = await supabase
        .from("rooms")
        .select("id", { count: "exact" })
        .eq("motel_id", motelId);
      await supabase
        .from("motels")
        .update({ total_rooms: totalData?.length ?? 0 })
        .eq("id", motelId);

      return NextResponse.json({ created: rooms.length, beds: bedInserts.length }, { status: 201 });
    }

    // Single room creation
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({ motel_id: motelId, ...parsed.data, floor: parsed.data.floor ?? null })
      .select()
      .single();

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

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Create room(s) error:", error);
    return NextResponse.json({ error: "Failed to create room(s)" }, { status: 500 });
  }
}
