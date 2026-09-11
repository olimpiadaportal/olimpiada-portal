// i18n runtime. Resolution chain (web getT()/I18nProvider parity):
//   CMS override (site_content via get_mobile_content) → admin-managed subject
//   names (subject_translations, `subj.db.<code>`) → mobile overlay → synced
//   web catalog → az fallback → the raw key.
// The locale is clamped to the admin-enabled set from get_mobile_config().
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { getLocales } from "expo-localization";
import { messages, type Locale } from "./messages.generated";
import { mobileMessages } from "./messages.mobile";

export type { Locale };
export const locales: Locale[] = ["az", "en", "ru"];
export const defaultLocale: Locale = "az";

export function isLocale(v: unknown): v is Locale {
  return v === "az" || v === "en" || v === "ru";
}

/** Clamp a candidate locale to the admin-supported set (config-driven). */
export function clampLocale(
  candidate: string | null | undefined,
  supported: string[],
  fallback: string = defaultLocale,
): Locale {
  const sup = supported.filter(isLocale);
  if (candidate && isLocale(candidate) && (sup.length === 0 || sup.includes(candidate))) {
    return candidate;
  }
  if (isLocale(fallback) && (sup.length === 0 || sup.includes(fallback))) return fallback;
  return sup[0] ?? defaultLocale;
}

/**
 * Build a translator for one locale with the two DATABASE layers on top of the
 * bundled catalogs.
 *
 * `overrides` is the site_content CMS (any key). `subjectNames` is the
 * admin-managed subject display names from subject_translations, published
 * under their own `subj.db.<code>` namespace (migration 171) — a namespace the
 * bundled catalogs do not use at all, so this layer EXTENDS the dictionary
 * rather than shadowing it, and subjectLabel() reads it before `subj.<code>`.
 * Both layers are optional and both degrade to "absent": a failed fetch means
 * the bundled catalog renders, never a blank label.
 */
export function createT(
  locale: Locale,
  overrides?: Record<string, string> | null,
  subjectNames?: Record<string, string> | null,
): (key: string) => string {
  return (key: string) => {
    const o = overrides?.[key];
    if (o && o.length > 0) return o;
    const s = subjectNames?.[key];
    if (s && s.length > 0) return s;
    return (
      mobileMessages[locale]?.[key] ??
      messages[locale]?.[key] ??
      mobileMessages[defaultLocale]?.[key] ??
      messages[defaultLocale]?.[key] ??
      key
    );
  };
}

// ---- locale store (persisted; device language as the first-run default) ----

const STORE_KEY = "olympiq.locale";

function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? "";
  return isLocale(tag) ? tag : defaultLocale;
}

type LocaleState = {
  locale: Locale;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (l: Locale) => void;
};

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: defaultLocale,
  hydrated: false,
  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(STORE_KEY);
      set({ locale: isLocale(saved) ? saved : deviceLocale(), hydrated: true });
    } catch {
      set({ locale: deviceLocale(), hydrated: true });
    }
  },
  setLocale: (l) => {
    set({ locale: l });
    SecureStore.setItemAsync(STORE_KEY, l).catch(() => {});
  },
}));
