"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User } from "lucide-react";
import type { Registrant, ContactInfo } from "./hooks/use-wizard-state";
import type { GroupQuote } from "./hooks/use-group-quote";
import { formatSelectedDays } from "@/lib/date-utils";

type ReviewStepProps = {
  contact: ContactInfo;
  registrants: Registrant[];
  groupQuote: GroupQuote | null;
  eventStartDate: string;
  error: string | null;
  dict: Record<string, any>;
};

export const ReviewStep = memo(function ReviewStep({
  contact,
  registrants,
  groupQuote,
  eventStartDate,
  error,
  dict,
}: ReviewStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dict.wizard.reviewAndSubmit}</CardTitle>
        <CardDescription>{dict.wizard.reviewDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* Contact info */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-1">
          <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {dict.common.contact}
          </h4>
          <p className="text-sm">{contact.email}</p>
          {contact.phone && (
            <p className="text-sm text-muted-foreground">{contact.phone}</p>
          )}
        </div>

        {/* Registrants */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {dict.common.registrants} ({registrants.length})
          </h4>
          {registrants.map((reg, idx) => {
            const q = groupQuote?.items?.[idx];
            return (
              <div
                key={reg.id}
                className="rounded-lg bg-muted/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-sm">
                      {reg.firstName} {reg.lastName}
                    </p>
                    {q && (
                      <Badge
                        variant="secondary"
                        className="capitalize text-xs"
                      >
                        {q.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    {reg.attendanceType === "full_conference"
                      ? dict.wizard.fullConference
                      : reg.attendanceType === "kote"
                      ? reg.selectedDays.length > 0
                        ? `${dict.wizard.koteAttendance} — ${formatSelectedDays(eventStartDate, reg.selectedDays)}`
                        : `${dict.wizard.koteAttendance} — ${reg.numDays} ${dict.wizard.nDays}`
                      : reg.isStayingInMotel
                      ? dict.common.partialMotel
                      : reg.selectedDays.length > 0
                      ? formatSelectedDays(eventStartDate, reg.selectedDays)
                      : `${reg.numDays} ${dict.wizard.nDays}`}
                  </p>
                  {q && q.mealCount > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5 ml-6">
                      🍽️ {q.mealCount} {dict.wizard.meal} (+$
                      {q.mealTotal.toFixed(2)})
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold text-sm ${
                      q?.amount === 0 && !q?.mealTotal
                        ? "text-brand-green"
                        : "text-foreground"
                    }`}
                  >
                    {q
                      ? q.amount === 0
                        ? dict.common.free
                        : `$${q.amount.toFixed(2)}`
                      : "—"}
                  </p>
                  {q && q.mealTotal > 0 && (
                    <p className="text-xs text-amber-600">
                      +${q.mealTotal.toFixed(2)} {dict.wizard.meal}
                    </p>
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
              <span className="text-muted-foreground">
                {dict.common.subtotal}
              </span>
              <span>${groupQuote.subtotal.toFixed(2)}</span>
            </div>
            {groupQuote.surcharge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {groupQuote.surchargeLabel || dict.common.lateSurcharge}
                </span>
                <span className="text-amber-600">
                  +${groupQuote.surcharge.toFixed(2)}
                </span>
              </div>
            )}
            {groupQuote.mealTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  🍽️ {dict.wizard.meal}
                </span>
                <span className="text-amber-600">
                  +${groupQuote.mealTotal.toFixed(2)}
                </span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-semibold">{dict.common.total}</span>
              <span
                className={`text-2xl font-bold ${
                  groupQuote.grandTotal === 0
                    ? "text-brand-green"
                    : "text-brand-amber-foreground"
                }`}
              >
                {groupQuote.grandTotal === 0
                  ? dict.common.free
                  : `$${groupQuote.grandTotal.toFixed(2)}`}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
