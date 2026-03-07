"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Utensils,
  DoorOpen,
  Sparkles,
  RefreshCw,
  Loader2,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
} from "lucide-react";

type ServiceWithStats = {
  id: string;
  service_name: string;
  service_code: string;
  service_category: string;
  meal_type: string | null;
  service_date: string | null;
  is_active: boolean;
};

type StatsMap = Record<string, { entitled: number; used: number }>;

export default function ServiceStatsPage() {
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [services, setServices] = useState<ServiceWithStats[]>([]);
  const [stats, setStats] = useState<StatsMap>({});
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, name")
        .eq("is_active", true)
        .order("start_date", { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    }
    load();
  }, []);

  const loadStats = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/service-scan?eventId=${selectedEventId}`);
      const json = await res.json();
      setServices(json.services || []);
      setStats(json.stats || {});
      setTotalRegistered(json.totalRegistered || 0);
      setLastRefresh(new Date());
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 15_000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Compute aggregates
  const totalUsed = Object.values(stats).reduce((sum, s) => sum + s.used, 0);

  // Group by category
  const mainServices = services.filter((s) => s.service_category === "main_service");
  const mealServices = services.filter((s) => s.service_category === "meal");
  const customServices = services.filter((s) => s.service_category === "custom");

  // Group meals by date
  const mealsByDate: Record<string, ServiceWithStats[]> = {};
  mealServices.forEach((s) => {
    const d = s.service_date || "undated";
    if (!mealsByDate[d]) mealsByDate[d] = [];
    mealsByDate[d].push(s);
  });

  // Aggregate meal stats per date
  const mealStatsByDate: Record<string, { entitled: number; used: number }> = {};
  Object.entries(mealsByDate).forEach(([date, svcs]) => {
    mealStatsByDate[date] = svcs.reduce(
      (acc, s) => ({
        entitled: acc.entitled + (stats[s.id]?.entitled || 0),
        used: acc.used + (stats[s.id]?.used || 0),
      }),
      { entitled: 0, used: 0 }
    );
  });

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function pct(used: number, total: number) {
    if (total === 0) return 0;
    return Math.round((used / total) * 100);
  }

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case "main_service": return <DoorOpen className="h-4 w-4" />;
      case "meal": return <Utensils className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Service Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Live service usage — auto-refreshes every 15s</p>
        </div>
        <div className="flex items-center gap-2">
          {events.length > 1 && (
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={loadStats} title="Refresh now">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
      </div>

      {loading && services.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Services Configured</h3>
          <p className="text-sm text-muted-foreground">
            Go to Services to set up meal services, main entry, and custom access points.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<Users className="h-5 w-5 text-blue-600" />} label="Registered" value={totalRegistered} bg="bg-blue-50" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} label="Total Served" value={totalUsed} bg="bg-emerald-50" />
            <StatCard icon={<TrendingUp className="h-5 w-5 text-amber-600" />} label="Usage Rate" value={`${pct(totalUsed, totalRegistered)}%`} bg="bg-amber-50" />
            <StatCard icon={<Clock className="h-5 w-5 text-purple-600" />} label="Services" value={services.length} bg="bg-purple-50" />
          </div>

          {/* Main service */}
          {mainServices.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <DoorOpen className="h-4 w-4" /> Main Service
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mainServices.map((svc) => (
                  <ServiceStatBar key={svc.id} svc={svc} stats={stats[svc.id]} totalRegistered={totalRegistered} icon={categoryIcon(svc.service_category)} />
                ))}
              </div>
            </div>
          )}

          {/* Meals by date */}
          {Object.keys(mealsByDate).length > 0 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Utensils className="h-4 w-4" /> Meal Services
              </h2>
              {Object.entries(mealsByDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, dateMeals]) => {
                  const dateStats = mealStatsByDate[date];
                  return (
                    <div key={date} className="rounded-xl border overflow-hidden">
                      <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Clock className="h-4 w-4 text-amber-600" />
                          {date === "undated" ? "No Date" : formatDate(date)}
                        </div>
                        {dateStats && (
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">
                              <strong className="text-foreground">{dateStats.used}</strong> / {totalRegistered} served
                            </span>
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                              {pct(dateStats.used, totalRegistered)}%
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {dateMeals.map((svc) => (
                          <ServiceStatBar key={svc.id} svc={svc} stats={stats[svc.id]} totalRegistered={totalRegistered} icon={categoryIcon(svc.service_category)} compact />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Custom services */}
          {customServices.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Custom Services
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {customServices.map((svc) => (
                  <ServiceStatBar key={svc.id} svc={svc} stats={stats[svc.id]} totalRegistered={totalRegistered} icon={categoryIcon(svc.service_category)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number | string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-4 border`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ServiceStatBar({
  svc,
  stats,
  totalRegistered,
  icon,
  compact,
}: {
  svc: ServiceWithStats;
  stats?: { entitled: number; used: number };
  totalRegistered: number;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  const used = stats?.used || 0;
  const remaining = Math.max(0, totalRegistered - used);
  const percentage = totalRegistered > 0 ? Math.round((used / totalRegistered) * 100) : 0;

  const barColor =
    percentage >= 90 ? "bg-red-500" : percentage >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className={`rounded-lg border bg-card p-3 ${compact ? "py-2.5" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-sm font-medium truncate">
            {svc.meal_type ? svc.meal_type.charAt(0).toUpperCase() + svc.meal_type.slice(1) : svc.service_name}
          </span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-lg font-bold">{used}</span>
          <span className="text-xs text-muted-foreground"> / {totalRegistered}</span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
        <span>{percentage}% served</span>
        <span>{remaining} remaining</span>
      </div>
    </div>
  );
}
