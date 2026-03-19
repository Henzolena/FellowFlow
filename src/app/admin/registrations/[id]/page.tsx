"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStatusBadge, getCategoryBadge, getAccessTierBadge, getAttendanceBadge } from "@/lib/badge-colors";
import { formatSelectedDays } from "@/lib/date-utils";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  ArrowLeft,
  User,
  CalendarDays,
  DollarSign,
  CreditCard,
  Shield,
  ScanLine,
  BedDouble,
  Mail,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  UtensilsCrossed,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { getExplanationLabel } from "@/lib/pricing/engine";
import type { ExplanationCode } from "@/types/database";
import Link from "next/link";
import { toast } from "sonner";
import SellMealsDialog from "@/components/admin/sell-meals-dialog";

type PaymentRecord = {
  id: string;
  amount: number;
  status: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
};

type CheckInRecord = {
  id: string;
  checked_in_at: string;
  checked_in_by: string | null;
  wristband_color: string | null;
  access_tier: string | null;
  method: string;
  notes: string | null;
};

type ServiceEntitlementRecord = {
  id: string;
  status: string;
  quantity_allowed: number;
  quantity_used: number;
  service_catalog: {
    id: string;
    service_name: string;
    service_code: string;
    service_category: string;
    meal_type: string | null;
    service_date: string | null;
  };
};

type LodgingRecord = {
  id: string;
  check_in_date: string | null;
  check_out_date: string | null;
  notes: string | null;
  beds: {
    bed_label: string;
    bed_type: string;
    rooms: {
      room_number: string;
      room_type: string;
      motels: { name: string };
    };
  };
};

type EmailLogRecord = {
  id: string;
  email_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type DetailData = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  category: string;
  gender: string | null;
  city: string | null;
  church_id: string | null;
  church_name_custom: string | null;
  church_name_resolved: string | null;
  attendance_type: string;
  public_confirmation_code: string;
  access_tier: string | null;
  group_id: string | null;
  is_full_duration: boolean;
  is_staying_in_motel: boolean | null;
  num_days: number | null;
  selected_days: number[] | null;
  selected_meal_ids: string[] | null;
  tshirt_size: string | null;
  computed_amount: number;
  meal_total: number;
  explanation_code: string;
  explanation_detail: string;
  event_id: string;
  status: string;
  checked_in: boolean;
  checked_in_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  events: { name: string; start_date: string; end_date: string; duration_days: number };
  payments: PaymentRecord[];
  check_ins: CheckInRecord[];
  service_entitlements: ServiceEntitlementRecord[];
  lodging_assignments: LodgingRecord[];
  email_logs: EmailLogRecord[];
};

// Badge colors now come from centralized @/lib/badge-colors

function attendanceLabel(type: string): string {
  switch (type) {
    case "full_conference": return "Full Conference";
    case "partial": return "Partial Attendance";
    case "kote": return "KOTE / Walk-in";
    default: return type;
  }
}

export default function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sellMealsOpen, setSellMealsOpen] = useState(false);

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

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Confirmation code copied");
    setTimeout(() => setCopied(false), 2000);
  }

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

  const isFree = Number(data.computed_amount) === 0;
  const mealTotal = data.meal_total || 0;
  const grandTotal = Number(data.computed_amount) + mealTotal;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
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
        <div className="flex items-center gap-2 shrink-0">
          {data.checked_in && (
            <Badge className="bg-brand-teal/10 text-brand-teal border-brand-teal/20">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Checked In
            </Badge>
          )}
          <Badge className={getStatusBadge(data.status).tw}>
            {getStatusBadge(data.status).label}
          </Badge>
          {data.category && (
            <Badge variant="outline" className={getCategoryBadge(data.category).tw}>
              {getCategoryBadge(data.category).label}
            </Badge>
          )}
          {data.access_tier && (
            <Badge variant="outline" className={getAccessTierBadge(data.access_tier).tw}>
              {getAccessTierBadge(data.access_tier).label}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Confirmation Code Banner ── */}
      <Card className="shadow-brand-sm border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5">
          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Confirmation Code</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-wider sm:tracking-widest font-mono text-primary break-all">
              {data.public_confirmation_code}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyCode(data.public_confirmation_code)}
          >
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Personal Info ── */}
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Row label="Full Name" value={`${data.first_name} ${data.last_name}`} />
            <Row label="Email" value={data.email} />
            <Row label="Phone" value={data.phone || "—"} />
            <Row label="Age Range" value={data.category} capitalize />
            <Row label="Gender" value={data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : "—"} />
            <Row label="City" value={data.city || "—"} />
            <Row label="Church" value={data.church_name_resolved || data.church_name_custom || "—"} />
            {data.group_id && <Row label="Group ID" value={data.group_id} mono />}
          </CardContent>
        </Card>

        {/* ── Attendance & Event ── */}
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Attendance Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Row label="Event" value={data.events?.name || "—"} />
            <Row
              label="Event Dates"
              value={
                data.events
                  ? `${format(parseISO(data.events.start_date), "MMM d")} — ${format(parseISO(data.events.end_date), "MMM d, yyyy")}`
                  : "—"
              }
            />
            <Row label="Attendance Type" value={attendanceLabel(data.attendance_type)} />
            <Row
              label="Duration"
              value={
                data.is_full_duration
                  ? `Full Conference (${data.events?.duration_days} days)`
                  : data.selected_days && data.selected_days.length > 0 && data.events?.start_date
                  ? formatSelectedDays(data.events.start_date, data.selected_days)
                  : `${data.num_days} Day(s)`
              }
            />
            {data.is_full_duration && (
              <Row label="Motel Stay" value={data.is_staying_in_motel ? "Yes" : "No"} />
            )}
            <Row label="Access Tier" value={data.access_tier ? getAccessTierBadge(data.access_tier).label : "—"} />
            {data.tshirt_size && <Row label="T-Shirt Size" value={data.tshirt_size} />}
          </CardContent>
        </Card>

        {/* ── Pricing ── */}
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Pricing Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Row label="Rule" value={getExplanationLabel(data.explanation_code as ExplanationCode)} />
            <Row label="Explanation" value={data.explanation_detail || "—"} />
            <Separator className="my-2" />
            <Row label="Registration Fee" value={isFree ? "FREE" : `$${Number(data.computed_amount).toFixed(2)}`} />
            {mealTotal > 0 && (
              <>
                <Row label="Meal Charges" value={`$${mealTotal.toFixed(2)}`} />
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-lg px-3 py-2 text-xs">
                  <UtensilsCrossed className="h-3.5 w-3.5" />
                  <span className="font-medium">{data.selected_meal_ids?.length || 0} meal(s) × ${(mealTotal / (data.selected_meal_ids?.length || 1)).toFixed(2)} each</span>
                </div>
              </>
            )}
            <Separator className="my-2" />
            <div className="text-center pt-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Total Amount</p>
              <p className={`text-3xl font-bold ${grandTotal === 0 ? "text-green-600" : "text-primary"}`}>
                {grandTotal === 0 ? "FREE" : `$${grandTotal.toFixed(2)}`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Payment ── */}
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2">
                {isFree ? "Free registration — no payment required" : "No payment record found"}
              </p>
            ) : (
              data.payments.map((p) => (
                <div key={p.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">${Number(p.amount).toFixed(2)}</span>
                    <Badge variant={p.status === "completed" ? "default" : "secondary"} className="text-xs capitalize">
                      {p.status}
                    </Badge>
                  </div>
                  {p.stripe_payment_intent_id && (
                    <Row label="Payment Intent" value={p.stripe_payment_intent_id} mono />
                  )}
                  <Row label="Created" value={format(parseISO(p.created_at), "MMM d, yyyy h:mm a")} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Check-In ── */}
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" />
              Check-In Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.checked_in && data.checked_in_at ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-semibold">Checked In</span>
                </div>
                <Row label="Time" value={format(parseISO(data.checked_in_at), "MMM d, yyyy h:mm a")} />
                {data.check_ins.length > 0 && (
                  <>
                    <Row label="Method" value={data.check_ins[0].method?.replace("_", " ") || "—"} capitalize />
                    {data.check_ins[0].wristband_color && (
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">Wristband</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <span
                            className="inline-block h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: data.check_ins[0].wristband_color }}
                          />
                          {data.check_ins[0].wristband_color}
                        </span>
                      </div>
                    )}
                    {data.check_ins[0].access_tier && (
                      <Row label="Access Tier" value={data.check_ins[0].access_tier} />
                    )}
                    {data.check_ins[0].notes && (
                      <Row label="Notes" value={data.check_ins[0].notes} />
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">Not checked in yet</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Lodging ── */}
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-primary" />
              Lodging Assignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.lodging_assignments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2">No lodging assigned</p>
            ) : (
              data.lodging_assignments.map((l) => (
                <div key={l.id} className="space-y-2 rounded-lg border p-3">
                  <Row label="Motel" value={l.beds?.rooms?.motels?.name || "—"} />
                  <Row label="Room" value={`${l.beds?.rooms?.room_number || "—"} (${l.beds?.rooms?.room_type || "—"})`} />
                  <Row label="Bed" value={`${l.beds?.bed_label || "—"} (${l.beds?.bed_type?.replace("_", " ") || "—"})`} />
                  {l.check_in_date && <Row label="Check-in" value={format(parseISO(l.check_in_date), "MMM d, yyyy")} />}
                  {l.check_out_date && <Row label="Check-out" value={format(parseISO(l.check_out_date), "MMM d, yyyy")} />}
                  {l.notes && <Row label="Notes" value={l.notes} />}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Service Entitlements ── */}
      <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Service Entitlements ({data.service_entitlements.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setSellMealsOpen(true)}
              >
                <UtensilsCrossed className="h-3.5 w-3.5" />
                Sell Meals
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.service_entitlements.map((e) => {
                const sc = e.service_catalog;
                const isUsed = e.quantity_used >= e.quantity_allowed;
                return (
                  <div
                    key={e.id}
                    className={`rounded-lg border p-3 text-sm ${isUsed ? "bg-muted/50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold truncate">{sc.service_name}</span>
                      <Badge
                        variant={e.status === "allowed" ? "default" : "secondary"}
                        className="text-[10px] capitalize shrink-0"
                      >
                        {e.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>{sc.service_category.replace("_", " ")} {sc.meal_type ? `· ${sc.meal_type}` : ""}</p>
                      {sc.service_date && <p>{format(parseISO(sc.service_date), "MMM d, yyyy")}</p>}
                      <p className="font-medium text-foreground">
                        Used: {e.quantity_used}/{e.quantity_allowed}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      {/* ── Sell Meals Dialog ── */}
      <SellMealsDialog
        open={sellMealsOpen}
        onOpenChange={setSellMealsOpen}
        registrationId={data.id}
        eventId={data.event_id}
        category={data.category}
        registrantName={`${data.first_name} ${data.last_name}`}
        existingEntitlements={data.service_entitlements.map((e) => ({ service_id: e.service_catalog?.id || "", status: e.status }))}
        onSuccess={() => {
          // Refresh the page data
          fetch(`/api/admin/registrations/${id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setData(d); });
        }}
      />

      {/* ── Email Logs ── */}
      {data.email_logs.length > 0 && (
        <Card className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Email History ({data.email_logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.email_logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize truncate">
                      {log.email_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(log.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                    {log.error_message && (
                      <p className="text-xs text-red-500 truncate">{log.error_message}</p>
                    )}
                  </div>
                  <Badge
                    variant={log.status === "sent" ? "default" : "destructive"}
                    className="text-[10px] shrink-0 capitalize"
                  >
                    {log.status === "sent" ? (
                      <><CheckCircle2 className="mr-1 h-2.5 w-2.5" />{log.status}</>
                    ) : (
                      <><XCircle className="mr-1 h-2.5 w-2.5" />{log.status}</>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Audit Footer ── */}
      <Card className="shadow-brand-sm">
        <CardContent className="flex flex-wrap gap-4 sm:gap-6 p-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            ID: <code className="text-[11px] break-all">{data.id}</code>
          </span>
          <span>Created: {format(parseISO(data.created_at), "MMM d, yyyy h:mm a")}</span>
          {data.confirmed_at && (
            <span>Confirmed: {format(parseISO(data.confirmed_at), "MMM d, yyyy h:mm a")}</span>
          )}
          {data.checked_in_at && (
            <span>Checked in: {format(parseISO(data.checked_in_at), "MMM d, yyyy h:mm a")}</span>
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
        className={`font-medium text-right break-words ${capitalize ? "capitalize" : ""} ${mono ? "font-mono text-xs break-all whitespace-normal text-right" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
