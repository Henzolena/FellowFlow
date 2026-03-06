"use client";

import { useState } from "react";
import type { ExistingRegistration } from "../duplicate-dialog";

export function useDuplicateCheck(eventId: string) {
  const [dupChecking, setDupChecking] = useState(false);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupRegistrations, setDupRegistrations] = useState<ExistingRegistration[]>([]);
  const [dupBypassed, setDupBypassed] = useState(false);

  async function checkDuplicate(email: string): Promise<boolean> {
    if (dupBypassed) return true; // already bypassed

    setDupChecking(true);
    try {
      const res = await fetch("/api/registration/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), eventId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hasDuplicates) {
          setDupRegistrations(data.registrations);
          setDupDialogOpen(true);
          return false; // blocked
        }
      }
      return true; // no duplicates or check failed → proceed
    } catch {
      return true; // allow proceeding if check fails
    } finally {
      setDupChecking(false);
    }
  }

  function bypassDuplicate() {
    setDupBypassed(true);
  }

  function resetBypass() {
    setDupBypassed(false);
  }

  return {
    dupChecking,
    dupDialogOpen,
    setDupDialogOpen,
    dupRegistrations,
    dupBypassed,
    checkDuplicate,
    bypassDuplicate,
    resetBypass,
  };
}
