// The ONE place the web app's Sentry posture is written down.
//
// Client, server and edge runtimes each call `Sentry.init` in their own
// entrypoint (`src/instrumentation-client.ts`, `src/instrumentation.ts`), but
// they all spread this object first, so the privacy and quota decisions below
// cannot drift apart between runtimes — and a test can assert them
// (`src/lib/__tests__/sentryScrub.test.ts`).
//
// SDK VERSION MATTERS HERE — READ BEFORE COPYING THIS FILE ANYWHERE.
// This app runs `@sentry/nextjs@~10.74.0`, which bundles `@sentry/core@10.74.0`.
// That version documents TWO mutually exclusive privacy options:
//
//   * `sendDefaultPii` — DEPRECATED here, REMOVED in v11. Its own doc block
//     says: "If both `sendDefaultPii` and `dataCollection` are set,
//     `sendDefaultPii` will be ignored."
//   * `dataCollection` — the replacement, one flag per category of data.
//
// We write `dataCollection` ONLY. Never write both, and never write
// `sendDefaultPii` in this app: it would be silently ignored and would read
// like a privacy control that is doing nothing.
//
// THE TRAP IN `dataCollection`, WHICH INVERTS THE OBVIOUS INTUITION:
// supplying a `dataCollection` object ACTIVATES the spec defaults for every
// field you OMIT, and those defaults are permissive — `cookies: true`,
// `httpHeaders: {request:true,response:true}`, `httpBodies:` all four targets,
// `urlQueryParams: true`, `databaseQueryData: true`, `stackFrameVariables:
// true`, `graphQL: {document:true,variables:true}`,
// `genAI: {inputs:true,outputs:true}`, `frameContextLines: 5` (verified in
// @sentry/core/build/types/types/datacollection.d.ts). The deprecated
// `sendDefaultPii: false` left all of those OFF. So a half-written
// `dataCollection: { userInfo: false }` is strictly MORE leaky than the option
// it replaces, and on this product it would ship the child-login request body
// (an 8-digit ID and a plaintext password) and the Supabase session cookie.
//
// ALL TEN CATEGORIES THE INTERFACE DEFINES ARE THEREFORE WRITTEN OUT, including
// the three (`graphQL`, `genAI`, `frameContextLines`) whose integrations this
// app does not even install — an omitted key is not "no opinion", it is the
// permissive branch, and installing such an integration later must be a
// deliberate act rather than an accidental one. Do not "tidy" a line away
// because it looks like it matches the default; the deprecated `queryParams` is
// the ONLY field left out, and only because writing a deprecated alias of
// `urlQueryParams` next to the real one is how the two drift apart.
//
// WHY THE BAR IS THIS HIGH: this app holds minors' personal data — children's
// names, 8-digit login IDs, school, city and rayon, grade, optional gender,
// avatars and results — plus parent emails and phone numbers. Sentry is a new
// third-party recipient of diagnostic data, and neither the Play *Data safety*
// declaration nor the App Store *App Privacy* card names it yet. Nothing that
// identifies a child may reach it.
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import {
  createEventBudget,
  fingerprintEvent,
  type EventBudgetLimits,
} from "@/lib/observability/sentryBudget";
import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
} from "@/lib/observability/sentryEnv";
import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/sentryScrub";

/**
 * The DSN, the deployment name and the on/off gate live in `sentryEnv.ts` and
 * are re-exported here so this file stays the one place the posture is READ
 * from. They moved out because `instrumentation-client.ts` has to consult the
 * gate without importing this module — a static import from there would pull the
 * scrubber and the budget into the browser's initial bundle and undo the
 * lazy-loading in `browserSentry.ts`. The reasoning behind each constant is in
 * that file's header.
 */
export { SENTRY_DSN, SENTRY_ENABLED, SENTRY_ENVIRONMENT };

/**
 * Noise in EVERY runtime: neither the browser nor the server can act on any of
 * it, so it is filtered wherever it appears.
 */
const COMMON_IGNORE_ERRORS: Array<string | RegExp> = [
  // Next.js CONTROL FLOW, not errors. `redirect()` and `notFound()` throw these
  // on purpose — `notFound()` runs in real code paths such as
  // (parent)/children/[id]/edit/page.tsx. The SDK filters them itself; listing
  // them asserts it rather than trusting it.
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  // Layout thrash reported by browsers, not a fault in our code.
  /^ResizeObserver loop/,
  // A rejection with no Error object attached — no stack, nothing to fix.
  "Non-Error promise rejection captured",
  // Browser extensions injecting into the page.
  /extension\//,
  "top.GLOBALS",
];

/**
 * BROWSER-ONLY transport noise. Chrome says "Failed to fetch", Firefox
 * "NetworkError when attempting to fetch resource.", Safari "Load failed".
 *
 * Parents and children are on Azerbaijani mobile data: a dropped fetch is a
 * tunnel, a lift or a lock screen, not a bug, and it would otherwise be the
 * single highest-volume "issue" in the project.
 *
 * THIS LIST IS NOT SHARED WITH THE SERVER, and that split is the whole point of
 * the block below.
 */
const BROWSER_TRANSPORT_IGNORE_ERRORS: Array<string | RegExp> = [
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "AbortError",
  /The operation was aborted/,
  "TypeError: cancelled",
];

/**
 * THE SAME SHAPE MEANS TWO OPPOSITE THINGS DEPENDING ON WHERE IT WAS THROWN,
 * AND THAT IS WHY THESE PATTERNS ARE A CLASSIFIER RATHER THAN AN IGNORE LIST.
 *
 * In a BROWSER a transport failure is a user's wifi: noise, dropped above.
 * On the SERVER the same text is an INCIDENT. `@supabase/supabase-js` calls
 * global `fetch`; on Node that is undici; so `TypeError: fetch failed` from a
 * Route Handler means Supabase is unreachable, or `NEXT_PUBLIC_SUPABASE_URL`
 * was misconfigured by the deploy that just went out, and the platform is down
 * for every family on it. That is precisely the incident this integration was
 * bought for — and until this round BOTH runtimes shared one list, so the whole
 * class produced ZERO events in both Next apps.
 *
 * So the server does not ignore them. It REPORTS them, and the volume is
 * handled the honest way instead: every shape below collapses onto the single
 * fingerprint `SERVER_TRANSPORT_FINGERPRINT`, so an outage throwing a thousand
 * times an hour is ONE issue costing `perIssuePerHour` events (4), not four
 * events per distinct host:port string it happened to mention.
 *
 * Read off a running Node 24.15.0, not from memory:
 *   connection refused / DNS failure / TLS failure
 *       -> TypeError: fetch failed   (message is EXACTLY "fetch failed"; the
 *          real reason — ECONNREFUSED, ENOTFOUND — hangs off `error.cause`)
 *   socket cut mid-body
 *       -> TypeError: terminated     (cause: SocketError "other side closed",
 *          code UND_ERR_SOCKET)
 *   AbortSignal.timeout()
 *       -> TimeoutError: The operation was aborted due to timeout
 *
 * EVERY ENTRY IS ANCHORED OR DISTINCTIVE. These are matched by
 * `isTransportFailure` below, which decides whether an event is REGROUPED —
 * a mistake here mislabels a real fault rather than hiding it, but a bare
 * "terminated" would still put `Worker terminated` and `Payment terminated by
 * acquirer` under a transport heading, and the browser-shaped strings are
 * anchored for the same reason (`Failed to fetch questions` is our own error).
 */
const TRANSPORT_FAILURE_PATTERNS: RegExp[] = [
  // Undici / Node.
  /^fetch failed$/,
  /^terminated$/,
  /^The operation was aborted due to timeout$/,
  /^other side closed$/,
  // Every undici error code at once: UND_ERR_CONNECT_TIMEOUT,
  // UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT, UND_ERR_SOCKET.
  /\bUND_ERR_[A-Z_]+\b/,
  /^(?:Connect|Headers|Body) Timeout Error$/,
  // Raw socket/DNS failures thrown by node:net, node:dns and pg — these carry
  // an address, so they are matched as a word rather than anchored.
  /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\b/,
  // The WinterCG/edge and browser-engine wordings, anchored. The edge runtime
  // is a server runtime here (middleware, route handlers) and does not use
  // undici, so without these an edge-side outage would be reported as a
  // thousand separate issues instead of one.
  /^Failed to fetch$/,
  /^Load failed$/,
  /^NetworkError when attempting to fetch resource\.$/,
];

/**
 * The one issue every server-side transport failure is filed under. A constant
 * string, so Sentry's own grouping collapses them too and the owner sees a
 * single "platform cannot reach its backend" issue with an occurrence count,
 * rather than a wall of near-identical titles.
 */
export const SERVER_TRANSPORT_FINGERPRINT = "server-transport-failure";

/**
 * Does this event look like a network/transport failure rather than a fault in
 * our own code? Reads the LAST `exception.values` entry, which is the error that
 * was actually THROWN (`linkedErrorsIntegration` prepends causes) — the same
 * entry `ignoreErrors` matches against.
 */
export function isTransportFailure(event: {
  exception?: { values?: Array<{ type?: string; value?: string }> };
}): boolean {
  const values = event.exception?.values ?? [];
  const thrown = values[values.length - 1];
  if (!thrown) return false;
  const candidates = [thrown.value ?? "", `${thrown.type ?? ""}: ${thrown.value ?? ""}`];
  return TRANSPORT_FAILURE_PATTERNS.some((pattern) =>
    candidates.some((text) => pattern.test(text)),
  );
}

/**
 * What the BROWSER bundle ignores: everything above. A dropped request in a tab
 * is the network, whichever engine named it.
 */
export const BROWSER_IGNORE_ERRORS: Array<string | RegExp> = [
  ...COMMON_IGNORE_ERRORS,
  ...BROWSER_TRANSPORT_IGNORE_ERRORS,
  ...TRANSPORT_FAILURE_PATTERNS,
];

/**
 * What the SERVER and EDGE runtimes ignore: the common noise, and NOTHING that
 * describes a failed connection. Do not "restore the missing entries" — their
 * absence is the fix.
 */
export const SERVER_IGNORE_ERRORS: Array<string | RegExp> = [...COMMON_IGNORE_ERRORS];

/**
 * Script origins whose errors are not ours. Extension-injected scripts are a
 * large share of real-world browser Sentry volume and none of it is our code.
 */
const DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome(-extension)?:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:/i,
];

/**
 * THE OCCURRENCE CAP. See `sentryBudget.ts` for the arithmetic behind these
 * numbers — this app is allocated ~2,400 events/month of the org-wide 5,000,
 * which is ~80/day across the whole fleet.
 *
 * Two sets because the two runtimes fail differently:
 *
 *   BROWSER — a process is ONE TAB. A React render loop can throw hundreds of
 *   times a second, so the per-issue line is tight; a real bug affecting many
 *   parents still arrives once per tab, which is what makes it visible as
 *   widespread.
 *
 *   SERVER — a process is one serverless instance, which serves many people and
 *   legitimately sees a wider variety of faults, so the overall lines are
 *   higher while the per-issue line stays near the browser's: the repeating
 *   fault is the thing being bounded, and 60/day per instance keeps ONE runaway
 *   instance inside roughly one day of the app's whole allocation.
 *
 * `novelPerHour` / `novelPerDay` are the RESERVE: headroom above the two global
 * lines that only a fingerprint unseen in the last hour may spend, so the first
 * sighting of a new fault survives a busy hour instead of being dropped to
 * protect budget an already-reported fault had spent. The worst case is still
 * arithmetic — perHour + novelPerHour per hour, perDay + novelPerDay per day, so
 * 24/hour and 70/day on the server and 13/hour and 38/day in a tab, against this
 * app's ~2,400/month (~80/day) slice of the org-wide 5,000. See sentryBudget.ts.
 */
const BROWSER_BUDGET: EventBudgetLimits = {
  perHour: 10,
  perDay: 30,
  perIssuePerHour: 3,
  novelPerHour: 3,
  novelPerDay: 8,
};
const SERVER_BUDGET: EventBudgetLimits = {
  perHour: 20,
  perDay: 60,
  perIssuePerHour: 4,
  novelPerHour: 4,
  novelPerDay: 10,
};

/** True in the browser bundle only; edge and node both read false. */
const IS_BROWSER = typeof window !== "undefined";

export const SENTRY_BUDGET_LIMITS = IS_BROWSER ? BROWSER_BUDGET : SERVER_BUDGET;

/**
 * One budget per process — module scope IS the process here: a browser tab
 * evaluates this module once per page load, and a serverless instance once per
 * cold start.
 */
const budget = createEventBudget(SENTRY_BUDGET_LIMITS);

/**
 * The last gate, in the order the gates have to run.
 *
 * 1. SCRUB first. Nothing may be read — including by the fingerprinter — before
 *    the child's name has been replaced by a placeholder.
 * 2. BUDGET second, and only on events that survived the scrubber, so a dropped
 *    event never spends allowance.
 *
 * Note what has ALREADY happened by the time this runs: `ignoreErrors` is an
 * event processor and event processors run inside `prepareEvent`, which the
 * client awaits BEFORE calling `beforeSend` (@sentry/core client.js). So known
 * noise never reaches the budget and cannot consume it. `sampleRate` runs AFTER
 * this hook, which is why the budget is the real ceiling and the sample rate can
 * only ever take the number lower.
 *
 * BETWEEN THE TWO, ON THE SERVER ONLY, TRANSPORT FAILURES ARE REGROUPED.
 * They are no longer ignored there (see `SERVER_IGNORE_ERRORS`), so a Supabase
 * outage now reports — and it has to report at a bounded cost. Left alone, each
 * occurrence would carry its own host, port and address text, the fingerprinter
 * would read them as different faults, and each would claim its own per-issue
 * allowance: the budget would be spent in minutes by one incident. Collapsing
 * the whole class onto one constant fingerprint makes an outage cost
 * `perIssuePerHour` events an hour — a handful — and makes it ONE issue in the
 * Sentry UI with a rising occurrence count, which is also the more legible way
 * to see it.
 *
 * An event that already carries an explicit `fingerprint` is left alone: that
 * was a deliberate decision at the call site and outranks this one.
 */
export function budgetedBeforeSend(event: ErrorEvent): ErrorEvent | null {
  const scrubbed = scrubEvent(event);
  if (!scrubbed) return null;
  if (!IS_BROWSER && !scrubbed.fingerprint?.length && isTransportFailure(scrubbed)) {
    scrubbed.fingerprint = [SERVER_TRANSPORT_FINGERPRINT];
  }
  return budget.admit(fingerprintEvent(scrubbed)) ? scrubbed : null;
}

/**
 * Shared across client, server and edge. Spread it first, then add only what is
 * genuinely runtime-specific.
 */
export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: SENTRY_ENVIRONMENT,

  // --- Privacy -----------------------------------------------------------
  // See the header of this file before changing any line in this block.
  // `sendDefaultPii` is deliberately absent: writing it alongside
  // `dataCollection` would make it ignored, and writing it instead would break
  // on the v11 upgrade.
  dataCollection: {
    // No IP address, no automatic `user.*` from instrumentation. We also never
    // call Sentry.setUser() — that is explicitly NOT covered by these options.
    userInfo: false,
    // The `sb-*-auth-token` cookies ARE the session. A leaked one is a live
    // parent or child login. Defaults to true once this object exists.
    cookies: false,
    // Headers carry the cookie, the bearer token and the user agent.
    httpHeaders: { request: false, response: false },
    // THE WORST ONE, and not hypothetical: POST /api/mobile/v1/auth/child-login
    // carries `{ child_id, password }` — an 8-digit login ID and a plaintext
    // password; /api/mobile/v1/auth/register carries a parent's email, phone
    // and name; the parent Add-Child and edit Server Actions carry a child's
    // name, school, city, rayon, grade and gender. An empty array is the
    // documented "collect no bodies" value; an OMITTED value collects all four.
    httpBodies: [],
    // `?email=`, `?next=`, the Supabase auth `?code=`.
    urlQueryParams: false,
    // No GraphQL integration is installed, so nothing collects these today.
    // Written out because the DEFAULT is to attach the query document and its
    // variables, and a variables bag on this product is `{ childId, password }`.
    graphQL: { document: false, variables: false },
    // Same reasoning for the AI integrations: defaults attach prompts and
    // completions verbatim. Nothing here calls a model, and if something ever
    // does, turning this on is the reviewable line in the diff.
    genAI: { inputs: false, outputs: false },
    // Query parameters, inline literals and returned rows from database spans.
    // No Supabase/Postgres integration is installed, so this is belt-and-braces
    // against one being added later — it defaults to true.
    databaseQueryData: false,
    // THE SERVICE-ROLE KEY LIVES HERE. A throw inside a function holding
    // SUPABASE_SERVICE_ROLE_KEY or OLIMPIADA_*_DB_URL in a local variable would
    // ship it to Sentry as a stack-frame variable. Defaults to true.
    stackFrameVariables: false,
    // SOURCE CONTEXT LINES AROUND EACH FRAME — 0, not the default 5, IN BOTH
    // NEXT APPS. The admin panel carried 5 until this round and the two were
    // never reconciled, which is the exact drift this shared-options file exists
    // to prevent; `admin-panel/src/lib/sentry/options.ts` now reads 0 and points
    // back here for the reasoning.
    //
    // This is not family data (it is our own source), so the reason is the
    // second-order one: on the server the frame points into the BUILT bundle,
    // where a "line" is thousands of characters of concatenated, minified
    // modules — an unbounded blob of unrelated code that `scrubEvent` would
    // then have to police, and Next.js has already inlined every
    // `process.env.NEXT_PUBLIC_*` value into it. Sentry still shows real source
    // in the UI from the source maps `withSentryConfig` uploads
    // (next.config.mjs), so 0 costs nothing we do not get back. The
    // `context_line`/`pre_context`/`post_context` redaction in sentryScrub.ts
    // stays as the backstop for frames that arrive with context anyway.
    frameContextLines: 0,
  },

  // --- Quota -------------------------------------------------------------
  //
  // `tracesSampleRate`, `replaysSessionSampleRate` and `replaysOnErrorSampleRate`
  // ARE NOT WRITTEN HERE, AND THE OMISSION IS THE SETTING. Writing them as `0`
  // is the intuitive way to say "off" and it is the wrong one:
  //
  //   * `hasSpansEnabled()` tests `options.tracesSampleRate != null` — and its
  //     own source comment points out that ZERO IS NOT NULLISH (@sentry/core
  //     utils/hasSpansEnabled.js). `tracesSampleRate: 0` therefore reads as
  //     "tracing is ON, sampled at zero": the span machinery starts, spans are
  //     created and measured on every request and navigation, and only the
  //     SENDING is suppressed. Omitting the key turns the feature off instead of
  //     paying for it and throwing the result away.
  //   * Either replay rate present is what makes a replay integration
  //     meaningful; leaving both out keeps Session Replay unreachable rather
  //     than merely disabled. Replay records the DOM, which on this product is a
  //     video of a child's name, school and 8-digit id, and no `beforeSend` can
  //     unmake that.
  //
  // Tracing is also removed from the BUNDLE at build time by
  // `webpack.treeshake.removeTracing` in next.config.mjs, which sets
  // `__SENTRY_TRACING__ = false`. That flag is the only thing that stops
  // @sentry/nextjs adding `browserTracingIntegration()` to the browser defaults
  // — it does so unconditionally otherwise, whatever this file says.
  //
  // The real occurrence ceiling is `budgetedBeforeSend` above.
  //
  // Sentry Logs OFF — it forwards console output, which is exactly what the
  // breadcrumb filter below is dropping.
  enableLogs: false,
  // Smaller payloads, fewer places for a stray value to hide.
  maxBreadcrumbs: 20,
  normalizeDepth: 3,

  // ONE LIST PER RUNTIME, NOT ONE LIST SHARED. A dropped connection in a tab is
  // a user's wifi; the same text from a Route Handler is the platform being
  // unable to reach its own database. See the block above `BROWSER_IGNORE_ERRORS`
  // — the server list deliberately contains nothing about failed connections.
  ignoreErrors: IS_BROWSER ? BROWSER_IGNORE_ERRORS : SERVER_IGNORE_ERRORS,
  denyUrls: DENY_URLS,

  // --- Last gate ---------------------------------------------------------
  // Everything above stops the SDK COLLECTING. These two stop anything that
  // reached an error message or a breadcrumb anyway (see sentryScrub.ts), and
  // the first also enforces the occurrence budget (see sentryBudget.ts).
  beforeSend: budgetedBeforeSend,
  beforeBreadcrumb: (breadcrumb: Breadcrumb): Breadcrumb | null =>
    scrubBreadcrumb(breadcrumb),
};
