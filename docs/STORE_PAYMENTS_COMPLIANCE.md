# Store & Payments Compliance — App Store, Google Play, and ABB

**Status:** authoritative. Supersedes `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` §17 on every point where they disagree.
**Researched:** 2026-07-26, against the guidelines as served that day.
**Scope:** how OlympIQ takes money without breaching Apple's or Google's payment policies, given that the intended provider is **ABB (Azərbaycan Beynəlxalq Bankı)** and the market is **Azerbaijan**.

> **Re-verify before every store submission.** Apple publishes the App Store Review Guidelines without a revision date and calls them a living document; Google revises the Payments policy on its own cadence. Several rules quoted here changed materially between 2024 and 2026. Treat every citation as "true on 2026-07-26" and re-read §11 before you submit.

---

## 1. The answer in one paragraph

Both stores require their own billing for digital content bought **inside** the app, and **Azerbaijan qualifies for none of the exemptions** that news coverage from 2024–2026 describes — those are scoped to the US, the EEA, Japan, South Korea, India or the Netherlands. ABB therefore **cannot** be used for a purchase made inside the iOS or Android app, and the app cannot link, button, webview, QR-code or nudge a parent toward ABB checkout. The workable architecture is the opposite one: **all purchasing happens on the web, in a browser, paid via ABB; the mobile apps contain no purchase capability of any kind and merely reflect entitlement.** That is explicitly permitted by Google and *tolerated but not guaranteed* by Apple. Our current mobile binary does **not** satisfy this and would be rejected today — see §7.

---

## 2. The load-bearing fact: Azerbaijan gets no relief

This is the single most misread point in this area, and getting it wrong is the most expensive mistake available.

Apple's Guideline 3.1.1(a), as served 2026-07-26:

> The entitlements are limited to use only in the iOS or iPadOS App Store in specific storefronts. **In all other storefronts, except for the United States storefront, where this prohibition does not apply**, apps and their metadata may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase.

Azerbaijan is an "all other storefronts" jurisdiction. Every liberalisation you may have read about is scoped elsewhere:

| Relief mechanism | Scope | Reaches Azerbaijan? |
|---|---|---|
| *Epic v. Apple* contempt ruling (30 Apr 2025) | **US storefront only** — Apple's own 1 May 2025 developer note scopes it | No |
| StoreKit External Purchase Link Entitlement | EU + South Korea | No |
| EU Digital Markets Act | 27 EU member states | No — Azerbaijan is Council of Europe / Eastern Partnership, **not EU, not EEA** |
| Netherlands ACM order | NL, dating apps only | No |
| Apple reader-app External Link Account Entitlement | Global — but magazines/newspapers/books/audio/music/video only | Category-locked out |
| *Epic v. Google* injunction | **US users only** | No |
| Google User Choice Billing | AU, BR, ID, JP, ZA, UK, EEA (+ KR/IN/US programs) | No — Azerbaijan appears nowhere |
| Google "billing choice" program | UK, EEA, US today | Not yet |

Two consequences to state plainly:

1. **Azerbaijan is the most restrictive storefront configuration that exists.** There is no entitlement to apply for and no regulator to invoke.
2. **Do not plan against Google's "rest of world 30 Sep 2027" date.** It was announced in March 2026 as part of an Epic/Google settlement, and the motion to modify the injunction was jointly withdrawn on 14–15 July 2026. Google says it still intends to proceed, but the enforceable basis is gone. It is a hope, not a milestone.

Storefront availability — not the developer's nationality — controls. A worldwide release that includes `.az` is reviewed against the restrictive rule.

---

## 3. What the stores require of us

### 3.1 Apple

Guideline 3.1.1, verbatim:

> If you want to unlock features or functionality within your app, (by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version), you must use in-app purchase. Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc.

Both OlympIQ products — per-subject subscriptions and lifetime olympiad packages — unlock digital content consumed inside the app. Both are squarely inside 3.1.1. Note the explicit ban on "their own mechanisms to unlock content": a server-side entitlement flag flipped by an ABB webhook **is** such a mechanism when the purchase originates in the app.

**"Only parents buy, children never buy" grants zero relief.** 3.1.1 is drafted around what a purchase *does*, not who pays. Guideline 3.1.3(c) closes the door explicitly: *"Consumer, single user, or family sales must use in-app purchase."* Apple names family sales. Our parent-only model is excellent child-safety design — it is not a route around IAP, and arguing it as one will fail.

### 3.2 Google Play

The Payments policy requires Google Play Billing for *"in-app features or services, including any app functionality, digital content or goods."* The enumerated list names **"education … content subscription services"** explicitly. As with Apple, the payer's identity is irrelevant — no exemption exists for a guardian, family or institutional payer.

Anti-steering covers *"app listings, in-app promotions, webviews, buttons, links, messaging, ads, or account creation/sign-up flows."* Leading users to another payment method is itself the violation, even if no money moves through the app.

### 3.3 Where the two stores differ — and it matters

| | Apple | Google Play |
|---|---|---|
| General consumption-only exemption | **No** | **Yes, explicit** |
| Out-of-app communication about other payment methods | Permitted (3.1.3 lead-in) | Permitted, unrestricted |
| Applicable carve-out for us | 3.1.3(f), narrow and unpredictable | Consumption-only, published |
| Realistic outcome | Acceptable, with real rejection risk | Sound |

Google states: *"Google Play allows any app to be consumption-only, even if it is part of a paid service."* The constraint is that *"any product(s) or service(s), whether digital or physical, cannot be purchased from within the app."*

Apple has no equivalent. The closest is **3.1.3(f)**:

> Free apps acting as a stand-alone companion to a paid web based tool (i.e. VoIP, Cloud Storage, Email Services, Web Hosting) do not need to use in-app purchase, provided there is no purchasing inside the app, or calls to action for purchase outside of the app.

Two honest problems: the enumerated examples are all *infrastructure* services where the app is a thin client, whereas **our mobile app is the primary consumption surface** — daily rounds, tests, olympiad attempts and streaks *are* the product and they happen in the app. And there is no application, no entitlement and no pre-approval; it is re-adjudicated at every submission. There is 2026 precedent of login-only companion apps still being rejected with the boilerplate *"Your app includes or accesses paid digital content, services, or functionality by means other than in-app purchase."*

### 3.4 The clause we must never cite

**Guideline 3.1.3(b) Multiplatform Services does not help us.** Verbatim:

> Apps that operate across multiple platforms may allow users to access content, subscriptions, or features they have acquired in your app on other platforms or your web site … **provided those items are also available as in-app purchases within the app.**

The trailing proviso is a condition, not a footnote. 3.1.3(b) is permission to *honour* web entitlements **alongside** IAP. Citing it in an appeal is arguing *for* IAP. It is the most misread clause in the guidelines.

Likewise, do not claim 3.1.3(c) Enterprise or 3.1.3(d) Person-to-Person for the current consumer product, and do not reach for Google's "1:1 live online services" exemption — its wording contains the word *education*, but it requires a live, one-to-one, non-replayable session between two individuals. Our pre-authored, one-to-many, asynchronous, replayable question bank fails all four prongs, and claiming it would read as deliberate circumvention.

---

## 4. The architecture of record

**All purchasing happens on the web. The mobile apps are purchase-silent and reflect entitlement only.**

```
Parent, in a browser at olympiq.ai
    └── ABB hosted payment page (full redirect)   ← real money, AZN, no store involved
            └── signed callback + server-side status re-query
                    └── entitlements table  ← the single source of truth for access
                            ├── web app reads it
                            └── mobile app reads it (parent AND child) — no purchase path
```

Why this holds:

- **Google:** explicitly blessed as consumption-only, provided the app-wide constraint is met. Because parent and child share one binary, **the parent tabs must be purchase-free too** — the test is app-wide, not role-wide.
- **Apple:** the 3.1.3(f) shape. Defensible, not guaranteed. Budget for an appeal cycle on first submission.
- **Growth still works.** Both stores permit *out-of-app* communication about other payment methods without restriction. Apple 3.1.3 lead-in: *"Developers can send communications outside of the app to their user base about purchasing methods other than in-app purchase."* Email, the website, schools and social are the sanctioned conversion channels — and they may carry prices and links freely.
- **Renewal-failure recovery:** the app says only that access is off. The *email* to the parent carries the price, the link and the one-click renewal.

### 4.1 The entitlement model — do this now, it is what makes IAP cheap later

The expensive trap is letting the ABB subscription row *be* the entitlement. Instead:

- `entitlements(student_id, subject_id | package_id, source, external_ref, status, current_period_end, …)` where `source ∈ ('abb_web','apple_iap','google_play','giveaway','manual','school_license')`.
- ABB is **one producer** of entitlement rows, never the source of truth for access.
- Everything that gates access reads only `entitlements`.

With this, "add IAP on iOS only" becomes a new producer — roughly a two-week job — instead of a re-architecture. Without it, a forced-IAP scenario is a rewrite.

Also decide now, on paper:

- **A flat, IAP-expressible SKU catalog** (per-subject × per-interval, plus one non-consumable per olympiad package), even though we sell via ABB.
- **The sibling discount has no native StoreKit or Play Billing primitive.** 2nd child 10% / 3rd+ 15% cascading across a parent's children cannot be expressed natively. If ever forced to IAP we must drop it on mobile, model discounted SKUs, or use offer codes. A server-side rebate paid outside the store would read as circumventing store pricing — high risk. Choose the fallback before it is an emergency.
- **Prices must stay server-fed.** If IAP ever ships, displayed prices must be the StoreKit/Play-localised price. Note **AZN is not an App Store Connect pricing currency** — Azerbaijan sits in Apple's "Rest of World" region priced in USD, so our 3/9/90 AZN points cannot be expressed natively on iOS.

### 4.2 Do not pre-build IAP

Shipping a binary containing a dormant StoreKit/Play Billing path has the same hidden-feature problem as the current demo path, in reverse. Build it when it is needed.

---

## 5. Binding rules for the mobile app

These are non-negotiable for any build submitted to either store.

### DO

1. **Make the payment posture a build-time constant, not a server flag.** Store builds compile with commerce **off** and the demo/subscribe code **dead-stripped**. Verify by grepping the release bundle for `4242 4242` and `poly.buyNow`.
2. Keep `demo`/`giveaway` flows for **internal/EAS-internal builds only** (investor demos) — never in a store submission.
3. Exclude the public pricing screen from store builds, and its route from the deep-link table.
4. Remove the demo Billing + Invoices sections entirely. **Do not disclaim them — delete them.**
5. Render external URLs from notification content as **plain, non-tappable text**. Keep the allowlisted relative-path routing.
6. Make any externally linked page (e.g. password reset) a bare, chrome-free page with no site nav and no purchase CTA — reviewers follow links.
7. Show *what is active*, never *what it costs*.
8. Supply **both** a parent and a child (8-digit ID + password) demo login **with an active entitlement** in App Store Connect Notes for Review and Play Console → App access. An unreachable paid experience reads as a hidden feature under 2.3.1(a).
9. State plainly in Notes for Review: the app contains no purchase functionality; accounts and access are provisioned outside the app; children are purchase-incapable at the server level.
10. Keep the existing in-app account deletion (satisfies Apple 5.1.1(v), a top rejection cause).
11. Do all conversion **outside** the app — email, website, schools, social. Both stores permit this expressly.

### NEVER

- **Never ship a store build whose purchase UI is controlled by a server flag.** This is the *account-termination* risk (Apple 2.3.1(a)/(b)), not merely a rejection risk.
- Never show an AZN price anywhere in the mobile app.
- Never render a "Subscribe / Abunə ol / Yenilə / Upgrade / Əldə et" button — even one that only opens an explainer.
- Never name `olympiq.ai`, show a URL, or render a QR code in a purchasing context (3.1.1 names QR codes explicitly).
- Never open an external `https` URL from notification content, deep links, or any admin-controlled string.
- Never show fake prices, fake invoices, or a simulated card sheet. Apple 2.3.1: *"promoting a false price … is grounds for removal of your app from the App Store … and termination of your developer account."*
- Never tell a child to ask a parent to **buy** anything — use access/activation language.
- Never put a webview checkout, Apple Pay sheet, or card form in the app for digital goods.
- Never flag-gate or geo-gate the purchase UI off *during review* and on afterwards.
- Never let an ABB subscription row *be* the entitlement.
- Never cite 3.1.3(b) as the justification for having no IAP — it requires IAP.
- Never assume the Epic rulings or the DMA help Azerbaijan.

### Copy rules (all three locales, same change)

| Surface | Wrong | Right |
|---|---|---|
| Locked subject (child) | "…valideyninizdən **almasını** xahiş edin" | "Bu fənm hazırda əlçatan deyil — valideyninlə danış." |
| Payments-off notice | "Abunəliklər ailənin **veb hesabından** idarə olunur" | "Abunəliklər bu tətbiqdə idarə olunmur." |
| Parent subscription state | price + next charge | status + period-end date, no amount |

The existing `child.lockedNote` is already the correct shape — copy its pattern everywhere. Facts about state, never instructions about where to pay.

---

## 6. Children, age rating and privacy

**Recommendation: do not opt into Apple's Kids Category or Google's Designed for Families program.** Declare the target audience honestly as mixed (adults + teens) and comply with the *policy* requirements that bind us anyway, without importing the *program* constraints.

- Apple's Kids Category bands are 5-and-under / 6–8 / 9–11. OlympIQ serves grades 1–11 (roughly ages 6–17). The category does not fit.
- Kids Category 1.3 requires all link-outs and purchasing opportunities to sit behind a parental gate, bans third-party analytics, and — critically — is **sticky**: *"once customers expect your app to follow the Kids Category requirements, it will need to continue to meet these guidelines in subsequent updates, even if you decide to deselect the category."* Opting in would permanently foreclose adding IAP without a gate.

**Binds us regardless of opt-in:** Apple 5.1.4(b) applies to any app that collects or transmits personal information or persistent identifiers from a minor. We collect child name, grade, school, city, rayon, the 8-digit ID (a persistent identifier), attempts, scores and leaderboard placement. Required: a trilingual children's privacy policy linked in App Store Connect and in-app, and an accurate Play Data Safety form disclosing children's data.

**A genuine asset to put in the review notes:** children are purchase-incapable **server-side**. Google's own external-payment guidance warns that *"purchase approvals in Play won't apply if a child makes a purchase on the developer's external payment page"* — a risk our model structurally eliminates.

**A real privacy question, unrelated to store policy:** authenticated leaderboard rows carry city + district + school + grade. In a small rayon school that combination plus a first name is re-identifying. The anonymised public top-10 is right; audit who can see the authenticated board.

---

## 7. Gap analysis — what the current mobile app would fail on

Every item below was verified in `mobile-app/src` on **2026-07-26**. The table is kept as the
original audit; the status column records what has happened since.

> **STATUS 2026-08-18 — the app IS purchase-silent now.** The demo payment mode was deleted
> platform-wide (migration 121). In `mobile-app` that removed `DemoPaySheet.tsx` and
> `SubscribeFlow.tsx` from disk, `demoPay` from the commerce posture, the `demo` member from
> `PaymentMode`, every AZN amount, every buy CTA and every purchase API call from parent AND
> child sessions. **Findings 1, 2, 3, 4, 6 and 7 are CLOSED; 5 and 8 remain open** — see 7.1.
> Two DOs from §5 are still outstanding and are build-variant work, not removal work:
> **dead-stripping commerce at build time** (DO 1) and **excluding the Services screen and its
> deep-link routes from store builds** (DO 3). They now protect an app that has no purchase code
> left to strip, which is why they are the last mile rather than the blocker they were.

| # | Finding | Location | Severity |
|---|---|---|---|
| 1 | `PaymentMode = "real" \| "demo" \| "giveaway" \| "off"` resolved at runtime from `get_mobile_config()`. The binary always contains `SubscribeFlow`, `DemoPaySheet`, the olympiad buy flow and the `ManageSubjectsEditor` mutation path; only `mode === "real"` hides them. **A server flag that can switch on a non-IAP purchase flow after review is the textbook Apple 2.3.1(a) fact pattern — downside is developer-account termination, not rejection.** | `lib/mobileConfig.ts:6`, `features/parent/commerce.ts:29-43` | **Critical** |
| 2 | Full public paywall reachable **before login**: per-interval plan cards, live AZN prices, trial line, sibling-discount callout, gradient CTA into the registration funnel, olympiad packages with price + "Əldə et". | `app/(public)/pricing.tsx` (533 lines) | **Critical** |
| 3 | Fake billing data: hardcoded next charge `29/01/2026`, `≈ 18 AZN`, card ending, expiry `11/2028`, and two fabricated paid invoices `INV-2026-001` / `INV-2025-012`. A `billing.demoNote` disclaimer does not cure a displayed false price. | `app/(parent)/(tabs)/subscription.tsx:263-341` | **High** |
| 4 | Simulated credit card `4242 4242 4242 4242` with expiry and CVC on a gradient card — a card-entry surface for digital goods inside the binary. | `features/parent/DemoPaySheet.tsx:95` | **High** |
| 5 | `RichBody` opens **arbitrary admin-supplied `https` URLs** via `Linking.openURL` with no allowlist, and it renders on the **student** notification screen. An admin could push `[Abunə ol](https://olympiq.ai/pricing)` — dynamic in-app steering the reviewer never sees, plus an ungated link-out to a minor. The relative-path branch *is* correctly allowlisted; the `https` branch is not. | `lib/notifMarkdown.tsx:78-81`, used by `features/notifications/components.tsx:419` | **High** |
| 6 | `mob.pay.webOnly` — "Abunəliklər və ödənişlər ailənin **veb hesabından** idarə olunur" — names a destination and renders directly beneath a visible AZN price chip. Price + "buy it on the web" is a call to action without a hyperlink. Probably survivable on Google; this is the sentence an Apple reviewer screenshots. | `i18n/messages.mobile.ts:36/109/182`; rendered at `olympiads.tsx:341-347`, `subscription.tsx:216-219` | **High** |
| 7 | Child-facing copy using the verb *almaq* (to buy): `oly4.buyNote`, `oly5.errNoAccess`, `oly3.childNone`. Naming no price or destination makes these far safer than the above, but a direct exhortation to a minor to get an adult to purchase is the classic prohibited pattern in children's advertising rules. | `i18n/messages.generated.ts` | **Medium** |
| 8 | `Linking.openURL(bffUrl + "/forgot-password")` from login. Account management is tolerated — but if that page renders the site header with a "Qiymətlər / Abunə ol" nav, the reviewer is one tap from a purchase page. | `app/(public)/login.tsx:156` | **Low** |

**Compliance positives already in place, worth protecting:** in-app account deletion; the student olympiads screen has no price and no purchase CTA by design; the deep-link router blocks students from `/pricing`; server-authoritative repricing; children purchase-incapable server-side.

### 7.1 Blockers by platform — the launch checklist

Grouped by where each item actually blocks. Severity is the store's penalty tier, not our
effort. **Struck-through rows were closed on 2026-08-18** by the demo-mode removal; the rest
is the remaining work list.

**WEB (olympiq.ai) — no store policy applies. Zero blockers.**
A website is not governed by either store. Web can ship full ABB commerce whenever the
provider is ready. The only gates are the §8.3 integration rules and the §8.4 legal layer
(resident billing entity, VAT ruling, e-kassa receipts) — commercial/legal, not store.

**ANDROID (Google Play) — both original blockers are now CLOSED in substance.**

| # | Blocker | Why it blocks | Fix |
|---|---|---|---|
| ~~A1~~ | ~~Purchase UI in the binary (`SubscribeFlow`, `DemoPaySheet`, olympiad buy CTA, `ManageSubjectsEditor` writes)~~ | Consumption-only requires that *nothing* can be purchased in the app, and the test is **app-wide** — the parent tabs count | **DONE 2026-08-18** — the two sheets are deleted, the olympiad tab is browse-only and the subjects editor carries no amount. Build-time dead-stripping (§5 DO-1) still recommended |
| ~~A2~~ | ~~Public pricing screen with live AZN prices + CTA~~ | Anti-steering: "leading users" to another payment method is the violation even with no money moving | **DONE 2026-08-18** — the Services screen is information-only, no price, no CTA. Excluding it from store builds (§5 DO-3) still recommended |

Google explicitly permits consumption-only apps, and A1–A2 are done, so Android is
**sound** — not "probably fine". Out-of-app conversion (email, web, schools) stays fully
permitted, so nothing about the business model has to change.

**iOS (App Store) — 2 of the 8 original blockers remain (I5, I8), plus irreducible uncertainty.**

| # | Blocker | Severity | Fix |
|---|---|---|---|
| ~~I1~~ | ~~Runtime `PaymentMode` flag can switch a non-IAP checkout on **after review**~~ | **Account termination** (2.3.1(a)/(b)) — the only item on this list at that tier | **DONE 2026-08-18** — there is no checkout in the binary for any flag value to switch on; `PaymentMode` is `real \| giveaway \| off` and an unknown value degrades to `off`. Dead-strip + bundle grep still recommended |
| ~~I2~~ | ~~Public paywall before login (prices, trial line, sibling discount, CTA)~~ | Rejection (3.1.1(a)) | **DONE 2026-08-18** — the screen carries no price and no CTA. Excluding it from store builds still recommended |
| ~~I3~~ | ~~Fake billing block: hardcoded next charge, `≈ 18 AZN`, card ending, expiry, two fabricated paid invoices~~ | Rejection, and 2.3.1 names false pricing as grounds for **removal + developer-account termination** | **DONE 2026-08-18** — deleted on mobile AND on the web page it was copied from |
| ~~I4~~ | ~~Simulated card `4242 4242 4242 4242` with expiry/CVC~~ | Rejection — a card-entry surface for digital goods | **DONE 2026-08-18** — `DemoPaySheet.tsx` deleted; no card field exists in any app |
| I5 | `RichBody` opens arbitrary admin-supplied `https` URLs, **on the student screen**, with no allowlist | Rejection (3.1.1(a) dynamic steering) **and** a child-safety problem (ungated link-out to a minor) | Render external URLs as plain non-tappable text; keep the allowlisted relative-path routing |
| ~~I6~~ | ~~`mob.pay.webOnly` names "your family's **web account**" directly beneath an AZN price chip~~ | Rejection — price + "buy it there" is a call to action without a hyperlink | **DONE 2026-08-18** — the key is gone and no price chip remains for it to sit under |
| ~~I7~~ | ~~Child copy using *almaq* (to buy) — `oly4.buyNote`, `oly5.errNoAccess`, `oly3.childNone`~~ | Medium — the classic prohibited pattern in children's advertising rules | **DONE 2026-08-18** — all three are overridden in `messages.mobile.ts` with access language ("talk to your parent"), az/en/ru |
| I8 | `/forgot-password` link-out from login | Low — but a reviewer follows it; if that page shows the site nav with "Qiymətlər", they are one tap from a purchase page | Make the linked page bare and chrome-free |

Even with I1–I8 fixed, iOS is **acceptable, not safe**: Apple has no general
consumption-only exemption, 3.1.3(f) is narrow and re-adjudicated every submission, and
our app is the primary consumption surface rather than a thin client. Budget an appeal
cycle and keep the entitlement model provider-agnostic (§4.1).

**ADMIN PANEL — not applicable.** Internal, web-only, never store-distributed.

### 7.2 Does a feature flag controlling LIVE payments create an Apple problem?

Short answer: **the flag is fine; where the flag lives is the whole question.**

Apple does not object to server-controlled configuration as such — remote config is
routine and countless approved apps use it. Guideline 2.3.1(a) is about *hidden, dormant
or undocumented functionality shipped in the binary*. The distinction that matters:

- **Safe.** The binary contains **no purchase code at all**, and a server flag governs
  something else — whether content is free, whether a subject is locked, what a blocked
  screen says. Nothing a reviewer could not see is present in the bundle. This is the
  Round-48 kill switch we just built, and it is compliant.
- **Dangerous.** The binary **contains a working non-IAP checkout** that a server flag
  reveals or hides. Whether it is demo or live money is irrelevant: the capability is in
  the bundle, discoverable by unzipping the IPA, and the reviewer saw a state that the
  server can change afterwards. That is the account-termination pattern, and it is
  exactly item I1.

So for the plan you described — launch with payments off, switch them on later — the flag
itself is safe **provided the iOS binary never contains a purchase path in either state**.
Turning payments on must change what the *web* does and what the app *says*, never
unlock an in-app checkout.

Two consequences worth stating plainly:

1. **Turning live payments on is when the iOS risk actually arrives**, and it arrives
   even though the app gained no new code. During the free window it may be literally
   true that nothing is paid, which is the strongest possible review position. From the
   day parents pay on the web for content the app delivers, the app is "accessing paid
   digital content by means other than in-app purchase" — the exact rejection boilerplate.
   Plan the iOS decision for that date, not for launch day.
2. **A flag that flips a real-money path on for some users is a different question again.**
   Region-gating or cohort-gating commerce is fine on the web. Inside the iOS app it is
   not, because there is no compliant in-app path to gate.

**Recommendation:** keep the kill switch exactly as built (server-side, admin-controlled,
DB-enforced), and treat "does the store binary contain purchase code?" as a separate,
build-level invariant that no flag can affect.

### The build-variant resolution

Root `CLAUDE.md` currently sanctions demo data in billing/invoice sections. That carve-out was written for investor demos and does not survive App Review. The resolution is **not** to delete the demo experience but to make it a **build variant**: demo/giveaway commerce lives in internal builds only, and store builds compile it out. This needs an owner decision (§10) because it changes how investor demos are produced.

---

## 8. ABB and the web payment rail

Store policy governs the app. This section governs the browser checkout, where ABB is entirely appropriate.

### 8.1 What ABB actually offers

- **ePOS (Elektron ticarət)** — a Virtual POS accepting Visa, Mastercard, Amex and all AzeriCard-issued domestic cards, with 3-D Secure. The public page documents **no API, no hosted-page spec, no fees, no settlement terms, and no recurring capability**; onboarding is via sales contact.
- **ABBLINK** — a payment-link generator (needs VÖEN, an AZN current account at ABB, an online sales presence; free to join). No API, no saved cards, no recurring billing. **Not viable as the subscription engine** — every renewal would need a human-generated link. Acceptable for one-off olympiad packages only.
- **ABB owns 100% of AzeriCard**, the processor running its card platform (OpenWay Way4). An "ABB integration" is in practice an integration against the **AzeriCard e-commerce gateway** — scope the work against `developer.azericard.com`, not against "ABB's API", or the conversation will stall.
- The AzeriCard interface is a BORICA-style form-POST redirect. The callback returns `AMOUNT, CURRENCY, ORDER, ACTION, RC, APPROVAL, RRN, INT_REF, CARD, TOKEN, TERMINAL, TRTYPE, TIMESTAMP, NONCE, P_SIGN`. `P_SIGN` is an HMAC (SHA-1 in shipped community plugins — **request SHA-256**). The presence of `TOKEN` indicates card-binding exists at gateway level, which is the hook a recurring product would use.

> **The single largest technical risk in the payment plan:** ABB does not publicly document recurring/card-on-file billing. **Do not commit the subscription architecture to ABB before obtaining, in writing, the ePOS merchant integration spec and confirmation of recurring/COF support.**

### 8.2 If ABB cannot do recurring

Both fallbacks are verifiably recurring-capable:

- **Kapital Bank** — API exposes `CardRegistrationRequest`, `CreateOrderWithCardUIDRequest`, pre-auth, refunds, order status, and stored-card tokens with an explicit `cofProviderRid` (card-on-file). Docs at `pg.kapitalbank.az/docs`. Described as Azerbaijan's largest acquirer.
- **Payriff** (CBAR licence ref. 966) — `cardSave`/`cardStorage` on the initial order returns a `cardUuid` for later `autoPay` calls. **No callback signature scheme is documented** — treat the callback as an untrusted hint and confirm via server-side status query.
- **Epoint** — sells an explicit recurring product; card details are stored in the *partner bank's* vault, not on Epoint's platform, which keeps our PCI scope minimal.

> **Resilience note:** the market has two processing centres — **AzeriCard** (owned by ABB; Payriff sits on this rail) and **MilliKart** (Kapital Bank, Epoint AZ). Choosing ABB does **not** give an independent second rail. A fallback provider should come from the *other* centre.

> **Entity trap:** Epoint operates both an Azerbaijani business (`epoint.az`, partner Kapital Bank) and a Georgian one (`epoint.ai`, partner Bank of Georgia, NBG licence N0105-7704) with near-identical websites. Contract the Azerbaijani entity and verify the licence against CBAR's register.

### 8.3 Non-negotiable integration rules

1. **Full HTTP redirect to the acquirer's hosted page — not an embedded iframe.** PCI DSS v4.0.1 SAQ A (r1, effective 31 Mar 2025) added a script-security criterion that PCI SSC FAQ #1588 confirms applies **only** to merchants embedding a payment form. A redirect keeps us on the simplest SAQ A and avoids Requirements 6.4.3 and 11.6.1 entirely.
2. **Never receive, log or store the PAN or CVV.** Not in the payments table, not in logs, not in error reports, not in analytics. Never log raw request bodies on the callback route. Keep the token column opaque.
3. **The callback is never the source of truth.** Recompute and verify `P_SIGN` for AzeriCard/ABB; for Payriff and Kapital, treat the POST as a wake-up signal only and confirm with a server-to-server status query before granting entitlement. This is the payment-path analogue of our standing rule *"do not trust client-submitted payment or subscription data"* — **the callback is client-submitted data.** Without this, anyone who can POST to the callback URL can mint free lifetime access.
4. **Idempotency.** Every charge carries a merchant-generated unique order id used as an idempotency key, so retries and duplicate callbacks cannot double-charge or double-grant.
5. **Flag the first charge as the initial transaction of a recurring series.** Azerbaijan has its **own** strong-authentication regime — the CBAR "Procedure for the Implementation of Enhanced Customer Authentication", approved 5 April 2024 under Article 35 of Law No. 987-VIQ. Do **not** reason from PSD2 and do **not** assume "no SCA outside the EU". The first charge must be an authenticated customer-initiated transaction, correctly flagged; if it is not, later merchant-initiated renewals are soft-declined and **the subscription silently dies at first renewal**.
6. **Dunning, not cutoff.** Failed renewals need a retry schedule, grace period, then downgrade.
7. **Reconciliation.** A daily job comparing acquirer settlement data against local payment rows, flagging divergence.
8. **Chargeback evidence from day one.** The Payment Services Law caps provider liability at AZN 100 for lost/stolen-instrument fraud, so we absorb the rest. Retain timestamp, IP, RRN, `INT_REF`/order id, 3DS result, the exact plan and child purchased, and the parent's acceptance of terms.

### 8.4 Azerbaijani legal layer

- **Bill through an Azerbaijani-resident entity.** If a non-resident entity bills Azerbaijani consumers, the local bank becomes a VAT withholding agent on payments from unregistered persons and **that VAT is non-creditable**; from 23 August 2026 non-resident digital-service providers must register locally and charge 18% VAT regardless. This is an independent, strong argument for a local acquirer over Stripe/Paddle/any offshore merchant-of-record.
- **VAT: 18%, with an AZN 200,000 twelve-month registration threshold. "Provision of paid educational services" is on the exemption list.** Whether our subscription qualifies as exempt educational services or as a standard-rated electronically supplied service is a **~18% swing on every price** and needs a tax-advisor ruling. Because we already reprice server-side, build the price model with an explicit tax field and an `is_vat_exempt` flag **now**, so the ruling applies without a schema migration. Do not hardcode tax-inclusive prices.
- **Fiscal receipts are mandatory.** B2C sales require a receipt through an **e-kassa** connected to the State Tax Service, with QR code and fiscal identifier — *in addition to* the terminal slip. This includes automatic renewals, which is easy to miss because no human is present. An in-app confirmation email is not sufficient fiscal documentation; financial sanctions apply.
- **No EU-style 14-day cooling-off right exists in Azerbaijan.** The 1995 Law on Protection of Consumer Rights is information- and defect-oriented. Our refund policy is therefore largely **contractual and must be written explicitly** — do not copy an EU template, and do not rely on a statutory withdrawal window. Price, billing interval, renewal behaviour, sibling-discount calculation and cancellation method must all be disclosed clearly, **in Azerbaijani**, before the parent authorises the first charge.
- **We do not need a CBAR licence** — a merchant selling its own services into its own account is not providing a payment service. That breaks the moment we hold parent balances/wallet credit or pay out to third parties (tutors, schools, content authors). **Keep the model strictly "parent pays OlympIQ for OlympIQ's own service" and never add a stored-value wallet.**

---

## 9. Cross-references

- `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` §17 — superseded by this document.
- `mobile-app/markdowns/STORE_LAUNCH_PACK.md`, `RELEASE_RUNBOOK.md` — submission mechanics.
- `docs/PRODUCT_COMPLETION_BACKLOG.md` §A — the real-payments backlog item.
- Root `CLAUDE.md` — the short-form non-negotiable rules derived from this document.

---

## 9b. The payments kill switch (SHIPPED — Round 48, migration 089)

The owner's first launch runs with **payments disabled**. That is now enforced in the
database, not only in application code.

- **Mode** derives from two mutually-exclusive feature flags (`payments`,
  `giveaway_period`), with a DB trigger guaranteeing they can never be on together.
  Neither enabled ⇒ mode `off` ⇒ the kill switch is active. *(Migration 121, 2026-08-18:
  a third flag `demo_payments` — the cosmetic no-charge checkout — was DELETED along with
  the mode it drove; the trigger now REJECTS its re-insert. No build of any app simulates a
  charge or collects card data any more, which also removes the 2.3.1(a) surface a demo
  checkout inside a store binary would have been.)*
- **`public.current_payment_mode()`** is the SQL-side single source of truth, with the
  same semantics as `get_mobile_config().payment.mode`, so web, mobile and the database
  can never disagree. It exposes only the derived string — never the admin-locked flag rows.
- **`public.assert_payments_enabled()`** raises `check_violation "payments: disabled"`
  and is called at the top of every paid mutation: `create_child_subscription`,
  `purchase_olympiad`, `add_subscription_subject`, and `apply_subject_change`.
- **Deliberately still permitted while off:** removing a subject or downgrading (a parent
  must always be able to stop paying — blocking it would trap them), `admin_grant_child_access`
  (comping free access is precisely what you do during a free window), and read-only quotes.

**Why this was worth doing even though nothing was exploitable.** Every paid RPC is
already revoked from `anon` and `authenticated` — verified, `EXECUTE = false` for both —
so no browser or phone can call them directly through PostgREST; calls arrive through a
web-app server action that runs `requireParent()` and then checks the mode. The gap was
that the mode check lived **only in TypeScript**, so the guarantee depended on every
current *and future* server action and mobile BFF route remembering to call it. One
forgotten check in a new endpoint would silently re-open commerce during a period when
the product is advertised as free. The guard now sits in the layer that cannot be forgotten.

Validation: `013` check **#84**; functional proof 5/5 (subscription refused, olympiad
purchase refused, subject-add refused, subject-removal still reaches its own logic, mode
restores correctly when a flag is re-enabled).

---

## 10. Open decisions for the owner

1. **Build variants.** Confirm that demo/giveaway commerce becomes internal-build-only and is compiled out of store builds. This changes how investor demos are produced.
2. **Launch sequencing.** Web-first (ABB, full commerce, no store risk) and mobile later as purchase-silent? Or both together, accepting Apple appeal risk?
3. **Apple contingency.** If Apple rejects the purchase-silent build twice, do we ship IAP on iOS only (accepting 15–30%, losing the sibling discount on that rail) or withhold the iOS app?
4. **Billing entity** — confirm an Azerbaijani-resident legal entity for §8.4.
5. **Tax ruling** — obtain an advisor's answer on the educational-services VAT exemption before prices are finalised.
6. **Provider** — proceed with ABB pending written confirmation of recurring/COF support, with Kapital Bank as the designated fallback?
7. **Declared age range** for the App Store Connect questionnaire (§6). The Kids Category commitment is effectively irreversible.

---

## 11. Re-verification checklist before any submission

- [ ] Re-read Apple 3.1.1, 3.1.1(a), 3.1.3 (all sub-clauses), 1.3, 2.3.1, 5.1.1(v), 5.1.4 as served that day.
- [ ] Re-read the Google Play Payments policy and its FAQ, and confirm the consumption-only language verbatim in a real browser (our capture was of a JS-rendered page and contained an internal tension between a permissive example and the anti-steering clause — **ship the first release with zero purchase references regardless**).
- [ ] Confirm Azerbaijan still appears in no alternative-billing or external-link program.
- [ ] Grep the release bundle for `4242`, `poly.buyNow`, any AZN string, and any `olympiq.ai` URL.
- [ ] Confirm both demo logins (parent + child with active entitlement) work on the submitted build.
- [ ] Confirm store metadata, screenshots and keywords contain no price and no purchase URL.
- [ ] Confirm the children's privacy policy link resolves in all three languages.

**Known unknowns, stated honestly:**

- Apple 3.1.3(f) has no published criteria and no advance determination mechanism. Rejection risk is real and recurring; the only genuine mitigation is the provider-agnostic entitlement model in §4.1.
- Whether Google's consumption-only test is app-wide (so parent tabs must be purchase-free in a dual-role binary) is a literal reading of the policy text, not a published Google ruling. Worth asking Play policy support in writing before launch.
- Whether AZN is a buyer-facing currency on Google Play is unverified. Apple is settled: it is not, and `.az` prices in USD.
- The sibling discount under either store's billing is unresolved and needs a product spike, not a policy answer.
