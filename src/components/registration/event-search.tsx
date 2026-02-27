"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO, isPast, isFuture, isWithinInterval } from "date-fns";
import {
  Calendar,
  ArrowRight,
  Clock,
  Search,
  CalendarDays,
} from "lucide-react";
import type { EventWithPricing, PricingConfig } from "@/types/database";

type Props = {
  events: EventWithPricing[];
};

type TimeFilter = "all" | "upcoming" | "ongoing" | "past";

function getLowestPrice(event: EventWithPricing): number | null {
  const pc = Array.isArray(event.pricing_config)
    ? event.pricing_config[0]
    : event.pricing_config;
  if (!pc) return null;
  const prices = [
    Number(pc.adult_full_price),
    Number(pc.adult_daily_price),
    Number(pc.youth_full_price),
    Number(pc.youth_daily_price),
    Number(pc.child_full_price),
    Number(pc.child_daily_price),
  ].filter((p) => p > 0);
  return prices.length > 0 ? Math.min(...prices) : 0;
}

function getEventStatus(event: EventWithPricing): "upcoming" | "ongoing" | "past" {
  const now = new Date();
  const start = parseISO(event.start_date);
  const end = parseISO(event.end_date);
  if (isFuture(start)) return "upcoming";
  if (isPast(end)) return "past";
  return "ongoing";
}

const statusConfig = {
  upcoming: { label: "Upcoming", className: "bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20" },
  ongoing: { label: "Happening Now", className: "bg-brand-green/10 text-brand-green border-brand-green/20" },
  past: { label: "Ended", className: "bg-muted text-muted-foreground border-border" },
};

export function EventSearch({ events }: Props) {
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const filtered = useMemo(() => {
    return events.filter((event) => {
      // Text search
      if (query) {
        const q = query.toLowerCase();
        const matchesName = event.name.toLowerCase().includes(q);
        const matchesDesc = event.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }

      // Time filter
      if (timeFilter !== "all") {
        const status = getEventStatus(event);
        if (status !== timeFilter) return false;
      }

      return true;
    });
  }, [events, query, timeFilter]);

  const counts = useMemo(() => {
    const c = { all: events.length, upcoming: 0, ongoing: 0, past: 0 };
    events.forEach((e) => {
      c[getEventStatus(e)]++;
    });
    return c;
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Search + Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events by name or description..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={timeFilter}
          onValueChange={(v) => setTimeFilter(v as TimeFilter)}
        >
          <SelectTrigger className="w-full sm:w-48">
            <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Filter by time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events ({counts.all})</SelectItem>
            <SelectItem value="upcoming">Upcoming ({counts.upcoming})</SelectItem>
            <SelectItem value="ongoing">Happening Now ({counts.ongoing})</SelectItem>
            <SelectItem value="past">Past ({counts.past})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length === 0
          ? "No events found"
          : `Showing ${filtered.length} event${filtered.length !== 1 ? "s" : ""}`}
      </p>

      {/* Event cards */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold">No events found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {query
              ? "Try a different search term or filter."
              : "There are no active events at the moment. Check back later."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((event) => {
            const status = getEventStatus(event);
            const config = statusConfig[status];
            const lowestPrice = getLowestPrice(event);
            const isPastEvent = status === "past";

            return (
              <Card
                key={event.id}
                className={`shadow-brand-sm hover:shadow-brand-md transition-shadow overflow-hidden ${
                  isPastEvent ? "opacity-60" : ""
                }`}
              >
                {/* Gradient top accent */}
                <div className="h-1 brand-gradient" />
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-semibold text-lg leading-snug truncate">
                        {event.name}
                      </h3>
                      {event.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${config.className}`}
                    >
                      {config.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-brand-teal" />
                      <span>
                        {format(parseISO(event.start_date), "MMM d")} –{" "}
                        {format(parseISO(event.end_date), "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-brand-cyan" />
                      <span>{event.duration_days} days</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {lowestPrice !== null && (
                      <p className="text-sm">
                        {lowestPrice === 0 ? (
                          <span className="font-semibold text-brand-green">Free</span>
                        ) : (
                          <>
                            From{" "}
                            <span className="font-semibold text-brand-amber-foreground">
                              ${lowestPrice.toFixed(0)}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                    {!isPastEvent ? (
                      <Link href={`/register/${event.id}`}>
                        <Button
                          size="sm"
                          className="gap-1.5 shadow-brand-sm hover:shadow-brand-md transition-shadow"
                        >
                          Register
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" variant="outline" disabled>
                        Registration Closed
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
