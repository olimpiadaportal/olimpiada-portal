// THE QUOTA TESTS.
//
// The failure these exist to catch is not a wrong value, it is a MISSING
// CEILING. The Sentry Developer plan is 5,000 error occurrences a month for the
// whole organisation, counted per occurrence, with no overage to buy: one render
// loop or one Supabase outage, uncapped, ends monitoring for everyone until the
// 1st. That is a class of bug that cannot be noticed by reading the config —
// every option in it looks reasonable — so it is asserted instead.
//
// Three halves, which is one more than it was:
//   1. the rolling budget actually bounds a runaway, and does NOT bound the
//      ordinary case it would be useless if it broke (many users, one bug);
//   2. IT DOES NOT SWALLOW THE ONE EVENT THAT MATTERS. A cap that discards the
//      first sighting of a never-before-seen fault, because a fault already
//      being reported had spent the hour, is worse than no cap;
//   3. the ignore lists match the runtime that is actually running — and are
//      DIFFERENT per runtime. A dropped connection in a browser is a user's
//      wifi; the identical text on the server is the platform failing to reach
//      its own database, and for one round both were being thrown away.
//
// NOTE ON THE RUNTIME THESE RUN IN: vitest.config.ts sets `environment: "node"`,
// so `typeof window === "undefined"` and `sentryOptions.ts` resolves to its
// SERVER posture — the server budget, the server ignore list, and the
// transport-regrouping branch of `budgetedBeforeSend`. That is deliberate: the
// server half is the half that was blind, so it is the half the shipped object
// is asserted against. The browser half is asserted through its exported list.
import { describe, expect, it } from "vitest";

import {
  createEventBudget,
  fingerprintEvent,
  type FingerprintableEvent,
} from "@/lib/observability/sentryBudget";
import {
  BROWSER_IGNORE_ERRORS,
  isTransportFailure,
  sharedSentryOptions,
  SENTRY_BUDGET_LIMITS,
  SERVER_IGNORE_ERRORS,
  SERVER_TRANSPORT_FINGERPRINT,
} from "@/lib/observability/sentryOptions";

const HOUR = 60 * 60 * 1000;

/** A budget with small, obvious numbers so the assertions read as arithmetic. */
const testBudget = () =>
  createEventBudget({ perHour: 5, perDay: 8, perIssuePerHour: 2, maxTrackedIssues: 3 });

/**
 * Would @sentry/core drop an error with this type and message, given `list`?
 *
 * A faithful copy of `_isIgnoredError` + `getPossibleEventMessages`
 * (@sentry/core integrations/eventFilters.js, utils/eventUtils.js): the LAST
 * exception value produces TWO candidate strings — `value` and `type: value` —
 * and the event is dropped if ANY pattern matches EITHER of them. String
 * patterns match as substrings; regexes are tested as written.
 *
 * Modelling both candidates matters here: `/^fetch failed$/` is anchored on
 * purpose and matches only the first of them, which is enough.
 */
function dropsWith(
  list: ReadonlyArray<string | RegExp>,
  type: string,
  value: string,
): boolean {
  const candidates = [value, `${type}: ${value}`];
  return candidates.some((text) =>
    list.some((pattern) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
    ),
  );
}

const dropsInBrowser = (type: string, value: string) =>
  dropsWith(BROWSER_IGNORE_ERRORS, type, value);
const dropsOnServer = (type: string, value: string) =>
  dropsWith(SERVER_IGNORE_ERRORS, type, value);

/** An error event shaped the way the SDK hands one to `beforeSend`. */
const thrown = (type: string, value: string) =>
  ({ exception: { values: [{ type, value }] } }) as Parameters<
    typeof sharedSentryOptions.beforeSend
  >[0];

/** Every server-side shape a real outage arrives as. */
const OUTAGE_SHAPES: Array<[string, string]> = [
  ["TypeError", "fetch failed"],
  ["TypeError", "terminated"],
  ["SocketError", "other side closed"],
  ["TimeoutError", "The operation was aborted due to timeout"],
  ["ConnectTimeoutError", "Connect Timeout Error"],
  ["HeadersTimeoutError", "Headers Timeout Error"],
  ["BodyTimeoutError", "Body Timeout Error"],
  ["Error", "UND_ERR_CONNECT_TIMEOUT"],
  ["Error", "connect ECONNREFUSED 10.0.0.1:5432"],
  ["Error", "getaddrinfo ENOTFOUND db.example.supabase.co"],
  ["Error", "read ECONNRESET"],
  ["Error", "connect ETIMEDOUT"],
  ["Error", "getaddrinfo EAI_AGAIN db.example.supabase.co"],
  ["TypeError", "Failed to fetch"],
  ["TypeError", "Load failed"],
];

describe("the rolling budget bounds a runaway process", () => {
  it("lets one repeating fault through perIssuePerHour times and no more", () => {
    const budget = createEventBudget({ perHour: 100, perDay: 100, perIssuePerHour: 3 });
    const t0 = 1_700_000_000_000;

    // A render loop: the same error, 500 times in ten seconds.
    const admitted = Array.from({ length: 500 }, (_, i) =>
      budget.admit("render-loop", t0 + i * 20),
    ).filter(Boolean).length;

    expect(admitted).toBe(3);
    expect(budget.stats(t0).droppedTotal).toBe(497);
  });

  it("bounds a burst of DIFFERENT faults too, which a per-issue cap alone would not", () => {
    // A bad deploy throwing 50 distinct errors would sail through a
    // fingerprint-only cap: each one gets its own allowance.
    const budget = createEventBudget({ perHour: 5, perDay: 50, perIssuePerHour: 3 });
    const t0 = 1_700_000_000_000;

    const admitted = Array.from({ length: 50 }, (_, i) =>
      budget.admit(`distinct-${i}`, t0 + i),
    ).filter(Boolean).length;

    expect(admitted).toBe(5);
  });

  it("caps a multi-hour outage at perDay, not at perHour x 24", () => {
    const budget = createEventBudget({ perHour: 5, perDay: 8, perIssuePerHour: 5 });
    const t0 = 1_700_000_000_000;

    let admitted = 0;
    // Twelve hours of an outage, one event a minute, all the same fault.
    for (let minute = 0; minute < 12 * 60; minute += 1) {
      if (budget.admit("supabase-down", t0 + minute * 60_000)) admitted += 1;
    }

    expect(admitted).toBe(8);
  });

  it("reopens as the window rolls forward", () => {
    const budget = testBudget();
    const t0 = 1_700_000_000_000;

    expect(budget.admit("a", t0)).toBe(true);
    expect(budget.admit("a", t0 + 1000)).toBe(true);
    // Third inside the hour: over perIssuePerHour.
    expect(budget.admit("a", t0 + 2000)).toBe(false);
    // An hour and a second later the first two have aged out.
    expect(budget.admit("a", t0 + HOUR + 1001)).toBe(true);
  });

  it("does NOT squeeze breadth: many processes seeing one bug all report it", () => {
    // The budget is per process on purpose. Ten parents hitting the same broken
    // page are ten tabs, so ten reports still arrive — which is the signal that
    // says "widespread", and the thing a naive global cap would destroy.
    const tabs = Array.from({ length: 10 }, () => testBudget());
    const t0 = 1_700_000_000_000;
    const reported = tabs.filter((tab) => tab.admit("same-bug", t0)).length;

    expect(reported).toBe(10);
  });

  it("keeps the fingerprint map bounded in a long-lived server process", () => {
    const budget = createEventBudget({
      perHour: 1000,
      perDay: 1000,
      perIssuePerHour: 1,
      maxTrackedIssues: 3,
    });
    const t0 = 1_700_000_000_000;

    for (let i = 0; i < 200; i += 1) budget.admit(`issue-${i}`, t0 + i);

    expect(budget.stats(t0).trackedIssues).toBe(3);
  });

  it("spends nothing when it refuses", () => {
    const budget = createEventBudget({ perHour: 2, perDay: 2, perIssuePerHour: 2 });
    const t0 = 1_700_000_000_000;

    budget.admit("a", t0);
    budget.admit("a", t0 + 1);
    budget.admit("a", t0 + 2); // refused
    budget.admit("a", t0 + 3); // refused

    expect(budget.stats(t0 + 3).sentLastHour).toBe(2);
  });
});

describe("fingerprinting groups a loop instead of scattering it", () => {
  const event = (value: string, type = "Error"): FingerprintableEvent => ({
    exception: { values: [{ type, value }] },
  });

  it("collapses varying ids so one fault is one fingerprint", () => {
    expect(fingerprintEvent(event("Row 4821 failed"))).toBe(
      fingerprintEvent(event("Row 9137 failed")),
    );
    expect(fingerprintEvent(event("student b3c1d2e4-1111-2222-3333-444455556666 missing"))).toBe(
      fingerprintEvent(event("student a1b2c3d4-9999-8888-7777-666655554444 missing")),
    );
  });

  it("still separates genuinely different faults", () => {
    expect(fingerprintEvent(event("Row 4821 failed"))).not.toBe(
      fingerprintEvent(event("Checkout signature mismatch")),
    );
    expect(fingerprintEvent(event("boom", "TypeError"))).not.toBe(
      fingerprintEvent(event("boom", "RangeError")),
    );
  });

  it("reads the THROWN error, not the cause", () => {
    // linkedErrorsIntegration PREPENDS causes, so values[last] is what was
    // thrown — the same entry @sentry/core matches ignoreErrors against.
    const withCause: FingerprintableEvent = {
      exception: {
        values: [
          { type: "Error", value: "connect ECONNREFUSED 10.0.0.1:5432" },
          { type: "TypeError", value: "fetch failed" },
        ],
      },
    };
    expect(fingerprintEvent(withCause)).toContain("fetch failed");
  });
});

describe("beforeSend enforces the budget on the real options object", () => {
  it("stops sending once the shipped per-issue limit is reached", () => {
    const sameFailure = () =>
      ({
        exception: { values: [{ type: "TypeError", value: "Cannot read x of undefined" }] },
      }) as Parameters<typeof sharedSentryOptions.beforeSend>[0];

    const results = Array.from({ length: 40 }, () =>
      sharedSentryOptions.beforeSend(sameFailure()),
    );
    const sent = results.filter((r) => r !== null).length;

    // Whatever the shipped numbers are, a loop must not outrun them.
    expect(sent).toBeLessThanOrEqual(SENTRY_BUDGET_LIMITS.perIssuePerHour);
    expect(sent).toBeGreaterThan(0);
  });

  it("ships limits that fit the 5,000/month org-wide allowance", () => {
    // web-app is allocated ~2,400/month (~80/day) of the shared 5,000. A single
    // process must not be able to spend more than about one day of that, or the
    // cap is decoration.
    expect(SENTRY_BUDGET_LIMITS.perDay).toBeLessThanOrEqual(80);
    expect(SENTRY_BUDGET_LIMITS.perHour).toBeLessThanOrEqual(SENTRY_BUDGET_LIMITS.perDay);
    expect(SENTRY_BUDGET_LIMITS.perIssuePerHour).toBeLessThanOrEqual(
      SENTRY_BUDGET_LIMITS.perHour,
    );
  });
});

describe("a browser drops transport noise; THE SERVER REPORTS THE OUTAGE", () => {
  it.each(OUTAGE_SHAPES)("browser: %s: %s is the network, not a bug", (type, value) => {
    // Parents and children are on Azerbaijani mobile data. A dropped request in
    // a tab is a tunnel or a lock screen, and it would otherwise be the single
    // highest-volume issue in the project.
    expect(dropsInBrowser(type, value)).toBe(true);
  });

  it.each(OUTAGE_SHAPES)("server: %s: %s is an INCIDENT and is reported", (type, value) => {
    // THE REGRESSION THIS LOCKS DOWN. Both runtimes shared one ignore list, and
    // it contained every shape below — so a Supabase outage, or a
    // NEXT_PUBLIC_SUPABASE_URL misconfigured by the deploy that just went out,
    // produced ZERO events. That is precisely the incident the owner bought
    // monitoring for.
    expect(dropsOnServer(type, value)).toBe(false);
  });

  it("still drops what is noise in EVERY runtime", () => {
    for (const list of [BROWSER_IGNORE_ERRORS, SERVER_IGNORE_ERRORS]) {
      // Next.js control flow: redirect() and notFound() throw by design.
      expect(dropsWith(list, "Error", "NEXT_REDIRECT")).toBe(true);
      expect(dropsWith(list, "Error", "NEXT_NOT_FOUND")).toBe(true);
      expect(dropsWith(list, "Error", "Non-Error promise rejection captured")).toBe(true);
    }
  });

  it("ships the SERVER list in this (node) runtime", () => {
    // The shipped object picks its list from `typeof window`, so under vitest's
    // node environment it must be the server one. If this ever reads as the
    // browser list, every assertion above is testing something the app does not
    // ship.
    expect(sharedSentryOptions.ignoreErrors).toBe(SERVER_IGNORE_ERRORS);
  });

  it("does not swallow real application errors that merely mention a word", () => {
    // Why the patterns are anchored: `ignoreErrors` matches substrings, so a
    // bare "terminated" or "fetch failed" would also eat these — in the browser,
    // where the list is still long.
    expect(dropsInBrowser("Error", "Worker terminated unexpectedly")).toBe(false);
    expect(dropsInBrowser("Error", "Payment terminated by acquirer")).toBe(false);
    expect(dropsInBrowser("Error", "Question fetch failed to validate")).toBe(false);
    expect(dropsInBrowser("TypeError", "Cannot read properties of undefined")).toBe(false);
  });

  it("classifies a transport failure without classifying our own errors", () => {
    expect(isTransportFailure(thrown("TypeError", "fetch failed"))).toBe(true);
    expect(isTransportFailure(thrown("Error", "connect ECONNREFUSED 10.0.0.1:5432"))).toBe(
      true,
    );
    expect(isTransportFailure(thrown("Error", "Question fetch failed to validate"))).toBe(
      false,
    );
    expect(isTransportFailure(thrown("Error", "Payment terminated by acquirer"))).toBe(false);
  });
});

describe("an outage costs a handful of events, not thousands", () => {
  it("SENDS the first occurrence instead of swallowing the class", () => {
    // The regression in one line: while both runtimes shared an ignore list,
    // `TypeError: fetch failed` — a Supabase outage, or a Supabase URL broken by
    // the deploy that just went out — reached `beforeSend` never, and produced
    // no event at all.
    //
    // IT RUNS FIRST IN THIS DESCRIBE ON PURPOSE. `sharedSentryOptions.beforeSend`
    // closes over ONE module-scoped budget — module scope is the process — so an
    // assertion that an event is ADMITTED has to come before the tests that
    // spend the per-issue allowance for the same collapsed fingerprint.
    expect(sharedSentryOptions.beforeSend(thrown("TypeError", "fetch failed"))).not.toBeNull();
  });

  it("collapses every transport shape onto ONE fingerprint on the server", () => {
    // Without this, each occurrence carries its own host, port and address
    // text, the fingerprinter reads them as different faults, and every one
    // claims its own per-issue allowance — so REPORTING the outage would empty
    // the month's quota in minutes. The collapse is what makes reporting it
    // affordable, and it is also how the owner sees one issue with a rising
    // count instead of a wall of near-identical titles.
    for (const [type, value] of OUTAGE_SHAPES) {
      const event = thrown(type, value);
      sharedSentryOptions.beforeSend(event);
      expect(event.fingerprint, `${type}: ${value}`).toEqual([SERVER_TRANSPORT_FINGERPRINT]);
    }
  });

  it("leaves an explicit fingerprint alone — a call site outranks this rule", () => {
    const event = thrown("TypeError", "fetch failed");
    event.fingerprint = ["checkout-callback"];
    sharedSentryOptions.beforeSend(event);
    expect(event.fingerprint).toEqual(["checkout-callback"]);
  });

  it("does not touch an ordinary application error", () => {
    const event = thrown("TypeError", "Cannot read properties of undefined");
    sharedSentryOptions.beforeSend(event);
    expect(event.fingerprint).toBeUndefined();
  });

  it("bounds a two-hour outage at the per-issue line", () => {
    // A fresh budget with the SHIPPED numbers: two hours of an outage throwing
    // twice a second is 14,400 occurrences, and it must cost the same as any
    // other repeating fault.
    const budget = createEventBudget(SENTRY_BUDGET_LIMITS);
    const t0 = 1_700_000_000_000;
    let admitted = 0;
    for (let i = 0; i < 14_400; i += 1) {
      if (budget.admit(SERVER_TRANSPORT_FINGERPRINT, t0 + i * 500)) admitted += 1;
    }

    // Two rolling hours, `perIssuePerHour` each.
    expect(admitted).toBeLessThanOrEqual(SENTRY_BUDGET_LIMITS.perIssuePerHour * 2);
    expect(admitted).toBeGreaterThan(0);
  });
});

describe("the budget does not drop a fault nobody has seen yet", () => {
  /**
   * A spent hour, with headroom held back for the unseen. The numbers are tiny
   * so each assertion reads as arithmetic rather than as a simulation.
   */
  const reserved = () =>
    createEventBudget({
      perHour: 2,
      perDay: 10,
      perIssuePerHour: 2,
      novelPerHour: 2,
      novelPerDay: 4,
    });

  it("admits a NOVEL fingerprint even when the global budget is spent", () => {
    // THE BUG: the global per-hour check used to run BEFORE the per-issue one,
    // so during a busy hour the first occurrence of a never-before-seen
    // fingerprint was dropped — the one event most likely to be the new fault,
    // discarded to protect budget an already-reported fault had spent.
    const budget = reserved();
    const t0 = 1_700_000_000_000;

    expect(budget.admit("known-noisy-fault", t0)).toBe(true);
    expect(budget.admit("known-noisy-fault", t0 + 1)).toBe(true);
    // perHour (2) is now spent.
    expect(budget.stats(t0 + 2).sentLastHour).toBe(2);

    // A brand-new failure — the checkout signature check, say — arrives during
    // that same hour. It gets through.
    expect(budget.admit("checkout-signature-mismatch", t0 + 2)).toBe(true);
    expect(budget.stats(t0 + 2).reserveLastHour).toBe(1);
  });

  it("throttles the repeat offender the reserve is protecting headroom FROM", () => {
    const budget = reserved();
    const t0 = 1_700_000_000_000;

    budget.admit("render-loop", t0);
    budget.admit("render-loop", t0 + 1);
    // Over perIssuePerHour, and no longer novel: the reserve is unreachable for
    // it, which is the whole point. A repeat offender must never be able to
    // spend the headroom held for first sightings.
    for (let i = 2; i < 500; i += 1) {
      expect(budget.admit("render-loop", t0 + i)).toBe(false);
    }
    expect(budget.stats(t0 + 500).sentLastHour).toBe(2);
    expect(budget.stats(t0 + 500).reserveLastHour).toBe(0);
  });

  it("bounds the reserve itself, so it cannot become a second budget", () => {
    const budget = reserved();
    const t0 = 1_700_000_000_000;

    budget.admit("a", t0);
    budget.admit("a", t0 + 1); // perHour spent

    expect(budget.admit("novel-1", t0 + 2)).toBe(true); // reserve 1 of 2
    expect(budget.admit("novel-2", t0 + 3)).toBe(true); // reserve 2 of 2
    expect(budget.admit("novel-3", t0 + 4)).toBe(false); // reserve spent

    // Worst case is arithmetic: perHour + novelPerHour, never more.
    expect(budget.stats(t0 + 4).sentLastHour).toBe(4);
  });

  it("bounds the reserve across the DAY as well as the hour", () => {
    // Otherwise a twelve-hour incident would draw the hourly reserve twelve
    // times and quietly triple the day's ceiling.
    const budget = createEventBudget({
      perHour: 1,
      perDay: 2,
      perIssuePerHour: 1,
      novelPerHour: 2,
      novelPerDay: 3,
    });
    const t0 = 1_700_000_000_000;

    let admitted = 0;
    for (let hour = 0; hour < 12; hour += 1) {
      for (let n = 0; n < 5; n += 1) {
        if (budget.admit(`hour-${hour}-fault-${n}`, t0 + hour * HOUR + n)) admitted += 1;
      }
    }

    // perDay (2) + novelPerDay (3).
    expect(admitted).toBe(5);
    expect(budget.stats(t0 + 12 * HOUR).reserveLastDay).toBe(3);
  });

  it("refills the reserve as the hour rolls forward", () => {
    const budget = reserved();
    const t0 = 1_700_000_000_000;

    budget.admit("a", t0);
    budget.admit("a", t0 + 1);
    expect(budget.admit("novel-1", t0 + 2)).toBe(true);
    expect(budget.admit("novel-2", t0 + 3)).toBe(true);
    expect(budget.admit("novel-3", t0 + 4)).toBe(false);

    // An hour later everything above has aged out of the hourly windows.
    expect(budget.admit("novel-4", t0 + HOUR + 5)).toBe(true);
  });

  it("defaults to NO reserve, so an existing caller cannot gain headroom silently", () => {
    const budget = createEventBudget({ perHour: 2, perDay: 10, perIssuePerHour: 2 });
    const t0 = 1_700_000_000_000;

    budget.admit("a", t0);
    budget.admit("a", t0 + 1);
    expect(budget.admit("novel", t0 + 2)).toBe(false);
  });

  it("ships a reserve on the limits this app actually uses", () => {
    // The default is zero; every budget this repo ships must opt in, or the
    // fix above is present in the module and absent from the product.
    expect(SENTRY_BUDGET_LIMITS.novelPerHour).toBeGreaterThan(0);
    expect(SENTRY_BUDGET_LIMITS.novelPerDay).toBeGreaterThan(0);
    // And the worst case must still fit ~80/day, this app's slice of the
    // org-wide 5,000/month.
    expect(
      SENTRY_BUDGET_LIMITS.perDay + (SENTRY_BUDGET_LIMITS.novelPerDay ?? 0),
    ).toBeLessThanOrEqual(80);
  });
});

describe("tracing and replay are ABSENT, not zero", () => {
  it("writes no sample-rate key the SDK would read as `enabled, at zero`", () => {
    // hasSpansEnabled() tests `tracesSampleRate != null`, and its own source
    // comment points out that ZERO IS NOT NULLISH: writing 0 starts the span
    // machinery and only suppresses the sending.
    for (const key of [
      "tracesSampleRate",
      "tracesSampler",
      "replaysSessionSampleRate",
      "replaysOnErrorSampleRate",
      "profilesSampleRate",
    ]) {
      expect(key in sharedSentryOptions).toBe(false);
    }
  });
});
