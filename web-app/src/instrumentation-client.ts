// Browser-side Sentry GATE. This file no longer initialises the SDK; it decides
// whether the SDK is worth downloading at all, and `browserSentry.ts` does the
// rest behind a dynamic import.
//
// FILE LOCATION IS NOT A STYLE CHOICE. `@sentry/nextjs@10.74.0` looks for
// `src/instrumentation-client.ts` (config/webpack.js:349-352) and warns that the
// older `sentry.client.config.ts` "will no longer work" under Turbopack
// (config/webpack.js:214). Next.js 15.5 loads this file before any application
// code in the browser. Do not move or rename it.
//
// WHY IT MUST STAY TINY: whatever this module imports STATICALLY lands in the
// client entry bundle, which every visitor downloads — including the anonymous
// one reading the landing page. The Sentry browser SDK measures +161.7 KB
// minified (+45%) and, on a public page, diagnoses nothing. So there is no
// `import * as Sentry from "@sentry/nextjs"` here any more, and there must not
// be one again: an `if` around `Sentry.init()` would still ship every byte,
// because the cost is the import and not the call.
//
// Everything that decides WHAT may leave the browser still lives in
// `@/lib/observability/sentryOptions` — read the header there before changing
// anything. This app holds minors' personal data and neither store declaration
// lists Sentry as a recipient yet.
//
// SERVER-SIDE CAPTURE IS NOT AFFECTED by any of this: `src/instrumentation.ts`
// initialises the Node and edge SDKs for every route, public ones included.
import { armBrowserSentry } from "@/lib/observability/browserSentry";

armBrowserSentry();

// NOTE: `onRouterTransitionStart` is deliberately NOT exported. It exists only
// to instrument NAVIGATIONS as performance transactions, and tracing is off —
// `tracesSampleRate` is not written anywhere (writing it as `0` would ENABLE the
// span machinery; see sentryOptions.ts) and `webpack.treeshake.removeTracing` in
// next.config.mjs removes the tracing code from the bundle outright. The SDK
// warns when the export is missing, so `suppressOnRouterTransitionStartWarning`
// is set in next.config.mjs — the warning is suppressed because the feature is
// intentionally unused, not because the setup is incomplete.
