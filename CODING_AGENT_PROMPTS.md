# CODING_AGENT_PROMPTS.md

## Purpose

This file contains the exact **Claude Code-only** prompts for building the Olimpiada Portal without losing project context.

Use one coding agent: **Claude Code**.

No Codex/ChatGPT review step is part of the current workflow.

---

# Quick Order Map

Use the prompts in this order.

## First time only

Use this flow only once, when the project starts from zero:

```text
Prompt 1 — First Coding Session
→ Prompt 3 — Claude Self-Review
→ Human manual test
→ If issues: Prompt 4 or Prompt 5
→ If passed: Prompt 6 — Manual Testing Passed
→ Prompt 7 — Prepare Next Stage
```

After this, do **not** use Prompt 1 again.

---

## Every normal stage after the first session

Use this repeated loop for every implementation stage:

```text
Prompt 2 — Start or Resume Current Stage
→ Prompt 3 — Claude Self-Review
→ Human manual test
→ If issues: Prompt 4 or Prompt 5
→ If passed: Prompt 6 — Manual Testing Passed
→ Prompt 7 — Prepare Next Stage
→ Then use Prompt 2 again for the next stage
```

---

## When to use each prompt

| Situation | Use this prompt |
|---|---|
| First ever coding session | Prompt 1 |
| New terminal/session after first stage | Prompt 2 |
| Continue the active stage | Prompt 2 |
| Claude finished coding and you want it to review itself | Prompt 3 |
| You manually tested and something failed | Prompt 4 |
| Claude self-review found problems, or you want it to fix a specific issue | Prompt 5 |
| Manual testing passed | Prompt 6 |
| Current stage is approved and you want to prepare the next one | Prompt 7 |
| The current task includes database/schema changes | Prompt 8, as an add-on before SQL work |
| Claude starts changing unrelated files or jumping ahead | Prompt 9 |

---

## Important Rule

Do not paste all prompts at once.

Use only the prompt that matches the current situation.

`STATUS.md` is the source of truth for the current active stage. Claude must update it after every implementation, fix, review, or stage transition.

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
Do not jump to later stages.

Your goals:
1. verify the repository structure,
2. verify the planning files exist,
3. confirm the `CLAUDE.md` files are in the right places,
4. confirm `CODING_AGENT_PROMPTS.md` is Claude Code-only,
5. update `STATUS.md` to show Stage 1 progress,
6. tell me whether the project is ready to begin Stage 2 — Supabase SQL Planning and Foundation.

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

# Prompt 2 — Start or Resume Current Stage Prompt

Use this for **every normal coding session after Prompt 1**.

Use it when:
- starting a new Claude terminal session,
- continuing after a break,
- starting the next active stage,
- or asking Claude to implement the active stage from `STATUS.md`.

```text
Read `CLAUDE.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, and `STATUS.md`.

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

If this stage includes database work:
- follow `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`,
- write canonical SQL files under `supabase/sql/`,
- write incremental migrations only under `supabase/sql/migrations/`,
- update migration/backport status in `STATUS.md`,
- never apply production database changes without a migration script.

After implementation:
1. list changed files,
2. list commands/tests run,
3. list failed/skipped tests,
4. summarize risks or unfinished work,
5. update `STATUS.md`,
6. say whether the stage is ready for Claude self-review.
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
- the files changed in this stage

Do not implement new features.
Do not jump to the next stage.
Do not refactor unrelated files.

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

Return:
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

# Prompt 6 — Manual Testing Passed Prompt

Use this after you manually test the stage and everything required for that stage works.

```text
Manual testing passed.

Update `STATUS.md`:
- mark the current stage checklist items as complete,
- add the manual test result to Completed Work,
- record any notes or limitations,
- record commands/tests that passed,
- set the next recommended task to the next stage from `IMPLEMENTATION_EXECUTION_PLAN.md`.

Do not implement the next stage yet.
Stop after updating `STATUS.md`.
```

---

# Prompt 7 — Prepare Next Stage Prompt

Use this only after the current stage has passed implementation, Claude self-review, required fixes, and manual testing.

```text
The current stage is approved.

Prepare the next stage from `IMPLEMENTATION_EXECUTION_PLAN.md`.

Update `STATUS.md` first:
- set the new active stage,
- set the new current task,
- list the markdown files that must be read for the new stage,
- list expected files to change,
- list risks for the new stage,
- list the next prompt I should use.

Do not code the next stage yet.
Stop and wait for my approval before coding.
```

---

# Prompt 8 — Database Change Add-On Prompt

Use this as an **add-on** whenever the current stage needs SQL/database changes.

Paste it after Prompt 1 or Prompt 2 if database work is involved.

```text
This task includes database changes.

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
6. Prompt 7 to prepare next stage

Every later stage:
1. Prompt 2
2. Prompt 3
3. Manual test
4. Prompt 4 or 5 if there are issues
5. Prompt 6 if passed
6. Prompt 7 to prepare next stage
7. Repeat from Prompt 2
```

One branch per stage is recommended:

```text
stage-01-repository-setup
stage-02-supabase-foundation
stage-03-auth-rbac-rls
stage-04-app-skeletons
stage-05-admin-taxonomy
```

Keep Claude Code as the only coding agent unless the human owner explicitly changes the workflow later.
