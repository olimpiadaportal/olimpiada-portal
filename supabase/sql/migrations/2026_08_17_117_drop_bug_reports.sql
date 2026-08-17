-- =============================================================================
-- 2026_08_17_117_drop_bug_reports.sql
-- =============================================================================
-- Migration: 2026_08_17_117_drop_bug_reports.sql
-- Purpose: WITHDRAW the separate "Report a bug" feature that migration 116
--          created, and give the SURVIVING question-report feature the in-app
--          reply loop it was missing.
--
--          Owner decision (2026-08-17): the platform has ONE reports section —
--          question reports, shown to administrators as "Sual bildirişləri".
--          Two report inboxes meant two triage worklists, two admin screens and
--          two abuse budgets for what is, in practice, one queue that one person
--          works through; and the bug half also sent OUTBOUND EMAIL, which the
--          owner does not want a report to trigger at all. The contact addresses
--          stay published on the website as plain mailto links, so anyone who
--          wants to write in still can — that path needs no table.
--
--          What replaces the removed feedback loop: a student who reports a
--          question now hears back IN THE APP. Taking a report into review and
--          closing it each notify the reporter through the ordinary
--          notification inbox, so "I reported this" stops being a message into
--          the void without any mail leaving the platform.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 001_extensions_and_enums.sql — REMOVE bug_report_status,
--                                           bug_report_priority,
--                                           report_reporter_role;
--          * 008_notifications_support_audit.sql — REMOVE the bug_reports table
--                                           and its column comments;
--          * 010_rls_policies.sql — REMOVE 'bug_reports' from the enable-RLS
--                                           array and the three bugreports_*
--                                           policies;
--          * 011_indexes_constraints_functions_triggers.sql — REMOVE
--                                           'bug_reports' from the
--                                           set_updated_at array, the seven
--                                           indexes, both trigger functions,
--                                           submit_bug_report and its grants;
--                                           ADD notify_question_report_status_tg
--                                           + its trigger and grants;
--          * 013_validation_queries.sql — check 104 is INVERTED (it asserted the
--                                           feature existed; it now asserts the
--                                           feature is gone, that the removal
--                                           took nothing else with it, and that
--                                           the new notifier is armed).
--          012_seed_initial_data.sql is DELIBERATELY NOT TOUCHED: it holds the
--          contact settings, which survive this migration untouched.
-- Backport status: pending
-- Destructive change: YES — it drops public.bug_reports and every row in it.
--          That is the point of the change, and the data is a pre-launch
--          triage queue, not user content anyone paid for or earned. Nothing
--          else drops: question_reports keeps every row, and the two contact
--          settings keep their values (the verify block asserts both).
-- Rollback notes: re-run 2026_08_16_116_bug_reports.sql. It is idempotent and
--          self-contained; the ROWS are not recoverable without a dump, so take
--          one first if the queue still matters.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves nothing half-removed. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild.
--
-- THE THREE THINGS THIS MIGRATION MUST NOT TAKE WITH IT, all asserted below:
--
--   1. public.report_platform. Migration 116's header lists it as "reused", and
--      a careless reading of that file's rollback notes drops it — but it is
--      migration 115's type and public.question_reports.platform still uses it.
--      Dropping it breaks the feature this change is keeping.
--   2. public.question_reports and its rows. The bug table is the sibling being
--      withdrawn; the question table is the survivor.
--   3. contact.info_email / contact.support_email. The website's contact
--      section, its trilingual copy and its mailto links are unchanged by this
--      migration. Removing the bug FORM does not remove the addresses — those
--      are now the ONLY way to write in, so a blank one is worse than before.
--
-- content_locale, question_report_status and support_status are likewise left
-- alone: none of them was migration 116's to create.
-- =============================================================================

begin;

-- Captured BEFORE anything is dropped so the verify block can prove the
-- withdrawal touched no question report. on commit drop = no cleanup to forget.
create temp table _m117_before on commit drop as
  select count(*)::bigint as question_report_rows from public.question_reports;

-- -----------------------------------------------------------------------------
-- A1. The table (backport -> remove from 008; policies from 010; indexes from 011)
-- -----------------------------------------------------------------------------
-- No CASCADE, deliberately. Nothing is supposed to depend on this table, and a
-- silent cascade is exactly how a withdrawal takes an unrelated object with it.
-- If some object we do not know about references bug_reports, this line MUST
-- fail loudly inside the transaction rather than quietly widen the blast radius.
-- Dropping the table takes its policies, its seven indexes and its three
-- triggers with it; the trigger FUNCTIONS survive a table drop, so they are
-- named separately below.
drop table if exists public.bug_reports;

-- -----------------------------------------------------------------------------
-- A2. Functions (backport -> remove from 011)
-- -----------------------------------------------------------------------------
drop function if exists public.submit_bug_report(
  text,text,text,text,text,text,text,text,text,text,text,text);
drop function if exists public.bug_report_derive();
drop function if exists public.bug_report_freeze();

-- -----------------------------------------------------------------------------
-- A3. Enums (backport -> remove from 001)
-- -----------------------------------------------------------------------------
-- EXACTLY the three types migration 116 created and nothing else. Each was used
-- by public.bug_reports and by no other column in the database, so they are dead
-- weight the moment the table is gone. Again no CASCADE: a type that still has a
-- dependant must fail this migration, not silently drop that dependant's column.
drop type if exists public.bug_report_status;
drop type if exists public.bug_report_priority;
drop type if exists public.report_reporter_role;

-- public.report_platform is NOT dropped. It is migration 115's type and
-- public.question_reports.platform is defined on it — see the file header.

-- -----------------------------------------------------------------------------
-- B1. The reply loop: a status transition notifies the reporter (backport -> 011)
-- -----------------------------------------------------------------------------
-- Fired from the DATABASE, on the transition itself, for the same reason
-- trg_notify_attempt_graded lives here: the admin panel is not the only thing
-- that can move a report (a PostgREST update, a psql session, a future admin RPC
-- all can), and a notifier that lives in one client is a notifier the other
-- paths silently skip.
--
-- SECURITY DEFINER is load-bearing, not decoration: create_notification is
-- service_role-only by design (a user must never be able to forge an inbox row),
-- and the admin whose UPDATE fires this trigger is an `authenticated` caller.
-- Without DEFINER every notification would fail on EXECUTE. search_path pinned.
--
-- WHICH LANGUAGE: question_reports.locale — the UI language the reporter was
-- actually READING when they filed. profiles.preferred_locale is deliberately
-- NOT used, for the same reason web-app/src/lib/auth/reportActions.ts rejected
-- it as the report's own locale source: nothing in web-app or mobile-app ever
-- writes that column, so it is 'az' for everyone and localising by it would be
-- a trilingual gesture that ships one language. The report's own locale is a
-- real captured signal, and it is the language the reporter used to talk to us.
create or replace function public.notify_question_report_status_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loc   text;
  v_type  text;
  v_title text;
  v_body  text;
begin
  -- No reporter profile = no inbox. This is not only the anonymous case: the
  -- FK is ON DELETE SET NULL, so a report whose author deleted their account
  -- survives with a NULL reporter and must never be "notified".
  if new.reporter_profile_id is null then
    return null;
  end if;

  v_loc := case when new.locale::text in ('en','ru') then new.locale::text else 'az' end;

  if new.status = 'in_review' then
    v_type := 'question_report_in_review';
    if v_loc = 'en' then
      v_title := 'Your report is being reviewed';
      v_body  := 'We got your report about the question and we are looking into it.';
    elsif v_loc = 'ru' then
      v_title := 'Твоё сообщение на рассмотрении';
      v_body  := 'Мы получили сообщение о вопросе и сейчас проверяем его.';
    else
      v_title := 'Bildirişin baxışdadır';
      v_body  := 'Sualla bağlı bildirişini aldıq və hazırda yoxlayırıq.';
    end if;

  elsif new.status = 'resolved' then
    v_type := 'question_report_resolved';
    if v_loc = 'en' then
      v_title := 'Your report is resolved';
      v_body  := 'We checked the question you reported and fixed the problem. Thank you!';
    elsif v_loc = 'ru' then
      v_title := 'Сообщение обработано';
      v_body  := 'Мы проверили вопрос, о котором ты написал(а), и устранили проблему. Спасибо!';
    else
      v_title := 'Bildirişin həll olundu';
      v_body  := 'Bildirdiyin sualı yoxladıq və problemi aradan qaldırdıq. Təşəkkür edirik!';
    end if;

  elsif new.status = 'dismissed' then
    -- A dismissal is told to the reporter too, and told HONESTLY: "we checked
    -- it, nothing needed changing". Silence would be the cheaper option and the
    -- worse one — a student who reports a question and never hears anything
    -- concludes the report button does nothing and stops using it, which costs
    -- us the broken questions nobody else will find. The wording deliberately
    -- carries no blame: dismissed means the question was fine, not that the
    -- report was wrong to file.
    v_type := 'question_report_dismissed';
    if v_loc = 'en' then
      v_title := 'Your report was checked';
      v_body  := 'We checked the question you reported — no change was needed. '
              || 'Thanks for telling us all the same.';
    elsif v_loc = 'ru' then
      v_title := 'Мы проверили твоё сообщение';
      v_body  := 'Мы проверили вопрос — изменения не потребовались. '
              || 'Спасибо, что написал(а) нам.';
    else
      v_title := 'Bildirişin yoxlanıldı';
      v_body  := 'Bildirdiyin sualı yoxladıq — dəyişiklik tələb olunmadı. '
              || 'Yenə də bizə yazdığın üçün təşəkkür edirik.';
    end if;

  else
    -- Reopening a report to 'new' is an internal correction, not news.
    return null;
  end if;

  begin
    perform public.create_notification(
      new.reporter_profile_id,
      v_type,
      v_title,
      v_body,
      -- Both keys end in _id, so the notification detail view drops them from
      -- its scalar-pair list (opaque identifiers are noise to a reader) while
      -- still carrying the context any future surface would need.
      jsonb_build_object('question_report_id', new.id,
                         'question_id',        new.question_id),
      array['in_app'],
      -- IDEMPOTENT per (report, status). The WHEN clause already suppresses a
      -- re-save of the same status; this is what survives the other shape of
      -- the mistake — in_review -> new -> in_review, which IS a transition and
      -- would otherwise notify a second time for the same news. Deduped by
      -- create_notification's on conflict (idempotency_key) do nothing.
      'qreport:' || new.id::text || ':' || new.status::text,
      4,
      -- No action_url: the reporter has no screen that shows one report, and a
      -- deep link into nothing is worse than none. The notification carries the
      -- whole message.
      null,
      'announcement',
      null);
  exception when others then
    -- Triage must never fail because the inbox did (award_attempt_points_tg /
    -- notify_attempt_graded_tg precedent). An admin moving a report is the
    -- important half; the courtesy note is not worth aborting it for.
    raise warning 'notify_question_report_status failed for report %: %',
      new.id, sqlerrm;
  end;

  return null;
end;
$$;

comment on function public.notify_question_report_status_tg() is
  'AFTER UPDATE on question_reports: notifies the REPORTER, in the locale they '
  'filed in, when an administrator takes their report into review, resolves it '
  'or dismisses it. Idempotent per (report, status) via create_notification. '
  'Skips anonymous and deleted reporters; failure-safe (warnings only) so a '
  'notification can never abort triage.';

drop trigger if exists trg_notify_question_report_status on public.question_reports;
-- No `of status` column list, unlike trg_notify_attempt_graded. The WHEN clause
-- is the real guard, and a column list would additionally require the STATEMENT
-- to name status — which a BEFORE trigger writing new.status would not do. This
-- is an administrator worklist, so evaluating one cheap WHEN per update costs
-- nothing and removes a way for the notification to be silently skipped.
create trigger trg_notify_question_report_status
  after update on public.question_reports
  for each row
  when (new.status is distinct from old.status
        and new.status in ('in_review','resolved','dismissed')
        and new.reporter_profile_id is not null)
  execute function public.notify_question_report_status_tg();

-- 010 line 88 runs `alter default privileges in schema public grant execute on
-- functions to anon, authenticated, service_role`, so a new function is
-- EXECUTE-able by anon AND authenticated unless all three are named. Revoking
-- "from public, anon" alone has shipped as a hole in this repository before.
-- A trigger function is never called directly by anyone.
revoke all on function public.notify_question_report_status_tg()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Fix 1: the freeze trigger un-did `on delete set null` on the reporter
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
  -- The one frozen field that may NOT be restored blindly. reporter_profile_id
  -- carries `on delete set null`, and a referential action is an ORDINARY
  -- UPDATE, so this BEFORE UPDATE trigger fires on it too and — restoring
  -- unconditionally — wrote the deleted id straight back. PostgreSQL does not
  -- re-check the constraint against the row a trigger substituted, so the report
  -- kept a DANGLING reporter. That was invisible while nothing read the column;
  -- it stops being invisible now that trg_notify_question_report_status keys a
  -- create_notification INSERT off it and would take an FK violation on every
  -- triage of such a report — swallowed as a warning, so the admin would be
  -- promised a delivery that never happens.
  -- Only the cascade can produce this exact shape (new NULL, old set, profile
  -- already gone); no client can delete a profile row. So honouring it closes
  -- the hole without opening any way to detach a live report from its reporter.
  new.reporter_profile_id := case
    when new.reporter_profile_id is null
         and old.reporter_profile_id is not null
         and not exists (select 1 from public.profiles p
                         where p.id = old.reporter_profile_id)
      then null
    else old.reporter_profile_id
  end;
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
  'and a status change stamps handled_by/handled_at. The reporter id is frozen '
  'EXCEPT against its own `on delete set null` cascade, which would otherwise '
  'be reverted into a dangling reference.';

-- Existing rows may already carry a dangling id written by the old trigger.
-- Repair them now, or the first triage of one takes the FK violation this fix
-- exists to prevent. Written as the cascade should have written it.
update public.question_reports r
   set reporter_profile_id = null
 where r.reporter_profile_id is not null
   and not exists (select 1 from public.profiles p
                   where p.id = r.reporter_profile_id);

-- -----------------------------------------------------------------------------
-- Fix 2: a reporter could read the admin's triage notes on their own report
-- -----------------------------------------------------------------------------
-- The SELECT policy was row-level while the grant is table-wide (010 line 78),
-- and PostgREST lets the caller choose the columns — so the reporter branch
-- handed a child `admin_note` and `handled_by`, which are internal triage.
-- Column privileges cannot fix it: an admin is also `authenticated`, so
-- narrowing the grant would blind the admin panel.
-- The branch bought nothing to begin with — NOTHING in web-app or mobile-app
-- reads this table (both only mention it in comments) — and it buys even less
-- now: the reporter learns their outcome through the notification added above,
-- which carries the copy we chose rather than the note we wrote to each other.
-- Same conclusion, same reasoning, as the identical finding fixed on
-- bug_reports in 116. If a "my reports" screen is ever wanted, add a SECURITY
-- DEFINER function returning only the safe columns — the pattern used
-- everywhere else in this schema.
drop policy if exists "qreports_select" on public.question_reports;
create policy "qreports_select" on public.question_reports for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- Verify
-- =============================================================================

-- Fix 1: the freeze must no longer restore a deleted reporter unconditionally.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'question_report_freeze';
  if v_def is null then
    raise exception '117: question_report_freeze is missing';
  end if;
  if position('not exists (select 1 from public.profiles' in v_def) = 0 then
    raise exception
      '117: question_report_freeze still restores a deleted reporter id, which '
      'leaves a dangling reference the new notifier would trip over';
  end if;
  if exists (select 1 from public.question_reports r
              where r.reporter_profile_id is not null
                and not exists (select 1 from public.profiles p
                                where p.id = r.reporter_profile_id)) then
    raise exception '117: dangling reporter ids survive in question_reports';
  end if;
end $$;

-- Fix 2: SELECT on question_reports is admin-only.
do $$
declare v_qual text;
begin
  select pg_get_expr(pol.polqual, pol.polrelid) into v_qual
    from pg_policy pol
   where pol.polrelid = 'public.question_reports'::regclass
     and pol.polname  = 'qreports_select';
  if v_qual is null then
    raise exception '117: policy qreports_select is missing';
  end if;
  if position('reporter_profile_id' in v_qual) > 0 then
    raise exception
      '117: qreports_select still has a reporter branch, so a reporter can '
      'select admin_note/handled_by on their own row (grant is table-wide)';
  end if;
end $$;

do $verify$
declare
  v_before bigint;
  v_after  bigint;
  v_info   text;
  v_supp   text;
  v_def    text;
  v_labels text;
begin
  -- ---- the feature is gone -------------------------------------------------
  if to_regclass('public.bug_reports') is not null then
    raise exception '117: bug_reports still exists';
  end if;
  if to_regprocedure('public.submit_bug_report('
        || 'text,text,text,text,text,text,text,text,text,text,text,text)') is not null then
    raise exception '117: submit_bug_report still exists';
  end if;
  if to_regprocedure('public.bug_report_derive()') is not null
     or to_regprocedure('public.bug_report_freeze()') is not null then
    raise exception '117: a bug_report trigger function still exists';
  end if;
  if exists (select 1 from pg_type t
               join pg_namespace n on n.oid = t.typnamespace
              where n.nspname = 'public'
                and t.typname in ('bug_report_status','bug_report_priority',
                                  'report_reporter_role')) then
    raise exception '117: a bug_report enum still exists';
  end if;
  -- A policy row cannot outlive its table, but the count is free and it proves
  -- the drop was a real drop rather than a rename.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'bug_reports') then
    raise exception '117: bug_reports policies survive';
  end if;

  -- ---- and it took nothing else with it ------------------------------------
  -- report_platform is migration 115's type; question_reports.platform is
  -- defined on it. This is the single most likely casualty of this migration.
  select string_agg(l.enumlabel, ',' order by l.enumlabel) into v_labels
    from pg_enum l
    join pg_type ty on ty.oid = l.enumtypid
    join pg_namespace ns on ns.oid = ty.typnamespace
   where ns.nspname = 'public' and ty.typname = 'report_platform';
  if v_labels is distinct from 'android,ios,web' then
    raise exception '117: report_platform is missing or altered (%)',
      coalesce(v_labels, '<gone>');
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'question_reports'
                    and column_name = 'platform' and udt_name = 'report_platform') then
    raise exception '117: question_reports.platform no longer uses report_platform';
  end if;

  if to_regclass('public.question_reports') is null then
    raise exception '117: question_reports is gone';
  end if;
  select question_report_rows into v_before from _m117_before;
  select count(*)::bigint into v_after from public.question_reports;
  if v_after <> v_before then
    raise exception '117: question_reports lost rows (% -> %)', v_before, v_after;
  end if;
  if to_regprocedure('public.submit_question_report(uuid,uuid,text,text,text,text)') is null
     or to_regprocedure('public.question_report_derive()') is null
     or to_regprocedure('public.question_report_freeze()') is null then
    raise exception '117: a question_report function was removed';
  end if;

  -- The contact addresses are now the ONLY way to write in, so a blank one is
  -- worse after this migration than it was before it.
  select btrim(coalesce(value_json->>0, '')) into v_info
    from public.system_settings where key = 'contact.info_email';
  select btrim(coalesce(value_json->>0, '')) into v_supp
    from public.system_settings where key = 'contact.support_email';
  if coalesce(v_info, '') <> 'info@olympiq.ai' then
    raise exception '117: contact.info_email is missing or changed (%)',
      coalesce(v_info, '<gone>');
  end if;
  if coalesce(v_supp, '') <> 'support@olympiq.ai' then
    raise exception '117: contact.support_email is missing or changed (%)',
      coalesce(v_supp, '<gone>');
  end if;

  -- ---- the replacement is armed -------------------------------------------
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_notify_question_report_status'
                    and tgrelid = 'public.question_reports'::regclass
                    and tgfoid  = 'public.notify_question_report_status_tg()'::regprocedure
                    and not tgisinternal) then
    raise exception '117: the report-status notifier is not attached';
  end if;
  v_def := pg_get_functiondef('public.notify_question_report_status_tg()'::regprocedure);
  if position('create_notification' in v_def) = 0 then
    raise exception '117: the notifier no longer goes through create_notification';
  end if;
  -- The idempotency key format IS the once-per-transition guarantee.
  if position('''qreport:'' || new.id::text' in v_def) = 0 then
    raise exception '117: the notifier lost its idempotency key';
  end if;
  if position('reporter_profile_id is null' in v_def) = 0 then
    raise exception '117: the notifier no longer skips anonymous reporters';
  end if;
  -- All three languages, or it is not trilingual copy.
  if position('Bildirişin' in v_def) = 0
     or position('Your report' in v_def) = 0
     or position('сообщение' in v_def) = 0 then
    raise exception '117: the notifier copy is not trilingual';
  end if;
  if not (select p.prosecdef
                 and coalesce(p.proconfig, '{}'::text[])
                       @> array['search_path=public, pg_temp']
                 and not has_function_privilege('anon', p.oid, 'EXECUTE')
                 and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
            from pg_proc p
           where p.oid = 'public.notify_question_report_status_tg()'::regprocedure) then
    raise exception '117: the notifier posture is wrong (definer/search_path/grants)';
  end if;

  raise notice '117 OK — bug_reports withdrawn with its three enums; '
               'report_platform, question_reports (% rows) and both contact '
               'addresses intact; question-report triage now notifies the '
               'reporter in app, once per transition, in their own language',
               v_after;
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_17_117_drop_bug_reports.sql
-- =============================================================================
