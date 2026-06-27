# Web App Implementation Context


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code, frontend developer, backend integrator
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Scope controlled by this file: Student/Parent Web App implementation context
- Source-of-truth level: Derived app-specific execution guide


## Web App Purpose

The Web App is for Parent and Child (Student) users, plus a public marketing site. It must not implement Admin Panel features.

## User Model

- **Parent**: the only self-registering user (email/password). Parents pay for everything.
- **Child / Student**: created by a parent; logs in with a **8-digit numeric unique ID + parent-created password** (no email). Children never purchase anything.
- **Public website**: marketing pages reachable before login.

## Access

- Public routes (no auth): `/`, `/about`, `/news`, `/news/[slug]`, `/pricing`, `/olympiad-preparation` (or `/olimpiada-hazirligi`), `/subjects`, `/faq`, `/contact`, `/login`, `/register`. `/register` is parent-only.
- Parent routes require parent role; all purchases/subjects/subscriptions/checkout live here.
- Child routes require child role, reached via `/student/login` (8-digit ID + password); never reachable: checkout/purchase routes.
- Shared authenticated routes may include notifications/support/profile.

## Master Docs to Read First

- `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`

## Major Flows

- Public marketing site (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register).
- Parent registration (email/password) and login.
- Add-child wizard: Step 1 child info → Step 2 subject selection on a SEPARATE page with live pricing preview → Step 3 parent sets child password → checkout → server assigns the unique 8-digit ID.
- Child login (8-digit ID + parent-created password) and child dashboard with predefined wallpaper customization.
- Child-based subscription checkout (subject-based pricing, automatic sibling discount, 7-day trial / launch promo).
- Daily tasks.
- Tests and results (difficulty auto-mixed; users never choose difficulty).
- Mistakes review.
- Progress dashboard.
- Parent reports for own children (auto-linked; no manual linking as the primary flow).
- Olympiad Preparation access: parent purchases packages (lifetime access); Available Olympiads vs My Olympiad Packages; attempts use 25 server-selected random questions.
- News (public + in-app, read-only in Web App).
- Notifications and support.

## Backend Dependency Summary

Depends on Supabase Auth (parent) + child credential strategy (8-digit ID + parent-set password), profiles, taxonomy (subjects: Math, Science, Məntiq, İngilis dili), per-child subject selections, content, attempts, daily tasks, progress, leaderboard, child-based subscriptions/trials, payments and checkout sessions, sibling-discount fields, news + news media, olympiad packages/pools/purchases/attempts, wallpapers catalog + per-child selection, notifications and support tables.

## Security Reminders

- Never trust client role.
- Never expose service role key.
- Correct answers shown only after valid result.
- Parent accesses/manages only their own children; children read only their own profile/content.
- Children never purchase; child sessions can never reach checkout or edit payment/subscription/access data.
- All pricing, sibling discount, trial dates, subscription/payment status, and access flags are server-side; never trust client subject/price/status.
- The 8-digit child ID is generated server-side, collision-safe, unique-constrained; never trust a client-provided ID.
- Subscription/olympiad gating and locked/expired states are enforced server-side; payment activation is webhook-verified only.

## Out of Scope

Admin features (incl. News/Olympiad/payment management), content management, payments monitoring, audit logs, system settings, SMS, optional bank transfer, and current mobile app. Children cannot self-register or purchase.
