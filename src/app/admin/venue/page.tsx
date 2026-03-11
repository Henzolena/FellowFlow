"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  Building2,
  BedDouble,
  Hotel,
  UtensilsCrossed,
  DollarSign,
  ShieldAlert,
  Info,
  Calendar,
  Users,
  Landmark,
  FileText,
  ChefHat,
} from "lucide-react";
import type { VenueWithDetails, VenueFacility } from "@/types/database";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime24to12(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function facilityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    hotel: "Hotel",
    dorm: "Dormitory",
    conference_room: "Conference Room",
    hall: "Hall / Venue",
    cottage: "Cottage",
    amenity: "Amenity",
    other: "Other",
  };
  return labels[type] || type;
}

function facilityTypeBadgeVariant(type: string): "default" | "secondary" | "outline" | "destructive" {
  if (type === "hotel") return "default";
  if (type === "dorm" || type === "cottage") return "secondary";
  return "outline";
}

function FacilityCard({ facility }: { facility: VenueFacility }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div className="mt-0.5">
        {facility.facility_type === "hotel" ? (
          <Hotel className="h-4 w-4 text-primary" />
        ) : facility.facility_type === "dorm" || facility.facility_type === "cottage" ? (
          <BedDouble className="h-4 w-4 text-amber-600" />
        ) : facility.facility_type === "amenity" ? (
          <Info className="h-4 w-4 text-blue-500" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{facility.name}</span>
          <Badge variant={facilityTypeBadgeVariant(facility.facility_type)} className="text-[10px]">
            {facilityTypeLabel(facility.facility_type)}
          </Badge>
          {facility.linens_provided && (
            <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
              Linens
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
          {facility.capacity != null && (
            <span>{facility.capacity} {facility.capacity_unit || "units"}</span>
          )}
          {facility.rate_per_night != null && (
            <span className="font-medium text-foreground">
              {formatCurrency(facility.rate_per_night)}/{facility.rate_unit?.replace("per_", "") || "night"}
            </span>
          )}
          {facility.tables_count != null && (
            <span>{facility.tables_count} tables</span>
          )}
        </div>
        {facility.table_types && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{facility.table_types}</p>
        )}
        {(facility.equipment as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(facility.equipment as string[]).map((eq, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-normal">
                {eq}
              </Badge>
            ))}
          </div>
        )}
        {facility.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 italic">{facility.notes}</p>
        )}
      </div>
    </div>
  );
}

export default function VenueInfoPage() {
  const [venues, setVenues] = useState<VenueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/venues")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setVenues(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="text-center py-16">
        <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">No Venue Information</h2>
        <p className="text-sm text-muted-foreground mt-1">
          No venue has been configured for the active event.
        </p>
      </div>
    );
  }

  const venue = venues[0];
  const facilities = venue.venue_facilities || [];
  const rates = venue.venue_rates || [];
  const mealSchedule = venue.venue_meal_schedule || [];

  const hotels = facilities.filter((f) => f.facility_type === "hotel");
  const dorms = facilities.filter((f) => f.facility_type === "dorm" || f.facility_type === "cottage");
  const confRooms = facilities.filter((f) => f.facility_type === "conference_room");
  const halls = facilities.filter((f) => f.facility_type === "hall");
  const amenities = facilities.filter((f) => f.facility_type === "amenity");
  const otherFacilities = facilities.filter((f) => f.facility_type === "other");

  const accommodationRates = rates.filter((r) => r.rate_category === "accommodation");
  const mealRates = rates.filter((r) => r.rate_category === "meal");
  const otherRates = rates.filter((r) => r.rate_category === "amenity" || r.rate_category === "fee");

  const totalHotelCapacity = hotels.reduce((sum, h) => sum + (h.capacity || 0), 0);
  const totalDormCapacity = dorms.reduce((sum, d) => sum + (d.capacity || 0), 0);

  // Group meals by date
  const mealsByDate = mealSchedule.reduce<Record<string, typeof mealSchedule>>((acc, meal) => {
    if (!acc[meal.meal_date]) acc[meal.meal_date] = [];
    acc[meal.meal_date].push(meal);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          {venue.name}
        </h1>
        <p className="text-muted-foreground mt-1">{venue.group_name}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Hotel Rooms</p>
            <p className="text-2xl font-bold">{totalHotelCapacity}</p>
            <p className="text-[11px] text-muted-foreground">
              Min. guaranteed: {venue.guaranteed_hotel_rooms}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Dorm Capacity Listed</p>
            <p className="text-2xl font-bold">{totalDormCapacity}</p>
            <p className="text-[11px] text-muted-foreground">
              Min. payment guarantee: {venue.guaranteed_dorm_beds}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Hotel Rooms Reserved</p>
            <p className="text-2xl font-bold">{venue.total_rooms_reserved}</p>
            <p className="text-[11px] text-muted-foreground">per contract Guests section</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Deposit Balance</p>
            <p className="text-2xl font-bold">{formatCurrency(venue.deposit_balance)}</p>
            <p className="text-[11px] text-muted-foreground">
              of {formatCurrency(venue.deposit_total)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Venue & Contact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Venue Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">{venue.name}</p>
              <p className="text-muted-foreground">{venue.address}</p>
              <p className="text-muted-foreground">
                {venue.city}, {venue.state} {venue.zip}
              </p>
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-2">
              {venue.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{venue.phone}</span>
                </div>
              )}
              {venue.fax && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>Fax: {venue.fax}</span>
                </div>
              )}
              {venue.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <a href={`mailto:${venue.email}`} className="hover:underline text-primary">
                    {venue.email}
                  </a>
                </div>
              )}
              {venue.website && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <a
                    href={`https://${venue.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-primary"
                  >
                    {venue.website}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contract & Dates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Contract & Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Contract Date</p>
                <p className="font-medium">{formatDate(venue.contract_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deposit Due</p>
                <p className="font-medium">{formatDate(venue.deposit_due_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Arrival</p>
                <p className="font-medium">{formatDate(venue.reservation_start)}</p>
                {venue.arrival_time && (
                  <p className="text-xs text-muted-foreground">{venue.arrival_time}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Departure</p>
                <p className="font-medium">{formatDate(venue.reservation_end)}</p>
                {venue.departure_time && (
                  <p className="text-xs text-muted-foreground">{venue.departure_time}</p>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Financial Summary</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/50 rounded-md p-2">
                  <p className="text-xs text-muted-foreground">Total Deposit</p>
                  <p className="font-semibold">{formatCurrency(venue.deposit_total)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-md p-2">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    {formatCurrency(venue.deposit_paid)}
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md p-2">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    {formatCurrency(venue.deposit_balance)}
                  </p>
                </div>
              </div>
            </div>
            {venue.payment_notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  {(venue.payment_notes as string).split('\n\n').map((paragraph, i) => (
                    <p key={i} className={`text-xs leading-relaxed ${
                      paragraph.startsWith('CANCELLATION') || paragraph.startsWith('MEAL FINALIZATION')
                        ? 'text-amber-700 dark:text-amber-400 font-medium'
                        : 'text-muted-foreground italic'
                    }`}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Organization & Group */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">{venue.organization_name}</p>
              <p className="text-muted-foreground">{venue.organization_address}</p>
              <p className="text-muted-foreground">{venue.organization_city_state_zip}</p>
              {venue.organization_phone && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{venue.organization_phone}</span>
                </div>
              )}
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Group Leader</p>
              <p className="font-medium">{venue.group_leader}</p>
              <div className="flex flex-col gap-1 mt-1">
                {venue.group_leader_email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <a href={`mailto:${venue.group_leader_email}`} className="hover:underline text-primary">
                      {venue.group_leader_email}
                    </a>
                  </div>
                )}
                {venue.group_leader_phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{venue.group_leader_phone}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Office Hours */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Camp Office Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(venue.office_hours as { day: string; hours: string; note: string | null }[]).map(
                (oh, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-sm">
                    <span className="font-medium min-w-[140px]">{oh.day}</span>
                    <div className="text-right">
                      <span>{oh.hours}</span>
                      {oh.note && (
                        <p className="text-[11px] text-muted-foreground">{oh.note}</p>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Facilities Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Facilities & Accommodations
          </CardTitle>
          <CardDescription>
            {totalHotelCapacity} hotel rooms • {totalDormCapacity} dorm beds (capacity, compiled) •{" "}
            {confRooms.length} conference rooms • {halls.length} halls • {amenities.length} amenities
            {otherFacilities.length > 0 && ` • ${otherFacilities.length} other campus facilities (from equipment page)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hotels */}
          {hotels.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Hotel className="h-4 w-4 text-primary" />
                Hotel Rooms ({totalHotelCapacity} rooms)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {hotels.map((f) => (
                  <FacilityCard key={f.id} facility={f} />
                ))}
              </div>
            </div>
          )}

          {/* Dorms & Cottages */}
          {dorms.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <BedDouble className="h-4 w-4 text-amber-600" />
                Dormitories & Cottages ({totalDormCapacity} beds capacity, compiled from page 1)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {dorms.map((f) => (
                  <FacilityCard key={f.id} facility={f} />
                ))}
              </div>
            </div>
          )}

          {/* Conference Rooms */}
          {confRooms.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-blue-500" />
                Conference Rooms ({confRooms.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {confRooms.map((f) => (
                  <FacilityCard key={f.id} facility={f} />
                ))}
              </div>
            </div>
          )}

          {/* Halls */}
          {halls.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Halls & Venues ({halls.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {halls.map((f) => (
                  <FacilityCard key={f.id} facility={f} />
                ))}
              </div>
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-blue-500" />
                Amenities ({amenities.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {amenities.map((f) => (
                  <FacilityCard key={f.id} facility={f} />
                ))}
              </div>
            </div>
          )}

          {/* Other Available Facilities (not on reservation list) */}
          {otherFacilities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-gray-400" />
                Other Campus Facilities ({otherFacilities.length})
              </h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                Listed on the equipment/tables page (page 3) but not on the reservation list (page 1). Available on campus but not confirmed as reserved for this contract.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {otherFacilities.map((f) => (
                  <FacilityCard key={f.id} facility={f} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Rate Schedule
          </CardTitle>
          <CardDescription>
            Campus rates from the rental contract
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Accommodation Rates */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Hotel className="h-4 w-4" />
                Accommodation
              </h3>
              <div className="space-y-2">
                {accommodationRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-dashed pb-1.5 last:border-0">
                    <div>
                      <p className="font-medium">{r.rate_name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.unit}</p>
                    </div>
                    <span className="font-semibold text-primary">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Meal Rates */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <UtensilsCrossed className="h-4 w-4" />
                Meals
              </h3>
              <div className="space-y-2">
                {mealRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-dashed pb-1.5 last:border-0">
                    <div>
                      <p className="font-medium">{r.rate_name}</p>
                      {r.age_restriction && (
                        <p className="text-[11px] text-muted-foreground">{r.age_restriction}</p>
                      )}
                    </div>
                    <span className="font-semibold text-primary">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Rates */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4" />
                Fees & Amenities
              </h3>
              <div className="space-y-2">
                {otherRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-dashed pb-1.5 last:border-0">
                    <div>
                      <p className="font-medium">{r.rate_name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.unit}</p>
                    </div>
                    <span className="font-semibold text-primary">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meal Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Meal Schedule
          </CardTitle>
          <CardDescription>
            Reserved meals in the dining hall (min. 35 people required to open, 45-min serving window)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(mealsByDate)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, meals]) => {
                const dayName = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <div key={date} className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-3">{dayName}</h4>
                    <div className="space-y-2.5">
                      {meals
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((meal) => (
                          <div key={meal.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="capitalize">{meal.meal_name}</span>
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {formatTime24to12(meal.meal_time)}
                            </span>
                          </div>
                        ))}
                    </div>
                    {meals[0]?.notes && (
                      <p className="text-[11px] text-muted-foreground mt-2 italic">
                        {meals[0].notes}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Rules & Policies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Rules & Policies
          </CardTitle>
          <CardDescription>
            Terms and conditions from the Camp Copass rental contract
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(venue.rules as string[]).map((rule, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 h-5 w-5 rounded-full bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{rule}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* General Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            General Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(venue.general_info as string[]).map((info, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{info}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
