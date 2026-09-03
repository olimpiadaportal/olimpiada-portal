-- =============================================================================
-- 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 011 of 013.
--
-- Responsibility : Performance indexes, deferred cross-file foreign keys,
--                  updated_at maintenance, and the audit-logging trigger
--                  foundation.
-- Run order      : After 010 (all tables/policies exist). Before 012.
-- Safe to rerun  : Yes. CREATE INDEX IF NOT EXISTS; constraints use
--                  DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (idempotent,
--                  non-data-destructive); CREATE OR REPLACE FUNCTION; triggers
--                  use DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--
-- NOTE: The security/permission helper functions (is_admin, has_permission, ...)
-- live in 002 because 010 needs them. This file adds only the trigger/utility
-- functions and the forward FKs that could not be created earlier without
-- breaking numeric run order.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Deferred cross-file foreign keys (targets created in later-numbered files).
-- -----------------------------------------------------------------------------
-- students.* -> taxonomy (003)
alter table public.students drop constraint if exists fk_students_grade;
alter table public.students add constraint fk_students_grade
  foreign key (grade_id) references public.grades (id) on delete set null;

alter table public.students drop constraint if exists fk_students_school;
alter table public.students add constraint fk_students_school
  foreign key (school_id) references public.schools (id) on delete set null;

alter table public.students drop constraint if exists fk_students_district;
alter table public.students add constraint fk_students_district
  foreign key (district_id) references public.districts (id) on delete set null;

-- Round 21: the intra-city district (rayon) stored on the child profile
-- (guard-enforced to match the school's rayon; leaderboard fallback).
alter table public.students drop constraint if exists fk_students_city_district;
alter table public.students add constraint fk_students_city_district
  foreign key (city_district_id) references public.city_districts (id) on delete set null;
create index if not exists idx_students_city_district on public.students (city_district_id);

-- profile / content media -> media_assets (008)
alter table public.profiles drop constraint if exists fk_profiles_avatar_media;
alter table public.profiles add constraint fk_profiles_avatar_media
  foreign key (avatar_media_id) references public.media_assets (id) on delete set null;

alter table public.question_translations drop constraint if exists fk_qtrans_media;
alter table public.question_translations add constraint fk_qtrans_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

alter table public.question_explanations drop constraint if exists fk_qexpl_media;
alter table public.question_explanations add constraint fk_qexpl_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

-- Migration 102: the ANSWER-OPTION image. Same ON DELETE SET NULL as the
-- question figure above — deleting an asset blanks the link, it must never
-- cascade away a live answer option.
alter table public.answer_option_translations drop constraint if exists fk_aotrans_media;
alter table public.answer_option_translations add constraint fk_aotrans_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;
-- Partial: only a minority of options ever carry an image.
create index if not exists idx_aotrans_media
  on public.answer_option_translations (media_asset_id)
  where media_asset_id is not null;

-- wallpapers (003) -> media_assets (008) for the image-kind catalog entries.
alter table public.wallpapers drop constraint if exists fk_wallpapers_media;
alter table public.wallpapers add constraint fk_wallpapers_media
  foreign key (media_asset_id) references public.media_assets (id) on delete set null;

-- sticker_images (003) -> media_assets (008) + sticker_themes.created_by ->
-- profiles (Round 11, migration 026). Guarded by RELATION-PAIR existence (not
-- constraint name): migration 026 created these inline on dev with the default
-- names, and a name-keyed drop+add here would produce a DUPLICATE FK — the
-- exact PGRST201 embed-ambiguity bug fixed in Round 9 (check #30 class).
do $$ begin
  if not exists (select 1 from pg_constraint
                  where contype = 'f'
                    and conrelid = 'public.sticker_images'::regclass
                    and confrelid = 'public.media_assets'::regclass) then
    alter table public.sticker_images add constraint fk_sticker_images_media
      foreign key (media_asset_id) references public.media_assets (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint
                  where contype = 'f'
                    and conrelid = 'public.sticker_themes'::regclass
                    and confrelid = 'public.profiles'::regclass) then
    alter table public.sticker_themes add constraint fk_sticker_themes_created_by
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Indexes (foreign-key lookups, status filters, search).
-- -----------------------------------------------------------------------------
create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profile_roles_role on public.profile_roles (role_id);
create index if not exists idx_role_permissions_perm on public.role_permissions (permission_id);

create index if not exists idx_students_grade on public.students (grade_id);
create index if not exists idx_students_school on public.students (school_id);
create index if not exists idx_students_created_by_parent on public.students (created_by_parent_profile_id);
create index if not exists idx_psl_student on public.parent_student_links (student_profile_id);
create index if not exists idx_psl_parent_status on public.parent_student_links (parent_profile_id, status);

create index if not exists idx_schools_district on public.schools (district_id);
create index if not exists idx_topics_subject_grade on public.topics (subject_id, grade_id);
create index if not exists idx_subtopics_topic on public.subtopics (topic_id);

create index if not exists idx_questions_status on public.questions (status);
create index if not exists idx_questions_subject on public.questions (subject_id);
create index if not exists idx_questions_grade on public.questions (grade_id);
create index if not exists idx_questions_topic on public.questions (topic_id);
create index if not exists idx_questions_created_by on public.questions (created_by);
create index if not exists idx_questions_primary_locale on public.questions (primary_locale);
-- Audit M23 (migration 035): the admin list's type/subtopic filters need index
-- support. The companion (olympiad_package_id, created_at desc) index lives in
-- 015 — questions.olympiad_package_id is added there (FKs olympiad_packages).
create index if not exists idx_questions_type on public.questions (type_id);
create index if not exists idx_questions_subtopic on public.questions (subtopic_id);
-- School-term filter (migration 054): daily-round pool + admin review lists.
create index if not exists idx_questions_term on public.questions (term);
-- trigram search over localized question bodies (pg_trgm from 001).
create index if not exists idx_qtrans_body_trgm
  on public.question_translations using gin (body gin_trgm_ops);

create index if not exists idx_answer_options_question on public.answer_options (question_id);
create index if not exists idx_tests_status on public.tests (status);
create index if not exists idx_test_questions_question on public.test_questions (question_id);

create index if not exists idx_attempts_student on public.test_attempts (student_profile_id);
create index if not exists idx_attempts_test on public.test_attempts (test_id);
create index if not exists idx_attempts_status on public.test_attempts (status);
-- Practice/daily attempts filtered by subject (Stage 13 test engine).
create index if not exists idx_test_attempts_subject on public.test_attempts (subject_id);
create index if not exists idx_answers_attempt on public.test_attempt_answers (attempt_id);
-- Round 21: delete-guard lookups + review joins.
create index if not exists idx_answers_question on public.test_attempt_answers (question_id);
-- Timed topic tests (migration 037): one open test per child + expiry sweep.
create unique index if not exists uq_test_attempts_open_test
  on public.test_attempts (student_profile_id, subject_id)
  where kind = 'test' and status = 'in_progress';
-- ---------------------------------------------------------------------------
-- MIGRATION 145 - indexes for the read-only finance / support view.
-- ---------------------------------------------------------------------------
-- payments — the view's primary object, and the least indexed table in it.
-- Only two indexes exist today (profile_id, status), neither composite with
-- time, and the finance list is time-ordered in every branch.
-- -----------------------------------------------------------------------------
create index if not exists idx_payments_created
  on public.payments (created_at desc);

-- A bare status index is a five-value enum the planner will usually decline;
-- paired with time it serves "recent failures", which is a real support query.
create index if not exists idx_payments_status_created
  on public.payments (status, created_at desc);

-- idx_payments_profile exists but is not composite with time, so the family
-- timeline sorts in memory without this.
create index if not exists idx_payments_profile_created
  on public.payments (profile_id, created_at desc);

-- Both of these are FOREIGN KEYS WITH NO INDEX. Postgres does not create one
-- automatically, and an unindexed FK also makes every DELETE on the parent row
-- scan this table.
create index if not exists idx_payments_checkout_session
  on public.payments (checkout_session_id)
  where checkout_session_id is not null;

create index if not exists idx_payments_olympiad_purchase
  on public.payments (olympiad_purchase_id)
  where olympiad_purchase_id is not null;

-- -----------------------------------------------------------------------------
-- checkout_sessions — idx_checkout_owner exists but is not composite with time.
-- The three partial indexes already on this table (child filter,
-- paid-unredeemed, needs-review) are exact matches for the attention strip and
-- are deliberately REUSED, not duplicated.
-- -----------------------------------------------------------------------------
create index if not exists idx_checkout_owner_created
  on public.checkout_sessions (owner_parent_profile_id, created_at desc);

-- -----------------------------------------------------------------------------
-- payment_events — the only usable index today is uq_payment_event, which is
-- keyed on (provider, event_id). That serves an exact event lookup and nothing
-- else.
--
-- The order detail must ALSO find rows whose event_id cannot be derived from
-- the order string: the `note:<order>:<md5>` chain and the `rrn:` / `intref:`
-- claim rows. Those carry the order inside the payload instead, so the
-- expression index is what makes that query an index hit rather than a scan of
-- every event ever recorded.
-- -----------------------------------------------------------------------------
create index if not exists idx_payment_events_order
  on public.payment_events (provider, (payload_json ->> 'order'));

create index if not exists idx_test_attempts_deadline
  on public.test_attempts (deadline_at)
  where status = 'in_progress';

create index if not exists idx_snap_student_period on public.progress_snapshots (student_profile_id, period);

create index if not exists idx_lb_entries_period on public.leaderboard_entries (period_id);
create index if not exists idx_lb_entries_student on public.leaderboard_entries (student_profile_id);
-- NULL-safe uniqueness for leaderboard entries (scope_id is NULL for 'global').
create unique index if not exists uq_leaderboard_entry_scope
  on public.leaderboard_entries
  (period_id, student_profile_id, scope_type,
   coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_subs_owner on public.subscriptions (owner_profile_id);
create index if not exists idx_subs_student on public.subscriptions (student_profile_id);
create index if not exists idx_subs_status on public.subscriptions (status);
create index if not exists idx_payments_profile on public.payments (profile_id);
create index if not exists idx_payments_status on public.payments (status);

-- Child-based subscriptions / subject pricing / checkout (Stage 7, increment 2).
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
create index if not exists idx_child_subs_student on public.child_subscriptions (student_profile_id);
create index if not exists idx_child_subs_owner on public.child_subscriptions (owner_parent_profile_id);
create index if not exists idx_child_subs_status on public.child_subscriptions (status);
-- Audit C2 (migration 035): at most ONE live subscription per child, enforced
-- by the DB (create_child_subscription also guards + advisory-locks per family).
create unique index if not exists uq_child_subscriptions_live
  on public.child_subscriptions (student_profile_id)
  where status in ('trialing', 'active', 'past_due');
create index if not exists idx_sub_subjects_subject on public.subscription_subjects (subject_id);
-- Migration 109: each subject owns its own period, so the access gates and the
-- expiry scan both look up (subscription, period end); next_renewal_at is the
-- MIN over those, scanned only for live plans.
create index if not exists idx_sub_subjects_period
  on public.subscription_subjects (child_subscription_id, current_period_end);
create index if not exists idx_child_subs_next_renewal
  on public.child_subscriptions (next_renewal_at)
  where status in ('trialing', 'active', 'past_due');
create index if not exists idx_checkout_owner on public.checkout_sessions (owner_parent_profile_id);
-- Migration 123: a merchant order id is unique per provider.
-- The AzeriCard gateway spec says the last six digits of ORDER are the system
-- trace audit number and must be unique per terminal per day. We mint
-- YYYYMMDD + six CSPRNG digits, which makes the day part structural but leaves
-- the six digits to chance -- ~39% odds of at least one collision at a thousand
-- orders a day, and a collision would let the TRTYPE 90 status query for one
-- payment answer about another. "Check then insert" cannot close it (two
-- concurrent requests both see the gap), so the mint loop inserts and retries
-- on 23505 and THIS index is what makes that correct. Partial + provider-keyed
-- so providers can never collide with each other's id space.
create unique index if not exists uq_checkout_provider_session
  on public.checkout_sessions (provider, provider_session_id)
  where provider_session_id is not null;
-- Checkout INTENT (migration 125). All three are PARTIAL, and all three exist
-- to answer an operational question fast on a table that is otherwise written
-- once per purchase.
create index if not exists idx_checkout_intent_student
  on public.checkout_sessions (student_profile_id, created_at desc)
  where intent_kind is not null;
-- "Money taken, nothing delivered" — 013 check 118 reads exactly this.
create index if not exists idx_checkout_paid_unredeemed
  on public.checkout_sessions (created_at desc)
  where status = 'paid' and intent_kind is not null and redeemed_at is null;
-- "A human owes this family an answer."
create index if not exists idx_checkout_needs_review
  on public.checkout_sessions (created_at desc)
  where redemption_status = 'needs_review';
create index if not exists idx_sibling_discounts_owner on public.sibling_discounts (owner_parent_profile_id);

-- Entitlements (migration 124). Seven indexes, each doing one job.
--
-- NOTE ON THE PARTIAL PREDICATES: they use only IMMUTABLE terms. Do NOT
-- "optimise" idx_entitlements_subject_live to `where ends_at > now()` — that
-- raises "functions in index predicate must be IMMUTABLE", and it raises it at
-- rebuild time on a fresh database rather than in review.
--
-- Producer idempotency AND the upsert conflict target. One index, both jobs.
create unique index if not exists uq_entitlements_source_ref
  on public.entitlements (source, external_ref);

-- HOT PATH 1: the subject gate (has_subject_access).
create index if not exists idx_entitlements_subject_live
  on public.entitlements (student_profile_id, subject_id, ends_at)
  where scope = 'subject' and revoked_at is null;

-- HOT PATH 2: the olympiad gate (live_package_entitlement).
create index if not exists idx_entitlements_package_live
  on public.entitlements (student_profile_id, package_id)
  where scope = 'olympiad_package' and revoked_at is null;

-- Catalog visibility (can_view_olympiad_package) — revocation-blind ON PURPOSE,
-- because that branch is status-blind today and a refunded family must not
-- silently lose the catalog row under a refactor.
create index if not exists idx_entitlements_package_any
  on public.entitlements (package_id, student_profile_id)
  where scope = 'olympiad_package';

-- Mirror scope + reconciliation joins.
create index if not exists idx_entitlements_child_sub
  on public.entitlements (child_subscription_id) where child_subscription_id is not null;
create index if not exists idx_entitlements_purchase
  on public.entitlements (olympiad_purchase_id)  where olympiad_purchase_id is not null;

-- Lapse scanners / dunning.
create index if not exists idx_entitlements_ends_at
  on public.entitlements (ends_at) where revoked_at is null and ends_at is not null;

-- THE ABSENCE IS THE DESIGN: there is deliberately no unique index on
-- (student_profile_id, subject_id) or (student_profile_id, package_id). A
-- well-meaning future "dedup" index there would make double-sourcing
-- impossible and the failure would only surface on forced-IAP day. 013 check
-- 111 asserts no such index exists.

create index if not exists idx_notifications_recipient on public.notifications (recipient_profile_id, read_at);
create index if not exists idx_support_profile_status on public.support_requests (profile_id, status);
create index if not exists idx_media_owner on public.media_assets (owner_profile_id);

create index if not exists idx_audit_actor on public.audit_logs (actor_profile_id);
create index if not exists idx_audit_action on public.audit_logs (action);
create index if not exists idx_audit_created on public.audit_logs (created_at);

-- -----------------------------------------------------------------------------
-- updated_at maintenance function + triggers.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','permissions','parents','students','parent_student_links',
    'districts','city_districts','schools','grades','subjects','topics','subtopics',
    'topic_translations','subtopic_translations',
    'question_types','difficulty_levels','olympiad_types','sources',
    'questions','question_translations','answer_options','answer_option_translations',
    'question_explanations','tests',
    'test_attempts','test_attempt_answers','progress_snapshots',
    'leaderboard_periods','leaderboard_entries',
    'achievements','question_analytics',
    'subscription_plans','subscriptions','payments','coupons','entitlements',
    'notification_templates','notification_deliveries','support_requests',
    'question_reports',
    'admin_actions','content_reviews','media_assets','system_settings','feature_flags'
  ]
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Audit logging foundation.
-- A generic SECURITY DEFINER trigger writes append-only rows into audit_logs
-- (bypassing RLS, which is intended). Attached to the most sensitive tables as
-- a foundation; more actions are added in later feature stages.
-- -----------------------------------------------------------------------------
create or replace function public.fn_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target uuid;
begin
  v_actor := public.current_profile_id();
  v_target := case
                when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
                else (to_jsonb(new) ->> 'id')::uuid
              end;

  insert into public.audit_logs(
    actor_profile_id, action, target_table, target_id,
    before_json, after_json, severity, success)
  values (
    v_actor,
    lower(tg_op) || ':' || tg_table_name,
    tg_table_name,
    v_target,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    'info',
    true
  );

  return case when tg_op = 'DELETE' then old else new end;
exception
  when others then
    -- Auditing must never break the underlying business transaction.
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Attach audit triggers to sensitive tables (role assignment, links, money).
drop trigger if exists trg_audit_profile_roles on public.profile_roles;
create trigger trg_audit_profile_roles
  after insert or delete on public.profile_roles
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_parent_student_links on public.parent_student_links;
create trigger trg_audit_parent_student_links
  after insert or update or delete on public.parent_student_links
  for each row execute function public.fn_audit_row();

-- Money trail (migration 073): INSERT+UPDATE so NEW subscription/payment rows
-- are captured, not just status transitions.
drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
  after insert or update on public.subscriptions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_payments on public.payments;
create trigger trg_audit_payments
  after insert or update on public.payments
  for each row execute function public.fn_audit_row();

-- Content actions (create/edit/archive/publish/etc.) — backported from
-- migrations/2026_06_27_003_content_audit_triggers.sql.
drop trigger if exists trg_audit_questions on public.questions;
create trigger trg_audit_questions
  after insert or update or delete on public.questions
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_tests on public.tests;
create trigger trg_audit_tests
  after insert or update or delete on public.tests
  for each row execute function public.fn_audit_row();

-- Round-28 audit coverage (migration 073): money trail, accounts, credentials
-- and config get full before/after rows. child_credentials holds NO secret
-- material (password lives in Supabase Auth). Tables keyed on key/profile_id
-- get a null target_id; their contents still land in before_json/after_json.
drop trigger if exists trg_audit_checkout_sessions on public.checkout_sessions;
create trigger trg_audit_checkout_sessions
  after insert or update on public.checkout_sessions
  for each row execute function public.fn_audit_row();
-- -----------------------------------------------------------------------------
-- THE CHECKOUT INTENT IS FROZEN ONCE IT EXISTS (migration 125).
--
-- What the parent authorised is EVIDENCE. Everything that decides what will be
-- delivered, and for how much, is immutable from the moment the session is
-- opened: an UPDATE that moved the basket or the amount would let a signed
-- payment deliver something else entirely, and the gateway signature would
-- still verify.
--
-- TWO DELIBERATE HOLES, both one-way:
--   * student_profile_id may go to NULL, because the FK's ON DELETE SET NULL is
--     an UPDATE and blocking it would make deleting a child impossible. It can
--     never be re-pointed at another child.
--   * redemption_status may move OFF 'needs_review', because that is exactly
--     what an operator resolving one does. It can never move off 'applied', and
--     redeemed_at can never be cleared -- so a delivered plan cannot be made to
--     look undelivered.
-- -----------------------------------------------------------------------------
create or replace function public.fn_checkout_intent_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.intent_kind is null then
    return new;                      -- no intent: nothing to protect
  end if;

  if new.intent_kind             is distinct from old.intent_kind
     or new.intent_items         is distinct from old.intent_items
     or new.intent_delta         is distinct from old.intent_delta
     or new.amount               is distinct from old.amount
     or new.currency             is distinct from old.currency
     or new.kind                 is distinct from old.kind
     or new.provider             is distinct from old.provider
     or new.provider_session_id  is distinct from old.provider_session_id
     or new.expires_at           is distinct from old.expires_at
     or new.owner_parent_profile_id is distinct from old.owner_parent_profile_id
     or (new.student_profile_id is distinct from old.student_profile_id
         and new.student_profile_id is not null)
  then
    raise exception 'checkout: the intent and its price are frozen once opened'
      using errcode = 'check_violation', hint = 'checkout_intent_frozen';
  end if;

  if old.redeemed_at is not null
     and (new.redeemed_at is null
          -- delivered_items is written EXACTLY ONCE, by the statement that
          -- stamps redeemed_at. After that it is the record a reversal revokes
          -- from, so an UPDATE that moved it would let a refund take back a
          -- subject some other payment paid for -- the mirror of the defect
          -- the column exists to close.
          or new.delivered_items is distinct from old.delivered_items
          or (old.redemption_status = 'applied'
              and new.redemption_status is distinct from old.redemption_status))
  then
    raise exception 'checkout: a decided redemption cannot be undone'
      using errcode = 'check_violation', hint = 'checkout_redemption_decided';
  end if;

  return new;
end;
$$;

comment on function public.fn_checkout_intent_immutable() is
  'Migration 125/127. Freezes the signed intent (child, basket, DELTA, amount, '
  'currency, order, expiry, owner), forbids un-deciding a redemption, and pins '
  'delivered_items once written -- it is what a reversal takes back, so moving '
  'it would let a refund revoke a subject another payment paid for. Two '
  'one-way exceptions: the FK cascade may NULL student_profile_id, and an '
  'operator may move a needs_review to applied.';

-- A trigger function is never called directly. Line 88 of 010 default-grants
-- EXECUTE to anon AND authenticated, so all three are named here.
revoke all on function public.fn_checkout_intent_immutable()
  from public, anon, authenticated;

drop trigger if exists trg_checkout_intent_immutable on public.checkout_sessions;
create trigger trg_checkout_intent_immutable
  before update on public.checkout_sessions
  for each row execute function public.fn_checkout_intent_immutable();


drop trigger if exists trg_audit_students on public.students;
create trigger trg_audit_students
  after insert or update or delete on public.students
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after update or delete on public.profiles
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_child_credentials on public.child_credentials;
create trigger trg_audit_child_credentials
  after insert or update on public.child_credentials
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_system_settings on public.system_settings;
create trigger trg_audit_system_settings
  after update on public.system_settings
  for each row execute function public.fn_audit_row();

-- feature_flags: reconciles a dev-only drifted trigger into canonical.
drop trigger if exists trg_audit_feature_flags on public.feature_flags;
create trigger trg_audit_feature_flags
  after insert or update or delete on public.feature_flags
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_audit_subjects_pricing on public.subjects_pricing;
create trigger trg_audit_subjects_pricing
  after insert or update on public.subjects_pricing
  for each row execute function public.fn_audit_row();

-- -----------------------------------------------------------------------------
-- Child account business-logic functions & triggers (Stage 7).
-- -----------------------------------------------------------------------------
-- 8-digit child ID generator: random, collision-safe, server-side. Inserts into
-- the child_unique_ids registry (002) under uniqueness and retries on collision,
-- then stamps students.child_unique_id. SECURITY DEFINER so it can write the
-- RLS-protected registry; never trust a client-provided ID. Idempotent for an
-- already-allocated child (audit M26) and service-role only (audit H1 — this was
-- the one DEFINER RPC without an explicit revoke, so 010's default privileges
-- made it anon/authenticated-executable).
create or replace function public.allocate_child_unique_id(p_student_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
  tries int := 0;
begin
  -- Idempotent: a child that already holds a registry row keeps its ID.
  select child_unique_id into v_id
  from public.child_unique_ids
  where student_profile_id = p_student_profile_id;
  if v_id is not null then
    update public.students set child_unique_id = v_id
     where profile_id = p_student_profile_id
       and child_unique_id is distinct from v_id;
    return v_id;
  end if;

  loop
    tries := tries + 1;
    -- 10000000..99999999 (no leading zero), ~90M space.
    v_id := (10000000 + floor(random() * 90000000))::bigint::text;
    begin
      insert into public.child_unique_ids (child_unique_id, student_profile_id)
      values (v_id, p_student_profile_id);
      update public.students set child_unique_id = v_id where profile_id = p_student_profile_id;
      return v_id;
    exception when unique_violation then
      if tries > 50 then
        raise exception 'Could not allocate a unique child ID after 50 attempts';
      end if;
      -- random-ID collision: loop and retry
    end;
  end loop;
end;
$$;

revoke all on function public.allocate_child_unique_id(uuid) from public, anon, authenticated;
grant execute on function public.allocate_child_unique_id(uuid) to service_role;

-- updated_at triggers for the child-account tables (not in the bulk array above).
drop trigger if exists trg_set_updated_at on public.child_credentials;
create trigger trg_set_updated_at before update on public.child_credentials
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.wallpapers;
create trigger trg_set_updated_at before update on public.wallpapers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.sticker_themes;
create trigger trg_set_updated_at before update on public.sticker_themes
  for each row execute function public.set_updated_at();
-- site_content (Round 12, migration 031): keep updated_at fresh on edits.
drop trigger if exists trg_set_updated_at on public.site_content;
create trigger trg_set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();
-- free_access_intervals (Round 12, migration 033).
drop trigger if exists trg_set_updated_at on public.free_access_intervals;
create trigger trg_set_updated_at before update on public.free_access_intervals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- MOBILE CONTROL PLANE (Stage M1, migration 045): mobile_app_versions triggers +
-- the two anon-callable whitelist readers the mobile app boots against.
-- feature_flags / system_settings / site_content are admin-RLS-locked, so these
-- SECURITY DEFINER functions are the ONLY public read path (never `select *`).
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.mobile_app_versions;
create trigger trg_set_updated_at before update on public.mobile_app_versions
  for each row execute function public.set_updated_at();
drop trigger if exists trg_audit_mobile_app_versions on public.mobile_app_versions;
create trigger trg_audit_mobile_app_versions
  after insert or update or delete on public.mobile_app_versions
  for each row execute function public.fn_audit_row();

-- get_mobile_config(): one JSON of everything the app gates itself with. The
-- payment MODE is resolved here with web paymentMode.ts parity: a missing
-- flag row means OFF (fail closed); the giveaway window expires LAZILY (the
-- flag alone is never enough); precedence giveaway(active) > real > off.
-- Migration 121 DELETED the fourth mode (demo): a demo_payments row can no
-- longer exist, so nothing here reads one.
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
  where key in ('payments','giveaway_period','news_public',
                'olympiad_module','leaderboard','notifications',
                'notifications_push','launch_promo');
  v_flags    := coalesce(v_flags, '{}'::jsonb);
  -- Round 51 (migration 091): missing flag row = OFF for the money gate too
  -- (fail closed; matches current_payment_mode and the web resolver).
  v_real     := coalesce((v_flags->>'payments')::boolean, false);
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
        -- contradict it. 'real' only — a giveaway window moves no money and
        -- touches no card data, so §8 must keep describing payments in the
        -- future tense while one is running.
        'push_live',               coalesce((v_flags->>'notifications_push')::boolean, false),
        'payments_live',           (v_mode = 'real')),
    'version', coalesce(v_version, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

-- get_mobile_content(locale): the site_content override map for ONE locale so
-- the admin "Website Content" CMS reaches the mobile app with zero releases
-- (web getT()/I18nProvider parity). Empty values are fallbacks and are omitted;
-- rows are registry-allowlisted at write time; a hard cap bounds the payload.
create or replace function public.get_mobile_content(p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(s.key, s.val), '{}'::jsonb)
  from (
    select key,
           case when p_locale = 'en' then en
                when p_locale = 'ru' then ru
                else az
           end as val
    from public.site_content
    order by key
    limit 500
  ) s
  where length(s.val) > 0;
$$;
revoke all on function public.get_mobile_content(text) from public;
grant execute on function public.get_mobile_content(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Character Sticker guard triggers (Round 11, migration 026; threshold raised
-- 5 -> 6 in migration 028): a theme may be ENABLED only with >= 6 images; an
-- enabled theme may not drop below 6. The child layer shows EXACTLY 6 unique
-- stickers (3 per side), so 6 distinct images are guaranteed. Business
-- invariants live in the DB, not only the admin UI.
-- -----------------------------------------------------------------------------
create or replace function public.fn_sticker_theme_enable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count int;
begin
  if new.is_enabled and not coalesce(old.is_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = new.id;
    if v_count < 6 then
      raise exception 'sticker theme needs at least 6 images to be enabled (has %)', v_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sticker_theme_enable_guard on public.sticker_themes;
create trigger trg_sticker_theme_enable_guard
  before update of is_enabled on public.sticker_themes
  for each row execute function public.fn_sticker_theme_enable_guard();

create or replace function public.fn_sticker_image_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_enabled boolean; v_count int;
begin
  select is_enabled into v_enabled from public.sticker_themes where id = old.theme_id;
  if coalesce(v_enabled, false) then
    select count(*) into v_count from public.sticker_images where theme_id = old.theme_id;
    if v_count - 1 < 6 then
      raise exception 'an enabled sticker theme must keep at least 6 images — disable the theme first'
        using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_sticker_image_delete_guard on public.sticker_images;
create trigger trg_sticker_image_delete_guard
  before delete on public.sticker_images
  for each row execute function public.fn_sticker_image_delete_guard();

-- -----------------------------------------------------------------------------
-- Child-based subscriptions / subject pricing (Stage 7, increment 2).
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
-- updated_at triggers (not in the bulk array above) + child-subscription audit.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.subjects_pricing;
create trigger trg_set_updated_at before update on public.subjects_pricing
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.child_subscriptions;
create trigger trg_set_updated_at before update on public.child_subscriptions
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.launch_promo_config;
create trigger trg_set_updated_at before update on public.launch_promo_config
  for each row execute function public.set_updated_at();

-- Audit subscription/payment status changes (money table).
-- Migration 073: INSERT+UPDATE+DELETE so a new child subscription is captured.
drop trigger if exists trg_audit_child_subscriptions on public.child_subscriptions;
create trigger trg_audit_child_subscriptions
  after insert or update or delete on public.child_subscriptions
  for each row execute function public.fn_audit_row();

-- Entitlements are money-adjacent: every grant, renewal, revocation and sweep
-- leaves an audit row (migration 124). This is also the only queryable history
-- of a grant once its student is deleted -- entitlements.student_profile_id
-- CASCADEs, while payments/olympiad_purchases deliberately SET NULL.
drop trigger if exists trg_audit_entitlements on public.entitlements;
create trigger trg_audit_entitlements
  after insert or update or delete on public.entitlements
  for each row execute function public.fn_audit_row();

-- Migration 109 — per-subject billing periods. child_subscriptions no longer
-- carries the billing dates itself: current_period_end is the MAX of the
-- subjects' period ends (coverage ends), next_renewal_at is the MIN (next
-- charge) and base/discount/total_amount are the NEXT invoice. This trigger is
-- their SINGLE writer; an RPC that also assigned them would drift from it
-- inside one release, which is the failure 013 check 92 recomputes against.
-- (The REVOKE/GRANT for this function lives with the other subscription-engine
-- grants further down, after 010's blanket grants.)
create or replace function public.fn_sync_subscription_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub  uuid;
  v_max  timestamptz;
  v_min  timestamptz;
  v_base numeric(12,2);
  v_pct  numeric(5,2);
begin
  -- OLD is UNASSIGNED (not null) during an INSERT, so reading it there raises
  -- "record old is not assigned yet" — branch on TG_OP rather than coalescing.
  if tg_op = 'DELETE' then
    v_sub := old.child_subscription_id;
  else
    v_sub := new.child_subscription_id;
  end if;
  if v_sub is null then return null; end if;

  select sibling_discount_percent into v_pct
  from public.child_subscriptions where id = v_sub;
  -- The parent row is gone (cascade delete): nothing to reconcile.
  if not found then return null; end if;

  select max(ss.current_period_end),
         min(ss.current_period_end) filter (where ss.remove_at is null)
    into v_max, v_min
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub;

  -- The NEXT invoice = the subjects whose cycle ends first. A NULL period end
  -- (legacy row that still inherits) falls into the group so the amount never
  -- silently drops a paid subject.
  select coalesce(sum(ss.price_amount), 0) into v_base
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub
    and ss.remove_at is null
    and (v_min is null or ss.current_period_end is not distinct from v_min);

  update public.child_subscriptions cs
     set current_period_end = coalesce(v_max, cs.current_period_end),
         next_renewal_at    = v_min,
         base_amount        = v_base,
         discount_amount    = round(v_base * coalesce(v_pct, 0) / 100.0, 2),
         total_amount       = v_base - round(v_base * coalesce(v_pct, 0) / 100.0, 2),
         updated_at         = now()
   where cs.id = v_sub;

  return null;
end;
$$;

comment on function public.fn_sync_subscription_period() is
  'Migration 109: derives child_subscriptions.current_period_end (MAX = coverage ends), next_renewal_at (MIN = next charge) and base/discount/total_amount (the NEXT invoice) from the per-subject rows. THE ONLY WRITER of those five columns — coalesce keeps a legacy row''s stored period when every subject period is still NULL, so the trigger can never blank a row.';

drop trigger if exists trg_sync_subscription_period on public.subscription_subjects;
create trigger trg_sync_subscription_period
  after insert or update or delete on public.subscription_subjects
  for each row
  execute function public.fn_sync_subscription_period();

-- -----------------------------------------------------------------------------
-- Child authentication & account model (Stage 8, increment 1).
-- Backported from migrations/2026_06_28_008_child_account_provisioning.sql.
-- Placed AFTER allocate_child_unique_id() (create_child_account calls it) and at
-- the END of the file so the table-privilege REVOKEs below run AFTER 010's blanket
-- grants — otherwise the write-revoke for `authenticated` would be re-granted.
-- -----------------------------------------------------------------------------

-- Lookup index for the lockout window (child_unique_id + recent attempts).
create index if not exists idx_child_login_attempts_lookup
  on public.child_login_attempts (child_unique_id, attempted_at desc);

-- -----------------------------------------------------------------------------
-- student_district_guard (Round 21) : keeps students.city_district_id honest.
-- Auto-fills the rayon from the school when missing; rejects a rayon outside the
-- child's city; rejects a rayon that contradicts the school's rayon. (The
-- "required when the city has rayons" rule lives in create_child_account so
-- legacy rows never break.) NB: districts = the CITIES table (historic naming).
-- -----------------------------------------------------------------------------
create or replace function public.student_district_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rayon_city  uuid;
  v_school_rayon uuid;
begin
  -- Auto-fill from the school when the rayon was not provided.
  if new.city_district_id is null and new.school_id is not null then
    select sc.city_district_id into new.city_district_id
      from public.schools sc where sc.id = new.school_id;
  end if;

  if new.city_district_id is not null then
    select cd.city_id into v_rayon_city
      from public.city_districts cd where cd.id = new.city_district_id;
    if v_rayon_city is null then
      raise exception 'student: district % does not exist', new.city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    -- Rayon must belong to the child's city (when a city is set).
    if new.district_id is not null and v_rayon_city <> new.district_id then
      raise exception 'student: district % is not in city %', new.city_district_id, new.district_id
        using errcode = 'check_violation';
    end if;
    -- Rayon must match the school's rayon (when the school has one).
    if new.school_id is not null then
      select sc.city_district_id into v_school_rayon
        from public.schools sc where sc.id = new.school_id;
      if v_school_rayon is not null and v_school_rayon <> new.city_district_id then
        raise exception 'student: district % contradicts the school''s district', new.city_district_id
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_district_guard on public.students;
create trigger trg_student_district_guard
  before insert or update of city_district_id, school_id, district_id on public.students
  for each row execute function public.student_district_guard();

-- create_child_account : atomic, server-side child provisioning WITHOUT a login ID.
-- The Auth user (p_auth_user_id) is created first by the service layer; the
-- on_auth_user_created trigger has already inserted a base profiles row. This
-- function promotes that profile to an active child, creates the student row
-- (optional structured p_grade_id + p_district_id/p_city_district_id/p_school_id —
-- the intra-city rayon is REQUIRED when the city has active rayons, Round 21),
-- assigns the Student role, records the credential mapping with a NULL
-- child_unique_id, and auto-links
-- the child to the creating parent — all in one txn. The 8-digit ID is DEFERRED: it
-- is allocated later by create_child_subscription once a plan is chosen (Batch H).
-- access_status stays 'inactive' until then. The structured city(district)/school
-- params are OPTIONAL at the DB layer (the app enforces mandatory); FK targets are
-- validated when provided, but a null is never an error. SECURITY DEFINER; EXECUTE
-- restricted to service_role.
-- (drop first: the parameter list / signature changed across versions)
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text);
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid);
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid);
create or replace function public.create_child_account(
  p_parent_profile_id uuid,
  p_auth_user_id      uuid,
  p_first_name        text,
  p_last_name         text,
  p_city              text default null,
  p_school_name       text default null,
  p_class_grade       text default null,
  p_grade_id          uuid default null,
  p_district_id       uuid default null,
  p_school_id         uuid default null,
  p_city_district_id  uuid default null
)
-- OUT column names are deliberately non-colliding with table columns (else plpgsql
-- raises "ambiguous column reference" inside the body).
returns table (new_student_profile_id uuid, new_child_unique_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_child_id       text;
  v_profile_id      uuid;
  v_student_role_id uuid;
begin
  -- The creator must be a registered parent (parents row exists).
  if not exists (select 1 from public.parents pa where pa.profile_id = p_parent_profile_id) then
    raise exception 'create_child_account: % is not a registered parent', p_parent_profile_id
      using errcode = 'check_violation';
  end if;

  -- The child Auth user must already exist with an auto-created profile.
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    raise exception 'create_child_account: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotency guard: never double-provision a profile already made a student.
  if exists (select 1 from public.students s where s.profile_id = v_profile_id) then
    raise exception 'create_child_account: profile % is already a student', v_profile_id
      using errcode = 'unique_violation';
  end if;

  -- Validate the optional structured grade.
  if p_grade_id is not null
     and not exists (select 1 from public.grades g where g.id = p_grade_id) then
    raise exception 'create_child_account: grade % does not exist', p_grade_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Validate the optional structured city (district). OPTIONAL: no raise on null.
  if p_district_id is not null
     and not exists (select 1 from public.districts d where d.id = p_district_id) then
    raise exception 'create_child_account: city (district) % does not exist', p_district_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Round 21: the intra-city district (rayon). REQUIRED when the chosen city has
  -- active rayons; must belong to that city. (The students trigger additionally
  -- enforces school-rayon consistency and auto-fills from the school.)
  if p_district_id is not null and p_city_district_id is null
     and exists (select 1 from public.city_districts cd
                  where cd.city_id = p_district_id and cd.status = 'active') then
    raise exception 'create_child_account: district is required for city %', p_district_id
      using errcode = 'check_violation',
            hint    = 'district_required';
  end if;
  if p_city_district_id is not null then
    if not exists (select 1 from public.city_districts cd where cd.id = p_city_district_id) then
      raise exception 'create_child_account: district % does not exist', p_city_district_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.city_districts cd
                        where cd.id = p_city_district_id and cd.city_id = p_district_id) then
      raise exception 'create_child_account: district % is not in city %', p_city_district_id, p_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Validate the optional structured school, and (when both given) that the
  -- school belongs to the chosen city. OPTIONAL: no raise on null.
  if p_school_id is not null then
    if not exists (select 1 from public.schools sc where sc.id = p_school_id) then
      raise exception 'create_child_account: school % does not exist', p_school_id
        using errcode = 'foreign_key_violation';
    end if;
    if p_district_id is not null
       and not exists (select 1 from public.schools sc
                        where sc.id = p_school_id and sc.district_id = p_district_id) then
      raise exception 'create_child_account: school % is not in city %', p_school_id, p_district_id
        using errcode = 'check_violation';
    end if;
    -- Round 21: the school must belong to the chosen rayon (when it has one).
    if p_city_district_id is not null
       and exists (select 1 from public.schools sc
                    where sc.id = p_school_id
                      and sc.city_district_id is not null
                      and sc.city_district_id <> p_city_district_id) then
      raise exception 'create_child_account: school % is not in district %', p_school_id, p_city_district_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row WITHOUT a login ID (no paid access yet).
  --    child_unique_id stays NULL until a plan is chosen (subscribe step).
  --    Structured district_id/city_district_id/school_id are stored alongside the
  --    free-text city/school_name/class_grade (display) values.
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               district_id, city_district_id, school_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_district_id, p_city_district_id, p_school_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          'inactive');

  -- 3) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 4) ALLOCATE THE LOGIN ID NOW (migration 146).
  --
  -- It used to be deferred to the first subscription, on the reasoning that a
  -- child with no plan has nothing to log in to. That was wrong in a way nobody
  -- noticed until the payments kill switch was thrown: with payments off, no
  -- subscription is ever created, so no id was ever allocated, and the Add-Child
  -- flow completed into an account THAT COULD NEVER BE USED. The success screen
  -- promised "the 8-digit ID appears as soon as a subject subscription is
  -- active" and no screen in the app could make that happen. Two production
  -- children were left in that state.
  --
  -- IDENTITY IS NOT ENTITLEMENT. The id is who the child IS; access_status stays
  -- 'inactive' and every paid gate is untouched. The child can sign in and see
  -- the ordinary locked arena -- a complete, honest state, instead of a dead end.
  --
  -- allocate_child_unique_id is idempotent (it re-reads the registry before
  -- minting), so create_child_subscription calling it again later is harmless.
  v_child_id := public.allocate_child_unique_id(v_profile_id);

  -- Password lives ONLY in Supabase Auth (never stored here).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, v_child_id, p_auth_user_id, p_parent_profile_id, now());

  -- 5) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  -- The caller sets the canonical synthetic auth email from this id; without
  -- that step the child still cannot sign in, so it is not optional.
  return query select v_profile_id, v_child_id;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) is
  'Atomic parent-created child provisioning INCLUDING the 8-digit login ID (migration 146; it was deferred to the first subscription, which never happened while payments were off). Optional structured grade/city(district)/school stored on students; the intra-city district (rayon) is REQUIRED when the city has active rayons (Round 21). service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

-- service_role only (the service layer runs admin.createUser then this).
-- Revoke anon/authenticated EXPLICITLY: Supabase ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon/authenticated on every new function; revoking public is not enough.

revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- advance_student_grades : yearly grade promotion (intended Sept 1 via pg_cron).
-- For every non-graduated student with a grade_id: level < 11 -> next grade level;
-- level = 11 -> graduated = true (grade_id kept as last grade attended). Returns
-- jsonb {promoted, graduated}. SECURITY DEFINER; service_role EXECUTE only.
--
-- INTENDED SCHEDULE (run once a year on Sep 1). If pg_cron is enabled (it is NOT
-- assumed here), schedule it with:
--   select cron.schedule(
--     'advance-student-grades-sept-1',
--     '0 3 1 9 *',                          -- 03:00 on Sep 1, every year
--     $$ select public.advance_student_grades(); $$
--   );
-- -----------------------------------------------------------------------------
create or replace function public.advance_student_grades()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promoted  int := 0;
  v_graduated int := 0;
begin
  -- Promote students below grade 11 to the next grade level.
  with promotable as (
    select s.profile_id, g_next.id as next_grade_id
    from public.students s
    join public.grades g_cur  on g_cur.id = s.grade_id
    join public.grades g_next on g_next.level = g_cur.level + 1
    where s.graduated = false
      and s.grade_id is not null
      and g_cur.level < 11
  ),
  upd as (
    update public.students s
       set grade_id   = p.next_grade_id,
           updated_at = now()
      from promotable p
     where s.profile_id = p.profile_id
    returning 1
  )
  select count(*) into v_promoted from upd;

  -- Graduate students currently in grade 11 (keep grade_id as the last grade).
  with grads as (
    update public.students s
       set graduated  = true,
           updated_at = now()
      from public.grades g_cur
     where g_cur.id = s.grade_id
       and s.graduated = false
       and s.grade_id is not null
       and g_cur.level = 11
    returning 1
  )
  select count(*) into v_graduated from grads;

  return jsonb_build_object('promoted', v_promoted, 'graduated', v_graduated);
end;
$$;

comment on function public.advance_student_grades() is
  'Yearly grade promotion (intended Sept 1 via pg_cron). Promotes non-graduated students level<11 to next grade; marks level-11 students graduated. Returns jsonb {promoted, graduated}. service_role EXECUTE only.';

revoke all on function public.advance_student_grades() from public, anon, authenticated;
grant execute on function public.advance_student_grades() to service_role;

-- True when a child ID has >= 8 failed attempts in the last 15 minutes.
create or replace function public.is_child_login_locked(p_child_unique_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) >= 8
  from public.child_login_attempts a
  where a.child_unique_id = p_child_unique_id
    and a.success = false
    and a.attempted_at > now() - interval '15 minutes'
$$;

-- Record a login attempt; a success clears the recent failure streak (resets window).
create or replace function public.record_child_login_attempt(
  p_child_unique_id text,
  p_ip_hash         text,
  p_success         boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.child_login_attempts (child_unique_id, ip_hash, success)
  values (p_child_unique_id, p_ip_hash, p_success);
  if p_success then
    delete from public.child_login_attempts
     where child_unique_id = p_child_unique_id
       and success = false
       and attempted_at > now() - interval '15 minutes';
  end if;
end;
$$;

-- Login helpers: service_role only (revoke anon/authenticated explicitly, as above).
revoke all on function public.is_child_login_locked(text) from public, anon, authenticated;
grant execute on function public.is_child_login_locked(text) to service_role;
revoke all on function public.record_child_login_attempt(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_child_login_attempt(text, text, boolean) to service_role;

-- child_login_attempts table privileges. MUST run here (after 010's blanket
-- grants) so the write-revoke for `authenticated` actually takes effect: writes
-- are service-role only; admins may READ (RLS in 010 limits rows to is_admin()).
revoke all on public.child_login_attempts from anon, authenticated;
grant select on public.child_login_attempts to authenticated;  -- RLS restricts rows to admins
grant all on public.child_login_attempts to service_role;
grant usage, select on sequence public.child_login_attempts_id_seq to service_role;

-- -----------------------------------------------------------------------------
-- Bulk question import (admin/content-manager) — Stage 6 increment.
-- Backported from migrations/2026_06_28_009_bulk_question_import.sql. Placed at
-- the END of this file so the question_imports table-privilege REVOKE below runs
-- AFTER 010's blanket grants — otherwise authenticated's write grant would remain.
-- (The question_imports table is created in 004; its RLS policy in 010.)
-- -----------------------------------------------------------------------------

-- Import-history lookup (importer's recent imports).
create index if not exists idx_question_imports_imported_by
  on public.question_imports (imported_by, created_at desc);

-- assert_question_type_rules (migration 037, MCQ-only launch): per-type structure
-- validation shared by BOTH bulk-import RPCs (the admin single-question form
-- applies the same rules app-side from question_types.status/options_required/
-- correct_required). MCQ (multiple_choice) = exactly 4 options, exactly 1 correct
-- (options count fixed since migration 040).
create or replace function public.assert_question_type_rules(
  p_type_id uuid,
  p_options jsonb
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_req         int;
  v_correct_req int;
  v_status      public.catalog_status;
  v_name        text;
  v_n           int;
  v_ncorrect    int;
begin
  select options_required, correct_required, status, name
    into v_req, v_correct_req, v_status, v_name
  from public.question_types where id = p_type_id;
  if not found then
    raise exception 'unknown question type';
  end if;
  if v_status <> 'active' then
    raise exception 'question type "%" is not enabled for new questions', v_name;
  end if;

  select count(*),
         count(*) filter (where coalesce((o->>'is_correct')::boolean, false))
    into v_n, v_ncorrect
  from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o;

  if v_req is not null and v_n <> v_req then
    raise exception 'type "%" requires exactly % answer options (got %)', v_name, v_req, v_n;
  end if;
  if v_req is null and (v_n < 2 or v_n > 10) then
    raise exception 'between 2 and 10 answer options required (got %)', v_n;
  end if;
  if v_correct_req is not null and v_ncorrect <> v_correct_req then
    raise exception 'type "%" requires exactly % correct option(s) (got %)', v_name, v_correct_req, v_ncorrect;
  end if;
  if v_correct_req is null and v_ncorrect < 1 then
    raise exception 'at least one correct option is required';
  end if;
end;
$$;

revoke all on function public.assert_question_type_rules(uuid, jsonb) from public, anon;
grant execute on function public.assert_question_type_rules(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ACADEMIC TERMS (migration 054): consistency triggers keep the topic →
-- subtopic/question term tree in sync (a subtopic's/question's term must equal
-- its topic's term when both are set; NULL inherits), plus the central
-- current-term helper. Columns live in 003/004; settings seeds in 012.
-- -----------------------------------------------------------------------------
-- Subtopics inherit/must match the parent topic's term.
create or replace function public.subtopic_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  select term into v_topic_term from public.topics where id = new.topic_id;
  if new.term is null then
    new.term := v_topic_term;            -- inherit on insert/update when omitted
  elsif v_topic_term is not null and new.term <> v_topic_term then
    raise exception 'subtopic: term must match the parent topic (%)', v_topic_term
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_subtopic_term_guard on public.subtopics;
create trigger trg_subtopic_term_guard
  before insert or update of term, topic_id on public.subtopics
  for each row execute function public.subtopic_term_guard();

-- Questions inherit/must match their topic's term; Round 39 (migration 084):
-- a general-bank question can never END UP termless (olympiad pool exempt).
create or replace function public.question_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  -- Migration 054: inherit the topic's term when omitted; a set term must
  -- match the topic's term (the tree stays consistent).
  if new.topic_id is not null then
    select term into v_topic_term from public.topics where id = new.topic_id;
    if new.term is null then
      new.term := v_topic_term;
    elsif v_topic_term is not null and new.term <> v_topic_term then
      raise exception 'question: term must match the topic (%)', v_topic_term
        using errcode = 'check_violation';
    end if;
  end if;
  -- Round 39: after inheritance, a GENERAL-bank question can never end up
  -- termless — no new bank question without a Rüb, and a term can never be
  -- stripped. Olympiad pool rows stay exempt (optional taxonomy by design);
  -- legacy NULL-term rows keep transitioning (this fires only on INSERT or
  -- UPDATE OF term/topic_id) until the review queue assigns their term.
  if new.olympiad_package_id is null and new.term is null then
    raise exception 'question: term (Rüb 1-4) is required for bank questions'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_question_term_guard on public.questions;
create trigger trg_question_term_guard
  before insert or update of term, topic_id on public.questions
  for each row execute function public.question_term_guard();

comment on function public.question_term_guard() is
  'Term guard (054 + Round 39): inherit/match the topic''s term, AND a general-'
  'bank question can never be inserted termless or have its term stripped. '
  'Olympiad pool questions exempt; legacy NULL-term rows transition freely '
  'until reviewed.';

drop trigger if exists trg_question_term_guard on public.questions;
create trigger trg_question_term_guard
  before insert or update of term, topic_id on public.questions
  for each row execute function public.question_term_guard();

-- Changing a TOPIC's term cascades to its subtopics and questions (keeps the
-- tree consistent; admin edits the topic once).
create or replace function public.topic_term_cascade()
returns trigger
language plpgsql
as $$
begin
  if new.term is distinct from old.term then
    update public.subtopics set term = new.term, updated_at = now()
     where topic_id = new.id and term is distinct from new.term;
    update public.questions set term = new.term, updated_at = now()
     where topic_id = new.id and term is distinct from new.term;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_topic_term_cascade on public.topics;
create trigger trg_topic_term_cascade
  after update of term on public.topics
  for each row execute function public.topic_term_cascade();

-- Current-term helper used by daily-round generation + admin readiness checks.
-- Reads system_settings 'academic.current_term' (seeded in 012), clamped 1..4.
create or replace function public.current_academic_term()
returns smallint
language sql
stable
set search_path = public, pg_temp
as $$
  select least(greatest(coalesce(
           (select nullif(value_json #>> '{}', '')::int
              from public.system_settings where key = 'academic.current_term'), 1), 1), 4)::smallint;
$$;
revoke all on function public.current_academic_term() from public, anon;
grant execute on function public.current_academic_term() to authenticated, service_role;

-- Safety net (migration 059): NEW general-bank questions must carry topic +
-- subtopic (insert trigger; legacy rows untouched; term inherits via 054's guard).
create or replace function public.question_taxonomy_guard()
returns trigger
language plpgsql
as $$
begin
  if new.olympiad_package_id is null then
    if new.topic_id is null or new.subtopic_id is null then
      raise exception 'question: topic and subtopic are required'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_question_taxonomy_guard on public.questions;
create trigger trg_question_taxonomy_guard
  before insert on public.questions
  for each row execute function public.question_taxonomy_guard();

-- -----------------------------------------------------------------------------
-- question_delete_guard (Round 21) : test_attempt_answers.question_id is
-- ON DELETE CASCADE, so hard-deleting an answered question silently destroys
-- graded history (review rows vanish, max_score no longer matches). Block the
-- delete with a clear error — archive instead. BEFORE DELETE fires before the
-- FK cascade, so the history rows still exist for the check.
-- -----------------------------------------------------------------------------
create or replace function public.question_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.test_attempt_answers a where a.question_id = old.id) then
    raise exception 'question % has attempt history and cannot be deleted; archive it instead', old.id
      using errcode = 'check_violation',
            hint    = 'question_has_attempts';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_question_delete_guard on public.questions;
create trigger trg_question_delete_guard
  before delete on public.questions
  for each row execute function public.question_delete_guard();

-- -----------------------------------------------------------------------------
-- GUARDED DELETION — the subject half (migration 111).
--
-- Same family as question_delete_guard directly above, and for the same
-- reason: a delete the UI already offers destroys history nobody agreed to
-- lose. deleteRow() in admin-panel/src/lib/admin/actions.ts is a live,
-- registered, unguarded `delete from subjects`, and subscription_subjects
-- (CASCADE) makes that delete strip a PAID line item out of a live
-- subscription while topics (CASCADE) takes the whole curriculum tree.
--
-- All plpgsql, so the references to olympiad_packages below resolve at CALL
-- time and 011 may run before 015 — the precedent is
-- assert_olympiad_pool_meets_per_attempt further down this file. Never put a
-- `language sql` body that reads an olympiad table here; that one IS parsed
-- at CREATE time. The olympiad half lives in 015.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- purge_question_set : THE answered-question policy, in one place.
--
-- Splits a set of questions into "hard-delete" and "archive" and returns both
-- counts plus the media assets the delete orphaned. Every destructive path in
-- this migration goes through it, so the policy cannot drift between the
-- olympiad half and the subject half.
--
-- Why a split at all, instead of refusing the whole operation: a single attempt
-- anywhere in a 240-question pool would otherwise make that pool permanently
-- un-purgeable, leaving the admin 240 individual archive clicks — or a psql
-- session, which is precisely where the migration-095 catastrophe came from.
-- Archiving is the remedy CLAUDE.md prescribes, and an archived question is
-- already inert: start_olympiad_attempt and draw_daily_questions both draw
-- status = 'published' only, while test_attempt_answers and every review screen
-- stay intact.
-- -----------------------------------------------------------------------------
create or replace function public.purge_question_set(p_question_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidates uuid[] := '{}'::uuid[];   -- media referenced anywhere in the scope
  v_orphans    uuid[] := '{}'::uuid[];   -- …of those, the ones nothing references now
  v_del_ids    uuid[] := '{}'::uuid[];
  v_deleted    int := 0;
  v_archived   int := 0;
  v_retained   int := 0;
  v_already    int := 0;
  v_repaired   int := 0;
  v_truncated  boolean := false;
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return jsonb_build_object(
      'deleted', 0, 'archived', 0, 'retained', 0, 'already_archived', 0,
      'repaired_practice_sets', 0,
      'orphaned_media_ids', '[]'::jsonb, 'media_truncated', false);
  end if;

  select count(*)::int into v_already
  from public.questions q
  where q.id = any(p_question_ids) and q.status = 'archived';

  -- Media ids referenced ANYWHERE in the scope, collected BEFORE the delete —
  -- the translation rows that carry them cascade away with the question. The
  -- set is deliberately over-collected; the post-delete filter below is what
  -- makes it exact, and it is exact for the archived SURVIVORS too: their
  -- translation rows are still there, so their images are never reported.
  select coalesce(array_agg(distinct s.m), '{}'::uuid[]) into v_candidates
  from (
    select qt.media_asset_id as m
      from public.question_translations qt
     where qt.question_id = any(p_question_ids) and qt.media_asset_id is not null
    union
    select qe.media_asset_id
      from public.question_explanations qe
     where qe.question_id = any(p_question_ids) and qe.media_asset_id is not null
    union
    select aot.media_asset_id
      from public.answer_option_translations aot
      join public.answer_options ao on ao.id = aot.option_id
     where ao.question_id = any(p_question_ids) and aot.media_asset_id is not null
  ) s;

  -- DELETE FIRST, and re-derive "unanswered" INSIDE the statement. Carrying a
  -- classification computed a moment earlier (by the preview, or even by the
  -- select above) is the bug: a student can answer one of these questions in
  -- between, and trg_question_delete_guard would then abort the entire
  -- transaction after the admin already confirmed.
  with del as (
    delete from public.questions q
     where q.id = any(p_question_ids)
       and not exists (select 1 from public.test_attempt_answers a
                        where a.question_id = q.id)
    returning q.id
  )
  select coalesce(array_agg(del.id), '{}'::uuid[]) into v_del_ids from del;
  v_deleted := cardinality(v_del_ids);

  -- Everything that survived the DELETE is answered BY CONSTRUCTION, so this
  -- statement needs no predicate of its own and the split can never disagree
  -- with what the delete actually did. The reverse order (archive first) would
  -- leave a question that got answered in between published AND undeleted.
  update public.questions
     set status = 'archived', updated_at = now()
   where id = any(p_question_ids) and status <> 'archived';
  get diagnostics v_archived = row_count;

  -- Survivors, not "newly archived": a scope whose answered questions were
  -- ALREADY archived still leaves rows behind, and the caller's decision to
  -- archive the container instead of deleting it keys off this number.
  select count(*)::int into v_retained
  from public.questions q where q.id = any(p_question_ids);

  if v_deleted > 0 then
    -- daily_practice_sets.question_ids is a plain uuid[] with NO foreign key
    -- and, unlike daily_rounds, no content_snapshot — so a deleted question
    -- silently SHRINKS a student's locked replay instead of failing loudly.
    -- Deleting the row is the repair: start_daily_round_attempt regenerates the
    -- set on next open, so it is self-healing. test_attempts.question_ids is
    -- deliberately left alone — that is graded history.
    delete from public.daily_practice_sets where question_ids && v_del_ids;
    get diagnostics v_repaired = row_count;
  end if;

  -- Now that the delete has happened, "orphan" is decidable exactly: a
  -- candidate nothing references any more. This is also what keeps an archived
  -- question's image safe — its translation row still points at it.
  --
  -- ALL EIGHT media_assets consumers are listed, not just the question-shaped
  -- ones, and the list must STAY exhaustive: the caller hands this array
  -- straight to a Storage delete that removes the BYTES FIRST, and nothing
  -- stops one asset backing two features — so a missing consumer does not fail
  -- loudly, it sweeps a LIVE avatar, wallpaper, sticker or news cover out of
  -- the bucket. Seven of the eight FKs are ON DELETE SET NULL, so the row is
  -- then silently blanked; sticker_images is ON DELETE RESTRICT, which is no
  -- excuse to omit it — the bytes are already gone by the time that FK
  -- refuses, and it refuses the caller's whole batched media_assets delete
  -- with them.
  -- This exact omission already shipped once as a data-loss bug on the other
  -- side of the same coin: sweepAbandonedImportMedia in
  -- admin-panel/src/lib/admin/import-media.ts was missing
  -- answer_option_translations and deleted yesterday's option images. That
  -- file's `consumers` array and this WHERE clause are two spellings of one
  -- list; a column added to media_assets must be added to both.
  if cardinality(v_candidates) > 0 then
    select coalesce(array_agg(c.m), '{}'::uuid[]) into v_orphans
    from unnest(v_candidates) as c(m)
    where not exists (select 1 from public.question_translations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.question_explanations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.answer_option_translations x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.profiles x
                       where x.avatar_media_id = c.m)
      and not exists (select 1 from public.wallpapers x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.sticker_images x
                       where x.media_asset_id = c.m)
      and not exists (select 1 from public.news x
                       where x.cover_media_id = c.m)
      and not exists (select 1 from public.olympiad_packages x
                       where x.cover_media_id = c.m);
  end if;

  -- A stale object left in a bucket is a cost bug; aborting a purge the admin
  -- already confirmed because the id list got long would be a correctness bug.
  -- Cap, and say so, so the caller can report the leak instead of hiding it.
  if cardinality(v_orphans) > 2000 then
    v_orphans   := v_orphans[1:2000];
    v_truncated := true;
  end if;

  return jsonb_build_object(
    'deleted', v_deleted,
    'archived', v_archived,
    'retained', v_retained,
    'already_archived', v_already,
    'repaired_practice_sets', v_repaired,
    'orphaned_media_ids', to_jsonb(v_orphans),
    'media_truncated', v_truncated);
end;
$$;

comment on function public.purge_question_set(uuid[]) is
  'Service-internal (migration 111): hard-deletes the UNANSWERED questions of a '
  'set and ARCHIVES the rest, re-deriving the split inside the DELETE so it can '
  'never drift. Returns {deleted, archived, retained, already_archived, '
  'repaired_practice_sets, orphaned_media_ids, media_truncated}. Also deletes '
  'the daily_practice_sets rows whose FK-less question_ids array referenced a '
  'deleted question. Reached only through the admin_* RPCs, never by a client.';
revoke all on function public.purge_question_set(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_question_set(uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- subject_deletion_blocks : the six reasons a subject may not be deleted,
-- evaluated together and returned as one array so the dialog can list every
-- reason at once instead of the admin fixing one, re-clicking, and hitting the
-- next. Shared by the preview, the RPC and the BEFORE DELETE trigger — three
-- copies of six subqueries would drift within a release.
--
-- NOT blocked, deliberately: daily_rounds and daily_practice_sets (both
-- CASCADE). Blocks 3 and 4 already fire for any round anyone actually played,
-- so all that remains is unplayed generated content — blocking on it would make
-- a freshly seeded, never used subject undeletable for no benefit. Both are
-- REPORTED by the preview instead.
-- -----------------------------------------------------------------------------
create or replace function public.subject_deletion_blocks(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '[]'::jsonb;
  n int;
begin
  -- 1. ANY subscription_subjects row, in ANY state. subject_id is CASCADE, and
  --    a cancelled row is the receipt for money already taken — CASCADE
  --    destroys it exactly as thoroughly as it destroys a live one. Existence
  --    of the row is the only rule that cannot be reasoned into a mistake at
  --    2am. This is money; there is no override.
  select count(*)::int into n
  from public.subscription_subjects where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_in_subscriptions', 'count', n);
  end if;

  -- 2. Billing history. The FK is already RESTRICT so this blocks today — but
  --    with a bare 23503 carrying no hint, which the panel can only render as
  --    "server error". Converting it into a counted, named block is the point.
  select count(*)::int into n
  from public.subscription_changes where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_billing_history', 'count', n);
  end if;

  -- 3. Attempt history. test_attempts.subject_id is SET NULL, and the Round-36
  --    weighted percentage reads that column: a NULL there is a WRONG RANK, not
  --    missing data.
  select count(*)::int into n
  from public.test_attempts where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_attempts', 'count', n);
  end if;

  -- 4. Points ledger — same SET NULL argument, and the ledger is explicitly
  --    append-only.
  select count(*)::int into n
  from public.student_points_ledger where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_points', 'count', n);
  end if;

  -- 5. olympiad_packages.subject_id is SET NULL, and a subject-less package
  --    still sells: get_my_olympiad_catalog LEFT JOINs subjects, so a paying
  --    parent would be shown a nameless card. Purchased packages can never be
  --    deleted, so re-pointing or archiving them first is the only way to keep
  --    the catalog coherent.
  select count(*)::int into n
  from public.olympiad_packages where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_in_olympiad_packages', 'count', n);
  end if;

  -- 6. A round in flight. Redundant with block 3 for any subject that was ever
  --    played, but it carries a different sentence ("wait" rather than "never")
  --    and it is the block that closes most of the delete/answer race window in
  --    purge_question_set — it is also the ONLY one of the six that applies to
  --    admin_purge_subject_questions, which does not touch the subject row.
  select count(*)::int into n
  from public.test_attempts
  where subject_id = p_subject_id and status = 'in_progress';
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  -- 7. THE CURRICULUM TREE. topics.subject_id is CASCADE and subtopics cascade
  --    from topics, so a subject that still owns a tree takes the whole tree
  --    with it — silently. Without this block the six history blocks above are
  --    all empty for a seeded-but-never-played subject, the guard PASSES, and
  --    one click removes every topic and subtopic while questions.topic_id
  --    (SET NULL) untags the general bank a second time. Delete the tree from
  --    the Curriculum Structure screen first, where each removal is its own
  --    confirmed, previewed step.
  select count(*)::int into n
  from public.topics where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_topics', 'count', n);
  end if;

  -- 8. THE GENERAL QUESTION BANK. questions.subject_id is SET NULL, so these
  --    rows are not destroyed but ORPHANED: every one silently loses the column
  --    that says what it teaches. Requiring the bank to be cleared FIRST (with
  --    admin_purge_subject_questions, which is itself confirmed and counted) is
  --    also what makes the outcome of a subject delete decidable BEFORE it
  --    runs — it is the block that stops admin_delete_subject destroying a bank
  --    on its way to reporting that it archived the subject instead.
  select count(*)::int into n
  from public.questions
  where subject_id = p_subject_id and olympiad_package_id is null;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_questions', 'count', n);
  end if;

  -- 9. An attempt reachable ONLY through a daily round. daily_rounds.subject_id
  --    is CASCADE while test_attempts.daily_round_id is RESTRICT, so an attempt
  --    whose own subject_id was already NULLed still pins the round: it passes
  --    blocks 1-8 and then aborts the delete with a bare 23503 that carries no
  --    hint — the generic "server error" this whole migration exists to remove.
  --    Counted here, it becomes a named reason the preview shows in advance.
  select count(*)::int into n
  from public.test_attempts ta
  join public.daily_rounds dr on dr.id = ta.daily_round_id
  where dr.subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_round_attempts', 'count', n);
  end if;

  -- 10. ENTITLEMENTS (migration 124). entitlements.subject_id is CASCADE, so a
  --     subject delete does not fail on a grant — it SILENTLY DESTROYS the
  --     access record docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 makes
  --     authoritative, and with it the only queryable proof a family was ever
  --     entitled. Block 1 already fires for every MIRRORED subject grant (each
  --     one has a subscription_subjects row behind it); what this block adds is
  --     the non-producer rails — an apple_iap, google_play or school_license
  --     grant carries no subscription row at all and would sail past block 1.
  select count(*)::int into n
  from public.entitlements where subject_id = p_subject_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'subject_has_entitlements', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.subject_deletion_blocks(uuid) is
  'Service-internal (migration 111): the reasons a subject may not be deleted, '
  'as a jsonb array of {hint, count}. Empty array = deletable. Blocks 1-6 are '
  'history (subscriptions, billing, attempts, points, olympiad packages, live '
  'attempts); blocks 7-9 are the structural ones that also fire for a '
  'never-played subject — topics, general-bank questions and attempts pinned to '
  'this subject''s daily rounds; block 10 (migration 124) is the entitlement '
  'grant, which subject_id CASCADE would destroy silently. Shared by '
  'admin_preview_subject_deletion, '
  'admin_delete_subject and trg_subject_delete_guard so the rule has exactly '
  'one definition.';
revoke all on function public.subject_deletion_blocks(uuid) from public, anon, authenticated;
grant execute on function public.subject_deletion_blocks(uuid) to service_role;

create or replace function public.subject_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
begin
  v_blocks := public.subject_deletion_blocks(old.id);
  if jsonb_array_length(v_blocks) > 0 then
    -- HINT is the single block's own hint when there is exactly one, so the
    -- common case gets a specific machine key; DETAIL always carries the whole
    -- blocks[] array, so the panel renders every reason from one code path.
    raise exception 'subject % cannot be deleted: % blocking reference(s)',
      old.id, jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'subject_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;
  return old;
end;
$$;

comment on function public.subject_delete_guard() is
  'Migration 111: refuses to delete a subject that any subscription has ever '
  'covered, that carries billing/attempt/points history, that backs an olympiad '
  'package, or that STILL OWNS topics or general-bank questions — the last two '
  'are the ones that also fire for a seeded-but-never-played subject, which is '
  'the state a bare cascade would find. Exists because admin-panel deleteRow() '
  'is a live, registered, unguarded delete on this table — the RPC alone would '
  'not cover it. Errcode check_violation, HINT = the single block or '
  'subject_not_deletable, DETAIL = {"blocks":[{hint,count},…]}.';
drop trigger if exists trg_subject_delete_guard on public.subjects;
create trigger trg_subject_delete_guard
  before delete on public.subjects
  for each row execute function public.subject_delete_guard();

create or replace function public.admin_preview_subject_deletion(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      record;
  v_blocks   jsonb;
  v_warn     jsonb := '[]'::jsonb;
  v_subs     int := 0;
  v_total    int; v_deletable int; v_answered int; v_archived int;
begin
  if not public.is_admin() then
    raise exception 'admin_preview_subject_deletion: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.code, s.name, s.status into v_sub
  from public.subjects s where s.id = p_subject_id;
  if not found then
    raise exception 'admin_preview_subject_deletion: subject not found'
      using errcode = 'no_data_found';
  end if;

  v_blocks := public.subject_deletion_blocks(p_subject_id);

  -- GENERAL BANK ONLY. Pool questions carry subject_id too, and they are never
  -- in scope: see admin_purge_subject_questions for why that clause is
  -- load-bearing rather than cosmetic.
  select count(*)::int,
         coalesce(sum(case when a.answered then 0 else 1 end), 0)::int,
         coalesce(sum(case when a.answered then 1 else 0 end), 0)::int,
         coalesce(sum(case when q.status = 'archived' then 1 else 0 end), 0)::int
    into v_total, v_deletable, v_answered, v_archived
  from public.questions q
  cross join lateral (
    select exists (select 1 from public.test_attempt_answers x
                    where x.question_id = q.id) as answered
  ) a
  where q.subject_id = p_subject_id and q.olympiad_package_id is null;

  -- THE NUMBER THE PURGE DIALOG MUST SHOUT. admin_purge_subject_questions is
  -- deliberately NOT blocked by a live subscription: replacing a live subject's
  -- curriculum is its one legitimate use (the 2026-07-30 replacement did
  -- exactly that), and refusing it would leave a psql session as the only
  -- route — which is where the migration-095 catastrophe came from. But an
  -- emptied bank is not a content edit: draw_daily_questions can no longer
  -- assemble a full set, so start_daily_round_attempt raises no_data_found for
  -- EVERY one of these children until a replacement pool is published. The
  -- honest design is therefore to report it as loudly as possible, next to a
  -- confirmation token, rather than to pretend the operation is safe or to
  -- forbid the only supported way of doing it.
  --
  -- Counted per CHILD, not per subscription line: two lines for one child (a
  -- past_due row alongside a new trial) is one blocked student, and a number
  -- that double-counts is a number an admin stops trusting. remove_at rows are
  -- excluded — that subject is already scheduled to leave the basket.
  select count(distinct cs.student_profile_id)::int into v_subs
  from public.subscription_subjects ss
  join public.child_subscriptions cs on cs.id = ss.child_subscription_id
  where ss.subject_id = p_subject_id
    and ss.remove_at is null
    and cs.status in ('trialing', 'active', 'past_due');
  if v_subs > 0 then
    v_warn := v_warn || jsonb_build_object(
                'hint', 'subject_purge_active_subscribers', 'count', v_subs);
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocks) = 0,
    'subject', jsonb_build_object('id', v_sub.id, 'code', v_sub.code,
                                  'name', v_sub.name, 'status', v_sub.status),
    'blocked_by', v_blocks,
    -- Not blocks: consequences. Rendered by the SAME hint-to-sentence map the
    -- blocks use, so a new warning never falls through to "server error".
    'warnings', v_warn,
    'active_subscribers', v_subs,
    'questions', jsonb_build_object('total', v_total, 'deletable', v_deletable,
                                    'archived_instead', v_answered,
                                    'already_archived', v_archived),
    'cascade', jsonb_build_object(
      'topics', (select count(*)::int from public.topics where subject_id = p_subject_id),
      'subtopics', (select count(*)::int from public.subtopics st
                     join public.topics t on t.id = st.topic_id
                    where t.subject_id = p_subject_id),
      'subjects_pricing', (select count(*)::int from public.subjects_pricing
                            where subject_id = p_subject_id),
      'subscription_subjects', (select count(*)::int from public.subscription_subjects
                                 where subject_id = p_subject_id),
      'daily_rounds', (select count(*)::int from public.daily_rounds
                        where subject_id = p_subject_id),
      'daily_practice_sets', (select count(*)::int from public.daily_practice_sets
                               where subject_id = p_subject_id)),
    'orphans', jsonb_build_object(
      'tests', (select count(*)::int from public.tests where subject_id = p_subject_id),
      'test_attempts', (select count(*)::int from public.test_attempts
                         where subject_id = p_subject_id),
      'student_points_ledger', (select count(*)::int from public.student_points_ledger
                                 where subject_id = p_subject_id),
      'progress_snapshots', (select count(*)::int from public.progress_snapshots
                              where subject_id = p_subject_id),
      'question_imports', (select count(*)::int from public.question_imports
                            where subject_id = p_subject_id),
      'olympiad_packages', (select count(*)::int from public.olympiad_packages
                             where subject_id = p_subject_id),
      -- Olympiad POOL questions tagged with this subject. Normally zero once
      -- the olympiad_packages block above is clear, but a pool question can
      -- outlive a re-pointed package; it is inert (olympiad draws read
      -- olympiad_package_id, never subject_id) and only loses the tag.
      'questions', (select count(*)::int from public.questions
                     where subject_id = p_subject_id
                       and olympiad_package_id is not null)),
    'history', jsonb_build_object(
      'subscription_changes', (select count(*)::int from public.subscription_changes
                                where subject_id = p_subject_id)));
end;
$$;

comment on function public.admin_preview_subject_deletion(uuid) is
  'Admin-only, side-effect free (migration 111): what deleting this subject '
  'would destroy — the nine blocked_by[] reasons, the general-bank question '
  'delete/archive split, the CASCADE row counts (topics, subtopics, pricing, '
  'subscription lines, daily rounds/practice sets) and the SET NULL orphan '
  'counts. Also serves the PURGE dialog: active_subscribers / warnings[] carry '
  'how many children are currently subscribed to this subject, because emptying '
  'its bank breaks their daily round without blocking anything. In practice '
  'only a mistyped, never-used subject is deletable.';
revoke all on function public.admin_preview_subject_deletion(uuid) from public, anon;
grant execute on function public.admin_preview_subject_deletion(uuid)
  to authenticated, service_role;

create or replace function public.admin_purge_subject_questions(
  p_subject_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text;
  v_ids   uuid[];
  v_live  int;
  v_purge jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_purge_subject_questions: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.code into v_code from public.subjects s where s.id = p_subject_id;
  if not found then
    raise exception 'admin_purge_subject_questions: subject not found'
      using errcode = 'no_data_found';
  end if;

  -- THE SAME CONFIRMATION TOKEN THE CONTAINER DELETES DEMAND. This is the
  -- operation that destroys the most rows in the platform — a whole subject's
  -- question bank — and its only block is live_attempts, so an actively sold,
  -- actively played subject is squarely in scope by design (curriculum
  -- replacement is the reason it exists). It is also granted to
  -- `authenticated`, which makes it a PostgREST endpoint any admin session can
  -- POST directly with nothing but a subject id: the dialog is not a control,
  -- the token is. Checked before the scope is read so a wrong-tab mix-up fails
  -- on the cheap test; admin_preview_subject_deletion reports how many children
  -- are currently subscribed so the admin types it knowing the cost.
  if p_expected_code is null or p_expected_code <> v_code then
    raise exception 'admin_purge_subject_questions: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- `olympiad_package_id is null` is LOAD-BEARING, not cosmetic: pool questions
  -- carry subject_id too, so without it "clear this subject's questions" would
  -- silently empty a PURCHASED olympiad pool — a back door around every
  -- olympiad guard in this migration. Topics and subtopics are untouched; the
  -- taxonomy tree is exactly what "without removing the subject" preserves.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_ids
  from public.questions q
  where q.subject_id = p_subject_id and q.olympiad_package_id is null;

  select count(*)::int into v_live
  from public.test_attempts ta
  where ta.status = 'in_progress'
    and (ta.subject_id = p_subject_id or ta.question_ids && v_ids);
  if v_live > 0 then
    raise exception 'admin_purge_subject_questions: % attempt(s) in flight', v_live
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'live_attempts', 'count', v_live)),
                        'count', v_live)::text;
  end if;

  v_purge := public.purge_question_set(v_ids);

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'deleted_questions', (v_purge->>'deleted')::int,
    'archived_questions', (v_purge->>'archived')::int,
    'retained_questions', (v_purge->>'retained')::int,
    'already_archived', (v_purge->>'already_archived')::int,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_purge_subject_questions(uuid, text) is
  'Admin-only (migration 111): clears a subject''s GENERAL-BANK questions '
  '(olympiad_package_id IS NULL) without touching the subject, its topics or '
  'its subtopics — unanswered deleted, answered ARCHIVED. p_expected_code must '
  'equal the subject code (confirmation_mismatch); the only BLOCK is '
  'live_attempts, because emptying a live subject''s bank is this function''s '
  'legitimate use (curriculum replacement) — the cost is reported by '
  'admin_preview_subject_deletion.active_subscribers, not refused. Also deletes '
  'the daily_practice_sets rows whose FK-less question_ids array referenced a '
  'deleted question (they regenerate on next open). Returns the counts plus '
  'orphaned_media_ids for the Storage sweep.';
revoke all on function public.admin_purge_subject_questions(uuid, text) from public, anon;
grant execute on function public.admin_purge_subject_questions(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_delete_subject(
  p_subject_id    uuid,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      record;
  v_blocks   jsonb;
  v_answered int;
  v_purge    jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_subject: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select s.id, s.code, s.status into v_sub
  from public.subjects s where s.id = p_subject_id
  for update;
  if not found then
    raise exception 'admin_delete_subject: subject not found'
      using errcode = 'no_data_found';
  end if;

  if p_expected_code is null or p_expected_code <> v_sub.code then
    raise exception 'admin_delete_subject: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  v_blocks := public.subject_deletion_blocks(p_subject_id);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception 'admin_delete_subject: % blocking reference(s)',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = case when jsonb_array_length(v_blocks) = 1
                           then v_blocks->0->>'hint' else 'subject_not_deletable' end,
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  -- DECIDE THE OUTCOME BEFORE DESTROYING ANYTHING. The earlier shape purged
  -- first and only then discovered that answered questions had survived, so it
  -- could report "subject archived" — a soft, reassuring word — AFTER the whole
  -- unanswered half of the bank had already been hard-deleted. The admin read
  -- the soft outcome and had in fact lost the bank. Block 8 makes a non-empty
  -- bank unreachable here anyway; this ordering is what makes that a belt
  -- rather than the only brace.
  select count(*)::int into v_answered
  from public.questions q
  where q.subject_id = p_subject_id and q.olympiad_package_id is null
    and exists (select 1 from public.test_attempt_answers a
                 where a.question_id = q.id);

  if v_answered > 0 then
    -- Same rule as packages: if anything answered survives, the CONTAINER is
    -- archived, not deleted — and NOTHING is purged on the way there. Deleting
    -- the subject would SET NULL those rows' subject_id, which is exactly the
    -- orphaning this function exists to prevent.
    update public.subjects
       set status = 'archived', updated_at = now()
     where id = p_subject_id and status <> 'archived';

    return jsonb_build_object(
      'subject_id', p_subject_id,
      'subject_deleted', false,
      'subject_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', 0,
      'archived_questions', 0,
      'retained_questions', v_answered,
      'repaired_practice_sets', 0,
      'orphaned_media_ids', '[]'::jsonb,
      'media_truncated', false);
  end if;

  -- Nothing answered is in scope, so the purge below can only hard-delete. It
  -- still runs, and it still passes the token on: block 8 normally leaves it an
  -- empty bank, but a question inserted between that check and this line must
  -- not be left pointing at a subject that no longer exists (SET NULL).
  v_purge := public.admin_purge_subject_questions(p_subject_id, p_expected_code);

  if (v_purge->>'retained_questions')::int > 0 then
    -- Reachable only through a race — a question answered between the count
    -- above and the purge. The purge archived it rather than deleting it, so
    -- the subject must be archived too: the alternative is SET NULL on an
    -- archived row, i.e. a question nobody can ever find again.
    update public.subjects
       set status = 'archived', updated_at = now()
     where id = p_subject_id and status <> 'archived';

    return jsonb_build_object(
      'subject_id', p_subject_id,
      'subject_deleted', false,
      'subject_archived', true,
      'reason', 'answered_questions_retained',
      'deleted_questions', (v_purge->>'deleted_questions')::int,
      'archived_questions', (v_purge->>'archived_questions')::int,
      'retained_questions', (v_purge->>'retained_questions')::int,
      'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
      'orphaned_media_ids', v_purge->'orphaned_media_ids',
      'media_truncated', (v_purge->>'media_truncated')::boolean);
  end if;

  -- Fires trg_subject_delete_guard, which re-evaluates the same nine blocks.
  -- It passes because the conditions still hold, never because anything was
  -- suppressed — and if a subscription or an attempt appeared in between, the
  -- guard aborts the transaction, which is the correct outcome.
  delete from public.subjects where id = p_subject_id;

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'subject_deleted', true,
    'subject_archived', false,
    'deleted_questions', (v_purge->>'deleted_questions')::int,
    'archived_questions', 0,
    'retained_questions', 0,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_subject(uuid, text) is
  'Admin-only (migration 111): deletes a subject that is already EMPTY — its '
  'topics and its general-bank questions must be gone first (blocks 7 and 8), '
  'so this can never destroy a curriculum tree or a question bank as a side '
  'effect of removing the container. Also blocked by any subscription line ever '
  'written, by billing/attempt/points history, by an olympiad package on the '
  'subject, by a live attempt and by an attempt pinned to one of its daily '
  'rounds — the net effect is that a subject which has ever been sold or played '
  'is permanently undeletable, and in practice only a mistyped, never-used '
  'subject can be removed. p_expected_code must equal the subject code. The '
  'archive-vs-delete outcome is decided BEFORE anything is purged; when '
  'answered questions survive, the SUBJECT IS ARCHIVED and the bank is left '
  'untouched.';
revoke all on function public.admin_delete_subject(uuid, text) from public, anon;
grant execute on function public.admin_delete_subject(uuid, text)
  to authenticated, service_role;

-- =============================================================================
-- THE TOKEN-LESS ARITY MUST NOT SURVIVE.
--
-- Unconditional, and BEFORE the create: a function whose signature gains a
-- parameter is a new OVERLOAD, not a replacement, and an overload that destroys
-- the same rows without a confirmation token is the bypass itself. Same
-- treatment migration 111 gave admin_delete_olympiad_grade_pool(uuid,uuid,bool).
-- =============================================================================
drop function if exists public.admin_delete_olympiad_questions(uuid, uuid[]);


-- -----------------------------------------------------------------------------
-- admin_delete_olympiad_questions : the ADMIN-FACING, package-SCOPED wrapper
-- around purge_question_set.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_questions(
  p_package_id      uuid,
  p_question_ids    uuid[],
  p_expected_code   text,
  p_refuse_answered boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_ids      uuid[] := '{}'::uuid[];
  v_gone     uuid[] := '{}'::uuid[];
  v_raw      int;
  v_foreign  int;
  v_missing  int;
  v_scope    jsonb := '[]'::jsonb;
  v_answered int;
  v_live     int;
  v_blocks   jsonb;
  v_purge    jsonb;
  v_rot      int := 0;
  v_demote   boolean := false;
begin
  -- ADMIN ONLY, AND FIRST. The grant to `authenticated` further down only makes
  -- the RPC reachable from the signed-in admin's own session; this is the gate.
  -- Olympiad pools are an Admin-only module (CLAUDE.md: Content Managers must
  -- not manage the Olympiad Preparation module), so holding content.delete is
  -- deliberately not enough.
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_questions: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  v_raw := cardinality(coalesce(p_question_ids, '{}'::uuid[]));
  if v_raw = 0 then
    raise exception 'admin_delete_olympiad_questions: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- 500 is questions_per_attempt's own ceiling, so it is the largest selection
  -- any single attempt could ever be about. Checked on the RAW array, before any
  -- work is done on it: this is a PostgREST endpoint, and an unbounded id list
  -- would let one POST hold a lock while it unnests a million rows.
  if v_raw > 500 then
    raise exception 'admin_delete_olympiad_questions: % ids requested, the limit is 500', v_raw
      using errcode = 'check_violation',
            hint    = 'too_many_questions',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'too_many_questions', 'count', v_raw)),
                        'limit', 500)::text;
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[]) into v_ids
  from unnest(p_question_ids) as u(id)
  where u.id is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'admin_delete_olympiad_questions: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package, and pins the
  -- status this function may later demote.
  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_delete_olympiad_questions: package not found'
      using errcode = 'no_data_found';
  end if;

  -- THE CONFIRMATION TOKEN, compared HERE and under the lock taken above — the
  -- same control admin_delete_olympiad_grade_pool, admin_delete_olympiad_package
  -- and admin_purge_subject_questions all take. The reason is theirs verbatim:
  -- this function is granted to `authenticated`, which makes it a PostgREST
  -- endpoint any admin session can POST directly, with up to 500 questions of
  -- blast radius. A checkbox in a dialog is not a control; a value the DATABASE
  -- re-checks is. Compared before the ids are looked at so a wrong-tab mix-up
  -- fails on the cheap test.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_delete_olympiad_questions: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- THE SCOPE CHECK — the reason this function exists at all.
  --
  -- SECURITY DEFINER is load-bearing here: `questions` is RLS-protected, and an
  -- id that passed only because the row was HIDDEN from the caller would be the
  -- opposite of a scope check.
  --
  -- ALL-OR-NOTHING on purpose. Skipping the strangers and purging the rest would
  -- report a number the admin cannot reconcile with the boxes they ticked, and
  -- would quietly normalise a client that sends ids from another package.
  --
  -- The two failures are COUNTED SEPARATELY because they are different
  -- accidents with different remedies. An id in another package means the client
  -- sent something it should not have — a selection bug worth hunting. An id
  -- that resolves to nothing means the row went away between the dialog opening
  -- and the click, usually because a second admin got there first — nothing is
  -- wrong with the selection, the page is simply stale. Reporting the second as
  -- the first sends the admin looking for a bug that does not exist.
  select count(*)::int into v_foreign
  from unnest(v_ids) as u(id)
  where exists (select 1 from public.questions q
                 where q.id = u.id
                   and q.olympiad_package_id is distinct from p_package_id);
  select count(*)::int into v_missing
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);
  if v_foreign > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_not_in_package',
                                             'count', v_foreign);
  end if;
  if v_missing > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_gone',
                                             'count', v_missing);
  end if;
  if jsonb_array_length(v_scope) > 0 then
    raise exception
      'admin_delete_olympiad_questions: % of % selected id(s) are not in package %, % no longer exist',
      v_foreign, cardinality(v_ids), p_package_id, v_missing
      using errcode = 'check_violation',
            hint    = case when v_foreign > 0
                           then 'question_not_in_package' else 'question_gone' end,
            detail  = jsonb_build_object('blocks', v_scope)::text;
  end if;

  -- The per-row button's one behavioural difference (see the header): a question
  -- with answer history is REFUSED with the shipped "archive it instead"
  -- sentence rather than silently archived. The bulk path never sets this — for
  -- a 40-row selection, refusing the whole call because one row was answered is
  -- exactly the dead end purge_question_set's split exists to avoid.
  if coalesce(p_refuse_answered, false) then
    select count(distinct a.question_id)::int into v_answered
    from public.test_attempt_answers a
    where a.question_id = any(v_ids);
    if v_answered > 0 then
      raise exception 'admin_delete_olympiad_questions: % answered question(s)', v_answered
        using errcode = 'check_violation',
              hint    = 'question_has_attempts',
              detail  = jsonb_build_object(
                          'blocks', jsonb_build_array(
                            jsonb_build_object('hint', 'question_has_attempts',
                                               'count', v_answered)))::text;
    end if;
  end if;

  -- An attempt in flight over the SELECTION. Narrower than the package-wide
  -- block in olympiad_package_deletion_blocks, and narrow is right here: this is
  -- a content edit an admin may need while other grades are being played. It is
  -- still the mitigation for the one real race — an answer row can only appear
  -- through a submit RPC on an in-progress attempt, so a selection no live
  -- attempt is drawing from cannot change classification underneath the purge.
  select count(*)::int into v_live
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_ids;
  if v_live > 0 then
    raise exception 'admin_delete_olympiad_questions: % attempt(s) in flight', v_live
      using errcode = 'check_violation',
            hint    = 'live_attempts',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'live_attempts', 'count', v_live)),
                        'count', v_live)::text;
  end if;

  -- THE PURCHASE RULE. Delegated whole, for the reason spelled out in the file
  -- header: a second, hand-written copy of "what counts as a purchase" here is
  -- exactly how this operation came to bypass the one migration 111 already
  -- enforced. Every blocked grade travels in DETAIL with its own counts, so the
  -- refusal names the grade instead of being a bare "not allowed".
  v_blocks := public.olympiad_pool_purchase_blocks(p_package_id, v_ids);
  if jsonb_array_length(v_blocks) > 0 then
    raise exception
      'admin_delete_olympiad_questions: % purchased grade pool(s) would fall below one attempt',
      jsonb_array_length(v_blocks)
      using errcode = 'check_violation',
            hint    = 'grade_purchased_pool_below_attempt',
            detail  = jsonb_build_object('blocks', v_blocks)::text;
  end if;

  -- DELEGATED, never re-implemented: unanswered rows go, answered rows are
  -- archived, and the split is re-derived inside the statement that removes
  -- them. A second copy of that policy here is the drift migration 111 factored
  -- this helper out to prevent.
  v_purge := public.purge_question_set(v_ids);

  -- Which of the selection actually went. purge_question_set reports COUNTS, not
  -- ids, and the survivors are the archived ones — so "gone" is decidable
  -- exactly, and only, by asking which ids no longer resolve.
  select coalesce(array_agg(u.id), '{}'::uuid[]) into v_gone
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);

  -- olympiad_question_rotations.seen_question_ids would keep naming rows that no
  -- longer exist, which makes a re-uploaded pool look partly consumed to that
  -- student and can hand them a short attempt. The row is pure cache, so
  -- resetting it is free — and only the students whose cycle actually touched a
  -- removed id are reset, unlike the grade-pool path which empties the pool
  -- wholesale and can drop every rotation for the grade.
  if cardinality(v_gone) > 0 then
    delete from public.olympiad_question_rotations
     where olympiad_package_id = p_package_id
       and seen_question_ids && v_gone;
    get diagnostics v_rot = row_count;
  end if;

  -- Same auto-demotion admin_delete_olympiad_grade_pool performs, and for the
  -- same reason: leaving an ACTIVE package whose pool can no longer fill an
  -- attempt means the next child to open it gets a runtime failure at attempt
  -- start instead of a closed listing. It stays reachable even with the purchase
  -- rule above, because a grade nobody bought can still be emptied.
  if v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not: the
      -- guard returns early for any row whose new.status is not 'active'. That
      -- early return is what the whole demotion rests on — do not "simplify" it
      -- by suppressing the trigger.
    end if;
  end if;

  -- `deleted` / `archived` are purge_question_set's own spelling, and
  -- `orphaned_media_ids` is the key afterOlympiadDestructiveCall() in
  -- admin-panel/src/lib/admin/olympiad.ts already sweeps from Storage. A second
  -- name for the same array would be two things to keep in step, so there is
  -- exactly one.
  return jsonb_build_object(
    'package_id', p_package_id,
    'requested', cardinality(v_ids),
    'deleted', (v_purge->>'deleted')::int,
    'archived', (v_purge->>'archived')::int,
    'retained', (v_purge->>'retained')::int,
    'already_archived', (v_purge->>'already_archived')::int,
    'repaired_practice_sets', (v_purge->>'repaired_practice_sets')::int,
    'reset_rotations', v_rot,
    'package_demoted', v_demote,
    'orphaned_media_ids', v_purge->'orphaned_media_ids',
    'media_truncated', (v_purge->>'media_truncated')::boolean);
end;
$$;

comment on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean) is
  'Admin-only (migration 112): purges a SELECTION of questions inside ONE '
  'olympiad package — unanswered deleted, answered ARCHIVED, delegated to '
  'purge_question_set so the policy has one definition. Exists to be the SCOPE '
  'CHECK that purge_question_set (service_role-only, bare uuid[]) cannot '
  'perform: is_admin() first, at most 500 ids, p_expected_code must equal the '
  'package code (confirmation_mismatch), and the WHOLE call is refused if any id '
  'is outside the package (question_not_in_package) or no longer exists '
  '(question_gone) — partial silent skipping would hide a wrong selection. Also '
  'refuses while an olympiad attempt is drawing from the selection '
  '(live_attempts) and when a PURCHASED grade''s published pool would be left '
  'unable to fill one attempt (grade_purchased_pool_below_attempt, via '
  'olympiad_pool_purchase_blocks — the per-selection form of the rule '
  'olympiad_grade_pool_blocks applies to a whole pool). p_refuse_answered is the '
  'per-row button''s variant: refuse (question_has_attempts) instead of '
  'archiving. Resets the rotation rows that named a removed question and demotes '
  'an ACTIVE package whose pool can no longer fill an attempt. Returns '
  '{requested, deleted, archived, retained, already_archived, '
  'repaired_practice_sets, reset_rotations, package_demoted, orphaned_media_ids, '
  'media_truncated}.';


-- -----------------------------------------------------------------------------
-- admin_delete_olympiad_pool_question : the panel's ONE-question Delete button.
--
-- A thin wrapper, on purpose. Before migration 112 that button was a bare
-- `.delete()` from the panel, which is why it never answered to the purchase
-- rule; giving it its own guarded body would have made a second copy of every
-- rule above, so it makes none — it resolves the package's own code and calls
-- the function above with a single id.
--
-- It takes no token of its own and does not need one. The token exists to bound
-- the blast radius of a direct POST at a 500-id endpoint; this call names ONE
-- row, that row is proved to be inside the named package before anything
-- happens, and the purchase rule is evaluated exactly for a single-row delete.
-- Looping it cannot walk a purchased pool below one attempt: every individual
-- call is a separate statement and each one is checked against the pool as it
-- stands at that moment.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_olympiad_pool_question(
  p_package_id  uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'admin_delete_olympiad_pool_question: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select p.code into v_code
  from public.olympiad_packages p where p.id = p_package_id;
  if not found then
    raise exception 'admin_delete_olympiad_pool_question: package not found'
      using errcode = 'no_data_found';
  end if;

  return public.admin_delete_olympiad_questions(
           p_package_id, array[p_question_id], v_code, true);
end;
$$;

comment on function public.admin_delete_olympiad_pool_question(uuid, uuid) is
  'Admin-only (migration 112): deletes ONE olympiad pool question through '
  'admin_delete_olympiad_questions, so the per-row button answers to the same '
  'scope, live-attempt and PURCHASED-POOL rules as the bulk one instead of '
  'being the bypass around them. Refuses a question with answer history '
  '(question_has_attempts) rather than archiving it, which is the shipped '
  'per-row behaviour. No confirmation token: it names a single row inside a '
  'package it verifies, which is what the token bounds elsewhere.';


-- =============================================================================
-- GRANTS — exactly like the migration-111 admin RPCs.
--
-- The panel calls these as the SIGNED-IN ADMIN's SSR client, not as
-- service_role, so `authenticated` is required and public.is_admin() inside the
-- functions is the real gate. purge_question_set and the two blocks helpers stay
-- service_role-only; nothing here relaxes them, and the verify block below fails
-- this file if anything did.
-- =============================================================================

revoke all on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean)
  from public, anon;
grant execute on function public.admin_delete_olympiad_questions(uuid, uuid[], text, boolean)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION 144 - the same guards, for ARCHIVING. Archiving removes a question
-- from every future attempt exactly as deleting does, so it may not be the
-- unguarded way around the purchased-grade floor.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_olympiad_questions_status(
  p_package_id    uuid,
  p_question_ids  uuid[],
  p_status        text,
  p_expected_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pkg      record;
  v_ids      uuid[] := '{}'::uuid[];
  v_raw      int;
  v_foreign  int;
  v_missing  int;
  v_scope    jsonb := '[]'::jsonb;
  v_blocks   jsonb;
  v_changed  int := 0;
  v_already  int := 0;
  v_demote   boolean := false;
begin
  -- ADMIN ONLY, AND FIRST. The grant to `authenticated` further down only makes
  -- the RPC reachable from the signed-in admin's own session; this is the gate.
  -- Olympiad pools are an Admin-only module (CLAUDE.md: Content Managers must
  -- not manage the Olympiad Preparation module), so holding content.edit is
  -- deliberately not enough.
  if not public.is_admin() then
    raise exception 'admin_set_olympiad_questions_status: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  -- Two directions only. 'draft' is deliberately absent: it is not a pool state
  -- and would be a third way to leave the published set with different rules.
  if p_status is null or p_status not in ('archived', 'published') then
    raise exception 'admin_set_olympiad_questions_status: bad status %', p_status
      using errcode = 'check_violation', hint = 'bad_status';
  end if;

  v_raw := cardinality(coalesce(p_question_ids, '{}'::uuid[]));
  if v_raw = 0 then
    raise exception 'admin_set_olympiad_questions_status: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- Checked on the RAW array, before any work is done on it: this is a PostgREST
  -- endpoint, and an unbounded id list would let one POST hold the package lock
  -- while it unnests a million rows. Same ceiling as the delete path, so a
  -- selection that can be deleted can also be archived.
  if v_raw > 500 then
    raise exception 'admin_set_olympiad_questions_status: % ids requested, the limit is 500', v_raw
      using errcode = 'check_violation',
            hint    = 'too_many_questions',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'too_many_questions', 'count', v_raw)),
                        'limit', 500)::text;
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[]) into v_ids
  from unnest(p_question_ids) as u(id)
  where u.id is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'admin_set_olympiad_questions_status: empty selection'
      using errcode = 'check_violation',
            hint    = 'empty_selection',
            detail  = jsonb_build_object(
                        'blocks', jsonb_build_array(
                          jsonb_build_object('hint', 'empty_selection', 'count', 0)))::text;
  end if;

  -- FOR UPDATE serialises two tabs acting on the same package, and pins the
  -- status this function may later demote.
  select p.id, p.code, p.status, p.questions_per_attempt into v_pkg
  from public.olympiad_packages p where p.id = p_package_id
  for update;
  if not found then
    raise exception 'admin_set_olympiad_questions_status: package not found'
      using errcode = 'no_data_found';
  end if;

  -- THE CONFIRMATION TOKEN, compared HERE and under the lock taken above, for
  -- the reason its sibling gives: this function is granted to `authenticated`,
  -- which makes it a PostgREST endpoint any admin session can POST directly,
  -- with up to 500 questions of blast radius. A checkbox in a dialog is not a
  -- control; a value the DATABASE re-checks is. The archive UI does not ask the
  -- admin to type it (archiving is reversible, so the friction is not earned) —
  -- the ACTION passes the code it already holds, so the contract stays identical
  -- to its sibling and a hand-crafted POST cannot skip the lock-time check.
  if p_expected_code is null or p_expected_code <> v_pkg.code then
    raise exception 'admin_set_olympiad_questions_status: confirmation code mismatch'
      using errcode = 'check_violation', hint = 'confirmation_mismatch';
  end if;

  -- THE SCOPE CHECK — the reason this function exists at all.
  --
  -- SECURITY DEFINER is load-bearing here: `questions` is RLS-protected, and an
  -- id that passed only because the row was HIDDEN from the caller would be the
  -- opposite of a scope check.
  --
  -- ALL-OR-NOTHING, and the two failures counted SEPARATELY, exactly as the
  -- delete path does it: an id in another package is a client bug worth hunting;
  -- an id that resolves to nothing means a second admin got there first and the
  -- page is merely stale. Reporting the second as the first sends the admin
  -- looking for a bug that does not exist.
  select count(*)::int into v_foreign
  from unnest(v_ids) as u(id)
  where exists (select 1 from public.questions q
                 where q.id = u.id
                   and q.olympiad_package_id is distinct from p_package_id);
  select count(*)::int into v_missing
  from unnest(v_ids) as u(id)
  where not exists (select 1 from public.questions q where q.id = u.id);
  if v_foreign > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_not_in_package',
                                             'count', v_foreign);
  end if;
  if v_missing > 0 then
    v_scope := v_scope || jsonb_build_object('hint', 'question_gone',
                                             'count', v_missing);
  end if;
  if jsonb_array_length(v_scope) > 0 then
    raise exception
      'admin_set_olympiad_questions_status: % of % selected id(s) are not in package %, % no longer exist',
      v_foreign, cardinality(v_ids), p_package_id, v_missing
      using errcode = 'check_violation',
            hint    = case when v_foreign > 0
                           then 'question_not_in_package' else 'question_gone' end,
            detail  = jsonb_build_object('blocks', v_scope)::text;
  end if;

  -- THE PURCHASE RULE — ARCHIVE DIRECTION ONLY.
  --
  -- Delegated whole to the SAME predicate the delete path uses. A second,
  -- hand-written copy of "what counts as a purchase" here is precisely how
  -- archiving came to bypass the rule migration 111 already enforced, and why
  -- 112 extracted the helper. Publishing only ever GROWS the published pool, so
  -- it needs no check.
  if p_status = 'archived' then
    v_blocks := public.olympiad_pool_purchase_blocks(p_package_id, v_ids);
    if jsonb_array_length(v_blocks) > 0 then
      raise exception
        'admin_set_olympiad_questions_status: % purchased grade pool(s) would fall below one attempt',
        jsonb_array_length(v_blocks)
        using errcode = 'check_violation',
              hint    = 'grade_purchased_pool_below_attempt',
              detail  = jsonb_build_object('blocks', v_blocks)::text;
    end if;
  end if;

  -- `status <> p_status` makes the call IDEMPOTENT: re-running it changes
  -- nothing and reports `already_in_status`, so a double-click cannot produce a
  -- second audit row claiming work that did not happen. The package scope is
  -- restated here as well as checked above — belt and braces on a statement that
  -- writes.
  -- `questions.status` is the content_status ENUM, so the text parameter is cast
  -- once, here, after it has been whitelisted above. Casting an unvalidated
  -- string would turn a typo into invalid_text_representation instead of the
  -- named `bad_status` refusal the UI can translate.
  update public.questions
     set status     = p_status::public.content_status,
         updated_at = now()
   where id = any(v_ids)
     and olympiad_package_id = p_package_id
     and status is distinct from p_status::public.content_status;
  get diagnostics v_changed = row_count;
  v_already := cardinality(v_ids) - v_changed;

  -- AUTO-DEMOTION — ARCHIVE DIRECTION ONLY. Same behaviour as the delete path
  -- and for the same reason: leaving an ACTIVE package whose pool can no longer
  -- fill an attempt means the next child to open it gets a short attempt rather
  -- than a closed listing. Reachable even with the purchase rule above, because
  -- a grade nobody bought can still be emptied.
  if p_status = 'archived' and v_pkg.status = 'active' then
    begin
      perform public.assert_olympiad_pool_meets_per_attempt(
                p_package_id, v_pkg.questions_per_attempt);
    exception when check_violation then
      v_demote := true;
    end;
    if v_demote then
      update public.olympiad_packages
         set status = 'inactive', updated_at = now()
       where id = p_package_id;
      -- This UPDATE re-fires trg_olympiad_activation_pool_guard, which looks
      -- like it must fail the very assertion that just failed. It does not: the
      -- guard returns early for any row whose new.status is not 'active'. That
      -- early return is what the whole demotion rests on — do not "simplify" it
      -- by suppressing the trigger.
    end if;
  end if;

  -- No `orphaned_media_ids`: a status change orphans nothing. The caller still
  -- routes through afterOlympiadDestructiveCall so the audit path has one
  -- definition; it simply sweeps an empty array.
  return jsonb_build_object(
    'package_id',       p_package_id,
    'status',           p_status,
    'requested',        cardinality(v_ids),
    'changed',          v_changed,
    'already_in_status', v_already,
    'package_demoted',  v_demote);
end;
$$;

comment on function public.admin_set_olympiad_questions_status(uuid, uuid[], text, text) is
  'Admin-only (migration 144): archive or re-publish a SELECTION of questions '
  'inside ONE olympiad package. Archiving removes a question from every future '
  'attempt exactly as deletion does, so it carries the SAME guards: package lock, '
  'confirmation code re-checked under it, all-or-nothing scope proof, the shared '
  'purchased-grade floor predicate, and auto-demotion of an ACTIVE package whose '
  'pool can no longer fill an attempt. Publishing only grows the pool and skips '
  'the floor checks. Idempotent: re-running reports already_in_status.';

revoke all on function public.admin_set_olympiad_questions_status(uuid, uuid[], text, text)
  from public, anon;
grant execute on function public.admin_set_olympiad_questions_status(uuid, uuid[], text, text)
  to authenticated, service_role;

revoke all on function public.admin_delete_olympiad_pool_question(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_olympiad_pool_question(uuid, uuid)
  to authenticated, service_role;

-- bulk_insert_questions (v3, migration 059) : atomic, per-item fault-tolerant
-- batch insert across the normalized trilingual question tables. Resolves
-- taxonomy by code/level/name and auto-creates missing topics/subtopics/sources.
-- Each item runs in its own subtransaction (BEGIN..EXCEPTION): a bad item is
-- skipped + reported, good items persist. Returns {total, successful, failed,
-- errors[]}. Since Round 20: meta.type is OPTIONAL (defaults single_choice),
-- meta.topic/meta.subtopic/meta.term (1..4) are REQUIRED, and an optional
-- meta.media_asset_id links the primary locale's pre-uploaded question image.
--
-- Item shape (JSON):
-- {
--   "primary_locale": "az",
--   "meta": { "subject","grade_level","topic","subtopic","term",
--             "type"?, "olympiad_type"?, "source"?, "media_asset_id"? },
--   "translations": { "az": {"body","prompt"?,"explanation"?}, "en"?: {...}, "ru"?: {...} },
--     Migration 119: "explanation" is PER LOCALE and INDEPENDENT of "body" --
--     a locale may carry an explanation with no body and it still lands as
--     its own question_explanations row.
--   "options": [ { "is_correct": true, "order_index"?: 0, "text": {"az": "...","en"?:"...","ru"?:"..."} } ]
-- }
create or replace function public.bulk_insert_questions(
  p_questions jsonb,
  p_filename  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_term     smallint; v_topic_term smallint;
  v_media    uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
begin
  if v_profile is null or not (public.is_admin() or public.has_permission('content.create')) then
    raise exception 'bulk_insert_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_questions: payload must be a JSON array';
  end if;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      -- ---- required base taxonomy ----
      select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      if v_subject is null then raise exception 'unknown subject %', coalesce(v_item->'meta'->>'subject','(null)'); end if;

      select id into v_grade from public.grades where level = nullif(v_item->'meta'->>'grade_level','')::smallint;
      if v_grade is null then raise exception 'unknown grade_level %', coalesce(v_item->'meta'->>'grade_level','(null)'); end if;

      -- type is optional since Round 20 — the platform is MCQ (single_choice).
      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      -- Per-type structure rules (five options, exactly one correct — 055).
      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- ---- REQUIRED term (Rüb) ----
      v_term := nullif(v_item->'meta'->>'term','')::smallint;
      if v_term is null or v_term not between 1 and 4 then
        raise exception 'term (1..4) is required';
      end if;

      v_oly := null;
      if coalesce(v_item->'meta'->>'olympiad_type','') <> '' then
        select id into v_oly from public.olympiad_types where name = (v_item->'meta'->>'olympiad_type');
      end if;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      -- ---- REQUIRED topic + subtopic (exam scope) ----
      if coalesce(v_item->'meta'->>'topic','') = '' then
        raise exception 'topic is required';
      end if;
      if coalesce(v_item->'meta'->>'subtopic','') = '' then
        raise exception 'subtopic is required';
      end if;

      select id, term into v_topic, v_topic_term from public.topics
        where subject_id = v_subject and name = (v_item->'meta'->>'topic')
          and scope = 'exam' limit 1;
      if v_topic is null then
        insert into public.topics (subject_id, grade_id, name, scope, term)
        values (v_subject, v_grade, v_item->'meta'->>'topic', 'exam', v_term)
        returning id into v_topic;
      elsif v_topic_term is null then
        -- explicit admin declaration upgrades a legacy (unreviewed) topic; the
        -- 054 cascade rolls the term onto its subtopics/questions.
        update public.topics set term = v_term, updated_at = now() where id = v_topic;
      elsif v_topic_term <> v_term then
        raise exception 'term % conflicts with topic "%" (term %)',
          v_term, v_item->'meta'->>'topic', v_topic_term;
      end if;

      select id into v_subtopic from public.subtopics
        where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
      if v_subtopic is null then
        insert into public.subtopics (topic_id, name, term)
        values (v_topic, v_item->'meta'->>'subtopic', v_term) returning id into v_subtopic;
      end if;

      -- ---- optional pre-uploaded question image ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      -- ---- primary locale + required body ----
      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale, term, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'in_review', v_pl::public.content_locale, v_term, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') then
          -- Migration 119: the BODY guard wraps the TRANSLATION row only. It
          -- used to wrap the explanation insert too, so a locale supplying an
          -- explanation but no body had that explanation silently dropped --
          -- no row, no error, nothing in the per-item errors array.
          -- question_explanations has NO FK to question_translations and
          -- get_test_review joins the two independently, so an
          -- explanation-only locale is perfectly servable: that reader gets
          -- their own explanation next to the az body.
          -- BACKWARD COMPATIBLE: a legacy payload carrying only
          -- translations.az.{body,explanation} still lands exactly one az
          -- translation row and one az explanation row, unchanged.
          if coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
            insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                    nullif(v_item->'translations'->v_loc->>'prompt',''),
                    case when v_loc = v_pl then v_media end);
          end if;
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          -- Migration 104: write the row when the locale has TEXT **or** an
          -- IMAGE. The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            if coalesce(v_opt->'image'->>v_loc,'') <> ''
               and not exists (
                 select 1 from public.media_assets ma
                  where ma.id = (v_opt->'image'->>v_loc)::uuid
                    and ma.bucket = 'question-media') then
              raise exception 'option image does not reference a question-media asset';
            end if;
            insert into public.answer_option_translations (option_id, locale, text, media_asset_id)
            values (v_optid, v_loc::public.content_locale,
                    coalesce(v_opt->'text'->>v_loc, ''),
                    nullif(v_opt->'image'->>v_loc,'')::uuid);
          end if;
        end loop;
      end loop;

      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  insert into public.question_imports (imported_by, filename, subject_id, total, successful, failed, errors)
  values (v_profile, p_filename,
          (select id from public.subjects where name = (p_questions->0->'meta'->>'subject')),
          v_idx, v_ok, v_fail, case when v_errors = '[]'::jsonb then null else v_errors end);

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_questions(jsonb, text) is
  'Bulk question import v3 (Round 20): topic+subtopic+term REQUIRED, type optional '
  '(defaults single_choice, 5 options), optional pre-uploaded question image; exam-'
  'scoped taxonomy resolve-or-create; per-item fault tolerance. content.create gated.';

-- EXECUTE: authenticated content authors + service_role; never anon/public.
revoke all on function public.bulk_insert_questions(jsonb, text) from public, anon;
grant execute on function public.bulk_insert_questions(jsonb, text) to authenticated, service_role;

-- question_imports table privileges. MUST run here (after 010's blanket grants)
-- so the write-revoke for `authenticated` takes effect: importer/admin may READ
-- (RLS in 010 limits rows); writes happen only via the DEFINER fn above.
revoke all on public.question_imports from anon, authenticated;
grant select on public.question_imports to authenticated;  -- RLS limits rows
grant all on public.question_imports to service_role;

-- -----------------------------------------------------------------------------
-- Parent self-registration (Stage 10, increment 1).
-- Backported from migrations/2026_06_28_011_parent_registration.sql. Placed at
-- the END of this file so the function-privilege REVOKE below runs AFTER 010's
-- blanket grants — otherwise anon/authenticated's EXECUTE grant would remain.
-- The web-app registration server action creates the Auth user (service role,
-- email_confirm) then calls this to promote the auto-created profile into an
-- ACTIVE parent (parent role + parents row). Provider-agnostic; no email
-- dependency (we use admin.createUser, not signUp + email confirmation).
-- SECURITY DEFINER; service_role EXECUTE only (like create_child_account).
-- -----------------------------------------------------------------------------
create or replace function public.setup_parent(
  p_auth_user_id uuid,
  p_display_name text default null
)
returns uuid  -- the parent's profile id
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
  v_role    uuid;
begin
  select id into v_profile from public.profiles where auth_user_id = p_auth_user_id;
  if v_profile is null then
    raise exception 'setup_parent: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Migration 105: a STAFF profile must never be turned into a parent either.
  -- Login SELF-HEALS a missing parents row after a correct password (web
  -- parentLogin, and the mobile /auth/heal BFF), so without this an
  -- administrator signing in to the parent app would silently gain a parent
  -- account beside their staff role.
  if exists (
    select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
     where pr.profile_id = v_profile
       and r.code in ('administrator', 'content_manager')
  ) then
    raise exception 'setup_parent: profile % holds a staff role', v_profile
      using errcode = 'check_violation';
  end if;

  -- A child profile must never be turned into a parent.
  if exists (select 1 from public.students s where s.profile_id = v_profile) then
    raise exception 'setup_parent: profile % is a student', v_profile using errcode = 'check_violation';
  end if;

  update public.profiles
     set status       = 'active',
         display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         updated_at   = now()
   where id = v_profile;

  insert into public.parents (profile_id) values (v_profile)
  on conflict (profile_id) do nothing;

  select id into v_role from public.roles where code = 'parent';
  if v_role is null then raise exception 'setup_parent: parent role missing (seed 012)'; end if;
  insert into public.profile_roles (profile_id, role_id) values (v_profile, v_role)
  on conflict do nothing;

  return v_profile;
end;
$$;

comment on function public.setup_parent(uuid, text) is
  'Promote an auth user''s profile to an active parent (parent role + parents row). service_role EXECUTE only; run after admin.createUser.';

revoke all on function public.setup_parent(uuid, text) from public, anon, authenticated;
grant execute on function public.setup_parent(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Child subscription engine (Stage 11, increment 1; PER-SUBJECT since 109).
-- Backported from migrations/2026_06_28_012_child_subscription_engine.sql and
-- migrations/2026_08_11_109_per_subject_billing_interval.sql. Placed at the END
-- of this file so the function-privilege REVOKEs below run AFTER 010's blanket
-- grants — otherwise anon/authenticated's EXECUTE grant would remain.
--
-- Every subject carries its OWN cycle and its OWN period, so the authoritative
-- pair is quote_child_plan / create_child_plan, taking a validated basket
-- [{subject_id, interval}]. plan_items_normalize is the single input gate: it
-- enforces the array shape, the <=20 cap, UUID-shaped ids and the plan_interval
-- whitelist, and de-duplicates. Prices are ALWAYS re-read from subjects_pricing
-- and the sibling discount (2nd 10% / 3rd+ 15%, investor 2026-07-15) is applied
-- per cycle group with the historical rounding rule, so a uniform basket
-- returns exactly the number the single-interval path always returned.
--
-- quote_child_subscription / create_child_subscription stay as thin wrappers
-- with their EXACT historical signatures: 013 pins them, admin_grant_child_access
-- calls them and already-shipped mobile binaries still post {interval,
-- subject_ids}. They build a uniform basket and delegate — ONE implementation.
--
-- SECURITY DEFINER; service_role EXECUTE only (called from the parent server
-- action's admin client after it authorizes the parent + child). create_* calls
-- quote_*, so quote_* is defined first.
-- -----------------------------------------------------------------------------

create or replace function public.plan_items_normalize(p_items jsonb)
-- `interval` is a reserved type keyword, so it cannot be a bare RETURNS TABLE
-- column name — the parser reads it as the start of a type. Quoting the
-- DECLARATION is enough: qualified reads (n.interval) still resolve unquoted,
-- so all 31 call sites are untouched.
returns table (subject_id uuid, "interval" public.plan_interval)
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'plan: items must be a json array'
      using errcode = 'check_violation', hint = 'bad_items';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'plan: too many subjects'
      using errcode = 'check_violation', hint = 'too_many_subjects';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where jsonb_typeof(e.v) <> 'object'
  ) then
    raise exception 'plan: item must be an object'
      using errcode = 'check_violation', hint = 'bad_items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where coalesce(e.v ->> 'subject_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'plan: bad subject id'
      using errcode = 'check_violation', hint = 'bad_subject';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where coalesce(e.v ->> 'interval', '') not in ('week', 'month', 'year')
  ) then
    raise exception 'plan: bad interval'
      using errcode = 'check_violation', hint = 'bad_interval';
  end if;

  -- LAST occurrence wins: a UI that appends a changed cycle must not have to
  -- rewrite the array it already sent.
  return query
    select distinct on ((e.v ->> 'subject_id')::uuid)
           (e.v ->> 'subject_id')::uuid,
           (e.v ->> 'interval')::public.plan_interval
    from jsonb_array_elements(p_items) with ordinality as e(v, ord)
    order by (e.v ->> 'subject_id')::uuid, e.ord desc;
end;
$$;

comment on function public.plan_items_normalize(jsonb) is
  'Migration 109: the ONE server-side gate for a client-supplied plan basket. Enforces array shape, <=20 items, UUID-shaped subject_id and the plan_interval whitelist, de-duplicating on subject_id (last wins). Raises check_violation with hints bad_items / bad_subject / bad_interval / too_many_subjects.';

create or replace function public.quote_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_rank    int;
  v_pct     numeric(5,2);
  v_missing int;
  v_count   int;
  v_base    numeric(12,2);
  v_disc    numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_items   jsonb;
  v_groups  jsonb;
  v_ivs     int;
  -- Migration 125: the two values that make this quote agree with the charge.
  v_had_any boolean;
  v_due     numeric(12,2);
begin
  select count(*) into v_count from public.plan_items_normalize(p_items);
  if v_count = 0 then raise exception 'quote: no subjects selected'; end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every (subject, ITS OWN cycle) pair must have active pricing. Same message
  -- shape as the single-interval quote so existing mappers keep working.
  select count(*) into v_missing
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = n.subject_id
      and sp.interval = n.interval
      and sp.status = 'active');
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  -- Sibling rank = (this parent's OTHER children already on a live
  -- subscription) + 1. Copied verbatim from quote_child_subscription: a fixed
  -- percent composes trivially across cycle groups.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id,
           'interval',   n.interval,
           'price',      sp.price_amount,
           'currency',   'AZN'))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  -- Per-cycle groups, each rounded with EXACTLY today's rule
  -- (discount = round(group_base * pct / 100, 2)).
  with g as (
    select n.interval as iv,
           count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt,
           'base',  g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         coalesce(sum(g.base), 0),
         coalesce(sum(round(g.base * v_pct / 100.0, 2)), 0),
         count(*)::int
    into v_groups, v_base, v_disc, v_ivs
  from g;

  v_total := v_base - v_disc;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  -- MIGRATION 133 -- THE "LAUNCH PROMOTION" TOGGLE NOW MEANS SOMETHING.
  --
  -- It used to gate exactly one sentence on the public pricing page while the
  -- trial was granted regardless, so switching it OFF stopped ADVERTISING the
  -- promotion and carried on giving it away -- the copy and the behaviour
  -- diverging in the worst of the two directions. There is no other control:
  -- the admin panel has no editor for trial_days, so ending the trial meant raw
  -- SQL against production.
  --
  -- A zero trial is already safe: migration 126's guard routes trial_days = 0
  -- into the ACTIVE/paid branch instead of writing a trial that has already
  -- ended.
  if not coalesce((select enabled from public.feature_flags where key = 'launch_promo'), false) then
    v_trial := 0;
  end if;

  -- MIGRATION 125 -- audit invariant H7 (the preview and the charge are one
  -- computation). The free trial is granted ONCE PER CHILD: create_child_plan
  -- reads exactly this predicate (any prior subscription row, canceled and
  -- expired included) and sets trial_days = 0 / status = 'active' when it is
  -- true. Until now the quote did not look, so a returning child was previewed
  -- a trial they would not get, and a first-time child was previewed a "due
  -- today" of the full total that create_child_plan would not charge. The
  -- preview contradicted the charge in BOTH directions.
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);
  if v_had_any then v_trial := 0; end if;

  -- What the family owes RIGHT NOW. A trialing plan owes nothing until the
  -- trial ends -- create_child_plan runs every subject's first period to the
  -- trial end -- so this is the amount, and the ONLY amount, a checkout may be
  -- opened for.
  v_due := case when v_trial > 0 then 0 else v_total end;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'groups', coalesce(v_groups, '{}'::jsonb),
    'base', v_base, 'discount_percent', v_pct, 'discount', v_disc,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN',
    'due_now', v_due,
    'mixed', coalesce(v_ivs, 0) > 1);
end;
$$;

comment on function public.quote_child_plan(uuid, jsonb) is
  'Migration 109: read-only price quote for a PER-SUBJECT basket [{subject_id, interval}]. Prices are re-read from subjects_pricing; the sibling discount (2nd 10% / 3rd+ 15%) is applied per cycle group with today''s rounding rule, so a uniform basket returns exactly the number quote_child_subscription always returned. Migration 125: also applies create_child_plan''s one-trial-per-child rule and returns due_now -- the preview and the charge are one computation (audit H7).';


create or replace function public.create_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner    uuid;
  v_q        jsonb;
  v_sub      uuid;
  v_trial    int;
  v_child    text;
  v_auth     uuid;
  v_had_any  boolean;
  -- Migration 126: the trial the CONFIG offers, before the one-per-child rule.
  -- Named rather than inlined so the two questions stay separate: "is a trial
  -- on offer at all?" and "has this child already had theirs?".
  v_offer    int;
  v_status   public.subscription_status;
  v_default  public.plan_interval;
  v_trialend timestamptz;
  v_row      record;
begin
  -- Round 48 kill switch (migration 089): no paid write while the payment mode
  -- is off. Defence in depth -- the web/BFF layer checks too, but this is the
  -- layer that cannot be forgotten.
  perform public.assert_payments_enabled();

  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  -- Serialize all subscription writes of ONE family: prevents the double-submit
  -- duplicate row and the concurrent sibling-rank race (audit C2 + M14).
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'create: child already has a live subscription'
      using errcode = 'unique_violation';
  end if;

  v_q := public.quote_child_plan(p_student_profile_id, p_items);

  -- The DEFAULT cycle for subjects added later = the most common cycle in the
  -- basket; ties resolve year > month > week (the longer commitment is the
  -- safer default to inherit).
  select n.interval into v_default
  from public.plan_items_normalize(p_items) n
  group by n.interval
  order by count(*) desc,
           case n.interval when 'year' then 3 when 'month' then 2 else 1 end desc
  limit 1;

  -- Trial once per child: any prior subscription row (canceled/expired
  -- included) means no new free trial (audit C2).
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);

  -- MIGRATION 126 -- A ZERO-DAY TRIAL IS NOT A TRIAL.
  --
  -- The branch used to be on v_had_any ALONE, so with
  -- launch_promo_config.trial_days = 0 a first-time child took the `trialing`
  -- side with v_trial = 0: trial_ends_at = now(), every subject's
  -- current_period_end = now(), and access_status = 'trialing'. The row
  -- announced a running trial while the period it granted had ALREADY ENDED --
  -- and quote_child_plan, reading the same 0, priced due_now at the FULL total.
  -- So the family was charged for a plan that expired the instant it existed.
  --
  -- The rule is now one sentence: a plan is `trialing` only when it actually
  -- has trial days left to run. Everything else is an ACTIVE plan whose
  -- subjects open real, paid, full-length periods -- which is what the checkout
  -- took the money for.
  v_offer := greatest(coalesce((v_q->>'trial_days')::int, 0), 0);
  if v_had_any or v_offer <= 0 then
    v_trial  := 0;
    v_status := 'active';
  else
    v_trial  := v_offer;
    v_status := 'trialing';
  end if;
  v_trialend := now() + (v_trial || ' days')::interval;

  -- base/discount/total/current_period_end/next_renewal_at are DELIBERATELY not
  -- written here: trg_sync_subscription_period derives all five from the
  -- per-subject rows inserted below.
  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start,
     sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, v_default, v_status,
     case when v_status = 'trialing' then now() end,
     case when v_status = 'trialing' then v_trialend end,
     now(),
     (v_q->>'discount_percent')::numeric, 'AZN', 'none')
  returning id into v_sub;

  for v_row in
    select n.subject_id, n.interval, sp.price_amount
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
  loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub, v_row.subject_id, v_row.interval, v_row.price_amount, 'AZN',
       now(),
       case when v_status = 'trialing' then v_trialend
            else now() + case v_row.interval
                           when 'week'  then interval '7 days'
                           when 'month' then interval '1 month'
                           else              interval '1 year'
                         end
       end)
    on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the deferred 8-digit login ID now (first plan chosen) if the child
  -- has none, and backfill the credential mapping so child login works.
  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  update public.students
     set access_status = case when v_status = 'trialing' then 'trialing' else 'active' end::public.child_access_status
   where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object(
    'subscription_id', v_sub, 'status', v_status::text, 'trial_days', v_trial,
    'interval', v_default::text,
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.create_child_plan(uuid, jsonb) is
  'Migration 109: starts a child subscription from a PER-SUBJECT basket. Each subject opens its own period (trial end while trialing, else now() + its own cycle); child_subscriptions.interval stores only the DEFAULT cycle for future adds. The amount columns are left to trg_sync_subscription_period. Migration 126: the trialing branch is taken ONLY when the effective trial is at least one day, so trial_days = 0 can no longer create a plan whose period has already ended.';

-- Read-only price quote (base, sibling discount, total, trial length) — the
-- uniform-basket wrapper over quote_child_plan.
create or replace function public.quote_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_items jsonb;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'quote: no subjects selected';
  end if;
  select jsonb_agg(jsonb_build_object('subject_id', s.sid, 'interval', p_interval))
    into v_items from unnest(p_subject_ids) s(sid);
  return public.quote_child_plan(p_student_profile_id, v_items);
end;
$$;

-- Create the subscription as a trial (computes amounts via quote; writes rows).
-- Batch H: ALSO allocates the deferred 8-digit login ID on the FIRST subscription
-- for a child that still has none, backfills child_credentials, and returns
-- new_child_unique_id + auth_user_id so the server action sets the synthetic email.
-- -----------------------------------------------------------------------------
-- PAYMENTS KILL SWITCH (migration 089, Round 48)
-- -----------------------------------------------------------------------------
-- current_payment_mode() is the SQL-side single source of truth for the payment
-- mode, with the same semantics as get_mobile_config().payment.mode.
-- assert_payments_enabled() is called at the top of every paid mutation so the
-- "payments off" kill switch cannot be bypassed by a server action or BFF route
-- that forgets to check it. SECURITY DEFINER because feature_flags and
-- system_settings are admin-RLS locked; only the derived mode string is exposed.
create or replace function public.current_payment_mode()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags      jsonb;
  v_real       boolean;
  v_gvw_flag   boolean;
  v_gvw_active boolean := false;
  v_gvw_days   int := 0;
  v_gvw_start  timestamptz;
  v_setting    jsonb;
begin
  select jsonb_object_agg(key, enabled) into v_flags
    from public.feature_flags
   where key in ('payments', 'giveaway_period');

  v_real     := coalesce((v_flags ->> 'payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags ->> 'giveaway_period')::boolean, false);

  select value_json into v_setting from public.system_settings
   where key = 'giveaway.duration_days';
  if v_setting is not null then
    begin
      v_gvw_days := floor((v_setting #>> '{}')::numeric)::int;
    exception when others then
      v_gvw_days := 0;
    end;
  end if;

  select value_json into v_setting from public.system_settings
   where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;

  -- MIGRATION 135: `v_real and` is the whole change. A campaign is a modifier on
  -- an open rail; without the rail there is no campaign, only 'off'.
  if v_real and v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_active := now() < v_gvw_start + make_interval(days => v_gvw_days);
  end if;

  return case
    when v_gvw_active then 'giveaway'
    when v_real       then 'real'
    else 'off'
  end;
end;
$$;

comment on function public.current_payment_mode() is
  'Migration 121: resolves payments/giveaway_period into '
  'off|real|giveaway with EXACTLY get_mobile_config''s parsing rules — '
  'a 013 check asserts the two can never drift. Missing flag rows mean OFF '
  '(fail closed); a malformed giveaway window means "no window", never an '
  'exception out of a money gate. The demo mode was deleted on 2026-08-18.';

revoke all on function public.current_payment_mode() from public, anon;
grant execute on function public.current_payment_mode() to authenticated, service_role;

create or replace function public.assert_payments_enabled()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_payment_mode() = 'off' then
    -- hint = the stable key the web/BFF mappers translate to the trilingual
    -- gate.paymentsOff notice (they key off hints, never raw message text).
    raise exception 'payments: disabled'
      using errcode = 'check_violation', hint = 'payments_disabled';
  end if;
end;
$$;

comment on function public.assert_payments_enabled() is
  'Round 48/51: hard server-side payment kill switch. Raises check_violation '
  'with hint payments_disabled while current_payment_mode() = off; called '
  'first inside every paid RPC (create_child_subscription, purchase_olympiad, '
  'add_subscription_subject, apply_plan_change adds and cycle changes).';

revoke all on function public.assert_payments_enabled() from public, anon, authenticated;
grant execute on function public.assert_payments_enabled() to service_role;

create or replace function public.create_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_items jsonb;
begin
  -- Round 48 kill switch: create_child_plan asserts too, but this wrapper is a
  -- paid entry point in its own right and must not depend on its callee for a
  -- money gate.
  perform public.assert_payments_enabled();
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'create: no subjects selected';
  end if;
  select jsonb_agg(jsonb_build_object('subject_id', s.sid, 'interval', p_interval))
    into v_items from unnest(p_subject_ids) s(sid);
  return public.create_child_plan(p_student_profile_id, v_items);
end;
$$;

-- add_subscription_subject / remove_subscription_subject (Batch H): let a parent edit
-- the subjects on a child's current live subscription. Re-priced server-side from the
-- subscription's interval pricing at the kept sibling rate; never client-set amounts.
create or replace function public.add_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_price    numeric(12,2);
  v_end      timestamptz;
begin
  perform public.assert_payments_enabled();
  select id, interval, owner_parent_profile_id, current_period_end
    into v_sub, v_interval, v_owner, v_end
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  select sp.price_amount into v_price
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active';
  if v_price is null then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects
    (child_subscription_id, subject_id, interval, price_amount, currency,
     current_period_start, current_period_end)
  values
    (v_sub, p_subject_id, v_interval, v_price, 'AZN', now(),
     now() + case v_interval
               when 'week'  then interval '7 days'
               when 'month' then interval '1 month'
               else              interval '1 year'
             end)
  on conflict (child_subscription_id, subject_id) do update
    set remove_at = null, price_amount = excluded.price_amount;

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- The percent moves first, then one touch of the subject rows re-fires
  -- trg_sync_subscription_period so base/discount/total are re-derived from the
  -- new percent by their single writer.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

create or replace function public.remove_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   uuid;
  v_owner uuid;
  v_rank  int;
  v_pct   numeric(5,2);
  v_count int;
begin
  select id, owner_parent_profile_id into v_sub, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'remove_subject: no active subscription'; end if;

  select count(*) into v_count
  from public.subscription_subjects where child_subscription_id = v_sub;
  if v_count <= 1 then
    raise exception 'remove_subject: at least one subject must remain';
  end if;

  delete from public.subscription_subjects
  where child_subscription_id = v_sub and subject_id = p_subject_id;

  -- Audit H7: live sibling rank (see add_subscription_subject).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- Percent first, then one no-op touch of the subject rows so
  -- trg_sync_subscription_period (their single writer) re-derives the amounts
  -- from the NEW percent — the delete above fired it with the old one.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

revoke all on function public.quote_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.quote_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;
revoke all on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;
revoke all on function public.add_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_subscription_subject(uuid, uuid) to service_role;
revoke all on function public.remove_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_subscription_subject(uuid, uuid) to service_role;
-- Migration 109 — the per-subject engine + its input gate + the period trigger.
revoke all on function public.plan_items_normalize(jsonb) from public, anon, authenticated;
grant execute on function public.plan_items_normalize(jsonb) to service_role;
revoke all on function public.quote_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_child_plan(uuid, jsonb) to service_role;
revoke all on function public.create_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child_plan(uuid, jsonb) to service_role;
revoke all on function public.fn_sync_subscription_period() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin subject pricing (migration 069): the ONLY admin write path into
-- subjects_pricing (everything else is service-role only). Administrator-only
-- via the in-body is_admin() guard (content managers never pass — pricing is
-- an Admin-only module); validates subject/interval/amount server-side; the
-- currency is never client-set; every change audits into audit_logs with the
-- same shape the admin panel's writeAuditLog helper records.
-- -----------------------------------------------------------------------------
create or replace function public.admin_upsert_subject_price(
  p_subject_id uuid,
  p_interval   text,
  p_amount     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_old   numeric(12,2);
  v_new   numeric(12,2);
  v_id    uuid;
  v_cur   text;
begin
  -- Administrator ONLY — guard before reading/using any input. is_admin() is
  -- has_role('administrator'); content managers (or any permission holder)
  -- must NOT pass, so no has_permission() escape hatch here.
  if not public.is_admin() then
    raise exception 'pricing: forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_subject_id is null
     or not exists (select 1 from public.subjects s where s.id = p_subject_id) then
    raise exception 'pricing: unknown subject' using errcode = 'check_violation';
  end if;
  -- Whitelist = the public.plan_interval enum values used by subjects_pricing.
  if p_interval is null or p_interval not in ('week', 'month', 'year') then
    raise exception 'pricing: bad interval' using errcode = 'check_violation';
  end if;
  -- Finite, positive, sane cap, max 2 decimals (numeric NaN/Infinity compare
  -- greater than any number → caught by the > 10000 branch; -Infinity by <= 0).
  if p_amount is null or p_amount <= 0 or p_amount > 10000
     or p_amount <> round(p_amount, 2) then
    raise exception 'pricing: bad amount' using errcode = 'check_violation';
  end if;
  v_new := round(p_amount, 2);

  select sp.price_amount into v_old
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id
    and sp.interval = p_interval::public.plan_interval;

  -- Upsert on the (subject_id, interval) unique key. Currency stays whatever
  -- the row/system uses (default 'AZN' on insert; untouched on update).
  insert into public.subjects_pricing (subject_id, interval, price_amount)
  values (p_subject_id, p_interval::public.plan_interval, v_new)
  on conflict (subject_id, interval)
  do update set price_amount = excluded.price_amount, updated_at = now()
  returning id, currency into v_id, v_cur;

  -- Same audit mechanism the other Admin-only mutations use (audit_logs row,
  -- small metadata diff — never large bodies, never credentials).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.pricing.subject_price_upsert', 'subjects_pricing', v_id,
     jsonb_build_object(
       'subject_id', p_subject_id,
       'interval', p_interval,
       'old_amount', v_old,
       'new_amount', v_new),
     'info', true);

  return jsonb_build_object(
    'id', v_id,
    'subject_id', p_subject_id,
    'interval', p_interval,
    'old_amount', v_old,
    'new_amount', v_new,
    'currency', v_cur);
end;
$$;
comment on function public.admin_upsert_subject_price(uuid, text, numeric) is
  'Admin-only (in-body is_admin guard — content managers never pass) upsert of '
  'one subjects_pricing row (subject × week|month|year). Validates subject/'
  'interval/amount server-side, never touches currency, audits into audit_logs. '
  'Migration 069.';

-- Grants: same pattern as admin_send_notification — the in-body admin check
-- gates authenticated callers; anon/public never execute.
revoke all on function public.admin_upsert_subject_price(uuid, text, numeric) from public, anon;
grant execute on function public.admin_upsert_subject_price(uuid, text, numeric) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Round 11 (migrations 2026_07_04_025 + 027) / migration 121: payment-mode
-- exclusivity + free-access grants. TWO payment-mode flags exist — payments
-- (real/automatic) and giveaway_period — and the DB guarantees at most ONE is
-- enabled. Neither enabled = mode `off` (the kill switch, and the fail-closed
-- fallback every resolver returns). The demo mode was DELETED by 121.
-- -----------------------------------------------------------------------------

-- is_giveaway_active() — single DB-side source of truth for the free window
-- (used by start_practice_attempt / start_olympiad_attempt guards above).
-- SECURITY DEFINER because feature_flags / system_settings are admin-only under
-- RLS while this must be evaluable from child-session RPCs. Exception-safe: any
-- malformed setting means "not active" (a config hiccup must never open or
-- extend a free-access window). An elapsed window is INACTIVE even while the
-- flag is still on — expiry needs no job.
create or replace function public.is_giveaway_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- MIGRATION 134: delegate, so a campaign can never be "running" for access and
  -- "not running" for the payment mode. current_payment_mode() parses the flag,
  -- the start and the duration itself and does NOT call this function, so this
  -- is a one-way dependency and cannot recurse.
  select public.current_payment_mode() = 'giveaway';
$$;

comment on function public.is_giveaway_active() is
  'True while the admin giveaway window (giveaway_period flag + giveaway.started_at + giveaway.duration_days) is running. Elapsed window = false even if the flag is still on.';

revoke all on function public.is_giveaway_active() from public, anon, authenticated;
grant execute on function public.is_giveaway_active() to service_role;

-- -----------------------------------------------------------------------------
-- Round 12 (migration 033): per-parent/child scheduled FREE-ACCESS intervals.
-- An admin-created row in free_access_intervals (below in 008/010) grants free
-- access to a specific child OR to a whole parent's children for a time window.
-- Like the giveaway, access is evaluated LAZILY at use time (no state to unwind
-- on expiry). SECURITY DEFINER because free_access_intervals is admin-only RLS but
-- these must be evaluable from child-session RPCs and parent-session reads.
-- -----------------------------------------------------------------------------
-- True while a student has an active free interval (their own, or one targeting
-- their creating parent). Used inside the attempt-start RPC guards.
create or replace function public.is_free_access_active_for_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.free_access_intervals f
    where f.is_active
      and now() >= f.starts_at and now() < f.ends_at
      and (
        f.student_profile_id = p_student
        or f.parent_profile_id = (
          select s.created_by_parent_profile_id
          from public.students s where s.profile_id = p_student
        )
      )
  );
$$;
comment on function public.is_free_access_active_for_student(uuid) is
  'True while an admin free-access interval covers this student (its own or its parent''s). Lazy expiry — an elapsed window is false.';
-- Internal SECURITY DEFINER callers only (my_free_access_active, is_child_free_access_active,
-- the attempt RPCs run as owner). Not directly authenticated-executable (migration 034).
revoke all on function public.is_free_access_active_for_student(uuid) from public, anon, authenticated;
grant execute on function public.is_free_access_active_for_student(uuid) to service_role;

-- Per-child free status scoped to the caller (own child / self only) — the parent
-- subscription gate + display use this so a per-child window never blocks an
-- uncovered sibling. (Round 12 pass-2 / migration 034.)
create or replace function public.is_child_free_access_active(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_student is null then false
    when p_student = public.current_profile_id()
      then public.is_free_access_active_for_student(p_student)
    when exists (
      select 1 from public.students s
      where s.profile_id = p_student
        and s.created_by_parent_profile_id = public.current_profile_id()
    ) then public.is_free_access_active_for_student(p_student)
    else false
  end;
$$;
comment on function public.is_child_free_access_active(uuid) is
  'Per-child free-access flag, scoped to the caller (own child / self only). Parent subscription gate + display.';
revoke all on function public.is_child_free_access_active(uuid) from public, anon;
grant execute on function public.is_child_free_access_active(uuid) to authenticated, service_role;

-- The current CHILD's own free-access flag (child dashboard gate).
create or replace function public.my_free_access_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.is_free_access_active_for_student(public.current_profile_id()); $$;
revoke all on function public.my_free_access_active() from public, anon;
grant execute on function public.my_free_access_active() to authenticated, service_role;

-- The current PARENT's free-access status: { active, ends_at } (max window end
-- across intervals targeting the parent or any of their children). Powers the
-- parent-page countdown + the free pricing gate. current_profile_id() scopes it
-- so a parent can only read their OWN status.
create or replace function public.current_parent_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('active', m.ends_at is not null, 'ends_at', m.ends_at)
  from (
    select max(f.ends_at) as ends_at
    from public.free_access_intervals f
    where f.is_active
      and now() >= f.starts_at and now() < f.ends_at
      and (
        f.parent_profile_id = public.current_profile_id()
        or f.student_profile_id in (
          select s.profile_id from public.students s
          where s.created_by_parent_profile_id = public.current_profile_id()
        )
      )
  ) m;
$$;
comment on function public.current_parent_free_access() is
  'Current parent free-access { active, ends_at } (max active window over the parent + their children). Scoped to current_profile_id().';
revoke all on function public.current_parent_free_access() from public, anon;
grant execute on function public.current_parent_free_access() to authenticated, service_role;

-- =============================================================================
-- ENTITLEMENTS (migration 124) — THE ACCESS RECORD.
-- docs/STORE_PAYMENTS_COMPLIANCE.md §4.1. Everything that gates access reads
-- this table and nothing else; the subscription / purchase tables remain the
-- record of the TRANSACTION. That boundary is the whole point: an ABB
-- subscription row must never *be* the entitlement, or a forced-IAP scenario
-- becomes a rewrite.
--
-- Placed here — after the giveaway / free-access block and BEFORE the attempt
-- RPCs at the end of this file — for two reasons: the function REVOKEs below
-- must run after 010's blanket `alter default privileges ... grant execute on
-- functions to anon, authenticated`, and has_subject_access /
-- live_package_entitlement must exist before the four gates that call them.
-- =============================================================================

-- entitlements table privileges. MUST run here (after 010's blanket grants) so
-- the write-revoke for `authenticated` takes effect — the same reason
-- question_imports' revoke lives in this file and not in 004. The family may
-- READ (RLS limits the rows); every write goes through a DEFINER producer.
-- The revoke from anon also removes anon SELECT: entitlements are never public.
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
grant all    on public.entitlements to service_role;

-- -----------------------------------------------------------------------------
-- THE MAPPER, half one: (child_subscription, subject) -> its entitlement row.
--
-- Roughly eight functions in this estate mutate subscription periods
-- (create_child_subscription, add_subscription_subject,
-- remove_subscription_subject, admin_grant_child_access,
-- admin_manage_child_subscription, apply_plan_change, apply_due_plan_changes,
-- fn_sync_subscription_period). Patching all eight would be eight chances to
-- miss one, and a miss means a PAYING CHILD IS LOCKED OUT with no error
-- anywhere. So there is exactly ONE mapping expression and three callers use
-- it: the triggers, the reconciler and the backfill. The 013 parity check
-- therefore proves the TABLE matches the PRODUCERS, not that an expression
-- matches itself.
--
-- FULLY CONVERGENT: given a pair it makes the entitlement match whatever state
-- it was in, including "should not exist".
--
-- THE END DATE IS THE LEGACY GATE'S EXPRESSION, EXACTLY. The gate that lived
-- in the three attempt RPCs granted access while
--     cs.status in ('trialing','active','canceled')
--     and cs.current_period_end is not null
--     and cs.current_period_end > now()
--     and coalesce(ss.current_period_end, cs.current_period_end) > now()
-- i.e. until least(cs.current_period_end, ss.current_period_end) — least()
-- ignoring NULL is precisely the coalesce arm. Nothing else is consulted.
--
-- remove_at IS DELIBERATELY NOT CONSULTED. web-app/src/lib/childSubjects.ts
-- honours it and the DB gate never has; they coincide only because migrations
-- 078/109 set remove_at equal to that subject's own period end. The one live
-- divergence is admin_manage_child_subscription('extend'), which pushes
-- subscription_subjects.current_period_end forward WITHOUT touching remove_at
-- — so a least(remove_at, ...) mapping would lock out a child an admin had
-- deliberately extended. That TypeScript/DB disagreement and the half-applied
-- extend are pre-existing bugs, tracked, and deliberately NOT fixed inside a
-- cutover whose entire job is to preserve today's behaviour byte-for-byte.
--
-- A LAPSE IS A REVOCATION, NOT A TRUNCATION. past_due / expired / incomplete
-- set revoked_at + revoked_reason; recovery to active clears both, because
-- every field is re-derived. Truncating ends_at to now() would make the row
-- LOOK expired, which is a lie about why access stopped.
-- -----------------------------------------------------------------------------
create or replace function public.fn_entitlement_map_subject(p_cs uuid, p_subject uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found_cs boolean := false;
  v_ss_found boolean := false;
  v_student  uuid;
  v_status   public.subscription_status;
  v_provider text;
  v_cs_start timestamptz;
  v_cs_end   timestamptz;
  v_ss_start timestamptz;
  v_ss_end   timestamptz;
  v_ss_added timestamptz;
  v_starts   timestamptz;
  v_ends     timestamptz;
  v_live     boolean;
  v_src      public.entitlement_source;
  v_ref      text;
begin
  if p_cs is null or p_subject is null then return; end if;

  select cs.student_profile_id, cs.status, cs.provider,
         cs.current_period_start, cs.current_period_end
    into v_student, v_status, v_provider, v_cs_start, v_cs_end
  from public.child_subscriptions cs
  where cs.id = p_cs;
  v_found_cs := found;

  select ss.current_period_start, ss.current_period_end, ss.added_at
    into v_ss_start, v_ss_end, v_ss_added
  from public.subscription_subjects ss
  where ss.child_subscription_id = p_cs and ss.subject_id = p_subject;
  v_ss_found := found;

  -- No producer pair, no student, or a legacy NULL-period row (which grants
  -- NOTHING today, and whose NULL ends_at would mean LIFETIME): remove the row.
  -- Guarded BEFORE the insert, never left to ck_entitlement_bounded to raise —
  -- a raise inside the hourly renewal batch is an outage for the whole batch
  -- rather than one skipped row. The CHECK is the backstop, not the mechanism.
  if not v_found_cs or not v_ss_found or v_student is null or v_cs_end is null then
    delete from public.entitlements
     where child_subscription_id = p_cs and subject_id = p_subject and scope = 'subject';
    return;
  end if;

  v_ends := least(v_cs_end, v_ss_end);
  v_live := v_status in ('trialing', 'active', 'canceled');
  v_src  := case when v_provider = 'azericard' then 'abb_web'::public.entitlement_source
                 else 'manual'::public.entitlement_source end;
  v_ref  := 'sub:' || p_cs::text || ':' || p_subject::text;

  -- The window start. The legacy gate never looked at a period START, so a
  -- degenerate start (>= the end) has to be clamped rather than allowed to
  -- narrow access that exists today; ck_entitlement_window would reject it
  -- anyway.
  v_starts := coalesce(v_ss_start, v_cs_start, v_ss_added, v_ends - interval '1 second');
  if v_starts >= v_ends then
    v_starts := v_ends - interval '1 second';
  end if;

  -- Convergence: if the PROVIDER changed, the old (source, external_ref) row is
  -- stale and would survive the upsert untouched.
  delete from public.entitlements
   where child_subscription_id = p_cs and subject_id = p_subject and scope = 'subject'
     and (source, external_ref) is distinct from (v_src, v_ref);

  insert into public.entitlements
    (student_profile_id, scope, subject_id, package_id, grade_id,
     source, external_ref, starts_at, ends_at, revoked_at, revoked_reason,
     child_subscription_id)
  values
    (v_student, 'subject', p_subject, null, null,
     v_src, v_ref, v_starts, v_ends,
     case when not v_live then now() end,
     case when not v_live then 'subscription_' || v_status::text end,
     p_cs)
  on conflict (source, external_ref) do update
    set student_profile_id    = excluded.student_profile_id,
        subject_id            = excluded.subject_id,
        starts_at             = excluded.starts_at,
        ends_at               = excluded.ends_at,
        -- Keep the ORIGINAL revocation instant. Re-deriving it as now() on
        -- every pass would make the hourly reconciler rewrite (and audit)
        -- every lapsed row forever, and would move the moment access stopped.
        revoked_at            = case when excluded.revoked_at is null then null
                                     else coalesce(entitlements.revoked_at, excluded.revoked_at) end,
        revoked_reason        = excluded.revoked_reason,
        child_subscription_id = excluded.child_subscription_id,
        updated_at            = now()
    -- IDEMPOTENCE: no UPDATE at all when nothing moved, so the reconciler is a
    -- true no-op and does not emit an audit row per subscription per hour.
    where entitlements.student_profile_id    is distinct from excluded.student_profile_id
       or entitlements.subject_id            is distinct from excluded.subject_id
       or entitlements.starts_at             is distinct from excluded.starts_at
       or entitlements.ends_at               is distinct from excluded.ends_at
       or (entitlements.revoked_at is null)  is distinct from (excluded.revoked_at is null)
       or entitlements.revoked_reason        is distinct from excluded.revoked_reason
       or entitlements.child_subscription_id is distinct from excluded.child_subscription_id;
end;
$$;

comment on function public.fn_entitlement_map_subject(uuid, uuid) is
  'THE (subscription, subject) -> entitlement mapping (migration 124). Fully '
  'convergent, including "should not exist". ends_at = least(cs.current_period_end, '
  'ss.current_period_end), which is the legacy attempt-RPC gate verbatim; remove_at '
  'is deliberately not consulted. A non-live status becomes revoked_at + '
  'revoked_reason, never a truncated period. Called by the two subscription '
  'triggers, by entitlements_reconcile() and by the backfill — one expression, '
  'three callers.';

revoke all on function public.fn_entitlement_map_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_entitlement_map_subject(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- THE MAPPER, half two: olympiad purchase -> its entitlement row.
-- ends_at is ALWAYS NULL (CLAUDE.md: lifetime access, including for an
-- ARCHIVED package — ck_entitlement_lifetime makes anything else impossible).
--
-- A 'pending' or 'refunded' purchase is MIRRORED AS A REVOKED ROW, never
-- omitted: can_view_olympiad_package's entitlement branch is revocation-blind
-- on purpose, so omitting those rows would quietly strip catalog visibility
-- from a refunded family. purchase_olympiad's re-buy-after-refund branch
-- updates the same purchase row in place, so it flows back through here and
-- un-revokes with no new code in the RPC.
--
-- An ANONYMISED purchase (student_profile_id set to NULL when a child is
-- deleted — audit M13) cannot be represented at all: entitlements.student_
-- profile_id is NOT NULL and cascades. The row is removed and the buying
-- parent's catalog visibility is carried by the ORIGINAL purchase branch of
-- can_view_olympiad_package, which is why that branch is kept verbatim.
-- -----------------------------------------------------------------------------
create or replace function public.fn_entitlement_map_purchase(p_purchase uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found    boolean := false;
  v_student  uuid;
  v_package  uuid;
  v_grade    uuid;
  v_status   text;
  v_provider text;
  v_bought   timestamptz;
  v_created  timestamptz;
  v_src      public.entitlement_source;
  v_ref      text;
  v_starts   timestamptz;
begin
  if p_purchase is null then return; end if;

  select pu.student_profile_id, pu.olympiad_package_id, pu.grade_id, pu.status,
         pu.provider, pu.purchased_at, pu.created_at
    into v_student, v_package, v_grade, v_status, v_provider, v_bought, v_created
  from public.olympiad_purchases pu
  where pu.id = p_purchase;
  v_found := found;

  if not v_found or v_student is null or v_package is null then
    delete from public.entitlements where olympiad_purchase_id = p_purchase;
    return;
  end if;

  v_src    := case when v_provider = 'azericard' then 'abb_web'::public.entitlement_source
                   else 'manual'::public.entitlement_source end;
  v_ref    := 'oly:' || p_purchase::text;
  v_starts := coalesce(v_bought, v_created, now());

  delete from public.entitlements
   where olympiad_purchase_id = p_purchase
     and (source, external_ref) is distinct from (v_src, v_ref);

  insert into public.entitlements
    (student_profile_id, scope, subject_id, package_id, grade_id,
     source, external_ref, starts_at, ends_at, revoked_at, revoked_reason,
     olympiad_purchase_id)
  values
    (v_student, 'olympiad_package', null, v_package, v_grade,
     v_src, v_ref, v_starts, null,
     case when v_status <> 'active' then now() end,
     case when v_status <> 'active' then 'purchase_' || v_status end,
     p_purchase)
  on conflict (source, external_ref) do update
    set student_profile_id   = excluded.student_profile_id,
        package_id           = excluded.package_id,
        grade_id             = excluded.grade_id,
        starts_at            = excluded.starts_at,
        revoked_at           = case when excluded.revoked_at is null then null
                                    else coalesce(entitlements.revoked_at, excluded.revoked_at) end,
        revoked_reason       = excluded.revoked_reason,
        olympiad_purchase_id = excluded.olympiad_purchase_id,
        updated_at           = now()
    where entitlements.student_profile_id   is distinct from excluded.student_profile_id
       or entitlements.package_id           is distinct from excluded.package_id
       or entitlements.grade_id             is distinct from excluded.grade_id
       or entitlements.starts_at            is distinct from excluded.starts_at
       or (entitlements.revoked_at is null) is distinct from (excluded.revoked_at is null)
       or entitlements.revoked_reason       is distinct from excluded.revoked_reason
       or entitlements.olympiad_purchase_id is distinct from excluded.olympiad_purchase_id;
end;
$$;

comment on function public.fn_entitlement_map_purchase(uuid) is
  'THE olympiad purchase -> entitlement mapping (migration 124). ends_at is '
  'always NULL: lifetime, including for an archived package. pending/refunded '
  'are mirrored as REVOKED rows rather than omitted, because the catalog '
  'visibility branch is revocation-blind and omitting them would strip a '
  'refunded family''s row. An anonymised purchase (student set NULL) has no '
  'representable entitlement and is removed.';

revoke all on function public.fn_entitlement_map_purchase(uuid) from public, anon, authenticated;
grant execute on function public.fn_entitlement_map_purchase(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- The three trigger bodies. They only ever call the mapper, and the mapper
-- writes only public.entitlements — which carries no trigger that writes back
-- to a producer, so there is no recursion.
-- -----------------------------------------------------------------------------
create or replace function public.tg_entitlements_subject()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- remove_subscription_subject HARD-DELETES, so this branch is required;
    -- the mapper's own delete-if-absent path handles it.
    perform public.fn_entitlement_map_subject(old.child_subscription_id, old.subject_id);
  else
    perform public.fn_entitlement_map_subject(new.child_subscription_id, new.subject_id);
    if tg_op = 'UPDATE'
       and (old.child_subscription_id, old.subject_id)
           is distinct from (new.child_subscription_id, new.subject_id) then
      perform public.fn_entitlement_map_subject(old.child_subscription_id, old.subject_id);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.tg_entitlements_subject() from public, anon, authenticated;
grant execute on function public.tg_entitlements_subject() to service_role;

create or replace function public.tg_entitlements_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  for r in select ss.subject_id
             from public.subscription_subjects ss
            where ss.child_subscription_id = new.id
  loop
    perform public.fn_entitlement_map_subject(new.id, r.subject_id);
  end loop;
  return null;
end;
$$;
revoke all on function public.tg_entitlements_subscription() from public, anon, authenticated;
grant execute on function public.tg_entitlements_subscription() to service_role;

create or replace function public.tg_entitlements_purchase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_entitlement_map_purchase(old.id);
  else
    perform public.fn_entitlement_map_purchase(new.id);
  end if;
  return null;
end;
$$;
revoke all on function public.tg_entitlements_purchase() from public, anon, authenticated;
grant execute on function public.tg_entitlements_purchase() to service_role;

-- -----------------------------------------------------------------------------
-- THE RECONCILER — what makes trigger-mirroring safe.
-- Re-runs the SAME mapper over every producer pair, then sweeps orphans.
-- Scheduled hourly in 016 at :22, five minutes after recompute_child_access at
-- :17 so it observes a settled state.
--
-- THE SCOPE PREDICATE IS STRUCTURAL, NOT A STRING. The sweeps are keyed on
-- `child_subscription_id is not null` / `olympiad_purchase_id is not null`, so
-- an apple_iap, google_play, school_license or manual-comp row (both links
-- NULL) is UNREACHABLE here regardless of its source value. Scoping on
-- `source = 'abb_web'` would have put one editable literal between this job
-- and wiping every Apple entitlement.
-- -----------------------------------------------------------------------------
create or replace function public.entitlements_reconcile()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subjects  int := 0;
  v_purchases int := 0;
  v_orphans   int := 0;
  n           int;
  r           record;
begin
  for r in select ss.child_subscription_id as cs, ss.subject_id as sid
             from public.subscription_subjects ss
  loop
    perform public.fn_entitlement_map_subject(r.cs, r.sid);
    v_subjects := v_subjects + 1;
  end loop;

  for r in select pu.id as pid from public.olympiad_purchases pu
  loop
    perform public.fn_entitlement_map_purchase(r.pid);
    v_purchases := v_purchases + 1;
  end loop;

  delete from public.entitlements e
   where e.scope = 'subject' and e.child_subscription_id is not null
     and not exists (select 1 from public.subscription_subjects ss
                      where ss.child_subscription_id = e.child_subscription_id
                        and ss.subject_id = e.subject_id);
  get diagnostics n = row_count;
  v_orphans := v_orphans + n;

  delete from public.entitlements e
   where e.scope = 'olympiad_package' and e.olympiad_purchase_id is not null
     and not exists (select 1 from public.olympiad_purchases pu where pu.id = e.olympiad_purchase_id);
  get diagnostics n = row_count;
  v_orphans := v_orphans + n;

  return jsonb_build_object('subjects_mapped',  v_subjects,
                            'purchases_mapped', v_purchases,
                            'orphans_removed',  v_orphans);
end;
$$;

comment on function public.entitlements_reconcile() is
  'Hourly repair for the entitlement mirror (migration 124, cron :22). Re-runs '
  'fn_entitlement_map_subject / fn_entitlement_map_purchase over every producer '
  'row and sweeps orphans. Scoped STRUCTURALLY on the producer-link columns, so '
  'a grant with no producer (apple_iap, google_play, school_license, manual comp) '
  'is unreachable here by construction, not by a literal somebody could edit.';

revoke all on function public.entitlements_reconcile() from public, anon, authenticated;
grant execute on function public.entitlements_reconcile() to service_role;

-- -----------------------------------------------------------------------------
-- THE NON-PRODUCER GRANT SURFACE. This is what a rail with no row of its own
-- calls — Apple, Google Play, a school licence, a manual comp.
--
-- On forced-IAP day the entire access-side integration is ONE call site: the
-- BFF verifies the App Store Server Notification V2 JWS, resolves the child
-- from appAccountToken, maps productId -> target, and calls entitlement_grant()
-- with originalTransactionId as the external_ref. DID_RENEW = the same call
-- with a later expiry. REFUND/REVOKE = entitlement_revoke(). DID_FAIL_TO_RENEW
-- = nothing at all; access lapses lazily. No schema change, no reader change,
-- no trigger, no RLS change.
--
-- THE ABB CALLBACK MUST NOT CALL THIS. A producer that bypasses the mirror is
-- by definition the first drift, and the row would have no invoice and no
-- ledger entry to reconcile against. The web rail writes the PRODUCER row
-- (child_subscriptions / subscription_subjects / olympiad_purchases) after
-- signature verification, the TRTYPE=90 re-query, the transaction-identity
-- match and assert_payments_enabled(); the trigger below writes the
-- entitlement. The sub:/oly: ref namespace is refused here to make that
-- structural rather than a convention.
--
-- No assert_payments_enabled() call: granting while the payment mode is off is
-- exactly what a giveaway comp and admin_grant_child_access already do.
-- -----------------------------------------------------------------------------
create or replace function public.entitlement_grant(
  p_student              uuid,
  p_scope                public.entitlement_scope,
  p_source               public.entitlement_source,
  p_external_ref         text,
  p_subject_id           uuid        default null,
  p_package_id           uuid        default null,
  p_grade_id             uuid        default null,
  p_provider_account_ref text        default null,
  p_starts_at            timestamptz default now(),
  p_ends_at              timestamptz default null,
  p_granted_by           uuid        default null,
  p_note                 text        default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_starts timestamptz := coalesce(p_starts_at, now());
begin
  if p_student is null then
    raise exception 'entitlement_grant: student required' using errcode = 'check_violation';
  end if;
  if p_external_ref is null or length(btrim(p_external_ref)) = 0 or length(p_external_ref) > 200 then
    raise exception 'entitlement_grant: external_ref must be 1..200 chars'
      using errcode = 'check_violation', hint = 'bad_external_ref';
  end if;
  if p_external_ref like 'sub:%' or p_external_ref like 'oly:%' then
    raise exception 'entitlement_grant: the sub:/oly: ref namespace belongs to the producer mirror'
      using errcode = 'check_violation', hint = 'mirrored_namespace';
  end if;
  if p_scope = 'subject' then
    if p_subject_id is null then
      raise exception 'entitlement_grant: a subject grant needs a subject'
        using errcode = 'check_violation', hint = 'subject_required';
    end if;
    if p_ends_at is null then
      raise exception 'entitlement_grant: a subject grant must be bounded'
        using errcode = 'check_violation', hint = 'subject_needs_end';
    end if;
  else
    if p_package_id is null then
      raise exception 'entitlement_grant: a package grant needs a package'
        using errcode = 'check_violation', hint = 'package_required';
    end if;
    if p_ends_at is not null then
      raise exception 'entitlement_grant: an olympiad package grant is lifetime'
        using errcode = 'check_violation', hint = 'package_is_lifetime';
    end if;
  end if;
  if exists (select 1 from public.entitlements e
              where e.source = p_source and e.external_ref = p_external_ref
                and (e.child_subscription_id is not null or e.olympiad_purchase_id is not null)) then
    raise exception 'entitlement_grant: that grant is MIRRORED from a producer row'
      using errcode = 'check_violation', hint = 'mirrored_grant';
  end if;

  insert into public.entitlements
    (student_profile_id, scope, subject_id, package_id, grade_id,
     source, external_ref, provider_account_ref,
     starts_at, ends_at, revoked_at, revoked_reason,
     granted_by_profile_id, note)
  values
    (p_student, p_scope,
     case when p_scope = 'subject' then p_subject_id end,
     case when p_scope = 'olympiad_package' then p_package_id end,
     case when p_scope = 'olympiad_package' then p_grade_id end,
     p_source, p_external_ref, p_provider_account_ref,
     v_starts, p_ends_at, null, null,
     coalesce(p_granted_by, public.current_profile_id()), nullif(left(coalesce(p_note, ''), 500), ''))
  on conflict (source, external_ref) do update
    set student_profile_id    = excluded.student_profile_id,
        subject_id            = excluded.subject_id,
        package_id            = excluded.package_id,
        grade_id              = excluded.grade_id,
        provider_account_ref  = coalesce(excluded.provider_account_ref, entitlements.provider_account_ref),
        starts_at             = excluded.starts_at,
        ends_at               = excluded.ends_at,
        -- A renewal after a refund is an UN-REVOCATION, exactly like the
        -- olympiad re-buy branch.
        revoked_at            = null,
        revoked_reason        = null,
        note                  = coalesce(excluded.note, entitlements.note),
        updated_at            = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.entitlement_grant(uuid, public.entitlement_scope, public.entitlement_source, text, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid, text) is
  'THE non-producer grant entrypoint (migration 124): Apple, Google Play, a '
  'school licence, a manual comp. Idempotent on (source, external_ref) — a '
  'renewal moves ends_at and un-revokes. REFUSES the sub:/oly: namespace and '
  'refuses to touch a MIRRORED row, so the ABB rail cannot bypass the producer '
  'mirror. service_role EXECUTE only.';

revoke all on function public.entitlement_grant(uuid, public.entitlement_scope, public.entitlement_source, text, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.entitlement_grant(uuid, public.entitlement_scope, public.entitlement_source, text, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid, text) to service_role;

create or replace function public.entitlement_revoke(
  p_source       public.entitlement_source,
  p_external_ref text,
  p_reason       text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if p_external_ref is null or length(p_external_ref) > 200 then
    raise exception 'entitlement_revoke: bad external_ref' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.entitlements e
              where e.source = p_source and e.external_ref = p_external_ref
                and (e.child_subscription_id is not null or e.olympiad_purchase_id is not null)) then
    -- A mirrored grant is revoked ON THE PRODUCER (a subscription status
    -- change, olympiad_purchases.status = 'refunded'); doing it here would be
    -- silently undone by the next producer write or the next reconcile.
    raise exception 'entitlement_revoke: that grant is MIRRORED — revoke it on the producer row'
      using errcode = 'check_violation', hint = 'mirrored_grant';
  end if;

  update public.entitlements
     set revoked_at     = coalesce(revoked_at, now()),
         revoked_reason = left(coalesce(p_reason, 'revoked'), 200),
         updated_at     = now()
   where source = p_source and external_ref = p_external_ref
     and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

comment on function public.entitlement_revoke(public.entitlement_source, text, text) is
  'Withdraws a NON-MIRRORED grant (Apple REFUND/REVOKE, a cancelled school '
  'licence, a rescinded comp). Refuses a mirrored row: revocation of a produced '
  'grant is expressed on the producer, or the next reconcile reverts it.';

revoke all on function public.entitlement_revoke(public.entitlement_source, text, text) from public, anon, authenticated;
grant execute on function public.entitlement_revoke(public.entitlement_source, text, text) to service_role;

-- Administrator comps. source = 'manual', ref = 'manual:<uuid>', and
-- granted_by_profile_id is recorded — which is the reason a direct INSERT is
-- refused to everybody, admins included (see the RLS block in 010).
create or replace function public.admin_grant_entitlement(
  p_student    uuid,
  p_scope      public.entitlement_scope,
  p_subject_id uuid        default null,
  p_package_id uuid        default null,
  p_grade_id   uuid        default null,
  p_ends_at    timestamptz default null,
  p_note       text        default null
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.entitlement_grant(
    p_student              => p_student,
    p_scope                => p_scope,
    p_source               => 'manual'::public.entitlement_source,
    p_external_ref         => 'manual:' || gen_random_uuid()::text,
    p_subject_id           => p_subject_id,
    p_package_id           => p_package_id,
    p_grade_id             => p_grade_id,
    p_provider_account_ref => null,
    p_starts_at            => now(),
    p_ends_at              => p_ends_at,
    p_granted_by           => public.current_profile_id(),
    p_note                 => p_note);
$$;

comment on function public.admin_grant_entitlement(uuid, public.entitlement_scope, uuid, uuid, uuid, timestamptz, text) is
  'Administrator comp: a manual entitlement with granted_by recorded and an '
  'audit row from trg_audit_entitlements. service_role EXECUTE only; the '
  'admin-panel action guards and audits the caller.';

revoke all on function public.admin_grant_entitlement(uuid, public.entitlement_scope, uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_grant_entitlement(uuid, public.entitlement_scope, uuid, uuid, uuid, timestamptz, text) to service_role;

create or replace function public.admin_revoke_entitlement(
  p_entitlement_id uuid,
  p_reason         text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src public.entitlement_source;
  v_ref text;
begin
  select e.source, e.external_ref into v_src, v_ref
  from public.entitlements e where e.id = p_entitlement_id;
  if not found then
    raise exception 'admin_revoke_entitlement: not found' using errcode = 'no_data_found';
  end if;
  return public.entitlement_revoke(v_src, v_ref, p_reason);
end;
$$;

comment on function public.admin_revoke_entitlement(uuid, text) is
  'Administrator withdrawal of a NON-MIRRORED grant, by entitlement id. A '
  'mirrored grant raises with hint mirrored_grant — express it on the producer.';

revoke all on function public.admin_revoke_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_entitlement(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- THE READ PATH. Two functions, and every gate in the platform uses one of them.
-- -----------------------------------------------------------------------------

-- has_subject_access: THE per-subject rule. One definition, three callers, so
-- the ORDER of the checks can never differ between the three gates again.
--   1. a STORED entitlement row — the common paid case, one partial-index probe;
--   2. the two COMPUTED override windows, which own no rows and expire lazily
--      (nothing to unwind, no job, no per-child materialisation).
-- plpgsql rather than sql because the obvious `coalesce(...)` collapse is a
-- LIVE BUG here: is_giveaway_active() returns FALSE, never NULL, so coalesce
-- would stop at it and never evaluate free access.
create or replace function public.has_subject_access(p_student uuid, p_subject uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_student is null or p_subject is null then return false; end if;

  -- ck_entitlement_bounded makes a NULL ends_at unrepresentable for a subject
  -- grant, so this needs no `ends_at is null` arm: "forever" is a package shape.
  if exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = p_subject
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then return true; end if;

  if public.is_giveaway_active() then return true; end if;
  if public.is_free_access_active_for_student(p_student) then return true; end if;

  return false;
end;
$$;

comment on function public.has_subject_access(uuid, uuid) is
  'THE per-subject access rule (migration 124): a LIVE public.entitlements row, '
  'OR the giveaway window, OR an admin free-access interval — in that order. '
  'Read by start_practice_attempt, start_topic_test_attempt and '
  'start_daily_round_attempt so the three can never drift. Takes an ARBITRARY '
  'student id, so EXECUTE is service_role only (the same split as '
  'is_free_access_active_for_student); the caller-scoped entrypoint is '
  'my_accessible_subjects().';

revoke all on function public.has_subject_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.has_subject_access(uuid, uuid) to service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION 140 - the Free Trial: its gate, its activation and its reads.
-- ---------------------------------------------------------------------------
create or replace function public.subject_access_is_trial_only(
  p_student uuid,
  p_subject uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_student is null or p_subject is null then return false; end if;

  -- EVERY branch below fails toward RATED, which is the safe direction. A bug
  -- that lets a trial child score shows up on a leaderboard and gets noticed; a
  -- bug that wrongly reports "trial" would silently void a PAYING child's one
  -- rated round of the day, which nobody would report because nothing looks
  -- broken.
  if not exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = p_subject
      and e.source = 'trial'
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then
    return false;
  end if;

  -- A platform-wide campaign makes everyone's rounds rated; the trial must not
  -- silently downgrade a child who would otherwise be scoring.
  if public.is_giveaway_active() then return false; end if;
  if public.is_free_access_active_for_student(p_student) then return false; end if;

  -- PAID ALWAYS WINS. A child who holds a live subscription for this subject
  -- scores, even if a trial grant is also live -- which happens naturally when a
  -- parent buys during the trial day.
  if exists (
    select 1 from public.entitlements e
    where e.student_profile_id = p_student
      and e.scope = 'subject'
      and e.subject_id = p_subject
      and e.source <> 'trial'
      and e.revoked_at is null
      and e.starts_at <= now()
      and e.ends_at   >  now()
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.subject_access_is_trial_only(uuid, uuid) is
  'Migration 140: is this subject reachable ONLY through the Free Trial? The '
  'single reader that decides whether today''s round scores. Fails toward RATED '
  'in every branch -- paid, giveaway and admin free-access all win. Takes an '
  'arbitrary student id, so EXECUTE is service_role only (the same split as '
  'has_subject_access).';

revoke all on function public.subject_access_is_trial_only(uuid, uuid) from public, anon, authenticated;
grant execute on function public.subject_access_is_trial_only(uuid, uuid) to service_role;
create or replace function public.activate_free_trial(
  p_parent      uuid,
  p_student     uuid,
  p_subject_ids uuid[],
  p_locale      text default 'az'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_hours  constant int := 24;
  c_max    constant int := 2;
  v_ends   timestamptz;
  v_locale text := case when p_locale in ('az','en','ru') then p_locale else 'az' end;
  v_subj   uuid;
  v_n      int;
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
$$;

comment on function public.activate_free_trial(uuid, uuid, uuid[], text) is
  'Migration 140: activate the one-time 1-day Free Trial for a child. Ownership '
  'is checked HERE because entitlement_grant checks none. Never calls '
  'assert_payments_enabled (the trial must work while payments are off), never '
  'writes students.access_status, and never creates a child_subscriptions row.';

revoke all on function public.activate_free_trial(uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.activate_free_trial(uuid, uuid, uuid[], text) to service_role;
create or replace function public.child_free_trial(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := public.current_profile_id();
  v_row public.free_trials;
begin
  if v_me is null or p_student is null then
    return jsonb_build_object('active', false);
  end if;

  -- Same reader set as the free_trials RLS policy, restated because this is a
  -- definer function and RLS does not apply to it.
  if not (
    p_student = v_me
    or public.is_parent_linked_to_student(p_student)
    or exists (select 1 from public.students s
               where s.profile_id = p_student
                 and s.created_by_parent_profile_id = v_me)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  ) then
    return jsonb_build_object('active', false);
  end if;

  select * into v_row from public.free_trials
   where student_profile_id = p_student and cancelled_at is null;
  if not found then
    return jsonb_build_object('active', false, 'used', false);
  end if;

  -- EXPIRY IS DERIVED. Nothing flips a status when the clock passes ends_at, so
  -- there is no window in which a job has not yet run and access is wrong.
  return jsonb_build_object(
    'active',   v_row.ends_at > now(),
    'used',     true,
    'ends_at',  v_row.ends_at,
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
                       order by s.name)
      from public.subjects s where s.id = any(v_row.subject_ids)), '[]'::jsonb));
end;
$$;

comment on function public.child_free_trial(uuid) is
  'Migration 140: Free Trial state for one child, for the parent countdown and '
  'the dashboard pill. Caller-scoped and fails closed to {active:false}. Expiry '
  'is DERIVED from ends_at, never from a stored status.';

revoke all on function public.child_free_trial(uuid) from public, anon;
grant execute on function public.child_free_trial(uuid) to authenticated, service_role;


create or replace function public.my_free_trial()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.child_free_trial(public.current_profile_id());
$$;

comment on function public.my_free_trial() is
  'Migration 140: the signed-in child''s own Free Trial state. Delegates to '
  'child_free_trial so the two can never disagree.';

revoke all on function public.my_free_trial() from public, anon;
grant execute on function public.my_free_trial() to authenticated, service_role;

-- live_package_entitlement: THE olympiad rule. Consults NO window, which is how
-- the migration-038 owner ruling (giveaway / free access cover SUBJECTS only)
-- becomes structural instead of something to remember not to add.
--
-- `returns table`, NOT the table's composite type: canonical run order creates
-- this function in 011 while entitlements is created in 007 — the composite
-- would work, but 011 already hit the reverse of that compile-order trap once
-- (see the Round-49 rotation-state comment in start_olympiad_attempt) and the
-- house style is to avoid depending on it at all.
create or replace function public.live_package_entitlement(p_student uuid, p_package uuid)
returns table (entitlement_id uuid, grade_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.grade_id
  from public.entitlements e
  where e.student_profile_id = p_student
    and e.scope = 'olympiad_package'
    and e.package_id = p_package
    and e.revoked_at is null
    and e.starts_at <= now()
    and (e.ends_at is null or e.ends_at > now())
  -- Multiplicity becomes possible only once a second SOURCE exists. Tie-break
  -- is OLDEST-GRANT-WINS: the grade snapshot must not move when an Apple grant
  -- lands beside a live ABB one, because Round 49's rotation is keyed on
  -- (student, package, grade) and a grade flip starts a fresh cycle.
  order by e.created_at asc, e.id asc
  limit 1
$$;

comment on function public.live_package_entitlement(uuid, uuid) is
  'THE olympiad access rule (migration 124): the live package grant for this '
  'child, with its grade snapshot. Consults no giveaway/free-access window — '
  'olympiad packages are purchase-only (owner ruling, migration 038). '
  'Oldest-grant-wins so a second source cannot move the grade snapshot out from '
  'under the Round-49 rotation.';

revoke all on function public.live_package_entitlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.live_package_entitlement(uuid, uuid) to service_role;

-- The CALLER-SCOPED subject reader: what the signed-in child can play right
-- now, by exactly the rule the engines enforce. current_profile_id() scopes it,
-- so unlike has_subject_access it is safe for authenticated sessions — the same
-- split as my_free_access_active() over is_free_access_active_for_student().
-- Intended to replace the hand-rolled coverage queries in the web and mobile
-- clients in the round after this one.
create or replace function public.my_accessible_subjects()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id
  from public.subjects s
  where public.has_subject_access(public.current_profile_id(), s.id)
$$;

comment on function public.my_accessible_subjects() is
  'The CURRENT child''s playable subjects, by has_subject_access — the same rule '
  'the three attempt engines enforce. Caller-scoped through current_profile_id().';

revoke all on function public.my_accessible_subjects() from public, anon;
grant execute on function public.my_accessible_subjects() to authenticated, service_role;

-- MIGRATION 155 -- "which subjects are taught to this grade" is ONE rule, here,
-- not a hand-written copy per client. The web carried it twice and the mobile
-- app's three list builders never got it, so Fizika was offered to a grade-3
-- child on the PURCHASE screens: a parent could buy Physics and receive nothing.
-- Two deliberate silences below. Subject STATUS is not consulted -- callers
-- intersect this against a list they have already status-filtered, and one
-- predicate answering two unrelated questions is how the copies drifted. And
-- ADMIN surfaces must not use these at all: an administrator maintains Fizika's
-- grade-1 curriculum by seeing Fizika while standing on grade 1.

-- The SET form: every subject the curriculum teaches to this grade. Callers
-- intersect their own (already status-filtered) list against it, which is why
-- it returns bare ids and joins nothing.
--
-- p_grade IS NULL MEANS "NO GRADE RESTRICTION", not "no subjects". students.
-- grade_id is nullable, and the alternative reading would hand a grade-less
-- child an EMPTY catalogue — a total outage for that family — to prevent them
-- seeing a subject the attempt engine would refuse anyway. Fail toward showing
-- too much here; has_subject_access() and the attempt RPCs are the gate that
-- matters.
create or replace function public.subjects_taught_to_grade(p_grade uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct t.subject_id
  from public.topics t
  where t.scope = 'exam'
    and t.status = 'active'
    -- A shared (grade-less) topic belongs to every grade. This is the reading
    -- every test-setup path already uses; the client copy of this rule used
    -- equality and made such a subject disappear instead.
    and (p_grade is null or t.grade_id is null or t.grade_id = p_grade)
$$;

comment on function public.subjects_taught_to_grade(uuid) is
  'THE grade-availability rule (migration 155): the subjects whose curriculum '
  'reaches this grade — at least one ACTIVE, exam-scoped topic for the grade, '
  'or a shared (grade-less) one. Callers intersect their own list against it, '
  'so subject status is deliberately not consulted here. A NULL grade means no '
  'restriction, never an empty catalogue. Admin surfaces must stay unfiltered.';

revoke all on function public.subjects_taught_to_grade(uuid) from public, anon;
grant execute on function public.subjects_taught_to_grade(uuid) to authenticated, service_role;

-- The SINGLE-SUBJECT form, for re-checking one id that arrived from a URL, a
-- deep link or a stale cache. A route must never trust that a subject id was
-- only reachable from a filtered list, and asking this is cheaper than
-- rebuilding the whole set to look for one member.
create or replace function public.subject_taught_to_grade(p_subject uuid, p_grade uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.topics t
    where t.subject_id = p_subject
      and t.scope = 'exam'
      and t.status = 'active'
      and (p_grade is null or t.grade_id is null or t.grade_id = p_grade)
  )
$$;

comment on function public.subject_taught_to_grade(uuid, uuid) is
  'Migration 155: the one-subject form of subjects_taught_to_grade, for '
  'server-side re-checks of a subject id taken from a URL or a stale client '
  'cache. Same predicate, so the two can never drift.';

revoke all on function public.subject_taught_to_grade(uuid, uuid) from public, anon;
grant execute on function public.subject_taught_to_grade(uuid, uuid) to authenticated, service_role;

-- The CALLER-SCOPED form, for the signed-in child's own screens — the same
-- split as my_accessible_subjects() over has_subject_access(). It exists so a
-- student surface does not have to fetch its own grade first and thread it
-- through three query layers just to filter a list.
--
-- A caller with no students row (a parent, an admin) resolves to a NULL grade
-- and therefore to NO restriction. That is deliberate: a parent's leaderboard
-- and analytics filters span children of different grades, and narrowing them
-- to one child's curriculum would be wrong. Parent PURCHASE screens must pass
-- the CHILD's grade explicitly to subjects_taught_to_grade instead.
--
-- plpgsql rather than sql: it reads a value and then calls the set-returning
-- rule with it, which is the one thing a plain SQL body cannot express without
-- restating the predicate — and a second copy of the predicate is the defect
-- this migration exists to remove.
create or replace function public.my_taught_subjects()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grade uuid;
begin
  select st.grade_id into v_grade
  from public.students st
  where st.profile_id = public.current_profile_id();

  return query select * from public.subjects_taught_to_grade(v_grade);
end;
$$;

comment on function public.my_taught_subjects() is
  'Migration 155: the CURRENT student''s grade-appropriate subjects, by '
  'subjects_taught_to_grade. Caller-scoped through current_profile_id(); a '
  'caller who is not a student resolves to a NULL grade and so to no '
  'restriction, which is what a parent''s cross-child filters need. Parent '
  'purchase screens must pass the child''s grade explicitly instead.';

revoke all on function public.my_taught_subjects() from public, anon;
grant execute on function public.my_taught_subjects() to authenticated, service_role;

-- The subscription half of the entitlement mirror (migration 124).
--
-- COLUMN SCOPING IS LOAD-BEARING on both. apply_due_plan_changes rewrites
-- interval / pending_interval / price_amount hourly, and the add/remove paths
-- fire no-op `set currency = currency` touches; none of that changes ACCESS, and
-- an unfiltered trigger would write a redundant entitlement row AND an audit row
-- on every one.
drop trigger if exists trg_entitlements_from_sub_subjects on public.subscription_subjects;
create trigger trg_entitlements_from_sub_subjects
  after insert or update of current_period_start, current_period_end or delete
  on public.subscription_subjects
  for each row execute function public.tg_entitlements_subject();

-- The WHEN guard is equally load-bearing: fn_sync_subscription_period updates
-- child_subscriptions on EVERY subject-row write to re-derive the totals, so
-- without it every plan edit would fan out quadratically. With it, the mapper
-- re-runs only when the container's status or coverage window actually moved —
-- which is also what makes trigger FIRING ORDER a non-issue: the mapper always
-- re-reads child_subscriptions fresh, and this trigger re-runs it for every
-- subject once trg_sync_subscription_period has settled the container.
drop trigger if exists trg_entitlements_from_child_subs on public.child_subscriptions;
create trigger trg_entitlements_from_child_subs
  after update of status, current_period_end, current_period_start, provider
  on public.child_subscriptions
  for each row
  when (old.status is distinct from new.status
        or old.current_period_end is distinct from new.current_period_end
        or old.current_period_start is distinct from new.current_period_start
        -- MIGRATION 137: the mirror must move when the thing it mirrors moves.
        -- Without `provider` here the paid-rail stamp updates the subscription
        -- and leaves the entitlement filed as a comped grant.
        or old.provider is distinct from new.provider)
  execute function public.tg_entitlements_subscription();

-- Enabling either flag disables the other; enabling giveaway_period (re)stamps
-- system_settings 'giveaway.started_at' so the countdown restarts. A
-- demo_payments row is REJECTED outright (migration 121 deleted that mode):
-- nothing resolves it any more, so a row that came back would render as a
-- payment mode the admin can select while changing nothing.
-- SECURITY DEFINER so the cross-row/cross-table writes succeed for any
-- authorized caller (admin session under RLS, or service role). The inner
-- UPDATE sets enabled=false, which does not re-satisfy the trigger's WHEN
-- clause — no recursion. An idempotent re-save of an already-enabled flag is
-- ignored (no giveaway clock restart).
create or replace function public.fn_payment_mode_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payments_on boolean;
begin
  -- Migration 121: the demo payment mode was DELETED. Nothing resolves it any
  -- more, so a row carrying this key must never exist again — fail loudly
  -- rather than let a dead switch reappear in the admin panel.
  if new.key = 'demo_payments' then
    raise exception 'payment mode: demo_payments was removed (migration 121)'
      using errcode = 'check_violation', hint = 'demo_payments_removed';
  end if;

  -- MIGRATION 135: a campaign is a MODIFIER on an open payment rail, not an
  -- alternative to one. Free subscriptions still need the rail available for
  -- everything a campaign does NOT cover — olympiad packages — and an operator
  -- must never see "Payments: OFF" while cards are being charged.
  if new.key = 'giveaway_period' and new.enabled then
    select coalesce(enabled, false) into v_payments_on
      from public.feature_flags where key = 'payments';
    if not coalesce(v_payments_on, false) then
      raise exception 'payment mode: a giveaway needs payments to be on'
        using errcode = 'check_violation', hint = 'giveaway_requires_payments';
    end if;
  end if;

  -- THE KILL SWITCH ALWAYS WINS. Turning payments off during a campaign ends the
  -- campaign rather than being refused: an operator reaching for the kill switch
  -- in an incident must not be blocked by a promotion, and leaving the campaign
  -- on with no rail beneath it is a state no resolver expects.
  if new.key = 'payments' and not new.enabled then
    update public.feature_flags
       set enabled = false, updated_at = now()
     where key = 'giveaway_period' and enabled;
  end if;

  if new.key = 'giveaway_period' and new.enabled then
    -- UPSERT, not a bare UPDATE (migration 133). A missing settings row matched
    -- nothing, so the flag switched on and the campaign was silently INERT:
    -- is_giveaway_active() has no start date to measure from.
    insert into public.system_settings (key, value_json)
    values ('giveaway.started_at', to_jsonb(now()))
    on conflict (key) do update set value_json = excluded.value_json, updated_at = now();
  end if;

  return new;
end;
$$;

-- THE TRIGGER ITSELF HAS TO BE WIDENED, and this is not cosmetic. Its WHEN
-- clause was
--     new.key = 'demo_payments'
--     OR (new.enabled = true AND new.key in ('payments','giveaway_period'))
-- so it fired ONLY when a flag was switched ON — correct for the old model,
-- where the only job was to force the sibling off. Under the new rules the
-- important moment is payments being switched OFF, which that clause skips
-- entirely: the cascade below would never have run and a campaign would have
-- kept resolving with no rail beneath it. Caught by this migration's own
-- verification block rather than in production.

comment on function public.fn_payment_mode_exclusivity() is
  'Migration 121: DB-layer guarantee that payments / giveaway_period are never '
  'enabled together; stamps giveaway.started_at when the giveaway flips on; '
  'REJECTS any demo_payments row (that payment mode was deleted).';

-- The WHEN clause carries the demo_payments guard WITHOUT the
-- `new.enabled = true` condition on purpose: an insert of a DISABLED demo row
-- must be rejected too, or the dead switch simply reappears in /settings.
drop trigger if exists trg_payment_mode_exclusivity on public.feature_flags;
create trigger trg_payment_mode_exclusivity
  after insert or update of enabled on public.feature_flags
  for each row
  -- MIGRATION 135: fires on EVERY enabled-change for these keys, not only when
  -- one is switched ON. The old clause (`new.enabled = true and ...`) was right
  -- when the trigger's only job was forcing the sibling off; under the current
  -- rules the important moment is payments being switched OFF, which that clause
  -- skipped — so the cascade that ends a running campaign would never have run.
  when (new.key = 'demo_payments'
        or new.key in ('payments', 'giveaway_period'))
  execute function public.fn_payment_mode_exclusivity();

-- Allocate the deferred 8-digit login ID WITHOUT a subscription (giveaway
-- add-child path — access during the giveaway comes from the server-side
-- giveaway override, not from a subscription row, so it auto-reverts when the
-- window ends). Mirrors the allocation block inside create_child_subscription.
create or replace function public.activate_child_login_id(
  p_student_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_child text;
  v_auth  uuid;
begin
  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'activate_login_id: child has no owning parent';
  end if;

  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  return jsonb_build_object('new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.activate_child_login_id(uuid) is
  'Allocate the deferred 8-digit child login ID without a subscription (giveaway add-child path). service_role EXECUTE only; caller authorizes parent ownership first.';

revoke all on function public.activate_child_login_id(uuid) from public, anon, authenticated;
grant execute on function public.activate_child_login_id(uuid) to service_role;

-- Administrator payment bypass: comped ACTIVE subscription (all amounts 0 —
-- nothing was charged; subject pricing is validated to exist so granted
-- subjects are real), provider 'admin_grant', period now → now + p_days
-- (default week 7 / month 30 / year 365, capped 1..730). Allocates the 8-digit
-- login ID exactly like create_child_subscription; NO sibling-discount row.
-- service_role EXECUTE only — the admin-panel action runs requireAdmin() first
-- and writes the audit row.
create or replace function public.admin_grant_child_access(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[],
  p_days               int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_days    int;
  v_missing int;
  v_sub     uuid;
  v_sid     uuid;
  v_ids     jsonb;
  v_end     timestamptz;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'admin_grant: no subjects selected';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'admin_grant: child has no owning parent';
  end if;

  v_days := coalesce(p_days,
                     case p_interval when 'week' then 7 when 'month' then 30 else 365 end);
  if v_days < 1 or v_days > 730 then
    raise exception 'admin_grant: days out of range (1..730)';
  end if;

  select count(*) into v_missing
  from unnest(p_subject_ids) s(sid)
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = s.sid and sp.interval = p_interval and sp.status = 'active'
  );
  if v_missing > 0 then
    raise exception 'admin_grant: missing active pricing for % subject(s)', v_missing;
  end if;

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'admin_grant: child already has a live subscription';
  end if;

  v_end := now() + (v_days || ' days')::interval;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     current_period_start, sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'active',
     now(), 0, 'AZN', 'admin_grant')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values (v_sub, v_sid, p_interval, 0, 'AZN', now(), v_end)
    on conflict do nothing;
  end loop;

  v_ids := public.activate_child_login_id(p_student_profile_id);

  update public.students set access_status = 'active'
   where profile_id = p_student_profile_id;

  return jsonb_build_object(
    'subscription_id', v_sub, 'status', 'active', 'days', v_days,
    'current_period_end', to_jsonb(v_end))
    || v_ids;
end;
$$;

comment on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) is
  'Administrator payment bypass: comped ACTIVE child subscription (amounts 0, provider admin_grant), allocates the 8-digit login ID, flips access_status to active. service_role EXECUTE only; admin-panel action guards + audits.';

revoke all on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) from public, anon, authenticated;
grant execute on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) to service_role;

-- -----------------------------------------------------------------------------
-- Test & daily task engine (Stage 13, increment 1).
-- Backported from migrations/2026_06_28_013_test_engine.sql. Server-side RANDOM
-- question selection + attempts + auto-grading. Users never choose difficulty and
-- never see is_correct before grading; scores are computed server-side. Three
-- SECURITY DEFINER RPCs executable by the authenticated student (each verifies it
-- owns the attempt). Placed at the END so the function REVOKEs run AFTER 010's
-- blanket grants — otherwise anon's EXECUTE grant would remain.
-- -----------------------------------------------------------------------------

-- ---- start_practice_attempt ----
create or replace function public.start_practice_attempt(
  p_subject_id uuid,
  p_count      int default 25
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_grade   uuid;
  v_attempt uuid;
  v_n       int;
begin
  if v_student is null then raise exception 'start_practice: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_practice: not a student'; end if;
  -- THE access gate (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1).
  -- Every rule that used to be hand-copied into this function — the giveaway
  -- window, the admin free-access interval, the per-subject subscription join
  -- and its lazy date arithmetic — now lives in ONE reader,
  -- has_subject_access(), which consults public.entitlements first and the two
  -- computed override windows second. Three copies of one predicate drift
  -- within a release; one cannot. The gate still runs BEFORE any row is
  -- created, so a refusal still consumes nothing.
  if not public.has_subject_access(v_student, p_subject_id) then
    raise exception 'start_practice: no active access' using errcode = 'check_violation';
  end if;

  insert into public.test_attempts (student_profile_id, subject_id, kind, status)
  values (v_student, p_subject_id, 'practice', 'in_progress')
  returning id into v_attempt;

  -- Random selection of published, objective, auto-gradable GENERAL questions for
  -- the subject (grade-matched when the child has a grade). Difficulty is NOT
  -- chosen. PRIVATE olympiad-package questions are excluded (olympiad_package_id IS NULL).
  with picked as (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
    order by random()
    limit greatest(1, p_count)
  )
  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, id from picked;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'start_practice: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  return v_attempt;
end;
$$;

-- ---- get_practice_attempt (questions + options, NO is_correct) ----
create or replace function public.get_practice_attempt(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_owner   uuid;
  v_status  public.attempt_status;
  v_loc     text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_result  jsonb;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;

  select jsonb_build_object('attempt_id', p_attempt_id, 'status', v_status,
                            'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'type', qtp.code,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.questions qq on qq.id = taa.question_id
    left join public.question_types qtp on qtp.id = qq.type_id
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- ---- grade_practice_attempt (records answers, auto-grades, sets score) ----
create or replace function public.grade_practice_attempt(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_owner   uuid;
  v_status  public.attempt_status;
  v_item    jsonb;
  v_qid     uuid;
  v_sel     uuid[];
  v_correct uuid[];
  v_ok      boolean;
  v_rows    int;
  v_seen    uuid[] := '{}';
  v_score   numeric := 0;
  v_max     int;
begin
  select student_profile_id, status into v_owner, v_status
  from public.test_attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> v_student then raise exception 'forbidden'; end if;
  if v_status <> 'in_progress' then raise exception 'attempt already submitted'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_qid := nullif(v_item->>'question_id', '')::uuid;
    -- Audit H5 (migration 035): each question counts once; ids outside the attempt
    -- are ignored (the UPDATE below matches zero rows and awards nothing).
    if v_qid is null or v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;

    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
    select coalesce(array_agg(ao.id), '{}')
      into v_correct
      from public.answer_options ao where ao.question_id = v_qid and ao.is_correct;

    v_ok := (array_length(v_correct, 1) is not null)
        and (v_sel <@ v_correct) and (v_correct <@ v_sel)
        and coalesce(array_length(v_sel, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    get diagnostics v_rows = row_count;
    if v_rows > 0 and v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  update public.test_attempts
     set status = 'graded', score = v_score, max_score = v_max,
         submitted_at = now(), graded_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('score', v_score, 'max', v_max,
    'results', (select coalesce(jsonb_agg(jsonb_build_object(
                  'question_id', question_id, 'is_correct', is_correct)), '[]'::jsonb)
                from public.test_attempt_answers where attempt_id = p_attempt_id));
end;
$$;

-- EXECUTE: the authenticated student (owner-checked inside); never anon.
revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;
revoke all on function public.get_practice_attempt(uuid, text) from public, anon;
grant execute on function public.get_practice_attempt(uuid, text) to authenticated, service_role;
revoke all on function public.grade_practice_attempt(uuid, jsonb) from public, anon;
grant execute on function public.grade_practice_attempt(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Olimpiada Preparation engine (Stage 14, increment 1).
-- Backported from migrations/2026_06_28_014_olympiad_engine.sql. Parent one-time
-- LIFETIME purchase + child olympiad attempts (25 random from the package's
-- curated pool, reusing get_/grade_practice_attempt).
-- purchase_olympiad is service-role (parent action authorizes the parent);
-- start_olympiad_attempt is the authenticated child (purchase-gated). Placed at
-- the END so the function REVOKEs run AFTER 010's blanket grants — otherwise
-- anon/authenticated's EXECUTE grant on purchase_olympiad would remain.
--
-- THE CHARGE IS NO LONGER STUBBED (migration 127). It used to be: the web app
-- called a MOCK that returned success unconditionally, purchase_olympiad wrote
-- an ACTIVE purchase, and migration 124 mirrored that into a LIFETIME
-- entitlement with no `payments` row anywhere. The package now runs on the same
-- intent-first rail as the subscription — quote, intent, redirect, verified
-- payment, grant — through checkout_intent_open / checkout_redeem_plan.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Migration 127: the olympiad package becomes a PAID product on the same rail
-- as the subscription. quote_olympiad_purchase is the one computation the
-- preview, the intent and the charge all read (audit H7);
-- purchase_olympiad_if_free is what every APPLICATION caller uses, so the
-- priced purchase_olympiad below is reachable only from checkout_redeem_plan,
-- behind a payment the gateway confirmed.
-- -----------------------------------------------------------------------------

create or replace function public.quote_olympiad_purchase(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid;
  v_child_grade uuid;
  v_price       numeric(10,2);
  v_currency    text;
  v_status      public.catalog_status;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_grades      uuid[];
  v_buy_grade   uuid;
  v_ex_status   text;
begin
  select created_by_parent_profile_id, grade_id into v_owner, v_child_grade
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'olympiad quote: child has no owning parent'
      using errcode = 'check_violation', hint = 'bad_student';
  end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then
    raise exception 'olympiad quote: package not found'
      using errcode = 'check_violation', hint = 'package_not_found';
  end if;

  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'olympiad quote: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    if v_child_grade is null or not (v_child_grade = any(v_grades)) then
      raise exception 'olympiad quote: package does not cover the child''s grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
    v_buy_grade := v_child_grade;
  end if;

  select status into v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id
    and olympiad_package_id = p_package_id;
  if v_ex_status = 'active' then
    -- Lifetime access is already held. Opening a checkout for it would take
    -- money for something the family owns, which is the mirror of the defect
    -- this migration closes.
    raise exception 'olympiad quote: package already owned'
      using errcode = 'unique_violation', hint = 'already_owned';
  end if;

  return jsonb_build_object(
    'package_id',         p_package_id,
    'student_profile_id', p_student_profile_id,
    'grade_id',           v_buy_grade,
    'price',              v_price,
    'due_now',            v_price,
    'currency',           coalesce(v_currency, 'AZN'));
end;
$$;

comment on function public.quote_olympiad_purchase(uuid, uuid) is
  'Migration 127: the read-only price of ONE olympiad package for ONE child, and the single computation the intent, the re-price and the charge all read (audit H7). Re-states purchase_olympiad''s guards in the same order and raises the same hints (bad_student / package_not_found / package_not_on_sale / package_not_for_grade / already_owned). Returns the ENTITLED GRADE beside the price, because purchase_olympiad snapshots it and attempts draw that pool forever -- so the grade is part of what is bought, not a detail.';

revoke all on function public.quote_olympiad_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function public.quote_olympiad_purchase(uuid, uuid) to service_role;


create or replace function public.purchase_olympiad_if_free(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_due numeric(12,2);
begin
  v_res := public.purchase_olympiad(p_student_profile_id, p_package_id);

  -- NULL IS A REFUSAL, not a zero -- the same sentence the two plan wrappers
  -- carry, for the same reason: "we could not tell what this costs" must never
  -- resolve to "so it is probably free".
  v_due := (v_res->>'due_now')::numeric;
  if v_due is null or v_due > 0 then
    raise exception 'olympiad: this package has to be paid for'
      using errcode = 'check_violation', hint = 'payment_required';
  end if;

  return v_res;
end;
$$;

comment on function public.purchase_olympiad_if_free(uuid, uuid) is
  'Migration 127: purchase_olympiad for every APPLICATION caller -- the web action and the purchase-silent mobile BFF alike. Grants the package and then rolls the whole statement back with check_violation/payment_required if the RPC''s own answer priced it above zero, so a priced package can only ever be delivered by checkout_redeem_plan behind a verified payment. A zero-priced package and a repeated click on an already-owned one both answer due_now = 0 and pass.';

revoke all on function public.purchase_olympiad_if_free(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad_if_free(uuid, uuid) to service_role;

create or replace function public.purchase_olympiad(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid;
  v_price       numeric(10,2);
  v_currency    text;
  v_status      public.catalog_status;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_child_grade uuid;
  v_grades      uuid[];
  v_buy_grade   uuid;
  v_existing    uuid;
  v_ex_status   text;
  v_id          uuid;
begin
  -- Round 48 kill switch (migration 089): no paid write while the
  -- payment mode is off. Defence in depth -- the web/BFF layer checks
  -- too, but this is the layer that cannot be forgotten.
  perform public.assert_payments_enabled();
  select created_by_parent_profile_id, grade_id into v_owner, v_child_grade
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Sales window (migration 070; supersedes the migration-035 event-date gate,
  -- carried over by 070's one-time sale_ends_at := event_starts_at backfill):
  -- the ONE canonical predicate — olympiad_package_on_sale, defined in 015.
  -- Off-sale = not purchasable, full stop (existing purchasers are unaffected —
  -- this guard only blocks NEW purchases).
  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'purchase: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  -- Round 34: when the package targets grades, the child's CURRENT grade must
  -- be one of them, and the purchase snapshots it (attempts draw THAT pool
  -- forever — yearly promotion never re-points a lifetime entitlement).
  -- Empty target set = legacy grade-less package: buyable by anyone (old rule).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    if v_child_grade is null or not (v_child_grade = any(v_grades)) then
      raise exception 'purchase: package does not cover the child''s grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
    v_buy_grade := v_child_grade;
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      -- MIGRATION 127: due_now = 0 and charged = false. NOTHING HAPPENED --
      -- the child already owns it, no money is owed and none was taken. The
      -- _if_free wrapper reads exactly this key, so a harmless re-click from
      -- the purchase-silent surface is not mistaken for an attempted purchase.
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active',
                                'existing', true, 'grade_id', v_buy_grade,
                                'amount', v_price, 'currency', v_currency,
                                'due_now', 0::numeric(12,2), 'charged', false);
    end if;
    -- Audit L17 (migration 035): re-buying after a refund records the CURRENT
    -- price/date — and now also the CURRENT grade entitlement.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           grade_id = coalesce(v_buy_grade, grade_id),
           purchased_at = now(), updated_at = now()
     where id = v_existing;
    -- A RE-BUY AFTER A REFUND IS A PURCHASE. It records today's price and
    -- today's grade, so due_now is that price and charged is true -- the row
    -- is `existing` only in the sense that it is reused in place.
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active',
                              'existing', true, 'grade_id', v_buy_grade,
                              'amount', v_price, 'currency', v_currency,
                              'due_now', v_price, 'charged', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider, grade_id)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none', v_buy_grade)
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active',
                            'existing', false, 'grade_id', v_buy_grade,
                            'amount', v_price, 'currency', v_currency,
                            'due_now', v_price, 'charged', true);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. '
  'service_role only. Migration 070: only packages passing '
  'olympiad_package_on_sale are purchasable (hint package_not_on_sale). '
  'Round 34: the child''s grade must be a package target grade (hint '
  'package_not_for_grade) and is SNAPSHOTTED on the purchase row. '
  'Migration 127: the answer carries amount / currency / grade_id / due_now / '
  'charged, and since 127 the ONLY caller that may reach it with money owed is '
  'checkout_redeem_plan, behind a verified payment -- every application path '
  'goes through purchase_olympiad_if_free.';


-- Migration 047: olympiad attempts run on the TIMED test engine (jsonb return,
-- TRUE resume, deadline from olympiad_packages.duration_minutes, pre-inserted
-- answer rows). Drop first — the return type changed from uuid to jsonb.
-- Round 51 (migrations 090/092): questions_per_attempt is LIVE — each attempt
-- serves that many via the PER-STUDENT rotation over the entitled grade's
-- pool, and attempts are PRACTICE-ONLY (is_rated = false; Round 48 already
-- kept them out of points/percentage/streak in award_attempt_points).
drop function if exists public.start_olympiad_attempt(uuid);

CREATE OR REPLACE FUNCTION public.start_olympiad_attempt(p_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_student    uuid := public.current_profile_id();
  v_pkg        record;
  v_duration   int;
  v_existing   record;
  v_qids       uuid[];
  v_attempt    uuid;
  v_deadline   timestamptz;
  v_grades     uuid[];
  v_buy_grade  uuid;
  v_cur_grade  uuid;
  v_pool_grade uuid;
  -- Round 49: rotation state. Declared `record`, NOT the table's composite
  -- type: canonical run order creates this function (011) BEFORE the rotation
  -- table (015), and a declared composite type must exist at compile time.
  v_rot        record;
  v_tries      int := 0;
  -- Migration 106: the per-grade config, resolved after grade entitlement.
  v_gcfg       record;
  v_pool       uuid[];
  v_seen       uuid[];
  v_pick1      uuid[] := '{}';
  v_pick2      uuid[] := '{}';
  v_n          int;
  v_k          int;
  v_cycle      int;
  v_reset      boolean := false;
begin
  if v_student is null then raise exception 'olympiad: not authenticated'; end if;

  -- Purchase-only (owner ruling 2026-07-06, migration 038): free-access/trial/
  -- giveaway windows cover SUBJECTS only — olympiad packages are always bought.
  -- Migration 124: the grant is read from public.entitlements through
  -- live_package_entitlement(), which consults NO window — so the ruling above
  -- is preserved STRUCTURALLY rather than by remembering not to add one here.
  -- `select ... into` still sets FOUND, so a legacy purchase whose grade was
  -- never snapshotted arrives as a NULL v_buy_grade and falls through to the
  -- Round-34 ladder below exactly as it did before.
  select le.grade_id into v_buy_grade
  from public.live_package_entitlement(v_student, p_package_id) le;
  if not found then
    raise exception 'olympiad: no active purchase' using errcode = 'check_violation';
  end if;

  -- Round 49: questions_per_attempt is LIVE again (dead config since 057).
  select id, subject_id, coalesce(duration_minutes, 25) as dur_min,
         greatest(least(coalesce(questions_per_attempt, 25), 500), 1) as n_per
    into v_pkg
  from public.olympiad_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'olympiad: package not found' using errcode = 'no_data_found';
  end if;
  -- Migration 106: the package values above are only the FALLBACK. What
  -- actually applies depends on the entitled grade and is resolved below, once
  -- v_pool_grade is known — this is why every grade used to share one question
  -- count and one clock.
  v_duration := v_pkg.dur_min * 60;

  -- Round 34: resolve WHICH grade's pool this child is entitled to.
  --   purchase snapshot → current grade → the only target grade (legacy
  --   single-grade purchases made before the snapshot column) → error.
  -- Empty target set = legacy grade-less package → whole pool (old behavior).
  select array_agg(g.grade_id) into v_grades
  from public.olympiad_package_grades g
  where g.olympiad_package_id = p_package_id;
  if v_grades is not null then
    select grade_id into v_cur_grade from public.students where profile_id = v_student;
    if v_buy_grade is not null and v_buy_grade = any(v_grades) then
      v_pool_grade := v_buy_grade;
    elsif v_cur_grade is not null and v_cur_grade = any(v_grades) then
      v_pool_grade := v_cur_grade;
    elsif cardinality(v_grades) = 1 then
      v_pool_grade := v_grades[1];
    else
      raise exception 'olympiad: package does not cover your grade'
        using errcode = 'check_violation', hint = 'package_not_for_grade';
    end if;
  end if;

  -- Migration 106: the entitled grade is known now — take THAT grade's
  -- question count and duration (falling back to the package's when the grade
  -- carries no override). The draw size and the deadline below both use these.
  select c.questions_per_attempt, c.duration_minutes
    into v_gcfg
  from public.olympiad_grade_config(p_package_id, v_pool_grade) c;
  if v_gcfg.questions_per_attempt is not null then
    v_pkg.n_per := v_gcfg.questions_per_attempt;
    v_duration  := v_gcfg.duration_minutes * 60;
  end if;

  -- Round 49 — ROTATION LOCK. Get-or-create this student's rotation row for
  -- (package, entitled grade) and hold a row lock for the rest of the call.
  -- Everything below (resume check, unseen read, draw, attempt creation,
  -- consumption write) therefore runs SERIALLY per student+package+grade, so
  -- two tabs cannot consume overlapping question sets. The loop is the standard
  -- upsert race handler: the loser of an insert race retries once and locks the
  -- winner's row. It is bounded, so it can never spin.
  loop
    v_tries := v_tries + 1;
    if v_tries > 3 then
      raise exception 'olympiad: rotation lock contention' using errcode = 'lock_not_available';
    end if;
    select * into v_rot
    from public.olympiad_question_rotations
    where student_profile_id  = v_student
      and olympiad_package_id = p_package_id
      and grade_id is not distinct from v_pool_grade
    for update;
    exit when found;
    begin
      insert into public.olympiad_question_rotations
        (student_profile_id, olympiad_package_id, grade_id)
      values (v_student, p_package_id, v_pool_grade);
    exception when unique_violation then
      null;   -- a concurrent starter created it; loop and lock THAT row
    end;
  end loop;

  -- TRUE resume: one open olympiad attempt at a time (test-engine parity).
  -- Runs under the rotation lock, so the losing tab of a race lands here and
  -- replays the winner's identical question list instead of drawing again.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'olympiad' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is not null and v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', coalesce(v_existing.duration_seconds, v_duration));
    end if;
    update public.test_attempts
       set status = (case when v_existing.deadline_at is null
                          then 'abandoned' else 'expired' end)::public.attempt_status,
           updated_at = now()
     where id = v_existing.id;
  end if;

  -- CANDIDATE POOL: all published questions of the ENTITLED GRADE's pool
  -- (Round 34: never another grade's questions). Round 49: this is no longer
  -- the served set — the rotation below picks questions_per_attempt of it.
  select coalesce(array_agg(q.id), '{}') into v_pool
  from public.questions q
  where q.olympiad_package_id = p_package_id
    and q.status = 'published'
    and (v_pool_grade is null or q.grade_id = v_pool_grade)
    and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct);

  if cardinality(v_pool) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  -- Never ask for more than exists: a pool smaller than the configured count
  -- serves the WHOLE pool. This is also what makes the algorithm terminating —
  -- v_n <= |pool| guarantees the top-up below always finds enough candidates.
  v_n := least(v_pkg.n_per, cardinality(v_pool));

  -- Prune consumed ids that have LEFT the pool (archived or unpublished since).
  -- Without this the stored set could exceed the pool and the cycle would never
  -- appear exhausted.
  select coalesce(array_agg(s), '{}') into v_seen
  from unnest(v_rot.seen_question_ids) s
  where s = any(v_pool);

  -- Up to v_n UNSEEN questions from the student's CURRENT cycle.
  select coalesce(array_agg(t.id), '{}') into v_pick1
  from (select p as id
        from unnest(v_pool) p
        where not (p = any(v_seen))
        order by random()
        limit v_n) t;
  v_k := coalesce(cardinality(v_pick1), 0);

  if v_k >= v_n then
    v_seen  := v_seen || v_pick1;
    v_cycle := v_rot.cycle_no;
  else
    -- CYCLE BOUNDARY — atomic because it happens inside the same row lock and
    -- the same statement/transaction as the attempt insert. The current cycle
    -- is exhausted: serve what is left of it, then top up from a FRESH cycle
    -- over the full pool, EXCLUDING what this attempt already holds so nothing
    -- repeats inside the attempt (520 pool / 50 per attempt -> 20 + 30).
    v_reset := true;
    select coalesce(array_agg(t.id), '{}') into v_pick2
    from (select p as id
          from unnest(v_pool) p
          where not (p = any(v_pick1))
          order by random()
          limit (v_n - v_k)) t;
    -- The carry-over questions count as consumed in the NEW cycle as well.
    -- Otherwise they would be eligible again on the very NEXT attempt, i.e. the
    -- same question in two consecutive sittings.
    v_seen  := v_pick1 || v_pick2;
    v_cycle := v_rot.cycle_no + 1;
  end if;

  -- Shuffle the union so a boundary attempt does not present the old cycle's
  -- leftovers as a leading block.
  select coalesce(array_agg(t.id), '{}') into v_qids
  from (select x as id from unnest(v_pick1 || v_pick2) x order by random()) t;

  if cardinality(v_qids) = 0 then
    raise exception 'olympiad: no questions in package pool' using errcode = 'no_data_found';
  end if;

  v_deadline := now() + make_interval(secs => v_duration);

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, is_rated)
  values
    (v_student, v_pkg.subject_id, 'olympiad', 'in_progress',
     v_qids, v_deadline, v_duration, false)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  -- Mark consumption LAST, still under the row lock: if anything above raised,
  -- the whole call rolls back and nothing was consumed.
  update public.olympiad_question_rotations
     set seen_question_ids = v_seen,
         cycle_no          = v_cycle,
         attempts_drawn    = attempts_drawn + 1,
         last_drawn_at     = now()
   where id = v_rot.id;

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false,
    'deadline_at', v_deadline, 'duration_seconds', v_duration,
    'count', cardinality(v_qids),
    'cycle', v_cycle, 'cycle_reset', v_reset,
    'pool_size', cardinality(v_pool));
end;
$function$;

comment on function public.start_olympiad_attempt(uuid) is
  'Round 49/51: purchase-gated olympiad start. Serves exactly '
  'questions_per_attempt questions from the ENTITLED GRADE''s published pool '
  '(the whole pool when it is smaller), never repeating a question inside an '
  'attempt and never repeating across attempts until that student''s cycle for '
  '(package, grade) is exhausted -- then the cycle resets and a fresh one '
  'starts from the full pool. Rotation is per student, held under a '
  'SELECT ... FOR UPDATE row lock, so concurrent tabs resume one attempt '
  'instead of consuming twice. Attempts are PRACTICE-ONLY (Round 48) and are '
  'created with is_rated = false (Round 51).';


revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Round 51 (migration 090): activation validation for questions_per_attempt.
-- A package cannot be ACTIVATED (or have per-attempt raised while active)
-- unless EVERY target grade's published pool can fill one attempt. Message is
-- the owner's Azerbaijani sentence; HINT carries the stable machine key
-- (olympiad_pool_below_per_attempt) and DETAIL a JSON payload so admin-panel
-- renders the en/ru variants itself. The trigger is SECURITY DEFINER so the
-- pool count is the TRUE count (questions is RLS-protected).
-- -----------------------------------------------------------------------------
create or replace function public.assert_olympiad_pool_meets_per_attempt(
  p_package_id  uuid,
  p_per_attempt int,
  p_grade_id    uuid default null       -- null = validate EVERY target grade
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  -- Migration 107: the package-level number is only the FALLBACK now — each
  -- target grade may carry its own questions_per_attempt.
  v_fallback int := greatest(coalesce(p_per_attempt, 1), 1);
  v_need  int;
  v_pool  int;
  v_sfx   text;
  r       record;
begin
  -- Legacy grade-less package (no target-grade rows): the WHOLE published pool
  -- has to fill an attempt, because that is exactly what such a package serves.
  if not exists (select 1 from public.olympiad_package_grades g
                  where g.olympiad_package_id = p_package_id) then
    select count(*)::int into v_pool
    from public.questions q
    where q.olympiad_package_id = p_package_id
      and q.status = 'published';
    if v_pool < v_fallback then
      raise exception
        'Paketə % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        v_pool, v_fallback, v_fallback
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', null, 'grade_id', null,
                                           'pool', v_pool, 'required', v_fallback)::text;
    end if;
    return;
  end if;

  for r in
    select g.grade_id                    as grade_id,
           gr.level::int                 as level,
           -- Migration 107: THIS grade's requirement, not the package's.
           greatest(coalesce(g.questions_per_attempt, v_fallback), 1) as need,
           (select count(*)::int
              from public.questions q
             where q.olympiad_package_id = p_package_id
               and q.status = 'published'
               and q.grade_id = g.grade_id) as pool
    from public.olympiad_package_grades g
    join public.grades gr on gr.id = g.grade_id
    where g.olympiad_package_id = p_package_id
      and (p_grade_id is null or g.grade_id = p_grade_id)
    order by gr.level
  loop
    v_need := r.need;
    if r.pool < v_need then
      -- Azerbaijani ordinal suffix by vowel harmony of the spoken numeral:
      -- üç/dörd -> cü, altı -> cı, doqquz/on -> cu, everything else -> ci.
      -- grades.level is constrained to 1..11, so this covers the whole domain.
      v_sfx := case r.level
                 when 3  then 'cü'
                 when 4  then 'cü'
                 when 6  then 'cı'
                 when 9  then 'cu'
                 when 10 then 'cu'
                 else 'ci'
               end;
      raise exception
        '%-% sinif üçün % sual yüklənib. Paket üzrə sual sayı % olduğu üçün ən azı % sual tələb olunur.',
        r.level, v_sfx, r.pool, v_need, v_need
        using errcode = 'check_violation',
              hint    = 'olympiad_pool_below_per_attempt',
              detail  = jsonb_build_object('grade_level', r.level, 'grade_id', r.grade_id,
                                           'pool', r.pool, 'required', v_need)::text;
    end if;
  end loop;
end;
$$;

comment on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid) is
  'Round 49 + migration 107: raises check_violation (hint '
  'olympiad_pool_below_per_attempt, DETAIL = JSON {grade_level, grade_id, pool, '
  'required}) when a target grade''s published pool cannot fill one attempt. '
  'Each grade is checked against ITS OWN questions_per_attempt, falling back to '
  'p_per_attempt. service-internal: reached through the activation guards only.';

revoke all on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_olympiad_pool_meets_per_attempt(uuid, int, uuid)
  to service_role;

-- Guard fires on the ACTIVATION itself, never on unrelated edits.
-- SECURITY DEFINER so the pool count is the TRUE count: questions is an
-- RLS-protected table and the guard must never pass because rows were hidden
-- from the caller (same reasoning as get_olympiad_pool_counts). Running as the
-- owner is also what lets it call the service-role-only validator above.
create or replace function public.olympiad_activation_pool_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'active'::public.catalog_status then
    return new;
  end if;

  -- An ALREADY-active package must stay editable: changing the price, banner,
  -- sale window or event date is not an activation and must not be blocked by a
  -- pool that predates this rule. Only a transition INTO active, or a raise of
  -- questions_per_attempt while active, is re-validated.
  if tg_op = 'UPDATE'
     and old.status = new.status
     and old.questions_per_attempt = new.questions_per_attempt then
    return new;
  end if;

  perform public.assert_olympiad_pool_meets_per_attempt(new.id, new.questions_per_attempt);
  return new;
end;
$$;

comment on function public.olympiad_activation_pool_guard() is
  'Round 49: blocks activating (or raising questions_per_attempt on) an '
  'olympiad package whose target-grade pool cannot fill one attempt. Unrelated '
  'edits to an already-active package pass through untouched.';

-- Migration 107: the same rule for the GRADE rows. The guard above fires on
-- olympiad_packages, but per-grade counts live on olympiad_package_grades — so
-- adding a target grade to an ACTIVE package, or raising one grade's count,
-- reached no validation at all. Same philosophy as above: only a change that
-- could make an ACTIVE package unservable is checked; everything else passes.
-- SECURITY DEFINER for the same reason (questions is RLS-protected and the
-- guard must never pass because rows were hidden from the caller).
create or replace function public.olympiad_grade_pool_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status  public.catalog_status;
  v_pkg_per int;
begin
  select p.status, p.questions_per_attempt
    into v_status, v_pkg_per
  from public.olympiad_packages p
  where p.id = new.olympiad_package_id;

  -- Not active → the package-level guard validates the whole set at activation.
  if v_status is distinct from 'active'::public.catalog_status then
    return new;
  end if;

  -- A RAISE is the only update that can newly break servability; lowering the
  -- count (or editing the duration) is always safe.
  if tg_op = 'UPDATE'
     and coalesce(new.questions_per_attempt, v_pkg_per, 1)
         <= coalesce(old.questions_per_attempt, v_pkg_per, 1) then
    return new;
  end if;

  perform public.assert_olympiad_pool_meets_per_attempt(
    new.olympiad_package_id, v_pkg_per, new.grade_id);
  return new;
end;
$$;

comment on function public.olympiad_grade_pool_guard() is
  'Migration 107: blocks adding a target grade to — or raising a grade''s '
  'questions_per_attempt on — an ACTIVE olympiad package whose published pool '
  'for that grade cannot fill one attempt. The trigger is ARMED IN 015.';

-- The trigger itself is ARMED IN 015 (after olympiad_packages exists —
-- canonical run order: 011 functions first, 015 tables later).

-- ---------------------------------------------------------------------------
-- norm_import_text (migration 108): text normalizer shared by both sides of the
-- olympiad import duplicate key (trim, collapse whitespace, lowercase).
-- Deliberately NOT `strict`: the coalesce lives INSIDE the body so a NULL folds
-- to ''. The stored side reads answer_option_translations through a LEFT JOIN
-- (the importer writes no row for a locale with neither text nor image) while
-- the incoming side reads a possibly-absent JSON key — both must produce the
-- same '' or every append would report zero duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.norm_import_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'))
$$;

comment on function public.norm_import_text(text) is
  'Migration 108: normalizes text for the olympiad import duplicate key (trim, '
  'collapse whitespace, lowercase; NULL folds to ''''). service-internal — '
  'reached only from bulk_insert_olympiad_package_questions.';

-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated, so revoking `public` alone would leave it callable.
revoke all on function public.norm_import_text(text) from public, anon, authenticated;
grant execute on function public.norm_import_text(text) to service_role;


-- ---------------------------------------------------------------------------
-- bulk_insert_olympiad_package_questions (Batch D; v2 migration 059): import
-- PRIVATE trilingual questions for one olympiad package. Same item format as
-- bulk_insert_questions but every inserted question gets olympiad_package_id =
-- p_package_id and is published immediately (the attempt engine requires
-- status='published'), so it stays out of the general pool. Subject defaults to
-- the package's subject; type optional (defaults single_choice, migration 059).
-- APPENDABLE PER GRADE since migration 108 (owner 2026-08-11 — supersedes the
-- migration-059 creation-only rule): a further upload into a grade that already
-- has questions ADDS to its pool. A row whose primary-locale body, option texts
-- and image references match one already in that (package, grade) pool is
-- reported as a per-row error and skipped, so re-uploading a file is safe. A row
-- carrying images never matches (media uuids are minted per upload), and the
-- guard is best-effort rather than a constraint — two simultaneous appends can
-- both insert. Administrator-only (audit H2); never anon-executable.
-- ---------------------------------------------------------------------------
drop function if exists public.bulk_insert_olympiad_package_questions(uuid, jsonb);

create function public.bulk_insert_olympiad_package_questions(
  p_package_id uuid,
  p_questions  jsonb,
  p_grade_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile  uuid := public.current_profile_id();
  v_pkg_subj uuid;
  v_item     jsonb;
  v_idx      int := 0;
  v_ok       int := 0;
  v_fail     int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_subject  uuid; v_grade uuid; v_type uuid; v_oly uuid; v_source uuid;
  v_topic    uuid; v_subtopic uuid;
  v_qid      uuid; v_optid uuid;
  v_pl       text; v_loc text; v_opt jsonb; v_order int;
  v_pool_grade uuid;
  -- Migration 101: optional pre-uploaded question image (the same field the
  -- general importer accepts). Assigned unconditionally per item below — it is
  -- loop-persistent, so leaving it unset would carry the previous question's
  -- image onto the next one.
  v_media uuid;
  -- Migration 108: content keys of THIS grade's existing pool, snapshotted once.
  v_dup_keys text[] := '{}';
  v_key      text;
begin
  -- Audit H2 (migration 035): olympiad pools are an Admin-only module (content
  -- managers must never manage Olympiad Preparation) — no permission fallback.
  if v_profile is null or not public.is_admin() then
    raise exception 'bulk_insert_olympiad_package_questions: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'bulk_insert_olympiad_package_questions: payload must be a JSON array';
  end if;

  select subject_id into v_pkg_subj from public.olympiad_packages where id = p_package_id;
  if not found then
    raise exception 'bulk_insert_olympiad_package_questions: package not found';
  end if;

  -- Round 34: the import targets ONE grade pool. Explicit p_grade_id (the new
  -- per-grade admin flow) or the package's legacy single grade (old callers).
  v_pool_grade := coalesce(p_grade_id,
    (select grade_id from public.olympiad_packages where id = p_package_id));
  if v_pool_grade is null then
    raise exception 'bulk_insert_olympiad_package_questions: no target grade'
      using errcode = 'check_violation', hint = 'pool_grade_missing';
  end if;
  if exists (select 1 from public.olympiad_package_grades g
              where g.olympiad_package_id = p_package_id)
     and not exists (select 1 from public.olympiad_package_grades g
                      where g.olympiad_package_id = p_package_id
                        and g.grade_id = v_pool_grade) then
    raise exception 'bulk_insert_olympiad_package_questions: grade is not a package target'
      using errcode = 'check_violation', hint = 'pool_grade_not_targeted';
  end if;

  -- Migration 108: APPEND, duplicate-guarded (replaces the creation-only raise).
  -- ONE snapshot of the existing pool's content keys, taken before the loop, so
  -- a 500-row import costs O(pool + rows) instead of re-querying per row. The
  -- snapshot is never extended during the loop — a row is only ever compared
  -- against what was already in the pool when the call started.
  -- ARCHIVED questions are included on purpose: the row still exists, and
  -- restoring it is the right admin action for a question that is already there.
  select coalesce(array_agg(k), '{}') into v_dup_keys
  from (
    select md5(
             public.norm_import_text(qt.body) || chr(31) ||
             public.norm_import_text(qt.media_asset_id::text) || chr(31) ||
             coalesce((
               select string_agg(
                        public.norm_import_text(aot.text) || chr(29) ||
                        public.norm_import_text(aot.media_asset_id::text),
                        chr(30) order by ao.order_index)
               from public.answer_options ao
               left join public.answer_option_translations aot
                 on aot.option_id = ao.id and aot.locale = q2.primary_locale
               where ao.question_id = q2.id), '')
           ) as k
    from public.questions q2
    join public.question_translations qt
      on qt.question_id = q2.id and qt.locale = q2.primary_locale
    where q2.olympiad_package_id = p_package_id
      and q2.grade_id = v_pool_grade
  ) s;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_idx := v_idx + 1;
    begin
      v_subject := v_pkg_subj;
      if v_subject is null and coalesce(v_item->'meta'->>'subject','') <> '' then
        select id into v_subject from public.subjects where name = (v_item->'meta'->>'subject');
      end if;
      if v_subject is null then raise exception 'no subject (package has none and item has no subject)'; end if;

      -- Round 34: the TARGET GRADE is authoritative for every row — a stray
      -- meta.grade_level in the file can never leak a question into another
      -- grade's pool.
      v_grade := v_pool_grade;

      if coalesce(v_item->'meta'->>'type','') <> '' then
        select id into v_type from public.question_types where name = (v_item->'meta'->>'type');
        if v_type is null then raise exception 'unknown type %', v_item->'meta'->>'type'; end if;
      else
        select id into v_type from public.question_types where code = 'single_choice';
        if v_type is null then raise exception 'single_choice type missing'; end if;
      end if;

      perform public.assert_question_type_rules(v_type, coalesce(v_item->'options','[]'::jsonb));

      -- Migration 100: the PACKAGE owns the olympiad type. `meta.olympiad_type`
      -- in an uploaded row is ignored — the admin already chose the type in the
      -- package form, and asking every question to repeat it only created a way
      -- to disagree with it (a typo produced NULL silently, since the old
      -- lookup-by-name had no not-found branch). Subject and grade were already
      -- injected the same way; this closes the last redundant field.
      select p.olympiad_type_id into v_oly
        from public.olympiad_packages p
       where p.id = p_package_id;

      v_source := null;
      if coalesce(v_item->'meta'->>'source','') <> '' then
        select id into v_source from public.sources where name = (v_item->'meta'->>'source') limit 1;
        if v_source is null then
          insert into public.sources (name) values (v_item->'meta'->>'source') returning id into v_source;
        end if;
      end if;

      -- Module scope (migration 050): olympiad uploads live in 'olympiad' scope —
      -- a topic name matching an exam topic yields a SEPARATE olympiad-scoped row,
      -- so nothing ever surfaces inside the Exams module.
      v_topic := null; v_subtopic := null;
      if coalesce(v_item->'meta'->>'topic','') <> '' then
        select id into v_topic from public.topics
          where subject_id = v_subject and name = (v_item->'meta'->>'topic')
            and scope = 'olympiad' limit 1;
        if v_topic is null then
          insert into public.topics (subject_id, grade_id, name, scope)
          values (v_subject, v_grade, v_item->'meta'->>'topic', 'olympiad') returning id into v_topic;
        end if;
        if coalesce(v_item->'meta'->>'subtopic','') <> '' then
          select id into v_subtopic from public.subtopics
            where topic_id = v_topic and name = (v_item->'meta'->>'subtopic') limit 1;
          if v_subtopic is null then
            insert into public.subtopics (topic_id, name)
            values (v_topic, v_item->'meta'->>'subtopic') returning id into v_subtopic;
          end if;
        end if;
      end if;

      -- ---- optional pre-uploaded question image (migration 101) ----
      v_media := nullif(v_item->'meta'->>'media_asset_id','')::uuid;
      if v_media is not null and not exists (
        select 1 from public.media_assets ma
        where ma.id = v_media and ma.bucket = 'question-media'
      ) then
        raise exception 'media_asset_id does not reference a question-media asset';
      end if;

      v_pl := coalesce(v_item->>'primary_locale','az');
      if v_pl not in ('az','en','ru') then v_pl := 'az'; end if;
      if coalesce(v_item->'translations'->v_pl->>'body','') = '' then
        raise exception 'missing % body', v_pl;
      end if;

      -- Migration 108: the incoming row's content key, built exactly like the
      -- stored one above. The option ORDER must mirror the insert's
      -- coalesce(order_index, v_order) with v_order starting at 0 — ordinality
      -- is 1-based, hence ord - 1 — or the two keys diverge and nothing ever
      -- matches.
      select md5(
               public.norm_import_text(v_item->'translations'->v_pl->>'body') || chr(31) ||
               public.norm_import_text(v_media::text) || chr(31) ||
               coalesce((
                 select string_agg(
                          public.norm_import_text(o->'text'->>v_pl) || chr(29) ||
                          public.norm_import_text(o->'image'->>v_pl),
                          chr(30) order by coalesce((o->>'order_index')::int, (ord - 1)::int))
                 from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
                        with ordinality as t(o, ord)), '')
             ) into v_key;
      if v_key = any(v_dup_keys) then
        raise exception 'duplicate question already in this grade pool';
      end if;

      -- PRIVATE + published; difficulty removed (difficulty_id null).
      insert into public.questions
        (grade_id, subject_id, topic_id, subtopic_id, type_id, difficulty_id,
         olympiad_type_id, source_id, status, primary_locale,
         olympiad_package_id, created_by, updated_by)
      values
        (v_grade, v_subject, v_topic, v_subtopic, v_type, null,
         v_oly, v_source, 'published', v_pl::public.content_locale,
         p_package_id, v_profile, v_profile)
      returning id into v_qid;

      for v_loc in select jsonb_object_keys(v_item->'translations')
      loop
        if v_loc in ('az','en','ru') then
          -- Migration 119: the BODY guard wraps the TRANSLATION row only. It
          -- used to wrap the explanation insert too, so a locale supplying an
          -- explanation but no body had that explanation silently dropped --
          -- no row, no error, nothing in the per-item errors array.
          -- question_explanations has NO FK to question_translations and
          -- get_test_review joins the two independently, so an
          -- explanation-only locale is perfectly servable: that reader gets
          -- their own explanation next to the az body.
          -- BACKWARD COMPATIBLE: a legacy payload carrying only
          -- translations.az.{body,explanation} still lands exactly one az
          -- translation row and one az explanation row, unchanged.
          if coalesce(v_item->'translations'->v_loc->>'body','') <> '' then
            insert into public.question_translations (question_id, locale, body, prompt, media_asset_id)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'body',
                    nullif(v_item->'translations'->v_loc->>'prompt',''),
                    case when v_loc = v_pl then v_media end);
          end if;
          if coalesce(v_item->'translations'->v_loc->>'explanation','') <> '' then
            insert into public.question_explanations (question_id, locale, explanation_body)
            values (v_qid, v_loc::public.content_locale, v_item->'translations'->v_loc->>'explanation');
          end if;
        end if;
      end loop;

      v_order := 0;
      for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb))
      loop
        insert into public.answer_options (question_id, is_correct, order_index)
        values (v_qid, coalesce((v_opt->>'is_correct')::boolean, false),
                coalesce((v_opt->>'order_index')::int, v_order))
        returning id into v_optid;
        v_order := v_order + 1;
        for v_loc in select jsonb_object_keys(coalesce(v_opt->'text','{}'::jsonb))
        loop
          -- Migration 104: write the row when the locale has TEXT **or** an
          -- IMAGE. The old condition skipped empty text, which would leave an
          -- image-only option with no translation row at all.
          if v_loc in ('az','en','ru')
             and (coalesce(v_opt->'text'->>v_loc,'') <> ''
                  or coalesce(v_opt->'image'->>v_loc,'') <> '') then
            if coalesce(v_opt->'image'->>v_loc,'') <> ''
               and not exists (
                 select 1 from public.media_assets ma
                  where ma.id = (v_opt->'image'->>v_loc)::uuid
                    and ma.bucket = 'question-media') then
              raise exception 'option image does not reference a question-media asset';
            end if;
            insert into public.answer_option_translations (option_id, locale, text, media_asset_id)
            values (v_optid, v_loc::public.content_locale,
                    coalesce(v_opt->'text'->>v_loc, ''),
                    nullif(v_opt->'image'->>v_loc,'')::uuid);
          end if;
        end loop;
      end loop;

      -- v_key is deliberately NOT pushed back into v_dup_keys: the comparison
      -- is against the PRE-EXISTING pool only. Two identical rows inside one
      -- file both import, exactly as they did before 108 — creation and
      -- add-grade are all-or-nothing, so failing the second one would undo a
      -- package creation that used to succeed.
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', SQLERRM);
    end;
  end loop;

  return jsonb_build_object('total', v_idx, 'successful', v_ok, 'failed', v_fail, 'errors', v_errors);
end;
$$;

comment on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) is
  'Bulk import of PRIVATE trilingual questions into ONE GRADE POOL of an '
  'olympiad package (Round 34). p_grade_id must be a package target grade '
  '(default: the legacy single package grade). APPENDABLE per grade (migration '
  '108, owner 2026-08-11 — supersedes the migration-059 creation-only rule): a '
  'row whose primary-locale body, option texts and image references already '
  'existed in that pool WHEN THE CALL STARTED is reported as a per-row error '
  'and skipped, so re-uploading a file is safe. Rows inserted by the same call '
  'are never compared against each other, so a file with two identical rows '
  'imports exactly as it did before 108. Rows carrying images are never matched '
  '(media uuids are minted per upload), and the key is bound to the primary '
  'locale on both sides — the same question re-uploaded with a different '
  'primary_locale does not match. Best-effort guard, NOT a constraint — two '
  'simultaneous appends can both insert. Administrators only.';

revoke all on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) from public, anon;
grant execute on function public.bulk_insert_olympiad_package_questions(uuid, jsonb, uuid) to authenticated, service_role;



-- -----------------------------------------------------------------------------
-- Round 9 (migration 023): REAL analytics RPCs (parent dashboard + admin
-- platform overview). On-demand aggregation over graded attempts; in-body
-- authorization (service role / admin / linked parent / the child itself);
-- EXECUTE revoked from anon.
-- -----------------------------------------------------------------------------
-- Migration 114 added p_locale. A defaulted parameter creates a SECOND
-- overload rather than replacing the function, and every existing call at the
-- old arity then fails 'function is not unique' — so the old signature is
-- dropped first (a no-op on a from-zero build).
drop function if exists public.get_child_subject_dashboard(uuid, uuid, int, text);
create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30,
  p_scope text default 'tests',
  p_locale text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  -- Module scope (migration 051): 'tests' (default) or 'olympiads'; unknown
  -- values coerce to 'tests' so pre-051 callers keep working unchanged.
  v_scope text := case when p_scope = 'olympiads' then 'olympiads' else 'tests' end;
  -- Same clamp the question-body RPCs use; an unknown tag reads as Azerbaijani
  -- (migration 114).
  v_loc public.content_locale :=
    (case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end)::public.content_locale;
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  -- COALESCE is load-bearing: current_profile_id() can be NULL (no profile),
  -- which would turn the OR-chain NULL and silently skip an un-coalesced guard.
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student_profile_id)
    or public.current_profile_id() = p_student_profile_id
  , false) then
    raise exception 'not allowed';
  end if;

  with graded as (
    select ta.id, ta.submitted_at,
           least(greatest(coalesce(
             extract(epoch from (ta.submitted_at - ta.started_at)) / 60.0, 0), 0), 180)
             as minutes_spent
      from public.test_attempts ta
     where ta.student_profile_id = p_student_profile_id
       and ta.status = 'graded'
        -- MIGRATION 140: trial play is not this child's performance. Filtering
        -- on is_free_trial rather than is_rated is deliberate -- is_rated would
        -- also strip topic tests and replays out of every PAYING family's
        -- analytics, which is a different feature nobody asked for.
        and not ta.is_free_trial
       and ta.submitted_at >= now() - make_interval(days => v_days)
       and (p_subject_id is null or ta.subject_id = p_subject_id)
       -- Module scope (migration 051): olympiad attempts never mix into the
       -- Subjects analytics and vice versa.
       and ((v_scope = 'olympiads' and ta.kind = 'olympiad')
         or (v_scope = 'tests' and ta.kind <> 'olympiad'))
  ),
  ans as (
    -- answered = a non-empty stored selection; empty selection = SKIPPED
    -- (migration 046 — skipped must never count as wrong).
    select a.attempt_id, a.is_correct,
           coalesce(array_length(a.selected_option_ids, 1), 0) > 0 as answered,
           q.topic_id, q.subtopic_id, q.olympiad_package_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'scope', v_scope,
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'answered',  (select count(*) filter (where answered) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where answered and not is_correct) from ans),
      'skipped',   (select count(*) filter (where not answered) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*) filter (where answered), 0) * 100, 1)
                      from ans)
    ),
    'time_spent_minutes', (select round(coalesce(sum(minutes_spent), 0)) from graded),
    'last_activity', (select max(submitted_at) from graded),
    'weekly_activity', (
      -- gap-filled last-7-days series (today inclusive)
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      -- accuracy per day over ANSWERED questions only (046); zero-answered days
      -- are omitted (they would otherwise chart as a false 0%).
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(answ, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) filter (where answered) answ,
                     count(*) filter (where is_correct) cor
                from ans group by 1
              having count(*) filter (where answered) > 0) t
    ),
    'per_topic', (
      -- zero-answered topics excluded (046): strongest/weakest must never rank
      -- a topic nobody actually answered. topic_id is part of the group key, so
      -- localizing the label (114) cannot merge two distinct topics.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.answ, 'correct', x.cor,
               'wrong', x.answ - x.cor, 'skipped', x.skp,
               'accuracy', round(x.cor::numeric / nullif(x.answ, 0) * 100, 1))
               order by x.answ desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, coalesce(ttr.name, t.name) as tname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.topic_translations ttr
                       on ttr.topic_id = t.id and ttr.locale = v_loc
               group by a.topic_id, coalesce(ttr.name, t.name)
              having count(*) filter (where a.answered) > 0) x
    ),
    'mistakes', (
      -- Grouped by t.id / st.id, NOT by the names (114). A name-based key would
      -- become locale-dependent — the same rows would merge differently in EN
      -- than in AZ — and it already merged two genuinely distinct subtopics that
      -- happen to share a name. The coalesced names ride along as extra group
      -- keys only because they are functionally determined by the ids.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.answ, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select coalesce(ttr.name, t.name) as tname,
                     coalesce(str.name, st.name, '—') as sname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where a.answered and not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.topic_translations ttr
                       on ttr.topic_id = t.id and ttr.locale = v_loc
                left join public.subtopics st on st.id = a.subtopic_id
                left join public.subtopic_translations str
                       on str.subtopic_id = st.id and str.locale = v_loc
               group by t.id, st.id,
                        coalesce(ttr.name, t.name),
                        coalesce(str.name, st.name, '—')
              having count(*) filter (where a.answered and not a.is_correct) > 0
               order by count(*) filter (where a.answered and not a.is_correct) desc
               limit 10) y
    ),
    'per_package', (
      -- Olympiad scope only (051): per-package breakdown through the attempt
      -- questions' private-pool link. Title in the reader's locale with an az
      -- fallback (114; it used to be hardcoded to az); '[]' under tests scope.
      select coalesce(jsonb_agg(jsonb_build_object(
               'package_id', z.pkg, 'title', z.title,
               'attempts', z.att, 'answered', z.answ, 'correct', z.cor,
               'wrong', z.answ - z.cor, 'skipped', z.skp,
               'accuracy', round(z.cor::numeric / nullif(z.answ, 0) * 100, 1))
               order by z.att desc, z.title), '[]'::jsonb)
        from (select a.olympiad_package_id as pkg,
                     coalesce(
                       (select tr.title from public.olympiad_package_translations tr
                         where tr.olympiad_package_id = a.olympiad_package_id
                           and tr.locale = v_loc limit 1),
                       (select tr.title from public.olympiad_package_translations tr
                         where tr.olympiad_package_id = a.olympiad_package_id
                           and tr.locale = 'az' limit 1),
                       '—') as title,
                     count(distinct a.attempt_id) att,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
               where v_scope = 'olympiads' and a.olympiad_package_id is not null
               group by a.olympiad_package_id) z
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_child_subject_dashboard(uuid, uuid, int, text, text) is
  'Per-child analytics over graded attempts in a rolling window, module-scoped '
  '(migration 051): p_scope tests (default; kind<>olympiad) or olympiads (kind=olympiad, '
  'adds per_package). Answer states separated (046): wrong counts only answered-and-'
  'incorrect; skipped is its own metric; accuracy uses answered as the denominator. '
  'p_locale (az/en/ru, default az) localizes topic/subtopic names and package titles. '
  'Callable by admins, the linked parent, or the child.';

revoke all on function public.get_child_subject_dashboard(uuid, uuid, int, text, text)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int, text, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------

create or replace function public.get_admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not coalesce(auth.role() = 'service_role' or public.is_admin(), false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'children_total', (select count(*) from public.students),
    'parents_total',  (select count(*) from public.parents),
    'active_children_7d', (
      select count(distinct student_profile_id) from public.test_attempts
       where submitted_at >= now() - interval '7 days'
    ),
    'attempts_30d', (
      select count(*) from public.test_attempts
       where status = 'graded' and not is_free_trial   -- MIGRATION 140
         and submitted_at >= now() - interval '30 days'
    ),
    'platform_accuracy_30d', (
      select round(count(*) filter (where a.is_correct)::numeric
                   / nullif(count(*), 0) * 100, 1)
        from public.test_attempt_answers a
        join public.test_attempts ta on ta.id = a.attempt_id
       where ta.status = 'graded' and not ta.is_free_trial   -- MIGRATION 140
         and ta.submitted_at >= now() - interval '30 days'
    ),
    'questions_published', (
      select count(*) from public.questions
       where status = 'published' and olympiad_package_id is null
    ),
    'active_subscriptions', (
      select count(*) from public.child_subscriptions
       where status in ('trialing', 'active', 'past_due')
    ),
    'signups_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join (select created_at::date dt, count(*) n
                     from public.students group by 1) c on c.dt = d::date
    ),
    'attempts_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 13, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from public.test_attempts
                    where status = 'graded' and not is_free_trial   -- MIGRATION 140
                    group by 1) c on c.dt = d::date
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_admin_platform_overview() is
  'Admin-panel platform KPIs (children/parents/actives/attempts/accuracy/questions/'
  'subscriptions) + 30-day signup and 14-day attempts trends. Admin-only (in-body check).';

revoke all on function public.get_admin_platform_overview() from public, anon;
grant execute on function public.get_admin_platform_overview() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Access lifecycle reconciliation (audit C1, migration 036). Expires live
-- subscriptions whose trial/paid period ended and syncs the students.access_status
-- display cache both directions. Scheduled hourly in 016; correctness never
-- depends on it — the attempt RPCs above check current_period_end lazily.
-- -----------------------------------------------------------------------------
create or replace function public.recompute_child_access()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired    int;
  v_downgraded int;
  v_restored   int;
begin
  -- 1) Expire live subscriptions whose trial/paid period has ended.
  --    Migration 109 kept this step correct WITHOUT a change, because
  --    current_period_end is defined as the MAX of the per-subject period ends
  --    ("is there any coverage left"). Do NOT "fix" it to the MIN: that would
  --    expire a whole subscription — and a paid yearly subject with it — the
  --    moment its shortest-cycle subject lapsed. Per-subject expiry is enforced
  --    where it belongs, in the attempt gates.
  update public.child_subscriptions
     set status = 'expired', updated_at = now()
   where status in ('trialing', 'active', 'past_due')
     and current_period_end is not null
     and current_period_end <= now();
  get diagnostics v_expired = row_count;

  -- 2) Downgrade students whose access flag claims access but who have no live,
  --    date-valid subscription left (canceled keeps access until the already-
  --    paid period ends — same rule as the attempt-RPC guards).
  update public.students s
     set access_status = 'expired'::public.child_access_status
   where s.access_status in ('trialing', 'active')
     and not exists (
       select 1 from public.child_subscriptions cs
       where cs.student_profile_id = s.profile_id
         and cs.status in ('trialing', 'active', 'canceled')
         and cs.current_period_end is not null
         and cs.current_period_end > now()
     );
  get diagnostics v_downgraded = row_count;

  -- 3) Repair the reverse direction: a live dated subscription with a stale
  --    non-access flag.
  update public.students s
     set access_status = case when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and cs.status = 'trialing'
               and cs.current_period_end > now())
           then 'trialing'::public.child_access_status
           else 'active'::public.child_access_status end
   where s.access_status not in ('trialing', 'active')
     and exists (
       select 1 from public.child_subscriptions cs
       where cs.student_profile_id = s.profile_id
         and cs.status in ('trialing', 'active')
         and cs.current_period_end is not null
         and cs.current_period_end > now()
     );
  get diagnostics v_restored = row_count;

  return jsonb_build_object(
    'subscriptions_expired', v_expired,
    'students_downgraded',   v_downgraded,
    'students_restored',     v_restored);
end;
$$;

comment on function public.recompute_child_access() is
  'Hourly reconciliation (audit C1): expires ended subscriptions and syncs students.access_status. Access CORRECTNESS never depends on this job — the attempt RPCs check current_period_end lazily.';

revoke all on function public.recompute_child_access() from public, anon, authenticated;
grant execute on function public.recompute_child_access() to service_role;

-- -----------------------------------------------------------------------------
-- TOPIC-TEST ENGINE (migration 037; docs/plans/TEST_ENGINE_PLAN.md T0).
-- Owner decisions 2026-07-06: FIXED 25 questions, TRUE resume, unlimited
-- attempts with a fresh re-draw. Server-authoritative everything: draw,
-- grading, single-open, expiry. Answer keys are revealed ONLY by
-- get_test_review (status='graded'). Migration 057: topic tests are UNTIMED
-- PRACTICE (no deadline, never rated); rated play = daily rounds/olympiads.
-- -----------------------------------------------------------------------------

-- start_topic_test_attempt: access-guarded (same rule as start_practice_attempt),
-- topic/subtopic scope validated, 25 random published MCQ-family questions
-- (fallback to subject-wide when the scope has none). Untimed since 057.
create or replace function public.start_topic_test_attempt(
  p_subject_id   uuid,
  p_topic_ids    uuid[] default '{}',
  p_subtopic_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;    -- owner decision: fixed
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_topics   uuid[] := coalesce(p_topic_ids, '{}');
  v_subs     uuid[] := coalesce(p_subtopic_ids, '{}');
  v_existing record;
  v_qids     uuid[];
  v_attempt  uuid;
begin
  if v_student is null then raise exception 'start_test: not authenticated'; end if;
  select grade_id into v_grade
  from public.students where profile_id = v_student;
  if not found then raise exception 'start_test: not a student'; end if;

  -- THE access gate (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1).
  -- Every rule that used to be hand-copied into this function — the giveaway
  -- window, the admin free-access interval, the per-subject subscription join
  -- and its lazy date arithmetic — now lives in ONE reader,
  -- has_subject_access(), which consults public.entitlements first and the two
  -- computed override windows second. Three copies of one predicate drift
  -- within a release; one cannot. The gate still runs BEFORE any row is
  -- created, so a refusal still consumes nothing.
  if not public.has_subject_access(v_student, p_subject_id) then
    raise exception 'start_test: no active access' using errcode = 'check_violation';
  end if;

  -- Scope validation: topics must belong to the subject; subtopics to the
  -- chosen topics (and require topics when subtopics are given).
  if cardinality(v_topics) > 50 or cardinality(v_subs) > 100 then
    raise exception 'start_test: scope too large';
  end if;
  if cardinality(v_topics) > 0 and exists (
    select 1 from unnest(v_topics) t(id)
    where not exists (select 1 from public.topics tp where tp.id = t.id and tp.subject_id = p_subject_id)
  ) then
    raise exception 'start_test: topic does not belong to subject';
  end if;
  if cardinality(v_subs) > 0 then
    if cardinality(v_topics) = 0 then
      raise exception 'start_test: subtopics given without topics';
    end if;
    if exists (
      select 1 from unnest(v_subs) s(id)
      where not exists (select 1 from public.subtopics st where st.id = s.id and st.topic_id = any (v_topics))
    ) then
      raise exception 'start_test: subtopic does not belong to the chosen topics';
    end if;
  end if;

  -- Resume: one open practice test at a time. Untimed rows (056+) resume
  -- forever (the 24h cron abandons them); legacy timed rows keep the old
  -- deadline behavior.
  -- MIGRATION 143: ... FOR THIS SUBJECT.
  --
  -- This query used to filter on the student alone, so a child with an open
  -- Maths test who pressed "start" on English was handed the MATHS attempt back
  -- -- different questions, different subject, reported as `resumed: true`. The
  -- caller had asked for one subject and silently received another.
  --
  -- The index below carried the same omission, so the database could not have
  -- caught it either.
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and subject_id = p_subject_id
    and kind = 'test' and status = 'in_progress'
  order by started_at desc
  limit 1;
  if v_existing.id is not null then
    if v_existing.deadline_at is null or v_existing.deadline_at > now() then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', v_existing.deadline_at,
        'duration_seconds', v_existing.duration_seconds);
    end if;
    update public.test_attempts
       set status = 'expired', updated_at = now()
     where id = v_existing.id;
  end if;

  -- Server-random draw, published MCQ-family, general pool, grade-matched;
  -- scoped to the selection, falling back to subject-wide when the scope has
  -- no questions.
  select coalesce(array_agg(id), '{}') into v_qids from (
    select q.id
    from public.questions q
    where q.subject_id = p_subject_id
      and q.status = 'published'
      and q.olympiad_package_id is null
      and q.type_id in (
        select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
      )
      and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
      and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      and (cardinality(v_topics) = 0 or q.topic_id = any (v_topics))
      and (cardinality(v_subs) = 0 or q.subtopic_id = any (v_subs))
    order by random()
    limit c_count
  ) picked;

  if cardinality(v_qids) = 0 and (cardinality(v_topics) > 0 or cardinality(v_subs) > 0) then
    select coalesce(array_agg(id), '{}') into v_qids from (
      select q.id
      from public.questions q
      where q.subject_id = p_subject_id
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.type_id in (
          select id from public.question_types where code in ('single_choice', 'multiple_choice', 'true_false')
        )
        and exists (select 1 from public.answer_options ao where ao.question_id = q.id and ao.is_correct)
        and (v_grade is null or q.grade_id = v_grade or q.grade_id is null)
      order by random()
      limit c_count
    ) picked;
  end if;

  if cardinality(v_qids) = 0 then
    raise exception 'start_test: no questions available for this subject'
      using errcode = 'no_data_found';
  end if;

  -- UNTIMED practice (migration 057): no deadline, never rated.
  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status,
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids, is_rated,
     is_free_trial)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, null, null, v_topics, v_subs, false,
     -- MIGRATION 140: provenance only. Ratedness is already a literal false
     -- above and stays that way; this records WHY the attempt happened so the
     -- analytics filter can exclude trial play without excluding the practice
     -- of every paying family.
     public.subject_access_is_trial_only(v_student, p_subject_id))
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', false,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
end;
$$;
comment on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) is
  'Subject PRACTICE test (migration 057): mandatory-scope 25-question draw, UNTIMED '
  '(no deadline) and UNRATED (no points/streak/boards). Rated play = daily rounds.';

-- get_test_attempt: rehydration payload (questions + options WITHOUT is_correct,
-- saved answers + flags, server deadline → remaining seconds). Migration 057:
-- daily-round attempts render from the round's immutable snapshot; every
-- payload carries the question 'image' ({bucket,path}, locale-aware, az fallback).

create or replace function public.get_test_attempt(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_loc      text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_snap     jsonb;
  v_result   jsonb;
begin
  select id, student_profile_id, status, kind, subject_id,
         deadline_at, duration_seconds, score, max_score, daily_round_id
    into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  if v_snap is not null then
    -- Immutable snapshot content (migration 057) + live answer state.
    select jsonb_build_object(
             'attempt_id', p_attempt_id,
             'status', v_att.status,
             'kind', v_att.kind,
             'subject_id', v_att.subject_id,
             'deadline_at', v_att.deadline_at,
             'duration_seconds', v_att.duration_seconds,
             'remaining_seconds',
               case when v_att.deadline_at is null then null
                    else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end,
             'score', v_att.score,
             'max_score', v_att.max_score,
             'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
    into v_result
    from (
      select s.ord,
             jsonb_build_object(
               'question_id', (s.q_el->>'question_id')::uuid,
               'type', s.q_el->>'type',
               'topic_id', nullif(s.q_el->>'topic_id','')::uuid,
               'body', coalesce(s.q_el->'translations'->v_loc->>'body',
                                s.q_el->'translations'->'az'->>'body'),
               'prompt', coalesce(s.q_el->'translations'->v_loc->>'prompt',
                                  s.q_el->'translations'->'az'->>'prompt'),
               'image', coalesce(s.q_el->'translations'->v_loc->'image',
                                 s.q_el->'translations'->'az'->'image'),
               'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
               'is_marked', taa.is_marked,
               'options', (
                 select coalesce(jsonb_agg(
                   jsonb_build_object('option_id', (o->>'option_id')::uuid,
                                      'text', coalesce(o->'text'->>v_loc, o->'text'->>'az'))
                   order by (o->>'order_index')::int), '[]'::jsonb)
                 from jsonb_array_elements(s.q_el->'options') o
               )) as q
      from jsonb_array_elements(v_snap) with ordinality s(q_el, ord)
      join public.test_attempt_answers taa
        on taa.attempt_id = p_attempt_id
       and taa.question_id = (s.q_el->>'question_id')::uuid
    ) s2;
    return v_result;
  end if;

  select jsonb_build_object(
           'attempt_id', p_attempt_id,
           'status', v_att.status,
           'kind', v_att.kind,
           'subject_id', v_att.subject_id,
           'deadline_at', v_att.deadline_at,
           'duration_seconds', v_att.duration_seconds,
           'remaining_seconds',
             case when v_att.deadline_at is null then null
                  else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end,
           'score', v_att.score,
           'max_score', v_att.max_score,
           'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'type', qtp.code,
        'topic_id', qq.topic_id,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'image', case when ma.id is null then null
                      else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'is_marked', taa.is_marked,
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.questions qq on qq.id = taa.question_id
    left join public.question_types qtp on qtp.id = qq.type_id
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.media_assets ma
      on ma.id = coalesce(qt.media_asset_id, qt_az.media_asset_id)
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- save_test_answers: idempotent autosave. Only attempt-member rows are touched;
-- rejected once the server deadline has passed.
create or replace function public.save_test_answers(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_rows     int;
  v_saved    int := 0;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'save: attempt is not in progress' using errcode = 'check_violation';
  end if;
  if v_att.deadline_at is not null and now() > v_att.deadline_at then
    raise exception 'save: deadline passed' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_n := v_n + 1;
    exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)
    v_qid := nullif(v_item->>'question_id', '')::uuid;
    if v_qid is null or v_qid = any (v_seen) then continue; end if;
    v_seen := v_seen || v_qid;

    select coalesce(array_agg(e::uuid), '{}')
      into v_sel
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;

    update public.test_attempt_answers
       set selected_option_ids = v_sel,
           is_marked = coalesce((v_item->>'is_marked')::boolean, is_marked),
           time_spent_ms = least(coalesce(nullif(v_item->>'time_spent_ms','')::bigint, time_spent_ms, 0), 86400000),
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_qid;
    get diagnostics v_rows = row_count;
    v_saved := v_saved + v_rows;
  end loop;

  return jsonb_build_object(
    'saved', v_saved,
    'remaining_seconds',
      case when v_att.deadline_at is null then null
           else greatest(0, floor(extract(epoch from (v_att.deadline_at - now()))))::int end);
end;
$$;

-- submit_test_attempt: merge final answers (60s grace past the deadline; later
-- answers are IGNORED, saved ones still grade), then grade FROM THE STORED ROWS
-- (never from the client array — audit-H5 posture). Idempotent when graded.
-- Migration 057: daily-round attempts grade against the round's immutable
-- SNAPSHOT correctness (bank edits after generation can never change history).
-- Migration 114 added p_locale (passed straight through to the result payload
-- so the per-topic breakdown comes back in the reader's language). The old
-- arity is dropped first: a defaulted parameter ADDS an overload instead of
-- replacing the function, and every 2-argument call would then fail as
-- ambiguous.
drop function if exists public.submit_test_attempt(uuid, jsonb);
create or replace function public.submit_test_attempt(
  p_attempt_id uuid,
  p_answers    jsonb default null,
  p_locale     text  default 'az'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_snap     jsonb;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_r        record;
  v_correct  uuid[];
  v_ok       boolean;
  v_score    numeric := 0;
  v_max      int;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  -- Idempotent: an already-graded attempt returns its stored result.
  if v_att.status = 'graded' then
    return public.test_attempt_result(p_attempt_id, p_locale);
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'submit: attempt is not in progress' using errcode = 'check_violation';
  end if;

  -- Daily-round attempts grade against the round's immutable snapshot
  -- (migration 057): bank edits after generation can never change history.
  -- Round 38: per-student attempts have NO round — they grade from live
  -- options below, like topic tests (option-id stability is DB-guarded).
  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  -- Merge the final client answers only within deadline + 60s grace.
  if p_answers is not null
     and (v_att.deadline_at is null or now() <= v_att.deadline_at + interval '60 seconds') then
    for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
    loop
      v_n := v_n + 1;
      exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)
      v_qid := nullif(v_item->>'question_id', '')::uuid;
      if v_qid is null or v_qid = any (v_seen) then continue; end if;
      v_seen := v_seen || v_qid;
      select coalesce(array_agg(e::uuid), '{}')
        into v_sel
        from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
      update public.test_attempt_answers
         set selected_option_ids = v_sel, updated_at = now()
       where attempt_id = p_attempt_id and question_id = v_qid;
    end loop;
  end if;

  -- Grade from the STORED rows.
  for v_r in
    select question_id, selected_option_ids
    from public.test_attempt_answers where attempt_id = p_attempt_id
  loop
    if v_snap is not null then
      select coalesce(array_agg((o->>'option_id')::uuid), '{}')
        into v_correct
        from jsonb_array_elements(v_snap) q_el
        cross join lateral jsonb_array_elements(q_el->'options') o
        where (q_el->>'question_id')::uuid = v_r.question_id
          and coalesce((o->>'is_correct')::boolean, false);
    else
      select coalesce(array_agg(ao.id), '{}')
        into v_correct
        from public.answer_options ao
        where ao.question_id = v_r.question_id and ao.is_correct;
    end if;

    v_ok := (array_length(v_correct, 1) is not null)
        and (coalesce(v_r.selected_option_ids, '{}') <@ v_correct)
        and (v_correct <@ coalesce(v_r.selected_option_ids, '{}'))
        and coalesce(array_length(v_r.selected_option_ids, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_r.question_id;
    if v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  begin
    update public.test_attempts
       set status = 'graded', score = v_score, max_score = v_max,
           submitted_at = now(), graded_at = now(), updated_at = now()
     where id = p_attempt_id;
  exception when unique_violation then
    -- Another attempt of the same subject+day was submitted first (second
    -- device). This one can never grade — surface the friendly signal; the
    -- losing attempt stays in_progress and is swept by the expiry cron.
    -- (Any state write here would be undone by this raise — savepoint
    -- semantics — so none is attempted.)
    raise exception 'daily: already attempted today' using errcode = 'unique_violation';
  end;

  return public.test_attempt_result(p_attempt_id, p_locale);
end;
$$;

comment on function public.submit_test_attempt(uuid, jsonb, text) is
  'Grades an attempt from the STORED answer rows and returns test_attempt_result. '
  'Idempotent for a graded attempt. p_locale is passed straight through to the '
  'result payload so the per-topic breakdown comes back in the reader''s language.';

-- Shared result payload (score + per-question + per-topic breakdown). Internal
-- helper for submit (and re-reads); owner check lives in the callers.
-- Migration 114: p_locale localizes the per-topic names; the old arity is
-- dropped first so the defaulted parameter cannot leave an ambiguous overload.
drop function if exists public.test_attempt_result(uuid);
create or replace function public.test_attempt_result(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'attempt_id', ta.id,
    'status', ta.status,
    'score', ta.score,
    'max', ta.max_score,
    'submitted_at', ta.submitted_at,
    'results', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'question_id', taa.question_id, 'is_correct', taa.is_correct)), '[]'::jsonb)
      from public.test_attempt_answers taa where taa.attempt_id = ta.id),
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', b.tid, 'name', b.tname, 'total', b.total, 'correct', b.correct)), '[]'::jsonb)
      from (
        select q.topic_id as tid,
               coalesce(ttr.name, tp.name) as tname,
               count(*) as total,
               count(*) filter (where taa.is_correct) as correct
        from public.test_attempt_answers taa
        join public.questions q on q.id = taa.question_id
        left join public.topics tp on tp.id = q.topic_id
        -- 'az' resolves to no row by construction (ck_topic_tr_not_az), so the
        -- join misses and the base AZ name is used — no special case needed.
        left join public.topic_translations ttr
               on ttr.topic_id = tp.id
              and ttr.locale = (case when p_locale in ('az', 'en', 'ru')
                                     then p_locale else 'az' end)::public.content_locale
        where taa.attempt_id = ta.id
        group by q.topic_id, coalesce(ttr.name, tp.name)
      ) b))
  from public.test_attempts ta
  where ta.id = p_attempt_id;
$$;

comment on function public.test_attempt_result(uuid, text) is
  'Shared graded-attempt payload (score + per-question + per-topic). p_locale '
  '(az/en/ru, default az) localizes the topic names through topic_translations '
  'with an az fallback. Service-role only; owner checks live in the callers.';

-- cancel_test_attempt: counts for NOTHING (no score, no points, no streak).
create or replace function public.cancel_test_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_att     record;
begin
  select id, student_profile_id, status into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'cancel: attempt is not in progress' using errcode = 'check_violation';
  end if;

  update public.test_attempts
     set status = 'canceled', canceled_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- get_test_review: the ONLY place answer keys are revealed, and only for the
-- owner's GRADED attempt (works for practice attempts too). Migration 057:
-- daily-round attempts render from the round's immutable snapshot; every
-- payload carries the question 'image' ({bucket,path}, locale-aware, az fallback).
create or replace function public.get_test_review(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_profile_id();
  v_att     record;
  v_loc     text := case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end;
  v_snap    jsonb;
  v_result  jsonb;
begin
  select id, student_profile_id, status, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;
  if v_att.status <> 'graded' then
    raise exception 'review: attempt not graded yet' using errcode = 'check_violation';
  end if;

  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  if v_snap is not null then
    select jsonb_build_object(
             'attempt_id', p_attempt_id,
             'score', v_att.score,
             'max', v_att.max_score,
             'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
    into v_result
    from (
      select s.ord,
             jsonb_build_object(
               'question_id', (s.q_el->>'question_id')::uuid,
               'body', coalesce(s.q_el->'translations'->v_loc->>'body',
                                s.q_el->'translations'->'az'->>'body'),
               'prompt', coalesce(s.q_el->'translations'->v_loc->>'prompt',
                                  s.q_el->'translations'->'az'->>'prompt'),
               'image', coalesce(s.q_el->'translations'->v_loc->'image',
                                 s.q_el->'translations'->'az'->'image'),
               'is_correct', taa.is_correct,
               'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
               'explanation', coalesce(e.loc_ex, e.az_ex),
               -- Migration 119: WHICH locale produced the string above, and
               -- whether it is the az fallback rather than the reader's
               -- language. Additive keys: the shipped mobile binary ignores
               -- unknown keys (it casts the payload, it does not validate it)
               -- and keeps deriving the flag itself, so this cannot break it.
               -- In THIS branch the server is strictly more correct than the
               -- clients: they probe the LIVE question_explanations table,
               -- which is only a proxy for a FROZEN content_snapshot.
               'explanation_locale',
                 case when e.loc_ex is not null then v_loc
                      when e.az_ex  is not null then 'az' end,
               'explanation_is_fallback',
                 (v_loc <> 'az' and e.loc_ex is null and e.az_ex is not null),
               'options', (
                 select coalesce(jsonb_agg(
                   jsonb_build_object('option_id', (o->>'option_id')::uuid,
                                      'text', coalesce(o->'text'->>v_loc, o->'text'->>'az'),
                                      'is_correct', coalesce((o->>'is_correct')::boolean, false))
                   order by (o->>'order_index')::int), '[]'::jsonb)
                 from jsonb_array_elements(s.q_el->'options') o
               )) as q
      from jsonb_array_elements(v_snap) with ordinality s(q_el, ord)
      join public.test_attempt_answers taa
        on taa.attempt_id = p_attempt_id
       and taa.question_id = (s.q_el->>'question_id')::uuid
      -- Migration 119: resolve each candidate ONCE. btrim/nullif treat a
      -- blank explanation as absent so the served text and the disclosed
      -- locale can never disagree (no write path produces a blank row).
      cross join lateral (
        select nullif(btrim(s.q_el->'translations'->v_loc->>'explanation'), '') as loc_ex,
               nullif(btrim(s.q_el->'translations'->'az'->>'explanation'), '')  as az_ex
      ) e
    ) s2;
    return v_result;
  end if;

  select jsonb_build_object(
           'attempt_id', p_attempt_id,
           'score', v_att.score,
           'max', v_att.max_score,
           'questions', coalesce(jsonb_agg(q order by ord), '[]'::jsonb))
  into v_result
  from (
    select
      row_number() over (order by taa.created_at, taa.id) as ord,
      jsonb_build_object(
        'question_id', taa.question_id,
        'body', coalesce(qt.body, qt_az.body),
        'prompt', coalesce(qt.prompt, qt_az.prompt),
        'image', case when ma.id is null then null
                      else jsonb_build_object('bucket', ma.bucket, 'path', ma.path) end,
        'is_correct', taa.is_correct,
        'selected_option_ids', coalesce(to_jsonb(taa.selected_option_ids), '[]'::jsonb),
        'explanation', coalesce(e.loc_ex, e.az_ex),
        -- Migration 119: see the snapshot branch. SECURITY DEFINER means this
        -- flag is authoritative where the client probe cannot be: qexpl_select
        -- hides an ARCHIVED question's explanations from a student, so the
        -- clients deliberately stay silent there rather than mislabel.
        'explanation_locale',
          case when e.loc_ex is not null then v_loc
               when e.az_ex  is not null then 'az' end,
        'explanation_is_fallback',
          (v_loc <> 'az' and e.loc_ex is null and e.az_ex is not null),
        'options', (
          select coalesce(jsonb_agg(
            jsonb_build_object('option_id', ao.id,
                               'text', coalesce(aot.text, aot_az.text),
                               -- Migration 103: per-locale option image.
                               'image', case when aom.id is null then null
                                             else jsonb_build_object('bucket', aom.bucket,
                                                                     'path', aom.path) end,
                               'is_correct', ao.is_correct)
            order by ao.order_index), '[]'::jsonb)
          from public.answer_options ao
          left join public.answer_option_translations aot
            on aot.option_id = ao.id and aot.locale = v_loc::public.content_locale
          left join public.answer_option_translations aot_az
            on aot_az.option_id = ao.id and aot_az.locale = 'az'
          -- Migration 103: the option's image, resolved locale-then-az exactly
          -- like its text above.
          left join public.media_assets aom
            on aom.id = coalesce(aot.media_asset_id, aot_az.media_asset_id)
          where ao.question_id = taa.question_id
        )
      ) as q
    from public.test_attempt_answers taa
    left join public.question_translations qt
      on qt.question_id = taa.question_id and qt.locale = v_loc::public.content_locale
    left join public.question_translations qt_az
      on qt_az.question_id = taa.question_id and qt_az.locale = 'az'
    left join public.media_assets ma
      on ma.id = coalesce(qt.media_asset_id, qt_az.media_asset_id)
    left join public.question_explanations qe
      on qe.question_id = taa.question_id and qe.locale = v_loc::public.content_locale
    left join public.question_explanations qe_az
      on qe_az.question_id = taa.question_id and qe_az.locale = 'az'
    cross join lateral (
      select nullif(btrim(qe.explanation_body), '')    as loc_ex,
             nullif(btrim(qe_az.explanation_body), '') as az_ex
    ) e
    where taa.attempt_id = p_attempt_id
  ) s;

  return v_result;
end;
$$;

-- expire_stale_test_attempts (cron, 016): timed attempts (legacy tests,
-- olympiads, rated daily rounds) 5 min past deadline → 'expired'; deadline-less
-- attempts (practice, untimed topic tests, previous-day replays) stuck
-- in_progress >24h → 'abandoned'. (Migration 057.)
create or replace function public.expire_stale_test_attempts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tests int;
  v_other int;
begin
  -- Timed attempts (tests legacy, olympiads, rated daily rounds): hard-expire
  -- past the deadline (5-min grace).
  update public.test_attempts
     set status = 'expired', updated_at = now()
   where kind in ('test', 'olympiad', 'daily') and status = 'in_progress'
     and deadline_at is not null
     and deadline_at + interval '5 minutes' < now();
  get diagnostics v_tests = row_count;

  -- Deadline-less attempts (practice, untimed topic tests, previous-day
  -- replays, legacy olympiad rows): 24h abandon.
  update public.test_attempts
     set status = 'abandoned', updated_at = now()
   where kind in ('practice', 'olympiad', 'daily', 'test') and status = 'in_progress'
     and deadline_at is null
     and started_at < now() - interval '24 hours';
  get diagnostics v_other = row_count;

  return jsonb_build_object('tests_expired', v_tests, 'others_abandoned', v_other);
end;
$$;

-- Grants: learner-facing RPCs are authenticated (owner-checked in body);
-- the sweep + result helper are service-role only.
revoke all on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) to authenticated, service_role;
revoke all on function public.get_test_attempt(uuid, text) from public, anon;
grant execute on function public.get_test_attempt(uuid, text) to authenticated, service_role;
revoke all on function public.save_test_answers(uuid, jsonb) from public, anon;
grant execute on function public.save_test_answers(uuid, jsonb) to authenticated, service_role;
revoke all on function public.submit_test_attempt(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_test_attempt(uuid, jsonb, text) to authenticated, service_role;
revoke all on function public.cancel_test_attempt(uuid) from public, anon;
grant execute on function public.cancel_test_attempt(uuid) to authenticated, service_role;
revoke all on function public.get_test_review(uuid, text) from public, anon;
grant execute on function public.get_test_review(uuid, text) to authenticated, service_role;
revoke all on function public.test_attempt_result(uuid, text) from public, anon, authenticated;
grant execute on function public.test_attempt_result(uuid, text) to service_role;
revoke all on function public.expire_stale_test_attempts() from public, anon, authenticated;
grant execute on function public.expire_stale_test_attempts() to service_role;


-- -----------------------------------------------------------------------------
-- DAILY ROUNDS ENGINE (migrations 056/082/083). Round 38 model: a RATED daily
-- attempt is a PER-STUDENT subtopic-balanced random 25 (timed 25 min) drawn at
-- start; the day is consumed ONLY by SUBMIT (partial unique index on graded
-- attempts in 005) — a live attempt resumes, a lapsed one is replaced by a
-- FRESH set. Yesterday = unlimited UNTIMED practice on the student's LOCKED
-- set (daily_practice_sets: own -> peer -> legacy round -> generated), never
-- rated. daily_rounds is LEGACY storage (history + transition fallback).
-- -----------------------------------------------------------------------------

-- NOTE: this LANGUAGE SQL body reads questions.olympiad_package_id, a column
-- added by 015 (numeric run order) — skip body validation; the body is planned
-- at call time and 013 #67 covers it.
set check_function_bodies = off;
create or replace function public.draw_daily_questions(
  p_subject_id uuid, p_grade_id uuid, p_count int default 25
)
returns uuid[]
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  -- Cumulative-term pool: published, general bank, term reviewed and <= current,
  -- valid 5-option questions of this subject, for this grade OR shared
  -- (grade_id IS NULL). SUBTOPIC-BALANCED: rank randomly within each subtopic
  -- bucket, take bucket_rank round-robin, random inside a pass.
  select coalesce(array_agg(id), '{}') from (
    select p.id
    from (
      select q.id,
             row_number() over (
               partition by coalesce(q.subtopic_id, q.topic_id, q.id)
               order by random()) as bucket_rank,
             random() as tiebreak
      from public.questions q
      where q.subject_id = p_subject_id
        and (q.grade_id = p_grade_id or q.grade_id is null)
        and q.status = 'published'
        and q.olympiad_package_id is null
        and q.term is not null and q.term <= public.current_academic_term()
        and (select count(*) from public.answer_options ao where ao.question_id = q.id) = 5
        and exists (select 1 from public.answer_options ao
                     where ao.question_id = q.id and ao.is_correct)
    ) p
    order by p.bucket_rank, p.tiebreak
    limit greatest(1, least(coalesce(p_count, 25), 100))
  ) picked;
$$;
comment on function public.draw_daily_questions(uuid, uuid, int) is
  'Subtopic-balanced random draw from the cumulative-term published pool '
  '(Round 38 — per-student rated sets and generated practice fallbacks).';
reset check_function_bodies;
revoke all on function public.draw_daily_questions(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.draw_daily_questions(uuid, uuid, int) to service_role;

create or replace function public.start_daily_round_attempt(
  p_subject_id uuid,
  p_day        text default 'today'   -- 'today' (rated) | 'yesterday' (practice)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_count    constant int := 25;
  v_student  uuid := public.current_profile_id();
  v_grade    uuid;
  v_date     date;
  -- MIGRATION 140: v_rated used to carry TWO meanings at once -- "is this
  -- today's round" AND "does it score" -- which is why a today/unrated round
  -- was inexpressible before the Free Trial needed one.  They are separate now.
  v_today    boolean := (coalesce(p_day, 'today') = 'today');
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
  v_trial    boolean := false;
  v_qids     uuid[];
  v_set      public.daily_practice_sets;
  v_existing record;
  v_attempt  uuid;
  v_source   text;
begin
  if v_student is null then raise exception 'daily: not authenticated'; end if;
  if coalesce(p_day, 'today') not in ('today', 'yesterday') then
    raise exception 'daily: bad day' using errcode = 'check_violation';
  end if;

  select grade_id into v_grade from public.students where profile_id = v_student;
  if not found then raise exception 'daily: not a student'; end if;
  if v_grade is null then
    raise exception 'daily: student has no grade' using errcode = 'check_violation';
  end if;

  -- THE access gate (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1).
  -- Every rule that used to be hand-copied into this function — the giveaway
  -- window, the admin free-access interval, the per-subject subscription join
  -- and its lazy date arithmetic — now lives in ONE reader,
  -- has_subject_access(), which consults public.entitlements first and the two
  -- computed override windows second. Three copies of one predicate drift
  -- within a release; one cannot. The gate still runs BEFORE any row is
  -- created, so a refusal still consumes nothing.
  if not public.has_subject_access(v_student, p_subject_id) then
    raise exception 'daily: no active access' using errcode = 'check_violation';
  end if;

  -- MIGRATION 140 -- DOES TODAY'S ROUND SCORE?
  --
  -- A child whose only access to this subject is the 1-day Free Trial plays
  -- TODAY's fresh set, unlimited, but it must not touch points, percentage,
  -- streak or any leaderboard.  is_rated=false delivers all of that by
  -- construction: uq_rated_daily_live_per_day carries `and is_rated` in its
  -- predicate, so an unrated row is outside the index entirely, and
  -- award_attempt_points returns before writing anything when the attempt is
  -- unrated.  The Round-42/43 rule is untouched -- NOTHING here weakens it.
  --
  -- subject_access_is_trial_only fails toward RATED in every branch: paid
  -- access wins, a giveaway wins, an admin free-access window wins.  A bug that
  -- makes a trial child score is visible on a board; the inverse would silently
  -- void a paying child's only round of the day.
  if v_today then
    v_trial := public.subject_access_is_trial_only(v_student, p_subject_id);
    v_rated := not v_trial;
  end if;

  v_date := (now() at time zone 'Asia/Baku')::date - (case when v_today then 0 else 1 end);

  if v_rated then
    -- Round 43: the day is consumed AT CREATION. Look at today's live/graded
    -- rated attempt: resume an in-progress one; block when it is completed;
    -- otherwise (no attempt yet) draw a fresh set and create it.
    select id, status, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and is_rated and round_date = v_date
      and status in ('in_progress', 'submitted', 'graded')
    order by started_at desc limit 1;
    if v_existing.id is not null then
      if v_existing.status = 'in_progress' then
        -- Untimed: reopen the same attempt (refresh / other tab / resume).
        return jsonb_build_object(
          'attempt_id', v_existing.id, 'resumed', true, 'rated', true,
          'deadline_at', null, 'duration_seconds', null,
          'count', cardinality(v_existing.question_ids));
      end if;
      raise exception 'daily: already attempted today' using errcode = 'unique_violation';
    end if;

    -- Fresh per-student subtopic-balanced draw. A short pool raises HERE, so
    -- the day is never consumed on a failed draw.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
  elsif v_trial then
    -- MIGRATION 140 -- TODAY, UNRATED (Free Trial).
    --
    -- Deliberately NOT the yesterday branch: that one serves the LOCKED
    -- daily_practice_sets row, which replays the identical 25 questions every
    -- time.  A trial is meant to show what the product is like, so each entry
    -- draws a fresh subtopic-balanced set from today's pool.
    --
    -- An in-progress row is resumed (refresh, second tab) but a COMPLETED one
    -- never blocks -- that is what "unlimited during the trial" means, and it
    -- costs nothing because none of these rows score.
    select id, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and not is_rated and round_date = v_date
      and status = 'in_progress'
    order by started_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;

    -- A short pool raises HERE, before any row exists, exactly as the rated
    -- branch does.
    v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
    if coalesce(cardinality(v_qids), 0) < c_count then
      raise exception 'daily round: not enough eligible questions (subject %, grade %: have %, need %)',
        p_subject_id, v_grade, coalesce(cardinality(v_qids), 0), c_count
        using errcode = 'no_data_found';
    end if;
  else
    -- YESTERDAY: get-or-create the LOCKED practice set for this student.
    select * into v_set from public.daily_practice_sets
     where student_profile_id = v_student and subject_id = p_subject_id
       and for_date = v_date;
    if not found then
      select ta.question_ids, 'own' into v_qids, v_source
      from public.test_attempts ta
      where ta.student_profile_id = v_student and ta.subject_id = p_subject_id
        and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
        and ta.round_date = v_date
      order by ta.graded_at desc limit 1;
      if v_qids is null then
        -- A peer's graded set (same subject + GRADE + date, COUNTRY-WIDE;
        -- earliest submit — deterministic; question ids only, no identity).
        select ta.question_ids, 'peer' into v_qids, v_source
        from public.test_attempts ta
        join public.students st on st.profile_id = ta.student_profile_id
        where ta.subject_id = p_subject_id and st.grade_id = v_grade
          and ta.kind = 'daily' and ta.is_rated and ta.status = 'graded'
          and ta.round_date = v_date
          and coalesce(cardinality(ta.question_ids), 0) > 0
        order by ta.submitted_at asc nulls last, ta.id asc limit 1;
      end if;
      if v_qids is null then
        select dr.question_ids, 'round' into v_qids, v_source
        from public.daily_rounds dr
        where dr.round_date = v_date and dr.subject_id = p_subject_id
          and dr.grade_id = v_grade;
      end if;
      if v_qids is null then
        v_qids := public.draw_daily_questions(p_subject_id, v_grade, c_count);
        v_source := 'generated';
        if coalesce(cardinality(v_qids), 0) < c_count then
          raise exception 'daily: no round was held yesterday' using errcode = 'no_data_found';
        end if;
      end if;
      insert into public.daily_practice_sets
        (student_profile_id, subject_id, for_date, question_ids, source)
      values (v_student, p_subject_id, v_date, v_qids, v_source)
      on conflict (student_profile_id, subject_id, for_date) do nothing;
      select * into v_set from public.daily_practice_sets
       where student_profile_id = v_student and subject_id = p_subject_id
         and for_date = v_date;
    end if;
    v_qids := v_set.question_ids;

    select id, question_ids into v_existing
    from public.test_attempts
    where student_profile_id = v_student and subject_id = p_subject_id
      and kind = 'daily' and not is_rated and status = 'in_progress'
      and round_date = v_date
    order by started_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'resumed', true, 'rated', false,
        'deadline_at', null, 'duration_seconds', null,
        'count', cardinality(v_existing.question_ids));
    end if;
  end if;

  insert into public.test_attempts
    (student_profile_id, subject_id, kind, status, question_ids,
     deadline_at, duration_seconds, is_rated, round_date, is_free_trial)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_qids,
     null, null, v_rated, v_date, v_trial)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', v_rated,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
exception when unique_violation then
  -- A creation race (double tap / two tabs) collapses onto the winning row.
  raise exception 'daily: already attempted today' using errcode = 'unique_violation';
end;
$$;
comment on function public.start_daily_round_attempt(uuid, text) is
  'Round 43: today = RATED per-student subtopic-balanced random 25, UNTIMED, '
  'consumed AT CREATION (uq_rated_daily_live_per_day: one live/graded attempt per '
  'subject+day — resume in-progress, block when completed); a <25 pool raises '
  'before any row is created. yesterday = unlimited UNTIMED practice on the '
  'student''s LOCKED set (own -> peer country-wide by grade -> legacy round -> '
  'generated), never rated. MIGRATION 140: a child whose only access is the '
  '1-day Free Trial plays TODAY unlimited and UNRATED -- a fresh draw each '
  'entry, is_free_trial stamped, outside uq_rated_daily_live_per_day and '
  'invisible to award_attempt_points. The rated rule itself is unchanged.';

revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- LEADERBOARD ENGINE (backported from migrations/2026_07_06_039_leaderboard_engine.sql)
-- Column protection + single writer (trigger on graded) + board reads + rollover/reset.
-- -----------------------------------------------------------------------------
-- Column protection: students_write is a ROW policy (child/parent can update
-- their own row), so the cached score/streak columns need their own guard.
create or replace function public.protect_student_progress_cols()
returns trigger
language plpgsql
as $$
begin
  -- The guard applies to CLIENT TOKENS only. Every legitimate writer of these
  -- columns uses the service-role client and is unaffected.
  if current_user in ('anon', 'authenticated') then
    -- 1. Cached leaderboard/progress columns (original scope, unchanged).
    if (   new.points_all_time  is distinct from old.points_all_time
        or new.points_month     is distinct from old.points_month
        or new.points_month_key is distinct from old.points_month_key
        or new.last_points_at   is distinct from old.last_points_at
        or new.current_streak   is distinct from old.current_streak
        or new.best_streak      is distinct from old.best_streak
        or new.last_active_date is distinct from old.last_active_date
        or new.streak_tz        is distinct from old.streak_tz
        or new.pct_num_month    is distinct from old.pct_num_month
        or new.pct_den_month    is distinct from old.pct_den_month
        or new.pct_num_all      is distinct from old.pct_num_all
        or new.pct_den_all      is distinct from old.pct_den_all
        or new.lb_correct_month is distinct from old.lb_correct_month
        or new.lb_correct_all   is distinct from old.lb_correct_all
        or new.lb_presented_month is distinct from old.lb_presented_month
        or new.lb_presented_all   is distinct from old.lb_presented_all
        or new.lb_attempts_month  is distinct from old.lb_attempts_month
        or new.lb_attempts_all    is distinct from old.lb_attempts_all
    ) then
      raise exception 'students: leaderboard columns are server-managed'
        using errcode = 'check_violation';
    end if;

    -- 2. MIGRATION 131 — ACCESS AND IDENTITY. The paywall, the server-issued
    --    login id, and the ownership/context that decides what a child may see
    --    and whom they compete against.
    if (   new.access_status is distinct from old.access_status
        or new.child_unique_id is distinct from old.child_unique_id
        or new.created_by_parent_profile_id is distinct from old.created_by_parent_profile_id
        or new.graduated is distinct from old.graduated
    ) then
      raise exception 'students: access and identity columns are server-managed'
        using errcode = 'check_violation', hint = 'server_owned_column';
    end if;

    -- 3. MIGRATION 131 — ACADEMIC CONTEXT. A parent changes a child's grade or
    --    school through the Edit-Child action, which runs service-role; nothing
    --    legitimate writes these with a client token.
    if (   new.grade_id is distinct from old.grade_id
        or new.school_id is distinct from old.school_id
        or new.district_id is distinct from old.district_id
        or new.city_district_id is distinct from old.city_district_id
        or new.class_grade is distinct from old.class_grade
        or new.school_name is distinct from old.school_name
        or new.city is distinct from old.city
        or new.birth_year_optional is distinct from old.birth_year_optional
    ) then
      raise exception 'students: academic context is server-managed'
        using errcode = 'check_violation', hint = 'server_owned_column';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_student_progress on public.students;
create trigger trg_protect_student_progress
  before update on public.students
  for each row execute function public.protect_student_progress_cols();

--

create or replace function public.award_attempt_points(p_attempt_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $$
declare
  v_student   uuid;
  v_subject   uuid;
  v_kind      text;
  v_status    public.attempt_status;
  v_rated     boolean;
  v_tz        text;
  v_today     date;
  v_mkey      text;
  v_per       numeric := 10;
  v_kw        numeric := 1.0;
  v_correct   int := 0;
  v_answered  int := 0;
  v_presented int := 0;
  v_raw       numeric := 0;
  v_wnum0     numeric := 0;   -- difficulty-weighted, before kind weight
  v_wden0     numeric := 0;
  v_wnum      numeric := 0;
  v_wden      numeric := 0;
  v_valid     boolean := false;
  v_snapshot  jsonb;
  v_awarded   numeric := 0;
  v_rows      int;
  v_last      date;
  v_new_day   boolean := false;
begin
  select student_profile_id, subject_id, kind::text, status, is_rated
    into v_student, v_subject, v_kind, v_status, v_rated
  from public.test_attempts where id = p_attempt_id;
  if v_student is null or v_status <> 'graded' then
    return;
  end if;
  -- Migration 057: ONLY rated attempts score. Practice (topic tests,
  -- previous-day replays) never touches points/streak.
  if not coalesce(v_rated, false) then
    return;
  end if;

  -- Round 48 (owner): PURCHASED OLYMPIADS ARE PRACTICE-ONLY. An olympiad
  -- attempt is still stored, graded and reviewable for history, but it awards
  -- NO points, contributes NO percentage/ranking weight, updates NO cached
  -- leaderboard counter, records NO activity day and can never extend a
  -- streak. Returning HERE -- before the ledger insert -- is what guarantees
  -- all of that, because every one of those writes is downstream of it.
  -- Olympiads also never consume the daily rated-round slot: that is keyed on
  -- kind = 'daily', which this path never reaches.
  if v_kind = 'olympiad' then
    return;
  end if;

  select coalesce(streak_tz, 'Asia/Baku'), last_active_date
    into v_tz, v_last
  from public.students where profile_id = v_student;
  if v_tz is null then return; end if;   -- not a child row
  v_today := (now() at time zone v_tz)::date;
  v_mkey  := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');  -- board-level month key

  v_per  := coalesce((select nullif(value_json #>> '{}', '')::numeric
                        from public.system_settings where key = 'leaderboard.points.per_correct'), 10);
  -- Round 48: the olympiad multiplier is gone. Olympiads return above, so the
  -- kind weight is always 1.0 and the setting it used to read is deleted in
  -- PART B (dead config an admin could otherwise set to no effect).
  v_kw   := 1.0;

  -- ONE scan over the stored answer rows (the engine pre-creates one row per
  -- PRESENTED question; unanswered rows were graded is_correct=false):
  --   legacy points input (v_correct/v_raw - unchanged math) AND the
  --   percentage snapshot (counts + difficulty-weighted num/den).
  select count(*) filter (where a.is_correct),
         count(*) filter (where coalesce(array_length(a.selected_option_ids, 1), 0) > 0
                            or nullif(btrim(coalesce(a.answer_text, '')), '') is not null),
         count(*),
         coalesce(sum(v_per * coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0),
         coalesce(sum(coalesce(dl.weight, 1.0)) filter (where a.is_correct), 0),
         coalesce(sum(coalesce(dl.weight, 1.0)), 0)
    into v_correct, v_answered, v_presented, v_raw, v_wnum0, v_wden0
  from public.test_attempt_answers a
  join public.questions q on q.id = a.question_id
  left join public.difficulty_levels dl on dl.id = q.difficulty_id
  where a.attempt_id = p_attempt_id;

  -- Percentage snapshot: kind weight in BOTH numerator and denominator so the
  -- ratio can never exceed 1 (spec 17.4). With olympiads gone the weight is a
  -- constant 1.0, but the shape is kept so a future weighted kind slots in.
  v_wnum  := round(v_wnum0 * v_kw, 4);
  v_wden  := round(v_wden0 * v_kw, 4);
  v_valid := v_wden > 0;
  v_snapshot := jsonb_build_object(
    'kind', v_kind,
    'kind_weight', v_kw,
    'points_per_correct', v_per,
    'difficulty_weights',
      coalesce((select jsonb_object_agg(dl.code, dl.weight) from public.difficulty_levels dl),
               '{}'::jsonb));

  -- LEGACY points (unchanged since 057): kept for rewards/reports/history.
  v_awarded := round(v_raw, 2);

  -- Append-only, once per attempt (replay/regrade-safe).
  insert into public.student_points_ledger
    (student_profile_id, attempt_id, subject_id, kind, points, breakdown_json,
     correct_count, answered_count, presented_count,
     weighted_num, weighted_den, weights_snapshot, pct_valid)
  values
    (v_student, p_attempt_id, v_subject, v_kind, v_awarded,
     jsonb_build_object('correct', v_correct, 'raw', round(v_raw, 2),
                        'cap_applied', false),
     v_correct, v_answered, v_presented,
     v_wnum, v_wden, v_snapshot, v_valid)
  on conflict (attempt_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;     -- already scored

  -- Streak: single writer, LOCAL-date row + cached counters.
  insert into public.student_activity_days (student_profile_id, activity_date)
  values (v_student, v_today)
  on conflict (student_profile_id, activity_date)
    do update set attempts = public.student_activity_days.attempts + 1;
  v_new_day := (v_last is distinct from v_today);

  -- Cached counters: legacy points AND percentage aggregates roll over on the
  -- SAME points_month_key (every month-cache column below uses the identical
  -- key predicate, evaluated against the pre-update row).
  update public.students
     set points_all_time = points_all_time + v_awarded,
         points_month    = case when points_month_key is distinct from v_mkey
                                then v_awarded else points_month + v_awarded end,
         pct_num_month   = case when points_month_key is distinct from v_mkey
                                then v_wnum else pct_num_month + v_wnum end,
         pct_den_month   = case when points_month_key is distinct from v_mkey
                                then v_wden else pct_den_month + v_wden end,
         lb_correct_month   = case when points_month_key is distinct from v_mkey
                                   then v_correct else lb_correct_month + v_correct end,
         lb_presented_month = case when points_month_key is distinct from v_mkey
                                   then v_presented else lb_presented_month + v_presented end,
         lb_attempts_month  = case when points_month_key is distinct from v_mkey
                                   then (v_valid)::int else lb_attempts_month + (v_valid)::int end,
         pct_num_all      = pct_num_all + v_wnum,
         pct_den_all      = pct_den_all + v_wden,
         lb_correct_all   = lb_correct_all + v_correct,
         lb_presented_all = lb_presented_all + v_presented,
         lb_attempts_all  = lb_attempts_all + (v_valid)::int,
         points_month_key = v_mkey,
         last_points_at  = now(),
         current_streak  = case
           when not v_new_day then current_streak
           when v_last = v_today - 1 then current_streak + 1
           else 1 end,
         best_streak     = greatest(best_streak, case
           when not v_new_day then current_streak
           when v_last = v_today - 1 then current_streak + 1
           else 1 end),
         last_active_date = v_today,
         updated_at      = now()
   where profile_id = v_student;
end;
$$;
comment on function public.award_attempt_points(uuid) is
  'SINGLE leaderboard writer (rated attempts ONLY since migration 057): ledger row '
  '(once per graded attempt) with the Round-36 percentage snapshot (counts + weighted '
  'num/den + coefficient snapshot), legacy points (unchanged math), cached point AND '
  'percentage aggregates (lazy month rollover) and streak. Fired by '
  'trg_award_points_on_graded; never callable by clients.';
revoke all on function public.award_attempt_points(uuid) from public, anon, authenticated;
grant execute on function public.award_attempt_points(uuid) to service_role;

create or replace function public.award_attempt_points_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.award_attempt_points(new.id);
  exception when others then
    -- Points must never break grading; the ledger stays consistent (no row =
    -- not scored) and the attempt can be re-awarded by support if ever needed.
    raise warning 'award_attempt_points failed for attempt %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_award_points_on_graded on public.test_attempts;
create trigger trg_award_points_on_graded
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.award_attempt_points_tg();

-- Attempt-graded notification producer (migration 068). Lives in the DB so
-- EVERY grading path notifies exactly once (web action, mobile direct RPC,
-- result-page idempotent submit, legacy grade_practice_attempt) — the web-app
-- emitter is retired. Mirrors the retired web emitter EXACTLY: recipient =
-- the attempt's student, type 'attempt_graded', fixed az title/body with
-- structured {attempt_id, score, max} in data_json (trim_scale renders
-- numeric(8,2) like a JS Number), priority 5, in_app channel, category
-- 'progress', action_url '/child/test/result/<id>' and the IDENTICAL
-- idempotency key 'attempt:<attemptId>' so a duplicate producer can never
-- double-insert. Failure-safe like the award trigger: a notification failure
-- must never abort grading.
create or replace function public.notify_attempt_graded_tg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Web-emitter parity: it only fired when submit returned finite score/max
  -- (grading always sets both in the same UPDATE that flips status; belt and
  -- braces for any exotic path that grades without a score).
  if new.score is null or new.max_score is null then
    return new;
  end if;
  begin
    perform public.create_notification(
      new.student_profile_id,
      'attempt_graded',
      'Nəticə hazırdır',
      'Sınağın qiymətləndirildi: ' || trim_scale(new.score)::text
        || '/' || trim_scale(new.max_score)::text || '.',
      jsonb_build_object(
        'attempt_id', new.id,
        'score', trim_scale(new.score),
        'max', trim_scale(new.max_score)),
      '{in_app}',
      'attempt:' || new.id::text,     -- EXACT web key format: attempt:<attemptId>
      5,
      '/child/test/result/' || new.id::text,
      'progress',
      null);
  exception when others then
    -- The inbox write must never break grading (mirrors award_attempt_points_tg).
    raise warning 'notify_attempt_graded failed for attempt %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
comment on function public.notify_attempt_graded_tg() is
  'DB producer of the attempt_graded notification (migration 068): fires on the '
  '-> graded transition for EVERY grading path (web action, mobile RPC, legacy '
  'practice). Same idempotency key (attempt:<id>) the retired web emitter used, '
  'so a duplicate producer can never double-insert. Failure-safe: warnings only.';

drop trigger if exists trg_notify_attempt_graded on public.test_attempts;
create trigger trg_notify_attempt_graded
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.notify_attempt_graded_tg();

--

-- Internal: full ranked set for one board/scope/period. service-internal only.
-- Migration 048: board rows carry the student's city/school/grade context and
-- get_leaderboard ALWAYS returns the "First L." display name (server-formatted;
-- the full last name and every internal id stay in the DB). Migration 058:
-- rows also carry the DISTRICT + a 'district' scope filter. Migration 064
-- (Round 21): district = the school's rayon with the rayon STORED on the
-- student as fallback (coalesce; the students trigger keeps the two in
-- agreement). Return types changed -> drop both before recreating.
drop function if exists public.get_leaderboard(text, text, uuid, text, int);
drop function if exists public.lb_rows(text, text, uuid, text);

create function public.lb_rows(
  p_board    text,          -- 'percent' | 'streak' ('points' = deprecated alias of 'percent')
  p_scope    text,          -- 'global' | 'subject' | 'grade' | 'city' | 'district' | 'school'
  p_scope_id uuid,
  p_period   text           -- 'month' | 'all_time' (percent only)
)
returns table (profile_id uuid, value numeric, best_streak int, last_points_at timestamptz,
               first_name text, last_name text,
               city_name text, district_name text, school_name text, grade_level int,
               is_provisional boolean, questions int, correct int, attempts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_board text := case when p_board = 'points' then 'percent' else p_board end;
  v_mkey  text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  -- Round 43: eligibility is rounds-only — a single completed-attempts minimum.
  v_mina  int  := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_board not in ('percent', 'streak')
     or p_scope not in ('global', 'subject', 'grade', 'city', 'district', 'school')
     or p_period not in ('month', 'all_time')
     or (p_scope <> 'global' and p_scope_id is null) then
    raise exception 'leaderboard: bad arguments' using errcode = 'check_violation';
  end if;
  if v_board = 'streak' and p_scope <> 'global' then
    raise exception 'leaderboard: streak board is global-only' using errcode = 'check_violation';
  end if;

  if v_board = 'streak' then
    return query
      select st.profile_id,
             case when st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1
                  then st.current_streak else 0 end::numeric,
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int,
             false, 0, 0, 0
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where st.current_streak > 0
        and st.last_active_date >= (now() at time zone coalesce(st.streak_tz,'Asia/Baku'))::date - 1;
  elsif p_scope = 'subject' then
    return query
      select l.student_profile_id, round(100 * l.num / l.den, 4),
             st.best_streak, st.last_points_at,
             st.first_name, st.last_name, d.name, cd.name, sc.name, g.level::int,
             (l.att < v_mina), l.pres::int, l.corr::int, l.att::int
      from (
        select sl.student_profile_id,
               sum(sl.weighted_num)    as num,
               sum(sl.weighted_den)    as den,
               sum(sl.presented_count) as pres,
               sum(sl.correct_count)   as corr,
               count(*)                as att
        from public.student_points_ledger sl
        where sl.subject_id = p_scope_id
          and sl.pct_valid
          and (p_period = 'all_time'
               or to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_mkey)
        group by sl.student_profile_id
        having sum(sl.weighted_den) > 0
      ) l
      join public.students st on st.profile_id = l.student_profile_id
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id;
  else
    return query
      select st.profile_id,
             round(100 * (case when p_period = 'all_time' then st.pct_num_all
                               when st.points_month_key = v_mkey then st.pct_num_month
                               else 0 end)
                       / (case when p_period = 'all_time' then st.pct_den_all
                               when st.points_month_key = v_mkey then st.pct_den_month
                               else 1 end), 4),
             st.best_streak, st.last_points_at, st.first_name, st.last_name,
             d.name, cd.name, sc.name, g.level::int,
             ((case when p_period = 'all_time' then st.lb_attempts_all
                    when st.points_month_key = v_mkey then st.lb_attempts_month
                    else 0 end) < v_mina),
             (case when p_period = 'all_time' then st.lb_presented_all
                   when st.points_month_key = v_mkey then st.lb_presented_month
                   else 0 end)::int,
             (case when p_period = 'all_time' then st.lb_correct_all
                   when st.points_month_key = v_mkey then st.lb_correct_month
                   else 0 end)::int,
             (case when p_period = 'all_time' then st.lb_attempts_all
                   when st.points_month_key = v_mkey then st.lb_attempts_month
                   else 0 end)::int
      from public.students st
      left join public.districts d on d.id = st.district_id
      left join public.schools  sc on sc.id = st.school_id
      left join public.city_districts cd on cd.id = coalesce(sc.city_district_id, st.city_district_id)
      left join public.grades    g on g.id = st.grade_id
      where (p_scope = 'global'
             or (p_scope = 'grade'    and st.grade_id    = p_scope_id)
             or (p_scope = 'city'     and st.district_id = p_scope_id)
             or (p_scope = 'district' and coalesce(sc.city_district_id, st.city_district_id) = p_scope_id)
             or (p_scope = 'school'   and st.school_id   = p_scope_id))
        and (case when p_period = 'all_time' then st.pct_den_all
                  when st.points_month_key = v_mkey then st.pct_den_month
                  else 0 end) > 0;
  end if;
end;
$$;
comment on function public.lb_rows(text, text, uuid, text) is
  'Internal percentage-board row source. value = 100 x weighted correct / weighted '
  'presented over the period. Round 43: is_provisional = attempts < min_attempts '
  '(rounds-only eligibility; questions are a secondary stat only). service-internal.';
revoke all on function public.lb_rows(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.lb_rows(text, text, uuid, text) to service_role;

-- get_leaderboard reads is_provisional from lb_rows and must be recreated here
-- because lb_rows was dropped/recreated above.
create or replace function public.get_leaderboard(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month',
  p_limit    int  default 100
)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric, is_self boolean,
               is_provisional boolean, questions int, correct int, attempts int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  -- MIGRATION 133 -- the `leaderboard` toggle gates the DATA, not just the menu.
  -- It was presentation-only: the UI hid while these readers kept serving, and
  -- get_public_leaderboard serves `anon`. An administrator switching a
  -- leaderboard off is usually acting on a fairness or privacy concern.
  -- Returns NO ROWS rather than raising: every caller already renders an empty
  -- board, and an exception would surface as a broken page.
  if coalesce((select enabled from public.feature_flags where key = 'leaderboard'), true) = false then
    return;
  end if;

  if v_me is null then
    raise exception 'leaderboard: not authenticated';
  end if;
  return query
    with base as (
      select * from public.lb_rows(p_board, p_scope, p_scope_id, p_period)
    ),
    ordered as (
      -- MIGRATION 156 -- ONE ordering for ranked and provisional rows alike.
      -- This used to be two separately-ordered blocks concatenated, where the
      -- provisional block's sort position was (count of ranked rows) +
      -- row_number() -- an offset, not a value -- which pinned every provisional
      -- row below every ranked one and printed higher percentages under lower
      -- ones. Ordering and ranking are separate questions; only the RANK is
      -- withheld below min_attempts.
      select b.*,
             -- Rank number over the non-provisional population only. Partitioning
             -- on is_provisional makes the `false` partition byte-for-byte the old
             -- `rank() over (order by value desc)` applied to `where not
             -- is_provisional` (ties share a rank); the `true` partition's number
             -- is computed and discarded. lb_rows never returns a null here
             -- (students.lb_attempts_* are `not null default 0`), so there is no
             -- third partition to reason about.
             case when b.is_provisional then null
                  else rank() over (partition by b.is_provisional
                                    order by b.value desc)::int end as rnk,
             row_number() over (order by b.value desc, b.best_streak desc,
                                b.last_points_at asc nulls last, b.profile_id) as ord
      from base b
    )
    select u.rnk,
           trim(coalesce(u.first_name, '') || ' ' ||
                coalesce(left(nullif(trim(u.last_name), ''), 1) || '.', '')),
           u.city_name, u.district_name, u.school_name, u.grade_level,
           u.value, u.profile_id = v_me,
           u.is_provisional, u.questions, u.correct, u.attempts
    from ordered u
    where u.ord <= v_limit
    order by u.ord;
end;
$$;

comment on function public.get_leaderboard(text, text, uuid, text, int) is
  'Live percentage board: ONE order by value (tie-breaks best_streak desc, '
  'last_points_at asc nulls last, profile_id) over ranked and provisional rows '
  'alike, so percentages descend monotonically. Competition rank (ties share) is '
  'computed on the unrounded value over NON-PROVISIONAL rows only; a provisional '
  'row (fewer than min_attempts rounds) keeps its place by value and returns rank '
  'NULL. Numeric ranks only; no ids leave the server.';

revoke all on function public.get_leaderboard(text, text, uuid, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, uuid, text, int) to authenticated, service_role;

-- "Your rank" card: caller-scoped (no student parameter — never IDOR-able).
create or replace function public.get_my_leaderboard_rank(
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := public.current_profile_id();
  v_out  jsonb;
  v_mina int  := coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'leaderboard: not authenticated'; end if;
  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = v_me;
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_attempts', v_mina));
end;
$$;
revoke all on function public.get_my_leaderboard_rank(text, text, uuid, text) from public, anon;
grant execute on function public.get_my_leaderboard_rank(text, text, uuid, text) to authenticated, service_role;

-- Parent panel: per-child position under the active filters (migration 058).
create or replace function public.get_child_leaderboard_position(
  p_student  uuid,
  p_board    text,
  p_scope    text default 'global',
  p_scope_id uuid default null,
  p_period   text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out  jsonb;
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student)
    or public.current_profile_id() = p_student
  , false) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
           'rank',  case when r.is_provisional then null else r.rnk end,
           'total', r.total, 'value', r.value,
           'is_provisional', r.is_provisional,
           'questions', r.questions, 'attempts', r.attempts,
           'min_attempts', v_mina)
    into v_out
  from (
    select t.profile_id, t.value, t.is_provisional, t.questions, t.attempts,
           rank() over (order by (case when t.is_provisional then null else t.value end) desc nulls last)::int as rnk,
           count(*) filter (where not t.is_provisional) over () as total
    from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
  ) r
  where r.profile_id = p_student;
  return coalesce(v_out, jsonb_build_object(
    'rank', null,
    'total', (select count(*) from public.lb_rows(p_board, p_scope, p_scope_id, p_period) t
              where not t.is_provisional),
    'value', 0, 'is_provisional', true, 'questions', 0, 'attempts', 0,
    'min_attempts', v_mina));
end;
$$;
comment on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) is
  'Parent-panel per-child board position: rank/total/value + provisional (fewer than '
  'min_attempts rounds). Parent-link/admin/self enforced in-body.';
revoke all on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.get_child_leaderboard_position(uuid, text, text, uuid, text) to authenticated, service_role;

-- Landing page: anon public top-10, anonymized (migration 058).
create or replace function public.get_public_leaderboard(p_limit int default 10)
returns table (rank int, display_name text, city text, district text, school text,
               grade_level int, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  -- MIGRATION 133 -- the `leaderboard` toggle gates the DATA, not just the menu.
  -- It was presentation-only: the UI hid while these readers kept serving, and
  -- get_public_leaderboard serves `anon`. An administrator switching a
  -- leaderboard off is usually acting on a fairness or privacy concern.
  -- Returns NO ROWS rather than raising: every caller already renders an empty
  -- board, and an exception would surface as a broken page.
  if coalesce((select enabled from public.feature_flags where key = 'leaderboard'), true) = false then
    return;
  end if;

  -- Overall board = global all-time percentage; provisional (low-sample)
  -- results never appear on the public site. Names are anonymized server-side:
  -- 'Şagird XXXX' (last 4 digits of the 8-digit child id, leading zeros kept).
  return query
    select r.rnk, 'Şagird ' || coalesce(right(st.child_unique_id::text, 4), '····'),
           r.city_name, r.district_name, r.school_name, r.grade_level, r.value
    from (
      select t.*,
             rank() over (order by t.value desc)::int as rnk,
             row_number() over (order by t.value desc, t.best_streak desc,
                                t.last_points_at asc nulls last, t.profile_id) as ord
      from public.lb_rows('percent', 'global', null, 'all_time') t
      where not t.is_provisional
    ) r
    join public.students st on st.profile_id = r.profile_id
    where r.ord <= v_limit
    order by r.ord;
end;
$$;

comment on function public.get_public_leaderboard(int) is
  'PUBLIC landing-page board (Round 36): top-10 global all-time PERCENTAGE, ranked '
  '(non-provisional) students only, competition ranks, anonymized "Şagird XXXX" names. '
  'Anon-callable by design; hard-capped at 10 rows.';
revoke all on function public.get_public_leaderboard(int) from public;
grant execute on function public.get_public_leaderboard(int) to anon, authenticated, service_role;

-- Streak status (self): live state + lazy zeroing of a lost streak.
create or replace function public.get_streak_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_tz    text;
  v_cur   int;
  v_best  int;
  v_last  date;
  v_today date;
  v_state text;
  v_hours numeric;
begin
  if v_me is null then raise exception 'streak: not authenticated'; end if;
  select coalesce(streak_tz, 'Asia/Baku'), current_streak, best_streak, last_active_date
    into v_tz, v_cur, v_best, v_last
  from public.students where profile_id = v_me;
  if v_tz is null then raise exception 'streak: not a student'; end if;
  v_today := (now() at time zone v_tz)::date;

  if v_last = v_today then
    v_state := 'active'; v_hours := null;
  elsif v_last = v_today - 1 then
    v_state := 'at_risk';
    v_hours := round(extract(epoch from
      ((v_today + 1)::timestamp at time zone v_tz - now())) / 3600.0, 1);
  else
    v_state := 'lost'; v_hours := 0;
    if v_cur > 0 then
      update public.students set current_streak = 0, updated_at = now()
       where profile_id = v_me;
      v_cur := 0;
    end if;
  end if;
  return jsonb_build_object('current', v_cur, 'best', v_best,
                            'state', v_state, 'hours_until_loss', v_hours);
end;
$$;
revoke all on function public.get_streak_status() from public, anon;
grant execute on function public.get_streak_status() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Season rollover + admin reset
-- -----------------------------------------------------------------------------
-- Archives a CLOSED month (top 100 global, computed FROM THE LEDGER — immune to
-- lazy cache rollover) into leaderboard_periods + leaderboard_snapshots, then
-- zeroes stale points_month caches. No-ops when the month has no ledger rows.
create or replace function public.leaderboard_month_rollover(p_month_key text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key    text := coalesce(p_month_key,
              to_char((now() at time zone 'Asia/Baku') - interval '1 month', 'YYYY-MM'));
  v_now_key text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_start  date := to_date(v_key || '-01', 'YYYY-MM-DD');
  v_period uuid;
  v_rows   jsonb;
  v_mina   int := coalesce((select nullif(value_json #>> '{}', '')::int
                            from public.system_settings
                            where key = 'leaderboard.rank.min_attempts'), 2);
begin
  select jsonb_agg(jsonb_build_object(
           'rank', rnk, 'student_profile_id', student_profile_id,
           'pct', pct, 'questions', pres, 'correct', corr, 'points', pts,
           'metric', 'percent') order by ord)
    into v_rows
  from (
    select t.*,
           rank() over (order by t.pct desc)::int as rnk,
           row_number() over (order by t.pct desc, t.student_profile_id) as ord
    from (
      select sl.student_profile_id,
             round(100 * sum(sl.weighted_num) / sum(sl.weighted_den), 4) as pct,
             sum(sl.presented_count) as pres,
             sum(sl.correct_count)   as corr,
             sum(sl.points)          as pts,
             count(*)                as att
      from public.student_points_ledger sl
      where to_char(sl.created_at at time zone 'Asia/Baku', 'YYYY-MM') = v_key
        and sl.pct_valid
      group by sl.student_profile_id
      having sum(sl.weighted_den) > 0
    ) t
    where t.att >= v_mina
    order by ord
    limit 100
  ) ranked;

  if v_rows is not null then
    insert into public.leaderboard_periods (period_type, starts_at, ends_at)
    values ('monthly',
            (v_start::timestamp at time zone 'Asia/Baku'),
            ((v_start + interval '1 month')::timestamp at time zone 'Asia/Baku'))
    on conflict (period_type, starts_at, ends_at)
      do update set updated_at = now()
    returning id into v_period;
    insert into public.leaderboard_snapshots (period_id, scope_type, generated_at, metadata, entries_json)
    values (v_period, 'global', now(),
            jsonb_build_object('month', v_key, 'source', 'ledger', 'metric', 'percent'),
            v_rows);
  end if;

  update public.students
     set points_month = 0,
         pct_num_month = 0, pct_den_month = 0,
         lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
         points_month_key = v_now_key,
         updated_at = now()
   where (points_month <> 0 or pct_den_month <> 0 or lb_attempts_month <> 0)
     and points_month_key is distinct from v_now_key;
end;
$$;
revoke all on function public.leaderboard_month_rollover(text) from public, anon, authenticated;
grant execute on function public.leaderboard_month_rollover(text) to service_role;

-- Cron entrypoint: runs daily, acts only on the 1st (Asia/Baku).
create or replace function public.leaderboard_rollover_if_month_start()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if extract(day from now() at time zone 'Asia/Baku') = 1 then
    perform public.leaderboard_month_rollover();
  end if;
end;
$$;
revoke all on function public.leaderboard_rollover_if_month_start() from public, anon, authenticated;
grant execute on function public.leaderboard_rollover_if_month_start() to service_role;

-- Admin reset (service_role only; the admin action audits the call):
--   'season' = archive the CURRENT month now + zero month caches;
--   'hard'   = zero everything (caches + ledger + activity) — destructive, owner action.
create or replace function public.admin_reset_leaderboard(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_mode = 'season' then
    perform public.leaderboard_month_rollover(to_char(now() at time zone 'Asia/Baku', 'YYYY-MM'));
    update public.students
       set points_month = 0,
           pct_num_month = 0, pct_den_month = 0,
           lb_correct_month = 0, lb_presented_month = 0, lb_attempts_month = 0,
           updated_at = now()
     where points_month <> 0 or pct_den_month <> 0 or lb_attempts_month <> 0;
  elsif p_mode = 'hard' then
    delete from public.student_points_ledger;
    delete from public.student_activity_days;
    update public.students
       set points_all_time = 0, points_month = 0, points_month_key = null,
           pct_num_month = 0, pct_den_month = 0, pct_num_all = 0, pct_den_all = 0,
           lb_correct_month = 0, lb_correct_all = 0,
           lb_presented_month = 0, lb_presented_all = 0,
           lb_attempts_month = 0, lb_attempts_all = 0,
           last_points_at = null, current_streak = 0, best_streak = 0,
           last_active_date = null, updated_at = now()
     where points_all_time <> 0 or points_month <> 0 or current_streak <> 0
        or best_streak <> 0 or last_points_at is not null
        or pct_den_all <> 0 or pct_den_month <> 0 or lb_attempts_all <> 0;
  else
    raise exception 'reset: mode must be season|hard' using errcode = 'check_violation';
  end if;
end;
$$;
revoke all on function public.admin_reset_leaderboard(text) from public, anon, authenticated;
grant execute on function public.admin_reset_leaderboard(text) to service_role;

--


-- -----------------------------------------------------------------------------
-- LEADERBOARD SEASONS (backported from migrations/2026_07_07_041)
-- Seasons updated_at trigger + live-standings helper + CRUD RPCs + parent child summary.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at_seasons on public.leaderboard_seasons;
create trigger trg_set_updated_at_seasons
  before update on public.leaderboard_seasons
  for each row execute function public.set_updated_at();

-- Internal helper: top-N live standings for an [starts,ends] window from the ledger.
create or replace function public.lb_season_live(p_starts timestamptz, p_ends timestamptz, p_limit int)
returns table (rank int, student_profile_id uuid, display_name text, value numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rank() over (order by t.pct desc)::int as rank,
         t.student_profile_id,
         trim(coalesce(st.first_name,'') || ' ' ||
              coalesce(left(nullif(st.last_name,''),1) || '.', '')) as display_name,
         t.pct as value
  from (
    select sl.student_profile_id,
           round(100 * sum(sl.weighted_num) / sum(sl.weighted_den), 4) as pct,
           count(*) as att
    from public.student_points_ledger sl
    where sl.created_at >= p_starts and sl.created_at < p_ends and sl.pct_valid
    group by sl.student_profile_id
    having sum(sl.weighted_den) > 0
  ) t
  join public.students st on st.profile_id = t.student_profile_id
  -- Round 43: seasons rank students who met the ROUNDS minimum in-window.
  where t.att >= coalesce((select nullif(value_json #>> '{}', '')::int
                           from public.system_settings
                           where key = 'leaderboard.rank.min_attempts'), 2)
  order by t.pct desc, t.student_profile_id
  limit greatest(1, least(coalesce(p_limit,100), 500));
$$;
revoke all on function public.lb_season_live(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.lb_season_live(timestamptz, timestamptz, int) to service_role;

create or replace function public.create_leaderboard_season(
  p_name text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name,''));
begin
  if v_name = '' then raise exception 'season: name required' using errcode = 'check_violation'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'season: end must be after start' using errcode = 'check_violation';
  end if;
  insert into public.leaderboard_seasons (name, starts_at, ends_at, created_by)
  values (left(v_name, 120), p_starts_at, p_ends_at, public.current_profile_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_leaderboard_season(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_leaderboard_season(text, timestamptz, timestamptz) to service_role;

create or replace function public.update_leaderboard_season(
  p_id uuid, p_name text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_name text := btrim(coalesce(p_name,'')); v_closed timestamptz;
begin
  select closed_at into v_closed from public.leaderboard_seasons where id = p_id;
  if not found then raise exception 'season: not found' using errcode = 'no_data_found'; end if;
  if v_closed is not null then raise exception 'season: cannot edit a closed season' using errcode = 'check_violation'; end if;
  if v_name = '' then raise exception 'season: name required' using errcode = 'check_violation'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'season: end must be after start' using errcode = 'check_violation';
  end if;
  update public.leaderboard_seasons
     set name = left(v_name,120), starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.update_leaderboard_season(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.update_leaderboard_season(uuid, text, timestamptz, timestamptz) to service_role;

create or replace function public.delete_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.leaderboard_seasons where id = p_id;
end;
$$;
revoke all on function public.delete_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.delete_leaderboard_season(uuid) to service_role;

create or replace function public.close_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_s timestamptz; v_e timestamptz; v_closed timestamptz; v_rows jsonb;
begin
  select starts_at, ends_at, closed_at into v_s, v_e, v_closed
    from public.leaderboard_seasons where id = p_id;
  if not found then raise exception 'season: not found' using errcode = 'no_data_found'; end if;
  if v_closed is not null then raise exception 'season: already closed' using errcode = 'check_violation'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', rank, 'student_profile_id', student_profile_id,
           'display_name', display_name, 'value', value,
           'metric', 'percent') order by rank), '[]'::jsonb)
    into v_rows
  from public.lb_season_live(v_s, v_e, 100);
  update public.leaderboard_seasons
     set closed_at = now(), standings_json = v_rows, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.close_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.close_leaderboard_season(uuid) to service_role;

create or replace function public.reopen_leaderboard_season(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.leaderboard_seasons
     set closed_at = null, standings_json = '[]'::jsonb, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.reopen_leaderboard_season(uuid) from public, anon, authenticated;
grant execute on function public.reopen_leaderboard_season(uuid) to service_role;

-- Standings for the admin viewer: live from the ledger while open, frozen json
-- once closed. service_role only (the admin action calls it after requireAdmin).
create or replace function public.get_season_standings(p_id uuid, p_limit int default 100)
returns table (rank int, display_name text, value numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_s timestamptz; v_e timestamptz; v_closed timestamptz; v_json jsonb;
begin
  select starts_at, ends_at, closed_at, standings_json
    into v_s, v_e, v_closed, v_json
    from public.leaderboard_seasons where id = p_id;
  if not found then return; end if;
  if v_closed is not null then
    return query
      select (e->>'rank')::int, e->>'display_name', (e->>'value')::numeric
      from jsonb_array_elements(coalesce(v_json,'[]'::jsonb)) e
      order by (e->>'rank')::int
      limit greatest(1, least(coalesce(p_limit,100), 500));
  else
    return query
      select s.rank, s.display_name, s.value
      from public.lb_season_live(v_s, v_e, p_limit) s;
  end if;
end;
$$;
revoke all on function public.get_season_standings(uuid, int) from public, anon, authenticated;
grant execute on function public.get_season_standings(uuid, int) to service_role;

-- ---- 2) Parent view: one child's leaderboard summary ------------------------
create or replace function public.get_child_leaderboard_summary(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := public.current_profile_id();
  v_mkey  text := to_char(now() at time zone 'Asia/Baku', 'YYYY-MM');
  v_pts_m numeric := 0; v_pts_a numeric := 0;
  v_pct_m numeric := 0; v_pct_a numeric := 0;
  v_qm    int := 0; v_qa int := 0; v_am int := 0; v_aa int := 0;
  v_cur   int := 0; v_best int := 0; v_last date; v_tz text;
  v_rank_m int; v_tot_m int; v_rank_a int; v_streak_live int := 0;
  v_prov_m boolean := true; v_prov_a boolean := true;
  v_mina int := coalesce((select nullif(value_json #>> '{}', '')::int
                          from public.system_settings
                          where key = 'leaderboard.rank.min_attempts'), 2);
begin
  if v_me is null then raise exception 'summary: not authenticated'; end if;
  if not (public.is_admin() or public.is_parent_linked_to_student(p_student)) then
    raise exception 'summary: forbidden' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(points_all_time,0), current_streak, best_streak, last_active_date,
         coalesce(streak_tz,'Asia/Baku'),
         case when points_month_key = v_mkey then points_month else 0 end,
         case when points_month_key = v_mkey and pct_den_month > 0
              then round(100 * pct_num_month / pct_den_month, 4) else 0 end,
         case when pct_den_all > 0
              then round(100 * pct_num_all / pct_den_all, 4) else 0 end,
         case when points_month_key = v_mkey then lb_presented_month else 0 end,
         lb_presented_all,
         case when points_month_key = v_mkey then lb_attempts_month else 0 end,
         lb_attempts_all
    into v_pts_a, v_cur, v_best, v_last, v_tz, v_pts_m,
         v_pct_m, v_pct_a, v_qm, v_qa, v_am, v_aa
    from public.students where profile_id = p_student;

  -- Round 43: rounds-only eligibility.
  v_prov_m := (v_am < v_mina);
  v_prov_a := (v_aa < v_mina);

  v_streak_live := case when v_last >= (now() at time zone v_tz)::date - 1 then v_cur else 0 end;

  if not v_prov_m then
    select r.rnk, r.total into v_rank_m, v_tot_m from (
      select t.profile_id, rank() over (order by t.value desc)::int as rnk,
             count(*) over ()::int as total
      from public.lb_rows('percent','global',null,'month') t
      where not t.is_provisional
    ) r where r.profile_id = p_student;
  end if;
  if v_tot_m is null then
    select count(*)::int into v_tot_m
    from public.lb_rows('percent','global',null,'month') t where not t.is_provisional;
  end if;
  if not v_prov_a then
    select r.rnk into v_rank_a from (
      select t.profile_id, rank() over (order by t.value desc)::int as rnk
      from public.lb_rows('percent','global',null,'all_time') t
      where not t.is_provisional
    ) r where r.profile_id = p_student;
  end if;

  return jsonb_build_object(
    'pct_month', v_pct_m, 'pct_all_time', v_pct_a,
    'questions_month', v_qm, 'questions_all_time', v_qa,
    'attempts_month', v_am, 'attempts_all_time', v_aa,
    'provisional_month', v_prov_m, 'provisional_all_time', v_prov_a,
    'min_attempts', v_mina,
    'current_streak', v_streak_live, 'best_streak', v_best,
    'rank_month', v_rank_m, 'total_month', coalesce(v_tot_m,0), 'rank_all_time', v_rank_a,
    'points_month', v_pts_m, 'points_all_time', v_pts_a);
end;
$$;
revoke all on function public.get_child_leaderboard_summary(uuid) from public, anon;
grant execute on function public.get_child_leaderboard_summary(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- NOTIFICATIONS ENGINE (backported from migrations/2026_07_07_042)
-- notification triggers + producer/mark-read/prefs/processor/prune RPCs.
-- -----------------------------------------------------------------------------
-- ---- retention + updated_at triggers -----------------------------------------
drop trigger if exists trg_set_updated_at_admin_notifs on public.admin_notifications;
create trigger trg_set_updated_at_admin_notifs before update on public.admin_notifications
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at_notif_prefs on public.notification_preferences;
create trigger trg_set_updated_at_notif_prefs before update on public.notification_preferences
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at_push_tokens on public.push_tokens;
create trigger trg_set_updated_at_push_tokens before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- create_notification — the SINGLE insert path. Idempotent; always writes the
-- in-app row, then a pending delivery per EXTRA channel the recipient allows.
-- NO end-user grant: only service_role + other DEFINER RPCs may create rows.
create or replace function public.create_notification(
  p_recipient       uuid,
  p_type            text,
  p_title           text,
  p_body            text default null,
  p_data            jsonb default '{}'::jsonb,
  p_channels        text[] default '{in_app}',
  p_idempotency_key text default null,
  p_priority        int default 5,
  p_action_url      text default null,
  p_category        text default null,
  p_expires_at      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_ch    text;
  v_email boolean;
  v_push  boolean;
begin
  if p_recipient is null then return null; end if;

  -- MIGRATION 133 -- `notifications` IS A MASTER SWITCH, and this is the only
  -- place that can make it one: every producer in the platform inserts through
  -- this function. Before, the toggle hid some web surfaces while every row was
  -- still written, the admin composer still reported "sent", and the mobile
  -- inbox stayed fully reachable.
  --
  -- PRIORITY 1 IS EXEMPT, exactly as the recipient's own mute is below. That
  -- level is reserved for payment and security -- "we are holding your money
  -- and have not delivered" -- and a platform-wide DISPLAY toggle must not be
  -- able to suppress it.
  if coalesce(p_priority, 5) > 1
     and coalesce((select enabled from public.feature_flags where key = 'notifications'), true) = false then
    return null;
  end if;
  -- Respect the recipient's IN-APP preference; missing prefs = enabled.
  if coalesce((select in_app_enabled from public.notification_preferences where profile_id = p_recipient), true) = false
     and coalesce(p_priority, 5) > 1 then
    -- Priority 1 (critical: payment/security) always reaches the inbox.
    return null;
  end if;

  insert into public.notifications
    (recipient_profile_id, type, title, body, data_json, idempotency_key,
     priority, action_url, category, expires_at)
  values
    (p_recipient, p_type, left(p_title, 200), p_body,
     coalesce(p_data, '{}'::jsonb), p_idempotency_key,
     coalesce(p_priority, 5), p_action_url, p_category, p_expires_at)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;   -- deduped (already sent)

  -- Extra channels → pending deliveries, gated by global flag + user preference.
  v_email := coalesce((select email_enabled from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_email'), false);
  v_push  := coalesce((select push_enabled  from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_push'), false);

  foreach v_ch in array coalesce(p_channels, '{}')
  loop
    if v_ch = 'email' and v_email then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'email', 'pending');
    elsif v_ch = 'push' and v_push then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'push', 'pending');
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) to service_role;

-- Internal audience resolver → set of recipient profile ids. service-internal.
-- Migration 060 adds 'all_users' (parents ∪ students, deduped) and
-- 'olympiad_buyers' (active purchases of ≥1 selected package → purchasing
-- parent + entitled child, deduped; filter.package_ids uuid[]).
create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type = 'all_users' then
    -- Every notifiable end-user role, deduped (migration 060).
    return query
      select pr.profile_id from public.parents pr
      union
      select st.profile_id from public.students st;
  elsif p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
  elsif p_type = 'olympiad_buyers' then
    -- ACTIVE purchases of any selected package → purchasing parent + entitled
    -- child, deduped (migration 060). Failed/canceled purchases never match.
    return query
      with pkg as (
        select e::uuid as id
        from jsonb_array_elements_text(coalesce(p_filter->'package_ids','[]'::jsonb)) e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      select distinct u.pid
      from (
        select op.owner_parent_profile_id as pid
        from public.olympiad_purchases op
        join pkg on pkg.id = op.olympiad_package_id
        where op.status = 'active'
        union
        select op.student_profile_id
        from public.olympiad_purchases op
        join pkg on pkg.id = op.olympiad_package_id
        where op.status = 'active'
      ) u
      where u.pid is not null;
  elsif p_type in ('parent', 'individual') then
    -- Multi-select: audience_filter.profile_ids (uuid array). Fallback: single profile_id (migration 044).
    if p_filter ? 'profile_ids' and jsonb_typeof(p_filter->'profile_ids') = 'array' then
      return query
        select e::uuid
        from jsonb_array_elements_text(p_filter->'profile_ids') e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    elsif (p_filter->>'profile_id') is not null then
      return query select (p_filter->>'profile_id')::uuid;
    end if;
  elsif p_type = 'by_subject' then
    return query
      select distinct cs.student_profile_id
      from public.child_subscriptions cs
      join public.subscription_subjects ss on ss.child_subscription_id = cs.id
      where ss.subject_id = (p_filter->>'subject_id')::uuid
        and cs.status in ('trialing','active');
  elsif p_type = 'administrators' then
    -- Migration 076: staff audiences for admin-directed sends.
    return query
      select prr.profile_id from public.profile_roles prr
      join public.roles r on r.id = prr.role_id where r.code = 'administrator';
  elsif p_type = 'content_managers' then
    return query
      select prr.profile_id from public.profile_roles prr
      join public.roles r on r.id = prr.role_id where r.code = 'content_manager';
  end if;
end;
$$;
revoke all on function public.lb_notify_audience(text, jsonb) from public, anon, authenticated;
grant execute on function public.lb_notify_audience(text, jsonb) to service_role;

-- get_target_count — admin audience preview (authenticated; admin-checked in body).
create or replace function public.get_notification_target_count(p_type text, p_filter jsonb)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_n from public.lb_notify_audience(p_type, coalesce(p_filter,'{}'::jsonb));
  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.get_notification_target_count(text, jsonb) from public, anon;
grant execute on function public.get_notification_target_count(text, jsonb) to authenticated, service_role;

-- notify_template_kind — template code → notification (type, category) for the
-- broadcast fan-out paths (migration 067): a news_published broadcast files
-- under "news" (newspaper icon / News filter chip) instead of the generic
-- announcement pair; unknown/NULL codes keep admin_announcement/announcement.
-- The category set matches the client filter chips.
create or replace function public.notify_template_kind(
  p_template_code text,
  out n_type text,
  out n_category text
)
returns record
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    case p_template_code
      when 'news_published'        then 'news_published'
      when 'olympiad_purchased'    then 'olympiad_purchased'
      when 'attempt_graded'        then 'attempt_graded'
      when 'personal_best'         then 'personal_best'
      when 'streak_milestone'      then 'streak_milestone'
      when 'subscription_canceled' then 'subscription_canceled'
      when 'subject_charge_failed' then 'subject_charge_failed'
      when 'subject_expiring'      then 'subject_expiring'
      when 'giveaway_ending'       then 'giveaway_ending'
      else 'admin_announcement'
    end,
    case p_template_code
      when 'news_published'        then 'news'
      when 'olympiad_purchased'    then 'olympiad'
      when 'attempt_graded'        then 'progress'
      when 'personal_best'         then 'progress'
      when 'streak_milestone'      then 'progress'
      when 'subscription_canceled' then 'billing'
      when 'subject_charge_failed' then 'billing'
      when 'subject_expiring'      then 'billing'
      when 'giveaway_ending'       then 'announcement'
      else 'announcement'
    end
$$;
revoke all on function public.notify_template_kind(text) from public, anon, authenticated;
grant execute on function public.notify_template_kind(text) to service_role;

-- admin_send_notification — the broadcast path. authenticated + in-body admin
-- check. Immediate send (scheduled_at null) fans out now; else stored 'scheduled'
-- and dispatched by cron. Returns the admin_notifications id + recipient count.
-- Migration 060: audience whitelist extended (all_users, olympiad_buyers);
-- olympiad_buyers requires well-formed package_ids of existing ACTIVE packages,
-- validated BEFORE anything is stored.
-- Migration 067: fan-out type/category derive from the template code.
create or replace function public.admin_send_notification(
  p_title         text,
  p_body          text,
  p_channels      text[],
  p_audience_type text,
  p_audience_filter jsonb default '{}'::jsonb,
  p_scheduled_at  timestamptz default null,
  p_template_code text default null,
  p_action_url    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_id    uuid;
  v_rec   uuid;
  v_n     int := 0;
  v_key   text;
  v_pkg_n int;
  v_kind  record;
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_body),'') = '' then
    raise exception 'notify: title and body required' using errcode = 'check_violation';
  end if;
  if p_audience_type not in ('all_users','all_parents','all_children','olympiad_buyers',
                             'parent','by_subject','individual',
                             'administrators','content_managers') then
    raise exception 'notify: bad audience' using errcode = 'check_violation';
  end if;

  -- olympiad_buyers: package_ids are REQUIRED and must all be existing ACTIVE
  -- packages (migration 060) — validated before anything is stored.
  if p_audience_type = 'olympiad_buyers' then
    select count(*) into v_pkg_n
    from jsonb_array_elements_text(coalesce(p_audience_filter->'package_ids','[]'::jsonb)) e
    where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if coalesce(v_pkg_n, 0) = 0 then
      raise exception 'notify: at least one olympiad package required' using errcode = 'check_violation';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(p_audience_filter->'package_ids') e
      where not exists (
        select 1 from public.olympiad_packages op
        where op.id::text = e and op.status = 'active')
    ) then
      raise exception 'notify: invalid or inactive olympiad package' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.admin_notifications
    (actor_profile_id, title, body, template_code, channels, audience_type,
     audience_filter, status, scheduled_at)
  values
    (v_actor, left(p_title,200), left(p_body,2000), p_template_code,
     coalesce(p_channels,'{in_app}'), p_audience_type, coalesce(p_audience_filter,'{}'::jsonb),
     case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'sending' end,
     p_scheduled_at)
  returning id into v_id;

  -- Scheduled → leave for the cron dispatcher; just return the target count.
  if p_scheduled_at is not null and p_scheduled_at > now() then
    select count(*) into v_n from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb));
    update public.admin_notifications set total_recipients = coalesce(v_n,0) where id = v_id;
    return jsonb_build_object('id', v_id, 'status', 'scheduled', 'recipients', coalesce(v_n,0));
  end if;

  -- Immediate fan-out (idempotent per recipient+broadcast). Type/category come
  -- from the template so e.g. the news broadcast files under "news".
  select * into v_kind from public.notify_template_kind(p_template_code);
  for v_rec in select a.profile_id from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb)) a
  loop
    v_key := 'admin:' || v_id::text || ':' || v_rec::text;
    perform public.create_notification(
      v_rec, v_kind.n_type, p_title, p_body,
      jsonb_build_object('admin_notification_id', v_id),
      coalesce(p_channels,'{in_app}'), v_key, 3, p_action_url, v_kind.n_category, null);
    v_n := v_n + 1;
  end loop;

  update public.admin_notifications
     set status = 'sent', total_recipients = v_n, delivered_count = v_n, sent_at = now()
   where id = v_id;
  return jsonb_build_object('id', v_id, 'status', 'sent', 'recipients', v_n);
end;
$$;
revoke all on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) from public, anon;
grant execute on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) to authenticated, service_role;

-- mark read / mark all / unread count / delete — owner-scoped (authenticated).
create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where id = p_id and recipient_profile_id = public.current_profile_id();
end; $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;

create or replace function public.mark_all_notifications_read()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  update public.notifications set read_at = now()
   where recipient_profile_id = public.current_profile_id() and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;

create or replace function public.get_unread_notification_count()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.notifications
   where recipient_profile_id = public.current_profile_id() and read_at is null
     and (expires_at is null or expires_at > now());
$$;
revoke all on function public.get_unread_notification_count() from public, anon;
grant execute on function public.get_unread_notification_count() to authenticated, service_role;

create or replace function public.delete_notification(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.notifications
   where id = p_id and recipient_profile_id = public.current_profile_id();
end; $$;
revoke all on function public.delete_notification(uuid) from public, anon;
grant execute on function public.delete_notification(uuid) to authenticated, service_role;

-- preferences: read/write own OR a linked child's (parent-managed) OR admin.
create or replace function public.get_notification_preferences(p_profile uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_target uuid := coalesce(p_profile, public.current_profile_id()); v_row public.notification_preferences;
begin
  if v_target is null then raise exception 'prefs: not authenticated'; end if;
  if not (v_target = public.current_profile_id()
          or public.is_parent_linked_to_student(v_target) or public.is_admin()) then
    raise exception 'prefs: forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.notification_preferences where profile_id = v_target;
  return jsonb_build_object(
    'in_app_enabled', coalesce(v_row.in_app_enabled, true),
    'email_enabled',  coalesce(v_row.email_enabled, true),
    'push_enabled',   coalesce(v_row.push_enabled, true));
end; $$;
revoke all on function public.get_notification_preferences(uuid) from public, anon;
grant execute on function public.get_notification_preferences(uuid) to authenticated, service_role;

create or replace function public.set_notification_preferences(
  p_profile uuid, p_in_app boolean, p_email boolean, p_push boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_target uuid := coalesce(p_profile, public.current_profile_id());
begin
  if v_target is null then raise exception 'prefs: not authenticated'; end if;
  if not (v_target = public.current_profile_id()
          or public.is_parent_linked_to_student(v_target) or public.is_admin()) then
    raise exception 'prefs: forbidden' using errcode = 'insufficient_privilege';
  end if;
  insert into public.notification_preferences (profile_id, in_app_enabled, email_enabled, push_enabled)
  values (v_target, coalesce(p_in_app,true), coalesce(p_email,true), coalesce(p_push,true))
  on conflict (profile_id) do update
    set in_app_enabled = excluded.in_app_enabled,
        email_enabled  = excluded.email_enabled,
        push_enabled   = excluded.push_enabled,
        updated_at = now();
end; $$;
revoke all on function public.set_notification_preferences(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notification_preferences(uuid, boolean, boolean, boolean) to authenticated, service_role;

-- push token upsert (mobile registers this; owner-scoped).
create or replace function public.upsert_push_token(p_token text, p_platform text, p_device jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := public.current_profile_id();
begin
  if v_me is null then raise exception 'push: not authenticated'; end if;
  if p_platform not in ('ios','android','web') then raise exception 'push: bad platform' using errcode='check_violation'; end if;
  insert into public.push_tokens (profile_id, token, platform, device_info, is_valid, last_used_at)
  values (v_me, p_token, p_platform, coalesce(p_device,'{}'::jsonb), true, now())
  on conflict (token) do update
    set profile_id = v_me, platform = excluded.platform, device_info = excluded.device_info,
        is_valid = true, failure_count = 0, last_used_at = now(), updated_at = now();
end; $$;
revoke all on function public.upsert_push_token(text, text, jsonb) from public, anon;
grant execute on function public.upsert_push_token(text, text, jsonb) to authenticated, service_role;

-- ---- processor (service-role only) -------------------------------------------
create or replace function public.claim_pending_deliveries(p_limit int default 50, p_worker text default null)
returns setof public.notification_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  update public.notification_deliveries d
     set status = 'queued', provider_ref = p_worker, updated_at = now()
   where d.id in (
     select id from public.notification_deliveries
      where status = 'pending'
      order by created_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit,50), 500))
   )
  returning d.*;
end; $$;
revoke all on function public.claim_pending_deliveries(int, text) from public, anon, authenticated;
grant execute on function public.claim_pending_deliveries(int, text) to service_role;

create or replace function public.mark_delivery_result(p_id uuid, p_status public.delivery_status, p_ref text default null, p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_deliveries
     set status = p_status, provider_ref = coalesce(p_ref, provider_ref),
         error_text = p_error, updated_at = now()
   where id = p_id;
end; $$;
revoke all on function public.mark_delivery_result(uuid, public.delivery_status, text, text) from public, anon, authenticated;
grant execute on function public.mark_delivery_result(uuid, public.delivery_status, text, text) to service_role;

-- dispatch scheduled broadcasts whose time has come (cron / processor).
create or replace function public.dispatch_scheduled_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_rec uuid; v_n int; v_total int := 0; v_kind record;
begin
  for v_row in
    select * from public.admin_notifications
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
     for update skip locked
  loop
    update public.admin_notifications set status = 'sending' where id = v_row.id;
    v_n := 0;
    -- Migration 067: type/category derive from the stored template code.
    select * into v_kind from public.notify_template_kind(v_row.template_code);
    for v_rec in select a.profile_id from public.lb_notify_audience(v_row.audience_type, v_row.audience_filter) a
    loop
      perform public.create_notification(
        v_rec, v_kind.n_type, v_row.title, v_row.body,
        jsonb_build_object('admin_notification_id', v_row.id),
        v_row.channels, 'admin:' || v_row.id::text || ':' || v_rec::text, 3, null, v_kind.n_category, null);
      v_n := v_n + 1;
    end loop;
    update public.admin_notifications
       set status = 'sent', total_recipients = v_n, delivered_count = v_n, sent_at = now()
     where id = v_row.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end; $$;
revoke all on function public.dispatch_scheduled_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_scheduled_notifications() to service_role;

-- retention prune: delete READ notifications older than retention_days, and trim
-- each user's inbox to max_per_user (keeping the newest). service-role / cron.
create or replace function public.prune_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_days int; v_max int; v_n int := 0; v_m int;
begin
  v_days := coalesce((select nullif(value_json #>> '{}','')::int from public.system_settings where key='notifications.retention_days'), 180);
  v_max  := coalesce((select nullif(value_json #>> '{}','')::int from public.system_settings where key='notifications.max_per_user'), 500);

  delete from public.notifications
   where read_at is not null and read_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;

  -- Cap per user (delete oldest READ beyond the cap; never prune unread).
  with ranked as (
    select id, row_number() over (partition by recipient_profile_id order by created_at desc) rn
    from public.notifications)
  delete from public.notifications n using ranked r
   where n.id = r.id and r.rn > v_max and n.read_at is not null;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end; $$;
revoke all on function public.prune_notifications() from public, anon, authenticated;
grant execute on function public.prune_notifications() to service_role;

-- =============================================================================
-- Notification PRODUCERS (migration 074, revised by 076): student progress
-- milestones (personal_best + streak_milestone) and the pre-expiry / giveaway-
-- ending scanners. All service-role only; all wrap create_notification so a
-- notify failure never breaks the underlying action. The two scanners are
-- scheduled by 016 (guarded on pg_cron). subject_charge_failed stays UNWIRED
-- (needs the real payment provider — see the payment backlog).
-- The R29 admin operational-alert triggers (new parent/purchase/subscription)
-- + notify_admins were REMOVED in 076 — admins now receive only notifications
-- sent TO them (composer 'administrators' audience) + package-published alerts.
-- =============================================================================
-- Student progress milestones — fires AFTER award_attempt_points on the same
-- '→ graded' transition (name order: trg_award_* < trg_notify_progress_*).
create or replace function public.notify_progress_milestones_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_streak int; v_last date; v_prev numeric; v_this numeric;
begin
  begin
    select current_streak, last_active_date into v_streak, v_last
      from public.students where profile_id = new.student_profile_id;
    if v_streak in (3, 7, 14, 30, 60, 100) then
      perform public.create_notification(
        new.student_profile_id, 'streak_milestone', 'Seriya davam edir 🔥',
        v_streak::text || ' günlük seriya! Davam et.',
        jsonb_build_object('days', v_streak),
        array['in_app'],
        'streak:' || new.student_profile_id::text || ':' || v_streak::text || ':' || coalesce(v_last::text, 'x'),
        4, '/child/leaderboard', 'progress', null);
    end if;
    if new.is_rated then
      select coalesce(max(points), 0) into v_prev
        from public.student_points_ledger
        where student_profile_id = new.student_profile_id and attempt_id <> new.id;
      select coalesce(points, 0) into v_this
        from public.student_points_ledger where attempt_id = new.id;
      if v_this > v_prev and v_prev > 0 then
        perform public.create_notification(
          new.student_profile_id, 'personal_best', 'Yeni rekord!',
          'Yeni şəxsi rekordun: ' || trim_scale(v_this)::text || ' xal 🎉',
          jsonb_build_object('points', v_this),
          array['in_app'],
          'pb:' || new.student_profile_id::text || ':' || new.id::text,
          4, '/child/leaderboard', 'progress', null);
      end if;
    end if;
  exception when others then raise warning 'notify_progress_milestones failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_progress_milestones on public.test_attempts;
create trigger trg_notify_progress_milestones
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.notify_progress_milestones_tg();

-- Pre-expiry scanner (cron): parents whose child subscription lapses within 3
-- days. Migration 109: the scan is PER SUBJECT (each owns its own period) but
-- grouped by (subscription, period end), so a uniform plan still produces ONE
-- notice while a weekly subject can never silence a yearly one's. Idempotency
-- keyed by (subscription, period_end) → once per period.
create or replace function public.notify_expiring_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_name     text;
  v_subjects text;
  v_when     text;
  v_title    text;
  v_body     text;
  v_prio     int;
  v_sent     uuid;
  v_n        int := 0;
begin
  -- MIGRATION 134 -- SILENT DURING A CAMPAIGN. These warnings say "access stops
  -- on <date>, and nothing renews it automatically". During a giveaway BOTH
  -- halves are false: access is not stopping, and every payment rail refuses a
  -- plan change anyway (gate.giveawayFree), so the parent is told to act and
  -- then prevented from acting. The campaign has its own three-rung warning
  -- chain -- notify_giveaway_ending -- which is the one that is true right now.
  if public.is_giveaway_active() then
    return 0;
  end if;

  for v_row in
    select cs.id,
           cs.owner_parent_profile_id,
           cs.student_profile_id,
           ss.current_period_end::date                                     as end_date,
           (ss.current_period_end::date - now()::date)                     as days_left,
           s.first_name,
           s.last_name,
           string_agg(distinct coalesce(nullif(btrim(subj.name), ''), '—'), ', ')
             as subject_names
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    join public.students s              on s.profile_id = cs.student_profile_id
    left join public.subjects subj      on subj.id = ss.subject_id
    where cs.status in ('trialing', 'active')
      -- A subject the parent has ALREADY chosen to drop is not lapsing, it is
      -- ending on purpose. Warning about it would be nagging.
      and ss.remove_at is null
      and ss.current_period_end is not null
      -- WHOLE CALENDAR DAYS. See the header: an epoch-based rung depends on what
      -- time the cron happens to fire and can skip a step entirely.
      and (ss.current_period_end::date - now()::date) in (3, 2, 1)
      and cs.owner_parent_profile_id is not null
    group by cs.id, cs.owner_parent_profile_id, cs.student_profile_id,
             ss.current_period_end::date, s.first_name, s.last_name
  loop
    v_name := coalesce(
      nullif(btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''),
      'övladınız');
    v_subjects := coalesce(nullif(btrim(v_row.subject_names), ''), 'abunəlik');
    v_when := to_char(v_row.end_date, 'DD.MM.YYYY');

    -- Three rungs, three sentences. Each states WHAT ends, WHEN, and that
    -- nothing renews it automatically. None names a price, a place or an action.
    if v_row.days_left = 3 then
      v_prio  := 3;
      v_title := 'Abunə 3 gün sonra bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi ' || v_when ||
                 ' tarixində başa çatır. Abunəlik avtomatik yenilənmir.';
    elsif v_row.days_left = 2 then
      v_prio  := 2;
      v_title := 'Abunə 2 gün sonra bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi ' || v_when ||
                 ' tarixində başa çatır. Abunəlik avtomatik yenilənmir; uzadılmasa, giriş həmin tarixdə dayanacaq.';
    else
      -- The last one a parent will get. Priority 1 reaches an inbox that has
      -- been muted, because there is no fourth chance and nothing charges a card.
      v_prio  := 1;
      v_title := 'Son xəbərdarlıq: abunə sabah bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi sabah — ' || v_when ||
                 ' — başa çatır. Uzadılmadığı təqdirdə həmin gün giriş dayanacaq.';
    end if;

    -- COUNT WHAT WAS ACTUALLY SENT, not what was considered. create_notification
    -- returns NULL when its `on conflict (idempotency_key) do nothing` discards a
    -- duplicate, and the old code `perform`ed it and incremented regardless -- so
    -- a run that sent nothing still reported one per candidate row. Nothing reads
    -- this number today, which is exactly how a lying counter survives until the
    -- day somebody debugging a missing reminder trusts it.
    select public.create_notification(
      v_row.owner_parent_profile_id,
      'subject_expiring',
      v_title,
      v_body,
      jsonb_build_object(
        'child_name', v_name,
        'student_profile_id', v_row.student_profile_id,
        'subjects', v_subjects,
        'days', v_row.days_left,
        'ends_on', v_when,
        'subscription_id', v_row.id),
      -- MIGRATION 138: the EMAIL channel is requested here.
      --
      -- Renewals are MANUAL (ABB has not approved recurring), so this chain is
      -- the entire retention mechanism -- and the parent is the payer while the
      -- CHILD is the daily user. A parent may not open the portal for weeks, so
      -- an in-app-only warning is a warning nobody reads: access lapses quietly
      -- and the family finds out from a locked-out child.
      --
      -- Nothing is sent until BOTH the notifications_email flag is on AND the
      -- recipient's email_enabled preference allows it; create_notification
      -- checks both before it writes a delivery row. Asking for the channel is
      -- therefore safe on its own and inert until deliberately enabled.
      array['in_app', 'email'],
      -- THE DAY BUCKET IS WHAT MAKES THE CHAIN WORK. Without it the second and
      -- third warnings collide with the first on `on conflict (idempotency_key)
      -- do nothing` and are silently discarded — which is exactly what the old
      -- key did. period_end stays in the key so a RENEWED subject starts a fresh
      -- series rather than being permanently muted by the old one.
      'subexp:' || v_row.id::text || ':' || v_row.end_date::text || ':d' || v_row.days_left::text,
      v_prio,
      -- A RELATIVE path. §5 forbids opening an external https URL from
      -- notification content; the mobile client allowlists relative routes.
      '/subscription',
      'billing',
      null) into v_sent;
    if v_sent is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;
grant execute on function public.notify_expiring_subscriptions() to service_role;

-- Giveaway-ending scanner (cron): warn all parents in the final 2 days of an
-- active giveaway. Idempotency keyed by (parent, window end) → once per window.
create or replace function public.notify_giveaway_ending()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start  timestamptz;
  v_dur    int;
  v_end    timestamptz;
  v_days   int;
  v_parent uuid;
  v_title  text;
  v_body   text;
  v_prio   int;
  v_sent   uuid;
  v_n      int := 0;
begin
  if not public.is_giveaway_active() then return 0; end if;

  select nullif(value_json #>> '{}', '')::timestamptz into v_start
    from public.system_settings where key = 'giveaway.started_at';
  select nullif(value_json #>> '{}', '')::int into v_dur
    from public.system_settings where key = 'giveaway.duration_days';
  if v_start is null or coalesce(v_dur, 0) <= 0 then return 0; end if;
  v_end := v_start + make_interval(days => v_dur);

  -- WHOLE CALENDAR DAYS, like migration 130. An epoch-based rung depends on what
  -- time the cron happens to fire and can skip a step entirely.
  v_days := v_end::date - now()::date;
  if v_days not in (3, 2, 1) then return 0; end if;

  if v_days = 3 then
    v_prio  := 3;
    v_title := 'Pulsuz giriş 3 gün sonra bitir';
    v_body  := 'Kampaniya dövrü başa çatmaq üzrədir. 3 gün sonra platforma adi abunə sisteminə qayıdır.';
  elsif v_days = 2 then
    v_prio  := 2;
    v_title := 'Pulsuz giriş 2 gün sonra bitir';
    v_body  := 'Tam pulsuz girişə cəmi 2 gün qalıb. Kampaniya bitdikdən sonra premium bölmələr üçün abunəlik tələb olunacaq.';
  else
    v_prio  := 1;
    v_title := 'Son xəbərdarlıq: pulsuz giriş sabah bitir';
    v_body  := 'Kampaniya sabah başa çatır. Pulsuz giriş dövrü bitdikdə platforma abunə sisteminə qayıdır və premium bölmələr üçün abunəlik tələb olunur.';
  end if;

  for v_parent in select profile_id from public.parents
  loop
    -- THE RUNG IS IN THE KEY. Without it the second and third warnings collide
    -- with the first on `on conflict (idempotency_key) do nothing` and are
    -- thrown away in silence -- which is exactly what the old key did. The
    -- window END stays in the key too, so a LATER campaign starts a fresh series
    -- rather than being permanently muted by the previous one (spec §10).
    select public.create_notification(
      v_parent, 'giveaway_ending', v_title, v_body,
      jsonb_build_object('ends_at', v_end, 'days', v_days),
      -- MIGRATION 138: the EMAIL channel is requested here, for the same
      -- reason as the renewal chain -- this is the other notification that
      -- means "your child's access is about to change", and it is the only
      -- warning before a free period ends and subjects start costing money.
      -- Gated by the notifications_email flag and the recipient's preference.
      array['in_app', 'email'],
      'gvw:' || v_parent::text || ':' || v_end::text || ':d' || v_days::text,
      v_prio, '/services', 'announcement', null) into v_sent;
    -- Count what was SENT, not what was considered: create_notification returns
    -- NULL on a deduped write, and a counter that ignores that reports a full
    -- run every day while sending nothing.
    if v_sent is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.notify_giveaway_ending() from public, anon, authenticated;
grant execute on function public.notify_giveaway_ending() to service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION 141 - the Free Trial ending chain (12h / 1h / ended).
-- ---------------------------------------------------------------------------
create or replace function public.free_trial_notice(
  p_locale   text,
  p_rung     int,
  p_child    text,
  p_subjects text,
  p_ends_at  timestamptz
)
returns table (title text, body text)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_loc  text := case when p_locale in ('az','en','ru') then p_locale else 'az' end;
  v_when text := to_char(p_ends_at at time zone 'Asia/Baku', 'DD.MM.YYYY HH24:MI');
begin
  if p_rung = 12 then
    if v_loc = 'en' then
      title := 'Half of the free day is gone';
      body  := 'Free access to ' || p_subjects || ' for ' || p_child ||
               ' ends on ' || v_when || '. There is still time.';
    elsif v_loc = 'ru' then
      title := 'Половина бесплатного дня позади';
      body  := 'Бесплатный доступ к предметам ' || p_subjects || ' для ' || p_child ||
               ' заканчивается ' || v_when || '. Время ещё есть.';
    else
      title := 'Pulsuz günün yarısı keçdi';
      body  := p_child || ' üçün ' || p_subjects || ' fənlərinə pulsuz giriş ' ||
               v_when || ' tarixində bitir. Hələ vaxt var.';
    end if;
  elsif p_rung = 1 then
    if v_loc = 'en' then
      title := 'Free access ends in an hour';
      body  := 'Access to ' || p_subjects || ' for ' || p_child ||
               ' closes at ' || v_when || '.';
    elsif v_loc = 'ru' then
      title := 'Бесплатный доступ закончится через час';
      body  := 'Доступ к предметам ' || p_subjects || ' для ' || p_child ||
               ' закроется ' || v_when || '.';
    else
      title := 'Pulsuz giriş bir saatdan sonra bitir';
      body  := p_child || ' üçün ' || p_subjects || ' fənlərinə giriş ' ||
               v_when || ' tarixində bağlanacaq.';
    end if;
  else
    if v_loc = 'en' then
      title := 'Free access has ended';
      body  := 'Access to ' || p_subjects || ' for ' || p_child || ' is now closed.';
    elsif v_loc = 'ru' then
      title := 'Бесплатный доступ завершён';
      body  := 'Доступ к предметам ' || p_subjects || ' для ' || p_child || ' закрыт.';
    else
      title := 'Pulsuz giriş başa çatdı';
      body  := p_child || ' üçün ' || p_subjects || ' fənlərinə giriş bağlandı.';
    end if;
  end if;
  return next;
end;
$$;

comment on function public.free_trial_notice(text, int, text, text, timestamptz) is
  'Migration 141: the trilingual Free Trial notice bodies (az/en/ru), keyed on '
  'the locale captured on the free_trials row. Names no price, no purchase verb, '
  'no destination and no URL — these strings render verbatim inside the '
  'purchase-silent store binaries.';

revoke all on function public.free_trial_notice(text, int, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.free_trial_notice(text, int, text, text, timestamptz)
  to service_role;


create or replace function public.notify_free_trial_ending()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_note     record;
  v_rung     int;
  v_prio     int;
  v_type     text;
  v_expires  timestamptz;
  v_sent     uuid;
  v_n        int := 0;
  v_hour     int;
begin
  -- During a campaign or an admin free-access window the trial ends and NOTHING
  -- changes, so every one of these sentences would be false. The renewal chain
  -- opens with the same guard for the same reason.
  if public.is_giveaway_active() then return 0; end if;

  -- WAKING HOURS, in the child's own timezone. A rung due at 03:00 is not
  -- emitted; the monotone predicate below re-offers it from 08:00.
  v_hour := extract(hour from (now() at time zone 'Asia/Baku'))::int;
  if v_hour < 8 or v_hour > 21 then return 0; end if;

  for v_row in
    select ft.id, ft.student_profile_id, ft.owner_parent_profile_id,
           ft.subject_ids, ft.ends_at, ft.locale,
           trim(both from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) as child_name
    from public.free_trials ft
    join public.students s on s.profile_id = ft.student_profile_id
    where ft.cancelled_at is null
      -- Bounded by idx_free_trials_ends_at. The backward reach is 14 hours so an
      -- expiry that happened during the quiet window is still reportable at 08:00.
      and ft.ends_at >  now() - interval '14 hours'
      and ft.ends_at <= now() + interval '12 hours'
  loop
    begin
      -- One family must not be able to silence every family: a raise inside this
      -- loop would abort the whole run, so each row is wrapped.
      if public.is_free_access_active_for_student(v_row.student_profile_id) then
        continue;
      end if;

      -- WHICH RUNG IS DUE. Ordered most-urgent-first so a single pass emits at
      -- most one notice per trial per run.
      if v_row.ends_at <= now() then
        v_rung := 0;  v_prio := 2;  v_type := 'free_trial_ended';  v_expires := null;
      elsif v_row.ends_at - now() <= interval '1 hour' then
        v_rung := 1;  v_prio := 2;  v_type := 'free_trial_ending'; v_expires := v_row.ends_at;
      elsif v_row.ends_at - now() <= interval '12 hours' then
        v_rung := 12; v_prio := 3;  v_type := 'free_trial_ending'; v_expires := v_row.ends_at;
      else
        continue;
      end if;

      select * into v_note from public.free_trial_notice(
        v_row.locale, v_rung,
        nullif(v_row.child_name, ''),
        coalesce((select string_agg(sub.name, ', ' order by sub.name)
                  from public.subjects sub where sub.id = any(v_row.subject_ids)), ''),
        v_row.ends_at);

      -- ends_at is IN the key, so a reissued trial would start a fresh series
      -- rather than being muted by the old one.
      select public.create_notification(
        v_row.owner_parent_profile_id,
        v_type,
        v_note.title,
        v_note.body,
        jsonb_build_object('student_profile_id', v_row.student_profile_id,
                           'ends_at', v_row.ends_at,
                           'hours', v_rung),
        -- The email channel, per migration 138's rule: only the chains that mean
        -- "your child's access is about to change". Inert until the flag is on.
        array['in_app', 'email'],
        'trial:' || v_row.id::text || ':' || v_row.ends_at::text || ':h' || v_rung::text,
        v_prio,
        -- NEVER a pricing route. /children is allowlisted; /services and the
        -- auth routes deliberately are not.
        '/children/' || v_row.student_profile_id::text,
        'announcement',
        v_expires
      ) into v_sent;

      -- Count what was SENT, not what was considered. Under the monotone
      -- predicate a suppressed rung is re-offered every five minutes; those are
      -- harmless no-ops and must not inflate the counter.
      if v_sent is not null then v_n := v_n + 1; end if;
    exception when others then
      raise warning 'notify_free_trial_ending: trial % failed: %', v_row.id, sqlerrm;
    end;
  end loop;

  return v_n;
end;
$$;

comment on function public.notify_free_trial_ending() is
  'Migration 141: warns the OWNING PARENT that a Free Trial is ending — 12 hours '
  'left, 1 hour left, and ended. Runs */5 with a monotone due-and-unsent '
  'predicate so a delayed run delivers late rather than never. Emits only between '
  '08:00 and 21:00 Asia/Baku, and never announces remaining time after ends_at '
  'has passed. Priority never 1: nobody paid for this.';

revoke all on function public.notify_free_trial_ending() from public, anon, authenticated;
grant execute on function public.notify_free_trial_ending() to service_role;

-- =============================================================================
-- Admin subscription lifecycle (migration 077): the ONE centralized, self-
-- auditing entry point the Admin Panel uses to manage comped / admin-granted
-- subscriptions. Validated transitions only (activate/cancel/expire/extend);
-- anything else raises check_violation with hint 'invalid_transition'. Also
-- reconciles students.access_status for the affected child. Administrator-only
-- via the in-body is_admin() guard. Creation stays with
-- admin_grant_child_access() / create_child_subscription().
-- =============================================================================
create or replace function public.admin_manage_child_subscription(
  p_subscription_id uuid,
  p_action          text,
  p_days            int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := public.current_profile_id();
  v_sub      public.child_subscriptions%rowtype;
  v_from     text;
  v_to       text;
  v_end      timestamptz;
  v_student  uuid;
  v_touched  int;
begin
  -- Administrator only (subscription/payment modules are Admin-only; content
  -- managers must never reach this).
  if not public.is_admin() then
    raise exception 'subscription: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('activate', 'cancel', 'expire', 'extend') then
    raise exception 'subscription: bad action' using errcode = 'check_violation',
      hint = 'unknown_action';
  end if;

  select * into v_sub from public.child_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'subscription: not found' using errcode = 'no_data_found';
  end if;
  v_from    := v_sub.status::text;
  v_student := v_sub.student_profile_id;
  v_to      := v_from;
  v_end     := v_sub.current_period_end;

  if p_action = 'activate' then
    if v_from not in ('incomplete', 'past_due') then
      raise exception 'subscription: cannot activate from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'active';
    -- Open a period PER SUBJECT on its own cycle, where there is none / it
    -- already lapsed.
    update public.subscription_subjects ss
       set current_period_start = coalesce(ss.current_period_start, now()),
           current_period_end   = now() + case coalesce(ss.interval, v_sub.interval)
                                            when 'week'  then interval '7 days'
                                            when 'month' then interval '30 days'
                                            else              interval '365 days'
                                          end
     where ss.child_subscription_id = p_subscription_id
       and (ss.current_period_end is null or ss.current_period_end <= now());
    get diagnostics v_touched = row_count;
    update public.child_subscriptions
       set status = 'active',
           current_period_start = coalesce(current_period_start, now()),
           updated_at = now()
     where id = p_subscription_id;
    -- A subscription with no subject rows has nothing for the trigger to
    -- derive from; keep the historical direct write for that degenerate case.
    if v_touched = 0 and (v_end is null or v_end <= now()) then
      update public.child_subscriptions
         set current_period_end = now() + case v_sub.interval
                                            when 'week'  then interval '7 days'
                                            when 'month' then interval '30 days'
                                            else              interval '365 days'
                                          end
       where id = p_subscription_id;
    end if;

  elsif p_action = 'cancel' then
    if v_from not in ('trialing', 'active', 'past_due') then
      raise exception 'subscription: cannot cancel from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'canceled';
    -- Canceled keeps access until the period end (web parity).
    update public.child_subscriptions
       set status = 'canceled', updated_at = now()
     where id = p_subscription_id;

  elsif p_action = 'expire' then
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot expire from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'expired';
    update public.subscription_subjects
       set current_period_end = now()
     where child_subscription_id = p_subscription_id;
    get diagnostics v_touched = row_count;
    update public.child_subscriptions
       set status = 'expired', updated_at = now()
     where id = p_subscription_id;
    if v_touched = 0 then
      update public.child_subscriptions
         set current_period_end = now() where id = p_subscription_id;
    end if;

  else -- extend
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot extend from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    if p_days is null or p_days < 1 or p_days > 730 then
      raise exception 'subscription: days must be 1..730' using errcode = 'check_violation',
        hint = 'bad_days';
    end if;
    -- Extend from NOW when the subject's period already lapsed, else from its
    -- end — per subject, so a yearly subject is not pulled back to a weekly's
    -- date and vice versa.
    update public.subscription_subjects ss
       set current_period_end =
             greatest(coalesce(ss.current_period_end, now()), now())
             + make_interval(days => p_days)
     where ss.child_subscription_id = p_subscription_id;
    get diagnostics v_touched = row_count;
    if v_touched = 0 then
      update public.child_subscriptions
         set current_period_end =
               greatest(coalesce(v_sub.current_period_end, now()), now())
               + make_interval(days => p_days),
             updated_at = now()
       where id = p_subscription_id;
    end if;
  end if;

  -- Coverage end after the fan-out (the trigger already wrote it).
  select current_period_end into v_end
  from public.child_subscriptions where id = p_subscription_id;

  -- Reconcile the child's cached access flag for THIS student (same rules as
  -- recompute_child_access(), applied to one row so the UI is instantly right).
  update public.students s
     set access_status = case
           when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and (cs.status in ('trialing','active','past_due')
                    or (cs.status = 'canceled' and cs.current_period_end > now()))
               and (cs.current_period_end is null or cs.current_period_end > now())
           ) then (
             case when exists (
               select 1 from public.child_subscriptions cs
               where cs.student_profile_id = s.profile_id and cs.status = 'trialing'
                 and (cs.current_period_end is null or cs.current_period_end > now())
             ) then 'trialing'::public.child_access_status
             else 'active'::public.child_access_status end)
           else 'expired'::public.child_access_status
         end
   where s.profile_id = v_student;

  -- Self-auditing (same mechanism as admin_upsert_subject_price).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.subscription.' || p_action, 'child_subscriptions', p_subscription_id,
     jsonb_build_object(
       'from_status', v_from,
       'to_status', v_to,
       'days', p_days,
       'period_end', v_end,
       'student_profile_id', v_student),
     (case when p_action in ('expire', 'cancel') then 'warning' else 'info' end)::public.audit_severity,
     true);

  return jsonb_build_object(
    'id', p_subscription_id,
    'from_status', v_from,
    'status', v_to,
    'current_period_end', v_end);
exception
  when unique_violation then
    -- uq_child_subscriptions_live: this child already has another live sub.
    raise exception 'subscription: child already has a live subscription'
      using errcode = 'unique_violation', hint = 'duplicate_live_subscription';
end;
$$;
revoke all on function public.admin_manage_child_subscription(uuid, text, int) from public, anon;
grant execute on function public.admin_manage_child_subscription(uuid, text, int) to authenticated, service_role;

-- =============================================================================
-- Mid-cycle PLAN CHANGE billing (migration 078, per-subject since 109).
-- Owner-approved model:
--   ADD         -> immediate access and a FULL first cycle, charged in full.
--                  Proration is RETIRED: with per-subject periods there is no
--                  shared period left to prorate into, and the subject receives
--                  the whole cycle it pays for. subscription_changes keeps its
--                  shape (remaining_ratio = 1, period_days = null) so a charge
--                  stays reconstructible for disputes.
--   REMOVE      -> never refunds. Access runs to THAT SUBJECT'S own period end
--                  (subscription_subjects.remove_at) and the subject drops out
--                  of the next invoice.
--   REINSTATE   -> (migration 120) choosing a removal-scheduled subject again
--                  BEFORE its coverage lapses is an UN-CANCEL, not a purchase:
--                  remove_at is cleared and NOTHING else changes -- same cycle,
--                  same price, same period, ZERO charged. Once the period HAS
--                  lapsed it is a genuine ADD again. This is the standard
--                  behaviour of every subscription platform (Stripe
--                  cancel_at_period_end = false, Chargebee "remove scheduled
--                  cancellation", Recurly "reactivate"): billing a parent a
--                  second full period for coverage they already own directly
--                  contradicts the no-refund REMOVE rule above.
--   PLAN CHANGE -> a different cycle for an already-paid subject is SCHEDULED
--                  into pending_interval and applies at that subject's renewal.
--                  One rule in both directions: no refund, no surprise charge.
--                  A reinstatement onto a DIFFERENT cycle is exactly this, not
--                  an instant switch.
-- quote_plan_change() is the SINGLE source of the math and apply_plan_change()
-- calls it, so the previewed price can never drift from the applied one (audit
-- H7). Amounts are never accepted from a client. Since 120 the add / reinstate
-- / covered split is likewise ONE expression -- plan_change_states() below --
-- read by both, because the two hand-copied `not exists (... remove_at is
-- null)` predicates it replaced were what made an un-cancel bill as an add.
--
-- Migration 118 DROPPED the quote_subject_change / apply_subject_change
-- add/remove wrappers. They composed a per-subject basket in SQL — a second
-- implementation of "which cycle does a kept subject keep?" that had to match
-- quote_plan_change exactly and mis-billed silently when it drifted — and they
-- were the last reachable route into the retired shared-cycle model. A caller
-- that has only subject ids now has its basket derived SERVER-SIDE, once, in
-- web-app/src/lib/auth/subscriptionCore.ts (readLivePlan / derivePlanItems),
-- and reaches this same pair like every other caller. 013 check 105 asserts
-- both wrappers stay gone.
-- =============================================================================

create or replace function public.plan_change_states(
  p_child_subscription_id uuid,
  p_items                 jsonb
)
returns table (
  subject_id uuid,
  "interval" public.plan_interval,
  state      text,
  period_end timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.subject_id,
         n.interval,
         case
           when ss.subject_id is null then 'add'
           when ss.remove_at is null  then 'covered'
           -- NOT LAPSED = still paid for, so choosing it again is an un-cancel.
           -- NULL on both sides is not a future date and falls through to
           -- 'add', which is right: remove_at was itself set to now() when
           -- neither period end existed, so that coverage is already over.
           when coalesce(ss.current_period_end, cs.current_period_end) > now()
             then 'reinstate'
           else 'add'
         end::text as state,
         -- The coverage a covered/reinstated subject KEEPS. NULL for a true
         -- add: it has no period yet, it opens one at now().
         case
           when ss.subject_id is null then null::timestamptz
           when ss.remove_at is null
             or coalesce(ss.current_period_end, cs.current_period_end) > now()
             then coalesce(ss.current_period_end, cs.current_period_end)
           else null::timestamptz
         end as period_end
  from public.plan_items_normalize(p_items) n
  left join public.child_subscriptions cs
    on cs.id = p_child_subscription_id
  left join public.subscription_subjects ss
    on ss.child_subscription_id = p_child_subscription_id
   and ss.subject_id = n.subject_id
$$;

comment on function public.plan_change_states(uuid, jsonb) is
  'Migration 120: classifies each desired basket entry against the live subscription as covered / reinstate / add, and returns the coverage end it keeps. A row SCHEDULED for removal whose period has not lapsed is a REINSTATEMENT (un-cancel): clear remove_at and nothing else, charge zero. Read by BOTH quote_plan_change and apply_plan_change so the preview and the charge cannot disagree about what is an add.';

-- -----------------------------------------------------------------------------
-- Migration 127: a payment authorises a CHANGE, not a WORLD.
-- plan_change_delta names the change a desired basket represents;
-- plan_delta_project replays it against coverage as it is NOW. Together they
-- are why a checkout redeemed an hour later can no longer un-cancel a subject
-- the parent has since cancelled, or remove one they have since added.
-- -----------------------------------------------------------------------------

create or replace function public.plan_change_delta(
  p_child_subscription_id uuid,
  p_items                 jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sub as (
    -- ALIASED, not `cs.interval`. The implicit output name would be `interval`,
    -- which the parser also reads as the start of a type in several positions;
    -- plan_items_normalize already had to quote it in a RETURNS TABLE for that
    -- reason. Naming it here costs nothing and removes the question.
    select cs.id, cs.interval as default_iv
    from public.child_subscriptions cs
    where cs.id = p_child_subscription_id
  ), st as (
    select s.subject_id, s.interval, s.state
    from public.plan_change_states(p_child_subscription_id, p_items) s
  ), live as (
    -- Coverage as it stands: a row scheduled for removal is NOT live, which is
    -- what makes an un-cancel a 'reinstate' op below rather than a no-op.
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, (select sub.default_iv from sub)) as eff
    from public.subscription_subjects ss
    where ss.child_subscription_id = p_child_subscription_id
      and ss.remove_at is null
  ), ops as (
    -- What the parent asked to GAIN. 'add' is the priced half; 'reinstate' is
    -- free (migration 120) and carries the DESIRED cycle, so un-cancelling onto
    -- another cycle survives the round trip.
    select st.subject_id, st.interval::text as iv,
           case when st.state = 'add' then 'add' else 'reinstate' end as op
    from st
    where st.state in ('add', 'reinstate')
    union all
    -- A cycle move on a subject that stays. Scheduled, never charged.
    select st.subject_id, st.interval::text, 'cycle'
    from st
    join live on live.subject_id = st.subject_id
    where st.state = 'covered'
      and st.interval::text is distinct from live.eff::text
    union all
    -- What the parent asked to DROP: live now and absent from the desired set.
    select live.subject_id, null::text, 'remove'
    from live
    where not exists (
      select 1 from public.plan_items_normalize(p_items) n
      where n.subject_id = live.subject_id)
  )
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'subject_id', ops.subject_id, 'op', ops.op, 'interval', ops.iv)
             order by ops.op, ops.subject_id),
           '[]'::jsonb)
  from ops;
$$;

comment on function public.plan_change_delta(uuid, jsonb) is
  'Migration 127: the CHANGE a desired basket represents against the live subscription, as [{subject_id, op, interval}] with op in add|reinstate|cycle|remove. Derived from plan_change_states, the same classifier quote_plan_change and apply_plan_change read, so the frozen change and the priced change are one thing. Frozen on checkout_sessions.intent_delta and replayed by plan_delta_project.';

revoke all on function public.plan_change_delta(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_change_delta(uuid, jsonb) to service_role;


create or replace function public.plan_delta_project(
  p_child_subscription_id uuid,
  p_delta                 jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sub as (
    -- See plan_change_delta: aliased so the CTE never exposes a column literally
    -- called `interval`.
    select cs.id, cs.interval as default_iv
    from public.child_subscriptions cs
    where cs.id = p_child_subscription_id
  ), d as materialized (
    -- Shape-validated on the way in. A malformed entry is DROPPED rather than
    -- guessed at: the delta is our own frozen writing, so anything unreadable is
    -- corruption, and acting on corruption is how a payment delivers a plan
    -- nobody chose. The empty result then fails loudly in apply_plan_change
    -- (last_subject) instead of quietly doing something else.
    --
    -- MATERIALIZED, deliberately. The uuid cast sits in the target list and the
    -- shape test sits in the WHERE, and "the WHERE runs first" is a planner
    -- behaviour rather than a promise. Pinning the CTE keeps the filter and the
    -- cast in the order they are written, so a corrupt entry is dropped instead
    -- of raising 22P02 out of a redemption.
    select (e.v ->> 'subject_id')::uuid as subject_id,
           nullif(e.v ->> 'interval', '') as iv,
           e.v ->> 'op' as op
    from jsonb_array_elements(coalesce(p_delta, '[]'::jsonb)) as e(v)
    where jsonb_typeof(e.v) = 'object'
      and coalesce(e.v ->> 'subject_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and coalesce(e.v ->> 'op', '') in ('add', 'reinstate', 'cycle', 'remove')
      and (e.v ->> 'op' = 'remove'
           or coalesce(e.v ->> 'interval', '') in ('week', 'month', 'year'))
  ), live as (
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, (select sub.default_iv from sub))::text as eff
    from public.subscription_subjects ss
    where ss.child_subscription_id = p_child_subscription_id
      and ss.remove_at is null
  ), kept as (
    select live.subject_id,
           coalesce((select d.iv from d
                      where d.subject_id = live.subject_id
                        and d.op in ('cycle', 'add', 'reinstate')
                      limit 1),
                    live.eff) as iv
    from live
    where not exists (
      select 1 from d where d.subject_id = live.subject_id and d.op = 'remove')
  ), regained as (
    select d.subject_id, d.iv
    from d
    where d.op in ('add', 'reinstate')
      and d.iv is not null
      and not exists (select 1 from live where live.subject_id = d.subject_id)
  ), basket as (
    select subject_id, iv from kept
    union all
    select subject_id, iv from regained
  )
  select coalesce(
           jsonb_agg(jsonb_build_object('subject_id', basket.subject_id,
                                        'interval',   basket.iv)),
           '[]'::jsonb)
  from basket;
$$;

comment on function public.plan_delta_project(uuid, jsonb) is
  'Migration 127: replays a frozen plan_change delta against coverage AS IT IS NOW and returns the absolute basket the plan RPCs take. Live subjects are kept (so a subject added after the intent is never removed by it), a frozen remove drops one only while it is still live, and a frozen add/reinstate is re-injected -- so a cancellation the parent made after opening the checkout survives the payment instead of being silently withdrawn by it.';

revoke all on function public.plan_delta_project(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_delta_project(uuid, jsonb) to service_role;

create or replace function public.quote_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub        public.child_subscriptions%rowtype;
  v_owner      uuid;
  v_rank       int;
  v_pct        numeric(5,2);
  v_cur_base   numeric(12,2);
  v_next_base  numeric(12,2);
  v_added_base numeric(12,2);
  v_due        numeric(12,2) := 0;
  v_items      jsonb;
  v_groups     jsonb;
  v_renewals   jsonb;
  v_removals   jsonb;
  v_restores   jsonb;
  v_changes    jsonb;
  v_ivs        int;
  v_remaining  int;
  -- Migration 127: a trial is running only while its end is in the FUTURE.
  v_trialing   boolean;
  -- Migration 127: the ADDS, named, so an intent can freeze the CHANGE the
  -- parent authorised instead of a snapshot of the whole plan.
  v_adds       jsonb;
  -- Round 8: how many of the ADDS have no active price. See the guard below.
  v_missing    int;
begin
  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;
  v_owner := v_sub.owner_parent_profile_id;

  -- ROUND 8 -- AN ADD WITH NO PRICE MUST NOT BE PRICED AT ZERO AND DROPPED.
  --
  -- Every pricing read below is an INNER JOIN on subjects_pricing wrapped in
  -- coalesce(sum(...), 0), so a subject whose pricing row is missing or has
  -- been deactivated does not raise -- it silently vanishes from items, adds,
  -- added_base and due_now. The sibling function quote_child_plan has always
  -- RAISED on exactly this condition, which is why the plan_start branch of
  -- redemption was safe and this one was not.
  --
  -- What that asymmetry cost, in the window between SIGNING an intent and
  -- REDEEMING it: the frozen delta names [add Math, add English] and the
  -- English price is deactivated in between. plan_change_delta re-derives the
  -- SAME delta (it reads coverage and cycles, never pricing), so the delivery
  -- test passes; the re-price comes back at half, which is neither null nor
  -- zero, so no_longer_payable does not fire either; the honour rule then
  -- charges the frozen full price and apply_plan_change delivers one subject.
  -- The family pays for two and receives one, and delivered_items records both.
  --
  -- Scoped to state = 'add' AND NOTHING WIDER. A live subject whose price was
  -- later withdrawn must still be removable, renewable and reinstatable -- a
  -- parent who cannot even CANCEL because we withdrew a price is a worse
  -- failure than the one being fixed. reinstate, cycle and remove never read
  -- subjects_pricing in the quote or in the apply, so they are unaffected.
  select count(*) into v_missing
  from public.plan_change_states(v_sub.id, p_items) s
  where s.state = 'add'
    and not exists (
      select 1 from public.subjects_pricing sp
      where sp.subject_id = s.subject_id
        and sp.interval   = s.interval
        and sp.status     = 'active');
  if v_missing > 0 then
    raise exception 'plan_change: missing pricing for % subject(s)', v_missing
      using errcode = 'check_violation', hint = 'missing_pricing';
  end if;

  -- MIGRATION 127 -- A LAPSED TRIAL IS NOT A TRIAL.
  --
  -- `status = 'trialing'` alone was read as "a trial is running", and the
  -- status is swept by a job rather than by the clock. A subscription whose
  -- trial_ends_at had already passed therefore priced every addition at ZERO
  -- and applied it as trial-time, for as long as the row stayed stale -- a
  -- free paid period bounded by nothing but a cron schedule.
  --
  -- It also closes the second edge in the same line: apply_plan_change caps a
  -- trial-time add at trial_ends_at, and with this predicate that value is
  -- proven non-null and in the future, so an add can no longer be applied
  -- free with an end date that has already gone by (paid nothing, received
  -- nothing). apply_plan_change computes the SAME predicate, which is what
  -- keeps the preview and the charge one computation (audit H7).
  v_trialing := v_sub.status = 'trialing'
                and v_sub.trial_ends_at is not null
                and v_sub.trial_ends_at > now();

  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- CURRENT recurring set = live subjects, each priced on ITS OWN cycle.
  select coalesce(sum(sp.price_amount), 0) into v_cur_base
  from public.subscription_subjects ss
  join public.subjects_pricing sp
    on sp.subject_id = ss.subject_id
   and sp.interval = coalesce(ss.interval, v_sub.interval)
   and sp.status = 'active'
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null;

  -- ADDS = desired subjects that are GENUINELY NEW: no row at all, or a row
  -- whose coverage has already lapsed. Each buys a FULL first cycle (proration
  -- retired -- see the file header). A subject merely SCHEDULED for removal is
  -- NOT an add (migration 120): it is paid for to its period end, so choosing
  -- it again is a REINSTATEMENT and costs nothing.
  select coalesce(sum(sp.price_amount), 0) into v_added_base
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subjects_pricing sp
    on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
  where s.state = 'add';

  -- NEXT recurring set = the desired set, priced on the desired cycles.
  select coalesce(sum(sp.price_amount), 0) into v_next_base
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id, 'interval', n.interval,
           'price', sp.price_amount, 'currency', v_sub.currency))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  with g as (
    select n.interval as iv, count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt, 'base', g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         count(*)::int
    into v_groups, v_ivs
  from g;

  -- due_now: the TRUE ADDS only, at the sibling rate, rounded per cycle group.
  -- A trial charges nothing (the adds ride the trial like every other subject),
  -- and so does a reinstatement -- there is nothing to buy back.
  --
  -- MIGRATION 126 -- THIS ZERO IS NOW TRUE. It was a claim the apply side did
  -- not honour: apply_plan_change anchored an add at now() + its FULL cycle
  -- whatever the subscription status, so adding a yearly subject on day one of
  -- a seven-day trial bought a year of access for nothing -- repeatably, with
  -- no obligation recorded anywhere and no renewal path that could ever collect
  -- it. The apply now ends a trial-time add at the TRIAL END, which is what
  -- 'rides the trial' has always said. The trial stays a bounded free window;
  -- it can no longer become a free PAID period.
  if not v_trialing then
    with g as (
      select s.interval as iv, coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
      from public.plan_change_states(v_sub.id, p_items) s
      join public.subjects_pricing sp
        on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
      where s.state = 'add'
      group by s.interval)
    select coalesce(sum(g.base - round(g.base * v_pct / 100.0, 2)), 0) into v_due from g;
  end if;

  -- Per-cycle renewal sentences, built from the DESIRED basket. Reading the
  -- STORED rows here is what told a parent who had just moved a subject to
  -- yearly that they would renew at the WEEKLY amount: p_items already carries
  -- the chosen cycle (and, for an untouched subject, its pending_interval), so
  -- the sentence describes the plan the parent is about to have instead of the
  -- one they are leaving.
  -- An already-covered subject renews at ITS OWN period end, a REINSTATED one
  -- at the period end it never lost, and a newly added one opens a full cycle
  -- at now() -- which is exactly what apply_plan_change writes. The branch is
  -- on the STATE, not on a null period_end: a legacy covered row with no period
  -- anywhere must keep reporting no date rather than be given a guessed one.
  with r as (
    select s.interval as iv,
           -- MIGRATION 126: while the plan is TRIALING an add does not open a
           -- full cycle -- it rides the trial and ends with it (see
           -- apply_plan_change). Telling a parent 'renews in a year' about a
           -- subject added on day two of a seven-day trial was the sentence
           -- that made the free-forever add look legitimate.
           min(case
                 when s.state = 'add' and v_trialing
                   then v_sub.trial_ends_at
                 when s.state = 'add'
                   then now() + case s.interval
                                  when 'week'  then interval '7 days'
                                  when 'month' then interval '1 month'
                                  else              interval '1 year'
                                end
                 else s.period_end
               end) as next_at,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_change_states(v_sub.id, p_items) s
    join public.subjects_pricing sp
      on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
    group by s.interval)
  select jsonb_agg(jsonb_build_object(
           'interval', r.iv, 'next_at', r.next_at,
           'total', r.base - round(r.base * v_pct / 100.0, 2)))
    into v_renewals from r;

  -- REMOVES = covered but absent from the desired set; each keeps access to ITS
  -- OWN period end (never the subscription's).
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'remove_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_removals
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and not exists (
      select 1 from public.plan_items_normalize(p_items) n
      where n.subject_id = ss.subject_id);

  -- REINSTATEMENTS = scheduled for removal, chosen again BEFORE that coverage
  -- lapsed. Nothing is charged, the period is untouched, and the subject simply
  -- renews on its own date as if the removal had never been scheduled. The UI
  -- reads this list so it can stop calling an un-cancel an "addition" and stop
  -- opening a payment sheet for it.
  select jsonb_agg(jsonb_build_object(
           'subject_id', s.subject_id,
           'interval', coalesce(ss.interval, v_sub.interval),
           'renews_at', s.period_end))
    into v_restores
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subscription_subjects ss
    on ss.child_subscription_id = v_sub.id
   and ss.subject_id = s.subject_id
  where s.state = 'reinstate';

  -- PLAN CHANGES = still covered -- live OR being reinstated -- with a different
  -- cycle; scheduled, never charged. Reinstating a subject onto another cycle
  -- is a CYCLE CHANGE like any other: it applies at that subject's own renewal,
  -- never immediately, so the period it is paid on is never overwritten.
  -- The comparison basis is the EFFECTIVE cycle -- pending_interval when one is
  -- already scheduled -- so re-selecting the ORIGINAL cycle is itself a change
  -- (it CANCELS the schedule). Comparing against ss.interval alone locked in a
  -- parent who mis-clicked 'yearly': the diff came back empty, Save stayed
  -- disabled and nothing could unschedule the change.
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'from', coalesce(ss.pending_interval, ss.interval, v_sub.interval),
           'to', s.interval,
           'effective_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_changes
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subscription_subjects ss
    on ss.child_subscription_id = v_sub.id
   and ss.subject_id = s.subject_id
  where s.state in ('covered', 'reinstate')
    and s.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval);

  -- MIGRATION 127 -- WHAT THIS SAVE ACTUALLY BUYS, as its own list.
  -- checkout_intent_open freezes it (plan_change_delta), and redemption
  -- projects it onto CURRENT coverage. Derived from the SAME classifier the
  -- pricing above uses, so the thing that is delivered and the thing that was
  -- priced cannot be two different sets.
  select jsonb_agg(jsonb_build_object(
           'subject_id', s.subject_id, 'interval', s.interval,
           'price', sp.price_amount))
    into v_adds
  from public.plan_change_states(v_sub.id, p_items) s
  join public.subjects_pricing sp
    on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
  where s.state = 'add';

  v_remaining := greatest(0, ceil(
    extract(epoch from (coalesce(v_sub.next_renewal_at, v_sub.current_period_end, now()) - now())) / 86400.0)::int);

  return jsonb_build_object(
    'items',    coalesce(v_items, '[]'::jsonb),
    'groups',   coalesce(v_groups, '{}'::jsonb),
    'renewals', coalesce(v_renewals, '[]'::jsonb),
    'removals_effective', coalesce(v_removals, '[]'::jsonb),
    -- Migration 120: the un-cancels in this basket. Additive on purpose --
    -- already-shipped parsers whitelist the fields they read and ignore it.
    'reinstatements', coalesce(v_restores, '[]'::jsonb),
    'plan_changes', coalesce(v_changes, '[]'::jsonb),
    -- Migration 127, both additive: the TRUE adds this save buys, and the
    -- sibling RANK behind discount_percent -- the parent is shown the saving
    -- and which child earned it, never a silently smaller number.
    'adds', coalesce(v_adds, '[]'::jsonb),
    'rank', v_rank,
    'trialing', v_trialing,
    'mixed', coalesce(v_ivs, 0) > 1,
    -- Legacy contract keys: the web/BFF/mobile parsers still read these.
    'subscription_id',        v_sub.id,
    'status',                 v_sub.status,
    'interval',               v_sub.interval,
    'currency',               v_sub.currency,
    'discount_percent',       v_pct,
    'current_recurring_total', v_cur_base - round(v_cur_base * v_pct / 100.0, 2),
    'new_recurring_total',    v_next_base - round(v_next_base * v_pct / 100.0, 2),
    'due_now',                v_due,
    'prorated',               false,
    'proration_waived',       false,
    'added_base',             v_added_base,
    'remaining_ratio',        1,
    'days_remaining',         v_remaining,
    'period_days',            null,
    -- effective_from = the NEXT CHARGE date, which is what next_renewal_at (the
    -- MIN) genuinely means; the per-subject dates a cycle change takes effect on
    -- are in plan_changes[].effective_at.
    'effective_from',         coalesce(v_sub.next_renewal_at, v_sub.current_period_end),
    -- LEGACY SCALAR, superseded by removals_effective[] above. It used to be the
    -- subscription MIN, so removing a YEARLY subject from a plan that also held
    -- a weekly one told the parent access ended in 7 days while the DB granted a
    -- year. It is now the last of the REMOVED subjects' own dates, so an
    -- already-shipped binary can only ever overstate, never cut access short.
    'removals_effective_at',  coalesce(
      (select max((e.v ->> 'remove_at')::timestamptz)
         from jsonb_array_elements(coalesce(v_removals, '[]'::jsonb)) as e(v)),
      v_sub.next_renewal_at, v_sub.current_period_end));
end;
$$;

comment on function public.quote_plan_change(uuid, jsonb) is
  'Migration 109/120/126/127: diffs a DESIRED full per-subject basket against the live subscription into adds / reinstatements / removes / plan_changes and prices it. due_now = the TRUE adds'' full first cycles at the sibling rate (proration retired); un-cancelling a scheduled removal before its period lapses costs nothing, and a cycle change costs nothing now and applies at that subject''s renewal. Migration 127: a trial counts as running only while trial_ends_at is in the FUTURE (a swept-late status can no longer make every addition free), and the answer additionally carries adds[], rank and trialing -- the first so a checkout can freeze the CHANGE rather than a snapshot, the second so the parent sees which child earned the discount.';

create or replace function public.apply_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb,
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote    jsonb;
  v_sub      public.child_subscriptions%rowtype;
  v_actor    uuid := public.current_profile_id();
  v_pct      numeric(5,2);
  v_before   numeric(12,2);
  v_after    numeric(12,2);
  v_left     int;
  v_prior    jsonb;
  v_adds     int;
  v_restores int;
  v_changes  int;
  v_row      record;
  -- Migration 127: the same predicate quote_plan_change computes.
  v_trialing boolean;
begin
  -- Replay guard: the same batch key returns the original outcome untouched.
  -- A reinstatement participates: it writes a ledger row under the same key, so
  -- a retried batch short-circuits here instead of re-running.
  if p_idempotency_key is not null then
    select jsonb_build_object('idempotent', true, 'applied_at', min(created_at))
      into v_prior
    from public.subscription_changes
    where idempotency_key = p_idempotency_key
      and student_profile_id = p_student_profile_id
    having count(*) > 0;
    if v_prior is not null then return v_prior; end if;
  end if;

  -- ONE source of truth for the numbers (preview == charged, audit H7).
  v_quote := public.quote_plan_change(p_student_profile_id, p_items);

  -- ...and ONE source of truth for WHAT IS AN ADD (migration 120). The quote
  -- priced with this exact classifier, so the preview and the charge cannot
  -- disagree about which subjects are bought and which are merely un-cancelled.
  select (count(*) filter (where s.state = 'add'))::int,
         (count(*) filter (where s.state = 'reinstate'))::int
    into v_adds, v_restores
  from public.plan_change_states((v_quote->>'subscription_id')::uuid, p_items) s;
  v_changes := jsonb_array_length(v_quote->'plan_changes');

  -- Round 48/51 kill switch: while payments are off a parent may still REMOVE
  -- subjects (never trap someone into paying), but may not ADD one — and a
  -- cycle change is a billing change, so it is blocked too.
  -- A REINSTATEMENT is deliberately absent from this condition: it moves no
  -- money and only restores coverage the parent has already paid for, so
  -- blocking it would trap them inside a cancellation they want to undo —
  -- precisely the failure mode the removal carve-out above exists to avoid.
  if v_adds > 0 or v_changes > 0 then
    perform public.assert_payments_enabled();
  end if;

  select * into v_sub from public.child_subscriptions
  where id = (v_quote->>'subscription_id')::uuid
  for update;

  -- MIGRATION 127 -- A LAPSED TRIAL IS NOT A TRIAL. Identical to the
  -- predicate quote_plan_change uses; see the long note there. Computing it
  -- once here also proves trial_ends_at is non-null and in the FUTURE, which
  -- is what lets the ADD loop below use it directly instead of a coalesce
  -- chain that could land on an already-expired date.
  v_trialing := v_sub.status = 'trialing'
                and v_sub.trial_ends_at is not null
                and v_sub.trial_ends_at > now();

  v_pct    := (v_quote->>'discount_percent')::numeric;
  v_before := (v_quote->>'current_recurring_total')::numeric;
  v_after  := (v_quote->>'new_recurring_total')::numeric;

  -- ---- removals: keep access to THIS SUBJECT'S own period end --------------
  -- 'covered' IS "a live row that the desired basket keeps", so this is the
  -- same count the hand-written subquery produced, read from the one classifier.
  select (count(*) filter (where s.state = 'covered'))::int into v_left
  from public.plan_change_states(v_sub.id, p_items) s;
  if v_left < 1 and v_adds < 1 and v_restores < 1 then
    raise exception 'subject_change: at least one subject must remain'
      using errcode = 'check_violation', hint = 'last_subject';
  end if;

  for v_row in
    select ss.subject_id,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at,
           coalesce(ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not exists (select 1 from public.plan_items_normalize(p_items) n
                       where n.subject_id = ss.subject_id)
  loop
    update public.subscription_subjects
       set remove_at = v_row.ends_at
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'remove',
       v_row.subject_id, v_row.iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- reinstatements: clear remove_at and NOTHING ELSE --------------------
  -- The un-cancel. interval, price_amount, current_period_start and
  -- current_period_end are untouched, so the prepaid time survives and the
  -- subject renews on the date it always had. Zero is charged.
  --
  -- THIS LOOP MUST RUN BEFORE THE CYCLE-CHANGE LOOP: that loop filters on
  -- remove_at is null, so reinstating afterwards would silently drop a cycle
  -- change requested in the same save. It also runs before the ADD loop, which
  -- re-reads the classifier — a subject reinstated here is 'covered' by then
  -- and can never be processed twice.
  for v_row in
    select s.subject_id,
           coalesce(ss.interval, v_sub.interval) as iv
    from public.plan_change_states(v_sub.id, p_items) s
    join public.subscription_subjects ss
      on ss.child_subscription_id = v_sub.id
     and ss.subject_id = s.subject_id
    where s.state = 'reinstate'
  loop
    update public.subscription_subjects
       set remove_at = null
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    -- prorated_amount = 0, always. The ledger is what a payment provider will
    -- reconcile against, and no money moves here.
    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'reinstate',
       v_row.subject_id, v_row.iv, now(), 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- additions: a NEW full cycle anchored at now() -----------------------
  -- TRUE adds only: no row at all, or a row whose coverage already lapsed. The
  -- on-conflict branch below therefore only ever fires for a LAPSED row, where
  -- resetting the period is exactly right — it genuinely is a new subscription.
  for v_row in
    select s.subject_id, s.interval as iv, sp.price_amount
    from public.plan_change_states(v_sub.id, p_items) s
    join public.subjects_pricing sp
      on sp.subject_id = s.subject_id and sp.interval = s.interval and sp.status = 'active'
    where s.state = 'add'
  loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub.id, v_row.subject_id, v_row.iv, v_row.price_amount, v_sub.currency,
       now(),
       -- MIGRATION 126 -- A TRIAL-TIME ADD ENDS WITH THE TRIAL.
       --
       -- quote_plan_change prices a trialing add at ZERO and has always said it
       -- 'rides the trial like every other subject'. This line did the
       -- opposite: it opened a FULL cycle anchored at now(), so a yearly
       -- subject added on day one of a seven-day trial was a free year --
       -- repeatable, unrecorded and uncollectable, because nothing in the
       -- platform charges at a trial end or a period end and card-on-file is
       -- not approved by the bank yet (AZCDF-100303). A zero we have no way to
       -- bill later may only buy a period that ENDS, never one that outlives
       -- the window that justified it.
       --
       -- create_child_plan already writes exactly this for the opening basket,
       -- so the rule is now uniform and one sentence long: WHILE TRIALING,
       -- EVERY SUBJECT PERIOD ENDS AT THE TRIAL END.
       --
       -- MIGRATION 127: v_trialing, not the raw status -- and therefore
       -- trial_ends_at directly. The coalesce chain this replaces existed to
       -- fail closed on a legacy trialing row with no dates; the predicate now
       -- excludes exactly those rows, so they take the paid branch and are
       -- priced, which is the honest answer rather than a period of zero
       -- length granted for free.
       case when v_trialing
              then v_sub.trial_ends_at
            else now() + case v_row.iv
                           when 'week'  then interval '7 days'
                           when 'month' then interval '1 month'
                           else              interval '1 year'
                         end
       end)
    on conflict (child_subscription_id, subject_id) do update
      set remove_at            = null,
          interval             = excluded.interval,
          pending_interval     = null,
          price_amount         = excluded.price_amount,
          current_period_start = excluded.current_period_start,
          current_period_end   = excluded.current_period_end;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'add',
       v_row.subject_id, v_row.iv, now(),
       round(coalesce(v_row.price_amount, 0) * (1 - v_pct / 100.0), 2),
       v_sub.currency, v_before, v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- cycle changes: SCHEDULED only, never a refund, never a charge -------
  -- Reaches a just-reinstated subject too, because the loop above already
  -- cleared its remove_at. That is the whole point of the ordering: a parent
  -- who un-cancels a subject AND moves it to another cycle gets both, and the
  -- cycle still applies at that subject's own renewal rather than immediately.
  for v_row in
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as from_iv,
           coalesce(ss.interval, v_sub.interval) as cur_iv,
           n.interval as to_iv,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at
    from public.subscription_subjects ss
    join public.plan_items_normalize(p_items) n on n.subject_id = ss.subject_id
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and n.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval)
  loop
    -- Choosing the cycle the subject is ALREADY paid on CANCELS a scheduled
    -- change rather than scheduling a no-op, which is the only way back for a
    -- parent who picked the wrong cycle.
    update public.subscription_subjects
       set pending_interval =
             case when v_row.to_iv = v_row.cur_iv then null else v_row.to_iv end
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'plan_change',
       v_row.subject_id, v_row.to_iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- TODO(real-provider): capture (v_quote->>'due_now') through the PSP HERE,
  -- inside this transaction's boundary, then write the resulting payment id
  -- back onto the ledger rows and insert the matching public.payments row.
  -- NEVER accept the amount from a client.

  return v_quote || jsonb_build_object('applied', true, 'charged', false);
end;
$$;

comment on function public.apply_plan_change(uuid, jsonb, text) is
  'Migration 109/120/126/127: applies a DESIRED full per-subject basket atomically — true adds open their own now()-anchored cycle, a subject whose scheduled removal has not yet lapsed is REINSTATED (remove_at cleared, period and price untouched, nothing charged), removals are scheduled for THAT subject''s own period end, cycle changes write pending_interval only. quote_plan_change is the single source of the numbers and plan_change_states of the add/reinstate/covered split; assert_payments_enabled() gates adds and cycle changes while removals and reinstatements stay legal. Migration 127: an add rides the trial only while the trial is genuinely still running (trial_ends_at in the future), so a stale trialing row can neither make an addition free nor open a period that has already ended.';

-- ---- the boundary job: a scheduled cycle actually takes effect --------------
-- Without this, pending_interval is WRITE-ONLY: apply_plan_change stores the
-- parent's choice and nothing in the platform ever moves it into
-- subscription_subjects.interval, so "Riyaziyyat aylıq -> illik" is remembered
-- and never applied. This is the job that applies it, at that subject's own
-- period boundary.
--
-- DELIBERATELY NOT A RENEWAL. There is no payment provider yet (every path here
-- ends at the TODO(real-provider) seam and returns 'charged', false), so this
-- never extends a period, never grants access and never writes a payment --
-- doing so would silently turn every plan into a free perpetual one. It
-- promotes the scheduled cycle and re-freezes the price at the moment the paid
-- period ends, which is precisely the state the future charge has to read.
create or replace function public.apply_due_plan_changes()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_price numeric(12,2);
  v_n     int := 0;
begin
  for v_row in
    select ss.child_subscription_id, ss.subject_id, ss.pending_interval,
           ss.current_period_end, cs.student_profile_id,
           cs.owner_parent_profile_id, cs.currency, cs.sibling_discount_percent
    from public.subscription_subjects ss
    join public.child_subscriptions cs on cs.id = ss.child_subscription_id
    where ss.pending_interval is not null
      and ss.remove_at is null
      and ss.current_period_end is not null
      and ss.current_period_end <= now()
      and cs.status in ('trialing', 'active', 'past_due')
  loop
    select sp.price_amount into v_price
    from public.subjects_pricing sp
    where sp.subject_id = v_row.subject_id
      and sp.interval = v_row.pending_interval
      and sp.status = 'active';
    -- Pricing for the new cycle was archived: LEAVE the schedule in place. Both
    -- alternatives are worse -- dropping it discards the parent's decision, and
    -- promoting it anyway would freeze a NULL price into the next invoice.
    if v_price is null then continue; end if;

    update public.subscription_subjects
       set interval         = v_row.pending_interval,
           pending_interval = null,
           price_amount     = v_price
     where child_subscription_id = v_row.child_subscription_id
       and subject_id = v_row.subject_id;

    -- Ledger row, keyed on the (subject, period end) that fell due, so a second
    -- run inside the same boundary is a no-op instead of a duplicate.
    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency,
       discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_row.child_subscription_id, v_row.student_profile_id,
       v_row.owner_parent_profile_id, 'plan_change', v_row.subject_id,
       v_row.pending_interval, v_row.current_period_end, 0, v_row.currency,
       coalesce(v_row.sibling_discount_percent, 0), 1, null,
       'planroll:' || v_row.child_subscription_id::text || ':'
         || v_row.subject_id::text || ':' || v_row.current_period_end::text,
       null)
    on conflict do nothing;

    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function public.apply_due_plan_changes() is
  'Migration 109: promotes each subject''s SCHEDULED cycle (pending_interval -> interval, price re-frozen) once its own paid period ends. Scheduled hourly in 016. It never extends a period or grants access -- renewal/charging is the unimplemented provider seam -- so its only effect is that a parent''s cycle choice is no longer stored and forgotten.';

revoke all on function public.apply_due_plan_changes() from public, anon, authenticated;
grant execute on function public.apply_due_plan_changes() to service_role;

-- Migration 120 — the add/reinstate/covered classifier both plan RPCs read.
revoke all on function public.plan_change_states(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_change_states(uuid, jsonb) to service_role;

revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;

revoke all on function public.apply_plan_change(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- Migration 098: deleting a parent must not leave orphaned children.
--
-- The FK graph cascades everything except the child itself — `parents` cascades
-- `parent_student_links` away, while `students.created_by_parent_profile_id` is
-- only SET NULL, so the student's profile, credentials and auth user all
-- survive with no link to anyone. The account becomes invisible to every parent
-- surface yet can still sign in. Both existing students were already in exactly
-- that state when this was written.
--
-- Application code (admin `deleteParent`, web `deleteParentAccountCore`) already
-- deleted children first and still does; it simply is not the only route — the
-- Supabase dashboard and psql bypass it entirely. The rule belongs where the
-- deletion happens.
--
-- BEFORE DELETE, not AFTER: the link rows are cascaded away by this very delete,
-- so an AFTER trigger would run with the evidence already gone.
-- -----------------------------------------------------------------------------
create or replace function public.fn_cascade_delete_parent_children()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_children uuid[];
  v_stranded int;
begin
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
  -- Shared children are KEPT and merely unlinked: deleting a live account
  -- because a co-parent left would be worse than the orphan this fixes.
  where not exists (
    select 1
      from public.parent_student_links l2
     where l2.student_profile_id = q.child
       and l2.parent_profile_id <> old.profile_id
  )
  and q.child <> old.profile_id;

  if array_length(v_children, 1) is null then
    return old;
  end if;

  -- Preferred path: the auth user cascades profiles -> students ->
  -- child_credentials -> links, and leaves nothing in auth.users either.
  -- Best-effort: if the owning role ever loses rights here, an exception would
  -- abort the parent's deletion entirely. The public-schema delete below is the
  -- guarantee.
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

  -- Migration 167. Before the guarantee below, refuse if any child's auth user
  -- survived the attempt above.
  --
  -- The guarantee used to run unconditionally, and that is what manufactured
  -- orphans: the FK runs auth.users -> profiles and NOT the reverse, so
  -- deleting the profile while the auth user lives leaves the login perfectly
  -- intact. GoTrue authenticates c<8-digit-id>@children.invalid against
  -- auth.users alone and never consults profiles, so the result is a working
  -- credential with no account behind it. Production accumulated 14 of them,
  -- 9 with a non-null last_sign_in_at, before anyone noticed.
  --
  -- Refusing means the parent's deletion fails loudly and recoverably. That is
  -- the better half of the trade: a loud failure is fixed in minutes, a silent
  -- orphan went unnoticed for two months.
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
  -- (half-finished provisioning). Anything WITH an auth user has already gone
  -- via the cascade above, or we refused.
  delete from public.profiles p where p.id = any(v_children);

  return old;
end;
$fn$;

comment on function public.fn_cascade_delete_parent_children() is
  'Migration 098, hardened by 167: deletes a departing parent''s children '
  '(profiles + auth users) so no orphan child account survives, whatever route '
  'deleted the parent. Children still linked to another parent are kept. '
  'REFUSES rather than deleting a child profile whose auth user survived — that '
  'combination strands a working c<id>@children.invalid login with no account '
  'behind it.';

drop trigger if exists trg_parents_cascade_children on public.parents;
create trigger trg_parents_cascade_children
  before delete on public.parents
  for each row
  execute function public.fn_cascade_delete_parent_children();

-- -----------------------------------------------------------------------------
-- Migration 099: authoritative "is this email already taken?".
--
-- Reading it off the signUp RESPONSE is not sufficient: GoTrue only obfuscates a
-- duplicate (empty `identities`) when the existing account is CONFIRMED. An
-- UNCONFIRMED one is treated as a resend and comes back looking exactly like a
-- first registration — which is how duplicates kept getting through.
--
-- Performance: one equality probe against `idx_users_email` / the unique
-- `users_email_partial_key`. `lower()` is applied to the PARAMETER, never the
-- column — `lower(u.email) = …` would discard the plain index. Verified plan:
-- Index Only Scan.
--
-- Service_role ONLY: this is an account-existence oracle. anon/authenticated are
-- revoked EXPLICITLY because Supabase's default privileges grant EXECUTE on new
-- functions to both.
-- -----------------------------------------------------------------------------
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
-- QUESTION REPORTS ("Report a problem", migration 115).
--
-- The trust boundary in one paragraph: the client sends a question id, a
-- message and two enum-constrained diagnostic hints. Reporter, status, package
-- and attempt context are ALL derived by the BEFORE INSERT trigger below, which
-- is also where the authoritative throttle lives. That is what makes the
-- reporter-can-INSERT policy in 010 safe — WITH CHECK runs AFTER BEFORE
-- triggers, so a hand-rolled PostgREST insert with a forged reporter, status or
-- package produces exactly the row the RPC would. The mobile app reaches
-- PostgREST directly (mobile-app/src/features/tests/api.ts), so a limiter in
-- the RPC or in the web app would have guarded the web path only.
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

-- SECURITY DEFINER because it must resolve a question the reporter cannot
-- SELECT (archived, or inside a private olympiad pool) and must count reports
-- the reporter's own SELECT policy hides once they are closed. search_path is
-- pinned; 013 check 103 asserts anon holds no EXECUTE.
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

  -- The authoritative rate limit: 5 per rolling hour, 20 per rolling day, per
  -- reporter. One indexed count per insert (idx_question_reports_reporter); a
  -- plain SELECT over a different row set, so there is no trigger recursion.
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

-- A report is EVIDENCE: an admin may move its status and add a note, nothing
-- more. A resolved report can never be a rewritten one.
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

drop trigger if exists trg_question_report_freeze on public.question_reports;
create trigger trg_question_report_freeze
  before update on public.question_reports
  for each row execute function public.question_report_freeze();
-- Name ordering matters: PostgreSQL fires BEFORE triggers alphabetically, and
-- trg_question_report_freeze sorts before trg_set_updated_at, so the freeze runs
-- first and updated_at is still stamped afterwards.

-- The app entry point. Validation here is belt to the column CHECKs' braces —
-- a 2 MB body is refused before it is written, not silently truncated.
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

revoke all on function public.submit_question_report(uuid,uuid,text,text,text,text)
  from public, anon;
grant execute on function public.submit_question_report(uuid,uuid,text,text,text,text)
  to authenticated, service_role;
revoke all on function public.question_report_derive() from public, anon, authenticated;
revoke all on function public.question_report_freeze() from public, anon, authenticated;

-- Reports are operational history. 010 grants DELETE on every table to
-- `authenticated`; take it back here (this file runs after 010), so the absent
-- DELETE policy is not the only thing standing between a reporter and their own
-- evidence.
revoke delete on public.question_reports from anon, authenticated;

-- -----------------------------------------------------------------------------
-- question_reports (migrations 117 + 122) — the reporter hears back
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
-- Without DEFINER every notification would fail on EXECUTE. search_path pinned;
-- 013 checks 104 and 109 assert the whole posture.
--
-- WHICH LANGUAGE: question_reports.locale — the UI language the reporter was
-- actually READING when they filed. profiles.preferred_locale is deliberately
-- NOT used, for the same reason web-app/src/lib/auth/reportActions.ts rejected
-- it as the report's own locale source: nothing in web-app or mobile-app ever
-- writes that column, so it is 'az' for everyone and localising by it would be
-- a trilingual gesture that ships one language.
--
-- MIGRATION 122 changed WHAT a closing transition says. "Resolved" and
-- "dismissed" used to send fixed copy — the same sentence for a wrong answer
-- key, a broken image and a misunderstanding, which answers none of them. An
-- administrator now WRITES the answer; question_report_reply_text below frames
-- it, and the notifier requires it and no longer swallows a failed send.

-- ONE definition of what the student receives, called by the trigger that sends
-- it. The admin panel's live preview is a TypeScript port
-- (admin-panel/src/lib/admin/question-report-reply.ts) and is pinned to this
-- text, literal by literal, by admin-panel/src/lib/admin/__tests__/
-- question-report-reply.test.ts — which reads this file and the migration. A
-- preview that quietly disagreed with the send would be worse than no preview:
-- the admin would approve one message and the student would read another.
--
-- TIME = Asia/Baku, the convention throughout this file. Rendering the filing
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

-- Line 88 of 010 default-grants EXECUTE to anon AND authenticated, so all three
-- are named here. Nothing outside the SECURITY DEFINER trigger below calls it.
revoke all on function public.question_report_reply_text(text, timestamptz, text)
  from public, anon, authenticated;

-- THE SEND IS NOT OPTIONAL AND IS NOT SWALLOWED (migration 122, owner decision).
-- Migration 117 wrapped create_notification in `exception when others then raise
-- warning` so a broken inbox could never block triage. That trade was right
-- while the notification was boilerplate and wrong now that it is the admin's
-- actual answer: a report marked resolved whose reply evaporated is a report
-- nobody will ever look at again. A genuine failure now propagates and takes the
-- status change down with it.
--
-- A SUPPRESSED notification is not a failed one. create_notification returns
-- NULL without raising when the recipient has in-app notifications off
-- (priority > 1) and when the idempotency key was already used. Both are normal
-- outcomes and both COMMIT — the reply is still stored on the report either way.
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

-- A trigger function is never called directly by anyone. Line 88 of 010 default-
-- grants EXECUTE to anon AND authenticated, so all three are named here.
revoke all on function public.notify_question_report_status_tg()
  from public, anon, authenticated;

-- =============================================================================
-- CHECKOUT INTENT -> PLAN (migration 125). The four functions that make a
-- PAYMENT cause a GRANT.
--
-- Before 125 the parent checkout applied the plan change FIRST and asked for
-- money AFTERWARDS, and the helper that asked "could only return null -- it
-- never fails the change". A parent could add a 90 AZN yearly subject, confirm,
-- close the tab before paying, and the child had a live year of access with no
-- payments row anywhere. It could not simply be reordered, because
-- checkout_sessions recorded an AMOUNT and never a PURCHASE: a verified payment
-- had nothing to act on. 007 gives the session an intent; these four use it.
--
--   checkout_intent_open   quote + insert in ONE transaction, so the stored
--                          amount is provably the RPC's own number
--   checkout_intent_price  read-only re-quote, run before the redirect is signed
--   checkout_redeem_plan   the ONLY path from a verified payment to a delivered
--                          plan OR olympiad package: re-price, HONOUR the price
--                          that was quoted (migration 127, owner decision),
--                          apply once
--   checkout_flag_redemption  the caller's way to say a follow-up failed
--   checkout_alert_admins  migration 127: the alarm, so "we are holding money we
--                          have not delivered on" reaches a person
--   checkout_reversal_candidates / checkout_revoke_reversed
--                          migration 127: money given BACK must take back what
--                          it bought (see the end of this file)
--
-- NONE OF THEM WRITES `entitlements`. Redemption calls create_child_plan /
-- apply_plan_change like every other caller and lets migration 124's producer
-- triggers mirror the result. A rail that wrote access directly would be the
-- first drift, with no invoice and no ledger row to reconcile against.
--
-- All four are SECURITY DEFINER and service_role-only: they are reachable from
-- the web-app's server actions and the AzeriCard callback, never from a browser.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Migration 127: a redemption that needs a human must reach one. 013 check 118
-- counts them, but 013 is a file somebody runs when they already suspect
-- something -- and money we are holding cannot wait for a suspicion.
-- -----------------------------------------------------------------------------

create or replace function public.checkout_alert_admins(
  p_order  text,
  p_reason text
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_n     int := 0;
begin
  if p_order is null then return 0; end if;
  begin
    for v_admin in
      select a.profile_id from public.lb_notify_audience('administrators', '{}'::jsonb) a
    loop
      perform public.create_notification(
        v_admin,
        'checkout_needs_review',
        'Ödəniş baxış tələb edir',
        -- ROUND 8: the old sentence asserted "the parent's money is with
        -- us", and this function has three callers, one of which is a
        -- gateway REVERSAL -- filed after the money has gone back. An
        -- alarm that states the wrong fact about the money is worse than
        -- one that states none: it tells the operator to go and deliver.
        'Sifariş ' || p_order || ' — səbəb: ' || coalesce(p_reason, 'naməlum') ||
          '. Ödənişin və çatdırılmanın vəziyyətini yoxlayın.',
        jsonb_build_object('order', p_order, 'reason', p_reason),
        array['in_app'],
        'ckrev:' || p_order || ':' || coalesce(p_reason, 'x'),
        1,
        '/subscriptions/checkouts',
        'billing',
        null);
      v_n := v_n + 1;
    end loop;
  exception when others then
    -- Never let the alarm break the thing it is reporting.
    raise warning 'checkout_alert_admins failed: %', sqlerrm;
  end;
  return v_n;
end;
$$;

comment on function public.checkout_alert_admins(text, text) is
  'Migration 127: files a PRIORITY 1 in-app notification to every administrator when a checkout redemption needs a human — money taken and not delivered on, a follow-up that failed after delivery, or a reversal. Priority 1 because create_notification deliberately refuses to let a recipient silence that level. Idempotent per (order, reason, admin); never raises, so a failed notice cannot roll back the decision it reports.';

revoke all on function public.checkout_alert_admins(text, text) from public, anon, authenticated;
grant execute on function public.checkout_alert_admins(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Opening an intent.
-- -----------------------------------------------------------------------------
-- THE ONLY WAY A PAYABLE SESSION COMES INTO EXISTENCE. It quotes and inserts in
-- ONE transaction, so the stored amount is provably the RPC's own number and
-- there is no parameter through which a caller could name a price. The ORDER is
-- minted by the caller (a CSPRNG loop that retries on the unique index of
-- migration 123) and passed in; a collision surfaces here as SQLSTATE 23505 and
-- the caller mints again.
--
-- It takes the SAME family advisory lock create_child_plan takes, so an intent
-- cannot be opened against a plan another tab is creating at that instant.
-- -----------------------------------------------------------------------------
create or replace function public.checkout_intent_open(
  p_student_profile_id uuid,
  p_kind               public.checkout_intent_kind,
  p_items              jsonb,
  p_order              text,
  p_ttl_minutes        int default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_q     jsonb;
  v_due   numeric(12,2);
  v_sub   uuid;
  v_id    uuid;
  v_ttl   int;
  v_exp   timestamptz;
  v_norm  jsonb;
  v_delta jsonb;
  v_kind  text;
  v_pkg   uuid;
begin
  -- The kill switch first: an intent is the first step of a paid write, and a
  -- session opened while payments are off is a charge waiting to happen.
  perform public.assert_payments_enabled();

  -- The gateway's own ORDER shape, mirrored from lib/payments/azericard/format
  -- (6..32 digits; we mint 14). Stated as a range rather than the exact minted
  -- length so this refuses garbage without pinning the mint format, which the
  -- protocol layer owns.
  if p_order is null or p_order !~ '^[0-9]{6,32}$' then
    raise exception 'checkout: malformed order'
      using errcode = 'check_violation', hint = 'bad_order';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'checkout: child has no owning parent'
      using errcode = 'check_violation', hint = 'bad_student';
  end if;

  -- Bounded, and bounded on BOTH sides: a five-minute floor keeps a caller from
  -- opening a session that expires before the bank's own page can be filled in,
  -- and a 24-hour ceiling is what stops a forgotten pending session from being
  -- redeemable by a replayed callback weeks later.
  v_ttl := least(greatest(coalesce(p_ttl_minutes, 1440), 5), 1440);
  v_exp := now() + make_interval(mins => v_ttl);

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  v_kind := 'subscription';

  if p_kind = 'olympiad' then
    -- A DIFFERENT PRODUCT, RECORDED AS ONE. checkout_sessions.kind is what a
    -- reconciliation report reads to tell a subscription from a package from the
    -- owner's protocol test, and a report that cannot tell them apart is a
    -- report nobody can act on.
    v_kind := 'olympiad';
    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) <> 1
       or coalesce(p_items -> 0 ->> 'package_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'checkout: malformed olympiad intent'
        using errcode = 'check_violation', hint = 'bad_items';
    end if;
    v_pkg  := (p_items -> 0 ->> 'package_id')::uuid;
    v_q    := public.quote_olympiad_purchase(p_student_profile_id, v_pkg);
    v_due  := (v_q->>'due_now')::numeric;
    v_sub  := null;
    -- The frozen intent is built from the QUOTE, never echoed from the caller:
    -- the grade is ours to decide, and a caller that could name it could buy a
    -- pool the package does not sell to this child.
    v_norm := jsonb_build_array(jsonb_build_object(
                'package_id', v_pkg,
                'grade_id',   v_q -> 'grade_id'));
  elsif p_kind = 'plan_start' then
    if exists (
      select 1 from public.child_subscriptions
      where student_profile_id = p_student_profile_id
        and status in ('trialing', 'active', 'past_due')
    ) then
      raise exception 'checkout: child already has a live subscription'
        using errcode = 'unique_violation', hint = 'already_subscribed';
    end if;
    v_q   := public.quote_child_plan(p_student_profile_id, p_items);
    v_due := (v_q->>'due_now')::numeric;
    v_sub := null;
    select coalesce(jsonb_agg(jsonb_build_object(
             'subject_id', n.subject_id, 'interval', n.interval)), '[]'::jsonb)
      into v_norm
    from public.plan_items_normalize(p_items) n;
  else
    -- Raises no_data_found when there is no live subscription to change.
    v_q    := public.quote_plan_change(p_student_profile_id, p_items);
    v_due  := (v_q->>'due_now')::numeric;
    v_sub  := (v_q->>'subscription_id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
             'subject_id', n.subject_id, 'interval', n.interval)), '[]'::jsonb)
      into v_norm
    from public.plan_items_normalize(p_items) n;
    -- MIGRATION 127 -- THE CHANGE, NOT THE WORLD. See plan_change_delta. The
    -- basket above is kept as EVIDENCE of what the parent was looking at; this
    -- is what redemption will actually deliver, projected onto whatever the plan
    -- looks like when the money lands.
    v_delta := public.plan_change_delta(v_sub, p_items);
  end if;

  -- A checkout for nothing must not exist. A free change (a removal, a
  -- reinstatement, a scheduled cycle move, a plan that rides a trial, a
  -- zero-priced package) is applied directly by its own action; routing it
  -- through a payment would invent a charge, and a zero-amount signed request is
  -- not a thing the gateway accepts.
  if v_due is null or v_due <= 0 then
    raise exception 'checkout: nothing is due for this change'
      using errcode = 'check_violation', hint = 'nothing_due';
  end if;

  insert into public.checkout_sessions
    (owner_parent_profile_id, kind, child_subscription_id, amount, currency,
     status, provider, provider_session_id,
     intent_kind, student_profile_id, intent_items, intent_delta, intent_quote,
     expires_at)
  values
    (v_owner, v_kind, v_sub, v_due, coalesce(v_q->>'currency', 'AZN'),
     'pending', 'azericard', p_order,
     p_kind, p_student_profile_id, v_norm, v_delta, v_q, v_exp)
  returning id into v_id;

  return jsonb_build_object(
    'checkout_session_id', v_id,
    'order',      p_order,
    'amount',     v_due,
    'currency',   coalesce(v_q->>'currency', 'AZN'),
    'expires_at', v_exp,
    'quote',      v_q);
end;
$$;

comment on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int) is
  'Migration 125/127: opens a PENDING checkout carrying the intent (child, frozen basket, and for a plan_change the frozen CHANGE) and the quote RPC''s OWN due_now. Mutates nothing else — the plan or package is delivered only by checkout_redeem_plan after a verified payment. Migration 127 adds the ''olympiad'' kind, priced by quote_olympiad_purchase and freezing [{package_id, grade_id}]. Raises check_violation/nothing_due for a free change, unique_violation/already_subscribed for a plan_start on a child who already has one, and unique_violation/already_owned for a package the child already holds.';

revoke all on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int)
  from public, anon, authenticated;
grant execute on function public.checkout_intent_open(uuid, public.checkout_intent_kind, jsonb, text, int)
  to service_role;

-- -----------------------------------------------------------------------------
-- 7. Re-pricing an intent, read-only  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Used at SIGNING time, before the parent is sent to the bank, so a stale
-- pending session is never signed for a number that no longer stands. It is the
-- same computation redeem runs; running it here only means the mismatch is
-- caught before money moves instead of after.
create or replace function public.checkout_intent_price(p_order text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_s      public.checkout_sessions%rowtype;
  v_q      jsonb;
  v_due    numeric(12,2);
  v_sub    uuid;
  v_basket jsonb;
  v_pkg    uuid;
  v_grade  uuid;
  v_cur    uuid;
begin
  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order;
  if not found or v_s.intent_kind is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_s.student_profile_id is null then
    return jsonb_build_object('ok', false, 'reason', 'student_gone');
  end if;
  if v_s.expires_at is not null and now() > v_s.expires_at then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  begin
    if v_s.intent_kind = 'olympiad' then
      v_pkg   := nullif(v_s.intent_items -> 0 ->> 'package_id', '')::uuid;
      v_grade := nullif(v_s.intent_items -> 0 ->> 'grade_id', '')::uuid;
      if v_pkg is null then
        return jsonb_build_object('ok', false, 'reason', 'reprice_failed');
      end if;
      v_q := public.quote_olympiad_purchase(v_s.student_profile_id, v_pkg);
      -- AGAINST THE QUOTE'S OWN GRADE, NEVER students.grade_id. A LEGACY
      -- GRADE-LESS package quotes grade_id = NULL -- it sells one pool, not a
      -- grade -- so reading the child's grade column here compared NULL with a
      -- real grade and reported grade_changed for EVERY such purchase: the
      -- parent could never resume a checkout, and the duplicate-purchase guard
      -- (which only fires on the resume path) was defeated with it. Quoting
      -- first makes both sides the same computation, which is also what catches
      -- the mirror case: a package whose target grades moved under a grade-less
      -- intent. checkout_redeem_plan already compares this way.
      v_cur := nullif(v_q ->> 'grade_id', '')::uuid;
      if v_grade is distinct from v_cur then
        -- The child was promoted, or the package's grades moved. Either way the
        -- purchase would snapshot a DIFFERENT pool than the one that was
        -- quoted, and that is a different purchase, not a different price.
        return jsonb_build_object('ok', false, 'reason', 'grade_changed');
      end if;
    elsif v_s.intent_kind = 'plan_start' then
      if exists (
        select 1 from public.child_subscriptions
        where student_profile_id = v_s.student_profile_id
          and status in ('trialing', 'active', 'past_due')
      ) then
        return jsonb_build_object('ok', false, 'reason', 'plan_already_live');
      end if;
      v_q := public.quote_child_plan(v_s.student_profile_id, v_s.intent_items);
    else
      select cs.id into v_sub from public.child_subscriptions cs
      where cs.student_profile_id = v_s.student_profile_id
        and cs.status in ('trialing', 'active', 'past_due')
      order by cs.created_at desc
      limit 1;
      if v_sub is null or v_s.child_subscription_id is distinct from v_sub then
        return jsonb_build_object('ok', false, 'reason', 'subscription_changed');
      end if;
      v_basket := case when v_s.intent_delta is null
                       then v_s.intent_items
                       else public.plan_delta_project(v_sub, v_s.intent_delta) end;
      v_q := public.quote_plan_change(v_s.student_profile_id, v_basket);
      -- IS IT STILL THE SAME DELIVERY? Re-derive the change from the projection
      -- and compare it with the one that was frozen. The amount cannot answer
      -- this: a basket that shrank because another tab already delivered half
      -- of it, and one that grew because a lapsed reinstatement turned into a
      -- paid add, are both "a different number" and neither is a price
      -- movement. Asking HERE costs the parent nothing; the alternative is
      -- taking their money and then telling them a human will be in touch.
      -- A pre-127 session carries no delta, cannot answer the question at all,
      -- and is refused for exactly that reason.
      if public.plan_change_delta(v_sub, v_basket) is distinct from v_s.intent_delta then
        return jsonb_build_object('ok', false, 'reason', 'delivery_changed');
      end if;
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'reprice_failed');
  end;

  v_due := (v_q->>'due_now')::numeric;
  if v_due is distinct from v_s.amount then
    return jsonb_build_object('ok', false, 'reason', 'price_changed',
                              'amount', v_s.amount, 'quoted', v_due);
  end if;
  return jsonb_build_object('ok', true, 'amount', v_s.amount, 'quoted', v_due);
end;
$$;

comment on function public.checkout_intent_price(text) is
  'Migration 125/127: read-only re-quote of a stored intent, for the moment before the redirect is signed. Deliberately STRICT — refusing here costs a parent nothing, which is what makes it safe for redemption to honour a frozen price afterwards. Migration 127 re-prices what redemption will actually deliver (the PROJECTED delta, or the package), refuses a delivery that is no longer the one that was authorised (delivery_changed), and compares the frozen grade against the QUOTE''S grade rather than students.grade_id — reading the column there reported grade_changed for every legacy grade-less package. Returns {ok,reason,amount,quoted}; mutates nothing.';

revoke all on function public.checkout_intent_price(text) from public, anon, authenticated;
grant execute on function public.checkout_intent_price(text) to service_role;

-- -----------------------------------------------------------------------------
-- 8. Redeeming a PAID intent -- the step that grants  (backport -> 011)
-- -----------------------------------------------------------------------------
-- Called from the AzeriCard callback AFTER the signature verified, the TRTYPE=90
-- status query agreed, the transaction identity matched, and the outcome was
-- recorded as approved (which is what sets checkout_sessions.status = 'paid').
-- It refuses to do anything for a session that is not 'paid', so it cannot be
-- turned into a grant path by calling it early.
--
-- EXACTLY ONCE: the row is locked FOR UPDATE and `redeemed_at` is the claim.
-- Both terminal outcomes set it, so a gateway retry, a double callback or a
-- refresh finds a decided row and returns what was decided.
--
-- NOTHING HERE WRITES `entitlements`. It calls create_child_plan /
-- apply_plan_change like every other caller and lets migration 124's producer
-- triggers mirror the result. A rail that wrote access directly would be the
-- first drift, with no invoice and no ledger row to reconcile against.
create or replace function public.checkout_redeem_plan(p_order text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s        public.checkout_sessions%rowtype;
  v_q        jsonb;
  v_due      numeric(12,2);
  v_res      jsonb := '{}'::jsonb;
  v_note     text;
  v_live     uuid;
  v_sub      uuid;
  v_outcome  text;
  v_basket   jsonb;
  v_pkg      uuid;
  v_grade    uuid;
  v_cur      uuid;
  v_honoured boolean := false;
  -- Migration 127: WHAT THIS PAYMENT WILL DELIVER, computed by the redemption
  -- itself from the world as it is now. It answers the only question that
  -- matters before anything is applied -- is this still the delivery the parent
  -- authorised? -- and is then PERSISTED, because a reversal has to take back
  -- what was DELIVERED and not what was once intended.
  v_delivering jsonb;
begin
  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order
  for update;

  if not found then
    return jsonb_build_object('outcome', 'unknown_order');
  end if;
  if v_s.intent_kind is null then
    -- The owner's protocol test, or a pre-125 row. Nothing to deliver, and
    -- inventing an intent for it would be worse than doing nothing.
    return jsonb_build_object('outcome', 'no_intent');
  end if;

  if v_s.redeemed_at is not null then
    return jsonb_build_object(
      'outcome', 'already',
      'redemption_status', v_s.redemption_status,
      'note', v_s.redemption_note,
      'student_profile_id', v_s.student_profile_id);
  end if;

  -- NOT PAID IS NOT A FAILURE. A pending or failed session is simply not
  -- redeemable yet; saying so without touching the row keeps a later genuine
  -- callback able to redeem it.
  if v_s.status <> 'paid' then
    return jsonb_build_object('outcome', 'not_paid', 'status', v_s.status);
  end if;

  if v_s.student_profile_id is null then
    v_note := 'student_gone';
  elsif v_s.expires_at is not null and now() > v_s.expires_at then
    -- Money was taken against an intent whose window closed. Never silently
    -- deliver it (the world has had a day to move) and never silently drop it
    -- (we are holding the family's money): record it and stop.
    v_note := 'expired';
  end if;

  if v_note is null then
    begin
      if v_s.intent_kind = 'olympiad' then
        v_pkg   := nullif(v_s.intent_items -> 0 ->> 'package_id', '')::uuid;
        v_grade := nullif(v_s.intent_items -> 0 ->> 'grade_id', '')::uuid;
        if v_pkg is null then
          v_note := 'reprice_failed:noitem';
        else
          v_q   := public.quote_olympiad_purchase(v_s.student_profile_id, v_pkg);
          v_due := (v_q->>'due_now')::numeric;
          -- WHAT WAS BOUGHT vs WHAT WOULD BE BOUGHT NOW. The entitled grade is
          -- snapshotted onto the purchase and attempts draw that pool forever,
          -- so a promoted child is a DIFFERENT PURCHASE, not a different price,
          -- and is never silently delivered.
          --
          -- Compared against the QUOTE'S OWN ANSWER rather than students.grade_id,
          -- because a LEGACY GRADE-LESS package quotes grade_id = NULL -- it
          -- sells the whole pool, not a grade. Reading the child's grade column
          -- there compared NULL against a real grade, so EVERY such purchase
          -- reported grade_changed and held the family's money for a change that
          -- had not happened. Quoting first makes both sides the same
          -- computation, which also catches the mirror case: a package whose
          -- target grades moved under a grade-less intent.
          v_cur := nullif(v_q ->> 'grade_id', '')::uuid;
          if v_grade is distinct from v_cur then
            v_note := 'grade_changed';
          else
            -- THE DELIVERY, NAMED. For a package it is the package and the
            -- entitled grade and there is nothing else it could be, so the two
            -- lines above ARE this product's delivery test -- the same question
            -- the plan branch below asks with a delta. Recorded so a reversal
            -- takes back THIS purchase rather than re-deriving one.
            v_delivering := jsonb_build_array(jsonb_build_object(
                              'package_id', v_pkg, 'grade_id', v_grade));
          end if;
        end if;
      elsif v_s.intent_kind = 'plan_start' then
        select id into v_live from public.child_subscriptions
        where student_profile_id = v_s.student_profile_id
          and status in ('trialing', 'active', 'past_due')
        order by created_at desc
        limit 1;
        if v_live is not null then
          v_note := 'plan_already_live';
        else
          v_basket := v_s.intent_items;
          v_q   := public.quote_child_plan(v_s.student_profile_id, v_basket);
          v_due := (v_q->>'due_now')::numeric;
          -- THE DELIVERY IS THE FROZEN BASKET, and for this kind it cannot be
          -- anything else: there is no coverage to compose with, quote_child_plan
          -- RAISES when any entry has no active price (so the set cannot quietly
          -- shrink), and create_child_plan writes every entry it is given. Named
          -- as adds, because that is what each one is and it is what a reversal
          -- will close.
          select coalesce(jsonb_agg(jsonb_build_object(
                   'subject_id', n.subject_id, 'op', 'add',
                   'interval', n.interval::text) order by n.subject_id), '[]'::jsonb)
            into v_delivering
          from public.plan_items_normalize(v_basket) n;
        end if;
      else
        select cs.id into v_sub from public.child_subscriptions cs
        where cs.student_profile_id = v_s.student_profile_id
          and cs.status in ('trialing', 'active', 'past_due')
        order by cs.created_at desc
        limit 1;
        if v_sub is null or v_s.child_subscription_id is distinct from v_sub then
          v_note := 'subscription_changed';
        else
          -- MIGRATION 127: the CHANGE, projected onto coverage as it is NOW.
          v_basket := case when v_s.intent_delta is null
                           then v_s.intent_items
                           else public.plan_delta_project(v_sub, v_s.intent_delta) end;
          v_q   := public.quote_plan_change(v_s.student_profile_id, v_basket);
          v_due := (v_q->>'due_now')::numeric;

          -- IS THIS STILL THE DELIVERY THE PARENT AUTHORISED?
          --
          -- Re-derive the change from the projection, with the SAME function
          -- that froze it, and require the two to be identical: the same
          -- subjects, each with the same nature (add / reinstate / cycle /
          -- remove) and the same cycle. THE PRICE IS NOT THE TEST. It cannot
          -- be, and the two ways an amount-only test fails are mirror images:
          --
          --   * the delivery SHRANK. Two tabs: A froze [add Math, add English]
          --     at 18.00, B froze [add Math] at 9.00 and was paid first, so
          --     Math is already live. A now re-prices at 9.00 -- and an
          --     amount-only rule reads that as "the price moved, honour the
          --     frozen one" and charges 18.00 for a delivery worth 9.00.
          --   * the delivery GREW. A frozen FREE reinstate whose coverage
          --     lapsed in the meantime is re-classified as a paid add, so the
          --     re-price comes back HIGHER -- and the same amount-only rule
          --     honours the smaller frozen price and hands over a brand-new
          --     full cycle for nothing.
          --
          -- Both are one sentence: the honour rule is about a price MOVING and
          -- never about delivering something else. So the SET is what is
          -- compared, and the amount is a consequence -- honoured while the
          -- delivery is unchanged (the owner's decision), a human's problem
          -- when it is not.
          --
          -- A pre-127 session carries no delta, so it cannot answer this
          -- question at all; answering it on the session's behalf would be
          -- inventing an authorisation. It lands here too.
          v_delivering := public.plan_change_delta(v_sub, v_basket);
          if v_delivering is distinct from v_s.intent_delta then
            v_note := 'delivery_changed';
          end if;
        end if;
      end if;
    exception when others then
      -- A subject withdrawn from the catalog, pricing deactivated, a package
      -- taken off sale, the subscription cancelled in another tab, a package the
      -- child already owns: all land here.
      v_note := 'reprice_failed:' || sqlstate;
    end;
  end if;

  -- THE FROZEN PRICE (finding 2), and it is reached ONLY once the delivery has
  -- been shown to be the one that was authorised -- every branch above sets
  -- v_note otherwise. That ordering IS the rule: the amount is honoured because
  -- the delivery is the same, never instead of asking whether it is.
  --
  -- A zero re-price is still not a cheap delivery: it means the thing that was
  -- paid for has become free, and keeping money for something we would now give
  -- away is the other way to be dishonest.
  if v_note is null then
    if v_due is null or v_due <= 0 then
      v_note := 'no_longer_payable';
    elsif v_due is distinct from v_s.amount then
      v_honoured := true;
    end if;
  end if;

  if v_note is null then
    begin
      if v_s.intent_kind = 'olympiad' then
        v_res := public.purchase_olympiad(v_s.student_profile_id, v_pkg);
        if not coalesce((v_res->>'charged')::boolean, false) then
          -- NOTHING WAS BOUGHT. The only way here is a child who already owned
          -- the package (the quote raises `already_owned`, so this is a race
          -- rather than an ordinary path) -- and we are holding money for it.
          -- Stamping the existing purchase would misattribute somebody else's
          -- payment, so nothing is written and a person is told.
          v_note := 'already_owned';
        else
          -- WHICH RAIL PAID FOR IT, AND WHAT THE PARENT WAS CHARGED.
          --
          -- purchase_olympiad writes provider = 'none' (it has no idea how it
          -- was reached) and fn_entitlement_map_purchase reads exactly that
          -- column to decide whether the grant is abb_web or manual, so leaving
          -- it files every paid package as a COMPED one. It also records the
          -- CURRENT CATALOG price, which is not necessarily what was taken: a
          -- frozen price that was honoured leaves the purchase row and the
          -- payments row disagreeing about the same money, and the purchase row
          -- is the one a family and an accountant read. Both are corrected here
          -- rather than through a new parameter, so purchase_olympiad's
          -- signature -- and every caller of it -- stays as it is.
          --
          -- `provider` is on trg_entitlements_from_purchases' column list
          -- (migration 127), so this statement re-fires the mirror and the grant
          -- is re-filed as abb_web instead of staying a comped one.
          update public.olympiad_purchases
             set provider   = 'azericard',
                 amount     = v_s.amount,
                 currency   = coalesce(v_s.currency, 'AZN'),
                 updated_at = now()
           where id = (v_res->>'purchase_id')::uuid;
        end if;
      elsif v_s.intent_kind = 'plan_start' then
        v_res := public.create_child_plan(v_s.student_profile_id, v_basket);
        v_sub := (v_res->>'subscription_id')::uuid;
      else
        -- Keyed on the ORDER, not on the interactive path's 5-minute bucket: an
        -- order is stable across every retry this callback can receive.
        v_res := public.apply_plan_change(
                   v_s.student_profile_id, v_basket, 'checkout:' || p_order);
      end if;
    exception when others then
      -- assert_payments_enabled() flipped between the charge and the callback,
      -- a last_subject guard, a lost race: money is held, nothing was applied.
      v_note := 'apply_failed:' || sqlstate;
    end;
  end if;

  v_outcome := case when v_note is null then 'applied' else 'needs_review' end;

  update public.checkout_sessions
     set redeemed_at       = now(),
         redemption_status = v_outcome::public.checkout_redemption_status,
         redemption_note   = left(v_note, 200),
         -- WRITTEN EXACTLY ONCE, in the statement that decides the redemption,
         -- and only when something really was delivered. checkout_revoke_reversed
         -- reads THIS and nothing else, so a reversal takes back what this money
         -- bought instead of what the intent once described -- which after an
         -- honoured price, or after the world moved, are two different sets.
         delivered_items   = case when v_outcome = 'applied' then v_delivering end,
         child_subscription_id = coalesce(child_subscription_id, v_sub)
   where id = v_s.id
     and redeemed_at is null;

  if v_outcome = 'applied' and v_sub is not null then
    -- Close the loop the ledger was missing: which subscription this money
    -- bought, and which order paid for these subject changes. Both were
    -- unanswerable before, and a reconciliation report that cannot answer them
    -- is a report nobody can act on.
    update public.payments
       set child_subscription_id = v_sub,
           updated_at = now()
     where provider = 'azericard'
       and provider_ref = p_order
       and child_subscription_id is null;

    update public.subscription_changes
       set provider = 'azericard',
           provider_payment_id = p_order
     where idempotency_key = 'checkout:' || p_order
       and student_profile_id = v_s.student_profile_id;

    -- MIGRATION 137 -- WHICH RAIL PAID FOR THIS SUBSCRIPTION.
    --
    -- create_child_plan writes `provider = 'none'` because it genuinely cannot
    -- know: it is reached from a comped admin grant, a free change and a paid
    -- redemption alike. Only THIS function knows a card was charged, and until
    -- now only the OLYMPIAD branch above said so.
    --
    -- The consequence was measured, not predicted. The first real end-to-end
    -- AzeriCard payment (order 20260825782482, RRN 623779222092, 9.00 AZN) left
    -- the subscription at 'none', so fn_entitlement_map_subject took its
    -- `else` arm and filed the grant as `source = 'manual'` -- the value that
    -- means COMPED. Every card-paid subscription would have been indistinguishable
    -- from a free one, and a settlement or revenue report keyed on `source` would
    -- have shown no ABB income at all.
    --
    -- Exactly the shape migration 127 fixed for purchases (finding M5), on the
    -- half it did not reach.
    update public.child_subscriptions
       set provider   = 'azericard',
           updated_at = now()
     where id = v_sub
       and provider is distinct from 'azericard';
  end if;

  -- The ledger copy. Amounts and enum values only: no card data exists here and
  -- none is ever added. honoured_frozen_price is what makes the owner's decision
  -- auditable rather than invisible — a settlement report can find every charge
  -- that was delivered at a price the catalog had since moved off.
  insert into public.payment_events (provider, event_id, payload_json, processed_at)
  values ('azericard', 'redeem:' || p_order,
          jsonb_build_object(
            'order', p_order,
            'intent_kind', v_s.intent_kind,
            'checkout_kind', v_s.kind,
            'outcome', v_outcome,
            'note', v_note,
            'amount_paid', v_s.amount,
            'amount_repriced', v_due,
            'honoured_frozen_price', v_honoured,
            'subscription_id', v_sub,
            'olympiad_purchase_id', v_res->>'purchase_id'),
          now())
  on conflict do nothing;

  -- FINDING 6: somebody is told. After the row is decided and the ledger is
  -- written, so an alarm that fails cannot cost us the record.
  if v_outcome = 'needs_review' then
    perform public.checkout_alert_admins(p_order, coalesce(v_note, 'unknown'));
  end if;

  return jsonb_build_object(
    'outcome',            v_outcome,
    'note',               v_note,
    'student_profile_id', v_s.student_profile_id,
    'subscription_id',    v_sub,
    'purchase_id',        v_res->>'purchase_id',
    'honoured_frozen_price', v_honoured,
    -- create_child_plan allocates the deferred 8-digit login ID; the caller has
    -- to finish that by setting the synthetic auth email, which is an Auth-admin
    -- call no SQL function can make.
    'new_child_unique_id', v_res->>'new_child_unique_id',
    'auth_user_id',        v_res->>'auth_user_id');
end;
$$;

revoke all on function public.checkout_redeem_plan(text) from public, anon, authenticated;
grant execute on function public.checkout_redeem_plan(text) to service_role;

-- -----------------------------------------------------------------------------
-- 9. Flagging a redemption that needs a human  (backport -> 011)
-- -----------------------------------------------------------------------------
-- The one follow-up SQL cannot perform is the Supabase Auth admin call that
-- turns a freshly allocated 8-digit id into a login. When that fails the plan IS
-- applied and paid for, and the child still cannot sign in. That is a human's
-- problem, not a silent one -- so the caller writes the reason here.
--
-- IT WRITES THE NOTE AND NOTHING ELSE. Flipping the status to 'needs_review'
-- would be the obvious move and would be a lie: the plan WAS delivered, and
-- 'needs_review' is this schema's word for "we are holding money we have not
-- delivered on". Two different problems that need two different answers must not
-- share one word. 013 check 118 therefore treats a decided redemption carrying a
-- note as needing a human REGARDLESS of which status it holds, and the ledger
-- (payment_events 'redeem:<order>') keeps the fact that it applied.
create or replace function public.checkout_flag_redemption(
  p_order text,
  p_note  text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok   boolean := false;
  v_prev text;
begin
  update public.checkout_sessions
     set redemption_note = left(coalesce(p_note, 'flagged'), 200)
   where provider = 'azericard'
     and provider_session_id = p_order
     and intent_kind is not null
     -- A DECIDED redemption only. There is no follow-up to report on one that
     -- has not happened, and inventing a note for it would put a row in front of
     -- a human that nothing has gone wrong with yet.
     and redeemed_at is not null
  returning true, redemption_note into v_ok, v_prev;

  if coalesce(v_ok, false) then
    -- ROUND 8 -- KEEP THE NOTE THAT WAS REPLACED. redemption_note is a single
    -- slot and every writer overwrites it, so an operator arriving later sees
    -- only the newest condition and no way to learn what the redemption
    -- originally could not deliver. The slot stays the CURRENT state -- that is
    -- what the admin queue and 013 checks 118 and 123 read -- and the history
    -- goes where this rail already keeps history: the append-only ledger.
    --
    -- Best-effort, in its own block: failing to record history must never roll
    -- back the flag it describes, which is the whole point of flagging.
    begin
      insert into public.payment_events (provider, event_id, payload_json, processed_at)
      values ('azericard', 'note:' || p_order || ':' || md5(coalesce(v_prev, '')),
              jsonb_build_object(
                'order', p_order,
                'previous_note', v_prev,
                'new_note', left(coalesce(p_note, 'flagged'), 200)),
              now())
      on conflict do nothing;
    exception when others then
      raise warning 'checkout_flag_redemption: note history not kept for %: %', p_order, sqlerrm;
    end;
    perform public.checkout_alert_admins(p_order, coalesce(p_note, 'flagged'));
  end if;
  return coalesce(v_ok, false);
end;
$$;

comment on function public.checkout_flag_redemption(text, text) is
  'Migration 125/127: record why a DECIDED redemption still needs a human — for the follow-up steps SQL cannot perform (the Auth-admin call that activates a child login) — and, since 127, notify the administrators. Writes redemption_note only: the status keeps saying what happened to the money, and 013 check 118 surfaces any decided redemption carrying a note.';

revoke all on function public.checkout_flag_redemption(text, text) from public, anon, authenticated;
grant execute on function public.checkout_flag_redemption(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. The purchase-silent surface: apply ONLY what costs nothing (migration 126)
-- -----------------------------------------------------------------------------
-- WHY THESE EXIST. The mobile apps are purchase-silent BY ARCHITECTURE
-- (docs/STORE_PAYMENTS_COMPLIANCE.md section 4): purchasing happens on the WEB,
-- in a browser, and the app reflects entitlement. That guarantee was true of
-- everything the app RENDERS and false of what its BFF could CALL -- both
-- routes reached the apply RPCs directly, so a parent bearer token could start
-- a full paid plan with no checkout anywhere the moment the mode became `real`.
--
-- WHY A WRAPPER AND NOT A PRE-CHECK. "Quote, see zero, then apply" cannot be
-- made safe from outside the transaction: prices, the sibling tier and
-- launch_promo_config.trial_days can all move between the two calls, and READ
-- COMMITTED gives each statement its own snapshot. So the verdict is taken from
-- the apply's OWN return value, in the SAME statement, and a refusal RAISES --
-- which rolls back the apply, the ledger rows and the entitlement rows the
-- producer triggers wrote. There is no window in which a priced change exists.
--
-- WHY NOT A BOOLEAN PARAMETER ON THE APPLY ITSELF. Adding one would create a
-- second overload of a function this codebase calls from five places, and the
-- OLD signature would keep existing as a bypass. A separately named function
-- cannot be reached by accident: a route that wants the priced behaviour has to
-- name the priced function, which is a thing a reviewer can see.
--
-- WHAT STAYS LEGAL, and why it must. A removal, a reinstatement (migration
-- 120), a scheduled cycle change, an active giveaway window, an admin
-- free-access interval and a running trial all price at ZERO, and every one of
-- them is a thing a parent must be able to do from the app. Never trap a family
-- inside a plan they are trying to leave because the payment rail is elsewhere.
create or replace function public.create_child_plan_if_free(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_due numeric(12,2);
begin
  v_res := public.create_child_plan(p_student_profile_id, p_items);

  -- NULL IS A REFUSAL, not a zero. An answer with no due_now is an answer we
  -- cannot price, and "we could not tell what this costs" must never resolve to
  -- "so it is probably free".
  v_due := (v_res->>'due_now')::numeric;
  if v_due is null or v_due > 0 then
    raise exception 'plan: this change has to be paid for'
      using errcode = 'check_violation', hint = 'payment_required';
  end if;

  return v_res;
end;
$$;

comment on function public.create_child_plan_if_free(uuid, jsonb) is
  'Migration 126: create_child_plan for the PURCHASE-SILENT surface (the mobile BFF). Applies the plan and then rolls the whole statement back with check_violation/payment_required if the plan RPC priced it above zero -- so a bearer token can start a trial or a genuinely free plan and can never reach a paid one. The verdict comes from the apply''s own return value inside the same statement, which is why no re-quote race can defeat it.';

revoke all on function public.create_child_plan_if_free(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child_plan_if_free(uuid, jsonb) to service_role;

create or replace function public.apply_plan_change_if_free(
  p_student_profile_id uuid,
  p_items              jsonb,
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_due numeric(12,2);
begin
  v_res := public.apply_plan_change(p_student_profile_id, p_items, p_idempotency_key);

  -- A REPLAY IS NOT A PURCHASE. apply_plan_change short-circuits a repeated
  -- idempotency key with {idempotent, applied_at} and applies nothing, so there
  -- is no charge to refuse -- and refusing it would turn a harmless retry into
  -- an error the parent has to interpret.
  if coalesce((v_res->>'idempotent')::boolean, false) then
    return v_res;
  end if;

  v_due := (v_res->>'due_now')::numeric;
  if v_due is null or v_due > 0 then
    raise exception 'plan: this change has to be paid for'
      using errcode = 'check_violation', hint = 'payment_required';
  end if;

  return v_res;
end;
$$;

comment on function public.apply_plan_change_if_free(uuid, jsonb, text) is
  'Migration 126: apply_plan_change for the PURCHASE-SILENT surface (the mobile BFF). Removals, reinstatements, scheduled cycle changes and trial-time adds price at zero and pass; anything the quote prices above zero raises check_violation/payment_required, which rolls back the apply, its ledger rows and the entitlement rows the producer triggers wrote. An idempotent replay is returned untouched -- it applied nothing.';

revoke all on function public.apply_plan_change_if_free(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change_if_free(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Reconciliation for a lost callback  (migration 126)
-- -----------------------------------------------------------------------------
-- A payment authorised at the bank whose BACKREF POST never reaches us leaves
-- the family CHARGED with no record, no plan and no alarm. The gateway answers
-- a TRTYPE=90 status query for 24 HOURS, so the window in which that is
-- recoverable is exactly one day wide and then closes forever.
--
-- WHY THIS IS TWO FUNCTIONS AND NOT ONE JOB. Asking the gateway requires a MAC
-- signed with the merchant private key. That key lives in the web app's
-- environment and MUST NOT enter the database (CLAUDE.md, secret handling), and
-- this deployment has no pg_net, so a pg_cron job cannot make the call even in
-- principle. The split follows the constraint:
--   * checkout_reconcile_candidates() names the orders worth asking about;
--     the web-app sweep asks, and records the answer through recordOutcome and
--     checkout_redeem_plan -- the SAME code the callback runs, so there is one
--     implementation of "money becomes a plan" rather than a second copy that
--     can drift from it.
--   * checkout_redeem_sweep() is the half that needs no network: sessions the
--     ledger ALREADY says are `paid` whose redemption never ran. It is the
--     pg_cron backstop, and it is what makes the guarantee survive an outage of
--     whatever schedules the web sweep.
create or replace function public.checkout_reconcile_candidates(p_limit int default 50)
returns table (
  provider_order text,
  amount         numeric(12,2),
  currency       text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cs.provider_session_id, cs.amount, cs.currency, cs.created_at
  from public.checkout_sessions cs
  where cs.provider = 'azericard'
    and cs.intent_kind is not null
    and cs.status = 'pending'
    and cs.redeemed_at is null
    and cs.amount is not null
    -- INSIDE THE GATEWAY'S OWN WINDOW. Beyond 24 hours a status query cannot be
    -- answered, so listing the row would only produce a network call that
    -- always fails; 013 check 118 keeps counting it instead.
    and cs.created_at > now() - interval '24 hours'
    -- ...and not so fresh that the parent may still be ON the bank's page. A
    -- sweep that raced a live checkout would query a transaction that has not
    -- happened yet and record a 'pending' answer as though it were news.
    and cs.created_at < now() - interval '5 minutes'
  order by cs.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.checkout_reconcile_candidates(int) is
  'Migration 126: the work list for the lost-callback sweep -- PENDING intents inside the gateway''s 24-hour TRTYPE=90 window and at least five minutes old. Read-only; it decides nothing and grants nothing. The caller asks the gateway (the MAC key is web-app-only and never enters the database) and records the answer through the same path the callback uses.';

revoke all on function public.checkout_reconcile_candidates(int) from public, anon, authenticated;
grant execute on function public.checkout_reconcile_candidates(int) to service_role;

create or replace function public.checkout_redeem_sweep(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_res      jsonb;
  v_seen     int := 0;
  v_applied  int := 0;
  v_review   int := 0;
  v_other    int := 0;
begin
  for v_row in
    select cs.provider_session_id as ord
    from public.checkout_sessions cs
    where cs.provider = 'azericard'
      and cs.intent_kind is not null
      and cs.status = 'paid'
      and cs.redeemed_at is null
      -- Five minutes of grace, because the ordinary case is a callback whose
      -- redeem step is still in flight in another transaction. Sweeping it now
      -- would only contend on the row lock checkout_redeem_plan takes.
      and cs.created_at < now() - interval '5 minutes'
      -- ONLY WHAT SQL CAN FINISH. See the header: the web-app sweep -- which CAN
      -- make the Auth-admin call -- owns a plan_start whose child has no login
      -- ID yet; this job takes the rest, and if the web sweep never runs 013
      -- check 118 still reports them as money taken and not delivered.
      and (cs.intent_kind in ('plan_change', 'olympiad')
           or exists (select 1 from public.students st
                       where st.profile_id = cs.student_profile_id
                         and st.child_unique_id is not null))
    order by cs.created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  loop
    v_seen := v_seen + 1;
    -- ONE implementation of "money becomes a plan". Everything that makes it
    -- safe -- the row lock, the status = 'paid' requirement, the re-price
    -- against the amount actually confirmed, redeemed_at written in the same
    -- transaction as the apply -- is inside that function, so this loop cannot
    -- weaken any of it and a concurrent callback cannot double-apply.
    begin
      v_res := public.checkout_redeem_plan(v_row.ord);
    exception when others then
      -- One unhappy session must not abort the sweep for the rest. The handler
      -- SETS A VALUE rather than jumping: leaving a block that has an exception
      -- handler from inside that handler is exactly the sort of control flow
      -- that behaves differently across versions, and this loop holds money.
      v_res := jsonb_build_object('outcome', 'error');
    end;
    if v_res->>'outcome' = 'applied' then
      v_applied := v_applied + 1;
    elsif v_res->>'outcome' = 'needs_review' then
      v_review := v_review + 1;
    else
      v_other := v_other + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'examined', v_seen, 'applied', v_applied,
    'needs_review', v_review, 'other', v_other);
end;
$$;

comment on function public.checkout_redeem_sweep(int) is
  'Migration 126/127: the no-network half of lost-callback recovery -- redeems checkout sessions the ledger already says are PAID whose redemption never ran, through checkout_redeem_plan (never a second copy of that logic). Idempotent: a decided session answers ''already'' and is counted, not re-applied. Skips only a plan_start whose child has no 8-digit ID yet, because finishing one needs a Supabase Auth admin call SQL cannot make; plan_change and olympiad redemptions have no such tail and are swept here.';

revoke all on function public.checkout_redeem_sweep(int) from public, anon, authenticated;
grant execute on function public.checkout_redeem_sweep(int) to service_role;

-- -----------------------------------------------------------------------------
-- Migration 127: a reversal must not leave access standing. The gateway only
-- reveals one to a TRAN_TRTYPE=22 status query -- a TRAN_TRTYPE=1 query keeps
-- reporting the original authorisation as approved forever -- so without
-- these two the money went back and the entitlement stayed live.
-- -----------------------------------------------------------------------------

create or replace function public.checkout_reversal_candidates(p_limit int default 50)
returns table (
  provider_order text,
  amount         numeric(12,2),
  currency       text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cs.provider_session_id, cs.amount, cs.currency, cs.created_at
  from public.checkout_sessions cs
  join public.payments p
    on p.provider = cs.provider
   and p.provider_ref = cs.provider_session_id
  where cs.provider = 'azericard'
    and cs.intent_kind is not null
    and cs.status = 'paid'
    -- A payment we still believe succeeded. Once checkout_revoke_reversed has
    -- run it is 'refunded' and drops out of this list, which is what keeps the
    -- sweep from asking about the same order forever.
    and p.status = 'succeeded'
    -- INSIDE THE GATEWAY'S OWN WINDOW. Beyond 24 hours a status query cannot be
    -- answered at all, so listing the row would only produce a network call that
    -- always fails. THIS IS A REAL LIMIT AND IT IS WORTH SAYING PLAINLY: a
    -- reversal performed after the window closes is invisible to us, and the
    -- only evidence left is the settlement report. That is the acquirer's
    -- constraint, not a choice made here.
    --
    -- ROUND 8 -- THE CLOCK RUNS FROM THE AUTHORISATION, and neither created_at
    -- is that moment.
    --   cs.created_at is when the INTENT WAS OPENED, and an intent lives for a
    --   full day (INTENT_TTL_MINUTES = 24 * 60). A checkout opened at 09:00,
    --   abandoned and resumed at 20:00 re-signs the SAME order in place, so
    --   this sweep went blind at 09:00 the next morning while the gateway went
    --   on answering until 20:00 -- eleven hours in which a refund was
    --   invisible and the family kept access nobody was paying for.
    --   p.created_at is no better and fails on the same case: the reconcile
    --   sweep asks about a still-pending order five minutes after it opens, an
    --   unpaid order answers without an AMOUNT, that reconciles to 'unknown',
    --   and a payments row is written with status 'pending'. The real
    --   authorisation then takes the UPDATE branch of the upsert, and
    --   created_at stays at 09:05.
    -- p.updated_at is when we recorded the APPROVAL, and nothing moves it
    -- backwards inside this list: the revoke that moves it also sets status =
    -- 'refunded', which the conjunct above has already excluded, and the
    -- redemption's child_subscription_id write only moves it FORWARD. Forward
    -- over-asks, and an out-of-window query is not a money event -- it fails,
    -- classifies as unreadable, changes nothing, and is asked again next pass.
    and p.updated_at > now() - interval '24 hours'
    and p.updated_at < now() - interval '5 minutes'
  order by p.updated_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.checkout_reversal_candidates(int) is
  'Migration 127: the work list for the reversal sweep — settled checkout payments inside the gateway''s 24-hour status window. Read-only; it decides nothing. The caller asks the gateway with TRAN_TRTYPE=22 (the ONLY query that reveals a reversal — a TRAN_TRTYPE=1 query reports the original authorisation as approved forever) and records the answer through checkout_revoke_reversed. Beyond 24 hours a reversal is invisible to us; that is the acquirer''s window, not a choice.';

revoke all on function public.checkout_reversal_candidates(int) from public, anon, authenticated;
grant execute on function public.checkout_reversal_candidates(int) to service_role;


create or replace function public.checkout_revoke_reversed(
  p_order  text,
  p_reason text default 'gateway_reversal'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     public.checkout_sessions%rowtype;
  v_pkg   uuid;
  v_note  text;
  v_n     int := 0;
  v_rows  int := 0;
  v_row   record;
begin
  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order
  for update;
  if not found or v_s.intent_kind is null then
    return jsonb_build_object('outcome', 'unknown_order');
  end if;

  v_note := left('reversed:' || coalesce(p_reason, 'gateway'), 200);

  -- IDEMPOTENT. A sweep that runs twice, or a reversal the operator repeats,
  -- must not revoke twice or file two alarms.
  if exists (
    select 1 from public.payments
    where provider = 'azericard' and provider_ref = p_order and status = 'refunded'
  ) then
    return jsonb_build_object('outcome', 'already', 'note', v_s.redemption_note);
  end if;

  -- 1. The ledger first: the money went back.
  update public.payments
     set status = 'refunded', updated_at = now()
   where provider = 'azericard' and provider_ref = p_order;

  -- 2. Take back what it bought.
  if v_s.redeemed_at is null then
    -- Nothing was ever delivered, and now nothing may be: close the session so a
    -- late callback cannot redeem a payment that has been returned.
    update public.checkout_sessions
       set redeemed_at       = now(),
           redemption_status = 'needs_review',
           redemption_note   = v_note
     where id = v_s.id and redeemed_at is null;
  elsif v_s.redemption_status = 'applied' then
    if v_s.delivered_items is null then
      -- WE DO NOT KNOW WHAT THIS PAYMENT DELIVERED, so we take nothing back.
      -- The only rows in this state are redemptions decided before
      -- delivered_items existed. Guessing from the intent is exactly the defect
      -- this column closes, and of the two ways to be wrong here — leaving
      -- access standing for money that went back, or cutting a paying family
      -- off from something a different payment bought — only the first one is
      -- recoverable by the person this note reaches.
      v_note := left('reversed:unknown_delivery:' || coalesce(p_reason, 'gateway'), 200);
    elsif v_s.intent_kind = 'olympiad' then
      v_pkg := nullif(v_s.delivered_items -> 0 ->> 'package_id', '')::uuid;
      update public.olympiad_purchases
         set status = 'refunded', updated_at = now()
       where student_profile_id = v_s.student_profile_id
         and olympiad_package_id = v_pkg
         and status = 'active';
      get diagnostics v_n = row_count;
    else
      -- ONLY THE SUBJECTS THIS MONEY BOUGHT, read from what the redemption
      -- actually APPLIED and never from the frozen intent. The two are the same
      -- set only when nothing moved between signing and redeeming; whenever
      -- they differ, the intent names a subject some OTHER payment paid for,
      -- and closing its period would be revoking access a family is owed.
      --
      -- `add` alone, in both plan kinds: a reinstatement, a cycle move and a
      -- removal cost nothing, so they are not this payment's to take back, and
      -- a plan_start's delivery is written as adds for exactly this reason.
      for v_row in
        select (e.v ->> 'subject_id')::uuid as sid
        from jsonb_array_elements(v_s.delivered_items) as e(v)
        where jsonb_typeof(e.v) = 'object'
          and e.v ->> 'op' = 'add'
          and coalesce(e.v ->> 'subject_id', '')
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      loop
        update public.subscription_subjects
           set current_period_end = now(),
               remove_at = now()
         where child_subscription_id = v_s.child_subscription_id
           and subject_id = v_row.sid
           and (current_period_end is null or current_period_end > now());
        get diagnostics v_rows = row_count;
        v_n := v_n + v_rows;
      end loop;

      -- ...AND THE SUBSCRIPTION ITSELF ONLY WHEN NOTHING IS LEFT OF IT. A
      -- plan_start reversal used to cancel the subscription outright, which
      -- also killed every subject bought on it later by payments nobody
      -- reversed. The honest test is not "which kind of intent was this" but
      -- "is any coverage still standing", and it is the same test for both plan
      -- kinds — one rule instead of two.
      if v_s.child_subscription_id is not null
         and not exists (
           select 1 from public.subscription_subjects ss
            where ss.child_subscription_id = v_s.child_subscription_id
              and (ss.remove_at is null or ss.remove_at > now())
              and (ss.current_period_end is null or ss.current_period_end > now()))
      then
        update public.child_subscriptions
           set status = 'canceled', updated_at = now()
         where id = v_s.child_subscription_id
           and status in ('trialing', 'active', 'past_due');
      end if;
    end if;

    -- The status keeps saying what happened to the money at REDEMPTION time
    -- ('applied' — it was delivered). The NOTE is what says a person is needed
    -- now, which is the same split checkout_flag_redemption uses and the same
    -- one 013 check 118 reads.
    update public.checkout_sessions
       set redemption_note = v_note
     where id = v_s.id;
  else
    -- ROUND 8 -- DECIDED, AND DELIVERED NOTHING. The third reachable state, and
    -- until now the one with no arm at all: redeemed_at is set and the
    -- redemption ended in `needs_review`, so the money was taken and nothing
    -- was ever granted.
    --
    -- REVOKE NOTHING -- there is nothing to revoke, and delivered_items is NULL
    -- for exactly that reason. What was missing is the SENTENCE. With no arm
    -- here the reversal left the session untouched, so the review queue went on
    -- telling an operator "we are holding this family's money and have not
    -- delivered" about money that had already gone home -- and the obvious
    -- response to that sentence is to grant the access by hand, which gives the
    -- purchase away for free after the refund.
    --
    -- The previous note is carried in the tail rather than overwritten: it is
    -- the only record of WHY the redemption could not deliver, and left(...)
    -- truncates the tail, never the `reversed:` prefix the checks match on.
    update public.checkout_sessions
       set redemption_note = left('reversed:' || coalesce(p_reason, 'gateway') ||
                                  '|prev:' || coalesce(v_s.redemption_note, '-'), 200)
     where id = v_s.id;
  end if;

  -- 3. The ledger copy, and the alarm.
  insert into public.payment_events (provider, event_id, payload_json, processed_at)
  values ('azericard', 'reversed:' || p_order,
          jsonb_build_object(
            'order', p_order,
            'intent_kind', v_s.intent_kind,
            'reason', p_reason,
            'was_redeemed', v_s.redeemed_at is not null,
            -- ROUND 8: the note this reversal replaced. redemption_note is one
            -- last-writer-wins slot carrying three orthogonal facts -- why the
            -- redemption could not deliver, what an operator DID, and whether
            -- the money came back -- so every write destroys the previous
            -- answer. payment_events is append-only and is where the history
            -- belongs; the slot keeps meaning "the current state".
            'previous_note', v_s.redemption_note,
            'redemption_status', v_s.redemption_status,
            'producers_revoked', v_n),
          now())
  on conflict do nothing;

  perform public.checkout_alert_admins(p_order, v_note);

  return jsonb_build_object(
    'outcome', 'reversed',
    'note', v_note,
    'producers_revoked', v_n,
    'student_profile_id', v_s.student_profile_id);
end;
$$;

comment on function public.checkout_revoke_reversed(text, text) is
  'Migration 127: records that a settled checkout payment was REVERSED at the gateway and takes back what it bought. Marks the payment refunded, then expresses the revocation ON THE PRODUCER — an olympiad purchase becomes refunded, and the subjects named by checkout_sessions.delivered_items (what the redemption ACTUALLY applied, never the frozen intent) have their period closed at now() — so migration 124''s mirror revokes the entitlement instead of this function writing access directly. The subscription is cancelled only when no coverage is left on it, so a reversal cannot kill a subject a later payment bought. A redemption decided before delivered_items existed revokes nothing and asks for a person. A payment reversed before it was ever redeemed closes the session so a late callback cannot deliver it. Idempotent on payments.status = ''refunded''; always notifies the administrators.';

revoke all on function public.checkout_revoke_reversed(text, text) from public, anon, authenticated;
grant execute on function public.checkout_revoke_reversed(text, text) to service_role;


-- -----------------------------------------------------------------------------
-- Migration 127: an operator says what they did about a needs_review.
-- -----------------------------------------------------------------------------
-- THE ALARM HAD NO OFF SWITCH, and that is a real defect rather than a missing
-- convenience. `checkout_redemption_status` has exactly TWO values, both
-- terminal, and neither of them means "a person has dealt with this". So 013
-- check 118 would have gone permanently red seven days after the first genuine
-- needs_review, and a board that is always red is a board nobody reads.
--
-- MOVING THE STATUS WOULD HAVE BEEN A LIE. 'applied' means the plan was
-- delivered. An operator who REFUNDED the family instead has not applied
-- anything, and overwriting the status would destroy the only record of what
-- happened to the money at redemption time.
--
-- So the resolution is written where a resolution belongs: the NOTE, prefixed
-- `resolved:`. The status keeps saying what happened, the note says a human
-- settled it, and the audit row says HOW. 013 checks 118 and 123 skip a row
-- carrying that prefix and count every other one.
--
-- IT DEMANDS A SENTENCE. A blank resolution is refused, because "somebody
-- clicked the button" is not an answer to "what happened to this family's
-- money".
create or replace function public.admin_resolve_checkout_review(
  p_order      text,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_s     public.checkout_sessions%rowtype;
  v_note  text;
begin
  if not public.is_admin() then
    raise exception 'checkout: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_resolution is null or btrim(p_resolution) = '' then
    raise exception 'checkout: say what was done'
      using errcode = 'check_violation', hint = 'resolution_required';
  end if;

  select * into v_s from public.checkout_sessions
  where provider = 'azericard' and provider_session_id = p_order
  for update;
  if not found or v_s.intent_kind is null or v_s.redeemed_at is null then
    raise exception 'checkout: no decided redemption for this order'
      using errcode = 'no_data_found', hint = 'not_found';
  end if;

  -- 180, not 200: `resolved:` costs nine characters and the column is capped at
  -- 200 by ck_checkout_redemption. Truncating the OPERATOR'S sentence rather
  -- than the prefix keeps the prefix — which is what the checks key on — intact.
  v_note := 'resolved:' || left(btrim(p_resolution), 180);

  update public.checkout_sessions
     set redemption_note = v_note
   where id = v_s.id;

  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.checkout.redemption_resolved', 'checkout_sessions', v_s.id,
     jsonb_build_object(
       'order', p_order,
       'intent_kind', v_s.intent_kind,
       'redemption_status', v_s.redemption_status,
       'previous_note', v_s.redemption_note,
       'resolution', left(btrim(p_resolution), 180)),
     'info', true);

  return jsonb_build_object('ok', true, 'note', v_note);
end;
$$;

comment on function public.admin_resolve_checkout_review(text, text) is
  'Migration 127: an administrator records what they DID about a redemption that needed a human — delivered by hand, refunded, contacted the family. Writes redemption_note = ''resolved:<sentence>'' and an audit row, and deliberately leaves redemption_status alone: the status says what happened to the MONEY at redemption time, and overwriting it with ''applied'' would be a lie about a refunded case. 013 checks 118 and 123 skip a row carrying the prefix. Refuses a blank resolution and anyone who is not an administrator.';

revoke all on function public.admin_resolve_checkout_review(text, text) from public, anon;
grant execute on function public.admin_resolve_checkout_review(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- AZERICARD RECONCILIATION KICK (migration 129)
--
-- pg_cron cannot sign a gateway MAC -- the merchant private key lives only in
-- the web app's environment and must never enter the database -- so the sweep
-- is an HTTP route and this function is how the scheduler reaches it. The
-- database carries a bearer token for OUR OWN endpoint and nothing else.
--
-- Credentials come from Vault, never system_settings: a setting the admin
-- panel can edit and that decides where the database posts a bearer token is
-- an exfiltration primitive. The host allowlist below is the check a Vault
-- write cannot talk its way around.
-- ---------------------------------------------------------------------------
create or replace function public.azericard_reconcile_kick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url   text;
  v_key   text;
  v_host  text;
  v_req   bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'azericard_reconcile_kick: pg_net is not installed; nothing to do.';
    return null;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'azericard_reconcile_url' limit 1;
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'azericard_reconcile_key' limit 1;

  -- Fail CLOSED and quietly. Not configured is the ordinary state of a fresh
  -- database, and this fires every five minutes.
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice 'azericard_reconcile_kick: not configured (vault secrets missing); skipping.';
    return null;
  end if;

  -- OUR OWN ENDPOINT ONLY. The token is useless to anyone but us, but a bearer
  -- token posted at an attacker-chosen host is still a credential leak, and a
  -- hardcoded allowlist is the one check a later Vault write cannot talk its way
  -- around. Anything unexpected is refused, not "cleaned up".
  v_host := split_part(split_part(regexp_replace(v_url, '^https://', ''), '/', 1), ':', 1);
  if v_url !~ '^https://' or v_host not in ('olympiq.ai', 'www.olympiq.ai', 'staging.olympiq.ai') then
    raise warning 'azericard_reconcile_kick: refusing to post to an unexpected host (%).', v_host;
    return null;
  end if;

  -- Fire and forget. pg_net queues the request and a background worker sends it;
  -- the ROUTE does the work and records everything it decides. We deliberately
  -- do not read the response: there is nothing here that could act on it, and a
  -- job that waits on a network call blocks a cron worker for its duration.
  -- Failures are visible in net._http_response, which pg_net prunes itself.
  select net.http_post(
           url                 => v_url,
           body                => '{}'::jsonb,
           params              => '{}'::jsonb,
           headers             => jsonb_build_object(
                                    'Content-Type',    'application/json',
                                    'x-reconcile-key', v_key),
           timeout_milliseconds => 55000
         ) into v_req;
  return v_req;
end;
$$;

-- SERVICE-ROLE ONLY, and not even that in practice — cron runs it as the owner.
-- 010 line 88 grants EXECUTE on new functions to anon AND authenticated by
-- default, so all three must be named or this becomes a way for any logged-in
-- parent to make the server hammer the acquirer.
revoke all on function public.azericard_reconcile_kick() from public, anon, authenticated;
grant execute on function public.azericard_reconcile_kick() to service_role;


-- ---------------------------------------------------------------------------
-- MIGRATION 138 - the notification queue's consumer, mirroring the sweep above.
-- ---------------------------------------------------------------------------
create or replace function public.notifications_process_kick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url   text;
  v_key   text;
  v_host  text;
  v_req   bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'notifications_process_kick: pg_net is not installed; nothing to do.';
    return null;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notifications_process_url' limit 1;
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'notifications_processor_key' limit 1;

  -- Fail CLOSED and quietly. Not configured is the ordinary state of a fresh
  -- database, and this fires every five minutes.
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice 'notifications_process_kick: not configured (vault secrets missing); skipping.';
    return null;
  end if;

  -- OUR OWN ENDPOINT ONLY, exactly as azericard_reconcile_kick does it. The
  -- shared secret is useless to anyone but us, but a secret posted at an
  -- attacker-chosen host is still a credential leak, and a hardcoded allowlist
  -- is the one check a later Vault write cannot talk its way around.
  v_host := split_part(split_part(regexp_replace(v_url, '^https://', ''), '/', 1), ':', 1);
  if v_url !~ '^https://' or v_host not in ('olympiq.ai', 'www.olympiq.ai', 'staging.olympiq.ai') then
    raise warning 'notifications_process_kick: refusing to post to an unexpected host (%).', v_host;
    return null;
  end if;

  -- Fire and forget. The ROUTE claims pending deliveries and records every
  -- outcome; a cron job that waits on a network call blocks a worker for its
  -- duration. Failures land in net._http_response.
  --
  -- KNOWN LIMITATION, stated rather than hidden: like the reconcile kick, this
  -- never reads the HTTP result, so a wrong key produces 401s that pg_cron still
  -- records as successful runs. On 2026-08-25 exactly that hid a 75-minute
  -- reconcile outage. Watch net._http_response, not cron.job_run_details.
  select net.http_post(
           url                  => v_url,
           body                 => '{}'::jsonb,
           params               => '{}'::jsonb,
           headers              => jsonb_build_object(
                                     'Content-Type',    'application/json',
                                     'x-processor-key', v_key),
           timeout_milliseconds => 55000
         ) into v_req;
  return v_req;
end $$;
revoke all on function public.notifications_process_kick() from public, anon, authenticated;
grant execute on function public.notifications_process_kick() to service_role;
comment on function public.notifications_process_kick() is
  'Migration 138: pg_cron entrypoint that asks the web app to drain notification_deliveries. Vault-configured, host-allowlisted, fire-and-forget.';

comment on function public.azericard_reconcile_kick() is
  'Queues one POST to the web app''s AzeriCard reconciliation sweep. Credentials come from Vault; the target host is allowlisted in the body. Returns the pg_net request id, or NULL when not configured.';

revoke all on function public.azericard_reconcile_kick() from public, anon, authenticated;
grant execute on function public.azericard_reconcile_kick() to service_role;

-- =============================================================================
-- End of 011_indexes_constraints_functions_triggers.sql
-- =============================================================================
