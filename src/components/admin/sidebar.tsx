"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Settings,
  Users,
  LogOut,
  ChevronLeft,
  ShieldCheck,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/registrations", label: "Registrations", icon: Users },
  { href: "/admin/settings", label: "Event Settings", icon: Settings },
  { href: "/admin/users", label: "Admin Management", icon: ShieldCheck, superAdminOnly: true },
];

type ProfileData = {
  full_name: string | null;
  email: string;
  role: string;
};

function useAdminProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, email, role")
          .eq("id", user.id)
          .single();
        if (data) setProfile(data);
      }
    }
    loadProfile();
  }, []);

  return profile;
}

function SidebarNav({
  profile,
  onNavigate,
}: {
  profile: ProfileData | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isSuperAdmin = profile?.role === "super_admin";
  const visibleItems = navItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin
  );

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to site
        </Link>
      </div>

      <div className="px-4 py-4">
        <h2 className="text-lg font-bold">Admin Portal</h2>
        <p className="text-xs text-muted-foreground">FellowFlow Management</p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 space-y-2">
        {profile && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">
              {profile.full_name || profile.email}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground truncate">
                {profile.email}
              </p>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize shrink-0">
                {profile.role.replace("_", " ")}
              </Badge>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );
}

export function AdminSidebar() {
  const profile = useAdminProfile();

  return (
    <aside className="hidden md:flex h-full w-64 flex-col border-r bg-card">
      <SidebarNav profile={profile} />
    </aside>
  );
}

export function AdminMobileHeader() {
  const [open, setOpen] = useState(false);
  const profile = useAdminProfile();
  const pathname = usePathname();

  const currentPage = navItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/admin" && pathname.startsWith(item.href))
  );

  return (
    <div className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-4">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 -ml-2"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open menu</span>
      </Button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">
          {currentPage?.label || "Admin"}
        </p>
      </div>
      {profile && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize shrink-0">
          {profile.role.replace("_", " ")}
        </Badge>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarNav profile={profile} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
