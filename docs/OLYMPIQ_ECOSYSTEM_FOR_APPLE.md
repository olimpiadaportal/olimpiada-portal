# OlympIQ — Complete Product & Compliance Briefing for Apple Developer Enrolment and App Store Connect

**Document status:** written 2026-07-29. Self-contained: everything an assistant needs is on this page.
**Audience:** an AI assistant with no access to the OlympIQ source code, helping the owner (a) enrol in the Apple Developer Program and (b) fill in App Store Connect for the first iOS submission.
**Reality check before you advise anything:** the app has **never been submitted to any app store**. There is no Apple Developer account yet, no signing certificate, no provisioning profile. The product website domain `olympiq.ai` is **not live yet** — the web app currently runs on a Vercel-provided URL. Several submission blockers are still open and are listed in §12. Do not tell the owner they are ready to submit.

**How to use this document:** §1–§5 are product and identity facts. §6–§11 are the answers Apple will ask for. §12 is the list of things that must be fixed *before* any of §6–§11 is worth doing. §13 decodes the Azerbaijani words that will appear in screenshots.

---

## 1. What OlympIQ is, in three sentences

OlympIQ is an Azerbaijani K-12 education app that helps school students in grades 1–11 practise for school exams and academic olympiads through multiple-choice question rounds in mathematics, sciences, informatics, English and logic.

Parents create and manage the family account; each child gets their own login and practises daily, earning points, streaks and a place on skill-based leaderboards.

It is delivered as a website (where parents also pay, in Azerbaijani manat, through an Azerbaijani bank) and as a companion mobile app that contains no payment functionality at all and simply reflects access the family already has.

---

## 2. The account model — read this first, it is the single most confusing thing about the product

OlympIQ has **two kinds of user in one mobile binary**, and only one of them can create an account.

| | Parent (*Valideyn*) | Child / Student (*Şagird*) |
|---|---|---|
| Can self-register? | **Yes** — email + password + mandatory phone number | **Never.** There is no path, in any app, for a child to create an account |
| Login credential | Email + password | **8-digit numeric ID** (server-issued) + a password the parent chose |
| Has an email address in the system? | Yes, real | **No.** Internally the auth record uses a synthetic non-deliverable address the child never sees or uses |
| Can buy anything? | Yes — but **only on the website, in a browser**. Never in the mobile app | **Never**, and this is enforced on the server, not just hidden in the UI |
| Can delete the account in-app? | **Yes** (see §10) | No — by design; a child holds no account of their own to delete |

**How a child account comes to exist:** the parent signs in, opens "Add child", and enters the child's first name, last name, city, district (*rayon*), school, grade and a password. The server then issues a unique 8-digit numeric ID for that child. The parent gives the child that 8-digit ID and password, and the child signs in with them.

**Why this matters enormously for App Review:** a reviewer who installs the app and self-registers as a parent sees an almost empty dashboard. Every learning feature — the daily rounds, the question runner, results and review, olympiad practice, the student leaderboard, the student profile — lives behind a **child session**, which the reviewer cannot create for themselves in any way. **If you do not give the reviewer a working 8-digit child ID and password, they will see perhaps 20% of the app and are very likely to reject it as incomplete or as hiding functionality.** §11 is the template that prevents this.

Additional wrinkle the owner must plan for: the 8-digit ID is **not issued the moment a child record is created**. It is issued when the child is granted access (a completed subscription, a promotional free-access grant, or an internal comp grant). So even a reviewer who successfully creates a child in the app may end up with a child that has no usable login. The demo child must be pre-created and pre-activated by the owner. See §11.

---

## 3. The two apps

### 3.1 The web app (browser, `olympiq.ai` when the domain goes live)
- Public marketing pages, news, an anonymised public top-10 leaderboard, an olympiad-package catalogue, a pricing/services page.
- Parent registration, dashboard, add-child, subscription management.
- **All commerce.** Parents pay here, in a browser, in Azerbaijani manat (AZN), by full redirect to an Azerbaijani bank's hosted payment page. No money is ever handled by the mobile app.
- Password reset / email verification flows.
- Full student learning experience as well (children can use the site).

### 3.2 The mobile app (iOS + Android, one binary, this submission)
- The same learning experience, native, for both roles.
- **Purchase-silent by design:** the intended store build contains no checkout, no price, no "Subscribe" button, no link to the website's pricing page, and no QR code — for *either* role. It reads an entitlement the family already holds and unlocks content accordingly.
- iPhone only, portrait only (iPad is not supported in the current configuration).
- Offline: none. The app requires network access.

### 3.3 What differs
| | Web | Mobile |
|---|---|---|
| Payments / pricing pages | Yes | **No** (must be none — see §9 and §12) |
| Public marketing landing page | Yes | No |
| Password reset UI | Yes | No — the app opens the web page in the system browser |
| Onboarding carousel (3 slides, once per install) | No | Yes |
| Opt-in biometric app lock | No | Yes |
| Push notifications | No | Yes (optional, off unless enabled server-side) |
| Previous-day round replay | Yes | Not yet |

---

## 4. Feature walkthrough, in plain language

### 4.1 What a parent sees (5 bottom tabs)
1. **Home** — a greeting, and one card per child showing the child's avatar, their 8-digit login ID, an access-status badge and a leaderboard position chip. With no children yet, a large "Add child" prompt.
2. **Analytics** — progress charts per child: accuracy, points, streaks, per-subject strengths, leaderboard position.
3. **Olympiads** — the catalogue of olympiad preparation packages and which ones the family owns.
4. **Subscription** — which subjects are active for which child, and until when.
5. **News** — admin-published articles.

Plus, reachable from these: Add-Child wizard, edit child, a full leaderboard browser, a notifications inbox, and the parent profile (name, email, phone, change password, **delete account**).

### 4.2 What a child sees (5 bottom tabs)
1. **Arena (home)** — a welcome hero with a "start today's round" call to action, the child's national rank in a progress ring, mini-statistics, subject strengths, and their recent rounds.
2. **Tests** — the daily rated round (exactly 25 questions per subject per day, untimed, questions chosen by the server, never by the student) and untimed topic practice, which is unrated.
3. **Olympiads** — the olympiad packages the family owns, and a preview of ones they do not. **No prices, no purchase buttons** (see §12 — one price row is currently leaking here and must be removed).
4. **Ranking** — leaderboards with numeric ranks only. No medals, no prizes.
5. **News** — the same admin-published articles.

Plus: the question runner (question palette, bookmarking, autosave, confirmed submit, resume after interruption), results, answer review, a notifications inbox, and the student profile (avatar, display name, change password, read-only school info, a theme/sticker picker).

### 4.3 Content
All questions are **authored by OlympIQ staff**. They are academic multiple-choice questions (5 options, one correct) mapped to the 2026 Azerbaijani national curriculum: roughly 260 topics and 1,077 subtopics across grades 1–11 and the four school terms (*Rüb 1–4*), covering mathematics, life science, informatics, English, logic, natural science, physics, chemistry and biology. Users never choose difficulty; the server selects the question set.

There is **no user-generated content**: no chat, no messaging, no comments, no forum, no free-text visible to other users. The only user-supplied media is a profile avatar photo, and the leaderboard renders initials, not photos.

---

## 5. Identity and legal facts

| Field | Value | Confidence |
|---|---|---|
| App name (App Store) | **OlympIQ** | Confirmed (fits the 30-character limit) |
| iOS bundle identifier | **`ai.olympiq.app`** | Confirmed — permanent, matches the already-reserved Android package name. Never change it |
| Android package name | `ai.olympiq.app` | Confirmed, already entered in Google Play Console |
| Current app version | **1.2.0** | Confirmed. Build numbers are managed remotely by the Expo/EAS build service and auto-increment; they are not set by hand |
| Build tooling | Expo SDK 54 / React Native, built via EAS. Expo organisation account: `olimpiadaplatforms-team`; EAS project id `786a0358-d1db-437e-9fa3-b466b490a8ae` (not a secret) | Confirmed |
| Platforms in this submission | iPhone only, portrait only. iPad not supported | Confirmed |
| Legal/responsible person named in the app's own public About page | **Kamil Piriyev**, "and his partners" | Confirmed (this is the text published in the product) |
| Tax identification number (VÖEN) | **6300091352** | Confirmed (published publicly in the app) |
| Legal address | **Peshtatuk village, Lerik District, Republic of Azerbaijan** | Confirmed (published publicly in the app) |
| Country / territory of the developer | Azerbaijan | Confirmed |
| Registered company name, if any | — | **OWNER MUST CONFIRM.** The public text names an individual with a personal tax id, which reads as a sole trader / individual entrepreneur rather than an incorporated company. This determines the whole of §6 |
| Support email / support phone shown in the app | Configured through an internal control panel, not hard-coded | **OWNER MUST CONFIRM** the exact values to give Apple |
| Website / marketing URL | `olympiq.ai` planned | **NOT LIVE YET.** The web app is on a Vercel URL today. Apple requires a working Support URL, and both stores require a working Privacy Policy URL — see §12 |
| Privacy policy URL | Does not exist yet | **BLOCKER — see §12** |
| Prior store submissions | None, on any platform | Confirmed |

---

## 6. Apple Developer Program enrolment — Individual vs Organization

### 6.1 The choice
Apple offers two enrolment types, both USD 99/year:

**Individual / Sole Proprietor**
- Enrol as yourself, using your own legal name and a personal Apple Account.
- **No D-U-N-S number required.**
- Verification is by government-issued photo ID and, in most regions, a credit card in the same name.
- **The "seller name" shown publicly on every App Store listing is your personal legal name** — for this project that would display approximately as *Kamil Piriyev*.
- One person controls everything. You cannot add team members with separate roles in App Store Connect under the *Apple Developer Program* team the way an Organization can (App Store Connect user roles are still available, but the account's legal owner is you personally).
- Personal legal liability for the app sits with you as an individual.

**Organization**
- Enrol as a legal entity (company, LLC, registered NGO, etc.).
- **Requires a D-U-N-S number** (see 6.2), a legal entity that is verifiable in public/commercial records, a website at the entity's domain, and authority to bind the entity (Apple will verify by phone/email that you are authorised to sign).
- The public seller name is the **entity's legal name**, not a person's name.
- Supports multiple team members with distinct roles.

### 6.2 What a D-U-N-S number is
A D-U-N-S (Data Universal Numbering System) number is a nine-digit identifier assigned free of charge by Dun & Bradstreet to a **legal business entity**. Apple uses it to verify that an Organization applicant is a real, registered company at a verifiable address. It is obtained through Apple's own D-U-N-S lookup page (`developer.apple.com/enroll/duns-lookup/`), which will either find an existing number for the entity or let you request one. Issuance takes anywhere from a day to a couple of weeks in less-common jurisdictions; Azerbaijani entities are supported but can take longer to verify, and the entity's registered name/address must match its official registration exactly.

**It is not needed for Individual enrolment.**

### 6.3 What this project most likely needs
Based only on what the app itself publishes — an individual's name and an individual's tax id, at a village address, with the project described as being run by "Kamil Piriyev and his partners" — this reads as an **individual / sole trader**, not a registered company. On that reading:

- Enrol as **Individual / Sole Proprietor**.
- **No D-U-N-S number.**
- The App Store will publicly display the seller as **Kamil Piriyev**.

**OWNER MUST CONFIRM before choosing**, because this cannot be verified from the product and the choice is expensive to reverse:

1. **Is there a registered legal entity?** In Azerbaijan a *fərdi sahibkar* (individual entrepreneur) registered with the State Tax Service has a VÖEN but is **not** a separate legal person — Apple generally treats that as Individual enrolment. An MMC (LLC) or similar **is** a legal person and can enrol as an Organization.
2. **Whose name should appear as the seller on the App Store listing?** If the answer is "a company name, not my personal name", you need Organization enrolment and therefore a D-U-N-S number for that company, and you should start the D-U-N-S process first because it is the slow step.
3. **Who will legally receive the revenue?** Even though the app itself sells nothing, the compliance work already done on this project concluded that billing should go through an **Azerbaijani-resident entity** for VAT/fiscal-receipt reasons. That decision and the Apple enrolment identity should be made together, not separately.
4. **Migration is possible but painful.** Apple does allow an Individual account to be converted to an Organization later (it requires the D-U-N-S and a support request, and it is not instant). Transferring individual apps between Apple accounts is also possible. But choose deliberately now.

### 6.4 What else enrolment will ask for
- A personal Apple Account with two-factor authentication enabled (set this up first; it blocks everything else).
- Legal name exactly as it appears on the government photo ID you will upload.
- Address, phone, email.
- A payment method for the USD 99 annual fee (Apple bills in USD; an Azerbaijani card that supports international transactions is needed — **OWNER MUST CONFIRM** a working card).
- For paid apps or in-app purchases you would additionally need banking and tax forms (Paid Applications Agreement, W-8BEN or W-8BEN-E, bank account for payouts). **This app is free with no in-app purchases, so those agreements are not required for this submission** — the Free Applications Agreement is enough. If IAP is ever added, the tax/banking layer becomes mandatory.

---

## 7. App Store Connect answers

### 7.1 Category and basic metadata

| Field | Answer | Why |
|---|---|---|
| Primary category | **Education** | It is an academic preparation tool |
| Secondary category | Leave blank, or **Reference** | Optional; nothing is gained by filling it |
| **Do NOT choose** | The "Kids" category | See §7.3. Choosing "Kids" **is** the Kids Category opt-in and its obligations are permanent |
| **Do NOT choose** | Any Games category | The app is quiz-shaped but is academic; Games invites a different and less favourable review posture |
| App name | `OlympIQ` | 30-char limit, fits |
| Subtitle (30 chars), English | `Olympiad prep for kids` | |
| Subtitle, Azerbaijani | `Olimpiadaya hazırlıq` | |
| Subtitle, Russian | `Подготовка к олимпиадам` | |
| Keywords (100 chars) | `olimpiada,test,riyaziyyat,məntiq,ingilis dili,təhsil,şagird,olympiad,math,quiz` | |
| Primary language | Azerbaijani (with English and Russian localisations) | The app defaults to Azerbaijani |
| Price | **Free** | |
| Support URL | **OWNER MUST CONFIRM** — must be a live page | Required |
| Marketing URL | Optional; leave blank until the domain is live | |
| Privacy Policy URL | **Does not exist yet — BLOCKER (§12)** | Required by Apple before submission |
| Content rights: does the app contain, show or access third-party content? | **No** | All questions, news and notifications are authored by OlympIQ. There is no licensed or user-supplied third-party content |

**Important metadata rule:** the App Store listing text, subtitle, keywords and **screenshots** must contain **no price, no currency amount, and no purchase URL**. The listing must not steer users to buy anywhere. Review the drafted long descriptions before pasting them — the current Azerbaijani/English drafts end with a sentence about "all payments happen only from the parent account", which should be rewritten to access/activation language (e.g. "access is activated by the parent").

### 7.2 Age rating questionnaire — every question, with justification

Apple revised the questionnaire in 2025 (bands are now 4+ / 9+ / 13+ / 16+ / 18+, plus a set of "capability" questions). Answer the form **as served on the day**; the substance below does not change with the wording.

**Content questions — all NONE / NO:**

| Question | Answer | Justification |
|---|---|---|
| Cartoon or Fantasy Violence | **None** | No violence of any kind anywhere |
| Realistic Violence | **None** | |
| Prolonged Graphic or Sadistic Realistic Violence | **None** | |
| Profanity or Crude Humor | **None** | All text is admin-authored academic content |
| Mature/Suggestive Themes | **None** | |
| Sexual Content or Nudity | **None** | |
| Graphic Sexual Content and Nudity | **None** | |
| Horror/Fear Themes | **None** | |
| Alcohol, Tobacco, or Drug Use or References | **None** | |
| Medical/Treatment Information | **None** | Biology curriculum questions are academic, not medical advice |
| Simulated Gambling | **None** | |
| Contests | **None** | See the note on "giveaway" below |

**Capability / behaviour questions:**

| Question | Answer | Justification |
|---|---|---|
| Does the app contain **in-app purchases**? | **NO** | The binary contains no purchase functionality. Answering YES would contradict the review note in §11 and there are no IAP products configured |
| Does the app contain **advertising**? | **NO** | No ad SDK of any kind is present |
| **Unrestricted Web Access**? | **NO** | There is no in-app browser and no address bar. There is exactly one web view in the whole app: a non-interactive Google Maps embed on the public Contact screen, which is pointer-disabled, has third-party cookies and file access disabled, and cancels any navigation outside `google.com/maps`. **Caveat: this answer is only fully honest once blocker I5 in §12 is fixed** — today an internally-published notification could contain an arbitrary external link a child could tap |
| **User-Generated Content / user-to-user communication**? | **NO** | No chat, messaging, comments, forum, or shared free text. Users can set their own name and avatar; the avatar is never shown to other users (leaderboards render initials). News has a like counter only, no comments |
| **Gambling** (real or simulated)? | **NO** | No wagering, no chance mechanic, no loot box, no virtual currency, no prizes. Leaderboards are pure skill rankings with numeric ranks and no reward |
| **Contests / sweepstakes**? | **NO** | ⚠️ If a reviewer sees the word "giveaway" in the app, it refers to a **free-access promotional window** ("Free access is on — try everything now, paid access starts later"), not a prize draw. Be ready to explain this |
| Location? | **NO** | The app never requests location |
| Does the app have **parental controls / age gate**? | See note | There is no age gate. The app is structurally parent-controlled: only an adult can create an account and only an adult can create a child profile. Describe it that way, not as a "parental control" feature |

**Expected outcome: Apple 4+.**

### 7.3 Kids Category — DO NOT OPT IN

Apple's Kids Category has age bands of 5-and-under / 6–8 / 9–11. OlympIQ serves grades 1–11, roughly ages 6–17, so the category does not fit in the first place. More importantly, Kids Category obligations under Guideline 1.3 are **sticky**: Apple's own text says that once customers expect the app to follow Kids Category requirements, it must continue to meet them in subsequent updates *even if the category is later deselected*. Those requirements include putting every external link and every purchasing opportunity behind a parental gate and banning third-party analytics. Opting in would permanently foreclose ever adding in-app purchases without building a parental gate — and, as §9 explains, being forced into IAP is a real possibility for this app.

**Choose "Education", not "Kids".**

**What still binds us regardless of the opt-in:** Guideline 5.1.4 (Kids Apps) and 5.1.4(b) in particular apply to *any* app that collects or transmits personal information or persistent identifiers from a minor. OlympIQ collects a child's name, grade, school, city, district, an 8-digit persistent identifier, attempt history, scores and leaderboard placement. So Apple will expect a children's privacy policy, linked both in App Store Connect and inside the app, in all three of the app's languages. That does not exist yet (§12).

### 7.4 Export compliance (encryption)

**Answer: the app does not use non-exempt encryption.**

What the app actually uses:
- HTTPS/TLS for all network traffic to first-party backends, with iOS App Transport Security enforced (arbitrary loads are disabled).
- The operating system's own secure storage (iOS Keychain via `expo-secure-store`) for session tokens.
- Biometric authentication (Face ID / Touch ID) — which is authentication, not encryption.
- **No custom, proprietary or third-party cryptography whatsoever.** No crypto library of any kind is in the dependency list.

That is the standard exempt case under Category 5 Part 2 of the U.S. Export Administration Regulations: encryption limited to standard TLS for communications plus platform-provided key storage. Consequences: **no CCATS, no Encryption Registration Number, no French encryption declaration, no annual self-classification report.**

**Practical recommendation:** set `ITSAppUsesNonExemptEncryption = false` in the iOS app configuration so App Store Connect stops asking on every single upload and the answer can never be mis-clicked. It is not set today (§12). Re-answer honestly if custom cryptography is ever added — for example an offline encrypted question cache or end-to-end encrypted messaging.

### 7.5 IDFA / advertising identifier

**Answer: NO — the app does not use the Advertising Identifier (IDFA).**

There is no advertising SDK, no attribution SDK and no analytics SDK anywhere in the app. The full third-party dependency tree (about 1,300 packages) was swept for the names of every common analytics, tracking, advertising, attribution and crash-reporting vendor — Firebase Analytics, Sentry, Bugsnag, Crashlytics, Amplitude, Mixpanel, Segment, AppsFlyer, Adjust, Branch, OneSignal, Braze, Facebook SDK, AdMob, Google Analytics — and **none is present**. The app never reads any device identifier: no IDFA, no identifierForVendor, no Android ID, no installation id.

Consequently the app **does not need and does not show an App Tracking Transparency prompt**, and `expo-tracking-transparency` is not installed.

---

## 8. App Privacy "nutrition label"

### 8.1 The headline statements
- **Data Used to Track You: NONE.** No data is linked with third-party data for advertising or measurement, and no data is shared with a data broker.
- **Data Not Linked to You: NONE.** Everything the app collects is tied to a family account by design.
- Everything below is **Data Linked to You**.
- There is **no third-party analytics, advertising, attribution or crash-reporting SDK** in the app.

### 8.2 The table

| Data type (Apple's taxonomy) | Collected? | Linked to identity? | Used for tracking? | Purpose | What it actually is |
|---|---|---|---|---|---|
| **Name** | Yes | Yes | No | App Functionality | Parent's first/last name; child's first/last name (entered by the parent) |
| **Email Address** | Yes | Yes | No | App Functionality; Customer Support | Parent only. **Children have no email address** |
| **Phone Number** | Yes | Yes | No | App Functionality; Customer Support | Parent only, mandatory at registration, E.164 format |
| **Physical Address** | Yes (coarse) | Yes | No | App Functionality | City, district (*rayon*) and school name for the child — used to place them on regional/school leaderboards. **No street address is ever collected** |
| **Photos** | Yes (optional) | Yes | No | App Functionality | An avatar image. A parent may upload a photo for a child; a signed-in child may upload their own. Preset non-photo avatars are also available and are the default. Uploads are limited to PNG/JPEG/WebP/GIF, max 2 MB, validated server-side from the file's actual bytes. SVG is banned |
| **User ID** | Yes | Yes | No | App Functionality | The account id, and the child's **8-digit login ID** — a persistent identifier for a minor, which is why Guideline 5.1.4(b) applies |
| **Other User Content** | Yes | Yes | No | App Functionality | The child's chosen display name and colour/sticker theme. Nothing else user-authored exists |
| **Product Interaction** | Yes | Yes | No | App Functionality; Analytics (first-party, in-product) | Attempt history, answers, scores, points, streaks, accuracy percentages, leaderboard placement. This is the *product*, not telemetry — the parent's Analytics tab and the child's progress screen are built from it |
| **Purchase History** | **See note** | Yes | No | App Functionality | ⚠️ **Answer this as entitlement/access state, not purchase history.** The app reads *which subjects and olympiad packages a family currently has access to and until when*. It records no transactions, no amounts, no payment instruments. Purchases happen on the website. Avoid selecting "Purchase History" if a more accurate option exists, and never let this contradict the review note "this app contains no purchase functionality of any kind" |
| **Payment Information** | **No** | — | — | — | The app never sees a card number, never renders a card form, never touches payment data |
| **Precise / Coarse Location** | **No** | — | — | — | The app never requests location. City/district come from what the parent typed |
| **Contacts** | **No** | — | — | — | |
| **Health & Fitness** | **No** | — | — | — | |
| **Financial Info** | **No** | — | — | — | |
| **Browsing History / Search History** | **No** | — | — | — | |
| **Sensitive Info** | **No** | — | — | — | |
| **Diagnostics / Crash Data / Performance Data** | **No** | — | — | — | No crash-reporting or performance SDK is installed |
| **Advertising Data** | **No** | — | — | — | No ads |
| **Device ID** | **No** | — | — | — | No IDFA, no vendor id, no hardware identifier is ever read |
| **Push token + basic device info** | Yes | Yes | No | App Functionality | If push notifications are enabled, a push token is stored together with the device *model name*, OS version and app version — no advertising id, no persistent hardware identifier |

### 8.3 Third parties and infrastructure — describe these accurately
None of these is a tracker, but they exist and the privacy policy should name them:

| Party | Role | What it receives |
|---|---|---|
| **Supabase** | The project's own backend (database, authentication, file storage) | All product data, over TLS |
| **Expo / EAS** | Build service; also relays push notifications and serves over-the-air JavaScript updates | The device push token and the project id when push is enabled; a version check at app launch |
| **Apple APNs** | iOS push transport | Standard push delivery |
| **Google FCM** | Android push transport (irrelevant to the iOS submission but present in the codebase) | Standard push delivery |
| **Google Maps** | A single non-interactive map embed on the public Contact screen | The device's IP address and user agent, when that one screen is opened. No account data is passed |
| **Vercel** | Web app hosting | Standard server request logs |

**OWNER MUST CONFIRM** with counsel how to characterise these in the privacy policy (processor vs "shared with third parties") and what the server log/IP retention period is — the privacy policy needs a concrete answer.

### 8.4 Two privacy issues the owner should decide on, not hide
1. **Child-uploaded avatars land in a publicly-readable storage bucket.** Parent-uploaded child photos go to a private bucket served only through signed URLs behind a family-membership check — correct. But when a signed-in *child* uploads their own avatar from their profile screen, it goes to the public avatar bucket, readable by anyone who has the object URL. The asymmetry looks unintentional. **OWNER MUST DECIDE:** move the student path to the private bucket, or remove the child's ability to upload a photo at all (preset avatars only). For a children's app this is worth fixing before submission.
2. **The signed-in leaderboard is not anonymous.** It shows every ranked student as "Firstname L." together with their city, district, school and grade to any signed-in student or parent. In a small district school that combination is re-identifying. The *public* website top-10 is properly anonymised as "Şagird XXXX". **OWNER MUST DECIDE** whether the authenticated board's row context is acceptable; it is defensible (it is a school-competition leaderboard) but it should be a conscious decision and it must be described in the privacy policy.

---

## 9. Commerce and monetisation — the highest-risk area

### 9.1 How the product makes money
Parents pay, **on the website, in a browser, in Azerbaijani manat, through an Azerbaijani bank**, for:
- **Per-subject subscriptions per child**, priced weekly / monthly / yearly, with an automatic sibling discount (10% for a second child, 15% for a third and beyond).
- **Olympiad preparation packages**, bought once, with lifetime access.

Payment is a full redirect to the bank's hosted payment page. The app never sees a card. Access is granted server-side only after the bank's result is independently re-verified.

At the time of writing the platform is running with **payments switched off** (a free-access period), enforced at the database level.

### 9.2 Why the app needs no in-app purchases
**The mobile app sells nothing.** It is a companion that displays access the family already obtained elsewhere and lets the child consume the content. The app contains no checkout, no price, no subscribe button, no link to a purchase page.

Google Play publishes an explicit general exemption for exactly this: an app may be **consumption-only**, even if it is part of a paid service, provided nothing — digital or physical — can be purchased from within the app. That exemption is unambiguous and Android is on solid ground.

**Apple has no equivalent general exemption.** The closest thing is Guideline **3.1.3(f)**, which permits *"free apps acting as a stand-alone companion to a paid web based tool … provided there is no purchasing inside the app, or calls to action for purchase outside of the app."* That is the correct clause to have in mind — but be honest with the owner about two weaknesses:
- 3.1.3(f)'s enumerated examples (VoIP, cloud storage, email, web hosting) are all *infrastructure* services where the app is a thin client. OlympIQ's mobile app is the **primary consumption surface** — the daily rounds, tests and streaks *are* the product and they happen in the app.
- There is no application, no entitlement and no pre-approval for 3.1.3(f). It is re-adjudicated at every single submission, and there is 2026 precedent of login-only companion apps still being rejected with Apple's boilerplate *"Your app includes or accesses paid digital content, services, or functionality by means other than in-app purchase."*

**Net position: Google is sound. Apple is acceptable, not safe. Budget an appeal cycle on the first submission.** Do not tell the owner this is settled.

**A timing insight worth stating explicitly:** the risk *arrives* when live payments are switched on, even though the app gains no new code. During the current free period it may be literally true that nothing is paid — which is the strongest possible review position. From the day parents start paying on the web for content the app delivers, the app becomes "accessing paid digital content by means other than in-app purchase". Plan the iOS decision around that date.

### 9.3 Why Azerbaijan gets no relief from the anti-steering rule
Do not reason from any 2024–2026 "you can now link out to your website" headline. Every liberalisation is scoped to a jurisdiction that does not include Azerbaijan:

| Relief | Scope | Applies to us? |
|---|---|---|
| *Epic v. Apple* contempt ruling (Apr 2025) — link-outs permitted | **United States storefront only** | **No** |
| StoreKit External Purchase Link Entitlement | EU + South Korea | **No** |
| EU Digital Markets Act | 27 EU member states / EEA | **No** — Azerbaijan is not EU or EEA |
| Netherlands ACM order | NL dating apps only | **No** |
| Apple reader-app External Link Account Entitlement | Global, but magazines/newspapers/books/audio/music/video only | **No** — wrong category |
| *Epic v. Google* injunction | US users only | **No** |
| Google User Choice Billing | AU, BR, ID, JP, ZA, UK, EEA (+ KR/IN/US programs) | **No** — Azerbaijan appears nowhere |

Guideline 3.1.1(a) as served applies in full: outside the US storefront, apps and their metadata may not include buttons, external links or other calls to action directing customers to purchasing mechanisms other than in-app purchase. And **storefront availability, not developer nationality, is what controls** — a worldwide release that includes the Azerbaijani storefront is reviewed against the restrictive rule.

Also: do **not** plan against Google's announced "rest of world, 30 September 2027" billing-choice date. The motion underlying it was jointly withdrawn in July 2026. It is an intention, not a milestone.

### 9.4 Arguments that must NEVER be made
These will make things worse, not better:

| Never say | Why |
|---|---|
| "Guideline **3.1.3(b) Multiplatform Services** means we don't need IAP" | Its text permits honouring entitlements bought elsewhere *"provided those items are also available as in-app purchases within the app."* The proviso is a condition. Citing 3.1.3(b) is arguing **for** IAP |
| "Only parents buy, and children never buy, so IAP doesn't apply" | 3.1.1 is drafted around what a purchase *does*, not who pays — and Guideline **3.1.3(c)** closes the door explicitly: *"Consumer, single user, or family sales must use in-app purchase."* Apple names family sales. The parent-only model is excellent child-safety design; it grants **zero** IAP relief |
| "3.1.3(c) Enterprise" or "3.1.3(d) Person-to-Person" | Neither describes this product |
| Google's "1:1 live online services" education exemption | It requires a live, one-to-one, non-replayable session between two individuals. OlympIQ is pre-authored, one-to-many, asynchronous and replayable — it fails all four prongs, and claiming it reads as deliberate circumvention |

### 9.5 The absolute "never ship" list for a store build
1. **Never let a server flag control whether purchase UI appears.** A working non-IAP checkout sitting in a store binary, revealed or hidden by a remote switch, is the textbook Guideline **2.3.1(a)** hidden-functionality fact pattern. The penalty tier is **developer-account termination**, not rejection. Whether it is demo money or real money is irrelevant — the capability is in the bundle and can be found by unzipping the IPA. Payment posture must be a **build-time constant**: the store binary contains no purchase code at all.
2. **Never show an AZN price** — or any price — anywhere in the app, for either role.
3. **Never render a Subscribe / Abunə ol / Yenilə / Upgrade / Əldə et button**, even one that only opens an explainer.
4. **Never name `olympiq.ai`, show a URL, or render a QR code in a purchasing context.** Guideline 3.1.1 names QR codes explicitly.
5. **Never open an arbitrary external URL** from notification content, deep links or any server-supplied string.
6. **Never show fake prices, fake invoices or a simulated card sheet.** Guideline 2.3.1 states that promoting a false price is grounds for removal from the App Store *and* termination of the developer account. A "this is a demo" disclaimer does not cure it.
7. **Never tell a child to ask a parent to *buy* anything.** Use access/activation language.
8. **Never put a web-view checkout, an Apple Pay sheet, or a card form** in the app for digital goods.

### 9.6 What is still permitted, and is the growth channel
Both stores expressly permit **out-of-app communication** about other payment methods, with prices and links, without restriction. Apple's own lead-in to 3.1.3 says developers *"can send communications outside of the app to their user base about purchasing methods other than in-app purchase."* Email, the website, schools and social media are the sanctioned conversion channels. The same applies to renewal-failure recovery: the app says only that access is off; the **email** to the parent carries the price, the link and the one-click renewal.

### 9.7 Copy rules for in-app strings
State **facts about state**, never **instructions about where to pay**. Show what is *active*, never what it *costs*.

| Situation | Wrong | Right |
|---|---|---|
| Locked subject shown to a child | "ask your parent to **buy** it" | "This subject isn't available right now — talk to your parent." |
| Payments-off notice | "Subscriptions are managed from your family's **web account**" (names a destination) | "Subscriptions aren't managed in this app." |
| Parent subscription state | Price + next charge date | Status + period-end date, **no amount** |

### 9.8 If Apple ever forces IAP
Two facts to have ready:
- **AZN is not an App Store Connect pricing currency.** Azerbaijan sits in Apple's "Rest of World" region and prices in USD, so the AZN price points could not be expressed natively.
- **The sibling discount has no StoreKit primitive.** A cascading 10%/15% family discount would have to be dropped on mobile, modelled as separate discounted SKUs, or handled with offer codes. A server-side rebate paid outside the store would read as circumventing store pricing — high risk.

The mitigation already designed into the platform is that entitlement is a **provider-agnostic** concept: access is granted by an entitlement record whose `source` can be the bank, Apple IAP, Google Play, a giveaway, a manual grant or a school licence. The bank is one *producer* of entitlements, never the source of truth for access. That makes "add IAP on iOS only" roughly a two-week job rather than a rewrite. **Corollary: do not pre-build a dormant IAP path** — that is the same hidden-functionality problem in reverse.

---

## 10. Required capabilities and what Apple will check

### 10.1 Account deletion (Guideline 5.1.1(v)) — SATISFIED, with a nuance
Apple has required in-app account deletion since 2022 for any app that supports account creation.

**Where it is:** sign in as a **parent** → tap the avatar in any tab header → "My profile" → scroll to the red **Danger Zone** → "Delete account" → a **two-step confirmation**. Deleting the parent account cascades: it deletes every child profile the parent created along with the parent's own account and all associated data.

**The nuance you must state accurately:** the **student profile has no delete-account control and no email field, by deliberate design** — a child never holds an account in the ordinary sense and never gets account-management powers. This is defensible under 5.1.1(v) because children never *create* an account in-app, and the parent's deletion removes the entire family's data. But a reviewer signed in as the **child** demo account will find no delete option and may cite 5.1.1(v), so **the review notes must say this explicitly** (it is in the §11 template).

### 10.2 Sign in with Apple (Guideline 4.8) — NOT REQUIRED
Guideline 4.8 obliges an app to offer an equivalent privacy-focused login option **only when it offers third-party or social login** (Google, Facebook, Twitter, etc.). OlympIQ offers **none**: authentication is email + password for parents and 8-digit ID + password for children, both first-party. No OAuth provider, no social SDK, no `expo-apple-authentication` is present in the app. **The requirement is therefore not triggered.** State this plainly if a reviewer or advisor raises it.

### 10.3 Push notifications
- Used for education and account events (a new round is available, streak reminders, news, account status) — one-way, admin to user. **Never for marketing a purchase.**
- Fully optional. Registration is gated three ways: a signed-in session, a resolved role, and a server-side feature flag. **That flag is currently OFF**, which means zero registration calls and therefore **zero permission prompts today**.
- On iOS the first request is **provisional** (`allowProvisional`), meaning quiet delivery with no visible prompt on first run. A denial is never re-prompted.
- Per-user in-app / email / push preference toggles exist server-side, giving a documented opt-out beyond the OS permission.
- The push token is deleted from the server before sign-out, so a logged-out device stops being addressable.
- **No iOS usage-description string is required for notifications.** The Push Notifications capability must be enabled on the App ID and a push key configured before push works in a store build.

### 10.4 Biometric app lock (Face ID / Touch ID)
- Strictly **opt-in**, off by default. A toggle in the account sheet.
- When on, it locks a *restored* session at cold start and after the app has been backgrounded for a grace period. A fresh interactive login is itself the identity proof, so a reviewer never meets the lock unless they turn it on.
- Turning the lock both on **and** off requires a successful biometric or device-passcode check.
- `NSFaceIDUsageDescription` **is** configured — but currently **only in Azerbaijani**: *"OlympIQ istifadəçini təsdiqləmək üçün Face ID istifadə edir."* ("OlympIQ uses Face ID to verify the user.") A US reviewer will see the Azerbaijani text. Not a rejection on its own, but see §12.

### 10.5 Every permission the app requests, and why

| Permission | When it is triggered | Purpose to state to Apple | iOS string status |
|---|---|---|---|
| **Photo Library** | Tapping "change avatar" on the parent profile, on the **student** profile, or the photo tile in the Add-Child / Edit-Child avatar picker | "To let you choose a profile picture for your account or your child's profile." | ❌ **MISSING — hard blocker, see §12** |
| **Push Notifications** | Only after sign-in, only when enabled server-side | "To notify you about new practice rounds, streaks, results and account updates." | ✅ Not required by iOS |
| **Face ID / Touch ID** | Only when the user turns on the optional app lock | "To unlock the app with Face ID instead of re-entering your password." | ✅ Present (Azerbaijani only) |
| Camera | **Never used.** No camera capture path exists in the app | — | Not requested on iOS |
| Location, Contacts, Microphone, Calendar, Health, Bluetooth, Tracking | **Never used** | — | Not requested |

App Transport Security is enforced (`NSAllowsArbitraryLoads: false`) — all traffic is HTTPS.

---

## 11. App Review Information — the demo account block

Paste the following into **App Store Connect → App Review Information → Notes**, and fill in both credential fields. **Both accounts are mandatory.** A reviewer with only a parent login cannot reach the majority of the app and is likely to reject it.

### 11.0 ⚠️ FIRST — how to actually CREATE a usable demo child (read before filling anything in)

**Creating a child through the app's Add-Child wizard does NOT, by itself, produce a child who can log in.** This is the single most likely cause of a failed review for this app, so it is stated first.

The 8-digit login ID is **deferred**: the child profile is created without one. The ID is allocated only when one of these happens:

1. a **subscription completes** for that child, **or**
2. an active **giveaway / free-access window** covers them, **or**
3. an administrator issues a **comped access grant** (the supported server-side route, `admin_grant_child_access`, which creates a zero-amount active subscription, allocates the 8-digit ID, and sets the child's access status to active).

Consequences the owner must plan around:

| Situation | What the reviewer would experience |
|---|---|
| Child created while payments are **off** or in **real** mode | The wizard finishes with the child created but the ID **pending**. There is no ID to give Apple, and the child literally cannot sign in. |
| Child has an ID but **no active access** | Sign-in works, but every learning card is **locked** ("Ask your parent to activate a subject subscription"). The reviewer sees an essentially empty app and is likely to reject it as non-functional or as a broken paywall. |
| Child has an ID **and** active access covering ≥1 subject | Correct. The full student experience is reachable. |

**Therefore, before submitting:** provision the demo child through route (3) — an administrator comp grant — so the child has both a real 8-digit ID and active access to at least one subject, without changing the app's payment posture. Verify by actually signing in as that child on a device and confirming the daily round and a topic practice both open.

**Also note:** in-app "forgot password" opens the website, and password-reset email is **not operational** (no outbound mail provider is configured yet). If you lose the demo passwords you cannot self-recover them — record them somewhere safe, and keep the demo accounts alive for as long as the app is on the store, including through any re-review.

### 11.1 The Sign-In Information fields
App Store Connect provides one "Sign-in required" username/password pair. Put the **parent** credentials there and put the **child** credentials in the Notes — they are documented below in a way that makes that unambiguous.

- **Sign-in required:** ✅ Yes
- **User name:** `[PARENT DEMO EMAIL]`
- **Password:** `[PARENT DEMO PASSWORD]`

### 11.2 Notes for Review — copy this, fill the placeholders

```
ABOUT THIS APP
OlympIQ is a parent-managed education app for school students in Azerbaijan
(grades 1-11). Students practise multiple-choice academic questions in maths,
sciences, informatics, English and logic, and appear on skill-based leaderboards.

THIS APP CONTAINS NO PURCHASE FUNCTIONALITY OF ANY KIND.
Accounts and access are provisioned outside the app; nothing can be bought inside
it by any user or role. There are no prices, no subscribe buttons and no links to
any purchase page anywhere in the binary. Students are purchase-incapable at the
server level, not merely in the UI.

IMPORTANT - HOW ACCOUNTS WORK (please read before testing)
This app has TWO user roles in one binary, and only ONE of them can register:

 * PARENT  - registers with email + password. Manages the family.
 * STUDENT - CANNOT register. There is no sign-up path for a child anywhere in
             the app, by design (child-safety requirement). A parent creates the
             student profile, and the server issues an 8-DIGIT NUMERIC ID. The
             student signs in with that 8-digit ID plus a password the parent set.
             Students have no email address in the system.

Because of this, MOST OF THE APP IS ONLY VISIBLE IN A STUDENT SESSION. We have
supplied credentials for BOTH roles below. Both accounts already have active
access, so the full experience is reachable.

DEMO CREDENTIALS

 PARENT ACCOUNT (also entered in the Sign-In fields above)
   Email:    [PARENT DEMO EMAIL]
   Password: [PARENT DEMO PASSWORD]

 STUDENT ACCOUNT (sign in from the "Student" tab on the login screen)
   8-digit ID: [8-DIGIT CHILD ID]
   Password:   [CHILD PASSWORD]

SUGGESTED TEST SCRIPT

 A) FIRST LAUNCH
    1. A three-slide intro appears once. Tap through it, or tap "Skip".
    2. You land on the login screen. It has two tabs: "Parent" and "Student".
       You may change the app language (Azerbaijani / English / Russian) with the
       chip in the corner - English is available throughout.

 B) STUDENT SESSION - this is the main product, please test this one
    1. On the login screen choose the "Student" tab.
    2. Enter the 8-digit ID and password above. Sign in.
    3. "Arena" tab: home screen with the student's rank, statistics and recent rounds.
    4. "Tests" tab: pick a subject and start the daily round. It is 25 multiple-choice
       questions, chosen by the server, untimed. Answer a few questions, use the
       question palette, then submit. You will see a result screen and can review
       every answer.
       NOTE: only ONE rated daily round per subject per day is allowed. If you want
       to run more attempts, use "topic practice" on the same tab - it is unlimited,
       untimed and unrated.
    5. "Olympiads" tab: olympiad practice packages the family already has access to.
       There are no prices and no purchase options here.
    6. "Ranking" tab: leaderboards, numeric ranks only, no prizes.
    7. Tap the avatar in the header to open the account sheet: profile, language,
       light/dark theme, an optional Face ID app lock, and logout.

 C) PARENT SESSION
    1. Log out, then sign in on the "Parent" tab with the parent credentials.
    2. "Home": one card per child, showing the child's 8-digit login ID and access status.
    3. "Analytics": the child's progress and results.
    4. "Olympiads" / "Subscription": which content the family has access to and until when.
       These screens display access STATUS only - no prices, no payment options.
    5. "News": articles published by our editorial team.
    6. Avatar -> "My profile": here you will find the in-app ACCOUNT DELETION flow at the
       bottom of the screen ("Danger Zone", two-step confirmation). Deleting the parent
       account also deletes every child profile it created.

ACCOUNT DELETION (Guideline 5.1.1(v))
In-app account deletion is on the PARENT profile screen (Danger Zone, two-step
confirm) and cascades to every child profile in the family. The STUDENT profile
deliberately has no delete control and no email field: a child never creates an
account, never holds one independently, and is given no account-management powers.
The parent is the account holder for the whole family.

PERMISSIONS
 * Photo library - only if you choose to set a profile picture. Preset avatars are
   the default and no photo is required.
 * Notifications - optional; used for practice reminders, results and account
   notices only. Never for marketing.
 * Face ID / Touch ID - only if you turn on the optional app lock in the account sheet.
The app requests no location, camera, contacts or microphone access.

OTHER NOTES
 * The app is trilingual: Azerbaijani (default), English and Russian. Use the language
   chip on the login screen or in the account sheet to switch to English.
 * The app is iPhone-only and portrait-only.
 * If you see the word "giveaway" in the app, it refers to a free-access promotional
   period, not a prize draw or contest. There is no gambling, no prizes and no
   virtual currency in the app.
 * There is no chat, messaging, comments or any other user-to-user communication.

CONTACT
 [OWNER NAME], [SUPPORT EMAIL], [SUPPORT PHONE]
```

### 11.3 What the owner must do to make those credentials real
1. **Create both accounts on the PRODUCTION environment**, at submission time — not on the development environment, and never commit the credentials to the repository.
2. **The child must already have an active entitlement** so the learning content is unlocked. A child with no active access sees only locked cards and an "ask your parent to activate a subject" message, which a reviewer will read as a broken or gated app. Grant access through the internal comp/grant mechanism rather than by turning on a payment mode.
3. **The child must be placed in a grade and subject combination that actually has enough published questions.** A rated daily round needs at least 25 published questions in the eligible pool for that child's grade and the current school term, and the server correctly refuses to start a round if the pool is smaller. Verify by running the round yourself on the exact production account before submitting.
4. **Verify the credentials on the submitted build**, not on a development build.
5. **Keep the demo accounts alive** through the whole review and any appeal. Do not delete or expire them.
6. Consider making the demo parent's dashboard non-empty (one or two children with some attempt history) so the Analytics tab is not blank.

---

## 12. Pre-submission blocker checklist

Nothing here is fixed yet. This is honest engineering status, not a formality. **Items 1–5 are the ones that can cost the developer account or a hard rejection.**

### 12.0 STATUS AS OF 2026-07-30 — what has since been FIXED

The table below was written before a remediation round. These items are now **CLOSED** in the
codebase (verified: mobile typecheck 0, 331 tests, lint clean):

| # | Item | Resolution |
|---|---|---|
| 3 | Fabricated PAID invoices | **DELETED.** Replaced with an honest empty state; a "demo" disclaimer does not cure a displayed false price. |
| 4 | Simulated credit card `4242 4242 4242 4242` | **REMOVED**, along with the fake expiry and CVC. The placeholder left behind is deliberately not a valid card shape. |
| 5 | AZN price shown to a CHILD above "ask your parent to buy" | **FIXED.** The shared detail-row builder now takes the price as an **opt-in flag defaulting to OFF**, so the student sheet shows no price and a future caller that forgets the flag fails safe. |
| 14 | `NSPhotoLibraryUsageDescription` absent | **ADDED** directly to the iOS `infoPlist`. The picker's config plugin was deliberately NOT registered, for the 5.1.1 reason given in the row below. |
| 16 | `ITSAppUsesNonExemptEncryption` not declared | **DECLARED** `false`. |

**Also closed, and not in the original table** — a child's self-uploaded avatar was written to a
PUBLIC storage bucket, and "remove" was unlink-only, so a photograph of a minor was
world-readable and could never be withdrawn. Worse, an anon-readable policy on the media table
made those photos **enumerable**, not merely guessable. Migration 096 moved the child path to
the private bucket, made removal actually delete, extended the storage policy so a child can
write to their own folder (it was read-only, which would have made the fix fail silently), and
removed the already-exposed object.

**Everything else in the tables below is STILL OPEN.** The two architectural items — the
build-time payment constant (#1) and removing the pricing screen from store builds (#2) — were
explicitly DEFERRED by the owner and are tracked in `STATUS.md`. Note that #7's banned CTA
cannot be fixed by renaming: the problem is that a purchase CTA exists in the binary at all,
so it resolves only with #1.

### 12.1 Commerce — the app is not purchase-silent yet

| # | Blocker | Why it causes a problem | Severity |
|---|---|---|---|
| 1 | **Payment posture is a runtime server flag, not a build-time constant.** The binary always contains a complete working non-IAP checkout (subscribe flow, a simulated pay sheet, an olympiad buy flow, a subject-change purchase path); only the server-supplied mode hides them | Guideline **2.3.1(a)** hidden functionality. A reviewer approves a state the server can change afterwards. **Penalty tier: developer-account termination, not rejection.** This is the single most dangerous item on the page | **CRITICAL** |
| 2 | **A full public pricing/paywall screen ships in the binary and is reachable before login** — per-interval plan cards, AZN prices per subject, a trial line, a sibling-discount callout, and a call-to-action into the registration funnel. Money UI is now hidden while payments are off, but the screen and its strings still ship and reappear when the mode changes, and deep links still route to it | Guideline **3.1.1(a)** anti-steering. Exclude the screen from store builds and remove its deep-link routes | **CRITICAL** |
| 3 | **Fake billing data and fabricated invoices** on the parent Subscription tab: a hardcoded next-charge date, "≈ 18 AZN", a card ending with an expiry, and two fabricated PAID invoices. These are **not** hidden by the payments-off switch and render in every mode | Guideline **2.3.1** names promoting a false price as grounds for **removal from the App Store and termination of the developer account**. A "demo" disclaimer does not cure a displayed false price. **Delete them** | **CRITICAL** |
| 4 | **A simulated credit card** (`4242 4242 4242 4242` with expiry and CVC) on a gradient card visual in the demo pay sheet | A card-entry surface for digital goods inside the binary. Delete from store builds | **HIGH** |
| 5 | **A child is shown an AZN price directly above the words "ask your parent to buy it."** The olympiad detail sheet appends a price row unconditionally, and that helper is shared by the parent *and* student screens; on the student screen the price is immediately followed by the "ask your parent to buy the package" card | Breaks three rules at once: never show a price in the app, children never see commerce, and children's-advertising rules prohibit exhorting a minor to get an adult to purchase | **CRITICAL** |
| 6 | **The parent Olympiads tab shows AZN price chips on every package card in every payment mode**, including while payments are off | Anti-steering; a reviewer opening that tab sees a grid of prices | **HIGH** |
| 7 | **The banned CTA string is live:** an "Əldə et" / "Get it" / "Получить" button on purchasable olympiad cards and in the detail sheet | A purchase call to action inside the app | **HIGH** |
| 8 | **Hardcoded `"AZN"` string literals** in parent commerce components | Will be found by any grep of the release bundle, and by a reviewer | **HIGH** |
| 9 | **"Subscriptions and payments are managed from your family's web account"** renders in four places, in all three languages, in one case directly beneath a bolded AZN price | Price + "buy it there" is a call to action without a hyperlink — precisely the sentence a reviewer screenshots. Reword to name no destination: "Subscriptions aren't managed in this app." | **HIGH** |
| 10 | **Child-facing "buy" wording:** "ask your parent to buy the package", "no olympiad packages yet — ask your parent to buy one", "you don't have access — ask your parent to purchase it", in all three languages | Rewrite to access/activation language. A correctly-worded example already exists elsewhere in the app ("ask your parent to *activate* a subject subscription") — copy that pattern everywhere | **MEDIUM** |
| 11 | **In-app notification bodies can contain an arbitrary external `https` link** which is opened with no allowlist — and this renders on the **student** notifications screen | Two problems: dynamic in-app steering the reviewer never sees (3.1.1(a)), and an ungated external link-out from a minor's session (5.1.4). It is also the one code path that makes the "no unrestricted web access" age-rating answer untrue. Fix: render external URLs as plain non-tappable text; keep the existing correctly-allowlisted internal-route handling | **HIGH** |
| 12 | **The login screen's "forgot password" link opens the website in the system browser — and that web page renders the site header, whose first nav item is the pricing page and which shows a Register button to signed-out visitors.** A signed-out reviewer following that link is one tap from a full AZN pricing page | Anti-steering, via a path a reviewer will actually take. Fix: serve that page chrome-free, or handle password reset in-app | **HIGH** (higher than previously assessed) |
| 13 | **A student session can reach external social media link-outs.** The account sheet offers About / FAQ / Contact to both roles, and the Contact screen opens Facebook / Instagram / YouTube / TikTok / WhatsApp links externally. The deep-link table also lets a child reach Contact from a notification | Not a payments issue, but an ungated external link-out from a minor's session. We are not opting into the Kids Category so 1.3's parental-gate rule does not formally bind, but this deserves an explicit decision | **MEDIUM** |

### 12.2 Configuration and platform

| # | Blocker | Why it causes a problem | Severity |
|---|---|---|---|
| 14 | **`NSPhotoLibraryUsageDescription` is completely absent.** The app calls the iOS photo library from three live UI paths (parent avatar picker, **student** avatar picker, and the Add-Child / Edit-Child photo tile), but the iOS configuration declares only App Transport Security and the photo-picker's configuration plugin is not registered | **Confirmed hard blocker.** On iOS, touching the Photos framework with no usage-description string terminates the app, and Apple's upload-time static analysis flags it. It is both a crash and an automatic rejection. **Additional detail:** the avatar picker passes `allowsEditing: true`, which forces the legacy `UIImagePickerController` path, and that path reads `PHAsset` — i.e. it definitely touches the Photos framework. **Fix:** add an explicit, specific `NSPhotoLibraryUsageDescription` to the iOS `infoPlist` configuration directly, e.g. *"OlympIQ needs access to your photos so you can choose a profile picture for your account or your child's profile."* **Do this rather than registering the photo-picker's config plugin** — that plugin, added without options, also emits camera and microphone usage strings and adds an Android `RECORD_AUDIO` permission for capabilities this app never uses, which is its own Guideline 5.1.1 exposure | **CRITICAL** |
| 15 | **No privacy policy exists.** There is no privacy or terms page in the web app at all | Both stores require a live privacy policy URL before submission, and Guideline **5.1.4(b)** additionally requires a **children's** privacy policy linked in App Store Connect **and** in-app. It must resolve in Azerbaijani, English and Russian, and must cover: what child data is collected, the child avatar storage question in §8.4, the leaderboard visibility question in §8.4, the infrastructure processors in §8.3, and server log/IP retention | **CRITICAL** |
| 16 | **`ITSAppUsesNonExemptEncryption` is not declared** | App Store Connect will ask the export-compliance question on every single upload, and a mis-click there can block a release. Set it to `false` (justification in §7.4) | **MEDIUM** |
| 17 | **The Face ID usage string is Azerbaijani-only.** No English or Russian localisation of the string is provided | A US reviewer sees Azerbaijani text. Not fatal, but add localised `InfoPlist.strings` for en and ru. Also verify on the generated `Info.plist` that the intended Azerbaijani string actually wins — a second dependency writes a default English Face ID string, and which one survives depends on plugin ordering | **LOW** |
| 18 | **A development-only tunnelling tool sits in production dependencies** instead of dev dependencies | Not bundled into the native binary (nothing imports it), but it is dependency hygiene worth correcting before a store build | **LOW** |
| 19 | *(Android only, for awareness)* **The photo-picker library's own manifest injects `CAMERA`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` permissions** into the merged release build, regardless of the app's own permission list. The app never opens a camera | Play will surface CAMERA in the listing and the Data Safety form will have to justify it. Fix by explicitly blocking those permissions in the Android configuration | **MEDIUM (Android)** |

### 12.3 Account and infrastructure prerequisites

| # | Item | Status |
|---|---|---|
| 20 | Apple Developer Program enrolment (see §6) | **NOT DONE** |
| 21 | iOS signing credentials (certificate, provisioning profile, push key) | **NOT DONE** — no keystore or signing credentials existed at the last build attempt |
| 22 | A **production** backend, built from the canonical database scripts, with production credentials wired into the production build profile — never development credentials | **NOT DONE** |
| 23 | A live Support URL (and, ideally, the `olympiq.ai` domain) | **NOT DONE** — the site is on a Vercel URL |
| 24 | Demo parent + demo child accounts created on production with active access (§11.3) | **NOT DONE** |
| 25 | App Store screenshots for the required iPhone display sizes, containing **no prices and no purchase URLs** | **NOT DONE** |
| 26 | Push infrastructure: the server-side push credential and the push feature flag | **NOT DONE** — push is currently disabled server-side, which is fine for a first submission |

### 12.4 Re-verify on the day of submission
Apple publishes its App Review Guidelines undated and calls them a living document. Before submitting:
- Re-read Guidelines **3.1.1**, **3.1.1(a)**, all of **3.1.3**, **1.3**, **2.3.1**, **5.1.1(v)** and **5.1.4** as served that day.
- Re-read the Google Play Payments policy and confirm the consumption-only language verbatim in a real browser.
- Confirm Azerbaijan still appears in **no** alternative-billing or external-link program.
- **Grep the release bundle** for `4242`, for the buy-CTA string key, for any `AZN` literal, and for any `olympiq.ai` URL. Zero hits, or do not submit.
- Confirm **both** demo logins work on the exact build being submitted.
- Confirm the listing metadata, keywords and screenshots contain no price and no purchase URL.
- Confirm the children's privacy policy link resolves in all three languages.

---

## 13. Glossary — Azerbaijani terms that appear in screenshots

The app's default language is Azerbaijani, so screenshots and any Azerbaijani-language build will show these words. English and Russian are fully supported and a reviewer can switch to English from the login screen.

| Azerbaijani | English | Notes |
|---|---|---|
| **Valideyn** | Parent | The account holder |
| **Şagird** | Student / pupil | Also used in the anonymised public leaderboard as "Şagird XXXX" |
| **Olimpiada** | Olympiad | An academic competition. "Olimpiada hazırlığı" = olympiad preparation |
| **Sual** | Question | "Sual sayı" = number of questions |
| **Fənn** | Subject | e.g. mathematics, physics |
| **Rüb** | School term / quarter | The Azerbaijani school year has four (Rüb 1–4). Question pools are cumulative by term |
| **Sinif** | Grade / class | "5. sinif" = 5th grade |
| **Rayon** | District | An administrative district; used for regional leaderboards |
| **Məktəb** | School | |
| **Riyaziyyat** | Mathematics | |
| **Məntiq** | Logic | |
| **İngilis dili** | English (the language) | |
| **İnformatika** | Informatics / computer science | |
| **Fizika / Kimya / Biologiya** | Physics / Chemistry / Biology | |
| **Təbiət** | Natural science | |
| **Həyat bilgisi** | Life science / social studies | |
| **Elm** | Science | The name of a combined science subject |
| **Raund** | Round | A daily practice round |
| **Reytinq** | Rating / leaderboard | |
| **Abunəlik** | Subscription | Should not appear in a store build in a purchasing context |
| **Ödəniş** | Payment | Should not appear in a store build in a purchasing context |
| **Qiymətlər** | Prices | ⚠️ **Must not appear anywhere in a store build** |
| **Əldə et** | "Get it" | ⚠️ A purchase CTA — **must not appear in a store build** (blocker #7) |
| **Abunə ol** | "Subscribe" | ⚠️ **Must not appear in a store build** |
| **VÖEN** | Tax Identification Number | The Azerbaijani taxpayer id — `6300091352` for this project |
| **AZN / ₼** | Azerbaijani manat | The currency used on the website. ⚠️ **Must not appear anywhere in the app** |
| **Hüquqi ünvan** | Legal address | Shown on the app's About page |

---

## 14. Quick answer sheet

For an assistant that needs the short version:

| Question | Answer |
|---|---|
| Individual or Organization enrolment? | Most likely **Individual** — the published legal identity is a person with a personal tax id. **OWNER MUST CONFIRM** whether a registered company exists and whose name should be the public seller |
| D-U-N-S number needed? | **No**, for Individual enrolment. **Yes**, if the owner chooses Organization |
| Public seller name | The owner's personal legal name (Individual) or the entity's legal name (Organization) |
| App category | **Education**. Not Kids, not Games |
| Kids Category opt-in? | **No** — the obligations are permanent and would foreclose ever adding IAP |
| Age rating | **4+** |
| In-app purchases? | **None**, and none are needed. Purchases happen only on the website, in a browser |
| Does it need Sign in with Apple? | **No** — the app offers no third-party or social login, so Guideline 4.8 is not triggered |
| In-app account deletion? | **Yes**, on the parent profile ("Danger Zone", two-step confirm). The student profile deliberately has none — say so in the review notes |
| Uses IDFA? | **No** |
| Data used to track you? | **None**. No analytics, advertising, attribution or crash SDK exists |
| App Tracking Transparency prompt? | **Not shown and not required** |
| Export compliance | Exempt — standard HTTPS/TLS and OS keychain only. Declare no non-exempt encryption |
| Permissions | Photo library (avatars), notifications (optional), Face ID (optional app lock). Nothing else |
| Content rights | All content is first-party and staff-authored |
| Demo accounts | **Two are mandatory**: a parent email/password **and** a child 8-digit ID + password, both with active access. Children cannot self-register |
| Ready to submit today? | **No.** See §12 |
