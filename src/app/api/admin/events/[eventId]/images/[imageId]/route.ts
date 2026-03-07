import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

type RouteParams = { params: Promise<{ eventId: string; imageId: string }> };

// PATCH /api/admin/events/[eventId]/images/[imageId] — update image metadata
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { eventId, imageId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.alt_text !== undefined) updates.alt_text = body.alt_text;
    if (body.display_order !== undefined) updates.display_order = body.display_order;

    if (body.image_type !== undefined) {
      if (!["cover", "gallery", "banner"].includes(body.image_type)) {
        return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
      }

      // If promoting to cover, demote existing cover first
      if (body.image_type === "cover") {
        await supabase
          .from("event_images")
          .update({ image_type: "gallery" })
          .eq("event_id", eventId)
          .eq("image_type", "cover");
      }

      updates.image_type = body.image_type;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("event_images")
      .update(updates)
      .eq("id", imageId)
      .eq("event_id", eventId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Update event image error:", error);
    return NextResponse.json({ error: "Failed to update image" }, { status: 500 });
  }
}

// DELETE /api/admin/events/[eventId]/images/[imageId] — delete an image
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { eventId, imageId } = await params;
    const supabase = await createClient();

    // Get the image record to find storage path
    const { data: image, error: fetchError } = await supabase
      .from("event_images")
      .select("storage_path")
      .eq("id", imageId)
      .eq("event_id", eventId)
      .single();

    if (fetchError || !image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Delete from storage
    await supabase.storage.from("event-images").remove([image.storage_path]);

    // Delete from database
    const { error: deleteError } = await supabase
      .from("event_images")
      .delete()
      .eq("id", imageId)
      .eq("event_id", eventId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete event image error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
