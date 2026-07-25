-- =============================================================================
-- 2026_07_25_084_mandatory_term.sql
-- =============================================================================
-- Round 39: DB-level mandatory Rüb (term) for the GENERAL question bank.
--
-- The authoring flows are already strict (manual form: term inherited from the
-- topic or a required 1..4 pick; bulk import: per-row meta.term validated, and
-- from this round a mandatory GLOBAL modal term is injected into every row).
-- This migration adds the DATABASE backstop the owner asked for — adapted to
-- the live data model instead of a literal NOT NULL because:
--   * 74 legacy general-bank rows have NULL term (the "needs term" review
--     queue; terms must be assigned by humans, never invented), and a
--     NOT VALID check would still re-fire on EVERY update, breaking their
--     status transitions/review workflow;
--   * 201 olympiad pool questions carry NULL term BY DESIGN (Round 21:
--     olympiad imports have optional taxonomy; the pool must stay exempt).
--
-- The guard therefore fires on INSERT (a new bank question can never be
-- created termless) and on UPDATE OF term (a term can never be stripped),
-- while legacy rows keep transitioning until they are reviewed. The 1..4
-- range is already enforced by chk on questions.term (migration 054), and
-- topics/subtopics already carry term columns with the same check.
--
-- Also adds the (subject_id, grade_id, term) partial index over the published
-- general bank — the exact daily-round draw predicate.
--
-- Rerun-safe: yes. Backports: 011 (guard + index), 013 (check #82).
-- =============================================================================

-- Guard v2: EXTENDS migration 054's question_term_guard (same function/trigger
-- names — the inheritance/mismatch rules are preserved verbatim) with the
-- Round-39 requirement appended after inheritance resolves.
create or replace function public.question_term_guard()
returns trigger
language plpgsql
as $$
declare v_topic_term smallint;
begin
  -- Migration 054: inherit the topic's term when omitted; a set term must
  -- match the topic's term (the tree stays consistent).
  if new.topic_id is not null then
    select term into v_topic_term from public.topics where id = new.topic_id;
    if new.term is null then
      new.term := v_topic_term;
    elsif v_topic_term is not null and new.term <> v_topic_term then
      raise exception 'question: term must match the topic (%)', v_topic_term
        using errcode = 'check_violation';
    end if;
  end if;
  -- Round 39: after inheritance, a GENERAL-bank question can never end up
  -- termless — no new bank question without a Rüb, and a term can never be
  -- stripped. Olympiad pool rows stay exempt (optional taxonomy by design);
  -- legacy NULL-term rows keep transitioning (this fires only on INSERT or
  -- UPDATE OF term/topic_id) until the review queue assigns their term.
  if new.olympiad_package_id is null and new.term is null then
    raise exception 'question: term (Rüb 1-4) is required for bank questions'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_question_term_guard on public.questions;
create trigger trg_question_term_guard
  before insert or update of term, topic_id on public.questions
  for each row execute function public.question_term_guard();

comment on function public.question_term_guard() is
  'Term guard (054 + Round 39): inherit/match the topic''s term, AND a general-'
  'bank question can never be inserted termless or have its term stripped. '
  'Olympiad pool questions exempt; legacy NULL-term rows transition freely '
  'until reviewed.';

-- Daily-draw index: the pool predicate is (subject, grade, term<=current,
-- published, general bank, 5 options) — cover the equality/range columns.
create index if not exists idx_questions_daily_pool
  on public.questions (subject_id, grade_id, term)
  where status = 'published' and olympiad_package_id is null;

-- =============================================================================
-- End of 2026_07_25_084_mandatory_term.sql
-- =============================================================================
