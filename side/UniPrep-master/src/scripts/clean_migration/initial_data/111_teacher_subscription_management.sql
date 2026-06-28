-- 111_teacher_subscription_management.sql
-- Purpose:
--   Add role-scoped subscription management views for students and teachers.
--
-- Owner applies this file manually in Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_teacher_subscriptions()
RETURNS TABLE(
  subscription_id UUID,
  teacher_id UUID,
  teacher_user_id UUID,
  teacher_name TEXT,
  teacher_avatar_url TEXT,
  subject_id UUID,
  subject_name_en TEXT,
  subject_name_az TEXT,
  status TEXT,
  monthly_amount NUMERIC,
  currency TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  last_payment_at TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ts.id,
    t.id,
    t.user_id,
    p.full_name,
    p.avatar_url,
    s.id,
    s.name_en,
    s.name_az,
    ts.status,
    ts.monthly_amount,
    upper(ts.currency),
    ts.current_period_start,
    ts.current_period_end,
    ts.cancel_at_period_end,
    ts.last_payment_at,
    ts.last_payment_failed_at,
    ts.created_at
  FROM public.teacher_subscriptions ts
  JOIN public.students st
    ON st.id = ts.student_id
   AND st.user_id = auth.uid()
  JOIN public.teachers t ON t.id = ts.teacher_id
  JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.subjects s ON s.id = ts.subject_id
  ORDER BY
    CASE ts.status
      WHEN 'active' THEN 0
      WHEN 'trialing' THEN 1
      WHEN 'past_due' THEN 2
      WHEN 'unpaid' THEN 3
      WHEN 'incomplete' THEN 4
      ELSE 5
    END,
    ts.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_subscribers()
RETURNS TABLE(
  subscription_id UUID,
  student_id UUID,
  student_user_id UUID,
  student_name TEXT,
  student_avatar_url TEXT,
  subject_id UUID,
  subject_name_en TEXT,
  subject_name_az TEXT,
  status TEXT,
  monthly_amount NUMERIC,
  currency TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  last_payment_at TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ts.id,
    st.id,
    st.user_id,
    p.full_name,
    p.avatar_url,
    s.id,
    s.name_en,
    s.name_az,
    ts.status,
    ts.monthly_amount,
    upper(ts.currency),
    ts.current_period_start,
    ts.current_period_end,
    ts.cancel_at_period_end,
    ts.last_payment_at,
    ts.last_payment_failed_at,
    ts.created_at
  FROM public.teacher_subscriptions ts
  JOIN public.teachers t
    ON t.id = ts.teacher_id
   AND t.user_id = auth.uid()
  JOIN public.students st ON st.id = ts.student_id
  JOIN public.profiles p ON p.id = st.user_id
  LEFT JOIN public.subjects s ON s.id = ts.subject_id
  ORDER BY
    CASE ts.status
      WHEN 'active' THEN 0
      WHEN 'trialing' THEN 1
      WHEN 'past_due' THEN 2
      WHEN 'unpaid' THEN 3
      WHEN 'incomplete' THEN 4
      ELSE 5
    END,
    ts.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_teacher_subscriptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_teacher_subscribers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_subscribers() TO authenticated;

COMMIT;
