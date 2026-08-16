-- =============================================================================
-- 2026_08_15_114_curriculum_translations.sql
-- =============================================================================
-- Migration: 2026_08_15_114_curriculum_translations.sql
-- Purpose: Make the curriculum TREE trilingual. Until now public.topics and
--          public.subtopics carried a single Azerbaijani `name`, so a student
--          reading the app in English or Russian saw Azerbaijani topic labels
--          on the test picker, the run-page header, the "Results by topic"
--          block and the parent analytics dashboard — even though every
--          QUESTION on those screens was already translated.
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 003_academic_taxonomy.sql — the two new tables;
--          * 010_rls_policies.sql      — enable-RLS array + academic-taxonomy
--                                        policy loop;
--          * 011_indexes_constraints_functions_triggers.sql — trg_set_updated_at
--                                        registration + the three rewritten
--                                        functions and their grants;
--          * 012_seed_initial_data.sql — the from-zero rebuild note;
--          * 013_validation_queries.sql — checks 49 (stale signatures) and the
--                                        new check 102.
--          The 1077-row backfill itself is REFERENCED from 012, not inlined —
--          the same call 012 already makes for migration 095, and for the same
--          reason: a second copy of ~1100 generated VALUES lines would drift.
-- Backport status: pending
-- Destructive change: no. This file NEVER inserts, updates or deletes a row of
--          public.topics or public.subtopics — no row is created, renumbered,
--          re-termed, re-scoped or re-parented. That is a grep-verifiable
--          review invariant (`grep -nE '(insert into|update|delete from) +public\.(topics|subtopics)' `
--          on this file returns nothing) and section F re-proves it at run time
--          by comparing an id digest captured before the backfill.
-- Rollback notes:
--            drop table if exists public.subtopic_translations;
--            drop table if exists public.topic_translations;
--          then restore the three functions from 011 at their OLD signatures
--          (dropping the new arities first). No base-taxonomy row is affected.
--
-- -----------------------------------------------------------------------------
-- WHY A SIBLING TABLE AND NOT A COLUMN — and why AZ is NOT stored in it
-- -----------------------------------------------------------------------------
-- The repository's established shape for localized CONTENT is a sibling
-- `*_translations` table keyed (parent_id, locale) over public.content_locale:
-- question_translations, question_explanations, answer_option_translations,
-- olympiad_package_translations. These two tables mirror that shape exactly
-- (uuid PK with gen_random_uuid(), locale column, unique (parent_id, locale),
-- created_at/updated_at, ON DELETE CASCADE, same RLS posture, same
-- trg_set_updated_at registration).
--
-- ONE deliberate divergence: `check (locale <> 'az')`. Questions and packages
-- have NO localized text column at all, which is why their translations table
-- is the sole store. topics.name is different — it is `not null`, ~35 read
-- sites key on it, BOTH bulk importers CREATE topics by it
-- (bulk_insert_questions and bulk_insert_olympiad_package_questions), migration
-- 095's rerun match is `t.name = <source>`, and the admin panel's duplicate
-- guards fold on it. Mirroring AZ into the translations table as well would
-- need a two-way sync trigger plus a loop guard, and would still break the
-- first time an importer inserted a topic without writing the mirror row. So
-- there is exactly ONE home for AZ (the base column) and one for each other
-- locale (the translation row). Nothing has to be kept in step.
--
-- The fallback is therefore STRUCTURAL, not conventional:
-- coalesce(<translation>, <base name>) cannot be NULL because the base column
-- is `not null`, and cannot be '' because ck_*_name_not_blank rejects a
-- whitespace-only translation (the admin action deletes an emptied EN/RU field
-- instead of writing ''). Reading in `az` needs no lookup at all — the CHECK
-- guarantees the join simply misses.
--
-- -----------------------------------------------------------------------------
-- SOURCE OF THE DATA
-- -----------------------------------------------------------------------------
-- supabase/seed/curriculum_2026_translations.json — 1077 rows of
--   { grade, subject_az/en/ru, term, topic{az,en,ru}, subtopic{az,en,ru} },
-- parsed from docs/investor/Kurikulum_1-11_AZ_EN_RU.docx. The document holds 65
-- tables per language section in the same order; the parser PROVES alignment
-- before emitting anything by comparing table counts, per-table row counts and
-- every row's № and quarter (all three language-independent) across the AZ, EN
-- and RU sections — 1077 rows, zero disagreements — and aborts if that ever
-- fails. Verified properties of the payload: 260 distinct (grade, topic_az),
-- 1077 distinct (grade, topic_az, subtopic_az), every AZ key resolving to
-- exactly ONE (en, ru) pair, no blank en/ru, no apostrophe or backslash.
--
-- -----------------------------------------------------------------------------
-- THE MATCH KEY: (grade level, EXACT AZ name), scope = 'exam'
-- -----------------------------------------------------------------------------
-- Measured, not assumed. The staged payload was compared against the live exam
-- tree under five normalisations — exact / NFC / NFC+whitespace /
-- +quote-folding / +lowercasing — and ALL FIVE give 260/260 topics and
-- 1077/1077 subtopics. Byte-exact equality already matches everything, so the
-- backfill uses plain `=` with NO lower() and NO normalisation function, which
-- is also migration 095's own rerun key.
--
-- Avoiding lower() is not cosmetic: PostgreSQL lower('İ') yields 'i' + U+0307
-- while the admin panel's foldName() uses JS toLocaleLowerCase('az'), which
-- yields plain 'i'. A lower()-based key would silently disagree with the app.
--
-- scope = 'exam' is on EVERY join. The live database is not 260/1077 in total:
-- alongside the curriculum tree it holds grade-1 `math` topics with term NULL
-- that were created by the OLYMPIAD package importer (011: it inserts topics
-- with no term). Several of their names collide with curriculum names. Without
-- the scope filter the join fans out and writes curriculum English onto an
-- olympiad pool topic. Those olympiad-scoped rows are deliberately left
-- untranslated — they are per-package importer artefacts, not curriculum, and
-- the olympiad admin screens read the bare name.
--
-- The match is asserted, never assumed: section E5 raises with the unmatched
-- keys listed if fewer than 260 topics / 1077 subtopics resolve. A partial
-- match would be a silently half-Azerbaijani curriculum that surfaces months
-- later; a loud failure costs one edited VALUES line and a rerun.
-- =============================================================================

begin;

-- =============================================================================
-- A. SCHEMA
-- =============================================================================

create table if not exists public.topic_translations (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.topics (id) on delete cascade,
  locale     public.content_locale not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_topic_locale unique (topic_id, locale),
  -- A blank row would defeat coalesce(tr.name, t.name) and render an EMPTY
  -- topic label; the admin action deletes the row instead of storing ''.
  constraint ck_topic_tr_name_not_blank check (btrim(name) <> ''),
  -- AZ lives in topics.name. One home for AZ, no drift, no sync trigger.
  constraint ck_topic_tr_not_az check (locale <> 'az')
);

create table if not exists public.subtopic_translations (
  id          uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  locale      public.content_locale not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_subtopic_locale unique (subtopic_id, locale),
  constraint ck_subtopic_tr_name_not_blank check (btrim(name) <> ''),
  constraint ck_subtopic_tr_not_az check (locale <> 'az')
);

comment on table public.topic_translations is
  'EN/RU topic names. topics.name stays the AZ source of truth (both bulk importers '
  'create topics by it and migration 095 matches on it), so this table carries the '
  'OTHER locales only — ck_topic_tr_not_az enforces that. Reads resolve with '
  'coalesce(tr.name, t.name).';

comment on table public.subtopic_translations is
  'EN/RU subtopic names. subtopics.name stays the AZ source of truth; this table '
  'carries the other locales only (ck_subtopic_tr_not_az). Reads resolve with '
  'coalesce(tr.name, st.name).';

-- No extra index: uq_topic_locale / uq_subtopic_locale already provide the
-- b-tree on (parent_id, locale), which is what every embed and every join
-- below looks up on. (015's idx_olympiad_pkg_tr_package is redundant next to
-- its own unique constraint — deliberately not copied.)

-- =============================================================================
-- B. RLS — identical posture to the parent tables (public read / admin write)
-- =============================================================================
-- A narrower SELECT than topics/subtopics would make anon and public surfaces
-- silently fall back to Azerbaijani, which is exactly the bug this migration
-- exists to fix.

alter table public.topic_translations    enable row level security;
alter table public.subtopic_translations enable row level security;

grant select on public.topic_translations    to anon, authenticated, service_role;
grant select on public.subtopic_translations to anon, authenticated, service_role;
grant insert, update, delete on public.topic_translations    to authenticated;
grant insert, update, delete on public.subtopic_translations to authenticated;
grant all on public.topic_translations    to service_role;
grant all on public.subtopic_translations to service_role;

do $$
declare t text;
begin
  foreach t in array array['topic_translations', 'subtopic_translations'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I for select using (true);', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_write" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- =============================================================================
-- C. updated_at maintenance
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['topic_translations', 'subtopic_translations'] loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- =============================================================================
-- D. READ PATH — the three RPCs that return topic/subtopic NAMES
-- =============================================================================
-- Mechanism (one, not two): the reader's locale travels as a query parameter
-- and the name is resolved with coalesce(<translation>, <base name>) at the
-- data-access boundary, never inside a rendering component. The parameter uses
-- the SAME convention question bodies already use — `p_locale text default
-- 'az'` clamped to ('az','en','ru') — so get_test_review's body/prompt/option
-- text/explanation and these topic names are localized by one mechanism.
--
-- Only THREE functions read a topic or subtopic NAME. get_test_attempt,
-- get_practice_attempt and get_test_review return topic_id only and are
-- unchanged.
--
-- SIGNATURE CHURN IS THE RISK HERE. Adding a defaulted parameter does not
-- replace a function — it creates a SECOND overload, and every existing call at
-- the old arity then fails "function ... is not unique". So each old signature
-- is dropped first, and the revoke/grant posture is re-issued at the new
-- signature (a fresh function is executable by PUBLIC by default, and
-- test_attempt_result must stay service-role only).

drop function if exists public.submit_test_attempt(uuid, jsonb);
drop function if exists public.test_attempt_result(uuid);
drop function if exists public.get_child_subject_dashboard(uuid, uuid, int, text);

-- Shared result payload (score + per-question + per-topic breakdown). Internal
-- helper for submit (and re-reads); owner check lives in the callers.
-- The per-topic group key is (topic_id, resolved name): topic_id is already in
-- it, so localizing the name can never merge two distinct topics.
create or replace function public.test_attempt_result(
  p_attempt_id uuid,
  p_locale     text default 'az'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'attempt_id', ta.id,
    'status', ta.status,
    'score', ta.score,
    'max', ta.max_score,
    'submitted_at', ta.submitted_at,
    'results', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'question_id', taa.question_id, 'is_correct', taa.is_correct)), '[]'::jsonb)
      from public.test_attempt_answers taa where taa.attempt_id = ta.id),
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', b.tid, 'name', b.tname, 'total', b.total, 'correct', b.correct)), '[]'::jsonb)
      from (
        select q.topic_id as tid,
               coalesce(ttr.name, tp.name) as tname,
               count(*) as total,
               count(*) filter (where taa.is_correct) as correct
        from public.test_attempt_answers taa
        join public.questions q on q.id = taa.question_id
        left join public.topics tp on tp.id = q.topic_id
        -- 'az' resolves to no row by construction (ck_topic_tr_not_az), so the
        -- join misses and the base AZ name is used — no special case needed.
        left join public.topic_translations ttr
               on ttr.topic_id = tp.id
              and ttr.locale = (case when p_locale in ('az', 'en', 'ru')
                                     then p_locale else 'az' end)::public.content_locale
        where taa.attempt_id = ta.id
        group by q.topic_id, coalesce(ttr.name, tp.name)
      ) b))
  from public.test_attempts ta
  where ta.id = p_attempt_id;
$$;

-- submit_test_attempt: merge final answers (60s grace past the deadline; later
-- answers are IGNORED, saved ones still grade), then grade FROM THE STORED ROWS
-- (never from the client array — audit-H5 posture). Idempotent when graded.
-- Migration 057: daily-round attempts grade against the round's immutable
-- SNAPSHOT correctness (bank edits after generation can never change history).
-- p_locale only travels through to the result payload's topic names.
create or replace function public.submit_test_attempt(
  p_attempt_id uuid,
  p_answers    jsonb default null,
  p_locale     text  default 'az'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student  uuid := public.current_profile_id();
  v_att      record;
  v_snap     jsonb;
  v_item     jsonb;
  v_qid      uuid;
  v_sel      uuid[];
  v_seen     uuid[] := '{}';
  v_r        record;
  v_correct  uuid[];
  v_ok       boolean;
  v_score    numeric := 0;
  v_max      int;
  v_n        int := 0;
begin
  select id, student_profile_id, status, deadline_at, score, max_score, daily_round_id into v_att
  from public.test_attempts where id = p_attempt_id;
  if v_att.id is null or v_att.student_profile_id <> v_student then
    raise exception 'forbidden';
  end if;

  -- Idempotent: an already-graded attempt returns its stored result.
  if v_att.status = 'graded' then
    return public.test_attempt_result(p_attempt_id, p_locale);
  end if;
  if v_att.status <> 'in_progress' then
    raise exception 'submit: attempt is not in progress' using errcode = 'check_violation';
  end if;

  -- Daily-round attempts grade against the round's immutable snapshot
  -- (migration 057): bank edits after generation can never change history.
  -- Round 38: per-student attempts have NO round — they grade from live
  -- options below, like topic tests (option-id stability is DB-guarded).
  if v_att.daily_round_id is not null then
    select content_snapshot into v_snap
    from public.daily_rounds where id = v_att.daily_round_id;
  end if;

  -- Merge the final client answers only within deadline + 60s grace.
  if p_answers is not null
     and (v_att.deadline_at is null or now() <= v_att.deadline_at + interval '60 seconds') then
    for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
    loop
      v_n := v_n + 1;
      exit when v_n > 1000;  -- payload cap (Round 51: 2x the 500-question ceiling)
      v_qid := nullif(v_item->>'question_id', '')::uuid;
      if v_qid is null or v_qid = any (v_seen) then continue; end if;
      v_seen := v_seen || v_qid;
      select coalesce(array_agg(e::uuid), '{}')
        into v_sel
        from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) e;
      update public.test_attempt_answers
         set selected_option_ids = v_sel, updated_at = now()
       where attempt_id = p_attempt_id and question_id = v_qid;
    end loop;
  end if;

  -- Grade from the STORED rows.
  for v_r in
    select question_id, selected_option_ids
    from public.test_attempt_answers where attempt_id = p_attempt_id
  loop
    if v_snap is not null then
      select coalesce(array_agg((o->>'option_id')::uuid), '{}')
        into v_correct
        from jsonb_array_elements(v_snap) q_el
        cross join lateral jsonb_array_elements(q_el->'options') o
        where (q_el->>'question_id')::uuid = v_r.question_id
          and coalesce((o->>'is_correct')::boolean, false);
    else
      select coalesce(array_agg(ao.id), '{}')
        into v_correct
        from public.answer_options ao
        where ao.question_id = v_r.question_id and ao.is_correct;
    end if;

    v_ok := (array_length(v_correct, 1) is not null)
        and (coalesce(v_r.selected_option_ids, '{}') <@ v_correct)
        and (v_correct <@ coalesce(v_r.selected_option_ids, '{}'))
        and coalesce(array_length(v_r.selected_option_ids, 1), 0) = array_length(v_correct, 1);

    update public.test_attempt_answers
       set is_correct = v_ok,
           points_awarded = case when v_ok then 1 else 0 end,
           updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_r.question_id;
    if v_ok then v_score := v_score + 1; end if;
  end loop;

  select count(*) into v_max from public.test_attempt_answers where attempt_id = p_attempt_id;
  begin
    update public.test_attempts
       set status = 'graded', score = v_score, max_score = v_max,
           submitted_at = now(), graded_at = now(), updated_at = now()
     where id = p_attempt_id;
  exception when unique_violation then
    -- Another attempt of the same subject+day was submitted first (second
    -- device). This one can never grade — surface the friendly signal; the
    -- losing attempt stays in_progress and is swept by the expiry cron.
    -- (Any state write here would be undone by this raise — savepoint
    -- semantics — so none is attempted.)
    raise exception 'daily: already attempted today' using errcode = 'unique_violation';
  end;

  return public.test_attempt_result(p_attempt_id, p_locale);
end;
$$;

-- Round 9 (migration 023): REAL analytics RPCs (parent dashboard + admin
-- platform overview). On-demand aggregation over graded attempts; in-body
-- authorization (service role / admin / linked parent / the child itself);
-- EXECUTE revoked from anon.
create or replace function public.get_child_subject_dashboard(
  p_student_profile_id uuid,
  p_subject_id uuid default null,
  p_days int default 30,
  p_scope text default 'tests',
  p_locale text default 'az'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  -- Module scope (migration 051): 'tests' (default) or 'olympiads'; unknown
  -- values coerce to 'tests' so pre-051 callers keep working unchanged.
  v_scope text := case when p_scope = 'olympiads' then 'olympiads' else 'tests' end;
  -- Same clamp the question-body RPCs use; an unknown tag reads as Azerbaijani
  -- (migration 114).
  v_loc public.content_locale :=
    (case when p_locale in ('az', 'en', 'ru') then p_locale else 'az' end)::public.content_locale;
  v_result jsonb;
begin
  -- Authorization: service role, admin, the linked parent, or the child itself.
  -- COALESCE is load-bearing: current_profile_id() can be NULL (no profile),
  -- which would turn the OR-chain NULL and silently skip an un-coalesced guard.
  if not coalesce(
    auth.role() = 'service_role'
    or public.is_admin()
    or public.is_parent_linked_to_student(p_student_profile_id)
    or public.current_profile_id() = p_student_profile_id
  , false) then
    raise exception 'not allowed';
  end if;

  with graded as (
    select ta.id, ta.submitted_at,
           least(greatest(coalesce(
             extract(epoch from (ta.submitted_at - ta.started_at)) / 60.0, 0), 0), 180)
             as minutes_spent
      from public.test_attempts ta
     where ta.student_profile_id = p_student_profile_id
       and ta.status = 'graded'
       and ta.submitted_at >= now() - make_interval(days => v_days)
       and (p_subject_id is null or ta.subject_id = p_subject_id)
       -- Module scope (migration 051): olympiad attempts never mix into the
       -- Subjects analytics and vice versa.
       and ((v_scope = 'olympiads' and ta.kind = 'olympiad')
         or (v_scope = 'tests' and ta.kind <> 'olympiad'))
  ),
  ans as (
    -- answered = a non-empty stored selection; empty selection = SKIPPED
    -- (migration 046 — skipped must never count as wrong).
    select a.attempt_id, a.is_correct,
           coalesce(array_length(a.selected_option_ids, 1), 0) > 0 as answered,
           q.topic_id, q.subtopic_id, q.olympiad_package_id, g.submitted_at
      from public.test_attempt_answers a
      join graded g on g.id = a.attempt_id
      join public.questions q on q.id = a.question_id
  )
  select jsonb_build_object(
    'scope', v_scope,
    'totals', jsonb_build_object(
      'attempts',  (select count(*) from graded),
      'questions', (select count(*) from ans),
      'answered',  (select count(*) filter (where answered) from ans),
      'correct',   (select count(*) filter (where is_correct) from ans),
      'wrong',     (select count(*) filter (where answered and not is_correct) from ans),
      'skipped',   (select count(*) filter (where not answered) from ans),
      'accuracy',  (select round(count(*) filter (where is_correct)::numeric
                                 / nullif(count(*) filter (where answered), 0) * 100, 1)
                      from ans)
    ),
    'time_spent_minutes', (select round(coalesce(sum(minutes_spent), 0)) from graded),
    'last_activity', (select max(submitted_at) from graded),
    'weekly_activity', (
      -- gap-filled last-7-days series (today inclusive)
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date, 'attempts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - 6, current_date, interval '1 day') d
        left join (select submitted_at::date dt, count(*) n
                     from graded group by 1) c on c.dt = d::date
    ),
    'accuracy_trend', (
      -- accuracy per day over ANSWERED questions only (046); zero-answered days
      -- are omitted (they would otherwise chart as a false 0%).
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', dt, 'accuracy', round(cor::numeric / nullif(answ, 0) * 100, 1))
               order by dt), '[]'::jsonb)
        from (select submitted_at::date dt,
                     count(*) filter (where answered) answ,
                     count(*) filter (where is_correct) cor
                from ans group by 1
              having count(*) filter (where answered) > 0) t
    ),
    'per_topic', (
      -- zero-answered topics excluded (046): strongest/weakest must never rank
      -- a topic nobody actually answered. topic_id is part of the group key, so
      -- localizing the label (114) cannot merge two distinct topics.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic_id', x.topic_id, 'topic', x.tname,
               'answered', x.answ, 'correct', x.cor,
               'wrong', x.answ - x.cor, 'skipped', x.skp,
               'accuracy', round(x.cor::numeric / nullif(x.answ, 0) * 100, 1))
               order by x.answ desc, x.tname), '[]'::jsonb)
        from (select a.topic_id, coalesce(ttr.name, t.name) as tname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.topic_translations ttr
                       on ttr.topic_id = t.id and ttr.locale = v_loc
               group by a.topic_id, coalesce(ttr.name, t.name)
              having count(*) filter (where a.answered) > 0) x
    ),
    'mistakes', (
      -- Grouped by t.id / st.id, NOT by the names (114). A name-based key would
      -- become locale-dependent — the same rows would merge differently in EN
      -- than in AZ — and it already merged two genuinely distinct subtopics that
      -- happen to share a name. The coalesced names ride along as extra group
      -- keys only because they are functionally determined by the ids.
      select coalesce(jsonb_agg(jsonb_build_object(
               'topic', y.tname, 'subtopic', y.sname,
               'wrong', y.wrong,
               'accuracy', round(y.cor::numeric / nullif(y.answ, 0) * 100, 1))
               order by y.wrong desc), '[]'::jsonb)
        from (select coalesce(ttr.name, t.name) as tname,
                     coalesce(str.name, st.name, '—') as sname,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where a.answered and not a.is_correct) wrong
                from ans a
                join public.topics t on t.id = a.topic_id
                left join public.topic_translations ttr
                       on ttr.topic_id = t.id and ttr.locale = v_loc
                left join public.subtopics st on st.id = a.subtopic_id
                left join public.subtopic_translations str
                       on str.subtopic_id = st.id and str.locale = v_loc
               group by t.id, st.id,
                        coalesce(ttr.name, t.name),
                        coalesce(str.name, st.name, '—')
              having count(*) filter (where a.answered and not a.is_correct) > 0
               order by count(*) filter (where a.answered and not a.is_correct) desc
               limit 10) y
    ),
    'per_package', (
      -- Olympiad scope only (051): per-package breakdown through the attempt
      -- questions' private-pool link. Title in the reader's locale with an az
      -- fallback (114; it used to be hardcoded to az); '[]' under tests scope.
      select coalesce(jsonb_agg(jsonb_build_object(
               'package_id', z.pkg, 'title', z.title,
               'attempts', z.att, 'answered', z.answ, 'correct', z.cor,
               'wrong', z.answ - z.cor, 'skipped', z.skp,
               'accuracy', round(z.cor::numeric / nullif(z.answ, 0) * 100, 1))
               order by z.att desc, z.title), '[]'::jsonb)
        from (select a.olympiad_package_id as pkg,
                     coalesce(
                       (select tr.title from public.olympiad_package_translations tr
                         where tr.olympiad_package_id = a.olympiad_package_id
                           and tr.locale = v_loc limit 1),
                       (select tr.title from public.olympiad_package_translations tr
                         where tr.olympiad_package_id = a.olympiad_package_id
                           and tr.locale = 'az' limit 1),
                       '—') as title,
                     count(distinct a.attempt_id) att,
                     count(*) filter (where a.answered) answ,
                     count(*) filter (where a.is_correct) cor,
                     count(*) filter (where not a.answered) skp
                from ans a
               where v_scope = 'olympiads' and a.olympiad_package_id is not null
               group by a.olympiad_package_id) z
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.test_attempt_result(uuid, text) is
  'Shared graded-attempt payload (score + per-question + per-topic). p_locale '
  '(az/en/ru, default az) localizes the topic names through topic_translations '
  'with an az fallback. Service-role only; owner checks live in the callers.';

comment on function public.submit_test_attempt(uuid, jsonb, text) is
  'Grades an attempt from the STORED answer rows and returns test_attempt_result. '
  'Idempotent for a graded attempt. p_locale is passed straight through to the '
  'result payload so the per-topic breakdown comes back in the reader''s language.';

comment on function public.get_child_subject_dashboard(uuid, uuid, int, text, text) is
  'Per-child analytics over graded attempts in a rolling window, module-scoped '
  '(migration 051): p_scope tests (default; kind<>olympiad) or olympiads (kind=olympiad, '
  'adds per_package). Answer states separated (046): wrong counts only answered-and-'
  'incorrect; skipped is its own metric; accuracy uses answered as the denominator. '
  'p_locale (az/en/ru, default az) localizes topic/subtopic names and package titles. '
  'Callable by admins, the linked parent, or the child.';

-- Grants re-issued at the NEW signatures: a freshly created function is
-- executable by PUBLIC, so skipping this would silently expose the analytics
-- RPC to anon and the result helper to every authenticated session.
revoke all on function public.submit_test_attempt(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_test_attempt(uuid, jsonb, text) to authenticated, service_role;
revoke all on function public.test_attempt_result(uuid, text) from public, anon, authenticated;
grant execute on function public.test_attempt_result(uuid, text) to service_role;
revoke all on function public.get_child_subject_dashboard(uuid, uuid, int, text, text)
  from public, anon;
grant execute on function public.get_child_subject_dashboard(uuid, uuid, int, text, text)
  to authenticated, service_role;

-- =============================================================================
-- E. BACKFILL — 1077 curriculum rows -> 260 topic + 1077 subtopic translations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- E0. Identity snapshot. Section F re-computes these and refuses to commit if
--     a single exam topic or subtopic id moved — the machine-checked form of
--     "this file touches no base-taxonomy row".
-- -----------------------------------------------------------------------------
drop table if exists _curriculum_tr_snapshot;
create temporary table _curriculum_tr_snapshot on commit drop as
select
  (select count(*) from public.topics t where t.scope = 'exam') as topic_count,
  (select md5(coalesce(string_agg(t.id::text, ',' order by t.id), ''))
     from public.topics t where t.scope = 'exam') as topic_digest,
  (select count(*) from public.subtopics st
     join public.topics t on t.id = st.topic_id where t.scope = 'exam') as subtopic_count,
  (select md5(coalesce(string_agg(st.id::text, ',' order by st.id), ''))
     from public.subtopics st
     join public.topics t on t.id = st.topic_id where t.scope = 'exam') as subtopic_digest;

-- -----------------------------------------------------------------------------
-- E1. Stage the trilingual source.
-- -----------------------------------------------------------------------------
-- A generated INSERT ... VALUES block into an ON COMMIT DROP temp table, for
-- exactly the reasons migration 095 gives: a jsonb literal is one unbreakable
-- 200 KB line nobody can diff, \copy needs a companion file (so the migration
-- would stop being self-contained and could not run in the SQL editor), and the
-- data is relational (a subtopic needs its parent topic's id) so it has to be
-- staged and joined somewhere regardless. The `drop table if exists` above the
-- create makes a second paste in the same session a no-op rather than an error.
drop table if exists _curriculum_tr_2026;
create temporary table _curriculum_tr_2026 (
  grade_level smallint not null,
  topic_az    text not null,
  topic_en    text not null,
  topic_ru    text not null,
  subtopic_az text not null,
  subtopic_en text not null,
  subtopic_ru text not null
) on commit drop;

insert into _curriculum_tr_2026
  (grade_level, topic_az, topic_en, topic_ru, subtopic_az, subtopic_en, subtopic_ru)
values
  (1, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '“Say” və “ədəd” anlayışları', 'Concepts of “count” and “number”', 'Понятия «счёт» и «число»'),
  (1, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '100 dairəsində sayma', 'Counting within 100', 'Счёт в пределах 100'),
  (1, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '100 dairəsində ədədlərin oxunması və yazılması', 'Reading and writing numbers within 100', 'Чтение и запись чисел в пределах 100'),
  (1, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədəd oxu', 'Number line', 'Числовая прямая'),
  (1, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədədlərin müqayisəsi və sıralanması', 'Comparing and ordering numbers', 'Сравнение и упорядочивание чисел'),
  (1, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Toplama və çıxma əməlləri', 'Addition and subtraction operations', 'Действия сложения и вычитания'),
  (1, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', '20 dairəsində toplama və çıxma', 'Addition and subtraction within 20', 'Сложение и вычитание в пределах 20'),
  (1, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə məsələlərin həlli', 'Solving simple problems', 'Решение простых задач'),
  (1, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə ədədi ifadələr', 'Simple numerical expressions', 'Простые числовые выражения'),
  (1, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Bərabərsizlik və tənlik haqqında ilkin təsəvvür', 'Initial understanding of inequalities and equations', 'Первоначальное представление о неравенствах и уравнениях'),
  (1, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Müəyyən əlamətlərə görə dəyişikliklər', 'Changes according to specified characteristics', 'Изменения по заданным признакам'),
  (1, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Əşyanın yeri və hərəkət istiqaməti', 'Position of an object and direction of movement', 'Положение предмета и направление движения'),
  (1, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Əşyaların qruplaşdırılması', 'Grouping objects', 'Группировка предметов'),
  (1, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Müstəvi fiqurlar', 'Plane figures', 'Плоские фигуры'),
  (1, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Fəza fiqurları', 'Solid figures', 'Пространственные фигуры'),
  (1, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Uzunluq', 'Length', 'Длина'),
  (1, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Kütlə', 'Mass', 'Масса'),
  (1, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Tutum', 'Capacity', 'Вместимость'),
  (1, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Zaman', 'Time', 'Время'),
  (1, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Pul və alış-veriş', 'Money and shopping', 'Деньги и покупки'),
  (1, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Məlumatların toplanması, təsviri və təhlili', 'Collecting, representing and analyzing data', 'Сбор, представление и анализ данных'),
  (1, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'İnsan orqanizmində əsas orqanların yeri, quruluşu və funksiyaları', 'Location, structure and functions of the main organs in the human body', 'Расположение, строение и функции основных органов в организме человека'),
  (1, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Cansız və canlı varlıqlar', 'Non-living and living things', 'Неживые и живые объекты'),
  (1, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Hərəkət', 'Movement', 'Движение'),
  (1, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Böyümə', 'Growth', 'Рост'),
  (1, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Çoxalma', 'Reproduction', 'Размножение'),
  (1, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Tənəffüs', 'Respiration', 'Дыхание'),
  (1, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Qidalanma', 'Nutrition', 'Питание'),
  (1, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'İnsan və heyvanların yaşaması üçün zəruri ehtiyaclar', 'Essential needs for humans and animals to live', 'Необходимые условия для жизни людей и животных'),
  (1, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Bitkilərin yaşaması üçün zəruri ehtiyaclar', 'Essential needs for plants to live', 'Необходимые условия для жизни растений'),
  (1, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Materiallar', 'Materials', 'Материалы'),
  (1, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Kağız, parça, taxta, plastik, metal və şüşə', 'Paper, fabric, wood, plastic, metal and glass', 'Бумага, ткань, дерево, пластик, металл и стекло'),
  (1, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Materialların xassələri', 'Properties of materials', 'Свойства материалов'),
  (1, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Bərk, yumşaq, su keçirən, su keçirməyən, parlaq, ağır və yüngül materiallar', 'Hard, soft, water-permeable, waterproof, shiny, heavy and light materials', 'Твёрдые, мягкие, водопроницаемые, водонепроницаемые, блестящие, тяжёлые и лёгкие материалы'),
  (1, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Dartma və itələmə', 'Pulling and pushing', 'Тяга и толкание'),
  (1, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Cisimlərin hərəkəti', 'Movement of objects', 'Движение тел'),
  (1, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Səsin yaranması və yayılması', 'Production and propagation of sound', 'Возникновение и распространение звука'),
  (1, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Hava şəraiti və fəsillər', 'Weather and seasons', 'Погода и времена года'),
  (1, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Gigiyena qaydaları', 'Hygiene rules', 'Правила гигиены'),
  (1, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Sağlam qidalanma', 'Healthy eating', 'Здоровое питание'),
  (1, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Fiziki aktivlik', 'Physical activity', 'Физическая активность'),
  (1, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Məişət və gündəlik fəaliyyət zamanı təhlükəsizlik', 'Safety during household and everyday activities', 'Безопасность в быту и повседневной деятельности'),
  (1, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Fövqəladə hadisələr zamanı təhlükəsizlik', 'Safety during emergencies', 'Безопасность при чрезвычайных ситуациях'),
  (1, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Məlumat, xəbər və informasiya', 'Data, news and information', 'Данные, сообщение и информация'),
  (1, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın vizual, səs, qoxu, dad və taktil növləri', 'Visual, auditory, olfactory, gustatory and tactile types of information', 'Зрительные, слуховые, обонятельные, вкусовые и тактильные виды информации'),
  (1, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın saxlanması və ötürülməsi', 'Storing and transmitting information', 'Хранение и передача информации'),
  (1, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüter və digər elektron cihazlar', 'Computer and other electronic devices', 'Компьютер и другие электронные устройства'),
  (1, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Sistem bloku', 'System unit', 'Системный блок'),
  (1, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Monitor', 'Monitor', 'Монитор'),
  (1, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Klaviatura', 'Keyboard', 'Клавиатура'),
  (1, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Siçan', 'Mouse', 'Мышь'),
  (1, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüter otağında davranış və texniki təhlükəsizlik', 'Conduct and technical safety in the computer lab', 'Правила поведения и техника безопасности в компьютерном кабинете'),
  (1, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Düzgün oturuş və müntəzəm fasilə', 'Proper sitting posture and regular breaks', 'Правильная посадка и регулярные перерывы'),
  (1, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'İş masası və onun elementləri', 'Desktop and its elements', 'Рабочий стол и его элементы'),
  (1, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Proqram və proqram simgəsi', 'Program and program icon', 'Программа и значок программы'),
  (1, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Qrafik redaktor', 'Graphics editor', 'Графический редактор'),
  (1, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Sadə şəkillər və həndəsi fiqurlar', 'Simple drawings and geometric figures', 'Простые рисунки и геометрические фигуры'),
  (1, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Mətn redaktoru', 'Text editor', 'Текстовый редактор'),
  (1, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Hərflərin və sözlərin yazılması', 'Writing letters and words', 'Написание букв и слов'),
  (1, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Hadisələr və hərəkətlər ardıcıllığı', 'Sequence of events and actions', 'Последовательность событий и действий'),
  (1, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Addım-addım göstərişlər', 'Step-by-step instructions', 'Пошаговые инструкции'),
  (1, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İcraçı və icraçının komandaları', 'Executor and executor commands', 'Исполнитель и команды исполнителя'),
  (1, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', '“İrəli”, “geri”, “sağa” və “sola” komandaları', '“Forward”, “backward”, “right” and “left” commands', 'Команды «вперёд», «назад», «вправо» и «влево»'),
  (1, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Şəbəkə və internet', 'Network and internet', 'Сеть и интернет'),
  (1, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Sadə müraciətlərin başa düşülməsi', 'Understanding simple requests', 'Понимание простых обращений'),
  (1, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Adı eşidilən əşyaların şəkillərdə seçilməsi', 'Selecting named objects in pictures', 'Выбор на картинках предметов, названия которых были услышаны'),
  (1, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Əşyaların əlamətlərinə görə fərqləndirilməsi', 'Distinguishing objects by their features', 'Различение предметов по их признакам'),
  (1, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Səs və səs birləşmələrinin təkrarı', 'Repeating sounds and sound combinations', 'Повторение звуков и звукосочетаний'),
  (1, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Sadə sözlərin tələffüzü', 'Pronunciation of simple words', 'Произношение простых слов'),
  (1, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Söz birləşmələri və sadə cümlələrin tələffüzü', 'Pronunciation of word combinations and simple sentences', 'Произношение словосочетаний и простых предложений'),
  (1, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Şəkildəki əşyaların və ətrafdakıların adlandırılması', 'Naming objects in pictures and in the surroundings', 'Называние предметов на картинке и в окружающей среде'),
  (1, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əşyaların həcminin və rənginin ifadə edilməsi', 'Expressing the size and color of objects', 'Выражение размера и цвета предметов'),
  (1, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Əşyaların sadə sözlərlə təsviri', 'Describing objects with simple words', 'Описание предметов простыми словами'),
  (1, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Sadə nitq etiketlərindən istifadə', 'Using simple speech etiquette', 'Использование простых форм речевого этикета'),
  (1, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Əşyaların əlamətlərinə görə qruplaşdırılması', 'Grouping objects by their features', 'Группировка предметов по их признакам'),
  (1, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Oxşar və fərqli əlamətlər', 'Similar and different features', 'Сходные и отличительные признаки'),
  (1, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Əşyanın yerinin müəyyən edilməsi', 'Determining the position of an object', 'Определение положения предмета'),
  (1, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Hərəkət istiqamətləri', 'Directions of movement', 'Направления движения'),
  (1, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Ədədi və şəkilli ardıcıllıqlar', 'Numerical and pictorial sequences', 'Числовые и графические последовательности'),
  (1, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Hadisələrin ardıcıllığı', 'Sequence of events', 'Последовательность событий'),
  (1, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Addım-addım göstərişlər', 'Step-by-step instructions', 'Пошаговые инструкции'),
  (1, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Sadə icraçı komandaları', 'Simple executor commands', 'Простые команды исполнителя'),
  (1, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Müəyyən əlamətlərə görə dəyişikliklərin müəyyən edilməsi', 'Identifying changes according to specified characteristics', 'Определение изменений по заданным признакам'),
  (2, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '100 dairəsində ədədlər', 'Numbers within 100', 'Числа в пределах 100'),
  (2, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədədlərin oxunması, yazılması və sıralanması', 'Reading, writing and ordering numbers', 'Чтение, запись и упорядочивание чисел'),
  (2, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '100 dairəsində toplama və çıxma', 'Addition and subtraction within 100', 'Сложение и вычитание в пределах 100'),
  (2, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Vurma əməlinin mənası', 'Meaning of multiplication', 'Смысл действия умножения'),
  (2, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Bölmə əməlinin mənası', 'Meaning of division', 'Смысл действия деления'),
  (2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Vurma və bölmənin modelləşdirilməsi', 'Modeling multiplication and division', 'Моделирование умножения и деления'),
  (2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Hesab əməllərinin məsələlərdə tətbiqi', 'Applying arithmetic operations in problems', 'Применение арифметических действий в задачах'),
  (2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Ədədi ifadələr', 'Numerical expressions', 'Числовые выражения'),
  (2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Ədədi ifadələrin müqayisəsi', 'Comparing numerical expressions', 'Сравнение числовых выражений'),
  (2, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Tənlik haqqında ilkin təsəvvür', 'Initial understanding of equations', 'Первоначальное представление об уравнении'),
  (2, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Kəmiyyətlər arasındakı əlaqə', 'Relationship between quantities', 'Связь между величинами'),
  (2, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Müstəvi fiqurlar', 'Plane figures', 'Плоские фигуры'),
  (2, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Fəza fiqurları', 'Solid figures', 'Пространственные фигуры'),
  (2, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Uzunluq', 'Length', 'Длина'),
  (2, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Kütlə', 'Mass', 'Масса'),
  (2, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Tutum', 'Capacity', 'Вместимость'),
  (2, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Vaxt və keçən zaman', 'Time and elapsed time', 'Время и прошедшее время'),
  (2, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Pul və alış-veriş', 'Money and shopping', 'Деньги и покупки'),
  (2, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Məlumatların toplanması, təsviri və təhlili', 'Collecting, representing and analyzing data', 'Сбор, представление и анализ данных'),
  (2, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Canlılarda əsas orqanların yeri və quruluşu', 'Location and structure of the main organs in living organisms', 'Расположение и строение основных органов у живых организмов'),
  (2, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Hüceyrə, toxuma, orqan və orqanlar sistemi haqqında ilkin təsəvvür', 'Initial understanding of cell, tissue, organ and organ system', 'Первоначальное представление о клетке, ткани, органе и системе органов'),
  (2, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Heyvanların bədən hissələri', 'Animal body parts', 'Части тела животных'),
  (2, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Heyvanların xarici bədən örtükləri', 'External body coverings of animals', 'Наружные покровы тела животных'),
  (2, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Heyvanların çoxalması və böyüməsi', 'Reproduction and growth of animals', 'Размножение и рост животных'),
  (2, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Bitkilərin əsas hissələri', 'Main parts of plants', 'Основные части растений'),
  (2, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Materialların xassələri və istifadə sahələri', 'Properties and uses of materials', 'Свойства материалов и области их применения'),
  (2, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Enerjinin müxtəlif növləri', 'Different forms of energy', 'Различные виды энергии'),
  (2, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Enerji çevrilmələri', 'Energy transformations', 'Превращения энергии'),
  (2, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'İşığın yaranması və yayılması', 'Production and propagation of light', 'Возникновение и распространение света'),
  (2, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Canlıların ətraf mühitlə qarşılıqlı əlaqəsi', 'Interaction of living organisms with the environment', 'Взаимодействие живых организмов с окружающей средой'),
  (2, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Ekosistem haqqında ilkin təsəvvür', 'Initial understanding of an ecosystem', 'Первоначальное представление об экосистеме'),
  (2, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Günəş sistemi', 'Solar System', 'Солнечная система'),
  (2, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Planetlərin Günəşə nəzərən mövqeyi', 'Positions of planets relative to the Sun', 'Положение планет относительно Солнца'),
  (2, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Gigiyena', 'Hygiene', 'Гигиена'),
  (2, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Sağlam qidalanma', 'Healthy eating', 'Здоровое питание'),
  (2, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Fiziki aktivlik', 'Physical activity', 'Физическая активность'),
  (2, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Elektrik cihazlarından təhlükəsiz istifadə', 'Safe use of electrical devices', 'Безопасное использование электрических приборов'),
  (2, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Fövqəladə hadisələr zamanı təhlükəsizlik', 'Safety during emergencies', 'Безопасность при чрезвычайных ситуациях'),
  (2, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Mətn, cədvəl, şəkil və diaqram', 'Text, table, image and diagram', 'Текст, таблица, изображение и диаграмма'),
  (2, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın saxlanması, ötürülməsi və emalı', 'Storing, transmitting and processing information', 'Хранение, передача и обработка информации'),
  (2, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Rebus, şəkil və şərti işarələr', 'Rebus, picture and conventional symbols', 'Ребус, рисунок и условные знаки'),
  (2, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kodlaşdırılmış informasiyanın oxunması', 'Reading encoded information', 'Чтение закодированной информации'),
  (2, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Masaüstü kompüter', 'Desktop computer', 'Настольный компьютер'),
  (2, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Dizüstü kompüter', 'Laptop computer', 'Ноутбук'),
  (2, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Planşet və smartfon', 'Tablet and smartphone', 'Планшет и смартфон'),
  (2, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüterin işə salınması və söndürülməsi', 'Turning the computer on and off', 'Включение и выключение компьютера'),
  (2, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Fayl və qovluq', 'File and folder', 'Файл и папка'),
  (2, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Proqram pəncərəsi və onun elementləri', 'Program window and its elements', 'Окно программы и его элементы'),
  (2, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Qrafik redaktorda şəkillərin hazırlanması', 'Creating images in a graphics editor', 'Создание изображений в графическом редакторе'),
  (2, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Mətnin sadə formatlaşdırılması', 'Basic text formatting', 'Простое форматирование текста'),
  (2, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Şrift, şriftin ölçüsü və rəngi', 'Font, font size and color', 'Шрифт, размер и цвет шрифта'),
  (2, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Obyektin sözlə təqdim edilməsi', 'Representing an object in words', 'Представление объекта словами'),
  (2, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Oxşar və fərqli əlamətlər', 'Similar and different features', 'Сходные и отличительные признаки'),
  (2, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Hərəkətlər və göstərişlər ardıcıllığı', 'Sequence of actions and instructions', 'Последовательность действий и указаний'),
  (2, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Alqoritm', 'Algorithm', 'Алгоритм'),
  (2, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Xətti alqoritm', 'Linear algorithm', 'Линейный алгоритм'),
  (2, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Budaqlanan alqoritm', 'Branching algorithm', 'Разветвляющийся алгоритм'),
  (2, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Proqramdakı yanlışlıqların müəyyən edilməsi', 'Identifying errors in a program', 'Выявление ошибок в программе'),
  (2, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İnformasiya texnologiyalarının tətbiq sahələri', 'Areas of application of information technologies', 'Области применения информационных технологий'),
  (2, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Verilənlərin ehtiyat üzünün yaradılması', 'Creating a backup copy of data', 'Создание резервной копии данных'),
  (2, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Müraciətlərin başa düşülməsi', 'Understanding requests', 'Понимание обращений'),
  (2, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Əşya və hadisələrin şəkillərdə seçilməsi', 'Selecting objects and events in pictures', 'Выбор предметов и событий на картинках'),
  (2, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Əşya və hadisələrin əlamətlərinə görə fərqləndirilməsi', 'Distinguishing objects and events by their features', 'Различение предметов и явлений по их признакам'),
  (2, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Söz və söz birləşmələrinin tələffüzü', 'Pronunciation of words and word combinations', 'Произношение слов и словосочетаний'),
  (2, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Sadə cümlələrin tələffüzü', 'Pronunciation of simple sentences', 'Произношение простых предложений'),
  (2, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Ailə və məktəblə bağlı sözlər', 'Words related to family and school', 'Слова, связанные с семьёй и школой'),
  (2, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əşyaların forma və kəmiyyətinin ifadə edilməsi', 'Expressing the shape and quantity of objects', 'Выражение формы и количества предметов'),
  (2, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əşya və hadisələrin təsviri', 'Describing objects and events', 'Описание предметов и событий'),
  (2, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Sadə nitq etiketləri', 'Simple speech etiquette', 'Простые формы речевого этикета'),
  (2, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Hərf elementlərinin düzgün yazılması', 'Correct writing of letter elements', 'Правильное написание элементов букв'),
  (2, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Əşyaların oxşar və fərqli əlamətlərə görə müqayisəsi', 'Comparing objects by similar and different features', 'Сравнение объектов по сходным и отличительным признакам'),
  (2, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Obyektlərin təsnif edilməsi', 'Classifying objects', 'Классификация объектов'),
  (2, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Şəkil və işarələrin mənasının müəyyən edilməsi', 'Determining the meaning of pictures and symbols', 'Определение значения изображений и знаков'),
  (2, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Ardıcıllıqların qurulması', 'Constructing sequences', 'Построение последовательностей'),
  (2, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Məqsədə çatmaq üçün göstərişlər ardıcıllığı', 'Sequence of instructions for reaching a goal', 'Последовательность указаний для достижения цели'),
  (2, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Xətti alqoritm', 'Linear algorithm', 'Линейный алгоритм'),
  (2, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Budaqlanan alqoritm', 'Branching algorithm', 'Разветвляющийся алгоритм'),
  (2, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Müxtəlif həll yollarının müqayisəsi', 'Comparing different solution methods', 'Сравнение различных способов решения'),
  (2, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Alqoritmdə yanlışlığın müəyyən edilməsi və düzəldilməsi', 'Identifying and correcting an error in an algorithm', 'Выявление и исправление ошибки в алгоритме'),
  (3, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '10 000 dairəsində ədədlər', 'Numbers within 10,000', 'Числа в пределах 10 000'),
  (3, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədədlərin oxunması, yazılması və sıralanması', 'Reading, writing and ordering numbers', 'Чтение, запись и упорядочивание чисел'),
  (3, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '1 000 dairəsində hesab əməlləri', 'Arithmetic operations within 1,000', 'Арифметические действия в пределах 1 000'),
  (3, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Hesab əməllərinin xassələri', 'Properties of arithmetic operations', 'Свойства арифметических действий'),
  (3, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Hesab əməlləri arasındakı əlaqə', 'Relationship between arithmetic operations', 'Связь между арифметическими действиями'),
  (3, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kəsr anlayışı', 'Concept of a fraction', 'Понятие дроби'),
  (3, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Kəsrlərin modelləşdirilməsi və müqayisəsi', 'Modeling and comparing fractions', 'Моделирование и сравнение дробей'),
  (3, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Riyazi ifadə', 'Mathematical expression', 'Математическое выражение'),
  (3, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Tənlik', 'Equation', 'Уравнение'),
  (3, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə tənliklərin həlli', 'Solving simple equations', 'Решение простых уравнений'),
  (3, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə funksional asılılıqlar', 'Simple functional relationships', 'Простые функциональные зависимости'),
  (3, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Düz xətlərin qarşılıqlı vəziyyəti', 'Relative positions of straight lines', 'Взаимное расположение прямых'),
  (3, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Müstəvi fiqurların təsnifatı', 'Classification of plane figures', 'Классификация плоских фигур'),
  (3, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Simmetriya', 'Symmetry', 'Симметрия'),
  (3, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Sürüşmə', 'Translation', 'Параллельный перенос'),
  (3, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Fəza fiqurları', 'Solid figures', 'Пространственные фигуры'),
  (3, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Perimetr', 'Perimeter', 'Периметр'),
  (3, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Sahə', 'Area', 'Площадь'),
  (3, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Uzunluq, kütlə və tutum', 'Length, mass and capacity', 'Длина, масса и вместимость'),
  (3, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Zaman', 'Time', 'Время'),
  (3, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Qiymət, miqdar və məbləğ', 'Price, quantity and total cost', 'Цена, количество и стоимость'),
  (3, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Büdcə, gəlir, xərc və qazanc', 'Budget, income, expense and profit', 'Бюджет, доход, расход и прибыль'),
  (3, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Məlumatların toplanması, təsviri və təhlili', 'Collecting, representing and analyzing data', 'Сбор, представление и анализ данных'),
  (3, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', '“Ola bilməz”, “ola bilər”, “mütləq” və “yəqin ki” hadisələri', '“Impossible”, “possible”, “certain” and “likely” events', 'События «невозможно», «возможно», «обязательно» и «вероятно»'),
  (3, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Canlılara xas həyati proseslər', 'Life processes characteristic of living organisms', 'Жизненные процессы, характерные для живых организмов'),
  (3, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Tənəffüs', 'Respiration', 'Дыхание'),
  (3, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Qidalanma', 'Nutrition', 'Питание'),
  (3, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Hərəkət', 'Movement', 'Движение'),
  (3, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Böyümə və çoxalma', 'Growth and reproduction', 'Рост и размножение'),
  (3, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Ürəyin əsas funksiyası', 'Main function of the heart', 'Основная функция сердца'),
  (3, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Ağciyərin əsas funksiyası', 'Main function of the lungs', 'Основная функция лёгких'),
  (3, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Mədənin əsas funksiyası', 'Main function of the stomach', 'Основная функция желудка'),
  (3, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Beynin əsas funksiyası', 'Main function of the brain', 'Основная функция мозга'),
  (3, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Sümük və əzələlərin əsas funksiyaları', 'Main functions of bones and muscles', 'Основные функции костей и мышц'),
  (3, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Fosillər', 'Fossils', 'Ископаемые остатки'),
  (3, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Materialların xassələri', 'Properties of materials', 'Свойства материалов'),
  (3, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Materialların istifadə sahələri', 'Uses of materials', 'Области применения материалов'),
  (3, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Enerjinin müxtəlif növləri', 'Different forms of energy', 'Различные виды энергии'),
  (3, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Enerji çevrilmələri', 'Energy transformations', 'Превращения энергии'),
  (3, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'İşığın yayılması', 'Propagation of light', 'Распространение света'),
  (3, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Günəş, Yer və Ay', 'Sun, Earth and Moon', 'Солнце, Земля и Луна'),
  (3, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Günəş sistemindəki cisimlərin hərəkəti', 'Movement of bodies in the Solar System', 'Движение тел в Солнечной системе'),
  (3, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Gecə və gündüz', 'Day and night', 'День и ночь'),
  (3, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Sağlam qidalanma', 'Healthy eating', 'Здоровое питание'),
  (3, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Şəxsi gigiyena', 'Personal hygiene', 'Личная гигиена'),
  (3, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Dişlərin qorunması', 'Dental care', 'Уход за зубами'),
  (3, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Məişət və fövqəladə hadisələr zamanı təhlükəsizlik', 'Safety during household activities and emergencies', 'Безопасность в быту и при чрезвычайных ситуациях'),
  (3, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiya mənbəyi və informasiya qəbuledicisi', 'Information source and information receiver', 'Источник и получатель информации'),
  (3, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın ötürülmə üsulları', 'Methods of transmitting information', 'Способы передачи информации'),
  (3, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kütləvi informasiya vasitələri', 'Mass media', 'Средства массовой информации'),
  (3, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kod, kodlaşdırma və dekodlaşdırma', 'Code, encoding and decoding', 'Код, кодирование и декодирование'),
  (3, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüterin giriş qurğuları', 'Computer input devices', 'Устройства ввода компьютера'),
  (3, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüterin çıxış qurğuları', 'Computer output devices', 'Устройства вывода компьютера'),
  (3, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Fayl və qovluqlar üzərində əməliyyatlar', 'Operations on files and folders', 'Операции с файлами и папками'),
  (3, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Baş menyu, proqram menyusu və kontekst menyusu', 'Main menu, program menu and context menu', 'Главное меню, меню программы и контекстное меню'),
  (3, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Qrafik redaktorda mürəkkəb şəkillər', 'Complex drawings in a graphics editor', 'Сложные изображения в графическом редакторе'),
  (3, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Mətn sənədinin yaradılması və redaktəsi', 'Creating and editing a text document', 'Создание и редактирование текстового документа'),
  (3, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Səs redaktoru və səs faylı', 'Audio editor and audio file', 'Аудиоредактор и аудиофайл'),
  (3, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Obyektin qrafik formada təqdim edilməsi', 'Representing an object graphically', 'Графическое представление объекта'),
  (3, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Təkrarlardan istifadə edilən alqoritmlər', 'Algorithms using repetition', 'Алгоритмы с повторениями'),
  (3, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Parçalanma — dekompozisiya', 'Decomposition', 'Декомпозиция'),
  (3, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Məntiqi məsələlərin həll alqoritmi', 'Algorithm for solving logic problems', 'Алгоритм решения логических задач'),
  (3, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İnternet və brauzer', 'Internet and browser', 'Интернет и браузер'),
  (3, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Sayt və elektron poçt', 'Website and email', 'Веб-сайт и электронная почта'),
  (3, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İstifadəçi adı və parol', 'Username and password', 'Имя пользователя и пароль'),
  (3, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Tapşırıq xarakterli müraciətlərin başa düşülməsi', 'Understanding task-oriented requests', 'Понимание обращений, содержащих задание'),
  (3, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətn üzrə sadə tapşırıqlar', 'Simple tasks based on a listened text', 'Простые задания по прослушанному тексту'),
  (3, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Nitq etiketlərinin fərqləndirilməsi', 'Distinguishing speech etiquette formulas', 'Различение формул речевого этикета'),
  (3, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Kiçikhəcmli nitq nümunələrinin tələffüzü', 'Pronunciation of short speech samples', 'Произношение небольших речевых образцов'),
  (3, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Cümlələrin düzgün intonasiya ilə tələffüzü', 'Pronouncing sentences with correct intonation', 'Произношение предложений с правильной интонацией'),
  (3, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mənzil və yaşayış yeri ilə bağlı sözlər', 'Words related to home and place of residence', 'Слова, связанные с домом и местом проживания'),
  (3, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əşyaların keyfiyyəti, görünüşü və məkanı', 'Quality, appearance and location of objects', 'Качество, внешний вид и расположение предметов'),
  (3, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Şəkil və situasiyaların təsviri', 'Describing pictures and situations', 'Описание изображений и ситуаций'),
  (3, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Hərf, hərf birləşməsi və sözlərin oxunması', 'Reading letters, letter combinations and words', 'Чтение букв, буквосочетаний и слов'),
  (3, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Kiçikhəcmli mətnlərin oxunması', 'Reading short texts', 'Чтение небольших текстов'),
  (3, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Hərf, söz və sadə cümlələrin yazılması', 'Writing letters, words and simple sentences', 'Написание букв, слов и простых предложений'),
  (3, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Məlumatların sıralanması və qruplaşdırılması', 'Sorting and grouping data', 'Сортировка и группировка данных'),
  (3, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Kəsrlərin modelləşdirilməsi və müqayisəsi', 'Modeling and comparing fractions', 'Моделирование и сравнение дробей'),
  (3, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Sadə funksional asılılıqlar', 'Simple functional relationships', 'Простые функциональные зависимости'),
  (3, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Simmetriya və sürüşmə', 'Symmetry and translation', 'Симметрия и параллельный перенос'),
  (3, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Mümkün və mümkün olmayan hadisələr', 'Possible and impossible events', 'Возможные и невозможные события'),
  (3, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Təkrarlanan ardıcıllıqlar', 'Repeating sequences', 'Повторяющиеся последовательности'),
  (3, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Məsələnin daha sadə hissələrə bölünməsi', 'Breaking a problem into simpler parts', 'Разбиение задачи на более простые части'),
  (3, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Məntiqi məsələnin həll alqoritmi', 'Algorithm for solving a logic problem', 'Алгоритм решения логической задачи'),
  (3, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Verilən məlumatdan nəticə çıxarılması', 'Drawing conclusions from given information', 'Формулирование вывода на основе заданной информации'),
  (4, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', '1 000 000 dairəsində ədədlər', 'Numbers within 1,000,000', 'Числа в пределах 1 000 000'),
  (4, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Mərtəbə və sinif', 'Place value and class', 'Разряд и класс'),
  (4, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədədlərin sıralanması və yuvarlaqlaşdırılması', 'Ordering and rounding numbers', 'Упорядочивание и округление чисел'),
  (4, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Hesab əməllərinin xassələri', 'Properties of arithmetic operations', 'Свойства арифметических действий'),
  (4, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kəsrlərin müqayisəsi, toplanması və çıxılması', 'Comparing, adding and subtracting fractions', 'Сравнение, сложение и вычитание дробей'),
  (4, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Onluq kəsr', 'Decimal fraction', 'Десятичная дробь'),
  (4, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Onluq kəsrlərin müqayisəsi', 'Comparing decimal fractions', 'Сравнение десятичных дробей'),
  (4, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Onluq kəsrlərin toplanması və çıxılması', 'Adding and subtracting decimal fractions', 'Сложение и вычитание десятичных дробей'),
  (4, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Riyazi ifadələr', 'Mathematical expressions', 'Математические выражения'),
  (4, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Ədədi ifadələrin müqayisəsi', 'Comparing numerical expressions', 'Сравнение числовых выражений'),
  (4, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə tənliklər', 'Simple equations', 'Простые уравнения'),
  (4, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə funksional asılılıqlar', 'Simple functional relationships', 'Простые функциональные зависимости'),
  (4, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Nöqtə, düz xətt və şüa', 'Point, straight line and ray', 'Точка, прямая и луч'),
  (4, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Bucaq və çevrə', 'Angle and circle', 'Угол и окружность'),
  (4, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Koordinat şəbəkəsi', 'Coordinate grid', 'Координатная сетка'),
  (4, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Fiqurların çevrilməsi', 'Transformations of figures', 'Преобразования фигур'),
  (4, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Fəza fiqurları', 'Solid figures', 'Пространственные фигуры'),
  (4, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Ölçü vahidləri arasında çevirmələr', 'Conversions between units of measurement', 'Преобразование единиц измерения'),
  (4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Perimetr və sahə düsturları', 'Perimeter and area formulas', 'Формулы периметра и площади'),
  (4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Həcm', 'Volume', 'Объём'),
  (4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Kuboidin həcmi', 'Volume of a cuboid', 'Объём прямоугольного параллелепипеда'),
  (4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Vaxt və müddət', 'Time and duration', 'Время и продолжительность'),
  (4, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Məlumatların toplanması, təsviri və təhlili', 'Collecting, representing and analyzing data', 'Сбор, представление и анализ данных'),
  (4, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Heyvanların inkişaf dövrü', 'Animal life cycle', 'Жизненный цикл животных'),
  (4, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Toyuğun inkişaf dövrü', 'Chicken life cycle', 'Жизненный цикл курицы'),
  (4, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Kəpənəyin inkişaf dövrü', 'Butterfly life cycle', 'Жизненный цикл бабочки'),
  (4, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Canlıların böyüməsi və çoxalması', 'Growth and reproduction of living organisms', 'Рост и размножение живых организмов'),
  (4, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Valideynlərdən yeni nəslə keçən əlamətlər', 'Traits passed from parents to offspring', 'Признаки, передаваемые от родителей потомству'),
  (4, 'Canlılar və insan', 'Living things and humans', 'Живые организмы и человек', 'Çiçəkli və çiçəksiz bitkilər', 'Flowering and non-flowering plants', 'Цветковые и нецветковые растения'),
  (4, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Çiçəyin əsas hissələri', 'Main parts of a flower', 'Основные части цветка'),
  (4, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Erkəkcik, dişicik, ləçək və kasa yarpağı', 'Stamen, pistil, petal and sepal', 'Тычинка, пестик, лепесток и чашелистик'),
  (4, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Çiçəyin hissələrinin funksiyaları', 'Functions of flower parts', 'Функции частей цветка'),
  (4, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Çiçəkli bitkinin həyat dövrü', 'Life cycle of a flowering plant', 'Жизненный цикл цветкового растения'),
  (4, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Toxum, cücərti və cavan bitki', 'Seed, seedling and young plant', 'Семя, проросток и молодое растение'),
  (4, 'Maddələr və materiallar', 'Substances and materials', 'Вещества и материалы', 'Toxumların cücərməsi', 'Seed germination', 'Прорастание семян'),
  (4, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Tozlanma', 'Pollination', 'Опыление'),
  (4, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Meyvə və toxumun yaranması', 'Formation of fruit and seed', 'Образование плода и семени'),
  (4, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Maddənin halları', 'States of matter', 'Агрегатные состояния вещества'),
  (4, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Bərk, maye və qaz', 'Solid, liquid and gas', 'Твёрдое, жидкое и газообразное состояния'),
  (4, 'Qüvvə, enerji, Yer və kosmos', 'Force, energy, Earth and space', 'Сила, энергия, Земля и космос', 'Ərimə, donma, buxarlanma və kondensasiya', 'Melting, freezing, evaporation and condensation', 'Плавление, замерзание, испарение и конденсация'),
  (4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Maddələrin kütləsi və həcmi', 'Mass and volume of substances', 'Масса и объём веществ'),
  (4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Dartma və itələmə', 'Pulling and pushing', 'Тяга и толкание'),
  (4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Toxunma ilə və toxunma olmadan təsir', 'Contact and non-contact effects', 'Контактное и бесконтактное воздействие'),
  (4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Gigiyena və sağlamlığın qorunması', 'Hygiene and health protection', 'Гигиена и сохранение здоровья'),
  (4, 'Sağlamlıq, ətraf mühit və təhlükəsizlik', 'Health, environment and safety', 'Здоровье, окружающая среда и безопасность', 'Təhlükəsizlik qaydaları', 'Safety rules', 'Правила безопасности'),
  (4, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın müxtəlif formalarda təqdim edilməsi', 'Representing information in different forms', 'Представление информации в различных формах'),
  (4, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kağız, maqnit və optik informasiya daşıyıcıları', 'Paper, magnetic and optical information carriers', 'Бумажные, магнитные и оптические носители информации'),
  (4, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Bulud saxlama vasitələri', 'Cloud storage tools', 'Облачные средства хранения'),
  (4, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Verilənlərin cədvəl və diaqramla təqdim edilməsi', 'Representing data with tables and charts', 'Представление данных в таблицах и диаграммах'),
  (4, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüter qurğuları', 'Computer devices', 'Компьютерные устройства'),
  (4, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Fayl və qovluqların idarə edilməsi', 'Managing files and folders', 'Управление файлами и папками'),
  (4, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Təqdimat proqramı', 'Presentation software', 'Программа для презентаций'),
  (4, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Elektron cədvəl proqramı', 'Spreadsheet software', 'Программа электронных таблиц'),
  (4, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Mətn, qrafika və təqdimat materialları', 'Text, graphics and presentation materials', 'Текстовые, графические и презентационные материалы'),
  (4, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Formallaşdırma və modelləşdirmə', 'Formalization and modeling', 'Формализация и моделирование'),
  (4, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Alqoritmlərin söz, işarə və blok-sxemlə təqdim edilməsi', 'Representing algorithms with words, symbols and flowcharts', 'Представление алгоритмов словами, знаками и блок-схемами'),
  (4, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Xətti və budaqlanan alqoritmlər', 'Linear and branching algorithms', 'Линейные и разветвляющиеся алгоритмы'),
  (4, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Proqramlaşdırma mühitində icraçı', 'Executor in a programming environment', 'Исполнитель в среде программирования'),
  (4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Elektron poçt', 'Email', 'Электронная почта'),
  (4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Şəxsi məlumatlar', 'Personal data', 'Персональные данные'),
  (4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Ziyanverici proqramlar', 'Malware', 'Вредоносные программы'),
  (4, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Spam və internet fırıldaqçılığı', 'Spam and internet fraud', 'Спам и интернет-мошенничество'),
  (4, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Kiçikhəcmli sadə mətnlərin dinlənilməsi', 'Listening to short simple texts', 'Прослушивание небольших простых текстов'),
  (4, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Sinifdaxili müraciətlərin başa düşülməsi', 'Understanding classroom requests', 'Понимание обращений в классе'),
  (4, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Mətn üzrə sualların tərtib edilməsi', 'Formulating questions based on a text', 'Составление вопросов по тексту'),
  (4, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mətndə yeni sözlərin müəyyən edilməsi', 'Identifying new words in a text', 'Определение новых слов в тексте'),
  (4, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Cümlələrin və nitq etiketlərinin düzgün tələffüzü', 'Correct pronunciation of sentences and speech etiquette formulas', 'Правильное произношение предложений и формул речевого этикета'),
  (4, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Zaman və məkan anlayışları', 'Concepts of time and space', 'Понятия времени и пространства'),
  (4, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əşya, hadisə və situasiyaların təsviri', 'Describing objects, events and situations', 'Описание предметов, событий и ситуаций'),
  (4, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əşya və hadisələrə münasibət bildirilməsi', 'Expressing an opinion about objects and events', 'Выражение отношения к предметам и событиям'),
  (4, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Sualvermə bacarığı', 'Question-asking skill', 'Навык постановки вопросов'),
  (4, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Kiçikhəcmli mətnlərin düzgün və sürətli oxunması', 'Accurate and fluent reading of short texts', 'Правильное и беглое чтение небольших текстов'),
  (4, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Sadə cümlələrin yazılması', 'Writing simple sentences', 'Написание простых предложений'),
  (4, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Kiçikhəcmli mətnlərin yazılması', 'Writing short texts', 'Написание небольших текстов'),
  (4, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Ədədi və həndəsi qanunauyğunluqlar', 'Numerical and geometric patterns', 'Числовые и геометрические закономерности'),
  (4, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Sadə funksional asılılıqlar', 'Simple functional relationships', 'Простые функциональные зависимости'),
  (4, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Koordinat şəbəkəsi', 'Coordinate grid', 'Координатная сетка'),
  (4, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Simmetriya, sürüşmə və digər çevrilmələr', 'Symmetry, translation and other transformations', 'Симметрия, параллельный перенос и другие преобразования'),
  (4, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Cədvəl və diaqramların təhlili', 'Analyzing tables and charts', 'Анализ таблиц и диаграмм'),
  (4, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Alqoritmin söz və işarələrlə təqdim edilməsi', 'Representing an algorithm with words and symbols', 'Представление алгоритма словами и знаками'),
  (4, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Xətti və budaqlanan alqoritmlər', 'Linear and branching algorithms', 'Линейные и разветвляющиеся алгоритмы'),
  (4, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Şəxsi məlumatla açıq məlumatın fərqləndirilməsi', 'Distinguishing personal information from public information', 'Различение персональной и открытой информации'),
  (4, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'İnternet məlumatlarına tənqidi yanaşma', 'Critical evaluation of internet information', 'Критическое отношение к информации в интернете'),
  (5, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Trilyon dairəsində natural ədədlər', 'Natural numbers up to one trillion', 'Натуральные числа в пределах триллиона'),
  (5, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədədlərin mərtəbə qiyməti', 'Place value of numbers', 'Разрядное значение чисел'),
  (5, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Natural ədədlərin sıralanması və yuvarlaqlaşdırılması', 'Ordering and rounding natural numbers', 'Упорядочивание и округление натуральных чисел'),
  (5, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Natural ədədlər üzərində hesab əməlləri', 'Arithmetic operations on natural numbers', 'Арифметические действия с натуральными числами'),
  (5, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Adi kəsrlər', 'Common fractions', 'Обыкновенные дроби'),
  (5, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kəsrlərin müqayisəsi', 'Comparing fractions', 'Сравнение дробей'),
  (5, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Kəsrlər üzərində əməllər', 'Operations with fractions', 'Действия с дробями'),
  (5, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Onluq kəsrlər', 'Decimal fractions', 'Десятичные дроби'),
  (5, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Onluq kəsrlər üzərində əməllər', 'Operations with decimal fractions', 'Действия с десятичными дробями'),
  (5, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Faiz', 'Percent', 'Проценты'),
  (5, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Riyazi ifadələr', 'Mathematical expressions', 'Математические выражения'),
  (5, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Dəyişənin verilmiş qiymətində ifadənin qiyməti', 'Value of an expression for a given value of the variable', 'Значение выражения при заданном значении переменной'),
  (5, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Sadə bərabərsizliklər', 'Simple inequalities', 'Простые неравенства'),
  (5, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Sadə tənliklər', 'Simple equations', 'Простые уравнения'),
  (5, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Funksional asılılıqlar', 'Functional relationships', 'Функциональные зависимости'),
  (5, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Bucaqların təsnifatı', 'Classification of angles', 'Классификация углов'),
  (5, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Bucağın tənböləni', 'Angle bisector', 'Биссектриса угла'),
  (5, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Həndəsi qurmalar', 'Geometric constructions', 'Геометрические построения'),
  (5, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Müstəvi fiqurların sahəsi', 'Area of plane figures', 'Площадь плоских фигур'),
  (5, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəza fiqurlarının səthinin sahəsi və həcmi', 'Surface area and volume of solid figures', 'Площадь поверхности и объём пространственных фигур'),
  (5, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Məlumatların toplanması, təsviri və təhlili', 'Collecting, representing and analyzing data', 'Сбор, представление и анализ данных'),
  (5, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'İnsan orqanizminin təşkilolunma səviyyələri', 'Levels of organization of the human body', 'Уровни организации организма человека'),
  (5, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Hüceyrə, toxuma, orqan, orqanlar sistemi və orqanizm', 'Cell, tissue, organ, organ system and organism', 'Клетка, ткань, орган, система органов и организм'),
  (5, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Orqanlar sistemlərinin quruluş və funksiyaları', 'Structure and functions of organ systems', 'Строение и функции систем органов'),
  (5, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Canlıların ümumi xüsusiyyətləri', 'General characteristics of living organisms', 'Общие признаки живых организмов'),
  (5, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Onurğalı və onurğasız heyvanlar', 'Vertebrate and invertebrate animals', 'Позвоночные и беспозвоночные животные'),
  (5, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Buğumayaqlılar, hörümçəkkimilər və molyusklar', 'Arthropods, arachnids and mollusks', 'Членистоногие, паукообразные и моллюски'),
  (5, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Çiçəkli və çiçəksiz bitkilər', 'Flowering and non-flowering plants', 'Цветковые и нецветковые растения'),
  (5, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Maddənin üç halı', 'Three states of matter', 'Три агрегатных состояния вещества'),
  (5, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Zərrəcik modeli', 'Particle model', 'Модель частиц'),
  (5, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Bərk, maye və qazların xarakterik xassələri', 'Characteristic properties of solids, liquids and gases', 'Характерные свойства твёрдых тел, жидкостей и газов'),
  (5, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Hal çevrilmələri', 'Changes of state', 'Фазовые переходы'),
  (5, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Fiziki və kimyəvi hadisələr', 'Physical and chemical phenomena', 'Физические и химические явления'),
  (5, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Saf maddələr və qarışıqlar', 'Pure substances and mixtures', 'Чистые вещества и смеси'),
  (5, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Qarışıqların ayrılması', 'Separation of mixtures', 'Разделение смесей'),
  (5, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Enerji növləri və enerji mənbələri', 'Forms and sources of energy', 'Виды и источники энергии'),
  (5, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Enerji çevrilmələri', 'Energy transformations', 'Превращения энергии'),
  (5, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Canlıların ətraf mühitlə qarşılıqlı əlaqəsi', 'Interaction of living organisms with the environment', 'Взаимодействие живых организмов с окружающей средой'),
  (5, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Təbii fəlakətlər', 'Natural disasters', 'Природные катастрофы'),
  (5, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'İnsan fəaliyyətinin ətraf mühitə təsiri', 'Impact of human activity on the environment', 'Влияние деятельности человека на окружающую среду'),
  (5, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Ətraf mühitin qorunması', 'Environmental protection', 'Охрана окружающей среды'),
  (5, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Təbii ehtiyatlardan səmərəli istifadə', 'Efficient use of natural resources', 'Рациональное использование природных ресурсов'),
  (5, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın xassələri', 'Properties of information', 'Свойства информации'),
  (5, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Tamlıq, aktuallıq, anlaşıqlılıq, obyektivlik və etibarlılıq', 'Completeness, relevance, clarity, objectivity and reliability', 'Полнота, актуальность, понятность, объективность и достоверность'),
  (5, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın toplanması və emalı', 'Collecting and processing information', 'Сбор и обработка информации'),
  (5, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Verilənlər yığını', 'Dataset', 'Набор данных'),
  (5, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüter qurğuları və onların təyinatı', 'Computer devices and their purposes', 'Компьютерные устройства и их назначение'),
  (5, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Sistem proqram təminatı', 'System software', 'Системное программное обеспечение'),
  (5, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Tətbiqi proqram təminatı', 'Application software', 'Прикладное программное обеспечение'),
  (5, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Mətn, qrafika və multimedia', 'Text, graphics and multimedia', 'Текст, графика и мультимедиа'),
  (5, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Elektron cədvəllər', 'Spreadsheets', 'Электронные таблицы'),
  (5, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Formallaşdırma və modelləşdirmə', 'Formalization and modeling', 'Формализация и моделирование'),
  (5, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Alqoritmlərin təqdimetmə üsulları', 'Methods of representing algorithms', 'Способы представления алгоритмов'),
  (5, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Sadə proqramlaşdırma', 'Basic programming', 'Основы программирования'),
  (5, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Veb-sayt və sayt konstruktoru', 'Website and website builder', 'Веб-сайт и конструктор сайтов'),
  (5, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İnternet bağlantısı', 'Internet connection', 'Подключение к интернету'),
  (5, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Elektron poçt və qoşma fayl', 'Email and attachment', 'Электронная почта и вложенный файл'),
  (5, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Biometrik təhlükəsizlik', 'Biometric security', 'Биометрическая безопасность'),
  (5, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Şəxsi məlumatların mühafizəsi', 'Protection of personal data', 'Защита персональных данных'),
  (5, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Sadə sualların cavablandırılması', 'Answering simple questions', 'Ответы на простые вопросы'),
  (5, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətndə yeni söz və ifadələrin seçilməsi', 'Selecting new words and expressions in a listened text', 'Выбор новых слов и выражений в прослушанном тексте'),
  (5, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Yeni söz və ifadələrdən istifadə', 'Using new words and expressions', 'Использование новых слов и выражений'),
  (5, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Kiçikhəcmli dialoqlar', 'Short dialogues', 'Короткие диалоги'),
  (5, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Kiçikhəcmli mətnlərin danışılması', 'Retelling short texts', 'Пересказ небольших текстов'),
  (5, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Söz və ifadələrin seçilməsi və qruplaşdırılması', 'Selecting and grouping words and expressions', 'Выбор и группировка слов и выражений'),
  (5, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mətnin bütöv hissələrinin fərqləndirilməsi', 'Distinguishing complete sections of a text', 'Выделение целостных частей текста'),
  (5, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mətn üzrə sualların cavablandırılması', 'Answering questions about a text', 'Ответы на вопросы по тексту'),
  (5, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Sözlərin məna və qrammatik cəhətdən əlaqələndirilməsi', 'Linking words semantically and grammatically', 'Связывание слов по смыслу и грамматически'),
  (5, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Sadə cümlələrin qurulması', 'Constructing simple sentences', 'Составление простых предложений'),
  (5, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Böyük və kiçik hərflərin yazılışı', 'Writing uppercase and lowercase letters', 'Написание прописных и строчных букв'),
  (5, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Natural ədədlər üzrə qanunauyğunluqlar', 'Patterns involving natural numbers', 'Закономерности с натуральными числами'),
  (5, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Kəsr və onluq kəsrlərin müqayisəsi', 'Comparing fractions and decimals', 'Сравнение обыкновенных и десятичных дробей'),
  (5, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Faiz məsələləri', 'Percentage problems', 'Задачи на проценты'),
  (5, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Dəyişənli ifadələr', 'Expressions with variables', 'Выражения с переменными'),
  (5, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Sadə tənlik və bərabərsizliklər', 'Simple equations and inequalities', 'Простые уравнения и неравенства'),
  (5, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Funksional asılılıqlar', 'Functional relationships', 'Функциональные зависимости'),
  (5, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Bucaqların təsnifatı', 'Classification of angles', 'Классификация углов'),
  (5, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Məlumatların qruplaşdırılması və təhlili', 'Grouping and analyzing data', 'Группировка и анализ данных'),
  (5, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Formallaşdırma və modelləşdirmə', 'Formalization and modeling', 'Формализация и моделирование'),
  (5, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Məsələnin alqoritm şəklində təqdim edilməsi', 'Representing a problem as an algorithm', 'Представление задачи в виде алгоритма'),
  (5, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'İnformasiya mənbəyinin etibarlılığının qiymətləndirilməsi', 'Evaluating the reliability of an information source', 'Оценка надёжности источника информации'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Sadə və mürəkkəb ədədlər', 'Prime and composite numbers', 'Простые и составные числа'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Natural ədədin sadə vuruqlara ayrılması', 'Prime factorization of a natural number', 'Разложение натурального числа на простые множители'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ən böyük ortaq bölən', 'Greatest common divisor', 'Наибольший общий делитель'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ən kiçik ortaq bölünən', 'Least common multiple', 'Наименьшее общее кратное'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Tam ədədlər', 'Integers', 'Целые числа'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Tam ədədlər üzərində əməllər', 'Operations with integers', 'Действия с целыми числами'),
  (6, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Nisbət', 'Ratio', 'Отношение'),
  (6, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Tənasüb', 'Proportion', 'Пропорция'),
  (6, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Düz mütənasiblik', 'Direct proportion', 'Прямая пропорциональность'),
  (6, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Tərs mütənasiblik', 'Inverse proportion', 'Обратная пропорциональность'),
  (6, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Faiz', 'Percent', 'Проценты'),
  (6, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Riyazi ifadələr', 'Mathematical expressions', 'Математические выражения'),
  (6, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə tənliklər və bərabərsizliklər', 'Simple equations and inequalities', 'Простые уравнения и неравенства'),
  (6, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Çoxluq anlayışı', 'Concept of a set', 'Понятие множества'),
  (6, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Çoxluqlar arasındakı münasibətlər', 'Relations between sets', 'Отношения между множествами'),
  (6, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Bucaqlar', 'Angles', 'Углы'),
  (6, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Üçbucaqlar', 'Triangles', 'Треугольники'),
  (6, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Üçbucaqların konqruyentliyi', 'Congruence of triangles', 'Равенство треугольников'),
  (6, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Həndəsi qurmalar', 'Geometric constructions', 'Геометрические построения'),
  (6, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Perimetr və sahə', 'Perimeter and area', 'Периметр и площадь'),
  (6, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Dekart koordinat sistemi', 'Cartesian coordinate system', 'Декартова система координат'),
  (6, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Simmetriya və sürüşmə', 'Symmetry and translation', 'Симметрия и параллельный перенос'),
  (6, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəza fiqurlarının səthinin sahəsi və həcmi', 'Surface area and volume of solid figures', 'Площадь поверхности и объём пространственных фигур'),
  (6, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Statistik məlumatlar', 'Statistical data', 'Статистические данные'),
  (6, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Elementar hadisənin ehtimalı', 'Probability of an elementary event', 'Вероятность элементарного события'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Canlılarda əsas orqanların quruluş və funksiyaları', 'Structure and functions of the main organs in living organisms', 'Строение и функции основных органов у живых организмов'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Tənəffüs sistemi', 'Respiratory system', 'Дыхательная система'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Qan dövranı sistemi', 'Circulatory system', 'Кровеносная система'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Ağciyərlərdə qazlar mübadiləsi', 'Gas exchange in the lungs', 'Газообмен в лёгких'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Yoluxucu xəstəliklər', 'Infectious diseases', 'Инфекционные заболевания'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Xəstəliklərin ötürülməsi və qarşısının alınması', 'Transmission and prevention of diseases', 'Передача и профилактика заболеваний'),
  (6, 'Canlılar və həyat prosesləri', 'Living organisms and life processes', 'Живые организмы и жизненные процессы', 'Bakteriyalar', 'Bacteria', 'Бактерии'),
  (6, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Viruslar', 'Viruses', 'Вирусы'),
  (6, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Göbələklər', 'Fungi', 'Грибы'),
  (6, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Maddələrin fiziki xüsusiyyətləri', 'Physical properties of substances', 'Физические свойства веществ'),
  (6, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Saf maddələr və qarışıqlar', 'Pure substances and mixtures', 'Чистые вещества и смеси'),
  (6, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Cismə təsir edən qüvvə', 'Force acting on an object', 'Сила, действующая на тело'),
  (6, 'Maddələr və onların xassələri', 'Substances and their properties', 'Вещества и их свойства', 'Qüvvənin cismin hərəkətinə təsiri', 'Effect of force on the motion of an object', 'Влияние силы на движение тела'),
  (6, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'İstilik enerjisi', 'Thermal energy', 'Тепловая энергия'),
  (6, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'İstilik enerjisinin ötürülməsi', 'Transfer of thermal energy', 'Передача тепловой энергии'),
  (6, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Elektrik dövrəsi', 'Electric circuit', 'Электрическая цепь'),
  (6, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Sadə dövrə elementləri', 'Basic circuit components', 'Простые элементы электрической цепи'),
  (6, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Elektrik dövrəsində enerji çevrilmələri', 'Energy transformations in an electric circuit', 'Превращения энергии в электрической цепи'),
  (6, 'Enerji, qüvvə və Yer sistemləri', 'Energy, force and Earth systems', 'Энергия, сила и системы Земли', 'Səsin yaranması və yayılması', 'Production and propagation of sound', 'Возникновение и распространение звука'),
  (6, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Ekosistemlər', 'Ecosystems', 'Экосистемы'),
  (6, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Canlılar və ətraf mühit arasındakı əlaqə', 'Relationship between living organisms and the environment', 'Связь между живыми организмами и окружающей средой'),
  (6, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'İnsan fəaliyyətinin ətraf mühitə təsiri', 'Impact of human activity on the environment', 'Влияние деятельности человека на окружающую среду'),
  (6, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Süxur və torpaqlar', 'Rocks and soils', 'Горные породы и почвы'),
  (6, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Hava şəraitinin süxur və torpağa təsiri', 'Effect of weather on rocks and soil', 'Влияние погодных условий на горные породы и почву'),
  (6, 'Ekologiya, sağlamlıq və təhlükəsizlik', 'Ecology, health and safety', 'Экология, здоровье и безопасность', 'Günəş sistemindəki cisimlərin hərəkəti', 'Movement of bodies in the Solar System', 'Движение тел в Солнечной системе'),
  (6, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Mətnin kodlaşdırılması', 'Text encoding', 'Кодирование текста'),
  (6, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'ASCII və Unicode', 'ASCII and Unicode', 'ASCII и Unicode'),
  (6, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İkilik say sistemi', 'Binary number system', 'Двоичная система счисления'),
  (6, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Verilənlər yığını', 'Dataset', 'Набор данных'),
  (6, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüter yaddaşı və informasiya daşıyıcıları', 'Computer memory and information carriers', 'Память компьютера и носители информации'),
  (6, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüter şəbəkələri', 'Computer networks', 'Компьютерные сети'),
  (6, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Əməliyyat sistemi', 'Operating system', 'Операционная система'),
  (6, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Antivirus proqramları', 'Antivirus software', 'Антивирусные программы'),
  (6, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Elektron cədvəllər', 'Spreadsheets', 'Электронные таблицы'),
  (6, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Formallaşdırma və modelləşdirmə', 'Formalization and modeling', 'Формализация и моделирование'),
  (6, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Şərt və mürəkkəb şərt', 'Condition and compound condition', 'Условие и составное условие'),
  (6, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Budaqlanma', 'Branching', 'Ветвление'),
  (6, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Dövr', 'Loop', 'Цикл'),
  (6, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Prosedur və funksiya', 'Procedure and function', 'Процедура и функция'),
  (6, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Veb-saytın strukturu', 'Website structure', 'Структура веб-сайта'),
  (6, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İnformasiya təhlükəsizliyi', 'Information security', 'Информационная безопасность'),
  (6, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Parol və giriş məlumatlarının qorunması', 'Protection of passwords and login credentials', 'Защита паролей и данных для входа'),
  (6, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətndə yeni informasiyanın müəyyən edilməsi', 'Identifying new information in a listened text', 'Определение новой информации в прослушанном тексте'),
  (6, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Söz və ifadələrin leksik-semantik mənası', 'Lexical-semantic meaning of words and expressions', 'Лексико-семантическое значение слов и выражений'),
  (6, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Yeni sözlərin mövzuya uyğun işlədilməsi', 'Using new words appropriately for the topic', 'Использование новых слов в соответствии с темой'),
  (6, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Müxtəlif mövzulu dialoqlar', 'Dialogues on various topics', 'Диалоги на различные темы'),
  (6, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mövzu üzrə fikirlərin ifadə edilməsi', 'Expressing ideas on a topic', 'Выражение мыслей по теме'),
  (6, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mətnin giriş, əsas hissə və nəticəyə ayrılması', 'Dividing a text into introduction, main body and conclusion', 'Деление текста на вступление, основную часть и заключение'),
  (6, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mətn üzrə sualların hazırlanması', 'Preparing questions about a text', 'Составление вопросов по тексту'),
  (6, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Kiçikhəcmli mətnlərin yazılması', 'Writing short texts', 'Написание небольших текстов'),
  (6, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Orfoqrafiya qaydaları', 'Spelling rules', 'Правила орфографии'),
  (6, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Məktub', 'Letter', 'Письмо'),
  (6, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Elan', 'Announcement', 'Объявление'),
  (6, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Sadə və mürəkkəb ədədlərin fərqləndirilməsi', 'Distinguishing prime and composite numbers', 'Различение простых и составных чисел'),
  (6, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Ədədin sadə vuruqlara ayrılması', 'Prime factorization of a number', 'Разложение числа на простые множители'),
  (6, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Nisbət və tənasüb', 'Ratio and proportion', 'Отношение и пропорция'),
  (6, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Düz və tərs mütənasiblik', 'Direct and inverse proportion', 'Прямая и обратная пропорциональность'),
  (6, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Çoxluqlar və onlar arasındakı münasibətlər', 'Sets and relations between them', 'Множества и отношения между ними'),
  (6, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Koordinat sistemi', 'Coordinate system', 'Система координат'),
  (6, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Elementar hadisənin ehtimalı', 'Probability of an elementary event', 'Вероятность элементарного события'),
  (6, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'İkilik say sistemi', 'Binary number system', 'Двоичная система счисления'),
  (6, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Şərt və mürəkkəb şərt', 'Condition and compound condition', 'Условие и составное условие'),
  (6, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Budaqlanan və dövrü alqoritmlər', 'Branching and cyclic algorithms', 'Разветвляющиеся и циклические алгоритмы'),
  (6, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Prosedur və funksiya', 'Procedure and function', 'Процедура и функция'),
  (6, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Verilənlərin məntiqi qruplaşdırılması', 'Logical grouping of data', 'Логическая группировка данных'),
  (7, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Rasional ədədlər', 'Rational numbers', 'Рациональные числа'),
  (7, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Rasional ədədlərin müqayisəsi və sıralanması', 'Comparing and ordering rational numbers', 'Сравнение и упорядочивание рациональных чисел'),
  (7, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Rasional ədədlər üzərində əməllər', 'Operations with rational numbers', 'Действия с рациональными числами'),
  (7, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Çoxhədlilər', 'Polynomials', 'Многочлены'),
  (7, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Çoxhədlilərin toplanması, çıxılması və vurulması', 'Addition, subtraction and multiplication of polynomials', 'Сложение, вычитание и умножение многочленов'),
  (7, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Xətti tənlik', 'Linear equation', 'Линейное уравнение'),
  (7, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Xətti tənliklər sistemi', 'System of linear equations', 'Система линейных уравнений'),
  (7, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Sadə bərabərsizlik', 'Simple inequality', 'Простое неравенство'),
  (7, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Xətti funksiya', 'Linear function', 'Линейная функция'),
  (7, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Düz xətlə çevrənin qarşılıqlı vəziyyəti', 'Relative positions of a straight line and a circle', 'Взаимное расположение прямой и окружности'),
  (7, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'İki çevrənin qarşılıqlı vəziyyəti', 'Relative positions of two circles', 'Взаимное расположение двух окружностей'),
  (7, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Çevrədə bucaqlar', 'Angles in a circle', 'Углы в окружности'),
  (7, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Qövsün uzunluğu', 'Arc length', 'Длина дуги'),
  (7, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Dairə sektorunun sahəsi', 'Area of a circular sector', 'Площадь сектора круга'),
  (7, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Dördbucaqlı və üçbucaqların xassələri', 'Properties of quadrilaterals and triangles', 'Свойства четырёхугольников и треугольников'),
  (7, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Düz xəttin tənliyi', 'Equation of a straight line', 'Уравнение прямой'),
  (7, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Hərəkətə dair məsələlər', 'Motion problems', 'Задачи на движение'),
  (7, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Həndəsi qurmalar', 'Geometric constructions', 'Геометрические построения'),
  (7, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəza fiqurlarının səthinin sahəsi və həcmi', 'Surface area and volume of solid figures', 'Площадь поверхности и объём пространственных фигур'),
  (7, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Statistik məlumatlar', 'Statistical data', 'Статистические данные'),
  (7, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Nəzəri və eksperimental ehtimal', 'Theoretical and experimental probability', 'Теоретическая и экспериментальная вероятность'),
  (7, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Tamamlayıcı hadisələr', 'Complementary events', 'Дополнительные события'),
  (7, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Fiziki kəmiyyətlər', 'Physical quantities', 'Физические величины'),
  (7, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Əsas və törəmə vahidlər', 'Base and derived units', 'Основные и производные единицы'),
  (7, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Beynəlxalq Vahidlər Sistemi', 'International System of Units', 'Международная система единиц'),
  (7, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Kütlə, uzunluq, zaman, həcm, sürət və sıxlıq', 'Mass, length, time, volume, speed and density', 'Масса, длина, время, объём, скорость и плотность'),
  (7, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Ölçü cihazları və şkala', 'Measuring instruments and scales', 'Измерительные приборы и шкала'),
  (7, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Ölçmədə dəqiqlik və xəta', 'Accuracy and error in measurement', 'Точность и погрешность измерений'),
  (7, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Skalyar və vektorial kəmiyyətlər', 'Scalar and vector quantities', 'Скалярные и векторные величины'),
  (7, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Mexaniki hərəkət', 'Mechanical motion', 'Механическое движение'),
  (7, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Yol, yerdəyişmə və sürət', 'Distance, displacement and speed', 'Путь, перемещение и скорость'),
  (7, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Orta sürət', 'Average speed', 'Средняя скорость'),
  (7, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Elektrostatik sahə', 'Electrostatic field', 'Электростатическое поле'),
  (7, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Elektrik yükü', 'Electric charge', 'Электрический заряд'),
  (7, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Sabit elektrik cərəyanı', 'Direct electric current', 'Постоянный электрический ток'),
  (7, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Maqnit hadisələri', 'Magnetic phenomena', 'Магнитные явления'),
  (7, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Mexaniki dalğalar', 'Mechanical waves', 'Механические волны'),
  (7, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Atom modeli', 'Atomic model', 'Модель атома'),
  (7, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Elektrik keçiriciliyi', 'Electrical conductivity', 'Электропроводность'),
  (7, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Radioaktiv çevrilmələr və nüvə reaksiyaları', 'Radioactive transformations and nuclear reactions', 'Радиоактивные превращения и ядерные реакции'),
  (7, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Kimyəvi elementlər', 'Chemical elements', 'Химические элементы'),
  (7, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Elementlərin işarəsi və adı', 'Symbols and names of elements', 'Обозначения и названия элементов'),
  (7, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Bioelementlər', 'Bioelements', 'Биоэлементы'),
  (7, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Metallar və qeyri-metallar', 'Metals and non-metals', 'Металлы и неметаллы'),
  (7, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Allotropiya və allotropik şəkildəyişmələr', 'Allotropy and allotropic modifications', 'Аллотропия и аллотропные модификации'),
  (7, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Saf maddə', 'Pure substance', 'Чистое вещество'),
  (7, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Kimyəvi birləşmə', 'Chemical compound', 'Химическое соединение'),
  (7, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Qarışıq', 'Mixture', 'Смесь'),
  (7, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Atom və molekul', 'Atom and molecule', 'Атом и молекула'),
  (7, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Homogen və heterogen qarışıqlar', 'Homogeneous and heterogeneous mixtures', 'Однородные и неоднородные смеси'),
  (7, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Emulsiya və suspenziya', 'Emulsion and suspension', 'Эмульсия и суспензия'),
  (7, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Həllolma', 'Dissolution', 'Растворение'),
  (7, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Doymuş və doymamış məhlullar', 'Saturated and unsaturated solutions', 'Насыщенные и ненасыщенные растворы'),
  (7, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Qarışıqların ayrılma üsulları', 'Methods of separating mixtures', 'Способы разделения смесей'),
  (7, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Distillə, buxarlandırma, xromatoqrafiya, süzmə və maqnitlə ayırma', 'Distillation, evaporation, chromatography, filtration and magnetic separation', 'Дистилляция, выпаривание, хроматография, фильтрование и магнитное разделение'),
  (7, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Kimyəvi reaksiyaların əlamətləri', 'Signs of chemical reactions', 'Признаки химических реакций'),
  (7, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Ekzotermik və endotermik reaksiyalar', 'Exothermic and endothermic reactions', 'Экзотермические и эндотермические реакции'),
  (7, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Turşular və qələvilər', 'Acids and alkalis', 'Кислоты и щёлочи'),
  (7, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Atomun quruluşu', 'Structure of the atom', 'Строение атома'),
  (7, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'İonların əmələ gəlməsi', 'Formation of ions', 'Образование ионов'),
  (7, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Canlı orqanizmlərin ümumi xüsusiyyətləri', 'General characteristics of living organisms', 'Общие признаки живых организмов'),
  (7, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Hüceyrənin quruluşu', 'Cell structure', 'Строение клетки'),
  (7, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Hüceyrə strukturlarının funksiyaları', 'Functions of cell structures', 'Функции клеточных структур'),
  (7, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Mikroskop', 'Microscope', 'Микроскоп'),
  (7, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Hüceyrə, toxuma, orqan və orqanlar sistemi', 'Cell, tissue, organ and organ system', 'Клетка, ткань, орган и система органов'),
  (7, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Çoxhüceyrəli orqanizmlərin təşkil səviyyələri', 'Levels of organization of multicellular organisms', 'Уровни организации многоклеточных организмов'),
  (7, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Çiçəkli bitkilərin əsas orqanları', 'Main organs of flowering plants', 'Основные органы цветковых растений'),
  (7, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Kök, gövdə, yarpaq, çiçək, meyvə və toxum', 'Root, stem, leaf, flower, fruit and seed', 'Корень, стебель, лист, цветок, плод и семя'),
  (7, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Kök və kök sistemləri', 'Root and root systems', 'Корень и корневые системы'),
  (7, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Yarpağın morfoloji xüsusiyyətləri', 'Morphological features of the leaf', 'Морфологические особенности листа'),
  (7, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Gövdənin morfoloji xüsusiyyətləri', 'Morphological features of the stem', 'Морфологические особенности стебля'),
  (7, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Onurğalı və onurğasız heyvanlar', 'Vertebrate and invertebrate animals', 'Позвоночные и беспозвоночные животные'),
  (7, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Bitkilərin həyat dövrü və böyüməsi', 'Plant life cycle and growth', 'Жизненный цикл и рост растений'),
  (7, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Çiçəyin quruluşu', 'Structure of the flower', 'Строение цветка'),
  (7, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Ekosistemlər', 'Ecosystems', 'Экосистемы'),
  (7, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Qida zənciri və canlıların qarşılıqlı əlaqəsi', 'Food chain and interactions among living organisms', 'Пищевая цепь и взаимодействие живых организмов'),
  (7, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Canlıların müxtəlifliyi', 'Diversity of living organisms', 'Разнообразие живых организмов'),
  (7, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Sağlam həyat tərzi', 'Healthy lifestyle', 'Здоровый образ жизни'),
  (7, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Rastr və vektor qrafikası', 'Raster and vector graphics', 'Растровая и векторная графика'),
  (7, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Rəng modelləri', 'Color models', 'Цветовые модели'),
  (7, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Onaltılıq say sistemi', 'Hexadecimal number system', 'Шестнадцатеричная система счисления'),
  (7, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Cədvəl informasiya modelləri', 'Tabular information models', 'Табличные информационные модели'),
  (7, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüter qurğuları və multimedia qurğuları', 'Computer devices and multimedia devices', 'Компьютерные и мультимедийные устройства'),
  (7, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Əməliyyat sistemi', 'Operating system', 'Операционная система'),
  (7, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Elektron cədvəllərdə riyazi funksiyalar', 'Mathematical functions in spreadsheets', 'Математические функции в электронных таблицах'),
  (7, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Verilənlər bazası', 'Database', 'База данных'),
  (7, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Verilənlər bazasında cədvəl, sahə və yazı', 'Table, field and record in a database', 'Таблица, поле и запись в базе данных'),
  (7, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Mülahizə və məntiqi ifadə', 'Statement and logical expression', 'Высказывание и логическое выражение'),
  (7, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Alqoritmlərin qurulması', 'Constructing algorithms', 'Построение алгоритмов'),
  (7, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Proqramlaşdırmada dəyişənlər və şərtlər', 'Variables and conditions in programming', 'Переменные и условия в программировании'),
  (7, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Şəbəkə və internet təhlükəsizliyi', 'Network and internet security', 'Безопасность сетей и интернета'),
  (7, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Müəlliflik hüququ və rəqəmsal davranış', 'Copyright and digital behavior', 'Авторское право и цифровое поведение'),
  (7, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətndə əsas fikrin müəyyən edilməsi', 'Identifying the main idea in a listened text', 'Определение основной мысли в прослушанном тексте'),
  (7, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Müraciətlərə uyğun tapşırıqların icrası', 'Carrying out tasks according to requests', 'Выполнение заданий в соответствии с обращениями'),
  (7, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Nitq modelləri', 'Speech patterns', 'Речевые модели'),
  (7, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dialoqlarda nitq etiketləri', 'Speech etiquette in dialogues', 'Речевой этикет в диалогах'),
  (7, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Fikrin müxtəlif formalarda ifadə edilməsi', 'Expressing an idea in different forms', 'Выражение мысли в различных формах'),
  (7, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Sözlərin morfoloji xüsusiyyətlərinə görə qruplaşdırılması', 'Grouping words by morphological features', 'Группировка слов по морфологическим признакам'),
  (7, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mətnin ton, temp, ritm və fasilə ilə oxunması', 'Reading a text with appropriate tone, pace, rhythm and pauses', 'Чтение текста с учётом тона, темпа, ритма и пауз'),
  (7, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mətn hissələri arasındakı məntiqi ardıcıllıq', 'Logical sequence between parts of a text', 'Логическая последовательность между частями текста'),
  (7, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mətnin əsas fikri', 'Main idea of a text', 'Основная мысль текста'),
  (7, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mövzu üzrə yazılı fikir', 'Written expression on a topic', 'Письменное изложение мысли по теме'),
  (7, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Əşya və hadisələrin təsviri', 'Describing objects and events', 'Описание предметов и событий'),
  (7, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Afişa', 'Poster', 'Афиша'),
  (7, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Dəvətnamə', 'Invitation', 'Приглашение'),
  (7, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Rasional ədədlərlə mühakimə', 'Reasoning with rational numbers', 'Рассуждение с рациональными числами'),
  (7, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Xətti tənlik və tənliklər sistemi', 'Linear equation and system of equations', 'Линейное уравнение и система уравнений'),
  (7, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Xətti funksiya və qrafik', 'Linear function and graph', 'Линейная функция и график'),
  (7, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Mülahizə və doğruluq qiyməti', 'Statement and truth value', 'Высказывание и значение истинности'),
  (7, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Məntiqi ifadələr', 'Logical expressions', 'Логические выражения'),
  (7, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Məlumatların cədvəl modeli', 'Tabular data model', 'Табличная модель данных'),
  (7, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Hadisənin nəzəri və eksperimental ehtimalı', 'Theoretical and experimental probability of an event', 'Теоретическая и экспериментальная вероятность события'),
  (7, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Tamamlayıcı hadisələr', 'Complementary events', 'Дополнительные события'),
  (7, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Məsələnin altməsələlərə bölünməsi', 'Breaking a problem into subproblems', 'Разбиение задачи на подзадачи'),
  (7, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Verilmiş şərtlər əsasında nəticə çıxarılması', 'Drawing conclusions based on given conditions', 'Формулирование вывода на основе заданных условий'),
  (7, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Alqoritmin düzgünlüyünün yoxlanılması', 'Checking the correctness of an algorithm', 'Проверка правильности алгоритма'),
  (8, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kvadrat kök', 'Square root', 'Квадратный корень'),
  (8, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'İrrasional ədədlər', 'Irrational numbers', 'Иррациональные числа'),
  (8, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Həqiqi ədədlər', 'Real numbers', 'Действительные числа'),
  (8, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Tam üstlü qüvvət', 'Integer exponent', 'Степень с целым показателем'),
  (8, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Hesabi kvadrat kök', 'Principal square root', 'Арифметический квадратный корень'),
  (8, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Rasional ifadələr', 'Rational expressions', 'Рациональные выражения'),
  (8, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Rasional ifadələr üzərində əməllər', 'Operations with rational expressions', 'Действия с рациональными выражениями'),
  (8, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Kvadrat tənlik', 'Quadratic equation', 'Квадратное уравнение'),
  (8, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Rasional tənlik', 'Rational equation', 'Рациональное уравнение'),
  (8, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Bərabərsizliklər', 'Inequalities', 'Неравенства'),
  (8, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Funksiya və funksional asılılıq', 'Function and functional dependence', 'Функция и функциональная зависимость'),
  (8, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Düzbucaqlı üçbucaq', 'Right triangle', 'Прямоугольный треугольник'),
  (8, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Pifaqor teoremi', 'Pythagorean theorem', 'Теорема Пифагора'),
  (8, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Müstəvi fiqurların sahəsi', 'Area of plane figures', 'Площадь плоских фигур'),
  (8, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Oxşar fiqurlar və üçbucaqların oxşarlığı', 'Similar figures and similarity of triangles', 'Подобные фигуры и подобие треугольников'),
  (8, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Kəsən və vətərin xassələri', 'Properties of a secant and a chord', 'Свойства секущей и хорды'),
  (8, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Dairə seqmentinin sahəsi', 'Area of a circular segment', 'Площадь сегмента круга'),
  (8, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Triqonometrik nisbətlər', 'Trigonometric ratios', 'Тригонометрические отношения'),
  (8, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Koordinat həndəsəsi', 'Coordinate geometry', 'Координатная геометрия'),
  (8, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəza fiqurlarının səthinin sahəsi və həcmi', 'Surface area and volume of solid figures', 'Площадь поверхности и объём пространственных фигур'),
  (8, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Statistik məlumatlar', 'Statistical data', 'Статистические данные'),
  (8, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Asılı olmayan hadisələrin ehtimalı', 'Probability of independent events', 'Вероятность независимых событий'),
  (8, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Qüvvə və əvəzləyici qüvvə', 'Force and resultant force', 'Сила и равнодействующая сила'),
  (8, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Nyuton qanunları', 'Newton’s laws', 'Законы Ньютона'),
  (8, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Ağırlıq qüvvəsi', 'Force of gravity', 'Сила тяжести'),
  (8, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Elastiklik qüvvəsi', 'Elastic force', 'Сила упругости'),
  (8, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Sürtünmə qüvvəsi', 'Friction force', 'Сила трения'),
  (8, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Mexaniki iş', 'Mechanical work', 'Механическая работа'),
  (8, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Mexaniki enerji', 'Mechanical energy', 'Механическая энергия'),
  (8, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Güc', 'Power', 'Мощность'),
  (8, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Təzyiq', 'Pressure', 'Давление'),
  (8, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Maye və qazlarda təzyiq', 'Pressure in liquids and gases', 'Давление в жидкостях и газах'),
  (8, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Molekulyar kinetik nəzəriyyə', 'Molecular kinetic theory', 'Молекулярно-кинетическая теория'),
  (8, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Maddənin zərrəcik quruluşu', 'Particle structure of matter', 'Строение вещества из частиц'),
  (8, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Daxili enerji', 'Internal energy', 'Внутренняя энергия'),
  (8, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'İstilikvermə', 'Heat transfer', 'Теплопередача'),
  (8, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'İstilikkeçirmə, konveksiya və şüalanma', 'Conduction, convection and radiation', 'Теплопроводность, конвекция и излучение'),
  (8, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Enerjinin saxlanması qanunu', 'Law of conservation of energy', 'Закон сохранения энергии'),
  (8, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Mexaniki dalğalar', 'Mechanical waves', 'Механические волны'),
  (8, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Kimyəvi reaksiyaların təsnifatı', 'Classification of chemical reactions', 'Классификация химических реакций'),
  (8, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Reaksiya tənliklərinin əmsallaşdırılması', 'Balancing chemical equations', 'Расстановка коэффициентов в уравнениях реакций'),
  (8, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Kimyəvi reaksiyaların sürəti', 'Rate of chemical reactions', 'Скорость химических реакций'),
  (8, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Reaksiya sürətinə təsir edən amillər', 'Factors affecting reaction rate', 'Факторы, влияющие на скорость реакции'),
  (8, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Turşular', 'Acids', 'Кислоты'),
  (8, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Əsaslar', 'Bases', 'Основания'),
  (8, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Oksidlər', 'Oxides', 'Оксиды'),
  (8, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Duzlar', 'Salts', 'Соли'),
  (8, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Neytrallaşma reaksiyası', 'Neutralization reaction', 'Реакция нейтрализации'),
  (8, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Atomun quruluşu', 'Structure of the atom', 'Строение атома'),
  (8, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'İonların əmələ gəlməsi', 'Formation of ions', 'Образование ионов'),
  (8, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Kimyəvi rabitə', 'Chemical bonding', 'Химическая связь'),
  (8, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'İon və kovalent rabitə', 'Ionic and covalent bonding', 'Ионная и ковалентная связь'),
  (8, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Maddələrin quruluşu və xassələri', 'Structure and properties of substances', 'Строение и свойства веществ'),
  (8, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Bioloji molekullar', 'Biological molecules', 'Биологические молекулы'),
  (8, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Karbohidratlar', 'Carbohydrates', 'Углеводы'),
  (8, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Lipidlər', 'Lipids', 'Липиды'),
  (8, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Zülallar', 'Proteins', 'Белки'),
  (8, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Nuklein turşuları', 'Nucleic acids', 'Нуклеиновые кислоты'),
  (8, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Maddələrin daşınma mexanizmi', 'Mechanism of substance transport', 'Механизм транспорта веществ'),
  (8, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Qida maddələri və qidalanma', 'Nutrients and nutrition', 'Питательные вещества и питание'),
  (8, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Həzm sistemi', 'Digestive system', 'Пищеварительная система'),
  (8, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Qazlar mübadiləsi', 'Gas exchange', 'Газообмен'),
  (8, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Tənəffüs', 'Respiration', 'Дыхание'),
  (8, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Bitkilərdə maddələrin daşınması', 'Transport of substances in plants', 'Транспорт веществ в растениях'),
  (8, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'İnsanda və heyvanlarda qan dövranı', 'Blood circulation in humans and animals', 'Кровообращение у человека и животных'),
  (8, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Ürək və qan damarları', 'Heart and blood vessels', 'Сердце и кровеносные сосуды'),
  (8, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Heyvanların həyat dövrü və böyüməsi', 'Animal life cycle and growth', 'Жизненный цикл и рост животных'),
  (8, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'İnsanın çoxalması və inkişafı', 'Human reproduction and development', 'Размножение и развитие человека'),
  (8, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Xəstəliklər və immunitet', 'Diseases and immunity', 'Заболевания и иммунитет'),
  (8, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Həyat tərzi və xroniki xəstəliklər', 'Lifestyle and chronic diseases', 'Образ жизни и хронические заболевания'),
  (8, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Səs və videonun kodlaşdırılması', 'Encoding audio and video', 'Кодирование звука и видео'),
  (8, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Say sistemləri', 'Number systems', 'Системы счисления'),
  (8, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Verilənlər bazası və verilənlər bazası cədvəlləri', 'Database and database tables', 'База данных и таблицы базы данных'),
  (8, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Elektron cədvəllərdə məntiqi funksiyalar', 'Logical functions in spreadsheets', 'Логические функции в электронных таблицах'),
  (8, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Virtual reallıq', 'Virtual reality', 'Виртуальная реальность'),
  (8, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Artırılmış reallıq', 'Augmented reality', 'Дополненная реальность'),
  (8, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kriptoqrafiyanın əsasları', 'Fundamentals of cryptography', 'Основы криптографии'),
  (8, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Mülahizə', 'Statement', 'Высказывание'),
  (8, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'VƏ, VƏYA və DEYİL məntiqi əməlləri', 'AND, OR and NOT logical operations', 'Логические операции И, ИЛИ и НЕ'),
  (8, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Doğruluq cədvəlləri', 'Truth tables', 'Таблицы истинности'),
  (8, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Ağac informasiya modelləri', 'Tree information models', 'Древовидные информационные модели'),
  (8, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Alqoritmlərdə şərt və dövr', 'Conditions and loops in algorithms', 'Условия и циклы в алгоритмах'),
  (8, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Proqramlaşdırmada siyahılar və verilənlər', 'Lists and data in programming', 'Списки и данные в программировании'),
  (8, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'İnformasiya təhlükəsizliyi', 'Information security', 'Информационная безопасность'),
  (8, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Müraciətlərə uyğun tapşırıqların ardıcıl icrası', 'Sequential execution of tasks according to requests', 'Последовательное выполнение заданий в соответствии с обращениями'),
  (8, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətnin hissələrə ayrılması', 'Dividing a listened text into parts', 'Деление прослушанного текста на части'),
  (8, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Fikrin müxtəlif cümlə konstruksiyaları ilə ifadəsi', 'Expressing an idea using different sentence structures', 'Выражение мысли с помощью различных конструкций предложений'),
  (8, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Müzakirələrdə iştirak', 'Participation in discussions', 'Участие в обсуждениях'),
  (8, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Fikirlərin məntiqi ardıcıllıqla ifadəsi', 'Expressing ideas in logical sequence', 'Выражение мыслей в логической последовательности'),
  (8, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Söz və ifadələrin qrammatik-semantik xüsusiyyətləri', 'Grammatical and semantic features of words and expressions', 'Грамматико-семантические особенности слов и выражений'),
  (8, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Cümlələrin məqsəd və intonasiyaya görə oxunması', 'Reading sentences according to purpose and intonation', 'Чтение предложений с учётом цели и интонации'),
  (8, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mətn planının hazırlanması', 'Preparing a text outline', 'Составление плана текста'),
  (8, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Əsas fakt və hadisələrin seçilməsi və qruplaşdırılması', 'Selecting and grouping key facts and events', 'Выбор и группировка основных фактов и событий'),
  (8, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Məlumat xarakterli mətn', 'Informational text', 'Информационный текст'),
  (8, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Anket formalarının doldurulması', 'Filling in questionnaire forms', 'Заполнение анкетных форм'),
  (8, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Durğu işarələri', 'Punctuation marks', 'Знаки препинания'),
  (8, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Həqiqi ədədlərin təsnifatı', 'Classification of real numbers', 'Классификация действительных чисел'),
  (8, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Kvadrat tənlik və bərabərsizliklər', 'Quadratic equations and inequalities', 'Квадратные уравнения и неравенства'),
  (8, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Funksional asılılıq', 'Functional dependence', 'Функциональная зависимость'),
  (8, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Səbəb və nəticə əlaqələri', 'Cause-and-effect relationships', 'Причинно-следственные связи'),
  (8, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Məntiqi mülahizələr', 'Logical statements', 'Логические высказывания'),
  (8, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'VƏ, VƏYA və DEYİL əməlləri', 'AND, OR and NOT operations', 'Операции И, ИЛИ и НЕ'),
  (8, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Doğruluq cədvəlləri', 'Truth tables', 'Таблицы истинности'),
  (8, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Ağac modelləri', 'Tree models', 'Древовидные модели'),
  (8, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Asılı və asılı olmayan hadisələr', 'Dependent and independent events', 'Зависимые и независимые события'),
  (8, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Mümkün variantların sistemli müəyyən edilməsi', 'Systematic identification of possible variants', 'Систематическое определение возможных вариантов'),
  (8, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Şərtli və dövrü alqoritmlər', 'Conditional and cyclic algorithms', 'Условные и циклические алгоритмы'),
  (9, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Həqiqi ədədlər çoxluğunda əməllər', 'Operations in the set of real numbers', 'Действия в множестве действительных чисел'),
  (9, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'n-ci dərəcədən kök', 'nth root', 'Корень n-й степени'),
  (9, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Rasional üstlü qüvvət', 'Power with a rational exponent', 'Степень с рациональным показателем'),
  (9, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ardıcıllıq', 'Sequence', 'Последовательность'),
  (9, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Ədədi silsilə', 'Arithmetic progression', 'Арифметическая прогрессия'),
  (9, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Həndəsi silsilə', 'Geometric progression', 'Геометрическая прогрессия'),
  (9, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Tənliklərin qurulması və həlli', 'Forming and solving equations', 'Составление и решение уравнений'),
  (9, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Kvadrat bərabərsizliklər', 'Quadratic inequalities', 'Квадратные неравенства'),
  (9, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Rasional bərabərsizliklər', 'Rational inequalities', 'Рациональные неравенства'),
  (9, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Funksiyanın qrafiki', 'Graph of a function', 'График функции'),
  (9, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Çoxbucaqlılar', 'Polygons', 'Многоугольники'),
  (9, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Çevrənin tənliyi', 'Equation of a circle', 'Уравнение окружности'),
  (9, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Müstəvidə vektorlar', 'Vectors in the plane', 'Векторы на плоскости'),
  (9, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəza fiqurlarının səthinin sahəsi və həcmi', 'Surface area and volume of solid figures', 'Площадь поверхности и объём пространственных фигур'),
  (9, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Statistik məlumatlar', 'Statistical data', 'Статистические данные'),
  (9, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Şərti ehtimal', 'Conditional probability', 'Условная вероятность'),
  (9, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Asılı hadisələrin ehtimalı', 'Probability of dependent events', 'Вероятность зависимых событий'),
  (9, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Fiziki kəmiyyətlər və onların ölçülməsi', 'Physical quantities and their measurement', 'Физические величины и их измерение'),
  (9, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Ölçmələr və hesablamalar', 'Measurements and calculations', 'Измерения и вычисления'),
  (9, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Eksperimentin planlaşdırılması və icrası', 'Planning and conducting an experiment', 'Планирование и проведение эксперимента'),
  (9, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Elektrik dövrəsi', 'Electric circuit', 'Электрическая цепь'),
  (9, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Elektrik müqaviməti', 'Electrical resistance', 'Электрическое сопротивление'),
  (9, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Dövrə elementlərinin müqaviməti', 'Resistance of circuit elements', 'Сопротивление элементов цепи'),
  (9, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Elektrik və maqnit sahələrinin qarşılıqlı təsiri', 'Interaction of electric and magnetic fields', 'Взаимодействие электрического и магнитного полей'),
  (9, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Elektromaqnit hadisələri', 'Electromagnetic phenomena', 'Электромагнитные явления'),
  (9, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'İşığın yayılması', 'Propagation of light', 'Распространение света'),
  (9, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'İşığın əks olunması', 'Reflection of light', 'Отражение света'),
  (9, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'İşığın sınması', 'Refraction of light', 'Преломление света'),
  (9, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Linzalar və optik hadisələr', 'Lenses and optical phenomena', 'Линзы и оптические явления'),
  (9, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Metallar', 'Metals', 'Металлы'),
  (9, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Qeyri-metallar', 'Non-metals', 'Неметаллы'),
  (9, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Metalların və qeyri-metalların xassələri', 'Properties of metals and non-metals', 'Свойства металлов и неметаллов'),
  (9, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Üzvi birləşmələrin quruluşu', 'Structure of organic compounds', 'Строение органических соединений'),
  (9, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Üzvi birləşmələrin xassələri və tətbiqi', 'Properties and applications of organic compounds', 'Свойства и применение органических соединений'),
  (9, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Mol anlayışı', 'Concept of the mole', 'Понятие моля'),
  (9, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Molyar kütlə', 'Molar mass', 'Молярная масса'),
  (9, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Maddə miqdarı', 'Amount of substance', 'Количество вещества'),
  (9, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Kimyəvi reaksiyalarda maddə miqdarının hesablanması', 'Calculating the amount of substance in chemical reactions', 'Расчёт количества вещества в химических реакциях'),
  (9, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Reaksiyaya daxil olan və alınan maddələrin miqdarı', 'Amounts of reactants and products', 'Количество вступающих в реакцию и образующихся веществ'),
  (9, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Fotosintez', 'Photosynthesis', 'Фотосинтез'),
  (9, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Tənəffüs', 'Respiration', 'Дыхание'),
  (9, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'İnsan və heyvanlarda ifrazat', 'Excretion in humans and animals', 'Выделение у человека и животных'),
  (9, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Böyrəklərin fəaliyyəti', 'Kidney function', 'Работа почек'),
  (9, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Sümük sistemi', 'Skeletal system', 'Костная система'),
  (9, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Əzələ sistemi', 'Muscular system', 'Мышечная система'),
  (9, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Nəzarət və tənzimləmə', 'Control and regulation', 'Контроль и регуляция'),
  (9, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Sinir və hormonal tənzimləmə', 'Nervous and hormonal regulation', 'Нервная и гормональная регуляция'),
  (9, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'DNT və irsiyyət', 'DNA and heredity', 'ДНК и наследственность'),
  (9, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Hüceyrə bölünməsi', 'Cell division', 'Деление клетки'),
  (9, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Mitoz və meyoz', 'Mitosis and meiosis', 'Митоз и мейоз'),
  (9, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'İnsan fəaliyyətinin ətraf mühitə təsiri', 'Impact of human activity on the environment', 'Влияние деятельности человека на окружающую среду'),
  (9, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Modifikasiya dəyişkənliyi', 'Modification variability', 'Модификационная изменчивость'),
  (9, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Təbii seçmə', 'Natural selection', 'Естественный отбор'),
  (9, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Həyat tərzi və xroniki xəstəliklər', 'Lifestyle and chronic diseases', 'Образ жизни и хронические заболевания'),
  (9, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın həcmi', 'Amount of information', 'Объём информации'),
  (9, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın ötürülmə sürəti', 'Information transmission rate', 'Скорость передачи информации'),
  (9, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Verilənlər bazasında axtarış', 'Searching in a database', 'Поиск в базе данных'),
  (9, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Verilənlərin çeşidlənməsi və süzgəcdən keçirilməsi', 'Sorting and filtering data', 'Сортировка и фильтрация данных'),
  (9, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüter komponentləri', 'Computer components', 'Компоненты компьютера'),
  (9, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüter şəbəkəsi və şəbəkə protokolları', 'Computer network and network protocols', 'Компьютерная сеть и сетевые протоколы'),
  (9, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Qraf informasiya modeli', 'Graph information model', 'Графовая информационная модель'),
  (9, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Qonşuluq siyahısı və qonşuluq matrisi', 'Adjacency list and adjacency matrix', 'Список смежности и матрица смежности'),
  (9, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Ən qısa yol alqoritmləri', 'Shortest-path algorithms', 'Алгоритмы поиска кратчайшего пути'),
  (9, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Deykstra alqoritmi', 'Dijkstra’s algorithm', 'Алгоритм Дейкстры'),
  (9, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'A* alqoritmi', 'A* algorithm', 'Алгоритм A*'),
  (9, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Süni intellekt', 'Artificial intelligence', 'Искусственный интеллект'),
  (9, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Ekspert sistemləri', 'Expert systems', 'Экспертные системы'),
  (9, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Bulanıq məntiq', 'Fuzzy logic', 'Нечёткая логика'),
  (9, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Maşın öyrənməsi', 'Machine learning', 'Машинное обучение'),
  (9, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Veb-səhifələrin CSS vasitəsilə tərtibatı', 'Styling web pages with CSS', 'Оформление веб-страниц с помощью CSS'),
  (9, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Veb-saytın etibarlılığının qiymətləndirilməsi', 'Evaluating website reliability', 'Оценка надёжности веб-сайта'),
  (9, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Müraciətdə ifadə olunan fikrə münasibət', 'Attitude toward the idea expressed in a request', 'Отношение к мысли, выраженной в обращении'),
  (9, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətnin şərhi', 'Interpreting a listened text', 'Интерпретация прослушанного текста'),
  (9, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Fikrin müxtəlif nitq vahidləri ilə ifadəsi', 'Expressing an idea using different speech units', 'Выражение мысли с помощью различных речевых единиц'),
  (9, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Təbiət, cəmiyyət, ailə və məktəb mövzularında müzakirə', 'Discussion on nature, society, family and school topics', 'Обсуждение тем природы, общества, семьи и школы'),
  (9, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Müqayisə aparmaqla fikrin izahı', 'Explaining an idea through comparison', 'Объяснение мысли посредством сравнения'),
  (9, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Söz və ifadələrin qrammatik-semantik xüsusiyyətləri', 'Grammatical and semantic features of words and expressions', 'Грамматико-семантические особенности слов и выражений'),
  (9, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mətnin məntiqi ardıcıllıqla danışılması', 'Retelling a text in logical sequence', 'Пересказ текста в логической последовательности'),
  (9, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Oxunan mətnə münasibət', 'Expressing an attitude toward a read text', 'Выражение отношения к прочитанному тексту'),
  (9, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'İnşa', 'Composition', 'Сочинение'),
  (9, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Esse', 'Essay', 'Эссе'),
  (9, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Hekayə', 'Story', 'Рассказ'),
  (9, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Ərizə', 'Application', 'Заявление'),
  (9, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Tərcümeyi-hal', 'Autobiography', 'Автобиография'),
  (9, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Ardıcıllıqlar və silsilələr', 'Sequences and progressions', 'Последовательности и прогрессии'),
  (9, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Funksiyanın qrafiki', 'Graph of a function', 'График функции'),
  (9, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Zəruri və kafi şərtlər', 'Necessary and sufficient conditions', 'Необходимые и достаточные условия'),
  (9, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Şərti ehtimal', 'Conditional probability', 'Условная вероятность'),
  (9, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Asılı hadisələr', 'Dependent events', 'Зависимые события'),
  (9, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Qraf və şəbəkə modelləri', 'Graph and network models', 'Графовые и сетевые модели'),
  (9, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Ən qısa yol məsələləri', 'Shortest-path problems', 'Задачи о кратчайшем пути'),
  (9, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Optimal həll', 'Optimal solution', 'Оптимальное решение'),
  (9, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Süni intellektdə mülahizə', 'Reasoning in artificial intelligence', 'Рассуждение в искусственном интеллекте'),
  (9, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Bulanıq məntiq', 'Fuzzy logic', 'Нечёткая логика'),
  (9, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Məlumat mənbələrinin etibarlılığının müqayisəsi', 'Comparing the reliability of information sources', 'Сравнение надёжности источников информации'),
  (10, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Çoxluqlar üzərində əməllər', 'Operations on sets', 'Операции над множествами'),
  (10, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Toplama və vurma prinsipləri', 'Addition and multiplication principles', 'Принципы сложения и умножения'),
  (10, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Birləşmələr', 'Combinatorial arrangements', 'Комбинаторные соединения'),
  (10, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Permutasiya', 'Permutation', 'Перестановка'),
  (10, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Yerləşmə', 'Arrangement', 'Размещение'),
  (10, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kombinasiya', 'Combination', 'Сочетание'),
  (10, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Həqiqi üstlü qüvvət', 'Power with a real exponent', 'Степень с действительным показателем'),
  (10, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Loqarifm', 'Logarithm', 'Логарифм'),
  (10, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Ədədi arqumentin triqonometrik funksiyaları', 'Trigonometric functions of a numerical argument', 'Тригонометрические функции числового аргумента'),
  (10, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Triqonometrik eyniliklər', 'Trigonometric identities', 'Тригонометрические тождества'),
  (10, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Triqonometrik çevirmə və toplama düsturları', 'Trigonometric transformation and addition formulas', 'Формулы тригонометрических преобразований и сложения'),
  (10, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Funksiya və funksiyanın xassələri', 'Function and properties of a function', 'Функция и свойства функции'),
  (10, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Triqonometrik funksiyaların qrafikləri', 'Graphs of trigonometric functions', 'Графики тригонометрических функций'),
  (10, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Üstlü funksiya', 'Exponential function', 'Показательная функция'),
  (10, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Loqarifmik funksiya', 'Logarithmic function', 'Логарифмическая функция'),
  (10, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Tənlik və bərabərsizliklər', 'Equations and inequalities', 'Уравнения и неравенства'),
  (10, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəzada nöqtə, düz xətt və müstəvi', 'Point, straight line and plane in space', 'Точка, прямая и плоскость в пространстве'),
  (10, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Çoxüzlülər', 'Polyhedra', 'Многогранники'),
  (10, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Çoxüzlülərin səthinin sahəsi və həcmi', 'Surface area and volume of polyhedra', 'Площадь поверхности и объём многогранников'),
  (10, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Statistik məlumatlar', 'Statistical data', 'Статистические данные'),
  (10, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Ehtimala aid məsələlər', 'Probability problems', 'Задачи по теории вероятностей'),
  (10, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Kinematika', 'Kinematics', 'Кинематика'),
  (10, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Düzxətli bərabərsürətli və dəyişənsürətli hərəkət', 'Uniform and non-uniform rectilinear motion', 'Равномерное и неравномерное прямолинейное движение'),
  (10, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Hərəkət tənlikləri', 'Equations of motion', 'Уравнения движения'),
  (10, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Dinamika', 'Dynamics', 'Динамика'),
  (10, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Nyuton qanunları', 'Newton’s laws', 'Законы Ньютона'),
  (10, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'İmpuls', 'Momentum', 'Импульс'),
  (10, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'İmpulsun saxlanması qanunu', 'Law of conservation of momentum', 'Закон сохранения импульса'),
  (10, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Mexaniki iş, enerji və güc', 'Mechanical work, energy and power', 'Механическая работа, энергия и мощность'),
  (10, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Mexaniki enerjinin saxlanması', 'Conservation of mechanical energy', 'Сохранение механической энергии'),
  (10, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Təzyiq', 'Pressure', 'Давление'),
  (10, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Qaz tənlikləri və qaz qanunları', 'Gas equations and gas laws', 'Уравнения состояния газа и газовые законы'),
  (10, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'İdeal qaz', 'Ideal gas', 'Идеальный газ'),
  (10, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Termodinamikanın birinci qanunu', 'First law of thermodynamics', 'Первый закон термодинамики'),
  (10, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Termodinamikanın ikinci qanunu', 'Second law of thermodynamics', 'Второй закон термодинамики'),
  (10, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Mexaniki rəqslər', 'Mechanical oscillations', 'Механические колебания'),
  (10, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Superpozisiya prinsipi', 'Superposition principle', 'Принцип суперпозиции'),
  (10, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Atom və nüvə modeli', 'Atomic and nuclear model', 'Модель атома и ядра'),
  (10, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Radioaktiv çevrilmələr və nüvə reaksiyaları', 'Radioactive transformations and nuclear reactions', 'Радиоактивные превращения и ядерные реакции'),
  (10, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Keçid metalları', 'Transition metals', 'Переходные металлы'),
  (10, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Elektron konfiqurasiya', 'Electron configuration', 'Электронная конфигурация'),
  (10, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Keçid metallarının xassələri', 'Properties of transition metals', 'Свойства переходных металлов'),
  (10, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Molekulların quruluşu', 'Molecular structure', 'Строение молекул'),
  (10, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Molekuldaxili rabitələr', 'Intramolecular bonds', 'Внутримолекулярные связи'),
  (10, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Molekullararası qarşılıqlı təsir qüvvələri', 'Intermolecular forces', 'Межмолекулярные силы взаимодействия'),
  (10, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Qaz zərrəciklərinin hərəkəti', 'Motion of gas particles', 'Движение частиц газа'),
  (10, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Qazlara aid hesablamalar', 'Calculations involving gases', 'Расчёты для газов'),
  (10, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Məhlullar', 'Solutions', 'Растворы'),
  (10, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Məhlulun qatılığı', 'Concentration of a solution', 'Концентрация раствора'),
  (10, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Məhlullara aid hesablamalar', 'Calculations involving solutions', 'Расчёты для растворов'),
  (10, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Reaksiyanın sürəti', 'Reaction rate', 'Скорость реакции'),
  (10, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Reaksiya sürətinə təsir edən amillər', 'Factors affecting reaction rate', 'Факторы, влияющие на скорость реакции'),
  (10, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Kimyəvi tarazlıq', 'Chemical equilibrium', 'Химическое равновесие'),
  (10, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Tarazlıq sabiti', 'Equilibrium constant', 'Константа равновесия'),
  (10, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Hüceyrə biologiyası', 'Cell biology', 'Клеточная биология'),
  (10, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Mikroskopiya', 'Microscopy', 'Микроскопия'),
  (10, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Eukariot və prokariot hüceyrələr', 'Eukaryotic and prokaryotic cells', 'Эукариотические и прокариотические клетки'),
  (10, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Bioloji molekulların strukturu', 'Structure of biological molecules', 'Строение биологических молекул'),
  (10, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Fermentlər — enzimlər', 'Enzymes', 'Ферменты — энзимы'),
  (10, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Hüceyrə membranı', 'Cell membrane', 'Клеточная мембрана'),
  (10, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Diffuziya, osmos və aktiv nəql', 'Diffusion, osmosis and active transport', 'Диффузия, осмос и активный транспорт'),
  (10, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'İrsiyyət qanunauyğunluqları', 'Patterns of heredity', 'Закономерности наследственности'),
  (10, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Gen ekspressiyası', 'Gene expression', 'Экспрессия генов'),
  (10, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Zülal sintezi', 'Protein synthesis', 'Синтез белка'),
  (10, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'İrsi dəyişkənlik', 'Hereditary variation', 'Наследственная изменчивость'),
  (10, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Ekosistemlərin təhlili', 'Analysis of ecosystems', 'Анализ экосистем'),
  (10, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Bioloji müxtəliflik', 'Biodiversity', 'Биоразнообразие'),
  (10, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Bioloji müxtəlifliyin mühafizəsi', 'Biodiversity conservation', 'Сохранение биоразнообразия'),
  (10, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Populyasiyada dəyişkənliyin genetik əsasları', 'Genetic basis of variation in a population', 'Генетические основы изменчивости в популяции'),
  (10, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Yoluxucu xəstəliklər', 'Infectious diseases', 'Инфекционные заболевания'),
  (10, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'İmmunitet mexanizmi', 'Mechanism of immunity', 'Механизм иммунитета'),
  (10, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Aktiv və passiv immunitet', 'Active and passive immunity', 'Активный и пассивный иммунитет'),
  (10, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Peyvənd', 'Vaccination', 'Вакцинация'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Rastr informasiyanın kodlaşdırılması', 'Encoding raster information', 'Кодирование растровой информации'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Rəng dərinliyi və RGB', 'Color depth and RGB', 'Глубина цвета и RGB'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Səs və videoinformasiyanın həcmi', 'Amount of audio and video information', 'Объём звуковой и видеоинформации'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Relyasiyalı verilənlər bazası', 'Relational database', 'Реляционная база данных'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'SQL', 'SQL', 'SQL'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'CREATE, INSERT, UPDATE və DELETE sorğuları', 'CREATE, INSERT, UPDATE and DELETE queries', 'Запросы CREATE, INSERT, UPDATE и DELETE'),
  (10, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Kompüterlərin nəsilləri', 'Computer generations', 'Поколения компьютеров'),
  (10, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüter şəbəkəsinin layihələndirilməsi', 'Designing a computer network', 'Проектирование компьютерной сети'),
  (10, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Tətbiqi, sistem və aparat təminatı', 'Application, system and hardware components', 'Прикладное, системное и аппаратное обеспечение'),
  (10, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Kompüter modeli', 'Computer model', 'Компьютерная модель'),
  (10, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Məntiq cəbri', 'Boolean algebra', 'Алгебра логики'),
  (10, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Məntiqi ifadələr və doğruluq cədvəli', 'Logical expressions and truth table', 'Логические выражения и таблица истинности'),
  (10, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Blok-sxem və psevdokod', 'Flowchart and pseudocode', 'Блок-схема и псевдокод'),
  (10, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Seçməli və qabarcıqlı çeşidləmə', 'Selection sort and bubble sort', 'Сортировка выбором и пузырьковая сортировка'),
  (10, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Alqoritmin effektivliyi və korrektliyi', 'Algorithm efficiency and correctness', 'Эффективность и корректность алгоритма'),
  (10, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Abstraksiya', 'Abstraction', 'Абстракция'),
  (10, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Lokal, qlobal və formal dəyişənlər', 'Local, global and formal variables', 'Локальные, глобальные и формальные переменные'),
  (10, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Sətir, siyahı, massiv, stek, növbə və lüğət', 'String, list, array, stack, queue and dictionary', 'Строка, список, массив, стек, очередь и словарь'),
  (10, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Fayllarla iş', 'Working with files', 'Работа с файлами'),
  (10, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Verilənlər bazasının proqramlaşdırılması', 'Database programming', 'Программирование баз данных'),
  (10, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Qrafik kitabxanalar', 'Graphics libraries', 'Графические библиотеки'),
  (10, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Rekursiya', 'Recursion', 'Рекурсия'),
  (10, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'JavaScript və interaktiv veb-səhifələr', 'JavaScript and interactive web pages', 'JavaScript и интерактивные веб-страницы'),
  (10, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Elektron hökumət', 'E-government', 'Электронное правительство'),
  (10, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Haker hücumları və kibercinayətkarlıq', 'Hacker attacks and cybercrime', 'Хакерские атаки и киберпреступность'),
  (10, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən nitqin məzmununun izahı', 'Explaining the content of listened speech', 'Объяснение содержания прослушанной речи'),
  (10, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Fakt və hadisələrin qruplaşdırılması', 'Grouping facts and events', 'Группировка фактов и событий'),
  (10, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Ümumiləşdirmə', 'Generalization', 'Обобщение'),
  (10, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Fakt və hadisələrin şərhi', 'Interpreting facts and events', 'Интерпретация фактов и событий'),
  (10, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Müxtəlif mövqeli fikirlərə münasibət', 'Attitude toward differing viewpoints', 'Отношение к различным точкам зрения'),
  (10, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Yeni ifadə və terminlərin mənası', 'Meaning of new expressions and terms', 'Значение новых выражений и терминов'),
  (10, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mətnin məzmununa uyğun intonasiya', 'Intonation appropriate to the content of a text', 'Интонация, соответствующая содержанию текста'),
  (10, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Müxtəlif üslublu mətnlərin fərqləndirilməsi', 'Distinguishing texts of different styles', 'Различение текстов разных стилей'),
  (10, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Fakt və hadisələrin təhlili', 'Analysis of facts and events', 'Анализ фактов и событий'),
  (10, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Yazının redaktə edilməsi', 'Editing written work', 'Редактирование письменного текста'),
  (10, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Mülahizə', 'Statement', 'Высказывание'),
  (10, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Cümlə və abzasların əlaqələndirilməsi', 'Linking sentences and paragraphs', 'Связывание предложений и абзацев'),
  (10, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Hesabat', 'Report', 'Отчёт'),
  (10, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Çıxış', 'Speech', 'Выступление'),
  (10, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Çoxluqlar cəbri', 'Set algebra', 'Алгебра множеств'),
  (10, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Sayma prinsipləri', 'Counting principles', 'Принципы подсчёта'),
  (10, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Permutasiya və kombinasiya', 'Permutations and combinations', 'Перестановки и сочетания'),
  (10, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Triqonometrik eyniliklərin əsaslandırılması', 'Justification of trigonometric identities', 'Обоснование тригонометрических тождеств'),
  (10, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Funksiyaların müqayisəsi', 'Comparing functions', 'Сравнение функций'),
  (10, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Məntiq cəbri və doğruluq cədvəlləri', 'Boolean algebra and truth tables', 'Алгебра логики и таблицы истинности'),
  (10, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Məntiqi ifadələrin sadələşdirilməsi', 'Simplifying logical expressions', 'Упрощение логических выражений'),
  (10, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Blok-sxem və psevdokod', 'Flowchart and pseudocode', 'Блок-схема и псевдокод'),
  (10, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Çeşidləmə alqoritmləri', 'Sorting algorithms', 'Алгоритмы сортировки'),
  (10, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Alqoritmin korrektliyi', 'Algorithm correctness', 'Корректность алгоритма'),
  (10, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Alqoritmin effektivliyi', 'Algorithm efficiency', 'Эффективность алгоритма'),
  (10, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Abstraksiya', 'Abstraction', 'Абстракция'),
  (10, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Rekursiv düşüncə', 'Recursive thinking', 'Рекурсивное мышление'),
  (10, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'SQL sorğularında məntiqi şərtlər', 'Logical conditions in SQL queries', 'Логические условия в SQL-запросах'),
  (11, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kompleks ədəd', 'Complex number', 'Комплексное число'),
  (11, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Xəyali vahid', 'Imaginary unit', 'Мнимая единица'),
  (11, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kompleks ədədin cəbri şəkli', 'Algebraic form of a complex number', 'Алгебраическая форма комплексного числа'),
  (11, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kompleks ədədin həndəsi təsviri', 'Geometric representation of a complex number', 'Геометрическое представление комплексного числа'),
  (11, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Qoşma kompleks ədədlər', 'Conjugate complex numbers', 'Сопряжённые комплексные числа'),
  (11, 'Ədədlər və hesab əməlləri', 'Numbers and arithmetic operations', 'Числа и арифметические действия', 'Kompleks ədədin modulu', 'Modulus of a complex number', 'Модуль комплексного числа'),
  (11, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Çoxhədlilərin kökləri', 'Roots of polynomials', 'Корни многочленов'),
  (11, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Funksiyanın limiti', 'Limit of a function', 'Предел функции'),
  (11, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Funksiyanın kəsilməzliyi', 'Continuity of a function', 'Непрерывность функции'),
  (11, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Limitin xassələri', 'Properties of limits', 'Свойства пределов'),
  (11, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Törəmə', 'Derivative', 'Производная'),
  (11, 'Kəsrlər, cəbr və funksional əlaqələr', 'Fractions, algebra and functional relationships', 'Дроби, алгебра и функциональные зависимости', 'Törəmənin həndəsi və fiziki mənası', 'Geometric and physical meaning of the derivative', 'Геометрический и физический смысл производной'),
  (11, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Funksiyanın ekstremumları', 'Extrema of a function', 'Экстремумы функции'),
  (11, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Funksiyanın qrafikinin araşdırılması', 'Analysis of the graph of a function', 'Исследование графика функции'),
  (11, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'İbtidai funksiya', 'Antiderivative', 'Первообразная'),
  (11, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Müəyyən və qeyri-müəyyən inteqral', 'Definite and indefinite integral', 'Определённый и неопределённый интеграл'),
  (11, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Nyuton–Leybnis düsturu', 'Newton–Leibniz formula', 'Формула Ньютона–Лейбница'),
  (11, 'Həndəsə və ölçmə', 'Geometry and measurement', 'Геометрия и измерения', 'Fəza koordinat sistemi', 'Spatial coordinate system', 'Пространственная система координат'),
  (11, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fəzada vektorlar', 'Vectors in space', 'Векторы в пространстве'),
  (11, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fırlanma cisimləri', 'Solids of revolution', 'Тела вращения'),
  (11, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Silindr, konus və kürə', 'Cylinder, cone and sphere', 'Цилиндр, конус и сфера'),
  (11, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Fırlanma cisimlərinin səthinin sahəsi və həcmi', 'Surface area and volume of solids of revolution', 'Площадь поверхности и объём тел вращения'),
  (11, 'Məlumatlar, ehtimal və tətbiqi məsələlər', 'Data, probability and applied problems', 'Данные, вероятность и прикладные задачи', 'Tam ehtimal düsturu', 'Law of total probability', 'Формула полной вероятности'),
  (11, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Elektrik sahəsi', 'Electric field', 'Электрическое поле'),
  (11, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Elektrik sahəsinin intensivliyi', 'Electric field strength', 'Напряжённость электрического поля'),
  (11, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Elektrik potensialı və potensiallar fərqi', 'Electric potential and potential difference', 'Электрический потенциал и разность потенциалов'),
  (11, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Kondensator', 'Capacitor', 'Конденсатор'),
  (11, 'Fiziki kəmiyyətlər və mexanika', 'Physical quantities and mechanics', 'Физические величины и механика', 'Elektrik tutumu', 'Capacitance', 'Электрическая ёмкость'),
  (11, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Kondensatorların birləşdirilməsi', 'Connection of capacitors', 'Соединение конденсаторов'),
  (11, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Sabit cərəyan dövrələri', 'Direct-current circuits', 'Цепи постоянного тока'),
  (11, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Yarımkeçiricilər', 'Semiconductors', 'Полупроводники'),
  (11, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Yarımkeçirici cihazlar', 'Semiconductor devices', 'Полупроводниковые приборы'),
  (11, 'Elektrik və maqnit hadisələri', 'Electrical and magnetic phenomena', 'Электрические и магнитные явления', 'Elektromaqnit sahəsinin yüklü zərrəciyə təsiri', 'Effect of an electromagnetic field on a charged particle', 'Воздействие электромагнитного поля на заряженную частицу'),
  (11, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Lorens qüvvəsi', 'Lorentz force', 'Сила Лоренца'),
  (11, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Elektromaqnit induksiyası', 'Electromagnetic induction', 'Электромагнитная индукция'),
  (11, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Faradey qanunu', 'Faraday’s law', 'Закон Фарадея'),
  (11, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Elektromaqnit rəqsləri', 'Electromagnetic oscillations', 'Электромагнитные колебания'),
  (11, 'İstilik, dalğalar və optika', 'Heat, waves and optics', 'Тепловые явления, волны и оптика', 'Kvant fizikası', 'Quantum physics', 'Квантовая физика'),
  (11, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Fotoeffekt', 'Photoelectric effect', 'Фотоэффект'),
  (11, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Foton', 'Photon', 'Фотон'),
  (11, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Astrofizika', 'Astrophysics', 'Астрофизика'),
  (11, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Ulduzlar və qalaktikalar', 'Stars and galaxies', 'Звёзды и галактики'),
  (11, 'Atom, nüvə və müasir fizika', 'Atomic, nuclear and modern physics', 'Атомная, ядерная и современная физика', 'Kosmologiya', 'Cosmology', 'Космология'),
  (11, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Karbohidrogenlər', 'Hydrocarbons', 'Углеводороды'),
  (11, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Alkanlar', 'Alkanes', 'Алканы'),
  (11, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Alkenlər', 'Alkenes', 'Алкены'),
  (11, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Alkinlər', 'Alkynes', 'Алкины'),
  (11, 'Maddələr, elementlər və quruluş', 'Substances, elements and structure', 'Вещества, элементы и строение', 'Tsikloalkanlar', 'Cycloalkanes', 'Циклоалканы'),
  (11, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Aromatik karbohidrogenlər', 'Aromatic hydrocarbons', 'Ароматические углеводороды'),
  (11, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Karbohidrogenlərin adlandırılması və reaksiyaları', 'Nomenclature and reactions of hydrocarbons', 'Номенклатура и реакции углеводородов'),
  (11, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Oksigenli üzvi birləşmələr', 'Oxygen-containing organic compounds', 'Кислородсодержащие органические соединения'),
  (11, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Spirtlər', 'Alcohols', 'Спирты'),
  (11, 'Kimyəvi reaksiyalar və hesablamalar', 'Chemical reactions and calculations', 'Химические реакции и расчёты', 'Aldehid və ketonlar', 'Aldehydes and ketones', 'Альдегиды и кетоны'),
  (11, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Karbon turşuları və mürəkkəb efirlər', 'Carboxylic acids and esters', 'Карбоновые кислоты и сложные эфиры'),
  (11, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Polimerlər', 'Polymers', 'Полимеры'),
  (11, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Polimerlərin xassələri və tətbiqi', 'Properties and applications of polymers', 'Свойства и применение полимеров'),
  (11, 'Birləşmələr, məhlullar və xassələr', 'Compounds, solutions and properties', 'Соединения, растворы и свойства', 'Elektrolitik dissosiasiya', 'Electrolytic dissociation', 'Электролитическая диссоциация'),
  (11, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Hidroliz', 'Hydrolysis', 'Гидролиз'),
  (11, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Oksidləşmə-reduksiya reaksiyaları', 'Oxidation-reduction reactions', 'Окислительно-восстановительные реакции'),
  (11, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Elektroliz', 'Electrolysis', 'Электролиз'),
  (11, 'Üzvi kimya və tətbiqi proseslər', 'Organic chemistry and applied processes', 'Органическая химия и прикладные процессы', 'Elektrolizə aid hesablamalar', 'Calculations involving electrolysis', 'Расчёты по электролизу'),
  (11, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Energetik mübadilə', 'Energy metabolism', 'Энергетический обмен'),
  (11, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'ATF', 'ATP', 'АТФ'),
  (11, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Qlikoliz', 'Glycolysis', 'Гликолиз'),
  (11, 'Hüceyrə və təşkil səviyyələri', 'Cell and levels of organization', 'Клетка и уровни организации', 'Hüceyrə tənəffüsü', 'Cellular respiration', 'Клеточное дыхание'),
  (11, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Fotosintezin işıq və qaranlıq mərhələləri', 'Light-dependent and light-independent stages of photosynthesis', 'Световая и темновая стадии фотосинтеза'),
  (11, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Nəzarət və tənzimləmə mexanizmləri', 'Control and regulation mechanisms', 'Механизмы контроля и регуляции'),
  (11, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Biotexnologiya', 'Biotechnology', 'Биотехнология'),
  (11, 'Orqanizmlərdə həyat prosesləri', 'Life processes in organisms', 'Жизненные процессы в организмах', 'Gen mühəndisliyi', 'Genetic engineering', 'Генная инженерия'),
  (11, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Heyvan və bitkilərin klonlaşdırılması', 'Cloning of animals and plants', 'Клонирование животных и растений'),
  (11, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Ətraf mühitin mühafizəsi', 'Environmental protection', 'Охрана окружающей среды'),
  (11, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Təbii seçmə və təkamül', 'Natural selection and evolution', 'Естественный отбор и эволюция'),
  (11, 'İrsiyyət, çoxalma və inkişaf', 'Heredity, reproduction and development', 'Наследственность, размножение и развитие', 'Süni seçmə', 'Artificial selection', 'Искусственный отбор'),
  (11, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Dərmanlar', 'Medicines', 'Лекарственные средства'),
  (11, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Antibiotiklər', 'Antibiotics', 'Антибиотики'),
  (11, 'Ekologiya, sağlamlıq və biotexnologiya', 'Ecology, health and biotechnology', 'Экология, здоровье и биотехнология', 'Dərmanlardan düzgün istifadə', 'Proper use of medicines', 'Правильное применение лекарственных средств'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'İnformasiyanın miqdarı', 'Quantity of information', 'Количество информации'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Məzmun və əlifba yanaşması', 'Content-based and alphabet-based approaches', 'Содержательный и алфавитный подходы'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Hartli və Şennon düsturları', 'Hartley and Shannon formulas', 'Формулы Хартли и Шеннона'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Ədədi orta', 'Arithmetic mean', 'Среднее арифметическое'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Median', 'Median', 'Медиана'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Moda', 'Mode', 'Мода'),
  (11, 'İnformasiya və kompüter sistemləri', 'Information and computer systems', 'Информация и компьютерные системы', 'Ağıllı ev', 'Smart home', 'Умный дом'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Ağıllı şəhər', 'Smart city', 'Умный город'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Əşyaların interneti', 'Internet of Things', 'Интернет вещей'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Sensorlar və NFC', 'Sensors and NFC', 'Датчики и NFC'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Robot sistemləri', 'Robotic systems', 'Робототехнические системы'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Əməliyyat sistemlərinin təsnifatı', 'Classification of operating systems', 'Классификация операционных систем'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Reqressiya modeli', 'Regression model', 'Регрессионная модель'),
  (11, 'Rəqəmsal alətlər, media və verilənlər', 'Digital tools, media and data', 'Цифровые инструменты, медиа и данные', 'Trend əyrisi', 'Trend line', 'Линия тренда'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'İkilik axtarış', 'Binary search', 'Двоичный поиск'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Öncə-dərinliyinə axtarış — DFS', 'Depth-first search — DFS', 'Поиск в глубину — DFS'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Öncə-eninə axtarış — BFS', 'Breadth-first search — BFS', 'Поиск в ширину — BFS'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Proqramın təhlili və layihələndirilməsi', 'Software analysis and design', 'Анализ и проектирование программ'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Proqram təminatı layihəsi', 'Software project', 'Проект программного обеспечения'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Proqram təminatının sənədləşdirilməsi', 'Software documentation', 'Документирование программного обеспечения'),
  (11, 'Alqoritmlər və proqramlaşdırma', 'Algorithms and programming', 'Алгоритмы и программирование', 'Obyekt-yönlü proqramlaşdırma', 'Object-oriented programming', 'Объектно-ориентированное программирование'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Sinif, obyekt, xassə və metod', 'Class, object, property and method', 'Класс, объект, свойство и метод'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Veb-server, domen və hostinq', 'Web server, domain and hosting', 'Веб-сервер, домен и хостинг'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Veb-saytın qiymətləndirilməsi', 'Website evaluation', 'Оценка веб-сайта'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Proqram kodunun keyfiyyəti', 'Code quality', 'Качество программного кода'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Proqramlaşdırma dillərinin müqayisəsi', 'Comparing programming languages', 'Сравнение языков программирования'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Kriptovalyuta', 'Cryptocurrency', 'Криптовалюта'),
  (11, 'Şəbəkə, təhlükəsizlik və yeni texnologiyalar', 'Networks, security and new technologies', 'Сети, безопасность и новые технологии', 'Proqram təminatı piratçılığı və müəlliflik hüququ', 'Software piracy and copyright', 'Пиратство программного обеспечения и авторское право'),
  (11, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən məlumat üzrə təqdimat', 'Presentation based on listened information', 'Презентация по прослушанной информации'),
  (11, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Dinlənilən mətnin qiymətləndirilməsi', 'Evaluating a listened text', 'Оценка прослушанного текста'),
  (11, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Fakt və hadisələrə münasibət', 'Attitude toward facts and events', 'Отношение к фактам и событиям'),
  (11, 'Dinləyib-anlama', 'Listening comprehension', 'Аудирование и понимание речи', 'Müxtəlif mövqeli fikirlərin ümumiləşdirilməsi', 'Summarizing differing viewpoints', 'Обобщение различных точек зрения'),
  (11, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Əsaslandırılmış nitq', 'Reasoned speech', 'Аргументированная речь'),
  (11, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Yeni ifadə və terminlərin kontekstə uyğun mənası', 'Context-appropriate meaning of new expressions and terms', 'Контекстуальное значение новых выражений и терминов'),
  (11, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Müxtəlif üslublu mətnlərin düzgün oxunması', 'Correct reading of texts in different styles', 'Правильное чтение текстов разных стилей'),
  (11, 'Danışma və qarşılıqlı ünsiyyət', 'Speaking and interaction', 'Говорение и взаимодействие', 'Mətnlərin məzmununun şərhi', 'Interpreting the content of texts', 'Интерпретация содержания текстов'),
  (11, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Fakt və hadisələrin real həyatla əlaqələndirilməsi', 'Relating facts and events to real life', 'Связывание фактов и событий с реальной жизнью'),
  (11, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Özünün və başqasının yazısının təkmilləşdirilməsi', 'Improving one’s own and another person’s writing', 'Совершенствование собственного и чужого письменного текста'),
  (11, 'Oxu və mətnlə iş', 'Reading and text work', 'Чтение и работа с текстом', 'Müxtəlif üslublu yazılar', 'Writing in different styles', 'Тексты разных стилей'),
  (11, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Orfoqrafiya, qrammatika və durğu işarələri', 'Spelling, grammar and punctuation', 'Орфография, грамматика и пунктуация'),
  (11, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Layihə', 'Project', 'Проект'),
  (11, 'Yazı və dil qaydaları', 'Writing and language rules', 'Письмо и языковые правила', 'Təqdimat', 'Presentation', 'Презентация'),
  (11, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Kompleks ədədlər üzərində mühakimə', 'Reasoning with complex numbers', 'Рассуждение с комплексными числами'),
  (11, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Çoxhədlinin köklərinin araşdırılması', 'Investigating the roots of a polynomial', 'Исследование корней многочлена'),
  (11, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Limit və sonsuz proseslər', 'Limits and infinite processes', 'Пределы и бесконечные процессы'),
  (11, 'Təsnifat və qanunauyğunluqlar', 'Classification and patterns', 'Классификация и закономерности', 'Törəmə vasitəsilə funksiyanın araşdırılması', 'Investigating a function using derivatives', 'Исследование функции с помощью производной'),
  (11, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Ekstremum və optimallaşdırma', 'Extrema and optimization', 'Экстремумы и оптимизация'),
  (11, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Ehtimal və statistik nəticəçıxarma', 'Probability and statistical inference', 'Вероятность и статистический вывод'),
  (11, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'Reqressiya və proqnozlaşdırma', 'Regression and forecasting', 'Регрессия и прогнозирование'),
  (11, 'Əlaqələr və modelləşdirmə', 'Relationships and modeling', 'Связи и моделирование', 'İkilik axtarış', 'Binary search', 'Двоичный поиск'),
  (11, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'DFS və BFS alqoritmləri', 'DFS and BFS algorithms', 'Алгоритмы DFS и BFS'),
  (11, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Alqoritmlərin müqayisəsi', 'Comparing algorithms', 'Сравнение алгоритмов'),
  (11, 'Alqoritmik düşüncə', 'Algorithmic thinking', 'Алгоритмическое мышление', 'Proqram kodunun korrektliyi və keyfiyyəti', 'Correctness and quality of program code', 'Корректность и качество программного кода'),
  (11, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Obyekt-yönlü düşüncə', 'Object-oriented thinking', 'Объектно-ориентированное мышление'),
  (11, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Məlumatlardan etik istifadə', 'Ethical use of data', 'Этичное использование данных'),
  (11, 'Məntiqi nəticə və problem həlli', 'Logical reasoning and problem solving', 'Логические выводы и решение задач', 'Müəlliflik hüququ və rəqəmsal məsuliyyət', 'Copyright and digital responsibility', 'Авторское право и цифровая ответственность');

-- -----------------------------------------------------------------------------
-- E2. Assert the staged payload BEFORE touching anything.
-- -----------------------------------------------------------------------------
do $$
declare
  v_rows   int;
  v_topics int;
  v_subs   int;
  v_bad    text;
begin
  select count(*) into v_rows from _curriculum_tr_2026;
  select count(*) into v_topics
    from (select distinct grade_level, topic_az from _curriculum_tr_2026) t;
  select count(*) into v_subs
    from (select distinct grade_level, topic_az, subtopic_az from _curriculum_tr_2026) s;

  -- Shape of the payload: catches a truncated or double-pasted VALUES block
  -- before a single row is written to a real table.
  if v_rows <> 1077 then
    raise exception 'curriculum translations: staged % row(s), expected 1077 — the VALUES block is not intact', v_rows;
  end if;
  if v_topics <> 260 then
    raise exception 'curriculum translations: staged % distinct topic key(s), expected 260', v_topics;
  end if;
  if v_subs <> 1077 then
    raise exception 'curriculum translations: staged % distinct subtopic key(s), expected 1077', v_subs;
  end if;

  -- One AZ key must resolve to exactly ONE (en, ru) pair, or the write below
  -- would be order-dependent — the same topic would get a different English
  -- name depending on which row happened to win.
  select string_agg(format('%s/%s', grade_level, topic_az), '; ') into v_bad
  from (select grade_level, topic_az from _curriculum_tr_2026
         group by 1, 2 having count(distinct topic_en || chr(1) || topic_ru) > 1) x;
  if v_bad is not null then
    raise exception 'curriculum translations: topic key(s) carry conflicting en/ru: %', v_bad;
  end if;

  select string_agg(format('%s/%s/%s', grade_level, topic_az, subtopic_az), '; ') into v_bad
  from (select grade_level, topic_az, subtopic_az from _curriculum_tr_2026
         group by 1, 2, 3 having count(distinct subtopic_en || chr(1) || subtopic_ru) > 1) x;
  if v_bad is not null then
    raise exception 'curriculum translations: subtopic key(s) carry conflicting en/ru: %', v_bad;
  end if;

  -- No blank translation may reach the tables (ck_*_name_not_blank would raise
  -- anyway; this names the offending row instead of a constraint code).
  if exists (select 1 from _curriculum_tr_2026
              where btrim(topic_en) = '' or btrim(topic_ru) = ''
                 or btrim(subtopic_en) = '' or btrim(subtopic_ru) = '') then
    raise exception 'curriculum translations: a staged row has a blank en/ru name';
  end if;

  -- Referenced grade levels must all exist. NEVER skip a row silently.
  select string_agg(distinct c.grade_level::text, ', ') into v_bad
  from _curriculum_tr_2026 c
  where not exists (select 1 from public.grades g where g.level = c.grade_level);
  if v_bad is not null then
    raise exception 'curriculum translations: grade level(s) missing from public.grades: %', v_bad;
  end if;

  raise notice 'E2  staged payload verified: % rows / % topic keys / % subtopic keys.',
    v_rows, v_topics, v_subs;
end $$;

-- -----------------------------------------------------------------------------
-- E3. Refuse to run against an ambiguous match key (migration 095's I4 guard).
-- -----------------------------------------------------------------------------
do $$
declare v_dupes text;
begin
  select string_agg(name, '; ') into v_dupes
  from (
    select t.name
    from public.topics t
    where t.scope = 'exam'
    group by t.grade_id, t.name
    having count(*) > 1
  ) x;
  if v_dupes is not null then
    raise exception
      'curriculum translations: duplicate (grade, name) exam topic key(s): %. '
      'Resolve them first — the match would fan out and write one language onto '
      'the wrong row.', v_dupes;
  end if;

  select string_agg(name, '; ') into v_dupes
  from (
    select st.name
    from public.subtopics st
    join public.topics t on t.id = st.topic_id and t.scope = 'exam'
    group by st.topic_id, st.name
    having count(*) > 1
  ) x;
  if v_dupes is not null then
    raise exception
      'curriculum translations: duplicate subtopic name(s) under one exam topic: %. '
      'Resolve them first — the match would fan out.', v_dupes;
  end if;

  raise notice 'E3  match keys are unambiguous.';
end $$;

-- -----------------------------------------------------------------------------
-- E4. Resolve the staged rows onto real ids. scope = 'exam' on every join.
-- -----------------------------------------------------------------------------
drop table if exists _tr_topic_match;
create temporary table _tr_topic_match on commit drop as
select distinct t.id as topic_id, s.topic_en as en, s.topic_ru as ru
from _curriculum_tr_2026 s
join public.grades g on g.level = s.grade_level
join public.topics t
  on t.scope    = 'exam'
 and t.grade_id = g.id
 and t.name     = s.topic_az;

drop table if exists _tr_sub_match;
create temporary table _tr_sub_match on commit drop as
select distinct st.id as subtopic_id, s.subtopic_en as en, s.subtopic_ru as ru
from _curriculum_tr_2026 s
join public.grades g on g.level = s.grade_level
join public.topics t
  on t.scope    = 'exam'
 and t.grade_id = g.id
 and t.name     = s.topic_az
join public.subtopics st
  on st.topic_id = t.id
 and st.name     = s.subtopic_az;

-- -----------------------------------------------------------------------------
-- E5. REPORT the match, then FAIL LOUDLY if it is short.
-- -----------------------------------------------------------------------------
-- A partial backfill is the worst outcome: it leaves a curriculum that is half
-- Azerbaijani in English, and nothing in the app reports it. One edited VALUES
-- line and a rerun is a far cheaper failure, so the unmatched keys are printed
-- (capped) and the transaction is aborted.
do $$
declare
  v_t   int;
  v_s   int;
  v_bad text;
begin
  select count(*) into v_t from _tr_topic_match;
  select count(*) into v_s from _tr_sub_match;
  raise notice 'E5  matched % / 260 topics and % / 1077 subtopics.', v_t, v_s;

  if v_t <> 260 then
    select string_agg(format('g%s: %s', k.grade_level, k.topic_az), E'\n         ')
      into v_bad
    from (
      select distinct s.grade_level, s.topic_az
      from _curriculum_tr_2026 s
      where not exists (
        select 1
        from public.grades g
        join public.topics t
          on t.scope = 'exam' and t.grade_id = g.id and t.name = s.topic_az
        where g.level = s.grade_level)
      order by 1, 2
      limit 20
    ) k;
    raise exception E'curriculum translations: matched % topic(s), expected 260. Unmatched (grade, AZ name), first 20:\n         %',
      v_t, coalesce(v_bad, '(none — the tree has EXTRA exam topics instead)');
  end if;

  if v_s <> 1077 then
    select string_agg(format('g%s / %s / %s', k.grade_level, k.topic_az, k.subtopic_az),
                      E'\n         ')
      into v_bad
    from (
      select distinct s.grade_level, s.topic_az, s.subtopic_az
      from _curriculum_tr_2026 s
      where not exists (
        select 1
        from public.grades g
        join public.topics t
          on t.scope = 'exam' and t.grade_id = g.id and t.name = s.topic_az
        join public.subtopics st
          on st.topic_id = t.id and st.name = s.subtopic_az
        where g.level = s.grade_level)
      order by 1, 2, 3
      limit 20
    ) k;
    raise exception E'curriculum translations: matched % subtopic(s), expected 1077. Unmatched (grade, topic, subtopic), first 20:\n         %',
      v_s, coalesce(v_bad, '(none — the tree has EXTRA exam subtopics instead)');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- E6. Write. Idempotent: a rerun updates only rows whose text actually changed
--     (the `is distinct from` filter keeps updated_at meaningful).
-- -----------------------------------------------------------------------------
insert into public.topic_translations as tt (topic_id, locale, name)
select x.topic_id, x.locale, x.name from (
  select topic_id, 'en'::public.content_locale as locale, en as name from _tr_topic_match
  union all
  select topic_id, 'ru'::public.content_locale, ru from _tr_topic_match
) x
on conflict (topic_id, locale) do update
   set name = excluded.name, updated_at = now()
 where tt.name is distinct from excluded.name;

insert into public.subtopic_translations as st (subtopic_id, locale, name)
select x.subtopic_id, x.locale, x.name from (
  select subtopic_id, 'en'::public.content_locale as locale, en as name from _tr_sub_match
  union all
  select subtopic_id, 'ru'::public.content_locale, ru from _tr_sub_match
) x
on conflict (subtopic_id, locale) do update
   set name = excluded.name, updated_at = now()
 where st.name is distinct from excluded.name;

-- =============================================================================
-- F. VERIFY — schema, RLS, coverage, and that NO base-taxonomy row moved
-- =============================================================================
do $verify$
declare
  v_n     int;
  v_topic int;
  v_sub   int;
  v_snap  record;
begin
  -- F1. Both tables exist with RLS on and the two expected policies each.
  if to_regclass('public.topic_translations') is null
     or to_regclass('public.subtopic_translations') is null then
    raise exception 'curriculum translations: a translations table is missing';
  end if;

  select count(*) into v_n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname in ('topic_translations', 'subtopic_translations')
    and c.relrowsecurity;
  if v_n <> 2 then
    raise exception 'curriculum translations: RLS is not enabled on both tables (% of 2)', v_n;
  end if;

  select count(*) into v_n
  from pg_policies
  where schemaname = 'public'
    and tablename in ('topic_translations', 'subtopic_translations');
  if v_n <> 4 then
    raise exception 'curriculum translations: expected 4 policies, found %', v_n;
  end if;

  -- F2. The az guard is real, not documentation.
  if exists (select 1 from public.topic_translations where locale = 'az')
     or exists (select 1 from public.subtopic_translations where locale = 'az') then
    raise exception 'curriculum translations: an az row exists — the base name is the only home for az';
  end if;

  -- F3. Coverage: every matched node carries BOTH en and ru. A half-translated
  --     node renders EN correctly and RU in Azerbaijani, which is the silent
  --     failure this migration exists to prevent.
  select count(*) into v_n
  from (select topic_id from public.topic_translations
         group by topic_id having count(distinct locale) <> 2) x;
  if v_n > 0 then
    raise exception 'curriculum translations: % topic(s) have only one locale', v_n;
  end if;
  select count(*) into v_n
  from (select subtopic_id from public.subtopic_translations
         group by subtopic_id having count(distinct locale) <> 2) x;
  if v_n > 0 then
    raise exception 'curriculum translations: % subtopic(s) have only one locale', v_n;
  end if;

  select count(distinct topic_id)    into v_topic from public.topic_translations;
  select count(distinct subtopic_id) into v_sub   from public.subtopic_translations;
  if v_topic < 260 then
    raise exception 'curriculum translations: only % topic(s) translated, expected >= 260', v_topic;
  end if;
  if v_sub < 1077 then
    raise exception 'curriculum translations: only % subtopic(s) translated, expected >= 1077', v_sub;
  end if;

  -- F4. NOTHING in the base taxonomy moved: same row counts AND the same set of
  --     ids as before the backfill started.
  select * into v_snap from _curriculum_tr_snapshot;
  if (select count(*) from public.topics t where t.scope = 'exam') <> v_snap.topic_count
     or (select md5(coalesce(string_agg(t.id::text, ',' order by t.id), ''))
           from public.topics t where t.scope = 'exam') is distinct from v_snap.topic_digest then
    raise exception 'curriculum translations: the exam TOPIC set changed — this migration must never write to public.topics';
  end if;
  if (select count(*) from public.subtopics st
        join public.topics t on t.id = st.topic_id where t.scope = 'exam') <> v_snap.subtopic_count
     or (select md5(coalesce(string_agg(st.id::text, ',' order by st.id), ''))
           from public.subtopics st
           join public.topics t on t.id = st.topic_id
          where t.scope = 'exam') is distinct from v_snap.subtopic_digest then
    raise exception 'curriculum translations: the exam SUBTOPIC set changed — this migration must never write to public.subtopics';
  end if;

  -- F5. The three RPCs exist at the NEW signatures with the right grant posture,
  --     and the old arities are gone (an ambiguous overload would break every
  --     existing caller with "function is not unique").
  if to_regprocedure('public.test_attempt_result(uuid, text)') is null
     or to_regprocedure('public.submit_test_attempt(uuid, jsonb, text)') is null
     or to_regprocedure('public.get_child_subject_dashboard(uuid, uuid, int, text, text)') is null then
    raise exception 'curriculum translations: an RPC is missing at its new signature';
  end if;
  if to_regprocedure('public.test_attempt_result(uuid)') is not null
     or to_regprocedure('public.submit_test_attempt(uuid, jsonb)') is not null
     or to_regprocedure('public.get_child_subject_dashboard(uuid, uuid, int, text)') is not null then
    raise exception 'curriculum translations: an OLD RPC arity survived — calls would fail as ambiguous';
  end if;
  if has_function_privilege('anon', 'public.get_child_subject_dashboard(uuid, uuid, int, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.test_attempt_result(uuid, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.submit_test_attempt(uuid, jsonb, text)', 'EXECUTE') then
    raise exception 'curriculum translations: RPC grant posture is wrong after the recreate';
  end if;

  raise notice 'F   verified: % topics / % subtopics translated into en+ru; base taxonomy untouched (% topics / % subtopics); RPCs re-granted at their new signatures.',
    v_topic, v_sub, v_snap.topic_count, v_snap.subtopic_count;
end $verify$;

commit;

-- =============================================================================
-- End of 2026_08_15_114_curriculum_translations.sql
-- =============================================================================
