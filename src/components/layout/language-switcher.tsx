"use client";

import { useTranslation } from "@/lib/i18n/context";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === "en" ? "am" : "en")}
      className="gap-1.5 text-sm font-medium"
      aria-label="Switch language"
    >
      <Globe className="h-4 w-4" />
      {locale === "en" ? "አማርኛ" : "English"}
    </Button>
  );
}
