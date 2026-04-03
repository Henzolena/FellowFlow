"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  UtensilsCrossed,
  CheckCircle2,
  Coffee,
  Sun,
  Moon,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";

type MealService = {
  id: string;
  service_name: string;
  meal_type: string | null;
  service_date: string | null;
  start_time: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  registrationId: string;
  eventId: string;
  category: string; // "adult" | "youth" | "child"
  registrantName: string;
  existingEntitlements: { service_id: string; status: string }[];
  onSuccess: () => void;
};

const mealIcons: Record<string, typeof Coffee> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function SellMealsDialog({
  open,
  onOpenChange,
  registrationId,
  eventId,
  category,
  registrantName,
  existingEntitlements,
  onSuccess,
}: Props) {
  const [meals, setMeals] = useState<MealService[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [notes, setNotes] = useState("");
  const [success, setSuccess] = useState(false);
  const [unitPrice, setUnitPrice] = useState(12);

  const existingSet = new Set(
    existingEntitlements
      .filter((e) => e.status === "allowed" || e.status === "paid_extra")
      .map((e) => e.service_id)
  );

  useEffect(() => {
    if (!open || !eventId) return;
    async function fetchMeals() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/services?eventId=${eventId}`);
        if (res.ok) {
          const data = await res.json();
          const allServices = data.services || data || [];
          const mealServices = (Array.isArray(allServices) ? allServices : [])
            .filter((s: { service_category: string; is_active: boolean }) => s.service_category === "meal" && s.is_active);
          setMeals(mealServices);
        }

        // Fetch pricing
        const pRes = await fetch(`/api/admin/events`);
        if (pRes.ok) {
          const events = await pRes.json();
          const evt = events.find((e: { id: string }) => e.id === eventId);
          if (evt?.pricing_config) {
            const pc = Array.isArray(evt.pricing_config) ? evt.pricing_config[0] : evt.pricing_config;
            // Child pays child price, youth and adult both pay adult price
            const price = category === "child" ? (pc.meal_price_child ?? 8) : (pc.meal_price_adult ?? 12);
            setUnitPrice(price);
          }
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    fetchMeals();
    setSelectedMeals(new Set());
    setSuccess(false);
    setNotes("");
  }, [open, eventId, category]);

  function toggleMeal(id: string) {
    setSelectedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAvailable() {
    const available = meals.filter((m) => !existingSet.has(m.id)).map((m) => m.id);
    setSelectedMeals(new Set(available));
  }

  async function handleSubmit() {
    if (selectedMeals.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/meal-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId,
          eventId,
          serviceIds: [...selectedMeals],
          paymentMethod,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to sell meals");
        return;
      }

      const result = await res.json();
      toast.success(`${result.mealsAdded} meal(s) sold — $${result.totalAmount.toFixed(2)} (${paymentMethod})`);
      setSuccess(true);
      onSuccess();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCount = selectedMeals.size;
  const totalAmount = selectedCount * unitPrice;

  // Group by date
  const mealsByDate = new Map<string, MealService[]>();
  for (const meal of meals) {
    const key = meal.service_date || "undated";
    if (!mealsByDate.has(key)) mealsByDate.set(key, []);
    mealsByDate.get(key)!.push(meal);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-amber-600" />
            Sell Meals
          </DialogTitle>
          <DialogDescription>
            Sell individual meal tickets to <span className="font-semibold">{registrantName}</span>
            {" "}— ${unitPrice.toFixed(2)}/meal ({category})
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="font-semibold text-lg">Meals Sold!</p>
            <p className="text-sm text-muted-foreground">
              Entitlements have been created. The attendee can now scan for these meals.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => { setSuccess(false); setSelectedMeals(new Set()); }}>
                Sell More
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading meals...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick select */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={selectAllAvailable}>
                Select All Available
              </Button>
              {selectedCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedMeals(new Set())}>
                  Clear
                </Button>
              )}
            </div>

            {/* Meal list grouped by date */}
            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
              {[...mealsByDate.entries()].map(([dateKey, dateMeals]) => (
                <div key={dateKey} className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {dateKey !== "undated" ? formatDate(dateKey) : "Undated"}
                  </p>
                  {dateMeals.map((meal) => {
                    const Icon = mealIcons[meal.meal_type || ""] || UtensilsCrossed;
                    const alreadyHas = existingSet.has(meal.id);
                    const isSelected = selectedMeals.has(meal.id);

                    return (
                      <label
                        key={meal.id}
                        className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                          alreadyHas
                            ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800 opacity-70 cursor-default"
                            : isSelected
                            ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${alreadyHas ? "text-green-600" : isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="flex-1 text-sm capitalize">{meal.meal_type || meal.service_name}</span>
                        {alreadyHas ? (
                          <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Already has</span>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground">${unitPrice.toFixed(2)}</span>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleMeal(meal.id)}
                            />
                          </>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            {selectedCount > 0 && (
              <>
                <Separator />

                {/* Payment method */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Method
                  </Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "card")}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card (on-site)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="text-sm"
                />

                {/* Total */}
                <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">{selectedCount} meal{selectedCount !== 1 ? "s" : ""}</p>
                      <p className="text-xs text-muted-foreground">${unitPrice.toFixed(2)} × {selectedCount}</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold">${totalAmount.toFixed(2)}</p>
                </div>
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting || selectedCount === 0}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Sale — ${totalAmount.toFixed(2)}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
