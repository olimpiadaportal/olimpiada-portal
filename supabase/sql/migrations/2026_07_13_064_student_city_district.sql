-- =============================================================================
-- 2026_07_13_064_student_city_district.sql
-- Round 21 item 6: the Add-Child form gains a mandatory District (rayon) select
-- between City and School. Owner decision: the rayon IS stored on the child
-- profile (supersedes the Round-20 "derive only through the school" rule).
-- Consistency is guard-enforced so the stored value can never disagree with the
-- school; leaderboards still prefer the school's rayon and use the stored one
-- only as a FALLBACK (fixes children of the schools still awaiting manual rayon
-- assignment).
--
-- NAMING REMINDER: public.districts = the CITIES table (historic naming;
-- students.district_id = the child's CITY). public.city_districts = the real
-- intra-city rayons. The new column is students.city_district_id.
--
--   1) students.city_district_id (FK city_districts, ON DELETE SET NULL) + index.
--   2) Backfill from the child's school.
--   3) student_district_guard trigger: auto-fills the rayon from the school when
--      missing; rejects a rayon outside the child's city; rejects a rayon that
--      contradicts the school's rayon. (The "required when the city has rayons"
--      rule lives in create_child_account so legacy rows never break.)
--   4) create_child_account v2: + p_city_district_id (validated: exists, belongs
--      to the city, matches the school, REQUIRED when the city has active rayons).
--   5) lb_rows: district = coalesce(school's rayon, stored rayon) in all three
--      branches + the 'district' scope filter (consumers get_leaderboard /
--      get_my_leaderboard_rank / get_child_leaderboard_position /
--      get_public_leaderboard all flow through lb_rows — no other change).
--
-- Backports: 002 (column), 011 (FK/index/guard/create_child_account/lb_rows).
-- Validation: 013 #66. Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) column + index ---------------------------------------------------------------
alter table public.students
  add column if not exists city_district_id uuid references public.city_districts(id) on delete set null;

create index if not exists idx_students_city_district on public.students (city_district_id);

comment on column public.students.city_district_id is
  'Intra-city district (rayon) chosen at add-child time (Round 21). Guard-enforced to '
  'match the school''s rayon when the school has one; leaderboards prefer the school''s '
  'value and fall back to this.';

-- ---- 2) backfill from the school -------------------------------------------------------
update public.students st
   set city_district_id = sc.city_district_id, updated_at = now()
  from public.schools sc
 where sc.id = st.school_id
   and sc.city_district_id is not null
   and st.city_district_id is distinct from sc.city_district_id;

-- ---- 3) consistency guard ---------------------------------------------------------------
create or replace function public.student_district_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rayon_city  uuid;
  v_school_rayon uuid;
begin
  -- Auto-fill from the school when the rayon was not provided.
  if new.city_district_id is null and new.school_id is not null then
    select sc.city_district_id into new.city_district_id
      from public.schools sc where sc.id = new.school_id;
  end if;

  if new.city_district_id is not null then
    select cd.city_id into v_rayon_city
      from public.city_districts cd where cd.id = new.city_district_id;
    if v_rayon_city is null then
      raise exception 'student: district % does not exist', new.city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    -- Rayon must belong to the child's city (when a city is set).
    if new.district_id is not null and v_rayon_city <> new.district_id then
      raise exception 'student: district % is not in city %', new.city_district_id, new.district_id
        using errcode = 'check_violation';
    end if;
    -- Rayon must match the school's rayon (when the school has one).
    if new.school_id is not null then
      select sc.city_district_id into v_school_rayon
        from public.schools sc where sc.id = new.school_id;
      if v_school_rayon is not null and v_school_rayon <> new.city_district_id then
        raise exception 'student: district % contradicts the school''s district', new.city_district_id
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_district_guard on public.students;
create trigger trg_student_district_guard
  before insert or update of city_district_id, school_id, district_id on public.students
  for each row execute function public.student_district_guard();

-- ---- 4) create_child_account v2 ---------------------------------------------------------
-- (drop first: the parameter list changed; callers pass named args via PostgREST)
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid);
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
  p_school_id         uuid default null,
  p_city_district_id  uuid default null
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

  -- Round 21: the intra-city district (rayon). REQUIRED when the chosen city has
  -- active rayons; must belong to that city. (The students trigger additionally
  -- enforces school-rayon consistency and auto-fills from the school.)
  if p_district_id is not null and p_city_district_id is null
     and exists (select 1 from public.city_districts cd
                  where cd.city_id = p_district_id and cd.status = 'active') then
    raise exception 'create_child_account: district is required for city %', p_district_id
      using errcode = 'check_violation',
            hint    = 'district_required';
  end if;
  if p_city_district_id is not null then
    if not exists (select 1 from public.city_districts cd where cd.id = p_city_district_id) then
      raise exception 'create_child_account: district % does not exist', p_city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.city_districts cd
                        where cd.id = p_city_district_id and cd.city_id = p_district_id) then
      raise exception 'create_child_account: district % is not in city %', p_city_district_id, p_district_id
        using errcode = 'check_violation';
    end if;
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
    -- Round 21: the school must belong to the chosen rayon (when it has one).
    if p_city_district_id is not null
       and exists (select 1 from public.schools sc
                    where sc.id = p_school_id
                      and sc.city_district_id is not null
                      and sc.city_district_id <> p_city_district_id) then
      raise exception 'create_child_account: school % is not in district %', p_school_id, p_city_district_id
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
  --    Structured district_id/city_district_id/school_id are stored alongside the
  --    free-text city/school_name/class_grade (display) values.
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               district_id, city_district_id, school_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_district_id, p_city_district_id, p_school_id,
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

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) is
  'Atomic parent-created child provisioning WITHOUT a login ID (allocated later on subscribe). Optional structured grade/city(district)/school stored on students; the intra-city district (rayon) is REQUIRED when the city has active rayons (Round 21). service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

-- service_role only (the service layer runs admin.createUser then this).
-- Revoke anon/authenticated EXPLICITLY: Supabase ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated on every new function; revoking public is not enough.
revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) to service_role;

-- ---- 5) lb_rows: school-first district with stored fallback -----------------------------
-- Return type unchanged → in-place replace; every board consumer flows through here.
create or replace function public.lb_rows(
  p_board    text,          -- 'points' | 'streak'
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'district' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (points only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text,
               city_name text, district_name text, school_name text, grade_level int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mkey text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
begin
  if p_board not in ('points', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'district', 'school')
     or p_period not in ('month', 'all_time')
     or (p_scope <> 'global' and p_scope_id is null) then
    raise exception 'leaderboard: bad arguments' using errcode = 'check_violation';
  end if;
  if p_board = 'streak' and p_scope <> 'global' then
    raise exception 'leaderboard: streak board is global-only' using errcode = 'check_violation';
  end if;

  -- District context/filter = the school's rayon, falling back to the rayon
  -- stored on the student (Round 21; guard-enforced to never disagree).
  if p_board = 'streak' then
    return query
      select st.profile_id,
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    return query
      select st.profile_id, l.pts, st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, cd.name, sc.name, g.level::int
      from (
        select sl.student_profile_id, sum(sl.points) as pts
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where l.pts > 0;
  else
    return query
      select st.profile_id,
             case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where (p_scope = 'global'
             or (p_scope = 'grade'    and st.grade_id    = p_scope_id)
             or (p_scope = 'city'     and st.district_id = p_scope_id)
             or (p_scope = 'district' and coalesce(sc.city_district_id, st.city_district_id) = p_scope_id)
             or (p_scope = 'school'   and st.school_id   = p_scope_id))
        and (case when p_period = 'all_time' then st.points_all_time
                  when st.points_month_key = v_mkey then st.points_month
                  else 0 end) > 0;
  end if;
end;
$$;
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

-- ---- self-verify ------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='students'
                    and column_name='city_district_id') then
    raise exception 'students.city_district_id missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname='trg_student_district_guard'
                    and tgrelid='public.students'::regclass) then
    raise exception 'student district guard trigger missing';
  end if;
  if to_regprocedure('public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)') is null then
    raise exception 'create_child_account v2 signature missing';
  end if;
  if to_regprocedure('public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid)') is not null then
    raise exception 'old create_child_account signature still present';
  end if;
  if has_function_privilege('authenticated',
       'public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'create_child_account must be service_role only';
  end if;
  if position('st.city_district_id' in pg_get_functiondef('public.lb_rows(text,text,uuid,text)'::regprocedure)) = 0 then
    raise exception 'lb_rows lacks the stored-district fallback';
  end if;
  -- No student may contradict their school's rayon after the backfill.
  if exists (select 1
               from public.students st
               join public.schools sc on sc.id = st.school_id
              where sc.city_district_id is not null
                and st.city_district_id is distinct from sc.city_district_id) then
    raise exception 'backfill left a student/school district mismatch';
  end if;
  raise notice 'student city-district self-verify PASS';
end $$;

commit;
