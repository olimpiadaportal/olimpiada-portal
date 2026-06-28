-- ============================================================================
-- HOTFIX 25: Phase 3 — Teacher Availability Management
-- Created: February 2026
-- ============================================================================
-- Adds:
--   1. teacher_availability table (weekly recurring schedule)
--   2. teacher_time_off table (vacation / date-range blocks)
--   3. RLS policies for both tables
--   4. Indexes for performance
--   5. get_teacher_availability_status() RPC function
--   6. Feature flag: teacher_availability
-- ============================================================================

-- ============================================================================
-- SECTION 1: teacher_availability table
-- Stores recurring weekly schedule rows (one row per day-of-week slot)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon … 6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT unique_teacher_day UNIQUE (teacher_id, day_of_week)
);

-- ============================================================================
-- SECTION 2: teacher_time_off table
-- Stores one-off date-range blocks (vacations, sick days, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_time_off (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- ============================================================================
-- SECTION 3: RLS
-- ============================================================================
ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_time_off ENABLE ROW LEVEL SECURITY;

-- teacher_availability: teachers manage own rows; students/public can read
DROP POLICY IF EXISTS "Teachers can manage own availability" ON public.teacher_availability;
CREATE POLICY "Teachers can manage own availability"
  ON public.teacher_availability FOR ALL
  USING (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = auth.uid()))
  WITH CHECK (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view availability" ON public.teacher_availability;
CREATE POLICY "Authenticated users can view availability"
  ON public.teacher_availability FOR SELECT
  TO authenticated
  USING (true);

-- teacher_time_off: teachers manage own rows; students/public can read
DROP POLICY IF EXISTS "Teachers can manage own time off" ON public.teacher_time_off;
CREATE POLICY "Teachers can manage own time off"
  ON public.teacher_time_off FOR ALL
  USING (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = auth.uid()))
  WITH CHECK (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view time off" ON public.teacher_time_off;
CREATE POLICY "Authenticated users can view time off"
  ON public.teacher_time_off FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- SECTION 4: Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher
  ON public.teacher_availability(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_availability_day
  ON public.teacher_availability(teacher_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_teacher_time_off_teacher
  ON public.teacher_time_off(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_time_off_dates
  ON public.teacher_time_off(start_date, end_date);

-- ============================================================================
-- SECTION 5: updated_at trigger for teacher_availability
-- ============================================================================
DROP TRIGGER IF EXISTS update_teacher_availability_updated_at ON public.teacher_availability;
CREATE TRIGGER update_teacher_availability_updated_at
  BEFORE UPDATE ON public.teacher_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 6: get_teacher_availability_status() RPC
-- Returns 'available' | 'busy' | 'offline' for a given teacher right now.
-- 'offline'   → teacher has an active time_off record covering today
-- 'available' → teacher has a recurring slot covering the current day+time
-- 'busy'      → no matching slot (or no availability set at all)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_teacher_availability_status(p_teacher_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_availability BOOLEAN;
  v_is_on_time_off   BOOLEAN;
  v_current_day      INTEGER;
  v_current_time     TIME;
BEGIN
  v_current_day  := EXTRACT(DOW FROM NOW())::INTEGER;  -- 0=Sun … 6=Sat
  v_current_time := (NOW() AT TIME ZONE 'UTC')::TIME;

  -- Check time-off first (highest priority)
  SELECT EXISTS(
    SELECT 1 FROM public.teacher_time_off
    WHERE teacher_id = p_teacher_id
      AND CURRENT_DATE BETWEEN start_date AND end_date
  ) INTO v_is_on_time_off;

  IF v_is_on_time_off THEN
    RETURN 'offline';
  END IF;

  -- Check recurring availability for today
  SELECT EXISTS(
    SELECT 1 FROM public.teacher_availability
    WHERE teacher_id = p_teacher_id
      AND day_of_week = v_current_day
      AND is_available = TRUE
      AND v_current_time BETWEEN start_time AND end_time
  ) INTO v_has_availability;

  IF v_has_availability THEN
    RETURN 'available';
  END IF;

  RETURN 'busy';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_availability_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_availability_status(UUID) TO anon;

-- ============================================================================
-- SECTION 7: Feature flag
-- ============================================================================
INSERT INTO public.feature_flags (flag_name, display_name, description, is_enabled, updated_at)
VALUES (
  'teacher_availability',
  'Teacher Availability Management',
  'Phase 3: Teacher availability management screens (weekly schedule + time off)',
  TRUE,
  NOW()
)
ON CONFLICT (flag_name) DO UPDATE SET
  is_enabled  = EXCLUDED.is_enabled,
  description = EXCLUDED.description,
  updated_at  = NOW();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'teacher_availability') AS availability_table,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'teacher_time_off')    AS time_off_table,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_teacher_availability_status')          AS rpc_exists,
  EXISTS(SELECT 1 FROM public.feature_flags WHERE flag_name = 'teacher_availability')      AS flag_exists;
-- Expected: true, true, true, true
