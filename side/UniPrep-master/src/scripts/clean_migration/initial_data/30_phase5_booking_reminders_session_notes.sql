-- ============================================================
-- Migration 30: Phase 5 — Booking Reminders & Session Notes
-- ============================================================
-- Purpose : Patch an EXISTING database with Phase 5 changes.
--           For FRESH databases these changes are already in
--           the main consolidated files (01–05).
-- Depends : bookings, notification_queue, notification_events
-- Safe    : All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- ============================================================

-- ── 1. teacher_notes columns on bookings ────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS teacher_notes             TEXT,
  ADD COLUMN IF NOT EXISTS teacher_notes_updated_at  TIMESTAMPTZ;

-- ── 2. booking_reminders table ──────────────────────────────
-- Tracks which reminders have already been sent to prevent duplicates.
-- The notification processor (cron-job.org -> /api/notifications/processor)
-- calls send_booking_reminders() which inserts here after queuing each notification.
CREATE TABLE IF NOT EXISTS booking_reminders (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type TEXT        NOT NULL CHECK (reminder_type IN ('24h', '1h', '15min')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, reminder_type)
);

ALTER TABLE booking_reminders ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS policy ───────────────────────────────────────────
-- Uses denormalized student_user_id / teacher_user_id to avoid RLS recursion.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'booking_reminders'
      AND policyname = 'Users can view own booking reminders'
  ) THEN
    CREATE POLICY "Users can view own booking reminders" ON booking_reminders
      FOR SELECT TO authenticated
      USING (
        booking_id IN (
          SELECT id FROM bookings
          WHERE student_user_id = auth.uid()
             OR teacher_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── 4. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_booking_reminders_booking ON booking_reminders(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_reminders_sent_at ON booking_reminders(sent_at);

-- ── 5. send_booking_reminders() function ────────────────────
-- Called by the notification processor (cron-job.org -> /api/notifications/processor).
-- Finds confirmed bookings in the 24h / 1h / 15min windows, inserts into
-- notification_queue for both student and teacher, and records the send in
-- booking_reminders (UNIQUE constraint prevents duplicates).
CREATE OR REPLACE FUNCTION public.send_booking_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking       RECORD;
  v_student_user  UUID;
  v_teacher_user  UUID;
  v_reminder_type TEXT;
  v_title_student TEXT;
  v_body_student  TEXT;
  v_title_teacher TEXT;
  v_body_teacher  TEXT;
  v_session_dt    TIMESTAMPTZ;
BEGIN
  FOR v_booking IN
    SELECT
      b.id,
      b.student_id,
      b.teacher_id,
      b.scheduled_date,
      b.scheduled_time,
      subj.name_en AS subject_name,
      sp.full_name  AS student_name,
      tp.full_name  AS teacher_name
    FROM bookings b
    JOIN subjects  subj ON subj.id = b.subject_id
    JOIN students  st   ON st.id   = b.student_id
    JOIN profiles  sp   ON sp.id   = st.user_id
    JOIN teachers  te   ON te.id   = b.teacher_id
    JOIN profiles  tp   ON tp.id   = te.user_id
    WHERE b.status = 'confirmed'
  LOOP
    v_session_dt := (v_booking.scheduled_date::TEXT || ' ' || v_booking.scheduled_time)::TIMESTAMPTZ;

    SELECT user_id INTO v_student_user FROM students WHERE id = v_booking.student_id;
    SELECT user_id INTO v_teacher_user FROM teachers WHERE id = v_booking.teacher_id;

    -- Determine which reminder window this booking falls into
    IF v_session_dt BETWEEN (NOW() + INTERVAL '23 hours 45 minutes')
                        AND (NOW() + INTERVAL '24 hours 15 minutes') THEN
      v_reminder_type := '24h';
    ELSIF v_session_dt BETWEEN (NOW() + INTERVAL '45 minutes')
                           AND (NOW() + INTERVAL '1 hour 15 minutes') THEN
      v_reminder_type := '1h';
    ELSIF v_session_dt BETWEEN (NOW() + INTERVAL '5 minutes')
                           AND (NOW() + INTERVAL '20 minutes') THEN
      v_reminder_type := '15min';
    ELSE
      CONTINUE;
    END IF;

    -- Skip if already sent (idempotent)
    IF EXISTS (
      SELECT 1 FROM booking_reminders
      WHERE booking_id = v_booking.id AND reminder_type = v_reminder_type
    ) THEN
      CONTINUE;
    END IF;

    -- Build notification content
    IF v_reminder_type = '24h' THEN
      v_title_student := 'Session Tomorrow';
      v_body_student  := 'Your ' || v_booking.subject_name || ' session with ' || v_booking.teacher_name || ' is tomorrow at ' || v_booking.scheduled_time || '.';
      v_title_teacher := 'Session Tomorrow';
      v_body_teacher  := 'Your session with ' || v_booking.student_name || ' (' || v_booking.subject_name || ') is tomorrow at ' || v_booking.scheduled_time || '.';
    ELSIF v_reminder_type = '1h' THEN
      v_title_student := 'Session in 1 Hour';
      v_body_student  := 'Your ' || v_booking.subject_name || ' session with ' || v_booking.teacher_name || ' starts in 1 hour.';
      v_title_teacher := 'Session in 1 Hour';
      v_body_teacher  := 'Your session with ' || v_booking.student_name || ' (' || v_booking.subject_name || ') starts in 1 hour.';
    ELSE
      v_title_student := 'Session Starting Soon';
      v_body_student  := 'Your ' || v_booking.subject_name || ' session with ' || v_booking.teacher_name || ' starts in 15 minutes!';
      v_title_teacher := 'Session Starting Soon';
      v_body_teacher  := 'Your session with ' || v_booking.student_name || ' (' || v_booking.subject_name || ') starts in 15 minutes!';
    END IF;

    -- Queue notification for student
    IF v_student_user IS NOT NULL THEN
      INSERT INTO notification_queue (
        user_id, title, body, notification_type, data, status, channels
      ) VALUES (
        v_student_user,
        v_title_student,
        v_body_student,
        'booking_reminder',
        jsonb_build_object(
          'type',      'booking_reminder',
          'bookingId', v_booking.id::TEXT,
          'teacherId', v_booking.teacher_id::TEXT
        ),
        'pending',
        ARRAY['push', 'in_app']::TEXT[]
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- Queue notification for teacher
    IF v_teacher_user IS NOT NULL THEN
      INSERT INTO notification_queue (
        user_id, title, body, notification_type, data, status, channels
      ) VALUES (
        v_teacher_user,
        v_title_teacher,
        v_body_teacher,
        'booking_reminder',
        jsonb_build_object(
          'type',      'booking_reminder',
          'bookingId', v_booking.id::TEXT,
          'studentId', v_booking.student_id::TEXT
        ),
        'pending',
        ARRAY['push', 'in_app']::TEXT[]
      ) ON CONFLICT DO NOTHING;
    END IF;

    -- Record send to prevent duplicates
    INSERT INTO booking_reminders (booking_id, reminder_type)
    VALUES (v_booking.id, v_reminder_type)
    ON CONFLICT (booking_id, reminder_type) DO NOTHING;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_booking_reminders() TO service_role;
COMMENT ON FUNCTION public.send_booking_reminders IS
  'Queues booking reminder notifications at 24h, 1h, and 15min before confirmed sessions. '
  'Called by the external cron-job.org processor via /api/notifications/processor. '
  'Idempotent: booking_reminders UNIQUE constraint prevents duplicate sends.';

-- ── 6. Notification event seeds ─────────────────────────────
INSERT INTO notification_events (event_type, event_name, description, channels, priority)
VALUES
  ('booking_reminder_24h',   'Booking Reminder 24h',   'Sent 24 hours before a confirmed session',   ARRAY['push','in_app']::TEXT[], 7),
  ('booking_reminder_1h',    'Booking Reminder 1h',    'Sent 1 hour before a confirmed session',     ARRAY['push','in_app']::TEXT[], 8),
  ('booking_reminder_15min', 'Booking Reminder 15min', 'Sent 15 minutes before a confirmed session', ARRAY['push','in_app']::TEXT[], 9)
ON CONFLICT (event_type) DO NOTHING;

-- ── Verify ───────────────────────────────────────────────────
-- SELECT
--   EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'teacher_notes') AS teacher_notes_exists,
--   EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_reminders') AS reminders_table_exists,
--   EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'send_booking_reminders') AS fn_exists,
--   (SELECT COUNT(*) FROM notification_events WHERE event_type LIKE 'booking_reminder%') AS reminder_events_count;
-- Expected: true, true, true, 3
