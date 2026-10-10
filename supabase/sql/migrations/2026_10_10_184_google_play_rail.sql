-- 184 — The Google Play rail: Android sells, mirroring the approved iOS rail (2026-10-10).
--
-- OWNER DECISION, 2026-10-10: Android now SELLS through Google Play Billing,
-- the twin of the StoreKit rail Apple approved on 2026-09-09. This retires the
-- "Android stays purchase-silent" rule for the server half; the binary stays
-- silent until the new Android build ships (track C), and every row seeded
-- here is INACTIVE, so nothing is sellable until the owner has created the
-- matching Play Console product and turned the row on.
--
-- WHAT THE ACCESS HALF NEEDED: NOTHING, AGAIN. entitlements is provider-
-- agnostic, public.entitlement_source already carries 'google_play', and
-- entitlement_grant() / entitlement_revoke() (011) are already the
-- service_role-only writers keyed on (source, external_ref). No new function.
--
-- WHAT THIS MIGRATION DOES
--   1. iap_products: one ANDROID row for every iOS row, same product id, same
--      target, same interval, active = false. The product id IS the Play
--      Console product id (one-time CONSUMABLE products, one per subject per
--      cycle, plus the olympiad reservations). A generic mirror rather than a
--      typed list, so production (21 subject rows + 2 olympiad reservations)
--      and a from-zero build (18 subject rows) both end with exact twins.
--   2. iap_notifications learns the PLATFORM. Google Play real-time developer
--      notifications arrive through Pub/Sub, whose message id is a numeric
--      string rather than Apple's notificationUUID. The endpoint derives a
--      deterministic uuid from it for the existing primary key and records the
--      provider's own id in provider_message_id, which carries its own unique
--      index — the true replay key for an Android row. Existing rows default to
--      'ios' and are unchanged.
--   3. system setting store.fx.azn_per_usd = 1.70. Apple bills Azerbaijan in
--      USD at fixed price points, so the admin panel converts the AZN subject
--      price to the NEAREST USD point with this rate. Google accepts AZN
--      amounts directly and does not use it.
--
-- The column comment on iap_products.platform is rewritten: it used to forbid
-- android rows outright, which was right until the owner decided otherwise.
--
-- Safe to re-run. Not self-transacting.

-- ---------------------------------------------------------------- 1. catalogue
insert into public.iap_products
  (platform, product_id, scope, subject_id, package_id, grade_id, "interval", active)
select 'android', p.product_id, p.scope, p.subject_id, p.package_id, p.grade_id, p."interval", false
from public.iap_products p
where p.platform = 'ios'
on conflict (platform, product_id) do nothing;

comment on column public.iap_products.platform is
  'ios | android. Owner decision 2026-10-10: BOTH platforms sell. iOS through '
  'StoreKit non-renewing subscriptions (approved 2026-09-09), Android through '
  'Google Play Billing one-time CONSUMABLE products with the same product ids '
  '(migration 184). Each android row is the twin of an ios row and is seeded '
  'INACTIVE: a row is sellable only after its Play Console product exists and '
  'an owner turns it on. The rail is still structural — no active row for a '
  'platform means nothing to sell there — and the payment RAIL per platform is '
  'a build-time fact of the binary, never a runtime flag '
  '(docs/STORE_PAYMENTS_COMPLIANCE.md).';

-- ---------------------------------------------------------------- 2. notifications
alter table public.iap_notifications
  add column if not exists platform text not null default 'ios';
alter table public.iap_notifications
  add column if not exists provider_message_id text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.iap_notifications'::regclass
                    and conname = 'ck_iap_notification_platform') then
    alter table public.iap_notifications
      add constraint ck_iap_notification_platform check (platform in ('ios', 'android'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.iap_notifications'::regclass
                    and conname = 'ck_iap_notification_message_id') then
    alter table public.iap_notifications
      add constraint ck_iap_notification_message_id
      check (provider_message_id is null or length(provider_message_id) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.iap_notifications'::regclass
                    and conname = 'ck_iap_notification_android_message') then
    alter table public.iap_notifications
      add constraint ck_iap_notification_android_message
      check (platform = 'ios' or provider_message_id is not null);
  end if;
end;
$$;

-- The Android replay key. Pub/Sub repeats messageId verbatim on every
-- redelivery, exactly as Apple repeats notificationUUID.
create unique index if not exists uq_iap_notifications_provider_message
  on public.iap_notifications (platform, provider_message_id)
  where provider_message_id is not null;

comment on column public.iap_notifications.platform is
  'Migration 184. ios = an App Store Server Notification V2; android = a Google '
  'Play real-time developer notification delivered by Pub/Sub push. Android rows '
  'carry a notification_uuid DERIVED from the Pub/Sub messageId (deterministic, '
  'so a redelivery maps to the same row) and the messageId itself in '
  'provider_message_id. environment is always Production for android: Pub/Sub '
  'has one topic, and a test purchase is identified per purchase, not per rail.';

comment on column public.iap_notifications.provider_message_id is
  'Migration 184. The provider''s own message id — the Pub/Sub messageId for '
  'android, NULL for ios (whose notificationUUID is already the key). Unique per '
  'platform (uq_iap_notifications_provider_message).';

-- ---------------------------------------------------------------- 3. settings
insert into public.system_settings (key, value_json) values
  ('store.fx.azn_per_usd', '1.70'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- self-check
do $$
declare
  v_missing int;
  v_drift   int;
begin
  -- Every iOS product has an android twin...
  select count(*) into v_missing
  from public.iap_products i
  where i.platform = 'ios'
    and not exists (select 1 from public.iap_products a
                     where a.platform = 'android' and a.product_id = i.product_id);
  if v_missing > 0 then
    raise exception '184: % ios products have no android twin', v_missing;
  end if;

  -- ...that sells exactly the same thing.
  select count(*) into v_drift
  from public.iap_products i
  join public.iap_products a on a.platform = 'android' and a.product_id = i.product_id
  where i.platform = 'ios'
    and (a.scope is distinct from i.scope
      or a.subject_id is distinct from i.subject_id
      or a.package_id is distinct from i.package_id
      or a.grade_id is distinct from i.grade_id
      or a."interval" is distinct from i."interval");
  if v_drift > 0 then
    raise exception '184: % android products disagree with their ios twin', v_drift;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'iap_notifications'
         and column_name in ('platform', 'provider_message_id')) <> 2 then
    raise exception '184: iap_notifications is missing the platform columns';
  end if;

  if to_regclass('public.uq_iap_notifications_provider_message') is null then
    raise exception '184: the android replay index is missing';
  end if;

  if not exists (select 1 from public.system_settings
                  where key = 'store.fx.azn_per_usd'
                    and jsonb_typeof(value_json) = 'number'
                    and (value_json #>> '{}')::numeric > 0) then
    raise exception '184: store.fx.azn_per_usd is missing or not a positive number';
  end if;

  -- The writers are unchanged and still service_role-only.
  if has_function_privilege('authenticated',
       'public.entitlement_grant(uuid, public.entitlement_scope, public.entitlement_source, text, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid, text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.entitlement_revoke(public.entitlement_source, text, text)', 'EXECUTE') then
    raise exception '184: an entitlement writer is callable by a client';
  end if;
end;
$$;
