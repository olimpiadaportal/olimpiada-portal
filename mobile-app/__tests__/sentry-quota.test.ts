// THE QUOTA TESTS — MOBILE.
//
// What these exist to catch is not a wrong value but a MISSING CEILING. The
// Sentry Developer plan is 5,000 error occurrences a month for the whole
// organisation, counted per occurrence, no overage to buy — and this app shares
// it with the parent-facing web app and the admin panel. One screen that
// re-throws on every render, on one tester's phone, could end monitoring for all
// three until the 1st of the next month, and every line of the config would
// still look correct while it happened.
//
// The budget is asserted directly. The ignore list is asserted the way
// @sentry/core actually applies it, because "the list contains the string" and
// "the event would be dropped" are not the same claim.
import {
  createEventBudget,
  fingerprintEvent,
  NODE_TRANSPORT_IGNORED_ERRORS,
  type FingerprintableEvent,
} from "../src/lib/sentryQuota";
import { IGNORED_ERRORS } from "../src/lib/sentryScrub";

const HOUR = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

/** The full list `Sentry.init` ships: the app's own, plus the Node shapes. */
const SHIPPED_IGNORE_LIST = [...IGNORED_ERRORS, ...NODE_TRANSPORT_IGNORED_ERRORS];

/**
 * Would @sentry/core drop an error with this type and message?
 *
 * A faithful copy of `_isIgnoredError` + `getPossibleEventMessages`: the LAST
 * exception value produces TWO candidate strings — `value` and `type: value` —
 * and the event is dropped if ANY pattern matches EITHER of them. Strings match
 * as substrings; regexes are tested as written.
 */
function dropsError(type: string, value: string): boolean {
  return [value, `${type}: ${value}`].some((text) =>
    SHIPPED_IGNORE_LIST.some((pattern) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
    ),
  );
}

describe("the rolling budget bounds a runaway app launch", () => {
  it("lets one repeating fault through perIssuePerHour times and no more", () => {
    const budget = createEventBudget({ perHour: 100, perDay: 100, perIssuePerHour: 3 });

    // A screen re-throwing on every render: the same error, 500 times.
    const admitted = Array.from({ length: 500 }, (_, i) =>
      budget.admit("render-loop", T0 + i * 20),
    ).filter(Boolean).length;

    expect(admitted).toBe(3);
    expect(budget.stats(T0).droppedTotal).toBe(497);
  });

  it("bounds a burst of DIFFERENT faults, which a per-issue cap alone would not", () => {
    // A bad OTA update throwing fifty distinct errors sails straight through a
    // fingerprint-only cap: each one gets its own allowance.
    const budget = createEventBudget({ perHour: 5, perDay: 50, perIssuePerHour: 3 });
    const admitted = Array.from({ length: 50 }, (_, i) =>
      budget.admit(`distinct-${i}`, T0 + i),
    ).filter(Boolean).length;

    expect(admitted).toBe(5);
  });

  it("caps a phone left broken all day at perDay", () => {
    const budget = createEventBudget({ perHour: 5, perDay: 8, perIssuePerHour: 5 });
    let admitted = 0;
    for (let minute = 0; minute < 12 * 60; minute += 1) {
      if (budget.admit("boot-gate-failed", T0 + minute * 60_000)) admitted += 1;
    }
    expect(admitted).toBe(8);
  });

  it("reopens as the window rolls forward", () => {
    const budget = createEventBudget({ perHour: 5, perDay: 8, perIssuePerHour: 2 });
    expect(budget.admit("a", T0)).toBe(true);
    expect(budget.admit("a", T0 + 1000)).toBe(true);
    expect(budget.admit("a", T0 + 2000)).toBe(false);
    expect(budget.admit("a", T0 + HOUR + 1001)).toBe(true);
  });

  it("does NOT squeeze breadth: twelve testers hitting one crash all report it", () => {
    // The budget is per app launch on purpose. Twelve devices are twelve
    // budgets, so the "it happens to everyone" signal survives — which is the
    // thing a single global cap would have destroyed.
    const phones = Array.from({ length: 12 }, () =>
      createEventBudget({ perHour: 10, perDay: 30, perIssuePerHour: 3 }),
    );
    expect(phones.filter((phone) => phone.admit("same-crash", T0)).length).toBe(12);
  });

  it("keeps the fingerprint map bounded in a long session", () => {
    const budget = createEventBudget({
      perHour: 1000,
      perDay: 1000,
      perIssuePerHour: 1,
      maxTrackedIssues: 3,
    });
    for (let i = 0; i < 200; i += 1) budget.admit(`issue-${i}`, T0 + i);
    expect(budget.stats(T0).trackedIssues).toBe(3);
  });

  it("spends nothing when it refuses", () => {
    const budget = createEventBudget({ perHour: 2, perDay: 2, perIssuePerHour: 2 });
    budget.admit("a", T0);
    budget.admit("a", T0 + 1);
    budget.admit("a", T0 + 2);
    expect(budget.stats(T0 + 2).sentLastHour).toBe(2);
  });
});

describe("fingerprinting groups a loop instead of scattering it", () => {
  const event = (value: string, type = "Error"): FingerprintableEvent => ({
    exception: { values: [{ type, value }] },
  });

  it("collapses varying ids so one fault is one fingerprint", () => {
    expect(fingerprintEvent(event("question 4821 failed to load"))).toBe(
      fingerprintEvent(event("question 9137 failed to load")),
    );
  });

  it("still separates genuinely different faults", () => {
    expect(fingerprintEvent(event("question 4821 failed to load"))).not.toBe(
      fingerprintEvent(event("receipt validation rejected")),
    );
  });

  it("reads the THROWN error, not its cause", () => {
    // linkedErrors PREPENDS causes, so values[last] is what was thrown — the
    // same entry @sentry/core matches ignoreErrors against.
    expect(
      fingerprintEvent({
        exception: {
          values: [
            { type: "Error", value: "connect ECONNREFUSED 10.0.0.1:443" },
            { type: "TypeError", value: "fetch failed" },
          ],
        },
      }),
    ).toContain("fetch failed");
  });
});

describe("the shipped budget fits this app's share of the allowance", () => {
  // Source-level, like sentry-posture.test.ts: importing src/lib/sentry.ts would
  // pull in the native module, and what gets edited is the FILE.
  const source = require("node:fs").readFileSync(
    require("node:path").resolve(__dirname, "..", "src", "lib", "sentry.ts"),
    "utf8",
  ) as string;

  it("wires the budget into beforeSend rather than leaving it unused", () => {
    expect(source).toContain("scrubAndBudget");
    expect(source).toMatch(/beforeSend:\s*\(event\)\s*=>\s*scrubAndBudget\(event\)/);
    // The scrubber still runs first — the budget was ADDED to the last gate,
    // never swapped in for it.
    expect(source).toMatch(/const scrubbed = scrubEvent\(event\)/);
  });

  it("adds the Node transport shapes to the ignore list", () => {
    expect(source).toMatch(/ignoreErrors:\s*\[\.\.\.IGNORED_ERRORS,\s*\.\.\.NODE_TRANSPORT_IGNORED_ERRORS\]/);
  });

  it("keeps the per-process ceiling inside about one day of ~33/day fleet use", () => {
    const perDay = Number(/perDay:\s*(\d+)/.exec(source)?.[1]);
    const perHour = Number(/perHour:\s*(\d+)/.exec(source)?.[1]);
    const perIssue = Number(/perIssuePerHour:\s*(\d+)/.exec(source)?.[1]);

    expect(perDay).toBeGreaterThan(0);
    expect(perDay).toBeLessThanOrEqual(40);
    expect(perHour).toBeLessThanOrEqual(perDay);
    expect(perIssue).toBeLessThanOrEqual(perHour);
  });
});

describe("the ignore list matches the runtime shapes, not only the browser ones", () => {
  it("keeps what a phone with no signal actually throws", () => {
    expect(dropsError("TypeError", "Network request failed")).toBe(true);
    expect(dropsError("Error", "The network connection was lost.")).toBe(true);
  });

  it("drops undici's `fetch failed` and the rest of the Node transport shapes", () => {
    // Read off Node 24.15.0 rather than remembered. Not what RN throws today —
    // see sentryQuota.ts for why the list carries them anyway.
    expect(dropsError("TypeError", "fetch failed")).toBe(true);
    expect(dropsError("TypeError", "terminated")).toBe(true);
    expect(dropsError("SocketError", "other side closed")).toBe(true);
    expect(dropsError("TimeoutError", "The operation was aborted due to timeout")).toBe(true);
    expect(dropsError("ConnectTimeoutError", "Connect Timeout Error")).toBe(true);
    expect(dropsError("Error", "UND_ERR_BODY_TIMEOUT")).toBe(true);
    expect(dropsError("Error", "connect ECONNREFUSED 10.0.0.1:443")).toBe(true);
    expect(dropsError("Error", "getaddrinfo ENOTFOUND api.example.supabase.co")).toBe(true);
  });

  it("does not swallow real application errors that merely mention a word", () => {
    // Why those two patterns are anchored regexes: `ignoreErrors` matches
    // substrings, so a bare "terminated" would eat a real upload failure.
    expect(dropsError("Error", "Upload terminated by the user")).toBe(false);
    expect(dropsError("Error", "Avatar fetch failed to parse the response")).toBe(false);
    expect(dropsError("TypeError", "undefined is not an object")).toBe(false);
  });
});
