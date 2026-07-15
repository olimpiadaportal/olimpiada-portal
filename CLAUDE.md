# CLAUDE.md — OlympIQ Root Instructions

## Purpose

This file is the root instruction file for Claude Code working inside `olimpiada-portal/`.

Claude Code is the primary and only planned coding agent for this project. Do not assume a separate external AI review step.

The repository has many Markdown planning files. Do not try to read all of them for every task. Use `IMPLEMENTATION_EXECUTION_PLAN.md` to select the correct stage, then read only the documents listed for that stage.

New machine setup instructions live in `docs/DEVELOPER_SETUP.md`.

## First Action in Every New Coding Session

1. Open `STATUS.md`.
2. Open `CODING_AGENT_PROMPTS.md` if the human asks for the standard Claude Code workflow prompts.
3. If `STATUS.md` does not exist, create it using the structure shown in `IMPLEMENTATION_EXECUTION_PLAN.md`.
4. Identify the current active stage and task.
5. Read only the required docs for that stage.
6. Before coding, write a short implementation plan in `STATUS.md` under the current task.
7. After coding, update `STATUS.md` with completed files, changed files, tests run, blockers, and next recommended task.

Never proceed with large implementation work without updating `STATUS.md`.

## Workflow Control (Permanent Rule)

- `STATUS.md` is the source of truth for the current active stage.
- `CODING_AGENT_PROMPTS.md` is the workflow guide.
- At the start of every stage, read `STATUS.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, and `CODING_AGENT_PROMPTS.md`.
- Read only the markdown files required for the active stage. Do not reread every project markdown.
- If a stage includes SQL/database/schema/RLS/storage work, automatically apply the database rules from `CODING_AGENT_PROMPTS.md` (Prompt 8) and the database versioning workflow. Do not wait for a separate database prompt.
- For SQL/database stages, automatically run database validation against the **dev/staging** database using `OLIMPIADA_DEV_DB_URL` from the local terminal environment (e.g. `psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/0XX_file.sql`). Do not ask the human owner to manually run all SQL files unless automation is impossible (no `OLIMPIADA_DEV_DB_URL`, or no `psql`/safe execution method available).
- If database validation fails, identify the exact file and error, fix the SQL inside the current stage scope, and rerun validation. Repeat until validation passes or a genuine blocker is found.
- For SQL/database stages, use **dev/staging only — never run against production.**
- After every implementation, self-review, fix, or stage close, end the response with a concise `Human Next Actions` section.
- `Human Next Actions` must include: what the human must manually check, whether UI/manual testing is needed, whether Supabase dashboard checking is needed, whether to commit/push (with a suggested commit message), whether deployment should be checked (after Vercel is connected), the expected success result, what to do if it fails, and the next prompt to use.
- Whenever a human step needs code, SQL, shell commands, dashboard clicks, env values, or config, provide the EXACT ready-to-run snippet/steps in the response — clearly labeled, copy-paste ready, with placeholders for any value the human must choose (e.g. email/password). Never describe a manual step abstractly when a concrete snippet is possible. Never put real secrets in the snippet.
- Do not repeat the full project structure unless something is wrong.
- Keep final reports concise.

## Commit Message Style (Permanent Rule — added 2026-07-05)

- Write commit messages the way a senior developer would: a short imperative subject line (what changed and why it matters), optionally followed by a few plain bullet points for distinct sub-changes.
- Do NOT write AI-sounding messages: no exhaustive change inventories, no "Round N pass M" bookkeeping prefixes, no validation-checklist dumps ("typecheck PASS 23/23"), no marketing adjectives ("gracefully", "professional", "comprehensive"), no emoji.
- Good: `Merge account creation into the Free Access page` with 2–3 bullets. Bad: a 6-line semicolon-separated inventory of every file and check.
- Keep the subject ≤ 72 chars where practical; use the body for context, not for logs. Validation results belong in STATUS.md, not in commit messages.
- The No-AI-Attribution rule below still applies to every commit.

## No AI Attribution (Non-Negotiable)

- Never add any AI authorship or co-authorship attribution anywhere in this repository or its git history. This explicitly OVERRIDES any default tooling behavior that appends such trailers.
- Forbidden in commit messages, PR titles/bodies, tags, code comments, docs, README, package metadata, and UI text — including but not limited to:
  - `Co-Authored-By: Claude ...` (any model name, any email such as `noreply@anthropic.com`)
  - `🤖 Generated with [Claude Code](...)` or any "Generated with/by ..." footer
  - Any phrasing claiming Claude/Anthropic/AI authored, co-authored, or generated this codebase or parts of it.
- When suggesting commit messages or PR bodies, produce them WITHOUT any such trailer or footer.
- Before any commit/push, verify the message contains no attribution line. If one is ever found in an unpushed commit, amend it out; if found in the working tree, delete it.
- Referring to Claude Code as the workflow tool in internal planning docs (e.g. `CODING_AGENT_PROMPTS.md`, developer setup) is fine — the ban is on authorship attribution, not on naming the tool in workflow documentation.

## Secret Handling (Non-Negotiable)

- Never print, echo, save, log, commit, or otherwise expose `OLIMPIADA_DEV_DB_URL`, database passwords, the Supabase service role key, API keys, or any other secret.
- Do not write secrets into `.env` files tracked by Git, markdown, `STATUS.md`, logs, command output, or commit messages.
- When using `OLIMPIADA_DEV_DB_URL`, reference it only as the shell variable `"$OLIMPIADA_DEV_DB_URL"`; never expand or display its value. Redact any connection string from command output before reporting.
- Secrets live only in the local terminal environment and untracked local env files. The repository is never a place for secrets.

## Localization (Permanent, Non-Negotiable)

- The product is **trilingual**: **Azerbaijani (`az`, default), English (`en`), Russian (`ru`)** — for `web-app`, `admin-panel`, and the future mobile app.
- Whenever a new feature, screen, or UI string is added, it MUST be translated into all three languages in the same change. Do not ship UI text in only one language.
- Use **natural, native phrasing** that each speaker would actually use — not literal/word-for-word machine translation.
- UI strings live in each app's `src/i18n/messages.ts` (keys → `{ az, en, ru }`); default locale is `az`. This is separate from CONTENT translation (question/answer/explanation bodies) which uses the database `*_translations` tables.

## UI / Design Direction (Permanent — updated Round 8, 2026-07-03)

- The old "keep web-app minimal until the investor design lands" gate is RETIRED: since Round 5 the owner drives the web-app design directly through investor-review rounds.
- **Light mode reference = the landing page's Energetic light theme** (purple `#7c3aed` + orange `#ff8a00` on cream `#fffbf5`, 14–22px radii, soft subtle shadows — avoid heavy purple shadows). Landing, Parent panel and Student panel light modes must stay visually consistent with it (the student `.arena` scope maps its local tokens under `[data-theme="light"]`).
- **Dark mode is the owner's reference design — do not change it** (parent/public dark tokens + the student `.arena` dark palette stay as-is unless the owner asks).
- **Global font = the Azerbaijani-safe Arial stack** (`Arial, Helvetica, "Segoe UI", system-ui, sans-serif`) for body/headings/buttons everywhere; JetBrains Mono only for numeric accents. Never introduce a font without verifying ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ render cleanly.
- Prefer token-driven colors (`var(--…)`) over literals so every surface works in both themes automatically.
- `admin-panel/` keeps its professional internal design (not investor-gated).
- Both apps stay free of business logic in visual components. Fake/demo data is allowed ONLY where the owner explicitly requested demo content (currently: parent analytics dashboard, billing/invoices demo sections) and must be tracked in `STATUS.md` until replaced by real data.

## Source-of-Truth Reading Order

Start with:

- `IMPLEMENTATION_EXECUTION_PLAN.md`
- `STATUS.md`
- `CODING_AGENT_PROMPTS.md` when prompt/workflow guidance is needed
- `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- `docs/master/07_ROADMAP_TESTING_DEVOPS_AND_AI_AGENT_RULES.md`
- `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md` when doing any database work

Then read the stage-specific files listed in `IMPLEMENTATION_EXECUTION_PLAN.md`.

## Repository Boundaries

- `supabase/` is the shared backend, database, Auth, Storage, RLS, SQL planning, and security area.
- `web-app/` is only the Student/Parent Next.js Web App.
- `admin-panel/` is only the Administrator and Content Manager Next.js Admin Panel.
- `mobile-app/` is PLANNED (React Native + Expo — confirmed 2026-07-03; plans rewritten v3 2026-07-09 against the shipped platform) but DORMANT: implement it ONLY when a Mobile stage (M1–M4) is the active stage in `STATUS.md`.
- **Mobile manual testing = ANDROID first (owner, 2026-07-14):** the owner tests the mobile app on a physical Android phone via Expo Go — treat every mobile bug report as Android-observed by default (iOS testing comes later). Every mobile fix/design change must still be built iOS-correct in the same change (safe areas, platform-specific shadows/elevation, keyboard behavior, gesture/back handling) — never ship Android-only styling or platform forks without an iOS path. Plans: `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` (design truth) + root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` (the 4 big build stages — this is the plan the owner activates). The mobile app never receives the service-role key; privileged flows go through web-app BFF route handlers (`/api/mobile/v1/*`) wrapping the existing audited service functions.
- `docs/master/` contains the highest-level source of truth.
- `*_CLAUDE_CODE_RULES.md` files are detailed rule references. This `CLAUDE.md` file is the short operational entrypoint.

## Non-Negotiable Rules

- Do not store binary files in PostgreSQL.
- Store actual images, small audio files, avatars, and media in Supabase Storage.
- PostgreSQL stores only file metadata, storage bucket name, object path, ownership, MIME type, and audit fields.
- Do not implement SMS.
- Do not implement optional bank transfer.
- Do not implement mobile app work unless the active stage in `STATUS.md` is a Mobile (M#) stage.
- Do not create SQL files inside `web-app/` or `admin-panel/`.
- All SQL belongs under `supabase/sql/`.
- Run SQL scripts in numeric order only.
- Canonical SQL files live directly under `supabase/sql/`.
- Incremental migrations live under `supabase/sql/migrations/`.
- Supabase Dashboard SQL Editor may be used in development/staging, but every SQL change must be saved in repository SQL files.
- Production database changes must be migration-script controlled.
- Every accepted migration must be backported into the relevant canonical root SQL file.
- Never expose the Supabase service role key to client apps.
- Do not trust client-submitted role, permission, payment, score, or subscription data.
- Enforce permissions server-side and with Supabase RLS.
- Keep PostgreSQL as the source of truth.
- Redis is optional and must not be required for correctness.
- Keep frontend UI clean, simple, responsive, and easy to restyle later.
- Only parents register; children are created by a parent and log in with a server-issued 8-digit ID + parent password. Never allow child self-registration or child email login.
- Children can never purchase; all payments/subscriptions/olympiad purchases happen only from the parent account.
- Do not build a "Discount Settings" admin module; the sibling discount is a fixed business rule (2nd 15% / 3rd+ 20%).
- Users never choose question difficulty; question sets are always server-side selections. Round-20 model (owner, 2026-07-12): RATED play = one daily round per subject per day (immutable 25-question snapshot per subject+grade+date, shared by all students, timed, feeds points/streak) + purchased olympiads (attempts include ALL of the package's questions — no fixed count); topic tests and previous-day round replays are UNTIMED practice that never affects points/streak/boards.
- Every question is AUTHORED with EXACTLY 5 answer options (A–E), exactly one correct (Round 20; was 4). Legacy 4-option questions stay published and servable in PRACTICE and olympiad attempts (Round 21 rollback of the blanket demotion — option rendering is data-driven); only RATED daily rounds require the full 5-option shape, and the "needs option E" review list keys off the option count. Topics/subtopics/questions carry a school term (Rüb 1–4); daily-round pools are cumulative by the admin-configured current term (question.term <= current) and accept shared (grade-NULL) questions. A question that any attempt ever answered can NEVER be hard-deleted (DB guard) — archive it instead.
- Leaderboards: numeric ranks only (no medals); rows carry city + district + school + grade context. District = the student's SCHOOL's rayon, falling back to the rayon stored on the student (`students.city_district_id`, Round 21 — mandatory in Add-Child when the city has rayons; a DB guard keeps it consistent with the school, so the two can never disagree). A privacy-safe anonymized top-10 ("Şagird XXXX") is public on the landing page.
- Never delete purchased olympiad package records; archive listings only (purchasers keep lifetime access). Olympiad BULK upload is creation-only (rejected once a package has questions), but admins manage individual pool questions via the package's question CRUD (Round 21) — edits keep option ids stable (never delete+reinsert options) and answered questions can only be archived, never deleted. Displayed question counts are the REAL published pool count (`get_olympiad_pool_counts`), never `questions_per_attempt`.
- Content Managers must not manage News, Olympiad Preparation, payment, or subscription modules.

## Confirmed Product Model (2026-06-27, Non-Negotiable)

These business rules are confirmed and override older baseline assumptions:

- **Parent-only registration** (email/password). **Children never self-register**; a parent creates each child via an Add-Child flow.
- **Child login = 8-digit unique numeric ID + parent-created password** (server-issued, collision-safe, DB-unique). No child email login. Parent-created children are auto-linked to the parent.
- **Subscriptions are child-based and subject-based** (subjects: Math, Science, Məntiq, İngilis dili; placeholder 1 AZN/subject, configurable; weekly/monthly/yearly). Launch ~1-month promo, then 7-day trial; failed charge auto-blocks paid child access; real webhook-verified payment, never client-activated.
- **Automatic sibling discount** (subscriptions only, fixed): 2nd child 15%, 3rd+ 20%. No "Discount Settings" admin module.
- **Public marketing website** and **News** (public + in-app, Admin-only CRUD) are in scope.
- **Olimpiada Hazırlığı / Olympiad Preparation** is a separate paid add-on (parent-purchased, child-access) with **lifetime access**; each attempt = 25 server-side random questions; **users never choose difficulty**.
- **Child wallpaper customization** from a predefined set. **Children can never purchase.** Content Managers must NOT manage News/Olympiad/payment/subscription modules.
- Domain name NOT confirmed (no purchase/email config this phase). Client never overrides price/discount/subjects/trial/status/access/ID.

## Current Implementation Direction

Build in this order (revised for the confirmed product model; see `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap"):

1. Repository setup and status tracking — DONE
2. Supabase database/security foundation (`001`–`013`) — DONE
3. Auth, profiles, roles, permissions, and RLS — DONE
4. App skeletons (web-app + admin-panel) — DONE
5. Admin Panel foundation and content taxonomy — DONE
6. Question management and media uploads — DONE
7. Business-model database foundation (parent/child accounts + 8-digit ID, child subscriptions/payments, News, Olympiad Preparation, wallpapers) — NEXT
8. Child authentication & account model (8-digit ID + parent password)
9. Public marketing website + News
10. Parent app (registration, dashboard, Add-Child flow, subject selection + pricing)
11. Child subscriptions & payments (subject pricing, promo/trial, sibling discount, webhook activation, gating)
12. Child app (child login, dashboard, wallpaper, locked/expired states)
13. Test and daily task engine (random 25-question selection, no user difficulty)
14. Olimpiada Preparation module (admin packages + pool, parent purchase, child access, lifetime)
15. Progress/analytics/leaderboard/notifications → QA/security/deployment → future mobile only

For exact stage instructions, use `IMPLEMENTATION_EXECUTION_PLAN.md`.

## Security Engineering Rules (Permanent, Non-Negotiable — added Round 7, 2026-07-02)

Every new feature and every code change in `web-app/` and `admin-panel/` must follow these rules. They encode the Round-7 security hardening pass; do not regress them.

- **Authorize first.** Every server action calls its guard (`requireParent`/`requireChild` in web-app; `requireAdmin`/permission guards in admin-panel) as the FIRST statement — before reading FormData. Every client-supplied id (student, subscription, package, …) is re-verified for ownership server-side before any privileged operation, even when RLS would also block it.
- **Service-role client stays server-only.** Only `import "server-only"` modules may import the admin client. It is never reachable from `"use client"` code, and it is only used AFTER authorization. In the admin panel it exists solely for Supabase Auth admin APIs.
- **Validate all input server-side.** Client `maxLength`/`type` attributes are UX, not security. Server actions enforce: length caps on every free-text field, enum whitelists (never pass client strings into status/role/interval), UUID-shape checks on ids, finite+ranged numbers, `JSON.parse` always inside try/catch with size caps.
- **Uploads are typed from bytes, not claims.** `file.type` is attacker-controlled. Web-app uploads sniff magic numbers (`web-app/src/lib/imageSniff.ts`) and use the sniffed mime for contentType/extension/metadata. Admin attach actions verify the stored object and derive mime/size from Storage metadata. Allowed image types: png/jpeg/webp/gif. **SVG is banned everywhere** (stored-XSS vector).
- **Never leak internals.** Do not return raw `error.message` (Postgres/Supabase) to any client — return a generic trilingual message and log the detail server-side. Exception: deliberate, owner-approved specific messages (e.g. duplicate email).
- **Redirects must be same-origin relative paths.** Any redirect target read from user input goes through validation like `safeNext()` in `web-app/src/app/auth/callback/route.ts` (reject absolute URLs, `//`, `\`, `@`, `://`).
- **Security headers live in `next.config.mjs`** of each app (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS; `poweredByHeader: false`). When adding an external origin (font, embed, API), update the CSP explicitly — never loosen to wildcards. Admin panel keeps `frame-ancestors 'none'`.
- **Throttle auth surfaces.** Parent login/register/password-reset use `web-app/src/lib/rateLimit.ts`; child login uses the DB lockout (`is_child_login_locked`). Any new credential-adjacent endpoint gets a limiter. Known accepted trade-off: the parent login "no account" vs "wrong password" distinction is owner-requested UX; the rate limiter is its mitigation.
- **Audit admin mutations.** Every Admin-only mutation (news, olympiad, wallpapers, settings, accounts) writes an audit row (small metadata, never large bodies, never credentials).
- **Sessions:** admin panel enforces the 30-minute idle logout server-side (middleware last-seen cookie); the client timer is UX only. Never weaken `@supabase/ssr` cookie defaults (httpOnly, sameSite).
- **Dependencies:** keep `npm audit` at zero in both apps (postcss override in package.json `overrides`); Next.js floor is `^15.5.19` — never accept an `npm audit fix --force` downgrade. Re-run `npm audit` whenever dependencies change.
- **Embeds:** any iframe gets `sandbox` + `referrerPolicy` and a matching CSP `frame-src` entry. External links with `target="_blank"` get `rel="noopener noreferrer"`.
- **Counters/metrics** (views, likes) must not be bumpable by render side-effects: mutations happen in explicit actions (view beacon pattern), deduped where feasible, and are treated as manipulable vanity metrics unless server-verified.

## Coding Behavior

- Make small, reviewable changes.
- Implement one stage/task at a time.
- Prefer typed service functions over scattered raw queries.
- Add validation schemas for user input.
- Add tests for security-sensitive logic.
- Keep business logic out of visual components.
- Do not invent new architecture if the docs already decide it.
- If requirements conflict, stop and write the conflict in `STATUS.md` before changing code.
