"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DuplicateRegistrationDialog } from "./duplicate-dialog";
import { RegistrantFormCard } from "./registrant-form-card";
import { ReviewStep } from "./review-step";
import { WizardPriceSidebar } from "./wizard-price-sidebar";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, Users } from "lucide-react";
import type { Event, PricingConfig, Church } from "@/types/database";
import type { MealService } from "./meal-selector";
import { useTranslation } from "@/lib/i18n/context";
import { useWizardState, getContactErrors } from "./hooks/use-wizard-state";
import { useGroupQuote, getAgeRangeOptions, syntheticDob } from "./hooks/use-group-quote";
import { useDuplicateCheck } from "./hooks/use-duplicate-check";

type WizardProps = {
  event: Event;
  pricing: PricingConfig;
  churches: Church[];
  availableMeals: MealService[];
};

export function RegistrationWizard({ event, pricing, churches, availableMeals }: WizardProps) {
  const router = useRouter();
  const { dict, locale } = useTranslation();
  const STEPS = dict.wizard.steps;
  const ageLabels = { infant: dict.wizard.infantLabel, child: dict.wizard.childLabel, youth: dict.wizard.youthLabel, adult: dict.wizard.adultLabel };

  const {
    step, setStep, loading, setLoading, error, setError,
    registrants, expandedIdx, setExpandedIdx, contact, setContact,
    updateRegistrant, addRegistrant, removeRegistrant,
    isRegistrantComplete, getRegistrantErrors,
    attemptedStep0, attemptedStep1,
    tryProceedStep0, tryProceedStep1, contactErrors,
  } = useWizardState();

  const { groupQuote, quoteLoading, quoteError } = useGroupQuote(event, registrants, ageLabels);
  const dup = useDuplicateCheck(event.id);

  // Scroll to top and manage focus on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // ─── Submit ───
  const handleSubmit = useCallback(async () => {
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
          registrants: registrants.map((r) => {
            const opt = getAgeRangeOptions(event, ageLabels).find((o) => o.key === r.ageRange);
            const attType = r.attendanceType || "full_conference";
            return {
              firstName: r.firstName,
              lastName: r.lastName,
              dateOfBirth: syntheticDob(opt?.representativeAge ?? 25, event.start_date),
              gender: r.gender || undefined,
              city: r.city || undefined,
              churchId: r.churchId || undefined,
              churchNameCustom: r.churchNameCustom || undefined,
              attendanceType: attType,
              isFullDuration: attType === "full_conference",
              numDays: attType !== "full_conference" ? r.selectedDays.length : undefined,
              selectedDays: attType !== "full_conference" ? r.selectedDays : undefined,
              mealServiceIds: r.selectedMealIds.length > 0 ? r.selectedMealIds : undefined,
              tshirtSize: r.tshirtSize || undefined,
            };
          }),
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

      router.push(
        `/register/review?registration_id=${primaryReg.id}&ln=${ln}${groupId ? `&group_id=${groupId}` : ""}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }, [event, contact, registrants, ageLabels, setLoading, setError, router]);

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6 pb-24 lg:pb-0">
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label={`Registration step ${step + 1} of ${STEPS.length}`}>
          <div
            className="h-full brand-gradient rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Step indicator */}
        <nav className="flex items-center justify-between" aria-label="Registration steps">
          {STEPS.map((label: string, i: number) => (
            <div key={label} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all ${
                  i < step
                    ? "brand-gradient text-white"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-label={`Step ${i + 1}: ${label}${i < step ? " (completed)" : i === step ? " (current)" : ""}`}
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
        </nav>

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
                    <h2 className="text-lg font-semibold">{dict.wizard.whoIsAttending}</h2>
                    <p className="text-sm text-muted-foreground">
                      {dict.wizard.addEveryoneDesc.replace("{eventName}", event.name)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {registrants.length}
                  </Badge>
                </div>

                {registrants.map((reg, idx) => (
                  <RegistrantFormCard
                    key={reg.id}
                    reg={reg}
                    idx={idx}
                    isExpanded={expandedIdx === idx}
                    isComplete={isRegistrantComplete(reg)}
                    registrantsLength={registrants.length}
                    quote={groupQuote?.items?.[idx]}
                    errors={attemptedStep0 ? getRegistrantErrors(reg, dict.validation) : {}}
                    event={event}
                    pricing={pricing}
                    churches={churches}
                    availableMeals={availableMeals}
                    locale={locale}
                    dict={dict}
                    ageLabels={ageLabels}
                    onToggle={() => setExpandedIdx(expandedIdx === idx ? -1 : idx)}
                    onUpdate={(fields) => updateRegistrant(idx, fields)}
                    onRemove={() => removeRegistrant(idx)}
                  />
                ))}

                <Button
                  variant="outline"
                  className="w-full border-dashed gap-2"
                  onClick={addRegistrant}
                >
                  <Plus className="h-4 w-4" />
                  {dict.wizard.addAnotherPerson}
                </Button>
              </div>
            )}

            {/* ─── Step 1: Contact Info ─── */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>{dict.wizard.contactInfo}</CardTitle>
                  <CardDescription>{dict.wizard.contactDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{dict.wizard.emailRequired}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={contact.email}
                      onChange={(e) => {
                        setContact((prev) => ({ ...prev, email: e.target.value }));
                        dup.resetBypass();
                      }}
                      placeholder="john@example.com"
                      aria-invalid={attemptedStep1 && !!contactErrors.email}
                      aria-describedby={attemptedStep1 && contactErrors.email ? "email-err" : "email-hint"}
                      className={attemptedStep1 && contactErrors.email ? "border-destructive" : ""}
                    />
                    {attemptedStep1 && contactErrors.email ? (
                      <p id="email-err" className="text-xs text-destructive" role="alert">
                        {getContactErrors(contact, dict.validation).email}
                      </p>
                    ) : (
                      <p id="email-hint" className="text-xs text-muted-foreground">
                        {dict.wizard.emailHint}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{dict.wizard.phoneRequired}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                      required
                      aria-invalid={attemptedStep1 && !!contactErrors.phone}
                      aria-describedby={attemptedStep1 && contactErrors.phone ? "phone-err" : undefined}
                      className={attemptedStep1 && contactErrors.phone ? "border-destructive" : ""}
                    />
                    {attemptedStep1 && contactErrors.phone && (
                      <p id="phone-err" className="text-xs text-destructive" role="alert">
                        {getContactErrors(contact, dict.validation).phone}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Step 2: Review ─── */}
            {step === 2 && (
              <ReviewStep
                contact={contact}
                registrants={registrants}
                groupQuote={groupQuote}
                eventStartDate={event.start_date}
                error={error}
                dict={dict}
              />
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
            {dict.common.back}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={async () => {
                if (step === 0) {
                  if (!tryProceedStep0()) return;
                }
                if (step === 1) {
                  if (!tryProceedStep1()) return;
                  const canProceed = await dup.checkDuplicate(contact.email);
                  if (!canProceed) return;
                }
                setStep((s) => s + 1);
              }}
              disabled={dup.dupChecking}
            >
              {dup.dupChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {dict.common.next}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {groupQuote?.grandTotal === 0 ? dict.wizard.completeRegistration : dict.wizard.proceedToPayment}
            </Button>
          )}
        </div>
      </div>

      {/* Price summary (desktop sidebar + mobile bar) */}
      <WizardPriceSidebar
        eventName={event.name}
        registrants={registrants}
        groupQuote={groupQuote}
        quoteLoading={quoteLoading}
        quoteError={quoteError}
        dict={dict}
      />

      {/* Duplicate registration dialog */}
      <DuplicateRegistrationDialog
        open={dup.dupDialogOpen}
        onOpenChange={dup.setDupDialogOpen}
        registrations={dup.dupRegistrations}
        email={contact.email}
        onProceedAnyway={() => {
          dup.bypassDuplicate();
          setStep(2);
        }}
      />
    </div>
  );
}
