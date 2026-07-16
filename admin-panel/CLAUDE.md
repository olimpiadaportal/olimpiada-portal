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
- Content Manager is limited to regular educational content/question workflows.
- Content Manager must not access payment management, subscriptions, pricing plans, News, Olympiad Preparation packages or their question pool, parent/child account monitoring, role management, sensitive exports, feature flags, system settings, or broad user PII. News, Olympiad packages, and all payment/subscription/business modules are Admin-only.
- There is NO "Discount Settings" / coupons module. The sibling discount is fixed in business logic (1st child 0%, 2nd child 10%, 3rd+ child 15% — investor-approved 2026-07-15) and computed backend-side; never make it admin-configurable.
- Users never choose difficulty. Tests draw a random mixed set server-side; easy/medium/hard stay in the model only for auto-mixing.
- Olympiad packages auto-archive listings after the olympiad date but purchasers keep lifetime access; never delete purchased olympiad packages or purchase records.
- Sensitive actions require confirmation and audit logging, including News, olympiad package, pricing, subscription, payment-monitoring, and parent/child-monitoring actions.
- Prefer archive/unpublish over destructive delete.
- Keep data tables searchable, filterable, paginated, and permission-aware.
- Media uploads (news images, olympiad banners, optimized images/audio/avatars) use Supabase Storage, not PostgreSQL binary storage.

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
10. News management (Admin-only): create/edit/publish/archive, images in Storage
11. Olympiad Preparation package management (Admin-only): package metadata, grade/class target, question pool, random 25-question selection, archive listing with lifetime purchaser access, package history
12. Subscription/pricing-plan visibility and payment monitoring (Admin-only) after backend modules exist
13. Parent/child account monitoring (Admin-only), including 8-digit child IDs
14. Analytics/reports after backend modules exist

## Status Update Requirement

After Admin Panel work, update root `STATUS.md` with:

- routes created/changed
- modules created/changed
- permissions enforced
- audit events added
- pending backend dependencies
- tests run
- next recommended Admin Panel task
