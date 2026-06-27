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
app/reviews/page.tsx
app/leaderboard/page.tsx
app/subscriptions/page.tsx
app/payments/page.tsx
app/coupons/page.tsx
app/notifications/page.tsx
app/reports/page.tsx
app/support/page.tsx
app/audit-logs/page.tsx
app/settings/page.tsx
app/feature-flags/page.tsx
```

## Admin-Only Routes

Users, admins, roles-permissions, payments, subscriptions, coupons, audit logs, settings, feature flags, full exports.

## Content Manager Routes

Dashboard, assigned questions, new question, edit own drafts, explanations, allowed test/daily-task drafts, review submissions, limited subject analytics.

## Module Patterns

- Data tables with search/filter/sort/pagination.
- Create/edit forms with validation.
- Review screens with diff/comments.
- Confirmation dialogs for sensitive actions.
- Export screens with reason capture.
