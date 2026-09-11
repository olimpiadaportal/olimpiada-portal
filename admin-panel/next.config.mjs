/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs/config";

// Derive the Supabase host from the public project URL (API/storage calls and
// media previews — question images, news covers, wallpapers, avatars).
function supabaseHost() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) return new URL(url).hostname;
  } catch {
    // ignore malformed / missing URL and fall through to the wildcard
  }
  return "*.supabase.co";
}

// Derive the Sentry ingest origin FROM THE DSN rather than hardcoding it, for
// the same reason SUPABASE_HOST is derived: the header can then never drift
// from the value the SDK is actually configured with, and an unset DSN widens
// nothing at all (empty string → the directive is unchanged).
//
// The browser only ever talks to the ONE host embedded in the DSN — the SDK
// builds its endpoint as `<protocol>//<dsn.host>/api/<projectId>/envelope/`
// — so this is a single exact origin, never `*.sentry.io` and never a second
// directive. Non-https DSNs contribute nothing.
//
// THE CSP IS FROZEN AT BUILD TIME, AND THAT CANNOT BE FIXED IN CODE.
// These headers are computed once, while the app is being built. Setting
// NEXT_PUBLIC_SENTRY_DSN in Vercel AFTERWARDS does not rewrite the header of the
// deployment that is already built: the browser SDK would initialise, POST to
// the ingest host, and be blocked by a connect-src computed when no DSN existed.
// Nothing throws, and nothing is reported to Sentry — Sentry is the thing being
// blocked. So the only defence is to be loud about it at build time, and to say
// so in the owner-facing setup notes: SETTING THE DSN REQUIRES A REDEPLOY.
let warnedAboutMissingDsn = false;
function warnIfSentryDsnMissingAtBuildTime() {
  // Production builds and `next start` only; `next dev` recompiles constantly
  // and would turn this into wallpaper. The latch is because the config is
  // evaluated more than once per build.
  if (warnedAboutMissingDsn) return;
  if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  warnedAboutMissingDsn = true;
  console.warn(
    [
      "",
      "[sentry] NO NEXT_PUBLIC_SENTRY_DSN AT BUILD TIME (admin-panel).",
      "[sentry] This build's Content-Security-Policy therefore contains NO Sentry ingest",
      "[sentry] origin, and the browser SDK cannot send anything from it.",
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
    const parsed = new URL(dsn);
    return parsed.protocol === "https:" ? ` https://${parsed.host}` : "";
  } catch {
    return "";
  }
}

const SUPABASE_HOST = supabaseHost();
const SENTRY_INGEST_ORIGIN = sentryIngestOrigin();
const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy (Round 7 hardening) — STRICTER than the web-app:
// no iframes, and must NEVER be frameable (frame-ancestors 'none' →
// clickjacking protection for privileged UI). script-src 'unsafe-inline' is
// required by Next.js hydration inline scripts; 'unsafe-eval' is DEV-ONLY
// (react-refresh). Google Fonts (the two explicit origins only, never
// wildcards) is allowed for the Website Content "Sayt şrifti" font previews.
//
// SENTRY adds EXACTLY ONE origin, on connect-src only — the DSN's own ingest
// host. No other directive moves. In particular there is deliberately no
// `worker-src blob:` and no img-src change: those are what Session Replay
// needs, Replay is off in instrumentation-client.ts, and leaving the CSP
// narrow makes a future attempt to enable it fail loudly instead of quietly
// recording a screen full of children's names.
//
// frame-ancestors 'none' is untouched — this panel must never be frameable.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}${SENTRY_INGEST_ORIGIN}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
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
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Bulk question import posts its JSON through a Server Action, and Next's
      // DEFAULT body limit is 1 MB — below the 2 MB file cap this app validates
      // and advertises ("Max 2 MB"). A 1.5 MB file was therefore rejected by the
      // platform BEFORE any of our code ran, surfacing as an opaque action
      // failure instead of the app's own "file too large" message: the action's
      // first statement (requirePermission / requireAdmin) is never reached, so
      // nothing logs and nothing validates.
      //
      // Raised to 12 MB because an olympiad package posts EVERY selected grade's
      // file in ONE FormData, and mixed-mode files embed images as base64, which
      // inflates the payload by ~1.37x. The real ceilings stay where they are
      // enforceable and specific: BULK_MAX_FILE_BYTES per file, and the decoded
      // per-image cap in the media ingest path. This value only stops the
      // platform from failing first and silently.
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

// =====================================================================
// SENTRY BUILD WRAPPER
//
// Hand-written, NOT wizard-generated. `npx @sentry/wizard` rewrites this
// file, and this file carries the CSP, the security headers and the 12 MB
// Server Action limit with the reasoning behind each — none of which
// survives being flattened.
//
// SOURCE MAPS ARE UPLOADED AND THEN DELETED. Without upload, the whole
// integration returns `t@main-a3f2.js:1:48210`, which solves the log-
// retention problem and leaves the legibility problem. Without deletion, the
// maps stay served from /_next/static and hand any visitor the unminified
// source of the auth and accounts code — for an ADMIN panel that is the
// worse of the two failures, so it is set explicitly even though this SDK
// version already defaults it to true.
// =====================================================================
export default withSentryConfig(nextConfig, {
  // Public identifiers, not secrets. The project slug is fixed here so a
  // build cannot silently upload to the wrong project; the org slug comes
  // from SENTRY_ORG because it is account-specific.
  org: process.env.SENTRY_ORG,
  project: "olympiq-admin",

  // SECRET, build-time only, supplied by the Vercel dashboard. Never
  // NEXT_PUBLIC_ — that would ship an org-write token to every browser.
  // Absent token → the plugin warns and skips upload; the build still
  // succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // A Sentry-side failure (outage, expired token, wrong org) must not be
  // able to fail a production deploy of the admin panel. The plugin's
  // default is to THROW and stop the build; downgrade it to a warning.
  errorHandler: (err) => {
    console.warn("[sentry] source map upload skipped:", err.message);
  },

  // We deliberately do not export `onRouterTransitionStart` from
  // instrumentation-client.ts (tracing is off, so it could never fire).
  // Silence the SDK's build-time nag about it rather than adding dead code.
  suppressOnRouterTransitionStartWarning: true,

  webpack: {
    treeshake: {
      // Strip the SDK's own debug logging from the bundle.
      removeDebugLogging: true,
      // REMOVE THE TRACING CODE ENTIRELY, which is the only thing that really
      // turns tracing off. Omitting `tracesSampleRate` stops spans being
      // sampled, but @sentry/nextjs still pushes `browserTracingIntegration()`
      // into the browser's default integrations unconditionally — except when
      // `__SENTRY_TRACING__` is false (client/index.js), which is exactly what
      // this flag sets. Smaller bundle, and no tracing stack to load.
      removeTracing: true,
    },
    // Component names are not PII, but they are payload the events do not
    // need and bundle size nobody asked for. (Top-level
    // `reactComponentAnnotation` is deprecated in 10.74.0 — this is the
    // spelling that does not warn.)
    reactComponentAnnotation: { enabled: false },
  },
});
