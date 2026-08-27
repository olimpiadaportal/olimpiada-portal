-- =============================================================================
-- 2026_08_27_150 — FINISHING 149: A "WRITE" POLICY DECLARED `FOR ALL`
--                  IS ALSO A READ POLICY, AND IT WAS THE EXPENSIVE ONE.
--
-- Migration 149 hoisted the five question-family SELECT policies and the count
-- did not get faster: still 10s for 21,934 rows. EXPLAIN said why, and it is
-- worth quoting because the lesson generalises:
--
--   Seq Scan on question_translations (actual time=0.902..8012.172 rows=21934)
--     Filter: (is_admin() OR has_permission('content.review')
--              OR has_permission('content.publish')
--              OR (ANY (question_id = (hashed SubPlan 8).col1)) OR …)
--     SubPlan 8 -> (never executed)
--
-- Two things in that plan. First, `content.publish` appears — and it is not in
-- any SELECT policy, so a policy nobody was looking at was contributing to the
-- read. Second, the hoisted SubPlans are "never executed": the cheap-looking
-- bare calls sit FIRST in the OR list and short-circuit it, so the work 149
-- moved into InitPlans was never reached, while the per-row calls it did not
-- touch ran 21,934 times.
--
-- The source is `qtrans_write` and its three siblings, declared `FOR ALL`.
-- `FOR ALL` covers SELECT as well as INSERT/UPDATE/DELETE, and PERMISSIVE
-- policies are OR-ed together — so a table's read cost is the cost of EVERY
-- permissive policy on it, not just the one named `_select`. One un-hoisted
-- policy is enough to make the whole scan per-row.
--
-- This migration applies 149's rewrite to the four `_write` policies. Same
-- rule: `(select f())` is an InitPlan by construction, the VALUE is unchanged,
-- and no policy gains or loses a row.
--
-- PRESERVED EXACTLY, because these govern writes as well as reads:
--   * `for all` (not `for select`) — narrowing it would silently revoke the
--     write path for content managers;
--   * `to authenticated` — 149's first version omitted the role clause on the
--     select policies and handed anon every published question. Measured, not
--     assumed: anon's visible rows went 0 -> 2,836 and back to 0;
--   * both USING and WITH CHECK, which are identical here and must stay so —
--     a `for all` policy with only USING silently forbids every insert.
--
-- Self-transacting. Backported verbatim into canonical 010.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- question_translations
-- -----------------------------------------------------------------------------
drop policy if exists qtrans_write on public.question_translations;
create policy qtrans_write on public.question_translations
  for all to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1 from public.questions q
      where q.id = question_translations.question_id
        and q.created_by = (select public.current_profile_id())
    )
  )
  with check (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1 from public.questions q
      where q.id = question_translations.question_id
        and q.created_by = (select public.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- question_explanations
-- -----------------------------------------------------------------------------
drop policy if exists qexpl_write on public.question_explanations;
create policy qexpl_write on public.question_explanations
  for all to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1 from public.questions q
      where q.id = question_explanations.question_id
        and q.created_by = (select public.current_profile_id())
    )
  )
  with check (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1 from public.questions q
      where q.id = question_explanations.question_id
        and q.created_by = (select public.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- answer_options
-- -----------------------------------------------------------------------------
drop policy if exists aopt_write on public.answer_options;
create policy aopt_write on public.answer_options
  for all to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1 from public.questions q
      where q.id = answer_options.question_id
        and q.created_by = (select public.current_profile_id())
    )
  )
  with check (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1 from public.questions q
      where q.id = answer_options.question_id
        and q.created_by = (select public.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- answer_option_translations
-- -----------------------------------------------------------------------------
drop policy if exists aopttrans_write on public.answer_option_translations;
create policy aopttrans_write on public.answer_option_translations
  for all to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1
      from public.answer_options o
      join public.questions q on q.id = o.question_id
      where o.id = answer_option_translations.option_id
        and q.created_by = (select public.current_profile_id())
    )
  )
  with check (
    (select public.is_admin())
    or (select public.has_permission('content.review'))
    or (select public.has_permission('content.publish'))
    or exists (
      select 1
      from public.answer_options o
      join public.questions q on q.id = o.question_id
      where o.id = answer_option_translations.option_id
        and q.created_by = (select public.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  r        record;
  v_count  int := 0;
begin
  for r in
    select c.relname, pol.polname, pol.polcmd,
           pg_get_expr(pol.polqual, pol.polrelid)      as using_expr,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr,
           (select string_agg(rr.rolname, ',') from pg_roles rr where rr.oid = any(pol.polroles)) as roles
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polname in ('qtrans_write', 'qexpl_write', 'aopt_write', 'aopttrans_write')
  loop
    v_count := v_count + 1;

    if r.polcmd <> '*' then
      raise exception '150: %.% is no longer FOR ALL (%) — the write path was narrowed',
        r.relname, r.polname, r.polcmd;
    end if;
    if r.check_expr is null then
      raise exception '150: %.% lost its WITH CHECK — every insert would be refused',
        r.relname, r.polname;
    end if;
    if r.roles is distinct from 'authenticated' then
      raise exception '150: %.% is scoped to %, expected authenticated',
        r.relname, r.polname, coalesce(r.roles, 'PUBLIC');
    end if;
    -- The whole point: no bare call may remain in EITHER expression, or the
    -- OR-list short-circuits on it again and the scan stays per-row.
    if r.using_expr ~ '(?<!SELECT )(is_admin|has_permission|current_profile_id)\('
       or r.check_expr ~ '(?<!SELECT )(is_admin|has_permission|current_profile_id)\(' then
      raise exception '150: %.% still contains an un-hoisted call', r.relname, r.polname;
    end if;
  end loop;

  if v_count <> 4 then
    raise exception '150: expected 4 write policies, found %', v_count;
  end if;

  raise notice '150: 4 FOR ALL policies hoisted; still FOR ALL, still authenticated, WITH CHECK intact';
end $$;

commit;
