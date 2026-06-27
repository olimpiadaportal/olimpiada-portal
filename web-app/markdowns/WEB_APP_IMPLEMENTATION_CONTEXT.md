# Web App Implementation Context


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code, frontend developer, backend integrator
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Scope controlled by this file: Student/Parent Web App implementation context
- Source-of-truth level: Derived app-specific execution guide


## Web App Purpose

The Web App is for Student and Parent users only. It must not implement Admin Panel features.

## Access

- Student routes require student role.
- Parent routes require parent role.
- Shared authenticated routes may include notifications/support/profile.

## Master Docs to Read First

- `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`

## Major Flows

- Register/login.
- Student onboarding.
- Daily tasks.
- Tests and results.
- Mistakes review.
- Progress dashboard.
- Parent linking and reports.
- Subscription and payment.
- Notifications and support.

## Backend Dependency Summary

Depends on Supabase Auth, profiles, taxonomy, content, attempts, daily tasks, progress, leaderboard, subscriptions, payments, notifications and support tables.

## Security Reminders

- Never trust client role.
- Never expose service role key.
- Correct answers shown only after valid result.
- Parent must access linked students only.
- Subscription gating server-side.

## Out of Scope

Admin features, content management, payments monitoring, audit logs, system settings, SMS and current mobile app.
