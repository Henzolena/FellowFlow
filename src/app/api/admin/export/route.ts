import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin-guard";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");

    let query = supabase
      .from("registrations")
      .select("*, events(name), payments(amount, status, stripe_payment_intent_id)")
      .order("created_at", { ascending: false });

    const status = searchParams.get("status");
    if (eventId) query = query.eq("event_id", eventId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    // Build CSV
    const headers = [
      "ID",
      "Event",
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "DOB",
      "Age",
      "Category",
      "Full Duration",
      "Motel Stay",
      "Days",
      "Amount",
      "Explanation",
      "Status",
      "Payment Status",
      "Payment Intent",
      "Registered At",
    ];

    const rows = (data || []).map((r: Record<string, unknown>) => {
      const events = r.events as { name: string } | null;
      const rawPayments = r.payments as Array<{ amount: number; status: string; stripe_payment_intent_id: string | null }> | { amount: number; status: string; stripe_payment_intent_id: string | null } | null;
      const payment = Array.isArray(rawPayments) ? rawPayments[0] : rawPayments;
      return [
        r.id,
        events?.name || "",
        r.first_name,
        r.last_name,
        r.email,
        r.phone || "",
        r.date_of_birth,
        r.age_at_event,
        r.category,
        r.is_full_duration ? "Yes" : "No",
        r.is_staying_in_motel === true ? "Yes" : r.is_staying_in_motel === false ? "No" : "N/A",
        r.num_days || "N/A",
        `$${Number(r.computed_amount).toFixed(2)}`,
        r.explanation_code,
        r.status,
        payment?.status || "N/A",
        payment?.stripe_payment_intent_id || "N/A",
        r.created_at,
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map((row: unknown[]) =>
        row.map((cell: unknown) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=registrations-${new Date().toISOString().split("T")[0]}.csv`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
