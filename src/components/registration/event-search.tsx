"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO, isPast, isFuture } from "date-fns";
import {
  Calendar,
  ArrowRight,
  Clock,
  Search,
  CalendarDays,
} from "lucide-react";
import type { EventWithImages } from "@/types/database";
import { useTranslation } from "@/lib/i18n/context";

type Props = {
  events: EventWithImages[];
};

type TimeFilter = "all" | "upcoming" | "ongoing" | "past";

function getLowestPrice(event: EventWithImages): number | null {
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

function getEventStatus(event: EventWithImages): "upcoming" | "ongoing" | "past" {
  const now = new Date();
  const start = parseISO(event.start_date);
  const end = parseISO(event.end_date);
  if (isFuture(start)) return "upcoming";
  if (isPast(end)) return "past";
  return "ongoing";
}

export function EventSearch({ events }: Props) {
  const { dict } = useTranslation();
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const statusConfig = {
    upcoming: {
      label: dict.events.upcoming,
      dotColor: "bg-brand-teal",
      pillClass: "bg-white/15 text-white border border-white/20",
      hasPulse: true,
    },
    ongoing: {
      label: dict.events.happeningNow,
      dotColor: "bg-brand-green",
      pillClass: "bg-white/15 text-white border border-white/20",
      hasPulse: true,
    },
    past: {
      label: dict.events.ended,
      dotColor: "",
      pillClass: "bg-black/30 text-white/60 border border-white/10",
      hasPulse: false,
    },
  };

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (query) {
        const q = query.toLowerCase();
        const matchesName = event.name.toLowerCase().includes(q);
        const matchesDesc = event.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
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
    <div className="space-y-8">
      {/* Search + Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={dict.events.searchPlaceholder}
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
            <SelectValue placeholder={dict.events.filterByTime} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{dict.events.allEvents} ({counts.all})</SelectItem>
            <SelectItem value="upcoming">{dict.events.upcoming} ({counts.upcoming})</SelectItem>
            <SelectItem value="ongoing">{dict.events.happeningNow} ({counts.ongoing})</SelectItem>
            <SelectItem value="past">{dict.events.past} ({counts.past})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-[13px] text-muted-foreground/70 tracking-wide">
        {filtered.length === 0
          ? dict.common.noEventsFound
          : dict.common.showingEvents.replace("{count}", String(filtered.length)).replace("{s}", filtered.length !== 1 ? "s" : "")}
      </p>

      {/* Event cards */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60">
            <CalendarDays className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">{dict.common.noEventsFound}</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {query ? dict.common.searchError : dict.common.noActiveEvents}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filtered.map((event) => {
            const status = getEventStatus(event);
            const config = statusConfig[status];
            const lowestPrice = getLowestPrice(event);
            const isPastEvent = status === "past";
            const cover = event.event_images?.find(
              (img) => img.image_type === "cover"
            );

            return (
              <article
                key={event.id}
                className={`group relative rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-brand-lg hover:-translate-y-0.5 ${
                  isPastEvent ? "opacity-55" : ""
                }`}
              >
                {/* ── Background image / fallback ── */}
                <div className="absolute inset-0">
                  {cover ? (
                    <img
                      src={cover.url}
                      alt={cover.alt_text || event.name}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary via-primary/90 to-brand-teal/70">
                      <div className="absolute inset-0 hero-dot-grid opacity-[0.06]" />
                    </div>
                  )}
                </div>

                {/* Multi-layer overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />

                {/* ── Content on top ── */}
                <div className="relative z-10 flex flex-col min-h-[360px] sm:min-h-[380px]">
                  {/* Status badge */}
                  <div className="p-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full backdrop-blur-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${config.pillClass}`}
                    >
                      {config.hasPulse && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotColor} opacity-60`}
                          />
                          <span
                            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.dotColor}`}
                          />
                        </span>
                      )}
                      {config.label}
                    </span>
                  </div>

                  {/* Push content to bottom */}
                  <div className="mt-auto" />

                  {/* Text content */}
                  <div className="p-5 sm:p-6 pt-0">
                    {/* Title + Description */}
                    <div className="space-y-1.5 mb-4">
                      <h3 className="text-lg sm:text-xl font-bold tracking-tight leading-snug text-white drop-shadow-sm line-clamp-2">
                        {event.name}
                      </h3>
                      {event.description && (
                        <p className="text-[0.8125rem] leading-relaxed text-white/65 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs font-medium text-white/75">
                        <Calendar className="h-3 w-3 text-brand-teal shrink-0" />
                        {format(parseISO(event.start_date), "MMM d")} –{" "}
                        {format(parseISO(event.end_date), "MMM d, yyyy")}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs font-medium text-white/75">
                        <Clock className="h-3 w-3 text-brand-cyan shrink-0" />
                        {event.duration_days} {dict.common.days}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-white/15 mb-4" />

                    {/* Footer: Price + CTA */}
                    <div className="flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        {lowestPrice !== null && (
                          <div>
                            {lowestPrice === 0 ? (
                              <span className="text-lg font-bold text-brand-green">
                                {dict.common.free}
                              </span>
                            ) : (
                              <div className="flex items-baseline gap-1">
                                <span className="text-xs text-white/50">
                                  {dict.common.from}
                                </span>
                                <span className="text-xl font-bold tracking-tight text-white">
                                  ${lowestPrice.toFixed(0)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <Link
                          href="/register/receipt"
                          className="inline-block mt-1 text-[11px] text-white/35 hover:text-white/60 transition-colors"
                        >
                          {dict.events.myReceipt}
                        </Link>
                      </div>
                      {!isPastEvent ? (
                        <Link href={`/register/${event.id}`}>
                          <Button
                            size="sm"
                            className="rounded-full pl-4 pr-3.5 h-9 text-[13px] font-semibold bg-white text-primary hover:bg-white/90 shadow-lg hover:shadow-xl transition-all duration-300"
                          >
                            {dict.common.register}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full px-4 h-9 border-white/20 text-white/60 hover:bg-white/10"
                          disabled
                        >
                          {dict.common.registrationClosed}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
