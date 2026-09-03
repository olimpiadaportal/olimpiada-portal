-- =============================================================================
-- 2026_09_01_166 — THE APP STORE SERVER NOTIFICATION LOG: ONE MESSAGE, ONE
--                  CONSUMPTION. Schema only; no grant path, no seller.
--
-- !! NOT APPLIED. Written by the endpoint round and deliberately left unapplied.
--    Apply to OLIMPIADA_STAGING_DB_URL first, then OLIMPIADA_PROD_DB_URL, and
--    BEFORE the notification endpoints are pushed — the code that reads this
--    table is inert without it, and every notification would be answered 500 and
--    retried forever (CLAUDE.md: "database first, then push"). !!
--
-- WHY A TABLE AT ALL. Apple retries an App Store Server Notification V2 on any
-- non-2xx, and re-delivers on its own schedule besides; a message we already
-- acted on WILL arrive again. Every write underneath the endpoint is already
-- idempotent — entitlement_grant() upserts on (source, external_ref) and
-- entitlement_revoke() only touches rows whose revoked_at is null — so a replay
-- could never produce a SECOND grant. What a replay would produce without this
-- table is a second re-query against Apple's API, a second RPC round trip, and a
-- log line indistinguishable from a real event. This table makes a replay cost
-- one indexed lookup, and makes "did we ever see this message?" answerable
-- months later, which is the question a refund dispute actually asks.
--
-- THE KEY IS THE NOTIFICATION UUID, NOT THE TRANSACTION ID, and the choice is
-- load-bearing:
--   * notificationUUID is the identity of the MESSAGE. Apple mints one per
--     notification and repeats it verbatim on every retry of that same
--     notification. That is exactly the equivalence class "have I consumed this
--     message already?".
--   * transactionId is the identity of the SUBJECT, and several genuinely
--     different messages legitimately concern one transaction — a
--     CONSUMPTION_REQUEST today and a REFUND tomorrow are the same transaction
--     and must BOTH be acted on. Keying on it would swallow the REFUND, which is
--     the one message that must never be missed.
-- The transaction ids are still COLUMNS here, because they are how a human joins
-- this log to iap_purchase_intents and to entitlements. They are simply not the
-- key.
--
-- ENVIRONMENT IS PART OF THE KEY. A UUID collision between the sandbox and
-- production rails is not a realistic event; the composite key exists so that a
-- sandbox message can never be the reason a production message is dismissed as a
-- replay. One extra key column, in exchange for deleting a whole class of "why
-- did the reviewer's test make a real customer's grant vanish" reasoning.
--
-- CLAIM-THEN-SETTLE, AND WHY processed_at IS NULLABLE. The endpoint INSERTs the
-- row before it does any work and stamps processed_at + outcome after it. So:
--     row absent             -> never seen; process it
--     row present, unstamped -> a previous attempt died mid-flight; process it
--                               again (every underlying write is idempotent, so
--                               a second pass converges rather than duplicates)
--     row present, stamped   -> a genuine replay; do nothing, answer 200
-- A row that stays unstamped is therefore an ALARM, not a leak: it means an
-- attempt started and never finished. idx_iap_notifications_unsettled exists to
-- make that query free.
--
-- NO AUDIT TRIGGER, deliberately, for the reason iap_purchase_intents has none
-- (164): every row is written by service_role from one endpoint, one per
-- message, and the row IS its own record — append, then stamp, never edited by a
-- person. Copying it into audit_logs would double the busiest table in the rail
-- for no reconstructive gain.
--
-- RETENTION IS NOT SOLVED HERE, and saying so is better than pretending. Rows
-- accumulate at the rate of purchases and refunds, which is small, and they are
-- the evidence a chargeback is answered with. If a prune is ever wanted it
-- belongs in 016 as a cron job with a horizon measured in years, not here.
--
-- BACKPORT: public.iap_notifications belongs in 007 alongside the 164 tables.
-- =============================================================================
begin;

create table if not exists public.iap_notifications (
  -- Apple's own message id. THE dedupe key; see the header for why it is this
  -- and not the transaction id.
  notification_uuid       uuid not null,

  -- The RAIL that verified this message, never the payload's own claim. The
  -- production endpoint always writes 'Production' and the sandbox endpoint
  -- always writes 'Sandbox', because each route is bound to one verifier.
  environment             text not null,

  -- Apple's notificationType / subtype, stored as free text ON PURPOSE: a new
  -- member of Apple's vocabulary must be RECORDED and ignored, never rejected.
  -- An enum here would turn "Apple shipped a new notification type" into a 500
  -- and an endless retry loop.
  notification_type       text not null,
  subtype                 text,

  -- Join keys to iap_purchase_intents and entitlements. Nullable because a TEST
  -- notification carries no transaction at all, and because a message is claimed
  -- before its transaction is necessarily known.
  transaction_id          text,
  original_transaction_id text,
  product_id              text,

  received_at             timestamptz not null default now(),

  -- NULL until the message has been fully consumed. See CLAIM-THEN-SETTLE.
  processed_at            timestamptz,

  -- What we did: granted / revoked / ignored_type / unknown_product /
  -- sandbox_recorded / … Text rather than an enum for the same reason
  -- notification_type is: this vocabulary will grow, and a schema change is not
  -- an acceptable price for adding a diagnostic value.
  outcome                 text,

  constraint pk_iap_notifications primary key (notification_uuid, environment),

  constraint ck_iap_notification_environment
    check (environment in ('Production', 'Sandbox')),
  constraint ck_iap_notification_type_len
    check (length(notification_type) between 1 and 64),
  constraint ck_iap_notification_subtype_len
    check (subtype is null or length(subtype) between 1 and 64),

  -- The same 1..100 bound iap_purchase_intents.original_transaction_id and
  -- transaction.ts's TRANSACTION_ID_RE already use. The three must not disagree
  -- about what an Apple id may be, or a purchase one layer accepts is one
  -- another cannot record.
  constraint ck_iap_notification_txn
    check (transaction_id is null or length(transaction_id) between 1 and 100),
  constraint ck_iap_notification_orig_txn
    check (original_transaction_id is null
           or length(original_transaction_id) between 1 and 100),
  constraint ck_iap_notification_product
    check (product_id is null or length(product_id) between 1 and 200),
  constraint ck_iap_notification_outcome
    check (outcome is null or length(outcome) between 1 and 40),

  constraint ck_iap_notification_processed
    check (processed_at is null or processed_at >= received_at),

  -- A settled row must say what it settled AS. "Processed, outcome unknown" is
  -- not a state anybody can act on six months later.
  constraint ck_iap_notification_settled
    check (processed_at is null or outcome is not null)
);

comment on table public.iap_notifications is
  'Migration 165. One row per App Store Server Notification V2, keyed on Apple''s '
  'notificationUUID plus the rail that verified it. It is the REPLAY GUARD for '
  '/api/payments/apple/notifications and its sandbox twin: claimed before the '
  'work and stamped after it, so a retry of a message already consumed costs one '
  'indexed lookup. Keyed on the MESSAGE id and not the transaction id because '
  'several different messages legitimately concern one transaction — a '
  'CONSUMPTION_REQUEST and a later REFUND — and swallowing the second would miss '
  'the one notification that must never be missed. Written by service_role only.';

comment on column public.iap_notifications.environment is
  'The RAIL that verified the message, never the payload''s own environment '
  'claim. Part of the primary key so a sandbox message can never be the reason a '
  'production message is dismissed as a replay.';

comment on column public.iap_notifications.processed_at is
  'NULL means an attempt STARTED and did not finish — an alarm, not a leak. The '
  'endpoint claims the row before doing any work and stamps it afterwards, so an '
  'unstamped row is re-processed on Apple''s next retry; every write underneath '
  'is idempotent, so a second pass converges rather than duplicating.';

comment on column public.iap_notifications.notification_type is
  'Apple''s notificationType, as free text. NOT an enum: a new member of Apple''s '
  'vocabulary must be recorded and ignored, never rejected — an enum would turn '
  '"Apple shipped a new notification type" into a 500 and an endless retry loop.';

-- THE ALARM QUERY. A row claimed and never settled is the only way a
-- notification can be silently lost, so finding them must be free.
create index if not exists idx_iap_notifications_unsettled
  on public.iap_notifications (received_at)
  where processed_at is null;

-- Support's join: "this family says they were refunded — what did Apple tell us
-- about that transaction, and when?"
create index if not exists idx_iap_notifications_orig_txn
  on public.iap_notifications (original_transaction_id)
  where original_transaction_id is not null;

-- -----------------------------------------------------------------------------
-- RLS. Read for staff only; NO write policy for anyone, ever — following
-- iap_purchase_intents (164) and entitlements. A hand-written row here would be
-- a claim that a message was consumed, which is precisely how a real REFUND gets
-- dismissed as a replay.
--
-- Not readable by a parent either, unlike iap_purchase_intents: a parent has no
-- question this table answers that their own intent row does not, and the rows
-- carry Apple's message vocabulary rather than anything about their family.
--
-- Every predicate wrapped as `(select fn())` — the migration-149 hoisting rule.
-- -----------------------------------------------------------------------------
alter table public.iap_notifications enable row level security;

drop policy if exists "iap_notifications_select" on public.iap_notifications;
create policy "iap_notifications_select" on public.iap_notifications for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('payments.manage'))
  );

-- 010:84-86's `alter default privileges` hands new tables SELECT to anon and
-- INSERT/UPDATE/DELETE to authenticated, so both have to be taken back
-- explicitly; RLS alone would not stop anon reading this.
revoke all    on public.iap_notifications from anon, authenticated;
grant  select on public.iap_notifications to   authenticated;  -- gated by the policy above

-- service_role EXPLICITLY. 010:80 is a one-time grant that cannot reach a table
-- created afterwards, and the endpoints are the only writer: a silently missing
-- grant here is every Apple notification answered 500 and retried forever.
grant all on public.iap_notifications to service_role;

-- -----------------------------------------------------------------------------
-- Validation.
-- -----------------------------------------------------------------------------
do $$
declare
  c   text;
  v_n int;
begin
  if to_regclass('public.iap_notifications') is null then
    raise exception '165: iap_notifications was not created';
  end if;

  foreach c in array array[
    'pk_iap_notifications',
    'ck_iap_notification_environment',
    'ck_iap_notification_txn',
    'ck_iap_notification_orig_txn',
    'ck_iap_notification_settled'
  ] loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '165: constraint % is missing', c;
    end if;
  end loop;

  foreach c in array array[
    'idx_iap_notifications_unsettled',
    'idx_iap_notifications_orig_txn'
  ] loop
    if not exists (select 1 from pg_indexes
                    where schemaname = 'public' and indexname = c) then
      raise exception '165: index % is missing', c;
    end if;
  end loop;

  if not (select relrowsecurity from pg_class
           where oid = 'public.iap_notifications'::regclass) then
    raise exception '165: RLS is not enabled on iap_notifications';
  end if;

  -- NO write policy, for anybody. This assertion is what stops a future "let
  -- admins tidy this up" patch from making a real REFUND look consumed.
  select count(*)::int into v_n
    from pg_policies
   where schemaname = 'public' and tablename = 'iap_notifications'
     and cmd <> 'SELECT';
  if v_n > 0 then
    raise exception '165: iap_notifications has % non-SELECT policy/policies', v_n;
  end if;

  if not has_table_privilege('service_role', 'public.iap_notifications', 'INSERT') then
    raise exception '165: service_role cannot INSERT into iap_notifications';
  end if;
  if has_table_privilege('anon', 'public.iap_notifications', 'SELECT') then
    raise exception '165: anon can SELECT iap_notifications';
  end if;

  raise notice '165: the App Store notification log is installed; a replayed notification is now one lookup';
end $$;

commit;
