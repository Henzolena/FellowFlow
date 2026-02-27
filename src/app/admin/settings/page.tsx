"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import type { EventWithPricing } from "@/types/database";

type EventForm = {
  id?: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  adultAgeThreshold: number;
  youthAgeThreshold: number;
  isActive: boolean;
  pricing: {
    adultFullPrice: number;
    adultDailyPrice: number;
    youthFullPrice: number;
    youthDailyPrice: number;
    childFullPrice: number;
    childDailyPrice: number;
    motelStayFree: boolean;
  };
};

const emptyForm: EventForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  adultAgeThreshold: 18,
  youthAgeThreshold: 13,
  isActive: true,
  pricing: {
    adultFullPrice: 0,
    adultDailyPrice: 0,
    youthFullPrice: 0,
    youthDailyPrice: 0,
    childFullPrice: 0,
    childDailyPrice: 0,
    motelStayFree: true,
  },
};

export default function SettingsPage() {
  const [events, setEvents] = useState<EventWithPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function editEvent(event: EventWithPricing) {
    const pc = Array.isArray(event.pricing_config)
      ? event.pricing_config[0]
      : event.pricing_config;
    setForm({
      id: event.id,
      name: event.name,
      description: event.description || "",
      startDate: event.start_date,
      endDate: event.end_date,
      adultAgeThreshold: event.adult_age_threshold,
      youthAgeThreshold: event.youth_age_threshold,
      isActive: event.is_active,
      pricing: {
        adultFullPrice: pc ? Number(pc.adult_full_price) : 0,
        adultDailyPrice: pc ? Number(pc.adult_daily_price) : 0,
        youthFullPrice: pc ? Number(pc.youth_full_price) : 0,
        youthDailyPrice: pc ? Number(pc.youth_daily_price) : 0,
        childFullPrice: pc ? Number(pc.child_full_price) : 0,
        childDailyPrice: pc ? Number(pc.child_daily_price) : 0,
        motelStayFree: pc?.motel_stay_free ?? true,
      },
    });
    setEditingId(event.id);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { ...form, id: editingId } : form;

      const res = await fetch("/api/admin/events", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      toast.success(editingId ? "Event updated" : "Event created");
      resetForm();
      fetchEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Event Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage events and pricing configuration
          </p>
        </div>
        {editingId && (
          <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={resetForm}>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        )}
      </div>

      {/* Existing events list */}
      {events.length > 0 && (
        <Card className="shadow-brand-sm">
          <CardHeader>
            <CardTitle>Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-border/60 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => editEvent(event)}
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.start_date} — {event.end_date} ({event.duration_days}{" "}
                    days)
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    event.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {event.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Event form */}
      <Card className="shadow-brand-sm">
        <CardHeader>
          <CardTitle>{editingId ? "Edit Event" : "Create New Event"}</CardTitle>
          <CardDescription>
            Configure event details and pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Event details */}
          <div className="space-y-4">
            <h3 className="font-semibold">Event Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Event Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Annual Conference 2026"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Adult Age Threshold</Label>
                <Input
                  type="number"
                  value={form.adultAgeThreshold}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      adultAgeThreshold: parseInt(e.target.value) || 18,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Youth Age Threshold</Label>
                <Input
                  type="number"
                  value={form.youthAgeThreshold}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      youthAgeThreshold: parseInt(e.target.value) || 13,
                    }))
                  }
                />
              </div>
            </div>
            {editingId && (
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, isActive: checked }))
                  }
                />
                <Label>Event is active</Label>
              </div>
            )}
          </div>

          <Separator />

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="font-semibold">Pricing Configuration</h3>
            <p className="text-sm text-muted-foreground">
              Set registration fees per category. Full duration prices apply to
              attendees staying for the entire conference. Daily prices are
              multiplied by the number of days for partial attendees.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <h4 className="font-medium text-brand-cyan">Adult</h4>
                <div className="space-y-2">
                  <Label className="text-xs">Full Conference (P1)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.pricing.adultFullPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricing: {
                          ...f.pricing,
                          adultFullPrice: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Per Day (P1.1)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.pricing.adultDailyPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricing: {
                          ...f.pricing,
                          adultDailyPrice: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <h4 className="font-medium text-brand-teal">Youth (13+)</h4>
                <div className="space-y-2">
                  <Label className="text-xs">Full Conference (P2)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.pricing.youthFullPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricing: {
                          ...f.pricing,
                          youthFullPrice: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Per Day (P2.1)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.pricing.youthDailyPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricing: {
                          ...f.pricing,
                          youthDailyPrice: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <h4 className="font-medium text-brand-amber">Child (&lt;13)</h4>
                <div className="space-y-2">
                  <Label className="text-xs">Full Conference (P3)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.pricing.childFullPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricing: {
                          ...f.pricing,
                          childFullPrice: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Per Day (P3.1)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.pricing.childDailyPrice}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricing: {
                          ...f.pricing,
                          childDailyPrice: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.pricing.motelStayFree}
                onCheckedChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    pricing: { ...f.pricing, motelStayFree: checked },
                  }))
                }
              />
              <Label>
                Full conference + motel stay = Free registration
              </Label>
            </div>
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving || !form.name || !form.startDate || !form.endDate}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {editingId ? "Update Event" : "Create Event"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
