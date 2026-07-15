-- =============================================================================
-- 2026_07_12_055_five_answer_options.sql
-- Round 20 item 9/13: ALL questions (subject + olympiad) now carry EXACTLY
-- FIVE answer options (A–E) with exactly one correct.
--
-- The per-type structure rule is data-driven (assert_question_type_rules reads
-- question_types.options_required/correct_required — migrations 037/040), so:
--   1) single_choice.options_required: 4 → 5 (correct_required stays 1). Every
--      creation path (admin form, both bulk RPCs) validates through the same
--      assert function and now enforces 5 automatically.
--   2) Existing PUBLISHED questions that do not have exactly 5 options are
--      DEMOTED to 'in_review' (owner rule: no silent fake fifth option; they
--      are excluded from every draw — practice/tests/olympiads/daily rounds all
--      filter status='published' — until an admin adds option E and re-publishes).
--      Historical attempts stay readable: attempt payloads render the stored
--      answer rows regardless of the question's current status.
--
-- Backports: 012 (seed options_required=5), 013 (#63 shares the terms check
-- cluster). Report counts logged below. Apply via:
-- psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) the rule ------------------------------------------------------------------
update public.question_types
   set options_required = 5, updated_at = now()
 where code = 'single_choice' and options_required is distinct from 5;

-- ---- 2) demote non-conforming published questions ---------------------------------
with counted as (
  select q.id, count(ao.id) as n_opts,
         (q.olympiad_package_id is not null) as is_oly
  from public.questions q
  left join public.answer_options ao on ao.question_id = q.id
  where q.status = 'published'
  group by q.id, q.olympiad_package_id
), demoted as (
  update public.questions q
     set status = 'in_review', updated_at = now()
    from counted c
   where q.id = c.id and c.n_opts <> 5
  returning q.id, c.is_oly
)
select 1;  -- CTE executes above; report follows

do $$
declare
  v_general int; v_oly int; v_valid int;
begin
  -- (re-count after the demotion above)
  select count(*) filter (where q.olympiad_package_id is null),
         count(*) filter (where q.olympiad_package_id is not null)
    into v_general, v_oly
  from public.questions q
  where q.status = 'in_review'
    and (select count(*) from public.answer_options ao where ao.question_id = q.id) <> 5;

  select count(*) into v_valid
  from public.questions q
  where q.status = 'published'
    and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5;

  raise notice 'five-options migration: % general + % olympiad question(s) now need option E (in_review); % published question(s) already valid.',
    v_general, v_oly, v_valid;
end $$;

-- ---- self-verify -------------------------------------------------------------------
do $$
begin
  if (select options_required from public.question_types where code = 'single_choice') <> 5 then
    raise exception 'single_choice options_required is not 5';
  end if;
  if exists (
    select 1 from public.questions q
    where q.status = 'published'
      and (select count(*) from public.answer_options ao where ao.question_id = q.id) <> 5
  ) then
    raise exception 'published question with != 5 options survived the demotion';
  end if;
  raise notice 'five-options self-verify PASS';
end $$;

commit;
