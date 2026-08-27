// The replacement RPC's invariants, asserted on the SQL source.
//
// There is no database in this suite, so these are source-level checks — the
// same pattern as olympiad-dup-key.test.ts and guarded-deletion-sql.test.ts.
// They exist because `admin_replace_olympiad_grade_pool` PERMANENTLY DELETES
// question rows, and every property below is one an innocent-looking edit could
// remove without any test failing otherwise.
//
// The behavioural proof lives elsewhere and was run against staging before the
// migration was applied: 10/10 probes, including "6 replaced by 4 => exactly 4
// published, 6 hard-deleted" and "an answered question is ARCHIVED, its graded
// answer row survives".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

function functionBody(sql: string, name: string): string {
  const decl = sql.indexOf(`function public.${name}(`);
  expect(decl).toBeGreaterThan(-1);
  const at = sql.indexOf("\nas $$\n", decl);
  expect(at).toBeGreaterThan(decl);
  const end = sql.indexOf("\n$$;", at);
  expect(end).toBeGreaterThan(at);
  return sql.slice(at, end + 4);
}

const MIGRATION_FILE = "supabase/sql/migrations/2026_08_27_147_olympiad_pool_replace.sql";
const CANONICAL_FILE = "supabase/sql/015_olympiad_preparation.sql";
const NAME = "admin_replace_olympiad_grade_pool";

const MIGRATION = functionBody(read(MIGRATION_FILE), NAME);
const CANONICAL = functionBody(read(CANONICAL_FILE), NAME);

describe("admin_replace_olympiad_grade_pool — canonical backport", () => {
  it("has the SAME body in the migration and in canonical 015", () => {
    // A from-zero rebuild runs the canonical file, never the migration. Drift
    // here means production and a fresh database disagree about an operation
    // that deletes questions.
    expect(CANONICAL).toBe(MIGRATION);
  });
});

describe("the destructive contract", () => {
  it("reuses purge_question_set rather than deleting questions itself", () => {
    // purge_question_set owns the ONE rule that matters: never-answered rows are
    // hard-deleted, answered rows are archived. A hand-rolled delete here would
    // cascade test_attempt_answers and destroy graded results, because an
    // olympiad attempt carries no content snapshot.
    expect(MIGRATION).toContain("purge_question_set");
    expect(MIGRATION).not.toMatch(/delete\s+from\s+public\.questions/i);
  });

  it("reuses the existing importer instead of a second one", () => {
    expect(MIGRATION).toContain("bulk_insert_olympiad_package_questions");
  });

  it("is all-or-nothing: a short import raises instead of committing", () => {
    // The append path reports bad rows and commits the good ones. Here that
    // would leave the grade holding neither the old pool nor the new one.
    expect(MIGRATION).toContain("replacement_incomplete");
    expect(MIGRATION).toMatch(/v_ok\s*<>\s*v_incoming/);
  });

  it("refuses an empty payload, so it cannot become a back-door purge", () => {
    expect(MIGRATION).toContain("empty_replacement");
  });

  it("demands the package code and takes a row lock before anything else", () => {
    expect(MIGRATION).toContain("confirmation_mismatch");
    expect(MIGRATION).toContain("for update");
  });

  it("asserts the per-attempt floor against the POST state", () => {
    // Nothing else in the schema checks this on a SHRINK: the activation guard
    // fires only on a transition into active, and start_olympiad_attempt clamps
    // with least(n_per, pool) rather than refusing — so a paid 25-question
    // olympiad could silently serve 10.
    expect(MIGRATION).toContain("assert_olympiad_pool_meets_per_attempt");
    expect(MIGRATION).toContain("replacement_below_floor");
  });

  it("delegates the purchase predicate rather than re-implementing it", () => {
    expect(MIGRATION).toContain("olympiad_grade_purchase_count");
  });

  it("returns the orphaned media for the caller to sweep", () => {
    // Deleting question rows does not delete their images; without this the
    // bucket keeps every replaced question's picture forever.
    expect(MIGRATION).toContain("orphaned_media_ids");
    expect(MIGRATION).toContain("media_truncated");
  });

  it("hides archived survivors from the importer's duplicate snapshot", () => {
    // The importer's snapshot deliberately INCLUDES archived rows, which is
    // right for an append and wrong for a replacement: a re-uploaded question
    // would be skipped and the count check above would abort the whole thing.
    // Measured on staging before this was added: a 4-row upload landed 3.
    expect(MIGRATION).toMatch(/grade_id\s*=\s*null/);
    expect(MIGRATION).toContain("reattach_failed");
  });

  it("never clears olympiad_package_id while detaching", () => {
    // Clearing it would move the rows into the general bank, whose daily-round
    // pool is `olympiad_package_id is null` — injecting olympiad content into
    // every child's rated round.
    expect(MIGRATION).not.toMatch(/set\s+olympiad_package_id\s*=\s*null/i);
  });

  it("touches no entitlement, purchase or notification", () => {
    // Spec §8: a purchaser keeps their access and is told nothing. The RPC
    // needing no code for that is the point — this asserts none was added.
    expect(MIGRATION).not.toContain("entitlements");
    expect(MIGRATION).not.toContain("olympiad_purchases");
    expect(MIGRATION).not.toContain("notifications");
  });

  it("does not flip the package status", () => {
    // The delete path auto-demotes to inactive, which pulls the package out of
    // the public catalogue. A replacement validates the floor and keeps the
    // package exactly where it was.
    expect(MIGRATION).not.toMatch(/update\s+public\.olympiad_packages/i);
  });
});

describe("grants", () => {
  const migrationSql = read(MIGRATION_FILE);

  it("is revoked from anon and granted only to authenticated + service_role", () => {
    expect(migrationSql).toMatch(
      /revoke all on function public\.admin_replace_olympiad_grade_pool[\s\S]*?from public, anon;/,
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.admin_replace_olympiad_grade_pool[\s\S]*?to authenticated, service_role;/,
    );
  });

  it("does not change the importer's arity", () => {
    // olympiad-dup-key.test.ts asserts the importer's body byte-for-byte, and
    // migration 108's header forbids adding a parameter to it. A "just add a
    // p_replace flag" edit would break both.
    expect(migrationSql).toContain("p.pronargs = 3");
  });
});
