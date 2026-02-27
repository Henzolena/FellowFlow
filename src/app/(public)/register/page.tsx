import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isPast } from "date-fns";
import { Calendar, MapPin, ArrowRight, Clock, Users } from "lucide-react";
import Link from "next/link";
import type { EventWithPricing, PricingConfig } from "@/types/database";
import { EventSearch } from "@/components/registration/event-search";

export default async function EventsListingPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*, pricing_config(*)")
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  const allEvents = (events || []) as EventWithPricing[];

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {/* Page header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Upcoming <span className="brand-gradient-text">Events</span>
          </h1>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Browse available conferences and register for the one that fits you best.
          </p>
          <div className="mt-4 mx-auto h-0.5 w-12 brand-gradient rounded-full" />
        </div>

        {/* Search + Filter (client component) */}
        <EventSearch events={allEvents} />
      </div>
    </div>
  );
}
