# Admin Panel RBAC and Security


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_RBAC_AND_SECURITY.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Security lead, admin developer, Claude Code
- Related master docs: `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- Scope controlled by this file: Admin Panel permission boundaries and security rules
- Source-of-truth level: Derived app-specific security guide


## Administrator Permissions

Administrator can manage users, roles, content, tests, daily tasks, payments, subscriptions, reports, notifications, support, audit logs, settings and feature flags.

## Content Manager Permissions

Content Manager can create questions, edit own drafts, add explanations, create permitted test/daily-task drafts, submit for approval, view limited subject-level analytics and high-error questions.

## Explicitly Forbidden for Content Managers

- Payments and subscriptions.
- Coupons.
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

Audit all sensitive actions, including failed attempts. Export, payment status change, role change, publish/unpublish and settings changes are critical.

## Sensitive Action Confirmation

Use typed confirmation for irreversible actions. Prefer archive. Show affected count before bulk operations.
