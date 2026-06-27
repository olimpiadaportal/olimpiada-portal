# Admin Panel Claude Code Rules


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_CLAUDE_CODE_RULES.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Claude Code and AI coding agents
- Related master docs: All Admin Panel master and derived docs
- Scope controlled by this file: Implementation rules for Admin Panel coding sessions
- Source-of-truth level: Derived app-specific AI rules


## Rules

- Read required docs before coding.
- Do not give Content Manager broad admin access.
- Do not expose sensitive data unnecessarily.
- Do not perform destructive actions without confirmation.
- Do not bypass audit logging.
- Keep UI replaceable.
- Keep backend calls typed and validated.
- Do not place SQL under `admin-panel/`.
- Do not implement Student/Parent Web App flows here.
- Do not use SMS.

## First Admin Panel Checklist

- Set up Next.js structure under `admin-panel/`.
- Implement admin login and protected layout.
- Build permission-aware sidebar.
- Build taxonomy CRUD screens.
- Build question draft/create/edit flow.
- Build review workflow shell.
- Add audit log calls for sensitive actions.
- Add Content Manager route restrictions.
