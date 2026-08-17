-- =============================================================================
-- 2026_08_16_116_bug_reports.sql
-- =============================================================================
-- Migration: 2026_08_16_116_bug_reports.sql
-- Purpose: (A) "Report a bug" — a PLATFORM-scoped defect report filed from the
--          contact/help area of the web app and the mobile app, with the
--          administrator worklist that triages it. This is NOT the migration-115
--          feature: question_reports says "this question is wrong" and is bound
--          to one question row; bug_reports says "this page/flow is broken" and
--          carries title, description, repro steps, expected vs actual, route,
--          user agent, locale, platform and a severity claim.
--          (B) The contact settings the public contact page reads. Migration 019
--          seeded contact.support_email as '""', which is the ONLY reason the
--          placeholder fallback in web-app ContactInfo.tsx is what visitors see;
--          a second general-purpose address is added beside it.
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 001_extensions_and_enums.sql — bug_report_status,
--                                           bug_report_priority,
--                                           report_reporter_role;
--          * 008_notifications_support_audit.sql — the table (question_reports
--                                           is its structural sibling; unlike it,
--                                           bug_reports references only
--                                           public.profiles, which 002 creates,
--                                           so it needs no deferred FK);
--          * 010_rls_policies.sql — enable-RLS array + the three policies;
--          * 011_indexes_constraints_functions_triggers.sql — indexes,
--                                           trg_set_updated_at registration,
--                                           both trigger functions,
--                                           submit_bug_report(), grants, and the
--                                           get_mobile_config() contact object;
--          * 012_seed_initial_data.sql — contact.info_email + the real
--                                           contact.support_email literal;
--          * 013_validation_queries.sql — new check 104.
-- Backport status: pending
-- Destructive change: no. Creates three enums, one table, seven indexes, two
--          trigger functions and one RPC; inserts one setting and repairs one
--          BLANK setting. It drops no data. The single existing object it
--          rewrites is get_mobile_config(), and only to add one key.
-- Rollback notes: drop table public.bug_reports cascade;
--          drop function public.submit_bug_report(
--            text,text,text,text,text,text,text,text,text,text,text,text);
--          drop function public.bug_report_derive();
--          drop function public.bug_report_freeze();
--          drop type public.bug_report_status;
--          drop type public.bug_report_priority;
--          drop type public.report_reporter_role;
--          delete from public.system_settings where key = 'contact.info_email';
--          get_mobile_config() reverts by re-running 011's definition.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves nothing half-created. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild — the rebuild proof runs
-- the canonical 0NN files only, and is staging-only regardless.
--
-- THE SHAPE OF THE TRUST BOUNDARY, because it is the whole design:
-- the client sends prose plus four diagnostic hints. WHO reported, WHICH role
-- they hold, WHICH email reaches them, the status, the priority and both
-- timestamps are derived by a BEFORE INSERT trigger. That is what makes the
-- reporter-can-INSERT policy safe: WITH CHECK is evaluated AFTER BEFORE
-- triggers, so a hand-rolled PostgREST insert with a forged reporter,
-- reporter_role or status produces exactly the row the RPC would have produced
-- — throttle included.
--
-- ANONYMOUS REPORTS: the public contact page may file without an account,
-- because "I cannot register" and "the login page is blank" are reports only a
-- signed-out visitor can make, and requiring sign-in filters exactly that class
-- out by construction. There is nevertheless NO anonymous database surface:
-- `anon` holds no privilege on this table and no EXECUTE on the RPC, and no
-- policy names it. The only unauthenticated writer is the web app's own server
-- action running as service_role, behind a honeypot and a per-IP throttle; the
-- 20/hour global cap below is what still bounds the damage if that app tier is
-- ever compromised or the key leaks.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A1. Enums (backport -> 001)
-- -----------------------------------------------------------------------------
-- Identical MEMBERS to question_report_status, deliberately a SEPARATE type.
-- Same vocabulary = the same admin mental model and one shared TypeScript
-- helper; a separate type = adding a bug-only member later cannot silently
-- widen the domain of public.question_reports.
do $$ begin
  create type public.bug_report_status as enum
    ('new', 'in_review', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- ONE type for BOTH priority-shaped columns (the admin's triage priority and
-- the reporter's severity claim), so the two can never drift apart in meaning.
do $$ begin
  create type public.bug_report_priority as enum
    ('low', 'normal', 'high', 'critical');
exception when duplicate_object then null; end $$;

-- Who filed it, DERIVED from profile_roles — never a client string. 'unknown'
-- is the honest label for a signed-in profile carrying no role row (should be
-- impossible; recorded rather than silently mislabelled as a student).
do $$ begin
  create type public.report_reporter_role as enum
    ('anonymous', 'student', 'parent', 'content_manager', 'administrator', 'unknown');
exception when duplicate_object then null; end $$;

-- public.report_platform ('web','android','ios') and public.content_locale
-- ('az','ru','en') are REUSED from 001 — a bug report is the same kind of
-- client-declared diagnostic as a question report, and a second copy of either
-- vocabulary would be a drift waiting to happen.

-- -----------------------------------------------------------------------------
-- A2. bug_reports (backport -> 008)
-- -----------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id                      uuid primary key default gen_random_uuid(),

  -- ---- what the reporter wrote (frozen after insert) ----------------------
  title                   text not null,
  description             text not null,
  steps_to_reproduce      text,
  expected_behavior       text,
  actual_behavior         text,
  -- The reporter's SEVERITY CLAIM. Deliberately NOT named `priority`: a
  -- reporter-set priority makes the admin worklist sort useless within a week
  -- (everything becomes 'critical'). This is evidence; `priority` below is
  -- triage, and only an administrator moves it.
  reported_severity       public.bug_report_priority not null default 'normal',

  -- ---- who (all derived server-side; never from the payload) --------------
  -- set null, not cascade (support_requests / question_reports precedent):
  -- deleting an account must not erase a still-valid bug report.
  reporter_profile_id     uuid references public.profiles (id) on delete set null,
  reporter_role           public.report_reporter_role not null default 'anonymous',
  reporter_email          citext,
  -- true  = copied from profiles.email for a resolved session (trustworthy)
  -- false = typed into the public form by an unauthenticated visitor
  reporter_email_verified boolean not null default false,

  -- ---- environment (client-declared diagnostics, never authorization) -----
  -- PATH ONLY. The query string and the fragment are stripped before this
  -- column is written: /auth/callback?code=... and #access_token=... are
  -- exactly where credentials live, and a bug report must never capture one.
  route_path              text,
  user_agent              text,
  locale                  public.content_locale not null,
  platform                public.report_platform not null,
  app_version             text,

  -- ---- triage (the ONLY mutable columns) ----------------------------------
  status                  public.bug_report_status   not null default 'new',
  priority                public.bug_report_priority not null default 'normal',
  admin_note              text,
  handled_by              uuid references public.profiles (id) on delete set null,
  handled_at              timestamptz,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Dedupe key for the open-report unique index below. md5/lower/btrim are all
  -- IMMUTABLE, so this is a legal STORED generated column. Generated columns
  -- are computed AFTER BEFORE triggers, so it hashes the trimmed text the
  -- derive trigger actually stored.
  content_hash text generated always as
    (md5(lower(btrim(title)) || '|' || lower(btrim(description)))) stored,

  constraint chk_bug_reports_title
    check (char_length(title) between 3 and 160),
  constraint chk_bug_reports_description
    check (char_length(description) between 10 and 4000),
  constraint chk_bug_reports_steps
    check (steps_to_reproduce is null or char_length(steps_to_reproduce) <= 2000),
  constraint chk_bug_reports_expected
    check (expected_behavior is null or char_length(expected_behavior) <= 1000),
  constraint chk_bug_reports_actual
    check (actual_behavior is null or char_length(actual_behavior) <= 1000),
  constraint chk_bug_reports_admin_note
    check (admin_note is null or char_length(admin_note) <= 2000),
  -- A root-relative path with no whitespace and no control bytes. The app-tier
  -- gate is isSafeRelativeUrl(); this is the LAST word, so a direct insert that
  -- never passed through the app is bound by the same rule.
  constraint chk_bug_reports_route
    check (route_path is null or route_path ~ '^/[^[:space:][:cntrl:]]{0,499}$'),
  constraint chk_bug_reports_user_agent
    check (user_agent is null or char_length(user_agent) <= 300),
  constraint chk_bug_reports_app_version
    check (app_version is null or app_version ~ '^[0-9A-Za-z._+-]{1,32}$'),
  constraint chk_bug_reports_email
    check (reporter_email is null
           or (char_length(reporter_email) <= 254
               and reporter_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
);

-- DELIBERATELY ABSENT: any CHECK coupling reporter_role / reporter_email_verified
-- to reporter_profile_id. The FK is ON DELETE SET NULL, so deleting a parent
-- (migration 098 cascades to their children) issues an UPDATE that nulls the
-- column while the role stays 'parent' — a cross-column CHECK would make that
-- DELETE fail and BLOCK ACCOUNT DELETION. The rule is enforced in the BEFORE
-- INSERT trigger instead, where it is true at write time and cannot fight a
-- referential action.

comment on table public.bug_reports is
  'Platform-scoped defect reports filed from the contact/help area (web + '
  'mobile). Distinct from question_reports, which is bound to one question. '
  'Reporter, role, contact email, status, priority and both stamps are derived '
  'server-side by trg_bug_report_derive; the client supplies prose plus four '
  'enum-constrained or shape-checked diagnostics.';

comment on column public.bug_reports.route_path is
  'PATH ONLY — the query string and the fragment are stripped by '
  'trg_bug_report_derive BEFORE the row is written. /auth/callback?code=... and '
  '#access_token=... are exactly the shapes that would turn a bug report into a '
  'credential leak. Rendered as TEXT in the admin panel, never as a link.';

comment on column public.bug_reports.user_agent is
  'Read server-side from the request header, never a form field — but still '
  'attacker-controlled: any client may send any string. Control characters are '
  'flattened to spaces and the value is capped at 300 chars.';

comment on column public.bug_reports.locale is
  'CLIENT-SUPPLIED diagnostic: the UI language the reporter was reading. The '
  'database cannot observe it. Enum-constrained, never an authorization input. '
  'The web server action hardcodes it from its own getLocale() cookie '
  'resolution; a mobile client self-reports.';

comment on column public.bug_reports.platform is
  'CLIENT-SUPPLIED diagnostic (see locale). A tampered client could claim the '
  'wrong platform; the consequence is a mislabelled admin row, nothing more.';

comment on column public.bug_reports.reported_severity is
  'The REPORTER''s severity claim, frozen after insert. Never the triage value: '
  'a reporter-set priority makes the admin worklist sort useless within a week. '
  'public.bug_reports.priority is the administrator''s, and starts at normal.';

comment on column public.bug_reports.reporter_email_verified is
  'true = copied from profiles.email for a resolved session; false = typed into '
  'the public form by an unauthenticated visitor. The admin detail view labels '
  'the address "unverified" on false — it is a contact hint, never an identity.';

-- -----------------------------------------------------------------------------
-- A3. Indexes + updated_at (backport -> 011)
-- -----------------------------------------------------------------------------
create index if not exists idx_bug_reports_status_created
  on public.bug_reports (status, created_at desc);
create index if not exists idx_bug_reports_priority_created
  on public.bug_reports (priority, created_at desc);
create index if not exists idx_bug_reports_created
  on public.bug_reports (created_at desc);
create index if not exists idx_bug_reports_role_created
  on public.bug_reports (reporter_role, created_at desc);
-- Also covers the per-reporter throttle count in the derive trigger.
create index if not exists idx_bug_reports_reporter
  on public.bug_reports (reporter_profile_id, created_at desc);
-- Covers the ANONYMOUS blast-radius count in the derive trigger.
create index if not exists idx_bug_reports_anon_created
  on public.bug_reports (created_at desc) where reporter_profile_id is null;

-- ONE OPEN report per (reporter, identical title+description): the real
-- double-submit / rage-click guard. Closing it frees the slot, so a genuinely
-- recurring bug can be re-filed. Scoped to authenticated reporters exactly like
-- uq_question_reports_open_per_reporter — two different anonymous visitors
-- hitting the same bug must both get through.
create unique index if not exists uq_bug_reports_open_per_reporter
  on public.bug_reports (reporter_profile_id, content_hash)
  where reporter_profile_id is not null and status in ('new','in_review');

-- updated_at maintenance (the canonical file adds 'bug_reports' to the
-- set_updated_at array instead; here the one trigger is created directly).
drop trigger if exists trg_set_updated_at on public.bug_reports;
create trigger trg_set_updated_at before update on public.bug_reports
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- A4. BEFORE INSERT — the single authority for every derived column + throttle
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because it must read profile_roles and profiles for the
-- caller and count rows the reporter's own SELECT policy hides once closed.
-- search_path is pinned; check 104 asserts anon holds no EXECUTE.
create or replace function public.bug_report_derive()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_role    public.report_reporter_role;
  v_email   citext;
  v_ws      text := ' ' || chr(9) || chr(10) || chr(13);
  v_hour    int;
  v_day     int;
  v_anon    int;
begin
  -- The reporter is WHOEVER IS CALLING, never what the payload claims. The
  -- INSERT policy re-compares this same value, so a forged reporter_profile_id
  -- is overwritten here and then fails nothing — it simply never existed.
  new.reporter_profile_id := v_profile;

  if v_profile is null then
    -- Anonymous. Only reachable through the service-role client in the web
    -- server action: anon holds no grant on this table and none on the RPC.
    new.reporter_role           := 'anonymous';
    new.reporter_email          :=
      nullif(btrim(coalesce(new.reporter_email::text, ''), v_ws), '')::citext;
    new.reporter_email_verified := false;
  else
    -- Most privileged role wins, so a staff member filing from their own
    -- account is labelled as staff rather than as whatever else they hold.
    select case
             when bool_or(r.code = 'administrator')   then 'administrator'
             when bool_or(r.code = 'content_manager') then 'content_manager'
             when bool_or(r.code = 'parent')          then 'parent'
             when bool_or(r.code = 'student')         then 'student'
           end::public.report_reporter_role
      into v_role
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
     where pr.profile_id = v_profile;
    new.reporter_role := coalesce(v_role, 'unknown');
    -- A signed-in reporter's contact address is the ACCOUNT's, never the
    -- form's: otherwise a child could put a stranger's address on a report.
    select p.email into v_email from public.profiles p where p.id = v_profile;
    new.reporter_email          := v_email;
    new.reporter_email_verified := v_email is not null;
  end if;

  -- Server-owned lifecycle: born 'new' at 'normal', unhandled, unnoted.
  new.status      := 'new';
  new.priority    := 'normal';
  new.handled_by  := null;
  new.handled_at  := null;
  new.resolved_at := null;
  new.admin_note  := null;
  new.created_at  := now();
  new.updated_at  := now();

  new.title              := btrim(new.title, v_ws);
  new.description        := btrim(new.description, v_ws);
  new.steps_to_reproduce := nullif(btrim(coalesce(new.steps_to_reproduce, ''), v_ws), '');
  new.expected_behavior  := nullif(btrim(coalesce(new.expected_behavior,  ''), v_ws), '');
  new.actual_behavior    := nullif(btrim(coalesce(new.actual_behavior,    ''), v_ws), '');

  -- Route: PATH ONLY. split_part drops the query string and then the fragment
  -- before anything is stored. A value that is not root-relative afterwards is
  -- DROPPED, not rejected: the context is worth less than the report.
  new.route_path := nullif(regexp_replace(
                       split_part(split_part(coalesce(new.route_path, ''), '?', 1), '#', 1),
                       '[[:cntrl:][:space:]]', '', 'g'), '');
  if new.route_path is not null and left(new.route_path, 1) <> '/' then
    new.route_path := null;
  end if;
  new.route_path := left(new.route_path, 500);
  new.user_agent := nullif(left(regexp_replace(coalesce(new.user_agent, ''),
                                               '[[:cntrl:]]', ' ', 'g'), 300), '');

  -- Throttle in the DATABASE. The same numbers as question_report_derive, so
  -- the two report features cannot drift into different abuse budgets. One
  -- indexed count per insert (idx_bug_reports_reporter); a plain SELECT over a
  -- different row set, so there is no trigger recursion.
  if new.reporter_profile_id is not null then
    select count(*) filter (where created_at > now() - interval '1 hour'),
           count(*) filter (where created_at > now() - interval '1 day')
      into v_hour, v_day
      from public.bug_reports
     where reporter_profile_id = new.reporter_profile_id
       and created_at > now() - interval '1 day';
    if v_hour >= 5 or v_day >= 20 then
      raise exception 'bug report: rate limited' using errcode = 'check_violation';
    end if;
  else
    -- An anonymous row carries NOTHING to key a per-reporter limit on, and this
    -- repo deliberately stores no IP addresses. The per-IP limit therefore
    -- lives in the web tier (rateLimitAllow); THIS is the blast-radius cap that
    -- survives a compromised app tier or a leaked service key.
    select count(*) into v_anon
      from public.bug_reports
     where reporter_profile_id is null
       and created_at > now() - interval '1 hour';
    if v_anon >= 20 then
      raise exception 'bug report: rate limited' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.bug_report_derive() is
  'BEFORE INSERT on bug_reports: derives reporter, role, contact email, status, '
  'priority and both stamps server-side, strips the query string and fragment '
  'from route_path (credential hygiene), and enforces the authoritative rate '
  'limit (5/hour + 20/day per reporter; 20/hour globally for anonymous rows). '
  'Every write path passes through it, RPC and direct insert alike.';

drop trigger if exists trg_bug_report_derive on public.bug_reports;
create trigger trg_bug_report_derive
  before insert on public.bug_reports
  for each row execute function public.bug_report_derive();

-- -----------------------------------------------------------------------------
-- A5. BEFORE UPDATE — the report is evidence; an admin may only triage it
-- -----------------------------------------------------------------------------
create or replace function public.bug_report_freeze()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.title                   := old.title;
  new.description             := old.description;
  new.steps_to_reproduce      := old.steps_to_reproduce;
  new.expected_behavior       := old.expected_behavior;
  new.actual_behavior         := old.actual_behavior;
  new.reported_severity       := old.reported_severity;
  new.reporter_role           := old.reporter_role;
  new.reporter_email          := old.reporter_email;
  new.reporter_email_verified := old.reporter_email_verified;
  new.route_path              := old.route_path;
  new.user_agent              := old.user_agent;
  new.locale                  := old.locale;
  new.platform                := old.platform;
  new.app_version             := old.app_version;
  new.created_at              := old.created_at;

  -- reporter_profile_id is NOT frozen unconditionally. The FK's ON DELETE SET
  -- NULL is itself an UPDATE: writing the old id back would leave a dangling
  -- reference, because PostgreSQL skips the referential re-check when the key
  -- value does not change. The ONLY legitimate change is null-ing a profile
  -- that no longer exists. (The shipped question_report_freeze does restore it
  -- unconditionally and therefore has this hole; it is a separate fix.)
  if new.reporter_profile_id is distinct from old.reporter_profile_id
     and not (new.reporter_profile_id is null
              and not exists (select 1 from public.profiles p
                               where p.id = old.reporter_profile_id)) then
    new.reporter_profile_id := old.reporter_profile_id;
  end if;

  -- handled_by is server-stamped, with the same referential carve-out.
  if new.status is not distinct from old.status
     and new.priority is not distinct from old.priority then
    if new.handled_by is distinct from old.handled_by
       and not (new.handled_by is null and old.handled_by is not null
                and not exists (select 1 from public.profiles p
                                 where p.id = old.handled_by)) then
      new.handled_by := old.handled_by;
      new.handled_at := old.handled_at;
    end if;
  else
    new.handled_by := public.current_profile_id();
    new.handled_at := now();
  end if;

  -- resolved_at is DERIVED, never a client value: stamped on the move into a
  -- closed state, cleared on reopen, untouched by a note or a priority edit.
  if new.status is distinct from old.status then
    new.resolved_at := case when new.status in ('resolved','dismissed')
                            then now() else null end;
  else
    new.resolved_at := old.resolved_at;
  end if;

  return new;
end;
$$;

comment on function public.bug_report_freeze() is
  'BEFORE UPDATE on bug_reports: only status, priority and admin_note may '
  'change; a status or priority move stamps handled_by/handled_at and derives '
  'resolved_at. A resolved report can never be a rewritten one.';

drop trigger if exists trg_bug_report_freeze on public.bug_reports;
create trigger trg_bug_report_freeze
  before update on public.bug_reports
  for each row execute function public.bug_report_freeze();
-- Name ordering matters: PostgreSQL fires BEFORE triggers alphabetically, and
-- trg_bug_report_freeze sorts before trg_set_updated_at, so the freeze runs
-- first and updated_at is still stamped afterwards.

-- -----------------------------------------------------------------------------
-- A6. submit_bug_report — the one app entry point (backport -> 011)
-- -----------------------------------------------------------------------------
create or replace function public.submit_bug_report(
  p_title         text,
  p_description   text,
  p_steps         text,
  p_expected      text,
  p_actual        text,
  p_severity      text,
  p_route_path    text,
  p_user_agent    text,
  p_locale        text,
  p_platform      text,
  p_app_version   text default null,
  p_contact_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ws    text := ' ' || chr(9) || chr(10) || chr(13);
  -- Populated by RETURNING below, after the BEFORE INSERT trigger derived them.
  v_role     public.report_reporter_role;
  v_email    citext;
  v_verified boolean;
  v_route    text;
  v_ua       text;
  v_title text := btrim(coalesce(p_title, ''), v_ws);
  v_desc  text := btrim(coalesce(p_description, ''), v_ws);
  v_id    uuid;
begin
  -- NO `if current_profile_id() is null then raise 'forbidden'` here, unlike
  -- submit_question_report — anonymous reports from the public contact page are
  -- a deliberate product decision (see the file header). Its place is taken by
  -- the GRANTS: anon holds no EXECUTE on this function and no privilege on the
  -- table, so the only unauthenticated caller is our own throttled server
  -- action running as service_role.
  if char_length(v_title) < 3 or char_length(v_title) > 160 then
    raise exception 'bug report: bad title' using errcode = 'check_violation';
  end if;
  if char_length(v_desc) < 10 or char_length(v_desc) > 4000 then
    raise exception 'bug report: bad description' using errcode = 'check_violation';
  end if;
  -- Capped HERE as well as in the column CHECKs: a 2 MB body is refused before
  -- it is written, not silently truncated.
  if char_length(coalesce(p_steps, '')) > 2000
     or char_length(coalesce(p_expected, '')) > 1000
     or char_length(coalesce(p_actual, '')) > 1000 then
    raise exception 'bug report: field too long' using errcode = 'check_violation';
  end if;
  if p_locale is null or p_locale not in ('az','en','ru') then
    raise exception 'bug report: bad locale' using errcode = 'check_violation';
  end if;
  if p_platform is null or p_platform not in ('web','android','ios') then
    raise exception 'bug report: bad platform' using errcode = 'check_violation';
  end if;
  if coalesce(p_severity, 'normal') not in ('low','normal','high','critical') then
    raise exception 'bug report: bad severity' using errcode = 'check_violation';
  end if;

  insert into public.bug_reports
    (title, description, steps_to_reproduce, expected_behavior, actual_behavior,
     reported_severity, route_path, user_agent, locale, platform, app_version,
     reporter_email)
  values
    (v_title, v_desc,
     nullif(btrim(coalesce(p_steps,    ''), v_ws), ''),
     nullif(btrim(coalesce(p_expected, ''), v_ws), ''),
     nullif(btrim(coalesce(p_actual,   ''), v_ws), ''),
     coalesce(p_severity, 'normal')::public.bug_report_priority,
     nullif(btrim(coalesce(p_route_path,  ''), v_ws), ''),
     nullif(btrim(coalesce(p_user_agent,  ''), v_ws), ''),
     p_locale::public.content_locale,
     p_platform::public.report_platform,
     nullif(btrim(coalesce(p_app_version, ''), v_ws), ''),
     nullif(btrim(coalesce(p_contact_email, ''), v_ws), '')::citext)
  returning id, reporter_role, reporter_email, reporter_email_verified,
            route_path, user_agent
    into v_id, v_role, v_email, v_verified, v_route, v_ua;

  -- The DERIVED values travel back with the id so the caller never has to read
  -- the row again. The trigger has already overwritten reporter/role/email by
  -- the time RETURNING evaluates, so these are exactly what an admin will see.
  return jsonb_build_object(
    'id',                      v_id,
    'reporter_role',           v_role,
    'reporter_email',          v_email,
    'reporter_email_verified', v_verified,
    'route_path',              v_route,
    'user_agent',              v_ua);
end;
$$;

comment on function public.submit_bug_report(
  text,text,text,text,text,text,text,text,text,text,text,text) is
  'Files one platform bug report for the CALLING profile, or anonymously when '
  'invoked by the service role. Validates every field; reporter, role, contact '
  'email, status, priority and the stamps are derived by trg_bug_report_derive, '
  'which also enforces the rate limit — so a direct insert is exactly as '
  'constrained. Returns the id so the caller can build the admin deep link.';

-- -----------------------------------------------------------------------------
-- A7. RLS + policies (backport -> 010)
-- -----------------------------------------------------------------------------
alter table public.bug_reports enable row level security;

-- An admin reads everything; a reporter reads only their own. The `is not null`
-- guard is load-bearing: after an account is deleted the column goes NULL, and
-- it keeps a future coalesce() refactor from opening orphaned rows to everyone.
-- There is NO anon SELECT: a public reader would turn this table into a
-- scrapeable list of every known defect in the platform.
drop policy if exists "bugreports_select" on public.bug_reports;
-- ADMIN-ONLY, deliberately. A reporter branch here would ALSO expose
-- admin_note and handled_by on that row: the grant is table-wide and RLS is
-- row-level, so PostgREST lets the caller choose the columns. Column-level
-- privileges cannot rescue it either — an admin is an `authenticated` user
-- too, so narrowing the grant would blind the admin panel. Nothing
-- user-facing reads this table (the only app read is the notification
-- read-back, which runs service-role), so the reporter branch bought nothing
-- and leaked internal triage notes. If a "my reports" screen is ever wanted,
-- add a SECURITY DEFINER function returning only the safe columns — the
-- pattern this schema already uses everywhere else.
create policy "bugreports_select" on public.bug_reports for select to authenticated
  using (public.is_admin());

-- Safe even though the client picks the columns: WITH CHECK is evaluated AFTER
-- the BEFORE INSERT trigger has already overwritten reporter, role, email,
-- status, priority and both stamps. A forged payload produces exactly the row
-- the RPC would have produced, throttle included.
drop policy if exists "bugreports_insert" on public.bug_reports;
create policy "bugreports_insert" on public.bug_reports for insert to authenticated
  with check (reporter_profile_id = public.current_profile_id());

-- Admins only. The freeze trigger is what makes this narrow: an admin can move
-- status/priority and write a note, and nothing else.
drop policy if exists "bugreports_update" on public.bug_reports;
create policy "bugreports_update" on public.bug_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Deliberately NO delete policy (audit_logs / question_reports precedent):
-- service role only. Reports are operational history.
-- Deliberately NO policy for `anon` at all — see the grants.

-- -----------------------------------------------------------------------------
-- A8. Grants
-- -----------------------------------------------------------------------------
grant select, insert, update on public.bug_reports to authenticated;
grant all on public.bug_reports to service_role;
-- 010 grants DELETE on every table to `authenticated` and hands `anon` a
-- baseline too; take both back here so the absent DELETE policy is not the only
-- thing standing between a reporter and their own evidence. Note the divergence
-- from 115, which grants anon a (vestigial, policy-less) SELECT: bug_reports
-- grants anon nothing at all, and check 104 asserts it.
revoke all on public.bug_reports from anon;
revoke delete on public.bug_reports from anon, authenticated;

-- 010 line 88 runs `alter default privileges in schema public grant execute on
-- functions to anon, authenticated, service_role`, so EVERY new function is
-- EXECUTE-able by anon and authenticated unless explicitly taken back. This
-- exact hole has shipped twice in this repository; revoke first, then grant.
revoke all on function public.submit_bug_report(
  text,text,text,text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_bug_report(
  text,text,text,text,text,text,text,text,text,text,text,text)
  to authenticated, service_role;

-- Trigger functions are never called directly by anyone.
revoke all on function public.bug_report_derive() from public, anon, authenticated;
revoke all on function public.bug_report_freeze() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- B1. Contact settings (backport -> 012)
-- -----------------------------------------------------------------------------
-- A SECOND address beside the technical one: contact.support_email stays the
-- technical/support inbox, contact.info_email is the general one (questions,
-- suggestions, feedback). Both stay admin-editable — hardcoding either into
-- ContactInfo.tsx would regress a working admin-configurable feature.
insert into public.system_settings (key, value_json) values
  ('contact.info_email', '"info@olympiq.ai"'::jsonb)
on conflict (key) do nothing;

-- contact.support_email shipped as '""' (migration 019). That empty string is
-- the ONLY reason the placeholder fallback in ContactInfo.tsx is what visitors
-- actually see. 012's seed insert is `on conflict do nothing`, so changing the
-- literal there can never repair an already-seeded blank row — this UPDATE is
-- the load-bearing half. Guarded so an address an administrator already typed
-- is never clobbered.
update public.system_settings
   set value_json = '"support@olympiq.ai"'::jsonb
 where key = 'contact.support_email'
   and (value_json is null
        or jsonb_typeof(value_json) <> 'string'
        or btrim(value_json->>0) = '');

-- -----------------------------------------------------------------------------
-- B2. get_mobile_config() gains contact.info_email (backport -> 011)
-- -----------------------------------------------------------------------------
-- The mobile (public)/contact screen reads its whole card from this function's
-- `contact` object, so without this line mobile would be the one surface
-- structurally unable to ever show the general address. Recreated WHOLE (the
-- only way to change a function body) from 011's CURRENT definition — including
-- the privacy block added by migration 097 — with exactly one key added; a body
-- copied from an older migration would silently drop payment mode, maintenance
-- mode, the locale set, the version gate or privacy. The explicit revoke/grant
-- tail is restated because `create or replace` re-applies 010's default
-- privileges: this function is DELIBERATELY anon-callable public config, so
-- rule 6 is satisfied by naming the grant rather than by omitting it.
create or replace function public.get_mobile_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags        jsonb;
  v_real         boolean;
  v_demo         boolean;
  v_gvw_flag     boolean;
  v_gvw_days     int := 0;
  v_gvw_start    timestamptz;
  v_gvw_end      timestamptz;
  v_gvw_active   boolean := false;
  v_mode         text;
  v_maint_on     boolean := false;
  v_maint_msg    jsonb := jsonb_build_object('az','','en','','ru','');
  v_locales      jsonb := jsonb_build_array('az','en','ru');
  v_default_loc  text := 'az';
  v_setting      jsonb;
  v_version      jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments','demo_payments','giveaway_period','news_public',
                'olympiad_module','leaderboard','notifications',
                'notifications_push','launch_promo');
  v_flags    := coalesce(v_flags, '{}'::jsonb);
  -- Round 51 (migration 091): missing flag row = OFF for the money gate too
  -- (fail closed; matches current_payment_mode and the web resolver).
  v_real     := coalesce((v_flags->>'payments')::boolean, false);
  v_demo     := coalesce((v_flags->>'demo_payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags->>'giveaway_period')::boolean, false);

  select value_json into v_setting from public.system_settings where key = 'giveaway.duration_days';
  if v_setting is not null and jsonb_typeof(v_setting) = 'number' then
    v_gvw_days := greatest(0, floor((v_setting)::text::numeric)::int);
  end if;
  select value_json into v_setting from public.system_settings where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;
  if v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_end    := v_gvw_start + make_interval(days => v_gvw_days);
    v_gvw_active := now() < v_gvw_end;
  end if;
  v_mode := case
    when v_gvw_active then 'giveaway'
    when v_demo       then 'demo'
    when v_real       then 'real'
    else 'off'
  end;

  select value_json into v_setting from public.system_settings where key = 'platform.maintenance_mode';
  if v_setting is not null and jsonb_typeof(v_setting) = 'boolean' then
    v_maint_on := (v_setting)::text::boolean;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.maintenance_message';
  if v_setting is not null and jsonb_typeof(v_setting) = 'object' then
    v_maint_msg := jsonb_build_object(
      'az', coalesce(v_setting->>'az',''),
      'en', coalesce(v_setting->>'en',''),
      'ru', coalesce(v_setting->>'ru',''));
  end if;

  select value_json into v_setting from public.system_settings where key = 'platform.supported_locales';
  if v_setting is not null and jsonb_typeof(v_setting) = 'array' and jsonb_array_length(v_setting) > 0 then
    v_locales := v_setting;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.default_locale';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    v_default_loc := trim(v_setting->>0);
  end if;

  select jsonb_object_agg(platform, jsonb_build_object(
           'min',       min_version,
           'latest',    latest_version,
           'force',     force_update,
           'store_url', store_url,
           'message',   jsonb_build_object('az', message_az, 'en', message_en, 'ru', message_ru)))
    into v_version
  from public.mobile_app_versions;

  return jsonb_build_object(
    'payment', jsonb_build_object(
        'mode', v_mode,
        'giveaway_ends_at', case when v_gvw_active then to_jsonb(v_gvw_end) else 'null'::jsonb end),
    'flags', jsonb_build_object(
        'news_public',        coalesce((v_flags->>'news_public')::boolean, false),
        'olympiad_module',    coalesce((v_flags->>'olympiad_module')::boolean, false),
        'leaderboard',        coalesce((v_flags->>'leaderboard')::boolean, false),
        'notifications',      coalesce((v_flags->>'notifications')::boolean, false),
        'notifications_push', coalesce((v_flags->>'notifications_push')::boolean, false),
        'launch_promo',       coalesce((v_flags->>'launch_promo')::boolean, false)),
    'maintenance', jsonb_build_object('on', v_maint_on, 'message', v_maint_msg),
    'locales', jsonb_build_object('supported', v_locales, 'default', v_default_loc),
    'contact', jsonb_build_object(
        -- Migration 116: the GENERAL contact address (questions, suggestions,
        -- feedback), beside the TECHNICAL support one below. Empty = the app
        -- falls back to its own compiled-in constant.
        'info_email', coalesce((select value_json->>0 from public.system_settings where key='contact.info_email'), ''),
        'email',    coalesce((select value_json->>0 from public.system_settings where key='contact.support_email'), ''),
        'phone',    coalesce((select value_json->>0 from public.system_settings where key='contact.support_phone'), ''),
        -- Migration 070: admin-configured WhatsApp line (empty = hidden in UIs).
        'whatsapp', coalesce((select value_json->>0 from public.system_settings where key='contact.support_whatsapp'), ''),
        -- Migration 072: admin-editable support/office address (contact page).
        'address',  coalesce((select value_json->>0 from public.system_settings where key='contact.support_address'), ''),
        -- Migration 075: precise map query/coordinates (empty = derive from address).
        'map_query', coalesce((select value_json->>0 from public.system_settings where key='contact.support_map_query'), '')),
    'social', jsonb_build_object(
        'facebook',  coalesce((select value_json->>0 from public.system_settings where key='social.facebook'), ''),
        'instagram', coalesce((select value_json->>0 from public.system_settings where key='social.instagram'), ''),
        'youtube',   coalesce((select value_json->>0 from public.system_settings where key='social.youtube'), ''),
        'tiktok',    coalesce((select value_json->>0 from public.system_settings where key='social.tiktok'), '')),
    -- Migration 097: admin-owned privacy-policy metadata. The compiled-in
    -- constants in {web-app,mobile-app}/src/lib/privacyPolicy.ts stay as the
    -- FALLBACK so an offline phone still renders a coherent page; a non-empty
    -- value here wins.
    'privacy', jsonb_build_object(
        'effective_date',          coalesce((select value_json->>0 from public.system_settings where key='privacy.effective_date'), ''),
        'last_updated',            coalesce((select value_json->>0 from public.system_settings where key='privacy.last_updated'), ''),
        'website_url',             coalesce((select value_json->>0 from public.system_settings where key='privacy.website_url'), ''),
        'contact_email',           coalesce((select value_json->>0 from public.system_settings where key='privacy.contact_email'), ''),
        'hosting_region',          coalesce((select value_json->>0 from public.system_settings where key='privacy.hosting_region'), ''),
        'server_log_retention',    coalesce((select value_json->>0 from public.system_settings where key='privacy.server_log_retention'), ''),
        'learning_data_retention', coalesce((select value_json->>0 from public.system_settings where key='privacy.learning_data_retention'), ''),
        'backup_retention',        coalesce((select value_json->>0 from public.system_settings where key='privacy.backup_retention'), ''),
        -- DERIVED, never stored: both already have exactly one canonical switch
        -- in this database, and a second free-typed admin copy could only ever
        -- contradict it. 'real' only — demo/giveaway move no money and touch no
        -- card data, so §8 must keep describing payments in the future tense.
        'push_live',               coalesce((v_flags->>'notifications_push')::boolean, false),
        'payments_live',           (v_mode = 'real')),
    'version', coalesce(v_version, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

-- =============================================================================
-- Verify
-- =============================================================================
do $verify$
declare
  v_derive text;
  v_freeze text;
  v_info   text;
  v_supp   text;
  v_sig    text := 'public.submit_bug_report('
                || 'text,text,text,text,text,text,text,text,text,text,text,text)';
begin
  if to_regclass('public.bug_reports') is null then
    raise exception '116: bug_reports is missing';
  end if;
  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'bug_reports'
       and c.relrowsecurity) then
    raise exception '116: RLS is not enabled on bug_reports';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'bug_reports') <> 3 then
    raise exception '116: expected exactly 3 policies on bug_reports';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'bug_reports'
         and policyname in
             ('bugreports_select','bugreports_insert','bugreports_update')) <> 3 then
    raise exception '116: the bug_reports policies are not the expected three';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'bug_reports'
                and cmd = 'DELETE') then
    raise exception '116: a DELETE policy exists — reports must not be erasable';
  end if;
  if has_table_privilege('authenticated', 'public.bug_reports', 'DELETE') then
    raise exception '116: authenticated can still DELETE bug_reports';
  end if;
  -- anon must hold NOTHING on this table: there is no anon policy, and a
  -- surviving grant would be the one thing between a scraper and every known
  -- defect in the platform if a policy is ever added carelessly.
  if has_table_privilege('anon', 'public.bug_reports', 'SELECT')
     or has_table_privilege('anon', 'public.bug_reports', 'INSERT')
     or has_table_privilege('anon', 'public.bug_reports', 'UPDATE')
     or has_table_privilege('anon', 'public.bug_reports', 'DELETE') then
    raise exception '116: anon still holds a privilege on bug_reports';
  end if;

  -- The partial predicate IS the duplicate rule: without it the index would
  -- block a re-report forever, even after the first was resolved.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'uq_bug_reports_open_per_reporter'
       and indexdef like '%in_review%') then
    raise exception '116: the open-report unique index is missing or unscoped';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.bug_reports'::regclass
                    and tgname = 'trg_bug_report_derive') then
    raise exception '116: the derive trigger is not attached';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.bug_reports'::regclass
                    and tgname = 'trg_bug_report_freeze') then
    raise exception '116: the freeze trigger is not attached';
  end if;

  v_derive := pg_get_functiondef('public.bug_report_derive()'::regprocedure);
  v_freeze := pg_get_functiondef('public.bug_report_freeze()'::regprocedure);
  if position('current_profile_id(' in v_derive) = 0 then
    raise exception '116: the derive trigger no longer resolves the caller';
  end if;
  if position('rate limited' in v_derive) = 0 then
    raise exception '116: the rate limit was removed from the derive trigger';
  end if;
  -- The credential-stripping line is the invariant most likely to be
  -- "simplified" away by a later editor who reads it as cosmetic.
  if position('split_part' in v_derive) = 0 then
    raise exception '116: route_path no longer has its query/fragment stripped';
  end if;
  if position('old.description' in v_freeze) = 0 then
    raise exception '116: the freeze trigger no longer protects the report body';
  end if;

  -- Signature on ONE line: this string is parsed as a function signature, and
  -- keeping it unwrapped removes any dependence on how whitespace inside an
  -- argument list is tolerated.
  if has_function_privilege('anon', v_sig, 'EXECUTE') then
    raise exception '116: anon can execute submit_bug_report';
  end if;
  if not has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception '116: authenticated cannot execute submit_bug_report';
  end if;

  select btrim(coalesce(value_json->>0, '')) into v_info
    from public.system_settings where key = 'contact.info_email';
  select btrim(coalesce(value_json->>0, '')) into v_supp
    from public.system_settings where key = 'contact.support_email';
  if v_info is null or v_info = '' then
    raise exception '116: contact.info_email is missing or blank';
  end if;
  if v_supp is null or v_supp = '' then
    raise exception '116: contact.support_email is still blank';
  end if;
  if not (public.get_mobile_config()->'contact' ? 'info_email') then
    raise exception '116: get_mobile_config() does not expose contact.info_email';
  end if;

  raise notice '116 OK — bug_reports created; metadata derived server-side, '
               'throttle armed, reports immutable except triage; both contact '
               'addresses configured and reaching mobile';
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_16_116_bug_reports.sql
-- =============================================================================
