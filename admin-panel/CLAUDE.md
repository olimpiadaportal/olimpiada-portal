# CLAUDE.md — Admin Panel Instructions

## Scope

This file applies to work inside `admin-panel/`.

The Admin Panel is only for:

- Administrator
- Teacher / Content Manager

Do not implement Student/Parent Web App features here.
Do not give Content Managers broad administrator permissions.

## First Steps

Before Admin Panel work:

1. Open root `STATUS.md`.
2. Confirm the active stage is Admin Panel related.
3. Read:
   - `../IMPLEMENTATION_EXECUTION_PLAN.md`
   - `../docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
   - `../docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
   - `../docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
   - `../docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
   - `../docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
   - `markdowns/ADMIN_PANEL_IMPLEMENTATION_CONTEXT.md`
   - `markdowns/ADMIN_PANEL_ROUTES_AND_MODULES.md`
   - `markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`
   - `markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md`
   - `markdowns/ADMIN_PANEL_CLAUDE_CODE_RULES.md`

## Admin Panel Rules

- Administrator can manage platform-wide settings and sensitive modules.
- Content Manager is limited to educational content workflows.
- Content Manager must not access payment management, role management, sensitive exports, feature flags, system settings, or broad user PII.
- Sensitive actions require confirmation and audit logging.
- Prefer archive/unpublish over destructive delete.
- Keep data tables searchable, filterable, paginated, and permission-aware.
- Media uploads use Supabase Storage, not PostgreSQL binary storage.

## Current Admin Panel Build Order

1. Project skeleton and admin layout
2. Auth/session handling for admin/content manager roles
3. Permission-aware sidebar/navigation
4. Taxonomy CRUD: grades, subjects, topics, subtopics
5. Difficulty levels, question types, olympiad types
6. Question CRUD with answer options and explanations
7. Media upload for optimized images/audio
8. Content lifecycle: draft, in_review, approved, published, archived, rejected
9. Test package and daily task package management
10. Analytics/reports/payment monitoring after backend modules exist

## Status Update Requirement

After Admin Panel work, update root `STATUS.md` with:

- routes created/changed
- modules created/changed
- permissions enforced
- audit events added
- pending backend dependencies
- tests run
- next recommended Admin Panel task
