# STATUS.md

## Purpose

This is the live implementation tracker for the Olimpiada Portal project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

This file is intentionally configured for the **first coding session**. No application code has been implemented yet.

## Current Stage

- Stage: Stage 2 — Supabase SQL Planning and Foundation
- Current task: Canonical Supabase SQL foundation (`001`–`013`) authored + self-review applied. Security hardening done: authoritative grading/progress columns are now service-role/RPC-only via column-level GRANT/REVOKE in `010`. NOT YET APPLIED to any Supabase project — pending human dev/staging validation.
- Owner/agent: Claude Code
- Started: 2026-06-27
- Last updated: 2026-06-27
- Stage status: Implementation + self-review fixes complete in repository — pending human dev/staging apply + validation. No database has been modified.
- Security decision (2026-06-27): Authoritative-column hardening was applied IN Stage 2 (not deferred to Stage 7), per human approval.
- Previous stage: Stage 1 — Repository Setup and Tracking — COMPLETE and manually passed (baseline committed `2da8a13`, pushed to `origin/main`; `docs/decisions/.gitkeep` added).
- Version control: Git on `main` branch only (no stage branches). Stage 2 SQL changes are uncommitted in the working tree.

## First Coding Session Instruction

If this is the first time Claude Code is reading this project:

1. Read `CLAUDE.md`.
2. Read `IMPLEMENTATION_EXECUTION_PLAN.md`.
3. Read this `STATUS.md`.
4. Treat the project as **not implemented yet**.
5. Start with **Stage 1 — Repository Setup and Tracking**.
6. Do not jump to Web App, Admin Panel, payments, analytics, or mobile work.
7. After Stage 1 is complete, update this file and recommend Stage 2.

## Current Implementation Plan

- Goal: Create the Supabase SQL foundation as canonical root files in correct numeric run order (`001`–`013`), separated by responsibility (tables, enums, constraints, policies, indexes, triggers, seed, validation). Prepare the RLS strategy before any client app relies on data. PostgreSQL stores only metadata and Storage object paths; actual images/audio/media live in Supabase Storage.
- Markdown/docs that MUST be read before Stage 2 coding (Stage 2 list from `IMPLEMENTATION_EXECUTION_PLAN.md`):
  - `supabase/CLAUDE.md`
  - `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
  - `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
  - `supabase/README_RUN_ORDER.md`
  - `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
  - `supabase/sql/migrations/README_MIGRATIONS.md`
  - `supabase/markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md`
  - `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
  - `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Files expected to change/create (canonical root SQL under `supabase/sql/`, in numeric order):
  - `supabase/sql/001_extensions_and_enums.sql`
  - `supabase/sql/002_core_profiles_roles_permissions.sql`
  - `supabase/sql/003_academic_taxonomy.sql`
  - `supabase/sql/004_content_questions_tests.sql`
  - `supabase/sql/005_attempts_daily_tasks_progress.sql`
  - `supabase/sql/006_leaderboards_analytics.sql`
  - `supabase/sql/007_subscriptions_payments_coupons.sql`
  - `supabase/sql/008_notifications_support_audit.sql`
  - `supabase/sql/009_storage_buckets_policies.sql`
  - `supabase/sql/010_rls_policies.sql`
  - `supabase/sql/011_indexes_constraints_functions_triggers.sql`
  - `supabase/sql/012_seed_initial_data.sql`
  - `supabase/sql/013_validation_queries.sql`
  - `supabase/sql/migrations/` — only if incremental changes are needed after canonical files exist (none expected at first)
  - `STATUS.md` — update the Database Change Tracking table before and after SQL work
- Risks:
  - Placing SQL outside `supabase/sql/` (must never go in `web-app/` or `admin-panel/`).
  - Running or authoring scripts out of numeric run order.
  - Storing binary files in PostgreSQL instead of metadata + Supabase Storage object paths.
  - Relying on data before RLS policies exist → cross-user data leakage.
  - Applying production DB changes without a migration script, or forgetting to backport an accepted migration into the canonical root file.
  - Exposing the Supabase service role key, or trusting client-submitted role/payment/score/subscription fields.
  - Writing destructive SQL without explicit human approval and rollback notes.
  - Scope creep into Web App / Admin Panel / payment / mobile feature code — Stage 2 is database-only.

## Confirmed Stage 0 Decisions

These decisions are confirmed and should not be re-litigated unless the human owner explicitly changes them.

- [x] Current implementation includes Web App, Admin Panel, and shared Supabase backend.
- [x] Mobile app is future-only.
- [x] React Native may be selected later for future mobile, but no mobile app implementation starts now.
- [x] SMS is excluded.
- [x] Optional bank transfer is excluded.
- [x] Stripe-first card payment architecture is used for planning.
- [x] Local payment providers are future/replaceable provider abstractions unless explicitly selected.
- [x] Supabase is used for Auth, PostgreSQL, Storage, RLS, and Edge Functions where needed.
- [x] Supabase Storage stores actual optimized images, small audio files, avatars, and media.
- [x] PostgreSQL stores file metadata and object paths only, not binary files.
- [x] Redis is optional and never source of truth.
- [x] Production database changes must be migration-script controlled.
- [x] Accepted migrations must be backported into canonical root SQL files.

## Database Change Tracking

| Date | Change type | Migration file | Canonical root SQL file updated | Environment | Validation result | Backport status | Notes |
|---|---|---|---|---|---|---|---|
| 2026-06-27 | Initial canonical schema | None (foundation, not a migration) | `001`–`013` created | None applied yet (repository only) | Not run — pending human staging apply | N/A (these ARE the canonical files) | Full DB foundation drafted: extensions/enums, RBAC, taxonomy, content, attempts/daily tasks, leaderboard/analytics, subscriptions/payments, notifications/support/audit, storage buckets+policies, RLS, indexes/triggers/audit, seed, validation. Apply on staging in numeric order, then run `013`. |

## Completed Work

| Date | Stage | Task | Files changed | Tests run | Notes |
|---|---|---|---|---|---|
| Initial package | Stage 0 | Planning package and confirmed decisions prepared | Markdown planning files only | Not applicable | Ready for first Claude Code coding session. |
| 2026-06-27 | Stage 1 | Repository structure and tracking verification | `STATUS.md` | Directory/file inventory only (no build/test suite exists yet) | All required Stage 1 folders, planning docs, and 5 `CLAUDE.md` files verified present. `CODING_AGENT_PROMPTS.md` confirmed Claude Code-only. SQL files `001`-`013` intentionally absent (Stage 2 deliverables). |
| 2026-06-27 | Stage 1 | Git baseline setup | `.gitignore` (new), `STATUS.md` | `git check-ignore` verification of ignore patterns; `git status` review | Git initialized on `main` branch only (no stage branches). Professional `.gitignore` covers secrets/`.env`/`.env.local`, `node_modules`, build outputs (`.next`, `out`, `dist`, `.vercel`), Supabase temp files, OS files, editor junk, and `.claude/settings.local.json`; `.env.example` templates remain trackable. Baseline committed (`2da8a13`) and pushed to `origin/main`; local and remote in sync. No feature/SQL files created. |
| 2026-06-27 | Stage 1 | Manual verification passed + cleanups | `docs/decisions/.gitkeep` (new), `STATUS.md` | `git log`/`git status`/`git rev-parse` sync checks; remote vs local compare | Human manually verified the Git baseline, confirmed initial commit, and confirmed push to GitHub `main` with local/remote in sync. Added `docs/decisions/.gitkeep` so the empty decisions folder is tracked. Updated stale STATUS.md lines to reflect committed/pushed baseline. Stage 1 marked manually passed. Stage 2 not started. |
| 2026-06-27 | Stage 2 | Supabase SQL foundation `001`–`013` | `supabase/sql/001`–`013` (13 new), `STATUS.md` | Static checks only: dollar-quote parity (all even), no SQL outside `supabase/sql/`, file inventory. NOT executed against any DB. | Canonical full-schema foundation (~2,380 lines) covering ~52 tables, enums, RBAC helper functions, RLS on all tables, storage buckets/policies, indexes, updated_at + audit triggers, idempotent seeds, and read-only validation queries. Design choice: security helper functions placed in `002` (not `011`) so `010` RLS is runnable in numeric order; forward-reference FKs deferred to `011`. Pending self-review + human staging apply. |
| 2026-06-27 | Stage 2 | Resume verification (Prompt 2) | None (no code change) | Re-confirmed all 13 `supabase/sql/0*.sql` present; `git status` shows them untracked. | Resumed active stage; Stage 2 coding deliverables were already complete, so no SQL was rewritten. No new files created. Remaining Stage 2 work is human staging apply + `013` validation. Recommended next: Prompt 3 (self-review). |
| 2026-06-27 | Stage 2 | Self-review fix: authoritative-column hardening (backported into canonical `010`) | `supabase/sql/010_rls_policies.sql`, `supabase/sql/009_storage_buckets_policies.sql`, `CODING_AGENT_PROMPTS.md`, `STATUS.md` | Static: `010` dollar-quote parity OK; REVOKE/GRANT statements reviewed; column names verified against `005`. Not executed against a DB. | Column-level GRANT/REVOKE added to `010` so `authenticated`/`anon` cannot write `test_attempts.{score,max_score,status,submitted_at,graded_at}`, `test_attempt_answers.{is_correct,points_awarded}`, `student_daily_task_progress.{status,score,completed_at}`; learners keep only safe columns (start attempt / record answer / begin task); authoritative writes are service_role/RPC-only. `009` gained a VALIDATION WARNING about `storage.objects` policy ownership + dashboard fallback. This change is canonical (lives directly in `010`); no separate migration since not yet applied to any environment. |
| 2026-06-27 | Workflow | Workflow-control rules (no app/SQL change) | `CLAUDE.md`, `CODING_AGENT_PROMPTS.md`, `STATUS.md` | Doc edits only; no commands/tests. | Added a permanent "Workflow Control" rule to root `CLAUDE.md` (STATUS = source of truth; auto-apply DB rules for SQL/RLS/storage stages; always end with `Human Next Actions`). Prompt 2 now explicitly requires the `Human Next Actions` output and already auto-detects database work. Goal: Prompt 2 alone is sufficient to run a normal stage without manually pasting Prompt 8 or tracking next steps. |
| 2026-06-27 | Workflow + Security | Automated DB validation + secret-handling rules (no app/SQL change) | `CLAUDE.md`, `CODING_AGENT_PROMPTS.md`, `STATUS.md` | Doc edits only; no DB run performed in this task. | DECISION: for SQL/database stages Claude Code automatically runs the stage SQL + validation against the **dev/staging** DB using the `OLIMPIADA_DEV_DB_URL` shell env var (never production), fixes failures in-scope, and reruns — instead of asking the human to run every file by hand. Stage 2 `001`–`013` validation should be automated this way on the next database turn (provided `OLIMPIADA_DEV_DB_URL` and `psql` are present). SECURITY: secrets (`OLIMPIADA_DEV_DB_URL`, DB passwords, service role key, API keys) must NEVER be printed, echoed, saved, logged, committed, or written into `.env`/markdown/`STATUS.md`/Git. Human role kept minimal (manual UI testing when apps exist, report bugs, commit/push with provided message, check Vercel later). |

## Open Blockers / Questions

| Blocker | Area | Needed decision |
|---|---|---|
| Payment provider final production choice | Payments | Stripe-first is planned; local providers are future placeholders unless explicitly selected. |
| Final UI/UX approval | Frontend | Not a blocker; build clean component-ready UI first. |
| Future mobile framework | Mobile | Mobile is future-only. React Native can be selected later if preferred. |
| `answer_options.is_correct` must be hidden from students before result; `question_explanations` gated to after result | Security / Content (Stage 2→6) | RLS is row-level, not column-level. Enforce via service layer / SECURITY DEFINER RPC / public view that omits `is_correct`. Not a Stage 2 blocker; required before students consume content. |
| Stage 2 SQL not yet applied/validated on a Supabase project | Database | On the next database turn, Claude Code will auto-run `001`–`013` + `013` validation against dev/staging using `OLIMPIADA_DEV_DB_URL` (never production, never printing the URL); fix failures in-scope and rerun. Still confirm SECURITY DEFINER helpers bypass RLS (no recursion) and whether the project allows managing `storage.objects` policies. Requires `OLIMPIADA_DEV_DB_URL` + `psql` present in the terminal. |
| RESOLVED (2026-06-27): authoritative-column writes hardened in Stage 2 | Security | Fixed in `010` via column-level GRANT/REVOKE: `authenticated`/`anon` can no longer write grading/progress authoritative columns; those are service_role/RPC-only. Confirm with a session test on staging that a learner cannot UPDATE `score`/`is_correct`/`status`. |
| OPEN (validation warning): `009` storage policies use DROP/CREATE POLICY on `storage.objects` | Database (Supabase env) | `storage.objects` is owned by `supabase_storage_admin`; on some projects `postgres` cannot manage its policies and `009` will error with "must be owner of relation objects". Fallback: create the equivalent policies via the Supabase Storage dashboard and keep `009` as source-of-truth documentation. Buckets insert is unaffected. (Warning now also documented in the `009` header.) |

## Stage Checklist

### Stage 0 — Final Human Confirmation

- [x] Current scope confirmed
- [x] No SMS confirmed
- [x] No optional bank transfer confirmed
- [x] Mobile future-only confirmed
- [x] Supabase + Vercel confirmed
- [x] Supabase Storage for files confirmed
- [x] Production database migration discipline confirmed

### Stage 1 — Repository Setup and Tracking

- [x] Root structure verified/created (all required folders and files present)
- [x] `CLAUDE.md` files verified (root, `supabase/`, `web-app/`, `admin-panel/`, `mobile-app/`)
- [x] `CODING_AGENT_PROMPTS.md` reviewed (confirmed Claude Code-only)
- [x] `STATUS.md` updated by Claude Code at session start
- [x] Implementation plan reviewed
- [x] Git initialized on `main` branch (no stage branches)
- [x] `.gitignore` created/verified (secrets, `.env`/`.env.local`, `node_modules`, build outputs, Supabase temp files, OS files, editor junk, local Claude settings)
- [x] Stage 1 fully ready for human manual verification
- [x] Stage 1 MANUALLY PASSED (2026-06-27) — baseline verified, committed (`2da8a13`), and pushed to `origin/main`
- [x] `docs/decisions/.gitkeep` added so the empty decisions folder is preserved in Git
- [x] Stage 2 recommended only after Stage 1 is complete (recommended; awaiting human approval)

### Stage 2 — Supabase SQL Planning and Foundation

Legend: [x] = file authored in repository. Staging application + validation are still pending (see Database Change Tracking).

- [x] `001_extensions_and_enums.sql` (authored; not yet applied)
- [x] `002_core_profiles_roles_permissions.sql` (authored; not yet applied)
- [x] `003_academic_taxonomy.sql` (authored; not yet applied)
- [x] `004_content_questions_tests.sql` (authored; not yet applied)
- [x] `005_attempts_daily_tasks_progress.sql` (authored; not yet applied)
- [x] `006_leaderboards_analytics.sql` (authored; not yet applied)
- [x] `007_subscriptions_payments_coupons.sql` (authored; not yet applied)
- [x] `008_notifications_support_audit.sql` (authored; not yet applied)
- [x] `009_storage_buckets_policies.sql` (authored; not yet applied)
- [x] `010_rls_policies.sql` (authored; not yet applied)
- [x] `011_indexes_constraints_functions_triggers.sql` (authored; not yet applied)
- [x] `012_seed_initial_data.sql` (authored; not yet applied)
- [x] `013_validation_queries.sql` (authored; not yet applied)
- [x] Self-review fix: authoritative grading/progress columns hardened in `010` (service-role/RPC-only)
- [ ] Applied to staging Supabase in numeric order
- [ ] `013` validation queries run on staging (all checks PASS)
- [ ] RLS behavior tested with real sessions (student A/B, parent linked/unlinked, content manager)

### Stage 3 — Auth/RBAC/RLS

- [ ] Profiles implemented
- [ ] Roles implemented
- [ ] Permissions implemented
- [ ] Parent-student linking implemented
- [ ] RLS validated

### Stage 4 — App Skeletons

- [ ] `web-app/` skeleton
- [ ] `admin-panel/` skeleton
- [ ] Supabase clients configured safely
- [ ] Environment variables documented

### Stage 5 — Admin Content Taxonomy

- [ ] Admin layout
- [ ] Permission-aware sidebar
- [ ] Grades CRUD
- [ ] Subjects CRUD
- [ ] Topics/subtopics CRUD

### Stage 6 — Question Bank

- [ ] Question CRUD
- [ ] Answer options
- [ ] Explanations
- [ ] Content lifecycle
- [ ] Supabase Storage upload
- [ ] Audit logging

### Stage 7 — Test and Daily Task Engine

- [ ] Test packages
- [ ] Daily task packages
- [ ] Attempts
- [ ] Answer submission
- [ ] Auto-grading
- [ ] Retry rules

### Stage 8 — Student Web App

- [ ] Student dashboard
- [ ] Daily task page
- [ ] Test solving page
- [ ] Result page
- [ ] Mistakes review

### Stage 9 — Parent Web App

- [ ] Parent dashboard
- [ ] Link student flow
- [ ] Student progress reports
- [ ] Parent notifications

### Stage 10 — Payments and Subscriptions

- [ ] Plans
- [ ] Checkout
- [ ] Webhooks
- [ ] Subscription activation
- [ ] Gating
- [ ] Admin monitoring

### Stage 11 — Progress, Analytics, Notifications

- [ ] Progress snapshots
- [ ] Strong/weak topics
- [ ] Admin analytics
- [ ] In-app notifications
- [ ] Email abstraction

### Stage 12 — Leaderboard

- [ ] Leaderboard snapshots
- [ ] Ranking categories
- [ ] Anti-manipulation rules
- [ ] Admin review tools

### Stage 13 — QA, Security, Deployment

- [ ] Unit tests
- [ ] Integration tests
- [ ] RLS tests
- [ ] RBAC tests
- [ ] Payment tests
- [ ] E2E tests
- [ ] Deployment checklist

### Stage 14 — Future Mobile Readiness

- [ ] No mobile implementation started
- [ ] Future-readiness docs maintained

## Next Recommended Task

- Immediate next task: Claude self-review of the Stage 2 SQL (Prompt 3), focusing on RLS correctness, run-order/idempotency, security helper recursion, and storage policy safety.
- Then (human): apply `001`–`013` in numeric order on a development/staging Supabase project, run `013_validation_queries.sql`, and perform the RLS/RBAC session tests from `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`.
- Open items to verify on staging (see Open Blockers / risks): column-level hiding of `answer_options.is_correct` and explanation gating (service/view layer, not RLS); confirm SECURITY DEFINER helper functions bypass RLS as intended (no recursion); confirm permission to manage `storage.objects` policies in the target project.
- After staging validation passes: bootstrap the first administrator account (Supabase Auth user + `administrator` role via `profile_roles`).
- Gate: Stage 3 (Auth/RBAC/RLS hardening) begins only after Stage 2 is validated on staging and approved.
