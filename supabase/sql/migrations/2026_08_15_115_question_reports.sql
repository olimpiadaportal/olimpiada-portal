-- =============================================================================
-- 2026_08_15_115_question_reports.sql
-- =============================================================================
-- Migration: 2026_08_15_115_question_reports.sql
-- Purpose: "Report a problem" — let a student flag a broken question (wrong
--          answer key, typo, unreadable image, bad translation) from the test
--          runner and the answer-review screen, and give administrators a
--          worklist to triage those reports.
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 001_extensions_and_enums.sql — question_report_status,
--                                           report_platform;
--          * 008_notifications_support_audit.sql — the table (support_requests
--                                           is its structural precedent);
--          * 010_rls_policies.sql — enable-RLS array + the three policies;
--          * 011_indexes_constraints_functions_triggers.sql — indexes,
--                                           trg_set_updated_at registration,
--                                           both trigger functions,
--                                           submit_question_report(), grants;
--          * 015_olympiad_preparation.sql — ONLY the olympiad_package_id
--                                           foreign key. It cannot live in the
--                                           008 CREATE TABLE: the canonical run
--                                           order is 001-012,014,015,016,013, so
--                                           public.olympiad_packages does not
--                                           exist yet when 008 runs and the FK
--                                           would abort a from-zero rebuild.
--                                           Here (a live database) the table
--                                           already exists, so the FK is inline.
--          * 013_validation_queries.sql — new check 103.
-- Backport status: pending
-- Destructive change: no. Creates two enums, one table, six indexes, two
--          trigger functions, one RPC and three policies. It drops nothing,
--          rewrites no existing function and touches no existing row.
-- Rollback notes: drop table public.question_reports cascade; drop function
--          public.submit_question_report(uuid,uuid,text,text,text,text);
--          drop function public.question_report_derive();
--          drop function public.question_report_freeze();
--          drop type public.question_report_status; drop type public.report_platform;
--          Nothing else depends on any of them.
--
-- NO begin;/commit; IN THIS FILE — deliberate, see CLAUDE.md. Migration
-- 2026_07_29_095 self-transacted inside a from-zero rebuild and its inner
-- `commit` committed the OUTER transaction, including a `drop schema`. Every
-- statement below is idempotent (create ... if not exists / create or replace /
-- drop policy if exists), so a partial run is fixed by re-running the file.
--
-- THE SHAPE OF THE TRUST BOUNDARY, because it is the whole design:
-- the client sends a question id, a message and two enum-constrained
-- diagnostic hints. EVERYTHING else — who reported, when, which package, which
-- attempt, the status — is derived by a BEFORE INSERT trigger. That is what
-- makes the reporter-can-INSERT policy safe: WITH CHECK is evaluated AFTER
-- BEFORE triggers, so a hand-rolled PostgREST insert with a forged
-- reporter_profile_id, a forged status or a forged package produces exactly the
-- row the RPC would have produced — including the rate limit. Mobile talks to
-- PostgREST directly (mobile-app/src/features/tests/api.ts), so a throttle that
-- lived in the RPC or in the web app would have guarded the web path only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums (backport -> 001)
-- -----------------------------------------------------------------------------
-- Real enums rather than text CHECKs, matching every sibling lifecycle in 001.
-- Wrapped so a failure rolls the WHOLE migration back. Every other migration
-- in this repo self-transacts; without it a mid-way error would leave the
-- reports feature half-created (table but no RLS, or policies but no grants),
-- which is far harder to diagnose than a clean refusal.
begin;

do $$ begin
  create type public.question_report_status as enum
    ('new', 'in_review', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- Its own enum so 'Android' or 'web ' can never enter the column.
do $$ begin
  create type public.report_platform as enum ('web', 'android', 'ios');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- question_reports (backport -> 008)
-- -----------------------------------------------------------------------------
create table if not exists public.question_reports (
  id                  uuid primary key default gen_random_uuid(),
  question_id         uuid not null references public.questions (id) on delete cascade,
  -- Attempt context, kept only when it survives verification in the BEFORE
  -- INSERT trigger. Nullable so a future non-attempt surface still works.
  attempt_id          uuid references public.test_attempts (id) on delete set null,
  attempt_kind        text check (attempt_kind in ('test','practice','daily','olympiad')),
  -- SNAPSHOT of questions.olympiad_package_id at report time. Denormalised on
  -- purpose: a pool question can later be archived or re-homed, and the admin
  -- still has to know which package the child was sitting in.
  olympiad_package_id uuid references public.olympiad_packages (id) on delete set null,
  -- set null, not cascade (support_requests precedent): deleting a child must
  -- not erase a still-valid report about a broken question.
  reporter_profile_id uuid references public.profiles (id) on delete set null,
  message             text not null,
  -- The locale the reporter was READING. Most reports are about a specific
  -- rendering ("the English text is wrong"), so an az-only row is useless.
  locale              public.content_locale not null,
  platform            public.report_platform not null,
  app_version         text,
  status              public.question_report_status not null default 'new',
  admin_note          text,
  handled_by          uuid references public.profiles (id) on delete set null,
  handled_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_question_reports_message
    check (char_length(message) between 1 and 1000),
  constraint chk_question_reports_app_version
    check (app_version is null or app_version ~ '^[0-9A-Za-z._+-]{1,32}$'),
  constraint chk_question_reports_admin_note
    check (admin_note is null or char_length(admin_note) <= 2000)
);

comment on table public.question_reports is
  'User-filed reports against a question. Every context column is derived '
  'server-side by trg_question_report_derive; the client supplies only the '
  'message plus two enum-constrained diagnostic hints (locale, platform).';

comment on column public.question_reports.locale is
  'CLIENT-SUPPLIED diagnostic: the UI language the reporter was reading. The '
  'database cannot observe it. Enum-constrained, never an authorization input. '
  'The web server action hardcodes it from its own getLocale() cookie '
  'resolution; a mobile client self-reports.';

comment on column public.question_reports.platform is
  'CLIENT-SUPPLIED diagnostic (see locale). A tampered client could claim the '
  'wrong platform; the consequence is a mislabelled admin row, nothing more.';

comment on column public.question_reports.olympiad_package_id is
  'Snapshot of questions.olympiad_package_id at report time, not a live join: '
  'a pool question can later be archived or moved, and test_attempts carries no '
  'package column, so the question row is the only source at insert time.';

-- -----------------------------------------------------------------------------
-- Indexes (backport -> 011)
-- -----------------------------------------------------------------------------
create index if not exists idx_question_reports_status_created
  on public.question_reports (status, created_at desc);
create index if not exists idx_question_reports_created
  on public.question_reports (created_at desc);
create index if not exists idx_question_reports_question
  on public.question_reports (question_id);
-- Also covers the throttle count in the derive trigger.
create index if not exists idx_question_reports_reporter
  on public.question_reports (reporter_profile_id, created_at desc);
create index if not exists idx_question_reports_package
  on public.question_reports (olympiad_package_id)
  where olympiad_package_id is not null;
-- ONE OPEN report per (question, reporter): the real duplicate guard. A closed
-- report frees the slot, so a genuinely new problem can still be filed later.
create unique index if not exists uq_question_reports_open_per_reporter
  on public.question_reports (question_id, reporter_profile_id)
  where reporter_profile_id is not null and status in ('new','in_review');

-- updated_at maintenance (the canonical file adds 'question_reports' to the
-- set_updated_at array instead; here the one trigger is created directly).
drop trigger if exists trg_set_updated_at on public.question_reports;
create trigger trg_set_updated_at before update on public.question_reports
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- BEFORE INSERT — the single authority for every derived column + the throttle
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because it must resolve a question the reporter cannot
-- SELECT (an archived question, or one in a private olympiad pool) and must
-- count reports the reporter's own SELECT policy would hide once a row is
-- closed. search_path is pinned; 013 check 103 asserts anon holds no EXECUTE.
create or replace function public.question_report_derive()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_pkg     uuid;
  v_kind    text;
  v_hour    int;
  v_day     int;
begin
  -- The reporter is WHOEVER IS CALLING, never what the payload claims. The
  -- INSERT policy re-compares this same value, so a forged reporter_profile_id
  -- is overwritten here and then fails nothing — it simply never existed.
  if v_profile is not null then
    new.reporter_profile_id := v_profile;
  end if;

  -- Server-owned lifecycle: a report is always born 'new' and unhandled.
  new.status     := 'new';
  new.handled_by := null;
  new.handled_at := null;
  new.admin_note := null;
  new.created_at := now();
  new.updated_at := now();
  new.message    := btrim(new.message, ' ' || chr(9) || chr(10) || chr(13));

  select q.olympiad_package_id into v_pkg
    from public.questions q
   where q.id = new.question_id;
  if not found then
    raise exception 'report: unknown question' using errcode = 'no_data_found';
  end if;
  new.olympiad_package_id := v_pkg;

  -- An attempt id survives ONLY if it is the reporter's own attempt and that
  -- attempt actually drew this question. A bogus one is DROPPED, not rejected:
  -- the report is still worth having, the fake context is not.
  new.attempt_kind := null;
  if new.attempt_id is not null then
    select a.kind into v_kind
      from public.test_attempts a
     where a.id = new.attempt_id
       and a.student_profile_id = new.reporter_profile_id
       and exists (
             select 1
               from public.test_attempt_answers ta
              where ta.attempt_id = a.id
                and ta.question_id = new.question_id);
    if v_kind is null then
      new.attempt_id := null;
    else
      new.attempt_kind := v_kind;
    end if;
  end if;

  -- Throttle in the DATABASE. Mobile reaches PostgREST directly (mobile-app/
  -- src/features/tests/api.ts), so an app-tier limiter would cover the web path
  -- only. One indexed count per insert (idx_question_reports_reporter); a plain
  -- SELECT over a different row set, so there is no trigger recursion.
  if new.reporter_profile_id is not null then
    select count(*) filter (where created_at > now() - interval '1 hour'),
           count(*) filter (where created_at > now() - interval '1 day')
      into v_hour, v_day
      from public.question_reports
     where reporter_profile_id = new.reporter_profile_id
       and created_at > now() - interval '1 day';
    if v_hour >= 5 or v_day >= 20 then
      raise exception 'report: rate limited' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.question_report_derive() is
  'BEFORE INSERT on question_reports: derives reporter, status, package and '
  'attempt context server-side and enforces the authoritative rate limit '
  '(5/hour, 20/day per reporter). Every write path — the RPC and a direct '
  'PostgREST insert alike — passes through it.';

drop trigger if exists trg_question_report_derive on public.question_reports;
create trigger trg_question_report_derive
  before insert on public.question_reports
  for each row execute function public.question_report_derive();

-- -----------------------------------------------------------------------------
-- BEFORE UPDATE — the report is evidence; an admin may only move it
-- -----------------------------------------------------------------------------
create or replace function public.question_report_freeze()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.question_id         := old.question_id;
  new.attempt_id          := old.attempt_id;
  new.attempt_kind        := old.attempt_kind;
  new.olympiad_package_id := old.olympiad_package_id;
  new.reporter_profile_id := old.reporter_profile_id;
  new.message             := old.message;
  new.locale              := old.locale;
  new.platform            := old.platform;
  new.app_version         := old.app_version;
  new.created_at          := old.created_at;
  if new.status is distinct from old.status then
    new.handled_by := public.current_profile_id();
    new.handled_at := now();
  end if;
  return new;
end;
$$;

comment on function public.question_report_freeze() is
  'BEFORE UPDATE on question_reports: only status and admin_note may change, '
  'and a status change stamps handled_by/handled_at. A resolved report can '
  'never be a rewritten one.';

drop trigger if exists trg_question_report_freeze on public.question_reports;
create trigger trg_question_report_freeze
  before update on public.question_reports
  for each row execute function public.question_report_freeze();
-- Name ordering matters: PostgreSQL fires BEFORE triggers alphabetically, and
-- trg_question_report_freeze sorts before trg_set_updated_at, so the freeze runs
-- first and updated_at is still stamped afterwards.

-- -----------------------------------------------------------------------------
-- submit_question_report — the app entry point (backport -> 011)
-- -----------------------------------------------------------------------------
create or replace function public.submit_question_report(
  p_question_id uuid,
  p_attempt_id  uuid,
  p_message     text,
  p_locale      text,
  p_platform    text,
  p_app_version text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_msg     text := btrim(coalesce(p_message, ''), ' ' || chr(9) || chr(10) || chr(13));
  v_id      uuid;
begin
  if v_profile is null then
    raise exception 'forbidden';
  end if;
  if v_msg = '' then
    raise exception 'report: empty message' using errcode = 'check_violation';
  end if;
  -- Capped here as well as in the column CHECK: a 2 MB body is refused before
  -- it is written, not silently truncated.
  if char_length(v_msg) > 1000 then
    raise exception 'report: message too long' using errcode = 'check_violation';
  end if;
  if p_locale is null or p_locale not in ('az','en','ru') then
    raise exception 'report: bad locale' using errcode = 'check_violation';
  end if;
  if p_platform is null or p_platform not in ('web','android','ios') then
    raise exception 'report: bad platform' using errcode = 'check_violation';
  end if;

  insert into public.question_reports
    (question_id, attempt_id, reporter_profile_id, message, locale, platform, app_version)
  values
    (p_question_id, p_attempt_id, v_profile, v_msg,
     p_locale::public.content_locale, p_platform::public.report_platform,
     nullif(btrim(coalesce(p_app_version, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_question_report(uuid,uuid,text,text,text,text) is
  'Files one question report for the CALLING profile. Validates the message, '
  'locale and platform; every context column (reporter, status, package, '
  'attempt) is derived by trg_question_report_derive, which also enforces the '
  'rate limit — so a direct PostgREST insert is exactly as constrained.';

-- -----------------------------------------------------------------------------
-- RLS + policies (backport -> 010)
-- -----------------------------------------------------------------------------
alter table public.question_reports enable row level security;

-- A reporter reads only their own rows; admins read all. The `is not null`
-- guard is load-bearing: after a child account is deleted the column goes NULL,
-- and it keeps a future coalesce() refactor from opening orphaned rows to
-- everyone.
drop policy if exists "qreports_select" on public.question_reports;
create policy "qreports_select" on public.question_reports for select to authenticated
  using (
    public.is_admin()
    or (reporter_profile_id is not null
        and reporter_profile_id = public.current_profile_id())
  );

-- Safe even though the client picks the columns: WITH CHECK is evaluated AFTER
-- the BEFORE INSERT trigger has already overwritten reporter/status/context.
drop policy if exists "qreports_insert" on public.question_reports;
create policy "qreports_insert" on public.question_reports for insert to authenticated
  with check (reporter_profile_id = public.current_profile_id());

drop policy if exists "qreports_update" on public.question_reports;
create policy "qreports_update" on public.question_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Deliberately NO delete policy (audit_logs precedent): service role only.

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- Reports are operational history, so take back the blanket DELETE that 010
-- grants to `authenticated` (belt and braces with the absent delete policy).
grant select, insert, update on public.question_reports to authenticated;
grant select on public.question_reports to anon;
grant all on public.question_reports to service_role;
revoke delete on public.question_reports from anon, authenticated;

revoke all on function public.submit_question_report(uuid,uuid,text,text,text,text)
  from public, anon;
grant execute on function public.submit_question_report(uuid,uuid,text,text,text,text)
  to authenticated, service_role;
revoke all on function public.question_report_derive() from public, anon, authenticated;
revoke all on function public.question_report_freeze() from public, anon, authenticated;

-- =============================================================================
-- Verify
-- =============================================================================
do $verify$
declare
  v_derive text;
  v_freeze text;
begin
  if to_regclass('public.question_reports') is null then
    raise exception '115: question_reports is missing';
  end if;
  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'question_reports'
       and c.relrowsecurity) then
    raise exception '115: RLS is not enabled on question_reports';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'question_reports') <> 3 then
    raise exception '115: expected exactly 3 policies on question_reports';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'question_reports'
                and cmd = 'DELETE') then
    raise exception '115: a DELETE policy exists — reports must not be erasable';
  end if;
  if has_table_privilege('authenticated', 'public.question_reports', 'DELETE') then
    raise exception '115: authenticated can still DELETE question_reports';
  end if;

  -- The partial predicate IS the duplicate rule: without it the index would
  -- block a second report forever, even after the first was resolved.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'uq_question_reports_open_per_reporter'
       and indexdef like '%in_review%') then
    raise exception '115: the open-report unique index is missing or unscoped';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.question_reports'::regclass
                    and tgname = 'trg_question_report_derive') then
    raise exception '115: the derive trigger is not attached';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.question_reports'::regclass
                    and tgname = 'trg_question_report_freeze') then
    raise exception '115: the freeze trigger is not attached';
  end if;

  v_derive := pg_get_functiondef('public.question_report_derive()'::regprocedure);
  v_freeze := pg_get_functiondef('public.question_report_freeze()'::regprocedure);
  if position('current_profile_id(' in v_derive) = 0 then
    raise exception '115: the derive trigger no longer resolves the caller';
  end if;
  if position('rate limited' in v_derive) = 0 then
    raise exception '115: the rate limit was removed from the derive trigger';
  end if;
  if position('old.message' in v_freeze) = 0 then
    raise exception '115: the freeze trigger no longer protects the report body';
  end if;

  if has_function_privilege('anon',
       'public.submit_question_report(uuid,uuid,text,text,text,text)', 'EXECUTE') then
    raise exception '115: anon can execute submit_question_report';
  end if;
  if not has_function_privilege('authenticated',
       'public.submit_question_report(uuid,uuid,text,text,text,text)', 'EXECUTE') then
    raise exception '115: authenticated cannot execute submit_question_report';
  end if;

  raise notice '115 OK — question_reports created; context derived server-side, '
               'throttle armed, reports immutable except status/admin_note';
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_15_115_question_reports.sql
-- =============================================================================
