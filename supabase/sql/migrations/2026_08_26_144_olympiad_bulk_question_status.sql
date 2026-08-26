-- =============================================================================
-- 2026_08_26_144 — ARCHIVING A POOL COULD SILENTLY SHORTEN A PAID OLYMPIAD.
--
-- Owner request (2026-08-26): bulk management inside a package's question pool —
-- filter, select, and retire many questions at once instead of one row at a time.
--
-- THE HOLE THIS CLOSES, WHICH IS OLDER THAN THE REQUEST.
-- `admin_delete_olympiad_questions` (migration 112) is carefully guarded: it
-- takes the package lock, re-checks the confirmation code under it, proves every
-- id belongs to the package, and refuses outright when the purge would leave a
-- PURCHASED grade's published pool below `questions_per_attempt`.
--
-- Archiving had none of that. `setOlympiadPoolQuestionStatus` in the admin panel
-- is a bare `update questions set status = 'archived'`: no purchase check, no
-- floor check, no demotion. No trigger covers it either — the only olympiad
-- trigger on `public.questions` is `trg_olympiad_pool_grade_guard`, which fires
-- on `olympiad_package_id`/`grade_id` and never on `status`.
--
-- And archiving REMOVES a question from play exactly as deletion does: every
-- draw path filters `status = 'published'` (`start_olympiad_attempt`,
-- `get_olympiad_pool_counts`, the floor assertion). So the two operations have
-- the same effect on a purchaser and had opposite guards.
--
-- WHY IT WAS SILENT, WHICH IS THE WORST PART. `start_olympiad_attempt` draws
-- `least(questions_per_attempt, |pool|)`. It does NOT raise on a short pool — it
-- serves a shorter olympiad. So archiving a purchased grade's pool gives a
-- paying family fewer questions than they bought, and nobody is told: not the
-- child, not the parent, not the admin who did it. Migration 112 called this
-- "a silent revocation of a paid entitlement dressed up as a content edit".
--
-- A per-row inconsistency is a hazard. Bulk-enabling it would have made it a
-- one-click hazard, which is why this RPC exists before the UI does.
--
-- OWNER DECISION, 2026-08-26: bulk Archive is blocked below the floor, on the
-- same terms as Delete. Archive is not an escape hatch from the purchase rule.
--
-- WHAT THIS IS NOT. It is not a "replace" tool. Replacing a pool is composed of
-- two separately-audited steps in this order: APPEND the new questions through
-- the existing per-grade importer, THEN retire the old ones here. Append-first
-- is load-bearing — it keeps the published pool above the floor throughout, so
-- neither the purchase refusal nor the auto-demotion ever fires. Retire-first is
-- impossible on a purchased grade and silently demotes an active package on an
-- unpurchased one.
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

create or replace function public.admin_set_olympiad_questions_status(
  p_package_id    uuid,
  p_question_ids  uuid[],
  p_status        text,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_ids      uuid[] := '{}'::uuid[];
  v_raw      int;
  v_foreign  int;
  v_missing  int;
  v_scope    jsonb := '[]'::jsonb;
  v_blocks   jsonb;
  v_changed  int := 0;
  v_already  int := 0;
  v_demote   boolean := false;
begin
  -- ADMIN ONLY, AND FIRST. The grant to `authenticated` further down only makes
  -- the RPC reachable from the signed-in admin's own session; this is the gate.
  -- Olympiad pools are an Admin-only module (CLAUDE.md: Content Managers must
  -- not manage the Olympiad Preparation module), so holding content.edit is
  -- deliberately not enough.
  if not public.is_admin() then
    raise exception 'admin_set_olympiad_questions_status: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- Two directions only. 'draft' is deliberately absent: it is not a pool state
  -- and would be a third way to leave the published set with different rules.
  if p_status is null or p_status not in ('archived', 'published') then
    raise exception 'admin_set_olympiad_questions_status: bad status %', p_status
      using errcode = 'check_violation', hint = 'bad_status';
  end if;

  v_raw := cardinality(coalesce(p_question_ids, '{}'::uuid[]));
  if v_raw = 0 then
    raise exception 'admin_set_olympiad_questions_status: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- Checked on the RAW array, before any work is done on it: this is a PostgREST
  -- endpoint, and an unbounded id list would let one POST hold the package lock
  -- while it unnests a million rows. Same ceiling as the delete path, so a
  -- selection that can be deleted can also be archived.
  if v_raw > 500 then
    raise exception 'admin_set_olympiad_questions_status: % ids requested, the limit is 500', v_raw
      using errcode = 'check_violation',
            hint    = 'too_many_questions',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'too_many_questions', 'count', v_raw)),
                        'limit', 500)::text;
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[]) into v_ids
  from unnest(p_question_ids) as u(id)
  where u.id is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'admin_set_olympiad_questions_status: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package, and pins the
  -- status this function may later demote.
  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_set_olympiad_questions_status: package not found'
      using errcode = 'no_data_found';
  end if;

  -- THE CONFIRMATION TOKEN, compared HERE and under the lock taken above, for
  -- the reason its sibling gives: this function is granted to `authenticated`,
  -- which makes it a PostgREST endpoint any admin session can POST directly,
  -- with up to 500 questions of blast radius. A checkbox in a dialog is not a
  -- control; a value the DATABASE re-checks is. The archive UI does not ask the
  -- admin to type it (archiving is reversible, so the friction is not earned) —
  -- the ACTION passes the code it already holds, so the contract stays identical
  -- to its sibling and a hand-crafted POST cannot skip the lock-time check.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_set_olympiad_questions_status: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- THE SCOPE CHECK — the reason this function exists at all.
  --
  -- SECURITY DEFINER is load-bearing here: `questions` is RLS-protected, and an
  -- id that passed only because the row was HIDDEN from the caller would be the
  -- opposite of a scope check.
  --
  -- ALL-OR-NOTHING, and the two failures counted SEPARATELY, exactly as the
  -- delete path does it: an id in another package is a client bug worth hunting;
  -- an id that resolves to nothing means a second admin got there first and the
  -- page is merely stale. Reporting the second as the first sends the admin
  -- looking for a bug that does not exist.
  select count(*)::int into v_foreign
  from unnest(v_ids) as u(id)
  where exists (select 1 from public.questions q
                 where q.id = u.id
                   and q.olympiad_package_id is distinct from p_package_id);
  select count(*)::int into v_missing
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);
  if v_foreign > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_not_in_package',
                                             'count', v_foreign);
  end if;
  if v_missing > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_gone',
                                             'count', v_missing);
  end if;
  if jsonb_array_length(v_scope) > 0 then
    raise exception
      'admin_set_olympiad_questions_status: % of % selected id(s) are not in package %, % no longer exist',
      v_foreign, cardinality(v_ids), p_package_id, v_missing
      using errcode = 'check_violation',
            hint    = case when v_foreign > 0
                           then 'question_not_in_package' else 'question_gone' end,
            detail  = jsonb_build_object('blocks', v_scope)::text;
  end if;

  -- THE PURCHASE RULE — ARCHIVE DIRECTION ONLY.
  --
  -- Delegated whole to the SAME predicate the delete path uses. A second,
  -- hand-written copy of "what counts as a purchase" here is precisely how
  -- archiving came to bypass the rule migration 111 already enforced, and why
  -- 112 extracted the helper. Publishing only ever GROWS the published pool, so
  -- it needs no check.
  if p_status = 'archived' then
    v_blocks := public.olympiad_pool_purchase_blocks(p_package_id, v_ids);
    if jsonb_array_length(v_blocks) > 0 then
      raise exception
        'admin_set_olympiad_questions_status: % purchased grade pool(s) would fall below one attempt',
        jsonb_array_length(v_blocks)
        using errcode = 'check_violation',
              hint    = 'grade_purchased_pool_below_attempt',
              detail  = jsonb_build_object('blocks', v_blocks)::text;
    end if;
  end if;

  -- `status <> p_status` makes the call IDEMPOTENT: re-running it changes
  -- nothing and reports `already_in_status`, so a double-click cannot produce a
  -- second audit row claiming work that did not happen. The package scope is
  -- restated here as well as checked above — belt and braces on a statement that
  -- writes.
  -- `questions.status` is the content_status ENUM, so the text parameter is cast
  -- once, here, after it has been whitelisted above. Casting an unvalidated
  -- string would turn a typo into invalid_text_representation instead of the
  -- named `bad_status` refusal the UI can translate.
  update public.questions
     set status     = p_status::public.content_status,
         updated_at = now()
   where id = any(v_ids)
     and olympiad_package_id = p_package_id
     and status is distinct from p_status::public.content_status;
  get diagnostics v_changed = row_count;
  v_already := cardinality(v_ids) - v_changed;

  -- AUTO-DEMOTION — ARCHIVE DIRECTION ONLY. Same behaviour as the delete path
  -- and for the same reason: leaving an ACTIVE package whose pool can no longer
  -- fill an attempt means the next child to open it gets a short attempt rather
  -- than a closed listing. Reachable even with the purchase rule above, because
  -- a grade nobody bought can still be emptied.
  if p_status = 'archived' and v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not: the
      -- guard returns early for any row whose new.status is not 'active'. That
      -- early return is what the whole demotion rests on — do not "simplify" it
      -- by suppressing the trigger.
    end if;
  end if;

  -- No `orphaned_media_ids`: a status change orphans nothing. The caller still
  -- routes through afterOlympiadDestructiveCall so the audit path has one
  -- definition; it simply sweeps an empty array.
  return jsonb_build_object(
    'package_id',       p_package_id,
    'status',           p_status,
    'requested',        cardinality(v_ids),
    'changed',          v_changed,
    'already_in_status', v_already,
    'package_demoted',  v_demote);
end;
$$;

comment on function public.admin_set_olympiad_questions_status(uuid, uuid[], text, text) is
  'Admin-only (migration 144): archive or re-publish a SELECTION of questions '
  'inside ONE olympiad package. Archiving removes a question from every future '
  'attempt exactly as deletion does, so it carries the SAME guards: package lock, '
  'confirmation code re-checked under it, all-or-nothing scope proof, the shared '
  'purchased-grade floor predicate, and auto-demotion of an ACTIVE package whose '
  'pool can no longer fill an attempt. Publishing only grows the pool and skips '
  'the floor checks. Idempotent: re-running reports already_in_status.';

revoke all on function public.admin_set_olympiad_questions_status(uuid, uuid[], text, text)
  from public, anon;
grant execute on function public.admin_set_olympiad_questions_status(uuid, uuid[], text, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_src text;
  v_n   int;
begin
  select count(*)::int into v_n from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_olympiad_questions_status';
  if v_n <> 1 then
    raise exception '144: expected exactly one overload, found %', v_n;
  end if;

  v_src := pg_get_functiondef('public.admin_set_olympiad_questions_status(uuid,uuid[],text,text)'::regprocedure);

  -- The whole point of the migration: archiving must consult the SHARED
  -- purchase predicate, not a second hand-written copy of it.
  if position('olympiad_pool_purchase_blocks' in v_src) = 0 then
    raise exception '144: the archive path does not consult the purchased-grade rule';
  end if;
  if position('assert_olympiad_pool_meets_per_attempt' in v_src) = 0 then
    raise exception '144: the archive path does not re-check the activation floor';
  end if;
  if position('is_admin()' in v_src) = 0 then
    raise exception '144: the admin gate is missing';
  end if;
  if position('for update' in v_src) = 0 then
    raise exception '144: the package row is not locked';
  end if;

  -- Never acceptable in this repository.
  if position('disable trigger' in lower(v_src)) > 0
     or position('session_replication_role' in lower(v_src)) > 0 then
    raise exception '144: the function suppresses triggers';
  end if;

  -- The guard it exists to respect must still be armed.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'olympiad_pool_purchase_blocks'
  ) then
    raise exception '144: olympiad_pool_purchase_blocks is missing';
  end if;

  raise notice '144: bulk archive is guarded on the same terms as bulk delete';
end $$;

commit;
