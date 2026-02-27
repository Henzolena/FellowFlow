import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users, Shield } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg sm:text-xl">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span>FellowFlow</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Admin</span>
          </Link>
          <Link href="/register">
            <Button size="sm" className="sm:size-default text-xs sm:text-sm">Register Now</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
