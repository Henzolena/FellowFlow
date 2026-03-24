"use client";

import { useState, useEffect } from "react";
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
import { DuplicateRegistrationDialog } from "./duplicate-dialog";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, Trash2, User, Users, Church, MapPin, Baby, GraduationCap, Calendar, UtensilsCrossed } from "lucide-react";
import type { Event, PricingConfig, Church as ChurchType } from "@/types/database";
import { useTranslation } from "@/lib/i18n/context";
import { useWizardState, getContactErrors, type Registrant, type AttendanceTypeKey, type GenderKey } from "./hooks/use-wizard-state";
import { useGroupQuote, getAgeRangeOptions, syntheticDob } from "./hooks/use-group-quote";
import { useDuplicateCheck } from "./hooks/use-duplicate-check";
import { formatSelectedDays } from "@/lib/date-utils";

type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";

type WizardProps = {
  event: Event;
  pricing: PricingConfig;
};

// Helper to generate day details with dates
function getDayDetails(eventStartDate: string, dayNumber: number, locale: string = 'en') {
  // Parse date in local timezone to avoid UTC offset issues
  const [year, month, day] = eventStartDate.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const targetDate = new Date(start);
  targetDate.setDate(start.getDate() + dayNumber - 1);

  const dateLocale = locale === 'am' ? 'am-ET' : 'en-US';
  const dayName = targetDate.toLocaleDateString(dateLocale, { weekday: 'short' });
  const monthName = targetDate.toLocaleDateString(dateLocale, { month: 'short' });
  const dayNum = targetDate.getDate();

  return {
    dayName,
    monthDay: `${monthName} ${dayNum}`,
    fullDate: targetDate.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

export function RegistrationWizard({ event, pricing }: WizardProps) {
  const router = useRouter();
  const { dict, locale } = useTranslation();
  const dateLocale = locale === 'am' ? 'am-ET' : 'en-US';
  const STEPS = dict.wizard.steps;
  const ageLabels = { infant: dict.wizard.infantLabel, child: dict.wizard.childLabel, youth: dict.wizard.youthLabel, adult: dict.wizard.adultLabel };

  // Fetch churches for dropdown
  const [churches, setChurches] = useState<ChurchType[]>([]);
  useEffect(() => {
    fetch("/api/churches")
      .then((r) => r.json())
      .then((d) => setChurches(d.churches ?? []))
      .catch(() => {});
  }, []);

  // Fetch available meals for KOTE meal selection
  type MealService = { id: string; service_name: string; service_code: string; meal_type: string | null; service_date: string | null; start_time: string | null; display_order: number };
  const [availableMeals, setAvailableMeals] = useState<MealService[]>([]);
  useEffect(() => {
    fetch(`/api/services/meals?eventId=${event.id}`)
      .then((r) => r.json())
      .then((d) => setAvailableMeals(d.meals ?? []))
      .catch(() => {});
  }, [event.id]);

  const {
    step, setStep, loading, setLoading, error, setError,
    registrants, expandedIdx, setExpandedIdx, contact, setContact,
    updateRegistrant, addRegistrant, removeRegistrant,
    canProceedStep0, canProceedStep1, isRegistrantComplete,
    getRegistrantErrors, attemptedStep0, attemptedStep1,
    tryProceedStep0, tryProceedStep1, contactErrors,
  } = useWizardState();

  const { groupQuote, quoteLoading, quoteError } = useGroupQuote(event, registrants, ageLabels);
  const dup = useDuplicateCheck(event.id);

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
    const errors = attemptedStep0 ? getRegistrantErrors(reg, dict.validation) : {};

    return (
      <Card key={reg.id} className={`transition-all ${isExpanded ? "ring-2 ring-primary/20" : ""}`}>
        <CardHeader
          className="cursor-pointer py-3 px-4"
          onClick={() => setExpandedIdx(isExpanded ? -1 : idx)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${isComplete ? "brand-gradient text-white" : Object.keys(errors).length > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <div>
                <p className="font-medium text-sm">
                  {reg.firstName && reg.lastName
                    ? `${reg.firstName} ${reg.lastName}`
                    : `${dict.common.person} ${idx + 1}`}
                </p>
                {isComplete && quote && (
                  <p className="text-xs text-muted-foreground">
                    {quote.category} — {quote.amount === 0 ? dict.common.free_lower : `$${quote.amount.toFixed(2)}`}
                  </p>
                )}
                {!isComplete && Object.keys(errors).length > 0 && !isExpanded && (
                  <p className="text-xs text-destructive">
                    {dict.wizard.fieldsNeedAttention.replace("{count}", String(Object.keys(errors).length))}
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
                  aria-label={`Remove ${reg.firstName || `person ${idx + 1}`}`}
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
                    <Label htmlFor={`firstName-${idx}`}>{dict.wizard.firstName} *</Label>
                    <Input
                      id={`firstName-${idx}`}
                      value={reg.firstName}
                      onChange={(e) => updateRegistrant(idx, { firstName: e.target.value })}
                      placeholder="John"
                      aria-invalid={!!errors.firstName}
                      aria-describedby={errors.firstName ? `firstName-err-${idx}` : undefined}
                      className={errors.firstName ? "border-destructive" : ""}
                    />
                    {errors.firstName && <p id={`firstName-err-${idx}`} className="text-xs text-destructive" role="alert">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`lastName-${idx}`}>{dict.wizard.lastName} *</Label>
                    <Input
                      id={`lastName-${idx}`}
                      value={reg.lastName}
                      onChange={(e) => updateRegistrant(idx, { lastName: e.target.value })}
                      placeholder="Doe"
                      aria-invalid={!!errors.lastName}
                      aria-describedby={errors.lastName ? `lastName-err-${idx}` : undefined}
                      className={errors.lastName ? "border-destructive" : ""}
                    />
                    {errors.lastName && <p id={`lastName-err-${idx}`} className="text-xs text-destructive" role="alert">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{dict.wizard.ageRange} *</Label>
                  {errors.ageRange && <p className="text-xs text-destructive" role="alert">{errors.ageRange}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {getAgeRangeOptions(event, ageLabels).map((opt) => {
                      const selected = reg.ageRange === opt.key;
                      const iconMap = {
                        infant: <Baby className="h-5 w-5" />,
                        child: <User className="h-5 w-5" />,
                        youth: <GraduationCap className="h-5 w-5" />,
                        adult: <Users className="h-5 w-5" />,
                      };
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={reg.ageRange === opt.key}
                          aria-label={`${opt.name} (${opt.range} ${dict.wizard.yearsAbbr})`}
                          onClick={() => updateRegistrant(idx, { ageRange: opt.key as AgeRangeKey })}
                          className={`relative flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-all ${
                            selected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                          }`}
                        >
                          <span className={`${selected ? "text-primary" : "text-muted-foreground"}`}>
                            {iconMap[opt.key]}
                          </span>
                          <span className={`text-xs font-semibold leading-tight ${selected ? "text-primary" : "text-foreground"}`}>
                            {opt.name}
                          </span>
                          <span className={`text-[10px] leading-tight ${selected ? "text-primary/70" : "text-muted-foreground"}`}>
                            {opt.range} {dict.wizard.yearsAbbr}
                          </span>
                          {selected && (
                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <Label>{dict.wizard.gender} *</Label>
                  <Select
                    value={reg.gender}
                    onValueChange={(v) => updateRegistrant(idx, { gender: v as GenderKey })}
                  >
                    <SelectTrigger className={errors.gender ? "border-destructive" : ""}>
                      <SelectValue placeholder={dict.wizard.selectGender} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{dict.wizard.male}</SelectItem>
                      <SelectItem value="female">{dict.wizard.female}</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.gender && <p className="text-xs text-destructive" role="alert">{errors.gender}</p>}
                </div>

                {/* Church */}
                <div className="space-y-2">
                  <Label>{dict.wizard.church}</Label>
                  <Select
                    value={reg.churchId || "__other"}
                    onValueChange={(v) => {
                      if (v === "__other") {
                        updateRegistrant(idx, { churchId: "", churchNameCustom: reg.churchNameCustom, city: "" });
                      } else {
                        const selectedChurch = churches.find((c) => c.id === v);
                        updateRegistrant(idx, { 
                          churchId: v, 
                          churchNameCustom: "",
                          city: selectedChurch?.city || ""
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={dict.wizard.selectChurch} />
                    </SelectTrigger>
                    <SelectContent>
                      {churches.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value="__other">{dict.wizard.otherChurch}</SelectItem>
                    </SelectContent>
                  </Select>
                  {!reg.churchId && (
                    <Input
                      value={reg.churchNameCustom}
                      onChange={(e) => updateRegistrant(idx, { churchNameCustom: e.target.value })}
                      placeholder={dict.wizard.customChurchName}
                      className="mt-2"
                    />
                  )}
                </div>

                {/* City */}
                <div className="space-y-2">
                  <Label>{dict.wizard.city} *</Label>
                  <Input
                    value={reg.city}
                    onChange={(e) => updateRegistrant(idx, { city: e.target.value })}
                    placeholder="Dallas, TX"
                    disabled={!!reg.churchId}
                    className={reg.churchId ? "bg-muted cursor-not-allowed" : errors.city ? "border-destructive" : ""}
                  />
                  {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                  {reg.churchId && (
                    <p className="text-xs text-muted-foreground">
                      {dict.wizard.autoFilledFromChurch}
                    </p>
                  )}
                </div>

                {/* T-Shirt Size (optional, not for infants) */}
                {reg.ageRange && reg.ageRange !== "infant" && (
                  <div className="space-y-2">
                    <Label>{dict.wizard.tshirtSize} <span className="text-muted-foreground font-normal text-xs">{dict.wizard.tshirtOptional}</span></Label>
                    <Select
                      value={reg.tshirtSize || "__none"}
                      onValueChange={(v) => updateRegistrant(idx, { tshirtSize: v === "__none" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={dict.wizard.selectSize} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{dict.wizard.noPreference}</SelectItem>
                        <SelectItem value="XS">XS</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="XL">XL</SelectItem>
                        <SelectItem value="2XL">2XL</SelectItem>
                        <SelectItem value="3XL">3XL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Attendance Type */}
                <div className="space-y-3">
                  <Label>{dict.wizard.attendanceType} *</Label>
                  {errors.attendanceType && <p className="text-xs text-destructive" role="alert">{errors.attendanceType}</p>}
                  <RadioGroup
                    value={reg.attendanceType}
                    onValueChange={(v) => {
                      const att = v as AttendanceTypeKey;
                      updateRegistrant(idx, {
                        attendanceType: att,
                        isFullDuration: att === "full_conference",
                        isStayingInMotel: null,
                        numDays: 0,
                        selectedDays: [],
                        selectedMealIds: [],
                      });
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="full_conference" id={`att-full-${idx}`} />
                      <Label htmlFor={`att-full-${idx}`} className="font-normal">
                        {dict.wizard.fullConference} ({event.duration_days} {dict.common.days})
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="partial" id={`att-partial-${idx}`} />
                      <Label htmlFor={`att-partial-${idx}`} className="font-normal">
                        {dict.wizard.partialAttendance}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="kote" id={`att-kote-${idx}`} />
                      <Label htmlFor={`att-kote-${idx}`} className="font-normal">
                        {dict.wizard.koteAttendance}
                        <span className="ml-1 text-xs text-muted-foreground">{dict.wizard.koteAttendanceDesc}</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Partial / KOTE sub-fields: multi-select day cards */}
                <AnimatePresence>
                  {(reg.attendanceType === "partial" || reg.attendanceType === "kote") && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <Label>{dict.wizard.numberOfDays}</Label>
                        {reg.selectedDays.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {reg.selectedDays.length} {reg.selectedDays.length === 1 ? dict.common.day : dict.common.days}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Array.from({ length: event.duration_days }, (_, i) => i + 1).map((d) => {
                          const selected = reg.selectedDays.includes(d);
                          const dayInfo = getDayDetails(event.start_date, d, locale);
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={selected}
                              aria-label={`${dayInfo.fullDate}${selected ? ' (selected)' : ''}`}
                              onClick={() => {
                                const days = selected
                                  ? reg.selectedDays.filter((x) => x !== d)
                                  : [...reg.selectedDays, d].sort((a, b) => a - b);
                                updateRegistrant(idx, { selectedDays: days, numDays: days.length });
                              }}
                              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3.5 text-center transition-all ${
                                selected
                                  ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                                  : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                              }`}
                            >
                              <span className={`text-[11px] font-bold uppercase tracking-wide ${selected ? "text-primary" : "text-muted-foreground"}`}>
                                {dayInfo.dayName}
                              </span>
                              <span className={`text-xl font-bold leading-none ${selected ? "text-primary" : "text-foreground"}`}>
                                {dayInfo.monthDay.split(" ")[1]}
                              </span>
                              <span className={`text-[10px] font-semibold leading-tight ${selected ? "text-primary/70" : "text-muted-foreground/70"}`}>
                                {dayInfo.monthDay.split(" ")[0]}
                              </span>
                              {selected && (
                                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {errors.selectedDays && <p className="text-xs text-destructive" role="alert">{errors.selectedDays}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {dict.wizard.tapDaysToAttend}
                      </p>

                      {/* ─── KOTE Meal Selection ─── */}
                      {reg.attendanceType === "kote" && reg.selectedDays.length > 0 && (() => {
                        // Filter meals to only show those on selected days
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const selectedDateStrings = reg.selectedDays.map((d) => {
                          const [y, m, day] = event.start_date.split("-").map(Number);
                          const dt = new Date(y, m - 1, day);
                          dt.setDate(dt.getDate() + d - 1);
                          return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
                        });
                        const mealsForDays = availableMeals.filter((meal) =>
                          meal.service_date && selectedDateStrings.includes(meal.service_date)
                        );
                        if (mealsForDays.length === 0) return null;

                        // Group meals by date
                        const mealsByDate = new Map<string, MealService[]>();
                        for (const meal of mealsForDays) {
                          const date = meal.service_date!;
                          if (!mealsByDate.has(date)) mealsByDate.set(date, []);
                          mealsByDate.get(date)!.push(meal);
                        }

                        const mealTypeLabel = (t: string | null) => {
                          if (t === "breakfast") return dict.wizard.breakfast;
                          if (t === "lunch") return dict.wizard.lunch;
                          if (t === "dinner") return dict.wizard.dinner;
                          return t || dict.wizard.meal;
                        };
                        const mealPrice = (reg.ageRange === "child" || reg.ageRange === "infant") ? pricing.meal_price_child : pricing.meal_price_adult;

                        return (
                          <div className="space-y-3 mt-4 pt-4 border-t border-amber-200/60">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <UtensilsCrossed className="h-4 w-4 text-amber-600" />
                                <Label className="text-amber-800 dark:text-amber-300 font-semibold text-sm">{dict.wizard.addMealsOptional}</Label>
                              </div>
                              {reg.selectedMealIds.length > 0 && (
                                <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                  {reg.selectedMealIds.length} {dict.wizard.meal} · ${(reg.selectedMealIds.length * mealPrice).toFixed(0)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {dict.wizard.perMealSelectMeals.replace("${price}", String(mealPrice))}
                            </p>

                            {Array.from(mealsByDate.entries()).map(([date, meals]) => {
                              const [y, m, d] = date.split("-").map(Number);
                              const dt = new Date(y, m - 1, d);
                              const dayLabel = dt.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric" });
                              const allSelected = meals.every((meal) => reg.selectedMealIds.includes(meal.id));

                              return (
                                <div key={date} className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{dayLabel}</p>
                                    <button
                                      type="button"
                                      className="text-[10px] text-amber-600 hover:text-amber-700 font-medium"
                                      onClick={() => {
                                        if (allSelected) {
                                          const mealIds = meals.map((m) => m.id);
                                          updateRegistrant(idx, {
                                            selectedMealIds: reg.selectedMealIds.filter((id) => !mealIds.includes(id)),
                                          });
                                        } else {
                                          const newIds = new Set([...reg.selectedMealIds, ...meals.map((m) => m.id)]);
                                          updateRegistrant(idx, { selectedMealIds: Array.from(newIds) });
                                        }
                                      }}
                                    >
                                      {allSelected ? dict.wizard.deselect : dict.wizard.selectAll}
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {meals.map((meal) => {
                                      const isSelected = reg.selectedMealIds.includes(meal.id);
                                      return (
                                        <button
                                          key={meal.id}
                                          type="button"
                                          onClick={() => {
                                            const ids = isSelected
                                              ? reg.selectedMealIds.filter((id) => id !== meal.id)
                                              : [...reg.selectedMealIds, meal.id];
                                            updateRegistrant(idx, { selectedMealIds: ids });
                                          }}
                                          className={`relative flex flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-2 text-center transition-all text-xs ${
                                            isSelected
                                              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300"
                                              : "border-muted hover:border-amber-300/60 hover:bg-amber-50/50"
                                          }`}
                                        >
                                          <span className={`font-semibold ${isSelected ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
                                            {mealTypeLabel(meal.meal_type)}
                                          </span>
                                          {meal.start_time && (
                                            <span className={`text-[10px] ${isSelected ? "text-amber-600/70" : "text-muted-foreground"}`}>
                                              {meal.start_time.slice(0, 5)}
                                            </span>
                                          )}
                                          {isSelected && (
                                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white">
                                              <Check className="h-2.5 w-2.5" />
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
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
        <div className="h-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label={`Registration step ${step + 1} of ${STEPS.length}`}>
          <div
            className="h-full brand-gradient rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all ${
                  i < step
                    ? "brand-gradient text-white"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-label={`Step ${i + 1}: ${label}${i < step ? ' (completed)' : i === step ? ' (current)' : ''}`}
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

                {registrants.map((reg, idx) => renderRegistrantForm(reg, idx))}

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
                  <CardDescription>
                    {dict.wizard.contactDesc}
                  </CardDescription>
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
                      className={attemptedStep1 && contactErrors.email ? "border-destructive" : ""}
                    />
                    {attemptedStep1 && contactErrors.email ? (
                      <p className="text-xs text-destructive">{getContactErrors(contact, dict.validation).email}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
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
                      className={attemptedStep1 && contactErrors.phone ? "border-destructive" : ""}
                    />
                    {attemptedStep1 && contactErrors.phone && (
                      <p className="text-xs text-destructive">{getContactErrors(contact, dict.validation).phone}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Step 2: Review ─── */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>{dict.wizard.reviewAndSubmit}</CardTitle>
                  <CardDescription>
                    {dict.wizard.reviewDesc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {error && (
                    <div role="alert" aria-live="assertive" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  {/* Contact info */}
                  <div className="rounded-lg bg-muted/50 p-4 space-y-1">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      {dict.common.contact}
                    </h4>
                    <p className="text-sm">{contact.email}</p>
                    {contact.phone && <p className="text-sm text-muted-foreground">{contact.phone}</p>}
                  </div>

                  {/* Registrants */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      {dict.common.registrants} ({registrants.length})
                    </h4>
                    {registrants.map((reg, idx) => {
                      const q = groupQuote?.items?.[idx];
                      return (
                        <div key={reg.id} className="rounded-lg bg-muted/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                              {reg.attendanceType === "full_conference"
                                ? dict.wizard.fullConference
                                : reg.attendanceType === "kote"
                                ? reg.selectedDays.length > 0
                                  ? `${dict.wizard.koteAttendance} — ${formatSelectedDays(event.start_date, reg.selectedDays)}`
                                  : `${dict.wizard.koteAttendance} — ${reg.numDays} ${dict.wizard.nDays}`
                                : reg.isStayingInMotel
                                ? dict.common.partialMotel
                                : reg.selectedDays.length > 0
                                ? formatSelectedDays(event.start_date, reg.selectedDays)
                                : `${reg.numDays} ${dict.wizard.nDays}`}
                            </p>
                            {q && q.mealCount > 0 && (
                              <p className="text-xs text-amber-600 mt-0.5 ml-6">
                                🍽️ {q.mealCount} {dict.wizard.meal} (+${q.mealTotal.toFixed(2)})
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold text-sm ${q?.amount === 0 && (!q?.mealTotal) ? "text-brand-green" : "text-foreground"}`}>
                              {q ? (q.amount === 0 ? dict.common.free : `$${q.amount.toFixed(2)}`) : "—"}
                            </p>
                            {q && q.mealTotal > 0 && (
                              <p className="text-xs text-amber-600">+${q.mealTotal.toFixed(2)} {dict.wizard.meal}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pricing summary */}
                  {groupQuote && (
                    <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{dict.common.subtotal}</span>
                        <span>${groupQuote.subtotal.toFixed(2)}</span>
                      </div>
                      {groupQuote.surcharge > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {groupQuote.surchargeLabel || dict.common.lateSurcharge}
                          </span>
                          <span className="text-amber-600">+${groupQuote.surcharge.toFixed(2)}</span>
                        </div>
                      )}
                      {groupQuote.mealTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">🍽️ {dict.wizard.meal}</span>
                          <span className="text-amber-600">+${groupQuote.mealTotal.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{dict.common.total}</span>
                        <span className={`text-2xl font-bold ${groupQuote.grandTotal === 0 ? "text-brand-green" : "text-brand-amber-foreground"}`}>
                          {groupQuote.grandTotal === 0 ? dict.common.free : `$${groupQuote.grandTotal.toFixed(2)}`}
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

      {/* ─── Sticky price summary sidebar ─── */}
      <div className="hidden lg:block">
        <Card className="sticky top-6 shadow-brand-lg brand-gradient-border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-brand-teal" />
              {dict.wizard.priceSummary}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{event.name}</p>

            {groupQuote ? (
              <>
                {groupQuote.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate mr-2">
                      {registrants[i]?.firstName || `${dict.common.person} ${i + 1}`}
                    </span>
                    <span className={item.amount === 0 ? "text-brand-green" : ""}>
                      {item.amount === 0 ? dict.common.free_lower : `$${item.amount.toFixed(2)}`}
                    </span>
                  </div>
                ))}

                <Separator className="opacity-60" />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{dict.common.subtotal}</span>
                  <span>${groupQuote.subtotal.toFixed(2)}</span>
                </div>

                {groupQuote.surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{groupQuote.surchargeLabel || dict.common.lateSurcharge}</span>
                    <span className="text-amber-600">+${groupQuote.surcharge.toFixed(2)}</span>
                  </div>
                )}

                {groupQuote.mealTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">🍽️ {dict.wizard.meal}</span>
                    <span className="text-amber-600">+${groupQuote.mealTotal.toFixed(2)}</span>
                  </div>
                )}

                <Separator className="opacity-60" />

                <div className="text-center py-1">
                  <p className={`text-3xl font-bold ${groupQuote.grandTotal === 0 ? "text-brand-green" : "text-brand-amber-foreground"}`}>
                    {groupQuote.grandTotal === 0 ? dict.common.free : `$${groupQuote.grandTotal.toFixed(2)}`}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                {quoteLoading ? dict.common.calculating : quoteError ? quoteError : dict.wizard.addDetailsToSee}
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
              {registrants.length > 1 ? `${registrants.length} ${dict.common.registrants}` : dict.common.estimatedPrice}
            </p>
            <p className="text-xl font-bold text-brand-amber-foreground">
              {groupQuote
                ? groupQuote.grandTotal === 0
                  ? dict.common.free
                  : `$${groupQuote.grandTotal.toFixed(2)}`
                : "—"}
            </p>
          </div>
          {groupQuote && groupQuote.surcharge > 0 && (
            <span className="text-xs text-amber-600">
              {dict.common.inclSurcharge.replace("{amount}", groupQuote.surcharge.toFixed(2))}
            </span>
          )}
        </div>
      </div>

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
