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

## Core Product Model (Canonical)

The Web App has three distinct surfaces. Treat these as the canonical product model and source of truth for all Web App scope:

1. **Public Marketing Website** — pre-login marketing pages. No private data. Anyone can browse.
2. **Parent App** — the only user type that self-registers (email/password). Parents create children, select subjects, pay, and manage subscriptions and olympiad purchases.
3. **Child App** — children are created by a parent and log in with a **8-digit numeric unique ID + parent-created password** (never email). Children solve tests, view progress, access purchased olympiad content, and customize their dashboard wallpaper. Children can never purchase anything.

Canonical terms used throughout this document:

- **Parent**: self-registers (email/password); pays; manages children.
- **Child / Student**: created by a parent; logs in with 8-digit ID + parent-set password; never purchases.
- **Subjects (MVP, exactly four)**: `Math`, `Science`, `Məntiq`, `İngilis dili`.
- **Child subscription**: child-based (per child), subject-based pricing, weekly/monthly/yearly duration.
- **Olimpiada Hazırlığı / Olympiad Preparation**: a separate paid add-on module purchased by the parent; children access only.

Removed from earlier baselines (see `06` doc §"Contradictions Resolved" and execution plan): student self-registration, student email login, parent/student manual linking as the primary flow, parent-level paid account, and user-selected difficulty. Parent-created children are AUTO-LINKED to the parent; manual linking is not the primary flow.

## Web App Routing Structure

```text
web-app/
└── app/
    ├── (public)/                                  # Public Marketing Website — no private data
    │   ├── page.tsx                               # / Home
    │   ├── about/page.tsx                         # /about
    │   ├── news/page.tsx                          # /news (public news list)
    │   ├── news/[slug]/page.tsx                   # /news/[slug] (public news article)
    │   ├── pricing/page.tsx                       # /pricing (general model; final price depends on parent-selected subjects + duration)
    │   ├── olympiad-preparation/page.tsx          # /olympiad-preparation (a.k.a. /olimpiada-hazirligi) overview
    │   ├── subjects/page.tsx                      # /subjects (the four MVP subjects)
    │   ├── faq/page.tsx                           # /faq
    │   ├── contact/page.tsx                       # /contact
    │   ├── login/page.tsx                         # /login (parent email/password OR child 8-digit ID entry point)
    │   └── register/page.tsx                      # /register (PARENT registration only)
    ├── (parent)/parent/                           # Parent App — protected, parent role only
    │   ├── dashboard/page.tsx                     # children list: 8-digit ID, sub/payment status, subjects, access status
    │   ├── children/page.tsx                      # manage children
    │   ├── children/new/page.tsx                  # multi-step Add-Child flow (info → subjects → password → checkout)
    │   ├── children/[childId]/page.tsx            # single child detail / progress summary
    │   ├── children/[childId]/subjects/page.tsx   # add/remove subjects later for a child
    │   ├── children/[childId]/subscription/page.tsx # manage a child's subscription/plan duration
    │   ├── checkout/page.tsx                      # subscription checkout (subject-based price, sibling discount shown)
    │   ├── payments/page.tsx                      # parent payment history
    │   ├── olympiads/page.tsx                     # My Olympiads + Available Olympiads (parent purchases)
    │   ├── olympiads/[packageId]/checkout/page.tsx # olympiad package checkout
    │   ├── reports/page.tsx                       # per-child reports
    │   ├── notifications/page.tsx
    │   └── support/page.tsx
    ├── (student)/student/                         # Child App — protected, child role only
    │   ├── login/page.tsx                         # 8-digit ID + parent-set password
    │   ├── dashboard/page.tsx                     # tests, progress, olympiad access (per parent's active payments)
    │   ├── profile/page.tsx                       # child profile + wallpaper customization (predefined set only)
    │   ├── daily-tasks/page.tsx
    │   ├── tests/page.tsx
    │   ├── tests/[testId]/page.tsx
    │   ├── results/page.tsx
    │   ├── attempts/[attemptId]/result/page.tsx
    │   ├── mistakes/page.tsx
    │   ├── progress/page.tsx
    │   ├── leaderboard/page.tsx
    │   ├── olympiads/page.tsx                     # purchased olympiad packages (access only, no purchase)
    │   ├── olympiads/[packageId]/page.tsx
    │   ├── olympiads/[packageId]/attempt/page.tsx # 25 server-selected random questions per attempt
    │   └── notifications/page.tsx
    └── unauthorized/page.tsx
```

Notes:

- The child has **no** subscription, payment, checkout, or olympiad-purchase route. Those exist only under `(parent)/`.
- Public routes never expose private student data. The pricing and olympiad-preparation pages show the general model only.
- Route names may be adjusted to project conventions but must represent all flows above.

## Folder Structure

```text
web-app/
├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── marketing/        # public website sections (hero, pricing preview, news cards, FAQ)
│   ├── parent/           # parent dashboard, add-child wizard, subjects/subscription/checkout
│   ├── child/            # child dashboard, wallpaper picker, locked/expired states
│   ├── olympiad/         # available/my olympiad packages, attempt UI
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

Use typed validation schemas such as Zod. Validate on client for UX and on server/service for trust. Never trust client-submitted child ID, 8-digit ID, role, selected subjects, price, discount, trial dates, subscription status, payment status, access flags or score. The child's 8-digit unique ID is generated server-side only and is never accepted as a client-provided value for privileged operations.

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

### Public Marketing Website

| Screen | Purpose | User actions | Required data | Backend calls | Validation | Empty/error states | Security | Admin-controlled settings |
|---|---|---|---|---|---|---|---|---|
| Home (`/`) | Explain product, route to register/login | view sections, register/login | public marketing content | static + `news.listPublic` (latest) | none | content load fail | no private data | marketing text later |
| About (`/about`) | Mission/company info | read | static content | none | none | n/a | no private data | text later |
| News (`/news`, `/news/[slug]`) | Public general news | browse/read article | published news, images | `news.listPublic`, `news.getPublic` | slug exists | no news yet/404 | no private data; published only | News (Admin CRUD) |
| Pricing (`/pricing`) | Show general subject-based model | view plans, route to register | public pricing model | `pricing.getPublicModel` | none | model load fail | no private data; placeholder pricing labeled | placeholder prices/config |
| Olympiad Preparation (`/olympiad-preparation`) | Explain olympiad add-on | view, route to register | public olympiad overview | `olympiads.listPublicTeasers` | none | none active | no private data | package teasers |
| Subjects (`/subjects`) | Present the 4 MVP subjects | view | static subject info | none | none | n/a | no private data | subject metadata |
| FAQ (`/faq`) | Answer common questions | read | static FAQ | none | none | n/a | no private data | text later |
| Contact (`/contact`) | Contact info / message | view, submit message | contact config | `contact.submit` (optional) | message format | submit fail | no private data; no SMS | text/config |
| Register (`/register`) | PARENT registration only | create parent account | email/password | Supabase Auth, parent profile service | email, password | invalid/used email | parents only; no child/student self-register | allowed parent role |
| Login (`/login`) | Auth entry | parent login OR enter child portal | email/password OR 8-digit ID | Supabase Auth (parent); child credential service | email/pw or 8-digit ID | invalid credentials | no SMS | n/a |

### Parent App (protected, parent role only)

| Screen | Purpose | User actions | Required data | Backend calls | Validation | Empty/error states | Security | Admin-controlled settings |
|---|---|---|---|---|---|---|---|---|
| Parent Dashboard | Overview of all children | view children, add child, pay | children list (8-digit ID, sub/payment status, subjects, access status) | parent dashboard service | none | no children yet | own children only (RLS) | report cadence |
| Add Child (wizard) | Create a child + activate | step1 info → step2 subjects → step3 password → checkout | child info, subjects, price preview | child create, pricing preview, checkout session | per-step schemas | step incomplete/checkout fail | own account only; ID assigned server-side | placeholder pricing |
| Child Detail | One child's summary | view progress, manage subjects/subscription | child profile, progress, status | child detail service | none | no activity yet | own child only | metric definitions |
| Child Subjects (add later) | Add/remove subjects | toggle subjects, see new price/proration | current subjects, price delta | subjects update, proration preview | subject set valid | proration/checkout fail | own child only; price computed server-side | placeholder pricing/proration rule |
| Child Subscription | Manage plan/duration | choose weekly/monthly/yearly, renew | current sub, plan options | subscription service | plan/duration required | payment pending/fail | own child only | plans/prices/trial/promo |
| Checkout (subscription) | Pay for child access | confirm/pay | price, sibling discount, trial info | Stripe checkout, subscription service | confirm required | payment pending/fail | parent-only; price/discount server-computed | sibling rule (fixed) |
| Payments | Payment history | view receipts | parent payments | payments service | none | no payments yet | own payments only | n/a |
| Olympiads (Available + My) | Browse/purchase olympiad packages | view available, purchase, view owned | available packages, owned packages | olympiad listing/purchase service | none | none available/none owned | parent purchases only; lifetime owned | Olympiad packages (Admin) |
| Olympiad Checkout | Buy an olympiad package | confirm/pay | package price | Stripe checkout, olympiad purchase service | confirm required | payment fail | parent-only; lifetime access on success | package price/status |
| Reports | Per-child reports | view periods/subjects | child snapshots | progress/report service | period | no progress yet | own children only | metric definitions |
| Notifications | Read notifications | mark read | notification list | notification service | none | no notifications | own notifications | templates |
| Support | Contact support | create ticket | categories | support service | message required | submit fail | own tickets | categories |

### Child App (protected, child role only)

| Screen | Purpose | User actions | Required data | Backend calls | Validation | Empty/error states | Security | Admin-controlled settings |
|---|---|---|---|---|---|---|---|---|
| Child Login | Enter the child portal | enter 8-digit ID + password | 8-digit ID, password | child credential service | 8-digit numeric ID, password | invalid credentials | no email login; child role only | n/a |
| Child Dashboard | Tasks/progress/olympiad access | start task/test, open olympiad | task status, progress, olympiad access, access state | dashboard service | none | no data yet / locked-or-expired | own data; gated by parent's active payments | feature flags |
| Child Profile + Wallpaper | View profile, pick wallpaper | choose predefined wallpaper/background | profile, predefined wallpaper catalog | profile service, wallpaper service | wallpaper from catalog only | none | own profile only; predefined set only | wallpaper catalog |
| Daily Task | Solve daily package | answer/submit/retry if allowed | package, questions | daily task service | answer required | no task today / payment required | correct answers hidden; gated | task schedule |
| Test List | Browse tests | filter/start test | tests, access state | test service | filters | no tests / locked | access gating (parent payment) | published tests |
| Test Solver | Timed solving (25 random Qs) | answer, navigate, submit | test attempt/questions | attempt service (server-side random selection) | answer format | autosave fail/time expired | attempt ownership; difficulty auto-mixed | duration/scoring |
| Result Screen | Show score/explanations | review mistakes/retry | attempt answers/explanations | result service | none | result pending | own result | explanation visibility |
| Mistakes | Practice weak answers | filter/retry | wrong answers | progress service | filters | no mistakes | own data | retry policy |
| Progress | Charts and weak topics | view periods/subjects | snapshots | progress service | period | no progress yet / locked | own data; paid-dependent progress gated | metric definitions |
| Leaderboard | Show rank | filter category/period | entries, own rank | leaderboard service | filters | no ranks | pseudonymized public view | categories |
| My Olympiads (access) | Access purchased packages | open package, start attempt | owned packages (lifetime) | olympiad access service | none | none owned | access only; cannot purchase | package availability |
| Notifications | Read notifications | mark read | notification list | notification service | none | no notifications | own notifications | templates |

Children have no subscription, checkout, payment, or olympiad-purchase screen. All paid actions are parent-only.


## Public Marketing Website Rules

- The public website is fully browsable without authentication and must never render private student/parent data.
- Pages: Home, About, News (list + article), Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, plus Login and Register entry points.
- **Register is for parents only.** There is no student/child self-registration anywhere on the public site.
- **News** is shown publicly here (and also in-app); only published/active news appears. News images come from Supabase Storage; the DB holds metadata only.
- The **Pricing** page presents the general subject-based model and clearly notes that final price/access depends on the parent-selected subjects per child plus plan duration. Pricing values are placeholders (configurable later via admin/config) and must be labeled as placeholder.
- The **Olympiad Preparation** overview explains the separate paid add-on module at a high level (no checkout on the public site).
- The **Subjects** page lists exactly the four MVP subjects: `Math`, `Science`, `Məntiq`, `İngilis dili`.
- No domain name is assumed or hardcoded; the domain is not confirmed in this phase.

## Parent App Flows

### Parent Registration and Login

- Parents self-register with email/password via Supabase Auth (existing parent auth). Registration is free; no payment is required to create a parent account.
- After login, the parent lands on the Parent Dashboard.

### Parent Dashboard

- Lists every child the parent created. For each child show: the **unique 8-digit ID**, **subscription/payment status**, **selected subjects**, and **access status** (active / trial / promo / locked / expired).
- Primary actions: Add Child, open a child's detail, manage subjects, manage subscription, go to checkout, view payments, open Olympiads.
- Parent-created children are AUTO-LINKED to the parent. There is no manual link-code step as the primary flow.

### Add-Child Multi-Step Flow

This is a guided wizard. Each step is validated before continuing.

1. **Step 1 — Child info:** first name, last name, city, school, class/grade. (No subject or payment data on this step.)
2. **Step 2 — Subject selection (SEPARATE page):** checkboxes for `Math`, `Science`, `Məntiq`, `İngilis dili` (one, several, or all). A **live pricing preview** below the checkboxes updates automatically as the subject count changes (and reflects plan duration and any sibling discount). Pricing is placeholder and labeled as such.
3. **Step 3 — Set child password:** the parent sets the child's login password. The child's login identity is a server-assigned 8-digit ID (assigned at activation), not chosen here.
4. **Checkout / activation:** the parent completes payment (or enters the launch promo / 7-day trial per the subscription model). On webhook-verified success, the system **assigns a unique server-generated 8-digit numeric ID** to the child and activates access.

Rules:
- The 8-digit ID is generated server-side only, collision-safe, zero-padded, and unique. It is never client-provided.
- Selected subjects, price, discount, and trial dates are computed and stored server-side; the client never sets them.
- A child becomes usable (can log in and access content) only after activation per the payment/promo/trial rules.

### Adding Subjects Later

- From a child's detail, the parent can add subjects to an existing child subscription.
- The new price and any proration/upgrade amount are computed by a secure backend-controlled rule (documented as a required business rule / backend service; full proration may be a placeholder if outside MVP). The client never sets the prorated price.

### Subscription Checkout

- Child-based subscription. The parent chooses plan duration (weekly/monthly/yearly); price scales by selected-subject count.
- The **sibling discount** is applied automatically by the backend (1st child 0%, 2nd child 15%, 3rd+ child 20%) and is shown on checkout when it applies. There is no admin "Discount Settings" module; the rule is fixed in business logic.
- Launch promo (first ~1 month free at platform launch) and the ongoing 7-day trial for new paid child subscriptions are surfaced clearly.
- Payment is real and Stripe-first (provider abstraction for future local providers). Activation is webhook-verified only — never client-activated.

### Olympiad Purchases (Parent)

- The parent sees **Available Olympiads** (Aktiv Olimpiadalar) and **My Olympiads** (Mənim Olimpiadalarım).
- Olympiad Preparation is a SEPARATE paid add-on, distinct from subscriptions. Only the parent can purchase; payment is via the parent account.
- A successful purchase grants **lifetime access** for the child; purchased packages are never deleted and remain accessible even after the package auto-archives for new sales.

### Parent Dashboard UX Rules

- Parent can switch between their children.
- Show actionable summaries, not raw technical stats.
- Highlight missed tasks, weak topics, recent improvements, subscription/payment status and access status per child.
- Payment history must be clear and non-technical.

## Child App Flows

### Child Login

- The child logs in with their **8-digit numeric ID + parent-created password**. There is no email login for children.
- Wrong ID or password shows a clear, child-friendly error.

### Child Dashboard

- Shows tests, daily tasks, progress, and olympiad preparation access. Content shown reflects the **parent's active payments** (selected subjects + active subscription, plus any purchased olympiad packages).
- When the parent's payment is inactive/expired (or a charge failed), the child sees clear **locked/expired states** instead of paid content. Previously purchased olympiad packages remain accessible (lifetime).

### Child Permissions (Hard Limits)

- The child cannot purchase anything, cannot start checkout, and cannot edit subscription, payment, subjects, price, or access flags.
- These limits are enforced server-side and by RLS, not just hidden in the UI.

### Child Wallpaper Customization

- The child can personalize their dashboard background by choosing from a **predefined set** of wallpapers/solid backgrounds only (e.g., playful / simple educational / cartoon-style / solid color — generic wording, no licensed characters). This is not full theming and allows no arbitrary colors.
- The selection is saved **per child profile** and is editable only from the child profile/settings page. The catalog of available wallpapers is admin/config-controlled; images live in Supabase Storage (DB holds metadata only).

## Student Test-Taking UX Rules

- Show timer clearly for timed tests.
- Autosave answers where possible.
- Do not show correct answers before final submission.
- Confirm before final submit.
- Handle time expiry automatically.
- Show score, correct/wrong count, explanations and weak topics after result generation.
- Make retry rules clear.
- **Users never choose difficulty.** Each attempt receives an auto-mixed set selected server-side. The data model keeps easy/medium/hard, but the UI must not offer a difficulty selector. For olympiad attempts, **25 random questions** are selected server-side per attempt (a new mix each attempt; if fewer than 25 exist, the available questions are used).

## Subscription-Gated Access Rules

- Public marketing pages and the parent/child auth entry points remain accessible.
- Paid child access (tests, daily tasks, olympiad preparation, paid content, paid-dependent progress, any subscription-gated feature) requires the parent's active subscription/payment for that child.
- During the launch promo (~first month) and the 7-day trial, gated content is available without a successful charge per the subscription model.
- If a charge fails after trial/renewal, all paid child access is automatically blocked and the child sees a clear locked/expired state.
- The child cannot resolve a block; only the parent can renew/pay. The child app shows an informational message directing the child to ask the parent.
- A child may view previous own results even if the subscription expires, unless business decides otherwise. Purchased olympiad packages remain accessible (lifetime).
- Access is checked server-side, not only hidden in UI.

## Unauthorized/Expired Behavior

| Case | Behavior |
|---|---|
| Anonymous visits protected page | Redirect to login |
| Child visits parent route | Show unauthorized |
| Parent visits child route directly | Redirect parent dashboard or unauthorized |
| Child attempts any purchase/checkout action | Block server-side; show "managed by your parent" message |
| Expired/blocked subscription starts gated test | Show locked/expired state; child cannot pay (parent action only) |
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
11. **Only parents self-register** (email/password). There is no student/child self-registration and no student email login.
12. **Children are created by a parent** and log in with a **server-generated 8-digit numeric ID + parent-set password**. The 8-digit ID is unique, collision-safe, zero-padded, and assigned server-side at activation.
13. **Subscriptions are child-based** (per child: subjects, duration, payment/access status), with **subject-based placeholder pricing** and a **fixed sibling discount** (2nd child 15%, 3rd+ 20%) computed server-side. There is no "Discount Settings" admin module.
14. **Children never purchase anything.** All payments, checkout, subscription, and olympiad purchases are parent-only and webhook-verified server-side; the client never activates access.
15. **Olympiad Preparation is a separate paid add-on** purchased by the parent; the child accesses it but cannot buy. Purchased packages = lifetime access and are never deleted.
16. **Users never choose difficulty;** the system auto-mixes questions and selects 25 random questions per olympiad attempt server-side.
17. The **public marketing website** (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login, Register) exposes no private data. **News** is public + in-app with Admin-only CRUD. **Child wallpaper customization** uses a predefined set saved per child.
18. The **domain name is not confirmed**; no domain purchase or email-domain configuration in this phase.
