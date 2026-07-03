# OlimpIQ Mobile App — Master Plan (React Native + Expo)

Status: **PLANNED (owner-approved direction, 2026-07-03). Implementation starts only when the owner activates the Mobile track in `STATUS.md`.**
Companion file: root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` (the staged execution plan; stages M0–M9).
Supersedes: `FUTURE_MOBILE_READINESS.md` (kept for history).

---

## 1. Product intent

One mobile app, two experiences behind one login screen — **exactly mirroring the web-app**:

- **Parent experience** = the web `(parent)` panel: dashboard (children, carousel, news), Analytics (real per-child/subject dashboard), Olympiads purchase catalog, Subscription center, in-panel News, profile + account drawer.
- **Student experience** = the web `/child` arena: dark arena home (streak, stats, practice), Olympiads (planned + owned, detail modal, attempt runner), Ranking (flag-gated), News, profile (avatar, password, background templates).
- **Public (unauthenticated)**: a compact landing (hero + pricing + about highlights + FAQ + contact + public news) and the two login paths + parent registration.

Non-goals for v1 (explicit): child self-registration (never), any purchase by a child (never), SMS, bank transfer, offline WRITES, tablets-first layouts (phone-first; tablets get adaptive stretch), real store payments (see §8 — store-compliance decision).

## 2. Identity: same UI, same brand, same rules

- **Design tokens are copied, not reinvented.** `src/theme/tokens.ts` mirrors `web-app/src/app/globals.css` exactly:
  - Light (Energetic): bg `#fffbf5`, surface `#ffffff`, accent `#7c3aed`, accent-2 `#ff8a00`, soft `#f7f0fe`, text `#2a1a3e`, ok `#06b66b`, danger `#ff4757`, borders lilac-tinted, radius signature 14–22px, purple→orange gradients (logo mark, hero, stat numbers) via `expo-linear-gradient`.
  - Dark: the web root dark tokens (bg `#0a0e1a`, surfaces/borders as in globals.css).
  - Arena (student scope): `--bg #0a0e1a, --panel #141d33, --panel2 #1a2542, --line #26314f, --ink #eef3ff, --muted #7e8db5, --dim #56638a, --lime #c4ff00, --blue #2f6bff, --red #ff4d6d, --gold #ffc94d`; the student LIGHT remap (lime→purple etc.) mirrors the web `[data-theme="light"] .arena` block.
- **Typography**: platform system sans (SF Pro / Roboto) — both render Azerbaijani `ə Ə ğ ş ç ü ö ı İ` cleanly (the web's Arial rule exists for the same reason; Arial is not shipped on Android, system sans is the equivalent). Tabular numerals for the 8-digit ID, prices, stats.
- **Theme switching**: light/dark segmented control identical to the web drawers; stored preference + system-default option; student arena keeps its own scope like the web.
- **i18n**: az (default) / en / ru, natural phrasing, every string in all three. The catalog is **synced from the web** — a build-time script copies `web-app/src/i18n/messages.ts` into `mobile-app/src/i18n/messages.ts` (single source of truth; mobile-only keys live in a separate `messages.mobile.ts` merged over it). Locale respects the admin's `platform.supported_locales`/`platform.default_locale` (via the config RPC, §5).
- **Component inventory to rebuild natively** (parity with web contracts): plan-card (pricing/subscription), news card + article, FAQ accordion (single chevron), segmented controls (language/theme), account bottom-sheet (the web drawer), shared Modal (native modal/bottom-sheet with the same semantics: backdrop close, escape≈back button, scroll lock), profile settings cards, analytics KPI tiles + SVG charts (weekly bars, accuracy trend), olympiad cards + detail sheet, wallpapers template gallery, maintenance splash, forced-update screen, gate notices (payments/olympiad/leaderboard off).

## 3. Tech stack (pinned, security-vetted)

| Concern | Choice | Why / notes |
|---|---|---|
| Runtime | **Expo SDK 52+ (latest stable at implementation), New Architecture, Hermes** | Managed workflow + EAS; OTA via `expo-updates` (signed) |
| Language | TypeScript `strict` | matches both web apps |
| Navigation | **expo-router** (file-based, typed routes) | mirrors the web's route mental model |
| Backend | **@supabase/supabase-js ^2.48+** (same major as web) | same Postgres/RLS/Storage contracts |
| Session storage | **expo-secure-store** (Keychain/Keystore) via the documented "large secure store" adapter (AES key in SecureStore, ciphertext in MMKV) | tokens NEVER in plain AsyncStorage |
| Data layer | **@tanstack/react-query v5** (+ MMKV persister for read cache) | on-demand + cached reads; offline READ tolerance |
| Local UI state | **zustand** (tiny) | no Redux weight |
| Images | **expo-image** | disk caching + placeholders (news covers, wallpapers, avatars) |
| Graphics | **react-native-svg**, **expo-linear-gradient** | charts, icons, Energetic/arena gradients — no icon fonts, no external assets |
| Sheets/gestures | **@gorhom/bottom-sheet** + reanimated v3 + gesture-handler (Expo-bundled versions only) | account drawer / detail modals parity |
| Biometrics (optional stage) | expo-local-authentication | quick re-entry lock, opt-in |
| Push (stage M7) | expo-notifications + Expo Push | gated by a `notifications_push` flag (admin) |
| Testing | **jest-expo + @testing-library/react-native** (unit/component), **Maestro** (E2E flows) | first test framework in the repo — approved for mobile only |
| Lint | eslint-config-expo + @typescript-eslint | CI-enforced |

**Dependency security policy (non-negotiable):** only actively-maintained packages (release <12 months); `npm audit` must be 0 (same postcss-style override discipline as web); exact Expo-compatible versions via `npx expo install`; lockfile committed; NO react-native-dotenv (config via `app.config.ts` + EAS secrets), NO WebView auth flows, NO dynamic code loading, no packages requiring dangerous permissions. Every new dependency is listed in `STATUS.md` with a one-line justification.

## 4. Repository layout

```
mobile-app/
  app/                       # expo-router routes (see §6 parity map)
  src/
    theme/tokens.ts          # mirrored palettes/radius/spacing (§2)
    i18n/                    # synced messages + getT + locale store
    lib/supabase.ts          # client w/ SecureStore adapter (anon key only)
    lib/api.ts               # typed BFF client (§5.3)
    lib/config.ts            # get_mobile_config bootstrap + gates
    features/<domain>/       # parent/, student/, news/, auth/, ...
    components/              # design-system primitives (Modal, Segmented, PlanCard, ...)
  markdowns/                 # this plan + stage notes
  app.config.ts              # env via EAS; no secrets in code
```
Monorepo rules unchanged: one root git repo; mobile is NOT deployed to Vercel; EAS project lives inside `mobile-app/`.

## 5. Backend integration (the load-bearing design)

### 5.1 Direct Supabase (anon key + RLS) — the default path
Everything a signed-in parent/child may read/write under existing RLS goes DIRECT with the user's own JWT: profiles/avatars metadata, students (own), news + likes (`news_likes` RLS, `bump_news_view`), wallpapers catalog + `child_wallpaper_selections`, subjects/pricing (read), subscriptions/purchases (read own), test engine RPCs (`start_practice_attempt`, `get_practice_attempt`, `grade_practice_attempt`, `start_olympiad_attempt` — already granted to `authenticated`), analytics RPC `get_child_subject_dashboard` (authenticated + in-body authorization). **The service-role key never ships in the app — architecturally impossible paths only.**

### 5.2 NEW anon-safe bootstrap RPC — `get_mobile_config()`
`feature_flags`/`system_settings` are admin-only under RLS (web reads them with the service key; mobile must not). Add one SECURITY DEFINER, **anon-callable, whitelist-only** RPC returning a single JSON:
`{ flags: {news_public, olympiad_module, payments, leaderboard, launch_promo, notifications_push}, maintenance: {on, message{az,en,ru}}, locales: {supported, default}, contact: {email, phone}, social: {...}, version: {ios,android: {min, latest, force, store_url}, message{az,en,ru}} }`.
Rules: hard-coded whitelist inside the function (never `select *`), no secrets ever in these keys, `revoke` pattern per project memory, validated in `013`. Mobile fetches it at cold start + on foreground (React Query, 5-min staleness) → **this is how the admin panel "controls the app"**: maintenance splash, module gates, locale set, forced update — all flip from admin Settings with no store release.

### 5.3 Mobile BFF — Next.js route handlers in web-app (`/api/mobile/v1/*`)
Privileged flows already live as audited service-role server functions in web-app. Mobile reuses them through thin REST endpoints (NOT reimplemented, NOT Edge Functions — no logic duplication):

| Endpoint | Wraps | Auth |
|---|---|---|
| `POST /auth/child-login` | `childLogin` (lockout RPCs + synthetic email sign-in) → returns Supabase session tokens | none (rate-limited; generic errors) |
| `POST /auth/register` | `registerParent` (+ email verification flow) | none (rate-limited) |
| `POST /children` | `createChild` (Add-Child wizard step) | Bearer parent JWT |
| `POST /children/:id/subscribe` + `POST /quote` | `create_child_subscription` / `quote_child_subscription` service flows | Bearer parent JWT |
| `POST /children/:id/subjects` (add/remove) | subject re-price actions | Bearer parent JWT |
| `POST /olympiads/:pkg/purchase` | `purchaseOlympiadForChild` (mock-payment seam intact) | Bearer parent JWT |
| `POST /profile/avatar` | byte-sniffed avatar upload path | Bearer JWT |

Contract rules: server resolves the caller with `supabase.auth.getUser(bearer)` then calls the SAME guard/ownership/flag-gate code the web actions use; responses are `{ok}` / `{error: <i18nKey>}` (mobile translates); every endpoint inherits the Round-7 rate limiter + generic-error discipline; versioned under `/v1/`; documented in `mobile-app/markdowns/API_CONTRACTS.md` as they are built. Parent email/password login itself is DIRECT supabase-js (no BFF needed).

### 5.4 New DB work (all via the standard migration → backport → 013 workflow)
1. `get_mobile_config()` RPC (+ seed `notifications_push` flag, default off).
2. `mobile_app_versions` table (platform, min_version, latest_version, force_update, message az/en/ru, store_url) + **admin-panel "Mobile App" section** (Admin-only CRUD, audited) — this is the graceful admin control surface for store rollouts.
3. (M7) `push_tokens` table (profile-owned, RLS self-write) for Expo push tokens.

## 6. Screen ↔ web parity map (expo-router)

```
app/
  (public)/index|pricing|about|faq|contact|news[/slug]      ← (public)/* pages
  (auth)/login (parent|student segmented) |register|forgot  ← login/register/child-login
  (parent)/(tabs)/home|analytics|olympiads|subscription|news ← (parent)/* incl. /dashboard/news
  (parent)/children/[id]/subscribe|olympiads                ← wizard + per-child
  (parent)/profile                                          ← /profile
  (student)/(tabs)/arena|olympiads|ranking|news             ← /child/* (ranking = leaderboard flag)
  (student)/practice/[attemptId]                            ← attempt runner (25-Q, no difficulty choice)
  (student)/profile                                         ← /child/profile (+ background templates)
  maintenance | force-update                                ← config-driven full-screen states
```
The account drawer becomes a bottom sheet with the SAME sections (Account / Language / Appearance / Session) and segmented [AZ][EN][RU] + [Light][Dark]. Every gate notice (payments/olympiad/leaderboard/maintenance) reuses the web's trilingual copy.

## 7. Security standard (OWASP MASVS-aligned checklist)

- **Storage**: tokens only in SecureStore-backed adapter; no PII in logs; React Query persister stores non-sensitive read cache only (news, catalogs) — never sessions, never children's IDs list.
- **Network**: TLS-only (ATS + `usesCleartextTraffic false`); Supabase + BFF hosts only; certificate pinning documented as a post-launch option (Expo constraint noted); no third-party analytics SDKs in v1.
- **Auth/session**: supabase-js auto-refresh; 401 → silent refresh → re-login; child sessions get the same server-side lockout path as web (BFF); optional biometric app-lock (M8); logout wipes SecureStore + query cache.
- **Input**: client validation mirrors web (lengths, 8-digit ID format) but the SERVER (RLS/BFF/RPCs) remains the only trust boundary — unchanged Round-7 rules.
- **Platform**: minimal permissions (photo library pick for avatar only — via expo-image-picker at M4, camera NOT requested); deep links validated against an allowlist of internal routes; Android backup excluded for secure entries; iOS privacy manifest + Play Data Safety filled from a data inventory table (to be written in stage M8); screenshots not blocked (education app; note as a choice).
- **Code/build**: Hermes bytecode; no secrets in the bundle (grep-gate in CI); EAS secrets for env; signed OTA updates, updates channel per environment (dev/preview/production); dependency audit gate in CI.
- **Children's-data posture**: the app is parent-managed education software. Recommendation (owner to confirm at M8): do NOT enroll in Apple Kids Category / Play "Designed for Families" (avoids their ad/analytics regimes we don't need), but COMPLY materially: no ads, no tracking, no third-party data sharing, parental control of accounts/purchases — matching the existing product model.

## 8. Store & payments compliance (decide before M6 ships)

Digital subscriptions/olympiad packages sold INSIDE an iOS/Android app must use store billing (IAP) or fall under evolving external-purchase rules. Current model = mock/web payments. **v1 decision (recommended):** mobile shows subscription/purchase state **read-only** with neutral "managed from the family's web account" copy and NO purchase buttons while the `payments` flag is off for mobile; the parent Olympiads catalog stays browsable. Real mobile purchases (RevenueCat/StoreKit2/Play Billing, or entitlement-based external purchase where lawful) is its own stage (M9+) after the real web payment provider lands. This keeps v1 store-review-safe.

## 9. Quality gates (every mobile stage)

`npx tsc --noEmit` · `npx expo lint` · `npm audit` (0) · jest-expo suite · Maestro smoke flows (login parent, login child, open news, run practice) · EAS preview build boots on both platforms · trilingual review (no raw keys, no overflow) · gates behave with flags flipped in admin · STATUS.md updated (same delta discipline as web).

## 10. Open items for the owner (asked once, at track activation)
1. Store accounts: Apple Developer + Google Play console availability (needed by M8).
2. Bundle ids (suggest `ai.olimpiq.app`) and app display name ("OlimpIQ").
3. Push notifications in v1 scope or deferred (M7 is optional-orderable).
4. Confirm §8 read-only-payments posture for v1.
