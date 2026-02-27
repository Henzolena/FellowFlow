"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriceSummary } from "./price-summary";
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react";
import type { Event, PricingConfig, AgeCategory } from "@/types/database";

type WizardProps = {
  event: Event;
  pricing: PricingConfig;
};

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  isFullDuration: boolean | null;
  isStayingInMotel: boolean | null;
  numDays: number;
};

type PriceQuote = {
  category: AgeCategory;
  ageAtEvent: number;
  amount: number;
  explanationCode: string;
  explanationDetail: string;
};

const STEPS = ["Attendance", "Personal Info", "Review"];

export function RegistrationWizard({ event, pricing }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    isFullDuration: null,
    isStayingInMotel: null,
    numDays: 1,
  });

  const update = useCallback(
    (fields: Partial<FormData>) => setForm((prev) => ({ ...prev, ...fields })),
    []
  );

  // Fetch price quote when relevant fields change
  const fetchQuote = useCallback(async () => {
    if (form.isFullDuration === null || !form.dateOfBirth) return;
    if (!form.isFullDuration && form.numDays < 1) return;

    setQuoteLoading(true);
    try {
      const res = await fetch("/api/pricing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          dateOfBirth: form.dateOfBirth,
          isFullDuration: form.isFullDuration,
          isStayingInMotel: form.isStayingInMotel ?? false,
          numDays: form.isFullDuration ? undefined : form.numDays,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuote(data);
      }
    } catch {
      // Silently fail quote — pricing shown on review
    } finally {
      setQuoteLoading(false);
    }
  }, [event.id, form.isFullDuration, form.isStayingInMotel, form.dateOfBirth, form.numDays]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const canProceedStep0 =
    form.isFullDuration !== null &&
    form.dateOfBirth !== "" &&
    (form.isFullDuration ? form.isStayingInMotel !== null : form.numDays >= 1);

  const canProceedStep1 =
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    form.email.trim() !== "";

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/registration/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          dateOfBirth: form.dateOfBirth,
          isFullDuration: form.isFullDuration,
          isStayingInMotel: form.isFullDuration ? form.isStayingInMotel : undefined,
          numDays: form.isFullDuration ? undefined : form.numDays,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      const registration = data.registration;

      const ln = encodeURIComponent(form.lastName);

      if (registration.computed_amount === 0) {
        // Free registration — go directly to success
        router.push(`/register/success?registration_id=${registration.id}&free=true&ln=${ln}`);
        return;
      }

      // Paid registration — go to review/payment
      router.push(`/register/review?registration_id=${registration.id}&ln=${ln}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6 pb-24 lg:pb-0">
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full brand-gradient rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((step) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all ${
                  i < step
                    ? "brand-gradient text-white"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  i <= step ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 hidden h-px w-12 sm:block md:w-20 ${
                    i < step ? "brand-gradient" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Attendance Details</CardTitle>
                  <CardDescription>
                    Tell us about your attendance plans for {event.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Date of Birth</Label>
                    <Input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => update({ dateOfBirth: e.target.value })}
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Will you attend for the full duration of the conference?</Label>
                    <RadioGroup
                      value={form.isFullDuration === null ? "" : form.isFullDuration ? "yes" : "no"}
                      onValueChange={(v) =>
                        update({
                          isFullDuration: v === "yes",
                          isStayingInMotel: v === "yes" ? form.isStayingInMotel : null,
                        })
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="full-yes" />
                        <Label htmlFor="full-yes" className="font-normal">
                          Yes, full conference ({event.duration_days} days)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="full-no" />
                        <Label htmlFor="full-no" className="font-normal">
                          No, partial attendance
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <AnimatePresence>
                    {form.isFullDuration === true && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 overflow-hidden"
                      >
                        <Label>Will you be staying in the motel?</Label>
                        <RadioGroup
                          value={
                            form.isStayingInMotel === null
                              ? ""
                              : form.isStayingInMotel
                              ? "yes"
                              : "no"
                          }
                          onValueChange={(v) =>
                            update({ isStayingInMotel: v === "yes" })
                          }
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="yes" id="motel-yes" />
                            <Label htmlFor="motel-yes" className="font-normal">
                              Yes, staying in the motel
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no" id="motel-no" />
                            <Label htmlFor="motel-no" className="font-normal">
                              No, not staying in the motel
                            </Label>
                          </div>
                        </RadioGroup>
                      </motion.div>
                    )}

                    {form.isFullDuration === false && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 overflow-hidden"
                      >
                        <Label>How many days will you attend?</Label>
                        <Select
                          value={String(form.numDays)}
                          onValueChange={(v) => update({ numDays: parseInt(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              { length: event.duration_days - 1 },
                              (_, i) => i + 1
                            ).map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {d} day{d !== 1 ? "s" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            )}

            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Provide your contact details for registration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        value={form.firstName}
                        onChange={(e) => update({ firstName: e.target.value })}
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        value={form.lastName}
                        onChange={(e) => update({ lastName: e.target.value })}
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => update({ email: e.target.value })}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => update({ phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review & Submit</CardTitle>
                  <CardDescription>
                    Verify your details before submitting
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Attendee
                    </h4>
                    <p className="font-medium">
                      {form.firstName} {form.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{form.email}</p>
                    {form.phone && (
                      <p className="text-sm text-muted-foreground">{form.phone}</p>
                    )}
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Attendance
                    </h4>
                    <p className="text-sm">
                      {form.isFullDuration
                        ? `Full conference (${event.duration_days} days)`
                        : `${form.numDays} day(s)`}
                    </p>
                    {form.isFullDuration && (
                      <p className="text-sm">
                        Motel: {form.isStayingInMotel ? "Yes" : "No"}
                      </p>
                    )}
                  </div>

                  {quote && (
                    <div className="rounded-xl border border-border bg-muted/50 p-5 text-center">
                      <p className="text-sm text-muted-foreground mb-1">
                        Amount Due
                      </p>
                      <p className={`text-3xl font-bold ${quote.amount === 0 ? "text-brand-green" : "text-brand-amber-foreground"}`}>
                        {quote.amount === 0 ? "FREE" : `$${quote.amount.toFixed(2)}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {quote.explanationDetail}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quote?.amount === 0 ? "Complete Registration" : "Proceed to Payment"}
            </Button>
          )}
        </div>
      </div>

      {/* Sticky price summary sidebar */}
      <div className="hidden lg:block">
        <PriceSummary
          eventName={event.name}
          category={quote?.category}
          isFullDuration={form.isFullDuration ?? undefined}
          isStayingInMotel={form.isStayingInMotel ?? undefined}
          numDays={form.numDays}
          amount={quote?.amount}
          explanationDetail={quote?.explanationDetail}
          loading={quoteLoading}
        />
      </div>

      {/* Mobile price summary */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/60 p-4 shadow-brand-lg">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div>
            <p className="text-xs text-muted-foreground">Estimated Price</p>
            <p className="text-xl font-bold text-brand-amber-foreground">
              {quote
                ? quote.amount === 0
                  ? "FREE"
                  : `$${quote.amount.toFixed(2)}`
                : "—"}
            </p>
          </div>
          {quote?.category && (
            <span className="text-xs font-medium capitalize text-muted-foreground">
              {quote.category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
