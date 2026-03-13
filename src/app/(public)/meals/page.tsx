"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UtensilsCrossed, ArrowRight, Loader2 } from "lucide-react";

export default function MealsLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/meals/available?code=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Registration not found");
        setLoading(false);
        return;
      }
      router.push(`/meals/${encodeURIComponent(trimmed)}`);
    } catch {
      setError("Failed to connect. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="w-full max-w-md relative space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
            <UtensilsCrossed className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Meals</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Enter your confirmation code to browse and purchase individual meal tickets
          </p>
        </div>

        {/* Lookup Form */}
        <Card className="shadow-brand-md">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium">
                  Confirmation Code
                </Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(""); }}
                  placeholder="MW26-HR-10927"
                  className="text-center font-mono text-lg tracking-wider h-12"
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Find this on your registration receipt or confirmation email
                </p>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                size="lg"
                disabled={!code.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                View Available Meals
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            Adults: $12/meal · Children: $8/meal
          </p>
          <p className="text-xs text-muted-foreground">
            Pay securely with card via Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
