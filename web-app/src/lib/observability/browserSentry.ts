// WHERE THE BROWSER SDK IS ALLOWED TO LOAD, AND HOW IT GETS THERE.
//
// ---------------------------------------------------------------------------
// THE MEASUREMENT THAT FORCED THIS
// ---------------------------------------------------------------------------
// `@sentry/nextjs`'s browser SDK is +161.7 KB minified — about +45% — on top of
// the JavaScript this site already ships. Before this file, `instrumentation-
// client.ts` imported it statically, so Next.js put it in the client ENTRY: every
// visitor downloaded and executed it, including the anonymous, logged-out
// visitor reading the landing page over an Azerbaijani mobile connection.
//
// MEASURED AGAIN AFTER THE SPLIT, off a real `next build`: the SDK is now one
// ASYNC chunk of 365.7 KB raw / 121.7 KB gzip / 102.6 KB brotli, and it appears
// in NO route's "First Load JS" — the route table is identical whether or not a
// path is listed below, because the allowlist is data and the import is
// dynamic. The whole integration's static footprint is +2 KB on the shared
// bundle (this gate and `sentryEnv.ts`). So adding a path here costs nothing
// before hydration and one background fetch after it.
//
// On a public page that payload buys nothing. There is no session, no child, no
// payment, no privileged call — and the marketing pages are the ones whose bounce
// rate a slow first load actually costs something. The diagnostics we would lose
// there are the diagnostics of a static page rendering.
//
// So the SDK loads on the surfaces where a failure costs a CUSTOMER rather than
// a pageview. SERVER-SIDE CAPTURE IS UNCHANGED AND STILL COVERS EVERY ROUTE,
// public ones included (`src/instrumentation.ts` + `onRequestError`) — a Server
// Component or Route Handler that throws on the landing page is still reported.
// What this file changes is only which pages ship the BROWSER bundle.
//
// ---------------------------------------------------------------------------
// THE AUTH FUNNEL IS INSTRUMENTED TOO, AND THAT IS A CORRECTION
// ---------------------------------------------------------------------------
// The first cut of this file excluded `/login`, `/register` and the password
// reset pages on the reasoning that they are public pages an anonymous visitor
// loads, and that the credential check itself happens server-side where the
// SDK already reports. Both halves of that are true and the conclusion was
// still wrong.
//
// A marketing page that breaks costs a pageview. THE LOGIN AND REGISTER FUNNEL
// THAT BREAKS COSTS A CUSTOMER — a parent who cannot create an account does not
// file a bug, they close the tab, and the failure leaves no server-side trace
// because the Server Action was never reached: a hydration error, a crashed
// form component, a thrown handler on submit are all browser-only events on the
// single most expensive path on the site. It is also the one public surface
// where a visitor has a reason to persist through a slow load, which is what
// the 161.7 KB was being weighed against.
//
// So the split is now MARKETING vs EVERYTHING ELSE, not public vs
// authenticated: `/`, `/about`, `/faq`, `/news`, `/services`, `/subjects`,
// `/terms`, `/privacy`, `/contact` and the public package catalogue stay free of
// the SDK; the auth funnel and every authenticated page load it.
//
// ---------------------------------------------------------------------------
// OWNER DECISION, AND HOW TO REVERSE IT
// ---------------------------------------------------------------------------
// This is the safe default, not a law. To instrument every page again, delete
// the `shouldLoadBrowserSentry()` call in `src/instrumentation-client.ts` and
// load unconditionally; nothing else depends on the split. To instrument one
// more area, add its path prefix to one of the two lists below — one line.
//
// ---------------------------------------------------------------------------
// WHY A DYNAMIC IMPORT AND NOT A FLAG
// ---------------------------------------------------------------------------
// An `if` around `Sentry.init()` would still ship all 161.7 KB — the cost is the
// IMPORT, not the call. Only `await import(...)` moves the SDK into its own
// chunk that a public page never requests. That is also why this module must not
// statically import `sentryOptions.ts`: that module pulls in the scrubber and the
// budget, and a static import here would drag them back into the entry bundle.

import { SENTRY_ENABLED } from "@/lib/observability/sentryEnv";

/**
 * Behind a login, holding either a child's data or a payment.
 *
 * Matching is on SEGMENT boundaries (see `shouldLoadBrowserSentry`), so
 * `/olympiads` — the parent's purchased packages — does not also switch the SDK
 * on for the public `/olympiad-packages` catalogue.
 */
export const AUTHENTICATED_PREFIXES = [
  // Parent area (the `(parent)` route group renders at the root).
  "/dashboard",
  "/children",
  "/analytics",
  "/subscription",
  "/olympiads",
  "/leaderboard",
  "/notifications",
  "/profile",
  "/help",
  // Student area.
  "/child",
  // Payment. A failure here is a parent's money and is the single most
  // expensive thing on the site to have to reconstruct from logs.
  "/checkout",
] as const;

/**
 * THE AUTH FUNNEL. Public pages, instrumented anyway — see the header.
 *
 * These are the pages where a browser-only failure is invisible everywhere
 * else: a crash during hydration or on submit never reaches the Server Action,
 * so the server SDK sees nothing, and the parent who could not register simply
 * leaves. `/auth` covers the Supabase callback and confirmation routes, where
 * a broken redirect strands a visitor who has already paid us attention.
 *
 * `/verify-email` is here for the same reason: it is the step between a
 * registration that worked and an account that can be used, and a failure on it
 * looks to the parent exactly like a registration that did not work.
 */
export const AUTH_FUNNEL_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth",
] as const;

/** Every prefix that gets the SDK, in one list for the predicate below. */
export const INSTRUMENTED_PREFIXES = [
  ...AUTHENTICATED_PREFIXES,
  ...AUTH_FUNNEL_PREFIXES,
] as const;

/**
 * Does this path get the browser SDK?
 *
 * Exported separately from the loading so it can be tested without a DOM: it is
 * a pure function of the pathname.
 */
export function shouldLoadBrowserSentry(pathname: string): boolean {
  return INSTRUMENTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Set once the SDK chunk has been fetched and `Sentry.init` has run. */
let started = false;
/** In flight, so a burst of navigations cannot start two loads. */
let starting: Promise<void> | null = null;

/**
 * Errors that happened before the SDK finished loading.
 *
 * The gap is real: the chunk is fetched asynchronously, so for the first few
 * hundred milliseconds of an authenticated page nothing is listening. Rather
 * than lose exactly the errors that fire during hydration — which are the ones
 * that break a page outright — they are buffered here and replayed once the SDK
 * is up. Three is plenty: a page that throws four times before hydrating has one
 * problem, not four.
 */
const earlyErrors: unknown[] = [];
const MAX_EARLY_ERRORS = 3;

function onEarlyError(event: ErrorEvent): void {
  if (earlyErrors.length < MAX_EARLY_ERRORS) earlyErrors.push(event.error ?? event.message);
}
function onEarlyRejection(event: PromiseRejectionEvent): void {
  if (earlyErrors.length < MAX_EARLY_ERRORS) earlyErrors.push(event.reason);
}
function listenEarly(): void {
  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);
}
function stopListeningEarly(): void {
  window.removeEventListener("error", onEarlyError);
  window.removeEventListener("unhandledrejection", onEarlyRejection);
}

/**
 * Fetch the SDK chunk and initialise it. Idempotent.
 *
 * A failed chunk fetch (offline, a deploy that rotated the filename mid-session)
 * must never take the page down with it, which is what the `catch` is for: error
 * monitoring failing to load is not an error worth breaking a parent's checkout
 * over.
 */
function startBrowserSentry(): Promise<void> {
  if (started) return Promise.resolve();
  if (starting) return starting;

  listenEarly();

  starting = (async () => {
    const [Sentry, { sharedSentryOptions }] = await Promise.all([
      import("@sentry/nextjs"),
      import("@/lib/observability/sentryOptions"),
    ]);

    Sentry.init({
      ...sharedSentryOptions,
      // Full rate on the parent- and child-facing app, deliberately. The events
      // worth having here — a failed payment, a rejected receipt, an exam that
      // would not submit — are RARE, and a sampler throws away rare events while
      // a retry loop still gets a quarter of thousands through. Volume is bounded
      // deterministically instead, by the per-issue and per-hour budget in
      // `beforeSend` (see sentryBudget.ts).
      sampleRate: 1.0,

      // DOM BREADCRUMBS ARE OFF, AND THAT IS WHAT THIS BLOCK EXISTS FOR.
      //
      // The default `Breadcrumbs` integration runs with `dom: true`
      // (@sentry/browser .../integrations/breadcrumbs.js), and a DOM crumb's
      // message is `htmlTreeAsString(target)`, which appends each element's
      // `aria-label`, `type`, `name`, `title` and `alt` attributes
      // (@sentry/core .../utils/browser.js, `_htmlElementAsString`). On the
      // pages this SDK now loads on — the authenticated ones — those attributes
      // are routinely a child's name on a dashboard card, a school on a
      // leaderboard row, or an 8-digit login ID on a child tile. One click
      // writes family data into a breadcrumb, and `scrubBreadcrumb` cannot
      // rescue it: a first name is an ordinary word with no shape for a regex
      // to match, which is exactly why this app deletes containers instead of
      // pattern-matching their contents. Not collecting it is the only control
      // that holds.
      //
      // `console: false` is the same argument one layer down. `scrubBreadcrumb`
      // already drops console crumbs; not collecting them is the independent
      // second control, and it matches the admin panel.
      //
      // fetch / xhr / history stay ON — they are the trail that makes an error
      // diagnosable, and their URLs are collapsed by `scrubUrl`.
      //
      // BROWSER SESSIONS ARE REMOVED TOO, AND FOR A DIFFERENT REASON.
      //
      // `BrowserSession` is in the default integration set and sends a SESSION
      // envelope on every page load — one when the page opens and another when
      // it ends — whether or not anything went wrong. That is Release Health,
      // and it buys nothing here: nobody reads a crash-free-sessions percentage
      // for this app, and the number it would produce is meaningless anyway now
      // that the SDK only loads on some routes.
      //
      // Two things are wrong with paying for it. It quietly consumes the
      // allowance the error budget is carefully rationing — a healthy page load
      // costing an envelope is the opposite of the posture in
      // sentryBudget.ts — and it contradicts what the privacy policy now tells
      // parents in all three languages: that Sentry receives ERROR REPORTS. A
      // beacon on every healthy page view is not an error report, and the
      // sub-processor row would be describing something narrower than what the
      // app actually does.
      //
      // A FUNCTION, NOT AN ARRAY. `integrations: [...]` is MERGED INTO the
      // defaults (@sentry/core integration.js), so the default `Breadcrumbs`
      // would survive alongside ours and the `dom: false` would read like a
      // control while doing nothing. Only the callback form can remove either
      // of these. Whatever else changes here, `replayIntegration` must never be
      // added: Session Replay records the DOM wholesale, no `dataCollection`
      // setting undoes that, and it would force a wider CSP in next.config.mjs.
      integrations: (defaults) => [
        ...defaults.filter(
          (integration) =>
            integration.name !== "Breadcrumbs" && integration.name !== "BrowserSession",
        ),
        Sentry.breadcrumbsIntegration({ console: false, dom: false }),
      ],
    });

    started = true;
    stopListeningEarly();
    for (const error of earlyErrors.splice(0)) Sentry.captureException(error);
  })().catch(() => {
    stopListeningEarly();
    earlyErrors.length = 0;
    starting = null;
  });

  return starting;
}

/**
 * Called once from `instrumentation-client.ts`, on every page load.
 *
 * It also watches for CLIENT-SIDE navigation, and that is not belt-and-braces —
 * it is the common path. A parent lands on `/` (public, no SDK), signs in, and
 * Next moves them to `/dashboard` without a document load. Checking only the
 * entry URL would leave that whole session uninstrumented until a hard refresh,
 * which is the most likely session there is.
 *
 * `pushState`/`replaceState` are patched because the History API fires no event
 * of its own; `popstate` covers Back and Forward. Both hooks remove themselves
 * once the SDK is up, so the steady state is the unpatched browser.
 */
export function armBrowserSentry(): void {
  if (!SENTRY_ENABLED || typeof window === "undefined") return;

  const check = (): void => {
    if (started || starting) return;
    if (shouldLoadBrowserSentry(window.location.pathname)) void startBrowserSentry();
  };

  const history = window.history;
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);

  const restore = (): void => {
    history.pushState = originalPush;
    history.replaceState = originalReplace;
    window.removeEventListener("popstate", afterNavigation);
  };

  function afterNavigation(): void {
    check();
    if (started || starting) restore();
  }

  history.pushState = function patchedPushState(...args: Parameters<History["pushState"]>) {
    originalPush(...args);
    afterNavigation();
  };
  history.replaceState = function patchedReplaceState(
    ...args: Parameters<History["replaceState"]>
  ) {
    originalReplace(...args);
    afterNavigation();
  };
  window.addEventListener("popstate", afterNavigation);

  check();
  if (started || starting) restore();
}

/**
 * Report an exception from a place that cannot assume the SDK is loaded — the
 * two React error boundaries, `app/error.tsx` (the root SEGMENT boundary, which
 * catches a client render crash on every page) and `app/global-error.tsx` (the
 * ROOT boundary, which catches a failure in the root layout itself). Both render
 * on marketing pages too.
 *
 * THIS IS THE ONE EXCEPTION TO THE PATH ALLOWLIST, and the exception is the
 * point. Everything above withholds the SDK from marketing pages because a
 * healthy one has nothing to diagnose. By the time this function is called the
 * page is not healthy: a boundary has fired and the visitor is looking at an
 * error screen. Downloading the SDK then costs a healthy page nothing — the
 * chunk is fetched only at that moment — and buys the one client-side failure on
 * a marketing page that is worth a round trip. Without it the landing page could
 * break for everyone and report nothing.
 *
 * It is safe to leave open because it cannot be spammed: a boundary that fires
 * in a loop still spends only the per-issue hourly budget in `beforeSend`.
 */
export function captureBrowserException(error: unknown): void {
  if (!SENTRY_ENABLED || typeof window === "undefined") return;

  void startBrowserSentry().then(async () => {
    if (!started) return;
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
  });
}
