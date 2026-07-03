"use client";

import { useEffect, useState } from "react";
import { messages } from "@/i18n/messages";
import { defaultLocale, type Locale } from "@/i18n/config";

type Theme = "dark" | "light";

const STORAGE_KEY = "theme";

function tr(locale: Locale, key: string): string {
  return messages[locale]?.[key] ?? messages[defaultLocale][key] ?? key;
}

// First catalog string that actually exists among `keys`, else `fallback`.
// Lets the segmented variant prefer the drawer2.* strings once they are merged
// into the catalog while degrading gracefully to the older theme.* strings.
export function trFirst(
  locale: Locale,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const v = messages[locale]?.[key] ?? messages[defaultLocale]?.[key];
    if (v) return v;
  }
  return fallback;
}

function getInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme;
    if (attr === "light" || attr === "dark") return attr;
  }
  return "dark";
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// Small check drawn on the ACTIVE segment (visibility handled by .seg-check CSS).
function CheckIcon() {
  return (
    <svg
      className="seg-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Theme control for the web-app.
 *
 * Mechanism (must match the no-flash script in layout.tsx and globals.css):
 *  - source of truth: `data-theme` attribute on <html> ("dark" | "light")
 *  - persisted in localStorage under key "theme"
 *  - DARK is the default (the reference design is dark)
 *
 * Variants:
 *  - "icon" (default) — the original compact round toggle button. Used by the
 *    public navbar; its rendering and behavior are unchanged.
 *  - "segmented" — opt-in side-by-side [Light][Dark] buttons with sun/moon
 *    icons, used inside the account drawers. Same mechanism, explicit choice.
 */
export function ThemeToggle({
  locale,
  variant = "icon",
  labels,
}: {
  locale: Locale;
  /** Opt-in drawer rendering; omit for the original compact icon button. */
  variant?: "icon" | "segmented";
  /** Pre-translated labels for the segmented variant (server-resolved). */
  labels?: { light?: string; dark?: string };
}) {
  // Start null so SSR and first client render agree (no hydration mismatch);
  // resolve the real theme after mount from the DOM the no-flash script set.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); attribute still applies.
    }
    setTheme(next);
  }

  function toggle() {
    apply((theme ?? getInitialTheme()) === "dark" ? "light" : "dark");
  }

  // While unresolved, render the dark-default affordance so markup is stable.
  const isDark = (theme ?? "dark") === "dark";

  if (variant === "segmented") {
    const lightLabel =
      labels?.light ?? trFirst(locale, ["drawer2.themeLight", "theme.light"], "Light");
    const darkLabel =
      labels?.dark ?? trFirst(locale, ["drawer2.themeDark", "theme.dark"], "Dark");
    return (
      <div
        className="seg-group seg-theme"
        role="group"
        aria-label={tr(locale, "theme.toggle")}
      >
        <button
          type="button"
          className={`seg-btn${!isDark ? " active" : ""}`}
          aria-pressed={!isDark}
          onClick={() => apply("light")}
        >
          <SunIcon />
          <span>{lightLabel}</span>
          <CheckIcon />
        </button>
        <button
          type="button"
          className={`seg-btn${isDark ? " active" : ""}`}
          aria-pressed={isDark}
          onClick={() => apply("dark")}
        >
          <MoonIcon />
          <span>{darkLabel}</span>
          <CheckIcon />
        </button>
      </div>
    );
  }

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
        <SunIcon />
      ) : (
        // Moon: clicking switches TO dark.
        <MoonIcon />
      )}
    </button>
  );
}
