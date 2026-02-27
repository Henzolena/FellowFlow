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
import { Printer, Mail, Loader2, Search, ArrowLeft } from "lucide-react";
import type { ExplanationCode } from "@/types/database";
import Link from "next/link";

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
  const searchParams = useSearchParams();
  const autoLastName = searchParams.get("ln");

  const [lastName, setLastName] = useState(autoLastName || "");
  const [registration, setRegistration] = useState<any>(null);
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
              <CardTitle className="text-xl">View Your Receipt</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter your last name to verify your identity.
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
                  <Label htmlFor="confirmationId">Confirmation ID</Label>
                  <Input
                    id="confirmationId"
                    value={confirmationId}
                    disabled
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Enter your last name"
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
                  View Receipt
                </Button>
                <Link href="/register/receipt" className="block">
                  <Button variant="ghost" className="w-full text-sm" type="button">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Look up a different registration
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

  return (
    <div className="min-h-screen py-12 px-4 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="mx-auto max-w-lg relative">
        <Card className="shadow-brand-md print:shadow-none" id="receipt-card">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl">Registration Receipt</CardTitle>
            {eventData && (
              <p className="text-sm text-muted-foreground">{eventData.name}</p>
            )}
            <Badge
              variant={data.status === "confirmed" ? "default" : "secondary"}
              className="mx-auto"
            >
              {data.status.toUpperCase()}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Confirmation ID
              </h3>
              <p className="font-mono text-sm break-all">{data.id}</p>
            </div>

            <Separator />

            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Attendee
              </h3>
              <p className="font-medium">
                {data.first_name} {data.last_name}
              </p>
              <p className="text-sm text-muted-foreground">{data.email}</p>
              {data.phone && (
                <p className="text-sm text-muted-foreground">{data.phone}</p>
              )}
            </div>

            <Separator />

            {eventData && (
              <>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Event Details
                  </h3>
                  <p className="text-sm">
                    {format(parseISO(eventData.start_date), "MMM d, yyyy")} —{" "}
                    {format(parseISO(eventData.end_date), "MMM d, yyyy")}
                  </p>
                  <p className="text-sm">
                    {data.is_full_duration
                      ? `Full Conference (${eventData.duration_days} days)`
                      : `${data.num_days} Day(s)`}
                  </p>
                  <p className="text-sm capitalize">Category: {data.category}</p>
                </div>

                <Separator />
              </>
            )}

            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pricing
              </h3>
              <p className="text-sm">
                {getExplanationLabel(data.explanation_code as ExplanationCode)}
              </p>
              {data.explanation_detail && (
                <p className="text-xs text-muted-foreground">
                  {data.explanation_detail}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-muted/60 p-5 text-center">
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="text-3xl font-bold text-brand-amber-foreground">
                {Number(data.computed_amount) === 0
                  ? "FREE"
                  : `$${Number(data.computed_amount).toFixed(2)}`}
              </p>
              {payment && (
                <p className="text-xs text-muted-foreground mt-1">
                  Payment: {payment.status} via Stripe
                </p>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Registered on{" "}
              {format(parseISO(data.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>

            {/* Actions — hidden when printing */}
            <div className="flex flex-col gap-3 pt-2 print:hidden">
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print / Download
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
                  {emailSent ? "Email Sent!" : "Email Receipt"}
                </Button>
              </div>
              {emailSent && (
                <p className="text-xs text-center text-muted-foreground">
                  Receipt sent to {data.email}
                </p>
              )}
              <Link href="/">
                <Button variant="ghost" className="w-full">
                  Back to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
