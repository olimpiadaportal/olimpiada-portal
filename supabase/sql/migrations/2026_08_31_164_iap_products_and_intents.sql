-- =============================================================================
-- 2026_08_31_164 — APPLE IN-APP PURCHASE: THE PRODUCT MAP AND THE PURCHASE
--                  INTENT. Schema only; no endpoint, no grant path, no seller.
--
-- WHY NOW. Apple rejected the iOS build on 2026-08-31 under Guideline 3.1.1:
-- the app reads content the family bought on the web without offering an
-- in-app purchase. There is no relief for the Azerbaijan storefront — the
-- Epic v. Apple carve-out is US-only, the DMA is EEA-only, and Google's
-- alternative-billing programmes do not list Azerbaijan
-- (docs/STORE_PAYMENTS_COMPLIANCE.md). The owner has decided to build IAP.
--
-- WHY THIS IS TWO SMALL TABLES AND NOT A REWRITE. The access layer was built
-- for this day. entitlements (007, migration 124) is already provider-agnostic,
-- public.entitlement_source already carries 'apple_iap' and 'google_play'
-- (001:197-200), and entitlements.external_ref's own column comment already
-- names the key this rail will use:
--
--     'The producer''s idempotency key AND the upsert target, namespaced by
--      rail: sub:<child_subscription>:<subject> | oly:<purchase> | Apple
--      originalTransactionId | Play purchase token | manual:<uuid>. Stable
--      across renewals — a renewal moves ends_at, it does not mint a row.'
--
-- entitlement_grant() (011:4656) is the writer, is already service_role-only,
-- and already REFUSES the sub:/oly: namespace so the Apple rail cannot bypass
-- the ABB producer mirror. Nothing in this migration touches any of it.
--
-- So the access half needs NOTHING. What is missing is the two facts Apple
-- cannot tell us:
--   1. WHAT a store product id sells        -> public.iap_products
--   2. WHICH CHILD a transaction was for    -> public.iap_purchase_intents
--
-- -----------------------------------------------------------------------------
-- OWNER DECISIONS THIS SCHEMA IS BUILT TO, confirmed 2026-08-31.
-- -----------------------------------------------------------------------------
-- (1) NON-RENEWING subscriptions, NOT auto-renewable. Apple allows ONE active
--     subscription per subscription group per Apple ID, and this product is PER
--     CHILD: a parent with three children studying Maths needs three concurrent
--     grants, which an auto-renewable group cannot express. The web rail cannot
--     auto-renew either — the bank refused card-on-file (ticket AZCDF-100303).
--
--     THE CONSEQUENCE A READER WILL OTHERWISE "SIMPLIFY" AWAY: Apple's
--     subscription-status endpoints (Get All Subscription Statuses) cover
--     AUTO-RENEWABLE products ONLY. A non-renewing subscription is a one-shot
--     transaction with no renewal, no grace period and no billing retry. OUR
--     SERVER computes ends_at as purchase date + interval, which is exactly why
--     `interval` lives on the product row below and is NOT NULL for a subject
--     product. Do not add a status-polling job; there is no status to poll.
--     REFUND / REVOKE is still a real notification and must still revoke —
--     entitlement_revoke(source, external_ref) already does that, and it needs
--     no row from either table here.
--
-- (2) The sibling discount (2nd child 10%, 3rd+ 15%) stays WEB-ONLY. iOS pays
--     the standard price. Nothing in this migration models a discount, and
--     nothing must ever tell an iOS user the web is cheaper — that is
--     anti-steering, and it is the guideline we were just rejected under.
--
-- (3) iOS pricing preserves OUR NET, so iOS costs MORE than web. Apple permits
--     different prices per channel. No price column exists here on purpose:
--     Apple owns the price (price tiers, per-storefront, changed in App Store
--     Connect), and a copy in this table would be a second source of truth that
--     is wrong the first time a tier moves. Money is recorded where money is
--     already recorded — the transaction, and the grant it produces.
--
-- (4) Adding a subject becomes a COORDINATED STORE RELEASE. A subject with no
--     iOS product must be neither purchasable NOR accessible on iOS, or 3.1.3(b)
--     is violated exactly as it was today. `active = false` is the default here
--     precisely so a new row cannot leak into the app before its App Store
--     Connect product exists.
--
-- -----------------------------------------------------------------------------
-- THE 23 STORE PRODUCTS, AND THE NAMING CONVENTION.
-- -----------------------------------------------------------------------------
-- Production today: 7 active subjects x 3 intervals = 21, plus 2 active
-- olympiad packages = 23 store products.
--
--     ai.olympiq.app.sub.<store_slug>.<week|month|year>      (subjects)
--     ai.olympiq.app.oly.<store_slug>                        (olympiad packages)
--
-- `ai.olympiq.app` is the bundle id, permanent by owner decision (CLAUDE.md).
-- The shape is enforced by ck_iap_product_id_shape, and the trailing interval
-- segment is cross-checked against the `interval` column by
-- ck_iap_product_id_interval — an id reading `.month` on a row that grants a
-- year is a money bug, and it is now unrepresentable rather than merely
-- unlikely.
--
-- <store_slug> IS NOT subjects.code AND IS NOT olympiad_packages.code.
-- This is the decision the task asked to be stated explicitly, because a store
-- product id is PERMANENT and PUBLIC: App Store Connect will never rename one
-- and will never let the string be reused. It is the single identifier in this
-- system that a later migration cannot fix. Two reasons:
--
--   * subjects.code is legacy and actively MISLEADING. The subject whose code
--     is `az_language` is named "Məntiq" (Logic) — the owner repurposed the row
--     and the legacy code was deliberately kept so no FK or pricing row would
--     move (012:131-139). A DIFFERENT subject, code `azerbaycan_dili`, is the
--     real Azerbaijani-language subject (migration 151). Deriving ids from
--     codes would ship `…sub.az_language.month` SELLING LOGIC, forever, in App
--     Store Connect, in every Apple financial report, and in every JWS payload
--     a future engineer reads while debugging a refund.
--
--   * olympiad_packages.code is an ADMIN-EDITABLE slug (015:33, `text not null
--     unique`, editable from the package screen). A permanent public identifier
--     must not be derived from a column an admin can rewrite on a Tuesday.
--
-- The slug is therefore CHOSEN ONCE per product and this table is the ONLY
-- mapping — which is the whole reason the table exists. It stays DERIVABLE in
-- the sense that matters: the rule is "lowercase ASCII English name of the
-- thing being sold", so the list can be regenerated by anyone from the product
-- names alone. The seven subject slugs (seeded below, INACTIVE):
--
--     subjects.code    | live name        | store slug
--     -----------------+------------------+-------------
--     math             | Riyaziyyat       | math
--     az_language      | Məntiq  (Logic)  | logic          <- NOT az_language
--     english          | İngilis dili     | english
--     informatics      | İnformatika      | informatics
--     elm              | Elm (Science)    | science
--     fizika           | Fizika           | physics
--     azerbaycan_dili  | Azərbaycan dili  | azerbaijani
--
-- The 2 OLYMPIAD rows are deliberately NOT seeded. Their slugs depend on which
-- packages are live and what they are actually called, and a permanent id
-- invented from a package title this file cannot read is exactly the mistake
-- the paragraphs above exist to prevent. The owner names them; a follow-up
-- migration (or the admin screen, once it exists) inserts them.
--
-- -----------------------------------------------------------------------------
-- Rerun-safe: create-if-not-exists throughout, guarded constraint adds,
-- drop-if-exists before every policy and trigger, `on conflict do nothing` on
-- the seed. A second run changes nothing.
--
-- Destructive change: NO. Creates two new tables and inserts INACTIVE catalogue
-- rows. Touches no existing table, no existing row, no existing function, no
-- existing policy. Rollback = `drop table public.iap_purchase_intents,
-- public.iap_products;` (nothing else references them).
--
-- Environment first applied: NOT YET APPLIED. Staging first, then production,
-- and BEFORE any code that reads these tables is pushed — Vercel auto-deploys
-- on push, and on 2026-08-21 code selecting checkout_sessions.intent_items
-- shipped ahead of the migration creating it and broke every payment endpoint.
--
-- Related root SQL files / BACKPORT TARGETS (the main session backports; this
-- file changes none of them):
--   * supabase/sql/007_subscriptions_payments_coupons.sql
--       Both tables, their comments and their CHECK constraints, appended after
--       the free_trials block at the end of the file.
--       CRITICAL BACKPORT DETAIL — iap_products.package_id must be declared as
--       a BARE `uuid` there with NO foreign key, exactly as entitlements.
--       package_id is (007:533): olympiad_packages does not exist yet at
--       that point in the canonical run order, and an inline FK breaks a
--       from-zero rebuild.
--   * supabase/sql/015_olympiad_preparation.sql
--       `alter table public.iap_products add constraint fk_iap_products_package
--        foreign key (package_id) references public.olympiad_packages (id)
--        on delete cascade;` — next to fk_entitlements_package, in the same
--       guarded do-block style, for the reason above.
--   * supabase/sql/010_rls_policies.sql
--       The four policies and the grant/revoke block below, next to
--       entitlements_select / free_trials_select.
--   * supabase/sql/011_indexes_constraints_functions_triggers.sql
--       The indexes below; add 'iap_products' to the trg_set_updated_at table
--       array (011:333-347 — NOT iap_purchase_intents, which has no updated_at);
--       and trg_audit_iap_products next to the other fn_audit_row attachments.
--   * supabase/sql/012_seed_initial_data.sql
--       The inactive iOS subject-product seed at the end of this file. Note it
--       yields 18 rows on a fresh bootstrap, not 21: 012 seeds six subjects and
--       `azerbaycan_dili` still arrives only via migration 151, which has not
--       been backported.
--   NO BACKPORT CARRIES THIS FILE'S `begin;` / `commit;`. A canonical file that
--   self-transacts is what destroyed production on 2026-07-29 (root CLAUDE.md):
--   migration 095's inner `commit` committed the rebuild's OUTER transaction,
--   `drop schema public cascade` included, and every row was lost.
-- Backport status: pending
--
-- 013 validation: no check is added here. RECOMMENDED as the next free check
--   number (the highest present today is [125]): assert that
--   `iap_products` holds ZERO rows with platform = 'android' — the Android
--   purchase-silence guard in Decision (4) and in the platform column comment
--   is currently an emptiness invariant with nothing watching it, and a single
--   helpful seed row would turn the Play build into a non-consumption-only app
--   with no test failing.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — public.iap_products : what a store product id actually sells.
--
-- Apple's transaction payload carries a productId and nothing else about our
-- catalogue. This is the lookup that turns it into a target the platform can
-- grant, and it is the ONLY place that mapping is written down.
-- -----------------------------------------------------------------------------
create table if not exists public.iap_products (
  id           uuid primary key default gen_random_uuid(),

  -- THE ANDROID PURCHASE-SILENCE GUARD. See the column comment below before
  -- adding a single 'android' row.
  platform     text not null,

  -- The App Store Connect / Play Console identifier. Permanent and public;
  -- see the naming convention in the header.
  product_id   text not null,

  -- WHAT IS SOLD — the same vocabulary entitlements uses, so the mapping into
  -- entitlement_grant() is a copy rather than a translation.
  scope        public.entitlement_scope not null,

  -- BOTH TARGET FKs ARE ON DELETE CASCADE, AND THAT DIVERGES FROM entitlements
  -- ON PURPOSE — read this before "fixing" it to match.
  -- entitlements.subject_id is CASCADE (007:530) but entitlements.package_id is
  -- RESTRICT (015:440-443), and 015:425-434 argues that choice at length: a
  -- package must never be deleted out from under a GRANT. The distinction that
  -- justifies not copying it here is what the two tables ARE.
  --   * entitlements is the ACCESS RECORD. Losing a row is FAIL-OPEN in the
  --     worst sense — the proof a family was entitled is destroyed, and with a
  --     bare cascade it is destroyed silently. RESTRICT is right there.
  --   * iap_products is a CATALOGUE. Losing a row is FAIL-CLOSED: the purchase
  --     endpoint has nothing to sell, the app hides the product, and that is
  --     precisely what Decision (4) demands of a subject with no live iOS
  --     product. No grant is harmed — revocation keys on (source, external_ref)
  --     in entitlements and never reads this table, so a refund still works.
  -- Two further reasons CASCADE is the safe direction here:
  --   * Anything ever SOLD is already unreachable by this cascade. A hard
  --     delete runs subject_deletion_blocks(), whose block 10 refuses any
  --     subject holding an entitlement and names apple_iap explicitly
  --     (011:1922-1932); olympiad_package_deletion_blocks() block 4 does the
  --     same for packages (015:1340-1351).
  --   * RESTRICT would abort those deletes with a bare 23503 carrying no hint —
  --     the exact "server error" failure migration 111 removed from these
  --     screens — and this file may not touch 011/015 to add the matching
  --     hint block. For subjects it would also be an IMMEDIATE regression:
  --     the seed at the end of this file gives every active subject three
  --     product rows, so no subject could ever be hard-deleted again.
  -- OPTIONAL FOLLOW-UP, not required for correctness: a
  -- `subject_has_iap_products` / `package_has_iap_products` hint in those two
  -- deletion-blocks functions would let the panel say "retire the store product
  -- first" instead of just letting the mapping vanish.
  subject_id   uuid references public.subjects (id) on delete cascade,

  -- The FK is inline HERE because olympiad_packages already exists in every
  -- database this migration runs against. The 007 BACKPORT MUST NOT copy it —
  -- see the backport note in the header.
  package_id   uuid references public.olympiad_packages (id) on delete cascade,

  grade_id     uuid references public.grades (id) on delete set null,

  -- NOT NULL for a subject product, and this is load-bearing rather than
  -- decorative: non-renewing subscriptions produce no renewal events, so OUR
  -- server computes ends_at = purchase date + this interval. It is the only
  -- place the length of what was bought is recorded.
  interval     public.plan_interval,

  -- FALSE by default. A row is not sellable until somebody has created the
  -- matching product in App Store Connect, had it approved, and deliberately
  -- turned it on. Decision (4): a subject with no LIVE iOS product must be
  -- neither purchasable nor accessible on iOS.
  active       boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint uq_iap_product unique (platform, product_id),

  constraint ck_iap_product_platform check (platform in ('ios', 'android')),

  -- MIRRORS ck_entitlement_target (007:563-566) exactly. A row can never name
  -- both a subject and a package, because the row that did would grant one and
  -- charge for the other.
  constraint ck_iap_product_target check (
       (scope = 'subject'          and subject_id is not null and package_id is null)
    or (scope = 'olympiad_package' and package_id is not null and subject_id is null)),

  -- A subject product is a PERIOD and must say which one; a package product is
  -- LIFETIME (ck_entitlement_lifetime, 007:578) and must not carry one at all.
  constraint ck_iap_product_interval check (
       (scope = 'subject'          and "interval" is not null)
    or (scope = 'olympiad_package' and "interval" is null)),

  -- Mirrors ck_entitlement_grade (007:580).
  constraint ck_iap_product_grade check (scope = 'olympiad_package' or grade_id is null),

  -- The naming convention as a constraint, not as a convention. A store id is
  -- permanent and public; the moment it is wrong it is wrong forever.
  constraint ck_iap_product_id_shape check (
    product_id ~ '^ai\.olympiq\.app\.(sub\.[a-z0-9]+\.(week|month|year)|oly\.[a-z0-9]+)$'),

  -- THE ID AND THE ROW MUST AGREE ABOUT THE PERIOD. Written as three literal
  -- branches rather than `product_id like '%.' || "interval"::text` because an
  -- enum-to-text I/O cast is not dependably immutable and a CHECK is not the
  -- place to find out. A row whose id ends `.month` while it grants a year is a
  -- billing defect, and it is now rejected at INSERT.
  constraint ck_iap_product_id_interval check (
    scope <> 'subject'
    or (   ("interval" = 'week'  and product_id like '%.week')
        or ("interval" = 'month' and product_id like '%.month')
        or ("interval" = 'year'  and product_id like '%.year'))
  )
);

comment on table public.iap_products is
  'Migration 164. Maps a STORE product id (App Store Connect / Play Console) to '
  'something this platform sells, so an Apple transaction — which carries a '
  'productId and nothing else about our catalogue — can be resolved into an '
  'entitlement target. The ONLY place that mapping exists. Carries NO price: '
  'Apple owns the price (per-storefront tiers, changed in App Store Connect), '
  'and a copy here would be a second source of truth that is wrong the first '
  'time a tier moves. iOS is dearer than web by owner decision (it preserves '
  'our net after commission) and the web-only sibling discount is never '
  'reflected here — nor may any surface tell an iOS user the web is cheaper, '
  'which is the anti-steering rule we were rejected under on 2026-08-31.';

comment on column public.iap_products.platform is
  'ios | android. THIS COLUMN IS THE ANDROID PURCHASE-SILENCE GUARD. The Play '
  'build is consumption-only on purpose (docs/STORE_PAYMENTS_COMPLIANCE.md): '
  'with NO google_play rows here the purchase endpoint has literally nothing to '
  'sell on Android, so the silence is structural instead of being a flag '
  'somebody can flip. DO NOT SEED ANDROID ROWS to "prepare" for Play billing, '
  'and do not add them because the check constraint allows the value — the '
  'value exists so that the day Google forces IAP is a data change and not a '
  'schema change. Until an owner decision says otherwise, every row is ios.';

comment on column public.iap_products.product_id is
  'The permanent, public store identifier. ai.olympiq.app.sub.<slug>.<interval> '
  'for a subject, ai.olympiq.app.oly.<slug> for an olympiad package. The slug is '
  'DELIBERATELY NOT subjects.code: the subject coded az_language is named '
  '"Məntiq" (Logic) and a different subject, azerbaycan_dili, is the real '
  'Azerbaijani-language one, so a code-derived id would sell Logic under the '
  'name of a language forever. It is also not olympiad_packages.code, which an '
  'admin can edit. App Store Connect never renames a product id and never lets '
  'one be reused; this row is the mapping, so the id does not need to encode it.';

comment on column public.iap_products.interval is
  'The PERIOD a subject product grants. NOT NULL for scope = subject and NULL '
  'for a package (packages are lifetime). Load-bearing: these are NON-RENEWING '
  'subscriptions, so Apple sends no renewal event and its subscription-status '
  'endpoints do not cover them at all — our server computes ends_at as purchase '
  'date + this interval. There is no status to poll and no grace period to '
  'model; only REFUND/REVOKE arrives, and that revokes.';

comment on column public.iap_products.active is
  'FALSE until the matching store product exists, is approved, and an owner '
  'turns it on. Decision (4), 2026-08-31: a subject with no LIVE iOS product '
  'must be neither purchasable NOR accessible on iOS — offering access to '
  'something the store cannot sell is the Guideline 3.1.3(b) shape that got the '
  'app rejected. Flipping this is the go-live step, and it is audited.';

comment on column public.iap_products.grade_id is
  'NULL in the normal case: the entitled grade is resolved from the CHILD named '
  'in the purchase intent, exactly as olympiad_purchases already records it. A '
  'non-NULL value pins ONE grade to ONE store product, which is how a package '
  'would be sold per grade if that is ever wanted. Package rows only '
  '(ck_iap_product_grade), mirroring ck_entitlement_grade.';

-- Resolve-by-store-id (the webhook's hot path) is served by uq_iap_product.
-- This is the app's "what can I sell on this platform" list.
create index if not exists idx_iap_products_sellable
  on public.iap_products (platform, scope) where active;

-- Reverse lookup: "does this subject have a live iOS product?" — the question
-- Decision (4) forces every iOS subject listing to ask before rendering.
create index if not exists idx_iap_products_subject
  on public.iap_products (subject_id, platform) where subject_id is not null;
create index if not exists idx_iap_products_package
  on public.iap_products (package_id, platform) where package_id is not null;

-- ONE ACTIVE PRODUCT PER TARGET PER PLATFORM. Two live iOS products both
-- selling maths-monthly makes "which one does the app show?" undecidable.
-- Partial on `active` rather than a plain unique constraint BECAUSE a store id
-- can never be reused: retiring a product and introducing its replacement means
-- both rows must coexist, with only one of them active.
create unique index if not exists uq_iap_product_subject_active
  on public.iap_products (platform, subject_id, "interval")
  where active and scope = 'subject';

-- Split in two rather than coalescing grade_id to a sentinel uuid: a
-- grade-pinned product and a grade-agnostic one for the same package are
-- different products, and NULL grouping in a unique index would let two
-- grade-agnostic rows through.
create unique index if not exists uq_iap_product_package_active
  on public.iap_products (platform, package_id)
  where active and scope = 'olympiad_package' and grade_id is null;
create unique index if not exists uq_iap_product_package_grade_active
  on public.iap_products (platform, package_id, grade_id)
  where active and scope = 'olympiad_package' and grade_id is not null;

drop trigger if exists trg_set_updated_at on public.iap_products;
create trigger trg_set_updated_at before update on public.iap_products
  for each row execute function public.set_updated_at();

-- Project law: every admin mutation writes an audit row. iap_products is
-- admin-writable through PostgREST (see the RLS block), so the generic
-- before/after auditor is attached rather than trusting each caller. A wrong
-- row here silently grants the wrong subject for real money, which is exactly
-- the class of change that has to be reconstructible afterwards.
drop trigger if exists trg_audit_iap_products on public.iap_products;
create trigger trg_audit_iap_products
  after insert or update or delete on public.iap_products
  for each row execute function public.fn_audit_row();

-- -----------------------------------------------------------------------------
-- 2 — public.iap_purchase_intents : which CHILD a transaction was for.
--
-- One row per tap on Buy, written BEFORE the store sheet opens. Its `id` IS the
-- value passed to StoreKit as appAccountToken (Apple requires a UUID), and
-- Apple echoes it back in the signed transaction.
--
-- THIS IS THE ONLY THING THAT KNOWS WHICH CHILD A PURCHASE WAS FOR. An Apple
-- subscription attaches to an APPLE ID; this platform sells per CHILD, and a
-- parent with three children buys the same product three times from the same
-- Apple ID. Without this row the three transactions are indistinguishable and
-- the money cannot be turned into the right grant. It is also the reason
-- Decision (1) chose non-renewing products: one Apple ID cannot hold three
-- concurrent auto-renewable subscriptions from one group.
-- -----------------------------------------------------------------------------
create table if not exists public.iap_purchase_intents (
  -- THE appAccountToken. Not a surrogate key that happens to be a uuid — the
  -- value leaves this database, travels through StoreKit, and comes back inside
  -- Apple's signed payload. Never recycle one, never expose another family's.
  id                      uuid primary key default gen_random_uuid(),

  owner_parent_profile_id uuid not null references public.profiles (id) on delete cascade,

  -- ON DELETE SET NULL, never CASCADE, and deliberately NOT NULL-CONSTRAINED —
  -- the same reasoning checkout_sessions.student_profile_id carries verbatim
  -- (007:340-347): deleting a child must not delete the record of money that
  -- was taken. A CHECK requiring it would also be re-evaluated by the FK's own
  -- SET NULL update and would make deleting a child fail on an old intent.
  -- It is required at CREATION time by the endpoint, which is where it is
  -- enforceable. A surviving row with a NULL child still carries the parent,
  -- the product and the transaction id — which is what support needs to refund.
  student_profile_id      uuid references public.students (profile_id) on delete set null,

  -- The store product tapped. FK on (platform, product_id) rather than on the
  -- product row's uuid so that an intent naming an ios product while claiming
  -- android is unrepresentable, and so the recorded id is the literal string
  -- Apple will send back.
  platform                text not null,
  product_id              text not null,

  created_at              timestamptz not null default now(),

  -- STALENESS, NOT A GATE. Read this before writing any code against it.
  -- expires_at bounds how long an unconsumed intent is treated as "the pending
  -- tap", so abandoned rows can be pruned and support can triage. It must NEVER
  -- be a reason to refuse a grant for a transaction Apple actually reports:
  -- StoreKit delivers interrupted purchases, Ask-to-Buy approvals and
  -- offline-queued transactions hours or days later, and refusing one would
  -- take the family's money and hand back nothing. Late arrival is a flag for a
  -- human, not a denial.
  expires_at              timestamptz not null default (now() + '7 days'::interval),

  -- Set when a transaction has actually been tied to this intent.
  consumed_at             timestamptz,

  -- Apple's originalTransactionId, once known. This becomes
  -- entitlements.external_ref for the grant — see that column's comment, quoted
  -- in this file's header.
  original_transaction_id text,

  constraint ck_iap_intent_platform check (platform in ('ios', 'android')),

  -- ON DELETE RESTRICT, and the consequence is stated rather than discovered:
  -- because iap_products.subject_id CASCADEs from subjects, an intent pins the
  -- product row, which pins the SUBJECT. Hard-deleting a subject that anyone
  -- ever tapped Buy on will therefore fail. That is the outcome we want — an
  -- abandoned intent is the record of a purchase ATTEMPT, it is money-adjacent,
  -- and cascading it away to make an admin delete succeed destroys evidence.
  -- (A subject anyone actually BOUGHT is already refused by
  -- subject_deletion_blocks() block 10, long before this FK is consulted.)
  constraint fk_iap_intent_product
    foreign key (platform, product_id)
    references public.iap_products (platform, product_id)
    on update cascade on delete restrict,

  constraint ck_iap_intent_window check (expires_at > created_at),
  constraint ck_iap_intent_consumed check (consumed_at is null or consumed_at >= created_at),
  constraint ck_iap_intent_txn check (
    original_transaction_id is null
    or length(original_transaction_id) between 1 and 100),

  -- ONE-DIRECTIONAL ON PURPOSE, and this is where it departs from
  -- ck_checkout_redemption (007:420-424), which couples its two columns exactly.
  -- Consumed implies a transaction id; a transaction id does NOT imply
  -- consumed. The asymmetry exists so the id can be recorded the instant it is
  -- known, even if the grant then fails: originalTransactionId is the only key
  -- that can later revoke or refund this purchase, and losing it is worse than
  -- any inconsistency coupling would have prevented.
  constraint ck_iap_intent_txn_required check (
    consumed_at is null or original_transaction_id is not null)
);

comment on table public.iap_purchase_intents is
  'Migration 164. One row per tap on Buy, written BEFORE the store sheet opens. '
  'Its id IS the appAccountToken handed to StoreKit and echoed back in Apple''s '
  'signed transaction, and it is THE ONLY THING THAT KNOWS WHICH CHILD A '
  'PURCHASE WAS FOR — an Apple subscription attaches to an Apple ID while this '
  'platform sells per child, so a parent buying the same product for three '
  'children produces three otherwise indistinguishable transactions. Written by '
  'service_role only; read by the owning parent and by support.';

comment on column public.iap_purchase_intents.id is
  'THE appAccountToken. Leaves the database, travels through StoreKit, returns '
  'inside Apple''s signed payload. Apple requires a UUID. Never recycled.';

comment on column public.iap_purchase_intents.expires_at is
  'A STALENESS MARKER, NOT AN ACCESS GATE. It bounds how long an unconsumed '
  'intent counts as the pending tap, for pruning and for support triage. A '
  'transaction Apple actually reports MUST still be granted after it passes: '
  'interrupted purchases, Ask-to-Buy approvals and offline-queued transactions '
  'arrive hours or days late, and refusing one takes the money and delivers '
  'nothing. Late arrival raises a flag for a human; it never denies access.';

comment on column public.iap_purchase_intents.student_profile_id is
  'The child this purchase was for. NULLABLE only because the FK is ON DELETE '
  'SET NULL — deleting a child must not delete the record of money that was '
  'taken (the reasoning checkout_sessions.student_profile_id already carries). '
  'Required at creation time by the endpoint, which is where it is enforceable; '
  'a NOT NULL here would make deleting a child fail on an old intent.';

comment on column public.iap_purchase_intents.original_transaction_id is
  'Apple''s originalTransactionId, once known. Becomes entitlements.external_ref '
  'for the grant — entitlement_grant() is the writer and is service_role-only. '
  'Recorded as soon as it is known, even if the grant then fails: it is the only '
  'key that can later revoke or refund this purchase.';

-- The webhook's lookup: a notification arrives carrying a transaction, and the
-- server needs the intent behind it.
create index if not exists idx_iap_intents_original_txn
  on public.iap_purchase_intents (original_transaction_id)
  where original_transaction_id is not null;

-- ONE TRANSACTION, ONE INTENT. Two intents claiming the same transaction would
-- mean two children granted from one payment. For non-renewing products every
-- purchase is its own transaction, so this can only ever fire on a bug — and a
-- loud failure is the correct outcome. A retry re-writes the SAME intent row
-- (the appAccountToken is the primary key), so it never trips this.
create unique index if not exists uq_iap_intent_original_txn
  on public.iap_purchase_intents (original_transaction_id)
  where original_transaction_id is not null;

-- Serves the parent's RLS read and support's "what did this family buy" query.
create index if not exists idx_iap_intents_parent
  on public.iap_purchase_intents (owner_parent_profile_id, created_at desc);
create index if not exists idx_iap_intents_student
  on public.iap_purchase_intents (student_profile_id)
  where student_profile_id is not null;

-- Pruning / triage: abandoned taps, and transactions that never arrived.
create index if not exists idx_iap_intents_pending
  on public.iap_purchase_intents (expires_at) where consumed_at is null;

-- NO audit trigger on this table, deliberately. Every row is written by
-- service_role from the purchase endpoint, one per tap on Buy, and the row IS
-- its own record — it is append-then-stamp and never edited by a person.
-- Auditing it would copy the busiest table in the rail into audit_logs for no
-- reconstructive gain. iap_products, which humans DO edit, is audited above.

-- -----------------------------------------------------------------------------
-- 3 — RLS.
--
-- iap_products: READABLE by authenticated, restricted to `active` rows for
-- everyone who is not staff — the shape subjects_pricing_select already uses
-- (010:669-671). Why this and not the entitlements posture of "nobody, ever":
-- this is a CATALOGUE, not a grant. The app has to list what it can sell, and
-- serving only active rows makes the client's list correct by construction
-- instead of making the endpoint re-filter what it was told.
--
-- NOT readable by anon, unlike subjects_pricing. Nothing logged-out needs the
-- store id list, and the store ids are the exact catalogue a scraper would want
-- in order to enumerate our products in App Store Connect.
--
-- WRITE is admin/payments.manage, not service-role-only. Somebody has to enter
-- 23 rows and flip `active` on release day, and a mis-typed row is bad but
-- recoverable and now audited (trg_audit_iap_products) — unlike an entitlement,
-- where a hand-written row is free lifetime access with no producer behind it.
--
-- iap_purchase_intents: SELECT for the owning parent (plus staff, who need
-- exactly this row when a parent reports "I paid on my iPhone and got
-- nothing"); NO write policy for anyone, ever, following entitlements and
-- free_trials. Writes are service_role from the purchase endpoint.
--
-- Every predicate is wrapped as `(select fn())` — the migration-149 hoisting
-- rule. A bare call inside a policy is re-evaluated per row.
-- -----------------------------------------------------------------------------
alter table public.iap_products         enable row level security;
alter table public.iap_purchase_intents enable row level security;

drop policy if exists "iap_products_select" on public.iap_products;
create policy "iap_products_select" on public.iap_products for select to authenticated
  using (
    active
    or (select public.is_admin())
    or (select public.has_permission('payments.manage'))
  );

drop policy if exists "iap_products_write" on public.iap_products;
create policy "iap_products_write" on public.iap_products for all to authenticated
  using (
    (select public.is_admin())
    or (select public.has_permission('payments.manage'))
  )
  with check (
    (select public.is_admin())
    or (select public.has_permission('payments.manage'))
  );

drop policy if exists "iap_intents_select" on public.iap_purchase_intents;
create policy "iap_intents_select" on public.iap_purchase_intents for select to authenticated
  using (
    owner_parent_profile_id = (select public.current_profile_id())
    or (select public.is_admin())
    or (select public.has_permission('payments.manage'))
  );
-- NO insert/update/delete policy on iap_purchase_intents, for anyone, ever.
-- Not even admins. A hand-written intent is a claim about which child a real
-- payment was for.

-- Table grants. `alter default privileges` (010:84-86) hands new tables SELECT
-- to anon and INSERT/UPDATE/DELETE to authenticated, so both have to be taken
-- back explicitly; RLS alone would not stop anon reading iap_products.
revoke all on public.iap_products         from anon, authenticated;
revoke all on public.iap_purchase_intents from anon, authenticated;
grant select                         on public.iap_products         to authenticated;
grant insert, update, delete         on public.iap_products         to authenticated;  -- gated by iap_products_write
grant select                         on public.iap_purchase_intents to authenticated;  -- gated by iap_intents_select

-- service_role EXPLICITLY, not by inheritance. 010:80 (`grant all on ALL tables`)
-- is a one-time statement that cannot reach a table created afterwards, and
-- 010:86's `alter default privileges` only fires for tables created by the role
-- that set it — which is not guaranteed to be the role applying this migration.
-- service_role is the ONLY writer of iap_purchase_intents and the only caller of
-- entitlement_grant(); a silently missing grant here is the whole rail failing
-- in production on the first purchase.
grant all on public.iap_products         to service_role;
grant all on public.iap_purchase_intents to service_role;

-- -----------------------------------------------------------------------------
-- 4 — The iOS subject catalogue, seeded INACTIVE.
--
-- 7 active subjects x 3 intervals = 21 rows in production. Every one is
-- active = false: nothing is sellable until its App Store Connect product
-- exists, is approved, and an owner turns it on. Joined by subjects.code so no
-- uuid is hardcoded, and `on conflict do nothing` so a re-run is a no-op.
--
-- The slug column below is the whole point of the header's naming section:
-- az_language maps to `logic` because that subject IS Logic, and
-- azerbaycan_dili maps to `azerbaijani` because that one is the language.
-- Getting these two the wrong way round is permanent.
--
-- The 2 OLYMPIAD products are NOT seeded — their slugs are an owner naming
-- decision this file cannot make on their behalf.
-- -----------------------------------------------------------------------------
insert into public.iap_products (platform, product_id, scope, subject_id, "interval", active)
select 'ios',
       'ai.olympiq.app.sub.' || m.slug || '.' || i.iv,
       'subject',
       s.id,
       i.iv::public.plan_interval,
       false
from (values
        ('math',            'math'),
        ('az_language',     'logic'),        -- the row NAMED "Məntiq"
        ('english',         'english'),
        ('informatics',     'informatics'),
        ('elm',             'science'),
        ('fizika',          'physics'),
        ('azerbaycan_dili', 'azerbaijani')   -- the actual language subject
      ) as m(code, slug)
join public.subjects s on s.code = m.code and s.status = 'active'
cross join (values ('week'), ('month'), ('year')) as i(iv)
on conflict (platform, product_id) do nothing;

-- -----------------------------------------------------------------------------
-- VERIFICATION — the migration proves its own claims before it commits, and
-- proves the target CHECK by trying to violate it rather than by reading it.
-- -----------------------------------------------------------------------------
do $$
declare
  v_subject  uuid;
  v_package  uuid;
  v_inserted boolean;
  v_n        int;
  c          text;
  p          text;
begin
  -- 1. The tables.
  if to_regclass('public.iap_products') is null then
    raise exception '164: iap_products was not created';
  end if;
  if to_regclass('public.iap_purchase_intents') is null then
    raise exception '164: iap_purchase_intents was not created';
  end if;

  -- 2. Every named constraint. A missing one is a silently weaker table.
  foreach c in array array[
    'uq_iap_product', 'ck_iap_product_platform', 'ck_iap_product_target',
    'ck_iap_product_interval', 'ck_iap_product_grade',
    'ck_iap_product_id_shape', 'ck_iap_product_id_interval',
    'ck_iap_intent_platform', 'fk_iap_intent_product', 'ck_iap_intent_window',
    'ck_iap_intent_consumed', 'ck_iap_intent_txn', 'ck_iap_intent_txn_required'
  ] loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '164: constraint % is missing', c;
    end if;
  end loop;

  -- 3. The indexes the endpoints will use, including the two that make a
  --    double-sell and a double-grant unrepresentable.
  foreach c in array array[
    'idx_iap_products_sellable', 'idx_iap_products_subject',
    'idx_iap_products_package', 'uq_iap_product_subject_active',
    'uq_iap_product_package_active', 'uq_iap_product_package_grade_active',
    'idx_iap_intents_original_txn', 'uq_iap_intent_original_txn',
    'idx_iap_intents_parent', 'idx_iap_intents_student', 'idx_iap_intents_pending'
  ] loop
    if not exists (select 1 from pg_indexes
                    where schemaname = 'public' and indexname = c) then
      raise exception '164: index % is missing', c;
    end if;
  end loop;

  -- 4. RLS is ENABLED, not merely policied. A policy on a table without RLS
  --    protects nothing at all.
  if not (select relrowsecurity from pg_class
           where oid = 'public.iap_products'::regclass) then
    raise exception '164: RLS is not enabled on iap_products';
  end if;
  if not (select relrowsecurity from pg_class
           where oid = 'public.iap_purchase_intents'::regclass) then
    raise exception '164: RLS is not enabled on iap_purchase_intents';
  end if;

  foreach p in array array['iap_products_select', 'iap_products_write', 'iap_intents_select'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and policyname = p) then
      raise exception '164: policy % is missing', p;
    end if;
  end loop;

  -- The intents table must have NO write policy. This is the entitlements
  -- posture and the reason a hand-written intent is impossible.
  select count(*)::int into v_n from pg_policies
   where schemaname = 'public' and tablename = 'iap_purchase_intents'
     and cmd <> 'SELECT';
  if v_n > 0 then
    raise exception '164: iap_purchase_intents grew % write polic(ies)', v_n;
  end if;

  -- 5. Grants. `alter default privileges` would otherwise have left anon with
  --    SELECT on both tables and authenticated with INSERT on the intents.
  if has_table_privilege('anon', 'public.iap_products', 'SELECT') then
    raise exception '164: anon can still read iap_products';
  end if;
  if has_table_privilege('anon', 'public.iap_purchase_intents', 'SELECT') then
    raise exception '164: anon can still read iap_purchase_intents';
  end if;
  if not has_table_privilege('authenticated', 'public.iap_products', 'SELECT') then
    raise exception '164: authenticated cannot read iap_products — the app cannot list what it sells';
  end if;
  if not has_table_privilege('authenticated', 'public.iap_products', 'INSERT') then
    raise exception '164: an admin cannot write iap_products';
  end if;
  if not has_table_privilege('authenticated', 'public.iap_purchase_intents', 'SELECT') then
    raise exception '164: a parent cannot read their own purchase intents';
  end if;
  if has_table_privilege('authenticated', 'public.iap_purchase_intents', 'INSERT') then
    raise exception '164: authenticated can INSERT purchase intents — only service_role may';
  end if;
  -- The writer. Not inherited: see the grant block's comment.
  if not has_table_privilege('service_role', 'public.iap_purchase_intents', 'INSERT') then
    raise exception '164: service_role cannot write purchase intents — the rail cannot record a sale';
  end if;
  if not has_table_privilege('service_role', 'public.iap_products', 'SELECT') then
    raise exception '164: service_role cannot read iap_products — a transaction could not be mapped';
  end if;

  -- 6. The triggers.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.iap_products'::regclass
                    and tgname = 'trg_set_updated_at') then
    raise exception '164: iap_products has no updated_at trigger';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.iap_products'::regclass
                    and tgname = 'trg_audit_iap_products') then
    raise exception '164: iap_products mutations are not audited';
  end if;

  -- 7. THE PROBE. ck_iap_product_target must actually BITE — a row naming BOTH
  --    a subject and a package is the failure that charges for one thing and
  --    grants another. Real ids are used so the CHECK is what rejects the row
  --    and not an FK; if the insert somehow succeeds, the raise below aborts
  --    the whole migration, which also unwinds the probe row.
  select id into v_subject from public.subjects order by code limit 1;
  select id into v_package from public.olympiad_packages order by code limit 1;

  if v_subject is null or v_package is null then
    raise notice '164: target-CHECK probe SKIPPED — this database has no subject '
                 'and/or no olympiad package to build a violating row from';
  else
    v_inserted := false;
    begin
      insert into public.iap_products (platform, product_id, scope, subject_id, package_id, "interval")
      values ('ios', 'ai.olympiq.app.sub.probe.month', 'subject', v_subject, v_package, 'month');
      v_inserted := true;
    exception when check_violation then
      null;  -- expected: ck_iap_product_target refused it
    end;
    if v_inserted then
      raise exception '164: ck_iap_product_target did NOT bite — a row named both a subject and a package';
    end if;

    -- The second invented constraint, probed the same way: a subject product
    -- with no interval has no computable ends_at, and non-renewing purchases
    -- have nothing else to derive one from.
    v_inserted := false;
    begin
      insert into public.iap_products (platform, product_id, scope, subject_id, "interval")
      values ('ios', 'ai.olympiq.app.sub.probe.month', 'subject', v_subject, null);
      v_inserted := true;
    exception when check_violation then
      null;
    end;
    if v_inserted then
      raise exception '164: ck_iap_product_interval did NOT bite — a subject product carries no period';
    end if;

    raise notice '164: probes passed — the target and interval CHECKs both refuse a bad row';
  end if;

  -- 8. The seed, and the Android silence.
  select count(*)::int into v_n from public.iap_products
   where platform = 'ios' and scope = 'subject';
  if v_n = 0 then
    raise exception '164: the iOS subject catalogue seeded nothing — no active subject matched a slug';
  end if;
  -- A NOTICE, not an exception: production has 7 active subjects (21 rows), but
  -- a from-zero rebuild seeds only 6 — `azerbaycan_dili` still arrives via
  -- migration 151, which is not backported into 012 (see the header).
  raise notice '164: % iOS subject product(s) seeded, all inactive (production expects 21, a fresh bootstrap 18)', v_n;

  -- A NOTICE and not an exception, so this file stays rerun-safe AFTER go-live:
  -- once an owner turns products on, re-applying the migration must not fail.
  -- The claim being made here is only that nothing arrives sellable — the seed
  -- above inserts active = false unconditionally.
  select count(*)::int into v_n from public.iap_products where active;
  if v_n > 0 then
    raise notice '164: % product(s) are already ACTIVE — this is a re-run after go-live, not a fresh install', v_n;
  else
    raise notice '164: nothing is sellable yet; flipping active is the deliberate, audited go-live step';
  end if;

  -- THE ANDROID PURCHASE-SILENCE GUARD, asserted. This one IS an exception: the
  -- Play build is consumption-only, and an android row here is the difference
  -- between that being true and being a claim. If Google ever forces IAP, the
  -- migration that builds it relaxes this — it is not relaxed by adding a row.
  select count(*)::int into v_n from public.iap_products where platform = 'android';
  if v_n > 0 then
    raise exception '164: % android product(s) exist — the Play build is consumption-only', v_n;
  end if;

  raise notice '164: the IAP product map and purchase-intent table are installed; nothing is sellable yet';
end $$;

commit;
