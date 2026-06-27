# Web App Backend Contract


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code, frontend developer, backend integrator
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Scope controlled by this file: Backend/service expectations for Web App
- Source-of-truth level: Derived app-specific contract


## Supabase Tables Web App Depends On

- `profiles`, `parents`, `students` (children; created by a parent, hold the 8-digit unique ID), `parent_student_links` (auto-linked for parent-created children)
- `student_credentials` / child auth credential strategy (8-digit ID + parent-set password; document how child auth maps to Supabase Auth or a custom child-credential approach)
- `student_wallpapers` (per-child selection), `wallpapers_catalog` (predefined wallpapers/solid backgrounds)
- `grades`, `subjects` (MVP exactly: Math, Science, Məntiq, İngilis dili), `topics`, `subtopics`
- `child_subject_selections` (per-child selected subjects)
- `questions`, `question_translations`, `answer_options`, `question_explanations` (difficulty easy/medium/hard kept in data model, auto-mixed server-side)
- `tests`, `test_questions`, `test_attempts`, `test_attempt_answers`
- `daily_task_packages`, `daily_task_items`, `student_daily_task_progress`
- `progress_snapshots`, `leaderboard_entries`
- `subscription_plans`, `subscriptions` (child-based: subjects, duration, payment status, access status, trial start/end), `payments`, `checkout_sessions`, `coupons`
- `launch_promo_config`, sibling-discount calc/audit fields (fixed rule: 1st 0%, 2nd 15%, 3rd+ 20%)
- `news`, `news_media` (image metadata only; files in Storage)
- `olympiad_packages` (name, subject/domain, grade/class target field, description, start/end dates, price, status, optional banner), `olympiad_question_pools`, `olympiad_package_purchases` (lifetime access), `olympiad_package_attempts`, `olympiad_random_selections`
- `notifications`, `support_requests`

State notes:
- Children CANNOT purchase. The client can NEVER set or override price, discount, selected subjects, trial dates, subscription/payment status, or access flags.
- Subscriptions are child-based (per child). Sibling discount is computed backend-side and only applies to subscriptions (not olympiad purchases unless changed later).
- Olympiad packages are a separate paid add-on; purchases grant lifetime access and are never deleted (listings soft-archive after the end date).

## Required Service Functions

| Service function | Purpose |
|---|---|
| `getCurrentProfile()` | Resolve auth user and profile/roles |
| `registerParent(input)` | Parent self-registration (email/password); parent account is free |
| `loginParent(input)` | Parent email/password login |
| `createChild(input)` | Parent creates a child (info + selected subjects); server assigns 8-digit ID on activation |
| `setChildPassword(childId, input)` | Parent sets/updates the child's login password (never the child) |
| `loginChild(input)` | Child login by 8-digit ID + parent-created password (no email) |
| `getParentDashboard()` | Parent's children with 8-digit IDs, subscription/payment status, selected subjects, access status |
| `selectSubjects(childId, subjects)` | Set child's subjects at creation (server validates against MVP list, server prices) |
| `addSubjectsLater(childId, subjects)` | Add subjects to an existing child subscription (backend-priced; proration/upgrade backend-controlled) |
| `getSubscriptionPricingPreview(childId, subjects, duration)` | Server-computed live pricing preview for the subject picker (placeholder pricing, server is authoritative) |
| `createChildSubscriptionCheckout(input)` | Subject-based pricing + auto sibling discount + trial/launch-promo; server-priced, webhook-activated |
| `getChildDashboard()` | Child tests, progress, olympiad access, content per parent's active payments (locked/expired states) |
| `getWallpapers()` | List predefined wallpapers/solid backgrounds catalog |
| `setChildWallpaper(input)` | Save predefined wallpaper per child profile |
| `getTodayDailyTask()` | Fetch current task package |
| `submitDailyTask(input)` | Authoritative grading |
| `listAvailableTests(filters)` | Published tests with gating (no difficulty selection; auto-mixed) |
| `startTestAttempt(testId)` | Create attempt |
| `submitTestAttempt(input)` | Grade and finalize |
| `getAttemptResult(attemptId)` | Result/explanations |
| `getProgressSummary(studentId, period)` | Progress dashboard |
| `getLeaderboard(scope)` | Rankings |
| `listAvailableOlympiads(filters)` | Active olympiad packages for sale (Aktiv Olimpiadalar) |
| `purchaseOlympiadPackage(input)` | Parent-only olympiad package checkout; lifetime access on webhook confirmation |
| `getMyOlympiads()` | Purchased packages (Mənim Olimpiadalarım), incl. archived-but-accessible |
| `startOlympiadAttempt(packageId)` | Server selects 25 random questions from the pool (fewer if pool is smaller) |
| `listNews()` | Public + in-app general news list |
| `getNews(slug)` | News detail (title, body, image, dates) |
| `getNotifications()` | Notification list |
| `createSupportRequest(input)` | Support ticket |

Removed (no longer part of the model): student self-registration, student email login, student-driven onboarding, and student-initiated parent linking. Children are created and auto-linked by the parent; `completeStudentOnboarding` / `linkParentToStudent` are superseded by `createChild` + automatic linking.

## Auth/Session Assumptions

Use Supabase session for parents. Child auth uses the documented 8-digit ID + parent-set password strategy (mapped to Supabase Auth or a custom child-credential approach). Never trust role from client alone; service layer verifies database roles. The 8-digit ID is generated SERVER-SIDE only, collision-safe, zero-padded, with a DB unique constraint; never trust a client-provided child ID. (Capacity note: 8 digits is finite; MVP uses 8 digits, future migration may extend the format.)

## Parent/Child Relationship Requirements

Children are created by the parent and AUTO-LINKED (no separate manual linking step as the primary flow). Parent can read/manage only their own children; every parent dashboard call must include a server-side ownership assertion. Children read only their own profile/content and cannot purchase or edit any payment/subscription/access data.

## Subscription, Trial & Discount Rules (server-authoritative)

- Subscriptions are child-based: subjects, duration (weekly/monthly/yearly), payment status, access status, trial start/end.
- Parent account is free; child access is paid after trial/promo. Launch promo = first ~1 month free at platform launch; ongoing trial = 7 days for new paid child subscriptions.
- Subject-based pricing is server-computed (placeholder: 1 AZN per subject; all-4 "full package" option configurable later). Live pricing preview is informational only — the server reprices at checkout.
- Sibling discount is fixed and computed backend-side: 1st child 0%, 2nd child 15%, 3rd+ child 20% (subscriptions only). Never client-controlled; checkout/dashboard shows when it applied.
- Activation is webhook-verified ONLY (real online payment; no manual admin approval). If a charge fails after trial/renewal, automatically BLOCK all paid child access; the parent account stays accessible and the child dashboard shows locked/expired states.

## Olympiad Preparation Flow

1. `listAvailableOlympiads` returns active packages (publish/start date until end date); after the end date listings auto-archive for new sales.
2. Only the parent purchases; `purchaseOlympiadPackage` is webhook-confirmed and grants LIFETIME access. Purchased packages are never deleted and remain accessible after archive.
3. `startOlympiadAttempt` selects 25 random questions server-side from the pool (new random mix each attempt; if fewer than 25 exist, use available questions instead of failing). Users never pick difficulty.

## Subscription-Gated Access

Gated features must call subscription checks server-side. Client UI can show disabled/locked state but cannot be authoritative. The client can NEVER override price, discount, selected subjects, trial dates, subscription/payment status, or access flags.

## Test Attempt Data Flow

1. Start attempt server-side (server selects/orders questions; difficulty auto-mixed, never user-chosen).
2. Fetch question payload without hidden correct answers.
3. Submit answers.
4. Server grades.
5. Result view fetches explanations/correct answers after finalization.

## Error Handling

Use typed errors: `UNAUTHORIZED`, `FORBIDDEN`, `SUBSCRIPTION_REQUIRED`, `NOT_FOUND`, `VALIDATION_ERROR`, `ATTEMPT_EXPIRED`, `PAYMENT_PENDING`, `ACCESS_LOCKED` (failed charge / expired access), `CHILD_CANNOT_PURCHASE` (purchase attempted from a child session).
