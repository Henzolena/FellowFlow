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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  UserCircle,
  Briefcase,
} from "lucide-react";
import type {
  DepartmentWithResponsibilities,
  CommitteeMemberWithDepartment,
} from "@/types/database";

type EventOption = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  department_count: number;
};

const deptIconMap: Record<string, string> = {
  finance: "💰",
  food: "🍽️",
  lodging: "🛏️",
  transportation: "🚌",
  public_relations: "📢",
  registration: "📋",
  meeting_hall: "🏛️",
  children: "👶",
  youth: "🧑‍🎓",
  secretary_chair: "📝",
};

export default function DepartmentsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [departments, setDepartments] = useState<DepartmentWithResponsibilities[]>([]);
  const [members, setMembers] = useState<CommitteeMemberWithDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  // Load events that have departments
  useEffect(() => {
    fetch("/api/admin/departments")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
          if (data.length > 0) {
            setSelectedEventId(data[0].id);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load departments for selected event
  useEffect(() => {
    if (!selectedEventId) return;
    setDetailLoading(true);
    fetch(`/api/admin/departments?eventId=${selectedEventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.departments) {
          setDepartments(data.departments);
          setMembers(data.committee_members);
        }
      })
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [selectedEventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">No Department Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          No conference organizational structure has been configured yet.
        </p>
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const totalMembers = departments.reduce((s, d) => s + d.member_count, 0);
  const totalResponsibilities = departments.reduce(
    (s, d) => s + (d.department_responsibilities?.length ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Service Departments
          </h1>
          <p className="text-muted-foreground mt-1">
            Conference organizational structure and responsibilities
          </p>
        </div>
        {events.length > 1 && (
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {events.map((evt) => (
                <SelectItem key={evt.id} value={evt.id}>
                  {evt.name}
                  {evt.is_active && (
                    <Badge variant="default" className="ml-2 text-[10px]">
                      Active
                    </Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground">Departments</p>
                <p className="text-2xl font-bold">{departments.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground">Committee Members</p>
                <p className="text-2xl font-bold">{members.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground">Total Staff</p>
                <p className="text-2xl font-bold">{totalMembers}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground">Responsibilities</p>
                <p className="text-2xl font-bold">{totalResponsibilities}</p>
              </CardContent>
            </Card>
          </div>

          {/* Committee Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                Committee Members
              </CardTitle>
              <CardDescription>
                {selectedEvent?.name} leadership team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.name_en}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.name_am}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {m.role_en}
                        </Badge>
                        {m.conference_departments && (
                          <Badge variant="outline" className="text-[10px]">
                            {deptIconMap[m.conference_departments.slug] ?? "📌"}{" "}
                            {m.conference_departments.name_en}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Departments with Responsibilities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Department Responsibilities
              </CardTitle>
              <CardDescription>
                Click a department to expand its responsibilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {departments.map((dept) => {
                const isExpanded = expandedDept === dept.id;
                const icon = deptIconMap[dept.slug] ?? "📌";
                const responsibilities = dept.department_responsibilities ?? [];

                return (
                  <div
                    key={dept.id}
                    className="rounded-lg border bg-card overflow-hidden"
                  >
                    {/* Department Header */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDept(isExpanded ? null : dept.id)
                      }
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl">{icon}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{dept.name_en}</p>
                          <p className="text-xs text-muted-foreground">
                            {dept.name_am}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {dept.member_count} staff
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {responsibilities.length} tasks
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Responsibilities */}
                    {isExpanded && responsibilities.length > 0 && (
                      <div className="border-t bg-muted/20 px-4 py-3">
                        <div className="space-y-2">
                          {responsibilities.map((r, i) => {
                            const isYouthLeader =
                              r.description_en.startsWith("[Youth Leader]");
                            return (
                              <div
                                key={r.id}
                                className={`flex items-start gap-3 text-sm ${
                                  isYouthLeader
                                    ? "mt-3 pt-3 border-t border-dashed border-muted-foreground/20"
                                    : ""
                                }`}
                              >
                                <span
                                  className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                    isYouthLeader
                                      ? "bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400"
                                      : "bg-primary/10 text-primary"
                                  }`}
                                >
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="leading-relaxed">
                                    {r.description_en}
                                  </p>
                                  <p className="text-xs text-muted-foreground leading-relaxed">
                                    {r.description_am}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
