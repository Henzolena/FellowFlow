"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}

type RegStatus = "pending" | "confirmed" | "cancelled" | "refunded";

function SuccessContent() {
  const searchParams = useSearchParams();
  const registrationId = searchParams.get("registration_id");
  const groupId = searchParams.get("group_id");
  const isFree = searchParams.get("free") === "true";
  const lastName = searchParams.get("ln") || "";

  const [status, setStatus] = useState<RegStatus>(isFree ? "confirmed" : "pending");
  const [polling, setPolling] = useState(!isFree);
  const [groupCount, setGroupCount] = useState<number | null>(null);

  const checkStatus = useCallback(async () => {
    if (!registrationId) return;
    try {
      // For groups, check the primary registration status (all get confirmed together)
      const res = await fetch(`/api/registration/${registrationId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status as RegStatus);
      if (data.status === "confirmed") {
        setPolling(false);
      }
    } catch {
      // Network error — keep polling
    }
  }, [registrationId]);

  // Fetch group count if group registration
  useEffect(() => {
    if (!groupId) return;
    fetch(`/api/registration/group/${groupId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.registrations) setGroupCount(data.registrations.length);
      })
      .catch(() => {});
  }, [groupId]);

  useEffect(() => {
    if (!polling || !registrationId) return;

    // Check immediately
    checkStatus();

    // Poll every 2 seconds for up to 30 seconds
    const interval = setInterval(checkStatus, 2000);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPolling(false);
    }, 30_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [polling, registrationId, checkStatus]);

  const isConfirmed = status === "confirmed";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="w-full max-w-md relative"
      >
        <Card className="text-center shadow-brand-lg">
          <CardHeader>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
            >
              {isConfirmed ? (
                <CheckCircle2 className="mx-auto h-16 w-16 text-brand-green" />
              ) : (
                <Loader2 className="mx-auto h-16 w-16 text-brand-cyan animate-spin" />
              )}
            </motion.div>
            <CardTitle className="text-2xl mt-4">
              {isConfirmed ? "Registration Confirmed!" : "Processing Payment..."}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConfirmed ? (
              <>
                <p className="text-muted-foreground">
                  {isFree
                    ? groupCount && groupCount > 1
                      ? `All ${groupCount} free registrations have been confirmed. No payment is required.`
                      : "Your free registration has been confirmed. No payment is required."
                    : groupCount && groupCount > 1
                    ? `Your payment was successful and all ${groupCount} registrations are confirmed.`
                    : "Your payment was successful and your registration is confirmed."}
                </p>
                <p className="text-sm text-muted-foreground">
                  A confirmation email will be sent to your registered email address.
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Your payment is being verified. This usually takes a few seconds.
                </p>
                {!polling && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Verification is taking longer than expected. You can check again or view your receipt — your registration will be confirmed shortly.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPolling(true);
                        checkStatus();
                      }}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check Again
                    </Button>
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col gap-3 pt-4">
              {registrationId && (
                <Link href={`/register/receipt/${registrationId}${lastName ? `?ln=${encodeURIComponent(lastName)}` : ""}`}>
                  <Button className="w-full" variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    View Receipt
                  </Button>
                </Link>
              )}
              <Link href="/">
                <Button className="w-full">Back to Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
