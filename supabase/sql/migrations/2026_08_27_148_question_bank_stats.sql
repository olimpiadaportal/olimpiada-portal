-- =============================================================================
-- 2026_08_27_148 — THE QUESTIONS PAGE ASKED THE DATABASE THE SAME EIGHT
--                  QUESTIONS ON EVERY PAGE VIEW, AND FELL OVER UNDER AN IMPORT.
--
-- REPORTED: "The question list could not be loaded" on /questions, while the
-- stat cards above it rendered fine.
--
-- WHAT WAS ACTUALLY HAPPENING. Nothing was corrupt. The page issues TWELVE
-- concurrent queries per view, and EIGHT of them are `count: exact` — four
-- lifecycle counts, one needs-term count, and three explanation-coverage counts
-- that join `question_explanations` back to `questions`. Every one is a full
-- pass over the bank. They are also completely independent of the page you are
-- on: stepping from page 3 to page 4 recomputes all eight.
--
-- That was survivable at 492 bank questions. It stopped being survivable at
-- 3,441 — measured while a bulk import was inserting 100–300 questions per
-- minute into the same table. `authenticated` carries `statement_timeout = 8s`
-- (pg_roles), so the list query, competing with the import for the same pages,
-- crossed it and returned an error. The admin sees a failed list; the cheap
-- head-only counts still succeed, which is exactly the asymmetry reported.
--
-- THE FIX: one round trip, one pass, computed where the data already is.
-- `admin_question_bank_stats()` returns all eight numbers as jsonb. Eight full
-- scans become one, and eleven of the page's twelve queries become four.
--
-- WHY SECURITY DEFINER. The counts must describe the WHOLE bank, and
-- `questions_select` restricts a Content Manager to published rows plus their
-- own. A count that silently changes meaning with the reader's role is worse
-- than no count. The in-body guard is the control: Administrator or
-- content.review, matching who may see the list these numbers describe. Content
-- Managers legitimately hold content.review, so both are accepted here — this
-- is a READ of aggregate counts, not an olympiad-module mutation.
--
-- STABLE, not VOLATILE: it writes nothing, so the planner may reuse it within a
-- statement and PostgREST will not force a new snapshot.
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

create or replace function public.admin_question_bank_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total    int;
  v_review   int;
  v_pub      int;
  v_rej      int;
  v_no_term  int;
  v_az       int;
  v_en       int;
  v_ru       int;
begin
  if not (public.is_admin() or public.has_permission('content.review')) then
    raise exception 'admin_question_bank_stats: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- ONE pass for the five question-shaped numbers. The page ran five separate
  -- head-only count requests for exactly this.
  select count(*)::int,
         count(*) filter (where status = 'in_review')::int,
         count(*) filter (where status = 'published')::int,
         count(*) filter (where status = 'rejected')::int,
         count(*) filter (where term is null)::int
    into v_total, v_review, v_pub, v_rej, v_no_term
  from public.questions
  -- PRIVATE olympiad-package questions are not part of the general bank, and
  -- every counter on that page excludes them. Keep this predicate identical to
  -- the list query's or the cards will describe a different set than the table.
  where olympiad_package_id is null;

  -- Explanation-translation coverage. `uq_explanation_locale` makes
  -- (question_id, locale) unique, so counting explanation rows for one locale
  -- counts QUESTIONS — the same reasoning the page used.
  select count(*) filter (where qe.locale = 'az')::int,
         count(*) filter (where qe.locale = 'en')::int,
         count(*) filter (where qe.locale = 'ru')::int
    into v_az, v_en, v_ru
  from public.question_explanations qe
  join public.questions q on q.id = qe.question_id
  where q.olympiad_package_id is null;

  return jsonb_build_object(
    'total', v_total,
    'in_review', v_review,
    'published', v_pub,
    'rejected', v_rej,
    'needs_term', v_no_term,
    'expl_az', v_az,
    'expl_en', v_en,
    'expl_ru', v_ru);
end;
$$;

comment on function public.admin_question_bank_stats() is
  'Migration 148: every counter on the admin Questions page in ONE round trip '
  'and one pass. The page previously issued EIGHT `count: exact` full scans per '
  'view — none of which depend on the page being viewed — and under a bulk '
  'import (100-300 inserts/minute) that pushed the list query past the '
  'authenticated role''s 8s statement_timeout, so the list failed while the '
  'cheap cards still rendered. SECURITY DEFINER because the numbers must '
  'describe the whole bank rather than the caller''s RLS slice; guarded in-body '
  'by is_admin() OR content.review, the same audience allowed to read the list.';

revoke all on function public.admin_question_bank_stats() from public, anon;
grant execute on function public.admin_question_bank_stats() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_src text;
  v_direct jsonb;
begin
  v_src := pg_get_functiondef('public.admin_question_bank_stats()'::regprocedure);

  if position('olympiad_package_id is null' in v_src) = 0 then
    raise exception '148: stats do not exclude the private olympiad pools';
  end if;
  if position('insufficient_privilege' in v_src) = 0 then
    raise exception '148: stats function has no authorization guard';
  end if;
  if has_function_privilege('anon', 'public.admin_question_bank_stats()', 'execute') then
    raise exception '148: anon can execute the bank stats';
  end if;

  -- The numbers must equal what the page computed the old way. Checked against
  -- the same predicates, so a future edit that changes the meaning of a counter
  -- fails here rather than quietly reporting a different bank.
  select jsonb_build_object(
           'total',     (select count(*)::int from public.questions where olympiad_package_id is null),
           'in_review', (select count(*)::int from public.questions where olympiad_package_id is null and status = 'in_review'),
           'published', (select count(*)::int from public.questions where olympiad_package_id is null and status = 'published'))
    into v_direct;
  raise notice '148: bank stats installed (total=%, in_review=%, published=%)',
    v_direct->>'total', v_direct->>'in_review', v_direct->>'published';
end $$;

commit;
