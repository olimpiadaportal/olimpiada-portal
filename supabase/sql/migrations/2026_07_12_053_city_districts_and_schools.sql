-- =============================================================================
-- 2026_07_12_053_city_districts_and_schools.sql
-- Round 20 items 4b/6: intra-city administrative districts (rayons).
-- NAMING NOTE: the existing public.districts table holds CITIES (historic
-- naming); the new public.city_districts table holds the rayons INSIDE a city
-- (Bakı → Yasamal, Nəsimi, …). Schools carry the district; students inherit it
-- through their school (single source of truth — never duplicated on students
-- or leaderboard rows).
--
-- * city_districts: admin-managed CRUD (linked to a city), public read.
-- * schools.city_district_id: nullable FK; a trigger rejects (a) mismatched
--   city/district pairs and (b) NEW schools without a district when the chosen
--   city has active districts. Existing schools stay valid (NULL = the manual
--   review list) and can still be edited — the requirement kicks in when the
--   district is being set/changed or the school is newly created.
-- * Seeds: Bakı's 12 official rayons + Gəncə's 2 (Kəpəz, Nizami). The
--   school→district BACKFILL ships separately (research-sourced data
--   migration) — only verifiable assignments, the rest stay in review.
--
-- Backports: 003 (table + column + trigger), 010 (RLS), 012 (seed),
-- 013 (#62). Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) table -----------------------------------------------------------------
create table if not exists public.city_districts (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references public.districts (id) on delete cascade,
  name       text not null,
  status     public.catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_city_districts_city_name unique (city_id, name)
);

comment on table public.city_districts is
  'Intra-city administrative districts/rayons (migration 053). city_id references '
  'public.districts (the CITIES table, historic naming). Admin-managed; schools link '
  'here and students inherit the district through their school.';

drop trigger if exists trg_set_updated_at on public.city_districts;
create trigger trg_set_updated_at before update on public.city_districts
  for each row execute function public.set_updated_at();

-- ---- 2) schools carry the district ---------------------------------------------
alter table public.schools
  add column if not exists city_district_id uuid
    references public.city_districts (id) on delete set null;

comment on column public.schools.city_district_id is
  'The school''s administrative district within its city (migration 053). NULL = '
  'not yet assigned (manual-review list). Leaderboard district derives from here.';

create index if not exists idx_schools_city_district on public.schools (city_district_id);

-- Guard: the district must belong to the school's city; NEW schools in a city
-- that has active districts must pick one. Existing NULL rows keep working
-- (edits that do not touch the district are allowed) so the backfill/review
-- flow can proceed gradually.
create or replace function public.school_district_guard()
returns trigger
language plpgsql
as $$
begin
  if new.city_district_id is not null then
    if not exists (
      select 1 from public.city_districts cd
      where cd.id = new.city_district_id and cd.city_id = new.district_id
    ) then
      raise exception 'school: district does not belong to the selected city'
        using errcode = 'check_violation';
    end if;
  elsif tg_op = 'INSERT' then
    if exists (
      select 1 from public.city_districts cd
      where cd.city_id = new.district_id and cd.status = 'active'
    ) then
      raise exception 'school: district is required for this city'
        using errcode = 'check_violation';
    end if;
  elsif tg_op = 'UPDATE' and old.city_district_id is not null then
    -- never silently unset an assigned district while the city has districts
    if exists (
      select 1 from public.city_districts cd
      where cd.city_id = new.district_id and cd.status = 'active'
    ) then
      raise exception 'school: district is required for this city'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_school_district_guard on public.schools;
create trigger trg_school_district_guard
  before insert or update of city_district_id, district_id on public.schools
  for each row execute function public.school_district_guard();

-- ---- 3) RLS ----------------------------------------------------------------------
alter table public.city_districts enable row level security;

drop policy if exists city_districts_read on public.city_districts;
create policy city_districts_read on public.city_districts
  for select to anon, authenticated using (true);

drop policy if exists city_districts_admin_write on public.city_districts;
create policy city_districts_admin_write on public.city_districts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.city_districts to anon, authenticated;
grant all on public.city_districts to service_role;

-- ---- 4) seeds: official rayons -----------------------------------------------------
-- Bakı's 12 administrative rayons — per the State Statistics Committee's
-- territorial classification these are the ONLY intra-city rayons in the
-- country (Gəncə's Kəpəz/Nizami were ABOLISHED 04.03.2022 — president.az
-- article 55708; verified by the Round-20 research pass). No other city gets
-- artificial subdivisions.
insert into public.city_districts (city_id, name)
select d.id, r.name
from public.districts d
cross join (values
  ('Binəqədi'), ('Qaradağ'), ('Xətai'), ('Xəzər'), ('Nərimanov'), ('Nəsimi'),
  ('Nizami'), ('Pirallahı'), ('Sabunçu'), ('Səbail'), ('Suraxanı'), ('Yasamal')
) r(name)
where d.name in ('Bakı', 'Baku', 'Bakı şəhəri')
on conflict (city_id, name) do nothing;

-- ---- self-verify --------------------------------------------------------------------
do $$
declare
  v_baku int;
begin
  if to_regclass('public.city_districts') is null then
    raise exception 'city_districts missing';
  end if;
  select count(*) into v_baku
    from public.city_districts cd
    join public.districts d on d.id = cd.city_id
   where d.name in ('Bakı', 'Baku', 'Bakı şəhəri');
  raise notice 'city_districts seeded: % Baku rayon(s).', v_baku;
  if not exists (select 1 from pg_trigger where tgname = 'trg_school_district_guard') then
    raise exception 'school district guard trigger missing';
  end if;
  -- guard smoke: mismatched pair must be rejected
  begin
    update public.schools s
       set city_district_id = (select cd.id from public.city_districts cd
                                where cd.city_id <> s.district_id limit 1)
     where s.id = (select id from public.schools limit 1);
    raise exception 'guard failed to reject a mismatched district';
  exception when check_violation then
    raise notice 'mismatch guard OK';
  end;
  raise notice 'city districts self-verify PASS';
end $$;

commit;
