-- ============================================================================
-- HOTFIX 89: Fix student_teachers unique constraint + assign_teacher_to_subject
-- Root cause: ON CONFLICT (student_id, subject_id) had no matching constraint —
--             the table only had UNIQUE(student_id, teacher_id, subject_id).
--             PostgreSQL threw an error silently caught by EXCEPTION WHEN OTHERS,
--             returning FALSE and never persisting the teacher assignment.
-- Fix: Drop the 3-column constraint, add 2-column (student_id, subject_id),
--      add updated_at column, and fix the function's conflict target.
-- ============================================================================

-- 1. Add updated_at if missing
ALTER TABLE student_teachers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Drop the old 3-column unique constraint
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'student_teachers'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 3;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE student_teachers DROP CONSTRAINT ' || quote_ident(v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'No 3-column unique constraint found, skipping drop.';
  END IF;
END $$;

-- 3. Remove any duplicate rows (keep newest per student+subject before adding constraint)
DELETE FROM student_teachers a
USING student_teachers b
WHERE a.id < b.id
  AND a.student_id = b.student_id
  AND a.subject_id = b.subject_id;

-- 4. Add the correct 2-column unique constraint
ALTER TABLE student_teachers
  DROP CONSTRAINT IF EXISTS student_teachers_student_id_subject_id_key;

ALTER TABLE student_teachers
  ADD CONSTRAINT student_teachers_student_id_subject_id_key
  UNIQUE (student_id, subject_id);

-- 5. Replace the function with correct conflict target
CREATE OR REPLACE FUNCTION assign_teacher_to_subject(
  p_student_id UUID,
  p_subject_id UUID,
  p_teacher_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO student_teachers (student_id, subject_id, teacher_id, status)
  VALUES (p_student_id, p_subject_id, p_teacher_id, 'active')
  ON CONFLICT (student_id, subject_id)
  DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id,
    status     = 'active',
    updated_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'assign_teacher_to_subject error: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION assign_teacher_to_subject IS 'Assign or update teacher for a subject (one teacher per subject per student)';
