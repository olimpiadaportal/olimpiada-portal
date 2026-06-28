-- ============================================================================
-- 47_stage7_subtopic_analytics.sql
-- Elmly — Stage 7: Subtopics Analytics & AI layer (hotfix for existing DBs)
-- ============================================================================
-- Purpose:  Apply Stage 7 of SUBTOPICS_MIGRATION_PLAN.md to databases that
--           have already run hotfixes 01–46.
--           Adds subtopic-level tracking to competitive mode + new analytics
--           and AI functions for subtopic-level weak area detection.
-- Date:     2026-04-04
-- Stage:    7 of SUBTOPICS_MIGRATION_PLAN.md
-- Prerequisite: hotfix 46_subtopics_migration.sql must have been run.
-- Safe to run multiple times (all operations use IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add subtopic_id to competitive_question_results
-- ============================================================================
-- Nullable FK — backward compatible. Existing rows keep subtopic_id = NULL.
-- Will be populated going forward when practice mode records are matched to
-- questions that have a subtopic_id assigned in the admin panel.

ALTER TABLE competitive_question_results
  ADD COLUMN IF NOT EXISTS subtopic_id UUID;

-- Add FK constraint only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'competitive_question_results'
      AND constraint_name = 'competitive_question_results_subtopic_id_fkey'
  ) THEN
    ALTER TABLE competitive_question_results
      ADD CONSTRAINT competitive_question_results_subtopic_id_fkey
      FOREIGN KEY (subtopic_id) REFERENCES subject_subtopics(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Partial index — only indexes rows that actually have a subtopic assigned
CREATE INDEX IF NOT EXISTS idx_competitive_qr_subtopic_id
  ON competitive_question_results(subtopic_id)
  WHERE subtopic_id IS NOT NULL;

-- ============================================================================
-- STEP 2: get_student_weak_subtopics()
-- ============================================================================
-- Companion to get_student_weak_topics(). Returns subtopics where the student
-- answered at least 3 questions with accuracy < 60%.

CREATE OR REPLACE FUNCTION get_student_weak_subtopics(
  p_student_id UUID,
  p_subject_id UUID,
  p_limit       INTEGER DEFAULT 50
)
RETURNS TABLE (
  subtopic_id       UUID,
  subtopic_name     TEXT,
  topic             TEXT,
  total_questions   INTEGER,
  correct_questions INTEGER,
  accuracy          NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.subtopic_id,
    ss.subtopic_name,
    r.topic,
    COUNT(*)::INTEGER                                                             AS total_questions,
    SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::INTEGER                       AS correct_questions,
    ROUND(
      (SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100,
      2
    )                                                                             AS accuracy
  FROM competitive_question_results r
  JOIN subject_subtopics ss ON ss.id = r.subtopic_id
  WHERE r.student_id  = p_student_id
    AND r.subject_id  = p_subject_id
    AND r.subtopic_id IS NOT NULL
  GROUP BY r.subtopic_id, ss.subtopic_name, r.topic
  HAVING COUNT(*) >= 3
    AND (SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) < 0.60
  ORDER BY accuracy ASC, total_questions DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_weak_subtopics(UUID, UUID, INTEGER) TO authenticated;

-- ============================================================================
-- STEP 3: admin_get_subtopic_performance()
-- ============================================================================
-- Admin analytics: accuracy + attempt counts per subtopic within a subject.
-- Data source: practice_answers from the last 30 days.

CREATE OR REPLACE FUNCTION admin_get_subtopic_performance(p_subject_id UUID)
RETURNS TABLE (
  topic_name       TEXT,
  subtopic_id      UUID,
  subtopic_name    TEXT,
  total_questions  BIGINT,
  total_attempts   BIGINT,
  avg_accuracy     NUMERIC,
  avg_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.topic                                                                      AS topic_name,
    ss.id                                                                        AS subtopic_id,
    ss.subtopic_name,
    COUNT(DISTINCT q.id)                                                         AS total_questions,
    COUNT(pa.id)                                                                 AS total_attempts,
    ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END)::NUMERIC, 1)     AS avg_accuracy,
    ROUND(AVG(pa.time_spent)::NUMERIC, 1)                                        AS avg_time_seconds
  FROM subject_subtopics ss
  JOIN  questions q         ON q.subtopic_id  = ss.id
  LEFT JOIN practice_answers pa ON pa.question_id = q.id
    AND pa.created_at >= NOW() - INTERVAL '30 days'
  WHERE ss.subject_id = p_subject_id
    AND ss.is_active   = true
  GROUP BY q.topic, ss.id, ss.subtopic_name
  ORDER BY q.topic, ss.subtopic_name;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_subtopic_performance(UUID) TO authenticated;

-- ============================================================================
-- Done
-- ============================================================================
-- Summary of changes applied to existing database:
--   ✓ competitive_question_results.subtopic_id (nullable UUID FK) added
--   ✓ partial index idx_competitive_qr_subtopic_id created
--   ✓ get_student_weak_subtopics() function created
--   ✓ admin_get_subtopic_performance() function created
-- ============================================================================

COMMIT;
