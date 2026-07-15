-- =============================================================================
-- 2026_07_12_054_academic_terms.sql
-- Round 20 item 7: school TERMS (Rüb 1..4) on the taxonomy + questions, plus
-- the central current-term configuration.
--
-- * topics.term / subtopics.term / questions.term: smallint 1..4, NULLABLE —
--   NULL means "not yet reviewed" (owner rule: NEVER auto-assign terms to
--   existing data; NULL rows are excluded from daily-round generation and
--   surface in the admin review lists). New records are REQUIRED to carry a
--   term (admin forms + bulk import enforce it; triggers keep consistency).
-- * Consistency: a subtopic's term must equal its parent topic's term; a
--   question's term must equal its topic's term (when both sides are set).
--   Enforced by triggers so direct API writes cannot desync them.
-- * Current term lives in system_settings: 'academic.current_term' (1..4,
--   seeded 1) + 'academic.year' (text, seeded '2026-2027') — admin-editable
--   from Settings; daily-round generation reads it server-side and SNAPSHOTS
--   it per round (changing the term later never rewrites existing rounds).
--
-- Backports: 003 (topics/subtopics columns + triggers), 004 (questions.term),
-- 012 (settings seed), 011 (helper), 013 (#63).
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) columns -----------------------------------------------------------------
alter table public.topics
  add column if not exists term smallint check (term between 1 and 4);
alter table public.subtopics
  add column if not exists term smallint check (term between 1 and 4);
alter table public.questions
  add column if not exists term smallint check (term between 1 and 4);

comment on column public.topics.term is
  'School term (Rüb) 1..4 this topic is taught in (migration 054). NULL = legacy row '
  'awaiting manual review; excluded from daily-round generation.';
comment on column public.subtopics.term is
  'Inherited from the parent topic (kept equal by trigger). NULL = legacy/unreviewed.';
comment on column public.questions.term is
  'Derived from the question''s topic (kept equal by trigger). NULL = legacy/unreviewed; '
  'excluded from daily-round generation.';

create index if not exists idx_questions_term on public.questions (term);

-- ---- 2) consistency triggers -------------------------------------------------------
-- Subtopics inherit/must match the parent topic's term.
create or replace function public.subtopic_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  select term into v_topic_term from public.topics where id = new.topic_id;
  if new.term is null then
    new.term := v_topic_term;            -- inherit on insert/update when omitted
  elsif v_topic_term is not null and new.term <> v_topic_term then
    raise exception 'subtopic: term must match the parent topic (%)', v_topic_term
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_subtopic_term_guard on public.subtopics;
create trigger trg_subtopic_term_guard
  before insert or update of term, topic_id on public.subtopics
  for each row execute function public.subtopic_term_guard();

-- Questions inherit/must match their topic's term.
create or replace function public.question_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  if new.topic_id is not null then
    select term into v_topic_term from public.topics where id = new.topic_id;
    if new.term is null then
      new.term := v_topic_term;
    elsif v_topic_term is not null and new.term <> v_topic_term then
      raise exception 'question: term must match the topic (%)', v_topic_term
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_question_term_guard on public.questions;
create trigger trg_question_term_guard
  before insert or update of term, topic_id on public.questions
  for each row execute function public.question_term_guard();

-- Changing a TOPIC's term cascades to its subtopics and questions (keeps the
-- tree consistent; admin edits the topic once).
create or replace function public.topic_term_cascade()
returns trigger
language plpgsql
as $$
begin
  if new.term is distinct from old.term then
    update public.subtopics set term = new.term, updated_at = now()
     where topic_id = new.id and term is distinct from new.term;
    update public.questions set term = new.term, updated_at = now()
     where topic_id = new.id and term is distinct from new.term;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_topic_term_cascade on public.topics;
create trigger trg_topic_term_cascade
  after update of term on public.topics
  for each row execute function public.topic_term_cascade();

-- ---- 3) current-term configuration ---------------------------------------------------
-- (system_settings carries key + value_json only — no description column.)
insert into public.system_settings (key, value_json)
values
  ('academic.current_term', '1'::jsonb),
  ('academic.year', '"2026-2027"'::jsonb)
on conflict (key) do nothing;

-- Helper used by generation + admin readiness checks.
create or replace function public.current_academic_term()
returns smallint
language sql
stable
set search_path = public, pg_temp
as $$
  select least(greatest(coalesce(
           (select nullif(value_json #>> '{}', '')::int
              from public.system_settings where key = 'academic.current_term'), 1), 1), 4)::smallint;
$$;
revoke all on function public.current_academic_term() from public, anon;
grant execute on function public.current_academic_term() to authenticated, service_role;

-- ---- report + self-verify ---------------------------------------------------------
do $$
declare
  v_topics int; v_subs int; v_q int;
begin
  select count(*) from public.topics    where term is null into v_topics;
  select count(*) from public.subtopics where term is null into v_subs;
  select count(*) from public.questions where term is null into v_q;
  raise notice 'term review backlog (NULL term, excluded from generation): % topic(s), % subtopic(s), % question(s).',
    v_topics, v_subs, v_q;
  if public.current_academic_term() not between 1 and 4 then
    raise exception 'current_academic_term out of range';
  end if;
  raise notice 'academic terms self-verify PASS (current term %).', public.current_academic_term();
end $$;

commit;
