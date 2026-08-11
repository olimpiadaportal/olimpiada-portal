-- 107 — Make the olympiad activation guard actually per-grade
--
-- WHAT 106 LEFT HALF-DONE
-- -----------------------
-- 106 gave each target grade its own `questions_per_attempt`, and taught
-- `start_olympiad_attempt` to serve that number. It did NOT teach the
-- activation guard to check it. Two concrete holes were left open:
--
--   1. `assert_olympiad_pool_meets_per_attempt` loops over every target grade
--      but compares each one against the SAME `p_per_attempt`. A package whose
--      grade 5 serves 10 questions and grade 11 serves 40 was validated with
--      one number for both — so a 40-question grade with a 12-question pool
--      could go ACTIVE, and the first student to open it would hit the
--      "not enough questions" failure at ATTEMPT time. That is precisely the
--      failure the Round-49 guard exists to make impossible.
--
--   2. The guard fires on `olympiad_packages` only. Per-grade counts live on
--      `olympiad_package_grades`, so raising a grade's count on an
--      already-active package — or adding a whole new target grade to one —
--      never re-validated anything.
--
-- Both are closed here. p_per_attempt keeps its meaning as the package-level
-- FALLBACK for grades carrying no override, so every existing caller is
-- unchanged and legacy grade-less packages behave exactly as before.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- -----------------------------------------------------------------------------
-- 1. Per-grade requirement inside the validator.
--
-- Only the loop changes: `v_need` is now resolved per row as
-- coalesce(grade override, package fallback). The legacy grade-less branch,
-- the Azerbaijani message, the ordinal suffix, the stable HINT key and the
-- DETAIL JSON shape are all preserved byte-for-byte — admin-panel parses that
-- DETAIL to render the en/ru variants, so changing its shape would silently
-- break the localized error.
-- -----------------------------------------------------------------------------
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
  -- Migration 107: the package-level number is now only the FALLBACK for a
  -- grade that carries no override of its own.
  v_fallback int := greatest(coalesce(p_per_attempt, 1), 1);
  v_need  int;
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
    if v_pool < v_fallback then
      raise exception
        'Paketə % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        v_pool, v_fallback, v_fallback
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', null, 'grade_id', null,
                                           'pool', v_pool, 'required', v_fallback)::text;
    end if;
    return;
  end if;

  for r in
    select g.grade_id                    as grade_id,
           gr.level::int                 as level,
           -- Migration 107: THIS grade's requirement, not the package's.
           greatest(coalesce(g.questions_per_attempt, v_fallback), 1) as need,
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
    v_need := r.need;
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
  'Round 49 + migration 107: raises check_violation (hint '
  'olympiad_pool_below_per_attempt, DETAIL = JSON {grade_level, grade_id, pool, '
  'required}) when a target grade''s published pool cannot fill one attempt. '
  'Each grade is checked against ITS OWN questions_per_attempt, falling back to '
  'p_per_attempt. service-internal: reached through the activation guards only.';

revoke all on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- 2. Guard the grade rows themselves.
--
-- Mirrors olympiad_activation_pool_guard's philosophy exactly: validate only
-- when the change could make an ACTIVE package unservable, and let every
-- unrelated edit pass. SECURITY DEFINER for the same reason — `questions` is
-- RLS-protected and the guard must never pass because rows were hidden from the
-- caller.
--
-- Fires when, on a package that is ACTIVE:
--   * a target grade is ADDED (its pool has never been checked), or
--   * a grade's questions_per_attempt is RAISED (a lower one is always safe).
-- Lowering the count, editing the duration, or touching a draft/archived
-- package all pass straight through.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_pool_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.catalog_status;
  v_pkg_per int;
begin
  select p.status, p.questions_per_attempt
    into v_status, v_pkg_per
  from public.olympiad_packages p
  where p.id = new.olympiad_package_id;

  -- Not active (or the package row is not visible yet during a create) → the
  -- package-level guard will validate the whole set at activation time.
  if v_status is distinct from 'active'::public.catalog_status then
    return new;
  end if;

  -- A raise is the only UPDATE that can newly break servability.
  if tg_op = 'UPDATE'
     and coalesce(new.questions_per_attempt, v_pkg_per, 1)
         <= coalesce(old.questions_per_attempt, v_pkg_per, 1) then
    return new;
  end if;

  perform public.assert_olympiad_pool_meets_per_attempt(
    new.olympiad_package_id, v_pkg_per, new.grade_id);
  return new;
end;
$$;

comment on function public.olympiad_grade_pool_guard() is
  'Migration 107: blocks adding a target grade to — or raising a grade''s '
  'questions_per_attempt on — an ACTIVE olympiad package whose published pool '
  'for that grade cannot fill one attempt. Closes the hole left when per-grade '
  'counts moved off olympiad_packages, where the activation guard fires.';

drop trigger if exists trg_olympiad_grade_pool_guard on public.olympiad_package_grades;
create trigger trg_olympiad_grade_pool_guard
  before insert or update on public.olympiad_package_grades
  for each row execute function public.olympiad_grade_pool_guard();

-- -----------------------------------------------------------------------------
-- 3. Undo 106's backfill where it merely restated the package value.
--
-- 106 filled every existing grade row with the package's numbers so the admin
-- would "see real numbers instead of blanks". That turned out to be wrong: an
-- explicit grade value SHADOWS the package value, so editing the package-level
-- count on a single-grade package would silently do nothing — the grade row
-- would keep winning with the old number.
--
-- NULL is the only honest way to say "this grade has no opinion". The admin
-- surfaces now show the package value as a PLACEHOLDER instead, so a blank
-- field is just as informative and inheritance actually works.
--
-- Only rows that EQUAL the package value are cleared, so a genuine override is
-- never touched. Rows equal by coincidence lose nothing: same resolved number,
-- and they now follow the package when it changes — which is what an admin who
-- never opened the per-grade panel expects.
-- -----------------------------------------------------------------------------
update public.olympiad_package_grades g
   set questions_per_attempt =
         case when g.questions_per_attempt = p.questions_per_attempt
              then null else g.questions_per_attempt end,
       duration_minutes =
         case when g.duration_minutes = p.duration_minutes
              then null else g.duration_minutes end
  from public.olympiad_packages p
 where p.id = g.olympiad_package_id
   and (g.questions_per_attempt = p.questions_per_attempt
        or g.duration_minutes = p.duration_minutes);

-- -----------------------------------------------------------------------------
-- 4. Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_src text;
begin
  v_src := replace(
    pg_get_functiondef(
      'public.assert_olympiad_pool_meets_per_attempt(uuid,int,uuid)'::regprocedure),
    chr(13), '');
  if position('coalesce(g.questions_per_attempt, v_fallback)' in v_src) = 0 then
    raise exception '107: the validator still checks every grade against one number';
  end if;
  -- The localized-error contract the admin panel parses must be intact.
  if position('olympiad_pool_below_per_attempt' in v_src) = 0
     or position('grade_level' in v_src) = 0 then
    raise exception '107: the DETAIL/HINT error contract was lost';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_olympiad_grade_pool_guard'
      and tgrelid = 'public.olympiad_package_grades'::regclass
      and not tgisinternal
  ) then
    raise exception '107: the grade-row guard trigger is not armed';
  end if;

  -- 106 must still be in place; 107 depends on it.
  if to_regprocedure('public.olympiad_grade_config(uuid,uuid)') is null then
    raise exception '107: migration 106 is missing (olympiad_grade_config)';
  end if;

  raise notice '107 OK — activation validated per grade; grade rows guarded';
end
$verify$;

commit;
