"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import type { Registration } from "@/types/database";

export default function ReviewPage() {
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
  const cancelled = searchParams.get("cancelled");

  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationId) {
      router.push("/register");
      return;
    }

    async function fetchRegistration() {
      try {
        const res = await fetch(`/api/registration/${registrationId}`);
        if (res.ok) {
          const data = await res.json();
          setRegistration(data);
        } else {
          setError("Registration not found");
        }
      } catch {
        setError("Failed to load registration");
      } finally {
        setLoading(false);
      }
    }

    fetchRegistration();
  }, [registrationId, router]);

  async function handlePayment() {
    if (!registrationId) return;
    setPaymentLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/payment/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Payment session failed");
        setPaymentLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
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

  if (!registration) {
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
              Review your registration and complete payment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Attendee
              </h3>
              <p className="font-semibold">
                {registration.first_name} {registration.last_name}
              </p>
              <p className="text-sm text-muted-foreground">{registration.email}</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Details
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {registration.category}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Age {registration.age_at_event}
                </span>
              </div>
              <p className="text-sm">
                {registration.is_full_duration
                  ? "Full Conference"
                  : `${registration.num_days} Day(s)`}
                {registration.is_staying_in_motel && " + Motel Stay"}
              </p>
            </div>

            <Separator />

            <div className="rounded-xl border border-border bg-muted/50 p-6 text-center">
              <p className="text-sm text-muted-foreground mb-1">Amount Due</p>
              <p className="text-4xl font-bold text-brand-amber-foreground">
                ${Number(registration.computed_amount).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {registration.explanation_detail}
              </p>
            </div>

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
              Pay ${Number(registration.computed_amount).toFixed(2)}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
