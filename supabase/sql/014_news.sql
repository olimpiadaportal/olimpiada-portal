-- =============================================================================
-- 014_news.sql
-- =============================================================================
-- OlympIQ — canonical module file 014 (News).
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
  status        public.content_status not null default 'in_review', -- 3-status (migration 040): in_review/published/rejected
  cover_media_id uuid references public.media_assets (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  published_at  timestamptz,
  view_count    integer not null default 0,           -- public view counter (bump_news_view)
  like_count    integer not null default 0,           -- likes counter (trg_news_like_count)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Rerun-safety for databases created before Round 6 (migration 019).
alter table public.news add column if not exists like_count integer not null default 0;

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

-- ---- Public view counter -----------------------------------------------------
-- Lets anon/authenticated readers register a view on a PUBLISHED article without
-- holding UPDATE rights on public.news (SECURITY DEFINER). Only published rows
-- are counted so a leaked draft id can't inflate the counter.
create or replace function public.bump_news_view(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.news
     set view_count = view_count + 1
   where id = p_news_id and status = 'published';
end;
$$;

comment on function public.bump_news_view(uuid) is
  'Increments a PUBLISHED news article''s view_count. SECURITY DEFINER so readers '
  'can register a view without UPDATE rights on public.news.';

revoke all on function public.bump_news_view(uuid) from public;
grant execute on function public.bump_news_view(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- News likes (Round 6, migration 019): one like per signed-in profile (parent OR
-- child) per article; news.like_count is maintained by a SECURITY DEFINER
-- trigger because likers hold no UPDATE right on public.news.
-- -----------------------------------------------------------------------------
create table if not exists public.news_likes (
  news_id    uuid not null references public.news (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (news_id, profile_id)
);

comment on table public.news_likes is
  'One like per signed-in profile (parent OR child) per news article. Drives news.like_count.';
comment on column public.news.like_count is
  'Denormalized like counter maintained by trg_news_like_count (fn_news_like_count).';

create index if not exists idx_news_likes_profile on public.news_likes (profile_id);

create or replace function public.fn_news_like_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.news set like_count = like_count + 1 where id = new.news_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.news set like_count = greatest(like_count - 1, 0) where id = old.news_id;
    return old;
  end if;
  return null;
end;
$$;

comment on function public.fn_news_like_count() is
  'Trigger function: keeps news.like_count in sync with news_likes rows. '
  'SECURITY DEFINER so likers need no UPDATE right on public.news.';

revoke all on function public.fn_news_like_count() from public, anon, authenticated;

drop trigger if exists trg_news_like_count on public.news_likes;
create trigger trg_news_like_count
  after insert or delete on public.news_likes
  for each row execute function public.fn_news_like_count();

-- Baseline privileges (RLS gates rows). NO anon grants: liking requires login.
grant select, insert, delete on public.news_likes to authenticated;
grant all on public.news_likes to service_role;

alter table public.news_likes enable row level security;

drop policy if exists "news_likes_select_own" on public.news_likes;
create policy "news_likes_select_own" on public.news_likes for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

drop policy if exists "news_likes_insert_own" on public.news_likes;
create policy "news_likes_insert_own" on public.news_likes for insert to authenticated
  with check (
    profile_id = public.current_profile_id()
    and exists (select 1 from public.news n where n.id = news_id and n.status = 'published')
  );

drop policy if exists "news_likes_delete_own" on public.news_likes;
create policy "news_likes_delete_own" on public.news_likes for delete to authenticated
  using (profile_id = public.current_profile_id());

-- =============================================================================
-- End of 014_news.sql
-- =============================================================================
