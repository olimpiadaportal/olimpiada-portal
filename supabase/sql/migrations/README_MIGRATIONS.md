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

## Migration Log

Older migrations document themselves in their own file headers; this log starts
where it was introduced.

| # | Date | Purpose | Backported into |
|---|------|---------|-----------------|
| 115 | 2026-08-15 | "Report a problem": `question_reports` table, the BEFORE INSERT trigger that derives every context column and enforces the 5/hour + 20/day throttle, the freeze trigger that keeps a filed report immutable, `submit_question_report()`, RLS (reporter reads own / admin reads all and moves status, no delete policy). | `001` (enums), `008` (table), `010` (RLS + policies), `011` (indexes, triggers, RPC, grants), `015` (the olympiad-package FK, which cannot live in `008` — `olympiad_packages` does not exist yet at that point in the run order), `013` (check `103`) |
| 116 | 2026-08-16 | Contact addresses become settings (`contact.info_email` beside the existing `contact.support_email`, both seeded with the real olympiq.ai addresses) plus a platform-wide `bug_reports` feature: table, derive/freeze triggers, `submit_bug_report()`, RLS, three enums, and a Brevo transactional-mail path. **Withdrawn one day later by 117** — see that row before reading this one. | `001`, `008`, `010`, `011`, `012` (the two contact settings, which SURVIVE), `013` (check `104`) |
| 117 | 2026-08-17 | Withdraws `bug_reports` (owner decision: ONE reports section, no email anywhere). Drops the table, its policies/indexes/triggers, `submit_bug_report()` and the three enums that were exclusively its own — `report_platform` is KEPT because `question_reports.platform` shares it, and `012`'s two contact settings are untouched. In its place, question-report triage now tells the reporter: an AFTER UPDATE trigger notifies them in the language they filed in when a report is taken into review, resolved or dismissed, idempotent per (report, status). Also fixes two pre-existing defects on `question_reports`: the freeze trigger was reverting its own `on delete set null` cascade into a dangling reporter id, and `qreports_select` let a reporter read `admin_note`/`handled_by` through PostgREST column selection. | `001` (enums), `008` (table), `010` (`qreports_select` now admin-only), `011` (notifier + freeze carve-out), `013` (check `104` rewritten as `104_bug_reports_withdrawn`) |
| 118 | 2026-08-17 | Retires PRORATION and the single shared renewal date per child (owner decision reversing an earlier one): drops `quote_subject_change` and `apply_subject_change`, the two add/remove wrappers that were the last reachable route into that model. Migration `109` had already moved the billing itself — `apply_plan_change` opens each subject's OWN period at `now()` and charges it in full — so nothing about pricing changes here; what changes is that a caller which sends only subject ids can no longer reach a different, prorating RPC. The web app derives the per-subject basket server-side instead (`web-app/src/lib/planBasket.ts`), in one place, and always calls the plan pair. No CASCADE: a dependency must abort the migration loudly. | `007` (ledger comment), `010` (policy comment), `011` (both bodies + their grants removed, `assert_payments_enabled` comment reworded), `013` (checks `78`/`84`/`91`/`95` re-pointed at `apply_plan_change`, new check `105` asserts both wrappers stay GONE) |
| 119 | 2026-08-17 | Makes the question EXPLANATION genuinely trilingual. **No schema change** — `question_explanations` has had per-locale rows, `uq_explanation_locale` and locale-agnostic RLS since `004`; the gap was the write path and the disclosure. (a) BOTH bulk importers nested the `question_explanations` insert INSIDE the `translations->loc->>'body' <> ''` guard, so a row supplying an `en`/`ru` explanation with no body in that locale lost it with **no row and no error** — the guard now wraps the translation row only. The payload contract is unchanged (`translations.<locale>.explanation`), so legacy az-only files and the 2897 live az rows import and behave exactly as before; the fix is purely additive. (b) `get_test_review` resolved reader-locale-then-az correctly but returned one string with no hint which locale produced it — both branches now also emit `explanation_locale` and `explanation_is_fallback`. Additive keys only: `explanation` stays a nullable STRING because the shipped mobile binary casts this payload without validating it and expo-updates cannot cross a runtimeVersion. The server flag is authoritative where the apps' own probe cannot be — SECURITY DEFINER sees an archived question's rows that `qexpl_select` hides, and it reads a legacy daily round's FROZEN `content_snapshot` directly. (c) Adds `ck_qexpl_body_len` (20000) as an abuse ceiling — `NOT VALID`, so legacy rows are never scanned. | `011` (all three function bodies + their revoke/grant lines re-issued verbatim, item-shape comment), `004` (the ceiling, inline+VALID on a fresh build), `013` (new check `106`) |
