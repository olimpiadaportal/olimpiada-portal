-- 109_teacher_verification_certificate_contract.sql
-- Purpose:
-- - Keep teacher marketplace eligibility tied to verified certificate evidence.
-- - Give admin certificate deletion a single authoritative RPC.
-- - Prevent approving a teacher without at least one certificate.
--
-- Owner applies this file in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.update_teacher_verification(
  p_teacher_id UUID,
  p_is_verified BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_certificate_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT COALESCE(array_length(certificates, 1), 0)
  INTO v_certificate_count
  FROM public.teachers
  WHERE id = p_teacher_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teacher not found');
  END IF;

  IF p_is_verified AND v_certificate_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Teacher must have at least one certificate before verification'
    );
  END IF;

  v_status := CASE WHEN p_is_verified THEN 'verified' ELSE 'rejected' END;

  UPDATE public.teachers
  SET
    is_verified = p_is_verified,
    verification_status = v_status,
    verification_rejection_reason = CASE
      WHEN v_status = 'rejected' THEN NULLIF(TRIM(p_rejection_reason), '')
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_teacher_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'teacher_id', p_teacher_id,
      'is_verified', p_is_verified,
      'verification_status', v_status
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_teacher_certificates(
  p_teacher_id UUID,
  p_certificates TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_certificates TEXT[] := COALESCE(p_certificates, ARRAY[]::TEXT[]);
  v_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE id = p_teacher_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teacher not found');
  END IF;

  v_status := CASE
    WHEN COALESCE(array_length(v_certificates, 1), 0) > 0 THEN 'pending'
    ELSE 'not_submitted'
  END;

  UPDATE public.teachers
  SET
    certificates = v_certificates,
    is_verified = FALSE,
    verification_status = v_status,
    verification_rejection_reason = NULL,
    updated_at = NOW()
  WHERE id = p_teacher_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'teacher_id', p_teacher_id,
      'certificate_count', COALESCE(array_length(v_certificates, 1), 0),
      'is_verified', false,
      'verification_status', v_status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_teacher_verification(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_teacher_certificates(UUID, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.admin_update_teacher_certificates(UUID, TEXT[]) IS
  'Admin-only certificate update. Any certificate removal/change resets teacher verification so marketplace visibility requires fresh approval.';
