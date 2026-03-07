import { createClient } from "@/lib/supabase/server";
import { RegistrationWizard } from "@/components/registration/wizard";
import type { EventWithImages } from "@/types/database";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function RegisterForEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const dict = await getServerDictionary();
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("*, pricing_config(*), event_images(*)")
    .eq("id", eventId)
    .eq("is_active", true)
    .single<EventWithImages>();

  if (error || !event) {
    notFound();
  }

  const pricingConfig = event.pricing_config
    ? Array.isArray(event.pricing_config)
      ? event.pricing_config[0]
      : event.pricing_config
    : undefined;

  if (!pricingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">{dict.notConfigured.title}</h1>
          <p className="text-muted-foreground">
            {dict.notConfigured.description}
          </p>
          <Link href="/register" className="text-sm text-primary hover:underline">
            &larr; {dict.notConfigured.backToEvents}
          </Link>
        </div>
      </div>
    );
  }

  const coverImage = event.event_images?.find((img) => img.image_type === "cover");

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Cover photo banner */}
      {coverImage && (
        <div className="relative h-48 sm:h-64 md:h-72 w-full overflow-hidden">
          <img
            src={coverImage.url}
            alt={coverImage.alt_text || event.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      )}
      <div className={`mx-auto max-w-5xl px-4 pb-32 lg:pb-8 ${coverImage ? "-mt-16 relative z-10 pt-0" : "py-8"}`}>
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {dict.eventPage.allEvents}
        </Link>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
          {event.description && (
            <p className="mt-2 text-muted-foreground">{event.description}</p>
          )}
        </div>
        <RegistrationWizard event={event} pricing={pricingConfig} />
      </div>
    </div>
  );
}
