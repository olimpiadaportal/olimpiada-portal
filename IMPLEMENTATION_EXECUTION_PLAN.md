# IMPLEMENTATION_EXECUTION_PLAN.md

## Repository Placement and Related Files

- Intended path: `IMPLEMENTATION_EXECUTION_PLAN.md`
- Folder: project root `olimpiada-portal/`
- Primary readers: project owner, Claude Code, backend developer, frontend developer, Supabase implementer, QA lead
- Depends on:
  - `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
  - `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
  - `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
  - `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
  - `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
  - `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
  - `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`
  - all app-specific `markdowns/` files
- Scope: unified implementation control plan for the whole repository
- Source-of-truth level: execution controller; it does not replace master docs, but tells agents which docs to read and in what order to build

## Why This File Exists

This repository intentionally contains multiple Markdown files because the project has separate domains: Supabase backend, Web App, Admin Panel, future Mobile readiness, security, payments, leaderboard, analytics, and DevOps.

A single giant planning file is easy to start with but becomes hard to maintain as the project grows. This file solves that by acting as the **implementation map**.

Use it like this:

1. Find the current stage.
2. Read only the docs listed for that stage.
3. Implement only the listed deliverables.
4. Update `STATUS.md`.
5. Move to the next stage only when the done criteria are met.

## Required Root Project Structure

```text
olimpiada-portal/
├── CLAUDE.md
├── IMPLEMENTATION_EXECUTION_PLAN.md
├── IMPLEMENTATION_PRIORITY_SUMMARY.md
├── STATUS.md
├── CODING_AGENT_PROMPTS.md
├── docs/
│   ├── master/
│   └── decisions/
├── supabase/
│   ├── CLAUDE.md
│   ├── README_RUN_ORDER.md
│   ├── markdowns/
│   └── sql/
│       ├── README_DATABASE_VERSIONING_WORKFLOW.md
│       ├── 001_extensions_and_enums.sql
│       ├── ...
│       ├── 013_validation_queries.sql
│       └── migrations/
│           └── README_MIGRATIONS.md
├── web-app/
│   ├── CLAUDE.md
│   └── markdowns/
├── admin-panel/
│   ├── CLAUDE.md
│   └── markdowns/
└── mobile-app/
    ├── CLAUDE.md
    └── markdowns/
```

## Mandatory Status Tracking

Before coding starts, create or open:

```text
STATUS.md
```

`STATUS.md` is the live project tracker. Claude Code must update it before and after every implementation task.

Minimum `STATUS.md` sections:

```markdown
# STATUS.md

## Current Stage

- Stage:
- Current task:
- Owner/agent:
- Started:
- Last updated:

## Current Implementation Plan

- Goal:
- Files expected to change:
- Docs read:
- Risks:

## Database Change Tracking

| Date | Change type | Migration file | Canonical root SQL file updated | Environment | Validation result | Backport status | Notes |
|---|---|---|---|---|---|---|---|

## Completed Work

| Date | Stage | Task | Files changed | Tests run | Notes |
|---|---|---|---|---|---|

## Open Blockers / Questions

| Blocker | Area | Needed decision |
|---|---|---|

## Next Recommended Task

- Next task:
- Docs to read:
- Expected output:
```

The v6 package includes a starter `STATUS.md` configured for the first coding session. If it is deleted or missing, recreate it before any coding.

## Mandatory Database Versioning Workflow

Database work follows a professional two-layer model:

1. Canonical root SQL files live directly in `supabase/sql/`. These files are the clean current database definition and must be able to rebuild the full database from zero.
2. Incremental migrations live in `supabase/sql/migrations/`. These files record hotfixes, production patches, new database logic, RLS fixes, indexes, and backfills after the canonical files already exist.

Rules:

- The repository is the source of truth, not the Supabase Dashboard.
- Supabase Dashboard SQL Editor may be used for development/staging, but every SQL change must be saved into the repository.
- Production changes must be migration-script controlled.
- Every accepted migration must be backported into the relevant canonical root SQL file.
- `STATUS.md` must record migration file name, backport status, validation result, and production status.
- Destructive SQL requires explicit human approval and rollback notes.

Read `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md` before any database work.

## How to Prompt Claude Code

Do not say: “Read all markdowns and build the project.” Use `CODING_AGENT_PROMPTS.md` for reusable Claude Code-only prompts.

Use focused prompts:

```text
Open STATUS.md and IMPLEMENTATION_EXECUTION_PLAN.md.
We are starting Stage 2: Supabase Foundation.
Read only the Stage 2 documents listed in IMPLEMENTATION_EXECUTION_PLAN.md.
Then create supabase/sql/001_extensions_and_enums.sql.
Do not create unrelated files.
Update STATUS.md before and after the work.
```

For Admin Panel:

```text
Open STATUS.md and IMPLEMENTATION_EXECUTION_PLAN.md.
We are starting Stage 5: Admin Content Taxonomy.
Read the Stage 5 documents only.
Implement the admin taxonomy CRUD foundation for grades, subjects, topics, and subtopics.
Do not implement payments or student dashboard.
Update STATUS.md before and after the work.
```

For Web App:

```text
Open STATUS.md and IMPLEMENTATION_EXECUTION_PLAN.md.
We are starting Stage 8: Student Web App Core Flows.
Read the Stage 8 documents only.
Implement the student dashboard shell and auth-protected routing.
Do not implement Admin Panel features.
Update STATUS.md before and after the work.
```

---

# Stage 0 — Final Human Confirmation

## Goal

Confirm all project decisions before coding starts.

## Read These Files

- `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- `docs/master/01_REQUIREMENTS_AND_SCOPE_MAPPING.md`
- `IMPLEMENTATION_PRIORITY_SUMMARY.md`

## Confirmed Decisions

- Current build includes Web App, Admin Panel, shared Supabase backend.
- Mobile app is future-only.
- SMS is excluded.
- Optional bank transfer is excluded.
- Stripe-first card payment architecture is used for planning, with future local provider abstraction.
- Supabase is used for Auth, PostgreSQL, Storage, RLS, and Edge Functions where needed.
- Supabase Storage stores actual images/audio/media.
- PostgreSQL stores metadata and object paths only, not file binaries.
- Redis is optional and never source of truth.
- UI does not block backend development.
- Admin Panel and Web App are separate application folders.

## Deliverables

- Human decision confirmation.
- Any changed assumptions written in `docs/decisions/`.

## Done When

- No core architecture conflict remains.
- `STATUS.md` says Stage 0 is complete.

---

# Stage 1 — Repository Setup and Tracking

## Goal

Create the repo skeleton and tracking system so future agents do not lose context.

## Read These Files

- `CLAUDE.md`
- `IMPLEMENTATION_EXECUTION_PLAN.md`
- `STATUS.md`
- `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`

## Work Areas

- project root
- `docs/`
- `supabase/`
- `web-app/`
- `admin-panel/`
- `mobile-app/`

## Deliverables

- Root folder structure exists.
- `STATUS.md` exists and is updated.
- `CLAUDE.md` files exist at:
  - `CLAUDE.md`
  - `supabase/CLAUDE.md`
  - `web-app/CLAUDE.md`
  - `admin-panel/CLAUDE.md`
  - `mobile-app/CLAUDE.md`
- Empty implementation folders are ready.
- No app code is created yet unless explicitly requested.

## Done When

- Claude Code can open root `CLAUDE.md`, root `STATUS.md`, and this file.
- Project structure matches the approved package.

---

# Stage 2 — Supabase SQL Planning and Foundation

## Goal

Create the Supabase SQL foundation in the correct run order.

## Read These Files

- `supabase/CLAUDE.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `supabase/README_RUN_ORDER.md`
- `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- `supabase/sql/migrations/README_MIGRATIONS.md`
- `supabase/markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md`
- `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
- `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`

## Work Areas

- `supabase/sql/` canonical root SQL files
- `supabase/sql/migrations/` incremental migration files for hotfixes/new changes
- `supabase/markdowns/`
- Supabase dashboard / SQL editor for development and staging, with every SQL change copied back into repository files

## Build Order

1. `001_extensions_and_enums.sql`
2. `002_core_profiles_roles_permissions.sql`
3. `003_academic_taxonomy.sql`
4. `004_content_questions_tests.sql`
5. `005_attempts_daily_tasks_progress.sql`
6. `006_leaderboards_analytics.sql`
7. `007_subscriptions_payments_coupons.sql`
8. `008_notifications_support_audit.sql`
9. `009_storage_buckets_policies.sql`
10. `010_rls_policies.sql`
11. `011_indexes_constraints_functions_triggers.sql`
12. `012_seed_initial_data.sql`
13. `013_validation_queries.sql`

## Deliverables

- Canonical root SQL files created in numeric order.
- `supabase/sql/migrations/` exists for incremental changes after canonical files exist.
- No SQL files inside `web-app/` or `admin-panel/`.
- Tables, enums, constraints, policies, indexes, triggers, seed data, and validation queries are separated by responsibility.
- RLS strategy is prepared before client apps rely on data.
- Any dashboard-applied SQL is saved into the repository.
- Any incremental migration is backported into the relevant canonical root SQL file.

## Done When

- Schema runs successfully in a development Supabase project.
- Validation queries pass.
- `STATUS.md` lists all SQL files completed or pending.
- `STATUS.md` records whether each database change is canonical-only, migration-only pending backport, or migration backported.
- New environments can be rebuilt from the canonical root SQL files.

---

# Stage 3 — Auth, Profiles, Roles, Permissions, RLS

## Goal

Make identity and authorization correct before building feature UI.

## Read These Files

- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
- `admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`
- `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`

## Work Areas

- `supabase/sql/002_core_profiles_roles_permissions.sql`
- `supabase/sql/010_rls_policies.sql`
- `supabase/sql/013_validation_queries.sql`
- future shared auth helpers in `web-app/` and `admin-panel/`

## Deliverables

- Profiles table.
- Student/parent/admin/content manager roles.
- Permission model.
- Parent-student link model.
- Account statuses.
- RLS policies for core ownership rules.
- Audit logging foundation for sensitive actions.

## Done When

- Student cannot access another student’s data.
- Parent can access only linked student data.
- Content Manager cannot access payment, system settings, role management, or sensitive user exports.
- Admin-sensitive actions are auditable.

---

# Stage 4 — App Skeletons and Shared Frontend Foundation

## Goal

Create separate Next.js foundations for Web App and Admin Panel without overbuilding features.

## Read These Files

- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- `web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
- `admin-panel/markdowns/ADMIN_PANEL_IMPLEMENTATION_CONTEXT.md`

## Work Areas

- `web-app/`
- `admin-panel/`

## Deliverables

- Next.js skeleton for `web-app/`.
- Next.js skeleton for `admin-panel/`.
- Shared coding conventions where practical.
- Environment variable structure.
- Supabase browser/server clients without service role exposure.
- Basic layout, loading, error, and unauthorized states.

## Done When

- Both apps can run locally.
- Both apps can connect to Supabase development environment.
- No business feature is faked deeply into UI components.

---

# Stage 5 — Admin Panel Foundation and Content Taxonomy

## Goal

Build the Admin Panel first enough to create the content that the Web App will consume.

## Read These Files

- `admin-panel/CLAUDE.md`
- `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `admin-panel/markdowns/ADMIN_PANEL_IMPLEMENTATION_CONTEXT.md`
- `admin-panel/markdowns/ADMIN_PANEL_ROUTES_AND_MODULES.md`
- `admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`
- `admin-panel/markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md`

## Work Areas

- `admin-panel/`
- `supabase/sql/003_academic_taxonomy.sql`
- `supabase/sql/010_rls_policies.sql`

## Deliverables

- Admin login and protected admin layout.
- Permission-aware sidebar.
- Grades CRUD.
- Subjects CRUD.
- Topics/subtopics CRUD.
- Difficulty levels.
- Question types.
- Olympiad types.
- Content Manager restricted access.

## Done When

- Admin can manage taxonomy.
- Content Manager can only access permitted content areas.
- All sensitive routes are protected server-side.

---

# Stage 6 — Question Management and Media Uploads

## Goal

Create the question bank and content lifecycle.

## Read These Files

- `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `admin-panel/markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md`
- `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`

## Work Areas

- `admin-panel/`
- `supabase/sql/004_content_questions_tests.sql`
- `supabase/sql/009_storage_buckets_policies.sql`
- `supabase/sql/010_rls_policies.sql`

## Deliverables

- Question CRUD.
- Answer options.
- Explanations.
- Question translations readiness.
- Content lifecycle: draft, in_review, approved, published, archived, rejected.
- Supabase Storage upload for optimized images, avatars, and small audio files.
- PostgreSQL stores storage metadata and object paths only.
- Audit logs for question creation, edit, archive, publish/unpublish.

## Done When

- Admin can create and publish questions.
- Content Manager can create/edit own drafts and submit for approval.
- Media upload works without storing binary data in PostgreSQL.

---

# Stage 7 — Test and Daily Task Engine

## Goal

Build the business logic for tests, attempts, answer submission, grading, daily task packages, and progress inputs.

## Read These Files

- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- `admin-panel/markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md`
- `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`

## Work Areas

- `supabase/sql/004_content_questions_tests.sql`
- `supabase/sql/005_attempts_daily_tasks_progress.sql`
- `admin-panel/`
- `web-app/` later only after backend flows are stable

## Deliverables

- Test packages.
- Test questions.
- Test attempts.
- Test attempt answers.
- Daily task packages.
- Daily task items.
- Student daily task progress.
- Auto-grading for objective question types.
- Retry rules.
- Mistakes review data.
- Timed-test support.

## Done When

- Admin can create a test/daily task package.
- Student attempt data can be created and graded securely.
- Client cannot forge score or completion state.

---

# Stage 8 — Student Web App Core Flows

## Goal

Build the first real Student Web App experience using real backend data.

## Read These Files

- `web-app/CLAUDE.md`
- `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
- `web-app/markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md`
- `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`
- `web-app/markdowns/WEB_APP_CLAUDE_CODE_RULES.md`

## Work Areas

- `web-app/`

## Deliverables

- Student login/session handling.
- Student dashboard shell.
- Profile setup.
- Grade/subject/topic browsing.
- Daily task page.
- Test solving page.
- Result screen.
- Explanation display.
- Mistakes list.
- Subscription status display.
- Notifications UI shell.

## Done When

- Student can complete a real task/test flow using backend data.
- UI includes loading, empty, error, and unauthorized states.
- UI is clean but not overdesigned.

---

# Stage 9 — Parent Web App Core Flows

## Goal

Build parent monitoring and subscription-management views.

## Read These Files

- `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
- `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`

## Work Areas

- `web-app/`
- `supabase/sql/002_core_profiles_roles_permissions.sql`
- `supabase/sql/005_attempts_daily_tasks_progress.sql`

## Deliverables

- Parent dashboard.
- Link/add student profile flow.
- View one/multiple students.
- Student progress summary.
- Weekly/monthly report shell.
- Subject performance.
- Strong/weak topics.
- Payment history placeholder until payment module is complete.
- Parent notifications.

## Done When

- Parent can only access linked student data.
- Parent dashboard shows real backend data.
- Parent cannot alter student results or scores.

---

# Stage 10 — Subscription and Payment Architecture

## Goal

Implement subscription-gated access and Stripe-first payment workflow.

## Read These Files

- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`
- `admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`

## Work Areas

- `supabase/sql/007_subscriptions_payments_coupons.sql`
- `supabase/sql/010_rls_policies.sql`
- `web-app/`
- `admin-panel/`
- payment webhook functions/server routes

## Deliverables

- Subscription plans: weekly, monthly, yearly.
- Stripe-first checkout flow.
- Payment event table.
- Webhook verification.
- Idempotent payment event processing.
- Subscription activation/expiration.
- Subscription-gated access.
- Parent payment management.
- Admin payment monitoring.
- Coupon/promo support if included in MVP.

## Done When

- Payment success activates subscription correctly.
- Failed payment does not activate subscription.
- Webhook replay does not duplicate subscriptions.
- Client cannot fake payment/subscription status.

---

# Stage 11 — Progress, Analytics, Notifications

## Goal

Create reliable summaries for students, parents, admins, and notifications without expensive live queries.

## Read These Files

- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`

## Work Areas

- `supabase/sql/006_leaderboards_analytics.sql`
- `supabase/sql/008_notifications_support_audit.sql`
- `web-app/`
- `admin-panel/`

## Deliverables

- Progress snapshots.
- Subject/topic performance summaries.
- Strong/weak topic data.
- Admin analytics overview.
- High-error question analytics.
- In-app notifications.
- Email notification abstraction.
- Notification templates and delivery statuses.

## Done When

- Student/parent dashboards avoid expensive live aggregate queries.
- Admin analytics can identify hard questions and weak topics.
- Notifications can be created and marked as read.
- No SMS implementation exists.

---

# Stage 12 — Leaderboard

## Goal

Implement PostgreSQL-first leaderboard with Redis-ready service design.

## Read These Files

- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`

## Work Areas

- `supabase/sql/006_leaderboards_analytics.sql`
- service layer in Web App/Admin Panel as needed

## Deliverables

- Leaderboard periods.
- Leaderboard entries.
- Leaderboard snapshots.
- Grade/subject/school/rayon/country readiness.
- Weekly/monthly/yearly ranking readiness.
- Anti-manipulation rules.
- Admin review tools for suspicious activity.
- Redis-compatible interface, but no Redis required unless load testing justifies it.

## Done When

- Leaderboard can be recalculated from PostgreSQL source-of-truth data.
- Cached/snapshot data can be shown efficiently.
- Redis is optional, not required for correctness.

---

# Stage 13 — QA, Security Testing, Deployment

## Goal

Prepare for safe launch.

## Read These Files

- `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `supabase/README_RUN_ORDER.md`
- app-specific Claude/rules files

## Work Areas

- `supabase/`
- `web-app/`
- `admin-panel/`
- Vercel
- Supabase dashboard
- Stripe dashboard
- email provider dashboard

## Deliverables

- Unit tests.
- Integration tests.
- E2E tests for critical flows.
- RLS tests.
- RBAC tests.
- Payment webhook tests.
- Admin permission tests.
- Parent/student linking tests.
- Subscription-gating tests.
- Content workflow tests.
- Manual QA checklist.
- Production deployment checklist.
- Backup and rollback plan.

## Done When

- Critical user flows pass.
- Security-sensitive flows pass.
- Payment flow is tested in sandbox.
- Launch checklist is complete.

---

# Stage 14 — Future Mobile Readiness Only

## Goal

Keep the backend/API ready for future mobile, but do not build mobile now.

## Read These Files

- `mobile-app/CLAUDE.md`
- `mobile-app/markdowns/FUTURE_MOBILE_READINESS.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`

## Work Areas

- `mobile-app/markdowns/`
- backend contracts only if required

## Deliverables

- Future mobile readiness remains documented.
- No current mobile app source code.
- Framework decision can be updated later, including React Native if chosen.

## Done When

- No mobile implementation has been accidentally started.
- Backend contracts remain app-agnostic.

---

# Recommended First Three Sprints

## Sprint 1 — Foundation

Read:

- `CLAUDE.md`
- `IMPLEMENTATION_EXECUTION_PLAN.md`
- `STATUS.md`
- `supabase/CLAUDE.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`

Build:

- repo structure
- status tracking
- Supabase SQL files 001–003 draft
- auth/profile/role/permission schema
- initial RLS plan

## Sprint 2 — Admin Content Foundation

Read:

- `admin-panel/CLAUDE.md`
- `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- `admin-panel/markdowns/ADMIN_PANEL_ROUTES_AND_MODULES.md`
- `admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`

Build:

- admin-panel skeleton
- admin login/session
- permission-aware layout/sidebar
- grades/subjects/topics CRUD

## Sprint 3 — Question Bank Foundation

Read:

- `admin-panel/markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md`
- `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`

Build:

- question CRUD
- answer options
- explanations
- content statuses
- media upload through Supabase Storage
- audit logs for content actions

---

# Do Not Do List

- Do not start by building pretty dashboards with fake data.
- Do not build full Web App before Admin content/data foundation exists.
- Do not build mobile app now.
- Do not implement SMS.
- Do not implement optional bank transfer.
- Do not store files in PostgreSQL.
- Do not bypass RLS.
- Do not trust client-side payment, subscription, score, or role data.
- Do not give Content Managers broad admin access.
- Do not make Redis required for correctness.
- Do not move SQL scripts into app folders.
- Do not read every Markdown file for every small task.

# Final Build Strategy

The professional sequence is:

```text
Supabase foundation
→ Auth/RBAC/RLS
→ Admin Panel content foundation
→ Question bank
→ Test/daily task engine
→ Student Web App
→ Parent Web App
→ Payments/subscriptions
→ Progress/analytics
→ Leaderboard
→ Notifications
→ QA/security/deployment
→ Future mobile later
```

This prevents rework. The Web App should consume real content and real backend logic, not fake UI assumptions. The Admin Panel does not need to be visually perfect first, but it must exist early enough to create and manage the educational content that students will use.
