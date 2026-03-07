import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// GET /api/admin/events/[eventId]/images — list images for an event
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { eventId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("event_images")
      .select("*")
      .eq("event_id", eventId)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("List event images error:", error);
    return NextResponse.json({ error: "Failed to list images" }, { status: 500 });
  }
}

// POST /api/admin/events/[eventId]/images — upload an image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { eventId } = await params;
    const supabase = await createClient();

    // Verify event exists
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const imageType = (formData.get("image_type") as string) || "gallery";
    const altText = (formData.get("alt_text") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    if (!["cover", "gallery", "banner"].includes(imageType)) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
    }

    // If setting as cover, demote any existing cover to gallery
    if (imageType === "cover") {
      await supabase
        .from("event_images")
        .update({ image_type: "gallery" })
        .eq("event_id", eventId)
        .eq("image_type", "cover");
    }

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "jpg";
    const storagePath = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("event-images")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("event-images")
      .getPublicUrl(storagePath);

    // Get next display_order
    const { data: maxOrder } = await supabase
      .from("event_images")
      .select("display_order")
      .eq("event_id", eventId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxOrder?.display_order ?? -1) + 1;

    // Insert record
    const { data: imageRecord, error: insertError } = await supabase
      .from("event_images")
      .insert({
        event_id: eventId,
        storage_path: storagePath,
        url: urlData.publicUrl,
        image_type: imageType,
        display_order: nextOrder,
        alt_text: altText,
        file_size: file.size,
        mime_type: file.type,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from("event-images").remove([storagePath]);
      throw insertError;
    }

    return NextResponse.json(imageRecord, { status: 201 });
  } catch (error) {
    console.error("Upload event image error:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
