# MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md

Staged execution plan for the **OlimpIQ mobile app** (React Native + Expo).
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
- Scaffold Expo (SDK 52+, TS strict, expo-router, Hermes/New Arch) inside `mobile-app/`; `app.config.ts` env (EAS secrets; only `SUPABASE_URL` + anon key — never service keys); eslint + jest-expo + first CI-style npm scripts (`typecheck`, `lint`, `test`, `audit`).
- `src/theme/tokens.ts` mirroring web palettes (light Energetic / dark / arena + arena-light remap) + spacing/radius scale; ThemeProvider with light/dark/system.
- i18n sync script (`scripts/sync-i18n.mjs` copying web `messages.ts` + mobile overlay) + `getT`/locale store.
- Supabase client with the SecureStore "large secure store" adapter; typed BFF client stub.
- Design-system primitives: Screen, Text, Button (primary/ghost/danger), Card, Segmented, Modal/BottomSheet, GateNotice, PlanCard skeleton.
**Accept:** `tsc`/lint/test/audit green; storybook-style gallery screen renders all primitives in all 3 themes × 3 locales; no network calls yet.

## M1 — Admin control plane (config RPC + gating shell)
**Goal:** the admin panel controls the app before the app does anything else.
- DB (migration + backport + 013): `get_mobile_config()` anon-callable whitelist RPC; seed `notifications_push` flag (off); `mobile_app_versions` table.
- Admin panel: new Admin-only "Mobile App" section (versions CRUD: min/latest/force per platform + trilingual message + store URLs; audited; nav entry).
- Mobile: config bootstrap (cold start + foreground revalidate); full-screen `maintenance` and `force-update` states; locale clamp to admin-supported set; flag gate helpers.
**Accept:** flipping maintenance/leaderboard/etc. in admin Settings visibly changes the app within one foreground cycle; 013 gains checks (anon CAN exec config RPC; whitelist keys only; versions table RLS admin-write/anon-read-nothing—config RPC is the only public reader).

## M2 — Authentication
**Goal:** both login paths + parent registration, sessions in secure storage.
- Parent login: direct supabase-js password sign-in; forgot-password via existing web flow (email link opens web — documented).
- BFF v1 endpoints in web-app (`/api/mobile/v1/auth/child-login`, `/auth/register`) wrapping the EXISTING service functions (rate-limited, generic errors, no enumeration beyond the owner-approved UX); mobile child login (8-digit ID + parent password) with lockout parity.
- Session lifecycle: refresh, 401 recovery, logout wipe; auth-state routing (public ↔ parent ↔ student stacks).
**Accept:** Maestro flows: parent login/logout, child login/logout, wrong-password lockout messaging; tokens verified absent from AsyncStorage.

## M3 — Public surface + News
**Goal:** unauthenticated value + shared news stack.
- Landing-lite (hero, pricing plan-cards with owner copy, about highlights, FAQ accordion, contact incl. admin-driven phone/socials), public News list/article (views beacon parity: once per session; likes hidden for anon).
- Respect `news_public`, `launch_promo` flags from config.
**Accept:** parity review vs web copy ×3 locales; images cached (expo-image) with placeholders.

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

## M7 — Push notifications (optional-orderable)
- `push_tokens` table (RLS self), expo-notifications registration, admin-triggered sends deferred to an ops decision; gated by `notifications_push` flag.

## M8 — Hardening, compliance & store readiness
- MASVS checklist sweep (master plan §7), biometric app-lock (opt-in), privacy manifests / Play Data Safety from the data-inventory table, children's-data posture confirmation (§7), store metadata (az/en/ru), EAS production builds + submission dry-run, crash-free session baseline.

## M9 — Launch & post-launch ops
- Staged rollout, OTA update policy (signed, prod channel), version-gate runbook (using the admin Mobile App section), incident playbook, backlog intake for mobile-only polish.

---

### Standing rules (all M stages)
- Trilingual az/en/ru for every string; token-driven theming; no new dependency without the security policy check + STATUS.md note; `npm audit` = 0; never store secrets outside SecureStore/EAS; DB changes only via the versioning workflow; the web/admin apps' builds must stay green (BFF changes run web typecheck+build).
