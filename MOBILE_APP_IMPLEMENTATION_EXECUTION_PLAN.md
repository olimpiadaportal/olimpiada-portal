# MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md

Staged execution plan for the **OlympIQ mobile app** (React Native + Expo).
Source of design truth: `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` (read it before ANY mobile stage).
Workflow: identical to the web track — `STATUS.md` is the source of truth for the active stage; use Prompt 2 from `CODING_AGENT_PROMPTS.md`; database work follows the standard migration → dev-apply → canonical backport → `013` validation loop automatically.

**Activation rule:** the mobile track is DORMANT until the owner sets a Mobile stage (M#) as the active stage in `STATUS.md`. Web/admin work must never be blocked by this file.

Per-stage doc set (read ONLY these + the stage row):
- `CLAUDE.md` (root) · `mobile-app/CLAUDE.md` · `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` · `STATUS.md`
- DB stages additionally: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- BFF stages additionally: the wrapped service files listed in the stage.

---

## M0 — Foundation & design system
**Goal:** compilable, brand-correct shell; zero business features.
- Scaffold Expo (SDK 52+, TS strict, expo-router, Hermes/New Arch) inside `mobile-app/`; `app.config.ts` env (EAS secrets; only `SUPABASE_URL` + anon key — never service keys; scheme `olympiq`, suggested id `ai.olympiq.app`); eslint + jest-expo + npm scripts (`typecheck`, `lint`, `test`, `audit`); eas.json profiles (development/preview/production) + updates channels (master plan §18).
- `src/theme/tokens.ts` mirroring web palettes (light Energetic / dark / arena + arena-light remap) + spacing/radius/type scale; ThemeProvider (light/dark/system); app icon + splash assets (gradient mark, §2) for owner approval.
- i18n sync script (`scripts/sync-i18n.mjs` copying web `messages.ts` + mobile overlay) + `getT`/locale store + the az pseudo-length overflow test (§14).
- Supabase client with the SecureStore "large secure store" adapter; typed BFF client stub; deep-link allowlist router skeleton (§4) with unit tests.
- Design-system primitives: Screen, Text, Button (primary/ghost/danger), Card, Segmented, Modal/ConfirmSheet, BottomSheet(Account shell), GateNotice, PlanCard, KPI tile, skeleton loaders + branded empty-state set (§2/§8).
**Accept:** `tsc`/lint/test/audit green; gallery screen renders all primitives in 3 themes × 3 locales at 1.3× Dynamic Type without overflow; deep-link router unit tests pass; no network calls yet.

## M1 — Admin control plane (config RPC + gating shell)
**Goal:** the admin panel controls the app before the app does anything else.
- DB (migration + backport + 013): `get_mobile_config()` anon-callable whitelist RPC; seed `notifications_push` flag (off); `mobile_app_versions` table.
- Admin panel: new Admin-only "Mobile App" section (versions CRUD: min/latest/force per platform + trilingual message + store URLs; audited; nav entry).
- Mobile: config bootstrap (cold start + foreground revalidate); full-screen `maintenance` and `force-update` states; locale clamp to admin-supported set; flag gate helpers.
**Accept:** flipping maintenance/leaderboard/etc. in admin Settings visibly changes the app within one foreground cycle; 013 gains checks (anon CAN exec config RPC; whitelist keys only; versions table RLS admin-write/anon-read-nothing—config RPC is the only public reader).

## M2 — Authentication & root navigation
**Goal:** both login paths + parent registration, sessions in secure storage, the full root state machine.
- Root state machine per master plan §3 (force-update → maintenance → auth stacks → role tabs), Android back rules, tab scaffolds for both roles (placeholder screens).
- Parent login: direct supabase-js password sign-in; forgot-password via existing web flow (email link opens web — documented).
- BFF v1 endpoints in web-app (`/api/mobile/v1/auth/child-login`, `/auth/register`) wrapping the EXISTING service functions (rate-limited, generic errors); mobile child login (8-digit segmented numeric field) with lockout parity.
- Session lifecycle: refresh, 401 recovery, logout wipe (SecureStore + query cache); deep-link deferral: auth-required links stored → replayed after login, role-checked (§4).
**Accept:** Maestro flows: parent login/logout, child login/logout, lockout messaging, deferred deep link replays correctly; tokens verified absent from plain AsyncStorage; web build gate green (BFF).

## M3 — Public surface + News + deep links live
**Goal:** unauthenticated value + shared news stack + link infrastructure.
- Landing-lite (hero, pricing plan-cards with owner copy, about highlights, FAQ accordion, contact incl. admin-driven phone/socials), public News list/article (views beacon parity: once per session; likes hidden for anon).
- Deep linking activated: `olympiq://` scheme end-to-end + the universal-links WEB deliverable (AASA + assetlinks served from web-app public dir — pending the olympiq.ai domain, tracked in the backlog deploy items); full §4 route map wired for public + news routes.
- Respect `news_public`, `launch_promo` flags from config.
**Accept:** parity review vs web copy ×3 locales; images cached (expo-image) with placeholders; deep-link matrix test for public routes.

## M4 — Parent panel
**Goal:** full parent experience.
- Tabs: Home (children cards + carousel + news panel), Analytics (child/subject selector + REAL `get_child_subject_dashboard` charts via react-native-svg), Olympiads catalog (child selector, detail sheet, purchase via BFF — respecting §8 read-only posture when configured), Subscription (plans/billing/invoices parity incl. demo-data labels), News (in-panel), Profile (avatar via BFF sniffed upload, password, danger zone, session) + account bottom-sheet.
- BFF endpoints: children/add-child wizard, quote/subscribe, subjects add/remove, olympiad purchase, avatar.
**Accept:** Add-Child wizard end-to-end on dev (8-digit ID reveal), analytics matches web numbers for the same child, all gates behave.

## M5 — Student arena
**Goal:** full student experience, arena-identical.
- Tabs: Arena home (streak/stats/practice entry), Olympiads (planned cards + detail sheet with buy-note, owned + attempt runner using existing RPCs: server-random 25, grade, results), Ranking (leaderboard flag + display-names setting parity), News, Profile (avatar, password, background TEMPLATE gallery driving the arena background — gradients + admin image wallpapers).
**Accept:** full practice/olympiad attempt round-trip on dev; wallpaper choice persists (RLS self-row); locked/expired access states match web.

## M6 — Purchases & subscription hardening
**Goal:** finalize commerce posture per master-plan §8 (owner decision applied): read-only vs mock-parity; deep-link "manage on web" paths; server re-verification everywhere.
**Accept:** store-review-safe behavior documented + screenshots for STATUS.

## M7 — Push notifications (optional-orderable; architecture = master plan §10)
- DB: `push_tokens` table (RLS self-write, migration+backport+013) ; flag `notifications_push` gates registration + prompts.
- Mobile: permission UX (iOS provisional first), token lifecycle (register/refresh/logout-delete), Android channels + iOS categories (`news`, `olympiad_reminders`, `subscription`, `streak`), notification-tap → deep-link allowlist routing, per-category prefs screen stub in Profile.
- Admin: "Send notification" module (Admin-only, audited: category + audience + trilingual body → Expo Push server-side; receipts pruning for dead tokens) — delivers the push half of the deferred notifications-center backlog item.
**Accept:** end-to-end send from admin to both platforms; tap routes correctly; opt-out respected; flag off = zero registration.

## M8 — Hardening, compliance & store readiness
- MASVS checklist sweep (master plan §13), biometric app-lock (opt-in), data-inventory table → iOS privacy manifest + Play Data Safety, children's-data + Kids-Category posture confirmation (§13), sentry-expo on/off decision executed (§16), performance-budget verification (§15), full QA matrix + release checklist (§19), store metadata/screenshots ×3 locales, EAS production builds + submission dry-run.

## M9 — Launch & post-launch ops
- Staged rollout, OTA update policy (signed, prod channel), version-gate runbook (using the admin Mobile App section), incident playbook, backlog intake for mobile-only polish.

---

### Standing rules (all M stages)
- Trilingual az/en/ru for every string; token-driven theming; no new dependency without the security policy check + STATUS.md note; `npm audit` = 0; never store secrets outside SecureStore/EAS; DB changes only via the versioning workflow; the web/admin apps' builds must stay green (BFF changes run web typecheck+build).
- Every stage passes master plan §21 quality gates (typecheck/lint/jest/audit/Maestro smoke/preview build/trilingual review/flag flip-test) and respects §15 performance budgets; each stage appends its manual checks to `docs/MANUAL_TESTING_GUIDE.md` (M-sections).
- Deferred-web-feature seams (master plan §20) must not be paved over: reserved tab slots, flag-gated surfaces, idempotent purchase contract, and the i18n sync pipeline are architectural invariants.
