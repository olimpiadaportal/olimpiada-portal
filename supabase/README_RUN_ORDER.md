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

1. Root SQL files `001` through `015` are canonical consolidated files. They must represent the latest full database definition and should be enough to rebuild a clean database from zero. Files `001`–`013` already exist and are applied; `014_news.sql` and `015_olympiad_preparation.sql` are the new canonical domains for News and the Olimpiada Hazırlığı / Olympiad Preparation module.
2. `supabase/sql/migrations/` stores incremental changes made after the canonical files exist, including hotfixes, production patches, new feature schema changes, RLS fixes, indexes, and backfills. The series already runs `2026_06_27_001`..`005`; new business-requirement extensions to existing files (002/007/009/010/011/012/013) land here first as `YYYY_MM_DD_NNN` migrations, then get backported.

Every migration must be backported into the relevant canonical root SQL file after validation. Production changes must be migration-script controlled. The Supabase Dashboard SQL Editor may be used in development/staging, but the repository remains the source of truth. See `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`.

Business modules added by the new requirements (and where they live):

- Parent vs child profiles, child 8-digit unique ID, child credential strategy, per-child subject selections, predefined wallpapers catalog + per-child selection → **extend `002`**.
- Child-based subscriptions, subject pricing, trial + launch-promo config, payments, checkout sessions, sibling-discount audit fields → **extend `007`**.
- `wallpaper-assets`, `news-media`, `olympiad-media` storage buckets/policies → **extend `009`**.
- Parent/child + business-module RLS → **extend `010`**.
- News articles + media metadata → **new `014_news.sql`**.
- Olympiad packages, grade/class targeting, question pool, purchases (lifetime access), attempts, random-selection records, archive status → **new `015_olympiad_preparation.sql`**.

| Order | File | Main responsibility | Safe to rerun? |
|---:|---|---|---|
| 001 | `supabase/sql/001_extensions_and_enums.sql` | Extensions, enum types, common domains (+ subscription duration/status, payment status, olympiad/news status, retained question-difficulty enums) | Mostly yes, with `if not exists` |
| 002 | `supabase/sql/002_core_profiles_roles_permissions.sql` | Profiles, roles, permissions, profile roles (+ parent/child profiles, child 8-digit unique ID, child credential strategy, per-child subject selections, wallpapers catalog + per-child selection) | Mostly yes |
| 003 | `supabase/sql/003_academic_taxonomy.sql` | Grades, subjects, topics, subtopics, schools, districts (four MVP subjects) | Mostly yes |
| 004 | `supabase/sql/004_content_questions_tests.sql` | Questions, translations, options, explanations, tests (difficulty retained, never user-selected) | Mostly yes |
| 005 | `supabase/sql/005_attempts_daily_tasks_progress.sql` | Attempts, answers, daily tasks, progress snapshots (server-side random 25-question selection) | Mostly yes |
| 006 | `supabase/sql/006_leaderboards_analytics.sql` | Leaderboard periods, snapshots, analytics summary tables | Mostly yes |
| 007 | `supabase/sql/007_subscriptions_payments_coupons.sql` | Plans, subscriptions, payments, Stripe events, coupons (+ child-based subscriptions, subject pricing, trial/launch-promo config, payments, checkout sessions, sibling-discount audit fields) | Mostly yes |
| 008 | `supabase/sql/008_notifications_support_audit.sql` | Notifications, templates, deliveries, support, audit logs | Mostly yes |
| 009 | `supabase/sql/009_storage_buckets_policies.sql` | Storage buckets and storage policies (+ `wallpaper-assets`, `news-media`, `olympiad-media` buckets) | Caution; policy conflicts possible |
| 010 | `supabase/sql/010_rls_policies.sql` | All table RLS enablement and policies (+ parent/child + News/Olympiad/payment module boundaries) | Caution; test after every run |
| 011 | `supabase/sql/011_indexes_constraints_functions_triggers.sql` | Indexes, constraints, helper functions, triggers (+ 8-digit ID generator, sibling-discount/trial helpers, random-selection helper) | Mostly yes; validate trigger duplication |
| 012 | `supabase/sql/012_seed_initial_data.sql` | Initial roles, permissions, grades, subjects, settings (+ wallpapers, pricing/trial/promo config, News/Olympiad permissions) | Yes if upsert-based |
| 014 | `supabase/sql/014_news.sql` | **NEW.** News articles + media metadata; public/in-app read, Admin-only CRUD | Mostly yes |
| 015 | `supabase/sql/015_olympiad_preparation.sql` | **NEW.** Olympiad packages, grade/class targeting, question pool, purchases (lifetime access), attempts, random-selection records, archive status | Mostly yes |
| 013 | `supabase/sql/013_validation_queries.sql` | Read-only validation queries and smoke checks — runs **LAST**, after `014`/`015` | Yes; read-only |


## Manual Supabase SQL Editor Instructions

1. Open staging Supabase first, never production first.
2. Run files in numeric order, with one exception: run `014_news.sql` and `015_olympiad_preparation.sql` before the read-only validation file `013_validation_queries.sql`, which always runs last.
3. Read the header comments in each SQL file before running.
4. Do not run destructive statements unless explicitly approved. Purchased olympiad packages and payment/purchase records are never deleted — listings are soft-archived only.
5. After each group, run validation queries.
6. Only promote to production after staging passes RLS/RBAC tests, including the new parent/child and News/Olympiad/payment boundary checks.

## Safety Rules

- Scripts should be idempotent where safe.
- RLS must be enabled and tested before real users.
- Service role key must never be copied into frontend apps.
- Seed data must be separated from schema creation.
- Validation queries must be read-only.
- Dangerous migrations require manual confirmation and rollback plan.

## Validation Steps

- Confirm tables exist (including `014` News and `015` Olympiad tables).
- Confirm enums/extensions exist.
- Confirm roles/permissions seeded (News/Olympiad admin permissions; no Discount-Settings module).
- Confirm RLS enabled.
- Confirm child cannot read another child; child reads only own profile/content.
- Confirm parent reads/manages only own children; parent cannot read unlinked child.
- Confirm child cannot create/edit payment, subscription, or checkout rows.
- Confirm 8-digit child ID is unique, zero-padded, and server-generated (collision-safe).
- Confirm subject-pricing/trial/launch-promo config rows exist; sibling-discount audit fields present.
- Confirm Content Manager cannot read payments/audit/settings, nor manage News/Olympiad/payment modules.
- Confirm purchased olympiad packages remain readable (lifetime access) after listing archive.
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
