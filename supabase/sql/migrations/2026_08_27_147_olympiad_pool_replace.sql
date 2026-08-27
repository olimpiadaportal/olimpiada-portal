-- =============================================================================
-- 2026_08_27_147 — REPLACE A GRADE'S OLYMPIAD POOL IN ONE TRANSACTION,
--                  and stop a shrinking pool from silently short-changing
--                  a family that paid for it.
--
-- TWO THINGS, and the second one is a bug that exists TODAY, independent of the
-- feature the first one adds.
--
-- ---------------------------------------------------------------------------
-- 1. admin_replace_olympiad_grade_pool — full replacement, atomically.
--
-- The admin panel could already APPEND to a pool (migration 108) and DELETE a
-- whole grade pool (migration 111). "Replace" is neither, and composing it from
-- the two in the client is not equivalent:
--
--   delete → upload  leaves a window in which the pool is EMPTY. In that window
--                    start_olympiad_attempt raises no_data_found, so every
--                    lifetime purchaser who opens the olympiad gets an error —
--                    and if the package was `active`, admin_delete_olympiad_grade_pool
--                    has already demoted it to `inactive`, pulling it out of the
--                    public catalogue. Two PostgREST calls are two transactions;
--                    a crash between them leaves that state permanently.
--
--   upload → delete  is worse: the delete cannot tell the new rows from the old.
--
-- So the whole operation is ONE function, in ONE transaction, holding a
-- `for update` lock on the package row. Parsing, per-row validation and media
-- claiming stay in the server action AHEAD of this call (owner spec §6, §10) —
-- this function is the destructive half only, and it reuses the existing
-- importer rather than duplicating 300 lines of it.
--
-- STRICTLY ALL-OR-NOTHING, and that is a DELIBERATE DIVERGENCE from the append
-- path. `bulk_insert_olympiad_package_questions` reports bad rows individually
-- and commits the good ones, which is right when you are adding to a pool and
-- wrong when you have just destroyed one: a partial import would leave the
-- grade with fewer questions than either the old or the new set. Any failure
-- here raises, and the rollback restores the old pool untouched. Do not
-- "harmonise" the two error models.
--
-- WHAT REPLACEMENT DOES TO THE OLD ROWS. It calls `purge_question_set`, which
-- makes the only split the database permits:
--   * never-answered questions are HARD DELETED — row gone, cascade children
--     gone, orphaned media reported for the caller to sweep;
--   * answered questions are ARCHIVED, because `test_attempt_answers.question_id`
--     is ON DELETE CASCADE and an olympiad attempt carries NO content snapshot
--     (`get_test_review` joins the live question). Deleting one would destroy
--     the graded result itself and leave `submit_test_attempt`'s frozen
--     `max_score` describing rows that no longer exist.
-- Archiving removes them from the ACTIVE pool completely: every draw filters
-- `status = 'published'` (011 olympiad/daily/practice). So the owner's
-- acceptance test — a 100-question pool replaced by a 50-question upload ends
-- with 50 — holds on the number that is actually the pool: published.
--
-- THE DUPLICATE-SNAPSHOT TRAP, and why this function verifies the count.
-- The importer snapshots the existing pool's content keys and skips a row that
-- matches one, and it includes ARCHIVED rows in that snapshot ON PURPOSE
-- (011, migration 108). After a purge the answered survivors are archived but
-- still present, so an incoming row whose content matches one of them is
-- SILENTLY SKIPPED — the admin would upload 50, get 47, and be told it worked.
-- Rather than add a parameter to the importer (migration 108's header forbids
-- it, and olympiad-dup-key.test.ts asserts its body byte-for-byte), this
-- function asserts `imported = payload length` and raises otherwise. The
-- rollback leaves the old pool intact and the admin gets a message naming the
-- collision instead of a quietly short pool.
--
-- WHAT IT DOES NOT TOUCH. No entitlement, no `olympiad_purchases` row, no
-- notification, no package status flip. A purchaser keeps their lifetime access
-- and simply draws from the new questions next time they enter — which is
-- already how `can_view_olympiad_package` behaves, since its purchase branch
-- never reads `status`. Owner spec §8 needs no code, and none is added.
--
-- ---------------------------------------------------------------------------
-- 2. THE PRE-EXISTING BUG: a shrinking pool silently serves a SHORT olympiad.
--
-- `trg_olympiad_activation_pool_guard` fires only on a transition INTO `active`
-- or a RAISE of questions_per_attempt. NOTHING fires when the pool shrinks. And
-- `start_olympiad_attempt` does not refuse either — it clamps:
--
--     v_n := least(v_pkg.n_per, cardinality(v_pool));
--
-- so a family that bought a 25-question olympiad can be served 10 with no error
-- and no record anywhere. That is reachable today through the per-question
-- delete and archive actions; this migration does not introduce it, but it must
-- not add a faster route to it either.
--
-- The floor is therefore asserted HERE, after the import, against the POST
-- state — and on a grade somebody has PURCHASED it is a hard refusal rather
-- than the auto-demotion the delete path uses. Demoting pulls the package from
-- the catalogue; refusing keeps the purchaser whole and tells the admin exactly
-- how many questions short they are. `olympiad_grade_purchase_count` decides
-- what counts as a purchase — never re-implement that predicate, which is
-- precisely why migration 112 extracted it.
--
-- Self-transacting. Backported verbatim into canonical 015.
-- =============================================================================
begin;

create or replace function public.admin_replace_olympiad_grade_pool(
  p_package_id    uuid,
  p_grade_id      uuid,
  p_questions     jsonb,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg       record;
  v_blocks    jsonb;
  v_live      jsonb := '[]'::jsonb;
  v_b         jsonb;
  v_incoming  int;
  v_old       uuid[];
  v_kept      uuid[] := '{}'::uuid[];
  v_purge     jsonb;
  v_imp       jsonb;
  v_ok        int;
  v_rot       int := 0;
  v_purchases int;
  v_pool      int;
  v_need      int;
begin
  -- Admin-only module: Content Managers must never manage Olympiad Preparation.
  -- No permission fallback, exactly like the importer and the delete RPC.
  if not public.is_admin() then
    raise exception 'admin_replace_olympiad_grade_pool: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- A replacement with nothing to replace WITH is a disguised purge. The delete
  -- RPC exists for that and has its own purchase guard; this path must not
  -- become a way around it.
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'admin_replace_olympiad_grade_pool: empty payload'
      using errcode = 'check_violation', hint = 'empty_replacement';
  end if;
  v_incoming := jsonb_array_length(p_questions);

  -- Lock the package row: serialises this against the delete/status RPCs and
  -- pins `status` and `questions_per_attempt` for the rest of the transaction.
  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_replace_olympiad_grade_pool: package not found'
      using errcode = 'no_data_found';
  end if;

  -- The confirmation token, checked under the lock and before anything else.
  -- This function is granted to `authenticated` and is therefore a PostgREST
  -- endpoint any admin session can POST directly — the dialog is not a control,
  -- the token is.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_replace_olympiad_grade_pool: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  if not exists (select 1 from public.olympiad_package_grades
                  where olympiad_package_id = p_package_id and grade_id = p_grade_id) then
    raise exception 'admin_replace_olympiad_grade_pool: grade is not a package target'
      using errcode = 'no_data_found', hint = 'pool_grade_not_targeted';
  end if;

  -- Reuse the ONE block predicate, but honour only `live_attempts`.
  --
  -- `grade_has_purchases_purge` blocks EMPTYING a purchased pool, because that
  -- silently revokes a lifetime entitlement. A replacement refills the pool in
  -- the same transaction, so that reasoning does not apply — what protects the
  -- purchaser here is the floor assertion at the end, against the POST state.
  -- `last_grade` cannot apply: the grade stays targeted.
  v_blocks := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id, false);
  for v_b in select * from jsonb_array_elements(v_blocks) loop
    if v_b->>'hint' = 'live_attempts' then v_live := v_live || v_b; end if;
  end loop;
  if jsonb_array_length(v_live) > 0 then
    -- An in-progress attempt holds question ids in `test_attempts.question_ids`
    -- and pre-created answer rows. Refusing keeps that answer-row set stable for
    -- the duration of the replacement, which is what makes the purge's
    -- delete/archive split decidable.
    raise exception 'admin_replace_olympiad_grade_pool: % attempt(s) in progress',
      (v_live->0->>'count')
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object('blocks', v_live)::text;
  end if;

  -- ---- destructive half, all inside this transaction ----------------------
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_old
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;

  v_purge := public.purge_question_set(v_old);

  -- The rotation row is pure cache keyed on ids that may no longer exist.
  -- Leaving it makes a freshly replaced pool look partly consumed to that
  -- student and can hand them a short attempt.
  delete from public.olympiad_question_rotations
   where olympiad_package_id = p_package_id and grade_id = p_grade_id;
  get diagnostics v_rot = row_count;

  -- ---- take the archived survivors out of the importer's SIGHT -------------
  --
  -- The importer snapshots the pool's content keys and skips a row that matches
  -- one, and it includes ARCHIVED rows in that snapshot ON PURPOSE — for the
  -- APPEND path, where "this question is already here, restore it" is the right
  -- admin action. On a REPLACEMENT that reasoning inverts: the archived rows are
  -- history kept only so `test_attempt_answers` and the review screen still
  -- resolve, and the incoming file is the new pool. Comparing the two makes a
  -- re-uploaded question vanish and the whole replacement fail the count check
  -- below — measured on staging: a 4-row upload landed 3.
  --
  -- The snapshot is keyed on (olympiad_package_id, grade_id), so detaching the
  -- GRADE for the duration of the import removes exactly those rows from it and
  -- nothing else. `olympiad_package_id` is deliberately left alone: clearing it
  -- would move them into the general bank, where the daily-round pool is
  -- `olympiad_package_id is null` — that would inject olympiad content into
  -- every child's rated round. A grade-less pool row is a legal state, so the
  -- intermediate value violates nothing, and the re-attach below is asserted.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_kept
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
    and q.status = 'archived';
  if cardinality(v_kept) > 0 then
    update public.questions set grade_id = null where id = any(v_kept);
  end if;

  -- ---- constructive half, through the EXISTING importer --------------------
  -- Nested SECURITY DEFINER: is_admin() and current_profile_id() read the
  -- request JWT rather than current_user, so the admin identity survives the
  -- call. Verified on staging before this migration was applied.
  v_imp := public.bulk_insert_olympiad_package_questions(
             p_package_id, p_questions, p_grade_id);
  -- The importer returns {total, successful, failed, errors}. A row skipped as
  -- a duplicate is reported as a row ERROR, so it lands in `failed` and
  -- `successful` is exactly the number of rows that reached the pool.
  v_ok := coalesce((v_imp->>'successful')::int, 0);

  -- ALL OR NOTHING. Any row the importer rejected, and any row it silently
  -- skipped as a duplicate of an archived survivor, makes the replacement
  -- incomplete — and an incomplete replacement is the one outcome this feature
  -- must never produce. Raising rolls back the purge above with it.
  if v_ok <> v_incoming then
    raise exception
      'admin_replace_olympiad_grade_pool: % of % row(s) imported', v_ok, v_incoming
      using errcode = 'check_violation',
            hint    = 'replacement_incomplete',
            detail  = jsonb_build_object('expected', v_incoming, 'imported', v_ok,
                                         'importer', v_imp)::text;
  end if;

  -- ---- put the archived survivors back -------------------------------------
  -- Asserted, not assumed: if this ever failed to restore every row, those
  -- questions would silently drop out of the pool listing and out of the
  -- per-grade counts, while still holding the graded history that is the only
  -- reason they exist.
  if cardinality(v_kept) > 0 then
    update public.questions set grade_id = p_grade_id where id = any(v_kept);
    if (select count(*) from public.questions
         where id = any(v_kept) and grade_id is distinct from p_grade_id) > 0 then
      raise exception
        'admin_replace_olympiad_grade_pool: archived survivors were not re-attached'
        using errcode = 'internal_error', hint = 'reattach_failed';
    end if;
  end if;

  -- ---- the floor, against the POST state -----------------------------------
  -- See the header: nothing else in the schema checks this on a shrink, and
  -- start_olympiad_attempt clamps instead of refusing.
  v_purchases := public.olympiad_grade_purchase_count(p_package_id, p_grade_id);
  begin
    perform public.assert_olympiad_pool_meets_per_attempt(
              p_package_id, v_pkg.questions_per_attempt, p_grade_id);
  exception when check_violation then
    select count(*)::int into v_pool
    from public.questions q
    where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
      and q.status = 'published';
    select coalesce(g.questions_per_attempt, v_pkg.questions_per_attempt) into v_need
    from public.olympiad_package_grades g
    where g.olympiad_package_id = p_package_id and g.grade_id = p_grade_id;
    -- On a PURCHASED grade this is a refusal, not a demotion. Demoting would
    -- pull the package out of the public catalogue as a side effect of a
    -- content edit; refusing keeps the purchaser whole and tells the admin the
    -- exact shortfall. On an unpurchased grade the same refusal is simply the
    -- honest answer — the admin is one upload away from fixing it, and a pool
    -- that cannot fill an attempt should never be committed.
    raise exception
      'admin_replace_olympiad_grade_pool: pool % < required %', v_pool, v_need
      using errcode = 'check_violation',
            hint    = case when v_purchases > 0
                           then 'replacement_below_floor_purchased'
                           else 'replacement_below_floor' end,
            detail  = jsonb_build_object('pool', v_pool, 'required', v_need,
                                         'purchases', v_purchases)::text;
  end;

  return jsonb_build_object(
    'package_id',         p_package_id,
    'grade_id',           p_grade_id,
    'replaced_with',      v_ok,
    'deleted_questions',  (v_purge->>'deleted')::int,
    'archived_questions', (v_purge->>'archived')::int,
    'retained_questions', (v_purge->>'retained')::int,
    'reset_rotations',    v_rot,
    'purchases',          v_purchases,
    -- The caller MUST sweep these through the same path the delete action uses;
    -- question rows go away, their images do not, and a full-pool replacement
    -- can exceed purge_question_set's 2000-id cap. `media_truncated` says so
    -- rather than leaking the remainder silently.
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated',    (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_replace_olympiad_grade_pool(uuid, uuid, jsonb, text) is
  'Administrator-only (migration 147): replace ONE (package, grade) olympiad '
  'pool with an uploaded set, atomically. Purges the old rows via '
  'purge_question_set (never-answered hard-deleted, answered archived — an '
  'olympiad attempt has no content snapshot, so deleting an answered question '
  'would destroy the graded result), resets that grade''s rotations, then '
  'imports through bulk_insert_olympiad_package_questions. STRICTLY '
  'all-or-nothing, unlike the append path: if the importer lands fewer rows '
  'than were sent — including rows silently skipped as duplicates of ARCHIVED '
  'survivors, which the importer''s snapshot deliberately includes — the whole '
  'transaction rolls back and the old pool is untouched. Finally asserts the '
  'post-state pool still fills one attempt, which NOTHING else checks on a '
  'shrink (start_olympiad_attempt clamps with least(n_per, pool) instead of '
  'refusing). Never touches entitlements, purchases, package status or '
  'notifications.';

revoke all on function public.admin_replace_olympiad_grade_pool(uuid, uuid, jsonb, text)
  from public, anon;
grant execute on function public.admin_replace_olympiad_grade_pool(uuid, uuid, jsonb, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  v_src := pg_get_functiondef(
    'public.admin_replace_olympiad_grade_pool(uuid,uuid,jsonb,text)'::regprocedure);

  if position('purge_question_set' in v_src) = 0 then
    raise exception '147: replacement does not reuse purge_question_set';
  end if;
  if position('bulk_insert_olympiad_package_questions' in v_src) = 0 then
    raise exception '147: replacement does not reuse the existing importer';
  end if;
  if position('assert_olympiad_pool_meets_per_attempt' in v_src) = 0 then
    raise exception '147: replacement does not assert the per-attempt floor';
  end if;
  if position('olympiad_grade_purchase_count' in v_src) = 0 then
    raise exception '147: replacement re-implements the purchase predicate';
  end if;

  -- The importer must NOT have been altered. Its arity is asserted elsewhere by
  -- a unit test; here we assert only that the 3-argument form still exists, so
  -- a future "just add a p_replace flag" cannot pass unnoticed.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'bulk_insert_olympiad_package_questions'
      and p.pronargs = 3
  ) then
    raise exception '147: the 3-argument importer is gone — replacement changed its arity';
  end if;

  -- anon must never reach a function that deletes questions.
  if has_function_privilege('anon',
       'public.admin_replace_olympiad_grade_pool(uuid,uuid,jsonb,text)', 'execute') then
    raise exception '147: anon can execute the replacement RPC';
  end if;

  raise notice '147: replacement RPC installed, reuses purge/import/floor/purchase helpers';
end $$;

commit;
