-- =============================================================================
-- Migration: 2026_07_01_018_news_view_count.sql
-- Purpose:   Add a public per-article view counter to News (enables the public
--            News "Most Viewed" sort + pagination stats). A SECURITY DEFINER
--            RPC lets anonymous/authenticated readers register a view on a
--            PUBLISHED article without holding UPDATE rights on public.news.
-- Environment: dev/staging first, then production.
-- Related root file: backported into 014_news.sql (column + function + grants)
--                    and 013_validation_queries.sql (check #26).
-- Backport status: DONE (014, 013).
-- Destructive: no (additive column + new function).
-- Rollback:  alter table public.news drop column if exists view_count;
--            drop function if exists public.bump_news_view(uuid);
-- =============================================================================

alter table public.news
  add column if not exists view_count integer not null default 0;

-- Public view counter. Only PUBLISHED articles are counted (so a leaked draft id
-- can't be inflated). SECURITY DEFINER: readers have no UPDATE grant on news.
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
  'Increments a PUBLISHED news article''s view_count. SECURITY DEFINER so anon/'
  'authenticated readers can register a view without UPDATE rights on public.news.';

revoke all on function public.bump_news_view(uuid) from public;
grant execute on function public.bump_news_view(uuid) to anon, authenticated, service_role;
