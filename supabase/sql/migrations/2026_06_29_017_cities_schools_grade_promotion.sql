-- Migration: 2026_06_29_017_cities_schools_grade_promotion.sql
-- Purpose: Cities + Schools + Grade Promotion + structured Add-Child foundation.
--   (1) CITIES: repurpose the existing (empty) public.districts table as the
--       admin-managed CITY entity that schools link to. We deliberately do NOT
--       create a parallel `cities` table — schools.district_id already models the
--       "a school belongs to a city" link, so a new table would duplicate it.
--       Seed major Azerbaijani cities (AZ proper nouns) as active districts.
--   (2) SCHOOLS: make public.schools.district_id MANDATORY (NOT NULL) — a school
--       MUST belong to a city. 012 seeds no schools, so the NOT NULL is safe; we
--       seed 1-2 sample schools under Bakı for testing (each with a valid city).
--   (3) GRADE PROMOTION: add students.graduated boolean NOT NULL DEFAULT false and
--       a service-role-only RPC advance_student_grades() that, per non-graduated
--       student with a grade, bumps grade level +1 (levels 1..10) or marks level-11
--       students graduated. Meant to run yearly on Sept 1 via pg_cron (schedule SQL
--       documented in a comment; pg_cron is NOT assumed enabled).
--   (4) STRUCTURED ADD-CHILD: extend create_child_account with two new OPTIONAL
--       trailing params p_district_id + p_school_id (appended AFTER the existing
--       8-param signature so the current caller still type-matches), stored on the
--       students row (alongside the existing free-text city/school_name for display).
--       Kept OPTIONAL at the DB layer (the app enforces mandatory); no raise on null.
-- Environment first applied: development/staging
-- Related root SQL file(s): 002 (students.graduated), 003 (districts repurposed as
--   City; schools.district_id NOT NULL), 011 (advance_student_grades +
--   create_child_account 10-param signature), 012 (city seeds + sample schools),
--   013 (validation checks 24/25).
-- Backport status: completed (canonical 002/003/011/012/013).
-- Destructive change: no (additive column/params/seeds; one column tightened to
--   NOT NULL on an empty table — see rollback notes).
-- Rollback notes:
--   * advance_student_grades: drop function public.advance_student_grades();
--   * students.graduated: alter table public.students drop column graduated;
--   * schools.district_id NOT NULL: alter table public.schools
--       alter column district_id drop not null;  (only needed if reverting)
--   * create_child_account: restore the prior 8-param body (drop the 10-param
--       overload first). Seed rows can be left in place (additive, idempotent).
-- Security: advance_student_grades and create_child_account are SECURITY DEFINER,
--   service_role EXECUTE only (REVOKE from anon/authenticated/public EXPLICITLY —
--   Supabase ALTER DEFAULT PRIVILEGES grants EXECUTE to anon/authenticated on every
--   new function, so revoking public alone is not enough).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) CITIES — seed major Azerbaijani cities into public.districts (the City
--     entity). Single `name` column holds the AZ proper noun. Idempotent via the
--     existing unique(country_code, name). (Localized city names could be added
--     later as a districts_translations table — see migration followups.)
-- -----------------------------------------------------------------------------
insert into public.districts (name, country_code, status) values
  ('Bakı',       'AZ', 'active'),
  ('Gəncə',      'AZ', 'active'),
  ('Sumqayıt',   'AZ', 'active'),
  ('Mingəçevir', 'AZ', 'active'),
  ('Şirvan',     'AZ', 'active'),
  ('Naxçıvan',   'AZ', 'active'),
  ('Lənkəran',   'AZ', 'active'),
  ('Şəki',       'AZ', 'active'),
  ('Yevlax',     'AZ', 'active'),
  ('Xırdalan',   'AZ', 'active'),
  ('Quba',       'AZ', 'active'),
  ('Şamaxı',     'AZ', 'active'),
  ('Qəbələ',     'AZ', 'active'),
  ('Gədəbəy',    'AZ', 'active'),
  ('Ağdam',      'AZ', 'active')
on conflict (country_code, name) do nothing;

-- -----------------------------------------------------------------------------
-- (2) SCHOOLS — a school MUST belong to a city. Make district_id NOT NULL.
--     012 seeds no schools and the table starts empty, so this cannot fail on
--     existing data. The 003 FK is ON DELETE SET NULL; with NOT NULL in place a
--     city delete that would orphan schools is blocked by the NOT NULL constraint
--     (delete the schools or repoint them first).
-- -----------------------------------------------------------------------------
-- Seed 2 sample schools under Bakı (each with a valid district_id) for testing.
insert into public.schools (name, district_id, status)
select v.name, d.id, 'active'::public.catalog_status
from (values
  ('Bakı 6 nömrəli tam orta məktəb'),
  ('Bakı 20 nömrəli tam orta məktəb')
) as v(name)
cross join lateral (
  select id from public.districts where country_code = 'AZ' and name = 'Bakı' limit 1
) as d
where not exists (
  select 1 from public.schools s where s.name = v.name and s.district_id = d.id
);

-- Now enforce the mandatory link (after any seed has a valid city) and switch the
-- FK to ON DELETE RESTRICT so a city with schools cannot be deleted out from under
-- them (matches the canonical 003 definition after backport).
alter table public.schools
  alter column district_id set not null;

alter table public.schools drop constraint if exists schools_district_id_fkey;
alter table public.schools
  add constraint schools_district_id_fkey
  foreign key (district_id) references public.districts (id) on delete restrict;

-- -----------------------------------------------------------------------------
-- (3) GRADE PROMOTION
-- -----------------------------------------------------------------------------
-- students.graduated : true once a student finished grade 11. Promotion stops
-- for graduated students; their grade_id is left as-is (last grade attended).
alter table public.students
  add column if not exists graduated boolean not null default false;

-- advance_student_grades : yearly grade promotion.
-- For every student where graduated = false AND grade_id is not null:
--   * if the current grade level < 11 -> move grade_id to the grades row whose
--     level = current + 1;
--   * if the current grade level = 11 -> set graduated = true (keep grade_id).
-- Returns jsonb {promoted, graduated}. SECURITY DEFINER; service_role EXECUTE only.
--
-- INTENDED SCHEDULE: run once a year on September 1. If pg_cron is enabled, the
-- exact schedule is (DO NOT run here — pg_cron is not assumed enabled):
--   select cron.schedule(
--     'advance-student-grades-sept-1',
--     '0 3 1 9 *',                          -- 03:00 on Sep 1, every year
--     $$ select public.advance_student_grades(); $$
--   );
create or replace function public.advance_student_grades()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promoted  int := 0;
  v_graduated int := 0;
begin
  -- Promote students below grade 11 to the next grade level.
  with promotable as (
    select s.profile_id, g_next.id as next_grade_id
    from public.students s
    join public.grades g_cur  on g_cur.id = s.grade_id
    join public.grades g_next on g_next.level = g_cur.level + 1
    where s.graduated = false
      and s.grade_id is not null
      and g_cur.level < 11
  ),
  upd as (
    update public.students s
       set grade_id   = p.next_grade_id,
           updated_at = now()
      from promotable p
     where s.profile_id = p.profile_id
    returning 1
  )
  select count(*) into v_promoted from upd;

  -- Graduate students currently in grade 11 (keep grade_id as the last grade).
  with grads as (
    update public.students s
       set graduated  = true,
           updated_at = now()
      from public.grades g_cur
     where g_cur.id = s.grade_id
       and s.graduated = false
       and s.grade_id is not null
       and g_cur.level = 11
    returning 1
  )
  select count(*) into v_graduated from grads;

  return jsonb_build_object('promoted', v_promoted, 'graduated', v_graduated);
end;
$$;

comment on function public.advance_student_grades() is
  'Yearly grade promotion (intended Sept 1 via pg_cron). Promotes non-graduated students level<11 to next grade; marks level-11 students graduated. Returns jsonb {promoted, graduated}. service_role EXECUTE only.';

-- service_role only. Revoke anon/authenticated EXPLICITLY (Supabase default
-- privileges grant EXECUTE to them on every new function).
revoke all on function public.advance_student_grades() from public, anon, authenticated;
grant execute on function public.advance_student_grades() to service_role;

-- -----------------------------------------------------------------------------
-- (4) STRUCTURED ADD-CHILD — extend create_child_account with structured city
--     (district_id) + school_id. New params are APPENDED after the existing
--     8-param signature (p_district_id, p_school_id) and DEFAULT null, so the
--     current 8-arg caller still type-matches. They are stored on the students
--     row in addition to the existing free-text city/school_name/class_grade
--     (which remain for display). Kept OPTIONAL at the DB layer (the app enforces
--     mandatory): we VALIDATE the FK targets when provided, but never raise on null.
--     All other behavior is preserved (deferred child_unique_id, parent link,
--     Student role, credential mapping, access_status = 'inactive').
-- (drop the older overloads first: the parameter list / signature changed)
-- -----------------------------------------------------------------------------
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text);
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid);
create or replace function public.create_child_account(
  p_parent_profile_id uuid,
  p_auth_user_id      uuid,
  p_first_name        text,
  p_last_name         text,
  p_city              text default null,
  p_school_name       text default null,
  p_class_grade       text default null,
  p_grade_id          uuid default null,
  p_district_id       uuid default null,
  p_school_id         uuid default null
)
-- OUT column names are deliberately non-colliding with table columns (else plpgsql
-- raises "ambiguous column reference" inside the body).
returns table (new_student_profile_id uuid, new_child_unique_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id      uuid;
  v_student_role_id uuid;
begin
  -- The creator must be a registered parent (parents row exists).
  if not exists (select 1 from public.parents pa where pa.profile_id = p_parent_profile_id) then
    raise exception 'create_child_account: % is not a registered parent', p_parent_profile_id
      using errcode = 'check_violation';
  end if;

  -- The child Auth user must already exist with an auto-created profile.
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    raise exception 'create_child_account: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotency guard: never double-provision a profile already made a student.
  if exists (select 1 from public.students s where s.profile_id = v_profile_id) then
    raise exception 'create_child_account: profile % is already a student', v_profile_id
      using errcode = 'unique_violation';
  end if;

  -- Validate the optional structured grade.
  if p_grade_id is not null
     and not exists (select 1 from public.grades g where g.id = p_grade_id) then
    raise exception 'create_child_account: grade % does not exist', p_grade_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Validate the optional structured city (district). OPTIONAL: no raise on null.
  if p_district_id is not null
     and not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'create_child_account: city (district) % does not exist', p_district_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Validate the optional structured school, and (when both given) that the
  -- school belongs to the chosen city. OPTIONAL: no raise on null.
  if p_school_id is not null then
    if not exists (select 1 from public.schools sc where sc.id = p_school_id) then
      raise exception 'create_child_account: school % does not exist', p_school_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.schools sc
                        where sc.id = p_school_id and sc.district_id = p_district_id) then
      raise exception 'create_child_account: school % is not in city %', p_school_id, p_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row WITHOUT a login ID (no paid access yet).
  --    child_unique_id stays NULL until a plan is chosen (subscribe step).
  --    Structured district_id/school_id are stored alongside the free-text
  --    city/school_name/class_grade (display) values.
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               district_id, school_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_district_id, p_school_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          'inactive');

  -- 3) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 4) Record the credential mapping with a NULL ID (backfilled on allocation).
  --    Password lives ONLY in Supabase Auth (never stored here).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, null, p_auth_user_id, p_parent_profile_id, now());

  -- 5) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  -- The login ID is NULL until a plan is chosen (create_child_subscription).
  return query select v_profile_id, null::text;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) is
  'Atomic parent-created child provisioning WITHOUT a login ID (allocated later on subscribe). Optional structured grade/city(district)/school stored on students. service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) to service_role;

-- =============================================================================
-- End of 2026_06_29_017_cities_schools_grade_promotion.sql
-- =============================================================================
