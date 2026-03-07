"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  Users,
  Clock,
  Camera,
  CameraOff,
  Keyboard,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

type ActiveEvent = { id: string; name: string };

type WristbandInfo = {
  color: string;
  label: string;
  accessTier: string;
};

type RegistrationInfo = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  attendance_type: string;
  access_tier: string | null;
  public_confirmation_code: string;
  checked_in: boolean;
};

type CheckInResult = {
  success?: boolean;
  error?: string;
  registration?: RegistrationInfo;
  wristband?: WristbandInfo;
  alreadyCheckedIn?: boolean;
};

type CheckInStats = {
  totalRegistrations: number;
  checkedIn: number;
  remaining: number;
  recentCheckIns: Array<{
    id: string;
    checked_in_at: string;
    wristband_color: string;
    access_tier: string;
    method: string;
    registrations: {
      first_name: string;
      last_name: string;
      public_confirmation_code: string;
      attendance_type: string;
    };
  }>;
  byAccessTier: Record<string, { count: number; color: string }>;
};

const WRISTBAND_COLORS: Record<string, string> = {
  Green: "bg-green-500",
  Yellow: "bg-yellow-400",
  Blue: "bg-blue-500",
  Orange: "bg-orange-500",
  Red: "bg-red-500",
  Purple: "bg-purple-500",
};

export default function CheckInPage() {
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"scanner" | "manual">("manual");
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null);
  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  // Fetch events
  useEffect(() => {
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((data) => {
        const evts = (Array.isArray(data) ? data : []).map((e: ActiveEvent) => ({
          id: e.id,
          name: e.name,
        }));
        setEvents(evts);
        if (evts.length > 0) setSelectedEventId(evts[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchStats = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/admin/check-in?eventId=${selectedEventId}`);
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, [selectedEventId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  async function handleCheckIn(code: string, method: "qr_scan" | "manual" | "code_entry") {
    if (!code.trim() || !selectedEventId || processing) return;
    setProcessing(true);
    setLastResult(null);

    try {
      const res = await fetch("/api/admin/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), eventId: selectedEventId, method }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setLastResult(data);
        toast.success(`Checked in ${data.registration.first_name} ${data.registration.last_name}`);
        fetchStats();
      } else {
        setLastResult(data);
        if (data.alreadyCheckedIn) {
          toast.warning("Already checked in");
        } else {
          toast.error(data.error || "Check-in failed");
        }
      }
    } catch {
      setLastResult({ error: "Network error" });
      toast.error("Network error");
    } finally {
      setProcessing(false);
      setManualCode("");
    }
  }

  async function handleUndo(registrationId: string) {
    try {
      const res = await fetch("/api/admin/check-in", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      if (res.ok) {
        toast.success("Check-in reversed");
        setLastResult(null);
        fetchStats();
      }
    } catch {
      toast.error("Failed to undo check-in");
    }
  }

  // QR Scanner
  useEffect(() => {
    if (mode !== "scanner" || !scannerActive) return;

    let scanner: { stop: () => Promise<void>; clear: () => void; getState: () => number } | null = null;
    let cancelled = false;

    async function startScanner() {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const s = new Html5Qrcode("qr-reader");
      html5QrRef.current = s;
      scanner = s;

      try {
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            // Extract confirmation code from URL or use raw code
            let code = decodedText;
            try {
              const url = new URL(decodedText);
              const codeParam = url.searchParams.get("code");
              if (codeParam) code = codeParam;
            } catch { /* raw code */ }
            handleCheckIn(code, "qr_scan");
          },
          () => { /* ignore scan failures */ }
        );
      } catch (err) {
        console.error("Scanner start failed:", err);
        toast.error("Camera access denied or not available");
        setScannerActive(false);
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (scanner) {
        // State 2 = SCANNING in html5-qrcode
        const isScanning = scanner.getState?.() === 2;
        if (isScanning) {
          scanner.stop().then(() => scanner?.clear()).catch(() => {});
        } else {
          try { scanner.clear(); } catch { /* already cleared */ }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scannerActive, selectedEventId]);

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
          <h1 className="text-xl sm:text-2xl font-bold">Check-In Station</h1>
          <p className="text-sm text-muted-foreground">Scan QR codes or enter confirmation codes</p>
        </div>
        <div className="flex gap-2">
          {events.length > 1 && (
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card className="shadow-brand-sm">
            <CardContent className="pt-4 pb-3 px-4 sm:pt-5 sm:pb-4 sm:px-5 flex items-center gap-3">
              <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2 sm:p-2.5">
                <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{stats.checkedIn}</p>
                <p className="text-xs text-muted-foreground">Checked In</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-brand-sm">
            <CardContent className="pt-4 pb-3 px-4 sm:pt-5 sm:pb-4 sm:px-5 flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2 sm:p-2.5">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{stats.remaining}</p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-brand-sm">
            <CardContent className="pt-4 pb-3 px-4 sm:pt-5 sm:pb-4 sm:px-5 flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2 sm:p-2.5">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{stats.totalRegistrations}</p>
                <p className="text-xs text-muted-foreground">Total Expected</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scanner / Input */}
        <div className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "scanner" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => { setMode("scanner"); setScannerActive(true); }}
            >
              <Camera className="h-4 w-4" />
              QR Scanner
            </Button>
            <Button
              variant={mode === "manual" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setMode("manual");
                setScannerActive(false);
              }}
            >
              <Keyboard className="h-4 w-4" />
              Manual Entry
            </Button>
          </div>

          {mode === "scanner" ? (
            <Card className="shadow-brand-sm overflow-hidden">
              <CardContent className="p-0">
                <div
                  id="qr-reader"
                  ref={scannerRef}
                  className="w-full aspect-square max-h-[400px]"
                />
                {!scannerActive && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                    <CameraOff className="h-10 w-10" />
                    <p className="text-sm">Camera not active</p>
                    <Button size="sm" onClick={() => setScannerActive(true)}>
                      Start Camera
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-brand-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanLine className="h-4 w-4" />
                  Enter Confirmation Code
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCheckIn(manualCode, "code_entry");
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="FF26-HENOK-4821"
                    className="font-mono text-lg"
                    autoFocus
                    disabled={processing}
                  />
                  <Button type="submit" disabled={processing || !manualCode.trim()}>
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Last Result */}
          {lastResult && (
            <CheckInResultCard result={lastResult} onUndo={handleUndo} />
          )}
        </div>

        {/* Right Column: Wristband breakdown + recent */}
        <div className="space-y-4">
          {/* Wristband Breakdown */}
          {stats && Object.keys(stats.byAccessTier).length > 0 && (
            <Card className="shadow-brand-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Wristband Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.byAccessTier).map(([tier, info]) => (
                    <div key={tier} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-4 w-4 rounded-full ${WRISTBAND_COLORS[info.color] || "bg-gray-400"}`} />
                        <span className="text-sm">{tier.replace("_", " ")}</span>
                      </div>
                      <Badge variant="secondary">{info.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Check-ins */}
          {stats && stats.recentCheckIns.length > 0 && (
            <Card className="shadow-brand-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Check-ins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {stats.recentCheckIns.map((ci) => (
                    <div
                      key={ci.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            WRISTBAND_COLORS[ci.wristband_color] || "bg-gray-400"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium">
                            {ci.registrations.first_name} {ci.registrations.last_name}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {ci.registrations.public_confirmation_code}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {ci.registrations.attendance_type.replace("_", " ")}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(ci.checked_in_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Check-In Result Card ─── */
function CheckInResultCard({
  result,
  onUndo,
}: {
  result: CheckInResult;
  onUndo: (regId: string) => void;
}) {
  const reg = result.registration;
  const wristband = result.wristband;

  if (result.success && reg && wristband) {
    return (
      <Card className="shadow-brand-md border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
        <CardContent className="py-5 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-lg font-bold text-green-800 dark:text-green-300">
                {reg.first_name} {reg.last_name}
              </p>
              <p className="text-xs text-green-700/70 dark:text-green-400/70 font-mono">
                {reg.public_confirmation_code}
              </p>
            </div>
          </div>

          <Separator className="bg-green-200 dark:bg-green-800" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-full ${
                  WRISTBAND_COLORS[wristband.color] || "bg-gray-400"
                } flex items-center justify-center`}
              >
                <span className="text-white font-bold text-xs">
                  {wristband.color.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-semibold text-lg">{wristband.color} Wristband</p>
                <p className="text-sm text-muted-foreground">{wristband.label}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive gap-1.5"
              onClick={() => onUndo(reg.id)}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (result.alreadyCheckedIn && reg) {
    return (
      <Card className="shadow-brand-md border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="py-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-bold text-amber-800 dark:text-amber-300">Already Checked In</p>
              <p className="text-sm">
                {reg.first_name} {reg.last_name}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {reg.public_confirmation_code}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-brand-md border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
      <CardContent className="py-5">
        <div className="flex items-center gap-3">
          <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-bold text-red-800 dark:text-red-300">Check-in Failed</p>
            <p className="text-sm text-red-700/80 dark:text-red-400/80">
              {result.error || "Unknown error"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
