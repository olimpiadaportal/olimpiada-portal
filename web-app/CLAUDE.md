# CLAUDE.md — Web App Instructions

## Scope

This file applies to work inside `web-app/`.

The Web App is only for:

- Students
- Parents

Do not implement Admin Panel features here.
Do not implement mobile app features here.

## First Steps

Before Web App work:

1. Open root `STATUS.md`.
2. Confirm the active stage is Web App related.
3. Read:
   - `../IMPLEMENTATION_EXECUTION_PLAN.md`
   - `../docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
   - `../docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
   - `../docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
   - `../docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
   - `../docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
   - `markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
   - `markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md`
   - `markdowns/WEB_APP_BACKEND_CONTRACT.md`
   - `markdowns/WEB_APP_CLAUDE_CODE_RULES.md`

## Web App Rules

- Build clean, simple, responsive, component-ready UI.
- Keep business logic out of visual components.
- Use typed service functions or server actions for backend interaction.
- Do not trust client-side role, score, subscription, or payment state.
- Enforce authorization server-side and with Supabase RLS.
- Show loading, error, empty, and unauthorized states.
- Keep UI easy to restyle after final design approval.

## Current Web App Build Order

1. Project skeleton and shared layout
2. Auth/session handling
3. Protected routing for Student and Parent
4. Student dashboard shell
5. Parent dashboard shell
6. Student daily task/test flows after backend engine exists
7. Parent reporting after progress data exists
8. Subscription screens after payment/subscription backend exists
9. Leaderboard/progress/notification UI after backend snapshots exist

## Status Update Requirement

After Web App work, update root `STATUS.md` with:

- routes created/changed
- components created/changed
- backend contracts used
- pending backend dependencies
- tests run
- next recommended Web App task
