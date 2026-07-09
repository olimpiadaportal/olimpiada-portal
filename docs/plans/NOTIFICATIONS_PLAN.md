# NOTIFICATION MANAGEMENT — Implementation Plan

Status: PLAN (not yet implemented). Feature-flags: `notifications_email` (seeded OFF), new `notifications_push` (mobile, defer).
Reference studied: UniPrep's notification system (`side/`) — in-app inbox + realtime, admin composer, async queue/processor, idempotency layers, Expo push, SMTP email. We PORT the good ideas and **collapse UniPrep's ~17-table sprawl** into a small native design. No code copied. **No SMS** (product rule).

---

## 1. Goal

A professional, secure, idempotent notification system:
- **In-app notification center** (parent + child) with unread badge + realtime + toasts.
- **Admin send module** (compose → audience → template → send/schedule → delivery history).
- **Event-driven notifications** (subscription expiring/failed, News published, olympiad purchased, attempt graded, giveaway ending, daily reminder…).
- **Multi-channel foundation**: in-app now, **email** (optional MVP), **push** (mobile-stage ready). Designed for idempotency/at-most-once from day one.

## 2. Current state (what we already have)

Fully modeled in SQL but **100% dormant** (`supabase/sql/008`):
- `notifications` (in-app inbox: `recipient_profile_id`, `type`, `title`, `body`, `data_json`, `read_at`), `notification_deliveries` (per-channel `status`, `provider_ref`, `error_text`), `notification_templates` (`(code,locale)` unique), `support_requests`. Enums `notification_channel` (in_app, email) + `delivery_status` (`001`). Complete RLS (`010`). Index on recipient.
- **Nothing sends, reads, or renders a notification.** `notifications_email` flag only gates `canSendEmailNotifications()` (zero callers).
- Reusable assets: `writeAuditLog` pattern (`admin-panel/src/lib/admin/audit.ts`), flag-gating (`flags.ts`), the mobile master plan §10 which already **designed `push_tokens`** + categories/channels + the admin "Send notification" module + payload→deeplink contract.
- **Child identity works in RPCs** (real auth users) → per-user RLS + Realtime channels work for both parents and children.

## 3. Architecture (native, minimal, one consistent path)

Avoid UniPrep's biggest wart (admin broadcasts bypass the queue while events use it). **One producer contract:** everything that creates a notification calls a single `SECURITY DEFINER` **`enqueue_notification(...)`** (or `admin_send_notification` for broadcasts) that inserts the `notifications` row(s) **idempotently**. Delivery beyond in-app (email/push) is fanned out by a **processor** reading `notification_deliveries`.

```
producers ──► create_notification RPC ──► notifications (in-app, idempotency_key UNIQUE)
   │                                          │
   │                                          └─► notification_deliveries (one per extra channel: email/push, status='pending')
   │
   ├─ admin composer (broadcast to an audience)
   └─ event generators (subscription/News/olympiad/attempt/giveaway/daily)

processor (BFF route, cron + API-key) ──► claims pending deliveries (FOR UPDATE SKIP LOCKED)
                                          ├─ email  → SMTP (Brevo/…) [flag notifications_email]
                                          └─ push   → Expo [flag notifications_push, mobile stage]
in-app center ◄─ Supabase Realtime per-user channel + toast-on-insert; mark-read via RPC
```

**MVP recommendation:** ship **in-app only** first (no processor needed — the RPC inserts the row, Realtime delivers it). Add the `notification_deliveries` processor for **email** as a fast-follow, and **push** when the mobile app is built. This keeps MVP simple while the schema is push/email-ready.

## 4. Data model (extend `008`, migration `0XX_notifications_engine.sql`)

Additive to the existing tables (non-destructive):
```
alter table public.notifications add column
  idempotency_key text unique,        -- at-most-once (type:recipient:entity:minute)
  priority int not null default 5,    -- 1..10
  category text,                       -- grouping / filter
  action_url text,                     -- same-origin relative deep link
  expires_at timestamptz;
-- add 'push' to notification_channel enum (additive)
-- new: admin broadcast record + per-recipient tracking (small, not UniPrep's 17 tables)
create table public.admin_notifications (
  id uuid pk, actor_profile_id uuid → profiles, title text, body text,
  channels text[] not null default '{in_app}',
  audience_type text not null,        -- 'all_parents'|'all_children'|'parent'|'by_subject'|'individual'
  audience_filter jsonb not null default '{}',
  status text not null default 'sent',-- draft|scheduled|sending|sent|failed
  total_recipients int default 0, delivered_count int default 0, failed_count int default 0,
  scheduled_at timestamptz, sent_at timestamptz, created_at timestamptz default now()
);
-- per-user notification prefs (coarse v1; per-type later)
create table public.notification_preferences (
  profile_id uuid pk → profiles on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled  boolean not null default true,
  push_enabled   boolean not null default true,
  quiet_hours_start int, quiet_hours_end int,   -- optional
  updated_at timestamptz default now()
);
-- push tokens: schema from mobile master plan §10 — CREATE now (empty) or defer to mobile stage.
create table public.push_tokens (
  id uuid pk, profile_id uuid → profiles on delete cascade,
  token text unique not null, platform text check (platform in ('ios','android','web')),
  is_valid boolean not null default true, failure_count int not null default 0,
  last_used_at timestamptz, device_info jsonb, created_at timestamptz default now()
);
```
Seed `notification_templates` with trilingual per-type copy (`(code, locale)` already unique) for each event type — `subject_expiring`, `subject_charge_failed`, `news_published`, `olympiad_purchased`, `attempt_graded`, `giveaway_ending`, `daily_reminder`, `admin_announcement`, … Each row: `subject`, `body` with `{{var}}` placeholders.

## 5. RPCs (all `SECURITY DEFINER`, authorize first)

- **`create_notification(p_recipient, p_type, p_title, p_body, p_data, p_channels, p_idempotency_key, p_priority, p_action_url)`** — the single insert path. `ON CONFLICT (idempotency_key) DO NOTHING` (at-most-once). Inserts the `notifications` row + one `notification_deliveries` row per non-in-app channel (`status='pending'`). Called by event generators and the broadcast RPC. **No end-user grant** — service-role / other DEFINER RPCs only (users can never forge notifications).
- **`admin_send_notification(p_actor, p_title, p_body, p_channels, p_audience_type, p_audience_filter, p_scheduled_at)`** — `requireAdmin`-gated (re-checks admin role in-body), inserts `admin_notifications`, resolves the audience (all parents / all children / one parent / by-subject children / individual), loops recipients calling `create_notification` with a per-recipient idempotency key + `{{var}}` substitution, updates counters. Audited via `writeAuditLog` (metadata only — never bodies/PII).
- **`mark_notification_read(p_id)` / `mark_all_read()`** — owner-checked; the ONLY way to flip `read_at` (avoids UniPrep's column-unrestricted UPDATE policy). Grant to `authenticated`.
- **`get_target_count(p_audience_type, p_audience_filter)`** — admin-gated audience preview count.
- **Processor** (BFF, service-role): `claim_pending_deliveries(p_limit, p_worker)` (`FOR UPDATE SKIP LOCKED`, service-role only), then email/push per delivery with idempotency + retry/backoff (`retry_count`, `scheduled_at = now + retry*60s`, max 3) → `sent`/`failed`.

**Idempotency key formula:** `type || ':' || recipient_profile_id || ':' || COALESCE(entity_id,'') || ':' || date_trunc('minute', now())` (same event to same user within a minute deduped) — plus the `UNIQUE` backstop.

## 6. Security posture (the important part)

- **No client INSERT on `notifications`** — RLS SELECT/own, no INSERT for end users; only `SECURITY DEFINER` RPCs (which run as service-role effectively) create rows → users cannot forge notifications (UniPrep does this right; keep it).
- **Mark-read via RPC** (not a broad UPDATE policy) so a user can only flip `read_at` on their own rows, nothing else.
- **Admin send** = `requireAdmin` + new permission `notifications.send` (Content Managers excluded, like News) + in-RPC admin re-check + **audit every send**.
- **Service-role key stays server-only** in the web-app BFF processor (never in clients) — consistent with our Round-7 rules and the service-role-key hosting ADR.
- **Idempotency + atomic claim** prevent duplicate/replayed sends (in-app UNIQUE key; delivery claim `SKIP LOCKED`; push dedup row before send).
- **PII-safe:** email is fetched on demand (not stored in notifications); audit logs carry title/channels/audience/count only, never bodies. Email `{{email}}` substitution masked.
- **Rate-limit / quiet-hours** (optional): a `can_send_smart_notification`-style composite gate (enabled? quiet hours? rate limit? duplicate?) for email/push volume control — defer to a later stage if not needed for MVP.

## 7. Web UI

- **In-app center** (parent + child): a bell in each shell nav with an unread badge, a dropdown (latest N + "See all"), a full `/notifications` page (list, filters by category, mark-read/mark-all, delete), per-type icon, relative time, deep-link on click (same-origin `action_url`). Powered by a `notifications` service + `useNotifications` hook + **Supabase Realtime** per-user channel (`recipient_profile_id = current`) + **toast-on-insert**. Trilingual, both themes + `.arena` scope.
- **Admin composer** (`admin-panel`): compose form (template picker, title ≤100, body ≤500, channel toggles, audience selector with live recipient count, optional schedule, live preview) → `admin_send_notification` → audit. **History table** (past broadcasts, status, delivery progress bar, detail modal with counters). **Templates** CRUD. **Settings** (retention days, max/user, channel master switches). All Admin-only + audited.

## 8. Event generators (which app events create notifications)

Server actions/RPCs call `create_notification` idempotently at these events (each with a trilingual template):
- Subscription: **trial/period ending soon**, **charge failed / access blocked**, **subscription canceled** (ties into the launch-blocker access-recompute job in the backlog).
- **News published** (to parents/children who opted in).
- **Olympiad package purchased** (to the child + parent).
- **Attempt graded** / new personal best / streak milestone (ties into LEADERBOARD_PLAN + TEST_ENGINE_PLAN).
- **Giveaway ending soon**.
- **Daily task available / reminder** (ties into TEST_ENGINE_PLAN daily tasks).
- **Admin announcement** (broadcast).

## 9. Mobile readiness (push)

Everything is already push-ready: `push_tokens` (schema from mobile master plan §10), `notification_deliveries` with a `push` channel, the payload→deeplink contract, the `notifications_push` flag. When the mobile app reaches stage **M4** (of the restructured `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md`), it registers Expo tokens (`upsert_push_token` RPC), the processor's push branch sends via Expo with dedup + token hygiene (`update_token_usage`, invalidate `DeviceNotRegistered`), and tap-routing uses the same `action_url`. No web-push in v1.

## 10. Owner decisions (resolve when we start this plan)

1. **MVP channels:** in-app only (recommended first), or in-app + email now? (Decides whether the processor + SMTP provider are in the first cut.)
2. **Email provider:** Brevo (UniPrep's) or another SMTP? Confirm; email bodies fully trilingual.
3. **Audience model:** confirm `all parents / all children / one parent / by subject / individual`; do children receive admin broadcasts directly, or only via their parent? Parent visibility of child-directed notifications?
4. **Preferences depth:** coarse per-channel toggles (recommended v1) vs granular per-type + quiet hours. Parents managing children's prefs?
5. **Retention:** adopt `retention_days` + `max_per_user` auto-prune? values?
6. **Async vs inline for email:** queue+processor+cron (robust) vs inline send in the creating action (simpler, low volume). Recommend queue only once email/push are in scope; cron via web-app BFF route + API key (or pg_cron + pg_net).
7. **Push timing:** confirm push is deferred to the mobile M4 stage (recommended).

## 11. Staged implementation

- **N0 — DB engine**: extend `notifications` (idempotency/priority/category/action_url) + `admin_notifications` + `notification_preferences` + `push_tokens` (schema) + trilingual template seeds + `create_notification`/`admin_send_notification`/`mark_read` RPCs + `notifications.send` permission + RLS hardening. Backports + `013` checks; smoke-test idempotency (double-send deduped) + no client forge + mark-read scoping; from-zero rebuild.
- **N1 — In-app center (web)**: parent + child bell + page + service + hook + Realtime + toast, trilingual, behind a flag.
- **N2 — Admin send module**: composer + audience + templates + history + settings + audit.
- **N3 — Event generators**: wire the §8 events (idempotent) with templates.
- **N4 — Email channel** (optional): processor + SMTP + trilingual email templates + prefs/quiet-hours gate, behind `notifications_email`.
- **N5 — Push** (mobile stage M4): `push_tokens` registration + Expo processor branch + tap-routing, behind `notifications_push`.

Each stage: typecheck+build both apps, dev migration + backport + `013`, non-destructive from-zero rebuild, trilingual, audit on admin mutations, STATUS + MANUAL_TESTING_GUIDE updates.
