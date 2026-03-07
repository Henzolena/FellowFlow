"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle, Calendar, Users, Building2, ShieldCheck, Lock } from "lucide-react";
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

  // Invitation code verification state
  const [requiresCode, setRequiresCode] = useState(false);
  const [codeMinimalInfo, setCodeMinimalInfo] = useState<{ first_name: string; event_name: string } | null>(null);
  const [invitationCode, setInvitationCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""]);

  // Track which fields were pre-filled by admin (locked for user)
  const [prefilled, setPrefilled] = useState<Record<string, boolean>>({});

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

  // Initial load — checks if code is required
  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const res = await fetch(`/api/registration/complete/${token}`);
        if (!res.ok) {
          const d = await res.json();
          setError(d.error || "Invalid or expired link");
          setLoading(false);
          return;
        }
        const resData = await res.json();
        if (resData.requiresCode) {
          setRequiresCode(true);
          setCodeMinimalInfo(resData.registration);
          setLoading(false);
          return;
        }
        // No code required — load full data + churches
        await loadFullData(resData);
      } catch {
        setError("Something went wrong loading this page.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function loadFullData(regData: CompletionData) {
    setData(regData);
    const r = regData.registration;

    // Track which fields the admin pre-filled (these will be locked)
    const pf: Record<string, boolean> = {};
    // name + email are always admin-set for prefill registrations
    pf.name = true;
    pf.email = true;
    // attendance_type is always set by admin (defaults to full_conference)
    if (r.attendance_type) { setAttendanceType(r.attendance_type); pf.attendance = true; }
    if (r.phone) { setPhone(r.phone); pf.phone = true; }
    if (r.gender) { setGender(r.gender); pf.gender = true; }
    if (r.city) { setCity(r.city); pf.city = true; }
    if (r.church_id) { setChurchId(r.church_id); pf.church = true; }
    if (r.church_name_custom) { setChurchId("other"); setChurchCustom(r.church_name_custom); pf.church = true; }
    setPrefilled(pf);

    // Fetch churches for dropdown
    try {
      const churchRes = await fetch("/api/churches");
      if (churchRes.ok) {
        const ch = await churchRes.json();
        setChurches(Array.isArray(ch) ? ch : ch.churches || []);
      }
    } catch { /* ignore */ }
  }

  // Verify invitation code
  async function handleVerifyCode() {
    const code = codeDigits.join("");
    if (code.length !== 6) {
      setCodeError("Please enter the full 6-digit code.");
      return;
    }
    setVerifyingCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`/api/registration/complete/${token}?code=${code}`);
      const resData = await res.json();
      if (!res.ok || resData.requiresCode) {
        setCodeError(resData.error || "Invalid invitation code. Please check your email and try again.");
        setVerifyingCode(false);
        return;
      }
      // Code verified — store it and load full data
      setInvitationCode(code);
      setRequiresCode(false);
      await loadFullData(resData);
    } catch {
      setCodeError("Something went wrong. Please try again.");
    } finally {
      setVerifyingCode(false);
    }
  }

  // Handle individual digit input
  function handleDigitChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...codeDigits];
    if (value.length > 1) {
      // Handle paste
      const pasted = value.slice(0, 6 - index).split("");
      pasted.forEach((d, i) => { if (index + i < 6) newDigits[index + i] = d; });
      setCodeDigits(newDigits);
      const nextIdx = Math.min(index + pasted.length, 5);
      codeInputRefs.current[nextIdx]?.focus();
      return;
    }
    newDigits[index] = value;
    setCodeDigits(newDigits);
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") {
      handleVerifyCode();
    }
  }

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
      // Only send fields that the user can edit (not admin-prefilled)
      const payload: Record<string, unknown> = {
        invitationCode: invitationCode || "000000",
        dateOfBirth,
        isStayingInMotel: showMotelField ? isStayingInMotel : undefined,
        numDays: showPartialFields && numDays ? parseInt(numDays) : undefined,
      };
      if (!prefilled.attendance) payload.attendanceType = attendanceType || undefined;
      if (!prefilled.phone) payload.phone = phone || undefined;
      if (!prefilled.gender) payload.gender = gender || undefined;
      if (!prefilled.city) payload.city = city || undefined;
      if (!prefilled.church) {
        payload.churchId = churchId && churchId !== "other" ? churchId : undefined;
        payload.churchNameCustom = churchId === "other" ? churchCustom : undefined;
      }

      const res = await fetch("/api/registration/complete/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Fatal error (not found / expired) ──────────────────────
  if (error && !data && !requiresCode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="py-10 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
            <p className="font-medium">Registration not found or already completed</p>
            <p className="text-sm text-muted-foreground">This link may have already been used or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Invitation Code Prompt ─────────────────────────────────
  if (requiresCode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <div className="w-full max-w-md relative space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-violet-100 dark:bg-violet-900/30 mx-auto">
              <ShieldCheck className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold">Enter Invitation Code</h1>
            {codeMinimalInfo && (
              <p className="text-sm text-muted-foreground">
                Hi {codeMinimalInfo.first_name}, enter the 6-digit code from your invitation email to continue with your <strong>{codeMinimalInfo.event_name}</strong> registration.
              </p>
            )}
          </div>

          <Card className="shadow-brand-md">
            <CardContent className="py-8 px-6 space-y-6">
              <div className="flex justify-center gap-2">
                {codeDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { codeInputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    className="w-11 h-13 text-center text-xl font-bold border-2 rounded-lg bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 outline-none transition-all"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {codeError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center">
                  {codeError}
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleVerifyCode}
                disabled={verifyingCode || codeDigits.join("").length < 6}
              >
                {verifyingCode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & Continue
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Check your email for the invitation code. If you don&apos;t see it, check your spam folder.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Registration Form ──────────────────────────────────────
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
          <CardContent className="py-4 px-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Pre-filled by Admin
            </p>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{reg.first_name} {reg.last_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{reg.email}</span>
              </div>
              {prefilled.attendance && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attendance</span>
                  <span className="font-medium capitalize">{reg.attendance_type.replace("_", " ")}</span>
                </div>
              )}
              {prefilled.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{reg.phone}</span>
                </div>
              )}
              {prefilled.gender && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="font-medium capitalize">{reg.gender}</span>
                </div>
              )}
              {prefilled.city && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">City</span>
                  <span className="font-medium">{reg.city}</span>
                </div>
              )}
              {prefilled.church && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Church</span>
                  <span className="font-medium">
                    {reg.church_name_custom || churches.find(c => c.id === reg.church_id)?.name || "Selected"}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-violet-500 dark:text-violet-400">
              These details were set by the admin and cannot be changed. Contact the admin if corrections are needed.
            </p>
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
            {/* Age Range — always user-editable */}
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

            {/* Attendance Type — locked if admin set it */}
            {!prefilled.attendance && (
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
            )}

            {/* Partial: number of days — always user-editable */}
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

            {/* Motel — always user-editable */}
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

            {/* Personal details — only show fields not pre-filled by admin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!prefilled.phone && (
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
                </div>
              )}
              {!prefilled.gender && (
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
              )}
            </div>

            {!prefilled.city && (
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" />
              </div>
            )}

            {!prefilled.church && (
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
            )}

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
