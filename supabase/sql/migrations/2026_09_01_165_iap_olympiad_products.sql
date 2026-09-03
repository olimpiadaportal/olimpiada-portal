-- =============================================================================
-- 2026_09_01_165 — THE TWO OLYMPIAD STORE PRODUCT IDS, RESERVED BUT INACTIVE.
--
-- Migration 164 seeded the 21 iOS SUBJECT products and deliberately left the
-- olympiad ones out, because a store product id is a permanent public name and
-- naming one is an owner decision rather than something to derive.
--
-- IT TURNS OUT NOTHING NEEDS TO BE SOLD HERE YET. Read against production on
-- 2026-09-01: both live packages carry price_amount = 0.00, and NO package in
-- the table is priced above zero. Four purchases were paid historically, so the
-- rail matters — but a free product needs no In-App Purchase, and Apple does
-- not require one for content that costs nothing. So these two rows are
-- RESERVATIONS, not offerings:
--   * active = false, so the intent endpoint refuses them exactly as it refuses
--     any unknown product;
--   * no App Store Connect product should be created for either until the
--     package is actually priced.
-- Seeding them anyway is worth it for one reason: it fixes the NAME now, while
-- the decision is being made deliberately, instead of leaving it to whoever
-- happens to wire the first paid package under time pressure.
--
-- WHY THESE SLUGS, AND NOT THE PACKAGE CODE. The live codes are
--   aimo-asiya-beynelxalq-riyaziyyat-olimpiadasi
--   dunya-riyaziyyat-komanda-cempionati-wmtc-u3fp
-- The second ends in a random disambiguation suffix, which is the whole
-- argument in one string: olympiad_packages.code is an admin-editable slug
-- (015:33) minted for URL uniqueness, whereas an App Store product id can never
-- be renamed and can never be reused. Binding one to the other would make a
-- throwaway suffix permanent and public.
--
-- `aimo` and `wmtc` are the abbreviations these competitions are known by
-- internationally — the Asian International Mathematical Olympiad and the World
-- Mathematics Team Championship. They are short, stable, meaningful to a reader
-- who has never seen this database, and they survive the package being renamed,
-- re-slugged or re-created, which the code does not.
--
-- MATCHED BY CODE, NOT BY TITLE OR UUID: a uuid would not exist on a fresh
-- bootstrap and a title is translated. If a package code is not present the row
-- is simply not seeded — this migration never invents a mapping.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGET:
--          * 012_seed_initial_data.sql — alongside the migration-164 product
--            seed, once that is backported. Both are data, not schema.
-- Backport status: pending
-- Destructive change: no. Insert-only, `on conflict do nothing`.
-- =============================================================================
begin;

insert into public.iap_products
  (platform, product_id, scope, package_id, "interval", active)
select 'ios', v.product_id, 'olympiad_package', p.id, null, false
from (values
  ('ai.olympiq.app.oly.aimo', 'aimo-asiya-beynelxalq-riyaziyyat-olimpiadasi'),
  ('ai.olympiq.app.oly.wmtc', 'dunya-riyaziyyat-komanda-cempionati-wmtc-u3fp')
) as v(product_id, code)
join public.olympiad_packages p on p.code = v.code
on conflict (platform, product_id) do nothing;

-- -----------------------------------------------------------------------------
-- VERIFICATION. Assert the reservations are INERT — that is the whole point.
-- -----------------------------------------------------------------------------
do $$
declare
  v_rows   int;
  v_active int;
  v_priced int;
begin
  select count(*) into v_rows
  from public.iap_products
  where platform = 'ios' and scope = 'olympiad_package';

  select count(*) into v_active
  from public.iap_products
  where platform = 'ios' and scope = 'olympiad_package' and active;

  if v_active > 0 then
    raise exception
      '165: an olympiad store product is ACTIVE — nothing here may be sellable '
      'until its package is priced and its App Store product exists';
  end if;

  -- Android must remain unrepresentable, not merely unused.
  if exists (select 1 from public.iap_products where platform <> 'ios') then
    raise exception
      '165: a non-iOS product row exists — Android is purchase-silent by design';
  end if;

  select count(*) into v_priced
  from public.olympiad_packages where price_amount > 0;

  raise notice
    '165: % olympiad product id(s) reserved, all inactive; % package(s) priced '
    'above zero', v_rows, v_priced;
  if v_priced = 0 then
    raise notice
      '165: no package costs anything today, so no App Store Connect product is '
      'needed for olympiads yet — 21 subject products, not 23';
  end if;
end;
$$;

commit;
