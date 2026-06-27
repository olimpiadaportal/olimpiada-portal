# Web App Backend Contract


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code, frontend developer, backend integrator
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Scope controlled by this file: Backend/service expectations for Web App
- Source-of-truth level: Derived app-specific contract


## Supabase Tables Web App Depends On

- `profiles`, `students`, `parents`, `parent_student_links`
- `grades`, `subjects`, `topics`, `subtopics`
- `questions`, `question_translations`, `answer_options`, `question_explanations`
- `tests`, `test_questions`, `test_attempts`, `test_attempt_answers`
- `daily_task_packages`, `daily_task_items`, `student_daily_task_progress`
- `progress_snapshots`, `leaderboard_entries`
- `subscription_plans`, `subscriptions`, `payments`, `coupons`
- `notifications`, `support_requests`

## Required Service Functions

| Service function | Purpose |
|---|---|
| `getCurrentProfile()` | Resolve auth user and profile/roles |
| `completeStudentOnboarding(input)` | Save grade/preferences |
| `linkParentToStudent(code)` | Create verified relationship |
| `getStudentDashboard()` | Summary cards |
| `getTodayDailyTask()` | Fetch current task package |
| `submitDailyTask(input)` | Authoritative grading |
| `listAvailableTests(filters)` | Published tests with gating |
| `startTestAttempt(testId)` | Create attempt |
| `submitTestAttempt(input)` | Grade and finalize |
| `getAttemptResult(attemptId)` | Result/explanations |
| `getProgressSummary(studentId, period)` | Progress dashboard |
| `getLeaderboard(scope)` | Rankings |
| `createCheckoutSession(planId, studentId)` | Stripe checkout |
| `getNotifications()` | Notification list |
| `createSupportRequest(input)` | Support ticket |

## Auth/Session Assumptions

Use Supabase session. Never trust role from client alone; service layer verifies database roles.

## Parent/Student Linking Requirements

Parent can read student data only through active link. All parent dashboard calls must include a server-side link assertion.

## Subscription-Gated Access

Gated features must call subscription checks server-side. Client UI can show disabled state but cannot be authoritative.

## Test Attempt Data Flow

1. Start attempt server-side.
2. Fetch question payload without hidden correct answers.
3. Submit answers.
4. Server grades.
5. Result view fetches explanations/correct answers after finalization.

## Error Handling

Use typed errors: `UNAUTHORIZED`, `FORBIDDEN`, `SUBSCRIPTION_REQUIRED`, `NOT_FOUND`, `VALIDATION_ERROR`, `ATTEMPT_EXPIRED`, `PAYMENT_PENDING`.
