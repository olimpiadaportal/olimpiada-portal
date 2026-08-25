# App Review Information — the seven answers Apple asked for

**Status:** ready to paste. Written 2026-08-23 after the first submission was
returned asking for information (not for a guideline violation).

Apple's message was a request for **metadata**, not a rejection of the code: they
asked for a screen recording, a device list, a description, credentials, a list of
external services, a statement about regional differences, and any regulated-industry
documentation. Nothing in it says the app breaks a rule.

Two things go in App Store Connect:

* **App Review Information → Notes** — sections 2–7 below, pasted as one block.
* **App Review Information → Sign-In Information** — the parent email and password.
  The CHILD login has no email field, so its credentials go in the Notes (section 4).

Everything below is written to be true of the submitted build. If the build changes,
re-read it before pasting.

---

## 1. Screen recording (you must record this)

Apple wants one continuous recording **from a physical device**, starting at app
launch. Record it from the TestFlight build, not a simulator.

Shoot this order — it covers every flow they listed:

1. **Launch** the app from the home screen (start recording before you tap).
2. **Register** a brand-new parent account (email + password + phone). Show the
   confirmation screen.
3. **Log in as the DEMO PARENT** — the account whose credentials are in App
   Store Connect, not the one you just registered. From here on the recording
   matches exactly what the reviewer can reproduce.
4. **Log in as the DEMO CHILD** — log out, choose the Student tab, and sign in
   with the 8-digit ID + password. Go slowly; this is the flow a reviewer
   cannot guess.

   DO NOT record "add a child, then sign in as that child". New-subscription
   purchasing is currently switched off platform-wide, and in that state the
   Add-Child flow creates the child but does not issue an 8-digit login ID
   (`app/(parent)/add-child.tsx`: "off -> Info -> Done: child created,
   gate.paymentsOff"). The recording would end on a dead end. The demo child
   already has an ID and active access.
6. **Start a daily round**, answer two or three questions, submit, and open the
   **result screen with an explanation expanded**.
7. Open **Leaderboard** and **Profile** as the child.
8. Log back in as the parent and open **Account → Delete account**, showing the
   confirmation dialog. **Cancel it** — do not delete the demo family.
9. Show the **photo-permission prompt** by opening the avatar picker (this is the
   only permission prompt in the app).

**Do not** show anything price-related. There is no purchase flow in the app, and
the recording should make that evident rather than raise the question.

Keep it under about 4 minutes. Upload as a file in your reply, or a private link.

---

## 2. Devices and operating systems tested

Replace this with what you actually used — do not overstate it, Apple checks
nothing but a false claim is a bad look.

> Tested on:
> - iPhone (physical device) — iOS 18
> - Android physical device — Android 14 (development testing)
> - iOS Simulator — iPhone 16 Pro Max, iOS 18
>
> The app is iPhone-only; `supportsTablet` is false and no iPad build is offered.

---

## 3. What the app does and who it is for

> OlympIQ is an olympiad-preparation and school-practice platform for
> schoolchildren in Azerbaijan, used by two kinds of account:
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
> olympiad-preparation question packages; a results screen with worked
> explanations; leaderboards by school, district and grade; and a parent view of
> each child's progress.
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
> A child account cannot be created from the login screen by design — only a
> parent creates children. The 8-digit ID above belongs to a child already set up
> on the demo parent account, with subject access active, so every student feature
> is reachable immediately.
>
> To exercise the main features as the student: open a subject from the home
> screen, start the daily round, answer the questions and submit. The result
> screen shows the score and a worked explanation per question. Leaderboard and
> Profile are in the bottom tab bar.
>
> To exercise the parent side: sign in with the parent credentials, open the
> child from the home screen, and view progress and subject status.

---

## 4a. Why "add a child" shows a notice instead of a login ID

Include this so a reviewer who explores beyond the demo credentials is not
surprised — it is expected behaviour, not a defect.

> Purchasing is not available in the app for any account type, and new
> subscription activation is currently switched off platform-wide while our
> payment provider integration is being finalised. If you create an additional
> child from the parent account, the child is created but no 8-digit login ID is
> issued yet, and the app explains this on the final step.
>
> The demo child account listed above already has an active subscription and a
> login ID, so every student feature is fully reachable with the credentials
> provided.

## 5. External services used

> - **Supabase** (PostgreSQL database, authentication, file storage) — hosted in
>   the EU (eu-west-1, Ireland). Stores accounts, questions, attempts and results.
> - **Vercel** — hosting for the web application and the API the mobile app calls.
> - **Expo / EAS** — build and over-the-air update infrastructure.
> - **Brevo** — transactional email (account verification and password reset for
>   parents only; children have no email address).
>
> **No payment processor is used by this app.** The app contains no purchase,
> subscription or checkout functionality of any kind, for either account type.
> Access is provisioned outside the app and the app only reflects its status.
>
> No advertising SDK, no analytics SDK, and no third-party tracking are included.
> No data is used for tracking as defined by App Tracking Transparency, and the
> app does not present the ATT prompt.
>
> No AI or machine-learning service is used. All questions are authored by our
> content team.

---

## 6. Regional differences

> The app functions identically in every region. There are no region-locked
> features, no region-specific content and no geographic restrictions in the code.
>
> The content is Azerbaijani school and olympiad curriculum, so the audience is
> concentrated in Azerbaijan, but nothing in the app behaves differently based on
> the user's location. The interface is available in Azerbaijani, English and
> Russian, selected by the user, not by region.

---

## 7. Regulated industry / third-party material

> OlympIQ is not in a regulated industry. It is an educational practice app.
>
> All questions, answers and explanations are authored by our own content team
> for this platform. The app contains no licensed third-party textbook content, no
> copyrighted exam papers and no protected material belonging to any examination
> board. Curriculum topic names follow the public national curriculum structure,
> which is not protected material.
>
> The app is not affiliated with, and does not claim endorsement by, any
> examination board or government body.

---

## Notes on the guideline tips Apple attached

These were generic advice, not findings, but two are worth checking before you
resubmit:

* **2.1 — Accessing the app.** The single most likely cause of a repeat
  rejection. Before submitting, install the TestFlight build and sign in as BOTH
  the demo parent and the demo child. If the child sees locked subjects, the
  reviewer will read it as a broken paywall.
* **2.3.3 — Screenshots.** Must show the app in use, not the login or splash
  screen. Use the arena home, a question with its A–E options, a result with an
  explanation open, the leaderboard, and the parent home.
* **3.1.2 — Subscription information.** Does not apply: the app offers no
  auto-renewable subscriptions and no in-app purchases.
* **5.1.1 — Purpose strings.** Both strings were rewritten on 2026-08-23 to give
  a reason and an example, which is the form Apple asks for.
