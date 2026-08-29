-- =============================================================================
-- 2026_08_29_161 — A FORCED UPDATE WITH NO STORE LINK BECOMES UNREPRESENTABLE.
--
-- THE HAZARD. mobile_app_versions.force_update is a single boolean that the
-- anon RPC get_mobile_config() hands to every installed copy of the app. When
-- it is true and the running version is below min_version, the app renders
-- ForceUpdateScreen as the FIRST gate at boot — ahead of the maintenance gate,
-- ahead of auth, ahead of the navigator. That screen's only affordance is a
-- button that opens store_url, and it renders that button only when store_url
-- starts with 'https://'. So force_update = true with an EMPTY store_url is a
-- full-screen dead end: no button, no back, nothing behind it. The user's only
-- exit is to close the app, and every relaunch lands there again.
--
-- IT IS ONE CHECKBOX AWAY TODAY. Both seeded rows ship with store_url = ''
-- (008 default, 012 seed inserts the platform only), so nothing has to go
-- wrong for this to happen — an admin ticking the box on the shipped defaults
-- is enough.
--
-- WHY A CONSTRAINT WHEN THE ADMIN ACTION ALREADY REFUSES IT. The app-level
-- guard in admin-panel/src/lib/admin/mobileApp.ts is the GOOD ERROR MESSAGE:
-- it names the hazard in the admin's language before the write. The constraint
-- is what makes the state unreachable however it is written — a psql session, a
-- future admin surface, a support script, a restored row. The two are not
-- redundant; one explains, the other guarantees. Only the second survives a
-- path nobody has written yet.
--
-- THE EXISTING CHECK IS NOT THIS CHECK. store_url already carries
-- `store_url = '' or store_url ~ '^https://'`, which constrains the SHAPE of a
-- non-empty URL and says nothing about whether one is required. The two
-- together give the property that actually matters: force_update = true
-- implies a real https store link.
--
-- SAFE ON PRODUCTION DATA AS IT STANDS. Both live rows (ios, android) are at
-- pure defaults — min 1.0.0, latest 1.0.0, force_update = false, store_url = ''
-- — verified by the owner's session before this migration was written. A row
-- with force_update = false satisfies the constraint whatever store_url holds,
-- so the ALTER validates against existing data with nothing to fix. The DO
-- block below re-checks that rather than trusting this paragraph, and fails
-- with a readable message instead of a bare constraint violation if the state
-- has changed since.
--
-- WHAT THIS DOES NOT DO. It does not turn the gate on, off, or touch a single
-- value — the gate stays inert exactly as it is. It also does not police the
-- OTHER hazard, min_version above the version actually live in the store: the
-- database cannot know what a store has published, and a constraint that
-- pretended to would be worse than none. That one is enforced against
-- latest_version in the admin action and stated as guidance in the panel.
--
-- Migration: 2026_08_29_161_force_update_needs_store_url.sql
-- Purpose: forbid force_update = true with an empty store_url.
-- Environment first applied: staging, then production (not yet applied).
-- Related root SQL file(s): supabase/sql/008_notifications_support_audit.sql
-- BACKPORT: supabase/sql/008_notifications_support_audit.sql — add
--   `constraint mobile_app_versions_force_needs_store_url
--      check (force_update = false or store_url <> '')`
--   to the `create table if not exists public.mobile_app_versions` block
--   (~line 307), next to the existing store_url shape CHECK.
-- Backport status: completed
-- Destructive change: no (adds a constraint; writes no row)
-- Rollback notes:
--   alter table public.mobile_app_versions
--     drop constraint if exists mobile_app_versions_force_needs_store_url;
-- Rerun-safe: yes (constraint added only when absent; no data is written).
-- =============================================================================
begin;

-- ---- 1. Refuse to proceed on data the constraint would reject --------------
-- A bare ALTER failure here would read as "check constraint is violated by some
-- row" and name neither the row nor the reason. If this ever fires, the fix is
-- to set a store_url for the listed platform(s) or turn force_update off —
-- and the app is ALREADY stranding users on those platforms right now.
do $$
declare
  v_bad text;
begin
  select string_agg(platform, ', ' order by platform) into v_bad
  from public.mobile_app_versions
  where force_update and coalesce(store_url, '') = '';

  if v_bad is not null then
    raise exception
      '161: force_update is ON with an empty store_url for: % — those installs see a blocking screen with no button. Set a store link or turn force_update off, then rerun.',
      v_bad;
  end if;
end $$;

-- ---- 2. Make the state unrepresentable -------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mobile_app_versions'::regclass
      and conname = 'mobile_app_versions_force_needs_store_url'
  ) then
    alter table public.mobile_app_versions
      add constraint mobile_app_versions_force_needs_store_url
      check (force_update = false or store_url <> '');
    raise notice '161: force_update now requires a store link';
  else
    raise notice '161: constraint already present — nothing to do';
  end if;
end $$;

comment on constraint mobile_app_versions_force_needs_store_url
  on public.mobile_app_versions is
  'A forced update must offer a way out: ForceUpdateScreen renders its only '
  'button from store_url, so force_update = true with an empty store_url is a '
  'full-screen dead end with no navigator behind it (migration 161). The admin '
  'action refuses this with a readable message; this constraint is what closes '
  'every other write path.';

-- ---- 3. Verification --------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mobile_app_versions'::regclass
      and conname = 'mobile_app_versions_force_needs_store_url'
      and convalidated
  ) then
    raise exception '161: the force_update/store_url constraint is missing or not validated';
  end if;

  if exists (
    select 1 from public.mobile_app_versions
    where force_update and coalesce(store_url, '') = ''
  ) then
    raise exception '161: a forced update with no store link survived the constraint';
  end if;

  raise notice '161: every forced update on every platform now has a store link to offer';
end $$;

commit;
