# Supabase SQL Database Versioning Workflow

## Repository Placement and Related Files

- Intended path: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- Folder: `supabase/sql/`
- Primary readers: project owner, Supabase implementer, database engineer, Claude Code
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `supabase/README_RUN_ORDER.md`, `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Scope controlled by this file: how canonical SQL files and incremental migrations are created, applied, backported, validated, and promoted to production
- Source-of-truth level: derived database execution rule; it does not replace master docs, but it controls database change workflow

## Core Principle

The project uses a two-layer SQL workflow:

1. **Canonical root SQL files** in `supabase/sql/` are the current full database definition, grouped into clean responsibility-based files.
2. **Incremental migration files** in `supabase/sql/migrations/` are the historical change files used for staged changes, hotfixes, production patches, and new database logic added after the initial foundation.

The canonical SQL files must always be kept updated. If the database is ever lost or a new environment is created, the project should be able to recreate the full current schema by running the canonical root SQL files in numeric order.

## Approved Folder Structure

```text
supabase/sql/
├── README_DATABASE_VERSIONING_WORKFLOW.md
├── 001_extensions_and_enums.sql
├── 002_core_profiles_roles_permissions.sql
├── 003_academic_taxonomy.sql
├── 004_content_questions_tests.sql
├── 005_attempts_daily_tasks_progress.sql
├── 006_leaderboards_analytics.sql
├── 007_subscriptions_payments_coupons.sql
├── 008_notifications_support_audit.sql
├── 009_storage_buckets_policies.sql
├── 010_rls_policies.sql
├── 011_indexes_constraints_functions_triggers.sql
├── 012_seed_initial_data.sql
├── 014_news.sql
├── 015_olympiad_preparation.sql
├── 016_scheduled_jobs.sql
├── 013_validation_queries.sql   # runs LAST (read-only), after 014/015/016
└── migrations/
    ├── README_MIGRATIONS.md
    ├── 2026_06_27_001_auth_user_provisioning.sql
    └── ...                       # chronological change log, already backported above
```

The root SQL files are canonical. The migration files are the chronological change log.

## What Goes Into Root SQL Files

Root SQL files contain the latest consolidated version of the database.

Use them for:

- clean new environment setup
- development reset
- staging rebuild
- production bootstrap before public launch
- disaster recovery planning
- documentation of the final intended database shape

Root files should be grouped by responsibility, not by random development order.

## What Goes Into `migrations/`

Migration files contain incremental changes applied after the relevant root SQL file already exists.

Use migrations for:

- hotfixes
- schema changes after initial setup
- new feature database changes
- production-safe patches
- RLS fixes
- index additions
- trigger/function updates
- seed corrections
- data backfills

Do not apply untracked SQL directly in the Supabase Dashboard without also saving it as a migration file.

## Backport Rule

Every successful migration must be backported into the relevant canonical root SQL file.

Example:

- A migration adds an index to improve question search.
- The migration file is saved as `supabase/sql/migrations/2026_01_15_001_add_question_search_index.sql`.
- After it is tested, the same final index definition is added to `supabase/sql/011_indexes_constraints_functions_triggers.sql`.
- `STATUS.md` is updated to say the migration was applied and backported.

If a migration is not backported, the repository is no longer able to recreate the current database from zero. That is not allowed.

## Development Workflow

1. For a new database foundation, create or update the canonical root SQL files.
2. Run them in development/staging Supabase in numeric order.
3. Run `013_validation_queries.sql`.
4. If changes are made later, create a migration file inside `supabase/sql/migrations/`.
5. Apply the migration to the development/staging Supabase project.
6. Validate the result.
7. Backport the final SQL into the correct canonical root SQL file.
8. Update `STATUS.md` with:
   - migration file name
   - affected root SQL file
   - environment applied to
   - validation result
   - rollback note

## Production Workflow

**First-time production build (bootstrap):** production does not exist yet. When the production Supabase project is created, build its schema by running the **canonical root SQL files in numeric order** — `001` → `012`, then `014`, `015`, `016`, then `013` (validation) last. Do **not** replay the files in `supabase/sql/migrations/` against a fresh production DB: every migration is already backported into the canonical files, so replaying them would double-apply changes. Enable the `pg_cron` extension (Supabase Dashboard → Database → Extensions) before running `016`, or re-run `016` after enabling it, so the cron jobs actually register. Full step-by-step: see "First-Time Production Database Build" in `supabase/README_RUN_ORDER.md`.

**Ongoing changes after production is live** must be migration-controlled.

Before production:

1. Test the migration in development/staging.
2. Confirm the migration is committed in `supabase/sql/migrations/`.
3. Confirm the change is backported into the canonical root SQL file.
4. Run validation queries in staging.
5. Take a production backup or confirm Supabase backup state.
6. Apply only the reviewed migration to production.
7. Run production validation queries.
8. Update `STATUS.md`.

Do not experiment directly in production SQL editor.

## Migration Naming Convention

Use:

```text
YYYY_MM_DD_NNN_short_description.sql
```

Examples:

```text
2026_01_15_001_add_question_review_indexes.sql
2026_01_18_001_fix_parent_student_rls.sql
2026_02_02_001_add_subscription_grace_period.sql
```

Rules:

- `YYYY_MM_DD` is the date the migration is created.
- `NNN` starts at `001` for that date.
- Description uses lowercase snake_case.
- File name should clearly describe the change.

## Migration File Header Template

Every migration must start with this header:

```sql
-- Migration: YYYY_MM_DD_NNN_short_description.sql
-- Purpose: Explain why this change exists.
-- Environment first applied: development | staging | production
-- Related root SQL file(s): supabase/sql/0xx_file_name.sql
-- Backport status: pending | completed
-- Destructive change: no | yes
-- Rollback notes: Explain safe rollback or why rollback is not trivial.
```

## Destructive Change Rule

Destructive changes require explicit human approval.

Destructive changes include:

- `drop table`
- `drop column`
- `drop type`
- irreversible `delete`
- irreversible data transformation
- RLS removal or broadening access
- disabling audit logs
- changing payment/subscription event uniqueness

Prefer additive migrations.

## Supabase Dashboard Rule

Using the Supabase Dashboard SQL Editor is acceptable for development and staging.

But every SQL change must be copied into the repository:

- root SQL file if it is part of the initial canonical schema
- migration file if it is an incremental change
- both migration and root SQL file if it was applied after the root file existed

The dashboard is not the source of truth. The repository is the source of truth.

## Validation Rule

After every schema or policy change, run validation queries covering:

- table existence
- enum existence
- required indexes
- RLS enabled
- policy existence
- student ownership restrictions
- parent linked-student restrictions
- content manager restrictions
- payment event idempotency
- storage bucket/policy checks

Validation queries belong in `013_validation_queries.sql`. Temporary migration-specific validation can also be included at the bottom of a migration file as comments.

## Status Tracking Rule

After any database work, update root `STATUS.md` with:

- created/changed SQL files
- migration file name if used
- root SQL files backported
- environment applied to
- validation queries run
- test result
- blockers
- next database task

## Final Rule

The database must be easy to rebuild from scratch and safe to change in production.

That means:

- root SQL files stay clean and current
- migrations preserve history
- all dashboard changes are captured
- production is never changed by undocumented manual SQL
