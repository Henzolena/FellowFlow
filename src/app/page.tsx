import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
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
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:py-32">
          <div className="mx-auto max-w-2xl text-center space-y-6">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Conference Registration{" "}
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="text-lg leading-8 text-muted-foreground">
              Register for upcoming conferences with our streamlined process.
              Answer a few questions, see your pricing instantly, and pay
              securely online.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="text-base px-8">
                  Register Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Active Event */}
      {event && (
        <section className="py-16 bg-muted/30">
          <div className="mx-auto max-w-7xl px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold">Upcoming Event</h2>
            </div>
            <Card className="mx-auto max-w-xl">
              <CardContent className="p-6 text-center space-y-4">
                <h3 className="text-xl font-bold">{event.name}</h3>
                {event.description && (
                  <p className="text-muted-foreground">{event.description}</p>
                )}
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {format(parseISO(event.start_date), "MMM d")} —{" "}
                    {format(parseISO(event.end_date), "MMM d, yyyy")}
                  </span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>{event.duration_days} days</span>
                </div>
                <Link href="/register">
                  <Button className="mt-2">
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
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold">How It Works</h2>
            <p className="mt-2 text-muted-foreground">
              Three simple steps to register
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: "1. Tell Us About You",
                description:
                  "Answer a few quick questions about your attendance plans and provide your contact information.",
              },
              {
                icon: CreditCard,
                title: "2. See Your Price",
                description:
                  "Pricing is calculated automatically based on your age, attendance type, and accommodation.",
              },
              {
                icon: CheckCircle2,
                title: "3. Pay & Confirm",
                description:
                  "Complete your registration with secure online payment and receive instant confirmation.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="text-center">
                <CardContent className="p-6 space-y-3">
                  <feature.icon className="mx-auto h-10 w-10 text-primary" />
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
      <section className="py-12 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Secure Payments via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Instant Confirmation</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span>All Major Cards Accepted</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1" />
      <Footer />
    </div>
  );
}
