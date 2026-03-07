"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle, Calendar, Users, Building2 } from "lucide-react";
import type { Registration, Event, Church, PricingConfig } from "@/types/database";

type CompletionData = {
  registration: Registration & { events?: Event & { pricing_config?: PricingConfig[] } };
  event: Event & { pricing_config?: PricingConfig[] };
};

type AgeRange = { label: string; min: number; max: number; representative: number };

function computeAgeRanges(event: Event): AgeRange[] {
  const infant = event.infant_age_threshold ?? 3;
  const youth = event.youth_age_threshold ?? 13;
  const adult = event.adult_age_threshold ?? 18;
  return [
    { label: `Infant (0-${infant})`, min: 0, max: infant, representative: Math.floor(infant / 2) },
    { label: `Child (${infant + 1}-${youth - 1})`, min: infant + 1, max: youth - 1, representative: Math.floor((infant + 1 + youth - 1) / 2) },
    { label: `Youth (${youth}-${adult - 1})`, min: youth, max: adult - 1, representative: Math.floor((youth + adult - 1) / 2) },
    { label: `Adult (${adult}+)`, min: adult, max: 99, representative: 30 },
  ];
}

function syntheticDOB(representativeAge: number, eventStartDate: string): string {
  const eventYear = new Date(eventStartDate + "T00:00:00").getFullYear();
  return `${eventYear - representativeAge}-01-01`;
}

export default function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompletionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [churchId, setChurchId] = useState("");
  const [churchCustom, setChurchCustom] = useState("");
  const [ageRangeIdx, setAgeRangeIdx] = useState<string>("");
  const [attendanceType, setAttendanceType] = useState("");
  const [isStayingInMotel, setIsStayingInMotel] = useState(false);
  const [numDays, setNumDays] = useState("");

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
        if (regData.registration.attendance_type) setAttendanceType(regData.registration.attendance_type);
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

  const ageRanges = useMemo(() => {
    if (!data?.event) return [];
    return computeAgeRanges(data.event);
  }, [data?.event]);

  const showPartialFields = attendanceType === "partial";
  const showMotelField = attendanceType === "full_conference" || attendanceType === "partial";

  async function handleComplete() {
    if (!data) return;

    if (!ageRangeIdx) {
      setError("Please select your age range.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const selectedRange = ageRanges[parseInt(ageRangeIdx)];
    const dateOfBirth = selectedRange
      ? syntheticDOB(selectedRange.representative, data.event.start_date)
      : undefined;

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
          dateOfBirth,
          attendanceType: attendanceType || undefined,
          isStayingInMotel: showMotelField ? isStayingInMotel : undefined,
          numDays: showPartialFields && numDays ? parseInt(numDays) : undefined,
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
      <div className="w-full max-w-lg relative space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 dark:bg-violet-900/30 px-4 py-1.5 text-sm font-medium text-violet-700 dark:text-violet-400">
            <CheckCircle2 className="h-4 w-4" />
            Complete Your Registration
          </div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {reg.first_name}! Please fill in the remaining details below.
          </p>
        </div>

        {/* Pre-filled info banner */}
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20">
          <CardContent className="py-4 px-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-2">Pre-filled by Admin</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{reg.first_name} {reg.last_name}</Badge>
              <Badge variant="outline">{reg.email}</Badge>
              <Badge variant="outline" className="capitalize">{reg.attendance_type.replace("_", " ")}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-brand-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Your Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Age Range */}
            <div className="space-y-2">
              <Label className="font-medium">Age Range <span className="text-destructive">*</span></Label>
              <Select value={ageRangeIdx} onValueChange={setAgeRangeIdx}>
                <SelectTrigger><SelectValue placeholder="Select your age range" /></SelectTrigger>
                <SelectContent>
                  {ageRanges.map((r, i) => (
                    <SelectItem key={i} value={String(i)}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Attendance Type */}
            <div className="space-y-2">
              <Label className="font-medium flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                Attendance Type
              </Label>
              <Select value={attendanceType} onValueChange={setAttendanceType}>
                <SelectTrigger><SelectValue placeholder="Select attendance type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_conference">Full Conference</SelectItem>
                  <SelectItem value="partial">Partial Attendance</SelectItem>
                  <SelectItem value="kote">KOTE / Walk-in</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Partial: number of days */}
            {showPartialFields && (
              <div className="space-y-2">
                <Label className="font-medium">Number of Days</Label>
                <Input
                  type="number"
                  min={1}
                  max={event.duration_days}
                  value={numDays}
                  onChange={(e) => setNumDays(e.target.value)}
                  placeholder={`1-${event.duration_days}`}
                />
              </div>
            )}

            {/* Motel */}
            {showMotelField && (
              <div className="space-y-2">
                <Label className="font-medium flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Staying in On-Campus Motel?
                </Label>
                <Select
                  value={isStayingInMotel ? "yes" : "no"}
                  onValueChange={(v) => setIsStayingInMotel(v === "yes")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <hr className="border-border" />

            {/* Personal details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
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

            <p className="text-xs text-center text-muted-foreground">
              After completing, you may be redirected to payment if applicable.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
