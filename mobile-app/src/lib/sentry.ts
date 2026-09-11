// SENTRY INITIALISATION — every option that matters, written out on purpose.
//
// SDK: `@sentry/react-native` 7.2.0, which bundles `@sentry/core` 10.12.0. The
// version is pinned by Expo, not by us: `node_modules/expo/bundledNativeModules.json`
// declares `"@sentry/react-native": "~7.2.0"` for SDK 54, and that is what
// `npx expo install` resolves. Do NOT bump it to the npm `latest` (8.x) — the
// house rule is that every native module stays on the version Expo validated
// for SDK 54.
//
// *** THE PII OPTION ON THIS SDK IS `sendDefaultPii`, NOT `dataCollection`. ***
// Newer Sentry cores (10.74+, which the web-app and admin-panel run) deprecate
// `sendDefaultPii` in favour of a per-category `dataCollection` object.
// `@sentry/core` 10.12.0 has NO such option — writing `dataCollection` here
// would be an unknown key, silently ignored, and the PII would flow. The repo
// therefore carries TWO DIFFERENT OPTION NAMES on purpose, and the difference
// is invisible from the config files themselves, so: never copy an option block
// between this file and a Next app without re-checking which core is installed.
// `__tests__/sentry-posture.test.ts` fails if `dataCollection` ever appears
// here.
//
// WHAT GETS SENT, AND WHEN
// ------------------------
// Nothing at all unless BOTH are true: this is a release bundle (`__DEV__` is
// false) and `EXPO_PUBLIC_SENTRY_DSN` is set to an https DSN. That means Expo
// Go, `expo start`, and every EAS `development` build send ZERO — one afternoon
// of debugging would otherwise spend a week of a 5,000-event monthly allowance
// that is shared with the two web projects and cannot be topped up.
//
// THE DSN IS NOT IN THIS REPOSITORY, and must never be. It is an
// `EXPO_PUBLIC_*` value, so it is inlined into the JS bundle at build time
// (correct for a DSN — it is write-only ingest, not an access credential), but
// it is supplied by the environment:
//   * local runs  -> `mobile-app/.env` (untracked)
//   * EAS builds  -> a plain, non-secret EAS environment variable named
//                    EXPO_PUBLIC_SENTRY_DSN, visible to the preview and
//                    production build profiles.
// Source-map upload additionally needs SENTRY_AUTH_TOKEN as an EAS SECRET —
// never in `app.json`, `eas.json` or any other tracked file. See the report in
// `CHANGELOG.md` and `STATUS.md` for the exact steps.
import * as Sentry from "@sentry/react-native";

import {
  createEventBudget,
  fingerprintEvent,
  NODE_TRANSPORT_IGNORED_ERRORS,
  type EventBudgetLimits,
} from "./sentryQuota";
import { IGNORED_ERRORS, scrubBreadcrumb, scrubEvent } from "./sentryScrub";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

/**
 * THE OCCURRENCE CAP. The arithmetic is in `sentryQuota.ts`: this app's share of
 * the org-wide 5,000/month is ~1,000 (~33/day across ALL installs), and the
 * budget is per APP LAUNCH.
 *
 * Why these numbers and not "one per issue": twelve testers seeing the same
 * crash still send twelve reports, because each phone has its own budget — that
 * breadth is the signal. What is squeezed is one phone repeating one fault, so a
 * retry loop or a screen that re-throws on every render costs 3 events an hour
 * instead of thousands, and a device left broken all day costs 30 rather than
 * emptying the org's month.
 */
const BUDGET_LIMITS: EventBudgetLimits = {
  perHour: 10,
  perDay: 30,
  perIssuePerHour: 3,
};

/** One budget per process — module scope is evaluated once per app launch. */
const budget = createEventBudget(BUDGET_LIMITS);

/**
 * The last gate, in the order the gates must run.
 *
 * 1. SCRUB first: nothing may be read, the fingerprinter included, before a
 *    child's data has been removed or redacted.
 * 2. BUDGET second, so an event the scrubber would have dropped never spends
 *    allowance.
 *
 * `ignoreErrors` has already run by this point — it is an event PROCESSOR, and
 * processors run inside `prepareEvent`, which the client awaits BEFORE calling
 * `beforeSend`. Known noise therefore never touches the budget. `sampleRate`
 * runs AFTER this hook, which is why the budget is the real ceiling.
 */
function scrubAndBudget<T extends Parameters<typeof scrubEvent>[0]>(event: T): T | null {
  const scrubbed = scrubEvent(event);
  return budget.admit(fingerprintEvent(scrubbed)) ? scrubbed : null;
}

/** An https DSN, or nothing. A half-set value must disable, never half-enable. */
const isConfigured = /^https:\/\/\S+$/i.test(dsn);

/**
 * Starts Sentry. Returns whether it actually started, so a caller (and a test)
 * can tell "disabled on purpose" from "tried and failed".
 *
 * Safe to call more than once in practice — the SDK rebinds a client rather
 * than throwing — but it is called exactly once, from the root layout, which is
 * the earliest code this app controls under `expo-router/entry`.
 */
export function initSentry(): boolean {
  if (__DEV__ || !isConfigured) return false;

  Sentry.init({
    dsn,

    // --- PII: OFF, explicitly ------------------------------------------------
    // Withholds the user's IP address, request headers, and — the one that
    // matters most for a product used by children — the native device name,
    // which on both platforms is habitually "<a person's first name>'s phone".
    // This value IS forwarded to the iOS and Android SDKs, so it also covers
    // native crash events, which never pass through the JS `beforeSend` below.
    sendDefaultPii: false,

    // A screenshot of this app is a photograph of a child's dashboard: their
    // name, avatar, school and scores. The view hierarchy is the same data in
    // text form. Both default to false; both are written out so that a later
    // copy-paste from a Sentry blog post cannot flip them unnoticed.
    attachScreenshot: false,
    attachViewHierarchy: false,

    // Would capture failed XHR/fetch — i.e. the child-login request — as its
    // own event class. Default false, kept explicit for the same reason.
    enableCaptureFailedRequests: false,

    // NOT WRITTEN HERE, AND THE OMISSION IS THE POINT:
    //
    //   tracesSampleRate            — `getDefaultIntegrations` tests it with
    //   replaysSessionSampleRate      `typeof x === "number"`, and ZERO IS A
    //   replaysOnErrorSampleRate      NUMBER. Writing `0` therefore LOADS the
    //                                 machinery it looks like it disables:
    //                                 `tracesSampleRate: 0` pulls in app-start,
    //                                 native-frames, stall and time-to-display
    //                                 tracing, and either replay rate at `0`
    //                                 installs `mobileReplayIntegration`, which
    //                                 records the SCREEN. Omitting the keys is
    //                                 the only way to leave all of it out.
    //
    // If performance or replay is ever wanted, that is a deliberate decision
    // with its own privacy review — not a value change.

    // --- Scrubbing, then the occurrence budget -------------------------------
    beforeSend: (event) => scrubAndBudget(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),

    // --- Noise control -------------------------------------------------------
    // TWO lists. The first is this app's own: "Network request failed" and the
    // rest are what a phone with no signal produces. The second adds the
    // Node/undici transport texts — see sentryQuota.ts for why they are here on
    // a React Native app, and for the Node 24 session the exact strings were
    // read from rather than remembered.
    ignoreErrors: [...IGNORED_ERRORS, ...NODE_TRANSPORT_IGNORED_ERRORS],
    // 100 crumbs of history per event is a lot of surface for no extra insight
    // once console crumbs are dropped. Smaller payloads, less to scrub.
    maxBreadcrumbs: 30,
    // Every error is worth seeing while the app is in closed testing with 12
    // testers, and sampling is the wrong instrument anyway: it discards RARE
    // events — the one crash on one tester's device — while still letting a
    // quarter of a retry loop through. Volume is bounded deterministically
    // instead, by the per-issue/per-hour/per-day budget in `beforeSend` above;
    // the per-key rate limit in the Sentry UI is the hard cap above that.
    sampleRate: 1,
    // Release health would post a session envelope on every foreground from a
    // child's device, to tell us a crash-free rate that Play Console vitals and
    // App Store Connect already report for free. Not worth the traffic.
    enableAutoSessionTracking: false,
  });

  // DELIBERATELY ABSENT, AND IT MUST STAY ABSENT: `Sentry.setUser(...)`.
  // It is the one call that undoes everything above — Sentry's own docs are
  // explicit that the PII controls "only apply to data the SDK sends by
  // default, not data that was explicitly set". Not even a UUID: `profile_id`
  // joins straight to a named child in our database. If correlation is ever
  // genuinely needed, mint a per-install random id that maps to nothing.
  //
  // Also absent: `Sentry.wrap(RootLayout)`. It adds a TouchEventBoundary
  // (a breadcrumb per tap, carrying the touched component tree) and a React
  // profiler that only does anything when tracing is on. Neither earns its
  // payload here.
  return true;
}
