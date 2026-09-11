// =====================================================================
// SENTRY — ADMIN PANEL, EDGE RUNTIME
//
// Loaded from src/instrumentation.ts when NEXT_RUNTIME === "edge". In this
// app that is src/middleware.ts, which runs on EVERY request: it refreshes
// the Supabase session and enforces the 30-minute idle logout.
//
// That makes the edge runtime the highest-frequency surface in the panel and
// therefore the likeliest place for a loop to burn the org-wide 5,000/month
// allowance. It keeps the same 0.25 sample rate as the server runtime, and
// the per-DSN rate limit in the Sentry UI is the hard cap above it.
//
// Middleware also touches the auth COOKIE on every request, which is why
// `cookies: false` in the shared dataCollection block matters here most.
// =====================================================================
import * as Sentry from "@sentry/nextjs";

import { DENIED_URLS, scrubBreadcrumb } from "@/lib/sentry/scrub";
import {
  budgetedBeforeSend,
  SENTRY_DATA_COLLECTION,
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_ERROR_SAMPLE_RATE,
  SERVER_IGNORED_ERRORS,
} from "@/lib/sentry/options";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: SENTRY_ENVIRONMENT,

  // --- Quota ---------------------------------------------------------
  // NO tracesSampleRate: absent, not zero. `hasSpansEnabled()` tests
  // `!= null`, so a literal 0 enables the span machinery and suppresses only
  // the sending — on middleware that runs for EVERY request, that is the most
  // expensive place in the app to pay for work nobody reads. See options.ts.
  //
  // The deterministic ceiling is budgetedBeforeSend, and since the 0.25
  // sampleRate was removed it is the ONLY ceiling: middleware is the
  // highest-frequency surface in the panel, so a fault here is the likeliest
  // one to repeat thousands of times, and the per-issue-per-hour line is what
  // actually bounds it. A sampler could not have — it runs after this hook, so
  // it was charging the budget for events it then threw away.
  sampleRate: SENTRY_ERROR_SAMPLE_RATE,

  // --- Privacy -------------------------------------------------------
  dataCollection: SENTRY_DATA_COLLECTION,

  // --- Noise ---------------------------------------------------------
  // THE SERVER LIST — the edge runtime is a SERVER runtime, whatever its fetch
  // implementation is called. Middleware calls Supabase on every request, so a
  // failed connection here is the panel being unable to authenticate anyone,
  // not somebody's wifi; nothing describing one is ignored. budgetedBeforeSend
  // collapses the class onto a single fingerprint so an outage costs three
  // events an hour rather than one per request.
  //
  // No dedupeIntegration is added here, unlike sentry.server.config.ts:
  // @sentry/vercel-edge already lists dedupeIntegration() FIRST in its own
  // defaults (build/cjs/index.js). @sentry/node-core is the one that does not.
  ignoreErrors: SERVER_IGNORED_ERRORS,
  denyUrls: DENIED_URLS,

  // --- Last gate: scrub, then budget, or drop ------------------------
  beforeSend: (event) => budgetedBeforeSend(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});
