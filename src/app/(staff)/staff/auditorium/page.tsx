"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffScanner } from "@/components/staff/staff-scanner";
import { PinGate } from "@/components/staff/pin-gate";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/types/database";

export default function StaffAuditoriumPage() {
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [stationLabel, setStationLabel] = useState("Auditorium");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedRole = sessionStorage.getItem("staff_role");
    const storedEvent = sessionStorage.getItem("staff_event_id");
    const storedLabel = sessionStorage.getItem("staff_label");

    if (storedRole === "auditorium" && storedEvent) {
      setEventId(storedEvent);
      setStationLabel(storedLabel || "Auditorium");
      setAuthenticated(true);
      setLoading(false);
      return;
    }

    if (storedRole && storedRole !== "auditorium") {
      router.replace(`/staff/${storedRole}`);
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
    if (role !== "auditorium") {
      router.replace(`/staff/${role}`);
      return;
    }
    setStationLabel(label || "Auditorium");
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
    <StaffScanner
      eventId={eventId}
      role="auditorium"
      stationLabel={stationLabel}
      onLogout={handleLogout}
    />
  );
}
