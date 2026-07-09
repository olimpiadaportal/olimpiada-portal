# Notifications — Mobile Integration Contract

Status: the notification foundation is **implemented and mobile-ready** (DB engine
migration `2026_07_07_042`). The mobile app (React Native + Expo) needs **no schema
changes** to plug in: the in-app inbox/bell/prefs ship with the parent/student
stages (M2/M3), and PUSH is wired at stage **M4** of
`MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md`; it registers tokens and consumes
the same RPCs the web app uses. This document is the exact contract.

## 1. What already exists (server side)

- `notifications` (in-app inbox) with `idempotency_key`, `priority`, `category`,
  `action_url` (same-origin **relative** deep link), `expires_at`.
- `notification_deliveries` with channels `in_app | email | push` (the `push`
  enum value ships now).
- `notification_preferences` (`in_app_enabled / email_enabled / push_enabled`,
  parent-managed for children).
- `push_tokens` (`profile_id, token, platform ∈ {ios,android,web}, is_valid,
  failure_count, device_info, last_used_at`).
- Feature flags: `notifications` (in-app master, ON), `notifications_email` (OFF),
  `notifications_push` (OFF — flip ON at M4).
- The delivery **processor** (`web-app` BFF `POST /api/notifications/process`,
  guarded by `NOTIFICATIONS_PROCESSOR_KEY`) already claims pending deliveries and
  has a `push` branch calling `sendPushDelivery(...)` — a seam that becomes live
  once `EXPO_ACCESS_TOKEN` is set.

## 2. RPCs the mobile app calls (all via the child/parent Supabase session — RLS-scoped)

| Purpose | RPC | Notes |
|---|---|---|
| Register / refresh a device token | `upsert_push_token(p_token, p_platform, p_device)` | Call on login + on Expo token change. `platform ∈ ios/android/web`. Upserts by token; re-validates. |
| Unread badge | `get_unread_notification_count()` | Int. |
| Mark one read | `mark_notification_read(p_id)` | Owner-scoped. |
| Mark all read | `mark_all_notifications_read()` | Returns count. |
| Delete one | `delete_notification(p_id)` | Owner-scoped. |
| Read prefs | `get_notification_preferences(p_profile)` | `null` profile = self; a parent may pass a child's id. |
| Write prefs | `set_notification_preferences(p_profile, p_in_app, p_email, p_push)` | Parent-manages-child enforced in-RPC. |

Inbox list: `select ... from notifications where recipient_profile_id = <me> and
(expires_at is null or expires_at > now()) order by created_at desc` (RLS returns
only the caller's rows). **Realtime**: subscribe to `postgres_changes` INSERT on
`public.notifications` filtered `recipient_profile_id=eq.<me>` (the table is in the
`supabase_realtime` publication) for live badge + toast — identical to the web hook.

Producers (`create_notification` / `admin_send_notification`) are **service-role
only**; the mobile app never creates notifications directly (no forgery).

## 3. Token lifecycle (M4)

1. On sign-in, get the Expo push token → `upsert_push_token(token, platform, {model,…})`.
2. Enable the `notifications_push` flag + set `EXPO_ACCESS_TOKEN` on the web BFF.
3. The processor's `push` branch sends via Expo; on `DeviceNotRegistered` it should
   invalidate the token (set `is_valid=false`) — add that DB call inside
   `sendPushDelivery` when wiring Expo.

## 4. Tap routing (payload → deep link)

Every notification carries `action_url` (relative, e.g. `/child/test/result/<id>`)
and a structured `data_json`. The mobile router maps `action_url` → the matching
native route (same map the web uses). Validate it is a relative path before
navigating (reject absolute/`//`/scheme URLs), exactly like `isSafeRelativeUrl` in
`web-app/src/lib/notifications/types.ts`.

## 5. Privileged flows

Per the mobile master plan, the service-role key never ships in the app. Any
privileged notification work (if ever needed beyond these RLS-safe RPCs) goes
through a web-app BFF route under `/api/mobile/v1/*`, mirroring the existing seam.
