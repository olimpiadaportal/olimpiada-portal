-- =============================================================================
-- 2026_07_26_090_olympiad_question_rotation.sql
-- =============================================================================
-- Round 49 (owner): OLYMPIAD ATTEMPTS GET A CONFIGURABLE SIZE AND A REAL
-- PER-STUDENT ROTATION.
--
-- WHAT WAS WRONG
--   * olympiad_packages.questions_per_attempt has existed since 015 but has
--     been DEAD CONFIG since migration 057: the admin form never wrote it and
--     start_olympiad_attempt ignored it, serving the WHOLE published pool of
--     the entitled grade in random order on every single attempt.
--   * Because every attempt drew the whole pool, a student retaking a package
--     (olympiads are unlimited-retake PRACTICE since Round 48 / migration 088)
--     saw the SAME questions again and again. A 500-question package was a
--     500-question sitting, and there was no notion of "already seen".
--
-- WHAT THIS MIGRATION DOES
--   1. Makes questions_per_attempt LIVE: each attempt serves exactly that many
--      questions, and fewer ONLY when the whole entitled-grade pool is smaller
--      than the configured count (then the whole pool is served).
--   2. Adds PER (student, package, grade) rotation state so a student keeps
--      getting UNSEEN questions until that grade's pool is exhausted, at which
--      point THAT STUDENT's cycle resets and a fresh cycle starts from the full
--      pool. One student's consumption can never affect another's.
--   3. Handles the non-divisible boundary atomically: with a 520 pool and a
--      count of 50, the 11th attempt serves the 20 remaining unseen PLUS 30
--      drawn from a freshly started cycle, with NO duplicate inside the attempt.
--   4. Serialises the whole read-unseen -> select -> create attempt -> mark
--      consumed sequence behind a SELECT ... FOR UPDATE on the rotation row, so
--      two tabs / a double tap can never consume overlapping question sets.
--      Row locking is deliberate: the codebase runs on READ COMMITTED and must
--      not depend on SERIALIZABLE retries.
--   5. Validates the configuration SERVER-SIDE: questions_per_attempt has a
--      sane range, and a package cannot be ACTIVATED while any target grade's
--      published pool holds fewer questions than the configured count.
--
-- WHAT IS DELIBERATELY UNTOUCHED
--   * Grade isolation (Round 34): the entitled-grade resolution (purchase
--     snapshot -> current grade -> the single legacy target grade -> raise
--     'package does not cover your grade') and the pool filter are copied
--     BYTE-FOR-BYTE from the live definition. A NULL v_pool_grade still means a
--     legacy grade-less package = the whole pool.
--   * The TRUE-resume path: an in-progress attempt is returned as-is with its
--     stored question_ids, so a refresh replays the identical list and consumes
--     nothing. Existing attempt rows are never rewritten by this change.
--   * Olympiad TIMING (packages keep their own duration_minutes) and Round 48
--     practice-only scoring (award_attempt_points is not touched here).
--   * Attempt HISTORY: a cycle reset only rewrites the rotation row's
--     seen-question array; no test_attempts / test_attempt_answers row is ever
--     deleted or modified by it.
--
-- Rerun-safe: yes (create table/index/policy IF NOT EXISTS, CREATE OR REPLACE
-- for every function, drop-and-create for every trigger, guarded constraint
-- swap; the PART-B backfill touches only rows still at the never-admin-written
-- default of 25 and only widens, so a rerun is a no-op).
-- Destructive change: no. The only DROP is a CHECK constraint that is
-- immediately re-added in a TIGHTER form (> 0  ->  between 1 and 500); no data
-- is removed and no existing row violates the new bound.
-- Environment first applied: development
-- Related root SQL file(s):
--   supabase/sql/015_olympiad_preparation.sql  -- rotation table + tightened
--                                                 questions_per_attempt check
--   supabase/sql/010_rls_policies.sql          -- rotation table RLS
--   supabase/sql/011_indexes_constraints_functions_triggers.sql
--                                              -- start_olympiad_attempt,
--                                                 assert_olympiad_pool_meets_per_attempt,
--                                                 olympiad_activation_pool_guard + trigger
--   supabase/sql/013_validation_queries.sql    -- new check #85
-- Backport status: pending
-- Rollback notes: drop trg_olympiad_activation_pool_guard, restore the previous
--   start_olympiad_attempt body from migration 079 (its Round-34 version, which
--   drew the whole pool), and drop public.olympiad_question_rotations. Dropping
--   the rotation table loses only "which questions this student has already
--   seen" -- no attempt, answer, purchase or points row depends on it.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Configuration bound: questions_per_attempt must be sane.
-- -----------------------------------------------------------------------------
-- The column already carried `check (questions_per_attempt > 0)`. Now that the
-- value is actually SERVED, an unbounded integer is a footgun (a typo of 99999
-- would silently mean "the whole pool, forever"). 500 is the ceiling: high
-- enough that a genuinely huge package can still be served whole (the old
-- behaviour was "serve everything"), low enough to reject nonsense.
do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.olympiad_packages'::regclass
                and conname  = 'olympiad_packages_questions_per_attempt_check') then
    alter table public.olympiad_packages
      drop constraint olympiad_packages_questions_per_attempt_check;
  end if;
  alter table public.olympiad_packages
    add constraint olympiad_packages_questions_per_attempt_check
    check (questions_per_attempt >= 1 and questions_per_attempt <= 500);
end
$$;

comment on column public.olympiad_packages.questions_per_attempt is
  'Round 49: LIVE again. Number of questions served per olympiad attempt '
  '(1..500). start_olympiad_attempt serves exactly this many, or the whole '
  'entitled-grade pool when the pool is smaller. A package cannot be ACTIVATED '
  'while any target grade holds fewer published questions than this value.';


-- -----------------------------------------------------------------------------
-- 2) Rotation state: PER (student, package, grade).
-- -----------------------------------------------------------------------------
-- One row per student per package per entitled grade. grade_id is NULL only for
-- legacy grade-less packages (the whole-pool path preserved from Round 34);
-- NULLS NOT DISTINCT keeps that case to exactly one row per student+package.
--
-- seen_question_ids is the set consumed SO FAR IN THE CURRENT CYCLE. It is
-- rewritten (not appended to) when a cycle resets, which is what makes the
-- reset atomic -- there is no second table to keep in step.
create table if not exists public.olympiad_question_rotations (
  id                  uuid primary key default gen_random_uuid(),
  student_profile_id  uuid not null references public.students (profile_id) on delete cascade,
  olympiad_package_id uuid not null references public.olympiad_packages (id) on delete cascade,
  grade_id            uuid references public.grades (id) on delete cascade,
  cycle_no            int not null default 1 check (cycle_no > 0),
  seen_question_ids   uuid[] not null default '{}',
  attempts_drawn      int not null default 0 check (attempts_drawn >= 0),
  last_drawn_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.olympiad_question_rotations is
  'Round 49: per-student, per-package, per-GRADE olympiad question rotation. '
  'seen_question_ids = the ids already served inside cycle_no; when the cycle '
  'is exhausted start_olympiad_attempt increments cycle_no and starts a fresh '
  'cycle over the full pool. Written ONLY by start_olympiad_attempt (SECURITY '
  'DEFINER) under a row lock; students may read their own row.';

comment on column public.olympiad_question_rotations.grade_id is
  'Entitled grade pool this rotation belongs to. NULL = legacy grade-less '
  'package (whole-pool path). NULLS NOT DISTINCT on the unique index keeps the '
  'NULL case single-rowed.';

-- The lock key. NULLS NOT DISTINCT (PG 15+) is what lets the legacy
-- grade-less row participate in ON CONFLICT / unique-violation retry.
create unique index if not exists uq_olympiad_rotation_student_pkg_grade
  on public.olympiad_question_rotations (student_profile_id, olympiad_package_id, grade_id)
  nulls not distinct;

create index if not exists idx_olympiad_rotation_package
  on public.olympiad_question_rotations (olympiad_package_id);

drop trigger if exists trg_set_updated_at on public.olympiad_question_rotations;
create trigger trg_set_updated_at
  before update on public.olympiad_question_rotations
  for each row execute function public.set_updated_at();

alter table public.olympiad_question_rotations enable row level security;

drop policy if exists "olympiad_rotations_select_own" on public.olympiad_question_rotations;
create policy "olympiad_rotations_select_own" on public.olympiad_question_rotations
  for select to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin());

-- No insert/update/delete policy: the definer function is the single writer.
-- Belt and braces on top of RLS -- a student must never be able to wipe their
-- own rotation row to farm repeats, even if a policy is added carelessly later.
revoke insert, update, delete, truncate
  on public.olympiad_question_rotations from anon, authenticated;
revoke select on public.olympiad_question_rotations from anon;
grant  select on public.olympiad_question_rotations to authenticated;
grant  all    on public.olympiad_question_rotations to service_role;


-- -----------------------------------------------------------------------------
-- 3) Activation validation: every target grade must be able to FILL an attempt.
-- -----------------------------------------------------------------------------
-- Message shape is the owner's, in Azerbaijani, e.g.
--   "6-cı sinif üçün 35 sual yüklənib. Paket üzrə sual sayı 50 olduğu üçün
--    ən azı 50 sual tələb olunur."
-- HINT carries a stable machine key and DETAIL a JSON payload
-- (grade_level / grade_id / pool / required) so admin-panel can render the en
-- and ru variants itself instead of parsing the sentence.
create or replace function public.assert_olympiad_pool_meets_per_attempt(
  p_package_id  uuid,
  p_per_attempt int,
  p_grade_id    uuid default null       -- null = validate EVERY target grade
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_need  int := greatest(coalesce(p_per_attempt, 1), 1);
  v_pool  int;
  v_sfx   text;
  r       record;
begin
  -- Legacy grade-less package (no target-grade rows): the WHOLE published pool
  -- has to fill an attempt, because that is exactly what such a package serves.
  if not exists (select 1 from public.olympiad_package_grades g
                  where g.olympiad_package_id = p_package_id) then
    select count(*)::int into v_pool
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published';
    if v_pool < v_need then
      raise exception
        'Paketə % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        v_pool, v_need, v_need
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', null, 'grade_id', null,
                                           'pool', v_pool, 'required', v_need)::text;
    end if;
    return;
  end if;

  for r in
    select g.grade_id                    as grade_id,
           gr.level::int                 as level,
           (select count(*)::int
              from public.questions q
             where q.olympiad_package_id = p_package_id
               and q.status = 'published'
               and q.grade_id = g.grade_id) as pool
    from public.olympiad_package_grades g
    join public.grades gr on gr.id = g.grade_id
    where g.olympiad_package_id = p_package_id
      and (p_grade_id is null or g.grade_id = p_grade_id)
    order by gr.level
  loop
    if r.pool < v_need then
      -- Azerbaijani ordinal suffix by vowel harmony of the spoken numeral:
      -- üç/dörd -> cü, altı -> cı, doqquz/on -> cu, everything else -> ci.
      -- grades.level is constrained to 1..11, so this covers the whole domain.
      v_sfx := case r.level
                 when 3  then 'cü'
                 when 4  then 'cü'
                 when 6  then 'cı'
                 when 9  then 'cu'
                 when 10 then 'cu'
                 else 'ci'
               end;
      raise exception
        '%-% sinif üçün % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        r.level, v_sfx, r.pool, v_need, v_need
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', r.level, 'grade_id', r.grade_id,
                                           'pool', r.pool, 'required', v_need)::text;
    end if;
  end loop;
end;
$$;

comment on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid) is
  'Round 49: raises check_violation (hint olympiad_pool_below_per_attempt, '
  'DETAIL = JSON {grade_level, grade_id, pool, required}) when a target grade''s '
  'published pool cannot fill one attempt of p_per_attempt questions. '
  'service-internal: reached only through olympiad_activation_pool_guard().';

revoke all on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  to service_role;

-- Guard fires on the ACTIVATION itself, never on unrelated edits.
-- SECURITY DEFINER so the pool count is the TRUE count: questions is an
-- RLS-protected table and the guard must never pass because rows were hidden
-- from the caller (same reasoning as get_olympiad_pool_counts). Running as the
-- owner is also what lets it call the service-role-only validator above.
create or replace function public.olympiad_activation_pool_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'active'::public.catalog_status then
    return new;
  end if;

  -- An ALREADY-active package must stay editable: changing the price, banner,
  -- sale window or event date is not an activation and must not be blocked by a
  -- pool that predates this rule. Only a transition INTO active, or a raise of
  -- questions_per_attempt while active, is re-validated.
  if tg_op = 'UPDATE'
     and old.status = new.status
     and old.questions_per_attempt = new.questions_per_attempt then
    return new;
  end if;

  perform public.assert_olympiad_pool_meets_per_attempt(new.id, new.questions_per_attempt);
  return new;
end;
$$;

comment on function public.olympiad_activation_pool_guard() is
  'Round 49: blocks activating (or raising questions_per_attempt on) an '
  'olympiad package whose target-grade pool cannot fill one attempt. Unrelated '
  'edits to an already-active package pass through untouched.';

drop trigger if exists trg_olympiad_activation_pool_guard on public.olympiad_packages;
create trigger trg_olympiad_activation_pool_guard
  before insert or update on public.olympiad_packages
  for each row execute function public.olympiad_activation_pool_guard();


-- -----------------------------------------------------------------------------
-- 4) start_olympiad_attempt: configurable size + non-repeating rotation.
-- -----------------------------------------------------------------------------
-- This body is the LIVE definition (pg_get_functiondef) with four deliberate
-- edits and nothing else:
--   (a) the package SELECT also reads questions_per_attempt;
--   (b) a rotation-row get-or-create + FOR UPDATE lock is taken right after the
--       grade is resolved and BEFORE the resume check -- so a second tab that
--       arrives mid-flight blocks, then sees the winner's in-progress attempt
--       and RESUMES it instead of drawing a second set;
--   (c) the "all published questions" SELECT becomes the CANDIDATE POOL, and
--       the served set is drawn from it through the rotation algorithm;
--   (d) the rotation row is written back and the payload gains cycle metadata.
-- Everything else -- authentication, the purchase-only gate, grade resolution,
-- resume/expire handling, attempt + answer-row creation -- is byte-identical.
CREATE OR REPLACE FUNCTION public.start_olympiad_attempt(p_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_student    uuid := public.current_profile_id();
  v_pkg        record;
  v_duration   int;
  v_existing   record;
  v_qids       uuid[];
  v_attempt    uuid;
  v_deadline   timestamptz;
  v_grades     uuid[];
  v_buy_grade  uuid;
  v_cur_grade  uuid;
  v_pool_grade uuid;
  -- Round 49: rotation state. Declared `record`, NOT the table's composite
  -- type: canonical run order creates this function (011) BEFORE the rotation
  -- table (015), and a declared composite type must exist at compile time.
  v_rot        record;
  v_tries      int := 0;
  v_pool       uuid[];
  v_seen       uuid[];
  v_pick1      uuid[] := '{}';
  v_pick2      uuid[] := '{}';
  v_n          int;
  v_k          int;
  v_cycle      int;
  v_reset      boolean := false;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;

  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  select grade_id into v_buy_grade
  from public.olympiad_purchases
  where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active';
  if not found then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  -- Round 49: questions_per_attempt is LIVE again (dead config since 057).
  select id, subject_id, coalesce(duration_minutes, 25) as dur_min,
         greatest(least(coalesce(questions_per_attempt, 25), 500), 1) as n_per
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  v_duration := v_pkg.dur_min * 60;

  -- Round 34: resolve WHICH grade's pool this child is entitled to.
  --   purchase snapshot → current grade → the only target grade (legacy
  --   single-grade purchases made before the snapshot column) → error.
  -- Empty target set = legacy grade-less package → whole pool (old behavior).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    select grade_id into v_cur_grade from public.students where profile_id = v_student;
    if v_buy_grade is not null and v_buy_grade = any(v_grades) then
      v_pool_grade := v_buy_grade;
    elsif v_cur_grade is not null and v_cur_grade = any(v_grades) then
      v_pool_grade := v_cur_grade;
    elsif cardinality(v_grades) = 1 then
      v_pool_grade := v_grades[1];
    else
      raise exception 'olympiad: package does not cover your grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
  end if;

  -- Round 49 — ROTATION LOCK. Get-or-create this student's rotation row for
  -- (package, entitled grade) and hold a row lock for the rest of the call.
  -- Everything below (resume check, unseen read, draw, attempt creation,
  -- consumption write) therefore runs SERIALLY per student+package+grade, so
  -- two tabs cannot consume overlapping question sets. The loop is the standard
  -- upsert race handler: the loser of an insert race retries once and locks the
  -- winner's row. It is bounded, so it can never spin.
  loop
    v_tries := v_tries + 1;
    if v_tries > 3 then
      raise exception 'olympiad: rotation lock contention' using errcode = 'lock_not_available';
    end if;
    select * into v_rot
    from public.olympiad_question_rotations
    where student_profile_id  = v_student
      and olympiad_package_id = p_package_id
      and grade_id is not distinct from v_pool_grade
    for update;
    exit when found;
    begin
      insert into public.olympiad_question_rotations
        (student_profile_id, olympiad_package_id, grade_id)
      values (v_student, p_package_id, v_pool_grade);
    exception when unique_violation then
      null;   -- a concurrent starter created it; loop and lock THAT row
    end;
  end loop;

  -- TRUE resume: one open olympiad attempt at a time (test-engine parity).
  -- Runs under the rotation lock, so the losing tab of a race lands here and
  -- replays the winner's identical question list instead of drawing again.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'olympiad' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', coalesce(v_existing.duration_seconds, v_duration));
    end if;
    update public.test_attempts
       set status = (case when v_existing.deadline_at is null
                          then 'abandoned' else 'expired' end)::public.attempt_status,
           updated_at = now()
     where id = v_existing.id;
  end if;

  -- CANDIDATE POOL: all published questions of the ENTITLED GRADE's pool
  -- (Round 34: never another grade's questions). Round 49: this is no longer
  -- the served set — the rotation below picks questions_per_attempt of it.
  select coalesce(array_agg(q.id), '{}') into v_pool
  from public.questions q
  where q.olympiad_package_id = p_package_id
    and q.status = 'published'
    and (v_pool_grade is null or q.grade_id = v_pool_grade)
    and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct);

  if cardinality(v_pool) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  -- Never ask for more than exists: a pool smaller than the configured count
  -- serves the WHOLE pool. This is also what makes the algorithm terminating —
  -- v_n <= |pool| guarantees the top-up below always finds enough candidates.
  v_n := least(v_pkg.n_per, cardinality(v_pool));

  -- Prune consumed ids that have LEFT the pool (archived or unpublished since).
  -- Without this the stored set could exceed the pool and the cycle would never
  -- appear exhausted.
  select coalesce(array_agg(s), '{}') into v_seen
  from unnest(v_rot.seen_question_ids) s
  where s = any(v_pool);

  -- Up to v_n UNSEEN questions from the student's CURRENT cycle.
  select coalesce(array_agg(t.id), '{}') into v_pick1
  from (select p as id
        from unnest(v_pool) p
        where not (p = any(v_seen))
        order by random()
        limit v_n) t;
  v_k := coalesce(cardinality(v_pick1), 0);

  if v_k >= v_n then
    v_seen  := v_seen || v_pick1;
    v_cycle := v_rot.cycle_no;
  else
    -- CYCLE BOUNDARY — atomic because it happens inside the same row lock and
    -- the same statement/transaction as the attempt insert. The current cycle
    -- is exhausted: serve what is left of it, then top up from a FRESH cycle
    -- over the full pool, EXCLUDING what this attempt already holds so nothing
    -- repeats inside the attempt (520 pool / 50 per attempt -> 20 + 30).
    v_reset := true;
    select coalesce(array_agg(t.id), '{}') into v_pick2
    from (select p as id
          from unnest(v_pool) p
          where not (p = any(v_pick1))
          order by random()
          limit (v_n - v_k)) t;
    -- The carry-over questions count as consumed in the NEW cycle as well.
    -- Otherwise they would be eligible again on the very NEXT attempt, i.e. the
    -- same question in two consecutive sittings.
    v_seen  := v_pick1 || v_pick2;
    v_cycle := v_rot.cycle_no + 1;
  end if;

  -- Shuffle the union so a boundary attempt does not present the old cycle's
  -- leftovers as a leading block.
  select coalesce(array_agg(t.id), '{}') into v_qids
  from (select x as id from unnest(v_pick1 || v_pick2) x order by random()) t;

  if cardinality(v_qids) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  v_deadline := now() + make_interval(secs => v_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, is_rated)
  values
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, true)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  -- Mark consumption LAST, still under the row lock: if anything above raised,
  -- the whole call rolls back and nothing was consumed.
  update public.olympiad_question_rotations
     set seen_question_ids = v_seen,
         cycle_no          = v_cycle,
         attempts_drawn    = attempts_drawn + 1,
         last_drawn_at     = now()
   where id = v_rot.id;

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', v_duration,
    'count', cardinality(v_qids),
    'cycle', v_cycle, 'cycle_reset', v_reset,
    'pool_size', cardinality(v_pool));
end;
$function$;

comment on function public.start_olympiad_attempt(uuid) is
  'Round 49: purchase-gated olympiad start. Serves exactly '
  'questions_per_attempt questions from the ENTITLED GRADE''s published pool '
  '(the whole pool when it is smaller), never repeating a question inside an '
  'attempt and never repeating across attempts until that student''s cycle for '
  '(package, grade) is exhausted -- then the cycle resets and a fresh one '
  'starts from the full pool. Rotation is per student, held under a '
  'SELECT ... FOR UPDATE row lock, so concurrent tabs resume one attempt '
  'instead of consuming twice. Attempts stay practice-only (Round 48).';

revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) PART B — one-time behaviour-preserving backfill (main-session review).
-- -----------------------------------------------------------------------------
-- Every existing package carries questions_per_attempt = 25: the DB default the
-- admin form never wrote. Under the old function that number was DEAD (attempts
-- served the whole pool); the moment this migration applies it becomes LIVE and
-- a 50-question package would silently start serving 25 — behaviour changing
-- under the owner's feet mid-testing. Backfill each such package to its LARGEST
-- per-grade published pool (whole pool for legacy grade-less rows): every grade
-- then still serves its whole pool (v_n = least(n_per, |pool|)), i.e. exactly
-- the pre-090 behaviour, until the owner deliberately sets the new admin field.
--
-- Guards: only the never-admin-written default (= 25) is touched, only widened
-- (> 25), and the activation trigger is suspended around the UPDATE — raising
-- per-attempt on an ACTIVE multi-grade package whose grade pools are UNEQUAL
-- would otherwise be (correctly) rejected by the very guard this migration
-- installs, but this repair intentionally reproduces legacy semantics.
do $$
begin
  execute 'alter table public.olympiad_packages disable trigger trg_olympiad_activation_pool_guard';

  update public.olympiad_packages p
     set questions_per_attempt = least(500, x.pool_max)
    from (
      select pkg.id,
             coalesce(
               (select max(gp.pool)
                  from (select (select count(*)
                                  from public.questions q
                                 where q.olympiad_package_id = pkg.id
                                   and q.status = 'published'
                                   and q.grade_id = g.grade_id) as pool
                          from public.olympiad_package_grades g
                         where g.olympiad_package_id = pkg.id) gp),
               (select count(*)
                  from public.questions q
                 where q.olympiad_package_id = pkg.id
                   and q.status = 'published')
             ) as pool_max
        from public.olympiad_packages pkg
    ) x
   where p.id = x.id
     and p.questions_per_attempt = 25
     and x.pool_max > 25;

  execute 'alter table public.olympiad_packages enable trigger trg_olympiad_activation_pool_guard';
end
$$;

-- =============================================================================
-- Validation (also lands in 013 as check #85):
--
--   select '85_olympiad_question_rotation' as check_name,
--          case when to_regclass('public.olympiad_question_rotations') is not null
--                and exists (select 1 from pg_indexes where schemaname='public'
--                             and indexname='uq_olympiad_rotation_student_pkg_grade')
--                and exists (select 1 from pg_trigger
--                             where tgname='trg_olympiad_activation_pool_guard'
--                               and tgrelid='public.olympiad_packages'::regclass)
--                and position('for update' in
--                      pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
--                and position('v_pkg.n_per' in
--                      pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure)) > 0
--                and exists (select 1 from pg_constraint
--                             where conrelid='public.olympiad_packages'::regclass
--                               and conname='olympiad_packages_questions_per_attempt_check'
--                               and pg_get_constraintdef(oid) like '%500%')
--               then 'PASS' else 'FAIL' end as status;
-- =============================================================================
-- End of 2026_07_26_090_olympiad_question_rotation.sql
-- =============================================================================
