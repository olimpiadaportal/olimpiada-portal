-- =============================================================================
-- 2026_08_27_149 — RLS CALLED is_admin() ONCE PER ROW, AND THE QUESTION LIST
--                  STOPPED LOADING BECAUSE OF IT.
--
-- REPORTED: "The question list could not be loaded" on the admin Questions
-- page, while the stat cards above it rendered fine. Reproduced end to end
-- against production with a real authenticated session:
--
--     GET /rest/v1/questions?select=…,question_translations(locale,body)…
--     HTTP 500  8.2s  {"code":"57014","message":"canceling statement due to
--                       statement timeout"}
--
-- MEASURED, not guessed. Narrowing the select one embed at a time:
--
--     base + subjects/grades/topics ............ 1.5s   ok
--     + question_translations(locale, body) .... 8.2s   TIMEOUT
--     + question_explanations(locale) .......... 7.7s   almost
--
-- and then, as `authenticated`, with nothing else running:
--
--     select count(*) from question_translations;   -> 21,934 rows, 9.7 SECONDS
--
-- 9.7s for 21,934 rows is 0.44ms per row, which is not I/O — it is a function
-- call. `qtrans_select` reads:
--
--     EXISTS (SELECT 1 FROM questions q
--             WHERE q.id = question_translations.question_id
--               AND (q.status = 'published' OR q.created_by = current_profile_id()
--                    OR is_admin() OR has_permission('content.review')))
--
-- `is_admin()`, `has_permission()` and `current_profile_id()` are all declared
-- STABLE, so in an ordinary WHERE clause the planner hoists them into an
-- InitPlan and calls them ONCE. Inside a CORRELATED subquery it cannot: the
-- subquery is re-planned per outer row, so the calls go with it. Each one is
-- itself a query (is_admin -> has_role -> a join over profile_roles), so the
-- table scan turns into ~22,000 nested queries.
--
-- THE FIX is the documented Supabase pattern: wrap each call in a scalar
-- subquery, `(select public.is_admin())`. A scalar subquery with no outer
-- reference is an InitPlan by construction — evaluated once, before the scan,
-- whatever it is nested inside. The VALUE is identical; only how many times it
-- is computed changes. No policy gains or loses a single row, which is the
-- property that makes this safe to do to security predicates.
--
-- WHY THIS APPEARED NOW. It scales with the size of the EMBEDDED table, not
-- with the page. The bank went from 492 to 4,441 questions in one afternoon of
-- bulk imports, and question_translations went with it (≈3 rows per question).
-- Nothing about the page changed.
--
-- SCOPE. 140 policies in this database call these functions unwrapped, so this
-- is systemic and every one of them degrades as its table grows. This migration
-- fixes the FIVE in the question family — the ones behind the reported outage
-- and behind the question editor's answer-option reads. The remaining 135 are
-- recorded in STATUS.md as a tracked sweep; doing all of them in one migration
-- would mean rewriting 140 security predicates in a single change, and the
-- correct order is to prove the pattern on the ones that are actually failing.
--
-- ROLE SCOPING IS PART OF THE POLICY, and omitting it is not a no-op.
-- `create policy … for select` with no `to` clause defaults to PUBLIC, which
-- includes `anon`. All five of these were `to authenticated` in canonical 010,
-- and the first version of this migration dropped that clause while rewriting
-- the predicates — which handed anonymous visitors every PUBLISHED question,
-- its translations and its answer options. Caught by comparing anon's visible
-- row counts before and after (0 -> 2,836 questions), which is why that
-- comparison is run rather than assumed. Re-applied with the clause restored.
--
-- Self-transacting. Backported verbatim into canonical 010.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — questions. The base table of the list.
-- -----------------------------------------------------------------------------
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (
    status = 'published'::content_status
    or created_by = (select public.current_profile_id())
    or (select public.is_admin())
    or (select public.has_permission('content.review'))
  );

-- -----------------------------------------------------------------------------
-- 2 — question_translations. The embed that actually timed out.
-- -----------------------------------------------------------------------------
drop policy if exists qtrans_select on public.question_translations;
create policy qtrans_select on public.question_translations
  for select to authenticated
  using (
    exists (
      select 1
      from public.questions q
      where q.id = question_translations.question_id
        and (
          q.status = 'published'::content_status
          or q.created_by = (select public.current_profile_id())
          or (select public.is_admin())
          or (select public.has_permission('content.review'))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 3 — question_explanations. Same shape, plus the student's own-results branch.
--     The second EXISTS is left exactly as it was apart from the hoist: it is
--     what lets a student read the explanation for a question they answered.
-- -----------------------------------------------------------------------------
drop policy if exists qexpl_select on public.question_explanations;
create policy qexpl_select on public.question_explanations
  for select to authenticated
  using (
    exists (
      select 1
      from public.questions q
      where q.id = question_explanations.question_id
        and (
          q.created_by = (select public.current_profile_id())
          or (select public.is_admin())
          or (select public.has_permission('content.review'))
        )
    )
    or exists (
      select 1
      from public.test_attempt_answers a
      join public.test_attempts t on t.id = a.attempt_id
      where a.question_id = question_explanations.question_id
        and t.student_profile_id = (select public.current_profile_id())
        and t.status = 'graded'::attempt_status
    )
  );

-- -----------------------------------------------------------------------------
-- 4 — answer_options and their translations. Not in the failing request, but
--     the question EDITOR reads both, they carry the identical predicate, and
--     answer_options is the largest of the four tables (five rows per question).
--     Leaving them would simply move the next timeout to the editor.
-- -----------------------------------------------------------------------------
drop policy if exists aopt_select on public.answer_options;
create policy aopt_select on public.answer_options
  for select to authenticated
  using (
    exists (
      select 1
      from public.questions q
      where q.id = answer_options.question_id
        and (
          q.created_by = (select public.current_profile_id())
          or (select public.is_admin())
          or (select public.has_permission('content.review'))
        )
    )
  );

drop policy if exists aopttrans_select on public.answer_option_translations;
create policy aopttrans_select on public.answer_option_translations
  for select to authenticated
  using (
    exists (
      select 1
      from public.answer_options o
      join public.questions q on q.id = o.question_id
      where o.id = answer_option_translations.option_id
        and (
          q.status = 'published'::content_status
          or q.created_by = (select public.current_profile_id())
          or (select public.is_admin())
          or (select public.has_permission('content.review'))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- VERIFICATION.
--
-- The point of this migration is that the predicates mean exactly what they
-- meant before, so the check is on SHAPE, not on behaviour: every one of the
-- five must still be present, still be a SELECT policy, and must no longer
-- contain a bare call.
-- -----------------------------------------------------------------------------
do $$
declare
  r        record;
  v_expr   text;
  v_missing int := 0;
begin
  for r in
    select c.relname, pol.polname, pg_get_expr(pol.polqual, pol.polrelid) as expr
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and pol.polcmd = 'r'
      and (c.relname, pol.polname) in (
        ('questions', 'questions_select'),
        ('question_translations', 'qtrans_select'),
        ('question_explanations', 'qexpl_select'),
        ('answer_options', 'aopt_select'),
        ('answer_option_translations', 'aopttrans_select'))
  loop
    v_missing := v_missing + 1;
    v_expr := r.expr;
    -- A BARE call is one not immediately preceded by "SELECT ". If any survives,
    -- the hoist did not happen for it and the per-row cost is still there.
    if v_expr ~ '(?<!SELECT )(is_admin|has_permission|current_profile_id)\(' then
      raise exception '149: %.% still contains an un-hoisted call: %',
        r.relname, r.polname, v_expr;
    end if;
  end loop;

  if v_missing <> 5 then
    raise exception '149: expected 5 rewritten policies, found %', v_missing;
  end if;

  -- ROLE SCOPING. A policy created without `to authenticated` silently applies
  -- to PUBLIC, and `anon` is in PUBLIC. That is a data leak, not a style issue.
  if exists (
    select 1 from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and pol.polcmd = 'r'
      and (c.relname, pol.polname) in (
        ('questions', 'questions_select'),
        ('question_translations', 'qtrans_select'),
        ('question_explanations', 'qexpl_select'),
        ('answer_options', 'aopt_select'),
        ('answer_option_translations', 'aopttrans_select'))
      and (pol.polroles = '{0}'::oid[]                       -- PUBLIC
           or not exists (select 1 from pg_roles rr
                          where rr.oid = any(pol.polroles) and rr.rolname = 'authenticated'))
  ) then
    raise exception '149: a question-family policy is not scoped to authenticated';
  end if;

  raise notice '149: 5 question-family SELECT policies hoisted; no bare calls remain';
end $$;

commit;
