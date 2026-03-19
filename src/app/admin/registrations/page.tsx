"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStatusBadge, getSourceBadge, getCategoryBadge, getAccessTierBadge } from "@/lib/badge-colors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import type { Event, Church } from "@/types/database";
import AdminRegisterDialog from "@/components/admin/admin-register-dialog";
import { createClient } from "@/lib/supabase/client";

type RegistrationRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  category: string;
  computed_amount: number;
  meal_total: number;
  status: string;
  is_full_duration: boolean;
  num_days: number | null;
  created_at: string;
  registration_source: string;
  payment_waived: boolean;
  access_tier: string | null;
  events: { name: string } | null;
};

type PaginatedResponse = {
  registrations: RegistrationRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// Badge colors now come from centralized @/lib/badge-colors

export default function RegistrationsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <RegistrationsContent />
    </Suspense>
  );
}

function RegistrationsContent() {
  const searchParams = useSearchParams();

  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));
  const [events, setEvents] = useState<Event[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);

  // Dialog
  const [registerOpen, setRegisterOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/events").then(r => r.ok ? r.json() : []).then(d => setEvents(Array.isArray(d) ? d : d.events || []));
    fetch("/api/churches").then(r => r.ok ? r.json() : []).then(d => setChurches(Array.isArray(d) ? d : d.churches || []));
  }, []);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "15");
      if (search) params.set("search", search);
      if (status && status !== "all") params.set("status", status);

      const res = await fetch(`/api/admin/registrations?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchRegistrations(), 300);
    return () => clearTimeout(debounce);
  }, [fetchRegistrations]);

  // Real-time subscription for instant updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("registrations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations" },
        () => {
          // Refetch when any registration is inserted, updated, or deleted
          fetchRegistrations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRegistrations]);

  async function handleExport() {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    window.open(`/api/admin/export?${params}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Registrations</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} total registrations
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <AdminRegisterDialog
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            events={events}
            churches={churches}
            onSuccess={fetchRegistrations}
          />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-brand-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-brand-sm">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !data?.registrations?.length ? (
            <div className="py-20 text-center text-muted-foreground">
              No registrations found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Access</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.registrations.map((reg) => (
                  <TableRow key={reg.id} className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium">
                      {reg.first_name} {reg.last_name}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {reg.email}
                    </TableCell>
                    <TableCell className="font-medium">
                      {reg.payment_waived ? (
                        <span className="text-green-600 text-xs font-semibold">WAIVED</span>
                      ) : (
                        `$${(Number(reg.computed_amount) + (reg.meal_total || 0)).toFixed(2)}`
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadge(reg.status).tw}`}
                      >
                        {getStatusBadge(reg.status).label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {reg.category && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${getCategoryBadge(reg.category).tw}`}>
                          {getCategoryBadge(reg.category).label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {reg.access_tier && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAccessTierBadge(reg.access_tier).tw}`}>
                          {getAccessTierBadge(reg.access_tier).label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getSourceBadge(reg.registration_source).tw}`}>
                        {getSourceBadge(reg.registration_source).label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {format(parseISO(reg.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/registrations/${reg.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
