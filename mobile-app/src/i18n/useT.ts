// The app-facing translator hook: current locale + the two DATABASE text
// layers → t(key). Mirrors the web's override-aware getT()/useT(): the admin
// "Website Content" CMS wins, then the admin-managed subject display names
// (subject_translations, migration 171 — the layer that makes a subject rename
// visible in the app at all), then the mobile overlay, then the synced web
// catalog, then az.
//
// Both DB layers are React Query reads with their own cache; while either is
// in flight or has failed, t() falls through to the bundled catalog, so a
// screen never renders a blank label waiting for the network.
import { useMemo } from "react";
import { createT, useLocaleStore, type Locale } from "./index";
import { useContentOverrides, useSubjectNames } from "@/lib/configQueries";

export function useT(): { t: (key: string) => string; locale: Locale } {
  const locale = useLocaleStore((s) => s.locale);
  const overrides = useContentOverrides(locale);
  const subjectNames = useSubjectNames(locale);
  const t = useMemo(
    () => createT(locale, overrides.data ?? null, subjectNames.data ?? null),
    [locale, overrides.data, subjectNames.data],
  );
  return { t, locale };
}
