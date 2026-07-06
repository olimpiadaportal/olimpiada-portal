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

Canonical files `001`–`013` already exist and are applied. The new business requirements
(parent/child accounts, child credentials and 8-digit ID, wallpapers, child-based subscriptions,
subject pricing, trial/launch-promo, sibling discount, payments/checkout, News, and the Olimpiada
Hazırlığı / Olympiad Preparation module) are introduced in two complementary ways so the existing
numbering stays clean:

1. **In-place extensions** to existing canonical files (002, 007, 009, 010, 011, 012, 013) for
   concepts that naturally belong to those groups (child profiles, child subscriptions/pricing,
   storage buckets, RLS, indexes/functions, seeds, validation).
2. **New canonical files** `014_news.sql` and `015_olympiad_preparation.sql` for the two new
   self-contained business domains.

Each in-place extension lands first as a timestamped migration under `supabase/sql/migrations/`
(continuing the `YYYY_MM_DD_NNN` series already started by `2026_06_27_001`..`005`), is validated on
dev/staging, and is then backported into the relevant canonical root file. New domains `014`/`015`
follow the same migration-first, backport-after rule.

| Order | File | Main responsibility | Safe to rerun? |
|---:|---|---|---|
| 001 | `supabase/sql/001_extensions_and_enums.sql` | Extensions, enum types, common domains. **Extend:** child-credential / subscription-duration (weekly/monthly/yearly) / subscription-status / payment-status / olympiad-package-status / news-status / question-difficulty (kept in model, auto-mixed) enums | Mostly yes, with `if not exists` |
| 002 | `supabase/sql/002_core_profiles_roles_permissions.sql` | Profiles, roles, permissions, profile roles. **Extend:** parent vs child profile distinction; child/student profiles created by a parent; auto parent→child link; child 8-digit unique ID (server-side, zero-padded, unique constraint); child auth-credential strategy (8-digit ID + parent-set password); per-child subject selections; predefined wallpapers catalog + per-child wallpaper/background selection | Mostly yes |
| 003 | `supabase/sql/003_academic_taxonomy.sql` | Grades, subjects, topics, subtopics, schools, districts. (Anchors the four MVP subjects: Math, Science, Məntiq, İngilis dili) | Mostly yes |
| 004 | `supabase/sql/004_content_questions_tests.sql` | Questions, translations, options, explanations, tests. (Difficulty easy/medium/hard retained in data only; never user-selected) | Mostly yes |
| 005 | `supabase/sql/005_attempts_daily_tasks_progress.sql` | Attempts, answers, daily tasks, progress snapshots. (Server-side random 25-question selection for normal tests; record selected question IDs per attempt) | Mostly yes |
| 006 | `supabase/sql/006_leaderboards_analytics.sql` | Leaderboard periods, snapshots, analytics summary tables | Mostly yes |
| 007 | `supabase/sql/007_subscriptions_payments_coupons.sql` | Plans, subscriptions, payments, Stripe events, coupons. **Extend:** child-based subscriptions (per child: subjects, duration, status, access flag); subject-based pricing config (placeholder 1 AZN/subject, full-package option); trial start/end dates; launch-promo config (first ~1 month free); 7-day trial; payment records; checkout sessions; sibling-discount calc/audit fields (1st 0% / 2nd 15% / 3rd+ 20%, backend-computed) | Mostly yes |
| 008 | `supabase/sql/008_notifications_support_audit.sql` | Notifications, templates, deliveries, support, audit logs | Mostly yes |
| 009 | `supabase/sql/009_storage_buckets_policies.sql` | Storage buckets and storage policies. **Extend:** `wallpaper-assets`, `news-media`, `olympiad-media` buckets and their policies (DB stores object path/metadata only) | Caution; policy conflicts possible |
| 010 | `supabase/sql/010_rls_policies.sql` | All table RLS enablement and policies. **Extend:** parent reads/manages only own children; child reads only own profile/content; child cannot purchase or edit payment/subscription; payment/webhook events service-role only; News admin-only CRUD (CM denied); olympiad lifetime-access reads; CM denied on News/Olympiad/payment; new 014/015 tables | Caution; test after every run |
| 011 | `supabase/sql/011_indexes_constraints_functions_triggers.sql` | Indexes, constraints, helper functions, triggers. **Extend:** collision-safe 8-digit ID generator + unique index; sibling-discount helper; trial/promo date helpers; random 25-question selection helper; `updated_at` triggers for news/olympiad tables | Mostly yes; validate trigger duplication |
| 012 | `supabase/sql/012_seed_initial_data.sql` | Initial roles, permissions, grades, subjects, settings. **Extend:** four MVP subjects; predefined wallpapers catalog; subject-pricing/trial/launch-promo config rows; News/Olympiad admin permissions (no Discount-Settings module) | Yes if upsert-based |
| 014 | `supabase/sql/014_news.sql` | **NEW.** News articles (title, body with inline links, image metadata, created_at/updated_at, publish/active status), news media metadata. Public + in-app readable; Admin-only CRUD | Mostly yes |
| 015 | `supabase/sql/015_olympiad_preparation.sql` | **NEW.** Olympiad Preparation: packages (name, subject/domain, grade/class target field, description, start/end dates, price, status, optional banner), package question pool, package purchases (=lifetime access), purchase/attempt records, per-attempt random 25-question selection records, package archive status | Mostly yes |
| 016 | `supabase/sql/016_scheduled_jobs.sql` | **NEW.** pg_cron maintenance schedules: yearly grade promotion, hourly child-access recompute, 15-min stale-test-attempt expiry. Self-guards where pg_cron is absent (skips with a NOTICE). Enable `pg_cron` in the Supabase Dashboard for production | Yes; re-schedules by name |
| 013 | `supabase/sql/013_validation_queries.sql` | Read-only validation queries and smoke checks (run LAST). **Extend:** child-ID uniqueness, parent/child RLS boundaries, payment service-role-only, News admin-only, olympiad lifetime-access, sibling-discount audit presence | Yes; read-only |

Note on ordering: `013_validation_queries.sql` is read-only and always runs **last**, after the new
`014`/`015`/`016` files, even though its number is lower. New data-bearing canonical files are numbered
`014`+ and inserted before the validation file in execution order. Full build order:
`001` → `012`, then `014`, `015`, `016`, then `013`.

**Building a fresh production database:** run the canonical files above in that order (a from-zero
bootstrap). Do **not** replay `supabase/sql/migrations/` on a clean production DB — every migration is
already backported into the canonical files. Enable the `pg_cron` extension in the Supabase Dashboard
before `016` so the cron jobs register (otherwise `016` self-skips; re-run it after enabling). See the
"First-Time Production Database Build" section in `supabase/README_RUN_ORDER.md`.


## Dependencies

- `001` must run before any tables using enums/extensions (including the new credential/subscription/payment/olympiad/news/difficulty enums).
- `002` must run before RLS policies and audit actor references. The parent/child profile split, 8-digit ID column, per-child subject selections, and wallpaper catalog/selection must exist before subscription and olympiad ownership checks.
- `003` must run before content tables and before per-child subject selections reference subjects.
- `004` must run before attempts and daily task items.
- `005` must run before progress/leaderboard analytics.
- `007` must run before payment policies and subscription gating validations. Child-based subscriptions, subject pricing, trial/promo config, payments, checkout sessions, and sibling-discount audit fields must exist before olympiad purchases and access-gating checks reference them.
- `008` should run before audit triggers in `011` if triggers write to audit tables.
- `009` storage policies may depend on roles/profile helpers; the new `wallpaper-assets`, `news-media`, and `olympiad-media` buckets must exist before `014`/`015` media metadata rows reference object paths.
- `014` (News) depends on `002` (admin roles/permissions) and `009` (`news-media` bucket).
- `015` (Olympiad Preparation) depends on `002` (parent/child profiles, child link), `003` (grades/subjects for grade/class targeting), `007` (payments/checkout for package purchases), and `009` (`olympiad-media` bucket).
- `010` depends on all protected tables existing, including `014` and `015` tables.
- `011` depends on all tables needing indexes/triggers, including the 8-digit ID generator/unique index and the random-selection helper used by `005` and `015`.
- `012` depends on schema and constraints (subjects, wallpapers catalog, pricing/trial/promo config, News/Olympiad permissions).
- `013` depends on everything and runs LAST, after `014` and `015`.

## Rerun Safety Expectations

- Use `if not exists` for extensions, tables, indexes where possible.
- Use `on conflict do nothing/update` for seeds.
- Use named policies and drop/recreate only when clearly documented.
- Do not include destructive drops without manual approval.

## Validation Queries

Validation must check:

- Table existence (including new `014` News and `015` Olympiad tables).
- RLS enabled.
- Required policies present.
- Role/permission seeds (including News/Olympiad admin permissions; no Discount-Settings module).
- Parent reads/manages only own children; child reads only own profile/content.
- Child cannot create or edit payment/subscription/checkout rows (write denial).
- Content Manager denial on payments, News, and Olympiad Preparation modules.
- 8-digit child ID uniqueness and zero-padded format; collision-safe generation.
- Subject-pricing/trial/launch-promo config rows present and well-formed.
- Sibling-discount audit fields present on subscription/checkout records.
- Payment/webhook events service-role-only and idempotent.
- Olympiad lifetime-access reads survive package archive (purchased package still readable after archive status).
- Stripe event uniqueness.
- Leaderboard snapshot indexes.

## Production Caution Notes

Never test new SQL first in production. Back up before production. Run during low traffic. Keep rollback notes with every migration.
