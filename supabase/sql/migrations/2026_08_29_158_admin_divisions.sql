-- =============================================================================
-- 2026_08_29_158 — THE REST OF AZERBAIJAN.
--
-- REPORTED: a parent could not find their district when creating a child —
-- "Hacıqabul" among others. The location list held 15 entries, hand-written at
-- launch, covering major cities only. Azerbaijan has 64 rayons and 11 cities of
-- republic significance; 61 of those 75 were simply absent, so for a family in
-- any of them the registration flow had no correct answer to offer.
--
-- SOURCE, and the standard it is held to: "İnzibati Ərazi Bölgüsü Təsnifatı,
-- 2024" — the State Statistical Committee's administrative-territorial
-- classification, approved by collegium decision 2/2 of 16.02.2024 and agreed
-- with the Apparatus of the Milli Məclis. Extracted to
-- supabase/seed/locations_2026.json (sha256 of the source PDF recorded there).
-- Nothing here is invented, interpolated or pattern-filled: every row below is
-- a section header read out of that document.
--
-- WHY THE COUNTS CAN BE TRUSTED. The classification's 8-digit codes encode unit
-- status in their LAST DIGIT (1 = rayon, 2 = republic city, 3 = intra-city
-- rayon, 4 = rayon-subordinate city), so the three classes were counted
-- mechanically rather than by eye, and the extraction asserts 64/11/12 or fails.
-- The code is carried into this file as documentation and as a stable join key
-- for any future refresh — the table has no column for it, so it lives in the
-- comment beside each name.
--
-- THE EN-DASH TRAP, worth naming because of what it silently drops. Section
-- headers in the source use BOTH a hyphen-minus and an EN DASH (U+2013) before
-- the code. A regex matching only the hyphen loses exactly eight units: Ağdam,
-- Ağdərə, Cəbrayıl, Füzuli, Xocavənd, Kəlbəcər, Laçın and Şuşa — precisely the
-- Qarabağ / Şərqi Zəngəzur set, whose absence would read as a deliberate
-- omission rather than as the encoding bug it is. All eight are present below
-- and are asserted BY NAME at the end of this file.
--
-- AĞDƏRƏ is new — created by Law 1043-VIQ of 05.12.2023 out of parts of Ağdam,
-- Kəlbəcər and Tərtər. It is missing from most older lists.
--
-- WHAT THIS DOES NOT TOUCH:
--   * The 15 existing rows. Nine are exact republic-city matches; five (Quba,
--     Şamaxı, Qəbələ, Gədəbəy, Ağdam) were seeded as "cities" but are RAYONS in
--     the classification — same NAME either way, so `on conflict do nothing`
--     leaves them exactly as they are. The distinction was only ever
--     conceptual: `districts` stores no unit-type column.
--   * XIRDALAN, which is neither. The classification places it INSIDE Abşeron
--     rayonu as a rayon-subordinate city. It is KEPT ACTIVE deliberately: it is
--     a city of roughly 100,000 that residents identify with, it has zero
--     schools and zero students today so nothing can break either way, and
--     removing a familiar name from a dropdown is a worse regression than
--     carrying one extra row. The school import that follows assigns the 11
--     schools whose names carry "Xırdalan şəhəri" to it rather than to Abşeron,
--     so it does not become a dead end — a district with no schools is exactly
--     as unusable as a missing district, because school is REQUIRED at
--     registration (web-app/src/lib/auth/children.ts).
--   * Bakı's 12 intra-city rayons, already seeded in `city_districts`. They are
--     re-asserted here, not re-inserted. Bakı remains the ONLY city with
--     intra-city rayons — Gəncə's were abolished in 2022, which this source
--     independently confirms by listing none.
--
-- CONSEQUENCE TO BE AWARE OF: giving a city active `city_districts` rows arms
-- two guards — `school_district_guard` then REQUIRES a rayon on every new school
-- in that city, and `create_child_account` raises `district_required`. Every
-- unit added here is rayon-less, so neither guard changes behaviour for them.
--
-- Naxçıvan's 7 rayons are PEERS of mainland rayons, not a nested level: the
-- autonomous-republic heading carries status digit 0 and is a grouping label,
-- not an administrative unit. They are inserted flat, like every other rayon.
--
-- Self-transacting. Run bare against staging, then production.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 012_seed_initial_data.sql — the `districts` seed block, which
--            currently inserts 15 hand-written rows.
-- Backport status: completed
-- Destructive change: no. Insert-only, `on conflict do nothing`; no row is
--          updated, deactivated or deleted.
-- =============================================================================
begin;

-- The 64 rayons and 11 cities of republic significance, as one flat level-1
-- list. `districts` is the CITY catalog by its historic name; after this it is
-- honestly a "city or rayon" catalog, which is what the registration form has
-- always meant by "Şəhər".
insert into public.districts (name, country_code, status)
select v.name, 'AZ', 'active'
from (values
  ('Abşeron', '30800001'),
  ('Ağcabədi', '60800001'),
  ('Ağdam', '60900001'),
  ('Ağdaş', '90300001'),
  ('Ağdərə', '61200001'),
  ('Ağstafa', '50200001'),
  ('Ağsu', '40900001'),
  ('Astara', '80100001'),
  ('Babək', '10300001'),
  ('Balakən', '40100001'),
  ('Beyləqan', '60700001'),
  ('Bərdə', '61000001'),
  ('Biləsuvar', '80800001'),
  ('Cəbrayıl', '60500001'),
  ('Cəlilabad', '80600001'),
  ('Culfa', '10600001'),
  ('Daşkəsən', '50600001'),
  ('Füzuli', '60600001'),
  ('Gədəbəy', '50500001'),
  ('Goranboy', '50900001'),
  ('Göyçay', '40800001'),
  ('Göygöl', '50800001'),
  ('Hacıqabul', '91000001'),
  ('Xaçmaz', '30200001'),
  ('Xızı', '30600001'),
  ('Xocalı', '70100001'),
  ('Xocavənd', '70300001'),
  ('İmişli', '90700001'),
  ('İsmayıllı', '40700001'),
  ('Kəlbəcər', '60100001'),
  ('Kəngərli', '10800001'),
  ('Kürdəmir', '90600001'),
  ('Qax', '40300001'),
  ('Qazax', '50100001'),
  ('Qəbələ', '40600001'),
  ('Qobustan', '30700001'),
  ('Quba', '30300001'),
  ('Qubadlı', '60300001'),
  ('Qusar', '30100001'),
  ('Laçın', '60200001'),
  ('Lerik', '80300001'),
  ('Masallı', '80500001'),
  ('Neftçala', '80700001'),
  ('Oğuz', '40500001'),
  ('Ordubad', '10700001'),
  ('Saatlı', '90800001'),
  ('Sabirabad', '90900001'),
  ('Salyan', '80900001'),
  ('Samux', '50700001'),
  ('Sədərək', '10100001'),
  ('Siyəzən', '30500001'),
  ('Şabran', '30400001'),
  ('Şahbuz', '10500001'),
  ('Şamaxı', '41000001'),
  ('Şəmkir', '50400001'),
  ('Şərur', '10200001'),
  ('Şuşa', '70200001'),
  ('Tərtər', '61100001'),
  ('Tovuz', '50300001'),
  ('Ucar', '90400001'),
  ('Yardımlı', '80400001'),
  ('Zaqatala', '40200001'),
  ('Zəngilan', '60400001'),
  ('Zərdab', '90500001'),
  ('Bakı', '00000002'),
  ('Gəncə', '20000002'),
  ('Xankəndi', '70400002'),
  ('Lənkəran', '80200002'),
  ('Mingəçevir', '90200002'),
  ('Naftalan', '51000002'),
  ('Naxçıvan', '10400002'),
  ('Sumqayıt', '30900002'),
  ('Şəki', '40400002'),
  ('Şirvan', '91100002'),
  ('Yevlax', '90100002')
) as v(name, code)
on conflict (country_code, name) do nothing;

-- -----------------------------------------------------------------------------
-- VERIFICATION. Counts first, then the eight units an en-dash-blind extraction
-- would have dropped — asserted by name, because a silent political-looking
-- omission is the failure mode that matters here.
-- -----------------------------------------------------------------------------
do $$
declare
  v_total   int;
  v_missing text;
begin
  select count(*) into v_total from public.districts where country_code = 'AZ';
  -- 75 classification units + Xırdalan, which is deliberately retained.
  if v_total < 76 then
    raise exception '158: expected at least 76 AZ districts, found %', v_total;
  end if;

  select string_agg(n, ', ' order by n) into v_missing
  from (values
    ('Ağdam'), ('Ağdərə'), ('Cəbrayıl'), ('Füzuli'),
    ('Xocavənd'), ('Kəlbəcər'), ('Laçın'), ('Şuşa')
  ) as t(n)
  where not exists (
    select 1 from public.districts d
    where d.country_code = 'AZ' and d.name = t.n
  );
  if v_missing is not null then
    raise exception
      '158: en-dash casualties missing from districts: %', v_missing;
  end if;

  -- Hacıqabul is the unit the owner actually reported. Assert it by name.
  if not exists (select 1 from public.districts
                  where country_code = 'AZ' and name = 'Hacıqabul') then
    raise exception '158: Hacıqabul is still missing';
  end if;

  -- Bakı must still be the only city carrying intra-city rayons.
  if exists (
    select 1 from public.city_districts cd
    join public.districts d on d.id = cd.city_id
    where d.name <> 'Bakı'
  ) then
    raise exception '158: a city other than Bakı has intra-city rayons';
  end if;

  raise notice '158: % AZ districts; all 8 en-dash units and Hacıqabul present',
    v_total;
end;
$$;

commit;
