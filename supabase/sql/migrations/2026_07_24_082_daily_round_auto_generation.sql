-- =============================================================================
-- 2026_07_24_082_daily_round_auto_generation.sql
-- =============================================================================
-- Round 37: fully automated daily-round generation (owner spec).
--
-- The engine has been LAZY + AUTOMATED since migration 056: the FIRST student
-- to start a subject's round for the Baku-local day triggers a race-safe
-- server-side draw (get_or_create_daily_round) — admins never selected,
-- assigned, or prepared rounds; the admin "Daily round readiness" panel was a
-- read-only metrics table. This migration completes the spec:
--
--   1. The admin readiness surface is REMOVED end-to-end: the panel leaves the
--      questions page (app change) and its RPC daily_round_readiness() is
--      dropped here. The student-facing pre-flight (get_my_round_readiness)
--      stays — it is a UX guard, not an admin workflow.
--   2. The draw becomes SUBTOPIC-BALANCED "where possible": eligible questions
--      are ranked randomly WITHIN each subtopic bucket, then taken in
--      bucket-round-robin order — every subtopic contributes its 1st pick
--      before any contributes a 2nd, with random order inside each pass.
--      Questions without a subtopic bucket by topic (or stand alone).
--
-- Selection filters (UNCHANGED, matching the spec): subject + student grade
-- (or shared grade-NULL) + status='published' + general bank (not olympiad
-- pools) + CUMULATIVE term (question.term <= academic.current_term; NULL term
-- = "needs review", never served) + the rated 5-option A–E shape with exactly
-- one correct. Grade/subject-access/term are resolved SERVER-SIDE from the
-- authenticated student (never trusted from the client payload).
--
-- The Round-20 rated model is PRESERVED: one immutable shared snapshot per
-- (subject, grade, date); one rated attempt per student per round; yesterday's
-- replays reuse the stored snapshot untimed/unrated.
--
-- Rerun-safe: yes. Backports: 011 (function + drop), 013 (check #67 updated).
-- =============================================================================

-- 1) The admin readiness metrics RPC goes away with its panel.
drop function if exists public.daily_round_readiness();

-- 2) Round generation v2 — subtopic-balanced random draw.
create or replace function public.get_or_create_daily_round(
  p_subject_id uuid, p_grade_id uuid, p_date date
)
returns public.daily_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count constant int := 25;
  v_term  smallint := public.current_academic_term();
  v_qids  uuid[];
  v_row   public.daily_rounds;
begin
  select * into v_row from public.daily_rounds
   where round_date = p_date and subject_id = p_subject_id and grade_id = p_grade_id;
  if found then return v_row; end if;

  -- Cumulative-term pool: published, general bank, term reviewed and <= current,
  -- valid 5-option questions of this subject, for this grade OR shared
  -- (grade_id IS NULL — practice-engine parity, Round 21).
  -- Round 37: SUBTOPIC-BALANCED draw — rank randomly within each subtopic
  -- bucket, take bucket_rank round-robin (all 1st picks before any 2nd pick),
  -- random order inside a pass. Falls back to pure random when balance is
  -- impossible (fewer buckets than needed picks).
  select coalesce(array_agg(id), '{}') into v_qids from (
    select p.id
    from (
      select q.id,
             row_number() over (
               partition by coalesce(q.subtopic_id, q.topic_id, q.id)
               order by random()) as bucket_rank,
             random() as tiebreak
      from public.questions q
      where q.subject_id = p_subject_id
        and (q.grade_id = p_grade_id or q.grade_id is null)
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.term is not null and q.term <= v_term
        and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
        and exists (select 1 from public.answer_options ao
                     where ao.question_id = q.id and ao.is_correct)
    ) p
    order by p.bucket_rank, p.tiebreak
    limit c_count
  ) picked;

  if coalesce(cardinality(v_qids), 0) < c_count then
    raise exception 'daily round: not enough eligible questions (subject %, grade %, terms 1..%: have %, need %)',
      p_subject_id, p_grade_id, v_term, coalesce(cardinality(v_qids), 0), c_count
      using errcode = 'no_data_found';
  end if;

  insert into public.daily_rounds
    (round_date, subject_id, grade_id, term_at_generation, question_ids, content_snapshot)
  values
    (p_date, p_subject_id, p_grade_id, v_term, v_qids, public.build_round_snapshot(v_qids))
  on conflict (round_date, subject_id, grade_id) do nothing;

  select * into v_row from public.daily_rounds
   where round_date = p_date and subject_id = p_subject_id and grade_id = p_grade_id;
  return v_row;
end;
$$;
comment on function public.get_or_create_daily_round(uuid, uuid, date) is
  'Automated lazy daily-round generation (Round 37): first starter triggers a '
  'race-safe, subtopic-balanced random 25-question draw from the cumulative-term '
  'published pool (subject + grade/shared + 5-option). Shared immutable snapshot '
  'per subject+grade+date; admins never prepare rounds.';
revoke all on function public.get_or_create_daily_round(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_or_create_daily_round(uuid, uuid, date) to service_role;

-- =============================================================================
-- End of 2026_07_24_082_daily_round_auto_generation.sql
-- =============================================================================
