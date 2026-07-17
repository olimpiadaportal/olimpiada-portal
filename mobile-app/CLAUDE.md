# CLAUDE.md — Mobile App Instructions (React Native + Expo)

## Scope & state

- Framework is CONFIRMED (owner, 2026-07-03): **React Native + Expo** (TypeScript strict, expo-router, Hermes/New Architecture).
- **Expo SDK is PINNED to 54 (owner decision, 2026-07-11):** it is the version the owner's Expo Go installs actually run (verified on device; no newer SDK found in the stores). Never bump the SDK — or any `expo-*`/`react-native*` major — without an explicit owner request; use `npx expo install` so versions stay SDK-54-aligned.
- Build state (2026-07-16): **ALL STAGES M1–M4 SHIPPED** — M3.2 (Round-22 full UI redesign per `markdowns/MOBILE_UI_REDESIGN_PLAN.md`), the Round-23 minimal-auth/copy pass, M3.1 (previous-day replays, question images, maintenance cadence), and **M4** (push pipeline end-to-end, opt-in biometric app-lock, launch pack). Remaining is OWNER work: the iOS device pass and the launch steps in `markdowns/RELEASE_RUNBOOK.md` (`eas init`, dev build for Android push testing, store accounts, `EXPO_ACCESS_TOKEN`, `notifications_push` flag ON, production env). Touch mobile code ONLY when a Mobile stage is the active stage in root `STATUS.md`.
- **Push (M4, 2026-07-16):** registration lives in `src/features/push/` — gated on signed-in + role + `flags.notificationsPush` (flag OFF = zero registration), with graceful skips for simulators/Expo-Go-on-Android/missing `eas.projectId`; tokens go through the `upsert_push_token` RPC and are deleted (own-row RLS) on logout BEFORE `auth.signOut()`; foreground pushes stay SILENT (the Realtime in-app toast covers foreground); taps route `action_url` through the same `deeplink.ts` allowlist as URLs. The web processor sends `channelId = category` — the Android channel ids in `push/channels.ts` must stay byte-identical to the engine's category set. Opt-in biometric app-lock lives in `src/features/applock/` (SecureStore `olympiq.appLock`, lock overlay over a never-unmounted Stack). Launch/store docs: `markdowns/STORE_LAUNCH_PACK.md` + `markdowns/RELEASE_RUNBOOK.md`.
- Source of design truth: `markdowns/MOBILE_APP_MASTER_PLAN.md` **v3** (2026-07-09 — written against the shipped web platform through Round 17). Staged plan (**the plan the owner activates to build**): root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` — 4 BIG stages M1–M4. Push/notification contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`. `markdowns/FUTURE_MOBILE_READINESS.md` is historical only (superseded).

## Reading order for ANY mobile stage

1. Root `STATUS.md` (active M stage) → root `CLAUDE.md` → this file.
2. `markdowns/MOBILE_APP_MASTER_PLAN.md` (always).
3. Root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` — only the active stage's section.
4. DB work: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md` (standard migration → dev-apply → backport → 013 loop applies unchanged).
5. BFF work: the specific web-app service files the stage lists (BFF endpoints WRAP existing audited functions — never reimplement them).
6. Push work (M4): `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`.

## Non-negotiable mobile rules

- **Android is the owner's manual-testing device (2026-07-14, physical phone + Expo Go):** assume reported bugs were seen on Android; verify fixes against Android behavior first, but keep everything iOS-correct in the same change (safe areas, shadows/elevation, keyboard, back gesture). iOS device testing comes later.

- Same product model as web (parent-only registration with mandatory E.164 phone; child = 8-digit ID + parent password; children never purchase; server-side trust boundary; users never choose difficulty; **MCQ = exactly 5 options A–E since Round 20** — was 4; legacy 4-option questions can still surface in practice/olympiad runners, so option rendering stays data-driven). Round-20 **and Round-21** platform changes are catalogued in the master plan §7.2c + §7.2d **with per-item SHIPPED/REMAINING markers** — most shipped in Rounds 21–22 (real olympiad pool counts, tests-tab readiness pre-flight, Round-21 arena home + real all-time rank, mandatory add-child rayon step, numeric-rank/district leaderboard, null-deadline untimed practice + the rated daily-round Start, 5-option A–E rendering). The M3.1 tail (previous-day replays, question images, maintenance cadence) SHIPPED 2026-07-16; only the owner's iOS device pass remains. Read those sections before touching the shipped screens.
- **No service-role key, ever, anywhere in this app.** Anon key + user JWT + RLS direct; privileged flows only through the web-app BFF (`/api/mobile/v1/*`).
- Admin control plane first: payment mode/flags/maintenance/locales/contact/min-version come from `get_mobile_config()`, CMS text overrides from `get_mobile_content(locale)` — never hardcode a gate and never read `feature_flags`/`system_settings`/`site_content` directly (they are admin-RLS-locked anyway).
- UI identical to web: tokens mirrored from `web-app/src/app/globals.css` (Energetic light / dark / arena / arena-light / the 5 arena palettes); icons = `lucide-react-native` (Round 22 — the 🔥 streak flame emoji stays); i18n keys SYNCED from web `messages.ts` + runtime CMS overrides (az default/en/ru, natural phrasing, every string ×3); subject names render via `subjectLabel(t, code, name)` + the `subj.<code>` keys (Round 23) — never raw DB subject names.
- **Auth surfaces stay minimal (Round 23, owner direction):** the onboarding shows ONCE per install (SecureStore `olympiq.seenWelcome`); its final slide offers **Log in + Register ONLY** (no student-login shortcut, no info chips, no gallery button); Login carries a single Register link and NO info-links footer or onboarding-replay link. Do not re-add links/CTAs to these surfaces without an owner request.
- Sessions only in the SecureStore-backed adapter; dependency policy: maintained packages only, `npx expo install` versions, `npm audit` = 0, each new dep justified in STATUS.md.
- Security checklist: master plan §13 (MASVS-aligned) gates every stage; store/payments posture: master plan §17 (no real provider exists yet — commerce is mode-aware via the BFF, never client-computed).
- Notification taps and all deep links go through the allowlist router + the `isSafeRelativeUrl` port — payloads are display data, never authorization.
- Root Security Engineering Rules (root `CLAUDE.md`) apply to the BFF endpoints exactly like any web server code.
