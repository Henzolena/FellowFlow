"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const registrationId = searchParams.get("registration_id");
  const isFree = searchParams.get("free") === "true";

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="w-full max-w-md"
      >
        <Card className="text-center">
          <CardHeader>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
            >
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            </motion.div>
            <CardTitle className="text-2xl mt-4">Registration Confirmed!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {isFree
                ? "Your free registration has been confirmed. No payment is required."
                : "Your payment was successful and your registration is confirmed."}
            </p>
            <p className="text-sm text-muted-foreground">
              A confirmation email will be sent to your registered email address.
            </p>

            <div className="flex flex-col gap-3 pt-4">
              {registrationId && (
                <Link href={`/register/receipt/${registrationId}`}>
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
