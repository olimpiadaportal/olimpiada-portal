# OlympIQ Mobile App — Master Plan v3 (React Native + Expo)

Status: **PLANNED & READY TO BUILD (owner-approved direction). Implementation starts only when the owner activates a Mobile stage (M1–M4) in `STATUS.md`.**
Companions: root `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` (the 4 BIG build stages M1–M4) · `docs/NOTIFICATIONS_MOBILE_CONTRACT.md` (exact push/notification contract) · `docs/PRODUCT_COMPLETION_BACKLOG.md` (deferred web features — §20 maps every remaining item into this plan).
v3 (2026-07-09) supersedes v2: rewritten against the ACTUAL shipped web platform (Rounds 11–17) — the real test engine, the real leaderboard + seasons, the live notification engine (in-app shipped; push architected server-side), payment modes (real/demo/giveaway) + scheduled free-access intervals, character stickers + arena palettes (wallpapers retired), the Website-Content CMS override layer, mandatory E.164 phone at registration, MCQ=4 fixed rule, the 3-status content lifecycle, and the verified RPC-grant inventory. Stages consolidated from M0–M9 into 4 big stages.

---

## 1. Product intent

One app, three surfaces behind one entry — mirroring the web-app exactly:
- **Public** (unauthenticated): landing-lite, pricing (per-subject plan cards), about highlights, FAQ, contact (admin-driven email/phone/socials), public news (views + like counters), login (parent|student segmented), parent registration (with mandatory phone).
- **Parent**: dashboard (children cards + per-child leaderboard chip + carousel + news panel), Analytics (real `get_child_subject_dashboard` + per-child leaderboard panel), Olympiads catalog + per-child purchase, Subscription center (multi-child selector, Plans/Billing/Invoices, manage-subjects payment-first editor, cancel flow), News, **Notifications inbox**, Profile (avatar/password/danger zone + **notification preferences for self and each child** + **edit child info**).
- **Student (arena)**: arena home (streak/stats/leaderboard quick-look/today's round → tests), **Tests** (topic-test engine: setup → timed runner → results → review), Olympiads (planned + owned + attempt runner; flag-gated), Ranking (real leaderboard; flag-gated), News, **Notifications inbox**, Profile (avatar/password/read-only school info/sticker theme + palette pickers).

Product rules are identical to web and non-negotiable: parent-only registration; child login = 8-digit ID + parent password (synthetic auth email `c<8digits>@children.invalid` — mapping lives server-side); children never purchase; server-side trust boundary; trilingual az(default)/en/ru everywhere; users never choose question difficulty; MCQ = exactly 4 options / 1 correct (fixed rule).

Explicit v1 non-goals: tablets-first layouts (adaptive stretch only), offline WRITES, real store payments (§17 — no real provider exists anywhere yet, backlog A1), social sign-in, chat/support messaging, child self-registration (never), sticker DECORATIONS rendering (see §2), Daily Tasks (no app code exists on web either — reserved seam only).

## 2. Brand & design system (identical to web)

- **Tokens mirrored, not reinvented** — `src/theme/tokens.ts` replicates `web-app/src/app/globals.css`:
  - Light (Energetic): bg `#fffbf5`, surface `#ffffff`, accent `#7c3aed`, accent-2 `#ff8a00`, soft `#f7f0fe`, text `#2a1a3e`, ok `#06b66b`, danger `#ff4757`; radius 14–22; purple→orange gradients (logo, hero, stat numbers) via expo-linear-gradient.
  - Dark: web root dark tokens (owner's frozen reference — never altered). Arena: `#0a0e1a/#141d33/#1a2542/#26314f/#eef3ff/#7e8db5/#56638a/#c4ff00/#2f6bff/#ff4d6d/#ffc94d`; arena-LIGHT remap identical to the web `[data-theme="light"] .arena` block (lime→purple, white panels).
  - **Arena palettes (NEW, shipped Round 12):** the 5 child light-mode palettes `sky / bubblegum / mint / sunset / rainbow` (+ default) re-map arena tokens exactly like the web `[data-theme="light"] .arena[data-palette=…]` rules; driven by `students.palette` (whitelist, empty = default). Token remaps are part of `tokens.ts` from day one.
- **Character stickers:** the web renders admin-uploaded sticker decorations ONLY in desktop side gutters (hidden < 1280px — owner-approved). Phones have no gutters, so **mobile v1 renders NO sticker decorations**; the child profile still ships the **sticker THEME picker** (it drives the child's web experience; reads enabled `sticker_themes`/`sticker_images`, writes `child_sticker_selections` via RLS).
- **Typography**: platform system sans (SF Pro/Roboto — Azerbaijani ə-safe, same rationale as the web Arial rule); JetBrains Mono equivalents only for numeric accents (IDs/prices/stats, tabular numerals); type scale 12/14/16/18/22/28 with Dynamic-Type support (§14).
- **Iconography**: single custom inline-SVG set via react-native-svg (mirrors the web's stroke icons — user, calendar, medal, lock, chevron, heart, bell, bookmark, socials). No icon fonts, no external assets.
- **Motion & haptics**: 150–250ms ease transitions (reanimated); haptics (expo-haptics) on: correct/wrong reveal, purchase success, pull-to-refresh, destructive confirm. Respect OS reduce-motion.
- **App icon & splash**: gradient logo mark (135° `#7c3aed→#ff8a00` rounded square, −4° tilt) on cream; dark splash variant; adaptive icon (Android). Assets generated at M1, owner-approved before M4 store prep.
- **Empty states**: every list has a branded empty illustration (small inline SVG) + one-line copy ×3 locales (news, children, olympiads, attempts, board, notifications).
- **Component inventory** (native rebuilds of the shipped web contracts): PlanCard (+Most Popular/current badges), NewsCard/ArticleView (likes ♥ + view badge), FAQ accordion, Segmented (language/theme/child-selector), AccountSheet (= web ProfileDrawer: Account/Language/Appearance/Session), Modal + ConfirmSheet (= web shared Modal semantics), profile settings cards (identity/security/danger/session), KPI tiles + SVG charts (weekly bars, accuracy trend), OlympiadCard + detail sheet (+ "ask your parent" note), **GiveawayBanner/FreeAccessBanner (live d/h/m/s countdown, 1s tick, 2-digit padded)**, **NotificationBell (badge 99+, dropdown last 8) + NotificationRow + NotificationDetailSheet (safe minimal-markdown body) + PreferencesRows (self + per-child)**, **TestSetup tri-state topic/subtopic picker, TestRunner (timer chip warn/crit states, palette grid, bookmark icon), ResultBars (per-topic), ReviewFilterTabs (All/Correct/Wrong/Skipped)**, **LeaderboardTable (medals, self-highlight, anonymized rows "Şagird •1234"), RankCard, StreakCard (at-risk urgency)**, StickerThemeCard + PaletteSwatchCard, GateNotice (payments/olympiad/leaderboard/notifications/maintenance), ForcedUpdate screen, StreakChip, AccessStateCards (inactive/locked/expired), PhoneField (compact `AZ +994` trigger + searchable country sheet).

## 3. Navigation architecture

**Library**: expo-router (typed, file-based) over React Navigation primitives (native-stack + bottom-tabs).

**Root state machine** (evaluated at boot and on config/auth changes, in this priority order):
```
1. force-update required (config.version)        → ForceUpdate screen (dead end)
2. maintenance.on (platform.maintenance_mode)    → Maintenance screen (dead end; retry on foreground)
3. no session                                    → (public) stack
4. session role = parent                         → (parent) tabs
5. session role = student                        → (student) tabs
6. session but role unresolved (network)         → Boot spinner w/ retry + logout escape
```

**Public stack** (native-stack, header per screen): Welcome → {Pricing, About, FAQ, Contact, News, NewsArticle} + Auth group {Login (parent|student segmented, mirrors web /login + /child-login), Register (with PhoneField), Forgot} presented as a stack, not tabs. The GiveawayBanner mounts on the public stack while a giveaway window is active (web parity: lures new customers).

**Parent bottom tabs** (5 — matches web nav; Help folds into Profile, Notifications folds into the header bell):
| Tab | Route | Icon | Inner stack |
|---|---|---|---|
| Home | `(parent)/home` | logo dot | Dashboard → AddChild wizard → ChildSubscribe/ManageSubjects → ChildOlympiads → ChildEdit |
| Analytics | `analytics` | chart | Analytics (child/subject params + leaderboard panel) |
| Olympiads | `olympiads` | medal | Catalog → PackageDetail(sheet) → Purchase(sheet) |
| Subscription | `subscription` | card | child-selector tabs → Plans/Billing/Invoices (one scroll page, section tabs like web) |
| News | `news` | newspaper | List → Article |
Header (every tab): **NotificationBell** (when `notifications` flag on; dropdown → full Notifications screen) + avatar button opening the **AccountSheet**; "My profile" pushes Profile full-screen (identity/password/danger/session + notification preferences self + per-child). FAQ/Contact live as rows in Profile (web parity: /help/*). Giveaway/free-access countdown banners render above tab content (web parity).

**Student bottom tabs** (5, arena chrome + palette-aware): Arena `(student)/arena` · **Tests `tests` (core, never gated)** · Olympiads (visible only when `olympiad_module` on) · Ranking (visible only when `leaderboard` on) · News. Header: StreakChip (🔥 from `get_streak_status`) + NotificationBell + avatar → AccountSheet → Profile. The test/olympiad attempt runner (`tests/run/[attemptId]`) is a full-screen modal stack OVER tabs with back-guard ("leave test?" confirm — autosave means leaving is safe but warned; the server deadline keeps ticking).

**Behavior rules**: Android hardware back = pop stack → collapse sheet → (on tab root) switch to Home tab → double-back-to-exit toast; re-tapping the active tab scrolls-to-top then pops-to-root; tab state preserved across switches; News tab dot when a newer `published_at` than last-seen (local watermark); the NotificationBell badge is the REAL `get_unread_notification_count` (+ Realtime bumps); gated tabs disappear entirely (flags) rather than disable.

## 4. Deep linking

- **Schemes**: custom `olympiq://` (always) + **universal/app links** on `https://olympiq.ai/*` once the domain is live (AASA + assetlinks served from the web-app public dir — a web-app deliverable, tracked in backlog C1/C2).
- **Route map** (web URL → app route; the app mirrors web paths so ONE link works on both platforms):
```
/                    → public Welcome            /pricing|about|faq|contact → same-name public screens
/news, /news/[slug]  → public News (or panel news if session role matches)
/login, /child-login → Login (correct segment)   /register → Register
/dashboard           → parent Home tab           /analytics?child&subject → Analytics tab (params)
/olympiads           → parent Olympiads tab      /subscription?child= → Subscription tab (child param)
/dashboard/news[/slug] → parent News tab         /children/[id]/subscribe|edit|olympiads → child screens (auth+ownership)
/notifications       → parent Notifications      /profile → parent Profile
/child               → student Arena             /child/test[/...] → Tests stack (setup/run/result/review)
/child/olympiads|leaderboard|news[/slug]|profile|notifications → student tabs/screens
```
- **Handling rules**: all links pass an allowlist router (unknown → Welcome/Home, never crash, never open raw params); auth-required links are **deferred** — stored, user routed to Login, replayed after successful auth if role matches (else dropped with a toast); role-mismatched links (parent link in student session) → own Home + toast; cold-start ordering: parse link → boot state machine first (force-update/maintenance still win) → then replay.
- **Notification taps** route via the notification's **`action_url`** (a same-origin RELATIVE path — the shipped engine's contract) validated exactly like `isSafeRelativeUrl` in `web-app/src/lib/notifications/types.ts` (single leading `/`, no `//`, no `\`, no `://`, ≤512 chars), then mapped through the same allowlist router. Payload data is DISPLAY-only, never authorization.

## 5. Tech stack (pinned, security-vetted)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Expo SDK (latest stable at implementation), New Architecture, Hermes | managed workflow + EAS |
| Language | TypeScript strict | parity with web |
| Navigation | expo-router (+ native-stack/bottom-tabs) | §3 |
| Backend | @supabase/supabase-js v2 (latest) | same contracts as web; Realtime for notifications |
| Session storage | expo-secure-store via a CHUNKED adapter (as built M1: session JSON split into keystore-sized chunks — everything stays in the OS keystore, Expo-Go-testable, no hand-rolled crypto) | tokens never in plain AsyncStorage |
| Data | @tanstack/react-query v5 + MMKV persister (non-sensitive cache only) | §11 |
| UI state | zustand (theme, locale, sheet state) | tiny |
| Images | expo-image (disk cache, placeholders/blurhash) | news covers, sticker previews, avatars |
| Graphics | react-native-svg + expo-linear-gradient | charts, icons, gradients |
| Sheets/gesture | @gorhom/bottom-sheet + reanimated v3 + gesture-handler (Expo-pinned versions) | AccountSheet/detail sheets |
| Media pick | expo-image-picker (photo library ONLY; no camera permission) | avatar upload (via BFF, byte-sniffed server-side) |
| Connectivity | @react-native-community/netinfo | offline banners (§11) |
| Biometrics | expo-local-authentication (opt-in app-lock, M4) | |
| Push | expo-notifications + Expo Push (M4; §10) | flag-gated (`notifications_push`) |
| OTA | expo-updates (signed) | §18 |
| Crash/errors | sentry-expo — OPTIONAL, single owner decision (§16); no other analytics SDKs | privacy posture |
| Tests | jest-expo + @testing-library/react-native; Maestro E2E | §19 |
| Lint | eslint-config-expo + @typescript-eslint | CI gate |

**Dependency security policy (non-negotiable)**: actively-maintained only (<12mo since release); versions via `npx expo install`; `npm audit` = 0 (override discipline as on web); lockfile committed; each new dep justified in STATUS.md; forbidden: react-native-dotenv, WebView auth, dynamic code loading, packages demanding broad permissions.

## 6. Repository layout

```
mobile-app/
  src/app/                     # expo-router (§3 route tree; SDK's src/app convention)
  src/
    theme/ tokens.ts (incl. arena palettes) ThemeProvider useTheme
    i18n/  messages.ts(synced from web) messages.mobile.ts getT localeStore overrides.ts(CMS layer)
    lib/   supabase.ts secureStorage.ts api.ts(BFF client) config.ts(mobile-config gates) deeplink.ts queryClient.ts notifications.ts
    features/ auth/ parent/ student/ tests/ news/ olympiads/ subscription/ analytics/ leaderboard/ notifications/ profile/
    components/ (design system, §2 inventory)
    hooks/ utils/
  scripts/sync-i18n.mjs
  e2e/ (Maestro flows)  __tests__/
  app.config.ts  eas.json  markdowns/
```

## 7. Backend integration (verified against the live grant inventory, 2026-07-09)

### 7.1 Direct Supabase (anon key + user JWT + RLS) — the default path
The mobile app calls these EXISTING contracts directly; nothing new is needed server-side:

- **Test engine (child)**: `start_topic_test_attempt(subject, topic_ids[], subtopic_ids[])` → `get_test_attempt(attempt, locale)` (questions WITHOUT answer keys, saved answers/flags, server `remaining_seconds`) → `save_test_answers` (30s autosave + deadline resync; SQLSTATE `23514` = deadline passed → auto-submit) → `submit_test_attempt` (idempotent; `p_answers:null` fetches/finalizes) → `get_test_review(attempt, locale)` (keys + explanations, owner + graded only). Constants mirrored from web: 25 questions/25 min default, autosave 30_000ms, `P0002` → "no questions", answer cap 30, ≤8 options rendered.
- **Practice + olympiad attempts (child)**: `start_practice_attempt(subject, 25)`, `get_practice_attempt`, `grade_practice_attempt`, `start_olympiad_attempt(package)` (purchase-gated in EVERY mode — free windows never open olympiads).
- **Leaderboard**: `get_leaderboard(board, scope, scope_id, period, 50)` (points|streak; global/subject/grade/city/school; month|all_time; server-side anonymization "Şagird •tag" honoring `leaderboard.public_display_names`), `get_my_leaderboard_rank(...)`, `get_streak_status()` (current/best/state/hours_until_loss), parent `get_child_leaderboard_summary(student)`.
- **Analytics (parent)**: `get_child_subject_dashboard(child, subject?, days?)`.
- **Notifications**: inbox = `select` on `notifications` (RLS = own rows, non-expired, newest first) + **Realtime** `postgres_changes` INSERT filtered `recipient_profile_id=eq.<me>`; `get_unread_notification_count`, `mark_notification_read`, `mark_all_notifications_read`, `delete_notification`, `get/set_notification_preferences` (parent may pass a child's profile id — enforced in-RPC), `upsert_push_token(token, platform, device)`. Full contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`.
- **Free access**: `current_parent_free_access()` (`{active, ends_at}` → parent banner), `my_free_access_active()` (child), `is_child_free_access_active(student)` (per-child gating parity).
- **News**: `news` + `news_translations` are anon-readable (published); `bump_news_view` (anon-callable, once per session watermark), likes via `news_likes` (authenticated toggle; anon sees counter only).
- **Catalog reads (RLS)**: `subjects/grades/topics/subtopics/districts/schools` + `subjects_pricing` + `launch_promo_config` (anon-readable); `olympiad_packages`(+translations, active), `olympiad_purchases` (own), `child_subscriptions`/`subscription_subjects` (own), `students`/`profiles` (own/linked), `sticker_themes`/`sticker_images` (enabled) + `child_sticker_selections` (self-write via RLS — the ONLY direct client write besides nothing else), `test_attempts` history (own).
- **The service-role key never exists in this app.** Also note: `answer_options` are NOT client-readable — options only ever arrive through the attempt RPCs (anti-cheat parity).

### 7.2 `get_mobile_config()` + `get_mobile_content(locale)` — the admin control plane (NEW, stage M1)
`feature_flags`, `system_settings`, and `site_content` are **admin-RLS-locked** (the web reads them server-side with the service role), so the mobile app CANNOT read raw flags — these two RPCs are the whitelist readers:
- **`get_mobile_config()`** — SECURITY DEFINER, **anon-callable, hard-coded whitelist** (never `select *`), returns one JSON:
  `{ payment: {mode: real|demo|giveaway|off, giveaway_ends_at?}, flags: {news_public, olympiad_module, leaderboard, notifications, notifications_push, launch_promo}, maintenance: {on, message{az,en,ru}}, locales: {supported, default}, contact: {email, phone}, social: {facebook,instagram,youtube,tiktok}, version: {ios:{min, latest, force, store_url, message{az,en,ru}}, android:{...}} }` (as built M1: the update message is PER-PLATFORM).
  The payment **mode** is resolved server-side exactly like `web-app/src/lib/paymentMode.ts` (giveaway window = `giveaway.started_at` + `giveaway.duration_days`, lazy expiry; precedence giveaway>demo>real>off) — the client NEVER computes or trusts a mode. Fetched at cold start + foreground (React Query, 5-min stale).
- **`get_mobile_content(p_locale)`** — anon-callable, returns the `site_content` override map for ONE locale (key → text, registry-capped). Layered over the synced `messages.ts` exactly like the web's `getT`/I18nProvider, so the owner's Website-Content CMS edits reach mobile with zero releases.
- New `mobile_app_versions` table + Admin-only **"Mobile App" admin section** (audited CRUD: min/latest/force per platform + trilingual message + store URLs) back the `version` block — this section does NOT exist yet; it is an M1 deliverable. Standard migration→backport→`013` workflow; `013` asserts anon CAN exec both RPCs + whitelist shape + versions table stays admin-write.

### 7.3 Mobile BFF — Next.js route handlers `/api/mobile/v1/*` (web-app)
Privileged flows wrap the EXISTING audited service functions (never reimplemented). Verified service-role-only surface → endpoint list:
`POST /auth/child-login` (lockout `is_child_login_locked` + `record_child_login_attempt` + synthetic-email sign-in → session tokens) · `POST /auth/register` (parent; **mandatory E.164 phone**, same regex + rate limits as `registerParent`) · `POST /children` (add-child → `createChild`, ID deferred) · `POST /children/:id/quote` (`quote_child_subscription`) · `POST /children/:id/subscribe` (`subscribeChild` → allocates + returns the 8-digit ID) · `POST /children/:id/subjects` (batch diff like `updateSubscriptionSubjectsAction`, payment-first contract) · `POST /children/:id/activate-free` (`activateChildGiveaway` — giveaway/free-access add-child path) · `POST /children/:id/edit` (`updateChildProfile`) · `POST /children/:id/reset-password` (`resetChildPasswordAction`) · `POST /subscriptions/:id/cancel` (`cancelChildSubscription`) · `POST /olympiads/:pkg/purchase` (`purchaseOlympiadForChild`; mock seam intact; **Idempotency-Key header** honored) · `POST /profile/avatar` (byte-sniffed upload, `profile-avatars`) · `POST /account/delete` (`deleteParentAccount`).
Contract: Bearer Supabase JWT (server resolves via `auth.getUser`), same guards/ownership/mode-gates (`paidMutationGate`)/rate-limits as the web actions, responses `{ok, data?}` / `{error: <i18nKey>, retryable}` — mobile translates keys locally; versioned `/v1/` (breaking change ⇒ `/v2/`, old kept one release cycle); every endpoint documented in `mobile-app/markdowns/API_CONTRACTS.md` as built; BFF changes always run the web typecheck+build gate. Parent email/password login is direct supabase-js (no BFF). The existing `/api/notifications/process` processor is NOT a mobile endpoint (worker-only, `x-processor-key`).

## 8. Screen-by-screen state matrix

Every screen implements the five canonical states — **loading** (skeletons matching card shapes), **content**, **empty** (branded, §2), **error** (translated message + retry; never raw error text), **offline** (cached content + banner, §11) — plus its gate variants:

| Screen | Gates / special states |
|---|---|
| Welcome/Pricing | `launch_promo` hides promo line; pricing from anon-readable `subjects_pricing` (works offline after first load); giveaway countdown banner when active |
| News list/article | `news_public` (public surface only; in-app news intentionally ungated, web parity); anon sees ♥ counter not button; view beacon once/session |
| Login (student) | generic lockout message (no enumeration), maintenance short-circuit |
| Register | mandatory phone (PhoneField), email-exists message (owner-approved exception), rate-limit errors |
| Parent Home | no-children empty (Add-Child CTA); per-child access pills; per-child leaderboard chip (flag-gated); giveaway/free-access banners |
| Add-Child wizard | mode-driven flows (web parity): real/demo = info→subjects→plan→payment→done; giveaway/free-access = info→done (instant ID); off = info→done (ID pending); ID-reveal screen (copy-to-clipboard + sensitive warning) |
| Analytics | subject tabs from the child's REAL coverage (locked others w/ subscribe CTA); no data → honest empty; leaderboard panel behind flag |
| Olympiads catalog | `olympiad_module` off → GateNotice; purchase ALWAYS paid (mode `off` → browse-only); owned pill; §17 posture |
| Subscription | child-selector tabs; live sub → manage-subjects (payment-first); none → plans + CTA; demo Billing/Invoices clearly sectioned until the real provider (backlog A1/A5) |
| Student Arena | access states: trialing/active/free-window → content; inactive/locked/expired → the web's locked cards |
| Tests home/setup | subject cards from access set; continue-card for a live attempt; tri-state topic/subtopic picker; instructions/consent gate |
| Test runner | resume-safe (attempt id in route, `?resumed`); server-deadline timer (warn ≤300s, crit ≤60s); autosave chip; palette; bookmark; submit confirm w/ unanswered count; deadline auto-submit |
| Results/review | per-topic bars; review filter tabs All/Correct/Wrong/Skipped; explanations only post-grading |
| Ranking | `leaderboard` off → GateNotice; Points/Streak boards, scope chips only for ids the child has; anonymized rows |
| Notifications | flag off → hidden everywhere; inbox w/ category chips, mark-all, delete, detail sheet (safe markdown); prefs self + per-child (parent) |
| Profile (both) | photo actions + 2MB/type errors (server sniff authoritative); child school info read-only; danger zone parent-only; sticker/palette pickers (child) |
| Maintenance / ForceUpdate | full-screen, localized admin message; ForceUpdate → store deep link |

## 9. Forms & input UX

KeyboardAvoiding + scroll-into-view on every form; the 8-digit child ID uses a dedicated numeric field (inputMode numeric, autocomplete off, grouped display `1234 5678`); the phone field replicates the web PhoneField (compact `AZ +994` trigger → searchable country sheet, national-number input, composed E.164, client regex `^\+[1-9][0-9]{6,14}$` — server stays authoritative); passwords: secure entry + show/hide + `textContentType`/`autofill` hints for parent credentials only (never for child fields); inline validation mirrors web rules but the server is authoritative; submit buttons disable while pending with progress label; destructive flows always ConfirmSheet; every error is a translated key — raw server text never rendered.

## 10. Notification architecture (server SHIPPED — mobile plugs in; push wired at M4)

The full engine already exists (migrations 042–044): `notifications` (idempotency, priority, category, `action_url`, expiry), `notification_deliveries` (`in_app|email|push`), `notification_preferences` (parent-manages-child), `push_tokens` (ios/android/web, `is_valid`, `failure_count`), admin composer (audience targeting + multi-parent + rich text + schedule + templates + history; the push channel is already labeled "Mobil tətbiq"), event generators, Realtime publication, dispatch + prune crons, and the delivery processor (`web-app POST /api/notifications/process`) with a live `sendPushDelivery` seam. **Exact contract: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`.**

Mobile-side work (all at M4; in-app inbox/bell/prefs ship earlier at M2/M3 since they're plain RPC + Realtime):
- **Token lifecycle**: on opt-in → `expo-notifications` permission (iOS provisional first where sensible) → Expo push token → `upsert_push_token(token, platform, {model,…})`; refresh on launch when changed; delete on logout; server invalidates on Expo `DeviceNotRegistered` receipts (`is_valid=false` — add that call inside `sendPushDelivery` when wiring Expo).
- **Go-live switch**: set `EXPO_ACCESS_TOKEN` on the web BFF + flip the `notifications_push` flag (admin Settings). Flag off = zero registration AND no prompts.
- **Categories/channels**: map the engine's `category` values to Android notification channels + iOS categories; per-user opt-in = the existing `notification_preferences.push_enabled` (no new storage).
- **Tap routing**: push payload carries the notification's `action_url` → validated (§4) → allowlist router. Payloads are DISPLAY data only, never authorization.

## 11. Offline & caching policy

READ-tolerant, WRITE-strict: React Query + MMKV persister caches **non-sensitive** collections only (news list/articles, pricing, config + content-override snapshots, subjects/taxonomy, sticker catalog) with per-query TTLs; sensitive data (children list, subscriptions, analytics, attempts, notifications, leaderboard) is memory-cached only and refetched on focus; ALL mutations require connectivity — offline attempts show a "you're offline" sheet (netinfo) and are never queued (no offline writes v1); global offline banner + per-screen cached-content indicator; the test runner requires connectivity to start and submit (mid-attempt drop → resume by attempt id; the server deadline keeps ticking). Logout purges both stores.

## 12. App lifecycle

Cold start: restore session (SecureStore) → parse pending deep link → fetch config + content overrides (cached-first, network refresh) → root state machine → hydrate query cache. Foreground (>5 min background): refresh config + session; re-run root gates (maintenance/force-update can interrupt); resync any open attempt timer from the server. Token refresh: supabase-js auto; hard 401 → one silent refresh → sign-out to Login with a toast. Background: no timers/tasks in v1. App-state listeners centralized in one provider.

## 13. Security (OWASP MASVS-aligned)

- **Deep links & notifications**: allowlist routing only (§4/§10); `action_url` validated as a safe relative path; no auth material ever in links/payloads.
- **Clipboard**: the 8-digit ID copy action warns it's sensitive; nothing auto-copies.
- **Storage**: tokens SecureStore-adapter only; MMKV cache holds nothing sensitive (list in code comment + reviewed each stage); no PII in logs; Sentry (if enabled) scrubs user data by config.
- **Network**: TLS-only (ATS, cleartext off); hosts = Supabase + the web BFF only; pinning documented as a post-launch option.
- **Auth**: child lockout parity via the BFF (DB lockout + IP throttle live there); optional biometric app-lock (M4); session wipe on logout.
- **Anti-cheat parity**: options never carry `is_correct` pre-grading (enforced server-side — the client just must never cache review payloads into MMKV); attempt timers are server-authoritative.
- **Platform**: permissions = photo library (+ notifications at M4) ONLY; Android `allowBackup=false` for secure entries; iOS privacy manifest + Play Data Safety from the M4 data-inventory table; screenshots not blocked (choice, documented).
- **Build**: Hermes bytecode; CI secret-grep gate; EAS secrets (only the Supabase URL + anon key even exist client-side); signed OTA; `npm audit` 0 gate.
- **Children's-data posture**: parent-managed education app; recommendation stands — do NOT enroll Kids Category/Families, but comply materially (no ads, no tracking, no 3rd-party sharing, parental purchase control). Owner confirms at M4.
- Root `CLAUDE.md` Security Engineering Rules govern all BFF code verbatim.

## 14. Accessibility & localization details

A11y: every touchable has `accessibilityRole/Label` (translated); Dynamic Type respected up to 1.3× (layouts tested at max; tab labels may truncate gracefully); contrast AA against all themes INCLUDING the 5 arena palettes (accent-on-surface pairs verified per palette); focus order on forms; charts get text summaries (`accessibilityLabel` = "accuracy 82%, trend up"); reduce-motion honored.
Localization: az/en/ru keys SYNCED from web `messages.ts` (~3,300 lines) via the build-time script + `messages.mobile.ts` overlay for mobile-only strings; **runtime CMS overrides** from `get_mobile_content(locale)` layered on top (web `getT` parity — the owner's Website-Content edits apply without a release); dates via `Intl` with the app locale (Baku-relevant formats), numbers/currency `AZN` per locale; plural-sensitive strings authored as full phrases per locale (web convention); pseudo-locale length test at M1 (az strings run long — layouts must wrap, never overflow).

## 15. Performance budgets (CI-checked where possible, manually verified per release)

Cold start to Welcome/Home ≤ 2.5s on a mid-tier Android (4GB RAM class); JS bundle ≤ 3.5MB (hermes bytecode); every scroll list = FlatList/FlashList-pattern virtualization with stable keys + memoized cards; images always sized via expo-image with explicit dimensions + `contentFit cover`; charts render ≤ 16ms frames (precomputed points); test runner: question transition < 100ms (the attempt payload already contains all questions — no per-question fetch); no jank on tab switches (screens stay mounted).

## 16. Observability & error handling

Global error boundary per navigator (branded "something went wrong" + retry/report); BFF/network errors normalized to `{error, retryable}` → standard toast/inline patterns; **sentry-expo optional** — single owner decision (privacy posture, backlog C6): if ON → crashes + handled-error breadcrumbs, PII-scrubbed, EU routing; if OFF → local `expo-updates` release health only. No product analytics SDK in v1 (documented). Structured console logging stripped from production builds.

## 17. Store & payments compliance

**Current reality (2026-07-09):** NO real payment provider exists anywhere in the platform (backlog A1 — the launch-critical web item). The web runs three mutually-exclusive modes: `payments` (real; currently just gates + the mock seam), `demo_payments` (cosmetic demo-pay sheet), `giveaway_period` (free window). Olympiad packages are purchase-only in EVERY mode.
**Mobile v1 posture (owner confirms at M2):** commerce is **mode-aware via the BFF** but store-compliant — recommended default = **read-only real-money commerce on mobile** (subscription state + olympiad ownership visible; in `real` mode purchase buttons are hidden behind neutral "managed from the family's web account" wording; `demo`/`giveaway`/free-access flows MAY run end-to-end since no real money moves — final call is the owner's at M2, since store review treats even demo flows as commerce signals).
**Forward design for real payments (post-A1):** RevenueCat (or StoreKit2/Play Billing direct) mapped onto the SAME provider-agnostic tables (`checkout_sessions`/`payments`/`payment_events`) with server receipt validation feeding the webhook-verified activation path; the `processOlympiadPayment` seam and the subscription RPCs remain the only integration points; the BFF purchase endpoints take an Idempotency-Key header from day one so IAP retry semantics never double-charge. Store listing: az/en/ru metadata, screenshots per theme, age rating questionnaire prepared at M4.

## 18. Environments, EAS pipelines, versioning & OTA

- **Environments**: `development` (dev client, dev Supabase), `preview` (internal distribution, dev/staging Supabase), `production` (stores, prod Supabase — prod DB is built from canonical `001`→`012`,`014`,`015`,`016`,`013` when it comes online). Matching expo-updates channels; env via `app.config.ts` reading EAS env vars — zero secrets in code (only URL + anon key are even present).
- **Versioning**: semver + auto-incremented build numbers (EAS); `runtimeVersion: {policy: "appVersion"}` so OTA never crosses native-module boundaries.
- **OTA policy**: JS-only fixes/copy/theme via signed expo-updates to `production`; anything touching native modules/permissions/SDK = store release; every OTA recorded in STATUS.md; instant rollback = republish previous update.
- **Pipelines**: `eas build --profile preview` per stage-close; `eas build --profile production` + `eas submit` at M4; CI script order: typecheck → lint → jest → audit → (tag) build.
- **Identifiers**: `ai.olympiq.app` (iOS bundle id + Android applicationId), name "OlympIQ", scheme `olympiq`.

## 19. QA strategy & release checklist

- **Device/OS floor**: iOS 15.1+ (Expo SDK floor), Android 8.0+ (API 26). Matrix per release: 1 small iPhone, 1 large iPhone, 1 mid Android (test priority), 1 large Android; all themes (light/dark/arena + spot-check 2 palettes) × 3 locales spot-grid.
- **Automated**: jest-expo unit/component (gates, i18n fallback + override layering, deep-link router allowlist, `isSafeRelativeUrl` port, config parsing, form validators incl. E.164); Maestro E2E smoke: parent login→dashboard, child login→arena, open news article, run+submit a topic test, mark a notification read, palette change, logout.
- **Manual per stage**: the stage's acceptance list + a rolling regression sheet (M-sections appended to `docs/MANUAL_TESTING_GUIDE.md`).
- **Release checklist (M4)**: audit 0 · budgets met (§15) · a11y pass · flags flip-test (payment trio + olympiad_module + leaderboard + notifications + notifications_push + maintenance + force-update) · deep-link matrix test · store metadata ×3 locales · privacy labels from data inventory · rollback plan noted · STATUS.md updated.

## 20. Web-parity debt — what's still deferred on web and how mobile absorbs it

(Backlog reference: `docs/PRODUCT_COMPLETION_BACKLOG.md`, re-verified 2026-07-08: 8 done / 8 partial / 14 not done. Leaderboard, notifications center, and the access-recompute job are now SHIPPED and fully consumed by this plan — they are no longer debt.)

| Still-deferred item (backlog) | Mobile accommodation (built-in seam, no rework later) |
|---|---|
| Real payment provider + webhook (A1 — launch-critical root) | §17: mode-aware/read-only v1; IAP later maps to the same provider-agnostic tables; BFF purchase endpoints take Idempotency-Key from day one |
| Trial→paid conversion + dunning (A3, needs provider) | Access states already render expired/locked (recompute job is live); `subject_expiring`/`subject_charge_failed` notification templates already seeded — push carries them at M4 |
| Admin finance monitoring (A4) | Admin-panel scope; no mobile surface — noted so mobile never blocks on it |
| Billing/Invoices demo (A5) | Subscription screen sections are componentized so real provider data drops into the same cards |
| Coupons (A7, unused tables) | Quote/subscribe BFF passthrough carries an optional `coupon` field (ignored until built) |
| Daily Tasks engine (B1, zero app code) | Reserved: student tab bar supports a 6th "Tasks" tab behind a future `daily_tasks` flag; schema exists — mobile consumes a future RPC |
| Achievements (B3, tables only) | Arena home grid has a reserved achievements row behind a flag; `student_achievements` read is RLS-ready |
| Support/contact intake (B5) | Contact screen mirrors web (display-only); if ticketing lands, it becomes a form → BFF endpoint |
| Question analytics (B7) | Admin-only; no mobile surface |
| Vercel deploy + domain/SMTP (C1/C2) | Universal links (AASA/assetlinks) + email delivery wait on these; `olympiq://` scheme works regardless |
| JS test framework backfill (C4) / error monitoring (C6) | Mobile ships lint+jest from M1; sentry-expo honors the same C6 decision |
| Schools beyond Bakı (D1) | Add-Child school picker is server-driven (city→school cascade) — scales to any seeded region automatically |
| Admin MFA / durable rate limiting (C5) | BFF inherits whatever the web adopts — no mobile change |
| Parent/student idle logout (web gap) | Mobile sessions follow platform norms + optional biometric app-lock (M4); no web dependency |

## 21. Quality gates (every mobile stage)
`tsc --noEmit` · `expo lint` · jest suite · `npm audit` 0 · Maestro smoke · EAS preview boots (both platforms) · trilingual/no-overflow review · flags flip-test · budgets sanity (§15) · web typecheck+build gate whenever the BFF changes · STATUS.md delta.

## 22. Risk register

| Risk | Mitigation |
|---|---|
| Store rejection over child accounts/payments | §13 posture + §17 mode-aware/read-only commerce; review notes prepared at M4 |
| SecureStore size limits (Android) | the large-secure-store adapter is specified up front (§5) |
| Expo SDK / New-Arch library incompatibilities | Expo-pinned versions only (`npx expo install`); deps from the Expo-recommended set |
| i18n drift web↔mobile | build-time sync script is the ONLY way keys enter mobile; CMS overrides come from the same DB the web reads |
| BFF coupling breaks web builds | BFF stages always run the web typecheck+build gate; contracts versioned `/v1` |
| OTA breaking native boundary | runtimeVersion appVersion policy (§18) makes it impossible |
| Config/content RPC leaking settings | hard-coded whitelists + `013` validation checks + review rule: no `select *` |
| Az string overflow on small screens | M1 pseudo-length test + wrap-first layouts (§14) |
| Timer drift in the test runner | server `remaining_seconds` is truth; resync on every autosave + foreground (web parity) |

## 23. Owner decisions needed (asked once, at stage starts)
1. Store accounts (Apple Developer + Play Console) availability (M4); 2. bundle id `ai.olympiq.app` + name "OlympIQ" confirm (M1); 3. commerce posture in `real` mode — read-only vs hidden-CTA wording — and whether demo/giveaway flows run end-to-end on mobile (M2, §17); 4. sentry-expo on/off (M4, §16); 5. Kids-Category posture confirm (M4, §13); 6. push in v1 scope confirm (M4 includes it by default; can be cut to post-launch OTA+store update).
