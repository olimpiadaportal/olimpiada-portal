-- ============================================================================
-- Hotfix 75: Fix mock_exams SELECT policy — add admin bypass
-- ============================================================================
-- Problem: After admin removes the Official stamp from an Elmly-created exam
--          (is_official = FALSE, created_by_teacher = NULL), the SELECT policy
--          blocks even the admin from reading the row → PGRST116 "0 rows".
-- Fix: Add an admin bypass clause so admins can always read all exams.
-- ============================================================================

DROP POLICY IF EXISTS "View mock exams" ON mock_exams;

CREATE POLICY "View mock exams"
  ON mock_exams FOR SELECT
  USING (
    -- Admins can always read all exams (bypass for management)
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE)
    -- Official Elmly exams are visible to everyone
    OR is_official = TRUE
    -- Approved teacher exams are visible to authenticated students
    OR (created_by_teacher IS NOT NULL AND is_approved = TRUE AND auth.uid() IS NOT NULL)
    -- Teachers can always see their own exams (even pending)
    OR (created_by_teacher IS NOT NULL AND EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
    ))
  );

NOTIFY pgrst, 'reload schema';
