// THE QUOTA TESTS — ADMIN PANEL.
//
// What these exist to catch is not a wrong value but a MISSING CEILING. The
// Sentry Developer plan is 5,000 error occurrences a month for the whole
// organisation, counted per occurrence, with no overage to buy; this panel
// shares it with the parent-facing web app and the children's mobile app. One
// loop in middleware — which runs on EVERY request here — could end monitoring
// for all three until the 1st of the next month, and nothing in a config file
// looks wrong while that is true.
//
// Three halves, which is one more than it was:
//   1. the rolling budget bounds a runaway, and does NOT bound the ordinary
//      case it would be useless if it broke;
//   2. IT DOES NOT SWALLOW THE ONE EVENT THAT MATTERS — the first sighting of a
//      fault nobody has seen survives a busy hour;
//   3. the ignore lists are DIFFERENT PER RUNTIME. A failed request in a staff
//      member's tab is their wifi; the identical text out of a Server Action
//      means the panel cannot reach its database, and for one round both were
//      being thrown away.
//
// The server-side half of (3) — the regrouping inside budgetedBeforeSend — is
// asserted in `serverTransport.test.ts`, which runs under the node environment
// because this file runs under jsdom and the branch keys off `typeof window`.
import { describe, expect, it } from "vitest";

import {
  createEventBudget,
  fingerprintEvent,
  type FingerprintableEvent,
} from "../budget";
import {
  BROWSER_TRANSPORT_IGNORED_ERRORS,
  SENTRY_BUDGET_LIMITS,
  SERVER_IGNORED_ERRORS,
  budgetedBeforeSend,
} from "../options";
import { IGNORED_ERRORS } from "../scrub";

const HOUR = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

/** The list the BROWSER config ships: the shared one plus every transport shape. */
const BROWSER_IGNORE_LIST = [...IGNORED_ERRORS, ...BROWSER_TRANSPORT_IGNORED_ERRORS];

/**
 * Would @sentry/core drop an error with this type and message, given `list`?
 *
 * A faithful copy of `_isIgnoredError` + `getPossibleEventMessages`
 * (@sentry/core integrations/eventFilters.js, utils/eventUtils.js): the LAST
 * exception value yields TWO candidate strings — `value` and `type: value` — and
 * the event is dropped if ANY pattern matches EITHER. String patterns match as
 * substrings; regexes are tested as written.
 */
function dropsWith(
  list: ReadonlyArray<string | RegExp>,
  type: string,
  value: string,
): boolean {
  return [value, `${type}: ${value}`].some((text) =>
    list.some((pattern) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
    ),
  );
}

const dropsInBrowser = (type: string, value: string) =>
  dropsWith(BROWSER_IGNORE_LIST, type, value);
const dropsOnServer = (type: string, value: string) =>
  dropsWith(SERVER_IGNORED_ERRORS, type, value);

/** Every shape a real outage arrives as, on either side. */
const OUTAGE_SHAPES: Array<[string, string]> = [
  ["TypeError", "fetch failed"],
  ["TypeError", "terminated"],
  ["SocketError", "other side closed"],
  ["TimeoutError", "The operation was aborted due to timeout"],
  ["ConnectTimeoutError", "Connect Timeout Error"],
  ["HeadersTimeoutError", "Headers Timeout Error"],
  ["BodyTimeoutError", "Body Timeout Error"],
  ["Error", "UND_ERR_SOCKET"],
  ["Error", "connect ECONNREFUSED 10.0.0.1:5432"],
  ["Error", "getaddrinfo ENOTFOUND db.example.supabase.co"],
  ["Error", "read ECONNRESET"],
  ["TypeError", "Failed to fetch"],
  ["TypeError", "Load failed"],
  ["TypeError", "NetworkError when attempting to fetch resource."],
];

describe("the rolling budget bounds a runaway process", () => {
  it("lets one repeating fault through perIssuePerHour times and no more", () => {
    const budget = createEventBudget({ perHour: 100, perDay: 100, perIssuePerHour: 3 });

    // Middleware failing on every request: the same error, 500 times.
    const admitted = Array.from({ length: 500 }, (_, i) =>
      budget.admit("middleware-supabase-down", T0 + i * 20),
    ).filter(Boolean).length;

    expect(admitted).toBe(3);
    expect(budget.stats(T0).droppedTotal).toBe(497);
  });

  it("bounds a burst of DIFFERENT faults, which a per-issue cap alone would not", () => {
    const budget = createEventBudget({ perHour: 5, perDay: 50, perIssuePerHour: 3 });
    const admitted = Array.from({ length: 50 }, (_, i) =>
      budget.admit(`distinct-${i}`, T0 + i),
    ).filter(Boolean).length;

    expect(admitted).toBe(5);
  });

  it("caps a twelve-hour outage at perDay, not perHour x 12", () => {
    const budget = createEventBudget({ perHour: 5, perDay: 8, perIssuePerHour: 5 });
    let admitted = 0;
    for (let minute = 0; minute < 12 * 60; minute += 1) {
      if (budget.admit("supabase-down", T0 + minute * 60_000)) admitted += 1;
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

  it("keeps the fingerprint map bounded in a long-lived process", () => {
    const budget = createEventBudget({
      perHour: 1000,
      perDay: 1000,
      perIssuePerHour: 1,
      maxTrackedIssues: 3,
    });
    for (let i = 0; i < 200; i += 1) budget.admit(`issue-${i}`, T0 + i);
    expect(budget.stats(T0).trackedIssues).toBe(3);
  });
});

describe("fingerprinting groups a loop instead of scattering it", () => {
  const event = (value: string, type = "Error"): FingerprintableEvent => ({
    exception: { values: [{ type, value }] },
  });

  it("collapses varying ids, so a bulk import failing per row is ONE issue", () => {
    // The import screen posts thousands of rows; a per-row failure message is
    // the exact shape that would otherwise mint a fingerprint per row and hand
    // each one its own allowance.
    expect(fingerprintEvent(event("Row 4821 rejected"))).toBe(
      fingerprintEvent(event("Row 9137 rejected")),
    );
  });

  it("still separates genuinely different faults", () => {
    expect(fingerprintEvent(event("Row 4821 rejected"))).not.toBe(
      fingerprintEvent(event("Workbook stream closed")),
    );
  });
});

describe("budgetedBeforeSend enforces the shipped limits", () => {
  it("stops sending once the per-issue limit is reached", () => {
    const sent = Array.from({ length: 40 }, () =>
      budgetedBeforeSend({
        exception: { values: [{ type: "TypeError", value: "Cannot read x of undefined" }] },
      }),
    ).filter((r) => r !== null).length;

    expect(sent).toBeLessThanOrEqual(SENTRY_BUDGET_LIMITS.perIssuePerHour);
    expect(sent).toBeGreaterThan(0);
  });

  it("ships limits that fit this app's share of the 5,000/month allowance", () => {
    // ~600/month (~20/day) is the admin panel's allocation: one operator, and
    // the other two apps have the families. A single process must not be able
    // to spend much more than a day of it.
    expect(SENTRY_BUDGET_LIMITS.perDay).toBeLessThanOrEqual(40);
    expect(SENTRY_BUDGET_LIMITS.perHour).toBeLessThanOrEqual(SENTRY_BUDGET_LIMITS.perDay);
    expect(SENTRY_BUDGET_LIMITS.perIssuePerHour).toBeLessThanOrEqual(
      SENTRY_BUDGET_LIMITS.perHour,
    );
  });

  it("still scrubs — the budget is added to the last gate, not swapped in", () => {
    const out = budgetedBeforeSend({
      exception: { values: [{ type: "AuthApiError", value: "login failed for 48310277" }] },
    });
    expect(JSON.stringify(out)).not.toContain("48310277");
  });
});

describe("a browser drops transport noise; THE SERVER REPORTS THE OUTAGE", () => {
  it.each(OUTAGE_SHAPES)("browser: %s: %s is the network, not a bug", (type, value) => {
    expect(dropsInBrowser(type, value)).toBe(true);
  });

  it.each(OUTAGE_SHAPES)("server: %s: %s is an INCIDENT and is reported", (type, value) => {
    // THE REGRESSION THIS LOCKS DOWN. Server, edge and browser shared one ignore
    // list containing every shape below, so a Supabase outage — or a deploy that
    // shipped the wrong Supabase URL — produced ZERO events out of this panel.
    expect(dropsOnServer(type, value)).toBe(false);
  });

  it("derives the server list by behaviour, so a new shared entry cannot re-close the hole", () => {
    // SERVER_IGNORED_ERRORS is IGNORED_ERRORS minus anything that matches a
    // known transport message. scrub.ts owns that shared list and may gain
    // entries later; a hand-copied subset would drift silently.
    expect(SERVER_IGNORED_ERRORS.length).toBeLessThan(IGNORED_ERRORS.length);
    for (const pattern of SERVER_IGNORED_ERRORS) {
      expect(IGNORED_ERRORS).toContain(pattern);
    }
    // Spelled out so the derivation is REVIEWABLE rather than merely trusted:
    // this is exactly what survives, and every entry is unactionable in any
    // runtime. If a future edit to scrub.ts changes the outcome, it fails here
    // and someone reads the list rather than discovering it during an outage.
    expect(SERVER_IGNORED_ERRORS.map(String)).toEqual([
      "NEXT_REDIRECT",
      "NEXT_NOT_FOUND",
      "NEXT_HTTP_ERROR_FALLBACK",
      "/^ResizeObserver loop/",
      "Non-Error promise rejection captured",
      "/extension\\//",
      "top.GLOBALS",
    ]);
  });

  it("still drops what is noise in EVERY runtime", () => {
    for (const list of [BROWSER_IGNORE_LIST, SERVER_IGNORED_ERRORS]) {
      // redirect() and notFound() throw by design in guards.ts and every [id]
      // page; they are control flow, not failures.
      expect(dropsWith(list, "Error", "NEXT_REDIRECT")).toBe(true);
      expect(dropsWith(list, "Error", "NEXT_NOT_FOUND")).toBe(true);
      expect(dropsWith(list, "Error", "NEXT_HTTP_ERROR_FALLBACK")).toBe(true);
      expect(dropsWith(list, "Error", "Non-Error promise rejection captured")).toBe(true);
    }
  });

  it("does not swallow real application errors that merely mention a word", () => {
    // Why the patterns are anchored: `ignoreErrors` matches substrings, and
    // exceljs really does say "terminated" when a workbook stream dies.
    expect(dropsInBrowser("Error", "Workbook stream terminated early")).toBe(false);
    expect(dropsInBrowser("Error", "Import fetch failed to validate row 3")).toBe(false);
    expect(dropsInBrowser("TypeError", "Cannot read properties of undefined")).toBe(false);
  });
});

describe("the budget does not drop a fault nobody has seen yet", () => {
  /** A spent hour, with headroom held back for the unseen. */
  const reserved = () =>
    createEventBudget({
      perHour: 2,
      perDay: 10,
      perIssuePerHour: 2,
      novelPerHour: 2,
      novelPerDay: 4,
    });

  it("admits a NOVEL fingerprint even when the global budget is spent", () => {
    // THE BUG: the global per-hour check ran BEFORE the per-issue one, so during
    // a busy hour the first occurrence of a never-before-seen fingerprint was
    // dropped — the event most likely to be the new fault, discarded to protect
    // budget an already-reported fault had spent.
    const budget = reserved();

    expect(budget.admit("known-noisy-fault", T0)).toBe(true);
    expect(budget.admit("known-noisy-fault", T0 + 1)).toBe(true);
    expect(budget.stats(T0 + 2).sentLastHour).toBe(2);

    expect(budget.admit("bulk-import-crash", T0 + 2)).toBe(true);
    expect(budget.stats(T0 + 2).reserveLastHour).toBe(1);
  });

  it("throttles the repeat offender the reserve is protecting headroom FROM", () => {
    const budget = reserved();
    budget.admit("middleware-loop", T0);
    budget.admit("middleware-loop", T0 + 1);
    for (let i = 2; i < 500; i += 1) {
      expect(budget.admit("middleware-loop", T0 + i)).toBe(false);
    }
    expect(budget.stats(T0 + 500).sentLastHour).toBe(2);
    expect(budget.stats(T0 + 500).reserveLastHour).toBe(0);
  });

  it("bounds the reserve itself, so it cannot become a second budget", () => {
    const budget = reserved();
    budget.admit("a", T0);
    budget.admit("a", T0 + 1);

    expect(budget.admit("novel-1", T0 + 2)).toBe(true);
    expect(budget.admit("novel-2", T0 + 3)).toBe(true);
    expect(budget.admit("novel-3", T0 + 4)).toBe(false);
    expect(budget.stats(T0 + 4).sentLastHour).toBe(4); // perHour + novelPerHour
  });

  it("refills the reserve as the hour rolls forward", () => {
    const budget = reserved();
    budget.admit("a", T0);
    budget.admit("a", T0 + 1);
    budget.admit("novel-1", T0 + 2);
    budget.admit("novel-2", T0 + 3);
    expect(budget.admit("novel-3", T0 + 4)).toBe(false);
    expect(budget.admit("novel-4", T0 + HOUR + 5)).toBe(true);
  });

  it("defaults to NO reserve, so an existing caller cannot gain headroom silently", () => {
    const budget = createEventBudget({ perHour: 2, perDay: 10, perIssuePerHour: 2 });
    budget.admit("a", T0);
    budget.admit("a", T0 + 1);
    expect(budget.admit("novel", T0 + 2)).toBe(false);
  });

  it("ships a reserve on the limits this app actually uses", () => {
    expect(SENTRY_BUDGET_LIMITS.novelPerHour).toBeGreaterThan(0);
    expect(SENTRY_BUDGET_LIMITS.novelPerDay).toBeGreaterThan(0);
    // Worst case per process per day must still be roughly this app's share.
    expect(
      SENTRY_BUDGET_LIMITS.perDay + (SENTRY_BUDGET_LIMITS.novelPerDay ?? 0),
    ).toBeLessThanOrEqual(40);
  });
});
