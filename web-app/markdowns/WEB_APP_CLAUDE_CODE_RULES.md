# Web App Claude Code Rules


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_CLAUDE_CODE_RULES.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code and AI coding agents
- Related master docs: All Web App master and derived docs
- Scope controlled by this file: Implementation rules for Web App coding sessions
- Source-of-truth level: Derived app-specific AI rules


## Rules

- Read required docs before coding.
- Do not implement Admin Panel features in Web App.
- Do not bypass backend authorization.
- Do not duplicate business logic in UI components.
- Keep UI replaceable and component-driven.
- Keep backend calls typed and validated.
- Do not expose correct answers before result state.
- Do not trust client score calculations.
- Do not use SMS.
- Do not implement Flutter/mobile app here.
- Do not place SQL files under `web-app/`.

## First Web App Checklist

- Set up Next.js app structure under `web-app/`.
- Add auth layout and public routes.
- Add student and parent route groups.
- Add Supabase browser/server clients safely.
- Add typed service wrappers.
- Add validation schemas.
- Add dashboard shells and loading/error/empty states.
- Add protected route middleware.
- Add subscription-required state component.
