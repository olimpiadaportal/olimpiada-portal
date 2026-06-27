# Admin Panel Implementation Context


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_IMPLEMENTATION_CONTEXT.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Claude Code, admin frontend developer, backend integrator
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- Scope controlled by this file: Admin Panel implementation context
- Source-of-truth level: Derived app-specific execution guide


## Purpose

Admin Panel is for Administrator and Teacher/Content Manager users only. It manages platform operations and content workflows.

## Access

- Administrator: full permitted platform management.
- Content Manager: limited educational content and assigned analytics.

## Major Flows

- Admin login.
- Dashboard and alerts.
- User management.
- Content taxonomy.
- Questions/options/explanations.
- Tests and daily tasks.
- Review/approval workflow.
- Subscriptions/payments monitoring.
- Notifications, reports, support.
- Audit logs/settings/feature flags for Admin only.

## Security Reminders

- Every route requires server-side permission.
- Content Manager must not access sensitive admin areas.
- All sensitive actions audited.
- Destructive actions require confirmation and soft-delete/archive.

## Out of Scope

Student/Parent Web App features, current mobile app, SMS, optional bank transfer, broad Content Manager privileges.
