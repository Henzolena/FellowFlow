"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Registration, Event, Church } from "@/types/database";

type CompletionData = {
  registration: Registration;
  event: Event;
};

export default function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompletionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [churchId, setChurchId] = useState("");
  const [churchCustom, setChurchCustom] = useState("");

  useEffect(() => { params.then((p) => setToken(p.token)); }, [params]);

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const [regRes, churchRes] = await Promise.all([
          fetch("/api/registration/complete/" + token),
          fetch("/api/churches"),
        ]);
        if (!regRes.ok) {
          const d = await regRes.json();
          setError(d.error || "Invalid or expired link");
          setLoading(false);
          return;
        }
        const regData = await regRes.json();
        setData(regData);
        if (regData.registration.phone) setPhone(regData.registration.phone);
        if (regData.registration.gender) setGender(regData.registration.gender);
        if (regData.registration.city) setCity(regData.registration.city);
        if (regData.registration.church_id) setChurchId(regData.registration.church_id);
        if (churchRes.ok) {
          const ch = await churchRes.json();
          setChurches(Array.isArray(ch) ? ch : []);
        }
      } catch {
        setError("Something went wrong loading this page.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleComplete() {
    if (!data) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/registration/complete/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone || undefined,
          gender: gender || undefined,
          city: city || undefined,
          churchId: churchId && churchId !== "other" ? churchId : undefined,
          churchNameCustom: churchId === "other" ? churchCustom : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to complete registration");
        setSubmitting(false);
        return;
      }
      const result = await res.json();
      const reg = result.registration;
      const ln = encodeURIComponent(reg.last_name);
      if (Number(reg.computed_amount) === 0) {
        router.push("/register/success?registration_id=" + reg.id + "&free=true&ln=" + ln);
      } else {
        router.push("/register/review?registration_id=" + reg.id + "&ln=" + ln);
      }
    } catch {
      setError("Something went wrong.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="py-10 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
            <p className="font-medium">{error}</p>
            <p className="text-sm text-muted-foreground">This link may have already been used or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;
  const { registration: reg, event } = data;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="w-full max-w-md relative space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-100 dark:bg-green-900/30 px-4 py-1.5 text-sm font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Complete Your Registration
          </div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {reg.first_name}! Please fill in any remaining details.
          </p>
        </div>

        <Card className="shadow-brand-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your Details</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{reg.first_name} {reg.last_name}</Badge>
              <Badge variant="outline" className="capitalize">{reg.attendance_type.replace("_", " ")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" />
            </div>

            <div className="space-y-2">
              <Label>Church</Label>
              <Select value={churchId} onValueChange={setChurchId}>
                <SelectTrigger><SelectValue placeholder="Select church" /></SelectTrigger>
                <SelectContent>
                  {churches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.city ? ` (${c.city})` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {churchId === "other" && (
                <Input
                  value={churchCustom}
                  onChange={(e) => setChurchCustom(e.target.value)}
                  placeholder="Church name"
                  className="mt-2"
                />
              )}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}

            <Button className="w-full" size="lg" onClick={handleComplete} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete Registration
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
