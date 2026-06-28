-- Hotfix 100: Authenticated student profile-safe field update RPC
-- Date: 2026-06-04
--
-- Problem:
--   Mobile Edit Profile updates `profiles` successfully, then directly updates
--   `students.city`, `students.target_group`, `students.target_university`, and
--   `students.graduation_year`. The students table intentionally has strict RLS
--   that protects scoring/leaderboard columns, and some live rows can fail the
--   direct UPDATE with:
--     42501 new row violates row-level security policy for table "students"
--
-- Fix:
--   Move the safe role-specific profile update behind a SECURITY DEFINER RPC
--   with an explicit auth.uid() ownership check. This keeps scoring columns
--   server-protected while allowing students to update their own non-scoring
--   profile fields.

CREATE OR REPLACE FUNCTION public.update_own_student_profile_fields(
  p_city TEXT DEFAULT NULL,
  p_target_group TEXT DEFAULT NULL,
  p_target_university TEXT DEFAULT NULL,
  p_graduation_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  city TEXT,
  target_group TEXT,
  target_university TEXT,
  graduation_year INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.students s
  SET
    city = COALESCE(NULLIF(BTRIM(p_city), ''), s.city),
    target_group = COALESCE(NULLIF(BTRIM(p_target_group), ''), s.target_group),
    target_university = COALESCE(NULLIF(BTRIM(p_target_university), ''), s.target_university),
    graduation_year = COALESCE(p_graduation_year, s.graduation_year),
    updated_at = NOW()
  WHERE s.user_id = v_user_id
  RETURNING
    s.city,
    s.target_group,
    s.target_university,
    s.graduation_year
  INTO
    city,
    target_group,
    target_university,
    graduation_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student record not found';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_student_profile_fields(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_student_profile_fields(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.update_own_student_profile_fields(TEXT, TEXT, TEXT, INTEGER) IS
'Allows an authenticated student to update only their own non-scoring profile fields on students. Scoring and leaderboard fields remain protected by server-side scoring RPCs.';
