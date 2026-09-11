-- Migration: 2026_09_10_171_subject_translations.sql
-- Purpose: make RENAMING A SUBJECT actually change what a family sees. Until
--          now `subjects.name` held ONE Azerbaijani string and every visible
--          label was resolved from the app dictionaries instead, so an admin
--          who renamed a seeded subject saved a row and changed nothing, in any
--          of the three languages, on either platform.
-- Environment first applied: staging + production, 2026-09-10
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 003_academic_taxonomy.sql -- the table;
--          * 010_rls_policies.sql      -- enable-RLS array + the academic
--                                         taxonomy public-read/admin-write loop;
--          * 011_indexes_constraints_functions_triggers.sql -- the
--                                         trg_set_updated_at registration loop;
--          * 012_seed_initial_data.sql -- az/en/ru for the six seeded subjects,
--                                         so a from-zero rebuild is born
--                                         trilingual and check 129 passes on it;
--          * 013_validation_queries.sql -- new check 129.
-- Backport status: completed (same round, all five files above)
-- Destructive change: no. This file creates one table and INSERTs into it. It
--          never updates or deletes a row of public.subjects -- grep-verifiable:
--          `grep -nE '(update|delete from) +public\.subjects' ` on this file
--          returns nothing.
-- Rollback notes: REVERSIBLE and cheap.
--            drop table if exists public.subject_translations cascade;
--          Nothing else has to be undone: no base column changes, and the app's
--          read path falls straight back to the dictionary when the table is
--          absent or unreadable.
-- =============================================================================
-- 2026_09_10_171 -- THE RENAME THAT RENAMED NOTHING.
--
-- THE DEFECT. web-app/src/lib/subjectLabel.ts (and its mobile twin) resolved a
-- subject's visible name as:
--
--     t("subj." || code)   -- the app's az/en/ru dictionary
--     -> subjects.name     -- only when that key does not exist
--
-- The dictionary WINS. Every seeded subject has a `subj.<code>` key
-- (math, english, informatics, elm, fizika, azerbaycan_dili, az_language), so
-- for every subject a real admin would ever rename, `subjects.name` was dead
-- weight. The rename wrote the row, the audit log recorded it, the admin panel
-- showed the new name, and the web app, the parent tabs and the student arena
-- all kept printing the old one. It looked like a caching bug and was not.
--
-- Only a subject with an UNKNOWN code fell through to `subjects.name`, which is
-- exactly why this survived: CREATING a subject worked perfectly and RENAMING
-- one silently did nothing.
--
-- WHY A SIBLING TABLE AND NOT "JUST READ subjects.name".
-- A subject name is CONTENT, and this product is trilingual. Preferring
-- `subjects.name` over the dictionary would have fixed the rename by breaking
-- the translations: one column cannot hold "Riyaziyyat", "Mathematics" and
-- Математика at once, so an English-reading parent would have started seeing
-- Azerbaijani everywhere. CLAUDE.md is explicit that content translation uses
-- the database *_translations tables, and this table is that shape --
-- question_translations, answer_option_translations, news_translations,
-- olympiad_package_translations, topic_translations, subtopic_translations:
-- uuid PK, `locale public.content_locale`, unique (parent_id, locale),
-- created_at/updated_at, ON DELETE CASCADE, the same public-read/admin-write
-- RLS and the same trg_set_updated_at registration.
--
-- ONE DIVERGENCE FROM topic_translations, DELIBERATE: az IS STORED HERE.
-- topic_translations carries `check (locale <> 'az')` because BOTH bulk
-- importers CREATE topics BY NAME and migration 095 matches on `t.name`, so a
-- mirrored az row would be a second, drifting copy of a MATCH KEY.
--
-- SUBJECTS ARE MATCHED BY NAME TOO. An earlier draft of this comment claimed
-- that "nothing in this repository resolves a subject by its name" and that the
-- only non-display read was the admin list's `ilike` search box. That was FALSE
-- and it was backported into 003 before anyone checked it. Three bulk-import
-- RPCs resolve a subject BY NAME:
--
--   * 011_indexes_constraints_functions_triggers.sql:3026 -- bulk_insert_questions()
--     per row:  select id into v_subject from public.subjects
--                where name = (v_item->'meta'->>'subject')
--     and raises `unknown subject %` when it misses;
--   * 011_indexes_constraints_functions_triggers.sql:3185 -- the same function
--     stamps question_imports.subject_id from the FIRST row's meta.subject;
--   * 011_indexes_constraints_functions_triggers.sql:6857 -- the olympiad bulk
--     import (bulk_insert_olympiad_questions) falls back to meta.subject when
--     the package itself carries no subject.
--
-- So `subjects.name` is a live MATCH KEY for admin-authored import files, and
-- the consequence decides the design rather than contradicting it:
--
--   A RENAME MUST NOT CHANGE subjects.name. The admin action writes the three
--   translation rows and LEAVES subjects.name alone, which means `name` and the
--   az translation ARE ALLOWED TO DIVERGE -- deliberately, not accidentally.
--   `name` is the stable machine-facing identifier the three importers above
--   (plus audit metadata, the deletion dialog and the admin search box) read;
--   the az row is what a family sees. Renaming "Riyaziyyat" to
--   "Riyaziyyat (I qism)" changes every visible label in the product and breaks
--   not one upload file an admin has been reusing for months. Nothing asserts
--   that the two agree, and check 129 deliberately does not: an assertion like
--   that would fail on the first successful rename.
--
-- What subjects are NOT matched by is the LOCALISED label -- nothing anywhere
-- reads subject_translations as a key. That is why storing az here is free,
-- unlike topics where the az string IS the key, and it buys two things:
--   * check 129 can assert "every active subject reads correctly in all three
--     languages" as one query, rather than "two locales plus a base column";
--   * the admin form gets three symmetric fields instead of one special one.
-- `subjects.name` REMAINS: it is not null, it is the import key above, and it
-- stays the LAST resort before the bare code in the read chain. The seed below
-- is what keeps a reader from ever reaching it.
--
-- WHY THE SEED IS THE LOAD-BEARING HALF OF THIS FILE.
-- Flipping the read precedence to "database first" while the table is EMPTY
-- would not be a fix, it would be a mass rename: every subject would instantly
-- start showing `subjects.name` in all three languages -- Azerbaijani to every
-- English and Russian reader, and for `az_language` the literally wrong word
-- (its stored name is "Məntiq" -- Logic -- while its code says language).
-- Section D therefore seeds the table with EXACTLY the strings the dictionary
-- resolves today, so the day this deploys nothing visible changes anywhere. The
-- feature is what happens on the day AFTER: an admin edits those strings and
-- the product obeys.
-- =============================================================================

-- =============================================================================
-- A. SCHEMA
-- =============================================================================

create table if not exists public.subject_translations (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  locale     public.content_locale not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_subject_locale unique (subject_id, locale),
  constraint ck_subject_tr_name_not_blank check (btrim(name) <> '')
);

comment on table public.subject_translations is
  'Per-locale subject display names (migration 171). A subject label resolves '
  'as: this table for the reader locale -> the built-in subj.<code> dictionary '
  '-> subjects.name -> the code. subjects.name is deliberately NOT kept in step '
  'with the az row: three bulk-import RPCs in 011 resolve a subject by name, so '
  'it is an import match key that a rename must leave alone. No extra index: '
  'uq_subject_locale is the (subject_id, locale) b-tree every read looks up on.';

-- ON DELETE CASCADE is the RIGHT behaviour here and is not the trap block 10 of
-- subject_deletion_blocks() guards against. That block exists because
-- entitlements.subject_id CASCADE would silently destroy the only proof a family
-- was ever granted access. A display name is not evidence of anything: it is
-- metadata about a row that no longer exists, and a subject can only be deleted
-- once every history block is clear anyway. So the names go with the subject and
-- subject_translations is deliberately NOT added to that block list.
comment on column public.subject_translations.name is
  'Display name in `locale`. ck_subject_tr_name_not_blank keeps a blank out: '
  'the admin form falls back to the az value rather than storing an empty '
  'string, so no reader can ever be shown an empty subject label.';

-- -----------------------------------------------------------------------------
-- Baseline privileges (RLS gates rows). Mirrors the 010 baseline for new tables,
-- exactly as 014_news.sql:119-123 and 015_olympiad_preparation.sql:622-625 do.
--
-- NOT optional, and NOT covered by the `alter default privileges` lines at
-- 010_rls_policies.sql:84-86: those are GRANTOR-SCOPED -- they apply only to
-- tables created by the SAME role that ran them. Applied by any other role (a
-- dashboard session, a CI role, `postgres` instead of the project owner) this
-- table would be born with NO select privilege for anon or authenticated, and
-- the failure is silent in the worst possible way: PostgREST returns an empty
-- set, subjectLabel() falls through to the shipped `subj.<code>` dictionary,
-- every subject keeps its old name in all three languages, and nothing errors
-- anywhere -- i.e. THE EXACT BUG THIS FILE EXISTS TO FIX would survive its own
-- fix. 013's check 129 asserts the SELECT grant for that reason.
-- -----------------------------------------------------------------------------
grant select on public.subject_translations to anon, authenticated, service_role;
grant insert, update, delete on public.subject_translations to authenticated;
grant all on public.subject_translations to service_role;

-- =============================================================================
-- B. RLS -- public read, admin write (the academic-taxonomy posture)
-- =============================================================================
-- Same posture as subjects/topics/topic_translations, and for the reason 114
-- spells out: these are display names shown on ANONYMOUS surfaces (the landing
-- page subject strip, /services, /subjects, the public olympiad catalog). A
-- narrower SELECT would make anon silently fall back to the dictionary -- half
-- of the bug this file exists to remove.

alter table public.subject_translations enable row level security;

drop policy if exists "subject_translations_select" on public.subject_translations;
create policy "subject_translations_select" on public.subject_translations
  for select using (true);

drop policy if exists "subject_translations_write" on public.subject_translations;
create policy "subject_translations_write" on public.subject_translations
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- C. updated_at trigger (011's set_updated_at, same wiring as every sibling)
-- =============================================================================

drop trigger if exists trg_set_updated_at on public.subject_translations;
create trigger trg_set_updated_at
  before update on public.subject_translations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. SEED -- the CURRENT dictionary, verbatim, so nothing changes on day one
-- =============================================================================
-- D1. The seven codes that carry a `subj.<code>` key in
--     web-app/src/i18n/messages.ts (and, byte-identically, in
--     mobile-app/src/i18n/messages.generated.ts, which is generated from it).
--     A code the database does not have simply matches nothing -- five of these
--     are seeded in 012, while `azerbaycan_dili` exists only on production
--     (migration 151 requires that subject and never creates it).
--
--     ON CONFLICT DO NOTHING, not DO UPDATE: re-running this file must not
--     revert a rename an admin has since made. That is what makes it safe to
--     run twice, and safe to run after the feature has been in use.

insert into public.subject_translations (subject_id, locale, name)
select s.id, v.locale::public.content_locale, v.name
  from public.subjects s
  join (values
    ('math',            'az', 'Riyaziyyat'),
    ('math',            'en', 'Mathematics'),
    ('math',            'ru', 'Математика'),
    ('english',         'az', 'İngilis dili'),
    ('english',         'en', 'English'),
    ('english',         'ru', 'Английский язык'),
    ('informatics',     'az', 'İnformatika'),
    ('informatics',     'en', 'Informatics'),
    ('informatics',     'ru', 'Информатика'),
    ('elm',             'az', 'Elm'),
    ('elm',             'en', 'Science'),
    ('elm',             'ru', 'Естественные науки'),
    ('fizika',          'az', 'Fizika'),
    ('fizika',          'en', 'Physics'),
    ('fizika',          'ru', 'Физика'),
    ('azerbaycan_dili', 'az', 'Azərbaycan dili'),
    ('azerbaycan_dili', 'en', 'Azerbaijani'),
    ('azerbaycan_dili', 'ru', 'Азербайджанский язык'),
    -- `az_language` is the LOGIC subject. The code is a historical misnomer the
    -- dictionary already corrects (subj.az_language = Məntiq / Logic / Логика)
    -- and migration 164 documents at length. Seeding the DICTIONARY strings and
    -- not `subjects.name` is what keeps that correction alive.
    ('az_language',     'az', 'Məntiq'),
    ('az_language',     'en', 'Logic'),
    ('az_language',     'ru', 'Логика')
  ) as v(code, locale, name) on v.code = s.code
on conflict (subject_id, locale) do nothing;

-- D2. EVERY REMAINING subject and locale: `subjects.name` in all three.
--     These are the admin-created subjects whose code has no dictionary key --
--     the ones whose label already fell through to `subjects.name` in every
--     language. Writing that same string into all three rows is therefore,
--     again, visually a no-op, and it is what lets check 129 assert complete
--     coverage instead of "complete except the ones we did not seed".
--     D1's rows already exist, so this fills only what D1 left empty.
--
--     A BLANK `subjects.name` IS REPAIRED HERE, NOT SKIPPED. The column is
--     `not null` but carries no not-blank constraint, so '' and '   ' are both
--     storable; the previous `where btrim(coalesce(s.name,'')) <> ''` filter
--     left such a subject with ZERO locales, which section E then turned into a
--     hard abort of the entire migration over one cosmetically broken catalog
--     row. `coalesce(nullif(btrim(s.name), ''), s.code)` falls back to the CODE
--     instead -- which is exactly what subjectLabel() renders as its own last
--     resort today, so the repair stays a visual no-op and satisfies
--     ck_subject_tr_name_not_blank by construction.
--
--     CHOSEN OVER adding `check (btrim(name) <> '')` to public.subjects: a new
--     constraint would abort this migration on precisely the data it exists to
--     tolerate, it would have to be validated against every historical row, and
--     it belongs to a subjects-table cleanup rather than to a display-name
--     feature. Section E now REPORTS such rows by code instead of failing.

insert into public.subject_translations (subject_id, locale, name)
select s.id, l.locale::public.content_locale,
       coalesce(nullif(btrim(s.name), ''), s.code)
  from public.subjects s
 cross join (values ('az'), ('en'), ('ru')) as l(locale)
on conflict (subject_id, locale) do nothing;

-- =============================================================================
-- E. ASSERT -- a half-seeded table is worse than none
-- =============================================================================
-- A subject missing one locale reads correctly in two languages and silently
-- wrong in the third, and nothing in the product reports it. That still raises.
--
-- What no longer raises is the one path that was actually REACHABLE: a subject
-- whose `name` is blank used to receive no D2 rows and therefore no locales at
-- all, so a single cosmetically empty catalog row aborted a schema migration.
-- D2 now labels those from their `code` and this block merely NAMES them, so
-- the operator can fix the name in the admin panel. After that repair the
-- exception below can only fire for a subject inserted DURING this migration --
-- genuinely exceptional, and worth stopping for.

do $$
declare
  v_missing  int;
  v_blank    int;
  v_unnamed  int;
  v_names    text;
begin
  -- Reported, never fatal: these subjects were labelled from their code.
  select count(*) into v_unnamed
    from public.subjects s
   where btrim(coalesce(s.name, '')) = '';

  if v_unnamed > 0 then
    select string_agg(s.code, ', ' order by s.code) into v_names
      from public.subjects s
     where btrim(coalesce(s.name, '')) = '';
    raise notice '171: % subject(s) have a blank name and were labelled from '
                 'their code -- set a real name in the admin panel: %',
      v_unnamed, coalesce(v_names, '<unknown>');
  end if;

  select count(*) into v_missing
    from public.subjects s
   where (select count(distinct t.locale)
            from public.subject_translations t
           where t.subject_id = s.id) <> 3;

  if v_missing > 0 then
    select string_agg(s.code, ', ' order by s.code) into v_names
      from public.subjects s
     where (select count(distinct t.locale)
              from public.subject_translations t
             where t.subject_id = s.id) <> 3;
    raise exception '171: % subject(s) do not carry all three locales: %',
      v_missing, coalesce(v_names, '<unknown>');
  end if;

  select count(*) into v_blank
    from public.subject_translations where btrim(name) = '';
  if v_blank > 0 then
    raise exception '171: % blank subject translation(s)', v_blank;
  end if;

  raise notice '171: subject_translations ready -- % row(s) across % subject(s).',
    (select count(*) from public.subject_translations),
    (select count(*) from public.subjects);
end
$$;
