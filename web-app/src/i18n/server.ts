import { cache } from "react";
import { cookies } from "next/headers";
import { messages } from "./messages";
import { defaultLocale, type Locale } from "./config";
import { getLocaleSettings, getContentOverrides } from "@/lib/flags";

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
  // Admin "Site Content" overrides (DB) win over the built-in i18n for any key that
  // has a non-empty value in the current locale. Falls through to the normal
  // locale -> default-locale -> raw-key chain when there is no override. This only
  // affects SERVER-rendered text (server components call getT); client components
  // import `messages` directly and are unaffected (documented v1 scope).
  const overrides = await getContentOverrides();
  return (key: string) => {
    const o = overrides[key];
    if (o) {
      const v = o[locale];
      if (v && v.trim()) return v;
    }
    return dict[key] ?? fallback[key] ?? key;
  };
}
