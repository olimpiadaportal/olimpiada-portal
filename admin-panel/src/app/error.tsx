"use client";

// ROOT SEGMENT error boundary — and it REPORTS, which is the whole point of the
// effect below.
//
// THIS FILE, NOT `global-error.tsx`, IS WHAT REACT ACTUALLY REACHES when a
// component throws during render on any admin page. `global-error.tsx` only
// catches a failure in the ROOT LAYOUT, so it never fires for the ordinary case
// of a crashed screen. While this boundary captured nothing, a React render
// crash in the panel — the Accounts table blanking out, a bulk-import screen
// refusing to draw — was completely invisible, and a render crash is the single
// most common client-side failure there is. The web app had the identical hole
// in `web-app/src/app/error.tsx`; both were closed in the same round.
//
// The browser SDK is already initialised here by `src/instrumentation-client.ts`
// (unlike the web app, this panel has no public pages to withhold it from), so
// this is a plain static import rather than a lazy fetch.
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

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
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ONE FAILURE, ONE OCCURRENCE — the same rule as `global-error.tsx`, and the
    // reason the digest is checked rather than everything being captured.
    // Next.js attaches `digest` ONLY to an error that crossed the server
    // boundary; `onRequestError` in `src/instrumentation.ts` has already filed
    // that one. An error thrown in the BROWSER during render arrives here with
    // no digest, and nobody else has seen it.
    //
    // Whatever this does send still passes through the scrubber and the budget
    // in `budgetedBeforeSend` like every other event.
    if (error.digest) return;
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="standalone">
      <h1>{t("error.title")}</h1>
      <p className="muted">{t("error.desc")}</p>
      <button className="btn" onClick={() => reset()}>
        {t("action.retry")}
      </button>
    </div>
  );
}
