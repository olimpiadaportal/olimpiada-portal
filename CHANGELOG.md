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

## 1.14.0 — unreleased

Needs a NEW BUILD, not an OTA update: `expo-clipboard` is a native module, and
`runtimeVersion: appVersion` means an update published for 1.14.0 never reaches
a 1.12.3 binary.

> Numbered 1.14.0, not 1.13.0. 1.13.0 was prepared but never built or released,
> and the update gate below is a new feature rather than a fix — so everything
> here rides in one build under one version. A phantom 1.13.0 in the store
> history, with release notes for a release that never existed, would be worse
> bookkeeping than a skipped number.

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
