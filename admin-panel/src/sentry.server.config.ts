// =====================================================================
// SENTRY — ADMIN PANEL, NODE SERVER RUNTIME
//
// Loaded from src/instrumentation.ts when NEXT_RUNTIME === "nodejs". This is
// the runtime that holds the SERVICE-ROLE Supabase client, runs every
// audited Server Action, builds the Accounts export workbook and parses bulk
// question imports — i.e. the runtime with both the secrets and the family
// data in scope.
//
// See src/lib/sentry/options.ts for why `dataCollection` (not the deprecated
// `sendDefaultPii`) is the option written here, and why every one of its
// fields is spelled out.
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
  // NO tracesSampleRate. Not 0 — ABSENT. hasSpansEnabled() tests `!= null`,
  // and zero is not nullish, so writing 0 starts the span machinery on every
  // request and suppresses only the sending. See options.ts.
  //
  // FULL RATE, AND THE 0.25 THAT WAS HERE IS GONE. sampleRate runs AFTER
  // beforeSend, so the two stacked badly: the budget was charged for events the
  // sampler then discarded, and a one-off failure — an import that threw once —
  // had a 75% chance of vanishing. budgetedBeforeSend is the only mechanism
  // now: deterministic, it keeps the FIRST occurrence, and it bounds the
  // repeating fault that a sampler can never outrun.
  sampleRate: SENTRY_ERROR_SAMPLE_RATE,

  // --- Privacy -------------------------------------------------------
  dataCollection: SENTRY_DATA_COLLECTION,

  // --- Noise ---------------------------------------------------------
  // THE SERVER LIST, WHICH IS NOT THE BROWSER'S. Nothing describing a failed
  // connection is in it, and the omission is the fix: `TypeError: fetch failed`
  // is what @supabase/supabase-js throws when Supabase is unreachable, and
  // while both runtimes shared one list that entire class of incident produced
  // ZERO events. It is reported here instead, collapsed onto one fingerprint by
  // budgetedBeforeSend so an outage costs three events an hour. See options.ts.
  ignoreErrors: SERVER_IGNORED_ERRORS,
  denyUrls: DENIED_URLS,

  // CONSOLE CAPTURE IS REMOVED, NOT CONFIGURED.
  //
  // @sentry/node's default integration set includes `consoleIntegration`,
  // which turns every console.* call into a breadcrumb. This app has ~186
  // console.error sites and several log a Supabase `error.message`; Postgres
  // embeds the offending VALUE in a unique-violation DETAIL, so those
  // messages can carry a child_unique_id or the synthetic child login
  // address. beforeBreadcrumb drops console breadcrumbs as well — this is
  // the cheaper of the two, applied first, and the filter is the backstop.
  //
  // NOT ADDED, deliberately, and each for its own reason:
  //   * captureConsoleIntegration — would promote those 186 sites from
  //     breadcrumbs to ISSUES, i.e. 186 potential quota drains.
  //   * supabaseIntegration — NOT in the 10.74.0 defaults (verified). It
  //     captures query text and parameters, which is the family data itself.
  //
  // DEDUPE IS ADDED BY HAND, AND ONLY HERE. Verified in the installed
  // packages: @sentry/vercel-edge lists dedupeIntegration() FIRST in its
  // defaults and the browser SDK has it too, but @sentry/node-core does NOT
  // (build/cjs/sdk/index.js). Node was therefore the one runtime where the
  // identical error thrown twice in a row counted twice against a quota that
  // cannot be topped up — and Node is where a retry loop repeats hardest.
  // Dedupe only catches the immediately-preceding duplicate, so it is a cheap
  // first line and not the cap; the cap is budgetedBeforeSend.
  integrations: (defaults) => [
    ...defaults.filter((i) => i.name !== "Console"),
    Sentry.dedupeIntegration(),
  ],

  // --- Last gate: scrub, then budget, or drop ------------------------
  beforeSend: (event) => budgetedBeforeSend(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});
