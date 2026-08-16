-- =============================================================================
-- 015_olympiad_preparation.sql
-- =============================================================================
-- OlympIQ — canonical module file 015 (Olympiad Preparation).
--
-- Responsibility : "Olimpiada Hazırlığı" paid add-on — Admin-only packages + a
--                  curated question pool; PARENT one-time purchase grants the CHILD
--                  LIFETIME access. Each attempt = 25 server-side random questions
--                  from the package pool (users never choose difficulty). Provider-
--                  agnostic: pricing lives in our DB; real payment is Stage 11.
-- Run order      : After 001-012 + 014 (uses enums, subjects/grades/olympiad_types,
--                  questions, media_assets, profiles/students, helper funcs, and the
--                  inc-2 `checkout_sessions`/`payments` from 007). Run BEFORE the
--                  read-only 013 validation. Self-contained.
-- Safe to rerun  : Yes (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO
--                  NOTHING / DROP POLICY IF EXISTS + CREATE / CREATE OR REPLACE).
--
-- RULES:
--  * Admin-only CRUD (Content Managers are NOT allowed — like News/payments).
--  * Children can NEVER purchase; only the parent buys (payment-gated, service-role).
--  * NEVER delete a purchased package — archive listings only (FK on delete restrict);
--    purchasers keep lifetime access.
--  * Attempt/result tables are INTENTIONALLY DEFERRED to the unified test/attempt
--    engine (Stage 13/14) so attempts/responses/grading are modelled once for both
--    regular tests and olympiad. This file lays only the monetization + content pool.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- olympiad_packages : a purchasable Olympiad-Preparation listing.
-- -----------------------------------------------------------------------------
create table if not exists public.olympiad_packages (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,                 -- slug
  subject_id           uuid references public.subjects (id) on delete set null,
  grade_id             uuid references public.grades (id) on delete set null,
  olympiad_type_id     uuid references public.olympiad_types (id) on delete set null,
  cover_media_id       uuid references public.media_assets (id) on delete set null,
  price_amount         numeric(10,2) not null default 0,
  currency             text not null default 'AZN',
  questions_per_attempt integer not null default 25 check (questions_per_attempt >= 1 and questions_per_attempt <= 500), -- LIVE again (Round 51, migration 090): questions served per attempt, drawn via the per-student rotation below
  duration_minutes     int not null default 25 check (duration_minutes between 5 and 240), -- attempt time limit (migration 047; drives deadline_at)
  event_starts_at      timestamptz,                          -- planned event date shown to students (Round 8; NULL = undated). Exposed as event_at by get_public_olympiad_packages (migration 070).
  sale_starts_at       timestamptz,                          -- public sales window opens (migration 070; NULL = immediately once active)
  sale_ends_at         timestamptz,                          -- public sales window closes (migration 070; NULL = open-ended). Purchasers keep LIFETIME access after it.
  status               public.catalog_status not null default 'inactive', -- active = listed; archived = delisted (purchasers keep access)
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Rerun-safety for databases created before Round 8 (migration 021).
alter table public.olympiad_packages
  add column if not exists event_starts_at timestamptz;

-- Rerun-safety for databases created before the sales window (migration 070).
-- Publicly purchasable ⇔ active AND inside [sale_starts_at, sale_ends_at) —
-- see olympiad_package_on_sale below (THE canonical predicate). After the
-- window the package is hidden from public listing/purchase but stays
-- admin-visible and PURCHASERS KEEP lifetime access + attempts + history
-- (there is no entitlement expiry). The migration-070 one-time backfill
-- (sale_ends_at := event_starts_at where unset, carrying the migration-035
-- "past event = not sellable" rule) is intentionally NOT repeated here — it
-- would clobber an admin's explicit open-ended window on rerun.
alter table public.olympiad_packages
  add column if not exists sale_starts_at timestamptz,
  add column if not exists sale_ends_at   timestamptz;

do $$ begin
  alter table public.olympiad_packages
    add constraint chk_olympiad_sales_window
    check (sale_ends_at is null or sale_starts_at is null or sale_ends_at > sale_starts_at);
exception when duplicate_object then null; end $$;

comment on column public.olympiad_packages.sale_starts_at is
  'Public sales window opens (UTC, server-authoritative). NULL = on sale immediately once active.';
comment on column public.olympiad_packages.sale_ends_at is
  'Public sales window closes (UTC). NULL = open-ended. After it passes the package is hidden from public listing/purchase but stays admin-visible and PURCHASERS KEEP lifetime access + attempts + history (there is no entitlement expiry).';

comment on table public.olympiad_packages is
  'Olympiad-Preparation add-on listing (Admin-only). Parent buys; child gets LIFETIME access. Each attempt serves questions_per_attempt questions from the entitled grade''s published pool via a PER-STUDENT non-repeating rotation (Round 51, migration 090; the whole pool when it is smaller). Archive only — never delete purchased packages.';
comment on column public.olympiad_packages.event_starts_at is
  'Planned event date/time shown on the student "Olimpiadalar" tab (NULL = undated/planned).';

-- -----------------------------------------------------------------------------
-- olympiad_package_translations : localized title/description (az/en/ru).
-- -----------------------------------------------------------------------------
create table if not exists public.olympiad_package_translations (
  id                  uuid primary key default gen_random_uuid(),
  olympiad_package_id uuid not null references public.olympiad_packages (id) on delete cascade,
  locale              public.content_locale not null,
  title               text not null,
  description         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_olympiad_package_locale unique (olympiad_package_id, locale)
);

-- -----------------------------------------------------------------------------
-- olympiad_package_questions : the curated question pool for a package. The
-- attempt engine draws questions_per_attempt of the entitled grade's published
-- pool per attempt through the per-student rotation (Round 51, migration 090).
-- Mirrors test_questions. Pool membership is SENSITIVE (not exposed to students).
-- -----------------------------------------------------------------------------
create table if not exists public.olympiad_package_questions (
  olympiad_package_id uuid not null references public.olympiad_packages (id) on delete cascade,
  question_id         uuid not null references public.questions (id) on delete cascade,
  added_at            timestamptz not null default now(),
  primary key (olympiad_package_id, question_id)
);

-- -----------------------------------------------------------------------------
-- olympiad_purchases : PARENT buys a package for a CHILD → LIFETIME access.
-- Created/activated server-side on verified payment (never client-activated).
-- -----------------------------------------------------------------------------
create table if not exists public.olympiad_purchases (
  id                      uuid primary key default gen_random_uuid(),
  olympiad_package_id     uuid not null references public.olympiad_packages (id) on delete restrict, -- never delete purchased packages
  -- Audit M13/L13 (migration 036): purchase records survive account deletion —
  -- owner/student FKs anonymize (SET NULL) instead of blocking (old RESTRICT)
  -- or cascading the financial row away.
  owner_parent_profile_id uuid references public.profiles (id) on delete set null,
  student_profile_id      uuid references public.students (profile_id) on delete set null,
  checkout_session_id     uuid references public.checkout_sessions (id) on delete set null,
  amount                  numeric(10,2) not null default 0,
  currency                text not null default 'AZN',
  status                  text not null default 'pending'
                            check (status in ('pending', 'active', 'refunded')),
  purchased_at            timestamptz,
  provider                text,
  provider_payment_id     text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint uq_olympiad_purchase_child unique (student_profile_id, olympiad_package_id) -- one lifetime purchase per child/package
);

comment on table public.olympiad_purchases is
  'Parent-owned, child-access LIFETIME purchase of an olympiad package. status active = access granted (no expiry). Writes are service-role/admin only (payment-gated).';

-- Link payments to an olympiad purchase (symmetric with subscription/checkout links).
alter table public.payments
  add column if not exists olympiad_purchase_id uuid references public.olympiad_purchases (id) on delete set null;

-- Round 34 (migration 079): the entitlement grade SNAPSHOT (backfilled
-- further below, after olympiad_package_grades + its backfills exist).
alter table public.olympiad_purchases
  add column if not exists grade_id uuid references public.grades (id) on delete set null;

comment on column public.olympiad_purchases.grade_id is
  'Grade the entitlement was bought FOR (the child''s grade at purchase, '
  'validated against the package''s target grades). Attempts draw THIS '
  'grade''s pool, so yearly auto-promotion never re-points a lifetime '
  'purchase at a different grade''s questions. NULL = legacy purchase.';

-- -----------------------------------------------------------------------------
-- PRIVATE per-package question pool (Batch D). A question with a non-null
-- olympiad_package_id belongs PRIVATELY to that package: it is EXCLUDED from the
-- general question list and from practice random selection, and the olympiad
-- ATTEMPT engine (start_olympiad_attempt in 011) draws its random questions ONLY
-- from questions WHERE olympiad_package_id = the package. The legacy
-- olympiad_package_questions join table above is retained for compatibility but
-- is no longer the source the attempt engine reads. The column lives here (not
-- in 004) because it FKs olympiad_packages, which is created in this file.
-- -----------------------------------------------------------------------------
alter table public.questions
  add column if not exists olympiad_package_id uuid
    references public.olympiad_packages (id) on delete cascade;

-- Round 39 (migration 084): the daily-round draw predicate index. Lives in
-- 015 because the partial predicate needs olympiad_package_id (added above).
create index if not exists idx_questions_daily_pool
  on public.questions (subject_id, grade_id, term)
  where status = 'published' and olympiad_package_id is null;

comment on column public.questions.olympiad_package_id is
  'When set, this question is PRIVATE to that olympiad package and is excluded from the general question list and from practice random selection. NULL = general question.';

-- Audit M23 (migration 035): supports the admin questions list's default order
-- (general-pool filter + created_at desc). Lives here because the column above
-- is added in this file (after 011's index section).
create index if not exists idx_questions_pool_created
  on public.questions (olympiad_package_id, created_at desc);

create index if not exists idx_questions_olympiad_package
  on public.questions (olympiad_package_id);

-- =============================================================================
-- Round 34 (migration 079): MULTI-GRADE packages + per-grade pools.
-- olympiad_package_grades : package ↔ grade (normalized target set). Placed
-- AFTER questions.olympiad_package_id above — Backfill B reads it.
-- =============================================================================
create table if not exists public.olympiad_package_grades (
  olympiad_package_id uuid not null references public.olympiad_packages (id) on delete cascade,
  grade_id            uuid not null references public.grades (id) on delete restrict,
  created_at          timestamptz not null default now(),
  -- Migration 106: how many questions an attempt serves for THIS grade, and how
  -- long it runs. NULL = inherit the package-level value; the CHECKs mirror the
  -- package-level ranges exactly, so a per-grade value can never be something
  -- the package level would have rejected.
  questions_per_attempt integer
    constraint ck_opg_questions_per_attempt
    check (questions_per_attempt is null
           or (questions_per_attempt >= 1 and questions_per_attempt <= 500)),
  duration_minutes integer
    constraint ck_opg_duration_minutes
    check (duration_minutes is null
           or (duration_minutes >= 5 and duration_minutes <= 240)),
  primary key (olympiad_package_id, grade_id)
);

comment on column public.olympiad_package_grades.questions_per_attempt is
  'Migration 106: questions served per attempt for THIS grade. NULL = inherit '
  'olympiad_packages.questions_per_attempt.';
comment on column public.olympiad_package_grades.duration_minutes is
  'Migration 106: attempt time limit for THIS grade, in minutes. NULL = inherit '
  'olympiad_packages.duration_minutes.';

comment on table public.olympiad_package_grades is
  'Grades an olympiad package targets (Round 34 multi-grade). Each targeted '
  'grade has its OWN pool: questions WHERE olympiad_package_id = P AND '
  'grade_id = G. Legacy packages were backfilled from olympiad_packages.'
  'grade_id and from their pool questions'' grades. Empty set = pre-Round-34 '
  'legacy package with no grade targeting (visible to all, whole-pool play).';

create index if not exists idx_oly_pkg_grades_grade
  on public.olympiad_package_grades (grade_id);

-- Backfill A: the legacy single grade column.
insert into public.olympiad_package_grades (olympiad_package_id, grade_id)
select p.id, p.grade_id
from public.olympiad_packages p
where p.grade_id is not null
on conflict do nothing;

-- Backfill B: grades already present on pool questions (covers legacy packages
-- whose bulk files carried their own meta.grade_level before the package grade
-- became mandatory) — guarantees every existing pool question's grade is a
-- registered target, so the guard trigger below can never reject legacy data.
insert into public.olympiad_package_grades (olympiad_package_id, grade_id)
select distinct q.olympiad_package_id, q.grade_id
from public.questions q
where q.olympiad_package_id is not null
  and q.grade_id is not null
on conflict do nothing;

-- Backfill C: purchase-grade snapshots (needs the target rows above) —
-- the child's current grade when targeted, else the only target grade.
update public.olympiad_purchases pu
   set grade_id = s.grade_id
  from public.students s
 where pu.grade_id is null
   and s.profile_id = pu.student_profile_id
   and s.grade_id is not null
   and exists (select 1 from public.olympiad_package_grades g
                where g.olympiad_package_id = pu.olympiad_package_id
                  and g.grade_id = s.grade_id);

update public.olympiad_purchases pu
   set grade_id = g.grade_id
  from (select olympiad_package_id, (array_agg(grade_id))[1] as grade_id
          from public.olympiad_package_grades
         group by olympiad_package_id
        having count(*) = 1) g
 where pu.grade_id is null
   and g.olympiad_package_id = pu.olympiad_package_id;

-- -----------------------------------------------------------------------------
-- olympiad_question_rotations : PER (student, package, grade) rotation state
-- (Round 51, migration 090). seen_question_ids = the ids consumed SO FAR in
-- cycle_no; when the cycle is exhausted start_olympiad_attempt (011) starts a
-- fresh cycle over the full pool by REWRITING the array — one row is both the
-- state and the SELECT ... FOR UPDATE lock key that serialises concurrent
-- starts. grade_id NULL = legacy grade-less package (whole-pool path);
-- NULLS NOT DISTINCT keeps that case to exactly one row per student+package.
-- Written ONLY by start_olympiad_attempt (SECURITY DEFINER); students may read
-- their own row (RLS in 010).
-- -----------------------------------------------------------------------------
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
  'Round 51: per-student, per-package, per-GRADE olympiad question rotation. '
  'seen_question_ids = the ids already served inside cycle_no; when the cycle '
  'is exhausted start_olympiad_attempt increments cycle_no and starts a fresh '
  'cycle over the full pool. Written ONLY by start_olympiad_attempt (SECURITY '
  'DEFINER) under a row lock; students may read their own row.';

comment on column public.olympiad_question_rotations.grade_id is
  'Entitled grade pool this rotation belongs to. NULL = legacy grade-less '
  'package (whole-pool path). NULLS NOT DISTINCT on the unique index keeps the '
  'NULL case single-rowed.';

-- The lock key. NULLS NOT DISTINCT (PG 15+) lets the legacy grade-less row
-- participate in the unique-violation insert-race retry.
create unique index if not exists uq_olympiad_rotation_student_pkg_grade
  on public.olympiad_question_rotations (student_profile_id, olympiad_package_id, grade_id)
  nulls not distinct;

create index if not exists idx_olympiad_rotation_package
  on public.olympiad_question_rotations (olympiad_package_id);

drop trigger if exists trg_set_updated_at on public.olympiad_question_rotations;
create trigger trg_set_updated_at
  before update on public.olympiad_question_rotations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Legacy-column sync: olympiad_packages.grade_id mirrors the grade set —
--    the single member when |set| = 1, NULL otherwise. Old readers (deployed
--    mobile builds, get_public_olympiad_packages legacy columns) stay correct
--    for single-grade packages and honestly grade-less for multi-grade ones.
-- -----------------------------------------------------------------------------
create or replace function public.sync_olympiad_package_legacy_grade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg   uuid := coalesce(new.olympiad_package_id, old.olympiad_package_id);
  v_grade uuid;
begin
  select case when count(*) = 1 then (array_agg(g.grade_id))[1] end
    into v_grade
  from public.olympiad_package_grades g
  where g.olympiad_package_id = v_pkg;
  update public.olympiad_packages p
     set grade_id = v_grade
   where p.id = v_pkg
     and p.grade_id is distinct from v_grade;
  return null;
end;
$$;

drop trigger if exists trg_sync_oly_legacy_grade on public.olympiad_package_grades;
create trigger trg_sync_oly_legacy_grade
  after insert or update or delete on public.olympiad_package_grades
  for each row execute function public.sync_olympiad_package_legacy_grade();

-- One-time reconciliation: packages that gained a second grade row from
-- Backfill B must drop the now-misleading single grade_id.
update public.olympiad_packages p
   set grade_id = null
 where p.grade_id is not null
   and (select count(*) from public.olympiad_package_grades g
         where g.olympiad_package_id = p.id) > 1;

-- -----------------------------------------------------------------------------
-- 3) Pool-question grade guard: a question that is PRIVATE to a package must
--    carry one of that package's target grades (when the package has any).
--    Grade-less pool rows are tolerated for legacy safety only.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_pool_grade_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.olympiad_package_id is not null and new.grade_id is not null then
    if exists (select 1 from public.olympiad_package_grades g
                where g.olympiad_package_id = new.olympiad_package_id)
       and not exists (select 1 from public.olympiad_package_grades g
                        where g.olympiad_package_id = new.olympiad_package_id
                          and g.grade_id = new.grade_id) then
      raise exception 'olympiad pool: question grade is not a target grade of the package'
        using errcode = 'check_violation', hint = 'pool_grade_not_targeted';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_olympiad_pool_grade_guard on public.questions;
create trigger trg_olympiad_pool_grade_guard
  before insert or update of olympiad_package_id, grade_id on public.questions
  for each row execute function public.olympiad_pool_grade_guard();



-- -----------------------------------------------------------------------------
-- Storage bucket: olympiad-media (package cover images). Public read; admin write.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('olympiad-media', 'olympiad-media', true, 5242880,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "public read olympiad-media" on storage.objects;
create policy "public read olympiad-media" on storage.objects for select
  using (bucket_id = 'olympiad-media');
drop policy if exists "admin manage olympiad-media" on storage.objects;
create policy "admin manage olympiad-media" on storage.objects for all to authenticated
  using (bucket_id = 'olympiad-media' and public.is_admin())
  with check (bucket_id = 'olympiad-media' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_olympiad_packages_status on public.olympiad_packages (status);
create index if not exists idx_olympiad_packages_subject on public.olympiad_packages (subject_id);
create index if not exists idx_olympiad_pkg_tr_package on public.olympiad_package_translations (olympiad_package_id);
create index if not exists idx_olympiad_pkg_questions_question on public.olympiad_package_questions (question_id);
create index if not exists idx_olympiad_purchases_owner on public.olympiad_purchases (owner_parent_profile_id);
create index if not exists idx_olympiad_purchases_student on public.olympiad_purchases (student_profile_id);
create index if not exists idx_olympiad_purchases_package on public.olympiad_purchases (olympiad_package_id);

-- -----------------------------------------------------------------------------
-- updated_at + audit triggers
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.olympiad_packages;
create trigger trg_set_updated_at before update on public.olympiad_packages
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.olympiad_package_translations;
create trigger trg_set_updated_at before update on public.olympiad_package_translations
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.olympiad_purchases;
create trigger trg_set_updated_at before update on public.olympiad_purchases
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_olympiad_packages on public.olympiad_packages;
create trigger trg_audit_olympiad_packages
  after insert or update or delete on public.olympiad_packages
  for each row execute function public.fn_audit_row();
drop trigger if exists trg_audit_olympiad_purchases on public.olympiad_purchases;
create trigger trg_audit_olympiad_purchases
  after insert or update or delete on public.olympiad_purchases
  for each row execute function public.fn_audit_row();

-- Package-published notification (migration 076): the package CREATOR (content
-- manager / admin) is notified when their package goes live. Recipient-scoped
-- (private), idempotent per package. Lives here because olympiad_packages +
-- translations are defined in this file. (The R74 new-purchase admin alert was
-- removed in 076 — admins are no longer auto-notified of every purchase.)
create or replace function public.notify_package_published_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_title text;
begin
  begin
    if new.created_by is not null then
      select coalesce(nullif(btrim(t.title), ''), 'Olimpiada paketi') into v_title
        from public.olympiad_package_translations t
        where t.olympiad_package_id = new.id and t.locale = 'az' limit 1;
      perform public.create_notification(
        new.created_by, 'olympiad_package_published', 'Paket dərc olundu',
        '"' || coalesce(v_title, 'Olimpiada paketi') || '" paketi indi aktivdir.',
        jsonb_build_object('package_id', new.id, 'title', v_title),
        array['in_app'], 'pkgpub:' || new.id::text, 4, '/olympiad', 'admin', null);
    end if;
  exception when others then raise warning 'notify_package_published failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_package_published on public.olympiad_packages;
create trigger trg_notify_package_published
  after insert or update of status on public.olympiad_packages
  for each row when (new.status = 'active')
  execute function public.notify_package_published_tg();

-- -----------------------------------------------------------------------------
-- Baseline privileges (RLS gates rows). Pool + purchases are NOT anon-readable.
-- -----------------------------------------------------------------------------
grant select on public.olympiad_packages, public.olympiad_package_translations
  to anon, authenticated, service_role;
grant select on public.olympiad_package_questions, public.olympiad_purchases
  to authenticated, service_role;
grant insert, update, delete on
  public.olympiad_packages, public.olympiad_package_translations,
  public.olympiad_package_questions, public.olympiad_purchases
  to authenticated;
grant all on
  public.olympiad_packages, public.olympiad_package_translations,
  public.olympiad_package_questions, public.olympiad_purchases
  to service_role;

-- -----------------------------------------------------------------------------
-- Sales-window helpers (backported from migrations/2026_07_18_070_olympiad_sales_window.sql).
-- Defined BEFORE the RLS section because the select policies delegate to them.
-- -----------------------------------------------------------------------------
-- THE canonical on-sale predicate (single definition — reused by RLS,
-- purchase_olympiad in 011 and get_public_olympiad_packages below; never
-- re-inline it).
create or replace function public.olympiad_package_on_sale(
  p_status public.catalog_status,
  p_starts timestamptz,
  p_ends   timestamptz
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_status = 'active'
     and (p_starts is null or p_starts <= now())
     and (p_ends   is null or p_ends   >  now())
$$;
comment on function public.olympiad_package_on_sale(public.catalog_status, timestamptz, timestamptz) is
  'THE public-sale predicate for olympiad packages (migration 070): active AND '
  'inside [sale_starts_at, sale_ends_at). Server now() is authoritative. Reused '
  'by RLS, purchase_olympiad and get_public_olympiad_packages — never re-inline it.';
revoke all on function public.olympiad_package_on_sale(public.catalog_status, timestamptz, timestamptz) from public;
grant execute on function public.olympiad_package_on_sale(public.catalog_status, timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- Package visibility = on sale OR admin OR purchase-family. DEFINER so the
-- packages and translations policies share ONE evaluation (and the nested
-- purchases/students reads never depend on those tables' own RLS). The family
-- rule mirrors olympiad_purchases_select EXACTLY: purchasers keep reading a
-- package after the sales window forever (lifetime access, no entitlement
-- expiry).
create or replace function public.can_view_olympiad_package(p_package_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.olympiad_packages p
    where p.id = p_package_id
      and (
        public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
        or public.is_admin()
        or exists (
             select 1 from public.olympiad_purchases pu
             where pu.olympiad_package_id = p.id
               and (
                 pu.owner_parent_profile_id = public.current_profile_id()
                 or pu.student_profile_id = public.current_profile_id()
                 or public.is_parent_linked_to_student(pu.student_profile_id)
                 or exists (select 1 from public.students s
                            where s.profile_id = pu.student_profile_id
                              and s.created_by_parent_profile_id = public.current_profile_id())
               )
           )
      )
  )
$$;
comment on function public.can_view_olympiad_package(uuid) is
  'Row visibility for olympiad packages + their translations (migration 070): '
  'on sale (olympiad_package_on_sale) OR admin OR anyone in the purchase family '
  '(purchaser parent / the child / active linked parent / creator parent — the '
  'olympiad_purchases_select rule). Purchasers keep reading a package after the '
  'sales window forever (lifetime access, no entitlement expiry).';
revoke all on function public.can_view_olympiad_package(uuid) from public;
grant execute on function public.can_view_olympiad_package(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.olympiad_packages enable row level security;
alter table public.olympiad_package_translations enable row level security;
alter table public.olympiad_package_questions enable row level security;
alter table public.olympiad_purchases enable row level security;

-- Packages (migration 070): public read ONLY while on sale; the purchase
-- family + admins always. Admin-only writes.
drop policy if exists "olympiad_packages_select" on public.olympiad_packages;
create policy "olympiad_packages_select" on public.olympiad_packages for select
  using (public.can_view_olympiad_package(id));
drop policy if exists "olympiad_packages_write" on public.olympiad_packages;
create policy "olympiad_packages_write" on public.olympiad_packages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Package translations follow the package's visibility 1:1 (same helper —
-- cannot drift); Admin writes.
drop policy if exists "olympiad_pkg_tr_select" on public.olympiad_package_translations;
create policy "olympiad_pkg_tr_select" on public.olympiad_package_translations for select
  using (public.can_view_olympiad_package(olympiad_package_id));
drop policy if exists "olympiad_pkg_tr_write" on public.olympiad_package_translations;
create policy "olympiad_pkg_tr_write" on public.olympiad_package_translations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pool membership is sensitive: Admin-only (service role bypasses RLS for the engine).
drop policy if exists "olympiad_pkg_questions_admin" on public.olympiad_package_questions;
create policy "olympiad_pkg_questions_admin" on public.olympiad_package_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Purchases: owner parent + the child + linked parent + admin can read; writes
-- are Admin/service-role only (payment-gated — parents never self-write a purchase).
drop policy if exists "olympiad_purchases_select" on public.olympiad_purchases;
create policy "olympiad_purchases_select" on public.olympiad_purchases for select to authenticated
  using (
    owner_parent_profile_id = public.current_profile_id()
    or student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
  );
drop policy if exists "olympiad_purchases_write" on public.olympiad_purchases;
create policy "olympiad_purchases_write" on public.olympiad_purchases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 5) RLS + grants for the new table. Reads follow the package's visibility
--    helper 1:1 (grade targeting is catalog data, not sensitive pool content);
--    writes are Admin-only, same as the package row.
-- -----------------------------------------------------------------------------
alter table public.olympiad_package_grades enable row level security;

drop policy if exists "oly_pkg_grades_select" on public.olympiad_package_grades;
create policy "oly_pkg_grades_select" on public.olympiad_package_grades for select
  using (public.can_view_olympiad_package(olympiad_package_id));
drop policy if exists "oly_pkg_grades_write" on public.olympiad_package_grades;
create policy "oly_pkg_grades_write" on public.olympiad_package_grades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.olympiad_package_grades to anon, authenticated, service_role;
grant insert, update, delete on public.olympiad_package_grades to authenticated;
grant all on public.olympiad_package_grades to service_role;

-- -----------------------------------------------------------------------------
-- RLS + grants for olympiad_question_rotations (Round 51, migration 090).
-- ONE select policy (own row / admin); NO insert/update/delete policy — the
-- SECURITY DEFINER start_olympiad_attempt is the single writer. Belt and
-- braces on top of RLS: explicit revokes so a student can never wipe their own
-- rotation row to farm repeats, even if a policy is added carelessly later.
-- -----------------------------------------------------------------------------
alter table public.olympiad_question_rotations enable row level security;

drop policy if exists "olympiad_rotations_select_own" on public.olympiad_question_rotations;
create policy "olympiad_rotations_select_own" on public.olympiad_question_rotations
  for select to authenticated
  using (student_profile_id = public.current_profile_id() or public.is_admin());

revoke insert, update, delete, truncate
  on public.olympiad_question_rotations from anon, authenticated;
revoke select on public.olympiad_question_rotations from anon;
grant  select on public.olympiad_question_rotations to authenticated;
grant  all    on public.olympiad_question_rotations to service_role;

-- Round 51 (migration 090): arm the activation pool guard. The guard function
-- pair lives in 011 (functions run before tables in the canonical order);
-- the trigger can only be created HERE, once olympiad_packages exists.
drop trigger if exists trg_olympiad_activation_pool_guard on public.olympiad_packages;
create trigger trg_olympiad_activation_pool_guard
  before insert or update on public.olympiad_packages
  for each row execute function public.olympiad_activation_pool_guard();

-- -----------------------------------------------------------------------------
-- Migration 106 — the ONE definition of "what applies to this (package, grade)".
--
-- Every reader goes through this: the attempt engine, the activation guards and
-- the admin surfaces. A second coalesce written out by hand somewhere else is
-- how the grade and the package start disagreeing.
--
-- p_grade_id NULL = a legacy grade-less package → the package row's values.
-- A SQL-language function, so it lives HERE rather than in 011: its body is validated at
-- CREATE time and olympiad_package_grades must already exist.
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
  'by the attempt engine, the activation guards and the admin surfaces.';

revoke all on function public.olympiad_grade_config(uuid, uuid) from public, anon;
grant execute on function public.olympiad_grade_config(uuid, uuid) to authenticated, service_role;

-- Migration 107: the activation guard above fires on olympiad_packages, but the
-- per-grade counts live on olympiad_package_grades — so adding a target grade
-- to an ACTIVE package, or raising one grade's count, used to skip validation
-- entirely. This arms the guard on the grade rows themselves.
drop trigger if exists trg_olympiad_grade_pool_guard on public.olympiad_package_grades;
create trigger trg_olympiad_grade_pool_guard
  before insert or update on public.olympiad_package_grades
  for each row execute function public.olympiad_grade_pool_guard();

-- -----------------------------------------------------------------------------
-- get_olympiad_pool_counts (Round 21) : the REAL published-question count per
-- package — the headline number every card shows. questions_per_attempt is a
-- SEPARATE number (LIVE again since Round 51: what one attempt serves) and is
-- displayed as its own labelled row, never in place of the pool count.
-- SECURITY DEFINER so parents/children get correct counts regardless of
-- row-level visibility; returns counts only.
-- -----------------------------------------------------------------------------
drop function if exists public.get_olympiad_pool_counts(uuid[]);
drop function if exists public.get_olympiad_pool_counts(uuid[], uuid);

create function public.get_olympiad_pool_counts(
  p_package_ids uuid[],
  p_grade_id    uuid default null
)
returns table (package_id uuid, question_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_package_ids is null or cardinality(p_package_ids) = 0 then
    return;
  end if;
  if cardinality(p_package_ids) > 100 then
    raise exception 'olympiad pool counts: too many package ids' using errcode = 'check_violation';
  end if;
  return query
    select q.olympiad_package_id, count(*)::int
    from public.questions q
    where q.olympiad_package_id = any(p_package_ids)
      and q.status = 'published'
      and (p_grade_id is null or q.grade_id = p_grade_id)
    group by q.olympiad_package_id;
end;
$$;
comment on function public.get_olympiad_pool_counts(uuid[], uuid) is
  'Real published pool size per olympiad package (Round 21) — Round 34 adds '
  'optional p_grade_id to count ONE grade pool (what a specific child will '
  'actually receive). Counts only; RLS-proof.';
revoke all on function public.get_olympiad_pool_counts(uuid[], uuid) from public, anon;
grant execute on function public.get_olympiad_pool_counts(uuid[], uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- get_public_olympiad_packages (backported from migrations/2026_07_18_070 +
-- 2026_07_19_072): the landing/parent/mobile "buyable olympiads" feed.
-- DEFINER + anon-callable, so the row filter INSIDE is the security boundary:
-- ONLY on-sale packages ever leave this function (no draft/inactive/archived/
-- off-sale leakage). Counts reuse the get_olympiad_pool_counts rule (published
-- private-pool questions). event_at = event_starts_at (the Round-8 column,
-- renamed only in this API surface). Migration 072: optional p_limit (null or
-- < 1 = all rows, else capped at 100) — ONE function with a defaulted arg, so
-- zero-arg callers (web + mobile rpc with no args) resolve to it unchanged.
-- -----------------------------------------------------------------------------
-- Signature changed in 072: drop the legacy zero-arg overload if this file is
-- re-run over a pre-072 database (from-zero it is a no-op) so exactly ONE
-- function ever exists and no-arg calls can never be ambiguous.
-- Signature changed in 072 (p_limit) and again in 079 (grade_levels int[]):
-- drop BOTH prior shapes so exactly ONE function ever exists.
drop function if exists public.get_public_olympiad_packages();
drop function if exists public.get_public_olympiad_packages(int);

create function public.get_public_olympiad_packages(p_limit int default null)
returns table (
  id             uuid,
  code           text,
  title_az       text,
  title_en       text,
  title_ru       text,
  description_az text,
  description_en text,
  description_ru text,
  price_amount   numeric(10,2),
  currency       text,
  subject_code   text,
  subject_name   text,
  grade_level    int,
  grade_label    text,
  grade_levels   int[],
  sale_ends_at   timestamptz,
  event_at       timestamptz,
  question_count int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.code,
    coalesce(t_az.title, p.code)                          as title_az,
    coalesce(t_en.title, t_az.title, p.code)              as title_en,
    coalesce(t_ru.title, t_az.title, p.code)              as title_ru,
    t_az.description                                      as description_az,
    coalesce(t_en.description, t_az.description)          as description_en,
    coalesce(t_ru.description, t_az.description)          as description_ru,
    p.price_amount,
    p.currency,
    s.code                                                as subject_code,
    s.name                                                as subject_name,
    g.level::int                                          as grade_level,
    g.name                                                as grade_label,
    gl.levels                                             as grade_levels,
    p.sale_ends_at,
    p.event_starts_at                                     as event_at,
    coalesce(qc.n, 0)                                     as question_count
  from public.olympiad_packages p
  left join public.olympiad_package_translations t_az
         on t_az.olympiad_package_id = p.id and t_az.locale = 'az'
  left join public.olympiad_package_translations t_en
         on t_en.olympiad_package_id = p.id and t_en.locale = 'en'
  left join public.olympiad_package_translations t_ru
         on t_ru.olympiad_package_id = p.id and t_ru.locale = 'ru'
  left join public.subjects s on s.id = p.subject_id
  left join public.grades   g on g.id = p.grade_id
  left join lateral (
    -- Round 34: the full ordered target-grade set (NULL for legacy grade-less).
    select array_agg(gg.level::int order by gg.level) as levels
    from public.olympiad_package_grades pg
    join public.grades gg on gg.id = pg.grade_id
    where pg.olympiad_package_id = p.id
  ) gl on true
  left join lateral (
    -- get_olympiad_pool_counts parity: REAL published pool size — the headline
    -- count (questions_per_attempt is its own separate per-attempt figure).
    select count(*)::int as n
    from public.questions q
    where q.olympiad_package_id = p.id
      and q.status = 'published'
  ) qc on true
  where public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
  order by least(p.sale_ends_at, p.event_starts_at) asc nulls last,
           coalesce(t_az.title, p.code) asc
  -- Migration 072: optional cap. null/<1 = no limit (pre-072 behavior).
  limit case when p_limit is null or p_limit < 1 then null else least(p_limit, 100) end
$$;
comment on function public.get_public_olympiad_packages(int) is
  'Anon-callable catalog of PUBLICLY PURCHASABLE olympiad packages (migration '
  '070): only rows passing olympiad_package_on_sale, with trilingual texts (az '
  'fallback), price, subject/grade context, sale_ends_at, event_at and the REAL '
  'published pool count. Round 34: grade_levels int[] carries the FULL target '
  'set (legacy single grade_level/grade_label kept for old readers). Migration '
  '072: optional p_limit (null or < 1 = all rows, else capped at 100).';
revoke all on function public.get_public_olympiad_packages(int) from public;
grant execute on function public.get_public_olympiad_packages(int) to anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 11) get_my_olympiad_catalog — role-aware, SERVER-enforced storefront filter.
--     Round 40: an optional LINKED-child selector scopes a parent to that
--     child's grade (the selected child is the single source of truth);
--     no selection keeps the Round-34 family union; students see their own
--     grade. Link + grade always resolved server-side.
-- -----------------------------------------------------------------------------
drop function if exists public.get_my_olympiad_catalog();
drop function if exists public.get_my_olympiad_catalog(uuid);
create function public.get_my_olympiad_catalog(p_student uuid default null)
returns table (
  id               uuid,
  title_az         text,
  title_en         text,
  title_ru         text,
  description_az   text,
  description_en   text,
  description_ru   text,
  price_amount     numeric(10,2),
  currency         text,
  duration_minutes int,
  event_at         timestamptz,
  sale_starts_at   timestamptz,
  sale_ends_at     timestamptz,
  cover_bucket     text,
  cover_path       text,
  subject_code     text,
  subject_name     text,
  olympiad_type    text,
  grades           jsonb,
  my_question_count int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_grades  uuid[];
  v_student boolean := false;
begin
  if v_profile is null then return; end if;

  -- Student → own grade (p_student may only be NULL or the caller itself).
  select array[s.grade_id] into v_grades
  from public.students s
  where s.profile_id = v_profile and s.grade_id is not null;
  v_student := found;
  if v_student and p_student is not null and p_student <> v_profile then
    raise exception 'catalog: not allowed' using errcode = 'insufficient_privilege';
  end if;

  if not v_student then
    if p_student is not null then
      -- Round 40: ONE selected child — the link and the grade are resolved
      -- server-side (clients can never widen the scope or pass a grade).
      select array[s.grade_id] into v_grades
      from public.students s
      where s.profile_id = p_student and s.grade_id is not null
        and (s.created_by_parent_profile_id = v_profile
             or exists (select 1 from public.parent_student_links l
                         where l.parent_profile_id = v_profile
                           and l.student_profile_id = s.profile_id
                           and l.status = 'active'));
      if v_grades is null then
        -- Not linked (or the child has no grade): linked-but-gradeless gets an
        -- empty feed; an UNLINKED id is an authorization error.
        if exists (select 1 from public.students s
                    where s.profile_id = p_student
                      and (s.created_by_parent_profile_id = v_profile
                           or exists (select 1 from public.parent_student_links l
                                       where l.parent_profile_id = v_profile
                                         and l.student_profile_id = s.profile_id
                                         and l.status = 'active'))) then
          return;
        end if;
        raise exception 'catalog: not allowed' using errcode = 'insufficient_privilege';
      end if;
    else
      -- Back-compat: no selection → union of the children's grades (Round 34).
      select array_agg(distinct s.grade_id) into v_grades
      from public.students s
      where s.grade_id is not null
        and (s.created_by_parent_profile_id = v_profile
             or exists (select 1 from public.parent_student_links l
                         where l.parent_profile_id = v_profile
                           and l.student_profile_id = s.profile_id
                           and l.status = 'active'));
      -- A parent with no children has nobody to buy for → graceful empty feed.
      if v_grades is null then return; end if;
    end if;
  end if;

  return query
  select
    p.id,
    coalesce(t_az.title, p.code),
    coalesce(t_en.title, t_az.title, p.code),
    coalesce(t_ru.title, t_az.title, p.code),
    t_az.description,
    coalesce(t_en.description, t_az.description),
    coalesce(t_ru.description, t_az.description),
    p.price_amount,
    p.currency,
    p.duration_minutes,
    p.event_starts_at,
    p.sale_starts_at,
    p.sale_ends_at,
    m.bucket,
    m.path,
    s.code,
    s.name,
    ot.name,
    coalesce(gj.grades, '[]'::jsonb),
    coalesce(myc.n, 0)
  from public.olympiad_packages p
  left join public.olympiad_package_translations t_az
         on t_az.olympiad_package_id = p.id and t_az.locale = 'az'
  left join public.olympiad_package_translations t_en
         on t_en.olympiad_package_id = p.id and t_en.locale = 'en'
  left join public.olympiad_package_translations t_ru
         on t_ru.olympiad_package_id = p.id and t_ru.locale = 'ru'
  left join public.subjects s on s.id = p.subject_id
  left join public.olympiad_types ot on ot.id = p.olympiad_type_id
  left join public.media_assets m on m.id = p.cover_media_id
  left join lateral (
    -- Full target set with PER-GRADE published pool counts (what each grade's
    -- child will actually receive), sorted by level.
    select jsonb_agg(jsonb_build_object(
             'grade_id', g.grade_id, 'level', gr.level, 'name', gr.name,
             'question_count', coalesce(qc.n, 0))
           order by gr.level) as grades
    from public.olympiad_package_grades g
    join public.grades gr on gr.id = g.grade_id
    left join lateral (
      select count(*)::int as n from public.questions q
      where q.olympiad_package_id = p.id and q.grade_id = g.grade_id
        and q.status = 'published'
    ) qc on true
    where g.olympiad_package_id = p.id
  ) gj on true
  left join lateral (
    -- What the SCOPED audience would actually receive: published questions of
    -- the caller-relevant grades (all grades when the package is legacy
    -- grade-less). Student: own grade; parent: the SELECTED child's grade
    -- (Round 40) or all matching children grades when unscoped.
    select count(*)::int as n
    from public.questions q
    where q.olympiad_package_id = p.id
      and q.status = 'published'
      and (
        not exists (select 1 from public.olympiad_package_grades g2
                     where g2.olympiad_package_id = p.id)
        or q.grade_id = any(v_grades)
      )
  ) myc on true
  where public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
    and (
      not exists (select 1 from public.olympiad_package_grades g
                   where g.olympiad_package_id = p.id)         -- legacy grade-less
      or exists (select 1 from public.olympiad_package_grades g
                  where g.olympiad_package_id = p.id
                    and g.grade_id = any(v_grades))
    )
  order by least(p.sale_ends_at, p.event_starts_at) asc nulls last,
           coalesce(t_az.title, p.code) asc;
end;
$$;
comment on function public.get_my_olympiad_catalog(uuid) is
  'Role-aware BUYABLE olympiad catalog (Round 40): a student sees only on-sale '
  'packages covering THEIR grade; a parent passing a LINKED child sees only that '
  'child''s grade (the selected child is the single source of truth — link and '
  'grade resolved server-side); a parent without a selection keeps the family '
  'union. Card data only, incl. per-grade published pool counts; never pool '
  'content. Purchases stay readable forever via olympiad_purchases.';
revoke all on function public.get_my_olympiad_catalog(uuid) from public, anon;
grant execute on function public.get_my_olympiad_catalog(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12) remove_olympiad_package_grade — THE grade-detach path (Admin-only).
--     Refuses while any purchase entitles that grade (lifetime access is
--     non-negotiable); otherwise ARCHIVES the grade's pool questions (rows are
--     kept — answered questions can never be hard-deleted anyway) and drops
--     the target row. The legacy-sync trigger then re-derives grade_id.
-- -----------------------------------------------------------------------------
create or replace function public.remove_olympiad_package_grade(
  p_package_id uuid,
  p_grade_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining int;
  v_archived  int;
begin
  if not public.is_admin() then
    raise exception 'remove_olympiad_package_grade: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.olympiad_package_grades
                  where olympiad_package_id = p_package_id and grade_id = p_grade_id) then
    raise exception 'remove_olympiad_package_grade: grade is not a package target'
      using errcode = 'no_data_found';
  end if;

  -- A package must keep at least one target grade (grade-less is a legacy
  -- state, never a state an edit can produce).
  select count(*) into v_remaining from public.olympiad_package_grades
   where olympiad_package_id = p_package_id;
  if v_remaining <= 1 then
    raise exception 'remove_olympiad_package_grade: a package needs at least one grade'
      using errcode = 'check_violation', hint = 'last_grade';
  end if;

  -- Lifetime access: any purchase entitled to this grade blocks removal.
  if exists (select 1 from public.olympiad_purchases pu
              where pu.olympiad_package_id = p_package_id
                and pu.status = 'active'
                and (pu.grade_id = p_grade_id
                     -- Legacy snapshot-less purchases: the child's current
                     -- grade decides which pool they play — treat a match as
                     -- entitled to this grade.
                     or (pu.grade_id is null and exists (
                           select 1 from public.students st
                           where st.profile_id = pu.student_profile_id
                             and st.grade_id = p_grade_id)))) then
    raise exception 'remove_olympiad_package_grade: purchased entitlements exist for this grade'
      using errcode = 'check_violation', hint = 'grade_has_purchases';
  end if;

  -- Data retention: ARCHIVE the grade's pool (never delete — the DB guard
  -- forbids deleting answered questions, and archived rows stay restorable).
  update public.questions
     set status = 'archived', updated_at = now()
   where olympiad_package_id = p_package_id
     and grade_id = p_grade_id
     and status <> 'archived';
  get diagnostics v_archived = row_count;

  delete from public.olympiad_package_grades
   where olympiad_package_id = p_package_id and grade_id = p_grade_id;

  return jsonb_build_object('removed_grade', p_grade_id, 'archived_questions', v_archived);
end;
$$;
comment on function public.remove_olympiad_package_grade(uuid, uuid) is
  'Admin-only: detach a target grade from an olympiad package. Blocked while '
  'any active purchase entitles that grade (hint grade_has_purchases) or when '
  'it is the last grade (hint last_grade); otherwise the grade''s pool '
  'questions are ARCHIVED (never deleted) and the target row removed.';
revoke all on function public.remove_olympiad_package_grade(uuid, uuid) from public, anon;
grant execute on function public.remove_olympiad_package_grade(uuid, uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 13) GUARDED DELETION — the olympiad half (migration 111).
--     remove_olympiad_package_grade above stays UNTOUCHED as the SAFE,
--     archive-only path the UI offers first; these are the destructive ones.
--     They live here and not in 011 because trg_olympiad_package_delete_guard
--     needs a table this file creates. The shared question-purge helper
--     (public.purge_question_set) is in 011, which runs first.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- olympiad_package_deletion_blocks : the three reasons a package may not be
-- deleted. Shared by the preview, the RPC and trg_olympiad_package_delete_guard.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_package_deletion_blocks(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  n      int;
  v_pool uuid[];
begin
  -- 1. LIFETIME ACCESS. Any purchase row in any status. The FK is already
  --    RESTRICT, but it raises a bare 23503; this raises a countable reason the
  --    panel can turn into "N people bought this — archive it instead".
  select count(*)::int into n
  from public.olympiad_purchases where olympiad_package_id = p_package_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_has_purchases', 'count', n);
  end if;

  -- 2. An ACTIVE listing must be archived first. Deleting a live catalog entry
  --    in one click is how a package vanishes from under a browsing parent; an
  --    irreversible destruction of a whole product gets two deliberate steps.
  select count(*)::int into n
  from public.olympiad_packages
  where id = p_package_id and status = 'active';
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_is_active', 'count', n);
  end if;

  -- 3. An attempt in flight. Also the mitigation for the delete/answer race in
  --    purge_question_set: an answer row can only appear through a submit RPC
  --    on an in-progress attempt.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_pool
  from public.questions q where q.olympiad_package_id = p_package_id;
  select count(*)::int into n
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_pool;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.olympiad_package_deletion_blocks(uuid) is
  'Service-internal (migration 111): the reasons an olympiad package may not be '
  'deleted, as a jsonb array of {hint, count} — package_has_purchases, '
  'package_is_active, live_attempts. Empty array = deletable.';
revoke all on function public.olympiad_package_deletion_blocks(uuid) from public, anon, authenticated;
grant execute on function public.olympiad_package_deletion_blocks(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- olympiad_grade_purchase_count : THE definition of "somebody paid for this
-- (package, grade)".
--
-- Extracted verbatim out of olympiad_grade_pool_blocks, which now calls it. Two
-- callers needed the same predicate and a second copy is how they start
-- disagreeing — which is precisely the gap this migration was rejected for.
--
-- Two properties are deliberate and must not be "tidied":
--   * ANY STATUS counts. olympiad_purchases also allows 'pending' and
--     'refunded', and purchase_olympiad re-activates a refunded row IN PLACE,
--     keeping its grade_id — so a purchase that is merely dormant today becomes
--     an active lifetime entitlement tomorrow, onto a pool that would no longer
--     be servable. remove_olympiad_package_grade's active-only predicate is
--     correct for a restorable ARCHIVE and wrong for anything irreversible.
--   * The grade_id-is-null branch is the legacy snapshot-less purchase: such a
--     purchase plays whichever pool matches the child's CURRENT grade, so that
--     child is entitled to this grade too.
-- p_grade_id IS NULL means "the whole package" — the legacy grade-less package,
-- whose questions carry no grade either.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_purchase_count(
  p_package_id uuid,
  p_grade_id   uuid
)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.olympiad_purchases pu
  where pu.olympiad_package_id = p_package_id
    and (p_grade_id is null
         or pu.grade_id = p_grade_id
         or (pu.grade_id is null and exists (
               select 1 from public.students st
               where st.profile_id = pu.student_profile_id
                 and st.grade_id = p_grade_id)));
$$;

comment on function public.olympiad_grade_purchase_count(uuid, uuid) is
  'Service-internal (migration 112): how many purchases entitle one (package, '
  'grade) — counting EVERY status, and matching legacy grade-less purchases '
  'through the student''s current grade. THE single definition of "somebody '
  'paid for this pool": olympiad_grade_pool_blocks and '
  'olympiad_pool_purchase_blocks both call it so the whole-pool and the '
  'per-selection guard can never disagree. p_grade_id NULL = the whole package.';

revoke all on function public.olympiad_grade_purchase_count(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.olympiad_grade_purchase_count(uuid, uuid) to service_role;


-- -----------------------------------------------------------------------------
-- olympiad_grade_pool_blocks : unchanged behaviour, ONE fewer copy of the
-- purchase predicate. Migration 111 created this function with the predicate
-- inline; the body below delegates it and is otherwise identical.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_grade_pool_blocks(
  p_package_id uuid,
  p_grade_id   uuid,
  p_drop_grade boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  n      int;
  v_pool uuid[];
begin
  if coalesce(p_drop_grade, false) then
    -- A grade-less package is a legacy state, never a state an edit may
    -- produce. Same spelling as remove_olympiad_package_grade so the shipped
    -- oly2.err.lastGrade copy still applies.
    select count(*)::int into n
    from public.olympiad_package_grades where olympiad_package_id = p_package_id;
    if n <= 1 then
      v := v || jsonb_build_object('hint', 'last_grade', 'count', n);
    end if;
  end if;

  -- The purchase block. p_drop_grade only chooses which SENTENCE the admin
  -- gets: detaching removes an entitlement, while emptying the pool leaves a
  -- lifetime purchaser with a package that raises "pool too small" on every
  -- attempt — a silent revocation of a paid entitlement dressed up as a content
  -- edit. WHAT counts as a purchase is not decided here any more; that is
  -- olympiad_grade_purchase_count's job, shared with the per-selection guard.
  n := public.olympiad_grade_purchase_count(p_package_id, p_grade_id);
  if n > 0 then
    v := v || jsonb_build_object(
           'hint',
           case when coalesce(p_drop_grade, false)
                then 'grade_has_purchases' else 'grade_has_purchases_purge' end,
           'count', n);
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_pool
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;
  select count(*)::int into n
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_pool;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean) is
  'Service-internal (migration 111, purchase predicate extracted in 112): the '
  'reasons one (package, grade) pool may not be purged, as a jsonb array of '
  '{hint, count}. p_drop_grade = true adds the last_grade check and reports the '
  'purchase block as grade_has_purchases; false (keep the grade, empty the '
  'pool) reports it as grade_has_purchases_purge, because emptying a purchased '
  'grade''s pool silently revokes a lifetime entitlement. The purchase count '
  'comes from olympiad_grade_purchase_count — ANY status, unlike '
  'remove_olympiad_package_grade, whose active-only predicate is correct for a '
  'restorable ARCHIVE but not for a hard delete a refunded purchase can be '
  're-activated onto.';

-- Re-issued because 112 re-creates the function above. `create or replace`
-- keeps the existing ACL, so dropping these two lines changed nothing on a
-- database that had already run 111 — and silently opened the function to anon
-- on a from-zero bootstrap. Grants belong next to every create, not once.
revoke all on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.olympiad_grade_pool_blocks(uuid, uuid, boolean) to service_role;


-- -----------------------------------------------------------------------------
-- olympiad_pool_purchase_blocks : the SAME rule, for an operation whose effect
-- varies with the selection.
--
-- Returns one block per affected grade whose purchased pool would stop being
-- able to fill an attempt, as {hint, count, grade, remaining, required} so the
-- panel can name the grade and both numbers instead of printing "blocked".
--
-- Every selected PUBLISHED row is counted as leaving the pool, whether
-- purge_question_set will delete it or archive it: start_olympiad_attempt draws
-- status = 'published' only, so to the purchaser the two are the same absence.
-- Selected rows that are already archived change nothing and are ignored.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_pool_purchase_blocks(
  p_package_id   uuid,
  p_question_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  r      record;
  v_buy  int;
  v_need int;
  v_pool int;
  v_left int;
  v_name text;
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return v;
  end if;

  -- Per GRADE, because the rule is about a grade's pool becoming unservable and
  -- one selection may span several of them. `is not distinct from` throughout,
  -- so a legacy grade-less pool is one group rather than none.
  for r in
    select q.grade_id                                        as grade_id,
           count(*) filter (where q.status = 'published')::int as leaving
    from public.questions q
    where q.id = any(p_question_ids)
      and q.olympiad_package_id = p_package_id
    group by q.grade_id
  loop
    continue when r.leaving = 0;

    v_buy := public.olympiad_grade_purchase_count(p_package_id, r.grade_id);
    continue when v_buy = 0;

    select c.questions_per_attempt into v_need
    from public.olympiad_grade_config(p_package_id, r.grade_id) c;
    v_need := greatest(coalesce(v_need, 25), 1);

    select count(*)::int into v_pool
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.grade_id is not distinct from r.grade_id
      and q.status = 'published';
    v_left := v_pool - r.leaving;

    if v_left < v_need then
      select g.name into v_name from public.grades g where g.id = r.grade_id;
      v := v || jsonb_build_object(
             'hint', 'grade_purchased_pool_below_attempt',
             'count', v_buy,
             'grade', coalesce(v_name, ''),
             'remaining', v_left,
             'required', v_need);
    end if;
  end loop;

  return v;
end;
$$;

comment on function public.olympiad_pool_purchase_blocks(uuid, uuid[]) is
  'Service-internal (migration 112): the grades of a SELECTION whose purchased '
  'pool would be left unable to fill one attempt, as a jsonb array of {hint '
  'grade_purchased_pool_below_attempt, count = purchases, grade, remaining, '
  'required}. The per-selection form of the rule olympiad_grade_pool_blocks '
  'applies to a whole pool — same purchase predicate '
  '(olympiad_grade_purchase_count), same per-grade requirement '
  '(olympiad_grade_config), so the two can never disagree. An ARCHIVED-instead '
  'of deleted row counts as leaving the pool: attempts draw published only.';

revoke all on function public.olympiad_pool_purchase_blocks(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.olympiad_pool_purchase_blocks(uuid, uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- 14) olympiad_package_delete_guard — enforcement for the bare `.delete()`
--     path, not just for the RPC below it.
-- -----------------------------------------------------------------------------
create or replace function public.olympiad_package_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
begin
  v_blocks := public.olympiad_package_deletion_blocks(old.id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'olympiad package % cannot be deleted: % blocking reference(s)',
      old.id, jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'package_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;
  return old;
end;
$$;

comment on function public.olympiad_package_delete_guard() is
  'Migration 111: refuses to delete an olympiad package that has ANY purchase '
  'row, is still ACTIVE, or has an attempt in flight. It fires BEFORE the '
  'olympiad_purchases RESTRICT foreign key, so from now on that FK is the '
  'SECOND line of defence, not the first — do not drop this trigger on the '
  'grounds that "the FK already does it": the error would regress to a bare '
  '23503 with no hint and the panel could only show a generic server error.';
drop trigger if exists trg_olympiad_package_delete_guard on public.olympiad_packages;
create trigger trg_olympiad_package_delete_guard
  before delete on public.olympiad_packages
  for each row execute function public.olympiad_package_delete_guard();

-- -----------------------------------------------------------------------------
-- 15) Deletion PREVIEWS — side-effect free, no locks; they drive the
--     confirmation dialog and every number they report is re-checked by the
--     mutation before anything is destroyed.
-- -----------------------------------------------------------------------------
create or replace function public.admin_preview_olympiad_package_deletion(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg     record;
  v_blocks  jsonb;
  v_total   int; v_deletable int; v_answered int; v_archived int;
  v_media   int;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_olympiad_package_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.code, p.status, p.cover_media_id,
         coalesce(t.title, p.code) as title_az
    into v_pkg
  from public.olympiad_packages p
  left join public.olympiad_package_translations t
    on t.olympiad_package_id = p.id and t.locale = 'az'
  where p.id = p_package_id;
  if not found then
    raise exception 'admin_preview_olympiad_package_deletion: package not found'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.olympiad_package_deletion_blocks(p_package_id);

  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.olympiad_package_id = p_package_id;

  -- An ESTIMATE, and honestly so: the exact orphan set is only decidable after
  -- the delete (purge_question_set computes it there). Counting the media of
  -- the DELETABLE questions plus the cover is the closest side-effect-free
  -- answer, and it can only over-count.
  select count(distinct s.m)::int into v_media
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
      join public.questions q on q.id = qt.question_id
     where q.olympiad_package_id = p_package_id and qt.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select qe.media_asset_id
      from public.question_explanations qe
      join public.questions q on q.id = qe.question_id
     where q.olympiad_package_id = p_package_id and qe.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
      join public.questions q on q.id = ao.question_id
     where q.olympiad_package_id = p_package_id and aot.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
  ) s;

  -- The cover is counted separately rather than as a fourth UNION branch: a
  -- package cover never doubles as a question image, and keeping the plpgsql
  -- variable out of the query removes any doubt about how it resolves there.
  if v_pkg.cover_media_id is not null then
    v_media := v_media + 1;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocks) = 0,
    'package', jsonb_build_object('id', v_pkg.id, 'code', v_pkg.code,
                                  'title_az', v_pkg.title_az,
                                  'status', v_pkg.status),
    'blocked_by', v_blocks,
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    -- WHICH of the two outcomes will actually happen, decided by the same rule
    -- the mutation uses (answered questions surviving ⇒ archive). The two
    -- cascades are reported SEPARATELY, the way the grade preview already
    -- splits drop_grade from keep_grade, because they are not the same
    -- operation: the ARCHIVE branch — which is the branch that runs whenever a
    -- pool has ever been played, i.e. most of the time — keeps the grades, the
    -- translations and the pool rows and deletes only the rotation cache. The
    -- previous payload listed the full delete cascade in both branches, so the
    -- dialog overstated its own blast radius; a confirmation screen an admin
    -- learns to disbelieve is worse than none.
    'outcome', case when v_answered > 0 then 'archive' else 'delete' end,
    'delete_cascade', jsonb_build_object(
      'olympiad_package_grades', (select count(*)::int from public.olympiad_package_grades
                                   where olympiad_package_id = p_package_id),
      'olympiad_package_translations', (select count(*)::int from public.olympiad_package_translations
                                         where olympiad_package_id = p_package_id),
      'olympiad_package_questions', (select count(*)::int from public.olympiad_package_questions
                                      where olympiad_package_id = p_package_id),
      'olympiad_question_rotations', (select count(*)::int from public.olympiad_question_rotations
                                       where olympiad_package_id = p_package_id),
      'question_translations', (select count(*)::int from public.question_translations qt
                                 join public.questions q on q.id = qt.question_id
                                where q.olympiad_package_id = p_package_id),
      'answer_options', (select count(*)::int from public.answer_options ao
                          join public.questions q on q.id = ao.question_id
                         where q.olympiad_package_id = p_package_id)),
    -- The archive branch's real footprint. The rotation rows go because the
    -- package SURVIVES holding seen_question_ids that name rows the purge
    -- removed; everything else stays exactly where it is.
    'archive_cascade', jsonb_build_object(
      'package_archived', true,
      'olympiad_question_rotations', (select count(*)::int from public.olympiad_question_rotations
                                       where olympiad_package_id = p_package_id),
      'question_translations', (select count(*)::int from public.question_translations qt
                                 join public.questions q on q.id = qt.question_id
                                where q.olympiad_package_id = p_package_id
                                  and not exists (select 1 from public.test_attempt_answers a
                                                   where a.question_id = q.id)),
      'answer_options', (select count(*)::int from public.answer_options ao
                          join public.questions q on q.id = ao.question_id
                         where q.olympiad_package_id = p_package_id
                           and not exists (select 1 from public.test_attempt_answers a
                                            where a.question_id = q.id))),
    'orphans', jsonb_build_object('media_assets', v_media));
end;
$$;

comment on function public.admin_preview_olympiad_package_deletion(uuid) is
  'Admin-only, side-effect free (migration 111): what deleting this olympiad '
  'package would destroy — blocked_by[], the delete/archive question split, and '
  'the row counts for the outcome that will ACTUALLY happen (`outcome` picks '
  'between delete_cascade and archive_cascade; the archive branch keeps grades, '
  'translations and pool rows and drops only the rotation cache) plus the '
  'orphaned-media estimate. Drives the confirmation dialog; the mutation '
  're-checks everything it reports.';
revoke all on function public.admin_preview_olympiad_package_deletion(uuid) from public, anon;
grant execute on function public.admin_preview_olympiad_package_deletion(uuid)
  to authenticated, service_role;

create or replace function public.admin_preview_olympiad_grade_pool_deletion(
  p_package_id uuid,
  p_grade_id   uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_grade    record;
  v_total    int; v_deletable int; v_answered int; v_archived int;
  v_media    int;
  v_grades   int;
  v_per      int;
  v_drop     jsonb;
  v_keep     jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_olympiad_grade_pool_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.code, p.status, coalesce(t.title, p.code) as title_az
    into v_pkg
  from public.olympiad_packages p
  left join public.olympiad_package_translations t
    on t.olympiad_package_id = p.id and t.locale = 'az'
  where p.id = p_package_id;
  if not found then
    raise exception 'admin_preview_olympiad_grade_pool_deletion: package not found'
      using errcode = 'no_data_found';
  end if;

  select g.id, g.level::int as level, g.name into v_grade
  from public.grades g
  join public.olympiad_package_grades pg
    on pg.grade_id = g.id and pg.olympiad_package_id = p_package_id
  where g.id = p_grade_id;
  if not found then
    raise exception 'admin_preview_olympiad_grade_pool_deletion: grade is not a package target'
      using errcode = 'no_data_found';
  end if;

  select count(*)::int into v_grades
  from public.olympiad_package_grades where olympiad_package_id = p_package_id;

  select c.questions_per_attempt into v_per
  from public.olympiad_grade_config(p_package_id, p_grade_id) c;

  v_drop := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id, true);
  v_keep := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id, false);

  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;

  select count(distinct s.m)::int into v_media
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
      join public.questions q on q.id = qt.question_id
     where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
       and qt.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select qe.media_asset_id
      from public.question_explanations qe
      join public.questions q on q.id = qe.question_id
     where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
       and qe.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
      join public.questions q on q.id = ao.question_id
     where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id
       and aot.media_asset_id is not null
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
  ) s;

  return jsonb_build_object(
    'package', jsonb_build_object('id', v_pkg.id, 'code', v_pkg.code,
                                  'title_az', v_pkg.title_az,
                                  'status', v_pkg.status),
    'grade', jsonb_build_object('id', v_grade.id, 'level', v_grade.level,
                                'name', v_grade.name),
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    -- Both dialogs from one round trip: (b) detaches the grade, (c) empties the
    -- pool and keeps it. Their blocking rules differ, so both are reported.
    'drop_grade', jsonb_build_object('ok', jsonb_array_length(v_drop) = 0,
                                     'blocked_by', v_drop),
    'keep_grade', jsonb_build_object('ok', jsonb_array_length(v_keep) = 0,
                                     'blocked_by', v_keep),
    'is_last_grade', v_grades <= 1,
    'questions_per_attempt', v_per,
    'package_status', v_pkg.status,
    -- Only the KEEP-the-grade path can do this: it leaves the grade targeted
    -- with zero published questions, so an ACTIVE package can no longer serve
    -- it and the mutation demotes the package to 'inactive'. Detaching the
    -- grade removes it from the check entirely.
    'package_becomes_unservable', v_pkg.status = 'active',
    'orphans', jsonb_build_object('media_assets', v_media));
end;
$$;

comment on function public.admin_preview_olympiad_grade_pool_deletion(uuid, uuid) is
  'Admin-only, side-effect free (migration 111): serves BOTH grade dialogs from '
  'one round trip — drop_grade (detach + delete the pool) and keep_grade (empty '
  'the pool, keep the grade targeted) each with their own blocked_by[], plus the '
  'delete/archive split, the per-grade questions_per_attempt and whether an '
  'ACTIVE package would be auto-demoted.';
revoke all on function public.admin_preview_olympiad_grade_pool_deletion(uuid, uuid)
  from public, anon;
grant execute on function public.admin_preview_olympiad_grade_pool_deletion(uuid, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 16) Destructive MUTATIONS (Admin-only).
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_package(
  p_package_id    uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg    record;
  v_blocks jsonb;
  v_ids    uuid[];
  v_purge  jsonb;
  v_media  uuid[];
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_package: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package: the second waits
  -- and then re-reads a status the first may have changed.
  select p.id, p.code, p.status, p.cover_media_id, p.questions_per_attempt
    into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_package: package not found'
      using errcode = 'no_data_found';
  end if;

  -- NO CONFIRMATION TOKEN (migration 113, owner decision). Unlike every
  -- sibling destructive RPC, a package delete asks only for the dialog's
  -- acknowledgement. The guard below is what still protects paid content.

  v_blocks := public.olympiad_package_deletion_blocks(p_package_id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_olympiad_package: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'package_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q where q.olympiad_package_id = p_package_id;

  v_purge := public.purge_question_set(v_ids);

  if (v_purge->>'retained')::int > 0 then
    -- questions.olympiad_package_id is ON DELETE CASCADE, so deleting the
    -- package would try to delete the very rows just archived and
    -- trg_question_delete_guard would abort the whole transaction. Archiving
    -- the package is the only outcome that keeps both promises — and it is the
    -- same rule subjects follow: if anything answered survives, the CONTAINER
    -- is archived, not deleted. The success message must say so, or the button
    -- reads as broken.
    update public.olympiad_packages
       set status = 'archived', updated_at = now()
     where id = p_package_id and status <> 'archived';

    -- Only this branch needs it: the delete branch below takes the rotation
    -- rows with the package (CASCADE), but here the package SURVIVES holding
    -- seen_question_ids that name rows the purge just removed. Left alone, a
    -- re-uploaded pool would look partly consumed to that student and hand
    -- them a short attempt; the row is pure cache, so resetting it is free.
    delete from public.olympiad_question_rotations
     where olympiad_package_id = p_package_id;

    return jsonb_build_object(
      'package_id', p_package_id,
      'package_deleted', false,
      'package_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', (v_purge->>'deleted')::int,
      'archived_questions', (v_purge->>'archived')::int,
      'retained_questions', (v_purge->>'retained')::int,
      'orphaned_media_ids', v_purge->'orphaned_media_ids',
      'media_truncated', (v_purge->>'media_truncated')::boolean);
  end if;

  delete from public.olympiad_packages where id = p_package_id;

  -- cover_media_id is SET NULL, so nothing ever reclaims the cover asset. It is
  -- an orphan only once no OTHER package points at it.
  select coalesce(array_agg(e.x::uuid), '{}'::uuid[]) into v_media
  from jsonb_array_elements_text(v_purge->'orphaned_media_ids') as e(x);
  if v_pkg.cover_media_id is not null
     and not exists (select 1 from public.olympiad_packages p
                      where p.cover_media_id = v_pkg.cover_media_id) then
    v_media := v_media || v_pkg.cover_media_id;
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'package_deleted', true,
    'package_archived', false,
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', 0,
    'retained_questions', 0,
    'orphaned_media_ids', to_jsonb(v_media),
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_package(uuid) is
  'Admin-only (migration 111): deletes an olympiad package and its entire pool '
  'after purging the questions (unanswered deleted, answered ARCHIVED). Blocked '
  'by any purchase row (hint package_has_purchases), by status = active '
  '(package_is_active) and by an attempt in flight (live_attempts); '
  'p_expected_code must equal the package code (confirmation_mismatch). When '
  'answered questions survive, the PACKAGE IS ARCHIVED instead of deleted '
  '(reason answered_questions_retained). Returns the counts plus '
  'orphaned_media_ids for the caller to sweep from Storage.';
revoke all on function public.admin_delete_olympiad_package(uuid) from public, anon;
grant execute on function public.admin_delete_olympiad_package(uuid)
  to authenticated, service_role;

create or replace function public.admin_delete_olympiad_grade_pool(
  p_package_id    uuid,
  p_grade_id      uuid,
  p_expected_code text,
  p_drop_grade    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_blocks   jsonb;
  v_ids      uuid[];
  v_purge    jsonb;
  v_rot      int := 0;
  v_demote   boolean := false;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_grade_pool: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_grade_pool: package not found'
      using errcode = 'no_data_found';
  end if;

  -- The SAME confirmation token the two container deletes demand, and for a
  -- stronger reason: this function hard-deletes a whole grade pool from a bare
  -- (package_id, grade_id) pair, it is granted to `authenticated`, and it is
  -- therefore a PostgREST endpoint any admin session can POST directly. The
  -- dialog is not a control — the token is. It is checked BEFORE the target
  -- grade is validated so a wrong-tab mix-up fails on the cheap test.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_grade_pool: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  if not exists (select 1 from public.olympiad_package_grades
                  where olympiad_package_id = p_package_id and grade_id = p_grade_id) then
    raise exception 'admin_delete_olympiad_grade_pool: grade is not a package target'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.olympiad_grade_pool_blocks(p_package_id, p_grade_id,
                                                coalesce(p_drop_grade, false));
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_olympiad_grade_pool: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'grade_pool_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q
  where q.olympiad_package_id = p_package_id and q.grade_id = p_grade_id;

  v_purge := public.purge_question_set(v_ids);

  -- olympiad_question_rotations.seen_question_ids holds ids that no longer
  -- exist. Leaving them makes a freshly re-uploaded pool look partly consumed
  -- to that student and can hand them a short attempt; the row is pure cache,
  -- so resetting it is free.
  delete from public.olympiad_question_rotations
   where olympiad_package_id = p_package_id and grade_id = p_grade_id;
  get diagnostics v_rot = row_count;

  if coalesce(p_drop_grade, false) then
    delete from public.olympiad_package_grades
     where olympiad_package_id = p_package_id and grade_id = p_grade_id;
  end if;

  if v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      -- Leaving it ACTIVE means the next child to open it gets a runtime
      -- failure at attempt start instead of a closed listing.
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not:
      -- the guard returns early for any row whose new.status is not 'active'.
      -- The whole auto-demotion design rests on that early return — do not
      -- "simplify" it by suppressing the trigger.
    end if;
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'grade_id', p_grade_id,
    'grade_dropped', coalesce(p_drop_grade, false),
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', (v_purge->>'archived')::int,
    'retained_questions', (v_purge->>'retained')::int,
    'reset_rotations', v_rot,
    'package_demoted', v_demote,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_grade_pool(uuid, uuid, text, boolean) is
  'Admin-only (migration 111): purges ONE grade''s olympiad pool (unanswered '
  'deleted, answered ARCHIVED) and, with p_drop_grade = true, detaches the '
  'grade as well. p_expected_code must equal the package code '
  '(confirmation_mismatch). remove_olympiad_package_grade is deliberately left '
  'untouched as the SAFE archive-only path the UI offers first. Blocked by '
  'last_grade, by purchases IN ANY STATUS (grade_has_purchases when detaching, '
  'grade_has_purchases_purge when only emptying — emptying a purchased pool '
  'silently revokes a lifetime entitlement) and by live_attempts. Auto-demotes '
  'an ACTIVE package that can no longer fill an attempt (package_demoted).';
revoke all on function public.admin_delete_olympiad_grade_pool(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.admin_delete_olympiad_grade_pool(uuid, uuid, text, boolean)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 17) admin_unarchive_olympiad_package — the missing inverse of the archive
--     action. The one operation added here that destroys nothing.
-- -----------------------------------------------------------------------------
create or replace function public.admin_unarchive_olympiad_package(p_package_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.catalog_status;
begin
  if not public.is_admin() then
    raise exception 'admin_unarchive_olympiad_package: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE makes the check atomic with the write. A read-then-update in the
  -- server action would be a TOCTOU that lets two tabs both "restore" and one
  -- of them demote a package the other just activated.
  select status into v_status
  from public.olympiad_packages where id = p_package_id
  for update;
  if not found then
    raise exception 'admin_unarchive_olympiad_package: package not found'
      using errcode = 'no_data_found';
  end if;

  if v_status is distinct from 'archived'::public.catalog_status then
    raise exception 'admin_unarchive_olympiad_package: package is not archived'
      using errcode = 'check_violation', hint = 'not_archived';
  end if;

  -- 'inactive', never 'active', for three reasons:
  --   (i) restoring to active re-fires trg_olympiad_activation_pool_guard, and
  --       since migration 094 emptied eight packages' pools most archived
  --       packages would answer a "restore" click with
  --       olympiad_pool_below_per_attempt, which reads as a bug, not a rule;
  --  (ii) olympiad_package_on_sale() gates the public catalog on status, so
  --       'active' puts the package back ON SALE instantly, reusing a
  --       sale_starts_at/sale_ends_at window that may be long expired or, worse,
  --       still open. Restoring must never be a selling action;
  -- (iii) `status` is the ONLY record that the package was archived — there is
  --       no archived_at and no previous_status column, so "restore to whatever
  --       it was" is not computable. 'inactive' is also where a newly created
  --       package starts, so it is the one honest answer.
  update public.olympiad_packages
     set status = 'inactive', updated_at = now()
   where id = p_package_id;

  return jsonb_build_object('package_id', p_package_id, 'status', 'inactive');
end;
$$;

comment on function public.admin_unarchive_olympiad_package(uuid) is
  'Admin-only (migration 111): the missing inverse of archiveOlympiadPackage. '
  'Restores an ARCHIVED package to INACTIVE (never straight to active — that '
  'would re-fire the pool guard and put the package back on sale under a '
  'possibly expired window). Refuses a package that is not archived (hint '
  'not_archived); the FOR UPDATE makes that check atomic with the write. The '
  'one new operation here that is not destructive.';
revoke all on function public.admin_unarchive_olympiad_package(uuid) from public, anon;
grant execute on function public.admin_unarchive_olympiad_package(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- question_reports.olympiad_package_id -> olympiad_packages (migration 115).
-- The column is declared in 008 (with the rest of the table) but WITHOUT this
-- FK: the canonical run order is 001-012,014,015,016,013, so olympiad_packages
-- does not exist yet at 008 and an inline reference would abort a from-zero
-- rebuild. ON DELETE SET NULL, because the report itself must outlive a deleted
-- package — it is about a question, not about the package.
-- -----------------------------------------------------------------------------
do $$ begin
  alter table public.question_reports
    add constraint question_reports_olympiad_package_id_fkey
    foreign key (olympiad_package_id)
    references public.olympiad_packages (id) on delete set null;
exception when duplicate_object then null; end $$;

-- =============================================================================
-- End of 015_olympiad_preparation.sql
-- =============================================================================
