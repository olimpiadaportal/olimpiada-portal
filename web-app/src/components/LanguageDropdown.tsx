"use client";

import { useEffect, useRef, useState } from "react";
import { localeNames, locales, type Locale } from "@/i18n/config";

/**
 * Language dropdown for the app navbars.
 *
 * A proper dropdown (not a row of buttons): the trigger (.lang-dd-btn) shows
 * the current language name + a caret; clicking opens a menu (.lang-dd-menu)
 * listing az/en/ru (.lang-dd-item; the current one gets .active). Choosing a
 * language sets the `locale` cookie and reloads so server components re-render
 * in the new language — same mechanism as LanguageSwitcher.
 *
 * Closes on outside click / Escape. Accessible: the trigger uses
 * aria-haspopup + aria-expanded; the menu uses role="menu" with
 * role="menuitem" items.
 */
export function LanguageDropdown({
  current,
  available,
}: {
  current: Locale;
  // Admin-enabled locales (platform.supported_locales). Omitted → offer all.
  available?: Locale[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = available && available.length > 0 ? available : [...locales];

  function choose(l: Locale) {
    document.cookie = `locale=${l}; path=/; max-age=31536000`;
    location.reload();
  }

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="lang-dd" ref={rootRef}>
      <button
        type="button"
        className="lang-dd-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{localeNames[current]}</span>
        <svg
          className="lang-dd-caret"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="lang-dd-menu" role="menu">
          {options.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              className={`lang-dd-item${l === current ? " active" : ""}`}
              aria-current={l === current ? "true" : undefined}
              onClick={() => choose(l)}
            >
              {localeNames[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Segmented language control — [AZ] [EN] [RU] side-by-side buttons, used
 * inside the account drawers on desktop (the dropdown above stays the
 * compact/default control for the public navbar and the drawers' mobile
 * variant). Same mechanism as the dropdown: choosing a locale writes the
 * `locale` cookie and reloads so server components re-render in the new
 * language. Renders only the admin-enabled locales when `available` is given.
 */
export function LanguageSegmented({
  current,
  available,
}: {
  current: Locale;
  // Admin-enabled locales (platform.supported_locales). Omitted → offer all.
  available?: Locale[];
}) {
  const options = available && available.length > 0 ? available : [...locales];

  function choose(l: Locale) {
    if (l === current) return;
    document.cookie = `locale=${l}; path=/; max-age=31536000`;
    location.reload();
  }

  return (
    <div className="seg-group seg-lang" role="group">
      {options.map((l) => (
        <button
          key={l}
          type="button"
          className={`seg-btn${l === current ? " active" : ""}`}
          aria-pressed={l === current}
          aria-label={localeNames[l]}
          title={localeNames[l]}
          onClick={() => choose(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
