// =====================================================================
// NEXT.JS INSTRUMENTATION HOOK — ADMIN PANEL
//
// Next calls register() once per runtime at startup. The two Sentry runtime
// configs are imported here rather than auto-detected: @sentry/nextjs 10.74.0
// does NOT pick up sentry.server.config.ts / sentry.edge.config.ts on its
// own (verified against the installed package), so an import that looks
// redundant is in fact the only thing that initialises the SDK on the
// server.
//
// The `await import(...)` is per-runtime on purpose. The edge bundle must not
// pull in @sentry/node, and the node bundle must not pull in the edge SDK; a
// top-level static import of both would bundle both into each.
// =====================================================================
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Server Components, Route Handlers and generateMetadata throw INSIDE the
// React render, where no try/catch of ours sees them. Next hands those to
// this hook, and without it the whole server-side half of the app reports
// nothing — which is precisely the class of failure this integration exists
// to catch (a payment or IAP receipt path failing two days before anyone
// asks about it, after Vercel's one-day log retention has dropped it).
//
// PRIVACY NOTE: captureRequestError copies the incoming request HEADERS into
// the event's processing metadata. That is neutralised twice over —
// `dataCollection.httpHeaders.request: false` stops requestDataIntegration
// attaching them, and scrubEvent() deletes event.request.headers outright.
// It also sets contexts.nextjs.request_path, which scrubEvent() collapses
// through scrubUrl() so ids and query strings never survive.
export const onRequestError = Sentry.captureRequestError;
