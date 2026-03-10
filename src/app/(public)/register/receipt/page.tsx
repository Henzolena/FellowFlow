"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, FileText } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/context";

export default function ReceiptLookupPage() {
  const { dict } = useTranslation();
  const router = useRouter();
  const [confirmationId, setConfirmationId] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmationId.trim() || !lastName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationId: confirmationId.trim(),
          lastName: lastName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Verification failed.");
        setLoading(false);
        return;
      }

      // Verified — redirect to receipt page with auto-verify
      router.push(
        `/register/receipt/${encodeURIComponent(confirmationId.trim())}?ln=${encodeURIComponent(lastName.trim())}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="w-full max-w-sm relative">
        <Card className="shadow-brand-md">
          <CardHeader className="text-center space-y-2">
            <FileText className="mx-auto h-10 w-10 text-brand-cyan" />
            <CardTitle className="text-xl">{dict.receipt.findYourReceipt}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {dict.receipt.findReceiptDesc}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirmationId">{dict.receipt.confirmationIdLabel}</Label>
                <Input
                  id="confirmationId"
                  placeholder="e.g. MW26-HR-10927"
                  value={confirmationId}
                  onChange={(e) => setConfirmationId(e.target.value)}
                  className="font-mono text-xs"
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {dict.receipt.confirmationIdHint}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{dict.receipt.lastNameLabel}</Label>
                <Input
                  id="lastName"
                  placeholder={dict.receipt.lastNamePlaceholder}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !confirmationId.trim() || !lastName.trim()}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                {dict.receipt.findReceipt}
              </Button>
              <Link href="/">
                <Button variant="ghost" className="w-full" type="button">
                  {dict.common.backToHome}
                </Button>
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
