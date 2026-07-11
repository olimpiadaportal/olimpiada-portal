// The app-facing translator hook: current locale + CMS overrides → t(key).
// Mirrors the web's override-aware getT()/useT(): the admin "Website Content"
// CMS wins, then the mobile overlay, then the synced web catalog, then az.
import { useMemo } from "react";
import { createT, useLocaleStore, type Locale } from "./index";
import { useContentOverrides } from "@/lib/configQueries";

export function useT(): { t: (key: string) => string; locale: Locale } {
  const locale = useLocaleStore((s) => s.locale);
  const overrides = useContentOverrides(locale);
  const t = useMemo(
    () => createT(locale, overrides.data ?? null),
    [locale, overrides.data],
  );
  return { t, locale };
}
