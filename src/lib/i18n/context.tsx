"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { type Locale, type Dictionary, defaultLocale, getDictionary } from "./dictionaries";

type LanguageContextValue = {
  locale: Locale;
  dict: Dictionary;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getInitialLocale(): Locale {
  const cookie = getCookie("locale");
  if (cookie === "en" || cookie === "am") return cookie;
  return defaultLocale;
}

export function LanguageProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? getInitialLocale);
  const [dict, setDict] = useState<Dictionary>(() => getDictionary(initialLocale ?? getInitialLocale()));
  const router = useRouter();

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      setDict(getDictionary(newLocale));
      setCookie("locale", newLocale);
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    const cookieLocale = getCookie("locale");
    if (cookieLocale !== locale) {
      setCookie("locale", locale);
    }
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, dict, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within a LanguageProvider");
  return ctx;
}
