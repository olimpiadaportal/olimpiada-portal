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
- Tests and daily tasks (random mixed selection; users never choose difficulty).
- Review/approval workflow.
- News management (Admin-only): create/edit/publish/archive, body with inline links, images in Storage.
- Olympiad Preparation package management (Admin-only): package metadata, grade/class TARGET data field, question pool, random 25-question server-side selection per attempt, listing auto-archive after the olympiad date with lifetime purchaser access, package history.
- Subscriptions/pricing-plans/payments monitoring (Admin-only).
- Parent/child account monitoring (Admin-only), including 8-digit child IDs.
- Notifications, reports, support.
- Audit logs/settings/feature flags for Admin only.

## Business-Module Boundaries

- News, Olympiad Preparation packages and their question pool, subscriptions, pricing plans, payments, and parent/child monitoring are Admin-only business/payment modules.
- Content Managers are FORBIDDEN from all of the above and keep only regular educational content/question workflows.
- There is no "Discount Settings" module; the sibling discount is fixed in business logic (2nd child 15%, 3rd+ child 20%) and computed backend-side.
- Olympiad listings auto-archive after the olympiad date; purchased packages keep lifetime access and are never deleted.

## Security Reminders

- Every route requires server-side permission.
- Content Manager must not access sensitive admin areas or any business/payment module (News, Olympiad packages, subscriptions, pricing, payments, parent/child monitoring).
- All sensitive actions audited, including News, olympiad package, pricing, subscription, payment-monitoring, and parent/child-monitoring actions.
- Destructive actions require confirmation and soft-delete/archive; purchased olympiad records are never deleted.
- Payment/subscription activation is backend/webhook-driven and never set from the panel; price, discount, subjects, trial dates, and access flags are never client-controlled.

## Out of Scope

Student/Parent Web App features, current mobile app, SMS, optional bank transfer, broad Content Manager privileges.
