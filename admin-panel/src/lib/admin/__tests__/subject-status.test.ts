// Invariants of the subject publish/archive action, asserted on the source.
//
// Source-level rather than behavioural for a specific reason: the transition map
// lives inside a `"use server"` module, and EVERY export of one of those is a
// POST-able endpoint. Exporting the map so a test could import it would put a
// new endpoint on the internet to make a test tidier. The repo already uses this
// pattern for SQL invariants (guarded-deletion-sql, olympiad-pool-replace-sql);
// this is the same trade.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(process.cwd(), "src/lib/admin/subject-status.ts"),
  "utf8",
).split("\r\n").join("\n");

describe("transitionSubject — authorization and shape", () => {
  it("guards before reading any client field", () => {
    // requireAdmin() must come before the first formData.get, or an
    // unauthenticated POST gets to influence what the action looks up.
    const guard = SRC.indexOf("await requireAdmin()");
    const firstRead = SRC.indexOf("formData.get(");
    expect(guard).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstRead);
  });

  it("validates the id shape before querying", () => {
    expect(SRC).toContain("UUID_RE.test(id)");
  });

  it("writes an audit row for every accepted transition", () => {
    expect(SRC).toContain("admin.subject.transition");
    expect(SRC).toContain("writeAuditLog");
  });

  it("never returns a raw database message to the client", () => {
    // The action returns void; a failure must be logged, not surfaced.
    expect(SRC).not.toMatch(/return\s*\{\s*error:\s*error\.message/);
    expect(SRC).toContain("console.error");
  });
});

describe("the transition whitelist", () => {
  // Parse the map out of the source so these assert the REAL table, not a copy
  // that could drift from it.
  const block = SRC.slice(
    SRC.indexOf("const SUBJECT_TRANSITIONS"),
    SRC.indexOf("export type SubjectStatusState"),
  );

  const entry = (name: string) => {
    const m = block.match(
      new RegExp(`${name}:\\s*\\{\\s*from:\\s*\\[([^\\]]*)\\],\\s*to:\\s*"([a-z]+)"`),
    );
    expect(m, `transition "${name}" is missing`).toBeTruthy();
    return {
      from: m![1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean),
      to: m![2],
    };
  };

  it("only ever moves between the three catalog_status values", () => {
    const allowed = new Set(["active", "inactive", "archived"]);
    for (const name of ["publish", "unpublish", "archive"]) {
      const t = entry(name);
      expect(allowed.has(t.to)).toBe(true);
      for (const f of t.from) expect(allowed.has(f)).toBe(true);
    }
  });

  it("never allows a transition from a status to itself", () => {
    // A self-transition would write an audit row claiming a change that did not
    // happen, and would make a double-click look like two publishes.
    for (const name of ["publish", "unpublish", "archive"]) {
      const t = entry(name);
      expect(t.from).not.toContain(t.to);
    }
  });

  it("makes archiving REVERSIBLE — this is what separates it from delete", () => {
    // If `publish` could not come back from 'archived', archive would be a
    // one-way door and the admin would reach for Delete instead, which is the
    // action that destroys questions.
    expect(entry("publish").from).toContain("archived");
  });

  it("covers every reachable status, so no subject can get stuck", () => {
    // Every status must be the source of at least one transition; a status with
    // no way out is a subject an admin can never publish or retire again.
    const sources = new Set<string>();
    for (const name of ["publish", "unpublish", "archive"]) {
      for (const f of entry(name).from) sources.add(f);
    }
    expect([...sources].sort()).toEqual(["active", "archived", "inactive"]);
  });
});

describe("staleness", () => {
  it("re-reads the current status before writing", () => {
    // The button was rendered from data that may be seconds old. Without the
    // re-read plus the `from` check, a stale tab could archive a subject
    // somebody else just published.
    const read = SRC.indexOf('.from("subjects")');
    const check = SRC.indexOf("tr.from.includes(");
    const write = SRC.indexOf(".update({ status: tr.to");
    expect(read).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(read);
    expect(write).toBeGreaterThan(check);
  });
});
