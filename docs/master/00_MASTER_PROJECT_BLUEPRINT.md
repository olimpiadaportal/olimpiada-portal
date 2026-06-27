# 00 Master Project Blueprint


## Repository Placement and Related Files

- Intended path: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- Folder: `docs/master/`
- Primary readers: Claude Code, senior software architect, product owner, backend lead, frontend lead, QA lead, DevOps lead
- Related master docs: This is the top-level master document. It is depended on by all other master and derived docs.
- Scope controlled by this file: Whole project scope, source-of-truth architecture and execution decisions
- Source-of-truth level: Highest-level source of truth


## Product Vision

Olimpiada Hazırlıq Portalı is a subscription-based educational platform for Azerbaijani students in grades 1-11 preparing for local and international olympiads and educational competitions. The platform must support structured daily practice, topic-based and olympiad-style tests, immediate results, explanations, progress tracking, parent visibility, leaderboard motivation, subscription access and admin-controlled content operations.

The platform is not a simple quiz website. It is a future-ready education operating system with strong content governance, secure child data handling, role-based access control, audit logging, payment safety, analytics and scalable infrastructure.

## Business Goals

| Goal | Implementation meaning |
|---|---|
| Improve olympiad preparation quality | Provide grade/subject/topic-aligned questions, explanations, tests, daily tasks and mistake review. |
| Build recurring revenue | Use weekly, monthly and yearly subscription plans with card payment and subscription-gated access. |
| Support parent trust | Provide parent dashboards, weekly/monthly reports, activity tracking and payment history. |
| Reduce admin workload | Build a strong admin panel and limited Content Manager workflow for content creation and review. |
| Prepare for growth | Design for multilingual content, future Flutter mobile app, schools/partners and optional Redis caching. |

## Current Scope

Current implementation covers:

1. Student/Parent Web App.
2. Admin Panel for Administrator and Teacher/Content Manager users.
3. Shared Supabase backend, database, auth, storage, Edge Functions and SQL planning.
4. PostgreSQL schema planning, RLS, RBAC, audit logging, payments, notifications without SMS, progress, leaderboard and analytics.

## Out of Scope for Current Implementation

- Current mobile app implementation.
- SMS OTP or SMS notifications.
- Optional bank transfer payment implementation.
- Video lessons and live lessons.
- AI recommendation system.
- WhatsApp/Telegram bots.
- School corporate panel implementation.
- Teacher classroom management system.
- CRM integration.
- Marketing website.
- Licensed international olympiad question bank integration.

Future readiness may be documented, but these must not be built in the first Web App/Admin Panel MVP.

## User Types

| User type | Current or future | Access area | Summary |
|---|---|---|---|
| Student | Current | Web App | Solves tasks/tests, tracks progress, sees leaderboard and subscription status. |
| Parent | Current | Web App | Links one or more students, tracks progress, manages subscription and payments. |
| Administrator | Current | Admin Panel | Full platform control, users, content, payments, reports, settings, audit. |
| Teacher / Content Manager | Current limited admin role | Admin Panel | Creates and edits assigned content, submits for approval, views limited educational analytics. |
| School / Partner | Future-only | Future partner dashboard | School-level ownership, reporting and partner permissions later. |

## Current Applications

- `web-app/`: Student and Parent-facing Next.js web application.
- `admin-panel/`: Administrator and Content Manager-facing Next.js admin application.
- `supabase/`: Shared backend, database, storage, auth, SQL planning and policies.

## Future Applications

- `mobile-app/`: Future Flutter app using the same Supabase backend. It is not part of the current implementation.
- Future school/partner dashboards may reuse shared backend and RBAC patterns but must not be built now.

## Approved Root Project Structure


```text
olimpiada-portal/
│
├── docs/
│   ├── master/
│   │   ├── 00_MASTER_PROJECT_BLUEPRINT.md
│   │   ├── 01_REQUIREMENTS_AND_SCOPE_MAPPING.md
│   │   ├── 02_ARCHITECTURE_DATABASE_AND_BACKEND.md
│   │   ├── 03_AUTH_RBAC_SECURITY_AND_AUDIT.md
│   │   ├── 04_WEB_APP_PLAN_STUDENT_PARENT.md
│   │   ├── 05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md
│   │   ├── 06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md
│   │   └── 07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md
│   │
│   └── decisions/
│       └── future architecture decisions, scope confirmations, investor/client decisions
│
├── supabase/
│   ├── markdowns/
│   │   ├── SUPABASE_IMPLEMENTATION_CONTEXT.md
│   │   ├── SUPABASE_SCHEMA_SECURITY_PLAN.md
│   │   └── SUPABASE_SQL_RUN_ORDER.md
│   │
│   ├── sql/
│   │   ├── 001_extensions_and_enums.sql
│   │   ├── 002_core_profiles_roles_permissions.sql
│   │   ├── 003_academic_taxonomy.sql
│   │   ├── 004_content_questions_tests.sql
│   │   ├── 005_attempts_daily_tasks_progress.sql
│   │   ├── 006_leaderboards_analytics.sql
│   │   ├── 007_subscriptions_payments_coupons.sql
│   │   ├── 008_notifications_support_audit.sql
│   │   ├── 009_storage_buckets_policies.sql
│   │   ├── 010_rls_policies.sql
│   │   ├── 011_indexes_constraints_functions_triggers.sql
│   │   ├── 012_seed_initial_data.sql
│   │   └── 013_validation_queries.sql
│   │
│   └── README_RUN_ORDER.md
│
├── web-app/
│   ├── markdowns/
│   │   ├── WEB_APP_IMPLEMENTATION_CONTEXT.md
│   │   ├── WEB_APP_ROUTES_AND_COMPONENTS.md
│   │   ├── WEB_APP_BACKEND_CONTRACT.md
│   │   └── WEB_APP_CLAUDE_CODE_RULES.md
│   │
│   └── actual Next.js Web App files will be created later
│
├── admin-panel/
│   ├── markdowns/
│   │   ├── ADMIN_PANEL_IMPLEMENTATION_CONTEXT.md
│   │   ├── ADMIN_PANEL_ROUTES_AND_MODULES.md
│   │   ├── ADMIN_PANEL_RBAC_AND_SECURITY.md
│   │   ├── ADMIN_PANEL_CONTENT_MANAGEMENT.md
│   │   └── ADMIN_PANEL_CLAUDE_CODE_RULES.md
│   │
│   └── actual Next.js Admin Panel files will be created later
│
└── mobile-app/
    ├── markdowns/
    │   └── FUTURE_MOBILE_READINESS.md
    │
    └── future Flutter app files will be created later
```


## Documentation Source-of-Truth Hierarchy

1. `docs/master/` is the highest-level source of truth.
2. `supabase/markdowns/` is derived backend/database implementation context.
3. `web-app/markdowns/` is derived Web App execution context.
4. `admin-panel/markdowns/` is derived Admin Panel execution context.
5. `mobile-app/markdowns/` is future-only readiness context.
6. `supabase/sql/` is where SQL scripts will be created later, in numeric run order.

The package uses 8 master files instead of 20+ master files because the master docs should stay readable, cross-linked and authoritative. More fragmented master docs create contradictions for AI coding agents. App-specific files are derived execution guides, not competing source-of-truth documents.

## MVP Definition

MVP means a working Azerbaijani-language, mobile-browser-friendly Web App and Admin Panel where:

- Students and parents can register/login through email/password and Supabase Auth.
- Students can select grade/subjects, solve daily tasks and tests, submit answers, see immediate results and explanations.
- Parents can link children, view progress/reports and manage subscriptions.
- Admins can manage users, taxonomy, content, daily tasks, tests, subscriptions, payments, coupons, notifications and reports.
- Content Managers can create/edit assigned content and submit it for approval without broad admin access.
- Payments are implemented with Stripe-first card flow and webhook-safe subscription activation.
- RLS, RBAC and audit logging protect the system.
- Leaderboard works PostgreSQL-first and is Redis-ready.

## Key Product Modules

1. Authentication and profile onboarding.
2. RBAC, RLS and audit logging.
3. Academic taxonomy: grades, subjects, topics, subtopics, difficulty and olympiad types.
4. Question bank and content review workflow.
5. Daily task engine.
6. Test/exam engine and automatic grading.
7. Progress, reports and analytics.
8. Leaderboard and anti-manipulation.
9. Subscriptions, Stripe payments, coupons and payment events.
10. Notifications without SMS.
11. Support requests and admin reports.
12. Future mobile/school/partner readiness.

## Stack Summary

| Layer | Approved direction |
|---|---|
| Web App | Next.js, separate `web-app/` folder |
| Admin Panel | Next.js, separate `admin-panel/` folder |
| Hosting | Vercel |
| Backend/API | Supabase, Supabase Edge Functions and/or Next.js server-side service layer |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Storage | Supabase Storage |
| Email | Brevo or suitable alternative |
| Payment | Stripe-first card payment architecture; local providers only future placeholders |
| Redis | PostgreSQL-first MVP; Redis-ready architecture; optional only after decision gate |
| Mobile future | Flutter using shared backend |

## Architecture Principles

- Keep business logic in service layers, Edge Functions or server-side code, not in UI components.
- Use typed contracts and validation schemas.
- Design Web App and Admin Panel as separate apps sharing a backend.
- Keep Supabase SQL scripts in root-level `supabase/sql/` only.
- Treat PostgreSQL as source of truth.
- Make expensive analytics and leaderboard calculations snapshot-based where possible.
- Use feature flags for risky rollout.

## Security Principles

- Enforce permissions server-side and with RLS; never rely on UI hiding alone.
- Never expose Supabase service role key to client applications.
- Never trust client-submitted role, payment or ownership fields.
- Audit all admin-sensitive actions.
- Protect student data and parent/student relationships.
- Verify Stripe webhooks and use idempotency.
- Use least privilege for Content Managers.
- Store optional phone numbers only as profile data; do not depend on phone/SMS verification.

## Scalability Principles

- PostgreSQL-first schema with correct indexes and snapshot tables.
- Redis-ready service interface for leaderboard, analytics and rate limiting, but Redis must not be required for correctness.
- Use Supabase Storage for media; avoid separate S3/Spaces in MVP unless later justified.
- Prepare multilingual content tables early to avoid rewrites.
- Prepare school/district relationships early without implementing partner dashboards.

## Backend-First, Component-Ready Frontend Principle

The first frontend version must be clean, simple, responsive, accessible and functional. Final UI polish can be applied later through design tokens, layouts and reusable components. Do not mix business logic deeply into UI components.


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


## Success Criteria

- Student can register, solve tasks/tests and see results without technical friction.
- Parent can link and monitor one or more students.
- Admin can manage content and daily tasks safely.
- Content Manager can create educational content without sensitive admin access.
- Payment success activates subscription correctly through verified webhook flow.
- RLS prevents cross-user data leakage.
- Audit logs record sensitive admin actions.
- Leaderboard is fair, explainable and not easy to manipulate.
- Web App works well on desktop, tablet and mobile browsers.

## Open Questions and Assumptions

| Topic | Assumption | Needs confirmation |
|---|---|---|
| Payment | Stripe-first for current implementation | Confirm Stripe availability/legal fit for Azerbaijan business setup. |
| Email | Brevo or equivalent | Confirm sender domain and transactional email provider. |
| Subscription ownership | Parent usually pays, student sees status | Confirm whether student accounts may pay directly. |
| Content volume | Initial platform can start with smaller curated seed content, not 5,000-10,000 on day one | Confirm launch content minimum. |
| Admin account bootstrap | First admin manually created in Supabase or secure seed | Confirm operational process. |
| Redis | Not included by default | Re-evaluate after leaderboard load testing. |
