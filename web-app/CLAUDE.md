# CLAUDE.md — Web App Instructions

## Scope

This file applies to work inside `web-app/`.

The Web App is only for:

- Parents (the only self-registering, paying users — email/password)
- Children / Students (created by a parent; log in with a 8-digit unique ID + parent-created password; never purchase)
- A public marketing site reachable before login

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
- Only parents self-register (email/password). Do not build child/student self-registration or student email login. Children log in with a 8-digit ID + parent-created password.
- Children never purchase. Checkout, subjects, subscriptions, sibling discount, and olympiad purchases are parent-only. Never expose purchase flows to a child session.
- Do not trust client-side role, score, subscription, payment, subject, price, discount, trial, or access state. All pricing/discount/trial/status/access is server-side; the 8-digit ID is server-generated.
- The add-child subject selection (with live pricing preview) is a SEPARATE page in the wizard; the preview is informational and the server reprices at checkout.
- Difficulty is never user-selected; the server provides an auto-mixed question set (25 random for olympiad attempts).
- News is read-only here (Admin-only CRUD lives in the Admin Panel); render public + in-app news.
- Wallpaper customization uses a predefined catalog only (no arbitrary colors/themes), saved per child profile.
- Enforce authorization server-side and with Supabase RLS.
- Show loading, error, empty, unauthorized, and locked/expired states.
- Keep UI easy to restyle after final design approval.

## Current Web App Build Order

1. Project skeleton and shared layout
2. Public marketing site (Home, About, News list/detail, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact)
3. Parent auth/session handling (registration + login)
4. Protected routing for Parent and Child route groups
5. Parent dashboard shell (children list with 8-digit IDs + subscription/payment/access status)
6. Add-child wizard (child info → subjects on a separate page with live pricing → set child password → checkout → 8-digit ID reveal)
7. Child login (8-digit ID + password) and child dashboard shell with predefined wallpaper picker
8. Child-based subscription checkout (subject-based pricing, auto sibling discount, trial/launch promo) after payment/subscription backend exists
9. Student daily task/test flows after backend engine exists
10. Olympiad Preparation flows (Available vs My Olympiads, parent purchase, attempts) after olympiad backend exists
11. Parent reporting after progress data exists
12. Leaderboard/progress/notification UI after backend snapshots exist
13. Locked/expired access states wired across child dashboard and gated routes

## Status Update Requirement

After Web App work, update root `STATUS.md` with:

- routes created/changed
- components created/changed
- backend contracts used
- pending backend dependencies
- tests run
- next recommended Web App task
