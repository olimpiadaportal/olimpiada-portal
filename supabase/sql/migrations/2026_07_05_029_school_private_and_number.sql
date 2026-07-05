-- =============================================================================
-- 2026_07_05_029_school_private_and_number.sql
-- Round 12 — Prompt 1: private schools + numeric ordering.
--
-- Product model:
--   * A school may be PRIVATE (is_private = true) or public (default false).
--   * Schools sort everywhere as: PRIVATE first, then by numeric school_number
--     ASCENDING (so "2" before "10"), schools with NO number after the numbered
--     ones, then by name. school_number is a stored integer sort key derived from
--     the AZ name ("Bakı 6 nömrəli tam orta məktəb" -> 6); named institutions with
--     no number keep school_number = NULL and sort last within their group.
--   * A curated starter set of well-known Bakı PRIVATE schools is seeded. This is a
--     demonstrative starter list (the schools table has no source column, so the
--     provenance lives here); admins can add/rename/remove private schools via the
--     admin panel (full CRUD). Numbers/accuracy for any specific private school can
--     be corrected there — the ordering + flag capability is the deliverable.
--
-- Backports: columns + ordering index -> canonical 003; backfill + private seeds
--   -> canonical 012; validation check #38 -> canonical 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- Destructive change: no (additive columns/index/seeds + idempotent backfill).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- (1) Columns
-- -----------------------------------------------------------------------------
alter table public.schools
  add column if not exists is_private   boolean not null default false,
  add column if not exists school_number int;

comment on column public.schools.is_private is
  'True for private schools. Private schools sort BEFORE public ones everywhere.';
comment on column public.schools.school_number is
  'Numeric sort key parsed from the AZ name (N in "N nömrəli ..."). NULL for named institutions with no number (they sort after numbered schools).';

-- -----------------------------------------------------------------------------
-- (2) Backfill school_number from the name for existing rows.
--     Pattern: the integer immediately before "nömrəli". Idempotent (only fills
--     NULLs). Names with no such number stay NULL.
-- -----------------------------------------------------------------------------
update public.schools
   set school_number = nullif(substring(name from '([0-9]+)[[:space:]]+nömrəli'), '')::int
 where school_number is null
   and name ~ '[0-9]+[[:space:]]+nömrəli';

-- -----------------------------------------------------------------------------
-- (3) Ordering index (private first, number asc nulls last, name).
-- -----------------------------------------------------------------------------
create index if not exists ix_schools_display_order
  on public.schools (is_private desc, school_number asc nulls last, name);

-- -----------------------------------------------------------------------------
-- (4) Seed a curated starter set of well-known Bakı PRIVATE schools.
--     is_private = true; no number -> school_number NULL (sort by name within the
--     private group). Idempotent via uq_schools_district_name.
-- -----------------------------------------------------------------------------
insert into public.schools (name, district_id, status, is_private)
select v.name, d.id, 'active'::public.catalog_status, true
  from (values
    ('Dünya Məktəbi'),
    ('Landau Məktəbi'),
    ('Təfəkkür Liseyi'),
    ('Zəkalar Liseyi'),
    ('Avropa Liseyi'),
    ('Xəzər Universiteti nəzdində lisey')
  ) as v(name)
  cross join (select id from public.districts where country_code = 'AZ' and name = 'Bakı' limit 1) d
on conflict (district_id, lower(name)) do nothing;

-- Any private-flagged rows keep school_number NULL (no "nömrəli" in their names),
-- which is already the case after the backfill above.

commit;

-- -----------------------------------------------------------------------------
-- Smoke (run manually; not part of the migration):
--   select is_private, school_number, name from public.schools
--     order by is_private desc, school_number asc nulls last, name limit 20;
--   -- expect: private schools first, then "1 nömrəli...", "3...", not "10" before "2".
-- -----------------------------------------------------------------------------

-- =============================================================================
-- End of 2026_07_05_029_school_private_and_number.sql
-- =============================================================================
