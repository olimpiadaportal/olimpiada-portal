# App Store Connect — In-App Purchase setup for OlympIQ

**For:** whoever administers the App Store Connect account
**App:** OlympIQ — bundle id `ai.olympiq.app`
**Written:** 2026-09-01

---

## Why this is needed

Apple rejected the app on 2026-08-31 under **Guideline 3.1.1**: the app lets a
signed-in family use content their parent paid for on the website, and that
content is not purchasable inside the app.

There is no exemption available to us. The link-out permission Apple's letter
mentions applies to the **United States storefront only**; the DMA applies to the
**EEA only**; the Reader rule covers magazines, books, audio and video, not exam
preparation. Guideline 3.1.3(b) — which Apple's letter offers — *requires*
matching In-App Purchases as its condition.

So the app must sell these subscriptions itself. The code is written. What
remains is configuration in App Store Connect, and it can only be done by
someone with access to the account.

---

## Step 1 — Paid Applications agreement (BLOCKS EVERYTHING ELSE)

**Business → Agreements, Tax, and Banking.** The **Paid Applications** agreement
must show **Active**. That requires bank details and tax forms to be complete.

Until this is active, App Store Connect will not let you create a single in-app
purchase. Nothing below can start. If it is not already active, start it today —
it is the item with the longest and least predictable lead time.

---

## Step 2 — Create 21 in-app purchases

**Type: Non-Renewing Subscription.** Not auto-renewable. This is deliberate and
it is not a simplification — see *Why non-renewing* at the end if you want the
reasoning.

Create each with **exactly** the Product ID below. These are already stored in
our database and the app looks products up by this string. A typo means that
product silently never appears.

| Product ID | Subject | Duration |
|---|---|---|
| `ai.olympiq.app.sub.math.week` | Riyaziyyat (Mathematics) | 1 week |
| `ai.olympiq.app.sub.math.month` | Riyaziyyat (Mathematics) | 1 month |
| `ai.olympiq.app.sub.math.year` | Riyaziyyat (Mathematics) | 1 year |
| `ai.olympiq.app.sub.logic.week` | Məntiq (Logic) | 1 week |
| `ai.olympiq.app.sub.logic.month` | Məntiq (Logic) | 1 month |
| `ai.olympiq.app.sub.logic.year` | Məntiq (Logic) | 1 year |
| `ai.olympiq.app.sub.english.week` | İngilis dili (English) | 1 week |
| `ai.olympiq.app.sub.english.month` | İngilis dili (English) | 1 month |
| `ai.olympiq.app.sub.english.year` | İngilis dili (English) | 1 year |
| `ai.olympiq.app.sub.informatics.week` | İnformatika (Informatics) | 1 week |
| `ai.olympiq.app.sub.informatics.month` | İnformatika (Informatics) | 1 month |
| `ai.olympiq.app.sub.informatics.year` | İnformatika (Informatics) | 1 year |
| `ai.olympiq.app.sub.science.week` | Elm (Science) | 1 week |
| `ai.olympiq.app.sub.science.month` | Elm (Science) | 1 month |
| `ai.olympiq.app.sub.science.year` | Elm (Science) | 1 year |
| `ai.olympiq.app.sub.physics.week` | Fizika (Physics) | 1 week |
| `ai.olympiq.app.sub.physics.month` | Fizika (Physics) | 1 month |
| `ai.olympiq.app.sub.physics.year` | Fizika (Physics) | 1 year |
| `ai.olympiq.app.sub.azerbaijani.week` | Azərbaycan dili (Azerbaijani) | 1 week |
| `ai.olympiq.app.sub.azerbaijani.month` | Azərbaycan dili (Azerbaijani) | 1 month |
| `ai.olympiq.app.sub.azerbaijani.year` | Azərbaycan dili (Azerbaijani) | 1 year |

**Reference name** (internal only, never shown to users): use something like
`Mathematics — 1 month`.

**Display name and description** (shown to users, and localizable).

⚠️ **Apple's character limits are short and App Store Connect enforces them:**

| Field | Limit |
|---|---|
| Display name | **30** |
| Description | **45** |
| Reference name | 64 |

*(An earlier version of this document suggested a 58-character description. It
would have been rejected — corrected below.)*

> **Reference name:** `Mathematics — 1 month` *(internal only)*
> **Display name:** `Mathematics — 1 month` *(21 chars)*
> **Description:** `One month of Mathematics for one child.` *(38 chars)*

Russian needs abbreviating to fit — `Математика — 1 мес.` rather than
`1 месяц`. Azerbaijani display names run longest of the three, so check each
against the 30-character limit.

**Apple's App Store has no Azerbaijani locale**, so add **English and Russian**
only. This is harmless: the app renders its own subject names in all three
languages and asks Apple only for the formatted price.

Keep the description factual. **Do not mention the website, other prices, or
"cheaper elsewhere"** — that is anti-steering and it is a rejection risk.

### You can skip most of this typing

There is now a script that creates all 21 products through the App Store Connect
API: `mobile-app/scripts/create-iap-products.mjs`, documented in
`mobile-app/scripts/README_IAP_PRODUCTS.md`. It needs an **App Store Connect API**
key — a *different* key from the In-App Purchase one in Step 4, generated on the
same Integrations page.

It runs as a dry run by default and can create a single product first, so it can
be checked before the other twenty. **Prices still have to be set in the web UI**
— deliberately, because a wrong price on a live product is worse than typing.

### Pricing

Web prices are **3 AZN weekly / 9 AZN monthly / 90 AZN yearly**.

The owner's decision is that **iOS pricing preserves our net revenue**, so iOS
will be somewhat more expensive than the web — Apple takes 15–30% commission and
remits 18% VAT. Apple permits different prices on different channels.

Pick the Apple price tier nearest to these targets, in the Azerbaijan storefront:

| Duration | Web price | Suggested iOS target |
|---|---|---|
| 1 week | 3 AZN | ≈ USD 2.49 |
| 1 month | 9 AZN | ≈ USD 6.99 |
| 1 year | 90 AZN | ≈ USD 69.99 |

Please confirm the exact tiers you choose back to us — nothing in the code
depends on the number (the app shows Apple's own localized price string), but we
want it recorded.

---

## Step 3 — Sandbox tester

**Users and Access → Sandbox → Test Accounts.** Create at least one.

This is required to test a purchase without spending money, and it must be an
Apple ID **not** already used with the App Store. The reviewer uses their own,
but we need one to verify before submitting.

---

## Step 4 — Generate the In-App Purchase key and send us these five values

**Users and Access → Integrations → In-App Purchase**, then generate a key.

The `.p8` file **downloads once and cannot be downloaded again** — save it
somewhere safe immediately.

Send back, **through a secure channel and never by email or chat**:

| What | Where to find it |
|---|---|
| **Issuer ID** | shown on the Integrations page |
| **Key ID** | shown next to the key you generated |
| **The `.p8` private key file** | the one-time download |
| **App Apple ID** | App Information → General, a numeric id |
| **Bundle ID** | `ai.olympiq.app` (confirm it matches) |

These become server environment variables. They are never placed in the app or
in the repository.

---

## Step 5 — App Store Server Notifications

**App Information → App Store Server Notifications.** Set **Version 2** and:

- **Production URL:** `https://<our-domain>/api/payments/apple/notifications`
- **Sandbox URL:** `https://<our-domain>/api/payments/apple/notifications/sandbox`

*(We will confirm the exact domain before you set these.)*

These are how Apple tells us about refunds. Without them, a refunded customer
would keep their access.

---

## Step 6 — Two things to correct on the existing listing

**1. The version number is wrong.** The rejection says *"Version reviewed: 1.0
(3)"*, but the app is at 1.14.0. We are fixing this on our side; please just be
aware that the next build will show a different, higher version.

**2. Age Rating → in-app purchases.** Check how the *"Does your app contain
in-app purchases?"* question is currently answered. If it says **Yes** while no
in-app purchases exist, that alone can trigger a 3.1.1 review — Apple looks for
products that are not there. Once Step 2 is done the answer **Yes** becomes
correct.

---

## What NOT to do

- **Do not** create the products as *Auto-Renewable* subscriptions. It will look
  more normal and it will break the product — see below.
- **Do not** mention the website, a web price, or any payment method outside the
  App Store in any product description or in the app listing.
- **Do not** create any Google Play products. The Android app deliberately sells
  nothing.

---

## Why non-renewing, since it will look unusual

Two reasons, both hard:

**Apple allows one active subscription per subscription group per Apple ID.** Our
subscriptions are **per child**. A parent with three children studying
Mathematics needs three simultaneous grants of the same product — which an
auto-renewable subscription cannot represent.

**Our own billing cannot auto-renew either.** The bank declined card-on-file for
this account, so the website charges each period individually. Auto-renewing on
iOS would make the same family's subscription behave differently depending on
where they bought it.

Non-renewing subscriptions match how the product actually works. Our server
calculates the end date and grants access for exactly that period.

---

## Summary of what we need back

1. Paid Applications agreement **Active**
2. The 21 products **created and approved**, using the exact Product IDs above
3. The chosen price tiers, for our records
4. A **sandbox tester** account
5. The **five credential values** from Step 4, sent securely
6. Confirmation that **Server Notifications V2** are pointed at our two URLs
7. The current answer to the **age-rating in-app-purchase question**

Products must be **approved by Apple**, not merely created, before they will
appear in the app. They can be submitted for review together with the build.
