-- ============================================================================
-- HOTFIX 88: Notification Templates — Azerbaijani
-- Updates all server-side notification template titles and bodies to Azerbaijani.
-- Applies to: notification_templates table (admin + payment/booking templates)
-- ============================================================================

-- Admin / General Templates (Section 3.3)
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
ON CONFLICT (name) DO UPDATE SET
  title      = EXCLUDED.title,
  body       = EXCLUDED.body,
  updated_at = NOW();

-- Payment / Booking Templates (Phase 8B)
INSERT INTO notification_templates (name, title, body, channels, variables, category, is_active) VALUES
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
  title      = EXCLUDED.title,
  body       = EXCLUDED.body,
  channels   = EXCLUDED.channels,
  variables  = EXCLUDED.variables,
  category   = EXCLUDED.category,
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();
