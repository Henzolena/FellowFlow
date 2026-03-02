import { cookies } from "next/headers";
import { type Locale, type Dictionary, defaultLocale, getDictionary } from "./dictionaries";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  if (raw === "en" || raw === "am") return raw;
  return defaultLocale;
}

export async function getServerDictionary(): Promise<Dictionary> {
  const locale = await getLocale();
  return getDictionary(locale);
}
