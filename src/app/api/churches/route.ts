import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Church } from "@/types/database";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("churches")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<Church[]>();

    if (error) {
      return NextResponse.json({ error: "Failed to fetch churches" }, { status: 500 });
    }

    return NextResponse.json({ churches: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
