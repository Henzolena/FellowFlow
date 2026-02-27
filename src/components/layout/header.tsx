import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg sm:text-xl">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span>FellowFlow</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link href="/register">
            <Button size="sm" className="sm:size-default text-xs sm:text-sm">Register Now</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
