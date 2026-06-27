# Supabase README Run Order


## Repository Placement and Related Files

- Intended path: `supabase/README_RUN_ORDER.md`
- Folder: `supabase/`
- Primary readers: Supabase implementer, backend engineer, database architect, Claude Code
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`, `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Scope controlled by this file: Manual SQL run order and Supabase safety rules
- Source-of-truth level: Derived infrastructure execution guide


## Purpose of Root-Level `supabase/`

The `supabase/` folder is shared by Web App and Admin Panel. It contains backend/database planning and later SQL scripts for the shared Supabase project. It must not be nested inside either application.

## Why Shared

Web App and Admin Panel use the same Auth users, profiles, roles, permissions, content, tests, attempts, payments, notifications, storage buckets and audit logs. Splitting backend scripts per app would cause duplicate schemas and security drift.

## SQL File Run Order


## Canonical SQL + Migration Workflow

`supabase/sql/` uses two layers:

1. Root SQL files `001` through `013` are canonical consolidated files. They must represent the latest full database definition and should be enough to rebuild a clean database from zero.
2. `supabase/sql/migrations/` stores incremental changes made after the canonical files exist, including hotfixes, production patches, new feature schema changes, RLS fixes, indexes, and backfills.

Every migration must be backported into the relevant canonical root SQL file after validation. Production changes must be migration-script controlled. The Supabase Dashboard SQL Editor may be used in development/staging, but the repository remains the source of truth. See `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`.

| Order | File | Main responsibility | Safe to rerun? |
|---:|---|---|---|
| 001 | `supabase/sql/001_extensions_and_enums.sql` | Extensions, enum types, common domains | Mostly yes, with `if not exists` |
| 002 | `supabase/sql/002_core_profiles_roles_permissions.sql` | Profiles, roles, permissions, profile roles | Mostly yes |
| 003 | `supabase/sql/003_academic_taxonomy.sql` | Grades, subjects, topics, subtopics, schools, districts | Mostly yes |
| 004 | `supabase/sql/004_content_questions_tests.sql` | Questions, translations, options, explanations, tests | Mostly yes |
| 005 | `supabase/sql/005_attempts_daily_tasks_progress.sql` | Attempts, answers, daily tasks, progress snapshots | Mostly yes |
| 006 | `supabase/sql/006_leaderboards_analytics.sql` | Leaderboard periods, snapshots, analytics summary tables | Mostly yes |
| 007 | `supabase/sql/007_subscriptions_payments_coupons.sql` | Plans, subscriptions, payments, Stripe events, coupons | Mostly yes |
| 008 | `supabase/sql/008_notifications_support_audit.sql` | Notifications, templates, deliveries, support, audit logs | Mostly yes |
| 009 | `supabase/sql/009_storage_buckets_policies.sql` | Storage buckets and storage policies | Caution; policy conflicts possible |
| 010 | `supabase/sql/010_rls_policies.sql` | All table RLS enablement and policies | Caution; test after every run |
| 011 | `supabase/sql/011_indexes_constraints_functions_triggers.sql` | Indexes, constraints, helper functions, triggers | Mostly yes; validate trigger duplication |
| 012 | `supabase/sql/012_seed_initial_data.sql` | Initial roles, permissions, grades, subjects, settings | Yes if upsert-based |
| 013 | `supabase/sql/013_validation_queries.sql` | Read-only validation queries and smoke checks | Yes; read-only |


## Manual Supabase SQL Editor Instructions

1. Open staging Supabase first, never production first.
2. Run files in numeric order.
3. Read the header comments in each SQL file before running.
4. Do not run destructive statements unless explicitly approved.
5. After each group, run validation queries.
6. Only promote to production after staging passes RLS/RBAC tests.

## Safety Rules

- Scripts should be idempotent where safe.
- RLS must be enabled and tested before real users.
- Service role key must never be copied into frontend apps.
- Seed data must be separated from schema creation.
- Validation queries must be read-only.
- Dangerous migrations require manual confirmation and rollback plan.

## Validation Steps

- Confirm tables exist.
- Confirm enums/extensions exist.
- Confirm roles/permissions seeded.
- Confirm RLS enabled.
- Confirm student cannot read another student.
- Confirm parent cannot read unlinked student.
- Confirm Content Manager cannot read payments/audit/settings.
- Confirm Stripe webhook event idempotency uniqueness.

## Rollback Notes

For MVP planning scripts, prefer additive migrations. Rollback should usually disable new feature flags or revert app code. If schema rollback is required, create a separate reviewed rollback script, not an automatic destructive block.

## Production Caution

Before production scripts:

- Backup database.
- Confirm maintenance window.
- Confirm environment variables.
- Confirm Stripe is in correct mode.
- Confirm email provider sender domain.
- Confirm RLS validation on staging.
