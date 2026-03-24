"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Users } from "lucide-react";
import type { Registrant } from "./hooks/use-wizard-state";
import type { GroupQuote } from "./hooks/use-group-quote";

type WizardPriceSidebarProps = {
  eventName: string;
  registrants: Registrant[];
  groupQuote: GroupQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  dict: Record<string, any>;
};

export const WizardPriceSidebar = memo(function WizardPriceSidebar({
  eventName,
  registrants,
  groupQuote,
  quoteLoading,
  quoteError,
  dict,
}: WizardPriceSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Card className="sticky top-6 shadow-brand-lg brand-gradient-border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-brand-teal" />
              {dict.wizard.priceSummary}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{eventName}</p>

            {groupQuote ? (
              <>
                {groupQuote.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate mr-2">
                      {registrants[i]?.firstName ||
                        `${dict.common.person} ${i + 1}`}
                    </span>
                    <span className={item.amount === 0 ? "text-brand-green" : ""}>
                      {item.amount === 0
                        ? dict.common.free_lower
                        : `$${item.amount.toFixed(2)}`}
                    </span>
                  </div>
                ))}

                <Separator className="opacity-60" />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {dict.common.subtotal}
                  </span>
                  <span>${groupQuote.subtotal.toFixed(2)}</span>
                </div>

                {groupQuote.surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">
                      {groupQuote.surchargeLabel || dict.common.lateSurcharge}
                    </span>
                    <span className="text-amber-600">
                      +${groupQuote.surcharge.toFixed(2)}
                    </span>
                  </div>
                )}

                {groupQuote.mealTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">
                      🍽️ {dict.wizard.meal}
                    </span>
                    <span className="text-amber-600">
                      +${groupQuote.mealTotal.toFixed(2)}
                    </span>
                  </div>
                )}

                <Separator className="opacity-60" />

                <div className="text-center py-1">
                  <p
                    className={`text-3xl font-bold ${
                      groupQuote.grandTotal === 0
                        ? "text-brand-green"
                        : "text-brand-amber-foreground"
                    }`}
                  >
                    {groupQuote.grandTotal === 0
                      ? dict.common.free
                      : `$${groupQuote.grandTotal.toFixed(2)}`}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                {quoteLoading
                  ? dict.common.calculating
                  : quoteError
                  ? quoteError
                  : dict.wizard.addDetailsToSee}
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
              {registrants.length > 1
                ? `${registrants.length} ${dict.common.registrants}`
                : dict.common.estimatedPrice}
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
              {dict.common.inclSurcharge.replace(
                "{amount}",
                groupQuote.surcharge.toFixed(2)
              )}
            </span>
          )}
        </div>
      </div>
    </>
  );
});
