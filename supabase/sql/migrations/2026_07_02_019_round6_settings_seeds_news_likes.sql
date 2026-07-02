-- =============================================================================
-- 2026_07_02_019_round6_settings_seeds_news_likes.sql
-- =============================================================================
-- Investor Review Round 6:
--   1) Canonical seeds for feature flags + system settings that existed ONLY on
--      the dev DB (created ad hoc in earlier rounds; a from-zero rebuild would
--      have missed them): launch_promo / news_public / olympiad_module flags and
--      contact.support_email.
--   2) NEW Round-6 settings (typed controls in the redesigned admin Settings):
--      maintenance mode + trilingual message, support phone, social links.
--   3) Remove the orphan `site.promo_banner` setting (referenced NOWHERE in any
--      app or SQL — it only fed the now-removed raw-JSON editor).
--   4) News likes: public.news_likes (one like per signed-in profile per
--      article) + news.like_count maintained by a SECURITY DEFINER trigger
--      (likers do not hold UPDATE on public.news) + RLS.
--
-- Backported to canonical: 012 (seeds), 014 (news likes), 013 (validation #27).
-- Safe to rerun: yes (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE).
-- =============================================================================

-- ---- 1) Flag seeds that were missing from canonical --------------------------
insert into public.feature_flags (key, enabled) values
  ('launch_promo',    true),
  ('news_public',     true),
  ('olympiad_module', true)
on conflict (key) do nothing;

-- ---- 2) System-setting seeds (existing dev values win: DO NOTHING) -----------
insert into public.system_settings (key, value_json) values
  ('contact.support_email',         '""'::jsonb),
  ('contact.support_phone',         '""'::jsonb),
  ('platform.maintenance_mode',     'false'::jsonb),
  ('platform.maintenance_message',  '{"az":"","en":"","ru":""}'::jsonb),
  ('social.facebook',               '""'::jsonb),
  ('social.instagram',              '""'::jsonb),
  ('social.youtube',                '""'::jsonb),
  ('social.tiktok',                 '""'::jsonb)
on conflict (key) do nothing;

-- ---- 3) Orphan cleanup --------------------------------------------------------
delete from public.system_settings where key = 'site.promo_banner';

-- ---- 4) News likes -------------------------------------------------------------
alter table public.news add column if not exists like_count integer not null default 0;

comment on column public.news.like_count is
  'Denormalized like counter maintained by trg_news_like_count (fn_news_like_count).';

create table if not exists public.news_likes (
  news_id    uuid not null references public.news (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (news_id, profile_id)
);

comment on table public.news_likes is
  'One like per signed-in profile (parent OR child) per news article. Drives news.like_count.';

create index if not exists idx_news_likes_profile on public.news_likes (profile_id);

-- Counter trigger: SECURITY DEFINER because the liker (authenticated) holds no
-- UPDATE privilege on public.news and news_write RLS is admin-only.
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

-- Hygiene: trigger functions are never called directly, but keep the
-- service-role-only revoke discipline anyway (Supabase default privileges
-- grant EXECUTE to anon/authenticated).
revoke all on function public.fn_news_like_count() from public, anon, authenticated;

drop trigger if exists trg_news_like_count on public.news_likes;
create trigger trg_news_like_count
  after insert or delete on public.news_likes
  for each row execute function public.fn_news_like_count();

-- Baseline privileges (RLS gates rows). NO anon grants: liking requires login.
grant select, insert, delete on public.news_likes to authenticated;
grant all on public.news_likes to service_role;

alter table public.news_likes enable row level security;

-- Own rows only (admins can read all for moderation/monitoring).
drop policy if exists "news_likes_select_own" on public.news_likes;
create policy "news_likes_select_own" on public.news_likes for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

-- Insert: only as yourself, and only on PUBLISHED articles.
drop policy if exists "news_likes_insert_own" on public.news_likes;
create policy "news_likes_insert_own" on public.news_likes for insert to authenticated
  with check (
    profile_id = public.current_profile_id()
    and exists (select 1 from public.news n where n.id = news_id and n.status = 'published')
  );

-- Unlike: only your own like.
drop policy if exists "news_likes_delete_own" on public.news_likes;
create policy "news_likes_delete_own" on public.news_likes for delete to authenticated
  using (profile_id = public.current_profile_id());

-- =============================================================================
-- End of 2026_07_02_019_round6_settings_seeds_news_likes.sql
-- =============================================================================
