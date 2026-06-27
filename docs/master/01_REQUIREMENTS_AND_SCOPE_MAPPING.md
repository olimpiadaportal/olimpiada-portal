# 01 Requirements and Scope Mapping


## Repository Placement and Related Files

- Intended path: `docs/master/01_REQUIREMENTS_AND_SCOPE_MAPPING.md`
- Folder: `docs/master/`
- Primary readers: Product analyst, solution architect, Claude Code, project manager, QA lead
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- Scope controlled by this file: Maps Azerbaijani Scope of Work and approved plan into MVP/future requirements
- Source-of-truth level: Master source of truth for scope interpretation


## Source Interpretation Rules

The Azerbaijani Scope of Work defines broad product ambitions: student, parent, admin, content manager and future school/partner roles; daily tasks, tests, progress analytics, ranking, subscription payments, multilingual readiness and notifications. The approved Technical & Commercial Plan gives the preferred stack: Supabase + Vercel, Next.js, Flutter later, Redis optional, and web MVP first.

When documents conflict, this plan chooses the safest current-MVP interpretation:

- SMS is excluded even if the documents mention SMS/OTP.
- Optional bank transfer is excluded.
- Mobile app implementation is future-only.
- Stripe-first card payment is used now, with abstraction for future local providers.
- Redis is optional and not required for correctness.
- Supabase + Vercel is the current infrastructure direction.

## Extracted Feature List from Scope of Work

| Area | Extracted requirement | Current interpretation | Priority |
|---|---|---|---|
| Student account | Registration/login, grade selection, subject selection | Email/password Supabase Auth, profile setup, grade/subject preferences | Must-have MVP |
| Daily practice | Daily tasks by grade and subject | Admin-created/scheduled daily task packages; student progress tracked | Must-have MVP |
| Tests/exams | Timed, topic-based, mixed, olympiad simulation | Build test engine with auto grading and result history | Must-have MVP |
| Results | Immediate results and explanations | Auto-grade objective types; show explanations after submission | Must-have MVP |
| Mistakes | Wrong answers list and retry | Mistakes review screen and retry policy | Must-have MVP |
| Progress | Daily/weekly/monthly performance | Snapshot tables and dashboard metrics | Must-have MVP |
| Parent | Link one or more students and track reports | Parent-student link table with verified relationship | Must-have MVP |
| Payments | Weekly/monthly/yearly subscription, payment history | Stripe-first card checkout, subscription records, webhook idempotency | Must-have MVP |
| Leaderboard | Grade, subject, school, rayon, country, period rankings | PostgreSQL snapshot leaderboard; full school/rayon/country readiness | MVP initial + later expansion |
| Notifications | In-app, email, SMS, WhatsApp/Telegram, push | Only in-app/email/admin alerts now; future push readiness | Must-have without SMS |
| Admin content | Manage grades, subjects, topics, questions, tests, tasks | Admin Panel modules with audit logging | Must-have MVP |
| Content manager | Create/edit content and submit for approval | Limited Admin Panel role, no sensitive access | Must-have MVP if team needs it |
| Multilingual | AZ first, RU/EN later | Data model ready; UI i18n-ready; AZ implementation first | MVP readiness + later content |
| School/partner | Future school/partner dashboard | Schema readiness only | Future-only |

## Student Requirements

| Source requirement | Current interpretation | Web App impact | Admin Panel impact | Backend/database impact | Security considerations | Priority |
|---|---|---|---|---|---|---|
| Qeydiyyat və giriş | Student uses Supabase Auth email/password; optional phone profile only | Register/login/profile screens | Admin can view/suspend users | `profiles`, `students`, `profile_roles` | No SMS OTP; RLS on own profile | Must-have |
| Sinif/fənn seçimi | Student profile stores grade and preferences | Onboarding and settings | Admin manages grade/subject taxonomy | `grades`, `subjects`, preference tables | Validate grade values | Must-have |
| Gündəlik tapşırıqlar | Student receives packages active for grade/subject/date | Daily task page, progress state | Admin schedules packages | `daily_task_packages`, `daily_task_items`, `student_daily_task_progress` | Subscription gating; attempt ownership | Must-have |
| Testlər və olimpiada sualları | Test engine with timed and topic modes | Test list, solver, results | Admin creates tests | `tests`, `test_questions`, `attempts`, `answers` | Prevent answer leakage before submission | Must-have |
| Nəticə/izah/səhvlər | Show score, explanations, wrong answer list | Result and mistakes screens | Admin can inspect aggregate errors | Attempt answer tables, explanations | Students only see own results | Must-have |
| Reytinq | Show student rank in permitted categories | Leaderboard page/card | Admin reviews suspicious activity | `leaderboard_entries`, snapshots | Avoid exposing child PII; anti-manipulation | MVP initial |
| Sertifikat/nailiyyət | Badges readiness | Badge placeholders | Admin config later | `achievements`, `student_achievements` | Avoid false official certification claims | Should-have/later |

## Parent Requirements

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| Parent registration/login | Supabase Auth parent role | Parent dashboard | Must-have |
| Add/link students | Verified code or admin-assisted linking | `parent_student_links` | Must-have |
| Track progress | Parent can read linked students only | RLS join-based access | Must-have |
| Reports | Weekly/monthly summaries | Snapshot/report service | Must-have basic; advanced later |
| Subscription/payment | Parent can select plan and pay | Stripe checkout + payment history | Must-have |
| Notifications | Email/in-app only | Preferences and deliveries | Must-have without SMS |

## Admin Requirements

Admin can manage the whole platform: users, content, taxonomy, daily tasks, tests, subscriptions, payments, coupons, analytics, support, audit logs, settings and feature flags. Every sensitive admin action must be audited. Admin-only access must not leak into Web App.

## Teacher / Content Manager Requirements

Content Manager may:

- Create new questions.
- Edit own draft questions.
- Add explanations.
- Create test packages if permission is granted.
- Prepare daily task packages if permission is granted.
- Submit content for approval.
- View limited subject-level analytics and high-error questions.

Content Manager must not access payments, subscriptions, full PII exports, audit logs, security settings, roles/permissions, feature flags, Stripe configuration, deployment settings or destructive platform-wide actions.

## Future School / Partner Requirements

Future-only readiness includes:

- `schools`, `districts`, optional student-school relationships.
- School/rayon/country leaderboard grouping.
- Future partner permissions and school-level reporting boundaries.
- No current partner dashboard implementation.

## MVP vs Later-Phase Classification

### Must-Have for MVP

- Student/Parent/Admin/Content Manager auth and RBAC.
- Grades, subjects, topics, subtopics.
- Question bank with review workflow.
- Daily task engine.
- Test engine with auto grading.
- Progress dashboard basic metrics.
- Parent-student linking.
- Stripe-first subscription and payments.
- In-app/email notifications.
- Initial leaderboard.
- Admin content management.
- Audit logging and RLS.

### Should-Have After MVP

- Advanced analytics and exports.
- Advanced leaderboard categories and anti-fraud dashboards.
- Achievement/certificate UI.
- Russian/English content expansion.
- Coupon automation and trial experiments.
- Redis if load tests justify it.

### Future-Only

- Mobile app implementation.
- School/partner dashboard.
- Video/live lesson modules.
- AI recommendation system.
- WhatsApp/Telegram bots.
- CRM integration.
- Teacher classroom management.
- Optional bank transfer.
- SMS.

## Explicit Exclusions

- SMS OTP, SMS notifications and SMS costs.
- Optional bank transfer implementation.
- Mobile app implementation in the current phase.
- Video lessons, live lessons, AI recommendations and bots.
- School corporate panel and teacher classroom management.
- CRM and marketing website.

## Ambiguities and Assumptions

| Ambiguity | Assumption for planning | Confirmation needed |
|---|---|---|
| Who pays for student subscriptions? | Parent can pay; student can view subscription status | Whether student self-payment is allowed |
| Initial content size | System supports large bank, launch can start curated | Exact first content upload count |
| Stripe vs local providers | Stripe-first now; local providers later via abstraction | Business/legal feasibility |
| Leaderboard categories | MVP starts grade/subject/time; school/rayon/country ready | Which categories must be public at launch |
| Content Manager scope | Limited content role, not full admin | Exact permissions per team member |


## Non-Negotiable Project Decisions

1. The current implementation scope is **Web App + Admin Panel + shared Supabase backend** only.
2. The **Mobile App is future-only**. Current work may only include backend/API readiness for future Flutter compatibility.
3. Web App and Admin Panel are separate Next.js applications under `web-app/` and `admin-panel/`.
4. Supabase is shared infrastructure under the root-level `supabase/` folder. SQL files must never be placed inside `web-app/` or `admin-panel/`.
5. Supabase PostgreSQL is the source of truth for content, users, subscriptions, attempts, progress, leaderboard and audit data.
6. Supabase Auth is used for authentication, with role and permission data enforced through PostgreSQL/RLS and server-side checks.
7. SMS is excluded from the current plan. No SMS OTP, no SMS notification channel, no SMS cost assumptions.
8. Payments are **Stripe-first card payments** with a provider abstraction for future local Azerbaijani providers. Optional bank transfer is excluded.
9. Redis is not required for correctness. The MVP should be PostgreSQL-first with a Redis-ready `LeaderboardService` abstraction.
10. UI approval is not a blocker. Build a clean, simple, responsive, accessible, component-ready frontend that can later be restyled.
