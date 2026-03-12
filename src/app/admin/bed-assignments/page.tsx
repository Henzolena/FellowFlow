"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  BedDouble,
  Building2,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import type { CityDormAssignment, Motel } from "@/types/database";

type CityDormMapping = CityDormAssignment & {
  motels: Pick<Motel, "id" | "name" | "auto_assignable" | "total_rooms">;
};

type MotelOption = Pick<Motel, "id" | "name" | "auto_assignable" | "total_rooms">;

type BedStat = {
  motel_id: string;
  motel_name: string;
  total_beds: number;
  occupied_beds: number;
  available_beds: number;
  total_capacity: number;
  current_occupants: number;
  available_slots: number;
};

export default function BedAssignmentsPage() {
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<CityDormMapping[]>([]);
  const [motels, setMotels] = useState<MotelOption[]>([]);
  const [bedStats, setBedStats] = useState<BedStat[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);

  // Add mapping dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newMotelId, setNewMotelId] = useState("");
  const [newPriority, setNewPriority] = useState("1");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (eid: string) => {
    try {
      const res = await fetch(`/api/admin/city-dorm-mappings?eventId=${eid}`);
      if (res.ok) {
        const json = await res.json();
        setMappings(json.mappings || []);
        setMotels(json.motels || []);
        setBedStats(json.bedStats || []);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch event ID
  useEffect(() => {
    async function getEvent() {
      const res = await fetch("/api/admin/events");
      if (res.ok) {
        const events = await res.json();
        const active = Array.isArray(events)
          ? events.find((e: { is_active: boolean }) => e.is_active)
          : events.events?.find((e: { is_active: boolean }) => e.is_active);
        if (active) {
          setEventId(active.id);
          fetchData(active.id);
        } else {
          setLoading(false);
        }
      }
    }
    getEvent();
  }, [fetchData]);

  // Real-time subscriptions for beds and lodging_assignments
  useEffect(() => {
    if (!eventId) return;
    const supabase = createClient();

    const bedsChannel = supabase
      .channel("bed-assignments-beds")
      .on("postgres_changes", { event: "*", schema: "public", table: "beds" }, () => fetchData(eventId))
      .subscribe();

    const lodgingChannel = supabase
      .channel("bed-assignments-lodging")
      .on("postgres_changes", { event: "*", schema: "public", table: "lodging_assignments" }, () => fetchData(eventId))
      .subscribe();

    const mappingChannel = supabase
      .channel("bed-assignments-mappings")
      .on("postgres_changes", { event: "*", schema: "public", table: "city_dorm_assignments" }, () => fetchData(eventId))
      .subscribe();

    return () => {
      supabase.removeChannel(bedsChannel);
      supabase.removeChannel(lodgingChannel);
      supabase.removeChannel(mappingChannel);
    };
  }, [eventId, fetchData]);

  async function handleAdd() {
    if (!eventId || !newCity.trim() || !newMotelId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/city-dorm-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          city: newCity.trim(),
          motelId: newMotelId,
          priority: parseInt(newPriority) || 1,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewCity("");
        setNewMotelId("");
        setNewPriority("1");
        fetchData(eventId);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add mapping");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!eventId || !confirm("Remove this city→dorm mapping?")) return;
    await fetch(`/api/admin/city-dorm-mappings?id=${id}`, { method: "DELETE" });
    fetchData(eventId);
  }

  // Group mappings by city
  const grouped = mappings.reduce<Record<string, CityDormMapping[]>>((acc, m) => {
    const key = m.city === "__default__" ? "⚡ Default (unmapped cities)" : m.city;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Bed Assignments</h1>
          <p className="text-sm text-muted-foreground">
            City→Dorm mappings &amp; real-time bed availability
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Mapping
        </Button>
      </div>

      {/* Bed availability overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {bedStats.map((stat) => {
          const isMultiOccupant = stat.total_capacity > stat.total_beds;
          const pct = isMultiOccupant
            ? stat.total_capacity > 0 ? Math.round((stat.current_occupants / stat.total_capacity) * 100) : 0
            : stat.total_beds > 0 ? Math.round((stat.occupied_beds / stat.total_beds) * 100) : 0;
          return (
            <Card key={stat.motel_id} className="shadow-brand-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {stat.motel_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-brand-green">{stat.available_slots}</span>
                  <span className="text-sm text-muted-foreground">/ {stat.total_capacity} slots open</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-brand-green"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.current_occupants} people assigned ({pct}%)
                  {isMultiOccupant && ` · ${stat.total_beds} beds`}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* City→Dorm mappings table */}
      <Card className="shadow-brand-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            City → Dorm Mappings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No city→dorm mappings configured yet.</p>
              <p className="text-sm">Add mappings to enable automatic bed assignment during registration.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Assigned Dorm</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead className="text-center">Available</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(grouped).sort(([a], [b]) => {
                  if (a.startsWith("⚡")) return 1;
                  if (b.startsWith("⚡")) return -1;
                  return a.localeCompare(b);
                }).map(([city, items]) =>
                  items.sort((a, b) => a.priority - b.priority).map((m, idx) => {
                    const stat = bedStats.find((s) => s.motel_id === m.motel_id);
                    return (
                      <TableRow key={m.id}>
                        {idx === 0 ? (
                          <TableCell rowSpan={items.length} className="font-medium align-top">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                              {city}
                            </div>
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                            {m.motels?.name || "Unknown"}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={m.priority === 1 ? "default" : "secondary"} className="text-xs">
                            {m.priority === 1 ? "Primary" : `Overflow #${m.priority}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {stat ? (
                            <span className={stat.available_beds === 0 ? "text-red-500 font-semibold" : "text-brand-green font-semibold"}>
                              {stat.available_beds}/{stat.total_beds}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(m.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add mapping dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add City → Dorm Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">City Name</label>
              <Input
                placeholder="e.g., Dallas, TX or __default__"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must match exactly the city on church records. Use <code>__default__</code> for catch-all.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Dorm / Building</label>
              <Select value={newMotelId} onValueChange={setNewMotelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a dorm..." />
                </SelectTrigger>
                <SelectContent>
                  {motels.map((m) => {
                    const stat = bedStats.find((s) => s.motel_id === m.id);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {stat ? `(${stat.available_beds}/${stat.total_beds} avail.)` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Priority</label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Primary</SelectItem>
                  <SelectItem value="2">2 — Overflow</SelectItem>
                  <SelectItem value="3">3 — Overflow #2</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Lower priority = tried first. Overflow used when primary is full.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !newCity.trim() || !newMotelId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
