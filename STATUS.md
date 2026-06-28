# STATUS.md

## Purpose

This is the live implementation tracker for the Olimpiada Portal project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

This file is intentionally configured for the **first coding session**. No application code has been implemented yet.

## Current Stage

- Stage: Stage 6 — Question Management and Media Uploads — COMPLETE / MANUALLY PASSED (2026-06-27)
- Current task: DONE. Question management (list/create/edit, taxonomy metadata, per-question language az/en/ru, body/prompt + dynamic answer options with correctness + explanation), content lifecycle with role rules (least privilege), content audit, AND media uploads (Supabase Storage `question-media` → `media_assets` metadata; metadata-only in PG). Human verified: image upload, persistent preview, removal, and the storage object/row all confirmed. Stages 1–6 complete.
- ARCHITECTURAL RE-PLAN DONE (2026-06-27, docs only): the confirmed business model (parent-only registration; parent-created children; child 8-digit ID + parent-password login; child-based subject subscriptions + launch-promo + 7-day trial + automatic sibling discount; real webhook-verified payment; public marketing website; News; Olimpiada Preparation paid module with lifetime access; child wallpaper) was written across the planning Markdown package. NO app code changed. The revised forward roadmap lives in `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap (2026-06-27)".
- Stage: Stage 7 — Business-Model Database Foundation — COMPLETE / VALIDATED (2026-06-28). Next: Stage 8 (Child authentication & account model).
- Increment 1 (child accounts) DONE + BACKPORTED into canonical `001`/`002`/`003`/`009`/`010`/`011`/`012` (migration `2026_06_27_006`): students child fields + 8-digit `child_unique_id`, `child_unique_ids` registry + random `allocate_child_unique_id()` (smoke test PASS), `child_credentials`, `wallpapers` + `child_wallpaper_selections` + `wallpaper-assets` bucket, RLS, 6 wallpapers seeded.
- Increment 2 (child subscriptions + payments) DONE + BACKPORTED into canonical `007`/`010`/`011`/`012` (migration `2026_06_27_007`): `subjects_pricing` (per-subject per-interval, configurable), `launch_promo_config` (singleton, trial_days=7), `child_subscriptions` (parent-owned/paid, status/amounts/discount/trial — service-role written), `subscription_subjects`, `checkout_sessions` (provider-agnostic), `sibling_discounts` (audit), `payments` linked to subscription/checkout; RLS (owner/child read; writes admin/service only — clients never set price/discount/status); audit on subscription status; seeded pricing + promo. Old generic `subscription_plans`/`subscriptions` left DEPRECATED (not dropped). Canonical re-applied idempotently; `013` = 12/12 PASS.
- Increment 3 (News) DONE on dev/staging — canonical module file `014_news.sql` (self-contained, applied directly; no separate migration since it is a brand-new file): `news` (slug, `content_status` lifecycle, cover image via `media_assets`, created_by, published_at) + `news_translations` (az/en/ru title/body) + `news-media` Storage bucket (public read, admin write) + indexes + updated_at/audit triggers + RLS (published news public to anon/authenticated; **Admin-only CRUD**, Content Managers excluded). Validated: 2 tables, RLS on both, 4 table policies, bucket + 2 storage policies; `013` = 12/12 PASS.
- Increment 4 (Olympiad Preparation) DONE on dev/staging — canonical module file `015_olympiad_preparation.sql` (self-contained; no separate migration — brand-new file): `olympiad_packages` (Admin-only listing; price, optional subject/grade/olympiad_type, `questions_per_attempt` default 25, `catalog_status` active/archived, cover via `media_assets`) + `olympiad_package_translations` (az/en/ru) + `olympiad_package_questions` (curated pool, mirrors `test_questions`, Admin-only/sensitive) + `olympiad_purchases` (PARENT buys → CHILD **lifetime** access; FK to packages `on delete restrict` so purchased packages are never deletable; one purchase per child/package; writes service-role/admin only) + `payments.olympiad_purchase_id` link + `olympiad-media` Storage bucket (public read, admin write) + indexes + updated_at/audit triggers + RLS (active packages public; **Admin-only CRUD**, Content Managers excluded; purchases readable by owner/child/linked-parent/admin). Attempt/result tables intentionally DEFERRED to the unified test/attempt engine (Stage 13/14). Validated: 4 tables, RLS 4/4, 7 policies, payments link, bucket + 2 storage policies, purchased-package FK = RESTRICT; `013` = 12/12 PASS.
- **Stage 7 DB increments 1–4 are COMPLETE, backported/canonical, and FINAL-VALIDATED.** `013` extended with Stage-7 checks (child accounts #13, subscriptions/payments #14, News #15, Olympiad #16; enum #4 + function #5 + bucket #11 lists updated). Final from-zero rebuild run on dev/staging **non-destructively** (single transaction: `drop+recreate public` → apply canonical `001`→`012`,`014`,`015` → `013` → `ROLLBACK`): applied in order with **zero errors**, extended `013` = **16/16 PASS**, and post-rollback dev confirmed intact (16/16 PASS, wallpapers/pricing/roles/buckets unchanged). Canonical set reproduces the entire schema from zero — no ordering/forward-reference issues.

### Stage 8 — Child Authentication & Account Model (CODE-COMPLETE 2026-06-28; runtime test deferred to UI stages 10/12)
- **Numbering note (resolved):** `IMPLEMENTATION_EXECUTION_PLAN.md` has an old "Stage 8 — Student Web App Core Flows" (lines 174/557); the **Revised Forward Roadmap (2026-06-27)** explicitly supersedes the old Stage 7–14 ordering, so Stage 8 = **Child Authentication & Account Model**. Old section kept as reference only. No conflict to block on.
- **Scope (server-side only; NO UI — parent Add-Child UI is Stage 10, child login UI is Stage 12):** the credential/account model so later UI stages just wire to it.
- **Increment 8.1 — DB — DONE + BACKPORTED + VALIDATED (2026-06-28):** atomic `create_child_account()` SECURITY DEFINER RPC (promotes the auto-created profile → active child, inserts `students` + Student role + `child_credentials` + active `parent_student_links`, allocates 8-digit ID; validates parent; service-role EXECUTE only) + `child_login_attempts` lockout table with `record_child_login_attempt()` / `is_child_login_locked()` (≥8 failures / 15 min) + admin-read RLS + audit via existing triggers. Migration `2026_06_28_008` applied + smoke-tested; backported to canonical `002`/`010`/`011`/`013`; extended `013` (#17) + from-zero rebuild = **17/17 PASS**.
- **Increment 8.2 — Server service layer — DONE (2026-06-28, no UI; typecheck PASS):** server-only service-role admin client (`web-app/src/lib/supabase/admin.ts`, `import "server-only"` + `getAdminClient()`); `web-app/src/lib/auth/children.ts` (synthetic/pending email helpers + lightweight typed validators returning i18n keys — zod NOT added since it isn't an installed dep); `childAccountService.ts` → `createChild` (admin.createUser temp `pending-<uuid>@children.invalid` + parent password → `create_child_account` RPC → update email to `c<8digits>@children.invalid`; saga-deletes the orphaned auth user on any failure) + `resetChildPassword` (ownership-checked; password ≥8 and ≠ ID); `childLoginService.ts` → `childLogin` (validates 8-digit ID → lockout gate via `is_child_login_locked` → `signInWithPassword` on SSR client for httpOnly cookies → `record_child_login_attempt`; generic error, no enumeration) + `childLogout`. Added trilingual `auth.child.*` strings (az/en/ru) to `messages.ts`; `.env.local.example` documents the server-only `SUPABASE_SERVICE_ROLE_KEY`. **Stage 8 (model + services) is code-complete; end-to-end runtime test happens when the UI exists (Stage 10 parent Add-Child, Stage 12 child login).**
- **Skeleton note:** `web-app` has no ESLint config yet (Stage 4 gap) so `npm run lint` drops into interactive setup; `npm run typecheck` is the working compile gate (PASS). Configuring ESLint is a separate follow-up.
- **Decision (owner-confirmed 2026-06-28):** the Supabase **service-role key is a server-only env var in `web-app`** (NOT isolated into Edge Functions). Binding rules + Vercel deploy guidance in `docs/decisions/2026-06-28-service-role-key-hosting.md`. Same posture reused for Stage 11 payment webhooks.
- Owner/agent: Claude Code
- Started: 2026-06-27
- Last updated: 2026-06-28
- Stage status: IMPLEMENTED + locally validated (both apps typecheck + build PASS). Stages 1–4 complete. Added: admin can create Administrators/Content Managers from the panel (least privilege, needs `SUPABASE_SERVICE_ROLE_KEY` server-side); trilingual UI (az/en/ru) across both apps with a language switcher. Browser flow needs human manual test. Next: Stage 6 after approval.
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
- [x] Parent-only registration; children are created by a parent (no child self-registration).
- [x] Child login = 8-digit unique numeric ID + parent-created password (server-issued, collision-safe, unique; no child email login).
- [x] Parent-created children are auto-linked to the parent (no manual linking as the main flow).
- [x] Subscriptions are child-based and subject-based (Math/Science/Məntiq/İngilis dili); pricing is placeholder (1 AZN/subject), configurable via admin/config; weekly/monthly/yearly.
- [x] Launch ~1-month promo, then ongoing 7-day trial; failed charge auto-blocks all paid child access; real webhook-verified payment (never client-activated).
- [x] Automatic sibling discount (subscriptions only): 2nd 15%, 3rd+ 20%. No "Discount Settings" admin module.
- [x] Public marketing website in scope; News in scope (public + in-app, Admin-only CRUD).
- [x] Olimpiada Preparation is a separate paid add-on (parent-purchased, child-access) with lifetime access; 25 random server-side questions per attempt; users never choose difficulty.
- [x] Child dashboard wallpaper customization from a predefined set.
- [x] Domain name NOT confirmed (no purchase/email config this phase).
- [x] Content Managers must NOT manage News/Olympiad/payment/subscription modules (regular content only).

## Database Change Tracking

| Date | Change type | Migration file | Canonical root SQL file updated | Environment | Validation result | Backport status | Notes |
|---|---|---|---|---|---|---|---|
| 2026-06-27 | Initial canonical schema | None (foundation, not a migration) | `001`–`013` created | dev/staging (applied) | PASS — 12/12 `013` checks; `009` storage policies applied OK; authoritative-column hardening verified | N/A (these ARE the canonical files) | Full DB foundation applied in numeric order `001`–`012` (all PASS), then `013` validation 12/12 PASS on PostgreSQL 17.6 dev/staging via `OLIMPIADA_DEV_DB_URL` (never production; URL never printed). `009` `storage.objects` policies succeeded on this project (the ownership-warning fallback was not needed here). |
| 2026-06-27 | Migration (Stage 3) | `2026_06_27_001_auth_user_provisioning.sql` | Backported into `002` | dev/staging (applied) | PASS (trigger + function present) | completed | `handle_new_user()` + `on_auth_user_created` trigger on `auth.users` auto-create a base `profiles` row on signup (status pending; role/type set during onboarding). |
| 2026-06-27 | Migration (Stage 3) | `2026_06_27_002_role_privilege_baseline.sql` | Backported into `010` | dev/staging (applied) | PASS — RLS behavioral 14/14; `013` still 12/12; column hardening intact | completed | Behavioral testing exposed that `anon`/`authenticated` had no table privileges (Supabase default grants absent on from-zero rebuild), so RLS was unreachable. Migration grants baseline SELECT/INSERT/UPDATE/DELETE (+ default privileges) and re-asserts the authoritative-column hardening. |
| 2026-06-27 | Migration (Stage 6) | `2026_06_27_003_content_audit_triggers.sql` | Backported into `011` | dev/staging (applied) | PASS (triggers present; admin question-create RLS smoke test PASS) | completed | Append-only audit triggers on `questions`, `tests`, `daily_task_packages` (reuse `fn_audit_row`). Captures create/edit/archive/publish via before/after status. |
| 2026-06-27 | Migration (Stage 6) | `2026_06_27_004_question_primary_locale.sql` | Backported into `004` (column) + `011` (index) | dev/staging (applied) | PASS (column present) | completed | Adds `questions.primary_locale` (content_locale, default az) so questions are categorized by language (az/en/ru); content stored under the chosen locale. |
| 2026-06-27 | Migration (Stage 6) | `2026_06_27_005_tighten_content_child_rls.sql` | Backported into `010` | dev/staging (applied) | PASS — behavioral: CM cannot edit others' content / can edit own | completed | Ownership-scopes the 4 question child-table write policies (translations, options, option translations, explanations) to admin/reviewer/publisher or the parent question's creator. |
| 2026-06-27 | Migration (Stage 7 inc.1) | `2026_06_27_006_child_accounts.sql` | `001`/`002`/`003`/`009`/`010`/`011`/`012` | dev/staging (applied) | PASS — schema/RLS validation green; 8-digit generator smoke test PASS | **completed** (canonical backport done; `wallpapers.media_asset_id` FK correctly deferred to `011`) | Parent-created child accounts: students child fields + 8-digit `child_unique_id`; `child_unique_ids` registry + random collision-safe `allocate_child_unique_id()`; `child_credentials` (Supabase Auth mapping); `wallpapers` catalog + `child_wallpaper_selections` + `wallpaper-assets` bucket; RLS (parent manages own children, child manages own wallpaper, credentials/IDs admin/service-only); 6 solid-color wallpapers seeded. |
| 2026-06-27 | Migration (Stage 7 inc.2) | `2026_06_27_007_child_subscriptions_payments.sql` | `007`/`010`/`011`/`012` | dev/staging (applied) | PASS — 6 tables, payments linked, RLS 6/6, promo+pricing seeded | **completed** (canonical re-applied idempotently; `013` 12/12 PASS) | Child-based subject subscriptions: `subjects_pricing` (per-subject/interval, configurable), `launch_promo_config` (trial_days=7), `child_subscriptions` (parent-owned/paid; amounts/discount/status/trial service-role-written), `subscription_subjects`, `checkout_sessions` (provider-agnostic), `sibling_discounts` (audit); `payments` linked. RLS: owner/child read, writes admin/service only. Old `subscription_plans`/`subscriptions` left deprecated (not dropped). |
| 2026-06-28 | Canonical module (Stage 7 inc.3) | `014_news.sql` (new file) | — (self-contained) | dev/staging (applied) | PASS — 2 tables, RLS 2/2, 4 table policies, `news-media` bucket + 2 storage policies; `013` 12/12 PASS | n/a (canonical file is source of truth; no separate migration for a brand-new file) | News module: `news` (slug, `content_status`, cover via `media_assets`, created_by, published_at) + `news_translations` (az/en/ru) + `news-media` Storage bucket (public read, admin write) + indexes + updated_at/audit triggers + RLS (published news public; Admin-only CRUD, Content Managers excluded). |
| 2026-06-28 | Canonical module (Stage 7 inc.4) | `015_olympiad_preparation.sql` (new file) | — (self-contained) | dev/staging (applied) | PASS — 4 tables, RLS 4/4, 7 policies, `payments.olympiad_purchase_id` link, `olympiad-media` bucket + 2 storage policies, purchased-package FK = RESTRICT; `013` 12/12 PASS | n/a (canonical file is source of truth; no separate migration for a brand-new file) | Olympiad Preparation add-on: `olympiad_packages` (Admin-only listing; price/subject/grade/type, 25 q/attempt, catalog_status) + `olympiad_package_translations` (az/en/ru) + `olympiad_package_questions` (curated pool) + `olympiad_purchases` (parent buys → child LIFETIME; never-delete via on-delete-restrict; service/admin writes only) + `payments` link + `olympiad-media` bucket + RLS (active public, Admin-only CRUD). Attempt/result tables deferred to test/attempt engine (Stage 13/14). |
| 2026-06-28 | Validation extend + final rebuild (Stage 7 close) | `013_validation_queries.sql` | `013` | dev/staging (non-destructive rebuild, rolled back) | PASS — from-zero rebuild applied `001`→`012`,`014`,`015` in order with zero errors; extended `013` = 16/16 PASS; post-rollback dev intact (16/16 PASS) | n/a (read-only validation file) | Extended `013` with Stage-7 checks: #13 child accounts, #14 subscriptions/payments + 3 `payments` link cols, #15 News + bucket, #16 Olympiad + bucket + purchased-package RESTRICT FK; added `child_access_status` (enum #4), `allocate_child_unique_id` (function #5), and 3 new buckets (#11, now 8). Confirms canonical set reproduces full schema from zero. |
| 2026-06-28 | Migration (Stage 8 inc.1) | `2026_06_28_008_child_account_provisioning.sql` | `002`/`010`/`011`/`013` | dev/staging (applied) | PASS — smoke test PASS (atomic provision + lockout + dup-guard); from-zero rebuild + extended `013` = **17/17 PASS** | **completed** (canonical 002/010/011/013; extended `013` #17 added) | Atomic `create_child_account()` SECURITY DEFINER RPC (service_role EXECUTE only — anon/authenticated explicitly revoked vs Supabase default privileges; promotes auto-created profile → active child, inserts student/role/credentials/active link, allocates 8-digit ID, validates parent, dup-guard) + `child_login_attempts` lockout table (admin-read RLS, service-role writes) + `is_child_login_locked()` / `record_child_login_attempt()` helpers (≥8 fails / 15 min). Fixed pre-commit: OUT-column name collision; and execute-privilege leak (Supabase ALTER DEFAULT PRIVILEGES grants execute to anon/authenticated → revoked explicitly). |

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
| 2026-06-27 | Docs | Developer setup guide added (no app/SQL change) | `docs/DEVELOPER_SETUP.md` (new), `CLAUDE.md`, `STATUS.md` | Doc only; no commands/tests. | Added concise new-machine setup guide (Windows + VS Code + Claude Code): required tools, GitHub SSH alias `github.com-olimpiada`, clone, repo-local Git identity, dev/staging `OLIMPIADA_DEV_DB_URL` env var (placeholder only, verify-without-printing), `psql` check, daily start, commit/push, security warnings, troubleshooting. Placeholders only — no real secrets. `CLAUDE.md` now points to `docs/DEVELOPER_SETUP.md`. |
| 2026-06-27 | Stage 2 | Auto-apply + validate SQL on dev/staging (Prompt 2) | None (validation run; no file changes) | `psql` (full path) applied `001`–`012` (all PASS) + `013` validation (12/12 PASS) against `OLIMPIADA_DEV_DB_URL`; verified column-privilege hardening on attempt/progress tables. Secrets never printed; production untouched. | Stage 2 schema is live and validated on dev/staging (PostgreSQL 17.6). All Supabase prerequisites present (auth/storage/roles). `009` storage policies applied without ownership error. Ready to close pending human commit/push. |
| 2026-06-27 | Stage 2 | Stage 2 MANUALLY PASSED (Prompt 6) | `STATUS.md` | Validation re-confirmed: `013` 12/12 PASS on dev/staging; authoritative-column hardening verified. | Stage 2 closed and marked manually passed. Schema rebuildable from canonical `001`–`013` in numeric order. Limitations carried forward: `answer_options.is_correct` column-hiding + explanation gating (Stage 6 service/view/RPC); optional multi-session RLS spot-check before production. Next: human commit/push, then Stage 3 (Auth/RBAC/RLS) via Prompt 2/7. |
| 2026-06-27 | Stage 3 | Auth/RBAC/RLS implemented + validated on dev/staging (Prompt 2) | `supabase/sql/002` (+trigger), `supabase/sql/010` (+baseline grants), `migrations/2026_06_27_001`, `migrations/2026_06_27_002`, `supabase/sql/tests/rls_behavioral_tests.sql` | Applied both migrations on dev/staging; ran RLS behavioral suite (14/14 PASS): student A≠B isolation, parent linked-only, content-manager denied payments/audit/settings, admin reads + audit immutability, anon blocked. `013` still 12/12; column hardening intact. | Stage 3 "Done When" criteria proven live. Found+fixed a real gap (missing baseline role grants → RLS unreachable). Profiles auto-provision on signup. Production untouched; secrets never printed. |
| 2026-06-27 | Stage 3 | Stage 3 MANUALLY PASSED (Prompt 6) | `STATUS.md` | Re-confirmed on dev/staging: RLS behavioral 14/14 PASS, `013` 12/12 PASS, authoritative-column hardening intact. | Stage 3 closed and marked passed. Both migrations backported into canonical `002`/`010` (schema rebuildable from zero). Carry-forward: bootstrap first admin account; `answer_options.is_correct`/explanation gating (Stage 6); optional admin MFA + rate limiting before production. Next: human commit/push, then Stage 4 (App skeletons) via Prompt 2. |
| 2026-06-27 | Stage 4 | App skeletons for `web-app/` + `admin-panel/` (Prompt 2) | `web-app/**` (18 files), `admin-panel/**` (18 files), `STATUS.md` | Both apps: `npm install` (316 pkgs each), `npm run typecheck` PASS, `npm run build` PASS (5 static routes each). | Separate Next.js 15 App Router + TS skeletons sharing the root Supabase backend. Safe Supabase clients (browser/server via `@supabase/ssr`, anon key only — service role never exposed; admin service-role key left commented server-only for later). Session-refresh middleware, `.env.local.example` templates, base layout + loading/error/not-found/unauthorized states. No business logic. web-app=3000, admin-panel=3001. node_modules/.next git-ignored; env examples tracked. Connect-to-Supabase test needs human `.env.local`. |
| 2026-06-27 | Stage 4 | Design pass: simplistic web-app, professional admin shell | `web-app/src/app/globals.css`, `admin-panel/src/app/globals.css` + `layout.tsx` + 5 page/state files | Both apps typecheck + build PASS after redesign. | Per design direction: `web-app` kept minimal/neutral (easy to restyle when the investor-approved Claude Design lands); `admin-panel` given a professional shell (dark sidebar with planned sections marked "soon", topbar, dashboard cards, pills/buttons, responsive). Still no business logic/fake data. (Direction saved to memory: `ui-design-direction` and to `CLAUDE.md` → "UI / Design Direction".) |
| 2026-06-27 | Stage 4 | Stage 4 closed (advanced via Prompt 2) | `STATUS.md` | typecheck + build PASS for both apps (prior). | Stage 4 marked complete; proceeded to Stage 5. |
| 2026-06-27 | Stage 5+ | Fix: empty Users list + admin role scoping | `admin-panel/src/app/(protected)/users/page.tsx`, `admin-panel/src/lib/admin/guards.ts` | typecheck + build PASS; confirmed DB has 1 admin + 1 content_manager. | Users list was empty because `profile_roles` has two FKs to `profiles` (`profile_id`, `assigned_by`) → ambiguous PostgREST embed returned nothing. Rewrote the query without embeds (explicit role→profile_roles→profiles lookups). Also fixed `getAuthContext` to scope `profile_roles` to the current profile (an admin's RLS returned all rows, polluting roleCodes/permissions). |
| 2026-06-27 | Stage 5+ | Admin user management + trilingual UI (az/en/ru) | `admin-panel`: `lib/supabase/admin.ts` (server-only service client), `lib/admin/users.ts`, `components/CreateUserForm.tsx`, `(protected)/users/page.tsx`, `i18n/*` + `components/{LanguageSwitcher,LoginForm}.tsx` + localized pages/components; `web-app`: `i18n/*` + `components/LanguageSwitcher.tsx` + localized pages/states; `CLAUDE.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, memory | Both apps: typecheck + build PASS (admin 8 routes incl `/users`). Not browser-tested. | Admins can create Administrator/Content Manager accounts from `/users` (least privilege: admin-guarded, fixed role allowlist, service-role client only after the check; needs `SUPABASE_SERVICE_ROLE_KEY` in `admin-panel/.env.local`, server-only). Trilingual UI rule recorded (CLAUDE.md + plan + memory); current strings translated az(default)/en/ru with cookie-based locale + `LanguageSwitcher` in both apps. |
| 2026-06-27 | Stage 5 | Admin auth + taxonomy/config CRUD (Prompt 2) | `admin-panel/src/lib/admin/*` (guards, resources, nav, actions), `admin-panel/src/components/*` (Sidebar, SignOutButton, ResourceForm, DeleteButton), `admin-panel/src/app/*` (root layout/page, login, `(protected)` layout+dashboard, `manage/[resource]` list+edit, state pages), `admin-panel/src/app/globals.css`, `CLAUDE.md`, `STATUS.md` | `npm run typecheck` PASS; `npm run build` PASS (7 routes). Not yet browser-tested (needs admin login). | Admin login/logout via Supabase Auth; `(protected)` layout enforces `requirePanelAccess` (admin or content manager) server-side; admin-only routes via `requireAdmin`. Permission-aware sidebar (CM sees only Dashboard). Allowlisted resource engine drives CRUD for grades/subjects/topics/subtopics/difficulty-levels/question-types/olympiad-types (only registry tables+columns written; RLS is the final gate). No new SQL (taxonomy + RLS already exist). Routes use a generic `/manage/[resource]` instead of the doc's per-entity paths (cleaner/DRY). |
| 2026-06-27 | Stage 6 | Question management increment 1 (Prompt 2) | `admin-panel`: `lib/admin/{questions,question-options}.ts`, `components/{QuestionForm,QuestionLifecycle,DeleteQuestionButton}.tsx`, `app/(protected)/questions/{page,new/page,[id]/edit/page}.tsx`, `nav.ts`, `(protected)/layout.tsx`, `i18n/{messages,server}.ts`, `globals.css`; `supabase/sql/migrations/2026_06_27_003_*` + `011`; `STATUS.md` | typecheck + build PASS (admin 11 routes); migration applied on dev/staging; admin question-create RLS smoke test PASS. | Question list/create/edit (metadata + az body/prompt + dynamic answer options w/ correctness + az explanation), content lifecycle with role rules (CM submits; admin approves/publishes — least privilege), content audit triggers. Atomic-ish save (compensating delete on failure). Questions visible to admin + content managers (permission `content.create`). Deferred: media upload + ru/en content fields. Known follow-up: tighten content child-table RLS to ownership (logged in Open Blockers). |
| 2026-06-27 | Stage 6 | UX/schema fixes + media upload (part 2) | `admin-panel`: `lib/admin/{media.ts,questions.ts,question-options.ts}`, `components/{QuestionForm,QuestionMediaUploader}.tsx`, `app/(protected)/questions/{page,new,[id]/edit}`, `i18n/messages.ts`, `globals.css`; `supabase/sql/migrations/2026_06_27_004_*` + `004`/`011`; `STATUS.md` | typecheck + build PASS; migration `004` applied on dev/staging; `question-media` bucket public + 2 storage policies confirmed. | Fixes: controlled form fields (persist on validation error); per-question language `primary_locale` (content stored under chosen locale; language column in list); question type/difficulty/olympiad labels translated by code. Media: browser uploads image/audio to `question-media`, server action records `media_assets` (metadata only) + links to the question's translation; 5 MB/MIME validation; preview + remove; replacing media cleans up the old object. |
| 2026-06-27 | Stage 6 | Fix: media upload `crypto.randomUUID` + child-table RLS tightening | `admin-panel/src/components/QuestionMediaUploader.tsx`, `supabase/sql/migrations/2026_06_27_005_*` + `010`, `STATUS.md` | typecheck + build PASS; behavioral RLS test PASS (CM denied others' content, allowed own). | `crypto.randomUUID()` only exists in secure contexts (https/localhost); failed over a LAN IP. Replaced with a `uniqueId()` fallback. Also tightened content child-table write RLS to parent-question ownership (migration `005` → `010`). |
| 2026-06-27 | Stage 6 | Stage 6 MANUALLY PASSED | `STATUS.md` | Human browser test: image upload OK, persistent preview, removable, storage object + `media_assets` row confirmed. | Stage 6 closed and marked passed. Stages 1–6 complete. HOLD before Stage 7 pending the owner's incoming architectural-change prompt (next session). |
| 2026-06-27 | Planning | Business-model documentation re-plan (docs only) | ~28 Markdown files: `CLAUDE.md`, `STATUS.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, `IMPLEMENTATION_PRIORITY_SUMMARY.md`, `CODING_AGENT_PROMPTS.md`, `docs/master/00`–`07`, `supabase/CLAUDE.md`+`README_RUN_ORDER`+3 markdowns, `web-app/CLAUDE.md`+4 markdowns, `admin-panel/CLAUDE.md`+5 markdowns, `mobile-app/CLAUDE.md`+`FUTURE_MOBILE_READINESS` | Doc edits only (control files by me; master/app/supabase/mobile by 8 parallel subagents from a shared canonical spec). No app code/SQL/secrets/domain. Contradiction grep planned. | Wrote the confirmed business model across the whole planning package: parent-only registration; parent-created children + 8-digit child login; child-based subject subscriptions + launch promo + 7-day trial + automatic sibling discount; real webhook-verified payment; public website; News; Olimpiada Preparation paid module (lifetime access, 25 random questions, no user difficulty); wallpaper. Removed old contradictions (student self-registration/email login, user-selected difficulty, parent-level paid account, olympiad deletion-after-expiry, manual linking as main flow, discount-settings module). Revised forward roadmap added (Stages 7–15). |
| 2026-06-27 | Planning | Confirmed child-auth/ID/pricing decisions (docs only) | `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md` (new ADR); 6→8-digit sweep across ~28 `.md`; `docs/master/02`+`03` credential strategy; `docs/master/06` proration; `STATUS.md`, `CLAUDE.md`, `CODING_AGENT_PROMPTS.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, `IMPLEMENTATION_PRIORITY_SUMMARY.md` updated via sweep | Doc edits only; no app code/SQL/secrets. | Owner approved ("yes to all"): child ID = **8 digits** (random, server-side, unique, ~100M); child = real Supabase Auth user + synthetic `c<8digits>@children.invalid` email + parent password + server-side login + rate-limit/lockout (no hand-rolled auth); add-subjects-later = next-cycle pricing; payments provider-agnostic (real provider deferred to Stage 11). Open-blocker rows for credential strategy + proration marked RESOLVED. |

## Open Blockers / Questions

| Blocker | Area | Needed decision |
|---|---|---|
| Payment provider final production choice | Payments | Stripe-first is planned; local providers are future placeholders unless explicitly selected. |
| Final UI/UX approval | Frontend | Not a blocker; build clean component-ready UI first. |
| Future mobile framework | Mobile | Mobile is future-only. React Native can be selected later if preferred. |
| `answer_options.is_correct` must be hidden from students before result; `question_explanations` gated to after result | Security / Content (Stage 2→6) | RLS is row-level, not column-level. Enforce via service layer / SECURITY DEFINER RPC / public view that omits `is_correct`. Not a Stage 2 blocker; required before students consume content. |
| RESOLVED (2026-06-27): Stage 2 SQL applied + validated on dev/staging | Database | Auto-applied `001`–`012` and ran `013` (12/12 PASS) via `OLIMPIADA_DEV_DB_URL` on PostgreSQL 17.6 dev/staging (psql called by full path; URL never printed; production untouched). SECURITY DEFINER helpers worked (no recursion). Remaining: optional multi-session RLS spot-check before production. |
| RESOLVED (2026-06-27): authoritative-column writes hardened in Stage 2 | Security | Fixed in `010` via column-level GRANT/REVOKE: `authenticated`/`anon` can no longer write grading/progress authoritative columns; those are service_role/RPC-only. Confirm with a session test on staging that a learner cannot UPDATE `score`/`is_correct`/`status`. |
| RESOLVED on dev/staging (2026-06-27): `009` storage policies applied successfully | Database (Supabase env) | On this dev/staging project `009` applied without the `storage.objects` ownership error, so the dashboard fallback was not needed. Keep the warning in the `009` header in case a future target project (or production) lacks the privilege. |
| RESOLVED (2026-06-27): content child-table write RLS now ownership-scoped | Security | Migration `2026_06_27_005_tighten_content_child_rls.sql` (→ backported `010`) scopes `question_translations`/`answer_options`/`answer_option_translations`/`question_explanations` writes to admins, reviewers/publishers, or the parent question's creator. Behavioral test PASS: a content manager cannot edit another author's question content, can edit their own. |
| RESOLVED (2026-06-27): child credential strategy + ID size | Auth (Stage 7/8) | Confirmed (`docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`): child ID is **8 digits** (random, server-side, unique, ~100M space); a child is a **real Supabase Auth user** with a synthetic `c<8digits>@children.invalid` email + parent-set password; **server-side** login maps ID→email→`signInWithPassword`; rate-limiting/lockout; parent resets via service role; password stored only by Supabase Auth. |
| RESOLVED (2026-06-27): add-subjects-later pricing | Payments | Confirmed: **next-cycle pricing** — adding a subject grants immediate access; new total applies at next renewal (no mid-cycle proration math in MVP; backend-controlled; switchable to provider proration later). |
| OPEN (decide before Stage 11): final pricing + payment provider | Payments | Posture confirmed **provider-agnostic** — pricing/plans live in our DB; real provider integration deferred to Stage 11 (Stripe is a planning example only). Decide final prices + the actual provider (Stripe or local AZ provider) before Stage 11. No keys/domain now. |

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
- [x] Applied to dev/staging Supabase in numeric order (`001`–`012`, all PASS)
- [x] `013` validation queries run on dev/staging (12/12 PASS)
- [x] Authoritative-column hardening verified live (authenticated has only safe column grants)
- [ ] Multi-session RLS spot-check (student A vs B, parent linked/unlinked, content manager) — recommended before production

### Stage 3 — Auth/RBAC/RLS  (COMPLETE / MANUALLY PASSED on dev/staging 2026-06-27)

- [x] Profiles implemented (+ auto-provision trigger on Auth signup)
- [x] Roles implemented (4 system roles seeded)
- [x] Permissions implemented (18 permissions; admin=all; content-manager least-privilege)
- [x] Parent-student linking implemented (active-link RLS enforced)
- [x] Account statuses + audit-logging foundation
- [x] Baseline role grants added so RLS is reachable (gap found via behavioral testing)
- [x] RLS validated — behavioral suite 14/14 PASS (student isolation, parent linked-only, content-manager denial, admin auditability + audit immutability, anon blocked)
- [ ] (Optional, pre-production) MFA for admin + rate-limiting per `03_AUTH` — future hardening, not blocking

### Stage 4 — App Skeletons  (IMPLEMENTED + locally validated 2026-06-27)

- [x] `web-app/` skeleton (Next.js 15 App Router + TS; build PASS)
- [x] `admin-panel/` skeleton (separate app, port 3001; build PASS)
- [x] Supabase clients configured safely (browser/server, anon key only; no service role exposure)
- [x] Session-refresh middleware + base states (loading/error/not-found/unauthorized)
- [x] Environment variables documented (`.env.local.example` per app)
- [x] typecheck + production build PASS for both apps
- [ ] (Human) `npm install && npm run dev` per app with real `.env.local` → confirm both connect to Supabase dev

### Stage 5 — Admin Content Taxonomy  (IMPLEMENTED + locally validated 2026-06-27)

- [x] Admin login/logout (Supabase Auth) + `(protected)` layout with server-side guards
- [x] Permission-aware sidebar (admin sees taxonomy/config; Content Manager sees only Dashboard)
- [x] Grades CRUD
- [x] Subjects CRUD
- [x] Topics/subtopics CRUD
- [x] Difficulty levels / Question types / Olympiad types CRUD
- [x] Content Manager restricted (admin-only `/manage/*` via `requireAdmin`; RLS backstop)
- [x] typecheck + build PASS
- [ ] (Human) browser test: log in as admin, create/edit/delete taxonomy; confirm a Content Manager cannot reach `/manage/*`

### Stage 6 — Question Bank  (increment 1 IMPLEMENTED + locally validated 2026-06-27)

- [x] Question CRUD (list/new/edit; taxonomy metadata + az body/prompt)
- [x] Answer options (dynamic add/remove, correctness flag, az text)
- [x] Explanations (az, optional)
- [x] Content lifecycle (draft→in_review→approved→published→archived/rejected) with role rules (CM submits; admin approves/publishes; least privilege)
- [x] Audit logging (content audit triggers; migration `003` → `011`)
- [x] Trilingual UI (az/en/ru); typecheck + build PASS; admin create-path RLS smoke test PASS
- [x] Per-question language (`primary_locale` az/en/ru) — content stored under chosen locale; language column in list
- [x] UX fixes: form fields now controlled (persist on validation error); question type/difficulty/olympiad labels translated by code
- [x] Supabase Storage media upload (question-media image/audio → media_assets metadata + linked to translation; PG stores metadata only; 5 MB/MIME validated; preview + remove)
- [ ] Multi-locale translations of the SAME question (one question = one language for now) (future)
- [x] (Human) browser test PASSED: question create + non-az language + image upload (preview persists, removable, storage object/row confirmed) + lifecycle + CM least-privilege

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

- Planning re-plan COMPLETE (docs only). Next implementation = **revised Stage 7 — Business-Model Database Foundation** (see `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap"): migrations + new canonical SQL for parent/child accounts (8-digit ID + credentials), per-child subjects, wallpapers, child-based subscriptions + payments + trial/promo + sibling-discount fields, News (`014`), Olympiad Preparation (`015`), storage buckets, RLS, helpers, seeds, validation. Begin only on approval (Prompt 2).
- Key design decisions are now CONFIRMED (2026-06-27, `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`): 8-digit random child ID; child = Supabase Auth user + synthetic `.invalid` email + parent password + server-side login + rate-limit/lockout; add-subjects-later = next-cycle pricing; provider-agnostic payments (real provider deferred to Stage 11). Remaining (decide before Stage 11): final prices + actual payment provider.
- Carry-forward (Child/web-app stages): hide `answer_options.is_correct` from children before result + explanation gating (service/view/RPC, not RLS); content child-table RLS already ownership-scoped.
- Carry-forward (web-app, Stage 7/8): hide `answer_options.is_correct` from students before result + explanation gating (service/view/RPC, not RLS).
- Optional pre-production hardening: admin MFA + rate limiting per `03_AUTH`.
