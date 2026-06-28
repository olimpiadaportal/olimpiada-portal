-- 110_teacher_subscription_public_config.sql
-- Purpose:
-- - Let mobile clients read only the non-sensitive teacher subscription feature gate.
-- - Keep private payment settings, Stripe secrets, and commission settings hidden.
--
-- Owner applies this file in Supabase SQL Editor.

BEGIN;

UPDATE public.system_settings
SET
  is_public = TRUE,
  is_sensitive = FALSE,
  updated_at = NOW()
WHERE key = 'subscriptions_enabled';

CREATE OR REPLACE FUNCTION public.get_teacher_subscription_public_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled JSONB;
  v_currency JSONB;
  v_enabled_bool BOOLEAN := FALSE;
  v_currency_text TEXT := 'AZN';
BEGIN
  SELECT COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'subscriptions_enabled'),
    'false'::JSONB
  )
  INTO v_enabled;

  SELECT COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'currency'),
    '"AZN"'::JSONB
  )
  INTO v_currency;

  v_enabled_bool := CASE
    WHEN jsonb_typeof(v_enabled) = 'boolean' THEN (v_enabled #>> '{}')::BOOLEAN
    WHEN jsonb_typeof(v_enabled) = 'string' THEN LOWER(BTRIM(v_enabled #>> '{}')) IN ('true', '1', 'yes', 'on')
    ELSE FALSE
  END;

  v_currency_text := COALESCE(NULLIF(UPPER(BTRIM(v_currency #>> '{}')), ''), 'AZN');

  RETURN jsonb_build_object(
    'subscriptions_enabled', COALESCE(v_enabled_bool, FALSE),
    'currency', v_currency_text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_subscription_public_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_teacher_subscription_public_config() TO authenticated;

COMMENT ON FUNCTION public.get_teacher_subscription_public_config()
IS 'Returns non-sensitive teacher subscription billing config for mobile clients.';

COMMIT;
