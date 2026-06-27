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

- Supabase Auth for email/password.
- No SMS OTP.
- Profiles and roles in application tables.
- Admin/Content Manager accounts created by admin/seed.
- Parent/student linking in database.

## Database Strategy

- PostgreSQL source of truth.
- Tables split by SQL run-order files.
- RLS on all sensitive tables.
- Snapshots for progress/leaderboard.
- Audit logs append-only.

## Storage Strategy

- Supabase Storage buckets for optimized question images, small audio files, avatars and temporary admin imports.
- PostgreSQL stores only file metadata and object paths, never binary image/audio data.
- Policies in `009_storage_buckets_policies.sql`.
- Private files use signed URLs.
- Resize/compress images and enforce audio/file size limits.
- Large PDFs, video lessons and large media libraries are not MVP storage requirements.

## Edge Functions Strategy

Use Edge Functions for:

- Stripe webhooks.
- Subscription activation.
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
