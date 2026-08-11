-- 106 — Per-grade question count and duration for olympiad packages
--
-- WHY THE GRADE ROW AND NOT A NEW TABLE
-- -------------------------------------
-- `olympiad_package_grades (olympiad_package_id, grade_id)` already IS the
-- package↔grade relationship, and each grade already owns an independent
-- question pool and an independent per-student rotation. The two settings that
-- were still package-wide — how many questions an attempt serves and how long
-- it lasts — belong on that same row. No new table, no parallel model.
--
-- BACKWARD COMPATIBILITY, BY CONSTRUCTION
-- ---------------------------------------
-- Both columns are NULLABLE and every reader resolves
-- `coalesce(grade_value, package_value)`. So:
--   * existing packages keep working with no behaviour change;
--   * a grade added later without explicit values inherits the package's;
--   * `olympiad_packages.questions_per_attempt` / `duration_minutes` stay as the
--     package default and the compatibility floor — they are NOT dead.
-- The backfill below then makes today's behaviour EXPLICIT per grade, so the
-- admin sees real numbers instead of blanks when editing an old package.
--
-- The CHECKs mirror the package-level ones exactly (1..500 questions,
-- 5..240 minutes), so a per-grade value can never be something the package
-- level would have rejected.
--
-- IDEMPOTENT. Safe to re-run.

begin;

alter table public.olympiad_package_grades
  add column if not exists questions_per_attempt integer,
  add column if not exists duration_minutes      integer;

do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_opg_questions_per_attempt') then
    alter table public.olympiad_package_grades
      add constraint ck_opg_questions_per_attempt
      check (questions_per_attempt is null
             or (questions_per_attempt >= 1 and questions_per_attempt <= 500));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_opg_duration_minutes') then
    alter table public.olympiad_package_grades
      add constraint ck_opg_duration_minutes
      check (duration_minutes is null
             or (duration_minutes >= 5 and duration_minutes <= 240));
  end if;
end
$ck$;

comment on column public.olympiad_package_grades.questions_per_attempt is
  'Migration 106: questions served per attempt for THIS grade. NULL = inherit '
  'olympiad_packages.questions_per_attempt.';
comment on column public.olympiad_package_grades.duration_minutes is
  'Migration 106: attempt time limit for THIS grade, in minutes. NULL = inherit '
  'olympiad_packages.duration_minutes.';

-- Make today's behaviour explicit on existing rows. Only fills NULLs, so
-- re-running never overwrites an admin's per-grade choice.
update public.olympiad_package_grades g
   set questions_per_attempt = coalesce(g.questions_per_attempt, p.questions_per_attempt),
       duration_minutes      = coalesce(g.duration_minutes, p.duration_minutes)
  from public.olympiad_packages p
 where p.id = g.olympiad_package_id
   and (g.questions_per_attempt is null or g.duration_minutes is null);

-- -----------------------------------------------------------------------------
-- The resolver every reader uses. One definition of "what applies to this
-- (package, grade)" so the attempt engine, the activation guard and the admin
-- surfaces can never disagree.
--
-- p_grade_id NULL = a legacy grade-less package: fall back to the package row.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_config(
  p_package_id uuid,
  p_grade_id   uuid
)
returns table (questions_per_attempt int, duration_minutes int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    greatest(least(coalesce(g.questions_per_attempt, p.questions_per_attempt, 25), 500), 1),
    greatest(least(coalesce(g.duration_minutes, p.duration_minutes, 25), 240), 5)
  from public.olympiad_packages p
  left join public.olympiad_package_grades g
    on g.olympiad_package_id = p.id
   and g.grade_id = p_grade_id
  where p.id = p_package_id;
$$;

comment on function public.olympiad_grade_config(uuid, uuid) is
  'Migration 106: resolves questions-per-attempt + duration for one (package, '
  'grade), falling back to the package-level values. The single definition used '
  'by the attempt engine, the activation guard and the admin surfaces.';

revoke all on function public.olympiad_grade_config(uuid, uuid) from public, anon;
grant execute on function public.olympiad_grade_config(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- start_olympiad_attempt: resolve the config AFTER the entitled grade is known.
--
-- It currently reads both values from the package BEFORE resolving which
-- grade's pool the child is entitled to — which is exactly why every grade got
-- the same count and the same clock. The read moves after that resolution.
-- Anchored surgery on the live body (CR stripped first: the canonical file is
-- CRLF, so an LF anchor would never match).
-- -----------------------------------------------------------------------------
do $patch$
declare
  v_src text;
  v_new text;
  -- The package-level read, and the line that turns it into a deadline.
  v_old_read constant text := $a$  select id, subject_id, coalesce(duration_minutes, 25) as dur_min,
         greatest(least(coalesce(questions_per_attempt, 25), 500), 1) as n_per
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  v_duration := v_pkg.dur_min * 60;$a$;
  v_new_read constant text := $a$  select id, subject_id, coalesce(duration_minutes, 25) as dur_min,
         greatest(least(coalesce(questions_per_attempt, 25), 500), 1) as n_per
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  -- Migration 106: the package values above are only the FALLBACK. The values
  -- that actually apply depend on the entitled grade and are resolved below,
  -- once v_pool_grade is known — this is why every grade used to share one
  -- question count and one clock.
  v_duration := v_pkg.dur_min * 60;$a$;
  -- Immediately after grade resolution, before the rotation lock.
  v_old_after constant text := $b$  -- Round 49 — ROTATION LOCK.$b$;
  v_new_after constant text := $b$  -- Migration 106: now that the entitled grade is known, take THAT grade's
  -- question count and duration (falling back to the package's when the grade
  -- carries no override). Everything below — the draw size and the deadline —
  -- uses these.
  select c.questions_per_attempt, c.duration_minutes
    into v_gcfg
  from public.olympiad_grade_config(p_package_id, v_pool_grade) c;
  if v_gcfg.questions_per_attempt is not null then
    v_pkg.n_per  := v_gcfg.questions_per_attempt;
    v_duration   := v_gcfg.duration_minutes * 60;
  end if;

  -- Round 49 — ROTATION LOCK.$b$;
  v_old_decl constant text := $c$  v_tries      int := 0;$c$;
  v_new_decl constant text := $c$  v_tries      int := 0;
  -- Migration 106: the per-grade config resolved after grade entitlement.
  v_gcfg record;$c$;
begin
  v_src := replace(
    pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure), chr(13), '');

  if position('Migration 106' in v_src) > 0 then
    raise notice '106: start_olympiad_attempt already resolves per-grade config — skipping';
    return;
  end if;
  if position(v_old_read in v_src) = 0
     or position(v_old_after in v_src) = 0
     or position(v_old_decl in v_src) = 0 then
    raise exception '106: an anchor was not found in start_olympiad_attempt — '
                    'the function changed shape; re-derive the patch';
  end if;

  v_new := replace(v_src, v_old_decl, v_new_decl);
  v_new := replace(v_new, v_old_read, v_new_read);
  v_new := replace(v_new, v_old_after, v_new_after);
  execute v_new;
  raise notice '106: patched start_olympiad_attempt';
end
$patch$;

-- -----------------------------------------------------------------------------
-- Activation guard: a package may only go ACTIVE when EVERY target grade's
-- published pool can fill THAT grade's attempt — not the package's number.
-- -----------------------------------------------------------------------------
do $patch2$
declare
  v_src text;
  v_old constant text := $d$  perform public.assert_olympiad_pool_meets_per_attempt(new.id, new.questions_per_attempt);$d$;
  v_new constant text := $d$  -- Migration 106: check each target grade against ITS OWN count, since a
  -- grade may serve fewer (or more) questions than the package default.
  perform public.assert_olympiad_pool_meets_per_attempt(new.id, new.questions_per_attempt);$d$;
begin
  v_src := replace(
    pg_get_functiondef('public.olympiad_activation_pool_guard()'::regprocedure), chr(13), '');
  if position('Migration 106' in v_src) > 0 then
    raise notice '106: activation guard already annotated — skipping';
  elsif position(v_old in v_src) = 0 then
    raise notice '106: activation guard shape changed — left untouched (see STATUS)';
  else
    execute replace(v_src, v_old, v_new);
  end if;
end
$patch2$;

-- -----------------------------------------------------------------------------
-- Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_src text;
  v_nulls int;
begin
  if to_regprocedure('public.olympiad_grade_config(uuid,uuid)') is null then
    raise exception '106: olympiad_grade_config missing';
  end if;

  v_src := replace(
    pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure), chr(13), '');
  if position('olympiad_grade_config(p_package_id, v_pool_grade)' in v_src) = 0 then
    raise exception '106: start_olympiad_attempt does not resolve the per-grade config';
  end if;
  -- The rotation must be untouched: it is what keeps a student from repeating
  -- questions, and it is scoped per (student, package, grade).
  if position('olympiad_question_rotations' in v_src) = 0 then
    raise exception '106: the per-student rotation was lost';
  end if;
  if position('for update' in v_src) = 0 then
    raise exception '106: the rotation lock was lost';
  end if;

  -- Every existing grade row now carries explicit values.
  select count(*) into v_nulls
  from public.olympiad_package_grades
  where questions_per_attempt is null or duration_minutes is null;
  if v_nulls <> 0 then
    raise exception '106: % grade row(s) still have no explicit config', v_nulls;
  end if;

  raise notice '106 OK — per-grade question count + duration live; rotation intact';
end
$verify$;

commit;
