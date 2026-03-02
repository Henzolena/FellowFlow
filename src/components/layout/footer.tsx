"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

export function Footer() {
  const { dict } = useTranslation();

  return (
    <footer className="border-t border-border/60">
      <div className="h-px brand-gradient opacity-10" />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} FellowFlow. {dict.footer.allRightsReserved}</p>
          <Link 
            href="/admin" 
            className="flex items-center gap-1.5 text-xs opacity-40 hover:opacity-80 transition-opacity"
            title="Admin Portal"
          >
            <Shield className="h-3 w-3" />
            <span>{dict.footer.admin}</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
