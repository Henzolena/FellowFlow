import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RegistrationWizard } from "@/components/registration/wizard";
import type { EventWithImages, Church } from "@/types/database";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";

const BASE_URL = "https://fellowflow.org";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("name, description, start_date, end_date, event_images(url, alt_text, image_type)")
    .eq("id", eventId)
    .eq("is_active", true)
    .single();

  if (!event) return { title: "Event Not Found" };

  const cover = (event.event_images as Array<{ url: string; alt_text: string | null; image_type: string }>)?.find(
    (img) => img.image_type === "cover"
  );
  const pageUrl = `${BASE_URL}/register/${eventId}`;
  const title = `Register — ${event.name}`;
  const description = event.description || `Register for ${event.name} with FellowFlow.`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: event.name,
      description,
      url: pageUrl,
      type: "website",
      ...(cover && { images: [{ url: cover.url, alt: cover.alt_text || event.name, width: 1200, height: 630 }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: event.name,
      description,
      ...(cover && { images: [cover.url] }),
    },
  };
}

export default async function RegisterForEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const dict = await getServerDictionary();
  const supabase = await createClient();

  // Parallel fetches: event + churches + meals
  const [eventResult, churchesResult, mealsResult] = await Promise.all([
    supabase
      .from("events")
      .select("*, pricing_config(*), event_images(*)")
      .eq("id", eventId)
      .eq("is_active", true)
      .single<EventWithImages>(),
    supabase
      .from("churches")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<Church[]>(),
    supabase
      .from("service_catalog")
      .select("id, service_name, service_code, service_category, meal_type, service_date, start_time, end_time, display_order")
      .eq("event_id", eventId)
      .eq("service_category", "meal")
      .eq("is_active", true)
      .order("service_date", { ascending: true, nullsFirst: false })
      .order("display_order", { ascending: true }),
  ]);

  const event = eventResult.data;
  if (eventResult.error || !event) {
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
  const churches = churchesResult.data ?? [];
  const meals = (mealsResult.data ?? []) as Array<{
    id: string; service_name: string; service_code: string;
    meal_type: string | null; service_date: string | null;
    start_time: string | null; display_order: number;
  }>;

  // JSON-LD for this specific event registration page
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: event.description,
    startDate: event.start_date,
    endDate: event.end_date,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(coverImage && { image: coverImage.url }),
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}/register/${eventId}`,
      availability: "https://schema.org/InStock",
      priceCurrency: "USD",
    },
    organizer: {
      "@type": "Organization",
      name: "FellowFlow",
      url: BASE_URL,
    },
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Cover photo banner */}
      {coverImage && (
        <div className="relative h-48 sm:h-64 md:h-72 w-full overflow-hidden">
          <Image
            src={coverImage.url}
            alt={coverImage.alt_text || event.name}
            fill
            sizes="100vw"
            className="object-cover"
            priority
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
        <RegistrationWizard
          event={event}
          pricing={pricingConfig}
          churches={churches}
          availableMeals={meals}
        />
      </div>
    </div>
  );
}
