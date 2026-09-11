// `withSentryConfig` is imported from the `/config` subpath deliberately: the
// re-export on the package root is deprecated in 10.x and is removed in v11.
import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */

// Derive the Supabase host from the public project URL so next/image is
// permitted to optimize + resize public-bucket assets (news covers, wallpapers)
// and so the CSP below can allow API/storage calls to exactly our project.
// L5: a missing/malformed NEXT_PUBLIC_SUPABASE_URL is a hard configuration
// error — THROW at config evaluation instead of silently widening the CSP and
// image allow-list to the shared *.supabase.co wildcard (any Supabase project
// would have been allowed).
function supabaseHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (url) return new URL(url).hostname;
  } catch {
    // fall through to the explicit error below
  }
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL must be set to the project URL (e.g. https://xyz.supabase.co) " +
      "before building/starting web-app — the CSP and image allow-list are derived from it.",
  );
}

const SUPABASE_HOST = supabaseHost();
const isDev = process.env.NODE_ENV === "development";

// Payment redirect targets for the CSP's `form-action`.
//
// The AzeriCard/ABB rail is a FULL HTTP REDIRECT: our page renders a form whose
// action is the acquirer's hosted payment page and the cardholder submits it
// (never an iframe, never a card form of ours — that is what keeps us on PCI
// SAQ A). `form-action 'self'` alone would block exactly that submission, so
// the gateway origins are listed EXPLICITLY here. Never widen this to a
// wildcard, and never add an origin that is not a payment gateway.
//
// Both documented AzeriCard MPI origins are listed unconditionally so a build
// whose AZERICARD_GATEWAY_URL happens to be unset does not fail at the CSP
// layer with nothing in the console to explain it; anything the environment
// actually names is unioned in on top.
function paymentFormOrigins() {
  const origins = new Set([
    "https://testmpi.3dsecure.az", // AzeriCard sandbox
    "https://mpi.3dsecure.az", // AzeriCard production
  ]);
  for (const name of ["AZERICARD_GATEWAY_URL", "AZERICARD_TOKEN_URL"]) {
    const value = process.env[name];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:") origins.add(url.origin);
    } catch {
      // A malformed value is reported by describeConfigProblems() at runtime;
      // it must not take the whole build down here.
    }
  }
  return [...origins];
}

// The ONE origin Sentry's browser SDK talks to, for the CSP's `connect-src`.
//
// Derived from the DSN rather than hard-coded, for the same reason
// supabaseHost() above is derived from the project URL: the CSP can then never
// drift from the configured endpoint, and a checkout with no DSN (local dev,
// any environment where Sentry is off) widens the policy by exactly nothing.
//
// `@sentry/core@10.74.0` builds its ingest endpoint as
// `${protocol}//${dsn.host}${port}/api/<projectId>/envelope/` (build/cjs/api.js),
// so the DSN's host is the only origin the browser ever contacts. That makes
// this entry exact: NOT `*.sentry.io`, NOT `https://*.ingest.sentry.io`, and
// never a second directive. If Session Replay is ever switched on it will also
// need `worker-src blob:` — treat needing to widen this as the tripwire it is.
//
// THE CSP IS FROZEN AT BUILD TIME, AND THAT IS A TRAP WITH NO CODE FIX.
// Headers are computed here, once, while the app is being built. Setting
// NEXT_PUBLIC_SENTRY_DSN in the Vercel dashboard afterwards does NOT rewrite the
// header of the already-built deployment: the browser SDK would initialise, try
// to POST to the ingest host, and be blocked by a `connect-src` that was
// computed when no DSN existed. Nothing throws, nothing is logged to Sentry (it
// is Sentry that is blocked), and the only visible symptom is a CSP violation in
// a console nobody is watching.
//
// It cannot be fixed from inside this file — the value simply is not known yet —
// so the next best thing is to make it LOUD: warn at build time, and say so in
// the owner-facing setup notes. A DSN set after a build REQUIRES A REDEPLOY.
let warnedAboutMissingDsn = false;
function warnIfSentryDsnMissingAtBuildTime() {
  // Production builds and `next start` only. `next dev` recompiles constantly
  // and would turn this into wallpaper; the config is also evaluated more than
  // once per build, hence the latch.
  if (warnedAboutMissingDsn) return;
  if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  warnedAboutMissingDsn = true;
  console.warn(
    [
      "",
      "[sentry] NO NEXT_PUBLIC_SENTRY_DSN AT BUILD TIME.",
      "[sentry] The Content-Security-Policy for this build therefore contains NO Sentry",
      "[sentry] ingest origin, and the browser SDK cannot send anything from it.",
      "[sentry] Setting the variable in Vercel LATER is not enough: the CSP is baked into",
      "[sentry] this deployment. Set it, then REDEPLOY, or browser events are silently",
      "[sentry] blocked while the SDK still reports itself as initialised.",
      "",
    ].join("\n"),
  );
}

function sentryIngestOrigin() {
  warnIfSentryDsnMissingAtBuildTime();
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return "";
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? ` https://${url.host}` : "";
  } catch {
    // A malformed DSN disables the SDK at runtime; it must not widen the CSP
    // here, and it must not take the build down either.
    return "";
  }
}

// Content-Security-Policy (Round 7 hardening).
// - script-src needs 'unsafe-inline' for Next.js hydration inline scripts and
//   our no-flash theme script; 'unsafe-eval' is DEV-ONLY (react-refresh).
//   (Future hardening: nonce-based CSP via middleware.)
// - style-src 'unsafe-inline' — Next injects inline styles; Google Fonts CSS.
// - fonts: the student area loads JetBrains Mono from Google Fonts.
// - connect-src: Supabase REST/Auth/Storage (+ websocket), plus the single
//   Sentry ingest host derived from the DSN (empty when no DSN is configured).
// - frame-src: the Google Maps embed on the Contact page.
// - form-action: 'self' plus the AzeriCard payment gateway origins only — the
//   checkout redirect is a form POST to the acquirer's hosted page.
// - frame-ancestors 'self': the site must not be framed by other origins.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}${sentryIngestOrigin()}`,
  "frame-src https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${paymentFormOrigins().join(" ")}`,
  "frame-ancestors 'self'",
].join("; ");

// Baseline security headers for every route. HSTS is ignored by browsers over
// plain HTTP (local dev) and takes effect automatically once served via HTTPS.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Never expose framework fingerprinting for free.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // R10 (F9): optimized variants (news covers etc.) are immutable uploads —
    // cache them for 31 days so revisits don't re-optimize and covers paint
    // instantly instead of popping in late.
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async redirects() {
    return [
      // Services rename: /services is the canonical page; keep the old
      // /pricing URL working forever (bookmarks, indexed links).
      { source: "/pricing", destination: "/services", permanent: true },
    ];
  },
};

// Sentry build-time wrapper. It ONLY adds the webpack plugin that uploads
// source maps and injects the release id — every runtime decision (what is
// collected, what is scrubbed, what is sampled) lives in
// `src/lib/observability/sentryOptions.ts`.
//
// Required environment (Vercel dashboard → this project, Production + Preview;
// none of these belong in a tracked file):
//   SENTRY_ORG         — org slug. Read from the environment by the plugin.
//   SENTRY_PROJECT     — project slug, e.g. `olympiq-web`. Same.
//   SENTRY_AUTH_TOKEN  — SECRET, build-time only, scoped to `project:releases`.
//                        Never prefix it NEXT_PUBLIC_ — that would ship an
//                        org-write token to every browser.
// With any of them missing the build still SUCCEEDS: the plugin warns and skips
// the upload, so a misconfiguration degrades legibility rather than breaking
// deploys.
export default withSentryConfig(nextConfig, {
  // Quiet locally, verbose in CI where the log is the only place to see that an
  // upload was skipped.
  silent: !process.env.CI,
  // Also upload the maps for files served from outside /_next/static/chunks/,
  // otherwise some framework frames stay minified.
  widenClientFileUpload: true,
  sourcemaps: {
    // NOT OPTIONAL. Without this the generated .map files stay in the deployed
    // /_next/static output and are publicly fetchable, which would hand anyone
    // the full unminified source of the auth and payment code.
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      // Strip the SDK's own debug logging from the client bundle. (The
      // top-level `disableLogger` flag does the same thing but is deprecated in
      // 10.x and prints a warning on every build.)
      removeDebugLogging: true,
      // REMOVE THE TRACING CODE FROM THE BUNDLE, which is the only thing that
      // actually turns tracing off in this SDK. Omitting `tracesSampleRate`
      // stops SPANS being sampled, but @sentry/nextjs still pushes
      // `browserTracingIntegration()` into the browser's default integrations
      // UNCONDITIONALLY — the one exception being `__SENTRY_TRACING__ === false`
      // (client/index.js: `if (typeof __SENTRY_TRACING__ === "undefined" ||
      // __SENTRY_TRACING__)`). This flag is what sets it, so the tracing stack
      // is neither loaded nor shipped. It also makes the lazily-loaded SDK chunk
      // measurably smaller for the authenticated pages that do download it.
      removeTracing: true,
    },
  },
  // No build telemetry to Sentry; the SDK is here to answer one question.
  telemetry: false,
  // `src/instrumentation-client.ts` deliberately does not export
  // `onRouterTransitionStart` — that hook exists only to record navigations as
  // performance transactions, and tracing is off because `tracesSampleRate` is
  // ABSENT, not because it is zero. The distinction is the setting:
  // `hasSpansEnabled()` tests `!= null`, so a literal 0 would read as "tracing
  // enabled, sampled at zero" and start the span machinery on every navigation.
  // `removeTracing: true` above then strips the code from the bundle outright.
  // The warning would be advertising a feature we have chosen not to run.
  suppressOnRouterTransitionStartWarning: true,
});
