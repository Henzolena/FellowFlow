"use client";

import { Suspense, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

export default function ResetPasswordClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const { dict } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Ensure the recovery session is loaded from the URL hash
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSessionReady(true);
      }
    });
    // Also check if user already has a session (came via callback route)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setSessionReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(dict.login.passwordMinLength);
      return;
    }
    if (password !== confirmPassword) {
      setError(dict.login.passwordsDoNotMatch);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Sign out so user logs in fresh with new password
    await supabase.auth.signOut();
    setSuccess(true);
    setLoading(false);
  }

  if (!sessionReady && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <Card className="w-full max-w-md shadow-brand-lg relative">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground mt-3">
              Verifying recovery session...
            </p>
          </CardContent>
        </Card>
      </div>
    );
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
          {success ? (
            <CardDescription className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <span className="font-semibold text-foreground text-base">
                {dict.login.passwordUpdated}
              </span>
            </CardDescription>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground text-base">
                  {dict.login.resetTitle}
                </p>
              </div>
              <CardDescription>{dict.login.resetDesc}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4">
                <p className="text-sm text-green-700 dark:text-green-400">
                  {dict.login.passwordUpdatedDesc}
                </p>
              </div>
              <Link href="/auth/login">
                <Button className="w-full shadow-brand-sm mt-2">
                  {dict.login.signIn}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">{dict.login.newPassword}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={8}
                  placeholder="••••••••"
                />
                <p className="text-[11px] text-muted-foreground">
                  {dict.login.passwordMinLength}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {dict.login.confirmPassword}
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                className="w-full shadow-brand-sm"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dict.login.updatePassword}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
