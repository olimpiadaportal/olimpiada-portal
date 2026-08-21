-- =============================================================================
-- 2026_08_20_124_entitlements.sql
-- =============================================================================
-- Migration: 2026_08_20_124_entitlements.sql
-- Purpose: Create public.entitlements -- THE access record -- and move every
--          access gate in the platform onto it.
--
--          WHY THIS EXISTS. docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 requires
--          entitlement to be its own provider-agnostic table
--          (source in abb_web | apple_iap | google_play | giveaway | manual |
--          school_license), with ABB as ONE PRODUCER of rows and never the
--          source of truth for access. Until now access was read straight off
--          the subscription and purchase rows by four functions. That is the
--          arrangement which turns "Apple forces IAP" into a rewrite instead of
--          roughly a two-week job: an Apple subscription has no AZN price, no
--          sibling discount and no billing container to hang off a
--          child_subscriptions row, so every gate would have to learn a second
--          shape. After this migration there is one shape, and a new rail is
--          one call site.
--
--          THE GRAIN IS ONE ROW PER GRANT, keyed (source, external_ref), with
--          NO uniqueness on (student, product) anywhere. That absence is the
--          design: on forced-IAP day the same child+subject must be able to
--          hold a live abb_web grant AND a live apple_iap grant at once.
--          Access is the OR over live rows, and liveness is COMPUTED -- there
--          is deliberately no stored status column, because this codebase
--          already ran that experiment (students.access_status is documented
--          inside the gate itself as "a display cache, not authority", and
--          recompute_child_access exists solely to repair its drift).
--
--          THE PRODUCERS STAY AUTHORITATIVE FOR MONEY. subscription rows and
--          olympiad_purchases remain the record of the TRANSACTION; three
--          column-scoped triggers MIRROR them into entitlements through ONE
--          mapping expression (fn_entitlement_map_subject /
--          fn_entitlement_map_purchase), and entitlements_reconcile() re-runs
--          that same expression hourly so drift is bounded by an hour rather
--          than unbounded. Because trigger, reconciler and backfill are the
--          same code, the parity assertions below prove the TABLE matches the
--          PRODUCERS, not that an expression matches itself.
--
--          BEHAVIOUR IS PRESERVED BYTE-FOR-BYTE. The end date the mapper
--          computes is the old gate's own expression
--          (least(cs.current_period_end, ss.current_period_end) -- the coalesce
--          arm, spelled as a conjunction). subscription_subjects.remove_at is
--          deliberately NOT consulted, exactly as the DB gate never consulted
--          it: admin_manage_child_subscription('extend') pushes a subject's
--          period end forward WITHOUT touching remove_at, so honouring it here
--          would lock out a child an admin had deliberately extended.
--
--          THE GIVEAWAY WINDOW AND FREE-ACCESS INTERVALS STAY LAZY. They are
--          NOT materialised into per-child rows -- a global window that owns
--          rows needs a job to unwind it on expiry, and between runs it is
--          wrong in the direction of free access. They are evaluated inside
--          has_subject_access(), which is also what makes the three subject
--          gates incapable of disagreeing about the ORDER of the checks ever
--          again.
--
--          LIFETIME OLYMPIAD ACCESS IS UNTOUCHED, INCLUDING FOR ARCHIVED
--          PACKAGES (a CLAUDE.md non-negotiable). can_view_olympiad_package is
--          EXTENDED, never refactored: its purchase branch is kept byte for
--          byte because olympiad_purchases.student_profile_id is ON DELETE SET
--          NULL (audit M13) while entitlements.student_profile_id is NOT NULL
--          and CASCADEs -- so a parent who deletes a child can only keep seeing
--          the package they bought for life through the purchase row. That
--          branch reads no status today and still reads none; the new
--          entitlement branch filters on neither withdrawal nor expiry, so a
--          refunded family keeps the catalog row exactly as it does now.
--
--          NOTE ON PHASING. The architecture note that produced this design
--          split it into two migrations with a production gate between them
--          (backfill and mirror first; switch the readers only after the
--          parity check had read PASS on production). The instruction for this
--          change requires the backfill to happen BEFORE the readers switch
--          inside ONE transaction, so both halves are here, in that order,
--          with the parity proof asserted twice: once against the table and
--          once through the new readers. The cost of collapsing the phases is
--          that the mirror does not get a soak period against real writes
--          before the gates depend on it; the mitigations are the in-transaction
--          assertions below (which ABORT rather than half-apply), the hourly
--          reconciler, and 013 checks 113-116.
--
--          WHAT THIS MIGRATION DELIBERATELY DOES NOT DO. It does not enable any
--          payment flag, does not change the payment mode (still `off`), and
--          does not give the AzeriCard callback a write path into entitlements.
--          A producer that bypasses the mirror is by definition the first
--          drift, and such a row would carry no invoice and no ledger entry to
--          reconcile against; the sub:/oly: external_ref namespace is REFUSED
--          by entitlement_grant() to make that structural. When the ABB rail is
--          wired it writes the PRODUCER row (child_subscriptions /
--          subscription_subjects / olympiad_purchases) after signature
--          verification, the TRTYPE=90 re-query, the transaction-identity match
--          and assert_payments_enabled(), and the trigger writes the
--          entitlement. checkout_sessions still carries no student_profile_id
--          and no grant intent, which is harmless while that rail provisions
--          first and charges second, and is a blocker the day it charges first
--          -- tracked, not fixed here.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 001_extensions_and_enums.sql -- entitlement_scope,
--                    entitlement_source;
--          * 007_subscriptions_payments_coupons.sql -- the table, its seven
--                    named CHECKs and the FKs that do not need 015;
--          * 010_rls_policies.sql -- 'entitlements' in the RLS-enable array and
--                    the SELECT-only policy;
--          * 011_indexes_constraints_functions_triggers.sql -- the seven
--                    indexes, the updated_at + audit triggers, the table
--                    privileges (which MUST live in 011, after 010's blanket
--                    grants), the mapper/producer/reconciler/grant/revoke
--                    functions, the two subscription triggers, the two readers,
--                    my_accessible_subjects, the four rewritten gates and
--                    subject_deletion_blocks;
--          * 013_validation_queries.sql -- NEW checks 111-116 AND amendments to
--                    checks 37, 42 and 46, which assert substrings that this
--                    change deliberately moves;
--          * 015_olympiad_preparation.sql -- the two deferred FKs, the purchase
--                    trigger, the EXTENDED can_view_olympiad_package and
--                    olympiad_package_deletion_blocks;
--          * 016_scheduled_jobs.sql -- the hourly reconciler at :22.
-- Backport status: completed
-- Destructive change: no. No producer row is deleted or rewritten by this
--          migration; it only ADDS a table and REPLACES function bodies, so
--          rollback is `create or replace` from git plus dropping the three
--          triggers. No pg_dump prerequisite.
-- Rollback notes:
--          1. Restore the six previous function bodies from git
--             (start_practice_attempt, start_topic_test_attempt,
--             start_daily_round_attempt, start_olympiad_attempt,
--             can_view_olympiad_package, subject_deletion_blocks,
--             olympiad_package_deletion_blocks). The producer tables were never
--             touched, so the old predicate is one statement away.
--          2. drop trigger trg_entitlements_from_sub_subjects, ..._from_child_subs,
--             ..._from_purchases; select cron.unschedule('olympiq_entitlements_reconcile').
--          3. LEAVE THE TABLE. It is inert once nothing reads it, and dropping
--             it discards a backfill that would only have to be redone.
--
-- SELF-TRANSACTING. This file wraps itself in begin/commit, matching migrations
-- 120, 121 and 123. It must NEVER be `\i`'d inside a from-zero rebuild -- that
-- is the CLAUDE.md rule migration 095 exists to enforce, and it is a rule about
-- how a rebuild is run, not about whether a migration may transact. Run bare,
-- against staging first, then production.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Freeze the producers for the duration. Cheap at this size (a couple of
--    dozen rows), and it is what makes "backfill, prove, then arm the triggers"
--    a safe order instead of a race: no producer write can slip into the gap.
-- -----------------------------------------------------------------------------
lock table public.subscription_subjects,
           public.child_subscriptions,
           public.olympiad_purchases
  in share row exclusive mode;

-- -----------------------------------------------------------------------------
-- 1. Enums  (backport -> 001)
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- ENTITLEMENT vocabulary (migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md
-- §4.1). `scope` says WHAT was granted; `source` says WHICH RAIL produced the
-- grant -- the producer, never the commercial flavour. There is deliberately no
-- 'trial', 'promo' or 'giveaway_window' value: a trial is an abb_web grant with
-- a short period, and the giveaway is a COMPUTED window that owns no rows at
-- all. The source list is §4.1's, verbatim and in order; extending it is an
-- owner decision, because every value is a rail somebody has to reconcile
-- money for.
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.entitlement_scope as enum ('subject', 'olympiad_package');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entitlement_source as enum
    ('abb_web', 'apple_iap', 'google_play', 'giveaway', 'manual', 'school_license');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. The table  (backport -> 007, plus the two deferred FKs -> 015)
-- -----------------------------------------------------------------------------
-- =============================================================================
-- entitlements : THE ACCESS RECORD (migration 124).
-- docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 — provider-agnostic, and the only
-- thing any gate is allowed to read. An ABB subscription row must NEVER *be*
-- the entitlement: that separation is what makes a forced-IAP scenario roughly
-- a two-week job instead of a rewrite.
--
-- GRAIN: one row per GRANT, keyed (source, external_ref). There is
-- deliberately NO unique index on (student, product) anywhere — on forced-IAP
-- day the same child+subject must be able to hold a LIVE abb_web grant AND a
-- LIVE apple_iap grant at the same time, and any (student, product) uniqueness
-- would make that state unrepresentable. Access is the OR over live rows.
--
-- NO `status` COLUMN. Liveness is COMPUTED:
--     revoked_at is null and starts_at <= now()
--     and (ends_at is null or ends_at > now())
-- This codebase already ran the other experiment: students.access_status is
-- documented inside the gate itself as "a display cache, not authority", and
-- recompute_child_access() exists solely to repair its drift. A stored liveness
-- flag needs a sweeper, and between sweeps it is wrong — drifting toward FREE
-- ACCESS, which is the wrong direction to be wrong in.
--
-- THE MIRROR. A row carrying a producer link (child_subscription_id /
-- olympiad_purchase_id) is MIRRORED from that producer by
-- fn_entitlement_map_subject / fn_entitlement_map_purchase (011). A direct
-- UPDATE on such a row is reverted by the next producer write or by the next
-- entitlements_reconcile(). Revocation of a mirrored grant is expressed on the
-- PRODUCER (olympiad_purchases.status = 'refunded', a subscription status
-- change). Manual/IAP grants carry both links NULL and the mirror never
-- touches them.
-- =============================================================================
create table if not exists public.entitlements (
  id                    uuid primary key default gen_random_uuid(),

  -- WHO. Access is per CHILD. The payer lives in the financial tables.
  student_profile_id    uuid not null references public.students (profile_id) on delete cascade,

  -- WHAT. Exactly one target; ck_entitlement_target enforces it.
  scope                 public.entitlement_scope not null,
  subject_id            uuid references public.subjects (id) on delete cascade,
  -- fk_entitlements_package is added in 015 — olympiad_packages does not exist
  -- yet at this point in the canonical run order.
  package_id            uuid,
  grade_id              uuid references public.grades (id) on delete set null,

  -- WHO GRANTED IT. (source, external_ref) is simultaneously the provider's
  -- idempotency key and the upsert conflict target: 'sub:<cs>:<subject>',
  -- 'oly:<purchase>', Apple's originalTransactionId, Play's purchase token,
  -- 'manual:<uuid>'. It is STABLE across renewals — history lives in
  -- audit_logs, and a stable ref makes reconciliation an exact set comparison
  -- instead of a staleness hunt.
  source                public.entitlement_source not null,
  external_ref          text not null,
  provider_account_ref  text,

  -- WHEN. Lazy. No job decides access.
  starts_at             timestamptz not null default now(),
  ends_at               timestamptz,            -- NULL = lifetime (packages only)
  revoked_at            timestamptz,
  revoked_reason        text,

  -- PROVENANCE. Never read by a gate; this is the mirror scope.
  child_subscription_id uuid references public.child_subscriptions (id) on delete cascade,
  -- fk_entitlements_purchase is added in 015 (olympiad_purchases does not
  -- exist yet either).
  olympiad_purchase_id  uuid,
  granted_by_profile_id uuid references public.profiles (id) on delete set null,
  note                  text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint ck_entitlement_target check (
       (scope = 'subject'          and subject_id is not null and package_id is null)
    or (scope = 'olympiad_package' and package_id is not null and subject_id is null)),

  -- A subject grant can NEVER be lifetime. NULL ends_at means forever, and the
  -- live estate contains legacy NULL-period subscription rows that grant
  -- NOTHING today; this makes "backfilled it forward into free-forever maths"
  -- unrepresentable rather than merely unlikely.
  constraint ck_entitlement_bounded check (scope <> 'subject' or ends_at is not null),

  -- CLAUDE.md's LIFETIME rule as a constraint instead of a convention: a
  -- purchased olympiad package never expires, not even for an archived
  -- package. A future school licence wanting one academic year hits this on
  -- purpose — it forces a reviewed migration and an owner decision instead of
  -- a silent semantic change.
  constraint ck_entitlement_lifetime check (scope <> 'olympiad_package' or ends_at is null),

  constraint ck_entitlement_grade   check (scope = 'olympiad_package' or grade_id is null),
  constraint ck_entitlement_window  check (ends_at is null or ends_at > starts_at),
  constraint ck_entitlement_ref     check (length(external_ref) between 1 and 200),
  constraint ck_entitlement_reason  check (revoked_reason is null or
                                           (revoked_at is not null and length(revoked_reason) <= 200))
);

comment on table public.entitlements is
  'THE access record (STORE_PAYMENTS_COMPLIANCE §4.1). One row per GRANT, keyed '
  '(source, external_ref). Access is the OR over LIVE rows: revoked_at IS NULL '
  'AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()). There is '
  'deliberately NO unique index on (student, product) — one child may hold a '
  'live abb_web grant AND a live apple_iap grant for the same subject. '
  'Rows with a producer link (child_subscription_id / olympiad_purchase_id) are '
  'MIRRORED: a direct UPDATE on one is reverted by the next producer write or by '
  'entitlements_reconcile(). Revocation of a mirrored grant is expressed on the '
  'PRODUCER. Manual grants (both links NULL) are never touched by the mirror.';

comment on column public.entitlements.external_ref is
  'The producer''s idempotency key AND the upsert target, namespaced by rail: '
  'sub:<child_subscription>:<subject> | oly:<purchase> | Apple '
  'originalTransactionId | Play purchase token | manual:<uuid>. Stable across '
  'renewals — a renewal moves ends_at, it does not mint a row.';

comment on column public.entitlements.source is
  'The RAIL that produced the grant, never the commercial flavour. A trial is '
  'an abb_web grant with a short period; the giveaway window owns no rows at all.';

-- -----------------------------------------------------------------------------
-- entitlements -> olympiad (migration 124). The two FKs that could not live in
-- 007: olympiad_packages / olympiad_purchases do not exist yet at that point in
-- the canonical run order.
--
-- RESTRICT on package_id mirrors olympiad_purchases.olympiad_package_id
-- exactly, so a package with a grant behind it can never be deleted out from
-- under it. It is safe against the only hard-delete path
-- (admin_delete_olympiad_package / rollbackNewPackage), which already refuses
-- any package carrying purchases — and zero purchases implies zero MIRRORED
-- entitlements. A future non-producer grant (apple_iap, school_license) would
-- otherwise abort with a bare 23503, which is why
-- olympiad_package_deletion_blocks gains a package_has_entitlements hint in the
-- same change.
--
-- CASCADE on olympiad_purchase_id: the link is the mirror scope, and a row
-- whose producer is gone must not survive as free access. Cascade is the
-- fail-closed direction.
-- -----------------------------------------------------------------------------
do $$ begin
  alter table public.entitlements
    add constraint fk_entitlements_package foreign key (package_id)
      references public.olympiad_packages (id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.entitlements
    add constraint fk_entitlements_purchase foreign key (olympiad_purchase_id)
      references public.olympiad_purchases (id) on delete cascade;
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 3. Indexes  (backport -> 011)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. updated_at + audit triggers  (backport -> 011: 'entitlements' joins the
--    set_updated_at table array, and the audit trigger follows the money-trail
--    pattern used for child_subscriptions and olympiad_purchases)
-- -----------------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.entitlements;
create trigger trg_set_updated_at before update on public.entitlements
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_entitlements on public.entitlements;
create trigger trg_audit_entitlements
  after insert or update or delete on public.entitlements
  for each row execute function public.fn_audit_row();

-- -----------------------------------------------------------------------------
-- 5. RLS  (backport -> 010)
-- -----------------------------------------------------------------------------
alter table public.entitlements enable row level security;

-- entitlements (migration 124): the family READS its own grants; NOBODY writes
-- through the API. The read rule mirrors child_subs_select plus the
-- creator-parent clause olympiad_purchases_select carries, so "what you are
-- billed for" and "what you are entitled to" can never drift apart in the UI.
--
-- WRITE POSTURE IS DELIBERATELY STRICTER THAN EVERY COMPARABLE TABLE.
-- child_subs_write and olympiad_purchases_write both allow is_admin(); this
-- allows nobody. An admin with direct INSERT can mint free lifetime access
-- with no reason string and no producer row behind it. Comps go through
-- admin_grant_entitlement() (011) from an authorized, audited admin action —
-- which is also the only route that records granted_by_profile_id.
drop policy if exists "entitlements_select" on public.entitlements;
create policy "entitlements_select" on public.entitlements for select to authenticated
  using (
    student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or exists (select 1 from public.students s
               where s.profile_id = student_profile_id
                 and s.created_by_parent_profile_id = public.current_profile_id())
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  );
-- NO insert/update/delete policy, for anyone, ever. Not even admins.

-- -----------------------------------------------------------------------------
-- 6. Privileges, the producer mapping, the reconciler, the grant surface and
--    the two readers  (backport -> 011)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 7. THE BACKFILL. One call, and it is the SAME code path the triggers use and
--    the hourly cron job re-proves forever. A bespoke backfill query would have
--    been a second definition of the mapping, and the parity proof below would
--    then only have shown that two hand-written expressions agree with each
--    other today.
-- -----------------------------------------------------------------------------
do $mig$
declare v_res jsonb;
begin
  v_res := public.entitlements_reconcile();
  raise notice 'entitlements 124: backfill %', v_res::text;
end $mig$;

-- Print the distribution rather than assuming it. EXPECT every backfilled row
-- to land on source = 'manual': child_subscriptions.provider defaults to 'none'
-- and is 'admin_grant' for comps, the payment mode has been `off`, and the
-- AzeriCard layer has deliberately granted nothing. Calling those rows
-- 'abb_web' would put revenue we never took into every future reconciliation
-- report, so a human reviewing the staging run must be able to object here.
do $mig$
declare r record;
begin
  for r in select e.source::text as src, e.scope::text as scp,
                  (e.revoked_at is not null) as revoked, count(*) as n
             from public.entitlements e
            group by 1, 2, 3 order by 1, 2, 3
  loop
    raise notice 'entitlements 124: source=% scope=% revoked=% rows=%',
                 r.src, r.scp, r.revoked, r.n;
  end loop;
end $mig$;

-- -----------------------------------------------------------------------------
-- 8. VERIFY -- PRODUCER COVERAGE. Every mappable producer pair has exactly one
--    grant, and no grant exists without one. A cutover that half-worked is
--    worse than one that refused, so every failure here ABORTS the transaction.
-- -----------------------------------------------------------------------------
do $mig$
declare
  v_ss int; v_pu int; v_es int; v_ep int; v_drift int;
begin
  select count(*) into v_ss from public.subscription_subjects;
  select count(*) into v_pu from public.olympiad_purchases;
  select count(*) into v_es from public.entitlements where scope = 'subject';
  select count(*) into v_ep from public.entitlements where scope = 'olympiad_package';
  raise notice 'entitlements 124: subscription_subjects=% purchases=% subject_grants=% package_grants=%',
               v_ss, v_pu, v_es, v_ep;

  -- MAPPABLE = the pair exists, the subscription has a student, and it has a
  -- coverage end. A legacy NULL-period row grants nothing today and must
  -- produce no row -- its NULL ends_at would otherwise read as LIFETIME.
  select count(*) into v_drift from (
    (select ss.child_subscription_id as a, ss.subject_id as b
       from public.subscription_subjects ss
       join public.child_subscriptions cs on cs.id = ss.child_subscription_id
      where cs.student_profile_id is not null
        and cs.current_period_end is not null
     except
     select e.child_subscription_id, e.subject_id
       from public.entitlements e where e.scope = 'subject')
    union all
    (select e.child_subscription_id, e.subject_id
       from public.entitlements e where e.scope = 'subject'
     except
     select ss.child_subscription_id, ss.subject_id
       from public.subscription_subjects ss
       join public.child_subscriptions cs on cs.id = ss.child_subscription_id
      where cs.student_profile_id is not null
        and cs.current_period_end is not null)) d;
  if v_drift <> 0 then
    raise exception 'entitlements 124: % subject producer pairs are not mirrored 1:1 -- aborting', v_drift;
  end if;

  select count(*) into v_drift from (
    (select pu.id from public.olympiad_purchases pu where pu.student_profile_id is not null
     except
     select e.olympiad_purchase_id from public.entitlements e where e.scope = 'olympiad_package')
    union all
    (select e.olympiad_purchase_id from public.entitlements e where e.scope = 'olympiad_package'
     except
     select pu.id from public.olympiad_purchases pu where pu.student_profile_id is not null)) d;
  if v_drift <> 0 then
    raise exception 'entitlements 124: % purchases are not mirrored 1:1 -- aborting', v_drift;
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 9. VERIFY -- ACCESS PARITY (set equality, both directions).
--    Row COUNTS prove nothing: twelve rows on each side can be twelve
--    DIFFERENT rows. The left-hand predicates are the old gates verbatim.
-- -----------------------------------------------------------------------------
do $mig$
declare v_drift int;
begin
  with old_subject as (
    select cs.student_profile_id as sid, ss.subject_id as pid
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    where cs.status in ('trialing', 'active', 'canceled')
      and cs.current_period_end is not null
      and cs.current_period_end > now()
      and coalesce(ss.current_period_end, cs.current_period_end) > now()
  ), new_subject as (
    select e.student_profile_id as sid, e.subject_id as pid
    from public.entitlements e
    where e.scope = 'subject' and e.revoked_at is null
      and e.starts_at <= now() and e.ends_at > now()
  ), old_pkg as (
    select pu.student_profile_id as sid, pu.olympiad_package_id as pid
    from public.olympiad_purchases pu
    where pu.status = 'active' and pu.student_profile_id is not null
  ), new_pkg as (
    select e.student_profile_id as sid, e.package_id as pid
    from public.entitlements e
    where e.scope = 'olympiad_package' and e.revoked_at is null
      and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
  )
  select count(*) into v_drift from (
    (table old_subject except table new_subject) union all
    (table new_subject except table old_subject) union all
    (table old_pkg     except table new_pkg)     union all
    (table new_pkg     except table old_pkg)) d;

  if v_drift <> 0 then
    raise exception 'entitlements 124: % access rows differ between the old rule and the table -- aborting', v_drift;
  end if;
  raise notice 'entitlements 124: access parity OK (0 rows differ).';
end $mig$;

-- -----------------------------------------------------------------------------
-- 10. VERIFY -- SHAPE INVARIANTS AND CONVERGENCE.
--     The second reconcile must change NOTHING. That proves two things at once:
--     every mirrored row already equals its recomputed value, and the hourly
--     cron job is a true no-op rather than something that rewrites (and audits)
--     the whole table every hour.
-- -----------------------------------------------------------------------------
do $mig$
declare
  v_n int; v_before text; v_after text; v_res jsonb;
begin
  select count(*) into v_n from public.entitlements
   where scope = 'subject' and ends_at is null;
  if v_n <> 0 then
    raise exception 'entitlements 124: % subject grants have no end date (that reads as LIFETIME) -- aborting', v_n;
  end if;

  select count(*) into v_n from public.entitlements
   where scope = 'olympiad_package' and ends_at is not null;
  if v_n <> 0 then
    raise exception 'entitlements 124: % package grants carry an end date (lifetime is non-negotiable) -- aborting', v_n;
  end if;

  select md5(coalesce(string_agg(x, '|' order by x), '')) into v_before from (
    select e.id::text || '~' || e.source::text || '~' || e.external_ref || '~'
        || e.starts_at::text || '~' || coalesce(e.ends_at::text, '') || '~'
        || coalesce(e.revoked_at::text, '') || '~' || coalesce(e.revoked_reason, '') || '~'
        || coalesce(e.grade_id::text, '') || '~' || e.student_profile_id::text as x
      from public.entitlements e) s;

  v_res := public.entitlements_reconcile();

  select md5(coalesce(string_agg(x, '|' order by x), '')) into v_after from (
    select e.id::text || '~' || e.source::text || '~' || e.external_ref || '~'
        || e.starts_at::text || '~' || coalesce(e.ends_at::text, '') || '~'
        || coalesce(e.revoked_at::text, '') || '~' || coalesce(e.revoked_reason, '') || '~'
        || coalesce(e.grade_id::text, '') || '~' || e.student_profile_id::text as x
      from public.entitlements e) s;

  if v_before is distinct from v_after then
    raise exception 'entitlements 124: a second reconcile changed the table -- the mapper is not convergent, aborting';
  end if;
  raise notice 'entitlements 124: mapper is convergent (a repeat reconcile changed nothing).';
end $mig$;

-- -----------------------------------------------------------------------------
-- 11. ARM THE MIRROR. After the backfill, so it never raced it, and while the
--     producers are still locked.  (backport -> 011 and 015)
-- -----------------------------------------------------------------------------
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
  after update of status, current_period_end, current_period_start
  on public.child_subscriptions
  for each row
  when (old.status               is distinct from new.status
     or old.current_period_end   is distinct from new.current_period_end
     or old.current_period_start is distinct from new.current_period_start)
  execute function public.tg_entitlements_subscription();

-- The purchase half of the entitlement mirror (migration 124). Column-scoped:
-- an amount or provider_payment_id correction changes nothing about ACCESS, and
-- an unfiltered trigger would write a redundant entitlement row AND an audit row
-- on every one of them.
drop trigger if exists trg_entitlements_from_purchases on public.olympiad_purchases;
create trigger trg_entitlements_from_purchases
  after insert or update of status, grade_id, student_profile_id
  on public.olympiad_purchases
  for each row execute function public.tg_entitlements_purchase();

-- -----------------------------------------------------------------------------
-- 12. SWITCH THE READERS. Everything below is `create or replace` on an
--     existing signature -- no `drop function` anywhere, because dropping would
--     discard the ACLs and the comments for no gain. Each function body is
--     IDENTICAL to the one in git except for the access block; the draws, the
--     resume logic, Round-43 day consumption and the Round-49 rotation are
--     untouched, and every gate still runs before any row is created.
--
--     The ACL lines are restated in full after each one. `create or replace`
--     PRESERVES privileges, so they are strictly redundant on a live database
--     -- and they are the only way a from-zero build and a patched database end
--     up identical, which is the property 010's blanket
--     `alter default privileges ... grant execute on functions to anon,
--     authenticated` makes worth guaranteeing.  (backport -> 011, 015)
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
revoke all on function public.start_practice_attempt(uuid, int) from public, anon;
grant execute on function public.start_practice_attempt(uuid, int) to authenticated, service_role;

-- ---- start_topic_test_attempt ----
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
  select id, deadline_at, duration_seconds into v_existing
  from public.test_attempts
  where student_profile_id = v_student and kind = 'test' and status = 'in_progress'
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
     question_ids, deadline_at, duration_seconds, topic_ids, subtopic_ids, is_rated)
  values
    (v_student, p_subject_id, 'test', 'in_progress',
     v_qids, null, null, v_topics, v_subs, false)
  returning id into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id)
  select v_attempt, unnest(v_qids);

  return jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', false, 'rated', false,
    'deadline_at', null, 'duration_seconds', null,
    'count', cardinality(v_qids));
end;
$$;
revoke all on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.start_topic_test_attempt(uuid, uuid[], uuid[]) to authenticated, service_role;

-- ---- start_daily_round_attempt ----
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
  v_rated    boolean := (coalesce(p_day, 'today') = 'today');
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

  v_date := (now() at time zone 'Asia/Baku')::date - (case when v_rated then 0 else 1 end);

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
     deadline_at, duration_seconds, is_rated, round_date)
  values
    (v_student, p_subject_id, 'daily', 'in_progress', v_qids,
     null, null, v_rated, v_date)
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
revoke all on function public.start_daily_round_attempt(uuid, text) from public, anon;
grant execute on function public.start_daily_round_attempt(uuid, text) to authenticated, service_role;

-- ---- start_olympiad_attempt ----
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
revoke all on function public.start_olympiad_attempt(uuid) from public, anon;
grant execute on function public.start_olympiad_attempt(uuid) to authenticated, service_role;

-- ---- can_view_olympiad_package (EXTENDED, not refactored) ----
create or replace function public.can_view_olympiad_package(p_package_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.olympiad_packages p
    where p.id = p_package_id
      and (
        public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
        or public.is_admin()
        or exists (
             select 1 from public.entitlements e
             where e.package_id = p.id
               and e.scope = 'olympiad_package'
               and (
                 e.student_profile_id = public.current_profile_id()
                 or public.is_parent_linked_to_student(e.student_profile_id)
                 or exists (select 1 from public.students s
                            where s.profile_id = e.student_profile_id
                              and s.created_by_parent_profile_id = public.current_profile_id())
               )
           )
        or exists (
             select 1 from public.olympiad_purchases pu
             where pu.olympiad_package_id = p.id
               and (
                 pu.owner_parent_profile_id = public.current_profile_id()
                 or pu.student_profile_id = public.current_profile_id()
                 or public.is_parent_linked_to_student(pu.student_profile_id)
                 or exists (select 1 from public.students s
                            where s.profile_id = pu.student_profile_id
                              and s.created_by_parent_profile_id = public.current_profile_id())
               )
           )
      )
  )
$$;
comment on function public.can_view_olympiad_package(uuid) is
  'Row visibility for olympiad packages + their translations (migration 070, '
  'EXTENDED by migration 124): on sale (olympiad_package_on_sale) OR admin OR '
  'anyone in the ENTITLEMENT family OR anyone in the PURCHASE family (purchaser '
  'parent / the child / active linked parent / creator parent — the '
  'olympiad_purchases_select rule). Purchasers keep reading a package after the '
  'sales window forever (lifetime access, no entitlement expiry). '
  'THREE THINGS THIS MUST NEVER DO, each a CLAUDE.md non-negotiable or a silent '
  'behaviour change: read the package''s own catalog status outside the sale '
  'predicate (an ARCHIVED-but-purchased package stays visible); filter the '
  'entitlement branch on withdrawal (today''s purchase branch is status-blind, '
  'so a refunded family keeps its catalog row); or filter it on an expiry column '
  '(a package grant is lifetime, and ck_entitlement_lifetime already guarantees '
  'the column is empty). The PURCHASE branch is kept because '
  'olympiad_purchases.student_profile_id is ON DELETE SET NULL (audit M13) while '
  'entitlements.student_profile_id is NOT NULL and CASCADEs — a parent who '
  'deletes a child would otherwise lose sight of a package they bought for life. '
  'This is catalog VISIBILITY, not the access gate; the gate is '
  'start_olympiad_attempt, which reads entitlements exclusively.';
revoke all on function public.can_view_olympiad_package(uuid) from public;
grant execute on function public.can_view_olympiad_package(uuid) to anon, authenticated, service_role;

-- ---- deletion guards learn about grants ----
-- Without these the panel renders a bare 23503 (package) or silently CASCADEs
-- a grant away (subject) -- the exact "server error" failure migration 111
-- exists to eliminate.
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

create or replace function public.olympiad_package_deletion_blocks(p_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v      jsonb := '[]'::jsonb;
  n      int;
  v_pool uuid[];
begin
  -- 1. LIFETIME ACCESS. Any purchase row in any status. The FK is already
  --    RESTRICT, but it raises a bare 23503; this raises a countable reason the
  --    panel can turn into "N people bought this — archive it instead".
  select count(*)::int into n
  from public.olympiad_purchases where olympiad_package_id = p_package_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_has_purchases', 'count', n);
  end if;

  -- 2. An ACTIVE listing must be archived first. Deleting a live catalog entry
  --    in one click is how a package vanishes from under a browsing parent; an
  --    irreversible destruction of a whole product gets two deliberate steps.
  select count(*)::int into n
  from public.olympiad_packages
  where id = p_package_id and status = 'active';
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_is_active', 'count', n);
  end if;

  -- 3. An attempt in flight. Also the mitigation for the delete/answer race in
  --    purge_question_set: an answer row can only appear through a submit RPC
  --    on an in-progress attempt.
  select coalesce(array_agg(q.id), '{}'::uuid[]) into v_pool
  from public.questions q where q.olympiad_package_id = p_package_id;
  select count(*)::int into n
  from public.test_attempts ta
  where ta.status = 'in_progress' and ta.kind = 'olympiad'
    and ta.question_ids && v_pool;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'live_attempts', 'count', n);
  end if;

  -- 4. ENTITLEMENTS (migration 124). fk_entitlements_package is RESTRICT — it
  --    mirrors olympiad_purchases.olympiad_package_id exactly — so a grant row
  --    already aborts the delete today, but with a bare 23503 carrying no hint,
  --    which the panel can only render as "server error". Block 1 covers every
  --    MIRRORED grant (each has a purchase row behind it); this covers a
  --    non-producer rail (apple_iap, google_play, school_license), which has no
  --    purchase row for block 1 to count.
  select count(*)::int into n
  from public.entitlements where package_id = p_package_id;
  if n > 0 then
    v := v || jsonb_build_object('hint', 'package_has_entitlements', 'count', n);
  end if;

  return v;
end;
$$;

comment on function public.olympiad_package_deletion_blocks(uuid) is
  'Service-internal (migration 111, extended by 124): the reasons an olympiad '
  'package may not be deleted, as a jsonb array of {hint, count} — '
  'package_has_purchases, package_is_active, live_attempts, '
  'package_has_entitlements. Empty array = deletable.';
revoke all on function public.olympiad_package_deletion_blocks(uuid) from public, anon, authenticated;
grant execute on function public.olympiad_package_deletion_blocks(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 13. VERIFY -- THE NEW READERS, EXERCISED. Parity through the table proved the
--     ROWS are right; this proves the FUNCTIONS are, by asking them about every
--     access that exists today.
-- -----------------------------------------------------------------------------
do $mig$
declare v_bad int;
begin
  select count(*) into v_bad from (
    select cs.student_profile_id as sid, ss.subject_id as pid
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    where cs.status in ('trialing', 'active', 'canceled')
      and cs.current_period_end is not null
      and cs.current_period_end > now()
      and coalesce(ss.current_period_end, cs.current_period_end) > now()) o
   where not public.has_subject_access(o.sid, o.pid);
  if v_bad <> 0 then
    raise exception 'entitlements 124: has_subject_access() denies % (student, subject) pairs that have access today -- aborting', v_bad;
  end if;

  select count(*) into v_bad
    from public.olympiad_purchases pu
   where pu.status = 'active' and pu.student_profile_id is not null
     and not exists (select 1 from public.live_package_entitlement(
                            pu.student_profile_id, pu.olympiad_package_id));
  if v_bad <> 0 then
    raise exception 'entitlements 124: live_package_entitlement() denies % active purchases -- aborting', v_bad;
  end if;

  -- THE CLAUDE.md NON-NEGOTIABLE, ASSERTED ON DATA: a purchaser of an ARCHIVED
  -- package keeps lifetime access. Migration 094 left eight packages ACTIVE but
  -- empty precisely so purchasers keep seeing what they bought; nothing in this
  -- change may make an archived one behave differently.
  select count(*) into v_bad
    from public.olympiad_purchases pu
    join public.olympiad_packages p on p.id = pu.olympiad_package_id
   where p.status = 'archived' and pu.status = 'active'
     and pu.student_profile_id is not null
     and not exists (select 1 from public.live_package_entitlement(
                            pu.student_profile_id, pu.olympiad_package_id));
  if v_bad <> 0 then
    raise exception 'entitlements 124: % purchasers of an ARCHIVED package lost access -- aborting', v_bad;
  end if;
  raise notice 'entitlements 124: readers agree with every access that exists today.';
end $mig$;

-- -----------------------------------------------------------------------------
-- 14. VERIFY -- THE DEFINITIONS. The three properties a future tidy-up would
--     break silently, asserted here and again permanently by 013 checks 115/116.
-- -----------------------------------------------------------------------------
do $mig$
declare
  v_def text;
  r     record;
begin
  for r in select * from (values
             ('public.start_practice_attempt(uuid,int)'),
             ('public.start_topic_test_attempt(uuid,uuid[],uuid[])'),
             ('public.start_daily_round_attempt(uuid,text)')) as s(sig)
  loop
    v_def := pg_get_functiondef(r.sig::regprocedure);
    if position('has_subject_access' in v_def) = 0 then
      raise exception 'entitlements 124: % does not read has_subject_access -- aborting', r.sig;
    end if;
    if position('subscription_subjects' in v_def) > 0
       or position('child_subscriptions' in v_def) > 0 then
      raise exception 'entitlements 124: % still reads a subscription table for ACCESS -- aborting', r.sig;
    end if;
  end loop;

  v_def := pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure);
  if position('live_package_entitlement' in v_def) = 0
     or position('olympiad_purchases' in v_def) > 0 then
    raise exception 'entitlements 124: start_olympiad_attempt does not gate on entitlements -- aborting';
  end if;

  v_def := pg_get_functiondef('public.can_view_olympiad_package(uuid)'::regprocedure);
  if position('pu.owner_parent_profile_id' in v_def) = 0 then
    raise exception 'entitlements 124: can_view_olympiad_package lost its purchase branch -- aborting';
  end if;
  if (length(v_def) - length(replace(v_def, 'p.status', ''))) / length('p.status') <> 1 then
    raise exception 'entitlements 124: can_view_olympiad_package reads the package status outside the sale predicate -- aborting';
  end if;
  if position('revoked_at' in v_def) > 0 or position('e.ends_at' in v_def) > 0 then
    raise exception 'entitlements 124: can_view_olympiad_package filters the entitlement branch -- lifetime/refund visibility would change, aborting';
  end if;
  raise notice 'entitlements 124: gate and visibility definitions verified.';
end $mig$;

-- -----------------------------------------------------------------------------
-- 15. Schedule the reconciler (guarded; pg_cron may be absent).
--     (backport -> 016)
-- -----------------------------------------------------------------------------
do $mig$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_entitlements_reconcile';
    perform cron.schedule(
      'olympiq_entitlements_reconcile',
      '22 * * * *',
      'select public.entitlements_reconcile();');
    raise notice 'pg_cron job olympiq_entitlements_reconcile scheduled (hourly at :22 UTC).';
  else
    raise notice 'pg_cron absent -- olympiq_entitlements_reconcile NOT scheduled (skipped safely).';
  end if;
end $mig$;

commit;

-- =============================================================================
-- End of 2026_08_20_124_entitlements.sql
-- =============================================================================
