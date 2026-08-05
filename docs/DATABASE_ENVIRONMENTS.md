# Database environments — production vs staging

Owner runbook. Do it once; it takes about ten minutes.

---

## The two databases

| | Production | Staging |
|---|---|---|
| Env var | **`OLIMPIADA_PROD_DB_URL`** | **`OLIMPIADA_STAGING_DB_URL`** |
| Supabase project | the existing `eu-west-1` one | a new free one |
| Serves | `olympiq.ai`, mobile app, admin panel | nothing — schema only |
| Holds | real accounts | no real data, ever |
| Region | West EU (Ireland) | West EU (Ireland) — must match |

**Owner decision, 2026-08-04:** the existing project **is** production. It was not migrated
to a fresh project because a Supabase region is permanent, Ireland is the right region for
Azerbaijani users, and a from-zero rebuild had already proved the canonical SQL reproduces
it exactly (88/88).

### Why staging has to exist

The strongest check in this repo is the **from-zero rebuild proof**: wipe a database,
rebuild it from the canonical files `001`–`016` alone, and run the 88 validation checks.
It is what guarantees those files can still recreate the platform after a disaster — and
it catches backport drift (it caught a broken `get_mobile_config` shape in migration 097).

It is also destructive, and `rollback` is **not** a reliable guard. On 2026-07-29 that
proof destroyed this very database: migration `2026_07_29_095` carried its own
`begin; … commit;`, and the inner `commit` committed the *outer* transaction — including
the `drop schema public cascade`. Everything went.

So: the proof keeps running, but never again against real users' data.

---

## Step 1 — Create the staging project

Supabase Dashboard → **New project**

| Field | Value |
|---|---|
| Organization | same as production |
| Name | `olympiq-staging` |
| Database password | generate a strong one, save it to your password manager |
| Region | **West EU (Ireland)** — must match production |
| Plan | Free |

Provisioning takes ~2 minutes.

## Step 2 — Enable `pg_cron`

Database → **Extensions** → search `pg_cron` → enable.

Do this **before** the schema is built. `016_scheduled_jobs.sql` self-skips when `pg_cron`
is absent, and the cron jobs then silently never register.

## Step 3 — Copy the connection string

Project Settings → **Database** → Connection string → **URI**.

If a direct connection fails, use the **Session pooler** string — new Supabase projects are
IPv6-only on the direct host. Do **not** use the transaction pooler; it cannot run all the
DDL the canonical files need.

## Step 4 — Set the variables

PowerShell, persistent (User scope):

```powershell
[Environment]::SetEnvironmentVariable("OLIMPIADA_STAGING_DB_URL", "<paste the staging URI>", "User")
```

## Step 5 — Rename the production variable

**This is the step that actually prevents an accident.**

The production connection string is still called `OLIMPIADA_DEV_DB_URL`. Every older
instruction in this repo says "run validation against dev/staging using
`OLIMPIADA_DEV_DB_URL`" — so that name now reads as an invitation to run a destructive
rebuild against real accounts.

```powershell
[Environment]::SetEnvironmentVariable("OLIMPIADA_PROD_DB_URL", $env:OLIMPIADA_DEV_DB_URL, "User")
[Environment]::SetEnvironmentVariable("OLIMPIADA_DEV_DB_URL", $null, "User")
```

The first line copies the value across without ever displaying it.

## Step 6 — Reopen the terminal and verify

Environment changes never reach an already-running shell.

```powershell
if ($env:OLIMPIADA_PROD_DB_URL)    { "PROD: set" }    else { "PROD: MISSING" }
if ($env:OLIMPIADA_STAGING_DB_URL) { "STAGING: set" } else { "STAGING: MISSING" }
if ($env:OLIMPIADA_DEV_DB_URL)     { "OLD DEV VAR: still set - remove it" } else { "OLD DEV VAR: gone" }
```

This prints only "set"/"missing" — never a connection string.

## Step 7 — Build the staging schema

Hand it back to Claude Code: it runs the canonical files `001`→`012`, `014`, `015`, `016`,
then `013` (validation) **last**, against `"$OLIMPIADA_STAGING_DB_URL"`.

Expect **88/88 PASS**. That first run *is* the from-zero proof — passing it confirms both
that staging is correct and that the canonical files still match production.

> Bootstrap from the **canonical** files, never by replaying `supabase/sql/migrations/`.
> Every migration is already backported; replaying them on a clean database double-applies.

---

## What is allowed to run where

| Operation | Production | Staging |
|---|---|---|
| `013_validation_queries.sql` (read-only) | ✅ | ✅ |
| Forward migration (`migrations/…`) | ✅ — **only after** it passes on staging | ✅ first |
| From-zero rebuild (`drop schema public cascade`) | ❌ **never**, not even inside a transaction | ✅ |
| Ad-hoc `DELETE` / `DROP` / schema experiments | ❌ | ✅ |

Two mandatory guards, both encoded in root `CLAUDE.md`:

1. Before any rebuild, grep every file to be sourced for `^\s*(begin|commit|rollback)\s*;`
   and abort if a canonical file self-transacts. **Never `\i` a migration inside a rebuild.**
2. If `OLIMPIADA_STAGING_DB_URL` is unset, the rebuild is **skipped and reported**, never
   redirected to production. A skipped proof is a tracked gap; a rebuild against
   production is unrecoverable.

---

## Keeping staging useful

Staging drifts the moment a migration lands on production without landing there too. Keep
it honest cheaply:

- Run every new migration on staging **first**, production second.
- If it drifts badly, don't repair it — **delete the project and redo steps 1–7**. It holds
  nothing worth saving, and a rebuild from canonical files is the point.

## Related

- Root `CLAUDE.md` → *Workflow Control* — the binding rules
- `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md` — migration → apply → backport loop
- `supabase/README_RUN_ORDER.md` — canonical file order
- `STATUS.md` → *GO-LIVE CHECKLIST* — Supabase Pro (point-in-time recovery) is item #1
