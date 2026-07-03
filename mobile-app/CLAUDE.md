# CLAUDE.md — Mobile App Instructions (React Native + Expo)

## Scope & state

- Framework is CONFIRMED (owner, 2026-07-03): **React Native + Expo** (SDK 52+, TypeScript strict, expo-router, Hermes/New Architecture).
- The mobile track is **PLANNED but DORMANT**: do NOT create mobile source files until the owner sets a Mobile stage (M0–M9) as the active stage in root `STATUS.md`.
- Source of design truth: `markdowns/MOBILE_APP_MASTER_PLAN.md`. Staged plan: root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md`. `markdowns/FUTURE_MOBILE_READINESS.md` is historical only.

## Reading order for ANY mobile stage

1. Root `STATUS.md` (active M stage) → root `CLAUDE.md` → this file.
2. `markdowns/MOBILE_APP_MASTER_PLAN.md` (always).
3. Root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` — only the active stage's row.
4. DB work: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md` (standard migration → dev-apply → backport → 013 loop applies unchanged).
5. BFF work: the specific web-app service files the stage lists (BFF endpoints WRAP existing audited functions — never reimplement them).

## Non-negotiable mobile rules

- Same product model as web (parent-only registration; child = 8-digit ID + parent password; children never purchase; server-side trust boundary).
- **No service-role key, ever, anywhere in this app.** Anon key + user JWT + RLS direct; privileged flows only through the web-app BFF (`/api/mobile/v1/*`).
- Admin control plane first: flags/settings/locales/maintenance/min-version come from `get_mobile_config()` — never hardcode a gate.
- UI identical to web: tokens mirrored from `web-app/src/app/globals.css` (Energetic light / dark / arena); i18n keys SYNCED from web `messages.ts` (az default/en/ru, natural phrasing, every string ×3).
- Sessions only in the SecureStore-backed adapter; dependency policy: maintained packages only, `npx expo install` versions, `npm audit` = 0, each new dep justified in STATUS.md.
- Security checklist: master plan §7 (MASVS-aligned) gates every stage; store/payments posture: master plan §8.
- Root Security Engineering Rules (root `CLAUDE.md`) apply to the BFF endpoints exactly like any web server code.
