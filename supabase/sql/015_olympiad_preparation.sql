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
  questions_per_attempt integer not null default 25 check (questions_per_attempt > 0), -- display-legacy since migration 057 (attempts draw the WHOLE pool)
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
  'Olympiad-Preparation add-on listing (Admin-only). Parent buys; child gets LIFETIME access. Each attempt draws ALL of the package''s published questions in random order (migration 057; questions_per_attempt is display-legacy). Archive only — never delete purchased packages.';
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
-- olympiad_package_questions : the curated question pool for a package. Since
-- migration 057 the attempt engine draws the WHOLE published pool server-side
-- (random order; questions_per_attempt is display-legacy).
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

-- Audit M23 (migration 035): supports the admin questions list's default order
-- (general-pool filter + created_at desc). Lives here because the column above
-- is added in this file (after 011's index section).
create index if not exists idx_questions_pool_created
  on public.questions (olympiad_package_id, created_at desc);

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

-- Admin operational alert (migration 074): a new purchase notifies every admin.
-- Lives here (not 011) because olympiad_purchases is defined in this file.
create or replace function public.notify_admin_new_purchase_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.notify_admins(
      'admin_new_purchase', 'Yeni olimpiada alışı',
      'Yeni olimpiada paketi alışı: ' || trim_scale(new.amount)::text || ' ' || coalesce(new.currency, 'AZN') || '.',
      jsonb_build_object('purchase_id', new.id, 'package_id', new.olympiad_package_id,
                         'amount', new.amount, 'currency', new.currency),
      'admin:purchase:' || new.id::text, '/olympiad', 'admin', 3);
  exception when others then raise warning 'notify_admin_new_purchase failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_admin_new_purchase on public.olympiad_purchases;
create trigger trg_notify_admin_new_purchase
  after insert on public.olympiad_purchases
  for each row execute function public.notify_admin_new_purchase_tg();

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

-- -----------------------------------------------------------------------------
-- get_olympiad_pool_counts (Round 21) : the REAL published-question count per
-- package. Cards used to show olympiad_packages.questions_per_attempt
-- (display-legacy, default 25, never written by the admin form) — a 50-question
-- package still said "25". SECURITY DEFINER so parents/children get correct
-- counts regardless of row-level visibility; returns counts only.
-- -----------------------------------------------------------------------------
create or replace function public.get_olympiad_pool_counts(p_package_ids uuid[])
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
    group by q.olympiad_package_id;
end;
$$;
comment on function public.get_olympiad_pool_counts(uuid[]) is
  'Real published pool size per olympiad package (Round 21) — replaces the '
  'display-legacy questions_per_attempt on every card. Counts only; RLS-proof.';
revoke all on function public.get_olympiad_pool_counts(uuid[]) from public, anon;
grant execute on function public.get_olympiad_pool_counts(uuid[]) to authenticated, service_role;

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
drop function if exists public.get_public_olympiad_packages();

create or replace function public.get_public_olympiad_packages(p_limit int default null)
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
    -- get_olympiad_pool_counts parity: REAL published pool size, never the
    -- display-legacy questions_per_attempt.
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
  'fallback), price, subject/grade context, sale_ends_at, event_at (= '
  'event_starts_at) and the REAL published pool count. Soonest sale-end/event '
  'first, then az title. Migration 072: optional p_limit (null or < 1 = all '
  'rows, else capped at 100); zero-arg calls keep resolving via the default.';
revoke all on function public.get_public_olympiad_packages(int) from public;
grant execute on function public.get_public_olympiad_packages(int) to anon, authenticated, service_role;

-- =============================================================================
-- End of 015_olympiad_preparation.sql
-- =============================================================================
