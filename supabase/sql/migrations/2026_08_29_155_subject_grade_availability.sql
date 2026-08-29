-- =============================================================================
-- 2026_08_29_155 — "WHICH SUBJECTS ARE TAUGHT TO THIS GRADE" BECOMES ONE RULE,
--                  IN THE DATABASE, INSTEAD OF FOUR HAND-WRITTEN COPIES.
--
-- REPORTED: Fizika is a grades 7-11 subject. The web hides it for a younger
-- child; both mobile apps still list it, and tapping it lands on an empty
-- "no questions" screen. Worse, the PURCHASE screens offered it — a parent
-- could buy Physics for a grade-3 child and receive nothing.
--
-- WHY THIS IS A DATABASE CHANGE AND NOT FOUR CLIENT FIXES. The rule already
-- existed, as a hand-written client-side effect added on 2026-08-27 and pasted
-- byte-identically into two web files (lib/childSubjects.ts and
-- app/child/page.tsx). It was never ported to the three independent list
-- builders in the mobile app, which is the whole of the reported bug. A fifth
-- and sixth copy would have failed the same way at the next surface.
--
-- The rule itself is right and stays: a subject is offered to a grade when the
-- curriculum says so — at least one EXAM-scoped topic for that grade — rather
-- than by a hardcoded "fizika starts at 7" floor that nobody maintains when a
-- subject's range changes. What was wrong is WHERE it lived and, in three
-- specific ways, what it said:
--
--   (i)   it ran only inside the `if (freeNow)` branch, so a child on a real
--         subscription or a trial was never grade-filtered at all — the one
--         defect a test would have caught, and the one that reached a paying
--         family;
--   (ii)  its topics query omitted `status = 'active'`, so an ARCHIVED topic
--         kept a subject on offer;
--   (iii) it demanded `grade_id = <child's grade>` exactly, so a SHARED
--         (grade_id IS NULL) topic made a subject VANISH — while every
--         test-setup path in the codebase treats a NULL-grade topic as visible
--         to everyone. Two rules that contradict each other; this one keeps the
--         test-setup reading, because a shared topic is shared by definition.
--
-- SHAPE AND GRANTS follow my_accessible_subjects() (migration 124): STABLE,
-- SECURITY DEFINER, pinned search_path, EXECUTE to authenticated + service_role
-- and an explicit REVOKE from anon and public. Supabase's default privileges
-- grant anon and authenticated, so revoking PUBLIC alone would leave anon able
-- to call these.
--
-- SECURITY DEFINER is not needed for privilege today — public.topics carries a
-- `using (true)` SELECT policy — but it is what makes the answer INDEPENDENT of
-- the caller's RLS slice. That matters the day topic visibility is narrowed:
-- the availability rule must not quietly start returning a different set of
-- subjects per role. Neither function reads anything a caller cannot already
-- read, and neither takes a student, parent or profile id, so there is nothing
-- here to scope to a caller.
--
-- SUBJECT STATUS IS DELIBERATELY NOT CONSULTED. These answer the CURRICULUM
-- question only. Archiving a subject is the admin's own switch and every caller
-- already applies it; folding it in here would mean one predicate answering two
-- unrelated questions, and callers use the result as an intersection filter
-- over a list they have already status-filtered.
--
-- ADMIN SURFACES MUST NOT USE THESE. Admin subject lists are intentionally
-- unfiltered — an administrator manages Fizika's grade-1 curriculum by seeing
-- Fizika while standing on grade 1.
--
-- No table, column or row is touched. Rollback = `drop function` on both.
--
-- Self-transacting. Run bare against staging, then production.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 011_indexes_constraints_functions_triggers.sql — all three
--            functions, their comments and their grants, placed immediately
--            AFTER my_accessible_subjects() (whose style, grants and
--            search_path they follow) and BEFORE the entitlement-mirror trigger
--            block that follows it.
-- Backport status: completed
-- Destructive change: no.
-- =============================================================================
begin;

-- The SET form: every subject the curriculum teaches to this grade. Callers
-- intersect their own (already status-filtered) list against it, which is why
-- it returns bare ids and joins nothing.
--
-- p_grade IS NULL MEANS "NO GRADE RESTRICTION", not "no subjects". students.
-- grade_id is nullable, and the alternative reading would hand a grade-less
-- child an EMPTY catalogue — a total outage for that family — to prevent them
-- seeing a subject the attempt engine would refuse anyway. Fail toward showing
-- too much here; has_subject_access() and the attempt RPCs are the gate that
-- matters.
create or replace function public.subjects_taught_to_grade(p_grade uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct t.subject_id
  from public.topics t
  where t.scope = 'exam'
    and t.status = 'active'
    -- A shared (grade-less) topic belongs to every grade. This is the reading
    -- every test-setup path already uses; the client copy of this rule used
    -- equality and made such a subject disappear instead.
    and (p_grade is null or t.grade_id is null or t.grade_id = p_grade)
$$;

comment on function public.subjects_taught_to_grade(uuid) is
  'THE grade-availability rule (migration 155): the subjects whose curriculum '
  'reaches this grade — at least one ACTIVE, exam-scoped topic for the grade, '
  'or a shared (grade-less) one. Callers intersect their own list against it, '
  'so subject status is deliberately not consulted here. A NULL grade means no '
  'restriction, never an empty catalogue. Admin surfaces must stay unfiltered.';

revoke all on function public.subjects_taught_to_grade(uuid) from public, anon;
grant execute on function public.subjects_taught_to_grade(uuid) to authenticated, service_role;

-- The SINGLE-SUBJECT form, for re-checking one id that arrived from a URL, a
-- deep link or a stale cache. A route must never trust that a subject id was
-- only reachable from a filtered list, and asking this is cheaper than
-- rebuilding the whole set to look for one member.
create or replace function public.subject_taught_to_grade(p_subject uuid, p_grade uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.topics t
    where t.subject_id = p_subject
      and t.scope = 'exam'
      and t.status = 'active'
      and (p_grade is null or t.grade_id is null or t.grade_id = p_grade)
  )
$$;

comment on function public.subject_taught_to_grade(uuid, uuid) is
  'Migration 155: the one-subject form of subjects_taught_to_grade, for '
  'server-side re-checks of a subject id taken from a URL or a stale client '
  'cache. Same predicate, so the two can never drift.';

revoke all on function public.subject_taught_to_grade(uuid, uuid) from public, anon;
grant execute on function public.subject_taught_to_grade(uuid, uuid) to authenticated, service_role;

-- The CALLER-SCOPED form, for the signed-in child's own screens — the same
-- split as my_accessible_subjects() over has_subject_access(). It exists so a
-- student surface does not have to fetch its own grade first and thread it
-- through three query layers just to filter a list.
--
-- A caller with no students row (a parent, an admin) resolves to a NULL grade
-- and therefore to NO restriction. That is deliberate: a parent's leaderboard
-- and analytics filters span children of different grades, and narrowing them
-- to one child's curriculum would be wrong. Parent PURCHASE screens must pass
-- the CHILD's grade explicitly to subjects_taught_to_grade instead.
--
-- plpgsql rather than sql: it reads a value and then calls the set-returning
-- rule with it, which is the one thing a plain SQL body cannot express without
-- restating the predicate — and a second copy of the predicate is the defect
-- this migration exists to remove.
create or replace function public.my_taught_subjects()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grade uuid;
begin
  select st.grade_id into v_grade
  from public.students st
  where st.profile_id = public.current_profile_id();

  return query select * from public.subjects_taught_to_grade(v_grade);
end;
$$;

comment on function public.my_taught_subjects() is
  'Migration 155: the CURRENT student''s grade-appropriate subjects, by '
  'subjects_taught_to_grade. Caller-scoped through current_profile_id(); a '
  'caller who is not a student resolves to a NULL grade and so to no '
  'restriction, which is what a parent''s cross-child filters need. Parent '
  'purchase screens must pass the child''s grade explicitly instead.';

revoke all on function public.my_taught_subjects() from public, anon;
grant execute on function public.my_taught_subjects() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICATION. The grants, then the reported case itself: Fizika must resolve
-- to grades 7-11 and to no grade below that.
-- -----------------------------------------------------------------------------
do $$
declare
  v_fizika uuid;
  v_topics int;
  v_bad    text;
begin
  if has_function_privilege('anon', 'public.subjects_taught_to_grade(uuid)', 'execute')
     or has_function_privilege('anon', 'public.subject_taught_to_grade(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_taught_subjects()', 'execute') then
    raise exception '155: anon can execute the grade-availability functions';
  end if;
  if not has_function_privilege('authenticated', 'public.subjects_taught_to_grade(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.subject_taught_to_grade(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.my_taught_subjects()', 'execute') then
    raise exception '155: authenticated cannot execute the grade-availability functions';
  end if;

  -- Subject CODES here are legacy and misleading (the subject NAMED "Məntiq"
  -- carries the code "az_language"), so this asserts on the code that Physics
  -- actually has and never infers a subject from a code that looks right.
  select id into v_fizika from public.subjects where code = 'fizika';
  if v_fizika is null then
    raise notice '155: no subject with code fizika here — content assertion skipped';
    return;
  end if;

  select count(*) into v_topics
  from public.topics
  where subject_id = v_fizika and scope = 'exam' and status = 'active';
  if v_topics = 0 then
    -- A schema-only database (staging bootstrap) has no curriculum. Skipping is
    -- correct there; failing would make every fresh build look broken.
    raise notice '155: fizika carries no active exam topic here — content assertion skipped';
    return;
  end if;

  select string_agg(g.level::text, ', ' order by g.level) into v_bad
  from public.grades g
  where g.level between 7 and 11
    and not public.subject_taught_to_grade(v_fizika, g.id);
  if v_bad is not null then
    raise exception
      '155: fizika is NOT offered to grade(s) % — those grades have no active exam topic for it',
      v_bad;
  end if;

  select string_agg(g.level::text, ', ' order by g.level) into v_bad
  from public.grades g
  where g.level between 1 and 6
    and public.subject_taught_to_grade(v_fizika, g.id);
  if v_bad is not null then
    -- Only two things can cause this: a fizika exam topic filed under a junior
    -- grade, or one with a NULL grade_id (shared = every grade). Both are
    -- content to fix, not a reason to weaken the predicate.
    raise exception
      '155: fizika is STILL offered to grade(s) % — check for a fizika exam topic with that grade or a NULL grade_id',
      v_bad;
  end if;

  raise notice '155: fizika resolves to grades 7-11 only (% active exam topics)', v_topics;
end $$;

commit;
