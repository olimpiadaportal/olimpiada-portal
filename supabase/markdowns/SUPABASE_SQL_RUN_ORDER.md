# Supabase SQL Run Order


## Repository Placement and Related Files

- Intended path: `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Folder: `supabase/markdowns/`
- Primary readers: Supabase implementer, database architect, Claude Code
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `supabase/README_RUN_ORDER.md`
- Scope controlled by this file: Exact SQL files to create later, dependencies and caution notes
- Source-of-truth level: Derived SQL planning guide


## Exact SQL Files to Create Later


## Canonical Root Files and Migrations

The files below are canonical root SQL files. They are not random one-time migrations. They are the clean, consolidated current database definition.

Incremental changes after these files exist must be added as timestamped SQL files under `supabase/sql/migrations/`, then backported into the relevant canonical root file after validation.

Read also:

- `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- `supabase/sql/migrations/README_MIGRATIONS.md`

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


## Dependencies

- `001` must run before any tables using enums/extensions.
- `002` must run before RLS policies and audit actor references.
- `003` must run before content tables.
- `004` must run before attempts and daily task items.
- `005` must run before progress/leaderboard analytics.
- `007` must run before payment policies and subscription gating validations.
- `008` should run before audit triggers in `011` if triggers write to audit tables.
- `009` storage policies may depend on roles/profile helpers.
- `010` depends on all protected tables existing.
- `011` depends on all tables needing indexes/triggers.
- `012` depends on schema and constraints.
- `013` depends on everything.

## Rerun Safety Expectations

- Use `if not exists` for extensions, tables, indexes where possible.
- Use `on conflict do nothing/update` for seeds.
- Use named policies and drop/recreate only when clearly documented.
- Do not include destructive drops without manual approval.

## Validation Queries

Validation must check:

- Table existence.
- RLS enabled.
- Required policies present.
- Role/permission seeds.
- Parent-student link access.
- Content Manager payment denial.
- Stripe event uniqueness.
- Leaderboard snapshot indexes.

## Production Caution Notes

Never test new SQL first in production. Back up before production. Run during low traffic. Keep rollback notes with every migration.
