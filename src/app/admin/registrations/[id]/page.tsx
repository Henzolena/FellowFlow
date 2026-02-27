"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getExplanationLabel } from "@/lib/pricing/engine";
import type { ExplanationCode } from "@/types/database";
import Link from "next/link";

type DetailData = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string;
  age_at_event: number;
  category: string;
  is_full_duration: boolean;
  is_staying_in_motel: boolean | null;
  num_days: number | null;
  computed_amount: number;
  explanation_code: string;
  explanation_detail: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  events: { name: string; start_date: string; end_date: string; duration_days: number };
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    stripe_session_id: string | null;
    stripe_payment_intent_id: string | null;
    created_at: string;
  }>;
};

export default function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/admin/registrations/${id}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // error handled
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Registration not found</p>
        <Link href="/admin/registrations">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Button>
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    confirmed: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    cancelled: "bg-red-100 text-red-700",
    refunded: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Link href="/admin/registrations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold truncate">
            {data.first_name} {data.last_name}
          </h1>
          <p className="text-sm text-muted-foreground truncate">{data.email}</p>
        </div>
        <Badge
          className={`shrink-0 ${statusColors[data.status] || "bg-gray-100 text-gray-700"}`}
        >
          {data.status.toUpperCase()}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Name" value={`${data.first_name} ${data.last_name}`} />
            <Row label="Email" value={data.email} />
            <Row label="Phone" value={data.phone || "—"} />
            <Row label="Date of Birth" value={format(parseISO(data.date_of_birth), "MMM d, yyyy")} />
            <Row label="Age at Event" value={String(data.age_at_event)} />
            <Row label="Category" value={data.category} capitalize />
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Attendance Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Event" value={data.events?.name || "—"} />
            <Row
              label="Event Dates"
              value={
                data.events
                  ? `${format(parseISO(data.events.start_date), "MMM d")} — ${format(parseISO(data.events.end_date), "MMM d, yyyy")}`
                  : "—"
              }
            />
            <Row
              label="Attendance"
              value={data.is_full_duration ? `Full Conference (${data.events?.duration_days} days)` : `${data.num_days} Day(s)`}
            />
            {data.is_full_duration && (
              <Row
                label="Motel Stay"
                value={data.is_staying_in_motel ? "Yes" : "No"}
              />
            )}
          </CardContent>
        </Card>

        {/* Pricing Explanation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pricing Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row
              label="Rule"
              value={getExplanationLabel(data.explanation_code as ExplanationCode)}
            />
            <Row label="Explanation" value={data.explanation_detail || "—"} />
            <Separator />
            <div className="text-center pt-2">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-3xl font-bold text-primary">
                {Number(data.computed_amount) === 0
                  ? "FREE"
                  : `$${Number(data.computed_amount).toFixed(2)}`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {Number(data.computed_amount) === 0
                  ? "Free registration — no payment required"
                  : "No payment record found"}
              </p>
            ) : (
              data.payments.map((p) => (
                <div key={p.id} className="space-y-2 rounded-lg border p-3">
                  <Row label="Status" value={p.status} capitalize />
                  <Row label="Amount" value={`$${Number(p.amount).toFixed(2)}`} />
                  {p.stripe_payment_intent_id && (
                    <Row label="Payment Intent" value={p.stripe_payment_intent_id} mono />
                  )}
                  <Row
                    label="Created"
                    value={format(parseISO(p.created_at), "MMM d, yyyy h:mm a")}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 sm:gap-6 p-4 text-sm text-muted-foreground">
          <span className="break-all">ID: <code className="text-xs">{data.id}</code></span>
          <span>Created: {format(parseISO(data.created_at), "MMM d, yyyy h:mm a")}</span>
          {data.confirmed_at && (
            <span>Confirmed: {format(parseISO(data.confirmed_at), "MMM d, yyyy h:mm a")}</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  capitalize,
  mono,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={`font-medium text-right truncate ${capitalize ? "capitalize" : ""} ${mono ? "font-mono text-xs break-all" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
