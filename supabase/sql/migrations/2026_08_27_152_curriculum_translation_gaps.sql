-- =============================================================================
-- 2026_08_27_152 — MAKE UNTRANSLATED CURRICULUM ROWS VISIBLE.
--
-- WHY THIS EXISTS. Between 17 and 27 August 2026, 604 subtopics were created by
-- hand in the admin panel while the content team prepared bulk question uploads.
-- All 604 sit under topics that ARE in the approved curriculum, and they are
-- ordinary, sensible structure — the document's subtopic list was simply too
-- coarse to file ~4,000 questions against.
--
-- Not one of them has an English or Russian name.
--
-- That is not carelessness, it is the UI: a subtopic is CREATED with its
-- Azerbaijani name, and its translations are added later through a separate
-- edit form. Nothing ever said how many rows were still waiting, so the gap grew
-- to 604 in ten days without appearing anywhere. On a trilingual platform an
-- untranslated heading is eventually shown, in Azerbaijani, to a family reading
-- in Russian.
--
-- The fix is not a constraint. Requiring all three languages at creation would
-- stop the content team working the way they actually work — write the structure
-- first in Azerbaijani, translate in a pass afterwards. What was missing is the
-- NUMBER. This function supplies it so the Curriculum page can show it, and so a
-- future gap is noticed at 6 rows instead of 604.
--
-- Counts `en` only. `uq_topic_locale` / `uq_subtopic_locale` make (row, locale)
-- unique, and both languages are written together by the same form, so an `en`
-- row missing means the pair is missing. Counting both would double-report the
-- same gap.
--
-- STABLE and read-only. Guarded like the question-bank stats it sits beside:
-- Administrator OR content.review, the same audience allowed to edit curriculum.
--
-- Self-transacting. Backported verbatim into canonical 011.
-- =============================================================================
begin;

create or replace function public.curriculum_translation_gaps()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_topics    int;
  v_subtopics int;
  v_questions int;
begin
  if not (public.is_admin() or public.has_permission('content.review')) then
    raise exception 'curriculum_translation_gaps: forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*)::int into v_topics
  from public.topics t
  where t.scope = 'exam'
    and t.status <> 'archived'
    and not exists (
      select 1 from public.topic_translations tt
      where tt.topic_id = t.id and tt.locale = 'en'
    );

  -- The subtopic count, and the QUESTIONS behind it. The second number is what
  -- turns "604 rows need translating" into "604 rows carrying 3,958 questions
  -- need translating" — the difference between a chore and a priority.
  select count(*)::int, coalesce(sum(q.n), 0)::int
    into v_subtopics, v_questions
  from public.subtopics st
  join public.topics t on t.id = st.topic_id and t.scope = 'exam'
  join lateral (
    select count(*) as n from public.questions q where q.subtopic_id = st.id
  ) q on true
  where st.status <> 'archived'
    and not exists (
      select 1 from public.subtopic_translations x
      where x.subtopic_id = st.id and x.locale = 'en'
    );

  return jsonb_build_object(
    'topics_missing', v_topics,
    'subtopics_missing', v_subtopics,
    'questions_affected', v_questions);
end;
$$;

comment on function public.curriculum_translation_gaps() is
  'Migration 152: how many exam topics and subtopics still have no en/ru name, '
  'and how many questions sit under them. Exists because 604 subtopics were '
  'created untranslated over ten days in August 2026 and nothing surfaced the '
  'number — the admin UI adds translations in a separate step from creation, '
  'which is the right workflow but leaves a silent backlog. Read-only; guarded '
  'by is_admin() OR content.review.';

revoke all on function public.curriculum_translation_gaps() from public, anon;
grant execute on function public.curriculum_translation_gaps() to authenticated, service_role;

do $$
declare v jsonb;
begin
  if has_function_privilege('anon', 'public.curriculum_translation_gaps()', 'execute') then
    raise exception '152: anon can execute the curriculum gap counter';
  end if;
  select jsonb_build_object(
    'subtopics_missing',
      (select count(*) from public.subtopics st
       join public.topics t on t.id = st.topic_id and t.scope = 'exam'
       where not exists (select 1 from public.subtopic_translations x
                         where x.subtopic_id = st.id and x.locale = 'en'))) into v;
  raise notice '152: curriculum gap counter installed (subtopics missing en: %)',
    v->>'subtopics_missing';
end $$;

commit;
