# OlimpIQ Mobile App — Master Plan v2 (React Native + Expo)

Status: **PLANNED (owner-approved direction). Implementation starts only when the owner activates a Mobile stage (M#) in `STATUS.md`.**
Companions: root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` (stages M0–M9) · `docs/PRODUCT_COMPLETION_BACKLOG.md` (deferred web features — §20 maps every item into this plan).
v2 (2026-07-04) supersedes v1: adds navigation architecture, deep linking, notification architecture, screen state matrices, forms/input UX, offline policy, app lifecycle, accessibility/localization detail, performance budgets, observability, EAS pipelines & OTA policy, QA/release process, web-parity-debt mapping, and a risk register.

---

## 1. Product intent

One app, three surfaces behind one entry — mirroring the web-app exactly:
- **Public** (unauthenticated): landing-lite, pricing, about highlights, FAQ, contact, public news, login (parent|student), parent registration.
- **Parent**: dashboard (children, carousel, news panel), Analytics (real per-child/subject RPC dashboard), Olympiads catalog + purchase, Subscription center, News, Profile + account sheet.
- **Student (arena)**: arena home (streak/stats/practice), Olympiads (planned + owned + attempt runner), Ranking (flag-gated), News, Profile (avatar/password/background templates).

Product rules are identical to web and non-negotiable: parent-only registration; child login = 8-digit ID + parent password; children never purchase; server-side trust boundary; trilingual az(default)/en/ru everywhere.

Explicit v1 non-goals: tablets-first layouts (adaptive stretch only), offline WRITES, real store payments (§17), social sign-in, chat/support messaging, child self-registration (never).

## 2. Brand & design system (identical to web)

- **Tokens mirrored, not reinvented** — `src/theme/tokens.ts` replicates `web-app/src/app/globals.css`:
  - Light (Energetic): bg `#fffbf5`, surface `#ffffff`, accent `#7c3aed`, accent-2 `#ff8a00`, soft `#f7f0fe`, text `#2a1a3e`, ok `#06b66b`, danger `#ff4757`; radius 14–22; purple→orange gradients (logo, hero, stat numbers) via expo-linear-gradient.
  - Dark: web root dark tokens. Arena: `#0a0e1a/#141d33/#1a2542/#26314f/#eef3ff/#7e8db5/#56638a/#c4ff00/#2f6bff/#ff4d6d/#ffc94d`; arena-LIGHT remap identical to the web `[data-theme="light"] .arena` block (lime→purple, white panels).
- **Typography**: platform system sans (SF Pro/Roboto — Azerbaijani ə-safe, same rationale as the web Arial rule); tabular numerals for IDs/prices/stats; type scale 12/14/16/18/22/28 with Dynamic-Type support (§14).
- **Iconography**: single custom inline-SVG set via react-native-svg (mirrors the web's stroke icons — user, calendar, medal, lock, chevron, heart, socials). No icon fonts, no external assets.
- **Motion & haptics**: 150–250ms ease transitions (reanimated); haptics (expo-haptics) on: correct/wrong answer, purchase success, pull-to-refresh, destructive confirm. Respect the OS reduce-motion setting.
- **App icon & splash**: gradient logo mark (135° `#7c3aed→#ff8a00` rounded square, −4° tilt) on cream; dark splash variant; adaptive icon (Android) with plain glyph foreground. Assets generated at M0, owner-approved before M8.
- **Empty states**: every list has a branded empty illustration (small inline SVG) + one-line copy ×3 locales (news, children, olympiads, mistakes, board).
- **Component inventory** (native rebuilds of the web contracts): PlanCard (+featured/current badges), NewsCard/ArticleView, FAQ accordion (single animated chevron), Segmented (language/theme/child-selector), AccountSheet (= web drawer: Account/Language/Appearance/Session), Modal + ConfirmSheet (= web shared Modal semantics), profile settings cards (identity/security/danger/session), KPI tiles + SVG charts (weekly bars, accuracy trend), OlympiadCard + detail sheet (+ "ask your parent" note), WallpaperGallery (template cards, selected ring/check), GateNotice (payments/olympiad/leaderboard/maintenance), ForcedUpdate screen, StreakChip, AccessStateCards (inactive/locked/expired).

## 3. Navigation architecture

**Library**: expo-router (typed, file-based) over React Navigation primitives (native-stack + bottom-tabs).

**Root state machine** (evaluated at boot and on config/auth changes, in this priority order):
```
1. force-update required (config.version)        → ForceUpdate screen (dead end)
2. maintenance.on                                → Maintenance screen (dead end; retry on foreground)
3. no session                                    → (public) stack
4. session role = parent                         → (parent) tabs
5. session role = student                        → (student) tabs
6. session but role unresolved (network)         → Boot spinner w/ retry + logout escape
```

**Public stack** (native-stack, header per screen): Welcome → {Pricing, About, FAQ, Contact, News, NewsArticle} + Auth group {Login (parent|student segmented, mirrors web /login), Register, Forgot} presented as a stack, not tabs.

**Parent bottom tabs** (5 tabs — matches web nav minus Help, which folds into Profile):
| Tab | Route | Icon | Inner stack |
|---|---|---|---|
| Home | `(parent)/home` | logo dot | Dashboard → AddChild wizard → ChildSubscribe → ChildOlympiads |
| Analytics | `analytics` | chart | Analytics (child/subject params) |
| Olympiads | `olympiads` | medal | Catalog → PackageDetail(sheet) → Purchase(sheet) |
| Subscription | `subscription` | card | Plans/Billing/Invoices (one scroll page, section tabs like web) |
| News | `news` | newspaper | List → Article |
Profile is NOT a tab (parity with web): the avatar button in every tab header opens the **AccountSheet**; "My profile" inside it pushes the Profile screen full-screen. FAQ/Contact live as rows in Profile (web parity: help pages).

**Student bottom tabs** (4, arena-dark chrome): Arena `(student)/arena`, Olympiads (visible only when `olympiad_module` on), Ranking (visible only when `leaderboard` on), News. Profile via header avatar → AccountSheet → Profile. Attempt runner (`practice/[attemptId]`) is a full-screen modal stack OVER tabs with back-guard ("leave attempt?" confirm — grading is server-side, leaving is safe but warned).

**Behavior rules**: Android hardware back = pop stack → collapse sheet → (on tab root) switch to Home tab → double-back-to-exit toast; re-tapping the active tab scrolls-to-top then pops-to-root; tab state preserved across switches; badges: News tab shows a dot when a newer `published_at` than last-seen (local watermark) — no numeric badges in v1; gated tabs disappear entirely (flags) rather than disable.

## 4. Deep linking

- **Schemes**: custom `olimpiq://` (always) + **universal/app links** on `https://olimpiq.ai/*` once the domain is live (Apple AASA + Android assetlinks published from the web-app's public dir — a web-app deliverable at M3, listed in the backlog's deploy items).
- **Route map** (web URL → app route; the app mirrors web paths so ONE link works on both platforms):
```
/                    → public Welcome            /pricing|about|faq|contact → same-name public screens
/news, /news/[slug]  → public News (or panel news if session role matches)
/login, /child-login → Login (correct segment)   /register → Register
/dashboard           → parent Home tab           /analytics?child&subject → Analytics tab (params)
/olympiads           → parent Olympiads tab      /subscription → Subscription tab
/dashboard/news[/slug] → parent News tab         /children/[id]/subscribe → ChildSubscribe (auth+ownership)
/child               → student Arena             /child/olympiads|leaderboard|news[/slug]|profile → student tabs
```
- **Handling rules**: all links pass an allowlist router (unknown → Welcome/Home, never crash, never open raw params); auth-required links are **deferred** — stored, user routed to Login, replayed after successful auth if role matches (else dropped with a toast); role-mismatched links (parent link in student session) → own Home + toast; cold-start ordering: parse link → boot state machine first (force-update/maintenance still win) → then replay.
- **Notification taps** route through the same deep-link router via a `route` field in the push payload (§10) — payload routes are validated against the same allowlist, never trusted blindly.
- Future (flagged idea, not v1): QR on the web parent dashboard encoding a child-login handoff token.

## 5. Tech stack (pinned, security-vetted)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Expo SDK 52+ (latest stable at implementation), New Architecture, Hermes | managed workflow + EAS |
| Language | TypeScript strict | parity with web |
| Navigation | expo-router (+ native-stack/bottom-tabs) | §3 |
| Backend | @supabase/supabase-js ^2.48+ | same contracts as web |
| Session storage | expo-secure-store via the documented "large secure store" adapter (AES key in SecureStore, ciphertext in MMKV) | tokens never in plain AsyncStorage |
| Data | @tanstack/react-query v5 + MMKV persister (non-sensitive cache only) | §11 |
| UI state | zustand (theme, locale, sheet state) | tiny |
| Images | expo-image (disk cache, placeholders/blurhash) | news covers, wallpapers, avatars |
| Graphics | react-native-svg + expo-linear-gradient | charts, icons, gradients |
| Sheets/gesture | @gorhom/bottom-sheet + reanimated v3 + gesture-handler (Expo-pinned versions) | AccountSheet/detail sheets |
| Media pick | expo-image-picker (photo library ONLY; no camera permission) | avatar upload (via BFF) |
| Connectivity | @react-native-community/netinfo | offline banners (§11) |
| Biometrics | expo-local-authentication (opt-in app-lock, M8) | |
| Push | expo-notifications + Expo Push (M7; §10) | flag-gated |
| OTA | expo-updates (signed) | §18 |
| Crash/errors | sentry-expo — OPTIONAL, single owner decision (§16); no other analytics SDKs | privacy posture |
| Tests | jest-expo + @testing-library/react-native; Maestro E2E | §19 |
| Lint | eslint-config-expo + @typescript-eslint | CI gate |

**Dependency security policy (non-negotiable)**: actively-maintained only (<12mo since release); versions via `npx expo install`; `npm audit` = 0 (override discipline as on web); lockfile committed; each new dep justified in STATUS.md; forbidden: react-native-dotenv, WebView auth, dynamic code loading, packages demanding broad permissions.

## 6. Repository layout

```
mobile-app/
  app/                         # expo-router (§3 route tree)
  src/
    theme/ tokens.ts ThemeProvider useTheme
    i18n/  messages.ts(synced) messages.mobile.ts getT localeStore sync note
    lib/   supabase.ts secureStorage.ts api.ts(BFF client) config.ts(gates) deeplink.ts queryClient.ts
    features/ auth/ parent/ student/ news/ olympiads/ subscription/ analytics/ profile/
    components/ (design system, §2 inventory)
    hooks/ utils/
  scripts/sync-i18n.mjs
  e2e/ (Maestro flows)  __tests__/
  app.config.ts  eas.json  markdowns/
```

## 7. Backend integration

### 7.1 Direct Supabase (anon key + user JWT + RLS) — default path
All user-scoped reads/writes already permitted by RLS: profiles/avatars metadata, own students, news + likes + `bump_news_view`, wallpapers catalog + own selection, subjects/pricing (read), own subscriptions/purchases (read), test-engine RPCs (`start_practice_attempt`, `get_practice_attempt`, `grade_practice_attempt`, `start_olympiad_attempt` — already `authenticated`-granted), `get_child_subject_dashboard`. **The service-role key never exists in this app.**

### 7.2 `get_mobile_config()` — the admin control plane (NEW RPC, stage M1)
SECURITY DEFINER, **anon-callable, hard-coded whitelist** (never `select *`), returns one JSON:
`{ flags:{news_public, olympiad_module, payments, leaderboard, launch_promo, notifications_push}, maintenance:{on, message{az,en,ru}}, locales:{supported, default}, contact:{email, phone}, social:{...}, version:{ios:{min, latest, force, store_url}, android:{...}, message{az,en,ru}} }`
Fetched at cold start + foreground (React Query, 5-min stale). This is how the ADMIN PANEL controls the app with zero releases: maintenance splash, module gates, locale set, forced update. New `mobile_app_versions` table + Admin-only "Mobile App" admin section (audited CRUD) back the `version` block. Standard migration→backport→013 workflow; 013 asserts anon CAN exec + whitelist shape.

### 7.3 Mobile BFF — Next.js route handlers `/api/mobile/v1/*` (web-app)
Privileged flows wrap the EXISTING audited service functions (never reimplemented; not Edge Functions — no logic duplication):
`POST /auth/child-login` (lockout + synthetic-email sign-in → session tokens) · `POST /auth/register` · `POST /children` (add-child) · `POST /children/:id/quote` + `/subscribe` · `POST /children/:id/subjects` (add/remove) · `POST /olympiads/:pkg/purchase` (mock seam intact; **Idempotency-Key header** honored) · `POST /profile/avatar` (byte-sniffed upload).
Contract: Bearer Supabase JWT (server resolves via `auth.getUser`), same guards/ownership/flag-gates/rate-limits as web actions, responses `{ok, data?}` / `{error: <i18nKey>, retryable: boolean}` — mobile translates keys locally; versioned `/v1/` (breaking change ⇒ `/v2/`, old kept one release cycle); every endpoint documented in `mobile-app/markdowns/API_CONTRACTS.md` as built; BFF changes always run the web typecheck+build gate. Parent email/password login is direct supabase-js (no BFF).

## 8. Screen-by-screen state matrix

Every screen implements the five canonical states — **loading** (skeletons matching card shapes, never spinners-only), **content**, **empty** (branded, §2), **error** (message + retry button; never raw error text), **offline** (cached content + banner, §11) — plus its gate variants:

| Screen | Gates / special states |
|---|---|
| Welcome/Pricing | `launch_promo` hides promo line; pricing = static copy (works offline after first load) |
| News list/article | `news_public` (public surface only); anon sees ♥ counter not button; article = beacon-once |
| Login (student) | lockout message (generic), maintenance short-circuit |
| Parent Home | no-children empty (Add-Child CTA); per-child access pills |
| Add-Child wizard | step validation; ID-reveal success screen (copy-to-clipboard + warning that clipboard is sensitive) |
| Analytics | no active subjects → locked panel w/ subscribe CTA; no data → honest empty; single-subject auto-open |
| Olympiads catalog | `olympiad_module` off → GateNotice; `payments` off → browse-only, buy hidden; owned pill; §17 posture |
| Subscription | live sub → manage view; none → plans + CTA; demo Billing/Invoices clearly sectioned until real provider (backlog A) |
| Student Arena | access states: trialing/active → content; inactive/locked/expired → the web's locked cards |
| Attempt runner | resume-safe (attempt id in route); submit double-tap guard; result screen w/ explanations gating parity |
| Ranking | `leaderboard` off → GateNotice; display-names setting anonymization parity |
| Profile (both) | photo actions + 2MB/type errors (server sniff is authoritative); danger zone parent-only |
| Maintenance / ForceUpdate | full-screen, localized admin message; ForceUpdate → store deep link |

## 9. Forms & input UX

KeyboardAvoiding + scroll-into-view on every form; the 8-digit child ID uses a dedicated numeric field (inputMode numeric, autocomplete off, grouped display `1234 5678`); passwords: secure entry + show/hide (web PasswordInput parity) + `textContentType`/`autofill` hints (iOS/Android) for parent credentials only (never for child fields); inline validation mirrors web rules (lengths, email regex) but server stays authoritative; submit buttons disable while pending with progress label (web `saving…` parity); destructive flows always ConfirmSheet (web ConfirmModal parity); every error is a translated key — raw server text never rendered.

## 10. Notification architecture (designed now, shipped M7)

- **Token lifecycle**: on opt-in → `expo-notifications` permission (iOS provisional first where sensible) → Expo push token → upsert to NEW `push_tokens` table `(profile_id FK, token unique, platform, locale, app_version, updated_at)` with RLS self-write/self-delete; token refreshed on launch when changed; deleted on logout; server prunes on Expo "DeviceNotRegistered" receipts.
- **Categories** (per-user opt-in stored locally + mirrored server-side later): `news`, `olympiad_reminders` (event_starts_at approaching for owned/planned), `subscription` (expiry warnings — pairs with backlog item A/access-recompute), `streak` (student-only nudge). Android: matching notification channels; iOS: category identifiers.
- **Sending**: v1 sender = admin-panel "Send notification" module (Admin-only, audited, category+audience+trilingual body → Expo Push API via service key SERVER-side) — this satisfies the deferred web "notifications module" (backlog B) for push; email sender remains a separate backlog item. Delivery jobs (expiry warnings) ride the same pg_cron pattern as grade promotion once the recompute job exists.
- **Payload contract**: `{route: <allowlisted path>, category, messageKey?|title/body per locale}` — taps route through the deep-link allowlist (§4); payloads are DISPLAY data only, never authorization.
- **Kill-switch**: `notifications_push` flag (admin Settings) gates registration AND in-app prompts.

## 11. Offline & caching policy

READ-tolerant, WRITE-strict: React Query + MMKV persister caches **non-sensitive** collections only (news list/articles, wallpapers catalog, pricing copy, config snapshot, subjects) with per-query TTLs; sensitive data (children list, subscriptions, analytics, attempts) is memory-cached only and refetched on focus; ALL mutations require connectivity — offline attempts show a "you're offline" sheet (netinfo) and are never queued (no offline writes v1); global offline banner + per-screen cached-content indicator; attempt runner requires connectivity to start and to submit (mid-attempt drop → resume by attempt id). Logout purges both stores.

## 12. App lifecycle

Cold start: restore session (SecureStore) → parse pending deep link → fetch config (cached-first, network refresh) → root state machine → hydrate query cache. Foreground (>5 min background): refresh config + session; re-run root gates (maintenance/force-update can interrupt). Token refresh: supabase-js auto; hard 401 → one silent refresh → sign-out to Login with a toast. Background: no timers/tasks in v1 (no background fetch permission). App-state listeners centralized in one provider.

## 13. Security (OWASP MASVS-aligned)

Everything from v1 plan §7 stays, plus:
- **Deep links & notifications**: allowlist routing only (§4/§10); no auth material ever in links/payloads.
- **Clipboard**: the 8-digit ID copy action warns it's sensitive; nothing auto-copies.
- **Storage**: tokens SecureStore-adapter only; MMKV cache holds nothing sensitive (list in code comment + reviewed each stage); no PII in logs; Sentry (if enabled) scrubs user data by config.
- **Network**: TLS-only (ATS, cleartext off); hosts = Supabase + BFF only; pinning documented as post-launch option.
- **Auth**: child lockout parity via BFF; optional biometric app-lock (M8); session wipe on logout.
- **Platform**: permissions = photo library (+ notifications at M7) ONLY; Android `allowBackup=false` for secure entries; iOS privacy manifest + Play Data Safety from the M8 data-inventory table; screenshots not blocked (choice, documented).
- **Build**: Hermes bytecode; CI secret-grep gate; EAS secrets; signed OTA; `npm audit` 0 gate.
- **Children's-data posture**: parent-managed education app; recommendation stands — do NOT enroll Kids Category/Families, but comply materially (no ads, no tracking, no 3rd-party sharing, parental purchase control). Owner confirms at M8.
- Root `CLAUDE.md` Security Engineering Rules govern all BFF code verbatim.

## 14. Accessibility & localization details

A11y: every touchable has `accessibilityRole/Label` (translated); Dynamic Type respected up to 1.3× (layouts tested at max; tab labels may truncate gracefully); contrast AA against both themes (lime-on-dark and purple-on-cream verified token pairs); focus order on forms; charts get text summaries (`accessibilityLabel` = "accuracy 82%, trend up"); reduce-motion honored.
Localization: az/en/ru synced from web (§2); dates via `Intl` with the app locale (Baku-relevant formats), numbers/currency `AZN` formatted per locale; no runtime plural library — plural-sensitive strings authored as full phrases per locale (web convention); pseudo-locale length test at M0 (az strings run long — layouts must wrap, never overflow).

## 15. Performance budgets (CI-checked where possible, manually verified per release)

Cold start to Welcome/Home ≤ 2.5s on a mid-tier Android (e.g., 4GB RAM class); JS bundle ≤ 3.5MB (hermes bytecode); every scroll list = FlatList/FlashList-pattern virtualization with stable keys + memoized cards; images always sized (never full-res into thumbnails — the web Round-5 lesson) via expo-image with explicit dimensions + `contentFit cover`; charts render ≤ 16ms frames (precomputed points, no per-frame layout); attempt runner: question transition < 100ms (prefetch next question data from the already-fetched attempt payload); no jank on tab switches (screens stay mounted).

## 16. Observability & error handling

Global error boundary per navigator (branded "something went wrong" + retry/report); BFF/network errors normalized to `{error, retryable}` → standard toast/inline patterns; **sentry-expo optional** — single owner decision (privacy posture, backlog C item "error reporting"): if ON → crashes + handled-error breadcrumbs, PII-scrubbed, EU routing; if OFF → local `expo-updates` release health only. No product analytics SDK in v1 (documented). Structured console logging stripped from production builds.

## 17. Store & payments compliance

Unchanged v1 recommendation: **read-only commerce on mobile** (subscription state + olympiad ownership visible; purchase buttons hidden by mobile-side posture even when web `payments` flag is on; neutral "managed from the family's web account" wording; no outbound purchase links unless the jurisdictional anti-steering situation is re-checked at M8). Forward design for real IAP (M9+, after the real web provider): RevenueCat (or StoreKit2/Play Billing direct) mapped onto the SAME provider-agnostic tables (checkout_sessions/payments/payment_events) with server receipt validation feeding the existing webhook-verified activation path; the `processOlympiadPayment` seam and subscription RPCs remain the integration points. Store listing: az/en/ru metadata, screenshots per theme, age rating questionnaire prepared at M8.

## 18. Environments, EAS pipelines, versioning & OTA

- **Environments**: `development` (dev client, dev Supabase), `preview` (internal distribution, dev/staging Supabase), `production` (stores, prod Supabase). Matching expo-updates channels; env via `app.config.ts` reading EAS env vars — zero secrets in code (only URL + anon key are even present).
- **Versioning**: semver `MAJOR.MINOR.PATCH` + auto-incremented build numbers (EAS); `runtimeVersion: {policy: "appVersion"}` so OTA never crosses native-module boundaries.
- **OTA policy**: JS-only fixes/copy/theme via signed expo-updates to `production` channel; anything touching native modules/permissions/SDK = store release; every OTA recorded in STATUS.md; instant rollback = republish previous update.
- **Pipelines**: `eas build --profile preview` per stage-close; `eas build --profile production` + `eas submit` at M8/M9; CI script order: typecheck → lint → jest → audit → (tag) build.
- **Suggested identifiers**: `ai.olimpiq.app` (iOS bundle id + Android applicationId), name "OlimpIQ", scheme `olimpiq`.

## 19. QA strategy & release checklist

- **Device/OS floor**: iOS 15.1+ (Expo SDK floor), Android 8.0+ (API 26). Matrix per release: 1 small iPhone, 1 large iPhone, 1 mid Android (test priority), 1 large Android; both themes × 3 locales spot-grid.
- **Automated**: jest-expo unit/component (gates, i18n fallback, deep-link router allowlist, config parsing, form validators); Maestro E2E smoke: parent login→dashboard, child login→arena, open news article, run+submit practice, wallpaper change, logout.
- **Manual per stage**: the stage's acceptance list + a rolling regression sheet (mirrors the web guide style: M-sections appended to `docs/MANUAL_TESTING_GUIDE.md`).
- **Release checklist (M8/M9)**: audit 0 · budgets met (§15) · a11y pass · flags flip-test (all six + maintenance + force-update) · deep-link matrix test · store metadata ×3 locales · privacy labels from data inventory · rollback plan noted · STATUS.md updated.

## 20. Web-parity debt — deferred web features and how mobile absorbs them

(Backlog reference: `docs/PRODUCT_COMPLETION_BACKLOG.md`.)

| Deferred item (backlog) | Mobile accommodation (built-in seam, no rework later) |
|---|---|
| Real payments + webhook (A) | §17: read-only v1; IAP stage M9+ maps to the same provider-agnostic tables; BFF purchase endpoint takes Idempotency-Key from day one |
| Access-recompute job + expiry (A) | Access states (§8 Arena) already render expired/locked; `subscription` push category (§10) carries expiry warnings once the job exists |
| Admin subscription/payment monitoring (A) | Admin-panel scope; no mobile surface needed — noted so mobile never blocks on it |
| Billing/Invoices demo (A) | Subscription screen sections are componentized so real provider data drops into the same cards |
| Daily Tasks engine (B) | Reserved: student tab bar supports a 5th "Tasks" tab behind a future `daily_tasks` flag; navigation + gating patterns already generic; schema exists — mobile consumes a future RPC |
| Real leaderboard (B) | Ranking screen renders a full-board list component from day one (fed by own-row today); board RPC swap-in is data-only |
| Achievements (B) | Arena home grid has a reserved achievements row behind a flag; student_achievements read is RLS-ready |
| Notifications center email/push (B) | §10 IS the push half, incl. the admin send module; email stays web/backlog; user prefs screen stubbed in Profile at M7 |
| Support/contact intake (B) | Contact screen mirrors web (display-only); if ticketing lands, it becomes a form → BFF endpoint |
| Coupons (A/⚪) | Quote/subscribe BFF passthrough already carries an optional `coupon` field (ignored until built) |
| Schools beyond Bakı (D) | Add-Child wizard school picker is search-based (server `.ilike`) — scales to any seeded region automatically |
| Admin MFA / durable rate limiting (C) | BFF inherits whatever the web adopts — no mobile change |
| Error reporting decision (C) | §16 sentry-expo toggle honors the same decision |
| ESLint/tests gaps (C) | Mobile ships with lint+jest from M0; web backfill remains a web task |

## 21. Quality gates (every mobile stage)
`tsc --noEmit` · `expo lint` · jest suite · `npm audit` 0 · Maestro smoke · EAS preview boots (both platforms) · trilingual/no-overflow review · flags flip-test · budgets sanity (§15) · STATUS.md delta.

## 22. Risk register

| Risk | Mitigation |
|---|---|
| Store rejection over child accounts/payments | §13 posture + §17 read-only commerce; review notes prepared at M8 |
| SecureStore size limits (Android) | the large-secure-store adapter is specified up front (§5) |
| Expo SDK / New-Arch library incompatibilities | Expo-pinned versions only (`npx expo install`); deps chosen from Expo-recommended set |
| i18n drift web↔mobile | build-time sync script is the ONLY way keys enter mobile |
| BFF coupling breaks web builds | BFF stages always run the web typecheck+build gate; contracts versioned `/v1` |
| OTA breaking native boundary | runtimeVersion appVersion policy (§18) makes it impossible |
| Config RPC leaking settings | hard-coded whitelist + 013 validation check + review rule: no `select *` |
| Az string overflow on small screens | M0 pseudo-length test + wrap-first layouts (§14) |

## 23. Owner decisions needed (asked once, at activation / before M8)
1. Store accounts (Apple Developer + Play Console) availability; 2. bundle id `ai.olimpiq.app` + name "OlimpIQ" confirm; 3. push notifications in v1 scope (M7 in or out); 4. §17 read-only-payments posture confirm; 5. sentry-expo on/off (§16); 6. Kids-Category posture confirm (§13).
