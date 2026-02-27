"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: "admin" | "super_admin";
  created_at: string;
};

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [callerRole, setCallerRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    phone: "",
    password: "",
    role: "admin" as "admin" | "super_admin",
  });

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
        setCallerRole(data.callerRole || "");
      }
    } catch {
      toast.error("Failed to load admin users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.fullName || !form.password) {
      toast.error("Email, name, and password are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create admin");
      } else {
        toast.success(data.message);
        setShowForm(false);
        setForm({
          email: "",
          fullName: "",
          phone: "",
          password: "",
          role: "admin",
        });
        fetchAdmins();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(admin: AdminUser) {
    if (
      !confirm(
        `Remove admin access for ${admin.full_name || admin.email}? They will be demoted to a regular user.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${admin.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to remove admin");
      } else {
        toast.success("Admin access revoked");
        fetchAdmins();
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleToggleRole(admin: AdminUser) {
    const newRole = admin.role === "admin" ? "super_admin" : "admin";
    try {
      const res = await fetch(`/api/admin/users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update role");
      } else {
        toast.success(`Role updated to ${newRole.replace("_", " ")}`);
        fetchAdmins();
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  const isSuperAdmin = callerRole === "super_admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Admin Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage admin users and their access levels
          </p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" className="self-start sm:self-auto" onClick={() => setShowForm(!showForm)}>
            {showForm ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Admin
              </>
            )}
          </Button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <Card className="shadow-brand-sm">
          <CardHeader>
            <CardTitle className="text-lg">Add New Admin</CardTitle>
            <CardDescription>
              Create a new admin account or promote an existing user
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="john@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder="555-123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder="Min 8 characters"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={form.role === "admin" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, role: "admin" })}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Admin
                  </Button>
                  <Button
                    type="button"
                    variant={
                      form.role === "super_admin" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setForm({ ...form, role: "super_admin" })}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Super Admin
                  </Button>
                </div>
              </div>
              <Separator />
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-2 h-4 w-4" />
                Create Admin
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-brand-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            Admin Users ({admins.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No admin users found.
            </p>
          ) : (
            <div className="divide-y">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      {admin.role === "super_admin" ? (
                        <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      ) : (
                        <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {admin.full_name || "Unnamed"}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {admin.email}
                        {admin.phone && ` • ${admin.phone}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-12 sm:pl-0 shrink-0">
                    <Badge
                      variant={
                        admin.role === "super_admin" ? "default" : "secondary"
                      }
                      className="capitalize text-xs"
                    >
                      {admin.role.replace("_", " ")}
                    </Badge>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1 ml-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggleRole(admin)}
                          title={
                            admin.role === "admin"
                              ? "Promote to Super Admin"
                              : "Demote to Admin"
                          }
                        >
                          {admin.role === "admin" ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <Shield className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(admin)}
                          title="Remove admin access"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!isSuperAdmin && (
        <p className="text-sm text-muted-foreground text-center">
          Only super admins can add or remove admin users. Contact a super admin
          if you need changes.
        </p>
      )}
    </div>
  );
}
