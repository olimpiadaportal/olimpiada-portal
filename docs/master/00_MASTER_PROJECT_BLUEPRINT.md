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

### Core Product Model (Canonical)

- **Parent-only registration.** Only parents self-register with email/password through Supabase Auth, and only parents pay. Children never self-register and never purchase.
- **Parent-created children.** A parent creates each child profile from the parent dashboard through a multi-step "Add child" flow (child info → a separate subject-selection step with a live pricing preview → parent-set password → payment/activation). Parent-created children are auto-linked to the parent; no separate manual linking step is the primary flow.
- **Child login by 8-digit ID.** Each child logs in with a unique **8-digit numeric ID + a parent-created password** — never email, never a self-chosen account.
- **Child-based (per-child) subscriptions.** Subscriptions are per child and per subject. A parent selects one, several or all subjects per child; pricing is subject-count based across weekly/monthly/yearly durations.
- **Subjects (exactly four for MVP).** `Math`, `Science`, `Məntiq`, `İngilis dili`.
- **Public marketing website.** A public site (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register) exists before login and exposes no private student data.
- **News.** General news is published by Admins and shown both publicly and in-app; images live in Supabase Storage.
- **Olimpiada Hazırlığı / Olympiad Preparation.** A SEPARATE paid add-on module of package purchases (distinct from regular subscriptions). Purchased olympiad packages grant **lifetime access** and are never deleted.
- **Child dashboard wallpaper.** Each child may pick a dashboard background from a PREDEFINED set of wallpapers/solid backgrounds (not full theming).
- **Sibling discount.** Automatic, fixed subscription discount: 1st child 0%, 2nd child 15%, 3rd+ child 20%.
- **Launch promo + ongoing trial.** A launch promotion makes roughly the first month free; after the promo, new paid child subscriptions receive a 7-day trial before billing.
- **Real online payment.** Activation is driven by real online payment (Stripe-first, provider-abstracted) and is backend/webhook-verified only — never activated from the client.

## Business Goals

| Goal | Implementation meaning |
|---|---|
| Improve olympiad preparation quality | Provide grade/subject/topic-aligned questions, explanations, tests, daily tasks and mistake review. |
| Build recurring revenue | Use child-based, subject-priced weekly/monthly/yearly subscription plans with real online card payment and subscription-gated access. |
| Add olympiad upsell revenue | Sell a separate paid Olympiad Preparation module of package purchases with lifetime access, independent of subscriptions. |
| Maximize family conversion | Use a launch one-month promo, an ongoing 7-day trial and an automatic sibling discount (2nd child 15%, 3rd+ 20%) to drive multi-child sign-ups. |
| Support parent trust | Provide parent dashboards, per-child status, weekly/monthly reports, activity tracking and payment history; parents create and control all child accounts. |
| Attract via public site | Provide a public marketing website and public/in-app News to acquire and inform families before login. |
| Reduce admin workload | Build a strong admin panel and limited Content Manager workflow for content creation and review. |
| Prepare for growth | Design for multilingual content, future Flutter mobile app, schools/partners and optional Redis caching. |

## Current Scope

Current implementation covers:

1. Public marketing website (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register) exposing no private student data.
2. Parent/Child (Student) Web App: parent-only registration, parent-created children, multi-step add-child flow, child login by 8-digit ID + parent-set password, child dashboard with predefined wallpaper customization.
3. Admin Panel for Administrator and Teacher/Content Manager users, including News management and Olympiad Preparation package management for Admins only.
4. Child-based (per-child, subject-priced) subscriptions with launch one-month promo, ongoing 7-day trial and automatic sibling discount, plus the separate paid Olympiad Preparation module with lifetime access for purchasers.
5. Shared Supabase backend, database, auth, storage, Edge Functions and SQL planning.
6. PostgreSQL schema planning, RLS, RBAC, audit logging, real online payments (Stripe-first, webhook-verified), notifications without SMS, progress, leaderboard and analytics.

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
- Licensed international olympiad question bank integration.
- Full child theming or arbitrary colors (only a predefined wallpaper/background set is in scope).
- A "Discount Settings" admin module (the sibling discount is a fixed business rule, not configurable).

> Note: The public marketing website is now IN scope (see Current Scope). It is no longer excluded.

Future readiness may be documented, but these must not be built in the first Web App/Admin Panel MVP.

## User Types

| User type | Current or future | Registers / logs in how | Access area | Summary |
|---|---|---|---|---|
| Parent | Current | Self-registers with email/password (Supabase Auth); only user type that pays | Web App | Creates and controls child accounts, selects per-child subjects, pays subscriptions and olympiad packages, tracks progress, manages payments. |
| Child / Student | Current | Created by a parent; logs in with a unique **8-digit numeric ID + parent-set password** (NEVER email, NEVER self-registers) | Web App | Solves tasks/tests, tracks own progress, accesses olympiad preparation content the parent purchased, customizes dashboard wallpaper; cannot buy anything. |
| Administrator | Current | Provisioned account | Admin Panel | Full platform control, users, content, News, Olympiad packages, payments/subscriptions monitoring, reports, settings, audit. |
| Teacher / Content Manager | Current limited admin role | Provisioned account | Admin Panel | Creates and edits assigned regular educational content, submits for approval, views limited educational analytics. Does NOT manage News, Olympiad packages or any business/payment module. |
| School / Partner | Future-only | n/a | Future partner dashboard | School-level ownership, reporting and partner permissions later. |

## Current Applications

- `web-app/`: Public marketing website plus Parent and Child (Student) Next.js web application. Parents register and pay; children log in with a 8-digit ID + parent-set password.
- `admin-panel/`: Administrator and Content Manager-facing Next.js admin application, including Admin-only News and Olympiad Preparation package management.
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

MVP means a working Azerbaijani-language, mobile-browser-friendly public website, Web App and Admin Panel where:

- A public marketing website (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register) is reachable before login and exposes no private student data.
- Only parents register/login through email/password and Supabase Auth. Children never self-register.
- A parent creates each child via a multi-step add-child flow: child info, then a separate subject-selection step (Math/Science/Məntiq/İngilis dili) with a live pricing preview, then a parent-set password, then payment/activation. On success the system assigns a unique server-generated 8-digit numeric ID.
- Each child logs in with their 8-digit ID + parent-set password, solves daily tasks and tests, sees immediate results and explanations, accesses purchased olympiad preparation content and may pick a dashboard wallpaper from a predefined set. Each test attempt is a server-side random selection of 25 questions from the pool; users never choose difficulty.
- Subscriptions are child-based and subject-priced, with a launch one-month promo, an ongoing 7-day trial and an automatic sibling discount (2nd child 15%, 3rd+ 20%). A failed charge auto-blocks all paid child access.
- Parents view per-child status (8-digit ID, subjects, subscription/payment/access status), reports and payment history, and can buy separate Olympiad Preparation packages (lifetime access). Parent-created children are auto-linked to the parent.
- Admins can manage users, taxonomy, content, daily tasks, tests, subscriptions, payments, coupons, notifications, News and Olympiad Preparation packages, and view payment/account monitoring and reports.
- Content Managers can create/edit assigned regular educational content and submit it for approval without broad admin access; they do NOT manage News, Olympiad packages or any payment module.
- Payments are real online payments (Stripe-first card flow) with webhook-verified subscription/package activation only — never client-side activation.
- RLS, RBAC and audit logging protect the system.
- Leaderboard works PostgreSQL-first and is Redis-ready.

## Key Product Modules

1. Public marketing website (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register).
2. Parent authentication (parent-only email/password registration) and parent dashboard.
3. Child accounts: parent-created child profiles, server-generated 8-digit unique IDs, child login by 8-digit ID + parent-set password, child dashboard with predefined wallpaper customization.
4. RBAC, RLS and audit logging.
5. Academic taxonomy: grades, the four subjects (Math, Science, Məntiq, İngilis dili), topics, subtopics, difficulty (auto-mixed, never user-selected) and olympiad types.
6. Question bank and content review workflow.
7. Daily task engine.
8. Test/exam engine with server-side random 25-question selection and automatic grading.
9. Child-based subject subscriptions: subject pricing, weekly/monthly/yearly duration, launch promo, 7-day trial, sibling discount, access blocking on failed charge.
10. Olympiad Preparation module: separate paid packages, question pools, random 25-question attempts, lifetime access, package history and archive-on-expiry for listings only.
11. News (public + in-app, Admin-only CRUD, images in Storage).
12. Progress, reports and analytics.
13. Leaderboard and anti-manipulation.
14. Real online payments (Stripe-first), checkout sessions, webhook-verified activation and payment events.
15. Notifications without SMS.
16. Support requests and admin reports.
17. Future mobile/school/partner readiness.

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
11. **Parent-only registration.** Only parents self-register (email/password). Children are created by parents and never self-register.
12. **Child login by 8-digit ID.** Children log in with a server-generated unique 8-digit numeric ID + a parent-set password, never email. The 8-digit ID is generated server-side, collision-safe, zero-padded and uniquely constrained.
13. **Child-based subscriptions.** Subscriptions are per child and per subject (not a single parent-level paid account). Pricing is subject-count based across weekly/monthly/yearly durations.
14. **Launch promo + ongoing trial.** A launch promotion makes roughly the first month free; afterwards, new paid child subscriptions get a 7-day trial. A failed charge after trial/renewal auto-blocks all paid child access.
15. **Sibling discount is fixed.** Automatic subscription discount of 0% / 15% / 20% for 1st / 2nd / 3rd+ child, computed backend-side. There is NO "Discount Settings" admin module.
16. **Olympiad Preparation is a separate paid module.** Package purchases are independent of subscriptions; purchased packages grant lifetime access, are never deleted, and only their listings archive after the olympiad/end date.
17. **Public marketing website and News are in scope.** News is Admin-only CRUD, shown publicly and in-app.
18. **Child wallpaper customization is in scope** but limited to a predefined wallpaper/background set (no full theming, no arbitrary colors).
19. **Real online payment is required.** No manual admin approval activates paid access; activation is backend/webhook-verified only. The client can never override price, discount, selected subjects, trial dates, subscription status or access flags.
20. **Domain not confirmed.** No final domain is chosen; no domain purchase or email-domain configuration happens in this phase.


## Success Criteria

- A visitor can browse the public marketing website and News before logging in.
- A parent can register, create one or more children, select per-child subjects with a live pricing preview, set a child password, pay and have access activated through the verified webhook flow.
- Each child can log in with their 8-digit ID + parent-set password, solve tasks/tests (server-side random 25-question selection), see results and customize their dashboard wallpaper without technical friction.
- Parent-created children are auto-linked; the parent can monitor every child's status, subjects and payment history.
- Sibling discount, launch promo and 7-day trial apply correctly and are computed backend-side; a failed charge auto-blocks paid child access.
- Olympiad Preparation packages can be purchased separately and grant lifetime access; expired packages archive for listing only and stay accessible to purchasers.
- Admin can manage content, daily tasks, News and Olympiad packages safely.
- Content Manager can create regular educational content without sensitive admin access and without touching News, Olympiad or payment modules.
- Payment success activates the correct child subscription or olympiad package through the verified webhook flow.
- RLS prevents cross-user data leakage; a child can read only its own profile/content and cannot purchase or edit payment/subscription data.
- Audit logs record sensitive admin actions.
- Leaderboard is fair, explainable and not easy to manipulate.
- Web App works well on desktop, tablet and mobile browsers.

## Open Questions and Assumptions

| Topic | Assumption | Needs confirmation |
|---|---|---|
| Payment | Stripe-first for current implementation | Confirm Stripe availability/legal fit for Azerbaijan business setup. |
| Email | Brevo or equivalent | Confirm transactional email provider (sender domain deferred — see Domain). |
| Subscription ownership | Confirmed: child-based subscriptions, paid only by the parent; children never pay | Settled — kept here only as a record of the decision. |
| Subject pricing | Placeholder pricing of 1 AZN per subject (1/2/3/4 subjects → 1/2/3/4 AZN) across weekly/monthly/yearly; all-4 "full package" option | Confirm final price points and durations; pricing is configurable later. |
| All-subjects bundle | A discounted "full package" for all 4 subjects is a placeholder | Confirm whether/what discount the bundle carries. |
| Proration / add subjects later | Parents may add subjects to an existing child subscription; proration/upgrade rule is backend-controlled | Decide the exact proration/upgrade rule (and whether it is MVP or a later backend service). |
| Domain | No final domain chosen; no domain purchase or email-domain config this phase | A future phase picks one domain for site + corporate email. |
| Content volume | Initial platform can start with smaller curated seed content, not 5,000-10,000 on day one | Confirm launch content minimum. |
| Admin account bootstrap | First admin manually created in Supabase or secure seed | Confirm operational process. |
| 8-digit ID capacity | 8-digit numeric space is finite; MVP uses 8 digits with monitoring | Plan a future migration path if the namespace approaches capacity. |
| Redis | Not included by default | Re-evaluate after leaderboard load testing. |
