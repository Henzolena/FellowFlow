import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, CheckCircle2, Clock } from "lucide-react";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { count: totalRegistrations },
    { count: confirmedRegistrations },
    { count: pendingRegistrations },
    { data: revenueData },
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
  ]);

  const totalRevenue = (revenueData || []).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const stats = [
    {
      title: "Total Registrations",
      value: totalRegistrations ?? 0,
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Confirmed",
      value: confirmedRegistrations ?? 0,
      icon: CheckCircle2,
      color: "text-green-600",
    },
    {
      title: "Pending Payment",
      value: pendingRegistrations ?? 0,
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      title: "Total Revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "text-emerald-600",
    },
  ];

  // Recent registrations
  const { data: recentRegistrations } = await supabase
    .from("registrations")
    .select("id, first_name, last_name, email, category, computed_amount, status, created_at, events(name)")
    .order("created_at", { ascending: false })
    .limit(5);

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
          <Card key={stat.title}>
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

      <Card>
        <CardHeader>
          <CardTitle>Recent Registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {!recentRegistrations?.length ? (
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
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
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
