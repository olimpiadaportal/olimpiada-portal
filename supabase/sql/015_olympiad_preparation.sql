-- =============================================================================
-- 015_olympiad_preparation.sql
-- =============================================================================
-- Olimpiada Portal — canonical module file 015 (Olympiad Preparation).
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
  questions_per_attempt integer not null default 25 check (questions_per_attempt > 0),
  event_starts_at      timestamptz,                          -- planned event date shown to students (Round 8; NULL = undated)
  status               public.catalog_status not null default 'inactive', -- active = listed; archived = delisted (purchasers keep access)
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Rerun-safety for databases created before Round 8 (migration 021).
alter table public.olympiad_packages
  add column if not exists event_starts_at timestamptz;

comment on table public.olympiad_packages is
  'Olympiad-Preparation add-on listing (Admin-only). Parent buys; child gets LIFETIME access. Each attempt = questions_per_attempt (25) server-side random from the pool. Archive only — never delete purchased packages.';
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
-- attempt engine random-selects `questions_per_attempt` from this pool server-side.
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
  owner_parent_profile_id uuid not null references public.profiles (id) on delete restrict,
  student_profile_id      uuid not null references public.students (profile_id) on delete cascade,
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

comment on column public.questions.olympiad_package_id is
  'When set, this question is PRIVATE to that olympiad package and is excluded from the general question list and from practice random selection. NULL = general question.';

create index if not exists idx_questions_olympiad_package
  on public.questions (olympiad_package_id);

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
-- RLS
-- -----------------------------------------------------------------------------
alter table public.olympiad_packages enable row level security;
alter table public.olympiad_package_translations enable row level security;
alter table public.olympiad_package_questions enable row level security;
alter table public.olympiad_purchases enable row level security;

-- Packages: active listing is publicly browsable; Admin-only writes.
drop policy if exists "olympiad_packages_select" on public.olympiad_packages;
create policy "olympiad_packages_select" on public.olympiad_packages for select
  using (status = 'active' or public.is_admin());
drop policy if exists "olympiad_packages_write" on public.olympiad_packages;
create policy "olympiad_packages_write" on public.olympiad_packages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Package translations: visible when the package is active (or admin); Admin writes.
drop policy if exists "olympiad_pkg_tr_select" on public.olympiad_package_translations;
create policy "olympiad_pkg_tr_select" on public.olympiad_package_translations for select
  using (exists (select 1 from public.olympiad_packages p
                 where p.id = olympiad_package_id and (p.status = 'active' or public.is_admin())));
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

-- =============================================================================
-- End of 015_olympiad_preparation.sql
-- =============================================================================
