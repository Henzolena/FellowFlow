"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Zap, Users, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import type { Event, PricingConfig } from "@/types/database";
import { useTranslation } from "@/lib/i18n/context";

type KoteRegistrant = {
  id: string;
  firstName: string;
  lastName: string;
  numDays: number;
};

let _nextId = 1;
function genId() {
  return `kote-${_nextId++}`;
}

export default function KotePage() {
  const router = useRouter();
  const { dict } = useTranslation();
  const [event, setEvent] = useState<(Event & { pricing_config: PricingConfig[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [registrants, setRegistrants] = useState<KoteRegistrant[]>([
    { id: genId(), firstName: "", lastName: "", numDays: 1 },
  ]);
  const [email, setEmail] = useState("");

  // Fetch the active event
  useEffect(() => {
    fetch("/api/events?active=true")
      .then((r) => r.json())
      .then((data) => {
        const events = Array.isArray(data) ? data : data.events ?? [];
        const active = events.find((e: Event) => e.is_active);
        setEvent(active || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pricing = event?.pricing_config?.[0];
  const koteDailyPrice = pricing?.kote_daily_price ?? 10;
  const durationDays = event?.duration_days ?? 5;

  const subtotal = registrants.reduce((sum, r) => sum + r.numDays * koteDailyPrice, 0);

  function addRegistrant() {
    setRegistrants((prev) => [...prev, { id: genId(), firstName: "", lastName: "", numDays: 1 }]);
  }

  function removeRegistrant(idx: number) {
    if (registrants.length <= 1) return;
    setRegistrants((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRegistrant(idx: number, fields: Partial<KoteRegistrant>) {
    setRegistrants((prev) => prev.map((r, i) => (i === idx ? { ...r, ...fields } : r)));
  }

  const allValid =
    email.trim() !== "" &&
    registrants.every((r) => r.firstName.trim() && r.lastName.trim() && r.numDays >= 1);

  async function handleSubmit() {
    if (!event || !allValid) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/registration/create-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          email,
          registrants: registrants.map((r) => ({
            firstName: r.firstName,
            lastName: r.lastName,
            dateOfBirth: "1990-01-01",
            gender: undefined,
            attendanceType: "kote",
            isFullDuration: false,
            numDays: r.numDays,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        setSubmitting(false);
        return;
      }

      const { groupId, registrations, grandTotal } = data;
      const primaryReg = registrations[0];
      const ln = encodeURIComponent(primaryReg.last_name);

      if (grandTotal === 0) {
        router.push(
          `/register/success?registration_id=${primaryReg.id}&free=true&ln=${ln}${groupId ? `&group_id=${groupId}` : ""}`
        );
        return;
      }

      router.push(
        `/register/review?registration_id=${primaryReg.id}&ln=${ln}${groupId ? `&group_id=${groupId}` : ""}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No active event found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="w-full max-w-lg relative space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 dark:bg-orange-900/30 px-4 py-1.5 text-sm font-medium text-orange-700 dark:text-orange-400">
            <Zap className="h-4 w-4" />
            KOTE Quick Registration
          </div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            Walk-in / off-campus attendee registration — ${koteDailyPrice}/day per person
          </p>
        </div>

        {/* Registrants */}
        <Card className="shadow-brand-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-orange-500" />
                Attendees
              </CardTitle>
              <Badge variant="secondary">{registrants.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {registrants.map((reg, idx) => (
              <div key={reg.id} className="rounded-lg border border-border/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Person {idx + 1}
                  </span>
                  {registrants.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRegistrant(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      value={reg.firstName}
                      onChange={(e) => updateRegistrant(idx, { firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      value={reg.lastName}
                      onChange={(e) => updateRegistrant(idx, { lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Number of Days *</Label>
                  <Select
                    value={String(reg.numDays)}
                    onValueChange={(v) => updateRegistrant(idx, { numDays: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: durationDays }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} {d !== 1 ? "days" : "day"} — ${(d * koteDailyPrice).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              className="w-full border-dashed gap-2"
              onClick={addRegistrant}
            >
              <Plus className="h-4 w-4" />
              Add Another Person
            </Button>
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="shadow-brand-md">
          <CardContent className="pt-6 space-y-3">
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Confirmation and receipt will be sent here
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Already registered — Buy meals */}
        <Card className="shadow-brand-sm border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="py-4 flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <UtensilsCrossed className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Already registered?</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 truncate">
                  Purchase meal tickets with your confirmation code
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
              onClick={() => router.push("/meals")}
            >
              Buy Meals →
            </Button>
          </CardContent>
        </Card>

        {/* Price Summary + Submit */}
        <Card className="shadow-brand-lg brand-gradient-border overflow-hidden">
          <CardContent className="pt-6 space-y-3">
            {registrants.map((reg, idx) => (
              <div key={reg.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate mr-2">
                  {reg.firstName || `Person ${idx + 1}`} — {reg.numDays}d
                </span>
                <span>${(reg.numDays * koteDailyPrice).toFixed(2)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-semibold">{dict.common.total}</span>
              <span className="text-2xl font-bold text-brand-amber-foreground">
                ${subtotal.toFixed(2)}
              </span>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={!allValid || submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {subtotal === 0 ? "Complete Registration" : `Pay $${subtotal.toFixed(2)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
