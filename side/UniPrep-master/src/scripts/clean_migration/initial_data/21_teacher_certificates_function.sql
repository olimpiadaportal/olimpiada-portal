-- ============================================================================
-- Phase 2B: Teacher Certificates in Admin Panel
-- File: 21_teacher_certificates_function.sql
-- Purpose: Update get_teacher_detail function to include certificates
-- Created: February 15, 2026
-- ============================================================================
-- This migration updates the get_teacher_detail RPC function to include
-- the certificates array in the response for the admin panel.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Update get_teacher_detail function to include certificates
-- ============================================================================

CREATE OR REPLACE FUNCTION get_teacher_detail(p_teacher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'teacher_id', t.id,
    'user_id', t.user_id,
    'profile', jsonb_build_object(
      'full_name', p.full_name,
      'email', au.email,
      'avatar_url', p.avatar_url,
      'city', t.city,
      'phone', p.phone,
      'created_at', p.created_at
    ),
    'info', jsonb_build_object(
      'bio', t.bio,
      'specializations', t.specializations,
      'experience_years', t.experience_years,
      'hourly_rate', t.hourly_rate,
      'monthly_rate', t.monthly_rate,
      'rating', t.rating,
      'is_verified', t.is_verified,
      'available_groups', t.available_groups,
      'certificates', COALESCE(t.certificates, '{}')
    ),
    'stats', jsonb_build_object(
      'student_count', (SELECT COUNT(DISTINCT student_id) FROM student_teachers WHERE teacher_id = t.id),
      'completed_bookings', (SELECT COUNT(*) FROM bookings WHERE teacher_id = t.id AND status = 'completed'),
      'pending_bookings', (SELECT COUNT(*) FROM bookings WHERE teacher_id = t.id AND status = 'pending'),
      'total_revenue', (SELECT COALESCE(SUM(price), 0) FROM bookings WHERE teacher_id = t.id AND status = 'completed')
    ),
    'students', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'student_id', s.id,
          'student_name', sp.full_name,
          'student_email', sau.email,
          'assigned_at', st.created_at
        )
      )
      FROM student_teachers st
      JOIN students s ON st.student_id = s.id
      JOIN profiles sp ON s.user_id = sp.id
      LEFT JOIN auth.users sau ON sp.id = sau.id
      WHERE st.teacher_id = t.id
      LIMIT 20
    ),
    'recent_bookings', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'student_name', sp.full_name,
          'date', b.scheduled_date,
          'status', b.status,
          'amount', b.price
        )
        ORDER BY b.scheduled_date DESC
      )
      FROM bookings b
      JOIN students s ON b.student_id = s.id
      JOIN profiles sp ON s.user_id = sp.id
      WHERE b.teacher_id = t.id
      LIMIT 10
    )
  ) INTO v_result
  FROM teachers t
  JOIN profiles p ON t.user_id = p.id
  LEFT JOIN auth.users au ON p.id = au.id
  WHERE t.id = p_teacher_id;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_teacher_detail IS 'Get comprehensive teacher information including stats, students, and certificates';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_teacher_detail TO authenticated;

COMMIT;
