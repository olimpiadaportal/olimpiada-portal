// Server- and edge-side Sentry init, via Next.js's `instrumentation` hook.
//
// `@sentry/nextjs@10.74.0` requires BOTH halves of this file:
//   * `register()` must call `Sentry.init` — a standalone `sentry.server.config.ts`
//     is no longer supported and the SDK warns about it
//     (config/webpack.js:326-338).
//   * `onRequestError` must be exported, or errors thrown inside nested React
//     Server Components are never reported at all (config/webpack.js:320-325).
//
// Everything that decides WHAT may leave the server lives in
// `@/lib/observability/sentryOptions` — read the header there before changing
// anything here. Request bodies, cookies, headers, query strings and
// stack-frame locals are all switched OFF, which on this app means the
// child-login body (`{ child_id, password }`), the live Supabase session
// cookie, and any local holding SUPABASE_SERVICE_ROLE_KEY or a database URL.
import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/observability/sentryOptions";

/**
 * The `integrations` option, typed off `Sentry.init` itself rather than by
 * importing `Integration` from `@sentry/core` — that package is a transitive
 * dependency, not a declared one, and `@sentry/nextjs` does not re-export the
 * type. Deriving it keeps the callback's parameter inferred and the import list
 * honest.
 */
type SentryIntegrationsOption = NonNullable<Parameters<typeof Sentry.init>[0]>["integrations"];

export async function register() {
  const runtime = process.env.NEXT_RUNTIME;
  if (runtime !== "nodejs" && runtime !== "edge") return;

  // DEDUPE IS ADDED BY HAND, ON NODE ONLY, AND THAT ASYMMETRY IS NOT A
  // TYPO — it is the actual default-integration list of each runtime, verified
  // in the installed packages:
  //
  //   @sentry/vercel-edge  getDefaultIntegrations() -> dedupeIntegration() is
  //                        the FIRST entry (build/cjs/index.js).
  //   @sentry/node-core    getDefaultIntegrations() -> inboundFilters,
  //                        functionToString, linkedErrors, requestData,
  //                        systemError, conversationId, console, http,
  //                        nativeNodeFetch, onUncaughtException,
  //                        onUnhandledRejection, contextLines, localVariables,
  //                        nodeContext, childProcess, processSession, modules.
  //                        NO DEDUPE (build/cjs/sdk/index.js).
  //
  // The browser has it too, so Node was the one runtime in this app where the
  // identical error thrown twice in a row counted twice against a quota that
  // cannot be topped up — and Node is where a retry loop or a Supabase outage
  // repeats an error hardest. Dedupe only catches the immediately-preceding
  // duplicate, so it is a cheap first line, not the cap; the cap is the rolling
  // budget in `sentryOptions.budgetedBeforeSend`.
  const integrations: SentryIntegrationsOption =
    runtime === "nodejs"
      ? (defaults) => [...defaults, Sentry.dedupeIntegration()]
      : undefined;

  // The same options in both runtimes. They are initialised separately because
  // `@sentry/nextjs` resolves to a different build per runtime (Node vs edge)
  // and each needs its own `init` call.
  Sentry.init({
    ...sharedSentryOptions,
    // Full rate for server errors, deliberately. Route handlers and Server
    // Actions are where the payment and entitlement failures this project
    // exists to capture actually throw, they are RARE, and a sampler is the
    // wrong instrument for rare events: at 0.25 three out of four one-off
    // payment failures are silently thrown away, while a retry loop — which
    // sampling is imagined to protect against — still sends a quarter of
    // thousands. Volume is bounded deterministically instead, by the per-issue
    // and per-hour budget in `beforeSend`.
    sampleRate: 1.0,
    integrations,
  });
}

// Errors from nested React Server Components reach Sentry only through this
// hook. `captureRequestError` applies the same `beforeSend` scrubber as every
// other event, so the request URL it attaches is reduced to its route shape
// (`/children/:id`) before anything is sent.
export const onRequestError = Sentry.captureRequestError;
