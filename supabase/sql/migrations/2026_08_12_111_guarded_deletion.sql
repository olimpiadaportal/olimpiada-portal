-- 111 — Guarded deletion for subjects and olympiad packages
--
-- WHY
-- ---
-- The admin panel can already delete a SUBJECT. `deleteRow()` in
-- admin-panel/src/lib/admin/actions.ts is a bare
-- `supabase.from("subjects").delete().eq("id", id)` and `resources.ts`
-- registers "subjects" as an Admin-only resource — so today one click runs a
-- cascade nobody checks:
--   * subscription_subjects.subject_id is ON DELETE CASCADE, so the delete
--     silently strips a PAID line item out of a live subscription and
--     apply_due_plan_changes() then promotes intervals on a basket that lost a
--     row. That is money, and the row is also the receipt for money already
--     taken;
--   * topics.subject_id is ON DELETE CASCADE, and subtopics cascade from
--     topics — the whole curriculum tree goes with the subject;
--   * questions.subject_id is ON DELETE SET NULL, so the question bank is not
--     deleted but ORPHANED: every row silently loses the column that says what
--     it teaches;
--   * test_attempts.subject_id and student_points_ledger.subject_id are SET
--     NULL too. The Round-36 weighted percentage reads test_attempts.subject_id,
--     so a NULL there is not "missing data", it is a wrong rank.
-- Only two RESTRICTs brake any of this today — subscription_changes.subject_id,
-- and test_attempts.daily_round_id via the CASCADEd daily_rounds — and both
-- brake with a bare 23503 carrying no hint, which the panel can render only as
-- "server error". Neither fires at all for a subject nobody has played yet,
-- which is the state a seeded subject sits in and therefore the state in which
-- the cascade is fully reachable.
--
-- On the olympiad side the gap is the opposite one: there is no way to delete a
-- package at all, no way to clear one grade's pool without archiving it row by
-- row, and no way to undo an archive (archiveOlympiadPackage has no inverse
-- anywhere in the codebase).
--
-- This migration closes both. Deletion becomes an explained, counted, blocked
-- operation with distinct machine-readable hints, enforced in a BEFORE DELETE
-- TRIGGER (so the existing bare `.delete()` path is covered too) and again in
-- the RPCs (so the panel fails early with a payload it can render).
--
-- WHAT THIS DOES NOT DO
-- ---------------------
--   * It never hard-deletes a question that has attempt history. Such a
--     question is ARCHIVED and the operation reports how many were deleted vs
--     archived. When anything answered survives, the CONTAINER is archived
--     instead of deleted — one rule for packages and subjects alike.
--   * It never deletes a purchased package or an olympiad_purchases row.
--     Purchasers keep lifetime access; Archive is the operation offered instead.
--   * It never disables, drops or works around trg_question_delete_guard. The
--     2026-07-30 curriculum purge (migration 094) was a reviewed, owner-
--     authorised migration; it is not a precedent for an admin button. The
--     verify block at the bottom fails this whole migration if that guard is
--     missing or disabled when it finishes.
--   * It does not alter a single foreign key. A subject-less question is a
--     legitimate transient state during import repair, and rewriting live FKs
--     would widen this migration's blast radius for no gain.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- =============================================================================
-- 1. INTERNAL HELPERS
--    Service-internal: EXECUTE is granted to service_role only, exactly like
--    assert_olympiad_pool_meets_per_attempt. The admin-facing RPCs and the two
--    guard triggers reach them because a SECURITY DEFINER function owned by the
--    database owner keeps the owner's own privileges.
--    All three block builders are SECURITY DEFINER for the same reason
--    get_olympiad_pool_counts is: questions, test_attempts and
--    subscription_subjects are RLS-protected, and a count that passed because
--    rows were hidden from the caller is a lie, not a pass.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- purge_question_set : THE answered-question policy, in one place.
--
-- Splits a set of questions into "hard-delete" and "archive" and returns both
-- counts plus the media assets the delete orphaned. Every destructive path in
-- this migration goes through it, so the policy cannot drift between the
-- olympiad half and the subject half.
--
-- Why a split at all, instead of refusing the whole operation: a single attempt
-- anywhere in a 240-question pool would otherwise make that pool permanently
-- un-purgeable, leaving the admin 240 individual archive clicks — or a psql
-- session, which is precisely where the migration-095 catastrophe came from.
-- Archiving is the remedy CLAUDE.md prescribes, and an archived question is
-- already inert: start_olympiad_attempt and draw_daily_questions both draw
-- status = 'published' only, while test_attempt_answers and every review screen
-- stay intact.
-- -----------------------------------------------------------------------------
create or replace function public.purge_question_set(p_question_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidates uuid[] := '{}'::uuid[];   -- media referenced anywhere in the scope
  v_orphans    uuid[] := '{}'::uuid[];   -- …of those, the ones nothing references now
  v_del_ids    uuid[] := '{}'::uuid[];
  v_deleted    int := 0;
  v_archived   int := 0;
  v_retained   int := 0;
  v_already    int := 0;
  v_repaired   int := 0;
  v_truncated  boolean := false;
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return jsonb_build_object(
      'deleted', 0, 'archived', 0, 'retained', 0, 'already_archived', 0,
      'repaired_practice_sets', 0,
      'orphaned_media_ids', '[]'::jsonb, 'media_truncated', false);
  end if;

  select count(*)::int into v_already
  from public.questions q
  where q.id = any(p_question_ids) and q.status = 'archived';

  -- Media ids referenced ANYWHERE in the scope, collected BEFORE the delete —
  -- the translation rows that carry them cascade away with the question. The
  -- set is deliberately over-collected; the post-delete filter below is what
  -- makes it exact, and it is exact for the archived SURVIVORS too: their
  -- translation rows are still there, so their images are never reported.
  select coalesce(array_agg(distinct s.m), '{}'::uuid[]) into v_candidates
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
     where qt.question_id = any(p_question_ids) and qt.media_asset_id is not null
    union
    select qe.media_asset_id
      from public.question_explanations qe
     where qe.question_id = any(p_question_ids) and qe.media_asset_id is not null
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
     where ao.question_id = any(p_question_ids) and aot.media_asset_id is not null
  ) s;

  -- DELETE FIRST, and re-derive "unanswered" INSIDE the statement. Carrying a
  -- classification computed a moment earlier (by the preview, or even by the
  -- select above) is the bug: a student can answer one of these questions in
  -- between, and trg_question_delete_guard would then abort the entire
  -- transaction after the admin already confirmed.
  with del as (
    delete from public.questions q
     where q.id = any(p_question_ids)
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    returning q.id
  )
  select coalesce(array_agg(del.id), '{}'::uuid[]) into v_del_ids from del;
  v_deleted := cardinality(v_del_ids);

  -- Everything that survived the DELETE is answered BY CONSTRUCTION, so this
  -- statement needs no predicate of its own and the split can never disagree
  -- with what the delete actually did. The reverse order (archive first) would
  -- leave a question that got answered in between published AND undeleted.
  update public.questions
     set status = 'archived', updated_at = now()
   where id = any(p_question_ids) and status <> 'archived';
  get diagnostics v_archived = row_count;

  -- Survivors, not "newly archived": a scope whose answered questions were
  -- ALREADY archived still leaves rows behind, and the caller's decision to
  -- archive the container instead of deleting it keys off this number.
  select count(*)::int into v_retained
  from public.questions q where q.id = any(p_question_ids);

  if v_deleted > 0 then
    -- daily_practice_sets.question_ids is a plain uuid[] with NO foreign key
    -- and, unlike daily_rounds, no content_snapshot — so a deleted question
    -- silently SHRINKS a student's locked replay instead of failing loudly.
    -- Deleting the row is the repair: start_daily_round_attempt regenerates the
    -- set on next open, so it is self-healing. test_attempts.question_ids is
    -- deliberately left alone — that is graded history.
    delete from public.daily_practice_sets where question_ids && v_del_ids;
    get diagnostics v_repaired = row_count;
  end if;

  -- Now that the delete has happened, "orphan" is decidable exactly: a
  -- candidate nothing references any more. This is also what keeps an archived
  -- question's image safe — its translation row still points at it.
  --
  -- ALL EIGHT media_assets consumers are listed, not just the question-shaped
  -- ones, and the list must STAY exhaustive: the caller hands this array
  -- straight to a Storage delete that removes the BYTES FIRST, and nothing
  -- stops one asset backing two features — so a missing consumer does not fail
  -- loudly, it sweeps a LIVE avatar, wallpaper, sticker or news cover out of
  -- the bucket. Seven of the eight FKs are ON DELETE SET NULL, so the row is
  -- then silently blanked; sticker_images is ON DELETE RESTRICT, which is no
  -- excuse to omit it — the bytes are already gone by the time that FK
  -- refuses, and it refuses the caller's whole batched media_assets delete
  -- with them.
  -- This exact omission already shipped once as a data-loss bug on the other
  -- side of the same coin: sweepAbandonedImportMedia in
  -- admin-panel/src/lib/admin/import-media.ts was missing
  -- answer_option_translations and deleted yesterday's option images. That
  -- file's `consumers` array and this WHERE clause are two spellings of one
  -- list; a column added to media_assets must be added to both.
  if cardinality(v_candidates) > 0 then
    select coalesce(array_agg(c.m), '{}'::uuid[]) into v_orphans
    from unnest(v_candidates) as c(m)
    where not exists (select 1 from public.question_translations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.question_explanations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.answer_option_translations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.profiles x
                       where x.avatar_media_id = c.m)
      and not exists (select 1 from public.wallpapers x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.sticker_images x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.news x
                       where x.cover_media_id = c.m)
      and not exists (select 1 from public.olympiad_packages x
                       where x.cover_media_id = c.m);
  end if;

  -- A stale object left in a bucket is a cost bug; aborting a purge the admin
  -- already confirmed because the id list got long would be a correctness bug.
  -- Cap, and say so, so the caller can report the leak instead of hiding it.
  if cardinality(v_orphans) > 2000 then
    v_orphans   := v_orphans[1:2000];
    v_truncated := true;
  end if;

  return jsonb_build_object(
    'deleted', v_deleted,
    'archived', v_archived,
    'retained', v_retained,
    'already_archived', v_already,
    'repaired_practice_sets', v_repaired,
    'orphaned_media_ids', to_jsonb(v_orphans),
    'media_truncated', v_truncated);
end;
$$;

comment on function public.purge_question_set(uuid[]) is
  'Service-internal (migration 111): hard-deletes the UNANSWERED questions of a '
  'set and ARCHIVES the rest, re-deriving the split inside the DELETE so it can '
  'never drift. Returns {deleted, archived, retained, already_archived, '
  'repaired_practice_sets, orphaned_media_ids, media_truncated}. Also deletes '
  'the daily_practice_sets rows whose FK-less question_ids array referenced a '
  'deleted question. Reached only through the admin_* RPCs, never by a client.';

-- -----------------------------------------------------------------------------
-- subject_deletion_blocks : the nine reasons a subject may not be deleted,
-- evaluated together and returned as one array so the dialog can list every
-- reason at once instead of the admin fixing one, re-clicking, and hitting the
-- next. Shared by the preview, the RPC and the BEFORE DELETE trigger — three
-- copies of nine subqueries would drift within a release.
--
-- Blocks 1-6 are all HISTORY blocks: every one of them is empty for a subject
-- that was seeded but never sold and never played, which is the state most of
-- the live subjects are in. Blocks 7-9 are what make this function a guard
-- rather than a formality — see their own comments.
--
-- NOT blocked, deliberately: daily_rounds and daily_practice_sets (both
-- CASCADE). Blocks 3, 4 and 9 already fire for any round anyone actually
-- played, so all that remains is unplayed generated content — blocking on it
-- would make a freshly seeded, never used subject undeletable for no benefit.
-- Both are REPORTED by the preview instead.
-- -----------------------------------------------------------------------------
create or replace function public.subject_deletion_blocks(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '[]'::jsonb;
  n int;
begin
  -- 1. ANY subscription_subjects row, in ANY state. subject_id is CASCADE, and
  --    a cancelled row is the receipt for money already taken — CASCADE
  --    destroys it exactly as thoroughly as it destroys a live one. Existence
  --    of the row is the only rule that cannot be reasoned into a mistake at
  --    2am. This is money; there is no override.
  select count(*)::int into n
  from public.subscription_subjects where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_in_subscriptions', 'count', n);
  end if;

  -- 2. Billing history. The FK is already RESTRICT so this blocks today — but
  --    with a bare 23503 carrying no hint, which the panel can only render as
  --    "server error". Converting it into a counted, named block is the point.
  select count(*)::int into n
  from public.subscription_changes where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_billing_history', 'count', n);
  end if;

  -- 3. Attempt history. test_attempts.subject_id is SET NULL, and the Round-36
  --    weighted percentage reads that column: a NULL there is a WRONG RANK, not
  --    missing data.
  select count(*)::int into n
  from public.test_attempts where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_attempts', 'count', n);
  end if;

  -- 4. Points ledger — same SET NULL argument, and the ledger is explicitly
  --    append-only.
  select count(*)::int into n
  from public.student_points_ledger where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_points', 'count', n);
  end if;

  -- 5. olympiad_packages.subject_id is SET NULL, and a subject-less package
  --    still sells: get_my_olympiad_catalog LEFT JOINs subjects, so a paying
  --    parent would be shown a nameless card. Purchased packages can never be
  --    deleted, so re-pointing or archiving them first is the only way to keep
  --    the catalog coherent.
  select count(*)::int into n
  from public.olympiad_packages where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_in_olympiad_packages', 'count', n);
  end if;

  -- 6. A round in flight. Redundant with block 3 for any subject that was ever
  --    played, but it carries a different sentence ("wait" rather than "never")
  --    and it is the block that closes most of the delete/answer race window in
  --    purge_question_set — it is also the ONLY one of the six that applies to
  --    admin_purge_subject_questions, which does not touch the subject row.
  select count(*)::int into n
  from public.test_attempts
  where subject_id = p_subject_id and status = 'in_progress';
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  -- 7. THE CURRICULUM TREE. topics.subject_id is CASCADE and subtopics cascade
  --    from topics, so a subject that still owns a tree takes the whole tree
  --    with it — silently. Without this block the six history blocks above are
  --    all empty for a seeded-but-never-played subject, the guard PASSES, and
  --    one click removes every topic and subtopic while questions.topic_id
  --    (SET NULL) untags the general bank a second time. Delete the tree from
  --    the Curriculum Structure screen first, where each removal is its own
  --    confirmed, previewed step.
  select count(*)::int into n
  from public.topics where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_topics', 'count', n);
  end if;

  -- 8. THE GENERAL QUESTION BANK. questions.subject_id is SET NULL, so these
  --    rows are not destroyed but ORPHANED: every one silently loses the column
  --    that says what it teaches. Requiring the bank to be cleared FIRST (with
  --    admin_purge_subject_questions, which is itself confirmed and counted) is
  --    also what makes the outcome of a subject delete decidable BEFORE it
  --    runs — it is the block that stops admin_delete_subject destroying a bank
  --    on its way to reporting that it archived the subject instead.
  select count(*)::int into n
  from public.questions
  where subject_id = p_subject_id and olympiad_package_id is null;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_questions', 'count', n);
  end if;

  -- 9. An attempt reachable ONLY through a daily round. daily_rounds.subject_id
  --    is CASCADE while test_attempts.daily_round_id is RESTRICT, so an attempt
  --    whose own subject_id was already NULLed still pins the round: it passes
  --    blocks 1-8 and then aborts the delete with a bare 23503 that carries no
  --    hint — the generic "server error" this whole migration exists to remove.
  --    Counted here, it becomes a named reason the preview shows in advance.
  select count(*)::int into n
  from public.test_attempts ta
  join public.daily_rounds dr on dr.id = ta.daily_round_id
  where dr.subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_round_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.subject_deletion_blocks(uuid) is
  'Service-internal (migration 111): the reasons a subject may not be deleted, '
  'as a jsonb array of {hint, count}. Empty array = deletable. Blocks 1-6 are '
  'history (subscriptions, billing, attempts, points, olympiad packages, live '
  'attempts); blocks 7-9 are the structural ones that also fire for a '
  'never-played subject — topics, general-bank questions and attempts pinned to '
  'this subject''s daily rounds. Shared by admin_preview_subject_deletion, '
  'admin_delete_subject and trg_subject_delete_guard so the rule has exactly '
  'one definition.';

-- -----------------------------------------------------------------------------
-- olympiad_package_deletion_blocks : the three reasons a package may not be
-- deleted. Shared by the preview, the RPC and trg_olympiad_package_delete_guard.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_package_deletion_blocks(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  n      int;
  v_pool uuid[];
begin
  -- 1. LIFETIME ACCESS. Any purchase row in any status. The FK is already
  --    RESTRICT, but it raises a bare 23503; this raises a countable reason the
  --    panel can turn into "N people bought this — archive it instead".
  select count(*)::int into n
  from public.olympiad_purchases where olympiad_package_id = p_package_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_has_purchases', 'count', n);
  end if;

  -- 2. An ACTIVE listing must be archived first. Deleting a live catalog entry
  --    in one click is how a package vanishes from under a browsing parent; an
  --    irreversible destruction of a whole product gets two deliberate steps.
  select count(*)::int into n
  from public.olympiad_packages
  where id = p_package_id and status = 'active';
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_is_active', 'count', n);
  end if;

  -- 3. An attempt in flight. Also the mitigation for the delete/answer race in
  --    purge_question_set: an answer row can only appear through a submit RPC
  --    on an in-progress attempt.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_pool
  from public.questions q where q.olympiad_package_id = p_package_id;
  select count(*)::int into n
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_pool;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.olympiad_package_deletion_blocks(uuid) is
  'Service-internal (migration 111): the reasons an olympiad package may not be '
  'deleted, as a jsonb array of {hint, count} — package_has_purchases, '
  'package_is_active, live_attempts. Empty array = deletable.';

-- -----------------------------------------------------------------------------
-- olympiad_grade_pool_blocks : the reasons one grade's pool may not be purged.
-- p_drop_grade distinguishes the two operations that share the destructive core
-- and therefore share this function:
--   true  = detach the grade AND delete its pool
--   false = empty the pool, keep the grade targeted
-- The purchase block applies to BOTH, with a DIFFERENT hint each, because the
-- two sentences an admin needs are different: detaching removes an entitlement,
-- while emptying the pool leaves a lifetime purchaser with a package that
-- raises "pool too small" on every attempt — a silent revocation of a paid
-- entitlement dressed up as a content edit.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_pool_blocks(
  p_package_id uuid,
  p_grade_id   uuid,
  p_drop_grade boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  n      int;
  v_pool uuid[];
begin
  if coalesce(p_drop_grade, false) then
    -- A grade-less package is a legacy state, never a state an edit may
    -- produce. Same spelling as remove_olympiad_package_grade so the shipped
    -- oly2.err.lastGrade copy still applies.
    select count(*)::int into n
    from public.olympiad_package_grades where olympiad_package_id = p_package_id;
    if n <= 1 then
      v := v || jsonb_build_object('hint', 'last_grade', 'count', n);
    end if;
  end if;

  -- The legacy grade_id-is-null branch is copied from
  -- remove_olympiad_package_grade (015): a snapshot-less purchase plays
  -- whichever pool matches the child's CURRENT grade, so such a child is
  -- entitled to this grade too. Re-deriving that would be how the two paths
  -- start disagreeing.
  --
  -- The STATUS filter, however, is DELIBERATELY NOT copied, and the difference
  -- is the whole point. remove_olympiad_package_grade counts only
  -- status = 'active' because its consequence is a restorable ARCHIVE; both
  -- callers here HARD-DELETE the pool. olympiad_purchases.status also allows
  -- 'pending' and 'refunded', and purchase_olympiad re-activates a refunded row
  -- IN PLACE, keeping its grade_id — so a purchase that is merely dormant today
  -- becomes an active lifetime entitlement tomorrow, onto a grade whose pool
  -- no longer exists. Counting only the live ones would let exactly that
  -- through, irreversibly. Any status blocks; this is the same rule
  -- olympiad_package_deletion_blocks already applies to the package itself.
  if exists (select 1 from public.olympiad_purchases pu
              where pu.olympiad_package_id = p_package_id
                and (pu.grade_id = p_grade_id
                     or (pu.grade_id is null and exists (
                           select 1 from public.students st
                           where st.profile_id = pu.student_profile_id
                             and st.grade_id = p_grade_id)))) then
    select count(*)::int into n
    from public.olympiad_purchases pu
    where pu.olympiad_package_id = p_package_id
      and (pu.grade_id = p_grade_id
           or (pu.grade_id is null and exists (
                 select 1 from public.students st
                 where st.profile_id = pu.student_profile_id
                   and st.grade_id = p_grade_id)));
    v := v || jsonb_build_object(
           'hint',
           case when coalesce(p_drop_grade, false)
                then 'grade_has_purchases' else 'grade_has_purchases_purge' end,
           'count', n);
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_pool
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;
  select count(*)::int into n
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_pool;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean) is
  'Service-internal (migration 111): the reasons one (package, grade) pool may '
  'not be purged, as a jsonb array of {hint, count}. p_drop_grade = true adds '
  'the last_grade check and reports the purchase block as grade_has_purchases; '
  'false (keep the grade, empty the pool) reports it as '
  'grade_has_purchases_purge, because emptying a purchased grade''s pool '
  'silently revokes a lifetime entitlement. Counts purchases in ANY status — '
  'unlike remove_olympiad_package_grade, whose active-only predicate is correct '
  'for a restorable ARCHIVE but not for a hard delete a refunded purchase can '
  'be re-activated onto.';


-- =============================================================================
-- 2. GUARD TRIGGERS — the enforcement point, not the RPCs.
--
-- The RPCs alone would leave the ALREADY SHIPPED bare `.delete()` path in
-- admin-panel/src/lib/admin/actions.ts wide open. There is deliberately NO
-- bypass flag: admin_delete_subject passes these triggers because it satisfies
-- the same conditions, never because it suppresses them. ALTER TABLE … DISABLE
-- TRIGGER and session_replication_role = replica are banned by CLAUDE.md and
-- would also suspend FK enforcement and auditing.
-- =============================================================================

create or replace function public.subject_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
begin
  v_blocks := public.subject_deletion_blocks(old.id);
  if jsonb_array_length(v_blocks) > 0 then
    -- HINT is the single block's own hint when there is exactly one, so the
    -- common case gets a specific machine key; DETAIL always carries the whole
    -- blocks[] array, so the panel renders every reason from one code path.
    raise exception 'subject % cannot be deleted: % blocking reference(s)',
      old.id, jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'subject_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;
  return old;
end;
$$;

comment on function public.subject_delete_guard() is
  'Migration 111: refuses to delete a subject that any subscription has ever '
  'covered, that carries billing/attempt/points history, that backs an olympiad '
  'package, or that STILL OWNS topics or general-bank questions — the last two '
  'are the ones that also fire for a seeded-but-never-played subject, which is '
  'the state a bare cascade would find. Exists because admin-panel deleteRow() '
  'is a live, registered, unguarded delete on this table — the RPC alone would '
  'not cover it. Errcode check_violation, HINT = the single block or '
  'subject_not_deletable, DETAIL = {"blocks":[{hint,count},…]}.';

drop trigger if exists trg_subject_delete_guard on public.subjects;
create trigger trg_subject_delete_guard
  before delete on public.subjects
  for each row execute function public.subject_delete_guard();

create or replace function public.olympiad_package_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
begin
  v_blocks := public.olympiad_package_deletion_blocks(old.id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'olympiad package % cannot be deleted: % blocking reference(s)',
      old.id, jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'package_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;
  return old;
end;
$$;

comment on function public.olympiad_package_delete_guard() is
  'Migration 111: refuses to delete an olympiad package that has ANY purchase '
  'row, is still ACTIVE, or has an attempt in flight. It fires BEFORE the '
  'olympiad_purchases RESTRICT foreign key, so from now on that FK is the '
  'SECOND line of defence, not the first — do not drop this trigger on the '
  'grounds that "the FK already does it": the error would regress to a bare '
  '23503 with no hint and the panel could only show a generic server error.';

drop trigger if exists trg_olympiad_package_delete_guard on public.olympiad_packages;
create trigger trg_olympiad_package_delete_guard
  before delete on public.olympiad_packages
  for each row execute function public.olympiad_package_delete_guard();


-- =============================================================================
-- 3. PREVIEWS — side-effect free, take no locks, called by the confirmation
--    dialog BEFORE anything is confirmed. The dialog renders `cascade` as
--    "will be permanently deleted", `orphans` as "will lose its link to this
--    subject", and questions.archived_instead as "has answers — will be
--    archived, not deleted".
-- =============================================================================

create or replace function public.admin_preview_olympiad_package_deletion(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg     record;
  v_blocks  jsonb;
  v_total   int; v_deletable int; v_answered int; v_archived int;
  v_media   int;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_olympiad_package_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.code, p.status, p.cover_media_id,
         coalesce(t.title, p.code) as title_az
    into v_pkg
  from public.olympiad_packages p
  left join public.olympiad_package_translations t
    on t.olympiad_package_id = p.id and t.locale = 'az'
  where p.id = p_package_id;
  if not found then
    raise exception 'admin_preview_olympiad_package_deletion: package not found'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.olympiad_package_deletion_blocks(p_package_id);

  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.olympiad_package_id = p_package_id;

  -- An ESTIMATE, and honestly so: the exact orphan set is only decidable after
  -- the delete (purge_question_set computes it there). Counting the media of
  -- the DELETABLE questions plus the cover is the closest side-effect-free
  -- answer, and it can only over-count.
  select count(distinct s.m)::int into v_media
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
      join public.questions q on q.id = qt.question_id
     where q.olympiad_package_id = p_package_id and qt.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select qe.media_asset_id
      from public.question_explanations qe
      join public.questions q on q.id = qe.question_id
     where q.olympiad_package_id = p_package_id and qe.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
      join public.questions q on q.id = ao.question_id
     where q.olympiad_package_id = p_package_id and aot.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
  ) s;

  -- The cover is counted separately rather than as a fourth UNION branch: a
  -- package cover never doubles as a question image, and keeping the plpgsql
  -- variable out of the query removes any doubt about how it resolves there.
  if v_pkg.cover_media_id is not null then
    v_media := v_media + 1;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocks) = 0,
    'package', jsonb_build_object('id', v_pkg.id, 'code', v_pkg.code,
                                  'title_az', v_pkg.title_az,
                                  'status', v_pkg.status),
    'blocked_by', v_blocks,
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    -- WHICH of the two outcomes will actually happen, decided by the same rule
    -- the mutation uses (answered questions surviving ⇒ archive). The two
    -- cascades are reported SEPARATELY, the way the grade preview already
    -- splits drop_grade from keep_grade, because they are not the same
    -- operation: the ARCHIVE branch — which is the branch that runs whenever a
    -- pool has ever been played, i.e. most of the time — keeps the grades, the
    -- translations and the pool rows and deletes only the rotation cache. The
    -- previous payload listed the full delete cascade in both branches, so the
    -- dialog overstated its own blast radius; a confirmation screen an admin
    -- learns to disbelieve is worse than none.
    'outcome', case when v_answered > 0 then 'archive' else 'delete' end,
    'delete_cascade', jsonb_build_object(
      'olympiad_package_grades', (select count(*)::int from public.olympiad_package_grades
                                   where olympiad_package_id = p_package_id),
      'olympiad_package_translations', (select count(*)::int from public.olympiad_package_translations
                                         where olympiad_package_id = p_package_id),
      'olympiad_package_questions', (select count(*)::int from public.olympiad_package_questions
                                      where olympiad_package_id = p_package_id),
      'olympiad_question_rotations', (select count(*)::int from public.olympiad_question_rotations
                                       where olympiad_package_id = p_package_id),
      'question_translations', (select count(*)::int from public.question_translations qt
                                 join public.questions q on q.id = qt.question_id
                                where q.olympiad_package_id = p_package_id),
      'answer_options', (select count(*)::int from public.answer_options ao
                          join public.questions q on q.id = ao.question_id
                         where q.olympiad_package_id = p_package_id)),
    -- The archive branch's real footprint. The rotation rows go because the
    -- package SURVIVES holding seen_question_ids that name rows the purge
    -- removed; everything else stays exactly where it is.
    'archive_cascade', jsonb_build_object(
      'package_archived', true,
      'olympiad_question_rotations', (select count(*)::int from public.olympiad_question_rotations
                                       where olympiad_package_id = p_package_id),
      'question_translations', (select count(*)::int from public.question_translations qt
                                 join public.questions q on q.id = qt.question_id
                                where q.olympiad_package_id = p_package_id
                                  and not exists (select 1 from public.test_attempt_answers a
                                                   where a.question_id = q.id)),
      'answer_options', (select count(*)::int from public.answer_options ao
                          join public.questions q on q.id = ao.question_id
                         where q.olympiad_package_id = p_package_id
                           and not exists (select 1 from public.test_attempt_answers a
                                            where a.question_id = q.id))),
    'orphans', jsonb_build_object('media_assets', v_media));
end;
$$;

comment on function public.admin_preview_olympiad_package_deletion(uuid) is
  'Admin-only, side-effect free (migration 111): what deleting this olympiad '
  'package would destroy — blocked_by[], the delete/archive question split, and '
  'the row counts for the outcome that will ACTUALLY happen (`outcome` picks '
  'between delete_cascade and archive_cascade; the archive branch keeps grades, '
  'translations and pool rows and drops only the rotation cache) plus the '
  'orphaned-media estimate. Drives the confirmation dialog; the mutation '
  're-checks everything it reports.';

create or replace function public.admin_preview_olympiad_grade_pool_deletion(
  p_package_id uuid,
  p_grade_id   uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_grade    record;
  v_total    int; v_deletable int; v_answered int; v_archived int;
  v_media    int;
  v_grades   int;
  v_per      int;
  v_drop     jsonb;
  v_keep     jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_olympiad_grade_pool_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.code, p.status, coalesce(t.title, p.code) as title_az
    into v_pkg
  from public.olympiad_packages p
  left join public.olympiad_package_translations t
    on t.olympiad_package_id = p.id and t.locale = 'az'
  where p.id = p_package_id;
  if not found then
    raise exception 'admin_preview_olympiad_grade_pool_deletion: package not found'
      using errcode = 'no_data_found';
  end if;

  select g.id, g.level::int as level, g.name into v_grade
  from public.grades g
  join public.olympiad_package_grades pg
    on pg.grade_id = g.id and pg.olympiad_package_id = p_package_id
  where g.id = p_grade_id;
  if not found then
    raise exception 'admin_preview_olympiad_grade_pool_deletion: grade is not a package target'
      using errcode = 'no_data_found';
  end if;

  select count(*)::int into v_grades
  from public.olympiad_package_grades where olympiad_package_id = p_package_id;

  select c.questions_per_attempt into v_per
  from public.olympiad_grade_config(p_package_id, p_grade_id) c;

  v_drop := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id, true);
  v_keep := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id, false);

  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;

  select count(distinct s.m)::int into v_media
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
      join public.questions q on q.id = qt.question_id
     where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
       and qt.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select qe.media_asset_id
      from public.question_explanations qe
      join public.questions q on q.id = qe.question_id
     where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
       and qe.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
      join public.questions q on q.id = ao.question_id
     where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
       and aot.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
  ) s;

  return jsonb_build_object(
    'package', jsonb_build_object('id', v_pkg.id, 'code', v_pkg.code,
                                  'title_az', v_pkg.title_az,
                                  'status', v_pkg.status),
    'grade', jsonb_build_object('id', v_grade.id, 'level', v_grade.level,
                                'name', v_grade.name),
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    -- Both dialogs from one round trip: (b) detaches the grade, (c) empties the
    -- pool and keeps it. Their blocking rules differ, so both are reported.
    'drop_grade', jsonb_build_object('ok', jsonb_array_length(v_drop) = 0,
                                     'blocked_by', v_drop),
    'keep_grade', jsonb_build_object('ok', jsonb_array_length(v_keep) = 0,
                                     'blocked_by', v_keep),
    'is_last_grade', v_grades <= 1,
    'questions_per_attempt', v_per,
    'package_status', v_pkg.status,
    -- Only the KEEP-the-grade path can do this: it leaves the grade targeted
    -- with zero published questions, so an ACTIVE package can no longer serve
    -- it and the mutation demotes the package to 'inactive'. Detaching the
    -- grade removes it from the check entirely.
    'package_becomes_unservable', v_pkg.status = 'active',
    'orphans', jsonb_build_object('media_assets', v_media));
end;
$$;

comment on function public.admin_preview_olympiad_grade_pool_deletion(uuid, uuid) is
  'Admin-only, side-effect free (migration 111): serves BOTH grade dialogs from '
  'one round trip — drop_grade (detach + delete the pool) and keep_grade (empty '
  'the pool, keep the grade targeted) each with their own blocked_by[], plus the '
  'delete/archive split, the per-grade questions_per_attempt and whether an '
  'ACTIVE package would be auto-demoted.';

create or replace function public.admin_preview_subject_deletion(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      record;
  v_blocks   jsonb;
  v_warn     jsonb := '[]'::jsonb;
  v_subs     int := 0;
  v_total    int; v_deletable int; v_answered int; v_archived int;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_subject_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.code, s.name, s.status into v_sub
  from public.subjects s where s.id = p_subject_id;
  if not found then
    raise exception 'admin_preview_subject_deletion: subject not found'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.subject_deletion_blocks(p_subject_id);

  -- GENERAL BANK ONLY. Pool questions carry subject_id too, and they are never
  -- in scope: see admin_purge_subject_questions for why that clause is
  -- load-bearing rather than cosmetic.
  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.subject_id = p_subject_id and q.olympiad_package_id is null;

  -- THE NUMBER THE PURGE DIALOG MUST SHOUT. admin_purge_subject_questions is
  -- deliberately NOT blocked by a live subscription: replacing a live subject's
  -- curriculum is its one legitimate use (the 2026-07-30 replacement did
  -- exactly that), and refusing it would leave a psql session as the only
  -- route — which is where the migration-095 catastrophe came from. But an
  -- emptied bank is not a content edit: draw_daily_questions can no longer
  -- assemble a full set, so start_daily_round_attempt raises no_data_found for
  -- EVERY one of these children until a replacement pool is published. The
  -- honest design is therefore to report it as loudly as possible, next to a
  -- confirmation token, rather than to pretend the operation is safe or to
  -- forbid the only supported way of doing it.
  --
  -- Counted per CHILD, not per subscription line: two lines for one child (a
  -- past_due row alongside a new trial) is one blocked student, and a number
  -- that double-counts is a number an admin stops trusting. remove_at rows are
  -- excluded — that subject is already scheduled to leave the basket.
  select count(distinct cs.student_profile_id)::int into v_subs
  from public.subscription_subjects ss
  join public.child_subscriptions cs on cs.id = ss.child_subscription_id
  where ss.subject_id = p_subject_id
    and ss.remove_at is null
    and cs.status in ('trialing', 'active', 'past_due');
  if v_subs > 0 then
    v_warn := v_warn || jsonb_build_object(
                'hint', 'subject_purge_active_subscribers', 'count', v_subs);
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocks) = 0,
    'subject', jsonb_build_object('id', v_sub.id, 'code', v_sub.code,
                                  'name', v_sub.name, 'status', v_sub.status),
    'blocked_by', v_blocks,
    -- Not blocks: consequences. Rendered by the SAME hint-to-sentence map the
    -- blocks use, so a new warning never falls through to "server error".
    'warnings', v_warn,
    'active_subscribers', v_subs,
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    'cascade', jsonb_build_object(
      'topics', (select count(*)::int from public.topics where subject_id = p_subject_id),
      'subtopics', (select count(*)::int from public.subtopics st
                     join public.topics t on t.id = st.topic_id
                    where t.subject_id = p_subject_id),
      'subjects_pricing', (select count(*)::int from public.subjects_pricing
                            where subject_id = p_subject_id),
      'subscription_subjects', (select count(*)::int from public.subscription_subjects
                                 where subject_id = p_subject_id),
      'daily_rounds', (select count(*)::int from public.daily_rounds
                        where subject_id = p_subject_id),
      'daily_practice_sets', (select count(*)::int from public.daily_practice_sets
                               where subject_id = p_subject_id)),
    'orphans', jsonb_build_object(
      'tests', (select count(*)::int from public.tests where subject_id = p_subject_id),
      'test_attempts', (select count(*)::int from public.test_attempts
                         where subject_id = p_subject_id),
      'student_points_ledger', (select count(*)::int from public.student_points_ledger
                                 where subject_id = p_subject_id),
      'progress_snapshots', (select count(*)::int from public.progress_snapshots
                              where subject_id = p_subject_id),
      'question_imports', (select count(*)::int from public.question_imports
                            where subject_id = p_subject_id),
      'olympiad_packages', (select count(*)::int from public.olympiad_packages
                             where subject_id = p_subject_id),
      -- Olympiad POOL questions tagged with this subject. Normally zero once
      -- the olympiad_packages block above is clear, but a pool question can
      -- outlive a re-pointed package; it is inert (olympiad draws read
      -- olympiad_package_id, never subject_id) and only loses the tag.
      'questions', (select count(*)::int from public.questions
                     where subject_id = p_subject_id
                       and olympiad_package_id is not null)),
    'history', jsonb_build_object(
      'subscription_changes', (select count(*)::int from public.subscription_changes
                                where subject_id = p_subject_id)));
end;
$$;

comment on function public.admin_preview_subject_deletion(uuid) is
  'Admin-only, side-effect free (migration 111): what deleting this subject '
  'would destroy — the nine blocked_by[] reasons, the general-bank question '
  'delete/archive split, the CASCADE row counts (topics, subtopics, pricing, '
  'subscription lines, daily rounds/practice sets) and the SET NULL orphan '
  'counts. Also serves the PURGE dialog: active_subscribers / warnings[] carry '
  'how many children are currently subscribed to this subject, because emptying '
  'its bank breaks their daily round without blocking anything. In practice '
  'only a mistyped, never-used subject is deletable.';


-- =============================================================================
-- 4. MUTATIONS
-- =============================================================================

create or replace function public.admin_delete_olympiad_package(
  p_package_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg    record;
  v_blocks jsonb;
  v_ids    uuid[];
  v_purge  jsonb;
  v_media  uuid[];
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_package: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package: the second waits
  -- and then re-reads a status the first may have changed.
  select p.id, p.code, p.status, p.cover_media_id, p.questions_per_attempt
    into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_package: package not found'
      using errcode = 'no_data_found';
  end if;

  -- The realistic failure is two packages open in two tabs. Typing the code
  -- makes an id mix-up impossible to commit even if the dialog is restyled.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_package: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  v_blocks := public.olympiad_package_deletion_blocks(p_package_id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_olympiad_package: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'package_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q where q.olympiad_package_id = p_package_id;

  v_purge := public.purge_question_set(v_ids);

  if (v_purge->>'retained')::int > 0 then
    -- questions.olympiad_package_id is ON DELETE CASCADE, so deleting the
    -- package would try to delete the very rows just archived and
    -- trg_question_delete_guard would abort the whole transaction. Archiving
    -- the package is the only outcome that keeps both promises — and it is the
    -- same rule subjects follow: if anything answered survives, the CONTAINER
    -- is archived, not deleted. The success message must say so, or the button
    -- reads as broken.
    update public.olympiad_packages
       set status = 'archived', updated_at = now()
     where id = p_package_id and status <> 'archived';

    -- Only this branch needs it: the delete branch below takes the rotation
    -- rows with the package (CASCADE), but here the package SURVIVES holding
    -- seen_question_ids that name rows the purge just removed. Left alone, a
    -- re-uploaded pool would look partly consumed to that student and hand
    -- them a short attempt; the row is pure cache, so resetting it is free.
    delete from public.olympiad_question_rotations
     where olympiad_package_id = p_package_id;

    return jsonb_build_object(
      'package_id', p_package_id,
      'package_deleted', false,
      'package_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', (v_purge->>'deleted')::int,
      'archived_questions', (v_purge->>'archived')::int,
      'retained_questions', (v_purge->>'retained')::int,
      'orphaned_media_ids', v_purge->'orphaned_media_ids',
      'media_truncated', (v_purge->>'media_truncated')::boolean);
  end if;

  delete from public.olympiad_packages where id = p_package_id;

  -- cover_media_id is SET NULL, so nothing ever reclaims the cover asset. It is
  -- an orphan only once no OTHER package points at it.
  select coalesce(array_agg(e.x::uuid), '{}'::uuid[]) into v_media
  from jsonb_array_elements_text(v_purge->'orphaned_media_ids') as e(x);
  if v_pkg.cover_media_id is not null
     and not exists (select 1 from public.olympiad_packages p
                      where p.cover_media_id = v_pkg.cover_media_id) then
    v_media := v_media || v_pkg.cover_media_id;
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'package_deleted', true,
    'package_archived', false,
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', 0,
    'retained_questions', 0,
    'orphaned_media_ids', to_jsonb(v_media),
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_package(uuid, text) is
  'Admin-only (migration 111): deletes an olympiad package and its entire pool '
  'after purging the questions (unanswered deleted, answered ARCHIVED). Blocked '
  'by any purchase row (hint package_has_purchases), by status = active '
  '(package_is_active) and by an attempt in flight (live_attempts); '
  'p_expected_code must equal the package code (confirmation_mismatch). When '
  'answered questions survive, the PACKAGE IS ARCHIVED instead of deleted '
  '(reason answered_questions_retained). Returns the counts plus '
  'orphaned_media_ids for the caller to sweep from Storage.';

create or replace function public.admin_delete_olympiad_grade_pool(
  p_package_id    uuid,
  p_grade_id      uuid,
  p_expected_code text,
  p_drop_grade    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_blocks   jsonb;
  v_ids      uuid[];
  v_purge    jsonb;
  v_rot      int := 0;
  v_demote   boolean := false;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_grade_pool: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_grade_pool: package not found'
      using errcode = 'no_data_found';
  end if;

  -- The SAME confirmation token the two container deletes demand, and for a
  -- stronger reason: this function hard-deletes a whole grade pool from a bare
  -- (package_id, grade_id) pair, it is granted to `authenticated`, and it is
  -- therefore a PostgREST endpoint any admin session can POST directly. The
  -- dialog is not a control — the token is. It is checked BEFORE the target
  -- grade is validated so a wrong-tab mix-up fails on the cheap test.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_grade_pool: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  if not exists (select 1 from public.olympiad_package_grades
                  where olympiad_package_id = p_package_id and grade_id = p_grade_id) then
    raise exception 'admin_delete_olympiad_grade_pool: grade is not a package target'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id,
                                                coalesce(p_drop_grade, false));
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_olympiad_grade_pool: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'grade_pool_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;

  v_purge := public.purge_question_set(v_ids);

  -- olympiad_question_rotations.seen_question_ids holds ids that no longer
  -- exist. Leaving them makes a freshly re-uploaded pool look partly consumed
  -- to that student and can hand them a short attempt; the row is pure cache,
  -- so resetting it is free.
  delete from public.olympiad_question_rotations
   where olympiad_package_id = p_package_id and grade_id = p_grade_id;
  get diagnostics v_rot = row_count;

  if coalesce(p_drop_grade, false) then
    delete from public.olympiad_package_grades
     where olympiad_package_id = p_package_id and grade_id = p_grade_id;
  end if;

  if v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      -- Leaving it ACTIVE means the next child to open it gets a runtime
      -- failure at attempt start instead of a closed listing.
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not:
      -- the guard returns early for any row whose new.status is not 'active'.
      -- The whole auto-demotion design rests on that early return — do not
      -- "simplify" it by suppressing the trigger.
    end if;
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'grade_id', p_grade_id,
    'grade_dropped', coalesce(p_drop_grade, false),
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', (v_purge->>'archived')::int,
    'retained_questions', (v_purge->>'retained')::int,
    'reset_rotations', v_rot,
    'package_demoted', v_demote,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_grade_pool(uuid, uuid, text, boolean) is
  'Admin-only (migration 111): purges ONE grade''s olympiad pool (unanswered '
  'deleted, answered ARCHIVED) and, with p_drop_grade = true, detaches the '
  'grade as well. p_expected_code must equal the package code '
  '(confirmation_mismatch). remove_olympiad_package_grade is deliberately left '
  'untouched as the SAFE archive-only path the UI offers first. Blocked by '
  'last_grade, by purchases IN ANY STATUS (grade_has_purchases when detaching, '
  'grade_has_purchases_purge when only emptying — emptying a purchased pool '
  'silently revokes a lifetime entitlement) and by live_attempts. Auto-demotes '
  'an ACTIVE package that can no longer fill an attempt (package_demoted).';

create or replace function public.admin_purge_subject_questions(
  p_subject_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text;
  v_ids   uuid[];
  v_live  int;
  v_purge jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_purge_subject_questions: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.code into v_code from public.subjects s where s.id = p_subject_id;
  if not found then
    raise exception 'admin_purge_subject_questions: subject not found'
      using errcode = 'no_data_found';
  end if;

  -- THE SAME CONFIRMATION TOKEN THE CONTAINER DELETES DEMAND. This is the
  -- operation that destroys the most rows in the platform — a whole subject's
  -- question bank — and its only block is live_attempts, so an actively sold,
  -- actively played subject is squarely in scope by design (curriculum
  -- replacement is the reason it exists). It is also granted to
  -- `authenticated`, which makes it a PostgREST endpoint any admin session can
  -- POST directly with nothing but a subject id: the dialog is not a control,
  -- the token is. Checked before the scope is read so a wrong-tab mix-up fails
  -- on the cheap test; admin_preview_subject_deletion reports how many children
  -- are currently subscribed so the admin types it knowing the cost.
  if p_expected_code is null or p_expected_code <> v_code then
    raise exception 'admin_purge_subject_questions: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- `olympiad_package_id is null` is LOAD-BEARING, not cosmetic: pool questions
  -- carry subject_id too, so without it "clear this subject's questions" would
  -- silently empty a PURCHASED olympiad pool — a back door around every
  -- olympiad guard in this migration. Topics and subtopics are untouched; the
  -- taxonomy tree is exactly what "without removing the subject" preserves.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q
  where q.subject_id = p_subject_id and q.olympiad_package_id is null;

  select count(*)::int into v_live
  from public.test_attempts ta
  where ta.status = 'in_progress'
    and (ta.subject_id = p_subject_id or ta.question_ids && v_ids);
  if v_live > 0 then
    raise exception 'admin_purge_subject_questions: % attempt(s) in flight', v_live
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'live_attempts', 'count', v_live)),
                        'count', v_live)::text;
  end if;

  v_purge := public.purge_question_set(v_ids);

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', (v_purge->>'archived')::int,
    'retained_questions', (v_purge->>'retained')::int,
    'already_archived', (v_purge->>'already_archived')::int,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_purge_subject_questions(uuid, text) is
  'Admin-only (migration 111): clears a subject''s GENERAL-BANK questions '
  '(olympiad_package_id IS NULL) without touching the subject, its topics or '
  'its subtopics — unanswered deleted, answered ARCHIVED. p_expected_code must '
  'equal the subject code (confirmation_mismatch); the only BLOCK is '
  'live_attempts, because emptying a live subject''s bank is this function''s '
  'legitimate use (curriculum replacement) — the cost is reported by '
  'admin_preview_subject_deletion.active_subscribers, not refused. Also deletes '
  'the daily_practice_sets rows whose FK-less question_ids array referenced a '
  'deleted question (they regenerate on next open). Returns the counts plus '
  'orphaned_media_ids for the Storage sweep.';

create or replace function public.admin_delete_subject(
  p_subject_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      record;
  v_blocks   jsonb;
  v_answered int;
  v_purge    jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_subject: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.code, s.status into v_sub
  from public.subjects s where s.id = p_subject_id
  for update;
  if not found then
    raise exception 'admin_delete_subject: subject not found'
      using errcode = 'no_data_found';
  end if;

  if p_expected_code is null or p_expected_code <> v_sub.code then
    raise exception 'admin_delete_subject: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  v_blocks := public.subject_deletion_blocks(p_subject_id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_subject: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'subject_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  -- DECIDE THE OUTCOME BEFORE DESTROYING ANYTHING. The earlier shape purged
  -- first and only then discovered that answered questions had survived, so it
  -- could report "subject archived" — a soft, reassuring word — AFTER the whole
  -- unanswered half of the bank had already been hard-deleted. The admin read
  -- the soft outcome and had in fact lost the bank. Block 8 makes a non-empty
  -- bank unreachable here anyway; this ordering is what makes that a belt
  -- rather than the only brace.
  select count(*)::int into v_answered
  from public.questions q
  where q.subject_id = p_subject_id and q.olympiad_package_id is null
    and exists (select 1 from public.test_attempt_answers a
                 where a.question_id = q.id);

  if v_answered > 0 then
    -- Same rule as packages: if anything answered survives, the CONTAINER is
    -- archived, not deleted — and NOTHING is purged on the way there. Deleting
    -- the subject would SET NULL those rows' subject_id, which is exactly the
    -- orphaning this function exists to prevent.
    update public.subjects
       set status = 'archived', updated_at = now()
     where id = p_subject_id and status <> 'archived';

    return jsonb_build_object(
      'subject_id', p_subject_id,
      'subject_deleted', false,
      'subject_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', 0,
      'archived_questions', 0,
      'retained_questions', v_answered,
      'repaired_practice_sets', 0,
      'orphaned_media_ids', '[]'::jsonb,
      'media_truncated', false);
  end if;

  -- Nothing answered is in scope, so the purge below can only hard-delete. It
  -- still runs, and it still passes the token on: block 8 normally leaves it an
  -- empty bank, but a question inserted between that check and this line must
  -- not be left pointing at a subject that no longer exists (SET NULL).
  v_purge := public.admin_purge_subject_questions(p_subject_id, p_expected_code);

  if (v_purge->>'retained_questions')::int > 0 then
    -- Reachable only through a race — a question answered between the count
    -- above and the purge. The purge archived it rather than deleting it, so
    -- the subject must be archived too: the alternative is SET NULL on an
    -- archived row, i.e. a question nobody can ever find again.
    update public.subjects
       set status = 'archived', updated_at = now()
     where id = p_subject_id and status <> 'archived';

    return jsonb_build_object(
      'subject_id', p_subject_id,
      'subject_deleted', false,
      'subject_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', (v_purge->>'deleted_questions')::int,
      'archived_questions', (v_purge->>'archived_questions')::int,
      'retained_questions', (v_purge->>'retained_questions')::int,
      'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
      'orphaned_media_ids', v_purge->'orphaned_media_ids',
      'media_truncated', (v_purge->>'media_truncated')::boolean);
  end if;

  -- Fires trg_subject_delete_guard, which re-evaluates the same nine blocks.
  -- It passes because the conditions still hold, never because anything was
  -- suppressed — and if a subscription or an attempt appeared in between, the
  -- guard aborts the transaction, which is the correct outcome.
  delete from public.subjects where id = p_subject_id;

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'subject_deleted', true,
    'subject_archived', false,
    'deleted_questions', (v_purge->>'deleted_questions')::int,
    'archived_questions', 0,
    'retained_questions', 0,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_subject(uuid, text) is
  'Admin-only (migration 111): deletes a subject that is already EMPTY — its '
  'topics and its general-bank questions must be gone first (blocks 7 and 8), '
  'so this can never destroy a curriculum tree or a question bank as a side '
  'effect of removing the container. Also blocked by any subscription line ever '
  'written, by billing/attempt/points history, by an olympiad package on the '
  'subject, by a live attempt and by an attempt pinned to one of its daily '
  'rounds — the net effect is that a subject which has ever been sold or played '
  'is permanently undeletable, and in practice only a mistyped, never-used '
  'subject can be removed. p_expected_code must equal the subject code. The '
  'archive-vs-delete outcome is decided BEFORE anything is purged; when '
  'answered questions survive, the SUBJECT IS ARCHIVED and the bank is left '
  'untouched.';

create or replace function public.admin_unarchive_olympiad_package(p_package_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.catalog_status;
begin
  if not public.is_admin() then
    raise exception 'admin_unarchive_olympiad_package: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE makes the check atomic with the write. A read-then-update in the
  -- server action would be a TOCTOU that lets two tabs both "restore" and one
  -- of them demote a package the other just activated.
  select status into v_status
  from public.olympiad_packages where id = p_package_id
  for update;
  if not found then
    raise exception 'admin_unarchive_olympiad_package: package not found'
      using errcode = 'no_data_found';
  end if;

  if v_status is distinct from 'archived'::public.catalog_status then
    raise exception 'admin_unarchive_olympiad_package: package is not archived'
      using errcode = 'check_violation', hint = 'not_archived';
  end if;

  -- 'inactive', never 'active', for three reasons:
  --   (i) restoring to active re-fires trg_olympiad_activation_pool_guard, and
  --       since migration 094 emptied eight packages' pools most archived
  --       packages would answer a "restore" click with
  --       olympiad_pool_below_per_attempt, which reads as a bug, not a rule;
  --  (ii) olympiad_package_on_sale() gates the public catalog on status, so
  --       'active' puts the package back ON SALE instantly, reusing a
  --       sale_starts_at/sale_ends_at window that may be long expired or, worse,
  --       still open. Restoring must never be a selling action;
  -- (iii) `status` is the ONLY record that the package was archived — there is
  --       no archived_at and no previous_status column, so "restore to whatever
  --       it was" is not computable. 'inactive' is also where a newly created
  --       package starts, so it is the one honest answer.
  update public.olympiad_packages
     set status = 'inactive', updated_at = now()
   where id = p_package_id;

  return jsonb_build_object('package_id', p_package_id, 'status', 'inactive');
end;
$$;

comment on function public.admin_unarchive_olympiad_package(uuid) is
  'Admin-only (migration 111): the missing inverse of archiveOlympiadPackage. '
  'Restores an ARCHIVED package to INACTIVE (never straight to active — that '
  'would re-fire the pool guard and put the package back on sale under a '
  'possibly expired window). Refuses a package that is not archived (hint '
  'not_archived); the FOR UPDATE makes that check atomic with the write. The '
  'one new operation here that is not destructive.';


-- =============================================================================
-- 5. GRANTS
--    The admin panel calls these RPCs through the SIGNED-IN ADMIN's SSR client
--    (the same way olympiad.ts calls remove_olympiad_package_grade), so
--    `authenticated` is required and public.is_admin() inside each function is
--    the real gate. The four internal helpers stay service_role-only.
--
--    Two signatures gained a p_expected_code parameter after review. Postgres
--    would keep the ORIGINAL arities alongside them as overloads, and a
--    token-less overload of a destructive function is not a leftover, it is the
--    bypass — PostgREST would also have to guess between them (the ambiguity
--    hazard migration 101 documents). These drops are unconditional and run
--    before the grants so a partially-applied earlier draft cannot survive.
-- =============================================================================

drop function if exists public.admin_purge_subject_questions(uuid);
drop function if exists public.admin_delete_olympiad_grade_pool(uuid, uuid, boolean);

revoke all on function public.purge_question_set(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_question_set(uuid[]) to service_role;

revoke all on function public.subject_deletion_blocks(uuid) from public, anon, authenticated;
grant execute on function public.subject_deletion_blocks(uuid) to service_role;

revoke all on function public.olympiad_package_deletion_blocks(uuid) from public, anon, authenticated;
grant execute on function public.olympiad_package_deletion_blocks(uuid) to service_role;

revoke all on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean) to service_role;

revoke all on function public.admin_preview_olympiad_package_deletion(uuid) from public, anon;
grant execute on function public.admin_preview_olympiad_package_deletion(uuid)
  to authenticated, service_role;

revoke all on function public.admin_preview_olympiad_grade_pool_deletion(uuid, uuid)
  from public, anon;
grant execute on function public.admin_preview_olympiad_grade_pool_deletion(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.admin_preview_subject_deletion(uuid) from public, anon;
grant execute on function public.admin_preview_subject_deletion(uuid)
  to authenticated, service_role;

revoke all on function public.admin_delete_olympiad_package(uuid, text) from public, anon;
grant execute on function public.admin_delete_olympiad_package(uuid, text)
  to authenticated, service_role;

revoke all on function public.admin_delete_olympiad_grade_pool(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.admin_delete_olympiad_grade_pool(uuid, uuid, text, boolean)
  to authenticated, service_role;

revoke all on function public.admin_purge_subject_questions(uuid, text) from public, anon;
grant execute on function public.admin_purge_subject_questions(uuid, text)
  to authenticated, service_role;

revoke all on function public.admin_delete_subject(uuid, text) from public, anon;
grant execute on function public.admin_delete_subject(uuid, text)
  to authenticated, service_role;

revoke all on function public.admin_unarchive_olympiad_package(uuid) from public, anon;
grant execute on function public.admin_unarchive_olympiad_package(uuid)
  to authenticated, service_role;


-- =============================================================================
-- 6. VERIFY — any failure raises, which rolls this whole file back.
-- =============================================================================
do $verify$
declare
  v_fn   text;
  v_needle text;
  v_fns  text[] := array[
    'public.admin_preview_olympiad_package_deletion(uuid)',
    'public.admin_preview_olympiad_grade_pool_deletion(uuid,uuid)',
    'public.admin_preview_subject_deletion(uuid)',
    'public.admin_delete_olympiad_package(uuid,text)',
    'public.admin_delete_olympiad_grade_pool(uuid,uuid,text,boolean)',
    'public.admin_purge_subject_questions(uuid,text)',
    'public.admin_delete_subject(uuid,text)',
    'public.admin_unarchive_olympiad_package(uuid)'
  ];
  v_helpers text[] := array[
    'public.purge_question_set(uuid[])',
    'public.subject_deletion_blocks(uuid)',
    'public.olympiad_package_deletion_blocks(uuid)',
    'public.olympiad_grade_pool_blocks(uuid,uuid,boolean)'
  ];
begin
  foreach v_fn in array (v_fns || v_helpers) loop
    if to_regprocedure(v_fn) is null then
      raise exception '111: % was not created', v_fn;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(v_fn)) then
      raise exception '111: % is not SECURITY DEFINER', v_fn;
    end if;
    -- An unpinned search_path on a SECURITY DEFINER function is a privilege
    -- escalation, not a style issue.
    if not (select coalesce(p.proconfig, '{}'::text[]) @> array['search_path=public, pg_temp']
              from pg_proc p where p.oid = to_regprocedure(v_fn)) then
      raise exception '111: % does not pin search_path', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '111: anon can execute %', v_fn;
    end if;
  end loop;

  -- The helpers are service-internal; `authenticated` must not reach them.
  foreach v_fn in array v_helpers loop
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '111: authenticated can execute the internal helper %', v_fn;
    end if;
  end loop;

  -- The admin RPCs ARE called as the signed-in admin, so this grant is required.
  foreach v_fn in array v_fns loop
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '111: authenticated cannot execute %', v_fn;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_subject_delete_guard'
                    and tgrelid = 'public.subjects'::regclass
                    and not tgisinternal and tgenabled = 'O') then
    raise exception '111: trg_subject_delete_guard is missing or disabled';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_olympiad_package_delete_guard'
                    and tgrelid = 'public.olympiad_packages'::regclass
                    and not tgisinternal and tgenabled = 'O') then
    raise exception '111: trg_olympiad_package_delete_guard is missing or disabled';
  end if;

  -- THE regression this feature could plausibly cause. Every destructive path
  -- above depends on this guard being armed: it is what turns "delete the
  -- answered ones too" into an aborted transaction instead of lost history.
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_question_delete_guard'
                    and tgrelid = 'public.questions'::regclass
                    and not tgisinternal and tgenabled = 'O') then
    raise exception '111: trg_question_delete_guard is missing or disabled';
  end if;
  if position('question_has_attempts' in
        pg_get_functiondef('public.question_delete_guard()'::regprocedure)) = 0 then
    raise exception '111: question_delete_guard no longer raises question_has_attempts';
  end if;

  -- remove_olympiad_package_grade stays the SAFE archive-only path and keeps
  -- its 2-argument signature: a 3-arg overload would be the PostgREST
  -- ambiguity hazard migration 101 documents.
  if to_regprocedure('public.remove_olympiad_package_grade(uuid,uuid)') is null then
    raise exception '111: remove_olympiad_package_grade(uuid,uuid) went missing';
  end if;

  -- NO TOKEN-LESS OVERLOAD SURVIVES. Both signatures gained p_expected_code
  -- after review; if the earlier arity is still in the catalog it is not a
  -- leftover, it is a way to run the same destruction without confirming it.
  if to_regprocedure('public.admin_purge_subject_questions(uuid)') is not null then
    raise exception '111: the token-less admin_purge_subject_questions(uuid) overload still exists';
  end if;
  if to_regprocedure('public.admin_delete_olympiad_grade_pool(uuid,uuid,boolean)') is not null then
    raise exception '111: the token-less admin_delete_olympiad_grade_pool(uuid,uuid,boolean) overload still exists';
  end if;

  -- THE FOUR REVIEW FINDINGS, asserted in the shipped bodies rather than only
  -- in the source file, so a later hand-edit in the SQL editor cannot quietly
  -- undo them. Each pair is (signature, text that must appear in its body).
  foreach v_needle in array array[
    -- H1: the two operations that destroy the most rows demand the row's own
    -- code, exactly like the two container deletes.
    'public.admin_purge_subject_questions(uuid,text)|confirmation_mismatch',
    'public.admin_delete_olympiad_grade_pool(uuid,uuid,text,boolean)|confirmation_mismatch',
    -- H1: and the purge dialog is told what it is about to break.
    'public.admin_preview_subject_deletion(uuid)|subject_purge_active_subscribers',
    -- H3: the cascade can never take a curriculum tree or a question bank.
    'public.subject_deletion_blocks(uuid)|subject_has_topics',
    'public.subject_deletion_blocks(uuid)|subject_has_questions',
    -- L2: the RESTRICT that used to abort with a bare 23503 is now counted.
    'public.subject_deletion_blocks(uuid)|subject_has_round_attempts',
    -- M3: the orphaned-media list is handed to a Storage delete, so it must
    -- consider every media_assets consumer — these four were missing.
    'public.purge_question_set(uuid[])|x.avatar_media_id = c.m',
    'public.purge_question_set(uuid[])|public.wallpapers',
    'public.purge_question_set(uuid[])|public.sticker_images',
    'public.purge_question_set(uuid[])|public.news'
  ] loop
    if position(split_part(v_needle, '|', 2) in
          pg_get_functiondef(split_part(v_needle, '|', 1)::regprocedure)) = 0 then
      raise exception '111: % does not contain %',
        split_part(v_needle, '|', 1), split_part(v_needle, '|', 2);
    end if;
  end loop;

  -- H2: the DESTRUCTIVE grade path counts purchases in ANY status, while the
  -- restorable archive path deliberately keeps its active-only predicate. The
  -- two spellings must stay different — asserted in both directions, because
  -- "copy the safe path" is the exact instinct that produced the bug.
  if position('pu.status = ''active''' in
        pg_get_functiondef('public.olympiad_grade_pool_blocks(uuid,uuid,boolean)'::regprocedure)) > 0 then
    raise exception '111: olympiad_grade_pool_blocks still filters purchases to status = active';
  end if;
  if position('pu.status = ''active''' in
        pg_get_functiondef('public.remove_olympiad_package_grade(uuid,uuid)'::regprocedure)) = 0 then
    raise exception '111: remove_olympiad_package_grade lost its active-only purchase predicate';
  end if;

  raise notice '111 OK — guarded deletion for subjects and olympiad packages';
end
$verify$;

commit;
