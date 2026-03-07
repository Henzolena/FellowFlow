"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getStatusBadge, getSourceBadge, getCategoryBadge, getAccessTierBadge } from "@/lib/badge-colors";
import { Checkbox } from "@/components/ui/checkbox";
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
  UserPlus,
  Crown,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import type { Event, Church } from "@/types/database";

type RegistrationRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  category: string;
  computed_amount: number;
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

  // Dialogs
  const [prefillOpen, setPrefillOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);

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
          <PrefillDialog
            open={prefillOpen}
            onOpenChange={setPrefillOpen}
            events={events}
            churches={churches}
            onSuccess={fetchRegistrations}
          />
          <VipDialog
            open={vipOpen}
            onOpenChange={setVipOpen}
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
                      <div className="flex items-center gap-1.5">
                        {reg.first_name} {reg.last_name}
                        {reg.access_tier === "VIP" && (
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {reg.email}
                    </TableCell>
                    <TableCell className="font-medium">
                      {reg.payment_waived ? (
                        <span className="text-green-600 text-xs font-semibold">WAIVED</span>
                      ) : (
                        `$${Number(reg.computed_amount).toFixed(2)}`
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

/* ── Pre-fill Dialog ────────────────────────────────────────────── */

function PrefillDialog({
  open,
  onOpenChange,
  events,
  churches,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: Event[];
  churches: Church[];
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ completionUrl: string; invitationCode: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const [eventId, setEventId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [churchId, setChurchId] = useState("");
  const [churchCustom, setChurchCustom] = useState("");
  const [attendanceType, setAttendanceType] = useState("full_conference");
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState("");

  function reset() {
    setEventId("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setGender("");
    setCity("");
    setChurchId("");
    setChurchCustom("");
    setAttendanceType("full_conference");
    setNotes("");
    setSendEmail(true);
    setError("");
    setResult(null);
    setCopied(false);
  }

  async function handleSubmit() {
    if (!eventId || !firstName || !lastName || !email) {
      setError("Event, first name, last name, and email are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/registrations/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          gender: gender || undefined,
          city: city || undefined,
          churchId: churchId && churchId !== "other" ? churchId : undefined,
          churchNameCustom: churchId === "other" ? churchCustom : undefined,
          attendanceType,
          notes: notes || undefined,
          sendEmail,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to create pre-registration");
        return;
      }
      const data = await res.json();
      setResult({ completionUrl: data.completionUrl, invitationCode: data.invitationCode, emailSent: data.emailSent });
      onSuccess();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    const appUrl = window.location.origin;
    navigator.clipboard.writeText(appUrl + result.completionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Pre-Register
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-violet-600" />
            Pre-Register Attendee
          </DialogTitle>
          <DialogDescription>
            Create a pre-filled registration and send the completion link to the attendee.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4 text-center space-y-2">
              <Check className="h-8 w-8 mx-auto text-green-600" />
              <p className="font-semibold text-green-700 dark:text-green-400">Pre-registration created!</p>
              {result.emailSent && (
                <p className="text-sm text-green-600 dark:text-green-500 flex items-center justify-center gap-1">
                  <Mail className="h-4 w-4" /> Invitation email sent
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invitation Code</Label>
              <div className="flex items-center justify-center py-2">
                <span className="text-2xl font-bold font-mono tracking-widest text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-4 py-2 rounded-lg border-2 border-dashed border-violet-300 dark:border-violet-700">{result.invitationCode}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completion Link</Label>
              <div className="flex gap-2">
                <Input readOnly value={window.location.origin + result.completionUrl} className="text-xs font-mono" />
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
              <Button onClick={reset}>Add Another</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
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

            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Attendance</Label>
                <Select value={attendanceType} onValueChange={setAttendanceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_conference">Full Conference</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="kote">KOTE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Church</Label>
              <Select value={churchId} onValueChange={setChurchId}>
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

            <div className="space-y-2">
              <Label>Admin Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this registrant..." rows={2} />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="send-email" checked={sendEmail} onCheckedChange={(v: boolean) => setSendEmail(v)} />
              <Label htmlFor="send-email" className="text-sm cursor-pointer">
                Send invitation email with completion link
              </Label>
            </div>

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Pre-Registration
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── VIP Dialog ─────────────────────────────────────────────────── */

function VipDialog({
  open,
  onOpenChange,
  events,
  churches,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: Event[];
  churches: Church[];
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [eventId, setEventId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [churchId, setChurchId] = useState("");
  const [churchCustom, setChurchCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState("");

  function reset() {
    setEventId("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setGender("");
    setCity("");
    setChurchId("");
    setChurchCustom("");
    setNotes("");
    setSendEmail(true);
    setError("");
    setSuccess(false);
  }

  async function handleSubmit() {
    if (!eventId || !firstName || !lastName || !email) {
      setError("Event, first name, last name, and email are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/registrations/vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          gender: gender || undefined,
          city: city || undefined,
          churchId: churchId && churchId !== "other" ? churchId : undefined,
          churchNameCustom: churchId === "other" ? churchCustom : undefined,
          notes: notes || undefined,
          sendEmail,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to create VIP registration");
        return;
      }
      setSuccess(true);
      onSuccess();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
          <Crown className="h-4 w-4" />
          Register VIP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Register VIP / Guest
          </DialogTitle>
          <DialogDescription>
            Create a confirmed registration with full event access. Payment is waived.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 text-center space-y-2">
              <Crown className="h-8 w-8 mx-auto text-amber-500" />
              <p className="font-semibold text-amber-700 dark:text-amber-400">VIP registration created!</p>
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Registration confirmed with full access. Entitlements generated.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
              <Button onClick={reset}>Add Another</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                This will create an immediately confirmed registration with VIP access tier. No payment required.
              </p>
            </div>

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

            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
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

            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Church</Label>
              <Select value={churchId} onValueChange={setChurchId}>
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

            <div className="space-y-2">
              <Label>Admin Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VIP reason, guest of honor, etc." rows={2} />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="vip-send-email" checked={sendEmail} onCheckedChange={(v: boolean) => setSendEmail(v)} />
              <Label htmlFor="vip-send-email" className="text-sm cursor-pointer">
                Send confirmation email
              </Label>
            </div>

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="bg-amber-600 hover:bg-amber-700">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm VIP Registration
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
