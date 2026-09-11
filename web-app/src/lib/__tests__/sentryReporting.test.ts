// WHAT ACTUALLY REPORTS, AND WHAT QUIETLY SENDS WHEN NOTHING IS WRONG.
//
// Two opposite failures, asserted together because the round that produced them
// produced both at once — an over-correction on noise that ended up losing the
// events the tool exists to capture, while still paying for envelopes nobody
// reads:
//
//   1. THE ROOT SEGMENT BOUNDARY WAS SILENT. `src/app/error.tsx` — not
//      `global-error.tsx` — is what React reaches when a component throws during
//      render on an ordinary page. `global-error.tsx` catches only a failure in
//      the ROOT LAYOUT. So while `error.tsx` captured nothing, a React render
//      crash on an authenticated page (a parent's dashboard blanking out, a
//      child's exam refusing to draw) was invisible, which is the most common
//      client-side failure there is.
//
//   2. `BrowserSession` SENT AN ENVELOPE ON EVERY HEALTHY PAGE LOAD. It is a
//      DEFAULT integration; nobody reads a crash-free-sessions percentage for
//      this app, the number would be meaningless anyway now that the SDK loads
//      on only some routes, and a beacon on every healthy page view is not the
//      "error reports" the trilingual privacy row promises parents.
//
// SOURCE-LEVEL ASSERTIONS, and that is not laziness. Importing any of these
// modules executes `Sentry.init()` or mounts a React boundary; what is being
// asserted is that a specific call and a specific filter EXIST at the shipped
// call site, which is exactly the shape a refactor silently deletes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Read a source file with WHOLE-LINE comments stripped.
 *
 * These files document at length the things they deliberately do NOT do —
 * "never add replayIntegration", "BrowserSession is removed" — so matching raw
 * text would let the prose satisfy the assertion the prose exists to explain.
 * Trailing comments on a code line are left alone: cutting them would also cut
 * through string literals.
 */
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const BOUNDARIES = [
  ["the root SEGMENT boundary (every page)", "../../app/error.tsx"],
  ["the ROOT boundary (root layout only)", "../../app/global-error.tsx"],
] as const;

describe("a client render crash reaches Sentry", () => {
  it.each(BOUNDARIES)("%s captures", (_label, file) => {
    const source = read(file);
    // It must go through `captureBrowserException`, not a bare
    // `Sentry.captureException`: both boundaries render on marketing pages,
    // where the 161.7 KB browser SDK is deliberately not downloaded, and that
    // helper is what fetches the chunk at the moment a page has actually
    // crashed. A static `import * as Sentry` here would also drag the whole SDK
    // back into the client entry bundle and undo the route split.
    expect(source).toContain("captureBrowserException");
    expect(source).toContain("@/lib/observability/browserSentry");
    expect(source).not.toContain('import * as Sentry from "@sentry/nextjs"');
  });

  it.each(BOUNDARIES)("%s does not double-bill an error the server already filed", (_l, file) => {
    // Next.js attaches `digest` ONLY to an error that crossed the server
    // boundary, and `onRequestError` in src/instrumentation.ts has already filed
    // that one. Capturing it again would bill one failure twice against an
    // allowance of 5,000 a month for the whole organisation that cannot be
    // topped up — and would do it exactly when the app is broken and throwing
    // hardest.
    expect(read(file)).toContain("if (error.digest) return;");
  });

  it("the SEGMENT boundary is the one that matters, so it is not the silent one", () => {
    // The bug this whole file exists for: `global-error.tsx` reported and
    // `error.tsx` did not, which reads like coverage and is not. If either
    // stops capturing, the app goes blind for the case the OTHER one never sees.
    for (const [, file] of BOUNDARIES) {
      expect(read(file), file).toMatch(/captureBrowserException\(error\)/);
    }
  });
});

describe("nothing is sent when nothing is wrong", () => {
  const init = read("../observability/browserSentry.ts");

  it("removes BrowserSession, so a healthy page load costs no envelope", () => {
    expect(init).toContain('integration.name !== "BrowserSession"');
  });

  it("removes it with the CALLBACK form, which is the only form that can", () => {
    // `integrations: [...]` is MERGED INTO the defaults (@sentry/core
    // integration.js), so an array cannot remove a default integration — the
    // default `BrowserSession` and `Breadcrumbs` would both survive and the
    // filter would read like a control while doing nothing.
    expect(init).toContain("integrations: (defaults)");
    expect(init).toContain("defaults.filter(");
  });

  it("keeps Session Replay unreachable and tracing absent rather than zero", () => {
    // Replay records the DOM wholesale: on this app that is a video of a
    // child's name, school and 8-digit id, and no beforeSend can unmake it.
    expect(init).not.toContain("replayIntegration");
    expect(init).not.toContain("replaysSessionSampleRate");
    // A literal 0 would read to `hasSpansEnabled()` as "tracing on, sampled at
    // zero" and start the span machinery on every navigation.
    expect(init).not.toContain("tracesSampleRate");
  });

  it("does not thin events with a sampler on top of the budget", () => {
    // sampleRate runs AFTER beforeSend, so a rate below 1 would charge the
    // budget for events the sampler then discards — and a one-off failure (a
    // rejected payment) is exactly what a sampler is guaranteed to lose.
    expect(init).toContain("sampleRate: 1.0");
  });
});
