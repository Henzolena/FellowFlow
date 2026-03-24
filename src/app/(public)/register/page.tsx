import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { EventWithImages } from "@/types/database";
import { EventSearch } from "@/components/registration/event-search";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Register for Events",
  description:
    "Browse upcoming conferences and register your group. Secure payment, instant confirmation.",
  alternates: { canonical: "https://fellowflow.org/register" },
  openGraph: {
    title: "Register for Events — FellowFlow",
    description: "Browse upcoming conferences and register your group. Secure payment, instant confirmation.",
    url: "https://fellowflow.org/register",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Register for Events — FellowFlow",
    description: "Browse upcoming conferences and register your group.",
  },
};

export default async function EventsListingPage() {
  const dict = await getServerDictionary();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*, pricing_config(*), event_images(*)")
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  const allEvents = (events || []) as EventWithImages[];

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {/* Page header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {dict.events.title} <span className="brand-gradient-text">{dict.events.titleHighlight}</span>
          </h1>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            {dict.events.description}
          </p>
          <div className="mt-4 mx-auto h-0.5 w-12 brand-gradient rounded-full" />
        </div>

        {/* Search + Filter (client component) */}
        <EventSearch events={allEvents} />
      </div>
    </div>
  );
}
