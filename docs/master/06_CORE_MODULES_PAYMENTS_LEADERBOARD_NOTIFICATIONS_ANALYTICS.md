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

### Plans

- Weekly.
- Monthly.
- Yearly.
- Optional trial period if approved.
- Plan records are admin-managed in `subscription_plans`.

### Checkout Flow

1. User selects plan.
2. Server creates Stripe Checkout session.
3. User completes card payment on Stripe-hosted page.
4. Stripe sends verified webhook.
5. `payment_events` stores event for idempotency.
6. `payments` status updates.
7. `subscriptions` activate or renew.
8. User receives in-app/email confirmation.

### Payment Status Flow

| Status | Meaning |
|---|---|
| `pending` | Payment session created, not confirmed |
| `succeeded` | Verified webhook succeeded |
| `failed` | Payment failed |
| `refunded` | Refund recorded if later enabled |
| `cancelled` | Checkout abandoned/cancelled |

### Subscription Gating

Access checks must be server-side. A student/parent should never unlock content based on client state. Subscription records may be owned by parent and applied to student.

### Failed Payment Handling

- Show clear failure state.
- Do not activate subscription.
- Store failure event.
- Allow retry.
- Email/in-app notification only.

### Coupons/Promo Codes

Coupon support may be MVP if needed. Must validate server-side, enforce expiration, usage limits, one-use-per-user rules and audit admin-created coupons.

### SQL Files

- `007_subscriptions_payments_coupons.sql` creates payment/subscription/coupon tables.
- `008_notifications_support_audit.sql` supports payment notifications and audit.
- `010_rls_policies.sql` protects financial data.
- `013_validation_queries.sql` validates webhook idempotency and subscription gating.

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
- Subscription expiring.
- Payment successful.
- New olympiad test active.
- Support request updated.

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

- Avoid sensitive student details in email subject lines.
- Parent reports may include student data only to linked parent.
- Admin broadcasts require permission and audit.

### SQL Files

- `008_notifications_support_audit.sql`
- `010_rls_policies.sql`
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
- Subscription activity.
- Most solved tasks.
- Hardest/high-error questions.

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
