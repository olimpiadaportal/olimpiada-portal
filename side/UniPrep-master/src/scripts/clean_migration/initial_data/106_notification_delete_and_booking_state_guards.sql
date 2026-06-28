-- 106_notification_delete_and_booking_state_guards.sql
-- Purpose:
--   1. Allow authenticated users to permanently delete their own in-app notifications.
--   2. Add database-side booking state guards so paid/completed bookings cannot be
--      cancelled or payment-marked from normal authenticated clients.
--   3. Add explicit teacher verification status so uploaded certificates can be
--      distinguished from admin-rejected certificates in the mobile UI.
--
-- Apply in Supabase SQL Editor. This hotfix is backported into:
--   - 03_rls_policies.sql
--   - 04_functions_triggers.sql

BEGIN;

-- Notifications: app users can delete only their own notification rows.
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Teacher verification status:
-- - not_submitted: no certificate evidence yet
-- - pending: certificate uploaded, waiting for admin review
-- - verified: admin approved
-- - rejected: admin rejected; teacher should see profile action warnings again
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;

ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_verification_status_check;

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_verification_status_check
  CHECK (verification_status IN ('not_submitted', 'pending', 'verified', 'rejected'));

UPDATE public.teachers
SET verification_status = CASE
  WHEN is_verified = TRUE THEN 'verified'
  WHEN COALESCE(array_length(certificates, 1), 0) > 0 THEN 'pending'
  ELSE 'not_submitted'
END
WHERE verification_status = 'not_submitted';

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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = auth.uid()
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  IF p_is_verified THEN
    v_status := 'verified';
  ELSE
    v_status := 'rejected';
  END IF;

  UPDATE teachers
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

-- Booking lifecycle guard.
-- Service-role Edge Functions/webhooks keep authority for Stripe and admin workflows
-- because auth.uid() is NULL in those server-side calls. Authenticated mobile/web
-- clients are restricted to safe state transitions.
CREATE OR REPLACE FUNCTION public.guard_booking_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_is_student BOOLEAN := FALSE;
  v_is_teacher BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Server-side service-role flows own Stripe/webhook/admin payment transitions.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = v_actor
      AND is_active = TRUE
  )
  INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  v_is_student := OLD.student_user_id = v_actor;
  v_is_teacher := OLD.teacher_user_id = v_actor;

  IF NOT v_is_student AND NOT v_is_teacher THEN
    RAISE EXCEPTION 'You are not allowed to update this booking';
  END IF;

  -- Students/teachers must not fake payment state or rewrite payment metadata.
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Payment status can only be changed by the payment system';
  END IF;

  IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN
    RAISE EXCEPTION 'Payment intent can only be changed by the payment system';
  END IF;

  IF NEW.price IS DISTINCT FROM OLD.price THEN
    RAISE EXCEPTION 'Booking price can only be changed by the server';
  END IF;

  -- Contact access is granted on confirmed sessions. After that, direct user
  -- cancellation is intentionally blocked until a refund/support flow exists.
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Completed bookings cannot be cancelled';
    END IF;

    IF OLD.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Paid bookings require support/refund handling before cancellation';
    END IF;

    IF v_is_student AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Students can only cancel before teacher acceptance';
    END IF;

    IF v_is_teacher AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Teachers can only cancel before payment flow starts';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
    IF NOT v_is_teacher THEN
      RAISE EXCEPTION 'Only the teacher can confirm a free booking from the client';
    END IF;

    IF OLD.status <> 'pending' OR OLD.payment_status <> 'free' THEN
      RAISE EXCEPTION 'Use the payment flow to confirm paid bookings';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status = 'awaiting_payment' AND OLD.status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'Use the payment flow to request payment';
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    IF NOT v_is_teacher THEN
      RAISE EXCEPTION 'Only the teacher can mark a booking completed';
    END IF;

    IF OLD.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be completed';
    END IF;

    IF OLD.payment_status NOT IN ('free', 'paid') THEN
      RAISE EXCEPTION 'Bookings can be completed only after payment is settled';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_state_transitions ON public.bookings;
CREATE TRIGGER trg_guard_booking_state_transitions
  BEFORE UPDATE OF status, payment_status, payment_intent_id, price
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_booking_state_transitions();

COMMENT ON FUNCTION public.guard_booking_state_transitions IS
  'Blocks unsafe authenticated-client booking/payment state transitions. Service-role payment/admin flows remain authoritative.';

COMMIT;
