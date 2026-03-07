"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  Copy,
  Utensils,
  DoorOpen,
  Sparkles,
  Loader2,
  Camera,
  Keyboard,
  RefreshCw,
  Users,
  Clock,
  ShieldAlert,
} from "lucide-react";

type ServiceOption = {
  id: string;
  service_name: string;
  service_code: string;
  service_category: string;
  meal_type: string | null;
  service_date: string | null;
};

type ScanResultData = {
  result: "approved" | "denied" | "duplicate" | "not_entitled" | "blocked";
  reason: string | null;
  lastUsedAt?: string | null;
  registration?: {
    id: string;
    firstName: string;
    lastName: string;
    status: string;
    attendanceType: string;
    accessTier: string;
    confirmationCode: string;
    gender: string | null;
    city: string | null;
    category: string;
    checkedIn: boolean;
    churchName?: string | null;
  };
  service?: {
    name: string;
    category: string;
    mealType?: string | null;
    serviceDate?: string | null;
  };
  usage?: { quantityUsed: number; quantityAllowed: number };
};

// Cooldown between QR scans — prevents rapid-fire duplicate reads.
const SCAN_COOLDOWN_MS = 2000;

/** Extract a confirmation code from a raw QR decode (may be a URL or plain code). */
function extractCodeFromQR(raw: string): string {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split("/").filter(Boolean);
    const receiptIdx = segments.indexOf("receipt");
    if (receiptIdx >= 0 && segments[receiptIdx + 1]) {
      return decodeURIComponent(segments[receiptIdx + 1]);
    }
    const codeParam = url.searchParams.get("code");
    if (codeParam) return codeParam;
  } catch { /* not a URL */ }
  return raw;
}

type ServiceStats = {
  serviceId: string;
  totalRegistered: number;
  totalEntitled: number;
  totalUsed: number;
  remaining: number;
  recentScans: Array<{
    id: string;
    result: string;
    scanned_at: string;
    registrations?: { first_name: string; last_name: string; public_confirmation_code: string };
  }>;
};

export default function ServiceScannerPage() {
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [scanMode, setScanMode] = useState<"camera" | "manual">("manual");
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [loadingServices, setLoadingServices] = useState(true);
  const [cooldownActive, setCooldownActive] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrScannerRef = useRef<unknown>(null);
  const cooldownRef = useRef(false);

  // Load events
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, name")
        .eq("is_active", true)
        .order("start_date", { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    }
    load();
  }, []);

  // Load services for selected event
  const loadServices = useCallback(async () => {
    if (!selectedEventId) return;
    setLoadingServices(true);
    try {
      const res = await fetch(`/api/admin/services?eventId=${selectedEventId}`);
      if (!res.ok) {
        console.error("Failed to load services:", res.status);
        setLoadingServices(false);
        return;
      }
      const json = await res.json();
      const svcs = (json.services || []).filter((s: ServiceOption & { is_active: boolean }) => s.is_active);
      setServices(svcs);
      if (svcs.length > 0) {
        setSelectedServiceId((prev) => {
          if (prev && svcs.find((s: ServiceOption) => s.id === prev)) return prev;
          return svcs[0].id;
        });
      }
    } catch (err) {
      console.error("Load services error:", err);
    }
    setLoadingServices(false);
  }, [selectedEventId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Load stats for selected service
  const loadStats = useCallback(async () => {
    if (!selectedEventId || !selectedServiceId) return;
    const res = await fetch(`/api/admin/service-scan?eventId=${selectedEventId}&serviceId=${selectedServiceId}`);
    const json = await res.json();
    setStats(json);
  }, [selectedEventId, selectedServiceId]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10_000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // QR Scanner setup
  useEffect(() => {
    if (scanMode !== "camera" || !scannerRef.current) return;

    let scanner: { stop: () => Promise<void>; clear: () => void; start: (config: unknown, qrbox: unknown, onSuccess: (text: string) => void) => Promise<void>; getState: () => number } | null = null;

    async function initScanner() {
      const { Html5Qrcode } = await import("html5-qrcode");
      scanner = new Html5Qrcode("service-scanner-region") as unknown as typeof scanner;
      try {
        await scanner!.start(
          { facingMode: "environment" },
          { fps: 5, qrbox: { width: 200, height: 200 } },
          (decodedText: string) => {
            // Enforce cooldown — ignore rapid-fire decodes
            if (cooldownRef.current) return;
            const code = extractCodeFromQR(decodedText);
            if (!code.trim()) return;

            cooldownRef.current = true;
            setCooldownActive(true);
            handleScan(code);

            setTimeout(() => {
              cooldownRef.current = false;
              setCooldownActive(false);
            }, SCAN_COOLDOWN_MS);
          }
        );
      } catch (err) {
        console.error("Camera failed:", err);
        setScanMode("manual");
      }
    }

    initScanner();
    html5QrScannerRef.current = scanner;

    return () => {
      if (scanner) {
        const s = scanner;
        (async () => {
          try {
            if (s.getState() === 2) await s.stop();
            s.clear();
          } catch { /* cleanup */ }
        })();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, selectedServiceId]);

  async function handleScan(code: string) {
    if (!code || !selectedServiceId || !selectedEventId || scanning) return;
    setScanning(true);
    setScanResult(null);

    try {
      const res = await fetch("/api/admin/service-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          serviceId: selectedServiceId,
          eventId: selectedEventId,
        }),
      });
      const json = await res.json();
      setScanResult(json);
      loadStats();
    } catch {
      setScanResult({ result: "denied", reason: "Network error" });
    } finally {
      setScanning(false);
      setManualCode("");
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) handleScan(manualCode.trim());
  }

  const selectedService = services.find((s) => s.id === selectedServiceId);

  const resultConfig: Record<string, { icon: React.ReactNode; bg: string; border: string; text: string; label: string }> = {
    approved: { icon: <CheckCircle2 className="h-16 w-16" />, bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", label: "APPROVED" },
    denied: { icon: <XCircle className="h-16 w-16" />, bg: "bg-red-50", border: "border-red-300", text: "text-red-700", label: "DENIED" },
    duplicate: { icon: <Copy className="h-16 w-16" />, bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", label: "ALREADY USED" },
    not_entitled: { icon: <AlertTriangle className="h-16 w-16" />, bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", label: "NOT ENTITLED" },
    blocked: { icon: <Ban className="h-16 w-16" />, bg: "bg-red-50", border: "border-red-300", text: "text-red-700", label: "BLOCKED" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Service Scanner</h1>
        <p className="text-sm text-muted-foreground">Select a service station, then scan attendee QR codes</p>
      </div>

      {/* Service selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {events.length > 1 && (
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger>
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={selectedServiceId} onValueChange={(v) => { setSelectedServiceId(v); setScanResult(null); }}>
          <SelectTrigger className="font-semibold">
            <SelectValue placeholder={loadingServices ? "Loading..." : "Select service station"} />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  {s.service_category === "meal" ? <Utensils className="h-3.5 w-3.5" /> : s.service_category === "main_service" ? <DoorOpen className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {s.service_name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Current station banner */}
      {selectedService && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-4 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider opacity-80">Active Station</p>
              <h2 className="text-lg sm:text-xl font-bold">{selectedService.service_name}</h2>
              {selectedService.service_date && (
                <p className="text-sm opacity-90">
                  {new Date(selectedService.service_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              )}
            </div>
            {stats && (
              <div className="sm:text-right">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xl sm:text-2xl font-bold">{stats.totalUsed}</p>
                    <p className="text-xs opacity-80">Served</p>
                  </div>
                  <div className="h-8 w-px bg-white/30" />
                  <div>
                    <p className="text-xl sm:text-2xl font-bold">{stats.remaining}</p>
                    <p className="text-xs opacity-80">Remaining</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scanner */}
      {selectedServiceId && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Scan area — takes 3 cols */}
          <div className="lg:col-span-3 space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button variant={scanMode === "manual" ? "default" : "outline"} size="sm" onClick={() => setScanMode("manual")} className="gap-2">
                <Keyboard className="h-4 w-4" /> Manual Entry
              </Button>
              <Button variant={scanMode === "camera" ? "default" : "outline"} size="sm" onClick={() => setScanMode("camera")} className="gap-2">
                <Camera className="h-4 w-4" /> QR Camera
              </Button>
            </div>

            {scanMode === "camera" ? (
              <div className="rounded-xl border overflow-hidden bg-black relative">
                <div id="service-scanner-region" ref={scannerRef} className="w-full" />
                {/* Cooldown progress bar */}
                {cooldownActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-muted/30 overflow-hidden z-10">
                    <div
                      className="h-full bg-green-500 rounded-r-full"
                      style={{ animation: `scan-cooldown ${SCAN_COOLDOWN_MS}ms linear forwards` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <Input
                  ref={codeInputRef}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter confirmation code or scan..."
                  className="text-lg font-mono h-12"
                  autoFocus
                  disabled={scanning}
                />
                <Button type="submit" size="lg" disabled={scanning || !manualCode.trim()} className="h-12 px-6">
                  {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : "Scan"}
                </Button>
              </form>
            )}

            {/* Scan result */}
            {scanResult && (
              <ScanResultDisplay result={scanResult} config={resultConfig} />
            )}
          </div>

          {/* Recent scans — takes 2 cols */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-card">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Scans
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadStats}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="max-h-60 lg:max-h-96 overflow-y-auto divide-y">
                {stats?.recentScans && stats.recentScans.length > 0 ? (
                  stats.recentScans.map((scan) => (
                    <div key={scan.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {scan.registrations ? `${scan.registrations.first_name} ${scan.registrations.last_name}` : "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {scan.registrations?.public_confirmation_code || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={
                            scan.result === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : scan.result === "duplicate"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          }
                        >
                          {scan.result}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(scan.scanned_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No scans yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!selectedServiceId && !loadingServices && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Select a Service Station</h3>
          <p className="text-sm text-muted-foreground">Choose which service you are scanning for (e.g., Breakfast, Main Service, etc.)</p>
        </div>
      )}
    </div>
  );
}

function ScanResultDisplay({ result, config }: { result: ScanResultData; config: Record<string, { icon: React.ReactNode; bg: string; border: string; text: string; label: string }> }) {
  const cfg = config[result.result] || config.denied;

  return (
    <div className={`rounded-2xl border-2 ${cfg.border} ${cfg.bg} p-6 transition-all animate-in fade-in-0 zoom-in-95 duration-300`}>
      {/* Big result indicator */}
      <div className={`flex flex-col items-center text-center mb-4 ${cfg.text}`}>
        {cfg.icon}
        <h2 className="text-3xl font-black mt-2 tracking-tight">{cfg.label}</h2>
        {result.reason && <p className="text-sm mt-1 opacity-80">{result.reason}</p>}
        {result.lastUsedAt && (
          <p className="text-xs mt-1 opacity-70">
            Last used: {new Date(result.lastUsedAt).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}
          </p>
        )}
      </div>

      {/* Attendee info */}
      {result.registration && (
        <div className="bg-white/70 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">
              {result.registration.firstName} {result.registration.lastName}
            </h3>
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs shrink-0 max-w-[140px] truncate">{result.registration.confirmationCode}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="capitalize">{result.registration.category}</Badge>
            <Badge variant="secondary" className="capitalize">{(result.registration.attendanceType || "").replace("_", " ")}</Badge>
            {result.registration.accessTier && (
              <Badge variant="secondary">{result.registration.accessTier}</Badge>
            )}
            {result.registration.gender && (
              <Badge variant="outline" className="capitalize">{result.registration.gender}</Badge>
            )}
            {result.registration.city && (
              <Badge variant="outline">{result.registration.city}</Badge>
            )}
            {result.registration.churchName && (
              <Badge variant="outline">⛪ {result.registration.churchName}</Badge>
            )}
          </div>
          {result.usage && (
            <p className="text-xs text-muted-foreground">
              Usage: {result.usage.quantityUsed} / {result.usage.quantityAllowed}
            </p>
          )}
        </div>
      )}

      {/* Service info */}
      {result.service && (
        <div className="mt-2 text-center">
          <p className="text-xs text-muted-foreground">
            {result.service.name}
            {result.service.serviceDate && ` — ${new Date(result.service.serviceDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </p>
        </div>
      )}
    </div>
  );
}
