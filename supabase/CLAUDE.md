# CLAUDE.md — Supabase Instructions

## Scope

This file applies to work inside `supabase/`.

Supabase is the shared backend for both:

- `web-app/`
- `admin-panel/`

It owns PostgreSQL schema, Supabase Auth assumptions, RLS, Storage policies, Edge Function planning, audit logging, validation queries, seed data, and SQL run order.

## First Steps

Before Supabase work:

1. Open root `STATUS.md`.
2. Confirm the active stage is Supabase/database/security related.
3. Read:
   - `../IMPLEMENTATION_EXECUTION_PLAN.md`
   - `../docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
   - `../docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
   - `markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md`
   - `markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
   - `markdowns/SUPABASE_SQL_RUN_ORDER.md`
   - `README_RUN_ORDER.md`
   - `sql/README_DATABASE_VERSIONING_WORKFLOW.md`
   - `sql/migrations/README_MIGRATIONS.md`

## SQL Rules

- SQL files must be created only in `supabase/sql/`.
- Canonical root SQL files live directly in `supabase/sql/`.
- Incremental migration files live in `supabase/sql/migrations/` (timestamped `YYYY_MM_DD_NNN`; the series already runs `2026_06_27_001`..`005`).
- Use root SQL files for clean full database definition.
- Use migrations for hotfixes, production patches, RLS fixes, new indexes, and later database changes. New business-requirement extensions to existing files (`002`/`007`/`009`/`010`/`011`/`012`/`013`) land as migrations first, then get backported.
- Every accepted migration must be backported into the relevant root SQL file.
- The Supabase Dashboard SQL Editor is allowed for development/staging, but repository SQL files remain the source of truth.
- Production changes must be migration-script controlled.
- Follow this numeric run order exactly (canonical files `001`–`016`; validation `013` runs LAST):

  - `001_extensions_and_enums.sql`
  - `002_core_profiles_roles_permissions.sql` — also parent/child profiles, child 8-digit unique ID, child credential strategy, per-child subject selections, wallpapers catalog + per-child selection
  - `003_academic_taxonomy.sql`
  - `004_content_questions_tests.sql`
  - `005_attempts_daily_tasks_progress.sql`
  - `006_leaderboards_analytics.sql`
  - `007_subscriptions_payments_coupons.sql` — also child-based subscriptions, subject pricing, trial/launch-promo config, payments, checkout sessions, sibling-discount audit fields
  - `008_notifications_support_audit.sql`
  - `009_storage_buckets_policies.sql` — also `wallpaper-assets`, `news-media`, `olympiad-media` buckets/policies
  - `010_rls_policies.sql` — also parent/child + News/Olympiad/payment module boundaries
  - `011_indexes_constraints_functions_triggers.sql` — also 8-digit ID generator, sibling-discount/trial helpers, random 25-question selection helper
  - `012_seed_initial_data.sql` — also wallpapers, pricing/trial/promo config, News/Olympiad permissions
  - `014_news.sql` — News articles + media metadata (Admin-only CRUD; public/in-app read)
  - `015_olympiad_preparation.sql` — Olympiad packages, grade/class targeting, question pools, purchases (lifetime access), attempts, random-selection records, archive status
  - `016_scheduled_jobs.sql` — pg_cron maintenance schedules (grade promotion, child-access recompute, stale test-attempt expiry); self-skips where pg_cron is absent
  - `013_validation_queries.sql` — runs LAST, after `014`/`015`/`016`
- Table groups and which file they belong to:
  - Core identity + parent/child accounts, child 8-digit ID, credentials, subject selections, wallpapers → `002`.
  - Child-based subscriptions, subject pricing, trial/launch-promo, payments, checkout, sibling-discount audit → `007`.
  - News + news media metadata → `014`.
  - Olympiad packages/pools/purchases/attempts/lifetime-access/archive → `015`.
- New canonical data files are numbered `014`+; the read-only validation file `013` always runs last.
- Difficulty (easy/medium/hard) stays in the data model but is server-side auto-mixed; never user-selected.
- Do not create destructive migrations unless explicitly approved. Never delete purchased olympiad packages or payment/purchase records — archive listings only.
- Make scripts idempotent where safe.
- Add comments to all SQL scripts.
- Include validation queries separately.

## Storage Rules

- Do not store files in PostgreSQL.
- PostgreSQL stores metadata and storage object paths only.
- Supabase Storage stores optimized images, profile avatars, question images, explanation media, and small English audio files.
- New buckets: `wallpaper-assets` (predefined child dashboard wallpapers/backgrounds), `news-media` (News images), `olympiad-media` (Olympiad package banners/images). Uploads admin-only; DB stores object path/metadata only.
- PDFs, large video libraries, and heavy media are not MVP requirements.
- Storage buckets and policies belong in `009_storage_buckets_policies.sql`.

## Security Rules

- RLS must be enabled on user/content/progress/payment/audit/news/olympiad tables where applicable.
- Children access only their own data; a child reads only its own profile/content.
- Parents access/manage only their own (auto-linked) children; children never self-register or log in by email.
- Children can never purchase, check out, or edit any payment/subscription/access row; all purchases originate from the parent account.
- Subscription activation, blocking, price, discount, trial dates, and access flags are backend/webhook-verified and service-role-only — never client-writable.
- The 8-digit child ID is server-generated, unique, and collision-safe; never trust a client-provided ID.
- Sibling discount is a fixed business rule (2nd 15% / 3rd+ 20%) — no Discount-Settings admin module.
- Only Administrators manage News, Olympiad Preparation packages/pools, and payment/subscription modules.
- Content Managers access only permitted content-management areas and must NOT manage News, Olympiad Preparation, or payment/subscription modules.
- Purchased olympiad packages keep lifetime access and remain readable after listing archive.
- Administrators access platform management areas, but sensitive actions must be audited.
- Never expose service role key to browser/client code.

## Status Update Requirement

After Supabase work, update root `STATUS.md` with:

- SQL files created/changed
- migration file name if an incremental change was made
- canonical root SQL file backported
- RLS policies created/changed
- storage policies created/changed
- environment applied to: local, development, staging, or production
- validation queries run
- unresolved risks
- next SQL file to implement
