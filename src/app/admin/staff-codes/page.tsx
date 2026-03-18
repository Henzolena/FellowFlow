"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import type { StaffRole, StaffAccessCode } from "@/types/database";

const ROLE_META: Record<StaffRole, { label: string; color: string; description: string }> = {
  auditorium: {
    label: "Auditorium",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    description: "Main service check-in scanner",
  },
  meals: {
    label: "Meals",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    description: "Meal service scanner",
  },
  proctor: {
    label: "Proctor",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    description: "Dorm assignment verification",
  },
  motel: {
    label: "Motel",
    color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    description: "Hotel/motel room check-in",
  },
};

export default function StaffCodesPage() {
  const [codes, setCodes] = useState<StaffAccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [visiblePins, setVisiblePins] = useState<Set<string>>(new Set());

  // New code form
  const [newRole, setNewRole] = useState<StaffRole>("meals");
  const [newPin, setNewPin] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const fetchCodes = useCallback(async (eid: string) => {
    const res = await fetch(`/api/admin/staff-codes?eventId=${eid}`);
    if (res.ok) {
      const data = await res.json();
      setCodes(data);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: event } = await supabase
        .from("events")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (event) {
        setEventId(event.id);
        await fetchCodes(event.id);
      }
      setLoading(false);
    }
    init();
  }, [fetchCodes]);

  async function handleCreate() {
    if (!eventId || !newPin.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/admin/staff-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          role: newRole,
          pinCode: newPin.trim(),
          label: newLabel.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to create code");
        setCreating(false);
        return;
      }

      toast.success("Staff code created");
      setNewPin("");
      setNewLabel("");
      setDialogOpen(false);
      await fetchCodes(eventId);
    } catch {
      toast.error("Failed to create code");
    }
    setCreating(false);
  }

  async function handleToggle(code: StaffAccessCode) {
    const res = await fetch("/api/admin/staff-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: code.id, isActive: !code.is_active }),
    });

    if (res.ok) {
      toast.success(code.is_active ? "Code deactivated" : "Code activated");
      if (eventId) await fetchCodes(eventId);
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this access code?")) return;

    const res = await fetch(`/api/admin/staff-codes?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Code deleted");
      if (eventId) await fetchCodes(eventId);
    } else {
      toast.error("Failed to delete");
    }
  }

  function togglePinVisibility(id: string) {
    setVisiblePins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyStaffUrl(role: StaffRole) {
    const url = `${window.location.origin}/staff/${role}`;
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const grouped = (Object.keys(ROLE_META) as StaffRole[]).map((role) => ({
    role,
    ...ROLE_META[role],
    codes: codes.filter((c) => c.role === role),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="h-6 w-6" />
            Staff Access Codes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage PIN codes for staff to access role-specific scanner and lookup pages
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Code
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Staff Access Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_META) as StaffRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_META[r].label} — {ROLE_META[r].description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>PIN Code</Label>
                <Input
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="e.g. 1234"
                  className="font-mono"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  Staff will enter this to access their role page
                </p>
              </div>

              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Kitchen Team A, Dorm 1 Proctor"
                  maxLength={100}
                />
              </div>

              <Button
                className="w-full"
                disabled={!newPin.trim() || creating}
                onClick={handleCreate}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Access Code
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Staff page URLs */}
      <Card className="shadow-brand-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Staff Page URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(ROLE_META) as StaffRole[]).map((role) => (
              <div
                key={role}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className={`text-[10px] ${ROLE_META[role].color}`}>
                    {ROLE_META[role].label}
                  </Badge>
                  <code className="text-xs text-muted-foreground truncate">
                    /staff/{role}
                  </code>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyStaffUrl(role)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    asChild
                  >
                    <a href={`/staff/${role}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Codes by role */}
      {grouped.map((group) => (
        <Card key={group.role} className="shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge className={`${group.color}`}>{group.label}</Badge>
              <span className="text-muted-foreground font-normal text-sm">
                {group.description}
              </span>
              <span className="ml-auto text-sm text-muted-foreground">
                {group.codes.length} code{group.codes.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {group.codes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No codes for this role yet.
              </p>
            ) : (
              <div className="space-y-2">
                {group.codes.map((code) => (
                  <div
                    key={code.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                      code.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {visiblePins.has(code.id)
                              ? code.pin_code
                              : "\u2022".repeat(code.pin_code.length)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => togglePinVisibility(code.id)}
                          >
                            {visiblePins.has(code.id) ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        {code.label && (
                          <p className="text-xs text-muted-foreground truncate">
                            {code.label}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!code.is_active && (
                        <Badge variant="outline" className="text-[10px] text-red-500">
                          Disabled
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleToggle(code)}
                        title={code.is_active ? "Deactivate" : "Activate"}
                      >
                        {code.is_active ? (
                          <ToggleRight className="h-4 w-4 text-green-500" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(code.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
