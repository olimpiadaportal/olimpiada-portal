# Database Clean Migration Guide

**Created:** February 6, 2026  
**Purpose:** Complete guide for deploying the Elmly database to a fresh Supabase instance  
**Reference:** `UniPrep/markdowns/DATABASE_SQL_ANALYSIS.md`  
**Scope:** Consolidated from Elmly (Mobile) + Elmly-Admin SQL stages

---

## 1. Overview

This folder contains **14 consolidated SQL files** that reproduce the entire Elmly database from scratch. They replace the 90+ individual SQL scripts scattered across `UniPrep/src/scripts/sql_STAGE_*` and `UniPrep-Admin/scripts/sql_STAGE_*`.

> **Deep link scheme:** The mobile app uses `elmly://` (not `uniprep://`). All references in this document, Supabase Auth settings, and app code use `elmly://`.

**Source repositories audited:**
- `Elmly` (Mobile App) — Stages 3, 5, 6, 7, 8, 9, 9.1, 9.5, 10, 10.1, 10.2, 10.3
- `Elmly-Admin` (Admin Panel) — Stages 1, 2, 3, 4, 5, 5.5, 6, 7, 8, 9, 9.1, 10, VULNS_FIXES
- `elmly-webapp` — **No SQL files** (consumes Supabase via client)
- `Elmly-Auth` — **No SQL files** (consumes Supabase via client)

**Authoritative rule:** When duplicate or conflicting objects exist across stages, the **latest applied version** is always used (later scripts fix issues found in earlier ones).

---

## 2. File Inventory & Execution Order

Run these files **in exact numerical order** in the Supabase SQL Editor (or via `psql`). Each file depends on the ones before it.

| # | File | Size | Purpose | Depends On |
|---|------|------|---------|------------|
| 0 | `00_prerequisites.sql` | 2.5 KB | Extensions, custom ENUM types | Nothing |
| 1 | `01_base_schema.sql` | 50 KB | All 65+ tables with columns, constraints, FKs | 00 |
| 2 | `02_indexes.sql` | 21 KB | All 140+ indexes for performance | 01 |
| 3 | `03_rls_policies.sql` | 39 KB | All 130+ RLS policies (incl. moderator-restricted) | 01 |
| 4a | `04_functions_triggers.sql` | 63 KB | 50+ mobile/core functions & 13+ triggers | 01, 02 |
| 4b | `04b_admin_functions.sql` | 51 KB | 40+ admin-panel SECURITY DEFINER functions | 01, 04 |
| 4c | `04c_question_exam_functions.sql` | 29 KB | ~30 question bank, exam, subject/topic management functions | 01, 04 |
| 4d | `04d_analytics_ai_functions.sql` | 46 KB | ~30 analytics, AI management, budget alerts, audit, AI config functions | 01, 04c |
| 4e | `04e_notification_leaderboard_functions.sql` | 40 KB | ~30 notification, leaderboard, smart features, scheduled reports + tables | 01, 04 |
| 5 | `05_default_data.sql` | 27 KB | Seed data: settings, flags, templates, tips, AI config | 01 |
| 6 | `06_storage_buckets.sql` | 5.5 KB | Storage buckets + bucket RLS policies | 01 |
| 7 | `07_realtime.sql` | 2.4 KB | Supabase Realtime publications | 01 |
| 8 | `08_security_hardening.sql` | 21 KB | SECURITY INVOKER views, missing RLS, mobile compat | 01, 03 |
| 9 | `09_verify.sql` | 9.5 KB | Post-migration verification queries | All above |

**Total: ~420 KB of consolidated SQL**

---

## 3. What Each File Contains

### `00_prerequisites.sql`
- Extensions: `uuid-ossp`, `pg_cron`, `pgcrypto`
- Custom ENUM types: `user_type`, `admin_role`, `booking_status`, `exam_status`, `notification_type`, `notification_status`, `notification_priority`, `notification_channel`

### `01_base_schema.sql`
- **65+ tables** covering:
  - Core: `profiles`, `students`, `teachers`, `admins`
  - Academic: `subjects`, `subject_topics`, `questions`, `question_groups`
  - Exams: `mock_exams`, `mock_exam_questions`, `mock_exam_attempts`, `exam_answers`, `exam_subject_scores`, `student_exam_attempts`, `exams`, `exam_questions`, `exam_subjects`
  - Practice: `practice_sessions`, `student_answers`, `bookmarked_questions`, `test_sets`, `test_set_questions`, `student_test_set_progress`
  - Competitive: `competitive_sessions`, `competitive_question_results`
  - Engagement: `study_goals`, `achievements`, `user_achievements`, `activity_log`, `daily_stats`, `study_sessions`, `study_progress`
  - Leaderboard: `leaderboard_cache`, `leaderboard_history`, `leaderboard_settings`, `score_transactions`, `streak_history`
  - Teachers: `bookings`, `teacher_reviews`, `student_teachers`, `leaderboard_display_settings`
  - AI: `ai_insights`, `ai_usage_logs`, `ai_feedback`, `ai_configuration`, `ai_prompts`, `ai_quality_reviews`
  - Messaging: `conversations`, `messages`, `push_tokens`, `notification_tokens`
  - Admin: `admin_audit_log`, `admin_audit_logs`, `admin_notifications`, `notification_templates`, `notification_recipients`, `notification_performance_snapshots`, `notification_rate_limits`, `notification_deduplication`
  - Settings: `system_settings`, `feature_flags`, `security_policies`, `settings_history`, `settings_audit_log`, `daily_study_tips`
  - Security: `login_attempts`
  - Reference: `cities`, `target_groups`, `app_versions`, `user_settings`

### `02_indexes.sql`
- **140+ indexes** organized by domain (core, academic, exams, practice, engagement, leaderboard, messaging, admin, settings, security, AI)

### `03_rls_policies.sql`
- **130+ RLS policies** including:
  - User self-access patterns (own data only)
  - Public read for reference data (subjects, questions, exams)
  - Admin-only for system settings and management
  - **Moderator-restricted policies** (Section 17): moderators get read-only, admin/super_admin get full CRUD on `questions`, `subjects`, `subject_topics`, `mock_exams`, `profiles`, `teachers`
  - **Admins table policies** (Section 16): prevents RLS recursion, super_admin-only insert/delete

### `04_functions_triggers.sql`
- **50+ core/mobile functions** including:
  - Auth: `handle_new_user`, `create_student_record`, `create_teacher_record`, `create_default_user_settings`
  - Profile sync: `sync_profile_to_student`, `sync_profile_to_teacher`, `update_own_student_profile_fields`
  - Analytics: `update_daily_stats`, `check_goal_completion`
  - Streaks: `calculate_student_streak`, `calculate_streak_realtime`, `update_streak_on_activity`, `use_streak_freeze`, `recover_streak`, `get_streak_status`, `reset_monthly_streak_freezes`
  - Leaderboard: `get_city_leaderboard`, `get_national_leaderboard`, `get_student_rank`
  - Scoring: `calculate_elo_change`, `update_student_score`, `apply_monthly_decay`, `refresh_leaderboard_cache`, `trigger_monthly_decay`
  - Admin leaderboard: `admin_reset_leaderboard`, `admin_adjust_student_score`, `get_leaderboard_stats`, `admin_archive_season`, `admin_update_setting`, `get_top_performers`
  - Study: `get_student_weak_topics`
  - Goal Setting (Phase 1): `upsert_daily_progress`, `update_goal_plan_updated_at` trigger
  - Competitive: `create_competitive_session`, `submit_competitive_answer`, `end_competitive_session`
  - AI: `get_ai_usage_stats`, `increment_prompt_usage`, `update_prompt_stats`
  - Messaging: `update_conversation_on_message`
  - **Teacher marketplace** (Section 12.5, S10.2B): `get_student_teachers`, `search_teachers`, `assign_teacher_to_subject`, `remove_teacher_from_subject`, `get_leaderboard_with_teachers`, `update_student_teachers_timestamp`
  - **Role hierarchy** (Section 10A): `get_role_level`, `can_manage_role`, `prevent_super_admin_demotion`, `prevent_last_super_admin_deletion`
- **15+ triggers** including role hierarchy protection triggers on `admins` table, student_teachers timestamp trigger

### `04b_admin_functions.sql`
- **40+ admin-panel SECURITY DEFINER functions** including:
  - Dashboard (S1): `get_dashboard_stats`, `get_student_growth`, `get_elo_distribution`, `get_recent_activity`, `get_activity_heatmap`, `log_admin_action`
  - Student management (S2): `search_students`, `get_student_detail`, `update_student_profile`, `update_student_elo`, `delete_student`, `get_students_by_city`, `get_student_cities`
  - Teacher management (S2): `admin_search_teachers`, `get_teacher_detail`, `update_teacher_profile`, `update_teacher_verification`, `update_teacher_specializations`, `delete_teacher`, `get_teachers_by_city`, `get_teacher_cities`, `get_all_specializations`
  - Admin management (S2): `get_all_admins`, `get_admin_detail`, `create_admin`, `update_admin_role`, `update_admin_status`, `delete_admin`, `get_admin_audit_logs`, `update_admin_last_login`, `get_admin_by_user_id`
  - System settings (S6): `get_system_settings`, `update_system_setting`, `is_feature_flag_enabled`, `get_mobile_app_settings`, `get_settings_audit_log`, `log_feature_flag_change` (trigger)
  - Security (S9): `check_login_allowed`, `log_login_attempt`, `admin_get_login_attempts`, `admin_get_login_stats`, `admin_unlock_account`

### `04c_question_exam_functions.sql`
- **~30 functions** covering:
  - Question bank: `search_questions`, `get_question_statistics`, `bulk_insert_questions`, `bulk_delete_questions`, `toggle_question_status`
  - Subject management: `get_subjects_with_stats`, `admin_create_subject`, `admin_update_subject`, `admin_delete_subject`
  - Topic management: `get_topics_by_subject`, `admin_create_topic`, `admin_update_topic`, `admin_delete_topic`, `admin_reorder_topics`, `admin_toggle_topic_status`
  - Exam management: `create_mock_exam`, `update_mock_exam`, `delete_mock_exam`, `search_mock_exams`, `get_mock_exam_details`, `add_questions_to_mock_exam`, `remove_questions_from_mock_exam`, `auto_select_questions_for_exam`, `reorder_exam_questions_by_type`
  - Helper: `search_students_by_name`
  - Table: `question_imports` (bulk upload tracking)
- **Source:** Admin S3 (question bank, exam harmonization, helpers), S4 (subject/topic management), S10 (fixes)
- **Authoritative:** S10 versions override S3 originals where applicable

### `04d_analytics_ai_functions.sql`
- **~30 functions + 1 table** covering:
  - Engagement analytics: `admin_get_engagement_metrics`, `admin_get_performance_metrics`, `admin_get_student_segments`, `admin_get_cohort_analysis`, `admin_get_user_emails`
  - Content analytics: `admin_get_question_performance`, `admin_get_exam_analytics`, `admin_get_content_quality_issues`, `admin_get_subject_analytics_summary`, `admin_get_topic_performance`
  - System analytics: `admin_get_system_metrics`, `admin_get_usage_patterns`, `admin_get_database_stats`, `admin_get_performance_trends`, `admin_get_feature_usage`
  - AI analytics: `get_ai_usage_overview`, `get_ai_cost_trends`, `get_ai_budget_status`, `get_ai_quality_metrics`, `get_ai_review_queue`
  - Budget alerts: `check_budget_alerts`, `record_budget_alert`, `get_budget_alert_history`, `check_hard_limit`
  - Cost optimization: `get_cost_optimization_insights`
  - Audit: `admin_get_audit_logs`, `admin_get_audit_stats`, `admin_get_audit_log_detail`, `admin_get_audit_filter_options`
  - AI configuration: `get_ai_config`, `update_ai_config`, `is_feature_enabled`, `check_rate_limit`
  - Table: `ai_budget_alerts` (alert history)
- **Source:** Admin S5 (analytics), S5.5 (AI analytics, budget alerts, cost optimization, AI config), S8 (audit)

### `04e_notification_leaderboard_functions.sql`
- **~30 functions + 6 tables + triggers + seed data** covering:
  - Notification tables: `admin_notifications`, `notification_templates`, `notification_recipients` (with RLS)
  - Notification functions: `admin_get_notification_target_count`, `admin_send_notification`, `admin_get_notifications`, `admin_get_notification_details`, `update_notification_recipient_status`
  - Monitoring: `get_queue_health`, `get_processing_rate`, `get_channel_performance`, `create_performance_snapshot`, `get_notification_trends`, `get_top_notification_types`
  - Smart features: `can_send_notification`, `can_send_smart_notification`, `is_duplicate_notification`, `generate_notification_hash`, `update_token_usage`, `run_notification_cleanup`, `batch_similar_notifications`, `claim_pending_notifications`
  - Leaderboard seasons: `create_season`, `archive_season`, `reset_leaderboard_soft`, `reset_leaderboard_hard`
  - Scheduled reports: `calculate_next_run_time`, `get_due_scheduled_reports`, `update_scheduled_report_after_run`
  - Tables: `notification_performance_snapshots`, `scheduled_reports`, `report_history`
  - Seed: 6 default notification templates
- **Source:** Admin S7 (notifications + advanced monitoring + smart features), S3 (leaderboard), S5 (scheduled reports)

### `05_default_data.sql`
- System settings (15+ rows)
- Feature flags (10+ rows)
- Notification templates (5+ rows)
- Security policies (5+ rows)
- Leaderboard settings (1 row)
- AI configuration (1 row)
- AI prompts (4 default prompts for DeepSeek)
- Daily study tips (30 rows)

### `06_storage_buckets.sql`
- Buckets: `question-images`, `exam-answers`, `avatars`, `certificates`, `chat-files`
- RLS policies for each bucket (admin upload for question-images/exam-answers; user-scoped for avatars/certificates; conversation-participant access for chat-files)

### `07_realtime.sql`
- Supabase Realtime publication for: `messages`, `conversations`, `notifications`

### `08_security_hardening.sql`
- Converts 17 SECURITY DEFINER views to SECURITY INVOKER (from Supabase Security Advisor fixes)
- Adds RLS + policies to 4 previously unprotected tables: `question_groups`, `notification_performance_snapshots`, `notification_rate_limits`, `notification_deduplication`
- Mobile compatibility view for AI usage logs

### `09_verify.sql`
- Counts and lists: tables, enums, indexes, RLS policies, functions, triggers, views, storage buckets, realtime publications, seed data, extensions
- Run this after all other files to confirm everything was created correctly

---

## 4. Role Hierarchy Summary

The admin system uses three roles defined by the `admin_role` ENUM:

| Role | Level | Can Manage | Permissions |
|------|-------|------------|-------------|
| `super_admin` | 3 | admin, moderator | Full CRUD on all tables + admin management |
| `admin` | 2 | moderator | Full CRUD on content tables (questions, exams, subjects, etc.) |
| `moderator` | 1 | none | **Read-only** on content tables |

**Protection mechanisms:**
- `prevent_super_admin_demotion` trigger: blocks demotion of the last super_admin
- `prevent_last_super_admin_deletion` trigger: blocks deletion/deactivation of the last super_admin
- `get_role_level()` / `can_manage_role()`: utility functions for hierarchy checks
- RLS policies enforce moderator read-only on: `questions`, `subjects`, `subject_topics`, `mock_exams`, `profiles`, `teachers`

---

## 5. Security Vulnerability Fixes Included

All 22 fixes from `UniPrep-Admin/scripts/sql_VULNS_FIXES/01_security_vulnerability_fixes.sql` are integrated into `08_security_hardening.sql`:

- **17 views** converted from `SECURITY DEFINER` to `SECURITY INVOKER`
- **4 tables** with RLS enabled and policies added:
  - `question_groups`
  - `notification_performance_snapshots`
  - `notification_rate_limits`
  - `notification_deduplication`

---

## 6. How to Test This Migration

### Option A: New Supabase Project (Recommended)

This is the safest way to verify the migration works end-to-end.

**Step 1: Create a new Supabase project**
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Choose a name like `elmly-migration-test`
4. Select the same region as your production project
5. Set a database password and save it

**Step 2: Run the migration files**
1. Go to the SQL Editor in your new project
2. Run each file **in order** (00 → 09):
   - Copy the contents of `00_prerequisites.sql` → paste into SQL Editor → click "Run"
   - Repeat for `01_base_schema.sql`, `02_indexes.sql`, etc.
   - **Important:** Wait for each file to complete before running the next
3. If any file fails, check the error message — it usually indicates a missing dependency

**Step 3: Run verification**
1. Run `09_verify.sql`
2. Check the output:
   - Tables: should be ~65+
   - Functions: should be ~90+
   - Triggers: should be ~15+
   - RLS policies: should be ~130+
   - Seed data: all counts should be > 0
   - Extensions: `uuid-ossp`, `pgcrypto` should be present (`pg_cron` may need manual enable)

**Step 4: Connect your apps**
1. Get the new project's URL and anon key from Settings → API
2. Update environment variables in each app:

**Elmly (Mobile - Flutter):**
```
# In .env or equivalent
SUPABASE_URL=https://your-new-project.supabase.co
SUPABASE_ANON_KEY=your-new-anon-key
```

**Elmly-Admin (Next.js):**
```env
# In .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
```

**elmly-webapp (Next.js):**
```env
# In .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
```

**Step 5: Configure Supabase Authentication**

These settings are configured in the Supabase Dashboard under **Authentication**, not via SQL files.

**5a. URL Configuration** (Authentication → URL Configuration)

| Setting | Value |
|---------|-------|
| **Site URL** | `https://uni-prep-auth.vercel.app` |

**Redirect URLs** (add all 4):
| URL | Purpose |
|-----|---------|
| `elmly://confirm-email` | Mobile deep link for email confirmation |
| `elmly://reset-password` | Mobile deep link for password reset |
| `elmly://` | Mobile app base deep link |
| `https://uni-prep-auth.vercel.app` | Web auth callback |

> **Note:** The mobile app uses the `elmly://` deep link scheme throughout (`deepLinkService.ts`, `app.json`). Deep links include `elmly://practice`, `elmly://exam`, `elmly://teacher/{id}`, `elmly://chat/{id}`, `elmly://confirm-email`, `elmly://reset-password`, etc.

**5b. Email Templates** (Authentication → Email)

**Confirm Sign Up** template:
- **Subject:** `Confirm Your Signup`
- **Body (Source):**
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your user:</p>
<p><a href="https://uni-prep-auth.vercel.app/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your mail</a></p>
```

**Reset Password** template:
- **Subject:** `Reset Your Password`
- **Body (Source):**
```html
<h2>Reset Password</h2>
<p>Follow this link to reset the password for your user:</p>
<p><a href="https://uni-prep-auth.vercel.app/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
```

> **Important:** These email templates route through the `Elmly-Auth` (uni-prep-auth.vercel.app) web app which handles the token verification and redirects to the mobile app via deep links.

**Step 6: Create initial super_admin**
After connecting the admin app, you need to create the first super_admin manually:
```sql
-- First, sign up a user through the Auth UI or API
-- Then promote them to super_admin:
INSERT INTO admins (user_id, role, is_active, created_at, updated_at)
VALUES (
  'YOUR_USER_UUID_HERE',  -- Get this from auth.users table
  'super_admin',
  true,
  NOW(),
  NOW()
);

-- Also update their profile to admin type:
UPDATE profiles SET user_type = 'admin' WHERE id = 'YOUR_USER_UUID_HERE';
```

**Step 7: Load initial reference data**

Run the seed data file to populate cities, universities, and target groups needed for registration:

```sql
-- In Supabase SQL Editor, run:
-- initial_data/01_reference_data.sql
```

This inserts:
- **59 cities** in Azerbaijan (with Azerbaijani and Russian names)
- **28 universities** (with Azerbaijani and Russian names, linked to cities)
- **5 target groups** (exam groups I–V with descriptions and max points)

Verify counts:
```sql
SELECT 
  (SELECT COUNT(*) FROM cities) AS cities,
  (SELECT COUNT(*) FROM universities) AS universities,
  (SELECT COUNT(*) FROM target_groups) AS target_groups;
-- Expected: 59, 28, 5
```

**Step 7b: Run smoke test fixes** *(reference only — already integrated into main migration files)*

> **Note:** The fixes in `initial_data/02_smoketest_fixes.sql` have been integrated back into the
> main migration files (`01_base_schema.sql`, `04_functions_triggers.sql`, `05_default_data.sql`).
> For **new database setups**, you do NOT need to run this file — the main migration files already
> include these fixes. This file is kept as a reference for existing databases that were set up
> before these fixes were integrated.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/02_smoketest_fixes.sql
```

This adds:
- **`check_email_exists`** function (used during signup to detect duplicate emails)
- **`create_default_user_settings(UUID)`** RPC function (called by mobile app during signup)
- **6 ai_configuration rows** (global_settings, emergency_controls, rate_limits, feature_flags, cost_controls, provider_config)
- **FK constraints** from `students.user_id` and `teachers.user_id` to `profiles.id` (required for PostgREST joins)

Verify:
```sql
SELECT 
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'check_email_exists') AS check_email_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'create_default_user_settings' AND pronargs = 1) AS settings_rpc,
  (SELECT COUNT(*) FROM ai_configuration WHERE config_key IN ('global_settings','emergency_controls')) AS ai_config_rows,
  EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'teachers_user_id_fkey_profiles') AS teachers_fk;
-- Expected: true, true, 2, true
```

**Step 7c: Fix admin dashboard recent activity** *(reference only — already integrated into main migration files)*

> **Note:** This fix has been integrated into `04b_admin_functions.sql`. For **new database setups**,
> you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/03_fix_recent_activity.sql
```

This fixes the `get_recent_activity` function's UNION ORDER BY clause that caused a 400 error on the admin dashboard.

**Step 7d: Fix admin analytics & questions** *(reference only — already integrated into main migration files)*

> **Note:** These fixes have been integrated into `01_base_schema.sql` (missing question columns),
> `04b_admin_functions.sql` (analytics functions), and `04c_question_exam_functions.sql` (search_questions).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/04_fix_analytics_and_questions.sql
```

This fixes:
- **Missing columns** on `questions` table (`expected_answer`, `answer_keywords`, `max_points`, `grading_rubric`, `sample_answer`, `exclude_from_practice`, `group_id`, `group_order`, `created_by`)
- **Missing analytics functions** (`admin_get_engagement_metrics`, `admin_get_performance_metrics`, `admin_get_question_performance`, plus 8 more)
- **`search_questions` 400 error** (`column q.expected_answer does not exist`)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'expected_answer') AS has_expected_answer,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_engagement_metrics') AS has_engagement_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_performance_metrics') AS has_performance_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_question_performance') AS has_question_perf_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'search_questions') AS has_search_questions_fn;
-- Expected: all true
```

**Step 7e: Fix leaderboard, notifications & audit logs** *(reference only — already integrated into main migration files)*

> **Note:** These fixes have been integrated into `04e_notification_leaderboard_functions.sql` (leaderboard + notifications)
> and `04d_analytics_ai_functions.sql` (audit functions). For **new database setups**, you do NOT need to run this file.
> Only run it to patch an existing database.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/05_fix_leaderboard_notifications_audit.sql
```

This fixes:
- **Missing leaderboard functions** (`get_active_season`, `get_scoring_config`) — 404 on Leaderboard page
- **Notifications ambiguous `id`** (`admin_get_notifications` column reference "id" is ambiguous) — 400 on Notifications page
- **Audit functions wrong table** (referenced `admin_audit_logs` plural with `entity_type` columns instead of `admin_audit_log` singular with `action_type`, `table_name`, `record_id`) — `column "action_type" does not exist` on Audit Logs page

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_active_season') AS has_get_active_season,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_scoring_config') AS has_get_scoring_config,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_notifications') AS has_notifications_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_audit_stats') AS has_audit_stats_fn;
-- Expected: all true
```

**Step 7f: Fix AI analytics signatures, exam groups & topic functions** *(reference only — already integrated into main migration files)*

> **Note:** These fixes have been integrated into `04d_analytics_ai_functions.sql` (AI function signatures),
> `04c_question_exam_functions.sql` (topic/exam group functions), and `initial_data/01_reference_data.sql` (seed data).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/06_fix_ai_analytics_exam_groups_topics.sql
```

This fixes:
- **AI Management 404** — `get_ai_usage_overview` had wrong signature `(p_days INTEGER)` instead of `(p_start_date, p_end_date, p_feature_type, p_provider)`. Same for `get_ai_cost_trends`, `get_ai_budget_status`, `get_ai_quality_metrics`, `get_ai_review_queue`.
- **"No Exam Groups Found"** — Missing exam groups seed data (Groups I-V) in `exam_groups` table.
- **Competitive mode error** — Missing `get_weak_topics`, `get_strong_topics`, `get_exam_group_config` functions + missing `subject_topics` seed data.

Verify:
```sql
SELECT
  (SELECT COUNT(*) FROM exam_groups) AS exam_groups_count,
  (SELECT COUNT(*) FROM subject_topics) AS subject_topics_count,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_weak_topics') AS has_weak_topics_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_ai_usage_overview') AS has_ai_usage_fn;
-- Expected: exam_groups_count=5, subject_topics_count>=30, both functions true
```

**Step 7g: Fix exam_groups schema, ai_usage_logs schema & AI analytics functions** *(reference only — already integrated into main migration files)*

> **Note:** These fixes have been integrated into `01_base_schema.sql` (correct table schemas).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/07_fix_exam_groups_schema_ai_usage_logs.sql
```

This fixes:
- **Exam Groups not showing** — `exam_groups` table had wrong column names (`name` instead of `name_en`, `max_points` instead of `first_stage_max_points`/`second_stage_max_points`, missing `has_second_stage`). Schema migrated to match S9.1.
- **`exam_group_subjects` missing columns** — Added `stage`, `display_order`, `is_active`, `updated_at`; renamed `question_count` to `questions_count`; updated unique constraint.
- **AI Management 400 "column total_tokens does not exist"** — `ai_usage_logs` table had old mobile schema (`tokens_used`, `model_used`, `request_type`, `processing_time_ms`, `success`). Migrated to S5.5 schema (`total_tokens`, `provider`, `model`, `feature_type`, `latency_ms`, `status`, `quality_score`, etc.).
- **Re-created `get_ai_usage_overview`** function to ensure it works with the new column names.

Verify:
```sql
-- Exam groups schema
SELECT code, name_en, first_stage_max_points, second_stage_max_points, has_second_stage
FROM exam_groups ORDER BY code;
-- Expected: 5 rows with correct column values

-- ai_usage_logs columns
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'total_tokens') AS has_total_tokens,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'provider') AS has_provider,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'feature_type') AS has_feature_type,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'latency_ms') AS has_latency_ms,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'quality_score') AS has_quality_score;
-- Expected: all true
```

**Step 7h: Deploy Edge Functions (required for AI features)**

AI features (AI Insights, AI Explain, AI Generate Questions) require Supabase Edge Functions to be deployed.
Without them, the webapp will show CORS errors and AI features will be in maintenance mode.

> **⚠️ CRITICAL: `--no-verify-jwt` is REQUIRED!**
> All edge functions handle JWT verification internally via `supabase.auth.getUser()`.
> If you deploy **without** `--no-verify-jwt`, Supabase's relay layer will reject requests
> with 401 Unauthorized **before your function code even runs** — you'll see no function logs,
> only "booted" and "listening" messages.

**Edge Functions in the repo** (`supabase/functions/`):

| Function | Purpose | Auth Handling |
|---|---|---|
| `ai-insights` | AI-powered study insights for students | JWT via `getUser()` internally |
| `ai-explain` | AI explanation of question answers | JWT via `getUser()` internally |
| `ai-generate-questions` | AI-generated competitive mode questions | JWT via `getUser()` internally |
| `grade-open-questions` | AI grading of open-answer exam questions | JWT via `getUser()` internally |
| `delete-account` | Permanent account deletion (cascades all user data) | JWT via `getUser()` internally |
| `create-payment` | Creates Stripe PaymentIntent for teacher bookings | JWT via `getUser()` internally |
| `stripe-webhook` | Processes Stripe webhook events (payment success/fail/refund, subscription changes) | Stripe signature verification (no JWT) |
| `request-payout` | Teacher requests wallet balance withdrawal | JWT via `getUser()` internally |

**Option A: Deploy via CLI (recommended)**
```bash
# From UniPrep project root:
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

# AI functions
npx supabase functions deploy ai-insights --no-verify-jwt
npx supabase functions deploy ai-explain --no-verify-jwt
npx supabase functions deploy ai-generate-questions --no-verify-jwt
npx supabase functions deploy grade-open-questions --no-verify-jwt

# Account management
npx supabase functions deploy delete-account --no-verify-jwt

# Stripe / Payment (Phase 8B)
npx supabase functions deploy create-payment --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy request-payout --no-verify-jwt
```

**Option B: Deploy via Dashboard + config.toml**
If you deploy via the Dashboard UI, the `--no-verify-jwt` flag is NOT applied automatically.
You must create `supabase/config.toml` (already included in the repo) and redeploy via CLI:
```toml
# supabase/config.toml — already created in the repo
[functions.ai-insights]
verify_jwt = false
[functions.ai-explain]
verify_jwt = false
[functions.ai-generate-questions]
verify_jwt = false
[functions.grade-open-questions]
verify_jwt = false
[functions.delete-account]
verify_jwt = false
[functions.create-payment]
verify_jwt = false
[functions.stripe-webhook]
verify_jwt = false
[functions.request-payout]
verify_jwt = false
```
Then deploy all functions via CLI so the config is picked up:
```bash
npx supabase functions deploy --no-verify-jwt
```

**How to tell if `--no-verify-jwt` is NOT applied:**
- You get 401 Unauthorized errors
- Edge Function logs show ONLY "booted" and "listening on localhost:9999" — no `🔑 ENV check:` or `🚀 AI Insights request received` logs
- This means the request never reached your function code

> **⚠️ CRITICAL: Set Environment Secrets BEFORE testing AI features!**
> Edge functions will NOT work without these secrets. This is the #1 reason AI features fail after deployment.
>
> **Go to:** Supabase Dashboard → Project Settings → Edge Functions → Secrets (or: Edge Functions → Select any function → Settings → Secrets)
>
> Add these secrets:
> | Secret Name | Value | Required For |
> |---|---|---|
> | `DEEPSEEK_API_KEY` | Your DeepSeek API key | All AI features (insights, explain, generate questions) |
> | `SUPABASE_SERVICE_ROLE_KEY` | Copy from Project Settings → API → `service_role` key | Bypassing RLS in edge function DB operations |
> | `STRIPE_SECRET_KEY` | Your Stripe secret key (`sk_live_...` or `sk_test_...`) | `create-payment` — creates PaymentIntents |
> | `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard → Webhooks → signing secret (`whsec_...`) | `stripe-webhook` — verifies webhook signatures |
>
> **Auto-available (do NOT set manually):** `SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically injected by Supabase.
>
> **Stripe Webhook endpoint:** Register `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook` in the Stripe Dashboard → Developers → Webhooks. Subscribe to events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
>
> **Verify secrets are set:**
> 1. Go to Dashboard → Edge Functions → Select `ai-insights` → Logs
> 2. Trigger the function from the webapp or mobile app
> 3. Look for `🔑 ENV check:` log — all values should show `true`
> 4. If `hasServiceKey: false` → the `SUPABASE_SERVICE_ROLE_KEY` secret is missing
> 5. If AI features still show "maintenance mode" after setting secrets → run hotfix `08_fix_ai_feature_flags.sql`

> **Troubleshooting 401 Unauthorized:**
> If edge functions return 401, check the following:
> 1. **Check edge function logs** in Dashboard > Edge Functions > [function] > Logs
>    - Look for `🔑 ENV check:` log — confirms env vars and auth header presence
>    - Look for `❌ Authentication failed:` — shows the actual auth error message
> 2. **Verify JWT is not being rejected by Supabase's relay layer:**
>    - By default, Supabase verifies the JWT before the function code runs
>    - If deploying via CLI, use `--no-verify-jwt` flag (functions handle auth internally)
>    - If deploying via Dashboard, create `supabase/config.toml` with:
>      ```toml
>      [functions.ai-insights]
>      verify_jwt = false
>      [functions.ai-explain]
>      verify_jwt = false
>      [functions.ai-generate-questions]
>      verify_jwt = false
>      [functions.grade-open-questions]
>      verify_jwt = false
>      [functions.delete-account]
>      verify_jwt = false
>      ```
> 3. **Ensure the webapp's `.env` points to the correct Supabase project** (same project where edge functions are deployed)
> 4. **Ensure `SUPABASE_SERVICE_ROLE_KEY` is set** in Edge Functions > Secrets

Verify edge functions are deployed:
```bash
npx supabase functions list
```

**Step 7h-email: Customize Supabase Email Templates (CRITICAL)**

> **⚠️ CRITICAL: Without this step, email confirmation links will show "link expired"!**
> The default email templates use `{{ .ConfirmationURL }}` which routes through Supabase's server.
> Supabase's server **consumes the single-use token** then redirects with a PKCE `code` parameter.
> Since the mobile app holds the PKCE `code_verifier` (not the web confirm page), the code exchange fails → "link expired".
>
> **Fix:** Use `{{ .TokenHash }}` to send users **directly** to the confirm page, bypassing Supabase's server-side token consumption.

Go to **Supabase Dashboard → Authentication → Email → Templates** and update:

**Confirm signup** template:
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your email:</p>
<p><a href="https://uni-prep-auth.vercel.app/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a></p>
```

**Reset Password** template:
```html
<h2>Reset Password</h2>
<p>Follow this link to reset your password:</p>
<p><a href="https://uni-prep-auth.vercel.app/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
```

**Magic Link** template (if used):
```html
<h2>Magic Link</h2>
<p>Follow this link to log in:</p>
<p><a href="https://uni-prep-auth.vercel.app/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Log In</a></p>
```

> **How to verify:** After updating templates, sign up a new user → click the email link → should see "Email Verified Successfully" (not "link expired").

**Step 7h-smtp: Configure Custom SMTP for Email Delivery (Brevo)**

> **⚠️ CRITICAL: Without custom SMTP, Supabase limits email sending to 2 emails/hour (project-wide).**
> This means only 2 signups, password resets, or verification emails per hour across your entire project.
> You MUST configure a custom SMTP provider to lift this limit.

Brevo (https://www.brevo.com, formerly Sendinblue) is used as the SMTP provider. Free tier: **300 emails/day (~9,000/month)**.

**Setup Steps:**
1. Create a free account at https://www.brevo.com
2. Go to **Settings → SMTP & API → SMTP tab** → generate an SMTP key
3. Note down: **SMTP Server** (`smtp-relay.brevo.com`), **Port** (`587`), **Login** (e.g., `a1e0e7001@smtp-brevo.com`), **SMTP key**
4. Verify a sender email: **Senders, domains, IPs → Senders tab → Add a sender** → click the verification link
5. Go to **Supabase Dashboard → Authentication → Email → SMTP Settings**
6. Enable **"Enable custom SMTP"** toggle
7. Fill in the following:

| Field | Value |
|---|---|
| **Sender email address** | Your verified sender email from Brevo |
| **Sender name** | `Elmly` |
| **Host** | `smtp-relay.brevo.com` |
| **Port number** | `587` |
| **Minimum interval per user** | `60` seconds |
| **Username** | Your Brevo **Login** (e.g., `a1e0e7001@smtp-brevo.com`) — NOT your Gmail |
| **Password** | Your Brevo **SMTP key** (NOT API key, NOT account password) |

8. Click **Save changes**
9. Rate limit will automatically increase to **30 emails/hour** (adjustable after saving)

> **Notes:**
> - No domain verification required — just verify a sender email address in Brevo
> - To use a custom sender email (e.g., `noreply@elmly.az`), verify your domain in Brevo (Senders, domains, IPs → Domains tab)
> - The same Brevo SMTP credentials are used in the Admin panel for notification emails (`SMTP_USER` / `SMTP_PASS` env vars)
> - After enabling custom SMTP, go to **Authentication → Rate Limits** to increase the email rate limit beyond 30 if needed

**Step 7h-fix: Fix AI features "maintenance mode" (missing feature_flags config)** *(reference only — already integrated into 02_smoketest_fixes.sql)*

> **Note:** This fix has been integrated into `02_smoketest_fixes.sql` (section 2f).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database where AI features show "maintenance mode":
```sql
-- In Supabase SQL Editor, run:
-- initial_data/08_fix_ai_feature_flags.sql
```

This fixes:
- **AI Generate Questions showing "maintenance mode"** — The `ai_configuration` table was missing the `feature_flags` config row. The mobile app's `aiConfigService.checkFeatureEnabled()` reads this row to determine if individual AI features are enabled. Without it, all AI features (AI Generate Questions, AI Insights, AI Explain) incorrectly show maintenance mode.

Verify:
```sql
SELECT config_key, is_active,
  config_value->>'question_generation' IS NOT NULL AS has_qgen,
  config_value->>'student_insights' IS NOT NULL AS has_insights
FROM ai_configuration WHERE config_key = 'feature_flags';
-- Expected: 1 row, is_active=true, has_qgen=true, has_insights=true
```

**Step 7i-fix: Fix ai_usage_logs RLS + practice_sessions schema** *(already integrated into 03_rls_policies.sql and 01_base_schema.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/09_fix_rls_and_practice_sessions.sql
```

This fixes:
- **ai_usage_logs RLS violation** — Edge functions (`ai-generate-questions`, `ai-explain`) use anon key + user JWT (not service role), so they need INSERT/SELECT policies on `ai_usage_logs`. Without these, usage logging fails with "new row violates row-level security policy".
- **practice_sessions 400 Bad Request** — The webapp stores shuffled option order in `shuffled_questions` JSONB column for the review page. This column was missing from the schema, causing 400 on PATCH.

**Step 7j-fix: Fix competitive_sessions + competitive_question_results missing columns** *(already integrated into 01_base_schema.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/10_fix_competitive_columns.sql
```

This fixes:
- **competitive_sessions missing `score`** — The mobile app writes a percentage score (0-100) when completing a session. Error: "Could not find the 'score' column of 'competitive_sessions'"
- **competitive_question_results missing columns** — The mobile app writes `correct_answer`, `student_answer`, `question_text`, `option_a-d`, `topic`, `difficulty`, `time_spent` for the review screen and adaptive learning. Error: "Could not find the 'correct_answer' column of 'competitive_question_results'"

**Step 7k-fix: Fix competitive_question_results schema (question_id type + subject_id)** *(already integrated into 01_base_schema.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.
> **⚠️ This DROP+RECREATEs the table** — run AFTER hotfix 10 (which only ADDs columns). Any existing competitive_question_results data will be lost.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/11_fix_competitive_question_results_schema.sql
```

This fixes:
- **`question_id` was UUID with FK to questions** — AI-generated questions have IDs like `"sessionId_q1"` which are not valid UUIDs and don't exist in the `questions` table. Original S10 schema had `question_id TEXT NOT NULL`. Error: `invalid input syntax for type uuid: "3be38ccf-..._q1"`
- **Missing `subject_id` column** — The `adaptiveLearningService` writes `subject_id` for topic-level performance tracking. Error: `Could not find the 'subject_id' column of 'competitive_question_results'`
- **UNIQUE(session_id, question_id) too restrictive** — Both `competitiveSessionService` and `adaptiveLearningService` insert rows for the same session. Removed the constraint.
- **Missing DELETE RLS policy** — `competitiveSessionService.updateSession()` deletes old results before re-inserting.

**Step 7l-fix: Security audit critical fixes** *(already integrated into 04_functions_triggers.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/12_security_audit_critical_fixes.sql
```

This fixes:
- **CRITICAL-01: `verify_user_password` brute-force vulnerability** — Old function took `(user_email, password_attempt)` allowing any authenticated user to test any user's password. New function takes only `(password_attempt)` and uses `auth.uid()` to scope to the caller's own password.
- **CRITICAL-02: `check_email_exists` user enumeration** — Revokes `anon` grant so unauthenticated clients cannot enumerate registered emails. Mobile app has a fallback that checks the `profiles` table instead.
- **CRITICAL-03: `create_student_record` / `create_teacher_record` arbitrary record creation** — Adds time-bound auth validation inside the functions: if `auth.uid()` is set, `p_user_id` must match; if `auth.uid()` is NULL (signup before email confirmation), the user must exist in `auth.users` and have been created within the last 5 minutes. Anon grants are kept because the mobile signup flow calls these RPCs before email confirmation.
- **HIGH-01: `create_default_user_settings(UUID)` same pattern** — Same time-bound validation as CRITICAL-03.

> **⚠️ App code changes required alongside this SQL:**
> - `UniPrep/src/services/accountService.ts` — Remove `user_email` param from `verify_user_password` RPC call
> - `UniPrep/src/services/authService.ts` — Same fix (already applied in main migration files)
> - `UniPrep-Admin/src/lib/apiAuth.ts` — Use Supabase SSR cookie auth instead of hardcoded cookie name

**Step 7m-fix: Security audit HIGH severity fixes** *(already integrated into 03_rls_policies.sql and 04e_notification_leaderboard_functions.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/13_security_audit_high_fixes.sql
```

This fixes:
- **HIGH-03: `upsert_push_token` RLS bypass** — Adds time-bound auth validation (same pattern as CRITICAL-03) and grants to both `authenticated` and `anon` so push token registration works during signup flow.
- **HIGH-04: `settings_history` unrestricted INSERT** — Replaces `WITH CHECK (TRUE)` with admin-only check (`admins.is_active = true`).
- **HIGH-05: `notification_analytics` + `notification_performance_snapshots` unrestricted INSERT** — Same admin-only restriction.

> **⚠️ App/Admin code changes required alongside this SQL:**
> - `UniPrep-Admin/src/services/authService.ts` — `isAuthenticated()` now uses `getUser()` instead of `getSession()` (HIGH-02)
> - `UniPrep/src/utils/authMonitor.ts` — Periodic check uses `getUser()` instead of `getSession()` (HIGH-03b)
> - `UniPrep-Admin/src/app/api/notifications/processor/route.ts` — GET endpoint returns 404 (HIGH-06)
> - `UniPrep/src/services/authService.ts` — Client-side rate limiting on `signIn`, `resetPassword`, `resendVerificationEmail` (HIGH-07)

**Step 7n-fix: Upgrade admin_send_notification to latest version** *(already integrated into 01_base_schema.sql and 04e_notification_leaderboard_functions.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/14_fix_admin_send_notification.sql
```

This fixes:
- Adds missing `metadata` JSONB column to `admin_notifications` table
- Adds missing `data` JSONB column to `notifications` table
- Creates `process_notification_variables` helper function for template variable substitution (`{{user_name}}`, `{{first_name}}`, etc.)
- Upgrades `admin_send_notification` from 7-param to 9-param version (adds `p_notification_type`, `p_data`)
- Adds delivery tracking (`sent_at`, `delivered_at`) to recipient records
- Adds `announcement` to notification type constraint

**Step 7o-fix: Security audit MEDIUM severity DB fixes** *(already integrated into 03_rls_policies.sql and 04_functions_triggers.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/15_security_audit_medium_fixes.sql
```

This fixes:
- **MEDIUM-03: Profiles publicly readable** — Restricts profiles SELECT from `USING (true)` (anyone including anon) to `TO authenticated USING (true)` (logged-in users only). Prevents anonymous access to PII (email, phone, city).
- **MEDIUM-04: Students anon SELECT** — Removes the `"Public can view students"` anon policy. The `create_student_record` SECURITY DEFINER function handles signup without needing anon SELECT.
- **MEDIUM-05: Admin RLS uses profiles.user_type instead of admins table** — Updates ~30 admin RLS policies from `profiles WHERE id = auth.uid() AND user_type = 'admin'` to `admins WHERE user_id = auth.uid() AND is_active = true`. Ensures deactivated admins lose access immediately.
- **MEDIUM-12: handle_new_user() doesn't validate user_type** — Replaces `COALESCE(user_type, 'student')` with a CASE that only allows `'student'` or `'teacher'`, preventing an attacker from setting `user_type = 'admin'` via signup metadata.

> **⚠️ App/Admin code changes required alongside this SQL (MEDIUM-06 through MEDIUM-15):**
> - `UniPrep/src/utils/validation.ts` — Removed SQL character stripping from `sanitizeInput()` (MEDIUM-06)
> - `UniPrep-Auth/src/app/auth/confirm/page.tsx` — OTP type allowlist + URL param sanitization (MEDIUM-07)
> - `UniPrep-Auth/src/app/auth/reset-password/page.tsx` — URL param sanitization (MEDIUM-07)
> - All 5 Edge Functions — CORS restricted from `*` to allowed origins (MEDIUM-08)
> - `UniPrep-Admin/.env.example` — Added missing `NOTIFICATION_PROCESSOR_API_KEY` and `DEEPSEEK_API_KEY` (MEDIUM-09)
> - `UniPrep/babel.config.js` — Created with `transform-remove-console` for production builds (MEDIUM-10)
> - `UniPrep-Auth/next.config.js` — Added security headers (HSTS, CSP, X-Frame-Options, etc.) (MEDIUM-15)
> - `uniprep-webapp/next.config.ts` — Added security headers (MEDIUM-15)

**Step 7p-fix: Teacher marketplace functions** *(already integrated into 04_functions_triggers.sql)*

> For **new database setups**, these fixes are already in the main files. Only run the hotfix on existing databases.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/16_fix_teacher_marketplace_functions.sql
```

This adds:
- `get_student_teachers(UUID)` — Returns all teachers assigned by a student (used in leaderboard student detail modal)
- `search_teachers(TEXT, UUID, TEXT, INTEGER)` — Search teachers by name, subject, or city
- `assign_teacher_to_subject(UUID, UUID, UUID)` — Assign/update teacher for a subject
- `remove_teacher_from_subject(UUID, UUID)` — Remove teacher assignment
- `get_leaderboard_with_teachers(TEXT, TEXT, INTEGER)` — Leaderboard with teacher info overlay
- `update_student_teachers_timestamp()` — Trigger function for auto-updating `updated_at`
- Trigger `update_student_teachers_updated_at` on `student_teachers` table
- GRANT EXECUTE to `authenticated` for all 5 callable functions

**Step 7q: Phase 1 — Goal Setting & Study Plans tables** *(already integrated into main migration files)*

> **Note:** These tables and functions have been integrated into `01_base_schema.sql` (Section 18),
> `02_indexes.sql` (Section 18), `03_rls_policies.sql` (Section 18), and `04_functions_triggers.sql` (Section 18).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/17_goal_setting_tables.sql
```

This adds:
- **`student_goals`** table — daily question/time targets, exam date, target score, study preferences
- **`study_plans`** table — generated multi-week study plans with status tracking
- **`study_plan_weeks`** table — weekly breakdown with focus subjects and progress
- **`daily_progress`** table — tracks daily goal completion (questions, time, accuracy)
- **`upsert_daily_progress(UUID, INT, INT, INT)`** function — accumulates daily progress after practice/exam
- **Feature flags:** `goal_setting` and `study_plans` (both enabled by default)
- RLS policies, indexes, and updated_at triggers for all 4 tables

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'student_goals') AS has_student_goals,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'study_plans') AS has_study_plans,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_progress') AS has_daily_progress,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'upsert_daily_progress') AS has_upsert_fn,
  EXISTS(SELECT 1 FROM feature_flags WHERE flag_name = 'goal_setting') AS has_goal_flag;
-- Expected: all true
```

**Step 7r: Phase 2 — Onboarding Personalization columns** *(already integrated into main migration files)*

> **Note:** These columns have been integrated into `01_base_schema.sql` (students table).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/18_onboarding_personalization.sql
```

This adds:
- **`onboarding_completed`** column (BOOLEAN DEFAULT FALSE) — tracks whether student completed the personalization quiz
- **`strongest_subjects`** column (UUID[] DEFAULT '{}') — array of subject IDs the student is strongest in
- **`weakest_subjects`** column (UUID[] DEFAULT '{}') — array of subject IDs the student wants to improve
- **`idx_students_onboarding`** partial index — for quickly finding students who haven't completed onboarding
- Auto-sets existing students to `onboarding_completed = TRUE` (they don't need the quiz)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'onboarding_completed') AS has_onboarding_col,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'strongest_subjects') AS has_strongest_col,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'weakest_subjects') AS has_weakest_col,
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_students_onboarding') AS has_onboarding_idx;
-- Expected: all true
```

**Step 7s: Storage Buckets Hotfix — Missing avatars/certificates buckets + MIME security** *(already integrated into main migration files)*

> **Note:** These buckets have been integrated into `06_storage_buckets.sql`.
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/19_storage_buckets_hotfix.sql
```

This adds:
- **`avatars`** bucket — for user profile pictures (5MB limit, image types only)
- **`certificates`** bucket — for teacher certificates (5MB limit, images + PDF)
- **MIME type restrictions** on all buckets (security fix for "any" MIME type vulnerability)
- RLS policies for user-scoped uploads (users can only upload to their own folder)

Verify:
```sql
SELECT id, name, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id IN ('avatars', 'certificates', 'question-images', 'exam-answers');
-- Expected: 4 rows, all with allowed_mime_types set (not NULL)
```

**Step 7t: Teacher Onboarding columns** *(already integrated into main migration files)*

> **Note:** These columns have been integrated into `01_base_schema.sql` (teachers table).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/20_teacher_onboarding.sql
```

This adds:
- **`onboarding_completed`** column (BOOLEAN DEFAULT FALSE) — tracks whether teacher completed the onboarding quiz
- Auto-sets existing teachers to `onboarding_completed = TRUE` (they don't need the quiz)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'onboarding_completed') AS has_onboarding_col;
-- Expected: true
```

**Step 7u: Teacher Certificates in Admin Panel** *(already integrated into main migration files)*

> **Note:** This function update has been integrated into `04b_admin_functions.sql` (get_teacher_detail function).
> For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/21_teacher_certificates_function.sql
```

This updates:
- **`get_teacher_detail`** function — adds `certificates` field to the `info` object (returns `COALESCE(t.certificates, '{}')`)

Verify:
```sql
-- Call the function and check if certificates field exists in info
SELECT (get_teacher_detail('YOUR_TEACHER_ID'::UUID))->'info'->'certificates' IS NOT NULL AS has_certificates_field;
-- Expected: true (or run on any teacher to verify)
```

**Step 7v: Fix Duplicate Foreign Key Constraints (ORIGINAL DATABASE ONLY)** *(NOT needed for clean migration)*

> **⚠️ IMPORTANT: This file is ONLY for the original database!**
> The original database (based on `UniPrep/src/scripts` and `UniPrep-Admin/scripts` SQL files) has duplicate
> foreign key constraints that cause PostgREST `PGRST201` errors ("Could not embed because more than one
> relationship was found").
>
> **For new database setups using the consolidated main migration files (00-09 in this folder), you do NOT
> need to run this file.** The consolidated `01_base_schema.sql` already has the correct single FK constraints.

If you are patching the **original** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/22_fix_duplicate_fk_constraints.sql
```

This fixes:
- **Duplicate `students_user_id_fkey` and `students_user_id_fkey_profiles`** — Removes the duplicate `_profiles` constraint
- **Duplicate `teachers_user_id_fkey` and `teachers_user_id_fkey_profiles`** — Removes the duplicate `_profiles` constraint

These duplicates cause PostgREST to fail with:
```
PGRST201: Could not embed because more than one relationship was found for 'students' and 'user_id'
```

Verify:
```sql
-- Check that only ONE FK constraint exists per table
SELECT tc.table_name, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name IN ('students', 'teachers')
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'user_id';
-- Expected: 2 rows total (one per table), NOT 4
```

> **Note:** The mobile app code has also been updated to use explicit relationship hints in Supabase queries
> (e.g., `profiles!teachers_user_id_fkey`) to ensure compatibility with both original and clean databases.

**Step 8: Smoke test**
- [ ] Mobile app: Can sign up as student
- [ ] Mobile app: Receives confirmation email with correct link
- [ ] Mobile app: Can confirm email and deep link back to app
- [ ] Mobile app: Can reset password via email
- [ ] Mobile app: Can change password in Settings (verify_user_password security fix)
- [ ] Mobile app: Can view subjects and questions
- [ ] Mobile app: Can take a practice session
- [ ] Mobile app: Competitive mode loads subjects and weak topics
- [ ] Admin panel: Can log in as super_admin
- [ ] Admin panel: Dashboard shows stats
- [ ] Admin panel: Can search students
- [ ] Admin panel: Can manage questions (Answer column shows correct values for MCQ and codable_open)
- [ ] Admin panel: Can manage other admins (create moderator, admin)
- [ ] Admin panel: AI Management page loads without 400/404 errors
- [ ] Admin panel: Exam Groups page shows 5 groups with correct Stage I/II info
- [ ] Admin panel: Notification Templates page loads (requires apiAuth security fix)
- [ ] Admin panel: Notification Analytics page loads (requires apiAuth security fix)
- [ ] Admin panel: AI Prompt Testing works (requires apiAuth security fix)
- [ ] Webapp: Can load and display content
- [ ] Webapp: AI Insights loads without 401/CORS errors (requires edge functions with `--no-verify-jwt`)
- [ ] Webapp: AI Generate Questions works without RLS errors in edge function logs (requires hotfix 09)
- [ ] Webapp: Practice quiz submit works (no 400 Bad Request on practice_sessions PATCH)
- [ ] Mobile app: AI Generate Questions does NOT show "maintenance mode" (requires hotfix 08)
- [ ] Mobile app: AI Insights on Home tab does NOT show "maintenance mode"
- [ ] Mobile app: Admin account cannot log in (shows "Access Denied")
- [ ] Webapp: Admin account cannot log in (shows "Access denied")
- [ ] Admin panel: Student/teacher account cannot log in (shows "Access denied")
- [ ] Admin panel: Can send notification from /notifications/compose (requires hotfix 14)
- [ ] Mobile app: Rate limiting works on login (5 wrong attempts → lockout message in correct language)
- [ ] Mobile app: Push token registration succeeds after login (no RLS error)
- [ ] Mobile app: Leaderboard student detail modal loads teacher info (requires hotfix 16)
- [ ] Mobile app: Settings save without errors (language, theme, etc.)

### Option B: Local Supabase (Advanced)

If you have Docker installed, you can test locally:

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize a local project
supabase init

# Start local Supabase
supabase start

# Run migration files via psql
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f 00_prerequisites.sql
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f 01_base_schema.sql
# ... repeat for each file in order
```

### Option C: Dry Run on Existing Database (Caution)

**NOT recommended** — these scripts use `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION` which are safe for idempotent re-runs, but the `DROP POLICY IF EXISTS` statements in Section 17 of `03_rls_policies.sql` will modify existing policies.

If you must test on the existing database:
1. Take a full backup first via Supabase Dashboard → Settings → Database → Backups
2. Run `09_verify.sql` first to see current state
3. Compare output with expected values

---

## 7. Expected Output from `09_verify.sql`

After a successful migration, you should see approximately:

The verification script now returns a single JSON result. Key values to check:

| Category | Expected | Actual (Feb 7, 2026) |
|----------|----------|---------------------|
| Tables | ~59+ | **94** |
| Indexes | ~140+ | **362** |
| RLS | All tables | **94/94** (0 without) |
| Functions | ~90+ | **189** |
| Triggers | ~15+ | **30** |
| Views | ~17 | **17** |
| Enums | `admin_role`, `question_type` | ✅ |
| Extensions | `uuid-ossp`, `pgcrypto` | ✅ |
| Storage | `question-images`, `exam-answers` | ✅ |
| Realtime | `conversations`, `messages`, `notifications` | ✅ |
| Seed: `system_settings` | >0 | **38** |
| Seed: `feature_flags` | >0 | **8** |
| Seed: `notification_templates` | >0 | **12** |
| Seed: `security_policies` | >0 | **4** |
| Seed: `leaderboard_settings` | >0 | **13** |
| Seed: `ai_configuration` | >0 | **4** |
| Seed: `ai_prompts` | >0 | **3** |
| Seed: `daily_study_tips` | >0 | **40** |

---

## 8. Troubleshooting

### Common Issues

**"relation already exists"**
- Safe to ignore — `CREATE TABLE IF NOT EXISTS` handles this

**"function already exists with same argument types"**
- Safe — `CREATE OR REPLACE FUNCTION` handles this

**"policy already exists"**
- The migration drops conflicting policies before creating new ones. If you see this, a policy name conflict exists that wasn't anticipated. Drop the conflicting policy manually.

**"extension not available"**
- `pg_cron` requires enabling in Supabase Dashboard → Database → Extensions
- `uuid-ossp` and `pgcrypto` are usually pre-enabled

**"permission denied for schema auth"**
- Some functions reference `auth.users`. These require `SECURITY DEFINER` and must be run as the `postgres` role (which the SQL Editor uses by default)

**"type admin_role does not exist"**
- You skipped `00_prerequisites.sql`. Run it first.

### File Execution Errors

If a file fails partway through:
1. Check which statement failed (Supabase SQL Editor shows the line)
2. Fix the issue
3. Re-run the entire file — all statements are idempotent

---

## 9. Functions Coverage — Now Complete

All admin functions from source stages S3–S10 are now consolidated across the three new files:

| Source Stage | Consolidated Into | Functions |
|---|---|---|
| Admin S3 (Question bank, exams, helpers, leaderboard) | `04c` + `04e` | ~15 functions |
| Admin S4 (Subject/topic management) | `04c` | ~10 functions |
| Admin S5 (Analytics: engagement, content, system) | `04d` | ~15 functions |
| Admin S5.5 (AI analytics, budget alerts, cost optimization) | `04d` | ~10 functions |
| Admin S5 (Scheduled reports) | `04e` | 3 functions + 2 tables |
| Admin S7 (Notifications + monitoring + smart features) | `04e` | ~22 functions + 3 tables |
| Admin S5.5 (AI configuration) | `04d` | 4 functions |
| Admin S8 (Audit logging) | `04d` | 4 functions |
| Admin S10 (Fixes: search, reorder, bulk insert) | `04c` | Integrated as authoritative versions |

**No admin functions remain unconsolidated.** All pages in the admin panel should work after running files 00–09 in order.

---

**Step 7r: Teacher Availability Management (Phase 3 — Feature Roadmap)**

> **Note:** The tables, RLS, indexes, and function in `initial_data/25_teacher_availability.sql` have been integrated into the main migration files. For **new database setups**, you do NOT need to run this file separately. Only run it to patch an **existing** database.

If you are patching an **existing** database, run:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/25_teacher_availability.sql
```

This adds:
- **`teacher_availability`** table — recurring weekly schedule (one row per teacher per day-of-week, with `start_time`, `end_time`, `is_available`)
- **`teacher_time_off`** table — date-range vacation/sick blocks (`start_date`, `end_date`, `reason`)
- **RLS policies** — teachers manage own rows; authenticated users can read all availability
- **4 indexes** — `idx_teacher_availability_teacher`, `idx_teacher_availability_day`, `idx_teacher_time_off_teacher`, `idx_teacher_time_off_dates`
- **`get_teacher_availability_status(UUID)`** RPC — returns `'available'` | `'busy'` | `'offline'` based on current time, day-of-week schedule, and active time-off blocks
- **`teacher_availability` feature flag** — controls Phase 3 screens in mobile app
- **`updated_at` trigger** on `teacher_availability`

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'teacher_availability') AS availability_table,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'teacher_time_off')    AS time_off_table,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_teacher_availability_status')          AS rpc_exists,
  EXISTS(SELECT 1 FROM public.feature_flags WHERE flag_key = 'teacher_availability')       AS flag_exists;
-- Expected: true, true, true, true
```

**Mobile App changes (Phase 3):**
- `src/services/availabilityService.ts` — CRUD for `teacher_availability` + `teacher_time_off` + `getAvailabilityStatus()` RPC wrapper
- `src/components/teachers/WeeklyScheduleGrid.tsx` — visual 7-day toggle grid component
- `src/screens/teachers/AvailabilityManagementScreen.tsx` — weekly schedule management screen with day-edit modal
- `src/screens/teachers/TimeOffScreen.tsx` — time-off add/delete screen
- `src/navigation/TeacherDashboardStack.tsx` — added `AvailabilityManagement` + `TimeOff` routes
- `src/screens/teachers/TeacherDashboardScreen.tsx` — added "Availability" quick action button
- `src/services/teacherService.ts` — `getTeachers()` now resolves real `availability_status` via RPC (parallel calls)
- `src/i18n/translations/en.json`, `az.json`, `ru.json` — added `availability.*` and `timeOff.*` sections

**Web App changes (Phase 3):**
- `uniprep-webapp/src/services/availabilityService.ts` — web availability service
- `uniprep-webapp/src/app/(dashboard)/teacher/availability/page.tsx` — full availability management page

---

## 10. Post-Deployment Hotfixes (Applied to Existing DB)

These migrations were applied **after** the initial clean migration was deployed. They are already integrated into the consolidated SQL files for new deployments.

### Migration 26 — Phase 4 Messaging: File Sharing (`26_messaging_file_sharing.sql`)
**Applied:** February 2026  
**Purpose:** Enable file attachments (images, PDFs) in chat messages.

Changes:
- Added `file_url`, `file_name`, `file_type`, `file_size_bytes` columns to `messages` table
- Made `content` column nullable (file-only messages are valid)
- Created `chat-files` private storage bucket (10 MB limit, JPEG/PNG/GIF/WebP/PDF only)
- Added RLS policies for the `chat-files` bucket

Already integrated into: `01_base_schema.sql` (messages table), `06_storage_buckets.sql` (bucket + RLS)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'file_url') AS file_url_exists,
  EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'chat-files') AS bucket_exists;
-- Expected: true, true
```

---

### Migration 27 — DELETED (was problematic)
Migration `27_fix_bookings_rls_and_cancelled_by.sql` introduced an infinite RLS recursion and was superseded entirely by migration 28. **Do not run it.**

---

### Migration 28 — Fix RLS Recursion + Bookings Schema (`28_fix_rls_recursion.sql`)
**Applied:** February 2026  
**Purpose:** Fix `PGRST204` error on booking rejection (`cancelled_by` missing) and fix "Unknown" student name on teacher bookings screen. Also resolves `42P17` infinite RLS recursion introduced by migration 27.

Root cause of recursion:
- `students` RLS policy queried `bookings` → triggered `bookings` RLS → queried `students` → infinite loop

Fix — denormalized `user_id` columns on `bookings`:
- Added `cancelled_by TEXT CHECK ('student'|'teacher'|'admin')` to `bookings`
- Added `student_user_id UUID` and `teacher_user_id UUID` to `bookings` (denormalized auth UIDs)
- Backfilled both columns from existing `students`/`teachers` rows
- Added `BEFORE INSERT/UPDATE` trigger `trg_bookings_sync_user_ids` to keep them in sync
- Rewrote `bookings` SELECT/UPDATE RLS policies to use `student_user_id = auth.uid()` directly (no cross-table subquery)
- Added `students` SELECT policy for teachers using `bookings.student_user_id` (no recursion)
- Added indexes on `bookings(student_user_id)` and `bookings(teacher_user_id)`

Already integrated into:
- `01_base_schema.sql` — `cancelled_by`, `student_user_id`, `teacher_user_id` columns on `bookings`
- `02_indexes.sql` — `idx_bookings_student_user_id`, `idx_bookings_teacher_user_id`
- `03_rls_policies.sql` — rewritten `bookings` policies + new `students` teacher-view policy
- `04_functions_triggers.sql` — `bookings_sync_user_ids()` function + `trg_bookings_sync_user_ids` trigger

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'cancelled_by') AS cancelled_by_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'student_user_id') AS student_user_id_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'teacher_user_id') AS teacher_user_id_exists,
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'Users can view own bookings') AS bookings_policy_exists,
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Teachers can view students in their bookings') AS teacher_student_policy_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'bookings_sync_user_ids') AS trigger_fn_exists;
-- Expected: all true
```

---

### Migration 29 — Fix Conversation Trigger for File-Only Messages (`29_fix_conversation_trigger_file_messages.sql`)
**Applied:** February 2026  
**Purpose:** Fix conversations list showing empty when only file messages were sent.

Root cause:
- `update_conversation_on_message` trigger set `last_message = NEW.content`
- File-only messages have `content = NULL`, so `last_message` stayed `NULL`
- The conversations list query filtered `.not('last_message', 'is', null)`, hiding those conversations

Fix:
- Trigger now uses `COALESCE(NEW.content, CASE file_type WHEN 'image' THEN '📷 Photo' WHEN 'pdf' THEN '📄 PDF' ELSE '📎 File' END)` so file messages always produce a non-null `last_message`
- App-side `null` filter removed from `getStudentConversations` / `getTeacherConversations` — all conversations now always appear

Already integrated into: `04_functions_triggers.sql` (section 11.1)

Verify:
```sql
SELECT prosrc LIKE '%COALESCE%' AS has_coalesce_fix
FROM pg_proc WHERE proname = 'update_conversation_on_message';
-- Expected: true
```

---

### Migration 30 — Phase 5: Booking Reminders & Session Notes (`30_phase5_booking_reminders_session_notes.sql`)
**Applied:** February 2026  
**Purpose:** Send push/in-app reminders before confirmed sessions (24h, 1h, 15min) and allow teachers to add post-session notes visible to students.

> **No `pg_cron` used.** Reminders are triggered by the existing cron-job.org job that already calls `https://uni-prep-admin.vercel.app/api/notifications/processor` every minute. That processor calls `SELECT send_booking_reminders();` as part of its notification processing cycle.

> **Note:** All changes have been integrated into the main migration files. For **new database setups**, you do NOT need to run this file. Only run it to patch an existing database.

If you are patching an **existing** database:
```sql
-- In Supabase SQL Editor, run:
-- initial_data/30_phase5_booking_reminders_session_notes.sql
```

This adds:
- **`teacher_notes`** and **`teacher_notes_updated_at`** columns to `bookings` — teachers write post-session notes, students see them read-only
- **`booking_reminders`** table — tracks which reminders (24h/1h/15min) have been sent per booking; `UNIQUE(booking_id, reminder_type)` prevents duplicates
- **`send_booking_reminders()`** SECURITY DEFINER function — scans confirmed bookings, queues `notification_queue` rows for both student and teacher, records in `booking_reminders`
- RLS policy on `booking_reminders` (users can view reminders for their own bookings)
- Indexes on `booking_reminders(booking_id)` and `booking_reminders(sent_at)`
- 3 `notification_events` seed rows: `booking_reminder_24h`, `booking_reminder_1h`, `booking_reminder_15min`

Already integrated into:
- `01_base_schema.sql` — `teacher_notes` columns on `bookings`, `booking_reminders` table
- `02_indexes.sql` — `idx_booking_reminders_booking`, `idx_booking_reminders_sent_at`
- `03_rls_policies.sql` — `booking_reminders` SELECT policy
- `04_functions_triggers.sql` — `send_booking_reminders()` function (Section 20)
- `05_default_data.sql` — 3 `notification_events` seed rows

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'teacher_notes') AS teacher_notes_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_reminders') AS reminders_table_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'send_booking_reminders') AS fn_exists,
  (SELECT COUNT(*) FROM notification_events WHERE event_type LIKE 'booking_reminder%') AS reminder_events_count;
-- Expected: true, true, true, 3
```

---

### Migration 31 — Phase 8B: Stripe Payments & Teacher Wallets
**Applied:** February 2026  
**Purpose:** Enable paid teacher bookings via Stripe and teacher wallet/payout system.

This added:
- **`wallets`** table — teacher earnings balance, currency, total earned/paid out
- **`wallet_transactions`** table — ledger of credits (booking payment) and debits (payout)
- **`payout_requests`** table — teacher withdrawal requests (pending → approved/rejected by admin)
- **`subscription_tiers`** table — premium plan definitions with Stripe price IDs
- **`user_subscriptions`** table — active subscriptions per user
- `payment_status`, `payment_intent_id`, `price` columns on `bookings`
- Edge functions: `create-payment`, `stripe-webhook`, `request-payout` (see Step 7h)
- SQL functions: `process_booking_payment()`, `process_refund()` (SECURITY DEFINER, service_role only)

Already integrated into: `01_base_schema.sql` (tables + columns), `04_functions_triggers.sql` (payment functions)

**Environment secrets required** (Supabase Dashboard → Edge Functions → Secrets):
- `STRIPE_SECRET_KEY` — for `create-payment`
- `STRIPE_WEBHOOK_SECRET` — for `stripe-webhook`

---

### Migration 32 — Leaderboard Anti-Gaming & Fairness Hardening (`32_leaderboard_anti_gaming.sql`)
**Applied:** February 2026  
**Purpose:** Close critical security vulnerabilities in the leaderboard/scoring system that allowed users to manipulate their ranking.

**Vulnerabilities fixed:**
1. **Direct `leaderboard_score` write** — The broad `"Users can update own student data"` RLS policy allowed any authenticated user to `UPDATE students SET leaderboard_score = 100`. Replaced with `"Users can update own safe student data"` which has a `WITH CHECK` clause blocking changes to all scoring columns (`leaderboard_score`, `elo_rating`, `monthly_score`, `k_factor`, `total_exams_taken`, `activity_multiplier`, `bonus_points`).
2. **No server-side score validation** — Score was calculated client-side and written directly. New `update_leaderboard_score_after_exam(p_student_id, p_attempt_id)` SECURITY DEFINER function validates ownership, verifies the attempt exists and is genuinely completed, and applies the weighted average server-side.
3. **Leaderboard reset exposed to all users** — `reset_leaderboard_soft`, `reset_leaderboard_hard`, `create_season`, `archive_season` were granted to `authenticated`. Any student could wipe all scores. Revoked from `authenticated`, granted to `service_role` only.
4. **Offline sync stat inflation** — `offlineSyncService.updateUserStats()` credited stats to today's date (sync date) instead of the original session date. New `upsert_offline_session_stats(user_id, session_date, ...)` RPC credits the correct historical date.
5. **Two disconnected scoring systems** — `leaderboard_score` and ELO/`monthly_score` were updated independently, causing inconsistencies. The new `update_leaderboard_score_after_exam` calls `update_student_score()` internally, keeping both systems in sync.

Already integrated into:
- `03_rls_policies.sql` — new `"Users can update own safe student data"` policy replaces old broad policy
- `04_functions_triggers.sql` — Sections 8.8 (`update_leaderboard_score_after_exam`) and 8.9 (`upsert_offline_session_stats`) + grants
- `04e_notification_leaderboard_functions.sql` — leaderboard reset functions revoked from `authenticated`, granted to `service_role`

**App code changes applied alongside this migration:**
- `src/services/leaderboardService.ts` — `updateLeaderboardScore()` now calls RPC instead of writing DB directly; signature changed from `(studentId, examScore)` to `(studentId, attemptId)`
- `src/screens/exams/ExamResultsScreen.tsx` — passes `attemptId` to `updateLeaderboardScore()` instead of computed score percentage
- `src/services/offlineSyncService.ts` — `updateUserStats()` uses `upsert_offline_session_stats` RPC with `session.completedAt` date

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_leaderboard_score_after_exam') AS anti_gaming_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'upsert_offline_session_stats') AS offline_stats_fn,
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Users can update own safe student data') AS safe_rls_policy,
  NOT EXISTS(SELECT 1 FROM information_schema.role_routine_grants WHERE routine_name = 'reset_leaderboard_soft' AND grantee = 'authenticated') AS reset_revoked;
-- Expected: all true
```

---

### Migration 33 — Fix Students RLS Infinite Recursion (`33_fix_students_rls_recursion.sql`)
**Applied:** February 2026  
**Purpose:** Fix PostgreSQL error 42P17 "infinite recursion detected in policy for relation students" that occurred when updating student records (daily stats, analytics, profile).

**Root cause:**
The `"Users can update own safe student data"` policy on the `students` table had a `WITH CHECK` clause that queried the `students` table itself:
```sql
AND leaderboard_score = (SELECT leaderboard_score FROM students WHERE user_id = auth.uid())
```
This triggered recursive RLS evaluation → infinite loop → error 42P17.

**Solution:**
Created a `SECURITY DEFINER` helper function `get_student_protected_columns(p_user_id)` that bypasses RLS when reading the current scoring column values. The policy now uses this function instead of direct subqueries.

**Files changed:**
- `initial_data/33_fix_students_rls_recursion.sql` — hotfix migration (run this on existing DBs)
- `04_functions_triggers.sql` — added `get_student_protected_columns()` function (Section 1.0) + grant
- `03_rls_policies.sql` — updated `"Users can update own safe student data"` policy to use the helper function

**Hotfix for existing databases:**
```sql
-- Run initial_data/33_fix_students_rls_recursion.sql
-- Or manually:
\i initial_data/33_fix_students_rls_recursion.sql
```

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_student_protected_columns') AS helper_fn_exists,
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'Users can update own safe student data') AS policy_exists;
-- Expected: true, true

-- Test: This should work without recursion error
UPDATE students SET full_name = full_name WHERE user_id = auth.uid();
```

---

### Migration 34 — Study Reminder Notifications Enhancement (`34_study_reminder_notifications.sql`)
**Applied:** February 2026
**Purpose:** Enhance notification infrastructure for study day/time reminders.

What it implements:
1. Updates Goal Reminder notification template with better messaging
2. Adds Weekly Plan Summary template (optional, disabled by default)
3. Ensures `goal_reminder` event is properly registered
4. Adds `weekly_plan_summary` event (disabled by default)
5. Ensures `goal_reminders` column exists in `user_settings` and `notification_preferences`

Already integrated into: `04_functions_triggers.sql` (goal reminder functions), `05_default_data.sql` (templates + events)

Client-side notes:
- Notifications are scheduled via `notificationService.scheduleGoalReminder()`
- Uses expo-notifications `WeeklyTriggerInput` for cross-platform support
- Content is translated via i18n (supports Azerbaijani, English, Russian)
- Time mapping: morning=08:00, afternoon=13:00, evening=18:00, night=21:00
- Days stored as integers: 0=Sunday through 6=Saturday

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM notification_events WHERE event_type = 'goal_reminder') AS goal_reminder_event,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'goal_reminders') AS col_exists;
-- Expected: true, true
```

---

### Migration 35 — Hybrid Leaderboard Scoring System (`35_hybrid_scoring_system.sql`)
**Applied:** February 2026
**Purpose:** Replace single-metric leaderboard scoring with a weighted hybrid formula. Removes ELO-based ranking from user-facing calculations.

**Score formula:** 70% exam score (weighted avg of last 4) + 20% practice accuracy (30-day) + 10% streak bonus

What it implements:
- `students.practice_score DECIMAL(5,2)` — new column tracking practice contribution
- `calculate_practice_score(user_id)` — accuracy + volume from last 30 days (0–100 scale)
- `calculate_streak_bonus(student_id)` — streak days mapped to 0–100 (7d=50, 14d=75, 30d=100)
- `update_leaderboard_score_after_exam(student_id, attempt_id)` — main hybrid scorer, replaces old ELO-based function; validates ownership + attempt authenticity
- `recalculate_leaderboard_score(student_id)` — daily recalc without requiring a new exam
- `leaderboard_settings` seed rows: `exam_weight`, `practice_weight`, `streak_weight`

Already integrated into: `01_base_schema.sql` (`students.practice_score`), `04_functions_triggers.sql` (all 4 functions + grants), `05_default_data.sql` (`leaderboard_settings` rows)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'practice_score') AS practice_score_col,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'calculate_practice_score') AS practice_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'calculate_streak_bonus') AS streak_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'recalculate_leaderboard_score') AS recalc_fn;
-- Expected: all true
```

---

### Migration 36 — Booking-Based Messaging Restriction (`36_messaging_booking_restriction.sql`)
**Applied:** March 2026  
**Purpose:** Prevent students from bypassing the booking system by messaging teachers directly. Messaging is only enabled after a booking is confirmed.

**Problem solved:**
Students could message teachers directly without booking a session, which undermines the "Book Session" button and reduces monetization opportunities.

**What it implements:**

1. **RLS Policy Update** — Messages can only be inserted into conversations where `is_approved = TRUE`
2. **`has_active_booking(student_id, teacher_id)`** — Returns TRUE if student has confirmed/completed booking
3. **`approve_conversation(student_id, teacher_id)`** — Creates or approves conversation (SECURITY DEFINER)
4. **`revoke_conversation_if_no_bookings(student_id, teacher_id)`** — Revokes approval if no active bookings remain
5. **`trigger_manage_conversation_on_booking()`** — Auto-approves on booking confirmation, revokes on cancellation
6. **`check_messaging_eligibility(student_id, teacher_id)`** — Returns eligibility status for UI display
7. **Booking spam prevention:**
   - Prevents duplicate date/time bookings
   - Max 3 pending requests per teacher
   - Max 10 pending requests overall
   - Rate limit: max 5 requests per hour

Already integrated into:
- `03_rls_policies.sql` — Updated `"Users can send messages in approved conversations"` policy
- `04_functions_triggers.sql` — Section 20: All functions, triggers, and grants

**App code changes applied:**
- `src/services/messagingService.ts` — Added `MessagingEligibility` interface and `checkMessagingEligibility()` method
- `src/screens/teachers/TeacherProfileScreen.tsx` — Message button shows 3 states (unlocked, pending, locked)
- `src/i18n/translations/*.json` — Added messaging restriction translations

**User flow:**
1. Student visits teacher profile → sees "Book to Message" (locked)
2. Student books session → sees "Pending Approval"
3. Teacher confirms → trigger fires → conversation approved → sees "Message" (unlocked)
4. If teacher rejects → conversation revoked → sees "Book to Message" (locked)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'approve_conversation') AS approve_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'check_messaging_eligibility') AS eligibility_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'check_booking_conflicts') AS conflicts_fn,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_manage_conversation_on_booking') AS manage_trigger,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_booking_conflicts') AS conflicts_trigger;
-- Expected: all true
```

---

### Migration 37 — Forum Bookmarks RLS Hotfix (`37_forum_bookmarks_hotfix.sql`)
**Applied:** March 2026  
**Purpose:** Fix 406 (Not Acceptable) error when saving/bookmarking questions in the Elmly Forum.

**Problem:**
Users clicking the "Save" button under questions received a 406 error:
```
GET .../forum_bookmarks?select=id&user_id=eq...&question_id=eq... 406 (Not Acceptable)
```

**Root cause:**
The `forum_bookmarks` table RLS policies may not have been properly applied during initial migration, or grants were missing for authenticated users.

**What it fixes:**
1. Ensures RLS is enabled on `forum_bookmarks`
2. Drops and recreates all bookmark policies with correct permissions
3. Grants SELECT, INSERT, DELETE to authenticated users
4. Adds missing indexes for performance

**Files:**
- `initial_data/37_forum_bookmarks_hotfix.sql` — hotfix migration (run this on existing DBs)
- `08b_forum_tables.sql` — already contains correct policies (Section 5, lines 426-440)

**Run:**
```sql
\i initial_data/37_forum_bookmarks_hotfix.sql
```

**Verify:**
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'forum_bookmarks' AND policyname = 'Users can view own bookmarks') AS select_policy,
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'forum_bookmarks' AND policyname = 'Users can create bookmarks') AS insert_policy,
  EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'forum_bookmarks' AND policyname = 'Users can delete own bookmarks') AS delete_policy;
-- Expected: all true
```

---

### Migration 38 — Social Media Links Settings (`38_social_media_links.sql`)
**Applied:** March 2026
**Purpose:** Add social media link settings to `system_settings` for the landing page footer.

What it implements:
- 5 new `system_settings` rows (`social_facebook`, `social_instagram`, `social_twitter`, `social_linkedin`, `social_tiktok`) — all with `is_public = TRUE`, `data_type = 'string'`, default empty string
- Empty value = hidden from footer (footer renders only links with non-empty URLs)

Already integrated into: `05_default_data.sql` (general settings section)

Verify:
```sql
SELECT COUNT(*) AS social_settings_count FROM system_settings WHERE key LIKE 'social_%';
-- Expected: 5
```

---

### Migration 39 — Waitlist Feature (`39_waitlist_feature.sql`)
**Applied:** March 2026  
**Purpose:** Pre-launch waitlist system for collecting early access signups from the landing page.

**What it implements:**
1. **`waitlist_subscribers`** table — stores email, name, source, status, locale, metadata
2. **`join_waitlist(email, name, source, locale, metadata)`** — RPC for landing page signup
3. **`get_waitlist_stats()`** — Returns counts by status for admin dashboard
4. **`get_waitlist_subscribers(...)`** — Paginated list with filtering/sorting for admin
5. **`update_waitlist_status(subscriber_id, status, notes)`** — Admin status updates
6. **`export_waitlist_emails(status)`** — CSV export for email campaigns
7. **Feature flags:** `webapp_auth_enabled`, `waitlist_enabled`

Already integrated into:
- `01_base_schema.sql` — `waitlist_subscribers` table (Section 17)
- `04_functions_triggers.sql` — All waitlist functions (Section 21)
- `05_default_data.sql` — Feature flags

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'waitlist_subscribers') AS table_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'join_waitlist') AS join_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_waitlist_stats') AS stats_fn;
-- Expected: all true
```

---

### Migration 40 — Waitlist Security Improvements (`40_waitlist_security_improvements.sql`)
**Applied:** March 2026  
**Purpose:** Add rate limiting, bulk actions, and email queue for waitlist invitations.

**What it implements:**
1. **`waitlist_rate_limits`** table — IP-based spam protection (5 attempts/hour, 1-hour block)
2. **`waitlist_email_queue`** table — Queue for invitation emails (processed by notification processor)
3. **Enhanced `join_waitlist()`** — Now accepts `p_ip_address` parameter for rate limiting
4. **`bulk_update_waitlist_status(ids[], status, send_email)`** — Bulk admin actions with optional email
5. **`cleanup_waitlist_rate_limits()`** — Removes old rate limit records (24h+)
6. **`get_pending_waitlist_emails(limit)`** — Atomic claim for email processor
7. **`update_waitlist_email_status(email_id, status, error)`** — Mark emails sent/failed
8. **Waitlist invitation email templates** — 3 languages (az, en, ru)

Already integrated into:
- `01_base_schema.sql` — `waitlist_rate_limits`, `waitlist_email_queue` tables (Section 17)
- `02_indexes.sql` — Indexes for both tables (Section 20)
- `04_functions_triggers.sql` — All functions (Section 21)
- `05_default_data.sql` — Email templates (Section 3.2b)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'waitlist_rate_limits') AS rate_limits_table,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'waitlist_email_queue') AS email_queue_table,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'bulk_update_waitlist_status') AS bulk_fn,
  (SELECT COUNT(*) FROM notification_templates WHERE template_name LIKE 'waitlist_invitation%') AS invite_templates;
-- Expected: true, true, true, 3
```

---

### Migration 40a — Fix Notification Templates Schema (`40a_fix_notification_templates.sql`)
**Applied:** March 2026
**Prerequisite for:** Migration 40
**Purpose:** Bridge the schema gap between old DBs (bootstrapped from original pre-migration files) and the consolidated `01_base_schema.sql`. Old DBs had `notification_templates` with only 7 columns and `name TEXT NOT NULL`; the consolidated schema has additional email columns and `name` nullable.

**Root causes fixed:**
1. `ERROR: column "template_name" does not exist` — email template columns were never applied as a hotfix
2. `ERROR: 23502 null value in column "name"` — Migration 40's INSERTs provide `template_name` but not `name`, which violated the old NOT NULL constraint

What it implements:
- `ALTER COLUMN name DROP NOT NULL` — makes `name` nullable (if it was NOT NULL) to match consolidated schema
- `ADD COLUMN template_name TEXT UNIQUE` + backfills from `name` for existing rows
- `ADD COLUMN template_type TEXT CHECK ('email'|'push'|'in_app'|'sms')`
- `ADD COLUMN subject TEXT`
- `ADD COLUMN language TEXT CHECK ('az'|'en'|'ru')`

Already integrated into: `01_base_schema.sql` (notification_templates table definition)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_templates' AND column_name = 'template_name') AS template_name_col,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_templates' AND column_name = 'language') AS language_col,
  (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'notification_templates' AND column_name = 'name') AS name_nullable;
-- Expected: true, true, 'YES'
```

---

### Migration 41 — Waitlist Email Fix (`41_waitlist_email_fix.sql`)
**Applied:** March 2026  
**Purpose:** Fix `update_waitlist_status()` to queue invitation emails when inviting individual subscribers.

**Problem:**
The individual ✉️ "Send Invite" button in the admin panel called `update_waitlist_status()` which only updated the status but did NOT queue an email. Only the bulk action queued emails.

**Fix:**
Updated `update_waitlist_status()` to accept `p_send_email BOOLEAN DEFAULT TRUE` parameter. When status is `'invited'` and `p_send_email` is true, it inserts into `waitlist_email_queue`.

Already integrated into:
- `04_functions_triggers.sql` — Updated `update_waitlist_status()` function (Section 21.6)

**Hotfix for existing databases:**
```sql
-- Run initial_data/41_waitlist_email_fix.sql
```

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_waitlist_status' AND pronargs = 4) AS has_4_param_fn;
-- Expected: true
```

---

### Migration 42a — Fix Notification Templates Category Constraint (`42a_fix_notification_templates_category.sql`)
**Applied:** April 2026
**Prerequisite for:** Migration 42
**Purpose:** Expand the `notification_templates_category_check` CHECK constraint on old DBs to include `'payment'` and `'message'` before Migration 42 inserts rows with `category = 'payment'`.

**Root cause:**
Old DBs' `notification_templates_category_check` constraint was created before `'payment'` was a valid category. Migration 42 inserts templates with `category = 'payment'`, causing:
```
ERROR: 23514: new row for relation "notification_templates" violates check constraint "notification_templates_category_check"
DETAIL: Failing row contains (..., payment, ...).
```

**Fix:** Idempotent DO block that drops the old constraint and recreates it with the full set of valid categories: `'booking'`, `'exam'`, `'achievement'`, `'reminder'`, `'general'`, `'announcement'`, `'payment'`, `'message'`.

Already integrated into: `01_base_schema.sql` (full category list in the original CHECK constraint)

**Hotfix for existing databases:**
```sql
-- Run initial_data/42a_fix_notification_templates_category.sql
-- Then run initial_data/42_payment_notification_events.sql
```

Verify:
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'notification_templates'::regclass AND conname = 'notification_templates_category_check';
-- Expected: CHECK ((category = ANY (ARRAY['booking', ..., 'payment', 'message'])))
```

---

### Migration 42 — Payment Notification Events (`42_payment_notification_events.sql`)
**Applied:** April 2026
**Purpose:** Add notification infrastructure for the Phase 8B pay-after-acceptance booking flow.

What it implements:
- `notification_queue.idempotency_key TEXT UNIQUE` — prevents duplicate push notifications
- `notifications.idempotency_key TEXT UNIQUE` — prevents duplicate in-app notifications
- `notifications.type` CHECK constraint expanded to include `'payment'` and `'message'` types
- 7 `notification_events` rows: `booking_accepted_payment_required`, `payment_succeeded`, `payment_received`, `payment_failed`, `booking_confirmed`, `booking_cancelled`, `refund_processed`
- 6 `notification_templates` rows for payment events
- `queue_payment_notification(user_id, type, title, body, data, channels, priority)` — queues both push (via `notification_queue`) and in-app (via `notifications`) with idempotency
- 1 `notification_events` row: `new_message` (for message push notifications)

Already integrated into: `01_base_schema.sql` (`idempotency_key` columns, expanded type constraint), `04_functions_triggers.sql` (`queue_payment_notification`), `05_default_data.sql` (events + templates)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'idempotency_key') AS queue_idempotency,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'queue_payment_notification') AS queue_fn,
  (SELECT COUNT(*) FROM notification_events WHERE event_type IN ('booking_accepted_payment_required', 'payment_succeeded', 'payment_failed')) AS payment_events;
-- Expected: true, true, 3
```

---

### Migration 43 — Fix Payment Settings Visibility & Booking Status Constraints (`43_fix_payment_settings_visibility.sql`)
**Applied:** April 2026
**Purpose:** Fix two root causes preventing paid bookings from working even with `bookings_paid = true` set in the admin panel.

**Root cause 1 — RLS blocked payment settings:**
`bookings_paid`, `stripe_publishable_key`, and `stripe_mode` had `is_public = FALSE`. The `system_settings_public_read` RLS policy only exposes `is_public = TRUE` rows to non-admin clients → `paymentService.isBookingsPaid()` returned no data → always took the free-booking path.

**Root cause 2 — CHECK constraints too restrictive:**
- `bookings.status` didn't include `'awaiting_payment'` (set by `capture-booking-payment` Edge Function when teacher accepts a paid booking)
- `bookings.payment_status` didn't include `'awaiting_acceptance'` (set by `create-payment` when student creates a paid request) or `'awaiting_payment'`

What it implements:
- `UPDATE system_settings SET is_public = TRUE` for `bookings_paid`, `stripe_publishable_key`, `stripe_mode`
- Drops and recreates `bookings_status_check` to include `'awaiting_payment'`
- Drops and recreates `bookings_payment_status_check` to include `'awaiting_acceptance'` and `'awaiting_payment'`

Already integrated into: `01_base_schema.sql` (updated CHECK constraints), `05_default_data.sql` (`is_public = TRUE` for payment settings)

Verify:
```sql
SELECT key, is_public FROM system_settings WHERE key IN ('bookings_paid', 'stripe_publishable_key', 'stripe_mode');
-- Expected: all is_public = true

SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'bookings'::regclass AND conname = 'bookings_payment_status_check';
-- Expected: includes 'awaiting_acceptance' and 'awaiting_payment'
```

---

### Migration 44 — Fix Notification Queue UNIQUE Constraint (`44_fix_notification_queue_constraint.sql`)
**Applied:** April 2026
**Purpose:** Fix `ON CONFLICT (idempotency_key) DO NOTHING` failing because only a partial UNIQUE INDEX existed — PostgreSQL requires a full UNIQUE CONSTRAINT for `ON CONFLICT` target columns.

What it implements:
- Drops `idx_notification_queue_idempotency` partial index (if exists)
- Drops `idx_notifications_idempotency` partial index (if exists)
- Adds `notification_queue_idempotency_key_unique` UNIQUE CONSTRAINT on `notification_queue(idempotency_key)`
- Adds `notifications_idempotency_key_unique` UNIQUE CONSTRAINT on `notifications(idempotency_key)`

Already integrated into: `01_base_schema.sql` (UNIQUE CONSTRAINT on both tables)

Verify:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid IN ('notification_queue'::regclass, 'notifications'::regclass) AND contype = 'u'
  AND conname LIKE '%idempotency%';
-- Expected: 2 rows
```

---

### Migration 45 — Message Push Notification Trigger (`45_message_notification_trigger.sql`)
**Applied:** April 2026
**Purpose:** Automatically queue push notifications to the recipient when a new message is inserted into the `messages` table.

What it implements:
- `notify_new_message()` trigger function — resolves recipient `user_id` from `conversations` + `students`/`teachers` tables; builds message preview (50-char truncation, file type fallbacks); calls `queue_payment_notification()` with `channels = ['push']` and priority 7
- `trigger_notify_new_message` AFTER INSERT trigger on `messages`

> Push-only (no in-app) — messages are displayed in the chat UI itself, not the notifications center.

Already integrated into: `04_functions_triggers.sql` (`notify_new_message` function + trigger)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'notify_new_message') AS trigger_fn,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_new_message') AS trigger_exists;
-- Expected: true, true
```

---

### Migration 46 — Subtopics Layer Migration (`46_subtopics_migration.sql`)
**Applied:** April 2026
**Purpose:** Introduce the full Subjects → Topics → **Subtopics** → Questions hierarchy. Stage 1 of `SUBTOPICS_MIGRATION_PLAN.md`.

What it implements:
- **`subject_subtopics`** table — `topic_id` FK → `subject_topics`, `subject_id` FK → `subjects`, `subtopic_name`, `difficulty_level`, `display_order`, `is_active`
- `questions.subtopic_id UUID FK` — nullable, backward-safe; `ON DELETE SET NULL`
- 4 indexes: `idx_subject_subtopics_topic_id`, `idx_subject_subtopics_subject_id`, `idx_subject_subtopics_active`, `idx_questions_subtopic_id`
- RLS on `subject_subtopics`: public SELECT (active only), admin INSERT/UPDATE/DELETE
- `get_topics_by_subject()` updated — now returns `subtopic_count BIGINT` (required DROP + recreate)
- `admin_delete_topic()` updated — blocks deletion if subtopics exist
- 7 new admin CRUD functions: `get_subtopics_by_topic`, `get_subtopics_by_subject`, `admin_create_subtopic`, `admin_update_subtopic`, `admin_delete_subtopic`, `admin_reorder_subtopics`, `admin_toggle_subtopic_status`
- `set_updated_at_subject_subtopics` trigger

Already integrated into: `01_base_schema.sql` (`subject_subtopics` table, `questions.subtopic_id`), `02_indexes.sql` (4 indexes), `03_rls_policies.sql` (4 policies), `04_functions_triggers.sql` (all 9 functions + trigger)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'subject_subtopics') AS table_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'subtopic_id') AS questions_fk,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_subtopics_by_topic') AS get_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_create_subtopic') AS create_fn;
-- Expected: all true
```

---

### Migration 47 — Stage 7: Subtopics Analytics & AI Layer (`47_stage7_subtopic_analytics.sql`)
**Applied:** April 2026
**Purpose:** Stage 7 of `SUBTOPICS_MIGRATION_PLAN.md`. Adds subtopic-level tracking to competitive mode and new analytics/AI functions for weak area detection. Prerequisite: Migration 46.

What it implements:
- `competitive_question_results.subtopic_id UUID FK` — nullable, `ON DELETE SET NULL`; partial index `idx_competitive_qr_subtopic_id` (only for non-NULL rows)
- `get_student_weak_subtopics(student_id, subject_id, limit)` — returns subtopics with < 60% accuracy over ≥ 3 questions (companion to `get_student_weak_topics`)
- `admin_get_subtopic_performance(subject_id)` — admin analytics returning accuracy + attempt counts per subtopic from the last 30 days of `practice_answers`

Already integrated into: `01_base_schema.sql` (`competitive_question_results.subtopic_id`), `04d_analytics_ai_functions.sql` (both functions)

Verify:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'competitive_question_results' AND column_name = 'subtopic_id') AS cqr_subtopic_id,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_student_weak_subtopics') AS weak_fn,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'admin_get_subtopic_performance') AS admin_fn;
-- Expected: all true
```

---

### Migration 48 — Fix: `auto_select_questions_for_exam` signature (`48_exam_function_fixes.sql`)
**Applied:** April 2026
**Purpose:** Client always sent 4 params (`p_exam_id`, `p_distribution`, `p_exam_stage`, `p_topic_config`) but the SQL function only accepted 3 — causing a 400 crash on every Auto-Select call. Also fixed `p_exam_stage` being accepted but silently ignored in the WHERE clause.

What it implements:
- Adds `p_topic_config JSONB DEFAULT NULL` to function signature (clients can pass it without crashing)
- Adds `AND (p_exam_stage IS NULL OR q.exam_stage = p_exam_stage OR q.exam_stage IS NULL)` to WHERE

Already integrated into: `04c_question_exam_functions.sql`

---

### Migration 49 — Fix: `search_questions` missing `subtopic_id`/`subtopic_name` (`49_fix_search_questions_subtopic.sql`)
**Applied:** April 2026
**Purpose:** `search_questions` RPC never returned `subtopic_id` or `subtopic_name`, so client-side subtopic filtering in the admin questions page always produced an empty list (`q.subtopic_id` was `undefined` on every row despite the column existing in the DB and data being stored correctly by `bulk_insert_questions`). Also activated `p_exam_stage` filtering which was previously accepted but unused.

What it implements:
- Adds `subtopic_id UUID` and `subtopic_name TEXT` to `RETURNS TABLE` and `SELECT` (via `LEFT JOIN subject_subtopics`)
- Enables `p_exam_stage` WHERE clause filter

Already integrated into: `04c_question_exam_functions.sql`

---

### Migration 50 — Enhancement: `auto_select_questions_for_exam` full topic weighting (`50_enhance_autoselect_topic_weighting.sql`)
**Applied:** April 2026
**Purpose:** Implements the topic weighting logic that the AutoSelectModal UI was already collecting but the SQL body was completely ignoring. Functions built on top of hotfix 48.

What it implements:
- **Exclude topics:** `AND NOT (q.topic = ANY(v_exclude_topics))` — questions from excluded topics are never selected
- **Prioritize topics:** two-pass selection — fill from prioritized topics first, then backfill from remaining topics to reach target count
- **Max per topic cap:** `ROW_NUMBER() OVER (PARTITION BY q.topic ORDER BY RANDOM()) <= v_max_per_topic` — prevents any single topic from dominating selection via window function (works without iterating topics)
- All three features are null-safe — if `p_topic_config` is NULL or a key is absent, selection falls back to simple random

---

### Migration 51 — Fix: `bulk_insert_questions` accepts `p_filename` parameter (`51_fix_bulk_insert_filename.sql`)
**Applied:** April 2026
**Purpose:** The function hard-coded `'Bulk Import'` as the filename in `question_imports`. Import history panel always showed "Bulk Import" for every entry. Client-side UPDATE workaround was silently blocked by RLS (anon key cannot UPDATE `question_imports`).

What it changes:
- Adds `p_filename TEXT DEFAULT 'Bulk Import'` as 4th parameter to `bulk_insert_questions`
- `INSERT INTO question_imports` now uses `COALESCE(NULLIF(TRIM(p_filename), ''), 'Bulk Import')` — actual filename stored; empty/null falls back to default
- Client passes `p_filename` directly in the RPC call (SECURITY DEFINER context bypasses RLS)
- Removes the broken post-RPC client UPDATE on `question_imports`

Already integrated into: `04c_question_exam_functions.sql`

---

### Migration 52 — Fix: Enable RLS on waitlist internal tables (`52_fix_waitlist_rls.sql`)
**Applied:** April 2026
**Purpose:** `waitlist_rate_limits` and `waitlist_email_queue` were created in hotfix 40 without `ENABLE ROW LEVEL SECURITY`, triggering Supabase security linter `rls_disabled_in_public` ERROR on any DB that ran hotfixes 39–40. The live DB wasn't affected because RLS was already enabled there by a different path.

Root cause:
- `40_waitlist_security_improvements.sql` created both tables (`waitlist_rate_limits`, `waitlist_email_queue`) but omitted `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Both tables are internal: all reads/writes go through SECURITY DEFINER functions that bypass RLS — so enabling RLS has zero functional impact

What it changes:
- `ALTER TABLE waitlist_rate_limits ENABLE ROW LEVEL SECURITY` — no user policies needed
- `ALTER TABLE waitlist_email_queue ENABLE ROW LEVEL SECURITY` — no user policies needed

Also integrated into: `03_rls_policies.sql` (clean migration) — added the complete waitlist RLS section including `waitlist_subscribers` policies that were previously only in hotfix 39

---

### Migration 53 — Fix: `question_groups` schema mismatch (`53_fix_question_groups_schema.sql`)
**Applied:** April 2026
**Purpose:** The `question_groups` table had a placeholder schema that didn't match the TypeScript service (missing `subject_id`, `topic`, `context_text`, `context_image_url`, etc.), causing 400 errors on group upload.

What it changes:
- Aligns `question_groups` table schema with the codebase expectations

Already integrated into: `01_base_schema.sql`

---

### Migration 54 — Fix: Auto-select excludes `written_open` questions (`54_autoselect_exclude_written_open.sql`)
**Applied:** April 2026
**Purpose:** `auto_select_questions_for_exam()` was deleting ALL questions (including manually-added written_open groups) on each run, and written_open sub-questions were individually eligible for auto-selection.

What it changes:
- Adds `question_type` filter to all SELECT paths in auto-select
- Preserves manually-added written_open groups on re-run

Already integrated into: `04c_question_exam_functions.sql`

---

### Migration 55 — Feature: `p_question_types` parameter for auto-select (`55_autoselect_question_types.sql`)
**Applied:** April 2026
**Purpose:** Allows auto-selecting MCQ and/or Short Answer (`codable_open`) questions via `p_question_types TEXT[] DEFAULT ARRAY['mcq']`. Written open (essay) groups are always excluded.

What it changes:
- Adds `p_question_types` parameter to `auto_select_questions_for_exam`
- Selects only specified types; deletes only those types from exam (preserves written_open)

Already integrated into: `04c_question_exam_functions.sql`

---

### Migration 56 — Fix: `get_mock_exam_details` missing fields (`56_fix_get_mock_exam_details.sql`)
**Applied:** April 2026
**Purpose:** Missing `question_type`, `group_id`, `group_order`, `context_text` fields prevented admin panel from identifying written_open groups.

What it changes:
- Adds the missing columns to the function's return set

Already integrated into: `04c_question_exam_functions.sql`

---

### Migration 57 — Schema: `exam_answers` missing columns (`57_exam_answers_missing_columns.sql`)
**Applied:** April 2026
**Purpose:** Adds `image_url`, `ai_score`, `final_score`, `ai_explanation` columns needed for AI grading of written_open answers.

What it changes:
- `ALTER TABLE exam_answers ADD COLUMN` for each of the four columns

Already integrated into: `01_base_schema.sql`

---

### Migration 58 — Fix: `update_student_score` needs SECURITY DEFINER (`58_fix_update_student_score_rls.sql`)
**Applied:** April 2026
**Purpose:** Students table RLS prevented authenticated users from modifying scoring columns, causing error 42501 on `update_student_score`.

What it changes:
- Adds `SECURITY DEFINER` to `update_student_score()`

Already integrated into: `04_functions_triggers.sql`

---

### Migration 59 — Security: `update_student_score` ownership check + leaderboard fix (`59_fix_update_student_score_security.sql`)
**Applied:** April 2026
**Purpose:** Three problems — no ownership check on SECURITY DEFINER function, old `update_leaderboard_score_after_exam` missing columns, double ELO update race.

What it changes:
- Adds `auth.uid()` ownership check to `update_student_score`
- Fixes `update_leaderboard_score_after_exam` return columns
- Prevents double ELO update via trigger dedup

Already integrated into: `04_functions_triggers.sql`

---

### Migration 60 — Fix: Analytics functions need SECURITY DEFINER + timezone (`60_fix_analytics_rls_security_definer.sql`)
**Applied:** April 2026
**Purpose:** `update_student_streak_cache()`, `trigger_update_streak_function()`, `update_daily_stats()` all blocked by RLS. Also fixed timezone from 'Africa/Cairo' to 'Asia/Baku'.

Already integrated into: `04_functions_triggers.sql`

---

### Migration 61 — Fix: S10.2 streak RPCs need SECURITY DEFINER (`61_fix_streak_rpc_security_definer.sql`)
**Applied:** April 2026
**Purpose:** `update_streak_on_activity()`, `use_streak_freeze()`, `recover_streak()` update students table without SECURITY DEFINER (42501 error). Adds anti-spoofing check.

Already integrated into: `04_functions_triggers.sql`

---

### Migration 62 — Schema: Add `was_skipped` to `student_answers` (`62_add_was_skipped_to_student_answers.sql`)
**Applied:** April 2026
**Purpose:** Skipped questions had no `student_answers` row, so adaptive selection treated them as "never seen" — same questions reappeared. Now the app inserts a row with `is_correct=false, was_skipped=true`.

What it changes:
- `ALTER TABLE student_answers ADD COLUMN was_skipped BOOLEAN DEFAULT FALSE`

Already integrated into: `01_base_schema.sql`

---

### Migration 63 — Fix: Streak double-write race condition (`63_fix_streak_double_write.sql`)
**Applied:** April 2026
**Purpose:** Two competing paths (trigger chain vs RPC) both write `students.current_streak`, causing visible streak drops on second activity of the day.

Already integrated into: `04_functions_triggers.sql`

---

### Migration 64 — Fix: `activity_date` → `date` column in streak function (`64_fix_streak_activity_date_column.sql`)
**Applied:** April 2026
**Purpose:** Hotfix 63 referenced `daily_stats.activity_date` which doesn't exist — the actual column is `daily_stats.date`.

Already integrated into: `04_functions_triggers.sql`

---

### Migration 65 — Feature: `question_feedback` table + admin RPCs (`65_question_feedback_and_rpc_fix.sql`)
**Applied:** April 2026
**Purpose:** Fix `admin_get_content_quality_issues` overload ambiguity. Create `question_feedback` table for student-reported question issues. Create `admin_get_question_feedback_summary()` and `admin_update_question_feedback()` RPCs.

What it changes:
- Drops the ambiguous `p_threshold` overload of `admin_get_content_quality_issues`
- Creates `question_feedback` table (if not exists)
- Creates admin feedback RPCs

Already integrated into: `01_base_schema.sql` (table), `03_rls_policies.sql` (RLS), `04b_admin_functions.sql` (RPCs — superseded by grouped versions from hotfixes 69-70)

---

### Migration 66 — Fix: `admin_get_question_performance` real skip rate + date filter (`66_fix_question_performance_rpc.sql`)
**Applied:** April 2026
**Purpose:** Skip rate was hardcoded as 0, date range params had no effect, `p_needs_review` filter was declared but unused.

Already integrated into: `04d_analytics_ai_functions.sql`

---

### Migration 67 — Feature: Feedback UNIQUE constraint + `admin_get_student_list` RPC (`67_feedback_security_and_student_list_rpc.sql`)
**Applied:** April 2026
**Purpose:** Adds `UNIQUE(user_id, question_id)` to `question_feedback` to prevent duplicate reports. Creates `admin_get_student_list` RPC for efficient student list fetching.

Already integrated into: `01_base_schema.sql` (UNIQUE constraint), `04b_admin_functions.sql` (RPC)

---

### Migration 68 — Fix: `admin_get_student_list` profiles join (`68_fix_student_list_profiles_join.sql`)
**Applied:** April 2026
**Purpose:** Profiles table uses `id` as PK (not `user_id`). Fixed join to `p.id = s.user_id`.

Already integrated into: `04b_admin_functions.sql`

---

### Migration 69 — Feature: Grouped question feedback RPCs (`69_grouped_feedback_rpc.sql`)
**Applied:** April 2026
**Purpose:** `admin_get_question_feedback_grouped()` returns one row per `(question_id, feedback_type)` with aggregated reporters array. `admin_update_feedback_group()` updates all rows in a group atomically.

What it changes:
- Creates `admin_get_question_feedback_grouped()` with `GROUP BY`, `json_agg` reporters, `bool_or` worst-case status
- Creates `admin_update_feedback_group(UUID, TEXT, TEXT, TEXT)`

Already integrated into: `04b_admin_functions.sql`

---

### Migration 70 — Fix: UUID `MIN()` not supported in grouped feedback RPC (`70_fix_grouped_feedback_rpc.sql`)
**Applied:** April 2026
**Purpose:** PostgreSQL has no built-in `MIN()` aggregate for UUID type. Replaces `MIN(qf.id)` with `(array_agg(qf.id ORDER BY qf.created_at))[1]`.

Already integrated into: `04b_admin_functions.sql`

---

## 11. Maintenance Notes

### Adding New SQL Changes
After this migration is deployed, any new SQL changes should:
1. Be created as individual migration files in the appropriate stage folder
2. Also be integrated into the relevant consolidated file here
3. Update this document's file inventory

**Hotfix file location rule:** New hotfixes for the live DB go in `initial_data/` numbered sequentially (currently up to `111`). The root `clean_migration/` folder contains only the consolidated main migration files for fresh DB deployments. Never put hotfixes in the root folder.

Current latest live hotfix awaiting owner application when needed:

- `initial_data/104_analytics_timing_authority.sql` - adds the ownership-checked online practice answer/timing upsert RPC, student timing-performance RPC, and admin analytics replacements that read canonical `student_answers`. Back-ported into `04_functions_triggers.sql`, `04b_admin_functions.sql`, and `04d_analytics_ai_functions.sql`.
- `initial_data/105_analytics_timing_localization_and_buckets.sql` - updates the student timing-performance RPC with localized subject names and explicit difficulty-adjusted timing metadata. Back-ported into `04_functions_triggers.sql`.
- `initial_data/106_notification_delete_and_booking_state_guards.sql` - allows users to delete their own in-app notifications, adds explicit teacher verification status for pending/rejected certificates, and blocks unsafe authenticated-client booking/payment state transitions. Back-ported into `01_base_schema.sql`, `03_rls_policies.sql`, `04b_admin_functions.sql`, and `04_functions_triggers.sql`.
- `initial_data/107_teacher_subscription_student_counts.sql` - introduces the canonical `teacher_subscriptions` table, `teachers.current_students`, RLS/read policies, indexes, count refresh functions/triggers, and admin teacher search/detail count semantics so teacher student counts come from recurring teacher subscriptions instead of one-off bookings or assigned-teacher helper rows. Back-ported into `01_base_schema.sql`, `02_indexes.sql`, `03_rls_policies.sql`, `04_functions_triggers.sql`, and `04b_admin_functions.sql`.
- `initial_data/108_teacher_subscription_billing_and_certificate_storage.sql` - adds reusable per-teacher Stripe subscription catalog identifiers, recurring invoice payment/refund accounting functions, and repairs the private `certificates` bucket plus teacher/admin access policies. Back-ported into `01_base_schema.sql`, `02_indexes.sql`, `04_functions_triggers.sql`, and `06_storage_buckets.sql`.
- `initial_data/109_teacher_verification_certificate_contract.sql` - makes teacher verification explicitly dependent on certificate evidence, adds an admin certificate-update RPC that resets marketplace verification to pending/not submitted after certificate changes, and preserves an admin-only disapprove path. Back-ported into `04b_admin_functions.sql`.
- `initial_data/110_teacher_subscription_public_config.sql` - exposes only the non-sensitive teacher-subscription feature gate and billing currency through an authenticated public-config RPC, fixing the mobile monthly-package gate without exposing private Stripe or commission settings. Back-ported into `04b_admin_functions.sql` and `05_default_data.sql`.
- `initial_data/111_teacher_subscription_management.sql` - adds owner-scoped student subscription and teacher subscriber management RPCs with profile, billing status, amount, and period metadata. Back-ported into `04_functions_triggers.sql`.

### Backup Before Migration
Always take a full database backup before running these scripts on any existing database:
- Supabase Dashboard → Settings → Database → Backups → Create backup

### Environment Variables Required
The applications need these environment variables to connect:

| Variable | Used By | Description |
|----------|---------|-------------|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | All apps | Project URL |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All apps | Anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin panel | Service role key (server-side only) |
| `DEEPSEEK_API_KEY` | Admin panel, Edge Functions | For AI prompt testing + AI edge functions |
| `STRIPE_SECRET_KEY` | Edge Functions | Stripe PaymentIntent creation (`create-payment`) |
| `STRIPE_WEBHOOK_SECRET` | Edge Functions | Stripe webhook signature verification (`stripe-webhook`) |
| `SMTP_HOST` | Admin panel | Brevo SMTP host (`smtp-relay.brevo.com`) |
| `SMTP_PORT` | Admin panel | Brevo SMTP port (`587`) |
| `SMTP_USER` | Admin panel | Brevo SMTP login (e.g., `a1e0e7001@smtp-brevo.com`) |
| `SMTP_PASS` | Admin panel | Brevo SMTP key for notification emails |
| `SMTP_FROM_EMAIL` | Admin panel | Verified sender email in Brevo |
| `SMTP_FROM_NAME` | Admin panel | Sender display name (e.g., `Elmly Analytics`) |

---

## 11. Audit Summary

| Category | Status | Details |
|----------|--------|---------|
| Mobile app tables | ✅ Complete | All tables from S3-S10.3 |
| Admin panel tables | ✅ Complete | All tables from Admin S1-S10 |
| Mobile functions | ✅ Complete | 50+ functions in `04_functions_triggers.sql` |
| Admin functions (core) | ✅ Complete | 40+ functions in `04b_admin_functions.sql` |
| Admin functions (questions/exams) | ✅ Complete | ~30 functions in `04c_question_exam_functions.sql` |
| Admin functions (analytics/AI/config) | ✅ Complete | ~30 functions in `04d_analytics_ai_functions.sql` |
| Admin functions (notifications/leaderboard/reports) | ✅ Complete | ~30 functions in `04e_notification_leaderboard_functions.sql` |
| Role hierarchy | ✅ Complete | `get_role_level`, `can_manage_role`, triggers |
| Moderator RLS | ✅ Complete | Read-only for moderators on 6 tables |
| Security vuln fixes | ✅ Complete | All 22 fixes in `08_security_hardening.sql` |
| Indexes | ✅ Complete | 140+ indexes |
| RLS policies | ✅ Complete | 130+ policies |
| Seed data | ✅ Complete | Settings, flags, templates, tips, AI config |
| Storage buckets | ✅ Complete | `question-images`, `exam-answers`, `avatars`, `certificates` |
| Realtime | ✅ Complete | `messages`, `conversations`, `notifications` |
| Elmly-Auth SQL | ✅ N/A | No SQL files (uses Supabase client) |
| elmly-webapp SQL | ✅ N/A | No SQL files (uses Supabase client) |
