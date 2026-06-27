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
- Follow this numeric order exactly:- Canonical root SQL files live directly in `supabase/sql/`.
- Incremental migration files live in `supabase/sql/migrations/`.
- Use root SQL files for clean full database definition.
- Use migrations for hotfixes, production patches, RLS fixes, new indexes, and later database changes.
- Every accepted migration must be backported into the relevant root SQL file.
- The Supabase Dashboard SQL Editor is allowed for development/staging, but repository SQL files remain the source of truth.
- Production changes must be migration-script controlled.

  - `001_extensions_and_enums.sql`
  - `002_core_profiles_roles_permissions.sql`
  - `003_academic_taxonomy.sql`
  - `004_content_questions_tests.sql`
  - `005_attempts_daily_tasks_progress.sql`
  - `006_leaderboards_analytics.sql`
  - `007_subscriptions_payments_coupons.sql`
  - `008_notifications_support_audit.sql`
  - `009_storage_buckets_policies.sql`
  - `010_rls_policies.sql`
  - `011_indexes_constraints_functions_triggers.sql`
  - `012_seed_initial_data.sql`
  - `013_validation_queries.sql`
- Do not create destructive migrations unless explicitly approved.
- Make scripts idempotent where safe.
- Add comments to all SQL scripts.
- Include validation queries separately.

## Storage Rules

- Do not store files in PostgreSQL.
- PostgreSQL stores metadata and storage object paths only.
- Supabase Storage stores optimized images, profile avatars, question images, explanation media, and small English audio files.
- PDFs, large video libraries, and heavy media are not MVP requirements.
- Storage buckets and policies belong in `009_storage_buckets_policies.sql`.

## Security Rules

- RLS must be enabled on user/content/progress/payment/audit tables where applicable.
- Students access only their own data.
- Parents access only linked student data.
- Content Managers access only permitted content-management areas.
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
