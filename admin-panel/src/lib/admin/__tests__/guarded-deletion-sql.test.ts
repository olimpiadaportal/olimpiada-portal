// Migration 111's guarded deletion, asserted against the SQL text itself.
//
// Nothing here runs against a database, and that is the point: the invariants
// below are the ones a query cannot catch until after the damage. A subject
// delete that stopped counting cancelled subscription lines still returns rows;
// a purge that archived BEFORE it deleted still returns counts. Both are only
// visible in the source, so both copies of the source — the migration and the
// canonical backport that a from-zero rebuild actually runs — are checked.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from the vitest root (admin-panel), NOT with `new URL(…,
// import.meta.url)`: Vite rewrites that pattern into an asset import and then
// refuses to serve a file outside the project.
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), "..", rel), "utf8").split("\r\n").join("\n");
}

const MIGRATION = read("supabase/sql/migrations/2026_08_12_111_guarded_deletion.sql");
const SQL_011 = read("supabase/sql/011_indexes_constraints_functions_triggers.sql");
const SQL_013 = read("supabase/sql/013_validation_queries.sql");
const SQL_015 = read("supabase/sql/015_olympiad_preparation.sql");
// Migration 113 removed the confirmation token from admin_delete_olympiad_package,
// so IT owns that function signature and its grants — 111 still carries the old
// two-argument form and must not be searched for the new one.
const MIGRATION_113 = read("supabase/sql/migrations/2026_08_15_113_package_delete_no_token.sql");

/**
 * A function's plpgsql BODY (`as $$ … $$;`) — the part that must be identical in
 * both files. Headers legitimately differ in other backports and are excluded
 * so this test fails on drift, not on formatting.
 */
function body(sql: string, name: string): string {
  const decl = sql.indexOf(`create or replace function public.${name}(`);
  expect(decl, `${name} is declared`).toBeGreaterThan(-1);
  const at = sql.indexOf("\nas $$\n", decl);
  expect(at, `${name} has a dollar-quoted body`).toBeGreaterThan(decl);
  const end = sql.indexOf("\n$$;", at);
  expect(end, `${name} body is terminated`).toBeGreaterThan(at);
  return sql.slice(at, end + 4);
}

// Which canonical file each function was backported into. plpgsql bodies are
// raw-parsed, so the subject half may read olympiad_packages from 011 even
// though 011 runs first; only the trigger on olympiad_packages forces 015.
const SUBJECT_HALF = [
  "purge_question_set",
  "subject_deletion_blocks",
  "subject_delete_guard",
  "admin_preview_subject_deletion",
  "admin_purge_subject_questions",
  "admin_delete_subject",
];
// Superseded by a LATER migration, so 015 no longer matches THIS file's copy.
// olympiad_grade_pool_blocks kept its behaviour but had its purchase predicate
// extracted into olympiad_grade_purchase_count by migration 112, which needed
// the same predicate for a selection rather than a whole pool. The byte-for-byte
// backport of the current body is asserted by that migration's own suite
// (olympiad-bulk-purge.test.ts); everything else here still applies to it,
// including that it stays out of 011 and that this migration's version never
// filtered purchases to status = 'active'.
//
// admin_delete_olympiad_package was superseded by migration 113 (owner
// decision): the typed confirmation code was removed, so 015 now carries a
// one-argument function that migration 111's copy cannot match. 113 owns that
// body and asserts it in its own verify block; what still matters here is that
// the token is gone from this one function and PRESENT on every sibling, which
// the signature assertions below pin.
const SUPERSEDED = ["olympiad_grade_pool_blocks", "admin_delete_olympiad_package"];
const OLYMPIAD_HALF = [
  "olympiad_package_deletion_blocks",
  "olympiad_package_delete_guard",
  "admin_preview_olympiad_package_deletion",
  "admin_preview_olympiad_grade_pool_deletion",
  "admin_delete_olympiad_grade_pool",
  "admin_unarchive_olympiad_package",
];

describe("migration 113 owns the token-free package delete", () => {
  it("revokes and grants at the ONE-argument signature", () => {
    expect(MIGRATION_113).toContain(
      "revoke all on function public.admin_delete_olympiad_package(uuid) from public, anon;",
    );
    expect(MIGRATION_113).toContain(
      "grant execute on function public.admin_delete_olympiad_package(uuid) to authenticated, service_role;",
    );
    // The removal must not have leaked into a sibling.
    for (const sig of [
      "public.admin_delete_subject(uuid,text)",
      "public.admin_purge_subject_questions(uuid,text)",
    ]) {
      expect(MIGRATION_113).toContain(sig);
    }
  });
});

describe("the canonical backport is the migration, character for character", () => {
  it.each(SUBJECT_HALF)("011 carries %s unchanged", (name) => {
    expect(body(SQL_011, name)).toBe(body(MIGRATION, name));
  });

  it.each(OLYMPIAD_HALF)("015 carries %s unchanged", (name) => {
    expect(body(SQL_015, name)).toBe(body(MIGRATION, name));
  });

  it("keeps the subject half out of 015 and the olympiad half out of 011", () => {
    // A stray second definition wins by run order, and 015 runs after 011 —
    // so a duplicate in the wrong file silently replaces the reviewed one.
    for (const name of SUBJECT_HALF) {
      expect(SQL_015).not.toContain(`create or replace function public.${name}(`);
    }
    for (const name of [...OLYMPIAD_HALF, ...SUPERSEDED]) {
      expect(SQL_011).not.toContain(`create or replace function public.${name}(`);
    }
  });

  it.each(SUPERSEDED)("015 still defines %s exactly once", (name) => {
    // A later migration owns its body; what must not happen is a second copy
    // appearing, because 015 runs after 011 and the last definition wins.
    const decl = `create or replace function public.${name}(`;
    expect(SQL_015.split(decl).length - 1).toBe(1);
  });

  it("puts no `language sql` body that reads an olympiad table into 011", () => {
    // 011 runs before the olympiad tables exist. A plpgsql body is raw-parsed
    // and survives; a `language sql` body is analyzed at CREATE time and would
    // fail the whole from-zero rebuild.
    for (const name of SUBJECT_HALF) {
      const decl = SQL_011.indexOf(`create or replace function public.${name}(`);
      const header = SQL_011.slice(decl, SQL_011.indexOf("\nas $$\n", decl));
      expect(header, `${name} must be plpgsql in 011`).toContain("language plpgsql");
    }
  });
});

const ALL = [...SUBJECT_HALF, ...OLYMPIAD_HALF, ...SUPERSEDED];

describe("every new function is admin-only, definer, and search_path-pinned", () => {
  it.each(ALL)("%s authorizes before it reads anything", (name) => {
    const decl = MIGRATION.indexOf(`create or replace function public.${name}(`);
    const header = MIGRATION.slice(decl, MIGRATION.indexOf("\nas $$\n", decl));
    expect(header).toContain("security definer");
    // An unpinned search_path on a definer function is privilege escalation.
    expect(header).toContain("set search_path = public, pg_temp");
  });

  it.each([
    "admin_preview_olympiad_package_deletion",
    "admin_preview_olympiad_grade_pool_deletion",
    "admin_preview_subject_deletion",
    "admin_delete_olympiad_package",
    "admin_delete_olympiad_grade_pool",
    "admin_purge_subject_questions",
    "admin_delete_subject",
    "admin_unarchive_olympiad_package",
  ])("%s calls is_admin() as its first statement", (name) => {
    const src = body(MIGRATION, name);
    const gate = src.indexOf("if not public.is_admin() then");
    expect(gate).toBeGreaterThan(-1);
    // Nothing may be read before the gate. `select` is the only statement that
    // could plausibly creep above it.
    expect(src.slice(0, gate)).not.toMatch(/\bselect\b/);
  });

  it("grants the admin RPCs to authenticated and the helpers to service_role only", () => {
    // The panel calls these AS the signed-in admin (the same way olympiad.ts
    // calls remove_olympiad_package_grade), so `authenticated` is required and
    // is_admin() inside is the real gate. The helpers delete rows and must not
    // be reachable that way.
    for (const sig of [
      "public.admin_delete_subject(uuid, text)",
      // Migration 113 dropped this one's token; it is a single-argument
      // function now. The siblings above and below keep theirs.
      "public.admin_unarchive_olympiad_package(uuid)",
    ]) {
      expect(MIGRATION).toContain(`revoke all on function ${sig} from public, anon;`);
      expect(MIGRATION).toContain(`grant execute on function ${sig}\n  to authenticated, service_role;`);
    }
    expect(MIGRATION).toContain(
      "revoke all on function public.purge_question_set(uuid[]) from public, anon, authenticated;",
    );
    expect(MIGRATION).toContain(
      "grant execute on function public.purge_question_set(uuid[]) to service_role;",
    );
  });
});

describe("answered questions are archived, never deleted", () => {
  it("deletes first and archives the survivors, so the split cannot drift", () => {
    const src = body(MIGRATION, "purge_question_set");
    const del = src.indexOf("delete from public.questions q");
    const arch = src.indexOf("set status = 'archived', updated_at = now()");
    expect(del).toBeGreaterThan(-1);
    // The reverse order would leave a question that got answered in between
    // published AND undeleted; worse, carrying a pre-computed classification
    // lets trg_question_delete_guard abort a transaction the admin confirmed.
    expect(arch).toBeGreaterThan(del);
    expect(src).toContain(
      "not exists (select 1 from public.test_attempt_answers a\n" +
        "                        where a.question_id = q.id)",
    );
    // The UPDATE deliberately has no answered-predicate of its own: everything
    // surviving the DELETE is answered by construction.
    const update = src.slice(arch);
    expect(update.slice(0, update.indexOf("get diagnostics"))).not.toContain(
      "test_attempt_answers",
    );
  });

  it("never deletes an answer row, a purchase or a purchased package", () => {
    for (const forbidden of [
      "delete from public.test_attempt_answers",
      "delete from public.olympiad_purchases",
      "delete from public.subscription_subjects",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });

  it("never disables a trigger or suspends replication-role enforcement", () => {
    // Both are banned by CLAUDE.md: they also suspend FK enforcement and
    // auditing, which is how migration 095 lost every row. Comment lines are
    // stripped first — the migration NAMES both manoeuvres to explain why it
    // does not use them, and that explanation must not fail its own test.
    const code = MIGRATION.split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(code).not.toContain("disable trigger");
    expect(code).not.toContain("session_replication_role");
  });

  it("archives the CONTAINER when anything answered survives", () => {
    // questions.olympiad_package_id is CASCADE, so deleting the package would
    // try to delete the rows just archived and the guard would abort the whole
    // transaction. One rule for both halves.
    for (const name of ["admin_delete_olympiad_package", "admin_delete_subject"]) {
      const src = body(MIGRATION, name);
      expect(src).toContain("'reason', 'answered_questions_retained'");
      expect(src).toContain("set status = 'archived', updated_at = now()");
    }
  });

  it("keeps the migration from ever dropping trg_question_delete_guard", () => {
    expect(MIGRATION).not.toContain("drop trigger if exists trg_question_delete_guard");
    // The verify block fails the whole file if the guard is gone when it ends.
    expect(MIGRATION).toContain("111: trg_question_delete_guard is missing or disabled");
    expect(MIGRATION).toContain(
      "111: question_delete_guard no longer raises question_has_attempts",
    );
  });
});

describe("the blocks are distinct, counted hints — not one generic error", () => {
  it("evaluates all nine subject reasons together", () => {
    const src = body(MIGRATION, "subject_deletion_blocks");
    for (const hint of [
      "subject_in_subscriptions",
      "subject_has_billing_history",
      "subject_has_attempts",
      "subject_has_points",
      "subject_in_olympiad_packages",
      "live_attempts",
      "subject_has_topics",
      "subject_has_questions",
      "subject_has_round_attempts",
    ]) {
      expect(src).toContain(`'hint', '${hint}'`);
    }
    // Collected into one array rather than raised one at a time, so the dialog
    // lists every reason instead of the admin fixing one and hitting the next.
    expect(src.split("v := v || jsonb_build_object(").length - 1).toBe(9);
  });

  it("blocks a subject that still owns a curriculum tree or a question bank", () => {
    // THE hole the trigger was written for. The other six reasons are all
    // HISTORY: every one of them is empty for a subject that was seeded but
    // never sold and never played — the state most live subjects are in — so
    // without these two the guard passes and the CASCADE takes topics and
    // subtopics while questions.subject_id/topic_id are SET NULL across the
    // whole general bank.
    const src = body(MIGRATION, "subject_deletion_blocks");
    expect(src).toContain("from public.topics where subject_id = p_subject_id;");
    expect(src).toContain(
      "from public.questions\n  where subject_id = p_subject_id and olympiad_package_id is null;",
    );
  });

  it("counts the attempt that would otherwise abort on a bare 23503", () => {
    // daily_rounds.subject_id is CASCADE, test_attempts.daily_round_id is
    // RESTRICT: an attempt whose own subject_id was already NULLed still pins
    // the round, passes every other block, and then fails the delete with an
    // errcode carrying no hint — the generic "server error" this migration
    // exists to remove.
    expect(body(MIGRATION, "subject_deletion_blocks")).toContain(
      "join public.daily_rounds dr on dr.id = ta.daily_round_id",
    );
  });

  it("blocks on a subscription line in ANY state, not just an active one", () => {
    // A cancelled row is the receipt for money already taken, and CASCADE
    // destroys it just as thoroughly. Existence of the row is the whole rule.
    expect(body(MIGRATION, "subject_deletion_blocks")).toContain(
      "from public.subscription_subjects where subject_id = p_subject_id;",
    );
  });

  it("blocks on a purchase row in ANY state", () => {
    expect(body(MIGRATION, "olympiad_package_deletion_blocks")).toContain(
      "from public.olympiad_purchases where olympiad_package_id = p_package_id;",
    );
  });

  it("reuses the shipped last_grade / grade_has_purchases spellings", () => {
    // The panel already renders oly2.err.lastGrade and
    // oly2.err.gradeHasPurchases for remove_olympiad_package_grade; a new
    // spelling would silently fall through to a generic server error.
    const src = body(MIGRATION, "olympiad_grade_pool_blocks");
    expect(src).toContain("'hint', 'last_grade'");
    expect(src).toContain("then 'grade_has_purchases' else 'grade_has_purchases_purge' end");
    expect(SQL_015).toContain("hint = 'last_grade'");
    expect(SQL_015).toContain("hint = 'grade_has_purchases'");
  });

  it("copies the legacy snapshot-less purchase branch rather than re-deriving it", () => {
    // remove_olympiad_package_grade treats a purchase with a NULL grade_id as
    // entitled to whichever grade the child is currently in. Re-deriving that
    // is how the safe path and the destructive path start disagreeing.
    const legacy = "or (pu.grade_id is null and exists (";
    expect(body(MIGRATION, "olympiad_grade_pool_blocks")).toContain(legacy);
    expect(body(SQL_015, "remove_olympiad_package_grade")).toContain(legacy);
  });

  it("counts purchases in ANY status on the path that HARD-DELETES the pool", () => {
    // The two predicates are DELIBERATELY different and must stay that way.
    // olympiad_grade_pool_blocks gates an irreversible delete;
    // remove_olympiad_package_grade gates a restorable ARCHIVE, where an
    // active-only count is the right call. Copying the archive predicate into
    // the delete path — which is what the first draft did — lets a 'pending' or
    // 'refunded' purchase through, and purchase_olympiad re-activates a
    // refunded row IN PLACE keeping its grade_id, so that dormant row becomes a
    // live lifetime entitlement onto a pool that no longer exists.
    expect(body(MIGRATION, "olympiad_grade_pool_blocks")).not.toContain(
      "pu.status = 'active'",
    );
    expect(body(SQL_015, "remove_olympiad_package_grade")).toContain("pu.status = 'active'");
    // Asserted in the migration's own verify block too, in both directions, so
    // a hand-edit in the SQL editor cannot undo it without failing 013 check 96.
    expect(MIGRATION).toContain(
      "111: olympiad_grade_pool_blocks still filters purchases to status = active",
    );
    expect(MIGRATION).toContain(
      "111: remove_olympiad_package_grade lost its active-only purchase predicate",
    );
  });

  it("leaves remove_olympiad_package_grade as the safe archive-only path", () => {
    // A third parameter would either create a PostgREST-ambiguous overload or
    // force a drop-and-recreate of an audited surface.
    expect(SQL_015).toContain(
      "create or replace function public.remove_olympiad_package_grade(\n" +
        "  p_package_id uuid,\n  p_grade_id   uuid\n)",
    );
    expect(MIGRATION).toContain("111: remove_olympiad_package_grade(uuid,uuid) went missing");
    expect(body(SQL_015, "remove_olympiad_package_grade")).not.toContain(
      "delete from public.questions",
    );
  });
});

describe("the destructive scopes are the narrow ones", () => {
  it("purges the general bank only, never a package pool", () => {
    // Without this clause "clear this subject's questions" empties a PURCHASED
    // olympiad pool — a back door around every olympiad guard in the migration.
    expect(body(MIGRATION, "admin_purge_subject_questions")).toContain(
      "where q.subject_id = p_subject_id and q.olympiad_package_id is null;",
    );
  });

  it("leaves topics and subtopics alone when only the questions are purged", () => {
    const src = body(MIGRATION, "admin_purge_subject_questions");
    expect(src).not.toContain("delete from public.topics");
    expect(src).not.toContain("delete from public.subtopics");
  });

  it("repairs the FK-less practice sets but never touches graded history", () => {
    const src = body(MIGRATION, "purge_question_set");
    expect(src).toContain("delete from public.daily_practice_sets where question_ids && v_del_ids;");
    // test_attempts.question_ids is graded history; daily_rounds carries a
    // content_snapshot and needs no repair.
    expect(src).not.toContain("update public.test_attempts");
    expect(src).not.toContain("delete from public.daily_rounds");
  });

  it("requires the row's own code before EVERY irreversible operation", () => {
    // Not just the two container deletes: the two operations that destroy the
    // most rows — a subject's whole general bank, and a whole olympiad grade
    // pool from a bare (package, grade) pair — shipped without a token in the
    // first draft. All four are granted to `authenticated`, so all four are
    // PostgREST endpoints an admin session can POST directly; a dialog is not
    // a control, the token is.
    for (const name of [
      "admin_delete_olympiad_package",
      "admin_delete_subject",
      "admin_purge_subject_questions",
      "admin_delete_olympiad_grade_pool",
    ]) {
      const src = body(MIGRATION, name);
      expect(src, name).toContain("hint = 'confirmation_mismatch'");
      // Checked before the blocking counts so a mistyped id fails on the cheap
      // test. (The purge has one inline block rather than a _blocks() helper.)
      const gate = src.indexOf("confirmation_mismatch");
      const blocks = Math.max(src.indexOf("_deletion_blocks("), src.indexOf("_pool_blocks("));
      const work = blocks > -1 ? blocks : src.indexOf("select coalesce(array_agg(q.id)");
      expect(gate, name).toBeLessThan(work);
    }
  });

  it("leaves no token-less overload of the two operations that gained one", () => {
    // Postgres keeps the original arity alongside the new one. A token-less
    // overload of a destructive function is not a leftover — it is the bypass,
    // and PostgREST would additionally have to guess between the two.
    for (const sig of [
      "public.admin_purge_subject_questions(uuid)",
      "public.admin_delete_olympiad_grade_pool(uuid, uuid, boolean)",
    ]) {
      expect(MIGRATION).toContain(`drop function if exists ${sig};`);
    }
    expect(MIGRATION).toContain(
      "111: the token-less admin_purge_subject_questions(uuid) overload still exists",
    );
    expect(MIGRATION).toContain(
      "111: the token-less admin_delete_olympiad_grade_pool(uuid,uuid,boolean) overload still exists",
    );
    // The canonical files define only the new arity — a from-zero rebuild can
    // never create the old one, so the drops are the migration's job alone.
    expect(SQL_011).not.toContain(
      "create or replace function public.admin_purge_subject_questions(p_subject_id uuid)\n",
    );
  });

  it("decides subject deletion's outcome BEFORE it destroys anything", () => {
    // The first draft purged the bank and only then discovered that answered
    // questions had survived, so it reported the soft outcome ("subject
    // archived") after the unanswered half of the bank was already gone.
    const src = body(MIGRATION, "admin_delete_subject");
    const decide = src.indexOf("select count(*)::int into v_answered");
    const purge = src.indexOf("public.admin_purge_subject_questions(p_subject_id");
    expect(decide).toBeGreaterThan(-1);
    expect(purge).toBeGreaterThan(-1);
    expect(decide).toBeLessThan(purge);
    // …and the archive branch it reaches destroys nothing at all.
    const branch = src.slice(decide, purge);
    expect(branch).toContain("'deleted_questions', 0");
    expect(branch).not.toContain("purge_question_set");
  });

  it("checks every media_assets consumer before calling an asset an orphan", () => {
    // The array goes straight to a Storage delete and every one of these
    // columns is ON DELETE SET NULL, so a missing consumer does not fail — it
    // sweeps a LIVE avatar, wallpaper, sticker or news cover out of the bucket
    // and blanks the row that used it. The same omission already shipped once
    // in sweepAbandonedImportMedia (import-media.ts), which is why that file's
    // `consumers` array and this clause must stay in step.
    const src = body(MIGRATION, "purge_question_set");
    for (const consumer of [
      "public.question_translations x\n                       where x.media_asset_id = c.m",
      "public.question_explanations x\n                       where x.media_asset_id = c.m",
      "public.answer_option_translations x\n                       where x.media_asset_id = c.m",
      "public.profiles x\n                       where x.avatar_media_id = c.m",
      "public.wallpapers x\n                       where x.media_asset_id = c.m",
      "public.sticker_images x\n                       where x.media_asset_id = c.m",
      "public.news x\n                       where x.cover_media_id = c.m",
      "public.olympiad_packages x\n                       where x.cover_media_id = c.m",
    ]) {
      expect(src, consumer.split("\n")[0]).toContain(consumer);
    }
    // The stated REASON has to stay true or it stops being a reason. Seven of
    // the eight FKs are ON DELETE SET NULL; sticker_images is ON DELETE
    // RESTRICT (011), and a comment that flattens that into "they are all SET
    // NULL" invites the next reader to prune the entries the blanket claim does
    // not cover — while the harm is if anything worse there: the sweep removes
    // the bytes FIRST, so the FK refuses only after the file is gone, and it
    // refuses the caller's whole batched media_assets delete with it.
    expect(src).toContain("sticker_images is ON DELETE RESTRICT");
  });
});

describe("the previews describe the outcome that will actually happen", () => {
  it("splits the package preview's cascade by outcome instead of overstating it", () => {
    // The ARCHIVE branch is the one that runs whenever a pool has ever been
    // played — i.e. most of the time — and it keeps the grades, the
    // translations and the pool rows, deleting only the rotation cache. A
    // single unconditional `cascade` reported all of those as about to be
    // destroyed; a confirmation screen an admin learns to disbelieve is worse
    // than no confirmation screen.
    const src = body(MIGRATION, "admin_preview_olympiad_package_deletion");
    expect(src).toContain("'outcome', case when v_answered > 0 then 'archive' else 'delete' end");
    expect(src).toContain("'delete_cascade', jsonb_build_object(");
    expect(src).toContain("'archive_cascade', jsonb_build_object(");
    expect(src).not.toContain("\n    'cascade', jsonb_build_object(");
    // The archive branch reports the ONE thing it really removes.
    const archive = src.slice(src.indexOf("'archive_cascade'"));
    expect(archive).toContain("'olympiad_question_rotations'");
    expect(archive).not.toContain("'olympiad_package_grades'");
  });

  it("tells the purge dialog how many children it is about to break", () => {
    // admin_purge_subject_questions is deliberately NOT blocked by a live
    // subscription — replacing a live subject's curriculum is its legitimate
    // use, and refusing it would leave psql as the only route. The mitigation
    // is the token plus this number: an emptied bank leaves
    // draw_daily_questions unable to assemble a set, so start_daily_round_
    // attempt raises no_data_found for every one of these children.
    const src = body(MIGRATION, "admin_preview_subject_deletion");
    expect(src).toContain("'hint', 'subject_purge_active_subscribers'");
    expect(src).toContain("'active_subscribers', v_subs");
    // Per CHILD, not per subscription line: two lines for one child is one
    // blocked student, and a number that double-counts stops being believed.
    expect(src).toContain("count(distinct cs.student_profile_id)");
    expect(src).toContain("cs.status in ('trialing', 'active', 'past_due')");
  });
});

describe("the two consequences that are outcomes, not blocks", () => {
  it("demotes an unservable ACTIVE package to inactive instead of leaving it live", () => {
    const src = body(MIGRATION, "admin_delete_olympiad_grade_pool");
    expect(src).toContain("perform public.assert_olympiad_pool_meets_per_attempt(");
    expect(src).toContain("exception when check_violation then\n      v_demote := true;");
    expect(src).toContain("set status = 'inactive', updated_at = now()");
    expect(src).toContain("'package_demoted', v_demote");
    // The demotion UPDATE re-fires trg_olympiad_activation_pool_guard, which
    // returns early only because new.status is not 'active'. That early return
    // is load-bearing and looks redundant, so the WHY comment must survive.
    expect(src).toContain("the guard returns early for any row whose new.status is not 'active'");
  });

  it("restores an archived package to inactive, never straight back on sale", () => {
    const src = body(MIGRATION, "admin_unarchive_olympiad_package");
    expect(src).toContain("hint = 'not_archived'");
    expect(src).toContain("set status = 'inactive', updated_at = now()");
    expect(src).not.toContain("set status = 'active'");
    // FOR UPDATE is what makes the not_archived check atomic with the write;
    // a read-then-update in the server action would be a TOCTOU.
    expect(src).toContain("for update");
  });
});

describe("013 validation checks", () => {
  it("numbers the new checks 96-100 and leaves 95 in place", () => {
    // Migration 109 already took 95.
    expect(SQL_013).toContain("'95_pending_interval_rollover'");
    for (const name of [
      "96_guarded_deletion_functions",
      "97_deletion_guard_triggers_armed",
      "98_no_orphaned_questions",
      "99_purchased_packages_intact",
      "100_subscription_subjects_intact",
    ]) {
      expect(SQL_013).toContain(`'${name}' as check_name`);
    }
  });

  it("asserts every new function, both new triggers and the old one", () => {
    for (const sig of [
      "public.admin_delete_subject(uuid,text)",
      "public.admin_delete_olympiad_package(uuid)",
      "public.purge_question_set(uuid[])",
      // The two signatures that gained a confirmation token.
      "public.admin_purge_subject_questions(uuid,text)",
      "public.admin_delete_olympiad_grade_pool(uuid,uuid,text,boolean)",
    ]) {
      expect(SQL_013).toContain(`('${sig}'`);
    }
    for (const tg of [
      "trg_question_delete_guard",
      "trg_subject_delete_guard",
      "trg_olympiad_package_delete_guard",
    ]) {
      expect(SQL_013).toContain(`('${tg}'`);
    }
  });

  it("probes the shipped bodies for each review finding, not just the signatures", () => {
    // A signature can be intact while the body has been hand-edited in the
    // Dashboard SQL editor. Check 96 therefore reads pg_get_functiondef and
    // asserts the sentence, in both directions where the two spellings of one
    // predicate must stay different.
    for (const needle of [
      "'confirmation_mismatch', true",
      "'subject_purge_active_subscribers', true",
      "'subject_has_topics', true",
      "'subject_has_questions', true",
      "'subject_has_round_attempts', true",
      "'x.avatar_media_id = c.m', true",
      "'public.sticker_images', true",
      // any-status counting on the destructive path…
      "('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)', 'pu.status = ''active''', false)",
      // …and the deliberately unchanged predicate on the archive path.
      "('public.remove_olympiad_package_grade(uuid,uuid)', 'pu.status = ''active''', true)",
      // the token-less arities must be gone, not merely unused
      "('public.admin_purge_subject_questions(uuid)', '', false)",
    ]) {
      expect(SQL_013).toContain(needle);
    }
    expect(SQL_013).toContain("failed_invariants");
  });
});

describe("transaction shape", () => {
  it("gives the migration exactly one begin and one commit", () => {
    // Migration 095 self-transacted inside a rebuild and its inner commit
    // committed the OUTER transaction, including a `drop schema`.
    const tx = MIGRATION.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm) || [];
    expect(tx.map((s) => s.trim())).toEqual(["begin;", "commit;"]);
    expect(MIGRATION).not.toContain("\\i ");
  });

  it("leaves the canonical files free of transaction control", () => {
    // They are sourced INSIDE a rebuild transaction; a stray commit there is
    // the migration-095 failure mode.
    for (const sql of [SQL_011, SQL_013, SQL_015]) {
      expect(sql.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/gm)).toBeNull();
    }
  });
});
