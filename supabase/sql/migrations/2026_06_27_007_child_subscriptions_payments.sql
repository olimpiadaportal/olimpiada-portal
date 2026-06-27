-- Migration: 2026_06_27_007_child_subscriptions_payments.sql
-- Purpose: Business-model foundation (Stage 7, increment 2) — child-based,
--          subject-priced subscriptions + payments/checkout/sibling-discount schema.
--          Provider-agnostic: pricing/plans live in our DB; real provider integration
--          is Stage 11. All pricing/discount/status are server/service-role written.
-- Environment first applied: development/staging
-- Related root SQL file(s): 007 (subscriptions/payments), 010 (RLS), 011 (indexes/triggers), 012 (seed)
-- Backport status: completed (canonical 007/010/011/012; re-applied idempotently, 013 = 12/12 PASS)
-- Destructive change: no (additive; the old generic `subscription_plans`/`subscriptions`
--          tables are left in place but DEPRECATED in favour of `child_subscriptions`;
--          dropping them later requires explicit approval).
-- Rollback notes: drop the new tables/columns/policies; non-destructive to existing data.
-- =============================================================================

-- ---- subjects_pricing: per-subject price for each billing interval -----------
-- Placeholder pricing (configurable by admins). Subscription price =
-- selected-subject-count priced from here, minus the automatic sibling discount.
create table if not exists public.subjects_pricing (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  interval     public.plan_interval not null,
  price_amount numeric(12,2) not null,
  currency     text not null default 'AZN',
  status       public.catalog_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_subject_interval_price unique (subject_id, interval)
);

-- ---- launch_promo_config: singleton (launch promo window + trial length) -----
-- Sibling discount is NOT here — it is a fixed business rule (2nd 15% / 3rd+ 20%)
-- computed server-side (no "Discount Settings" module).
create table if not exists public.launch_promo_config (
  id                       smallint primary key default 1 check (id = 1),
  launch_promo_starts_at   timestamptz,
  launch_promo_ends_at     timestamptz,
  trial_days               integer not null default 7,
  updated_at               timestamptz not null default now()
);

-- ---- child_subscriptions: per-child subscription (parent-owned/paid) ----------
-- Status, amounts, discount and trial dates are written ONLY by trusted server /
-- service-role code (webhook-verified). Clients can never set these.
create table if not exists public.child_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  student_profile_id       uuid not null references public.students (profile_id) on delete cascade,
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  interval                 public.plan_interval not null,
  status                   public.subscription_status not null default 'incomplete',
  trial_started_at         timestamptz,
  trial_ends_at            timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  base_amount              numeric(12,2),
  sibling_discount_percent numeric(5,2) not null default 0,
  discount_amount          numeric(12,2),
  total_amount             numeric(12,2),
  currency                 text not null default 'AZN',
  provider                 text not null default 'none',
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---- subscription_subjects: which subjects this child subscription covers -----
create table if not exists public.subscription_subjects (
  child_subscription_id uuid not null references public.child_subscriptions (id) on delete cascade,
  subject_id            uuid not null references public.subjects (id) on delete cascade,
  added_at              timestamptz not null default now(),
  primary key (child_subscription_id, subject_id)
);

-- ---- checkout_sessions: provider-agnostic checkout (subscription | olympiad) --
create table if not exists public.checkout_sessions (
  id                       uuid primary key default gen_random_uuid(),
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind                     text not null check (kind in ('subscription', 'olympiad')),
  child_subscription_id    uuid references public.child_subscriptions (id) on delete set null,
  amount                   numeric(12,2),
  currency                 text not null default 'AZN',
  status                   text not null default 'pending',
  provider                 text not null default 'none',
  provider_session_id      text,
  created_at               timestamptz not null default now()
);

-- ---- sibling_discounts: audit of the automatic discount applied --------------
create table if not exists public.sibling_discounts (
  id                       uuid primary key default gen_random_uuid(),
  owner_parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  child_subscription_id    uuid references public.child_subscriptions (id) on delete cascade,
  child_rank               integer not null,           -- 1, 2, 3, ...
  discount_percent         numeric(5,2) not null,       -- 0 / 15 / 20
  applied_at               timestamptz not null default now()
);

-- ---- payments: link to the new child subscription / checkout ----------------
alter table public.payments
  add column if not exists child_subscription_id uuid references public.child_subscriptions (id) on delete set null,
  add column if not exists checkout_session_id uuid references public.checkout_sessions (id) on delete set null;

-- ---- updated_at triggers ----------------------------------------------------
drop trigger if exists trg_set_updated_at on public.subjects_pricing;
create trigger trg_set_updated_at before update on public.subjects_pricing
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.child_subscriptions;
create trigger trg_set_updated_at before update on public.child_subscriptions
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.launch_promo_config;
create trigger trg_set_updated_at before update on public.launch_promo_config
  for each row execute function public.set_updated_at();

-- ---- audit subscription/payment status changes ------------------------------
drop trigger if exists trg_audit_child_subscriptions on public.child_subscriptions;
create trigger trg_audit_child_subscriptions
  after update on public.child_subscriptions
  for each row execute function public.fn_audit_row();

-- ---- indexes ----------------------------------------------------------------
create index if not exists idx_child_subs_student on public.child_subscriptions (student_profile_id);
create index if not exists idx_child_subs_owner on public.child_subscriptions (owner_parent_profile_id);
create index if not exists idx_child_subs_status on public.child_subscriptions (status);
create index if not exists idx_sub_subjects_subject on public.subscription_subjects (subject_id);
create index if not exists idx_checkout_owner on public.checkout_sessions (owner_parent_profile_id);
create index if not exists idx_sibling_discounts_owner on public.sibling_discounts (owner_parent_profile_id);

-- ---- baseline privileges (RLS gates rows) -----------------------------------
grant select on public.subjects_pricing, public.launch_promo_config, public.child_subscriptions,
  public.subscription_subjects, public.checkout_sessions, public.sibling_discounts
  to anon, authenticated, service_role;
grant insert, update, delete on public.subjects_pricing, public.launch_promo_config, public.child_subscriptions,
  public.subscription_subjects, public.checkout_sessions, public.sibling_discounts
  to authenticated;
grant all on public.subjects_pricing, public.launch_promo_config, public.child_subscriptions,
  public.subscription_subjects, public.checkout_sessions, public.sibling_discounts
  to service_role;

-- ---- RLS --------------------------------------------------------------------
alter table public.subjects_pricing enable row level security;
alter table public.launch_promo_config enable row level security;
alter table public.child_subscriptions enable row level security;
alter table public.subscription_subjects enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.sibling_discounts enable row level security;

-- Pricing + promo config: readable (public pricing page); admin write.
drop policy if exists "subjects_pricing_select" on public.subjects_pricing;
create policy "subjects_pricing_select" on public.subjects_pricing for select
  using (status = 'active' or public.is_admin());
drop policy if exists "subjects_pricing_write" on public.subjects_pricing;
create policy "subjects_pricing_write" on public.subjects_pricing for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "launch_promo_select" on public.launch_promo_config;
create policy "launch_promo_select" on public.launch_promo_config for select using (true);
drop policy if exists "launch_promo_write" on public.launch_promo_config;
create policy "launch_promo_write" on public.launch_promo_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- child_subscriptions: owner parent + the child read; writes ADMIN/SERVICE ONLY
-- (activation is webhook/service-role; clients never set price/discount/status).
drop policy if exists "child_subs_select" on public.child_subscriptions;
create policy "child_subs_select" on public.child_subscriptions for select to authenticated
  using (
    owner_parent_profile_id = public.current_profile_id()
    or student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  );
drop policy if exists "child_subs_write" on public.child_subscriptions;
create policy "child_subs_write" on public.child_subscriptions for all to authenticated
  using (public.is_admin() or public.has_permission('subscriptions.manage'))
  with check (public.is_admin() or public.has_permission('subscriptions.manage'));

-- subscription_subjects: visibility follows the parent subscription; writes admin/service.
drop policy if exists "sub_subjects_select" on public.subscription_subjects;
create policy "sub_subjects_select" on public.subscription_subjects for select to authenticated
  using (exists (
    select 1 from public.child_subscriptions cs where cs.id = child_subscription_id
      and (cs.owner_parent_profile_id = public.current_profile_id()
           or cs.student_profile_id = public.current_profile_id()
           or public.is_parent_linked_to_student(cs.student_profile_id)
           or public.is_admin())));
drop policy if exists "sub_subjects_write" on public.subscription_subjects;
create policy "sub_subjects_write" on public.subscription_subjects for all to authenticated
  using (public.is_admin() or public.has_permission('subscriptions.manage'))
  with check (public.is_admin() or public.has_permission('subscriptions.manage'));

-- checkout_sessions + sibling_discounts: owner reads; writes admin/service only.
drop policy if exists "checkout_select" on public.checkout_sessions;
create policy "checkout_select" on public.checkout_sessions for select to authenticated
  using (owner_parent_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "checkout_write" on public.checkout_sessions;
create policy "checkout_write" on public.checkout_sessions for all to authenticated
  using (public.is_admin() or public.has_permission('payments.manage'))
  with check (public.is_admin() or public.has_permission('payments.manage'));

drop policy if exists "sibling_discounts_select" on public.sibling_discounts;
create policy "sibling_discounts_select" on public.sibling_discounts for select to authenticated
  using (owner_parent_profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "sibling_discounts_write" on public.sibling_discounts;
create policy "sibling_discounts_write" on public.sibling_discounts for all to authenticated
  using (public.is_admin() or public.has_permission('payments.manage'))
  with check (public.is_admin() or public.has_permission('payments.manage'));

-- ---- seeds ------------------------------------------------------------------
-- Singleton promo/trial config (promo window unset; ongoing 7-day trial).
insert into public.launch_promo_config (id, trial_days) values (1, 7)
on conflict (id) do nothing;

-- Placeholder per-subject pricing (1 AZN/subject weekly; configurable by admin).
insert into public.subjects_pricing (subject_id, interval, price_amount, currency, status)
select s.id, i.interval, i.price, 'AZN', 'active'
from public.subjects s
cross join (values
  ('week'::public.plan_interval, 1.00),
  ('month'::public.plan_interval, 3.00),
  ('year'::public.plan_interval, 30.00)
) as i(interval, price)
where s.code in ('math', 'science', 'english', 'informatics', 'az_language')
on conflict (subject_id, interval) do nothing;
