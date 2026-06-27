# Future Mobile Readiness


## Repository Placement and Related Files

- Intended path: `mobile-app/markdowns/FUTURE_MOBILE_READINESS.md`
- Folder: `mobile-app/markdowns/`
- Primary readers: Future Flutter developer, backend architect, Claude Code in future mobile phase
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- Scope controlled by this file: Future mobile readiness only
- Source-of-truth level: Derived future-only readiness guide


## Mobile App Is Future-Only

Do not implement Flutter/mobile app in the current Web App/Admin Panel MVP. This file exists only to keep backend/API decisions compatible with future mobile work.

## Future Flutter Assumption

A future Flutter app will use the same Supabase backend, PostgreSQL database, Auth sessions, Storage, Edge Functions, subscriptions, progress and notification data.

## Backend/API Compatibility Requirements

- Keep service contracts clean and platform-neutral.
- Avoid Web-only assumptions in backend responses.
- Use stable IDs and typed status values.
- Keep business logic server-side.
- Support pagination and mobile-friendly payloads.

## Auth/Session Compatibility

Future mobile will authenticate with Supabase Auth. RBAC/RLS rules must be identical. Do not create separate mobile auth.

## Data Model Compatibility

Current schema must support mobile reads for tasks, tests, progress, subscription status and notifications without table rewrites.

## Future Push Notification Readiness

Current notification model should allow future `push_tokens` and `push` delivery channel. Do not implement push now.

## Offline/Weak Internet Considerations

Future mobile may cache task/test payloads and sync answers later. Current backend should use clear attempt states and idempotent submissions to support this later.

## What Not to Build Now

- No Flutter app files.
- No App Store/Google Play flows.
- No mobile-specific UI implementation.
- No push notification implementation beyond schema readiness.
- No offline sync engine now.
