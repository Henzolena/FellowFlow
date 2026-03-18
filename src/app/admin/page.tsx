"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, CheckCircle2, Clock, Loader2, Shirt } from "lucide-react";

type RecentRegistration = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  category: string;
  computed_amount: number;
  status: string;
  created_at: string;
  events: { name: string } | null;
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [confirmedRegistrations, setConfirmedRegistrations] = useState(0);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [recentRegistrations, setRecentRegistrations] = useState<RecentRegistration[]>([]);
  const [tshirtStats, setTshirtStats] = useState<{ size: string; count: number }[]>([]);

  const fetchStats = async () => {
    const supabase = createClient();

    const [
      { count: total },
      { count: confirmed },
      { count: pending },
      { data: revenueData },
      { data: recent },
      { data: tshirtData },
    ] = await Promise.all([
      supabase.from("registrations").select("*", { count: "exact", head: true }),
      supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("status", "confirmed"),
      supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "completed"),
      supabase
        .from("registrations")
        .select("id, first_name, last_name, email, category, computed_amount, status, created_at, events(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("registrations")
        .select("tshirt_size")
        .not("tshirt_size", "is", null)
        .in("status", ["confirmed", "pending"]),
    ]);

    const revenue = (revenueData || []).reduce((sum, p) => sum + Number(p.amount), 0);

    // Compute t-shirt size distribution
    const SIZES_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
    const sizeCounts = new Map<string, number>();
    SIZES_ORDER.forEach((s) => sizeCounts.set(s, 0));
    for (const row of (tshirtData || []) as { tshirt_size: string }[]) {
      sizeCounts.set(row.tshirt_size, (sizeCounts.get(row.tshirt_size) || 0) + 1);
    }
    const computedTshirtStats = SIZES_ORDER
      .map((size) => ({ size, count: sizeCounts.get(size) || 0 }))
      .filter((s) => s.count > 0 || (tshirtData && tshirtData.length > 0));

    setTotalRegistrations(total ?? 0);
    setConfirmedRegistrations(confirmed ?? 0);
    setPendingRegistrations(pending ?? 0);
    setTotalRevenue(revenue);
    setRecentRegistrations((recent || []) as unknown as RecentRegistration[]);
    setTshirtStats(computedTshirtStats);
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Real-time subscription for instant updates
  useEffect(() => {
    const supabase = createClient();
    const registrationsChannel = supabase
      .channel("dashboard-registrations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations" },
        () => fetchStats()
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel("dashboard-payments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(registrationsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, []);

  const stats = [
    {
      title: "Total Registrations",
      value: totalRegistrations,
      icon: Users,
      color: "text-brand-cyan",
    },
    {
      title: "Confirmed",
      value: confirmedRegistrations,
      icon: CheckCircle2,
      color: "text-brand-green",
    },
    {
      title: "Pending Payment",
      value: pendingRegistrations,
      icon: Clock,
      color: "text-brand-amber",
    },
    {
      title: "Total Revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "text-brand-teal",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of conference registrations
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-brand-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {tshirtStats.length > 0 && (
        <Card className="shadow-brand-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shirt className="h-4 w-4 text-violet-500" />
              T-Shirt Size Distribution
            </CardTitle>
            <span className="text-sm text-muted-foreground font-medium">
              {tshirtStats.reduce((s, t) => s + t.count, 0)} total
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tshirtStats.map((s) => {
                const max = Math.max(...tshirtStats.map((t) => t.count), 1);
                const pct = (s.count / max) * 100;
                return (
                  <div key={s.size} className="flex items-center gap-3">
                    <span className="w-10 text-sm font-semibold text-right">{s.size}</span>
                    <div className="flex-1 h-7 bg-muted/50 rounded-md overflow-hidden relative">
                      <div
                        className="h-full bg-violet-500/80 rounded-md transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-xs font-medium">
                        {s.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-brand-sm">
        <CardHeader>
          <CardTitle>Recent Registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {!recentRegistrations.length ? (
            <p className="text-center text-muted-foreground py-8">
              No registrations yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentRegistrations.map((reg) => {
                const events = reg.events as unknown as { name: string } | null;
                return (
                  <div
                    key={reg.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {reg.first_name} {reg.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {reg.email} • {events?.name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold">
                        ${Number(reg.computed_amount).toFixed(2)}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          reg.status === "confirmed"
                            ? "bg-green-100 text-green-700"
                            : reg.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {reg.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
