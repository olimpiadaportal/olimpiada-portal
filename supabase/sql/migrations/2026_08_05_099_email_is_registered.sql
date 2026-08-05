-- 099 — Authoritative "is this email already taken?" check
--
-- WHY THE PREVIOUS APPROACH WAS NOT ENOUGH
-- ----------------------------------------
-- Migration-free fix 098-era code detected duplicates from GoTrue's response
-- shape: signing up an address that already belongs to a CONFIRMED account
-- returns HTTP 200 with an obfuscated user whose `identities` array is empty.
--
-- That covers exactly one case. When the existing account is **unconfirmed**,
-- GoTrue does something different — it treats the repeat sign-up as a resend,
-- returns a perfectly normal user object with identities populated, and the
-- caller cannot tell it from a first registration. During testing that is the
-- COMMON case (register, never click the link, register again), which is why
-- duplicates still got through.
--
-- So the question is asked directly, of the only table that actually knows.
--
-- PERFORMANCE
-- -----------
-- One equality lookup on an indexed column. auth.users carries both
-- `users_email_partial_key` (unique btree on email) and `idx_users_email`
-- (plain btree), so this is an index probe — O(log n), a fraction of a
-- millisecond, and it runs ONCE per registration attempt, a path already
-- rate-limited to 5 per address per 15 minutes. `lower()` is applied to the
-- PARAMETER, never to the column: `lower(u.email) = …` would discard the index
-- and force a sequential scan of every user, which is the exact mistake this
-- comment exists to prevent.
--
-- SECURITY
-- --------
-- This is an account-existence oracle, so it is service_role ONLY. anon and
-- authenticated are revoked EXPLICITLY, not merely left ungranted — Supabase's
-- default privileges grant EXECUTE on new functions to both roles, so relying on
-- the absence of a grant would silently publish it. Callers are the web register
-- action and the mobile BFF, both server-side behind the same rate limiter.
--
-- IDEMPOTENT. Safe to re-run.

begin;

create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from auth.users u
     -- Column bare on the left so the btree index is usable; the parameter is
     -- normalized instead. GoTrue stores addresses lowercased.
     where u.email = lower(trim(coalesce(p_email, '')))
  );
$$;

comment on function public.email_is_registered(text) is
  'Migration 099: true when an auth user already holds this email, CONFIRMED or '
  'not. Service-role only (account-existence oracle). Soft-deleted users still '
  'count — their row keeps the unique index entry, so the address is genuinely '
  'unavailable and reporting it free would only move the failure later.';

revoke all on function public.email_is_registered(text) from public, anon, authenticated;
grant execute on function public.email_is_registered(text) to service_role;

-- -----------------------------------------------------------------------------
-- Assertions. A silently-wrong answer here either blocks every registration or
-- blocks none, so both directions are checked against a real row.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_known text;
begin
  if has_function_privilege('anon', 'public.email_is_registered(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.email_is_registered(text)', 'EXECUTE') then
    raise exception '099: email_is_registered must not be executable by anon/authenticated';
  end if;

  if public.email_is_registered('definitely-not-a-user-9f3a2b@example.invalid') then
    raise exception '099: reported an unused address as registered';
  end if;

  select u.email into v_known from auth.users u where u.email is not null limit 1;
  if v_known is not null then
    if not public.email_is_registered(v_known) then
      raise exception '099: failed to recognise an existing address';
    end if;
    -- Case and padding must not create a false "available".
    if not public.email_is_registered('  ' || upper(v_known) || '  ') then
      raise exception '099: normalization failed (upper/whitespace not handled)';
    end if;
  end if;

  raise notice '099 OK — email_is_registered live, service-role only, normalization correct';
end
$verify$;

commit;
