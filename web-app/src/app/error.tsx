"use client";

// Client error boundary. It can render when the tree ABOVE it (including the
// I18nProvider) has failed, so it cannot use the provider — and importing the
// full trilingual catalog here would pull it into the client bundle (M21).
// It therefore keeps its three small strings inline (az/en/ru) and reads the
// locale cookie directly.
import { defaultLocale, locales, type Locale } from "@/i18n/config";

const STRINGS: Record<Locale, { title: string; desc: string; retry: string }> = {
  az: {
    title: "Xəta baş verdi",
    desc: "Gözlənilməz xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.",
    retry: "Yenidən cəhd et",
  },
  en: {
    title: "Something went wrong",
    desc: "An unexpected error occurred. Please try again.",
    retry: "Try again",
  },
  ru: {
    title: "Что-то пошло не так",
    desc: "Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.",
    retry: "Повторить",
  },
};

function currentStrings() {
  let loc: Locale = defaultLocale;
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
    const v = m?.[1];
    if (v && (locales as readonly string[]).includes(v)) loc = v as Locale;
  }
  return STRINGS[loc] ?? STRINGS[defaultLocale];
}

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const s = currentStrings();
  return (
    <div className="container">
      <h1>{s.title}</h1>
      <p className="muted">{s.desc}</p>
      <button onClick={() => reset()}>{s.retry}</button>
    </div>
  );
}
