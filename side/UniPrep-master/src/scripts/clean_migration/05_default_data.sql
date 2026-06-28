-- ============================================================================
-- 05_default_data.sql
-- Elmly Database - All Default/Seed Data
-- ============================================================================
-- Purpose: Insert ALL default settings, feature flags, templates, and
--          reference data for a fresh Supabase instance
-- Depends on: 01_base_schema.sql, 04_functions_triggers.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from all Elmly & Elmly-Admin SQL stages
-- ============================================================================

-- ============================================================================
-- SECTION 1: SYSTEM SETTINGS (Admin S6, S10, S10.3)
-- ============================================================================

-- 1.1 General Settings
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('general', 'app_name', '"Elmly"', 'string', 'Application name', TRUE, FALSE, FALSE, '"Elmly"'),
  ('general', 'app_version', '"1.0.0"', 'string', 'Current application version', TRUE, FALSE, FALSE, '"1.0.0"'),
  ('general', 'maintenance_mode', 'false', 'boolean', 'Enable maintenance mode', TRUE, FALSE, TRUE, 'false'),
  ('general', 'maintenance_message_az', '"Sistem texniki xidmət altındadır. Zəhmət olmasa sonra yenidən cəhd edin."', 'string', 'Maintenance message (Azerbaijani)', TRUE, FALSE, FALSE, '"Sistem texniki xidmət altındadır."'),
  ('general', 'maintenance_message_en', '"System is under maintenance. Please try again later."', 'string', 'Maintenance message (English)', TRUE, FALSE, FALSE, '"System is under maintenance."'),
  ('general', 'maintenance_message_ru', '"Система находится на техническом обслуживании. Пожалуйста, попробуйте позже."', 'string', 'Maintenance message (Russian)', TRUE, FALSE, FALSE, '"Система находится на техническом обслуживании."'),
  ('general', 'api_base_url', '"https://api.elmly.az"', 'string', 'API base URL', FALSE, FALSE, TRUE, '"https://api.elmly.az"'),
  ('general', 'support_email', '"elmlyapp@gmail.com"', 'string', 'Support email address', TRUE, FALSE, FALSE, '"elmlyapp@gmail.com"'),
  ('general', 'support_phone', '"+994XXXXXXXXX"', 'string', 'Support phone number', TRUE, FALSE, FALSE, '"+994XXXXXXXXX"'),
  ('general', 'min_app_version', '"1.0.0"', 'string', 'Minimum required app version', TRUE, FALSE, FALSE, '"1.0.0"'),
  ('general', 'force_update', 'false', 'boolean', 'Force app update', TRUE, FALSE, FALSE, 'false')
ON CONFLICT (key) DO NOTHING;

-- 1.2 Notification Settings
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('notification', 'email_enabled', 'true', 'boolean', 'Enable email notifications', FALSE, FALSE, FALSE, 'true'),
  ('notification', 'push_enabled', 'true', 'boolean', 'Enable push notifications', TRUE, FALSE, FALSE, 'true'),
  ('notification', 'sms_enabled', 'false', 'boolean', 'Enable SMS notifications', FALSE, FALSE, FALSE, 'false'),
  ('notification', 'in_app_enabled', 'true', 'boolean', 'Enable in-app notifications', TRUE, FALSE, FALSE, 'true'),
  ('notification', 'email_from', '"Elmly <noreply@elmly.az>"', 'string', 'Email from address', FALSE, FALSE, FALSE, '"Elmly <noreply@elmly.az>"'),
  ('notification', 'notification_retention_days', '90', 'number', 'Days to keep notifications', FALSE, FALSE, FALSE, '90'),
  ('notification', 'max_notifications_per_user', '100', 'number', 'Maximum notifications per user', FALSE, FALSE, FALSE, '100')
ON CONFLICT (key) DO NOTHING;

-- 1.3 Security Settings
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('security', 'password_min_length', '8', 'number', 'Minimum password length', TRUE, FALSE, FALSE, '8'),
  ('security', 'password_require_uppercase', 'true', 'boolean', 'Require uppercase letter', TRUE, FALSE, FALSE, 'true'),
  ('security', 'password_require_lowercase', 'true', 'boolean', 'Require lowercase letter', TRUE, FALSE, FALSE, 'true'),
  ('security', 'password_require_number', 'true', 'boolean', 'Require number', TRUE, FALSE, FALSE, 'true'),
  ('security', 'password_require_special', 'false', 'boolean', 'Require special character', TRUE, FALSE, FALSE, 'false'),
  ('security', 'session_timeout_minutes', '1440', 'number', 'Session timeout (24 hours)', FALSE, FALSE, FALSE, '1440'),
  ('security', 'max_login_attempts', '5', 'number', 'Maximum login attempts before lockout', FALSE, FALSE, FALSE, '5'),
  ('security', 'lockout_duration_minutes', '30', 'number', 'Account lockout duration', FALSE, FALSE, FALSE, '30'),
  ('security', 'api_rate_limit_per_minute', '60', 'number', 'API rate limit per minute', FALSE, FALSE, FALSE, '60'),
  ('security', 'api_rate_limit_per_hour', '1000', 'number', 'API rate limit per hour', FALSE, FALSE, FALSE, '1000')
ON CONFLICT (key) DO NOTHING;

-- 1.4 Payment Settings (Phase 8)
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('payment', 'commission_rate',        '0.15',    'number',  'Platform commission rate (0.15 = 15%)',                          FALSE, TRUE,  FALSE, '0.15'),
  ('payment', 'min_payout_amount',      '50',      'number',  'Minimum payout amount in EUR before teacher can request payout', FALSE, FALSE, FALSE, '50'),
  ('payment', 'currency',               '"EUR"',   'string',  'Stripe charge currency (EUR for Italy-registered account)',       TRUE,  FALSE, FALSE, '"EUR"'),
  ('payment', 'stripe_mode',            '"test"',  'string',  'Stripe mode: test or live',                                      TRUE,  FALSE, FALSE, '"test"'),
  ('payment', 'stripe_publishable_key', '""',      'string',  'Stripe publishable key (pk_test_... or pk_live_...)',             TRUE,  FALSE, FALSE, '""'),
  ('payment', 'bookings_paid',          'false',   'boolean', 'Whether teacher bookings require Stripe payment (Phase 8B)',     TRUE,  FALSE, FALSE, 'false'),
  ('payment', 'subscriptions_enabled',  'false',   'boolean', 'Whether subscription billing is active (Phase 8C)',              TRUE,  FALSE, FALSE, 'false'),
  ('payment', 'payout_schedule',        '"manual"','string',  'Payout schedule: manual, monthly, or weekly',                   FALSE, FALSE, FALSE, '"manual"')
ON CONFLICT (key) DO NOTHING;

-- 1.5 Legal Settings (Admin S10)
INSERT INTO system_settings (key, value, category, data_type, description, is_sensitive, is_public)
VALUES
  ('terms_of_service', '""', 'general', 'string', 'Custom Terms of Service content. Leave empty to use default template.', false, true),
  ('privacy_policy', '""', 'general', 'string', 'Custom Privacy Policy content. Leave empty to use default template.', false, true),
  ('webapp_url', '"https://www.elmly.app"', 'general', 'string', 'Base URL of the webapp for legal document links in mobile app.', false, true)
ON CONFLICT (key) DO NOTHING;

-- 1.6 Website URL Setting (Admin S6)
INSERT INTO system_settings (key, value, category, description, is_sensitive, data_type, is_public)
VALUES
  ('website_url', '"https://www.elmly.app"', 'general', 'Official website URL displayed in mobile app and web app', false, 'string', true)
ON CONFLICT (key) DO NOTHING;

-- 1.7 Walkthrough Setting (S10.3)
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('general', 'walkthrough_enabled', 'true', 'boolean', 'Enable interactive app walkthrough for new users. When disabled, the walkthrough and Reset App Tour option will be hidden from all users.', TRUE, FALSE, FALSE, 'true')
ON CONFLICT (key) DO NOTHING;

-- 1.8 Social Media Links (Landing Page Footer)
INSERT INTO system_settings (category, key, value, data_type, description, is_public, is_sensitive, requires_restart, default_value)
VALUES
  ('general', 'social_facebook', '""', 'string', 'Facebook page URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_instagram', '""', 'string', 'Instagram profile URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_twitter', '""', 'string', 'Twitter/X profile URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_linkedin', '""', 'string', 'LinkedIn page URL (leave empty to hide)', TRUE, FALSE, FALSE, '""'),
  ('general', 'social_tiktok', '""', 'string', 'TikTok profile URL (leave empty to hide)', TRUE, FALSE, FALSE, '""')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- SECTION 2: FEATURE FLAGS (Admin S6)
-- ============================================================================

INSERT INTO feature_flags (flag_name, display_name, description, is_enabled, rollout_percentage, target_groups, metadata)
VALUES
  ('ai_explanations', 'AI Explanations', 'Enable AI-powered answer explanations', TRUE, 100, ARRAY['students'], '{"priority": "high"}'::JSONB),
  ('ai_insights', 'AI Insights', 'Enable AI-powered study insights', TRUE, 100, ARRAY['students'], '{"priority": "high"}'::JSONB),
  ('competitive_mode', 'Competitive Mode (AI Questions)', 'Enable competitive practice mode with AI-generated questions', TRUE, 100, ARRAY['students'], '{"priority": "medium"}'::JSONB),
  ('teacher_marketplace', 'Teacher Marketplace', 'Enable teacher booking marketplace', TRUE, 100, ARRAY['students'], '{"priority": "medium"}'::JSONB),
  ('leaderboards', 'Leaderboards', 'Enable student leaderboards', TRUE, 100, ARRAY['students'], '{"priority": "medium"}'::JSONB),
  ('dark_mode', 'Dark Mode', 'Enable dark mode theme', TRUE, 100, ARRAY['all'], '{"priority": "low"}'::JSONB),
  ('offline_mode', 'Offline Mode', 'Enable offline practice mode with local question storage', TRUE, 100, ARRAY['students'], '{"priority": "medium", "status": "stable"}'::JSONB),
  ('teacher_registration', 'Teacher Registration', 'Allow new teachers to register on the platform', TRUE, 100, ARRAY['all'], NULL),
  -- Phase 1
  ('goal_setting', 'Goal Setting', 'Enable daily question/time goal setting for students', TRUE, 100, ARRAY['students'], '{"phase": 1}'::JSONB),
  ('study_plans', 'Study Plans', 'Enable AI-generated weekly study plan based on exam date and goals', TRUE, 100, ARRAY['students'], '{"phase": 1}'::JSONB),
  -- Phase 4
  ('chat_read_receipts', 'Chat Read Receipts', 'Show read receipts (delivered/read timestamps) in messaging', TRUE, 100, ARRAY['all'], '{"phase": 4}'::JSONB),
  ('chat_file_sharing', 'Chat File Sharing', 'Allow file and image sharing in chat messages', FALSE, 0, ARRAY['all'], '{"phase": 4, "note": "enable after QA"}'::JSONB),
  -- Phase 5
  ('booking_reminders', 'Booking Reminders', 'Send push/email reminders before upcoming booked sessions', TRUE, 100, ARRAY['all'], '{"phase": 5}'::JSONB),
  ('session_notes', 'Session Notes', 'Allow teachers to add private notes after completing a session', TRUE, 100, ARRAY['teachers'], '{"phase": 5}'::JSONB),
  -- Phase 6
  ('score_prediction', 'Exam Score Prediction', 'Show AI-powered predicted university entrance exam score on home screen', TRUE, 100, ARRAY['students'], '{"phase": 6}'::JSONB),
  -- Phase 7
  ('referral_program', 'Referral Program', 'Enable referral codes and reward system for inviting new users', FALSE, 0, ARRAY['all'], '{"phase": 7, "note": "enable after referral backend is deployed"}'::JSONB),
  -- Teacher
  ('teacher_availability', 'Teacher Availability', 'Enable teacher availability management (weekly schedule and time off)', TRUE, 100, ARRAY['teachers'], '{"note": "Controls visibility of availability management UI for teachers"}'::JSONB),
  -- Security
  ('screenshot_prevention', 'Screenshot Prevention', 'Prevent screenshots and screen recording on exam and practice screens', TRUE, 100, ARRAY['all'], '{"note": "Disable temporarily for development/marketing screenshots"}'::JSONB),
  -- Pre-Launch
  ('webapp_auth_enabled', 'Webapp Authentication', 'Enable login and registration on the webapp. When disabled, /login and /register routes will redirect to landing page.', FALSE, 0, ARRAY['all'], '{"note": "Enable when ready to accept webapp users"}'::JSONB),
  ('waitlist_enabled', 'Waitlist Signup', 'Show "Join Waitlist" button on landing page instead of app store buttons.', TRUE, 100, ARRAY['all'], '{"note": "Disable after app launch to show app store buttons"}'::JSONB)
ON CONFLICT (flag_name) DO NOTHING;

-- ============================================================================
-- SECTION 3: NOTIFICATION TEMPLATES (Admin S6 + S7)
-- ============================================================================

-- 3.1 Email Templates (Admin S6)
INSERT INTO notification_templates (template_name, template_type, title, subject, body, variables, language, is_active)
VALUES
  ('welcome_email_az', 'email', 'Elmly-ə xoş gəlmisiniz!', 'Elmly-ə xoş gəlmisiniz!', E'Salam {{user_name}},\n\nElmly platformasına xoş gəlmisiniz! Hesabınız uğurla yaradıldı.\n\nİndi imtahanlara hazırlaşmağa başlaya bilərsiniz.\n\nUğurlar!', ARRAY['user_name'], 'az', TRUE),
  ('welcome_email_en', 'email', 'Welcome to Elmly!', 'Welcome to Elmly!', E'Hello {{user_name}},\n\nWelcome to Elmly! Your account has been created successfully.\n\nYou can now start preparing for your exams.\n\nGood luck!', ARRAY['user_name'], 'en', TRUE),
  ('welcome_email_ru', 'email', E'Добро пожаловать в Elmly!', E'Добро пожаловать в Elmly!', E'Здравствуйте, {{user_name}},\n\nДобро пожаловать в Elmly! Ваш аккаунт успешно создан.\n\nТеперь вы можете начать подготовку к экзаменам.\n\nУдачи!', ARRAY['user_name'], 'ru', TRUE)
ON CONFLICT (template_name) DO NOTHING;

-- 3.2 Push Notification Templates (Admin S6)
INSERT INTO notification_templates (template_name, template_type, title, body, variables, language, is_active)
VALUES
  ('exam_reminder_az', 'push', E'İmtahan xatırlatması', E'Salam {{user_name}}! Sizin {{exam_name}} imtahanınız {{time_remaining}} sonra başlayır.', ARRAY['user_name', 'exam_name', 'time_remaining'], 'az', TRUE),
  ('exam_reminder_en', 'push', 'Exam Reminder', 'Hello {{user_name}}! Your {{exam_name}} exam starts in {{time_remaining}}.', ARRAY['user_name', 'exam_name', 'time_remaining'], 'en', TRUE),
  ('exam_reminder_ru', 'push', E'Напоминание об экзамене', E'Здравствуйте, {{user_name}}! Ваш экзамен {{exam_name}} начнется через {{time_remaining}}.', ARRAY['user_name', 'exam_name', 'time_remaining'], 'ru', TRUE)
ON CONFLICT (template_name) DO NOTHING;

-- 3.2b Waitlist Invitation Email Templates
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

-- 3.3 Admin Notification Templates (Admin S7)
INSERT INTO notification_templates (name, title, body, channels, variables, category) VALUES
  ('Welcome Message',     E'Elmly-ə xoş gəlmisiniz! \U0001F393',
   'Salam {{user_name}}, Elmly-ə xoş gəlmisiniz! İmtahan hazırlığınıza bu gün başlayın.',
   ARRAY['in_app', 'push'], ARRAY['user_name'], 'general'),
  ('New Exam Available',  E'Yeni Mock İmtahan! \U0001F4DD',
   'Yeni bir mock imtahan mövcuddur. Biliklərinizi sınayın və irəliləyişinizi izləyin!',
   ARRAY['in_app', 'push'], ARRAY[]::TEXT[], 'exam'),
  ('Study Reminder',      E'Oxumağa vaxtdır! \U0001F4DA',
   E'Salam {{user_name}}, bu gün məşq etməyi unutmayın. Ardıcıllıq uğurun açarıdır!',
   ARRAY['in_app', 'push'], ARRAY['user_name'], 'reminder'),
  ('Achievement Unlocked',E'Nailiyyət Açıldı! \U0001F3C6',
   E'Təbriklər {{user_name}}! Yeni bir nailiyyət qazandınız.',
   ARRAY['in_app', 'push'], ARRAY['user_name'], 'achievement'),
  ('System Announcement', E'Vacib Elan \U0001F4E2',
   '{{message}}',
   ARRAY['in_app', 'push'], ARRAY['message'], 'announcement'),
  ('Maintenance Notice',  E'Planlaşdırılmış Texniki Xidmət \U0001F527',
   'Elmly {{date}} tarixində texniki xidmət keçirəcək. Narahatlığa görə üzr istəyirik.',
   ARRAY['in_app', 'push', 'email'], ARRAY['date'], 'announcement'),
  ('Goal Reminder',       E'Oxumağa vaxtdır! \U0001F4DA',
   E'Salam {{user_name}}, planlaşdırılmış oxu vaxtınızdır. Gündəlik {{daily_questions}} sual hədəfinizi unutmayın!',
   ARRAY['in_app', 'push'], ARRAY['user_name', 'daily_questions'], 'reminder'),
  ('Goal Streak',         E'{{days}} Günlük Ardıcıllıq! \U0001F525',
   E'Təbriklər {{user_name}}! {{days}} gün ardıcıl olaraq gündəlik hədəflərinizi yerinə yetirdiniz. Davam edin!',
   ARRAY['in_app', 'push'], ARRAY['user_name', 'days'], 'achievement'),
  ('Weekly Plan Summary', E'Bu Həftənin Oxu Planı \U0001F4CB',
   E'Salam {{user_name}}, bu həftə diqqət edin: {{focus_subjects}}. Hədəf: {{target_questions}} sual.',
   ARRAY['in_app', 'push'], ARRAY['user_name', 'focus_subjects', 'target_questions'], 'reminder')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 4: SECURITY POLICIES (Admin S6)
-- ============================================================================

INSERT INTO security_policies (policy_name, policy_type, rules, is_active, enforcement_level, applies_to)
VALUES
  ('default_password_policy', 'password', '{
    "min_length": 8,
    "require_uppercase": true,
    "require_lowercase": true,
    "require_number": true,
    "require_special": false,
    "prevent_common_passwords": true,
    "prevent_username_in_password": true
  }'::JSONB, TRUE, 'strict', ARRAY['all']),
  
  ('default_session_policy', 'session', '{
    "timeout_minutes": 1440,
    "idle_timeout_minutes": 60,
    "max_concurrent_sessions": 3,
    "require_reauth_for_sensitive": true
  }'::JSONB, TRUE, 'strict', ARRAY['all']),
  
  ('default_rate_limit_policy', 'rate_limit', '{
    "requests_per_minute": 60,
    "requests_per_hour": 1000,
    "requests_per_day": 10000,
    "burst_allowance": 10
  }'::JSONB, TRUE, 'moderate', ARRAY['all']),
  
  ('admin_access_policy', 'access', '{
    "require_2fa": false,
    "ip_whitelist_enabled": false,
    "allowed_ip_ranges": [],
    "session_timeout_minutes": 480
  }'::JSONB, TRUE, 'strict', ARRAY['admins'])
ON CONFLICT (policy_name) DO NOTHING;

-- ============================================================================
-- SECTION 5: LEADERBOARD SETTINGS (S10.2)
-- ============================================================================

INSERT INTO leaderboard_settings (setting_key, setting_value, description) VALUES
  ('monthly_decay_enabled', 'true', 'Enable automatic monthly score decay'),
  ('monthly_decay_percentage', '10', 'Percentage to decay scores each month (0-100)'),
  ('base_elo_rating', '1200', 'Starting ELO rating for new students'),
  ('min_elo_rating', '1000', 'Minimum ELO rating'),
  ('max_elo_rating', '2000', 'Maximum ELO rating'),
  ('k_factor_new', '40', 'K-factor for new users (< 10 exams)'),
  ('k_factor_regular', '20', 'K-factor for regular users (10-30 exams)'),
  ('k_factor_experienced', '10', 'K-factor for experienced users (> 30 exams)'),
  ('streak_bonus_multiplier', '5', 'Points per day of streak'),
  ('achievement_bonus_multiplier', '10', 'Points per achievement'),
  ('consistency_bonus', '50', 'Bonus for low accuracy variance'),
  ('subject_mastery_bonus', '25', 'Bonus per mastered subject (>80% accuracy)'),
  ('current_season', '{"name": "2026-02", "start": "2026-02-01", "end": "2026-02-28"}', 'Current leaderboard season')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- SECTION 6: AI CONFIGURATION (Admin S5.5/17 - complete 6-row set)
-- ============================================================================

-- 6.1 Global Settings
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'global_settings', 'system', 'Global AI system settings',
  jsonb_build_object(
    'enabled', true, 'default_provider', 'deepseek', 'default_model', 'deepseek-chat',
    'default_temperature', 0.7, 'default_max_tokens', 1000,
    'fallback_provider', 'openai', 'fallback_model', 'gpt-3.5-turbo',
    'auto_fallback_enabled', true, 'log_all_requests', true, 'quality_threshold', 0.5
  ), true, true
) ON CONFLICT (config_key) DO NOTHING;

-- 6.2 Rate Limits
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'rate_limits', 'security', 'Rate limiting configuration per feature',
  jsonb_build_object(
    'global', jsonb_build_object('requests_per_minute', 100, 'requests_per_hour', 1000, 'requests_per_day', 10000),
    'per_user', jsonb_build_object('requests_per_minute', 10, 'requests_per_hour', 100, 'requests_per_day', 500),
    'per_feature', jsonb_build_object(
      'question_generation', jsonb_build_object('requests_per_minute', 30, 'requests_per_hour', 300),
      'answer_explanation', jsonb_build_object('requests_per_minute', 50, 'requests_per_hour', 500),
      'student_insights', jsonb_build_object('requests_per_minute', 20, 'requests_per_hour', 200),
      'prompt_testing', jsonb_build_object('requests_per_minute', 10, 'requests_per_hour', 50)
    ),
    'enabled', true, 'block_on_limit', false, 'notify_on_limit', true
  ), true, true
) ON CONFLICT (config_key) DO NOTHING;

-- 6.3 Feature Flags
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'feature_flags', 'features', 'Feature flags for AI capabilities',
  jsonb_build_object(
    'question_generation', jsonb_build_object('enabled', true, 'beta', false, 'allowed_models', '["deepseek-chat","gpt-4","gpt-3.5-turbo"]'::jsonb),
    'answer_explanation', jsonb_build_object('enabled', true, 'beta', false, 'allowed_models', '["deepseek-chat","gpt-4"]'::jsonb),
    'student_insights', jsonb_build_object('enabled', true, 'beta', false, 'allowed_models', '["deepseek-chat","gpt-4"]'::jsonb),
    'prompt_testing', jsonb_build_object('enabled', true, 'beta', false, 'admin_only', true),
    'quality_review', jsonb_build_object('enabled', true, 'auto_flag_threshold', 0.5, 'require_review', true)
  ), true, true
) ON CONFLICT (config_key) DO NOTHING;

-- 6.4 Emergency Controls
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'emergency_controls', 'security', 'Emergency shutdown and throttle controls',
  jsonb_build_object(
    'emergency_mode', false, 'emergency_message', 'AI services are temporarily unavailable. Please try again later.',
    'throttle_mode', false, 'throttle_percentage', 100,
    'maintenance_mode', false, 'maintenance_message', 'AI services are under maintenance.',
    'allowed_features_during_emergency', '[]'::jsonb,
    'notify_admins', true, 'last_emergency_at', null, 'last_emergency_reason', null
  ), true, true
) ON CONFLICT (config_key) DO NOTHING;

-- 6.5 Cost Controls
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'cost_controls', 'performance', 'Cost optimization and controls',
  jsonb_build_object(
    'daily_budget_usd', 50.0, 'monthly_budget_usd', 1000.0,
    'auto_disable_on_budget', false, 'alert_at_percentage', 80,
    'prefer_cheaper_models', false, 'max_cost_per_request', 0.50,
    'track_per_feature', true, 'optimize_token_usage', true
  ), true, true
) ON CONFLICT (config_key) DO NOTHING;

-- 6.6 Provider Configuration
INSERT INTO ai_configuration (config_key, config_category, description, config_value, is_system, is_active)
VALUES (
  'provider_config', 'system', 'AI provider configurations and priorities',
  jsonb_build_object(
    'deepseek', jsonb_build_object('enabled', true, 'priority', 1, 'api_key_configured', true, 'models', '["deepseek-chat"]'::jsonb, 'timeout_ms', 30000, 'retry_attempts', 3),
    'openai', jsonb_build_object('enabled', true, 'priority', 2, 'api_key_configured', false, 'models', '["gpt-4","gpt-3.5-turbo"]'::jsonb, 'timeout_ms', 30000, 'retry_attempts', 3),
    'anthropic', jsonb_build_object('enabled', false, 'priority', 3, 'api_key_configured', false, 'models', '["claude-3-opus","claude-3-sonnet"]'::jsonb, 'timeout_ms', 30000, 'retry_attempts', 3)
  ), true, true
) ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- SECTION 7: AI PROMPTS (Admin S5.5)
-- ============================================================================

-- 7.1 Question Generation Prompt
INSERT INTO ai_prompts (
  name, description, category, system_prompt, user_prompt_template,
  model, temperature, max_tokens, tags, variables, example_input
) VALUES (
  'question_generation_default',
  E'Rəqabət rejimi üçün sual generasiyası (Azərbaycan dilində)',
  'question_generation',
  E'Siz {{subject_name}} fənni üzrə ekspert müəllimsiniz və universitet qəbul imtahanı sualları yaradırsınız.\n\n{{question_count}} çoxvariantlı sual yarat düzgün JSON massiv formatında.\n\nKRİTİK: YALNIZ düzgün JSON massiv qaytar. Bütün mətn dəyərləri MÜTLƏQ qoşa dırnaq içində olmalıdır.\n\nMÜTLƏQ Azərbaycan dilində yaz. Bütün suallar, cavablar və izahatlar Azərbaycan dilində olmalıdır.\n\nSUAL STRUKTURU:\nHər sual bunları ehtiva etməlidir:\n- questionText: Aydın, konkret sual (maks 150 söz, Azərbaycan dilində)\n- optionA, optionB, optionC, optionD, optionE: Beş mümkün variant (hər biri maks 30 söz, Azərbaycan dilində)\n- correctAnswer: Tək hərf "A", "B", "C", "D", və ya "E"\n- difficulty: "easy", "medium", və ya "hard"\n- topic: Konkret mövzu adı (maks 50 simvol, Azərbaycan dilində)\n- explanation: ƏTRAFLı izahat (2-3 cümlə, Azərbaycan dilində)\n\nSUAL YAZMA QAYDALARI:\n1. ÖZÜNDƏ BÜTÜN MƏLUMATI SAXLA: Sual mətni bütün lazımi məlumatı ehtiva etməlidir\n2. "Aşağıdakı", "yuxarıdakı", "verilmiş", "göstərilən" kimi istinadlardan QAÇIN\n3. Əgər element, molekul, reaksiya və s. göstərmək lazımdırsa, onları SUAL MƏTNİNDƏ yazın\n4. Hər sual müstəqil və tam anlaşılan olmalıdır\n5. Şəkil, cədvəl və ya əlavə məlumat tələb etməyin',
  E'Generate {{question_count}} {{subject_name}} questions in valid JSON array format.\n\n{{#if weak_topics}}\nDISTRIBUTION:\n- 60% questions from weak topics: {{weak_topics}}\n- 40% general {{subject_name}} knowledge\n- Difficulty mix: {{difficulty_mix}}\n{{else}}\nDISTRIBUTION:\n- Balanced {{subject_name}} knowledge coverage\n- Difficulty mix: {{difficulty_mix}}\n{{/if}}',
  'deepseek-chat', 0.7, 6000,
  ARRAY['question_generation', 'competitive_mode', 'azerbaijani'],
  '{"question_count": "Number of questions", "subject_name": "Subject name", "weak_topics": "Comma-separated weak topics (optional)", "difficulty_mix": "Difficulty distribution"}',
  '{"question_count": 20, "subject_name": "Kimya", "weak_topics": "Kimyəvi rabitələr, Reaksiya növləri", "difficulty_mix": "30% easy, 50% medium, 20% hard"}'
) ON CONFLICT (name) DO NOTHING;

-- 7.2 Answer Explanation Prompt
INSERT INTO ai_prompts (
  name, description, category, system_prompt, user_prompt_template,
  model, temperature, max_tokens, tags, variables, example_input
) VALUES (
  'answer_explanation_default',
  E'Cavab izahı (Azərbaycan dilində, tələbəyə birbaşa müraciət)',
  'answer_explanation',
  E'Siz {{subject_name}} fənni üzrə ekspert müəllimsiniz və tələbənin mentoru kimi danışırsınız.\nTələbənin cavabının niyə səhv olduğunu və düzgün cavabın niyə doğru olduğunu izah edin.\n\nMÜTLƏQ Azərbaycan dilində JSON obyekti qaytarın:\n- explanation: Aydın izahat (3-4 cümlə, tələbəyə birbaşa müraciət edin: "Sənin cavabın...", "Sən...")\n- keyPoints: 2-3 əsas konsepsiya massivi\n- studyTip: Bir praktik məsləhət\n\nAydın, ruhlandırıcı və təhsil verici olun. Tələbəyə birbaşa müraciət edin.',
  E'Question: {{question_text}}\n\nStudent''s Answer: {{student_answer}}\nCorrect Answer: {{correct_answer}}\n\n{{#if option_texts}}\nAnswer Options:\n{{option_texts}}\n{{/if}}\n\nTələbənin cavabının niyə səhv olduğunu Azərbaycan dilində izah et. Tələbəyə birbaşa müraciət et ("Sənin cavabın...", "Sən...").',
  'deepseek-reasoner', 0.6, 1000,
  ARRAY['answer_explanation', 'tutoring', 'azerbaijani'],
  '{"question_text": "The question", "student_answer": "Student''s answer", "correct_answer": "Correct answer", "subject_name": "Subject name", "option_texts": "Answer options (optional)"}',
  '{"question_text": "Hüceyrənin enerji stansiyası hansıdır?", "student_answer": "Nüvə", "correct_answer": "Mitoxondriya", "subject_name": "Biologiya", "option_texts": "A) Nüvə B) Mitoxondriya C) Ribosoma D) Lizosoma E) Qolci aparatı"}'
) ON CONFLICT (name) DO NOTHING;

-- 7.3 Student Insights Prompt
INSERT INTO ai_prompts (
  name, description, category, system_prompt, user_prompt_template,
  model, temperature, max_tokens, tags, variables, example_input
) VALUES (
  'student_insights_default',
  E'Tələbə performans təhlili və fərdiləşdirilmiş məsləhətlər',
  'student_insights',
  E'Tələbənin performansını təhlil et və 3-5 qısa təhsil məsləhəti ver JSON massiv formatında.\nHər məsləhət bunları ehtiva etməlidir: type (recommendation/weak_area/strength/study_tip), title (maks 50 simvol), content (maks 200 simvol), priority (high/medium/low).\n\nMÜTLƏQ Azərbaycan dilində yaz. Tələbəyə birbaşa müraciət et ("Sənin...", "Sən...").',
  E'Performans: {{performance_data}}\n\nYalnız düzgün JSON massiv qaytar.',
  'deepseek-chat', 0.7, 1000,
  ARRAY['student_insights', 'analytics', 'azerbaijani'],
  '{"performance_data": "JSON string with subject performance data"}',
  '{"performance_data": "[{\"subject\":\"Riyaziyyat\",\"attempted\":50,\"correct\":35,\"accuracy\":70},{\"subject\":\"Fizika\",\"attempted\":40,\"correct\":25,\"accuracy\":62}]"}'
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SECTION 8: DAILY STUDY TIPS (S9.1)
-- ============================================================================

-- Motivation Tips (10 tips)
INSERT INTO daily_study_tips (category, tip_text, icon) VALUES
('motivation', 'Every expert was once a beginner. Keep pushing forward!', E'\U0001F4AA'),
('motivation', 'Success is the sum of small efforts repeated day in and day out.', E'\U0001F3AF'),
('motivation', 'Your future self will thank you for the work you put in today.', E'\U0001F31F'),
('motivation', E'Believe in yourself. You''re capable of amazing things!', E'\U00002728'),
('motivation', 'The only way to do great work is to love what you do.', E'\U00002764\U0000FE0F'),
('motivation', E'Don''t watch the clock; do what it does. Keep going.', E'\U000023F0'),
('motivation', 'You are one step closer to your goal with every question you answer.', E'\U0001F680'),
('motivation', 'Challenges are what make life interesting. Overcoming them is what makes life meaningful.', E'\U0001F3D4\U0000FE0F'),
('motivation', 'Your only limit is you. Break through it!', E'\U0001F48E'),
('motivation', 'Dream big, work hard, stay focused, and surround yourself with good people.', E'\U0001F305');

-- Technique Tips (10 tips)
INSERT INTO daily_study_tips (category, tip_text, icon) VALUES
('technique', 'Use the Pomodoro Technique: Study for 25 minutes, then take a 5-minute break.', E'\U0001F345'),
('technique', 'Active recall is more effective than passive reading. Test yourself regularly!', E'\U0001F9E0'),
('technique', 'Create mind maps to visualize connections between concepts.', E'\U0001F5FA\U0000FE0F'),
('technique', E'Teach what you learn to someone else - it''s the best way to solidify knowledge.', E'\U0001F465'),
('technique', 'Use spaced repetition: Review material at increasing intervals.', E'\U0001F4C5'),
('technique', 'Break complex topics into smaller, manageable chunks.', E'\U0001F9E9'),
('technique', 'Practice with past exam papers to familiarize yourself with question formats.', E'\U0001F4DD'),
('technique', 'Use mnemonic devices to remember difficult concepts or lists.', E'\U0001F3AD'),
('technique', 'Study the most challenging subjects when your mind is freshest.', E'\U0001F304'),
('technique', 'Create a dedicated study space free from distractions.', E'\U0000270D\U0000FE0F');

-- Health Tips (10 tips)
INSERT INTO daily_study_tips (category, tip_text, icon) VALUES
('health', 'Stay hydrated! Drink water regularly while studying to maintain focus.', E'\U0001F4A7'),
('health', 'Get 7-9 hours of sleep. Your brain consolidates learning during sleep.', E'\U0001F634'),
('health', 'Take regular breaks to stretch and move around. Your body needs it!', E'\U0001F9D8'),
('health', 'Eat brain-boosting foods: nuts, berries, fish, and dark chocolate.', E'\U0001F957'),
('health', 'Practice deep breathing exercises to reduce stress and improve concentration.', E'\U0001F32C\U0000FE0F'),
('health', 'Maintain good posture while studying to prevent back and neck pain.', E'\U0001FA91'),
('health', 'Exercise regularly - it improves memory and cognitive function.', E'\U0001F3C3'),
('health', 'Limit caffeine intake, especially in the evening, to ensure quality sleep.', E'\U00002615'),
('health', 'Take eye breaks: Look at something 20 feet away for 20 seconds every 20 minutes.', E'\U0001F441\U0000FE0F'),
('health', 'Practice mindfulness or meditation to improve focus and reduce anxiety.', E'\U0001F9E0');

-- Time Management Tips (10 tips)
INSERT INTO daily_study_tips (category, tip_text, icon) VALUES
('time-management', 'Create a study schedule and stick to it. Consistency is key!', E'\U0001F4C5'),
('time-management', 'Prioritize tasks using the Eisenhower Matrix: urgent vs. important.', E'\U0001F4CA'),
('time-management', 'Set specific, measurable goals for each study session.', E'\U0001F3AF'),
('time-management', 'Use a timer to track how long tasks actually take - it improves planning.', E'\U000023F1\U0000FE0F'),
('time-management', 'Tackle your most difficult task first thing in the morning.', E'\U0001F304'),
('time-management', 'Avoid multitasking - focus on one subject at a time for better retention.', E'\U0001F3AF'),
('time-management', E'Schedule regular review sessions to reinforce what you''ve learned.', E'\U0001F504'),
('time-management', 'Use a planner or app to track deadlines and assignments.', E'\U0001F4D4'),
('time-management', 'Build buffer time into your schedule for unexpected events.', E'\U000023F0'),
('time-management', 'Review your progress weekly and adjust your study plan accordingly.', E'\U0001F4C8');

-- ============================================================================
-- SECTION: BOOKING REMINDER NOTIFICATION EVENTS (Phase 5)
-- ============================================================================

INSERT INTO notification_events (event_type, event_name, description, channels, priority)
VALUES
  ('booking_reminder_24h',   'Booking Reminder 24h',   'Sent 24 hours before a confirmed session',   ARRAY['push','in_app']::TEXT[], 7),
  ('booking_reminder_1h',    'Booking Reminder 1h',    'Sent 1 hour before a confirmed session',     ARRAY['push','in_app']::TEXT[], 8),
  ('booking_reminder_15min', 'Booking Reminder 15min', 'Sent 15 minutes before a confirmed session', ARRAY['push','in_app']::TEXT[], 9),
  ('goal_reminder',          'Daily Goal Reminder',    'Sends a push notification reminding the student to study on their preferred days and time. Scheduled client-side based on student_goals.preferred_study_days and preferred_study_time.', ARRAY['push']::TEXT[], 7),
  ('goal_streak',            'Goal Streak Achievement', 'Sends a notification when a student achieves a consecutive goal streak', ARRAY['in_app','push']::TEXT[], 6),
  ('weekly_plan_summary',    'Weekly Plan Summary',    'Sends a weekly summary notification about the current week''s study plan focus subjects and targets. Disabled by default.', ARRAY['push']::TEXT[], 5)
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- SECTION: PAYMENT NOTIFICATION EVENTS (Phase 8B)
-- ============================================================================

INSERT INTO notification_events (event_type, event_name, description, channels, priority, enabled)
VALUES
  ('booking_accepted_payment_required', 'Booking Accepted - Payment Required',
   'Sent to student when teacher accepts their booking request and payment is required',
   ARRAY['push', 'in_app', 'email']::TEXT[], 8, TRUE),
  ('payment_succeeded', 'Payment Successful',
   'Sent to student when their payment is successfully processed',
   ARRAY['push', 'in_app']::TEXT[], 8, TRUE),
  ('payment_received', 'Payment Received',
   'Sent to teacher when student completes payment for a booking',
   ARRAY['push', 'in_app']::TEXT[], 8, TRUE),
  ('payment_failed', 'Payment Failed',
   'Sent to student when their payment fails',
   ARRAY['push', 'in_app', 'email']::TEXT[], 9, TRUE),
  ('booking_confirmed', 'Booking Confirmed',
   'Sent to both student and teacher when a booking is confirmed',
   ARRAY['push', 'in_app']::TEXT[], 7, TRUE),
  ('booking_cancelled', 'Booking Cancelled',
   'Sent when a booking is cancelled',
   ARRAY['push', 'in_app']::TEXT[], 7, TRUE),
  ('refund_processed', 'Refund Processed',
   'Sent to student when a refund is processed',
   ARRAY['push', 'in_app', 'email']::TEXT[], 7, TRUE),
  ('new_message', 'New Message Received',
   'Sent when a user receives a new message in a conversation',
   ARRAY['push', 'in_app']::TEXT[], 7, TRUE)
ON CONFLICT (event_type) DO UPDATE SET
  event_name = EXCLUDED.event_name,
  description = EXCLUDED.description,
  channels = EXCLUDED.channels,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- ============================================================================
-- SECTION: PAYMENT NOTIFICATION TEMPLATES (Phase 8B)
-- ============================================================================

INSERT INTO notification_templates (name, title, body, channels, variables, category, is_active)
VALUES
  ('Payment Required',
   '💳 Ödəniş Tələb Olunur',
   '{{teacher_name}} rezervasiyanızı qəbul etdi! {{currency}} {{amount}} ödənişi tamamlayın ki, {{scheduled_date}} tarixindəki dərsiniz təsdiqlənsin.',
   ARRAY['push', 'in_app', 'email']::TEXT[],
   ARRAY['teacher_name', 'currency', 'amount', 'scheduled_date']::TEXT[],
   'payment', TRUE),
  ('Payment Successful',
   '✅ Ödəniş Uğurlu',
   '{{currency}} {{amount}} ödənişiniz uğurlu oldu! {{teacher_name}} ilə {{scheduled_date}} tarixindəki dərsiniz təsdiqləndi.',
   ARRAY['push', 'in_app']::TEXT[],
   ARRAY['teacher_name', 'currency', 'amount', 'scheduled_date']::TEXT[],
   'payment', TRUE),
  ('Payment Received',
   '💰 Ödəniş Alındı',
   'Tələbə {{scheduled_date}} tarixindəki {{subject_name}} dərsi üçün ödənişi tamamladı. Rezervasiya təsdiqləndi!',
   ARRAY['push', 'in_app']::TEXT[],
   ARRAY['subject_name', 'scheduled_date', 'amount', 'currency']::TEXT[],
   'payment', TRUE),
  ('Payment Failed',
   '❌ Ödəniş Uğursuz',
   '{{teacher_name}} ilə dərsiniz üçün ödəniş həyata keçirilə bilmədi. Zəhmət olmasa yenidən cəhd edin və ya başqa ödəniş üsulu seçin.',
   ARRAY['push', 'in_app', 'email']::TEXT[],
   ARRAY['teacher_name', 'scheduled_date']::TEXT[],
   'payment', TRUE),
  ('Booking Confirmed',
   '🎉 Rezervasiya Təsdiqləndi',
   '{{scheduled_date}} tarixində saat {{scheduled_time}}-da {{other_party_name}} ilə {{subject_name}} dərsiniz təsdiqləndi!',
   ARRAY['push', 'in_app']::TEXT[],
   ARRAY['other_party_name', 'subject_name', 'scheduled_date', 'scheduled_time']::TEXT[],
   'booking', TRUE),
  ('Refund Processed',
   '💸 Geri Ödəmə Həyata Keçirildi',
   '{{currency}} {{amount}} geri ödəməsi həyata keçirildi. Hesabınıza daxil olması 5-10 iş günü çəkə bilər.',
   ARRAY['push', 'in_app', 'email']::TEXT[],
   ARRAY['currency', 'amount']::TEXT[],
   'payment', TRUE)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  variables = EXCLUDED.variables,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- DONE - All default data inserted
-- ============================================================================
-- Total seed data:
--   - ~35 system settings (general, notification, security, payment, legal)
--   - 8 feature flags
--   - 6 notification templates (email + push, 3 languages)
--   - 9 admin notification templates (incl. Goal Reminder, Goal Streak, Weekly Plan Summary)
--   - 4 security policies
--   - 13 leaderboard settings
--   - 4 AI configuration entries
--   - 3 AI prompts (question generation, answer explanation, student insights)
--   - 40 daily study tips (motivation, technique, health, time-management)
--   - 3 booking reminder notification events (24h, 1h, 15min)
--   - 8 payment notification events (Phase 8B)
--   - 6 payment notification templates (Phase 8B)
-- ============================================================================
