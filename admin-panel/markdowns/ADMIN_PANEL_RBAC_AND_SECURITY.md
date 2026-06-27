# Admin Panel RBAC and Security


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Security lead, admin developer, Claude Code
- Related master docs: `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- Scope controlled by this file: Admin Panel permission boundaries and security rules
- Source-of-truth level: Derived app-specific security guide


## Administrator Permissions

Administrator can manage users, roles, content, tests, daily tasks, payments, subscriptions, pricing plans, News, Olympiad Preparation packages and their question pool, reports, notifications, support, audit logs, settings and feature flags. Administrators also monitor parent and child accounts, including the server-generated 8-digit child IDs.

## Content Manager Permissions

Content Manager can create questions, edit own drafts, add explanations, create permitted test/daily-task drafts, submit for approval, view limited subject-level analytics and high-error questions. This is regular educational content/question workflow only — Content Managers never touch business, payment, or subscription modules.

## Module Permission Matrix

| Module | Administrator | Content Manager |
| --- | --- | --- |
| Taxonomy (grades/subjects/topics/subtopics) | Manage | View (as needed for content) |
| Questions / options / explanations | Manage + approve/publish | Create/edit own drafts, submit |
| Tests / daily tasks | Manage | Permitted drafts only |
| Review / approval workflow | Approve / reject / publish | Submit for approval |
| News (CRUD, publish, archive) | Manage | Forbidden |
| Olympiad Preparation packages | Manage | Forbidden |
| Olympiad question pool / trial-test bank | Manage | Forbidden |
| Subscriptions (child-based) | View / monitor | Forbidden |
| Pricing plans / pricing config | Manage | Forbidden |
| Payments / checkout sessions / purchases | Monitor | Forbidden |
| Parent account monitoring | View / monitor | Forbidden |
| Child account monitoring (8-digit IDs) | View / monitor | Forbidden |
| Roles / permissions | Manage | Forbidden |
| Audit / security logs | View | Forbidden |
| Settings / feature flags / Stripe-webhook config | Manage | Forbidden |

There is intentionally NO "Discount Settings" / coupons module for either role. The sibling discount is fixed in business logic (1st child 0%, 2nd child 15%, 3rd+ child 20%) and computed backend-side at checkout; it is never client- or admin-configurable.

## Explicitly Forbidden for Content Managers

- Payments, subscriptions, and pricing plans.
- News management (create/edit/publish/archive).
- Olympiad Preparation packages and the olympiad question pool / trial-test bank.
- Parent and child account monitoring (including 8-digit child IDs).
- Any business/payment module.
- Roles/permissions.
- Admin account management.
- Full student/parent PII.
- Full exports.
- Audit/security logs.
- System settings/feature flags.
- Stripe/webhook configuration.
- Backup/deployment settings.
- Destructive platform-wide actions.

## Permission Checks

Use both route-level and action-level checks. Route hidden by sidebar is not enough. Server rejects forbidden calls.

## RLS Expectations

Content Manager RLS should limit draft/assigned content. Admin privileged operations must still be controlled and audited.

## Audit Logging Requirements

Audit all sensitive actions, including failed attempts. Export, payment status change, role change, publish/unpublish and settings changes are critical. Additionally audit the new business and monitoring actions:

- News create / edit / publish / archive / deactivate.
- Olympiad package create / edit / price change / status change / archive.
- Olympiad question pool changes (add/remove/edit pool questions).
- Subscription and pricing-plan configuration changes.
- Payment record/monitoring views of sensitive data and any manual payment-state inspection.
- Parent/child account monitoring access, especially views revealing 8-digit child IDs or linkage.

Record actor, target, before/after where applicable, and outcome. Activation/refund of payments is webhook-driven and never performed from the panel; the panel only records that monitoring occurred.

## Sensitive Action Confirmation

Use typed confirmation for irreversible actions. Prefer archive. Show affected count before bulk operations.
