// =====================================================================
// SENTRY — ADMIN PANEL, BROWSER
//
// Next.js loads this file on the client automatically (the App Router
// `instrumentation-client` convention). It is NOT a wizard-generated file:
// every option here was chosen against this product's constraint, which is
// that the pages this code runs on are rendering MINORS' PERSONAL DATA —
// names, 8-digit login ids, schools, grades — plus parent emails and phone
// numbers, to a member of staff.
//
// See src/lib/sentry/options.ts for why `dataCollection` is used instead of
// the deprecated `sendDefaultPii`, and why every field is written out.
// =====================================================================
import * as Sentry from "@sentry/nextjs";

import { DENIED_URLS, IGNORED_ERRORS, scrubBreadcrumb } from "@/lib/sentry/scrub";
import {
  BROWSER_TRANSPORT_IGNORED_ERRORS,
  budgetedBeforeSend,
  SENTRY_DATA_COLLECTION,
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_ERROR_SAMPLE_RATE,
} from "@/lib/sentry/options";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  // Derived once in options.ts from Vercel's own NEXT_PUBLIC_VERCEL_ENV, which
  // Vercel supplies for Next.js projects — not a variable anyone creates.
  // Undefined locally, where the SDK is disabled anyway.
  environment: SENTRY_ENVIRONMENT,

  // --- Quota ---------------------------------------------------------
  // NO tracesSampleRate here either, and no replay rates below: absent, not
  // zero. `hasSpansEnabled()` tests `!= null` and zero is not nullish, so a
  // literal 0 starts the span machinery on every navigation and suppresses only
  // the sending.
  //
  // FULL RATE, AND THE 0.25 THAT WAS HERE IS GONE. sampleRate runs AFTER
  // beforeSend, so the two mechanisms stacked badly: the budget was charged for
  // events the sampler then discarded, and a one-off admin error — the single
  // occurrence the operator is asking about — had a 75% chance of vanishing.
  // budgetedBeforeSend is the one mechanism now: deterministic, keeps the FIRST
  // occurrence, and bounds the repeating fault a sampler cannot outrun.
  sampleRate: SENTRY_ERROR_SAMPLE_RATE,

  // --- Privacy -------------------------------------------------------
  dataCollection: SENTRY_DATA_COLLECTION,

  // SESSION REPLAY IS OFF AND MUST STAY OFF.
  //
  // Replay records the DOM. On this app that is a video of a staff member
  // reading a child's name, school and 8-digit id, and no scrubber above can
  // undo it.
  //
  // THE RATES ARE NOT WRITTEN AS ZERO ANY MORE — they are not written at all,
  // which is stronger. A sample-rate key that EXISTS is what tells the SDK the
  // feature is configured; `0` only tells it to send none of what it has already
  // recorded. No replayIntegration is added either, and neither should ever be:
  // this is the one setting whose accidental re-enablement cannot be undone
  // afterwards.
  //
  // It is also why next.config.mjs needs no `worker-src blob:` in the CSP.
  // If Replay is ever switched on, that CSP gap is the tripwire.

  // --- Noise ---------------------------------------------------------
  // THE BROWSER IGNORES EVERY TRANSPORT SHAPE, and the server and edge configs
  // now ignore NONE of them — the lists are deliberately different per runtime.
  // A failed request in a staff member's tab is their wifi; the identical text
  // out of a Server Action means the panel cannot reach its database. See
  // options.ts. The undici shapes below are unreachable in a browser and cost
  // nothing, and keeping them makes the browser's rule total rather than
  // engine-dependent.
  ignoreErrors: [...IGNORED_ERRORS, ...BROWSER_TRANSPORT_IGNORED_ERRORS],
  denyUrls: DENIED_URLS,

  integrations: (defaults) => [
    ...defaults.filter(
      (integration) =>
        integration.name !== "Breadcrumbs" && integration.name !== "BrowserSession",
    ),
    // console: false — console.error breadcrumbs can carry Postgres text, and
    //   Postgres puts the colliding VALUE in a unique-violation DETAIL.
    // dom: false — the DOM breadcrumb records the clicked element's selector,
    //   including aria-label/title text. In THIS panel a button's accessible
    //   name is routinely a child's name.
    // fetch/xhr/history stay on: they are the trail that makes an error
    //   diagnosable, and their URLs are collapsed by scrubUrl().
    Sentry.breadcrumbsIntegration({ console: false, dom: false }),
  ],
  // BrowserSession removed above: release-health sessions are a second
  // envelope stream out of a page showing family data, bought nothing here,
  // and are not worth the egress.

  // --- Last gate: scrub, then budget, or drop ------------------------
  beforeSend: (event) => budgetedBeforeSend(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});

// NO `onRouterTransitionStart` EXPORT. It exists only to open navigation
// SPANS, and tracing is off — `tracesSampleRate` is written nowhere, and
// `webpack.treeshake.removeTracing` in next.config.mjs removes the tracing code
// from the bundle outright. Exporting it would add a hook that can never produce
// anything. Add it in the same change that turns tracing on, not before.
