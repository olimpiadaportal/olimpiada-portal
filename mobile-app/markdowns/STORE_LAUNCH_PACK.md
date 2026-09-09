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

> **TWO CATEGORIES FLIP FROM "NOT COLLECTED" TO COLLECTED (review, 2026-09-08).
> Read this before opening either console.** Both forms will declare **location**
> for the first time — Apple *Coarse Location*, Play *Approximate location* — and
> Play will declare **Device or other IDs** for the first time. Both are visible on
> the public store page: every visitor will see a "Location" line. **Precise
> location stays No on both**, and the app still requests **no location
> permission** — never "resolve" the mismatch by adding one. Reasoning: §2.2.
>
> **AND THIS IS OVERDUE, NOT UPCOMING.** Grade, city, district and school have been
> collected by every shipped build for months while mapping to no declared type on
> either form, so the declarations that are LIVE today are incomplete — this is not
> a change that waits for the next release. Both consoles accept a data-safety /
> App-Privacy update without a new build; do it now. (Only the gender row is
> genuinely "next release": that field has not shipped yet.)

Every row below that is collected carries the type it is declared under on BOTH
forms. A row with a blank mapping column is a declaration gap, not a shorthand —
that is exactly how grade/city/district/school went unmapped from launch until the
2026-09-08 review. **Nothing in this table is *Shared* with anyone**, nothing is
processed ephemerally, and nothing is used for tracking; those three answers are
uniform, so they are stated here once instead of as three columns.

| Data | From | iOS App Privacy type | Play Data Safety type | Linked | Required? |
|---|---|---|---|---|---|
| Parent name | Parent | Contact Info → Name | Personal info → Name | Yes | Required |
| Parent email address | Parent | Contact Info → Email Address | Personal info → Email address | Yes | Required |
| Parent phone (E.164) | Parent | Contact Info → Phone Number | Personal info → Phone number | Yes | **Optional** since 2026-08-31 (Apple 5.1.1(v)) |
| Child first/last name | Parent (Add-Child) | Contact Info → Name | Personal info → Name | Yes | Required |
| Child grade | Parent (Add-Child) | Other Data → Other Data Types | Personal info → Other info | Yes | Required |
| Child school | Parent (Add-Child) | Other Data → Other Data Types | Personal info → Other info | Yes | Required |
| Child city + rayon | Parent (Add-Child) | **Location → Coarse Location** | **Location → Approximate location** | Yes | Required |
| Child gender | Parent (Add-Child, child edit) | Other Data → Other Data Types | Personal info → Other info | Yes | Optional field, but the Play *type* answers Required — §2.3 |
| Account ids + the 8-digit child login ID | Server-issued | Identifiers → User ID | Personal info → User IDs | Yes | Required |
| Avatar photo (upload) | User | User Content → Photos or Videos | Photos and videos → Photos | Yes | Optional |
| Attempts, answers, time per question, points, %, streaks, active days, olympiad questions already seen | App usage | Usage Data → Product Interaction | App activity → **Other actions** (+ App interactions) | Yes | Required |
| News article likes | User | Usage Data → Product Interaction | App activity → **Other actions** | Yes | Required (type-level) |
| Push token + device model / OS / app version | Device (opt-in permission) | Identifiers → **Device ID**; model/OS/version ride in Other Data Types | **Device or other IDs** | Yes | Optional |
| Child sign-in attempt log (8-digit ID, SHA-256 IP hash, outcome, time) | Server | Identifiers → User ID | Personal info → User IDs | Yes | Required |
| StoreKit transaction reference → entitlement | **iOS binary only** | Purchases → Purchase History | — (the Android binary has no purchase path) | Yes | Required on iOS |
| Profile preferences (interface language, notification channels, child palette/theme) | User | Other Data → Other Data Types | — (§2.4) | Yes | Optional |
| Crash/diagnostics | — | **Not collected** (no crash SDK) | **Not collected** | — | — |
| Contacts, ads identifiers, precise location, health data, payment card data, date/year of birth | — | **Not collected** | **Not collected** | — | — |

iOS label summary — *Data Linked to You:* Contact Info (name, email, phone), User
Content (avatar photo), Identifiers (User ID **and Device ID**), **Location (Coarse
Location)**, Usage Data (Product Interaction), Purchases (Purchase History — the iOS
binary ships StoreKit IAP), Other Data (grade, school, gender, profile preferences).
*Data Not Collected:* Financial Info, Sensitive Info, Contacts, Health & Fitness,
Browsing/Search History, Diagnostics, Precise Location. *Data Used to Track You:*
**none**.

Play Data Safety summary — collects data Yes; encrypted in transit Yes; in-app
deletion Yes; partial deletion without account deletion No; no data shared; no ads;
independent security review not claimed. **Ten types**, all *Collected*, none
*Shared*, none ephemeral: Name, Email address, Phone number, User IDs, **Other
info**, **Approximate location**, Photos, App interactions, **Other actions**,
**Device or other IDs**. (The four in bold are the additions; the previously
submitted form declared six.)

### 2.1 What the 2026-09-08 review found

The gender row (below) did not create this gap — it exposed it. Grade, city,
district and school are collected in Add-Child, transmitted from the app itself
(`mobile-app/src/features/parent/ChildInfoForm.tsx` → `bffAddChild`), stored against
a named child, disclosed in the privacy policy in all three locales, and **mapped to
no declared type on either form**. Reading one section of the inventory found four
rows; reading all of it found five more: the push token, the news likes, the child
sign-in attempt log, the profile preferences, and the iOS purchase record. All are
mapped above.

### 2.2 The disputed rows, and why each files where it does

**City + rayon → Location (Approximate / Coarse), and it is the honest answer.**
Both questionnaires define location by AREA, not by sensor: Play's *Approximate
location* is "user or device physical location to an area greater than or equal to 3
square kilometers" and *Precise location* is the same thing under 3 km²; Apple's
*Coarse Location* is "information that describes the location of a user or device
with lower resolution than a latitude and longitude with three or more decimal
places". Neither definition requires the value to come from GPS, wifi or IP — a
parent-selected city describes where the child is at city resolution just as surely
as a rounded coordinate does. Every value we can store is a whole city or an
administrative rayon of one — all comfortably above the 3 km² line — so
Approximate/Coarse is right and **Precise is No on both forms**. (If a rayon smaller
than 3 km² is ever added to `city_districts`, this answer has to be re-derived; that
is the one thing that would move it.)

**Why not Play *Address* / Apple *Physical Address*.** Play's *Address* is "a user's
address, such as a mailing or home address" and Apple's is "home address, physical
address, or mailing address". We hold no street, no building, no postcode; nobody
could address an envelope with what we store. Filing a city under an address type
would overstate what we hold in the other direction.

**School → NOT location; Personal info → Other info / Other Data Types.**
`public.schools` (`supabase/sql/003_academic_taxonomy.sql`) stores a name, a city, a
rayon and sort keys — **no address and no coordinates** — and the value names an
institution a child is *enrolled at*, which stays true when the child is at home, on
holiday, or has moved. It is an affiliation, like an employer, not an area the child
occupies. This is not a technicality: a school plot is well under 3 km², so
classifying the school as location would force **Precise location = Yes**, telling
every store visitor we hold a sub-3-km² position for their child. That would be a
false declaration, and the more damaging one.

**Grade → Other info / Other Data Types.** Neither store has an education data type.
Play's *Other info* is "any other personal information such as date of birth, gender
identity, veteran status" — an age-adjacent profile attribute is exactly that family,
and the grade is the closest thing to an age we hold (we collect no birth date and no
birth year; `students.birth_year_optional` exists in the schema but is
server-blocked and written by nothing). Apple has no nearer type than Other Data.

**Push token → Identifiers → Device ID / Device or other IDs.** Play's own example
list for that type includes "Firebase installation ID", which is the same kind of
per-install identifier an Expo/FCM push token is; Apple's *Device ID* is "the
device's advertising identifier, **or other device-level ID**". The device model, OS
version and app version stored beside it (`upsert_push_token`) are device
characteristics, not identifiers — Play has no type for them, and on Apple they ride
in Other Data Types.

### 2.3 Required vs optional — Play asks this PER TYPE, and Apple does not ask at all

Apple's form asks three things per type (linked to identity, used for tracking,
purposes) and never asks whether a field is required, so nothing in this subsection
affects App Store Connect.

Play asks, per data TYPE: "is this data required, or can users choose whether it's
collected?" A type containing **any** required field is Required — a user cannot turn
that collection off, whatever else the type also carries.

- **Personal info → Other info is Required.** This CORRECTS the answer written for
  the gender row earlier the same day ("users can choose whether this data is
  collected"). That was right when gender was alone in the type; grade and school are
  both mandatory in Add-Child and file in the same type, so the type-level answer is
  now *Data collection is required*. **The gender field itself stays optional** in the
  product, in the UI and in the privacy policy — Play's form simply has no per-field
  switch, and answering "users can choose" for a type that also carries two mandatory
  fields would be the false statement.
- **Phone number → users can choose.** The parent phone became optional on
  2026-08-31 (Apple 5.1.1(v)); it is the only field in its type, so the type follows
  it. The form and the privacy policy both still say required — see §6.1.
- **Approximate location → required** (the city is mandatory in Add-Child, and the
  rayon is mandatory whenever the chosen city has rayons).
- **Photos → optional. Device or other IDs → optional** (push is a permission the
  user grants). **Everything else → required.**

### 2.4 Deliberately NOT declared, and why (so nobody re-litigates it)

- **Passwords.** Neither questionnaire has a credentials type; the password never
  reaches our tables and is held hashed by the authentication service.
- **The hashed IP in the child sign-in log.** A SHA-256 digest kept solely to lock
  out password guessing; the raw IP is never stored, and no listed type on either
  form describes it. The 8-digit ID in the same row IS declared (User IDs).
- **Hosting-provider request logs (IP + user agent).** Infrastructure telemetry
  generated by the platform, not data the app collects and sends; no IP-address type
  exists on either form. Disclosed with its retention in the privacy policy. This is
  a judgment call, and it is written here so it stays a decision rather than an
  omission.
- **Financial info, on both forms.** On iOS, StoreKit handles the card and we store
  only a transaction reference, so *Payment Info* is No while *Purchase History* is
  Yes. On Play, the Android binary has no purchase path at all: it reads entitlement
  state for display and can trigger a **free** activation, which is not "purchases or
  transactions a user has made". The already-submitted "my app doesn't provide any
  financial features" answer stands. *(§4 of this pack now carries that split in
  full: the iOS binary ships StoreKit IAP after the 2026-08-31 Guideline 3.1.1
  rejection, the Android binary stays purchase-silent, and each store has its own
  reviewer note. The data mapping above is correct for both binaries.)*
- **Profile preferences on Play only.** Play's *Other info* is scoped to "personal
  information", and a theme, an interface language or a notification-channel toggle
  is not that; Play has no settings type. Apple's *Other Data Types* is "any other
  data types not mentioned" with no such scoping, so on Apple they are named there.
  The asymmetry is the two forms' wording, not an inconsistency.

### 2.5 Purposes per type

**iOS** (Apple's list has no account-management purpose; customer support lives
inside App Functionality): App Functionality for everything; Analytics additionally
for Usage Data → Product Interaction and for Other Data Types. Product
Personalization stays unticked everywhere — the grade selects which curriculum pool
is *eligible*, a rule applied identically to every child in that grade, which is not
"customizing what the user sees" in the recommendation sense both forms mean.
Third-Party Advertising and Developer's Advertising or Marketing: never.

**Play:** App functionality and Account management for the identity/profile types
(Name, Email address, Phone number, User IDs, Other info, Approximate location,
Photos); Analytics for App interactions, Other actions and Other info; Fraud
prevention and security for User IDs; **Developer communications for Device or other
IDs** — a purpose the submitted form has never used, and it is needed because the
push channels include `announcement` and `news`, which are "news or notices about the
developer or app". Advertising/marketing and Personalisation: never. If a push ever
carries promotional content, Apple's *Developer's Advertising or Marketing* purpose
becomes mandatory on that side too — which is one more reason the purchase-silence
rules on notification content are not negotiable.

**Child gender (migration 169, added 2026-09-08) — where it files on each form.**
Neither questionnaire has a data type called "gender", and picking an invented one
is worse than picking the catch-all the stores actually offer. iOS: **Other Data →
Other Data Types** ("any other data types not mentioned"), Linked to the user
**Yes**, Used to Track You **No**. Play: **Personal info → Other info** ("any other
personal information such as date of birth, gender identity, veteran status,
etc."), *Collected* not *Shared*, not processed ephemerally. The Play optionality
answer for that type is **"Data collection is required"** — not, as first written
here, "users can choose": the same type now also carries the mandatory grade and
school, and Play asks the question per type, not per field (§2.3). The gender field
itself remains optional — a parent may skip the question entirely or answer "prefer
not to say". It is **not** iOS *Sensitive Info*: that
type is racial or ethnic data, sexual orientation, health, beliefs, union
membership, political opinion, genetic and biometric data, and gender is in none of
them. Nothing about a child's access, the questions they are served, their points
or their leaderboard position reads this column, and it never appears on a
leaderboard.

**TWO purposes on each form, not one — and the two forms name the second one
differently.** The privacy policy tells parents two separate things about this
answer: that we build overall statistics from it, AND that authorised staff see it
on the child's profile and in the internal account reports they export (the
admin-panel Accounts export prints a named child's gender on their own row). Only
the first is analytics — one staff member reading one child's record is not — so a
declaration of "Analytics" alone would be narrower than the policy the same parent
reads.

- **iOS: Analytics + App Functionality.** Apple's *Analytics* is "using data to
  evaluate user behavior, including … to measure audience size or characteristics",
  which is the aggregate half exactly. Apple's *App Functionality* is "such as to
  authenticate the user, enable features, prevent fraud, implement security
  measures, ensure server up-time, minimize app crashes, improve scalability and
  performance, or **perform customer support**" — running the account and answering
  a family's support request is that. *Product Personalization* stays unticked and
  must stay unticked: nothing shown to anyone is customised on this column.
- **Play: Analytics + Account management.** Play offers no customer-support
  purpose. Its *Account management* is "used for the setup or management of a
  user's account with the developer", which covers both halves of the non-analytics
  use — the parent putting the answer on the child's account, and staff
  administering that account afterwards. Play's *App functionality* ("used for
  features that are available in the app") stays unticked, because no in-app
  feature reads the column and the admin panel is not in the app.

The asymmetry is the two questionnaires carving one use up differently, not a
contradiction between them; do not "harmonise" it by copying one form's answer onto
the other. Both purposes are already ticked for other data types on the submitted
Play form (`docs/STORE_LISTING_COPY.md` §8), so nothing already answered moves.

**What a parent can actually do afterwards** — the answer is CHANGEABLE at any
time, including to "prefer not to say", which is what taking it back looks like
here. There is deliberately no path back to *never asked*: "prefer not to say" is a
stored answer (`unspecified`), and the empty state exists only for children nobody
has answered for since migration 169. Play's optionality question is not about that
anyway, and since §2.3 it is not about this field either — it is answered per type,
and the type is Required. What the product promises is unchanged: a parent may
decline at the point of collection, which is where the choice is offered. Do not
write "withdrawable" anywhere — the column cannot go back to NULL, and the policy in
all three languages promises only what this paragraph says.

Disclosing it is REQUIRED, not discretionary, and the reason belongs on the record:
Apple's optional-disclosure carve-out needs collection to be "infrequent" and "not
part of your app's primary functionality", with the user re-consenting "each time".
The field sits inside Add-Child, which is primary functionality, so it fails that
test and gets declared.

**This row is a MINOR's personal data, supplied by the PARENT rather than by the
person it describes** — both stores treat minors' data as a distinct category with
stricter handling (Play's Families policy applies to us through the target-audience
answer recorded in `docs/STORE_LISTING_COPY.md` §8; Apple's 5.1.4 child expectations
apply even though the Kids Category is declined, per §3 below). Neither form has a
"this is a child's data" checkbox — the minor status is carried by the age-rating
and target-audience answers, so this note is the place it is written down. What we
hold to for it: optional at every write, no gate ever reads it, not shared with
anyone, not used for tracking, removed with the child on deletion, and named in
section 5 of the privacy policy in all three languages (policy last-updated
08.09.2026) — in place before the first build that collects it reaches a store.
**And no `eas update` goes out on the 1.15.0 runtime until BOTH forms above are
updated.** An OTA is not a submission, so “before the next build” does not cover it,
and `runtimeVersion: appVersion` would land this field on 1.15.0 build 5 — in App
Review now — whose declarations are the un-updated ones. Rule and reasoning: root
`CLAUDE.md` → “Releasing a new mobile version”. The converse holds for the §2.1
rows and is more urgent: grade, city, district, school, the push token and the
likes are in every build already shipped, so their half of both forms is overdue
today and must not wait for a release the way this row does.

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

> **Authoritative sources: `docs/STORE_PAYMENTS_COMPLIANCE.md` (the policy) and
> `docs/APP_REVIEW_NOTES.md` (the text actually pasted into App Store Connect).**
> Everything this section said before 2026-09-03 described a binary with **no
> purchase functionality of any kind**. That is still true of Android. It is
> **false of iOS**, which has sold subject access through Apple In-App Purchase
> since commit `040c623`. Do not submit against the old guidance, and do not paste
> one platform's reviewer note into the other platform's console.

### 4.1 The split, and why there is one

- **iOS — the app sells.** The iOS binary sells per-child, per-subject access
  through **In-App Purchase**: 21 **non-renewing subscription** products (7 subjects
  x week / month / year), bought by the parent from the Subscription tab. This
  answers the **2026-08-31 Guideline 3.1.1 rejection** and resolves open decision 3
  in `STORE_PAYMENTS_COMPLIANCE.md` §10 — *ship IAP on iOS only*. Having shipped it
  we **claim no exemption and cite no guideline**, because we need none. Never
  reach for 3.1.3(b) multiplatform, 3.1.3(f) companion-app, or "only parents buy":
  the first requires matching IAP as its own condition, the second does not describe
  a primary consumption surface, and the third is named in 3.1.3(c) as *not* an
  exemption.
- **ANDROID — the app stays purchase-silent, and this is not a stale sentence.**
  The Play binary has **no purchase path, no price, no buy/subscribe/renew CTA, and
  no `olympiq.ai` URL or QR in a purchasing context**. It shows *what is active*,
  never *what it costs*. Azerbaijan appears in **no** Google alternative-billing or
  external-link programme, so the Play Payments policy and its anti-steering clause
  ("app listings, in-app promotions, webviews, buttons, links, messaging, ads, or
  account creation/sign-up flows") apply **in full**. What the Android build stands
  on instead is Google's published **consumption-only** permission, whose single
  condition is that nothing can be purchased from within the app — and that test is
  **app-wide**, not role-wide. Parent and child share one binary, so the parent tabs
  must stay purchase-free too. There is no Play Billing integration in that binary
  for a purchase to route through, and nothing may steer a user to one elsewhere.
- **Why the Apple rail was not simply shipped on Android too.** Google Play Billing
  is a separate rail with its own products, pricing and review surface; adding it is
  a product decision, not a port. Until that decision is taken and taken properly,
  the compliant Android posture is the one already in place — which means every
  purchase-silence rule in root `CLAUDE.md` and in `STORE_PAYMENTS_COMPLIANCE.md` §5
  still applies to the Android build **in full**.

### 4.2 The split is a BUILD-TIME constant, never a server flag

`IAP_PLATFORM_SUPPORTED = Platform.OS === "ios"` lives alone in
`mobile-app/src/features/iap/platform.ts`, `expo-iap` is imported in exactly one
file (`src/features/iap/store.ts`), and no price string exists anywhere in our
source — Apple owns the amount. `__tests__/iap-store-boundary.test.ts` fails the
diff if any of the three slips.

This is the rule the old text got right and must keep: a purchase flow sitting in a
store binary behind a **remotely-flippable** switch is Apple 2.3.1(a), and the
penalty there is **developer-account termination**, not a rejection. (An earlier
version of this pack said demo purchases "may run end-to-end because no real money
moves". That was the prohibited shape exactly; the demo rail was deleted
platform-wide on 2026-08-18, and no build of any app now simulates a charge or
collects card data.)

The `payments` feature flag still gates the purchase-intent endpoint and still fails
closed. That is compliant — it hides a *compliant* rail rather than revealing a
non-IAP one — but it is a **review hazard**: with the flag off every price button
shows a red "not available right now", the reviewer never reaches the App Store
sheet, and the result is functionally the rejected screen dressed as a bug. It must
be ON throughout review, together with at least one active `iap_products` row. Run
`node ./scripts/submission-preflight.mjs` — it checks both mechanically.

### 4.3 Copy rules, unchanged by the iOS rail

- **No AZN price anywhere in either binary.** On iOS every amount displayed is the
  App Store's own localized price for the product, read from StoreKit; the app
  carries no price of its own. Apple bills Azerbaijan in **USD** — AZN is not an App
  Store Connect pricing currency — so the AZN web prices cannot be expressed
  natively and are never shown in the app.
- **Name no destination.** "Managed from the family's web account" names where to
  transact; on Android that is anti-steering, and to Apple it is worse — see the
  warning under the notes below. Use *"Abunəliklər bu tətbiqdə idarə olunmur."*
- No webview checkout, no card form, no fake prices or invoices, no simulated card
  sheet, and no external `https` opened from notification content.
- Children are purchase-incapable **at the server level**, in both binaries.
- Conversion and dunning happen **outside** the app — email, website, schools. Both
  stores permit that without restriction, and those channels may carry price and
  link freely.

### 4.4 Entitlement

Apple is one **producer** of entitlement rows (`source = 'apple_iap'`), never the
source of truth for access; everything that gates access reads `entitlements`. That
provider-agnostic table (`STORE_PAYMENTS_COMPLIANCE.md` §4.1) is precisely why "add
IAP on iOS" was a two-week job rather than a rewrite, and it is why a future Google
Play rail would be one more `source` value. Never let any provider's subscription
row *be* the entitlement.

### 4.5 Reviewer notes — TWO of them, one per store

`docs/APP_REVIEW_NOTES.md` §2–7 is the full block pasted into App Store Connect and
is authoritative for Apple. The short forms below are what each console's notes
field needs. They are **not interchangeable**.

**App Review (iOS) — App Review Information → Notes:**

> OlympIQ is a parent-managed education app for schoolchildren in Azerbaijan.
> **Subject access is purchased inside the app through In-App Purchase.** A parent
> opens the Subscription tab, selects a child, and buys access to one subject for a
> week, a month or a year. The products are **non-renewing subscriptions**: access
> is granted per child, per subject, and a parent with several children studying the
> same subject needs simultaneous grants of the same product, which an
> auto-renewable subscription cannot represent. The purchase card states that
> nothing renews automatically. Every price shown is the App Store's own localized
> price for the product — the app contains no price of its own and no other way to
> obtain access. Each purchase is attributed to a specific child: the app opens a
> purchase intent for the selected child before presenting the App Store sheet and
> passes that child's identifier as the transaction's account token. Parents
> register with email and password; student profiles are created by the parent and
> sign in with a server-issued 8-digit ID plus the parent-set password. Students
> cannot purchase anything — a student session contains no purchase surface at all,
> and the restriction is enforced on the server, not merely in the UI. Demo
> credentials for **both** a parent account and a child account are supplied in the
> review account fields. Push notifications are optional and are used for education
> and account events only.

**Play Console (Android) — App content notes / App access:**

> OlympIQ is a parent-managed education app for schoolchildren in Azerbaijan.
> **This Android app contains no purchase functionality of any kind.** Nothing can
> be bought inside it by any user or role; the app reads and displays the access a
> family already has. Parents register with email and password; student profiles
> are created by the parent and sign in with a server-issued 8-digit ID plus the
> parent-set password. Students are purchase-incapable at the server level, not
> merely in the UI. Demo credentials for **both** a parent account and a child
> account — both with access already active, so the full experience is reachable —
> are supplied in the App access fields. Push notifications are optional and are
> used for education and account events only.

**Do not submit a note that is untrue of the binary you are submitting.** That
warning is why this section exists, and it now cuts in two directions:

- The "no purchase functionality of any kind" sentence is deliberate — on Play it
  answers the consumption-only question before it is asked, and it is exactly true
  of that binary. Do not soften it, and do not generalise it to iOS, where it has
  been false since 2026-09-03.
- Conversely, **never write "access is provisioned outside the app" to Apple.** That
  sentence was honest architecture documentation for a year, and it became a written
  confession to 3.1.1 the moment a reviewer went looking for one; it sits in the
  *Historical — DO NOT PASTE* appendix of `docs/APP_REVIEW_NOTES.md` for that
  reason. Name or describe no other purchase channel to Apple at all — not a
  website, not a processor, not a price outside the App Store, and not when
  answering "how did existing users get access".

Review account: create a dedicated parent **and** a child on the production
environment at submission time, and make sure the reviewer can actually reach the
paid experience — one who cannot reads it as a hidden feature under 2.3.1(a), a
common multi-week rejection loop. On **iOS** that access must come from a manual or
promotional grant and **never from a rehearsed sandbox purchase**: a sandbox
purchase writes a real `apple_iap` entitlement, and the purchase card only offers
subjects the child does not already hold — rehearse a few and the card empties
itself, reproducing the exact screen 3.1.1 rejected. Rehearse on a throwaway child;
set `APP_REVIEW_DEMO_CHILD_ID` and `scripts/submission-preflight.mjs` fails while
the demo child holds any live `apple_iap` grant. Put both credential sets in the
store review fields (never in this repo).

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

### 6.1 Data-safety declarations to correct — OWNER, DO THIS NOW

Not a release task. The rows in §2.1 are collected by builds that are already live,
so both live declarations are incomplete until this is done. Neither console needs a
new build: App Privacy publishes from App Store Connect on its own, and the Play Data
safety form is submitted separately from a release.

**Blocker before either console — the privacy policy contradicts what you are about
to declare.** Section 5 lists "location" among the things we never collect about a
child (all three locales, `privacy.s5.notCollected`), while section 4 lists the city
and rayon as collected. Once the stores show a Location line, those two read as a
contradiction. The policy sentence needs to name what is actually not collected —
device or GPS location, and a home address — instead of the bare word "location".
Same section 4 still says the parent phone is **required**; it has been optional
since 2026-08-31. Fix both, in az/en/ru, before publishing either form.

**App Store Connect** — *App Privacy → Data Collection → Edit*, in the order the
form walks you through it:

1. Add **Location → Coarse Location**. Purposes: App Functionality. Linked to the
   user: **Yes**. Used for tracking: **No**.
2. Leave **Precise Location** unticked. (It is the answer §2.2 defends; do not add a
   location permission to the app to "match" the label.)
3. Add **Identifiers → Device ID** (the push token). Purposes: App Functionality.
   Linked **Yes**, tracking **No**.
4. Add **Other Data → Other Data Types** (child grade, school, gender, profile
   preferences). Purposes: App Functionality **and** Analytics. Linked **Yes**,
   tracking **No**.
5. Confirm what is already there is still right: Contact Info (Name, Email Address,
   Phone Number), User Content → Photos or Videos, Identifiers → User ID, Usage Data
   → Product Interaction (App Functionality + Analytics), Purchases → Purchase
   History (**keep it** — the iOS binary ships StoreKit IAP).
6. Confirm the No answers: Financial Info, Sensitive Info, Contacts, Health &
   Fitness, Browsing/Search History, Diagnostics.
7. **Publish**, then load the App Store product page and check that "Location"
   appears under *Data Linked to You*.

**Play Console** — *Policy → App content → Data safety → Manage*, in form order:

1. *Data collection and security*: no change (collects data **Yes**, encrypted in
   transit **Yes**, deletion request path **Yes**, partial deletion **No**).
2. *Data types* — tick four new boxes, leaving the existing six ticked:
   **Location → Approximate location**; **Personal info → Other info**; **App
   activity → Other actions**; **Device or other IDs**. Leave **Precise location**
   unticked.
3. *Data usage and handling*, per type — every one is **Collected**, **not Shared**,
   **not** processed ephemerally:
   - **Approximate location** — required; App functionality, Account management.
   - **Other info** — **required** (grade and school are mandatory; this is the
     answer that replaces the "users can choose" written for gender alone);
     App functionality, Account management, Analytics.
   - **Other actions** — required; App functionality, Analytics.
   - **Device or other IDs** — **optional** ("users can choose"); App functionality,
     Account management, **Developer communications**.
   - **Phone number** — **change** from required to "users can choose".
   - The other five types keep the answers already submitted.
4. *Preview* the summary, **Save**, and submit the form. It is reviewed on its own
   timeline; check the store listing afterwards for the Location line.
5. Expect Families-policy attention on the new Location line, since the target
   audience includes children. The answer to give if asked: it is a parent-entered
   administrative area (city and rayon) used to group leaderboards, the app requests
   no location permission, reads no sensor, and stores no coordinate.
