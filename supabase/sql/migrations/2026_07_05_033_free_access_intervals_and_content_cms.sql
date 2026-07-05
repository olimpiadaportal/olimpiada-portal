-- =============================================================================
-- 2026_07_05_033_free_access_intervals_and_content_cms.sql
-- Round 12 (owner update pass 2):
--   (1) FREE-ACCESS INTERVALS — admin-scheduled per-parent/child free windows
--       (start->end). While active: parent subscription is free (prices 0, add/
--       remove subjects free, NO paid rows), child practice/olympiad is free, and
--       the parent pages show a countdown. Mirrors the GIVEAWAY override model
--       (lazy expiry, nothing to unwind) — distinct from the global giveaway and
--       from the permanent admin_grant_child_access comped subscription.
--   (2) CONTENT CMS — hierarchical section/menu columns on site_content for the
--       new TEXT-ONLY "Website Content Management" module, and REMOVAL of the
--       design/font/colour tokens (the design editor is dropped).
--
-- Backports: site_content section/menu + free_access_intervals table -> 008;
--   RLS -> 010; helpers + updated_at trigger + attempt-RPC guards -> 011;
--   design.* seed removal -> 012; validation #40 update + #41/#42 -> 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- Destructive change: only DELETE of the unused design.* system_settings rows
--   (owner-approved: the design editor is being removed). Everything else additive.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- (2a) site_content hierarchical grouping columns
-- -----------------------------------------------------------------------------
alter table public.site_content
  add column if not exists section text,
  add column if not exists menu    text;

-- -----------------------------------------------------------------------------
-- (1a) free_access_intervals table + indexes + RLS
-- -----------------------------------------------------------------------------
create table if not exists public.free_access_intervals (
  id                  uuid primary key default gen_random_uuid(),
  parent_profile_id   uuid references public.profiles (id) on delete cascade,
  student_profile_id  uuid references public.students (profile_id) on delete cascade,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  is_active           boolean not null default true,
  note                text,
  created_by_admin_id uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_fai_target check (parent_profile_id is not null or student_profile_id is not null),
  constraint chk_fai_window check (ends_at > starts_at)
);
create index if not exists ix_fai_parent  on public.free_access_intervals (parent_profile_id);
create index if not exists ix_fai_student on public.free_access_intervals (student_profile_id);
create index if not exists ix_fai_window  on public.free_access_intervals (starts_at, ends_at);

comment on table public.free_access_intervals is
  'Admin-scheduled per-parent/child free-access windows. Free (prices 0, no paid rows) while now() in [starts_at,ends_at) and is_active. Lazy expiry. Admin/service write only.';

alter table public.free_access_intervals enable row level security;
drop policy if exists "fai_admin" on public.free_access_intervals;
create policy "fai_admin" on public.free_access_intervals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_set_updated_at on public.free_access_intervals;
create trigger trg_set_updated_at before update on public.free_access_intervals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- (1b) lazy free-access helpers (SECURITY DEFINER; admin-only table)
-- -----------------------------------------------------------------------------
create or replace function public.is_free_access_active_for_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.free_access_intervals f
    where f.is_active
      and now() >= f.starts_at and now() < f.ends_at
      and (
        f.student_profile_id = p_student
        or f.parent_profile_id = (
          select s.created_by_parent_profile_id
          from public.students s where s.profile_id = p_student
        )
      )
  );
$$;
comment on function public.is_free_access_active_for_student(uuid) is
  'True while an admin free-access interval covers this student (its own or its parent''s). Lazy expiry.';
revoke all on function public.is_free_access_active_for_student(uuid) from public, anon;
grant execute on function public.is_free_access_active_for_student(uuid) to authenticated, service_role;

create or replace function public.my_free_access_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.is_free_access_active_for_student(public.current_profile_id()); $$;
revoke all on function public.my_free_access_active() from public, anon;
grant execute on function public.my_free_access_active() to authenticated, service_role;

create or replace function public.current_parent_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('active', m.ends_at is not null, 'ends_at', m.ends_at)
  from (
    select max(f.ends_at) as ends_at
    from public.free_access_intervals f
    where f.is_active
      and now() >= f.starts_at and now() < f.ends_at
      and (
        f.parent_profile_id = public.current_profile_id()
        or f.student_profile_id in (
          select s.profile_id from public.students s
          where s.created_by_parent_profile_id = public.current_profile_id()
        )
      )
  ) m;
$$;
comment on function public.current_parent_free_access() is
  'Current parent free-access { active, ends_at } (max active window over the parent + their children). Scoped to current_profile_id().';
revoke all on function public.current_parent_free_access() from public, anon;
grant execute on function public.current_parent_free_access() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- (1c) wire the free-access override into the attempt-start guards. Full-body
-- CREATE OR REPLACE (only the giveaway guard gains the free-access clause).
-- -----------------------------------------------------------------------------
create or replace function public.start_practice_attempt(
  p_subject_id uuid,
  p_count      int default 25
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_access  public.child_access_status;
  v_grade   uuid;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'start_practice: not authenticated'; end if;
  select access_status, grade_id into v_access, v_grade
  from public.students where profile_id = v_student;
  if v_access is null then raise exception 'start_practice: not a student'; end if;
  -- GIVEAWAY (migration 027) OR per-parent/child FREE-ACCESS interval (migration 033)
  -- grants access without a subscription.
  if v_access not in ('trialing', 'active')
     and not public.is_giveaway_active()
     and not public.is_free_access_active_for_student(v_student) then
    raise exception 'start_practice: no active access' using errcode = 'check_violation';
  end if;

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, p_subject_id, 'practice', 'in_progress')
  returning id into v_attempt;

  with picked as (
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
    limit greatest(1, p_count)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'start_practice: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;
revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;

create or replace function public.start_olympiad_attempt(p_package_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_subject uuid;
  v_n_per   int;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;
  if not exists (
    select 1 from public.olympiad_purchases
    where student_profile_id = v_student and olympiad_package_id = p_package_id and status = 'active'
  ) then
    -- GIVEAWAY (027) OR per-parent/child FREE-ACCESS interval (033) opens
    -- ACTIVE-catalog packages for free; archived stay purchaser-only; no purchase rows.
    if not ((public.is_giveaway_active()
             or public.is_free_access_active_for_student(v_student))
            and exists (
      select 1 from public.olympiad_packages
      where id = p_package_id and catalog_status = 'active'
    )) then
      raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
    end if;
  end if;

  select subject_id, questions_per_attempt into v_subject, v_n_per
  from public.olympiad_packages where id = p_package_id;
  v_n_per := coalesce(v_n_per, 25);

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, v_subject, 'olympiad', 'in_progress')
  returning id into v_attempt;

  with picked as (
    select q.id
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published'
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
    order by random()
    limit greatest(1, v_n_per)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- (2b) remove the design/font/colour tokens (design editor dropped).
-- -----------------------------------------------------------------------------
delete from public.system_settings where key like 'design.%';

commit;

-- =============================================================================
-- End of 2026_07_05_033_free_access_intervals_and_content_cms.sql
-- =============================================================================
