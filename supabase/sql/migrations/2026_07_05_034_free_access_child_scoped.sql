-- =============================================================================
-- 2026_07_05_034_free_access_child_scoped.sql
-- Round 12 pass-2 — review fixes for the free-access feature:
--   (major) The parent-facing gate/display must be PER-CHILD, not parent-wide. A
--     window scheduled for ONE child must NOT block subscribing a DIFFERENT,
--     uncovered sibling. New `is_child_free_access_active(p_student)` returns the
--     per-child free status but ONLY for the current user's OWN child (or the
--     child themselves) — so a parent can scope the gate to the exact child.
--   (minor) Tighten `is_free_access_active_for_student(uuid)`: it is only ever
--     invoked from SECURITY DEFINER contexts (the attempt RPCs, my_free_access_active,
--     is_child_free_access_active), so revoke the direct `authenticated` grant
--     (defense-in-depth; matches is_giveaway_active being service_role-only).
--
-- Backport: canonical 011 (new function + grant change); 013 #42 (anon check).
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- Destructive change: no (additive function + a privilege REVOKE).
-- =============================================================================

begin;

-- Per-child free status, scoped to the caller: a PARENT may check only their own
-- children; a CHILD may check itself; anyone else gets false. SECURITY DEFINER so
-- it can read the admin-only free_access_intervals via the base helper.
create or replace function public.is_child_free_access_active(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_student is null then false
    when p_student = public.current_profile_id()
      then public.is_free_access_active_for_student(p_student)
    when exists (
      select 1 from public.students s
      where s.profile_id = p_student
        and s.created_by_parent_profile_id = public.current_profile_id()
    ) then public.is_free_access_active_for_student(p_student)
    else false
  end;
$$;
comment on function public.is_child_free_access_active(uuid) is
  'Per-child free-access flag, scoped to the caller (own child / self only). Used by the parent subscription gate + display so a per-child window never blocks an uncovered sibling.';
revoke all on function public.is_child_free_access_active(uuid) from public, anon;
grant execute on function public.is_child_free_access_active(uuid) to authenticated, service_role;

-- Tighten the base helper: internal SECURITY DEFINER callers only (they run as the
-- owner, so this does not affect them). Removes the direct authenticated probe.
revoke execute on function public.is_free_access_active_for_student(uuid) from authenticated;

commit;

-- =============================================================================
-- End of 2026_07_05_034_free_access_child_scoped.sql
-- =============================================================================
