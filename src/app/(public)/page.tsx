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

export default async function Home() {
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
              <h2 className="text-2xl font-bold">Upcoming Event</h2>
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
                  <span>{event.duration_days} days</span>
                </div>
                <Link href={`/register/${event.id}`}>
                  <Button className="mt-2 shadow-brand-sm hover:shadow-brand-md transition-shadow">
                    Register for this Event
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
            <h2 className="text-2xl font-bold">How It Works</h2>
            <p className="mt-2 text-muted-foreground">
              Three simple steps to register
            </p>
            <div className="mt-4 mx-auto h-0.5 w-12 brand-gradient rounded-full" />
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: "1. Tell Us About You",
                description:
                  "Answer a few quick questions about your attendance plans and provide your contact information.",
                color: "text-brand-cyan",
              },
              {
                icon: CreditCard,
                title: "2. See Your Price",
                description:
                  "Pricing is calculated automatically based on your age, attendance type, and accommodation.",
                color: "text-brand-teal",
              },
              {
                icon: CheckCircle2,
                title: "3. Pay & Confirm",
                description:
                  "Complete your registration with secure online payment and receive instant confirmation.",
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
              <span>Secure Payments via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              <span>Instant Confirmation</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-brand-cyan" />
              <span>All Major Cards Accepted</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1" />
    </div>
  );
}
