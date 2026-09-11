"use client";

// =====================================================================
// ROOT ERROR BOUNDARY — ADMIN PANEL
//
// app/error.tsx only catches failures BELOW the root layout. When the root
// layout itself throws, React unmounts everything and Next renders this file
// instead — which is why it must supply its own <html> and <body>, and why it
// is the only place a root-layout crash can be reported from.
//
// TWO DELIBERATE DEPARTURES from app/error.tsx:
//
// 1. THE STRINGS ARE INLINE, not read from @/i18n/messages. That catalog is
//    ~390 KB and this boundary is in the client bundle; more importantly it
//    can render at a moment when module initialisation is exactly what
//    failed, so it must not depend on another module to produce text. The
//    trilingual house rule is met by carrying az/en/ru here (identical copy
//    to the error.* keys in messages.ts — keep them in step if either moves).
//
// 2. THERE ARE NO CLASS NAMES. globals.css is imported by the root layout,
//    which by definition did not render. Styling is inline so the page still
//    looks like something rather than unstyled text on white.
// =====================================================================

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

const locales = ["az", "en", "ru"] as const;
type Locale = (typeof locales)[number];

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

function readLocale(): Locale {
  if (typeof document === "undefined") return "az";
  const match = document.cookie.match(/(?:^|; )locale=([^;]+)/);
  const value = match?.[1];
  return value && (locales as readonly string[]).includes(value)
    ? (value as Locale)
    : "az";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ONE FAILURE, ONE OCCURRENCE. A crash that happened while the SERVER was
    // rendering has already been reported by `onRequestError` in
    // src/instrumentation.ts; capturing it again here would bill the same
    // failure twice against an allowance of 5,000 a month for the whole org
    // that cannot be topped up — and would do it exactly when the app is broken
    // and throwing most.
    //
    // `error.digest` is what tells the two apart: Next.js attaches a digest
    // ONLY to errors that crossed the server boundary (it is the hash printed
    // in the server log), so an error thrown in the browser during render
    // arrives here without one. No digest means nobody else has filed it.
    //
    // The digest is also deliberately not attached as extra context:
    // scrubEvent() deletes event.extra wholesale, so it would be dropped
    // anyway, and the digest is already in the Vercel log if it is ever needed.
    if (error.digest) return;
    Sentry.captureException(error);
  }, [error]);

  const locale = readLocale();
  const t = STRINGS[locale];

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f6f7f9",
          color: "#1b1f24",
          fontFamily: 'Arial, Helvetica, "Segoe UI", system-ui, sans-serif',
        }}
      >
        <main
          style={{
            maxWidth: "440px",
            width: "100%",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e3e6ea",
            borderRadius: "14px",
            padding: "32px 28px",
          }}
        >
          <h1 style={{ margin: "0 0 10px", fontSize: "20px", lineHeight: 1.3 }}>
            {t.title}
          </h1>
          <p style={{ margin: "0 0 22px", fontSize: "14px", color: "#5b6570" }}>
            {t.desc}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: "none",
              border: "1px solid #1b1f24",
              borderRadius: "10px",
              background: "#1b1f24",
              color: "#ffffff",
              padding: "10px 18px",
              fontSize: "14px",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {t.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
