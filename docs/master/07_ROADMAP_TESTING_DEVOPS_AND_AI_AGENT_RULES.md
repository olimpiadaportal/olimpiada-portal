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
- Confirm roles and Content Manager boundary.
- Confirm content taxonomy.
- Confirm backend-first, simple UI approach.
- Confirm root project structure and separate Web App/Admin Panel folders.
- Confirm shared Supabase backend.
- Confirm PostgreSQL-first leaderboard and Redis-ready design.
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

### Phase 2 — Core Content System

- Grades, subjects, topics, subtopics.
- Difficulty levels, question types, olympiad types.
- Questions, answer options, explanations.
- Draft/review/approve/publish workflow.
- Content Manager limited access.
- Media upload basics.
- Multilingual content readiness.

### Phase 3 — Test and Daily Task Engine

- Test creation and publishing.
- Test attempts and answer submission.
- Auto grading and result screen.
- Daily task packages and completion tracking.
- Mistakes list and retry rules.
- Timed tests and olympiad-style structure.

### Phase 4 — Student and Parent Dashboards

- Student dashboard.
- Parent dashboard.
- Parent/student linking.
- Progress statistics and reports.
- Notifications.
- Subscription status display.
- Responsive functional screens.

### Phase 5 — Payments and Subscription Control

- Subscription plans.
- Stripe checkout.
- Stripe webhooks.
- Payment records and idempotency.
- Subscription activation/expiration.
- Payment history.
- Admin payment monitoring.
- Coupon support if approved.
- Subscription-gated access and tests.

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
- E2E tests for student task/test flow, parent linking, payment checkout, admin content workflow.
- Security tests for RBAC/RLS and service-role isolation.
- Stripe webhook tests with duplicate/out-of-order events.
- Leaderboard tests for scoring and anti-manipulation.
- Redis tests only if Redis is implemented.
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
- Verify Stripe webhooks.
- Use idempotency for payment processing.
- Log admin-sensitive actions.
- Keep Content Manager permissions limited.
- Build frontend components to be restyled later.
- Do not implement SMS.
- Do not implement optional bank transfer.
- Do not implement current mobile app.
- Keep PostgreSQL as source of truth.
- Make Redis optional and service-layer-based.
- Document assumptions.
- Stop and ask when requirements conflict.

## Do Not Do

- Do not create a current Flutter/mobile implementation.
- Do not place Supabase SQL under `web-app/` or `admin-panel/`.
- Do not give Content Managers broad admin access.
- Do not expose correct answers before authorized result view.
- Do not activate subscriptions from client-side success redirects alone.
- Do not add SMS dependencies.
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
