# 07 Roadmap, Testing, DevOps and AI Agent Rules


## Repository Placement and Related Files

- Intended path: `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`
- Folder: `docs/master/`
- Primary readers: Project manager, QA lead, DevOps engineer, Claude Code, all implementers
- Related master docs: All previous master documents
- Scope controlled by this file: Execution roadmap, testing, DevOps, deployment and AI coding agent rules
- Source-of-truth level: Master source of truth for delivery execution


## How Claude Code Should Use This Package

### Web App work

Covers the public marketing site (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register), parent registration + parent-created child accounts + child 8-digit login, child-based subscriptions + subject pricing + launch promo + 7-day trial + sibling discount, the Olympiad Preparation purchase/attempt flows, and child wallpaper customization.

```text
docs/master/00_MASTER_PROJECT_BLUEPRINT.md
docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md
docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md
docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md
docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md
docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md

web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md
web-app/markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md
web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md
web-app/markdowns/WEB_APP_CLAUDE_CODE_RULES.md
```

### Admin Panel work

Covers the Admin-only business modules — News management, Olympiad Preparation package management, Olympiad question pool / trial-test management, subscription/pricing-plan visibility and config, payment/subscription monitoring, and parent/child account monitoring (incl. child 8-digit IDs) — alongside the regular educational content workflow. Content Managers are limited to the educational content workflow only.

```text
docs/master/00_MASTER_PROJECT_BLUEPRINT.md
docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md
docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md
docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md
docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md
docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md

admin-panel/markdowns/ADMIN_PANEL_IMPLEMENTATION_CONTEXT.md
admin-panel/markdowns/ADMIN_PANEL_ROUTES_AND_MODULES.md
admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md
admin-panel/markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md
admin-panel/markdowns/ADMIN_PANEL_CLAUDE_CODE_RULES.md
```

### Supabase/database work

```text
docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md
docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md
docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md
docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md

supabase/markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md
supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md
supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md
supabase/README_RUN_ORDER.md
```

### Future mobile work

```text
docs/master/00_MASTER_PROJECT_BLUEPRINT.md
docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md
docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md
docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md

mobile-app/markdowns/FUTURE_MOBILE_READINESS.md
```

## 3-4 Month Roadmap

### Phase 0 — Final Clarification and Setup

- Confirm final scope.
- Confirm Stripe-first payment decision.
- Confirm no SMS.
- Confirm roles and Content Manager boundary, including that Content Managers cannot manage News, Olympiad packages, payments or subscriptions.
- Confirm content taxonomy and the MVP subjects (Math, Science, Məntiq, İngilis dili).
- Confirm backend-first, simple UI approach.
- Confirm root project structure and separate Web App/Admin Panel folders.
- Confirm shared Supabase backend.
- Confirm PostgreSQL-first leaderboard and Redis-ready design.
- Confirm product decisions from the canonical requirements: parent-only registration; parent-created children; child login via 8-digit ID + parent-created password; public marketing website in scope; News in scope; child wallpaper customization in scope; child-based (per-child) subscriptions; subject-based pricing; launch one-month promo + ongoing 7-day trial; real online payment required; Olympiad Preparation as a separate paid module with lifetime access to purchases; fixed sibling discount (2nd child 15%, 3rd+ child 20%) with no discount-settings admin module.
- Confirm the domain is not finalized: no domain purchase and no email-domain configuration in this phase.
- Create repo and folders.
- Configure Supabase, Vercel, local/staging/production environments.

### Phase 1 — Foundation

- Database schema planning and first SQL scripts.
- Supabase Auth configuration.
- Profiles, roles, permissions, RBAC.
- RLS policies.
- Web App and Admin Panel layouts.
- Service layer and typed validation setup.
- Audit logging foundation.
- Initial reusable UI components.
- Error handling and logging.

### Phase 1.5 — Public Marketing Site and News

- Public marketing website before login: Home, About, News list and article pages, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register.
- News module: Admin-only CRUD (title, body with inline links, image in Storage, auto created/updated dates, publish/active status); public News list and article pages plus in-app News visibility.
- Public pages never expose private student data; pricing page shows the general model and notes that final access depends on parent-selected subjects + plan duration.

### Phase 2 — Core Content System

- Grades, subjects (Math, Science, Məntiq, İngilis dili), topics, subtopics.
- Difficulty levels (data-model only, auto-mixed), question types, olympiad types.
- Questions, answer options, explanations.
- Draft/review/approve/publish workflow.
- Content Manager limited access (educational content/question workflow only; no News/Olympiad/payment modules).
- Media upload basics.
- Multilingual content readiness.

### Phase 3 — Test and Daily Task Engine

- Test creation and publishing.
- Test attempts and answer submission.
- Server-side random selection of 25 questions per attempt from the pool (new mix each attempt; never user-selected difficulty; use available questions if fewer than 25 exist).
- Auto grading and result screen.
- Daily task packages and completion tracking.
- Mistakes list and retry rules.
- Timed tests and olympiad-style structure.

### Phase 4 — Parent Registration, Child Accounts and Dashboards

- Parent registration (email/password); children are created by parents and never self-register.
- Parent "Add child" multi-step flow: child info; separate subject-selection page with live pricing preview; parent-set child password; then payment/subscription activation.
- Server-side, collision-safe unique 8-digit numeric child ID assigned on successful activation; child login by 8-digit ID + parent-created password (no email).
- Parent dashboard listing each child with 8-digit ID, selected subjects, subscription/payment status, and access status; children are auto-linked to the parent (no manual linking as the primary flow).
- Child dashboard with tests, progress, and olympiad-preparation access gated by the parent's active payments.
- Child wallpaper customization from a predefined catalog (wallpapers/solid backgrounds), saved per child profile, editable only from the child profile/settings page.
- Progress statistics and reports; notifications; subscription/access status display (locked/expired states).
- Responsive functional screens.

### Phase 5 — Payments, Subscriptions and Sibling Discount

- Child-based subscriptions: per child subjects, duration (weekly/monthly/yearly), payment status, access status.
- Subject-based pricing (placeholder, configurable later) shown by selected-subject count and duration.
- Launch promo (first ~1 month free) plus an ongoing 7-day trial for new paid child subscriptions after the promo.
- Automatic, server-side sibling discount (2nd child 15%, 3rd+ child 20%); shown at checkout/dashboard; no discount-settings admin module.
- Stripe checkout and Stripe webhooks; payment records and idempotency.
- Backend/webhook-verified subscription activation/expiration (never from client success redirects).
- Failed charge after trial/renewal automatically blocks all paid child access (tests, daily tasks, olympiad prep, paid content, paid-dependent progress, any subscription-gated feature).
- Payment history and Admin payment/subscription monitoring.
- Coupon support if approved.
- Subscription-gated access and tests.

### Phase 5.5 — Olympiad Preparation Module

- Admin-managed Olympiad Preparation packages: olympiad name, subject/domain, class/grade target (structured data field), short description, start date, olympiad/end date, price, status, question pool, optional banner image in Storage.
- Parent purchase flow (separate paid add-on; children access but cannot buy); two areas: Available Olympiads and My Olympiad Packages.
- Server-side random 25-question selection from the package pool (new mix per attempt).
- Lifecycle: active for new sales until the olympiad/end date, then auto-archive the listing; purchasers keep lifetime access and purchased packages/records are never deleted.
- Olympiad purchase history visible in the parent/child account and to Admin monitoring.

### Phase 6 — Leaderboard and Analytics

- Initial leaderboard.
- Ranking rules.
- Anti-manipulation rules.
- Admin analytics.
- Progress snapshots.
- High-error question analytics.
- PostgreSQL-first leaderboard.
- Redis decision gate and load review.

### Phase 7 — QA, Security and Deployment

- Functional testing.
- RBAC/RLS testing.
- Payment and webhook testing.
- Admin Panel testing.
- Security testing.
- Mobile browser testing.
- Performance testing.
- Production deployment.
- Monitoring, backup and rollback plan.

## UI Decision Gate

UI approval does not block backend development. Before final UI approval, build simple functional screens with reusable components and avoid hardcoded layouts. After final UI approval, update design tokens, icons, spacing, typography, cards and animations without rewriting core business logic.

## Redis Decision Gate

Evaluate active students, leaderboard query complexity, recalculation frequency, near-real-time requirements, cost, operational complexity and Supabase performance. If Redis is not implemented immediately, still keep a Redis-compatible `LeaderboardService`. If Redis is implemented, use it only as cache/performance layer, keep PostgreSQL source of truth and add fallback/tests.

## Testing Plan

- Unit tests for services, validators and scoring.
- Integration tests for Supabase queries, Edge Functions and RLS.
- E2E tests for student task/test flow, parent registration + child creation, payment checkout, admin content workflow.
- Security tests for RBAC/RLS and service-role isolation.
- Stripe webhook tests with duplicate/out-of-order events.
- Leaderboard tests for scoring and anti-manipulation.
- Redis tests only if Redis is implemented.
- Child auth tests: login with 8-digit ID + parent-created password; no email login for children.
- 8-digit ID tests: server-side generation, uniqueness/collision-safety (DB unique constraint), zero-padding, and capacity/monitoring note.
- Subscription gating tests: child-based access, trial/launch-promo windows, and failed-charge auto-block of all paid child access.
- Sibling discount calculation tests: 1st child 0%, 2nd 15%, 3rd+ 20%, computed server-side and not client-overridable.
- Olympiad tests: lifetime access for purchasers, listing auto-archive after the olympiad/end date, and that purchased records are never deleted.
- Random selection tests: server-side 25-question random mix per attempt, new mix each attempt, fewer-than-25 fallback, and absence of any user-selected difficulty.
- News tests: public vs in-app visibility, Admin-only CRUD, and Content Manager being forbidden from News.
- Parent RLS tests: parents can read/manage only their own children; children read only their own profile/content; children cannot purchase or edit payment/subscription data.
- Manual QA checklist for desktop/tablet/mobile browsers.

## DevOps and Deployment Plan

- Environments: local, staging, production.
- Separate env vars for each app and environment.
- Supabase project setup with backups.
- Vercel deployments for both apps.
- Database migrations via Supabase SQL scripts in numeric order.
- CI checks: typecheck, lint, unit tests, build.
- Error tracking and uptime monitoring.
- Stripe test/live separation.
- Email provider staging/production separation.
- Rollback plan for app deployments and database migrations.

## AI Coding Agent Rules

- Read correct master and app-specific docs before coding.
- Do not bypass RLS.
- Do not hardcode role checks only in UI.
- Enforce permissions server-side.
- Keep UI separate from business logic.
- Use typed validation schemas.
- Use clean service functions.
- Use migrations for database changes.
- Place SQL only under root `supabase/sql/`.
- Never expose Supabase service role key to client.
- Never trust client-submitted role/user/payment data.
- Only parents self-register (email/password); children are created by parents and never self-register.
- Children log in with a server-issued 8-digit numeric ID + parent-created password (no child email login).
- Generate the 8-digit child ID server-side, collision-safe, with a DB unique constraint; never trust a client-provided child ID.
- Children cannot purchase or initiate checkout; all payments happen from the parent account.
- Compute price, selected subjects, trial dates, subscription/access status, and the sibling discount server-side; the client can never override them.
- Use server-side random selection of 25 questions per attempt; never offer a user-selected difficulty.
- Archive (never delete) purchased Olympiad Preparation packages and purchase/access records; purchasers keep lifetime access; only soft-archive expired listings.
- Keep Content Managers out of News, Olympiad packages, the question pool, payments and subscriptions; CMs keep the regular educational content workflow only.
- Verify Stripe webhooks.
- Use idempotency for payment processing.
- Activate subscriptions only via backend/webhook verification; failed charges auto-block all paid child access.
- Log admin-sensitive actions.
- Keep Content Manager permissions limited.
- Build frontend components to be restyled later.
- Do not implement SMS.
- Do not implement optional bank transfer.
- Do not implement current mobile app.
- Do not add a "Discount Settings" admin module (sibling discount is a fixed business rule).
- Do not configure a domain or email domain in this phase (domain not finalized).
- Keep PostgreSQL as source of truth.
- Make Redis optional and service-layer-based.
- Document assumptions.
- Stop and ask when requirements conflict.

## Do Not Do

- Do not create a current Flutter/mobile implementation.
- Do not place Supabase SQL under `web-app/` or `admin-panel/`.
- Do not give Content Managers broad admin access.
- Do not let Content Managers manage News, Olympiad packages, the question pool, payments or subscriptions.
- Do not let children self-register or log in by email; children are parent-created and log in by 8-digit ID + parent password.
- Do not let children purchase or initiate checkout.
- Do not trust client-submitted price, discount, subjects, trial dates, subscription status or access flags.
- Do not offer a user-selected difficulty; use server-side random 25-question selection.
- Do not delete purchased Olympiad packages or purchase/access records; archive expired listings only and keep lifetime access.
- Do not add a "Discount Settings" admin module; the sibling discount is fixed in business logic.
- Do not expose correct answers before authorized result view.
- Do not activate subscriptions from client-side success redirects alone.
- Do not add SMS dependencies.
- Do not add optional bank transfer.
- Do not purchase or configure a domain/email domain in this phase.
- Do not make Redis required for correctness.
- Do not wait for final UI to build backend/security foundations.

## First Sprint Implementation Checklist

- Create approved folder structure.
- Add all markdown planning files.
- Configure environment variable templates.
- Create Supabase project and staging project decision.
- Draft SQL `001`-`003` first.
- Implement auth/profile/roles foundation.
- Implement minimal Web App and Admin Panel layouts.
- Implement permission helper functions.
- Add audit log table and helper.
- Add QA checklist for RLS.


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
