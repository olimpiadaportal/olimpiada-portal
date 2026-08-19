-- =============================================================================
-- 2026_08_19_122_question_report_reply.sql
-- =============================================================================
-- Migration: 2026_08_19_122_question_report_reply.sql
-- Purpose: An administrator now WRITES the answer a student gets. Migration 117
--          gave the reporter a reply loop with FIXED copy: resolving a report
--          always said "we fixed the problem", dismissing it always said "no
--          change was needed". That is the same sentence for a wrong answer key,
--          a broken image and a misunderstanding, so it answers none of them.
--
--          Owner decision (2026-08-19): "Həll olundu" and "Rədd et" open a
--          composer. The admin writes the explanation; the platform wraps it in
--          a fixed opening line (naming the date and time the report was filed)
--          and a fixed closing line, both generated IN THE LANGUAGE OF THE
--          REPORT. The three parts are joined by blank lines and delivered as
--          one in-app notification. "Baxışa götür" and "Yenidən aç" are
--          unchanged.
--
--          THE SECOND HALF OF THE DECISION, and the reason this migration
--          touches the notifier at all: if the reply cannot be delivered, the
--          status must NOT change. Migration 117 deliberately wrapped the send
--          in `exception when others then raise warning` so a broken inbox could
--          never block triage. That trade was right while the notification was
--          boilerplate and wrong now that it is the admin's actual answer — a
--          report marked resolved whose reply silently evaporated is a report
--          nobody will ever look at again. The swallow is REMOVED here.
--
--          A SUPPRESSED notification is not a failed one. create_notification
--          returns NULL without raising when the recipient has in-app
--          notifications switched off (priority > 1) and when the idempotency
--          key was already used. Both are normal outcomes and both COMMIT: the
--          owner's rule is that the response is still stored either way. Only a
--          real exception aborts.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 008_notifications_support_audit.sql — ADD
--                    question_reports.resolution_message, its CHECK constraint
--                    (chk_question_reports_resolution_message) and its comment;
--          * 011_indexes_constraints_functions_triggers.sql — ADD
--                    question_report_reply_text() + its revokes; REPLACE
--                    notify_question_report_status_tg() (composes the reply,
--                    requires it, no longer swallows a failed send); REPLACE
--                    question_report_freeze() — COMMENT ONLY, see A4;
--          * 013_validation_queries.sql — NEW check 109.
--          010 is deliberately untouched: the three qreports_* policies already
--          gate the new column (SELECT and UPDATE are both admin-only since
--          migration 117), and a column is not a policy.
-- Backport status: pending
-- Destructive change: NO. One nullable column is added; no row is rewritten and
--          no object is dropped. Reports resolved BEFORE this migration keep a
--          NULL resolution_message — see A1 for why that is not repaired with
--          invented text, and A3 for why no table-level "resolved implies a
--          message" constraint is added.
-- Rollback notes:
--          alter table public.question_reports
--            drop constraint if exists chk_question_reports_resolution_message,
--            drop column if exists resolution_message;
--          drop function if exists
--            public.question_report_reply_text(text, timestamptz, text);
--          then re-apply the notify_question_report_status_tg() body from
--          2026_08_17_117_drop_bug_reports.sql (section B1). Dropping the column
--          without restoring the old notifier leaves a trigger that raises on
--          every resolve.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves nothing half-applied. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A1. The column (backport -> 008)
-- -----------------------------------------------------------------------------
-- The admin's BODY only — never the assembled notification. The opening and
-- closing lines are generated from data the row already carries (created_at and
-- locale), so storing the composed text would be storing a derived value that
-- can drift from the generator. The detail page re-composes it for display with
-- the very same function the trigger sends through.
--
-- Nullable, and NOT backfilled. Reports that were resolved under migration 117
-- got the fixed copy and no admin ever wrote them a body; inventing one now
-- would put words in an administrator's mouth and, worse, would make the detail
-- page show a "sent response" that was never sent.
alter table public.question_reports
  add column if not exists resolution_message text;

-- Shape only. 1000 matches the cap on the report the student wrote (see
-- chk_question_reports_message) — an answer needs no more room than a question.
-- The 10-character floor is the same one the server action and the notifier
-- enforce, so an empty "ok" cannot be delivered as an explanation.
--
-- TRIMMED before measuring, with the same whitespace set submit_question_report
-- uses, so ten spaces is not a ten-character answer.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.question_reports'::regclass
                    and conname  = 'chk_question_reports_resolution_message') then
    alter table public.question_reports
      add constraint chk_question_reports_resolution_message
      check (resolution_message is null
             or char_length(btrim(resolution_message,
                                  ' ' || chr(9) || chr(10) || chr(13)))
                between 10 and 1000);
  end if;
end $$;

comment on column public.question_reports.resolution_message is
  'The administrator''s own answer to the reporter, stored when a report is '
  'resolved or dismissed. The BODY only: the opening line (which names the date '
  'and time the report was filed) and the closing line are generated by '
  'question_report_reply_text() from created_at and locale, both at send time '
  'and for display, so there is one generator and nothing to drift. Survives a '
  'reopen on purpose — what was already sent to a student stays on the record.';

-- -----------------------------------------------------------------------------
-- A2. The assembler (backport -> 011)
-- -----------------------------------------------------------------------------
-- ONE definition of what the student receives, called by the trigger that sends
-- it. The admin panel's live preview is a TypeScript port
-- (admin-panel/src/lib/admin/question-report-reply.ts) and is pinned to this
-- text, literal by literal, by admin-panel/src/lib/admin/__tests__/
-- question-report-reply.test.ts — which reads THIS file and the canonical 011
-- backport. A preview that quietly disagreed with the send would be worse than
-- no preview: the admin would approve one message and the student would read
-- another.
--
-- LANGUAGE = the report's own locale (question_reports.locale), i.e. the UI the
-- reporter was reading when they filed — the same choice, for the same reason,
-- that migration 117 documented at length: profiles.preferred_locale is written
-- by nothing in this platform and is 'az' for everyone. The admin types the body
-- in whatever language they judge right; the frame around it is the reporter's.
--
-- TIME = Asia/Baku, the convention throughout this schema. Rendering the filing
-- time in UTC would show every student a moment four hours before the one they
-- remember.
create or replace function public.question_report_reply_text(
  p_locale     text,
  p_created_at timestamptz,
  p_body       text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  with l as (
    select case when p_locale in ('en','ru') then p_locale else 'az' end as loc
  ), d as (
    select to_char(p_created_at at time zone 'Asia/Baku', 'DD.MM.YYYY') as dt,
           to_char(p_created_at at time zone 'Asia/Baku', 'HH24:MI')    as tm
  )
  select case l.loc
           when 'en' then
             'Your report submitted on ' || d.dt || ' at ' || d.tm || ' has been reviewed.'
           when 'ru' then
             'Ваше обращение, направленное ' || d.dt || ' в ' || d.tm || ', было рассмотрено.'
           else
             d.dt || ' tarixində saat ' || d.tm || '-də ünvanladığınız sorğu araşdırılmışdır.'
         end
      || E'\n\n'
      || btrim(coalesce(p_body, ''), ' ' || chr(9) || chr(10) || chr(13))
      || E'\n\n'
      || case l.loc
           when 'en' then 'Thank you for your attention and understanding.'
           when 'ru' then 'Благодарим за внимание и понимание.'
           else 'Diqqətiniz və anlayışınız üçün təşəkkür edirik.'
         end
  from l, d;
$$;

comment on function public.question_report_reply_text(text, timestamptz, text) is
  'Assembles the notification a reporter receives when their report is resolved '
  'or dismissed: a generated opening line naming the filing date and time in '
  'Asia/Baku, the administrator''s own body, and a generated closing line — '
  'joined by blank lines, all in the locale the report was filed in. The single '
  'definition of that text; the admin panel preview is a pinned port of it.';

-- 010 line 88 runs `alter default privileges in schema public grant execute on
-- functions to anon, authenticated, service_role`, so a NEW function is
-- EXECUTE-able by anon AND authenticated unless all three are named. Revoking
-- "from public, anon" alone has shipped as a hole in this repository before.
-- Nothing outside the SECURITY DEFINER trigger below needs to call this.
revoke all on function public.question_report_reply_text(text, timestamptz, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A3. The notifier (backport -> 011, REPLACES the migration 117 body)
-- -----------------------------------------------------------------------------
-- Three changes, no more:
--
--   1. resolved / dismissed now send public.question_report_reply_text(...)
--      instead of a fixed sentence. The TITLES are unchanged — they still carry
--      the distinction between "we changed it" and "we checked it", which the
--      neutral opening line does not.
--   2. the send is REQUIRED to have something to say. A resolved or dismissed
--      transition whose resolution_message is missing or shorter than the
--      column's own floor RAISES, which aborts the UPDATE that fired it. This
--      is the trigger-side half of the owner's rule; the server action refuses
--      the same input first, and the column CHECK refuses a malformed one.
--
--      Deliberately NOT a table-level `status in ('resolved','dismissed')
--      implies resolution_message is not null` CHECK, tempting as that is. Such
--      a constraint is re-evaluated on EVERY update of the row — including the
--      ordinary UPDATE that `reporter_profile_id on delete set null` performs
--      when an account is deleted. Reports resolved before this migration carry
--      no message, so that constraint would make deleting such a reporter's
--      profile fail, and profile deletion cascades from a parent deleting a
--      child. The rule belongs where the transition is, not on every row
--      forever.
--   3. THE SWALLOW IS GONE. No `exception when others then raise warning`
--      around the send. A genuine failure now propagates out of the AFTER
--      trigger and aborts the transaction, so the status does not change and
--      the admin sees the action fail instead of a report that says "answered"
--      with nothing delivered. create_notification returning NULL — recipient
--      has in-app notifications off, or this exact reply was already sent — is
--      NOT a failure and commits normally.
--
-- The rest of the posture is migration 117's and is unchanged: SECURITY DEFINER
-- (create_notification is service_role-only while the admin firing this is an
-- `authenticated` caller), search_path pinned, no end-user EXECUTE.
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
  v_reply text;
  v_key   text;
begin
  -- No reporter profile = no inbox. This is not only the anonymous case: the
  -- FK is ON DELETE SET NULL, so a report whose author deleted their account
  -- survives with a NULL reporter and must never be "notified".
  if new.reporter_profile_id is null then
    return null;
  end if;

  v_loc := case when new.locale::text in ('en','ru') then new.locale::text else 'az' end;
  -- IDEMPOTENT per (report, status). The WHEN clause already suppresses a
  -- re-save of the same status; this is what survives the other shape of the
  -- mistake — in_review -> new -> in_review, which IS a transition and would
  -- otherwise notify a second time for the same news. Deduped by
  -- create_notification's on conflict (idempotency_key) do nothing.
  v_key := 'qreport:' || new.id::text || ':' || new.status::text;

  if new.status = 'in_review' then
    -- Unchanged by migration 122: this transition says only "we have it",
    -- there is nothing for an admin to write yet, and no composer is opened.
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

  elsif new.status in ('resolved','dismissed') then
    -- The reply is REQUIRED, and this is the last of three gates: the admin
    -- panel server action refuses an empty one, chk_question_reports_resolution
    -- _message refuses a malformed one, and a transition that reached here with
    -- nothing to say aborts.
    --
    -- Deliberately NOT a table-level `status in ('resolved','dismissed')
    -- implies resolution_message is not null` CHECK: such a constraint is
    -- re-evaluated on EVERY update of the row, including the ordinary UPDATE
    -- that `reporter_profile_id on delete set null` performs when an account is
    -- deleted — and reports resolved before migration 122 carry no message, so
    -- deleting their reporter would fail. The rule belongs on the transition.
    v_reply := btrim(coalesce(new.resolution_message, ''),
                     ' ' || chr(9) || chr(10) || chr(13));
    if char_length(v_reply) < 10 then
      raise exception
        'question report %: a % transition must carry a resolution_message of '
        'at least 10 characters — the reporter is told what an administrator '
        'wrote, and there is nothing to tell them', new.id, new.status
        using errcode = 'check_violation';
    end if;

    if new.status = 'resolved' then
      -- The TITLES still carry the distinction between "we changed it" and "we
      -- checked it", which the neutral generated opening line does not.
      v_type := 'question_report_resolved';
      if v_loc = 'en' then
        v_title := 'Your report is resolved';
      elsif v_loc = 'ru' then
        v_title := 'Сообщение обработано';
      else
        v_title := 'Bildirişin həll olundu';
      end if;
    else
      -- A dismissal is told to the reporter too, and told HONESTLY: we looked,
      -- and here is why nothing changed. Silence would be the cheaper option
      -- and the worse one — a student who reports a question and never hears
      -- anything concludes the report button does nothing and stops using it,
      -- which costs us the broken questions nobody else will find. The title
      -- carries no blame; the body is now the admin's own words.
      v_type := 'question_report_dismissed';
      if v_loc = 'en' then
        v_title := 'Your report was checked';
      elsif v_loc = 'ru' then
        v_title := 'Мы проверили твоё сообщение';
      else
        v_title := 'Bildirişin yoxlanıldı';
      end if;
    end if;

    v_body := public.question_report_reply_text(v_loc, new.created_at, v_reply);
    -- The reply text joins the key. Without it, an admin who reopens a report
    -- and closes it again with a CORRECTED answer delivers nothing: the
    -- (report, status) key was already spent on the first, wrong answer. With
    -- it, re-sending the SAME answer is still deduped — which is the property
    -- the key exists for — while a different answer is different news.
    v_key := v_key || ':' || md5(v_body);

  else
    -- Reopening a report to 'new' is an internal correction, not news.
    return null;
  end if;

  -- NO exception handler — see the note above this function.
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
    v_key,
    4,
    -- No action_url: the reporter has no screen that shows one report, and a
    -- deep link into nothing is worse than none. The notification carries the
    -- whole message.
    null,
    'announcement',
    null);

  return null;
end;
$$;

comment on function public.notify_question_report_status_tg() is
  'AFTER UPDATE on question_reports: notifies the REPORTER, in the locale they '
  'filed in, when an administrator takes their report into review, resolves it '
  'or dismisses it. A resolution or dismissal carries the administrator''s own '
  'written answer, framed by question_report_reply_text(); it is REQUIRED, and '
  'a failed send aborts the transition rather than leaving a report marked '
  'answered with nothing delivered. Idempotent per (report, status, reply text) '
  'via create_notification. Skips anonymous and deleted reporters.';

-- The trigger definition itself is unchanged (same name, same WHEN clause), but
-- `create or replace function` does not re-point it and a re-created trigger is
-- cheap, so it is re-asserted here for a database that somehow lost it.
drop trigger if exists trg_notify_question_report_status on public.question_reports;
create trigger trg_notify_question_report_status
  after update on public.question_reports
  for each row
  when (new.status is distinct from old.status
        and new.status in ('in_review','resolved','dismissed')
        and new.reporter_profile_id is not null)
  execute function public.notify_question_report_status_tg();

-- `create or replace function` PRESERVES the existing ACL, so this revoke is
-- carrying an existing grant state across a replacement, not adding a new one.
-- It is repeated because an ACL that is only ever set in an older migration is
-- an ACL a from-zero bootstrap can lose without anyone noticing.
revoke all on function public.notify_question_report_status_tg()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A4. The freeze trigger — COMMENT ONLY (backport -> 011)
-- -----------------------------------------------------------------------------
-- NOT ONE LINE OF BEHAVIOUR CHANGES HERE. The statements are migration 117's,
-- re-issued for two comment edits: the paragraph explaining why
-- resolution_message is NOT in the restore list, and the removal of a clause in
-- the dangling-reporter note that described the swallow A3 just deleted.
--
-- The omission is the whole mechanism by which the new column is writable, and
-- an omission with no comment on it reads as an oversight — the next person to
-- tidy this function would "complete" the list and silently make every reply
-- un-storable, with nothing failing: the UPDATE still succeeds and the status
-- still moves.
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
  -- triage of such a report.
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
  -- resolution_message is DELIBERATELY ABSENT from the list above (migration
  -- 122). This function freezes a report as EVIDENCE — what the student wrote,
  -- when, about which question — and the administrator's answer is not part of
  -- that evidence; it is the response to it, written after the fact by the only
  -- role that can update this table at all. Restoring it here would freeze it
  -- at NULL forever and every reply would be silently discarded on its way to
  -- the notifier, which reads new.resolution_message. Do not "complete" the
  -- list. admin_note is absent for exactly the same reason.
  if new.status is distinct from old.status then
    new.handled_by := public.current_profile_id();
    new.handled_at := now();
  end if;
  return new;
end;
$$;

comment on function public.question_report_freeze() is
  'BEFORE UPDATE on question_reports: only status, admin_note and '
  'resolution_message may change, and a status change stamps '
  'handled_by/handled_at. The reporter id is frozen EXCEPT against its own '
  '`on delete set null` cascade, which would otherwise be reverted into a '
  'dangling reference.';

-- Carried across the replacement explicitly (see A3): the freeze trigger is
-- INVOKER by design and nobody may call it directly.
revoke all on function public.question_report_freeze() from public, anon, authenticated;

-- =============================================================================
-- Verify
-- =============================================================================

-- The column, its constraint, and the fact that the freeze does NOT restore it.
do $$
declare v_def text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name   = 'question_reports'
                    and column_name  = 'resolution_message') then
    raise exception '122: question_reports.resolution_message is missing';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.question_reports'::regclass
                    and conname  = 'chk_question_reports_resolution_message') then
    raise exception '122: chk_question_reports_resolution_message is missing';
  end if;

  select pg_get_functiondef('public.question_report_freeze()'::regprocedure)
    into v_def;
  if position('new.resolution_message :=' in v_def) > 0 then
    raise exception
      '122: question_report_freeze restores resolution_message, so no reply '
      'could ever be stored';
  end if;
  if position('not exists (select 1 from public.profiles' in v_def) = 0 then
    raise exception
      '122: question_report_freeze lost migration 117''s dangling-reporter fix';
  end if;
end $$;

-- The assembler: all three languages, both fixed lines, Baku time, blank-line
-- joins — and no accidental EXECUTE grant.
do $$
declare v_def text;
begin
  if to_regprocedure('public.question_report_reply_text(text, timestamptz, text)')
     is null then
    raise exception '122: question_report_reply_text is missing';
  end if;
  v_def := pg_get_functiondef(
    'public.question_report_reply_text(text, timestamptz, text)'::regprocedure);

  if position('Asia/Baku' in v_def) = 0 then
    raise exception '122: the reply frame is not rendered in Asia/Baku';
  end if;
  if position('DD.MM.YYYY' in v_def) = 0 or position('HH24:MI' in v_def) = 0 then
    raise exception '122: the reply frame lost its date or time format';
  end if;
  if position(' tarixində saat ' in v_def) = 0
     or position('Your report submitted on ' in v_def) = 0
     or position('Ваше обращение, направленное ' in v_def) = 0 then
    raise exception '122: the opening line is not trilingual';
  end if;
  if position('Diqqətiniz və anlayışınız üçün təşəkkür edirik.' in v_def) = 0
     or position('Thank you for your attention and understanding.' in v_def) = 0
     or position('Благодарим за внимание и понимание.' in v_def) = 0 then
    raise exception '122: the closing line is not trilingual';
  end if;
  if has_function_privilege('anon',
       'public.question_report_reply_text(text, timestamptz, text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.question_report_reply_text(text, timestamptz, text)', 'EXECUTE') then
    raise exception '122: question_report_reply_text is EXECUTE-able by an end user';
  end if;
end $$;

-- The assembler actually assembles: opening, blank line, body, blank line,
-- closing — in the report's language, at Baku wall-clock time. 2026-08-19
-- 05:30 UTC is 09:30 in Baku, which is what a student must read.
do $$
declare
  v_at  timestamptz := timestamptz '2026-08-19 05:30:00+00';
  v_az  text;
  v_en  text;
  v_ru  text;
begin
  v_az := public.question_report_reply_text('az', v_at, '  Sualın düzgün cavabı B-dir, düzəldildi.  ');
  v_en := public.question_report_reply_text('en', v_at, 'The answer key was wrong and is now fixed.');
  v_ru := public.question_report_reply_text('ru', v_at, 'Ключ ответа был неверным, мы его исправили.');

  if v_az <> '19.08.2026 tarixində saat 09:30-də ünvanladığınız sorğu araşdırılmışdır.'
             || E'\n\n' || 'Sualın düzgün cavabı B-dir, düzəldildi.'
             || E'\n\n' || 'Diqqətiniz və anlayışınız üçün təşəkkür edirik.' then
    raise exception '122: the az reply does not assemble as specified: %', v_az;
  end if;
  if v_en <> 'Your report submitted on 19.08.2026 at 09:30 has been reviewed.'
             || E'\n\n' || 'The answer key was wrong and is now fixed.'
             || E'\n\n' || 'Thank you for your attention and understanding.' then
    raise exception '122: the en reply does not assemble as specified: %', v_en;
  end if;
  if v_ru <> 'Ваше обращение, направленное 19.08.2026 в 09:30, было рассмотрено.'
             || E'\n\n' || 'Ключ ответа был неверным, мы его исправили.'
             || E'\n\n' || 'Благодарим за внимание и понимание.' then
    raise exception '122: the ru reply does not assemble as specified: %', v_ru;
  end if;

  -- An unknown locale falls back to az rather than emitting an empty frame.
  if public.question_report_reply_text('tr', v_at, 'On karakterden uzun.')
     <> public.question_report_reply_text('az', v_at, 'On karakterden uzun.') then
    raise exception '122: an unknown locale does not fall back to az';
  end if;
end $$;

-- The notifier: composes the reply, requires it, and no longer swallows.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef(
    'public.notify_question_report_status_tg()'::regprocedure);

  if position('question_report_reply_text' in v_def) = 0 then
    raise exception '122: the notifier does not send the composed reply';
  end if;
  if position('exception when others' in v_def) > 0 then
    raise exception
      '122: the notifier still swallows a failed send — a resolved report '
      'could commit with nothing delivered';
  end if;
  if position('raise warning' in v_def) > 0 then
    raise exception '122: the notifier still downgrades a failed send to a warning';
  end if;
  if position('resolution_message' in v_def) = 0 then
    raise exception '122: the notifier does not require a resolution message';
  end if;
  -- Migration 117's invariants must all survive this replacement.
  if position('create_notification' in v_def) = 0
     or position('''qreport:'' || new.id::text' in v_def) = 0
     or position('reporter_profile_id is null' in v_def) = 0 then
    raise exception '122: the notifier lost one of migration 117''s invariants';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname  = 'trg_notify_question_report_status'
                    and tgrelid = 'public.question_reports'::regclass
                    and not tgisinternal) then
    raise exception '122: trg_notify_question_report_status is not attached';
  end if;
  if has_function_privilege('anon',
       'public.notify_question_report_status_tg()', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.notify_question_report_status_tg()', 'EXECUTE') then
    raise exception '122: the notifier is EXECUTE-able by an end user';
  end if;
end $$;

-- The CHECK is the shape the server action and the notifier both assume: NULL
-- is allowed (a report resolved before this migration, and every open report),
-- anything else is a TRIMMED body of 10..1000 characters. Asserted from the
-- constraint's own definition rather than by writing a probe row — a migration
-- that UPDATEs a live report to test a constraint is a migration that stamps
-- updated_at on someone's evidence to prove a point it can read off the catalog.
do $$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.question_reports'::regclass
     and c.conname  = 'chk_question_reports_resolution_message';
  if v_def is null then
    raise exception '122: chk_question_reports_resolution_message is missing';
  end if;
  if position('btrim' in v_def) = 0 then
    raise exception
      '122: the resolution_message CHECK does not trim, so ten spaces would '
      'pass as a ten-character answer';
  end if;
  if position('10' in v_def) = 0 or position('1000' in v_def) = 0 then
    raise exception '122: the resolution_message CHECK lost one of its bounds';
  end if;
end $$;

commit;

-- =============================================================================
-- End of 2026_08_19_122_question_report_reply.sql
-- =============================================================================
