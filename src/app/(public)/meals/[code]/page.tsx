"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  UtensilsCrossed,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Coffee,
  Sun,
  Moon,
  CreditCard,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type MealItem = {
  id: string;
  service_name: string;
  meal_type: string | null;
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  isPurchased: boolean;
  isUsed: boolean;
  isFuture: boolean;
  canPurchase: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MealData = {
  registration: {
    id: string;
    firstName: string;
    lastName: string;
    category: string;
    attendanceType: string;
    confirmationCode: string;
    secureToken: string;
  };
  event: {
    name: string;
    startDate: string;
    endDate: string;
  };
  unitPrice: number;
  meals: MealItem[];
  purchases: {
    id: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    created_at: string;
    meal_purchase_items: { service_id: string; unit_price: number }[];
  }[];
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

function formatTime(timeStr: string | null) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function MealPurchasePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const isSuccess = searchParams.get("success") === "true";
  const isCancelled = searchParams.get("cancelled") === "true";

  const [data, setData] = useState<MealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMeals, setSelectedMeals] = useState<Set<string>>(new Set());
  const [purchasing, setPurchasing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const paramKey = UUID_RE.test(code) ? "token" : "code";
      const res = await fetch(`/api/meals/available?${paramKey}=${encodeURIComponent(code)}`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to load meals");
        return;
      }
      const d = await res.json();
      setData(d);
      setError("");
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isSuccess) toast.success("Meals purchased successfully! Your entitlements are now active.");
    if (isCancelled) toast.info("Payment was cancelled. You can try again anytime.");
  }, [isSuccess, isCancelled]);

  function toggleMeal(mealId: string) {
    setSelectedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
  }

  function selectAllAvailable() {
    if (!data) return;
    const available = data.meals.filter((m) => m.canPurchase).map((m) => m.id);
    setSelectedMeals(new Set(available));
  }

  function clearSelection() {
    setSelectedMeals(new Set());
  }

  async function handlePurchase() {
    if (selectedMeals.size === 0) return;
    setPurchasing(true);
    try {
      const isToken = UUID_RE.test(code);
      const res = await fetch("/api/meals/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isToken ? { secureToken: code } : { confirmationCode: code }),
          serviceIds: [...selectedMeals],
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to create payment");
        return;
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPurchasing(false);
    }
  }

  const selectedCount = selectedMeals.size;
  const totalAmount = data ? selectedCount * data.unitPrice : 0;

  // Group meals by date
  const mealsByDate = new Map<string, MealItem[]>();
  if (data) {
    for (const meal of data.meals) {
      const key = meal.service_date || "undated";
      if (!mealsByDate.has(key)) mealsByDate.set(key, []);
      mealsByDate.get(key)!.push(meal);
    }
  }

  const purchasedCount = data?.meals.filter((m) => m.isPurchased).length ?? 0;
  const availableCount = data?.meals.filter((m) => m.canPurchase).length ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Loading meal options...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold">Unable to Load Meals</h1>
          <p className="text-muted-foreground text-sm">{error || "Registration not found"}</p>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-background dark:from-amber-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
            <UtensilsCrossed className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Meal Tickets</h1>
          <p className="text-muted-foreground text-sm">
            {data.event.name}
          </p>
        </div>

        {/* Registration Info Card */}
        <div className="rounded-xl border bg-card p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{data.registration.firstName} {data.registration.lastName}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {data.registration.attendanceType.replace("_", " ")} · {data.registration.category}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs text-muted-foreground">{data.registration.confirmationCode}</p>
              <p className="text-sm font-semibold text-primary">
                ${data.unitPrice.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/meal</span>
              </p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 rounded-lg border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{purchasedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Purchased</p>
          </div>
          <div className="flex-1 rounded-lg border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{availableCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Available</p>
          </div>
          <div className="flex-1 rounded-lg border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-primary">{selectedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Selected</p>
          </div>
        </div>

        {/* Quick actions */}
        {availableCount > 0 && (
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" className="text-xs" onClick={selectAllAvailable}>
              Select All Available ({availableCount})
            </Button>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={clearSelection}>
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Meals grouped by date */}
        <div className="space-y-6">
          {[...mealsByDate.entries()].map(([dateKey, meals]) => (
            <div key={dateKey} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {dateKey !== "undated" ? formatDate(dateKey) : "Undated"}
              </h3>
              <div className="space-y-2">
                {meals.map((meal) => {
                  const Icon = mealIcons[meal.meal_type || ""] || UtensilsCrossed;
                  const isSelected = selectedMeals.has(meal.id);

                  return (
                    <div
                      key={meal.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                        meal.isPurchased
                          ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                          : !meal.isFuture
                          ? "bg-muted/30 border-border/50 opacity-60"
                          : isSelected
                          ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
                          : "bg-card hover:bg-muted/30"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        meal.isPurchased
                          ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                          : isSelected
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {meal.isPurchased ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">{meal.meal_type || meal.service_name}</p>
                        {meal.start_time && (
                          <p className="text-xs text-muted-foreground">{formatTime(meal.start_time)}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {meal.isPurchased ? (
                          <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                            {meal.isUsed ? "Used" : "Purchased"}
                          </span>
                        ) : !meal.isFuture ? (
                          <span className="text-xs text-muted-foreground">Past</span>
                        ) : (
                          <>
                            <span className="text-sm font-semibold">${data.unitPrice.toFixed(2)}</span>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleMeal(meal.id)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Purchase footer */}
        {selectedCount > 0 && (
          <>
            <Separator className="my-6" />
            <div className="sticky bottom-4 rounded-xl border bg-card p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">{selectedCount} meal{selectedCount !== 1 ? "s" : ""} selected</p>
                  <p className="text-xs text-muted-foreground">${data.unitPrice.toFixed(2)} × {selectedCount}</p>
                </div>
                <p className="text-2xl font-bold">${totalAmount.toFixed(2)}</p>
              </div>
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handlePurchase}
                disabled={purchasing}
              >
                {purchasing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Pay ${totalAmount.toFixed(2)} with Card
              </Button>
            </div>
          </>
        )}

        {/* Purchase history */}
        {data.purchases.length > 0 && (
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Purchase History
            </h3>
            <div className="space-y-2">
              {data.purchases.map((p) => (
                <div key={p.id} className="rounded-lg border bg-card p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {p.meal_purchase_items.length} meal{p.meal_purchase_items.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {p.payment_method} · {new Date(p.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">${Number(p.total_amount).toFixed(2)}</p>
                    <span className={`text-[10px] font-medium uppercase ${
                      p.payment_status === "completed" ? "text-green-600" : "text-amber-600"
                    }`}>
                      {p.payment_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refresh button */}
        <div className="mt-8 text-center">
          <Button variant="ghost" size="sm" onClick={fetchData} className="text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
