# Supabase Migrations README

## Repository Placement and Related Files

- Intended path: `supabase/sql/migrations/README_MIGRATIONS.md`
- Folder: `supabase/sql/migrations/`
- Primary readers: Supabase implementer, Claude Code, database reviewer
- Related files: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`, `supabase/README_RUN_ORDER.md`, `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Scope controlled by this file: incremental SQL migration rules
- Source-of-truth level: derived migration execution guide

## Purpose

This folder stores incremental SQL changes after the canonical root SQL files already exist.

Use this folder for:

- hotfixes
- schema changes
- RLS fixes
- new indexes
- function/trigger updates
- seed updates
- data backfills
- production patches

## Naming

```text
YYYY_MM_DD_NNN_short_description.sql
```

Example:

```text
2026_01_18_001_fix_parent_student_rls.sql
```

## Required Header

Every migration must begin with:

```sql
-- Migration: YYYY_MM_DD_NNN_short_description.sql
-- Purpose:
-- Environment first applied:
-- Related root SQL file(s):
-- Backport status: pending | completed
-- Destructive change: no | yes
-- Rollback notes:
```

## Backport Requirement

After a migration is tested and accepted, update the relevant root SQL file in `supabase/sql/` so the complete database can be rebuilt from scratch.

Example:

- Migration file: `migrations/2026_01_18_001_fix_parent_student_rls.sql`
- Backport target: `010_rls_policies.sql`

Update `STATUS.md` after backporting.

## Production Safety

Do not run untested migrations in production.

Required order:

1. development/staging
2. validation queries
3. backup check
4. production migration
5. production validation
6. `STATUS.md` update

## Never Do This

- Do not leave dashboard-only SQL changes undocumented.
- Do not create random SQL files outside `supabase/sql/`.
- Do not change production first.
- Do not skip backporting.
- Do not run destructive SQL without written approval in `STATUS.md`.
