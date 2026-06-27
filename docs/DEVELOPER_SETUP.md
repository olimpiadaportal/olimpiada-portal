# DEVELOPER_SETUP.md — New Machine Setup

Concise, practical setup for moving Olimpiada Portal to a new laptop.
Target environment: **Windows + VS Code + Claude Code**.

> **No secrets in this file.** All values below are placeholders. Never paste real
> passwords, tokens, database URLs, or SSH private keys into the repo or any doc.

---

## 1. Required tools

Install these first:

| Tool | Notes |
|---|---|
| **Git** | https://git-scm.com/download/win (includes Git Bash) |
| **VS Code** | https://code.visualstudio.com |
| **Node.js LTS** | https://nodejs.org (LTS build) — verify: `node -v`, `npm -v` |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` — verify: `claude --version` |
| **PostgreSQL 17 / `psql`** | https://www.postgresql.org/download/windows/ — adds the `psql` client |
| **GitHub SSH** | see section 2 |

Make sure `psql` is on your `PATH` (the Postgres installer's `bin/` folder, e.g.
`C:\Program Files\PostgreSQL\17\bin`).

---

## 2. GitHub SSH setup

This project uses an SSH host alias `github.com-olimpiada` so the correct key/account
is always used.

**a. Generate or reuse a project key** (in Git Bash):

```bash
ssh-keygen -t ed25519 -C "olimpiada-portal" -f ~/.ssh/id_ed25519_olimpiada
```

Add the **public** key (`~/.ssh/id_ed25519_olimpiada.pub`) to the GitHub account
under Settings → SSH and GPG keys.

**b. Configure `~/.ssh/config`** (create the file if missing):

```sshconfig
Host github.com-olimpiada
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_olimpiada
    IdentitiesOnly yes
```

**c. Enable and start `ssh-agent`** (PowerShell, run once as Administrator):

```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
```

**d. Add the key once:**

```bash
ssh-add ~/.ssh/id_ed25519_olimpiada
```

**e. Test the connection:**

```bash
ssh -T git@github.com-olimpiada
```

Expect: `Hi <username>! You've successfully authenticated...`.

---

## 3. Clone the project

```bash
git clone git@github.com-olimpiada:olimpiadaportal/olimpiada-portal.git
cd olimpiada-portal
```

---

## 4. Local Git identity (repo-scoped)

Set identity **for this repo only** so commits are attributed correctly:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

Verify: `git config --get user.name` and `git config --get user.email`.

---

## 5. Supabase dev/staging database setup

- Save **only the dev/staging** connection URL as a Windows **user** environment
  variable named `OLIMPIADA_DEV_DB_URL`.
- **Never** save the production DB URL on a dev machine.
- **Never** commit `.env`/secret files (`.env*` is already git-ignored).

Set the user env var (PowerShell — replace the placeholder with your real
dev/staging URL; do not share it):

```powershell
setx OLIMPIADA_DEV_DB_URL "postgresql://USER:PASSWORD@HOST:5432/DBNAME"
```

> `setx` persists the variable for **new** terminals. Close and reopen your terminal
> (and VS Code) afterward.

**Verify it exists without printing the value:**

```bash
# Git Bash
[ -n "$OLIMPIADA_DEV_DB_URL" ] && echo "set" || echo "missing"
```

```powershell
# PowerShell
if ($env:OLIMPIADA_DEV_DB_URL) { "set" } else { "missing" }
```

---

## 6. `psql` verification

```bash
psql --version
```

Expect something like `psql (PostgreSQL) 17.x`. If "command not found", see
Troubleshooting.

---

## 7. Normal daily start

1. Open the project folder in VS Code (or `cd` into `olimpiada-portal`).
2. Start Claude Code with the previous session and auto permissions:

   ```bash
   claude -c --permission-mode auto
   ```

3. Paste the short **Prompt 2** command to resume the active stage:

   ```text
   Read CLAUDE.md, IMPLEMENTATION_EXECUTION_PLAN.md, STATUS.md, and CODING_AGENT_PROMPTS.md.
   Find the current active stage in STATUS.md and continue it (Prompt 2).
   ```

Claude reads `STATUS.md` for the active stage and, for database stages, validates
SQL automatically against dev/staging using `OLIMPIADA_DEV_DB_URL`.

---

## 8. Commit / push workflow

You commit and push manually using the message Claude provides:

```bash
git status
git add -A
git commit -m "Your message here"
git push
```

Use only the `main` branch unless told otherwise.

---

## 9. Security warnings

- **Never** print, paste, or echo the database URL or any password/token/key.
- **Never** commit secrets, `.env`, `.env.local`, service-role keys, or SSH private keys.
- Use **dev/staging only** for automated SQL validation. **Never** production.
- Reference the DB only as the variable `"$OLIMPIADA_DEV_DB_URL"` — never its value.

---

## 10. Troubleshooting

**Passphrase asked on every push**
- `ssh-agent` isn't running or the key wasn't added. Run section 2c, then
  `ssh-add ~/.ssh/id_ed25519_olimpiada`. Confirm with `ssh-add -l`.

**`psql` not found**
- Postgres `bin/` isn't on `PATH`. Add `C:\Program Files\PostgreSQL\17\bin` to your
  user `PATH`, then reopen the terminal. Verify with `psql --version`.

**Env variable not visible in VS Code**
- `setx` only affects **new** processes. Fully close and reopen VS Code (or sign
  out/in). Re-check with the section 5 verification command.

**Wrong GitHub account / remote**
- Confirm the remote uses the alias:
  `git remote -v` should show `git@github.com-olimpiada:olimpiadaportal/olimpiada-portal.git`.
- If not: `git remote set-url origin git@github.com-olimpiada:olimpiadaportal/olimpiada-portal.git`.
- Re-test: `ssh -T git@github.com-olimpiada`.
