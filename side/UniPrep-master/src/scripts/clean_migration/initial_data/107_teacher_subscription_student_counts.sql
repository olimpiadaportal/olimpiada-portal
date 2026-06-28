-- 107_teacher_subscription_student_counts.sql
-- Purpose:
--   Define teacher-student subscription membership separately from one-off bookings.
--   Teacher student counts should be derived from recurring teacher subscriptions,
--   not hourly or one-time booking history.
--
-- Owner applies this file manually in Supabase SQL Editor.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Teacher counters
-- ---------------------------------------------------------------------------

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS current_students INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.teachers.current_students IS
  'Distinct students with an active/trialing teacher subscription. One-off bookings do not count.';

COMMENT ON COLUMN public.teachers.total_students IS
  'Lifetime distinct students who have had an active/trialing teacher subscription. One-off bookings do not count.';

-- ---------------------------------------------------------------------------
-- 2) Canonical teacher subscription table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (status IN (
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'paused',
      'cancelled',
      'incomplete_expired'
    )),
  billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly')),
  monthly_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'azn',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  ever_active BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.teacher_subscriptions IS
  'Recurring monthly subscriptions between students and teachers. This is the authority for current/total teacher student counts.';

COMMENT ON COLUMN public.teacher_subscriptions.ever_active IS
  'Set true once a subscription reaches active/trialing, so lifetime student counts survive later cancellation.';

ALTER TABLE public.teacher_subscriptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) RLS: read-only for owning student/teacher; writes happen server-side.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Students can view own teacher subscriptions" ON public.teacher_subscriptions;
CREATE POLICY "Students can view own teacher subscriptions"
  ON public.teacher_subscriptions
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can view own student subscriptions" ON public.teacher_subscriptions;
CREATE POLICY "Teachers can view own student subscriptions"
  ON public.teacher_subscriptions
  FOR SELECT TO authenticated
  USING (
    teacher_id IN (
      SELECT id FROM public.teachers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view teacher subscriptions" ON public.teacher_subscriptions;
CREATE POLICY "Admins can view teacher subscriptions"
  ON public.teacher_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admins a
      WHERE a.user_id = auth.uid()
        AND a.is_active = TRUE
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_student
  ON public.teacher_subscriptions(student_id);

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_teacher
  ON public.teacher_subscriptions(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_status
  ON public.teacher_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_period_end
  ON public.teacher_subscriptions(current_period_end)
  WHERE current_period_end IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_subscriptions_stripe_subscription
  ON public.teacher_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_subscriptions_one_open
  ON public.teacher_subscriptions(student_id, teacher_id)
  WHERE status IN ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');

-- ---------------------------------------------------------------------------
-- 5) Count helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_teacher_subscription_counts(p_teacher_id UUID)
RETURNS TABLE(current_students INTEGER, total_students INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT ts.student_id) FILTER (
      WHERE ts.status IN ('active', 'trialing')
        AND (ts.current_period_end IS NULL OR ts.current_period_end > NOW())
    )::INTEGER AS current_students,
    COUNT(DISTINCT ts.student_id) FILTER (
      WHERE ts.ever_active = TRUE
    )::INTEGER AS total_students
  FROM public.teacher_subscriptions ts
  WHERE ts.teacher_id = p_teacher_id;
$$;

COMMENT ON FUNCTION public.get_teacher_subscription_counts(UUID) IS
  'Returns current and lifetime teacher student counts from recurring teacher_subscriptions only.';

CREATE OR REPLACE FUNCTION public.refresh_teacher_subscription_counts(p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  SELECT current_students, total_students
  INTO v_current, v_total
  FROM public.get_teacher_subscription_counts(p_teacher_id);

  UPDATE public.teachers
  SET
    current_students = COALESCE(v_current, 0),
    total_students = COALESCE(v_total, 0),
    updated_at = NOW()
  WHERE id = p_teacher_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_teacher_subscription_counts(UUID) IS
  'Refreshes denormalized teacher current/total student counters from teacher_subscriptions.';

CREATE OR REPLACE FUNCTION public.teacher_subscriptions_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();

  IF NEW.status IN ('active', 'trialing') THEN
    NEW.ever_active := TRUE;
    NEW.activated_at := COALESCE(NEW.activated_at, NOW());
  END IF;

  IF NEW.status IN ('cancelled', 'incomplete_expired') THEN
    NEW.ended_at := COALESCE(NEW.ended_at, NOW());
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
  END IF;

  NEW.currency := LOWER(COALESCE(NULLIF(NEW.currency, ''), 'azn'));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_subscriptions_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
BEGIN
  v_teacher_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.teacher_id
    ELSE NEW.teacher_id
  END;

  PERFORM public.refresh_teacher_subscription_counts(v_teacher_id);

  IF TG_OP = 'UPDATE' AND OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN
    PERFORM public.refresh_teacher_subscription_counts(OLD.teacher_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_subscriptions_before_write ON public.teacher_subscriptions;
CREATE TRIGGER trg_teacher_subscriptions_before_write
  BEFORE INSERT OR UPDATE ON public.teacher_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.teacher_subscriptions_before_write();

DROP TRIGGER IF EXISTS trg_teacher_subscriptions_after_write ON public.teacher_subscriptions;
CREATE TRIGGER trg_teacher_subscriptions_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.teacher_subscriptions_after_write();

-- Ensure existing rows/counters are aligned if this hotfix is re-run.
UPDATE public.teacher_subscriptions
SET
  ever_active = TRUE,
  activated_at = COALESCE(activated_at, created_at, NOW())
WHERE status IN ('active', 'trialing')
  AND ever_active = FALSE;

UPDATE public.teachers t
SET
  current_students = COALESCE(c.current_students, 0),
  total_students = COALESCE(c.total_students, 0),
  updated_at = NOW()
FROM (
  SELECT
    teacher_id,
    COUNT(DISTINCT student_id) FILTER (
      WHERE status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > NOW())
    )::INTEGER AS current_students,
    COUNT(DISTINCT student_id) FILTER (WHERE ever_active = TRUE)::INTEGER AS total_students
  FROM public.teacher_subscriptions
  GROUP BY teacher_id
) c
WHERE t.id = c.teacher_id;

UPDATE public.teachers t
SET
  current_students = 0,
  total_students = 0,
  updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.teacher_subscriptions ts
  WHERE ts.teacher_id = t.id
);

-- ---------------------------------------------------------------------------
-- 7) Admin RPC count semantics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_search_teachers(
  p_query TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_verification_status TEXT DEFAULT NULL,
  p_specialization TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_order TEXT DEFAULT 'DESC',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  teacher_id UUID,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  city TEXT,
  is_verified BOOLEAN,
  specializations TEXT[],
  hourly_rate NUMERIC,
  rating NUMERIC,
  total_bookings INTEGER,
  student_count BIGINT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered_teachers AS (
    SELECT
      t.id,
      t.user_id,
      p.full_name,
      COALESCE(au.email, 'no-email@example.com') AS email,
      p.avatar_url,
      t.city,
      t.is_verified,
      t.specializations,
      t.hourly_rate,
      t.rating,
      t.current_students,
      p.created_at
    FROM public.teachers t
    INNER JOIN public.profiles p ON t.user_id = p.id
    LEFT JOIN auth.users au ON p.id = au.id
    WHERE (p_query IS NULL OR p.full_name ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
      AND (p_city IS NULL OR t.city = p_city)
      AND (
        p_verification_status IS NULL
        OR (p_verification_status = 'verified' AND t.is_verified = TRUE)
        OR (p_verification_status = 'unverified' AND t.is_verified = FALSE)
      )
      AND (p_specialization IS NULL OR p_specialization = ANY(t.specializations))
  ),
  teacher_counts AS (
    SELECT
      ft.id,
      (SELECT COUNT(*)::INTEGER FROM public.bookings b WHERE b.teacher_id = ft.id) AS total_bookings,
      COALESCE(ft.current_students, 0)::BIGINT AS student_count
    FROM filtered_teachers ft
  ),
  total_count_cte AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered_teachers
  )
  SELECT
    ft.id,
    ft.user_id,
    ft.full_name,
    ft.email,
    ft.avatar_url,
    ft.city,
    ft.is_verified,
    ft.specializations,
    ft.hourly_rate,
    ft.rating,
    COALESCE(tc.total_bookings, 0),
    COALESCE(tc.student_count, 0),
    ft.created_at,
    tcc.total
  FROM filtered_teachers ft
  LEFT JOIN teacher_counts tc ON ft.id = tc.id
  CROSS JOIN total_count_cte tcc
  ORDER BY
    CASE WHEN p_sort_by = 'name' THEN ft.full_name END,
    CASE WHEN p_sort_by = 'rating' THEN ft.rating END DESC,
    ft.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_detail(p_teacher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'student_count', COALESCE(t.current_students, 0),
      'current_student_count', COALESCE(t.current_students, 0),
      'total_student_count', COALESCE(t.total_students, 0),
      'completed_bookings', (SELECT COUNT(*) FROM public.bookings WHERE teacher_id = t.id AND status = 'completed'),
      'pending_bookings', (SELECT COUNT(*) FROM public.bookings WHERE teacher_id = t.id AND status = 'pending'),
      'total_revenue', (SELECT COALESCE(SUM(price), 0) FROM public.bookings WHERE teacher_id = t.id AND status = 'completed')
    )
  )
  INTO v_result
  FROM public.teachers t
  JOIN public.profiles p ON t.user_id = p.id
  LEFT JOIN auth.users au ON p.id = au.id
  WHERE t.id = p_teacher_id;

  RETURN v_result;
END;
$$;

GRANT SELECT ON public.teacher_subscriptions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_subscription_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_teachers(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_detail(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.refresh_teacher_subscription_counts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_subscriptions_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_subscriptions_after_write() FROM PUBLIC;

COMMIT;
