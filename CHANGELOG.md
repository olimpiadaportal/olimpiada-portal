# CHANGELOG

Every change that ships, grouped by the **mobile version it rides in** — because
that version is the only thing that maps 1:1 to a store release, and store
release notes are the reason this file exists.

## How to use this file

**Write the entry in the same round as the change, not at release time.** By the
time a build is cut, "what did we fix?" is a git-archaeology exercise and the
user-visible half is exactly what gets forgotten.

Every entry carries a tag that decides where it ends up:

| Tag | Meaning | Goes in store release notes? |
|---|---|---|
| `[store]` | A tester or a parent would notice this | **Yes** — this is the source text |
| `[internal]` | Real work, invisible to a user (schema, refactor, tests, admin panel) | No |
| `[web]` / `[admin]` | Ships to `olympiq.ai` or the admin panel, not the app | No — different deployment |

`web-app/`, `admin-panel/` and `mobile-app/` deploy **independently**. Web and
admin changes are recorded here for the round's history, but they reach users
the moment they are pushed and never wait on a store review.

**When a build is cut:** take every `[store]` line under that version, rewrite
them as user-facing sentences (not commit messages), and produce all three
locales — az / en / ru, 500 characters each. The template and the
purchase-silence rules live in `mobile-app/store-assets/RELEASE_NOTES_v<version>.txt`.
Store copy obeys the same rules as the binary: no price, no Subscribe CTA, no
payment link, no `olympiq.ai` in a purchasing context.

**Bugs found by testers get a `(tester)` marker.** They are the entries most
worth naming in release notes — a tester who sees their own report fixed is a
tester who keeps reporting.

---

## 1.16.0 — unreleased; version assigned, build not yet cut

**Deliberately not filed under 1.15.0.** Build 5 of 1.15.0 was approved by Apple
and released on 2026-09-09, so nothing below is in it — filing these lines there
would put features that build does not contain into the release notes of a
version already on the App Store. Release notes for the lines below:
`mobile-app/store-assets/RELEASE_NOTES_v1.16.0.txt` — written from EVERY
`[store]` line in this section, counted when the build is cut. (There is no
count here on purpose: this section grew from 13 such lines to well over thirty
in one round, and a number in prose beside a list that keeps growing sends a
release-note writer home early.)

- `[store]` The last question of an exam no longer offers TWO submit buttons.
  The Geri / İrəli / Təsdiqlə row was moved below the question scroll so it can
  always be reached; the older Təsdiqlə under the question palette stayed where
  it was and kept rendering on every question, so a student reaching question 25
  was asked to submit twice, in two different button styles, one under the
  other. The pinned row keeps the submit button. The palette block keeps Cancel,
  which is deliberately NOT pinned — cancelling an attempt scores nothing and
  cannot be undone, so it must not sit where a thumb rests. Finishing before the
  last question now goes through the palette: tap the last cell and submit
  there.

- `[store]` Pressing Başla on the topic-test screen without ticking the rules box
  now says what is missing, in Azerbaijani, English and Russian. It used to do
  nothing at all — no message, no highlight — which is the other half of the
  "the button does nothing" report: one cause was the button sitting below the
  fold on a small phone, and that one was fixed, but this one was never about
  the screen size and happened on every device. A missing topic already
  explained itself; the consent tick now does too, in the same place, and the
  tick is outlined in red while it is the thing being asked for.

- `[store]` The "check your inbox" screen shown after signing up now scrolls, and
  its Resend button can no longer be pushed off the screen. The card was
  centred in a column that does not scroll, so once its text was taller than the
  window it was cut off at the top AND the bottom at once — worst on a small
  phone with large system text, and worse still after pressing Resend, because
  the confirmation line that appears sits directly above the button. Resend is
  the only control on that screen and the account cannot be used until the mail
  arrives, so it is now pinned above the system bar with its outcome message
  beside it.

- `[internal]` The exam runner's engine guarantees are now asserted instead of
  spelled. The test that claimed the pinned row "does not disturb the engine it
  sits on" named five guarantees and proved three of them by checking that an
  identifier appeared somewhere in a 1,430-line file — which survives deleting
  the `preventDefault()` in the leave guard, returning `false` from Android
  hardware back, or replacing the countdown tick with a decrement. It is now six
  cases that read the actual handler bodies. Added with it: the double-count
  guard behind the runner's and the setup screen's scroll padding (including the
  spread ORDER, which silently restores the inset it removed), and ConfirmModal's
  in-flight modality — backdrop, Android back and the secondary button are all
  inert while a submit or a cancel is deciding the attempt. Every new guard was
  mutation-tested: 16 deliberate regressions, 16 detected, every file restored
  byte-identically.

- `[internal]` The two-step confirmation on account deletion has a test, and its
  rule has a home. Deleting the account removes the parent, every child and
  every answer they ever gave, with no undo — and the whole two-press rule was
  three expressions inside a button prop, rewritten this round and pinned by
  nothing. It is now `features/profile/deleteAccount.ts`, with two locks rather
  than one: the button can only ever advance from the first prompt, and the
  request itself refuses to send from any step but the final one. Backing out
  returns to closed, never to the second prompt.
- `[store]` Opening the phone editor on the parent profile and pressing Save no
  longer deletes the stored number. The editor opened EMPTY however long a
  number had been on file, and since the phone became optional an empty submit
  means "delete it" — so checking your own number was enough to lose it. The
  editor now opens on the number that is stored and keeps mirroring it until
  something is actually edited, so Save with no change rewrites the same number.
  Clearing the field by hand still removes it: the phone stays optional, which
  is what Apple 5.1.1(v) required. The stored number is split back into country
  + national by libphonenumber-js and the split is verified by recomposing it,
  so a plan whose trunk-prefix rules are wrong can never turn a saved number
  into a different, well-formed one — the whole number stays on screen instead.
- `[store]` A phone number entered in the app is now stored correctly whatever
  country it belongs to. The app used to decide by hand which leading digits a
  country dials before its own numbers and drops when calling internationally —
  and got it wrong twice, silently: an Italian number lost the 0 that is part of
  it (Rome's +39 06 … became +39 6 …), and a St Petersburg number lost the 8 of
  its area code (+7 812 … became +7 12 …). Nothing rejected either one; they are
  well-formed numbers that simply belong to somebody else. Every such decision
  is now made by libphonenumber-js, Google's published numbering data for ~250
  countries. Typing a number the international way with 00 instead of + also
  works now — the keystroke that completed the country code used to be swallowed
  — and a long number written out with spaces no longer loses its last digit to
  the length limit, which counted the spaces.
- `[web]` The website and the app now compose a phone number through the same
  code, so a parent who signs up on `olympiq.ai` and one who signs up in the app
  end up with the identical number on file. They did not: the website still
  carried the old strip-every-leading-zero rule, and it is the surface that
  takes payment. The shared file is byte-identical in both apps and a shared
  input matrix — Azerbaijani, Italian, Russian, Turkish, German, British,
  Hungarian, Lithuanian, Belarusian, Beninese, Sammarinese, Ivorian and North
  American numbers — is asserted row for row by both test suites.
- `[store]` The rank ring on the student home screen reads again in LIGHT mode.
  Its unfilled track had been moved one surface deeper for the neutral dark
  palette and tested only there; the same token is the LIGHTEST surface a light
  palette owns, so on white the track's contrast fell from 1.062:1 to 1.031:1
  and it effectively disappeared. The track is theme-aware now — the deeper
  groove in dark (1.147:1), the palette's own hairline in light (1.275–1.296:1
  on all 27 palettes) — and the ring's brand gradient is untouched.
- `[store]` Renaming a subject in the admin panel now actually renames it,
  and it renames it per language. It used to be a silent no-op: every visible
  subject label came from the apps' own built-in az/en/ru dictionary, which
  beat the single name column in the database, so the save succeeded, the
  audit log recorded it, and the website, the parent tabs and the student
  arena all kept printing the old name in all three languages. Only a
  BRAND-NEW subject fell through to the stored name, which is why creating one
  looked fine and editing one did not. A subject name is content and the
  product is trilingual, so "just read the column" would have traded a broken
  rename for Azerbaijani labels in the English and Russian apps — the names now
  live one per locale in `subject_translations` (migration 171, seeded with
  exactly the strings the dictionary resolved, so nothing moved on day one) and
  the Subjects form has three name fields, az required, en/ru falling back to
  az. Reaches web, admin and mobile.
- `[internal]` The per-locale subject name reaches all ~50 label call sites
  through the i18n layer rather than a new argument: `subjectLabel()` reads
  `subj.db.<code>`, which `getT()`/the root layout dictionary (web) and
  `useT()` (mobile) publish for the current locale. Threading a translation
  through instead would have meant editing every screen and widening several
  `returns table` SQL functions that hand back a flat `subject_name` — a far
  larger change than the defect, and one where a single missed call site
  silently restores the bug. Migration 171 is applied to staging and
  production, 2026-09-10, seeded from the shipped dictionary so nothing moved
  on the day.
- `[web]` The Free Trial screen names subjects in the parent's own language.
  Two lists on `/children/<id>/subscribe` — the picker a parent chooses trial
  subjects from, and the panel listing an active or finished trial — were the
  last parent-facing places printing the raw `subjects.name` column, so an
  English or Russian parent read Azerbaijani subject names there while every
  other screen spoke their language. Migration 171 sharpened that rather than
  causing it: the column is now the frozen bulk-import key, so a rename stopped
  reaching these two lists at all. Both resolve through `subjectLabel()` like
  every other surface, and both are ordered by the name actually on screen,
  compared with the reader's own collation — Azerbaijani sorts q before l and x
  before i, which no default comparator does.
- `[internal]` The two notification producers that build their text inside the
  database — the 3/2/1-day renewal chain (in-app and email; renewals are manual,
  so that chain is the entire retention mechanism) and the 12h/1h/ended
  free-trial chain — read the subject's display name from `subject_translations`
  instead of the frozen `subjects.name`. Without it, the most consequential
  message this platform sends a paying parent would, after any rename, name the
  subject by an internal import key. The renewal chain stays Azerbaijani-only on
  purpose (`profiles.preferred_locale` is unused, and fixing a name must not
  quietly become localizing notifications); the trial chain was already az/en/ru
  from `free_trials.locale`, so its subject names now follow that same locale
  instead of sitting untranslated inside a translated sentence. Migration 172,
  backported into 011, applied to staging and production 2026-09-10.
- `[internal]` Portrait is declared by ONE key: the top-level `orientation`,
  from which Expo derives BOTH `android:screenOrientation` and iOS's
  `UISupportedInterfaceOrientations`. Phones were already locked and still are.
  On iPad the lock is now DECLARED through `requireFullScreen` — the built plist
  is portrait-only for iPad, confirmed by reading Expo's own config output rather
  than assumed — and Apple's TN3192 says the key keeps working until an app is
  built with the iOS 27 SDK, which Expo 54 is not. Whether it then BINDS on real
  hardware is unverified: nobody here owns an iPad to test on, so this is a
  correctly-declared lock, not an observed one. On an ANDROID
  TABLET nothing app-side binds at all: Android 16 ignores the manifest
  attribute AND `setRequestedOrientation()` above sw600dp. Filed `[internal]`,
  not `[store]`: "the app no longer rotates" is only true on phones, so it is
  deliberately absent from the release notes.
- `[internal]` Closed an RLS write hole on `parent_student_links`. `psl_insert`
  and `psl_update` constrained only `parent_profile_id`, never
  `student_profile_id` and never `status` — so one INSERT naming an arbitrary
  student uuid, with `status` set to `active` in the same statement, granted a
  parent full parental authority over another family's child. Not two
  statements as first supposed: nothing revoked the `status` column, so no
  promote step was needed, and tightening `psl_update` alone would have fixed
  nothing. Blast radius was takeover rather than disclosure — `parentOwnsChild`
  accepts an active link as ownership and gates `resetChildPassword` on it,
  while the same link exposes `students.child_unique_id`: both halves of a
  minor's login from one forged row. NOT exploited and not reachable: the FK
  requires a real `students.profile_id`, and an audit of all 199 database
  functions (76 reachable by `authenticated`), every BFF route and every
  PostgREST-readable table found no path that hands a parent a foreign child's
  uuid — `lb_rows` is service-role only and `get_leaderboard` uses the id only
  inside a boolean. Both policies now require the caller to be the child's
  creator. Migration 170, applied to staging and production 2026-09-10;
  production held 48 links and none violated the new predicate. Validation
  check 128 pins it.
- `[store]` The app no longer asks for camera access. Nothing in it ever
  opened the camera — the only picker calls are the photo library — but an
  unused `NSCameraUsageDescription` shipped in the iOS build and the picker
  declared `CAMERA` in its Android manifest, so the permission appeared in the
  phone's App info list and contradicted a privacy policy that said we never ask
  for it. Both are now stripped from the build.
- `[internal]` Removed `android.screenOrientation` from app.json. Expo has no
  such key — it is absent from `@expo/config-types` and no plugin reads it — so
  it was dropped silently at build time while reading to a human like an
  Android lock, hiding the fact that Android tablets have none. A test now pins
  its ABSENCE, next to the keys that do work.
- `[store]` iPad layouts no longer stretch. Every screen was drawn for a
  360-430pt phone; on a 1024pt iPad the same screen spread until buttons sat a
  hand apart and text ran past 90 characters a line. Content now sits in a
  centred column of readable width, with the margins growing instead of the
  content. Phones are untouched - the column only applies above phone width.
- `[internal]` iOS declares tablet support for the first time (`supportsTablet`
  with `requireFullScreen`, which is what makes the portrait lock bind there:
  without it Expo OVERWRITES the iPad orientation list with all four, because
  iPad multitasking support is an App Store validation requirement). That key
  is deprecated as of iPadOS 26 and must be migrated when Expo moves to the iOS
  27 SDK. Consequence for the next submission: the App Store listing now
  REQUIRES iPad screenshots and App Review will test on iPad.
- `[internal]` `CLAUDE.md` and `docs/STORE_PAYMENTS_COMPLIANCE.md` still said the
  mobile apps were purchase-silent and that a dormant IAP path must not be
  pre-built. Both stopped being true when iOS shipped StoreKit, and the first is
  the instruction file an agent reads before touching commerce code - it would
  have read as licence to delete a rail Apple has since approved. The posture is
  now stated per platform: iOS sells, Android stays silent.
- `[internal]` `docs/APP_REVIEW_NOTES.md` carried a fill-in-the-blank device list
  in submission text. It now says to write what was actually tested, and records
  that no Apple hardware was available for 1.15.0, rather than leaving an example
  that could be pasted into a form as a false statement.

- `[store]` Add-Child now tells a parent when the optional Gender answer did not
  get saved. The child is still created — a missing statistic must never cost a
  family their account — but the wizard no longer finishes in silence: it says
  the child was created, the gender was not saved, and that it can be set by
  editing the child's details. In all three languages, and the app and the
  website say it in the same words.
- `[internal]` That answer is written as its own UPDATE after the provisioning
  transaction, and a failure was logged and dropped: the wizard reported
  success, the child existed, and the answer the parent gave became a NULL — the
  value the column defines as "nobody has been asked", which is the one
  distinction migration 169 exists to keep. It cannot move inside the
  transaction: `create_child_account` is security-definer, its 11-argument
  signature is what validation check 66 asserts, and widening it is a migration
  that must reach staging and production before the code deploys — a push ahead
  of it would turn a missing optional field into a dead Add-Child. So the write
  stays outside and stops lying instead. It reads the row back (a PostgREST
  update matching no row is a 204, not an error), returns a warning key on the
  success, and still never logs the value — it is a minor's personal data. The
  mobile Add-Child goes through the same core via `/api/mobile/v1/children` and
  had the identical defect; both are fixed in the one place, and tests fail if
  either surface drops the warning on its way to the parent.
- `[store]` The privacy policy now lists the optional gender a parent may give
  for a child, in Azerbaijani, English and Russian. It says plainly that the
  question can be left unanswered or answered "Prefer not to say", that the
  answer is stored on the child's profile where our own staff can see it like
  the rest of that profile, that we use it for overall statistics about who
  uses the platform, and that it never affects the child's access, the
  questions they are served, their points or their leaderboard position.
  Section 5 previously listed everything stored about a child and did not
  mention it, so the page said something untrue to parents from the moment the
  field started collecting.
  The "last updated" date moves to 08.09.2026; the effective date does not.
- `[internal]` That gender sentence said the answer is used "only for overall
  statistics", and the Accounts export contradicted it: sheet 1 prints each
  named child's gender on their own row, beside their 8-digit login id and
  their parent's email. The column is the owner's and stays; the policy now
  says what happens instead — stored on the profile, staff read it there like
  the rest of the profile, it feeds overall statistics, it decides nothing.
  A test fails if any locale narrows the claim back to statistics alone.
- `[store]` The Gender question in Add-Child now says what the privacy policy
  says. The hint under it stopped at "stored on the profile and used for
  overall statistics", leaving out the part the policy was rewritten to admit:
  authorised staff read the answer per child in the internal account reports
  they export. A parent decides at that hint, not on the policy page, so it now
  names that too — and still promises, in all three languages, that the answer
  changes nothing about the child's access, their tasks or their ranking. The
  app and the website say it in the same words.
- `[internal]` Section 6 of the policy promised the internal account reports are
  built "never to make a decision about an individual child" — the opposite
  overclaim. Sheet 1 of that export is per-named-child and carries each child's
  login and access status precisely so staff CAN act on an individual; that is
  what an account report is for. The promise now covers what it can: the gender
  answer itself decides nothing about a child, which is a promise migration 169
  keeps — no access, content or ranking rule reads the column, and no code does.
  Tests fail if either the hint or section 6 re-narrows.
- `[store]` Parents can now delete one of their children from the app. The
  child's edit screen has a Delete section that asks for confirmation first and
  says plainly what goes with the account: the child's profile, their 8-digit
  login ID and all of their learning results, permanently. The child's sign-in
  stops working the moment it is done, and their uploaded photos are removed
  too. Nothing is deleted without that confirmation, and a deletion that does
  not fully go through now reports an error instead of a false "done".
- `[web]` Deleting a child from the parent dashboard on the website could report
  success when nothing had been deleted — the child was still listed and their
  login still worked. It now either deletes the account for real or shows a
  refusal, and it can no longer act on a child the signed-in parent did not
  create.
- `[web]` A refused delete on the parent dashboard now says why. The refusal
  already existed server-side, but it only ever reached a server log: the page
  re-rendered with the child still listed and no explanation, which looks
  exactly like a mis-clicked confirm. Worse, the confirmation dialog stayed open
  with both of its buttons disabled until the page was reloaded. The dialog now
  closes when it is confirmed, and the reason appears under the child's card in
  the parent's own language.
- `[internal]` That web action ended in
  `admin.auth.admin.deleteUser(id).catch(() => {})`. auth-js RETURNS its errors
  instead of throwing them, so the catch intercepted almost nothing and the only
  report of a failure was the return value being thrown away — the same
  swallowed-deletion bug the parent-account rail was fixed for, and the way a
  working child login ends up outliving the profile it belongs to, which is the
  pairing migration 167 refuses. The work now lives in `deleteChildCore`, shared
  with the mobile BFF: it resolves the login from `profiles` (an FK guarantees
  the row) rather than `child_credentials`, verifies the auth user is really
  gone before touching the child's files, tells "not your child" apart from
  "done", and writes one `parent.child_delete` audit row whether the deletion
  succeeded or was refused.
- `[admin]` The audit log names that new `parent.child_delete` action in all
  three languages and offers it in the action filter, instead of showing a
  cleaned-up copy of the raw code.
- `[store]` Deleting a child whose deletion had already gone through no longer
  answers "this child is not on your account". A child with a long history can
  take longer to delete than the phone waits for: the account is removed, the
  app reports a network error, and the parent presses Delete again. The second
  attempt now recognises that the child is already gone and finishes quietly
  instead of accusing the parent of deleting somebody else's child.
- `[store]` A refused delete no longer shows "Enter your email and password".
  Both danger actions — delete child and delete account — say that the action
  was not confirmed, in all three languages.
- `[internal]` The delete BFF's ownership gate stopped collapsing "no such
  student row" into "not your child": `childOwnershipCore` answers
  owned / absent / otherParent, so the app's deliberate already-deleted path
  can fire while the 403 stays a real refusal for a linked, non-creating
  parent. A student read that FAILS now throws rather than answering "absent" —
  "could not read the row" must never become "the row is gone" — and a
  malformed child id in the path answers the generic delete-failed key, so a
  client bug cannot be mistaken for a completed deletion.
- `[store]` A child inside their one-day free trial is no longer listed as
  “No access” on the parent’s home screen. The trial unlocks the child’s arena
  and their tests, but the first screen a parent lands on still labelled them
  as having none while the child was mid-round. The card now reads “Trial” for
  as long as the trial is actually running.
- `[internal]` The parent Home card’s per-child entitlement read is now gated
  on whether the pill it feeds is on screen, and cached for five minutes like
  the leaderboard summaries beside it. During a giveaway or a free-access
  window the card renders that window’s own pill and never consults it, so the
  RPC was spending one round trip per child on every focus to compute a value
  nothing displayed. The new per-child trial read follows the same gate.
  Post-purchase invalidation is untouched: `useInvalidateParentData()`
  invalidates by key prefix, and query-core treats an invalidated query as
  stale whatever its staleTime, so a bought subject still reaches the pill
  without an app restart.
- `[store]` On smaller phones the Ranking tab’s Subject and District pickers
  cut their last options off behind the phone’s navigation bar, where they
  could be neither scrolled to nor tapped — with Baku’s twelve rayons in the
  district list, the last of them was simply unreachable. The picker now ends
  above the navigation bar and scrolls all the way to its final option, however
  long the list is, and it shows more of the list at once on a short screen.
  The Topic and Subtopic pickers on the test setup screen were not affected —
  they sit in a centred dialog that never reached the navigation bar — but they
  now measure the safe area too, so they cannot start to.
- `[internal]` There are four modal option lists in the app and only two of
  them measured the safe area; the picker Ranking imports padded a flat 24pt,
  which covers a gesture pill and not a 48pt three-button bar. Under the
  edge-to-edge windows Android now enforces, a transparent Modal spans the
  whole screen including that strip, so the rows rendered but their touches
  belonged to the system, and the list was already at its content end. Both
  halves are fixed — `insets.bottom` on the container and a bottom padding on
  the list CONTENT, which is what lets the last row scroll into the clear —
  and `__tests__/select-sheet-insets.test.ts` now scans every Modal+FlatList in
  the source for both, so a fifth copy cannot repeat it.
- `[internal]` That Home gate could not fire on a cold start. The giveaway and
  free-access flags both default to "no window is running" while their queries
  are still loading, so the gate opened the moment the children list landed and
  spent the full per-child round trips before the config arrived to disable
  them — during a giveaway, which is exactly when a parent opens the app. It
  now waits for both window reads to settle, and settles for "failed" too: a
  config that errored is read as "no window" by the card as well, so the reads
  that make the pill true still have to run. The source-level pull-refresh test
  meant to protect that guard matched a substring of the sources array and
  stayed green on an inverted condition; it now parses the array and pins the
  condition itself.
- `[web]` A refused ACCOUNT deletion on the website now says so. The website
  refuses to finish a deletion when any account would survive it — that refusal
  is what stops us telling somebody their account is gone while their login
  still works — but it reached nobody: the confirmation dialog stayed open with
  both of its buttons disabled and the only way out was reloading the page. It
  is the same defect the child delete above had, in the more destructive of the
  two actions. The dialog now closes when it is confirmed and the reason appears
  under the button in the parent's own language; a deletion that does go through
  still signs out and leaves, exactly as before.
- `[web]` A child inside their one-day free trial is no longer listed as “No
  access” on the parent dashboard. This is the same blind spot fixed in the app,
  and it is worse here: the website is where a parent ACTIVATES the trial, so
  the parent most likely to read “Giriş yoxdur” was the one who had started one
  seconds earlier. The pill now reads “Trial” while a trial is running, and
  “Active” for a child who holds a purchase, an admin comp or a school licence —
  grants the subscription column never records. It is computed by the same rules
  as the app's card, so the two cannot disagree, and a failed read falls back to
  the old label rather than inventing access.
- `[store]` Add-Child and the child's edit screen in the app now offer an
  optional “Cinsi” field — Qız, Oğlan, or “Bildirmək istəmirəm”. Nothing is
  preselected, nothing requires it, and leaving it alone is a real answer in
  itself: the account is created exactly as before. It changes nothing about
  what a child can reach, what they are asked or where they rank; it is only
  ever counted in aggregate. A parent who edits a school name later without
  touching the field does not lose an answer they gave earlier.
- `[web]` On the website, “Seçilməyib” in that same field is now the
  placeholder only and not something a parent can pick. It could be chosen back
  after an answer had been saved, and choosing it did nothing: the page said the
  save succeeded and the field returned to the stored answer, because leaving
  the field alone is exactly how “do not change this” is expressed. The app
  never offered that row, so the two now behave the same; a parent who wants to
  take an answer back picks “Bildirmək istəmirəm”.
- `[admin]` The Accounts page has an Export Data button next to the search bar
  that downloads the whole account table as a formatted Excel workbook
  (`OlympIQ_Accounts_Export_<date>_<time>.xlsx`). Sheet 1 is one row per child
  with the parent columns repeated, and a parent who has never added a child is
  still a row rather than being dropped by the join. Sheet 2 is a summary
  computed from the same read, so the two sheets can never disagree. Gender
  shows the migration-169 distinction rather than hiding it: "—" means nobody
  has been asked, "Not specified" means a parent was asked and declined, an
  empty cell means the parent has no children at all, and the summary counts
  the never-asked children as their own line. Every export writes an audit row
  naming who took it and how many rows they took.
- `[admin]` That audit row was best-effort, and the export did not wait for
  it. Writing to the audit log needs the server's service-role key, and
  without one the write was skipped in silence while the file was handed over
  anyway: an administrator could download every family's names and emails and
  every child's 8-digit login id with nothing recording that it happened. The
  export now refuses in that case and says what to fix. A full-PII download
  that leaves no trace is worse than one that fails.
- `[admin]` The Azerbaijani note at the foot of the export's Statistics sheet
  said the per-status breakdowns were below it. They are above it, which is
  what the English and Russian notes already said.
- `[admin]` The Export Data button told a Content Manager who reached the
  export URL that their session had expired and to sign in again. It had not:
  they were signed in and simply may not export accounts, which signing in
  again cannot change. The route refused them with a redirect, and a browser
  follows a redirect, so the button received the login page with a 200 status
  and had no way to tell that refusal from a dead session. The refusal itself
  is unchanged — a Content Manager still gets nothing — but it now arrives as
  a status the button can read, and the message says the export is for
  administrators only. An expired session still says so, and neither message
  mentions anything about what the file holds.
- `[internal]` No OTA update may be published on the 1.15.0 runtime until both
  stores’ data-safety declarations list the child gender field.
  `runtimeVersion: appVersion` reads as a safety rail — a bump means a new
  build, never an update — but while the version does NOT move it is also what
  makes every change here deliverable straight onto 1.15.0 build 5, the binary
  in App Review. That would start asking parents for a minor’s gender on a
  build whose App Privacy and Data safety answers say we collect no such
  thing. The field was already guarded, but only with “before the next
  submission”, and an `eas update` is not a submission. The rule now sits in
  root `CLAUDE.md` beside the OTA advice it has to interrupt, is repeated in
  the two store-posture documents and in the submission preflight, and
  `__tests__/ota-data-safety-freeze.test.ts` fails if it goes missing while
  the version is still 1.15.0 and the field is still collected. It lifts when
  the declarations are updated, or when the version moves.
- `[store]` A parent whose child's Gender answer could not be saved is now
  told so wherever they are in Add-Child, not only on the final card. The app
  showed that notice on the "child created" screen alone, so a parent whose
  free-access grant then failed — which keeps the wizard on the form so the
  grant can be retried — read the grant error and nothing about the answer
  that had been dropped, and only they can put it back by editing the child.
  The website already places the same notice outside the wizard's steps for
  this reason; the app now matches it instead of keeping a second rule.
- `[internal]` The mobile test now pins that placement rather than the old
  "the Done card renders it" wording, which passed just as happily with the
  block nested in the branch that caused the silence. It asserts the render
  sits before the first phase branch opens and appears exactly once, so both
  re-nesting it and leaving a duplicate behind fail. Proven by making each
  mistake and watching the matching assertion fail.
- `[internal]` The store launch pack's commerce section no longer tells App
  Review something untrue. Its reviewer note still read "This app contains no
  purchase functionality of any kind" and described the app as purchase-silent
  for both roles — written when that was the architecture, and false of iOS from
  the moment the 2026-08-31 Guideline 3.1.1 rejection was answered by selling
  subject access through StoreKit. The section now leads with the platform split,
  because the split is the point: iOS sells through Apple In-App Purchase, and
  Android stays purchase-silent because Azerbaijan is in no Google
  alternative-billing or external-link programme and that binary has no billing
  rail to route a purchase through. There are two reviewer notes now, one per
  store, and pasting either into the other console is a misstatement. The file
  keeps its own rule — never submit a note that is untrue of the binary — and
  gains the converse it was missing: never write "access is provisioned outside
  the app" to Apple, which is the sentence that became a written confession to
  3.1.1 the moment a reviewer went looking for one.
- `[internal]` The submission preflight told the owner that the Play optionality
  answer for the child gender type is "users can choose". It must answer
  required: Play asks that question per TYPE, and Personal info > Other info now
  also carries the mandatory grade and school — the field stays optional in the
  product, but the type does not. The same check also implied gender was the only
  declaration still outstanding, which the row-by-row audit disproved: nine
  collected rows are undeclared on forms that are already live and do not wait
  for a release, and the parent phone number moves the other way — required to
  "users can choose", since it became optional on 2026-08-31. Three separate
  checks now, so the one that is overdue cannot hide behind the one that is not.
- `[internal]` A comment in the OTA data-safety freeze test described the
  inventory as "the seven data types". It is ten, and the count is the thing a
  reader would have trusted.
- `[store]` The privacy policy no longer tells parents that a child's
  "location" is something we never collect. It could not be true while the same
  document lists that child's city and rayon two tables earlier, and while the
  store forms declare exactly that as Coarse / Approximate location. Section 5
  now draws the distinction it should always have drawn: the city and the rayon
  are typed by the parent and kept only to group the leaderboards, and the
  device's whereabouts are never asked for — no location permission, no GPS or
  other location sensor, no coordinate stored, and no home-address field
  anywhere. In all three languages, on the website and on the phone.
- `[store]` The parent phone number is no longer listed as required in the
  privacy policy. It stopped being required on 2026-08-31, when the field was
  made optional and removable under Apple Guideline 5.1.1(v); the table went on
  answering "Required? Yes" in all three languages for eight days, in the one
  document a parent would consult to find out. The row now says the field can be
  left blank, a number added later, and a number removed at any time.
- `[internal]` The never-collected list in `docs/PRIVACY_POLICY.md` ended with
  "device identifiers" where the shipped page says "advertising identifiers or
  hardware identifiers". The push token IS a device identifier — it is why the
  Play declaration flips Device or other IDs to yes — and a student session
  registers one too, so the document now matches the page rather than the page
  matching the document.
- `[internal]` Two drift guards in the policy test. The first fails if any
  locale denies location without qualifying it as the DEVICE's, or drops the
  paragraph admitting the city and rayon, or stops naming the three mechanisms
  that are genuinely absent — and it is scoped to `CHILD_FIELDS`, so if the
  platform ever stops collecting a city or a rayon it fails first and says to
  delete itself rather than be edited. The second reads the phone row's
  Required? answer off the table's own optional/required markers and pins it to
  `validateParentRegistration`, so renaming "Xeyr" cannot fail it and
  re-requiring the phone in code cannot pass it.
- `[internal]` The OTA freeze on the 1.15.0 runtime is discharged and REWRITTEN,
  not deleted. Its own terms lifted it — the version left 1.15.0, so an update
  published now can never reach that binary — but the obligation underneath it
  survived the hazard: 1.16.0 CONTAINS the optional child gender field, so
  submitting it before Play Data safety and Apple App Privacy declare that data
  is the same false statement, made to a reviewer instead of inherited by a
  shipped build. The rule in `CLAUDE.md` now reads as a pre-submission blocker
  naming the version it blocks, and `STATUS.md`, `docs/STORE_LISTING_COPY.md`,
  `STORE_LAUNCH_PACK.md` §2 and the release-day preflight say the same thing.
  `__tests__/ota-data-safety-freeze.test.ts` guards the live hazard rather than
  the spent one: it no longer retires on a version bump (that is what would
  have silently retired the duty), and it fails if the blocker goes missing,
  stops naming both consoles, or stops naming the build it blocks.

- `[store]` The privacy policy no longer says the app has no checkout. It said
  "there is no checkout in the mobile app - purchases happen only on the
  website" in three places (the at-a-glance summary, the whole Payments
  section, and the payment-status paragraph), and that stopped being true on
  2026-09-09 when Apple approved the 21 in-app products. It is now stated per
  platform: on iPhone and iPad a purchase goes through the App Store, the
  Android app has no purchase at all, and on the website payment goes through
  the bank's own page. Deliberately flat and non-comparative - the same string
  is compiled into the purchase-silent Android binary, so it names no price, no
  CTA and nothing about one route being better than another.
- `[store]` The policy stopped denying something the store forms declare. It
  said "we never ask for your location", which a reviewer reads beside Apple's
  Coarse Location and Play's Approximate location entries and scores as a
  contradiction. The denial is now the true distinction: we do not read the
  device's location - no permission, no GPS, no coordinates, no home-address
  field anywhere - and what the forms declare is the city and rayon a parent
  picks from a list when adding a child. Nothing about the app changed; the
  sentence did.
- `[store]` Section 5 said the city and district are kept "only to group the
  leaderboards". Two other uses were missing and a reviewer checking the
  location declaration lands on exactly that sentence: they are required to
  create the child's account at all, and the child's own profile screen shows
  them back. The school is named alongside them for the same reason.
- `[store]` The policy told parents that deleting a single child was a website-
  only thing. The app gained that button in 1.16.0, and both the deletion
  section and the rights table now point at it - understating a deletion right
  is a worse error than a stale feature note.
- `[store]` Apple is now listed in the third-party table as what it actually is
  on iOS: the party that runs the transaction. It appeared only as APNs, with
  the status "receives nothing until push is enabled", while every StoreKit
  purchase hands it a per-purchase identifier bound to one child. The table
  also says what Apple does NOT get - no name, no email, no other account data.
- `[internal]` The Payments section now describes what each rail leaves in our
  database: amount, currency, status and the provider's reference for a web
  payment; the purchase-intent identifier, Apple's transaction reference and
  the product code for an App Store purchase. The old bullet described only the
  web rail and read as if it were the whole inventory.
- `[web]` The purchase terms said "all payments are made in Azerbaijani manat"
  and that payments are never refunded, with no scope. Neither governs an App
  Store purchase - the currency is the storefront's and refunds are Apple's to
  grant - so `terms.currency` now scopes the terms to this website and points
  at Apple's own policy for the other route. The `terms.*` prefix is dropped
  from the mobile bundle and no mobile screen links to /terms, so this is a web
  correction and must not be fixed by importing those strings into the app.
- `[internal]` All of the above landed in az, en and ru in the same change, in
  `web-app/src/i18n/messages.ts` (the source the mobile catalogue is generated
  from), in `docs/PRIVACY_POLICY.md` (three standalone language parts) and in
  the policy's Last updated date, now 10.09.2026 in both apps' `privacyPolicy
  .ts`. The effective date does not move - section 13 promises that the Last
  updated date is what an amendment bumps.
- `[admin]` Subscription pricing moved INTO the Subjects screen. The separate
  “Qiymətlər” page is gone from the sidebar; every subject row now carries its
  weekly / monthly / yearly amount as an editable AZN cell, saved one cell at a
  time. `/pricing` redirects to `/manage/subjects` so an old bookmark still
  lands somewhere sensible.
- `[admin]` The subject edit form no longer carries the three price inputs, and
  that is a data-loss fix rather than a layout change. It used to re-post all
  three amounts every time a name was saved, from values read off a page that
  could be minutes old — a rename could silently overwrite somebody else's
  reprice. Prices are now written only by the per-cell action, which posts a
  subject id, an interval and an amount and nothing else.
- `[admin]` A subject's status dropdown can no longer publish an unpriced
  subject. With prices off that form it had become a second route into “Public”
  that skipped the interlock the publish button enforces; it now runs the same
  check and refuses with the same message.
- `[admin]` Adding a subject states, in all three languages, that creating it
  here does NOT create an Apple product: on iOS it cannot be bought until three
  App Store Connect products (weekly, monthly, yearly) exist, are priced and are
  approved, and until then the subject is simply absent from the iOS purchase
  list with no error anywhere. The website and Android are unaffected.
- `[admin]` The Subjects list gained an “iOS-da satılmır” badge beside the
  existing “no price” one, computed from the live `iap_products` map, so the
  same silence is visible per subject rather than only on the create form. A
  subject whose products are all live shows nothing; a subject whose product map
  cannot be read is reported as unknown rather than accused of being missing.
- `[admin]` The hint under the subject name fields now describes what those
  fields actually do: the three names are what a parent or a student reads in
  their own language, and an empty English or Russian field falls back to the
  Azerbaijani one. It used to say the English and Russian names came from the
  apps' built-in dictionaries — which is the behaviour this round removed.
- `[admin]` That hint promised a rename reaches "the website and the app within
  a minute", in all three languages. Only the website half was true: the web
  read is a 60-second cache, but the app's subject-name query has a five-minute
  staleTime and nothing invalidates it, so on a phone the new name lands when
  the app is next opened. The sentence now says both, separately, and the
  reasoning sits next to the 60 in `web-app/src/lib/flags.ts` so the two cannot
  drift apart again.
- `[admin]` A subject edit page left open while somebody else archived the
  subject could silently re-publish it: the form's status was written
  unconditionally over the row the action had just re-read. The status change is
  now refused when the stored status has moved since the page was rendered — the
  rename still saves, and the admin is told in all three languages that the
  status changed under them, rather than having the change dropped in silence.
- `[admin]` The Apple notice on the Subjects screens gave an order nobody could
  follow: its step 2 sent the admin to App Store products, which offers
  published subjects only, before the subject had been published. Rewritten into
  the four steps that actually work, in all three languages. The publish refusal
  also stopped being announced twice by a screen reader, and the three stacked
  hints above the Subjects filter bar are now one line.
- `[admin]` The panel stopped showing two different names for one subject. Once
  a rename moved the visible name into `subject_translations`, only the Subjects
  screen followed it: Curriculum, Questions, the question editor, Olympiads,
  Notifications, Question reports, Free access, App Store products and
  Subscriptions all still selected `subjects.name` and printed it, so a renamed
  subject read one way on one screen and another way on ten. Every one of them
  now resolves the name the same way the Subjects screen does — the admin's own
  language, falling back to Azerbaijani — through one shared helper, and each of
  those lists is sorted by the name it prints instead of by the hidden one.
- `[admin]` The two places where the hidden name IS the subject keep showing it
  and say so: the edit form's import hint, which already names it as the string
  bulk-import files match on, and the importer itself, which stamps that string
  onto every row it accepts. Renaming a subject still does not touch it.
- `[store]` Dark mode is a neutral charcoal instead of a dark blue. The owner
  reported the dark theme reading as dark-BLUE, and it measured that way: every
  surface had a blue channel well above red and green (the app background
  `#0a0e1a` is 10,14,26; the card border `#26314f` is 38,49,79 — blue 30 above
  green). All fifteen dark surface and neutral-ink tokens across the parent app
  and the student arena were replaced with near-greys, plus the cover-photo
  scrim and the dark splash background. Nothing was redesigned: no component,
  no layout, no spacing and no visual hierarchy changed, and the brand accents
  keep their hue — including the blue ones (the `#2f6bff` accent, the arena
  lime/blue/red/gold, and the accent-tinted pill). Neutral describes the
  surfaces, not the brand.
- `[internal]` Each replacement is LUMINANCE-MATCHED to the blue it replaced
  rather than picked by eye, which is what let the hue change without touching
  accessibility: contrast is luminance, so holding luminance holds every ratio.
  No pair moved by more than 0.03 and no WCAG grade changed —
  `__tests__/dark-theme-neutrality.test.ts` re-derives all sixteen ratios plus
  the neutrality invariant, so neither can regress.
- `[internal]` The dark palette is now MOBILE-AUTHORED and deliberately diverges
  from the web, which keeps the frozen blue reference design. Three files
  instructed a future session to re-sync it — the `tokens.ts` header,
  `markdowns/MOBILE_APP_MASTER_PLAN.md` §2 and `mobile-app/CLAUDE.md` — and all
  three now record the override; the test fails if any of them loses it. The
  divergence cannot leak the other way: `web-app/scripts/gen-palettes.mjs` emits
  light tokens only, and nothing under `mobile-app/` reads `globals.css`.
- `[store]` The quietest grey in the student arena no longer carries text you
  have to read. Roughly a dozen small labels — the home screen's stat captions
  and ticker, the ranking screen's streak and rank captions, the context line
  and provisional badge under a name on a leaderboard, an olympiad's question
  count and its "held" status chip, and every section eyebrow — were printed in
  the faintest of the three ink tiers, which on a dark card measures as little
  as 2.56:1 against 4.5:1 for readable text. They now use the middle tier, which
  is legible on every surface. Nothing moved, nothing was restyled, and icons
  are unchanged.
- `[internal]` OWNER DECISION, 2026-09-10, and it is closed: `ARENA_DARK.dim`
  STAYS at `#646463` and is asserted as failing AA on purpose. The measured
  tiers are ink 17.32/16.07/15.10/13.62, muted 5.83/5.41/5.08/4.59 and dim
  3.25/3.01/2.83/2.56 on bg/bg2/panel/panel2. The hue pass did not cause the
  miss — the blue it replaced measured the identical 2.83 — and the usual remedy
  does not exist: "lighten it to about `#858585`" is quoted off `panel` and
  measures 4.10 on `panel2`, and the first grey clearing AA on all four surfaces
  is `#8c8c8c`, three code points from muted's `#8f8d8d`. An AA-compliant `dim`
  IS `muted`, so the third tier cannot exist at AA and "fixing" it would delete
  the hierarchy rather than flatten it. The debt is paid on the other side
  instead: the readable strings move to `muted` (the `[store]` line above) and
  `dim` is icons, hairlines and decoration only — though that sweep did NOT
  finish in this round, which is what the two entries below are about. Stated in
  the token's own doc comment, on the token line, and pinned by
  `__tests__/dark-theme-neutrality.test.ts`, which walks the greys to `#8c8c8c`
  so the refusal arrives with its proof. `BoardList`'s `dim` prop is gone rather
  than re-pointed: both of its consumers were text, and the parent leaderboard
  had already been aliasing it to `muted`.
- `[store]` The rest of the faint text in the exam screens is readable now. The
  pass above moved the labels it knew about and left seventeen behind: the topic
  picker's placeholder, its note and its "no results" line, the report-a-problem
  box's placeholder and character counter, the question number on the exam and
  review cards, the saving/saved note, the counts on the review tabs, the
  answer-key legend, and the daily card's meta lines and attempt dates. Two were
  worse than anything else in the app — the "skipped" chip printed its label in
  the same faint grey it is tinted with, and the letter on a finished subject
  card was faded twice over, once by the colour and again by the card's fade.
  All seventeen use the readable middle tier now. Icons are untouched, and a
  finished card still fades exactly as it did.
- `[internal]` The confinement that makes the `dim` decision defensible is a
  TEST now rather than a sentence. `tokens.ts`, `STATUS.md` and
  `__tests__/dark-theme-neutrality.test.ts` (twice) all said the move to `muted`
  was complete while SEVENTEEN readable-text sites were still on `dim`. Two of
  them were worse than the 2.56 worst case the decision was weighed against:
  `StatusPill` tone `"off"` painted its 12pt label in the same `dim` it grounds
  itself in — 2.51:1 on `panel`, 2.26:1 on `panel2` — and the done-card monogram
  took `dim` at 0.55 opacity over that tint, 1.63:1. They measure 4.50:1 and
  5.16:1 now; the pill's tint and the badge's ground keep `dim`, because the
  ground and the label are two different reads. The test sweeps the SOURCE and
  fails on `dim` reaching a `color` prop on a non-icon, a `placeholderTextColor`
  or a `color:` style — directly or through a local alias, which is the arm that
  matters, since both of the worst two hid behind
  `const accent = done ? arena.dim : …` and a regex looking beside `<AppText>`
  would have missed them. Icons are allowlisted from each file's
  `lucide-react-native` imports. The sweep carries its own fixture so it cannot
  rot into a no-op, and it was mutation-tested on the real files: five
  reintroductions each failed with the exact `file:line prop`, an icon keeping
  `dim` did not, and every file was restored byte-identically.
- `[store]` The accent pill in dark mode is a tint again, not a navy block. The
  charcoal pass flattened every surface around it and left the pill's own
  background at the old blue palette's full strength, so the active tab pill and
  every accent chip read as a foreign block dropped onto a grey app. Its
  background keeps the accent hue at a fraction of the strength — the same
  whisper the light theme already used — and the label on it is unchanged.
- `[store]` The rank ring on the student home screen shows its unfilled portion
  again. The ring's track was told apart from the card behind it mostly by
  colour; once both went grey, the two were almost the same shade and the ring
  looked like a floating arc. The track is now a step darker.
- `[internal]` Root cause of both, and the reason they were missed: the neutral
  pass sorted every token into two boxes, neutral or brand accent, and the
  palette has three roles. `pillBg` is a TINTED SURFACE — accent hue at surface
  strength — and filing it as an accent exempted it from the sweep entirely. It
  went `#182447` -> `#232532`: CIELAB chroma 24.7 -> 9.2 (its neighbours sit at
  <= 1.4, its own ink at 34.8, the light-mode pill at 7.6), hue held at 287, and
  L*ab held at 15.01 so relative luminance moved 1.3e-6. Contrast is luminance:
  `pillText` on `pillBg` is 8.2899:1 -> 8.2900:1 and the tab bar's accent ink on
  it is 3.3772:1 -> 3.3773:1. Across every pair in both dark palettes, nothing
  falls further than 2e-5 — four decimal places under the 0.0082 worst case the
  hue pass itself recorded.
- `[internal]` A full sweep of the remaining chroma found no other missed
  neutral: the fourteen surfaces and neutral inks all measure C*ab <= 1.4, and
  the ten brand accents all measure >= 30 with nothing in between except the one
  pill. `__tests__/dark-theme-neutrality.test.ts` now enforces the three tiers as
  a budget with walls on both sides — a neutral that regains saturation fails, a
  brand accent that gets desaturated fails, and the tinted pill fails if it
  reaches ink strength OR is flattened to grey.
- `[internal]` The home ring's track moved `arena.bg2` -> `arena.bg`: 1.064:1
  (3.02 L*ab, dE00 1.88 — the weakest pair the palette ships, at the
  discrimination threshold for a 9px arc) to 1.147:1 (6.87 L*ab, dE00 4.22). It
  goes DOWN rather than up on purpose: the brand gradient is painted on the
  track, and its purple stop measures 3.38:1 over `bg` but only 2.26:1 over the
  lighter `line`, so buying separation upward would cost the ring its main read.
  The test pins that trade so a later "make it more visible" pass fails here.
- `[store]` (tester) The phone number no longer disappears from the sign-up
  form. A parent typed it, moved on to the password, and came back to an empty
  field — on both platforms. The number is now held by the form itself rather
  than by the phone box, so nothing can reset it, and the box refuses any change
  that would wipe a number it was not watching the parent delete. The same field
  on the parent profile is fixed by the same change, and clearing the number on
  purpose still works — it is an optional field and has to stay one.
- `[store]` Signing in and signing up now work with the phone's own password
  manager. Registration offers to SAVE the password a parent has just chosen and
  login offers to FILL the one they already have; the same field used to be
  described to both platforms as an existing password, so neither screen ever
  offered to remember anything. Names, e-mail and the phone number fill from the
  phone's own contact card, and a number pasted in full international form now
  moves the country flag instead of being doubled onto the dial code. The
  STUDENT sign-in deliberately offers nothing: an 8-digit child ID is not a
  username, and the password behind it belongs to the parent.
- `[internal]` The two halves of the phone fix are constructions, not a
  diagnosis, because the cause cannot be observed from here. Six candidates were
  eliminated with file:line evidence and the survivor was platform autofill,
  which writes into UNFOCUSED inputs when a dataset is picked in a sibling
  field. So: (1) `PhoneField` is controlled and its value is owned by the
  screen, which a remount cannot reach; (2) `applyPhoneEdit` refuses any pass
  that would leave a field that HAD digits with none, unless the input actually
  held focus and the text really arrived empty. RN restores the refused text for
  free — `TextInput._onChange` always bumps two useState values, so the input
  re-renders and its layout effect pushes `props.value` back to the native view
  — but only while the value is CONTROLLED, which is why neither half works
  alone.
- `[internal]` Autofill is now DECLARED on every credential field rather than
  left to platform heuristics, which is what let a service believe it might
  rewrite the phone row in the first place. `PasswordField` takes a `purpose` of
  new / current / none, defaulting to none so a field that forgets to answer
  stays out of every credential store. The spellings are the cross-platform ones
  RN maps itself — `new-password`, never the Android-only `password-new`, which
  produces nothing at all on iOS — and the compiler checks them against RN's own
  union rather than anyone's memory. The phone asks for `tel-national`, which is
  what that input actually holds. iOS strong-password rules are pinned to
  `checkNewPassword` and spell their symbol set out rather than using Apple's
  `special` class, which includes the space our policy rejects. 39 new jest
  assertions cover the refusal, the controlled value and every field's hints.
- `[web]` Subject lists are ordered by the name the reader actually sees, in
  the reader's own alphabet. Every list resolved its labels through
  `subjectLabel()` and then SORTED on `subjects.name` — the column migration
  171 froze as the bulk-import match key. The two agreed only because 171
  seeded the translations from those same strings, so the order looked right
  until the first rename and then stayed put while the labels moved. The same
  column also holds one Azerbaijani string for every reader, so an English or
  Russian parent got an order derived from a name they never see. Fixed at the
  Add-Child subject picker, the `/services` and `/register` configurator, both
  leaderboard subject pickers, the parent analytics tabs and the public
  `/subjects` catalogue. `lib/pricing.ts` deliberately does NOT sort by label:
  its cache has no locale in the key and serves anonymous visitors, so it
  orders arbitrarily (by id) and the configurator — which knows the reader's
  language — orders what it renders.
- `[store]` The same reordering reaches the app: the public subjects screen,
  both leaderboard subject pickers and the parent analytics subject tabs.
- `[internal]` Collation is keyed on the ACTIVE locale, not a hard-coded "az".
  Four sites compared resolved labels with a bare `localeCompare()` — the
  runtime's default collation — and two of them carried comments claiming they
  had solved exactly that problem. Azerbaijani is not accented Latin: q sorts
  before l and x before i, so a list ordered for an az reader is wrong for a ru
  one and vice versa. `sortSubjectsByLabel()` / `subjectComparator()` now live
  in `lib/subjectLabel.ts` (byte-identical in both apps, as its twin test
  requires), use full BCP-47 tags — `az-Latn-AZ`, never a bare `az` that
  resolves to CLDR root where the data is missing, the same trap behind the
  old "2026 M08 22" date bug — and fall back twice rather than throwing, since
  Hermes builds Intl from the operating system. The subscribe screen's
  hand-rolled collator was folded onto the shared one.
- `[store]` Three more lists that the sweep above missed. The manage-subjects
  checkboxes — the screen a parent adds or drops a subject from — were ordered
  by `subjects.name` in the runtime's default collation while every row printed
  the translated label. The order now comes from the label, in the reader's
  alphabet, and it is decided by the screen rather than by the fetch: the
  cached read has no locale in its key, so an order chosen there would have
  frozen at whatever language the app was in when it first loaded and survived
  every later switch. It sorts by id instead — arbitrary, stable, and labelled
  as such.
- `[internal]` The iOS purchase sheet groups its offers by product identity, and
  now genuinely does. Its comment already said the grouping was deliberately
  locale-INDEPENDENT so the three intervals of a subject stay adjacent — but it
  delivered that with a bare `localeCompare()`, whose collation follows the
  DEVICE locale on Hermes, so it was neither stable nor display-ordered and two
  phones could disagree. It is a plain code-point comparison now, with the
  subject id breaking ties so subjects sharing a name (or carrying none) cannot
  interleave their week/month/year rows.
- `[admin]` The olympiad question pool's grade filter and both of its bulk
  dialogs order grades for the reader. The filter collated in the server's
  default locale; the delete and archive confirmations used a bare `.sort()`,
  i.e. UTF-16 code units, which listed the grades as 10, 11, 3 — in the one
  list an admin is asked to read carefully before agreeing to destroy
  questions. All three share one collator built from the admin's locale, now a
  required prop, and the AI prompt block orders curriculum topics in `az`,
  matching the language those names are written in.
- `[internal]` The sweeps that missed the five sites above are widened so they
  cannot miss the next one. They matched `label.localeCompare(` literally, so
  `a.name.localeCompare(b.name)` and `(a.subjectName ?? "").localeCompare(…)`
  both slipped through the test written to catch them; they now flag ANY
  locale-less `localeCompare` in web-app, admin-panel and mobile-app, strip
  comments instead of exempting whole files (three of them quote the
  anti-pattern while explaining it), and the admin sweep carries a short,
  reasoned list of the sorts that compare machine keys rather than labels.
- `[internal]` A subject with a blank `name` column but good translations no
  longer renders nameless. Five screens guarded on the RAW column before
  resolving — `subjects?.name ? subjectLabel(…) : ""` — which rejected the row
  before the resolver could find the translation that would have named it, in
  all three languages at once. They guard on the resolved label now, through
  `subjectLabelOrNull()`. Both defect shapes are swept repo-wide by test rather
  than pinned per file: each is the obvious thing to write, each typechecks,
  and each looks fine until a subject is renamed or the reader is not
  Azerbaijani.
- `[store]` (tester) Back goes where you came from. Anywhere a screen led on
  to one of the bottom tabs — tapping a notification in the inbox, leaving a
  test result or the answer review, finishing the add-child wizard — back landed
  on Home/Arena instead, and a SECOND press was what finally reached the screen
  the tester had come from. It now returns to the screen, and to the TAB, that
  was actually open: a parent who opened News from Analytics goes back to
  Analytics, and a child who left the test chain onto Olympiads goes back to
  Tests. The on-screen back arrow, the Android back button and the iOS swipe all
  agree, and the app still exits on a back press from a tab rather than cycling.
- `[internal]` The cause was one rule the app did not have: a tab route must
  never be pushed or replaced. Both role groups are Stacks anchored on their
  `(tabs)` navigator, so a push()/replace() carrying a tab path from a screen
  stacked above it diverges at the GROUP STACK and mounts a SECOND copy of the
  tab navigator rather than switching a tab (replace mints a new key, so the
  original stays underneath). GO_BACK travels from the deepest FOCUSED
  navigator upward, so it then reaches that duplicate first, and React
  Navigation's default backBehavior ("firstRoute") does not decline it — it
  jumps to the first tab. Because the duplicate lives in navigation STATE, the
  on-screen back bar, Android hardware back and the iOS swipe all broke
  together, which is why the fix is one rule and not one handler. `goToTab()`
  pops back to the tab navigator already mounted (POP_TO, via `dismissTo`) and
  `backOrTo()` is the single home for "go back, or to the parent route if there
  is no history"; `<TabRedirect>` is the same fix for the guard redirects.
  Deliberately unchanged: login/logout/role redirects still replace the whole
  group (you must not be able to swipe back into a signed-out session), the
  onboarding still replaces itself, and submitting an attempt still replaces
  the runner with the result.
- `[store]` (tester) On small phones the "I've read and understood the rules"
  tick and the Start button under it could not be reached. Before a topic test
  they were the last things on a page three screenfuls long, so a child had to
  scroll past every rule to find the button they were looking for first — and
  it landed in the bottom strip of the screen, where a phone's own navigation
  gestures live. In the daily exam's rules dialog it was worse: on a short
  screen, or on any phone with the system font size raised, the tick scrolled
  out of sight inside the dialog while the Start button stayed visible and
  greyed out, with nothing on screen to say why it did nothing. Both screens now
  keep the tick and the button together in a row that stays on screen while the
  rules scroll above it, always clear of the navigation bar and the home
  indicator. Nothing moves on a large phone, where everything already fitted.
- `[store]` (tester) The exam dialogs no longer reach behind the phone's
  navigation bar. The confirm dialogs that end an exam — submit, cancel, leave —
  had no height limit at all, so a long Azerbaijani or Russian message on a
  short screen simply grew the box until its two buttons were off the bottom of
  the display, with no way to scroll to them. Every dialog in the test screens
  now ends above the system bars and scrolls its own text instead of pushing its
  buttons away.
- `[internal]` One shared contract replaces four hand-rolled footers, because
  four is how many copies of the modal option list drifted apart last week. An
  action area is now a NON-SCROLLING sibling below a `flex: 1` body
  (`components/ActionArea.tsx` + the pure `components/actionAreaLayout.ts`), so
  the space it needs is reserved structurally rather than by a bottom padding
  somebody has to keep in sync with a bar whose height changes with the locale
  and the font scale — mobile-app/CLAUDE.md's "no hardcoded widths/heights for
  layout", applied to the one place the repo kept re-deriving it. All four
  bodies take an `actions` prop (`Screen`, `ScreenScroll`, `ArenaScroll` and the
  test setup page), and the safe-area inset is handed to whichever element
  actually touches the window edge, so body and bar can never both count it. The
  keyboard lift is measured on the outer shell rather than on the scroll body on
  purpose: taking it from the body is a feedback loop — lift the bar, the body
  shrinks, the body no longer overlaps the keyboard, the bar drops.
- `[internal]` The three arena dialogs were written three times over and all
  three carried the same two defects: not one measured a safe-area inset, and
  the clamp was `maxHeight: "85%"` of the WHOLE window. A transparent RN Modal
  is its own native window and under Android's edge-to-edge windows it spans the
  navigation bar too — the mechanism the Ranking picker was fixed for — so 85%
  centred leaves 7.5% of the window under the card, which on a 640pt phone is a
  48pt three-button bar exactly. `features/tests/ArenaDialog.tsx` is now the only
  place a dialog window is opened: insets on the backdrop, a flex clamp instead
  of a percentage, a scrolling body and a fixed action row. And the rule that
  produced the report is stated as a rule — anything the primary action DEPENDS
  ON belongs with the action, never on the far side of a scroll boundary.
  `__tests__/action-area-reachability.test.ts` pins all of it, including that
  the consent tick is inside the action region and appears exactly once, and
  that a fixed height cannot come back into the shared bar.
- `[store]` (tester) A long question can no longer push the exam's own buttons
  off the screen. Geri / İrəli / Təsdiqlə sat at the very end of the question —
  under its text, its figure, five answer options and the question map — so on a
  short phone, or with the system font size raised, a long question put SUBMIT
  below the bottom edge and a student who had answered everything could not
  finish the attempt. The three buttons now stay in a row of their own at the
  bottom of the exam screen while the question scrolls above them, always clear
  of the navigation bar. Nothing about the exam itself changed: the timer, the
  automatic answer saving, the "are you sure" confirmation and the leave warning
  all behave exactly as before, and "Cancel the attempt" deliberately stays at
  the end of the page rather than under a resting thumb.
- `[store]` The account-deletion confirmation now fits on every phone. Its
  buttons had no safe-area padding at all, so on an Android phone with the
  three-button navigation bar the lower part of "Sil" and "Ləğv et" sat behind
  the system bar; and with the system font size raised, the confirmation
  paragraph plus an error message grew the panel until the buttons left the
  screen entirely, with nothing to scroll. The text now scrolls and the two
  buttons stay put, above the navigation bar. This is the most destructive
  action in the app, and it was the one screen with none of these protections.
- `[store]` A long maintenance or update message can no longer hide the button
  that gets you out of it. Those screens print a message written in the admin
  panel, with no length limit, and they replace the whole app — there is no back
  and no tabs, so the single button is the only control that exists. The message
  now scrolls and the button is pinned below it.
- `[internal]` The shared action bar is now capped against ITSELF, which is the
  hole the previous round left. `flexShrink: 0` says the body cannot squeeze the
  bar; nothing in that said the bar cannot outgrow the window, and at the 1.3x
  font scale `AppText` allows, a bar carrying a wrapped consent line, a warning
  and an error above its button does. Its CONTENT is now capped at half the
  space the bar actually has and scrolls inside that — the content and not the
  padded box, or the same padding that lifts the bar over an open keyboard would
  eat the whole allowance and leave the buttons no height. The ceiling is
  computed from the measured window minus any keyboard overlap
  (`actionAreaMaxHeight`), never from a device constant, and returns "no cap" —
  never zero — for a measurement that has not landed. The exam runner, the
  account-deletion sheet (`components/SheetDialog.tsx`, the parent-side twin of
  `ArenaDialog`) and the boot screens all moved onto the contract in the same
  change, and the test now also pins that a body applies the same tablet gutter
  its bar does: the two test-chain screens imported neither, so above 560pt the
  buttons would have sat in a centred column while the content spanned the slab.

- `[internal]` Second half of that fix, and the reason the first was necessary
  but not sufficient. Removing the duplicate tab navigator removed the
  SWALLOWER; the navigator that remained still answered the press with React
  Navigation's default `backBehavior: "firstRoute"`
  — "go to routes[0]", which is `home` in both the parent and the student group
  — so the symptom the report was about survived the fix. Both `<Tabs>` now
  declare `backBehavior="history"`: a parent who opened News from Analytics goes
  back to Analytics, and a child who left the test chain onto Olympiads goes
  back to Tests. It also still EXITS correctly, which is why `history` was
  chosen over `fullHistory`: it de-duplicates, so the tab history holds one
  entry per tab, bottoms out, and hands the press up to the Stack and then to
  Android — no cycling, and a deep-linked tab bubbles on the first press rather
  than inventing a Home the user never visited. Three duplicate-minting call
  sites were closed with the same rule one level up, on the root stack: an
  allowlisted `/login`, `/register`, `/child-login` or `/` opened while signed
  in now resolves to the session's own home instead of a public auth screen the
  guard has to bounce (the bounce was a `replace`, which minted a SECOND copy of
  the whole parent/student group); that guard uses `<GroupRedirect>` regardless;
  and the post-registration back button pops to the Login already in the stack
  instead of adding a second one. The login and logout resets are untouched and
  pinned — `popToOrReplace` still collapses the whole public group when the
  target group is not on the stack, so a signed-out screen holding a child's
  data can never be swiped back into. `__tests__/back-to-parent-menu.test.ts`
  drives the real `@react-navigation/routers` TabRouter with the tab names and
  the `backBehavior` read out of the layout files, so changing either layout
  fails with the destination that choice actually produces.

- `[store]` The last reachable way to end up with two tab bars is closed. From
  a child or parent account, opening Profile and then an information page (FAQ,
  About, Contact) and then tapping a notification or a link that leads to one of
  the bottom tabs mounted the whole tab bar a SECOND time: the tab changed, but
  back went to Profile instead of leaving the app, and everything underneath was
  still open. It now lands on the tab with nothing stacked behind it, exactly as
  it does from anywhere else in the app.
- `[internal]` Why that one path outlived the round that fixed the rest. It
  needs two things at once — a secondary screen above `(tabs)` AND a `(public)`
  screen above the whole group on the ROOT stack — and in that state
  `dismissTo()` is dispatched at the ROOT, not at the group Stack: it drops
  `(public)`, keeps the group route and hands it nested
  `{ screen: "(tabs)", params: { screen: "<tab>" } }` params. The group Stack is
  told nothing and is still showing `profile`, so React Navigation DERIVES a
  `NAVIGATE { name: "(tabs)" }` from those params — and StackRouter answers
  NAVIGATE by PUSHING anything that is not already on top. That derived action
  is the library's to build, and no `router.*` call can address the group Stack
  while a foreign group holds focus (an untargeted POP never reaches it; a
  targeted one only lands where the divergence put it). StackRouter does read
  one flag off the group route's own params, `pop`, which makes NAVIGATE pop
  back to an existing route instead of pushing — so the root layout seeds
  `GROUP_ENTRY_PARAMS` (`{ pop: true }`, declared beside the rule in
  `lib/navigation.ts`) onto `(parent)` and `(student)` via `initialParams`. One
  dispatch, one tab navigator, the stale screen popped. The flag reaches nothing
  else: only root-level entries into a group carry it, PUSH ignores it, and a
  navigation that starts inside the group never rewrites those params.
  `__tests__/back-to-parent-menu.test.ts` now drives the real
  `@react-navigation/routers` StackRouter through the whole sequence, with the
  route names read out of the layout files and the seed read out of RootGate —
  remove either and it fails with the state the router actually produces,
  `["(tabs)", "profile", "(tabs)"]` and a back press that lands on `profile`.
  The login and logout resets are re-pinned in the same file.
- `[store]` Tapping a notification for the screen you are already reading no
  longer does nothing-but-something: it used to open a second identical copy of
  that screen, so nothing appeared to change and the next back press looked
  dead — it was only closing the duplicate. The same link now leaves you where
  you are. A deferred link that sends a signed-out user to the login screen
  behaves the same way instead of stacking a second login.
- `[internal]` `openTarget()` takes the current path (`usePathname()`) as a
  REQUIRED argument and skips a non-tab target that is already on top; tab
  targets keep going through `goToTab()`, whose POP_TO cannot duplicate. The
  comparison ignores `(group)` segments, which never appear in a URL, so the
  allowlist's `/(parent)/notifications` matches the pathname's
  `/notifications`. RootGate's deferred-link branch moved from `push()` to
  `popToOrReplace()`. Also corrected the student tab layout's `backBehavior`
  comment, which described a router that does not exist in React Navigation 7
  and a route removal that `href: null` does not perform — it is a tab-bar
  change (`tabBarButton: () => null`), and the screen stays in `routeNames` and
  stays deep-linkable.
- `[store]` One account's data can no longer follow another onto the same
  phone. If a parent's session ended on its own — a revoked token, a refresh
  that failed — rather than through the Log out button, the app kept the cached
  screens and any half-finished exam answers, and the next child to sign in
  could be shown them. The family device is the normal case for this product,
  so the sign-out the app performs FOR you now tears the same account state
  down, and signing in starts from a clean slate either way. One thing it
  deliberately cannot match: the Log out button also de-registers the push
  token, and that delete runs under an own-row policy needing a still-valid
  session, which by definition is gone on the involuntary path. The row is left
  for the server to invalidate the next time it is used; the app-icon badge,
  which needs no session, is cleared on both paths.
- `[internal]` Restored signed-in coverage for the four deep-link auth rules
  that gained `roleTargets`. The only assertion exercising a signed-in role was
  replaced by the signed-out case in the same round the behaviour was added, so
  the fix that stops a second tab navigator being mounted was covered by
  nothing. Both directions are asserted now, and the indentation of those four
  properties was corrected to match their siblings.
- `[internal]` The teardown is one function
  (`features/auth/sessionTeardown.ts`) called by BOTH the `signOut()` action and
  the `onAuthStateChange("SIGNED_OUT")` handler — the drift between two
  hand-written copies was the defect, so the fix is that there is only one copy.
  A third function resets on sign-IN, for the session that ends with no teardown
  at all (the OS kills the app). Underneath both: every query key carrying
  account data now ends in an account-scope marker
  (`features/auth/accountScope.ts`), so a stale entry is UNREACHABLE from another
  profile even if a teardown were missed, and the sign-in reset selects entries
  by that marker instead of by a list that would go stale. World-readable
  catalogue reads stay unscoped on purpose — including the config RootGate gates
  the tree on, which is why sign-in does not simply clear everything. Screens
  that used to keep a second, unscoped copy of the children list
  (parent analytics, the child edit screen) now share the one scoped key.
  Pinned by `__tests__/session-teardown.test.ts`.

- `[web]` `[admin]` `[internal]` **Stopped Sentry swallowing the incidents it
  was bought for.** The previous rounds over-corrected on noise, and four of the
  controls were discarding signal rather than volume.

  *The server no longer ignores a failed connection.* `ignoreErrors` was ONE
  list shared by browser, server and edge, and it contained every transport
  shape — so a Supabase outage, or a Supabase URL broken by the deploy that just
  went out, produced ZERO events in both Next apps. The lists are now split by
  runtime: a dropped request in a tab is a user's wifi and is still dropped; the
  identical text out of a Route Handler, a Server Action or middleware is an
  incident and is REPORTED. It stays affordable because `beforeSend` collapses
  the whole class onto one fingerprint (`server-transport-failure`), so an
  outage throwing a thousand times an hour is one issue costing the per-issue
  allowance — three or four events — instead of one per request.

  *The budget no longer drops novel faults.* The global per-hour check ran
  before the per-issue check, so during a busy hour the FIRST occurrence of a
  never-before-seen fingerprint was discarded to protect budget an
  already-reported fault had spent. The order is inverted and a small reserve
  (`novelPerHour` / `novelPerDay`) is held back for fingerprints unseen in the
  last hour. A repeat offender can never reach it. Worst case stays arithmetic:
  24/hour and 70/day per web server process, 13/hour and 36/day in the admin
  panel, against this repo's slice of the org-wide 5,000/month.

  *The admin panel stopped paying twice.* It applied a 0.25 `sampleRate` AND the
  budget — and `sampleRate` runs AFTER `beforeSend`, so the budget was charged
  for events the sampler then threw away, while a one-off admin error had a 75%
  chance of vanishing. The sampler is gone; the budget (deterministic, keeps the
  first occurrence) is the one mechanism, and the panel's smaller share of the
  quota lives in its smaller budget numbers.

  *Client render crashes are visible.* `web-app/src/app/error.tsx` — the root
  SEGMENT boundary, which is what actually catches a React render crash on every
  page — reported nothing. `global-error.tsx` never fires for that case; it only
  catches a failure in the root layout. It now captures, skipping errors that
  carry a `digest` so a server-side crash is not filed twice.
  `admin-panel/src/app/error.tsx` had the identical hole and was closed in the
  same round — its root boundary reported while its segment boundary did not,
  which reads like coverage and is not.

  *The login and register funnel is instrumented again.* Removing the browser
  SDK from public pages saved 161.7 KB but also blinded the most expensive path
  on the site: a hydration crash or a thrown submit handler never reaches the
  Server Action, so nothing server-side sees it, and the parent who could not
  register closes the tab. The split is now marketing vs everything else.
  Measured off a real build, the cost of adding those paths is zero before
  hydration — the SDK is one async chunk (365.7 KB raw / 121.7 KB gzip / 102.6
  KB brotli) that appears in no route's First Load JS.

  *And two smaller ones.* `BrowserSession` is removed in both Next apps: it sent
  a session envelope on every healthy page load, which spends quota and is not
  the "error reports" the new trilingual privacy row describes. `frameContextLines`
  was 0 in web-app and 5 in admin-panel, undecided; it is 0 in both — the frame
  points into the built bundle, where a line is thousands of characters of
  minified modules, and the Sentry UI shows real source from the uploaded maps.

  Pinned by `web-app/src/lib/__tests__/sentryBudget.test.ts`,
  `admin-panel/src/lib/sentry/__tests__/serverTransport.test.ts` (node
  environment, because the branch keys off `typeof window`) and the two contract
  suites: an outage produces events, a novel fingerprint survives a spent
  budget, a repeat offender is throttled.

- `[admin]` `[internal]` Closed three Sentry PII leaks found by driving real
  events through each app's own `beforeSend`. The worst was the Postgres row
  DETAIL — `Key (…)=(…)` and `Failing row contains (…)`, which carry a child's
  first name, last name, 8-digit login id, city, rayon, gender and grade in one
  string. web-app already wiped it; `admin-panel/src/lib/sentry/scrub.ts` and
  `mobile-app/src/lib/sentryScrub.ts` did not, and both now run the same two
  rules FIRST, so all three apps produce identical output for that shape. The
  admin panel is the worst case (staff read real family data, the Accounts
  export builds a spreadsheet of exactly those columns, bulk import throws on
  row content); the mobile app matters because `src/lib/supabase.ts` talks to
  PostgREST directly, so that text reaches an exception value — the issue title
  — on a child's device.

  Also: the admin scrubber gained the key-name denylist web-app has, because a
  name, a school and a city are ordinary words no pattern can find — only the
  KEY they arrive under identifies them, and without it `contexts.device.name`
  and tags keyed `child_name`/`school`/`gender` walked straight through. And
  the mobile breadcrumb scrubber now RECURSES (depth-bounded, so a cyclic
  object cannot hang `beforeSend`) instead of copying every nested object
  through untouched.

- `[web]` `[admin]` DOM breadcrumbs off in both Next apps. The default
  `Breadcrumbs` integration runs with `dom: true`, and a DOM crumb serialises
  each element's `aria-label`/`title`/`alt`/`name` — on these apps a child's
  name on a card, a school on a leaderboard row, an 8-digit id on a tile. It is
  not collected rather than cleaned afterwards, because an ordinary word has no
  shape to match. Two smaller fixes alongside it: `beforeSend` now runs
  `contexts.nextjs.request_path` through `scrubUrl` (it is a resolved URL, and
  text redaction left `?q=<a child's name>` intact), and the web app's
  `dataCollection` block writes all ten categories the SDK defines — the three
  it omitted (`graphQL`, `genAI`, `frameContextLines`) were taking the
  permissive default, which is the trap that block exists to avoid.

- `[internal]` Wired Sentry error monitoring into the mobile app.
  `@sentry/react-native` `~7.2.0` — the version Expo pins for SDK 54, installed
  with `npx expo install`; the retired `sentry-expo` is NOT used. It reports
  nothing unless the bundle is a release build AND `EXPO_PUBLIC_SENTRY_DSN` is
  set, so Expo Go and every development build send zero. The motivation is
  evidence retention rather than metrics: a failed payment or a rejected
  in-app-purchase receipt reported two days later currently has no evidence left
  anywhere. PII is off explicitly — `sendDefaultPii: false` (the option name
  THIS core has; the newer `dataCollection` object belongs to the core the two
  Next apps run and would be silently ignored here), never `Sentry.setUser`, no
  session replay, no screenshot, no view hierarchy, no tracing. The sample-rate
  options are OMITTED rather than set to zero, because the SDK decides what to
  load with `typeof x === "number"` and zero is a number: `replaysOnErrorSampleRate: 0`
  would have installed the integration that RECORDS THE SCREEN.
  `src/lib/sentryScrub.ts` deletes `user`/`request`/`extra`/`device.name` and
  stack-frame locals, drops console breadcrumbs, strips URL query strings, and
  redacts the `c<8-digit>@children.invalid` login shape, bare 8-digit runs,
  emails, phone numbers, UUIDs and JWTs from exception text. 37 new jest tests
  (`sentry-scrub`, `sentry-posture`). Owner must set `EXPO_PUBLIC_SENTRY_DSN`
  (plain EAS env var + local `.env`); source-map upload is deliberately DEFERRED
  and `SENTRY_DISABLE_AUTO_UPLOAD=true` ships in `eas.json` so the added config
  plugin cannot fail a build that has no Sentry credentials.

- `[internal]` **Both store data-safety declarations now have a second thing
  owed on them, and it is not optional.** Sentry is a third-party recipient of
  crash and diagnostic data that neither form mentions. Play Data safety gains
  *App info and performance → Crash logs* and *Diagnostics*; App Store Connect
  App Privacy gains *Diagnostics → Crash Data* and *Other Diagnostic Data* —
  both answered **not linked to a user**, which is only defensible because of
  the configuration above. The obligation attaches when a DSN is set for a store
  build, not when the dependency is added. Inventory and console steps:
  `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2.6; the release-day preflight
  now prints it (`scripts/submission-preflight.mjs`). Corrected in the same
  round: the launch pack's "no third-party SDKs" posture line, the master
  plan's §16 "OFF for v1" decision, and `docs/OLYMPIQ_ECOSYSTEM_FOR_APPLE.md`
  §7.5/§8, which told Apple in as many words that no crash-reporting SDK was
  present. The privacy policy names Sentry as a processor as of the same
  round (below), so the remaining gap is the two console forms themselves.

- `[internal]` **Sentry is now a named processor in the privacy policy, in
  az/en/ru, before the first DSN rather than after the first event.** One row
  in `privacy.s7.table` — role: crash and error reports; what it receives:
  technical error information with the personal details stripped out; where:
  the EU region — mirrored into all three language sections of the
  hand-maintained `docs/PRIVACY_POLICY.md` (A7/B7/C7) and synced into the
  mobile catalogue with `scripts/sync-i18n.mjs`. The cell wording is
  deliberately conditional rather than a live/off state, so it stays true on
  both sides of the switch. Play's Families policy makes an accurate processor
  list an obligation for a service children use, which is why this did not
  wait for the DSN. Corrected in the same pass: the policy's own verification
  table (Z4) claimed "no analytics / ads / attribution / crash SDK", which
  stopped being true the moment the dependency landed. Last-updated date moved
  to 11.09.2026; the effective date did not move.

- `[store]` `[web]` **The privacy policy no longer denies owning the crash
  reporter it names three sections later.** "What we never do" said, in az/en/ru,
  that neither the app nor the website contains any third-party crash-reporting
  tool — written before the dependency existed and left standing on the day the
  Sentry processor row was added, so the document contradicted itself in the two
  places a store reviewer actually compares. The bullet now denies what is still
  true (analytics, attribution, advertising, advertising identifiers) and names
  the one third-party tool that exists, pointing at section 7 for the detail.

- `[store]` `[web]` **The Sentry row now says what is actually received, and
  stops promising what no filter can do.** Three understatements fixed: it
  disclosed no IP address while the Google Fonts and Google Maps rows directly
  above it do (the SDKs withhold the IP from the payload, but the ingest server
  terminates the connection and sees it regardless — the row now says so, and
  says the account setting that prevents Sentry storing one is on); it named only
  the error, when a report also carries the page or screen address it happened on
  (query string stripped) and a short breadcrumb trail; and it said nothing about
  screenshots, which are off. One OVER-statement fixed, and it was the more
  important half: "personal details are stripped out" describes a filter that
  catches names, and no such filter can exist — a name, a school and a city are
  ordinary words with no shape to match. The claim is now made in its two true
  halves: those fields are never ATTACHED to a report (no user, no request body,
  no cookies, no headers, no query parameters, no stack-frame locals, no extra),
  and the text of every report passes an automatic filter before it is sent.
  Mirrored into `docs/PRIVACY_POLICY.md` A7/B7/C7 and synced to the mobile
  catalogue; the generated diff is those two keys in three locales and nothing
  else.

- `[internal]` **`docs/SENTRY_OWNER_SETUP.md`** — org creation to first event, in
  order, with the five things that cannot be fixed afterwards marked at the top.
  The EU region is chosen when the ORGANISATION is created and cannot be changed,
  and the privacy policy states the EU in three languages. "Prevent Storing of IP
  Addresses" is now load-bearing on that same published document. And the step
  that is easiest to skip: setting the DSN in Vercel is not enough, because the
  Sentry origin in the CSP is derived at BUILD time — after setting it the app
  must be REDEPLOYED, or the SDK initialises, reports itself enabled, and every
  browser event is blocked by the browser while server events still arrive. Also
  in it: the three project names, the exact env-var names per app and the console
  each is set in, the per-project rate limits that enforce the Round-74
  allocation (web 80/h, mobile 35/h, admin 20/h), spike protection, the
  source-map token scope, and a four-point first-event check. Two standing review
  rules are recorded there and in STATUS.md because no scrubber can enforce
  either: never interpolate a child's name, school or city into an Error message,
  and never call `Sentry.setUser`, in any app.

- `[web]` Sentry wired into `web-app` — `@sentry/nextjs` `~10.74.0`, all three
  runtimes (`src/instrumentation-client.ts`, `src/instrumentation.ts` for node
  and edge, `src/app/global-error.tsx`). **The dependency earns its place on
  evidence retention, not metrics:** Vercel keeps runtime logs for one day, so
  a parent's failed checkout or a broken Server Action reported two days later
  currently has no evidence left anywhere, and the alternative — reproducing a
  payment failure by hand — is not available on a live bank rail. Every option
  lives in one shared module (`src/lib/observability/sentryOptions.ts`) so the
  three runtimes cannot drift. Privacy posture is written as `dataCollection`
  and NEVER `sendDefaultPii`: on this core the latter is deprecated, removed in
  v11, and ignored outright when both are present — and every category is
  spelled out, because supplying a `dataCollection` object at all switches the
  baseline to the spec defaults, which are permissive. A half-written block
  would have shipped the child-login request body (an 8-digit ID and a
  plaintext password), the `sb-*-auth-token` session cookie, and stack-frame
  locals holding the service-role key. Tracing, Session Replay and Sentry Logs
  are all off. `src/lib/observability/sentryScrub.ts` is the last gate in
  `beforeSend`/`beforeBreadcrumb`. **CSP: exactly one new origin**, on
  `connect-src` only, derived from the DSN's own host rather than hardcoded —
  no wildcard, and no `worker-src blob:`, which is what Replay would need and
  is deliberately absent so enabling Replay fails loudly instead of quietly
  recording a screen full of children's names. Inert without a DSN and outside
  production, so a local checkout and every preview deploy send nothing.
  Owner env: `NEXT_PUBLIC_SENTRY_DSN` (public by design — write-only ingest),
  plus `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` (secret,
  build-time only) if source-map upload is turned on.

- `[admin]` The same wiring in `admin-panel` — `@sentry/nextjs` `~10.74.0`,
  shared options in `src/lib/sentry/options.ts`, scrubber in
  `src/lib/sentry/scrub.ts`, client/server/edge entrypoints and a
  `global-error.tsx`. Justification is narrower than the web app's and still
  holds: this panel is where content managers and administrators mutate
  questions, accounts and settings, and a failure there is invisible to the
  owner until someone reports it by hand. The privacy bar is if anything
  higher — every screen in it is full of real children's names — so the same
  explicit `dataCollection` block applies, cookies and headers and bodies and
  stack-frame locals all off, no tracing, no Replay. **`frame-ancestors 'none'`
  is untouched** and the only CSP movement is the one DSN-derived origin on
  `connect-src`. Same env variables as the web app, a separate Sentry project.

- `[web]` `[admin]` `[internal]` Sentry can no longer empty the month's error
  allowance in an afternoon. The free plan is 5,000 occurrences a month for the
  WHOLE organisation, shared by the three apps, with no overage to buy — and
  nothing in the previous setup bounded the one shape that spends it: the same
  fault repeating. All three apps now carry a rolling per-process budget applied
  in `beforeSend` (per issue per hour, per hour, per day), Node gets the
  `dedupeIntegration` its default integration list omits, and the ignore lists
  finally match the runtime they run in — every transport string in them was a
  BROWSER string, so a Supabase outage, which surfaces server-side as undici's
  `TypeError: fetch failed`, would have filed one occurrence per request.

- `[web]` `[admin]` Tracing and Session Replay are now switched off by OMITTING
  their sample-rate options instead of setting them to `0`. Zero is not nullish:
  `hasSpansEnabled()` reads `tracesSampleRate: 0` as "tracing on, sampled at
  zero", so the span machinery ran on every request and only the sending was
  suppressed. The tracing code is also removed from the bundle at build time.

- `[web]` `[admin]` Sentry is enabled by `VERCEL_ENV`, not `NODE_ENV`. A local
  `next build && next start` with a DSN in `.env.local` — the normal way to
  check a production build before deploying — used to send real events tagged
  `production` from a laptop full of test data.

- `[web]` The Sentry browser SDK (+161.7 KB minified, +45%) no longer loads on
  the public pages. Anonymous visitors reading the landing page over Azerbaijani
  mobile data were downloading a diagnostics SDK for a page with nothing to
  diagnose. It now loads behind a dynamic import on the parent area, the student
  area and checkout only, including after a client-side navigation into them.
  Server-side capture is unchanged and still covers every route, public ones
  included.

- `[web]` `[admin]` A server-rendered crash is no longer billed twice. `onRequestError`
  already reported it; the root error boundary reported it again from the
  browser. It now reports only failures with no `digest`, which is exactly the
  set that never crossed the server.

- `[web]` `[admin]` A production build with no `NEXT_PUBLIC_SENTRY_DSN` now says
  so, loudly, in the build log. The Sentry origin in the Content-Security-Policy
  is computed at BUILD time, so setting the DSN in Vercel afterwards leaves the
  SDK initialising and every browser event silently blocked by the CSP until the
  app is redeployed. That cannot be fixed in code; it can be made impossible to
  miss.

---

## 1.15.0 — RELEASED on the App Store 2026-09-09 (submitted 2026-09-04, approved and released the same day)

**The In-App Purchase release.** This is the build that answers the 2026-08-31
Guideline 3.1.1 rejection: iOS now sells per-child subject access through Apple,
with 21 non-renewing subscription products. Android is unchanged and remains
purchase-silent — Google's consumption-only rule is app-wide and Azerbaijan is
in no alternative-billing programme.

Needs a NEW BUILD, not an OTA update: `expo-iap` and `expo-clipboard` are native
modules, and `runtimeVersion: appVersion` means an update published for 1.15.0
never reaches a 1.12.3 binary.

- `[store]` iOS: parents can now buy subject access for a child inside the app.
  The price shown is the App Store's own; nothing is priced by us on screen.
- `[store]` Android is untouched: no price, no purchase, no link out.
- `[internal]` `finish-iap-metadata.mjs` checks the screenshot's dimensions
  locally before uploading. Apple answers `UPLOAD_COMPLETE` for an image it will
  later reject, so 21 uploads reported success and all 21 failed processing.
- `[internal]` `--replace` deletes a product's existing review screenshot before
  uploading a new one. Apple allows only one, so replacing a broken asset is a
  different intent from skipping an existing good one.
- `[internal]` `--diagnose` prints what Apple actually holds per product — price,
  localizations, territories, screenshot — because `MISSING_METADATA` never says
  which field is missing and the UI shows the same badge either way.
- `[web]` The purchase endpoint no longer counts a **Free Trial** as access the
  family already owns. Migration 168 stopped a trial suppressing the purchase
  offer, but the server's double-billing guard still saw it, so the newly visible
  Buy button answered with a red "already active" instead of the store sheet. The
  two halves now use the same predicate. Deploys with `web-app/`; no new build.
- `[web]` The purchase endpoint refuses to sell a **subject the child's grade
  does not study**, asking `subjects_taught_to_grade` rather than a copy of the
  rule. Package sales have always been grade-checked; subject sales were not, so
  the server could take money for an entitlement every child screen then filters
  out — money in, screen unchanged, which is the Guideline 3.1.1 impression the
  whole rail exists to remove.
- `[store]` iOS: the subject a parent has just bought **leaves the offer list
  immediately** instead of keeping its price button for the second it takes the
  entitlement read to come back. A tap in that window met the server's
  double-billing refusal, in red, directly under the green "done" line.
- `[internal]` The arena gate and the Tests home now share ONE parse of
  `my_accessible_subjects()`. They decoded its rows differently, so a
  `returns table(...)` would have locked the arena on a paying child while the
  Tests tab of the same session went on listing their subjects.

## 1.14.0 — superseded, never built

Rolled into 1.15.0 — 1.14.0 existed only in `app.json` and was never released.

> Numbered 1.14.0, not 1.13.0. 1.13.0 was prepared but never built or released,
> and the update gate below is a new feature rather than a fix — so everything
> here rides in one build under one version. A phantom 1.13.0 in the store
> history, with release notes for a release that never existed, would be worse
> bookkeeping than a skipped number.

### Money
- `[admin]` **A negative price could be written to the database, and the admin
  panel's own validation could not stop it.** The subject-price rail validated in
  three places and all three were correct — but `subjects_pricing` and
  `olympiad_packages` both carry an RLS write policy of
  `for all to authenticated using (is_admin())`, i.e. plain table write access for
  any signed-in administrator. So `PATCH /rest/v1/subjects_pricing` with
  `{"price_amount": -5}` succeeded, going around the parser and the RPC entirely.
  An audit of every money column found **exactly one** bounding CHECK constraint
  in the whole schema; the other sixteen columns could hold a negative.

  A negative price never opened a charge — the paid rail refuses `due <= 0` — but
  the *free* rail gates on `due > 0`, and a negative is not greater than zero, so
  it silently turned a paid product into a free one.

  Twelve CHECK constraints now make it unrepresentable. The floors differ on
  purpose: a zero-priced **olympiad package** is a real product (the free-purchase
  RPC exists to deliver one), a zero-priced **subscription subject** is not.
- `[admin]` The olympiad price input had **no bounds at all** — no `min`, no
  `max` — with a single line of TypeScript between a typed `-5` and the database.
  It now uses the same string-shape parser as the subscription rail, which also
  gives it the upper bound it lacked: `999999999` used to reach Postgres and come
  back as a raw numeric-overflow shown to the admin as "server error".
- `[internal]` Removed the one place in the panel doing **float arithmetic on
  money** (`Math.round(price * 100) / 100`). The shared parser proves "at most two
  decimals" from the string shape, so no rounding is needed.

### Build
- `[internal]` **The Android release build failed on `lintVitalRelease`** with
  nine fatal `ExtraTranslation` errors. `expo.locales` is not iOS-scoped — there
  is no `ios.locales` in the Expo schema — so the three `NS*UsageDescription`
  keys in `locales/{az,en,ru}.json` were copied into Android's localized
  `values-b+<locale>/strings.xml` as well, while nothing wrote them into the
  default `values/strings.xml`, because they mean nothing on Android. Three
  locales × three keys = the nine errors.

  It surfaced now because the localized permission prompts were added in 1.12.3
  for the Apple review, and 1.12.3 was only ever built for **iOS**. The last
  Android build was 1.12.0.

  Fixed by a config plugin that gives those keys a default-locale entry, rather
  than by `lint { disable 'ExtraTranslation' }`. Disabling would have switched
  off a genuinely useful check app-wide, forever, to work around three strings;
  adding the default answers lint's actual complaint and keeps the check fatal
  for the defects it exists to catch. iOS is untouched — the mod is Android-only.
- `[internal]` Five packages were behind their SDK 54 patch versions (`expo`,
  `expo-constants`, `expo-local-authentication`, `expo-updates`, `jest-expo`),
  flagged by `expo-doctor` and realigned with `expo install --fix`.

### Added — the update gate is finished
- `[store]` The app can now **suggest** an update instead of only forcing one: a
  dismissible card offers Update or Later, and a version you skip stays skipped
  until a newer one ships. It appears over the running app rather than replacing
  it, so nothing is blocked and Android back still works.
- `[admin]` **Turning on a forced update with no store link is now impossible.**
  That combination rendered a full-screen block with no button, no back and no
  navigator — every install bricked, with no way to even explain why. Both store
  URLs are empty in production today, so it was one checkbox away. The admin
  action now refuses it with a readable message, and a database constraint makes
  the state unrepresentable however it is written.
- `[admin]` A minimum version above the latest version is refused too, compared
  numerically — `"1.10.0" < "1.9.0"` is *true* as a string, and that bug would
  have first bitten at exactly version 1.10.
- `[store]` The Update button on the mandatory update screen no longer fails
  silently when the device cannot open the store — it says so. It was the only
  control on a screen with no other way out.
- `[store]` The force-update and maintenance screens no longer sit under the
  notch or the home indicator.

### Added
- `[store]` Tap a child's 8-digit login ID to copy it. Copies the raw digits,
  never the spaced display form — pasting `2721 0253` into the login field would
  fail and the parent would blame the ID.
- `[store]` Screens refresh themselves silently when you switch tabs or return
  to the app, instead of only on pull-to-refresh. No spinner and no toast on
  that path.

### Fixed
- `[store]` `(tester)` **Switching between light and dark left filter chips
  painted in the old theme** — dark chips with unreadable dark text in light
  mode, light chips with unreadable pale text in dark mode — until you left the
  tab and came back. Reported on Parent → Analytics; it also affected the
  leaderboard, notification and language-picker chips.

  Not a React bug: the chip's text colour and its background come from the same
  theme object one line apart, and the text was always correct. The Android
  *native view* never repainted. A background ripple hands the view's drawable to
  a wrapper that React Native then discards, and the discarded wrapper keeps the
  callback — so the "please redraw" signal for the new colour went nowhere.
  Leaving the tab destroyed and rebuilt the views, which is why that appeared to
  fix it. These controls now use a foreground ripple, which never touches the
  background at all.
- `[store]` `(tester)` The Azerbaijani letter **ə rendered as an empty box** in
  the Parent Analytics labels and the streak pill on some phones. Android's
  generic monospace font has no glyph for it and React Native does not fall back
  per-glyph, so the box *was* the fallback. Monospace is now used only where the
  text can actually be drawn in it — numbers keep their alignment, words render
  in the normal font.
- `[store]` The subject list showed **Azərbaycan dili twice** and never showed
  Məntiq. The subject named Məntiq carries the legacy code `az_language`, and
  the label map translated that code as "Azerbaijani". Three other subjects had
  no entry at all and fell back to raw Azerbaijani for every reader.
- `[store]` The test screen's title truncated to "Günün …" on a narrow phone.
  The header now wraps instead of squeezing the title to an ellipsis.

- `[store]` **A parent could reset their child's password, be told it worked, and
  the child still could not sign in.** The reset wrote to the Auth account by its
  internal id — which always succeeds — while the child's login looks the account
  up by an address derived from the 8-digit ID. Nothing kept the two in step, so
  the new password was stored under an address nobody queries. Resetting now
  repairs the address first and refuses outright if the child has no login ID,
  rather than reporting a success it did not achieve.
- `[store]` A password reset no longer leaves the child locked out by their own
  earlier failed attempts. Eight wrong tries lock the ID for 15 minutes, and only
  a *successful* sign-in used to clear that — so the reset was followed by the new
  password being refused too. A reset now clears the failure history, which is the
  one event that should.
- `[store]` `(tester)` On Edit Child, the new-password field sat *below* the main
  Save button with its own separate button. Typing a password and tapping Save
  gave a success message while the password was never sent.
- `[store]` **Physics was offered to Grades 1–6**, where it has no curriculum —
  tapping it reached an empty screen, and worse, a parent could *buy* it for a
  young child. Which subjects a grade is taught is now one rule in the database
  instead of four hand-written copies, so every list, filter and purchase screen
  agrees. Verified against live data: Physics resolves to grades 7–11 only.
- `[store]` `(tester)` **The district list was missing most of the country.** It
  held 15 major cities; Azerbaijan has 64 rayons and 11 cities of republic
  significance, so a family in any of the other 61 — `Hacıqabul` among them — had
  no correct answer to give when creating a child. All 75 are now there, read from
  the State Statistical Committee's official 2024 classification.
- `[store]` **And every one of them has schools.** School is required when
  creating a child, so a district with no schools is exactly as unusable as a
  missing one — adding the districts alone would have moved the dead end, not
  removed it. 3,805 schools imported from the Ministry of Education's open-data
  register, covering all 76 districts. The smallest now has 3; `Hacıqabul` has 32.
- `[store]` Bakı schools now carry their **official names**, including the person
  each is named after — `Bakı şəhəri Abdulla Şaiq adına 54 nömrəli tam orta
  ümumtəhsil məktəbi` rather than `Bakı 54 nömrəli tam orta məktəb` — plus 97
  Bakı schools that were missing entirely. Existing schools were renamed in
  place, so no child lost the school they were already attached to.
- `[store]` Every Bakı school now knows which rayon it is in. None of them did,
  which is also why the admin panel listed all 320 as "Rayon təyin edilməyib".
- `[store]` City, district and school pickers are now searchable, and the search
  tolerates Azerbaijani spelling — typing `Haci` finds `Hacıqabul`. The box appears
  automatically once a list is long enough to need it.
- `[store]` Screens that show admin-managed data (prices, subjects, schools,
  rankings) refreshed only on a pull. Several never refreshed at all, so a newly
  added school could not be made to appear by any gesture.
- `[store]` New passwords now require an uppercase letter and a special character.
  **Existing passwords keep working** — the rule applies only when a password is
  chosen. Azerbaijani capitals count: `Şəkil!2026` is accepted, which a naive
  `A–Z` check would have rejected on the product's own default language.

### Internal
- `[internal]` Subject labels corrected for all 7 codes in three languages, and
  synced to the mobile catalogue. Fixing web alone is why the app still showed
  the duplicate after the web fix shipped.
- `[internal]` The password rule lives in one module, triplicated byte-identically
  across the three apps (they share no package) with a parity check. It uses
  `pw !== pw.toLowerCase()` rather than `/[A-Z]/` or `/\p{Lu}/u` — the first
  rejects valid Azerbaijani passwords, the second is unproven on Hermes.
- `[internal]` The mobile self-service password change went straight to Supabase
  Auth from the device with **no server validation at all**. It now goes through a
  new BFF route, so the rule cannot be bypassed by the client.

---

## 1.12.3 — submitted to App Store review

### Fixed
- `[store]` Rejected by Apple under 2.1.0 because three parent screens reported
  a **platform payment state** read from a server flag. No screen does that any
  more, and a test fails the build if one starts.
- `[store]` The in-app privacy policy stated a payment status. Reachable before
  signing in, so it said it to anyone.
- `[store]` Creating a child now issues the 8-digit login ID immediately. It
  used to promise the ID "as soon as a subscription is active", which — with
  payments off — no screen could bring about. **Two production children had been
  left with no way to sign in.**
- `[store]` The Profile screen no longer shows a "coming soon" placeholder where
  no sticker themes are published.
- `[store]` Face ID, camera and photo-library permission prompts are now in all
  three languages; Face ID was Azerbaijani-only.

### Internal
- `[internal]` Migration 146 allocates the child login ID at creation and
  repaired the two stranded accounts.
- `[internal]` Dropped the web paywall's 96 unrendered `pricing.*` keys and 21
  `terms.*` keys from the mobile bundle — zero occurrences of "AZN" remain in it.

---

## 1.12.0 — first Google Play closed-testing release (2026-08-26)

12 testers, 14 continuous days, `ai.olympiq.app`. Notes:
`mobile-app/store-assets/RELEASE_NOTES_v1.12.0.txt`.

---

## Not tied to a mobile build

Changes to `olympiq.ai` and the admin panel that shipped between mobile builds.
Recorded for the round's history; they never appear in store notes.

### 2026-09-02
- `[store]` Deleting your account now deletes your uploaded photos as well.
  They used to stay in storage after the account was gone.
- `[admin]` Deleting a parent or child from the admin panel reported success
  even when nothing was deleted. It now says so and skips the audit entry.
- `[internal]` Migration 167: the parent-deletion cascade refuses rather than
  deleting a child's profile while their login survives — that combination left
  a working sign-in with no account behind it, 14 times.
- `[internal]` `supabase/scripts/purge-orphaned-avatars.mjs` removes avatar
  files whose owner no longer exists. Read-only until `--apply`.
- `[store]` **(tester)** Deleting your account sometimes deleted nothing while
  telling you it was gone — the old credentials still worked. Deletion now
  verifies the account is actually removed and reports an error instead of a
  false success. Affected 2 of 5 real deletions.
- `[store]` **(tester)** A student's profile photo now appears on their own row
  in the Ranking list. Other students' rows stay on initials, which is
  deliberate: those rows show real names, school and grade to every signed-in
  user, and the photos are private to each family.
- `[store]` A parent's own child now shows their photo on the Ranking screen's
  summary card, matching the Home screen.

### 2026-09-01
- `[store]` The Olympiads tab said packages "are not obtained in this app" —
  which states they are obtained somewhere else. No olympiad package costs
  anything, so the sentence carried a compliance risk and no benefit. It now
  says only that packages opened for a child appear there.
- `[store]` "Subscriptions are not managed in this app" is now shown on Android
  only. On iOS it appeared whenever the product catalogue was empty, which is a
  written confession that access comes from elsewhere.
- `[internal]` `scripts/submission-preflight.mjs` — answers the App Review
  blocking checklist mechanically against the live database and App Store
  Connect. Read-only. Reports what it could not check as SKIP, never as a pass.
- `[store]` The cancel-subscription sheet named a price ("The price isn't right
  for me") and a discount ("your earned discount") — the last purchasing copy a
  parent could reach on Android. Both rewritten in access language, az/en/ru.
- `[admin]` Putting a store product on sale now asks App Store Connect whether
  the product actually exists and can still sell, and refuses if it cannot —
  including when the check itself is unconfigured. Activating a product Apple
  has never heard of gives every family a buy button that fails.
- `[store]` **(tester)** Changing your own password from Profile → Security always
  failed with "Update failed. Please try again." It now works, for parents and
  students alike. Broken since 2026-08-29 for every user without exception.
- `[internal]` `docs/INVESTOR_INFO_REQUEST_AZ.txt` / `_EN.txt` — the one request
  sent to the investor for Apple payout onboarding. Leads with the two facts a
  finance director would otherwise get wrong: Apple pays Azerbaijan in **EUR**
  (AZN is absent from Apple's payout currencies), and Azerbaijani banks give
  every currency its **own IBAN** (944/840/978 encoded inside it), so the AZN
  IBAN would be handed over and the payment would silently never arrive.
- `[internal]` `--find-app` added to `create-iap-products.mjs`: lists the apps a
  key can see with their numeric Apple IDs. A wrong app id fails as a 404 that
  reads like a bad credential, so the natural fix is regenerating a working key.
- `[internal]` The same script crashed at exit on Node 24 / Windows —
  `process.exit()` on top of `fetch`'s keep-alive socket pool trips a libuv
  assertion *after* every request succeeded. Harmless on a read, but during
  `--apply` it would print "created 21 products" beside a crash and leave the
  operator unable to tell. Now closes the pool and sets `exitCode`; a self-test
  check reads the script's own tail so it cannot regress.
- `[internal]` Migration numbering collision fixed — two files both claimed 165.
  The unapplied one became `2026_09_01_166_iap_notification_log.sql`; production
  was queried read-only to decide which was which rather than trusting headers.

### 2026-08-27
- `[admin]` RLS evaluated `is_admin()` **once per row**. The admin Questions
  page hit the 8s statement timeout and showed "The question list could not be
  loaded". Hoisting the calls into scalar subqueries took a 21,934-row scan from
  **9.7s to 127ms**. 135 more policies still carry the pattern — tracked in
  `STATUS.md`.
- `[admin]` Questions page: eight `count: exact` full scans per view folded into
  one RPC; the list retries once; loading is scoped to the table instead of
  replacing the whole page.
- `[admin]` Admin → Subjects is now the source of truth for what families can
  buy: per-row publish / hide / archive, and deletion requires typing `SİL`.
- `[web]` Elm and Fizika were missing from the Services page because they had no
  price. All 7 subjects are now priced and sellable.
- `[web]` A subject archived in the admin panel stayed sellable on the per-child
  subscribe screen, which checked the price row's status but not the subject's.
- `[internal]` Curriculum: Azərbaycan dili imported (44 topics, 88 subtopics);
  643 sub-topic headings translated into English and Russian, closing the
  translation gap to zero.
- `[internal]` Olympiad pool: full replacement in one transaction
  (migration 147), Topic removed from olympiad question management, multi-select
  grade filter.

### 2026-08-29
- `[admin]` **Admin → Subjects is now the real source of truth.** The public
  `/subjects` page — the one the landing page's browse button points at — was a
  hardcoded four-item list on web *and* mobile, and two of its four entries named
  subjects that do not exist. It could never show a subject you created. Both are
  now read from the database.
- `[admin]` A subject can no longer be **born published and unsellable**. Creating
  one requires all three interval prices (week/month/year), and publishing is
  refused outright until they exist — instead of silently succeeding and leaving
  the subject invisible to families. An unpublished subject can now be priced,
  which that rule makes necessary.
- `[admin]` The subject delete dialog is rebuilt. The real cause of "aggressive
  red block, text difficult to read" was a button styled `btn-danger` *without*
  `btn`, so it rendered as a native 13px black-on-red browser button. Archive,
  clear-the-question-bank and delete are now three visually distinct choices, and
  a subject with one warning and three blocking reasons renders **zero** stacked
  red boxes instead of seven.
- `[admin]` **Archive is now offered where the refusal appears.** Archiving a
  purchased olympiad package was never actually blocked — only hard delete was,
  correctly. But the package list offered just Edit and Delete, so an admin met a
  disabled button and a message saying "archive it instead" with nothing to click.
  The owner count is stated plainly: archiving stops new sales, buyers keep
  lifetime access.
- `[admin]` A **failed archive was indistinguishable from a successful one** — the
  error was used only to skip the audit row, then it redirected regardless.
- `[admin]` The package list row now carries a real **Archive…** button beside
  Delete, sharing one dialog. It stays enabled while Delete is refused, which is
  the whole point: that combination is what an admin meets on a purchased package.
- `[admin]` **A confirmation gate you had not satisfied looked identical to one
  you had.** The shared destructive dialog's button carried `btn-danger` without
  `btn`, and `.btn:disabled` — the only dimming rule in the stylesheet — never
  matched it. So a Delete button still waiting for a typed confirmation, or
  blocked outright, rendered exactly like an armed one. It was also the cause of
  the unreadable 13px black-on-red label. A test now fails on any lone
  `btn-danger` anywhere in the panel.
- `[web]` An archived olympiad package **disappeared from the parent's screens
  while their child kept playing it**. Both parent pages asked the catalogue
  question first (`status = 'active'`) and joined purchases onto the result.
  Ownership is now read first and widens the query. Latent until now — putting
  Archive one click away in the admin panel is exactly what made it reachable.
- `[web]` Archived subjects still appeared as parent analytics tabs, and the
  mobile subscribe screen still offered them: those surfaces filtered the *price
  row's* status and never read the subject's.
- `[internal]` Validation check 32 asserted a NAME SHAPE that migration 160
  deliberately changed — it matched the terse seeded form and could not match the
  official ministry name, so it failed the moment the data got better. It now
  counts numbered Bakı schools, which survives any future renaming. Same class of
  staleness as check 33; a check should assert the invariant, not the wording.
- `[internal]` Migrations 155/156/157 backported into canonical `011` and `014`,
  with the `begin;/commit;` wrappers stripped — a canonical file that
  self-transacts once committed an outer `drop schema` here and destroyed every
  row. Both files verified to contain zero transaction statements.
- `[web]` A news article could show **more likes than views** (11 views, 16
  likes). Views were only counted on the article page, but the mobile feed card
  has a like button — so every like from the feed was +1 like and +0 views. A
  like now implies a view, enforced by a trigger *and* a constraint rather than
  by which page a button happens to sit on. One live article was reconciled; no
  displayed number was clamped.
- `[web]` The view beacon dropped the view when `sessionStorage` threw (private
  browsing, blocked site data) while the like on the same page still landed —
  the one way the web could produce this too.
- `[web]` **Leaderboards showed a higher percentage below a lower one.** Not a
  client sort bug: `get_leaderboard` concatenated provisional rows *below* every
  ranked row regardless of score, so a provisional student on 90% sat under a
  ranked one on 40%. Percentages now descend the whole page while rank numbers
  are still withheld below the minimum-attempts threshold.
- `[web]` Copy Child ID on the web Parent Panel, matching the mobile control.
  Copies the raw digits, never the spaced display form.
- `[admin]` Password rule enforced on all four admin account-creation and reset
  paths; `users.ts` no longer returns hardcoded English error text.
- `[internal]` Migrations 155 (subject/grade availability), 156 (leaderboard
  ordering), 157 (news like-implies-view) applied to staging then production.
  Production validation: **129 checks, zero failures.**
- `[internal]` Validation check 33 asserted an invariant migration 135 had
  already **inverted** — a giveaway is now a modifier on an open payment rail,
  not an alternative to one, so `payments + giveaway` both on is correct. The
  check had been failing on production for every live campaign. This is also why
  the giveaway toggle appeared to "turn itself off": with payments off, enabling
  it raises.
- `[internal]` The canonical seed priced subjects from a whitelist containing
  `'science'`, which has never been a real code, while omitting `elm` and
  `fizika`. Migration 154 fixed those two as data only, so a from-zero rebuild
  would have reproduced the missing-subjects bug from source.
