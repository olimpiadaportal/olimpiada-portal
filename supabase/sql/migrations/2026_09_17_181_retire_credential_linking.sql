-- Migration: 2026_09_17_181_retire_credential_linking.sql
-- Purpose: Retire the "child id + child password" way of linking an existing
--          child. The invite code becomes the only route in.
-- Environment first applied: (pending) staging, then production.
-- Related root SQL: 002 tables; 010 grants; 011 functions; 013 check 135.
-- Backport status: pending. Requires 177 and 180. Idempotent.
-- No BEGIN/COMMIT inside this migration.
-- DOWN: re-apply migration 177. Nothing here is recoverable-by-necessity - see
--       the row counts below.
--
-- WHY (owner, 2026-09-17). Two ways to link an existing child shipped two days
-- apart; the owner wants one. The credential path is the one that goes, and it
-- is the right choice on its own merits: an invite code is a ONE-TIME, EXPIRING
-- secret that the CREATING parent generates deliberately and hands to a named
-- adult. A child's password is a STANDING secret that the child also knows, can
-- share, and cannot revoke. Keeping the weaker of two overlapping doors open
-- buys nothing.
--
-- SAFE TO DROP, MEASURED RATHER THAN ASSUMED. Before writing this, production
-- was checked: parent_link_verify_attempts holds 0 rows and audit_logs holds 0
-- entries for 'child.access.credentialLink'. The path shipped, was never used by
-- anyone, and is being withdrawn before it was. There is no family whose access
-- depends on it and no history to preserve.
--
-- WHAT DELIBERATELY SURVIVES, because it was never about credentials:
--   * child_access_adults(uuid,uuid) - the "who can reach this child" list the
--     INVITE panel renders. Dropping it would break the surviving flow.
--   * profiles.first_name / profiles.last_name (177) - that list shows them, and
--     registration now writes them.
--   * parent_student_links and every existing row. Nothing here revokes access
--     anybody already has.

-- 1. The grant itself. -------------------------------------------------------
-- Dropped FIRST and on its own line: while this function exists, a service-role
-- caller can still mint a link from a password, whatever the app layer does.
drop function if exists public.link_child_by_verified_credentials(uuid, text, text);

-- 2. The throttle that only it used. -----------------------------------------
-- These guarded the credential endpoint against becoming a password oracle over
-- an 8-digit id space. With no endpoint there is nothing to throttle, and a
-- security helper left lying around unused is one a future caller will wire to
-- something it was never reasoned about.
drop function if exists public.is_parent_link_verify_locked(uuid, text);
drop function if exists public.record_parent_link_verify_attempt(uuid, text, text, boolean);

-- 3. The ledger. -------------------------------------------------------------
-- DESTRUCTIVE IN FORM, NOT IN SUBSTANCE: it holds 0 rows, it recorded nothing
-- but rate-limit bookkeeping for a feature nobody used, and no other object
-- reads it. Dropped rather than left sealed-and-empty so that 013 check 3 is not
-- asked to keep explaining a table with no purpose.
--
-- The SEQUENCE goes with it (bigserial owns one); `cascade` is deliberately NOT
-- used, so if anything unexpected still depends on this table the migration
-- FAILS LOUDLY here instead of quietly taking that dependent with it.
drop table if exists public.parent_link_verify_attempts;

-- 4. Reassert the surviving grants. ------------------------------------------
-- child_access_adults must stay service_role-only. Re-stating it costs nothing
-- and means this migration leaves the posture explicit rather than inherited.
revoke all on function public.child_access_adults(uuid, uuid) from public, anon, authenticated;
grant execute on function public.child_access_adults(uuid, uuid) to service_role;

-- 5. Prove the surviving path is untouched. ----------------------------------
-- The invite flow is now the ONLY way a second adult is added. If it is not
-- there, this migration has left the product with no way to share a child at
-- all, and that must stop the run rather than be discovered by a parent.
do $$
begin
  if to_regprocedure('public.manage_child_link(uuid,text,uuid,uuid,uuid,text,text)') is null then
    raise exception 'migration 181: manage_child_link is missing - the invite path is the only route left and it must exist';
  end if;
  if to_regprocedure('public.child_access_adults(uuid,uuid)') is null then
    raise exception 'migration 181: child_access_adults is missing - the invite panel reads it';
  end if;
  if to_regprocedure('public.link_child_by_verified_credentials(uuid,text,text)') is not null then
    raise exception 'migration 181: the credential grant is still present';
  end if;
end $$;
