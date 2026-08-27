# App Review Information — what to paste, and the reply to the 2.1.0 rejection

**Status:** ready to paste, for build **1.12.3**. Rewritten 2026-08-27.

This file has been through two rounds with Apple:

* **2026-08-23** — the first submission came back asking for *information*: a screen
  recording, a device list, a description, credentials, external services, regional
  differences, regulated-industry documentation. That was a metadata request, not a
  guideline finding. Sections 2–7 below are the answers.
* **2026-08-26** — the next submission was **rejected under Guideline 2.1.0
  Performance: App Completeness**. That one WAS a finding, it was correct, and §0
  below is both the fix and the reply.

Two things go in App Store Connect:

* **App Review Information → Notes** — sections 2–7, pasted as one block.
* **App Review Information → Sign-In Information** — the parent email and password.
  The CHILD login has no email field, so its credentials go in the Notes (§4).

Everything here is written to be true of build 1.12.3. **If the build changes,
re-read it before pasting** — the previous version of this file went stale in three
places and told Apple things that had stopped being true.

---

## 0. The reply to the 2.1.0 rejection (Resolution Center)

### What Apple saw

A parent screen rendered:

> **Plans & subjects** — Payments are temporarily paused. New subscriptions and
> purchases are unavailable right now.

### Why it was there, and why it was our bug

The sentence described **the website**, not the app. It was produced from a
server-side setting that records whether olympiq.ai is currently taking payments,
and three parent screens read that setting and reported it.

That is a real defect and Apple read it correctly. An app that announces a feature
as unavailable reads as an unfinished app — and worse, an app whose visible
behaviour changes with a server switch is a problem in its own right, independent of
this rejection. The app should never have had an opinion about the platform's
payment state.

### What changed in 1.12.3

Paste this, or something close to it, into the Resolution Center:

> Thank you for the review — the finding was correct and we have fixed the cause
> rather than the wording.
>
> The message you screenshotted was generated from a server-side setting that
> records whether our website is currently accepting payments. Three parent screens
> read that setting and reported it. It described our website rather than the app,
> and it made a complete app read as an unfinished one.
>
> In build 1.12.3 no screen in the app reports a platform payment state, and none
> can: the screens no longer read that setting at all, and an automated test in our
> build fails if any screen starts doing so again.
>
> Specifically:
>
> - The parent Subscription tab now shows an active subscription where the family
>   has one, and otherwise says only that subscriptions are not managed in this app.
> - The in-app privacy policy no longer states a payment status. This is the change
>   we would draw your attention to: that screen is reachable from the login screen
>   without an account, so it carried the same sentence to a signed-out visitor.
> - Creating a child now issues the child's 8-digit login ID immediately, so the
>   Add-Child flow ends with a usable account instead of telling the parent that the
>   ID will appear later.
> - The Profile screen no longer shows a "coming soon" placeholder where sticker
>   themes have not been published.
> - The Face ID, camera and photo-library permission prompts are now localised in
>   all three languages the app supports (Azerbaijani, English, Russian); previously
>   the Face ID prompt was Azerbaijani-only.
>
> No functionality was removed and nothing was hidden. The app contains no purchase,
> price, checkout or payment step of any kind, for parents or for students, and it
> behaves identically for every user in every region.

### What NOT to write

* Do not offer to "turn payments on" so the string disappears. The string was the
  symptom; a store binary whose behaviour depends on a server flag is the disease,
  and turning the flag the other way would leave it in place.
* Do not cite Guideline **3.1.3(b) Multiplatform Services**. Its own proviso
  *requires* matching in-app purchases, so citing it argues against us.
* Do not argue that "only parents can buy, so IAP does not apply". 3.1.3(c) names
  family sales explicitly. It is good child-safety design; it is not an exemption.
* Do not name a price or a purchasing URL anywhere in the reply.

---

## 1. Screen recording (you must record this)

Apple wants one continuous recording **from a physical device**, starting at app
launch. Record from the TestFlight build, not a simulator.

Shoot this order — it covers every flow they listed:

1. **Launch** the app from the home screen (start recording before you tap).
2. **Register** a brand-new parent account (email + password + phone). Show the
   confirmation screen.
3. **Log in as the DEMO PARENT** — the account whose credentials are in App Store
   Connect, not the one you just registered. From here on the recording matches
   exactly what the reviewer can reproduce.
4. **Add a child** from the parent account, all the way to the success screen, and
   let the **8-digit login ID** be visible on camera. This is worth recording now:
   until 1.12.3 the ID was only issued when a subscription was activated, so this
   flow ended on a promise. It no longer does.
5. **Log in as the DEMO CHILD** — log out, choose the Student tab, and sign in with
   the 8-digit ID + password. Go slowly; this is the flow a reviewer cannot guess.
   Use the DEMO child rather than the one you just created, so the recording matches
   the credentials in App Store Connect exactly.
6. **Start a daily round**, answer two or three questions, submit, and open the
   **result screen with an explanation expanded**.
7. Open **Leaderboard** and **Profile** as the child.
8. Log back in as the parent and open **Account → Delete account**, showing the
   confirmation dialog. **Cancel it** — do not delete the demo family.
9. Show a **permission prompt** by opening the avatar picker.

**Do not** show anything price-related. There is none in the app, and the recording
should make that evident rather than raise the question.

Keep it under about 4 minutes. Upload as a file in your reply, or a private link.

---

## 2. Devices and operating systems tested

Replace this with what you actually used — Apple checks nothing, but a false claim
is a bad look.

> Tested on:
> - iPhone (physical device) — iOS 18
> - Android physical device — Android 14 (development testing)
> - iOS Simulator — iPhone 16 Pro Max, iOS 18
>
> The app is iPhone-only; `supportsTablet` is false and no iPad build is offered.

---

## 3. What the app does and who it is for

> OlympIQ is an olympiad-preparation and school-practice platform for schoolchildren
> in Azerbaijan, used by two kinds of account:
>
> **Parents** create and manage the family. A parent registers with an email
> address, adds each child, and can see each child's progress, subject access and
> results.
>
> **Students (children)** do not register and have no email address. A parent
> creates the child account, and the server issues a unique 8-digit ID. The child
> signs in with that ID plus a password the parent sets. This is deliberate: it
> keeps children from creating accounts themselves and keeps their personal data
> minimal — a child never enters an email address or any payment information.
>
> The problem it solves: olympiad preparation in Azerbaijan is fragmented across
> printed books and private tutoring, with no way for a parent to see whether a
> child is actually improving. OlympIQ gives a structured question bank mapped to
> the national curriculum, a daily practice round per subject, and progress and
> ranking a parent can read at a glance.
>
> Core features: a daily rated round per subject; untimed topic practice;
> olympiad-preparation question packages; a results screen with worked explanations;
> leaderboards by school, district and grade; and a parent view of each child's
> progress.
>
> Content and interface are available in Azerbaijani, English and Russian.

---

## 4. How to set up and access the main features

> The app is fully behind sign-in and has TWO account types. Credentials for both:
>
> **PARENT (email login)**
> Email: `<demo parent email>`
> Password: `<demo parent password>`
> These are also in the Sign-In Information fields.
>
> **STUDENT / CHILD (8-digit ID login — no email)**
> On the login screen choose the **Student** tab.
> Student ID: `<8-digit id>`
> Password: `<child password>`
>
> A child account cannot be created from the login screen by design — only a parent
> creates children. The 8-digit ID above belongs to a child already set up on the
> demo parent account, with subject access active, so every student feature is
> reachable immediately.
>
> If you create your own child from the parent account, that child receives an
> 8-digit ID straight away and can sign in with it immediately. A free access
> period is currently running on our platform, so a newly created child also has
> their subjects opened right away and every student feature is reachable. The
> demo child credentials above work the same way and are the account we have
> prepared for review.
>
> To exercise the main features as the student: open a subject from the home screen,
> start the daily round, answer the questions and submit. The result screen shows the
> score and a worked explanation per question. Leaderboard and Profile are in the
> bottom tab bar.
>
> To exercise the parent side: sign in with the parent credentials, open the child
> from the home screen, and view progress and subject status.

---

## 5. External services used

> - **Supabase** (PostgreSQL database, authentication, file storage) — hosted in the
>   EU (eu-west-1, Ireland). Stores accounts, questions, attempts and results.
> - **Vercel** — hosting for the web application and the API the mobile app calls.
> - **Expo / EAS** — build and over-the-air update infrastructure.
> - **Brevo** — transactional email (account verification and password reset for
>   parents only; children have no email address).
>
> **No payment processor is reachable from this app.** The app contains no purchase,
> subscription, price or checkout functionality of any kind, for either account type.
> Access is provisioned outside the app and the app only reflects its status.
>
> No advertising SDK, no analytics SDK, and no third-party tracking are included. No
> data is used for tracking as defined by App Tracking Transparency, and the app does
> not present the ATT prompt.
>
> No AI or machine-learning service is used. All questions are authored by our
> content team.

---

## 6. Regional differences

> The app functions identically in every region. There are no region-locked
> features, no region-specific content and no geographic restrictions in the code.
>
> The content is Azerbaijani school and olympiad curriculum, so the audience is
> concentrated in Azerbaijan, but nothing in the app behaves differently based on the
> user's location. The interface is available in Azerbaijani, English and Russian,
> selected by the user, not by region.

---

## 7. Regulated industry / third-party material

> OlympIQ is not in a regulated industry. It is an educational practice app.
>
> All questions, answers and explanations are authored by our own content team for
> this platform. The app contains no licensed third-party textbook content, no
> copyrighted exam papers and no protected material belonging to any examination
> board. Curriculum topic names follow the public national curriculum structure,
> which is not protected material.
>
> The app is not affiliated with, and does not claim endorsement by, any examination
> board or government body.

---

## A dated caveat: the free access period ends 2026-09-26

A platform-wide free access window opened on 2026-08-27 and runs for 30 days. While
it is open, ANY newly created child gets subjects opened immediately, which is why
§4 says so. When it closes (2026-09-26) the platform returns to ordinary paid
access and a newly created child will NOT have subjects open.

**If you are reading this on or after 2026-09-26, re-check §4 before pasting it**,
and confirm the demo child still has access. Nothing in the app breaks either way —
but §4 would be describing a state that has passed, which is the exact failure this
document has already had once.

---

## Before you submit 1.12.3

* **2.1 — Accessing the app.** Install the build and sign in as BOTH the demo parent
  and the demo child. If the demo child sees locked subjects, the reviewer will read
  it as a broken paywall — check that account's subject access first.
* **A new build is required, not an OTA update.** 1.12.3 changes `app.json`
  (localised permission strings), which is native configuration. An EAS Update
  cannot carry it, and `runtimeVersion` is `appVersion`, so an update published for
  1.12.1 will never reach a 1.12.3 binary and vice versa.
* **2.3.3 — Screenshots.** Must show the app in use, not the login or splash screen.
  Use the arena home, a question with its A–E options, a result with an explanation
  open, the leaderboard, and the parent home.
* **3.1.2 — Subscription information.** Does not apply: the app offers no
  auto-renewable subscriptions and no in-app purchases.
* **5.1.1 — Purpose strings.** Camera, photo library and Face ID all give a reason
  and an example, and as of 1.12.3 all three are localised az/en/ru through
  `expo.locales` (`mobile-app/locales/*.json`) rather than being fixed to one
  language.
