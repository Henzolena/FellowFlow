"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const scannerRef = useRef<{ stop?: () => void } | null>(null);
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

  // QR Camera
  useEffect(() => {
    if (inputMode !== "camera") {
      if (scannerRef.current?.stop) scannerRef.current.stop();
      return;
    }

    let stopped = false;
    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("staff-qr-reader");
        scannerRef.current = { stop: () => { stopped = true; scanner.stop().catch(() => {}); } };

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => {
            if (!stopped) performScan(decoded);
          },
          () => {}
        );
      } catch {
        setInputMode("manual");
      }
    }
    startScanner();

    return () => {
      if (scannerRef.current?.stop) scannerRef.current.stop();
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{roleLabel}</h1>
            <p className="text-xs text-muted-foreground">{stationLabel}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1 text-xs">
            <LogOut className="h-3 w-3" /> Exit
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Service Selector */}
        {services.length > 0 && (
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger className="h-12">
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
        )}

        {services.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No services available for your role.
            </CardContent>
          </Card>
        )}

        {/* Input Mode Toggle */}
        {services.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant={inputMode === "camera" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1"
              onClick={() => setInputMode("camera")}
            >
              <Camera className="h-4 w-4" /> Camera
            </Button>
            <Button
              variant={inputMode === "manual" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1"
              onClick={() => setInputMode("manual")}
            >
              <Keyboard className="h-4 w-4" /> Manual
            </Button>
          </div>
        )}

        {/* Camera Scanner */}
        {inputMode === "camera" && (
          <div className="rounded-lg overflow-hidden border bg-black">
            <div id="staff-qr-reader" style={{ width: "100%" }} />
          </div>
        )}

        {/* Manual Entry */}
        {inputMode === "manual" && services.length > 0 && (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="MW26-HR-10927"
              className="font-mono text-center h-12"
              autoFocus
              autoComplete="off"
            />
            <Button type="submit" size="lg" disabled={!manualCode.trim() || scanning || !selectedServiceId}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan"}
            </Button>
          </form>
        )}

        {/* Scan Result */}
        {scanResult && (
          <Card className={`border-2 transition-all ${RESULT_COLORS[scanResult.result] || ""}`}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="pt-1">{RESULT_ICONS[scanResult.result]}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg capitalize">{scanResult.result.replace("_", " ")}</p>
                  {scanResult.reason && (
                    <p className="text-sm text-muted-foreground">{scanResult.reason}</p>
                  )}
                  {scanResult.registration && (
                    <div className="mt-2 space-y-1">
                      <p className="font-semibold text-base">
                        {scanResult.registration.firstName} {scanResult.registration.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {scanResult.registration.confirmationCode}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
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
            </CardContent>
          </Card>
        )}

        {/* Clear / Refresh */}
        {scanResult && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setScanResult(null)}
          >
            <RefreshCw className="h-4 w-4" /> Ready for Next Scan
          </Button>
        )}
      </div>
    </div>
  );
}
