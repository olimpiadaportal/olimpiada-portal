# STATUS.md

## Purpose

This is the live implementation tracker for the Olimpiada Portal project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

This file is intentionally configured for the **first coding session**. No application code has been implemented yet.

## Current Stage

- Stage: Stage 1 — Repository Setup and Tracking
- Current task: Verify repository structure, confirm planning files and `CLAUDE.md` placement, confirm Claude Code-only workflow, set up the Git baseline (`main` branch + `.gitignore`), and update tracking. Stage 1 is complete.
- Owner/agent: Claude Code
- Started: 2026-06-27
- Last updated: 2026-06-27
- Stage status: Complete — verification + Git baseline done; fully ready for human manual verification; awaiting human approval before Stage 2
- Version control: Git initialized on `main` branch only (no stage branches). `.gitignore` created. No commit made yet — awaiting approval.

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

- Goal: Begin with repository setup, tracking discipline, and Supabase/database planning.
- Files expected to change first:
  - `STATUS.md`
  - repository setup/config files created by the coding agent
  - then, after Stage 1 approval, `supabase/sql/001_extensions_and_enums.sql`
  - then `supabase/sql/002_core_profiles_roles_permissions.sql`
  - then `supabase/sql/003_academic_taxonomy.sql`
- Docs to read first:
  - `CLAUDE.md`
  - `IMPLEMENTATION_EXECUTION_PLAN.md`
  - `CODING_AGENT_PROMPTS.md`
  - `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
  - `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
  - `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
  - `supabase/CLAUDE.md`
  - `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
  - `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- Risks:
  - Implementing UI before backend/data foundation.
  - Creating SQL files in the wrong folder.
  - Skipping `STATUS.md` updates.
  - Applying production database changes without migration scripts.

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
| Pending | Pending | Pending | Pending | Pending | Pending | Pending | No database changes have been made yet. |

## Completed Work

| Date | Stage | Task | Files changed | Tests run | Notes |
|---|---|---|---|---|---|
| Initial package | Stage 0 | Planning package and confirmed decisions prepared | Markdown planning files only | Not applicable | Ready for first Claude Code coding session. |
| 2026-06-27 | Stage 1 | Repository structure and tracking verification | `STATUS.md` | Directory/file inventory only (no build/test suite exists yet) | All required Stage 1 folders, planning docs, and 5 `CLAUDE.md` files verified present. `CODING_AGENT_PROMPTS.md` confirmed Claude Code-only. SQL files `001`-`013` intentionally absent (Stage 2 deliverables). |
| 2026-06-27 | Stage 1 | Git baseline setup | `.gitignore` (new), `STATUS.md` | `git check-ignore` verification of ignore patterns; `git status` review | Git initialized on `main` branch only (no stage branches). Professional `.gitignore` covers secrets/`.env`/`.env.local`, `node_modules`, build outputs (`.next`, `out`, `dist`, `.vercel`), Supabase temp files, OS files, editor junk, and `.claude/settings.local.json`; `.env.example` templates remain trackable. No commit made yet (awaiting human approval). No feature/SQL files created. |

## Open Blockers / Questions

| Blocker | Area | Needed decision |
|---|---|---|
| Payment provider final production choice | Payments | Stripe-first is planned; local providers are future placeholders unless explicitly selected. |
| Final UI/UX approval | Frontend | Not a blocker; build clean component-ready UI first. |
| Future mobile framework | Mobile | Mobile is future-only. React Native can be selected later if preferred. |

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
- [x] Stage 2 recommended only after Stage 1 is complete (recommended; awaiting human approval)

### Stage 2 — Supabase SQL Planning and Foundation

- [ ] `001_extensions_and_enums.sql`
- [ ] `002_core_profiles_roles_permissions.sql`
- [ ] `003_academic_taxonomy.sql`
- [ ] `004_content_questions_tests.sql`
- [ ] `005_attempts_daily_tasks_progress.sql`
- [ ] `006_leaderboards_analytics.sql`
- [ ] `007_subscriptions_payments_coupons.sql`
- [ ] `008_notifications_support_audit.sql`
- [ ] `009_storage_buckets_policies.sql`
- [ ] `010_rls_policies.sql`
- [ ] `011_indexes_constraints_functions_triggers.sql`
- [ ] `012_seed_initial_data.sql`
- [ ] `013_validation_queries.sql`

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

- Next task: Stage 2 — Supabase SQL Planning and Foundation (begin only after explicit human approval).
- Use prompt: Prompt 2 — Start or Resume Current Stage (from `CODING_AGENT_PROMPTS.md`), plus Prompt 8 — Database Change Add-On (since Stage 2 is database work).
- Docs to read for Stage 2:
  - `supabase/CLAUDE.md`
  - `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
  - `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
  - `supabase/README_RUN_ORDER.md`
  - `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
  - `supabase/sql/migrations/README_MIGRATIONS.md`
  - `supabase/markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md`
  - `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
  - `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Expected output: Begin creating canonical root SQL files in numeric order starting with `supabase/sql/001_extensions_and_enums.sql`, following the database versioning workflow. Do not create Web App, Admin Panel, payment, or mobile features.
- Gate: Do NOT start Stage 2 until the human owner approves.
