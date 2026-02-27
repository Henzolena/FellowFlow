import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/FellowFlow-logo.png"
            alt="FellowFlow"
            width={140}
            height={36}
            className="h-8 sm:h-9 w-auto"
            priority
          />
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/register">
            <Button size="sm" className="gap-1.5 text-xs sm:text-sm shadow-brand-sm hover:shadow-brand-md transition-shadow">
              Register
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
