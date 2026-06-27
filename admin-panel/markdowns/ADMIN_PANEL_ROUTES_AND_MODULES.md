# Admin Panel Routes and Modules


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_ROUTES_AND_MODULES.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Claude Code, admin frontend developer
- Related master docs: `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- Scope controlled by this file: Admin Panel route/module structure
- Source-of-truth level: Derived app-specific execution guide


## Suggested Route Structure

```text
app/login/page.tsx
app/dashboard/page.tsx
app/users/page.tsx
app/students/page.tsx
app/parents/page.tsx
app/children/page.tsx
app/admins/page.tsx
app/content-managers/page.tsx
app/roles-permissions/page.tsx
app/taxonomy/grades/page.tsx
app/taxonomy/subjects/page.tsx
app/taxonomy/topics/page.tsx
app/questions/page.tsx
app/questions/new/page.tsx
app/questions/[id]/edit/page.tsx
app/tests/page.tsx
app/daily-tasks/page.tsx
app/news/page.tsx
app/news/new/page.tsx
app/news/[id]/edit/page.tsx
app/olympiads/page.tsx
app/olympiads/new/page.tsx
app/olympiads/[id]/edit/page.tsx
app/olympiads/[id]/questions/page.tsx
app/reviews/page.tsx
app/leaderboard/page.tsx
app/subscriptions/page.tsx
app/pricing-plans/page.tsx
app/payments/page.tsx
app/notifications/page.tsx
app/reports/page.tsx
app/support/page.tsx
app/audit-logs/page.tsx
app/settings/page.tsx
app/feature-flags/page.tsx
```

> Note: There is intentionally NO "Discount Settings" / `app/coupons` module. The
> sibling discount is a fixed business rule (1st child 0%, 2nd child 15%, 3rd+ child
> 20%), computed backend-side at checkout. It is not admin-configurable.

## New Business & Monitoring Modules

### News management (Admin-only)

- `app/news/page.tsx` — list/search published and archived news items.
- `app/news/new/page.tsx` — create a news item (title, body with inline links, image in Storage, publish/active status).
- `app/news/[id]/edit/page.tsx` — edit, publish, archive, or soft-deactivate a news item.
- News is general (no categories in v1); created/updated dates are automatic; images live in Supabase Storage (DB stores object path/metadata only).

### Olympiad Preparation packages (Admin-only)

- `app/olympiads/page.tsx` — list olympiad preparation packages (active / archived for sale) with grade/class target, subject/domain, start date, olympiad/end date, price, status.
- `app/olympiads/new/page.tsx` — create a package (name, subject/domain, grade/class TARGET as a data field, short description, start date, olympiad/end date, price, status, optional banner image in Storage).
- `app/olympiads/[id]/edit/page.tsx` — edit package metadata and lifecycle; archive listing after the olympiad date (never delete; purchasers keep lifetime access).
- `app/olympiads/[id]/questions/page.tsx` — manage the package's question/test pool (the trial-test question bank). Each attempt selects 25 random questions server-side; difficulty (easy/medium/hard) stays in the model and is auto-mixed; users never choose difficulty.

### Subscription & pricing visibility (Admin-only)

- `app/subscriptions/page.tsx` — view child-based subscriptions (per child: subjects, duration, trial dates, payment status, access status, applied sibling discount).
- `app/pricing-plans/page.tsx` — view/configure subject-based pricing plans and durations (weekly/monthly/yearly), launch-promo and trial config. Placeholder pricing is editable here; sibling discount is NOT configurable (fixed rule).

### Payment monitoring (Admin-only)

- `app/payments/page.tsx` — monitor payment records, checkout sessions, webhook-verified activations, failed charges, and olympiad package purchases. Read/monitoring oriented; activation is backend/webhook-driven, never set from the panel.

### Parent / child account monitoring (Admin-only)

- `app/parents/page.tsx` — monitor parent accounts and their linked children.
- `app/children/page.tsx` — monitor child/student accounts showing the server-generated 8-digit numeric unique ID, linked parent, selected subjects, subscription/access status.

## Admin-Only Routes

Users, admins, roles-permissions, payments, subscriptions, pricing-plans, news, olympiads (packages + question pool), parents, children (with 8-digit IDs), audit logs, settings, feature flags, full exports.

## Content Manager Routes

Dashboard, assigned questions, new question, edit own drafts, explanations, allowed test/daily-task drafts, review submissions, limited subject analytics.

Content Managers have NO access to News, Olympiad Preparation packages or their question pool, subscriptions, pricing-plans, payments, or parent/child monitoring. Those are Admin-only business/payment modules.

## Module Patterns

- Data tables with search/filter/sort/pagination.
- Create/edit forms with validation.
- Review screens with diff/comments.
- Confirmation dialogs for sensitive actions.
- Export screens with reason capture.
