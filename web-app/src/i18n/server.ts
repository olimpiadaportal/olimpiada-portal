import { cache } from "react";
import { cookies } from "next/headers";
import { messages } from "./messages";
import { defaultLocale, type Locale } from "./config";
import { getLocaleSettings } from "@/lib/flags";

export type T = (key: string) => string;

// Locale resolution respects the admin's Settings (Round 6): the cookie value
// only wins if that language is currently ENABLED (`platform.supported_locales`);
// otherwise the admin-chosen `platform.default_locale` applies. Memoized per
// request — getLocale/getT run in every layout + page.
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const v = store.get("locale")?.value;
  const { enabled, fallback } = await getLocaleSettings();
  return v && (enabled as readonly string[]).includes(v) ? (v as Locale) : fallback;
});

export async function getT(): Promise<T> {
  const locale = await getLocale();
  const dict = messages[locale];
  const fallback = messages[defaultLocale];
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
