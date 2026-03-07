import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { format, parseISO } from "date-fns";
import {
  Users,
  Calendar,
  Clock,
  CreditCard,
  Shield,
  ArrowRight,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import type { EventWithImages } from "@/types/database";
import { HeroSection } from "@/components/landing/hero-section";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function Home() {
  const dict = await getServerDictionary();
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*, pricing_config(*), event_images(*)")
    .eq("is_active", true)
    .order("start_date", { ascending: true })
    .limit(1);

  const event = events?.[0] as EventWithImages | undefined;
  const coverImage = event?.event_images?.find((img) => img.image_type === "cover");

  return (
    <div className="min-h-screen flex flex-col">

      {/* Hero */}
      <HeroSection />

      {/* Active Event */}
      {event && (
        <section className="py-16 sm:py-20 bg-muted/40">
          <div className="mx-auto max-w-7xl px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{dict.home.upcomingEvent}</h2>
              <div className="mt-3 mx-auto h-0.5 w-12 brand-gradient rounded-full" />
            </div>

            <article className="group relative mx-auto max-w-2xl rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-brand-lg hover:-translate-y-0.5">
              {/* Background image / fallback */}
              <div className="absolute inset-0">
                {coverImage ? (
                  <img
                    src={coverImage.url}
                    alt={coverImage.alt_text || event.name}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-primary via-primary/90 to-brand-teal/70">
                    <div className="absolute inset-0 hero-dot-grid opacity-[0.06]" />
                  </div>
                )}
              </div>

              {/* Multi-layer overlay for readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/15" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />

              {/* Content on top */}
              <div className="relative z-10 flex flex-col min-h-[400px] sm:min-h-[460px]">
                {/* Status badge */}
                <div className="p-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-teal opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-teal" />
                    </span>
                    {dict.events.upcoming}
                  </span>
                </div>

                {/* Push content to bottom */}
                <div className="mt-auto" />

                {/* Text content */}
                <div className="p-6 sm:p-8 pt-0">
                  <div className="space-y-2.5 mb-5">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight text-white drop-shadow-sm">
                      {event.name}
                    </h3>
                    {event.description && (
                      <p className="text-sm leading-relaxed text-white/70 line-clamp-2 max-w-lg">
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Metadata chips */}
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                      <Calendar className="h-3 w-3 text-brand-teal shrink-0" />
                      {format(parseISO(event.start_date), "MMM d")} –{" "}
                      {format(parseISO(event.end_date), "MMM d, yyyy")}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                      <Clock className="h-3 w-3 text-brand-cyan shrink-0" />
                      {event.duration_days} {dict.common.days}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/15 mb-5" />

                  {/* CTA */}
                  <div className="flex items-center justify-center">
                    <Link href={`/register/${event.id}`}>
                      <Button
                        size="lg"
                        className="rounded-full px-8 text-sm font-semibold bg-white text-primary hover:bg-white/90 shadow-lg hover:shadow-xl transition-all duration-300"
                      >
                        {dict.home.registerForEvent}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* Features */}
      <section id="how-it-works" className="py-16 scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold">{dict.home.howItWorks}</h2>
            <p className="mt-2 text-muted-foreground">
              {dict.home.threeSteps}
            </p>
            <div className="mt-4 mx-auto h-0.5 w-12 brand-gradient rounded-full" />
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: dict.home.step1Title,
                description: dict.home.step1Desc,
                color: "text-brand-cyan",
              },
              {
                icon: CreditCard,
                title: dict.home.step2Title,
                description: dict.home.step2Desc,
                color: "text-brand-teal",
              },
              {
                icon: CheckCircle2,
                title: dict.home.step3Title,
                description: dict.home.step3Desc,
                color: "text-brand-green",
              },
            ].map((feature) => (
              <Card key={feature.title} className="text-center shadow-brand-sm hover:shadow-brand-md transition-shadow">
                <CardContent className="p-6 space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="py-12 bg-muted/40">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-teal" />
              <span>{dict.home.securePayments}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              <span>{dict.home.instantConfirmation}</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-brand-cyan" />
              <span>{dict.home.allCardsAccepted}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1" />
    </div>
  );
}
