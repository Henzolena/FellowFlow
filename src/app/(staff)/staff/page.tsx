"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PinGate } from "@/components/staff/pin-gate";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/types/database";

export default function StaffEntryPage() {
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    const storedRole = sessionStorage.getItem("staff_role");
    if (storedRole) {
      router.replace(`/staff/${storedRole}`);
      return;
    }

    // Fetch the active event ID
    async function fetchEvent() {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (data) setEventId(data.id);
      setLoading(false);
    }
    fetchEvent();
  }, [router]);

  function handleAuthenticated(role: StaffRole) {
    router.replace(`/staff/${role}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted-foreground">No active event found.</p>
      </div>
    );
  }

  return <PinGate eventId={eventId} onAuthenticated={handleAuthenticated} />;
}
