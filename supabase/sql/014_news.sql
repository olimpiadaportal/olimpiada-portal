-- =============================================================================
-- 014_news.sql
-- =============================================================================
-- Olimpiada Portal — canonical module file 014 (News).
--
-- Responsibility : News module — public + in-app general news, Admin-only CRUD.
--                  Trilingual content via news_translations (az/en/ru). Images live
--                  in Supabase Storage (news-media bucket); DB stores object path/
--                  metadata only.
-- Run order      : After 001-012 (uses enums, profiles, media_assets, helper funcs,
--                  baseline grants/default-privileges from 010). Run BEFORE the
--                  read-only 013 validation. Self-contained: tables + storage +
--                  RLS + indexes + triggers + grants.
-- Safe to rerun  : Yes (CREATE TABLE/INDEX IF NOT EXISTS; ON CONFLICT DO NOTHING;
--                  DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE).
--
-- RULES: Admin-only CRUD (Content Managers are NOT allowed). No binary in PG.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- news : a news item (language-neutral metadata + lifecycle). Localized title/body
-- live in news_translations. `body` may contain inline links.
-- -----------------------------------------------------------------------------
create table if not exists public.news (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                 -- for /news/[slug]
  status        public.content_status not null default 'draft', -- draft/published/archived
  cover_media_id uuid references public.media_assets (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.news is
  'General news (public + in-app). Admin-only CRUD. Images in Supabase Storage (news-media).';

-- -----------------------------------------------------------------------------
-- news_translations : localized title/body per locale (az/en/ru).
-- -----------------------------------------------------------------------------
create table if not exists public.news_translations (
  id         uuid primary key default gen_random_uuid(),
  news_id    uuid not null references public.news (id) on delete cascade,
  locale     public.content_locale not null,
  title      text not null,
  body       text not null,                            -- may contain inline links
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_news_locale unique (news_id, locale)
);

-- -----------------------------------------------------------------------------
-- Storage bucket: news-media (public read; admin write). DB stores only paths.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-media', 'news-media', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "public read news-media" on storage.objects;
create policy "public read news-media" on storage.objects for select
  using (bucket_id = 'news-media');
drop policy if exists "admin manage news-media" on storage.objects;
create policy "admin manage news-media" on storage.objects for all to authenticated
  using (bucket_id = 'news-media' and public.is_admin())
  with check (bucket_id = 'news-media' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_news_status on public.news (status);
create index if not exists idx_news_published_at on public.news (published_at);
create index if not exists idx_news_translations_news on public.news_translations (news_id);

-- -----------------------------------------------------------------------------
-- updated_at + audit triggers
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.news;
create trigger trg_set_updated_at before update on public.news
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.news_translations;
create trigger trg_set_updated_at before update on public.news_translations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_news on public.news;
create trigger trg_audit_news
  after insert or update or delete on public.news
  for each row execute function public.fn_audit_row();

-- -----------------------------------------------------------------------------
-- Baseline privileges (RLS gates rows). Mirrors the 010 baseline for new tables.
-- -----------------------------------------------------------------------------
grant select on public.news, public.news_translations to anon, authenticated, service_role;
grant insert, update, delete on public.news, public.news_translations to authenticated;
grant all on public.news, public.news_translations to service_role;

-- -----------------------------------------------------------------------------
-- RLS : published news is public (anon + authenticated); Admin-only writes.
-- -----------------------------------------------------------------------------
alter table public.news enable row level security;
alter table public.news_translations enable row level security;

drop policy if exists "news_select" on public.news;
create policy "news_select" on public.news for select
  using (status = 'published' or public.is_admin());
drop policy if exists "news_write" on public.news;
create policy "news_write" on public.news for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "news_translations_select" on public.news_translations;
create policy "news_translations_select" on public.news_translations for select
  using (exists (select 1 from public.news n
                 where n.id = news_id and (n.status = 'published' or public.is_admin())));
drop policy if exists "news_translations_write" on public.news_translations;
create policy "news_translations_write" on public.news_translations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- End of 014_news.sql
-- =============================================================================
