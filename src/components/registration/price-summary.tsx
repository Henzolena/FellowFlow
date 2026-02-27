"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, User, Calendar, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgeCategory } from "@/types/database";

type PriceSummaryProps = {
  eventName?: string;
  category?: AgeCategory;
  isFullDuration?: boolean;
  isStayingInMotel?: boolean;
  numDays?: number;
  amount?: number;
  explanationDetail?: string;
  loading?: boolean;
};

const categoryColors: Record<AgeCategory, string> = {
  adult: "bg-blue-100 text-blue-800",
  youth: "bg-green-100 text-green-800",
  child: "bg-orange-100 text-orange-800",
};

export function PriceSummary({
  eventName,
  category,
  isFullDuration,
  isStayingInMotel,
  numDays,
  amount,
  explanationDetail,
  loading,
}: PriceSummaryProps) {
  return (
    <Card className="sticky top-6 shadow-brand-lg brand-gradient-border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-brand-teal" />
          Price Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {eventName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 text-brand-cyan" />
            <span>{eventName}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {category && (
            <motion.div
              key="category"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <Badge variant="secondary" className={categoryColors[category]}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>

        {isFullDuration !== undefined && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{isFullDuration ? "Full Conference" : `${numDays || "?"} Day(s)`}</span>
          </div>
        )}

        {isStayingInMotel !== undefined && isFullDuration && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="h-4 w-4" />
            <span>{isStayingInMotel ? "Motel Stay" : "No Motel"}</span>
          </div>
        )}

        <Separator className="opacity-60" />

        <AnimatePresence mode="wait">
          {amount !== undefined && !loading ? (
            <motion.div
              key={`amount-${amount}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="text-center py-1"
            >
              <p className={`text-3xl font-bold ${amount === 0 ? "text-brand-green" : "text-brand-amber-foreground"}`}>
                {amount === 0 ? "FREE" : `$${amount.toFixed(2)}`}
              </p>
              {explanationDetail && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {explanationDetail}
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <p className="text-sm text-muted-foreground">
                {loading ? "Calculating..." : "Complete the form to see pricing"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
