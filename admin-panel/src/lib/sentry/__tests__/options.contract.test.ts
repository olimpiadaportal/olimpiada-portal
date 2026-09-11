import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as options from "../options";
import {
  SENTRY_BUDGET_LIMITS,
  SENTRY_DATA_COLLECTION,
  SENTRY_ERROR_SAMPLE_RATE,
} from "../options";

// =====================================================================
// A CONTRACT TEST, not a unit test.
//
// The failure it exists to catch is not a wrong return value — it is a
// silently ignored option key. `dataCollection` and `sendDefaultPii` are the
// same setting at two different SDK versions; this repo runs BOTH (the two
// Next apps on @sentry/core 10.74.0 use dataCollection, the mobile app on
// 10.12.0 uses sendDefaultPii), and that difference is invisible inside the
// config files themselves. A config copied from the mobile app into this one
// would type-check, run, report nothing wrong, and ship full PII.
//
// It also guards the inversion documented in options.ts: supplying a
// dataCollection object activates PERMISSIVE defaults for every field left
// out, so "fields present" is itself the assertion — a half-written block is
// worse than no block at all.
// =====================================================================

const ROOT = process.cwd();

/**
 * Read a source file with its COMMENTS REMOVED.
 *
 * These files document the options they reject — "never sendDefaultPii",
 * "no replayIntegration", "not a sentry.io wildcard" — so matching raw text
 * would make the prose fail the test the prose exists to explain. Only
 * whole-line comments and block comments are stripped, never a trailing
 * comment on a code line: a naive split would also cut a URL out of a
 * template literal and turn a real wildcard into an invisible pass.
 */
const read = (relativePath: string) =>
  readFileSync(join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const RUNTIME_CONFIGS = [
  "src/instrumentation-client.ts",
  "src/sentry.server.config.ts",
  "src/sentry.edge.config.ts",
];

describe("SENTRY_DATA_COLLECTION", () => {
  it("writes out every category the SDK would otherwise default to ON", () => {
    // Omitting any one of these does not mean "keep the safe default"; it
    // means "take the permissive spec default". Listed by name so that an
    // SDK upgrade adding a category makes this test fail loudly.
    expect(Object.keys(SENTRY_DATA_COLLECTION).sort()).toEqual(
      [
        "cookies",
        "databaseQueryData",
        "frameContextLines",
        "genAI",
        "graphQL",
        "httpBodies",
        "httpHeaders",
        "stackFrameVariables",
        "urlQueryParams",
        "userInfo",
      ].sort(),
    );
  });

  it("turns every PII category off", () => {
    expect(SENTRY_DATA_COLLECTION.userInfo).toBe(false);
    expect(SENTRY_DATA_COLLECTION.cookies).toBe(false);
    expect(SENTRY_DATA_COLLECTION.httpHeaders).toEqual({
      request: false,
      response: false,
    });
    // The documented "collect no bodies" value. An OMITTED httpBodies
    // collects all four targets — including the incoming Server Action body.
    expect(SENTRY_DATA_COLLECTION.httpBodies).toEqual([]);
    expect(SENTRY_DATA_COLLECTION.urlQueryParams).toBe(false);
    expect(SENTRY_DATA_COLLECTION.databaseQueryData).toBe(false);
    // The line that keeps SUPABASE_SERVICE_ROLE_KEY and OLIMPIADA_*_DB_URL
    // out of a stack frame.
    expect(SENTRY_DATA_COLLECTION.stackFrameVariables).toBe(false);
  });

  it("attaches no source context, matching the web app rather than drifting from it", () => {
    // This was 5 here and 0 in web-app, undecided, inside a block whose whole
    // premise is that the apps must not drift. 0 in both: the frame points into
    // the BUILT bundle, where a "line" is thousands of characters of minified
    // modules with every NEXT_PUBLIC_* value already inlined, and the Sentry UI
    // shows real source from the uploaded maps anyway.
    expect(SENTRY_DATA_COLLECTION.frameContextLines).toBe(0);
  });
});

describe("quota posture", () => {
  it("keeps tracing off by OMITTING the option, never by setting it to 0", () => {
    // `hasSpansEnabled()` tests `options.tracesSampleRate != null`, and zero is
    // not nullish — so a literal 0 reads as "tracing enabled, sampled at zero":
    // spans are created and measured on every request and only the sending is
    // suppressed. The constant that used to hold that 0 is gone, and no runtime
    // config may write the key back.
    expect("SENTRY_TRACES_SAMPLE_RATE" in options).toBe(false);
    for (const file of RUNTIME_CONFIGS) {
      expect(read(file)).not.toContain("tracesSampleRate");
      expect(read(file)).not.toContain("tracesSampler");
    }
  });

  it("removes the tracing code from the bundle at build time", () => {
    // The option alone cannot do it: @sentry/nextjs pushes
    // browserTracingIntegration() into the browser defaults unconditionally
    // unless `__SENTRY_TRACING__` is false, which is what this flag sets.
    expect(read("next.config.mjs")).toContain("removeTracing: true");
  });

  it("uses ONE quota mechanism, and it is the budget rather than the sampler", () => {
    // The 0.25 that used to be here stacked two mechanisms badly. `sampleRate`
    // runs AFTER `beforeSend` (@sentry/core client.js: _prepareEvent →
    // beforeSend → _isSampled), so the budget was CHARGED for events the
    // sampler then discarded — and a one-off admin error, the single occurrence
    // the operator is asking about, had a 75% chance of never arriving. A
    // sampler is guaranteed to lose exactly the rare event; the budget is
    // deterministic and keeps the FIRST occurrence.
    expect(SENTRY_ERROR_SAMPLE_RATE).toBe(1.0);
    // The app's smaller share of the org-wide 5,000/month is expressed in the
    // budget's numbers instead, which is where it belongs.
    expect(SENTRY_BUDGET_LIMITS.perDay).toBeLessThanOrEqual(40);
  });

  it.each(RUNTIME_CONFIGS)("%s does not thin events with a sample rate", (file) => {
    // If a fractional rate ever comes back, the budget silently starts paying
    // for events that are thrown away again.
    expect(read(file)).not.toMatch(/sampleRate:\s*0/);
  });
});

describe("runtime config sources", () => {
  it.each(RUNTIME_CONFIGS)("%s uses dataCollection and never sendDefaultPii", (file) => {
    const source = read(file);
    expect(source).toContain("dataCollection");
    // Setting both makes sendDefaultPii a no-op — a safety net that is not
    // attached to anything reads far worse than no safety net.
    expect(source).not.toContain("sendDefaultPii");
  });

  it.each(RUNTIME_CONFIGS)("%s shares the one options module", (file) => {
    expect(read(file)).toContain("@/lib/sentry/options");
  });

  it.each(RUNTIME_CONFIGS)("%s scrubs before sending", (file) => {
    const source = read(file);
    expect(source).toContain("beforeSend");
    expect(source).toContain("beforeBreadcrumb");
  });

  it("never calls Sentry.setUser anywhere in the app", () => {
    // setUser is explicitly EXEMPT from the SDK's PII controls: the docs say
    // those options govern what the SDK sends by default, not what was set
    // deliberately. One call would undo every control above, including with
    // a UUID — a stable per-child identifier is still an identifier.
    for (const file of [
      ...RUNTIME_CONFIGS,
      "src/app/global-error.tsx",
      // The segment boundary joined this list when it started capturing: a file
      // that calls captureException is exactly the kind of file where someone
      // later adds "just the staff email, for context".
      "src/app/error.tsx",
    ]) {
      expect(read(file)).not.toContain("setUser");
    }
  });

  it("does not collect DOM or console breadcrumbs on the browser", () => {
    // A DOM crumb's message is `htmlTreeAsString(target)`, which appends each
    // element's aria-label / title / alt / name. In THIS panel a button's
    // accessible name is routinely a child's name, and no beforeBreadcrumb can
    // recognise an ordinary word — so it is not collected at all.
    const source = read("src/instrumentation-client.ts");
    expect(source).toContain("dom: false");
    expect(source).toContain("console: false");
    // A merged ARRAY would leave the default Breadcrumbs integration in place
    // and the dom:false would do nothing; only the callback form removes it.
    expect(source).toContain('integration.name !== "Breadcrumbs"');
  });

  it("sends no session envelope on a healthy page load", () => {
    // BrowserSession is a DEFAULT integration and posts a session envelope on
    // every page load whether or not anything broke. Nobody reads a crash-free
    // percentage for this panel, it quietly spends the allowance the budget is
    // rationing, and it is not the "error reports" the privacy policy describes.
    expect(read("src/instrumentation-client.ts")).toContain(
      'integration.name !== "BrowserSession"',
    );
  });

  it("reports a client render crash from BOTH boundaries, not just the root one", () => {
    // `src/app/error.tsx` is the root SEGMENT boundary — the one React actually
    // reaches when a component throws during render on an ordinary admin
    // screen. `global-error.tsx` catches only a failure in the ROOT LAYOUT, so
    // it never fires for that case. This panel shipped with the segment
    // boundary capturing NOTHING, which reads like coverage (the root one
    // reported) and is not: an Accounts table blanking out, a bulk-import
    // screen refusing to draw, all invisible. The web app had the identical
    // hole in `web-app/src/app/error.tsx`.
    for (const file of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("Sentry.captureException(error)");
      // Next.js attaches `digest` ONLY to an error that crossed the server
      // boundary, and `onRequestError` in src/instrumentation.ts has already
      // filed that one. Capturing it again bills one failure twice against an
      // allowance of 5,000 a month org-wide that cannot be topped up.
      expect(source, file).toContain("if (error.digest) return;");
    }
  });

  it("splits the ignore list by runtime — the browser's is not the server's", () => {
    // One shared list is what made a Supabase outage produce ZERO events: every
    // transport string in it was treated as noise in both runtimes, and on the
    // server a failed connection is the incident, not the noise.
    expect(read("src/instrumentation-client.ts")).toContain(
      "BROWSER_TRANSPORT_IGNORED_ERRORS",
    );
    for (const file of ["src/sentry.server.config.ts", "src/sentry.edge.config.ts"]) {
      const source = read(file);
      expect(source).toContain("SERVER_IGNORED_ERRORS");
      expect(source).not.toContain("BROWSER_TRANSPORT_IGNORED_ERRORS");
    }
  });

  it("keeps Session Replay off on the browser, by omission rather than by zero", () => {
    const source = read("src/instrumentation-client.ts");
    // The rates used to be written as 0. Absent is stronger: a sample-rate key
    // that EXISTS is what tells the SDK the feature is configured, and 0 only
    // says "send none of what was recorded".
    expect(source).not.toContain("replaysSessionSampleRate");
    expect(source).not.toContain("replaysOnErrorSampleRate");
    // Replay records the DOM. On these pages that is a video of a child's
    // name, school and 8-digit id, and no beforeSend can unmake it.
    expect(source).not.toContain("replayIntegration");
  });
});

describe("next.config.mjs", () => {
  const source = read("next.config.mjs");

  it("adds exactly one Sentry origin, derived from the DSN", () => {
    expect(source).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(source).toContain("${SENTRY_INGEST_ORIGIN}");
  });

  it("never widens the CSP with a wildcard", () => {
    expect(source).not.toContain("*.sentry.io");
    expect(source).not.toContain("*.ingest");
  });

  it("leaves the anti-clickjacking posture alone", () => {
    // This panel must never be frameable, Sentry or no Sentry.
    expect(source).toContain('"frame-ancestors \'none\'"');
    expect(source).toContain('"frame-src \'none\'"');
  });

  it("deletes uploaded source maps rather than serving them", () => {
    // Left in /_next/static they hand any visitor the unminified source of
    // the auth and accounts code.
    expect(source).toContain("deleteSourcemapsAfterUpload: true");
  });

  it("never hardcodes a DSN or an auth token", () => {
    expect(source).not.toMatch(/https:\/\/[0-9a-f]{16,}@/i);
    expect(source).not.toMatch(/sntrys_[A-Za-z0-9]/);
  });
});
