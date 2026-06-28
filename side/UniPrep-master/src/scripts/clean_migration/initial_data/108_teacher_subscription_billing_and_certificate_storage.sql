-- 108_teacher_subscription_billing_and_certificate_storage.sql
-- Purpose:
--   Complete the server-side contract for recurring teacher subscriptions,
--   subscription accounting, and private teacher certificate storage.
--
-- Owner applies this file manually in Supabase SQL Editor.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Reusable Stripe catalog identifiers for each teacher
-- ---------------------------------------------------------------------------

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS stripe_subscription_product_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_price_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stripe_subscription_price_currency TEXT;

ALTER TABLE public.teacher_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_latest_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_latest_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.teachers.stripe_subscription_product_id IS
  'Stripe Product used for this teacher recurring subscription offer.';
COMMENT ON COLUMN public.teachers.stripe_subscription_price_id IS
  'Current immutable Stripe monthly Price matching monthly_rate and currency.';
COMMENT ON COLUMN public.teacher_subscriptions.last_payment_at IS
  'Most recent successfully paid recurring invoice timestamp.';

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_latest_invoice
  ON public.teacher_subscriptions(stripe_latest_invoice_id)
  WHERE stripe_latest_invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Idempotent recurring subscription accounting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_teacher_subscription_payment(
  p_teacher_subscription_id UUID,
  p_student_user_id UUID,
  p_teacher_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_external_payment_id TEXT,
  p_external_invoice_id TEXT,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate NUMERIC := 0.15;
  v_commission_amount NUMERIC;
  v_teacher_amount NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::NUMERIC
      WHEN jsonb_typeof(value) = 'string' THEN trim(BOTH '"' FROM value::TEXT)::NUMERIC
      ELSE NULL
    END,
    0.15
  )
  INTO v_commission_rate
  FROM public.system_settings
  WHERE key = 'commission_rate';

  v_commission_rate := COALESCE(v_commission_rate, 0.15);
  v_commission_amount := ROUND(p_amount * v_commission_rate, 2);
  v_teacher_amount := p_amount - v_commission_amount;

  INSERT INTO public.transactions (
    from_user_id,
    to_user_id,
    amount,
    currency,
    type,
    status,
    external_payment_id,
    commission_rate,
    commission_amount,
    description,
    metadata,
    idempotency_key,
    completed_at
  )
  VALUES (
    p_student_user_id,
    p_teacher_user_id,
    p_amount,
    upper(p_currency),
    'subscription_charge',
    'completed',
    p_external_payment_id,
    v_commission_rate,
    v_commission_amount,
    'Teacher monthly subscription charge',
    jsonb_build_object(
      'teacher_subscription_id', p_teacher_subscription_id,
      'stripe_invoice_id', p_external_invoice_id
    ),
    p_idempotency_key,
    NOW()
  );

  INSERT INTO public.transactions (
    to_user_id,
    amount,
    currency,
    type,
    status,
    commission_rate,
    commission_amount,
    description,
    metadata,
    idempotency_key,
    completed_at
  )
  VALUES (
    p_teacher_user_id,
    v_teacher_amount,
    upper(p_currency),
    'teacher_earning',
    'completed',
    v_commission_rate,
    v_commission_amount,
    'Teacher subscription earning',
    jsonb_build_object(
      'teacher_subscription_id', p_teacher_subscription_id,
      'stripe_invoice_id', p_external_invoice_id
    ),
    p_idempotency_key || '_earning',
    NOW()
  );

  IF v_commission_amount > 0 THEN
    INSERT INTO public.transactions (
      from_user_id,
      amount,
      currency,
      type,
      status,
      description,
      metadata,
      idempotency_key,
      completed_at
    )
    VALUES (
      p_teacher_user_id,
      v_commission_amount,
      upper(p_currency),
      'platform_commission',
      'completed',
      'Platform commission from teacher subscription',
      jsonb_build_object(
        'teacher_subscription_id', p_teacher_subscription_id,
        'stripe_invoice_id', p_external_invoice_id
      ),
      p_idempotency_key || '_commission',
      NOW()
    );
  END IF;

  INSERT INTO public.wallets (user_id, balance, total_earned, currency)
  VALUES (
    p_teacher_user_id,
    v_teacher_amount,
    v_teacher_amount,
    upper(p_currency)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = public.wallets.balance + v_teacher_amount,
    total_earned = public.wallets.total_earned + v_teacher_amount,
    updated_at = NOW();

  INSERT INTO public.wallets (user_id, balance, total_spent, currency)
  VALUES (
    p_student_user_id,
    0,
    p_amount,
    upper(p_currency)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_spent = public.wallets.total_spent + p_amount,
    updated_at = NOW();

  UPDATE public.teacher_subscriptions
  SET
    stripe_latest_invoice_id = p_external_invoice_id,
    stripe_latest_payment_intent_id = p_external_payment_id,
    last_payment_at = NOW(),
    last_payment_failed_at = NULL,
    updated_at = NOW()
  WHERE id = p_teacher_subscription_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_teacher_subscription_payment(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_teacher_subscription_payment(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.process_teacher_subscription_refund(
  p_external_payment_id TEXT,
  p_refunded_total NUMERIC,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_payment public.transactions%ROWTYPE;
  v_already_refunded NUMERIC;
  v_refund_amount NUMERIC;
  v_teacher_amount NUMERIC;
BEGIN
  IF p_external_payment_id IS NULL
     OR p_external_payment_id = ''
     OR p_refunded_total IS NULL
     OR p_refunded_total <= 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT *
  INTO v_original_payment
  FROM public.transactions
  WHERE external_payment_id = p_external_payment_id
    AND type = 'subscription_charge'
    AND status = 'completed'
  ORDER BY completed_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_already_refunded
  FROM public.transactions t
  WHERE t.external_payment_id = p_external_payment_id
    AND t.type = 'refund'
    AND t.status = 'completed'
    AND t.metadata->>'teacher_subscription_id'
      = v_original_payment.metadata->>'teacher_subscription_id';

  v_refund_amount :=
    LEAST(v_original_payment.amount, p_refunded_total) - v_already_refunded;

  IF v_refund_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  v_teacher_amount := ROUND(
    v_refund_amount
      * (
          (v_original_payment.amount - COALESCE(v_original_payment.commission_amount, 0))
          / v_original_payment.amount
        ),
    2
  );

  INSERT INTO public.transactions (
    from_user_id,
    to_user_id,
    amount,
    currency,
    type,
    status,
    external_payment_id,
    description,
    metadata,
    idempotency_key,
    completed_at
  )
  VALUES (
    v_original_payment.to_user_id,
    v_original_payment.from_user_id,
    v_refund_amount,
    v_original_payment.currency,
    'refund',
    'completed',
    p_external_payment_id,
    p_reason,
    v_original_payment.metadata || jsonb_build_object(
      'refunded_transaction_id', v_original_payment.id
      ,'stripe_refunded_total', p_refunded_total
    ),
    p_idempotency_key,
    NOW()
  );

  UPDATE public.wallets
  SET
    balance = GREATEST(balance - v_teacher_amount, 0),
    total_earned = GREATEST(total_earned - v_teacher_amount, 0),
    updated_at = NOW()
  WHERE user_id = v_original_payment.to_user_id;

  UPDATE public.wallets
  SET
    total_spent = GREATEST(total_spent - v_refund_amount, 0),
    updated_at = NOW()
  WHERE user_id = v_original_payment.from_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_teacher_subscription_refund(
  TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_teacher_subscription_refund(
  TEXT, NUMERIC, TEXT, TEXT
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Private certificate bucket and access policy repair
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'certificates',
  'certificates',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public Access - Certificates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated certificate access" ON storage.objects;
CREATE POLICY "Authenticated certificate access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (
    (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND user_type = 'teacher'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.admins
      WHERE user_id = auth.uid()
        AND is_active = TRUE
    )
  )
);

DROP POLICY IF EXISTS "Teachers can upload own certificates" ON storage.objects;
CREATE POLICY "Teachers can upload own certificates"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND user_type = 'teacher'
  )
);

DROP POLICY IF EXISTS "Teachers can update own certificates" ON storage.objects;
CREATE POLICY "Teachers can update own certificates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
)
WITH CHECK (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Teachers can delete own certificates" ON storage.objects;
CREATE POLICY "Teachers can delete own certificates"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (
    (storage.foldername(name))[1] = auth.uid()::TEXT
    OR EXISTS (
      SELECT 1
      FROM public.admins
      WHERE user_id = auth.uid()
        AND is_active = TRUE
    )
  )
);

COMMIT;
