# CLAUDE.md — Mobile App Instructions (React Native + Expo)

## Scope & state

- Framework is CONFIRMED (owner, 2026-07-03): **React Native + Expo** (TypeScript strict, expo-router, Hermes/New Architecture).
- **Expo SDK is PINNED to 54 (owner decision, 2026-07-11):** it is the version the owner's Expo Go installs actually run (verified on device; no newer SDK found in the stores). Never bump the SDK — or any `expo-*`/`react-native*` major — without an explicit owner request; use `npx expo install` so versions stay SDK-54-aligned.
- The mobile track is **PLANNED & READY but DORMANT**: do NOT create mobile source files until the owner sets a Mobile stage (M1–M4) as the active stage in root `STATUS.md`.
- Source of design truth: `markdowns/MOBILE_APP_MASTER_PLAN.md` **v3** (2026-07-09 — written against the shipped web platform through Round 17). Staged plan (**the plan the owner activates to build**): root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` — 4 BIG stages M1–M4. Push/notification contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`. `markdowns/FUTURE_MOBILE_READINESS.md` is historical only (superseded).

## Reading order for ANY mobile stage

1. Root `STATUS.md` (active M stage) → root `CLAUDE.md` → this file.
2. `markdowns/MOBILE_APP_MASTER_PLAN.md` (always).
3. Root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` — only the active stage's section.
4. DB work: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md` (standard migration → dev-apply → backport → 013 loop applies unchanged).
5. BFF work: the specific web-app service files the stage lists (BFF endpoints WRAP existing audited functions — never reimplement them).
6. Push work (M4): `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`.

## Non-negotiable mobile rules

- Same product model as web (parent-only registration with mandatory E.164 phone; child = 8-digit ID + parent password; children never purchase; server-side trust boundary; users never choose difficulty; MCQ = exactly 4 options).
- **No service-role key, ever, anywhere in this app.** Anon key + user JWT + RLS direct; privileged flows only through the web-app BFF (`/api/mobile/v1/*`).
- Admin control plane first: payment mode/flags/maintenance/locales/contact/min-version come from `get_mobile_config()`, CMS text overrides from `get_mobile_content(locale)` — never hardcode a gate and never read `feature_flags`/`system_settings`/`site_content` directly (they are admin-RLS-locked anyway).
- UI identical to web: tokens mirrored from `web-app/src/app/globals.css` (Energetic light / dark / arena / arena-light / the 5 arena palettes); i18n keys SYNCED from web `messages.ts` + runtime CMS overrides (az default/en/ru, natural phrasing, every string ×3).
- Sessions only in the SecureStore-backed adapter; dependency policy: maintained packages only, `npx expo install` versions, `npm audit` = 0, each new dep justified in STATUS.md.
- Security checklist: master plan §13 (MASVS-aligned) gates every stage; store/payments posture: master plan §17 (no real provider exists yet — commerce is mode-aware via the BFF, never client-computed).
- Notification taps and all deep links go through the allowlist router + the `isSafeRelativeUrl` port — payloads are display data, never authorization.
- Root Security Engineering Rules (root `CLAUDE.md`) apply to the BFF endpoints exactly like any web server code.
