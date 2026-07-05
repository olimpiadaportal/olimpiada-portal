-- =============================================================================
-- 2026_07_05_030_student_palette.sql
-- Round 12 — Prompt 3: per-student light-mode color palette.
--
-- Product model:
--   * A student may pick ONE of 5 child-friendly LIGHT-MODE color palettes in their
--     profile (next to the Character Stickers picker). The choice persists per
--     student and is applied SSR via a data-palette attribute on the .arena wrapper;
--     palette CSS is scoped to [data-theme="light"] only, so DARK MODE IS UNTOUCHED.
--   * Stored as a single text column on students (nullable = default palette). A
--     CHECK constraint is the server-side whitelist (the 5 palette slugs are
--     hard-coded in CSS; there is no palette catalog table).
--   * The child writes their own students row through the existing students_write
--     RLS policy (profile_id = current_profile_id()); there is NO column-level
--     UPDATE restriction on students, so no new grant is required (mirrors the
--     first_name/last_name self-edit path).
--
-- Backports: column + CHECK -> canonical 002; validation check #39 -> canonical 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- Destructive change: no (additive nullable column + CHECK).
-- =============================================================================

begin;

alter table public.students
  add column if not exists palette text;

-- Whitelist the 5 allowed palette slugs (NULL = default look). Idempotent guard so
-- re-running the migration does not error on the existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'students_palette_chk'
       and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_palette_chk
      check (palette is null or palette in ('sky','bubblegum','mint','sunset','rainbow'));
  end if;
end
$$;

comment on column public.students.palette is
  'Chosen child-friendly LIGHT-MODE palette slug (sky|bubblegum|mint|sunset|rainbow) or NULL for the default. Applied via data-palette on .arena; dark mode unaffected.';

commit;

-- =============================================================================
-- End of 2026_07_05_030_student_palette.sql
-- =============================================================================
