# App Review Information — what to paste, and the reply to the 3.1.1 rejection

**Status:** rewritten 2026-09-01 for the **In-App Purchase** build. Not yet
submitted — the blocking checklist at the end is not satisfied.

**READ THIS FIRST: the app changed category.** Every earlier version of this
file told Apple the app contained no purchase functionality of any kind. That
was true, deliberate, and defensible until 2026-08-31. It is now **false of the
iOS binary**, which sells subject access through In-App Purchase. Sections that
said otherwise have been moved to the *Historical* appendix at the end and must
never be pasted. If you are about to copy a sentence from this file into App
Store Connect, check it is not from that appendix.

Three rounds with Apple so far:

* **2026-08-23** — a request for *information* (recording, devices, credentials,
  external services, regional differences). Sections 2–7 are the answers.
* **2026-08-26** — rejected under **2.1.0 App Completeness**. Fixed in 1.12.3.
* **2026-08-31** — rejected under **3.1.1 In-App Purchase**. That is what §0
  answers, and it is why the app now sells subscriptions itself.

Two things go in App Store Connect:

* **App Review Information → Notes** — sections 2–7, pasted as one block.
* **Sign-In Information** — the parent email and password. The CHILD login has
  no email field, so its credentials go in the Notes (§4).

---

## What NOT to write — read before replying to anything

This list is promoted to the top because every item on it is a way to turn a
solvable review into a rejection, and three of them are *more* tempting now that
IAP exists, not less.

* **Never cite Guideline 3.1.3(b) Multiplatform Services.** Its own proviso
  *requires* matching in-app purchases, so citing it argues against us.
* **Never argue that only parents buy, so IAP does not apply.** 3.1.3(c) names
  family sales explicitly. It is good child-safety design; it is not an
  exemption.
* **Never claim 3.1.3(f) companion-app status.** The app is the primary
  consumption surface. With IAP shipped we need no carve-out at all.
* **Never reason from the Epic rulings or the DMA.** The link-out permission is
  **US-storefront-only** and the DMA is **EEA-only**. Azerbaijan gets neither.
* **Never name or describe any other purchase channel** — no website, no
  processor, no price outside the App Store — including when answering "how did
  existing users get access". This is anti-steering and it is a rejection risk
  on its own.
* **Never say our prices differ anywhere.** Do not compare, do not explain.
* **Do not explain what is still outside IAP as a justified exception.** Having
  built IAP it is tempting to argue the remainder. State facts and stop; an
  argument invites a rebuttal, an answer does not.
* **Do not mention sandbox behaviour.** How our server treats sandbox
  transactions is an implementation detail and volunteering it invites scrutiny
  of something that is working correctly.
* **No build number in anything pasted.** Say "the build now submitted". A
  version named in a letter and a version in App Store Connect are two things
  that drift, and this document has already gone stale once.

---

## 0. The reply to the 3.1.1 rejection (Resolution Center)

### What Apple found

The app let a signed-in family use subject access that had been provisioned
outside the app, and that access was not purchasable inside the app. That is
Guideline 3.1.1, and the finding was correct.

### What changed

Paste this, or something close to it:

> Thank you for the review. The finding was correct and we have implemented
> In-App Purchase rather than argued the point.
>
> The build now submitted sells subject access directly in the app through
> In-App Purchase. A parent opens the Subscription tab, selects a child, and
> buys access to a subject for a week, a month or a year. The price shown is the
> App Store's own localized price for each product; the app contains no price of
> its own and no other way to obtain access.
>
> Two aspects of the configuration are deliberate and we mention them so they do
> not look like mistakes:
>
> **The products are non-renewing subscriptions rather than auto-renewable
> ones.** Access is granted per child, per subject. A parent with three children
> studying the same subject needs three simultaneous grants of the same product,
> which an auto-renewable subscription cannot represent — the App Store permits
> one active subscription per subscription group per Apple ID. Each purchase
> grants exactly one child access to exactly one subject for exactly the period
> bought, and the purchase card states that nothing renews automatically.
>
> **A purchase is attributed to a specific child.** The app opens a purchase
> intent for the selected child before presenting the App Store sheet and passes
> its identifier as the transaction's account token, so the access that results
> is applied to that child and no other.
>
> Children cannot purchase anything. A child account has no purchase surface at
> all; every purchase is made by the parent from the parent's own account.
>
> We are happy to provide anything further that would help the review.

### Why that letter says what it says

* **It claims no exemption and cites no guideline.** With IAP shipped we do not
  need one, and arguing for a carve-out we do not require reads as advocacy.
* **It explains non-renewing before being asked.** A reviewer who notices it
  unprompted has to guess whether it is an error. The per-child reason is true,
  verifiable in the binary, and it is the actual reason.
* **It says "no other way to obtain access" and stops.** True of the app, which
  is what Apple is reviewing. It volunteers no other channel.

---

## 1. Screen recording (you must record this)

One continuous recording from a **physical device**, starting at app launch, on
the build being submitted.

1. **Launch** from the home screen (start recording first).
2. **Register** a new parent account. Show the confirmation screen.
3. **Log in as the DEMO PARENT** — the account in Sign-In Information.
4. **Add a child**, to the success screen, with the **8-digit login ID** visible.
5. **Make a purchase.** Subscription tab → select the child → tap the button
   showing the price → complete the App Store sheet → show the success state and
   the subject becoming available. **This is the part the rejection was about;
   do not cut it short.**
6. **Log in as the DEMO CHILD** — log out, Student tab, 8-digit ID + password.
7. **Start a daily round**, answer two or three, submit, open the **result with
   an explanation expanded**.
8. **Leaderboard** and **Profile** as the child.
9. Back as the parent: **Account → Delete account**, show the dialog, **cancel**.

Keep it under about 5 minutes.

---

## 2. Devices and operating systems tested

Replace with what you actually used.

> Tested on:
> - iPhone (physical device) — iOS 18
> - iOS Simulator — iPhone 16 Pro Max, iOS 18
>
> The app is iPhone-only; `supportsTablet` is false and no iPad build is offered.

---

## 3. What the app does and who it is for

> OlympIQ is an olympiad-preparation and school-practice platform for
> schoolchildren in Azerbaijan, used by two kinds of account.
>
> **Parents** create and manage the family. A parent registers with an email
> address, adds each child, buys subject access for each child, and sees each
> child's progress and results.
>
> **Students (children)** do not register and have no email address. A parent
> creates the child account and the server issues a unique 8-digit ID. The child
> signs in with that ID plus a password the parent sets. This keeps children from
> creating accounts themselves and keeps their data minimal — a child never
> enters an email address and never makes a purchase.
>
> Core features: a daily rated round per subject; untimed topic practice; a
> results screen with worked explanations; leaderboards by school, district and
> grade; and a parent view of each child's progress.
>
> Content and interface are available in Azerbaijani, English and Russian.

---

## 4. How to set up and access the main features

> The app is fully behind sign-in and has TWO account types.
>
> **PARENT (email login)**
> Email: `<demo parent email>`
> Password: `<demo parent password>`
> Also in the Sign-In Information fields.
>
> **STUDENT / CHILD (8-digit ID login — no email)**
> On the login screen choose the **Student** tab.
> Student ID: `<8-digit id>`
> Password: `<child password>`
>
> A child account cannot be created from the login screen by design — only a
> parent creates children.
>
> **To make a purchase (parent account):**
>
> 1. Sign in with the parent credentials above.
> 2. In the bottom tab bar, tap **Subscription**.
> 3. If the family has more than one child, tap the child's name in the row of
>    chips at the top. Everything below applies to the selected child.
> 4. Scroll to the card headed **"Activate with the App Store"**.
> 5. Each row is a subject with its period underneath. **The button is labelled
>    with the App Store price** — there is no "Subscribe" or "Buy" wording, by
>    design, because the app displays no price of its own.
> 6. Tap it and complete the App Store sheet. Access opens immediately and the
>    subject becomes available to that child.
>
> **To exercise the student features:** sign in with the student credentials,
> open a subject from the home screen, start the daily round, answer and submit.
> The result screen shows the score and a worked explanation per question.
> Leaderboard and Profile are in the bottom tab bar.
>
> **To exercise the parent features:** sign in as the parent, open the child from
> the home screen, and view progress and subject status.

---

## 5. External services used

> - **Supabase** (PostgreSQL database, authentication, file storage) — hosted in
>   the EU (eu-west-1, Ireland). Stores accounts, questions, attempts and results.
> - **Vercel** — hosting for the API the app calls.
> - **Expo / EAS** — build and over-the-air update infrastructure.
> - **Brevo** — transactional email (verification and password reset for parents
>   only; children have no email address).
>
> **Purchases in this app are made entirely through the App Store.** The app
> contains no other payment method, no card entry, no checkout of its own and no
> price of its own — every price displayed is the App Store's localized price for
> the product. Our server verifies each transaction with Apple before granting
> access.
>
> No advertising SDK, no analytics SDK, no third-party tracking. No data is used
> for tracking as defined by App Tracking Transparency and the app does not
> present the ATT prompt.
>
> No AI or machine-learning service is used. All questions are authored by our
> content team.

---

## 6. Regional differences

> The app functions identically in every region. There are no region-locked
> features, no region-specific content and no geographic restrictions.
>
> The content is Azerbaijani school and olympiad curriculum, so the audience is
> concentrated in Azerbaijan, but nothing behaves differently based on location.
> The interface is available in Azerbaijani, English and Russian, chosen by the
> user rather than by region.

---

## 7. Regulated industry / third-party material

> OlympIQ is not in a regulated industry. It is an educational practice app.
>
> All questions, answers and explanations are authored by our own content team.
> The app contains no licensed third-party textbook content, no copyrighted exam
> papers and no protected material belonging to any examination board. Curriculum
> topic names follow the public national curriculum structure, which is not
> protected material.
>
> The app is not affiliated with, and does not claim endorsement by, any
> examination board or government body.

---

# BLOCKING CHECKLIST — none of this is optional

**Run this first. It answers most of the list mechanically:**

```
cd mobile-app
node ./scripts/submission-preflight.mjs
```

Read-only — it changes nothing. Exit 0 means no blocking failure; exit 1 means
do not submit. It reports what it could NOT check as `SKIP`, never as a pass,
because a checklist that quietly passes the items it cannot see is worse than no
checklist. The `SKIP` items below are the ones you must confirm by hand.

Each item has been observed to produce, or would produce, a failed review.

### The purchase must actually work for the reviewer

* [ ] **At least one `iap_products` row per demo subject is `active = true`.**
      They are seeded `active = false` and **all 23 are off today**. An inactive
      catalogue renders *no purchase card at all* — the reviewer sees exactly the
      screen that was rejected. This is the single most likely way to fail again.
* [ ] **The `payments` system flag is ENABLED and stays enabled throughout
      review.** The purchase-intent endpoint checks it and fails closed. With it
      off, every price button shows a red "not available right now" and the
      reviewer never reaches the App Store sheet — functionally the same
      rejection, dressed as a bug.
* [ ] **`APPLE_IAP_SANDBOX_GRANTS` is NOT set to `"off"` in production.** App
      Review buys in sandbox. With grants off, the reviewer pays and receives
      nothing.
* [ ] **The products exist in App Store Connect and are submitted for review.**
      Creating them is not enough — in-app purchases must be explicitly *added to
      a submission*; they are never swept in with the build. A first in-app
      purchase must be submitted **with an app version**.
* [ ] **Every product has a price.** A product with no price cannot be bought,
      in sandbox or otherwise.
* [ ] **Rehearse the purchase on the submitted binary** with a sandbox Apple ID,
      end to end, and confirm access actually opens afterwards — **on a THROWAWAY
      child created for the rehearsal. Never on the demo child in §4, and never
      on any child a reviewer is told to use.** A sandbox purchase writes a real
      entitlement (grants are on by default), and the purchase card only offers
      subjects the child does not already hold — so every subject you rehearse
      disappears from that child's card, for twelve months if you rehearsed the
      yearly product. Rehearse the handful of subjects that grade can be sold and
      the card empties itself: no offers, no panel, and a reviewer following
      these notes finds **no purchase card at all** — the exact screen that was
      rejected under 3.1.1, produced by the rehearsal meant to prevent it. If it
      has already happened, revoke those `apple_iap` entitlement rows before
      submitting. Set `APP_REVIEW_DEMO_CHILD_ID` to the demo child's 8-digit ID
      and the preflight above fails while any live one remains.

### Metadata

* **There is no in-app-purchase declaration to set — do not go hunting for one.**
  This list used to carry "Age Rating → *Does your app contain in-app
  purchases?* must now be YES" as a blocking item. **That field does not exist
  in App Store Connect** (established 2026-09-03): Apple derives the in-app
  purchase badge from the approved products themselves, and the IAP checkbox
  that does exist belongs to Google Play. Corrected rather than deleted, because
  every other item here has produced a failed review — an item that cannot be
  satisfied costs an hour of hunting under submission pressure, or gets ticked
  falsely.
* [ ] **3.1.2 — Subscription information.** The app offers no auto-renewable
      subscriptions; the in-app purchases are **non-renewing subscriptions**. The
      purchase card states that nothing renews automatically, and the App Store
      Connect product metadata must say the same in every locale.
* [ ] **2.3.3 — Screenshots** must show the app in use, not login or splash.
* [ ] **5.1.1 — Purpose strings** for camera, photo library and Face ID are
      localized az/en/ru via `expo.locales`.
* [ ] **A new build is required, not an OTA update.** `runtimeVersion` is
      `appVersion`, so an update published for one version never reaches another.

### Two decisions to settle before submitting

* [x] **Olympiad packages — RESOLVED 2026-09-01, no commerce change needed.**
      Production carries 8 packages, 2 active, and **none has a price**. Apple
      requires no in-app purchase for content that costs nothing, so there was
      never a 3.1.1 exposure here — only a sentence that created one. The
      Olympiads tab said packages "are not obtained in this app", which states
      they are obtained *somewhere else*: all of the compliance risk, none of the
      benefit. It now says only that packages opened for a child appear there.
      The preflight fails if any active package ever gains a price while the app
      cannot sell it.
* [ ] **The free-access window (ends 2026-09-26) should be closed before
      submitting.** While it is open a child has full access through a database
      predicate rather than an entitlement, so the reviewer sees "All subjects
      are open for your children right now" *directly above a row of price
      buttons* — which reads as content unlocked outside In-App Purchase. The
      cleanest submission is one made with the window closed and a demo family
      that has at least one child with an unpurchased subject.

      If it must stay open, add this to §4 — factual, no defence, and naming no
      other channel:

      > **One note about the demo account.** A promotional period is currently
      > running on our platform during which subjects are open to existing
      > families. The demo child's access comes from that promotion. To review
      > the purchase itself, please add a new child from the parent account and
      > buy a subject for that child — the flow is unaffected.

---

# Internal — why this file changed category (never paste)

Everything this document used to say about the app having no purchase
functionality was written when it was true and was the deliberate architecture:
purchasing happened on the web only, and the apps reflected entitlement.

Apple rejected that under 3.1.1 on 2026-08-31. No exemption was available —
the link-out permission is US-only, the DMA is EEA-only, the Reader rule does
not cover exam preparation, and 3.1.3(b) requires matching IAP as its own
condition. The owner resolved open decision 3 in `STORE_PAYMENTS_COMPLIANCE.md`
§10 by shipping IAP on iOS.

The result is a deliberate platform split: **iOS sells subject access in-app**
through 21 non-renewing subscription products; **Android remains purchase-silent
and unchanged**, because Google's consumption-only test is app-wide and
Azerbaijan is not in any alternative-billing programme. That split is why the
compliance rules in `CLAUDE.md` still apply in full to the Android build.

A future reader needs this paragraph, or the sections deleted below will look
like an unexplained retreat and someone will restore a sentence from them.

---

# Historical — superseded, DO NOT PASTE

Kept because the reasoning should not be re-derived, not because any of it is
still sendable.

**§0 (2026-08-26, Guideline 2.1.0).** The app showed "Payments are temporarily
paused" on three parent screens, produced by a server-side setting describing the
website. The fix was to stop the app having any opinion about the platform's
payment state, and a test fails the change if a screen begins reading it again.
The reply's central promise — *"There is no purchase, price or checkout anywhere
in the app, for either account type"* — **stopped being true of iOS on
2026-08-31** and must never be pasted again.

**§0b (2026-08-27, the four business-model questions).** App Review paused the
review to ask about the business model. The answer claimed no exemption and cited
no guideline, and the owner chose the **neutral close** over the cooperative one
that offered to implement IAP if required — deliberately, because an offer can be
made later but cannot be withdrawn. Events resolved it: Apple rejected under
3.1.1 and IAP was built. The cooperative close is now not merely stale but
embarrassing, since it offers to do something already shipped.

**Two things from §0b survive and are carried forward above:** the discipline of
verifying every factual claim against production before writing it, and the rule
that we claim no exemption and cite no guideline — which is easier to hold now
that we need none.

**The old §5 external-services paragraph** ended *"Access is provisioned outside
the app and the app only reflects its status."* Written when it was true, it
became a written confession to 3.1.1 the moment Apple looked for one. Its
replacement is above.
