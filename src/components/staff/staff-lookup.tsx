"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  CheckCircle2,
  XCircle,
  Loader2,
  Camera,
  Keyboard,
  LogOut,
  RefreshCw,
  BedDouble,
  Building2,
  DoorOpen,
  User,
} from "lucide-react";
import { useScanAudio } from "@/lib/hooks/use-scan-audio";
import type { StaffRole } from "@/types/database";

type LodgingInfo = {
  bedLabel: string | null;
  bedType: string | null;
  roomNumber: string | null;
  roomType: string | null;
  floor: number | null;
  motelName: string | null;
};

type RegistrationInfo = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  attendanceType: string;
  accessTier: string;
  confirmationCode: string;
  gender: string | null;
  category: string;
  checkedIn: boolean;
};

type LookupResult = {
  registration: RegistrationInfo;
  lodging: LodgingInfo | null;
  staffRole: string;
} | null;

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

type StaffLookupProps = {
  eventId: string;
  role: StaffRole;
  stationLabel: string;
  onLogout: () => void;
};

export function StaffLookup({ eventId, role, stationLabel, onLogout }: StaffLookupProps) {
  const [inputMode, setInputMode] = useState<"camera" | "manual">("manual");
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult>(null);
  const [error, setError] = useState("");
  const lastScanRef = useRef(0);
  const scannerInstanceRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const scannerBusyRef = useRef(false);
  const { playSuccess, playError } = useScanAudio();

  const pin = typeof window !== "undefined" ? sessionStorage.getItem("staff_pin") || "" : "";

  const performLookup = useCallback(async (code: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = now;

    if (!code.trim()) return;

    setScanning(true);
    setLookupResult(null);
    setError("");

    try {
      const res = await fetch("/api/staff/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: extractCodeFromQR(code),
          eventId,
          pin,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Not found");
        playError();
        setScanning(false);
        return;
      }

      const data = await res.json();
      setLookupResult(data);
      playSuccess();
    } catch {
      setError("Connection failed");
      playError();
    }

    setScanning(false);
  }, [eventId, pin, playSuccess, playError]);

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

        const scanner = new Html5Qrcode("staff-lookup-qr-reader");
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => { if (!cancelled) performLookup(decoded); },
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
  }, [inputMode, performLookup]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) {
      performLookup(manualCode.trim());
      setManualCode("");
    }
  }

  const roleLabel = role === "proctor" ? "Dorm Verification" : "Motel Check-In";
  const IconComponent = role === "proctor" ? BedDouble : Building2;

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Header — compact */}
      <div className="shrink-0 bg-background/95 backdrop-blur border-b px-3 py-2">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight flex items-center gap-1.5">
              <IconComponent className="h-4 w-4" />
              {roleLabel}
            </h1>
            <p className="text-[10px] text-muted-foreground truncate">{stationLabel}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1 text-[10px] h-7 px-2 shrink-0">
            <LogOut className="h-3 w-3" /> Exit
          </Button>
        </div>
      </div>

      {/* Controls bar — mode toggle + manual input (hidden when result showing) */}
      {!lookupResult && !error && (
        <div className="shrink-0 px-3 pt-2 pb-1 space-y-2 max-w-lg mx-auto w-full">
          <div className="flex gap-2 items-center">
            {inputMode === "manual" ? (
              <form onSubmit={handleManualSubmit} className="flex gap-2 flex-1">
                <Input
                  value={manualCode}
                  onChange={(e) => { setManualCode(e.target.value); setError(""); }}
                  placeholder="MW26-HR-10927"
                  className="font-mono text-center h-9 text-sm"
                  autoFocus
                  autoComplete="off"
                />
                <Button type="submit" size="sm" className="h-9 px-4" disabled={!manualCode.trim() || scanning}>
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
                </Button>
              </form>
            ) : (
              <div className="flex-1" />
            )}
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
        </div>
      )}

      {/* Main area — camera OR result (fills remaining space) */}
      <div className="flex-1 min-h-0 flex flex-col max-w-lg mx-auto w-full px-3 pb-3">
        {!lookupResult && !error ? (
          /* Camera fills remaining viewport */
          inputMode === "camera" ? (
            <div className="flex-1 min-h-0 rounded-lg overflow-hidden border bg-black mt-2">
              <div id="staff-lookup-qr-reader" className="h-full" style={{ width: "100%" }} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Enter a confirmation code above
            </div>
          )
        ) : (
          /* Result or error — replaces camera/input area */
          <div className="flex-1 min-h-0 flex flex-col mt-2 gap-2">
            {/* Error state */}
            {error && (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-3 w-full">
                  <XCircle className="h-8 w-8 text-red-500 shrink-0" />
                  <p className="font-semibold text-red-700 dark:text-red-400 text-lg">{error}</p>
                </div>
              </div>
            )}

            {/* Success state */}
            {lookupResult && (
              <div className="flex-1 min-h-0 rounded-lg border-2 border-green-500 bg-green-50/50 dark:bg-green-950/20 overflow-auto">
                <div className="p-3 space-y-3">
                  {/* Person info */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base leading-tight">
                        {lookupResult.registration.firstName} {lookupResult.registration.lastName}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {lookupResult.registration.confirmationCode}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {lookupResult.registration.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {lookupResult.registration.attendanceType?.replace("_", " ")}
                        </Badge>
                        <Badge
                          variant={lookupResult.registration.status === "confirmed" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {lookupResult.registration.status}
                        </Badge>
                      </div>
                    </div>
                    {lookupResult.registration.checkedIn && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    )}
                  </div>

                  {/* Lodging info — compact */}
                  {lookupResult.lodging ? (
                    <div className="rounded-md border bg-background p-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Building2 className="h-3.5 w-3.5 text-blue-500" />
                        Lodging
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        {lookupResult.lodging.motelName && (
                          <div>
                            <span className="text-muted-foreground text-[10px]">Building</span>
                            <p className="font-medium leading-tight">{lookupResult.lodging.motelName}</p>
                          </div>
                        )}
                        {lookupResult.lodging.roomNumber && (
                          <div>
                            <span className="text-muted-foreground text-[10px]">Room</span>
                            <p className="font-medium leading-tight">
                              {lookupResult.lodging.roomNumber}
                              {lookupResult.lodging.floor != null && (
                                <span className="text-muted-foreground ml-1">(F{lookupResult.lodging.floor})</span>
                              )}
                            </p>
                          </div>
                        )}
                        {lookupResult.lodging.bedLabel && (
                          <div>
                            <span className="text-muted-foreground text-[10px]">Bed</span>
                            <p className="font-medium leading-tight flex items-center gap-1">
                              <BedDouble className="h-3 w-3" />
                              {lookupResult.lodging.bedLabel}
                            </p>
                          </div>
                        )}
                        {lookupResult.lodging.roomType && (
                          <div>
                            <span className="text-muted-foreground text-[10px]">Type</span>
                            <p className="font-medium leading-tight capitalize">
                              {lookupResult.lodging.roomType.replace("_", " ")}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <DoorOpen className="h-3.5 w-3.5" />
                        No lodging assignment
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Day camper or not yet assigned.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full shrink-0 gap-2 h-12 text-base"
              onClick={() => { setLookupResult(null); setError(""); }}
            >
              <RefreshCw className="h-4 w-4" /> Next Lookup
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
