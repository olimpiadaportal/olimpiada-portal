-- 183 — Free trial: abuse protection, extensions, and a server clock (2026-10-10).
--
-- 1. THE EMAIL LEDGER. A trial is once per CHILD (free_trials, unique on the
--    student). That row cascades away when the account is deleted, so deleting
--    the account and registering again used to reset it. trial_email_ledger is
--    keyed on sha256 of the NORMALISED parent email — lowercased, "+tag"
--    removed, and for Gmail the dots too — so an alias does not count as a new
--    person and no readable address is retained after deletion. Its foreign key
--    is ON DELETE SET NULL: the ledger outlives the account on purpose.
--    activate_free_trial refuses once an email has reached the cap
--    (trial.max_per_email, default 3 children — one family, not a farm).
--
-- 2. EXTENSIONS. An additional trial window after the first one has ENDED,
--    granted only by an administrator (grant_free_trial_extension), recorded
--    separately from the original trial, capped (trial.max_extensions, default
--    1) and sized by a setting (trial.extension_hours, default 24). It grants the
--    SAME subjects through new 'trial' entitlements. It never creates a
--    subscription, a payment or a checkout — there is nothing to charge.
--
-- 3. THE SERVER CLOCK. child_free_trial now returns server_now, the effective
--    ends_at (the later of the trial and any extension), activated_at and the
--    extension state. Every app's countdown is computed against server_now, so a
--    phone with a wrong clock still shows the right remaining time, and a trial
--    started on one platform counts down identically on the others.
--
-- activate_free_trial is rebuilt from its live definition (pg_get_functiondef),
-- not retyped: every existing refusal is unchanged; only the cap and the ledger
-- insert are added. Safe to re-run. Not self-transacting.

-- ---------------------------------------------------------------- settings
insert into public.system_settings (key, value_json) values
  ('trial.max_per_email', '3'::jsonb),
  ('trial.max_extensions', '1'::jsonb),
  ('trial.extension_hours', '24'::jsonb)
on conflict (key) do nothing;

-- A bounded integer setting, with a fallback when the row is missing or bad.
create or replace function public.trial_setting_int(p_key text, p_default int, p_min int, p_max int)
returns int
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v int;
begin
  begin
    select nullif(s.value_json #>> '{}', '')::int into v from public.system_settings s where s.key = p_key;
  exception when others then
    v := null;
  end;
  return least(p_max, greatest(p_min, coalesce(v, p_default)));
end;
$$;

-- ---------------------------------------------------------------- ledger
create or replace function public.trial_email_key(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else encode(sha256(convert_to(
      case when x.dom in ('gmail.com', 'googlemail.com')
           then replace(split_part(x.loc, '+', 1), '.', '') || '@gmail.com'
           else split_part(x.loc, '+', 1) || '@' || x.dom
      end, 'UTF8')), 'hex')
  end
  from (select lower(trim(split_part(p_email, '@', 1))) as loc,
               lower(trim(split_part(p_email, '@', 2))) as dom) x;
$$;

create table if not exists public.trial_email_ledger (
  id                 uuid primary key default gen_random_uuid(),
  email_key          text not null,
  student_profile_id uuid references public.students(profile_id) on delete set null,
  granted_at         timestamptz not null default now()
);
create index if not exists ix_trial_email_ledger_key on public.trial_email_ledger (email_key);
alter table public.trial_email_ledger enable row level security;
-- No policies: written and read only inside security-definer functions.

-- Trials that already exist count against their parent's email.
insert into public.trial_email_ledger (email_key, student_profile_id, granted_at)
select public.trial_email_key(p.email::text), ft.student_profile_id, ft.activated_at
  from public.free_trials ft
  join public.profiles p on p.id = ft.owner_parent_profile_id
 where public.trial_email_key(p.email::text) is not null
   and not exists (select 1 from public.trial_email_ledger l where l.student_profile_id = ft.student_profile_id);

-- ---------------------------------------------------------------- activation (rebuilt from live)
CREATE OR REPLACE FUNCTION public.activate_free_trial(p_parent uuid, p_student uuid, p_subject_ids uuid[], p_locale text DEFAULT 'az'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_hours  constant int := 24;
  c_max    constant int := 2;
  v_ends   timestamptz;
  v_locale text := case when p_locale in ('az','en','ru') then p_locale else 'az' end;
  v_subj   uuid;
  v_n      int;
  v_email_key text;
  v_cap       int;
begin
  if p_parent is null or p_student is null then
    raise exception 'trial: missing ids' using errcode = 'check_violation';
  end if;

  -- OWNERSHIP FIRST. entitlement_grant performs no ownership check at all -- it
  -- constrains p_student only by the foreign key -- so this cannot be delegated
  -- to it. The parent id arrives from requireParent(), never from a request body.
  if not exists (
    select 1 from public.students s
    where s.profile_id = p_student
      and s.created_by_parent_profile_id = p_parent
  ) then
    raise exception 'trial: not your child' using errcode = 'check_violation',
      hint = 'not_your_child';
  end if;

  v_n := coalesce(cardinality(p_subject_ids), 0);
  if v_n < 1 or v_n > c_max then
    raise exception 'trial: choose between 1 and % subjects', c_max
      using errcode = 'check_violation', hint = 'too_many_subjects';
  end if;
  if v_n <> (select count(distinct x) from unnest(p_subject_ids) x) then
    raise exception 'trial: duplicate subject' using errcode = 'check_violation',
      hint = 'bad_subject';
  end if;

  -- Every chosen subject must be a real, actively priced subject. A subject
  -- nobody can buy afterwards is not a trial, it is a dead end.
  if exists (
    select 1 from unnest(p_subject_ids) x
    where not exists (
      select 1 from public.subjects s
      join public.subjects_pricing sp on sp.subject_id = s.id and sp.status = 'active'
      where s.id = x
    )
  ) then
    raise exception 'trial: unknown or unpriced subject'
      using errcode = 'check_violation', hint = 'bad_subject';
  end if;

  -- DO NOT BURN THE ONE TRIAL ON A CHILD WHO ALREADY HAS EVERYTHING FREE.
  if public.is_giveaway_active()
     or public.is_free_access_active_for_student(p_student) then
    raise exception 'trial: access is already free'
      using errcode = 'check_violation', hint = 'already_free';
  end if;

  if exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = any(p_subject_ids)
      and e.source <> 'trial'
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then
    raise exception 'trial: already covered'
      using errcode = 'check_violation', hint = 'already_covered';
  end if;

  -- MIGRATION 183 — ONE LEDGER PER PARENT EMAIL, SURVIVING ACCOUNT DELETION.
  -- free_trials is once per CHILD and cascades away with the account, so
  -- "delete the account, register again with the same email, add the child
  -- again" used to mint a fresh trial. The ledger is keyed on a HASH of the
  -- normalised email (no readable address is kept), is not cascaded, and caps
  -- how many child trials one email can ever receive (system setting
  -- trial.max_per_email, default 3). The advisory lock serialises two
  -- simultaneous activations for the same email so both cannot pass the cap.
  select public.trial_email_key(p.email::text) into v_email_key
    from public.profiles p where p.id = p_parent;
  if v_email_key is not null then
    perform pg_advisory_xact_lock(hashtext('trial_email:' || v_email_key));
    v_cap := public.trial_setting_int('trial.max_per_email', 3, 0, 50);
    if (select count(*) from public.trial_email_ledger l where l.email_key = v_email_key) >= v_cap then
      raise exception 'trial: limit reached for this account' using errcode = 'check_violation',
        hint = 'email_cap';
    end if;
  end if;

  v_ends := now() + make_interval(hours => c_hours);

  -- The unique constraint is the once-only enforcement, not this insert's
  -- success. Two tabs racing collapse onto one row.
  begin
    insert into public.free_trials
      (student_profile_id, owner_parent_profile_id, subject_ids, ends_at, locale)
    values (p_student, p_parent, p_subject_ids, v_ends, v_locale);
  exception when unique_violation then
    raise exception 'trial: already used' using errcode = 'unique_violation',
      hint = 'trial_already_used';
  end;

  if v_email_key is not null then
    insert into public.trial_email_ledger (email_key, student_profile_id)
    values (v_email_key, p_student);
  end if;

  -- NOTE the deliberate omissions: no child_subscription_id and no
  -- olympiad_purchase_id, which is what makes these rows invisible to
  -- entitlements_reconcile() -- it only reaps grants it can trace back to a
  -- subscription or a purchase. And assert_payments_enabled() is never called,
  -- so the trial still works while the payments kill switch is off, which is
  -- exactly the pre-launch period when a free trial is most wanted.
  foreach v_subj in array p_subject_ids loop
    perform public.entitlement_grant(
      p_student, 'subject', 'trial',
      'trial:' || p_student::text || ':' || v_subj::text,
      p_subject_id => v_subj,
      p_starts_at  => now(),
      p_ends_at    => v_ends,
      p_granted_by => p_parent,
      p_note       => 'free_trial');
  end loop;

  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (p_parent, 'free_trial.activate', 'free_trials', p_student,
     jsonb_build_object('subjects', cardinality(p_subject_ids), 'ends_at', v_ends),
     'info', true);

  return jsonb_build_object('ends_at', v_ends, 'subject_ids', p_subject_ids);
end;
$function$;

-- ---------------------------------------------------------------- extensions
create table if not exists public.free_trial_extensions (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.students(profile_id) on delete cascade,
  granted_by         uuid references public.profiles(id) on delete set null,
  hours              int not null check (hours between 1 and 168),
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz not null,
  note               text check (note is null or char_length(note) <= 300),
  created_at         timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists ix_free_trial_extensions_student on public.free_trial_extensions (student_profile_id);
alter table public.free_trial_extensions enable row level security;

create or replace function public.grant_free_trial_extension(p_student uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_trial public.free_trials;
  v_hours int;
  v_max   int;
  v_used  int;
  v_ends  timestamptz;
  v_ext   uuid;
  v_subj  uuid;
begin
  -- Administrators only. An extension is a decision someone takes, not a
  -- button a parent can press.
  if v_me is null or not public.is_admin() then
    raise exception 'trial extension: not allowed' using errcode = 'insufficient_privilege', hint = 'not_admin';
  end if;

  select * into v_trial from public.free_trials
   where student_profile_id = p_student and cancelled_at is null;
  if not found then
    raise exception 'trial extension: no trial' using errcode = 'check_violation', hint = 'no_trial';
  end if;

  -- Only AFTER every trial window has ended: an extension extends nothing that
  -- is still running.
  if v_trial.ends_at > now()
     or exists (select 1 from public.free_trial_extensions e
                 where e.student_profile_id = p_student and e.ends_at > now()) then
    raise exception 'trial extension: trial still active' using errcode = 'check_violation', hint = 'still_active';
  end if;

  v_max  := public.trial_setting_int('trial.max_extensions', 1, 0, 10);
  select count(*) into v_used from public.free_trial_extensions where student_profile_id = p_student;
  if v_used >= v_max then
    raise exception 'trial extension: limit reached' using errcode = 'check_violation', hint = 'extension_limit';
  end if;

  v_hours := public.trial_setting_int('trial.extension_hours', 24, 1, 168);
  v_ends  := now() + make_interval(hours => v_hours);

  insert into public.free_trial_extensions (student_profile_id, granted_by, hours, ends_at, note)
  values (p_student, v_me, v_hours, v_ends, nullif(left(coalesce(p_note, ''), 300), ''))
  returning id into v_ext;

  -- The SAME subjects, through new trial entitlements. No subscription, no
  -- payment, no checkout: nothing here can lead to a charge.
  foreach v_subj in array v_trial.subject_ids loop
    perform public.entitlement_grant(
      p_student, 'subject', 'trial',
      'trial-ext:' || v_ext::text || ':' || v_subj::text,
      p_subject_id => v_subj,
      p_starts_at  => now(),
      p_ends_at    => v_ends,
      p_granted_by => v_me,
      p_note       => 'free_trial_extension');
  end loop;

  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_me, 'free_trial.extend', 'free_trial_extensions', p_student,
     jsonb_build_object('hours', v_hours, 'ends_at', v_ends), 'warning', true);

  return jsonb_build_object('ends_at', v_ends, 'hours', v_hours);
end;
$$;

-- ---------------------------------------------------------------- reading (server clock)
create or replace function public.child_free_trial(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := public.current_profile_id();
  v_row  public.free_trials;
  v_ext  public.free_trial_extensions;
  v_ends timestamptz;
begin
  if v_me is null or p_student is null then
    return jsonb_build_object('active', false, 'server_now', now());
  end if;

  -- Unchanged access rule: the child, a linked parent, the creating parent,
  -- or staff.
  if not (
    p_student = v_me
    or public.is_parent_linked_to_student(p_student)
    or exists (select 1 from public.students s
               where s.profile_id = p_student
                 and s.created_by_parent_profile_id = v_me)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  ) then
    return jsonb_build_object('active', false, 'server_now', now());
  end if;

  select * into v_row from public.free_trials
   where student_profile_id = p_student and cancelled_at is null;
  if not found then
    return jsonb_build_object('active', false, 'used', false, 'server_now', now());
  end if;

  select * into v_ext from public.free_trial_extensions e
   where e.student_profile_id = p_student
   order by e.ends_at desc limit 1;

  -- The window the child actually has: the later of the trial and the latest
  -- extension. "ends_at" keeps its meaning for every existing reader.
  v_ends := greatest(v_row.ends_at, coalesce(v_ext.ends_at, v_row.ends_at));

  return jsonb_build_object(
    'active',           v_ends > now(),
    'used',             true,
    'ends_at',          v_ends,
    'trial_ends_at',    v_row.ends_at,
    'activated_at',     v_row.activated_at,
    'extended',         v_ext.id is not null,
    'extension_active', coalesce(v_ext.ends_at > now(), false),
    'server_now',       now(),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
                       order by s.name)
      from public.subjects s where s.id = any(v_row.subject_ids)), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.trial_email_key(text) from public, anon, authenticated;
revoke all on function public.trial_setting_int(text, int, int, int) from public, anon, authenticated;
revoke all on function public.grant_free_trial_extension(uuid, text) from public, anon;
grant execute on function public.grant_free_trial_extension(uuid, text) to authenticated, service_role;
revoke all on table public.trial_email_ledger from anon, authenticated;
revoke all on table public.free_trial_extensions from anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
begin
  if position('trial_email_ledger' in (select prosrc from pg_proc where oid = 'public.activate_free_trial(uuid,uuid,uuid[],text)'::regprocedure)) = 0 then
    raise exception '183: activate_free_trial does not record the email ledger';
  end if;
  if position('server_now' in (select prosrc from pg_proc where oid = 'public.child_free_trial(uuid)'::regprocedure)) = 0 then
    raise exception '183: child_free_trial does not return server_now';
  end if;
end;
$$;
