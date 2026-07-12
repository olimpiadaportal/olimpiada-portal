-- =============================================================================
-- 2026_07_11_046_analytics_answered_vs_skipped.sql
-- Owner-reported analytics bug: SKIPPED questions counted as WRONG.
--
-- Root cause: the test engine PRE-INSERTS a test_attempt_answers row for every
-- attempt question (start_topic_test_attempt/start_olympiad_attempt); grading
-- sets is_correct=false on rows whose selected_option_ids is empty. The
-- dashboard then computed wrong = count(NOT is_correct), folding skipped into
-- wrong (2 wrong + 20 skipped rendered as 22 wrong).
--
-- Fix (aggregation only — storage/grading untouched): a row is ANSWERED when
-- selected_option_ids is non-empty (option-based answers are the only kind at
-- launch: single/multiple choice + true/false all select options; a stored
-- empty array/NULL = skipped; practice rows are created only for submitted
-- answers, so absent rows simply don't count). New formulas:
--   answered = rows with a non-empty selection
--   correct  = is_correct (unchanged — an empty selection can never grade true)
--   wrong    = answered AND NOT is_correct
--   skipped  = NOT answered
--   accuracy = correct / answered  (0 answered -> null; UI renders 0%)
-- Invariants: correct + wrong = answered;  answered + skipped = questions.
-- Applies to totals, the accuracy trend, per-topic rows (topics with zero
-- answered are dropped — strongest/weakest must never come from them) and the
-- mistakes breakdown.
--
-- Backport: 011 (get_child_subject_dashboard). Validation: 013 #58 (added in
-- migration 048 alongside the other engine checks).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student_profile_id)
    or public.current_profile_id() = p_student_profile_id
  , false) then
    raise exception 'not allowed';
  end if;

  with graded as (
    select ta.id, ta.submitted_at,
           least(greatest(coalesce(
             extract(epoch from (ta.submitted_at - ta.started_at)) / 60.0, 0), 0), 180)
             as minutes_spent
      from public.test_attempts ta
     where ta.student_profile_id = p_student_profile_id
       and ta.status = 'graded'
       and ta.submitted_at >= now() - make_interval(days => v_days)
       and (p_subject_id is null or ta.subject_id = p_subject_id)
  ),
  ans as (
    -- answered = a non-empty stored selection; empty/NULL selection = skipped.
    select a.is_correct,
           coalesce(array_length(a.selected_option_ids, 1), 0) > 0 as answered,
           q.topic_id, q.subtopic_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'answered',  (select count(*) filter (where answered) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where answered and not is_correct) from ans),
      'skipped',   (select count(*) filter (where not answered) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*) filter (where answered), 0) * 100, 1)
                      from ans)
    ),
    'time_spent_minutes', (select round(coalesce(sum(minutes_spent), 0)) from graded),
    'last_activity', (select max(submitted_at) from graded),
    'weekly_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      -- accuracy per day over ANSWERED questions only; days with zero answered
      -- are omitted (skipped-only days would otherwise chart as 0% wrongly).
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(answ, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) filter (where answered) answ,
                     count(*) filter (where is_correct) cor
                from ans group by 1
              having count(*) filter (where answered) > 0) t
    ),
    'per_topic', (
      -- topics with zero answered questions are excluded: strongest/weakest
      -- selection must never rank a topic nobody actually answered.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.answ, 'correct', x.cor,
               'wrong', x.answ - x.cor, 'skipped', x.skp,
               'accuracy', round(x.cor::numeric / nullif(x.answ, 0) * 100, 1))
               order by x.answ desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, t.name as tname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
                join public.topics t on t.id = a.topic_id
               group by a.topic_id, t.name
              having count(*) filter (where a.answered) > 0) x
    ),
    'mistakes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.answ, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select t.name as tname,
                     coalesce(st.name, '—') as sname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where a.answered and not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.subtopics st on st.id = a.subtopic_id
               group by t.name, coalesce(st.name, '—')
              having count(*) filter (where a.answered and not a.is_correct) > 0
               order by count(*) filter (where a.answered and not a.is_correct) desc
               limit 10) y
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int) is
  'Per-child (optionally per-subject) analytics over graded attempts in a rolling window. '
  'Answer states are separated (migration 046): answered = non-empty stored selection; '
  'wrong counts only answered-and-incorrect; skipped is its own metric; accuracy uses '
  'answered as the denominator. Callable by admins, the linked parent, or the child.';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int)
  to authenticated, service_role;

-- ---- self-verify: invariant formulas on the new shape ------------------------
do $$
declare
  v jsonb;
begin
  -- Impersonate the service role for the in-body authorization check (psql
  -- runs as the DB owner, which carries no JWT claims).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- Shape check with any real student (or an arbitrary uuid — authorized as
  -- service_role): totals must expose the five separated fields.
  select public.get_child_subject_dashboard(coalesce(
           (select profile_id from public.students limit 1),
           gen_random_uuid()), null, 30) into v;
  if not (v->'totals' ? 'answered' and v->'totals' ? 'skipped' and v->'totals' ? 'wrong') then
    raise exception 'dashboard shape missing answered/skipped/wrong: %', v->'totals';
  end if;
  if coalesce((v->'totals'->>'correct')::int, 0)
     + coalesce((v->'totals'->>'wrong')::int, 0)
     <> coalesce((v->'totals'->>'answered')::int, 0) then
    raise exception 'invariant correct+wrong=answered violated: %', v->'totals';
  end if;
  if coalesce((v->'totals'->>'answered')::int, 0)
     + coalesce((v->'totals'->>'skipped')::int, 0)
     <> coalesce((v->'totals'->>'questions')::int, 0) then
    raise exception 'invariant answered+skipped=questions violated: %', v->'totals';
  end if;
  raise notice 'analytics answered/skipped self-verify PASS (%).', v->'totals';
end $$;

commit;
