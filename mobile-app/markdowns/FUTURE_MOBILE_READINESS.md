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

## Future Readiness for the Parent/Child + Subscription + Olympiad + News Model

The future mobile app must reuse the SAME backend contracts and RLS boundaries as the Web App/Admin Panel. No mobile-specific backend should be created. Readiness notes only — no current implementation:

- Parent-only registration: only parents self-register (email/password); the same registration/auth contract applies on mobile.
- Parent-created children + child login: children are created by parents and log in with a 8-digit numeric unique ID + parent-set password (no child email login). Future mobile must reuse this same child-credential approach; it must never let children self-register.
- Child-based subject subscriptions: per-child, subject-based subscriptions with launch promo (first ~1 month free), ongoing 7-day trial, and automatic fixed sibling discount (2nd child 15%, 3rd+ child 20%). Mobile reads the same subscription/access status; it must never compute or override pricing, discounts, trial dates, or access flags.
- Real payments (parent-only): activation is backend/webhook-verified only; children never purchase. Mobile must reuse the same server-side, webhook-driven activation — no client-trusted payment state.
- Olympiad Preparation packages: separate paid add-on packages with LIFETIME access for purchasers (purchased records never deleted; listings only soft-archive after the olympiad/end date). Mobile reuses the same package-purchase and lifetime-access contracts; only parents purchase.
- News (public + in-app): general news with Admin-only CRUD, images in Storage (DB stores object path/metadata only). Mobile consumes the same public/in-app news contract.
- Child dashboard wallpaper customization: child picks from a PREDEFINED wallpaper/solid-background set, saved per child profile. Mobile reuses the same predefined catalog and per-child selection; no arbitrary theming.

## Backend/API Compatibility Requirements

- Keep service contracts clean and platform-neutral.
- Avoid Web-only assumptions in backend responses.
- Use stable IDs and typed status values.
- Keep business logic server-side.
- Support pagination and mobile-friendly payloads.

## Auth/Session Compatibility

Future mobile will authenticate with Supabase Auth. RBAC/RLS rules must be identical. Do not create separate mobile auth.

## Data Model Compatibility

Current schema must support mobile reads for tasks, tests, progress, subscription status and notifications without table rewrites. This also covers the new model: parent/child profiles, the child 8-digit unique ID, per-child subject selections and subscription/trial status, sibling-discount audit fields, payment/checkout records, News and news media metadata, Olympiad packages with purchases and lifetime-access records, and per-child wallpaper selection from the predefined catalog. Future mobile reads these as-is — no mobile-specific tables.

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
