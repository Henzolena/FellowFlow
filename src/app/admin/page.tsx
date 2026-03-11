"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, CheckCircle2, Clock, Loader2 } from "lucide-react";

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

  const fetchStats = async () => {
    const supabase = createClient();

    const [
      { count: total },
      { count: confirmed },
      { count: pending },
      { data: revenueData },
      { data: recent },
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
    ]);

    const revenue = (revenueData || []).reduce((sum, p) => sum + Number(p.amount), 0);

    setTotalRegistrations(total ?? 0);
    setConfirmedRegistrations(confirmed ?? 0);
    setPendingRegistrations(pending ?? 0);
    setTotalRevenue(revenue);
    setRecentRegistrations((recent || []) as unknown as RecentRegistration[]);
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
