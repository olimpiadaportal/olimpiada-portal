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

## 1.13.0 — unreleased

Needs a NEW BUILD, not an OTA update: `expo-clipboard` is a native module, and
`runtimeVersion: appVersion` means an update published for 1.13.0 never reaches
a 1.12.3 binary.

### Added
- `[store]` Tap a child's 8-digit login ID to copy it. Copies the raw digits,
  never the spaced display form — pasting `2721 0253` into the login field would
  fail and the parent would blame the ID.
- `[store]` Screens refresh themselves silently when you switch tabs or return
  to the app, instead of only on pull-to-refresh. No spinner and no toast on
  that path.

### Fixed
- `[store]` The subject list showed **Azərbaycan dili twice** and never showed
  Məntiq. The subject named Məntiq carries the legacy code `az_language`, and
  the label map translated that code as "Azerbaijani". Three other subjects had
  no entry at all and fell back to raw Azerbaijani for every reader.
- `[store]` The test screen's title truncated to "Günün …" on a narrow phone.
  The header now wraps instead of squeezing the title to an ellipsis.

### Internal
- `[internal]` Subject labels corrected for all 7 codes in three languages, and
  synced to the mobile catalogue. Fixing web alone is why the app still showed
  the duplicate after the web fix shipped.

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
