"use client";

import { Check, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { PricingConfig } from "@/types/database";

export type MealService = {
  id: string;
  service_name: string;
  service_code: string;
  meal_type: string | null;
  service_date: string | null;
  start_time: string | null;
  display_order: number;
};

type MealSelectorProps = {
  registrantIdx: number;
  ageRange: string;
  selectedDays: number[];
  selectedMealIds: string[];
  availableMeals: MealService[];
  eventStartDate: string;
  pricing: PricingConfig;
  dateLocale: string;
  dict: Record<string, any>;
  onUpdateMeals: (mealIds: string[]) => void;
};

export function MealSelector({
  ageRange,
  selectedDays,
  selectedMealIds,
  availableMeals,
  eventStartDate,
  pricing,
  dateLocale,
  dict,
  onUpdateMeals,
}: MealSelectorProps) {
  if (selectedDays.length === 0) return null;

  // Filter meals to only show those on selected days
  const pad = (n: number) => String(n).padStart(2, "0");
  const selectedDateStrings = selectedDays.map((d) => {
    const [y, m, day] = eventStartDate.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    dt.setDate(dt.getDate() + d - 1);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  });
  const mealsForDays = availableMeals.filter(
    (meal) => meal.service_date && selectedDateStrings.includes(meal.service_date)
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
  // Meal pricing based on canonical age range (same for ALL attendance types)
  // Infant: FREE, Child: $8, Youth/Adult: $12
  const mealPrice = (() => {
    if (ageRange === "infant") return 0;
    if (ageRange === "child") return Number(pricing.meal_price_child ?? 8);
    return Number(pricing.meal_price_adult ?? 12);
  })();

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-amber-200/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-amber-600" />
          <Label className="text-amber-800 dark:text-amber-300 font-semibold text-sm">
            {dict.wizard.addMealsOptional}
          </Label>
        </div>
        {selectedMealIds.length > 0 && (
          <Badge
            variant="secondary"
            className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
          >
            {selectedMealIds.length} {dict.wizard.meal} · $
            {(selectedMealIds.length * mealPrice).toFixed(0)}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {dict.wizard.perMealSelectMeals.replace("${price}", String(mealPrice))}
      </p>

      {Array.from(mealsByDate.entries()).map(([date, meals]) => {
        const [y, m, d] = date.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        const dayLabel = dt.toLocaleDateString(dateLocale, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const allSelected = meals.every((meal) =>
          selectedMealIds.includes(meal.id)
        );

        return (
          <div key={date} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {dayLabel}
              </p>
              <button
                type="button"
                className="text-[10px] text-amber-600 hover:text-amber-700 font-medium"
                aria-label={allSelected ? `Deselect all meals for ${dayLabel}` : `Select all meals for ${dayLabel}`}
                onClick={() => {
                  if (allSelected) {
                    const mealIds = meals.map((m) => m.id);
                    onUpdateMeals(
                      selectedMealIds.filter((id) => !mealIds.includes(id))
                    );
                  } else {
                    const newIds = new Set([
                      ...selectedMealIds,
                      ...meals.map((m) => m.id),
                    ]);
                    onUpdateMeals(Array.from(newIds));
                  }
                }}
              >
                {allSelected ? dict.wizard.deselect : dict.wizard.selectAll}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`Meals for ${dayLabel}`}>
              {meals.map((meal) => {
                const isSelected = selectedMealIds.includes(meal.id);
                return (
                  <button
                    key={meal.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${mealTypeLabel(meal.meal_type)}${meal.start_time ? ` at ${meal.start_time.slice(0, 5)}` : ""}${isSelected ? " (selected)" : ""}`}
                    onClick={() => {
                      const ids = isSelected
                        ? selectedMealIds.filter((id) => id !== meal.id)
                        : [...selectedMealIds, meal.id];
                      onUpdateMeals(ids);
                    }}
                    className={`relative flex flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-2 text-center transition-all text-xs ${
                      isSelected
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300"
                        : "border-muted hover:border-amber-300/60 hover:bg-amber-50/50"
                    }`}
                  >
                    <span
                      className={`font-semibold ${
                        isSelected
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-foreground"
                      }`}
                    >
                      {mealTypeLabel(meal.meal_type)}
                    </span>
                    {meal.start_time && (
                      <span
                        className={`text-[10px] ${
                          isSelected
                            ? "text-amber-600/70"
                            : "text-muted-foreground"
                        }`}
                      >
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
}
