"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Receipt,
  XCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { getExplanationLabel } from "@/lib/pricing/engine";
import type { ExplanationCode } from "@/types/database";
import Link from "next/link";

export type ExistingRegistration = {
  id: string;
  status: string;
  category: string;
  isFullDuration: boolean;
  numDays: number | null;
  amount: number;
  explanationCode: string;
  registeredAt: string;
  confirmedAt: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrations: ExistingRegistration[];
  email: string;
  onProceedAnyway: () => void;
};

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  confirmed: {
    label: "Confirmed",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pending Payment",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
};

export function DuplicateRegistrationDialog({
  open,
  onOpenChange,
  registrations,
  email,
  onProceedAnyway,
}: Props) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleResendEmail(regId: string) {
    setSendingId(regId);
    setSendError(null);
    try {
      const res = await fetch("/api/registration/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId, email }),
      });
      if (res.ok) {
        setSentIds((prev) => new Set(prev).add(regId));
      } else {
        const data = await res.json();
        setSendError(data.error || "Failed to send email");
      }
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setSendingId(null);
    }
  }

  const confirmed = registrations.filter((r) => r.status === "confirmed");
  const pending = registrations.filter((r) => r.status === "pending");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <DialogTitle className="text-center">
            Existing Registration Found
          </DialogTitle>
          <DialogDescription className="text-center">
            We found {registrations.length} existing registration
            {registrations.length > 1 ? "s" : ""} for{" "}
            <span className="font-medium text-foreground">{email}</span> at this
            event.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2">
          {registrations.map((reg, idx) => {
            const config = statusConfig[reg.status] ?? statusConfig.pending;
            const StatusIcon = config.icon;
            const isSent = sentIds.has(reg.id);
            const isSending = sendingId === reg.id;

            return (
              <div
                key={reg.id}
                className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-muted-foreground">
                      #{registrations.length - idx}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${config.className}`}
                    >
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>
                  <span className="text-sm font-semibold">
                    {reg.amount === 0 ? (
                      <span className="text-brand-green">FREE</span>
                    ) : (
                      <span className="text-brand-amber-foreground">
                        ${reg.amount.toFixed(2)}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Registered{" "}
                    {format(parseISO(reg.registeredAt), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                  <div className="flex items-center gap-1">
                    <Receipt className="h-3 w-3" />
                    {getExplanationLabel(reg.explanationCode as ExplanationCode)}
                  </div>
                </div>

                {reg.status === "confirmed" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Link href={`/register/receipt`} onClick={() => onOpenChange(false)}>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Receipt className="h-3 w-3" />
                        View Receipt
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      disabled={isSending || isSent}
                      onClick={() => handleResendEmail(reg.id)}
                    >
                      {isSending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isSent ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {isSent ? "Sent!" : "Resend Confirmation"}
                    </Button>
                  </div>
                )}

                {reg.status === "pending" && (
                  <p className="text-xs text-amber-600">
                    This registration is pending payment. You can complete payment or register again.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {sendError && (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            {sendError}
          </div>
        )}

        <Separator />

        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Want to register again anyway?</p>
          <p className="text-xs text-muted-foreground">
            {confirmed.length > 0
              ? "You already have a confirmed registration. A new one will create an additional entry."
              : pending.length > 0
              ? "You have a pending registration. Consider completing that payment instead."
              : "You can proceed with a new registration if needed."}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => {
              onProceedAnyway();
              onOpenChange(false);
            }}
            variant={confirmed.length > 0 ? "outline" : "default"}
            className="w-full gap-1.5"
          >
            Proceed with New Registration
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
