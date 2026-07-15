-- =============================================================================
-- 2026_07_13_063_option_demotion_rollback_delete_guard.sql
-- Round 21 item 4 (+ groundwork for item 2):
--
-- 1) ROLL BACK the Round-20 four-option demotion (migration 055). Demoting the
--    legacy 4-option questions to 'in_review' emptied the published general
--    bank on real databases (Practice suddenly reports "no questions") AND
--    silently shrank the pools of ALREADY-PURCHASED olympiad packages (attempts
--    draw published pool questions only). Re-promote them: PRACTICE topic tests
--    and olympiad attempts render however many options a question has; only the
--    RATED daily rounds keep the strict 5-option bar (their pool query filters
--    option count = 5 — unchanged). The "needs option E" review workflow keys
--    off the OPTION COUNT, not the status, from now on.
--    Proxy for "was demoted by 055": status='in_review' AND exactly 4 options
--    AND exactly 1 correct (the legacy authored shape). Flagged to the owner:
--    a question that was already in review for other reasons and happens to
--    have that exact shape gets promoted too.
--
-- 2) QUESTION DELETE GUARD (platform-wide): test_attempt_answers.question_id is
--    ON DELETE CASCADE, so hard-deleting a question that any attempt ever
--    answered silently destroys graded history (review rows vanish, max_score
--    no longer matches). Block the delete with a clear error — archive instead.
--    Daily-round attempts keep displaying via their immutable snapshot, but the
--    per-question answer rows ARE the grading history for every attempt kind.
--
-- 3) Supporting index on test_attempt_answers(question_id) (guard lookup +
--    review joins; only attempt_id was indexed before).
--
-- Backports: 011 (guard fn + trigger + index). The status change is data-only
-- (no canonical change; 012 seeds nothing 4-option). Validation: 013 #65.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) re-promote the 055-demoted legacy questions --------------------------------
with shaped as (
  select q.id, (q.olympiad_package_id is not null) as is_oly
  from public.questions q
  where q.status = 'in_review'
    and (select count(*) from public.answer_options ao
          where ao.question_id = q.id) = 4
    and (select count(*) from public.answer_options ao
          where ao.question_id = q.id and ao.is_correct) = 1
), promoted as (
  update public.questions q
     set status = 'published', updated_at = now()
    from shaped s
   where q.id = s.id
  returning s.is_oly
)
select count(*) filter (where not is_oly) as general_repromoted,
       count(*) filter (where is_oly)     as olympiad_repromoted
from promoted;

do $$
declare v_gen int; v_oly int;
begin
  select count(*) filter (where q.olympiad_package_id is null),
         count(*) filter (where q.olympiad_package_id is not null)
    into v_gen, v_oly
  from public.questions q
  where q.status = 'published'
    and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 4;
  raise notice 'option-demotion rollback: % general + % olympiad four-option question(s) are published again (still listed in the needs-option-E review, now by option count).',
    v_gen, v_oly;
end $$;

-- ---- 2) delete guard ----------------------------------------------------------------
create or replace function public.question_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- BEFORE DELETE fires before the FK cascade, so the history rows still exist.
  if exists (select 1 from public.test_attempt_answers a where a.question_id = old.id) then
    raise exception 'question % has attempt history and cannot be deleted; archive it instead', old.id
      using errcode = 'check_violation',
            hint    = 'question_has_attempts';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_question_delete_guard on public.questions;
create trigger trg_question_delete_guard
  before delete on public.questions
  for each row execute function public.question_delete_guard();

-- ---- 3) guard/review lookup index ----------------------------------------------------
create index if not exists idx_answers_question on public.test_attempt_answers (question_id);

-- ---- self-verify ----------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.questions q
    where q.status = 'in_review'
      and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 4
      and (select count(*) from public.answer_options ao
            where ao.question_id = q.id and ao.is_correct) = 1
  ) then
    raise exception 'a 4-option/1-correct question is still in_review';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_question_delete_guard'
                    and tgrelid = 'public.questions'::regclass) then
    raise exception 'question delete guard trigger missing';
  end if;
  if to_regclass('public.idx_answers_question') is null then
    raise exception 'idx_answers_question missing';
  end if;
  raise notice 'option-demotion rollback + delete guard self-verify PASS';
end $$;

commit;
