"use client";

// Client-side i18n provider so CLIENT components can read admin "Website Content"
// text overrides (previously only the server getT() applied them).
//
// M21: the provider receives the ALREADY-MERGED single-locale dictionary as a
// prop — the server (src/app/layout.tsx) builds messages[locale] merged over
// the default-locale fallback plus the DB overrides for the current locale.
// The full trilingual catalog is therefore never imported client-side and
// never ships in the client bundle.
//
// Most client components already receive a server-resolved `dict` prop (which is
// override-aware because the server builds it via getT()). This provider closes
// the remaining gap for components that translate on the client (ThemeToggle, the
// account drawers) and lets any future client component be override-aware via useT().
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { defaultLocale, type Locale } from "./config";

type I18nValue = { locale: Locale; dict: Record<string, string> };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  /** Server-built, ALREADY-MERGED single-locale dictionary (catalog + overrides). */
  dict: Record<string, string>;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  // Fallback keeps rendering working even if a component is (mis)used outside a
  // provider — t(key) degrades to returning the key, never throws.
  return useContext(I18nContext) ?? { locale: defaultLocale, dict: {} };
}

/** `t(key)` — override-aware translation for client components. */
export function useT(): (key: string) => string {
  const { dict } = useI18n();
  return (key: string) => dict[key] ?? key;
}

/** First existing catalog string among `keys`, else `fallback` (override-aware). */
export function useTFirst(): (keys: string[], fallback: string) => string {
  const { dict } = useI18n();
  return (keys: string[], fallback: string) => {
    for (const k of keys) {
      const v = dict[k];
      if (v) return v;
    }
    return fallback;
  };
}

export function useLocale(): Locale {
  return useI18n().locale;
}
