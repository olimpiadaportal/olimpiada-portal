-- Migration: 2026_09_16_177_link_child_by_credentials.sql
-- Purpose: Replace the invite/approval linking flow with direct verification of
--          the child's own credentials (8-digit id + parent-set password).
-- Environment first applied: (pending) staging, then production.
-- Related root SQL: 002 tables; 008 tables; 010 grants; 011 functions; 013 checks.
-- Backport status: pending. Destructive change: no. No payment is created.
-- Requires 173-176. Idempotent. No BEGIN/COMMIT inside this migration.
-- DOWN: revoke execute on link_child_by_verified_credentials from service_role.
--       Never delete parent_student_links rows as rollback - that erases live
--       family access, exactly as migration 176's own DOWN note says.
--
-- WHY THIS EXISTS (owner decision, 2026-09-16). The invite flow shipped in 176
-- and has NEVER completed a link in production: 4 codes were minted on
-- 2026-09-15, 1 was redeemed, and zero parent_student_links rows resulted. The
-- cause is in 176 itself - issuing a new code runs
--   update parent_link_invites set status='revoked' where status in ('open','pending')
-- so minting a second code silently destroys a redemption that is already
-- waiting for approval. A parent who redeems, sees no approval prompt, and
-- generates a fresh code to retry has just thrown away their own redemption.
-- The owner asked for the approval step to go entirely, which removes the whole
-- class of bug rather than patching that one line.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not drop parent_link_invites,
-- parent_link_redeem_attempts or manage_child_link. The owner's instruction was
-- to deprecate their USAGE. 176's tables still carry history, manage_child_link
-- still owns 'revoke' and 'leave' - which this flow needs and does not
-- reimplement - and dropping a live function to prove a point is how unrelated
-- surfaces break.
--
-- THE THREAT MODEL CHANGED, AND THE MITIGATIONS ARE THE POINT. Approval was the
-- consent step AND the notification. Removing it means an adult holding a
-- child's credentials links silently. Those credentials are known to the child,
-- to anyone the child tells, and to whoever originally set the password - which
-- migration 173's header names as a possible estranged ex-partner. So this
-- migration adds back, as mechanism, what approval provided as ceremony:
--   * a rate-limit ledger that CANNOT be used to lock a child out of their own
--     account (see parent_link_verify_attempts below),
--   * a priority-1 notification to the creating parent on every link, naming the
--     adult, so the account owner always learns of it,
--   * an audit row at severity warning,
--   * the 4-adult cap from 176, unchanged,
--   * and the creator-only boundary: a credential-verified adult still cannot
--     reset the child's password or change their avatar.

-- 1. Structured parent names. ------------------------------------------------
-- The linking UI must show WHO has access "by first name, last name and email".
-- profiles has email but only display_name, which registration builds by joining
-- first and last with a space (parentValidation.ts). Splitting it back is
-- therefore RECOVERY of how it was built, not invention: the join is the inverse
-- of the split. It is best-effort for a two-word given name and exact for every
-- registration from this migration forward, because the registration path starts
-- writing both parts alongside display_name.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

comment on column public.profiles.first_name is
  'Given name as entered at registration. Nullable: rows predating migration 177 were backfilled by splitting display_name and may be imperfect for multi-word given names. Never render this alone as identity - display_name remains the canonical label.';
comment on column public.profiles.last_name is
  'Family name as entered at registration. Nullable for the same reason as first_name.';

update public.profiles
   set first_name = nullif(btrim(split_part(display_name, ' ', 1)), ''),
       last_name  = nullif(btrim(substr(display_name, strpos(display_name, ' ') + 1)), '')
 where display_name is not null
   and btrim(display_name) <> ''
   and strpos(display_name, ' ') > 0
   and first_name is null
   and last_name is null;

-- A single-word display_name has no family part; record the given name only
-- rather than duplicating the same string into both columns.
update public.profiles
   set first_name = nullif(btrim(display_name), '')
 where display_name is not null
   and btrim(display_name) <> ''
   and strpos(btrim(display_name), ' ') = 0
   and first_name is null;

-- 2. The verification rate-limit ledger. -------------------------------------
-- SEPARATE FROM child_login_attempts ON PURPOSE, and this is the single most
-- important decision in the file.
--
-- The obvious implementation records failures through record_child_login_attempt
-- so the existing 8-strikes-in-15-minutes lockout applies. That would hand any
-- hostile adult a denial-of-service against a real minor: eight deliberate wrong
-- guesses and the child cannot sign in to their own app for fifteen minutes,
-- from a parent-facing endpoint, deniably. So this flow keeps its OWN counter
-- and never writes to child_login_attempts.
--
-- It still READS is_child_login_locked before attempting, so an account already
-- under attack through the login form is not also probed here. Reading respects
-- an existing lockout; writing would create one.
--
-- Nor does a success here clear the child's real failure streak
-- (record_child_login_attempt deletes it on success, 011:1443-1448), which would
-- silently unlock an account someone was in the middle of locking out.
create table if not exists public.parent_link_verify_attempts (
  id                bigserial primary key,
  actor_profile_id  uuid not null references public.profiles(id) on delete cascade,
  child_unique_id   text not null,
  ip_hash           text,
  success           boolean not null,
  attempted_at      timestamptz not null default now()
);

create index if not exists parent_link_verify_actor_time
  on public.parent_link_verify_attempts(actor_profile_id, attempted_at);
create index if not exists parent_link_verify_ip_time
  on public.parent_link_verify_attempts(ip_hash, attempted_at) where ip_hash is not null;

-- Sealed exactly like 176's tables: no policy, no grant to anon/authenticated.
-- A client that cannot reach the table cannot mine it for which ids exist.
-- 013 check 3 understands this shape - a table with RLS on, no policies AND no
-- client grants is deny-all twice over, not an unguarded table.
alter table public.parent_link_verify_attempts enable row level security;
revoke all on public.parent_link_verify_attempts from public, anon, authenticated;
grant all on public.parent_link_verify_attempts to service_role;
grant usage, select on sequence public.parent_link_verify_attempts_id_seq to service_role;

-- 3. The lockout read. --------------------------------------------------------
-- Two ceilings, because they answer different attacks. The actor ceiling stops
-- one parent grinding many children; the IP ceiling stops one host grinding from
-- many throwaway parent accounts, which are free to create.
create or replace function public.is_parent_link_verify_locked(
  p_actor   uuid,
  p_ip_hash text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    (select count(*) from public.parent_link_verify_attempts a
      where a.actor_profile_id = p_actor
        and a.success = false
        and a.attempted_at > now() - interval '1 hour') >= 5
    or (p_ip_hash is not null and
        (select count(*) from public.parent_link_verify_attempts a
          where a.ip_hash = p_ip_hash
            and a.success = false
            and a.attempted_at > now() - interval '1 hour') >= 15)
$fn$;

create or replace function public.record_parent_link_verify_attempt(
  p_actor           uuid,
  p_child_unique_id text,
  p_ip_hash         text,
  p_success         boolean
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  insert into public.parent_link_verify_attempts(actor_profile_id, child_unique_id, ip_hash, success)
  values (p_actor, p_child_unique_id, p_ip_hash, p_success);
$fn$;

revoke all on function public.is_parent_link_verify_locked(uuid, text) from public, anon, authenticated;
grant execute on function public.is_parent_link_verify_locked(uuid, text) to service_role;
revoke all on function public.record_parent_link_verify_attempt(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_parent_link_verify_attempt(uuid, text, text, boolean) to service_role;

-- 4. The link itself. ---------------------------------------------------------
-- CALLED ONLY AFTER Node has verified the child's password against Supabase Auth
-- on a bare token client. SQL cannot check a password, so this function trusts
-- its caller - which is safe only because EXECUTE is service_role-only and the
-- service key never leaves the server. Do not grant it to authenticated.
create or replace function public.link_child_by_verified_credentials(
  p_actor           uuid,
  p_child_unique_id text,
  p_ip_hash         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_student   uuid;
  v_creator   uuid;
  v_child_nm  text;
  v_actor_nm  text;
  v_actor_em  text;
  v_count     int;
begin
  if p_actor is null or p_child_unique_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  -- The actor must be an ACTIVE parent. A suspended account must not be able to
  -- attach itself to a minor.
  if not exists (
    select 1 from public.parents pa
      join public.profiles pr on pr.id = pa.profile_id
     where pa.profile_id = p_actor and pr.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select s.profile_id, s.created_by_parent_profile_id, pr.display_name
    into v_student, v_creator, v_child_nm
    from public.students s
    join public.profiles pr on pr.id = s.profile_id
   where s.child_unique_id = p_child_unique_id;

  -- ONE GENERIC ANSWER for "no such child". Both existing child-login paths
  -- refuse to distinguish absent from wrong, because an endpoint that
  -- distinguishes them turns a 10^8 id space into an enumerable directory of
  -- real minors. That reasoning does not stop applying because the caller is an
  -- adult.
  if v_student is null then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  -- The creator already has full access through students.created_by_parent_profile_id
  -- and needs no link row. Saying so plainly is safe: the caller proved they hold
  -- this child's password, so they learn nothing here they did not already know.
  if v_creator = p_actor then
    return jsonb_build_object('ok', false, 'code', 'alreadyOwner');
  end if;

  if exists (
    select 1 from public.parent_student_links
     where parent_profile_id = p_actor
       and student_profile_id = v_student
       and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'alreadyLinked');
  end if;

  -- The 4-adult cap from 176, unchanged. It is the only thing bounding how many
  -- adults one leaked credential can admit.
  select count(*) + 1 into v_count
    from public.parent_student_links
   where student_profile_id = v_student
     and status = 'active'
     and parent_profile_id <> v_creator;
  if v_count >= 4 then
    return jsonb_build_object('ok', false, 'code', 'limit');
  end if;

  insert into public.parent_student_links(parent_profile_id, student_profile_id, status, verified_at, created_by)
  values (p_actor, v_student, 'active', now(), p_actor)
  on conflict (parent_profile_id, student_profile_id) do update
    set status = 'active', verified_at = now(), updated_at = now();

  select coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.display_name),
         pr.email::text
    into v_actor_nm, v_actor_em
    from public.profiles pr where pr.id = p_actor;

  -- Audit at WARNING: this is an access grant over a minor, performed without
  -- the account owner present. It must never contain the submitted password in
  -- any form, including a hash.
  insert into public.audit_logs(actor_profile_id, action, entity_type, entity_id, severity, metadata)
  values (p_actor, 'child.access.credentialLink', 'students', v_student, 'warning',
          jsonb_build_object('child_unique_id', p_child_unique_id, 'granted_to', p_actor, 'method', 'credentials'));

  -- THE NOTIFICATION IS THE REPLACEMENT FOR APPROVAL, not a courtesy. Without it
  -- a link forms with zero signal to the account owner. Priority 1 because that
  -- level is exempt from the platform-wide notification master switch and from
  -- the recipient's own mute - it is reserved for payment and security, and
  -- "another adult now has access to your child" is the second.
  --
  -- Category 'announcement' rather than a new 'security' one: the web processor
  -- sends channelId = category and the Android channel ids in the shipped binary
  -- must match byte-for-byte. A new category would land on a channel that
  -- 1.16.0 installs do not define.
  if v_creator is not null then
    perform public.create_notification(
      v_creator,
      'child_access_granted',
      v_child_nm,
      v_actor_nm,
      jsonb_build_object('student_profile_id', v_student, 'parent_profile_id', p_actor,
                         'parent_name', v_actor_nm, 'parent_email', v_actor_em),
      array['in_app', 'push'],
      'child_access_granted:' || v_student::text || ':' || p_actor::text,
      1,
      null,
      'announcement',
      null
    );
  end if;

  return jsonb_build_object('ok', true, 'student_profile_id', v_student, 'child_name', v_child_nm);
end;
$fn$;

revoke all on function public.link_child_by_verified_credentials(uuid, text, text) from public, anon, authenticated;
grant execute on function public.link_child_by_verified_credentials(uuid, text, text) to service_role;

-- 5. Who has access to this child. -------------------------------------------
-- Answers the spec's "the child record must show that access has been granted
-- and identify the parent by first name, last name and email". Readable only by
-- an adult who already has access to that child - creator or active link - so it
-- never becomes a way to discover the adults around an arbitrary minor.
create or replace function public.child_access_adults(p_actor uuid, p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid;
  v_rows    jsonb;
begin
  select created_by_parent_profile_id into v_creator
    from public.students where profile_id = p_student;

  if v_creator is distinct from p_actor
     and not exists (select 1 from public.parent_student_links
                      where parent_profile_id = p_actor
                        and student_profile_id = p_student
                        and status = 'active')
     and not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(r order by r ->> 'role', r ->> 'last_name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'profile_id',   pr.id,
             'first_name',   pr.first_name,
             'last_name',    pr.last_name,
             'display_name', pr.display_name,
             'email',        pr.email::text,
             'role',         case when pr.id = v_creator then 'creator' else 'linked' end,
             'since',        coalesce(l.verified_at, l.created_at)
           ) as r
      from public.profiles pr
      left join public.parent_student_links l
             on l.parent_profile_id = pr.id
            and l.student_profile_id = p_student
            and l.status = 'active'
     where pr.id = v_creator
        or l.id is not null
  ) s;

  return jsonb_build_object('ok', true, 'adults', v_rows);
end;
$fn$;

revoke all on function public.child_access_adults(uuid, uuid) from public, anon, authenticated;
grant execute on function public.child_access_adults(uuid, uuid) to service_role;
