// WHETHER SENTRY IS ON AT ALL, AND WHICH DEPLOYMENT IT WOULD REPORT AS.
//
// This is its own module for one reason: `instrumentation-client.ts` must be
// able to ask "is Sentry configured here?" WITHOUT importing anything that
// drags the SDK, the scrubber or the budget into the browser's initial bundle.
// Those now live behind a dynamic import (see `browserSentry.ts`), and a static
// import of `sentryOptions.ts` from the gate would have quietly undone that by
// pulling the scrubber's regex tables onto every public page.
//
// Both `sentryOptions.ts` and `browserSentry.ts` read these constants, so the
// enablement rule has exactly one definition and the two cannot drift.
//
// NO SECRET IS READ HERE. `NEXT_PUBLIC_SENTRY_DSN` is a write-only ingest
// endpoint, public by design, and it lives in the Vercel dashboard and an
// untracked `.env.local` — never in a tracked file.

/**
 * The DSN. Public by design, which is why it carries the `NEXT_PUBLIC_` prefix
 * and reaches the browser bundle. Unset — any checkout that has not configured
 * it — means the SDK is inert, never that a build fails.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * WHICH VERCEL DEPLOYMENT THIS IS — "production", "preview", "development", or
 * UNDEFINED when the process is not running on Vercel at all.
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is the client-visible twin Vercel injects
 * automatically for Next.js projects; `VERCEL_ENV` is the server-side one and is
 * deliberately not `NEXT_PUBLIC_`, so in the browser only the first is defined.
 * Reading both means one constant works in all three runtimes.
 */
export const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;

/**
 * Which deployment an event came from, so a preview branch's errors are never
 * filed against production. Falls back to NODE_ENV off Vercel, where the SDK is
 * disabled anyway and the value only ever appears in a local debug log.
 */
export const SENTRY_ENVIRONMENT = VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

/**
 * NOTHING IS SENT UNLESS THIS IS A REAL VERCEL DEPLOYMENT.
 *
 * THE GATE IS VERCEL_ENV, NOT NODE_ENV, and the difference is a hole this
 * project can actually fall into. `NODE_ENV === "production"` is true for ANY
 * production BUILD, including one running on the owner's laptop: `next build &&
 * next start` with a DSN in `.env.local` — exactly how a production build gets
 * checked before a deploy — would have shipped real events tagged
 * `environment: production`, from a machine with test data in it, out of a
 * 5,000/month allowance that cannot be topped up. `VERCEL_ENV` is set only by
 * Vercel itself and is absent on every local run, which is the distinction that
 * was wanted all along.
 *
 * Preview deploys DO report (bounded by the budget, and tagged "preview" so they
 * never pollute production). If the owner would rather spend the whole allowance
 * on production, delete the `|| VERCEL_ENV === "preview"` clause — that is the
 * entire change.
 */
export const SENTRY_ENABLED =
  !!SENTRY_DSN && (VERCEL_ENV === "production" || VERCEL_ENV === "preview");
