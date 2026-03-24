"use client";

import { Suspense, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Loader2, KeyRound, Mail } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

type LoginMode = "password" | "otp-request" | "otp-verify";

export default function LoginClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { dict } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [mode, setMode] = useState<LoginMode>("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/admin";

  const switchMode = useCallback(
    (newMode: LoginMode) => {
      setError(null);
      setOtpCode("");
      setPassword("");
      setMode(newMode);
    },
    []
  );

  // ── Password login ────────────────────────────────────────────────
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = redirect;
  }

  // ── OTP request ───────────────────────────────────────────────────
  async function handleOtpRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMode("otp-verify");
    setLoading(false);
  }

  // ── OTP verify ────────────────────────────────────────────────────
  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: "email",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = redirect;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <Card className="w-full max-w-md shadow-brand-lg relative">
        <CardHeader className="text-center space-y-3">
          <Image
            src="/FellowFlow-logo.png"
            alt="FellowFlow"
            width={315}
            height={100}
            className="mx-auto h-10 w-auto"
          />
          <CardDescription>
            {mode === "password" && dict.login.signInDesc}
            {mode === "otp-request" && dict.login.otpDesc}
            {mode === "otp-verify" && dict.login.otpSentDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ── Password mode ──────────────────────────────────── */}
          {mode === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{dict.login.emailLabel}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{dict.login.passwordLabel}</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    {dict.login.forgotPassword}
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full shadow-brand-sm"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <KeyRound className="mr-2 h-4 w-4" />
                {dict.login.signIn}
              </Button>
            </form>
          )}

          {/* ── OTP request mode ───────────────────────────────── */}
          {mode === "otp-request" && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-email">{dict.login.emailLabel}</Label>
                <Input
                  id="otp-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full shadow-brand-sm"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" />
                {dict.login.sendCode}
              </Button>
            </form>
          )}

          {/* ── OTP verify mode ────────────────────────────────── */}
          {mode === "otp-verify" && (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      {dict.login.otpSent}
                    </p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="otp-code">{dict.login.enterCode}</Label>
                <Input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  placeholder="00000000"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  required
                  autoFocus
                  className="text-center text-2xl tracking-[0.35em] font-mono"
                />
              </div>
              <Button
                type="submit"
                className="w-full shadow-brand-sm"
                disabled={loading || otpCode.length < 6}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dict.login.verifyCode}
              </Button>
              <button
                type="button"
                onClick={() => switchMode("otp-request")}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {dict.login.resendCode}
              </button>
            </form>
          )}

          {/* ── Mode toggle ────────────────────────────────────── */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">
                {dict.login.or}
              </span>
            </div>
          </div>

          {mode === "password" ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode("otp-request")}
            >
              <Mail className="mr-2 h-4 w-4" />
              {dict.login.useOtp}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode("password")}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {dict.login.usePassword}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
