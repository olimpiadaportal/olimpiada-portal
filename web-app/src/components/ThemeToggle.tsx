"use client";

import { useEffect, useState } from "react";
import { messages } from "@/i18n/messages";
import { defaultLocale, type Locale } from "@/i18n/config";

type Theme = "dark" | "light";

const STORAGE_KEY = "theme";

function tr(locale: Locale, key: string): string {
  return messages[locale]?.[key] ?? messages[defaultLocale][key] ?? key;
}

function getInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme;
    if (attr === "light" || attr === "dark") return attr;
  }
  return "dark";
}

/**
 * Theme toggle for the web-app topbar.
 *
 * Mechanism (must match the no-flash script in layout.tsx and globals.css):
 *  - source of truth: `data-theme` attribute on <html> ("dark" | "light")
 *  - persisted in localStorage under key "theme"
 *  - DARK is the default (the reference design is dark)
 */
export function ThemeToggle({ locale }: { locale: Locale }) {
  // Start null so SSR and first client render agree (no hydration mismatch);
  // resolve the real theme after mount from the DOM the no-flash script set.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  function toggle() {
    const next: Theme = (theme ?? getInitialTheme()) === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); attribute still applies.
    }
    setTheme(next);
  }

  // While unresolved, render the dark-default affordance so markup is stable.
  const isDark = (theme ?? "dark") === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={tr(locale, "theme.toggle")}
      title={tr(locale, isDark ? "theme.light" : "theme.dark")}
    >
      {isDark ? (
        // Sun: clicking switches TO light.
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Moon: clicking switches TO dark.
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
