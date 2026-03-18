"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffLookup } from "@/components/staff/staff-lookup";
import { PinGate } from "@/components/staff/pin-gate";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/types/database";

export default function StaffMotelPage() {
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [stationLabel, setStationLabel] = useState("Motel Check-In");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedRole = sessionStorage.getItem("staff_role");
    const storedEvent = sessionStorage.getItem("staff_event_id");
    const storedLabel = sessionStorage.getItem("staff_label");

    if (storedRole === "motel" && storedEvent) {
      setEventId(storedEvent);
      setStationLabel(storedLabel || "Motel Check-In");
      setAuthenticated(true);
      setLoading(false);
      return;
    }

    if (storedRole && storedRole !== "motel") {
      router.replace("/staff/" + storedRole);
      return;
    }

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

  function handleAuthenticated(role: StaffRole, label: string | null) {
    if (role !== "motel") {
      router.replace("/staff/" + role);
      return;
    }
    setStationLabel(label || "Motel Check-In");
    setAuthenticated(true);
  }

  function handleLogout() {
    sessionStorage.removeItem("staff_role");
    sessionStorage.removeItem("staff_label");
    sessionStorage.removeItem("staff_event_id");
    sessionStorage.removeItem("staff_pin");
    router.replace("/staff");
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

  if (!authenticated) {
    return <PinGate eventId={eventId} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <StaffLookup
      eventId={eventId}
      role="motel"
      stationLabel={stationLabel}
      onLogout={handleLogout}
    />
  );
}
