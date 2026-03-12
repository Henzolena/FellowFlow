"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Hotel,
  DoorOpen,
  BedDouble,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import type { MotelWithRooms, RoomWithBeds, Bed } from "@/types/database";

type ActiveEvent = { id: string; name: string };

export default function MotelsPage() {
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [motels, setMotels] = useState<MotelWithRooms[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMotels, setExpandedMotels] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  // Dialogs
  const [showCreateMotel, setShowCreateMotel] = useState(false);
  const [showBulkRooms, setShowBulkRooms] = useState<string | null>(null);

  // Fetch events
  useEffect(() => {
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((data) => {
        const evts = (Array.isArray(data) ? data : []).map((e: { id: string; name: string }) => ({
          id: e.id,
          name: e.name,
        }));
        setEvents(evts);
        if (evts.length > 0) setSelectedEventId(evts[0].id);
      })
      .catch(() => toast.error("Failed to load events"))
      .finally(() => setLoading(false));
  }, []);

  const fetchMotels = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/admin/motels?eventId=${selectedEventId}`);
      if (res.ok) {
        const data = await res.json();
        setMotels(data);
      }
    } catch {
      toast.error("Failed to load motels");
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchMotels();
  }, [fetchMotels]);

  function toggleMotel(id: string) {
    setExpandedMotels((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRoom(id: string) {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Stats
  const totalRooms = motels.reduce((s, m) => s + m.rooms.length, 0);
  const totalBeds = motels.reduce(
    (s, m) => s + m.rooms.reduce((rs, r) => rs + r.beds.length, 0),
    0
  );
  const totalCapacity = motels.reduce(
    (s, m) => s + m.rooms.reduce((rs, r) => rs + r.beds.reduce((bs, b) => bs + (b.max_occupants || 1), 0), 0),
    0
  );
  const occupiedBeds = motels.reduce(
    (s, m) =>
      s + m.rooms.reduce((rs, r) => rs + r.beds.filter((b) => b.is_occupied).length, 0),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Motel Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage buildings, rooms, and bed assignments
          </p>
        </div>
        <div className="flex gap-2">
          {events.length > 1 && (
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowCreateMotel(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Motel
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Hotel} label="Motels" value={motels.length} />
        <StatCard icon={DoorOpen} label="Rooms" value={totalRooms} />
        <StatCard icon={BedDouble} label="Total Beds" value={totalBeds} />
        <StatCard
          icon={BedDouble}
          label="Capacity"
          value={totalCapacity > 0 ? `${totalCapacity}` : "—"}
          sub={`${occupiedBeds} / ${totalBeds} beds full`}
        />
      </div>

      {/* Motel List */}
      {motels.length === 0 ? (
        <Card className="shadow-brand-sm">
          <CardContent className="py-12 text-center">
            <Hotel className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No motels configured for this event yet.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setShowCreateMotel(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add First Motel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {motels.map((motel) => (
            <MotelCard
              key={motel.id}
              motel={motel}
              expanded={expandedMotels.has(motel.id)}
              onToggle={() => toggleMotel(motel.id)}
              expandedRooms={expandedRooms}
              onToggleRoom={toggleRoom}
              onBulkAdd={() => setShowBulkRooms(motel.id)}
              onRefresh={fetchMotels}
            />
          ))}
        </div>
      )}

      {/* Create Motel Dialog */}
      <CreateMotelDialog
        open={showCreateMotel}
        onOpenChange={setShowCreateMotel}
        eventId={selectedEventId}
        onCreated={fetchMotels}
      />

      {/* Bulk Room Creation Dialog */}
      {showBulkRooms && (
        <BulkRoomDialog
          open={!!showBulkRooms}
          onOpenChange={() => setShowBulkRooms(null)}
          motelId={showBulkRooms}
          onCreated={fetchMotels}
        />
      )}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Hotel;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="shadow-brand-sm">
      <CardContent className="pt-4 pb-3 px-4 sm:pt-5 sm:pb-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2 sm:p-2.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Motel Card ─── */
function MotelCard({
  motel,
  expanded,
  onToggle,
  expandedRooms,
  onToggleRoom,
  onBulkAdd,
  onRefresh,
}: {
  motel: MotelWithRooms;
  expanded: boolean;
  onToggle: () => void;
  expandedRooms: Set<string>;
  onToggleRoom: (id: string) => void;
  onBulkAdd: () => void;
  onRefresh: () => void;
}) {
  const bedCount = motel.rooms.reduce((s, r) => s + r.beds.length, 0);
  const capacity = motel.rooms.reduce(
    (s, r) => s + r.beds.reduce((bs, b) => bs + (b.max_occupants || 1), 0),
    0
  );
  const occupied = motel.rooms.reduce(
    (s, r) => s + r.beds.filter((b) => b.is_occupied).length,
    0
  );

  async function handleDelete() {
    if (!confirm(`Delete "${motel.name}" and all its rooms/beds?`)) return;
    try {
      const res = await fetch(`/api/admin/motels/${motel.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Motel deleted");
        onRefresh();
      } else {
        toast.error("Failed to delete motel");
      }
    } catch {
      toast.error("Failed to delete motel");
    }
  }

  return (
    <Card className="shadow-brand-sm">
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-base">{motel.name}</CardTitle>
              {motel.address && (
                <CardDescription className="text-xs">{motel.address}</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {motel.rooms.length} rooms
            </Badge>
            <Badge variant="outline" className="text-xs">
              {capacity > bedCount
                ? `${occupied}/${bedCount} beds · ${capacity} slots`
                : `${occupied}/${bedCount} beds`}
            </Badge>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onBulkAdd}>
              <Layers className="h-3.5 w-3.5" />
              Bulk Add Rooms
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Motel
            </Button>
          </div>

          <Separator />

          {motel.rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No rooms yet. Use &quot;Bulk Add Rooms&quot; to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {motel.rooms
                .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
                .map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    motelId={motel.id}
                    expanded={expandedRooms.has(room.id)}
                    onToggle={() => onToggleRoom(room.id)}
                    onRefresh={onRefresh}
                  />
                ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Room Row ─── */
function RoomRow({
  room,
  motelId,
  expanded,
  onToggle,
  onRefresh,
}: {
  room: RoomWithBeds;
  motelId: string;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const occupied = room.beds.filter((b) => b.is_occupied).length;
  const roomCapacity = room.beds.reduce((s, b) => s + (b.max_occupants || 1), 0);
  const isMultiOccupant = roomCapacity > room.beds.length;

  async function handleDeleteRoom() {
    if (!confirm(`Delete room ${room.room_number} and all its beds?`)) return;
    try {
      const res = await fetch(`/api/admin/motels/${motelId}/rooms/${room.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Room deleted");
        onRefresh();
      }
    } catch {
      toast.error("Failed to delete room");
    }
  }

  return (
    <div className="rounded-lg border border-border/60">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">Room {room.room_number}</span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {room.room_type}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isMultiOccupant
              ? `${occupied}/${room.beds.length} beds · max ${roomCapacity}`
              : `${occupied}/${room.beds.length} beds`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteRoom();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {expanded && room.beds.length > 0 && (
        <div className="px-3 pb-2 grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {room.beds
            .sort((a, b) => a.bed_label.localeCompare(b.bed_label, undefined, { numeric: true }))
            .map((bed) => (
              <BedChip key={bed.id} bed={bed} />
            ))}
        </div>
      )}
    </div>
  );
}

/* ─── Bed Chip ─── */
function BedChip({ bed }: { bed: Bed }) {
  const isMulti = (bed.max_occupants || 1) > 1;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs border ${
        bed.is_occupied
          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
          : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
      }`}
    >
      <BedDouble className="h-3 w-3" />
      <span className="font-medium">{bed.bed_label}</span>
      <span className="text-[10px] opacity-70 capitalize">{bed.bed_type.replace("_", " ")}</span>
      {isMulti && (
        <span className="text-[10px] opacity-70">({bed.max_occupants}p)</span>
      )}
    </div>
  );
}

/* ─── Create Motel Dialog ─── */
function CreateMotelDialog({
  open,
  onOpenChange,
  eventId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/motels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name, address: address || undefined }),
      });
      if (res.ok) {
        toast.success("Motel created");
        setName("");
        setAddress("");
        onOpenChange(false);
        onCreated();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create motel");
      }
    } catch {
      toast.error("Failed to create motel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Motel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Building A"
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional address"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Bulk Room Creation Dialog ─── */
function BulkRoomDialog({
  open,
  onOpenChange,
  motelId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  motelId: string;
  onCreated: () => void;
}) {
  const [prefix, setPrefix] = useState("");
  const [count, setCount] = useState(10);
  const [roomType, setRoomType] = useState<string>("standard");
  const [capacity, setCapacity] = useState(2);
  const [bedsPerRoom, setBedsPerRoom] = useState(2);
  const [bedType, setBedType] = useState<string>("single");
  const [floor, setFloor] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!prefix.trim() || count < 1) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/motels/${motelId}/rooms?bulk=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          count,
          room_type: roomType,
          capacity,
          bedsPerRoom,
          bed_type: bedType,
          floor: floor ? parseInt(floor) : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Created ${data.created} rooms with ${data.beds} beds`);
        onOpenChange(false);
        onCreated();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create rooms");
      }
    } catch {
      toast.error("Failed to create rooms");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Add Rooms</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>Room Prefix *</Label>
              <Input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. A-"
              />
              <p className="text-[10px] text-muted-foreground">
                Result: {prefix}01, {prefix}02, ...
              </p>
            </div>
            <div className="space-y-2">
              <Label>Number of Rooms *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>Room Type</Label>
              <Select value={roomType} onValueChange={setRoomType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="double">Double</SelectItem>
                  <SelectItem value="suite">Suite</SelectItem>
                  <SelectItem value="accessible">Accessible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Room Capacity</Label>
              <Input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 2)}
              />
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>Beds per Room</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={bedsPerRoom}
                onChange={(e) => setBedsPerRoom(parseInt(e.target.value) || 2)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bed Type</Label>
              <Select value={bedType} onValueChange={setBedType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="double">Double</SelectItem>
                  <SelectItem value="queen">Queen</SelectItem>
                  <SelectItem value="king">King</SelectItem>
                  <SelectItem value="bunk_top">Bunk (Top)</SelectItem>
                  <SelectItem value="bunk_bottom">Bunk (Bottom)</SelectItem>
                  <SelectItem value="floor">Floor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Floor (optional)</Label>
            <Input
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 1"
            />
          </div>

          <div className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
            Will create <strong className="text-foreground">{count}</strong> rooms ({prefix}01 — {prefix}{String(count).padStart(2, "0")}),
            each with <strong className="text-foreground">{bedsPerRoom}</strong> {bedType.replace("_", " ")} beds
            = <strong className="text-foreground">{count * bedsPerRoom}</strong> total beds
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !prefix.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create {count} Rooms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
