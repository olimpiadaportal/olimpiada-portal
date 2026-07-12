# MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md

Staged execution plan for the **OlympIQ mobile app** (React Native + Expo) — **THE plan the owner activates to build**.
Source of design truth: `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` v3 (read it before ANY mobile stage). Notifications/push contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`.
Workflow: identical to the web track — `STATUS.md` is the source of truth for the active stage; use Prompt 2 from `CODING_AGENT_PROMPTS.md`; database work follows the standard migration → dev-apply → canonical backport → `013` validation loop automatically; BFF work always runs the web-app typecheck+build gate.

**Activation rule:** the mobile track is DORMANT until the owner sets a Mobile stage (M1–M4) as the active stage in `STATUS.md`. Web/admin work must never be blocked by this file.

**Structure (restructured 2026-07-09, owner request):** the app is built in **4 BIG stages**, each delivering a complete, testable slice of the product. Each stage is large by design — the owner activates one stage at a time and receives a self-contained deliverable with the standard validation gates (master plan §21). The old M0–M9 micro-stages are superseded; their content is absorbed below.

**Payment reality (noted per owner, 2026-07-09):** no real payment provider exists anywhere in the platform yet (backlog A1 — a WEB deliverable). The mobile app does NOT wait for it: all commerce is mode-aware through the BFF (real/demo/giveaway/off resolved server-side), the purchase contract is idempotent from day one, and real-provider/IAP integration is a bolt-on after A1 lands (master plan §17). Nothing in M1–M4 blocks on a provider.

Per-stage doc set (read ONLY these + the stage section):
- `CLAUDE.md` (root) · `mobile-app/CLAUDE.md` · `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` · `STATUS.md`
- DB work additionally: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
- BFF work additionally: the wrapped web-app service files listed in the stage
- Push work additionally: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`

---

## M1 — Foundation, admin control plane & authentication
**Goal:** a brand-correct, admin-controlled, fully authenticated shell — both login paths work end-to-end, the admin panel can gate/maintain/force-update the app, and every later screen builds on finished primitives. (Absorbs old M0+M1+M2.)

**DB (migration + backport + `013` checks):**
- `get_mobile_config()` — anon-callable SECURITY DEFINER whitelist RPC (master plan §7.2): payment MODE resolved server-side (paymentMode.ts parity incl. lazy giveaway expiry + `giveaway_ends_at`), flags (news_public/olympiad_module/leaderboard/notifications/notifications_push/launch_promo), maintenance (platform.maintenance_mode + trilingual message), locales (supported/default), contact + social, version block.
- `get_mobile_content(p_locale)` — anon-callable `site_content` override map for one locale (registry-capped) so the Website-Content CMS reaches mobile with zero releases.
- `mobile_app_versions` table (admin-write RLS; read only through the config RPC).
- `013` gains: anon CAN exec both RPCs; whitelist shape (no `select *`); versions table admin-only.

**Admin panel:** new Admin-only **"Mobile App"** section (nav + page): per-platform min/latest/force + trilingual message + store URLs (audited CRUD). Uses the existing settings/audit patterns.

**Mobile:**
- Scaffold Expo (SDK **54 — pinned, owner decision 2026-07-11**; TS strict, expo-router, Hermes/New Arch) in `mobile-app/`; `app.config.ts` env via EAS (only `SUPABASE_URL` + anon key + BFF base URL — never service keys; scheme `olympiq`, id `ai.olympiq.app`); eslint + jest-expo + scripts (`typecheck`/`lint`/`test`/`audit`); `eas.json` profiles (development/preview/production) + updates channels (§18).
- `src/theme/tokens.ts` mirroring ALL web palettes (Energetic light / dark / arena / arena-light / the 5 arena palettes) + spacing/radius/type scale; ThemeProvider (light/dark/system); app icon + splash for owner approval.
- i18n: `scripts/sync-i18n.mjs` (web `messages.ts` → mobile + `messages.mobile.ts` overlay), `getT`/locale store honoring config locales, runtime CMS-override layer (`get_mobile_content`), az pseudo-length overflow test (§14).
- Supabase client on the SecureStore "large secure store" adapter; typed BFF client; deep-link allowlist router (§4) + `isSafeRelativeUrl` port, with unit tests.
- Design-system primitives (§2 inventory): Screen, Text, Button, Card, Segmented, Modal/ConfirmSheet, BottomSheet(AccountSheet shell), GateNotice, PlanCard, KPI tile, PhoneField, countdown banner, NotificationBell shell, skeletons + branded empty states — rendered in a gallery screen.
- Config bootstrap (cold start + foreground revalidate); full-screen **Maintenance** and **ForceUpdate** states; flag-gate helpers; root state machine (§3: force-update → maintenance → auth stacks → role tabs) + Android back rules + tab scaffolds (placeholder screens).
- **Auth:** parent login (direct supabase-js password sign-in) + forgot-password (email link opens web — documented); **BFF v1 first endpoints in web-app** — `POST /api/mobile/v1/auth/child-login` (wraps `childLoginService`: lockout + IP throttle + synthetic email → session tokens) and `POST /auth/register` (wraps `registerParent`: mandatory E.164 phone, rate limits, generic errors); mobile child login (8-digit segmented numeric field) + register screen (PhoneField); session lifecycle (refresh, 401 recovery, logout wipe of SecureStore + query cache); deferred deep-link replay after login, role-checked.

**Accept:** `tsc`/lint/jest/audit green; gallery renders all primitives in every theme incl. 2 palettes × 3 locales at 1.3× Dynamic Type without overflow; flipping maintenance/flags in admin Settings visibly changes the app within one foreground cycle; force-update blocks correctly per platform/version; Maestro flows — parent register+login/logout, child login/logout, lockout messaging, deferred deep link replay; tokens verified absent from plain AsyncStorage; web typecheck+build gate green (BFF); from-zero DB rebuild green with the new `013` checks.

## M2 — Public surface & the complete parent panel
**Goal:** everything an unauthenticated visitor and a logged-in parent can do on the web, on mobile. (Absorbs old M3+M4.)

- **Public stack:** landing-lite (hero, per-subject pricing plan cards from `subjects_pricing`, about highlights, FAQ accordion, contact w/ admin-driven email/phone/socials from config), public News list/article (`news_public`-gated; view beacon once/session via `bump_news_view`; anon sees ♥ counts only), giveaway countdown banner on public screens while active; deep links live for public + news routes (`olympiq://` end-to-end; the universal-links AASA/assetlinks web deliverable stays tracked under backlog C1/C2).
- **Parent tabs (5) + header bell + AccountSheet** (§3): Home (children cards + access pills + per-child leaderboard chip via `get_child_leaderboard_summary` + carousel + news panel), Analytics (child/subject selectors from REAL coverage, `get_child_subject_dashboard` charts via react-native-svg incl. the SEPARATE skipped-answers metric + answered-based accuracy — migration 046, leaderboard panel, locked-subject CTAs), Olympiads (catalog + child selector + detail sheet + purchase via BFF, mode-aware §17 posture — owner decision applied here), Subscription (child-selector tabs; Plans/Billing/Invoices parity incl. clearly-labeled demo sections; manage-subjects payment-first editor via BFF batch diff; cancel flow), News (in-panel), **Notifications** (bell dropdown + full inbox + Realtime INSERT subscription + toasts + detail sheet w/ safe minimal-markdown + category chips + mark-all/delete; preferences self + per-child on Profile).
- **Add-Child wizard** (mode-driven flows, web parity): real/demo = Info → Subjects → Plan cards (live BFF quote w/ sibling discount) → payment step → Done (8-digit ID reveal + sensitive-clipboard warning); giveaway/free-access = Info → Done (instant ID via activate-free BFF); off = Info → Done (ID pending). City → School cascade (server-driven, private-first ordering) + grade picker.
- **Profile:** avatar (photo library → BFF byte-sniffed upload), name/password editors, danger zone (delete account via BFF), notification preferences, FAQ/Contact rows; **edit child info** screen (BFF `children/:id/edit`) + child password reset.
- **Banners:** giveaway + free-access countdowns (1s tick) on parent screens, mutually exclusive like web.
- **BFF endpoints added this stage:** `/children`, `/children/:id/quote|subscribe|subjects|activate-free|edit|reset-password`, `/subscriptions/:id/cancel`, `/olympiads/:pkg/purchase` (Idempotency-Key), `/profile/avatar`, `/account/delete` — each wrapping the existing audited web service functions, documented in `mobile-app/markdowns/API_CONTRACTS.md`.

**Accept:** Add-Child end-to-end on dev in ALL modes (flip flags: real→plan+pay path, demo→demo-pay, giveaway→instant ID, off→ID pending); analytics numbers match web for the same child; subscription editor enforces the payment-first contract; a notification sent from the admin composer arrives live (Realtime) and its action_url routes correctly; prefs toggles persist (incl. parent-managing-child); all gates behave on flag flips; Maestro: register→add child→subscribe→see child on dashboard; web typecheck+build green (BFF); manual checks appended to `docs/MANUAL_TESTING_GUIDE.md` (M-section).

## M3 — Student arena (the child's whole world)
**Goal:** the complete student experience — arena-identical, test-engine-complete. (Absorbs old M5.)

- **Tabs (5) + header (StreakChip via `get_streak_status` + bell + AccountSheet):** Arena home (hero/today's-round → Tests, ministats, leaderboard quick-look card, subject strength, news panel, access-state cards for inactive/locked/expired), **Tests** (home: subject cards from access set + continue-card for a live attempt + recent history; setup: tri-state topic/subtopic picker + instructions/consent; **runner**: server-deadline timer w/ warn/crit states + 30s autosave w/ deadline resync + palette grid + bookmark toggle + submit confirm w/ unanswered count + deadline auto-submit + resume + back-guard; results: score/max/% + time used + per-topic bars; review: All/Correct/Wrong/Skipped filter tabs + explanations), Olympiads (planned cards + detail sheet w/ "ask your parent" note; owned → the SHARED timed runner via `start_olympiad_attempt`'s test-engine jsonb contract — package `duration_minutes` countdown, TRUE resume, continue-card; never a forked player), Ranking (Points|Streak boards, scope chips only for owned ids — global/subject/grade/city/school, month|all-time, top-50 w/ medals + self-highlight + "Firstname L." rows + city/school/grade context (Subject scope = single-select over ALL active subjects, clamped default), sticky my-rank card, streak card w/ at-risk urgency; `leaderboard`-flag gated), News.
- **Notifications:** child bell + inbox (read-only prefs — parent manages).
- **Profile:** avatar, name, password (≠ ID rule), read-only school info (grade/city/school), **sticker THEME picker** (enabled themes; decorations not rendered in v1 — §2) + **palette picker** (5 palettes + default, applied live to the arena theme), 8-digit ID display.
- All attempt flows verified against the anti-cheat contract: no answer keys before grading anywhere in memory/cache; review payloads never persisted to MMKV.
- **Round-19 contracts (master plan §7.2b items 7–12, mandatory):** test setup requires topic+subtopic (subtopic waived only when none exist, resets on topic change, trilingual warning + field highlight) and the picker filters `topics.scope='exam'`; active attempt → leave-confirm on tab bar/back (never on runner controls); active tab + wording follow the attempt's `kind` (olympiad ⇒ Olympiads tab); analytics olympiad tab (if built here) uses `p_scope='olympiads'` + `per_package` — never blended into subjects.

**Accept:** full topic-test round-trip on dev incl. TRUE resume after app kill + deadline auto-submit + review filters; olympiad attempt round-trip on an owned package; leaderboard matches web for the same child (incl. anonymization flag flip); palette choice persists and restyles the arena; locked/expired access states match web; free-window child sees full subject access; Maestro: child login→run test→submit→review→logout; manual checks appended to the testing guide.

## M4 — Push notifications, hardening, compliance & launch
**Goal:** go live: push end-to-end, MASVS-hardened, store-ready, operable. (Absorbs old M6+M7+M8+M9.)

- **Push (contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`):** permission UX (iOS provisional first), token lifecycle (`upsert_push_token` on login/refresh, delete on logout), Android channels + iOS categories mapped from notification `category`, tap → `action_url` → allowlist router; wire Expo into the EXISTING `sendPushDelivery` seam in the web processor (`EXPO_ACCESS_TOKEN`) + `DeviceNotRegistered` → `is_valid=false` invalidation; flip `notifications_push` ON (admin Settings); the admin composer's "Mobil tətbiq" channel goes live unchanged; per-category opt-in honors `notification_preferences.push_enabled`.
- **Commerce posture finalization:** apply the owner's M2 §17 decision store-compliantly; review notes + screenshots prepared for both stores; deep-link "manage on web" paths verified.
- **Hardening & compliance:** MASVS checklist sweep (§13), biometric app-lock (opt-in), data-inventory table → iOS privacy manifest + Play Data Safety, children's-data + Kids-Category posture confirmation, sentry-expo on/off decision executed (§16), performance-budget verification (§15), full QA device matrix + release checklist (§19), store metadata/screenshots ×3 locales.
- **Launch ops:** EAS production builds + `eas submit`, staged rollout, signed-OTA policy live (prod channel), version-gate runbook (admin Mobile App section), incident playbook, backlog intake for mobile-only polish.

**Accept:** end-to-end push from the admin composer to BOTH platforms with correct tap-routing + opt-out respected + flag-off = zero registration; release checklist 100%; production builds submitted; rollback (OTA republish + version force-gate) rehearsed and documented in STATUS.md.

---

### Standing rules (all M stages)
- Trilingual az/en/ru for every string; token-driven theming; no new dependency without the security-policy check + STATUS.md note; `npm audit` = 0; secrets only in SecureStore/EAS; DB changes only via the versioning workflow (migration → dev-apply → backport → `013`); the web/admin builds stay green (BFF changes run web typecheck+build).
- Every stage passes master plan §21 quality gates and respects §15 performance budgets; each stage appends its manual checks to `docs/MANUAL_TESTING_GUIDE.md` (M-sections) and updates `STATUS.md`.
- Deferred-web-feature seams (master plan §20) must not be paved over: reserved Tasks tab slot, achievements row, coupon passthrough, idempotent purchase contract, and the i18n sync + CMS-override pipeline are architectural invariants.
- Real-payment/IAP integration is OUT of M1–M4 scope by design (backlog A1 is a web deliverable); when it lands, mobile work is a bounded add-on per master plan §17.
