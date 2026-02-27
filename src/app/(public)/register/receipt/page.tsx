"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, FileText } from "lucide-react";
import Link from "next/link";

export default function ReceiptLookupPage() {
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
            <CardTitle className="text-xl">Find Your Receipt</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter your Confirmation ID and last name to access your registration receipt.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirmationId">Confirmation ID</Label>
                <Input
                  id="confirmationId"
                  placeholder="e.g. e02a0681-5cc8-4e65-..."
                  value={confirmationId}
                  onChange={(e) => setConfirmationId(e.target.value)}
                  className="font-mono text-xs"
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Found in your confirmation email or on the success page.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Enter your last name"
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
                Find Receipt
              </Button>
              <Link href="/">
                <Button variant="ghost" className="w-full" type="button">
                  Back to Home
                </Button>
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
