"use client";

import { localeNames, locales, type Locale } from "@/i18n/config";

// Sets a locale cookie and reloads so server components re-render in the new language.
export function LanguageSwitcher({ current }: { current: Locale }) {
  function choose(l: Locale) {
    document.cookie = `locale=${l}; path=/; max-age=31536000`;
    location.reload();
  }
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-btn${l === current ? " active" : ""}`}
          onClick={() => choose(l)}
        >
          {localeNames[l]}
        </button>
      ))}
    </div>
  );
}
