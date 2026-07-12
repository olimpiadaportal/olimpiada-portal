-- =============================================================================
-- 2026_07_11_049_backfill_legacy_pool_questions.sql
-- DATA REPAIR (Round 18 question-scope separation, final piece).
--
-- Before migration 2026_06_28_016 the olympiad pool was a JOIN TABLE
-- (olympiad_package_questions) over general-bank questions; 016 moved the model
-- to questions.olympiad_package_id (NOT NULL = private to that package). Rows
-- attached under the old model still carry olympiad_package_id = NULL, so BY
-- DATA they sit in the general question bank — the source of the owner-reported
-- "package questions appear in regular Questions" leak that survives after the
-- app-level scope fixes.
--
-- This migration: (1) REPORTS the affected rows (ids + proposed package), then
-- (2) backfills olympiad_package_id from the legacy join table — ONLY where it
-- is NULL and the mapping is UNAMBIGUOUS (exactly one distinct package).
-- Questions linked to multiple packages are reported and left untouched for
-- manual review. Nothing is deleted; row content and status are unchanged.
--
-- Dev/staging report at authoring time: 1 legacy link, 1 leaked question,
-- 0 ambiguous. No canonical backport needed (data-only; a from-zero DB has no
-- legacy rows — the current model is already canonical).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

do $$
declare
  r record;
  v_fixed int := 0;
  v_ambiguous int := 0;
begin
  -- 1) Report.
  for r in
    select q.id as question_id, q.subject_id, q.status,
           min(opq.olympiad_package_id::text)::uuid as proposed_package,
           count(distinct opq.olympiad_package_id) as pkg_count
    from public.olympiad_package_questions opq
    join public.questions q on q.id = opq.question_id
    where q.olympiad_package_id is null
    group by q.id, q.subject_id, q.status
  loop
    if r.pkg_count = 1 then
      raise notice 'BACKFILL question % (status %, subject %) -> package %',
        r.question_id, r.status, r.subject_id, r.proposed_package;
    else
      v_ambiguous := v_ambiguous + 1;
      raise warning 'AMBIGUOUS question % linked to % packages — left for manual review',
        r.question_id, r.pkg_count;
    end if;
  end loop;

  -- 2) Backfill the unambiguous rows.
  update public.questions q
     set olympiad_package_id = m.pkg,
         updated_at = now()
    from (
      select question_id, min(olympiad_package_id::text)::uuid as pkg
      from public.olympiad_package_questions
      group by question_id
      having count(distinct olympiad_package_id) = 1
    ) m
   where q.id = m.question_id
     and q.olympiad_package_id is null;
  get diagnostics v_fixed = row_count;

  raise notice 'legacy pool backfill: % question(s) moved to their package scope, % ambiguous skipped',
    v_fixed, v_ambiguous;

  -- 3) Verify: no unambiguous leak remains.
  if exists (
    select 1
    from public.olympiad_package_questions opq
    join public.questions q on q.id = opq.question_id
    where q.olympiad_package_id is null
    group by opq.question_id
    having count(distinct opq.olympiad_package_id) = 1
  ) then
    raise exception 'backfill incomplete — unambiguous legacy rows remain';
  end if;
end $$;

commit;
