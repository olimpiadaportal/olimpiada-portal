-- =============================================================================
-- 2026_09_08_169 — STUDENT GENDER, OPTIONAL, FOR REPORTING.
--
-- WHY THIS EXISTS. The admin Accounts export needs a gender breakdown and the
-- platform has never collected one. There is no field to read and no honest
-- proxy: `students.avatar_key` holds 'girl'/'boy' for the preset avatars, but
-- that records which cartoon a nine-year-old picked, and 14 of 46 children use a
-- photo instead. Counting avatars as genders would produce a number that looks
-- like data and is not.
--
-- THE SHAPE, AND WHY IT IS THIS ONE.
--
--   NULLABLE, with no default. NULL means "nobody has been asked yet", which is
--   the true state of every one of the existing rows. An 'unspecified' DEFAULT
--   would backfill a positive claim onto 46 children whose parents were never
--   shown the question, and the export could then not tell "declined to say"
--   from "predates the field" — a distinction that matters the moment anyone
--   uses these numbers for anything.
--
--   'unspecified' IS a value, separately, because a parent who is asked and
--   chooses not to answer is saying something, and that answer must survive.
--
--   AN ENUM, not free text: this is reported on, and a text column becomes
--   'Male'/'male'/'M'/'kişi' within a year of the first CSV import.
--
-- THIS IS A MINOR'S PERSONAL DATA. Three consequences, all deliberate:
--   * OPTIONAL AT EVERY WRITE. No form may require it, and no gate may read it.
--     Nothing about a child's access, content or ranking consults this column;
--     it exists for aggregate reporting and nothing else.
--   * NO NEW READER. RLS on `students` already decides who may see a child's
--     row — the parent who created them, the child, and staff. This column
--     inherits exactly that and widens nothing.
--   * THE PRIVACY POLICY MUST SAY SO before the field is collected. The purpose
--     ("aggregate reporting on who uses the platform") and its optionality both
--     belong in all three locales. That is a content change the owner signs off,
--     not something a migration can assert on their behalf.
-- =============================================================================

-- The enum lives in 001 canonically; created here idempotently so the migration
-- can run against a database that predates it.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'student_gender') then
    create type public.student_gender as enum ('female', 'male', 'unspecified');
  end if;
end
$$;

comment on type public.student_gender is
  'Optional, self-declared gender for aggregate reporting. ''unspecified'' is a '
  'parent who was ASKED and declined; NULL is a child nobody has asked yet. The '
  'two are not the same and no report may collapse them.';

alter table public.students
  add column if not exists gender public.student_gender;

comment on column public.students.gender is
  'Optional. NULL = never asked (every row predating migration 169). Never read '
  'by any access, content or ranking rule — reporting only.';

-- No index. This is aggregated over a table of a few thousand rows at most, by
-- staff, a few times a year; an index would cost every write to buy nothing.
