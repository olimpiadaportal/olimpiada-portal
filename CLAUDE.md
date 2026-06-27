# CLAUDE.md — Olimpiada Portal Root Instructions

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

## UI / Design Direction (Permanent)

- `web-app/` (Student/Parent) UI must stay **nice but simplistic and easy to restyle later**. The official web-app design is being prepared and shown to an investor; once approved, the owner will share design files from **Claude Design** and that design will be implemented then. Until then, keep web-app styling minimal/neutral so a design system drops in cleanly. Do not over-invest in web-app visuals.
- `admin-panel/` (Administrator/Content Manager) should have a **professional design now** — it is internal and not investor-gated.
- Both apps stay free of business logic and fake data per the stage rules.

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
- `mobile-app/` is future-only. Do not implement the mobile app now.
- `docs/master/` contains the highest-level source of truth.
- `*_CLAUDE_CODE_RULES.md` files are detailed rule references. This `CLAUDE.md` file is the short operational entrypoint.

## Non-Negotiable Rules

- Do not store binary files in PostgreSQL.
- Store actual images, small audio files, avatars, and media in Supabase Storage.
- PostgreSQL stores only file metadata, storage bucket name, object path, ownership, MIME type, and audit fields.
- Do not implement SMS.
- Do not implement optional bank transfer.
- Do not implement current mobile app work.
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
- Users never choose question difficulty; tests use server-side random selection (25 questions for olympiad attempts).
- Never delete purchased olympiad package records; archive listings only (purchasers keep lifetime access).
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

## Coding Behavior

- Make small, reviewable changes.
- Implement one stage/task at a time.
- Prefer typed service functions over scattered raw queries.
- Add validation schemas for user input.
- Add tests for security-sensitive logic.
- Keep business logic out of visual components.
- Do not invent new architecture if the docs already decide it.
- If requirements conflict, stop and write the conflict in `STATUS.md` before changing code.
