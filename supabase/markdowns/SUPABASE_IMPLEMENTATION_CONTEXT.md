# Supabase Implementation Context


## Repository Placement and Related Files

- Intended path: `supabase/markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md`
- Folder: `supabase/markdowns/`
- Primary readers: Claude Code, Supabase implementer, backend engineer
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- Scope controlled by this file: Supabase project implementation context
- Source-of-truth level: Derived backend execution guide


## Supabase Project Purpose

Supabase is the shared backend for Web App and Admin Panel. It provides PostgreSQL, Auth, Storage, Edge Functions, RLS and scheduled jobs where needed.

## Shared Backend Ownership

All data belongs to the root platform backend. Do not create app-specific separate databases. Both apps must consume the same source of truth through RLS-safe clients and server-side service functions.

## Auth Strategy

- **Parent-only self-registration** via Supabase Auth email/password. Children never self-register.
- **Child credential strategy:** each child logs in with a server-generated **8-digit numeric unique ID** + a **parent-set password** (no email login). The 8-digit ID is generated server-side, zero-padded, collision-safe, with a DB unique constraint. Child credential creation/verification (custom child-credential record or server-provisioned mapped Auth identity) is server-side only; the parent sets/resets the child's password.
- No SMS OTP.
- Profiles and roles in application tables; parent vs child profile distinction.
- Admin/Content Manager accounts created by admin/seed.
- Parent→child links are auto-created when a parent creates a child (no manual linking as the primary flow).

## Database Strategy

- PostgreSQL source of truth.
- Tables split by SQL run-order files; canonical files now run `001`–`015` (validation `013` runs last). New domains: `014_news.sql`, `015_olympiad_preparation.sql`.
- New/extended tables across the run order:
  - Parent and child/student profiles; child 8-digit unique ID; child credential record; per-child subject selections; predefined wallpapers catalog + per-child wallpaper/background selection (extend `002`).
  - Child-based subscriptions (per child: subjects, weekly/monthly/yearly duration, status, access flag); subject-based pricing config; trial start/end dates; launch-promo config; payment records; checkout sessions; sibling-discount calc/audit fields (extend `007`).
  - News articles + news media metadata (`014`).
  - Olympiad packages, grade/class targeting, question pools, package purchases (lifetime access), package attempts, random 25-question selection records, package archive status (`015`).
- RLS on all sensitive tables (parent/child boundaries, payment service-role-only, News admin-only, olympiad lifetime-access).
- Snapshots for progress/leaderboard.
- Audit logs append-only.

## Storage Strategy

- Supabase Storage buckets for optimized question images, small audio files, avatars and temporary admin imports.
- New buckets: `wallpaper-assets` (predefined child dashboard wallpapers/backgrounds), `news-media` (News images), `olympiad-media` (Olympiad package banners/images). Uploads to all three are admin-only; published News/wallpaper assets may be public-read.
- PostgreSQL stores only file metadata and object paths, never binary image/audio data.
- Policies in `009_storage_buckets_policies.sql` (extended for the new buckets).
- Private files use signed URLs.
- Resize/compress images and enforce audio/file size limits.
- Large PDFs, video lessons and large media libraries are not MVP storage requirements.

## Edge Functions Strategy

Use Edge Functions for:

- Payment/Stripe webhooks (backend/webhook-verified activation only; never from client redirects).
- Child subscription activation and auto-blocking of all paid child access on failed charge after trial/renewal.
- Server-side generation of the collision-safe 8-digit child ID.
- Backend computation of subject pricing, sibling discount (2nd 15% / 3rd+ 20%), trial/launch-promo evaluation, and proration on later subject additions.
- Server-side random 25-question selection for normal tests and olympiad attempts (new random mix each attempt; if fewer than 25 exist, use available).
- Olympiad package purchase fulfilment granting lifetime access and listing auto-archive after the olympiad/end date.
- Leaderboard recalculation.
- Progress snapshot jobs.
- Notification dispatch.
- Admin-only privileged operations when needed.

## Environment Strategy

Local, staging and production must have separate variables. Service role key is server/Edge-only.

## Required Master Docs Before Implementation

- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `docs/master/06_CORE_MODULES_PAYMENTS_LEADERBOARD_NOTIFICATIONS_ANALYTICS.md`
- `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`

## What Claude Code Must Not Do

- Do not generate SQL inside `web-app/` or `admin-panel/`.
- Do not expose service role key.
- Do not skip RLS validation.
- Do not use SMS.
- Do not make Redis required.
- Do not activate subscriptions from client redirects.
- Do not let children self-register, log in by email, or initiate any purchase/checkout.
- Do not trust a client-provided 8-digit child ID, price, discount, selected subjects, trial dates, subscription status, or access flag.
- Do not delete purchased olympiad packages or payment/purchase records — archive listings only.
- Do not let Content Managers manage News, Olympiad Preparation, or payment/subscription modules.
- Do not add a Discount-Settings admin module — the sibling discount is fixed in business logic.
- Do not implement user-selected difficulty — selection is server-side and auto-mixed.
