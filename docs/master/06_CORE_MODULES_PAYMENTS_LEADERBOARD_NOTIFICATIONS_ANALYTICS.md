# 06 Core Modules — Payments, Leaderboard, Notifications and Analytics


## Repository Placement and Related Files

- Intended path: `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- Folder: `docs/master/`
- Primary readers: Backend engineer, product owner, admin-panel developer, Web App developer, QA lead, Claude Code
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- Scope controlled by this file: Core business modules beyond basic content/auth
- Source-of-truth level: Master source of truth for payments, leaderboard, notifications and analytics


## Payment and Subscription Module

### Scope

Use Stripe-first card payment architecture. Local Azerbaijani providers may be listed as future placeholders only: Kapital Bank, Azericard, ePoint, Portmanat, Hesab.az. Do not implement optional bank transfer now. Do not implement SMS payment notifications.

**Subscriptions are CHILD-based.** Each child created by a parent has its own subscription (selected subjects, plan duration, payment status, access status). The **parent** is the only payer; the **child never purchases anything**. Parent account creation is free; payment begins when a parent adds a child and activates access.

### Subject-Based Pricing (Placeholder)

Pricing is **per child** and scales by the count of subjects the parent selected for that child. The four MVP subjects are exactly: `Math`, `Science`, `Məntiq`, `İngilis dili`.

| Subjects selected | Placeholder price (per period unit) |
|---|---|
| 1 subject | 1 AZN |
| 2 subjects | 2 AZN |
| 3 subjects | 3 AZN |
| 4 subjects (full package) | 4 AZN — placeholder "discounted/full package" option (configurable later) |

- These are **placeholder prices** (effectively 1 AZN/subject) and must be labeled as placeholder. They are configurable later via admin/config; do not hardcode as final.
- Pricing applies across **weekly / monthly / yearly** durations, scaled by subject count.
- The add-child wizard shows a **live pricing preview** that updates as subjects are toggled (Step 2 of the flow in doc `04`).
- Price, selected subjects, discount and trial dates are computed and stored server-side. The client can never override price, discount, selected subjects, trial dates, subscription status or access flags.

### Plans (Duration)

- Weekly.
- Monthly.
- Yearly.
- Each duration is priced by selected-subject count (see table above).
- Plan/pricing configuration records are admin-managed (e.g., `subscription_plans` / pricing config). Subject-based amounts are placeholders pending business confirmation.

### Launch Promo and Trial

- **Launch promo:** the first ~1 month after platform launch may be free (launch-promo config). Document as a configurable, time-bounded promo.
- **Trial:** after the launch promo, new paid child subscriptions get a **7-day trial**. Trial start/end dates are stored server-side.
- Clearly state in product copy: **parent account = free**; **child access = paid after trial/promo**; **launch promo = first month**; **ongoing trial = 7 days**.

### Sibling Discount (Subscriptions Only)

- Automatic, fixed, computed **backend-side only** at checkout (never client-controlled): 1st child 0%, **2nd child 15%, 3rd+ child 20%**.
- Applies to subscriptions only (not olympiad purchases, unless changed later).
- The parent dashboard/checkout shows when a sibling discount applied.
- There is **no "Discount Settings" admin module** — this is a fixed business rule. Store the applied discount as calc/audit fields on the subscription/payment record.

### Add Subjects Later (Next-Cycle Pricing) — CONFIRMED 2026-06-27

- Parents can add subjects to an existing child subscription at any time.
- **MVP rule (confirmed, see `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`): "next-cycle pricing"** — adding a subject grants the child **access immediately**, and the **new total applies at the next renewal** (no mid-cycle proration math in MVP). All amounts are computed by a **secure backend-controlled rule**; the client never sets the price or selected subjects. We can switch to provider-native proration (e.g. Stripe) later — it is a configurable business rule.

### Checkout Flow (Subscription)

1. Parent adds/selects a child and confirms selected subjects + plan duration.
2. Backend computes price by subject count, applies the automatic sibling discount, and applies promo/trial rules.
3. Server creates a Stripe Checkout session (real payment; provider abstraction for future local providers).
4. Parent completes card payment on the Stripe-hosted page.
5. Stripe sends a verified webhook.
6. `payment_events` stores the event for idempotency.
7. `payments` status updates.
8. The **child** `subscriptions` record activates or renews, and the system assigns the child's 8-digit ID on first activation.
9. Parent receives in-app/email confirmation. **Activation is webhook-verified only — never client-activated.**

### Payment Status Flow

| Status | Meaning |
|---|---|
| `pending` | Payment session created, not confirmed |
| `succeeded` | Verified webhook succeeded |
| `failed` | Payment failed |
| `refunded` | Refund recorded if later enabled |
| `cancelled` | Checkout abandoned/cancelled |

### Subscription Gating

Access checks must be server-side. A child must never unlock content based on client state. Subscription records are **owned per child**, paid by the parent. The child app reads access state but cannot change it. Gating covers tests, daily tasks, olympiad preparation access, paid content and paid-dependent progress.

### Failed Payment Handling

- Show clear failure state to the parent.
- Do not activate the child subscription.
- Store failure event.
- Allow the parent to retry.
- Email/in-app notification only.
- **On a failed charge after trial/renewal, automatically BLOCK all paid child access** (tests, daily tasks, olympiad prep, paid content, paid-dependent progress, any subscription-gated feature). The parent account stays accessible; the child dashboard shows locked/expired states. Previously purchased olympiad packages remain accessible (lifetime).

### Coupons/Promo Codes

Coupon support may be MVP if needed. Must validate server-side, enforce expiration, usage limits, one-use-per-user rules and audit admin-created coupons. (Distinct from the fixed automatic sibling discount, which is not a coupon and has no admin settings module.)

### Olympiad Preparation Purchases (Payment View)

Olympiad Preparation packages are **separate paid add-ons**, not subscriptions. They are purchased by the parent as one-time package purchases and grant **lifetime access** to the child on webhook-verified success. The sibling discount does not apply. See the **Olympiad Preparation Module** section below for the full module spec.

### SQL Files

- `007_subscriptions_payments_coupons.sql` creates payment/subscription/coupon tables (extended for child-based subscriptions, per-child subject selections, subject-based pricing config, trial/promo fields, sibling-discount calc/audit fields).
- `008_notifications_support_audit.sql` supports payment notifications and audit.
- `010_rls_policies.sql` protects financial data (parent manages only own children; child cannot edit payment/subscription).
- `013_validation_queries.sql` validates webhook idempotency and subscription gating.
- Olympiad-package purchase/attempt tables and News tables are introduced with the Olympiad Preparation and News modules below and versioned per the database workflow.

## Olympiad Preparation Module

### Scope

**Olimpiada Hazırlığı / Olympiad Preparation** is a SEPARATE paid add-on module, distinct from regular child subscriptions. Only **parents purchase**; **children access** purchased content but cannot buy. Payment is real and webhook-verified (Stripe-first), never client-activated.

Two areas are exposed in the apps:

- **Available Olympiads (Aktiv Olimpiadalar):** packages currently on sale.
- **My Olympiad Packages (Mənim Olimpiadalarım):** packages the parent already purchased; the child accesses these.

### Admin-Created Packages

Admins create olympiad packages with at least:

- Olympiad name.
- Subject/domain (if relevant).
- Class/grade target (a real data-model field, not just free text).
- Short description.
- Start date.
- Olympiad/end date.
- Package price.
- Status (active / archived / etc.).
- Question/test pool (the pool the attempt selection draws from).
- Optional image/banner (stored in Supabase Storage; DB holds metadata only).

Only Admins manage olympiad packages (not Content Managers).

### Attempt Behavior (Random Selection)

- Each attempt selects **25 random questions server-side** from the package's question pool (e.g., a pool of ~500).
- A **new random mix** is produced on each attempt.
- If fewer than 25 questions exist, use the available questions instead of failing.
- Users never choose difficulty; the data model keeps easy/medium/hard but the set is auto-mixed.

### Lifecycle and Lifetime Access

- A package is active from its publish/start date until its olympiad/end date.
- After the olympiad/end date the package **auto-archives** for new sales/listing (no longer shown in Available Olympiads).
- **Purchasers keep LIFETIME access.** Purchased packages are **never deleted** and remain fully accessible to the child after the package archives.
- Olympiad packages are not subscription packages and are not affected by subscription gating, sibling discount, or failed-charge blocking once purchased.

### Package History

- Purchased packages are permanently visible in the parent/child account; the child can access purchased tests anytime.
- History fields include: package name, child, grade/class target, purchase date, olympiad/end date, price paid, status (active / archived / purchased / expired-for-sale-but-accessible), and linked question-pool info if relevant.
- Admins can view purchase/history records. Never delete purchased records; only soft-archive listings.

### Data/Schema Concepts

- `olympiad_packages` (name, subject/domain, grade/class target, description, start date, end date, price, status, banner metadata).
- `olympiad_question_pools` / pool membership linking questions to a package.
- `olympiad_package_purchases` (parent payer, child, package, price paid, purchase date, lifetime-access flag) — never deleted.
- `olympiad_package_attempts` and the per-attempt **random question selection** record (which 25 questions were served).
- Package archive status and lifetime-access records for purchased packages.
- All images/banners in Supabase Storage; DB stores object path/metadata only.

### Security

- Only parents purchase; only the linked child accesses purchased content. Children cannot initiate any olympiad purchase.
- Random selection happens server-side; the client never picks the question set or difficulty.
- RLS enforces that a parent purchases/views only own records and a child accesses only own purchased packages.

## News Module

### Scope

General **News** is shown on the public marketing website (`/news`, `/news/[slug]`) and also in-app. There are no categories in v1. News supports links inside the body and images stored in Supabase Storage (DB holds metadata only).

### Permissions

- **Admin-only CRUD.** Content Managers do NOT manage News (it is a business/communications module).
- Admins can create / edit / publish / archive / (soft-)deactivate per the existing destructive-action rules. Only published/active news appears publicly or in-app.

### Fields

- Title.
- Body (links allowed inside the body).
- Image (Storage object; metadata only in DB).
- `created_at` (auto), `updated_at` (auto).
- Publish/active status.

### Data/Schema Concepts

- `news` (title, body, status, created_at, updated_at, author/admin reference).
- `news_media` metadata (Storage object path, MIME type, ownership, audit fields).
- Public reads are limited to published/active rows via RLS; write/publish/archive is Admin-only.

## Leaderboard Module

### Categories

- Grade.
- Subject.
- School readiness.
- Rayon/district readiness.
- Country readiness.
- Weekly, monthly and yearly periods.

### Ranking Inputs

- Points.
- Correct answer percentage.
- Completed tasks.
- Answer speed.
- Active streaks.
- Olympiad test results.

### Fair Scoring Model

- First valid attempt counts fully.
- Retakes may count for learning, not unlimited leaderboard farming.
- Difficulty weights affect score.
- Speed bonus is capped and only applies to correct answers.
- Streak bonus is capped.
- Suspicious patterns flagged for admin review.

### PostgreSQL-First MVP

Default path:

1. Store attempts and progress in PostgreSQL.
2. Use scheduled recalculation to build `leaderboard_entries` and `leaderboard_snapshots`.
3. Index scope and period columns.
4. Serve leaderboard from snapshot tables.

### Redis-Backed Cache Option

Redis may be added if performance testing justifies it.

| Redis item | Example key | TTL | Invalidation |
|---|---|---|---|
| Top leaderboard page | `leaderboard:weekly:grade:5:top100` | 5-15 min | after recalculation |
| Student rank summary | `leaderboard:rank:student:<id>:weekly` | 5-15 min | after recalculation |
| Rate limit counter | `rate:attempt_submit:<profile_id>` | 1-5 min | TTL expiry |
| Recalculation lock | `lock:leaderboard:weekly` | job duration | release on job end |

Redis must not contain unnecessary PII. If Redis fails, serve PostgreSQL snapshots.

### Redis Decision Gate

Before implementing Redis, evaluate active student count, leaderboard query complexity, recalculation frequency, near-real-time needs, cost, operational complexity and Supabase performance. Recommended default: **PostgreSQL-first source of truth + Redis-ready service design + optional Redis during leaderboard/analytics phase if justified.**

### SQL Files

- `006_leaderboards_analytics.sql`
- `011_indexes_constraints_functions_triggers.sql`
- `013_validation_queries.sql`

## Notifications Module

### Allowed Channels

- In-app notifications.
- Email notifications.
- Admin Panel alerts.
- Future push notification readiness.

SMS is excluded.

### Notification Examples

- New daily task added.
- Task not completed.
- New result ready.
- Weekly report ready.
- Leaderboard updated.
- Subscription expiring (parent).
- Trial ending soon (parent).
- Payment successful / payment failed → access blocked (parent).
- New olympiad package available (parent).
- New news article published.
- Support request updated.

Payment, subscription, trial, and olympiad-purchase notifications are addressed to the **parent** (the payer). Learning/activity notifications (new task, result ready, etc.) target the **child**, and parent reports summarize per child.

### Database Structure

- `notifications`: canonical notification object.
- `notification_templates`: localized templates.
- `notification_deliveries`: channel delivery status.
- Future: `push_tokens` for Flutter/mobile readiness.

### Service Abstraction

`NotificationService.send(type, recipient, data)` decides channel based on preferences and event. Email provider is abstracted so Brevo can be replaced.

### Retry/Failure Handling

- Store delivery attempts.
- Retry transient email failures.
- Do not block payment/subscription success on email failure.
- Admin can view failed deliveries.

### Privacy Rules

- Avoid sensitive child/student details in email subject lines.
- Child activity/report data is sent only to the linked parent (the parent who created the child).
- Children receive only their own learning notifications; payment/subscription notifications go to the parent, never the child.
- Admin broadcasts (including News announcements) require permission and audit.

### SQL Files

- `008_notifications_support_audit.sql` (also covers News tables/media metadata and audit, or an adjacent versioned file per the database workflow).
- `010_rls_policies.sql` (public reads limited to published News; Admin-only News write/publish).
- `013_validation_queries.sql`

## Progress and Analytics Module

### Metrics

- Overall result percentage.
- Subject performance.
- Topic/subtopic performance.
- Correct/wrong count.
- Average answer time.
- Completed tasks.
- Daily activity.
- Weekly/monthly progress.
- Strong and weak topics.
- Ranking changes.
- Subscription activity (per child).
- Olympiad package activity/results (for purchased packages).
- Most solved tasks.
- Hardest/high-error questions.

Progress/analytics are tracked per **child**. Paid-dependent progress views are gated by the parent's active payment for that child (a blocked/expired subscription hides paid-dependent progress, while own historical results may remain viewable per the gating rules in doc `04`). Parent dashboards aggregate per child; the parent sees all their children, a child sees only their own data.

### Calculation Strategy

| Calculation | Timing |
|---|---|
| Attempt score | Immediately on submission |
| Task completion | Immediately on submission |
| Basic dashboard summary | On read from recent snapshots + latest attempts |
| Progress snapshots | Scheduled daily/weekly/monthly job |
| High-error questions | Scheduled admin analytics job |
| Leaderboard rank changes | After leaderboard recalculation |

### Expensive Query Prevention

- Use `progress_snapshots` and analytics summary tables.
- Add indexes on student, subject, topic and period.
- Paginate reports.
- Use materialized views only if needed.
- Consider Redis cache only after profiling.

### MVP vs Later Analytics

MVP: student dashboard, parent dashboard, subject/topic progress, daily/weekly/monthly basics, admin overview, high-error questions basic.

Later: advanced exports, cohort comparisons, predictive recommendations, school/partner analytics.


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
11. **Subscriptions are child-based** (per child), with **subject-based placeholder pricing** (1 AZN/subject; 1/2/3/4 AZN; full-package option when all 4 selected) configurable later, across weekly/monthly/yearly durations. Only the **parent pays**; the **child never purchases**.
12. **Launch promo** (~first month free) + ongoing **7-day trial** for new paid child subscriptions. A **failed charge auto-blocks all paid child access**. All activation is **webhook-verified server-side**, never client-activated.
13. **Sibling discount** is automatic and fixed (2nd child 15%, 3rd+ 20%), computed backend-side, subscriptions only. There is **no "Discount Settings" admin module**.
14. **Olympiad Preparation** is a separate paid add-on: parent-only purchase, child access only, **lifetime access** for purchasers, packages auto-archive for new sales after the olympiad date, and purchased records are never deleted. Each attempt serves **25 server-selected random questions**.
15. **Users never choose difficulty.** The model keeps easy/medium/hard but the served set is auto-mixed server-side.
16. **News** is public + in-app with **Admin-only CRUD** (Content Managers excluded); images in Supabase Storage (DB = metadata only). **Child wallpaper customization** uses a predefined catalog saved per child.
17. The **domain name is not confirmed**; no domain purchase or email-domain configuration in this phase.

## Contradictions Resolved (Superseding Older Baselines)

The following older assumptions are removed/updated across the docs and must not be reintroduced:

- Student self-registration → **parent-created child accounts**.
- Student email login → **child 8-digit ID + parent-set password** login.
- Parent/student manual linking as the main flow → **auto-link** for parent-created children (manual linking may remain only as a secondary/edge concept).
- "Discount Settings" admin module → **removed** (fixed sibling-discount business rule).
- User-selected difficulty → **server-side random mixed selection**.
- Olympiad package deletion after expiry → **archive listing + lifetime access** for purchasers.
- Parent-level paid account → **child-based subscription**.
- Kept unchanged/excluded: SMS excluded; optional bank transfer excluded; mobile future-only; Supabase/PostgreSQL source of truth; Redis optional; media in Storage; server-side payment/security.
