// A family must keep seeing an olympiad package they PAID for, even after an
// admin archives it.
//
// WHY THIS SUITE EXISTS. Archiving stops new sales; it has never revoked
// access. The database already says so — `can_view_olympiad_package()` grants
// through the purchase branch and never reads `status`, and CLAUDE.md states
// the rule outright ("archive listings only; purchasers keep lifetime access").
// But both parent-facing pages asked the catalogue question first: they
// selected `status = 'active'` packages and only THEN joined purchases onto the
// result. An archived package the family owns therefore vanished from the
// parent's screens while the child carried on playing it — the two halves of
// the product disagreeing about what "owned" means.
//
// It stayed latent because archiving used to mean a trip into the edit page's
// danger zone. Putting an Archive action on the package list (the fix for the
// owner's "I can't archive a purchased package" report) is exactly what makes
// this reachable, so it is pinned in the same round.
//
// Source-reading, in the idiom of leaderboardOrdering.test.ts and
// demoPaymentsRemoved.test.ts: what is pinned is an ORDER of operations and the
// ABSENCE of an unconditional filter, neither of which is observable at runtime
// without a live database. Comments are blanked first, so the pages stay free
// to explain the contract in prose using the very words being asserted on.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = {
  "parent catalogue": resolve(process.cwd(), "src/app/(parent)/olympiads/page.tsx"),
  "per-child": resolve(process.cwd(), "src/app/(parent)/children/[id]/olympiads/page.tsx"),
} as const;

/** File contents with block and line comments blanked out. */
function code(abs: string): string {
  return readFileSync(abs, "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

describe.each(Object.entries(PAGES))("%s olympiad page", (_name, path) => {
  const src = code(path);

  it("reads purchases BEFORE querying packages", () => {
    // Ownership widens the package query, so it has to be known first. If the
    // package read moves back above the purchase read, the widening cannot be
    // applied and the archived-but-owned package disappears again.
    const purchases = src.indexOf('from("olympiad_purchases")');
    const packages = src.indexOf('from("olympiad_packages")');
    expect(purchases).toBeGreaterThan(-1);
    expect(packages).toBeGreaterThan(-1);
    expect(purchases).toBeLessThan(packages);
  });

  it("widens the package query by what the family owns", () => {
    // The catalogue is status='active'. Ownership is a different question, and
    // it is answered by id — never by status.
    expect(src).toMatch(/\.or\(\s*`status\.eq\.active,id\.in\.\(/);
  });

  it("never filters the PACKAGE query on status unconditionally", () => {
    // `.eq("status", "active")` is still correct in two places, and only two:
    // as the else-branch taken when the family owns nothing, and on the
    // PURCHASES query (only an active purchase confers access — a different
    // question about a different table). What must never exist is a status
    // filter welded onto the package select itself, because that is the bug:
    // it decides the catalogue question before ownership is known.
    const start = src.indexOf('from("olympiad_packages")');
    expect(start).toBeGreaterThan(-1);
    const selectStatement = src.slice(start, src.indexOf(";", start));
    expect(selectStatement).not.toMatch(/\.eq\(\s*"status"/);
  });

  it("keeps the bare active filter as the else-branch of the ownership ternary", () => {
    expect(src).toMatch(
      /\?[\s\S]{0,400}\.or\(\s*`status\.eq\.active,id\.in\.\([\s\S]{0,300}:[\s\S]{0,300}\.eq\(\s*"status"\s*,\s*"active"\s*\)/,
    );
  });

  it("shape-checks every id before interpolating it into the filter", () => {
    // PostgREST's or=() takes a raw string, not a bound parameter. These ids
    // come back from the database today; the guard keeps that assumption from
    // silently becoming untrue.
    expect(src).toContain("UUID_RE");
    expect(src).toMatch(/UUID_RE\.test\(/);
  });
});
