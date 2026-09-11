// =====================================================================
// SHARED SENTRY OPTIONS — ADMIN PANEL (client + server + edge)
//
// One module so the three runtime configs cannot drift apart. A privacy
// control that is correct in sentry.server.config.ts and mistyped in
// instrumentation-client.ts is not a privacy control.
//
// SDK: @sentry/nextjs 10.74.0 (bundling @sentry/core 10.74.0).
//
// *** WHY `dataCollection` AND NEVER `sendDefaultPii` ***
// In @sentry/core 10.74.0, `sendDefaultPii` is DEPRECATED and removed in
// v11; `dataCollection` replaces it. The two must never both appear —
// core's own doc says that when both are set, `sendDefaultPii` is IGNORED,
// so a stray `sendDefaultPii: false` next to a dataCollection block reads
// like a safety net and is in fact dead.
//
// *** THE TRAP, AND IT INVERTS THE OBVIOUS INTUITION ***
// Supplying a `dataCollection` object SWITCHES THE BASELINE from
// "sendDefaultPii is false, so collect nothing" to the spec DEFAULTS, which
// are permissive: cookies true, httpHeaders true, httpBodies all four
// targets, urlQueryParams true, databaseQueryData true, stackFrameVariables
// true. (See resolveDataCollectionOptions in @sentry/core: `const base =
// options.dataCollection != null ? DEFAULTS : …`.) So a HALF-WRITTEN
// dataCollection block — `{ userInfo: false }`, which reads like the
// careful modern choice — is strictly MORE leaky than not migrating at all,
// and would ship the Supabase session cookie and the Server Action body.
//
// Consequence: EVERY FIELD BELOW IS WRITTEN OUT EXPLICITLY, including the
// ones whose documented default already happens to be the value we want.
// Do not "tidy up" this object by deleting the redundant-looking lines.
// =====================================================================
import { createEventBudget, fingerprintEvent, type EventBudgetLimits } from "@/lib/sentry/budget";
import { IGNORED_ERRORS, scrubEvent, type ScrubEvent } from "@/lib/sentry/scrub";

/**
 * Every data category the SDK can collect, each one turned off by name.
 *
 * What each line is actually protecting, in this app specifically:
 *  - userInfo          → the staff member's IP address. Also: core's
 *                        resolver carries a `TODO(v11)` note that an omitted
 *                        userInfo becomes TRUE in v11, so omission is a
 *                        future leak, not a neutral choice.
 *  - cookies           → sb-*-auth-token IS the admin session. A leaked one
 *                        is a live privileged login, not just a privacy
 *                        problem.
 *  - httpHeaders       → Cookie/Authorization headers, same reasoning.
 *  - httpBodies        → the empty array is the documented "collect none"
 *                        value. This is the big one: bulk question import
 *                        posts up to 12 MB of rows through a Server Action,
 *                        and the Accounts screens post child names, 8-digit
 *                        ids, parent emails and phone numbers.
 *  - urlQueryParams    → the Accounts search box puts what staff typed —
 *                        commonly a child's name — into the query string.
 *  - graphQL / genAI   → no such integration is installed; off anyway so
 *                        that installing one later is a deliberate act.
 *  - databaseQueryData → query parameters and returned rows. A failed
 *                        privileged query must not carry the rows it read.
 *  - stackFrameVariables → LOCALS. This is the line that stops
 *                        SUPABASE_SERVICE_ROLE_KEY and OLIMPIADA_*_DB_URL
 *                        leaving the process inside a frame of
 *                        createAdminClient(), and stops an export's rows[]
 *                        array riding out on a thrown exceljs error.
 *  - frameContextLines → source lines around the frame. 0, NOT the default 5,
 *                        and the same value the web app ships — this used to be
 *                        5 here and 0 there, undecided, which is the drift a
 *                        shared options module exists to stop. It is our own
 *                        source rather than user data, so the reason is the
 *                        second-order one: the frame points into the BUILT
 *                        bundle, where a "line" is thousands of characters of
 *                        concatenated minified modules with every
 *                        NEXT_PUBLIC_* value already inlined by Next — an
 *                        unbounded blob the scrubber would then have to police,
 *                        for no legibility, since withSentryConfig uploads
 *                        source maps and the Sentry UI shows the real source
 *                        from them anyway.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};

/**
 * The DSN. PUBLIC by design (write-only ingest), which is why it carries the
 * NEXT_PUBLIC_ prefix — next.config.mjs also reads it to derive the CSP
 * connect-src origin, so the header can never drift from the configured DSN.
 * Its VALUE lives in the Vercel dashboard and in an untracked .env.local,
 * never in a tracked file.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

/**
 * WHICH VERCEL DEPLOYMENT THIS IS — "production", "preview", "development", or
 * undefined when the process is not on Vercel at all. `NEXT_PUBLIC_VERCEL_ENV`
 * is the browser-visible twin Vercel injects for Next.js projects; `VERCEL_ENV`
 * is the server-side one and is not exposed to the client, so reading both
 * makes one constant correct in all three runtimes.
 */
export const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;

/**
 * NOTHING IS SENT UNLESS THIS IS A REAL VERCEL DEPLOYMENT.
 *
 * THE GATE IS VERCEL_ENV, NOT NODE_ENV. `NODE_ENV === "production"` is true of
 * any production BUILD, including one running on the operator's own machine:
 * `next build && next start` with a DSN in `.env.local` — which is exactly how
 * a production build gets checked before a deploy — would have sent real events
 * tagged `environment: production` out of an allowance that is 5,000/month for
 * the whole org and cannot be topped up. `VERCEL_ENV` is set by Vercel and by
 * nothing else, which is the distinction that was wanted.
 *
 * Preview deploys report too, tagged "preview" (and bounded by the budget
 * below). Delete the `|| VERCEL_ENV === "preview"` clause to spend the whole
 * allowance on production only.
 *
 * An unset DSN disables the SDK as well: a checkout that has not configured
 * Sentry must be inert, never broken.
 */
export const SENTRY_ENABLED =
  SENTRY_DSN.length > 0 && (VERCEL_ENV === "production" || VERCEL_ENV === "preview");

/**
 * Which deployment an event is filed against. Derived here rather than written
 * out in each of the three runtime configs, which is how a preview deploy ends
 * up tagged "production" in one runtime and not another.
 */
export const SENTRY_ENVIRONMENT = VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

/**
 * ERROR SAMPLE RATE — 1.0, AND THE 0.25 THAT USED TO BE HERE IS GONE.
 *
 * There were TWO quota mechanisms stacked on this app, and stacking them was
 * worse than either alone. `sampleRate` runs AFTER `beforeSend` (@sentry/core
 * client.js: `_prepareEvent` → `beforeSend` → `_isSampled`), so the budget
 * below was CHARGED for every event, the sampler then discarded three out of
 * four of them, and the allowance was spent on events that were never sent.
 * Worse in the case that matters: a ONE-OFF admin error — an import that threw
 * once, a failed export, the single occurrence the operator is asking about —
 * had a 75% chance of vanishing, and a one-off is exactly what a sampler is
 * guaranteed to lose.
 *
 * One mechanism, and it is the budget: deterministic, it keeps the FIRST
 * occurrence of everything, and it bounds the repeating fault (which is the
 * only shape that can actually empty the quota) rather than thinning
 * everything uniformly. The admin panel's smaller share of the org-wide
 * 5,000/month is expressed in SENTRY_BUDGET_LIMITS below — smaller numbers
 * than the web app's — which is where "this app gives way to the one with the
 * families in it" belongs.
 *
 * Written out as 1.0 rather than omitted: the SDK's default is already 1.0, but
 * an explicit value is what makes the removal of the 0.25 legible at the call
 * site instead of looking like a deleted line.
 */
export const SENTRY_ERROR_SAMPLE_RATE = 1.0;

/**
 * TRACING IS OFF BY OMISSION. THERE IS NO `SENTRY_TRACES_SAMPLE_RATE` HERE ANY
 * MORE, AND ITS ABSENCE IS THE SETTING.
 *
 * The constant used to be `0` and was spread into all three runtime configs.
 * That is the intuitive way to say "off" and it is the wrong one:
 * `hasSpansEnabled()` tests `options.tracesSampleRate != null`, and its own
 * source comment in @sentry/core spells out that ZERO IS NOT NULLISH. Writing
 * `tracesSampleRate: 0` therefore reads to the SDK as "tracing IS enabled,
 * sampled at zero": the span machinery starts, spans are created and measured
 * on every request and navigation, and only the SENDING is suppressed. Paying
 * for the work and throwing the result away is strictly worse than not doing it.
 *
 * The tracing CODE is removed from the bundle as well, by
 * `webpack.treeshake.removeTracing` in next.config.mjs — that flag sets
 * `__SENTRY_TRACING__ = false`, which is the only thing that stops
 * @sentry/nextjs pushing `browserTracingIntegration()` into the browser's
 * default integrations, since it does that unconditionally otherwise.
 *
 * Reinstating tracing is a deliberate decision with its own quota arithmetic —
 * transactions bill from the same 5,000/month as errors — and not a value edit.
 */

/**
 * THE SAME SHAPE MEANS TWO OPPOSITE THINGS DEPENDING ON WHERE IT WAS THROWN.
 *
 * In a BROWSER, a failed request is a staff member's wifi, a laptop lid, a VPN
 * reconnecting: noise, and the highest-volume noise there is. On the SERVER the
 * same text is an INCIDENT — `@supabase/supabase-js` calls global `fetch`, on
 * Node that is undici, and `TypeError: fetch failed` out of a Server Action
 * means the panel cannot reach the database at all, or that the deploy which
 * just went out has the wrong Supabase URL.
 *
 * Until this round BOTH halves shared ONE ignore list, so that entire class of
 * failure produced ZERO events — the precise incident monitoring was bought
 * for. The lists are now split by runtime:
 *
 *   BROWSER  ignores every transport shape (this list, plus the browser strings
 *            already in `IGNORED_ERRORS`).
 *   SERVER / EDGE  ignore NONE of them. They REPORT, and the volume is bounded
 *            the honest way instead: `budgetedBeforeSend` collapses the whole
 *            class onto one fingerprint, so an outage throwing a thousand times
 *            an hour is ONE issue costing `perIssuePerHour` events — three —
 *            rather than three per distinct host:port string it mentioned.
 *
 * Read off a running Node 24.15.0 rather than remembered:
 *   connection refused / DNS failure / TLS failure
 *       -> TypeError: fetch failed  (message EXACTLY "fetch failed"; the real
 *          reason — ECONNREFUSED, ENOTFOUND — hangs off `error.cause`)
 *   socket cut mid-body
 *       -> TypeError: terminated    (cause: SocketError "other side closed",
 *          code UND_ERR_SOCKET)
 *   AbortSignal.timeout()
 *       -> TimeoutError: The operation was aborted due to timeout
 *
 * EVERY PATTERN IS ANCHORED OR DISTINCTIVE. These now decide whether an event is
 * REGROUPED rather than whether it is hidden, but a bare "terminated" would
 * still file a real `Worker terminated` or an exceljs `Stream terminated` under
 * a transport heading. Sentry tests the LAST entry of `exception.values` — the
 * thrown error, because linkedErrors PREPENDS causes — so the outer text is
 * what is matched.
 */
export const TRANSPORT_FAILURE_PATTERNS: RegExp[] = [
  // Undici / Node.
  /^fetch failed$/,
  /^terminated$/,
  /^The operation was aborted due to timeout$/,
  /^other side closed$/,
  // Every undici code at once: UND_ERR_CONNECT_TIMEOUT, UND_ERR_HEADERS_TIMEOUT,
  // UND_ERR_BODY_TIMEOUT, UND_ERR_SOCKET.
  /\bUND_ERR_[A-Z_]+\b/,
  /^(?:Connect|Headers|Body) Timeout Error$/,
  // Raw socket/DNS failures from node:net, node:dns and pg. These carry an
  // address, so they match as a word rather than anchored.
  /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\b/,
  // The engine and WinterCG wordings, anchored. The edge runtime is a SERVER
  // runtime here (middleware runs on every request) and does not use undici, so
  // without these an edge-side outage would be a thousand separate issues.
  /^Failed to fetch$/,
  /^Load failed$/,
  /^NetworkError when attempting to fetch resource\.$/,
];

/**
 * What the BROWSER bundle adds to `IGNORED_ERRORS`. Unreachable shapes in a tab
 * cost nothing and keep the browser's rule simple and total: a transport failure
 * in a browser is noise, whichever engine named it.
 */
export const BROWSER_TRANSPORT_IGNORED_ERRORS: (string | RegExp)[] = [
  ...TRANSPORT_FAILURE_PATTERNS,
];

/** Messages a transport failure actually arrives as, used to derive the list below. */
const TRANSPORT_SAMPLE_MESSAGES = [
  "Failed to fetch",
  "TypeError: Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "AbortError: The user aborted a request.",
  "The operation was aborted",
  "The operation was aborted due to timeout",
  "TypeError: cancelled",
  "fetch failed",
  "TypeError: fetch failed",
  "terminated",
  "other side closed",
  "UND_ERR_CONNECT_TIMEOUT",
  "Connect Timeout Error",
  "connect ECONNREFUSED 10.0.0.1:5432",
  "getaddrinfo ENOTFOUND db.example.supabase.co",
];

/**
 * THE SERVER AND EDGE IGNORE LIST: the shared one, MINUS anything that would
 * swallow a transport failure.
 *
 * Derived by BEHAVIOUR rather than by name, and that is the point. `scrub.ts`
 * owns `IGNORED_ERRORS` and may gain entries later; a hand-copied subset would
 * drift silently and re-close the hole. Instead every shared pattern is tested
 * against the sample messages above, and any pattern that matches one is
 * dropped from the server list — so a future "Load failed" added to the shared
 * list still cannot blind the server. Patterns that match nothing transport-
 * shaped (NEXT_REDIRECT, /extension\//, ResizeObserver) pass through untouched.
 */
export const SERVER_IGNORED_ERRORS: (string | RegExp)[] = IGNORED_ERRORS.filter((pattern) =>
  TRANSPORT_SAMPLE_MESSAGES.every((message) =>
    typeof pattern === "string" ? !message.includes(pattern) : !pattern.test(message),
  ),
);

/**
 * The one issue every server-side transport failure is filed under. A constant,
 * so Sentry's own grouping collapses them too and the operator sees a single
 * "the panel cannot reach its backend" issue with an occurrence count instead of
 * a wall of near-identical titles.
 */
export const SERVER_TRANSPORT_FINGERPRINT = "server-transport-failure";

/**
 * Does this event look like a network/transport failure rather than a fault in
 * our own code? Reads the LAST `exception.values` entry — the error that was
 * actually THROWN, since `linkedErrorsIntegration` prepends causes.
 */
export function isTransportFailure(event: ScrubEvent): boolean {
  const values = event.exception?.values ?? [];
  const thrown = values[values.length - 1];
  if (!thrown) return false;
  const candidates = [thrown.value ?? "", `${thrown.type ?? ""}: ${thrown.value ?? ""}`];
  return TRANSPORT_FAILURE_PATTERNS.some((pattern) =>
    candidates.some((text) => pattern.test(text)),
  );
}

/**
 * THE OCCURRENCE CAP. The arithmetic is in `budget.ts`; this app's share of the
 * org-wide 5,000/month is ~600 (~20/day), the smallest of the three because it
 * has one user and the other two have the families.
 *
 * One set of numbers for all three runtimes: unlike the web app, the browser
 * half of this panel is not a public page and the edge half is middleware that
 * runs on every request — the failure being bounded (one fault repeating inside
 * one process) is the same shape in each. 30/day per process keeps ONE runaway
 * process inside roughly a day and a half of the app's whole allocation, and the
 * per-issue line means an outage costs 3 events an hour, not 3,000.
 *
 * THIS IS NOW THE ONLY QUOTA MECHANISM ON THIS APP — the 0.25 `sampleRate` that
 * sat on top of it is gone (see SENTRY_ERROR_SAMPLE_RATE above). It has to be
 * the one that keeps the FIRST occurrence, which is what `novelPerHour` /
 * `novelPerDay` are: headroom above the two global lines that only a
 * fingerprint unseen in the last hour may spend. Worst case stays arithmetic —
 * 10 + 3 = 13/hour, 30 + 6 = 36/day per process, against this app's ~600/month
 * (~20/day) slice of the org-wide 5,000. See budget.ts.
 */
export const SENTRY_BUDGET_LIMITS: EventBudgetLimits = {
  perHour: 10,
  perDay: 30,
  perIssuePerHour: 3,
  novelPerHour: 3,
  novelPerDay: 6,
};

/** True in the browser bundle only; edge and node both read false. */
const IS_BROWSER = typeof window !== "undefined";

/**
 * One budget per process — module scope IS the process: a browser tab evaluates
 * this module once per page load, a serverless instance once per cold start.
 */
const budget = createEventBudget(SENTRY_BUDGET_LIMITS);

/**
 * The last gate, in the order the gates must run.
 *
 * 1. SCRUB first — nothing may be read, including by the fingerprinter, before
 *    a child's name has become a placeholder.
 * 2. BUDGET second, and only on what survived, so a scrubbed-away event never
 *    spends allowance.
 *
 * What has already happened by now: `ignoreErrors` is an event PROCESSOR, and
 * processors run inside `prepareEvent`, which the client awaits BEFORE calling
 * `beforeSend` (@sentry/core client.js). Known noise therefore never reaches the
 * budget and cannot consume it. `sampleRate` is 1.0 and no longer thins what
 * survives: this hook is the whole of the quota defence.
 *
 * BETWEEN THE TWO, ON THE SERVER AND EDGE ONLY, TRANSPORT FAILURES ARE
 * REGROUPED. They are no longer ignored there (see `SERVER_IGNORED_ERRORS`), so
 * an outage now reports — and it has to report at a bounded cost. Left alone,
 * each occurrence carries its own host, port and address text, the fingerprinter
 * reads them as different faults, and each claims its own per-issue allowance:
 * one incident would spend the budget in minutes. Collapsing the class onto one
 * constant fingerprint makes an outage cost `perIssuePerHour` events an hour —
 * three — and makes it ONE issue in the Sentry UI with a rising occurrence
 * count, which is also how an operator would rather read it.
 *
 * An event carrying an explicit `fingerprint` already is left alone: that was a
 * deliberate decision at the call site and outranks this one.
 */
export function budgetedBeforeSend<T extends ScrubEvent>(event: T): T | null {
  const scrubbed = scrubEvent(event);
  if (!scrubbed) return null;

  const grouped = scrubbed as T & { fingerprint?: string[] };
  if (!IS_BROWSER && !grouped.fingerprint?.length && isTransportFailure(scrubbed)) {
    grouped.fingerprint = [SERVER_TRANSPORT_FINGERPRINT];
  }

  return budget.admit(fingerprintEvent(grouped)) ? scrubbed : null;
}
