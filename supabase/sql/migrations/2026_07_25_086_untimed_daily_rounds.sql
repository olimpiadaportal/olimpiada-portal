-- =============================================================================
-- 2026_07_25_086_untimed_daily_rounds.sql
-- =============================================================================
-- Round 42 (owner correction to Round 38): RATED daily rounds are UNTIMED.
--
--   * No deadline, no 25-minute window — the owner's rule is simply: one
--     SUBMITTED round per subject per Baku day (the graded-only unique index
--     from migration 083 stays the enforcement).
--   * ONE open rated attempt per subject+day, RESUMED until submitted —
--     leaving and coming back never costs the attempt and never re-draws
--     (the timer-lapse "fresh set" mechanics from 083 are retired with the
--     timer itself).
--   * Legacy in-flight TIMED attempts (started before this migration) get
--     their deadline cleared on resume so they finish untimed too.
--   * Olympiad attempts keep their own timing — untouched.
--   * Yesterday's locked practice path is unchanged.
--
-- Rerun-safe: yes. Backports: 011 (function).
-- =============================================================================

create or replace function public.start_daily_round_attempt(
  p_subject_id uuid,
  p_day        text default 'today'   -- 'today' (rated) | 'yesterday' (practice)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_date     date;
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_qids     uuid[];
  v_set      public.daily_practice_sets;
  v_existing record;
  v_attempt  uuid;
  v_source   text;
begin
  if v_student is null then raise exception 'daily: not authenticated'; end if;
  if coalesce(p_day, 'today') not in ('today', 'yesterday') then
    raise exception 'daily: bad day' using errcode = 'check_violation';
  end if;

  select grade_id into v_grade from public.students where profile_id = v_student;
  if not found then raise exception 'daily: not a student'; end if;
  if v_grade is null then
    raise exception 'daily: student has no grade' using errcode = 'check_violation';
  end if;

  -- Access: identical gate to the practice/test engines (per-subject).
  if not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    if not exists (
      select 1
      from public.child_subscriptions cs
      join public.subscription_subjects ss
        on ss.child_subscription_id = cs.id and ss.subject_id = p_subject_id
      where cs.student_profile_id = v_student
        and cs.status in ('trialing', 'active', 'canceled')
        and cs.current_period_end is not null
        and cs.current_period_end > now()
    ) then
      raise exception 'daily: no active access' using errcode = 'check_violation';
    end if;
  end if;

  v_date := (now() at time zone 'Asia/Baku')::date - (case when v_rated then 0 else 1 end);

  if v_rated then
    -- The day is consumed ONLY by a SUBMITTED (graded) round.
    if exists (
      select 1 from public.test_attempts
      where student_profile_id = v_student and subject_id = p_subject_id
        and kind = 'daily' and is_rated and status = 'graded'
        and round_date = v_date
    ) then
      raise exception 'daily: already attempted today' using errcode = 'unique_violation';
    end if;

    -- Round 42: UNTIMED — the single open attempt resumes until it is
    -- submitted. A legacy timed attempt (pre-086) sheds its deadline here.
    select id, question_ids, deadline_at into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and is_rated and status = 'in_progress'
      and round_date = v_date
    order by started_at desc limit 1;
    if v_existing.id is not null then
      if v_existing.deadline_at is not null then
        update public.test_attempts
           set deadline_at = null, duration_seconds = null, updated_at = now()
         where id = v_existing.id;
      end if;
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', true,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;

    -- Fresh per-student subtopic-balanced draw for THIS attempt.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
  else
    -- YESTERDAY: get-or-create the LOCKED practice set for this student.
    select * into v_set from public.daily_practice_sets
     where student_profile_id = v_student and subject_id = p_subject_id
       and for_date = v_date;
    if not found then
      -- 1) The student's own graded set, EXACT order.
      select ta.question_ids, 'own' into v_qids, v_source
      from public.test_attempts ta
      where ta.student_profile_id = v_student and ta.subject_id = p_subject_id
        and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
        and ta.round_date = v_date
      order by ta.graded_at desc limit 1;
      -- 2) A peer's graded set (same subject + GRADE + date, COUNTRY-WIDE;
      --    earliest submit — deterministic; question ids only, no identity).
      if v_qids is null then
        select ta.question_ids, 'peer' into v_qids, v_source
        from public.test_attempts ta
        join public.students st on st.profile_id = ta.student_profile_id
        where ta.subject_id = p_subject_id and st.grade_id = v_grade
          and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
          and ta.round_date = v_date
          and coalesce(cardinality(ta.question_ids), 0) > 0
        order by ta.submitted_at asc nulls last, ta.id asc limit 1;
      end if;
      -- 3) The legacy shared round (transition window after the model change).
      if v_qids is null then
        select dr.question_ids, 'round' into v_qids, v_source
        from public.daily_rounds dr
        where dr.round_date = v_date and dr.subject_id = p_subject_id
          and dr.grade_id = v_grade;
      end if;
      -- 4) System-generated batch (spec fallback).
      if v_qids is null then
        v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
        v_source := 'generated';
        if coalesce(cardinality(v_qids), 0) < c_count then
          raise exception 'daily: no round was held yesterday' using errcode = 'no_data_found';
        end if;
      end if;
      insert into public.daily_practice_sets
        (student_profile_id, subject_id, for_date, question_ids, source)
      values (v_student, p_subject_id, v_date, v_qids, v_source)
      on conflict (student_profile_id, subject_id, for_date) do nothing;
      select * into v_set from public.daily_practice_sets
       where student_profile_id = v_student and subject_id = p_subject_id
         and for_date = v_date;
    end if;
    v_qids := v_set.question_ids;

    -- Unlimited retries: resume an open practice attempt on this set first.
    select id, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and not is_rated and status = 'in_progress'
      and round_date = v_date
    order by started_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;
  end if;

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status, question_ids,
     deadline_at, duration_seconds, is_rated, round_date)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_qids,
     null, null, v_rated, v_date)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
exception when unique_violation then
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Round 42: today = RATED per-student subtopic-balanced random 25, UNTIMED — '
  'one open attempt per subject+day resumed until SUBMITTED (submit is the only '
  'consumption; legacy timed attempts shed their deadline on resume); yesterday '
  '= unlimited UNTIMED practice on the student''s LOCKED set (own -> peer '
  'country-wide by grade -> legacy round -> generated), never rated.';
revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;

-- =============================================================================
-- End of 2026_07_25_086_untimed_daily_rounds.sql
-- =============================================================================
