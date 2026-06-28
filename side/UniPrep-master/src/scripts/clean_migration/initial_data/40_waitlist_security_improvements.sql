-- ============================================================================
-- 40_waitlist_security_improvements.sql
-- Security & UX Improvements for Waitlist Feature
-- ============================================================================
-- Adds:
-- 1. Rate limiting table and functions
-- 2. Bulk status update function
-- 3. Send invite email function (integrates with notification system)
-- 4. IP-based spam protection
-- ============================================================================

-- 0. Add ip_address column to waitlist_subscribers if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'waitlist_subscribers' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE waitlist_subscribers ADD COLUMN ip_address INET;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'waitlist_subscribers' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE waitlist_subscribers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Drop existing join_waitlist function (old version without IP parameter)
DROP FUNCTION IF EXISTS join_waitlist(TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS join_waitlist(TEXT, TEXT, TEXT, TEXT, JSONB, INET);

-- 1. Create rate limiting table for waitlist submissions
CREATE TABLE IF NOT EXISTS waitlist_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address INET NOT NULL,
  email_hash TEXT, -- SHA256 hash of email for privacy
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_ip ON waitlist_rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_blocked ON waitlist_rate_limits(blocked_until) WHERE blocked_until IS NOT NULL;

-- Clean up old rate limit records (run periodically)
CREATE OR REPLACE FUNCTION cleanup_waitlist_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete records older than 24 hours
  DELETE FROM waitlist_rate_limits
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- 2. Enhanced join_waitlist function with rate limiting
CREATE OR REPLACE FUNCTION join_waitlist(
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'landing_page',
  p_locale TEXT DEFAULT 'az',
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscriber_id UUID;
  v_existing RECORD;
  v_rate_limit RECORD;
  v_max_attempts_per_hour INTEGER := 5; -- Max 5 attempts per IP per hour
  v_max_attempts_per_day INTEGER := 10; -- Max 10 attempts per IP per day
  v_block_duration INTERVAL := '1 hour'; -- Block for 1 hour after exceeding limit
BEGIN
  -- Validate email format
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  -- Rate limiting check (if IP provided)
  IF p_ip_address IS NOT NULL THEN
    -- Check if IP is currently blocked
    SELECT * INTO v_rate_limit
    FROM waitlist_rate_limits
    WHERE ip_address = p_ip_address
    AND (blocked_until IS NULL OR blocked_until > NOW())
    ORDER BY last_attempt_at DESC
    LIMIT 1;

    IF v_rate_limit.blocked_until IS NOT NULL AND v_rate_limit.blocked_until > NOW() THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'rate_limited',
        'retry_after', EXTRACT(EPOCH FROM (v_rate_limit.blocked_until - NOW()))::INTEGER
      );
    END IF;

    -- Count attempts in last hour
    IF v_rate_limit.id IS NOT NULL THEN
      IF v_rate_limit.first_attempt_at > NOW() - INTERVAL '1 hour' 
         AND v_rate_limit.attempt_count >= v_max_attempts_per_hour THEN
        -- Block this IP
        UPDATE waitlist_rate_limits
        SET blocked_until = NOW() + v_block_duration,
            last_attempt_at = NOW()
        WHERE id = v_rate_limit.id;
        
        RETURN jsonb_build_object(
          'success', false, 
          'error', 'rate_limited',
          'message', 'Too many attempts. Please try again later.',
          'retry_after', EXTRACT(EPOCH FROM v_block_duration)::INTEGER
        );
      END IF;

      -- Update attempt count
      UPDATE waitlist_rate_limits
      SET attempt_count = attempt_count + 1,
          last_attempt_at = NOW()
      WHERE id = v_rate_limit.id;
    ELSE
      -- First attempt from this IP
      INSERT INTO waitlist_rate_limits (ip_address, email_hash)
      VALUES (p_ip_address, encode(sha256(LOWER(TRIM(p_email))::bytea), 'hex'));
    END IF;
  END IF;

  -- Check if email already exists
  SELECT id, status INTO v_existing
  FROM waitlist_subscribers
  WHERE LOWER(email) = LOWER(TRIM(p_email));

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'unsubscribed' THEN
      -- Re-subscribe
      UPDATE waitlist_subscribers
      SET status = 'pending', 
          updated_at = NOW(),
          ip_address = p_ip_address
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', true, 'message', 'resubscribed', 'id', v_existing.id);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'already_subscribed');
    END IF;
  END IF;

  -- Insert new subscriber
  INSERT INTO waitlist_subscribers (email, name, source, locale, metadata, ip_address)
  VALUES (LOWER(TRIM(p_email)), TRIM(p_name), p_source, p_locale, p_metadata, p_ip_address)
  RETURNING id INTO v_subscriber_id;

  RETURN jsonb_build_object('success', true, 'message', 'subscribed', 'id', v_subscriber_id);
END;
$$;

-- 3. Bulk status update function for admin
CREATE OR REPLACE FUNCTION bulk_update_waitlist_status(
  p_subscriber_ids UUID[],
  p_status TEXT,
  p_send_email BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER := 0;
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

  -- Update all subscribers
  UPDATE waitlist_subscribers
  SET 
    status = p_status,
    invited_at = CASE WHEN p_status = 'invited' THEN NOW() ELSE invited_at END,
    registered_at = CASE WHEN p_status = 'registered' THEN NOW() ELSE registered_at END,
    updated_at = NOW()
  WHERE id = ANY(p_subscriber_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- If sending emails and status is 'invited', queue notifications
  IF p_send_email AND p_status = 'invited' THEN
    FOR v_subscriber IN 
      SELECT id, email, name, locale 
      FROM waitlist_subscribers 
      WHERE id = ANY(p_subscriber_ids)
    LOOP
      -- Insert into waitlist email queue (processed by notification processor)
      INSERT INTO waitlist_email_queue (
        subscriber_id,
        recipient_email,
        recipient_name,
        template_name,
        locale,
        metadata,
        created_at
      ) VALUES (
        v_subscriber.id,
        v_subscriber.email,
        v_subscriber.name,
        'waitlist_invitation_' || COALESCE(v_subscriber.locale, 'az'),
        COALESCE(v_subscriber.locale, 'az'),
        jsonb_build_object('subscriber_id', v_subscriber.id),
        NOW()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'updated_count', v_updated_count,
    'emails_queued', CASE WHEN p_send_email AND p_status = 'invited' THEN v_updated_count ELSE 0 END
  );
END;
$$;

-- 4. Create waitlist email queue table (separate from notification_queue which is for registered users)
CREATE TABLE IF NOT EXISTS waitlist_email_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscriber_id UUID REFERENCES waitlist_subscribers(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  template_name TEXT NOT NULL,
  locale TEXT DEFAULT 'az',
  metadata JSONB DEFAULT '{}'::JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email_queue_status ON waitlist_email_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_waitlist_email_queue_subscriber ON waitlist_email_queue(subscriber_id);

-- 5. Function to get pending waitlist emails (for notification processor to handle)
CREATE OR REPLACE FUNCTION get_pending_waitlist_emails(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  subscriber_id UUID,
  recipient_email TEXT,
  recipient_name TEXT,
  template_name TEXT,
  locale TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE waitlist_email_queue weq
  SET status = 'processing', last_attempt_at = NOW(), attempts = attempts + 1
  WHERE weq.id IN (
    SELECT weq2.id FROM waitlist_email_queue weq2
    WHERE weq2.status = 'pending'
    ORDER BY weq2.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING weq.id, weq.subscriber_id, weq.recipient_email, weq.recipient_name, weq.template_name, weq.locale, weq.metadata;
END;
$$;

-- 6. Function to mark waitlist email as sent/failed
CREATE OR REPLACE FUNCTION update_waitlist_email_status(
  p_email_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE waitlist_email_queue
  SET 
    status = p_status,
    sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
    error_message = p_error_message
  WHERE id = p_email_id;
END;
$$;

-- 7. Add email templates for waitlist (one per language, matching existing schema)
INSERT INTO notification_templates (template_name, template_type, title, subject, body, variables, language, is_active)
VALUES
  ('waitlist_invitation_az', 'email', 'Elmly-yə Dəvət', 'Elmly-yə qoşulmağa dəvət olunursunuz!', 
   E'Salam {{name}},\n\nƏla xəbər! Siz Elmly gözləmə siyahısından seçildiniz - şəxsi imtahan hazırlığı köməkçiniz.\n\nHesabınızı yaratmaq və imtahan uğuruna gedən yolunuza başlamaq üçün aşağıdakı linkə klikləyin:\n{{signup_link}}\n\nNə əldə edəcəksiniz:\n• Minlərlə məşq sualına giriş\n• AI dəstəkli tədris fikirləri\n• Fərdiləşdirilmiş tədris planları\n• İrəliləyiş izləmə və analitika\n\nSizi aramızda görmək bizi sevindirir!\n\nHörmətlə,\nElmly Komandası',
   ARRAY['name', 'signup_link'], 'az', TRUE),
  ('waitlist_invitation_en', 'email', 'Elmly Invitation', 'You''re Invited to Join Elmly!',
   E'Hi {{name}},\n\nGreat news! You''ve been selected from our waitlist to join Elmly - your personal exam preparation companion.\n\nClick the link below to create your account and start your journey to exam success:\n{{signup_link}}\n\nWhat you''ll get:\n• Access to thousands of practice questions\n• AI-powered study insights\n• Personalized study plans\n• Progress tracking and analytics\n\nWe''re excited to have you on board!\n\nBest regards,\nThe Elmly Team',
   ARRAY['name', 'signup_link'], 'en', TRUE),
  ('waitlist_invitation_ru', 'email', 'Приглашение в Elmly', 'Вы приглашены присоединиться к Elmly!',
   E'Привет {{name}},\n\nОтличные новости! Вы были выбраны из нашего списка ожидания, чтобы присоединиться к Elmly - вашему персональному помощнику в подготовке к экзаменам.\n\nНажмите на ссылку ниже, чтобы создать свою учетную запись и начать путь к успеху на экзамене:\n{{signup_link}}\n\nЧто вы получите:\n• Доступ к тысячам практических вопросов\n• Аналитика обучения на основе ИИ\n• Персонализированные учебные планы\n• Отслеживание прогресса и аналитика\n\nМы рады видеть вас в нашей команде!\n\nС уважением,\nКоманда Elmly',
   ARRAY['name', 'signup_link'], 'ru', TRUE)
ON CONFLICT (template_name) DO NOTHING;

-- Grant permissions
GRANT EXECUTE ON FUNCTION join_waitlist TO anon, authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_waitlist_status TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_waitlist_rate_limits TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_waitlist_emails TO service_role;
GRANT EXECUTE ON FUNCTION update_waitlist_email_status TO service_role;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Waitlist security improvements installed!';
  RAISE NOTICE 'New tables: waitlist_rate_limits, waitlist_email_queue';
  RAISE NOTICE 'Updated function: join_waitlist (with rate limiting)';
  RAISE NOTICE 'New functions: bulk_update_waitlist_status, cleanup_waitlist_rate_limits, get_pending_waitlist_emails, update_waitlist_email_status';
  RAISE NOTICE 'New templates: waitlist_invitation_az, waitlist_invitation_en, waitlist_invitation_ru';
END $$;
