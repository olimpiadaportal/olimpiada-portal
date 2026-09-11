-- Migration: 2026_09_10_170_parent_student_link_forgery.sql
-- Purpose: stop an authenticated parent forging an ACTIVE parent_student_links
--          row that names another family's child. psl_insert/psl_update
--          constrained only parent_profile_id, never student_profile_id and
--          never status.
-- Environment first applied: staging + production, 2026-09-10
-- Related root SQL file(s): 010_rls_policies.sql, 013_validation_queries.sql
-- Backport status: completed (010 policies + 013 check 128, same round)
-- Destructive change: no -- policy replacement only; no data is read or written.
-- Rollback notes: REVERSIBLE. Re-create the two policies with their former
--   predicate `(parent_profile_id = public.current_profile_id() or
--   public.is_admin())` in both WITH CHECK and USING. Do not roll back without
--   reading the reasoning below first -- the old predicate is the defect.
-- =============================================================================
-- 2026_09_10_170 -- THE LINK THAT AUTHORIZES EVERYTHING, WRITABLE BY ANYONE.
--
-- WHAT parent_student_links IS. Its own comment (002) says it plainly: "the ONLY
-- source of truth for parent access to a student. RLS for parent reads checks an
-- 'active' link here." is_parent_linked_to_student() (002) is one EXISTS over
-- this table, it is SECURITY DEFINER so the table's own RLS never re-filters it,
-- and roughly twenty SELECT policies plus the private child-avatar storage gate
-- read it as their authorization fact: students (including child_unique_id, the
-- child's 8-digit LOGIN username), profiles, test_attempts, test_attempt_answers,
-- progress_snapshots, student_points_ledger, student_activity_days,
-- leaderboard_entries, student_achievements, child_subscriptions,
-- subscription_subjects, entitlements, free_trials, subscription_changes,
-- olympiad_purchases, the wallpaper/sticker selections, notification_preferences.
--
-- THE HOLE. The two write policies were:
--
--   psl_insert  with check (parent_profile_id = current_profile_id() or is_admin())
--   psl_update  using/with check (same)
--
-- NEITHER MENTIONS student_profile_id. The predicate pins WHO the row says the
-- parent is, and says nothing at all about WHICH CHILD it hands them. It is the
-- classic shape of this bug: the policy guards the row's owner column and leaves
-- the column that actually confers the privilege unconstrained.
--
-- Four things make that predicate the entire gate, all of them checked rather
-- than assumed: RLS is enabled on the table (010's enable loop lists it);
-- `grant insert, update, delete on all tables in schema public to authenticated`
-- (010) applies with NO column-level revoke for this table -- contrast the
-- deliberate column hardening 010 does for test_attempts/test_attempt_answers,
-- which this table never received, so `status` is client-settable; the only
-- trigger on the table is trg_audit_parent_student_links (011), an AFTER trigger
-- that RECORDS and never validates; and uq_parent_student_pair (002) is unique on
-- the PAIR, so a brand-new forged pair is never a duplicate.
--
-- ONE STATEMENT, NOT TWO. `status` defaults to 'pending', but nothing stopped a
-- client supplying 'active' in the INSERT itself. So the attack was a single
-- PostgREST call, and tightening psl_update ALONE would have fixed nothing. Both
-- policies are replaced here, together, for that reason.
--
-- WHAT IT WOULD HAVE BOUGHT. Not merely reading a minor's record. The web app's
-- parentOwnsChild helper (web-app/src/lib/auth/childAccountService.ts) accepts
-- "created the child OR has an active link" as ownership, and resetChildPassword
-- gates on it before calling auth.admin.updateUserById. The same forged link also
-- makes students.child_unique_id readable. Both halves of a child's login --
-- 8-digit ID and a password of the attacker's choosing -- from one forged row.
-- childAvatarCore.ts gates the PRIVATE child-photo path the same way.
--
-- WHY IT WAS NOT EXPLOITABLE, AND WHY THAT IS NOT A REASON TO WAIT. The FK
-- student_profile_id -> students(profile_id) (002) forces an EXISTING profile id,
-- and profiles.id is gen_random_uuid() -- 122 bits, and distinct from auth_user_id.
-- A sweep of every table, every anon/authenticated-executable function, both
-- leaderboards (get_leaderboard emits profile_id only inside the boolean
-- `= v_me`; get_public_leaderboard returns no uuid at all; lb_rows,
-- lb_season_live and lb_notify_audience are revoked from authenticated), the
-- storage buckets, the realtime publication and every BFF response found no route
-- that hands a parent a foreign student's profile_id. So the chain was dormant.
-- Dormant is not safe: the sink is fully built and needs no further bug, and
-- student_profile_id already circulates in notification payloads and audit rows
-- -- exactly the channels that leak through support tickets, logs, screenshots
-- and exports. The control here must be authorization, not the secrecy of a
-- random number.
--
-- THE FIX, AND WHY IT BREAKS NOTHING. A non-admin may now write a link only for a
-- student THEY created (students.created_by_parent_profile_id = their profile),
-- in both the OLD row (USING) and the NEW row (WITH CHECK). USING blocks
-- promoting a link that names someone else's child; WITH CHECK blocks repointing
-- student_profile_id at one. `status` needs no separate clause: a parent can now
-- only ever set it on a link to their own created child, which is the state
-- create_child_account already writes.
--
-- No legitimate writer is affected, verified two ways. (1) NO client code writes
-- this table at all -- the only application references are two READS
-- (childAccountService.ts, childAvatarCore.ts). (2) Every SQL writer is
-- create_child_account (011), which is SECURITY DEFINER owned by the table owner
-- (no table anywhere in this schema uses FORCE ROW LEVEL SECURITY) and is granted
-- to service_role ONLY -- revoked from public, anon and authenticated. Both of
-- those bypass RLS entirely, so these policies never apply to it. Its own row
-- would satisfy the new predicate regardless: it inserts into students before it
-- inserts the link, with created_by_parent_profile_id = the same parent.
--
-- The `exists (select 1 from public.students s ...)` idiom is the one already
-- used by cws_select, css_select, entitlements_select and free_trials_select in
-- 010. Its subquery runs under the caller's RLS on students, which is harmless
-- here: students_select grants the creating parent their own created rows, so
-- every row that could satisfy the predicate is also visible to the caller, and
-- the predicate tests the COLUMN VALUE -- a forged link making a foreign child
-- visible still cannot make created_by_parent_profile_id equal the attacker.
--
-- psl_select and psl_delete are deliberately untouched: reading your own links
-- and deleting your own link are not escalations.
--
-- SAFE TO RE-RUN -- drop-if-exists / create, no data touched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. INSERT: the named student must be one the caller created.
-- -----------------------------------------------------------------------------
drop policy if exists "psl_insert" on public.parent_student_links;
create policy "psl_insert" on public.parent_student_links for insert to authenticated
  with check (
    public.is_admin()
    or (
      parent_profile_id = public.current_profile_id()
      and exists (select 1 from public.students s
                   where s.profile_id = student_profile_id
                     and s.created_by_parent_profile_id = public.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 2. UPDATE: the same predicate on the OLD row (no promoting someone else's link
--    to 'active') and on the NEW row (no repointing student_profile_id).
-- -----------------------------------------------------------------------------
drop policy if exists "psl_update" on public.parent_student_links;
create policy "psl_update" on public.parent_student_links for update to authenticated
  using (
    public.is_admin()
    or (
      parent_profile_id = public.current_profile_id()
      and exists (select 1 from public.students s
                   where s.profile_id = student_profile_id
                     and s.created_by_parent_profile_id = public.current_profile_id())
    )
  )
  with check (
    public.is_admin()
    or (
      parent_profile_id = public.current_profile_id()
      and exists (select 1 from public.students s
                   where s.profile_id = student_profile_id
                     and s.created_by_parent_profile_id = public.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Prove both policies now name the column the old ones ignored.
-- -----------------------------------------------------------------------------
do $$
declare
  v_insert text;
  v_using  text;
  v_check  text;
begin
  select p.with_check into v_insert from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'parent_student_links'
     and p.policyname = 'psl_insert';
  select p.qual, p.with_check into v_using, v_check from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'parent_student_links'
     and p.policyname = 'psl_update';

  if v_insert is null
     or position('student_profile_id' in v_insert) = 0
     or position('created_by_parent_profile_id' in v_insert) = 0 then
    raise exception 'psl_insert did not take: %', coalesce(v_insert, '<missing>');
  end if;

  if v_using is null
     or position('student_profile_id' in v_using) = 0
     or position('created_by_parent_profile_id' in v_using) = 0
     or v_check is null
     or position('student_profile_id' in v_check) = 0
     or position('created_by_parent_profile_id' in v_check) = 0 then
    raise exception 'psl_update did not take (using=% check=%)',
      coalesce(v_using, '<missing>'), coalesce(v_check, '<missing>');
  end if;

  raise notice 'parent_student_links: psl_insert and psl_update now constrain student_profile_id.';
end
$$;
