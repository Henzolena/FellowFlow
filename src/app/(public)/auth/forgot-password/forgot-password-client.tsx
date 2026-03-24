"use client";

import { Suspense, useState } from "react";
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
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

export default function ForgotPasswordClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}

function ForgotPasswordContent() {
  const { dict } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
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
          {sent ? (
            <CardDescription className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <span className="font-semibold text-foreground text-base">
                {dict.login.resetEmailSent}
              </span>
            </CardDescription>
          ) : (
            <>
              <p className="font-semibold text-foreground text-base">
                {dict.login.forgotTitle}
              </p>
              <CardDescription>{dict.login.forgotDesc}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4">
                <div className="flex items-center gap-2 justify-center mb-2">
                  <Mail className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    {dict.login.resetEmailSentDesc}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dict.login.checkInbox}
                </p>
              </div>
              <Link href="/auth/login">
                <Button variant="outline" className="w-full mt-2">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {dict.login.backToLogin}
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
                <Label htmlFor="email">{dict.login.emailLabel}</Label>
                <Input
                  id="email"
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
                {dict.login.sendResetLink}
              </Button>
              <div className="text-center">
                <Link
                  href="/auth/login"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {dict.login.backToLogin}
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
