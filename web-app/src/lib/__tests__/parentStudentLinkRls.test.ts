// THE PARENT-CHILD LINK IS THE ACCESS CONTROL. Asserted against the SQL text.
//
// WHY THIS FILE EXISTS. `parent_student_links` is, in its own table comment
// (002), "the ONLY source of truth for parent access to a student".
// `is_parent_linked_to_student()` is a single EXISTS over it, it is SECURITY
// DEFINER so the table's own RLS never re-filters it, and roughly twenty SELECT
// policies plus the PRIVATE child-avatar storage gate read that helper as their
// authorization fact. On top of that the web app's `parentOwnsChild`
// (childAccountService.ts) accepts an active link as ownership and gates
// `resetChildPassword` on it — so one row in this table is the difference
// between a stranger and a parent, for a MINOR's record and a MINOR's login.
//
// Until migration 170 the two write policies constrained only
// `parent_profile_id`. They pinned WHO the row said the parent was and said
// nothing about WHICH CHILD it handed them, so any authenticated parent could
// INSERT an already-'active' link naming an arbitrary `student_profile_id`.
// `status` is client-settable (no column-level revoke, no BEFORE trigger, no
// CHECK), so it was one PostgREST call, not two — which is exactly why fixing
// only `psl_update` would have accomplished nothing, and why the INSERT policy
// is asserted here in its own right.
//
// The FK to `students(profile_id)` meant the id had to be real, and no route in
// the repository hands a parent a foreign student's profile id, so the chain was
// dormant rather than live. Dormant is not the property worth protecting: the
// sink is fully built and needs no further bug, and `student_profile_id` already
// travels in notification payloads and audit rows. The control has to be the
// policy predicate, not the secrecy of a random number — and a regression here
// is SILENT (nothing errors, no count moves), which is what a test is for.
//
// Nothing here touches a database, deliberately: the invariant lives in the
// source, and BOTH copies of the source are checked — the migration, and the
// canonical file that a from-zero rebuild actually runs. Style follows
// admin-panel/src/lib/admin/__tests__/guarded-deletion-sql.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from the vitest root (web-app), NOT with `new URL(…, import.meta.url)`:
// Vite rewrites that pattern into an asset import and then refuses to serve a
// file outside the project. CRs are normalized away — 010 and 013 are CRLF
// files, the migrations directory is LF, and the PREDICATE is what is being
// compared, not the checkout's line endings.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const SQL_010 = read("supabase/sql/010_rls_policies.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");
const MIGRATION_170 = read(
  "supabase/sql/migrations/2026_09_10_170_parent_student_link_forgery.sql",
);

const TABLE = "public.parent_student_links";

/**
 * One complete `create policy` statement, from `create` to its terminating
 * semicolon. Safe because a policy predicate contains no semicolons of its own.
 */
function policy(sql: string, name: string): string {
  const start = sql.indexOf(`create policy "${name}" on ${TABLE}`);
  expect(start, `create policy "${name}" on ${TABLE} not found`).toBeGreaterThan(-1);
  const end = sql.indexOf(";", start);
  expect(end, `unterminated policy "${name}"`).toBeGreaterThan(start);
  return sql.slice(start, end + 1);
}

/** The WITH CHECK arm (the NEW row) of a policy statement. */
function withCheckArm(stmt: string): string {
  const i = stmt.indexOf("with check");
  expect(i, "policy has no WITH CHECK arm").toBeGreaterThan(-1);
  return stmt.slice(i);
}

/** The USING arm (the OLD row) of a policy statement, up to WITH CHECK. */
function usingArm(stmt: string): string {
  const i = stmt.indexOf("using");
  expect(i, "policy has no USING arm").toBeGreaterThan(-1);
  const j = stmt.indexOf("with check", i);
  return stmt.slice(i, j === -1 ? undefined : j);
}

/**
 * The predicate that makes a write creator-scoped: the row must name a student
 * THIS caller created. Asserted as its three load-bearing parts rather than as
 * one formatted string, so reindenting the policy does not fail the test while
 * dropping any part of it does.
 */
function expectCreatorScoped(arm: string, label: string) {
  // The column the old policies ignored. This is the whole finding.
  expect(arm, `${label}: does not mention student_profile_id`).toContain("student_profile_id");
  // Tied to the caller's OWN children, not to any student that happens to exist.
  expect(arm, `${label}: does not read students.created_by_parent_profile_id`).toContain(
    "created_by_parent_profile_id",
  );
  // …resolved against the students table, not some other column of the link row.
  expect(arm, `${label}: does not join public.students`).toMatch(
    /exists\s*\(\s*select\s+1\s+from\s+public\.students\b/,
  );
  // …and bound to the caller, so it cannot be satisfied by a constant.
  expect(arm, `${label}: does not bind to current_profile_id()`).toContain(
    "public.current_profile_id()",
  );
}

/** The exact unconstrained predicate migration 170 removed. */
const OLD_PREDICATE = "(parent_profile_id = public.current_profile_id() or public.is_admin())";

describe("010: psl_insert constrains the student it hands over", () => {
  const stmt = policy(SQL_010, "psl_insert");

  it("is an INSERT policy for authenticated, not for anon", () => {
    expect(stmt).toContain("for insert to authenticated");
    expect(stmt).not.toContain("anon");
  });

  it("requires the named student to be one the caller CREATED", () => {
    expectCreatorScoped(withCheckArm(stmt), "psl_insert WITH CHECK");
  });

  it("no longer carries the predicate that constrained only parent_profile_id", () => {
    // The regression this whole file exists to catch: reverting to a predicate
    // that guards the row's owner column and leaves the privilege-conferring
    // column free. It reads perfectly reasonable in a diff.
    expect(stmt).not.toContain(`with check ${OLD_PREDICATE};`);
  });

  it("still lets an admin write a link", () => {
    expect(stmt).toContain("public.is_admin()");
  });
});

describe("010: psl_update constrains BOTH the old row and the new row", () => {
  const stmt = policy(SQL_010, "psl_update");

  it("is an UPDATE policy for authenticated", () => {
    expect(stmt).toContain("for update to authenticated");
  });

  it("USING is creator-scoped — no promoting someone else's link to 'active'", () => {
    expectCreatorScoped(usingArm(stmt), "psl_update USING");
  });

  it("WITH CHECK is creator-scoped — no repointing student_profile_id", () => {
    // Both arms matter, and a fix applied to only one of them looks done and is
    // not: USING alone still permits aiming an existing legitimate link at
    // another family's child; WITH CHECK alone still permits promoting a row
    // that already names one.
    expectCreatorScoped(withCheckArm(stmt), "psl_update WITH CHECK");
  });

  it("no longer carries the unconstrained predicate in either arm", () => {
    expect(stmt).not.toContain(`using ${OLD_PREDICATE}`);
    expect(stmt).not.toContain(`with check ${OLD_PREDICATE};`);
  });
});

describe("010: the policies 170 deliberately did NOT change", () => {
  it("psl_select still lets the parent and the student read their own link", () => {
    const stmt = policy(SQL_010, "psl_select");
    expect(stmt).toContain("parent_profile_id = public.current_profile_id()");
    expect(stmt).toContain("student_profile_id = public.current_profile_id()");
  });

  it("psl_delete still lets a parent remove their own link — that is not an escalation", () => {
    expect(policy(SQL_010, "psl_delete")).toContain(OLD_PREDICATE);
  });
});

describe("migration 170 and the canonical backport are the same policy", () => {
  // The repo rule is that every accepted migration is backported into the
  // canonical root file. Two copies of an authorization predicate that are
  // allowed to drift is how a from-zero rebuild silently reverts a security fix
  // — the exact failure mode already recorded for can_access_child_avatar.
  it.each(["psl_insert", "psl_update"])("%s is byte-identical in both files", (name) => {
    expect(policy(SQL_010, name)).toBe(policy(MIGRATION_170, name));
  });

  it("does not self-transact — a nested commit has cost this repo a database", () => {
    expect(MIGRATION_170).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
  });

  it("is idempotent: every create policy is preceded by a drop policy if exists", () => {
    const creates = MIGRATION_170.match(/create policy "(\w+)"/g) ?? [];
    expect(creates.length).toBe(2);
    for (const c of creates) {
      const name = c.slice('create policy "'.length, -1);
      expect(MIGRATION_170).toContain(`drop policy if exists "${name}" on ${TABLE};`);
    }
  });
});

describe("013 asserts the fix against the live database too", () => {
  // The source test above cannot see a production database whose policy was
  // changed by hand. Check 128 is what closes that gap, so its absence is itself
  // a regression.
  it("carries check 128", () => {
    expect(SQL_013).toContain("'128_psl_write_policies_creator_scoped' as check_name");
  });

  it("probes the stored predicate for the column the old policies ignored", () => {
    const i = SQL_013.indexOf("128) parent_student_links write policies");
    expect(i).toBeGreaterThan(-1);
    const check = SQL_013.slice(i);
    expect(check).toContain("pg_policies");
    expect(check).toContain("created_by_parent_profile_id");
    // qual = the OLD row, with_check = the NEW row. Both, or the check is half a
    // check.
    expect(check).toMatch(/position\('student_profile_id'\s+in qual\)/);
    expect(check).toMatch(/position\('student_profile_id'\s+in wchk\)/);
  });
});
