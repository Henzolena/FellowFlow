"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  Copy,
  Loader2,
  Camera,
  Keyboard,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useScanAudio } from "@/lib/hooks/use-scan-audio";
import type { StaffRole } from "@/types/database";

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

const SCAN_COOLDOWN_MS = 800;

function extractCodeFromQR(raw: string): string {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split("/").filter(Boolean);
    const receiptIdx = segments.indexOf("receipt");
    if (receiptIdx >= 0 && segments[receiptIdx + 1]) {
      return decodeURIComponent(segments[receiptIdx + 1]);
    }
    return raw.trim();
  } catch {
    return raw.trim();
  }
}

const RESULT_COLORS: Record<string, string> = {
  approved: "border-green-500 bg-green-50 dark:bg-green-950/30",
  denied: "border-red-500 bg-red-50 dark:bg-red-950/30",
  duplicate: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
  not_entitled: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
  blocked: "border-red-700 bg-red-100 dark:bg-red-950/50",
};

const RESULT_ICONS: Record<string, React.ReactNode> = {
  approved: <CheckCircle2 className="h-8 w-8 text-green-500" />,
  denied: <XCircle className="h-8 w-8 text-red-500" />,
  duplicate: <Copy className="h-8 w-8 text-amber-500" />,
  not_entitled: <AlertTriangle className="h-8 w-8 text-orange-500" />,
  blocked: <Ban className="h-8 w-8 text-red-700" />,
};

type StaffScannerProps = {
  eventId: string;
  role: StaffRole;
  stationLabel: string;
  onLogout: () => void;
};

export function StaffScanner({ eventId, role, stationLabel, onLogout }: StaffScannerProps) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [inputMode, setInputMode] = useState<"camera" | "manual">("manual");
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const lastScanRef = useRef(0);
  const scannerInstanceRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const scannerBusyRef = useRef(false);
  const { playSuccess, playError } = useScanAudio();

  const pin = typeof window !== "undefined" ? sessionStorage.getItem("staff_pin") || "" : "";

  // Load services
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/staff/scan?eventId=${eventId}&pin=${encodeURIComponent(pin)}`);
        if (!res.ok) return;
        const data = await res.json();
        setServices(data.services || []);
        if (data.services?.length > 0) {
          setSelectedServiceId(data.services[0].id);
        }
      } catch {
        // silent
      }
      setLoading(false);
    }
    load();
  }, [eventId, pin]);

  const performScan = useCallback(async (code: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = now;

    if (!selectedServiceId || !code.trim()) return;

    setScanning(true);
    setScanResult(null);

    try {
      const res = await fetch("/api/staff/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: extractCodeFromQR(code),
          serviceId: selectedServiceId,
          eventId,
          pin,
          stationLabel,
        }),
      });

      const data = await res.json();

      if (data.result === "approved") {
        playSuccess();
      } else {
        playError();
      }

      setScanResult(data);
    } catch {
      playError();
      setScanResult({
        result: "denied",
        reason: "Connection failed",
      });
    }

    setScanning(false);
  }, [selectedServiceId, eventId, pin, stationLabel, playSuccess, playError]);

  // QR Camera — transition-safe start/stop
  useEffect(() => {
    let cancelled = false;

    async function stopExisting() {
      if (scannerBusyRef.current) return;
      const instance = scannerInstanceRef.current;
      if (instance) {
        scannerBusyRef.current = true;
        try {
          const state = instance.getState();
          if (state === 2 /* SCANNING */ || state === 3 /* PAUSED */) {
            await instance.stop();
          }
          instance.clear();
        } catch {
          // ignore — may already be stopped
        }
        scannerInstanceRef.current = null;
        scannerBusyRef.current = false;
      }
    }

    async function manage() {
      await stopExisting();
      if (cancelled || inputMode !== "camera") return;

      scannerBusyRef.current = true;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) { scannerBusyRef.current = false; return; }

        const scanner = new Html5Qrcode("staff-qr-reader");
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => { if (!cancelled) performScan(decoded); },
          () => {}
        );
      } catch {
        if (!cancelled) setInputMode("manual");
      }
      scannerBusyRef.current = false;
    }

    manage();

    return () => {
      cancelled = true;
      const instance = scannerInstanceRef.current;
      if (instance) {
        try {
          const state = instance.getState();
          if (state === 2 || state === 3) {
            instance.stop().catch(() => {});
          }
          instance.clear();
        } catch { /* ignore */ }
        scannerInstanceRef.current = null;
      }
    };
  }, [inputMode, performScan]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) {
      performScan(manualCode.trim());
      setManualCode("");
    }
  }

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const roleLabel = role === "meals" ? "Meal Scanner" : "Auditorium Scanner";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Header — compact */}
      <div className="shrink-0 bg-background/95 backdrop-blur border-b px-3 py-2">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight">{roleLabel}</h1>
            <p className="text-[10px] text-muted-foreground truncate">{stationLabel}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1 text-[10px] h-7 px-2 shrink-0">
            <LogOut className="h-3 w-3" /> Exit
          </Button>
        </div>
      </div>

      {/* Controls bar — service selector + mode toggle */}
      {services.length > 0 && !scanResult && (
        <div className="shrink-0 px-3 pt-2 pb-1 space-y-2 max-w-lg mx-auto w-full">
          <div className="flex gap-2 items-center">
            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
              <SelectTrigger className="h-9 text-xs flex-1">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      {s.service_name}
                      {s.service_date && (
                        <Badge variant="outline" className="text-[10px]">
                          {new Date(s.service_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1 shrink-0">
              <Button
                variant={inputMode === "camera" ? "default" : "outline"}
                size="icon"
                className="h-9 w-9"
                onClick={() => setInputMode("camera")}
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant={inputMode === "manual" ? "default" : "outline"}
                size="icon"
                className="h-9 w-9"
                onClick={() => setInputMode("manual")}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Manual Entry */}
          {inputMode === "manual" && (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="MW26-HR-10927"
                className="font-mono text-center h-9 text-sm"
                autoFocus
                autoComplete="off"
              />
              <Button type="submit" size="sm" className="h-9 px-4" disabled={!manualCode.trim() || scanning || !selectedServiceId}>
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan"}
              </Button>
            </form>
          )}
        </div>
      )}

      {services.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4">
          No services available for your role.
        </div>
      )}

      {/* Main area — camera OR scan result (fills remaining space) */}
      <div className="flex-1 min-h-0 flex flex-col max-w-lg mx-auto w-full px-3 pb-3">
        {!scanResult ? (
          /* Camera fills remaining viewport */
          inputMode === "camera" && services.length > 0 ? (
            <div className="flex-1 min-h-0 rounded-lg overflow-hidden border bg-black mt-2">
              <div id="staff-qr-reader" className="h-full" style={{ width: "100%" }} />
            </div>
          ) : (
            /* Empty state for manual mode */
            services.length > 0 && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Enter a confirmation code above
              </div>
            )
          )
        ) : (
          /* Scan result — replaces camera/input area */
          <div className="flex-1 min-h-0 flex flex-col mt-2 gap-2">
            <div className={`flex-1 min-h-0 rounded-lg border-2 overflow-auto ${RESULT_COLORS[scanResult.result] || ""}`}>
              <div className="p-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 pt-0.5">
                    {RESULT_ICONS[scanResult.result]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg capitalize leading-tight">{scanResult.result.replace("_", " ")}</p>
                    {scanResult.reason && (
                      <p className="text-sm text-muted-foreground">{scanResult.reason}</p>
                    )}
                    {scanResult.registration && (
                      <div className="mt-2 space-y-1">
                        <p className="font-semibold">
                          {scanResult.registration.firstName} {scanResult.registration.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {scanResult.registration.confirmationCode}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {scanResult.registration.category}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {scanResult.registration.attendanceType?.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    )}
                    {scanResult.service && (
                      <p className="text-xs mt-1 text-muted-foreground">
                        Service: {scanResult.service.name}
                      </p>
                    )}
                    {scanResult.usage && (
                      <p className="text-xs text-muted-foreground">
                        Usage: {scanResult.usage.quantityUsed}/{scanResult.usage.quantityAllowed}
                      </p>
                    )}
                    {scanResult.lastUsedAt && (
                      <p className="text-xs text-muted-foreground">
                        Last used: {new Date(scanResult.lastUsedAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="w-full shrink-0 gap-2 h-12 text-base"
              onClick={() => setScanResult(null)}
            >
              <RefreshCw className="h-4 w-4" /> Next Scan
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
