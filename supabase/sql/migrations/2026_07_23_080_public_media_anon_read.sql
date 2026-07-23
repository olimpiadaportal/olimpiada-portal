-- =============================================================================
-- 2026_07_23_080_public_media_anon_read.sql
-- =============================================================================
-- Bug: news covers (and any other PUBLIC media metadata) never rendered for
-- LOGGED-OUT visitors. The public website resolves a cover image through the
-- news → media_assets join, but media_assets' only select policy was
-- `to authenticated` — the anon role had the table GRANT and no policy, so
-- RLS returned NULL for the embed and the card fell back to the placeholder.
-- Admins and signed-in users saw the image, which is why publishing "worked".
--
-- Fix: an anon-scoped select policy STRICTLY limited to rows explicitly marked
-- public (news covers and olympiad covers are inserted with
-- visibility = 'public'; question/explanation media are NOT public and stay
-- invisible to anon). The storage objects themselves were always in public
-- buckets — only the metadata row was blocked.
-- =============================================================================

begin;

drop policy if exists "media_select_anon" on public.media_assets;
create policy "media_select_anon" on public.media_assets for select to anon
  using (visibility = 'public');

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'media_assets'
                    and policyname = 'media_select_anon') then
    raise exception 'media_select_anon policy missing';
  end if;
end $$;

commit;

-- =============================================================================
-- End of 2026_07_23_080_public_media_anon_read.sql
-- =============================================================================
