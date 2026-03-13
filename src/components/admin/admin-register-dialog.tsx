"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  UserPlus,
  Check,
  Hotel,
  BedDouble,
  Plus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { Event, Church, Motel, Room, Bed } from "@/types/database";
import { getAgeRangeOptions, syntheticDob } from "@/components/registration/hooks/use-group-quote";

/* ── Types ─────────────────────────────────────────────────────────── */

type BedWithOccupancy = Bed & { current_occupants: number; occupant_genders: string[] };
type MotelWithRooms = Motel & { rooms: (Room & { beds: BedWithOccupancy[] })[] };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: Event[];
  churches: Church[];
  onSuccess: () => void;
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function AdminRegisterDialog({ open, onOpenChange, events, churches, onSuccess }: Props) {
  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Registration fields
  const [eventId, setEventId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [city, setCity] = useState("");
  const [churchId, setChurchId] = useState("");
  const [churchCustom, setChurchCustom] = useState("");
  const [attendanceType, setAttendanceType] = useState("full_conference");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  // Motel fields
  const [isStayingInMotel, setIsStayingInMotel] = useState(false);
  const [motels, setMotels] = useState<MotelWithRooms[]>([]);
  const [motelsLoading, setMotelsLoading] = useState(false);
  const [selectedMotelId, setSelectedMotelId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedBedId, setSelectedBedId] = useState("");

  // Inline creation state
  const [showCreateMotel, setShowCreateMotel] = useState(false);
  const [newMotelName, setNewMotelName] = useState("");
  const [newMotelAddress, setNewMotelAddress] = useState("");
  const [creatingMotel, setCreatingMotel] = useState(false);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [genderWarningBypassed, setGenderWarningBypassed] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newRoomType, setNewRoomType] = useState("standard");
  const [newRoomCapacity, setNewRoomCapacity] = useState("2");
  const [newBedsPerRoom, setNewBedsPerRoom] = useState("2");
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Event-derived data
  const selectedEvent = events.find((e) => e.id === eventId);
  const durationDays = selectedEvent?.duration_days ?? 4;
  const ageLabels = { infant: "Infant", child: "Child", youth: "Youth", adult: "Adult" };
  const ageRangeOptions = selectedEvent ? getAgeRangeOptions(selectedEvent, ageLabels) : [];

  // Fetch motels when event changes — returns data for direct use by callers
  const fetchMotels = useCallback(async (): Promise<MotelWithRooms[]> => {
    if (!eventId) { setMotels([]); return []; }
    setMotelsLoading(true);
    try {
      const res = await fetch(`/api/admin/motels?eventId=${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setMotels(data);
        return data;
      }
    } catch { /* silent */ }
    finally { setMotelsLoading(false); }
    return [];
  }, [eventId]);

  useEffect(() => {
    fetchMotels();
    setSelectedMotelId("");
    setSelectedRoomId("");
    setSelectedBedId("");
  }, [fetchMotels]);

  // Derived selections
  const selectedMotel = motels.find((m) => m.id === selectedMotelId);
  const availableRooms = selectedMotel?.rooms.filter((r) => r.is_active) ?? [];
  const selectedRoom = availableRooms.find((r) => r.id === selectedRoomId);
  const availableBeds = selectedRoom?.beds.filter((b) => (b.current_occupants ?? 0) < (b.max_occupants || 1)) ?? [];

  // Gender-mix warning: check all beds in the selected room for occupants of a different gender
  const roomGenderMismatch = (() => {
    if (!selectedRoom || !gender) return null;
    const otherGenders = new Set<string>();
    for (const bed of selectedRoom.beds) {
      for (const g of bed.occupant_genders || []) {
        if (g !== gender) otherGenders.add(g);
      }
    }
    if (otherGenders.size === 0) return null;
    const labels: Record<string, string> = { male: "male", female: "female" };
    const others = [...otherGenders].map((g) => labels[g] || g).join(", ");
    return `This room already has ${others} occupant(s). You are assigning a ${labels[gender] || gender} registrant.`;
  })();

  function reset() {
    setEventId("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setGender("");
    setAgeRange("");
    setCity("");
    setChurchId("");
    setChurchCustom("");
    setAttendanceType("full_conference");
    setSelectedDays([]);
    setNotes("");
    setSendEmail(true);
    setIsStayingInMotel(false);
    setMotels([]);
    setSelectedMotelId("");
    setSelectedRoomId("");
    setSelectedBedId("");
    setShowCreateMotel(false);
    setShowCreateRoom(false);
    setGenderWarningBypassed(false);
    setError("");
    setSuccess(false);
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  // Inline motel creation
  async function handleCreateMotel() {
    if (!newMotelName.trim() || !eventId) return;
    setCreatingMotel(true);
    try {
      const res = await fetch("/api/admin/motels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name: newMotelName.trim(), address: newMotelAddress.trim() || undefined }),
      });
      if (res.ok) {
        const created = await res.json();
        toast.success(`Building "${created.name}" created`);
        await fetchMotels();
        setSelectedMotelId(created.id);
        setNewMotelName("");
        setNewMotelAddress("");
        setShowCreateMotel(false);
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to create building");
      }
    } catch {
      toast.error("Failed to create building");
    } finally {
      setCreatingMotel(false);
    }
  }

  // Inline room creation with beds
  async function handleCreateRoom() {
    if (!newRoomNumber.trim() || !selectedMotelId) return;
    setCreatingRoom(true);
    try {
      const res = await fetch(`/api/admin/motels/${selectedMotelId}/rooms?bulk=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix: newRoomNumber.trim(),
          count: 1,
          room_type: newRoomType,
          capacity: parseInt(newRoomCapacity) || 2,
          bedsPerRoom: parseInt(newBedsPerRoom) || 2,
          bed_type: "single",
        }),
      });
      if (res.ok) {
        toast.success(`Room "${newRoomNumber.trim()}01" created with ${newBedsPerRoom} beds`);
        const freshMotels = await fetchMotels();
        // Auto-select the new room using fresh data (avoids stale closure)
        const updated = freshMotels.find((m: MotelWithRooms) => m.id === selectedMotelId);
        if (updated) {
          const newRoom = updated.rooms.find((r) => r.room_number === `${newRoomNumber.trim()}01`);
          if (newRoom) setSelectedRoomId(newRoom.id);
        }
        setNewRoomNumber("");
        setShowCreateRoom(false);
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to create room");
      }
    } catch {
      toast.error("Failed to create room");
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleSubmit() {
    if (!eventId || !firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Event, first name, last name, and email are required.");
      return;
    }
    if (!ageRange) {
      setError("Please select an age range.");
      return;
    }
    if (attendanceType !== "full_conference" && selectedDays.length === 0) {
      setError("Please select at least one day for partial/KOTE attendance.");
      return;
    }
    if (isStayingInMotel && !selectedBedId) {
      setError("Please select a bed assignment or uncheck motel stay.");
      return;
    }
    if (isStayingInMotel && roomGenderMismatch && !genderWarningBypassed) {
      setError("Mixed-gender room assignment detected. Please check the override box or choose a different room.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/registrations/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          gender: gender || undefined,
          ageRange,
          dateOfBirth: selectedEvent ? syntheticDob(
            ageRangeOptions.find(o => o.key === ageRange)?.representativeAge ?? 25,
            selectedEvent.start_date
          ) : undefined,
          city: city.trim() || undefined,
          churchId: churchId && churchId !== "other" ? churchId : undefined,
          churchNameCustom: churchId === "other" ? churchCustom.trim() : undefined,
          attendanceType,
          selectedDays: attendanceType !== "full_conference" ? selectedDays : undefined,
          isStayingInMotel,
          bedId: isStayingInMotel && selectedBedId ? selectedBedId : undefined,
          notes: notes.trim() || undefined,
          sendEmail,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to create registration");
        return;
      }

      setSuccess(true);
      onSuccess();
      // Refetch motels so next registration sees updated bed availability
      if (eventId) fetchMotels();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Register
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Register Attendee
          </DialogTitle>
          <DialogDescription>
            Create a confirmed registration with payment waived. Optionally assign motel accommodation.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4 text-center space-y-2">
              <Check className="h-8 w-8 mx-auto text-green-600" />
              <p className="font-semibold text-green-700 dark:text-green-400">Registration created!</p>
              <p className="text-sm text-green-600 dark:text-green-500">
                Confirmed with entitlements generated.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
              <Button onClick={reset}>Register Another</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Info banner */}
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                This registration will be immediately confirmed. No payment required.
              </p>
            </div>

            {/* Event */}
            <div className="space-y-2">
              <Label>Event <span className="text-destructive">*</span></Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            {/* Phone + Gender */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Age Range */}
            {eventId && (
              <div className="space-y-2">
                <Label>Age Range <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ageRangeOptions.map((opt) => {
                    const selected = ageRange === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setAgeRange(opt.key)}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-2 text-center transition-all text-xs ${
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-muted hover:border-primary/40"
                        }`}
                      >
                        <span className="font-semibold capitalize">{opt.name}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.range} yrs</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Church */}
            <div className="space-y-2">
              <Label>Church</Label>
              <Select value={churchId} onValueChange={(v) => {
                setChurchId(v);
                if (v === "other") {
                  setCity("");
                } else {
                  const selectedChurch = churches.find((c) => c.id === v);
                  setCity(selectedChurch?.city || "");
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Select church" /></SelectTrigger>
                <SelectContent>
                  {churches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</SelectItem>
                  ))}
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {churchId === "other" && (
                <Input value={churchCustom} onChange={(e) => setChurchCustom(e.target.value)} placeholder="Church name" className="mt-2" />
              )}
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label>City *</Label>
              <Input 
                value={city} 
                onChange={(e) => setCity(e.target.value)} 
                disabled={!!churchId && churchId !== "other"}
                className={churchId && churchId !== "other" ? "bg-muted cursor-not-allowed" : ""}
                placeholder="Dallas, TX"
              />
              {churchId && churchId !== "other" && (
                <p className="text-xs text-muted-foreground">Auto-filled from church</p>
              )}
            </div>

            <Separator />

            {/* Attendance Type */}
            <div className="space-y-2">
              <Label>Attendance Type</Label>
              <Select value={attendanceType} onValueChange={(v) => { setAttendanceType(v); setSelectedDays([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_conference">Full Conference</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="kote">KOTE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Day selector for partial/KOTE */}
            {attendanceType !== "full_conference" && eventId && (
              <div className="space-y-2">
                <Label className="text-sm">Select Days</Label>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: durationDays }, (_, i) => {
                    const dayNum = i + 1;
                    const active = selectedDays.includes(dayNum);
                    // Compute the actual date for this day
                    let dayLabel = `Day ${dayNum}`;
                    if (selectedEvent?.start_date) {
                      const [y, m, d] = selectedEvent.start_date.split("-").map(Number);
                      const date = new Date(y, m - 1, d + i);
                      dayLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                    }
                    return (
                      <button
                        key={dayNum}
                        type="button"
                        onClick={() => toggleDay(dayNum)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {dayLabel}
                      </button>
                    );
                  })}
                </div>
                {selectedDays.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedDays.length} day(s) selected</p>
                )}
              </div>
            )}

            <Separator />

            {/* Motel Stay Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="motel-stay"
                  checked={isStayingInMotel}
                  onCheckedChange={(v: boolean) => {
                    setIsStayingInMotel(v);
                    if (!v) {
                      setSelectedMotelId("");
                      setSelectedRoomId("");
                      setSelectedBedId("");
                    }
                  }}
                />
                <Label htmlFor="motel-stay" className="text-sm cursor-pointer flex items-center gap-1.5">
                  <Hotel className="h-4 w-4 text-muted-foreground" />
                  Assign Motel Accommodation
                </Label>
              </div>

              {isStayingInMotel && eventId && (
                <div className="ml-6 space-y-3 rounded-lg border border-border/60 p-3 bg-muted/20">
                  {motelsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading buildings...
                    </div>
                  ) : (
                    <>
                      {/* Building selector */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Building</Label>
                          <button
                            type="button"
                            onClick={() => setShowCreateMotel(!showCreateMotel)}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            New Building
                          </button>
                        </div>

                        {motels.length > 0 ? (
                          <Select value={selectedMotelId} onValueChange={(v) => { setSelectedMotelId(v); setSelectedRoomId(""); setSelectedBedId(""); }}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select building" /></SelectTrigger>
                            <SelectContent>
                              {motels.filter((m) => m.is_active).map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name} ({m.rooms.length} rooms)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : !showCreateMotel ? (
                          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2.5 text-center">
                            <p className="text-xs text-amber-700 dark:text-amber-400">No buildings configured for this event.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs gap-1"
                              onClick={() => setShowCreateMotel(true)}
                            >
                              <Plus className="h-3 w-3" /> Create Building
                            </Button>
                          </div>
                        ) : null}

                        {/* Inline motel creation */}
                        {showCreateMotel && (
                          <div className="space-y-2 rounded-md border border-dashed border-primary/30 p-2.5 bg-primary/5">
                            <p className="text-xs font-semibold text-primary">New Building</p>
                            <Input
                              placeholder="Building name"
                              value={newMotelName}
                              onChange={(e) => setNewMotelName(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Input
                              placeholder="Address (optional)"
                              value={newMotelAddress}
                              onChange={(e) => setNewMotelAddress(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleCreateMotel}
                                disabled={creatingMotel || !newMotelName.trim()}
                              >
                                {creatingMotel && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                Create
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => { setShowCreateMotel(false); setNewMotelName(""); setNewMotelAddress(""); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Room selector */}
                      {selectedMotelId && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room</Label>
                            <button
                              type="button"
                              onClick={() => setShowCreateRoom(!showCreateRoom)}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Plus className="h-3 w-3" />
                              New Room
                            </button>
                          </div>

                          {availableRooms.length > 0 ? (
                            <Select value={selectedRoomId} onValueChange={(v) => { setSelectedRoomId(v); setSelectedBedId(""); setGenderWarningBypassed(false); }}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select room" /></SelectTrigger>
                              <SelectContent>
                                {availableRooms
                                  .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
                                  .map((r) => {
                                    const freeSlots = r.beds.reduce((sum, b) => sum + Math.max(0, (b.max_occupants || 1) - (b.current_occupants ?? 0)), 0);
                                    return (
                                      <SelectItem key={r.id} value={r.id} disabled={freeSlots === 0}>
                                        Room {r.room_number} — {freeSlots} slot{freeSlots !== 1 ? "s" : ""} available
                                      </SelectItem>
                                    );
                                  })}
                              </SelectContent>
                            </Select>
                          ) : !showCreateRoom ? (
                            <div className="text-center py-2">
                              <p className="text-xs text-muted-foreground">No rooms in this building.</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-1 h-7 text-xs gap-1"
                                onClick={() => setShowCreateRoom(true)}
                              >
                                <Plus className="h-3 w-3" /> Create Room
                              </Button>
                            </div>
                          ) : null}

                          {/* Inline room creation */}
                          {showCreateRoom && (
                            <div className="space-y-2 rounded-md border border-dashed border-primary/30 p-2.5 bg-primary/5">
                              <p className="text-xs font-semibold text-primary">New Room</p>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Room # prefix (e.g. A)"
                                  value={newRoomNumber}
                                  onChange={(e) => setNewRoomNumber(e.target.value)}
                                  className="h-8 text-sm"
                                />
                                <Select value={newRoomType} onValueChange={setNewRoomType}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="standard">Standard</SelectItem>
                                    <SelectItem value="double">Double</SelectItem>
                                    <SelectItem value="suite">Suite</SelectItem>
                                    <SelectItem value="accessible">Accessible</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Capacity</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={newRoomCapacity}
                                    onChange={(e) => setNewRoomCapacity(e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Beds per Room</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={newBedsPerRoom}
                                    onChange={(e) => setNewBedsPerRoom(e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={handleCreateRoom}
                                  disabled={creatingRoom || !newRoomNumber.trim()}
                                >
                                  {creatingRoom && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                  Create Room
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => { setShowCreateRoom(false); setNewRoomNumber(""); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Gender-mix warning */}
                      {selectedRoomId && roomGenderMismatch && !genderWarningBypassed && (
                        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Mixed-Gender Room</p>
                              <p className="text-xs text-amber-700 dark:text-amber-400">{roomGenderMismatch}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-6">
                            <Checkbox
                              id="bypass-gender-warning"
                              checked={genderWarningBypassed}
                              onCheckedChange={(v: boolean) => setGenderWarningBypassed(v)}
                            />
                            <Label htmlFor="bypass-gender-warning" className="text-xs cursor-pointer text-amber-700 dark:text-amber-400">
                              Override — married couple or intentional assignment
                            </Label>
                          </div>
                        </div>
                      )}

                      {/* Bed selector */}
                      {selectedRoomId && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bed</Label>
                          {availableBeds.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {availableBeds
                                .sort((a, b) => a.bed_label.localeCompare(b.bed_label, undefined, { numeric: true }))
                                .map((bed) => (
                                  <button
                                    key={bed.id}
                                    type="button"
                                    onClick={() => setSelectedBedId(bed.id)}
                                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                      selectedBedId === bed.id
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50"
                                    }`}
                                  >
                                    <BedDouble className="h-3 w-3" />
                                    {bed.bed_label}
                                    <span className="text-[10px] opacity-70 capitalize">{bed.bed_type.replace("_", " ")}</span>
                                    {(bed.max_occupants || 1) > 1 && (
                                      <span className="text-[10px] opacity-70">({bed.current_occupants ?? 0}/{bed.max_occupants})</span>
                                    )}
                                  </button>
                                ))}
                            </div>
                          ) : (
                            <p className="text-xs text-amber-600">No available beds in this room.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Admin Notes */}
            <div className="space-y-2">
              <Label>Admin Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
            </div>

            {/* Send Email */}
            <div className="flex items-center gap-2">
              <Checkbox id="admin-send-email" checked={sendEmail} onCheckedChange={(v: boolean) => setSendEmail(v)} />
              <Label htmlFor="admin-send-email" className="text-sm cursor-pointer">
                Send confirmation email with badge
              </Label>
            </div>

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Registration
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
