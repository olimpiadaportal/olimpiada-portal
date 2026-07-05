-- =============================================================================
-- 2026_07_05_031_site_content_and_design.sql
-- Round 12 — Prompt 2: admin-managed "Site Content & Design Settings".
--
-- Two reusable, DB-backed override layers (both read by the web-app server-side via
-- the service-role client, exactly like flags.ts / getPublicSiteSettings, and both
-- fall back safely to the app's built-in i18n / CSS tokens when unset):
--
--   (A) site_content — curated, extensible TRILINGUAL text overrides. Keyed by the
--       same dotted i18n key the text overrides (or a standalone content key),
--       grouped for the admin UI. An empty string for a locale = "no override,
--       use the built-in i18n default". Admins edit a curated registry of keys
--       (defined in the admin app); new editable texts are added by extending that
--       registry — no schema change. This satisfies "migrate existing text into
--       editable configuration records" without hard-coding copy in SQL.
--
--   (B) design.* system_settings — global DESIGN TOKENS (font family, base font
--       size, brand colors) applied by injecting CSS-variable overrides on :root in
--       the web-app layout. Empty value = use the globals.css default token, so the
--       site never breaks when a value is unset or invalid. Font family is a
--       whitelisted AZ-safe stack (validated app-side — respects the permanent
--       "never ship a font that can't render ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ" rule).
--
-- Backports: site_content table + RLS-enable -> canonical 008; RLS policy -> 010;
--   updated_at trigger -> 011; design.* seeds -> 012; validation #40 -> 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- Destructive change: no (additive table + seeds).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- (A) site_content — trilingual text override records (admin only).
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  key        text primary key,                    -- dotted i18n/content key
  group_key  text not null default 'general',     -- admin grouping (header/home/buttons/info/...)
  az         text not null default '',
  en         text not null default '',
  ru         text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.site_content is
  'Admin-managed trilingual site-text OVERRIDES keyed by i18n key. Empty locale value = fall back to the app''s built-in i18n. Read server-side via service role; admin-only RLS.';

-- updated_at maintenance (shared helper from 011).
drop trigger if exists trg_set_updated_at on public.site_content;
create trigger trg_set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

alter table public.site_content enable row level security;

-- Admin-only (both read + write). The web-app reads this table with the
-- service-role client (bypasses RLS), so no public read policy is needed.
drop policy if exists "site_content_admin" on public.site_content;
create policy "site_content_admin" on public.site_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- (B) design.* tokens in system_settings. '' = use the built-in CSS default.
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value_json) values
  ('design.font_family',    '""'::jsonb),   -- whitelisted AZ-safe stack slug (app-validated) or ''
  ('design.font_size_base', '""'::jsonb),   -- base font size in px (e.g. "16") or ''
  ('design.color.accent',   '""'::jsonb),   -- primary/brand + button color (hex) or ''
  ('design.color.accent2',  '""'::jsonb),   -- secondary accent (hex) or ''
  ('design.color.bg',       '""'::jsonb),   -- page background (hex) or ''
  ('design.color.text',     '""'::jsonb),   -- primary text (hex) or ''
  ('design.color.surface',  '""'::jsonb)    -- card/surface background (hex) or ''
on conflict (key) do nothing;

commit;

-- =============================================================================
-- End of 2026_07_05_031_site_content_and_design.sql
-- =============================================================================
