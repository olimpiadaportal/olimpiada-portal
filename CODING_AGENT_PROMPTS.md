# CODING_AGENT_PROMPTS.md

## Purpose

This file contains the exact **Claude Code-only** prompts for building the Olimpiada Portal without losing project context.

Use one coding agent: **Claude Code**.

No Codex/ChatGPT review step is part of the current workflow.

---

# Quick Order Map

Use only the prompt that matches the current situation. Do **not** paste all prompts at once.

`STATUS.md` is the source of truth for the active stage.

Database/schema handling is automatic: use Prompt 2 only. Claude must detect whether the active stage includes SQL/database/schema/RLS/Supabase migration work and then apply the Prompt 8 rules internally.

## First time only

Use this flow only once, when the project starts from zero:

```text
Prompt 1 — First Coding Session
→ Prompt 3 — Claude Self-Review
→ Human manual test
→ If issues: Prompt 4 or Prompt 5
→ If passed: Prompt 6 — Manual Testing Passed + Prepare Next Stage
```

After this, do **not** use Prompt 1 again.

---

## Every normal stage after the first session

Use this repeated loop for every implementation stage:

```text
Prompt 2 — Start or Resume Active Stage
→ Claude automatically applies Prompt 8 rules if the active stage includes database/schema work
→ Prompt 3 — Claude Self-Review
→ Human manual test
→ If issues: Prompt 4 or Prompt 5
→ If passed: Prompt 6 — Manual Testing Passed + Prepare Next Stage
→ Then repeat from Prompt 2 for the next stage
```

---

## When to use each prompt

| Situation | Use this prompt |
|---|---|
| First ever coding session | Prompt 1 |
| New terminal/session after first stage | Prompt 2 |
| Continue the active stage | Prompt 2 |
| Start a prepared stage | Prompt 2 |
| Claude finished implementation and you want self-review | Prompt 3 |
| You manually tested and something failed | Prompt 4 |
| Claude self-review found problems, or you want a specific fix | Prompt 5 |
| Manual testing passed and you want to close the stage | Prompt 6 |
| The current task includes database/schema changes | Still use Prompt 2 only; Claude applies Prompt 8 rules automatically |
| Claude starts changing unrelated files or jumping ahead | Prompt 9 |

---

## Token-Saving Rules

Claude must keep usage controlled.

Rules:
- Read only `CLAUDE.md`, `STATUS.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, and the markdown files listed for the active stage.
- Do not reread every project markdown file unless the active stage requires it.
- Do not repeat the full project structure unless something is missing or wrong.
- Do not summarize unchanged files.
- Keep final reports short and practical.
- Update `STATUS.md` with deltas only.
- Do not print long tables unless the human owner asks.
- Do not start the next stage during the closing prompt.
- Do not ask the human to paste Prompt 8 separately; apply it automatically when needed.

---

## Important Project Rules

- Use only the `main` branch unless the human owner explicitly changes this.
- Keep Git initialized only at the root `olimpiada-portal/` folder.
- Do not initialize separate Git repositories inside `web-app`, `admin-panel`, `mobile-app`, or `supabase`.
- This is a monorepo-style project.
- Later Vercel will deploy separate apps using Root Directory settings:
  - `web-app` for the student/parent web app,
  - `admin-panel` for the admin panel.
- `supabase`, `docs`, and `mobile-app` are not deployed to Vercel at this stage.
- Never commit real secrets, `.env`, `.env.local`, service-role keys, private SSH keys, or local Claude settings.

## Confirmed Product Model (2026-06-27)

The product model is confirmed (see `CLAUDE.md` → "Confirmed Product Model" and `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap"): parent-only registration; parent-created children + 8-digit ID + parent-password child login; child-based subject subscriptions with launch promo + 7-day trial + automatic sibling discount (2nd 15% / 3rd+ 20%); real webhook-verified payment (children never purchase); public marketing website; News (public + admin-only CRUD); Olimpiada Preparation paid module with lifetime access and server-side random 25-question selection (no user-chosen difficulty); child wallpaper customization. Content Managers must not manage News/Olympiad/payment modules. Follow these when implementing any related stage.

---

## Mandatory Output — Human Next Actions

After **every** implementation, self-review, fix, or stage-close response, Claude must end with a concise **Human Next Actions** section so the human owner does not have to track the workflow manually.

It must contain, in this order (omit a line only if it is genuinely not applicable, and say so):

1. **What to manually check** — exactly what the human owner should look at/verify.
2. **UI / manual testing needed?** — whether the human must manually test UI/design/business behavior (only when apps exist), and which flows.
3. **Supabase dashboard needed?** — whether the human must use the Supabase dashboard/SQL editor, and for what.
4. **Database run/validation** — if Claude already ran SQL + validation automatically against dev/staging via `OLIMPIADA_DEV_DB_URL`, say so and report PASS/FAIL (never print the URL). Only if automation was impossible, give the exact SQL files and numeric run order (dev/staging first, never production).
5. **Expected success result** — what a passing result looks like.
6. **If it fails** — what to do / which prompt to use to report the failure.
7. **Commit/push?** — whether the human should commit and push.
8. **Suggested commit message** — a ready-to-use commit message.
9. **Deployment check?** — whether the human should check deployment status (only after Vercel is connected later).
10. **Next prompt** — which prompt from this file to use next.

Keep it short and practical. This section is required even when the rest of the report is brief. Never include secrets (DB URL, passwords, keys) in this section.

## Human Owner Role (Keep It Simple)

The human owner's job stays small. Claude Code handles technical validation automatically. The human owner only:

- manually tests UI/design/business behavior once apps exist,
- reports bugs or design issues (use Prompt 4),
- manually commits and pushes to GitHub using the commit message Claude provides,
- checks deployment status manually after Vercel is connected later.

Claude Code handles SQL execution, database validation, fixes, and `STATUS.md` updates automatically for database stages (using `OLIMPIADA_DEV_DB_URL` against dev/staging, never production, never exposing secrets).

---

# Prompt 1 — First Coding Session Prompt

Use this **only once**, when starting the project from zero.

```text
Read `CLAUDE.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, `CODING_AGENT_PROMPTS.md`, and `STATUS.md`.

This is the first coding session.

Treat the project as not implemented yet.

Start with the current active stage in `STATUS.md`.

Complete only Stage 1 — Repository Setup and Tracking.

Do not create Web App features.
Do not create Admin Panel features.
Do not create payment features.
Do not create mobile app features.
Do not create Supabase SQL feature files.
Do not jump to later stages.

Your goals:
1. verify the repository structure,
2. verify the planning files exist,
3. confirm the `CLAUDE.md` files are in the right places,
4. confirm `CODING_AGENT_PROMPTS.md` is Claude Code-only,
5. verify Git baseline:
   - root-level Git repo only,
   - `main` branch only,
   - professional `.gitignore`,
   - no nested Git repos inside app folders,
6. update `STATUS.md` to show Stage 1 progress,
7. tell me whether the project is ready to begin Stage 2 — Supabase SQL Planning and Foundation.

If Git is not initialized:
- initialize Git only at the root `olimpiada-portal/` folder,
- use only the `main` branch,
- create a professional `.gitignore`,
- do not make a commit unless I approve.

After the work:
- list changed files,
- list any missing files/folders,
- list commands/tests run,
- list failed/skipped tests,
- explain anything risky or unfinished,
- update `STATUS.md`,
- stop and wait for approval before Stage 2.
```

---

# Prompt 2 — Start or Resume Active Stage Prompt

MAIN:
----------------
Run Prompt 2 from CODING_AGENT_PROMPTS.md for the current active stage.

Use OLIMPIADA_DEV_DB_URL from the environment.
Do not print or save secrets.
Keep the report short.
----------------

Use this for **every normal coding session after Prompt 1**.

Use it when:
- starting a new Claude terminal session,
- continuing after a break,
- starting the next active stage,
- or asking Claude to implement the active stage from `STATUS.md`.

```text
Read `CLAUDE.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, `STATUS.md`, and `CODING_AGENT_PROMPTS.md`.

Find the current active stage in `STATUS.md`.

Follow only that stage from `IMPLEMENTATION_EXECUTION_PLAN.md`.

Before coding, read only the markdown files listed for this stage.

Rules:
- Do not jump ahead.
- Do not implement future-only features.
- Do not modify unrelated files.
- Do not change architecture decisions unless I approve.
- Keep the implementation aligned with Supabase, Next.js, Vercel, RLS, and the database versioning workflow.
- Do not let PostgreSQL store binary files. Store actual files in Supabase Storage only.
- Do not implement SMS.
- Do not implement optional bank transfer.
- Do not implement the mobile app now.
- Keep the final report concise.

If this stage includes database/schema/Supabase/RLS/storage/migration work, do all of this automatically (no separate prompt needed):
- apply Prompt 8 from this file and the database versioning workflow before writing SQL,
- detect that the stage is database-related from `STATUS.md` and the stage docs,
- check whether `OLIMPIADA_DEV_DB_URL` exists in the environment WITHOUT printing it (e.g. `[ -n "$OLIMPIADA_DEV_DB_URL" ] && echo set || echo missing`),
- check whether `psql` (or another safe SQL execution method) is available,
- if both exist, run the stage's SQL files in the required numeric order against the dev/staging database via `psql "$OLIMPIADA_DEV_DB_URL" -f supabase/sql/0XX_file.sql`, then run the validation queries (`013_validation_queries.sql`),
- if a SQL file errors, identify the exact file and error, fix it inside the current stage scope, and rerun,
- use dev/staging ONLY — never production,
- never print, echo, save, or commit `OLIMPIADA_DEV_DB_URL`, passwords, keys, or any secret; redact any connection string from output,
- if `OLIMPIADA_DEV_DB_URL` or `psql` is missing, do not run SQL — instead give the human the exact run order in `Human Next Actions`,
- update `STATUS.md` (files changed, validation result, environment = dev/staging, blockers).

After implementation:
1. list changed files,
2. list commands/tests run,
3. list failed/skipped tests,
4. summarize risks or unfinished work,
5. update `STATUS.md`,
6. say whether the stage is ready for Claude self-review,
7. end with a concise `Human Next Actions` section (see "Mandatory Output — Human Next Actions" above).
```

---

# Prompt 3 — Claude Self-Review Prompt

Use this **after Claude finishes implementation**, before you manually test.

```text
Self-review the latest changes for the current stage.

Read:
- `CLAUDE.md`
- `IMPLEMENTATION_EXECUTION_PLAN.md`
- `STATUS.md`
- the markdown files listed for the current stage
- only the files changed in this stage

Do not implement new features.
Do not jump to the next stage.
Do not refactor unrelated files.
Do not repeat the full project structure unless something is wrong.

Review your own work for:
- architecture violations,
- security issues,
- Supabase/RLS mistakes,
- database migration/versioning mistakes,
- missing tests,
- broken types,
- bad file structure,
- future-only features implemented too early,
- unnecessary complexity,
- performance/scalability risks,
- places where business logic was put into UI components,
- places where client-side code is trusted too much.

Return concise results:
1. critical issues,
2. important improvements,
3. optional suggestions,
4. files that need changes,
5. whether this stage is safe for manual testing.

If you find critical or important issues, ask for approval before fixing them unless they are clearly within the current stage scope.
```

---

# Prompt 4 — Manual Testing Failed Prompt

Use this when you manually test a stage and something fails.

```text
Manual testing failed for the current stage.

Issue observed:
[describe the exact issue, page, action, expected result, actual result, and screenshots/logs if available]

Stay inside the current stage.
Do not implement new features.
Do not refactor unrelated files.
Do not move to the next stage.
Do not change approved architecture decisions.

Find the cause, fix only what is necessary, run relevant tests, and update `STATUS.md` with:
- issue summary,
- files changed,
- tests run,
- whether the stage is ready for manual retesting.
```

---

# Prompt 5 — Fix Current-Stage Issues Prompt

Use this when Claude self-review finds required fixes, or when you want Claude to fix a specific issue while staying inside the current stage.

```text
Apply only the required fixes for the current stage.

Issue/fix request:
[describe the issue or paste Claude self-review findings]

Do not add unrelated features.
Do not refactor unrelated files.
Do not move to the next stage.
Do not change approved architecture decisions.

Prioritize:
1. security issues,
2. database/RLS/migration mistakes,
3. broken tests/types,
4. architecture violations,
5. failed manual-test behavior,
6. missing required stage behavior.

After fixing:
1. list changed files,
2. run relevant tests,
3. list failed/skipped tests,
4. update `STATUS.md`,
5. summarize what was fixed,
6. tell me if the stage is ready for self-review or manual testing again.
```

---

# Prompt 6 — Manual Testing Passed + Prepare Next Stage Prompt

Use this after you manually test the stage and everything required for that stage works.

This prompt replaces the old separate “Prepare Next Stage” prompt to reduce token usage.

```text
Manual testing passed for the current stage.

Close the current stage and prepare the next stage.

Update `STATUS.md`:
- mark the current stage checklist items as complete,
- add the manual test result to Completed Work,
- record commands/tests that passed,
- record commit/push status if available,
- record any notes or limitations,
- set the next stage from `IMPLEMENTATION_EXECUTION_PLAN.md` as the active stage,
- set the new current task,
- list only the markdown files required for the next stage,
- list only the expected files to change for the next stage,
- list only the key risks for the next stage,
- list the next prompt I should use. If the next stage is database-related, say: `Use Prompt 2; Prompt 8 rules will be applied automatically.`

Do not implement the next stage yet.
Do not reread unnecessary markdown files.
Keep the output concise.
Stop after updating `STATUS.md`.
```

---

# Prompt 7 — Removed

Prompt 7 was intentionally removed to reduce token usage.

The old separate “Prepare Next Stage” action is now included inside:

```text
Prompt 6 — Manual Testing Passed + Prepare Next Stage
```

Do not use Prompt 7.

---

# Prompt 8 — Database Rules Reference

Do **not** paste Prompt 8 separately during normal work.

Prompt 2 must automatically apply these rules whenever the active stage includes SQL/database/schema/RLS/Supabase migration work.

```text
The active stage includes database changes.

Before writing SQL, read:
- `supabase/CLAUDE.md`
- `supabase/README_RUN_ORDER.md`
- `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- `supabase/sql/migrations/README_MIGRATIONS.md`

Follow the database versioning workflow exactly.

Rules:
- Canonical full database definition files live directly under `supabase/sql/`.
- Incremental changes live under `supabase/sql/migrations/`.
- Every accepted migration must be backported into the relevant canonical SQL file.
- Production changes must be migration-script controlled.
- Supabase Dashboard SQL Editor can be used only for development/staging experiments, but the repository remains source of truth.
- Update `STATUS.md` database tracking table.
- Do not write destructive SQL without explicit human approval and rollback notes.
- Keep SQL creation in numeric run order.
- Do not create Web App, Admin Panel, payment, or mobile files during database-only stages.
```

---

# Prompt 9 — Emergency Stop Prompt

Use this if Claude starts changing unrelated files, jumping ahead, or making risky changes.

```text
Stop.

Do not make more changes.

Update `STATUS.md` with:
- what you changed,
- why you changed it,
- which files were affected,
- whether any changes were outside the current stage,
- how to safely revert or continue.

Wait for my approval before doing anything else.
```

---

# Prompt 10 — Simple Human Workflow

This is the normal loop. You do not paste this as a prompt unless you want Claude to explain the process back to you.

```text
First time only:
1. Prompt 1
2. Prompt 3
3. Manual test
4. Prompt 4 or 5 if there are issues
5. Prompt 6 if passed

Every later stage:
1. Prompt 2
2. Prompt 3
3. Manual test
4. Prompt 4 or 5 if there are issues
5. Prompt 6 if passed
6. Repeat from Prompt 2

For database stages, still use Prompt 2 only. Claude reads this file and applies Prompt 8 rules automatically.
```

Keep Claude Code as the only coding agent unless the human owner explicitly changes the workflow later.
