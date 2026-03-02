import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { format, parseISO } from "date-fns";
import {
  Users,
  Calendar,
  CreditCard,
  Shield,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import type { EventWithPricing } from "@/types/database";
import { HeroSection } from "@/components/landing/hero-section";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function Home() {
  const dict = await getServerDictionary();
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*, pricing_config(*)")
    .eq("is_active", true)
    .order("start_date", { ascending: true })
    .limit(1);

  const event = events?.[0] as EventWithPricing | undefined;

  return (
    <div className="min-h-screen flex flex-col">

      {/* Hero */}
      <HeroSection />

      {/* Active Event */}
      {event && (
        <section className="py-16 bg-muted/40">
          <div className="mx-auto max-w-7xl px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold">{dict.home.upcomingEvent}</h2>
            </div>
            <Card className="mx-auto max-w-xl shadow-brand-md brand-gradient-border overflow-hidden">
              <CardContent className="p-6 text-center space-y-4">
                <h3 className="text-xl font-bold">{event.name}</h3>
                {event.description && (
                  <p className="text-muted-foreground">{event.description}</p>
                )}
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 text-brand-teal" />
                  <span>
                    {format(parseISO(event.start_date), "MMM d")} —{" "}
                    {format(parseISO(event.end_date), "MMM d, yyyy")}
                  </span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>{event.duration_days} {dict.common.days}</span>
                </div>
                <Link href={`/register/${event.id}`}>
                  <Button className="mt-2 shadow-brand-sm hover:shadow-brand-md transition-shadow">
                    {dict.home.registerForEvent}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
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
