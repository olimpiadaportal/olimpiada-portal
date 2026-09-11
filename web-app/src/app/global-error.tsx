"use client";

// ROOT error boundary — the only boundary that catches a failure in the root
// layout itself, which is why it has to render its own <html> and <body>.
//
// For a CLIENT-side crash above the normal boundary this is the only way the
// failure reaches Sentry. For a SERVER-side one it is not: `@sentry/nextjs`
// already hooks those through `onRequestError` in `src/instrumentation.ts`,
// which is why the effect below reports only errors that carry no `digest`.
//
// Styling is self-contained on purpose. `app/globals.css` is imported by the
// root layout, and the root layout is precisely what has failed by the time
// this renders — so the few rules needed are inlined, with a
// `prefers-color-scheme` block instead of the usual `data-theme` tokens for the
// same reason: the server-rendered `data-theme` attribute comes from the layout
// that is gone.
//
// Strings are inline and trilingual (house rule: az/en/ru in the same change),
// read from the `locale` cookie exactly like `src/app/error.tsx` — the
// I18nProvider cannot be trusted here, and importing the full catalogue would
// drag it into this boundary's client bundle.
import { useEffect } from "react";
import { captureBrowserException } from "@/lib/observability/browserSentry";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

const STRINGS: Record<Locale, { title: string; desc: string; retry: string }> = {
  az: {
    title: "Xəta baş verdi",
    desc: "Gözlənilməz xəta baş verdi. Zəhmət olmasa səhifəni yeniləyin.",
    retry: "Yenidən cəhd et",
  },
  en: {
    title: "Something went wrong",
    desc: "An unexpected error occurred. Please reload the page.",
    retry: "Try again",
  },
  ru: {
    title: "Что-то пошло не так",
    desc: "Произошла непредвиденная ошибка. Пожалуйста, обновите страницу.",
    retry: "Повторить",
  },
};

function currentLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const m = document.cookie.match(/(?:^|; )locale=([^;]+)/);
  const v = m?.[1];
  if (v && (locales as readonly string[]).includes(v)) return v as Locale;
  return defaultLocale;
}

const CSS = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #fffbf5;
    color: #2a1a3e;
    font-family: Arial, Helvetica, "Segoe UI", system-ui, sans-serif;
  }
  .box { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { color: #9a8aa8; margin: 0 0 1.25rem; }
  button {
    font: inherit;
    padding: 0.625rem 1.25rem;
    border: 0;
    border-radius: 14px;
    background: #7c3aed;
    color: #ffffff;
    cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0e1a; color: #eef3ff; }
    p { color: #8b99c0; }
  }
`;

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
    // `src/instrumentation.ts`; capturing it again here would file the same
    // failure twice against an allowance of 5,000 a month that cannot be topped
    // up — and would do it precisely when the app is broken and throwing most.
    //
    // `error.digest` is how the two are told apart. Next.js attaches a digest
    // ONLY to errors that crossed the server boundary (it is the hash printed in
    // the server log so a client report can be matched to it); an error thrown in
    // the browser during render arrives here with no digest. So: no digest means
    // nobody else has reported this one.
    //
    // The scrubber in `sentryOptions.beforeSend` runs on whatever this does send,
    // like any other event — message, stack and URL are all redacted before it
    // leaves the browser. The capture goes through `captureBrowserException`,
    // which fetches the SDK on demand: this boundary renders on public pages
    // too, where the 161.7 KB SDK is deliberately not loaded, and the chunk is
    // pulled in only at the moment a page has actually crashed.
    if (error.digest) return;
    captureBrowserException(error);
  }, [error]);

  const locale = currentLocale();
  const s = STRINGS[locale] ?? STRINGS[defaultLocale];

  return (
    <html lang={locale}>
      <body>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="box">
          <h1>{s.title}</h1>
          <p>{s.desc}</p>
          <button onClick={() => reset()}>{s.retry}</button>
        </div>
      </body>
    </html>
  );
}
