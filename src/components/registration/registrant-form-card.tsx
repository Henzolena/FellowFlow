"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Trash2,
  Baby,
  GraduationCap,
  User,
  Users,
} from "lucide-react";
import type { Event, PricingConfig, Church } from "@/types/database";
import type { Registrant, AttendanceTypeKey, GenderKey } from "./hooks/use-wizard-state";
import type { ItemQuote } from "./hooks/use-group-quote";
import { getAgeRangeOptions } from "./hooks/use-group-quote";
import { MealSelector, type MealService } from "./meal-selector";

type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";

const AGE_ICONS: Record<string, React.ReactNode> = {
  infant: <Baby className="h-5 w-5" />,
  child: <User className="h-5 w-5" />,
  youth: <GraduationCap className="h-5 w-5" />,
  adult: <Users className="h-5 w-5" />,
};

// Helper to generate day details with dates
function getDayDetails(eventStartDate: string, dayNumber: number, locale: string = "en") {
  const [year, month, day] = eventStartDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const targetDate = new Date(start);
  targetDate.setDate(start.getDate() + dayNumber - 1);

  const dateLocale = locale === "am" ? "am-ET" : "en-US";
  const dayName = targetDate.toLocaleDateString(dateLocale, { weekday: "short" });
  const monthName = targetDate.toLocaleDateString(dateLocale, { month: "short" });
  const dayNum = targetDate.getDate();

  return {
    dayName,
    monthDay: `${monthName} ${dayNum}`,
    fullDate: targetDate.toLocaleDateString(dateLocale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
  };
}

type RegistrantFormCardProps = {
  reg: Registrant;
  idx: number;
  isExpanded: boolean;
  isComplete: boolean;
  registrantsLength: number;
  quote: ItemQuote | undefined;
  errors: Record<string, string>;
  event: Event;
  pricing: PricingConfig;
  churches: Church[];
  availableMeals: MealService[];
  locale: string;
  dict: Record<string, any>;
  ageLabels: { infant: string; child: string; youth: string; adult: string };
  onToggle: () => void;
  onUpdate: (fields: Partial<Registrant>) => void;
  onRemove: () => void;
};

export const RegistrantFormCard = memo(function RegistrantFormCard({
  reg,
  idx,
  isExpanded,
  isComplete,
  registrantsLength,
  quote,
  errors,
  event,
  pricing,
  churches,
  availableMeals,
  locale,
  dict,
  ageLabels,
  onToggle,
  onUpdate,
  onRemove,
}: RegistrantFormCardProps) {
  const dateLocale = locale === "am" ? "am-ET" : "en-US";

  return (
    <Card className={`transition-all ${isExpanded ? "ring-2 ring-primary/20" : ""}`}>
      <CardHeader className="cursor-pointer py-3 px-4" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                isComplete
                  ? "brand-gradient text-white"
                  : Object.keys(errors).length > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              }`}
            >
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
                  {quote.category} —{" "}
                  {quote.amount === 0
                    ? dict.common.free_lower
                    : `$${quote.amount.toFixed(2)}`}
                </p>
              )}
              {!isComplete && Object.keys(errors).length > 0 && !isExpanded && (
                <p className="text-xs text-destructive">
                  {dict.wizard.fieldsNeedAttention.replace(
                    "{count}",
                    String(Object.keys(errors).length)
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {registrantsLength > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${reg.firstName || `person ${idx + 1}`}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
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

              {/* Name fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`firstName-${idx}`}>
                    {dict.wizard.firstName} *
                  </Label>
                  <Input
                    id={`firstName-${idx}`}
                    value={reg.firstName}
                    onChange={(e) => onUpdate({ firstName: e.target.value })}
                    placeholder="John"
                    aria-invalid={!!errors.firstName}
                    aria-describedby={
                      errors.firstName ? `firstName-err-${idx}` : undefined
                    }
                    className={errors.firstName ? "border-destructive" : ""}
                  />
                  {errors.firstName && (
                    <p
                      id={`firstName-err-${idx}`}
                      className="text-xs text-destructive"
                      role="alert"
                    >
                      {errors.firstName}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`lastName-${idx}`}>
                    {dict.wizard.lastName} *
                  </Label>
                  <Input
                    id={`lastName-${idx}`}
                    value={reg.lastName}
                    onChange={(e) => onUpdate({ lastName: e.target.value })}
                    placeholder="Doe"
                    aria-invalid={!!errors.lastName}
                    aria-describedby={
                      errors.lastName ? `lastName-err-${idx}` : undefined
                    }
                    className={errors.lastName ? "border-destructive" : ""}
                  />
                  {errors.lastName && (
                    <p
                      id={`lastName-err-${idx}`}
                      className="text-xs text-destructive"
                      role="alert"
                    >
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              {/* Age Range */}
              <div className="space-y-2">
                <Label id={`ageRange-label-${idx}`}>{dict.wizard.ageRange} *</Label>
                {errors.ageRange && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.ageRange}
                  </p>
                )}
                <div
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                  role="radiogroup"
                  aria-labelledby={`ageRange-label-${idx}`}
                >
                  {getAgeRangeOptions(event, ageLabels).map((opt) => {
                    const selected = reg.ageRange === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${opt.name} (${opt.range} ${dict.wizard.yearsAbbr})`}
                        onClick={() =>
                          onUpdate({ ageRange: opt.key as AgeRangeKey })
                        }
                        className={`relative flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-all ${
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={
                            selected
                              ? "text-primary"
                              : "text-muted-foreground"
                          }
                        >
                          {AGE_ICONS[opt.key]}
                        </span>
                        <span
                          className={`text-xs font-semibold leading-tight ${
                            selected ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {opt.name}
                        </span>
                        <span
                          className={`text-[10px] leading-tight ${
                            selected
                              ? "text-primary/70"
                              : "text-muted-foreground"
                          }`}
                        >
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
                <Label htmlFor={`gender-${idx}`}>{dict.wizard.gender} *</Label>
                <Select
                  value={reg.gender}
                  onValueChange={(v) => onUpdate({ gender: v as GenderKey })}
                >
                  <SelectTrigger
                    id={`gender-${idx}`}
                    className={errors.gender ? "border-destructive" : ""}
                    aria-invalid={!!errors.gender}
                    aria-describedby={errors.gender ? `gender-err-${idx}` : undefined}
                  >
                    <SelectValue placeholder={dict.wizard.selectGender} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{dict.wizard.male}</SelectItem>
                    <SelectItem value="female">{dict.wizard.female}</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && (
                  <p id={`gender-err-${idx}`} className="text-xs text-destructive" role="alert">
                    {errors.gender}
                  </p>
                )}
              </div>

              {/* Church */}
              <div className="space-y-2">
                <Label htmlFor={`church-${idx}`}>{dict.wizard.church}</Label>
                <Select
                  value={reg.churchId || "__other"}
                  onValueChange={(v) => {
                    if (v === "__other") {
                      onUpdate({
                        churchId: "",
                        churchNameCustom: reg.churchNameCustom,
                        city: "",
                      });
                    } else {
                      const selectedChurch = churches.find((c) => c.id === v);
                      onUpdate({
                        churchId: v,
                        churchNameCustom: "",
                        city: selectedChurch?.city || "",
                      });
                    }
                  }}
                >
                  <SelectTrigger id={`church-${idx}`}>
                    <SelectValue placeholder={dict.wizard.selectChurch} />
                  </SelectTrigger>
                  <SelectContent>
                    {churches.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__other">
                      {dict.wizard.otherChurch}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {!reg.churchId && (
                  <Input
                    value={reg.churchNameCustom}
                    onChange={(e) =>
                      onUpdate({ churchNameCustom: e.target.value })
                    }
                    placeholder={dict.wizard.customChurchName}
                    className="mt-2"
                    aria-label={dict.wizard.customChurchName}
                  />
                )}
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor={`city-${idx}`}>{dict.wizard.city} *</Label>
                <Input
                  id={`city-${idx}`}
                  value={reg.city}
                  onChange={(e) => onUpdate({ city: e.target.value })}
                  placeholder="Dallas, TX"
                  disabled={!!reg.churchId}
                  aria-invalid={!!errors.city}
                  aria-describedby={errors.city ? `city-err-${idx}` : undefined}
                  className={
                    reg.churchId
                      ? "bg-muted cursor-not-allowed"
                      : errors.city
                      ? "border-destructive"
                      : ""
                  }
                />
                {errors.city && (
                  <p id={`city-err-${idx}`} className="text-xs text-destructive" role="alert">
                    {errors.city}
                  </p>
                )}
                {reg.churchId && (
                  <p className="text-xs text-muted-foreground">
                    {dict.wizard.autoFilledFromChurch}
                  </p>
                )}
              </div>

              {/* T-Shirt Size (optional, not for infants) */}
              {reg.ageRange && reg.ageRange !== "infant" && (
                <div className="space-y-2">
                  <Label htmlFor={`tshirt-${idx}`}>
                    {dict.wizard.tshirtSize}{" "}
                    <span className="text-muted-foreground font-normal text-xs">
                      {dict.wizard.tshirtOptional}
                    </span>
                  </Label>
                  <Select
                    value={reg.tshirtSize || "__none"}
                    onValueChange={(v) =>
                      onUpdate({ tshirtSize: v === "__none" ? "" : v })
                    }
                  >
                    <SelectTrigger id={`tshirt-${idx}`}>
                      <SelectValue placeholder={dict.wizard.selectSize} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">
                        {dict.wizard.noPreference}
                      </SelectItem>
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
                <Label id={`attendance-label-${idx}`}>{dict.wizard.attendanceType} *</Label>
                {errors.attendanceType && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.attendanceType}
                  </p>
                )}
                <RadioGroup
                  value={reg.attendanceType}
                  aria-labelledby={`attendance-label-${idx}`}
                  onValueChange={(v) => {
                    const att = v as AttendanceTypeKey;
                    onUpdate({
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
                    <RadioGroupItem
                      value="full_conference"
                      id={`att-full-${idx}`}
                    />
                    <Label
                      htmlFor={`att-full-${idx}`}
                      className="font-normal"
                    >
                      {dict.wizard.fullConference} ({event.duration_days}{" "}
                      {dict.common.days})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="partial"
                      id={`att-partial-${idx}`}
                    />
                    <Label
                      htmlFor={`att-partial-${idx}`}
                      className="font-normal"
                    >
                      {dict.wizard.partialAttendance}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="kote" id={`att-kote-${idx}`} />
                    <Label
                      htmlFor={`att-kote-${idx}`}
                      className="font-normal"
                    >
                      {dict.wizard.koteAttendance}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {dict.wizard.koteAttendanceDesc}
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Partial / KOTE sub-fields: multi-select day cards */}
              <AnimatePresence>
                {(reg.attendanceType === "partial" ||
                  reg.attendanceType === "kote") && (
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
                          {reg.selectedDays.length}{" "}
                          {reg.selectedDays.length === 1
                            ? dict.common.day
                            : dict.common.days}
                        </Badge>
                      )}
                    </div>
                    <div
                      className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                      role="group"
                      aria-label={dict.wizard.numberOfDays}
                    >
                      {Array.from(
                        { length: event.duration_days },
                        (_, i) => i + 1
                      ).map((d) => {
                        const selected = reg.selectedDays.includes(d);
                        const dayInfo = getDayDetails(
                          event.start_date,
                          d,
                          locale
                        );
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${dayInfo.fullDate}${
                              selected ? " (selected)" : ""
                            }`}
                            onClick={() => {
                              const days = selected
                                ? reg.selectedDays.filter((x) => x !== d)
                                : [...reg.selectedDays, d].sort(
                                    (a, b) => a - b
                                  );
                              onUpdate({
                                selectedDays: days,
                                numDays: days.length,
                              });
                            }}
                            className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3.5 text-center transition-all ${
                              selected
                                ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                                : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                            }`}
                          >
                            <span
                              className={`text-[11px] font-bold uppercase tracking-wide ${
                                selected
                                  ? "text-primary"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {dayInfo.dayName}
                            </span>
                            <span
                              className={`text-xl font-bold leading-none ${
                                selected
                                  ? "text-primary"
                                  : "text-foreground"
                              }`}
                            >
                              {dayInfo.monthDay.split(" ")[1]}
                            </span>
                            <span
                              className={`text-[10px] font-semibold leading-tight ${
                                selected
                                  ? "text-primary/70"
                                  : "text-muted-foreground/70"
                              }`}
                            >
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
                    {errors.selectedDays && (
                      <p className="text-xs text-destructive" role="alert">
                        {errors.selectedDays}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {dict.wizard.tapDaysToAttend}
                    </p>

                    {/* KOTE Meal Selection */}
                    {reg.attendanceType === "kote" && (
                      <MealSelector
                        registrantIdx={idx}
                        ageRange={reg.ageRange}
                        selectedDays={reg.selectedDays}
                        selectedMealIds={reg.selectedMealIds}
                        availableMeals={availableMeals}
                        eventStartDate={event.start_date}
                        pricing={pricing}
                        dateLocale={dateLocale}
                        dict={dict}
                        onUpdateMeals={(mealIds) =>
                          onUpdate({ selectedMealIds: mealIds })
                        }
                      />
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
});
