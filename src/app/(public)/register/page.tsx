import { createClient } from "@/lib/supabase/server";
import { RegistrationWizard } from "@/components/registration/wizard";
import type { EventWithPricing } from "@/types/database";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*, pricing_config(*)")
    .eq("is_active", true)
    .order("start_date", { ascending: true })
    .limit(1);

  const event = events?.[0] as EventWithPricing | undefined;

  // Supabase may return pricing_config as object (1-to-1) or array (1-to-many)
  const pricingConfig = event?.pricing_config
    ? Array.isArray(event.pricing_config)
      ? event.pricing_config[0]
      : event.pricing_config
    : undefined;

  if (!event || !pricingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">No Active Events</h1>
          <p className="text-muted-foreground">
            There are currently no events open for registration. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 pb-32 lg:pb-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Register for the conference below
          </p>
        </div>
        <RegistrationWizard event={event} pricing={pricingConfig} />
      </div>
    </div>
  );
}
