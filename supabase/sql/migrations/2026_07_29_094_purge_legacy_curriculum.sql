-- =============================================================================
-- 2026_07_29_094_purge_legacy_curriculum.sql
-- =============================================================================
-- Migration: 2026_07_29_094_purge_legacy_curriculum.sql
-- Purpose: HARD-DELETE the entire legacy academic curriculum (topics +
--          subtopics, both `exam` and `olympiad` scope) and EVERY question in
--          the database — general bank AND purchased-olympiad pools — together
--          with every row derived from them, then rebuild every cached
--          aggregate the purge invalidates so the platform is left CONSISTENT
--          and not merely empty. Migration 095 imports the 2026 curriculum on
--          top of the empty tree.
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/003_academic_taxonomy.sql (no schema
--          change — data only), supabase/sql/013_validation_queries.sql
--          (post-purge emptiness checks may be added by the main session).
--          NOTE: this migration changes NO schema object. Nothing here needs a
--          structural backport; the canonical files already describe the shape
--          the database is left in. What DOES need a doc change is the root
--          CLAUDE.md pair of rules quoted under "OWNER DECISION" below — the
--          main session owns that edit.
-- Backport status: pending
-- Destructive change: YES — irreversible mass DELETE, explicitly approved.
-- Rollback notes: NOT rollback-able once committed. There is no undo: the
--          questions, their options/translations/explanations, all attempt
--          history and all derived scoring data are gone. The ONLY recovery is
--          a database restore taken before the run. Apply with an explicit
--          transaction (this file opens one) and take a backup first.
--
-- -----------------------------------------------------------------------------
-- HOW TO APPLY (the flag is not optional)
-- -----------------------------------------------------------------------------
--   psql "$OLIMPIADA_DEV_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/sql/migrations/2026_07_29_094_purge_legacy_curriculum.sql
--
-- WITHOUT -v ON_ERROR_STOP=1 psql exits 0 even when the script errored midway:
-- the error scrolls past, every later statement prints "current transaction is
-- aborted", the trailing `commit;` reports ROLLBACK, and the shell sees success.
-- For an irreversible migration whose success signal is a NOTICE buried among
-- ~25 others, that is how an operator concludes the purge landed when nothing
-- did — and then runs 095, which fails at I7 for a reason that looks unrelated.
-- (`\set ON_ERROR_STOP on` is deliberately NOT written inside the file: it is a
-- psql meta-command and would break pasting this file into the Supabase SQL
-- editor.)
--
-- Post-check, immediately after the run:
--   select count(*) from public.questions;   -- must be 0
--
-- CONCURRENCY: step L0 below takes an EXCLUSIVE lock on every affected table.
-- Plain SELECTs still work, but writers block for the duration of the purge.
-- Quiesce the apps (stop `next dev`, close the phone) before applying anyway —
-- the lock makes the purge CORRECT, it does not make a mid-purge user session
-- pleasant.
--
-- -----------------------------------------------------------------------------
-- OWNER DECISION (given explicitly, do not re-litigate)
-- -----------------------------------------------------------------------------
-- The owner chose HARD DELETE over archiving, with full knowledge that it:
--   * empties the question pools of every purchased lifetime olympiad package
--     (8 packages / 12 purchases on dev at authoring time), and
--   * wipes the leaderboard / percentage / streak history derived from the
--     answered questions (32 attempts / 757 answered rows on dev).
-- These are demo accounts. Two root CLAUDE.md rules currently forbid exactly
-- this. Both were rewritten in the SAME round as this migration (see the
-- "Non-Negotiable Rules" section of the root CLAUDE.md — the carve-out is
-- dated 2026-07-29 and names these two files):
--   1. "A question that any attempt ever answered can NEVER be hard-deleted
--       (DB guard) — archive it instead."
--   2. "Never delete purchased olympiad package records; archive listings only
--       (purchasers keep lifetime access)."
-- Rule 2's INTENT is preserved here: no olympiad_packages / olympiad_purchases
-- row is deleted, and no package status is changed either. Purchasers keep
-- their package, their listing AND their lifetime entitlement; only the
-- QUESTION POOL behind it is emptied, which is what the owner asked for.
--
-- WHY NO DEACTIVATION (an earlier draft of this file flipped every emptied
-- package to 'inactive' — that step was REMOVED, deliberately):
--   * Both parent-facing olympiad surfaces render from a list filtered
--     status = 'active' (web-app/src/app/(parent)/olympiads/page.tsx and
--     .../children/[id]/olympiads/page.tsx) and mobile's parent tab renders
--     get_my_olympiad_catalog(), whose WHERE clause is
--     olympiad_package_on_sale(p.status, …). There is NO purchase-driven list
--     anywhere on the parent side. Deactivating would therefore erase the
--     paying parent's ONLY view of what they bought — the opposite of the
--     lifetime-access promise this header makes.
--   * Deactivation is a ONE-WAY door: re-activating re-runs
--     assert_olympiad_pool_meets_per_attempt and REFUSES until a pool of at
--     least questions_per_attempt exists for every target grade. Leaving the
--     package active is fully reversible — an admin can deactivate it from the
--     panel in one click, at any time.
--   * The empty pool is already handled gracefully everywhere downstream:
--     start_olympiad_attempt raises P0002 → oly5.errEmpty ("no questions yet")
--     on web and mobile, and both clients now DISABLE the start control when
--     the pool count is 0 instead of offering a doomed round trip.
-- Step P13 now only REPORTS the emptied-but-active packages so the operator can
-- decide. If the owner wants them off the sale listing while the new pools are
-- authored, that is an ADMIN PANEL action, not a migration one.
--
-- -----------------------------------------------------------------------------
-- THE DELETE GUARD
-- -----------------------------------------------------------------------------
-- public.question_delete_guard() (trigger trg_question_delete_guard, BEFORE
-- DELETE ON public.questions) raises for any question that has a row in
-- test_attempt_answers. It MUST survive this migration — it protects the data
-- created after the reimport.
--
-- This file does NOT drop it and does NOT rely on ALTER TABLE ... DISABLE
-- TRIGGER. It does not have to: the guard's predicate is
-- `exists (select 1 from test_attempt_answers where question_id = old.id)`,
-- and the purge deletes every test_attempt_answers row (step P2) BEFORE it
-- deletes any question (step P10). By the time the guard fires its predicate is
-- already false for every row, so the guard passes on its own terms instead of
-- being bypassed. That is strictly safer than disabling it: there is no window
-- in which a concurrent session could delete an answered question, and no way
-- for the migration to fail half-way and leave the guard off.
--
-- For the same reason `session_replication_role = replica` is NOT used: it
-- would also suspend foreign-key enforcement and the audit triggers, i.e. it
-- would hide exactly the integrity problems this migration must not create.
--
-- Step P0 below ASSERTS the guard is present and enabled at the start and step
-- P14 re-asserts it at the end, so a future edit that "helpfully" disables it
-- fails the migration instead of silently shipping an unprotected database.
--
-- Other write guards on the affected tables were reviewed and none blocks the
-- purge:
--   * trg_question_taxonomy_guard / trg_question_term_guard / trg_olympiad_
--     pool_grade_guard  -> BEFORE INSERT/UPDATE only.
--   * trg_topic_term_cascade / trg_subtopic_term_guard          -> UPDATE/INSERT only.
--   * trg_olympiad_activation_pool_guard                        -> not reached:
--     this file no longer writes olympiad_packages at all (see P13).
--   * fn_audit_row on questions / olympiad_packages             -> intentionally
--     LEFT ON. The purge is exactly the kind of event the audit trail exists
--     for; the trigger swallows its own errors and cannot break the delete.
--
-- -----------------------------------------------------------------------------
-- WHAT IS DELETED AND WHY (derived from a live schema scan, not from memory)
-- -----------------------------------------------------------------------------
-- Every uuid / uuid[] / jsonb column in `public` was scanned against
-- questions.id, topics.id and subtopics.id. The complete set of referencing
-- locations found:
--   answer_options.question_id                (FK cascade)
--   answer_option_translations.option_id      (FK cascade, via answer_options)
--   question_translations.question_id         (FK cascade)
--   question_explanations.question_id         (FK cascade)
--   question_analytics.question_id            (FK cascade)
--   test_attempt_answers.question_id          (FK cascade)
--   test_questions.question_id                (FK cascade)
--   olympiad_package_questions.question_id    (FK cascade)
--   questions.topic_id / .subtopic_id         (FK SET NULL — would silently
--                                              orphan, so questions go first)
--   progress_snapshots.topic_id               (FK SET NULL — same)
--   subtopics.topic_id                        (FK cascade)
--   test_attempts.question_ids / .topic_ids / .subtopic_ids   (uuid[], NO FK)
--   daily_rounds.question_ids                 (uuid[], NO FK)
--   daily_practice_sets.question_ids          (uuid[], NO FK)
--   olympiad_question_rotations.seen_question_ids (uuid[], NO FK)
--   audit_logs.target_id / .before_json / .after_json / .metadata_json
--                                             (uuid + jsonb, NO FK — KEPT, see
--                                              below). Magnitude on dev at
--                                              authoring time: ~2000 target_id
--                                              rows plus ~1300 rows that embed
--                                              a purged id inside their
--                                              before/after payload, and the
--                                              purge itself appends ~740 more.
-- The same jsonb scan also found notifications.data_json carrying attempt_id
-- for 'attempt_graded' notifications (dead deep-links after the purge).
-- content_reviews (content_type/content_id) is a generic pair with no FK; it is
-- empty on dev but is handled explicitly so the migration is correct anywhere.
-- No other jsonb column (daily_rounds.content_snapshot,
-- leaderboard_snapshots.entries_json, progress_snapshots.metrics_json,
-- student_points_ledger.breakdown_json, question_imports.errors,
-- admin_notifications.*) referenced any purged id.
--
-- DELIBERATELY KEPT:
--   * audit_logs — the audit trail is the record OF the purge and of everything
--     before it. Deleting it would be destroying evidence; dangling ids (in
--     target_id AND inside the before/after payloads) are expected and correct
--     in an append-only log. This is the ONLY place where a purged id survives
--     anywhere in the database — verified by re-scanning every uuid, uuid[] and
--     jsonb column in `public` after a rolled-back trial run.
--   * media_assets — question images/audio. The DB stores metadata + the
--     Storage object path only; SQL cannot delete the Storage object. Dropping
--     the metadata row would strand the file in the bucket with nothing left
--     pointing at it. The rows are kept and step P11 REPORTS the now-orphaned
--     count so the owner can clean the bucket deliberately.
--   * olympiad_packages / olympiad_package_grades / olympiad_package_
--     translations / olympiad_purchases / payments / subscriptions — commerce
--     and entitlement records are never touched by a content purge.
--   * subjects, grades, difficulty_levels, question_types, sources,
--     olympiad_types, achievements, leaderboard_periods, leaderboard_seasons —
--     catalogs and configuration, not curriculum content. ONE exception inside
--     that list: leaderboard_seasons.standings_json is NOT configuration — it
--     is the frozen top-100 materialised from the points ledger when a season
--     closes (006_leaderboards_analytics.sql; written by close_leaderboard_
--     season, driven from admin-panel/src/lib/admin/leaderboard.ts). It is a
--     score-derived cached aggregate exactly like the students.* counters, so
--     step P6 resets it to '[]' while the season ROW itself is kept.
--
-- -----------------------------------------------------------------------------
-- CACHE REBUILD (the half everyone forgets)
-- -----------------------------------------------------------------------------
-- Deleting the ledger alone would fix only the SUBJECT leaderboard scope. Every
-- other scope (global / grade / city / district / school) reads the CACHED
-- counters on public.students — points_all_time, points_month, pct_num_all,
-- pct_den_all, lb_correct_all, lb_presented_all, lb_attempts_all and their
-- _month twins — plus current_streak / best_streak / last_active_date. Steps
-- P8 and P9 zero all of them, following the worked example in migration
-- 2026_07_26_088 PART B. After the purge NO ledger row and NO activity day
-- survives anywhere, so the "recompute" collapses to a total zeroing — but it
-- is written as an explicit, complete zeroing of every cached column rather
-- than a partial one, which is what keeps the boards correct.
--
-- Rerun-safe: YES. Every statement is an unconditional DELETE / idempotent
-- UPDATE over the same predicate; a second run finds nothing to do and the
-- assertions still pass.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- L0. Lock the affected tables for the duration of the purge.
-- -----------------------------------------------------------------------------
-- WHY THIS IS REQUIRED, not defensive noise.
-- The FK-backed children are safe without it: a concurrent INSERT into
-- test_attempt_answers takes SELECT … FOR KEY SHARE on the parent question row,
-- blocks on this transaction's uncommitted DELETE, and then fails with an FK
-- violation. But FOUR tables carry question ids as bare uuid[] with NO foreign
-- key — test_attempts, daily_rounds, daily_practice_sets and
-- olympiad_question_rotations — and nothing protects those. A live app session
-- (a `next dev` still running, a phone on the dev database) could insert into
-- any of them AFTER steps P3–P5 have run and commit AFTER P12 has already
-- asserted "empty", leaving a row whose question_ids point at questions that no
-- longer exist. Permanently, in a migration with no undo.
--
-- EXCLUSIVE blocks every concurrent INSERT/UPDATE/DELETE while still allowing
-- plain SELECT, and it WAITS OUT any writer that started before us. That is what
-- turns P12's counts from a snapshot into an actual guarantee.
-- No timeout is set: this migration must not half-apply, so waiting is the
-- correct behaviour. If it hangs, an app is still writing — stop it.
lock table public.questions,
           public.topics,
           public.subtopics,
           public.test_attempts,
           public.test_attempt_answers,
           public.daily_rounds,
           public.daily_practice_sets,
           public.olympiad_question_rotations,
           public.student_points_ledger,
           public.student_activity_days
      in exclusive mode;

-- -----------------------------------------------------------------------------
-- P0. Pre-flight assertions.
-- -----------------------------------------------------------------------------
do $$
declare
  v_enabled char;
begin
  select t.tgenabled into v_enabled
  from pg_trigger t
  where t.tgrelid = 'public.questions'::regclass
    and t.tgname  = 'trg_question_delete_guard'
    and not t.tgisinternal;

  if v_enabled is null then
    raise exception
      'purge aborted: trg_question_delete_guard is missing. This migration '
      'relies on the guard being PRESENT and passing on its own terms; a '
      'missing guard means the database is not in the state this file was '
      'written against.';
  end if;
  if v_enabled <> 'O' then
    raise exception
      'purge aborted: trg_question_delete_guard is not in the default enabled '
      'state (tgenabled = %). Restore it before purging.', v_enabled;
  end if;

  raise notice 'P0  delete guard present and enabled — purge may proceed.';
  raise notice 'P0  before: questions=%, topics=%, subtopics=%, attempts=%, answers=%',
    (select count(*) from public.questions),
    (select count(*) from public.topics),
    (select count(*) from public.subtopics),
    (select count(*) from public.test_attempts),
    (select count(*) from public.test_attempt_answers);
end $$;

-- -----------------------------------------------------------------------------
-- P1. Points ledger.
-- -----------------------------------------------------------------------------
-- Would cascade from test_attempts, but it is deleted explicitly and FIRST so
-- the ordering is stated rather than inherited from FK luck. Every ledger row
-- scores an attempt over questions that are about to stop existing.
delete from public.student_points_ledger;

-- -----------------------------------------------------------------------------
-- P2. Attempt answers.
-- -----------------------------------------------------------------------------
-- MUST precede P10: this is what makes trg_question_delete_guard pass.
delete from public.test_attempt_answers;

-- -----------------------------------------------------------------------------
-- P3. Attempts.
-- -----------------------------------------------------------------------------
-- Every attempt (kind = test | practice | daily | olympiad) stores question_ids
-- / topic_ids / subtopic_ids as bare uuid[] with NO foreign key: nothing would
-- ever clean them, and a "kept" attempt would render as an empty result page.
-- Deleting attempts also releases the ON DELETE RESTRICT reference that would
-- otherwise block P4 (test_attempts.daily_round_id -> daily_rounds).
delete from public.test_attempts;

-- -----------------------------------------------------------------------------
-- P4. Daily round snapshots + per-student practice sets.
-- -----------------------------------------------------------------------------
-- Both are frozen uuid[] snapshots of the purged pool. daily_rounds must come
-- after P3 because of the RESTRICT FK above.
delete from public.daily_rounds;
delete from public.daily_practice_sets;

-- -----------------------------------------------------------------------------
-- P5. Olympiad per-student rotation state.
-- -----------------------------------------------------------------------------
-- seen_question_ids is a uuid[] of purged questions. Left in place, the Round-51
-- rotation would consider a brand-new pool partly "already seen" by the student.
-- Deleting the row restarts every student's rotation at cycle 1 against the new
-- pool, which is the only correct state.
delete from public.olympiad_question_rotations;

-- -----------------------------------------------------------------------------
-- P6. Derived analytics / snapshots / awards.
-- -----------------------------------------------------------------------------
delete from public.question_analytics;      -- per-question stats (FK cascade anyway)
delete from public.progress_snapshots;      -- topic_id is SET NULL, metrics are derived
delete from public.leaderboard_entries;     -- materialised board rows
delete from public.leaderboard_snapshots;   -- frozen board JSON
delete from public.student_achievements;    -- earned from attempt history that no longer exists

-- A CLOSED season keeps its frozen top-100 in standings_json (materialised by
-- close_leaderboard_season from the points ledger). The season row is
-- configuration and stays; the standings are a score-derived cache of points
-- that no longer exist, so they are reset with the rest of the caches. 0 rows on
-- dev today — written anyway so the migration is correct in an environment that
-- has already closed a season.
update public.leaderboard_seasons
   set standings_json = '[]'::jsonb,
       updated_at     = now()
 where standings_json is distinct from '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- P7. Authoring-side records tied to the purged content.
-- -----------------------------------------------------------------------------
-- Legacy static tests (both empty on dev): test_questions cascades from
-- questions, but tests themselves would survive as empty shells.
delete from public.test_questions;
delete from public.tests;

-- Olympiad pool membership rows (cascade from questions; explicit for ordering).
delete from public.olympiad_package_questions;

-- Bulk-import run history: every row summarises an import of questions that no
-- longer exist, and the admin Imports screen would list runs whose output is
-- gone.
delete from public.question_imports;

-- Generic review rows pointing at purged content (content_type/content_id has
-- no FK). Both singular and plural spellings are covered because the column is
-- free text and nothing constrains it.
delete from public.content_reviews
 where lower(content_type) in ('question','questions','topic','topics','subtopic','subtopics')
    or content_id in (select id from public.questions)
    or content_id in (select id from public.topics)
    or content_id in (select id from public.subtopics);

-- Notifications deep-linking to a deleted attempt ('attempt_graded' →
-- /child/test/result/<attempt_id>). Every attempt is gone after P3, so any
-- notification carrying an attempt_id is now a dead link. notification_
-- deliveries cascades.
delete from public.notifications
 where data_json ? 'attempt_id';

-- -----------------------------------------------------------------------------
-- P8. Cached leaderboard / percentage counters on students.
-- -----------------------------------------------------------------------------
-- After P1 the ledger is empty, so the correct value of every cached aggregate
-- is zero. Written as a complete column-by-column zeroing (migration 088 PART B
-- pattern) — a partial reset is how the non-subject boards end up wrong.
-- points_month_key is nulled so the next award starts a fresh month bucket
-- instead of adding to a stale one.
update public.students
   set points_all_time    = 0,
       points_month       = 0,
       points_month_key   = null,
       last_points_at     = null,
       pct_num_all        = 0,
       pct_den_all        = 0,
       pct_num_month      = 0,
       pct_den_month      = 0,
       lb_correct_all     = 0,
       lb_correct_month   = 0,
       lb_presented_all   = 0,
       lb_presented_month = 0,
       lb_attempts_all    = 0,
       lb_attempts_month  = 0,
       updated_at         = now()
 where points_all_time    <> 0 or points_month     <> 0
    or points_month_key   is not null or last_points_at is not null
    or pct_num_all        <> 0 or pct_den_all      <> 0
    or pct_num_month      <> 0 or pct_den_month    <> 0
    or lb_correct_all     <> 0 or lb_correct_month <> 0
    or lb_presented_all   <> 0 or lb_presented_month <> 0
    or lb_attempts_all    <> 0 or lb_attempts_month  <> 0;

-- -----------------------------------------------------------------------------
-- P9. Streaks and activity days.
-- -----------------------------------------------------------------------------
-- student_activity_days is written only by award_attempt_points, i.e. only from
-- graded rated attempts — all of which are gone. Same rebuild-from-nothing
-- logic as 088 PART B, which collapses to a full reset.
delete from public.student_activity_days;

update public.students
   set current_streak   = 0,
       best_streak      = 0,
       last_active_date = null,
       updated_at       = now()
 where current_streak <> 0 or best_streak <> 0 or last_active_date is not null;

-- -----------------------------------------------------------------------------
-- P10. THE CONTENT ITSELF — questions, then subtopics, then topics.
-- -----------------------------------------------------------------------------
-- Order matters (§13):
--   * questions BEFORE subtopics/topics, because questions.topic_id and
--     .subtopic_id are ON DELETE SET NULL. Dropping the tree first would strip
--     the taxonomy off still-live questions instead of removing them.
--   * subtopics before topics is not strictly required (subtopics.topic_id
--     cascades) but is stated explicitly so the intent survives a future FK
--     change.
-- Deleting questions cascades to: answer_options → answer_option_translations,
-- question_translations, question_explanations, question_analytics,
-- test_attempt_answers, test_questions, olympiad_package_questions.
-- trg_question_delete_guard fires here and PASSES because P2 already emptied
-- test_attempt_answers.
delete from public.questions;
delete from public.subtopics;
delete from public.topics;

-- -----------------------------------------------------------------------------
-- P11. Report media metadata orphaned by the purge (kept on purpose).
-- -----------------------------------------------------------------------------
do $$
declare v_orphans int;
begin
  select count(*) into v_orphans
  from public.media_assets m
  where m.bucket in ('question-media','question-images','explanation-media')
     or (m.metadata_json ? 'question_id');

  if v_orphans > 0 then
    raise notice
      'P11 % media_assets row(s) look question-related and are now unreferenced. '
      'Rows KEPT on purpose: PostgreSQL holds metadata only and cannot delete the '
      'Storage object — dropping the row would strand the file in the bucket. '
      'Clean the bucket from the Supabase dashboard, then delete the metadata.',
      v_orphans;
  else
    raise notice 'P11 no question-related media_assets rows to report.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- P12. Assert the content tree and everything derived from it is empty.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad text := '';
begin
  if (select count(*) from public.questions)  <> 0 then v_bad := v_bad || ' questions';  end if;
  if (select count(*) from public.topics)     <> 0 then v_bad := v_bad || ' topics';     end if;
  if (select count(*) from public.subtopics)  <> 0 then v_bad := v_bad || ' subtopics';  end if;
  if (select count(*) from public.answer_options) <> 0 then v_bad := v_bad || ' answer_options'; end if;
  if (select count(*) from public.answer_option_translations) <> 0 then v_bad := v_bad || ' answer_option_translations'; end if;
  if (select count(*) from public.question_translations) <> 0 then v_bad := v_bad || ' question_translations'; end if;
  if (select count(*) from public.question_explanations) <> 0 then v_bad := v_bad || ' question_explanations'; end if;
  if (select count(*) from public.question_analytics) <> 0 then v_bad := v_bad || ' question_analytics'; end if;
  if (select count(*) from public.olympiad_package_questions) <> 0 then v_bad := v_bad || ' olympiad_package_questions'; end if;
  if (select count(*) from public.test_attempt_answers) <> 0 then v_bad := v_bad || ' test_attempt_answers'; end if;
  if (select count(*) from public.test_attempts) <> 0 then v_bad := v_bad || ' test_attempts'; end if;
  if (select count(*) from public.test_questions) <> 0 then v_bad := v_bad || ' test_questions'; end if;
  if (select count(*) from public.tests) <> 0 then v_bad := v_bad || ' tests'; end if;
  if (select count(*) from public.daily_rounds) <> 0 then v_bad := v_bad || ' daily_rounds'; end if;
  if (select count(*) from public.daily_practice_sets) <> 0 then v_bad := v_bad || ' daily_practice_sets'; end if;
  if (select count(*) from public.olympiad_question_rotations) <> 0 then v_bad := v_bad || ' olympiad_question_rotations'; end if;
  if (select count(*) from public.student_points_ledger) <> 0 then v_bad := v_bad || ' student_points_ledger'; end if;
  if (select count(*) from public.student_activity_days) <> 0 then v_bad := v_bad || ' student_activity_days'; end if;
  if (select count(*) from public.progress_snapshots) <> 0 then v_bad := v_bad || ' progress_snapshots'; end if;
  if (select count(*) from public.leaderboard_entries) <> 0 then v_bad := v_bad || ' leaderboard_entries'; end if;
  if (select count(*) from public.leaderboard_snapshots) <> 0 then v_bad := v_bad || ' leaderboard_snapshots'; end if;
  if (select count(*) from public.question_imports) <> 0 then v_bad := v_bad || ' question_imports'; end if;

  if v_bad <> '' then
    raise exception 'purge incomplete — still populated:%', v_bad;
  end if;

  -- No student may keep a cached aggregate, streak or month key.
  if exists (
    select 1 from public.students
     where points_all_time <> 0 or points_month <> 0 or points_month_key is not null
        or last_points_at is not null
        or pct_num_all <> 0 or pct_den_all <> 0 or pct_num_month <> 0 or pct_den_month <> 0
        or lb_correct_all <> 0 or lb_correct_month <> 0
        or lb_presented_all <> 0 or lb_presented_month <> 0
        or lb_attempts_all <> 0 or lb_attempts_month <> 0
        or current_streak <> 0 or best_streak <> 0 or last_active_date is not null
  ) then
    raise exception 'purge incomplete — a student still carries cached scoring state';
  end if;

  -- No closed season may keep a frozen top-100 built from deleted points.
  if exists (
    select 1 from public.leaderboard_seasons
     where standings_json is distinct from '[]'::jsonb
  ) then
    raise exception 'purge incomplete — a leaderboard season still carries frozen standings';
  end if;

  raise notice 'P12 content tree and all derived/cached state verified empty.';
end $$;

-- -----------------------------------------------------------------------------
-- P13. REPORT olympiad packages whose pool the purge emptied. (No write.)
-- -----------------------------------------------------------------------------
-- This step deliberately changes NOTHING. See the "WHY NO DEACTIVATION" block
-- in the header: flipping these packages to 'inactive' would remove them from
-- every parent-facing surface (all three read a status='active' list, and there
-- is no purchase-driven list anywhere on the parent side), i.e. it would erase
-- the paying parent's only view of what they bought — and re-activation is
-- blocked by assert_olympiad_pool_meets_per_attempt until a full replacement
-- pool exists, so it is a one-way door.
--
-- Leaving them active is the reversible choice: the owner can deactivate any of
-- them from the admin panel in one click after reading this notice. The empty
-- pool cannot hurt a student — start_olympiad_attempt raises P0002 and both
-- clients disable the start control at a pool count of 0.
do $$
declare
  v_names text;
  v_count int;
begin
  -- olympiad_packages has NO title column (localized titles live in
  -- olympiad_package_translations); `code` is the row's own unique slug.
  select count(*), string_agg(p.code, '; ' order by p.code)
    into v_count, v_names
  from public.olympiad_packages p
  where p.status = 'active'
    and not exists (select 1 from public.questions q where q.olympiad_package_id = p.id);

  if v_count > 0 then
    raise notice
      'P13 % ACTIVE olympiad package(s) now have an EMPTY question pool and are '
      'left active ON PURPOSE (purchasers must keep seeing what they bought): %. '
      'Upload a replacement pool of at least questions_per_attempt per target '
      'grade, or deactivate them from the admin panel if they should leave the '
      'sale listing meanwhile.',
      v_count, v_names;
  else
    raise notice 'P13 no active olympiad package was left with an empty pool.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- P14. Post-flight: the delete guard must still be armed.
-- -----------------------------------------------------------------------------
do $$
declare v_enabled char;
begin
  select t.tgenabled into v_enabled
  from pg_trigger t
  where t.tgrelid = 'public.questions'::regclass
    and t.tgname  = 'trg_question_delete_guard'
    and not t.tgisinternal;

  if v_enabled is distinct from 'O' then
    raise exception
      'purge aborted: trg_question_delete_guard is not enabled after the purge '
      '(tgenabled = %). The guard must survive — it protects the questions '
      'imported by migration 095 and everything authored after it.',
      coalesce(v_enabled::text, 'MISSING');
  end if;

  raise notice 'P14 delete guard still armed. Purge complete.';
  raise notice 'P14 after: questions=%, topics=%, subtopics=%, attempts=%, packages_deactivated_pool_empty=%',
    (select count(*) from public.questions),
    (select count(*) from public.topics),
    (select count(*) from public.subtopics),
    (select count(*) from public.test_attempts),
    (select count(*) from public.olympiad_packages p
      where p.status = 'inactive'
        and not exists (select 1 from public.questions q where q.olympiad_package_id = p.id));
end $$;

commit;

-- =============================================================================
-- End of 2026_07_29_094_purge_legacy_curriculum.sql
-- Next: 2026_07_29_095_import_curriculum_2026.sql imports the 2026 curriculum.
-- =============================================================================
