-- =============================================================================
-- 2026_07_03_022_fix_duplicate_wallpapers_media_fk.sql
-- =============================================================================
-- Round 9 (T9a root cause): long-lived dev carried TWO foreign keys from
-- wallpapers.media_asset_id to media_assets(id):
--   * wallpapers_media_asset_id_fkey — auto-named inline FK from the original
--     migration 2026_06_27_006 (which created the table with an inline
--     "references media_assets"), and
--   * fk_wallpapers_media — the canonical named FK added by 011.
-- PostgREST refuses AMBIGUOUS embeds when more than one relationship exists —
-- even with a column hint, because both FKs sit on the SAME column (PGRST201).
-- Result: every wallpapers→media_assets embed silently errored — the admin
-- Wallpapers list appeared frozen (saves persisted but never showed), and the
-- student background picker/dashboard lost image wallpapers.
--
-- Fix: keep the canonical fk_wallpapers_media, drop the auto-named duplicate.
-- Canonical files are already correct (003 creates the column bare; 011 adds
-- the single named FK) — from-zero rebuilds never had the duplicate, so no
-- canonical edit is needed beyond the new 013 check (#30) that guards the
-- single-FK invariant forever.
-- Safe to rerun: yes.
-- =============================================================================

alter table public.wallpapers
  drop constraint if exists wallpapers_media_asset_id_fkey;

-- Belt and braces: guarantee the canonical FK exists exactly once.
alter table public.wallpapers
  drop constraint if exists fk_wallpapers_media;
alter table public.wallpapers
  add constraint fk_wallpapers_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

-- =============================================================================
-- End of 2026_07_03_022_fix_duplicate_wallpapers_media_fk.sql
-- =============================================================================
