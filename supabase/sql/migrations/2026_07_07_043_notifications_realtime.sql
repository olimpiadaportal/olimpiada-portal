-- =============================================================================
-- 2026_07_07_043_notifications_realtime.sql
-- Enable Supabase Realtime for the in-app notification center: add
-- public.notifications to the supabase_realtime publication so the per-user
-- postgres_changes INSERT subscription (bell/toast) receives live rows.
--
-- Guarded: the publication exists only on a Supabase project (not on the local
-- PostgreSQL used for from-zero rebuilds), and re-adding a table is a no-op —
-- both cases are swallowed so the script always succeeds.
-- Backport: same guarded block appended to canonical 010 (after RLS).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
      raise notice 'notifications added to supabase_realtime publication';
    exception when duplicate_object then
      raise notice 'notifications already in supabase_realtime publication';
    end;
  else
    raise notice 'supabase_realtime publication absent (local PG) — skipped';
  end if;
end $$;
