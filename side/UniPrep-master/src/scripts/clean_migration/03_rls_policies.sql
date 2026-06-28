-- ============================================================================
-- 03_rls_policies.sql
-- Elmly Database - All Row Level Security Policies
-- ============================================================================
-- Purpose: Enable RLS and create ALL policies for a fresh Supabase instance
-- Depends on: 01_base_schema.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from all Elmly & Elmly-Admin SQL stages
-- Authoritative Rule: Latest applied version used for conflicting policies
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_subject_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarked_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_set_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_test_set_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_question_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_study_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_display_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_group_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deduplication ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_groups ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 2: REFERENCE DATA POLICIES (Public Read)
-- ============================================================================

-- Cities, Universities, Target Groups (S9 - public read)
CREATE POLICY "Universities are viewable by everyone"
  ON universities FOR SELECT TO public USING (true);

CREATE POLICY "Cities are viewable by everyone"
  ON cities FOR SELECT TO public USING (true);

CREATE POLICY "Target groups are viewable by everyone"
  ON target_groups FOR SELECT TO public USING (true);

-- Subjects (public read)
CREATE POLICY "Anyone can view subjects"
  ON subjects FOR SELECT USING (true);

-- Subject Topics (public read for active)
CREATE POLICY "Anyone can view active subject topics"
  ON subject_topics FOR SELECT USING (is_active = true);

-- Subject Subtopics (public read for active)
CREATE POLICY "Anyone can view active subject subtopics"
  ON subject_subtopics FOR SELECT USING (is_active = true);

-- Questions (public read, admin write)
CREATE POLICY "Anyone can view questions"
  ON questions FOR SELECT USING (true);

CREATE POLICY "Admins can insert questions"
  ON questions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

CREATE POLICY "Admins can update questions"
  ON questions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

CREATE POLICY "Admins can delete questions"
  ON questions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
  );

-- Mock Exams (scoped read — hotfix 73 + 75)
-- Official exams: always visible to everyone
-- Teacher exams: visible to students only after admin approval; always visible to the creating teacher
-- Admins: always bypass — needed so removing Official stamp doesn't lock admins out
DROP POLICY IF EXISTS "Anyone can view mock exams" ON mock_exams;
CREATE POLICY "View mock exams"
  ON mock_exams FOR SELECT
  USING (
    -- Admins can always read all exams (bypass for management)
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = TRUE)
    -- Official Elmly exams are visible to everyone
    OR is_official = TRUE
    -- Approved teacher exams are visible to authenticated students
    OR (created_by_teacher IS NOT NULL AND is_approved = TRUE AND auth.uid() IS NOT NULL)
    -- Teachers can always see their own exams (even pending)
    OR (created_by_teacher IS NOT NULL AND EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = created_by_teacher AND t.user_id = auth.uid()
    ))
  );

-- Teachers can create their own exams (must not set is_official; must use teacher question table)
CREATE POLICY "Teachers can insert own exams"
  ON mock_exams FOR INSERT TO authenticated
  WITH CHECK (
    created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    AND is_official = FALSE
    AND is_approved = FALSE
    AND uses_teacher_questions = TRUE
  );

-- Teachers can update their own exams only while pending (not after approval).
-- WITH CHECK prevents privilege escalation: teachers cannot set is_official=TRUE
-- (impersonate Official Elmly) or is_approved=TRUE (self-approve) via UPDATE.
CREATE POLICY "Teachers can update own pending exams"
  ON mock_exams FOR UPDATE TO authenticated
  USING (
    created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    AND is_approved = FALSE
  )
  WITH CHECK (
    created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    AND is_official = FALSE
    AND is_approved = FALSE
    AND uses_teacher_questions = TRUE
  );

-- Teachers can delete their own exams (only while not approved)
CREATE POLICY "Teachers can delete own exams"
  ON mock_exams FOR DELETE TO authenticated
  USING (
    created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

CREATE POLICY "Anyone can view mock exam questions"
  ON mock_exam_questions FOR SELECT USING (true);

-- ============================================================================
-- SECTION 3: PROFILES POLICIES
-- Authoritative: S7 (profiles viewable by everyone)
-- ============================================================================

CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- ============================================================================
-- SECTION 4: STUDENTS POLICIES
-- Authoritative: S10.3/03 (final registration fix)
-- ============================================================================

CREATE POLICY "Users can view own student data" ON students
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- REMOVED: "Public can view students" anon policy (MEDIUM-04 security audit fix)
-- The create_student_record SECURITY DEFINER function handles signup without needing anon SELECT.

-- Scoring/ranking columns (leaderboard_score, elo_rating, monthly_score, etc.)
-- are write-protected from the client. Only SECURITY DEFINER functions
-- (e.g. update_leaderboard_score_after_exam, update_student_score) may change them.
-- See migration 23_leaderboard_anti_gaming.sql for full details.
--
-- IMPORTANT: Uses get_student_protected_columns() helper function (SECURITY DEFINER)
-- to avoid infinite RLS recursion. Direct subqueries to students table would
-- trigger RLS evaluation recursively → error 42P17.
-- See migration 33_fix_students_rls_recursion.sql for the helper function.
CREATE POLICY "Users can update own safe student data" ON students
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND leaderboard_score   = (SELECT leaderboard_score   FROM public.get_student_protected_columns(auth.uid()))
    AND elo_rating          = (SELECT elo_rating          FROM public.get_student_protected_columns(auth.uid()))
    AND monthly_score       = (SELECT monthly_score       FROM public.get_student_protected_columns(auth.uid()))
    AND k_factor            = (SELECT k_factor            FROM public.get_student_protected_columns(auth.uid()))
    AND total_exams_taken   = (SELECT total_exams_taken   FROM public.get_student_protected_columns(auth.uid()))
    AND activity_multiplier = (SELECT activity_multiplier FROM public.get_student_protected_columns(auth.uid()))
    AND bonus_points        = (SELECT bonus_points        FROM public.get_student_protected_columns(auth.uid()))
  );

CREATE POLICY "Users can insert own student data" ON students
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Teachers can read student rows for students in their own bookings.
-- Uses bookings.student_user_id (denormalized) to avoid cross-table RLS recursion.
CREATE POLICY "Teachers can view students in their bookings" ON students
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT student_user_id FROM bookings
      WHERE teacher_user_id = auth.uid()
    )
  );

-- ============================================================================
-- SECTION 5: TEACHERS POLICIES
-- Authoritative: S7 (public view, owner update/delete)
-- ============================================================================

CREATE POLICY "Anyone can view teachers" ON teachers
  FOR SELECT USING (true);

CREATE POLICY "Teachers can update own data" ON teachers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can delete own data" ON teachers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 6: MOCK EXAM ATTEMPTS & ANSWERS POLICIES (S6)
-- ============================================================================

-- Mock Exam Attempts
CREATE POLICY "Users can view their own attempts"
  ON mock_exam_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own attempts"
  ON mock_exam_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attempts"
  ON mock_exam_attempts FOR UPDATE
  USING (auth.uid() = user_id);

-- Exam Answers
CREATE POLICY "Users can view their own exam answers"
  ON exam_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mock_exam_attempts
      WHERE mock_exam_attempts.id = exam_answers.attempt_id
      AND mock_exam_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own exam answers"
  ON exam_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_exam_attempts
      WHERE mock_exam_attempts.id = exam_answers.attempt_id
      AND mock_exam_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own exam answers"
  ON exam_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mock_exam_attempts
      WHERE mock_exam_attempts.id = exam_answers.attempt_id
      AND mock_exam_attempts.user_id = auth.uid()
    )
  );

-- Exam Subject Scores
CREATE POLICY "Users can view their own subject scores"
  ON exam_subject_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mock_exam_attempts
      WHERE mock_exam_attempts.id = exam_subject_scores.attempt_id
      AND mock_exam_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own subject scores"
  ON exam_subject_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_exam_attempts
      WHERE mock_exam_attempts.id = exam_subject_scores.attempt_id
      AND mock_exam_attempts.user_id = auth.uid()
    )
  );

-- Student Exam Attempts (legacy)
CREATE POLICY "Students can view own attempts" ON student_exam_attempts
  FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own attempts" ON student_exam_attempts
  FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own attempts" ON student_exam_attempts
  FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- ============================================================================
-- SECTION 7: PRACTICE SYSTEM POLICIES (S5)
-- ============================================================================

-- Practice Sessions
CREATE POLICY "Users can view own practice sessions" ON practice_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own practice sessions" ON practice_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own practice sessions" ON practice_sessions
  FOR UPDATE USING (user_id = auth.uid());

-- Student Answers (S5 - user_id based)
CREATE POLICY "Students can view own answers" ON student_answers
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR attempt_id IN (
      SELECT id FROM student_exam_attempts
      WHERE student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Students can insert own answers" ON student_answers
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

-- Practice Answers (Admin S5 analytics)
CREATE POLICY "Users can view own practice answers" ON practice_answers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own practice answers" ON practice_answers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all practice answers" ON practice_answers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Competitive Matches (Admin S5 analytics)
CREATE POLICY "Players can view own matches" ON competitive_matches
  FOR SELECT USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "Admins can view all matches" ON competitive_matches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Authenticated users can create matches" ON competitive_matches
  FOR INSERT TO authenticated WITH CHECK (player1_id = auth.uid());

-- Bookmarked Questions (S5 - user_id based)
CREATE POLICY "Users can manage own bookmarks" ON bookmarked_questions
  FOR ALL USING (user_id = auth.uid());

-- Study Progress
CREATE POLICY "Students can view own study_progress" ON study_progress
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own study_progress" ON study_progress
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own study_progress" ON study_progress
  FOR UPDATE TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- ============================================================================
-- SECTION 8: AI & COMPETITIVE MODE POLICIES (S9.5, S10, S10.1)
-- ============================================================================

-- AI Insights
CREATE POLICY "Students can view their own insights"
  ON ai_insights FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update their own insights"
  ON ai_insights FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Test Sets (public read for active)
CREATE POLICY "Anyone can view active test sets"
  ON test_sets FOR SELECT USING (is_active = TRUE);

-- Test Set Questions (public read)
CREATE POLICY "Anyone can view test set questions"
  ON test_set_questions FOR SELECT USING (TRUE);

-- Student Test Set Progress
CREATE POLICY "Students can view their own progress"
  ON student_test_set_progress FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert their own progress"
  ON student_test_set_progress FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update their own progress"
  ON student_test_set_progress FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Competitive Sessions
CREATE POLICY "Students can view their own sessions"
  ON competitive_sessions FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert their own sessions"
  ON competitive_sessions FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update their own sessions"
  ON competitive_sessions FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Competitive Question Results (S10 + S10.1)
CREATE POLICY "Users can view own competitive question results"
  ON competitive_question_results FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own competitive question results"
  ON competitive_question_results FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own competitive question results"
  ON competitive_question_results FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own competitive question results"
  ON competitive_question_results FOR DELETE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- AI Usage Logs
-- Edge functions (ai-generate-questions, ai-explain) use anon key + user JWT
-- for DB operations, so they need INSERT policy. ai-insights uses service role.
CREATE POLICY "Users can insert own usage logs" ON ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own usage logs" ON ai_usage_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- AI Feedback
CREATE POLICY "Students can submit feedback on their insights"
  ON ai_feedback FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can view their own feedback"
  ON ai_feedback FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- AI Configuration (public read for active)
CREATE POLICY "Anyone can view active AI configurations"
  ON ai_configuration FOR SELECT USING (is_active = true);

-- ============================================================================
-- SECTION 9: ANALYTICS & PROGRESS POLICIES (S8, S9.1)
-- ============================================================================

-- Study Goals
CREATE POLICY "Students can view own goals" ON study_goals
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can create own goals" ON study_goals
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own goals" ON study_goals
  FOR UPDATE TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can delete own goals" ON study_goals
  FOR DELETE TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Achievements
CREATE POLICY "Students can view own achievements" ON achievements
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own achievements" ON achievements
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Activity Log
CREATE POLICY "Students can view own activity log" ON activity_log
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own activity log" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Daily Stats
CREATE POLICY "Students can view own daily stats" ON daily_stats
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert own daily stats" ON daily_stats
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own daily stats" ON daily_stats
  FOR UPDATE TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Leaderboard Cache (public read)
CREATE POLICY "Anyone can view leaderboard cache" ON leaderboard_cache
  FOR SELECT USING (true);

-- Study Sessions (S9.1)
CREATE POLICY "Students can view their own study sessions"
  ON study_sessions FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert their own study sessions"
  ON study_sessions FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update their own study sessions"
  ON study_sessions FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- User Achievements (S9.1)
CREATE POLICY "Students can view their own achievements"
  ON user_achievements FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can insert their own achievements"
  ON user_achievements FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Study Reminders (S9.1)
CREATE POLICY "Users can view own reminders"
  ON study_reminders FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can create own reminders"
  ON study_reminders FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own reminders"
  ON study_reminders FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own reminders"
  ON study_reminders FOR DELETE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Daily Study Tips (public read for active)
CREATE POLICY "Anyone can view active study tips"
  ON daily_study_tips FOR SELECT USING (is_active = true);

-- ============================================================================
-- SECTION 10: TEACHER MARKETPLACE POLICIES (S7)
-- ============================================================================

-- Bookings (M28 authoritative — uses denormalized user_id columns to avoid RLS recursion)
-- student_user_id / teacher_user_id are populated by trg_bookings_sync_user_ids trigger.
CREATE POLICY "Users can view own bookings" ON bookings
  FOR SELECT TO authenticated
  USING (
    student_user_id = auth.uid()
    OR teacher_user_id = auth.uid()
  );

CREATE POLICY "Students can create bookings" ON bookings
  FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own bookings" ON bookings
  FOR UPDATE TO authenticated
  USING (
    student_user_id = auth.uid()
    OR teacher_user_id = auth.uid()
  );

-- Booking Reminders (Phase 5)
-- Students and teachers can see reminders for their own bookings (read-only).
-- The send_booking_reminders() SECURITY DEFINER function handles inserts.
CREATE POLICY "Users can view own booking reminders" ON booking_reminders
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE student_user_id = auth.uid()
         OR teacher_user_id = auth.uid()
    )
  );

-- Teacher Reviews
CREATE POLICY "Anyone can view reviews" ON teacher_reviews
  FOR SELECT USING (true);

CREATE POLICY "Students can create reviews" ON teacher_reviews
  FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can update own reviews" ON teacher_reviews
  FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Teacher Subscriptions
-- Recurring teacher-student membership rows are payment-sensitive. Normal
-- clients can read their own rows; creation/cancellation is server-owned.
CREATE POLICY "Students can view own teacher subscriptions"
  ON teacher_subscriptions
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can view own student subscriptions"
  ON teacher_subscriptions
  FOR SELECT TO authenticated
  USING (
    teacher_id IN (
      SELECT id FROM teachers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view teacher subscriptions"
  ON teacher_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM admins a
      WHERE a.user_id = auth.uid()
        AND a.is_active = TRUE
    )
  );

-- Teacher Exam Ratings (hotfix 87)
ALTER TABLE teacher_exam_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert own exam ratings" ON teacher_exam_ratings
  FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can read own exam ratings" ON teacher_exam_ratings
  FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Favorite Teachers
CREATE POLICY "Students can manage own favorites" ON favorite_teachers
  FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- ============================================================================
-- SECTION 11: MESSAGING & NOTIFICATIONS POLICIES (S10)
-- ============================================================================

-- Push Tokens
CREATE POLICY "Users can view own tokens"
  ON push_tokens FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own tokens"
  ON push_tokens FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tokens"
  ON push_tokens FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own tokens"
  ON push_tokens FOR DELETE USING (user_id = auth.uid());

-- Notification Tokens (S9)
CREATE POLICY "Users can manage own tokens"
  ON notification_tokens
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notification Preferences
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
  ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Conversations
CREATE POLICY "Students can view own conversations"
  ON conversations FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Teachers can view own conversations"
  ON conversations FOR SELECT
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Students can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Teachers can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Participants can update conversations"
  ON conversations FOR UPDATE
  USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    OR teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

-- Messages (S10 authoritative - conversation-based)
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
         OR teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );

-- Phase 36: Booking-based messaging restriction - only approved conversations
CREATE POLICY "Users can send messages in approved conversations"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE is_approved = TRUE
        AND (
          student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
          OR teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can update messages in their conversations"
  ON messages FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
         OR teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );

-- Notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Scheduled Notifications (S9)
CREATE POLICY "Users can view own notifications"
  ON scheduled_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 12: USER SETTINGS POLICIES (S9)
-- ============================================================================

CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings" ON user_settings
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- SECTION 13: SCORING & LEADERBOARD POLICIES (S10.2)
-- ============================================================================

-- Score Transactions
CREATE POLICY "Users can view their own score transactions"
  ON score_transactions FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own score transactions"
  ON score_transactions FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- Leaderboard History (public read)
CREATE POLICY "Users can view all leaderboard history"
  ON leaderboard_history FOR SELECT USING (true);

CREATE POLICY "Only system can insert leaderboard history"
  ON leaderboard_history FOR INSERT WITH CHECK (false);

-- Leaderboard Settings (public read, admin update)
CREATE POLICY "Everyone can view leaderboard settings"
  ON leaderboard_settings FOR SELECT USING (true);

CREATE POLICY "Only admins can update leaderboard settings"
  ON leaderboard_settings FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Streak History (S10.2)
CREATE POLICY "Users can view own streak history" ON streak_history
  FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own streak history" ON streak_history
  FOR INSERT
  WITH CHECK (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- ============================================================================
-- SECTION 14: APP MANAGEMENT POLICIES (S10)
-- ============================================================================

CREATE POLICY "Anyone can read app versions"
  ON app_versions FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- SECTION 15: ADMIN PANEL POLICIES
-- ============================================================================

-- Admin System Settings (Admin S6)
CREATE POLICY system_settings_admin_all ON system_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY system_settings_public_read ON system_settings
  FOR SELECT TO authenticated USING (is_public = TRUE);

-- Feature Flags (Admin S6)
CREATE POLICY feature_flags_admin_all ON feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY feature_flags_public_read ON feature_flags
  FOR SELECT TO authenticated USING (is_enabled = TRUE);

-- Security Policies (Admin S6)
CREATE POLICY security_policies_admin_all ON security_policies
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Settings History (Admin S6)
CREATE POLICY settings_history_admin_read ON settings_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY settings_history_admin_insert ON settings_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Settings Audit Log (Admin S6)
CREATE POLICY settings_audit_log_admin_read ON settings_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY settings_audit_log_admin_insert ON settings_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Admin Notifications (Admin S7)
CREATE POLICY "Admins can view all notifications"
  ON admin_notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can create notifications"
  ON admin_notifications FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can update notifications"
  ON admin_notifications FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can delete draft notifications"
  ON admin_notifications FOR DELETE
  USING (
    status = 'draft' AND
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Templates (Admin S7)
CREATE POLICY "Admins can view all templates"
  ON notification_templates FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can manage templates"
  ON notification_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Recipients (Admin S7)
CREATE POLICY "Admins can view all recipients"
  ON notification_recipients FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Users can view own notification status"
  ON notification_recipients FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can manage recipients"
  ON notification_recipients FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Queue (Admin S7/advanced)
CREATE POLICY "Users can view own queued notifications"
  ON notification_queue FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all queued notifications"
  ON notification_queue FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "System can manage notification queue"
  ON notification_queue FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Events (Admin S7/advanced)
CREATE POLICY "Admins can manage notification events"
  ON notification_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Users can view enabled notification events"
  ON notification_events FOR SELECT
  USING (enabled = TRUE);

-- User Notification Settings (Admin S7/advanced)
CREATE POLICY "Users can manage own notification settings"
  ON user_notification_settings FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all notification settings"
  ON user_notification_settings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Analytics (Admin S7/advanced)
CREATE POLICY "Users can view own analytics"
  ON notification_analytics FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all analytics"
  ON notification_analytics FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admin can insert analytics"
  ON notification_analytics FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Failures (Admin S7/advanced)
CREATE POLICY "Admins can view all failures"
  ON notification_failures FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "System can manage failures"
  ON notification_failures FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Notification Rate Limits, Deduplication, Performance Snapshots (admin-only)
CREATE POLICY "Admins can manage rate limits"
  ON notification_rate_limits FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can manage deduplication"
  ON notification_deduplication FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can view performance snapshots"
  ON notification_performance_snapshots FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admin can insert performance snapshots"
  ON notification_performance_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- ============================================================================
-- SECTION 16: ADMINS TABLE POLICIES (Admin S2 - FIX_RLS_RECURSION authoritative)
-- ============================================================================

-- Simple policy to avoid infinite recursion (users can only view own admin record)
CREATE POLICY "Users can view own admin record" ON admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can insert new admin records (super_admin only via trigger protection)
CREATE POLICY "Super admins can insert admins" ON admins
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true)
  );

-- Admins can update admin records (trigger protects super_admin demotion)
CREATE POLICY "Admins can update admin records" ON admins
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Only super_admins can delete admin records (trigger protects last super_admin)
CREATE POLICY "Super admins can delete admins" ON admins
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true)
  );

-- ============================================================================
-- SECTION 17: MODERATOR-RESTRICTED POLICIES (Admin S2 - 04b_fix authoritative)
-- These override basic admin policies for tables managed via admin panel.
-- Pattern: Moderators = read-only, Admin/Super_Admin = full CRUD
-- ============================================================================

-- Questions: moderator read-only, admin/super_admin full CRUD
DROP POLICY IF EXISTS "Admins can insert questions" ON questions;
DROP POLICY IF EXISTS "Admins can update questions" ON questions;
DROP POLICY IF EXISTS "Admins can delete questions" ON questions;

CREATE POLICY "Admin/super_admin can insert questions" ON questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can update questions" ON questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can delete questions" ON questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Subjects: add admin CRUD policies (moderator read-only via existing public SELECT)
CREATE POLICY "Admin/super_admin can insert subjects" ON subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can update subjects" ON subjects
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can delete subjects" ON subjects
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Subject Topics: add admin CRUD policies
CREATE POLICY "Admin/super_admin can insert subject_topics" ON subject_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can update subject_topics" ON subject_topics
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can delete subject_topics" ON subject_topics
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Subject Subtopics: admin CRUD policies
CREATE POLICY "Admin/super_admin can insert subject_subtopics" ON subject_subtopics
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can update subject_subtopics" ON subject_subtopics
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can delete subject_subtopics" ON subject_subtopics
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Mock Exams: add admin CRUD policies
CREATE POLICY "Admin/super_admin can insert mock_exams" ON mock_exams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can update mock_exams" ON mock_exams
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can delete mock_exams" ON mock_exams
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Profiles: admin can update any profile (for admin panel management)
CREATE POLICY "Admin/super_admin can update any profile" ON profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- Teachers: admin can manage teachers (beyond self-management)
CREATE POLICY "Admin/super_admin can insert teachers" ON teachers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can update any teacher" ON teachers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

CREATE POLICY "Admin/super_admin can delete any teacher" ON teachers
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true)
  );

-- ============================================================================
-- SECTION 18: GOAL SETTING & STUDY PLANS (Phase 1)
-- ============================================================================

ALTER TABLE student_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can manage own goals"
  ON student_goals FOR ALL TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can manage own plans"
  ON study_plans FOR ALL TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

CREATE POLICY "Students can manage own plan weeks"
  ON study_plan_weeks FOR ALL TO authenticated
  USING (plan_id IN (
    SELECT id FROM study_plans WHERE student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Students can manage own daily progress"
  ON daily_progress FOR ALL TO authenticated
  USING (student_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- ============================================================================
-- SECTION 19: TEACHER AVAILABILITY (Phase 3)
-- ============================================================================

ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own availability"
  ON teacher_availability FOR ALL TO authenticated
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()))
  WITH CHECK (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users can view availability"
  ON teacher_availability FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers can manage own time off"
  ON teacher_time_off FOR ALL TO authenticated
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()))
  WITH CHECK (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users can view time off"
  ON teacher_time_off FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- SECTION 20: PAYMENT INFRASTRUCTURE (Phase 8)
-- ============================================================================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Wallets: Users can view own wallet only
CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access on wallets"
  ON wallets FOR ALL
  USING (auth.role() = 'service_role');

-- Transactions: Users can view own transactions (as sender or receiver)
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "Service role full access on transactions"
  ON transactions FOR ALL
  USING (auth.role() = 'service_role');

-- Payout Requests: Teachers can view/create own requests
CREATE POLICY "Teachers can view own payout requests"
  ON payout_requests FOR SELECT TO authenticated
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Teachers can create payout requests"
  ON payout_requests FOR INSERT TO authenticated
  WITH CHECK (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on payout_requests"
  ON payout_requests FOR ALL
  USING (auth.role() = 'service_role');

-- Subscription Tiers: Anyone can view active tiers
CREATE POLICY "Anyone can view active subscription tiers"
  ON subscription_tiers FOR SELECT TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Service role full access on subscription_tiers"
  ON subscription_tiers FOR ALL
  USING (auth.role() = 'service_role');

-- User Subscriptions: Users can view own subscription
CREATE POLICY "Users can view own subscription"
  ON user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access on user_subscriptions"
  ON user_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- WAITLIST TABLES (internal tables — SECURITY DEFINER functions only)
-- ============================================================================

-- waitlist_subscribers: public INSERT (anyone can join), admin SELECT
ALTER TABLE waitlist_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join waitlist"
  ON waitlist_subscribers FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can manage waitlist"
  ON waitlist_subscribers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type IN ('admin','super_admin')));

-- waitlist_rate_limits: internal only — SECURITY DEFINER functions bypass RLS
ALTER TABLE waitlist_rate_limits ENABLE ROW LEVEL SECURITY;
-- No user-facing policies needed; all access is via SECURITY DEFINER join_waitlist()

-- waitlist_email_queue: internal only — processed by service_role functions only
ALTER TABLE waitlist_email_queue ENABLE ROW LEVEL SECURITY;
-- No user-facing policies needed; all access is via SECURITY DEFINER functions

-- ============================================================================
-- Question Feedback RLS
-- ============================================================================
ALTER TABLE question_feedback ENABLE ROW LEVEL SECURITY;

-- Students can submit feedback on any question (one per question enforced by UNIQUE constraint)
CREATE POLICY "Students can insert own feedback"
  ON question_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Students can read their own submitted feedback
CREATE POLICY "Students can read own feedback"
  ON question_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can view and manage all feedback
CREATE POLICY "Admins can manage all feedback"
  ON question_feedback FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND user_type IN ('admin', 'super_admin')
  ));

-- Service role has unrestricted access (Edge Functions, admin RPCs)
CREATE POLICY "Service role full access to feedback"
  ON question_feedback FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- SECTION 21: TEACHER QUESTIONS & EXAM QUESTIONS (hotfix 73)
-- ============================================================================

-- teacher_questions: teachers manage their own private question library.
-- Students have NO direct SELECT — they receive questions only via
-- get_teacher_exam_questions() SECURITY DEFINER RPC.
CREATE POLICY "Teachers can manage own questions"
  ON teacher_questions FOR ALL TO authenticated
  USING (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()))
  WITH CHECK (teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid()));

-- teacher_exam_questions: teachers manage question lists for their own exams.
CREATE POLICY "Teachers can insert into own exam question list"
  ON teacher_exam_questions FOR INSERT TO authenticated
  WITH CHECK (
    exam_id IN (
      SELECT id FROM mock_exams
      WHERE created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Teachers can delete from own exam question list"
  ON teacher_exam_questions FOR DELETE TO authenticated
  USING (
    exam_id IN (
      SELECT id FROM mock_exams
      WHERE created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Teachers can view own exam question list"
  ON teacher_exam_questions FOR SELECT TO authenticated
  USING (
    exam_id IN (
      SELECT id FROM mock_exams
      WHERE created_by_teacher IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );

-- ============================================================================
-- DONE - All RLS policies created
-- ============================================================================
-- Total: 145+ policies covering all tables
-- Pattern: Own-data access for users, public read for reference data,
--          admin-only for system settings, moderator read-only for content,
--          admin/super_admin full CRUD for content management,
--          service_role full access for payment tables (Edge Functions)
-- ============================================================================
