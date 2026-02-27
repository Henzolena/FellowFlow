import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("registrations")
      .select("*, events(name, start_date, end_date, duration_days), payments(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Normalize: ensure payments is always an array
    const normalized = {
      ...data,
      payments: Array.isArray(data.payments)
        ? data.payments
        : data.payments
        ? [data.payments]
        : [],
    };

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Fetch registration error:", error);
    return NextResponse.json(
      { error: "Failed to fetch registration" },
      { status: 500 }
    );
  }
}
