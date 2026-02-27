import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getExplanationLabel } from "@/lib/pricing/engine";
import { format, parseISO } from "date-fns";
import type { ExplanationCode, Registration, Payment, Event } from "@/types/database";
import { notFound } from "next/navigation";

type RegistrationDetail = Registration & {
  events: Pick<Event, "name" | "start_date" | "end_date" | "duration_days"> | null;
  payments: Payment[] | Payment | null;
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days), payments(*)")
    .eq("id", id)
    .single<RegistrationDetail>();

  if (error || !data) {
    notFound();
  }

  const payment = Array.isArray(data.payments)
    ? data.payments[0]
    : data.payments;
  const eventData = data.events;

  if (!eventData) {
    notFound();
  }

  return (
    <div className="min-h-screen py-12 px-4 relative">
      <div className="hero-glow absolute inset-0" aria-hidden="true" />
      <div className="mx-auto max-w-lg relative">
        <Card className="shadow-brand-md print:shadow-none">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl">Registration Receipt</CardTitle>
            <p className="text-sm text-muted-foreground">
              {eventData.name}
            </p>
            <Badge
              variant={data.status === "confirmed" ? "default" : "secondary"}
              className="mx-auto"
            >
              {data.status.toUpperCase()}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Confirmation ID
              </h3>
              <p className="font-mono text-sm break-all">{data.id}</p>
            </div>

            <Separator />

            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Attendee
              </h3>
              <p className="font-medium">
                {data.first_name} {data.last_name}
              </p>
              <p className="text-sm text-muted-foreground">{data.email}</p>
              {data.phone && (
                <p className="text-sm text-muted-foreground">{data.phone}</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Event Details
              </h3>
              <p className="text-sm">
                {format(parseISO(eventData.start_date), "MMM d, yyyy")} —{" "}
                {format(parseISO(eventData.end_date), "MMM d, yyyy")}
              </p>
              <p className="text-sm">
                {data.is_full_duration
                  ? `Full Conference (${eventData.duration_days} days)`
                  : `${data.num_days} Day(s)`}
              </p>
              <p className="text-sm capitalize">Category: {data.category}</p>
            </div>

            <Separator />

            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pricing
              </h3>
              <p className="text-sm">
                {getExplanationLabel(data.explanation_code as ExplanationCode)}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.explanation_detail}
              </p>
            </div>

            <div className="rounded-xl bg-muted/60 p-5 text-center">
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="text-3xl font-bold text-brand-amber-foreground">
                {Number(data.computed_amount) === 0
                  ? "FREE"
                  : `$${Number(data.computed_amount).toFixed(2)}`}
              </p>
              {payment && (
                <p className="text-xs text-muted-foreground mt-1">
                  Payment: {payment.status} via Stripe
                </p>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Registered on{" "}
              {format(parseISO(data.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
