"use client";

// Client error boundary. It can render when the tree ABOVE it (including the
// I18nProvider) has failed, so it cannot use the provider — and importing the
// full trilingual catalog here would pull it into the client bundle (M21).
// It therefore keeps its three small strings inline (az/en/ru) and reads the
// locale cookie directly.
//
// IT ALSO REPORTS, AND THAT IS THE POINT OF THE EFFECT BELOW. This is the root
// SEGMENT boundary — the one React actually reaches when a component throws
// during render on any page. `global-error.tsx` is NOT that boundary: it only
// catches a failure in the ROOT LAYOUT, so it never fires for the ordinary case
// of a crashed page. While this file reported nothing, a React render crash on
// an authenticated page — a parent's dashboard blanking out, a child's exam
// refusing to draw — was completely invisible, which is the single most common
// client-side failure there is.
import { useEffect } from "react";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { captureBrowserException } from "@/lib/observability/browserSentry";

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
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ONE FAILURE, ONE OCCURRENCE — the same rule as global-error.tsx, and the
    // reason the digest is checked rather than everything being captured.
    // Next.js attaches `digest` ONLY to an error that crossed the server
    // boundary; `onRequestError` in src/instrumentation.ts has already filed
    // that one. An error thrown in the BROWSER during render arrives here with
    // no digest, and nobody else has seen it.
    //
    // `captureBrowserException` fetches the SDK on demand, so a marketing page
    // that never downloads the 161.7 KB still reports the crash that broke it,
    // and the scrubber and the budget in `sentryOptions.beforeSend` apply to
    // what it sends exactly as they do to every other event.
    if (error.digest) return;
    captureBrowserException(error);
  }, [error]);

  const s = currentStrings();
  return (
    <div className="container">
      <h1>{s.title}</h1>
      <p className="muted">{s.desc}</p>
      <button onClick={() => reset()}>{s.retry}</button>
    </div>
  );
}
