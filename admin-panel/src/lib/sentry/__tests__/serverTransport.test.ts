// @vitest-environment node
//
// THE OUTAGE MUST PRODUCE EVENTS, AND MUST NOT PRODUCE THOUSANDS OF THEM.
//
// This file runs under the NODE environment on purpose, while the rest of the
// admin suite runs under jsdom. The branch it exercises keys off
// `typeof window`: in a browser a failed request is a staff member's wifi and is
// ignored, on the server the identical text means the panel cannot reach its
// database and is reported. Under jsdom `budgetedBeforeSend` takes the browser
// path, so the server path would be untestable here — and it is the path that
// was blind.
//
// Two properties, and they are in tension, which is why they are asserted
// together:
//   1. an outage REPORTS. It stopped being in the ignore list.
//   2. an outage is AFFORDABLE. Every shape collapses onto one fingerprint, so
//      it costs `perIssuePerHour` events an hour rather than one per request
//      against an allowance of 5,000 a month for the whole organisation.
import { describe, expect, it } from "vitest";

import { createEventBudget } from "../budget";
import {
  SENTRY_BUDGET_LIMITS,
  SERVER_TRANSPORT_FINGERPRINT,
  budgetedBeforeSend,
  isTransportFailure,
} from "../options";
import type { ScrubEvent } from "../scrub";

const thrown = (type: string, value: string): ScrubEvent & { fingerprint?: string[] } => ({
  exception: { values: [{ type, value }] },
});

/** Every shape a real outage arrives as on a server runtime. */
const OUTAGE_SHAPES: Array<[string, string]> = [
  ["TypeError", "fetch failed"],
  ["TypeError", "terminated"],
  ["SocketError", "other side closed"],
  ["TimeoutError", "The operation was aborted due to timeout"],
  ["ConnectTimeoutError", "Connect Timeout Error"],
  ["Error", "UND_ERR_SOCKET"],
  ["Error", "connect ECONNREFUSED 10.0.0.1:5432"],
  ["Error", "getaddrinfo ENOTFOUND db.example.supabase.co"],
  ["TypeError", "Failed to fetch"],
];

describe("a Supabase outage is reported, collapsed onto one issue", () => {
  it("classifies every outage shape, and nothing of ours", () => {
    for (const [type, value] of OUTAGE_SHAPES) {
      expect(isTransportFailure(thrown(type, value)), `${type}: ${value}`).toBe(true);
    }
    expect(isTransportFailure(thrown("Error", "Workbook stream terminated early"))).toBe(
      false,
    );
    expect(isTransportFailure(thrown("Error", "Import fetch failed to validate row 3"))).toBe(
      false,
    );
    expect(isTransportFailure(thrown("TypeError", "Cannot read properties of undefined"))).toBe(
      false,
    );
  });

  it("sends the FIRST occurrence rather than swallowing the class", () => {
    // The whole point: before this round the server ignored these outright, so
    // the incident monitoring was bought for produced no events at all.
    //
    // IT RUNS FIRST IN THIS FILE ON PURPOSE. `budgetedBeforeSend` closes over
    // ONE module-scoped budget - module scope is the process - so a test that
    // asserts an event is ADMITTED has to come before the tests that spend the
    // per-issue allowance for the same (collapsed) fingerprint.
    const first = thrown("TypeError", "fetch failed");
    expect(budgetedBeforeSend(first)).not.toBeNull();
  });

  it("files every shape under ONE fingerprint", () => {
    // Without this, each occurrence carries its own host, port and address, the
    // fingerprinter reads them as different faults, and each claims its own
    // per-issue allowance — so reporting the outage would empty the month in
    // minutes. The collapse is what makes reporting it affordable.
    for (const [type, value] of OUTAGE_SHAPES) {
      const event = thrown(type, value);
      budgetedBeforeSend(event);
      expect(event.fingerprint, `${type}: ${value}`).toEqual([SERVER_TRANSPORT_FINGERPRINT]);
    }
  });

  it("leaves an explicit fingerprint alone — a call site outranks this rule", () => {
    const event = thrown("TypeError", "fetch failed");
    event.fingerprint = ["accounts-export"];
    budgetedBeforeSend(event);
    expect(event.fingerprint).toEqual(["accounts-export"]);
  });

  it("does not regroup an ordinary application error", () => {
    const event = thrown("RangeError", "Invalid grade 13");
    budgetedBeforeSend(event);
    expect(event.fingerprint).toBeUndefined();
  });

  it("costs a handful of events across a two-hour outage, not thousands", () => {
    // Middleware runs on EVERY request here, so an outage throws as fast as
    // traffic arrives: two hours at two a second is 14,400 occurrences.
    const budget = createEventBudget(SENTRY_BUDGET_LIMITS);
    let admitted = 0;
    for (let i = 0; i < 14_400; i += 1) {
      if (budget.admit(SERVER_TRANSPORT_FINGERPRINT, 1_700_000_000_000 + i * 500)) {
        admitted += 1;
      }
    }

    expect(admitted).toBeGreaterThan(0);
    expect(admitted).toBeLessThanOrEqual(SENTRY_BUDGET_LIMITS.perIssuePerHour * 2);
  });
});
