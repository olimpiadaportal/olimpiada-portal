"use client";

import { messages } from "@/i18n/messages";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

// Client error boundary: read the locale cookie directly (no server context here).
function t(key: string): string {
  let loc: Locale = defaultLocale;
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
    const v = m?.[1];
    if (v && (locales as readonly string[]).includes(v)) loc = v as Locale;
  }
  return messages[loc][key] ?? messages[defaultLocale][key] ?? key;
}

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container">
      <h1>{t("error.title")}</h1>
      <p className="muted">{t("error.desc")}</p>
      <button onClick={() => reset()}>{t("action.retry")}</button>
    </div>
  );
}
