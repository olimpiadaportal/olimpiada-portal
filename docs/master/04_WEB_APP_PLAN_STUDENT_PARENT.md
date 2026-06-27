# 04 Web App Plan — Student and Parent


## Repository Placement and Related Files

- Intended path: `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Folder: `docs/master/`
- Primary readers: Frontend developer, full-stack developer, Claude Code, product owner, QA lead
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- Scope controlled by this file: Student/Parent Web App product and implementation plan
- Source-of-truth level: Master source of truth for Web App scope


## Approved Web App Folder Placement

Web App implementation docs belong in `web-app/markdowns/`. Actual Next.js Web App files will later be created under `web-app/`, not at repo root and not inside `admin-panel/`.

## Documents Web App Claude Code Sessions Should Read

```text
docs/master/00_MASTER_PROJECT_BLUEPRINT.md
docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md
docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md
docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md
docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md
docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md

web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md
web-app/markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md
web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md
web-app/markdowns/WEB_APP_CLAUDE_CODE_RULES.md
```

Read Admin Panel docs only when Web App behavior depends on admin-controlled content, subscriptions, notifications, feature flags or platform settings.

## Web App Routing Structure

```text
web-app/
└── app/
    ├── (public)/
    │   ├── page.tsx
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   └── pricing/page.tsx
    ├── (student)/student/
    │   ├── dashboard/page.tsx
    │   ├── onboarding/page.tsx
    │   ├── daily-tasks/page.tsx
    │   ├── tests/page.tsx
    │   ├── tests/[testId]/page.tsx
    │   ├── attempts/[attemptId]/result/page.tsx
    │   ├── mistakes/page.tsx
    │   ├── progress/page.tsx
    │   ├── leaderboard/page.tsx
    │   ├── subscription/page.tsx
    │   ├── notifications/page.tsx
    │   └── support/page.tsx
    ├── (parent)/parent/
    │   ├── dashboard/page.tsx
    │   ├── students/page.tsx
    │   ├── students/[studentId]/progress/page.tsx
    │   ├── reports/page.tsx
    │   ├── subscription/page.tsx
    │   ├── payments/page.tsx
    │   ├── notifications/page.tsx
    │   └── support/page.tsx
    └── unauthorized/page.tsx
```

## Folder Structure

```text
web-app/
├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── student/
│   ├── parent/
│   ├── test-solving/
│   ├── progress/
│   └── notifications/
├── lib/
│   ├── supabase/
│   ├── services/
│   ├── validators/
│   ├── permissions/
│   └── errors/
├── hooks/
├── types/
├── styles/
└── markdowns/
```

## Component Architecture

Separate:

1. Page routes.
2. Layout components.
3. UI primitives.
4. Form components.
5. Domain components.
6. Data fetching hooks/server actions.
7. Validation schemas.
8. Service-layer calls.
9. Permission checks.
10. Display-only components.

## Form Validation Strategy

Use typed validation schemas such as Zod. Validate on client for UX and on server/service for trust. Never trust client-submitted `student_id`, role, payment status or score.

## State Management Strategy

- Server state: React Query/SWR or Next.js server components/actions.
- Auth/session state: Supabase session helpers.
- Local UI state: component state.
- Business state: backend source of truth.

## Data Fetching Strategy

- Use server-side calls for sensitive data and subscription-gated content.
- Use RLS-safe client calls only for low-risk own-data reads.
- Centralize backend access in services.
- Avoid raw queries directly inside visual components.

## UI Rules

The first UI must be simple, clean, responsive, accessible and easy to restyle. Use dashboard cards, tables, forms, tabs, filters, pagination, modals/drawers, toast messages, status badges, progress indicators, question-solving components, report cards, subscription plan cards, notification lists and empty states.

## Major Screens


| Screen | Purpose | User actions | Required data | Backend calls | Validation | Empty/error states | Security | Admin-controlled settings |
|---|---|---|---|---|---|---|---|---|
| Landing/Home | Explain product and route to auth | View plans, login/register | Public plan/features | `plans.listPublic` | none | plan load fail | no private data | marketing text later |
| Register/Login | Auth entry | create account/login/reset | email/password, role | Supabase Auth, profile service | email, password, role | invalid credentials | no SMS | allowed roles |
| Student Onboarding | Set grade/preferences | choose grade/subjects | grades, subjects | taxonomy, profile update | grade required | no subjects configured | own profile only | active subjects |
| Student Dashboard | Summary of tasks/progress | start task/test, view reports | task status, progress, subscription | dashboard service | none | no data yet | own data | feature flags |
| Daily Task | Solve daily package | answer/submit/retry if allowed | package, questions | daily task service | answer required | no task today/subscription required | correct answers hidden | task schedule |
| Test List | Browse tests | filter/start test | tests, subscription | test service | filters | no tests | subscription gating | published tests |
| Test Solver | Timed solving | answer, navigate, submit | test attempt/questions | attempt service | answer format | autosave fail/time expired | attempt ownership | duration/scoring |
| Result Screen | Show score/explanations | review mistakes/retry | attempt answers/explanations | result service | none | result pending | own result | explanation visibility |
| Mistakes | Practice weak answers | filter/retry | wrong answers | progress service | filters | no mistakes | own data | retry policy |
| Progress | Charts and weak topics | view periods/subjects | snapshots | progress service | period | no progress yet | own data | metric definitions |
| Leaderboard | Show rank | filter category/period | entries, own rank | leaderboard service | filters | no ranks | pseudonymized public view | categories |
| Subscription | Manage plan | select/pay/cancel | plans/current sub | Stripe checkout, subscription service | plan required | payment pending/fail | owner/linked student | plans/prices |
| Parent Dashboard | View children | switch student/view report/pay | linked students, reports | parent dashboard service | link code | no linked students | link-based RLS | report cadence |
| Notifications | Read notifications | mark read | notification list | notification service | none | no notifications | own notifications | templates |
| Support | Contact support | create ticket | categories | support service | message required | submit fail | own tickets | categories |


## Student Test-Taking UX Rules

- Show timer clearly for timed tests.
- Autosave answers where possible.
- Do not show correct answers before final submission.
- Confirm before final submit.
- Handle time expiry automatically.
- Show score, correct/wrong count, explanations and weak topics after result generation.
- Make retry rules clear.

## Parent Dashboard UX Rules

- Parent can switch between linked students.
- Show actionable summaries, not raw technical stats.
- Highlight missed tasks, weak topics, recent improvements and subscription status.
- Payment history must be clear and non-technical.

## Subscription-Gated Access Rules

- Public/auth pages remain accessible.
- Premium tests/daily tasks can require active subscription.
- Expired subscription should show clear upgrade/renew screen.
- Student may view previous results even if subscription expires, unless business decides otherwise.
- Access is checked server-side, not only hidden in UI.

## Unauthorized/Expired Behavior

| Case | Behavior |
|---|---|
| Anonymous visits protected page | Redirect to login |
| Student visits parent route | Show unauthorized |
| Parent visits student route directly | Redirect parent dashboard or unauthorized |
| Expired subscription starts gated test | Show subscription required with plan CTA |
| Suspended account | Logout or suspended screen; no data access |

## Accessibility Requirements for Children

- Large clickable controls.
- Clear labels and instructions.
- Avoid overloaded screens.
- Strong contrast.
- Keyboard navigation.
- Screen-reader-friendly form errors.

## Mobile Browser Responsiveness

The Web App must work on mobile browsers. This is not the Flutter app. Use responsive layouts and touch-friendly test solving.

## Derived Web App Files

- `web-app/markdowns/WEB_APP_IMPLEMENTATION_CONTEXT.md`
- `web-app/markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md`
- `web-app/markdowns/WEB_APP_BACKEND_CONTRACT.md`
- `web-app/markdowns/WEB_APP_CLAUDE_CODE_RULES.md`


## Non-Negotiable Project Decisions

1. The current implementation scope is **Web App + Admin Panel + shared Supabase backend** only.
2. The **Mobile App is future-only**. Current work may only include backend/API readiness for future Flutter compatibility.
3. Web App and Admin Panel are separate Next.js applications under `web-app/` and `admin-panel/`.
4. Supabase is shared infrastructure under the root-level `supabase/` folder. SQL files must never be placed inside `web-app/` or `admin-panel/`.
5. Supabase PostgreSQL is the source of truth for content, users, subscriptions, attempts, progress, leaderboard and audit data.
6. Supabase Auth is used for authentication, with role and permission data enforced through PostgreSQL/RLS and server-side checks.
7. SMS is excluded from the current plan. No SMS OTP, no SMS notification channel, no SMS cost assumptions.
8. Payments are **Stripe-first card payments** with a provider abstraction for future local Azerbaijani providers. Optional bank transfer is excluded.
9. Redis is not required for correctness. The MVP should be PostgreSQL-first with a Redis-ready `LeaderboardService` abstraction.
10. UI approval is not a blocker. Build a clean, simple, responsive, accessible, component-ready frontend that can later be restyled.
