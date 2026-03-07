"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Utensils,
  DoorOpen,
  Sparkles,
  Trash2,
  CalendarDays,
  Clock,
  RefreshCw,
  Zap,
  Loader2,
} from "lucide-react";
import type { ServiceCatalogItem } from "@/types/database";

type EventOption = { id: string; name: string; start_date: string; end_date: string };

export default function ServicesPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showMealGen, setShowMealGen] = useState(false);

  // Create form
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCategory, setFormCategory] = useState<string>("custom");
  const [formMealType, setFormMealType] = useState<string>("");
  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");

  // Meal generation form
  const [mealTypes, setMealTypes] = useState<string[]>(["breakfast", "lunch", "dinner"]);
  const [bfStart, setBfStart] = useState("07:00");
  const [bfEnd, setBfEnd] = useState("09:00");
  const [lnStart, setLnStart] = useState("12:00");
  const [lnEnd, setLnEnd] = useState("14:00");
  const [dnStart, setDnStart] = useState("18:00");
  const [dnEnd, setDnEnd] = useState("20:00");

  useEffect(() => {
    async function loadEvents() {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, name, start_date, end_date")
        .eq("is_active", true)
        .order("start_date", { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
      setLoading(false);
    }
    loadEvents();
  }, []);

  const loadServices = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/services?eventId=${selectedEventId}`);
    const json = await res.json();
    setServices(json.services || []);
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  async function handleCreateService() {
    if (!formName || !formCode) return;
    setGenerating(true);
    await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: selectedEventId,
        serviceName: formName,
        serviceCode: formCode,
        serviceCategory: formCategory,
        mealType: formCategory === "meal" ? formMealType || null : null,
        serviceDate: formDate || null,
        startTime: formStart || null,
        endTime: formEnd || null,
      }),
    });
    setGenerating(false);
    setShowCreate(false);
    setFormName("");
    setFormCode("");
    loadServices();
  }

  async function handleGenerateMeals() {
    if (mealTypes.length === 0 || !selectedEventId) return;
    const event = events.find((e) => e.id === selectedEventId);
    if (!event) return;
    setGenerating(true);
    await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: selectedEventId,
        meals: mealTypes,
        startDate: event.start_date,
        endDate: event.end_date,
        breakfastTime: { start: bfStart, end: bfEnd },
        lunchTime: { start: lnStart, end: lnEnd },
        dinnerTime: { start: dnStart, end: dnEnd },
      }),
    });
    setGenerating(false);
    setShowMealGen(false);
    loadServices();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this service? This will also remove all entitlements and usage logs for it.")) return;
    await fetch(`/api/admin/services?id=${id}`, { method: "DELETE" });
    loadServices();
  }

  async function handleToggleActive(svc: ServiceCatalogItem) {
    await fetch("/api/admin/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: svc.id, isActive: !svc.is_active }),
    });
    loadServices();
  }

  async function handleBulkGenerateEntitlements() {
    if (!selectedEventId) return;
    setBulkGenerating(true);
    const res = await fetch("/api/admin/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: selectedEventId }),
    });
    const json = await res.json();
    setBulkGenerating(false);
    alert(`Generated ${json.totalCreated} entitlements for ${json.registrationCount} registrations.`);
  }

  const toggleMealType = (meal: string) => {
    setMealTypes((prev) =>
      prev.includes(meal) ? prev.filter((m) => m !== meal) : [...prev, meal]
    );
  };

  // Group services by category
  const mainServices = services.filter((s) => s.service_category === "main_service");
  const mealServices = services.filter((s) => s.service_category === "meal");
  const customServices = services.filter((s) => s.service_category === "custom");

  // Group meals by date
  const mealsByDate: Record<string, ServiceCatalogItem[]> = {};
  mealServices.forEach((s) => {
    const d = s.service_date || "undated";
    if (!mealsByDate[d]) mealsByDate[d] = [];
    mealsByDate[d].push(s);
  });

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case "main_service": return <DoorOpen className="h-4 w-4" />;
      case "meal": return <Utensils className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "main_service": return "bg-blue-100 text-blue-700";
      case "meal": return "bg-amber-100 text-amber-700";
      default: return "bg-purple-100 text-purple-700";
    }
  };

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Service Catalog</h1>
          <p className="text-sm text-muted-foreground">Manage check-in services, meals, and custom access points</p>
        </div>
        <div className="flex items-center gap-2">
          {events.length > 1 && (
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Dialog open={showMealGen} onOpenChange={setShowMealGen}>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2">
              <Utensils className="h-4 w-4" /> Generate Meal Services
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Daily Meal Services</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Auto-create a meal service for each day of the event.
            </p>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Meal Types</Label>
                <div className="flex gap-2">
                  {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                    <Button
                      key={meal}
                      variant={mealTypes.includes(meal) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleMealType(meal)}
                      className="capitalize"
                    >
                      {meal}
                    </Button>
                  ))}
                </div>
              </div>
              {mealTypes.includes("breakfast") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Breakfast Start</Label>
                    <Input type="time" value={bfStart} onChange={(e) => setBfStart(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Breakfast End</Label>
                    <Input type="time" value={bfEnd} onChange={(e) => setBfEnd(e.target.value)} />
                  </div>
                </div>
              )}
              {mealTypes.includes("lunch") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Lunch Start</Label>
                    <Input type="time" value={lnStart} onChange={(e) => setLnStart(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Lunch End</Label>
                    <Input type="time" value={lnEnd} onChange={(e) => setLnEnd(e.target.value)} />
                  </div>
                </div>
              )}
              {mealTypes.includes("dinner") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Dinner Start</Label>
                    <Input type="time" value={dnStart} onChange={(e) => setDnStart(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Dinner End</Label>
                    <Input type="time" value={dnEnd} onChange={(e) => setDnEnd(e.target.value)} />
                  </div>
                </div>
              )}
              <Button onClick={handleGenerateMeals} disabled={generating || mealTypes.length === 0} className="w-full">
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Utensils className="h-4 w-4 mr-2" />}
                Generate {mealTypes.length} Meal Type{mealTypes.length > 1 ? "s" : ""} Per Day
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Add Custom Service
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Service</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Service Name</Label>
                  <Input placeholder="e.g. Workshop A" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div>
                  <Label>Service Code</Label>
                  <Input placeholder="e.g. workshop_a" value={formCode} onChange={(e) => setFormCode(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main_service">Main Service</SelectItem>
                    <SelectItem value="meal">Meal</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formCategory === "meal" && (
                <div>
                  <Label>Meal Type</Label>
                  <Select value={formMealType} onValueChange={setFormMealType}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleCreateService} disabled={generating || !formName || !formCode} className="w-full">
                Create Service
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button variant="outline" className="gap-2" onClick={handleBulkGenerateEntitlements} disabled={bulkGenerating}>
          {bulkGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Generate Entitlements for All
        </Button>

        <Button variant="ghost" size="icon" onClick={loadServices} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Utensils className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Services Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Start by generating meal services for each day of the event, or add a custom service.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Services */}
          {mainServices.length > 0 && (
            <ServiceSection title="Main Service" icon={<DoorOpen className="h-5 w-5" />} color="blue">
              {mainServices.map((svc) => (
                <ServiceCard key={svc.id} svc={svc} onDelete={handleDelete} onToggle={handleToggleActive} categoryIcon={categoryIcon} categoryColor={categoryColor} />
              ))}
            </ServiceSection>
          )}

          {/* Meal Services grouped by date */}
          {Object.keys(mealsByDate).length > 0 && (
            <ServiceSection title={`Meal Services (${mealServices.length})`} icon={<Utensils className="h-5 w-5" />} color="amber">
              {Object.entries(mealsByDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, dateMeals]) => (
                  <div key={date} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      {date === "undated" ? "No Date" : formatDate(date)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
                      {dateMeals.map((svc) => (
                        <ServiceCard key={svc.id} svc={svc} onDelete={handleDelete} onToggle={handleToggleActive} categoryIcon={categoryIcon} categoryColor={categoryColor} compact />
                      ))}
                    </div>
                  </div>
                ))}
            </ServiceSection>
          )}

          {/* Custom Services */}
          {customServices.length > 0 && (
            <ServiceSection title="Custom Services" icon={<Sparkles className="h-5 w-5" />} color="purple">
              {customServices.map((svc) => (
                <ServiceCard key={svc.id} svc={svc} onDelete={handleDelete} onToggle={handleToggleActive} categoryIcon={categoryIcon} categoryColor={categoryColor} />
              ))}
            </ServiceSection>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceSection({ title, icon, color, children }: { title: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  const borderColor = color === "blue" ? "border-blue-200" : color === "amber" ? "border-amber-200" : "border-purple-200";
  const bgColor = color === "blue" ? "bg-blue-50" : color === "amber" ? "bg-amber-50" : "bg-purple-50";
  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      <div className={`${bgColor} px-4 py-3 flex items-center gap-2 border-b ${borderColor}`}>
        {icon}
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function ServiceCard({
  svc,
  onDelete,
  onToggle,
  categoryIcon,
  categoryColor,
  compact,
}: {
  svc: ServiceCatalogItem;
  onDelete: (id: string) => void;
  onToggle: (svc: ServiceCatalogItem) => void;
  categoryIcon: (cat: string) => React.ReactNode;
  categoryColor: (cat: string) => string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${!svc.is_active ? "opacity-50 bg-muted/30" : "bg-card"} ${compact ? "py-2" : ""}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Badge variant="secondary" className={`${categoryColor(svc.service_category)} shrink-0 gap-1 text-xs`}>
          {categoryIcon(svc.service_category)}
          {svc.meal_type ? svc.meal_type.charAt(0).toUpperCase() + svc.meal_type.slice(1) : svc.service_category === "main_service" ? "Main" : "Custom"}
        </Badge>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{svc.service_name}</p>
          {svc.start_time && svc.end_time && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {svc.start_time.slice(0, 5)} — {svc.end_time.slice(0, 5)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => onToggle(svc)}>
          {svc.is_active ? "Disable" : "Enable"}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => onDelete(svc.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
