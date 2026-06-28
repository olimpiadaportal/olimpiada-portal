-- ============================================================================
-- 02_indexes.sql
-- Elmly Database - All Performance Indexes
-- ============================================================================
-- Purpose: Create ALL indexes for a fresh Supabase instance
-- Depends on: 01_base_schema.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from all Elmly & Elmly-Admin SQL stages
-- ============================================================================

-- ============================================================================
-- SECTION 1: CORE USER TABLE INDEXES
-- ============================================================================

-- Profiles
-- (Primary key index on id is automatic)

-- Students
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_streak ON students(current_streak DESC) WHERE current_streak > 0;
CREATE INDEX IF NOT EXISTS idx_students_score ON students(leaderboard_score DESC) WHERE leaderboard_score > 0;
CREATE INDEX IF NOT EXISTS idx_students_city_streak ON students(city, current_streak DESC) WHERE current_streak > 0;
CREATE INDEX IF NOT EXISTS idx_students_city_score ON students(city, leaderboard_score DESC) WHERE leaderboard_score > 0;
CREATE INDEX IF NOT EXISTS idx_students_elo_rating ON students(elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_students_monthly_score ON students(monthly_score DESC);
CREATE INDEX IF NOT EXISTS idx_students_city_elo ON students(city, elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_students_group_elo ON students(target_group, elo_rating DESC);

-- Teachers
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);

-- Admins
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);
CREATE INDEX IF NOT EXISTS idx_admins_is_active ON admins(is_active);

-- ============================================================================
-- SECTION 2: SUBJECTS & QUESTIONS INDEXES
-- ============================================================================

-- Questions
CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_exam_stage ON questions(exam_stage);
CREATE INDEX IF NOT EXISTS idx_questions_is_active ON questions(is_active);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_subject_topic ON questions(subject_id, topic);
CREATE INDEX IF NOT EXISTS idx_questions_topic_difficulty ON questions(topic, difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_tags ON questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_search_text ON questions USING GIN(to_tsvector('simple', question_text));

-- Subject Topics
CREATE INDEX IF NOT EXISTS idx_subject_topics_subject ON subject_topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_topics_active ON subject_topics(is_active) WHERE is_active = true;

-- Subject Subtopics
CREATE INDEX IF NOT EXISTS idx_subject_subtopics_topic_id   ON subject_subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_subject_subtopics_subject_id ON subject_subtopics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_subtopics_active     ON subject_subtopics(is_active) WHERE is_active = true;

-- Questions subtopic lookup
CREATE INDEX IF NOT EXISTS idx_questions_subtopic_id ON questions(subtopic_id);

-- ============================================================================
-- SECTION 3: MOCK EXAM INDEXES
-- ============================================================================

-- Mock Exam Attempts
CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_user ON mock_exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_exam ON mock_exam_attempts(mock_exam_id);
CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_status ON mock_exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_analytics_updated ON mock_exam_attempts(analytics_updated);
CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_question_ids ON mock_exam_attempts USING GIN (question_ids);
CREATE INDEX IF NOT EXISTS idx_mock_exam_attempts_prediction
  ON mock_exam_attempts(user_id, status, mock_exam_id, completed_at DESC);

-- Exam Answers
CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt ON exam_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_question ON exam_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_prediction
  ON exam_answers(attempt_id, question_id)
  WHERE question_id IS NOT NULL;
-- Unique index for exam_answers (hotfix 80+81): non-partial so PostgREST ON CONFLICT works;
-- NULLs are distinct so rows with question_id=NULL are allowed (for teacher_question_id rows)
CREATE UNIQUE INDEX IF NOT EXISTS exam_answers_attempt_question_ukey
  ON exam_answers (attempt_id, question_id);
-- Separate unique index for teacher question answers
CREATE UNIQUE INDEX IF NOT EXISTS exam_answers_attempt_teacher_q
  ON exam_answers (attempt_id, teacher_question_id)
  WHERE teacher_question_id IS NOT NULL;

-- Exam Subject Scores
CREATE INDEX IF NOT EXISTS idx_exam_subject_scores_attempt ON exam_subject_scores(attempt_id);

-- ============================================================================
-- SECTION 4: PRACTICE SYSTEM INDEXES
-- ============================================================================

-- Practice Sessions
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_id ON practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_subject_id ON practice_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_analytics_updated ON practice_sessions(analytics_updated);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_question_ids ON practice_sessions USING GIN (question_ids);
CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_sessions_offline_session_id
  ON practice_sessions(user_id, offline_session_id)
  WHERE offline_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_practice_sessions_prediction
  ON practice_sessions(user_id, completed, mode, id);

-- Student Answers
CREATE INDEX IF NOT EXISTS idx_student_answers_user_question ON student_answers(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_answered_at ON student_answers(answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_answers_prediction
  ON student_answers(user_id, question_id, answered_at DESC)
  WHERE was_skipped = FALSE;

-- Practice Answers
CREATE INDEX IF NOT EXISTS idx_practice_answers_user ON practice_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_answers_question ON practice_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_practice_answers_session ON practice_answers(practice_session_id);
CREATE INDEX IF NOT EXISTS idx_practice_answers_created ON practice_answers(created_at DESC);

-- Competitive Matches
CREATE INDEX IF NOT EXISTS idx_competitive_matches_player1 ON competitive_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_competitive_matches_player2 ON competitive_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_competitive_matches_status ON competitive_matches(status);
CREATE INDEX IF NOT EXISTS idx_competitive_matches_created ON competitive_matches(created_at DESC);

-- Bookmarked Questions
-- (Unique constraint on user_id, question_id serves as index)

-- Study Progress
CREATE INDEX IF NOT EXISTS idx_study_progress_student_id ON study_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_study_progress_student_subject ON study_progress(student_id, subject_id);

-- ============================================================================
-- SECTION 5: AI & COMPETITIVE MODE INDEXES
-- ============================================================================

-- AI Insights
CREATE INDEX IF NOT EXISTS idx_ai_insights_student_id ON ai_insights(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_expires ON ai_insights(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_insights_priority ON ai_insights(priority);
CREATE INDEX IF NOT EXISTS idx_ai_insights_generated ON ai_insights(generated_at DESC);

-- Test Sets
CREATE INDEX IF NOT EXISTS idx_test_sets_subject ON test_sets(subject_id);
CREATE INDEX IF NOT EXISTS idx_test_sets_active ON test_sets(is_active);

-- Test Set Questions
CREATE INDEX IF NOT EXISTS idx_test_set_questions_set ON test_set_questions(test_set_id);
CREATE INDEX IF NOT EXISTS idx_test_set_questions_question ON test_set_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_test_set_questions_order ON test_set_questions(test_set_id, question_order);

-- Student Test Set Progress
CREATE INDEX IF NOT EXISTS idx_student_test_progress_student ON student_test_set_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_test_progress_set ON student_test_set_progress(test_set_id);
CREATE INDEX IF NOT EXISTS idx_student_test_progress_completed ON student_test_set_progress(student_id, practice_completed, quiz_completed);

-- Competitive Sessions
CREATE INDEX IF NOT EXISTS idx_competitive_sessions_student ON competitive_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_competitive_sessions_subject ON competitive_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_competitive_sessions_completed ON competitive_sessions(completed_at);
CREATE INDEX IF NOT EXISTS idx_competitive_sessions_created ON competitive_sessions(created_at DESC);

-- Competitive Question Results (S10.1 authoritative)
CREATE INDEX IF NOT EXISTS idx_competitive_question_results_session  ON competitive_question_results(session_id);
CREATE INDEX IF NOT EXISTS idx_competitive_question_results_student  ON competitive_question_results(student_id);
CREATE INDEX IF NOT EXISTS idx_competitive_question_results_question ON competitive_question_results(question_id);
-- Stage 7: partial index — only non-NULL subtopic_id rows
CREATE INDEX IF NOT EXISTS idx_competitive_qr_subtopic_id
  ON competitive_question_results(subtopic_id) WHERE subtopic_id IS NOT NULL;

-- AI Usage Logs
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_student ON ai_usage_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_type ON ai_usage_logs(request_type);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model_used);

-- AI Feedback
CREATE INDEX IF NOT EXISTS idx_ai_feedback_insight ON ai_feedback(insight_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_student ON ai_feedback(student_id);

-- ============================================================================
-- SECTION 6: ANALYTICS & PROGRESS INDEXES
-- ============================================================================

-- Study Goals
CREATE INDEX IF NOT EXISTS idx_study_goals_student ON study_goals(student_id, is_active);
CREATE INDEX IF NOT EXISTS idx_study_goals_type ON study_goals(goal_type, is_active);

-- Achievements
CREATE INDEX IF NOT EXISTS idx_achievements_student ON achievements(student_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type);

-- Activity Log
CREATE INDEX IF NOT EXISTS idx_activity_log_student ON activity_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_student_date ON activity_log(student_id, created_at DESC);

-- Daily Stats
CREATE INDEX IF NOT EXISTS idx_daily_stats_student_date ON daily_stats(student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_active ON daily_stats(student_id, date DESC) WHERE is_active = TRUE;

-- Leaderboard Cache
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_type_city_rank ON leaderboard_cache(leaderboard_type, city, rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_type_group_rank ON leaderboard_cache(leaderboard_type, target_group, rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_student ON leaderboard_cache(student_id, leaderboard_type);

-- Study Sessions (S9.1)
CREATE INDEX IF NOT EXISTS idx_study_sessions_student ON study_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_created ON study_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_subject ON study_sessions(subject_id);

-- User Achievements (S9.1)
CREATE INDEX IF NOT EXISTS idx_user_achievements_student ON user_achievements(student_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned ON user_achievements(earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_type ON user_achievements(achievement_type);

-- Study Reminders (S9.1)
CREATE INDEX IF NOT EXISTS idx_study_reminders_student ON study_reminders(student_id);
CREATE INDEX IF NOT EXISTS idx_study_reminders_date ON study_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_study_reminders_completed ON study_reminders(is_completed);

-- Daily Study Tips (S9.1)
CREATE INDEX IF NOT EXISTS idx_daily_study_tips_active ON daily_study_tips(is_active);
CREATE INDEX IF NOT EXISTS idx_daily_study_tips_category ON daily_study_tips(category);

-- ============================================================================
-- SECTION 7: TEACHER MARKETPLACE INDEXES
-- ============================================================================

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_student_id ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_teacher_id ON bookings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_student_user_id ON bookings(student_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_teacher_user_id ON bookings(teacher_user_id);

-- Booking Reminders (Phase 5)
CREATE INDEX IF NOT EXISTS idx_booking_reminders_booking ON booking_reminders(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_reminders_sent_at ON booking_reminders(sent_at);

-- Student Teachers (S10.2B)
CREATE INDEX IF NOT EXISTS idx_student_teachers_student ON student_teachers(student_id);
CREATE INDEX IF NOT EXISTS idx_student_teachers_teacher ON student_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_teachers_subject ON student_teachers(subject_id);

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_student ON teacher_subscriptions(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_teacher ON teacher_subscriptions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_status ON teacher_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_period_end ON teacher_subscriptions(current_period_end)
  WHERE current_period_end IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_subscriptions_stripe_subscription ON teacher_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_subscriptions_one_open ON teacher_subscriptions(student_id, teacher_id)
  WHERE status IN ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_latest_invoice ON teacher_subscriptions(stripe_latest_invoice_id)
  WHERE stripe_latest_invoice_id IS NOT NULL;

-- Leaderboard Display Settings (S10.2B)
CREATE INDEX IF NOT EXISTS idx_leaderboard_display_student ON leaderboard_display_settings(student_id);

-- ============================================================================
-- SECTION 8: MESSAGING & NOTIFICATIONS INDEXES
-- ============================================================================

-- Push Tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);

-- Notification Preferences
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_student_id ON conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_conversations_teacher_id ON conversations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_is_approved ON conversations(is_approved);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, read_at) WHERE read_at IS NULL;

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- ============================================================================
-- SECTION 9: SCORING & LEADERBOARD INDEXES (S10.2)
-- ============================================================================

-- Score Transactions
CREATE INDEX IF NOT EXISTS idx_score_transactions_student ON score_transactions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_transactions_type ON score_transactions(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_transactions_admin ON score_transactions(admin_id, created_at DESC) WHERE admin_id IS NOT NULL;

-- Leaderboard Seasons
CREATE INDEX IF NOT EXISTS idx_leaderboard_seasons_active ON leaderboard_seasons(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leaderboard_seasons_dates ON leaderboard_seasons(start_date, end_date);

-- Score Adjustments
CREATE INDEX IF NOT EXISTS idx_score_adjustments_student ON score_adjustments(student_id);
CREATE INDEX IF NOT EXISTS idx_score_adjustments_admin ON score_adjustments(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_score_adjustments_date ON score_adjustments(created_at DESC);

-- Scoring Config
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_config_key ON scoring_config(config_key);

-- Leaderboard History
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_season ON leaderboard_history(season_name, final_rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_student ON leaderboard_history(student_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_city ON leaderboard_history(city, season_name, final_rank);

-- Streak History
CREATE INDEX IF NOT EXISTS idx_streak_history_student ON streak_history(student_id, timestamp DESC);

-- ============================================================================
-- SECTION 10: APP MANAGEMENT INDEXES
-- ============================================================================

-- App Versions
CREATE INDEX IF NOT EXISTS idx_app_versions_platform_created ON app_versions(platform, created_at DESC);

-- ============================================================================
-- SECTION 11: ADMIN PANEL INDEXES
-- ============================================================================

-- Admin Audit Log (Admin S1)
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_timestamp ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action_type);

-- Admin Audit Logs (Admin S2)
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- Exams (Admin S3)
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_exam_type ON exams(exam_type);
CREATE INDEX IF NOT EXISTS idx_exams_exam_stage ON exams(exam_stage);
CREATE INDEX IF NOT EXISTS idx_exams_start_date ON exams(start_date);
CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_is_active ON exams(is_active);

-- Exam Questions (Admin S3)
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question_id ON exam_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_order ON exam_questions(exam_id, question_order);

-- Exam Templates (Admin S3)
CREATE INDEX IF NOT EXISTS idx_exam_templates_exam_type ON exam_templates(exam_type);
CREATE INDEX IF NOT EXISTS idx_exam_templates_exam_stage ON exam_templates(exam_stage);

-- Question Imports (Admin S3)
CREATE INDEX IF NOT EXISTS idx_question_imports_created_at ON question_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_imports_imported_by ON question_imports(imported_by);

-- Exam Groups (Admin S9.1)
CREATE INDEX IF NOT EXISTS idx_exam_groups_code ON exam_groups(code);
CREATE INDEX IF NOT EXISTS idx_exam_group_subjects_group ON exam_group_subjects(exam_group_id);
CREATE INDEX IF NOT EXISTS idx_exam_group_subjects_subject ON exam_group_subjects(subject_id);

-- ============================================================================
-- SECTION 12: ADMIN AI MANAGEMENT INDEXES (Admin S5.5)
-- ============================================================================

-- AI Configuration
CREATE INDEX IF NOT EXISTS idx_ai_config_key ON ai_configuration(config_key);
CREATE INDEX IF NOT EXISTS idx_ai_config_category ON ai_configuration(config_category);
CREATE INDEX IF NOT EXISTS idx_ai_config_active ON ai_configuration(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_config_updated ON ai_configuration(updated_at DESC);

-- AI Prompts
CREATE INDEX IF NOT EXISTS idx_ai_prompts_active ON ai_prompts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_prompts_created ON ai_prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_usage ON ai_prompts(usage_count DESC);

-- AI Quality Reviews
CREATE INDEX IF NOT EXISTS idx_ai_quality_reviews_log ON ai_quality_reviews(usage_log_id);
CREATE INDEX IF NOT EXISTS idx_ai_quality_reviews_reviewer ON ai_quality_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_ai_quality_reviews_status ON ai_quality_reviews(status);
CREATE INDEX IF NOT EXISTS idx_ai_quality_reviews_created ON ai_quality_reviews(created_at DESC);

-- AI Budgets
CREATE INDEX IF NOT EXISTS idx_ai_budgets_active ON ai_budgets(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_budgets_period ON ai_budgets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ai_budgets_alerts ON ai_budgets(alert_sent, limit_reached);
CREATE INDEX IF NOT EXISTS idx_ai_budgets_feature_types ON ai_budgets USING GIN(feature_types) WHERE feature_types IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_budgets_providers ON ai_budgets USING GIN(providers) WHERE providers IS NOT NULL;

-- AI Budget Alerts
CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget_id ON ai_budget_alerts(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_sent_at ON ai_budget_alerts(sent_at DESC);

-- ============================================================================
-- SECTION 13: ADMIN SYSTEM SETTINGS INDEXES (Admin S6)
-- ============================================================================

-- System Settings
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
CREATE INDEX IF NOT EXISTS idx_system_settings_public ON system_settings(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_system_settings_updated ON system_settings(updated_at DESC);

-- Feature Flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(is_enabled);
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(flag_name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_dates ON feature_flags(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_feature_flags_updated ON feature_flags(updated_at DESC);

-- Security Policies
CREATE INDEX IF NOT EXISTS idx_security_policies_type ON security_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_security_policies_active ON security_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_security_policies_name ON security_policies(policy_name);

-- Settings History
CREATE INDEX IF NOT EXISTS idx_settings_history_date ON settings_history(created_at DESC);

-- Settings Audit Log
CREATE INDEX IF NOT EXISTS idx_settings_audit_admin ON settings_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_settings_audit_action ON settings_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_settings_audit_date ON settings_audit_log(created_at DESC);

-- ============================================================================
-- SECTION 14: ADMIN NOTIFICATION INDEXES (Admin S7)
-- ============================================================================

-- Admin Notifications
CREATE INDEX IF NOT EXISTS idx_admin_notifications_status ON admin_notifications(status);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications(created_at DESC);

-- Notification Templates
CREATE INDEX IF NOT EXISTS idx_notification_templates_category ON notification_templates(category);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active) WHERE is_active = TRUE;

-- Notification Recipients
CREATE INDEX IF NOT EXISTS idx_notification_recipients_notification_id ON notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_id ON notification_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_status ON notification_recipients(status);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_notif_status ON notification_recipients(notification_id, status);

-- Notification Queue (enhanced)
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_notification_queue_priority ON notification_queue(priority, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'pending';
-- NOTE: idempotency_key uses UNIQUE CONSTRAINT (not index) for ON CONFLICT support - see 01_base_schema.sql

-- Notification Idempotency (Phase 8B payment notifications)
-- NOTE: idempotency_key uses UNIQUE CONSTRAINT (not index) for ON CONFLICT support - see 01_base_schema.sql

-- Notification Events
CREATE INDEX IF NOT EXISTS idx_notification_events_enabled ON notification_events(event_type) WHERE enabled = TRUE;

-- User Notification Settings
CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id ON user_notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_settings_type ON user_notification_settings(user_id, notification_type);

-- Notification Analytics
CREATE INDEX IF NOT EXISTS idx_notification_analytics_notification_id ON notification_analytics(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_analytics_user_id ON notification_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_analytics_event_type ON notification_analytics(event_type, created_at);

-- Notification Failures
CREATE INDEX IF NOT EXISTS idx_notification_failures_notification_id ON notification_failures(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_failures_user_id ON notification_failures(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_failures_created_at ON notification_failures(created_at DESC);

-- Notification Rate Limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_type ON notification_rate_limits(user_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON notification_rate_limits(window_start);

-- Notification Deduplication
CREATE INDEX IF NOT EXISTS idx_dedup_user_hash ON notification_deduplication(user_id, notification_hash);
CREATE INDEX IF NOT EXISTS idx_dedup_expires ON notification_deduplication(expires_at);

-- ============================================================================
-- SECTION 15: ADMIN SECURITY INDEXES (Admin S9)
-- ============================================================================

-- Login Attempts
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at DESC);

-- ============================================================================
-- SECTION 16: ADMIN REPORTS INDEXES (Admin S5)
-- ============================================================================

-- Scheduled Reports
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_created_by ON scheduled_reports(created_by);

-- Report History
CREATE INDEX IF NOT EXISTS idx_report_history_scheduled_report ON report_history(scheduled_report_id);
CREATE INDEX IF NOT EXISTS idx_report_history_created_at ON report_history(created_at DESC);

-- ============================================================================
-- SECTION 18: GOAL SETTING & STUDY PLANS (Phase 1)
-- ============================================================================

-- Student Goals
CREATE INDEX IF NOT EXISTS idx_student_goals_student ON student_goals(student_id);

-- Study Plans
CREATE INDEX IF NOT EXISTS idx_study_plans_student ON study_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_status ON study_plans(student_id, status) WHERE status = 'active';

-- Study Plan Weeks
CREATE INDEX IF NOT EXISTS idx_study_plan_weeks_plan ON study_plan_weeks(plan_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_weeks_dates ON study_plan_weeks(start_date, end_date);

-- Daily Progress
CREATE INDEX IF NOT EXISTS idx_daily_progress_student_date ON daily_progress(student_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON daily_progress(date DESC);

-- ============================================================================
-- SECTION 19: TEACHER AVAILABILITY (Phase 3)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher
  ON teacher_availability(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_availability_day
  ON teacher_availability(teacher_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_teacher_time_off_teacher
  ON teacher_time_off(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_time_off_dates
  ON teacher_time_off(start_date, end_date);

-- ============================================================================
-- SECTION 20: WAITLIST (Pre-Launch)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist_subscribers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_source ON waitlist_subscribers(source);

-- 20.2 Waitlist Rate Limits
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_ip ON waitlist_rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_blocked ON waitlist_rate_limits(blocked_until) WHERE blocked_until IS NOT NULL;

-- 20.3 Waitlist Email Queue
CREATE INDEX IF NOT EXISTS idx_waitlist_email_queue_status ON waitlist_email_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_waitlist_email_queue_subscriber ON waitlist_email_queue(subscriber_id);

-- ============================================================================
-- SECTION 21: PAYMENT INFRASTRUCTURE INDEXES (Phase 8)
-- ============================================================================

-- Wallets
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_booking ON transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- Payout Requests
CREATE INDEX IF NOT EXISTS idx_payout_requests_teacher ON payout_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_created ON payout_requests(created_at DESC);

-- User Subscriptions
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe ON user_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Bookings Payment Intent
CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent ON bookings(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- ============================================================================
-- SECTION 22: SECURITY HARDENING INDEXES (hotfix 71)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_queue_created_at ON notification_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_competitive_question_results_student_subject ON competitive_question_results(student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_ip ON waitlist_rate_limits(ip_address);

-- ============================================================================
-- DONE - All indexes created
-- ============================================================================
-- Total: ~163+ indexes covering all tables for optimal query performance
-- ============================================================================
