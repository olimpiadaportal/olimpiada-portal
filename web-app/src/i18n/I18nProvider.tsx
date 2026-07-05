"use client";

// Client-side i18n provider so CLIENT components can read admin "Website Content"
// text overrides (previously only the server getT() applied them). The server
// resolves the current locale + the small set of DB overrides for that locale and
// passes them here; the provider merges them over the bundled `messages[locale]`.
//
// Most client components already receive a server-resolved `dict` prop (which is
// override-aware because the server builds it via getT()). This provider closes
// the remaining gap for components that translate on the client (ThemeToggle, the
// account drawers) and lets any future client component be override-aware via useT().
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { messages } from "./messages";
import { defaultLocale, type Locale } from "./config";

type I18nValue = { locale: Locale; dict: Record<string, string> };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  overrides,
  children,
}: {
  locale: Locale;
  /** DB text overrides for the CURRENT locale only (key -> text). Small. */
  overrides: Record<string, string>;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const base = messages[locale] ?? messages[defaultLocale];
    const dict =
      overrides && Object.keys(overrides).length ? { ...base, ...overrides } : base;
    return { locale, dict };
  }, [locale, overrides]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  // Fallback keeps translation working even if a component is (mis)used outside a
  // provider — degrades to the default-locale catalog, never throws.
  return useContext(I18nContext) ?? { locale: defaultLocale, dict: messages[defaultLocale] };
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
