# OlympIQ Mobile — Store Launch Pack (M4)

Prepared 2026-07-16. This is the submission package for the App Store and Google Play:
listing metadata ×3 locales, the data-safety/privacy inventory (single source for the
iOS privacy labels AND the Play Data Safety form), reviewer notes, and the age-rating
answers. Screenshots are produced at submission time per the checklist in §6.

Identifiers (master plan §18): iOS bundle id + Android applicationId `ai.olympiq.app`,
name **OlympIQ**, scheme `olympiq`. Version source: EAS (`appVersionSource: remote`,
production `autoIncrement`); OTA runtime pinned by `runtimeVersion: {policy: "appVersion"}`.

---

## 1. Listing metadata (az default · en · ru)

> **SUPERSEDED 2026-08-04 — do not submit anything from this section.**
> The live listing copy is `docs/STORE_LISTING_COPY.md`. Two things below are now wrong:
> the daily round is described as "the same questions for everyone", which stopped being
> true at Round 42 (the set is drawn per student), and the copy mentions subscriptions
> and payments, which must never appear in store metadata
> (`docs/STORE_PAYMENTS_COMPLIANCE.md`). Kept only as a record of what M4 drafted.
>
> §2 onward — the data-safety inventory, reviewer notes and age-rating answers — is
> still current and still the single source for both stores' privacy forms.

App name (both stores): **OlympIQ** (30 chars max — fits).

### 1.1 Subtitle (iOS, ≤30 chars) / Short description (Play, ≤80 chars)

| Locale | Subtitle (iOS) | Short description (Play) |
|---|---|---|
| az | Olimpiadaya hazırlıq | Gündəlik raundlar, olimpiada hazırlığı və canlı reytinq — şagirdlər üçün. |
| en | Olympiad prep for kids | Daily rounds, olympiad preparation and live rankings for school students. |
| ru | Подготовка к олимпиадам | Ежедневные раунды, подготовка к олимпиадам и живой рейтинг для школьников. |

### 1.2 Full description

**az**

OlympIQ — şagirdlər üçün olimpiadaya hazırlıq platformasıdır. Valideyn hesab yaradır,
övladını əlavə edir və fənləri seçir; şagird 8 rəqəmli ID ilə daxil olub öz arenasında
məşq edir.

Nə var:
- Gündəlik reytinqli raundlar — hər fənn üzrə gündə bir raund, bütün şagirdlər üçün
  eyni suallar
- Mövzu testləri və əvvəlki günün raundlarının təkrarı — sərbəst məşq rejimi
- Olimpiada hazırlığı paketləri — ömürlük giriş
- Canlı liderlik cədvəli — şəhər, rayon, məktəb və sinif üzrə
- Valideyn paneli — irəliləyiş analitikası, abunə və bildiriş idarəetməsi
- Azərbaycan, ingilis və rus dillərində interfeys

Qeydiyyat yalnız valideynlər üçündür; şagird hesablarını valideyn yaradır və bütün
ödənişlər yalnız valideyn hesabından aparılır.

**en**

OlympIQ is an olympiad-preparation platform for school students. A parent creates the
account, adds their child and picks subjects; the student signs in with an 8-digit ID
and practises in their own arena.

What's inside:
- Daily rated rounds — one round per subject per day, the same questions for everyone
- Topic tests and previous-day round replays — free practice mode
- Olympiad preparation packages with lifetime access
- Live leaderboards by city, district, school and grade
- Parent panel — progress analytics, subscription and notification management
- Interface in Azerbaijani, English and Russian

Registration is parent-only; student accounts are created by the parent and all
payments happen only from the parent account.

**ru**

OlympIQ — платформа подготовки к олимпиадам для школьников. Родитель создаёт аккаунт,
добавляет ребёнка и выбирает предметы; ученик входит по 8-значному ID и занимается в
своей арене.

Внутри:
- Ежедневные рейтинговые раунды — один раунд по предмету в день, одинаковые вопросы
  для всех
- Тематические тесты и повтор раундов за вчера — режим свободной практики
- Пакеты олимпиадной подготовки с пожизненным доступом
- Живые таблицы лидеров по городу, району, школе и классу
- Родительская панель — аналитика прогресса, управление подпиской и уведомлениями
- Интерфейс на азербайджанском, английском и русском языках

Регистрация только для родителей; аккаунты учеников создаёт родитель, и все платежи
проходят только с родительского аккаунта.

### 1.3 Keywords (iOS, ≤100 chars, az primary)

`olimpiada,test,riyaziyyat,məntiq,ingilis dili,təhsil,şagird,olympiad,math,quiz`

---

## 2. Data-safety / privacy inventory (single source of truth)

This table feeds BOTH the iOS App Privacy labels and the Play Data Safety form.
Posture: **no ads, no third-party tracking or analytics SDKs (sentry OFF for v1 —
§16 decision), no data sold or shared with third parties.** All traffic is TLS-only
to our own backend (Supabase + the OlympIQ web BFF). Account deletion is available
in-app (parent profile → delete account) and removes the family's data.

| Data | Collected from | Purpose | Linked to identity | Shared | Optional |
|---|---|---|---|---|---|
| Parent email address | Parent | Account creation, login, receipts | Yes | No | Required |
| Parent name, phone (E.164) | Parent | Account/contact | Yes | No | Required |
| Child first/last name | Parent (Add-Child) | Account display, leaderboard context | Yes | No | Required |
| Child grade, city, district, school | Parent (Add-Child) | Content targeting, leaderboard grouping | Yes | No | Required |
| Avatar photo (optional upload) | User | Profile personalization | Yes | No | Optional |
| Test/olympiad attempts, scores, points, streaks | App usage | Core product (progress, rankings) | Yes | No | Required |
| Purchases/subscription state | Parent account | Access control | Yes | No | Required |
| Push token + device model/OS | Device (opt-in permission) | Push notifications | Yes | No | Optional |
| Crash/diagnostics | — | **Not collected** (no crash SDK in v1) | — | — | — |
| Location, contacts, ads identifiers | — | **Not collected** | — | — | — |

iOS label summary: *Data Linked to You:* Contact Info (email, name, phone), User
Content (avatar), Identifiers (user ID), Usage Data (product interaction = attempts/
scores), Purchases. *Data Used to Track You:* **none**.

Play Data Safety summary: data encrypted in transit; deletion path in-app; no data
shared; no ads; independent security review not claimed.

Permissions requested: **photo library** (avatar upload, optional), **notifications**
(opt-in at login, iOS provisional first), **biometrics** (opt-in app-lock; Face ID
usage string set via the expo-local-authentication plugin). Nothing else.

---

## 3. Children's-data & account-model posture (reviewer-facing)

- The app is a **parent-managed education service**: only adults (parents) register,
  with email + password. Children cannot self-register anywhere in the product.
- A child account is created BY the parent and signs in with a server-issued 8-digit
  ID plus a parent-created password. Children have no email, no self-service identity,
  and **cannot purchase anything** — the child session contains no commerce UI at all.
- Decision (master plan §13, owner-confirmed): do **NOT** enroll Kids Category (iOS)
  / Designed-for-Families (Play). The app is not directed primarily at children — the
  account holder and customer is the parent. We still comply materially with
  children's-data expectations: no ads, no tracking, no third-party sharing, parental
  purchase control, minimal child data (name/grade/school for rankings).
- Age rating questionnaire answers (both stores): no violence, no sexual content, no
  profanity, no drugs, no gambling (leaderboards are skill rankings without prizes
  by default; any giveaway window is parent-facing), no unrestricted web access, no
  user-to-user communication (no chat/messaging/forum), digital purchases = YES
  (parent account only). Expected ratings: iOS 4+, Play Everyone / PEGI 3.

---

## 4. Commerce posture

> **Authoritative source: `docs/STORE_PAYMENTS_COMPLIANCE.md`.** The text that used to
> sit here was wrong on two counts and is corrected below. Do not submit against the
> old guidance.

- **Purchasing happens on the WEB only** (browser, ABB, AZN). The mobile app is
  **purchase-silent for BOTH roles** — parent and child share one binary, and Google's
  consumption-only test is app-wide, so the parent tabs must be purchase-free too.
- **Payment posture is a BUILD-TIME constant.** Store builds compile with commerce off
  and the demo/subscribe code dead-stripped. `demo` / `giveaway` flows run in
  **internal builds only**. (Previously this pack said they "may run end-to-end
  because no real money moves" — that is Apple 2.3.1(a) hidden/dormant functionality,
  and a remotely-switchable non-IAP checkout risks **developer-account termination**,
  not merely rejection.)
- **Copy names no destination.** "Managed from the family's web account" — the wording
  this pack previously recommended — names where to transact and, next to a price, is
  a call to action. Azerbaijan has **no** anti-steering relief (Apple 3.1.1(a) in full;
  the Epic carve-out is US-storefront-only, the DMA is EEA-only). Use
  *"Abunəliklər bu tətbiqdə idarə olunmur."*
- **No AZN price anywhere in the app**, no buy/subscribe/renew CTA, no `olympiq.ai`
  URL or QR in a purchasing context, no webview checkout, no fake prices/invoices or
  simulated card sheets, and no external `https` opened from notification content.
- Conversion and dunning happen **outside** the app — email, website, schools. Both
  stores permit that without restriction, and the email may carry price and link.
- **Blocking:** the current binary fails several of these (verified gap analysis,
  compliance doc §7). Resolve before the first submission.
- If IAP is ever forced, it maps onto the provider-agnostic **entitlements** table as a
  new `source`; the BFF purchase endpoints already take an Idempotency-Key header. Do
  **not** pre-build a dormant IAP path.

Reviewer note (App Review / Play review "notes" field):

> OlympIQ is a parent-managed education app. **This app contains no purchase
> functionality of any kind.** Accounts and access are provisioned outside the app;
> nothing can be bought inside it by any user or role. Parents register with
> email/password; student profiles are created by the parent and sign in with an
> 8-digit ID + the parent-set password. Students are purchase-incapable at the server
> level, not merely in the UI. Demo credentials for **both** a parent account and a
> child account — both with an active entitlement, so the paid experience is fully
> reachable — are supplied in the review account fields. Push notifications are
> optional and used for education/account events only.

The "no purchase functionality" sentence is deliberate: it pre-empts the standard
3.1.1 rejection boilerplate ("Your app includes or accesses paid digital content,
services, or functionality by means other than in-app purchase"). Do not soften it,
and do not submit a build for which it is untrue.

Review account: create a dedicated parent **and** a child on the production
environment at submission time, **both carrying an active entitlement** — a reviewer
who cannot reach the paid experience reads it as a hidden feature under 2.3.1(a),
which is a common multi-week rejection loop. Put both credential sets in the store
review fields (never in this repo).

---

## 5. Store assets checklist

- App icon: shipped (`assets/images/icon.png` + Android adaptive set) — verify 1024px
  master before submit.
- Screenshots per store, per locale (az/en/ru), light + dark where it sells:
  1) student arena home, 2) test runner (question + options), 3) daily rounds (Tests
  tab), 4) leaderboard, 5) parent dashboard (children list), 6) parent analytics.
  Sizes: iOS 6.7" + 6.1" (+ 5.5" if required), Play phone + 7"/10" tablet optional.
- Feature graphic (Play, 1024×500) with the brand purple/orange on cream.
- Privacy policy URL: REQUIRED by both stores before submission — publish the policy
  page on the web app (owner action; domain pending per platform status).

---

## 6. Submission blockers (owner checklist)

1. `eas init` on the owner's Expo account (writes `extra.eas.projectId` into
   app.json — required for push tokens AND builds).
2. Apple Developer Program + Play Console accounts; `eas credentials` for signing.
3. Privacy policy URL live (web app page + domain).
4. `EXPO_ACCESS_TOKEN` set server-side (web BFF env) and `notifications_push`
   flipped ON in admin Settings — see RELEASE_RUNBOOK §4.
5. Production Supabase built from canonical SQL (001→012, 014, 015, 016, 013 last)
   and production env vars set in EAS (`production` profile) — never dev keys.
