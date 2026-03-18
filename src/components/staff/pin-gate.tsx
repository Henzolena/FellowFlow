"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import type { StaffRole } from "@/types/database";

type PinGateProps = {
  eventId: string;
  onAuthenticated: (role: StaffRole, label: string | null) => void;
};

export function PinGate({ eventId, onAuthenticated }: PinGateProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/staff/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, pin: trimmed }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Invalid access code");
        setLoading(false);
        return;
      }

      const data = await res.json();
      // Store in sessionStorage for the duration of the browser session
      sessionStorage.setItem("staff_role", data.role);
      sessionStorage.setItem("staff_label", data.label || "");
      sessionStorage.setItem("staff_event_id", eventId);
      sessionStorage.setItem("staff_pin", trimmed);
      onAuthenticated(data.role as StaffRole, data.label);
    } catch {
      setError("Connection failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="w-full max-w-sm relative space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
            <Shield className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Access</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Enter your staff access code to continue
          </p>
        </div>

        <Card className="shadow-brand-md">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin" className="text-sm font-medium">
                  Access Code
                </Label>
                <Input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setError(""); }}
                  placeholder="Enter your PIN"
                  className="text-center font-mono text-lg tracking-widest h-12"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                size="lg"
                disabled={!pin.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                Authenticate
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
