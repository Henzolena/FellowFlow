"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DuplicateRegistrationDialog, type ExistingRegistration } from "./duplicate-dialog";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, Trash2, User, Users } from "lucide-react";
import type { Event, PricingConfig, AgeCategory } from "@/types/database";

type WizardProps = {
  event: Event;
  pricing: PricingConfig;
};

type Registrant = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  isFullDuration: boolean | null;
  isStayingInMotel: boolean | null;
  numDays: number;
};

type ContactInfo = {
  email: string;
  phone: string;
};

type ItemQuote = {
  category: AgeCategory;
  ageAtEvent: number;
  amount: number;
  explanationCode: string;
  explanationDetail: string;
};

type GroupQuote = {
  items: ItemQuote[];
  subtotal: number;
  surcharge: number;
  surchargeLabel: string | null;
  grandTotal: number;
};

const STEPS = ["Registrants", "Contact Info", "Review"];

let nextId = 1;
function genId() {
  return `reg-${nextId++}`;
}

function createEmptyRegistrant(): Registrant {
  return {
    id: genId(),
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    isFullDuration: null,
    isStayingInMotel: null,
    numDays: 1,
  };
}

export function RegistrationWizard({ event, pricing }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupQuote, setGroupQuote] = useState<GroupQuote | null>(null);

  const [registrants, setRegistrants] = useState<Registrant[]>([createEmptyRegistrant()]);
  const [expandedIdx, setExpandedIdx] = useState(0);
  const [contact, setContact] = useState<ContactInfo>({ email: "", phone: "" });

  // Duplicate check state
  const [dupChecking, setDupChecking] = useState(false);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupRegistrations, setDupRegistrations] = useState<ExistingRegistration[]>([]);
  const [dupBypassed, setDupBypassed] = useState(false);

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Registrant helpers ───
  function updateRegistrant(idx: number, fields: Partial<Registrant>) {
    setRegistrants((prev) => prev.map((r, i) => (i === idx ? { ...r, ...fields } : r)));
  }

  function addRegistrant() {
    const newReg = createEmptyRegistrant();
    setRegistrants((prev) => [...prev, newReg]);
    setExpandedIdx(registrants.length);
  }

  function removeRegistrant(idx: number) {
    if (registrants.length <= 1) return;
    setRegistrants((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx(Math.min(expandedIdx, registrants.length - 2));
  }

  // ─── Quote fetching ───
  const fetchGroupQuote = useCallback(async () => {
    const validRegistrants = registrants.filter(
      (r) =>
        r.dateOfBirth !== "" &&
        r.isFullDuration !== null &&
        (r.isFullDuration || (r.isStayingInMotel !== null && (r.isStayingInMotel || r.numDays >= 1)))
    );

    if (validRegistrants.length === 0) {
      setGroupQuote(null);
      return;
    }

    setQuoteLoading(true);
    try {
      const res = await fetch("/api/pricing/quote-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          registrants: validRegistrants.map((r) => ({
            dateOfBirth: r.dateOfBirth,
            isFullDuration: r.isFullDuration,
            isStayingInMotel: r.isStayingInMotel ?? false,
            numDays: r.isFullDuration ? undefined : r.numDays,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroupQuote(data);
      }
    } catch {
      // Silently fail
    } finally {
      setQuoteLoading(false);
    }
  }, [event.id, registrants]);

  // Debounced quote fetching
  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    quoteTimerRef.current = setTimeout(fetchGroupQuote, 400);
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fetchGroupQuote]);

  // ─── Validation ───
  function isRegistrantComplete(r: Registrant): boolean {
    if (!r.firstName.trim() || !r.lastName.trim() || !r.dateOfBirth) return false;
    if (r.isFullDuration === null) return false;
    if (!r.isFullDuration) {
      if (r.isStayingInMotel === null) return false;
      if (!r.isStayingInMotel && r.numDays < 1) return false;
    }
    return true;
  }

  const allRegistrantsComplete = registrants.every(isRegistrantComplete);
  const canProceedStep0 = allRegistrantsComplete;
  const canProceedStep1 = contact.email.trim() !== "";

  // ─── Submit ───
  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/registration/create-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          email: contact.email,
          phone: contact.phone || undefined,
          registrants: registrants.map((r) => ({
            firstName: r.firstName,
            lastName: r.lastName,
            dateOfBirth: r.dateOfBirth,
            isFullDuration: r.isFullDuration,
            isStayingInMotel: !r.isFullDuration ? r.isStayingInMotel : undefined,
            numDays: !r.isFullDuration && !r.isStayingInMotel ? r.numDays : undefined,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      const { groupId, registrations, grandTotal } = data;
      const primaryReg = registrations[0];
      const ln = encodeURIComponent(primaryReg.last_name);

      if (grandTotal === 0) {
        router.push(`/register/success?registration_id=${primaryReg.id}&free=true&ln=${ln}${groupId ? `&group_id=${groupId}` : ""}`);
        return;
      }

      // Paid → go to review page
      router.push(
        `/register/review?registration_id=${primaryReg.id}&ln=${ln}${groupId ? `&group_id=${groupId}` : ""}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // ─── Render helpers ───
  function renderRegistrantForm(reg: Registrant, idx: number) {
    const isExpanded = expandedIdx === idx;
    const isComplete = isRegistrantComplete(reg);
    const quote = groupQuote?.items?.[idx];

    return (
      <Card key={reg.id} className={`transition-all ${isExpanded ? "ring-2 ring-primary/20" : ""}`}>
        <CardHeader
          className="cursor-pointer py-3 px-4"
          onClick={() => setExpandedIdx(isExpanded ? -1 : idx)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${isComplete ? "brand-gradient text-white" : "bg-muted text-muted-foreground"}`}>
                {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <div>
                <p className="font-medium text-sm">
                  {reg.firstName && reg.lastName
                    ? `${reg.firstName} ${reg.lastName}`
                    : `Person ${idx + 1}`}
                </p>
                {isComplete && quote && (
                  <p className="text-xs text-muted-foreground">
                    {quote.category} — {quote.amount === 0 ? "Free" : `$${quote.amount.toFixed(2)}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {registrants.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRegistrant(idx);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="space-y-4 pt-0">
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input
                      value={reg.firstName}
                      onChange={(e) => updateRegistrant(idx, { firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input
                      value={reg.lastName}
                      onChange={(e) => updateRegistrant(idx, { lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Date of Birth *</Label>
                  <Input
                    type="date"
                    value={reg.dateOfBirth}
                    onChange={(e) => updateRegistrant(idx, { dateOfBirth: e.target.value })}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Attending for the full duration?</Label>
                  <RadioGroup
                    value={reg.isFullDuration === null ? "" : reg.isFullDuration ? "yes" : "no"}
                    onValueChange={(v) =>
                      updateRegistrant(idx, {
                        isFullDuration: v === "yes",
                        isStayingInMotel: v === "no" ? reg.isStayingInMotel : null,
                        numDays: v === "no" ? reg.numDays : 1,
                      })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id={`full-yes-${idx}`} />
                      <Label htmlFor={`full-yes-${idx}`} className="font-normal">
                        Yes, full conference ({event.duration_days} days)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id={`full-no-${idx}`} />
                      <Label htmlFor={`full-no-${idx}`} className="font-normal">
                        No, partial attendance
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <AnimatePresence>
                  {reg.isFullDuration === false && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      <Label>Staying in the motel?</Label>
                      <RadioGroup
                        value={reg.isStayingInMotel === null ? "" : reg.isStayingInMotel ? "yes" : "no"}
                        onValueChange={(v) => updateRegistrant(idx, { isStayingInMotel: v === "yes" })}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id={`motel-yes-${idx}`} />
                          <Label htmlFor={`motel-yes-${idx}`} className="font-normal">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id={`motel-no-${idx}`} />
                          <Label htmlFor={`motel-no-${idx}`} className="font-normal">No</Label>
                        </div>
                      </RadioGroup>

                      {reg.isStayingInMotel === false && (
                        <div className="space-y-2 pt-1">
                          <Label>Number of days</Label>
                          <Select
                            value={String(reg.numDays)}
                            onValueChange={(v) => updateRegistrant(idx, { numDays: parseInt(v) })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: event.duration_days - 1 }, (_, i) => i + 1).map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                  {d} day{d !== 1 ? "s" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6 pb-24 lg:pb-0">
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full brand-gradient rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
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
              <span className={`hidden text-sm font-medium sm:inline ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 hidden h-px w-12 sm:block md:w-20 ${i < step ? "brand-gradient" : "bg-border"}`} />
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
            {/* ─── Step 0: Registrants ─── */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Who is attending?</h2>
                    <p className="text-sm text-muted-foreground">
                      Add everyone you&apos;d like to register for {event.name}
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {registrants.length}
                  </Badge>
                </div>

                {registrants.map((reg, idx) => renderRegistrantForm(reg, idx))}

                <Button
                  variant="outline"
                  className="w-full border-dashed gap-2"
                  onClick={addRegistrant}
                >
                  <Plus className="h-4 w-4" />
                  Add Another Person
                </Button>
              </div>
            )}

            {/* ─── Step 1: Contact Info ─── */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                  <CardDescription>
                    Provide the email for registration confirmations and receipts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={contact.email}
                      onChange={(e) => {
                        setContact((prev) => ({ ...prev, email: e.target.value }));
                        setDupBypassed(false);
                      }}
                      placeholder="john@example.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Confirmation emails and receipts will be sent to this address
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Step 2: Review ─── */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review & Submit</CardTitle>
                  <CardDescription>
                    Verify all details before submitting
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  {/* Contact info */}
                  <div className="rounded-lg bg-muted/50 p-4 space-y-1">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Contact
                    </h4>
                    <p className="text-sm">{contact.email}</p>
                    {contact.phone && <p className="text-sm text-muted-foreground">{contact.phone}</p>}
                  </div>

                  {/* Registrants */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Registrants ({registrants.length})
                    </h4>
                    {registrants.map((reg, idx) => {
                      const q = groupQuote?.items?.[idx];
                      return (
                        <div key={reg.id} className="rounded-lg bg-muted/50 p-4 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <p className="font-medium text-sm">{reg.firstName} {reg.lastName}</p>
                              {q && (
                                <Badge variant="secondary" className="capitalize text-xs">
                                  {q.category}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 ml-6">
                              {reg.isFullDuration
                                ? `Full conference`
                                : reg.isStayingInMotel
                                ? "Partial — Motel (Free)"
                                : `${reg.numDays} day(s)`}
                            </p>
                          </div>
                          <p className={`font-semibold text-sm ${q?.amount === 0 ? "text-brand-green" : "text-foreground"}`}>
                            {q ? (q.amount === 0 ? "FREE" : `$${q.amount.toFixed(2)}`) : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pricing summary */}
                  {groupQuote && (
                    <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${groupQuote.subtotal.toFixed(2)}</span>
                      </div>
                      {groupQuote.surcharge > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {groupQuote.surchargeLabel || "Late Surcharge"}
                          </span>
                          <span className="text-amber-600">+${groupQuote.surcharge.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Total</span>
                        <span className={`text-2xl font-bold ${groupQuote.grandTotal === 0 ? "text-brand-green" : "text-brand-amber-foreground"}`}>
                          {groupQuote.grandTotal === 0 ? "FREE" : `$${groupQuote.grandTotal.toFixed(2)}`}
                        </span>
                      </div>
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
              onClick={async () => {
                // Duplicate check when moving from Contact (step 1) → Review (step 2)
                if (step === 1 && !dupBypassed) {
                  setDupChecking(true);
                  try {
                    const res = await fetch("/api/registration/check-duplicate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: contact.email.trim(), eventId: event.id }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      if (data.hasDuplicates) {
                        setDupRegistrations(data.registrations);
                        setDupDialogOpen(true);
                        setDupChecking(false);
                        return;
                      }
                    }
                  } catch {
                    // Allow proceeding if check fails
                  } finally {
                    setDupChecking(false);
                  }
                }
                setStep((s) => s + 1);
              }}
              disabled={(step === 0 ? !canProceedStep0 : !canProceedStep1) || dupChecking}
            >
              {dupChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {groupQuote?.grandTotal === 0 ? "Complete Registration" : "Proceed to Payment"}
            </Button>
          )}
        </div>
      </div>

      {/* ─── Sticky price summary sidebar ─── */}
      <div className="hidden lg:block">
        <Card className="sticky top-6 shadow-brand-lg brand-gradient-border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-brand-teal" />
              Price Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{event.name}</p>

            {groupQuote ? (
              <>
                {groupQuote.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate mr-2">
                      {registrants[i]?.firstName || `Person ${i + 1}`}
                    </span>
                    <span className={item.amount === 0 ? "text-brand-green" : ""}>
                      {item.amount === 0 ? "Free" : `$${item.amount.toFixed(2)}`}
                    </span>
                  </div>
                ))}

                <Separator className="opacity-60" />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${groupQuote.subtotal.toFixed(2)}</span>
                </div>

                {groupQuote.surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{groupQuote.surchargeLabel || "Late Surcharge"}</span>
                    <span className="text-amber-600">+${groupQuote.surcharge.toFixed(2)}</span>
                  </div>
                )}

                <Separator className="opacity-60" />

                <div className="text-center py-1">
                  <p className={`text-3xl font-bold ${groupQuote.grandTotal === 0 ? "text-brand-green" : "text-brand-amber-foreground"}`}>
                    {groupQuote.grandTotal === 0 ? "FREE" : `$${groupQuote.grandTotal.toFixed(2)}`}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                {quoteLoading ? "Calculating..." : "Add registrant details to see pricing"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mobile price summary */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/60 p-4 shadow-brand-lg">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div>
            <p className="text-xs text-muted-foreground">
              {registrants.length > 1 ? `${registrants.length} Registrants` : "Estimated Price"}
            </p>
            <p className="text-xl font-bold text-brand-amber-foreground">
              {groupQuote
                ? groupQuote.grandTotal === 0
                  ? "FREE"
                  : `$${groupQuote.grandTotal.toFixed(2)}`
                : "—"}
            </p>
          </div>
          {groupQuote && groupQuote.surcharge > 0 && (
            <span className="text-xs text-amber-600">
              incl. ${groupQuote.surcharge.toFixed(2)} surcharge
            </span>
          )}
        </div>
      </div>

      {/* Duplicate registration dialog */}
      <DuplicateRegistrationDialog
        open={dupDialogOpen}
        onOpenChange={setDupDialogOpen}
        registrations={dupRegistrations}
        email={contact.email}
        onProceedAnyway={() => {
          setDupBypassed(true);
          setStep(2);
        }}
      />
    </div>
  );
}
