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

## Current Implementation Direction

Build in this order:

1. Repository setup and status tracking
2. Supabase database/security foundation
3. Auth, profiles, roles, permissions, and RLS
4. Admin Panel foundation
5. Admin content taxonomy and question management
6. Test and daily task engine
7. Student Web App core flows
8. Parent Web App flows
9. Stripe-first subscription/payment flow
10. Progress, analytics, leaderboard, notifications
11. QA, security testing, deployment
12. Future mobile readiness only

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
