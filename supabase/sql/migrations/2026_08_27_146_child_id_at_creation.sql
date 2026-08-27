-- =============================================================================
-- 2026_08_27_146 — A CHILD WITHOUT A LOGIN ID IS AN ACCOUNT THAT CANNOT BE USED.
--
-- FOUND WHILE INVESTIGATING AN APPLE REJECTION, but it is not an Apple problem.
--
-- `create_child_account` deliberately returned a NULL login id: the 8-digit
-- number was allocated later, by `create_child_subscription`, on the reasoning
-- that a child with no plan has nothing to log in to.
--
-- That reasoning quietly stopped holding when the payments kill switch was
-- thrown. With payments off, no subscription is ever created — so no id is ever
-- allocated. The Add-Child flow completes, the parent is congratulated, and the
-- success screen says "the 8-digit login ID appears here as soon as a subject
-- subscription is active". No screen in the mobile app can make that happen.
--
-- A child logs in with ONLY that id plus the parent's password. So the account
-- is not merely unfinished, it is unusable, and nothing tells anyone.
--
-- MEASURED ON PRODUCTION before this migration: 2 of 6 children had no id.
--
-- WHY ALLOCATING AT CREATION IS CORRECT, not merely convenient.
-- IDENTITY IS NOT ENTITLEMENT. The id says who the child IS. access_status stays
-- 'inactive', has_subject_access is untouched, and every paid gate behaves
-- exactly as before. What changes is that the child can sign in and be told
-- "your access is not active yet" — a complete state — instead of being unable
-- to reach the product at all.
--
-- `allocate_child_unique_id` is idempotent: it re-reads the registry before
-- minting, so the later call inside create_child_subscription is a no-op.
--
-- THE HALF THIS MIGRATION CANNOT DO. A child signs in through a synthetic auth
-- email derived from the id (c<8digits>@children.invalid), and that lives in
-- Supabase Auth, not in this database. The backfill below gives the two existing
-- children an id; their auth email must be set through the admin API afterwards
-- or they still cannot sign in. That step is in Human Next Actions, not hidden.
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — the id is allocated at creation.
-- -----------------------------------------------------------------------------
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
  v_child_id       text;
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

  -- 4) ALLOCATE THE LOGIN ID NOW (migration 146).
  --
  -- It used to be deferred to the first subscription, on the reasoning that a
  -- child with no plan has nothing to log in to. That was wrong in a way nobody
  -- noticed until the payments kill switch was thrown: with payments off, no
  -- subscription is ever created, so no id was ever allocated, and the Add-Child
  -- flow completed into an account THAT COULD NEVER BE USED. The success screen
  -- promised "the 8-digit ID appears as soon as a subject subscription is
  -- active" and no screen in the app could make that happen. Two production
  -- children were left in that state.
  --
  -- IDENTITY IS NOT ENTITLEMENT. The id is who the child IS; access_status stays
  -- 'inactive' and every paid gate is untouched. The child can sign in and see
  -- the ordinary locked arena -- a complete, honest state, instead of a dead end.
  --
  -- allocate_child_unique_id is idempotent (it re-reads the registry before
  -- minting), so create_child_subscription calling it again later is harmless.
  v_child_id := public.allocate_child_unique_id(v_profile_id);

  -- Password lives ONLY in Supabase Auth (never stored here).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, v_child_id, p_auth_user_id, p_parent_profile_id, now());

  -- 5) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  -- The caller sets the canonical synthetic auth email from this id; without
  -- that step the child still cannot sign in, so it is not optional.
  return query select v_profile_id, v_child_id;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) is
  'Atomic parent-created child provisioning INCLUDING the 8-digit login ID (migration 146; it was deferred to the first subscription, which never happened while payments were off). Optional structured grade/city(district)/school stored on students; the intra-city district (rayon) is REQUIRED when the city has active rayons (Round 21). service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

-- service_role only (the service layer runs admin.createUser then this).
-- Revoke anon/authenticated EXPLICITLY: Supabase ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated on every new function; revoking public is not enough.

revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2 — REPAIR THE CHILDREN ALREADY STRANDED.
--
-- Forward-only would leave the two measured accounts permanently unusable, and
-- they are exactly the accounts whose parents already believe a child was
-- created. The registry allocation is idempotent, so this is safe to re-run.
-- -----------------------------------------------------------------------------
do $$
declare
  v_row record;
  v_id  text;
  v_n   int := 0;
begin
  for v_row in
    select profile_id from public.students where child_unique_id is null
  loop
    v_id := public.allocate_child_unique_id(v_row.profile_id);
    update public.child_credentials
       set child_unique_id = v_id, updated_at = now()
     where student_profile_id = v_row.profile_id
       and child_unique_id is distinct from v_id;
    v_n := v_n + 1;
    raise notice '146: allocated an id for student %', v_row.profile_id;
  end loop;
  raise notice '146: repaired % child account(s) with no login id', v_n;
end $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_src     text;
  v_missing int;
  v_creds   int;
begin
  v_src := pg_get_functiondef('public.create_child_account(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid)'::regprocedure);
  if position('allocate_child_unique_id' in v_src) = 0 then
    raise exception '146: create_child_account still does not allocate an id';
  end if;
  if position('null::text' in v_src) > 0 then
    raise exception '146: create_child_account still returns a null id';
  end if;

  select count(*) into v_missing from public.students where child_unique_id is null;
  if v_missing > 0 then
    raise exception '146: % child account(s) still have no login id', v_missing;
  end if;

  select count(*) into v_creds
  from public.child_credentials c
  join public.students s on s.profile_id = c.student_profile_id
  where c.child_unique_id is distinct from s.child_unique_id;
  if v_creds > 0 then
    raise exception '146: % credential row(s) disagree with students.child_unique_id', v_creds;
  end if;

  -- The gate this migration must NOT have moved: identity is not entitlement.
  if position('''inactive''' in v_src) = 0 then
    raise exception '146: a new child is no longer created inactive';
  end if;

  raise notice '146: every child has a login id, and a new child is still created inactive';
end $$;

commit;
