# STATUS.md

## Purpose

This is the live implementation tracker for the OlympIQ project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

This file is intentionally configured for the **first coding session**. No application code has been implemented yet.

## Current Stage

- Stage: Stage 6 — Question Management and Media Uploads — COMPLETE / MANUALLY PASSED (2026-06-27)
- Current task: DONE. Question management (list/create/edit, taxonomy metadata, per-question language az/en/ru, body/prompt + dynamic answer options with correctness + explanation), content lifecycle with role rules (least privilege), content audit, AND media uploads (Supabase Storage `question-media` → `media_assets` metadata; metadata-only in PG). Human verified: image upload, persistent preview, removal, and the storage object/row all confirmed. Stages 1–6 complete.
- ARCHITECTURAL RE-PLAN DONE (2026-06-27, docs only): the confirmed business model (parent-only registration; parent-created children; child 8-digit ID + parent-password login; child-based subject subscriptions + launch-promo + 7-day trial + automatic sibling discount; real webhook-verified payment; public marketing website; News; Olimpiada Preparation paid module with lifetime access; child wallpaper) was written across the planning Markdown package. NO app code changed. The revised forward roadmap lives in `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap (2026-06-27)".
- Stage: **GOAL COMPLETE (2026-06-28) — Stages 1–15 delivered.** Core product loop works end-to-end (admin content/news/olympiad + bulk ops → public site → parent register/add-child/subscribe/buy → child login/practice/olympiad → progress). Both apps build + typecheck; canonical SQL `001`–`015` + migrations `006`–`014` backported; **from-zero rebuild 22/22 PASS**. Manual-testing guide: `docs/MANUAL_TESTING_GUIDE.md`. Future follow-ups (not blocking): real payment charge/webhook, leaderboard, notifications, cover-image upload, Vercel deploy, mobile app.
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
- **Admin bulk question operations (pre-Stage-9 acceleration; ported natively from UniPrep per [[uniprep-reuse-model]]):** **inc.1 DB DONE** (migration `009`: `bulk_insert_questions` RPC + `question_imports`; from-zero rebuild 18/18). **inc.2 UI DONE (2026-06-28)** — `admin-panel`: bulk server actions (`bulkImportQuestions`/`bulkDeleteQuestions`/`bulkTransitionQuestions` in `lib/admin/questions.ts`), `/questions/import` page + `BulkImportClient` (JSON upload, downloadable template, per-row result, import history), and `/questions` refactored with multi-select + bulk toolbar (lifecycle transition + admin delete) via new `QuestionsTable` client; trilingual `bulk.*`/`qbulk.*` strings; **typecheck + build PASS** (11 routes). No new env (uses content-manager session, not service role). **Manual UI test pending.** Follow-ups DONE: bulk **assign-topic** (cascading subject→topic→subtopic picker + `bulkAssignTopic` action); import-page **"valid codes" reference** panel; **difficulty made optional** at question creation (form + `saveQuestion` + bulk RPC via migration `010`, backported to `011`, from-zero 18/18). typecheck + build PASS.

### Batch D — Olympiad PRIVATE pool + bulk + auto-code (DONE, 2026-06-28)
- **DB (migration `2026_06_28_016_olympiad_private_pool.sql`, applied dev/staging + backported):** added nullable `public.questions.olympiad_package_id` (FK olympiad_packages, on delete cascade) + index — a non-null value makes a question PRIVATE to that package. `start_practice_attempt` now filters `olympiad_package_id IS NULL` (private questions excluded from practice). `start_olympiad_attempt` now draws its 25 random questions ONLY from `questions WHERE olympiad_package_id = package` (replaced the `olympiad_package_questions`→general-questions join; attempts still reference `public.questions(id)`, so `test_attempts`/`test_attempt_answers`/`get_/grade_practice_attempt` are UNCHANGED). New SECURITY DEFINER RPC `bulk_insert_olympiad_package_questions(p_package_id, p_questions)` — same trilingual item format as `bulk_insert_questions` but sets `olympiad_package_id` + `status='published'`; content.create gated, anon revoked. Backported: column → canonical `015` (FKs olympiad_packages there); 2 RPC edits + new RPC → canonical `011`; `013` function list + new check **#23** `23_olympiad_private_pool`. **Non-destructive from-zero rebuild = 23/23 PASS.**
- **Admin UI (`admin-panel`, typecheck + build PASS, 21 routes):** removed the `code` input from `OlympiadForm`; `saveOlympiadPackage` now auto-generates the package `code` from the az title via local `slugifyCode` (hyphen slug, 23505 retry with random suffix). Removed `code` column from `/olympiad` list and the edit-page header (uses az title). Olympiad edit page: replaced the old general-pool checkbox `PoolManager` (deleted; `setOlympiadPool` removed) with `OlympiadBulkImport` (new `bulkImportOlympiadQuestions` action → the new RPC) + a live private-question count. Admin `/questions` list now excludes private questions (`.is("olympiad_package_id", null)`); general `bulk_insert_questions` leaves the column NULL (unchanged). Trilingual `olybulk.note`/`olybulk.count` added (az/en/ru).

### Batch H — Add-Child flow + Subjects UX (DONE, 2026-06-28)
- **DB (migration `2026_06_28_015_deferred_child_id_and_subject_edits.sql`, applied dev/staging + backported):** the 8-digit login ID is now **DEFERRED** — `create_child_account` no longer allocates it (child created with `child_unique_id` NULL + `access_status='inactive'`) and gained an optional `p_grade_id uuid` (writes `students.grade_id` for a real grades dropdown); `child_credentials.child_unique_id` made NULLABLE (backported to canonical `002`). `create_child_subscription` now allocates the ID on the FIRST plan for a child that still has none (calls `allocate_child_unique_id`, backfills `child_credentials.child_unique_id`) and returns `new_child_unique_id` + `auth_user_id` so the server action sets the canonical synthetic auth email. New SECURITY DEFINER RPCs `add_subscription_subject` / `remove_subscription_subject` (service_role only) re-price a child's live subscription server-side at the kept sibling rate (≥1 subject must remain). Backported to canonical `011`; `013` function list (#5) + `create_child_account` signature (#17) updated. **Non-destructive from-zero rebuild (local PG 17, Supabase env stubbed) = 23/23 PASS.** ID confirmed allocated ONLY after subscribe.
- **web-app (typecheck + build PASS, 27 routes):** `AddChildForm` now uses **dropdowns** — Grade (from `public.grades`), City (static AZ cities + "Other"→free text), School (text + datalist); on success it links to the subscribe/plan step (no ID shown yet). `subscriptionService`: `subscribeChild` sets the synthetic email after allocation + reveals the new 8-digit ID; new `quoteSubscription` (live server preview via `quote_child_subscription` — sibling discount authoritative, not hardcoded) + `addSubjectAction`/`removeSubjectAction`. `SubscribeForm` redesigned — **subjects first (checkboxes) → live subtotal → billing-period selector → server price preview (base/discount/total)**, reveals the 8-digit ID on success. New `ManageSubjects` component (edit subjects on an existing live subscription) shown on the subscribe page when a child already has a plan. Dashboard child card shows **"ID pending — choose a plan"** until allocated. `childAccountService.createChild` returns `childUniqueId: null` + new `applyAllocatedChildEmail` helper. Trilingual (az/en/ru): new `parent.child.*` (grade/city dropdowns, choosePlan), `parent.dash.idPending`/`choosePlan`, `sub.*` (totalNow/previewHint/calculating/noSibling/idFailed), full `subjedit.*` set.

### Stage 9 — Public Marketing Website + News (IN PROGRESS, 2026-06-28)
- Goal: public marketing site + News (public read + Admin CRUD). News DB already built (`014`). Web-app public visuals kept **minimal/neutral** (investor-design gate per [[ui-design-direction]]).
- **Increment 9.1 — Admin News CRUD — DONE (typecheck + build PASS, 14 routes):** `admin-panel` News module (Admin-only; Content Managers excluded) — `lib/admin/news.ts` (`saveNews`/`transitionNews`/`deleteNews`), `/news` + `/news/new` + `/news/[id]/edit` with `NewsForm` (slug + trilingual title/body, az required) + `NewsLifecycle` (publish/unpublish/archive/delete); sidebar nav entry; trilingual `news.*` strings. **Cover-image upload (news-media bucket) DEFERRED to 9.1b.**
- **Increment 9.2 — Public web-app pages — DONE (typecheck + build PASS, 14 routes):** `web-app` `(public)` route group + layout (nav/footer/language) — `/`, `/about`, `/subjects`, `/pricing`, `/olympiad-preparation`, `/faq`, `/contact`, public **News** `/news` + `/news/[slug]` (published-only via RLS, locale fallback to az), `/login` + `/register` entry stubs (full parent auth = Stage 10). Minimal/neutral plain-CSS styling (design gate); trilingual content keys (≈60 ×3). Old `app/page.tsx` moved into `(public)`.
- **Stage 9 substantially COMPLETE.** Remaining follow-up **9.1b**: News cover-image upload (news-media bucket) — tracked, non-blocking (News works without a cover).

### Stage 10 — Parent App (CORE DONE 2026-06-28; build PASS, web-app 16 routes)
- **DB:** `setup_parent(uuid, text)` SECURITY DEFINER RPC (service-role only; promotes a fresh auth user → active parent: parent role + `parents` row) — migration `2026_06_28_011`, backported to canonical `011`/`013` (#19), from-zero rebuild **19/19 PASS**.
- **web-app:** real parent **register/login/logout** (`parentService.ts` — admin.createUser + `setup_parent` + sign-in, no email dependency; `session.ts` `requireParent` via `current_profile_id`/`has_role`); `(public)/login` + `(public)/register` real forms (`ParentAuthForm`); `(parent)` authed route group (layout guard + logout) with **dashboard** (children list + 8-digit ID + access-status pill) and **Add-Child** flow (`AddChildForm` → `addChild` action authorizes the parent then calls Stage-8 `createChild` → **8-digit ID reveal**). Trilingual `parent.*`/`access.*` strings.
- **Deferred to Stage 11:** subject selection + live pricing + sibling-discount + checkout (the Add-Child flow currently creates the child with `access_status='inactive'`; subscriptions/payment come next). Needs `SUPABASE_SERVICE_ROLE_KEY` in `web-app/.env.local` to run register/add-child.

### Stage 11 — Child Subscriptions & Payments (CORE DONE 2026-06-28; build PASS)
- **DB:** `quote_child_subscription` (read-only preview) + `create_child_subscription` (apply) RPCs — price = Σ(subject pricing × interval), **sibling discount 2nd 15% / 3rd+ 20%** computed by rank, **7-day trial** from `launch_promo_config`; writes `child_subscriptions`(trialing) + `subscription_subjects` + `sibling_discounts` audit + flips child `access_status='trialing'`. Service-role only (client never sets amounts). Migration `2026_06_28_012`, backported `011`/`013` (#20), from-zero rebuild **20/20**; smoke verified (2nd child got 15%).
- **web-app:** per-child **Subjects & subscription** page (`/children/[id]/subscribe`) reading `subjects_pricing`, `SubscribeForm` (interval + subject checkboxes + live subtotal) → `subscribeChild` action (authorizes parent → `create_child_subscription`) → result shows base/discount/total/trial; dashboard "Subjects" link per child. Trilingual `sub.*` strings.
- **Stubbed (needs provider):** real charge / webhook activation, failed-charge auto-block, promo-vs-trial nuance. MVP = trial grants access; converting trial→paid and gating-on-failed-charge come when a payment provider is chosen (Stage 11 follow-up).

### Stage 12 — Child App (CORE DONE 2026-06-28; build PASS, web-app 19 routes)
- **web-app (no DB migration — uses Stage-8 `childLogin` + Stage-7 wallpapers):** `/child-login` (8-digit ID + parent password → `childLoginAction` → Stage-8 `childLogin` with lockout) ; `/child` authed route (`requireChild` via `has_role('student')`) with child dashboard — **access-gated**: trialing/active → "your learning" placeholder (content = Stage 13/14), else **locked states** (`child.locked.{inactive,locked,expired}` asking the parent to subscribe); **predefined wallpaper picker** (`WallpaperPicker` → `selectWallpaper` upsert, RLS self-only; selected solid-color wallpaper applied as dashboard background); child logout. Trilingual `child.*` strings.
- Children can never purchase (no payment UI in the child app). Login enumeration-safe + lockout (Stage 8).

### Stage 13 — Test & Daily Task Engine (CORE DONE 2026-06-28; build PASS, web-app 21 routes)
- **DB (migration `2026_06_28_013`):** `test_attempts.test_id` relaxed to nullable + `subject_id`/`kind` added (random practice has no fixed test). Three SECURITY DEFINER, owner-checked, authenticated-only RPCs: `start_practice_attempt` (picks N **random published objective questions** for the subject, grade-matched, **difficulty never chosen**), `get_practice_attempt` (returns questions + options **without `is_correct`** — anti-cheat), `grade_practice_attempt` (records answers, **auto-grades** set-equality, writes authoritative score). Backported `005`/`011`/`013` (#21); from-zero **21/21**; smoke verified (all-correct = max, no `is_correct` leak).
- **web-app:** child dashboard lists subscribed subjects → **Practice** button → `startPractice` → `/child/practice/[id]` renders `PracticeRunner` (radio for single/true-false, checkbox for multiple-choice) → `gradePractice` → score. Trilingual `practice.*`.

### Stage 14 — Olimpiada Preparation Module (CORE DONE 2026-06-28; builds PASS)
- **DB (migration `2026_06_28_014`):** `purchase_olympiad` (parent one-time LIFETIME buy → `olympiad_purchases` active, idempotent; service-role; payment stubbed) + `start_olympiad_attempt` (purchase-gated, picks `questions_per_attempt` random from the package pool, `kind='olympiad'`, reuses `get_`/`grade_practice_attempt`). Backported `011`/`013` (#22); from-zero **22/22**; smoke verified (purchase + attempt 1/1).
- **admin-panel:** `/olympiad` module (Admin-only) — list, new, edit `OlympiadForm` (code/subject/grade/price/status + trilingual title/description), `PoolManager` (tick published questions to curate the pool), archive (never hard-delete — purchasers keep access). Trilingual `oly2.*`; nav entry.
- **web-app:** parent `/children/[id]/olympiads` (browse active packages + `buyOlympiad` per child + "Owned"); child `/child/olympiads` (purchased packages → `startOlympiad` → reuses `PracticeRunner`). Dashboard links added. Trilingual `oly3.*`.

### Stage 15 — Progress / Analytics (CORE DONE 2026-06-28) + future follow-ups
- **web-app:** parent `/children/[id]/progress` (child's graded attempt history: subject · kind · score/max · date, RLS parent-linked) + "Recent results" on the child dashboard. Trilingual `prog.*`/`kind.*`. No DB migration (reads `test_attempts`).
- **Future follow-ups (DB tables already exist; not built this pass):** leaderboard, in-app notifications, real payment-gateway charge/webhook + failed-charge auto-block, News/Olympiad cover-image upload, deployment (Vercel). All noted; none block the core product loop.
- **QA/Security summary:** every privileged op is server-side + owner/permission-checked; service-role/`content.create` functions are NOT anon/authenticated-executable (validated by `013` #17–#22); from-zero rebuild reproduces the whole schema (**22/22**). Both apps build + typecheck clean.

## 🟢 GOAL COMPLETE (2026-06-28): Stages 9–15 delivered
- Migrations `2026_06_28_008`–`014` all applied + backported; canonical `001`–`015`; from-zero rebuild **22/22 PASS**.
- admin-panel + web-app both **build + typecheck PASS**. Trilingual (az/en/ru) throughout.
- **Full manual-testing guide:** `docs/MANUAL_TESTING_GUIDE.md` (admin-panel + web-app, with env setup + admin bootstrap + step-by-step flows + expected results).
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
| 2026-06-28 | Migration (Admin bulk question import — inc.1 DB) | `2026_06_28_009_bulk_question_import.sql` | `004`/`010`/`011`/`013` | dev/staging (applied) | PASS — smoke test PASS (2-item batch → 1 ok / 1 reported-error; per-item atomic; topic/subtopic/source auto-create; forbidden path raises) + from-zero rebuild **18/18 PASS** | **completed** (canonical 004/010/011/013; `013` #18 added) | Ported UniPrep bulk-action **architecture** natively onto our normalized trilingual schema: atomic per-item `bulk_insert_questions(jsonb, text)` SECURITY DEFINER RPC (internal `content.create`/`is_admin` check; `created_by` from session, not trusted from input; resolves taxonomy by code/level + auto-creates topic/subtopic/source; inserts across questions/translations/options/option-translations/explanations in az/en/ru; per-item `BEGIN..EXCEPTION` so bad rows are skipped + reported; **not anon-executable** — no service-role needed) + `question_imports` history table (importer/admin-read RLS). Fixed pre-commit: `content_locale` enum casts on locale columns. |
| 2026-06-29 | Migration (Cities/Schools/Grade Promotion + structured Add-Child) | `2026_06_29_017_cities_schools_grade_promotion.sql` | `002`/`003`/`011`/`012`/`013` | dev/staging (NOT yet applied — human to run) | pending human validation (expect `013` 25/25 PASS) | **completed** (canonical 002/003/011/012/013 backported) | Repurposed `districts` as the admin-managed CITY entity (no parallel `cities` table — would duplicate `schools.district_id`); seeded 15 AZ cities. Made `schools.district_id` MANDATORY (NOT NULL, FK ON DELETE RESTRICT); seeded 2 sample Bakı schools. Added `students.graduated` (bool, default false) + `advance_student_grades()` SECURITY DEFINER RPC (service_role only; level<11 → next grade, level 11 → graduated; returns jsonb {promoted, graduated}; intended Sept 1 via pg_cron — schedule SQL in comment, pg_cron NOT assumed enabled). Extended `create_child_account` to a 10-param signature (appended optional `p_district_id`, `p_school_id`; stores structured city/school on students alongside free-text display fields; FK targets validated when provided, never raises on null; existing 8-arg caller still type-matches via defaults). Extended `013` with #24 (graduated col + advance fn + city seed + schools.district_id NOT NULL) and #25 (advance fn service-role-only). |

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

---

## CHANGE REQUESTS — Investor Review Round 2 (2026-06-28) — ACTIVE GOAL (burn down this list)

Source: owner review. Work through top-to-bottom in batches; validate (typecheck/build/DB) per batch; check items off here.

### Batch A — Quick corrections / i18n
- [x] A1 Add-Child "Soyad" — already correct in code (`parent.child.last` = Soyad/Last name/Фамилия); no stray hardcoded "Soyben". (was a stale build)
- [x] A2 Children button → **"Yeni övlad əlavə et"** (az/en/ru). *(navigation rebuilt in Batch H flow rewrite)*
- [x] A3 Status text **Active/Inactive → Public/Private** (admin `STATUS_OPTIONS` + i18n `status.*` az/en/ru).
- [x] A4 News **slug optional** — auto-generated from az title (az-aware slugify); removed required input.
- [x] A5 **Content i18n fallback to az** — VERIFIED already implemented everywhere content translations are fetched: news list + detail and both olympiad pages all use `find(locale) ?? find("az")`; UI strings fall back via `getT` (`dict[k] ?? az[k] ?? k`). Subjects have a single `name` (no translation). Question content is served by RPCs. No new work needed.

### Batch B — Remove difficulty + remove "code"
- [x] B1 **Difficulty FULLY removed** — question form/save, nav + `difficulty-levels` resource, bulk template/panel/edit defaults, AND `bulk_insert_questions` RPC (migration `015` sets `difficulty_id` null; backported to `011`). Column kept nullable (non-destructive).
- [x] B2 **Code removed (no manual codes anywhere)** — manage resources (subjects/question-types/olympiad-types) auto-generate `code` from `name` (`actions.ts` `slugifyCode`); **bulk import now resolves subject/type/olympiad BY NAME** (migration `2026_06_28_015_bulk_import_by_name`, backported to `011`, dev smoke PASS, `013` 22/22); import template + reference panel switched to names. REMAINING for B2: olympiad-package `code` input → auto (Batch D1).

### Batch C — News — DONE (both builds PASS)
- [x] C1 News **cover-image upload** (admin edit → `news-media` → `media_assets` → `news.cover_media_id`; `attachNewsCover`/`detachNewsCover`) + **cover displayed** on public news list + article. No schema change (`014` already had it).

### Batch D — Olympiad — DONE (admin build PASS; from-zero 23/23)
- [x] D1 Olympiad `code` input removed → auto-generated from title (`olympiad.ts` slugify + collision retry).
- [x] D2 **Private per-package pool** via `questions.olympiad_package_id` (non-null = private; EXCLUDED from general `/questions` list + `start_practice_attempt` + general bulk import); `start_olympiad_attempt` draws ONLY from the package's private questions; package-scoped **bulk upload** (`bulk_insert_olympiad_package_questions` RPC + `OlympiadBulkImport` UI + template). Migration `016`, backported `015`/`011`/`013` (check #23).

### Batch E — Public site
- [x] E1 Public nav trimmed to **Pricing, About, FAQ, Contact** (`(public)/layout.tsx`). Other pages still exist but are off the nav. web-app build PASS.

### Batch F — Parent/child auth (copy logic from `side/UniPrep-Auth-master`)
- [x] F1 Parent register form = **First name, Last name, Email, Password** (`ParentAuthForm` split name → first/last; `registerParent` builds display_name). web-app build PASS.
- [x] F2 **Email verification** — `registerParent` now uses `supabase.auth.signUp` (sends confirmation email) instead of auto-confirm `admin.createUser`; `setup_parent` provisions the role pre-confirmation; `/verify-email` page + `/auth/callback` route (exchangeCodeForSession); `parentLogin` surfaces an "unverified" message. **OWNER ACTION:** enable Supabase Auth → "Confirm email" + SMTP for it to be enforced (code handles both modes; set `NEXT_PUBLIC_SITE_URL` for the email redirect).
- [x] F3 **Parent password reset** — `/forgot-password` (`resetPasswordForEmail` → `/auth/callback?next=/reset-password`) + `/reset-password` (`updateUser`); "Forgot password?" link on `/login`; trilingual. build PASS.
- [x] F4 **Parent account deletion** — `deleteParentAccount` (deletes the parent's children auth users then the parent → cascade) + confirm button on the parent dashboard; trilingual. build PASS.
- [x] F5 **Child delete + password reset** (parent) — `deleteChild` + `resetChildPasswordAction` (ownership-checked) + `ChildCardActions` on each dashboard child card (inline reset-password form + delete with confirm); trilingual. build PASS. (Admin-driven child reset comes with I1.) **Batch F COMPLETE.**

- [x] G1 **Login separated**: `/login` now shows a prominent **Student login** card (→ `/child-login`, 8-digit ID field, `inputMode=numeric`, not type=email) **and** a **Parent login** section (email). Fixes the "@"-required error (children were typing the ID into the parent email field; there was no link to `/child-login`). Trilingual `login.student*`/`login.parent*` added. web-app build PASS.

### Batch H — Add-Child flow + subscriptions (web-app) — DONE (web build PASS; from-zero 23/23)
- [x] H1 Grade (from `grades`) + City (AZ list + "Other"→free text) **dropdowns** + School **datalist**.
- [x] H2 **8-digit ID deferred to subscribe** — `create_child_account` no longer allocates; `create_child_subscription` allocates + sets the synthetic login email on the first plan; child card shows "ID pending — choose a plan" until then. Migration `015_deferred_child_id`, backported `002`(nullable id)/`011`/`013`.
- [x] H3 **Editable subjects** on an existing child (`ManageSubjects` + `add_subscription_subject`/`remove_subscription_subject` RPCs).
- [x] H4 Subscribe redesign: **subjects-first checkboxes → live subtotal → weekly/monthly/yearly → server price preview** with sibling discount reflected in the total.

---
## ✅ INVESTOR REVIEW ROUND 5 — COMPLETE & VALIDATED (2026-07-01)
Rebrand + design + profile/wallpaper/news polish. **Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes), from-zero DB rebuild = 26/26 PASS.** No SQL changes this round (wallpaper backend already existed). Nothing committed yet.

### 1) Rebrand → OlympIQ
- [x] Product brand renamed **"OlympIQ" → "OlympIQ"** (planned domain olympiq.ai) across both apps: web `app.brand`/`arena.brand`/`about.title`/`stats.title`/inline brand phrases (az/en/ru) + web metadata; admin metadata + hard-coded sidebar/login literals + css comment. **Kept the Azerbaijani word *olimpiada*=olympiad** in all feature names (Olimpiada Hazırlığı, oly.*, kind.olympiad, etc.). Cookie names left as `sb-olimpiada-*` (renaming would force re-login — technical, not brand). Memory note added.

### 2) "Energetic" design applied to LIGHT mode (dark untouched)
- [x] web-app `globals.css` LIGHT tokens remapped to the Energetic palette: bg `#fffbf5`, brand purple `#7c3aed`, accent orange `#ff8a00`, soft `#f7f0fe`, ink `#2a1a3e`, ok `#06b66b`, danger `#ff4757`; purple-tinted card shadows; **22px** card radii; **Trebuchet MS** (light-only); signature gradients — gradient logo mark (135° purple→orange, rotate −4°), purple-glow 14px buttons, gradient stat numbers, 3-stop hero (`150° #7c3aed→#9333ea→#ff8a00`). **Dark theme + `.arena` scope byte-unchanged** (block-B tokens re-pinned under `[data-theme="dark"]`). Source = the owner's "Enerjili" Claude Design HTML.

### 3) Dedicated Profile pages + drawer-as-button (parent AND student)
- [x] Profile editing moved out of the cramped 360px drawer onto full-width pages: **/profile** (parent) + **/child/profile** (student). Drawers now show a **Profile button** (+ Language + Theme + Logout). Student got a **drawer mirroring the parent** (`ChildProfileDrawer`). Profile removed from the student home. Parent footer wrapped in `.site-foot-inner`/`.site-foot-col` (was raw edge-jammed links).

### 4) De-Arena the student app
- [x] All user-facing **"ARENA" wording removed** (child header, ticker, login/child-login), first nav tab relabeled Home; the `.arena-*` CSS classes + `arena.*` i18n keys are kept (they're just the dark-theme scope).

### 5) Wallpapers (admin-managed set + student reset)
- [x] New admin **/wallpapers** manager: add solid colors + **upload image wallpapers** (→ wallpaper-assets bucket → media_assets → wallpapers `kind='image'`), activate/archive. Student picker now **renders image wallpapers** (was colors-only) and has a **"Default" swatch** → `resetWallpaper` deletes the selection so the app falls back to the theme (light/dark) default. Backend (table/bucket/RLS) pre-existed — no SQL.

### 6) Admin settings toggles
- [x] Real **sliding switches** (the knob used flex-`order` + `translateX:0` so it never moved → now translates 20px) + **optimistic** flag toggle (instant flip via `useOptimistic`). Shortened the leaderboard-names label.
- [x] **Flags now actually gate** (were persisted-but-inert): `feature_flags`/`system_settings` read via a server helper `web-app/src/lib/flags.ts` (service client, safe fallbacks) — **`news_public`** hides the public News page when off; **`leaderboard.public_display_names`** anonymizes leaderboard names when off. Other flags (launch_promo, olympiad_module, payments, notifications_email) persist + slide but their gates are **not yet wired** (deferred — see below).

### 7) News fixes
- [x] **First-load image fix:** covers were full-resolution originals piped into 72px thumbnails. Now `next/image` (+ `next.config` remotePatterns for the Supabase host) resizes + serves webp with explicit dimensions → fast first paint, no layout shift. **List redesigned** to a card grid (cover/placeholder + title + excerpt + date + views); **detail** got a meta row + typography.

### Round 5 — deferred / not wired (honest list)
- Feature-flag **gates for launch_promo, olympiad_module, payments, notifications_email** (toggles persist + slide; behavior not yet wired). Real **payments + webhook**, failed-charge/expiry automation, admin subscription/payment monitoring, pg_cron scheduling of `advance_student_grades()`, News **"Most Liked"** (likes model). Package.json/README brand fields not renamed (non-UI). Energetic theme applied to **light** only (dark kept as the owner's reference dark design).

---
## ✅ INVESTOR REVIEW ROUND 6 — COMPLETE & VALIDATED (2026-07-02)

**Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes incl. redesigned /settings), migrations 019+020 applied on dev, extended `013` = 28/28 PASS on dev AND inside a non-destructive from-zero rebuild (single transaction, rolled back; dev verified intact after). Nothing committed yet.**

- [x] R6-1 **Student nav = parent nav structure (drawer bug fixed).** Root cause found: `.arena-nav` had `backdrop-filter`, which makes the header the CONTAINING BLOCK for the `position:fixed` drawer rendered inside it → the closed drawer (`translateX(100%)`) stuck out past the right edge (page extended right) and never docked to the viewport. The child shell now uses the parent's `.pnav` header verbatim (shared `ParentNavLinks` + `.pnav-right`, arena-dark overrides, NO backdrop-filter); also fixed the always-active first tab (active state now follows `usePathname`, with `exact` matching for the `/child` home tab). Old `.arena-nav*` CSS removed.
- [x] R6-2 **Spacing pass.** `.profile-section` is now a flex column with real gap rhythm (was block layout where the Round-5 `gap` had NO effect — the actual cramping cause); ChildProfile head restructured to mirror ParentProfile (removed the misused `.profile-grid` inside the head); button paddings normalized so no text hugs borders (`.btn/.btn-ghost` 10×18, `.arena-btn(-ghost/-sm)` bumped, `.avatar-upload-btn` 9×16, form inputs 10×14); Save/Cancel rows via new `.form-actions`.
- [x] R6-3 **Language settings actually gate.** `getLocaleSettings()` (one request-cached query) reads `platform.supported_locales` + `platform.default_locale`; `getLocale()` clamps the cookie locale to the enabled set (fallback = admin default); `LanguageDropdown` (public navbar + both drawers) only offers enabled locales. Dev currently has ru UNCHECKED (the owner's test) → web-app now really drops Russian.
- [x] R6-4 **Hydration error fixed** with `suppressHydrationWarning` on `<html>` (documented Next.js pattern — the no-flash script intentionally rewrites `data-theme` pre-hydration; suppression covers only `<html>` attributes). Admin panel has no such pattern (no change needed).
- [x] R6-5 **Admin Settings redesigned UniPrep-style** (via subagent; typecheck+build PASS): 3 tabs (General / Localization / Features) of grouped SettingCard blocks (warning/info variants), reusable typed SettingInput with per-field Save + helper text, SettingToggle with inline CONFIRMATION for maintenance mode, sliding flag toggles + ON/OFF pills, reality-accurate flag descriptions, 34 new i18n keys ×3. **All raw-JSON editors removed** (trilingual maintenance message = 3 textareas assembled into one JSON in code). Update-only security posture of `updateSetting` kept. Orphan `site.promo_banner` setting deleted (migration 019; referenced nowhere).
- [x] R6-6 **All six flag gates wired** (server-side first, UI second): `payments` blocks `subscribeChild`/`addSubjectAction`/`removeSubjectAction`/`buyOlympiad` + hides the subscribe form/buy buttons with a trilingual notice (cancel stays allowed); `olympiad_module` gates the student Tasks tab, `/child/olympiads`, `startOlympiad`, the parent purchase page + dashboard button, and 404s public `/olympiad-preparation`; `launch_promo` gates the promo/trial line on public `/pricing` (actual trial behavior stays in `launch_promo_config`); `notifications_email` → `canSendEmailNotifications()` helper documented as the mandatory gate for any future email sender (nothing sends email today; Supabase Auth security emails deliberately NOT gated). Also NEW live settings: `platform.maintenance_mode(+message)` → full web-app maintenance splash (admin app unaffected); `contact.support_phone` → public Contact page; `social.*` → public footer links.
- [x] R6-7 **News likes + "Most liked"** (migration `2026_07_02_019`, backported to canonical `012`/`014`/`013` check #27): `news_likes` (PK news+profile, RLS own-row insert/delete on published only, NO anon) + `news.like_count` via SECURITY DEFINER trigger (smoke-tested inc/dec on dev, rolled back). UI: ♥ like button (optimistic, parent OR child) on the article page, plain counter for anonymous, ♥ counts on list cards, "Most liked" sort option. Migration 019 also backfills flags/settings that existed ONLY on dev (launch_promo/news_public/olympiad_module, contact.support_email) — closing a from-zero coverage gap.
- [x] R6-8 **pg_cron grade promotion** (migration `2026_07_02_020`, canonical **NEW `016_scheduled_jobs.sql`**, `013` check #28 SKIP-safe): job `olympiq_advance_student_grades` = `advance_student_grades()` every Sept 1 03:00 UTC — **verified scheduled on dev** (`cron.job` row present). Guarded: environments without pg_cron skip with a NOTICE (from-zero rebuild stays green).
- [x] R6-9 Validation done (see gate line above); `docs/MANUAL_TESTING_GUIDE.md` extended with Round-6 section **U1–U8**.

---
## ✅ INVESTOR REVIEW ROUND 7 — COMPLETE & VALIDATED (2026-07-02)

**Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes), `npm audit` = 0 vulnerabilities in BOTH apps. No DB changes this round. Nothing committed yet.**

- [x] R7-1 **Brand mark spacing**: `.pnav-brand` is now a fixed 18px slot with a 10px gap before the "Home" label, vertically centered via flex (`.pnav-link` inline-flex). Logo-file-ready: when the real logo asset arrives, an `<img>` drops into the slot and the `::before` dot is deleted — no layout change.
- [x] R7-2 **Views/likes cross-talk fixed (root cause)**: liking called `revalidatePath` → the article re-rendered → the render-time `bump_news_view` fired again, so every like click also bumped views. Views now register via a client `<ViewBeacon/>` once per browser session per article (sessionStorage-guarded, UUID-validated server action); the render never mutates. NOT kept as a feature — it corrupted "Most viewed" and was trivially farmable. Not a DDoS vector (cheap, rate-limited requests); counters documented as manipulable vanity metrics in CLAUDE.md.
- [x] R7-3 **Security hardening pass (both apps) — audits run by two read-only subagents, all confirmed findings fixed:**
  - **Dependencies:** `npm audit` 0/0 (was 2 moderate each — postcss <8.5.10 pinned inside Next; fixed via package.json `overrides` postcss ^8.5.10, NOT the suggested next@9 downgrade). Next.js floor raised to `^15.5.19` (already past the 15.2.3 middleware-bypass CVE window).
  - **Security headers (both `next.config.mjs`)**: CSP (per-app: web allows Google Fonts + Maps frame + Supabase; admin stricter with `frame-src 'none'`), X-Frame-Options (web SAMEORIGIN / admin DENY), nosniff, Referrer-Policy, Permissions-Policy, HSTS, `poweredByHeader: false`; dev-only `'unsafe-eval'` for HMR.
  - **web-app fixes:** open redirect in `/auth/callback` (`safeNext()` — relative same-origin only); in-memory rate limiting (`lib/rateLimit.ts`) on parent login (10/15min) + register (5/15min) + password reset (3/15min) with trilingual "too many attempts" (serverless per-instance limitation documented — mitigates the owner-requested "no account vs wrong password" enumeration UX); avatar uploads now magic-byte sniffed (`lib/imageSniff.ts`, parent + child; sniffed mime drives contentType/ext/metadata); raw Postgres `error.message` no longer returned (subscription/quote/gradePractice → generic trilingual); wallpaper URL escaped before inline CSS `url()` interpolation; Maps iframes sandboxed; email regex + length caps (names 80, email 255, password 128) on parent auth; child-info validation caps names (80) + UUID-shape-checks district/school/grade ids.
  - **admin-panel fixes (subagent; typecheck+build PASS):** 30-min idle logout now enforced SERVER-side (middleware `olympiq-admin-last-seen` httpOnly cookie → signOut + `/login?timeout=1` with trilingual note; client timer kept as UX); audit logging added to ALL Admin-only mutations (new `lib/admin/audit.ts` helper reusing the accounts.ts pattern; news save/transition/delete/cover, olympiad save/archive/bulk-import, wallpapers create/attach/status, settings flag/setting — best-effort, metadata capped 200 chars); media attach actions now verify the ACTUAL storage object (`lib/admin/media-verify.ts` — strict path shape, extension whitelist, no SVG, server-derived size/mime; client mime/size fields ignored); `error.message` sweep → generic trilingual + server-side `console.error` (known-error special cases kept); admin login → single generic "invalid credentials"; numeric validation (price ≥ 0 finite, grade integer 1–11, NaN guards); server-side length caps across news/wallpapers/cities/schools/questions/taxonomy; `updateSetting` validates parsed JSON against the key's SETTING_META kind + size caps + unknown keys rejected; guard-first ordering in questions.ts delete/transition/bulk; dashboard page now calls `requirePanelAccess()`.
  - **Verified clean (no action needed):** server-action authorization/ownership coverage in BOTH apps; service-role containment (`server-only`, no client imports, no NEXT_PUBLIC_ leaks); XSS sinks (all user content React-escaped; only the static theme script uses dangerouslySetInnerHTML); no SVG allowed by any storage bucket; cookies keep @supabase/ssr httpOnly/lax defaults; `.env.local` untracked (only `.example` files in git); child login lockout confirmed wired; bulk-import prototype-pollution inert (payload → jsonb RPC, never merged into JS objects).
  - **CLAUDE.md**: permanent "Security Engineering Rules" section added (guards-first, server-side validation, byte-sniffed uploads, no raw error leaks, same-origin redirects, CSP upkeep, throttling, audit logging, dependency floor) so future implementations stay secure.
  - New i18n keys ×3 locales: web `parent.err.tooMany`, `sub.err.failed`, `auth.child.err.nameTooLong`; admin `err.server`, `err.tooLong`, `login.invalid`, `login.timeout`.
  - Testing guide extended with **V1–V5**.

---
## ✅ INVESTOR REVIEW ROUND 8 — COMPLETE & VALIDATED (2026-07-03)

**Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes), migration 021 applied on dev, extended `013` = 29/29 PASS incl. non-destructive from-zero rebuild. 213 new i18n keys ×3 locales merged conflict-free. Nothing committed yet.**

Delivered exactly per plan below (all boxes done): Phase 1 — FAQ single chevron (root cause: a later border-caret rule layered on the svg), global Azerbaijani-safe Arial stack (Trebuchet+Chivo removed; JetBrains Mono kept for numerics), student logout → `/`, nav renamed Olimpiadalar, migration `2026_07_03_021` (olympiad `event_starts_at` + 6 playful gradient background presets; backported 012/015/013 #29). Phase 2 (7 parallel agents, disjoint ownership, central merge) — SaaS Pricing page (owner copy, contract plan-cards, sibling box, quiet note; promo line still launch_promo-gated); corporate About (SVG illustrations, alternating blocks, 4-card grid); Analytics with merged child progress (real stat cards + child selector + lockable subject tabs + DEMO dashboard: KPI tiles, SVG weekly/accuracy charts, topic + mistakes tables; dashboard child-card progress button removed; old progress route redirects); SaaS Subscription center (smooth-scroll Plans/Billing/Invoices; real plans/subjects/cancel + DEMO billing/invoices); professional Profile pages (parent: identity/account/security/danger/session; student: identity+ID/photo/security only) + background-template gallery (new presets, highlighted selection); redesigned drawers (Account/Language/Appearance/Session, segmented [AZ][EN][RU] + [Light][Dark], single-arrow profile row) with backward-compatible ThemeToggle/LanguageDropdown; student Olimpiadalar tab (planned-olympiad cards + detail modal with the ask-your-parent note; Olimpiadalarım kept) + admin package form gained cover-image upload (news-cover pattern incl. media-verify + audit) and event date field. Phase 3 — student LIGHT theme via `.arena` token remap to the landing reference (dark byte-unchanged) + merged all agent CSS/i18n centrally.

**Demo-data registry (to replace with real data later):** analytics subject dashboard numbers/charts; subscription Billing panel (next billing date, MasterCard ****8475) and Invoices (toggle, 2 rows). Real: plan cards' child subjects/interval/total, cancel flow, planned olympiads (admin data), backgrounds.

Docs updated: CLAUDE.md (design direction — light reference/dark frozen/Arial rule/demo-data policy), MANUAL_TESTING_GUIDE **W1–W12**.

### Original Round 8 plan (all delivered)

Execution model (per the established round workflow): main session owns ALL shared files (`globals.css`, web `messages.ts`, `child/layout.tsx`, SQL) + global fixes; parallel agents own disjoint pages/components and RETURN their CSS blocks + trilingual key/value triples for central merge (no shared-file races).

**Phase 1 — global fixes + DB (main session):**
- [ ] R8-A FAQ double chevron: delete the later `.faq-chevron` border-caret override block (globals.css ~2849) — it drew a small caret ON the svg element that already draws the main chevron. One centered chevron + rotation stays. Fixes landing AND parent FAQ (shared FaqAccordion).
- [ ] R8-B Font: global Azerbaijani-safe stack `Arial, Helvetica, …` — replace light-mode Trebuchet MS + arena Chivo + lead the root stack with Arial; keep JetBrains Mono for numeric accents only; slim the Google Fonts link. Verify ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ.
- [ ] R8-C BUG: student logout redirects to `/` (landing), not `/child-login`.
- [ ] R8-D Student nav item "Tapşırıqlar" → "Olimpiadalar" (az/en/ru value change).
- [ ] R8-E Migration `2026_07_03_021`: `olympiad_packages.event_starts_at timestamptz` (planned-olympiad date for the student tab) + seed 6 playful gradient wallpaper PRESETS (racing/space/ocean/jungle/candy/night — CSS gradient values; picker + arena background already accept any CSS background). Backport 015/012 + 013 check #29; apply dev; from-zero at the end.

**Phase 2 — parallel agents (disjoint ownership):**
- [ ] R8-1 Pricing page → SaaS cards (owner-provided copy; badges, benefits, CTAs, sibling info box, muted note; equal heights; both themes; responsive) — authors the shared `plan-*` card CSS contract.
- [ ] R8-2 About page → hero + alternating sections + Mission/Offer/Audience/Trust cards + inline-SVG illustrations (CSP-safe), corporate polish, trilingual.
- [ ] R8-3 Analytics: merge child progress into /analytics — stat cards kept; child selector; subject tabs (locked ⟶ "subscribe to unlock"); demo SaaS dashboard (weekly activity, totals, accuracy, best/weakest topic, time, last activity; SVG charts; mistakes-by-topic table). Child cards on dashboard lose the progress button; /children/[id]/progress redirects to /analytics. InfoCarousel → 2 cards desktop / 1 mobile, no half-cuts.
- [ ] R8-4 Subscription page → SaaS billing: Plans/Billing/Invoices smooth-scroll tabs; plan cards REUSE the pricing contract + "Current plan" badge + per-child subjects + manage/add subjects; demo Billing (next date, MasterCard ****8475) + demo Invoices (email toggle, request button, history table).
- [ ] R8-5 Profile redesign (parent AND student): settings-card layout (identity header / Account info / photo actions + "JPG or PNG, max 2 MB" / Security / Danger zone (parent only) / Session); student keeps avatar+name+8-digit ID+password only; wallpaper picker → template preview cards incl. the new playful presets, clear selected state.
- [ ] R8-6 Drawers (parent + student): section titles Account/Language/Appearance/Session; theme = side-by-side [Light][Dark] segmented with active highlight; language = [AZ][EN][RU] segmented on desktop (dropdown mobile; respects enabled-locales gating); single arrow on the profile row; logout under Session (calm danger).
- [ ] R8-7 Student Olympiads tab: "Planned olympiads" cards (image/title/desc/date/subject/status + Ətraflı detail w/ "ask your parent to buy the package" note; data = admin olympiad packages) + "Olimpiadalarım" (owned; empty state kept). Admin: add cover-image upload if missing + event date field.

**Phase 3 — main session:** merge returned CSS/i18n; light-mode unification (landing Energetic light = reference for parent + STUDENT light; `[data-theme="light"] .arena` token remap; dark byte-kept); final typecheck/build both apps; from-zero DB; docs (CLAUDE.md design direction note, MANUAL_TESTING_GUIDE W-section, STATUS completion).

---
## ✅ INVESTOR REVIEW ROUND 9 — COMPLETE & VALIDATED (2026-07-03)

**Final gate: web typecheck+build PASS (31 routes incl. new /olympiads), admin typecheck+build PASS, migrations 022+023 applied on dev + backported (011/013), extended `013` = 31/31 PASS incl. non-destructive from-zero rebuild. Nothing committed yet.**

- [x] T1 Language dropdown double caret — removed the CSS ::after caret; the svg caret is the single, animated one.
- [x] T2 "Uşağı sil" — new `.btn-ghost.danger` variant (ghost geometry, danger tint) + styled inline reset-password input.
- [x] T3 Avatars — every avatar container (nav trigger + profile classes old/new) enforces square box, 50% radius, overflow hidden, object-fit cover.
- [x] T4 Analytics KPI grid — "Orta dəqiqlik" tile removed → exactly 5 boxes, `repeat(5,1fr)` desktop / auto-fit tablet / 2-col mobile (accuracy still in trend chart + topic table).
- [x] T5 Shared `<Modal/>` + `<ConfirmModal/>` (`components/Modal.tsx`: portal into body, overlay/Escape/× close, scroll lock, role=dialog/aria-modal/focus restore) — the buggy student "Ətraflı" dialog (root cause: rendered INSIDE the clipped/stacked card) rebuilt on it; CancelSubscription, DeleteAccountButton and the delete-child confirm() all refactored onto it. Every web-app modal now shares one implementation.
- [x] T6 REAL analytics (UniPrep architecture study → port): migration `2026_07_03_023` adds `get_child_subject_dashboard(child, subject?, days?)` (totals/accuracy/time-spent(started_at→submitted_at, clamped)/last-activity/7-day activity/accuracy trend/per-topic/mistakes; SECURITY DEFINER with COALESCE'd in-body auth: service-role/admin/linked-parent/the child; anon revoked) + `get_admin_platform_overview()` (admin-only KPIs + signup/attempt trends). Parent dashboard now URL-driven (?child&subject) and 100% real data with honest empty states (ALL Round-8 demo numbers deleted); admin dashboard gained the Platform overview section (content managers: section omitted). UniPrep ideas deliberately skipped: DISTINCT ON dedup (our answers are already unique), ELO/tiers, per-user timezones, fetch-all client aggregation.
- [x] T7 Parent "Olimpiadalar" menu (`/olympiads` between Analitika/Abunəlik): browse all active packages (cover/chips/date/questions/admin price), segmented child selector, purchase via shared Modal, `purchaseOlympiadForChild` action (guard-first, ownership re-check, olympiad_module+payments server gates, price read server-side, duplicate race → "already owned") with the MOCK payment isolated in non-exported `processOlympiadPayment()` — the single seam for the future real provider. Purchases appear in the student's Olimpiadalarım (existing RPC/RLS).
- [x] T8 Admin Questions (UniPrep gap analysis → G1–G5): server-side pagination (25/50/100 + numbered pager + Showing X–Y of N), debounced ?q search over translations (LIKE-escaped, id-set strategy), cascading Subject→Topic→Subtopic + Type/Grade/Status filters (searchParams-driven, uuid/status whitelists), per-row lifecycle quick actions (mirrors QuestionLifecycle permissions via existing transitionQuestion), lifecycle stat cards (click-to-filter, private-pool exclusion). Deliberately NOT ported: is_active toggle (we have a 6-state lifecycle), Situasiya groups, difficulty-centric UI, client fetch-all.
- [x] T9a Wallpapers "silent save failure" — ROOT CAUSE: saves were persisting all along; dev carried a DUPLICATE FK wallpapers→media_assets (inline FK from migration 006 + canonical named FK from 011), making every PostgREST embed ambiguous (PGRST201) — the list swallowed the error and looked frozen. Fixed: migration `2026_07_03_022` (single canonical FK; 013 check #30 guards the invariant), `listWallpapers` hints the FK column + SURFACES load errors, `createSolidWallpaper` converted to state-returning with explicit saved/error feedback (was void = structurally silent), image uploader shows success. End-to-end verified via a throwaway-admin PostgREST repro (all layers OK post-fix).
- [x] T9b Student background gallery confirmed fully DB-driven (no hardcoded list) — it was broken by the same duplicate-FK embed failure; works after 022 (verified: 15 wallpapers incl. the owner's stuck "test" image now flow through).

**Demo-data registry update:** parent analytics dashboard is now REAL (removed from the registry). Still demo: subscription Billing panel + Invoices section; olympiad purchase payment step (mock seam).

Docs updated: MANUAL_TESTING_GUIDE **X1–X9**.

---
## ✅ INVESTOR REVIEW ROUND 11 — COMPLETE & VALIDATED (2026-07-04)

**Final gate: web typecheck+build PASS, admin typecheck+build PASS (nav now /stickers; /wallpapers removed), migrations 025+026+027 applied on dev + fully backported (002/003/009/010/011/012/013), extended `013` = 37/37 PASS incl. the non-destructive from-zero rebuild (rolled back; dev verified intact). Nothing committed yet.**

- [x] **Payment modes (items 1+6):** `payments` / `demo_payments` / `giveaway_period` flags with DB-trigger mutual exclusivity (`trg_payment_mode_exclusivity`, smoke-tested incl. giveaway-clock stamp + no-restamp guard); server-only `web-app/src/lib/paymentMode.ts` = the single mode/giveaway-window resolver (expired window ⇒ inactive automatically, no job needed); all subscribe/subject/olympiad gates rewired (off → paymentsOff, giveaway → "free right now" — no paid rows minted during a free window).
- [x] **Giveaway Period (item 6):** admin duration-days input (1–730, server-validated) + Asia/Baku start/end readout; celebratory D/H/M countdown banner in parent+child layouts; add-child skips plan/payment (Info→Done, instant 8-digit ID via new `activate_child_login_id` RPC, NO subscription row); child arena/practice/olympiads free via DB-level `is_giveaway_active()` inside `start_practice_attempt`/`start_olympiad_attempt` (migration 027) — active-catalog packages only, archived stay purchaser-only; expiry reverts everything automatically.
- [x] **Demo Payments + Manage Subjects (items 1+13):** checkbox editor (active chip vs additional, per-subject per-interval price, live authoritative quote) with the PAYMENT-FIRST contract — any addition opens the demo-pay sheet (demo AND real modes) showing base/discount/total from the quote; cancel = nothing applied; removals re-price directly via the kept sibling rate; new batch `updateSubscriptionSubjectsAction` (ownership + mode + UUID-validated, ≥1 subject, amounts 100% server-derived).
- [x] **Item 12:** Subscription page multi-child selector (`?child=` Link tabs, ownership-validated, refresh/deep-link safe; plans/billing/invoices scoped per child). **Item 11:** Analytics subject tabs unlock from the child's REAL coverage (giveaway → all; admin grants unlock automatically via their ordinary active subscription); forged `?subject=` clamped.
- [x] **Phone (item 3):** 244-country dial list (AZ default, emoji flags, Intl.DisplayNames names), composed E.164 hidden field, FE custom-validity + server regex before signup, stored in `profiles.phone` (E.164 check constraint, 013 #35), read-only on the profile page.
- [x] **Wizard (items 2/4/8):** step-3 plan CARDS on the shared plan-card contract (Most Popular badge, selected state, quote-driven totals); page + wizard centered (root cause: 600px prose block left-stuck in 960px main); password-eye root cause = `.form button{margin-top:16px}` leaking onto the absolutely-positioned eye → zeroed globally for `.form .pw-field`.
- [x] **Item 5:** "Qiymət 1 fənn üçün hesablanır." note near prices (subscription plan cards + subjects editor), trilingual.
- [x] **Admin bypass (item 7):** Accounts → Create child (parent picker + filter, grade, password, grant toggle default ON with interval + actively-priced subjects + optional days) → `admin_grant_child_access` RPC (comped ACTIVE subscription, amounts 0, provider `admin_grant`, allocates the 8-digit ID, access='active'; refuses double-live-plans; service-role only, 013 #34); saga rollback on any failure; audited (`admin.child.create`, `admin.child.access_grant`); bypass exists ONLY here.
- [x] **Character Stickers (item 9):** wallpapers feature fully retired at app level (child picker + arena background + admin module + nav deleted; tables kept DEPRECATED non-destructively; obsolete i18n keys ×3 locales + dead CSS pruned; historical audit labels kept). New: `sticker_themes`/`sticker_images`/`child_sticker_selections` + `sticker-assets` bucket (png/webp only, 2MB) + DB min-5 guards (enable + delete, both smoke-tested); admin Stickers module (theme CRUD, byte-sniffed multi-upload, previews, typed-confirm delete, full audit); child profile theme cards (enabled themes only — RLS WITH CHECK) + `StickerDecorations` fixed layer (deterministic 4–6 safe slots, pointer-events none, ≤2 on mobile, reduced-motion aware).
- [x] **Item 10:** landing "What sets us apart" redesigned (root cause: values grid was squeezed into one column of the About 2-col grid) — full-width span, centered heading + accent bar, 4/2/1 card grid, token shadows/radii, motion-safe hover; content byte-identical.
- **i18n:** web +37 keys / admin +92 keys (az/en/ru, central TSV merge), −5 web / −20 admin obsolete keys pruned. **Audit page** gained mappings for the 6 sticker codes + 2 child codes + 2 new entities.
- **DB:** migrations `2026_07_04_025` (modes/phone/grant), `026` (stickers), `027` (giveaway attempt access), `028` (sticker min 5→6) — all applied on dev, smoke-tested (exclusivity, grant end-to-end, min-6 guards) and backported; `013` now 37 checks (#33–#37; #36 asserts the min-6 threshold in the guard bodies).
- [x] **Sticker follow-up (owner):** min raised **5→6** (DB guards migration 028 + backport 011 + 013 #36 assertion; admin `MIN_IMAGES=6` both pages + `stkadm.*` "6"/"{n}/6" text in labels.ts + messages.ts mirror, all 3 locales — smoke-tested: 5 blocked, 6 enables, delete-below-6 blocked). Child layer redesigned to **exactly 6 UNIQUE** stickers (deterministic shuffle, no repeats), **3 left + 3 right** in a **triangular/staggered** arrangement (outer top/bottom hug the edge, middle pokes toward content — never a straight vertical line); gutter geometry derived live from `.arena-main` (1100px centered) with a `max()` clamp that folds in the RENDERED overshoot (scale ≤1.23 on hover + rotate ±17° + drop-shadow), so the visible sticker keeps ≥14px clearance from content at every shown width (verified 1280→2560px — overlap mathematically impossible, even mid-hover); responsive (single viewport-scaled size clamp; hidden <1280px where the 1100px content fills the width → no overlap / no horizontal scroll — **tablet/mobile hide is the owner-approved fallback**, side gutters don't exist until the viewport exceeds the content); **hover wiggle + scale-up** (precise-pointer only, `prefers-reduced-motion` disables float+wiggle); layer `z-index:0` + `pointer-events:none` (stickers interactive only on desktop, only in the empty gutters — beside content, never above interactive elements). **Adversarially reviewed** (multi-agent workflow, 4 lenses + verify): caught + fixed the rendered-box overlap (initial clamp reasoned about the layout box only) and 6 stale min-5 doc comments across 5 files; 4 findings correctly refuted. Both apps typecheck+build PASS; from-zero rebuild 37/37.
- Docs: MANUAL_TESTING_GUIDE **Z1–Z14**. Demo-data registry unchanged (billing/invoices demo + olympiad mock seam remain; the demo-pay sheet is the deliberate temporary system until the real provider).

### Round 11 — owner fix pass (2026-07-05)
Post-review punch-list (web typecheck+build PASS; admin untouched; adversarial review workflow run):
- [x] **Giveaway countdown now ticks live SECONDS** (d/h/m/**s**, 1s interval, 2-digit-padded h/m/s for stable width) for parent AND student; `gvw.seconds` added (az/en/ru) + wired into both panel layouts.
- [x] **Giveaway shown on the public site** to logged-out visitors (item 1b) — the same celebratory countdown banner mounted at the top of `(public)/layout.tsx` `site-main` while the window is active (lures new customers on the landing + every public page).
- [x] **Phone country selector rebuilt** (item 2): the repetitive long country names are gone from the visible control — a COMPACT trigger shows only ISO + dial (`AZ +994`); opening it reveals a **searchable** popover with full names + codes (keyboard nav, outside-click/Escape, focus-return). Hidden `phone` E.164 composition + server validation unchanged; `parent.auth.phoneSearch` added ×3.
- [x] **Demo-payment CVC overflow fixed** (item 3, CSS): `.pay-field input` got `width:100%`+`box-sizing:border-box` and `.pay-grid` switched to `minmax(0,1fr)` + `min-width:0` — the input's intrinsic ~20-char width no longer forces the column past the card edge.
- [x] **Analytics → Detailed progress → Subject FIXED** (item 4): ROOT CAUSE — a hardcoded `subjectSlug()`/`["math","science","logic","english"]` model silently dropped every subject that didn't match those 4 slugs. The real seeded subjects are **Riyaziyyat / İngilis dili / İnformatika / Azərbaycan dili**, so a child subscribed to İnformatika+Azərbaycan dili mapped to ZERO tabs → the "no active subject" panel. Fix: derive the subject tabs from the child's **real** covered subjects (id + name, same source as the subscribe page) and show the other purchasable subjects (from `subjects_pricing`) as locked — works for ANY admin-defined subject set. Giveaway/admin-grant unlocking + the forged-`?subject=` clamp preserved. Verified against dev data (child 26512f40 → İnformatika+Azərbaycan dili now selectable, other two locked).
- [x] **Stickers made bigger** (item 5): `--stk-w` `clamp(38→50px, 4→4.6vw, 84→100px)`; overlap math re-derived (≥13px rendered clearance incl. hover at 1280→2560px), triangle + <1280px hide unchanged.

### Original Round 11 plan

**Scope (owner punch-list):** (1) Manage-Subjects checkbox UI + prices + demo-payment confirm; (2) Add-Child password-toggle vertical centering; (3) mandatory parent phone at registration (all-country dial codes, AZ default, FE+BE validation, E.164 in `profiles.phone`); (4) Add-Child step-3 plan cards (subscription-page style + Most Popular badge); (5) "price is per 1 subject" note near prices; (6) **Giveaway Period** feature (admin toggle + duration-days input, free platform access, countdown banner, safe expiry); (7) admin create-child with free access grant (payment bypass, admin-only); (8) Add-Child screen centered; (10) landing "What sets us apart" section redesign (spacing/cards/hierarchy, content unchanged); (11) parent Analytics subject tabs unlock per the SELECTED child's real subscription coverage (giveaway/admin-grant aware, server-derived, locked-subject URL params clamped); (12) Subscription page multi-child support — URL-driven child selector tabs (?child=, ownership-validated server-side), all plans/billing/invoices scoped to the selected child; (13) Manage-Subjects payment-first contract — subject ADDITIONS open the payment flow (demo modal in demo AND real modes) BEFORE anything is applied (cancel = still locked); removals re-price without payment via the kept sibling rate; all amounts server-derived (quote/add/remove RPCs are THE central pricing service — 1st child full, 2nd 15%, 3rd+ 20% by live-subscription rank); every apply re-validates childId ownership + payment mode server-side; (9) **Character Stickers** replace the wallpaper/color-palette customization — remove the palette UI (child profile) + the admin Wallpapers color module entirely; new admin Sticker-Themes module (name + ≥5 transparent PNG/WebP sticker uploads, enable/disable, previews, delete/replace) + child profile theme cards + a safe decorative sticker renderer across child pages (never blocks content; responsive; admin-uploaded assets only — no copyrighted URLs hardcoded). Payment modes (**real `payments` / `demo_payments` / `giveaway_period`**) are mutually exclusive — enforced at the DB layer (trigger), not just UI. Wallpaper DB tables retired non-destructively (app code removed; tables kept DEPRECATED like old `subscriptions` — drop needs explicit owner approval).

**Implementation plan:**
- **Phase 0 (main session, foundation):** migration `2026_07_04_025_payment_modes_phone_admin_grant.sql` — seed `demo_payments` + `giveaway_period` flags (off) + `giveaway.duration_days`/`giveaway.started_at` settings; `fn_payment_mode_exclusivity` trigger on `feature_flags` (enabling one of the trio disables the others; enabling giveaway stamps `giveaway.started_at`); `profiles.phone` (E.164 check); `admin_grant_child_access(student, interval, subject_ids[], days?)` SECURITY DEFINER RPC (comped active subscription, total 0, provider `admin_grant`, allocates the 8-digit ID like `create_child_subscription`; service_role only). Apply dev → backport 002/011/012 → 013 checks #33–35. New server-only `web-app/src/lib/paymentMode.ts` (`getPaymentModeInfo()`: mode = giveaway>demo>real>off, giveaway window computed server-side, expired giveaway = inactive). Rewire `subscriptionService`/`olympiadService` gates: blocked only when mode `off`; giveaway blocks paid mutations with a "free during giveaway" notice (access comes from the global override, no rows written — expiry auto-reverts). New `updateSubscriptionSubjectsAction` (batch checkbox diff → add/remove RPCs) + `activateChildGiveaway` (allocate ID + synthetic email, NO subscription).
- **Phase 0b (main session):** migration `2026_07_04_026_sticker_themes.sql` — `sticker_themes` (admin-managed, disabled by default) + `sticker_images` (FK → `media_assets`; PNG/WebP only) + `child_sticker_selections` (RLS self-row) + `sticker-assets` bucket + DB-enforced **min-5-images-per-enabled-theme** (enable check + delete guard triggers). Backports 002/009/010/011/012-n/a/013.
- **Phase 1 (parallel agents, disjoint files; CSS/i18n via scratchpad TSV for central merge):** A = ManageSubjects checkbox redesign + demo-pay confirm modal + per-subject note (subscribe page, subscription page). B = AddChildWizard (plan cards, giveaway skip Info→Done, centering, pw-toggle alignment). C = phone field (countries module + PhoneField + register form + `registerParent` validation/store + profile display). D = admin panel (Features: two new flags + giveaway duration input + exclusivity note; Accounts: create-child form with subjects/interval/free-grant via the new RPC; audit). E = GiveawayBanner (countdown d/h/m, celebratory, both themes) in parent+child layouts + free-access override on child arena gates/dashboard pill/olympiad child surfaces + child-layout sticker integration (remove wallpaper background application, mount `StickerDecorations`). F = web stickers (delete `WallpaperPicker` + wallpaper actions; `StickerThemePicker` cards in child profile; `StickerDecorations` safe-position renderer; selection server action limited to enabled themes). G = admin stickers (DELETE the Wallpapers module — pages/actions/components/nav; new Stickers module: theme CRUD, multi-upload with byte-sniffed PNG/WebP validation, previews, per-sticker delete, enable gated on ≥5, audit).
- **Phase 2 (main session):** merge i18n/CSS, typecheck+build both apps, non-destructive from-zero rebuild (013 → 35 checks), MANUAL_TESTING_GUIDE Z-section, STATUS completion + QA checklist sweep.

---
## ✅ INVESTOR REVIEW ROUND 12 — COMPLETE & VALIDATED (2026-07-05)

**Final gate: web typecheck+build PASS (33/33 pages), admin typecheck+build PASS (22/22 pages incl. new `/site-content`); migrations `2026_07_05_029`–`032` applied on dev + smoke-verified + fully backported (002/003/008/010/011/012/016/013); extended `013` = 40/40 PASS incl. the non-destructive from-zero rebuild (rolled back; dev intact). Nothing committed yet.** A 4-item owner update pass done before resuming the Test-engine/Leaderboard/Notifications plans.

- [x] **Prompt 1 — Private schools + numeric ordering:** `schools.is_private` + `schools.school_number` (parsed from the AZ name "N nömrəli …"; migration 029) + `ix_schools_display_order`. **Everywhere schools are listed** now sorts **PRIVATE first → numeric school_number ASC (2 before 10) → NULL numbers last → name**: admin `/schools` table + `lib/admin/schools.listSchools` + web Add-Child dropdown (`children/new` query). Admin schools page gained a **Type column (Private/Public badge)** + a **Type filter** (search/city/status/pagination unchanged); `SchoolForm` gained a **Private** checkbox (`saveSchool` derives `school_number` from the name server-side, never trusts the client). Seeded a curated starter set of 6 well-known Bakı **private** schools (admin can add/rename/remove). Verified on dev: private 6 on top, then 1,3,4,5,6… numerically (313 numbered, 1 unnumbered public). `013` #38.
- [x] **Prompt 2 — Admin "Site Content & Design" (reusable DB-backed CMS-lite):** two override layers, both read by the web-app server-side via the service-role client with SAFE fallbacks (unset/invalid ⇒ built-in i18n / CSS default, site never breaks). **(A) Site content** — `site_content(key,group_key,az,en,ru)` admin-only table (migration 031); admin page edits a curated, extensible registry of 9 server-rendered keys (nav/home/footer, defaults = current live text); `getContentOverrides()` + `getT()` layer overrides on top of i18n for SERVER-rendered surfaces (client-import components are the documented v1 gap). **(B) Design tokens** — `design.*` system_settings (font family / base size / 5 brand colours); `getSiteDesignCss()` validates STRICTLY server-side (whitelisted AZ-safe font stacks, hex colours, px 13–22) and injects CSS-var overrides into `<html>` — colours scoped to `[data-theme="light"] !important` so **dark mode (frozen reference) is untouched**; fonts via new `--font-family`/`--font-size-base` tokens on `body`. Admin: new `/site-content` page + `siteContent.ts` service (requireAdmin-first, registry allowlist, caps, audit `admin.site_content.update`) + new `color`/`fontfamily`/`fontsize` SettingEditor kinds + nav entry. `013` #40. (Delegated the admin-panel build to an isolated background agent; reviewed — authorize-first + validation confirmed.)
- [x] **Prompt 3 — 5 child-friendly light-mode palettes:** `students.palette` (5-value CHECK, migration 030) + `data-palette` set SSR on the `.arena` wrapper; `PalettePicker` (6 swatch cards incl. Default) next to the sticker picker on the child profile → `selectPalette` action (requireChild-first, self-row, whitelisted slug). Palettes **sky / bubblegum / mint / sunset / rainbow** re-map the arena tokens under `[data-theme="light"] .arena[data-palette=…]` (+ accent-tint companions) — **dark mode byte-identical** (never a `[data-theme="dark"]` rule); accents stay vivid so white-on-accent keeps AA contrast; per-student, persists across logins. `013` #39. Trilingual palette names.
- [x] **Prompt 4 — Rename OlimpIQ → OlympIQ:** owner chose to change EVERYTHING to the new spelling. Case-sensitive sweep across both apps + canonical SQL + docs + mobile markdowns: `OlimpIQ`/`OlimpİQ` → **OlympIQ** (display, titles, metadata, brand headers) and `olimpiq` → **olympiq** (domain `olympiq.ai`, scheme `olympiq://`, cookie `olympiq-admin-last-seen`, localStorage `olympiq-viewed:`, pg_cron `olympiq_advance_student_grades` via migration 032 + canonical 016, bundle `ai.olympiq.app`). **Historical `supabase/sql/migrations/` left untouched** (immutable history; 032 intentionally references the old job name to unschedule it). The AZ word **`olimpiada`** (feature names, repo/package names, env `OLIMPIADA_DEV_DB_URL`) deliberately preserved (29 files). Re-grep confirms zero old brand tokens remain outside migrations. Memory `project-name-olympiq` updated.
- **DB:** migrations `2026_07_05_029` (schools private+number), `030` (students.palette), `031` (site_content + design.* tokens), `032` (cron rename) — all applied on dev, smoke-tested, backported; `013` now 40 checks (#38–#40). Fixed pre-validation: named the palette CHECK constraint in canonical 002 (inline check had auto-generated name → #39 initially FAILed on from-zero, then 40/40).
- **Adversarial review** (multi-agent workflow, 4 lenses: security/correctness/i18n/db-consistency) found ONE real defect — **fixed**: the admin design **base font-size** token was stored as a JSON number but the web-app reader (`siteDesign.ts`) coerced it via a string-only helper → the `--font-size-base` override was silently dropped (colours + font family were unaffected). Reader now accepts number-or-string. Security lens confirmed authorize-first + registry allowlist + strict CSS-injection validation + no service-role leak; palette slugs verified consistent across all 6 sites (DB CHECK / 2 web consts / picker / CSS / profile). Re-typecheck PASS.
- Docs: MANUAL_TESTING_GUIDE **AA1–AA4** (below). Demo-data registry unchanged.

### Round 12 — pass 2 (2026-07-05): Add-Child overhaul · Free-access intervals · text-only CMS · rename follow-up

**Final gate: web typecheck+build PASS (33/33), admin typecheck+build PASS (23/23 incl. new `/free-access`); migration `2026_07_05_033` applied on dev + smoke-verified + backported (008/010/011/012/013); from-zero rebuild = 42/42; free-access DB chain smoke-tested (inactive→active→expired-lazy). Nothing committed.** Owner-answered forks: remove the design editor entirely; full client-provider CMS coverage; free-access as a NEW mechanism alongside giveaway + admin-grant.

- [x] **DB (migration 033):** `free_access_intervals` (per-parent OR per-child window; admin-only RLS) + 3 lazy `SECURITY DEFINER` helpers (`is_free_access_active_for_student`, `my_free_access_active`, `current_parent_free_access` — scoped to `current_profile_id()`); both attempt RPCs honor a free interval (mirrors giveaway — nothing to unwind). `site_content` gained `section`/`menu`. `design.*` settings DELETED. `013` #40 updated + #41 (design removed) + #42 (free-access). From-zero 42/42.
- [x] **Design/font/colour editor REMOVED** (owner): web `siteDesign.ts` deleted + layout injection + `body` font vars reverted; admin `color`/`fontfamily`/`fontsize` kinds + `design.*` META/validation + Design cards + `design.*` i18n removed. `/settings` unaffected.
- [x] **Hierarchical text-only "Website Content" CMS:** `/site-content` reshaped into a **Section → Menu → text** stepper (`ContentManager` + `siteContentRegistry` = **101 curated keys** across Landing/Student/Parent, defaults from the live web i18n; `saveSiteContent` registry-allowlisted + audited, writes section/menu). **Full client coverage**: new web `I18nProvider` + `useT()` at root with the current-locale DB overrides; `ThemeToggle` migrated override-aware (the ~19 dict-prop client components were already override-aware via server `getT()`).
- [x] **Admin Add-Child overhaul:** server-side **debounced parent autocomplete** (`searchParents` — name + phone + email + child count, sanitized `ilike`, real-parents only, capped; loading/empty states); **mandatory City → School cascade** (private-first + numeric, optgroups) wired through `create_child_account` (was NULL) with server-side school∈city re-validation.
- [x] **Free-access intervals — admin `/free-access`** (create/list/deactivate): parent autocomplete + optional specific-child + `datetime-local` start/end (end>start guard) + note; `createFreeAccessInterval`/`deactivateFreeAccessInterval` (requireAdmin-first, ownership re-validated, audited); status pills; nav + audit mappings.
- [x] **Free-access intervals — parent/child integration:** web `freeAccess.ts` (`getParentFreeAccess`/`getChildFreeAccessActive` via scoped RPCs); `paidMutationGate` blocks paid writes when active (like giveaway); subscription + subscribe pages show free/0; a **countdown banner** (reused `GiveawayBanner`) on parent pages while a window is active (only when the global giveaway isn't already showing one); child dashboard grants full access + all subjects. `gate.freeAccess` / `fa.*` i18n ×3.
- [x] **Rename follow-up:** package names → `olympiq-web-app`/`olympiq-admin-panel`; "Olimpiada Portal" → **OlympIQ** across 31 SQL-header/doc files. KEPT (would disrupt): `OLIMPIADA_DEV_DB_URL` env var + the AZ word "olimpiada". Memory `project-name-olympiq` updated.
- Docs: MANUAL_TESTING_GUIDE **BB1–BB7** (below).
- **Adversarial review** (multi-agent, 4 lenses) found + **fixed** 4 real defects (migration `034` + web edits, re-typecheck+build both apps, from-zero 42/42): **(major)** the free-access gate + subscribe/subscription display used the PARENT-WIDE flag, so a window for one child wrongly blocked paying for an uncovered sibling → now **per-child** via a new caller-scoped `is_child_free_access_active(p_student)` RPC + `paidMutationGate(studentId)`; **(major, ×same-root)** the subscribe page's free state is now scoped to the specific child; **(major)** the admin `datetime-local` interval inputs were submitted naive and parsed as server-UTC (offset shift) → now converted to UTC ISO in the admin's browser before submit; **(minor)** `is_free_access_active_for_student` was over-granted to `authenticated` → revoked (internal SECURITY-DEFINER callers only; the scoped RPC is the authenticated entrypoint). Verified: base helper not authenticated-executable, scoped RPC authenticated-only, from-zero 42/42.

### Round 12.1 (2026-07-05): Free Access page = single create→schedule workspace · full-codebase audit

**Owner decisions this pass:** (1) free-access "add/remove subjects" model APPROVED as-is (interval = everything free, giveaway-style override; no comped subject rows); (2) account creation MOVES from Accounts to the Free Access page; (3) full security/logic/architecture audit → findings MD to work through later; the Test-engine → Leaderboard → Notifications order stays next after that.

- [x] **Admin `/free-access` restructured into 4 sections** — Create parent → Create child → Schedule free access → Scheduled intervals. The creation forms are the SAME components/server actions the Accounts page used (`AccountCreateForm`→`createParent`, `CreateChildForm`→`createChildForParent` — moved, not duplicated; zero backend changes needed). A parent created in section 1 is immediately findable in the live `searchParents` autocomplete of sections 2–3.
- [x] **Accounts page = list/manage only** — creation card + its grades/pricing/cities/schools loading + strings removed; search/edit/delete/child-password-reset untouched. Subtitle already described monitor/reset only.
- [x] `createParent`/`createChildForParent`/`updateParent`/`deleteChild`/`deleteParent` now also `revalidatePath("/free-access")` (names/rows render there).
- [x] i18n ×3: `freeAccess.createParentHeading/Help`, `freeAccess.createChildHeading/Help`, refreshed `freeAccess.subtitle`.
- [x] **Validation:** admin typecheck + build PASS (23/23; `/free-access` 4.4 kB, `/accounts` slimmed). No web-app changes this pass.
- [x] **Full-codebase audit** (6 read-only lenses: web security, admin security, SQL/RLS, business logic, architecture/connectivity, performance) → findings compiled in **`docs/CODEBASE_AUDIT_2026_07_05.md`** (to be worked through later, per owner).
- Docs: MANUAL_TESTING_GUIDE **BB8**.

### Round 13 (2026-07-05, IN PROGRESS): audit remediation + Test Engine (T0–T2)

**Owner decisions:** olympiad packages stay PURCHASABLE during a free-access window (M11 — deliberate); `/olympiad-preparation` joins the public nav (M20); topic tests = FIXED 25 questions / 25 minutes (no admin knob); daily tasks NOT in this stage; plan defaults adopted: unlimited attempts w/ fresh re-draw, TRUE resume, full results+review depth; option shuffling deferred. **MCQ-only launch rule (new, owner):** only MCQs (single-choice, exactly 5 options, exactly 1 correct) exist at launch; question creation + bulk import validate strictly per-type; per-type structural rules become manageable on the admin question-types page. Commit-message style rule added to CLAUDE.md.

**Plan:**
1. Migration `035` — audit Batch-1 DB hotfix: H1 revoke, H2 admin-only gate, H3 answer-options RLS lockdown, H4 `status` typo, H5 grading dedup/membership, H6 subject-coverage check, C2 live-plan guard + partial unique index + advisory lock (M14), M26 idempotent ID allocation, M12 purchase guard (event passed), L17 re-purchase amount, M23 question indexes, L12 leaderboard RLS. Apply dev → backport → from-zero.
2. Migration `036` — access lifecycle (C1): lazy date checks in attempt RPCs, `recompute_child_access()` + hourly pg_cron, financial-record retention on account deletion (M13/L13: FKs → set null, rows preserved).
3. Background agents fix app-layer findings in parallel: admin-panel (H9-admin, H10, H11, M1–M5, M15, M18, M19, M22, L8–L11, L21) and web-app (H9-web, H8, M6–M10, M12-listings, M15–M17, M20–M21, M24–M25, L1–L7, L16, L19–L20).
4. Migration `037` — Test Engine T0 (attempt columns, 6 RPCs, expiry cron) + `question_types` structural config (options_required / correct_required / selectability; only MCQ active).
5. T1/T2 UI (child test flow: subject→topic/subtopic→instructions→timed player→results→review) + admin MCQ strict validation + question-types management page.
6. Full validation gates (typecheck+build ×2, dev migrations, from-zero, smoke tests) + docs (audit MD statuses, testing guide CC section).

**Progress (2026-07-06):**
- [x] **Audit remediation COMPLETE** — every Critical/High and all actionable Medium/Low findings fixed; per-ID outcome table added at the top of `docs/CODEBASE_AUDIT_2026_07_05.md`. App-side: admin-panel 17/17 items, web-app 25/25 items, both typecheck PASS. Notables: middleware files MOVED to `src/` in both apps (they had never been registered — idle logout + session refresh now actually run); accounts page paginated + single joined role query; guards `cache()`-memoized in both apps; child-login IP throttle + `ipHash` wired; DB-driven prices replace the hardcoded 2/6/50 copy; free-access now honored by the child olympiads tab, parent dashboard pills, and the Add-Child/subscribe activation path (`FreeActivation`); I18nProvider ships single-locale dict (~30–50 KB gz saved on every page); public chrome reads wrapped in `unstable_cache(60s)`; ESLint configs added; dead code deleted.
- [x] **DB (migrations 035/036/037 applied to dev + fully backported to 001/003→005/007/010/011/012/013/015/016):** from-zero rebuild = **49/49 PASS** (checks #43–#49 added). New pg_cron jobs: `olympiq_recompute_child_access` (hourly) + `olympiq_expire_stale_attempts` (15 min) alongside grade promotion.
- [x] **Test Engine T0 smoke-tested on dev (rolled back):** MCQ rules (4-option and 2-correct payloads rejected, 5/1 accepted), start → TRUE resume → no answer-key leak in the player payload → autosave (`saved:1, remaining:1500`) → submit (graded, idempotent re-submit) → review reveals keys only post-grading → cancel = `canceled`.
- [x] **MCQ-only launch config:** `multiple_choice` (the owner's MCQ — the only type kept on the live taxonomy) = exactly 5 options / exactly 1 correct / only ACTIVE type; other seed types inactive; `assert_question_type_rules` enforced inside both bulk-import RPCs.
- [x] **T1/T2 child TEST UI** — new `child/test/**` route group + `testActions.ts` (guard-first, isUuid-checked, capped arrays, trilingual errors) + `TestSetup` (tri-state topic→subtopic picker + instructions/consent gate) + `TestRunner` (server-deadline countdown w/ color states, palette, flag, 30s autosave + deadline auto-submit, submit/cancel confirm Modals, beforeunload guard, resume) + results (per-topic bars) + review (post-grading keys + explanations) + test home (subject cards, continue-card, history) + arena **Sınaq** tab. `test.*` ×80 keys ×3 locales. Answer keys verified absent from all pre-grading payloads.
- [x] **Admin MCQ management** — `saveQuestion` mirrors `assert_question_type_rules` (active-type gate for new questions, exact 5 options / exact 1 correct with specific trilingual errors); `QuestionForm` renders exactly-N option rows + radio-like correct markers + rules line; bulk templates → 5/1 MCQ + rules note; NEW dedicated **`/question-types`** page (list w/ rules summary + question count; edit name/status/options_required/correct_required, code immutable; delete blocked when in use; audited) replacing the generic registry entry. `qt.*`/`qval.*`/`qrule.*` etc. ×29 keys ×3.
- [x] **Builds:** admin PASS (25 routes incl. `/question-types` ×2) · web PASS (incl. the 5 new `child/test/*` routes). **`ƒ Middleware` now appears in BOTH build outputs** (~90 kB) — audit H9 proven fixed at the build level (it was absent from every earlier build).
- Docs: MANUAL_TESTING_GUIDE **CC1–CC4** (audit fixes visible touchpoints, subscription lifecycle, test engine, MCQ admin).
- **Run-order docs corrected (2026-07-06):** canonical `016_scheduled_jobs.sql` (pg_cron) was missing from the run-order docs — added to `README_RUN_ORDER.md`, `SUPABASE_SQL_RUN_ORDER.md`, `supabase/CLAUDE.md`, the versioning-workflow README, and MANUAL_TESTING_GUIDE §6. Documented the **first-time production build = run canonical `001`→`012`,`014`,`015`,`016`,`013`(last) in order** (migrations are NOT replayed on a fresh prod DB — already backported; enable `pg_cron` before `016`). Owner confirmed production doesn't exist yet; the dev/staging project holds migrations `035/036/037`.

### Round 13.1 (2026-07-06): pre-commit owner changes — bulk-upload modal, question-create modal, olympiads purchase-only, public prep page removed

**Owner rulings:** (1) Bulk Upload becomes a modal with MANDATORY Subject + Grade selection (applies to the general question bank AND the olympiad private pool; UX harvested FROM the owner's UniPrep-Admin reference, implemented natively). (2) The public `/olympiad-preparation` marketing page is removed entirely (the paid olympiad module stays). (3) **Olympiad packages are purchase-only in EVERY mode** — free-access intervals, trials, and the giveaway window grant free SUBJECT access only; they never open olympiad packages, and purchases are now ALLOWED during a giveaway (previously blocked because access was free). (4) Manual question creation happens in a modal on /questions — no page navigation.

- [x] **DB (migration `2026_07_06_038_olympiad_purchase_only.sql`, applied dev with in-file self-verify PASS; backported to canonical `011` + flipped checks `013` #37/#42):** `start_olympiad_attempt` is purchase-gated again — the Round-11/12 giveaway/free-access fallback removed; `start_practice_attempt` (subjects) keeps both free-window helpers. #37/#42 now assert the helpers appear in the practice guard and are ABSENT from the olympiad guard. **From-zero rebuild = 49/49 PASS**; live-dev spot-check of both flipped checks PASS.
- [x] **Admin-panel:** new reusable `Modal.tsx` (portal, aria-modal, Esc/overlay close, busy-lock, scroll lock, wide variant) + shared `BulkUploadModal.tsx` for BOTH surfaces (mode switched by `packageId`): mandatory Subject (read-only package subject on the olympiad surface) + Grade selects, client-side JSON pre-validation (2 MB cap, per-row az-body/options checks, MCQ exactly-5/exactly-1 mirror), per-row issues panel, updated template downloads (meta stripped of subject/grade_level — modal supplies them; old-format files still work, modal selection takes precedence), post-success refresh. Server actions extended: `bulkImportQuestions` + `bulkImportOlympiadQuestions` validate `subject_id`/`grade_id` (UUID + existence) and inject the resolved `subjects.name`/`grades.level` into every item's meta before the RPC (matches the RPC's name/level resolution exactly). `NewQuestionModal.tsx` opens the complete `QuestionForm` in a wide modal (`__stay` path in `saveQuestion` returns success instead of redirecting; edit page unchanged; media upload stays on edit). DELETED: `/questions/import` + `/questions/new` routes, `BulkImportClient.tsx`, `OlympiadBulkImport.tsx`. 17 new i18n keys ×3. Typecheck + build PASS (routes confirm both pages gone).
- [x] **Web-app:** deleted `(public)/olympiad-preparation/` + nav/footer links (+ 7 page-only i18n key families removed ×3, incl. `nav.olympiad`, `gvw.olyFree`); child olympiads tab shows planned section always and playable = OWNED purchases only (free-play merge, free chips, gvw eyebrow chip all removed); `buyOlympiad`/`purchaseOlympiadForChild` now transact in real/demo/giveaway (block only `off`); parent catalog + per-child page show the normal buy CTA during a giveaway; `?err=` notice added on the child olympiads page (graceful message if a stale row hits the new DB guard); `billing.giveawayNote` rescoped to subjects. Subject free access untouched (`childSubjects.ts`, dashboard pills, subscription gating). Typecheck + build PASS (32 pages, route absent).
- Docs: MANUAL_TESTING_GUIDE **DD1–DD3**.

---
## 🗺️ FEATURE PLANS — Leaderboard · Test engine · Notifications (2026-07-05)

**Implementation ORDER APPROVED by owner (2026-07-05): Test engine → Leaderboard → Notifications** (graded attempts feed leaderboard points/streak; several notification events fire off attempts/leaderboard). These 3 plans are the **next major work, still REMAINING** (resume after the Round 12 update pass above). Each plan's **Owner-decisions** list must be resolved at the start of that plan.

Three big features were investigated (6-agent recon over OUR schema + the UniPrep reference in `side/`) and turned into detailed, professional implementation plans. **PLAN ONLY — nothing implemented yet.** We execute each separately:
- **`docs/plans/LEADERBOARD_PLAN.md`** — points board (server-computed, anti-manipulation: append-only per-attempt ledger, `UNIQUE(attempt_id)`, RLS-write-protected columns, difficulty-weighted + daily anti-grind cap, config-driven) + streak board (single-writer `is_active` ground truth, tz-aware, lazy expiry) + live `ROW_NUMBER()` board RPCs with deterministic tie-break + admin config/reset/season + monthly pg_cron. Builds on the existing (empty) `leaderboard_*` tables + graded `test_attempts`.
- **`docs/plans/TEST_ENGINE_PLAN.md`** — subject→topic→subtopic selection → instructions gate → timed player (server-authoritative `deadline_at`, palette, prev/next, flag, 30s autosave, submit/cancel, resume) → results + review-with-explanations. Reuses our attempt engine + RPCs; FIXES UniPrep's real gaps (never ship `correct_answer`; server-enforced timer; server-created attempts; single-open + cron expiry). New RPCs: `start_topic_test_attempt`/`get_test_attempt`/`save_test_answers`/`submit_test_attempt`/`cancel_test_attempt`/`expire_stale_test_attempts`.
- **`docs/plans/NOTIFICATIONS_PLAN.md`** — in-app center (parent+child, Realtime + toast) + admin composer/history/templates + event generators + idempotent single producer path (`create_notification` with `UNIQUE idempotency_key`, mark-read via RPC, no client forge, audited admin sends) + email (optional MVP) + push (mobile-stage ready via `push_tokens` from the mobile plan). Collapses UniPrep's ~17-table sprawl into a small native design; no SMS.

Each plan ends with an **Owner-decisions** list to resolve when we start it, and a staged (L#/T#/N#) rollout with the standard validation gates. Reference teardown findings archived in the session scratchpad (`scratchpad/plans/*.md`).

---
## 📋 PRODUCT COMPLETION BACKLOG (2026-07-04)

Full investigation of everything deferred/unfinished across web + admin + DB (STATUS registries cross-checked against CODE reality) now lives in **`docs/PRODUCT_COMPLETION_BACKLOG.md`** — the single source of truth for remaining work. Key code-level findings: the daily-tasks engine has schema but ZERO app code; the leaderboard has no real board (own-row only, entries tables unpopulated); the **access-recompute job referenced in cancel-flow comments does not exist** (trials/subscriptions never auto-expire — launch blocker); web-app ESLint still unconfigured; coupons/achievements/notifications/support tables entirely unused; parent/student panels have no idle logout (admin only). Plus the known registries: real payments+webhook, demo Billing/Invoices, mock olympiad payment, admin subscription/payment monitoring, Vercel/domain/SMTP, package.json rename, admin polish items (G6–G9).

---
## 📱 MOBILE APP TRACK — PLANNED (v2 2026-07-04), DORMANT UNTIL ACTIVATED

Owner confirmed React Native + Expo. **Master plan upgraded to v2** after owner review — now includes: full navigation architecture (root state machine, parent 5-tab/student 4-tab specs, sheet/back-button rules), complete deep-linking design (olympiq:// + universal links, route map, auth-deferred replay, allowlist), notification architecture designed up front (token lifecycle, categories/channels, admin Send-notification module, payload→deeplink contract), screen-by-screen state matrix (loading/empty/error/offline/gated), forms & input UX, offline/caching policy, app lifecycle, accessibility + localization detail (Dynamic Type, az overflow test), performance budgets, observability (optional sentry-expo decision), EAS environments/versioning/OTA policy (runtimeVersion appVersion), QA device matrix + release checklist, a **web-parity-debt table mapping every backlog item to its mobile seam** (reserved Daily-Tasks tab, full-board Ranking component, coupon field passthrough, IAP-ready idempotent purchase contract, expiry push category), and a risk register. Full plan authored:
- `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` — design truth: stack (Expo SDK 52+/TS strict/expo-router/supabase-js + SecureStore adapter/TanStack Query/zustand/expo-image/RN-svg/bottom-sheet; security-vetted dependency policy, npm audit = 0), UI identity mirrored from web tokens (Energetic light/dark/arena + arena-light remap; i18n SYNCED from web messages.ts), backend integration (direct RLS for user-scoped data; NEW anon-safe `get_mobile_config()` whitelist RPC so the ADMIN PANEL controls flags/maintenance/locales/forced-update without releases; NEW `mobile_app_versions` admin module; privileged flows via web-app BFF `/api/mobile/v1/*` wrapping existing audited service functions — service-role key never ships in the app), full screen↔web parity map, OWASP MASVS-aligned security checklist, children's-data posture, store/IAP compliance decision (v1 = read-only payments recommended).
- Root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` — stages M0 (foundation/design system) → M1 (admin control plane FIRST) → M2 (auth incl. child-login BFF) → M3 (public+news) → M4 (parent) → M5 (student arena) → M6 (commerce posture) → M7 (push, optional) → M8 (hardening/compliance/store) → M9 (launch ops), each with docs-to-read, DB/BFF work, acceptance + security gates.
- Docs wired: root `CLAUDE.md` (mobile activation rule + boundary update), `mobile-app/CLAUDE.md` (rewritten for RN+Expo with reading order), `CODING_AGENT_PROMPTS.md` (Prompt 2 mobile-stage reading rule).
- **To activate:** owner sets "M0 — Foundation" as the active stage here and runs Prompt 2. Owner inputs needed before M8: store accounts, bundle id (suggest `ai.olympiq.app`), push in-scope?, confirm read-only-payments posture (master plan §10).

---
## ✅ INVESTOR REVIEW ROUND 10 — COMPLETE & VALIDATED (2026-07-03)

**Final gate: web typecheck+build PASS (35 routes incl. /dashboard/news + /child/news), admin typecheck+build PASS, migration 024 applied on dev + backported (012 + 013 #32), extended `013` = 32/32 PASS incl. non-destructive from-zero rebuild. Nothing committed yet.**

- [x] F1 CM least-privilege VERIFIED both layers, zero gaps (full module→access→guard matrix below via agent audit): nav flags correct; every admin-only page/action `requireAdmin`; content work `requirePermission(content.*)` with per-transition perms; DB seed grants CM only content.create/edit_own/analytics.read_subject_limited. CMs create/edit/submit content but never approve/publish/delete (intentionally stricter).
- [x] F2 Filters added via one reusable searchParams-driven FilterBar (debounced, URL-as-truth, server-validated uuid/status whitelists, LIKE-escaped): News (status+title search), Olympiad (subject+status+title), Manage resources (name search + status where applicable; Topics +subject; Subtopics +subject→topic cascade), Cities (status+name), Schools (city+status+name).
- [x] F3 Schools: **312 verified Bakı schools seeded** (migration `2026_07_03_024`): the EXACT numbered-school union of the official BŞTİ list pages 1–11 (baku.edu.gov.az/az/page/231, retrieved 2026-07-03; 310 numbers between 1–350 with official gaps preserved) + 2 named institutions; per-district duplicate-guard unique index `uq_schools_district_name`; source documented in the migration header + canonical 012 backport (schema has no source column). Legacy sample rows №6/№20 (not on the official list) left untouched — possible FK references. Other cities deliberately deferred until official lists are sourced (no unverified data).
- [x] F4 Olympiad table alignment: `.table-wrap` (responsive horizontal scroll) + `.nowrap` cells applied on /olympiad and every other admin list touched this round.
- [x] F5 Accounts search (query-level `.or(display_name.ilike,email.ilike)` scoped to parent ids; PostgREST-grammar chars stripped + LIKE-escaped).
- [x] F6 Audit log: 21 app action codes + trigger `op:table` format + 17 entities mapped to trilingual labels (clean-text fallback, never raw); QUERY-level scope to administrator/content_manager actors via profile_roles join (system/trigger NULL-actor rows excluded by the IN); entity filter select.
- [x] F7 Settings: SettingsField restructured — label → control → help → footer row with status + Save (`.sfield-foot`), button no longer floats above the input.
- [x] F8 Footer social links render as inline-SVG platform icons (round chips, aria-label + title, focus ring).
- [x] F9 News images: `images.minimumCacheTTL` 31d (optimized covers cached), first page eager + first two priority, shimmer placeholder on `.news-card-media`.
- [x] F10 In-panel News: shared NewsBrowser/NewsArticleView components; new routes /dashboard/news(+[slug]) and /child/news(+[slug]) inside their shells; parent+student nav items added (parent Home now exact-matched); both dashboards' "View all"/article links stay internal. Public /news keeps the news_public gate; in-app news intentionally ungated (flag governs the PUBLIC section per product model).
- [x] F11 "Tezliklə": Tests&Daily Tasks → **Daily Tasks only** (soon; visible to Admin + CM via content.create).
- [x] F12 "Baxışlar" (Reviews) placeholder REMOVED (review queue = Questions in_review filter + stat card); dead i18n keys pruned ×3.
- [x] F13 Leaderboard flag now gates for real: student nav tab hidden when off + /child/leaderboard shows a clear trilingual "ranking disabled by administrator" notice; flag description already matched.
- Tests note (assumption recorded): no JS test framework exists and adding one would violate the no-new-dependencies constraint — permission/audit/flag/routing verification lives in the SQL validation suite (now 32 checks incl. #32 schools) + builds + the Y1–Y13 manual matrix.

Docs updated: MANUAL_TESTING_GUIDE **Y1–Y13**; demo-data registry unchanged (billing/invoices + olympiad mock payment remain the only demo surfaces).

### Original Round 10 plan

Partition: main session = shared files, admin CSS/structure fixes (F4/F7), web tasks (F8 icons, F9 news images, F10 panel news at /dashboard/news + /child/news, F13 leaderboard flag), F3 schools research+seed (migration 024). Agent A = admin filters (news/olympiad/subjects/topics/subtopics/cities/schools) + accounts search (owns admin messages/globals + those pages, incl. applying the new .table-wrap to fix F4 alignment). Agent B = F1 CM least-privilege verification+fixes, F6 audit log (humanized action/entity + query-level admin/CM-actor filter), F11 Upcoming cleanup (keep Daily Tasks only, admin+CM), F12 remove "Baxışlar"/Reviews placeholder (redundant — questions list filters cover the review queue); returns admin i18n TSV for central merge.

- [ ] F1 CM least privilege (UI + server verified) · [ ] F2 filters ×7 sections · [ ] F3 schools data (verified sources, deduped, source documented) · [ ] F4 olympiad table alignment · [ ] F5 accounts search · [ ] F6 audit log humanize + actor scope · [ ] F7 settings save-button placement · [ ] F8 social icons (aria) · [ ] F9 landing news images · [ ] F10 panel news nav + internal View-all · [ ] F11 Upcoming: Daily Tasks only · [ ] F12 Views/Reviews removed · [ ] F13 leaderboard flag gates + notice
- Tests note: no JS test framework exists in the repo (adding one = new dependency); security-sensitive checks continue to live in the SQL validation suite (013) which gains checks where applicable; permission/flag behavior is verified by build + documented manual checks (guide Y-section).

### Original Round 9 plan (all delivered)

Model: main session = shared files (globals.css, messages.ts, layouts, SQL), root-cause bugs, shared Modal; background agents = UniPrep studies + big builds (contract returns for CSS/i18n).

- [ ] T1 Landing language dropdown shows TWO carets (JSX svg + CSS ::after) — keep the animated one.
- [ ] T2 Parent home "Uşağı sil" button styling broken — restyle to match card buttons (danger variant), same behavior.
- [ ] T3 Uploaded avatar not clipped in the nav circle — enforce fixed square + 50% radius + overflow hidden + object-fit cover on every avatar surface.
- [ ] T4 Analytics: remove the "Orta dəqiqlik" stat card → exactly 5 boxes, even responsive grid (executed inside the T6 analytics rebuild).
- [ ] T5 Shared reusable <Modal> (isOpen/onClose/title/children; portal, overlay click-close, Escape, ×, scroll lock, role=dialog/aria-modal/focus) + rebuild the buggy student "Ətraflı" olympiad modal on it + refactor every other web-app modal to it.
- [ ] T6 Study UniPrep analytics architecture (agent) → implement REAL analytics on our schema (SQL RPC migration 022 over test_attempts/answers/questions/topics; wire parent dashboard to real data; admin analytics where needed). Replaces the Round-8 demo numbers where real data exists.
- [ ] T7 Parent "Olimpiadalar" purchase menu: nav item + page (browse all packages w/ admin price, child selector, mock-payment service isolated for a future provider, shared Modal confirm, purchased/loading/success/error states) → unlocks in student "Olimpiadalarım" (existing purchase_olympiad RPC).
- [ ] T8 Study UniPrep admin Questions page (agent) → implement the missing high-value features in our admin Questions.
- [ ] T9a Admin Wallpapers save silently fails (color AND image) — debug the whole flow (form → action → validation → storage/DB → refresh), fix root cause, add visible success/error feedback.
- [ ] T9b Student background templates must be driven by admin wallpapers (verify the Round-8 gallery is fully DB-driven; no hardcoded list).
- [ ] Validation: typecheck/build both apps, migration applied + backported + from-zero, MANUAL_TESTING_GUIDE + STATUS updates.

### Round 6 — still deferred (owner-acknowledged, tracked)
- **Real payments + webhook activation** (needs a payment-provider decision; schema is provider-agnostic and ready).
- **Trial/charge automation** (trial→paid conversion, failed-charge auto-block, expiry recompute job).
- **Admin subscription/payment monitoring** module (read-only finance views).
- **Brand rename in `package.json`/`README`** (non-UI; safe to do anytime — package names `olimpiada-web-app`/`olimpiada-admin-panel` and repo README still use the old name).
- `notifications_email` gate is wired but idle until an email sender exists.

## ✅ INVESTOR REVIEW ROUND 4 — COMPLETE & VALIDATED (2026-07-01)
Bugs-first then redesign. **Final gate: web typecheck+build PASS (28 routes), admin typecheck+build PASS (20 routes), from-zero DB rebuild = 26/26 PASS.** Nothing committed yet.

### Phase 1 — Critical bugs (root-caused + verified)
- [x] **Add-Child "could not be created"** — root cause: the D2 wizard calls the **10-arg** `create_child_account`, which only existed once **migration 017** was applied to dev (done end of Round 3). Verified the full flow (`addChild`→`getParent`→`createChild`→RPC) returns `ok:true` in the running app. Also improved `getParent`/`getChild` with a one-retry so a transient RPC hiccup can't log a valid parent out.
- [x] **"Logs out every minute" (admin) + logout-on-nav** — root cause: **both apps run on localhost and shared the same Supabase auth cookie** (cookies are domain- not port-scoped). Gave each app its own cookie name (`sb-olimpiada-web` / `sb-olimpiada-admin`) in all 6 client factories. (JWT TTL verified 3600s; IdleTimeout correctly 30 min; guards sound.) → **one-time re-login required after this change.**
- [x] Password-eye **vertical centering** (both apps; `display:block` on the input removes the inline descender gap). Admin **Public→"Hər kəsə açıq" / Private→"Gizli"** (az).
- [x] "News/Contact logs me out" was NOT a real logout — parent nav pointed at the **public** pages; fixed by the parent nav restructure (in-app `/help/*`).

### Phase 1b — Admin bugs
- [x] **Audit log** — real bug: `writeAudit` passed `severity:"error"` (not in the `audit_severity` enum) so the INSERT threw and was **silently swallowed** → rows dropped. Fixed (type-constrained severity, null-coerced blank target_id, errors now logged). Timestamps now render in **Asia/Baku** (Intl `timeZone:'Asia/Baku'`).
- [x] **Cities** — Country Code field removed (server defaults `'AZ'`). **Add-News** — featured-image upload added to the Add-News flow (`/news/new` → create → cover upload → Continue).

### Phase 2 — DB + Landing
- [x] **Migration 018**: `news.view_count` + public `bump_news_view(uuid)` RPC (backported to 014/013; from-zero 26/26; applied to dev).
- [x] **Landing redesign**: **light-mode depth/energy** (elevated cards, shadows/borders; dark untouched); **About Us** section + **stat cards** (illustrative placeholders, inline-SVG art); **side-by-side pricing**; **navbar** now holds the theme toggle + a **language dropdown** (root topbar removed); **FAQ chevrons**; **equal-size** contact info/map; **News** list sort chips (Latest/Oldest/Most-Viewed via `?sort=`) + **pagination** (`?page=`, 6/pg) + view badges; detail page counts views.

### Phase 3 — Parent panel
- [x] Independent parent nav (no wordmark): **Home / Analytics / Subscription / FAQ / Contact** + a far-right **profile drawer** (Account = avatar/password/delete/logout, Language, Theme). **In-app** Contact/FAQ at `/help/faq` `/help/contact` (no public-shell "logout"). **Home** = carousel (fixed — one slide, working arrows/dots) + children with **Add-Child on the right**. New **Analytics** page (real per-parent metrics). Generous spacing.

### Phase 4 — Subscription + Settings + Child
- [x] **Subscription Management** = modern SaaS **cards** per child + a **Cancel flow** (confirm → reason → "what you'll lose" → confirm). New `cancelChildSubscription` action (owner-verified, service-role mutation, access kept until period end; demo-safe).
- [x] Admin **Settings** redesigned user-friendly: friendly flag names+descriptions with On/Off switches; typed inputs for known settings (email / Yes-No / locale select / locales checkboxes) + an Advanced JSON fallback; persistence shape unchanged. (Meta maps moved to `settings-meta.ts` — a `"use server"` file can't export objects.)
- [x] **Child/ARENA** panel: wordmark removed (just "ARENA"); theme toggle + language dropdown added to the arena nav; Student nav is independent.

### Round 4 — deferred (unchanged)
- Real payments + webhook, failed-charge/expiry automation, admin subscription/payment monitoring, pg_cron scheduling of `advance_student_grades()`. News **"Most Liked"** (likes model) deferred — **Most Viewed** shipped. Landing **"Energetic" design image** not received — light-mode polish built to the written spec; align to the image when shared.

## ✅ INVESTOR REVIEW ROUND 3 — COMPLETE & VALIDATED (2026-06-29)
Implemented the full Round-3 punch-list (≈24 change requests) across 7 phases of multi-agent work. **Final gate: admin-panel typecheck+build PASS (20/20), web-app typecheck+build PASS (24/24), from-zero DB rebuild = 25/25 PASS** (dev/staging, non-destructive, rolled back). Nothing committed yet (awaiting owner go-ahead). Updated manual testing guide in `docs/MANUAL_TESTING_GUIDE.md`.

### Phase A — Foundations (DB + theme + i18n)
- [x] **DB migration `2026_06_29_017_cities_schools_grade_promotion.sql`** (backported to canonical 002/003/011/012/013; 013 now 25 checks): repurposed empty `districts` as the admin-managed **City** catalog (15 AZ cities seeded); made `schools.district_id` **NOT NULL** (a school must belong to a city) + sample Bakı schools; added `students.graduated boolean`; added service-role-only RPC **`advance_student_grades()`** (Sept promotion, level<11 → +1, level 11 → graduated; documented pg_cron `0 3 1 9 *`, not auto-scheduled); extended `create_child_account` to 10 args (appended optional `p_district_id`, `p_school_id`).
- [x] **Platform light/dark theme** (web-app): `data-theme` on `<html>` (dark default = reference design), `localStorage "theme"`, no-flash inline script, `ThemeToggle` in topbar; all surfaces (public/parent/child-arena) flip via CSS variables.
- [x] **i18n repair**: admin — all ~60 missing keys added (`settings.*`, `accounts.*`, `audit.*`, `group.operations`, `nav.accounts/audit/cities/schools`, `action.*`) so the raw-key screenshot is fixed; web — Russian public-page fixes (pricing period labels etc.) + authored trilingual content (expanded About, 10 FAQ, pricing copy, contact).

### Phase B — Admin panel
- [x] **Settings** redesigned (feature-flags + JSON settings, readable cards) — keys now resolve.
- [x] **Accounts full CRUD** (`lib/admin/accounts.ts`): create parent (admin client + `setup_parent`), edit (name/status), delete parent (cascade) + delete child, child password reset; `requireAdmin` + service-role + audit_logs entries; typed delete confirms.
- [x] **News action buttons moved to TOP** (Save/Publish/Unpublish/Archive/Delete in a top action bar).
- [x] **Questions list** compacted/professional (zebra/hover, refined pills, tighter columns).
- [x] **Session hardening**: no-session → `/login` (not `/unauthorized`); `/unauthorized` only when authenticated-but-no-role; retry on transient profile/role lookup; **30-min inactivity logout** (`IdleTimeout` mounted in protected layout).
- [x] **Cities & Schools admin CRUD** (new `/cities`, `/schools` routes + nav under Taxonomy); creating a school **requires** a city; deleting a city with schools surfaces a friendly error (FK RESTRICT).
- [x] Active/Inactive → **Public/Private** (i18n `status.active`/`status.inactive`).

### Phase C — Public website
- [x] **Sticky footer** (flex column, footer pinned bottom).
- [x] **Pricing** — placeholder numbers (weekly ≈2 / monthly ≈6 (~25% save) / yearly ≈50 (~30% save) AZN per subject) in a real card grid with savings badges + trial/sibling-discount/disclaimer callouts (not plain text).
- [x] **About** — expanded official multi-section trilingual content.
- [x] **FAQ** — collapsible accordion (`FaqAccordion`).
- [x] **Contact** — Google Maps **embed** (keyless iframe, Government House of Baku) + info card.
- [x] **News** added to public nav + footer.

### Phase D — Auth + Add-Child
- [x] **Password show/hide toggle** everywhere (web `PasswordInput` on login/register/reset/child-login; admin `PasswordInput` on login/account-create/child-reset/user-create).
- [x] **Login/register redesign** — visible placeholders + focus rings, readable in both themes.
- [x] **Existence errors** — register "email already registered" (`parent.err.emailExists`); login "no account" vs "wrong password" (admin-client lookup; enumeration tradeoff noted).
- [x] **Add-Child WIZARD** (`AddChildWizard`): Info → Subjects → Plan → **Demo payment** → ID reveal; **mandatory city→school→grade dropdowns** (school filtered by city, structured `district_id`/`school_id`/`grade_id` into the 10-arg RPC).
- [x] **"Save → /login, child not saved" bug FIXED** — root cause: `requireParent()` `redirect("/login")` throws `NEXT_REDIRECT` inside the action, discarding the submission; fix: resolve parent via `getParent()` and return an in-form error instead of redirecting.

### Phase E — Parent/Student panels
- [x] **Compact** "OlympIQ" brand (parent + child).
- [x] **Profile sections** (parent + child): avatar **upload** (`profile-avatars` bucket → `media_assets` → `profiles.avatar_media_id`, initials fallback), **change password** (parent self; child self with password≠ID rule), delete account (parent only) + logout.
- [x] **Information carousel** ported to the parent dashboard (5 numbered onboarding items).
- [x] **News panels** in parent + child dashboards (latest published).
- [x] **Contact + FAQ** links in the parent shell; styled `.link-danger`.

### Phase F — Question types
- [x] **Type-aware answer validation** in admin `saveQuestion` (single = exactly 1 correct; multiple = ≥1; true/false = exactly 2 options / 1 correct; non-MCQ types rejected for now) + per-type form hints. Grading already dispatches correctly by type (verified `PracticeRunner` + `grade_practice_attempt`); no risky changes to the live grading function.

### Round 3 — still DEFERRED (unchanged from Round 2)
- Real payment charge + **webhook activation** (the wizard's payment step is a clearly-labeled **demo** — trial grants access, no charge), failed-charge auto-block + trial/subscription expiry automation, admin subscription/payment monitoring, pg_cron scheduling of `advance_student_grades()`. Close-future: leaderboard ranking, in-app notifications, achievements/streaks engine, advanced analytics.

## ✅ INVESTOR REVIEW ROUND 2 — COMPLETE & INDEPENDENTLY VALIDATED (2026-06-28)
All change-request batches A–J implemented. **admin-panel + web-app typecheck + build PASS; from-zero DB rebuild = 23/23 PASS** (dev/staging, non-destructive). Deferred-to-end items (real payments, failed-charge/expiry automation, admin subscription/payment monitoring) and the close-future backlog (leaderboard, notifications, achievements/streaks, analytics) remain — recorded above + in the execution plan. Next: owner manual testing (guide in `docs/MANUAL_TESTING_GUIDE.md`), then the backlog.

### Batch I — Admin operations tooling — DONE (typecheck + build PASS; audit cols verified vs `008`)
- [x] I1 **/accounts** — parent/child account monitoring + **admin child-password reset** (`lib/admin/accounts.ts` `resetChildPassword`: `requireAdmin` → service-role `updateUserById`, password≠ID guard, records `password_set_*`; `ChildPasswordReset` client).
- [x] I2 **/audit** — audit-log viewer (reads `audit_logs` cols actor_profile_id/action/target_table/target_id/severity/success, resolves actor names, admin-only).
- [x] I3 **/settings** — settings + feature-flags admin (`FeatureFlagToggle`, `SettingEditor`, `lib/admin/settings.ts`). New "Operations" nav group.

### Batch J — Test & Daily-Task engine ("Arena" Claude Design) — DONE (web-app typecheck + build PASS)
- [x] J1 **Arena design implemented** (web-app student app), keeping all logic/RPCs: scoped `.arena` dark theme in `globals.css` (Chivo + JetBrains Mono); `child/layout` Arena nav + real streak chip; `child/page` hero (rounds CTA → `startPractice`, real mini-stats, rank placeholder — no fabricated data), ticker, today's-rounds, subject-strength; `PracticeRunner` stepper (no difficulty tags); new `child/leaderboard` (read-only, real self data, filter chips, "coming soon"); `ArenaLogin` two-tab **Student (8-digit ID) / Parent (email)** only — NO Center/Admin; child-login + public login restyled. Trilingual `arena.*`/`auth.tab.*`. (`ChildLoginForm` now unused, harmless.)

### Remaining batches — implementation notes (existing files to EDIT, not create)
Prior sessions already built Stage 9–14 engines (these files exist, mostly untracked): admin **olympiad** (`components/OlympiadForm.tsx`, `PoolManager.tsx`, `lib/admin/olympiad.ts`), admin **news** (`components/NewsForm.tsx`/`NewsLifecycle.tsx`, `lib/admin/news.ts`), web-app **subscribe** (`components/SubscribeForm.tsx`, `lib/auth/subscriptionService.ts`), **practice/olympiad** runners (`components/PracticeRunner.tsx`, `lib/auth/olympiadService.ts`), and SQL migrations `2026_06_28_011_parent_registration` … `014_olympiad_engine`. So:
- **C (news image):** add a cover-image uploader to `NewsForm` (browser→`news-media` bucket→`media_assets`→`news.cover_media_id`, mirror `QuestionMediaUploader`) + render the cover on `(public)/news` + `[slug]`.
- **D (olympiad):** `OlympiadForm` already exists → remove its `code` input (auto-gen, like `actions.ts`); add a **private per-package question bank** (new table `olympiad_package_question_bank` + translations/options + a package-scoped bulk-insert RPC + UI in `PoolManager`/new component) NOT linked to general `questions`. Migration + backport + validate.
- **H (add-child + subscribe):** edit `AddChildForm` (Grade/School/City dropdowns), re-sequence so the 8-digit ID is allocated **after** the subscribe/purchase step (split allocation out of `create_child_account`), make child-card subjects editable, and rework `SubscribeForm` (subjects-first checkboxes → subtotal → weekly/monthly/yearly → discount in total).
- **B2-bulk:** change `bulk_insert_questions` to resolve subject/type/olympiad **by name** + drop difficulty (migration + backport); update the import template + remove the codes panel.
- **J (Arena):** implement the attached design for the web-app **child/student** app (home/quiz/leaderboard + Student/Parent-only login), keeping our logic; no difficulty tags.

### DEFERRED — integrate at END of platform (saved here per instruction)
- **Real payments** (provider + checkout + **webhook activation**).
- **Failed-charge auto-block + trial/subscription expiry automation** (scheduled job).
- **Admin subscription/payment monitoring** (separate from account monitoring above).

### FUTURE (also added to `IMPLEMENTATION_EXECUTION_PLAN.md`)
- **Leaderboard** (the Arena design includes a leaderboard screen → build a read-only version in J1; full school/rayon/country ranking is future), **in-app notifications**, **achievements/streaks** (streak shown in Arena UI; full engine future), **advanced analytics/exports**.

### Why the "smaller" items are needed (explanation requested)
- **Content review-queue UI:** gives Content Managers a single place to submit drafts and Admins to approve/publish — enforces separation of duties + a quality gate before content goes public. Today the lifecycle exists but review is ad-hoc per question.
- **Launch 1-month promo logic:** the business model promises a ~1-month launch promo (free access) *before* the ongoing 7-day trial, to drive initial signups. The `launch_promo_config` window exists but isn't applied — needs logic to grant the longer free period during the promo window.
- **Add-subjects-later flow:** parents add subjects to a child over time; without an explicit "add subject → next-cycle pricing" path they'd have to recreate a subscription. (Now folded into H3/H4.)
