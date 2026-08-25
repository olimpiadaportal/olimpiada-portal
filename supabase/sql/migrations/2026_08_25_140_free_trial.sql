-- =============================================================================
-- 2026_08_25_140 - THE 1-DAY FREE TRIAL.
--
-- Owner spec, 2026-08-25. Every child gets ONE 24-hour trial covering up to TWO
-- subjects, taken BEFORE any purchase: no card, no charge, no subscription row.
--
-- THE CONFLICT THIS FEATURE OPENED, AND HOW IT IS RESOLVED.
-- The spec asked for the "one attempt per subject per day" restriction not to
-- apply during the trial. That rule is investor-approved (Round 42/43) and is a
-- DB UNIQUE INDEX, uq_rated_daily_live_per_day, not application logic. It is
-- NOT weakened here, and must never be: its failure mode is unlimited RATED
-- rounds, which is leaderboard fraud.
--
-- It did not need weakening, because the index predicate carries `and is_rated`.
-- An UNRATED attempt is outside it entirely. The spec's other requirement --
-- that trial play must not affect score, ranking or analytics -- points at the
-- same answer. So trial rounds are unrated, and both halves of the spec are
-- satisfied at once with the rated rule untouched.
--
-- WHAT WAS ACTUALLY MISSING. `is_rated` was computed as
-- `(coalesce(p_day,'today') = 'today')` -- ONE boolean carrying two meanings. It
-- selected the round DATE and the set-selection BRANCH as well as ratedness, so
-- "today, fresh draw, unrated" was literally inexpressible. This migration
-- separates v_today from v_rated and adds the third branch. That is the whole
-- change to the attempt path.
--
-- WHY is_free_trial IS NOT A SECOND GATE. It records provenance and nothing
-- reads it to decide scoring -- is_rated stays the single gate. Two booleans
-- that both answer "does this count" disagree eventually, and one missed filter
-- would put trial scores on a leaderboard. It exists so ANALYTICS can exclude
-- trial play; filtering analytics on is_rated instead would also strip the topic
-- tests and replays of every paying family, which is a different feature nobody
-- asked for.
--
-- EXPIRY IS DERIVED, NEVER A JOB. has_subject_access already returns false the
-- instant ends_at passes. A cron that flipped a status would be wrong between
-- runs in the direction of free access, and would create a second source of
-- truth for something the clock already answers.
--
-- Requires migration 139 (the 'trial' entitlement source) to be COMMITTED first.
-- Self-transacting. Backported into canonical 005, 007, 010 and 011.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 - the ledger: one row per child, ever.
-- -----------------------------------------------------------------------------
create table if not exists public.free_trials (
  id                       uuid primary key default gen_random_uuid(),
  student_profile_id       uuid not null references public.students(profile_id) on delete cascade,
  owner_parent_profile_id  uuid not null references public.profiles(id) on delete cascade,
  subject_ids              uuid[] not null,
  activated_at             timestamptz not null default now(),
  ends_at                  timestamptz not null,
  locale                   text not null default 'az',
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- ONCE PER CHILD, guaranteed by the database rather than by a check the
  -- application might skip. A second activation raises unique_violation, which
  -- activate_free_trial catches and reports as trial_already_used.
  --
  -- HONEST LIMIT, stated rather than implied: deleting and recreating the child
  -- resets this, because every per-child table cascades from the auth user. The
  -- existing paid trial has the same hole. The ceiling here is friction, not
  -- prevention, and a per-PARENT lifetime cap was deliberately NOT added -- it
  -- would punish large families to stop an attack nobody has attempted.
  constraint uq_free_trials_student unique (student_profile_id),
  -- The 2-subject cap, in the one place a hand-crafted request cannot route
  -- around. The RPC checks it too; this is the layer that cannot be bypassed.
  constraint ck_free_trial_subjects check (cardinality(subject_ids) between 1 and 2),
  constraint ck_free_trial_window   check (ends_at > activated_at),
  constraint ck_free_trial_locale   check (locale in ('az', 'en', 'ru'))
);

comment on table public.free_trials is
  'The one-time 1-day pre-purchase Free Trial (migration 140). One row per child, '
  'ever. ends_at is the SINGLE source of truth for the countdown and every '
  'notification rung; expiry is DERIVED from it and never written by a job. The '
  'entitlements rows it grants are the access authority -- subject_ids is this '
  'ledger''s own record of what was chosen.';

create index if not exists idx_free_trials_ends_at
  on public.free_trials (ends_at) where cancelled_at is null;
create index if not exists idx_free_trials_parent
  on public.free_trials (owner_parent_profile_id);

-- -----------------------------------------------------------------------------
-- 2 - the attempt provenance column.
-- -----------------------------------------------------------------------------
alter table public.test_attempts
  add column if not exists is_free_trial boolean not null default false;

comment on column public.test_attempts.is_free_trial is
  'Migration 140: this attempt happened under the Free Trial. PROVENANCE ONLY -- '
  'is_rated remains the single gate that decides whether an attempt scores, and '
  'nothing in the leaderboard, points or streak path reads this column. Two '
  'booleans that both answered "does this count" would disagree eventually. It '
  'exists so analytics can exclude trial play WITHOUT excluding the ordinary '
  'practice of paying families. Not in the 010 column grant, so a child cannot '
  'set it.';

-- -----------------------------------------------------------------------------
-- 3 - who may read a trial row.
-- -----------------------------------------------------------------------------
alter table public.free_trials enable row level security;

drop policy if exists "free_trials_select" on public.free_trials;
create policy "free_trials_select" on public.free_trials for select to authenticated
  using (
    student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  );
-- NO insert/update/delete policy, for anyone, ever. Not even admins. Writes go
-- through activate_free_trial() only, exactly as entitlements does it.

revoke all on public.free_trials from anon, authenticated;
grant select on public.free_trials to authenticated;

-- -----------------------------------------------------------------------------
-- 4 - does this subject score? the single reader.
-- -----------------------------------------------------------------------------
create or replace function public.subject_access_is_trial_only(
  p_student uuid,
  p_subject uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_student is null or p_subject is null then return false; end if;

  -- EVERY branch below fails toward RATED, which is the safe direction. A bug
  -- that lets a trial child score shows up on a leaderboard and gets noticed; a
  -- bug that wrongly reports "trial" would silently void a PAYING child's one
  -- rated round of the day, which nobody would report because nothing looks
  -- broken.
  if not exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = p_subject
      and e.source = 'trial'
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then
    return false;
  end if;

  -- A platform-wide campaign makes everyone's rounds rated; the trial must not
  -- silently downgrade a child who would otherwise be scoring.
  if public.is_giveaway_active() then return false; end if;
  if public.is_free_access_active_for_student(p_student) then return false; end if;

  -- PAID ALWAYS WINS. A child who holds a live subscription for this subject
  -- scores, even if a trial grant is also live -- which happens naturally when a
  -- parent buys during the trial day.
  if exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = p_subject
      and e.source <> 'trial'
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.subject_access_is_trial_only(uuid, uuid) is
  'Migration 140: is this subject reachable ONLY through the Free Trial? The '
  'single reader that decides whether today''s round scores. Fails toward RATED '
  'in every branch -- paid, giveaway and admin free-access all win. Takes an '
  'arbitrary student id, so EXECUTE is service_role only (the same split as '
  'has_subject_access).';

revoke all on function public.subject_access_is_trial_only(uuid, uuid) from public, anon, authenticated;
grant execute on function public.subject_access_is_trial_only(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 5 - activation.
-- -----------------------------------------------------------------------------
create or replace function public.activate_free_trial(
  p_parent      uuid,
  p_student     uuid,
  p_subject_ids uuid[],
  p_locale      text default 'az'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_hours  constant int := 24;
  c_max    constant int := 2;
  v_ends   timestamptz;
  v_locale text := case when p_locale in ('az','en','ru') then p_locale else 'az' end;
  v_subj   uuid;
  v_n      int;
begin
  if p_parent is null or p_student is null then
    raise exception 'trial: missing ids' using errcode = 'check_violation';
  end if;

  -- OWNERSHIP FIRST. entitlement_grant performs no ownership check at all -- it
  -- constrains p_student only by the foreign key -- so this cannot be delegated
  -- to it. The parent id arrives from requireParent(), never from a request body.
  if not exists (
    select 1 from public.students s
    where s.profile_id = p_student
      and s.created_by_parent_profile_id = p_parent
  ) then
    raise exception 'trial: not your child' using errcode = 'check_violation',
      hint = 'not_your_child';
  end if;

  v_n := coalesce(cardinality(p_subject_ids), 0);
  if v_n < 1 or v_n > c_max then
    raise exception 'trial: choose between 1 and % subjects', c_max
      using errcode = 'check_violation', hint = 'too_many_subjects';
  end if;
  if v_n <> (select count(distinct x) from unnest(p_subject_ids) x) then
    raise exception 'trial: duplicate subject' using errcode = 'check_violation',
      hint = 'bad_subject';
  end if;

  -- Every chosen subject must be a real, actively priced subject. A subject
  -- nobody can buy afterwards is not a trial, it is a dead end.
  if exists (
    select 1 from unnest(p_subject_ids) x
    where not exists (
      select 1 from public.subjects s
      join public.subjects_pricing sp on sp.subject_id = s.id and sp.status = 'active'
      where s.id = x
    )
  ) then
    raise exception 'trial: unknown or unpriced subject'
      using errcode = 'check_violation', hint = 'bad_subject';
  end if;

  -- DO NOT BURN THE ONE TRIAL ON A CHILD WHO ALREADY HAS EVERYTHING FREE.
  if public.is_giveaway_active()
     or public.is_free_access_active_for_student(p_student) then
    raise exception 'trial: access is already free'
      using errcode = 'check_violation', hint = 'already_free';
  end if;

  if exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = any(p_subject_ids)
      and e.source <> 'trial'
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then
    raise exception 'trial: already covered'
      using errcode = 'check_violation', hint = 'already_covered';
  end if;

  v_ends := now() + make_interval(hours => c_hours);

  -- The unique constraint is the once-only enforcement, not this insert's
  -- success. Two tabs racing collapse onto one row.
  begin
    insert into public.free_trials
      (student_profile_id, owner_parent_profile_id, subject_ids, ends_at, locale)
    values (p_student, p_parent, p_subject_ids, v_ends, v_locale);
  exception when unique_violation then
    raise exception 'trial: already used' using errcode = 'unique_violation',
      hint = 'trial_already_used';
  end;

  -- NOTE the deliberate omissions: no child_subscription_id and no
  -- olympiad_purchase_id, which is what makes these rows invisible to
  -- entitlements_reconcile() -- it only reaps grants it can trace back to a
  -- subscription or a purchase. And assert_payments_enabled() is never called,
  -- so the trial still works while the payments kill switch is off, which is
  -- exactly the pre-launch period when a free trial is most wanted.
  foreach v_subj in array p_subject_ids loop
    perform public.entitlement_grant(
      p_student, 'subject', 'trial',
      'trial:' || p_student::text || ':' || v_subj::text,
      p_subject_id => v_subj,
      p_starts_at  => now(),
      p_ends_at    => v_ends,
      p_granted_by => p_parent,
      p_note       => 'free_trial');
  end loop;

  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (p_parent, 'free_trial.activate', 'free_trials', p_student,
     jsonb_build_object('subjects', cardinality(p_subject_ids), 'ends_at', v_ends),
     'info', true);

  return jsonb_build_object('ends_at', v_ends, 'subject_ids', p_subject_ids);
end;
$$;

comment on function public.activate_free_trial(uuid, uuid, uuid[], text) is
  'Migration 140: activate the one-time 1-day Free Trial for a child. Ownership '
  'is checked HERE because entitlement_grant checks none. Never calls '
  'assert_payments_enabled (the trial must work while payments are off), never '
  'writes students.access_status, and never creates a child_subscriptions row.';

revoke all on function public.activate_free_trial(uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.activate_free_trial(uuid, uuid, uuid[], text) to service_role;

-- -----------------------------------------------------------------------------
-- 6 - caller-scoped reads for the countdown.
-- -----------------------------------------------------------------------------
create or replace function public.child_free_trial(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := public.current_profile_id();
  v_row public.free_trials;
begin
  if v_me is null or p_student is null then
    return jsonb_build_object('active', false);
  end if;

  -- Same reader set as the free_trials RLS policy, restated because this is a
  -- definer function and RLS does not apply to it.
  if not (
    p_student = v_me
    or public.is_parent_linked_to_student(p_student)
    or exists (select 1 from public.students s
               where s.profile_id = p_student
                 and s.created_by_parent_profile_id = v_me)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  ) then
    return jsonb_build_object('active', false);
  end if;

  select * into v_row from public.free_trials
   where student_profile_id = p_student and cancelled_at is null;
  if not found then
    return jsonb_build_object('active', false, 'used', false);
  end if;

  -- EXPIRY IS DERIVED. Nothing flips a status when the clock passes ends_at, so
  -- there is no window in which a job has not yet run and access is wrong.
  return jsonb_build_object(
    'active',   v_row.ends_at > now(),
    'used',     true,
    'ends_at',  v_row.ends_at,
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
                       order by s.name)
      from public.subjects s where s.id = any(v_row.subject_ids)), '[]'::jsonb));
end;
$$;

comment on function public.child_free_trial(uuid) is
  'Migration 140: Free Trial state for one child, for the parent countdown and '
  'the dashboard pill. Caller-scoped and fails closed to {active:false}. Expiry '
  'is DERIVED from ends_at, never from a stored status.';

revoke all on function public.child_free_trial(uuid) from public, anon;
grant execute on function public.child_free_trial(uuid) to authenticated, service_role;


create or replace function public.my_free_trial()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.child_free_trial(public.current_profile_id());
$$;

comment on function public.my_free_trial() is
  'Migration 140: the signed-in child''s own Free Trial state. Delegates to '
  'child_free_trial so the two can never disagree.';

revoke all on function public.my_free_trial() from public, anon;
grant execute on function public.my_free_trial() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7 - the attempt path learns about the trial.
-- -----------------------------------------------------------------------------
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
  -- MIGRATION 140: v_rated used to carry TWO meanings at once -- "is this
  -- today's round" AND "does it score" -- which is why a today/unrated round
  -- was inexpressible before the Free Trial needed one.  They are separate now.
  v_today    boolean := (coalesce(p_day, 'today') = 'today');
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_trial    boolean := false;
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

  -- THE access gate (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1).
  -- Every rule that used to be hand-copied into this function — the giveaway
  -- window, the admin free-access interval, the per-subject subscription join
  -- and its lazy date arithmetic — now lives in ONE reader,
  -- has_subject_access(), which consults public.entitlements first and the two
  -- computed override windows second. Three copies of one predicate drift
  -- within a release; one cannot. The gate still runs BEFORE any row is
  -- created, so a refusal still consumes nothing.
  if not public.has_subject_access(v_student, p_subject_id) then
    raise exception 'daily: no active access' using errcode = 'check_violation';
  end if;

  -- MIGRATION 140 -- DOES TODAY'S ROUND SCORE?
  --
  -- A child whose only access to this subject is the 1-day Free Trial plays
  -- TODAY's fresh set, unlimited, but it must not touch points, percentage,
  -- streak or any leaderboard.  is_rated=false delivers all of that by
  -- construction: uq_rated_daily_live_per_day carries `and is_rated` in its
  -- predicate, so an unrated row is outside the index entirely, and
  -- award_attempt_points returns before writing anything when the attempt is
  -- unrated.  The Round-42/43 rule is untouched -- NOTHING here weakens it.
  --
  -- subject_access_is_trial_only fails toward RATED in every branch: paid
  -- access wins, a giveaway wins, an admin free-access window wins.  A bug that
  -- makes a trial child score is visible on a board; the inverse would silently
  -- void a paying child's only round of the day.
  if v_today then
    v_trial := public.subject_access_is_trial_only(v_student, p_subject_id);
    v_rated := not v_trial;
  end if;

  v_date := (now() at time zone 'Asia/Baku')::date - (case when v_today then 0 else 1 end);

  if v_rated then
    -- Round 43: the day is consumed AT CREATION. Look at today's live/graded
    -- rated attempt: resume an in-progress one; block when it is completed;
    -- otherwise (no attempt yet) draw a fresh set and create it.
    select id, status, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and is_rated and round_date = v_date
      and status in ('in_progress', 'submitted', 'graded')
    order by started_at desc limit 1;
    if v_existing.id is not null then
      if v_existing.status = 'in_progress' then
        -- Untimed: reopen the same attempt (refresh / other tab / resume).
        return jsonb_build_object(
          'attempt_id', v_existing.id, 'resumed', true, 'rated', true,
          'deadline_at', null, 'duration_seconds', null,
          'count', cardinality(v_existing.question_ids));
      end if;
      raise exception 'daily: already attempted today' using errcode = 'unique_violation';
    end if;

    -- Fresh per-student subtopic-balanced draw. A short pool raises HERE, so
    -- the day is never consumed on a failed draw.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
  elsif v_trial then
    -- MIGRATION 140 -- TODAY, UNRATED (Free Trial).
    --
    -- Deliberately NOT the yesterday branch: that one serves the LOCKED
    -- daily_practice_sets row, which replays the identical 25 questions every
    -- time.  A trial is meant to show what the product is like, so each entry
    -- draws a fresh subtopic-balanced set from today's pool.
    --
    -- An in-progress row is resumed (refresh, second tab) but a COMPLETED one
    -- never blocks -- that is what "unlimited during the trial" means, and it
    -- costs nothing because none of these rows score.
    select id, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and not is_rated and round_date = v_date
      and status = 'in_progress'
    order by started_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;

    -- A short pool raises HERE, before any row exists, exactly as the rated
    -- branch does.
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
      select ta.question_ids, 'own' into v_qids, v_source
      from public.test_attempts ta
      where ta.student_profile_id = v_student and ta.subject_id = p_subject_id
        and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
        and ta.round_date = v_date
      order by ta.graded_at desc limit 1;
      if v_qids is null then
        -- A peer's graded set (same subject + GRADE + date, COUNTRY-WIDE;
        -- earliest submit — deterministic; question ids only, no identity).
        select ta.question_ids, 'peer' into v_qids, v_source
        from public.test_attempts ta
        join public.students st on st.profile_id = ta.student_profile_id
        where ta.subject_id = p_subject_id and st.grade_id = v_grade
          and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
          and ta.round_date = v_date
          and coalesce(cardinality(ta.question_ids), 0) > 0
        order by ta.submitted_at asc nulls last, ta.id asc limit 1;
      end if;
      if v_qids is null then
        select dr.question_ids, 'round' into v_qids, v_source
        from public.daily_rounds dr
        where dr.round_date = v_date and dr.subject_id = p_subject_id
          and dr.grade_id = v_grade;
      end if;
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
     deadline_at, duration_seconds, is_rated, round_date, is_free_trial)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_qids,
     null, null, v_rated, v_date, v_trial)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
exception when unique_violation then
  -- A creation race (double tap / two tabs) collapses onto the winning row.
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Round 43: today = RATED per-student subtopic-balanced random 25, UNTIMED, '
  'consumed AT CREATION (uq_rated_daily_live_per_day: one live/graded attempt per '
  'subject+day — resume in-progress, block when completed); a <25 pool raises '
  'before any row is created. yesterday = unlimited UNTIMED practice on the '
  'student''s LOCKED set (own -> peer country-wide by grade -> legacy round -> '
  'generated), never rated. MIGRATION 140: a child whose only access is the '
  '1-day Free Trial plays TODAY unlimited and UNRATED -- a fresh draw each '
  'entry, is_free_trial stamped, outside uq_rated_daily_live_per_day and '
  'invisible to award_attempt_points. The rated rule itself is unchanged.';

revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;

create or replace function public.start_topic_test_attempt(
  p_subject_id   uuid,
  p_topic_ids    uuid[] default '{}',
  p_subtopic_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;    -- owner decision: fixed
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_topics   uuid[] := coalesce(p_topic_ids, '{}');
  v_subs     uuid[] := coalesce(p_subtopic_ids, '{}');
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
begin
  if v_student is null then raise exception 'start_test: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_test: not a student'; end if;

  -- THE access gate (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1).
  -- Every rule that used to be hand-copied into this function — the giveaway
  -- window, the admin free-access interval, the per-subject subscription join
  -- and its lazy date arithmetic — now lives in ONE reader,
  -- has_subject_access(), which consults public.entitlements first and the two
  -- computed override windows second. Three copies of one predicate drift
  -- within a release; one cannot. The gate still runs BEFORE any row is
  -- created, so a refusal still consumes nothing.
  if not public.has_subject_access(v_student, p_subject_id) then
    raise exception 'start_test: no active access' using errcode = 'check_violation';
  end if;

  -- Scope validation: topics must belong to the subject; subtopics to the
  -- chosen topics (and require topics when subtopics are given).
  if cardinality(v_topics) > 50 or cardinality(v_subs) > 100 then
    raise exception 'start_test: scope too large';
  end if;
  if cardinality(v_topics) > 0 and exists (
    select 1 from unnest(v_topics) t(id)
    where not exists (select 1 from public.topics tp where tp.id = t.id and tp.subject_id = p_subject_id)
  ) then
    raise exception 'start_test: topic does not belong to subject';
  end if;
  if cardinality(v_subs) > 0 then
    if cardinality(v_topics) = 0 then
      raise exception 'start_test: subtopics given without topics';
    end if;
    if exists (
      select 1 from unnest(v_subs) s(id)
      where not exists (select 1 from public.subtopics st where st.id = s.id and st.topic_id = any (v_topics))
    ) then
      raise exception 'start_test: subtopic does not belong to the chosen topics';
    end if;
  end if;

  -- Resume: one open practice test at a time. Untimed rows (056+) resume
  -- forever (the 24h cron abandons them); legacy timed rows keep the old
  -- deadline behavior.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'test' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is null or v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', v_existing.duration_seconds);
    end if;
    update public.test_attempts
       set status = 'expired', updated_at = now()
     where id = v_existing.id;
  end if;

  -- Server-random draw, published MCQ-family, general pool, grade-matched;
  -- scoped to the selection, falling back to subject-wide when the scope has
  -- no questions.
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      and (cardinality(v_topics) = 0 or q.topic_id = any (v_topics))
      and (cardinality(v_subs) = 0 or q.subtopic_id = any (v_subs))
    order by random()
    limit c_count
  ) picked;

  if cardinality(v_qids) = 0 and (cardinality(v_topics) > 0 or cardinality(v_subs) > 0) then
    select coalesce(array_agg(id), '{}') into v_qids from (
      select q.id
      from public.questions q
      where q.subject_id = p_subject_id
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.type_id in (
          select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
        )
        and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
        and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      order by random()
      limit c_count
    ) picked;
  end if;

  if cardinality(v_qids) = 0 then
    raise exception 'start_test: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  -- UNTIMED practice (migration 057): no deadline, never rated.
  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids, is_rated,
     is_free_trial)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, null, null, v_topics, v_subs, false,
     -- MIGRATION 140: provenance only. Ratedness is already a literal false
     -- above and stays that way; this records WHY the attempt happened so the
     -- analytics filter can exclude trial play without excluding the practice
     -- of every paying family.
     public.subject_access_is_trial_only(v_student, p_subject_id))
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', false,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
end;
$$;
comment on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) is
  'Subject PRACTICE test (migration 057): mandatory-scope 25-question draw, UNTIMED '
  '(no deadline) and UNRATED (no points/streak/boards). Rated play = daily rounds.';

-- get_test_attempt: rehydration payload (questions + options WITHOUT is_correct,
-- saved answers + flags, server deadline → remaining seconds). Migration 057:
-- daily-round attempts render from the round's immutable snapshot; every
-- payload carries the question 'image' ({bucket,path}, locale-aware, az fallback).

revoke all on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8 - analytics must not count trial play.
-- -----------------------------------------------------------------------------
create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30,
  p_scope text default 'tests',
  p_locale text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  -- Module scope (migration 051): 'tests' (default) or 'olympiads'; unknown
  -- values coerce to 'tests' so pre-051 callers keep working unchanged.
  v_scope text := case when p_scope = 'olympiads' then 'olympiads' else 'tests' end;
  -- Same clamp the question-body RPCs use; an unknown tag reads as Azerbaijani
  -- (migration 114).
  v_loc public.content_locale :=
    (case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end)::public.content_locale;
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  -- COALESCE is load-bearing: current_profile_id() can be NULL (no profile),
  -- which would turn the OR-chain NULL and silently skip an un-coalesced guard.
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
        -- MIGRATION 140: trial play is not this child's performance. Filtering
        -- on is_free_trial rather than is_rated is deliberate -- is_rated would
        -- also strip topic tests and replays out of every PAYING family's
        -- analytics, which is a different feature nobody asked for.
        and not ta.is_free_trial
       and ta.submitted_at >= now() - make_interval(days => v_days)
       and (p_subject_id is null or ta.subject_id = p_subject_id)
       -- Module scope (migration 051): olympiad attempts never mix into the
       -- Subjects analytics and vice versa.
       and ((v_scope = 'olympiads' and ta.kind = 'olympiad')
         or (v_scope = 'tests' and ta.kind <> 'olympiad'))
  ),
  ans as (
    -- answered = a non-empty stored selection; empty selection = SKIPPED
    -- (migration 046 — skipped must never count as wrong).
    select a.attempt_id, a.is_correct,
           coalesce(array_length(a.selected_option_ids, 1), 0) > 0 as answered,
           q.topic_id, q.subtopic_id, q.olympiad_package_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'scope', v_scope,
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
      -- gap-filled last-7-days series (today inclusive)
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      -- accuracy per day over ANSWERED questions only (046); zero-answered days
      -- are omitted (they would otherwise chart as a false 0%).
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
      -- zero-answered topics excluded (046): strongest/weakest must never rank
      -- a topic nobody actually answered. topic_id is part of the group key, so
      -- localizing the label (114) cannot merge two distinct topics.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.answ, 'correct', x.cor,
               'wrong', x.answ - x.cor, 'skipped', x.skp,
               'accuracy', round(x.cor::numeric / nullif(x.answ, 0) * 100, 1))
               order by x.answ desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, coalesce(ttr.name, t.name) as tname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.topic_translations ttr
                       on ttr.topic_id = t.id and ttr.locale = v_loc
               group by a.topic_id, coalesce(ttr.name, t.name)
              having count(*) filter (where a.answered) > 0) x
    ),
    'mistakes', (
      -- Grouped by t.id / st.id, NOT by the names (114). A name-based key would
      -- become locale-dependent — the same rows would merge differently in EN
      -- than in AZ — and it already merged two genuinely distinct subtopics that
      -- happen to share a name. The coalesced names ride along as extra group
      -- keys only because they are functionally determined by the ids.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.answ, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select coalesce(ttr.name, t.name) as tname,
                     coalesce(str.name, st.name, '—') as sname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where a.answered and not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.topic_translations ttr
                       on ttr.topic_id = t.id and ttr.locale = v_loc
                left join public.subtopics st on st.id = a.subtopic_id
                left join public.subtopic_translations str
                       on str.subtopic_id = st.id and str.locale = v_loc
               group by t.id, st.id,
                        coalesce(ttr.name, t.name),
                        coalesce(str.name, st.name, '—')
              having count(*) filter (where a.answered and not a.is_correct) > 0
               order by count(*) filter (where a.answered and not a.is_correct) desc
               limit 10) y
    ),
    'per_package', (
      -- Olympiad scope only (051): per-package breakdown through the attempt
      -- questions' private-pool link. Title in the reader's locale with an az
      -- fallback (114; it used to be hardcoded to az); '[]' under tests scope.
      select coalesce(jsonb_agg(jsonb_build_object(
               'package_id', z.pkg, 'title', z.title,
               'attempts', z.att, 'answered', z.answ, 'correct', z.cor,
               'wrong', z.answ - z.cor, 'skipped', z.skp,
               'accuracy', round(z.cor::numeric / nullif(z.answ, 0) * 100, 1))
               order by z.att desc, z.title), '[]'::jsonb)
        from (select a.olympiad_package_id as pkg,
                     coalesce(
                       (select tr.title from public.olympiad_package_translations tr
                         where tr.olympiad_package_id = a.olympiad_package_id
                           and tr.locale = v_loc limit 1),
                       (select tr.title from public.olympiad_package_translations tr
                         where tr.olympiad_package_id = a.olympiad_package_id
                           and tr.locale = 'az' limit 1),
                       '—') as title,
                     count(distinct a.attempt_id) att,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
               where v_scope = 'olympiads' and a.olympiad_package_id is not null
               group by a.olympiad_package_id) z
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int, text, text) is
  'Per-child analytics over graded attempts in a rolling window, module-scoped '
  '(migration 051): p_scope tests (default; kind<>olympiad) or olympiads (kind=olympiad, '
  'adds per_package). Answer states separated (046): wrong counts only answered-and-'
  'incorrect; skipped is its own metric; accuracy uses answered as the denominator. '
  'p_locale (az/en/ru, default az) localizes topic/subtopic names and package titles. '
  'Callable by admins, the linked parent, or the child.';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int, text, text)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int, text, text)
  to authenticated, service_role;

create or replace function public.get_admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not coalesce(auth.role() = 'service_role' or public.is_admin(), false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'children_total', (select count(*) from public.students),
    'parents_total',  (select count(*) from public.parents),
    'active_children_7d', (
      select count(distinct student_profile_id) from public.test_attempts
       where submitted_at >= now() - interval '7 days'
    ),
    'attempts_30d', (
      select count(*) from public.test_attempts
       where status = 'graded' and not is_free_trial   -- MIGRATION 140
         and submitted_at >= now() - interval '30 days'
    ),
    'platform_accuracy_30d', (
      select round(count(*) filter (where a.is_correct)::numeric
                   / nullif(count(*), 0) * 100, 1)
        from public.test_attempt_answers a
        join public.test_attempts ta on ta.id = a.attempt_id
       where ta.status = 'graded' and not ta.is_free_trial   -- MIGRATION 140
         and ta.submitted_at >= now() - interval '30 days'
    ),
    'questions_published', (
      select count(*) from public.questions
       where status = 'published' and olympiad_package_id is null
    ),
    'active_subscriptions', (
      select count(*) from public.child_subscriptions
       where status in ('trialing', 'active', 'past_due')
    ),
    'signups_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join (select created_at::date dt, count(*) n
                     from public.students group by 1) c on c.dt = d::date
    ),
    'attempts_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 13, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from public.test_attempts
                    where status = 'graded' and not is_free_trial   -- MIGRATION 140
                    group by 1) c on c.dt = d::date
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_admin_platform_overview() is
  'Admin-panel platform KPIs (children/parents/actives/attempts/accuracy/questions/'
  'subscriptions) + 30-day signup and 14-day attempts trends. Admin-only (in-body check).';

revoke all on function public.get_admin_platform_overview() from public, anon;
grant execute on function public.get_admin_platform_overview() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  if to_regclass('public.free_trials') is null then
    raise exception '140: free_trials was not created';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'uq_free_trials_student') then
    raise exception '140: the once-per-child constraint is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_free_trial_subjects') then
    raise exception '140: the 2-subject cap is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='test_attempts' and column_name='is_free_trial'
  ) then
    raise exception '140: test_attempts.is_free_trial is missing';
  end if;

  -- THE RATED RULE MUST STILL BE ARMED. This is the assertion that matters most
  -- in this file: the feature is only safe because this index still exists,
  -- still carries `is_rated` in its predicate, and was not touched.
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='uq_rated_daily_live_per_day'
      and indexdef like '%is_rated%'
  ) then
    raise exception '140: uq_rated_daily_live_per_day is missing or no longer predicated on is_rated';
  end if;

  v_src := pg_get_functiondef('public.start_daily_round_attempt(uuid, text)'::regprocedure);
  if position('subject_access_is_trial_only' in v_src) = 0 then
    raise exception '140: the daily round does not consult the trial gate';
  end if;
  if position('has_subject_access' in v_src) = 0 then
    raise exception '140: the daily round lost its access gate';
  end if;
  -- 013 check 115 greps this body; the gate must stay the ONLY access reader.
  if position('child_subscriptions' in v_src) > 0
     or position('subscription_subjects' in v_src) > 0 then
    raise exception '140: the daily round must not read subscription tables directly';
  end if;

  v_src := pg_get_functiondef('public.get_child_subject_dashboard(uuid, uuid, int, text, text)'::regprocedure);
  if position('is_free_trial' in v_src) = 0 then
    raise exception '140: child analytics still counts trial play';
  end if;

  raise notice '140: the Free Trial is installed, and the rated rule is untouched';
end $$;

commit;
