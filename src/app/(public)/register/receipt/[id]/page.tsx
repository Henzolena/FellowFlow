"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { getExplanationLabel } from "@/lib/pricing/engine";
import { format, parseISO } from "date-fns";
import { Printer, Mail, Loader2, Search, ArrowLeft, QrCode } from "lucide-react";
import type { ExplanationCode } from "@/types/database";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/context";
import { QRCodeDisplay } from "@/components/registration/qr-code";
import { formatSelectedDays } from "@/lib/date-utils";
import {
  getCategoryBadge,
  getAccessTierBadge,
  getStatusBadge,
  getAttendanceBadge,
} from "@/lib/badge-colors";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string>("");

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ReceiptContent confirmationId={id} />
    </Suspense>
  );
}

function ReceiptContent({ confirmationId }: { confirmationId: string }) {
  const { dict } = useTranslation();
  const searchParams = useSearchParams();
  const autoLastName = searchParams.get("ln");

  const [lastName, setLastName] = useState(autoLastName || "");
  const [registration, setRegistration] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[] | null>(null);
  const [groupPricing, setGroupPricing] = useState<{
    subtotal: number; surcharge: number; surchargeLabel: string | null; grandTotal: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function verify(lastNameValue: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationId,
          lastName: lastNameValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        setLoading(false);
        return;
      }
      setRegistration(data.registration);
      if (data.groupMembers) setGroupMembers(data.groupMembers);
      if (data.groupPricing) setGroupPricing(data.groupPricing);
      setVerified(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-verify if last name was passed from success page
  useEffect(() => {
    if (autoLastName && !verified && !loading) {
      verify(autoLastName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLastName]);

  async function handleSendEmail() {
    setEmailSending(true);
    setEmailSent(false);
    try {
      const res = await fetch("/api/registration/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId, lastName }),
      });
      if (res.ok) {
        setEmailSent(true);
      }
    } catch {
      // silent
    } finally {
      setEmailSending(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  // Verification form
  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <div className="w-full max-w-sm relative">
          <Card className="shadow-brand-md">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-xl">{dict.receipt.viewYourReceipt}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {dict.receipt.verifyIdentity}
              </p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (lastName.trim()) verify(lastName);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="confirmationId">{dict.receipt.confirmationIdLabel}</Label>
                  <Input
                    id="confirmationId"
                    value={confirmationId}
                    disabled
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{dict.receipt.lastNameLabel}</Label>
                  <Input
                    id="lastName"
                    placeholder={dict.receipt.lastNamePlaceholder}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading || !lastName.trim()}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  {dict.common.viewReceipt}
                </Button>
                <Link href="/register/receipt" className="block">
                  <Button variant="ghost" className="w-full text-sm" type="button">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {dict.receipt.lookUpDifferent}
                  </Button>
                </Link>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Receipt display
  const data = registration;
  const eventData = data.events;
  const payments = Array.isArray(data.payments) ? data.payments : data.payments ? [data.payments] : [];
  const payment = payments[0] || null;

  const isGroup = !!groupMembers && groupMembers.length > 1;

  return (
    <div className="min-h-screen py-12 px-4 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="mx-auto max-w-lg relative">
        <Card className="shadow-brand-md print:shadow-none" id="receipt-card">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl">
              {isGroup ? dict.receipt.groupReceiptTitle : dict.receipt.soloReceiptTitle}
            </CardTitle>
            {eventData && (
              <p className="text-sm text-muted-foreground">{eventData.name}</p>
            )}
            <Badge
              variant="outline"
              className={`mx-auto ${getStatusBadge(data.status).tw}`}
            >
              {getStatusBadge(data.status).label}
            </Badge>
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              {data.category && (
                <Badge variant="outline" className={getAccessTierBadge(data.access_tier).tw}>
                  {getAccessTierBadge(data.access_tier).label}
                </Badge>
              )}
              {data.category && (
                <Badge variant="outline" className={getCategoryBadge(data.category).tw}>
                  {getCategoryBadge(data.category).label}
                </Badge>
              )}
              {data.attendance_type && (
                <Badge variant="outline" className={getAttendanceBadge(data.attendance_type).tw}>
                  {getAttendanceBadge(data.attendance_type).label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Confirmation Code + QR */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {dict.receipt.confirmationIdLabel}
                </h3>
                {data.public_confirmation_code && (
                  <p className="font-mono text-base sm:text-lg font-bold text-foreground break-all">
                    {data.public_confirmation_code}
                  </p>
                )}
                <p className="font-mono text-[10px] text-muted-foreground break-all">{data.id}</p>
              </div>
              {data.public_confirmation_code && (
                <div className="flex-shrink-0">
                  <QRCodeDisplay
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/register/receipt/${data.public_confirmation_code}?ln=${encodeURIComponent(data.last_name)}`}
                    size={100}
                    className="rounded-md"
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Contact info */}
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {dict.common.contact}
              </h3>
              <p className="text-sm text-muted-foreground">{data.email}</p>
              {data.phone && (
                <p className="text-sm text-muted-foreground">{data.phone}</p>
              )}
            </div>

            <Separator />

            {/* Event Details */}
            {eventData && (
              <>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dict.common.event}
                  </h3>
                  <p className="text-sm font-medium">{eventData.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(eventData.start_date), "MMM d, yyyy")} —{" "}
                    {format(parseISO(eventData.end_date), "MMM d, yyyy")}
                  </p>
                </div>
                <Separator />
              </>
            )}

            {/* ─── Group: all registrants ─── */}
            {isGroup && groupMembers ? (
              <>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dict.common.registrants} ({groupMembers.length})
                  </h3>
                </div>
                <div className="space-y-3">
                  {groupMembers.map((member: any) => {
                    const laRaw = member.lodging_assignments;
                    const la = Array.isArray(laRaw) ? laRaw[0] : laRaw;
                    const dormName = la?.beds?.rooms?.motels?.name;
                    const bedLbl = la?.beds?.bed_label;
                    return (
                    <div
                      key={member.id}
                      className="rounded-lg bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {member.first_name} {member.last_name}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${getCategoryBadge(member.category).tw}`}>
                            {getCategoryBadge(member.category).label}
                          </span>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAttendanceBadge(member.attendance_type).tw}`}>
                            {member.is_full_duration
                              ? dict.common.fullConference
                              : member.selected_days && eventData?.start_date
                              ? formatSelectedDays(eventData.start_date, member.selected_days)
                              : `${member.num_days} ${dict.wizard.nDays}`}
                          </span>
                        </div>
                        {dormName && (
                          <p className="text-xs text-teal-600">
                            🏠 {dormName}{bedLbl ? ` · ${bedLbl}` : ""}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-semibold">
                        {Number(member.computed_amount) === 0
                          ? dict.common.free
                          : `$${Number(member.computed_amount).toFixed(2)}`}
                      </p>
                    </div>
                    );
                  })}
                </div>

                {/* Group pricing summary */}
                {groupPricing && (
                  <div className="rounded-xl bg-muted/60 p-5 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{dict.common.subtotal}</span>
                      <span>${groupPricing.subtotal.toFixed(2)}</span>
                    </div>
                    {groupPricing.surcharge > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {groupPricing.surchargeLabel || dict.common.lateSurcharge}
                        </span>
                        <span className="text-amber-600">
                          +${groupPricing.surcharge.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-muted-foreground">
                        {dict.common.totalPaid}
                      </span>
                      <span className="text-2xl font-bold text-brand-amber-foreground">
                        {groupPricing.grandTotal === 0
                          ? dict.common.free
                          : `$${groupPricing.grandTotal.toFixed(2)}`}
                      </span>
                    </div>
                    {payment && (
                      <p className="text-xs text-muted-foreground text-center">
                        Payment: {payment.status} via Stripe
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* ─── Solo: single registrant ─── */}
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dict.common.attendee}
                  </h3>
                  <p className="font-medium">
                    {data.first_name} {data.last_name}
                  </p>
                  <p className="text-sm capitalize">{dict.common.category}: {data.category}</p>
                  <p className="text-sm">
                    {data.is_full_duration
                      ? eventData
                        ? `${dict.common.fullConference} (${eventData.duration_days} ${dict.common.days})`
                        : dict.common.fullConference
                      : data.selected_days && eventData?.start_date
                      ? formatSelectedDays(eventData.start_date, data.selected_days)
                      : `${data.num_days} ${dict.wizard.nDays}`}
                  </p>
                </div>

                {/* Lodging Assignment */}
                {(() => {
                  const laRaw = data.lodging_assignments;
                  const la = Array.isArray(laRaw) ? laRaw[0] : laRaw;
                  const dormName = la?.beds?.rooms?.motels?.name;
                  const bedLbl = la?.beds?.bed_label;
                  if (!dormName) return null;
                  return (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Lodging Assignment
                        </h3>
                        <p className="text-sm font-medium text-teal-700">🏠 {dormName}</p>
                        {bedLbl && <p className="text-sm text-muted-foreground">{bedLbl}</p>}
                      </div>
                    </>
                  );
                })()}

                <Separator />

                <div className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dict.common.pricing}
                  </h3>
                  <p className="text-sm">
                    {getExplanationLabel(data.explanation_code as ExplanationCode)}
                  </p>
                  {data.explanation_detail && (
                    <p className="text-xs text-muted-foreground">
                      {data.selected_days && data.selected_days.length > 0 && eventData?.start_date
                        ? data.explanation_detail.replace(
                            /\d+ day\(s\)/i,
                            formatSelectedDays(eventData.start_date, data.selected_days)
                          )
                        : data.explanation_detail}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-muted/60 p-5 text-center">
                  <p className="text-sm text-muted-foreground">{dict.common.amountPaid}</p>
                  <p className="text-3xl font-bold text-brand-amber-foreground">
                    {Number(data.computed_amount) === 0
                      ? dict.common.free
                      : `$${Number(data.computed_amount).toFixed(2)}`}
                  </p>
                  {payment && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Payment: {payment.status} via Stripe
                    </p>
                  )}
                </div>
              </>
            )}

            <p className="text-xs text-center text-muted-foreground">
              {dict.common.registeredOn}{" "}
              {format(parseISO(data.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>

            {/* Actions — hidden when printing */}
            <div className="flex flex-col gap-3 pt-2 print:hidden">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="flex-1" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  {dict.receipt.printDownload}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendEmail}
                  disabled={emailSending || emailSent}
                >
                  {emailSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {emailSent ? dict.receipt.emailSent : dict.receipt.emailReceipt}
                </Button>
              </div>
              {emailSent && (
                <p className="text-xs text-center text-muted-foreground">
                  {dict.receipt.receiptSentTo.replace("{email}", data.email)}
                </p>
              )}
              <Link href="/">
                <Button variant="ghost" className="w-full">
                  {dict.common.backToHome}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
