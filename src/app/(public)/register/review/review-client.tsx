"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, CreditCard, AlertCircle, User } from "lucide-react";
import type { Registration } from "@/types/database";

export default function ReviewClient() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ReviewContent />
    </Suspense>
  );
}

function ReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const registrationId = searchParams.get("registration_id");
  const groupId = searchParams.get("group_id");
  const cancelled = searchParams.get("cancelled");

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupPricing, setGroupPricing] = useState<{ subtotal: number; surcharge: number; surchargeLabel: string | null; grandTotal: number } | null>(null);

  // Derived from state (not just URL) so auto-detected groups render correctly
  const isGroup = !!groupPricing || !!groupId;

  useEffect(() => {
    if (!registrationId) {
      router.push("/register");
      return;
    }

    async function fetchGroup(gid: string) {
      const res = await fetch(`/api/registration/group/${gid}`);
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data.registrations);
        setGroupPricing(data.pricing);
        return true;
      }
      return false;
    }

    async function fetchData() {
      try {
        // If group_id is in the URL, fetch group directly
        if (groupId) {
          const ok = await fetchGroup(groupId);
          if (!ok) setError("Group registrations not found");
        } else {
          // Fetch solo first, but check if it belongs to a group
          const res = await fetch(`/api/registration/${registrationId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.group_id) {
              // Auto-detect: this registration belongs to a group
              const ok = await fetchGroup(data.group_id);
              if (!ok) {
                // Fallback to solo if group fetch fails
                setRegistrations([data]);
              }
            } else {
              setRegistrations([data]);
            }
          } else {
            setError("Registration not found");
          }
        }
      } catch {
        setError("Failed to load registration");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [registrationId, groupId, router]);

  async function handlePayment() {
    setPaymentLoading(true);
    setError(null);

    try {
      // Use group_id from URL or from the fetched registration data
      const effectiveGroupId = groupId || (registrations.length > 0 ? registrations[0].group_id : null);
      const res = await fetch("/api/payment/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          effectiveGroupId
            ? { groupId: effectiveGroupId }
            : { registrationId }
        ),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Payment session failed");
        setPaymentLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPaymentLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (registrations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="text-2xl font-bold">Registration Not Found</h1>
          <Button onClick={() => router.push("/register")}>Start New Registration</Button>
        </div>
      </div>
    );
  }

  const primaryReg = registrations[0];
  const soloAmount = Number(primaryReg.computed_amount);
  const totalAmount = groupPricing ? groupPricing.grandTotal : soloAmount;

  return (
    <div className="min-h-screen relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="mx-auto max-w-lg px-4 py-12 relative">
        {cancelled && (
          <div className="mb-6 rounded-md bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
            Payment was cancelled. You can try again below.
          </div>
        )}

        <Card className="shadow-brand-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Review & Pay</CardTitle>
            <CardDescription>
              {isGroup
                ? `Review ${registrations.length} registrations and complete payment`
                : "Review your registration and complete payment"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Registrants */}
            {registrations.map((reg) => (
              <div key={reg.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="font-semibold">
                      {reg.first_name} {reg.last_name}
                    </p>
                    <Badge variant="secondary" className="capitalize text-xs">
                      {reg.category}
                    </Badge>
                  </div>
                  {isGroup && (
                    <span className="text-sm font-medium">
                      ${Number(reg.computed_amount).toFixed(2)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  {reg.is_full_duration
                    ? "Full Conference"
                    : `${reg.num_days} Day(s)`}
                  {reg.is_staying_in_motel && " + Motel Stay"}
                </p>
                {!isGroup && (
                  <p className="text-sm text-muted-foreground">{reg.email}</p>
                )}
              </div>
            ))}

            {isGroup && (
              <p className="text-sm text-muted-foreground">{primaryReg.email}</p>
            )}

            <Separator />

            {/* Pricing */}
            {isGroup && groupPricing ? (
              <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal ({registrations.length} people)</span>
                  <span>${groupPricing.subtotal.toFixed(2)}</span>
                </div>
                {groupPricing.surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{groupPricing.surchargeLabel || "Late Surcharge"}</span>
                    <span className="text-amber-600">+${groupPricing.surcharge.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total</span>
                  <span className="text-3xl font-bold text-brand-amber-foreground">
                    ${groupPricing.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/50 p-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Amount Due</p>
                <p className="text-4xl font-bold text-brand-amber-foreground">
                  ${soloAmount.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {primaryReg.explanation_detail}
                </p>
              </div>
            )}

            <Button
              onClick={handlePayment}
              disabled={paymentLoading}
              className="w-full shadow-brand-sm hover:shadow-brand-md transition-shadow"
              size="lg"
            >
              {paymentLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Pay ${totalAmount.toFixed(2)}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
