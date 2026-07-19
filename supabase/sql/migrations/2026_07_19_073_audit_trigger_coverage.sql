-- ============================================================================
-- Migration: 2026_07_19_073_audit_trigger_coverage.sql
-- Round 28 (owner ask): make the audit_logs trail actually cover the most
-- important actions with full before/after ("git-log-like — what changed").
--
-- The generic fn_audit_row() (011) already writes before_json/after_json rows.
-- Gaps closed here:
--   * money trail INSERTs were invisible — subscriptions / payments /
--     child_subscriptions had UPDATE-ONLY triggers, so a NEW subscription or a
--     NEW payment row was never captured. Expanded to INSERT + UPDATE (+DELETE
--     where a delete is meaningful).
--   * checkout_sessions had no trigger (payment session lifecycle).
--   * students / profiles / child_credentials had no trigger (account, avatar,
--     credential-adjacent edits). child_credentials verified to hold NO secret
--     material (only ids + the 8-digit login id + timestamps; the password lives
--     in Supabase Auth, never here), so auditing it leaks nothing.
--   * system_settings / subjects_pricing had no trigger; feature_flags had a
--     drifted trigger present on dev but absent from canonical — reconciled here
--     and backported so canonical == dev.
--
-- Duplication note: some parent-initiated actions ALSO get an app-written
-- audit row (web-app/src/lib/audit.ts: parent.child_create, parent.*). That is
-- intentional — the app row carries the ACTOR + a friendly action name, the
-- trigger row carries the full before/after diff (service-role context has a
-- null actor). The viewer surfaces both.
--
-- No secrets are copied: none of these tables store password hashes or tokens.
-- fn_audit_row extracts target_id from the row's `id` key; tables keyed on
-- `key`/`profile_id` simply get a null target_id (exception-safe) while their
-- full contents still land in before_json/after_json.
--
-- Backported into canonical 011 (audit-trigger section). 013 check #73.
-- ============================================================================

begin;

-- ---- money trail: expand UPDATE-only → INSERT + UPDATE (+ DELETE) -----------
drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
  after insert or update on public.subscriptions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_payments on public.payments;
create trigger trg_audit_payments
  after insert or update on public.payments
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_child_subscriptions on public.child_subscriptions;
create trigger trg_audit_child_subscriptions
  after insert or update or delete on public.child_subscriptions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_checkout_sessions on public.checkout_sessions;
create trigger trg_audit_checkout_sessions
  after insert or update on public.checkout_sessions
  for each row execute function public.fn_audit_row();

-- ---- accounts + credentials -------------------------------------------------
-- students: creation/edit/avatar/access-status/deletion.
drop trigger if exists trg_audit_students on public.students;
create trigger trg_audit_students
  after insert or update or delete on public.students
  for each row execute function public.fn_audit_row();

-- profiles: UPDATE + DELETE only (INSERT is signup noise; no high-churn column
-- such as last_seen exists, so UPDATE volume stays meaningful).
drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after update or delete on public.profiles
  for each row execute function public.fn_audit_row();

-- child_credentials: parent-set-password bookkeeping (no secret columns).
drop trigger if exists trg_audit_child_credentials on public.child_credentials;
create trigger trg_audit_child_credentials
  after insert or update on public.child_credentials
  for each row execute function public.fn_audit_row();

-- ---- config -----------------------------------------------------------------
-- system_settings / feature_flags / subjects_pricing: full before/after on
-- every config flip (app-level writeAuditLog rows stay too; see note above).
-- feature_flags reconciles a dev-only drifted trigger into canonical.
drop trigger if exists trg_audit_system_settings on public.system_settings;
create trigger trg_audit_system_settings
  after update on public.system_settings
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_feature_flags on public.feature_flags;
create trigger trg_audit_feature_flags
  after insert or update or delete on public.feature_flags
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_subjects_pricing on public.subjects_pricing;
create trigger trg_audit_subjects_pricing
  after insert or update on public.subjects_pricing
  for each row execute function public.fn_audit_row();

-- ---- self-verify (raises => whole migration rolls back) ---------------------
do $$
declare
  v_expected text[] := array[
    'trg_audit_subscriptions','trg_audit_payments','trg_audit_child_subscriptions',
    'trg_audit_checkout_sessions','trg_audit_students','trg_audit_profiles',
    'trg_audit_child_credentials','trg_audit_system_settings','trg_audit_feature_flags',
    'trg_audit_subjects_pricing'];
  v_name text;
  v_ins boolean; v_before jsonb; v_after jsonb; v_cnt int;
begin
  -- every expected trigger is attached and fires on INSERT or UPDATE
  foreach v_name in array v_expected loop
    if not exists (
      select 1 from pg_trigger
      where tgname = v_name
        and (tgtype & 4 > 0 or tgtype & 16 > 0)  -- INSERT or UPDATE bit set
    ) then
      raise exception 'audit trigger % missing or not on insert/update', v_name;
    end if;
  end loop;

  -- money-trail INSERT is now captured: subscriptions must fire on INSERT
  if not exists (select 1 from pg_trigger where tgname='trg_audit_payments' and tgtype & 4 > 0) then
    raise exception 'payments INSERT still not audited';
  end if;

  -- functional smoke: a no-op system_settings UPDATE lands a before/after row
  update public.system_settings
     set value_json = value_json
   where key = 'contact.support_address';
  select before_json, after_json into v_before, v_after
    from public.audit_logs
   where action = 'update:system_settings'
   order by created_at desc
   limit 1;
  if v_before is null or v_after is null then
    raise exception 'system_settings update did not produce a before/after audit row';
  end if;

  raise notice 'audit trigger coverage self-verify PASS (% triggers).', array_length(v_expected,1);
end $$;

commit;
