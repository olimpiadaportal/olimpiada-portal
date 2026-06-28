-- ============================================================================
-- Migration 28: Fix infinite RLS recursion on students/bookings
--
-- Root cause:
--   students policy  → subqueries bookings  → triggers bookings RLS
--   bookings policy  → subqueries students  → triggers students RLS
--   → infinite recursion
--
-- Solution:
--   1. Drop the recursive "Teachers can view students in their bookings" policy
--      added in migration 27.
--   2. Add student_user_id + teacher_user_id columns to bookings (denormalized).
--   3. Backfill those columns from existing data.
--   4. Add a trigger to keep them in sync on INSERT/UPDATE.
--   5. Rewrite bookings RLS policies to use auth.uid() directly against
--      the new columns — no cross-table subqueries, no recursion.
--   6. Add a students SELECT policy for teachers that uses bookings.student_user_id
--      (not a subquery back into students), breaking the cycle.
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop the recursive policy from migration 27
-- ============================================================================
DROP POLICY IF EXISTS "Teachers can view students in their bookings" ON students;

-- ============================================================================
-- STEP 2: Add denormalized user_id columns to bookings
-- ============================================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS student_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 3: Backfill from existing students/teachers rows
-- ============================================================================
UPDATE public.bookings b
SET
  student_user_id = s.user_id,
  teacher_user_id = t.user_id
FROM public.students s, public.teachers t
WHERE b.student_id = s.id
  AND b.teacher_id = t.id;

-- ============================================================================
-- STEP 4: Trigger to auto-populate on INSERT / UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bookings_sync_user_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT user_id INTO NEW.student_user_id FROM students WHERE id = NEW.student_id;
  SELECT user_id INTO NEW.teacher_user_id FROM teachers WHERE id = NEW.teacher_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_sync_user_ids ON public.bookings;
CREATE TRIGGER trg_bookings_sync_user_ids
  BEFORE INSERT OR UPDATE OF student_id, teacher_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_sync_user_ids();

-- ============================================================================
-- STEP 5: Rewrite bookings RLS policies — auth.uid() directly, no subqueries
-- ============================================================================
DROP POLICY IF EXISTS "Students can view own bookings"  ON bookings;
DROP POLICY IF EXISTS "Students can create bookings"    ON bookings;
DROP POLICY IF EXISTS "Users can update own bookings"   ON bookings;

-- SELECT: student or teacher of the booking
CREATE POLICY "Users can view own bookings" ON bookings
  FOR SELECT TO authenticated
  USING (
    student_user_id = auth.uid()
    OR teacher_user_id = auth.uid()
  );

-- INSERT: only the student themselves (student_user_id populated by trigger)
CREATE POLICY "Students can create bookings" ON bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- UPDATE: student or teacher of the booking
CREATE POLICY "Users can update own bookings" ON bookings
  FOR UPDATE TO authenticated
  USING (
    student_user_id = auth.uid()
    OR teacher_user_id = auth.uid()
  );

-- ============================================================================
-- STEP 6: Allow teachers to read student rows for their bookings
--         Uses bookings.student_user_id — no recursion back into students
-- ============================================================================
CREATE POLICY "Teachers can view students in their bookings" ON students
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT student_user_id FROM bookings
      WHERE teacher_user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 7: Index the new columns for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_bookings_student_user_id ON bookings(student_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_teacher_user_id ON bookings(teacher_user_id);

-- ============================================================================
-- STEP 8: Verification
-- ============================================================================
SELECT
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'student_user_id'
  ) AS student_user_id_exists,
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'teacher_user_id'
  ) AS teacher_user_id_exists,
  (SELECT COUNT(*) FROM bookings WHERE student_user_id IS NOT NULL) AS backfilled_rows,
  EXISTS(
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bookings' AND policyname = 'Users can view own bookings'
  ) AS new_bookings_policy_exists,
  EXISTS(
    SELECT 1 FROM pg_policies
    WHERE tablename = 'students' AND policyname = 'Teachers can view students in their bookings'
  ) AS teacher_student_policy_exists;
-- Expected: true, true, >0, true, true
