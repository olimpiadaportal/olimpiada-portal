-- ============================================================================
-- 39_waitlist_feature.sql
-- Waitlist/Early Access Feature for Pre-Launch
-- ============================================================================
-- Purpose: Allow users to join a waitlist before app launch
-- Run this on existing databases to add waitlist functionality
-- ============================================================================

-- 1. Create waitlist_subscribers table
CREATE TABLE IF NOT EXISTS waitlist_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'landing_page', -- landing_page, referral, social, etc.
  referral_code TEXT,
  referred_by UUID REFERENCES waitlist_subscribers(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'registered', 'unsubscribed')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  ip_address INET,
  user_agent TEXT,
  locale TEXT DEFAULT 'az',
  invited_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist_subscribers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_source ON waitlist_subscribers(source);

-- 3. RLS Policies
ALTER TABLE waitlist_subscribers ENABLE ROW LEVEL SECURITY;

-- Public can insert (join waitlist) - no auth required
CREATE POLICY "Anyone can join waitlist" ON waitlist_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can view/update/delete
CREATE POLICY "Admins can view waitlist" ON waitlist_subscribers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins can update waitlist" ON waitlist_subscribers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins can delete waitlist" ON waitlist_subscribers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

-- 4. Function to join waitlist (public, rate-limited by app)
CREATE OR REPLACE FUNCTION join_waitlist(
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'landing_page',
  p_locale TEXT DEFAULT 'az',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscriber_id UUID;
  v_existing RECORD;
BEGIN
  -- Validate email format
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  -- Check if email already exists
  SELECT id, status INTO v_existing
  FROM waitlist_subscribers
  WHERE LOWER(email) = LOWER(TRIM(p_email));

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'unsubscribed' THEN
      -- Re-subscribe
      UPDATE waitlist_subscribers
      SET status = 'pending', updated_at = NOW()
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', true, 'message', 'resubscribed', 'id', v_existing.id);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'already_subscribed');
    END IF;
  END IF;

  -- Insert new subscriber
  INSERT INTO waitlist_subscribers (email, name, source, locale, metadata)
  VALUES (LOWER(TRIM(p_email)), TRIM(p_name), p_source, p_locale, p_metadata)
  RETURNING id INTO v_subscriber_id;

  RETURN jsonb_build_object('success', true, 'message', 'subscribed', 'id', v_subscriber_id);
END;
$$;

-- 5. Admin function to get waitlist stats
CREATE OR REPLACE FUNCTION get_waitlist_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'invited', COUNT(*) FILTER (WHERE status = 'invited'),
    'registered', COUNT(*) FILTER (WHERE status = 'registered'),
    'unsubscribed', COUNT(*) FILTER (WHERE status = 'unsubscribed'),
    'today', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
    'this_week', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    'this_month', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
    'by_source', (
      SELECT jsonb_object_agg(source, cnt)
      FROM (
        SELECT source, COUNT(*) as cnt
        FROM waitlist_subscribers
        WHERE status != 'unsubscribed'
        GROUP BY source
      ) s
    ),
    'by_locale', (
      SELECT jsonb_object_agg(locale, cnt)
      FROM (
        SELECT COALESCE(locale, 'unknown') as locale, COUNT(*) as cnt
        FROM waitlist_subscribers
        WHERE status != 'unsubscribed'
        GROUP BY locale
      ) l
    )
  ) INTO v_stats
  FROM waitlist_subscribers;

  RETURN v_stats;
END;
$$;

-- 6. Admin function to list waitlist subscribers with pagination
CREATE OR REPLACE FUNCTION get_waitlist_subscribers(
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_order_by TEXT DEFAULT 'created_at',
  p_order_dir TEXT DEFAULT 'DESC'
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  source TEXT,
  status TEXT,
  locale TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT 
    w.id,
    w.email,
    w.name,
    w.source,
    w.status,
    w.locale,
    w.metadata,
    w.created_at,
    w.invited_at,
    w.registered_at
  FROM waitlist_subscribers w
  WHERE 
    (p_status IS NULL OR w.status = p_status)
    AND (p_search IS NULL OR w.email ILIKE '%' || p_search || '%' OR w.name ILIKE '%' || p_search || '%')
  ORDER BY
    CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'DESC' THEN w.created_at END DESC,
    CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'ASC' THEN w.created_at END ASC,
    CASE WHEN p_order_by = 'email' AND p_order_dir = 'DESC' THEN w.email END DESC,
    CASE WHEN p_order_by = 'email' AND p_order_dir = 'ASC' THEN w.email END ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 7. Admin function to update subscriber status
CREATE OR REPLACE FUNCTION update_waitlist_status(
  p_subscriber_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT TRUE  -- Default to sending email when inviting
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscriber RECORD;
BEGIN
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'invited', 'registered', 'unsubscribed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- Get subscriber info before update (for email)
  SELECT id, email, name, locale INTO v_subscriber
  FROM waitlist_subscribers
  WHERE id = p_subscriber_id;

  IF v_subscriber.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  UPDATE waitlist_subscribers
  SET 
    status = p_status,
    notes = COALESCE(p_notes, notes),
    invited_at = CASE WHEN p_status = 'invited' THEN NOW() ELSE invited_at END,
    registered_at = CASE WHEN p_status = 'registered' THEN NOW() ELSE registered_at END,
    updated_at = NOW()
  WHERE id = p_subscriber_id;

  -- Queue email if inviting and send_email is true
  IF p_status = 'invited' AND p_send_email THEN
    INSERT INTO waitlist_email_queue (
      subscriber_id,
      recipient_email,
      recipient_name,
      template_name,
      locale,
      metadata
    ) VALUES (
      v_subscriber.id,
      v_subscriber.email,
      v_subscriber.name,
      'waitlist_invitation_' || COALESCE(v_subscriber.locale, 'az'),
      COALESCE(v_subscriber.locale, 'az'),
      jsonb_build_object('subscriber_id', v_subscriber.id)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'email_queued', p_status = 'invited' AND p_send_email);
END;
$$;

-- 8. Admin function to export waitlist emails (for email campaigns)
CREATE OR REPLACE FUNCTION export_waitlist_emails(
  p_status TEXT DEFAULT 'pending'
)
RETURNS TABLE (email TEXT, name TEXT, locale TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check admin permission
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT w.email, w.name, w.locale
  FROM waitlist_subscribers w
  WHERE w.status = p_status
  ORDER BY w.created_at ASC;
END;
$$;

-- 9. Add webapp_auth_enabled feature flag for controlling login/register access
INSERT INTO feature_flags (flag_name, display_name, description, is_enabled, rollout_percentage, target_groups, metadata)
VALUES (
  'webapp_auth_enabled',
  'Webapp Authentication',
  'Enable login and registration on the webapp. When disabled, /login and /register routes will redirect to landing page.',
  FALSE,
  0,
  ARRAY['all'],
  '{"note": "Enable when ready to accept webapp users"}'::JSONB
)
ON CONFLICT (flag_name) DO NOTHING;

-- 10. Add waitlist_enabled feature flag
INSERT INTO feature_flags (flag_name, display_name, description, is_enabled, rollout_percentage, target_groups, metadata)
VALUES (
  'waitlist_enabled',
  'Waitlist Signup',
  'Show "Join Waitlist" button on landing page instead of app store buttons.',
  TRUE,
  100,
  ARRAY['all'],
  '{"note": "Disable after app launch to show app store buttons"}'::JSONB
)
ON CONFLICT (flag_name) DO NOTHING;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION join_waitlist TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_waitlist_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_waitlist_subscribers TO authenticated;
GRANT EXECUTE ON FUNCTION update_waitlist_status TO authenticated;
GRANT EXECUTE ON FUNCTION export_waitlist_emails TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Waitlist feature installed successfully!';
  RAISE NOTICE 'New table: waitlist_subscribers';
  RAISE NOTICE 'New functions: join_waitlist, get_waitlist_stats, get_waitlist_subscribers, update_waitlist_status, export_waitlist_emails';
  RAISE NOTICE 'New feature flags: webapp_auth_enabled, waitlist_enabled';
END $$;
