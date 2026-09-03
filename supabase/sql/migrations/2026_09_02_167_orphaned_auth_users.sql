-- Migration: 2026_09_02_167_orphaned_auth_users.sql
-- Purpose: stop fn_cascade_delete_parent_children stranding child logins, and
--          delete the 14 orphaned auth.users rows it already created.
-- Environment first applied: staging, then production
-- Related root SQL file(s): 011_indexes_constraints_functions_triggers.sql
-- Backport status: pending
-- Destructive change: YES — deletes rows from auth.users.
-- Rollback notes: NOT REVERSIBLE by SQL. Take
--   `pg_dump --data-only -t auth.users -t auth.identities -t auth.sessions`
--   BEFORE running; restoration is from that dump only. The deleted ids are
--   printed by the run (raise notice) so the psql transcript is a second record.
-- =============================================================================
-- 2026_09_02_167 — THE ORPHAN FACTORY, AND THE ORPHANS IT ALREADY MADE.
--
-- WHAT AN ORPHAN IS HERE. A row in auth.users with no public.profiles row. It
-- is not harmless leftover state: it is a WORKING LOGIN. A child signs in with
-- the synthetic address c<8-digit-id>@children.invalid and the parent-set
-- password, and GoTrue answers that against auth.users alone. Production holds
-- 14 of them — 12 children, and 9 have a non-null last_sign_in_at, so these are
-- not theoretical rows.
--
-- WHERE THEY COME FROM. fn_cascade_delete_parent_children (BEFORE DELETE on
-- public.parents) deletes each child's auth user, and wraps that in an
-- exception handler for insufficient_privilege/undefined_table so that a
-- privilege change can never turn a parent deletion into an outage. It then
-- unconditionally runs the "guarantee":
--
--     delete from public.profiles p where p.id = any(v_children);
--
-- That guarantee is what makes the orphan. The FK runs auth.users -> profiles,
-- NOT the reverse, so removing the profile leaves the auth user — and therefore
-- the login — perfectly intact. The tidier path failing silently and the
-- guarantee succeeding is the worst combination of the two, and it is the only
-- combination that produces a credential with no account behind it.
--
-- THE TRADE THIS MIGRATION MAKES, DELIBERATELY. The original comment reasons
-- that raising here "would abort the parent's deletion entirely — turning a
-- cleanup into an outage". True, and a failed deletion IS bad. But a surviving
-- child login is worse: the failure is invisible, it persists, and the family
-- believes the account is gone. A loud failure is recoverable in minutes; a
-- silent orphan was not noticed for two months. So: refuse rather than orphan.
--
-- The guarantee still covers what it was written for — children with NO auth
-- user at all (half-finished provisioning) — because the refusal below only
-- fires when a child's auth user is still PRESENT.
--
-- Companion server-side fix, same round: deleteParentAccountCore stopped
-- discarding the result of admin.auth.admin.deleteUser and now verifies each
-- user is actually gone before reporting success.
--
-- SAFE TO RE-RUN. The cleanup deletes only rows that are orphaned at the moment
-- it runs; a second execution finds none and reports 0.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stop making new orphans.
-- -----------------------------------------------------------------------------
create or replace function public.fn_cascade_delete_parent_children()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_children uuid[];
  v_stranded int;
begin
  -- Children of THIS parent, by either route: the creator column and the link
  -- table. The two can legitimately disagree (a link can be added later, a
  -- creator can be nulled), so the union is what "this parent's children" means.
  select coalesce(array_agg(distinct child), '{}')
    into v_children
  from (
    select s.profile_id as child
      from public.students s
     where s.created_by_parent_profile_id = old.profile_id
    union
    select l.student_profile_id
      from public.parent_student_links l
     where l.parent_profile_id = old.profile_id
  ) q
  -- Never touch a child that another parent still has. `l.parent_profile_id <>
  -- old.profile_id` is what makes this "no OTHER parent", not "no parent".
  where not exists (
    select 1
      from public.parent_student_links l2
     where l2.student_profile_id = q.child
       and l2.parent_profile_id <> old.profile_id
  )
  -- Paranoia: a parent is never their own child, but a self-referential row
  -- would recurse this trigger into the same DELETE. Cheap to exclude.
  and q.child <> old.profile_id;

  if array_length(v_children, 1) is null then
    return old;
  end if;

  -- Preferred: delete the child's AUTH user, which cascades profiles ->
  -- students -> child_credentials -> links in one step and leaves nothing
  -- behind in auth.users either.
  --
  -- Still best-effort, for the original reason: an exception here on a
  -- privilege change would abort the parent's deletion. The difference is what
  -- happens NEXT when it fails.
  begin
    delete from auth.users u
     where u.id in (
       select p.auth_user_id
         from public.profiles p
        where p.id = any(v_children)
          and p.auth_user_id is not null
     );
  exception
    when insufficient_privilege or undefined_table then
      null;
  end;

  -- THE CHANGE. Before running the guarantee, check whether any child's auth
  -- user survived the attempt above. If one did, deleting its profile would
  -- strand a working login: GoTrue authenticates c<id>@children.invalid against
  -- auth.users alone and never consults profiles.
  --
  -- Refuse instead. The parent's deletion fails loudly and recoverably, rather
  -- than succeeding while leaving a credential nobody can see or revoke.
  select count(*)
    into v_stranded
    from public.profiles p
   where p.id = any(v_children)
     and p.auth_user_id is not null
     and exists (select 1 from auth.users u where u.id = p.auth_user_id);

  if v_stranded > 0 then
    raise exception
      'cascade_delete_would_strand_% child login(s); parent % not deleted',
      v_stranded, old.profile_id
      using errcode = 'raise_exception';
  end if;

  -- The guarantee, unchanged in purpose: children that never had an auth user
  -- (half-finished provisioning). Everything with an auth user has already gone
  -- via the cascade above, or we refused.
  delete from public.profiles p where p.id = any(v_children);

  return old;
end;
$function$;

comment on function public.fn_cascade_delete_parent_children() is
  'Deletes a parent''s exclusively-owned children when the parent row goes. '
  'REFUSES rather than deleting a child profile whose auth user survived — '
  'that combination strands a working c<id>@children.invalid login with no '
  'account behind it (migration 167).';

-- -----------------------------------------------------------------------------
-- 2. Remove the orphans that already exist.
--
-- Scope is exactly "auth user with no profile". profiles.auth_user_id is NOT
-- NULL + UNIQUE with an FK to auth.users, and handle_new_user() creates the
-- profile in the SAME transaction as the auth user, so there is no mid-signup
-- window in which a live account looks orphaned.
--
-- All 10 FKs referencing auth.users are ON DELETE CASCADE (identities,
-- mfa_factors, oauth_authorizations, oauth_consents, one_time_tokens, sessions,
-- webauthn_challenges, webauthn_credentials, child_credentials, profiles), so
-- none of them can abort this.
--
-- TWO THINGS ARE **NOT** COVERED BY THAT CASCADE, contrary to the obvious
-- assumption:
--   * auth.refresh_tokens has NO foreign key to auth.users. It reaches the
--     delete indirectly, via session_id -> auth.sessions ON DELETE CASCADE. A
--     legacy token with session_id IS NULL would survive (there are none today).
--   * storage.objects.owner is a bare uuid with no FK at all, so avatar files
--     are NOT removed by this. None of the 14 own any object; the separate
--     purge-orphaned-avatars.mjs script handles the files that do exist.
-- -----------------------------------------------------------------------------
do $$
declare
  v_profiles int;
  v_before int;
  v_children int;
  v_pending int;
  v_signed_in int;
  v_deleted int;
  v_after int;
  v_ids uuid[];
begin
  -- =========================================================================
  -- GUARD 1 — THE ONE THAT WOULD HAVE DELETED EVERY LOGIN ON THE PLATFORM.
  --
  -- The delete predicate is "no public.profiles row references this auth user".
  -- That is only "orphaned" if profiles is READABLE AND POPULATED. It is not
  -- always either:
  --   * public.profiles has RLS enabled. Run as a role that neither owns the
  --     table nor sets rolbypassrls, and the subquery returns nothing for every
  --     user — so every user looks orphaned.
  --   * STAGING IS SCHEMA-ONLY (CLAUDE.md). profiles is EMPTY there, and the
  --     repo's own staging-first rule sends this migration to exactly that
  --     database. Same result: every row matches.
  --
  -- In both cases the post-conditions below would have PASSED, because zero
  -- users means zero orphans. The assertion pointed the wrong way. Refuse.
  -- =========================================================================
  select count(*) into v_profiles from public.profiles;
  if v_profiles = 0 then
    raise exception
      'refusing: public.profiles is empty or invisible to %, so every auth user '
      'would look orphaned. This migration is for a database WITH data.',
      current_user;
  end if;

  select count(*),
         count(*) filter (where u.email like '%@children.invalid'),
         count(*) filter (where u.email like 'pending-%@children.invalid'),
         count(*) filter (where u.last_sign_in_at is not null),
         coalesce(array_agg(u.id), '{}')
    into v_before, v_children, v_pending, v_signed_in, v_ids
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
   where p.id is null;

  -- The ids go in the transcript: after the commit this is the only record of
  -- WHICH logins were removed, short of the pg_dump named in the header.
  raise notice 'profiles=% orphaned auth users=% (% children, of which % never '
    'got an 8-digit id; % had signed in)',
    v_profiles, v_before, v_children, v_pending, v_signed_in;
  raise notice 'deleting ids: %', v_ids;

  -- GUARD 2 — a sanity ceiling. Review measured 14. Anything wildly larger
  -- means the predicate is matching something it should not, and a human should
  -- look before rows disappear.
  if v_before > 50 then
    raise exception
      'refusing: % orphans is far more than the 14 this migration was written '
      'for — verify the predicate before deleting', v_before;
  end if;

  delete from auth.users u
   where not exists (select 1 from public.profiles p where p.auth_user_id = u.id);
  get diagnostics v_deleted = row_count;

  -- GUARD 3 — the delete must have removed EXACTLY the rows counted above and
  -- nothing else. Without this, "no orphans remain" is satisfied just as well
  -- by having deleted everything.
  if v_deleted <> v_before then
    raise exception 'expected % deletion(s), made % — aborting', v_before, v_deleted;
  end if;

  select count(*) into v_after
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
   where p.id is null;

  raise notice 'deleted % orphaned auth user(s); remaining: %', v_deleted, v_after;

  -- The point of the migration is that none survive. Fail the transaction
  -- rather than report a clean run over a half-finished cleanup.
  if v_after <> 0 then
    raise exception 'orphan cleanup incomplete: % still present', v_after;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Prove the invariant holds, so a future regression is caught here.
-- -----------------------------------------------------------------------------
do $$
declare
  v_users int;
  v_profiles int;
  v_orphans int;
begin
  select count(*) into v_users from auth.users;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_orphans
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
   where p.id is null;

  raise notice 'auth.users=% profiles=% orphans=%', v_users, v_profiles, v_orphans;
  if v_orphans <> 0 then
    raise exception 'post-condition failed: % orphaned auth users', v_orphans;
  end if;

  -- "No orphans" is an invariant PRODUCED BY A TRIGGER, not enforced by a
  -- constraint: nothing in the schema forbids an auth user without a profile.
  -- It holds only while on_auth_user_created is armed and running
  -- handle_new_user(). If that trigger is ever dropped or disabled, new auth
  -- users silently become orphans — and a future re-run of section 2 would
  -- delete them as though they were leftovers. Assert it here so the dependency
  -- is checked rather than assumed.
  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth'
       and c.relname = 'users'
       and t.tgname = 'on_auth_user_created'
       and t.tgenabled <> 'D'
  ) then
    raise exception
      'post-condition failed: on_auth_user_created is missing or disabled — the '
      'no-orphan invariant is not being maintained';
  end if;
end $$;
