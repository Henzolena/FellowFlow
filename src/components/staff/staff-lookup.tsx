"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  const scannerRef = useRef<{ stop?: () => void } | null>(null);
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
        const scanner = new Html5Qrcode("staff-lookup-qr-reader");
        scannerRef.current = { stop: () => { stopped = true; scanner.stop().catch(() => {}); } };

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => {
            if (!stopped) performLookup(decoded);
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <IconComponent className="h-5 w-5" />
              {roleLabel}
            </h1>
            <p className="text-xs text-muted-foreground">{stationLabel}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1 text-xs">
            <LogOut className="h-3 w-3" /> Exit
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Input Mode Toggle */}
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

        {/* Camera Scanner */}
        {inputMode === "camera" && (
          <div className="rounded-lg overflow-hidden border bg-black">
            <div id="staff-lookup-qr-reader" style={{ width: "100%" }} />
          </div>
        )}

        {/* Manual Entry */}
        {inputMode === "manual" && (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => { setManualCode(e.target.value); setError(""); }}
              placeholder="MW26-HR-10927"
              className="font-mono text-center h-12"
              autoFocus
              autoComplete="off"
            />
            <Button type="submit" size="lg" disabled={!manualCode.trim() || scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
            </Button>
          </form>
        )}

        {/* Error */}
        {error && (
          <Card className="border-2 border-red-500 bg-red-50 dark:bg-red-950/30">
            <CardContent className="py-4 flex items-center gap-3">
              <XCircle className="h-6 w-6 text-red-500 shrink-0" />
              <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Lookup Result */}
        {lookupResult && (
          <Card className="border-2 border-green-500 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="py-4 space-y-4">
              {/* Person info */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg">
                    {lookupResult.registration.firstName} {lookupResult.registration.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
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

              {/* Lodging info */}
              {lookupResult.lodging ? (
                <div className="rounded-lg border bg-background p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    Lodging Assignment
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {lookupResult.lodging.motelName && (
                      <div>
                        <span className="text-muted-foreground text-xs">Building</span>
                        <p className="font-medium">{lookupResult.lodging.motelName}</p>
                      </div>
                    )}
                    {lookupResult.lodging.roomNumber && (
                      <div>
                        <span className="text-muted-foreground text-xs">Room</span>
                        <p className="font-medium">
                          {lookupResult.lodging.roomNumber}
                          {lookupResult.lodging.floor != null && (
                            <span className="text-muted-foreground text-xs ml-1">
                              (Floor {lookupResult.lodging.floor})
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {lookupResult.lodging.bedLabel && (
                      <div>
                        <span className="text-muted-foreground text-xs">Bed</span>
                        <p className="font-medium flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {lookupResult.lodging.bedLabel}
                        </p>
                      </div>
                    )}
                    {lookupResult.lodging.roomType && (
                      <div>
                        <span className="text-muted-foreground text-xs">Type</span>
                        <p className="font-medium capitalize">
                          {lookupResult.lodging.roomType.replace("_", " ")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <DoorOpen className="h-4 w-4" />
                    No lodging assignment found
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    This person may be a day camper or their lodging hasn&apos;t been assigned yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Clear */}
        {(lookupResult || error) && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => { setLookupResult(null); setError(""); }}
          >
            <RefreshCw className="h-4 w-4" /> Ready for Next Lookup
          </Button>
        )}
      </div>
    </div>
  );
}
