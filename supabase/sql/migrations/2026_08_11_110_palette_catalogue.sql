-- =============================================================================
-- 2026_08_11_110_palette_catalogue.sql
-- 26 child palettes + a second, independent theme preference.
--
-- TWO PREFERENCES, DELIBERATELY SEPARATE COLUMNS
-- ----------------------------------------------
--   students.palette     — the chosen light-mode palette slug (NULL = default).
--   students.theme_pref  — the child's own dark/light choice.
--
-- They are separate on purpose. The investor requirement is "enabling Dark Mode
-- may override the palette visually but must NEVER erase it, and turning Dark
-- Mode off restores it". Two columns give that for free: turning dark on writes
-- only theme_pref, the data-palette attribute stays on .arena in both themes,
-- and only the light CSS matches it. There is no restore path that can get it
-- wrong because there is no restore path.
--
-- The reported bug — "a palette chosen while Dark Mode is on saves but nothing
-- changes" — is fixed by the app writing theme_pref='light' in the same update
-- as a non-NULL palette, and by step 3 below for children who already hit it.
--
-- NO CATALOGUE TABLE. The palettes are CSS: a table would mean generating a
-- stylesheet at runtime. The CHECK is purely the server-side whitelist,
-- mirroring web-app/src/lib/theme/palettes.ts, and
-- web-app/src/lib/__tests__/palettes.test.ts parses the canonical 002 line and
-- fails if the two lists ever disagree.
--
-- All five previous slugs are RETAINED (retuned in CSS only), so no existing
-- students.palette row needs migrating and none can become invalid.
--
-- No RLS change: students_write (010) already permits a self-row update, which
-- is how palette is written today.
--
-- Backports: CHECK + column -> canonical 002; validation check #94 -> canonical 013.
-- Destructive change: no (a widened CHECK + an additive NOT NULL column with a
-- default). IDEMPOTENT — safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Widen the palette whitelist from 5 to 26 slugs.
-- -----------------------------------------------------------------------------
alter table public.students drop constraint if exists students_palette_chk;

alter table public.students
  add constraint students_palette_chk
  check (palette is null or palette in (
    'sky','ocean','cyan','aqua','teal','arctic','navy','indigo','violet',
    'lavender','rainbow','aurora','bubblegum','sakura','rose','berry','coral',
    'peach','sunset','amber','sand','lime','mint','emerald','forest','graphite'
  ));

-- -----------------------------------------------------------------------------
-- 2. The second preference. 'dark' is the product default (the owner's
--    reference design), so every existing row keeps today's behaviour.
-- -----------------------------------------------------------------------------
alter table public.students
  add column if not exists theme_pref text not null default 'dark';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'students_theme_pref_chk'
       and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_theme_pref_chk
      check (theme_pref in ('light','dark'));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Backfill INTENT, not just a default. A child who already picked a palette
--    meant to see it — this is the retroactive half of the dark-mode fix. It is
--    a one-shot correction, not an invariant: after this runs a child may
--    legitimately re-enable dark and hold palette + theme_pref='dark'.
-- -----------------------------------------------------------------------------
update public.students
   set theme_pref = 'light'
 where palette is not null
   and theme_pref = 'dark';

comment on column public.students.palette is
  'Chosen light-mode palette slug (26-value whitelist; see web-app/src/lib/theme/palettes.ts) or NULL for the default look. Applied via data-palette on .arena in BOTH themes; only the light CSS matches it.';

comment on column public.students.theme_pref is
  'Child''s own dark/light preference. Independent of palette on purpose: enabling dark overrides the palette visually but never clears it, and disabling dark restores it. Transported to SSR via the non-httpOnly `theme` cookie, seeded at child login.';

-- -----------------------------------------------------------------------------
-- 4. Prove the migration landed before committing.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'students_palette_chk'
     and conrelid = 'public.students'::regclass;

  if v_def is null then
    raise exception 'students_palette_chk is missing after migration 110';
  end if;
  -- New AND old slugs: a half-applied constraint fails here rather than in the UI.
  if position('graphite' in v_def) = 0 or position('sky' in v_def) = 0 then
    raise exception 'students_palette_chk did not widen to the 26-slug catalogue: %', v_def;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'students'
       and column_name = 'theme_pref' and is_nullable = 'NO'
  ) then
    raise exception 'students.theme_pref is missing or nullable after migration 110';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'students_theme_pref_chk'
       and conrelid = 'public.students'::regclass
  ) then
    raise exception 'students_theme_pref_chk is missing after migration 110';
  end if;

  if exists (
    select 1 from public.students
     where palette is not null and theme_pref <> 'light'
  ) then
    raise exception 'the palette -> theme_pref backfill left rows behind';
  end if;
end
$verify$;

commit;

-- =============================================================================
-- End of 2026_08_11_110_palette_catalogue.sql
-- =============================================================================
