# STATUS.md

## Purpose

This is the live implementation tracker for the OlympIQ project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

## ROUND 65 — THE APPLE RAIL, CONFIGURED END TO END (2026-09-03)

**Mobile version bumped 1.14.0 → 1.15.0** (minor: In-App Purchase is a feature,
not a fix). 1.14.0 existed only in `app.json` and was never built.
`runtimeVersion: appVersion` ⇒ this needs a NEW BUILD, never an OTA.

### What is now done at Apple

Paid Applications agreement **Active** · bank account **Active (EUR)** · both tax
forms **Active** · **21 products created** · **42 localizations** (en-US + ru;
Apple has no Azerbaijani App Store locale) · **21 prices, each read back and
verified** · **21 × 175 territories** · **21 review screenshots**.

Four scripts now do what was ~150 manual operations across 21 pages:
`create-iap-products.mjs`, `set-iap-prices.mjs`, `finish-iap-metadata.mjs`,
`submission-preflight.mjs`.

### THE PRICING NEAR-MISS — the most valuable thing this round produced

Owner decision: **Option A** — the customer pays the same as on the web and
Apple's commission comes out of our side, rather than marking the App Store up
to preserve revenue.

Web is 3 / 9 / 90 **AZN**, so the first version of the script targeted `3`, `9`,
`90`. It matched all three exactly and reported success on a dry run.

**Apple bills the Azerbaijan storefront in USD.** `customerPrice` is a bare
number with no currency attached anywhere in the price-point response, so
writing "3" would have charged **$3 ≈ ₼5.10** — a ~70% overcharge across all 21
products — while every check in the script showed an exact match. **No read-back
could have caught it**: Apple would have faithfully stored precisely what it was
asked for. The tell was the ladder shape (0.99 / 1.99 / 2.99 is a USD ladder),
not any error.

The script now asks Apple for the territory's billing currency and REFUSES
unless it equals a declared `EXPECTED_CURRENCY`. Final values, converted at the
pegged ₼1.70 = $1 and snapped to real price points: **$1.79 / $5.29 / $52.99**.

### Traps that cost nothing because something checked first

* **`availableInAllTerritories`** is not an attribute of `inAppPurchases` —
  Apple 409s it. Found by `--only` on the first product, so it cost one error
  message instead of 21 half-created products.
* **The availability body is not the app-level one.** `inAppPurchaseAvailabilities`
  uses `availableTerritories` with member type `territories` and **no `included`
  array**; the app-level resource uses `territoryAvailabilities` + `included`,
  which is what almost every example online shows and which 409s here.
* **Reading availability back through `include=` silently truncates at 50.** A
  correct 175-territory write would have read back as ~50 and looked like a
  partial failure. Verification uses the `/availableTerritories?limit=200`
  sub-endpoint and asserts the exact count.
* **Price point ids are per-product** — base64 of `{iapId}_{territory}_{tier}` —
  so the ladder is fetched once per product. Caching one id and reusing it is
  the classic way to write a pricing script that looks like it worked.
* **The screenshot commit** uses `uploaded` (not the older `isUploaded`) and an
  MD5 of the whole file as lowercase hex; Apple recomputes it after reassembly.

### Where the products are in App Store Connect

**Not** under Monetization → In-App Purchases, which correctly renders EMPTY:
that page lists only Consumables and Non-Consumables. Non-renewing subscriptions
live under **Subscriptions → scroll to the bottom → Non-Renewing Subscriptions →
Manage**. Apple documents the split; the scrolling is the load-bearing step.

### A circular dependency worth knowing about

The review screenshot clears `MISSING_METADATA`; the purchase panel only renders
when `iap_products.active` is true; and the activation preflight refuses to
activate anything in `MISSING_METADATA`. So the real purchase card cannot be
photographed before the metadata is complete — on any device, iPhone included.

Resolved by uploading a representative screenshot (the parent Home screen, taken
on Android) to unblock the metadata. Apple marks this asset "for review purposes
only, not displayed on the App Store", and the review notes carry the real
explanation. It is replaceable once products are active.

**An Android screenshot of the SUBSCRIPTION tab would have been wrong** — that
screen shows "Subscriptions are not managed in this app" on Android, which is
correct for Google and the worst possible sentence to show an Apple reviewer.

### The idempotency bug in my own script

`finish-iap-metadata.mjs` reported `20 uploaded, 1 failed` when all 21 were in
fact complete: math-month already had a screenshot from the single-product test
run, and Apple answered the second reservation with 409
`MEDIA_ASSET_CREATION_NOT_ALLOWED / "Screenshot already exists"` — the state we
wanted. Now treated as success, matching the other three scripts, so a re-run is
safe rather than alarming.

### Still open

`iap_products.active` is **0 of 23** — deliberately. Products must be submitted
and approved at Apple first; the admin activation preflight enforces the order.
The free-access window (ends 2026-09-26) remains a WARN: while open, a reviewer
sees "all subjects are open" above the price buttons. Wording for §4 of
`APP_REVIEW_NOTES.md` is drafted if submitting before then.

---

## ROUND 64 — THE ORPHAN FACTORY, AND A REVIEW THAT EARNED ITS KEEP (2026-09-02)

**Verified:** web `tsc` + 1003 tests + build · admin `tsc` + 837 tests + build ·
mobile `tsc` + 670 tests. Migration **applied to staging (exit 0)**; production
apply and the storage purge are the owner's to run.

### The review caught a migration that would have deleted every login

Migration 167 deletes orphaned `auth.users` rows using the predicate *"no
profiles row references this user"*. Three review lenses ran before it was
applied anywhere, and the second found this:

`public.profiles` has **RLS enabled**. Run by any role that neither owns the
table nor sets `rolbypassrls`, **or against a database where profiles is empty —
which is what the repo's own staging-first rule sends it to** — the `not exists`
subquery returns nothing for every user, so **every** auth user matches and the
statement deletes all 72. Both post-conditions would have PASSED, because zero
users means zero orphans.

The safety net pointed the wrong way: it asserted "no orphans remain", which is
satisfied perfectly by having deleted everything. Three guards added — refuse
when `profiles` is empty or invisible (naming `current_user`), refuse when the
orphan count exceeds a sane ceiling, and assert `v_deleted = v_before` so the
delete must remove exactly the rows that were counted.

Also from the review: the required `Destructive change / Rollback notes` header
was missing, the deleted ids are now printed so the psql transcript is a second
record behind the `pg_dump`, the `auth.refresh_tokens` claim was wrong (it has
NO FK to auth.users — it cascades via `auth.sessions`), `storage.objects.owner`
is a bare uuid covered by nothing, and section 3 now asserts
`on_auth_user_created` is armed, because "no orphans" is an invariant produced
by a trigger rather than enforced by a constraint.

### The ordering bug I introduced, caught by the same review

`purgeFamilyStorage` ran BEFORE the account delete, on the reasoning that the
ids would not resolve afterwards. That reasoning is wrong twice: the ids are in
local variables and survive the delete fine, **and** migration 167 makes refusal
a reachable outcome — so a refused deletion would have destroyed a family's
photographs while leaving their account intact. Irreversible work now runs after
the reversible work has succeeded. The test that asserted the old ordering was
inverted rather than deleted.

### The admin panel had the identical bug, and 167 made it dangerous

`admin-panel/src/lib/admin/accounts.ts` carried the same
`deleteUser(...).catch(() => {})` at three sites and returned `{ ok: true }`
regardless. Harmless-looking before; after 167 the trigger RAISES rather than
stranding a login, so the swallowed error would tell an administrator a family
was deleted while parent and children all still signed in. `deleteAuthUserVerified`
ported across; both actions now return `accounts.delete.err.failed` and skip the
audit row when anything survives.

### Storage retention

`media_assets.owner_profile_id` is ON DELETE SET NULL and nothing ever removed
the objects, so deleted children's PHOTOGRAPHS stayed in the bucket. Deletion
now purges the family's files: the child's private avatars, the parent's public
one, and legacy child uploads that landed in `profile-avatars` before migration
096 forced the private bucket. It does NOT throw — revoking the login is what
must not fail silently; a leftover object is a retention problem, a leftover
login is a security one.

`supabase/scripts/purge-orphaned-avatars.mjs` clears what accumulated before
that. A SCRIPT and not a migration for a reason: deleting a `storage.objects`
row removes the METADATA, not the file — the bytes only release through the
Storage API, so a SQL cleanup would leave every image in place while making it
invisible to the query that would find it again. Dry run against production
found **4 orphaned child photographs (private) and 4 orphaned parent avatars
(PUBLIC — world-readable at a stable URL today)**. Output masks every uuid.

**The first `--apply` run reported "deleted 8 of 8" and removed ONE object.**
The script POSTed every path to the bulk `DELETE /storage/v1/object/<bucket>`
endpoint with a `{prefixes: […]}` body and trusted `res.ok`. That endpoint
answers **200 on a partial failure** — the per-object outcome is in the response
body, and from the status line alone a near-total failure is indistinguishable
from success. This is the same defect as the two bugs fixed this round
(`deleteUser().catch(() => {})`, `auth.updateUser` never reaching the network):
**a call assumed to have worked.** Only the script's own re-query caught it, and
that verification pass existed for exactly this reason.

Rewritten to DELETE one object at a time, so every file has its own status and
"it worked" is a fact rather than an inference. 404 counts as success — already
gone is the goal.

**THEN IT FAILED A SECOND WAY, and the shape of the failure was the clue.** The
per-object version reported `deleted 1 of 7`, then `deleted 1 of 5` — always
exactly ONE, with the rest `HTTP 400: Object not found`, while a hand-rolled
probe deleted the same objects fine. The survivor was always the LAST row:
`psql` on Windows returns **CRLF**, the script split on `"\n"`, and every path
but the final one carried a trailing `\r` that percent-encoded into the delete
URL as `%0D`. Split is now `/\r?\n/` with a trim on both fields.

Worth recording as a pattern, because it is the third instance this round of the
same underlying mistake — a call whose result was assumed rather than checked.
Here the script's own verification pass is what refused to report success, and
the *distribution* of the failures (always one, always the last) is what
identified the cause. Final run: **deleted 4 of 4, verified: no orphaned avatar
objects remain.**

### Production state after this round

    orphaned auth users     = 0   (was 14, 9 of them able to sign in)
    orphaned avatar objects = 0   (was 8, 4 of them children's photographs)
    iap_notification_log    = MISSING   <- migration 166, still owed
    active iap products     = 0 of 23   <- the submission blocker

### Owner-run, deliberately

The production apply was blocked by the safety classifier and was NOT worked
around. `pg_dump --data-only` of `auth.users/identities/sessions/refresh_tokens`
is taken (303 lines, scratchpad — never the repo). Production remains at
**14 orphans, old trigger**. Both remaining commands are in `Human Next Actions`.

---

## ROUND 63 — TWO TESTER BUGS; BOTH REPORTS WERE MIS-AIMED (2026-09-02)

**Verified:** web `tsc` + **998 tests** (was 988), mobile `tsc` + **670 tests**.

### Bug 1 — account deletion that deleted nothing and said it did

Reported as an iOS Keychain/cache problem. It was neither: a fresh credential
login is answered by GoTrue, which never reads the device's storage, so no
amount of local clearing could produce the symptom.

`parentCore.ts` ran `await admin.auth.admin.deleteUser(id).catch(() => {})`.
That reads as "delete, ignore failures". It is worse — auth-js's `deleteUser`
CATCHES every AuthError and RETURNS it as `{ data, error }` rather than
throwing, so `.catch()` intercepted almost nothing and the discarded return
value was the **only** place a failure was ever reported. The route then
answered `{ ok: true, deleted: true }` unconditionally.

**Production proof, not inference:** `audit_logs.actor_profile_id` is
`ON DELETE SET NULL`, so a surviving non-null actor on a `parent.account_delete`
row proves the profile was never deleted. Of **5** real deletions, **2** removed
nothing at all — auth user alive, `banned_until` null, profile intact. Both
people were told their account was gone. Separately: **71 auth users vs 57
profiles** — 14 login-capable rows with no account, 12 of them synthetic
children, 9 with a non-null `last_sign_in_at`.

**The fix** checks the returned error, and then **re-reads the user** — success
is defined as "the row is gone", not "the API did not complain", because this
whole bug class is *we assumed the call worked*. A surviving CHILD now fails the
operation too (that `c<id>@children.invalid` login still works). `authUserId:
null` refuses instead of silently skipping the parent — the old
`if (params.authUserId)` guard deleted the children and left a live parent
login. Any failure throws, so the BFF returns an error and the web action skips
its `signOut` and `redirect`.

Tests target the seam between "the API returned" and "the row is gone": a test
mocking `deleteUser` to resolve `{ error: null }` passes on the BROKEN code, so
the fixture models a 2xx with the row still present — the state the old code
could not represent.

**NOT fixed, needs an owner decision:** (a) the 12 orphaned child auth users are
live right now — the fix stops new ones, cleanup needs a one-off migration;
(b) `media_assets` is `ON DELETE SET NULL` and nothing removes Storage objects,
so a deleted child's PHOTOGRAPH survives deletion. On a platform holding minors'
photos that is a real retention problem.

### Bug 2 — the avatar omission was deliberate, and stays

Reported as "the child's photo shows in Profile but not in Ranking; make it
consistent". Verified as **deliberate privacy design**, stated in four places
and enforced at three layers: `get_leaderboard` returns 12 columns and no avatar
("Numeric ranks only; no ids leave the server"), photos live in a PRIVATE bucket
whose `can_access_child_avatar()` excludes peers, and `get_leaderboard` applies
**no ownership check on scope** — any signed-in user can pull any school's
board. Board rows carry REAL names + city + district + school + grade (migration
048 removed the anonymisation from the in-app board on an owner ruling; "Şagird
XXXX" survives only on the public landing page). Production holds 24 student
avatars, **8 real photographs**. Migration 096 exists because this exposure
already happened once: *"a photograph of a MINOR was world-readable at a stable
URL and could never be withdrawn."*

**Implemented instead, which satisfies the actual report:** the viewer's OWN
photo now renders on their OWN row (`is_self` was already on every row; a
student may read their own avatar; no RPC, RLS or storage change). Plus the
parent's own child on the parent leaderboard summary card, which was simply
left on the initials component while parent Home rendered it correctly.

No cache work was needed: the avatar comes from the `student-profile` query, not
the board query, so the existing upload invalidation already refreshes it.

Pinned by three tests, because the change that would break it is a one-word edit
that looks like a fix — dropping `is_self` so "it shows for everyone".

### Apple — parked at the owner's request, resumable

Nothing is waiting on Apple; every remaining item is ours or the owner's. The
tax forms gate the Paid Apps agreement, which gates product creation. Full
ordered list in `docs/APP_REVIEW_NOTES.md`'s blocking checklist; run
`mobile-app/scripts/submission-preflight.mjs` before any submission.

Open question recorded for later: App Store Connect populates the tax form's
line 1 from the LOGGED-IN USER ("Not You?" dialog), not the enrolment, so
whether the beneficial owner may differ from the enrolled individual is
unresolved and worth one question to Apple Developer Support before signing —
submission is irreversible in App Store Connect.

---

## ROUND 62 — THE INVESTOR DOCUMENTS: ONE ANSWER, ONE BLOCKER (2026-09-02)

Received: the completed Apple information form, ABB account requisites (AZ + EN),
and photographs of the passport and VÖEN certificate.

**FIRST ACTION WAS `.gitignore`, BEFORE READING ANYTHING INTO A TRACKED FILE.**
`docs/investor/` is a tracked directory and was not ignored, so the next
`git add -A` would have committed a passport number, a bank account number, an
IBAN and a tax id **permanently** — git history cannot be un-published. Rules
added; all three new files verified ignored; nothing already committed was
touched. **No sensitive value appears in this file, in `CLAUDE.md`, or anywhere
else in the repository** — only the operational consequences below.

### The question that mattered most is answered: there is no company

Section 1 of the form and the VÖEN certificate agree. The operator is an
**individual — `mikro sahibkar`**, Kamil Piriyev, VÖEN 6300091352 (already
published in the app), registered in Lerik rayonu, Peştətük. No MMC, no ASC, no
legal entity. Recorded in `CLAUDE.md` so it is never re-derived; it changes the
Apple enrolment type, the US tax form, and the App Store seller name.

### THE BLOCKER: the account supplied is AZN-only

ABB (Azərbaycan Beynəlxalq Bankı), Sabail branch, BIC `IBAZAZ2X`. The requisites
document names exactly **one** account and marks it `(AZN)`. Form questions 2.1
and 2.2 — *does a EUR account exist? does a USD account exist?* — came back
**unanswered**.

This is precisely the failure the request document was written to prevent, and it
predicted the mechanism: asked for "our IBAN", the answer is the manat account,
because that is the one everything else runs through.

**CORRECTION TO ROUND 58 — I over-read the source, and it changes the next
action.** Round 58 recorded that "Apple pays Azerbaijan in EUR". Adversarial
re-checking refuted the reasoning: the only Apple page pairing Azerbaijan with a
currency is the **minimum payment threshold** table, whose columns are *bank
country / bank account currency / minimum payment in USD*. That is an exceptions
list for thresholds, **not a schedule of supported payout currencies**, so "AZE |
EUR | 0.02" does not establish that EUR is the required or only option.

What survives: **AZN almost certainly cannot be paid** — it appears in no Apple
currency material at all, Azerbaijan's App Store sales settle into the USD "Rest
of World" region, and AZN has no offshore clearing, so a correspondent bank could
not originate the wire. That is a sound working assumption but an inference from
silence; it must not be quoted to anyone as Apple policy.

**Therefore: read the live Bank Account Currency dropdown in App Store Connect
(with Bank Territory set to Azerbaijan) BEFORE telling the investor which account
to open.** Sending them to open a EUR account on my inference, when the dropdown
might offer USD, wastes a bank visit that takes days. The dropdown is on the same
banking form the owner is already in.

Once the currency is known: in Azerbaijan each currency is a separate account
with its own IBAN, so this is a NEW account to open, not a setting on the
existing one.

### Also unanswered on the returned form

Bank: 2.1 EUR account, 2.2 USD account, 2.8 address match, 2.9 the two questions
for the bank. Tax: 3.1 VAT registration, 3.2 EIN, 3.3 passive-income share,
3.4 accountant, 3.5 tax adviser. Apple: 4.1 Account Holder name + Apple ID,
4.2 enrolment type, 4.3 D-U-N-S, 4.4 whose name the accounts are held in.
Contact: 5.1 support phone, 5.2 WhatsApp, 5.3 privacy mailbox choice.

Answered and usable: 1.1–1.6, 2.3–2.7, 5.4 (seller name "OlympIQ" — see below),
5.5 (`© 2026 OlympIQ`).

### Two discrepancies to resolve before anything is filed

1. **Postal index.** The VÖEN certificate prints `AZ6300`; form 1.5 says
   `AZ4335`. Apple's account-holder address needs one, and it must match the
   bank's record. Two different values are on file; nobody has said which is
   right.
2. **Registration number.** Form 1.4 gives the **VÖEN** as the state
   registration number. For an individual with no legal entity that is plausibly
   correct — there may be no separate number — but it should be confirmed rather
   than assumed, because Apple asks for them as different things.

### Seller name: settled, and NOT the way the form assumes

Form 5.4 asks for **OlympIQ** as the App Store seller name. **That is not
available**, and this is verified against Apple's own wording rather than
inferred: *"If you're enrolled as an individual, this option isn't available to
you and the developer name is the same as your legal name."* The
registered-trade-name / DBA developer name is an **Organization-only** feature,
and Apple separately refuses DBAs as enrolling entities — *"DBAs, fictitious
businesses, trade names, and branches are not accepted"*.

So the App Store will list the owner's **personal legal name** as the seller.
There is no documentation path that changes it on an individual account; the only
route to a brand seller name is incorporating a real legal entity and moving the
app to an Organization enrolment. That is a business decision with a real cost,
and it is better made now than after the listing is public.

The copyright line (`© 2026 OlympIQ`) and the app's own name are unaffected —
only the seller/developer line is.

### The US tax form: confirmed, with the reasoning corrected

**Form W-8BEN** (individuals), not W-8BEN-E. Confirmed, but the reason matters
for the next case: it is not "a sole proprietor is not an entity" — it is that a
sole proprietorship is not an entity *separate from its owner* for US tax
purposes, so the beneficial owner is the person. The test is **"is this a
hüquqi şəxs under Azerbaijani law?"**, not "is it registered" or "does it hold a
VÖEN". An MMC would file W-8BEN-E even with one owner.

Practical: line 1 is the **individual's legal name**, never a trade name (W-8BEN
has no disregarded-entity line); line 6a is the **VÖEN** as foreign TIN, which is
what makes the treaty claim possible without a US SSN/ITIN; line 9 is
**Azerbaijan** (not "USSR"/"CIS"); line 10 cites **Article III(1)(a)**, 0%,
royalties. The 1973 treaty covers individuals textually — Art. II(3)(b), *"an
individual resident in the Soviet Union for purposes of its tax"* — and the
qualifying test is **tax residence**, not citizenship or registration.

Let App Store Connect's own question flow select the form; if it ever offers
W-8BEN-E to an individual enrolment, a question was answered wrong. A local
adviser should countersign the treaty claim before it is filed.

---

## ROUND 61 — THE THREE OPEN DECISIONS, CLOSED (2026-09-01)

**Verified:** mobile `tsc` + **670 tests**. Preflight run against production.

### Olympiad packages: there was no commerce problem, only a sentence

The flagged 3.1.1 exposure dissolved on contact with production: **8 packages, 2
active, ZERO priced above zero.** Apple requires no in-app purchase for content
that costs nothing, so nothing needed to be built, activated or decided.

What created the exposure was the copy. `mob.oly.notInApp` said packages "are not
obtained in this app" — a sentence that asserts they are obtained *somewhere
else*, which is the 3.1.1 pattern verbatim, for content that is free everywhere.
All of the risk, none of the benefit. Rewritten in access language, az/en/ru.

The preflight now FAILS if an active package ever gains a price while the app
cannot sell it, so the resolution survives the day someone prices one.

### The iOS build was confessing whenever the catalogue was empty

Found while fixing the above, and worse than the thing being fixed:
`mob.pay.notInApp` — *"Subscriptions are not managed in this app"* — rendered on
BOTH platforms whenever the purchase panel had nothing to show. On Android that
is true and policy-safe. **On iOS it is a written 3.1.1 confession displayed to
the reviewer**, and its trigger is precisely an empty catalogue: the forgotten
activation, which has no other visible symptom.

The tempting fix is the trap: *"not available right now"* is the **2.1.0 App
Completeness** rejection this app already took on 2026-08-26. iOS now renders
NOTHING. An empty area claims nothing and confesses nothing.

`iap-store-boundary.test.ts` caught the change (its positive-guard regex counted
`!IAP_PLATFORM_SUPPORTED ? (`), fixed with a lookbehind and extended with a test
pinning that the sentence is Android-gated on both screens.

### The activation flag now has a mechanical check, not a checklist item

`scripts/submission-preflight.mjs` — read-only, queries production and App Store
Connect, exits 1 on any blocking failure. Written because the most dangerous item
on the checklist is the one with **no visible symptom**: 23 products ship
`active = false`, an empty catalogue renders no purchase card, and the reviewer
sees exactly the rejected screen with the whole rail working behind it.

Its design rule is that **a check it cannot run reports SKIP, never PASS** — the
Vercel-side env var, the age rating and the sandbox rehearsal are printed as
unverified rather than quietly counted as green.

First run against production found two real blockers and one warning:

```
FAIL  iap_products has an active product         ZERO active iOS products
FAIL  notification-log migration applied         iap_notification_log missing (166)
WARN  free-access window is closed               open until 2026-09-26
PASS  payments flag is enabled
PASS  no unsellable priced content
```

### Free-access window: deliberately NOT closed early

It runs to 2026-09-26 and is a commitment to real families; ending it early to
tidy a review is a disruption paid by users to save an editing step. It is a
WARN, with the §4 demo-account paragraph already drafted for a submission made
while it is open — and if submission lands after the 26th the point is moot.

### Not bumped

`mobile-app` version is unchanged: the owner has not said they are committing,
and a bump forecloses the OTA path for changes that are pure copy and render
logic. Decide the build-vs-OTA question first (see `CLAUDE.md`), then bump.

---

## ROUND 60 — THE ACTIVATION GUARD, AND TWO LIVE COMPLIANCE GAPS (2026-09-01)

**Verified:** admin `tsc` + 833→892 tests, mobile `tsc` + 668 tests, web 988
tests + production build. All green.

### Android was not purchase-silent, and the test suite said so

`cancel.reason.price` («The price isn't right for me») and `cancel.benefit3`
(«your earned discount») rendered on Android with no platform gate, from
`features/parent/CancelSheet.tsx`, reachable by any parent with a live
subscription. The compliance sweep passed **because both sat in `KNOWN_GAPS`** —
the suite was documenting the violation, not preventing it, and a green run read
as compliance.

Both rewritten in access language across az/en/ru via the overlay (`Bizim üçün
uyğun deyil` / `It isn't right for us`; `Cari giriş müddətinizin qalan hissəsini`
/ `The remaining time on your current access`). The reason stays useful — a
parent cancelling over cost still recognises it — it just stops naming commerce.
"Trial period" went too: a trial is a billing concept in a binary meant to be
silent about billing.

**`KNOWN_GAPS` is now empty and the mechanism stays.** The sweep asserts every
entry STILL trips a pattern, so a fixed key cannot be left as cover; keeping the
empty list gives the next gap somewhere visible and self-expiring to go, instead
of `ALLOWED`, where nothing re-checks it.

### The activation guard, and the two rules that would have been wrong

`iap_products.active` is a switch in OUR database — nothing about it consulted
Apple, so the panel would happily sell a product id App Store Connect has never
heard of. New `lib/admin/appStoreConnect.ts` asks Apple first. **Two plausible
rules were both refuted by research before being written:**

**"Refuse anything not APPROVED" would have blocked our own submission.** App
Review buys in the SANDBOX (TN2413), and sandbox availability "doesn't require
you to submit your In-App Purchases for review" (TN3186) — at review time our
products sit in `WAITING_FOR_REVIEW`/`IN_REVIEW`. That guard would refuse them,
the reviewer would see no purchase button, and we would be rejected for exactly
what the guard was meant to prevent. Those states are ALLOWED.

**"MISSING_METADATA means unpurchasable" is false.** Apple's stated sandbox
minimum is only a reference name, product id, localized name and a price;
submission additionally wants a Description. So a product can sit in
`MISSING_METADATA` and buy fine in sandbox. It is refused anyway — for the honest
reason that a product which cannot be SUBMITTED can never be approved, so selling
it is a release mistake — and the message says that rather than implying the
purchase would fail.

Also encoded: **Apple publishes no state-to-sandbox matrix at all** (checked
across four Apple pages), so the allowlist is commented as inference rather than
contract; an **unrecognised state fails closed**, because Apple has added states
to this resource before; and **operator-facing text never echoes a raw API
state** — `MISSING_METADATA` and `READY_TO_SUBMIT` both display as "Prepare for
Submission" in App Store Connect, so quoting the API name sends the owner hunting
for a status that does not exist on the screen.

Missing credentials **fail closed**: an unchecked activation is the event the
module exists to prevent. Deactivation never consults Apple — it is the way OUT
of a bad state, and blocking it when Apple is unreachable would be worst exactly
when someone is trying to stop selling something. Both are pinned by tests.

### The five red tests were the guard working

`iap-product-map.test.ts` went 5-red the moment the preflight landed: every test
that activates a product hit a fail-closed check with no credentials in the test
environment. Mocked to allow by default, with four new tests pinning refusal,
that nothing is written on refusal, that all seven problem keys exist in all
three locales, and that deactivation is never blocked.

### APP_REVIEW_NOTES.md rewritten — it had become a confession

Its §5 told Apple *"Access is provisioned outside the app and the app only
reflects its status"* — written when true, a written 3.1.1 confession the moment
Apple looked, and false of the iOS binary since IAP landed. §0 and §0b (the 2.1.0
reply and the neutral/cooperative close) are superseded by events and moved to a
**Historical — DO NOT PASTE** appendix; §0b's reserved "cooperative close" offered
to build IAP, which is now shipped.

**Two blockers the rewrite surfaced that nobody was tracking:**

1. **The `payments` system flag must be ON throughout review.** The intent
   endpoint fails closed on it, so with it off every price button shows a red
   "not available right now" and the reviewer never reaches the App Store sheet —
   the same rejection, dressed as a bug.
2. **Olympiad packages are still consume-only.** The Olympiads tab tells a parent
   packages are "not obtained in this app" — the exact 3.1.1 pattern, on a second
   product line. An owner decision, flagged, not papered over.

Plus the free-access window (ends 2026-09-26) makes a reviewer see "All subjects
are open" directly above a row of price buttons. Cleanest submission closes it
first; wording provided if it stays open.

---

## ROUND 59 — THE PASSWORD CHANGE THAT NEVER SENT A REQUEST (2026-09-01)

**Verified:** web-app `tsc` clean, **988 tests / 52 files pass**.

### The bug

Profile → Security, mobile. New password, matching confirmation, "Yadda saxla" →
*"Yenilənmə alınmadı. Yenidən cəhd edin."* Reported for a child; true for parents
too, and true for every password ever entered.

`route.ts:92` called `createBearerClient(token).auth.updateUser({ password })`.
**`updateUser` is SESSION-bound, not header-bound.** A bearer client sets a global
`Authorization` header — correct for PostgREST, RPC and Storage — but auth-js
resolves the session from its own storage, and `persistSession: false` makes that
storage a fresh empty object per request. `_updateUser` runs inside `_useSession`,
finds `session === null`, and throws `AuthSessionMissingError` **before issuing any
HTTP request**. Reproduced offline against a deliberately fake hostname: it
returned instantly, proving no packet was ever sent.

`updateUser` catches its own AuthError and RETURNS it, so the route took the
`if (error)` branch — a flat 400 — rather than the 500 catch. That distinction is
what identified it: the client's `classifyBffResponse` rewrites 5xx/404/405 to
`mob.err.serverUnavailable` and 401 to `mob.session.expired`, so the Azerbaijani
string reaching the screen PROVED a parseable sub-500 JSON envelope, which only
`route.ts:96` can produce.

**Regression age: 3 days.** Commit `a990e06` (2026-08-29) moved the call server-side
to make the strength rule enforceable — the app previously called `updateUser`
on-device, where a session genuinely existed. Enforcing the rule is right; the move
silently removed the only thing the method could work with.

### The fix, and the one that was rejected

New `updateOwnPasswordWithBearer` in `lib/auth/mobileBearer.ts`: a direct
`PUT {supabaseUrl}/auth/v1/user` with the caller's own token — exactly the request
`auth.updateUser` would have made had it held a session.

**Three of four verifiers proposed `getAdminClient().auth.admin.updateUserById`
instead. Rejected**, for two reasons neither weighed. The route's header states the
property being protected — *being the token holder IS the authorization* — and
service-role would turn any future `resolveBearerUser` defect into an
account-takeover primitive rather than a scoping bug. And if GoTrue is ever
configured to demand reauthentication for a password change, the admin API would
silently BYPASS that control while the token path correctly reports it. The bearer
client stays for the RLS-scoped `students.child_unique_id` read, which is what it
is actually good for.

Failure logging now records the GoTrue error CODE. Logging only `error.status` is
what hid this for three days: it was always a flat 400.

### The tests are written against `fetch`, deliberately

`__tests__/mobileBearerPassword.test.ts` (7 tests) asserts the network boundary,
not a mocked SDK. **Any test that stubs `auth.updateUser` to resolve
`{ error: null }` passes on the broken implementation** — the defect is precisely
that the real method never reaches the transport. So the first assertion is that
one request was sent; the old code sent zero. Also pinned: an unreachable server is
distinguishable from a rejection (the old flat-400 collapse is what hid this), and
a GoTrue message — which can quote the submitted password back — never reaches the
returned value, which callers log.

---

## ROUND 58 — APPLE PAYOUT ONBOARDING: THREE ASSUMPTIONS OVERTURNED (2026-09-01)

**BLOCKED ON OWNER — see the reminder list at the end of this section.**

The IAP code is finished. The rollout is now entirely an App Store Connect
configuration problem, and this round was about not getting the configuration
wrong in a way that costs a week.

### What I had wrong, and what it would have cost

I had told the owner three things from intuition. An adversarial verification
pass (11 agents, primary sources only) refuted all three.

**1. "Apple converts to whatever currency your account holds, 40 USD minimum."**
False for Azerbaijan. Apple's published payment-threshold table lists Azerbaijan
exactly once — `AZE | Azerbaijan | EUR | 0.02 USD`. AZN appears nowhere in
Apple's payout currencies at all, and the 40 USD floor is the *residual* clause
for countries with no row of their own. Azerbaijan has a row. **We need a EUR
account**, and the threshold is negligible.
*Caveat kept honest in the doc:* the table is a threshold schedule, not a
declared allowlist, so "USD is unavailable" is undocumented rather than proven.

**2. "Give Apple the company IBAN."** There is no such thing as *the* IBAN.
Azerbaijani banks open a separate account per currency, each with its own IBAN,
and the ISO 4217 numeric code sits inside it (944 AZN / 840 USD / 978 EUR) —
confirmed by decomposing published requisites from three Azerbaijani
organisations, and by a CBAR AZIPS directory in which 1999 of 1999 manat IBANs
end in 944. Handing Apple the AZN IBAN is a silent failure: the form accepts it
and the money never arrives. Apple also has **no correspondent-bank field**, so
asking the bank for one wastes a call.

**3. "Apple is merchant of record, so no e-kassa duty."** Right conclusion,
wrong and dangerous reasoning. Apple's Exhibit A puts Azerbaijan under **Apple
as Commissionaire**, not agent — merchant-of-record language lives only in the
consumer-facing Media Services Terms. The reasoning matters because "our
processor is MoR" is equally true of Paddle or FastSpring, and would wrongly
exempt the *web* rail too, where AZN 1,000-6,000 sanctions apply. The defensible
reason is that the resident developer has no consumer-facing settlement in
Azerbaijan. Also verified: Apple remits Azerbaijani VAT with **no local-developer
carve-out** (Exhibit B, no asterisk — unlike Kazakhstan/Uzbekistan).

**One thing I assumed was risky and turned out fine:** the US *does* have a tax
treaty with Azerbaijan, via the 1973 US-USSR convention that the IRS still
applies and lists Azerbaijan by name (Pub. 901). Treaty benefits are claimable
under Article III(1)(a) with no LOB article; the VÖEN satisfies line 9b. Likely
moot in practice — Apple states app sales are not subject to US withholding.

### The finding nobody was looking for

**There is no registered company anywhere in this repository.** The published
operator, in all three locales and in the privacy policy, is an individual:
"Kamil Piriyev (VÖEN 6300091352) və tərəfdaşları". `docs/OLYMPIQ_ECOSYSTEM_FOR_APPLE.md`
already carried `Registered company name, if any | — | OWNER MUST CONFIRM`.

This is not a detail. It decides the Apple enrolment type, the Account Holder
Type field, whether the tax form is W-8BEN-E or W-8BEN, and the public seller
name. It is question 1.1 of the request document for that reason.

Separately worth confirming: the ASC API key on the account was generated by a
name that does not match the published operator, so who holds the Account Holder
role is an open question rather than an assumption.

### Shipped this round

- `docs/INVESTOR_INFO_REQUEST_AZ.txt` + `_EN.txt` — fill-in-the-blank request.
  Deliberately opens by telling the reader to ask the bank for the **euro**
  account, because a recipient-simulation agent predicted the natural failure:
  asked for "our IBAN", a finance director returns the AZN one, since that is
  the account everything else runs through. Both files close with an explicit
  "what we already have — do NOT re-send" list (VÖEN, both addresses, the three
  mailboxes, the domain, every technical identifier) so the ask stays short.
- `--find-app` in `mobile-app/scripts/create-iap-products.mjs`. The numeric app
  id lives on a page that is easy to miss, and a wrong one fails as a 404 that
  reads exactly like a bad credential — the natural next move is regenerating a
  key that was fine. `readEnv(required, { needAppId })` exists because the
  command you run to *discover* the id cannot require the id. Script still
  12/12 on `--self-test`; no mobile version bump (build tooling, not binary).

### OWNER REMINDER — outstanding, in order

1. **Create the ASC API key.** Users and Access → Integrations → Team Keys → +,
   name `OlympIQ IAP Setup`, access **Admin**. The `.p8` downloads **once**;
   save to `C:\Users\aliqu\keys\`. The existing `[Expo] EAS Submit` key cannot
   be reused and must not be disturbed.
2. **`node ./scripts/create-iap-products.mjs --find-app`** for the numeric id.
3. **Paid Applications agreement → Active** — needs the investor document back.
4. Then: 21 products via script, 21 prices by hand, the *separate* In-App
   Purchase key, sandbox tester, age rating, Server Notifications V2 at
   `https://olympiq.ai/api/payments/apple/notifications` (+ `/sandbox`).

### Migration numbering collision — found and fixed

Two uncommitted files both claimed **165**: `165_iap_olympiad_products` and
`165_iap_notification_log`. "Run SQL scripts in numeric order only" has no
meaning when two files share a number, and neither is committed yet, so this was
the moment to fix it rather than after it reached a second machine.

Resolved by a read-only production query rather than by reading the headers:
`iap_products` and `iap_purchase_intents` exist (164 applied), and both
`iap_notifications` and `iap_notification_log` are **MISSING** — so the
notification-log migration is genuinely unapplied, as its own header claimed.
The APPLIED file keeps 165; the unapplied one is renamed to
**`2026_09_01_166_iap_notification_log.sql`** with its header line updated. No
migration-tracking table exists (tracking is prose in this file), so no database
state references the old filename, and nothing else in the repo did either —
grep across `.md/.sql/.ts/.mjs` returned zero hits.

**DEPLOY-ORDER HAZARD, unchanged by the rename:** the notification endpoints
under `web-app/src/app/api/payments/apple/` read a table production does not
have. Pushing them before 166 is applied means every Apple notification gets a
500 and is retried indefinitely. 166 goes staging → production **before** that
code is pushed.

Still open from earlier rounds: `docs/APP_REVIEW_NOTES.md` still tells Apple
access is provisioned outside the app — a written 3.1.1 confession that must be
rewritten before resubmission; migrations 164/165 not yet backported to canonical.

---

## ROUND 56 — FOUR QUEUED BRIEFS (2026-08-29)

Four owner briefs worked as one round: `Claude_Professional_Prompt.docx` (7
items), Subjects management (17 sections), Olympiad lifecycle (19 sections),
`Claude_Cross_Platform_Fix_Prompt.docx` (5 fixes). The flat list of what shipped
is in `CHANGELOG.md`; this section is the reasoning.

**Verified:** web 731 tests + build, admin 727 tests + build, mobile 611 tests,
`tsc` clean on all three. Production DB: **129 validation checks, 0 failures.**
Migrations 155-159 applied staging→production and backported to canonical.

### Two briefs asked for things the code did not need

**The olympiad brief's premise was false.** It asked to remove the restriction
blocking archive of a purchased package. Archiving was never blocked:
`archiveOlympiadPackage` is a bare status update behind `requireAdmin()` with
zero guards, and every trigger short-circuits for a non-`active` status. Only
hard delete is blocked, correctly — that is CLAUDE.md law. The real defect was
PLACEMENT: the package list offered only Edit and Delete, so an admin met a
disabled Delete plus a red sentence reading "archive the package instead" with
nothing to click. Fixed by putting Archive on the row. **Refused:** a new
`catalog_status` value, weakening the delete guard, a new entitlement table.
`REMOVED_FROM_SALE` already exists twice over (`archived`, and an expired
`sale_ends_at`).

**The subjects brief asked for a scalar `Price` field.** Price is per
(subject × interval) with `unique(subject_id, interval)` — one field could only
write one of week/month/year and would leave two unpriced, which is EXACTLY the
defect that made Elm and Fizika vanish. Built as three interval inputs instead.

### The child password reset was writing to an address nobody reads

One password store (Supabase Auth), addressed by TWO keys nothing kept in sync.
Reset wrote by primary key (`updateUserById(auth_user_id)`) — always succeeds,
so the UI truthfully reported success. Login reads by a DERIVED key
(`signInWithPassword({email: 'c'+child_unique_id+'@children.invalid'})`). They
agree only if `applyAllocatedChildEmail` already replaced the throwaway
`pending-<uuid>@` address. Migration 146 backfilled `child_unique_id` in SQL —
which cannot write `auth.users.email` — so the panel began DISPLAYING an ID for
accounts whose auth email was still the pending one. `013` never reads
`auth.users`, so no validation could see it. Two independent secondary causes of
the same symptom: a reset never cleared `child_login_attempts` (so the new
password stayed refused for 15 more minutes), and on mobile the password field
sat below the primary Save button.

### Physics for grades 1-6 was one rule with four copies and three bugs

The rule existed as a hand-written client effect pasted byte-identically into
two web files and never ported to mobile's three list builders. It also (i) ran
only inside `if (freeNow)`, so a SUBSCRIBED child was never filtered — a parent
could BUY Physics for a grade-3 child; (ii) omitted `status='active'` on topics;
(iii) used grade equality, so a shared NULL-grade topic made a subject vanish,
contradicting every test-setup path. Migration 155 makes it one DB function.
Its assertion runs against live data: *fizika resolves to grades 7-11 only*.

### Leaderboard ordering: the brief's hypothesis was refuted

Not a client sort bug — the sort key and the rendered value are the same column,
no client re-sorts, no pagination. `get_leaderboard` gave provisional rows
`ord = (count of ranked) + row_number()`, an OFFSET rather than a value, so every
provisional row sat below every ranked one regardless of score. Migration 156
orders the whole population by value while still withholding the rank NUMBER
below `min_attempts` — both the report and the product rule satisfied.

### News likes > views was definitional, not corruption

`like_count` is a trigger-maintained cache of PK-deduped rows and was correct.
`view_count` moves only via `bump_news_view`, called only from the DETAIL screen.
Mobile put a like button on the LIST CARD, so a feed like is +1 like / +0 views.
The invariant "a like implies a view" was never encoded anywhere — it was an
emergent property of one page's layout. Migration 157 makes it real (trigger +
CHECK) and reconciled 1 live article. Not clamped in the UI, per the brief.

### Validation check 33 had been failing on production for every campaign

Migration 135 INVERTED the invariant — a giveaway is a modifier on an open
payment rail, not an alternative to one — and check 33 was never updated, still
asserting mutual exclusivity. This is also why the giveaway toggle appeared to
"turn itself off after two seconds": with payments off, enabling it raises
`giveaway_requires_payments`. The check now asserts implication, not exclusivity.

### A from-zero rebuild would have recreated the missing-subjects bug

`012`'s pricing seed filtered `code in ('math','science','english','informatics',
'az_language')`. `'science'` has never been a real code and `fizika` was absent,
so Elm and Fizika came out unpriced — and unpriced means invisible on /services.
Migration 154 had fixed them as DATA only. It is now a cross join, as its own
comment always claimed.

### Locations and schools: 15 districts → 76, 320 schools → 4,125

Sourced from the State Statistical Committee classification (approved
2026-02-16) and the Ministry's CC0 open-data register. **Nothing fabricated** —
the owner's brief forbids it, and the ~160-school shortfall against the official
4,357 is recorded as a known gap concentrated in reopening districts.

Three judgement calls, recorded in the migrations themselves: **Xırdalan kept
selectable** (officially inside Abşeron, but a city of ~100k with zero
dependents; its 11 schools routed to it so it is not an empty dead end); **36
Cyrillic-homoglyph names repaired** (a real defect in the ministry file — a
parent typing "orta" would never find them, and the unique index cannot see them
as duplicates); **liberated-territory schools imported as published** (the
register is de jure; excluding them is a political judgement a migration should
not make).

**The en-dash trap is worth remembering:** the source PDF's headers use both a
hyphen and U+2013. A dash-blind regex drops exactly Ağdam, Ağdərə, Cəbrayıl,
Füzuli, Xocavənd, Kəlbəcər, Laçın and Şuşa — precisely the subset whose absence
reads as a deliberate omission. Migration 158 asserts all eight by name.

### Deliberately NOT done — Bakı schools

The register's 393 Bakı rows must reconcile against the 320 seeded in `012` on
school NUMBER, not name: 178 are the same physical school wearing an honorific
("Bakı şəhəri Ə.Səmədov adına 12 nömrəli tam orta ümumtəhsil məktəbi" vs the
seeded "Bakı 12 nömrəli tam orta məktəb"). A name-based import puts ~190
duplicates into the picker where the 21 real students live. Own migration, next
round. 18 seeded numbers (25, 41, 66, 173, 190, 199, 277, 339-350) have no
counterpart in the ministry list and need a ruling.

### Also open

- The parent-side archived-package leak was fixed here, but the same
  "catalogue question asked before ownership" shape may exist on other surfaces.
- 135 RLS policies still carry the un-hoisted `is_admin()` pattern (Round 55).
- `del.codeHint` appears dead (0 references, 3 definitions); left in place.

## SUBJECTS ARE NOW ONE SOURCE OF TRUTH (owner spec, 2026-08-27)

Admin → Subjects controls what families can buy. Seven subjects, all sellable,
all correctly labelled in three languages, with publish / hide / archive on the
row and a delete that demands the word **SİL**.

### The duplicate was a code-vs-name lie, not a duplicate row

`subjects.code = 'az_language'` but that subject is NAMED **Məntiq**. The label
map translated `subj.az_language` → "Azerbaijani", so Logic rendered as
Azerbaijani beside the real Azərbaycan dili — two entries, one subject missing.
Worse, `subj.science` and `subj.logic` existed as keys that NO subject uses,
while `elm`, `fizika` and `azerbaycan_dili` had no entry at all and fell back to
the raw Azerbaijani name for every reader.

Subject names come from a hardcoded `subj.<code>` map, not from the database
(there is no subjects-translations table), so ONE corrected map fixed every one
of the ~12 surfaces that render a subject. The mobile catalogue is generated
from the web one — fixing web without re-running `sync-i18n.mjs` is why the
student app still showed the duplicate after the web fix, and it is now synced.

### Elm and Fizika were missing because they had no PRICE

The Services page is built from `subjects_pricing`; a subject with no price
cannot enter a basket, so it never appeared. Both are real, active and carry
curriculum (Elm: 64 topics / 293 subtopics / 100 published questions). Migration
**154** prices them 3 / 9 / 90 like every other subject. Making the page list
unpriced subjects instead would have put an unbuyable row in a basket UI and
moved the failure to checkout.

### A publication status that half the app ignored

`subjects.status` (active | inactive | archived, already labelled Public /
Private / Archived) has ALWAYS been the switch deciding what is sold. But:

- it could only be changed inside the edit form's dropdown — fixed with
  `SubjectLifecycle`, per-row publish / hide / archive, copied from
  `transitionNews`: a whitelist map, the current status RE-READ server-side
  before the write (a stale tab must not archive what somebody just published),
  and an audit row;
- **the per-child subscribe screen never checked it.** It filtered
  `subjects_pricing.status` only, so an archived subject kept its price rows and
  stayed sellable there while correctly vanishing from /services and Add-Child.
  That is exactly the "inconsistent publication status" the spec set out to
  remove. Fixed.

Archive is deliberately REVERSIBLE (`publish` accepts `from: archived`). If it
were a one-way door an admin would reach for Delete instead — and Delete is the
action that destroys questions.

### Delete: what already existed, and what changed

Subjects were never one-click-deletable. The dialog already demanded a typed
token and `admin_delete_subject` already re-compared it under a row lock, purges
only what it safely can, and **archives the subject instead of deleting when any
question has been answered** — purging nothing on that path, so an admin cannot
read a soft word while the unanswered half of the bank has already gone.

What changed is WHICH word: `SİL`, per the spec. And the client no longer
carries the code at all — it posts only the word, the SERVER reads the row's own
code and hands that to the RPC. The under-lock comparison is unchanged but is
now unreachable from the browser, which is stronger than before.

`SİL` is matched case-sensitively with U+0130 (dotted İ), so neither "sil" nor
a dotless-I "SIL" passes; surrounding whitespace IS trimmed, because a trailing
space from a paste is not a different intent. Both are asserted.

**The honest cost, recorded so nobody re-litigates it:** a per-row code proved
you were deleting the row you meant. A fixed word cannot. The dialog therefore
keeps the subject name, its question count and its warnings above the input.

**What deletion would do today:** İnformatika (76 answered), Məntiq (25) and
Riyaziyyat (25) would ARCHIVE; the other four would hard-delete cleanly.

### Also this round

- **Checkout review** removed from the sidebar (owner). Route and page kept —
  /payments links to it from the attention block, so nothing is stranded. This
  reverses migration 127's reasoning on purpose; if that queue starts being
  missed, restore the entry rather than adding a second one.
- **Test-runner title** stopped truncating to "Günün ...": the header row now
  wraps and the title gets two lines, with a `minWidth` forcing the wrap instead
  of letting flexbox shrink the text to an ellipsis.
- **Child ID is tappable to copy** (`CopyableId`, all three places it appears).
  Copies the RAW digits, never the spaced display form — pasting "2721 0253"
  into the login field fails and the parent blames the ID. Silent on an OS
  refusal rather than claiming "Copied".
- **Silent refresh on tab focus and app foreground.** Added INSIDE
  `usePullRefresh`, the hook all 24 scrollable screens already use, so none can
  be forgotten: app-foreground via react-query's `focusManager` driven from
  `AppState`, tab-switch via `useFocusEffect`. No spinner and no toast on the
  focus path — an unrequested toast on every tab switch is worse than stale
  data. Not polling and not a socket: a timer burns battery on screens nobody is
  looking at, and nobody else edits a parent's children while they watch.
  NetInfo (reconnect) is the third signal and is NOT wired — it needs a native
  module; add it next time the app is rebuilt anyway.
- **expo-clipboard added → mobile 1.13.0 needs a NEW BUILD.** It is a native
  module, so it cannot reach 1.12.3 as an OTA update.
- **mobile-app `npm audit` reports 10 high** — PRE-EXISTING, verified against the
  committed lockfile. All in `image-size` / `metro` / `js-yaml`, i.e. Metro build
  tooling, not shipped in the binary. `npm audit fix --force` would downgrade
  Expo, which the SDK-54 pin forbids.

## CURRICULUM FULLY TRILINGUAL — 643 HEADINGS TRANSLATED (2026-08-27)

`curriculum_translation_gaps()` on production now returns **0 / 0 / 0**. Every
exam topic and subtopic has an English and a Russian name.

### What was wrong, and what was not

604 subtopics had no en/ru name. They were created BY HAND between 17 and 27
August while the content team prepared bulk question uploads, they all sit under
topics that ARE in the approved curriculum, and 3,958 questions — 89% of the bank
— hang off them. Nothing was broken and nobody did anything wrong: the admin
panel creates a subtopic in Azerbaijani and translates it in a SEPARATE later
step, which is how the team actually works. What was missing was the NUMBER.
Nothing surfaced the backlog, so it reached 604 in ten days unseen.

**The investor's instruction was to delete them.** That was declined and the
reasoning put in writing: `questions.subtopic_id` is `ON DELETE SET NULL`, so
deleting the headings deletes no questions at all — all 3,958 would stay in the
system, still served, permanently unfiled. It would have removed nothing and
destroyed the organisation of most of the content. The instruction was based on
a misreading (604 *headings*, not 604 *questions*) that our own earlier summary
had caused.

### How the translations were produced

14 parallel agents, batched BY SUBJECT so each had the domain context that
decides terminology — `Fotoeffekt` is the photoelectric effect, not a photo
effect; `intensivlik` is field strength / напряжённость, not "intensity". Each
row carried its grade and parent topic, because the parent is what disambiguates.

Every row was then checked mechanically before any SQL was written: all ids
present exactly once, no empty field, no Azerbaijani letters left in the English,
real Cyrillic in the Russian, no heading turned into a sentence. **The generator
refuses to emit the migration if any check fails** — a half-translated curriculum
is worse than an untranslated one, because nobody can tell which half.

Two rows tripped the "English identical to the source" check and were CORRECT:
`Median` and `Monitor` are international terms that do not change. The check was
narrowed rather than removed — identical English is accepted only when the
Russian is Cyrillic and different, which is the real evidence that the row was
considered.

### The race, and the rule it produced

The first production run **failed and rolled back**: it asserted that no subtopic
anywhere was untranslated, and the content team had created 39 more in the two
hours the translation took. That is normal work, not a defect.

**A migration that cannot succeed while people are using the product is a
migration that never succeeds.** The assertion now covers every row the file
TARGETED; anything created afterwards is reported as a notice and shows up on the
Curriculum page counter instead. The 39 were translated and included, so 643
shipped in total.

### Migrations

- **152** — `curriculum_translation_gaps()`, surfaced on the admin Curriculum
  page in all three languages, shown only when non-zero. This is the durable fix:
  the next backlog is visible at row 6, not row 604.
- **153** — the 643 translations. Idempotent (upsert on the existing
  `(subtopic_id, locale)` key), data-only, nothing to backport.

Both applied staging → production. The translations are DRAFTS in the sense that
no human has reviewed them; every one is editable in place on the Curriculum
page, and `docs/investor/CURRICULUM_MISSING_TRANSLATIONS.csv` holds the original
604 for review.

## CURRICULUM 2026 — AZƎRBAYCAN DİLİ IMPORTED, 604 SUBTOPICS DELIBERATELY KEPT (2026-08-27)

Source: `docs/investor/Kurikulum_1-11_AZ_EN_RU_UPDATED.docx` →
`supabase/seed/curriculum_2026_updated.json` (1,165 rows). The three language
sections were aligned **positionally and verified on grade+term**, not by matching
text — topic names are translated, so text matching would be circular. The
extractor asserts the three sections are parallel and aborts if they are not; its
first run silently produced `az=1165 en=0 ru=0` because the grade heading is
written in each section's own language (`1-ci sinif` / `Grade 1` / `1-й класс`),
and only that assertion caught it.

### What the file actually contained

Almost nothing new. **1,077 of its 1,165 subtopics already existed.** The only
subject with no taxonomy at all was **Azərbaycan dili** — 44 topics, 88 subtopics,
grades 1–11 — which is exactly what migration 151 adds, with en/ru translations
and 3/9/90 AZN pricing to match every other sold subject.

### The finding that decided the approach

The database holds **604 subtopics that are NOT in the file, and they carry 3,958
questions** — nearly the entire bank of 4,441. The 1,077 rows that ARE in the file
carry **483**. Every one of the 604 is untranslated, which is what identifies them:
the earlier import created en/ru rows only for the rows it knew about.

So the file is **not a superset of what the platform runs on**. The questions were
imported against a taxonomy the file does not describe. Deleting the leftovers
would have set `questions.subtopic_id` to NULL on 3,958 rows (the FK is
`ON DELETE SET NULL`), detaching most of the bank from the curriculum tree while
leaving every question still servable and untraceable — a silent, invisible loss.

**Owner + investor agreed rule, and what shipped:** add what is new, keep anything
with questions attached, report the rest. Nothing was deleted, no term was
rewritten, and the count is printed by the migration's own verification block so
it is on the record rather than in a chat message:

    151: KEPT 604 subtopic(s) outside the 2026 file, carrying 3958 question(s).

### Fizika 7–11 — enforced by DATA, not a hardcoded floor

The investor's instruction was that Fizika must not appear below grade 7. It is
correct in the database already (topics for 7–11 only). The place it could still
leak was the SUBJECT LIST: an earlier fix this same day had the child arena list
**every active subject** during a free window, which would have offered Fizika to a
grade-3 child.

Both call sites (`lib/childSubjects.ts`, `app/child/page.tsx`) now list a subject
only when it has at least one exam topic **for that child's grade**. Derived from
the topic tree, so it stays correct when any subject's range changes and needs no
maintenance. Verified on production: grades 3 and 6 offer six subjects, grades 7
and 11 offer seven.

### Migration 151

Data-only, no schema change, nothing to backport. **Idempotent by construction** —
neither natural key has a unique constraint (checked), so every insert is guarded
by `NOT EXISTS`; proven by running it twice on staging, the second run inserting 0
with every assertion still passing. Conventions were copied from the 260 existing
topics rather than invented: `name` holds the Azerbaijani text with en/ru in the
`*_translations` tables, and `topic.term = min(subtopic.term)`, which is true of
all 260.

**Still open, deliberately:** the 604 leftovers and the term values on the 1,077
shared rows. Reconciling either is a content decision, not a migration, and it was
not in the approved scope.

## PINNED — RLS EVALUATED is_admin() ONCE PER ROW (2026-08-27, FIXED)

**Symptom:** the admin Questions page showed "The question list could not be
loaded" while the stat cards above it rendered fine. **Cause:** RLS, not the page.
**Result: 9.7s -> 127ms** on the query that was failing.

### Two wrong diagnoses before the right one, recorded because the method matters

1. *"Eight `count: exact` scans per page view."* Real and worth fixing (migration
   148 folds them into one RPC, 240ms) — but NOT the cause. The page still failed
   after it deployed.
2. *"RLS is expensive for non-admins."* Reproduced a 57014 timeout with a real
   authenticated session, then assumed admins were exempt because `is_admin()`
   short-circuits. **An admin token timed out too.**

What settled it was `EXPLAIN (analyze, buffers)` on the failing scan rather than
another hypothesis. The plan named a permission — `content.publish` — that appears
in NO select policy, which is what exposed the real shape.

### The mechanism

`is_admin()`, `has_permission()` and `current_profile_id()` are STABLE, so in an
ordinary WHERE clause the planner hoists them to an InitPlan and calls them once.
**In a policy predicate they are evaluated PER ROW.** Each is itself a query
(`is_admin` -> `has_role` -> a join over `profile_roles`), so a scan of 21,934
`question_translations` rows became ~22,000 nested queries: 0.44ms x 21,934 = 9.7s,
past the `authenticated` role's `statement_timeout = 8s`.

It surfaced now because it scales with the EMBEDDED table, and the bank went from
492 to 4,441 questions in one afternoon of imports. Nothing about the page changed.

### The fix, and the two traps inside it

`(select public.is_admin())` — a scalar subquery with no outer reference is an
InitPlan by construction. Same value, computed once. No policy gains or loses a row.

**Trap 1 — a `for all` policy is also a READ policy.** Migration 149 hoisted the
five `_select` policies and the count did not move. Permissive policies are OR-ed,
and the un-hoisted `qtrans_write` (`for all`) sat FIRST in the OR list, short-
circuiting the very InitPlans 149 had just created — the plan showed them as
"never executed". Migration 150 fixed the four `_write` policies and the time
collapsed. **Fix every permissive policy on a table, or none of them matter.**

**Trap 2 — I introduced a data leak and caught it by measuring.** 149's first
version rewrote the predicates and dropped the `to authenticated` clause;
`create policy … for select` with no `to` defaults to PUBLIC, which includes anon.
Anon's visible rows went **0 -> 2,836 questions** with translations and answer
options. Caught by comparing anon's counts before and after — which is why that
comparison is run rather than assumed — corrected within minutes, and now asserted
inside both migrations. **Never rewrite a policy header while rewriting its
predicate.**

### Verified

| | before | after |
|---|---|---|
| `count(*) question_translations` as admin | 9,700ms | **127ms** |
| the page's actual PostgREST request | HTTP 500, 8.2s, 57014 | **HTTP 206, 1.26s** |
| rows visible to the admin | 21,934 | 21,934 (unchanged) |
| rows visible to anon | 0 | **0** |

Applied staging -> production. Backported into canonical `010` (48 calls across 9
policies). A temporary admin account created on production to reproduce the failure
faithfully was deleted afterwards; `auth=0 profiles=0` confirmed.

### STILL OWED — 135 more policies

**140 policies in this database call these functions unwrapped.** The nine fixed
here are the question family. Every other one degrades the same way as its table
grows, and the tables most likely to hit it next are the ones bulk operations
touch: `answer_options` siblings are done, but `test_attempt_answers`,
`notifications`, `media_assets`, `entitlements` and `news_translations` all carry
the pattern. This is a mechanical sweep — same rewrite, same two traps — and it
should be one reviewed migration per related group, never a single 140-policy
change. Nothing is broken today; it is a clock.

## OLYMPIAD POOL REPLACEMENT — CONFLICTS RECORDED BEFORE ANY CODE (2026-08-27)

Owner spec: remove Topic from olympiad question management, add a multi-select Grade
filter, add bulk select/Delete/Archive, and add a **full-replacement** bulk upload
(100 existing + upload 50 = exactly 50). Recon: 8 agents over the SQL, the admin
panel and the attempt engine. CLAUDE.md requires conflicts be written here before
the code changes, and this feature permanently deletes question rows, so:

### The live bug the recon found, which is NOT part of the spec

**A pool that falls below `questions_per_attempt` silently serves a SHORT olympiad.**
The activation guard fires only on a transition INTO `active` or a RAISE of
`questions_per_attempt`. **Nothing fires on a pool shrink.** And
`start_olympiad_attempt` does not refuse — it clamps:

```
v_n := least(v_pkg.n_per, cardinality(v_pool));   -- 011:6186
```

So a family that paid for a 25-question olympiad can be served 10, with no error and
no notice to anyone. This is reachable **today** through the existing per-question
delete and archive actions; the replacement feature would merely make it easier. Fix
it in this change regardless of the rest.

### Blocking conflicts, and how each resolves

1. **§7 "completely removed from the database" vs `trg_question_delete_guard`.**
   `test_attempt_answers.question_id` is `ON DELETE CASCADE`
   (005:64) and olympiad attempts carry **no content snapshot** — `get_test_review`
   joins LIVE questions for any attempt with `daily_round_id` null (011:7862-7930),
   and `submit_test_attempt` froze `max_score` as the answer-row count (011:7668).
   Hard-deleting an answered question destroys the graded row *and* leaves `max_score`
   describing rows that no longer exist.
   **Resolution — the split §7 itself allows:** never-answered questions are HARD
   DELETED (row gone, all cascade children gone); answered questions are ARCHIVED.
   That is exactly §7's "strict technical dependency that requires historical
   records" and §9's "adjust the model rather than sacrifice history". Archiving
   removes them from the ACTIVE pool completely — every draw filters
   `status='published'` (011:6176 olympiad, 011:8030 daily, 011:5586 practice).
   **Consequence for §12:** on an answered pool, Delete and Archive converge. The
   button must say so rather than promise a purge the guard will refuse.

2. **§5 + §8 — replacement on a PURCHASED grade.** Both existing pool guards evaluate
   the POST-DELETE state, so for a full replacement every published row is "leaving",
   `v_left = 0 < required`, and the operation is REFUSED — on exactly the packages
   this matters for. `grade_has_purchases_purge` refuses unconditionally.
   **Resolution:** the rule is a POSTCONDITION, not a prohibition on removal — *a
   purchased grade's published pool must still fill one attempt AFTER the operation*.
   Write a replacement-specific predicate over
   `(old_published − leaving + newly_inserted)`, delegating the purchase count to
   `olympiad_grade_purchase_count` (015:1381). Never re-implement what counts as a
   purchase; migration 112 extracted that helper precisely to stop the duplication.

3. **§5 "exactly 50" vs the append dedupe snapshot.** `bulk_insert_olympiad_package_questions`
   skips rows whose content already exists in the pool. On a replacement the snapshot
   poisons the count either way: purge-first leaves archived survivors in it, so a
   re-uploaded file imports 47 of 50 and reports success; insert-first is worse.
   **Resolution:** a replacement has nothing to dedupe against by definition. New RPC
   whose insert path sees an empty published snapshot. **Never change the arity of
   the existing importer** — `olympiad-dup-key.test.ts` asserts its body byte-for-byte
   against migration 119, and migration 108's header forbids a 4th parameter.

4. **§6 atomicity.** A delete-then-upload sequence leaves a window in which the pool
   is EMPTY: `start_olympiad_attempt` raises `no_data_found` (011:6180) and every
   lifetime purchaser opening the olympiad in that window gets an error — a direct
   §8 violation.
   **Resolution:** ONE `SECURITY DEFINER` RPC, `select … for update` on the package
   row, and inside that single transaction: insert new → purge/archive old → reset
   rotations → assert the floor → return orphaned media ids. Parsing, per-row
   validation and the media phase stay in the server action ahead of the call (§6,
   §10). Validate the floor BEFORE removing anything, so **no status flip is ever
   needed** — which also removes the only purchaser-visible side effect.

5. **§6 partial failure.** The append path reports bad rows individually and commits
   the rest. On a replacement that would destroy the old pool and leave the new one
   short. **Resolution:** replacement is strictly all-or-nothing — any failed row
   raises and rolls the whole transaction back. This deliberately diverges from the
   append path and must be stated in the RPC comment so nobody "harmonises" it later.

### Important, not blocking

- **The 500-id cap.** The bulk RPCs cap at 500 ids, so §3's header select-all on an
  800-row pool would be refused *after* the admin confirmed. Scope the replacement by
  `(package, grade)` — as `admin_delete_olympiad_grade_pool` already does, uncapped —
  and enforce the 500 client-side for the §4 Delete/Archive buttons.
- **Media orphans.** Removing question rows does not remove their images; they stay
  publicly fetchable in `question-media` forever, so §7 is not actually satisfied
  by SQL alone. Route the return value through the existing
  `afterOlympiadDestructiveCall` sweep and surface `media_truncated` (a full-pool
  replacement can exceed the 2000 cap) instead of silently leaking the remainder.
- **§1 Topic removal needs NO migration.** `topic_id` is already nullable and both
  guards carve out olympiad rows explicitly — `question_taxonomy_guard` (011:1560)
  and `question_term_guard` (011:1493) each test `olympiad_package_id is null`. Two
  traps: stripping the topic block out of the importer FAILS 013 check 59 and turns
  a UI change into a migration; and removing the form field while leaving the UPDATE
  object writing `topic_id: null` would silently untag every pool question that has
  one. **OMIT the field from the UPDATE; leave the RPC alone.**
- **The grade filter can hide rows from a destructive action.** `selected.has(r.gradeId)`
  silently drops grade-less rows and rows whose grade is no longer a package target —
  and §3's select-all plus §4's bulk Delete would then act on a set the admin never
  saw. Build the options as the UNION of row grades and package target grades, add a
  NO_GRADE sentinel (the existing topic filter already does this with a `" none"`
  sentinel), and keep the filter INSIDE the existing `filtered` memo so the
  selection-pruning invariant holds.
- **Rotations and in-flight attempts are safe.** The prune collapses the seen array
  and the student draws from the new pool as if fresh; pre-created answer rows make
  in-flight questions undeletable, so they are archived and the runner is unaffected.
  Keep the `live_attempts` refusal on the replacement path. One cosmetic effect to
  warn the owner about: an in-flight attempt on the old pool loses its Continue tile.
- **§8 requires NO code.** Nothing notifies purchasers of a pool change today, and
  `can_view_olympiad_package`'s purchase branch never reads `status`. Add no
  suppression flag; touch no entitlement and no `olympiad_purchases` row.

### Not a conflict, recorded to stop it being re-litigated

"Never delete purchased olympiad package records" names the PACKAGE row and the
PURCHASE row — not the questions in the pool. Migration 094 emptied eight package
pools while honouring the rule in full. The protection that rule stands for is the
purchased-grade floor in conflict 2, which must not be dropped.

## PINNED — APPLE REJECTED THE BUILD FOR A SERVER FLAG (2026-08-26 → FIXED 1.12.3)

**Guideline 2.1.0 Performance: App Completeness.** Apple screenshotted the parent
Subscription tab showing *"Plans & subjects — Payments are temporarily paused. New
subscriptions and purchases are unavailable right now."*

That string is `gate.paymentsOff`, a **WEB** string, rendered because three parent
screens branched on `posture.paymentsOff` — a value derived from a database row. The
finding was correct and the wording was the symptom, not the disease:

> **Payment posture is a BUILD-TIME constant, never a server flag** (CLAUDE.md).

A store binary whose visible behaviour changes with a row is the problem; which
sentence that row produced is incidental. The remediation removed the dependency,
not the sentence.

### Everything the sweep found, and what each one actually was

The screen Apple named was the fourth-worst of six. Ranked by how a reviewer meets
them:

| # | Where | What it did | Severity |
|---|---|---|---|
| A3 | `(public)/privacy.tsx` | Rendered `privacy.s8.statusOff` — *"payments are switched off on the platform and no payment provider has been integrated yet"* | **Worst.** Reachable **pre-login**, one tap from `login.tsx` and `register.tsx`. An app telling a signed-out reviewer it is unfinished. |
| A2 | `children/[id]/subscribe.tsx` | Checked `paymentsOff` **before** rendering the live subscription, so a family with a real active plan saw only "not managed here" | Not just review risk: **suppressed a real entitlement**, and `off` is the client's fail-closed default, so a failed config RPC blanked it for everyone |
| A1 | `(tabs)/subscription.tsx` | The string Apple screenshotted | Fixed first |
| A6 | `features/profile/studentSections.tsx` | `stk.empty` = *"No sticker themes yet — coming soon!"* under its own heading | Production has **zero** enabled themes (created disabled; a trigger refuses enabling under 6 images), so every reviewer saw it |
| A7 | `add-child.tsx` + DB | `mob.addchild.idPending` promised the 8-digit ID *"as soon as a subject subscription is active"* — with payments off, **no screen in the app could bring that about** | See migration 146 below |
| A5 | `app.json` | `faceIDPermission` Azerbaijani-only, while camera/photo were English-only, under `CFBundleLocalizations` az/en/ru | 5.1.1 hygiene |

### Migration 146 — the defect that was not an Apple problem at all

`create_child_account` deliberately returned a NULL login id; the 8-digit number was
allocated later by `create_child_subscription`, on the reasoning that a child with
no plan has nothing to log in to.

That reasoning stopped holding the moment the payments kill switch was thrown. With
payments off no subscription is ever created, so **no id is ever allocated**, and
Add-Child completed into an account that could never be used — a child signs in with
only that id plus the parent's password.

**Measured on production before the migration: 2 of 6 children had no id.** Both
repaired (still `inactive` — the migration grants no access).

**Identity is not entitlement.** The id says who the child IS; `access_status` stays
`inactive` and every paid gate is untouched. `allocate_child_unique_id` re-reads the
registry before minting, so the later call inside `create_child_subscription` is a
no-op. Probed 5/5 on staging (id shape, credential agreement, still-inactive,
no-subject-access, idempotent re-allocation), applied to production, backported to
canonical `011` (159 functions).

**The half SQL cannot do:** a child signs in through a synthetic auth email derived
from the id (`c<8digits>@children.invalid`), which lives in Supabase Auth, not in the
database. The web-app half now applies it at creation and **fails the creation** if
it cannot — a child with an id but no auth email still cannot sign in, so it is not
best-effort. The two repaired children need theirs set through the admin API; they
are test accounts (see Human Next Actions).

### What is now structurally impossible

`__tests__/no-payment-state.test.ts` — **12 source-level assertions**. It does not
render screens; it asserts no screen *imports the vocabulary*, so a re-introduction
shows up in a diff and a red test rather than in a rejection eight days later:

- no file renders `gate.paymentsOff` / `gate.giveawayFree` / `gate.freeAccess`
- `privacy.tsx` renders neither `s8.statusOn` nor `s8.statusOff` — **and still
  renders `s8.list`**, so removing the status cannot quietly remove the disclosure
- neither `subscription.tsx` nor `subscribe.tsx` branches on `posture.paymentsOff`
- no file renders `stk.empty`; `mob.addchild.idPending` no longer exists

`paymentsOff` survives in `commerce.ts` only to compute `freeFlow`. All four file
headers that documented the old behaviour were rewritten — a stale header is how the
next change re-introduces this in good faith.

**And the catalogue was stale.** Re-running `scripts/sync-i18n.mjs` pulled **21
`terms.*` keys** into the mobile bundle — the `/terms` purchase-terms page: *"each
subject has its own price"*, *"by proceeding to payment you accept these terms"*,
*"all payments are in Azerbaijani manat"*. No mobile screen renders them, which is
exactly the state the `trial.*` keys were in before one nearly got rendered. The
script now drops the whole `terms.` prefix (no allowlist — unlike the trial, where
mobile legitimately shows the STATE of a free day, there is no member of this group
the app has any business displaying). Bundle: 1446 → 1425 keys per locale.

### Copy that was false, found by the same sweep

The privacy policy's payments section (§8, web + mobile + `docs/PRIVACY_POLICY.md`)
was written before the bank rail existed and never swept afterwards:

- **Future tense throughout** — "payment *will* use a full redirect", "card details
  *will never* reach our servers", "our database *will* record". All three are
  present-tense facts since the AzeriCard production terminal cutover.
- `statusOff` claimed **"no payment provider has been integrated yet"**. False. The
  provider is integrated and a real 1 AZN charge was taken and reversed end-to-end.
  One sentence describes an unfinished product; the other describes a setting.
- `statusOn` promised **"the mobile app may show subscription prices"**. Also false,
  in the direction that gets an app rejected — every price was deliberately stripped
  from the mobile binary.

Corrected in all three locales, and in the `docs/PRIVACY_POLICY.md` mirror that
Apple and Google actually fetch. **This is the fourth instance of the PINNED
2026-08-26 pattern**: a change to what the product does, and nothing swept the copy
it falsified.

### Build 1.12.3 — an EAS BUILD, not an OTA update

`app.json` gained `expo.locales` → `mobile-app/locales/{az,en,ru}.json`, which
become `<lang>.lproj/InfoPlist.strings`. That is **native configuration**: no EAS
Update can carry it. And `runtimeVersion` is `appVersion`, so an update published for
1.12.1 never reaches a 1.12.2 binary in either direction.

`docs/APP_REVIEW_NOTES.md` rewritten: §0 is the Resolution Center reply (with an
explicit *what NOT to write* list — do not offer to switch payments on, do not cite
3.1.3(b), whose own proviso requires matching IAP), the recording script now
includes Add-Child because it ends on a real ID, and the obsolete §4a is gone.

**Verification:** mobile 483/483 jest, web 644/644 vitest, both typechecks clean.

### THE FLAGS WENT ON THE SAME DAY (owner, 2026-08-27) — and falsified two documents

`payments` AND `giveaway_period` are both ON as of 2026-08-27 08:42 UTC, giveaway
duration 30 days, so `current_payment_mode()` = **`giveaway`** until **2026-09-26**,
after which it falls through to `real` on its own. Three consequences, two of them
defects created by the flip:

1. **The live privacy page went false within the hour.** `paymentsLive` is
   `mode === 'real'` and nothing else, so an ACTIVE GIVEAWAY renders the SAME branch
   as the kill switch — and that branch had just been rewritten to say *"no new
   subscription can be started"*. During a giveaway new subscriptions are started
   constantly, free. One string has to be true of both states, so it now asserts only
   what they share: **no card payment is being taken**. It claims nothing about what
   can or cannot be started. Fixed in all three locales and in the
   `docs/PRIVACY_POLICY.md` mirror. *(Fifth instance of the PINNED 2026-08-26
   pattern, and the fastest — the copy was falsified by a flag flip, not a migration.)*

2. **`docs/APP_REVIEW_NOTES.md` §4 told Apple the opposite of what happens.** It said
   a newly created child "will see subjects as not yet active"; during the giveaway
   they are opened immediately. Corrected, and given a **dated caveat** — this is
   copy with an expiry date (2026-09-26), which is a shape this repo has no other
   defence against.

3. **The mobile bundle carried the whole web paywall.** Re-running the sync exposed
   **96 unrendered `pricing.*` keys** — `"≈ {price} AZN"` for all three intervals, the
   sibling-discount table, "the prices shown are placeholders", and a stale 7-day
   trial line migration 142 retired. The app renders exactly **three** of them, and
   they are interval LABELS ("Weekly"), not amounts. No component renders an amount,
   so this was never a live price display — dropped anyway, because *"the app
   contains no price of any kind"* is the strongest sentence in the letter to Apple
   and it should be true of the BUNDLE, not of today's render path. Together with
   `terms.*`: **261 keys dropped, 1395 per locale, zero occurrences of "AZN".**

### A SIDE EFFECT OF 146: the H8 free-activation button is now unreachable

`FreeActivation` (web `children/[id]/subscribe/page.tsx`) and its mobile twin render
only when `!sub?.id && !child.child_unique_id`. Migration 146 gives EVERY child an id
at creation, so that second clause is now false for everyone and **the button can
never appear again.**

**This is correct, and it must not be "fixed" by loosening the condition.** The
button existed because a free window could dead-end a child who had no login id;
146 removed that possibility at the source, and `createChild` now FAILS the whole
creation if the synthetic auth email cannot be applied, so no new child can reach
the broken state. The copy is also specific — `freeact.note` reads "This child
doesn't have a login ID yet" — so a looser condition would make the button lie.

Left in place as a safety net for a child row that somehow has no id. The two
production children that were stranded pre-146 therefore cannot be repaired through
any UI: their 8-digit ids exist, but their Supabase Auth email is still
`pending-<uuid>@children.invalid`, and nothing in either app rewrites it. **Delete
and re-create is the supported path**, and it costs nothing — those ids only came
into existence with 146 and have never been usable, so no external record refers to
them.

**Still a judgement call, deliberately NOT changed:** `addchild.giveawayGranted`
renders *"The free promo period is active — everything is unlocked for your child
right away!"* That is a server-flag-driven platform-state message, the same shape as
the rejected one. It is defensible — it announces AVAILABILITY, where 2.1.0 is about
unavailability, and it steers nowhere — but "free promo" does imply paid-later. If it
is ever reworded, state the family's entitlement, not the campaign.

## PINNED — THREE THINGS THAT WERE FALSE ON SCREEN (2026-08-26)

A round of audits turned up the same defect shape three times: **a migration
changed what the product DOES and nothing swept the copy it had just falsified.**
Recorded together because the pattern matters more than any one instance.

1. **The pricing page promised a 7-day free trial** that migration 142 had removed
   the previous day, in all three languages, with the Azerbaijani version also
   claiming card details were required -- never true of the pre-purchase trial.
2. **The subscription detail page told admins "no real payment provider is
   connected yet -- no money moved for this access"**, rendered UNCONDITIONALLY,
   directly beneath a green pill naming the card rail. Since migration 137 stamps
   `provider='azericard'`, the FIRST REAL CUSTOMER would have produced a screen
   telling an admin their payment was comped -- an invitation to revoke access
   somebody paid for. Also `KNOWN_PROVIDERS` omitted `azericard`, so the filter
   silently discarded that value and an admin could not list card-paid
   subscriptions at all.
3. **The Notifications page said email sending "is not connected yet"** -- stale
   since migration 116 shipped the Brevo transport, and actively misleading once
   138 wired the channel.

All three fixed. **There is no test that catches this class.** A migration touches
SQL; the copy lives in three `messages.ts` files and a dozen `labels.ts` files, and
nothing links them. The only defence is to sweep the copy for what a migration
invalidates, in the same change.

### NEWS LINKS — clickable on the web, deliberately inert in the app

Owner report: an admin pastes a URL into a news body and it renders as plain
text. The obvious fix -- render the body as HTML -- was REJECTED, and not on
taste:

- `script-src` carries `'unsafe-inline'` because Next hydration needs it, so an
  injected `<img src=x onerror=...>` **executes**. The CSP is not a backstop here.
- Supabase auth cookies are **not httpOnly** (the browser client reads them from
  `document.cookie`), so a stored payload in a news body is **token theft**.
- One component (`NewsArticleView`) serves anonymous visitors, a payment-bearing
  parent session and a minor's screen.

`web-app/src/lib/cmsLinkify.ts` produces **DATA, never HTML**: text segments
become React children (React escapes them) and the only element the code
constructs is an `<a>`. The single attacker-influenced value in the whole path is
an `href`, which reduces the review to URL-scheme whitelisting. The app's HTML
sink count stays at ONE (the notification markdown renderer, which escapes first).

**A data migration was rejected** for a reason worth keeping: `BODY_MAX` is 20000
and rewriting URLs into markdown roughly DOUBLES them. A link-heavy article would
cross the cap, be silently truncated at render on both platforms, and then never
be savable again -- the edit form reloads the oversized body and every save fails
validation. Render-time linkification fixes every existing article, in every
locale, at deploy, with no database work at all.

**MOBILE STAYS INERT, and this is not a scoping preference.** A news body is an
ADMIN-CONTROLLED STRING, and a store build may not open an external https link
from one (Apple 3.1.1(a) dynamic steering; the body renders on STUDENT screens,
so a tappable admin URL is an ungated link-out to a minor). `sync-i18n.mjs` now
carries an ALLOWLIST -- mobile receives only the NINE `trial.*` keys it renders;
108 web-only strings are dropped at sync time -- and `store-copy.test.ts` derives
its sweep from the catalogue instead of a hand-written list. **It caught the leak
on its first run:** `trial.hero.body` reads "Try the platform before you
subscribe" in English.

33 web tests (every hostile input: `javascript:`, `data:`, `blob:`, mixed-script
homographs, userinfo smuggling, `evil-olympiq.ai`), 8 mobile structural tests.
**v1 limit, by design:** bare URLs only -- `[label](url)` renders literally.

### MIGRATION 144 — ARCHIVING COULD SILENTLY SHORTEN A PAID OLYMPIAD

APPLIED to staging + production, backported, production `013` **128/0**.

`admin_delete_olympiad_questions` was carefully guarded. **Archiving had none of
those guards** -- `setOlympiadPoolQuestionStatus` was a bare
`update questions set status='archived'` with no purchase check, no floor check,
no demotion, and no trigger covering it. Yet archiving removes a question from
play EXACTLY as deleting does, because every draw path filters
`status = 'published'`.

**And it was silent.** `start_olympiad_attempt` draws
`least(questions_per_attempt, |pool|)` and does NOT raise on a short pool -- it
serves a shorter olympiad. So archiving a purchased grade's pool gave a paying
family fewer questions than they bought and told nobody: not the child, not the
parent, not the admin who did it.

A per-row hazard becomes a ONE-CLICK hazard the moment it is bulk-enabled, which
is why the RPC exists before the UI does. Archive now carries the delete path's
guards: package lock, confirmation code re-checked under it, all-or-nothing scope
proof, the SHARED purchased-grade predicate (never a second copy), auto-demotion.
**8/8 probes**, including the decisive one -- and the probe earned its keep twice
by failing first on my own fixtures rather than on the code.

### OWNER DECISIONS, 2026-08-26 (olympiad bulk management)

1. **"Replace" = APPEND FIRST, THEN RETIRE**, as two separately-audited steps.
   Order is load-bearing: append-first keeps the published pool above the floor
   throughout, so neither the purchase refusal nor the auto-demotion fires.
   Retire-first is UNCONDITIONALLY IMPOSSIBLE on a purchased grade and silently
   demotes an active package on an unpurchased one. A one-click replace is not
   available: `trg_question_delete_guard` aborts the whole transaction on the
   first answered row, and the uploader cannot gain a mode parameter without
   minting a second overload that breaks PostgREST resolution and 013 check 79.
2. **Bulk Archive is BLOCKED below the floor**, same terms as Delete.
3. **Fix the topic filter, CUT bulk Edit** -- it would touch answer options,
   where changing ids invalidates the answer history pointing at them, for a
   workflow nobody has described a concrete need for.

### A LIVE BUG THE POOL WORK UNCOVERED

**The pool fetch was unbounded.** PostgREST caps one response at max-rows (1000),
so a larger pool rendered SILENTLY TRUNCATED -- and the header checkbox promising
*"select every question on screen"* selected the first 1000 while the admin
believed they had all of them. Every bulk action would have inherited that. Now
pages until a short page arrives, and carries `topic_id` so the filter can exist.

### Still to build

- Finance view: three screens designed, not built. Its landing item is the gap
  only it can see -- **a family whose money landed but whose basket was never
  delivered never reaches the review queue**, because `listCheckoutReviews`
  filters `redeemed_at is not null`.
- Olympiad: bulk archive/restore BUTTONS and the pre-flight floor preview. The
  RPC, the action and the filter are done.

## PINNED — THE PRODUCTION RAIL IS PROVEN; REFUNDS ARE NOT (2026-08-25 — IN PROGRESS)

### What is proven

The first real charge on the **production** terminal `17205829` succeeded end to
end on 2026-08-25: order `20260825281545`, RRN `623780367803`, 1.00 AZN, paid from
the owner's own card through a genuine 3-D Secure OTP.

Four checks, all passing:

| check | result |
| --- | --- |
| `checkout_sessions` | `kind=protocol_test`, `intent_kind` NULL, `status=paid` |
| `payments` | `succeeded`, 1.00 AZN |
| `payment_events` | **`cb:20260825281545`** |
| entitlements created | **0** |

**The `cb:` prefix is the load-bearing evidence.** It means the bank's SIGNED
callback verified against `AZERICARD_MPI_PUBLIC_KEY_B64`. Had that key been the
sandbox one, the callback would have been refused before touching the database and
only a `recon:` row from the sweep would exist. So both halves of the key pair are
confirmed: the PRIVATE key by the bank accepting our signed request and charging
the card, the PUBLIC key by us accepting theirs.

`protocol_test` carries `intent_kind IS NULL` and therefore cannot grant anything
-- which is why the test cost 1 AZN and left nothing to clean up.

### Two defects found on the way, both fixed

**1. The sandbox key pair almost went live.** `web-app/.env.local` is the TEST
config (terminal `17205223`, `testmpi.3dsecure.az`), and both key variables were
sourced from it. A hash comparison against the repo-root pems showed
`AZERICARD_PRIVATE_KEY_B64` -> `olympiq_test_private_key.pem` and
`AZERICARD_MPI_PUBLIC_KEY_B64` -> `azericard_mpi_test_public_key.pem`.

**Config validation could not have caught this.** `computeConfigProblems()` checks
only that each value is a well-formed RSA PEM of sufficient modulus -- a TEST key
passes every one of those checks and the endpoint reports `configured: true`. A
wrong-but-valid key is invisible to us; only the bank can reject it. The correct
sources are `olympiq_prod_private_key.pem` and `azericard_prod_mpi_public.pem`,
the latter verified byte-for-byte against the key the bank sent in
`OLYMPIQ_PRODCONFİG.txt`.

*Second-order lesson:* the variable names end in **`_B64`**, not `_B`. A grep
pattern of `AZERICARD_[A-Z_]*` truncates at the digit and yields the wrong names,
which would have produced inert variables that break nothing visibly.

**2. The reconcile sweep was dead for 75 minutes and said nothing.**
Regenerating `PAYMENTS_RECONCILE_KEY` updated Vercel but not the Vault secret
`azericard_reconcile_key`. `net._http_response` shows 62 x `200` up to 10:45 UTC,
then `401 {"error":"unauthorized"}` every 5 minutes from 10:50 to 12:00.

The failure is **silent by construction**: `azericard_reconcile_kick()` fires the
request through `pg_net` and never reads the HTTP result, so pg_cron records every
poisoned run as a success and the job stays `active`. The only evidence is
`net._http_response`, which pg_net prunes. **Nothing alarms.**

*And the repair had its own trap.* `vault.update_secret(id, new_secret)` accepted
an EMPTY string when the psql variable was unset and reported `(1 row)` -- the
secret decrypted fine at **length 0**, and the kick then failed closed with
`not configured (vault secrets missing)`. A write that stores nothing and reports
success is the same class of defect as the migration-132 probe that tested nothing:
**it reads as coverage.** Always re-read the length after writing a secret.

*Mechanical note:* `psql -c` does NOT interpolate `:'var'`; piping the SQL through
stdin does.

### What is NOT proven

- **The redemption path has never run on production.** `protocol_test` carries no
  intent, so subscription -> entitlement -> `source='abb_web'` is proven on STAGING
  only. Production differs in one live way: `launch_promo` is ON there, which zeroes
  the trial and charges immediately. Worth one 3.00 AZN purchase with a throwaway
  child before real families arrive.
- **Refunds do not exist.** See below.
- One successful charge proves one card, one issuer, one 3DS flow. It does not
  prove concurrency, a declined card's UX, a duplicate callback, an abandoned
  checkout resumed later, or the `needs_review` path.

### NO-REFUND POLICY (owner decision, 2026-08-25) — supersedes the refund-capability build

**The platform does not refund.** A parent who cancels keeps access until the end
of the period they already paid for, and no money is returned. Olympiad packages
are lifetime and are never refunded once delivered. Design work on an admin refund
feature was started on 2026-08-25 and **stopped on the same day** by this decision.

**The code already implements exactly this rule** -- no change was required:

- `cancelChildSubscriptionCore` (`web-app/src/lib/auth/subscriptionCore.ts:570-576`)
  flips the live subscription to `canceled`, keeps access until
  `current_period_end`, and states in its own comment that *"a cancellation refunds
  nothing by rule"*. `recompute_child_access()` downgrades access once the period
  passes.
- The subject editor already tells the parent, in all three locales:
  `subjedit.noteNoRefund` -- *"Silinən fənlərə görə geri ödəniş edilmir. Qalan
  fənlər öz dövrləri ilə davam edir."*
- Purchased olympiad packages are already never deleted (listings archive only;
  purchasers keep lifetime access via the purchase branch of
  `can_view_olympiad_package()`).

**What is still owed, and it is NOT a feature -- it is disclosure.**

- [ ] **State the no-refund and cancellation policy in the Terms & Conditions, and
      show it at checkout before the parent confirms.** Visa and Mastercard both
      require a merchant's refund/cancellation policy to be disclosed at the point
      of sale; an UNDISCLOSED no-refund policy is a chargeback the merchant loses
      by default. This is the single highest-value item attached to this decision.
- [x] **Manual reversal runbook -- WRITTEN AND PROVEN on the production terminal,
      2026-08-25.** See the reference section below. Refund policy and reversal
      capability are different things: a duplicate charge, a charge against the
      wrong child, or a card-scheme chargeback still needs correcting, and those
      are error correction, not refunds.
- [x] Order `20260825281545` (1.00 AZN) **REVERSED 2026-08-25**, money confirmed
      received back by the owner. `payments.status` corrected to `refunded`.

## REFERENCE — HOW TO REVERSE A CHARGE (proven 2026-08-25, production terminal)

Keep this. It is the whole procedure, with the traps already paid for. Under the
no-refund policy this is for ERROR CORRECTION -- a duplicate charge, a charge
against the wrong child, a card-scheme chargeback -- not for customer refunds.

### The one thing that matters most

`reverseTransaction()` returns an `acknowledgement` that is **never conclusive**.
On the real reversal of `20260825281545` it returned **`unknown` on HTTP 200** --
and the reversal had in fact SUCCEEDED. The value is only ever `accepted` or
`unknown`, never `declined`, by deliberate design (`interpretReversalResponse`).

> Nothing may act on the acknowledgement alone; only a `TRAN_TRTYPE=22` status
> query establishes a reversal.

An implementation that treats the first response as the answer will report failure
on successful reversals and may retry into a DOUBLE reversal. **Always issue
`queryReversalStatus()` and believe only that.** It returned
`outcome=approved, approved=true, rc=00, action=0, mismatches=[]`.

Also: do NOT confirm a reversal with `GET .../test-initiate?order=` -- that path
queries `TRAN_TRTYPE=1`, which reports the ORIGINAL authorisation as approved
forever, even after the money has gone back.

### Inputs, and where they live

A reversal needs `order`, `amount` (formatted exactly as authorised, e.g. `1.00`),
`currency`, `rrn` and `intRef`. **RRN and INT_REF must come from the authorised
transaction we recorded, never from a request body.** They are in
`payment_events` on the `cb:<ORDER>` row:

```sql
select payload_json->'callback'->>'RRN'      as rrn,
       payload_json->'callback'->>'INT_REF'  as int_ref,
       payload_json->'callback'->>'AMOUNT'   as amount
  from public.payment_events where event_id = 'cb:<ORDER>';
```

The reversal MAC covers `AMOUNT, CURRENCY, TERMINAL, TRTYPE, ORDER, RRN, INT_REF`.
`TIMESTAMP` and `NONCE` are SENT but NOT signed -- asymmetric with the
authorisation MAC. That is the spec's asymmetry; `MAC_FIELDS_REVERSAL` is the
authority.

### Running it locally (four obstacles, all solved)

1. **`web-app/.env.local` holds the SANDBOX pair** and cannot sign against the
   production terminal. Build a temporary env file OUTSIDE the repository with the
   production values (terminal `17205829`, gateway
   `https://mpi.3dsecure.az/cgi-bin/cgi_link`, base64 of
   `olympiq_prod_private_key.pem` and `azericard_prod_mpi_public.pem`).
   **Delete it the moment you are done** -- it contains the production private key.
2. **`import "server-only"` throws under plain Node.** Run with
   `NODE_OPTIONS="--conditions=react-server"`.
3. **`server-only` is not a real dependency** -- Next.js aliases it at build time,
   so it does not exist in `node_modules`. Create a throwaway stub at
   `node_modules/server-only/` (untracked, and `npm install` clears it anyway).
4. **Config memoises env at module load**, so `process.loadEnvFile(...)` must run
   BEFORE the config module is imported -- use a dynamic `await import()`, not a
   static one, or the static import hoists above the env load.

Then: `npx --yes tsx@4 <script>.mts`. Gate the actual send behind a `--go` flag so
the dry run is genuinely dry, and verify `describeConfigProblems()` is empty and
the terminal reads `17205829` before sending anything.

### Correcting the ledger afterwards

- `public.checkout_revoke_reversed('<ORDER>', '<reason>')` is the proper path and
  the only writer of `payments.status='refunded'` for a REAL order. It revokes the
  produced entitlements as a side effect.
- **It refuses a `protocol_test` order** (`intent_kind IS NULL` -> `unknown_order`),
  which is why `20260825281545` needed a direct
  `update public.payments set status='refunded' ...`. That is safe: there is no
  CHECK constraint (status is an enum: `pending, succeeded, failed, refunded,
  canceled`), `trg_set_updated_at` maintains the timestamp and `trg_audit_payments`
  records the change automatically.
- **Never hand-edit `public.entitlements`.** `entitlement_revoke` raises
  `mirrored_grant`, and `entitlements_reconcile()` undoes raw UPDATEs at :22 past
  every hour.

### A gap this exercise exposed

**The reconcile sweep does not detect the reversal of an already-settled payment.**
Immediately after a confirmed reversal the sweep still reported
`{"queried":0,...,"reversed":0}` and `payments.status` stayed `succeeded` until
corrected by hand -- because the sweep only reconciles UNRESOLVED sessions and
never revisits a settled one. Consequence: a bank-side reversal or a card-scheme
chargeback on a settled payment goes unnoticed indefinitely. Closing that would
mean periodically re-querying settled payments inside the 24-hour window, or
reading the settlement report.

### If a refund feature is ever built

The primitives are done and proven; only the surface is missing. Note that
`admin-panel` and `web-app` are SEPARATE deployments and only `web-app` holds the
`AZERICARD_*` credentials, so an admin-panel server action cannot sign a reversal
itself -- it must call a web-app route handler. Required guards: authorization
first, idempotency (one reversal per payment), amount and state validation
(never more than charged, never an already-refunded or never-succeeded payment),
and an audit row. The gateway's reversal response body can carry a masked card
number and must never be persisted or logged wholesale.

## IN PROGRESS — THE 1-DAY FREE TRIAL (owner spec, 2026-08-25)

**This supersedes the earlier "one fixed trial length per interval" note.** The
trial is now a PRE-PURCHASE trial, not a payment-deferred one: no card, no charge,
taken before any plan is selected.

### The spec, in one paragraph

Every child gets ONE 24-hour free trial. The parent picks a MAXIMUM OF 2 SUBJECTS
(further cards go disabled/greyed with a lock), confirms in a modal, and lands on a
success screen. A live countdown -- derived from a stored expiry so it survives
logout/login -- shows per subject. Notifications fire at 3h, 2h and 1h before
expiry and once at expiry. On expiry the subjects lock again. Trial activity must
not affect score, rankings, competitions or analytics, and must not count as an
official attempt. During the trial the "one attempt per day" restriction must not
apply. One trial per child, not restartable.

### CONFLICTS WITH EXISTING RULES — recorded before any code change

**1. Spec §7 vs the Round 42/43 rated rule.** The spec says the one-attempt-per-day
restriction "must be changed". That rule is investor-approved and enforced by a DB
unique index: one live/graded RATED attempt per subject per day, consumed at
creation, feeding the percentage boards and the streak.

*Working resolution (being verified before implementation):* the two requirements
reconcile WITHOUT touching the rated rule, because the daily limit only ever
applied to RATED rounds, and the platform already has unlimited UNRATED practice
(topic tests, previous-day replays, olympiad attempts -- all `is_rated=false`,
none of which touch points, percentage, streak or boards). A trial that grants
unlimited UNRATED practice satisfies §7 and §8 simultaneously. **If that proves
wrong, the rated rule wins and the owner is asked before anything is relaxed** --
the daily limit is the product, not an obstacle.

**2. The old subscription trial vs the new pre-purchase trial.** `trial_days`
exists today inside `quote_child_plan`, and the `launch_promo` flag (migration 133)
zeroes it. Both must not apply, or a child gets 1 trial day PLUS N subscription
trial days. The new trial replaces the old concept; the reconciliation is part of
the implementation.

**3. Mobile purchase-silence vs the spec's copy.** The spec's expired-state CTA is
"View Subscription Plans" and the expiry notification says "Subscribe now to
continue access." Notification bodies render in the MOBILE app, and the store
builds must contain no Subscribe CTA, no price and no purchasing link (Apple
3.1.1(a) / Google Play Payments; Azerbaijan gets no anti-steering relief, and the
penalty is developer-account termination). The web keeps the real CTA; the mobile
wording must use access/activation language. Existing purchase-silence tests will
police this.

**4. `entitlements_reconcile()` runs hourly at :22** and undoes entitlement rows it
cannot trace to a subscription or purchase. A trial grant must be modelled so that
job does not reap it.

### Owner decisions taken 2026-08-25

1. **Entitlement source = a new `'trial'` enum value** (migration 139). `abb_web`
   would name a card rail that was never used; `manual` means "somebody comped
   this", the exact conflation migration 137 removed a day earlier.
2. **Notification rungs = 12h + 1h + expired, clamped to 08:00-22:00 Asia/Baku.**
   The specced 3h/2h/1h fires at 06:00/07:00/08:00 for a trial activated at 09:00,
   so roughly half of all activations would spend their entire warning budget
   while the parent slept, and the parent's first contact would be "it ended".
3. **Duration stays 24 hours** as specced.

### Status

- [x] Investigation + design (55/64 findings independently verified)
- [x] **Migration 139 — the `'trial'` entitlement source.** APPLIED to staging +
      production. Standalone by necessity: a new enum label cannot be USED until
      its transaction commits, and "used" includes a CHECK, an index predicate, a
      `do $$` block and any `language sql` body.
- [x] **Migration 140 — the Free Trial core.** APPLIED to staging + production.
      `free_trials` ledger (once-per-child unique constraint, 1-2 subject CHECK),
      `test_attempts.is_free_trial`, RLS mirroring `entitlements_select`,
      `subject_access_is_trial_only`, `activate_free_trial`, `child_free_trial` /
      `my_free_trial`, the new today/unrated attempt branch, and analytics
      exclusions. Production `013`: **0 failures.**
- [x] **Migration 141 — the ending chain.** APPLIED to staging + production.
      `free_trial_notice` (trilingual az/en/ru, keyed on the locale captured at
      activation) + `notify_free_trial_ending` + `olympiq_notify_free_trial_ending`
      on `*/5`. Production `013`: **0 failures.**
- [x] **Migration 142 — one trial, not two.** APPLIED to staging + production.
      `launch_promo_config.trial_days` 7 → 0. The two trials STACKED: a parent
      would take the 1-day trial, buy a plan, and receive a further 7 free days
      on top, so the first charge landed eight days after the family started —
      and neither side knew about the other. Nobody had noticed because the
      `launch_promo` flag zeroes the trial (migration 133), so it was inert; the
      stacking would have appeared the day that flag was turned off, which is
      exactly during a launch. Reversible: one UPDATE of one row. The migration
      refuses to run unless 140 is already applied, so it can never leave the
      platform with no trial at all.
- [x] **Server action layer** — `lib/freeTrialShared.ts` (pure: the cap, the h/m/s
      split, the parser), `lib/freeTrial.ts` (server-only reads),
      `lib/auth/freeTrialCore.ts` (maps RPC hints to i18n KEYS, never Postgres
      text), `lib/auth/freeTrialActions.ts` (`requireParent()` first, rate-limited,
      translates the key because `state.error` is printed raw).
- [x] **Frontend** — `FreeTrialActivation` (hero → picker → summary → confirm →
      success), `FreeTrialSubjectCard` (default / selected / disabled-with-lock),
      `FreeTrialCountdown`, `FreeTrialStatusPanel`, a shared `icons/LockIcon`
      extracted from `AnalyticsDashboard` (it was module-local and unexported),
      the `.ftrial-*` CSS block, and the subscribe page wired with five branches.
      **46 `trial.*` keys × 3 locales in one edit**, asserted to be the same key
      set in each — a missing key renders as the raw key on screen.
- [x] **Child-side wiring** — `childSubjects.ts` gained a `trialNow` arm that
      merges EXACTLY the trial's subjects. Deliberately **not** folded into
      `freeNow`: the giveaway and the admin free-access window are all-or-nothing
      and merge every actively priced subject, so treating the trial as another
      "free window" would have handed the child the whole catalogue for a day.
      Plus the `is_free_trial` filter on the child dashboard's stats query and on
      the parent analytics aggregate (the DB-side RPCs were already filtered by
      140), and glyphs for both notification types — without a case they render
      the generic bell.
- [x] **Tests** — `web-app/src/lib/__tests__/freeTrial.test.ts`, 38 assertions.
      The load-bearing ones: `uq_rated_daily_live_per_day` is still predicated on
      `is_rated`; no trial migration drops it; `award_attempt_points` never reads
      `is_free_trial` while both analytics functions do; the access gate fails
      toward RATED; activation never calls `assert_payments_enabled` and creates
      no subscription row; the notification copy carries no purchase language in
      any of the three languages; and every `trial.*` key appears exactly three
      times.
- [x] **Mobile — DISPLAY ONLY (2026-08-26).** `useArenaAccess` gained a
      `my_free_trial()` arm: a trial writes NO `access_status`, so a child whose
      only access was a trial read as `inactive` and would have seen a LOCKED
      arena while the database happily granted the subjects. Plus glyphs for both
      notification types. Version 1.11.2 -> **1.12.0** (both files). 463 mobile
      tests pass. **Activation stays web-only** — and the leak below is why that
      is not merely a scoping preference.
- [x] **A COPY LEAK I INTRODUCED, caught before it shipped.**
      `scripts/sync-i18n.mjs` copies the web catalogue WHOLESALE into the binary,
      and `store-copy.test.ts` swept only 30 hardcoded keys (20 FAQ + 10
      carousel) — the same blind spot that once let `sub.submit` = "Start 7-day
      free trial" ship unswept. My 46 new web `trial.*` keys included
      `trial.hero.body` = *"Try the platform before you subscribe"* and
      `trial.expired.cta` = *"View subscription plans"*. Both are correct on
      olympiq.ai and both are Apple 3.1.1(a) inside a store build, where the
      penalty is developer-account termination rather than rejection.
      **Fix:** the sync now carries an ALLOWLIST — mobile receives only the NINE
      keys it renders (badge, status, countdown units, the unrated note, and the
      expired TITLE without its CTA half). 108 web-only strings are dropped at
      sync time. An allowlist rather than a denylist, because a denylist has to
      be right about every future key while this only has to be right about what
      mobile actually draws. `store-copy.test.ts` now DERIVES its trial sweep
      from the catalogue instead of a hand-written list, and separately asserts
      the activation vocabulary is absent entirely.
      **The test caught the leak on its first run.** That is the whole argument
      for deriving the swept set rather than listing it by hand.
- [x] **Migration 143 — an open topic test belongs to ONE subject.** APPLIED to
      staging + production. The resume query filtered on the STUDENT alone, so a
      child with an unfinished Maths test who pressed "start" on English was
      handed the MATHS attempt back, reported as `resumed: true`.
      `uq_test_attempts_open_test` carried the same omission, so the database was
      enforcing the wrong rule (one open practice test per CHILD across all
      subjects) and could not have caught the mismatch. Now per child PER
      SUBJECT. Safe on existing data: the old index was STRICTER, so no child can
      hold two open tests in different subjects and widening the key cannot
      collide. Proven by a rolled-back probe, 5/5 — including that the RATED
      daily rule is untouched and that an unrated trial round still coexists with
      a rated one.

### The second "bug" was not a bug

The 2026-08-25 design flagged that a previous-day replay serves the IDENTICAL 25
questions every time. That is the **documented Round-42 design**, not a defect:
yesterday's replay is the student's LOCKED practice set precisely so they can
review the round they actually sat. CLAUDE.md states it. Changing it would break a
product rule to fix a symptom that does not exist — and the Free Trial never
touches that path anyway, because its branch draws a fresh set. **Left alone
deliberately.**

### THE NO-REFUND DISCLOSURE — SHIPPED (2026-08-26)

`docs/STORE_PAYMENTS_COMPLIANCE.md` §8.4: **no EU-style cooling-off right exists
in Azerbaijan**, so the refund policy is CONTRACTUAL and "must be written
explicitly ... in Azerbaijani, before the parent authorises the first charge".
Visa and Mastercard separately require the refund/cancellation policy at the
point of sale — undisclosed, a chargeback is lost by default, plus a dispute fee.

`components/PurchaseTerms.tsx`, rendered in TWO places for two different reasons:
the public pricing page (durable, linkable) and, compact, **above the pay button
on the subscribe page**, outside the branch tree so a future branch cannot forget
it. Seven `terms.*` keys × 3 locales. Every line states something the code
already does: no refunds, access kept to the paid period end, manual renewal,
per-subject cycles, lifetime olympiad access, AZN.

### THE DURABLE TERMS PAGE — `/terms` (2026-08-26)

The 2026-08-26 disclosure shipped the refund rule at the POINT OF SALE (pricing
page + above the pay button). What was still missing was a **permanent document a
parent, or a bank in a dispute, can open by URL months later**. There was no terms
page in this repository at all — only the privacy policy.

`web-app/src/app/(public)/terms/page.tsx`, reachable without a session, linked
from the **register form beside the privacy policy** (same tap depth — a parent
registering is about to create children and then pay for them) and from the
compact block above the pay button. 21 `terms.*` keys × 3 locales in total.

**Refund terms are deliberately NOT inside the privacy policy.** That document
explains what personal data we hold and who may see it; refund and renewal rules
are COMMERCIAL terms. Folding one into the other weakens both — a parent hunting
for the refund rule would never think to open a privacy policy, and a regulator
reading the privacy policy should not have to wade through billing. Two documents,
two purposes, linked side by side.

Every sentence on the page is something the code enforces: no refunds
(`cancelChildSubscriptionCore`), access to the paid period end
(`recompute_child_access`), manual renewal (ABB has not approved card-on-file),
per-subject periods (migration 109), lifetime olympiad access (purchases are never
deleted), parent-only purchasing, and that card details never touch our servers.

**Note for whoever writes the full Terms of Service later:** this page covers
PAYMENT only. It is not a complete ToS and does not pretend to be.

### A LIVE FALSEHOOD THIS ROUND CAUGHT

The public pricing page still promised **"7 günlük pulsuz sınaq" / "a 7-day free
trial" / "7-дневного бесплатного периода"** in all three languages — a promise
migration 142 had removed the day before by setting `trial_days = 0`. The
Azerbaijani version additionally claimed **card details were required**, which was
never true of the pre-purchase trial either.

**I created this by applying 142 without sweeping the marketing copy for what it
invalidated.** `pricing.trialLine` now describes the real offer: once per child,
24 hours, 2 subjects, no card. The lesson generalises — a migration that changes
what the product DOES can silently falsify what the site SAYS, and nothing in the
build catches it.

### STILL OWED — deferred by the owner, 2026-08-26

- [ ] **E-KASSA FISCAL RECEIPTS — the one true blocker on lawful selling.**
      Still zero implementation. It is a separate integration with a fiscal
      operator connected to the State Tax Service, NOT with ABB, so it needs a
      commercial decision (which operator) before any code. Note this is OUR
      DOCUMENT'S claim, relayed — not independently verified against Azerbaijani
      tax law. Two neighbouring items in §8.4 deserve the same accountant's
      attention: whether educational services are VAT-exempt (an **18% swing on
      every price**), and billing through an Azerbaijani-RESIDENT entity.
- [ ] **`payments` flag is OFF** on production. Nothing sells until it is on.
- [ ] **The redemption path has never run on production.** One real ~3.00 AZN
      weekly purchase on a throwaway child, confirming
      `entitlements.source='abb_web'`. Owner deferred this to last, deliberately.
- [ ] Settled payments are never revisited, so a bank-side reversal or a
      card-scheme chargeback goes unnoticed indefinitely.
- [x] **013 CHECK 125 — "are the scheduled webhooks ANSWERED?" (2026-08-26).**
      Production now reports **128 PASS / 0 FAIL**, with 125 reading
      `answering_2xx` across 24 responses in the last hour and all three jobs
      scheduled.
      This closes the exact hole that hid the 2026-08-25 outage: both kick
      functions fire through pg_net and DELIBERATELY do not read the response (a
      cron worker must not block on a network call), so a wrong key produced 401s
      that pg_cron recorded as successful runs for 75 minutes with nothing
      alarming. 125 asks the question the jobs cannot ask themselves — is
      anything coming BACK, and is it a 2xx — and names the failure shape:
      `not_scheduled` / `no_recent_calls` / **`answering_4xx`** (the key in Vault
      and the key in Vercel disagree) / `answering_5xx`. It PASSES on a fresh
      bootstrap, where neither extension nor any history exists.
- [x] **Housekeeping: DELIBERATELY NOT DONE.** The 4 stray `protocol_test`
      sessions and 2 pending payment rows are **inert by construction** —
      `checkoutCore.ts:71` excludes `protocol_test` from the outstanding-checkout
      finder, so no parent ever sees them, and `status='pending'` keeps them out
      of any revenue query. Nothing in the system transitions a pending checkout
      to a terminal state, so "tidying" them would mean inventing a status value
      no code reads, and mutating production rows for cosmetics is the worse
      trade. Left, and documented rather than quietly cleaned.
- [ ] Admin finance surface: nav placeholders exist, no read-only
      subscriptions/payments/events view for support work.

### ADMIN COPY CORRECTED (2026-08-26)

The Notifications page described the email switch as *"email sending is not
connected yet"* in all three locales — stale since migration 116 shipped the
Brevo transport, and actively misleading now that 138 wired the channel and the
processor answers 200. The owner read it and reasonably concluded the switch was
inert. Corrected to say the sender IS connected and what turning it on does.

**The switch lives at Admin → Notifications → Settings tab → Channel switches**,
not on the Settings page. Three switches: Notification center (master, on),
**Email notifications**, Mobile app (push, off until the app ships).

### PLAY STORE CLOSED TESTING — tester instructions

`mobile-app/store-assets/TESTER_TELIMATI_AZ.txt` — plain UTF-8 text, Azerbaijani,
written to be read on a phone and forwarded to the tester group. Covers joining
with the Play-Store-active Google account, the 14-day rule (**if one tester
uninstalls or leaves, the 14 days restart for EVERYONE**), a concrete
parent-then-child walkthrough matching the real tabs, and how to give feedback.

Two things it states explicitly so testers do not file them as bugs: **there is
no purchasing inside the app** (deliberate — store compliance), and locked
sections are expected without a subscription. It also asks for HONEST feedback
and warns against manufactured 5-star reviews, which violate Google policy.

### PINNED LIMIT the compliance test cannot cover

The runtime chain is CMS override (`site_content` via `get_mobile_content`) ->
mobile overlay -> generated catalogue. **Admin-editable copy sits ABOVE everything
`store-copy.test.ts` inspects**, so a green test does not prove the RENDERED copy
is clean. Anyone editing Site Content can place a price or a Subscribe CTA into a
store binary at runtime and no test in this repository will notice.
- [ ] Vitest coverage

### How the §7 conflict actually resolved

**The rated rule was NOT weakened, and must never be.** `uq_rated_daily_live_per_day`
carries `and is_rated` in its predicate, so an unrated attempt is outside the index
entirely, and `award_attempt_points` returns before writing anything when an
attempt is unrated — one early return guards the points ledger, `student_activity_days`,
the `students` cache columns, every leaderboard scope, the streak board and the
month rollover.

**What was actually missing** was expressiveness, not permission: `is_rated` was
computed as `(coalesce(p_day,'today') = 'today')` — ONE boolean carrying two
meanings, which also selected the round DATE and the set-selection BRANCH. "Today,
fresh draw, unrated" was literally inexpressible. 140 separates `v_today` from
`v_rated` and adds a third branch. That is the entire change to the attempt path.

**`is_free_trial` is provenance, never a gate.** `is_rated` stays the single thing
scoring reads. Two booleans that both answer "does this count" disagree eventually,
and one missed filter would put trial scores on a leaderboard. The new column
exists so ANALYTICS can exclude trial play — filtering analytics on `is_rated`
instead would also strip the topic tests and replays of every PAYING family, which
is a different feature nobody asked for.

### Proven on staging, not merely applied

A rolled-back functional probe (`scratchpad/trial_probe.sql`) — **11/11 passing**:
3 subjects refused · a non-owner refused · activation grants exactly 2 entitlements ·
access granted and classified trial-only · unchosen subjects stay locked · a second
activation refused · **paid access wins so a paying child's round stays rated** ·
`entitlements_reconcile()` leaves the trial alone · the parent can read the
countdown · a stranger cannot.

**This probe earned its keep.** The migration applied cleanly while
`activate_free_trial` still referenced `sp.is_active` on a table whose column is
`status` — plpgsql does not column-check a body until it runs, so a clean apply
proved nothing. Only executing it found that.

### Why the rungs fire every 5 minutes and not hourly

Migration 130 established that a rung must not depend on the instant the job
fires. That principle is KEPT here; only the UNIT changed. At DAY grain a bucket
lasts a day, so one sample per day is safe against jitter. At HOUR grain a bucket
lasts an hour, so an hourly job samples it 1:1 and **one delayed run swallows a
whole rung with no error anywhere.** Two things make it safe and both are
required: fire finer than the rung (`*/5`, twelve samples per bucket), and use a
monotone due-and-unsent predicate (`<=`) rather than equality. The unique
idempotency key makes each rung at-most-once; `<=` makes it at-least-once across
any outage that ends before the rung expires.

**The trap the waking-hours clamp created.** Deferring a "1 hour left" notice to
08:00 would announce time that no longer exists — a trial ending at 02:00 would
produce "1 hour left" at 08:00, six hours after it ended. Both time-remaining
rungs therefore carry `ends_at > now()`: a rung whose window passed during the
quiet hours is DROPPED and the parent gets the honest "ended" notice instead.
Never a late lie.

**Priority is never 1.** Priority 1 overrides both the recipient's mute and the
platform-wide `notifications` master switch. Migration 130 spent that override
once, on a parent about to lose access they had PAID for. Nobody paid for this.

Proven on staging by a rolled-back probe (`scratchpad/trial_notif_probe.sql`),
**8/8**: the three rungs fire and a 20-hour trial stays silent; each trial is
notified in ITS OWN language; a second run sends nothing; no price, purchase verb
or URL reaches any body in any language; only parents are notified, never children.

### A build-only failure worth remembering

`tsc --noEmit` passed while the production build FAILED: `FreeTrialCountdown` is a
client component and imported the pure helpers from `lib/freeTrial.ts`, which
carries `import "server-only"`. TypeScript has no opinion about that boundary;
only webpack does. Hence the split — `freeTrialShared.ts` holds everything the
browser needs (the cap, the h/m/s split, the parser) and `freeTrial.ts` re-exports
it so server callers keep one import site. **Typecheck is not a substitute for
`next build` when a module crosses the server/client line.**

### Two pre-existing defects a 2-subject unlimited-retake trial will expose

Both are older than this feature and are **deliberately not fixed here**, because
fixing them changes behaviour for every child:

1. **`uq_test_attempts_open_test` is scoped to `student_profile_id` only, not
   student+subject** (`011:142-144`, `where kind='test' and status='in_progress'`).
   A child with an open topic test in trial subject A who starts one in subject B
   is silently handed the subject-A attempt back. The trial UI must submit-or-
   discard an open attempt before offering the second subject.
2. **A previous-day replay serves the IDENTICAL 25 questions every time**, because
   `daily_practice_sets` is unique on (student, subject, for_date). This is why the
   trial branch draws fresh rather than reusing the yesterday path.

### The splice hazard bit a third time

Extracting `start_topic_test_attempt` by bounding on its `revoke` line swept up
SEVEN unrelated functions, because this file groups ACL statements at the END of a
block rather than after each function — its revoke sits ~740 lines below its
definition. Caught by counting `create or replace function` in the output.
**The bound must be the FIRST of (this function's revoke, the next function's
CREATE)**, and every extraction must assert it captured exactly one function.
Third occurrence in this repository; the rule is now encoded in the generator. Decide this
deliberately rather than discovering it at the first trial expiry.

### Also pending from this round

- [ ] **E-KASSA FISCAL RECEIPTS: MANDATORY, ZERO IMPLEMENTATION.** Verified
      2026-08-25 -- `ekassa|e-kassa|fiscal|kassa` returns **no hits at all** in
      `web-app/src`, `admin-panel/src` or `supabase/sql`. It appears only in docs.
      `docs/STORE_PAYMENTS_COMPLIANCE.md:351`: B2C sales require a receipt through
      an e-kassa connected to the State Tax Service, with QR code and fiscal
      identifier, **in addition to** the terminal slip; this includes automatic
      renewals; an in-app confirmation email is NOT sufficient fiscal
      documentation; **financial sanctions apply.** This is the largest single gap
      between "the rail works" and "we may lawfully sell", and it is a
      legal/commercial integration, not a bank one.
- [ ] **`payments` flag is OFF** on production -- turned off for the cutover, not yet
      restored. Production is not selling.
- [ ] **Disclose the no-refund/cancellation policy at checkout and in the T&C**
      before selling (see the no-refund section above -- undisclosed, a chargeback
      is lost by default).
- [ ] **The redemption path has never run on production.** Prove it with one real
      3.00 AZN weekly purchase on a throwaway child, and confirm
      `entitlements.source='abb_web'`. Note `launch_promo` is ON in production, so
      the trial is zeroed and the card is charged immediately.
- [ ] **A settled payment is never revisited.** A bank-side reversal or a
      card-scheme chargeback goes unnoticed (proven 2026-08-25 -- see the reversal
      reference above). Needs either a re-query of settled payments inside the
      24-hour window or a settlement-report reconciliation.
- [ ] Housekeeping: 4 `protocol_test` sessions and 2 `pending` payment rows (2.00
      AZN) left by cutover diagnostics. Harmless, never paid, but they are noise in
      any first finance report.
- [ ] `subject_charge_failed` notification is still deliberately UNWIRED
      (`011:9277`). **Not needed yet:** with renewals MANUAL there is no automatic
      charge that can fail, and a checkout failure is shown to the parent directly.
      It becomes required the day ABB approves recurring.

### FUTURE, NOT NOW — recurring billing (owner, 2026-08-25)

**Dropped from the current scope by owner decision.** ABB will not enable
card-on-file recurring until the platform has been live and trading for roughly
one to two months and has proven its volume (ticket AZCDF-100303). Until then
renewals are MANUAL by design and the 3/2/1-day reminder chain is the entire
retention mechanism -- which is why email delivery matters more than it looks.

Do not build a dormant recurring path in the meantime. When ABB approves it, the
seam already exists and is deliberately inert: `config.tokenUrl`
(`AZERICARD_TOKEN_URL`) is carried but read by nothing, and the protocol side is
`TOKEN_ACTION=REGISTER` / `MERCH_TRAN_STATE` / `TOKEN` / `EXT_NET_REF`. The first
charge of a series must be flagged as the initial transaction of a recurring series
under CBAR enhanced-authentication rules (NOT PSD2) or renewals silently die. Wiring
`subject_charge_failed` becomes required at the same time.
- [ ] Admin finance surface: nav placeholders exist, but there is still no
      read-only subscriptions/payments/events view for support work.
- [ ] Parent Invoices panel still shows an honest "none yet" -- real invoice rows
      (id/date/amount/status plus the e-kassa receipt link) are owed once fiscal
      receipts exist.
- [ ] **STALE BACKLOG ENTRY, corrected 2026-08-25:**
      `docs/PRODUCT_COMPLETION_BACKLOG.md:52` still calls the olympiad purchase a
      mock seam. It is not -- `processOlympiadPayment` is GONE (a test asserts the
      source no longer contains it) and olympiad purchases run through the real
      AzeriCard rail via the olympiad branch of `checkout_redeem_plan`.
- [x] **Renewal reminders reached only the in-app bell -- migration 138, APPLIED
      to staging + production 2026-08-25.** `notification_deliveries` held ZERO
      rows for two independent reasons, either sufficient alone: (1) every
      producer passed `array['in_app']`, so `create_notification` never wrote an
      email row and turning the flag on would have sent exactly nothing and looked
      like a broken provider; (2) `/api/notifications/process` had **no caller at
      all** -- no `vercel.json` (Hobby caps crons at once daily), no pg_cron job,
      no external cron. A queue with no consumer.
      138 adds the email channel to the two chains that mean *"your child's access
      is about to change"* (renewal 3/2/1 and giveaway-ending) and adds
      `notifications_process_kick()` + `olympiq_notifications_process` (*/5),
      mirroring the proven `azericard_reconcile_kick` pattern.
      **Deliberately NOT emailed:** progress milestones, streak achievements and
      report-status updates. An email per personal best trains parents to ignore
      our mail, which costs us the one message that matters. A test now asserts
      milestones stay in-app.
      Production `013`: **0 failures.** web-app 573 tests pass.
      **Owner steps still required before a single email sends** -- see
      "Human Next Actions": `notifications_processor_key` in Vault must equal
      `NOTIFICATIONS_PROCESSOR_KEY` in Vercel, `BREVO_API_KEY` /
      `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` set, then the
      `notifications_email` flag turned on. `notifications_process_url` is already
      created in Vault.
- [ ] `AZERICARD_TEST_TOKEN` was set for the cutover and **has been deleted** (done
      2026-08-25). It must never be left set: that route mints real payable orders up
      to 50 AZN against any parent profile and does NOT consult the payments kill switch.
- [ ] Add an alarm for a non-200 reconcile response, and a `013` check that the job
      exists and is being answered. Today's outage proves nothing else will notice.

## PINNED — SOLUTIONS ARE EARNED, NOT BROWSABLE (migration 132, 2026-08-22 — APPLIED)

`question_explanations` holds the WORKED SOLUTION per question. The old policy let
ANY signed-in user read it for ANY published question, so a child on their own
account could `GET /rest/v1/question_explanations?select=*` and receive every
solution in the bank -- including tomorrow's rated daily round, which is one
attempt per subject per day and feeds the leaderboards.

**The old policy knew.** Its own comment read *"explanations: app should reveal
only after result; RLS allows published/owner/admin"* -- the rule was written down
and then left to the UI to enforce, which is precisely the gap a direct API call
walks through.

Measured as a real signed-in child: **90 explanation rows readable with no
attempt at all**. (`answer_options.is_correct` was already correctly protected --
0 rows -- so only the prose solution leaked.)

### The rule (owner decision, 2026-08-22)

**A child sees a solution ONLY for questions in one of their OWN GRADED
attempts.** Daily rounds, topic practice and olympiad packages alike, since all
three are `test_attempts` rows. Before answering, nothing.

That is the rule `get_test_review` ALREADY enforced -- it raises `forbidden` for
someone else's attempt and `review: attempt not graded yet` for an unfinished one.
The table was simply more permissive than the function meant to be its front door;
132 makes them agree. `graded` and not `submitted`, deliberately, so both paths
answer identically.

### Why the review screen still works

- The explanation TEXT comes from `get_test_review`, a SECURITY DEFINER RPC that
  bypasses RLS and does its own ownership + graded checks.
- The one direct table read on that page selects `question_id, locale` ONLY -- no
  body -- to decide whether a ru/en reader is seeing an az fallback. Those
  questions are in the child's own graded attempt, so the new predicate covers it.
- No PARENT surface reads explanations (zero hits under `web-app/src/app/(parent)`),
  so no parent branch exists. **A future parent result-view will need its own
  branch here -- it will not inherit one.**
- Both sides of the new EXISTS are indexed (`idx_answers_question`,
  `idx_attempts_student`).

### A bug in the verification, caught because it reported success

The probe first selected its fixture with
`exists (select 1 from question_explanations e where e.question_id = id)` -- and
the bare `id` resolved to `question_explanations.id`, because the INNER table has
that column too. The EXISTS was self-referential, matched nothing, and the whole
probe skipped while the migration reported success. Fixed by aliasing the outer
table. **A verification block that tests nothing is worse than none, because it
reads as coverage** -- the same lesson as the `freeze` keyword in 013 check 122.

### Validation

Applied to staging then production. The migration's own probe: `before=0`,
own-question explanations visible, `others=0`. Independently re-probed as a child
with no attempts: readable rows went **90 -> 0**. `013` on production **128/128**;
web-app 546 tests, `tsc` clean. Backported into canonical `010`, policy count
unchanged (129).

## PINNED — THE CAMPAIGN RUNS ON TOP OF PAYMENTS (migration 135, 2026-08-22 — APPLIED)

**Owner decision, 2026-08-22: `payments` and `giveaway_period` are no longer
mutually exclusive.** The campaign is a MODIFIER on an open payment rail, not an
alternative to one.

    payments OFF                      -> 'off'.  Nothing new can be bought;
                                         a campaign CANNOT be started.
    payments ON,  giveaway OFF        -> 'real'. Everything charges normally.
    payments ON,  giveaway ON+running -> 'giveaway'. SUBSCRIPTIONS free;
                                         olympiad packages still charge.

### What it fixes

The old exclusivity produced a panel that lied about money: starting a campaign
force-disabled `payments`, so the admin saw **"Payments: OFF" while olympiad
purchases were still reaching the bank and charging real cards** (a campaign only
ever covered SUBJECT access; `startOlympiadPayment` blocks only mode `off`). The
new model resolves that without touching the olympiad rail — payments really is
on, so the panel is telling the truth.

It also **retires the repair machinery**. Migration 133 had to record what a
campaign had paused and hand it back hourly, because the window elapsing left the
platform in `off` — unable to sell, cohort locked out. Payments are never
switched off now, so the window elapsing just moves the mode from `giveaway` to
`real`. `restore_payments_after_giveaway()` and its job are DROPPED rather than
left as dead code that rewrites feature flags on a schedule.

**Turning payments off ends a running campaign.** The kill switch must always
win: refusing the change would trap an operator who needs it during an incident.

### A bug the migration's own verification caught

The trigger's WHEN clause was
`new.enabled = true and new.key in ('payments','giveaway_period')` — it fired
ONLY when a flag was switched ON. Correct for the old model, whose only job was
forcing the sibling off; under the new rules the moment that matters is payments
being switched OFF, which that clause skips entirely. **The cascade would never
have run**, and a campaign would have kept resolving with no rail beneath it.
Found because the migration exercises the rule instead of asserting on its text.

### 013 check 108 was pinned to the retired rule

It asserted `count(enabled) <= 1` over the pair — exactly the exclusivity that is
now gone — and required the function to contain the force-disable list. Left
alone it would have failed forever the first time a campaign ran. Re-pointed at
the DEPENDENCY that replaced it: a campaign may not run with payments off. Same
class as checks 91, 95, 110, 114 and the migration-130 parity test. **When a
migration changes a mechanism, re-point the check that pinned it in the SAME
change.**

### Also this round

- **`gate.paymentsOff` rewritten** (az/en/ru): payments-off is now purely a kill
  switch, so the copy apologises, says nothing new can be opened, and says
  everything already open keeps working.
- **The admin payment-mode note rewritten** in three locales — it still told the
  operator the two switches were mutually exclusive.

### Validation

Applied to staging then production. `013`: production **128/128**, staging
127/128 (the data-coverage check). The migration proves all three rules by
exercising them: a campaign is refused while the rail is closed, both flags run
together as mode `giveaway`, and turning payments off ends the campaign and
resolves to `off`. web-app **571**, admin-panel **581**, mobile-app **458**.

## PINNED — THE ADMIN PANEL COULD NOT CREATE A CHILD IN BAKU (2026-08-22 — FIXED)

Creating a demo child from admin `/free-access` failed with the generic "Could
not create the child account". The real error, reproduced in one run against
staging:

    create_child_account: district is required for city ...   (SQLSTATE 23514)

**Round 21 made the RAYON mandatory for a child whose city has any, and the admin
panel never collected or passed it.** It sends `p_district_id` (city) and
`p_school_id` but not `p_city_district_id`, so child creation failed for every
child in Baku — which is every child. The web parent Add-Child flow has had the
step since Round 21; the panel never gained it.

**Deriving the rayon from the school does not work**: `schools.city_district_id`
exists and the DB guard even auto-fills from it, but **no school on either
database has one set** (0 of 320, and all 320 are in the one rayon-city). The
Locations explorer has a "schools with no rayon" view, so the gap is known.

Fixed by giving the panel the step the web flow has: the form renders a rayon
select **only when the chosen city has rayons**, the server re-asks the database
whether one is required rather than trusting the form, and the RPC re-checks it
independently. The select deliberately does NOT filter the school list — no
school carries a rayon, so filtering by it would empty the list, and the DB guard
only rejects a CONTRADICTION.

Proven end to end against staging: **without rayon -> refused with the owner's
exact error; with rayon -> student created, 8-digit ID issued, subscription
created.** That is the App Review demo family unblocked.

## PINNED — THE GIVEAWAY LIFECYCLE + THE FEATURE TOGGLES (migrations 133-134, 2026-08-22 — APPLIED)

**The owner's giveaway specification, implemented on the model the platform
already had: BLANKET FREE ACCESS, never zero-amount subscription records.**
`has_subject_access()` returns true for any subject while a campaign runs and
writes nothing, so an existing paid subscription is untouched -- no period moves,
no metadata is rewritten, nothing is cancelled (spec §2, §7).

### The two money defects

1. **A CAMPAIGN COULD NOT END CLEANLY.** Switching `giveaway_period` on
   force-disables `payments` (the exclusivity trigger). The window then expires
   LAZILY -- the flag stays on, `is_giveaway_active()` simply starts returning
   false -- so the resolved mode became `off`, NOT `real`. At that instant every
   family in the cohort lost subject access AND nobody could buy their way back
   (`assert_payments_enabled` raises inside `create_child_plan`; every checkout
   gate answers `gate.paymentsOff`). Nothing anywhere turned `payments` back on.
   **The outage is driven by the CLOCK -- nobody has to make a mistake -- and it
   lasted until an administrator happened to open Settings.**
   Fixed: the trigger records that it paused payments
   (`payments.paused_by_giveaway`), and `restore_payments_after_giveaway()`
   -- scheduled hourly -- hands it back the moment the window is over. Proven on
   staging: `campaign ON -> payments=f`, `window over -> restored=t, payments=t,
   giveaway=f`, `second run -> f` (idempotent).

2. **"LAUNCH PROMOTION" DID NOT CONTROL THE TRIAL.** `quote_child_plan` read
   `launch_promo_config.trial_days` unconditionally, so switching the toggle off
   stopped ADVERTISING the trial on the public pricing page while the platform
   kept granting it -- copy and behaviour diverging in the worse direction. There
   was no other control: no admin editor for `trial_days` exists anywhere, so
   ending the trial meant raw SQL against production. Proven on staging:
   `launch_promo ON -> trial 7 days`, `OFF -> 0 days and due_now 9.00`.

### The toggles now gate behaviour, not just the UI

- **`notifications`** is a real master switch: enforced in `create_notification`,
  the one insert path every producer uses. Before, every row was still written,
  the admin composer still reported "sent", and the mobile inbox stayed reachable.
  **Priority 1 is exempt**, like the recipient's own mute -- that level is
  reserved for payment and security, and a display toggle must not suppress
  "we are holding your money".
- **`leaderboard`** gates the DATA: `get_leaderboard` and `get_public_leaderboard`
  return no rows when it is off. It was presentation-only, and the public reader
  serves `anon`.
- **`giveaway.started_at`** is now an UPSERT. A bare UPDATE against a missing row
  matched nothing, so the flag switched on and the campaign was silently INERT.

### The campaign warns three times (spec §5, §10)

`notify_giveaway_ending` keyed idempotency on `gvw:<parent>:<window end>` -- **no
rung** -- so the daily job produced exactly ONE notice per campaign and every
later day was discarded by `on conflict do nothing`. Identical defect, identical
shape, to the one migration 130 fixed for subscription lapses.

Now 3 / 2 / 1 whole calendar days, the rung in the key, priority escalating
3 -> 2 -> 1. Proven on staging: `4 days out -> 0`, then `3, 2, 1 -> 1 each`, every
re-run `0`.

**The lapse reminders go quiet during a campaign.** They told parents access would
stop on a date when it would not, and to act while every payment rail was
refusing them.

### One deliberate deviation from the spec's wording

The final rung does NOT say "review the available subscription plans". These rows
render inside the purchase-silent mobile binaries, where a notification directing
a user toward a purchase surface is Apple 3.1.1(a) steering. It states the same
fact -- premium sections need a subscription once the campaign ends -- without
instructing anyone to buy.

### Plan selection during a campaign (spec §1, §4, §7)

`ManageSubjects` now disables adds, upgrades and cycle changes during a campaign
(it only checked `off`), explains why (`gate.giveawaySubsPaused`, az/en/ru), and
**the editor is rendered instead of hidden** -- hiding it took REMOVAL and
CANCELLATION away from families who were already paying when the campaign
started, which §7 forbids. The server refuses these writes independently
(`gate.giveawayFree`), so it is enforced twice (§11).

**§3 needed no work**: `GiveawayBanner` already derives remaining time from the
campaign's `endsAt`, ticks live, and disappears when the window closes.

### One clock (spec §8)

`is_giveaway_active()` parsed `giveaway.duration_days` more loosely than
`current_payment_mode()`, so the two could disagree about one campaign -- one
granting access while the other resolved a different payment mode. It now
delegates. No recursion: `current_payment_mode()` parses independently and has
never called it.

### Validation

Applied to staging then production; `013` on production **128/128**. Every claim
above was proven by running it against staging in a rolled-back transaction, not
by reading the code. web-app **568 tests**, admin-panel **581**, mobile-app
**458**, all typechecks clean.

### Known, and NOT changed

- **Olympiad packages are excluded from the campaign** (owner decision,
  2026-08-22): they are always bought. `start_olympiad_attempt` says so in its
  own comment. Note that `startOlympiadPayment` blocks only mode `off` while its
  two siblings also block `giveaway` -- so during a campaign the admin panel
  shows "Payments: OFF" while olympiad purchases still reach the bank. The
  CHARGING is intended; the panel's claim is what is wrong. Left for an owner
  decision: stop the giveaway force-disabling `payments`, or correct the copy.
- The campaign's own notifications are AZ-only, like every DB-emitted notice.

## PINNED — A CHILD COULD UNLOCK THEIR OWN PAID ACCESS (migration 131, 2026-08-22 — FIXED)

Found by a documentation-vs-code audit, then **confirmed empirically** against
staging acting as a real signed-in child (JWT claims set, `role authenticated`,
RLS live) -- not inferred from reading policies:

    access_status:   locked -> active     *** PAYWALL BYPASS ***
    child_unique_id: WRITABLE by the child
    grade_id:        WRITABLE by the child
    points_all_time: refused (already guarded)

`students_write` is a ROW policy and RLS has no column granularity, so a child
holding their own token could rewrite **every column on their own row** through
PostgREST, which Supabase exposes publicly. The exploit is one PATCH. Payments
being OFF is the only reason it has cost nothing.

What each column was worth: `access_status` is the paywall; `child_unique_id` is
the server-issued 8-digit login id that is collision-safe *because* the server
issues it; `grade_id` decides which olympiad pool an attempt draws from and which
leaderboard bracket the child competes in -- setting it lower is undetectable
cheating; `school_id`/`district_id`/`city_district_id` are the leaderboard's
school and rayon context; `graduated` and `created_by_parent_profile_id` are
promotion state and OWNERSHIP.

### The fix extended the guard that already existed

`protect_student_progress_cols()` was written for exactly this reason -- its own
comment says *"students_write is a ROW policy (child/parent can update their own
row), so the cached score/streak columns need their own guard"* -- and it stopped
at the score columns. Right idea, line drawn in the wrong place. 131 extends the
same trigger to access/identity and academic-context columns, so there is one
list and one place to look.

**It breaks nothing**, verified by reading every `.from("students").update(` call
site in web-app/src: the only columns a CLIENT TOKEN writes are `palette`,
`theme_pref`, `first_name`, `last_name`. Everything else -- parentCore's
Edit-Child (grade, school, rayon), childAvatarCore, subscriptionCore's expiry
write, `create_child_account`, `advance_student_grades`,
`recompute_child_access` -- goes through the SERVICE-ROLE client, where
`current_user` is not `anon`/`authenticated` and the guard does not fire.

### The migration re-runs the attack instead of asserting on its own text

Its verification block creates a locked child, becomes that child with
`set local role authenticated`, attempts the bypass, and raises unless it is
refused AND the status is still `locked` -- then checks a legitimate `theme_pref`
write still succeeds, and deletes the probe. Asserting the function text contains
the right words would have proven only that the words are there.

Confirmed closed by re-running the original independent probe: all four columns
now refused. Applied to staging then production; `013` **128/128**.

## PINNED — DOC-VS-CODE AUDIT (2026-08-22): 34 gaps, ZERO launch blockers

Fourteen agents cross-checked every promise in the master plans, the module plans
and the July backlog against today's code, each finding then adversarially
re-verified. **55 documented promises were confirmed BUILT**, including several
the July backlog still lists as missing -- notably the access-recompute job that
backlog called a launch blocker: `olympiq_recompute_child_access` now runs hourly
and succeeded 24/24 in the last day.

**Nothing is a launch blocker.** The most consequential open items:

1. **Explanations readable without an attempt.** Probed as a child:
   `answer_options.is_correct` returns 0 rows (correctly protected) but
   `question_explanations` returns every published row, and a worked solution
   usually contains the answer. A cheating vector on rated rounds; needs a product
   decision about when a solution becomes visible.
2. **Suspending an account does nothing.** `account_status = 'suspended'` exists
   and the admin panel offers the button in all three languages, but no policy,
   function or guard reads it -- the suspended parent keeps a valid session and
   full access, and the operator sees a success toast for a no-op.
3. **No parent payment history, and the Invoices copy actively lies.** The panel
   promises in az/en/ru that invoices "will appear here once your first payment
   goes through"; no code path can ever produce a row. Harmless while payments are
   off; a support problem the day they are on.
4. **Admin login is not audited** -- neither success nor failure -- so the panel's
   own /audit page shows nothing for a password spray or an account compromise.
5. **No admin payments/finance view.** The only admin read of `payments` is the
   needs-review queue; nobody can answer "what did this family pay".

The remaining ~29 are genuine but smaller (child Mistakes/Progress screens, an
`/unauthorized` route, rejection reasons on content review, notification delivery
retry, rank-movement deltas, durable rate limiting, audit `ip_address`/`user_agent`).
Nothing there blocks launch.

## PINNED — NO RECURRING: THREE WARNINGS, THEN ACCESS STOPS (migration 130, 2026-08-22 — APPLIED)

**The bank will not enable card-on-file at launch.** ABB confirmed recurring is a
paid capability on their side and they are not carrying it for a new merchant
(ticket AZCDF-100303). So **every renewal is an act a parent performs by hand**,
and nothing in the platform can charge anybody.

That inverts what the expiry notice is FOR. It used to be a courtesy before a
charge; it is now the only thing between a family and the silent loss of access
they are still paying for.

### The old notice could only ever fire once

`notify_expiring_subscriptions` keyed idempotency on
`subexp:<subscription>:<period_end>` -- fixed for the whole period. The job runs
daily, so the first day inside the three-day window produced a notification and
every day after was silently discarded by `create_notification`'s
`on conflict (idempotency_key) do nothing`. **One warning per period, ever**, with
no error and no log. Defensible when a card was going to be charged; not now.

### The chain

Three calendar days out, two, one -- the key gains the day bucket so each rung
lands exactly once. "Only if they have not renewed" needs no flag: renewing moves
`current_period_end`, which drops the row out of the window *and* changes the key,
so a renewed subject goes quiet by construction.

- **One notification per child per rung, not per subject.** Subjects bill on their
  own cycles (118), so a per-subject design would send a four-subject family twelve
  notifications over three days. Grouped by (subscription, end date), subjects named
  in the body.
- **Whole calendar days.** `ceil(epoch/86400)` makes the rung depend on what time
  the cron fires and can skip one entirely.
- **Priority escalates 3 -> 2 -> 1, and only the last overrides a mute.** Priority 1
  is the level `create_notification` refuses to let a recipient silence. Done once,
  because the alternative is a parent who muted months ago losing paid access with
  no warning they could have seen.
- **The copy is a FACT, not a call to action** -- a store-compliance constraint, not
  style. These render in the purchase-silent apps, so: no price, no purchase verb,
  no destination, no URL ("manage it on your web account" is the wrong form, audit
  finding I6). Pinned by 13 tests in `web-app/src/lib/__tests__/renewalReminders.test.ts`.
- **AZ-only**, consistent with every DB-emitted notice: `notification_templates` is
  the admin composer's reference text, not a render path, and `preferred_locale` is
  never written. *(A real product gap -- a Russian-speaking parent gets Azerbaijani
  notifications. Recorded, not fixed here.)*

### Two defects caught by testing rather than by review

1. **The return value lied.** `create_notification` returns NULL on a deduped
   write; the function `perform`ed it and incremented regardless, so a run that
   sent nothing reported one per candidate row. Found by running the chain twice
   on staging: second run said 3, should have said 0. The old code had the same
   flaw. Nothing reads the number today -- which is exactly how a lying counter
   survives until somebody debugging a missing reminder trusts it.
2. **The backport ate two unrelated functions.** The old body ends `end; $$;` on
   ONE line, so a splice bound on a newline-plus-dollar-quote terminator walked
   past it and removed `notify_giveaway_ending` and
   `admin_manage_child_subscription` from canonical 011. A from-zero rebuild would
   have been missing both and nothing else would have noticed. Caught by counting
   `create or replace function` before and after (150 -> 148). **Rule: bound a
   canonical splice on the following `revoke` line, never on a dollar-quote
   terminator** -- bodies in 011 use both styles.

### Validation

- Applied to staging then production; `013` on production **128/128 PASS**.
- **Functionally proven on staging** in a rolled-back transaction: three
  subscriptions ending in 3/2/1 days produced exactly three notifications with
  priorities 3/2/1 and the escalating copy; a second run produced **0**.
- web-app **546 tests** (533 before), `tsc` clean.

### Still open

- No "your access has now stopped" notice after the period ends. The three
  warnings were what was asked for; a post-lapse notice is a small addition and
  probably worth it.
- Renewal itself is the existing paid checkout -- no code change was needed for it.

## PINNED — ROUND 8: THE REVERSAL THAT TOLD NOBODY (migration 128, 2026-08-22) — APPLIED, 128/128

The six findings left open at the end of round 7 were investigated and each one
adversarially re-checked against the code. **Five were real; one was not.** They
are one sentence: **what we tell a human about a family's money must be true.**

### What was wrong

1. **(HIGH) A reversal on a DECIDED-but-undelivered checkout told nobody.**
   `checkout_revoke_reversed` had arms for "never redeemed" and "applied" and no
   `else`. The third state — `redeemed_at` set, `redemption_status =
   'needs_review'` — is reachable and stayed a reversal candidate, so the money
   went back and the session was never touched. The admin queue went on saying
   *"money held, nothing delivered"* about a refund, and the obvious response to
   that sentence is to grant the access by hand — giving the purchase away free
   **after** refunding it.
2. **The reversal window was anchored on the INTENT.** An intent lives 24 hours
   (`INTENT_TTL_MINUTES`), so a checkout opened at 09:00 and paid at 20:00 went
   unwatched from 09:00 the next morning while the gateway answered until 20:00.
   *The review refuted the first proposed fix:* `p.created_at` is no better,
   because the reconcile sweep writes a `pending` payments row five minutes after
   the intent opens and the real authorisation takes the UPDATE branch. The
   anchor is **`p.updated_at`** — when the approval was recorded — and nothing
   moves it backwards inside the candidate list.
3. **`quote_plan_change` priced an unavailable ADD at zero and dropped it.**
   Every pricing read is an inner join wrapped in `coalesce(sum(), 0)`, so a
   deactivated `subjects_pricing` row vanished silently while `plan_change_delta`
   (which never reads pricing) still matched — delivery test passes, honour rule
   fires, family pays for two subjects and receives one. `quote_child_plan` has
   raised on this since it was written; the sibling never did. Scoped to
   `state = 'add'` and nothing wider, so a withdrawn price can still be cancelled.
4. **`redemption_note` is one last-writer-wins slot holding three orthogonal
   facts** — why redemption could not deliver, what an operator DID, whether the
   money came back. The slot keeps meaning "the current state"; the history now
   goes to `payment_events`, which is append-only and already this rail's ledger.
5. **`checkout_alert_admins` asserted "the parent's payment is with us"** in an
   alarm a REVERSAL also files, after the money has gone back.
6. **A paid olympiad purchase notified nobody.** 127 routed the paid path through
   `checkout_redeem_plan`, past the only `notifyOlympiadPurchased` call site, so
   only FREE activations notified. The emit moved onto the table
   (`trg_notify_olympiad_purchased`), following migration 068's `attempt_graded`
   precedent, with a one-shot backfill for purchases already delivered. The AUDIT
   half was never missing — `fn_audit_row` covers it.

**Finding 5 (the "free-op false positive") is NOT REAL and is closed.** Both
passes independently verified that all three `_if_free` wrappers read `due_now`
and nothing else, and that every genuinely free operation returns `due_now = 0`.
No SQL change. The one real item it surfaced is a comment in
`api/mobile/v1/olympiads/[pkg]/purchase/route.ts` promising an `already:true`
answer the code does not give for a priced package.

### The three constraints the review caught before they shipped red

- **`paidOlympiad.test.ts` asserts canonical 011 CONTAINS migration 127's bodies.**
  Backporting a changed body makes 011 stop containing 127's — the test fails
  however byte-perfect the backport is. `FUNCTIONS` is now a name→source map and
  the five round-8 functions point at 128. `reinstateSubject.test.ts` was split
  the same way (`quote_plan_change` → 128, `apply_plan_change` stays 127).
- **Adding a 013 check changes the rebuild-proof criterion.** 013 is now **128
  checks**; CLAUDE.md and this file say **127/128 with only `102` failing**.
- **`checkout_sessions.status` must stay `'paid'` in every arm** — it is what
  `checkout_reversal_candidates` and check 118's `granted_unpaid` read.

### Validation

- Migration `128` applied to **staging** then **production**, both from the identical
  file, both with all self-checks passing.
- `013` against **production: 128/128 PASS**, zero failures, zero errors. Against
  staging: **127/128**, the sole failure `102_curriculum_translations` (data
  coverage — schema-only database; its three schema columns read `0|0|0`).
- New check **124** PASS on both: `asserted | authorisation | handled | kept |
  neutral | attached | 0 | 0`.
- **The backfill was a clean no-op on production**: 7 active purchases visited,
  0 notifications created, 14 rows and 14 distinct idempotency keys before and
  after. The pre-127 purchases had all notified through the TypeScript emitter
  under the same keys, which is exactly what the keys are for.
- web-app: `tsc --noEmit` PASS, **533 tests** (531 before). admin-panel: `tsc` PASS,
  **581 tests**.
- **The code is not pushed yet.** The database is now AHEAD of the code, which is
  the safe direction (a database ahead of its code is inert).

**One defect caught in this migration before it reached production:** the backfill
notified only the CHILD while the trigger notifies child AND parent. It was found
by checking the production row counts before applying rather than after — 7 active
purchases against 14 existing notifications is what made the asymmetry visible.
Fixed, re-applied to staging, then applied to both.

### THE SAFETY NETS NOW RUN (migration 129, 2026-08-22 — APPLIED)

Found this round: **nothing drove `/api/payments/azericard/reconcile` in
production**, so the two passes that need to ASK THE BANK never ran at all —
pass 1 (a payment whose callback never arrived: family charged, nothing
delivered, no alarm) and pass 3 (reversal detection: money back, access live
forever — the pass migration 128 had just made correct).

Why: `web-app/vercel.json` was deleted on 2026-07-19 because Vercel **Hobby**
caps crons at once-daily and a `*/5` entry failed every deployment; `pg_net` was
not installed, so pg_cron could not stand in. `checkout_redeem_sweep` is the
SQL-only floor and can only redeem what the ledger already calls paid.

**Fixed with pg_cron + pg_net — free, in-house, nothing leaves our
infrastructure.** `public.azericard_reconcile_kick()` queues one POST to our own
route every five minutes (`olympiq_azericard_reconcile`).

- **The merchant private key still never enters the database.** That constraint
  is what made this look impossible. pg_net calls OUR route, and the route signs
  the gateway MAC with the key that lives only in the web app's environment. The
  database carries a bearer token for our own endpoint and nothing else.
- **Credentials live in Vault, NOT `system_settings`.** A setting the admin panel
  can edit, that decides where the database posts a bearer token, is an
  admin-editable exfiltration primitive. Vault has no admin-panel surface, and
  the function additionally refuses any URL that is not https on a hardcoded host
  — the one check a later Vault write cannot talk its way around.
- **Fail-closed on both halves**: unset Vault secrets → NOTICE and no-op (never
  an error — this fires every five minutes forever and a job that raises on every
  tick trains people to ignore it); `PAYMENTS_RECONCILE_KEY` unset in Vercel →
  every POST is 401.

**Proven end to end on staging**, not assumed: pointed the Vault URL at staging,
fired the kick, and `net._http_response` recorded `401 {"error":"unauthorized"}`
— the request reached the route and the route's auth was correctly closed. A
hostile URL planted in Vault (`https://evil.example/steal`) was refused by the
allowlist. Production has the job **active** and declining while unconfigured.

**Still owed:** the key itself. Minting it is the owner's step ON PURPOSE — a
secret generated inside an agent session lands in that session's transcript. The
one command in *Human Next Actions* generates it in the database, stores it in
Vault and prints it once for Vercel.

### Also found this round

- **`staging.olympiq.ai` was fully indexable** — no `noindex`, no `robots.txt`,
  serving a byte-identical copy of the marketing site. **FIXED**: middleware now
  serves `X-Robots-Tag: noindex, nofollow, noarchive` on every host that is not
  `olympiq.ai` / `www.olympiq.ai` (`web-app/src/lib/indexing.ts`, 17 tests).
  Keyed on the request host, not an env var: `VERCEL_ENV` reads "production" on
  the staging project, and a stale `NEXT_PUBLIC_SITE_URL` would deindex the real site.
- **Production returns HTTP 200 for a page that does not exist** (a soft 404).
  `notFound()` is called correctly, but the route streams behind `loading.tsx`, so
  the status is committed before the not-found path is reached. Crawlers read 200
  as "this page exists". Not fixed — needs its own decision.
- **`api/mobile/v1/children/[id]/subscribe` returns AZN amounts** (`base`,
  `discount`, `total`) while line 23 of the same file promises none, and on a trial
  `total` is the full plan price. Latent (no mobile caller today) but it is the
  Store & Payments rule. Not fixed.
- **Staging seed**: `supabase/seed/staging_smoke_seed.sql` — a synthetic
  administrator, one 5.00 AZN olympiad package and 30 published 5-option questions
  in the 5th-grade pool, so the paid olympiad rail can be exercised. Refuses to run
  against any database holding students or payments. Idempotent.

## PINNED — FROM-ZERO REBUILD PROOF: DISCHARGED (2026-08-21)

**Canonical SQL reproduces production. Proven, not assumed.**

Bootstrapped `OlympIQ Staging` (empty, PostgreSQL 17.6) from canonical
`001`-`012`,`014`,`015`,`016` in one uninterrupted pass — all 15 files exit 0 — then ran `013`:
**126/127 PASS** (013 had 127 checks then; migration 128 added check 124, so the
criterion is now **127/128**).

The single failure is `102_curriculum_translations`, and it is EXPECTED on a schema-only
database: that check asserts CONTENT coverage (>= 260 exam topics and >= 1077 subtopics carrying
`en` + `ru` translations). Staging has 0/0 because no curriculum was imported; production has
exactly 260/1077. Its three diagnostic columns — `rpc_misconfigured`, `failed_invariants`,
`stale_overloads` — are all `0` on staging, which is the SCHEMA half of that same check passing.

This closes a gap that stood from the start of the project through migration 127. Migrations
117-127 were applied to production with no fresh-bootstrap proof behind them because there was
nowhere safe to run one. There is now, and canonical SQL is confirmed to match.

### Two procedural facts learned doing it, now in CLAUDE.md

1. **`013` is not purely a schema check.** A from-zero rebuild is proven by 127/128 with ONLY
   `102` failing. Any other failing check on a fresh build is a real divergence.
2. **A canonical file must be sourced in one uninterrupted run.** `011` takes over two minutes
   and no canonical file self-transacts, so a client timeout mid-file leaves its statements
   COMMITTED. Re-running it then fails on its own half-finished work
   (`function ... already exists`) and reads exactly like a canonical defect — it is not. If a
   rebuild is interrupted, `drop schema public cascade` and start over rather than resuming.
   This happened on the first attempt here and briefly looked like a real bug.

### Environment

`OLIMPIADA_PROD_DB_URL` (ref `napx...rygn`) and `OLIMPIADA_STAGING_DB_URL` (ref `jzzw...rfqx`)
are confirmed DIFFERENT Supabase projects. `OLIMPIADA_DEV_DB_URL` is deleted.

### Known nit, deliberately not fixed

`011` line ~5901 uses bare `create function` for
`bulk_insert_olympiad_package_questions` where the rest of the file uses `create or replace`.
A from-zero build runs each file once so this is harmless, and changing it risks the
migration-to-canonical byte-parity tests (`olympiad-dup-key.test.ts` and friends) for no benefit
to the documented procedure. Recorded so nobody rediscovers it as a bug.

## PINNED — APPLIED: 124-127 + STAGING EXISTS (2026-08-21)

**Migrations 124, 125, 126 and 127 are APPLIED to production. Validation `013` = 127/127 PASS.**
Payment mode is `off`; `giveaway.duration_days = 30`, `giveaway_period = false`, never started.

### The environment finally has two databases

`OlympIQ Staging` (Supabase, `eu-west-1`, free tier) exists and `OLIMPIADA_STAGING_DB_URL` is
set. `OLIMPIADA_DEV_DB_URL` — the variable that held PRODUCTION behind the word "dev" — has been
DELETED; production is now `OLIMPIADA_PROD_DB_URL` only. CLAUDE.md updated accordingly.

**The from-zero rebuild proof is still OWED, not skipped.** Migrations 117-127 all landed on
production with no fresh-bootstrap proof behind them, because there was nowhere safe to run one.
There is now. Run it before the next migration.

### A rule learned the expensive way, now in CLAUDE.md

**Migrations apply BEFORE the code that needs them deploys.** Vercel auto-deploys on push. On
2026-08-21 a push carried code selecting `checkout_sessions.intent_items` (and five siblings)
while the migration creating them was unapplied: every AzeriCard endpoint answered "unknown
order" until the migration ran. Students and parents were unaffected (app code still read access
the old way) and payments were `off`, so the blast radius was the payment endpoints only. A
database ahead of its code is inert; code ahead of its database is broken.

### Two validation checks were not checking anything

- Check 122 contained `select freeze from defs`. `freeze` is a PostgreSQL keyword, so the
  statement failed to PARSE — the check ERRORED on every run rather than failing, which reads as
  coverage while providing none. Renamed to `freeze_def`.
- Checks 118 and 121 counted a REFUNDED payment as "granted with no money behind it", so the
  first genuine gateway reversal would have turned both FAIL forever with no way to clear them.
  A permanently failing alarm hides the condition it exists to detect. `refunded` now counts as
  billed, because the reversal path also revokes the grant.

Both are the same class as check 95 (migration 120) and check 114 (migration 126): an anchor
that describes yesterday's mechanism. When a migration changes a mechanism, re-point the check
that pinned it in the SAME change.

### Round 7 closed the delivery-truth defects

The honour rule now asks whether the DELIVERY is unchanged, not whether the amount matches. Two
concurrent-tab defects came from that one mistake: a shrunken basket charged at the larger frozen
price (parent pays double for half), and a lapsed free reinstate delivered as a paid add (a full
year granted free). Both now resolve to `delivery_changed` -> needs_review -> priority-1 alert.

Also this round: a `plan_change` RETRY no longer re-derives a delta from the stale absolute
basket — it refuses and sends the parent back to the editor, because re-deriving folds everything
they did in between into a change they never authorised. `plan_start` has no such hazard and is
unaffected.

### Known gaps

- **Nothing has been clicked.** No browser pass on the checkout, the olympiad purchase, the
  needs_review queue or the admin resolution screen.
- The paid OLYMPIAD purchase has never been exercised against ABB's test terminal — it is new in
  127 and the bank's rule is that nothing untested reaches production.
- Six low/medium review findings from round 7 remain open (pricing-availability blindness in the
  delivery test, reversal-window keying, `redemption_note` overwrite, an unclassifiable reversal
  on an unredeemed session, a free-op false positive, and a missing notification/audit row on a
  paid olympiad purchase).
- No renewal path. Recurring is unapproved by the bank (`AZCDF-100303`).
- Store submission is blocked on SCREENSHOTS, not code, for both Apple and Google.

## PINNED — THE LAST FREE GRANT, THE FROZEN PRICE, AND THE TWO SILENCES (migration 127, 2026-08-21) — CODE ONLY, NOT RUN

Seven findings, one change, because they are one sentence: **the payment causes the grant, the
grant is what was authorised, and neither side moves without the other.** Payment mode is `off` in
production, so none of it was exploitable; that is why it is fixed properly rather than hot-patched
later. **Nothing in this round has been run against any database** — see *Human Next Actions*.

### 1 — the WEB olympiad purchase granted LIFETIME access for free (HIGH; the last blocker)

`web-app/src/lib/auth/olympiadCore.ts` carried `processOlympiadPayment`, a documented MOCK that
returned `{ ok: true }` unconditionally and had never been wired to anything. `purchase_olympiad`
then wrote an ACTIVE purchase, migration `124` mirrored it into a **lifetime** entitlement, and no
`payments` row existed anywhere. Migration `126` closed only the mobile half. This was the single
remaining reason the payment mode could not be switched to `real`.

**Fixed the way 125 fixed the subscription, on the SAME rail.** `checkout_intent_kind` gains
`'olympiad'`; `checkout_intent_open` prices it through the new `quote_olympiad_purchase` and freezes
`[{package_id, grade_id}]`; `checkout_redeem_plan` gains a branch. There is still exactly ONE
function in the database that turns money into access — a second redemption path would be a second
copy of a billing rule, and a second copy mis-bills silently the day it drifts.

- **The grade is part of what is bought, not a detail.** `purchase_olympiad` SNAPSHOTS the child's
  grade and attempts draw that pool forever, so the intent freezes it and redemption refuses
  (`grade_changed`) if the child was promoted in between. A different pool is a different purchase.
- **Which rail paid is recorded.** `purchase_olympiad` writes `provider = 'none'` (it cannot know),
  and `fn_entitlement_map_purchase` reads exactly that column to choose `abb_web` vs `manual`.
  Redemption now sets it to `azericard`, or every paid package would have been filed as comped.
- **The duplicate purchase path is gone.** `/children/[id]/olympiads` posted to a `buyOlympiad`
  action that called `purchase_olympiad` directly — no quote, no intent, no payment. It now links to
  the catalogue, so there is one purchase flow.
- **LIFETIME is untouched.** `ck_entitlement_lifetime` still forbids an end date on a package grant,
  and `can_view_olympiad_package` still grants for an ARCHIVED package a family bought.

### 2 — the frozen price is HONOURED (OWNER DECISION, 2026-08-21)

Exact equality at redemption fired on ordinary behaviour: paying for child A moves child B's sibling
tier, so B's already-signed intent re-priced differently, B's money was taken and the redemption
landed in `needs_review` over a few AZN. **The price we quoted is the price the parent pays.**

**Where the line is drawn, and why it is defensible:**

- **Before the money moves we still refuse.** `checkout_intent_price` is unchanged and still returns
  `price_changed`. Refusing there costs the parent nothing, and it is what bounds the honour rule's
  exposure to the window between SIGNING and REDEEMING — minutes, not the day an intent may live.
- **After the money moves a differing amount is delivered**, recorded in `payment_events` as
  `honoured_frozen_price` with both numbers, so a settlement report can find every such charge.
- **A DIFFERENT DELIVERY still reaches a human.** A withdrawn subject, a deactivated pricing row, a
  package off sale, a promoted child, a subscription that vanished: none is a price difference, and
  delivering something other than what was authorised is the failure this family of migrations
  exists to prevent.
- **A re-price that comes back at ZERO also reaches a human** (`no_longer_payable`). If the thing
  the parent paid for has since become free, keeping the money is the other way to be dishonest.

**The discount is now VISIBLE where the parent chooses** (the owner's second ask). `quote_plan_change`
returns `rank` alongside `discount_percent`, and `PlanSummary` names the tier ("2-ci övlad
endirimi"), prints the saving on its own row, and — when no discount applies yet — says that a second
child is cheaper. That last line is the only place a one-child family learns the rule exists.

### 3 — the WEB free branch used the unguarded RPC (MEDIUM)

`subscribeChild` and `updateSubscriptionSubjectsAction` quoted, saw `dueNow === 0`, then called
`create_child_plan` / `apply_plan_change` — the exact quote-then-apply race `126` declared
indefensible from an app server, and indefensible from the web for the same reason. Both now pass
`paidChanges: "free_only"`, which reaches the `_if_free` wrappers; a new
`purchase_olympiad_if_free` gives the package path the same shape.

**The posture no longer selects an RPC** — `"allow"` is retired. After this round **no application
code path names a priced apply RPC at all**; `create_child_plan`, `apply_plan_change` and
`purchase_olympiad` are reachable only from inside `checkout_redeem_plan`, behind a verified
payment. A repo-wide sweep asserts it (`paidOlympiad.test.ts`). The posture now decides only WHICH
SENTENCE a refusal gets: `gate.notInApp` in the app (§5 copy rules), `sub.err.priceMoved` on the web
(the prices moved while we were saving — which is what actually happened).

### 4 — two trial edges (MEDIUM)

`status = 'trialing'` was read as "a trial is running", and the status is swept by a job rather than
by the clock — so a subscription whose `trial_ends_at` had already passed priced every addition at
ZERO and applied it as trial-time, for as long as the row stayed stale. The second edge: a
trial-bounded add was capped at `trial_ends_at` with no check that it was still in the future, so an
add could be applied free with an already-expired end (the parent pays nothing and receives
nothing).

Both are one predicate, computed identically in `quote_plan_change` and `apply_plan_change`: **a
trial is running only while `trial_ends_at` is in the FUTURE.** The apply then uses that value
directly instead of a coalesce chain, because the predicate proves it is non-null and future; a
legacy trialing row with no dates takes the PAID branch, which is the honest answer.

### 5 — a stale frozen basket could UN-CANCEL a subject (MEDIUM)

The intent froze the FULL DESIRED BASKET. Resume it after the parent has cancelled a subject and
`plan_change_states` classifies that subject as a REINSTATEMENT — a cancellation undone by a payment
made for something else. The mirror image was true too and was never reported: a subject the parent
ADDED after the intent was absent from the frozen basket and would have been scheduled for removal.

**THE RULE: a payment authorises a CHANGE, not a WORLD.** An absolute basket is a claim about the
whole plan at one past moment, and applying it later necessarily overwrites everything since. A
`plan_change` intent now freezes the DELTA (`plan_change_delta` → `checkout_sessions.intent_delta`,
covered by the freeze trigger) and redemption PROJECTS it onto coverage as it is NOW
(`plan_delta_project`). `intent_items` is kept and still frozen — it is the evidence of what the
parent was looking at; the delta is what is applied.

- **Considered and rejected:** re-validating the frozen basket at redeem and refusing on a conflict.
  That refuses to deliver the ADD the parent paid for because of an unrelated later decision — we
  would be keeping money without delivering, which is the thing we must never do.
- **Also rejected:** applying only the adds. A single Save can add (priced), un-cancel (free), move a
  cycle (free) and drop a subject (free); delivering a quarter of it is not honouring it.
- **One residual, stated:** a frozen `remove` still acts on a subject the parent re-acquired in
  between. Re-acquiring is priced, so it needs its own checkout inside the same minutes-wide window,
  and a removal is SCHEDULED for that subject's period end and is undone for free by a
  reinstatement. Bounded and recoverable, which the un-cancel it replaces was not.
- A pre-127 session carries no delta and falls back to the frozen basket — exactly the behaviour it
  was signed under. 013 check 122 reports how many such rows are still redeemable.

### 6 — `needs_review` reached nobody (MEDIUM)

It means we are holding a family's money and have not delivered on it, and it reached exactly one
place: 013 check 118 — a file somebody runs when they ALREADY suspect something. Two additions:

- `checkout_alert_admins()` files a **priority 1** in-app notification to every administrator, from
  redemption, from `checkout_flag_redemption` and from a reversal. Priority 1 is the level
  `create_notification` explicitly refuses to let a recipient silence. It cannot raise, so a failed
  alarm never rolls back the decision it is reporting.
- **A new admin page**, `/subscriptions/checkouts` (Administrator-only, its own nav entry). It shows
  both shapes and keeps them apart: `needs_review` (money held, nothing delivered) and `applied`
  with a note (delivered, follow-up failed — the Auth-admin call, or a later reversal). **It grants
  nothing**: the only write records what an operator DID.

**The alarm needed an off switch, and giving it one required a decision.** There are two redemption
statuses, both terminal, and neither means "a person settled this" — so 013 check 118 would have
gone permanently red seven days after the first genuine case. Moving the status to `applied` would
have been a lie about a refunded case and would destroy the record of what happened to the money.
So `admin_resolve_checkout_review` writes `resolved:<sentence>` into the NOTE plus an audit row and
leaves the status alone, and checks 118 and 123 skip a row carrying that prefix. A blank resolution
is refused: "somebody clicked the button" is not an answer to "what happened to this family's money".

### 7 — a gateway REVERSAL was invisible (found in the live bank test, 2026-08-21)

We reversed RRN `623279219080` with TRTYPE=22 and it worked. Two undocumented facts:

- the gateway acknowledges a reversal with the **single character `1`**;
- a status query with `TRAN_TRTYPE=1` reports the ORIGINAL authorisation as `actionCode=0 /
  Approved` **forever**. The reversal appears only in an answer to a `TRAN_TRTYPE=22` query.

`queryTransactionStatus` hardcoded `TRAN_TRTYPE=1`, so reconciliation could never see a refund: the
money went back and the entitlement stayed live.

- `queryReversalStatus()` asks the second question; `reconcilePendingCheckouts` gains a third pass
  over `checkout_reversal_candidates()` and acts **only on a reconciled answer** (our order, our
  terminal, our amount, our currency — the same conjunctive test the sale has to pass). Revoking a
  family's access on a maybe is its own kind of harm.
- **What we assumed about the `1`:** `interpretReversalResponse` (pure, in `codes.ts`) maps it to
  `accepted` because that is what it accompanied, and maps **everything else — including a body that
  looks like a decline — to `unknown`**. It never returns "declined". Concluding a reversal failed
  from an undocumented body would leave a family's money returned while we kept their access, so the
  safe direction for an unreadable answer is "go and ask". Nothing acts on the acknowledgement alone.
- `checkout_revoke_reversed()` marks the payment refunded and expresses the revocation **on the
  PRODUCER** — an olympiad purchase becomes `refunded`, and only the subjects the frozen delta
  BOUGHT have their period closed at `now()` — so migration `124`'s mirror revokes the entitlement.
  A direct write to `entitlements` would be reverted by the next producer write or reconcile pass.
- **A real limit, stated rather than papered over:** the gateway answers status queries for 24 hours.
  A reversal performed after that is invisible to the sweep; the only evidence left is the settlement
  report, and an operator then calls `checkout_revoke_reversed` directly.

### 8 — the review of this round found seven defects; all fixed IN 127 (2026-08-21)

Migration `127` had not been applied anywhere, so it was edited in place rather than stacked with a
`128`. `124`/`125`/`126` are applied and were NOT touched.

**H1 + H2 — one root cause, one fix: the honour rule compared the AMOUNT.**
"The frozen price is the price" had been written as *"the amounts differ, therefore the price
moved"*, which is wrong in both directions at once:

- a delivery that **SHRANK** — two tabs, A froze `[add Math, add English]` at 18.00, B froze
  `[add Math]` at 9.00 and was paid first — re-prices at 9.00, and the amount-only rule read that as
  a price movement and charged 18.00 for a 9.00 delivery;
- a delivery that **GREW** — a frozen FREE `reinstate` whose coverage lapsed between signing and
  redemption is re-classified as a paid `add` — re-prices HIGHER, and the same rule honoured the
  smaller frozen amount and handed over a brand-new full cycle for nothing.

**The rule now: honour a moved price only when the DELIVERY is unchanged — the same subjects, each
with the same nature (add / reinstate / cycle / remove) and the same cycle.** Redemption re-derives
the change from the projection with the *same* `plan_change_delta` that froze it and requires the two
to be identical; the amount is a consequence of that answer, never a substitute for it. Anything else
is `delivery_changed` → `needs_review` → a priority-1 alert. `checkout_intent_price` asks the same
question before signing, where refusing costs the parent nothing. A pre-127 session carries no delta,
cannot answer the question at all, and is recorded for a human instead of delivered on a guess (this
supersedes the "falls back to the frozen basket" note in finding 5 above).

**M3 — a reversal revoked the INTENT, not the DELIVERY.** New column
`checkout_sessions.delivered_items`, written exactly once by `checkout_redeem_plan` in the same
statement that stamps `redeemed_at`, and pinned by the intent-freeze trigger afterwards.
`checkout_revoke_reversed` reads it and nothing else, so a refund can no longer close the period of a
subject a *different* payment paid for. A `plan_start` reversal also stopped cancelling the whole
subscription: the test is now "is any coverage still standing", which is one rule for both plan kinds
instead of a branch on the intent kind, so subjects added later by un-reversed payments survive. A
redemption decided before the column existed revokes NOTHING and asks for a person.

**M4 — `checkout_intent_price` compared the frozen grade with `students.grade_id`.** A legacy
grade-less package quotes `grade_id = NULL`, so every one of them re-priced as `grade_changed`: no
checkout could be resumed and the duplicate-purchase guard on that path went with it. It now compares
against the QUOTE's grade, exactly as the redemption side already did.

**M5 — the `provider = 'azericard'` stamp re-fired nothing.**
`trg_entitlements_from_purchases` is column-scoped and `provider` was not on the list, so a paid
package stayed filed as a comped `manual` entitlement. `provider` is on the list now (backported to
`015`) — the mirror should fire when the thing it mirrors moves; the alternative (a new parameter on
`purchase_olympiad`) would have added a way for a caller to name the wrong rail.

**L6 — the purchase recorded the CATALOG price, not what was charged.** After an honoured price the
purchase row and the `payments` row disagreed about the same money. The redemption now writes
`amount = <the amount taken>` alongside the provider stamp — and writes NOTHING when the RPC says
nothing was charged (an already-owned package), because that purchase belongs to somebody else's
payment; that case becomes `already_owned` → `needs_review`.

**L7 — a checkout whose child was deleted mid-flight showed SUCCESS.** The callback folded
`student_profile_id` — the column the child-delete FK NULLs — into "is this a family checkout", so
such a session was treated as the owner's protocol test: redemption skipped entirely, and a
completed-payment page shown for money that delivered nothing and was never recorded as undelivered.
The test is the INTENT alone now; `checkout_redeem_plan` answers the child question itself
(`student_gone` → `needs_review` → alert) and the parent is told the payment is not finished.

**The reversal sweep, hardened even though the mass-revoke fear was refuted.** Measured on the live
test terminal: a `TRAN_TRTYPE=22` query about an order that WAS reversed answers `actionCode 0 /
Approved`; the same query about one that was NOT answers `actionCode 3, rc -24, "Transaction context
mismatch"`. So a non-reversed order errors rather than approving — and the verdict is now three-valued
(`classifyReversalAnswer`): `reversed` only on a fully reconciled approval to the reversal question,
`not_reversed` on the definitive `-24`, and `unreadable` for everything else, which changes NOTHING
and flags the session for a person. A query that could not be MADE is not an answer and is not
flagged; the next pass asks again.

### Files

- SQL: `supabase/sql/migrations/2026_08_21_127_paid_olympiad_and_frozen_price.sql` (self-transacting,
  ~2 700 lines); backported to `001` (enum value), `007` (`intent_delta`, `delivered_items` + the
  re-issued `ck_checkout_intent_shape` + column comments), `011` (9 functions re-issued, 8 added,
  every revoke/grant carried), `013` (**NEW checks 121, 122, 123** + an amendment to 118 for the
  `resolved:` off switch), `015` (`trg_entitlements_from_purchases` re-created with `provider` on its
  column list). 013 is now **127 checks**.
- web-app: `lib/auth/olympiadCore.ts` (mock removed, quote core added), `lib/auth/olympiadService.ts`
  (intent-first; `buyOlympiad` deleted), `lib/auth/subscriptionCore.ts` + `subscriptionService.ts`
  (`free_only`, `rank`), `lib/payments/checkoutCore.ts` (`startOlympiadPayment`),
  `checkoutIntent.ts` (`openOlympiadIntent`, `flagCheckoutForReview`), `reconcileCore.ts` (reversal
  pass + the three-valued verdict), `azericard/statusResponse.ts` (`classifyReversalAnswer`),
  `azericard/{gateway,codes,store}.ts`, the AzeriCard callback route, `components/PlanSummary.tsx`,
  `OlympiadPurchase.tsx`, `SubscribeForm.tsx`, `ManageSubjects.tsx`, `AddChildWizard.tsx`, the two
  parent olympiad pages, `i18n/messages.ts` (8 new keys × az/en/ru) + two page KEYS arrays.
- admin-panel: `lib/admin/checkouts.ts`, `app/(protected)/subscriptions/checkouts/{page,ResolveCheckout}.tsx`,
  `subscriptions/labels.ts` (30 new keys × 3), `alerts/labels.ts` + `alerts/page.tsx`,
  `lib/admin/nav.ts`, `i18n/messages.ts`.
- tests: **NEW** `web-app/src/lib/payments/__tests__/paidOlympiad.test.ts` (36 assertions across the
  seven findings, the backport parity and the copy); updated `purchaseSilent.test.ts`,
  `planBasket.test.ts`, `reinstateSubject.test.ts`, `azericard/__tests__/invariants.test.ts`.

### Validation run this round

- `web-app`: `npx tsc --noEmit` PASS, `npm test` **514 passed** (504 before the review round).
- `admin-panel`: `npx tsc --noEmit` PASS, `npm test` **581 passed**.
- **NOT run:** `next build` (out of scope this round), `psql` of any kind. The migration has NOT been
  applied to staging or production, and `013` has NOT been re-run. That is the tracked gap.

## PINNED — EVERY REMAINING ROUTE TO A FREE PAID PLAN, CLOSED (migration 126, 2026-08-20) — CODE ONLY, NOT RUN

Migration `125` inverted **one** path — the web manage-subjects checkout. Review found three more
doors, all the same shape: something reached an **apply** with money owed and no money taken.
Payment mode is `off` in production, so none of it was exploitable; that is why it was fixed
properly rather than hot-patched later.

### A — the mobile BFF could buy (HIGH)

`api/mobile/v1/children/[id]/subscribe` called `subscribeChildCore` and `.../subjects` called
`updateSubscriptionSubjectsCore` — the **apply cores** — with no checkout intent anywhere. A parent
bearer token therefore reached a full paid plan for free the moment the mode became `real`. It is a
**store-policy** failure as much as a money one: `docs/STORE_PAYMENTS_COMPLIANCE.md` section 4 makes
the apps purchase-silent BY ARCHITECTURE, and Google's consumption-only test is **app-wide**. The
same reasoning applies to `api/mobile/v1/olympiads/[pkg]/purchase`, which was not in the findings
and is closed here too.

**The refusal point is inside the apply's own transaction.** New `create_child_plan_if_free` /
`apply_plan_change_if_free` call the real function and then RAISE `check_violation` /
`payment_required` if its **own return value** priced the change above zero — which rolls back the
apply, its `subscription_changes` rows and the `entitlements` rows migration `124`'s producer
triggers wrote. A "quote, see zero, then apply" pre-check cannot be made safe from the app server:
prices, the sibling tier and `launch_promo_config.trial_days` can all move between the two calls,
and READ COMMITTED gives each statement its own snapshot.

**Separate names, not a boolean parameter.** A parameter would have created a second overload of a
function called from five places while the OLD signature survived as a bypass. A differently named
function has to be typed out, which is a thing a reviewer sees in a diff. On the TypeScript side the
cores take a **required, defaultless** `paidChanges`, so a new route cannot inherit a posture it
never chose. *(Migration `127` retired the `"allow"` value entirely: the web free branch reaches the
`_if_free` wrappers too, so no application path names a priced apply RPC at all. The posture now
only decides which sentence a refusal gets.)*

**Refusal copy:** `gate.notInApp`, az/en/ru — "Bu dəyişiklik tətbiqdə tamamlana bilmir. Abunəliklər
bu tətbiqdə idarə olunmur." Deliberately **not** "manage it on your web account": section 5's copy
table lists that exact wording as the WRONG form (audit finding I6 — a plan or price plus a named
destination reads as a call to action without a link). It states a fact and names no price, no
destination, no URL and no purchase verb. It is a `gate.*` key, so `statusForErrorKey` already maps
it to 409.

### B — a running trial made every addition free forever (HIGH)

`quote_plan_change` prices an addition at **zero** while the plan is trialing and documents it as
"the adds ride the trial like every other subject". `apply_plan_change` did not honour that: it
anchored every add at `now()` plus its **full** cycle whatever the status. **Adding a yearly subject
on day one of a seven-day trial bought a year of access for nothing** — repeatable, with no
obligation recorded and nothing that could ever collect it (there is no renewal path at all, and
card-on-file is not approved by the bank — ticket AZCDF-100303).

**Decision, and why.** The trial is NOT disabled and additions are NOT charged mid-trial. A
trial-time add now **ends at the trial end**, exactly as `create_child_plan` already writes the
opening basket, so the platform has one rule: *while trialing, every subject period ends at the
trial end.* Defence:

- It makes the code do what the quote already **says**, instead of making the quote say what the
  code did. The alternative — charging for an addition in the middle of a free trial — would need a
  checkout mid-trial whose redemption then writes a period outliving the trial while every other
  subject dies with it. That is a worse shape, not a safer one.
- It satisfies the bar as stated: *never grant a paid period we have no way to charge for.* A
  trial-bounded window is not a paid period. It is **self-terminating**, so the absence of a renewal
  path costs nothing — access simply stops, and the parent's next plan is charged (`v_had_any` means
  no second trial per child).
- It keeps the product's trial, which is an owner-approved business rule, rather than quietly
  retiring one out of a bug fix.
- The `coalesce` chain **fails closed**: a legacy trialing row with no `trial_ends_at` and no period
  lands on `now()` and grants nothing.

`quote_plan_change`'s renewal date for a trialing add moves to the trial end too — H7 covers the
**dates**, not only the amounts, and "renews in a year" under a subject that dies with the trial is
the sentence that made the free add look legitimate.

**The `trial_days = 0` half.** `create_child_plan` took the `trialing` branch on `v_had_any` alone,
so with the config at 0 it wrote `trial_ends_at = now()`: a period that had **already ended**, while
the quote read the same 0 and charged the **full total**. A plan is now `trialing` only when it has
trial days left to run; everything else is `active` with real, full-length, paid periods.

**Free changes still work, untouched:** removals, reinstatements (migration `120`), scheduled cycle
changes, an active giveaway window and admin free-access intervals all price at zero and all still
apply with no payment, from web and app alike. That is the whole reason the `due_now === 0` branch
exists, and `apply_plan_change_if_free` refuses on a **price** and on nothing else.

### C — the Add-Child wizard was not inverted (MEDIUM)

Its primary button still said "İndi ödə" / "Pay now", charged nothing, and the real departure button
appeared underneath afterwards — two asks for one plan, the first of them false. It also printed
`quote.total` under a row captioned "due today", which is a **different number** whenever a trial
applies. The button now reads `pay.continue` when the server quote says something is due and
`pay.confirmNoCharge` when it does not, the figure is `quote.dueNow` on both the review and payment
steps, a zero is explained by `sub.trialNoChargeToday`, and the button is disabled until the
authoritative quote arrives rather than guessing. Same flow as manage-subjects: quote, intent,
redirect, verified payment applies.

### D — no reconciliation for a lost callback (MEDIUM)

A payment authorised at the bank whose BACKREF POST never arrives leaves the family **charged** with
no record, no plan and no alarm. The gateway answers `TRTYPE=90` for **24 hours**, so it is
recoverable only inside that window.

**Two halves, and the split is forced by a secret.** The status query needs a MAC signed with the
merchant private key, which lives only in the web app's environment and must never enter the
database — and there is no `pg_net` here, so a pg_cron job cannot make the call even in principle.

- `checkout_reconcile_candidates()` (SQL) names pending intents inside the window and at least five
  minutes old. `web-app/src/lib/payments/reconcileCore.ts` asks, records through the **same**
  `recordOutcome` the callback uses, and redeems through the **same** `checkout_redeem_plan` — never
  a second copy of "money becomes a plan". Driven by `POST/GET /api/payments/azericard/reconcile`
  (`x-reconcile-key`, or Vercel Cron's bearer `CRON_SECRET`), closed when its secret is unset.
- `checkout_redeem_sweep()` is the **no-network floor**: sessions the ledger already records as
  `paid` whose redemption never ran. Scheduled in `016` as `olympiq_checkout_redeem_sweep` every 10
  minutes, inside the existing `pg_cron` guard, so an environment without pg_cron skips with a
  NOTICE. It deliberately skips a `plan_start` whose child has no 8-digit ID yet — finishing one
  needs a Supabase Auth admin call SQL cannot make, and the web sweep owns those.

Idempotent throughout, never grants on an unreconciled answer (a failed or mismatched status query
leaves the session pending for the next pass), and anything that cannot be delivered stays
`needs_review` by `checkout_redeem_plan`'s own judgement. 013 check **118** is the alarm for both.

### E — the intent-open path had no rate limit (LOW)

The resume action was throttled and the open path beside it was not, so the cheaper way to sign an
order was the guarded one. `startPlanPayment` now draws on the **same named budget**
(`CHECKOUT_RATE_SCOPE`, 20 per 15 min per parent) — two buckets would let a caller take the full
allowance twice by alternating screens. It also stopped minting a fresh `checkout_sessions` row per
click: a pending intent for the **same** kind and the **same** frozen basket is re-priced and
re-signed under its existing ORDER, which is also the safer half (two orders are two transactions to
the acquirer, and its duplicate protection is per-ORDER).

### Files

**SQL** — `supabase/sql/migrations/2026_08_20_126_free_only_and_reconcile.sql` (new,
self-transacting, LF), backported into `011` (three re-issued functions plus four new ones, every
revoke/grant carried explicitly), `016` (the sweep job) and `013` (new checks **119** and **120**).

**web-app** — `lib/auth/subscriptionCore.ts`, `lib/auth/subscriptionService.ts`,
`lib/auth/olympiadCore.ts`, `lib/auth/olympiadService.ts`, `lib/payments/checkoutCore.ts`,
`lib/payments/checkoutService.ts`, `lib/payments/reconcileCore.ts` (new),
`app/api/payments/azericard/reconcile/route.ts` (new), `lib/payments/azericard/store.ts`,
`lib/planBasket.ts`, `components/AddChildWizard.tsx`, `app/(parent)/children/new/page.tsx`,
`app/api/mobile/v1/children/[id]/subscribe/route.ts`,
`app/api/mobile/v1/children/[id]/subjects/route.ts`,
`app/api/mobile/v1/olympiads/[pkg]/purchase/route.ts`, `i18n/messages.ts`, `.env.local.example`.
Tests: `lib/payments/__tests__/purchaseSilent.test.ts` (new, 37 cases) plus three existing suites
re-pointed at what actually changed.

### Known and tracked, NOT fixed here

- **The WEB olympiad purchase still runs on the mock payment seam** (`processOlympiadPayment` always
  approves), i.e. it grants lifetime access without taking money. That is the same defect `125`
  fixed for plans and it needs the same treatment — its own checkout intent kind — which is a piece
  of work, not a line. Only the MOBILE half is closed here, because that half is also a store
  violation.
- **There is still no renewal path.** Nothing charges at a period end. After this change a trial can
  no longer be used to manufacture a paid period, so the gap is a lapse rather than a leak — but
  recurring billing remains blocked on the bank (AZCDF-100303).

### Validation

`npx tsc --noEmit` clean; `npm test` **467/467** (22 files). `next build` not run, per instruction.
No `psql`, no AzeriCard call, no commit, no `mobile-app/` file touched.

**One new SHARED i18n key — `gate.notInApp`.** The mobile catalog is generated from the web one, so
after this merges: `cd mobile-app && npm run sync-i18n` (plus the usual `expo.version` bump if that
regeneration is committed alongside mobile changes).

Migrations `124`, `125` and `126` are all **written and not applied**. Run `124`, then `125`, then
`126` against **staging** first, then production, then `013`.

## PINNED — THE PAYMENT NOW CAUSES THE GRANT (migration 125, 2026-08-20) — CODE ONLY, NOT RUN

### The defect

The parent checkout applied the plan change **first** and asked for money **afterwards**, so the
money was optional. `subscribeChild` / `updateSubscriptionSubjectsAction` called
`create_child_plan` / `apply_plan_change`, which write `subscription_subjects.current_period_end
= now() + cycle` unconditionally; migration `124`'s mirror turns that into a **live entitlement**
immediately; and only then did `openCheckoutForApplied()` open a charge — a helper documented as
"can only return null — it never fails the change". No cron expires an unpaid subscription.

Concretely: a parent adds a 90 AZN yearly subject, confirms, closes the tab before paying. The
child has a live year of access, no `payments` row is ever written, and repeating after each
lapse makes it indefinite. Payment mode is `off` in production, so no real parent could reach it.

Two review findings were downstream of the same mistake and are fixed by the flow, not patched:
the confirm sheet's primary button said "Pay now" and charged nothing (the real payment step came
afterwards — two asks for one change), and the start-a-plan screen's "due today" and trial row
were computed independently of what would be charged (invariant **H7** broken in both directions).

### Why it could not simply be reordered

`checkout_sessions` recorded an **amount** and never a **purchase**: no student, no subject list,
no cycles. A verified payment had nothing to act on.

### The fix

1. Parent picks subjects/cycles → **quote only, no mutation**.
2. `checkout_intent_open()` opens a pending session carrying the child, the frozen basket and the
   quote RPC's **own** `due_now` — quote and insert in ONE transaction, so no parameter exists
   through which a price could travel.
3. Full-page redirect to the hosted page (unchanged).
4. Verified callback → TRTYPE=90 status query → `recordOutcome` → **then**
   `checkout_redeem_plan()`, which re-prices and applies.

Abandonment is harmless **by construction**: step 4 never runs and step 2 granted nothing.

### Decisions worth re-reading before changing any of it

- **Intent COLUMNS, not a `checkout_session_items` child table.** The intent and its price must be
  one indivisible row; the jsonb payload IS `plan_items_normalize`'s existing input contract;
  freezing a column set is one trigger where freezing a child collection is three; and an FK from
  items to `subjects` would either CASCADE (silently shrinking a signed basket — delivering a plan
  nobody authorised) or RESTRICT (a stale pending checkout blocking a subject deletion).
- **Re-price at redeem, EXACT equality or a human.** A price change, a withdrawn subject, a
  sibling plan started in another tab and a payments-off flip all land in `needs_review` with a
  reason. Never "grant anyway if it got cheaper", never a partial basket: each way of differing
  has a different correct resolution and only a person can pick it.
- **Exactly once** = a row lock plus `redeemed_at` stamped in the same transaction as the apply,
  over the existing `payments` / `payment_events` unique keys and `apply_plan_change`'s replay
  guard — keyed here on the ORDER, not the interactive 5-minute bucket.
- **`needs_review` is terminal**, so a replayed callback does not re-attempt an apply already
  judged unsafe. A DELIVERED redemption whose follow-up failed (only
  `child_login_email_failed` today) keeps status `applied` and carries a **note** instead: two
  problems that need two different answers must not share one word.
- **A second intent is safe.** Once the first payment is redeemed, a second `plan_start` raises
  `already_subscribed` and a second `plan_change` for the same basket prices at zero and raises
  `nothing_due`. The only window left — paid twice before the first callback lands — fails into
  `needs_review` with the money recorded.
- **`quote_child_plan` now applies `create_child_plan`'s own one-trial-per-child rule and returns
  `due_now`**, so the preview and the charge are one computation (H7).

### Also fixed, from the same review

- **013 check `114`** turned FAIL on the first legitimate `manual` / `apple_iap` /
  `school_license` entitlement and stayed FAIL, masking real drift. Both `new_*` sides are now
  scoped to producer-linked rows, so it measures the MIRROR (what the triggers and the hourly
  reconciler write) instead of the existence of grants it was never measuring.
- The two guarded-deletion hints `subject_has_entitlements` / `package_has_entitlements` had no
  admin-panel mapping and no az/en/ru copy, so the panel silently dropped them. Both added.

### Files

- `supabase/sql/migrations/2026_08_20_125_checkout_intent.sql` — **WRITTEN, NOT APPLIED**.
  Backported into `001` (2 enums), `007` (8 intent columns inline + `ck_checkout_intent_shape` /
  `ck_checkout_redemption` + column comments), `011` (3 partial indexes,
  `fn_checkout_intent_immutable` + trigger, re-issued `quote_child_plan`, the 4 intent functions
  with their revoke/grant lines), `013` (new checks `117`, `118`; amendment to `114`).
- `web-app/src/lib/payments/checkoutIntent.ts` (new) — open / re-open / re-price / redeem.
- `web-app/src/lib/payments/checkoutCore.ts` — `openPlanCheckout` and `liveSubscriptionIdFor`
  removed; `startPlanPayment` (open + sign in one step) and a re-price before every signature.
- `web-app/src/lib/payments/azericard/store.ts` — session row carries the intent;
  `findOutstandingSession` keys on the CHILD (a first plan has no subscription yet) and excludes
  expired / redeemed rows.
- `web-app/src/lib/auth/subscriptionService.ts` — the `due_now > 0` branch: payable → intent,
  free → apply. `web-app/src/lib/auth/subscriptionCore.ts` — `dueNow` on the quote,
  `resolveDesiredBasketCore`.
- `web-app/src/app/api/payments/azericard/callback/route.ts` — redeems after recording, and only
  says "ok" when the redemption applied.
- `SubscribeForm`, `ManageSubjects`, `PlanChangeConfirmModal`, `CheckoutRedirect`, the subscribe
  page, `messages.ts` (az/en/ru), and the two test suites.
- `admin-panel/src/lib/admin/deletion-hints.ts` + `admin-panel/src/i18n/messages.ts` — the only
  admin-panel edit in this round.

### Verification pass (same day) — four follow-ups found and fixed

1. **`next build` was broken.** `store.ts` carried `// eslint-disable-next-line prettier/prettier`
   over the `SESSION_COLUMNS` literal. There is no prettier in this project (no dep, no config,
   `.eslintrc.json` is just `next/core-web-vitals`), and naming a rule ESLint cannot resolve is an
   **error**, not a warning: `Definition for rule 'prettier/prettier' was not found` failed the
   production build outright. The directive is gone; the comment now says why the line stays long.
2. **The add-child wizard still assumed apply-then-pay.** `AddChildWizard.confirmPayment` read only
   `res.result` and jumped to the DONE step announcing `pay.success`. When a plan is PAYABLE —
   `launch_promo_config.trial_days = 0`, so even a first plan is charged — `subscribeChild` now
   returns `checkout` and applies nothing, and the wizard claimed a payment that had not happened,
   with no 8-digit ID (`create_child_plan` had not run) and no charge. It now renders
   `CheckoutRedirect` on the payment step and stays there; a response carrying neither `result` nor
   `checkout` is an error, never a success.
3. **A failed quote fell through to a free apply.** In `updateSubscriptionSubjectsAction`, `quoted.ok
   === false` skipped the payable branch and called `updateSubscriptionSubjectsCore` anyway. Every
   deterministic refusal is one the apply core repeats word for word, so nothing changes for a
   parent — but a TRANSIENT `quote_plan_change` failure could land an add with no charge behind it,
   which is the original defect wearing a different hat. A resolvable basket that will not quote now
   stops with the quote's own error.
4. **`already_subscribed` was swallowed by the order-mint retry.** `checkout_intent_open` raises it
   with SQLSTATE **23505**, and `openPlanIntent` treated every 23505 as an ORDER collision: eight
   fresh orders, eight family advisory locks, then the generic "not available" — while
   `intentErrorKey`'s mapping to `checkout.err.planChanged` was dead code. Only an *unhinted* unique
   violation is the index now.

### Validation

**web-app:** `npx tsc --noEmit` clean, `npm test` **430/430**, `npx next build` **succeeds**
(`/checkout/result` builds as a dynamic route). **admin-panel:** `npx tsc --noEmit` clean,
`npm test` **581/581**, `npx next build` succeeds.

The two admin-panel failures reported before this pass are fixed. They were real: that suite pins
canonical `011`/`015` character-for-character against migration **111**, and migration **124**
legitimately extended `subject_deletion_blocks` / `olympiad_package_deletion_blocks` with the
entitlement blocks. Pinning to `111` forever would mean a canonical file can never be legitimately
extended again, so the comparison now asks which migration **owns** each function (a one-line
`owner()` helper, the pattern the file already uses for `SUPERSEDED`) and compares those two against
`124`. Verified independently: both function bodies are byte-identical between migration `124` and
the canonical files.

No `psql`, no AzeriCard call, no commit. Migrations `124` and `125` are both **written and not
applied**; run `124` then `125` against staging first, then production, then `013`.

## PINNED — AZERICARD/ABB PROTOCOL LAYER (migration 123, 2026-08-19) — CODE ONLY, NOT RUN

ABB issued a **TEST terminal** and asked us to run a transaction and report back. This round
builds the **protocol layer and its proof** only. It deliberately does NOT build the purchase
experience: no parent-facing checkout, no change to the subscribe flow, nothing in `mobile-app/`
or `admin-panel/`. Store compliance is untouched.

**Nothing was executed.** No `psql`, no network call to AzeriCard, no commit. Migration
`2026_08_19_123_azericard_order_uniqueness.sql` is WRITTEN and **NOT APPLIED** (staging first,
then production, then `013`).

### The one fact the whole design is built around

The gateway's callback signature covers **AMOUNT, TERMINAL, APPROVAL, RRN, INT_REF** — and
**not ORDER**. A valid signature therefore proves that *some* transaction happened on our
terminal for that amount; it proves nothing about *which* of our orders it belongs to. Anyone
who ever obtains one valid tuple can post it back naming a different order and the signature
still verifies. So the callback route grants nothing and decides nothing: it verifies the
signature, looks OUR order up, refuses a tuple whose RRN/INT_REF already belongs to another
order, then asks the gateway itself (**TRTYPE 90**) about OUR order and believes only that.

### No entitlement is granted, on purpose

`docs/STORE_PAYMENTS_COMPLIANCE.md` §4.1 requires a provider-agnostic `entitlements` table as
the single source of truth for access, with ABB as ONE producer of rows. **That table does not
exist yet.** Wiring money to access before it does is the exact trap that document names, and
it is the difference between "add IAP" being a two-week job and being a rewrite. The layer
records payment facts and stops; the ledger row literally carries `granted: false`.

### Files

- `web-app/src/lib/payments/azericard/` — `mac.ts`, `format.ts`, `signing.ts`, `codes.ts`,
  `callback.ts`, `statusResponse.ts`, `resultPage.ts` (**pure**, no `server-only`, no
  `process.env` — the `planBasket.ts` / `subscriptionCore.ts` split) and `config.ts`,
  `gateway.ts`, `store.ts` (**`server-only`**, the only modules that touch keys or the DB).
- `web-app/src/app/api/payments/azericard/callback/route.ts` — public, POST, idempotent,
  rate-limited per IP and per order, body-capped, generic responses, no field echoed.
- `web-app/src/app/api/payments/azericard/test-initiate/route.ts` — owner-only, guarded by
  `AZERICARD_TEST_TOKEN` (constant-time, fail-closed, **404** not 401 so a parent or child
  cannot tell it from a typo). `POST` mints an order and returns the signed field set (or
  `?format=html` for a real browser redirect); `GET` reports configuration problems by
  VARIABLE NAME, or re-runs a TRTYPE 90 query for `?order=`.
- `web-app/next.config.mjs` — CSP `form-action` now names the two AzeriCard MPI origins
  explicitly (a redirect checkout is a form POST to the acquirer; `'self'` alone blocks it).
  Never widened to a wildcard.
- `web-app/.env.local.example` — the full `AZERICARD_*` block, all server-only, all commented.
- `web-app/src/i18n/messages.ts` — `payres.*` (7 keys × az/en/ru) for the bare, chrome-free
  result and redirect pages. No price, no CTA, nothing reflected.

### Tests — 386 pass (was 263), `npx tsc --noEmit` clean, `next lint` clean

120 of them are new. The ones that matter: the spec's **three known-answer vectors** (auth,
callback, status), the absent-field rule (`-` with the length NOT counted, and an empty string
counts as absent), every per-TRTYPE field order, sign/verify round-trip with a **throwaway**
keypair (the real keys never enter a test), rejection of a tampered signature / a signature
over different data / a signature by another key, and source-level invariants: the callback
verifies before it queries, never falls back on the callback's own ACTION, calls no RPC, knows
no entitlement, and echoes nothing.

### Two decisions the owner should know about

1. **A documented ambiguity in their spec.** §8.1 lists `TRAN_TRTYPE` among the merchant-
   generated fields of a TRTYPE 90 request; §8.3's **worked example** computes the MAC without
   it. We follow the worked example and pin it as a known-answer vector. If the live test
   returns an invalid-signature error on status queries only, set
   `AZERICARD_STATUS_MAC_INCLUDES_TRAN_TRTYPE=true` — both readings are implemented and tested.
2. **The status-response field NAMES are undocumented.** §8.2 describes them in prose ("Banks
   approval code") rather than naming the JSON keys. The parser is tolerant (JSON, form, XML,
   plus an alias table) and the test route reports which keys it recognised and how many it did
   not, so the alias table can be finished from EVIDENCE after the live run.

### Deliberately not built

Card-on-file / recurring (`TOKEN_ACTION=REGISTER`, `MERCH_TRAN_STATE`, `TOKEN`, `EXT_NET_REF`)
— the bank has not approved it for this merchant and a dormant token path is an unused money
surface. The seam is `config.tokenUrl`; nothing reads it.

---

## PINNED — DEMO PAYMENT MODE DELETED (migration 121, 2026-08-18)

**Migration `2026_08_18_121_remove_demo_payments.sql` is written and NOT YET APPLIED** (the
orchestrator applies it: staging first, then production, then `013`).

Both lanes (DB+web+admin, mobile) are merged and validated together: **web-app** tsc + 263
tests + `next build`; **admin-panel** tsc + 518 tests + `next build`; **mobile-app** tsc + 354
tests (29 suites) + eslint + `check-i18n` (725 keys in 180 files resolve). Mobile is at
**1.11.0** in `app.json` and `package.json` together.

The owner removed the demo payment mode from the platform. It was the temporary
"cosmetic card form, nothing is charged" stand-in for a payment provider, and today
production is IN it (`payments = false`, `demo_payments = true`).

### Three modes now, not four: `real` | `giveaway` | `off`

- The `demo_payments` flag ROW is deleted, and `fn_payment_mode_exclusivity()` now enforces
  exclusivity over the PAIR (`payments`, `giveaway_period`) **and REJECTS any attempt to
  re-insert a `demo_payments` row** (`check_violation`, hint `demo_payments_removed`). The
  trigger's WHEN clause routes such a row into the guard REGARDLESS of `enabled`, because a
  DISABLED row would still render as a selectable payment mode in /settings. A flag nothing
  resolves is worse than an error: it would claim the platform is in demo mode while it is
  really charging.
- `current_payment_mode()` and `get_mobile_config()` lost their demo branch. Both were patched
  from their OWN live definition (the house rule), never retyped — 091's payment-mode fix and
  097's privacy block live in those bodies.
- **`off` STAYS.** It is not a payment method: it is the kill switch AND the fail-closed
  fallback every resolver returns on an infra failure, so the UI and `assert_payments_enabled()`
  always agree. Removing it would show a paid UI on a hiccup while the DB refused every write.

### Production legitimately lands in `off` — that is intended

The migration does NOT switch `giveaway_period` on. Enabling it stamps `giveaway.started_at`
and starts the free-window clock, which is the owner's launch decision, made from the admin
panel. `giveaway.duration_days` is also untouched (still **7**) — the owner wants a one-month
free launch, but that is an admin-configurable business setting and is theirs to set, in
/settings → Features, at the moment they flip the giveaway on.

### The fake billing surface went with it

With demo payments gone, fabricated invoices are worse than none. The parent Subscription
page's static Billing card (next billing 29/01/2026, MasterCard ****8475, expiry 11/2028, the
three inert card buttons) and the whole Invoices section (email toggle, request button, two
PAID invoice rows) are deleted, along with `InvoicesSection.tsx` and ~33 i18n keys ×3 locales.
Billing now prints only the child's REAL per-subject cycles, next charge date and amount, or an
empty state; Invoices says "none yet". **The parent analytics demo dashboard was NOT in scope
and is untouched.**

### The card form is gone, not relabelled

`DemoPaymentModal` is deleted from disk. Its real half — the AUTHORITATIVE server quote and an
explicit confirm before a paid change is applied — survives as `PlanChangeConfirmModal`; its
DEMO badge, its "no card is ever charged" line and its four cosmetic card fields do not. Same
in the Add-Child wizard: step 4 is now a CONFIRM step showing the due-today total. This is a
deliberate call, not a rename: a card form that looks real but charges nothing, with the
disclaimer removed, invites a parent to type a real PAN into a field that goes nowhere.

### Admin panel

The Features tab offers two payment-mode switches; the demo toggle, its `FLAG_META` entry and
its six i18n strings are gone, and the exclusivity note now says "these two". One more leftover
was fixed while in there: the Subscriptions module badged every `provider = 'none'` row **Demo**
— now "Provayder yoxdur" / "No provider" / "Без провайдера", which is the fact it always meant.

### Guarded against return

013 check `108_demo_payment_mode_removed` asserts, on every validation run: no flag row, the
exclusivity function covers the pair and still carries the re-insert guard, the trigger catches
a demo row regardless of `enabled`, neither resolver resolves the mode, and the two resolvers
agree. Check `33` is now the PAIR and check `57`'s mode whitelist dropped `demo`. Two
source-reading suites (`web-app/src/lib/__tests__/demoPaymentsRemoved.test.ts`,
`admin-panel/src/lib/admin/__tests__/demo-payments-removed.test.ts`) fail the build if the mode,
the modal, the card fields or the i18n come back — in ANY of az/en/ru.

### Mobile app — purchase-silent, v1.11.0

The mobile lane went further than the flag, because the demo mode was the ONLY mode in which
the mobile purchase wizard rendered: deleting the mode deleted the last reachable checkout.
`DemoPaySheet.tsx` and `SubscribeFlow.tsx` are deleted from disk rather than left dormant,
`demoPay` is gone from `CommercePosture`, and `PaymentMode` is `real | giveaway | off` with a
server that still says `demo` degrading to the fail-closed `off`. Per branch: `real` → a
read-only status card, `giveaway`/free-access → the existing free notice + `bffActivateFree`
plus a now price-free subjects editor, `off` → `gate.paymentsOff` (removal-only editor). The
Add-Child `flow` phase went with `SubscribeFlow`; `ManageSubjectsEditor` stays (it is still
reachable in giveaway/free/off) stripped of every amount. Store-compliance consequence: **no
AZN amount, purchase verb, buy CTA, confirm sheet or purchase API call is reachable in any
parent or child session** — the parent olympiads tab is browse-only, the public Services
screen is information-only, and the child-facing "ask your parent to buy" strings are
overridden in `messages.mobile.ts` with access language in az/en/ru.

`messages.generated.ts` was regenerated from the web catalog AFTER both lanes landed (that is
the only correct order — the web lane deleted ~35 keys the generator copies).

### Consolidation pass (both lanes merged)

- **One real bug found and fixed:** `admin-panel/src/app/(protected)/subscriptions/labels.ts`
  had az + en rewritten off "demo" wording but the **RUSSIAN** `subs.subtitle` and
  `subs.detail.paymentNote` still said «демо». The existing catalog test only reads
  `messages.ts`, so a module-local `STRINGS` dictionary was invisible to it. Both strings are
  rewritten, and the test now sweeps **every string literal in the panel**, not just the main
  catalog — this is exactly the one-locale-survives failure mode the rule warns about.
- Repo-wide grep for `demo_payments` / `DemoPayment` / `DemoPaySheet` / `demoPay` / `'demo'`
  as a mode: every surviving hit is a HISTORICAL migration (a record of what ran — never
  rewritten), the removal migration and its canonical backport, a deliberate comment, or one
  of the two guard tests. No dead code left.
- Docs brought in line: `docs/MANUAL_TESTING_GUIDE.md` gains a banner plus a new **DM1–DM6**
  section (the guide is append-only, so the superseded R4/Z1/Z2/ZF4/AP3/M-series steps stay as
  the record and the banner says so); `docs/STORE_PAYMENTS_COMPLIANCE.md` §7/§7.1 now marks
  findings 1/2/3/4/6/7 and blockers A1–A2, I1–I4, I6–I7 CLOSED; the M2 stage in
  `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` carries a superseded note.

### Known gaps

- **Nothing has been applied or clicked.** The migration has not run anywhere; no browser pass
  on the rebuilt Billing panel, the Add-Child confirm step or the plan-change sheet.
- **The from-zero rebuild proof is still PENDING** (`OLIMPIADA_STAGING_DB_URL` unset). The 012
  seed no longer creates the row, and if it ever did again the new guard would ABORT the build —
  which is the intended behaviour but has not been proven on a real database.
- After the migration, production is in mode `off`: parents cannot start or extend a plan until
  the owner switches on the giveaway (or a provider lands). Removals stay legal by design.
- **No device pass on mobile.** The three posture branches, the browse-only olympiads tab and
  the information-only Services screen have not been rendered on a phone in any locale.
- **Store-build hardening is still open** and is build-variant work, not removal work:
  dead-stripping commerce at build time and excluding the Services screen + its deep-link
  routes from store builds (compliance §5 DO 1 and DO 3). They now guard an app with no
  purchase code left to strip.
- **Compliance gap #5 remains a store blocker:** `mobile-app/src/lib/notifMarkdown.tsx` opens
  arbitrary admin-supplied `https` URLs via `Linking.openURL`, and it renders on the STUDENT
  notification screen. The relative-path branch is correctly allowlisted; the `https` branch is
  not. Unrelated to demo removal and deliberately out of its blast radius.
- `mobile-app/src/lib/data.ts` still maps `price_amount`/`currency` off the olympiad RPCs into
  its row types. Nothing renders them; the mapper mirrors the server contract on purpose.

## PINNED — OPEN WITH THE BANK: RECURRING NOT YET APPROVED (2026-08-19)

**Chase this until it is answered. It is not a code task; it is a bank decision, and the whole
renewal design depends on it.**

Azericard (Vusal Abdullayev) confirmed on 2026-08-19 that ABB's original integration request,
ticket **`AZCDF-100303`**, did NOT state that we would use Recurring — so Azericard cannot enable
it on their own and must have the bank's opinion. They CC'd Elvin.Kishizada@abb-bank.az,
Orkhan.Dilbazov@abb-bank.az and Nazrin.Baylarova@abb-bank.az asking ABB to respond. Their offer
meanwhile: if we are NOT using Recurring, send the RSA public key and they configure the test
terminal immediately — which is the path we took.

**What Recurring buys us** (spec §6–7): `TOKEN_ACTION=REGISTER` + `MERCH_TRAN_STATE='S'` on the
first successful charge returns a 28-char `TOKEN` and an `EXT_NET_REF`; later renewals post
`MERCH_TRAN_STATE='M'` (merchant-initiated). That is also exactly the "flag the first charge as
the initial transaction of a recurring series" that the CBAR enhanced-authentication rules
require — without it, renewals silently die.

**What we ship if it is refused:** manual renewal. Each subject keeps its own period; before it
ends the parent is notified and pays again from the web. Same scheduler, one branch — the
renewal job sends a notification instead of a charge. It is a legitimate v1 but expensive:
churn on manual-renewal subscriptions is severe, and every parent must remember, every period,
for every child.

**Deliberately NOT pre-built.** No token flow, no dormant recurring path. The seam is marked in
the Azericard module. Build it when the bank says yes.

## PINNED — REPORT REPLY COMPOSER (migration 122, 2026-08-19)

**Applied to production. Validation `013` = 113/113 PASS** (new check `109_question_report_reply`).
admin-panel tsc + 581 tests + build; web-app tsc + 263 tests; mobile-app tsc + 354 tests +
check-i18n. Mobile stays **1.11.0** (no mobile source changed — only a synced string).

### The admin now writes the answer

`Həll olundu` / `Rədd et` open a composer instead of firing immediately: a read-only opening
line naming the date and time the report was FILED (`dd.MM.yyyy` / `HH:mm`, **Asia/Baku** — the
schema's convention; UTC would have shown every student a time 4 hours off), one required body
(10–1000 chars, trimmed), a read-only closing line, and a live preview of exactly what is sent.
`Baxışa götür` and `Yenidən aç` are unchanged.

Opening and closing render in the **report's** locale (`question_reports.locale`), never the
admin's interface language.

**Only one new column was needed.** `handled_by` / `handled_at` were already stamped by
`question_report_freeze` on every status change, so "the responding admin and timestamp" was
already persisted. `resolution_message` is the only addition — and the freeze needed no edit
either, because it restores a FIXED column list and a new column is writable by omission. That
is now stated in the trigger body so nobody "completes" the list and silently breaks this.

**The owner's rule reverses migration 117.** 117 deliberately wrapped the send in
`exception when others then raise warning` so a broken inbox could never block triage. The owner
asked for the opposite: if the send fails, the status must not change. The swallow is removed.
A NULL return from `create_notification` (student has in-app notifications off) is NOT a failure
and commits normally, with the reply still stored — the owner's other rule, preserved.

**How the preview is guaranteed not to lie:** the message is assembled by SQL
(`question_report_reply_text`) because the trigger is what sends it; the composer uses a
TypeScript port, and a test READS the SQL — both the migration and the canonical 011 backport —
asserting every template segment, all three closing lines, `Asia/Baku`, the two blank-line joins
and byte-identity between migration and backport. Change either side and the test fails.

**Idempotency key gained `md5(reply)`.** 117 keyed on (report, status), which with an
admin-written body would have deduped a CORRECTED answer after a reopen against the first, wrong
one and delivered nothing.

### Three review findings fixed after the build

1. **A typed reply could be silently discarded.** `if (current.status === to) return { ok: true }`
   was inherited from the payload-free transition action, where a no-op success was harmless.
   Here the request carries text: the branch skipped the update, the audit row and the
   notification, then closed the dialog reporting success. It now returns `already` with
   trilingual copy naming the way forward (reopen, then answer again).
2. **The three gates counted different units.** JS `.length` counts UTF-16 code units, the DB
   counts characters, so a six-emoji reply read as 12 in the browser and 6 in the database:
   composer said send, server agreed, DB rejected it as the opaque generic failure. A shared
   `replyLength()` now counts code points on both sides.
3. `report.reply.already` had to be added to the detail page's `KEYS` array — the repo's known
   failure mode. The existing guard test covers indirect `ERROR_KEYS` lookups and would have
   caught it.

**Left as specified, not a defect:** `report.reply.cancel` is `İmtina` per the owner's exact
table, though the panel elsewhere uses `Ləğv et` for cancel. Owner's string, owner's call.

### Renames

`nav.alerts` → Admin bildirişləri / Admin notifications / Уведомления администратора (including
`alerts.pageTitle`, which repeated the old wording). `nav.questionReports` → Texniki dəstək /
Technical support / Техническая поддержка. `nav.notifications` was already correct in en/ru.
Routes, hrefs, permission flags, component names and DB identifiers are byte-identical.
Admin-panel has no per-page `metadata`, so there was no tab title to change.

Also: `contact.responseTime` is now "Sorğunuz 24 saat ərzində cavablanacaq." (az/en/ru, web +
mobile).

### Known gaps

- **Nothing has been clicked.** The composer, the preview, the stored-reply display and the
  renamed menu have had no browser pass.
- The fail-closed send has never been exercised against a real failure.
- `qrep.detail.title` still reads "Sual bildirişi" — deliberately left; it names the record, not
  the section.
- **The from-zero rebuild proof is STILL PENDING.** `OLIMPIADA_STAGING_DB_URL` is unset;
  migrations 117–122 are on production without it.

## PINNED — DEMO PAYMENTS DELETED (migration 121, 2026-08-18)

**Applied to production. Validation `013` = 112/112 PASS.** web-app tsc + 263 tests + build;
admin-panel tsc + 518 tests + build; mobile-app tsc + 354 tests + check-i18n. Mobile **1.11.0**.

**Owner decision: the demo payment mode is gone from the database and all three apps.** The
platform now has **real | giveaway | off** — no fourth mode, no dormant path, no `if (false)`.

### Why `off` survived and what production runs today

`off` is not a payment mode; it is the kill switch AND the fail-closed value
`getPaymentModeInfo` returns on any infra error, which is what keeps the UI and the DB guard
(`assert_payments_enabled`) agreeing. Deleting it would show a paid UI on a Supabase hiccup.

Migration 121 deliberately does NOT turn the giveaway on: flipping `giveaway_period` stamps
`giveaway.started_at` via the trigger and starts the free-window clock. So production now sits
in `off` — intended, not a bug — until the owner flips it on launch day.
`giveaway.duration_days` is still 7 and is the owner's to set (they want 30).

**Verified after the trigger rewrite:** the exclusivity function still stamps
`giveaway.started_at` on the flip to on, still only stamps on a transition (an already-on flag
is not re-stamped), and now RAISES on any attempt to insert a `demo_payments` row — including a
disabled one, so the dead switch cannot reappear in /settings as a selectable no-op.

### The mobile app is now purchase-silent by construction

This is the part that matters for the App Store. The mobile purchase wizard rendered ONLY in
demo mode, so deleting demo removed it entirely: `SubscribeFlow.tsx` and `DemoPaySheet.tsx` are
deleted, and no purchase flow exists in any surviving mode. Purchase-silence is no longer a
server flag that could flip — it is the absence of the code.

Review then found three purchase affordances that survived that deletion, all fixed:

1. The parent home carousel still said **"Buy an olympiad package once"** (plus the 7-day-trial
   and "choose a plan" lines) in an always-mounted component.
2. A **primary "Choose a plan" button** on the parent home tab.
3. The public **FAQ** carried the pricing question, the trial billing line and the sibling
   discount — reachable from a STUDENT session.

These strings are generated from the WEB catalog, where the purchasing language is correct, so
they are patched through `mobile-app/src/i18n/messages.mobile.ts` (the overlay wins per key)
rather than by weakening the web copy. 11 keys x 3 locales.

A sweep of every key the mobile source actually renders now returns **two** hits, both
privacy-policy statements ("a child can never register", "we do not advertise to children") —
legitimate and reviewer-safe.

### One dead end fixed on the web

In `off` mode — the mode production now lands in — `ManageSubjects` passed
`disabled={saving || (addsDisabled && !!cur)}` to every covered subject's card, and the card's
`disabled` also gates its Remove button. So a paying parent had **no available action at all**,
with no tooltip saying why. That contradicted the server, which has always allowed removals
while payments are off so nobody is trapped in a plan they are leaving. `SubjectPlanCard` gained
a `cycleDisabled` prop: the cycle rail freezes, removal stays available. The other three hosts
of that card were checked and are unaffected.

### Also removed

The parent Subscription page's fabricated Billing/Invoices block (the "next billing 29/01/2026 /
MasterCard ****8475" card and two fake PAID invoices). `DemoPaymentModal` was deleted but its
REAL half survives as `PlanChangeConfirmModal` — the authoritative server quote plus an explicit
confirm before a paid change applies; deleting it outright would have made a subject addition
apply with no amount confirmation once real payments land.

### Known gaps

- **Nothing has been clicked.** No browser or device pass on any remaining mode.
- The giveaway has never been exercised end to end: flag on -> stamp -> free access -> expiry.
- No native Android or iOS build was run (EAS, owner-run). The Android build already in early
  access still contains the demo purchase flow until a new build ships.
- **The from-zero rebuild proof is STILL PENDING.** `OLIMPIADA_STAGING_DB_URL` is unset. This
  round is the one that most wants it: `012` no longer seeds the flag row, and the new guard
  would ABORT a rebuild if anything re-added it — intended, but untested.

## PINNED — UN-CANCEL + STAT SCOPE (migration 120, 2026-08-17)

**Applied to production. Validation `013` = 111/111 PASS.** web-app tsc + 256 tests + build;
admin-panel tsc + 511 tests + build; mobile-app tsc + 353 tests. Mobile **1.10.2**.

The two decisions the owner was asked for in the queue-of-six round, both now made and built
to the industry-standard behaviour.

### 1. Cancelling a scheduled removal is an UN-CANCEL, not a purchase

Removing a subject schedules it for THAT subject's own period end and refunds nothing — the
child keeps access until then. Choosing it again before that date was billed as a brand-new
add: **a second full period charged today for coverage the parent already owned**, and
`current_period_start/end` reset to `now()`, destroying the remaining prepaid time. The RPC
contradicted the removal rule in the same transaction.

Both halves came from ONE hand-copied predicate — `not exists (… and ss.remove_at is null)` —
appearing once in the preview and once in the apply. It answers "is this on the go-forward
plan?" and was being used to answer "must this be bought?". Those are different questions.

Migration 120 replaces both copies with one classifier, `plan_change_states()`, returning
`covered | reinstate | add`. A **reinstatement** (`remove_at is not null` AND coverage not
lapsed) clears `remove_at` and nothing else — cycle, price and period untouched — charges
zero, and is logged as `change_type = 'reinstate'` with `prorated_amount = 0`. A **lapsed**
row is still a true add, charged in full. This is the standard un-cancel: Stripe models it as
`cancel_at_period_end = false`, and Chargebee/Recurly/Paddle behave the same.

Ordering is part of the fix and is asserted three ways: the reinstate loop runs BEFORE the
cycle-change loop (which filters `remove_at is null`, so a reinstate-onto-another-cycle would
otherwise be silently dropped) and BEFORE the add loop (so a reinstated subject re-classifies
as `covered` and can never also be bought).

**Four defects found by review AFTER the build, all fixed before anything was applied:**

1. **013 check `95` would have gone FAIL on every run.** It pinned
   `left join public.subscription_subjects ss` inside `quote_plan_change`, and 120 rewrites
   that CTE to read the classifier. Re-pointed at the surviving guarantee (fed by
   `plan_change_states`, priced on the DESIRED interval, period from `s.period_end`) rather
   than at retired text. The 111/111 run proves it.
2. **The new copy told parents the wrong thing.** `subjedit.reinstateLine` said the subject
   "stays active until {date}" — but that date is the RENEWAL date on which it auto-renews and
   charges. Wrong in az, en and ru, on web and mobile, and it contradicted the note printed
   directly beneath it. Now "renews on {date} as before".
3. **The idempotency key lost the reinstatement.** Un-cancelling used to arrive inside
   `toAdd`, which the key hashes; classifying it separately took it out, so a reinstate-only
   save hashed identically to a no-op with the same adds and removes. Reinstate → change cycle
   → revert inside one 5-minute bucket and the third save replayed the first key and was
   swallowed. `reinstateKey` is now part of the hash.
4. **The app was stricter than the RPC.** `paidMutationGateKey` ran BEFORE the diff existed,
   so it blocked every subject change while payments were off — including the un-cancel this
   migration exists to allow, and including removals, which the database has always let
   through on purpose ("never trap a parent inside a plan they are leaving"). The gate now
   runs after the diff and fires only on `toAdd` or `toChangePlan`, matching
   `assert_payments_enabled()` exactly.

### 2. The Questions stat cards are bank-wide, and now say so

Both designs were defensible; silently mixing them was not. The cards count the WHOLE bank and
ignore the filters — which is right for a control that IS the status filter, since a number
that shrank as you filtered could never tell you how much work is left in each state. What was
wrong was leaving it unsaid, with a global number sitting directly above a filtered list. A
trilingual caption now states the scope.

### Known gaps

- **Nothing has been clicked.** No browser or device pass on the un-cancel flow.
- The reinstatement has never been exercised against a real subscription — only against the
  SQL and the derivation, by test.
- No native Android or iOS build was run (EAS, owner-run).
- **The from-zero rebuild proof is STILL PENDING.** `OLIMPIADA_STAGING_DB_URL` is unset.
  Migrations 117–120 have now landed on production without it. This matters more from here on:
  a staging database is also where ABB/Azericard test charges must be exercised.

## PINNED — QUEUE OF SIX (2026-08-17): APPLIED AND VALIDATED

**Migrations 117, 118 and 119 applied to production. Validation `013` = 110/110 PASS.**
admin-panel tsc + 511 tests + build; web-app tsc + 232 tests + build; mobile-app tsc + 353
tests. Mobile **1.10.1** (app.json and package.json in sync).

Six owner prompts, built in the order the assistant chose (owner: "i will leave the build
order to you").

### 1. `plan.removeSubject` rendered raw — and the cause was not the translation

The key WAS defined in all three locales and the component DID call `t()`. It rendered raw
because the hosting pages build a FIXED `KEYS` array and pass `tt = (k) => dict[k] ?? k`, so
a key the array omits falls through to itself however well translated. **That is the class of
bug, not this one key.** A test now asserts the opt-in for every page that hosts the card.
Copy is now az "Ləğv et" / en "Remove" / ru "Убрать".

### 2 + 5. Per-subject billing, and the Add-Child card overlap

**Proration and the single shared renewal date are RETIRED** (owner, reversing the earlier
"prorate on add; keep one shared renewal date per child"). The database already behaved
correctly — migration 109's `apply_plan_change` writes a full period per subject at `now()`
and `quote_plan_change` already returned `prorated = false`. The work was the leftovers:

- The reachable fallback is gone. A subject-ids-only caller now has its basket DERIVED
  server-side (`lib/planBasket.ts`), so both cores always call the plan pair. Migration 118
  then dropped `quote_subject_change` / `apply_subject_change`, the last route into the old
  model.
- **A billing bug found in review of our own change:** the derivation resolved a subject's
  cycle from `activeRows`, which EXCLUDES rows scheduled for removal. Re-selecting a yearly
  subject fell through to the subscription default, and `apply_plan_change` writes
  `interval = excluded.interval` on conflict — so a yearly subject would have silently become
  monthly. Membership and cycle are different questions and now read different sets
  (`allRows`). Mutation-tested.
- **The Add-Child overlap was a container bug, not a spacing bug.** `.splan-card` chose its
  column count from a VIEWPORT media query while every host caps it at 520–600px, so the
  name track (`minmax(0, 1fr)`, minimum 0) collapsed and the `flex: none` Remove pill
  overflowed into the cycle rail. It only reproduced in az/ru: the rail's max-content is
  ~200px in en, ~244px az, ~318px ru — an English screenshot looked fine. Now a container
  query on `.splan-list`, so every host is fixed at once. A second defect surfaced while
  checking the selected state: `.splan-seg` never declared `--seg-fill`, so the chosen cycle
  had no fill at all.

### 3. One reports section — see the 117 entry below for the full account

### 4. Explanations are trilingual end to end

**No schema change was needed** — `question_explanations` has been keyed on
(question_id, locale) since 004, and its RLS is locale-agnostic. The gap was entirely in the
write paths and the templates.

- **All four bulk templates** (general | olympiad × text | mixed) share ONE constant whose
  `en`/`ru` members carried no `explanation` key. That is why every downloadable template
  taught an az-only explanation.
- **Both importers silently DROPPED translated explanations.** The `question_explanations`
  insert sat INSIDE the `… and coalesce(translations->loc->>'body','') <> ''` guard, so a row
  supplying `{"en":{"explanation":"…"}}` with no `en` body lost it with no row, no error, and
  no entry in the per-item errors array. Migration 119 hoists it out.
- Legacy compatibility is explicit: a single-string explanation still imports as the az row,
  and `loadQuestionForEdit` now returns ALL THREE locales so a first save cannot wipe a live
  az explanation.
- **A consequence caught in review:** 119 makes an explanation-only locale storable, but the
  olympiad pool editor counted an explanation as "this locale is active" and then demanded a
  full body plus five options — making such an imported question PERMANENTLY UNEDITABLE, with
  the only escape destroying the explanation. Server and client mirror both fixed.

### 6. Admin → Questions: 31 confirmed defects, 12 high

Audited before being touched (the five reported areas were all already implemented, so this
was a defect report, not a build request). Every finding survived an independent attempt to
refute it; 2 were refuted and dropped.

- **Bulk delete deleted ZERO and reported nothing.** `trg_question_delete_guard` is a BEFORE
  DELETE **FOR EACH ROW** trigger that RAISES, so one answered question aborted the whole
  statement. Now partitions answered questions first, deletes the rest, and names the blocked
  ones with the action that applies (ARCHIVE) — the first time the UI has said so.
- **Paging duplicated and dropped rows.** `created_at` was documented as the tiebreaker and
  is not unique (a bulk import stamps one timestamp across a whole file), so reviewing a
  status page by page silently skipped questions forever. `id` is now the final key.
- **Silent lies, now honest:** a failed list query rendered as "heç bir sual tapılmadı"; a
  failed count rendered as `0` (now an em dash); a broad search rendered "0 of 0" because
  ~1000 uuids in a `.in()` is a ~37 KB URL that is rejected outright (now capped at 200 and
  SAID); the option-E chip number was the length of a truncated scan (now shown only when the
  chip is in use).
- **Selection could destroy invisible rows** — it survived a page turn, a filter change and a
  sort with no reconciliation. Now scoped to the rows on screen, which also clears it after a
  delete.
- **Deleting a question orphaned its image** (`media_asset_id` is `on delete set null`, so
  the Storage object survived and stayed publicly fetchable). Now collected before the delete
  and swept after re-checking that nothing surviving still references it.
- Bulk delete now writes an audit row; it was the only Admin-only destructive action without
  one.
- **A bug in that very fix, caught by two independent reviewers:** the sweep filtered
  `answer_option_translations` by `answer_option_id`; the column is `option_id`. supabase-js
  RETURNS errors rather than throwing, so the wrong name produced `data: null` and every
  per-option image would have leaked silently. Column names are now asserted against 004
  itself, and every collect query checks its error.

### Open decisions for the owner

1. **Cancel-removal is billed as a new add** (pre-existing, migration 109). A parent who
   schedules removal of a yearly subject with 8 months paid and then changes their mind is
   charged a full new year today, and `apply_plan_change` resets the period to `now()` —
   paying twice for overlapping access, which contradicts "a removal keeps access to period
   end with no refund". Fix = make the RPC's add-detection distinguish "genuinely new" from
   "removal being cancelled". NOT done: it changes what customers are charged. No real money
   is at risk today (payments are demo mode).
2. **The Questions stat cards ignore active filters** while sitting above a filtered list AND
   doubling as the status filter. Both designs are defensible; silently mixing them is not.
   Needs a decision, not a guess.

### Known gaps

- **Nothing has been clicked.** No browser or device pass on any of the six.
- The Add-Child card fix rests on reading the cascade and doing the track-sizing arithmetic
  per locale — there is no headless browser in this repo. Needs eyes in **az AND ru**, light
  and dark, at ~1440 / ~600 / 320px.
- Search is CAPPED, not uncapped. The proper fix is an inner-join embed
  (`question_translations!inner`) replacing the two-step `.in()`; the pattern works elsewhere
  in this codebase but could not be exercised from the session, and an unverifiable rewrite of
  the main list query was not worth the risk.
- A search term of only punctuation is still silently ignored (low).
- The wide (≥640px) subject-card row is DORMANT: every host caps the card below 640px, so all
  screens render the two-row layout. Kept because it is correct for a wider host.
- **The from-zero rebuild proof is STILL PENDING.** `OLIMPIADA_STAGING_DB_URL` is unset, so it
  was skipped rather than pointed at production. Migrations 117, 118 and 119 have now landed
  on production without it.
- No native Android or iOS build was run (EAS, owner-run).

## PINNED — ONE REPORTS SECTION (migration 117, 2026-08-17)

**Applied to production. Validation `013` = 108/108 PASS.** web-app typecheck + tests + build; admin-panel typecheck + tests + build; mobile-app typecheck + 353 tests.

**Owner decision (2026-08-17): there is ONE reports section — `Sual bildirişləri` — and no email anywhere.** Migration 116 had shipped a second, platform-wide `bug_reports` feature the day before; 117 withdraws it. `bug_reports` held **0 rows**, so nothing was lost.

### What 117 dropped, and what it deliberately did not

Dropped: the `bug_reports` table with its policies, indexes, derive/freeze triggers, `submit_bug_report()`, and the three enums that were exclusively its own (`bug_report_status`, `bug_report_priority`, `report_reporter_role`).

**Kept on purpose:**
- `report_platform` — `question_reports.platform` shares it. Dropping it would have taken the surviving feature with it.
- `012`'s `contact.info_email` / `contact.support_email` — these are the real published addresses and are a separate, wanted feature. Untouched.
- `web-app/src/lib/mail/brevo.ts` — `lib/notifications/delivery.ts` uses it. Only `bugReportMail.ts` went.

No `CASCADE` on any drop, so an unexpected dependency aborts the migration loudly instead of quietly taking a neighbour with it.

### The removal was not just a subtraction

Withdrawing bug reports would have left the reporter with less than before, so triage now closes the loop itself: an AFTER UPDATE trigger on `question_reports` notifies the REPORTER when an admin takes their report into review, resolves it, or dismisses it — **in the language they filed in** (`question_reports.locale`, a real captured signal; `profiles.locale` is written by nothing and is `az` for everyone).

Two idempotency layers so a re-save cannot double-notify: the trigger's `WHEN new.status is distinct from old.status`, and a `create_notification` idempotency key of `'qreport:<id>:<status>'`. The send is wrapped — a failed notification raises a warning and never aborts triage. Anonymous and deleted reporters are skipped. Reopening to `new` sends nothing.

A dismissal notifies too, and honestly ("we checked it, nothing needed changing"). Silence is cheaper and worse: a student who reports a question and hears nothing concludes the button does nothing.

### Two pre-existing `question_reports` defects fixed in the same migration

Both were found by review because the new notifier depends on them:

1. **The freeze trigger was reverting its own FK cascade.** `reporter_profile_id` carries `on delete set null`; a referential action is an ordinary UPDATE, so `question_report_freeze` fired on it and restored the deleted id. PostgreSQL does not re-check the constraint against a row a trigger substituted, so the report kept a **dangling** reporter — invisible until the notifier tried to insert against it and took an FK violation that the wrapper would have swallowed as a warning, promising the admin a delivery that could not happen. The freeze now honours exactly the cascade's shape (new NULL, old set, profile gone), which no client can forge. 0 existing rows needed repair.
2. **A reporter could read `admin_note` and `handled_by` on their own report.** The policy was row-level while the grant is table-wide, and PostgREST lets the caller pick columns. Column privileges cannot fix it — an admin is also `authenticated`. Nothing in web-app or mobile-app reads this table (both only mention it in comments), so the reporter branch bought nothing and leaked triage notes: **SELECT is now admin-only.** The reporter learns their outcome from the notification instead.

### Deliberate, not oversights

- **`resolved` says "we fixed it"; `dismissed` says "no change was needed".** Nothing in the schema binds `resolved` to an actual edit — it is the ADMIN's assertion that action was taken, which is precisely what distinguishes it from `dismissed`. The admin-facing hint names what each button tells the student.
- **A student with in-app notifications off gets nothing** (`create_notification` returns NULL above priority 1). The admin hint now says so in all three languages rather than promising delivery.

### Known gaps

- **Nothing has been clicked.** No browser or device pass on the admin reports section or the new student notification.
- The reporter-facing notification has never been observed end-to-end against a real status change.
- No native Android or iOS build was run (EAS, owner-run).

## PINNED — 2026-08-16 ROUND: APPLIED AND VALIDATED (read before the entries below)

**Migrations 113, 114 and 115 are APPLIED to production. Validation `013` = 107/107 PASS.**
Gates: web-app typecheck + 199 tests + build; admin-panel typecheck + 455 tests + build; mobile-app typecheck + 352 tests. Mobile is at **1.8.2**.

### What the curriculum backfill actually did

Matched **260 / 260 topics and 1077 / 1077 subtopics**, inserting 520 topic and 2154 subtopic translation rows. The base taxonomy was proven untouched by the migration itself: it captures a count + md5 id-digest before the backfill and recomputes both afterwards, raising if either moved. **No topic or subtopic id changed, and the migration never writes to `topics` or `subtopics` at all.**

The key is **(grades.level, exact topics.name)** with `scope = 'exam'` on every join — a relational key, never array position. Byte-exact equality was chosen over `lower()` deliberately: PostgreSQL's `lower('İ')` yields `i` + U+0307 while the admin panel's `foldName` uses JS `toLocaleLowerCase('az')` and yields plain `i`, so a `lower()`-based key would disagree with the application.

**The document was verified before it was trusted.** It holds 65 tables per language in the same order; alignment was proven by comparing table counts, per-table row counts and every row's language-independent № and quarter across all three sections — 1077 rows, zero disagreements — and the parser aborts if that ever fails. Offline, the AZ names matched the live database 260/260 and 1077/1077 before a single row was written.

**AZ is NOT stored in the translation tables** (`check (locale <> 'az')`). `topics.name`/`subtopics.name` remain the AZ source of truth because they are `not null`, both bulk importers CREATE topics by name, migration 095's rerun key is `t.name = <source>`, and the admin duplicate guards fold on it. Mirroring AZ would need a two-way sync trigger and would break the first time an importer inserted a topic without the mirror row. The fallback is therefore STRUCTURAL: `coalesce(tr.name, base.name)` cannot be null and cannot be blank.

**Known and expected:** 12 subtopics have no en/ru — all `scope = 'olympiad'`, a separate admin-created taxonomy the document does not cover. They fall back to their AZ name, never to an empty string.

### §6 was NOT a retrieval bug — do not "fix" it again

`question_explanations` already had `locale`; `get_test_review` already joined the requested locale with an az fallback; `bulk_insert_questions` already imported `translations.<loc>.explanation`. The data is the whole story:

    question_translations : az 2897 / en 2896 / ru 2896
    question_explanations : az 2897 / en    0 / ru    0

Every question is trilingual; **no** question has a non-AZ explanation. An Azerbaijani explanation under an English question is the documented fallback working correctly on absent content. This round therefore LABELS the fallback so it reads as a known gap, and surfaces coverage to admins. Filling 2897 explanations is content authoring — deliberately not machine-translated.

### Three defects found and fixed during application

1. **A vacuous test of my own making.** The migration-113 round wrote `rpcCalls.find(c => c.fn === …)` while the stub records `name`. At runtime that returned `undefined` and the `if (purge)` guard SKIPPED the assertion — green, testing nothing — and it also failed typecheck, which went unnoticed because `tsc` was run BEFORE that edit and not after. The lookup is now unconditional. **Re-run typecheck after the last edit, not before it.**
2. **An incomplete revoke.** Both question-report trigger functions revoked EXECUTE from `public, anon` only. `010_rls_policies.sql:88` runs `alter default privileges … grant execute on functions to anon, authenticated, service_role`, so `authenticated` kept EXECUTE on two SECURITY DEFINER trigger functions. Widened to include `authenticated` in both the migration and the 011 backport. **Revoking `public, anon` is never enough in this project.**
3. **Migration 115 did not self-transact.** Its four `begin` tokens were plpgsql function bodies, not transaction control, so a mid-way failure would have left the feature half-created — table but no RLS, or policies but no grants. Wrapped before applying.

### Migration 113 — package delete lost its confirmation code (owner decision)

Deleting an olympiad package no longer asks for the typed slug; the dialog's acknowledgement is the only confirmation. Every data guard is untouched — `olympiad_package_deletion_blocks` still refuses a package with purchases or attempts, answered questions still force an ARCHIVE, and the cover asset is still reclaimed. Scope is narrow and ENFORCED: the verify block fails if `admin_delete_subject`, `admin_purge_subject_questions`, `admin_delete_olympiad_grade_pool` or `admin_delete_olympiad_questions` ever loses its token.

The new body was derived from the shipped one by anchored surgery, not rewritten. A hand-written replacement was drafted first and silently dropped `cover_media_id` reclamation and the rotation cleanup — it would have leaked the cover asset on every delete. **Derive from the live body; do not retype it.**

### Known gaps

- **Nothing here has been clicked.** No browser or device pass: not the Report-a-problem modal, not the admin Question Reports section, not the responsive changes, not the trilingual rendering.
- **No native Android or iOS build was run.** `mobile-app/` is a single Expo codebase serving both; Gradle/Xcode builds happen on EAS and are owner-run. Mobile typecheck and 352 Jest tests pass; that is all this environment can prove.
- Admin-panel surfaces still render AZ topic/subtopic names regardless of the admin's UI language — deliberate (AZ is the row identity admins match imports against), but it is a real en/ru surface awaiting an owner ruling.
- The from-zero rebuild proof is still owed (staging-only; `OLIMPIADA_STAGING_DB_URL` unset).
- `web-app/src/app/globals.css` was normalised from mixed endings (13335 CRLF + 39 LF) to uniform CRLF, which widens its diff by ~39 untouched lines.

## PINNED — TRILINGUAL CURRICULUM (migration 114, 2026-08-15)

**Not yet applied — the orchestrator applies migrations. web-app + mobile-app typecheck clean; admin-panel typecheck has one PRE-EXISTING failure in another round's in-flight work (see Known gaps).**

### The gap

`public.topics` and `public.subtopics` carried a single bare `name`. Every question on those screens was already trilingual, but the topic and subtopic LABELS around them were Azerbaijani in all three languages: the test topic/subtopic picker, the run-page header, the "Results by topic" block (tests AND olympiads) and the parent analytics per-topic / mistakes rows.

### The plan (executed)

1. `topic_translations` / `subtopic_translations` — the repo's existing sibling-table shape (`question_translations`, `olympiad_package_translations`): uuid PK, `public.content_locale`, `unique (parent_id, locale)`, timestamps, `on delete cascade`, same RLS posture, same `trg_set_updated_at` registration.
2. Backfill 260 topics + 1077 subtopics from the trilingual curriculum document.
3. Thread the reader's locale through the three RPCs that return topic names, and through the PostgREST reads.
4. Give admins EN/RU fields and a way to SEE what is still untranslated.

### AZ is NOT stored in the translations tables — `check (locale <> 'az')`

`topics.name` stays the AZ source of truth. It is `not null`, ~35 read sites key on it, BOTH bulk importers CREATE topics by it, migration 095's rerun match is `t.name = <source>`, and the admin duplicate guards fold on it. A mirrored `az` row would need a two-way sync trigger plus a loop guard and would still break the first time an importer inserted a topic without writing the mirror. One home per locale; nothing has to be kept in step.

The fallback is therefore STRUCTURAL, not conventional: `coalesce(tr.name, base.name)` cannot be NULL (`base.name` is `not null`) and cannot be `''` (`ck_*_name_not_blank`; the admin action DELETES an emptied EN/RU field rather than storing a blank).

### The backfill key, and the fan-out it avoids

Keyed on `(grades.level, EXACT topics.name)` restricted to `scope = 'exam'` — migration 095's own rerun key. Measured under five normalisations (exact / NFC / +whitespace / +quote-folding / +lowercasing): all five give 260/260 and 1077/1077, so plain `=` is used with NO `lower()`. That is deliberate, not lazy — PostgreSQL `lower('İ')` yields `i`+U+0307 while the admin panel's `foldName` uses JS `toLocaleLowerCase("az")` which yields plain `i`, so a lower()-based key would silently disagree with the app.

`scope = 'exam'` is on EVERY join. The live tree is NOT 260/1077 in total: grade-1 `math` topics with `term NULL` created by the OLYMPIAD package importer sit alongside it and several names collide. Without the scope filter the join fans out and writes curriculum English onto an olympiad pool topic. Guard E3 aborts rather than fanning out; those olympiad-scoped rows are deliberately left untranslated (importer artefacts, no source document).

The migration FAILS LOUDLY below 260/1077 and prints the unmatched keys (capped at 20). A partial backfill is a silently half-Azerbaijani curriculum that surfaces months later; the fix is one edited VALUES line and a rerun.

### Signature churn — the biggest risk in this round

A defaulted parameter does not replace a function, it ADDS an overload, and every call at the old arity then fails `function ... is not unique`. All three are dropped at the OLD signature first and re-granted at the new one (a fresh function is EXECUTE-able by PUBLIC, so skipping the re-grant would expose the analytics RPC to `anon` and the result helper to every authenticated session):

- `test_attempt_result(uuid)` → `(uuid, text)`
- `submit_test_attempt(uuid, jsonb)` → `(uuid, jsonb, text)`
- `get_child_subject_dashboard(uuid, uuid, int, text)` → `(uuid, uuid, int, text, text)`

**Deploy the DB before the apps.** PostgREST reloads its schema cache on DDL, but there is a brief window where a call at the new arity 404s.

### Deliberate behaviour change, named rather than slipped in

`get_child_subject_dashboard`'s `mistakes` block grouped by `t.name` and `coalesce(st.name, '—')`. A name-based key becomes locale-dependent AND already merged two genuinely distinct same-named subtopics into one row. It now groups by `t.id, st.id`, which VISIBLY SPLITS rows that used to merge on existing data. `per_package` also stopped hardcoding the `az` package title.

### Files

- **created** `supabase/sql/migrations/2026_08_15_114_curriculum_translations.sql` (LF, self-transacting, 2060 lines: schema · RLS · updated_at · the three RPCs · 1077-row staged backfill with guards E2–E6 · verify block F)
- **created** `supabase/seed/curriculum_2026_translations.json` (1077 rows, source of record beside `curriculum_2026.json`)
- **created** `web-app/src/lib/localizedName.ts`, `mobile-app/src/lib/localizedName.ts` (`pickName`, kept in sync by hand — mobile cannot import from web-app)
- **backported** `003` (both tables + comments) · `010` (enable-RLS array + academic-taxonomy policy loop) · `011` (trg_set_updated_at array + the three functions, re-verified byte-identical to the migration + grants + comments) · `012` (from-zero rebuild note: `001-012,014,015,016,013` then `095` then `114`) · `013`
- **web-app** `child/test/[subjectId]` (both embeds) · `child/test/run/[attemptId]` (topic embed) · `child/test/result/[attemptId]` (`p_locale`) · `(parent)/analytics` (`p_locale`)
- **admin-panel** `lib/admin/curriculum.ts` (EN/RU upsert-or-delete + `{hasEn,hasRu}` audit metadata) · `curriculum-shared.ts` (`LOCALIZED_NAME_LOCALES`, `parseLocalizedName`, `nameEn`/`nameRu` on the row types) · `curriculum/page.tsx` (embeds) · `CurriculumTree.tsx` (EN/RU second line + "translation missing" badge) · `TopicForm.tsx` / `SubtopicForm.tsx` (EN/RU inputs, name field relabelled "Ad (AZ)") · `labels.ts` (az/en/ru) · `globals.css` (`.cur-row-tr`, `.cur-pill-warn`) · the curriculum-shared test fixtures
- **mobile-app** `features/tests/api.ts` · `queries.ts` · `TestSetupScreen` · `TestRunnerScreen` · `TestResultScreen` · `lib/data.ts` · `(parent)/(tabs)/analytics.tsx` · `app.json` + `package.json` **1.8.1 → 1.8.2** (patch)

### Cache work: web needed NONE, mobile needed exactly three keys

web-app DOES use `unstable_cache` — in `lib/flags.ts` and `lib/pricing.ts` (an earlier note in this file claimed otherwise; corrected after re-measuring). It does not matter here: those eight cached fetchers read only `feature_flags`, `system_settings`, `site_content` and `subjects_pricing`, never `topics`/`subtopics`/`question_explanations`, and the one that IS localized (`site-content-rows-v2`) caches all three languages in a single entry and picks the locale afterwards. No cache key needs a locale. Every affected page reads cookies through `@supabase/ssr` and is dynamic; the language switcher sets the cookie and calls `location.reload()`.

Mobile's `useLocaleStore.setLocale` only mutates zustand and never touches the query cache, so `TQK.setup`, `TQK.result` and `["child-dashboard", …]` gained `locale` (matching the convention `["news", locale]` and `TQK.attempt/review` already use). Keying beats invalidating: the previous locale's data stays warm.

### `sync-i18n` WAS run (second pass)

The first pass added no shared keys. The second pass added `test.review.explAzOnly` / `test.review.explAzNote` to `web-app/src/i18n/messages.ts`, so `cd mobile-app && npm run sync-i18n` was run and `messages.generated.ts` regenerated (az/en/ru = 1374 each). It was never hand-edited.

## Second pass — web read paths swept, and the explanation fallback made HONEST (2026-08-15)

### The explanation gap is DATA, not retrieval — so the retrieval was not touched

`get_test_review` already joins `question_explanations` at the requested locale and falls back to `az` (011: the `qe` / `qe_az` joins and `coalesce(qe.explanation_body, qe_az.explanation_body)`), and `bulk_insert_questions` already imports `translations.<loc>.explanation`. The measured content is `question_translations` az 2897 / en 2896 / ru 2896 but `question_explanations` az 2897 / **en 0 / ru 0**. Every question is trilingual; NO question has a non-AZ explanation. The Azerbaijani text under an English question is the documented fallback working correctly on absent content. Not one line of that SQL was changed, and no machine translation was produced.

What changed is that the fallback now says so. `/child/test/review/[attemptId]` labels an explanation that is not in the reader's language with a chip ("Azerbaijani only" / "Yalnız Azərbaycan dilində" / "Только на азербайджанском") plus one muted sentence, so it reads as a known content gap instead of a broken translation.

### How the label decides — and why it is silent when unsure

The RPC returns a bare `explanation` string with no locale marker, and adding one would mean a THIRD migration in a round whose numbers are pre-assigned (114, 115). Instead the page asks `question_explanations` — indexed on `uq_explanation_locale (question_id, locale)` — which of the attempt's explained questions has a row in the reader's locale. Only the ids and locales are read; no bodies, no new exposure (RLS already lets a student read a published question's explanation).

`fallbackExplanationIds` (pure, unit-tested, `web-app/src/lib/explanationFallback.ts`) requires a VISIBLE `az` row before it labels anything. `qexpl_select` hides an ARCHIVED question's explanations from a student, and "no rows came back" must never be read as "no translation exists" — that would stamp *Azerbaijani only* onto text that may well be translated. The label errs toward silence in both directions.

One deliberate approximation, named: a LEGACY daily-round attempt (`daily_round_id` set) reads its explanation from the round's frozen `content_snapshot`, so the live lookup is a proxy there. It errs the safe way — an explanation translated after the snapshot was taken goes unlabelled, which is exactly today's behaviour. New rated rounds are per-student and do not use `daily_rounds` (011: "daily_rounds is LEGACY storage").

The `.in()` list is chunked at 100: an olympiad attempt may serve up to 500 questions (`questions_per_attempt`) and a 500-uuid query string would blow past the gateway's URL limit.

### Admin visibility of the gap — proportional, no new page

`/questions` (the page that already lists questions) gains:

- a per-row **İzah tərcüməsi** column: `EN · RU missing` (warn pill) / `Complete` / `No explanation`. It comes from one extra embed on the query the page already runs, so it costs nothing and is exact for the visible page. It uses the SAME honesty rule as the student label — with no visible `az` row it reports "no explanation" rather than guessing, because a Content Manager without `content.review` cannot see another author's in-review explanations;
- an exact coverage sentence under the review chips: "of {az} questions with an explanation, {en} are translated into English and {ru} into Russian". Three head-only counts with an `!inner` embed excluding the private olympiad pool — `uq_explanation_locale` makes counting explanation rows the same as counting questions. No 2000-row sample, so the number cannot silently lie.

No filter chip: filtering to "missing" would need a `NOT IN` over thousands of ids, and the capped-candidate-set pattern the `optionE` chip uses would truncate at 2000 against 2897 general-bank questions and report a wrong count.

### The web sweep — every topic/subtopic surface, not just the screenshots

Searched exhaustively (`from("topics"|"subtopics")`, every `.rpc(` call site, every file mentioning "topic"). The complete set of web-app surfaces that render a topic or subtopic name is the four the first pass already fixed: the test topic/subtopic picker, the run-page header, the result page's "Results by Topic" (tests AND olympiads, via `submit_test_attempt`'s payload) and parent analytics (`per_topic` / `mistakes`). `get_test_attempt` / `get_practice_attempt` / `get_test_review` return `topic_id` only. The mobile BFF routes (`/api/mobile/v1/*`) return no topic name at all. The parent per-child progress page and the public olympiad pages render none.

### One locale helper, not seven

`pickTranslation(rows, locale)` joined `pickName` in `web-app/src/lib/localizedName.ts` and replaced SIX hand-rolled copies of "find the locale row, else the az row": `(parent)/olympiads`, `child/olympiads` (twice), `(parent)/children/[id]/olympiads`, `child/test/run/[attemptId]`, `NewsArticleView`, `NewsBrowser`, `ParentNewsPanel`. `NewsArticleView` keeps its extra `?? trs[0]` third fallback at the call site (an article with no az row must still render). `lib/notifications/events.ts` was deliberately left alone — it prefers az then ANY non-empty title, because a stored notification is written in one language, which is different logic.

### Files (second pass)

- **created** `web-app/src/lib/explanationFallback.ts` + `web-app/src/lib/__tests__/explanationFallback.test.ts` (7 tests)
- **web-app** `lib/localizedName.ts` (`pickTranslation`) · `child/test/review/[attemptId]/page.tsx` · `components/TestReviewList.tsx` · `components/NewsArticleView.tsx` · `components/NewsBrowser.tsx` · `components/ParentNewsPanel.tsx` · `(parent)/olympiads/page.tsx` · `child/olympiads/page.tsx` · `(parent)/children/[id]/olympiads/page.tsx` · `child/test/run/[attemptId]/page.tsx` · `i18n/messages.ts` (2 keys × az/en/ru) · `globals.css` (`.tst-explain-head`, `.tst-explain-lang`, `.tst-explain-note`)
- **admin-panel** `(protected)/questions/page.tsx` · `components/QuestionsTable.tsx` · `lib/admin/question-flow-labels.ts` (5 keys × az/en/ru) · `globals.css` (`.expl-coverage`)
- **mobile-app** `src/i18n/messages.generated.ts` (regenerated by `npm run sync-i18n`; version already bumped to 1.8.2 in the first pass, so no second bump)

### Admin panel still shows the AZ topic name as the row identity — flagged, not silently kept

The owner's criterion says every admin surface should render the selected locale. The first pass decided the opposite for the admin panel and that decision was KEPT here rather than re-litigated mid-feature, for a reason worth the owner's ruling: `loadQuestionTaxonomy` feeds the filter cascade, the bulk-assign picker AND the bulk-import AI prompt, and `meta.topic` in an import file must be the AZ name (both importers create topics by name; migration 095's rerun key is `t.name = <source>`). Localizing the tree would put an English label in front of a key the importer cannot resolve, and localizing only the display column would leave the list and the filter above it disagreeing. EN/RU are visible and editable in the curriculum tree, which is where they are authored. **If the owner wants localized admin display anyway, it is a one-file change to the questions list plus the same treatment for every picker — say so and it ships.**

### Known gaps

- **Migration 114 has not been applied anywhere** (no `psql` from either pass). The E5 match report (260/1077) and validation `013` checks 49 + 102 are therefore UNVERIFIED against a live database. Until it is applied, `topic_translations` does not exist and the PostgREST embeds added to the child test pages will error — **DB first, then the apps**.
- **Mobile has not had the honest-fallback label yet.** The three trilingual strings are already in `messages.generated.ts`; the mobile review screen still renders the explanation unlabelled. Belongs to the mobile stage.
- **Report system: BUILT** (migration 115, unapplied) — see the pinned entry above.
- **`admin-panel` typecheck reports one PRE-EXISTING error** — `src/lib/admin/__tests__/guarded-deletion-actions.test.ts(385,42)`: `Property 'fn' does not exist on type '{ name: string; args: Record<string, unknown> }'`. That file is another round's uncommitted in-flight work (alongside `olympiad.ts`, `OlympiadPackageDeleteButton.tsx`, `015`, migration `113`) and was not touched here. Nothing in this round's files fails.
- **Both bulk importers still create topics with NO translations**, so an imported topic renders AZ in every locale until an admin fills it in. That is correct fallback behaviour, and the CurriculumTree badge is the only place it is visible.
- **Nobody has clicked the admin EN/RU forms**, and no native mobile build was produced — EAS/Gradle/Xcode are owner-run and cannot be executed here.

## PINNED — REPORT A PROBLEM, END TO END (migration 115, 2026-08-15)

**Not yet applied — the orchestrator applies migrations.** web-app: typecheck clean, 184 tests pass (was 170; +14 for the report action), build green. admin-panel: build green, typecheck + tests carry the SAME pre-existing failures as before this round (see Known gaps). mobile-app: typecheck clean, 339 tests pass, `expo.version` 1.8.2 → **1.9.0** (new feature).

### The plan (written before coding, executed as written)

A student can now flag a broken question (wrong answer key, typo, unreadable image, bad translation) from the two places a question is on screen — the test runner and the answer review — and an administrator gets a triage worklist. New table `public.question_reports`, following `support_requests`, not a new pattern.

### Where the trust boundary sits

The client sends a question id, a message and two enum-constrained diagnostic hints. **Everything else is derived by a BEFORE INSERT trigger** (`trg_question_report_derive`): reporter (from `current_profile_id()`), status (`'new'`), timestamps, the olympiad package snapshot, and the attempt context. That is what makes the reporter-can-INSERT policy safe — `WITH CHECK` is evaluated AFTER BEFORE triggers, so a hand-rolled PostgREST insert with a forged reporter, status or package produces exactly the row the RPC would.

**The rate limit lives in the trigger, not in the RPC and not in the app** (5 per rolling hour, 20 per rolling day, per reporter). Mobile talks to PostgREST directly (`mobile-app/src/features/tests/api.ts` — there is no BFF hop for tests), so an app-tier limiter would have guarded the web path only. `web-app/src/lib/rateLimit.ts` is still reused as a cheap first line and is explicitly labelled non-authoritative — its buckets are per server instance.

Other decisions worth keeping:

- **`attempt_id` is VERIFIED and silently DROPPED when it fails** (reporter's own attempt AND that attempt actually drew the question, checked against `test_attempt_answers`). A bogus context must not cost us a legitimate report.
- **`olympiad_package_id` is a SNAPSHOT**, not a read-time join: a pool question can later be archived or moved, and `test_attempts` has no package column.
- **A BEFORE UPDATE freeze trigger** makes a filed report immutable except `status` and `admin_note`, and stamps `handled_by`/`handled_at`. Its name sorts before `trg_set_updated_at`, so `updated_at` is still stamped.
- **Duplicate guard is a PARTIAL unique index** on `(question_id, reporter_profile_id) where status in ('new','in_review')` — closing a report frees the slot. 23505 surfaces to the child as a calm "already reported, being reviewed".
- **Report text is rendered in exactly ONE place** (the admin panel) and always as a React text child with `pre-wrap`. Never `dangerouslySetInnerHTML`, never through `notif-markdown.ts`, never into audit metadata (audit rows carry ids + old/new status only), notifications, emails or exports.
- **1000-char cap enforced four times**: textarea `maxLength`, the live counter, the RPC's `char_length`, and the column CHECK. Trimming is explicit on both sides — single-argument `btrim()` strips SPACES ONLY, so both SQL call sites pass `' ' || chr(9) || chr(10) || chr(13)` and a newline-only message is rejected rather than stored.
- **Success is an IN-PLACE modal transition on both web and mobile**, never a toast: web has no toast infrastructure and adding one for this would be a parallel system.

### The one placement that is NOT in the obvious canonical file

`question_reports.olympiad_package_id` gets its FK in **`015`**, not in the `008` CREATE TABLE. The canonical run order is `001`–`012`,`014`,`015`,`016`,`013`, so `public.olympiad_packages` does not exist when `008` runs and an inline reference would abort a from-zero rebuild. The migration itself declares the FK inline (it runs against a live database where the table exists).

### Files

- **SQL** — `supabase/sql/migrations/2026_08_15_115_question_reports.sql` (LF, **no self-`begin;`/`commit;`**, idempotent); backported into `001` (two enums), `008` (table + column comments), `010` (enable-RLS array + `qreports_select`/`qreports_insert`/`qreports_update`, no delete policy), `011` (six indexes, `trg_set_updated_at` registration, both trigger functions, `submit_question_report()`, grants incl. `revoke delete … from anon, authenticated`), `015` (the package FK), `013` (new check **`103_question_reports_hardened`**). `migrations/README_MIGRATIONS.md` gained a migration log.
- **web-app** — `lib/reportMessage.ts` (the shared cap + trim rule), `lib/auth/reportActions.ts`, `components/ReportQuestionButton.tsx`, mounted in `TestRunner.tsx` (question head, beside the flag) and `TestReviewList.tsx` (footer under the explanation); both test pages extended their dicts; `i18n/messages.ts` gained the `test.report.*` family in az/en/ru; `globals.css` gained the `.tst-report*` rules; `lib/auth/__tests__/reportActions.test.ts` (14 tests).
- **mobile-app** — `features/tests/ReportQuestionSheet.tsx`, `submitQuestionReport()` in `features/tests/api.ts`, controls wired into `TestRunnerScreen.tsx` and `TestReviewScreen.tsx`, `messages.generated.ts` regenerated by `npm run sync-i18n` (never hand-edited), `app.json` + `package.json` at 1.9.0.
- **admin-panel** — `/question-reports` list + `[id]` detail + both `loading.tsx`, `lib/admin/questionReports.ts`, `lib/admin/question-report-status.ts`, `components/QuestionReportStatus.tsx`, nav entry (`adminOnly`), `qrep.*` + `nav.questionReports` in az/en/ru, `.qrep-*` CSS, plus `?edit=<uuid>` deep-linking into the existing questions edit modal (`initialEditId`).
- **Remaining loading-state work** — new `loading.tsx` for `/questions` and `/olympiad` (curriculum and locations already had theirs).

### Known gaps / deliberate omissions

- **Migration 115 has not been applied anywhere** (no `psql` from this pass). Check `103` is therefore UNVERIFIED against a live database, and until it runs the report button will fail with a generic error on both platforms — **DB first, then the apps**.
- **`admin-panel/src/components/skeletons` DOES NOT EXIST.** The task asked to reuse it; there is no such directory and no skeleton component library in this repo. The four route skeletons are built from the existing `.loc-skel` shimmer primitive plus four new size modifiers (`.qrep-skel-card/-filter/-chip/-rows`). Stated plainly rather than pretended.
- **No date-range filter on the admin list.** `FilterBar` builds its hrefs from its own search key + select keys only, so a `from`/`to` pair added beside it would be DROPPED the moment any select changed. Filters shipped: status (also the four stat cards), subject (via `questions!inner` — the resolve-ids-then-`.in()` pattern caps at 2000 and would truncate against ~2900 questions), platform, and full-text over the report body.
- **No student-facing "my reports" screen.** The `qreports_select` reporter branch has no UI consumer in v1; it exists so ownership is enforced from day one and a future screen needs no policy change.
- **No admin note editor.** The column and its 2000-char CHECK exist and the freeze trigger permits writing it, but v1 ships status transitions only.
- **`question_id` is ON DELETE CASCADE**, so the owner-only curriculum-purge carve-out would take reports with it. The alternative (SET NULL) leaves a report about nothing. Flagged so the next purge migration counts the deletion instead of being surprised by it.
- **`platform`, `locale` and `app_version` are CLIENT-SUPPLIED.** The web path removes the risk (the action hardcodes platform and reads locale from its own `getLocale()`); a tampered mobile client could mislabel a row. They are enum/regex-constrained and must never become authorization inputs.
- **The admin detail page is an ANSWER-KEY surface.** `requireAdmin()` gates the page and the loader, and RLS gates the tables — but widening the route to content managers would leak keys.
- **`admin-panel` pre-existing failures, unchanged by this round** — `npx tsc --noEmit`: one error, `src/lib/admin/__tests__/guarded-deletion-actions.test.ts(385,42)` TS2339. `npx vitest run`: 2 failures in `guarded-deletion-sql.test.ts` (it still expects `admin_delete_olympiad_package`'s confirmation token / `(uuid,text)` signature that `015` and `013` no longer carry). Identical counts before and after: 452 passed / 2 failed of 454.
- **Nothing was clicked by a human**, and no native Android/iOS build was produced — `mobile-app/` is ONE Expo codebase and all EAS/Gradle/Xcode builds are owner-run.

## PINNED — OLYMPIAD LIST DELETE + POOL BULK DELETE (migration 112, 2026-08-15)

**Applied to production. Validation `013` = 105/105 PASS. admin-panel: typecheck + 454 tests + build green.**

Adds a Delete action to each Olympiad Packages row, checkbox selection with Select-All and bulk delete inside a package's question pool, and the wider page width the other data-table pages already use.

### THE PRODUCTION BUG THIS ROUND UNCOVERED — read this first

`Modal.tsx` held `onClose` in its open/close effect's dependency array. Callers pass an inline arrow, so the identity changed on every render of the parent — the effect re-ran on EVERY KEYSTROKE, cleanup restored focus to the trigger, setup moved it to the panel, and the input lost focus after the FIRST character.

**Every typed-confirmation dialog shipped by migration 111 was therefore impossible to confirm in production**: subject delete, olympiad package delete, grade-pool delete. The SQL guards behind them were real and tested; the dialogs in front of them could not be typed into. No test caught it because jsdom does not reproduce the focus race, and no human had exercised those dialogs. `onClose` is now read through a ref, like `busy` already was. **Lesson: a confirmation flow that has never been clicked is not verified, whatever the suite says.**

### The high-severity defect caught BEFORE the migration was applied

The first build of `admin_delete_olympiad_questions` never queried `olympiad_purchases` — zero occurrences in the file. Migration 111 REFUSES the identical operation (`grade_has_purchases_purge`) precisely because emptying a purchased grade's pool leaves a lifetime purchaser with a package that raises "pool too small" on every attempt: a silent revocation of a paid entitlement dressed up as a content edit, and a CLAUDE.md non-negotiable. The bulk button reached it in one click — grade-filter, tick the header checkbox, Delete selected, 500 rows a call.

Closed by EXTRACTION, not duplication: the purchase predicate moved out of `olympiad_grade_pool_blocks` into `olympiad_grade_purchase_count(uuid,uuid)`, and both guards now read that one definition. A second hand-written copy of "what counts as a purchased grade" is exactly how the gap appeared.

**The rule is a POSTCONDITION**, which is what lets it cover an operation whose effect varies with the selection: for every grade the selection touches, the published pool AFTER the delete must still satisfy that grade's `questions_per_attempt` (resolved through `olympiad_grade_config`, so migration 106's per-grade override is honoured). This cannot disagree with 111 — 111's operation always lands on zero, and zero is below every legal count — and it strictly ADDS the partial-selection case 111 never faced.

Proven live against `test-test` grade 3 (50 published, per-attempt 25, 1 purchase):

    delete 20 of 50  -> []                      (leaves 30, allowed)
    delete 30 of 50  -> grade_purchased_pool_below_attempt {grade "3. sinif", required 25, remaining 20}
    delete ALL 50    -> grade_purchased_pool_below_attempt {grade "3. sinif", required 25, remaining 0}

**The per-row delete shared the same gap** and was the bypass; it now routes through `admin_delete_olympiad_pool_question`, a thin wrapper over the same guarded body. One scope check, one purchase rule, one delete/archive policy for both buttons.

### The regression the remediation itself introduced

Extracting the predicate re-created `olympiad_grade_pool_blocks` **without re-issuing its revoke/grant**. `create or replace` PRESERVES the existing ACL, so every database that had already run 111 was unaffected and all 159 tests passed — the opening existed **only on a from-zero bootstrap**, where a SECURITY DEFINER function reading `olympiad_purchases`, `students` and `test_attempts` would have landed EXECUTE-able by anon over PostgREST. Since the from-zero proof has never been runnable here (no staging), nothing would have caught it.

Restored in both 015 and the migration, and now asserted for the CANONICAL file — the copy a new database is actually built from. The assertion was mutation-tested: removing the grant makes it fail, and 015 was restored byte-identical (sha256 verified). **A grant belongs beside every create, not once.**

### Also in this round

- **Confirmation token.** The bulk RPC takes `p_expected_code`, re-checked in the DATABASE under the row lock, and the token-less arity is dropped unconditionally so PostgREST cannot reach one. It is granted to `authenticated` like its siblings, so the dialog was never the control — the token is.
- **Honest acknowledgement copy.** The mandatory checkbox claimed content "cannot be brought back", which is false for the answered half (archived, restorable) — and in token-free mode it was the ONLY gate. Reworded in az/en/ru; the other dialogs sharing the label were audited and run the same semantics.
- **Stale vs foreign id** are now separate hints; a concurrent delete by another admin no longer reads as a selection bug.
- **Layout:** the olympiad pages join the `1560px` opt-in the questions/subscriptions/locations pages already use — the real inconsistency was width, not top margin (the list page's vertical structure is byte-identical to the news page). A panel-wide `.page` rule added mid-round was removed: 62 route roots of unverified blast radius for zero benefit here.

### Consequence to expect, so it is not a surprise

On a purchased grade whose published pool is already at or below `questions_per_attempt` (the migration-094 packages with emptied pools), **no published pool question can be hard-deleted at all**. The escape hatch is the one CLAUDE.md prescribes and 111 already relies on: archive the question — never blocked, reversible — after which it leaves the published pool and can be deleted freely.

### Known gaps

- **Nobody has clicked any of this.** Given the Modal bug above, that is the gap that matters most.
- No BEFORE DELETE trigger on `public.questions`, deliberately: it would also fire on the panel's two rollback deletes (add-grade undo, create-question undo) and strand half-created content, and Postgres hides a statement's own prior deletes from BEFORE-ROW triggers, so it would under-count exactly where the blast radius is largest. Enforcement lives where the operation is named; both admin paths now go through it.
- The from-zero rebuild proof is still owed (staging-only; `OLIMPIADA_STAGING_DB_URL` unset) — which is precisely how the grant regression above stayed invisible.

Audit action added: `admin.olympiad.questions_purge` (severity warning, counts only).

## PINNED — GUARDED DELETION + UNARCHIVE (migration 111, 2026-08-14)

**Applied to production. Validation `013` = 104/104 PASS. admin-panel: typecheck + 364 tests + build green.**

Adds what the owner asked for — delete a whole olympiad package, per-grade delete, per-grade and per-subject "delete all questions", subject delete, and Unarchive — but every one of them behind a guard, because three of these operations can destroy data that must never be destroyed.

### The rule this change did NOT break

CLAUDE.md forbids deleting purchased olympiad packages, and forbids hard-deleting a question any attempt has answered. Both still hold. `olympiad_purchases` is FK RESTRICT and `trg_question_delete_guard` still fires on cascade, so a package with purchases and a question with history are both undeletable. What the feature adds is a NAMED REFUSAL with counts instead of a bare FK error, plus an honest mixed outcome: unanswered questions are deleted, answered ones are ARCHIVED, and both counts are reported. **No admin button ever deletes `test_attempt_answers`** — that stays reviewed-migration-only territory.

### It closed a pre-existing hole rather than opening one

`/manage/subjects` already had a working Delete that ran a bare `.delete()` with no dependency check, and `subscription_subjects.subject_id` is ON DELETE CASCADE. Deleting a subject would have silently stripped it from paying parents' subscriptions, wiped its pricing rows and cascaded away its whole topic tree — and `deleteRow()` DISCARDED the error, so it would have looked like nothing happened. Subjects are now refused server-side by `NON_GENERIC_DELETE` (not merely hidden in the UI, so a hand-crafted POST cannot reach the table), and `deleteRow` surfaces failures for every resource.

### Proven, not assumed — three live guard tests, each rolled back

    subject WITH subscriptions   -> BLOCKED  {subject_in_subscriptions:2, subject_has_attempts:7,
                                              subject_in_olympiad_packages:5, subject_has_topics:51}
    subject with NO subs, 64 topics -> BLOCKED  {subject_has_attempts:3, subject_in_olympiad_packages:2,
                                                 subject_has_topics:64}
    package with 1 purchase      -> BLOCKED  {package_has_purchases:1}

The middle case is the one that matters most: without the `subject_has_topics` block, a freshly seeded never-played subject passes every subscription/billing check and the cascade takes the curriculum tree. Row counts were identical before and after all three probes.

### What the adversarial review caught (verdict went UNSAFE -> SAFE)

Nine findings, all closed. The three that mattered:

1. **The most destructive operations had the least protection.** Both container deletes required a typed confirmation code; the two PURGES — which destroy the most rows — required none, and both were granted to `authenticated`, so they were POSTable straight through PostgREST with the dialog bypassed. Both now demand the row's own code, and the token-less arities are unconditionally dropped so Postgres cannot keep them as bypass overloads.
2. **A purchase predicate was promoted past its blast radius.** The grade purge copied `status = 'active'` verbatim from `remove_olympiad_package_grade`, where the consequence was a restorable ARCHIVE. Here it is a hard delete — and `purchase_olympiad` re-activates a refunded row IN PLACE keeping its `grade_id`, so a dormant purchase could later go live onto a destroyed pool. The destructive path now counts purchases in ANY status; the archive-only path deliberately keeps the narrow predicate, and the divergence is pinned in both directions by the migration's verify block, 013 check 96 and the parity suite.
3. **The new trigger did not close the hole it was written for** — finding H3 above.

### A pre-existing bug at HEAD, found and repaired

`015_olympiad_preparation.sql` had `as # STATUS.md

## Purpose

This is the live implementation tracker for the OlympIQ project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

 … `$;` on `olympiad_grade_config` instead of `as $` … `$;`, so **a from-zero rebuild was broken at HEAD and nobody had noticed.** Cause: a scripted backport used JavaScript `String.replace()` with `$` in the REPLACEMENT string, which JS treats as an escape for one literal `# STATUS.md

## Purpose

This is the live implementation tracker for the OlympIQ project.

Claude Code must read this file at the beginning of every coding session and update it before and after every implementation task.

. **Never use a replacement string containing `$` when writing SQL — use a function replacer, `s.replace(a, () => b)`, and grep for truncated delimiters afterwards.** The migration file itself was intact; only the canonical copy was damaged.

### Expectation to set before using this

The subject blocks are strict enough that **most or all of the 6 live subjects are undeletable today** — verified above. The realistic use for "delete a subject" is a mistyped one created and never used, not clearing out a subject with history. That is the correct outcome, not a defect.

### Known gaps

- **Nobody has clicked these dialogs.** Everything is covered by 364 unit tests, typecheck and build, but the confirmation flow, the token gate, the acknowledge checkbox and the post-delete redirect have had no manual pass.
- Acting a second time on a row the dialog already deleted yields a generic `err.server` rather than a named message: the RPCs raise `no_data_found`, which is not in `HINT_KEYS`. Fails closed and the database refuses regardless — cosmetic, deliberately left.
- The from-zero rebuild proof is still owed (staging-only; `OLIMPIADA_STAGING_DB_URL` remains unset). The canonical backports are pinned byte-for-byte against the migration by the parity suite, which catches drift but cannot catch an ordering problem.

Audit actions added: `admin.subject.purge_questions`, `admin.subject.delete`, `admin.subject.archive_instead_of_delete`, `admin.olympiad.package_delete`, `admin.olympiad.grade_pool_delete`, `admin.olympiad.grade_pool_purge`, `admin.olympiad.archive_instead_of_delete`, `admin.olympiad.unarchive` (the last is severity `info` — it destroys nothing).

## PINNED — MIXED ZIP IMPORT: 1x1 IMAGES AND REFUSED WINDOWS ARCHIVES (2026-08-12)

Reported as "images import but the exam shows nothing"; the stored object was a valid PNG of ~70 bytes at 1x1. TWO INDEPENDENT defects, neither of which corrupts bytes — the reader was proven byte-exact against a real 153 KB PNG before anything was changed.

**1. Windows-native archives were refused outright.** PowerShell `Compress-Archive` and older .NET ZipArchive write member names with BACKSLASHES (`images\q1.png`), and `normalizeZipPath` rejected any backslash, so `openZip` returned `badPath` and the whole archive was refused — the archive an admin makes by right-clicking a folder. A backslash is now TRANSLATED to a forward slash BEFORE the segment checks, so traversal is still rejected. APPNOTE 4.4.17.1 requires forward slashes, so a backslash cannot legitimately mean "a filename containing a backslash", and unzip / 7-Zip / Windows all translate it too.

**2. A 1x1 placeholder imported cleanly — this is what produced the reported bug.** The mixed template ships `images/q1.png` and `images/q1_option_1.png` as 70-byte 1x1 transparent PNGs. They carry genuine PNG magic, sit under every size cap and upload with HTTP 200, so nothing in the pipeline could tell them from a real picture; an admin who edits the template's JSON but keeps its pictures ships blank questions. Byte length alone cannot separate a placeholder from a small icon, so `imageDimensions()` now reads the real pixel size (PNG / GIF / WEBP / JPEG) and `isDegenerateImage()` refuses anything under 2px in either direction, 1xN strips included. Unknown dimensions PASS, deliberately: unknown must never mean invalid, or a future encoder silently stops importing. Enforced in the browser as an actionable row error naming the file, AND in `verifyImportImage` — the only place a `media_assets` row is created, so the browser is not the authority.

**Also added:** the browser passes the uploaded byte length to `verifyImportImage`, which compares it against the size Storage reports and refuses a mismatch. A truncated or re-encoded upload can no longer surface later as a broken image inside an exam.

**Admin preview and the exam page were never different sources.** Both resolve the same `media_assets(bucket, path)` through `getPublicUrl` — admin at `lib/admin/questions.ts:162`, students via the payload's bucket+path. Both showed nothing because the stored object ITSELF was the placeholder.

**DATA ALREADY AFFECTED — needs an owner decision.** 100 `media_assets` rows under `imports/` are under 200 bytes: 50 question images and 50 option images, all referenced, all in package `test-test` grade 3. Those questions must be re-imported with real pictures. The new guards stop this recurring; they do not retroactively repair stored rows.

Regression test: `admin-panel/src/lib/__tests__/zip-windows-paths.test.ts` (13 cases) covers backslash translation, traversal still refused, byte-exact reads through the real `zip-bulk` resolver, the exact template-pixel bytes being flagged, and unknown-dimension passthrough. Two pre-existing tests asserted the OLD backslash rejection and were corrected — every genuine traversal case in them was kept.

## PINNED — 2026-08-11 ROUND: APPLIED AND VALIDATED (read this before the four entries below)

**Database state: migrations 108, 109 and 110 are APPLIED to production. Validation `013` = 99/99 PASS, 0 FAIL.**
The four detailed entries below describe the work; this entry records what happened when it was actually applied, because three defects only surfaced then.

**Every app is green:** admin-panel typecheck + 204 tests + build; web-app typecheck + 163 tests + build; mobile-app typecheck + 339 tests. Mobile is at **1.8.1**.

### Three defects found during application — all fixed, all worth remembering

1. **`interval` cannot be a bare `RETURNS TABLE` column name.** `plan_items_normalize` declared `returns table (subject_id uuid, interval public.plan_interval)` and failed with `syntax error at or near "interval"` — the parser reads the reserved keyword as the start of a type. Quoting the DECLARATION (`"interval"`) is sufficient: all 31 qualified reads (`n.interval`) still resolve unquoted, so no call site changed. Fixed in migration 109 AND canonical 011.

2. **A backfill that runs before its trigger exists primes nothing.** 109 step 3 backfilled `subscription_subjects` and step 5 then created `trg_sync_subscription_period`, so no pre-existing subscription ever had its five derived columns computed. `current_period_end` looked right purely by coincidence — the backfill copied `cs.current_period_end` onto every subject, so MAX equalled the value already stored — while `next_renewal_at` (the MIN: the next CHARGE date and the amount shown beside it) stayed NULL on every existing row. Check `92` caught it. Step **5b** now re-fires the trigger with a self-assignment (`set added_at = ss.added_at`) on exactly the rows that still disagree, so the trigger stays the ONE writer of those columns instead of the logic being restated in the migration. **The general lesson: a backfill placed before its trigger is not a backfill.**

3. **The orphan sweep was deleting live option images.** `import-media.ts`'s `consumers` array — the list that decides what counts as unreferenced — never gained `answer_option_translations` when migration 102 added option media, while the comment above it claimed "Every consumer is checked". The sweep runs on EVERY `verifyImportImage` call, so the next mixed import would treat the previous day's option images as orphans and delete them: a text+image option silently blanked (FK is ON DELETE SET NULL), an image-only option left as a live row pointing at deleted bytes. The `media_assets` delete error is now also checked BEFORE `storage.remove()`, because `ck_aotrans_text_or_media` makes that delete legitimately fail for an image-only option. Validation check `88` had the identical omission at both of its sites, so it would have **failed on healthy data** — patched too.

### How this round was run, and why the gates were not enough

Both rounds went through adversarial review AFTER the build gates were green. The first round passed typecheck + tests + build in all three apps and was still **partial on all four requirement areas**, with 33 cited defects — including defect 3 above, the text-only validator emitting the same error twice (an explicit "do not change text-only" violation), and `pending_interval` being write-only so a cycle change never actually applied. A green gate proves the code compiles and the tests that exist pass; it says nothing about whether the requirement was met. **Do not treat a green gate as done on requirement work.**

Two review findings survived remediation and were closed by hand afterwards: the Add-Child wizard omitted `groups` from PlanSummary's `server` prop (so a 2nd/3rd sibling saw undiscounted per-cycle subtotals under a correctly discounted total), and three stale "all 5 palettes" comments. Both are fixed; no count survives in those comments, so a 27th palette cannot make them lie again.

## PINNED — PER-SUBJECT BILLING CYCLES (investor §1) — migration 109, 2026-08-11

**Plan before coding.** `child_subscriptions.interval` was one value for the whole plan and `subscription_subjects` carried no interval, price or period, so every pricing join used `sp.interval = cs.interval`. "Each subject on its own cycle" was therefore impossible without a schema change. Plan: move the cycle AND the period onto `subscription_subjects` (all nullable, backfilled once, coalesce-guarded on read); add four per-subject RPCs and reduce the six existing ones to wrappers so 013's signature-pinned checks, `admin_grant_child_access` and shipped mobile binaries keep working against ONE implementation; rebuild the web configurator / subscribe form / Add-Child wizard / Manage-Subjects around a per-subject card + a grouped summary; keep the mobile parent surfaces reading a mixed plan correctly.

**Migration.** `supabase/sql/migrations/2026_08_11_109_per_subject_billing_interval.sql` (LF, self-transacting, idempotent, ends with a `DO $verify$` block). **Apply order: `OLIMPIADA_STAGING_DB_URL` first, then `OLIMPIADA_PROD_DB_URL`, and only after staging passes.** It must NEVER be `\i`-ed inside a rebuild proof — it self-transacts.

**Canonical backports.** `007` (the six `subscription_subjects` columns, `child_subscriptions.next_renewal_at`, `subscription_changes.interval` + the `plan_change` check), `011` (two indexes, `fn_sync_subscription_period` + its trigger, `plan_items_normalize` / `quote_child_plan` / `create_child_plan` / `quote_plan_change` / `apply_plan_change`, the six wrappers, the three attempt gates, `admin_manage_child_subscription`, `admin_grant_child_access`, `notify_expiring_subscriptions`, the grants), `013` (**checks 91 + 92**). **`010` is deliberately unchanged** — no new table, and `sub_subjects_select` already scopes by the parent subscription while writes are admin/service only. Line endings preserved: 007/011/013 stay pure CRLF, the migration stays pure LF.

**Redefinitions (the part a future reader must not "fix").**
- `child_subscriptions.interval` → the DEFAULT cycle for newly ADDED subjects and the fallback for `subscription_subjects.interval IS NULL`. Still NOT NULL (the admin filter, the mobile `billing_interval` field, `admin_grant_child_access` and four 013 checks depend on it).
- `child_subscriptions.current_period_end` → the **MAX** of the subject period ends ("coverage ends"). **Never the MIN**: MIN would make `recompute_child_access` expire a whole subscription — a paid yearly subject with it — the moment the shortest-cycle subject lapsed. A WHY comment now says so on `recompute_child_access`.
- `child_subscriptions.next_renewal_at` (new) → the **MIN**: the next charge date.
- `base/discount/total_amount` → the **NEXT INVOICE** (the subjects renewing at `next_renewal_at`). For any single-cycle plan MAX = MIN and every amount is byte-identical to before.
- All five are written by `trg_sync_subscription_period` and by nothing else; check 92 recomputes and compares so drift fails validation instead of production.

**Product changes needing owner sign-off.** (1) **Mid-cycle proration for ADDITIONS is retired** — a newly added subject opens its own full cycle at `now()` and pays the full first-cycle price (and receives that full cycle). `subscription_changes` records `interval` and the full amount, so a disputed charge stays reconstructible; `remaining_ratio`/`period_days` stay in the payload as `1`/`null` for contract compatibility. (2) **Changing an already-paid subject's cycle is SCHEDULED** into `pending_interval` and applies at that subject's own renewal, in both directions — no refund, no surprise charge, no second charge path.

**013 result.** Checks **91** (`91_per_subject_billing_interval` — columns, the `plan_change` constraint, the trigger armed, the four RPCs present and NOT anon/authenticated-executable, the four legacy signatures still present, and the per-subject predicate actually wired into `start_practice_attempt`) and **92** (`92_subject_period_integrity` — no live subject row without its own period, no MAX/MIN drift, no subject period past its coverage end) added. **Checks 46 / 77 / 78 / 84 must still PASS**: the wrappers keep their exact signatures and the greped literals (`assert_payments_enabled`, `array_length(p_add`, `subscription_subjects`, `current_period_end`, `invalid_transition`) stay in their bodies. **Not yet run — no psql in this round; the orchestrator applies and validates.**

**Mobile.** `expo.version` + `package.json` version bumped **1.6.0 → 1.7.0** (minor: new feature in the parent flows); `npm run sync-i18n` re-run so the new `plan.*` / `subjedit.planChange*` keys reached `messages.generated.ts`. The mobile parent surfaces DISPLAY per-subject cycles and PRESERVE each subject's cycle when the subject set changes; choosing a different cycle for an existing subject stays a WEB action (see the round's decisions).

**Open owner decisions.** Retiring add-proration; scheduling cycle changes at renewal rather than applying them immediately; `total_amount` meaning "the next invoice" rather than going NULL on a mixed plan; no "apply this cycle to all" convenience control on the public configurator; the admin comp grant staying single-cycle.

### Adversarial-review fixes on 109/110 (same round, 2026-08-11)

**The headline defect: `pending_interval` was WRITE-ONLY.** `apply_plan_change` stored the chosen cycle and nothing in the platform ever read it back, so "Riyaziyyat aylıq → illik" saved, the editor re-seeded from `ss.interval` on the next render and the radio snapped straight back — the choice did not survive a refresh, let alone apply.

**Model chosen (owner-visible): a BOUNDARY ROLLOVER, not a renewal.** New `public.apply_due_plan_changes()` (011 + 109; hourly pg_cron job `olympiq_apply_due_plan_changes` in 016 and in the migration itself) promotes `pending_interval → interval` and re-freezes `price_amount` once that subject's own paid period ends. It deliberately does **NOT** extend a period, grant access or write a payment: there is still no payment provider (every RPC ends at the `TODO(real-provider)` seam and returns `charged:false`), and a job that silently extended periods would turn every plan into a free perpetual one. The parent's choice now survives a refresh (the editor seeds from `pending ?? interval`) and applies at the boundary. **Owner decision needed** on where the real charge hooks into this function once a PSP exists.

**A scheduled change can now be CANCELLED.** `quote_plan_change` and `apply_plan_change` both compare against the EFFECTIVE cycle (`coalesce(pending_interval, interval, cs.interval)`), and choosing the cycle a subject is already paid on clears the schedule instead of storing a no-op. Both legacy wrappers compose their desired basket from the same effective cycle, so an add/remove from the mobile editor can no longer silently undo a web cycle change.

**Other fixes in the same pass.** Renewal sentences are built from the DESIRED basket (they used to quote the pre-change amount); removal dates are per subject (the scalar was the subscription MIN, so dropping a yearly subject was reported as "ends in 7 days"); ONE authoritative "due today" per card and per-cycle subtotals taken from the server groups (a 2nd/3rd sibling saw undiscounted list prices next to a discounted total); the four child-facing subject lists filter on each subject's own period end, mirroring the attempt gate; re-adding a subject scheduled for removal is no longer a silent no-op; a NULL-interval row can have its cycle changed; scheduled-cycle chips are labelled (new trilingual `subjedit.pendingChip`, `subjedit.noteLine`, `subjedit.noteNoRefund`).

**Mobile parity (1.8.0 → 1.8.1).** `SubscribeFlow` lost its single global cycle picker — the last control in the product that could only produce an all-weekly/all-monthly/all-yearly plan — and now renders one plan card per subject and posts `items`. `lib/api.planBody` still emits the legacy `{interval, subject_ids}` body when `items` is absent, so shipped binaries are unaffected.

**Palettes.** `students.theme_pref` is now READ on mobile (`useStudentThemeSync` adopts it once per signed-in child; the account-sheet toggle writes it back), so a palette chosen on the web is no longer hidden by a phone in system-dark. Every palette/theme write now uses `.select()` — a PostgREST update matching zero rows returns NO error, so "saved" was being reported for writes that never landed. The child layout reconciles the `theme` cookie against the column server-side (Safari caps script-written cookies at 7 days while the server-set session cookie outlives them). Modals mirror `data-palette` onto the portal root and `palettes.generated.css` emits a matching `.modal-overlay[data-palette]` selector, so dialogs follow the palette instead of staying purple/cream. `palettes.test.ts` additionally binds migration 110's CHECK, 013 check 94's `cat(slug)` array and the "26" in the az/en/ru copy to `ARENA_PALETTES`.

**New 013 check 95** (`95_pending_interval_rollover`) fails if the rollover function disappears, if the cancel branch is removed, if renewals go back to reading the stored rows, or if a wrapper stops carrying a scheduled cycle. It deliberately does NOT read `cron.job` — see check 28: a missing relation fails at PARSE time where pg_cron is absent, so the schedule is verified by hand.

**Validation this round:** `web-app` — `tsc --noEmit` clean, `vitest run` 163/163, `next build` ok. `mobile-app` — `tsc --noEmit` clean, `jest` 339/339, `check-i18n` and `check-palettes` ok. **No psql was run** — the orchestrator applies 108/109/110 and runs 013.

## PINNED — CURRICULUM REPLACEMENT — ✅ DONE (Rounds A + B, 2026-07-30)

**Applied to dev and verified. From-zero rebuild 87/87 PASS.**
- Migration **094** purged the legacy tree and ALL test content: 726 questions, 757 answer rows, 32 attempts, 27 topics, 77 subtopics, the points ledger, activity days and every cached student aggregate. The delete guard was NEVER disabled — answers are deleted first so it passes on its own terms — and it is asserted armed afterwards.
- Migration **095** imported the 2026 curriculum: **260 topics / 1077 subtopics**, grades 1–11, terms 1–4, all 60 (grade, subject) pairs matching the source document exactly. Rerun is a clean no-op.
- Subject mapping used (existing subjects only, no new sellable product): Riyaziyyat→`math`, İnformatika→`informatics`, İngilis dili→`english`, Məntiq→`az_language`, Fizika→`fizika`, and **Həyat bilgisi + Təbiət + Biologiya + Kimya → `elm`**. Splitting Biology/Chemistry into their own priced subjects later is a small follow-up.
- Backported: `012` now seeds `elm` + `fizika` and the renamed `az_language`→"Məntiq" (both had DRIFTED from live and broke the rebuild), and references migration 095 for the tree rather than duplicating ~1500 lines of VALUES. A from-zero rebuild must run 095 after 012.
- Pre-purge `pg_dump` of all 13 affected tables is in the session scratchpad.

**STILL OPEN from the 13-point curriculum spec:**
- **8 olympiad packages now have EMPTY question pools** (`az-dili`, `az-olimp`, `ingilis-olympiads`, `jkjj`, `riyaz-olymp`, `test`, `test-1`, `yeni-test`). They were deliberately left ACTIVE so the 11 lifetime purchasers keep seeing what they bought, but they cannot serve an attempt until each target grade has ≥ `questions_per_attempt` published questions. Upload replacement pools or deactivate them.
- **The question bank is EMPTY (0 questions).** Nothing can be played until content is imported against the new tree. The daily round needs ≥25 published questions per (grade, subject, cumulative term) before it will start.
- §12 UI/UX polish for the admin panel was scoped to the new Curriculum Structure page only; the older admin screens were not restyled.

## PINNED — STORE-SUBMISSION BLOCKERS DEFERRED BY THE OWNER (2026-07-30)

The owner reviewed the three ARCHITECTURAL remedies and deferred the first two; the privacy policy (#3) was approved and implemented. **Neither deferred item may be skipped before an iOS or Play submission** — both are account-level risks, not cosmetic.

1. **Payment posture must become a BUILD-TIME constant (deferred).** Today the store binary always contains a complete working non-IAP checkout — subscribe flow, simulated pay sheet, olympiad buy flow, subject-change purchase path — hidden only by the server-supplied payment mode. That is Apple Guideline **2.3.1(a) hidden functionality**, and the penalty tier is **developer-account TERMINATION, not rejection**, because a reviewer approves a state the server can change afterwards. Fix: dead-strip all commerce from store builds behind an EAS build-profile constant (e.g. `EXPO_PUBLIC_COMMERCE`), so `demo`/`giveaway` checkout physically cannot exist in a store bundle. This is a build-configuration change and needs an owner-run EAS build to validate.
2. **The public pricing/paywall screen must leave the store binary (deferred).** A full pricing screen (per-interval plan cards, AZN per subject, trial line, sibling-discount callout, CTA into registration) ships in the binary and is reachable before login; its deep-link routes still resolve. Guideline **3.1.1(a)** anti-steering. Fix: exclude the screen AND its deep-link entries from store builds.
   *Related, cheaper, also still open:* the in-app "forgot password" link opens the website in the system browser, and that page renders the site header whose first nav item is the pricing page — a signed-out reviewer is one tap from a full AZN price list. Serve that page chrome-free or handle reset in-app.

The full audited list (18 items, severity-rated) lives in `docs/OLYMPIQ_ECOSYSTEM_FOR_APPLE.md` §12.

**✅ FIXED 2026-07-30 (this round):** `NSPhotoLibraryUsageDescription` added (was a hard iOS crash — the picker is used in three live paths); `ITSAppUsesNonExemptEncryption: false` declared; the simulated card `4242 4242 4242 4242` replaced with a masked non-card placeholder; both **fabricated PAID invoices deleted** (Guideline 2.3.1 treats a displayed false price as grounds for removal AND account termination — a "demo" disclaimer does not cure it) and replaced with an honest empty state; the **AZN price on the CHILD olympiad sheet** is now opt-in and defaults to OFF, so a new caller that forgets the flag shows no price rather than exposing one to a minor. Deliberately NOT registering the `expo-image-picker` config plugin — it would also emit camera/microphone strings and an Android `RECORD_AUDIO` permission for capabilities this app never uses (its own 5.1.1 exposure); the explicit `infoPlist` string is the clean fix.

**❌ STILL OPEN (non-architectural):**
- **Banned "Əldə et" CTA** (`poly.buyNow`, 2 sites on the parent olympiads tab). NOT fixable by renaming — the problem is that a purchase CTA exists in the binary at all, so it is bound to deferred item 1 above. A rename would hide the symptom and make the real issue harder to find.
- Hardcoded `"AZN"` string literals in parent commerce components (found by any grep of the release bundle).
- Unallowlisted external `https` links openable from a **student's** notification (dynamic in-app steering + an ungated link-out from a minor's session; also the one path that makes the "no unrestricted web access" age-rating answer untrue).
- The Face ID usage string is Azerbaijani-only — add localised `InfoPlist.strings` for en/ru.
- A dev-only tunnelling tool sits in production dependencies.

**❌ PRIVACY POLICY — publication prerequisites:** `docs/PRIVACY_POLICY.md` ships in all three languages and is live at `/privacy` (web) and in-app (mobile, reachable signed-out for both roles, as 5.1.4(b) requires). Before publishing: fill the `OWNER MUST CONFIRM` markers (~26 unique items × 3 languages) — support email/phone, published website URL, effective date, whether the controller is an individual / sole trader / registered company, and the **Supabase project region** (only visible in the Supabase dashboard). Then have a lawyer review it, especially the children's-data sections. It describes practices and claims compliance with no statute, by design.

**⚠️ `child_login_attempts` has NO retention policy** — it stores the 8-digit child ID plus a hashed IP forever (only failures inside a 15-minute window are cleared; `016_scheduled_jobs.sql` schedules no cleanup). The privacy policy currently cannot state a real retention period. Add a `pg_cron` job, then replace the placeholder.

> **Because #1 and #2 are deferred, the privacy policy had to be written around them.** §8 (Payments) now keeps only the claims that are structurally true unconditionally ("no card form, no checkout, purchasing happens on the website") and states the price-visibility claim as mode-dependent, because `mobile-app/src/app/(public)/pricing.tsx` renders real AZN prices the moment `payment.mode` leaves `off`. **When #1/#2 land, tighten §8 back to the absolute wording** in `docs/PRIVACY_POLICY.md` A8/B8/C8 and the `privacy.s8.*` keys.

## PINNED — Google Play console setup (owner, in progress 2026-08-04)

Listing copy, keywords and the asset inventory now live in **`docs/STORE_LISTING_COPY.md`** — the single source for BOTH stores. It supersedes `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §1, whose copy claimed the daily round serves "the same questions for everyone" (untrue since Round 42) and mentioned subscriptions/payments (never allowed in store metadata). §2+ of that pack is still current.

**Submitted:** Financial features = none. Data safety = 6 types (Name, Email, Phone, User IDs, Photos, App interactions), all Collected / none Shared / none ephemeral; Advertising, marketing and Personalisation never ticked. Target audience = every band except "5 and under" (mixed child+adult, so **Play Families policy applies**; the Designed for Families opt-in stays OFF). Privacy URL = `https://olympiq.ai/privacy`. Generated assets in `mobile-app/store-assets/`.

**❌ Owner follow-ups, tracked so they are not forgotten:**
- **Tablet screenshots are phone captures** (owner's deliberate stopgap to unblock submission). Play accepts it but flags the app as not optimised for large screens, which suppresses tablet visibility. Replace with real 1080×1920 tablet AVD captures before public launch.
- Phone screenshots must be exactly **1080×1920** — a raw 20:9 device capture (1080×2400) is rejected by Play.
- The `Data deletion` answer says partial deletion is NOT offered (only full account deletion). If a partial-deletion path is ever built, update the declaration.
- **RE-UPLOAD the Play icon + feature graphic.** The ones uploaded on 2026-08-04 before the brand landed carry the PLACEHOLDER blue-chevron mark. Correct files: `mobile-app/store-assets/play-icon-512.png` and `play-feature-1024x500-az.png`.
- ~~The Android adaptive icon is inverted vs the master icon~~ — **RESOLVED 2026-08-04** by the brand landing below.

## PINNED — MIXED-MODE BULK IMPORT IS NOW **ZIP-ONLY** — 2026-08-11

**Plan (written before coding):** replace the base64-in-JSON transport for `Qarışıq sual` with a ZIP (`questions.json` + `images/`), read client-side by a new dependency-free reader; reuse the existing browser upload phase and server verification unchanged; leave the text-only path byte-for-byte untouched; delete the now-unreachable server-side base64 ingest; add vitest coverage for the reader and the path-resolution bridge.

**What changed.** `Yalnız yazılı sual` accepts only `.json` and behaves exactly as before — same parse, same validation, same posted payload, same action, same RPC. `Qarışıq sual` now accepts only `.zip`. `meta.image` and `options[n].image.<locale>` hold a RELATIVE PATH resolved from the folder holding `questions.json`; the browser reads each entry out of the archive, sniffs its magic bytes, uploads it to `imports/<batch>/` and rewrites the row to the verified uuid before the import request is posted. No new upload path, no new storage mechanism, SVG still banned by the same two sniffs.

**Files:** new `admin-panel/src/lib/zipRead.ts` (central-directory parser + `DecompressionStream("deflate-raw")`), `zipWrite.ts` (stored-only writer, used solely for the downloadable template), `zip-bulk.ts` (bridge: locate `questions.json`, resolve refs, expose a `MediaResolver`), plus tests `src/lib/__tests__/zipRead.test.ts` and `zip-bulk.test.ts`. Modified: `bulk-client.ts`, `bulk-upload-media.ts`, `BulkUploadModal.tsx`, `OlympiadCreateForm.tsx`, `OlympiadJsonFormat.tsx`, `lib/admin/bulk-validate.ts`, `bulk-media.ts`, `questions.ts`, `question-flow-labels.ts`, `i18n/messages.ts`, `globals.css`. Deleted: `lib/admin/__tests__/bulk-media.test.ts` (every helper it covered is gone).

**THREE PRE-EXISTING DEFECTS FIXED ON THE WAY — mixed mode was broken on more than one path:**
1. **`OlympiadCreateForm` had NO media phase at all.** Its `<form action={...}>` had no `onSubmit`, so a mixed file went to `createOlympiadPackageWithQuestions` untouched, and that action never decoded base64: `meta.image` was silently dropped by the RPC (it reads only `meta.media_asset_id`) and a base64 option image hit migration 104's `(v_opt->'image'->>v_loc)::uuid` cast and aborted the whole import. It now runs the same upload phase per grade, sequentially, all-or-nothing across grades.
2. **`validateOptionMedia` rejected every rewritten option image.** It forwarded the option's az value into `validateItemMedia`, which demanded a `data:` URL — but by then the browser had already replaced it with a uuid. Mixed-mode option images could therefore never import. The server rule is now "must be a claimable uuid", checked for EVERY locale present (only `az` was checked, so a bad `en`/`ru` value reached the `::uuid` cast).
3. **Option-image uuids bypassed the claim gate.** `rejectUnclaimableMedia` read only `meta.media_asset_id`, so the migration-104 option map was checked by nothing but the DB's `bucket = 'question-media'` — the exact authorization hole `claimableMediaIds` exists to close, re-opened for options. It now collects uuids from both places; because one row can supply several, the backwards splice became a descending walk over a `Set` of row indices (the old loop would have spliced one position twice and dropped an innocent row).
   *(Also fixed, client-side: `validateBulkRowsClient`'s "every option needs az text" loop rejected the image-only option the mixed template itself ships. It now skips an option carrying an az image in mixed mode, matching the DB's "text OR image" rule and the server validator.)*

**Removed / kept.** Removed: `decodeImageDataUrl`, `uploadIngestedImage`, `removeIngestedMedia`, `parseDataUrl`, `base64ByteLength`, `BULK_MEDIA_TOTAL_MAX_BYTES`, `MediaFailure`, `IngestedMedia`, the 60-line ingest block in `bulkImportQuestions`, and the client's `CLIENT_DATA_URL_HEAD`/`clientB64Bytes` — nothing can produce base64 any more, so a fallback for it would only be an unreachable O(image bytes) path. Kept: `BULK_MEDIA_PREFIX` (`bulk/`) — nothing writes it now, but assets imported before this change live under it and must stay claimable. The one remaining base64 literal is the 1x1 PNG the template ZIP ships, labelled as an asset.

**Hardening in the reader** (all unit-tested): path traversal / absolute / drive-letter / colon / backslash / NUL rejects the WHOLE archive; 600-entry cap and a 5000-record scan bound; per-entry 5 MB and total 40 MB caps on the DECLARED size, plus a STREAMING abort that cancels the reader the moment inflated bytes pass the cap (the declared size is what a zip bomb lies about) and a length + CRC32 equality check; encrypted / ZIP64 / unknown-method archives refused with their own message; `__MACOSX/` and dotfiles skipped and not counted; `DecompressionStream` feature-checked so an old browser gets a translated message instead of a crash. `questions.json` is accepted at depth 0 or 1 so a zipped FOLDER works; a case-insensitive filename match is used only when it is UNIQUE, otherwise the row reports ambiguity.

**Gates:** admin-panel `tsc --noEmit` clean · `vitest run` 163/163 · `next lint` clean (one pre-existing a11y warning in `SiteTypography`) · `next build` OK. No SQL touched.

**Review pass, same day — six defects fixed.** (1) The text-or-image rule had TWO emission sites, so a plain text-only file reported one empty option TWICE — the mode that was supposed to be untouched. It now lives only in `validateClientOptionMedia`, with a regression test. (2) `validateClientOptionMedia` pre-checked only the **az** image while `collectMediaRefs` queues EVERY locale, so a typo in `options[n].image.ru` failed mid-upload and forced the discard path; it now iterates the whole map, like the server. (3) `meta.media_asset_id` had no server-side shape check: a non-uuid reached `claimableMediaIds`'s `.in("id", …)` against a uuid column, PostgREST errored and the fail-closed gate rejected EVERY media row in the file instead of the one bad row. `validateItemMedia` now applies `MEDIA_UUID_RE`. (4) The AI prompt block was mode-blind — in MIXED mode it still told the model "no images" and "no question that depends on a picture" and never mentioned the ZIP; it now takes `questionMode` and branches the schema, the MEDIA section and rules 6/7/9 (new trilingual `aiprompt.mixedNote`). (5) The `imports/<batch>/<uuid>.<ext>` key was hardcoded in three components with a fourth definition on the server, and the designated helper (`importMediaPath`, an exported "use server" function) had ZERO callers — deleted; **new `admin-panel/src/lib/bulk-media-shared.ts`** owns `buildImportMediaPath` plus the 5 MB / 40 MB caps that `zipRead.ts`, `bulk-upload-media.ts`, `bulk-client.ts` and `bulk-media.ts` used to declare independently. (6) The 40 MB cap is per ARCHIVE, not per submit (the create form uploads one ZIP per grade) — `bulk.fileHintZip` now says so in all three languages.

**Tracked follow-up:** `addOlympiadPackageGrade` / `OlympiadGradesManager` still has **no import-type selector** (implicitly text-only, which is why it needs no change here), and `olympiad.ts:1265` passes the raw `t` instead of `withLocalStrings(t, locale)` into `validateRows` — so that flow's `bulk.err.*` rows render as raw keys. Not touched to avoid a conflict with the agent adding own-grade bulk upload.

## PINNED — MIXED-MODE BULK IMPORT (images in JSON) — Round 53, 2026-08-05

> **Superseded 2026-08-11 by the ZIP-only section above** for the TRANSPORT only. Everything below about migrations 101–104, the claim gate, the orphan sweep and the `saveQuestion` option-preservation fix is still current.

**Shipped end to end.** Both importers (standard Questions + Olympiad packages) take a mandatory `Yalnız yazılı sual` / `Qarışıq sual` selector; mixed mode accepts images embedded in the JSON, moves them into `question-media`, and stores only the reference. No manual extraction, renaming, ZIP or separate upload.

**Migrations 101–104** (all proved in rolled-back transactions, applied, backported; **from-zero rebuild 92/92 PASS**):
- `101` olympiad importer accepts `meta.media_asset_id` — it previously ignored the field entirely, so such a file imported as "successful" with no image and **no error**.
- `102` `answer_option_translations.media_asset_id` + `ck_aotrans_text_or_media`. On the TRANSLATION table because `answer_options` carries `is_correct` and is RLS-hidden from students; `text` stays NOT NULL and accepts `''` so the constraint, not nullability, carries the "text OR image" rule.
- `103` the three LIVE payload branches serve the option image (`get_practice_attempt`, `get_test_attempt`, `get_test_review`). The two SNAPSHOT branches are deliberately untouched — `daily_rounds.content_snapshot` is frozen and its writer was dropped in `083`, so historical rounds can never be backfilled.
- `104` both importers write per-locale option images, and the insert condition became "text OR image" — the old empty-text skip would have left an image-only option with no translation row at all.

**⚠️ THREE THINGS THAT WILL BITE A FUTURE MIGRATION:**
1. **`pg_get_functiondef` returns CRLF** for functions created from the canonical files (252 CRs measured). A multi-line anchor written in an LF migration can NEVER match. Always `replace(src, chr(13), '')` first.
2. **Canonical `011` is itself CRLF** (6907 CRLF / 0 LF). A backport script must translate its anchors, not normalise the file.
3. **Migration markers are load-bearing.** `100`'s anchor is consumed once applied, so it detects "already done" by the literal `Migration 100` comment. Every later patch of that function must PRESERVE the earlier markers or re-running them raises instead of skipping. `104` asserts both `100` and `101` survive.

**SECURITY — a live hole, closed.** `meta.media_asset_id` arrives inside the uploaded file. RLS `media_insert` lets any `content.create` user insert a `media_assets` row with an arbitrary bucket/path/size, and the RPC only checks `bucket='question-media'` — so a crafted uuid could attach **another question's image, or none at all**, with the bytes never examined. `claimableMediaIds` now accepts a supplied uuid only when it is a question-media asset **owned by that admin** under an import-created prefix, fail-closed. Pre-existing since Round 21; the new flow made it the normal path.

**SCALABILITY — request size no longer depends on images.** Base64 in the body was O(image bytes) and would exceed any limit. The browser now uploads each image as its own request to `imports/<batch>/`, a server action re-downloads and re-sniffs the bytes before writing the `media_assets` row, and the submitted JSON contains no base64 at all → **O(question count)**. The browser also sniffs BEFORE uploading, because the verifier rejects a stored content-type that contradicts the bytes — otherwise a mislabelled image uploads and then fails verification, leaving an orphan.

**Orphans:** new class (verified but never submitted). Swept opportunistically on the next import — scoped by owner, `imports/` prefix, 24h age, and unreferenced by EVERY `media_assets` consumer (the FKs are `SET NULL`, so deleting a referenced row would silently blank a live image). **pg_cron cannot do this** — it can delete the metadata row but not the bytes, converting one orphan into a worse invisible one. Detection: **check 88**, reporting stranded rows and stranded objects separately.

**PRECONDITION FIXED:** `saveQuestion` used to delete+reinsert every answer option. With `ON DELETE CASCADE` on the translations, any unrelated question edit would have silently destroyed every option image **and** every non-edited locale's text. Options are now matched by `order_index` and updated in place; stale rows are removed last.

**Still text-only by design:** legacy `daily_rounds` snapshots (frozen), and `get_practice_attempt` served **no media at all** before `103` — not even the question image. That was a pre-existing gap, now closed for both.

## PINNED — OLYMPIAD BULK UPLOAD NOW APPENDS INTO AN EXISTING GRADE POOL — 2026-08-11 (migration 108)

**The reported problem:** bulk upload was unavailable for a package's OWN grade (the Grade 3 of a Grade-3 package). Two independent causes, both confirmed in code:

1. **UI.** `OlympiadGradesManager` rendered exactly ONE `<input type="file">`, inside the "Sinif əlavə et" form, whose `<select>` is fed by `addableGrades` = grades **not** in `targetGradeIds`. A grade that is already targeted therefore never got a file input at all. The rows above offered only Remove; the pool section below offered only per-question CRUD.
2. **DB.** `bulk_insert_olympiad_package_questions` raised `check_violation` *"olympiad: questions can only be bulk uploaded once per grade"* as soon as any question existed for `(package, grade)`. Because a grade is targeted at creation **together with** its file, its pool is non-empty from the first second — so its own grade could never be uploaded into again. `p_grade_id` itself was always passed correctly (`runOlympiadPoolImport` → `p_grade_id`; the RPC coalesces to the legacy `olympiad_packages.grade_id` and re-validates membership in `olympiad_package_grades`), so nothing about grade targeting was broken — only the creation-only branch.

**The fix (owner decision: APPEND, duplicate-guarded).** Migration **108** replaces the creation-only raise with a per-row duplicate guard plus a new immutable normalizer `public.norm_import_text(text)` (service-internal: revoked from `public`, `anon` and `authenticated`). Before the row loop the RPC snapshots ONE array of content keys for the existing `(package, grade)` pool — `md5` over the normalized primary-locale body + the question image id + every option's normalized text and image id, in stored `order_index` order; each incoming row computes the same key and raises if it matches. The raise sits inside the loop's `exception when others` handler, so it lands in the existing `{total, successful, failed, errors[]}` contract as a normal `{index, error}` entry: **no new errcode, no signature change, no new grants**, and `013`'s "the 2-arg overload is absent" assertion (check 79) still holds. **The snapshot is never extended during the loop**: a row is compared ONLY against what was already in the pool when the call started, so two identical rows inside one file both import. That is the compatibility rule, not an omission — creation and add-grade are all-or-nothing (`olympiad.ts` removes the grade / rolls the new package back on any failed row), so flagging an in-file duplicate would destroy a package creation that used to succeed. Migration 108's `DO $verify$` block and 013 check 93 both assert the in-loop push is absent.

**Duplicate = same primary-locale body + same option texts + same image references.** These properties are deliberate and documented in the RPC comment, CLAUDE.md and here:
- **Image-carrying rows never match** — media uuids are minted per upload. That removes every false positive at the honest cost of not deduping picture-only content.
- **It is a convenience guard, not a constraint.** Two admins appending the same file simultaneously both snapshot the pre-state and both insert. No index can express the rule (it spans `questions` + `question_translations` + `answer_options`), and the outcome is recoverable — an admin archives the duplicate.
- **Archived questions count as duplicates** (the row still exists; restoring it is the right action). If the owner ever wants a corrected version of an archived question re-imported, the snapshot must filter to `status = 'published'`.
- **The key is primary-locale-bound on both sides** — the stored key reads `question_translations` at `questions.primary_locale`, the incoming key reads the item's own `primary_locale`. The same question re-uploaded with its primary locale flipped (az → en) does NOT match and is inserted twice. Documented rather than fixed: matching across locales means building a key per stored locale and comparing sets, which costs the single-array snapshot that makes this guard cheap, and the realistic failure mode (the same file uploaded twice) never flips the locale.

**Verified: the rotation and BOTH pool guards need no change when a pool grows.** `start_olympiad_attempt` recomputes `v_pool` on every call and prunes `v_seen` to the current pool, so appended ids are simply UNSEEN and join the student's CURRENT cycle — no repeat, no `cycle_no` change, and in-progress attempts stay frozen by `test_attempts.question_ids`. `assert_olympiad_pool_meets_per_attempt` and both activation guards only ever compare `pool < required` and fire on `olympiad_packages` / `olympiad_package_grades`, never on `questions` — so an append can only ever UNBLOCK an activation. Do not "fix" this later.

**Repaired on the way (it blocked the rebuild proof):** canonical `011` had `as $` / `$;` around `public.olympiad_grade_pool_guard()` — a botched backport of migration 107, which correctly uses `$$`. A lone `$` is not a valid dollar-quote delimiter, so a from-zero rebuild of `011` failed **before** reaching this change. Both lines restored to `$$`.

**Also fixed in `runOlympiadPoolImport`:** it received the raw `getT()` translator, so `mapRpcRowError`'s `bulk.err.badMedia` / `termRequired` / `topicRequired` / `subtopicRequired` / `termConflict` — and the new `bulk.err.duplicate` — rendered as bare key strings (those keys live in `question-flow-labels.ts`, not `messages.ts`). All call sites now pass the `withLocalStrings`-wrapped translator. The blanket `code === '23514' → oly2.err.creationOnly` mapping is gone (it would have mislabelled a `pool_grade_not_targeted` failure as "upload once only") and is replaced by a HINT-keyed branch. `addOlympiadPackageGrade` also gained the `rejectUnclaimableMedia` call it was missing — a hand-crafted `meta.media_asset_id` previously reached the RPC with only the bucket check between it and another question's image.

**Files.** New: `supabase/sql/migrations/2026_08_11_108_olympiad_bulk_append.sql`, `admin-panel/src/components/OlympiadGradeBulkAppend.tsx`, `admin-panel/src/lib/useBulkFilePicker.ts`, `admin-panel/src/lib/bulk-media-shared.ts`. Modified: `supabase/sql/011_…` (backport + the `$$` repair), `supabase/sql/013_validation_queries.sql` (**check 93** — 91/92 were taken by migration 109), `admin-panel/src/lib/admin/olympiad.ts` (`prepareGradePoolRows`, `appendOlympiadGradeQuestions`, translator + error mapping), `bulk-validate.ts`, `question-flow-labels.ts`, `olympiad-strings.ts`, `app/(protected)/olympiad/labels.ts`, `OlympiadGradesManager.tsx`, `OlympiadCreateForm.tsx`, `olympiad/[id]/edit/page.tsx`, `globals.css`, `CLAUDE.md`, `docs/MANUAL_TESTING_GUIDE.md` (KK15 superseded, new **TT1**).

**UI.** Every target-grade row now carries a collapsed **Toplu yüklə** panel with the mandatory `text` / `mixed` import-type selector; it routes the file through the SAME `parseBulkFile` / `parseBulkZipFile` / `validateBulkRowsClient` / `uploadEmbeddedMedia` helpers `BulkUploadModal` uses, so the 2026-08-11 ZIP transport for mixed mode is inherited rather than duplicated. The edit page now passes the FULL merged dict to `OlympiadGradesManager` (it previously hand-picked six keys, which would have left every `bulk.*` string in the new panel as a bare key). Partial success is allowed on an append (no half-created grade to unwind) and is only safe BECAUSE of the duplicate guard; `addOlympiadPackageGrade` keeps its all-or-nothing rollback and stays text-only.

**Review pass, same day — four defects fixed.**
- **The in-loop duplicate push was a regression for the other grades.** Pushing each successful key back into `v_dup_keys` made two identical rows INSIDE one file collide; because creation and add-grade are all-or-nothing, a file with a duplicated row that used to import fine would have destroyed a package creation. The push is gone (migration + canonical 011), the header, the function comment, CLAUDE.md and 013 check 93 all state the pre-existing-pool-only rule, and the migration's verify block now fails if it ever comes back.
- **One dead-but-live server action deleted.** `bulkImportOlympiadQuestions` had no caller (BulkUploadModal is mounted only on /questions, never with a package) yet stayed a POST-able endpoint, and it called the RPC WITHOUT a grade id — harmless before 108, a silent append into the legacy `olympiad_packages.grade_id` after it. Deleted together with `BulkUploadModal`'s olympiad branch, `OlympiadBulkState` and the now-unused `packageGradeLevel`; `runOlympiadPoolImport`'s `gradeId` is REQUIRED instead of defaulting to null.
- **The three-way component duplication is gone.** New **`admin-panel/src/lib/useBulkFilePicker.ts`** owns `parseBulkPick` (one chosen file → items/zip/issues), `runBulkMediaPhase` (batch → resolver → upload → rewritten rows) and the `useBulkFilePicker` hook. `BulkUploadModal` and `OlympiadGradeBulkAppend` use the hook; `OlympiadCreateForm` composes the two functions per grade (it owns a MAP of files, so a single-file hook would be the wrong shape). The drift this removes: `fileReady` omitted `items.length > 0` in one copy and not the other.
- **The append panel now ships its format guidance:** the collapsed `OlympiadJsonFormat` for that grade plus a `Şablonu yüklə` button, both following the chosen import type — which is what `docs/MANUAL_TESTING_GUIDE.md` already told the tester to use.

**Gates:** admin-panel `tsc --noEmit` clean · `vitest run` **204/204** (new: `bulk-client.options.test.ts`, `olympiad-append.test.ts` — grade re-verification, mandatory import type, explicit `p_grade_id`; `olympiad-dup-key.test.ts` — the two halves of the duplicate key, asserted on the SQL text in BOTH the migration and the canonical backport) · `next build` OK. SQL not applied here — the orchestrator runs staging then production, and check 93 plus the migration's `DO $verify$` block are the proof.

## PINNED — OLYMPIAD POOL UPLOAD: per-grade JSON format helper (2026-08-05)

**Unchanged on purpose:** one upload field per selected grade, one independent pool per grade, and the per-student non-repeating rotation. Per-grade validation errors already rendered under each slot (`fileError` + `rowIssues`) and still do. *(The creation-only pool rule was also in this list; migration **108**, 2026-08-11, replaced it with a duplicate-guarded per-grade APPEND — see the section below.)*

**What the file must now contain — and what it no longer repeats.** The importer already injected `subject` (from `olympiad_packages.subject_id`) and `grade` (from the upload slot). It did **not** inject the olympiad TYPE: `bulk_insert_olympiad_package_questions` read `meta.olympiad_type` by NAME from every row, so the admin had to retype a value already chosen in the package form — and a typo produced **NULL silently**, because the lookup-by-name had no not-found branch. **Migration 100** derives it from `olympiad_packages.olympiad_type_id` instead. `meta.olympiad_type` is now inert for package pools: older files keep importing, the field is ignored rather than rejected. `bulk_insert_questions` (general bank) is deliberately untouched — it has no package to inherit from. Check `57e` asserts both halves.

**Everything else was already optional and is now omitted from the shown format:** `meta.type` (defaults to `single_choice` = 5 options / exactly 1 correct), `meta.topic` / `meta.subtopic` (optional for package pools — the olympiad draw is package+grade scoped and never reads them), `meta.term` (ignored entirely for package pools), `meta.source`, `meta.media_asset_id`. So the file carries only what genuinely comes from the questions: `primary_locale`, `translations`, `options`.

**UI:** a collapsed `<details>` "JSON format — {grade}" block inside every grade slot, with a Copy button, a 2-second "Copied" confirmation (`aria-live`), and a trilingual instruction to copy it, send it to ChatGPT with the raw questions, and upload the result **into that grade's field**. Collapsed by default because eleven grades would otherwise be eleven copies of the same block. The JSON is identical for every grade by design — the slot IS the grade.

**⚠️ Regression caught by the validation suite, worth remembering:** migration 100 first revoked EXECUTE from `authenticated` on the olympiad importer. That would have broken package creation outright — the function is SECURITY DEFINER with an internal `is_admin()` gate and the admin panel calls it **as the signed-in administrator**, not through the service role. Check `23_olympiad_private_pool` asserts `anon = false AND authenticated = true`; it failed immediately and the grants were restored. Do not "tighten" that grant.

**Also worth remembering:** `pg_get_functiondef` returned the olympiad importer's body with **CRLF** line endings (it was created from a CRLF file), so a multi-line anchor written in an LF migration could never match. Patches of that shape must `replace(src, chr(13), '')` first — the patched function is then re-created with clean LF endings.

**Live validation: 91/91 PASS, 0 FAIL.** Canonical backport: `011` + `013`.

## PINNED — PER-GRADE OLYMPIAD CONFIG + AUTH-STATE UNIFICATION (2026-08-10)

### 1. Question count and duration are now PER TARGET GRADE (migrations 106 + 107)

An olympiad package targeting grades 5 and 11 had to serve both the same number of questions on the same clock. Both settings moved onto `olympiad_package_grades`, which already IS the package↔grade relationship (each grade owns a separate pool and a separate per-student rotation) — no new table.

**NULL means inherit.** Both columns are nullable and every reader coalesces to the package value through ONE resolver, `olympiad_grade_config(package, grade)`. That is deliberate, and 107 UNDOES 106's backfill: 106 wrote the package's numbers into every grade row so the admin would "see real numbers", but an explicit grade value SHADOWS the package value — editing the package-level count on a single-grade package would then silently do nothing. The admin forms show the package value as a **placeholder** instead, so a blank field is just as informative and inheritance actually works.

**What 106 fixed:** `start_olympiad_attempt` read both numbers from the package BEFORE resolving which grade's pool the child was entitled to. The read moved after that resolution. The per-student rotation is untouched and asserted intact.

**What 107 fixed (106 was half-done):**
- `assert_olympiad_pool_meets_per_attempt` looped over every target grade but compared each against ONE number. A grade serving 40 questions with a 12-question pool could go ACTIVE and failed at ATTEMPT time — exactly what the Round-49 guard exists to prevent. Each grade is now checked against its own count (package value as fallback). The AZ message, the stable `olympiad_pool_below_per_attempt` HINT and the DETAIL JSON shape are byte-identical — admin-panel parses that DETAIL to render en/ru.
- The activation guard fires on `olympiad_packages`, but per-grade counts live on a different table, so adding a target grade to an ACTIVE package (or raising one grade's count) reached NO validation. New trigger `trg_olympiad_grade_pool_guard` on `olympiad_package_grades` closes it; only a change that could newly break servability is checked.

**Admin UI:** one grade → unchanged (the single pair of fields IS the config). Two or more → a compact per-grade row each, posting `qpa_<gradeId>` / `dur_<gradeId>`. Present on BOTH the create form and the edit form. `__per_grade_cfg` is the edit form's ownership marker: without it `savePerGradeConfig` does nothing, so a future caller that does not render the panel can never wipe overrides by omission. The grade set for writes comes from the DATABASE, never from posted field names — a forged `qpa_<uuid>` writes nothing.

**Student-facing surfaces** (one number can no longer describe a multi-grade package):
- Parent web catalog → resolves against the SELECTED child's grade, same shape `countByGrade` already used.
- Child web list → resolves against the purchase's ENTITLED grade snapshot, so a promoted student still sees what they bought.
- Public landing + both mobile surfaces → have no grade context, so they show the value only when every target grade AGREES and drop the row when they disagree. Showing one grade's figure to everyone is the bug being avoided.

**Tests:** `per-grade-config.test.ts` in admin (18 cases: NULL-means-inherit, per-grade independence, bounds, hostile input) and in mobile (8 cases for `sharedGradeValue`, including an override that merely EQUALS the package value).

### 2. Register-says-exists / login-says-no-account (migration 105)

Registration and login answered "does this account exist" from DIFFERENT tables — `auth.users` vs `profiles JOIN parents` — so an auth user with incomplete parent provisioning got BOTH answers at once. **Five real accounts were in that state**, residue of the 2026-07-29 incident: recovery rebuilt `profiles` the way `handle_new_user()` does (PENDING, role-less) but never re-ran parent provisioning. This also explains the earlier "login redirects to landing with no error" report.

- `web-app/src/lib/auth/accountState.ts` is now the ONE classifier — `none | parent | incomplete | staff` — used by web register, web login, the mobile register BFF and the new heal route. It fails CLOSED to `incomplete`: answering `none` on an error is what both creates a duplicate on a taken address and tells a real user their account is missing.
- Web login SELF-HEALS after the password verifies. Migration 105 hardened `setup_parent` to refuse a STAFF profile so an administrator signing into the parent app cannot silently gain a parent account.
- **Mobile had the same bug with no fix path** — it signs in against Supabase directly, holds no service-role key, and landed on role `unknown` with only a retry button, forever. New BFF `POST /api/mobile/v1/auth/heal` verifies the token against GoTrue directly (it cannot use `resolveBearerParent`: the whole point is the role is missing), classifies, and repairs. `authStore.parentLogin` calls it only when the role fails to resolve; `healed:false` is not an error.

### Validation

typecheck + tests + production build PASS in all three apps — admin **134** tests, web **103**, mobile **339**. Canonical backport done: **105 → 011**, **106/107 → 011 + 015**, new checks **89** + **90** in `013`. CRLF preserved per file (011/013 are CRLF, 015 is LF).

**Mobile version bumped 1.5.0 → 1.6.0** (minor — new feature surface).

**Live validation (2026-08-11): 94/94 PASS, 0 FAIL.** Migrations 105, 106 and 107 are all applied. New check `89` confirms all four moving parts at once — the resolver exists, `start_olympiad_attempt` calls it after grade entitlement, the pool validator is per-grade, and `trg_olympiad_grade_pool_guard` is armed; check `90` confirms no ACTIVE grade promises more questions than its pool holds.

> **Supabase SQL Editor false positive on 013 — do not "fix" it by removing the check.** Running `013` in the dashboard used to pop *"This query creates a table without enabling Row Level Security … `v_oly`"*. `013` creates nothing; it is read-only. The trigger was check `57e`, which passes the literal `'olympiad_type_id into v_oly'` to `position()` as a SEARCH NEEDLE against a function body — the editor's linter scans raw text, sees `into v_oly`, and reads it as `SELECT … INTO` (which in plain SQL does create a table). The needle is now CONCATENATED (`'olympiad_type_id ' || 'into v_oly'`), so it resolves to the identical string at runtime while keeping that token pair out of the source. 57e still PASSes, which is the proof the needle is unchanged.

> **⚠️ From-zero rebuild NOT run.** `OLIMPIADA_STAGING_DB_URL` is unset in this shell and the rebuild is staging-only — per CLAUDE.md a skipped proof is a tracked gap, a rebuild against production is unrecoverable. The MIGRATIONS are proven against the live database (94/94), but the CANONICAL files are verified statically only (anchors matched, dollar-quotes balanced, no self-transacting `begin;/commit;` introduced) — a from-zero rebuild is what would prove 011/015 actually build a working database in order, and that proof is still owed. `olympiad_grade_config` was deliberately placed in **015, not 011**: it is a SQL-language function whose body Postgres validates at CREATE time, and `olympiad_package_grades` does not exist when 011 runs.

## PINNED — REGISTRATION HARDENING ROUND 2 (2026-08-05) — supersedes parts of the 08-04 entry below

**Why a second round:** both 08-04 fixes were incomplete in the same way — they relied on GoTrue's RESPONSE shape, which only tells the truth in one of the two duplicate cases.

**1. Duplicate email is now checked against the database, not inferred.** GoTrue obfuscates a duplicate (empty `identities`) ONLY when the existing account is **CONFIRMED**. When it is **UNCONFIRMED** it treats the repeat sign-up as a resend and returns a perfectly normal user object — indistinguishable from a first registration. During testing that is the common case (register, never click the link, register again), which is why duplicates still got through. Migration **099** adds `public.email_is_registered(text)`: one equality probe on `auth.users.email`, **service_role only** (anon/authenticated revoked explicitly — Supabase's default privileges would otherwise publish an account-existence oracle). Called before `signUp` by BOTH the web action and the mobile BFF. The response-shape check stays as a backstop.
> **Performance:** verified plan is **Index Only Scan** on `idx_users_email`. `lower()` is applied to the PARAMETER, never the column — `lower(u.email) = …` would discard the plain index and force a sequential scan of every user. That inversion is the whole performance story; do not "simplify" it.
> **Failure mode is deliberate:** if the RPC errors, registration CONTINUES (signUp still refuses duplicates, just with a vaguer message). A broken check must never become a broken registration.

**2. The web "check your inbox" screen no longer redirects.** `registerParent` now RETURNS `{ verifyEmail: true }` and the form swaps to the panel **in place**, so the address is still in component state — no cookie, no query parameter, no re-typing, and no dependency on a cookie surviving a server-action redirect (the suspected reason the 08-04 fix did not take effect). This is exactly what the mobile register screen already did, so the two flows now match. The 30-minute httpOnly cookie is kept as a SECONDARY path so the standalone `/verify-email` route (bookmark, login-screen error link) also knows the address within the session; if it fails, the panel is unaffected. `/verify-email` keeps its input as the cold-arrival fallback — removing it would strand the exact user the feature exists for.

**Mobile needed no change for #2** — `ResendConfirmation` already takes the address as a prop on both the register and login screens.

**Live validation: 90/90 PASS, 0 FAIL** (new check `57d`). Canonical backport: `011` + `013`.

## PINNED — REGISTRATION / VERIFY / DELETION FIXES (2026-08-04)

**1. Duplicate email no longer silently dead-ends.** With "Confirm email" ON, GoTrue answers a sign-up for an ALREADY-CONFIRMED address with HTTP **200** and an obfuscated user — deliberately, to prevent enumeration — and sends no mail. The old code saw success and routed the user to "check your inbox" for a mail that would never arrive, indistinguishable from slow delivery. Detected now via the documented marker (an **empty `identities` array**) in the shared pure helper `web-app/src/lib/auth/signUpOutcome.ts`, used by BOTH the web action and the mobile BFF (5 unit tests). Ambiguous shapes fail OPEN — a missing `identities` is never read as a duplicate, because a false positive blocks a real registration while a false negative costs one wasted email. UI: Register stays **disabled until the rejected address is edited** (web + mobile), compared against the server's normalized echo so case/whitespace changes don't re-enable it.
> **Accepted trade-off:** naming a duplicate is user enumeration. It matches a decision this project already made — parent login distinguishes "no account" from "wrong password" at the owner's request — and the mitigation is the same rate limiter (5 per address / 15 min).

**2. `/verify-email` no longer asks for the address again.** It arrives in a short-lived (30 min) **httpOnly cookie** set at registration (`web-app/src/lib/auth/pendingVerifyEmail.ts`) — deliberately NOT a query parameter, which would write a real person's email into browser history, server logs and every asset's `Referer`. The page names the inbox ("we sent a link to **x@y.com**") and the resend submits it from a hidden field. The 60-second cooldown is unchanged. **The input field survives as a fallback** when the cookie is absent — a bookmark opened days later, a second device, or an expired cookie — because removing it outright would strand the exact user the feature exists for.

**3. Orphaned children are structurally impossible (migration 098).** The FK graph cascaded everything EXCEPT the child: `parents` cascades `parent_student_links` away while `students.created_by_parent_profile_id` is only SET NULL, so the student's profile, credentials and auth user survived unreachable — invisible to every parent surface, yet still able to sign in. **Both existing students were already in that state.** Fixed with a BEFORE DELETE trigger on `parents` (`trg_parents_cascade_children`); app-level cascades in `deleteParent` / `deleteParentAccountCore` stay, but the guarantee now holds for the Supabase dashboard and raw SQL too. **Children linked to a second parent are KEPT** and merely unlinked. The `auth.users` delete is best-effort inside an exception block — losing rights there must not abort a parent's deletion — with the public-schema delete as the guarantee. Cleanup removed the 2 pre-existing orphans ("TEst test", "Subhan Əlizadə"; 0 attempts, 0 purchases each). Proven with a functional test (solo child removed / shared child kept / links tidy / auth user gone) in a rolled-back transaction, then applied. Canonical backport: `011` + new check `57c` in `013`. **Live validation: 89/89 PASS, 0 FAIL.**

## PINNED — GO-LIVE CHECKLIST (owner decision 2026-08-04: the dev/staging Supabase project IS production)

The owner confirmed the existing Supabase project will serve production directly. It is currently clean — 260 topics, **0 questions**, 0 test attempts, 2 students, 8 test auth users — so promoting it is reasonable. These are the things that must happen **before real families are on it**, in rough priority order.

1. **Upgrade Supabase to Pro.** The free tier has **no point-in-time recovery**. Today a mistake costs a curriculum import; after launch it costs every family's progress with no way back. This is the single highest-value item.
2. **Add the `child_login_attempts` retention job.** The table stores 8-digit child IDs + hashed IPs **forever** (only failures inside a 15-minute window are cleared; `016_scheduled_jobs.sql` schedules no cleanup). Two consequences: an indefinitely-growing table of minors' identifiers, and a privacy policy that **cannot state a real retention period** — `privacy.learning_data_retention` stays a "to be confirmed" chip until this exists. Fix: a `pg_cron` job in `016` deleting rows older than the chosen window, then set the retention value in admin → Settings → Privacy.
3. **Decide the staging story.** The from-zero rebuild proof (`drop schema public cascade` inside a rolled-back transaction) is the strongest validation in this project — it caught the `get_mobile_config` shape break in migration 097. It **must never run against a database holding real users**; this project already lost data once when migration `095`'s internal `commit;` defeated an outer rollback. Either provision a separate staging project, or accept that schema changes ship without a from-zero proof. **Owner has not chosen yet.**
4. **Delete the test accounts** (8 real-email auth users incl. `googleplaytester@olympiq.ai` and the 2026-08-04 registration tests) so they do not sit in production forever and skew the first leaderboards.
5. **Import the question bank.** It is **empty**. Nothing is playable, and the 8 olympiad packages have no pool — each needs at least `questions_per_attempt` published questions per target grade before it can serve an attempt.
6. **Fill the privacy policy** — 71 `OWNER MUST CONFIRM` markers remain; six are now admin-fillable with no code change. Lawyer review of the children's-data sections still required.
7. **Deliverability**: the sending domain is young. Confirm SPF/DKIM/DMARC pass on a real delivery and consider raising DMARC from `p=none` once traffic is steady.

## PINNED — EMAIL CONFIRMATION LINKS WERE BROKEN (fixed in code 2026-08-04; OWNER MUST UPDATE SUPABASE)

**Symptom reported:** a new registration from the deployed mobile app produces no usable confirmation.

**Root cause (proved from the code, and independently documented in the owner's own Elmly project at `side/UniPrep-master/src/services/supabase.ts:249-254`):** the templates linked to `{{ .ConfirmationURL }}`, which routes the click through `{SUPABASE_URL}/auth/v1/verify?...&redirect_to=<ours>`. What GoTrue appends on the way back depends on the flow the SIGN-UP used, and the two apps sign up differently:

| Sign-up path | Client | GoTrue appends | Result |
|---|---|---|---|
| web-app registration | `@supabase/ssr` → PKCE | `?code=…` | Works ONLY in the browser that submitted the form (needs the `code_verifier` cookie). Another device, another browser, or cleared cookies → fails. |
| mobile app via the BFF | bare `supabase-js`, `persistSession: false` | `#access_token=…` | **Never worked.** A URL *fragment* is not sent to the server, so no route handler can read it. Not a tuning problem — unfixable server-side. |

**Third, separate bug:** `/auth/callback` redirected failures to `/login?verify=failed` and **nothing rendered it** — the user landed on a login form with no explanation and no way to distinguish a dead link from a typo. This is very likely what the owner saw earlier as "login redirects with no error".

**Fixed in code:** new `web-app/src/app/auth/confirm/route.ts` + shared `web-app/src/lib/auth/confirmEmail.ts` verify the OTP directly (`verifyOtp({ token_hash, type })`), which is flow-agnostic and works for web and mobile sign-ups alike. `/auth/callback` now delegates to the same resolver so links already sitting in inboxes keep working. `type` is whitelisted (never cast from the URL) and `next` stays same-origin-relative. Login now renders `?verify=ok|expired|failed` with a resend link, trilingual (`verify.state.*`).

**❌ OWNER MUST DO — the code fix does nothing until these land in Supabase:**
1. **Replace the link in all three templates** (Confirm signup / Reset password / Change email) with the `{{ .TokenHash }}` form in `docs/EMAIL_SETUP_BREVO.md` §6. Exact per-template `type` values are in §6.4.
2. **Authentication → URL Configuration → Site URL = `https://olympiq.ai`.** `{{ .SiteURL }}` is now baked into every link; if this is still localhost, every email points at the user's own machine.
3. **Redirect URLs must include** `https://olympiq.ai/auth/confirm` and `https://olympiq.ai/auth/callback`.
4. **Verify `NEXT_PUBLIC_SITE_URL` is set in Vercel** — `siteUrl()` falls back to `http://localhost:3000`, which would poison `emailRedirectTo` on every signup.

**⚠️ A broken link and a missing email are DIFFERENT faults.** If mail still never arrives after the above, the template is not the cause — `docs/EMAIL_SETUP_BREVO.md` §8 is a six-step ordered checklist. The two most likely causes during testing are (a) **the address was already registered** — Supabase deliberately does not resend to an existing account and returns a fake success, so every retest with the same inbox is silent; and (b) the **per-address minimum interval** / hourly send rate limit. Supabase **Logs → Auth Logs** settles it in one look.

**✅ VERIFIED END TO END 2026-08-04** (owner, mobile app via Expo tunnel): register → Brevo delivers → click the emailed link → `/auth/confirm` verifies → signed in. Brevo's transactional log showed `sent / delivered / opened`; the "opened" event was Gmail's image proxy prefetching the tracking pixel, not a human, and the apparent delivery delay was Gmail filing the message before the client re-synced.

**Post-confirmation hand-off (added same day).** Success no longer redirects silently into `/dashboard` — it lands on `/auth/confirmed`, which states plainly that the address is confirmed and offers both ways forward: **Open the OlympIQ app** (`olympiq://login`, already in the app's deep-link allowlist) and **continue on the website**. User-Agent decides which is PRIMARY, never which exists — a UA is a hint, and desktop-mode-on-phone or an in-app browser would otherwise strand the user. The page sits outside the `(public)` route group on purpose, so it renders with no site header — which also removes one path by which a signed-out store reviewer is a tap away from the pricing nav.

**⚠️ Future improvement — Universal Links / Android App Links.** The custom `olympiq://` scheme requires a user tap and shows a confirm dialog on iOS. The better answer is `https://olympiq.ai/auth/confirmed` opening the app directly, which needs an `apple-app-site-association` file + the Associated Domains entitlement, and `assetlinks.json` + the app's **Play App Signing SHA-256**, which does not exist until the app is uploaded. Revisit after the first Play release.

## PINNED — BRAND IDENTITY LANDED (2026-08-04)

The blue-chevron mark that shipped through mobile v1.3.0 was a **placeholder**. The investor delivered the real identity and every icon in the product is now derived from it: navy `#141B4D`, purple `#6E5BFF` (the two shorter bars are the same purple at 80% / 50% alpha), gold `#F2B441`; three ascending bars with a star on the tallest. Tagline: **"Hər gün bir pillə yuxarı"**.

Master library + full derivation table: **`docs/brand/README.md`**. Nothing under `mobile-app/assets/images/` is hand-edited — regenerate from the masters.

- Mobile: `icon.png`, `android-icon-foreground.png`, `android-icon-monochrome.png`, `splash-icon.png`, `favicon.png` all regenerated; `adaptiveIcon.backgroundColor` → `#141B4D` (this is what resolved the inversion); the unused construction-grid plate moved out of the build tree. **Version 1.3.0 → 1.4.0.**
- Web-app + admin-panel gained a favicon for the first time (`src/app/icon.png`, plus `apple-icon.png` on web) via the Next.js App Router convention — no code, picked up automatically.
- Play assets in `mobile-app/store-assets/` regenerated on the real palette.

**❌ Open brand decisions (owner):**
- **The product's colour TOKENS do not match the identity.** The apps run on purple `#7c3aed` + orange `#ff8a00`; the brand is purple `#6E5BFF` + gold `#F2B441` on navy. Close cousins, not the same palette. Aligning them is a deliberate design round touching every token in three apps — deliberately NOT folded into this change. Icons are on-brand; interiors are not.
- **Web and admin headers still render "OlympIQ" as text**, not the lockup. Artwork is ready (`lockup-horizontal-on-{light,dark}.png`); wiring it needs a light/dark pair and a layout pass.
- **Five artwork variants are missing** from the investor set (the contact sheet shows 11 files, 6 arrived): the mono lockups and mono marks. `06_nisan_qizil-zirve` was reconstructed in-repo by an exact colour substitution; the rest should be requested before any single-colour printing/embroidery/watermark use.

## PINNED — PRIVACY POLICY IS NOW ADMIN-CONTROLLED (migration 097, 2026-08-04)

The eight facts the code cannot derive moved from build-time constants into `system_settings` under `privacy.*`, edited at **admin `/settings` → Privacy**. The compiled-in constants in `{web-app,mobile-app}/src/lib/privacyPolicy.ts` remain the FALLBACK (offline phone, first paint, unconfigured service role); a non-empty admin value wins, via the shared pure `resolvePrivacyPolicyStatus()` mirrored in both codebases.

**Effective date + last updated are SET (04.08.2026)** in the DB seed, both code fallbacks, and all three language blocks of `docs/PRIVACY_POLICY.md` — so the page no longer shows the draft banner.

**`pushLive` / `paymentsLive` are deliberately NOT settings.** `get_mobile_config()` derives them from the `notifications_push` flag and the resolved payment mode, so a regulator-facing claim can never contradict the switch it describes. `payments_live` is `'real'` ONLY — demo and giveaway modes move no money and touch no card data, so §8 keeps describing payments in the future tense while either is on. The admin still controls both, through the Features tab.

**Policy TEXT stays in code**, not the CMS. It is 381 `privacy.*` keys — a field-by-field CMS edit of a legal document would bypass both code review and the `docs/PRIVACY_POLICY.md` mirror that Apple and Google actually read, and that drift is the real risk. The `t()` chain already honours a `site_content` override for any of those keys if a curated subset is ever wanted.

**❌ Still open before publication:** 71 `OWNER MUST CONFIRM` markers remain in `docs/PRIVACY_POLICY.md`. Six are now admin-fillable with no code change (privacy email, website URL, hosting region, server-log / learning-data / backup retention) — the rest need owner or lawyer decisions. Lawyer review of the children's-data sections is still required.

## Task — Privacy policy (deliverables A/B/C) — DONE 2026-07-30

**What shipped.** A trilingual privacy policy as ONE source rendered in four places: the standalone store document `docs/PRIVACY_POLICY.md` (az + en + ru + a legal-review annex), the public web page `/privacy`, the in-app web shells `/help/privacy` and `/child/help/privacy`, and the mobile screen `(public)/privacy`. Linked from the public footer, both registration forms (web + mobile), the parent profile card, the student drawer and the mobile account sheet.

**Files.** New: `docs/PRIVACY_POLICY.md`; `web-app/src/lib/{privacyPolicy,policyContent}.ts`, `web-app/src/components/PrivacyPolicy.tsx`, `web-app/src/app/(public)/privacy/`, `(parent)/help/privacy/`, `child/help/privacy/`, `web-app/src/lib/__tests__/policyContent.test.ts`; `mobile-app/src/lib/{privacyPolicy,policyContent}.ts`, `mobile-app/src/features/public/PolicyBlocks.tsx`, `mobile-app/src/app/(public)/privacy.tsx`, `mobile-app/__tests__/{policy-content,privacy-policy-status}.test.ts`. Edited: `web-app/src/i18n/messages.ts` (the `privacy.*` block + softened `prof2.dangerHint` / `account.deleteConfirm`), `web-app/src/app/layout.tsx`, `web-app/src/lib/supabase/middleware.ts`, the three web shells + register page + profile page, `web-app/src/app/globals.css`, `mobile-app/src/app/(public)/{login,register}.tsx`, `mobile-app/src/components/AccountSheet.tsx`, `mobile-app/src/i18n/messages.generated.ts`, `mobile-app/{app.json,package.json}` (1.2.0 → **1.3.0**).

**Validation.** web `tsc --noEmit` PASS · `vitest run` 98/98 PASS · `next build` PASS (`/privacy` in the route table) · mobile `sync-i18n` (az/en/ru = 1304 keys each) · `tsc --noEmit` PASS · `expo lint` PASS · `jest --ci` 325/325 PASS · `check-i18n-keys` PASS.

**MAINTENANCE RULES — read before editing any policy text:**
- **A policy edit is atomic across FOUR places:** `docs/PRIVACY_POLICY.md` (all three language blocks A/B/C), then the `az` + `en` + `ru` blocks of `web-app/src/i18n/messages.ts`, then `node mobile-app/scripts/sync-i18n.mjs` to regenerate the mobile catalog. Never edit one language alone — `mobile-app/__tests__/policy-content.test.ts` fails the build when a table loses a column or a list loses an item in one language only.
- **`privacy.*` is SERVER-ONLY on the web.** `web-app/src/app/layout.tsx` deliberately strips the prefix from the client i18n dictionary (the body is 30–44 KB and that dict is serialized into every page). A `"use client"` component reading a `privacy.*` key renders the raw key string; `policyContent.test.ts` has a guard that fails the build if one appears. Pass policy copy as a prop instead.
- **`web-app/src/lib/policyContent.ts` and `mobile-app/src/lib/policyContent.ts` are one module in two files** — same bound, same normalisation, pinned by mirrored fixture cases in both test files. Change them together.
- **`/privacy` is exempt from maintenance mode** (`layout.tsx`, via the middleware `x-pathname` header) because that URL is registered with Apple and Google and both re-fetch it after submission. Re-verify the exemption when the real domain replaces the Vercel URL — it is also listed in the domain go-live checklist below.
- **Mobile version bump is mandatory** on any `mobile-app/` change (root `CLAUDE.md`). 1.3.0 needs a fresh EAS build before any OTA update can reach it (`runtimeVersion` policy is `appVersion`).

**Open blockers on this deliverable (owner + counsel, not code):**
1. **Lawyer review before publication.** Annex `Z1` states this; the areas flagged are children's data, Azerbaijani data-protection law, and GDPR/COPPA exposure if the app is distributed outside Azerbaijan. The document deliberately describes PRACTICES and claims compliance with no statute.
2. **25 `OWNER MUST CONFIRM` items** in annex `Z2` — identity/contact (blocks publication), hosting region, retention periods, and product decisions (public child-avatar bucket, public board publishing school+grade for minors).
3. **All ten fields in `privacyPolicy.ts` are empty, so the page ships with a draft banner.** Filling `effectiveDate` is the single switch that turns it into a published policy — do it LAST, after counsel signs off.
4. **`deleteParentAccountCore` swallows Auth failures** (`admin.auth.admin.deleteUser(...).catch(() => {})`, and `writeAuditLog` runs BEFORE the destructive calls), so a transient failure signs the parent out and shows a deletion-confirmed page while the rows survive. The policy now discloses a manual-completion route instead of promising unconditional erasure — **fix the code and then tighten the wording**, since account deletion is the one commitment both stores test.
5. **Android manifest carries CAMERA + READ/WRITE_EXTERNAL_STORAGE** from `expo-image-picker` even though only `launchImageLibraryAsync` is ever called. §12 discloses it honestly; stripping them at build time (config plugin / `tools:node="remove"`) is the better fix and lets the absolute wording come back.

## PINNED — Domain go-live checklist (owner, 2026-07-27; do ALL of these the day the website domain is live)

When the real domain (planned: `olympiq.ai`) replaces the `*.vercel.app` URL:

1. **Vercel:** attach the domain to the web-app project (production). The old `*.vercel.app` URL keeps working as an alias — do NOT remove it (installed mobile builds may still point at it until step 4 lands).
2. **Supabase Auth:** update the **Site URL** and add `https://<domain>/auth/callback` to the **Redirect URLs** allowlist — parent email verification and password-reset links break otherwise.
3. **EAS env vars:** update `EXPO_PUBLIC_BFF_URL` to `https://<domain>` for the `preview` AND `production` environments (`eas env:update` or the expo.dev dashboard). New builds pick it up automatically.
4. **Existing installs:** `EXPO_PUBLIC_*` values are BAKED into the JS bundle at build/update time — a dashboard change alone reaches nobody. Publish an EAS Update per channel (e.g. `eas update --environment production --channel production -m "domain switch"`); it reaches every build with the SAME runtime version (= same `expo.version`). Builds older than the current runtime version only get it via a fresh store build.
5. **Compliance reminder:** the domain must still NEVER appear in the mobile app in a purchasing context (`docs/STORE_PAYMENTS_COMPLIANCE.md`) — the BFF env var is fine, visible URLs/QRs are not.
6. **Signing keys (standing):** the Android keystore is **EAS-managed**; a local backup exported via `eas credentials -p android` may exist but is gitignored (`*.jks`, `*.keystore`, `credentials.json`) and must never be committed or moved into the repo.
7. **Privacy-policy URL:** point App Store Connect and the Play Console Data-safety form at `https://<domain>/privacy`, set `websiteUrl` in `web-app/src/lib/privacyPolicy.ts` to the new domain, and **re-verify the maintenance-mode exemption** — turn `platform.maintenance_mode` on and confirm `https://<domain>/privacy` still serves the policy while every other route shows the splash. Both stores re-fetch that URL asynchronously after submission, not only during review.

This file is intentionally configured for the **first coding session**. No application code has been implemented yet.

## Current Stage

- Stage: Stage 6 — Question Management and Media Uploads — COMPLETE / MANUALLY PASSED (2026-06-27)
- Current task: DONE. Question management (list/create/edit, taxonomy metadata, per-question language az/en/ru, body/prompt + dynamic answer options with correctness + explanation), content lifecycle with role rules (least privilege), content audit, AND media uploads (Supabase Storage `question-media` → `media_assets` metadata; metadata-only in PG). Human verified: image upload, persistent preview, removal, and the storage object/row all confirmed. Stages 1–6 complete.
- ARCHITECTURAL RE-PLAN DONE (2026-06-27, docs only): the confirmed business model (parent-only registration; parent-created children; child 8-digit ID + parent-password login; child-based subject subscriptions + launch-promo + 7-day trial + automatic sibling discount; real webhook-verified payment; public marketing website; News; Olimpiada Preparation paid module with lifetime access; child wallpaper) was written across the planning Markdown package. NO app code changed. The revised forward roadmap lives in `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap (2026-06-27)".
- Stage: **GOAL COMPLETE (2026-06-28) — Stages 1–15 delivered.** Core product loop works end-to-end (admin content/news/olympiad + bulk ops → public site → parent register/add-child/subscribe/buy → child login/practice/olympiad → progress). Both apps build + typecheck; canonical SQL `001`–`015` + migrations `006`–`014` backported; **from-zero rebuild 22/22 PASS**. Manual-testing guide: `docs/MANUAL_TESTING_GUIDE.md`. Future follow-ups (not blocking): real payment charge/webhook, leaderboard, notifications, cover-image upload, Vercel deploy, mobile app.
- Increment 1 (child accounts) DONE + BACKPORTED into canonical `001`/`002`/`003`/`009`/`010`/`011`/`012` (migration `2026_06_27_006`): students child fields + 8-digit `child_unique_id`, `child_unique_ids` registry + random `allocate_child_unique_id()` (smoke test PASS), `child_credentials`, `wallpapers` + `child_wallpaper_selections` + `wallpaper-assets` bucket, RLS, 6 wallpapers seeded.
- Increment 2 (child subscriptions + payments) DONE + BACKPORTED into canonical `007`/`010`/`011`/`012` (migration `2026_06_27_007`): `subjects_pricing` (per-subject per-interval, configurable), `launch_promo_config` (singleton, trial_days=7), `child_subscriptions` (parent-owned/paid, status/amounts/discount/trial — service-role written), `subscription_subjects`, `checkout_sessions` (provider-agnostic), `sibling_discounts` (audit), `payments` linked to subscription/checkout; RLS (owner/child read; writes admin/service only — clients never set price/discount/status); audit on subscription status; seeded pricing + promo. Old generic `subscription_plans`/`subscriptions` left DEPRECATED (not dropped). Canonical re-applied idempotently; `013` = 12/12 PASS.
- Increment 3 (News) DONE on dev/staging — canonical module file `014_news.sql` (self-contained, applied directly; no separate migration since it is a brand-new file): `news` (slug, `content_status` lifecycle, cover image via `media_assets`, created_by, published_at) + `news_translations` (az/en/ru title/body) + `news-media` Storage bucket (public read, admin write) + indexes + updated_at/audit triggers + RLS (published news public to anon/authenticated; **Admin-only CRUD**, Content Managers excluded). Validated: 2 tables, RLS on both, 4 table policies, bucket + 2 storage policies; `013` = 12/12 PASS.
- Increment 4 (Olympiad Preparation) DONE on dev/staging — canonical module file `015_olympiad_preparation.sql` (self-contained; no separate migration — brand-new file): `olympiad_packages` (Admin-only listing; price, optional subject/grade/olympiad_type, `questions_per_attempt` default 25, `catalog_status` active/archived, cover via `media_assets`) + `olympiad_package_translations` (az/en/ru) + `olympiad_package_questions` (curated pool, mirrors `test_questions`, Admin-only/sensitive) + `olympiad_purchases` (PARENT buys → CHILD **lifetime** access; FK to packages `on delete restrict` so purchased packages are never deletable; one purchase per child/package; writes service-role/admin only) + `payments.olympiad_purchase_id` link + `olympiad-media` Storage bucket (public read, admin write) + indexes + updated_at/audit triggers + RLS (active packages public; **Admin-only CRUD**, Content Managers excluded; purchases readable by owner/child/linked-parent/admin). Attempt/result tables intentionally DEFERRED to the unified test/attempt engine (Stage 13/14). Validated: 4 tables, RLS 4/4, 7 policies, payments link, bucket + 2 storage policies, purchased-package FK = RESTRICT; `013` = 12/12 PASS.
- **Stage 7 DB increments 1–4 are COMPLETE, backported/canonical, and FINAL-VALIDATED.** `013` extended with Stage-7 checks (child accounts #13, subscriptions/payments #14, News #15, Olympiad #16; enum #4 + function #5 + bucket #11 lists updated). Final from-zero rebuild run on dev/staging **non-destructively** (single transaction: `drop+recreate public` → apply canonical `001`→`012`,`014`,`015` → `013` → `ROLLBACK`): applied in order with **zero errors**, extended `013` = **16/16 PASS**, and post-rollback dev confirmed intact (16/16 PASS, wallpapers/pricing/roles/buckets unchanged). Canonical set reproduces the entire schema from zero — no ordering/forward-reference issues.

### Stage 8 — Child Authentication & Account Model (CODE-COMPLETE 2026-06-28; runtime test deferred to UI stages 10/12)
- **Numbering note (resolved):** `IMPLEMENTATION_EXECUTION_PLAN.md` has an old "Stage 8 — Student Web App Core Flows" (lines 174/557); the **Revised Forward Roadmap (2026-06-27)** explicitly supersedes the old Stage 7–14 ordering, so Stage 8 = **Child Authentication & Account Model**. Old section kept as reference only. No conflict to block on.
- **Scope (server-side only; NO UI — parent Add-Child UI is Stage 10, child login UI is Stage 12):** the credential/account model so later UI stages just wire to it.
- **Increment 8.1 — DB — DONE + BACKPORTED + VALIDATED (2026-06-28):** atomic `create_child_account()` SECURITY DEFINER RPC (promotes the auto-created profile → active child, inserts `students` + Student role + `child_credentials` + active `parent_student_links`, allocates 8-digit ID; validates parent; service-role EXECUTE only) + `child_login_attempts` lockout table with `record_child_login_attempt()` / `is_child_login_locked()` (≥8 failures / 15 min) + admin-read RLS + audit via existing triggers. Migration `2026_06_28_008` applied + smoke-tested; backported to canonical `002`/`010`/`011`/`013`; extended `013` (#17) + from-zero rebuild = **17/17 PASS**.
- **Increment 8.2 — Server service layer — DONE (2026-06-28, no UI; typecheck PASS):** server-only service-role admin client (`web-app/src/lib/supabase/admin.ts`, `import "server-only"` + `getAdminClient()`); `web-app/src/lib/auth/children.ts` (synthetic/pending email helpers + lightweight typed validators returning i18n keys — zod NOT added since it isn't an installed dep); `childAccountService.ts` → `createChild` (admin.createUser temp `pending-<uuid>@children.invalid` + parent password → `create_child_account` RPC → update email to `c<8digits>@children.invalid`; saga-deletes the orphaned auth user on any failure) + `resetChildPassword` (ownership-checked; password ≥8 and ≠ ID); `childLoginService.ts` → `childLogin` (validates 8-digit ID → lockout gate via `is_child_login_locked` → `signInWithPassword` on SSR client for httpOnly cookies → `record_child_login_attempt`; generic error, no enumeration) + `childLogout`. Added trilingual `auth.child.*` strings (az/en/ru) to `messages.ts`; `.env.local.example` documents the server-only `SUPABASE_SERVICE_ROLE_KEY`. **Stage 8 (model + services) is code-complete; end-to-end runtime test happens when the UI exists (Stage 10 parent Add-Child, Stage 12 child login).**
- **Skeleton note:** `web-app` has no ESLint config yet (Stage 4 gap) so `npm run lint` drops into interactive setup; `npm run typecheck` is the working compile gate (PASS). Configuring ESLint is a separate follow-up.
- **Decision (owner-confirmed 2026-06-28):** the Supabase **service-role key is a server-only env var in `web-app`** (NOT isolated into Edge Functions). Binding rules + Vercel deploy guidance in `docs/decisions/2026-06-28-service-role-key-hosting.md`. Same posture reused for Stage 11 payment webhooks.
- **Admin bulk question operations (pre-Stage-9 acceleration; ported natively from UniPrep per [[uniprep-reuse-model]]):** **inc.1 DB DONE** (migration `009`: `bulk_insert_questions` RPC + `question_imports`; from-zero rebuild 18/18). **inc.2 UI DONE (2026-06-28)** — `admin-panel`: bulk server actions (`bulkImportQuestions`/`bulkDeleteQuestions`/`bulkTransitionQuestions` in `lib/admin/questions.ts`), `/questions/import` page + `BulkImportClient` (JSON upload, downloadable template, per-row result, import history), and `/questions` refactored with multi-select + bulk toolbar (lifecycle transition + admin delete) via new `QuestionsTable` client; trilingual `bulk.*`/`qbulk.*` strings; **typecheck + build PASS** (11 routes). No new env (uses content-manager session, not service role). **Manual UI test pending.** Follow-ups DONE: bulk **assign-topic** (cascading subject→topic→subtopic picker + `bulkAssignTopic` action); import-page **"valid codes" reference** panel; **difficulty made optional** at question creation (form + `saveQuestion` + bulk RPC via migration `010`, backported to `011`, from-zero 18/18). typecheck + build PASS.

### Batch D — Olympiad PRIVATE pool + bulk + auto-code (DONE, 2026-06-28)
- **DB (migration `2026_06_28_016_olympiad_private_pool.sql`, applied dev/staging + backported):** added nullable `public.questions.olympiad_package_id` (FK olympiad_packages, on delete cascade) + index — a non-null value makes a question PRIVATE to that package. `start_practice_attempt` now filters `olympiad_package_id IS NULL` (private questions excluded from practice). `start_olympiad_attempt` now draws its 25 random questions ONLY from `questions WHERE olympiad_package_id = package` (replaced the `olympiad_package_questions`→general-questions join; attempts still reference `public.questions(id)`, so `test_attempts`/`test_attempt_answers`/`get_/grade_practice_attempt` are UNCHANGED). New SECURITY DEFINER RPC `bulk_insert_olympiad_package_questions(p_package_id, p_questions)` — same trilingual item format as `bulk_insert_questions` but sets `olympiad_package_id` + `status='published'`; content.create gated, anon revoked. Backported: column → canonical `015` (FKs olympiad_packages there); 2 RPC edits + new RPC → canonical `011`; `013` function list + new check **#23** `23_olympiad_private_pool`. **Non-destructive from-zero rebuild = 23/23 PASS.**
- **Admin UI (`admin-panel`, typecheck + build PASS, 21 routes):** removed the `code` input from `OlympiadForm`; `saveOlympiadPackage` now auto-generates the package `code` from the az title via local `slugifyCode` (hyphen slug, 23505 retry with random suffix). Removed `code` column from `/olympiad` list and the edit-page header (uses az title). Olympiad edit page: replaced the old general-pool checkbox `PoolManager` (deleted; `setOlympiadPool` removed) with `OlympiadBulkImport` (new `bulkImportOlympiadQuestions` action → the new RPC) + a live private-question count. Admin `/questions` list now excludes private questions (`.is("olympiad_package_id", null)`); general `bulk_insert_questions` leaves the column NULL (unchanged). Trilingual `olybulk.note`/`olybulk.count` added (az/en/ru).

### Batch H — Add-Child flow + Subjects UX (DONE, 2026-06-28)
- **DB (migration `2026_06_28_015_deferred_child_id_and_subject_edits.sql`, applied dev/staging + backported):** the 8-digit login ID is now **DEFERRED** — `create_child_account` no longer allocates it (child created with `child_unique_id` NULL + `access_status='inactive'`) and gained an optional `p_grade_id uuid` (writes `students.grade_id` for a real grades dropdown); `child_credentials.child_unique_id` made NULLABLE (backported to canonical `002`). `create_child_subscription` now allocates the ID on the FIRST plan for a child that still has none (calls `allocate_child_unique_id`, backfills `child_credentials.child_unique_id`) and returns `new_child_unique_id` + `auth_user_id` so the server action sets the canonical synthetic auth email. New SECURITY DEFINER RPCs `add_subscription_subject` / `remove_subscription_subject` (service_role only) re-price a child's live subscription server-side at the kept sibling rate (≥1 subject must remain). Backported to canonical `011`; `013` function list (#5) + `create_child_account` signature (#17) updated. **Non-destructive from-zero rebuild (local PG 17, Supabase env stubbed) = 23/23 PASS.** ID confirmed allocated ONLY after subscribe.
- **web-app (typecheck + build PASS, 27 routes):** `AddChildForm` now uses **dropdowns** — Grade (from `public.grades`), City (static AZ cities + "Other"→free text), School (text + datalist); on success it links to the subscribe/plan step (no ID shown yet). `subscriptionService`: `subscribeChild` sets the synthetic email after allocation + reveals the new 8-digit ID; new `quoteSubscription` (live server preview via `quote_child_subscription` — sibling discount authoritative, not hardcoded) + `addSubjectAction`/`removeSubjectAction`. `SubscribeForm` redesigned — **subjects first (checkboxes) → live subtotal → billing-period selector → server price preview (base/discount/total)**, reveals the 8-digit ID on success. New `ManageSubjects` component (edit subjects on an existing live subscription) shown on the subscribe page when a child already has a plan. Dashboard child card shows **"ID pending — choose a plan"** until allocated. `childAccountService.createChild` returns `childUniqueId: null` + new `applyAllocatedChildEmail` helper. Trilingual (az/en/ru): new `parent.child.*` (grade/city dropdowns, choosePlan), `parent.dash.idPending`/`choosePlan`, `sub.*` (totalNow/previewHint/calculating/noSibling/idFailed), full `subjedit.*` set.

### Stage 9 — Public Marketing Website + News (IN PROGRESS, 2026-06-28)
- Goal: public marketing site + News (public read + Admin CRUD). News DB already built (`014`). Web-app public visuals kept **minimal/neutral** (investor-design gate per [[ui-design-direction]]).
- **Increment 9.1 — Admin News CRUD — DONE (typecheck + build PASS, 14 routes):** `admin-panel` News module (Admin-only; Content Managers excluded) — `lib/admin/news.ts` (`saveNews`/`transitionNews`/`deleteNews`), `/news` + `/news/new` + `/news/[id]/edit` with `NewsForm` (slug + trilingual title/body, az required) + `NewsLifecycle` (publish/unpublish/archive/delete); sidebar nav entry; trilingual `news.*` strings. **Cover-image upload (news-media bucket) DEFERRED to 9.1b.**
- **Increment 9.2 — Public web-app pages — DONE (typecheck + build PASS, 14 routes):** `web-app` `(public)` route group + layout (nav/footer/language) — `/`, `/about`, `/subjects`, `/pricing`, `/olympiad-preparation`, `/faq`, `/contact`, public **News** `/news` + `/news/[slug]` (published-only via RLS, locale fallback to az), `/login` + `/register` entry stubs (full parent auth = Stage 10). Minimal/neutral plain-CSS styling (design gate); trilingual content keys (≈60 ×3). Old `app/page.tsx` moved into `(public)`.
- **Stage 9 substantially COMPLETE.** Remaining follow-up **9.1b**: News cover-image upload (news-media bucket) — tracked, non-blocking (News works without a cover).

### Stage 10 — Parent App (CORE DONE 2026-06-28; build PASS, web-app 16 routes)
- **DB:** `setup_parent(uuid, text)` SECURITY DEFINER RPC (service-role only; promotes a fresh auth user → active parent: parent role + `parents` row) — migration `2026_06_28_011`, backported to canonical `011`/`013` (#19), from-zero rebuild **19/19 PASS**.
- **web-app:** real parent **register/login/logout** (`parentService.ts` — admin.createUser + `setup_parent` + sign-in, no email dependency; `session.ts` `requireParent` via `current_profile_id`/`has_role`); `(public)/login` + `(public)/register` real forms (`ParentAuthForm`); `(parent)` authed route group (layout guard + logout) with **dashboard** (children list + 8-digit ID + access-status pill) and **Add-Child** flow (`AddChildForm` → `addChild` action authorizes the parent then calls Stage-8 `createChild` → **8-digit ID reveal**). Trilingual `parent.*`/`access.*` strings.
- **Deferred to Stage 11:** subject selection + live pricing + sibling-discount + checkout (the Add-Child flow currently creates the child with `access_status='inactive'`; subscriptions/payment come next). Needs `SUPABASE_SERVICE_ROLE_KEY` in `web-app/.env.local` to run register/add-child.

### Stage 11 — Child Subscriptions & Payments (CORE DONE 2026-06-28; build PASS)
- **DB:** `quote_child_subscription` (read-only preview) + `create_child_subscription` (apply) RPCs — price = Σ(subject pricing × interval), **sibling discount 2nd 15% / 3rd+ 20%** computed by rank, **7-day trial** from `launch_promo_config`; writes `child_subscriptions`(trialing) + `subscription_subjects` + `sibling_discounts` audit + flips child `access_status='trialing'`. Service-role only (client never sets amounts). Migration `2026_06_28_012`, backported `011`/`013` (#20), from-zero rebuild **20/20**; smoke verified (2nd child got 15%).
- **web-app:** per-child **Subjects & subscription** page (`/children/[id]/subscribe`) reading `subjects_pricing`, `SubscribeForm` (interval + subject checkboxes + live subtotal) → `subscribeChild` action (authorizes parent → `create_child_subscription`) → result shows base/discount/total/trial; dashboard "Subjects" link per child. Trilingual `sub.*` strings.
- **Stubbed (needs provider):** real charge / webhook activation, failed-charge auto-block, promo-vs-trial nuance. MVP = trial grants access; converting trial→paid and gating-on-failed-charge come when a payment provider is chosen (Stage 11 follow-up).

### Stage 12 — Child App (CORE DONE 2026-06-28; build PASS, web-app 19 routes)
- **web-app (no DB migration — uses Stage-8 `childLogin` + Stage-7 wallpapers):** `/child-login` (8-digit ID + parent password → `childLoginAction` → Stage-8 `childLogin` with lockout) ; `/child` authed route (`requireChild` via `has_role('student')`) with child dashboard — **access-gated**: trialing/active → "your learning" placeholder (content = Stage 13/14), else **locked states** (`child.locked.{inactive,locked,expired}` asking the parent to subscribe); **predefined wallpaper picker** (`WallpaperPicker` → `selectWallpaper` upsert, RLS self-only; selected solid-color wallpaper applied as dashboard background); child logout. Trilingual `child.*` strings.
- Children can never purchase (no payment UI in the child app). Login enumeration-safe + lockout (Stage 8).

### Stage 13 — Test & Daily Task Engine (CORE DONE 2026-06-28; build PASS, web-app 21 routes)
- **DB (migration `2026_06_28_013`):** `test_attempts.test_id` relaxed to nullable + `subject_id`/`kind` added (random practice has no fixed test). Three SECURITY DEFINER, owner-checked, authenticated-only RPCs: `start_practice_attempt` (picks N **random published objective questions** for the subject, grade-matched, **difficulty never chosen**), `get_practice_attempt` (returns questions + options **without `is_correct`** — anti-cheat), `grade_practice_attempt` (records answers, **auto-grades** set-equality, writes authoritative score). Backported `005`/`011`/`013` (#21); from-zero **21/21**; smoke verified (all-correct = max, no `is_correct` leak).
- **web-app:** child dashboard lists subscribed subjects → **Practice** button → `startPractice` → `/child/practice/[id]` renders `PracticeRunner` (radio for single/true-false, checkbox for multiple-choice) → `gradePractice` → score. Trilingual `practice.*`.

### Stage 14 — Olimpiada Preparation Module (CORE DONE 2026-06-28; builds PASS)
- **DB (migration `2026_06_28_014`):** `purchase_olympiad` (parent one-time LIFETIME buy → `olympiad_purchases` active, idempotent; service-role; payment stubbed) + `start_olympiad_attempt` (purchase-gated, picks `questions_per_attempt` random from the package pool, `kind='olympiad'`, reuses `get_`/`grade_practice_attempt`). Backported `011`/`013` (#22); from-zero **22/22**; smoke verified (purchase + attempt 1/1).
- **admin-panel:** `/olympiad` module (Admin-only) — list, new, edit `OlympiadForm` (code/subject/grade/price/status + trilingual title/description), `PoolManager` (tick published questions to curate the pool), archive (never hard-delete — purchasers keep access). Trilingual `oly2.*`; nav entry.
- **web-app:** parent `/children/[id]/olympiads` (browse active packages + `buyOlympiad` per child + "Owned"); child `/child/olympiads` (purchased packages → `startOlympiad` → reuses `PracticeRunner`). Dashboard links added. Trilingual `oly3.*`.

### Stage 15 — Progress / Analytics (CORE DONE 2026-06-28) + future follow-ups
- **web-app:** parent `/children/[id]/progress` (child's graded attempt history: subject · kind · score/max · date, RLS parent-linked) + "Recent results" on the child dashboard. Trilingual `prog.*`/`kind.*`. No DB migration (reads `test_attempts`).
- **Future follow-ups (DB tables already exist; not built this pass):** leaderboard, in-app notifications, real payment-gateway charge/webhook + failed-charge auto-block, News/Olympiad cover-image upload, deployment (Vercel). All noted; none block the core product loop.
- **QA/Security summary:** every privileged op is server-side + owner/permission-checked; service-role/`content.create` functions are NOT anon/authenticated-executable (validated by `013` #17–#22); from-zero rebuild reproduces the whole schema (**22/22**). Both apps build + typecheck clean.

## 🟢 GOAL COMPLETE (2026-06-28): Stages 9–15 delivered
- Migrations `2026_06_28_008`–`014` all applied + backported; canonical `001`–`015`; from-zero rebuild **22/22 PASS**.
- admin-panel + web-app both **build + typecheck PASS**. Trilingual (az/en/ru) throughout.
- **Full manual-testing guide:** `docs/MANUAL_TESTING_GUIDE.md` (admin-panel + web-app, with env setup + admin bootstrap + step-by-step flows + expected results).
- Owner/agent: Claude Code
- Started: 2026-06-27
- Last updated: 2026-06-28
- Stage status: IMPLEMENTED + locally validated (both apps typecheck + build PASS). Stages 1–4 complete. Added: admin can create Administrators/Content Managers from the panel (least privilege, needs `SUPABASE_SERVICE_ROLE_KEY` server-side); trilingual UI (az/en/ru) across both apps with a language switcher. Browser flow needs human manual test. Next: Stage 6 after approval.
- Security decision (2026-06-27): Authoritative-column hardening was applied IN Stage 2 (not deferred to Stage 7), per human approval.
- Previous stage: Stage 1 — Repository Setup and Tracking — COMPLETE and manually passed (baseline committed `2da8a13`, pushed to `origin/main`; `docs/decisions/.gitkeep` added).
- Version control: Git on `main` branch only (no stage branches). Stage 2 SQL changes are uncommitted in the working tree.

## First Coding Session Instruction

If this is the first time Claude Code is reading this project:

1. Read `CLAUDE.md`.
2. Read `IMPLEMENTATION_EXECUTION_PLAN.md`.
3. Read this `STATUS.md`.
4. Treat the project as **not implemented yet**.
5. Start with **Stage 1 — Repository Setup and Tracking**.
6. Do not jump to Web App, Admin Panel, payments, analytics, or mobile work.
7. After Stage 1 is complete, update this file and recommend Stage 2.

## Current Implementation Plan

- Goal: Create the Supabase SQL foundation as canonical root files in correct numeric run order (`001`–`013`), separated by responsibility (tables, enums, constraints, policies, indexes, triggers, seed, validation). Prepare the RLS strategy before any client app relies on data. PostgreSQL stores only metadata and Storage object paths; actual images/audio/media live in Supabase Storage.
- Markdown/docs that MUST be read before Stage 2 coding (Stage 2 list from `IMPLEMENTATION_EXECUTION_PLAN.md`):
  - `supabase/CLAUDE.md`
  - `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
  - `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
  - `supabase/README_RUN_ORDER.md`
  - `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`
  - `supabase/sql/migrations/README_MIGRATIONS.md`
  - `supabase/markdowns/SUPABASE_IMPLEMENTATION_CONTEXT.md`
  - `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
  - `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Files expected to change/create (canonical root SQL under `supabase/sql/`, in numeric order):
  - `supabase/sql/001_extensions_and_enums.sql`
  - `supabase/sql/002_core_profiles_roles_permissions.sql`
  - `supabase/sql/003_academic_taxonomy.sql`
  - `supabase/sql/004_content_questions_tests.sql`
  - `supabase/sql/005_attempts_daily_tasks_progress.sql`
  - `supabase/sql/006_leaderboards_analytics.sql`
  - `supabase/sql/007_subscriptions_payments_coupons.sql`
  - `supabase/sql/008_notifications_support_audit.sql`
  - `supabase/sql/009_storage_buckets_policies.sql`
  - `supabase/sql/010_rls_policies.sql`
  - `supabase/sql/011_indexes_constraints_functions_triggers.sql`
  - `supabase/sql/012_seed_initial_data.sql`
  - `supabase/sql/013_validation_queries.sql`
  - `supabase/sql/migrations/` — only if incremental changes are needed after canonical files exist (none expected at first)
  - `STATUS.md` — update the Database Change Tracking table before and after SQL work
- Risks:
  - Placing SQL outside `supabase/sql/` (must never go in `web-app/` or `admin-panel/`).
  - Running or authoring scripts out of numeric run order.
  - Storing binary files in PostgreSQL instead of metadata + Supabase Storage object paths.
  - Relying on data before RLS policies exist → cross-user data leakage.
  - Applying production DB changes without a migration script, or forgetting to backport an accepted migration into the canonical root file.
  - Exposing the Supabase service role key, or trusting client-submitted role/payment/score/subscription fields.
  - Writing destructive SQL without explicit human approval and rollback notes.
  - Scope creep into Web App / Admin Panel / payment / mobile feature code — Stage 2 is database-only.

## Confirmed Stage 0 Decisions

These decisions are confirmed and should not be re-litigated unless the human owner explicitly changes them.

- [x] Current implementation includes Web App, Admin Panel, and shared Supabase backend.
- [x] Mobile app is future-only.
- [x] React Native may be selected later for future mobile, but no mobile app implementation starts now.
- [x] SMS is excluded.
- [x] Optional bank transfer is excluded.
- [x] Stripe-first card payment architecture is used for planning.
- [x] Local payment providers are future/replaceable provider abstractions unless explicitly selected.
- [x] Supabase is used for Auth, PostgreSQL, Storage, RLS, and Edge Functions where needed.
- [x] Supabase Storage stores actual optimized images, small audio files, avatars, and media.
- [x] PostgreSQL stores file metadata and object paths only, not binary files.
- [x] Redis is optional and never source of truth.
- [x] Production database changes must be migration-script controlled.
- [x] Accepted migrations must be backported into canonical root SQL files.
- [x] Parent-only registration; children are created by a parent (no child self-registration).
- [x] Child login = 8-digit unique numeric ID + parent-created password (server-issued, collision-safe, unique; no child email login).
- [x] Parent-created children are auto-linked to the parent (no manual linking as the main flow).
- [x] Subscriptions are child-based and subject-based (Math/Science/Məntiq/İngilis dili); pricing is placeholder (1 AZN/subject), configurable via admin/config; weekly/monthly/yearly.
- [x] Launch ~1-month promo, then ongoing 7-day trial; failed charge auto-blocks all paid child access; real webhook-verified payment (never client-activated).
- [x] Automatic sibling discount (subscriptions only): 2nd 15%, 3rd+ 20%. No "Discount Settings" admin module.
- [x] Public marketing website in scope; News in scope (public + in-app, Admin-only CRUD).
- [x] Olimpiada Preparation is a separate paid add-on (parent-purchased, child-access) with lifetime access; 25 random server-side questions per attempt; users never choose difficulty.
- [x] Child dashboard wallpaper customization from a predefined set.
- [x] Domain name NOT confirmed (no purchase/email config this phase).
- [x] Content Managers must NOT manage News/Olympiad/payment/subscription modules (regular content only).

## Database Change Tracking

| Date | Change type | Migration file | Canonical root SQL file updated | Environment | Validation result | Backport status | Notes |
|---|---|---|---|---|---|---|---|
| 2026-06-27 | Initial canonical schema | None (foundation, not a migration) | `001`–`013` created | dev/staging (applied) | PASS — 12/12 `013` checks; `009` storage policies applied OK; authoritative-column hardening verified | N/A (these ARE the canonical files) | Full DB foundation applied in numeric order `001`–`012` (all PASS), then `013` validation 12/12 PASS on PostgreSQL 17.6 dev/staging via `OLIMPIADA_PROD_DB_URL` (never production; URL never printed). `009` `storage.objects` policies succeeded on this project (the ownership-warning fallback was not needed here). |
| 2026-06-27 | Migration (Stage 3) | `2026_06_27_001_auth_user_provisioning.sql` | Backported into `002` | dev/staging (applied) | PASS (trigger + function present) | completed | `handle_new_user()` + `on_auth_user_created` trigger on `auth.users` auto-create a base `profiles` row on signup (status pending; role/type set during onboarding). |
| 2026-06-27 | Migration (Stage 3) | `2026_06_27_002_role_privilege_baseline.sql` | Backported into `010` | dev/staging (applied) | PASS — RLS behavioral 14/14; `013` still 12/12; column hardening intact | completed | Behavioral testing exposed that `anon`/`authenticated` had no table privileges (Supabase default grants absent on from-zero rebuild), so RLS was unreachable. Migration grants baseline SELECT/INSERT/UPDATE/DELETE (+ default privileges) and re-asserts the authoritative-column hardening. |
| 2026-06-27 | Migration (Stage 6) | `2026_06_27_003_content_audit_triggers.sql` | Backported into `011` | dev/staging (applied) | PASS (triggers present; admin question-create RLS smoke test PASS) | completed | Append-only audit triggers on `questions`, `tests`, `daily_task_packages` (reuse `fn_audit_row`). Captures create/edit/archive/publish via before/after status. |
| 2026-06-27 | Migration (Stage 6) | `2026_06_27_004_question_primary_locale.sql` | Backported into `004` (column) + `011` (index) | dev/staging (applied) | PASS (column present) | completed | Adds `questions.primary_locale` (content_locale, default az) so questions are categorized by language (az/en/ru); content stored under the chosen locale. |
| 2026-06-27 | Migration (Stage 6) | `2026_06_27_005_tighten_content_child_rls.sql` | Backported into `010` | dev/staging (applied) | PASS — behavioral: CM cannot edit others' content / can edit own | completed | Ownership-scopes the 4 question child-table write policies (translations, options, option translations, explanations) to admin/reviewer/publisher or the parent question's creator. |
| 2026-06-27 | Migration (Stage 7 inc.1) | `2026_06_27_006_child_accounts.sql` | `001`/`002`/`003`/`009`/`010`/`011`/`012` | dev/staging (applied) | PASS — schema/RLS validation green; 8-digit generator smoke test PASS | **completed** (canonical backport done; `wallpapers.media_asset_id` FK correctly deferred to `011`) | Parent-created child accounts: students child fields + 8-digit `child_unique_id`; `child_unique_ids` registry + random collision-safe `allocate_child_unique_id()`; `child_credentials` (Supabase Auth mapping); `wallpapers` catalog + `child_wallpaper_selections` + `wallpaper-assets` bucket; RLS (parent manages own children, child manages own wallpaper, credentials/IDs admin/service-only); 6 solid-color wallpapers seeded. |
| 2026-06-27 | Migration (Stage 7 inc.2) | `2026_06_27_007_child_subscriptions_payments.sql` | `007`/`010`/`011`/`012` | dev/staging (applied) | PASS — 6 tables, payments linked, RLS 6/6, promo+pricing seeded | **completed** (canonical re-applied idempotently; `013` 12/12 PASS) | Child-based subject subscriptions: `subjects_pricing` (per-subject/interval, configurable), `launch_promo_config` (trial_days=7), `child_subscriptions` (parent-owned/paid; amounts/discount/status/trial service-role-written), `subscription_subjects`, `checkout_sessions` (provider-agnostic), `sibling_discounts` (audit); `payments` linked. RLS: owner/child read, writes admin/service only. Old `subscription_plans`/`subscriptions` left deprecated (not dropped). |
| 2026-06-28 | Canonical module (Stage 7 inc.3) | `014_news.sql` (new file) | — (self-contained) | dev/staging (applied) | PASS — 2 tables, RLS 2/2, 4 table policies, `news-media` bucket + 2 storage policies; `013` 12/12 PASS | n/a (canonical file is source of truth; no separate migration for a brand-new file) | News module: `news` (slug, `content_status`, cover via `media_assets`, created_by, published_at) + `news_translations` (az/en/ru) + `news-media` Storage bucket (public read, admin write) + indexes + updated_at/audit triggers + RLS (published news public; Admin-only CRUD, Content Managers excluded). |
| 2026-06-28 | Canonical module (Stage 7 inc.4) | `015_olympiad_preparation.sql` (new file) | — (self-contained) | dev/staging (applied) | PASS — 4 tables, RLS 4/4, 7 policies, `payments.olympiad_purchase_id` link, `olympiad-media` bucket + 2 storage policies, purchased-package FK = RESTRICT; `013` 12/12 PASS | n/a (canonical file is source of truth; no separate migration for a brand-new file) | Olympiad Preparation add-on: `olympiad_packages` (Admin-only listing; price/subject/grade/type, 25 q/attempt, catalog_status) + `olympiad_package_translations` (az/en/ru) + `olympiad_package_questions` (curated pool) + `olympiad_purchases` (parent buys → child LIFETIME; never-delete via on-delete-restrict; service/admin writes only) + `payments` link + `olympiad-media` bucket + RLS (active public, Admin-only CRUD). Attempt/result tables deferred to test/attempt engine (Stage 13/14). |
| 2026-06-28 | Validation extend + final rebuild (Stage 7 close) | `013_validation_queries.sql` | `013` | dev/staging (non-destructive rebuild, rolled back) | PASS — from-zero rebuild applied `001`→`012`,`014`,`015` in order with zero errors; extended `013` = 16/16 PASS; post-rollback dev intact (16/16 PASS) | n/a (read-only validation file) | Extended `013` with Stage-7 checks: #13 child accounts, #14 subscriptions/payments + 3 `payments` link cols, #15 News + bucket, #16 Olympiad + bucket + purchased-package RESTRICT FK; added `child_access_status` (enum #4), `allocate_child_unique_id` (function #5), and 3 new buckets (#11, now 8). Confirms canonical set reproduces full schema from zero. |
| 2026-06-28 | Migration (Stage 8 inc.1) | `2026_06_28_008_child_account_provisioning.sql` | `002`/`010`/`011`/`013` | dev/staging (applied) | PASS — smoke test PASS (atomic provision + lockout + dup-guard); from-zero rebuild + extended `013` = **17/17 PASS** | **completed** (canonical 002/010/011/013; extended `013` #17 added) | Atomic `create_child_account()` SECURITY DEFINER RPC (service_role EXECUTE only — anon/authenticated explicitly revoked vs Supabase default privileges; promotes auto-created profile → active child, inserts student/role/credentials/active link, allocates 8-digit ID, validates parent, dup-guard) + `child_login_attempts` lockout table (admin-read RLS, service-role writes) + `is_child_login_locked()` / `record_child_login_attempt()` helpers (≥8 fails / 15 min). Fixed pre-commit: OUT-column name collision; and execute-privilege leak (Supabase ALTER DEFAULT PRIVILEGES grants execute to anon/authenticated → revoked explicitly). |
| 2026-06-28 | Migration (Admin bulk question import — inc.1 DB) | `2026_06_28_009_bulk_question_import.sql` | `004`/`010`/`011`/`013` | dev/staging (applied) | PASS — smoke test PASS (2-item batch → 1 ok / 1 reported-error; per-item atomic; topic/subtopic/source auto-create; forbidden path raises) + from-zero rebuild **18/18 PASS** | **completed** (canonical 004/010/011/013; `013` #18 added) | Ported UniPrep bulk-action **architecture** natively onto our normalized trilingual schema: atomic per-item `bulk_insert_questions(jsonb, text)` SECURITY DEFINER RPC (internal `content.create`/`is_admin` check; `created_by` from session, not trusted from input; resolves taxonomy by code/level + auto-creates topic/subtopic/source; inserts across questions/translations/options/option-translations/explanations in az/en/ru; per-item `BEGIN..EXCEPTION` so bad rows are skipped + reported; **not anon-executable** — no service-role needed) + `question_imports` history table (importer/admin-read RLS). Fixed pre-commit: `content_locale` enum casts on locale columns. |
| 2026-06-29 | Migration (Cities/Schools/Grade Promotion + structured Add-Child) | `2026_06_29_017_cities_schools_grade_promotion.sql` | `002`/`003`/`011`/`012`/`013` | dev/staging (NOT yet applied — human to run) | pending human validation (expect `013` 25/25 PASS) | **completed** (canonical 002/003/011/012/013 backported) | Repurposed `districts` as the admin-managed CITY entity (no parallel `cities` table — would duplicate `schools.district_id`); seeded 15 AZ cities. Made `schools.district_id` MANDATORY (NOT NULL, FK ON DELETE RESTRICT); seeded 2 sample Bakı schools. Added `students.graduated` (bool, default false) + `advance_student_grades()` SECURITY DEFINER RPC (service_role only; level<11 → next grade, level 11 → graduated; returns jsonb {promoted, graduated}; intended Sept 1 via pg_cron — schedule SQL in comment, pg_cron NOT assumed enabled). Extended `create_child_account` to a 10-param signature (appended optional `p_district_id`, `p_school_id`; stores structured city/school on students alongside free-text display fields; FK targets validated when provided, never raises on null; existing 8-arg caller still type-matches via defaults). Extended `013` with #24 (graduated col + advance fn + city seed + schools.district_id NOT NULL) and #25 (advance fn service-role-only). |
| 2026-08-04 | Migration (privacy metadata) | `2026_08_04_097_privacy_policy_settings.sql` | `011` (get_mobile_config) / `012` (seed) / `013` (checks 57 + new 57b) | dev/staging (applied) | PASS — proved in a rolled-back tx incl. a second in-tx run to verify idempotency; from-zero canonical rebuild **88/88 PASS**; live dev 0 FAIL | **completed** | Moves the 8 privacy-policy facts the code cannot derive into `system_settings` under `privacy.*` (admin `/settings` → Privacy); the compiled-in constants in `{web-app,mobile-app}/src/lib/privacyPolicy.ts` stay as the offline/first-paint FALLBACK and a non-empty admin value wins. `get_mobile_config()` gains a `privacy` block, patched from its OWN live `pg_get_functiondef` via one anchored insert (house idiom — retyping 120 lines is how migration 091s payment-mode fix gets silently reverted). `push_live`/`payments_live` are DERIVED there from the `notifications_push` flag and the payment mode, never stored, so a regulator-facing claim cannot contradict the switch it describes; `payments_live` is `real` ONLY because demo/giveaway move no money. Effective date + last updated seeded to 04.08.2026, removing the draft banner. |

## Completed Work

| Date | Stage | Task | Files changed | Tests run | Notes |
|---|---|---|---|---|---|
| Initial package | Stage 0 | Planning package and confirmed decisions prepared | Markdown planning files only | Not applicable | Ready for first Claude Code coding session. |
| 2026-06-27 | Stage 1 | Repository structure and tracking verification | `STATUS.md` | Directory/file inventory only (no build/test suite exists yet) | All required Stage 1 folders, planning docs, and 5 `CLAUDE.md` files verified present. `CODING_AGENT_PROMPTS.md` confirmed Claude Code-only. SQL files `001`-`013` intentionally absent (Stage 2 deliverables). |
| 2026-06-27 | Stage 1 | Git baseline setup | `.gitignore` (new), `STATUS.md` | `git check-ignore` verification of ignore patterns; `git status` review | Git initialized on `main` branch only (no stage branches). Professional `.gitignore` covers secrets/`.env`/`.env.local`, `node_modules`, build outputs (`.next`, `out`, `dist`, `.vercel`), Supabase temp files, OS files, editor junk, and `.claude/settings.local.json`; `.env.example` templates remain trackable. Baseline committed (`2da8a13`) and pushed to `origin/main`; local and remote in sync. No feature/SQL files created. |
| 2026-06-27 | Stage 1 | Manual verification passed + cleanups | `docs/decisions/.gitkeep` (new), `STATUS.md` | `git log`/`git status`/`git rev-parse` sync checks; remote vs local compare | Human manually verified the Git baseline, confirmed initial commit, and confirmed push to GitHub `main` with local/remote in sync. Added `docs/decisions/.gitkeep` so the empty decisions folder is tracked. Updated stale STATUS.md lines to reflect committed/pushed baseline. Stage 1 marked manually passed. Stage 2 not started. |
| 2026-06-27 | Stage 2 | Supabase SQL foundation `001`–`013` | `supabase/sql/001`–`013` (13 new), `STATUS.md` | Static checks only: dollar-quote parity (all even), no SQL outside `supabase/sql/`, file inventory. NOT executed against any DB. | Canonical full-schema foundation (~2,380 lines) covering ~52 tables, enums, RBAC helper functions, RLS on all tables, storage buckets/policies, indexes, updated_at + audit triggers, idempotent seeds, and read-only validation queries. Design choice: security helper functions placed in `002` (not `011`) so `010` RLS is runnable in numeric order; forward-reference FKs deferred to `011`. Pending self-review + human staging apply. |
| 2026-06-27 | Stage 2 | Resume verification (Prompt 2) | None (no code change) | Re-confirmed all 13 `supabase/sql/0*.sql` present; `git status` shows them untracked. | Resumed active stage; Stage 2 coding deliverables were already complete, so no SQL was rewritten. No new files created. Remaining Stage 2 work is human staging apply + `013` validation. Recommended next: Prompt 3 (self-review). |
| 2026-06-27 | Stage 2 | Self-review fix: authoritative-column hardening (backported into canonical `010`) | `supabase/sql/010_rls_policies.sql`, `supabase/sql/009_storage_buckets_policies.sql`, `CODING_AGENT_PROMPTS.md`, `STATUS.md` | Static: `010` dollar-quote parity OK; REVOKE/GRANT statements reviewed; column names verified against `005`. Not executed against a DB. | Column-level GRANT/REVOKE added to `010` so `authenticated`/`anon` cannot write `test_attempts.{score,max_score,status,submitted_at,graded_at}`, `test_attempt_answers.{is_correct,points_awarded}`, `student_daily_task_progress.{status,score,completed_at}`; learners keep only safe columns (start attempt / record answer / begin task); authoritative writes are service_role/RPC-only. `009` gained a VALIDATION WARNING about `storage.objects` policy ownership + dashboard fallback. This change is canonical (lives directly in `010`); no separate migration since not yet applied to any environment. |
| 2026-06-27 | Workflow | Workflow-control rules (no app/SQL change) | `CLAUDE.md`, `CODING_AGENT_PROMPTS.md`, `STATUS.md` | Doc edits only; no commands/tests. | Added a permanent "Workflow Control" rule to root `CLAUDE.md` (STATUS = source of truth; auto-apply DB rules for SQL/RLS/storage stages; always end with `Human Next Actions`). Prompt 2 now explicitly requires the `Human Next Actions` output and already auto-detects database work. Goal: Prompt 2 alone is sufficient to run a normal stage without manually pasting Prompt 8 or tracking next steps. |
| 2026-06-27 | Workflow + Security | Automated DB validation + secret-handling rules (no app/SQL change) | `CLAUDE.md`, `CODING_AGENT_PROMPTS.md`, `STATUS.md` | Doc edits only; no DB run performed in this task. | DECISION: for SQL/database stages Claude Code automatically runs the stage SQL + validation against the **dev/staging** DB using the `OLIMPIADA_PROD_DB_URL` shell env var (never production), fixes failures in-scope, and reruns — instead of asking the human to run every file by hand. Stage 2 `001`–`013` validation should be automated this way on the next database turn (provided `OLIMPIADA_PROD_DB_URL` and `psql` are present). SECURITY: secrets (`OLIMPIADA_PROD_DB_URL`, DB passwords, service role key, API keys) must NEVER be printed, echoed, saved, logged, committed, or written into `.env`/markdown/`STATUS.md`/Git. Human role kept minimal (manual UI testing when apps exist, report bugs, commit/push with provided message, check Vercel later). |
| 2026-06-27 | Docs | Developer setup guide added (no app/SQL change) | `docs/DEVELOPER_SETUP.md` (new), `CLAUDE.md`, `STATUS.md` | Doc only; no commands/tests. | Added concise new-machine setup guide (Windows + VS Code + Claude Code): required tools, GitHub SSH alias `github.com-olimpiada`, clone, repo-local Git identity, dev/staging `OLIMPIADA_PROD_DB_URL` env var (placeholder only, verify-without-printing), `psql` check, daily start, commit/push, security warnings, troubleshooting. Placeholders only — no real secrets. `CLAUDE.md` now points to `docs/DEVELOPER_SETUP.md`. |
| 2026-06-27 | Stage 2 | Auto-apply + validate SQL on dev/staging (Prompt 2) | None (validation run; no file changes) | `psql` (full path) applied `001`–`012` (all PASS) + `013` validation (12/12 PASS) against `OLIMPIADA_PROD_DB_URL`; verified column-privilege hardening on attempt/progress tables. Secrets never printed; production untouched. | Stage 2 schema is live and validated on dev/staging (PostgreSQL 17.6). All Supabase prerequisites present (auth/storage/roles). `009` storage policies applied without ownership error. Ready to close pending human commit/push. |
| 2026-06-27 | Stage 2 | Stage 2 MANUALLY PASSED (Prompt 6) | `STATUS.md` | Validation re-confirmed: `013` 12/12 PASS on dev/staging; authoritative-column hardening verified. | Stage 2 closed and marked manually passed. Schema rebuildable from canonical `001`–`013` in numeric order. Limitations carried forward: `answer_options.is_correct` column-hiding + explanation gating (Stage 6 service/view/RPC); optional multi-session RLS spot-check before production. Next: human commit/push, then Stage 3 (Auth/RBAC/RLS) via Prompt 2/7. |
| 2026-06-27 | Stage 3 | Auth/RBAC/RLS implemented + validated on dev/staging (Prompt 2) | `supabase/sql/002` (+trigger), `supabase/sql/010` (+baseline grants), `migrations/2026_06_27_001`, `migrations/2026_06_27_002`, `supabase/sql/tests/rls_behavioral_tests.sql` | Applied both migrations on dev/staging; ran RLS behavioral suite (14/14 PASS): student A≠B isolation, parent linked-only, content-manager denied payments/audit/settings, admin reads + audit immutability, anon blocked. `013` still 12/12; column hardening intact. | Stage 3 "Done When" criteria proven live. Found+fixed a real gap (missing baseline role grants → RLS unreachable). Profiles auto-provision on signup. Production untouched; secrets never printed. |
| 2026-06-27 | Stage 3 | Stage 3 MANUALLY PASSED (Prompt 6) | `STATUS.md` | Re-confirmed on dev/staging: RLS behavioral 14/14 PASS, `013` 12/12 PASS, authoritative-column hardening intact. | Stage 3 closed and marked passed. Both migrations backported into canonical `002`/`010` (schema rebuildable from zero). Carry-forward: bootstrap first admin account; `answer_options.is_correct`/explanation gating (Stage 6); optional admin MFA + rate limiting before production. Next: human commit/push, then Stage 4 (App skeletons) via Prompt 2. |
| 2026-06-27 | Stage 4 | App skeletons for `web-app/` + `admin-panel/` (Prompt 2) | `web-app/**` (18 files), `admin-panel/**` (18 files), `STATUS.md` | Both apps: `npm install` (316 pkgs each), `npm run typecheck` PASS, `npm run build` PASS (5 static routes each). | Separate Next.js 15 App Router + TS skeletons sharing the root Supabase backend. Safe Supabase clients (browser/server via `@supabase/ssr`, anon key only — service role never exposed; admin service-role key left commented server-only for later). Session-refresh middleware, `.env.local.example` templates, base layout + loading/error/not-found/unauthorized states. No business logic. web-app=3000, admin-panel=3001. node_modules/.next git-ignored; env examples tracked. Connect-to-Supabase test needs human `.env.local`. |
| 2026-06-27 | Stage 4 | Design pass: simplistic web-app, professional admin shell | `web-app/src/app/globals.css`, `admin-panel/src/app/globals.css` + `layout.tsx` + 5 page/state files | Both apps typecheck + build PASS after redesign. | Per design direction: `web-app` kept minimal/neutral (easy to restyle when the investor-approved Claude Design lands); `admin-panel` given a professional shell (dark sidebar with planned sections marked "soon", topbar, dashboard cards, pills/buttons, responsive). Still no business logic/fake data. (Direction saved to memory: `ui-design-direction` and to `CLAUDE.md` → "UI / Design Direction".) |
| 2026-06-27 | Stage 4 | Stage 4 closed (advanced via Prompt 2) | `STATUS.md` | typecheck + build PASS for both apps (prior). | Stage 4 marked complete; proceeded to Stage 5. |
| 2026-06-27 | Stage 5+ | Fix: empty Users list + admin role scoping | `admin-panel/src/app/(protected)/users/page.tsx`, `admin-panel/src/lib/admin/guards.ts` | typecheck + build PASS; confirmed DB has 1 admin + 1 content_manager. | Users list was empty because `profile_roles` has two FKs to `profiles` (`profile_id`, `assigned_by`) → ambiguous PostgREST embed returned nothing. Rewrote the query without embeds (explicit role→profile_roles→profiles lookups). Also fixed `getAuthContext` to scope `profile_roles` to the current profile (an admin's RLS returned all rows, polluting roleCodes/permissions). |
| 2026-06-27 | Stage 5+ | Admin user management + trilingual UI (az/en/ru) | `admin-panel`: `lib/supabase/admin.ts` (server-only service client), `lib/admin/users.ts`, `components/CreateUserForm.tsx`, `(protected)/users/page.tsx`, `i18n/*` + `components/{LanguageSwitcher,LoginForm}.tsx` + localized pages/components; `web-app`: `i18n/*` + `components/LanguageSwitcher.tsx` + localized pages/states; `CLAUDE.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, memory | Both apps: typecheck + build PASS (admin 8 routes incl `/users`). Not browser-tested. | Admins can create Administrator/Content Manager accounts from `/users` (least privilege: admin-guarded, fixed role allowlist, service-role client only after the check; needs `SUPABASE_SERVICE_ROLE_KEY` in `admin-panel/.env.local`, server-only). Trilingual UI rule recorded (CLAUDE.md + plan + memory); current strings translated az(default)/en/ru with cookie-based locale + `LanguageSwitcher` in both apps. |
| 2026-06-27 | Stage 5 | Admin auth + taxonomy/config CRUD (Prompt 2) | `admin-panel/src/lib/admin/*` (guards, resources, nav, actions), `admin-panel/src/components/*` (Sidebar, SignOutButton, ResourceForm, DeleteButton), `admin-panel/src/app/*` (root layout/page, login, `(protected)` layout+dashboard, `manage/[resource]` list+edit, state pages), `admin-panel/src/app/globals.css`, `CLAUDE.md`, `STATUS.md` | `npm run typecheck` PASS; `npm run build` PASS (7 routes). Not yet browser-tested (needs admin login). | Admin login/logout via Supabase Auth; `(protected)` layout enforces `requirePanelAccess` (admin or content manager) server-side; admin-only routes via `requireAdmin`. Permission-aware sidebar (CM sees only Dashboard). Allowlisted resource engine drives CRUD for grades/subjects/topics/subtopics/difficulty-levels/question-types/olympiad-types (only registry tables+columns written; RLS is the final gate). No new SQL (taxonomy + RLS already exist). Routes use a generic `/manage/[resource]` instead of the doc's per-entity paths (cleaner/DRY). |
| 2026-06-27 | Stage 6 | Question management increment 1 (Prompt 2) | `admin-panel`: `lib/admin/{questions,question-options}.ts`, `components/{QuestionForm,QuestionLifecycle,DeleteQuestionButton}.tsx`, `app/(protected)/questions/{page,new/page,[id]/edit/page}.tsx`, `nav.ts`, `(protected)/layout.tsx`, `i18n/{messages,server}.ts`, `globals.css`; `supabase/sql/migrations/2026_06_27_003_*` + `011`; `STATUS.md` | typecheck + build PASS (admin 11 routes); migration applied on dev/staging; admin question-create RLS smoke test PASS. | Question list/create/edit (metadata + az body/prompt + dynamic answer options w/ correctness + az explanation), content lifecycle with role rules (CM submits; admin approves/publishes — least privilege), content audit triggers. Atomic-ish save (compensating delete on failure). Questions visible to admin + content managers (permission `content.create`). Deferred: media upload + ru/en content fields. Known follow-up: tighten content child-table RLS to ownership (logged in Open Blockers). |
| 2026-06-27 | Stage 6 | UX/schema fixes + media upload (part 2) | `admin-panel`: `lib/admin/{media.ts,questions.ts,question-options.ts}`, `components/{QuestionForm,QuestionMediaUploader}.tsx`, `app/(protected)/questions/{page,new,[id]/edit}`, `i18n/messages.ts`, `globals.css`; `supabase/sql/migrations/2026_06_27_004_*` + `004`/`011`; `STATUS.md` | typecheck + build PASS; migration `004` applied on dev/staging; `question-media` bucket public + 2 storage policies confirmed. | Fixes: controlled form fields (persist on validation error); per-question language `primary_locale` (content stored under chosen locale; language column in list); question type/difficulty/olympiad labels translated by code. Media: browser uploads image/audio to `question-media`, server action records `media_assets` (metadata only) + links to the question's translation; 5 MB/MIME validation; preview + remove; replacing media cleans up the old object. |
| 2026-06-27 | Stage 6 | Fix: media upload `crypto.randomUUID` + child-table RLS tightening | `admin-panel/src/components/QuestionMediaUploader.tsx`, `supabase/sql/migrations/2026_06_27_005_*` + `010`, `STATUS.md` | typecheck + build PASS; behavioral RLS test PASS (CM denied others' content, allowed own). | `crypto.randomUUID()` only exists in secure contexts (https/localhost); failed over a LAN IP. Replaced with a `uniqueId()` fallback. Also tightened content child-table write RLS to parent-question ownership (migration `005` → `010`). |
| 2026-06-27 | Stage 6 | Stage 6 MANUALLY PASSED | `STATUS.md` | Human browser test: image upload OK, persistent preview, removable, storage object + `media_assets` row confirmed. | Stage 6 closed and marked passed. Stages 1–6 complete. HOLD before Stage 7 pending the owner's incoming architectural-change prompt (next session). |
| 2026-06-27 | Planning | Business-model documentation re-plan (docs only) | ~28 Markdown files: `CLAUDE.md`, `STATUS.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, `IMPLEMENTATION_PRIORITY_SUMMARY.md`, `CODING_AGENT_PROMPTS.md`, `docs/master/00`–`07`, `supabase/CLAUDE.md`+`README_RUN_ORDER`+3 markdowns, `web-app/CLAUDE.md`+4 markdowns, `admin-panel/CLAUDE.md`+5 markdowns, `mobile-app/CLAUDE.md`+`FUTURE_MOBILE_READINESS` | Doc edits only (control files by me; master/app/supabase/mobile by 8 parallel subagents from a shared canonical spec). No app code/SQL/secrets/domain. Contradiction grep planned. | Wrote the confirmed business model across the whole planning package: parent-only registration; parent-created children + 8-digit child login; child-based subject subscriptions + launch promo + 7-day trial + automatic sibling discount; real webhook-verified payment; public website; News; Olimpiada Preparation paid module (lifetime access, 25 random questions, no user difficulty); wallpaper. Removed old contradictions (student self-registration/email login, user-selected difficulty, parent-level paid account, olympiad deletion-after-expiry, manual linking as main flow, discount-settings module). Revised forward roadmap added (Stages 7–15). |
| 2026-06-27 | Planning | Confirmed child-auth/ID/pricing decisions (docs only) | `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md` (new ADR); 6→8-digit sweep across ~28 `.md`; `docs/master/02`+`03` credential strategy; `docs/master/06` proration; `STATUS.md`, `CLAUDE.md`, `CODING_AGENT_PROMPTS.md`, `IMPLEMENTATION_EXECUTION_PLAN.md`, `IMPLEMENTATION_PRIORITY_SUMMARY.md` updated via sweep | Doc edits only; no app code/SQL/secrets. | Owner approved ("yes to all"): child ID = **8 digits** (random, server-side, unique, ~100M); child = real Supabase Auth user + synthetic `c<8digits>@children.invalid` email + parent password + server-side login + rate-limit/lockout (no hand-rolled auth); add-subjects-later = next-cycle pricing; payments provider-agnostic (real provider deferred to Stage 11). Open-blocker rows for credential strategy + proration marked RESOLVED. |

## Open Blockers / Questions

| Blocker | Area | Needed decision |
|---|---|---|
| Payment provider final production choice | Payments | Stripe-first is planned; local providers are future placeholders unless explicitly selected. |
| Final UI/UX approval | Frontend | Not a blocker; build clean component-ready UI first. |
| Future mobile framework | Mobile | Mobile is future-only. React Native can be selected later if preferred. |
| `answer_options.is_correct` must be hidden from students before result; `question_explanations` gated to after result | Security / Content (Stage 2→6) | RLS is row-level, not column-level. Enforce via service layer / SECURITY DEFINER RPC / public view that omits `is_correct`. Not a Stage 2 blocker; required before students consume content. |
| RESOLVED (2026-06-27): Stage 2 SQL applied + validated on dev/staging | Database | Auto-applied `001`–`012` and ran `013` (12/12 PASS) via `OLIMPIADA_PROD_DB_URL` on PostgreSQL 17.6 dev/staging (psql called by full path; URL never printed; production untouched). SECURITY DEFINER helpers worked (no recursion). Remaining: optional multi-session RLS spot-check before production. |
| RESOLVED (2026-06-27): authoritative-column writes hardened in Stage 2 | Security | Fixed in `010` via column-level GRANT/REVOKE: `authenticated`/`anon` can no longer write grading/progress authoritative columns; those are service_role/RPC-only. Confirm with a session test on staging that a learner cannot UPDATE `score`/`is_correct`/`status`. |
| RESOLVED on dev/staging (2026-06-27): `009` storage policies applied successfully | Database (Supabase env) | On this dev/staging project `009` applied without the `storage.objects` ownership error, so the dashboard fallback was not needed. Keep the warning in the `009` header in case a future target project (or production) lacks the privilege. |
| RESOLVED (2026-06-27): content child-table write RLS now ownership-scoped | Security | Migration `2026_06_27_005_tighten_content_child_rls.sql` (→ backported `010`) scopes `question_translations`/`answer_options`/`answer_option_translations`/`question_explanations` writes to admins, reviewers/publishers, or the parent question's creator. Behavioral test PASS: a content manager cannot edit another author's question content, can edit their own. |
| RESOLVED (2026-06-27): child credential strategy + ID size | Auth (Stage 7/8) | Confirmed (`docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`): child ID is **8 digits** (random, server-side, unique, ~100M space); a child is a **real Supabase Auth user** with a synthetic `c<8digits>@children.invalid` email + parent-set password; **server-side** login maps ID→email→`signInWithPassword`; rate-limiting/lockout; parent resets via service role; password stored only by Supabase Auth. |
| RESOLVED (2026-06-27): add-subjects-later pricing | Payments | Confirmed: **next-cycle pricing** — adding a subject grants immediate access; new total applies at next renewal (no mid-cycle proration math in MVP; backend-controlled; switchable to provider proration later). |
| OPEN (decide before Stage 11): final pricing + payment provider | Payments | Posture confirmed **provider-agnostic** — pricing/plans live in our DB; real provider integration deferred to Stage 11 (Stripe is a planning example only). Decide final prices + the actual provider (Stripe or local AZ provider) before Stage 11. No keys/domain now. |

## Stage Checklist

### Stage 0 — Final Human Confirmation

- [x] Current scope confirmed
- [x] No SMS confirmed
- [x] No optional bank transfer confirmed
- [x] Mobile future-only confirmed
- [x] Supabase + Vercel confirmed
- [x] Supabase Storage for files confirmed
- [x] Production database migration discipline confirmed

### Stage 1 — Repository Setup and Tracking

- [x] Root structure verified/created (all required folders and files present)
- [x] `CLAUDE.md` files verified (root, `supabase/`, `web-app/`, `admin-panel/`, `mobile-app/`)
- [x] `CODING_AGENT_PROMPTS.md` reviewed (confirmed Claude Code-only)
- [x] `STATUS.md` updated by Claude Code at session start
- [x] Implementation plan reviewed
- [x] Git initialized on `main` branch (no stage branches)
- [x] `.gitignore` created/verified (secrets, `.env`/`.env.local`, `node_modules`, build outputs, Supabase temp files, OS files, editor junk, local Claude settings)
- [x] Stage 1 fully ready for human manual verification
- [x] Stage 1 MANUALLY PASSED (2026-06-27) — baseline verified, committed (`2da8a13`), and pushed to `origin/main`
- [x] `docs/decisions/.gitkeep` added so the empty decisions folder is preserved in Git
- [x] Stage 2 recommended only after Stage 1 is complete (recommended; awaiting human approval)

### Stage 2 — Supabase SQL Planning and Foundation

Legend: [x] = file authored in repository. Staging application + validation are still pending (see Database Change Tracking).

- [x] `001_extensions_and_enums.sql` (authored; not yet applied)
- [x] `002_core_profiles_roles_permissions.sql` (authored; not yet applied)
- [x] `003_academic_taxonomy.sql` (authored; not yet applied)
- [x] `004_content_questions_tests.sql` (authored; not yet applied)
- [x] `005_attempts_daily_tasks_progress.sql` (authored; not yet applied)
- [x] `006_leaderboards_analytics.sql` (authored; not yet applied)
- [x] `007_subscriptions_payments_coupons.sql` (authored; not yet applied)
- [x] `008_notifications_support_audit.sql` (authored; not yet applied)
- [x] `009_storage_buckets_policies.sql` (authored; not yet applied)
- [x] `010_rls_policies.sql` (authored; not yet applied)
- [x] `011_indexes_constraints_functions_triggers.sql` (authored; not yet applied)
- [x] `012_seed_initial_data.sql` (authored; not yet applied)
- [x] `013_validation_queries.sql` (authored; not yet applied)
- [x] Self-review fix: authoritative grading/progress columns hardened in `010` (service-role/RPC-only)
- [x] Applied to dev/staging Supabase in numeric order (`001`–`012`, all PASS)
- [x] `013` validation queries run on dev/staging (12/12 PASS)
- [x] Authoritative-column hardening verified live (authenticated has only safe column grants)
- [ ] Multi-session RLS spot-check (student A vs B, parent linked/unlinked, content manager) — recommended before production

### Stage 3 — Auth/RBAC/RLS  (COMPLETE / MANUALLY PASSED on dev/staging 2026-06-27)

- [x] Profiles implemented (+ auto-provision trigger on Auth signup)
- [x] Roles implemented (4 system roles seeded)
- [x] Permissions implemented (18 permissions; admin=all; content-manager least-privilege)
- [x] Parent-student linking implemented (active-link RLS enforced)
- [x] Account statuses + audit-logging foundation
- [x] Baseline role grants added so RLS is reachable (gap found via behavioral testing)
- [x] RLS validated — behavioral suite 14/14 PASS (student isolation, parent linked-only, content-manager denial, admin auditability + audit immutability, anon blocked)
- [ ] (Optional, pre-production) MFA for admin + rate-limiting per `03_AUTH` — future hardening, not blocking

### Stage 4 — App Skeletons  (IMPLEMENTED + locally validated 2026-06-27)

- [x] `web-app/` skeleton (Next.js 15 App Router + TS; build PASS)
- [x] `admin-panel/` skeleton (separate app, port 3001; build PASS)
- [x] Supabase clients configured safely (browser/server, anon key only; no service role exposure)
- [x] Session-refresh middleware + base states (loading/error/not-found/unauthorized)
- [x] Environment variables documented (`.env.local.example` per app)
- [x] typecheck + production build PASS for both apps
- [ ] (Human) `npm install && npm run dev` per app with real `.env.local` → confirm both connect to Supabase dev

### Stage 5 — Admin Content Taxonomy  (IMPLEMENTED + locally validated 2026-06-27)

- [x] Admin login/logout (Supabase Auth) + `(protected)` layout with server-side guards
- [x] Permission-aware sidebar (admin sees taxonomy/config; Content Manager sees only Dashboard)
- [x] Grades CRUD
- [x] Subjects CRUD
- [x] Topics/subtopics CRUD
- [x] Difficulty levels / Question types / Olympiad types CRUD
- [x] Content Manager restricted (admin-only `/manage/*` via `requireAdmin`; RLS backstop)
- [x] typecheck + build PASS
- [ ] (Human) browser test: log in as admin, create/edit/delete taxonomy; confirm a Content Manager cannot reach `/manage/*`

### Stage 6 — Question Bank  (increment 1 IMPLEMENTED + locally validated 2026-06-27)

- [x] Question CRUD (list/new/edit; taxonomy metadata + az body/prompt)
- [x] Answer options (dynamic add/remove, correctness flag, az text)
- [x] Explanations (az, optional)
- [x] Content lifecycle (draft→in_review→approved→published→archived/rejected) with role rules (CM submits; admin approves/publishes; least privilege)
- [x] Audit logging (content audit triggers; migration `003` → `011`)
- [x] Trilingual UI (az/en/ru); typecheck + build PASS; admin create-path RLS smoke test PASS
- [x] Per-question language (`primary_locale` az/en/ru) — content stored under chosen locale; language column in list
- [x] UX fixes: form fields now controlled (persist on validation error); question type/difficulty/olympiad labels translated by code
- [x] Supabase Storage media upload (question-media image/audio → media_assets metadata + linked to translation; PG stores metadata only; 5 MB/MIME validated; preview + remove)
- [ ] Multi-locale translations of the SAME question (one question = one language for now) (future)
- [x] (Human) browser test PASSED: question create + non-az language + image upload (preview persists, removable, storage object/row confirmed) + lifecycle + CM least-privilege

### Stage 7 — Test and Daily Task Engine

- [ ] Test packages
- [ ] Daily task packages
- [ ] Attempts
- [ ] Answer submission
- [ ] Auto-grading
- [ ] Retry rules

### Stage 8 — Student Web App

- [ ] Student dashboard
- [ ] Daily task page
- [ ] Test solving page
- [ ] Result page
- [ ] Mistakes review

### Stage 9 — Parent Web App

- [ ] Parent dashboard
- [ ] Link student flow
- [ ] Student progress reports
- [ ] Parent notifications

### Stage 10 — Payments and Subscriptions

- [ ] Plans
- [ ] Checkout
- [ ] Webhooks
- [ ] Subscription activation
- [ ] Gating
- [ ] Admin monitoring

### Stage 11 — Progress, Analytics, Notifications

- [ ] Progress snapshots
- [ ] Strong/weak topics
- [ ] Admin analytics
- [ ] In-app notifications
- [ ] Email abstraction

### Stage 12 — Leaderboard

- [ ] Leaderboard snapshots
- [ ] Ranking categories
- [ ] Anti-manipulation rules
- [ ] Admin review tools

### Stage 13 — QA, Security, Deployment

- [ ] Unit tests
- [ ] Integration tests
- [ ] RLS tests
- [ ] RBAC tests
- [ ] Payment tests
- [ ] E2E tests
- [ ] Deployment checklist

### Stage 14 — Future Mobile Readiness

- [ ] No mobile implementation started
- [ ] Future-readiness docs maintained

## Next Recommended Task

- Planning re-plan COMPLETE (docs only). Next implementation = **revised Stage 7 — Business-Model Database Foundation** (see `IMPLEMENTATION_EXECUTION_PLAN.md` → "Revised Forward Roadmap"): migrations + new canonical SQL for parent/child accounts (8-digit ID + credentials), per-child subjects, wallpapers, child-based subscriptions + payments + trial/promo + sibling-discount fields, News (`014`), Olympiad Preparation (`015`), storage buckets, RLS, helpers, seeds, validation. Begin only on approval (Prompt 2).
- Key design decisions are now CONFIRMED (2026-06-27, `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`): 8-digit random child ID; child = Supabase Auth user + synthetic `.invalid` email + parent password + server-side login + rate-limit/lockout; add-subjects-later = next-cycle pricing; provider-agnostic payments (real provider deferred to Stage 11). Remaining (decide before Stage 11): final prices + actual payment provider.
- Carry-forward (Child/web-app stages): hide `answer_options.is_correct` from children before result + explanation gating (service/view/RPC, not RLS); content child-table RLS already ownership-scoped.
- Carry-forward (web-app, Stage 7/8): hide `answer_options.is_correct` from students before result + explanation gating (service/view/RPC, not RLS).
- Optional pre-production hardening: admin MFA + rate limiting per `03_AUTH`.

---

## CHANGE REQUESTS — Investor Review Round 2 (2026-06-28) — ACTIVE GOAL (burn down this list)

Source: owner review. Work through top-to-bottom in batches; validate (typecheck/build/DB) per batch; check items off here.

### Batch A — Quick corrections / i18n
- [x] A1 Add-Child "Soyad" — already correct in code (`parent.child.last` = Soyad/Last name/Фамилия); no stray hardcoded "Soyben". (was a stale build)
- [x] A2 Children button → **"Yeni övlad əlavə et"** (az/en/ru). *(navigation rebuilt in Batch H flow rewrite)*
- [x] A3 Status text **Active/Inactive → Public/Private** (admin `STATUS_OPTIONS` + i18n `status.*` az/en/ru).
- [x] A4 News **slug optional** — auto-generated from az title (az-aware slugify); removed required input.
- [x] A5 **Content i18n fallback to az** — VERIFIED already implemented everywhere content translations are fetched: news list + detail and both olympiad pages all use `find(locale) ?? find("az")`; UI strings fall back via `getT` (`dict[k] ?? az[k] ?? k`). Subjects have a single `name` (no translation). Question content is served by RPCs. No new work needed.

### Batch B — Remove difficulty + remove "code"
- [x] B1 **Difficulty FULLY removed** — question form/save, nav + `difficulty-levels` resource, bulk template/panel/edit defaults, AND `bulk_insert_questions` RPC (migration `015` sets `difficulty_id` null; backported to `011`). Column kept nullable (non-destructive).
- [x] B2 **Code removed (no manual codes anywhere)** — manage resources (subjects/question-types/olympiad-types) auto-generate `code` from `name` (`actions.ts` `slugifyCode`); **bulk import now resolves subject/type/olympiad BY NAME** (migration `2026_06_28_015_bulk_import_by_name`, backported to `011`, dev smoke PASS, `013` 22/22); import template + reference panel switched to names. REMAINING for B2: olympiad-package `code` input → auto (Batch D1).

### Batch C — News — DONE (both builds PASS)
- [x] C1 News **cover-image upload** (admin edit → `news-media` → `media_assets` → `news.cover_media_id`; `attachNewsCover`/`detachNewsCover`) + **cover displayed** on public news list + article. No schema change (`014` already had it).

### Batch D — Olympiad — DONE (admin build PASS; from-zero 23/23)
- [x] D1 Olympiad `code` input removed → auto-generated from title (`olympiad.ts` slugify + collision retry).
- [x] D2 **Private per-package pool** via `questions.olympiad_package_id` (non-null = private; EXCLUDED from general `/questions` list + `start_practice_attempt` + general bulk import); `start_olympiad_attempt` draws ONLY from the package's private questions; package-scoped **bulk upload** (`bulk_insert_olympiad_package_questions` RPC + `OlympiadBulkImport` UI + template). Migration `016`, backported `015`/`011`/`013` (check #23).

### Batch E — Public site
- [x] E1 Public nav trimmed to **Pricing, About, FAQ, Contact** (`(public)/layout.tsx`). Other pages still exist but are off the nav. web-app build PASS.

### Batch F — Parent/child auth (copy logic from `side/UniPrep-Auth-master`)
- [x] F1 Parent register form = **First name, Last name, Email, Password** (`ParentAuthForm` split name → first/last; `registerParent` builds display_name). web-app build PASS.
- [x] F2 **Email verification** — `registerParent` now uses `supabase.auth.signUp` (sends confirmation email) instead of auto-confirm `admin.createUser`; `setup_parent` provisions the role pre-confirmation; `/verify-email` page + `/auth/callback` route (exchangeCodeForSession); `parentLogin` surfaces an "unverified" message. **OWNER ACTION:** enable Supabase Auth → "Confirm email" + SMTP for it to be enforced (code handles both modes; set `NEXT_PUBLIC_SITE_URL` for the email redirect).
- [x] F3 **Parent password reset** — `/forgot-password` (`resetPasswordForEmail` → `/auth/callback?next=/reset-password`) + `/reset-password` (`updateUser`); "Forgot password?" link on `/login`; trilingual. build PASS.
- [x] F4 **Parent account deletion** — `deleteParentAccount` (deletes the parent's children auth users then the parent → cascade) + confirm button on the parent dashboard; trilingual. build PASS.
- [x] F5 **Child delete + password reset** (parent) — `deleteChild` + `resetChildPasswordAction` (ownership-checked) + `ChildCardActions` on each dashboard child card (inline reset-password form + delete with confirm); trilingual. build PASS. (Admin-driven child reset comes with I1.) **Batch F COMPLETE.**

- [x] G1 **Login separated**: `/login` now shows a prominent **Student login** card (→ `/child-login`, 8-digit ID field, `inputMode=numeric`, not type=email) **and** a **Parent login** section (email). Fixes the "@"-required error (children were typing the ID into the parent email field; there was no link to `/child-login`). Trilingual `login.student*`/`login.parent*` added. web-app build PASS.

### Batch H — Add-Child flow + subscriptions (web-app) — DONE (web build PASS; from-zero 23/23)
- [x] H1 Grade (from `grades`) + City (AZ list + "Other"→free text) **dropdowns** + School **datalist**.
- [x] H2 **8-digit ID deferred to subscribe** — `create_child_account` no longer allocates; `create_child_subscription` allocates + sets the synthetic login email on the first plan; child card shows "ID pending — choose a plan" until then. Migration `015_deferred_child_id`, backported `002`(nullable id)/`011`/`013`.
- [x] H3 **Editable subjects** on an existing child (`ManageSubjects` + `add_subscription_subject`/`remove_subscription_subject` RPCs).
- [x] H4 Subscribe redesign: **subjects-first checkboxes → live subtotal → weekly/monthly/yearly → server price preview** with sibling discount reflected in the total.

---
## ✅ INVESTOR REVIEW ROUND 5 — COMPLETE & VALIDATED (2026-07-01)
Rebrand + design + profile/wallpaper/news polish. **Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes), from-zero DB rebuild = 26/26 PASS.** No SQL changes this round (wallpaper backend already existed). Nothing committed yet.

### 1) Rebrand → OlympIQ
- [x] Product brand renamed **"OlympIQ" → "OlympIQ"** (planned domain olympiq.ai) across both apps: web `app.brand`/`arena.brand`/`about.title`/`stats.title`/inline brand phrases (az/en/ru) + web metadata; admin metadata + hard-coded sidebar/login literals + css comment. **Kept the Azerbaijani word *olimpiada*=olympiad** in all feature names (Olimpiada Hazırlığı, oly.*, kind.olympiad, etc.). Cookie names left as `sb-olimpiada-*` (renaming would force re-login — technical, not brand). Memory note added.

### 2) "Energetic" design applied to LIGHT mode (dark untouched)
- [x] web-app `globals.css` LIGHT tokens remapped to the Energetic palette: bg `#fffbf5`, brand purple `#7c3aed`, accent orange `#ff8a00`, soft `#f7f0fe`, ink `#2a1a3e`, ok `#06b66b`, danger `#ff4757`; purple-tinted card shadows; **22px** card radii; **Trebuchet MS** (light-only); signature gradients — gradient logo mark (135° purple→orange, rotate −4°), purple-glow 14px buttons, gradient stat numbers, 3-stop hero (`150° #7c3aed→#9333ea→#ff8a00`). **Dark theme + `.arena` scope byte-unchanged** (block-B tokens re-pinned under `[data-theme="dark"]`). Source = the owner's "Enerjili" Claude Design HTML.

### 3) Dedicated Profile pages + drawer-as-button (parent AND student)
- [x] Profile editing moved out of the cramped 360px drawer onto full-width pages: **/profile** (parent) + **/child/profile** (student). Drawers now show a **Profile button** (+ Language + Theme + Logout). Student got a **drawer mirroring the parent** (`ChildProfileDrawer`). Profile removed from the student home. Parent footer wrapped in `.site-foot-inner`/`.site-foot-col` (was raw edge-jammed links).

### 4) De-Arena the student app
- [x] All user-facing **"ARENA" wording removed** (child header, ticker, login/child-login), first nav tab relabeled Home; the `.arena-*` CSS classes + `arena.*` i18n keys are kept (they're just the dark-theme scope).

### 5) Wallpapers (admin-managed set + student reset)
- [x] New admin **/wallpapers** manager: add solid colors + **upload image wallpapers** (→ wallpaper-assets bucket → media_assets → wallpapers `kind='image'`), activate/archive. Student picker now **renders image wallpapers** (was colors-only) and has a **"Default" swatch** → `resetWallpaper` deletes the selection so the app falls back to the theme (light/dark) default. Backend (table/bucket/RLS) pre-existed — no SQL.

### 6) Admin settings toggles
- [x] Real **sliding switches** (the knob used flex-`order` + `translateX:0` so it never moved → now translates 20px) + **optimistic** flag toggle (instant flip via `useOptimistic`). Shortened the leaderboard-names label.
- [x] **Flags now actually gate** (were persisted-but-inert): `feature_flags`/`system_settings` read via a server helper `web-app/src/lib/flags.ts` (service client, safe fallbacks) — **`news_public`** hides the public News page when off; **`leaderboard.public_display_names`** anonymizes leaderboard names when off. Other flags (launch_promo, olympiad_module, payments, notifications_email) persist + slide but their gates are **not yet wired** (deferred — see below).

### 7) News fixes
- [x] **First-load image fix:** covers were full-resolution originals piped into 72px thumbnails. Now `next/image` (+ `next.config` remotePatterns for the Supabase host) resizes + serves webp with explicit dimensions → fast first paint, no layout shift. **List redesigned** to a card grid (cover/placeholder + title + excerpt + date + views); **detail** got a meta row + typography.

### Round 5 — deferred / not wired (honest list)
- Feature-flag **gates for launch_promo, olympiad_module, payments, notifications_email** (toggles persist + slide; behavior not yet wired). Real **payments + webhook**, failed-charge/expiry automation, admin subscription/payment monitoring, pg_cron scheduling of `advance_student_grades()`, News **"Most Liked"** (likes model). Package.json/README brand fields not renamed (non-UI). Energetic theme applied to **light** only (dark kept as the owner's reference dark design).

---
## ✅ INVESTOR REVIEW ROUND 6 — COMPLETE & VALIDATED (2026-07-02)

**Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes incl. redesigned /settings), migrations 019+020 applied on dev, extended `013` = 28/28 PASS on dev AND inside a non-destructive from-zero rebuild (single transaction, rolled back; dev verified intact after). Nothing committed yet.**

- [x] R6-1 **Student nav = parent nav structure (drawer bug fixed).** Root cause found: `.arena-nav` had `backdrop-filter`, which makes the header the CONTAINING BLOCK for the `position:fixed` drawer rendered inside it → the closed drawer (`translateX(100%)`) stuck out past the right edge (page extended right) and never docked to the viewport. The child shell now uses the parent's `.pnav` header verbatim (shared `ParentNavLinks` + `.pnav-right`, arena-dark overrides, NO backdrop-filter); also fixed the always-active first tab (active state now follows `usePathname`, with `exact` matching for the `/child` home tab). Old `.arena-nav*` CSS removed.
- [x] R6-2 **Spacing pass.** `.profile-section` is now a flex column with real gap rhythm (was block layout where the Round-5 `gap` had NO effect — the actual cramping cause); ChildProfile head restructured to mirror ParentProfile (removed the misused `.profile-grid` inside the head); button paddings normalized so no text hugs borders (`.btn/.btn-ghost` 10×18, `.arena-btn(-ghost/-sm)` bumped, `.avatar-upload-btn` 9×16, form inputs 10×14); Save/Cancel rows via new `.form-actions`.
- [x] R6-3 **Language settings actually gate.** `getLocaleSettings()` (one request-cached query) reads `platform.supported_locales` + `platform.default_locale`; `getLocale()` clamps the cookie locale to the enabled set (fallback = admin default); `LanguageDropdown` (public navbar + both drawers) only offers enabled locales. Dev currently has ru UNCHECKED (the owner's test) → web-app now really drops Russian.
- [x] R6-4 **Hydration error fixed** with `suppressHydrationWarning` on `<html>` (documented Next.js pattern — the no-flash script intentionally rewrites `data-theme` pre-hydration; suppression covers only `<html>` attributes). Admin panel has no such pattern (no change needed).
- [x] R6-5 **Admin Settings redesigned UniPrep-style** (via subagent; typecheck+build PASS): 3 tabs (General / Localization / Features) of grouped SettingCard blocks (warning/info variants), reusable typed SettingInput with per-field Save + helper text, SettingToggle with inline CONFIRMATION for maintenance mode, sliding flag toggles + ON/OFF pills, reality-accurate flag descriptions, 34 new i18n keys ×3. **All raw-JSON editors removed** (trilingual maintenance message = 3 textareas assembled into one JSON in code). Update-only security posture of `updateSetting` kept. Orphan `site.promo_banner` setting deleted (migration 019; referenced nowhere).
- [x] R6-6 **All six flag gates wired** (server-side first, UI second): `payments` blocks `subscribeChild`/`addSubjectAction`/`removeSubjectAction`/`buyOlympiad` + hides the subscribe form/buy buttons with a trilingual notice (cancel stays allowed); `olympiad_module` gates the student Tasks tab, `/child/olympiads`, `startOlympiad`, the parent purchase page + dashboard button, and 404s public `/olympiad-preparation`; `launch_promo` gates the promo/trial line on public `/pricing` (actual trial behavior stays in `launch_promo_config`); `notifications_email` → `canSendEmailNotifications()` helper documented as the mandatory gate for any future email sender (nothing sends email today; Supabase Auth security emails deliberately NOT gated). Also NEW live settings: `platform.maintenance_mode(+message)` → full web-app maintenance splash (admin app unaffected); `contact.support_phone` → public Contact page; `social.*` → public footer links.
- [x] R6-7 **News likes + "Most liked"** (migration `2026_07_02_019`, backported to canonical `012`/`014`/`013` check #27): `news_likes` (PK news+profile, RLS own-row insert/delete on published only, NO anon) + `news.like_count` via SECURITY DEFINER trigger (smoke-tested inc/dec on dev, rolled back). UI: ♥ like button (optimistic, parent OR child) on the article page, plain counter for anonymous, ♥ counts on list cards, "Most liked" sort option. Migration 019 also backfills flags/settings that existed ONLY on dev (launch_promo/news_public/olympiad_module, contact.support_email) — closing a from-zero coverage gap.
- [x] R6-8 **pg_cron grade promotion** (migration `2026_07_02_020`, canonical **NEW `016_scheduled_jobs.sql`**, `013` check #28 SKIP-safe): job `olympiq_advance_student_grades` = `advance_student_grades()` every Sept 1 03:00 UTC — **verified scheduled on dev** (`cron.job` row present). Guarded: environments without pg_cron skip with a NOTICE (from-zero rebuild stays green).
- [x] R6-9 Validation done (see gate line above); `docs/MANUAL_TESTING_GUIDE.md` extended with Round-6 section **U1–U8**.

---
## ✅ INVESTOR REVIEW ROUND 7 — COMPLETE & VALIDATED (2026-07-02)

**Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes), `npm audit` = 0 vulnerabilities in BOTH apps. No DB changes this round. Nothing committed yet.**

- [x] R7-1 **Brand mark spacing**: `.pnav-brand` is now a fixed 18px slot with a 10px gap before the "Home" label, vertically centered via flex (`.pnav-link` inline-flex). Logo-file-ready: when the real logo asset arrives, an `<img>` drops into the slot and the `::before` dot is deleted — no layout change.
- [x] R7-2 **Views/likes cross-talk fixed (root cause)**: liking called `revalidatePath` → the article re-rendered → the render-time `bump_news_view` fired again, so every like click also bumped views. Views now register via a client `<ViewBeacon/>` once per browser session per article (sessionStorage-guarded, UUID-validated server action); the render never mutates. NOT kept as a feature — it corrupted "Most viewed" and was trivially farmable. Not a DDoS vector (cheap, rate-limited requests); counters documented as manipulable vanity metrics in CLAUDE.md.
- [x] R7-3 **Security hardening pass (both apps) — audits run by two read-only subagents, all confirmed findings fixed:**
  - **Dependencies:** `npm audit` 0/0 (was 2 moderate each — postcss <8.5.10 pinned inside Next; fixed via package.json `overrides` postcss ^8.5.10, NOT the suggested next@9 downgrade). Next.js floor raised to `^15.5.19` (already past the 15.2.3 middleware-bypass CVE window).
  - **Security headers (both `next.config.mjs`)**: CSP (per-app: web allows Google Fonts + Maps frame + Supabase; admin stricter with `frame-src 'none'`), X-Frame-Options (web SAMEORIGIN / admin DENY), nosniff, Referrer-Policy, Permissions-Policy, HSTS, `poweredByHeader: false`; dev-only `'unsafe-eval'` for HMR.
  - **web-app fixes:** open redirect in `/auth/callback` (`safeNext()` — relative same-origin only); in-memory rate limiting (`lib/rateLimit.ts`) on parent login (10/15min) + register (5/15min) + password reset (3/15min) with trilingual "too many attempts" (serverless per-instance limitation documented — mitigates the owner-requested "no account vs wrong password" enumeration UX); avatar uploads now magic-byte sniffed (`lib/imageSniff.ts`, parent + child; sniffed mime drives contentType/ext/metadata); raw Postgres `error.message` no longer returned (subscription/quote/gradePractice → generic trilingual); wallpaper URL escaped before inline CSS `url()` interpolation; Maps iframes sandboxed; email regex + length caps (names 80, email 255, password 128) on parent auth; child-info validation caps names (80) + UUID-shape-checks district/school/grade ids.
  - **admin-panel fixes (subagent; typecheck+build PASS):** 30-min idle logout now enforced SERVER-side (middleware `olympiq-admin-last-seen` httpOnly cookie → signOut + `/login?timeout=1` with trilingual note; client timer kept as UX); audit logging added to ALL Admin-only mutations (new `lib/admin/audit.ts` helper reusing the accounts.ts pattern; news save/transition/delete/cover, olympiad save/archive/bulk-import, wallpapers create/attach/status, settings flag/setting — best-effort, metadata capped 200 chars); media attach actions now verify the ACTUAL storage object (`lib/admin/media-verify.ts` — strict path shape, extension whitelist, no SVG, server-derived size/mime; client mime/size fields ignored); `error.message` sweep → generic trilingual + server-side `console.error` (known-error special cases kept); admin login → single generic "invalid credentials"; numeric validation (price ≥ 0 finite, grade integer 1–11, NaN guards); server-side length caps across news/wallpapers/cities/schools/questions/taxonomy; `updateSetting` validates parsed JSON against the key's SETTING_META kind + size caps + unknown keys rejected; guard-first ordering in questions.ts delete/transition/bulk; dashboard page now calls `requirePanelAccess()`.
  - **Verified clean (no action needed):** server-action authorization/ownership coverage in BOTH apps; service-role containment (`server-only`, no client imports, no NEXT_PUBLIC_ leaks); XSS sinks (all user content React-escaped; only the static theme script uses dangerouslySetInnerHTML); no SVG allowed by any storage bucket; cookies keep @supabase/ssr httpOnly/lax defaults; `.env.local` untracked (only `.example` files in git); child login lockout confirmed wired; bulk-import prototype-pollution inert (payload → jsonb RPC, never merged into JS objects).
  - **CLAUDE.md**: permanent "Security Engineering Rules" section added (guards-first, server-side validation, byte-sniffed uploads, no raw error leaks, same-origin redirects, CSP upkeep, throttling, audit logging, dependency floor) so future implementations stay secure.
  - New i18n keys ×3 locales: web `parent.err.tooMany`, `sub.err.failed`, `auth.child.err.nameTooLong`; admin `err.server`, `err.tooLong`, `login.invalid`, `login.timeout`.
  - Testing guide extended with **V1–V5**.

---
## ✅ INVESTOR REVIEW ROUND 8 — COMPLETE & VALIDATED (2026-07-03)

**Final gate: web typecheck+build PASS (30 routes), admin typecheck+build PASS (21 routes), migration 021 applied on dev, extended `013` = 29/29 PASS incl. non-destructive from-zero rebuild. 213 new i18n keys ×3 locales merged conflict-free. Nothing committed yet.**

Delivered exactly per plan below (all boxes done): Phase 1 — FAQ single chevron (root cause: a later border-caret rule layered on the svg), global Azerbaijani-safe Arial stack (Trebuchet+Chivo removed; JetBrains Mono kept for numerics), student logout → `/`, nav renamed Olimpiadalar, migration `2026_07_03_021` (olympiad `event_starts_at` + 6 playful gradient background presets; backported 012/015/013 #29). Phase 2 (7 parallel agents, disjoint ownership, central merge) — SaaS Pricing page (owner copy, contract plan-cards, sibling box, quiet note; promo line still launch_promo-gated); corporate About (SVG illustrations, alternating blocks, 4-card grid); Analytics with merged child progress (real stat cards + child selector + lockable subject tabs + DEMO dashboard: KPI tiles, SVG weekly/accuracy charts, topic + mistakes tables; dashboard child-card progress button removed; old progress route redirects); SaaS Subscription center (smooth-scroll Plans/Billing/Invoices; real plans/subjects/cancel + DEMO billing/invoices); professional Profile pages (parent: identity/account/security/danger/session; student: identity+ID/photo/security only) + background-template gallery (new presets, highlighted selection); redesigned drawers (Account/Language/Appearance/Session, segmented [AZ][EN][RU] + [Light][Dark], single-arrow profile row) with backward-compatible ThemeToggle/LanguageDropdown; student Olimpiadalar tab (planned-olympiad cards + detail modal with the ask-your-parent note; Olimpiadalarım kept) + admin package form gained cover-image upload (news-cover pattern incl. media-verify + audit) and event date field. Phase 3 — student LIGHT theme via `.arena` token remap to the landing reference (dark byte-unchanged) + merged all agent CSS/i18n centrally.

**Demo-data registry (to replace with real data later):** analytics subject dashboard numbers/charts; subscription Billing panel (next billing date, MasterCard ****8475) and Invoices (toggle, 2 rows). Real: plan cards' child subjects/interval/total, cancel flow, planned olympiads (admin data), backgrounds.

Docs updated: CLAUDE.md (design direction — light reference/dark frozen/Arial rule/demo-data policy), MANUAL_TESTING_GUIDE **W1–W12**.

### Original Round 8 plan (all delivered)

Execution model (per the established round workflow): main session owns ALL shared files (`globals.css`, web `messages.ts`, `child/layout.tsx`, SQL) + global fixes; parallel agents own disjoint pages/components and RETURN their CSS blocks + trilingual key/value triples for central merge (no shared-file races).

**Phase 1 — global fixes + DB (main session):**
- [ ] R8-A FAQ double chevron: delete the later `.faq-chevron` border-caret override block (globals.css ~2849) — it drew a small caret ON the svg element that already draws the main chevron. One centered chevron + rotation stays. Fixes landing AND parent FAQ (shared FaqAccordion).
- [ ] R8-B Font: global Azerbaijani-safe stack `Arial, Helvetica, …` — replace light-mode Trebuchet MS + arena Chivo + lead the root stack with Arial; keep JetBrains Mono for numeric accents only; slim the Google Fonts link. Verify ə Ə ğ Ğ ş Ş ç Ç ü Ü ö Ö ı İ.
- [ ] R8-C BUG: student logout redirects to `/` (landing), not `/child-login`.
- [ ] R8-D Student nav item "Tapşırıqlar" → "Olimpiadalar" (az/en/ru value change).
- [ ] R8-E Migration `2026_07_03_021`: `olympiad_packages.event_starts_at timestamptz` (planned-olympiad date for the student tab) + seed 6 playful gradient wallpaper PRESETS (racing/space/ocean/jungle/candy/night — CSS gradient values; picker + arena background already accept any CSS background). Backport 015/012 + 013 check #29; apply dev; from-zero at the end.

**Phase 2 — parallel agents (disjoint ownership):**
- [ ] R8-1 Pricing page → SaaS cards (owner-provided copy; badges, benefits, CTAs, sibling info box, muted note; equal heights; both themes; responsive) — authors the shared `plan-*` card CSS contract.
- [ ] R8-2 About page → hero + alternating sections + Mission/Offer/Audience/Trust cards + inline-SVG illustrations (CSP-safe), corporate polish, trilingual.
- [ ] R8-3 Analytics: merge child progress into /analytics — stat cards kept; child selector; subject tabs (locked ⟶ "subscribe to unlock"); demo SaaS dashboard (weekly activity, totals, accuracy, best/weakest topic, time, last activity; SVG charts; mistakes-by-topic table). Child cards on dashboard lose the progress button; /children/[id]/progress redirects to /analytics. InfoCarousel → 2 cards desktop / 1 mobile, no half-cuts.
- [ ] R8-4 Subscription page → SaaS billing: Plans/Billing/Invoices smooth-scroll tabs; plan cards REUSE the pricing contract + "Current plan" badge + per-child subjects + manage/add subjects; demo Billing (next date, MasterCard ****8475) + demo Invoices (email toggle, request button, history table).
- [ ] R8-5 Profile redesign (parent AND student): settings-card layout (identity header / Account info / photo actions + "JPG or PNG, max 2 MB" / Security / Danger zone (parent only) / Session); student keeps avatar+name+8-digit ID+password only; wallpaper picker → template preview cards incl. the new playful presets, clear selected state.
- [ ] R8-6 Drawers (parent + student): section titles Account/Language/Appearance/Session; theme = side-by-side [Light][Dark] segmented with active highlight; language = [AZ][EN][RU] segmented on desktop (dropdown mobile; respects enabled-locales gating); single arrow on the profile row; logout under Session (calm danger).
- [ ] R8-7 Student Olympiads tab: "Planned olympiads" cards (image/title/desc/date/subject/status + Ətraflı detail w/ "ask your parent to buy the package" note; data = admin olympiad packages) + "Olimpiadalarım" (owned; empty state kept). Admin: add cover-image upload if missing + event date field.

**Phase 3 — main session:** merge returned CSS/i18n; light-mode unification (landing Energetic light = reference for parent + STUDENT light; `[data-theme="light"] .arena` token remap; dark byte-kept); final typecheck/build both apps; from-zero DB; docs (CLAUDE.md design direction note, MANUAL_TESTING_GUIDE W-section, STATUS completion).

---
## ✅ INVESTOR REVIEW ROUND 9 — COMPLETE & VALIDATED (2026-07-03)

**Final gate: web typecheck+build PASS (31 routes incl. new /olympiads), admin typecheck+build PASS, migrations 022+023 applied on dev + backported (011/013), extended `013` = 31/31 PASS incl. non-destructive from-zero rebuild. Nothing committed yet.**

- [x] T1 Language dropdown double caret — removed the CSS ::after caret; the svg caret is the single, animated one.
- [x] T2 "Uşağı sil" — new `.btn-ghost.danger` variant (ghost geometry, danger tint) + styled inline reset-password input.
- [x] T3 Avatars — every avatar container (nav trigger + profile classes old/new) enforces square box, 50% radius, overflow hidden, object-fit cover.
- [x] T4 Analytics KPI grid — "Orta dəqiqlik" tile removed → exactly 5 boxes, `repeat(5,1fr)` desktop / auto-fit tablet / 2-col mobile (accuracy still in trend chart + topic table).
- [x] T5 Shared `<Modal/>` + `<ConfirmModal/>` (`components/Modal.tsx`: portal into body, overlay/Escape/× close, scroll lock, role=dialog/aria-modal/focus restore) — the buggy student "Ətraflı" dialog (root cause: rendered INSIDE the clipped/stacked card) rebuilt on it; CancelSubscription, DeleteAccountButton and the delete-child confirm() all refactored onto it. Every web-app modal now shares one implementation.
- [x] T6 REAL analytics (UniPrep architecture study → port): migration `2026_07_03_023` adds `get_child_subject_dashboard(child, subject?, days?)` (totals/accuracy/time-spent(started_at→submitted_at, clamped)/last-activity/7-day activity/accuracy trend/per-topic/mistakes; SECURITY DEFINER with COALESCE'd in-body auth: service-role/admin/linked-parent/the child; anon revoked) + `get_admin_platform_overview()` (admin-only KPIs + signup/attempt trends). Parent dashboard now URL-driven (?child&subject) and 100% real data with honest empty states (ALL Round-8 demo numbers deleted); admin dashboard gained the Platform overview section (content managers: section omitted). UniPrep ideas deliberately skipped: DISTINCT ON dedup (our answers are already unique), ELO/tiers, per-user timezones, fetch-all client aggregation.
- [x] T7 Parent "Olimpiadalar" menu (`/olympiads` between Analitika/Abunəlik): browse all active packages (cover/chips/date/questions/admin price), segmented child selector, purchase via shared Modal, `purchaseOlympiadForChild` action (guard-first, ownership re-check, olympiad_module+payments server gates, price read server-side, duplicate race → "already owned") with the MOCK payment isolated in non-exported `processOlympiadPayment()` — the single seam for the future real provider. Purchases appear in the student's Olimpiadalarım (existing RPC/RLS).
- [x] T8 Admin Questions (UniPrep gap analysis → G1–G5): server-side pagination (25/50/100 + numbered pager + Showing X–Y of N), debounced ?q search over translations (LIKE-escaped, id-set strategy), cascading Subject→Topic→Subtopic + Type/Grade/Status filters (searchParams-driven, uuid/status whitelists), per-row lifecycle quick actions (mirrors QuestionLifecycle permissions via existing transitionQuestion), lifecycle stat cards (click-to-filter, private-pool exclusion). Deliberately NOT ported: is_active toggle (we have a 6-state lifecycle), Situasiya groups, difficulty-centric UI, client fetch-all.
- [x] T9a Wallpapers "silent save failure" — ROOT CAUSE: saves were persisting all along; dev carried a DUPLICATE FK wallpapers→media_assets (inline FK from migration 006 + canonical named FK from 011), making every PostgREST embed ambiguous (PGRST201) — the list swallowed the error and looked frozen. Fixed: migration `2026_07_03_022` (single canonical FK; 013 check #30 guards the invariant), `listWallpapers` hints the FK column + SURFACES load errors, `createSolidWallpaper` converted to state-returning with explicit saved/error feedback (was void = structurally silent), image uploader shows success. End-to-end verified via a throwaway-admin PostgREST repro (all layers OK post-fix).
- [x] T9b Student background gallery confirmed fully DB-driven (no hardcoded list) — it was broken by the same duplicate-FK embed failure; works after 022 (verified: 15 wallpapers incl. the owner's stuck "test" image now flow through).

**Demo-data registry update:** parent analytics dashboard is now REAL (removed from the registry). Still demo: subscription Billing panel + Invoices section; olympiad purchase payment step (mock seam).

Docs updated: MANUAL_TESTING_GUIDE **X1–X9**.

---
## ✅ INVESTOR REVIEW ROUND 11 — COMPLETE & VALIDATED (2026-07-04)

**Final gate: web typecheck+build PASS, admin typecheck+build PASS (nav now /stickers; /wallpapers removed), migrations 025+026+027 applied on dev + fully backported (002/003/009/010/011/012/013), extended `013` = 37/37 PASS incl. the non-destructive from-zero rebuild (rolled back; dev verified intact). Nothing committed yet.**

- [x] **Payment modes (items 1+6):** `payments` / `demo_payments` / `giveaway_period` flags with DB-trigger mutual exclusivity (`trg_payment_mode_exclusivity`, smoke-tested incl. giveaway-clock stamp + no-restamp guard); server-only `web-app/src/lib/paymentMode.ts` = the single mode/giveaway-window resolver (expired window ⇒ inactive automatically, no job needed); all subscribe/subject/olympiad gates rewired (off → paymentsOff, giveaway → "free right now" — no paid rows minted during a free window).
- [x] **Giveaway Period (item 6):** admin duration-days input (1–730, server-validated) + Asia/Baku start/end readout; celebratory D/H/M countdown banner in parent+child layouts; add-child skips plan/payment (Info→Done, instant 8-digit ID via new `activate_child_login_id` RPC, NO subscription row); child arena/practice/olympiads free via DB-level `is_giveaway_active()` inside `start_practice_attempt`/`start_olympiad_attempt` (migration 027) — active-catalog packages only, archived stay purchaser-only; expiry reverts everything automatically.
- [x] **Demo Payments + Manage Subjects (items 1+13):** checkbox editor (active chip vs additional, per-subject per-interval price, live authoritative quote) with the PAYMENT-FIRST contract — any addition opens the demo-pay sheet (demo AND real modes) showing base/discount/total from the quote; cancel = nothing applied; removals re-price directly via the kept sibling rate; new batch `updateSubscriptionSubjectsAction` (ownership + mode + UUID-validated, ≥1 subject, amounts 100% server-derived).
- [x] **Item 12:** Subscription page multi-child selector (`?child=` Link tabs, ownership-validated, refresh/deep-link safe; plans/billing/invoices scoped per child). **Item 11:** Analytics subject tabs unlock from the child's REAL coverage (giveaway → all; admin grants unlock automatically via their ordinary active subscription); forged `?subject=` clamped.
- [x] **Phone (item 3):** 244-country dial list (AZ default, emoji flags, Intl.DisplayNames names), composed E.164 hidden field, FE custom-validity + server regex before signup, stored in `profiles.phone` (E.164 check constraint, 013 #35), read-only on the profile page.
- [x] **Wizard (items 2/4/8):** step-3 plan CARDS on the shared plan-card contract (Most Popular badge, selected state, quote-driven totals); page + wizard centered (root cause: 600px prose block left-stuck in 960px main); password-eye root cause = `.form button{margin-top:16px}` leaking onto the absolutely-positioned eye → zeroed globally for `.form .pw-field`.
- [x] **Item 5:** "Qiymət 1 fənn üçün hesablanır." note near prices (subscription plan cards + subjects editor), trilingual.
- [x] **Admin bypass (item 7):** Accounts → Create child (parent picker + filter, grade, password, grant toggle default ON with interval + actively-priced subjects + optional days) → `admin_grant_child_access` RPC (comped ACTIVE subscription, amounts 0, provider `admin_grant`, allocates the 8-digit ID, access='active'; refuses double-live-plans; service-role only, 013 #34); saga rollback on any failure; audited (`admin.child.create`, `admin.child.access_grant`); bypass exists ONLY here.
- [x] **Character Stickers (item 9):** wallpapers feature fully retired at app level (child picker + arena background + admin module + nav deleted; tables kept DEPRECATED non-destructively; obsolete i18n keys ×3 locales + dead CSS pruned; historical audit labels kept). New: `sticker_themes`/`sticker_images`/`child_sticker_selections` + `sticker-assets` bucket (png/webp only, 2MB) + DB min-5 guards (enable + delete, both smoke-tested); admin Stickers module (theme CRUD, byte-sniffed multi-upload, previews, typed-confirm delete, full audit); child profile theme cards (enabled themes only — RLS WITH CHECK) + `StickerDecorations` fixed layer (deterministic 4–6 safe slots, pointer-events none, ≤2 on mobile, reduced-motion aware).
- [x] **Item 10:** landing "What sets us apart" redesigned (root cause: values grid was squeezed into one column of the About 2-col grid) — full-width span, centered heading + accent bar, 4/2/1 card grid, token shadows/radii, motion-safe hover; content byte-identical.
- **i18n:** web +37 keys / admin +92 keys (az/en/ru, central TSV merge), −5 web / −20 admin obsolete keys pruned. **Audit page** gained mappings for the 6 sticker codes + 2 child codes + 2 new entities.
- **DB:** migrations `2026_07_04_025` (modes/phone/grant), `026` (stickers), `027` (giveaway attempt access), `028` (sticker min 5→6) — all applied on dev, smoke-tested (exclusivity, grant end-to-end, min-6 guards) and backported; `013` now 37 checks (#33–#37; #36 asserts the min-6 threshold in the guard bodies).
- [x] **Sticker follow-up (owner):** min raised **5→6** (DB guards migration 028 + backport 011 + 013 #36 assertion; admin `MIN_IMAGES=6` both pages + `stkadm.*` "6"/"{n}/6" text in labels.ts + messages.ts mirror, all 3 locales — smoke-tested: 5 blocked, 6 enables, delete-below-6 blocked). Child layer redesigned to **exactly 6 UNIQUE** stickers (deterministic shuffle, no repeats), **3 left + 3 right** in a **triangular/staggered** arrangement (outer top/bottom hug the edge, middle pokes toward content — never a straight vertical line); gutter geometry derived live from `.arena-main` (1100px centered) with a `max()` clamp that folds in the RENDERED overshoot (scale ≤1.23 on hover + rotate ±17° + drop-shadow), so the visible sticker keeps ≥14px clearance from content at every shown width (verified 1280→2560px — overlap mathematically impossible, even mid-hover); responsive (single viewport-scaled size clamp; hidden <1280px where the 1100px content fills the width → no overlap / no horizontal scroll — **tablet/mobile hide is the owner-approved fallback**, side gutters don't exist until the viewport exceeds the content); **hover wiggle + scale-up** (precise-pointer only, `prefers-reduced-motion` disables float+wiggle); layer `z-index:0` + `pointer-events:none` (stickers interactive only on desktop, only in the empty gutters — beside content, never above interactive elements). **Adversarially reviewed** (multi-agent workflow, 4 lenses + verify): caught + fixed the rendered-box overlap (initial clamp reasoned about the layout box only) and 6 stale min-5 doc comments across 5 files; 4 findings correctly refuted. Both apps typecheck+build PASS; from-zero rebuild 37/37.
- Docs: MANUAL_TESTING_GUIDE **Z1–Z14**. Demo-data registry unchanged (billing/invoices demo + olympiad mock seam remain; the demo-pay sheet is the deliberate temporary system until the real provider).

### Round 11 — owner fix pass (2026-07-05)
Post-review punch-list (web typecheck+build PASS; admin untouched; adversarial review workflow run):
- [x] **Giveaway countdown now ticks live SECONDS** (d/h/m/**s**, 1s interval, 2-digit-padded h/m/s for stable width) for parent AND student; `gvw.seconds` added (az/en/ru) + wired into both panel layouts.
- [x] **Giveaway shown on the public site** to logged-out visitors (item 1b) — the same celebratory countdown banner mounted at the top of `(public)/layout.tsx` `site-main` while the window is active (lures new customers on the landing + every public page).
- [x] **Phone country selector rebuilt** (item 2): the repetitive long country names are gone from the visible control — a COMPACT trigger shows only ISO + dial (`AZ +994`); opening it reveals a **searchable** popover with full names + codes (keyboard nav, outside-click/Escape, focus-return). Hidden `phone` E.164 composition + server validation unchanged; `parent.auth.phoneSearch` added ×3.
- [x] **Demo-payment CVC overflow fixed** (item 3, CSS): `.pay-field input` got `width:100%`+`box-sizing:border-box` and `.pay-grid` switched to `minmax(0,1fr)` + `min-width:0` — the input's intrinsic ~20-char width no longer forces the column past the card edge.
- [x] **Analytics → Detailed progress → Subject FIXED** (item 4): ROOT CAUSE — a hardcoded `subjectSlug()`/`["math","science","logic","english"]` model silently dropped every subject that didn't match those 4 slugs. The real seeded subjects are **Riyaziyyat / İngilis dili / İnformatika / Azərbaycan dili**, so a child subscribed to İnformatika+Azərbaycan dili mapped to ZERO tabs → the "no active subject" panel. Fix: derive the subject tabs from the child's **real** covered subjects (id + name, same source as the subscribe page) and show the other purchasable subjects (from `subjects_pricing`) as locked — works for ANY admin-defined subject set. Giveaway/admin-grant unlocking + the forged-`?subject=` clamp preserved. Verified against dev data (child 26512f40 → İnformatika+Azərbaycan dili now selectable, other two locked).
- [x] **Stickers made bigger** (item 5): `--stk-w` `clamp(38→50px, 4→4.6vw, 84→100px)`; overlap math re-derived (≥13px rendered clearance incl. hover at 1280→2560px), triangle + <1280px hide unchanged.

### Original Round 11 plan

**Scope (owner punch-list):** (1) Manage-Subjects checkbox UI + prices + demo-payment confirm; (2) Add-Child password-toggle vertical centering; (3) mandatory parent phone at registration (all-country dial codes, AZ default, FE+BE validation, E.164 in `profiles.phone`); (4) Add-Child step-3 plan cards (subscription-page style + Most Popular badge); (5) "price is per 1 subject" note near prices; (6) **Giveaway Period** feature (admin toggle + duration-days input, free platform access, countdown banner, safe expiry); (7) admin create-child with free access grant (payment bypass, admin-only); (8) Add-Child screen centered; (10) landing "What sets us apart" section redesign (spacing/cards/hierarchy, content unchanged); (11) parent Analytics subject tabs unlock per the SELECTED child's real subscription coverage (giveaway/admin-grant aware, server-derived, locked-subject URL params clamped); (12) Subscription page multi-child support — URL-driven child selector tabs (?child=, ownership-validated server-side), all plans/billing/invoices scoped to the selected child; (13) Manage-Subjects payment-first contract — subject ADDITIONS open the payment flow (demo modal in demo AND real modes) BEFORE anything is applied (cancel = still locked); removals re-price without payment via the kept sibling rate; all amounts server-derived (quote/add/remove RPCs are THE central pricing service — 1st child full, 2nd 15%, 3rd+ 20% by live-subscription rank); every apply re-validates childId ownership + payment mode server-side; (9) **Character Stickers** replace the wallpaper/color-palette customization — remove the palette UI (child profile) + the admin Wallpapers color module entirely; new admin Sticker-Themes module (name + ≥5 transparent PNG/WebP sticker uploads, enable/disable, previews, delete/replace) + child profile theme cards + a safe decorative sticker renderer across child pages (never blocks content; responsive; admin-uploaded assets only — no copyrighted URLs hardcoded). Payment modes (**real `payments` / `demo_payments` / `giveaway_period`**) are mutually exclusive — enforced at the DB layer (trigger), not just UI. Wallpaper DB tables retired non-destructively (app code removed; tables kept DEPRECATED like old `subscriptions` — drop needs explicit owner approval).

**Implementation plan:**
- **Phase 0 (main session, foundation):** migration `2026_07_04_025_payment_modes_phone_admin_grant.sql` — seed `demo_payments` + `giveaway_period` flags (off) + `giveaway.duration_days`/`giveaway.started_at` settings; `fn_payment_mode_exclusivity` trigger on `feature_flags` (enabling one of the trio disables the others; enabling giveaway stamps `giveaway.started_at`); `profiles.phone` (E.164 check); `admin_grant_child_access(student, interval, subject_ids[], days?)` SECURITY DEFINER RPC (comped active subscription, total 0, provider `admin_grant`, allocates the 8-digit ID like `create_child_subscription`; service_role only). Apply dev → backport 002/011/012 → 013 checks #33–35. New server-only `web-app/src/lib/paymentMode.ts` (`getPaymentModeInfo()`: mode = giveaway>demo>real>off, giveaway window computed server-side, expired giveaway = inactive). Rewire `subscriptionService`/`olympiadService` gates: blocked only when mode `off`; giveaway blocks paid mutations with a "free during giveaway" notice (access comes from the global override, no rows written — expiry auto-reverts). New `updateSubscriptionSubjectsAction` (batch checkbox diff → add/remove RPCs) + `activateChildGiveaway` (allocate ID + synthetic email, NO subscription).
- **Phase 0b (main session):** migration `2026_07_04_026_sticker_themes.sql` — `sticker_themes` (admin-managed, disabled by default) + `sticker_images` (FK → `media_assets`; PNG/WebP only) + `child_sticker_selections` (RLS self-row) + `sticker-assets` bucket + DB-enforced **min-5-images-per-enabled-theme** (enable check + delete guard triggers). Backports 002/009/010/011/012-n/a/013.
- **Phase 1 (parallel agents, disjoint files; CSS/i18n via scratchpad TSV for central merge):** A = ManageSubjects checkbox redesign + demo-pay confirm modal + per-subject note (subscribe page, subscription page). B = AddChildWizard (plan cards, giveaway skip Info→Done, centering, pw-toggle alignment). C = phone field (countries module + PhoneField + register form + `registerParent` validation/store + profile display). D = admin panel (Features: two new flags + giveaway duration input + exclusivity note; Accounts: create-child form with subjects/interval/free-grant via the new RPC; audit). E = GiveawayBanner (countdown d/h/m, celebratory, both themes) in parent+child layouts + free-access override on child arena gates/dashboard pill/olympiad child surfaces + child-layout sticker integration (remove wallpaper background application, mount `StickerDecorations`). F = web stickers (delete `WallpaperPicker` + wallpaper actions; `StickerThemePicker` cards in child profile; `StickerDecorations` safe-position renderer; selection server action limited to enabled themes). G = admin stickers (DELETE the Wallpapers module — pages/actions/components/nav; new Stickers module: theme CRUD, multi-upload with byte-sniffed PNG/WebP validation, previews, per-sticker delete, enable gated on ≥5, audit).
- **Phase 2 (main session):** merge i18n/CSS, typecheck+build both apps, non-destructive from-zero rebuild (013 → 35 checks), MANUAL_TESTING_GUIDE Z-section, STATUS completion + QA checklist sweep.

---
## ✅ INVESTOR REVIEW ROUND 12 — COMPLETE & VALIDATED (2026-07-05)

**Final gate: web typecheck+build PASS (33/33 pages), admin typecheck+build PASS (22/22 pages incl. new `/site-content`); migrations `2026_07_05_029`–`032` applied on dev + smoke-verified + fully backported (002/003/008/010/011/012/016/013); extended `013` = 40/40 PASS incl. the non-destructive from-zero rebuild (rolled back; dev intact). Nothing committed yet.** A 4-item owner update pass done before resuming the Test-engine/Leaderboard/Notifications plans.

- [x] **Prompt 1 — Private schools + numeric ordering:** `schools.is_private` + `schools.school_number` (parsed from the AZ name "N nömrəli …"; migration 029) + `ix_schools_display_order`. **Everywhere schools are listed** now sorts **PRIVATE first → numeric school_number ASC (2 before 10) → NULL numbers last → name**: admin `/schools` table + `lib/admin/schools.listSchools` + web Add-Child dropdown (`children/new` query). Admin schools page gained a **Type column (Private/Public badge)** + a **Type filter** (search/city/status/pagination unchanged); `SchoolForm` gained a **Private** checkbox (`saveSchool` derives `school_number` from the name server-side, never trusts the client). Seeded a curated starter set of 6 well-known Bakı **private** schools (admin can add/rename/remove). Verified on dev: private 6 on top, then 1,3,4,5,6… numerically (313 numbered, 1 unnumbered public). `013` #38.
- [x] **Prompt 2 — Admin "Site Content & Design" (reusable DB-backed CMS-lite):** two override layers, both read by the web-app server-side via the service-role client with SAFE fallbacks (unset/invalid ⇒ built-in i18n / CSS default, site never breaks). **(A) Site content** — `site_content(key,group_key,az,en,ru)` admin-only table (migration 031); admin page edits a curated, extensible registry of 9 server-rendered keys (nav/home/footer, defaults = current live text); `getContentOverrides()` + `getT()` layer overrides on top of i18n for SERVER-rendered surfaces (client-import components are the documented v1 gap). **(B) Design tokens** — `design.*` system_settings (font family / base size / 5 brand colours); `getSiteDesignCss()` validates STRICTLY server-side (whitelisted AZ-safe font stacks, hex colours, px 13–22) and injects CSS-var overrides into `<html>` — colours scoped to `[data-theme="light"] !important` so **dark mode (frozen reference) is untouched**; fonts via new `--font-family`/`--font-size-base` tokens on `body`. Admin: new `/site-content` page + `siteContent.ts` service (requireAdmin-first, registry allowlist, caps, audit `admin.site_content.update`) + new `color`/`fontfamily`/`fontsize` SettingEditor kinds + nav entry. `013` #40. (Delegated the admin-panel build to an isolated background agent; reviewed — authorize-first + validation confirmed.)
- [x] **Prompt 3 — 5 child-friendly light-mode palettes:** `students.palette` (5-value CHECK, migration 030) + `data-palette` set SSR on the `.arena` wrapper; `PalettePicker` (6 swatch cards incl. Default) next to the sticker picker on the child profile → `selectPalette` action (requireChild-first, self-row, whitelisted slug). Palettes **sky / bubblegum / mint / sunset / rainbow** re-map the arena tokens under `[data-theme="light"] .arena[data-palette=…]` (+ accent-tint companions) — **dark mode byte-identical** (never a `[data-theme="dark"]` rule); accents stay vivid so white-on-accent keeps AA contrast; per-student, persists across logins. `013` #39. Trilingual palette names.
- [x] **Prompt 4 — Rename OlimpIQ → OlympIQ:** owner chose to change EVERYTHING to the new spelling. Case-sensitive sweep across both apps + canonical SQL + docs + mobile markdowns: `OlimpIQ`/`OlimpİQ` → **OlympIQ** (display, titles, metadata, brand headers) and `olimpiq` → **olympiq** (domain `olympiq.ai`, scheme `olympiq://`, cookie `olympiq-admin-last-seen`, localStorage `olympiq-viewed:`, pg_cron `olympiq_advance_student_grades` via migration 032 + canonical 016, bundle `ai.olympiq.app`). **Historical `supabase/sql/migrations/` left untouched** (immutable history; 032 intentionally references the old job name to unschedule it). The AZ word **`olimpiada`** (feature names, repo/package names, env `OLIMPIADA_PROD_DB_URL`) deliberately preserved (29 files). Re-grep confirms zero old brand tokens remain outside migrations. Memory `project-name-olympiq` updated.
- **DB:** migrations `2026_07_05_029` (schools private+number), `030` (students.palette), `031` (site_content + design.* tokens), `032` (cron rename) — all applied on dev, smoke-tested, backported; `013` now 40 checks (#38–#40). Fixed pre-validation: named the palette CHECK constraint in canonical 002 (inline check had auto-generated name → #39 initially FAILed on from-zero, then 40/40).
- **Adversarial review** (multi-agent workflow, 4 lenses: security/correctness/i18n/db-consistency) found ONE real defect — **fixed**: the admin design **base font-size** token was stored as a JSON number but the web-app reader (`siteDesign.ts`) coerced it via a string-only helper → the `--font-size-base` override was silently dropped (colours + font family were unaffected). Reader now accepts number-or-string. Security lens confirmed authorize-first + registry allowlist + strict CSS-injection validation + no service-role leak; palette slugs verified consistent across all 6 sites (DB CHECK / 2 web consts / picker / CSS / profile). Re-typecheck PASS.
- Docs: MANUAL_TESTING_GUIDE **AA1–AA4** (below). Demo-data registry unchanged.

### Round 12 — pass 2 (2026-07-05): Add-Child overhaul · Free-access intervals · text-only CMS · rename follow-up

**Final gate: web typecheck+build PASS (33/33), admin typecheck+build PASS (23/23 incl. new `/free-access`); migration `2026_07_05_033` applied on dev + smoke-verified + backported (008/010/011/012/013); from-zero rebuild = 42/42; free-access DB chain smoke-tested (inactive→active→expired-lazy). Nothing committed.** Owner-answered forks: remove the design editor entirely; full client-provider CMS coverage; free-access as a NEW mechanism alongside giveaway + admin-grant.

- [x] **DB (migration 033):** `free_access_intervals` (per-parent OR per-child window; admin-only RLS) + 3 lazy `SECURITY DEFINER` helpers (`is_free_access_active_for_student`, `my_free_access_active`, `current_parent_free_access` — scoped to `current_profile_id()`); both attempt RPCs honor a free interval (mirrors giveaway — nothing to unwind). `site_content` gained `section`/`menu`. `design.*` settings DELETED. `013` #40 updated + #41 (design removed) + #42 (free-access). From-zero 42/42.
- [x] **Design/font/colour editor REMOVED** (owner): web `siteDesign.ts` deleted + layout injection + `body` font vars reverted; admin `color`/`fontfamily`/`fontsize` kinds + `design.*` META/validation + Design cards + `design.*` i18n removed. `/settings` unaffected.
- [x] **Hierarchical text-only "Website Content" CMS:** `/site-content` reshaped into a **Section → Menu → text** stepper (`ContentManager` + `siteContentRegistry` = **101 curated keys** across Landing/Student/Parent, defaults from the live web i18n; `saveSiteContent` registry-allowlisted + audited, writes section/menu). **Full client coverage**: new web `I18nProvider` + `useT()` at root with the current-locale DB overrides; `ThemeToggle` migrated override-aware (the ~19 dict-prop client components were already override-aware via server `getT()`).
- [x] **Admin Add-Child overhaul:** server-side **debounced parent autocomplete** (`searchParents` — name + phone + email + child count, sanitized `ilike`, real-parents only, capped; loading/empty states); **mandatory City → School cascade** (private-first + numeric, optgroups) wired through `create_child_account` (was NULL) with server-side school∈city re-validation.
- [x] **Free-access intervals — admin `/free-access`** (create/list/deactivate): parent autocomplete + optional specific-child + `datetime-local` start/end (end>start guard) + note; `createFreeAccessInterval`/`deactivateFreeAccessInterval` (requireAdmin-first, ownership re-validated, audited); status pills; nav + audit mappings.
- [x] **Free-access intervals — parent/child integration:** web `freeAccess.ts` (`getParentFreeAccess`/`getChildFreeAccessActive` via scoped RPCs); `paidMutationGate` blocks paid writes when active (like giveaway); subscription + subscribe pages show free/0; a **countdown banner** (reused `GiveawayBanner`) on parent pages while a window is active (only when the global giveaway isn't already showing one); child dashboard grants full access + all subjects. `gate.freeAccess` / `fa.*` i18n ×3.
- [x] **Rename follow-up:** package names → `olympiq-web-app`/`olympiq-admin-panel`; "Olimpiada Portal" → **OlympIQ** across 31 SQL-header/doc files. KEPT (would disrupt): `OLIMPIADA_PROD_DB_URL` env var + the AZ word "olimpiada". Memory `project-name-olympiq` updated.
- Docs: MANUAL_TESTING_GUIDE **BB1–BB7** (below).
- **Adversarial review** (multi-agent, 4 lenses) found + **fixed** 4 real defects (migration `034` + web edits, re-typecheck+build both apps, from-zero 42/42): **(major)** the free-access gate + subscribe/subscription display used the PARENT-WIDE flag, so a window for one child wrongly blocked paying for an uncovered sibling → now **per-child** via a new caller-scoped `is_child_free_access_active(p_student)` RPC + `paidMutationGate(studentId)`; **(major, ×same-root)** the subscribe page's free state is now scoped to the specific child; **(major)** the admin `datetime-local` interval inputs were submitted naive and parsed as server-UTC (offset shift) → now converted to UTC ISO in the admin's browser before submit; **(minor)** `is_free_access_active_for_student` was over-granted to `authenticated` → revoked (internal SECURITY-DEFINER callers only; the scoped RPC is the authenticated entrypoint). Verified: base helper not authenticated-executable, scoped RPC authenticated-only, from-zero 42/42.

### Round 12.1 (2026-07-05): Free Access page = single create→schedule workspace · full-codebase audit

**Owner decisions this pass:** (1) free-access "add/remove subjects" model APPROVED as-is (interval = everything free, giveaway-style override; no comped subject rows); (2) account creation MOVES from Accounts to the Free Access page; (3) full security/logic/architecture audit → findings MD to work through later; the Test-engine → Leaderboard → Notifications order stays next after that.

- [x] **Admin `/free-access` restructured into 4 sections** — Create parent → Create child → Schedule free access → Scheduled intervals. The creation forms are the SAME components/server actions the Accounts page used (`AccountCreateForm`→`createParent`, `CreateChildForm`→`createChildForParent` — moved, not duplicated; zero backend changes needed). A parent created in section 1 is immediately findable in the live `searchParents` autocomplete of sections 2–3.
- [x] **Accounts page = list/manage only** — creation card + its grades/pricing/cities/schools loading + strings removed; search/edit/delete/child-password-reset untouched. Subtitle already described monitor/reset only.
- [x] `createParent`/`createChildForParent`/`updateParent`/`deleteChild`/`deleteParent` now also `revalidatePath("/free-access")` (names/rows render there).
- [x] i18n ×3: `freeAccess.createParentHeading/Help`, `freeAccess.createChildHeading/Help`, refreshed `freeAccess.subtitle`.
- [x] **Validation:** admin typecheck + build PASS (23/23; `/free-access` 4.4 kB, `/accounts` slimmed). No web-app changes this pass.
- [x] **Full-codebase audit** (6 read-only lenses: web security, admin security, SQL/RLS, business logic, architecture/connectivity, performance) → findings compiled in **`docs/CODEBASE_AUDIT_2026_07_05.md`** (to be worked through later, per owner).
- Docs: MANUAL_TESTING_GUIDE **BB8**.

### Round 13 (2026-07-05, IN PROGRESS): audit remediation + Test Engine (T0–T2)

**Owner decisions:** olympiad packages stay PURCHASABLE during a free-access window (M11 — deliberate); `/olympiad-preparation` joins the public nav (M20); topic tests = FIXED 25 questions / 25 minutes (no admin knob); daily tasks NOT in this stage; plan defaults adopted: unlimited attempts w/ fresh re-draw, TRUE resume, full results+review depth; option shuffling deferred. **MCQ-only launch rule (new, owner):** only MCQs (single-choice, exactly 5 options, exactly 1 correct) exist at launch; question creation + bulk import validate strictly per-type; per-type structural rules become manageable on the admin question-types page. Commit-message style rule added to CLAUDE.md.

**Plan:**
1. Migration `035` — audit Batch-1 DB hotfix: H1 revoke, H2 admin-only gate, H3 answer-options RLS lockdown, H4 `status` typo, H5 grading dedup/membership, H6 subject-coverage check, C2 live-plan guard + partial unique index + advisory lock (M14), M26 idempotent ID allocation, M12 purchase guard (event passed), L17 re-purchase amount, M23 question indexes, L12 leaderboard RLS. Apply dev → backport → from-zero.
2. Migration `036` — access lifecycle (C1): lazy date checks in attempt RPCs, `recompute_child_access()` + hourly pg_cron, financial-record retention on account deletion (M13/L13: FKs → set null, rows preserved).
3. Background agents fix app-layer findings in parallel: admin-panel (H9-admin, H10, H11, M1–M5, M15, M18, M19, M22, L8–L11, L21) and web-app (H9-web, H8, M6–M10, M12-listings, M15–M17, M20–M21, M24–M25, L1–L7, L16, L19–L20).
4. Migration `037` — Test Engine T0 (attempt columns, 6 RPCs, expiry cron) + `question_types` structural config (options_required / correct_required / selectability; only MCQ active).
5. T1/T2 UI (child test flow: subject→topic/subtopic→instructions→timed player→results→review) + admin MCQ strict validation + question-types management page.
6. Full validation gates (typecheck+build ×2, dev migrations, from-zero, smoke tests) + docs (audit MD statuses, testing guide CC section).

**Progress (2026-07-06):**
- [x] **Audit remediation COMPLETE** — every Critical/High and all actionable Medium/Low findings fixed; per-ID outcome table added at the top of `docs/CODEBASE_AUDIT_2026_07_05.md`. App-side: admin-panel 17/17 items, web-app 25/25 items, both typecheck PASS. Notables: middleware files MOVED to `src/` in both apps (they had never been registered — idle logout + session refresh now actually run); accounts page paginated + single joined role query; guards `cache()`-memoized in both apps; child-login IP throttle + `ipHash` wired; DB-driven prices replace the hardcoded 2/6/50 copy; free-access now honored by the child olympiads tab, parent dashboard pills, and the Add-Child/subscribe activation path (`FreeActivation`); I18nProvider ships single-locale dict (~30–50 KB gz saved on every page); public chrome reads wrapped in `unstable_cache(60s)`; ESLint configs added; dead code deleted.
- [x] **DB (migrations 035/036/037 applied to dev + fully backported to 001/003→005/007/010/011/012/013/015/016):** from-zero rebuild = **49/49 PASS** (checks #43–#49 added). New pg_cron jobs: `olympiq_recompute_child_access` (hourly) + `olympiq_expire_stale_attempts` (15 min) alongside grade promotion.
- [x] **Test Engine T0 smoke-tested on dev (rolled back):** MCQ rules (4-option and 2-correct payloads rejected, 5/1 accepted), start → TRUE resume → no answer-key leak in the player payload → autosave (`saved:1, remaining:1500`) → submit (graded, idempotent re-submit) → review reveals keys only post-grading → cancel = `canceled`.
- [x] **MCQ-only launch config:** `multiple_choice` (the owner's MCQ — the only type kept on the live taxonomy) = exactly 5 options / exactly 1 correct / only ACTIVE type; other seed types inactive; `assert_question_type_rules` enforced inside both bulk-import RPCs.
- [x] **T1/T2 child TEST UI** — new `child/test/**` route group + `testActions.ts` (guard-first, isUuid-checked, capped arrays, trilingual errors) + `TestSetup` (tri-state topic→subtopic picker + instructions/consent gate) + `TestRunner` (server-deadline countdown w/ color states, palette, flag, 30s autosave + deadline auto-submit, submit/cancel confirm Modals, beforeunload guard, resume) + results (per-topic bars) + review (post-grading keys + explanations) + test home (subject cards, continue-card, history) + arena **Sınaq** tab. `test.*` ×80 keys ×3 locales. Answer keys verified absent from all pre-grading payloads.
- [x] **Admin MCQ management** — `saveQuestion` mirrors `assert_question_type_rules` (active-type gate for new questions, exact 5 options / exact 1 correct with specific trilingual errors); `QuestionForm` renders exactly-N option rows + radio-like correct markers + rules line; bulk templates → 5/1 MCQ + rules note; NEW dedicated **`/question-types`** page (list w/ rules summary + question count; edit name/status/options_required/correct_required, code immutable; delete blocked when in use; audited) replacing the generic registry entry. `qt.*`/`qval.*`/`qrule.*` etc. ×29 keys ×3.
- [x] **Builds:** admin PASS (25 routes incl. `/question-types` ×2) · web PASS (incl. the 5 new `child/test/*` routes). **`ƒ Middleware` now appears in BOTH build outputs** (~90 kB) — audit H9 proven fixed at the build level (it was absent from every earlier build).
- Docs: MANUAL_TESTING_GUIDE **CC1–CC4** (audit fixes visible touchpoints, subscription lifecycle, test engine, MCQ admin).
- **Run-order docs corrected (2026-07-06):** canonical `016_scheduled_jobs.sql` (pg_cron) was missing from the run-order docs — added to `README_RUN_ORDER.md`, `SUPABASE_SQL_RUN_ORDER.md`, `supabase/CLAUDE.md`, the versioning-workflow README, and MANUAL_TESTING_GUIDE §6. Documented the **first-time production build = run canonical `001`→`012`,`014`,`015`,`016`,`013`(last) in order** (migrations are NOT replayed on a fresh prod DB — already backported; enable `pg_cron` before `016`). Owner confirmed production doesn't exist yet; the dev/staging project holds migrations `035/036/037`.

### Round 13.1 (2026-07-06): pre-commit owner changes — bulk-upload modal, question-create modal, olympiads purchase-only, public prep page removed

**Owner rulings:** (1) Bulk Upload becomes a modal with MANDATORY Subject + Grade selection (applies to the general question bank AND the olympiad private pool; UX harvested FROM the owner's UniPrep-Admin reference, implemented natively). (2) The public `/olympiad-preparation` marketing page is removed entirely (the paid olympiad module stays). (3) **Olympiad packages are purchase-only in EVERY mode** — free-access intervals, trials, and the giveaway window grant free SUBJECT access only; they never open olympiad packages, and purchases are now ALLOWED during a giveaway (previously blocked because access was free). (4) Manual question creation happens in a modal on /questions — no page navigation.

- [x] **DB (migration `2026_07_06_038_olympiad_purchase_only.sql`, applied dev with in-file self-verify PASS; backported to canonical `011` + flipped checks `013` #37/#42):** `start_olympiad_attempt` is purchase-gated again — the Round-11/12 giveaway/free-access fallback removed; `start_practice_attempt` (subjects) keeps both free-window helpers. #37/#42 now assert the helpers appear in the practice guard and are ABSENT from the olympiad guard. **From-zero rebuild = 49/49 PASS**; live-dev spot-check of both flipped checks PASS.
- [x] **Admin-panel:** new reusable `Modal.tsx` (portal, aria-modal, Esc/overlay close, busy-lock, scroll lock, wide variant) + shared `BulkUploadModal.tsx` for BOTH surfaces (mode switched by `packageId`): mandatory Subject (read-only package subject on the olympiad surface) + Grade selects, client-side JSON pre-validation (2 MB cap, per-row az-body/options checks, MCQ exactly-5/exactly-1 mirror), per-row issues panel, updated template downloads (meta stripped of subject/grade_level — modal supplies them; old-format files still work, modal selection takes precedence), post-success refresh. Server actions extended: `bulkImportQuestions` + `bulkImportOlympiadQuestions` validate `subject_id`/`grade_id` (UUID + existence) and inject the resolved `subjects.name`/`grades.level` into every item's meta before the RPC (matches the RPC's name/level resolution exactly). `NewQuestionModal.tsx` opens the complete `QuestionForm` in a wide modal (`__stay` path in `saveQuestion` returns success instead of redirecting; edit page unchanged; media upload stays on edit). DELETED: `/questions/import` + `/questions/new` routes, `BulkImportClient.tsx`, `OlympiadBulkImport.tsx`. 17 new i18n keys ×3. Typecheck + build PASS (routes confirm both pages gone).
- [x] **Web-app:** deleted `(public)/olympiad-preparation/` + nav/footer links (+ 7 page-only i18n key families removed ×3, incl. `nav.olympiad`, `gvw.olyFree`); child olympiads tab shows planned section always and playable = OWNED purchases only (free-play merge, free chips, gvw eyebrow chip all removed); `buyOlympiad`/`purchaseOlympiadForChild` now transact in real/demo/giveaway (block only `off`); parent catalog + per-child page show the normal buy CTA during a giveaway; `?err=` notice added on the child olympiads page (graceful message if a stale row hits the new DB guard); `billing.giveawayNote` rescoped to subjects. Subject free access untouched (`childSubjects.ts`, dashboard pills, subscription gating). Typecheck + build PASS (32 pages, route absent).
- Docs: MANUAL_TESTING_GUIDE **DD1–DD3**.

### Round 14 (2026-07-06): LEADERBOARD (L0–L2) — per docs/plans/LEADERBOARD_PLAN.md

**Owner decisions (resolved via AskUserQuestion):** points = difficulty-weighted per-correct + per-subject daily cap; scopes v1 = **Global + Subject + Grade + City + School** (full set); eligibility = ALL graded attempt kinds (practice/test/olympiad), active-access children only (inherited from the attempt-start guards — locked children cannot start attempts, so they cannot earn); period = monthly + all-time. Adopted defaults: abbreviated names honoring `leaderboard.public_display_names`, no freeze/recover in v1, tie-break `value DESC, best_streak DESC, last_points_at ASC, profile_id`.

- [x] **L0 — DB engine (migration `2026_07_06_039_leaderboard_engine.sql`, applied dev, self-verify PASS; backported to canonical 002/006/010/011/012/016 + checks #50/#51):** append-only `student_points_ledger` (`UNIQUE(attempt_id)` — an attempt scores ONCE, replay/regrade-safe) + `student_activity_days` (streak ground truth) + cached `students` columns (points_all_time/month/month_key, current/best_streak, last_active_date, streak_tz default Asia/Baku). **SINGLE WRITER = one AFTER UPDATE trigger** on `test_attempts` firing `award_attempt_points()` exactly on the →`graded` transition (deliberate deviation from the plan's per-RPC calls: one trigger covers every grading path with zero duplication; exception-safe so points can never break grading). Formula: `per_correct(10) × difficulty_levels.weight` (already-seeded easy 1/medium 2/hard 3/olympiad 5) over correct stored answers; olympiad ×1.5; practice+topic tests share a per-subject per-local-day cap (150) — all 3 knobs in `system_settings`. **Anti-forgery:** clients have NO write path to ledger/activity (RLS select-own/parent/admin only) and a BEFORE UPDATE trigger on `students` rejects client-role changes to the cached columns (the row-level `students_write` policy would otherwise let a child set their own points). Board reads: `lb_rows` (internal, service-only) + `get_leaderboard` (top-N, deterministic tie-break, anonymization server-side) + `get_my_leaderboard_rank` (caller-scoped, no IDOR) + `get_streak_status` (lazy loss zeroing) — streak board global-only; city scope = `students.district_id` (districts double as cities per migration 017). Season: `leaderboard_month_rollover` snapshots the closed month **FROM THE LEDGER** (race-immune) into `leaderboard_periods`+`leaderboard_snapshots`, then zeroes stale month caches; daily cron `olympiq_leaderboard_rollover` (00:25 Baku, acts on the 1st) + `admin_reset_leaderboard('season'|'hard')` (service-role only). **Dev smoke 7/7 PASS (rolled back):** grade→ledger+cache+streak; idempotent re-award; global/subject boards + my-rank + streak status via impersonated child JWT; client points-UPDATE rejected; season reset = snapshot written + month zeroed + all-time kept. **From-zero rebuild = 51/51 PASS.**
- [x] **L1 — child board UI (web-app):** `child/leaderboard` rebuilt from the placeholder — Points|Streak tabs, scope chips Global|Subject|Grade|City|School (a chip renders only when the child has that id; subject chip row via `getChildSubjectAccess`), This month|All time toggle, top-50 with medals + self-highlight + localized anonymized rows ("Şagird •7231"), sticky Your-rank card (`get_my_leaderboard_rank`), streak card (flame, best, at-risk `~N h left` urgency) — all searchParams-driven server rendering with whitelist validation; behind the existing `leaderboard` flag. The header streak chip in `child/layout.tsx` was silently fake (counted distinct days over the last 60 attempts) — rewired to `get_streak_status`. `lb.*` 29 keys ×3. Typecheck+build PASS.
- [x] **L2 — admin management (admin-panel):** new Admin-only `/leaderboard` (requireAdmin; CM excluded from route + nav): boards viewer (board/scope/scope-id/period via FilterBar-style whitelisted searchParams, top-100, anonymized-row pills), points-formula editors reusing `SettingEditor`/`updateSetting` (min/max now enforced SERVER-side for all number settings) + hints linking the `leaderboard` flag / display-names setting, and Season-close + Hard-reset buttons (shared Modal confirms; hard = double-confirm w/ acknowledgement checkbox) → `resetLeaderboard` action (requireAdmin → service-role RPC → `admin.leaderboard.reset` audit row severity warning/critical → revalidate). Audit page humanizes the new action. 53 keys ×3. Typecheck+build PASS (23/23 routes incl. `/leaderboard`).
- **Deferred (documented):** difficulty-weight editing UI (weights live in `difficulty_levels.weight`, seeded differentiated; the L2 hint auto-links if a `difficulty-levels` manage resource is ever registered); parent read-only rank view in Analytics; achievements; snapshot-backed reads for very large boards (L3).
- Docs: MANUAL_TESTING_GUIDE **EE1–EE3**.

### Round 15 (2026-07-07): MCQ=4 + strict bulk validation · 3-status lifecycle · leaderboard visibility · season CRUD · Free-Access wizard

**Owner rulings (resolved via AskUserQuestion):** content statuses collapse to **In review / Published / Rejected** for **questions AND news** (creation lands in In review); MCQ = **exactly 4 options** / 1 correct (fixed rule, not admin-editable); parent leaderboard view in **both** dashboard + analytics; **named seasons** managed alongside the unchanged monthly/all-time boards.

- [x] **DB migration `2026_07_07_040`** (applied dev, self-verify PASS; backported 004/011/012/014, check #49 updated): remapped existing `questions`+`news` rows (draft→in_review, approved→published, archived→rejected); both default to `in_review`; MCQ `options_required` 5→4; `bulk_insert_questions` lands imports in `in_review`. The `content_status` enum keeps its 6 physical values (shared type; only 3 are used now).
- [x] **DB migration `2026_07_07_041`** (applied dev, self-verify + functional smoke PASS; backported 006/010/011/012, checks #52/#53): `leaderboard_seasons` table (admin-only RLS) + service-role CRUD RPCs (`create/update/delete/close/reopen_leaderboard_season`, `get_season_standings` — live from the ledger while open, frozen `standings_json` once closed) + parent `get_child_leaderboard_summary` (linked-parent/admin only) + the `leaderboard` feature flag **enabled** (seed default now true). **From-zero rebuild = 53/53 PASS.**
- [x] **#1 MCQ + strict bulk import (admin):** the manual form renders exactly 4 option rows (rule-driven); **Source removed** from the question schema/form/templates; bulk import now does **strict per-row TS validation** returning SPECIFIC trilingual messages (not-object / no-az-body / unknown-type / option-count `{n}/{got}` / correct-count / option-text `{i}` / too-long / unknown-subject|grade / structure / generic) instead of the old generic "row could not be imported" — validation extracted to a shared `lib/admin/bulk-validate.ts` used by **both** the general bank and the olympiad private pool; templates + client pre-validation are 4-option, source-free. Question-types page: the "Exact number of answer options" editor was removed (options_required is a fixed rule; save preserves it).
- [x] **#2 3-status lifecycle (admin, questions + news):** new model `in_review/published/rejected` with actions publish (in_review/rejected→published, content.publish), reject (in_review/published→rejected, content.review), to_review (published/rejected→in_review); admins bypass. Applied to questions + news lifecycle/table/filters. **Bulk actions fixed** — `bulkTransitionQuestions` now returns `{updated, skipped}` and the table shows a trilingual feedback banner (was a silent no-op). Removed submit/approve/unpublish/archive from the content domain (olympiad-package archive is separate, kept).
- [x] **#3 leaderboard visibility (web):** flag enabled → the child **Reytinq** nav tab shows; new child home quick-look card (this-month rank + points + streak, links to the full board); parent **dashboard** per-child chip (#rank · points · 🔥) + parent **analytics** per-child panel (rank month/all-time, points, current+best streak) via `get_child_leaderboard_summary`. All gated by the flag; `plb.*` ×3.
- [x] **#4 season CRUD (admin):** Leaderboard page Section 3 = full Seasons manager (create/edit/close/reopen/delete + view live/frozen standings), audited (`admin.leaderboard.season.*`); the old month-reset control relabeled to avoid confusion with named seasons; hard reset kept. `lbseason.*` ×3.
- [x] **#5 Free-Access guided wizard (admin):** the Free-Access page is now a sequential **Parent → Child → Schedule** stepper (`FreeAccessWizard`): Step 2 locked until a parent is chosen (create-new or pick-existing), Step 3 locked until a child target is set (create child under the locked parent / pick an existing child of that parent via `getParentChildren` / all children), then schedule the window. `createParent`/`createChildForParent` extended to return the new ids; `AccountCreateForm`/`CreateChildForm` gained `embedded`/`lockedParent`/`hideGrant`/`onCreated`; created ids flow only from server-action results; the intervals table (+ Deactivate) stays below. `fawiz.*` ×3.
- Docs: MANUAL_TESTING_GUIDE **FF1–FF5**.

### Round 16 (2026-07-07, IN PROGRESS): NOTIFICATIONS — per docs/plans/NOTIFICATIONS_PLAN.md

**Owner rulings (AskUserQuestion):** in-app LIVE now; email + push fully architected but OFF behind flags (`notifications_email`/`notifications_push`) until an SMTP provider / the mobile app exist (flag-flip to go live); BOTH parents and children get direct inboxes (admin targets all-parents / all-children / one family / children-by-subject / individual; parents also get child-critical events); per-channel preferences with PARENTS managing their children's; retention prune of READ notifications > 180 days + cap 500/user (editable in settings).

- [x] **N0 — DB engine (migration `2026_07_07_042`, applied dev, self-verify + full security smoke PASS; backported 001/008/010/011/012/016, checks #54/#55):** `notifications` gained idempotency_key(UNIQUE)/priority/category/action_url/expires_at; new `admin_notifications` (broadcast records), `notification_preferences` (per-channel, parent-managed), `push_tokens` (mobile-ready). **Security posture:** NO client INSERT/UPDATE on `notifications` (RLS drops those policies) — rows are created ONLY by the SECURITY DEFINER `create_notification`/`admin_send_notification` path (service-role), so users can never forge/edit; read_at flips ONLY via owner-checked `mark_notification_read`/`mark_all`; users may delete their own rows. **Idempotency** via `idempotency_key` + ON CONFLICT DO NOTHING (at-most-once). RPCs: producer `create_notification`, broadcaster `admin_send_notification` (audience resolver, per-recipient idempotency, in-body admin/`notifications.send` check), `get_notification_target_count`, mark-read/all/unread-count/delete, get/set preferences (owner or linked-parent), `upsert_push_token`, processor `claim_pending_deliveries` (FOR UPDATE SKIP LOCKED, service-role) + `mark_delivery_result`, `dispatch_scheduled_notifications`, `prune_notifications`. New permission `notifications.send` (admin only; CM excluded). Flags `notifications`(on)/`notifications_push`(off); `notifications_email` stays off. Trilingual template seeds (news/olympiad/attempt/personal-best/streak/subject-expiring/charge-failed/canceled/giveaway/announcement ×3). Cron: dispatch (5-min) + prune (nightly). **From-zero rebuild = 55/55 PASS**; smoke proved idempotent dedup, RLS-blocked forge, owner-scoped mark-read, admin broadcast fan-out, parent-sets-child-prefs, prune.
- [x] **N1 — In-app center (web):** parent + child notification bell (unread badge + dropdown) + `/notifications` + `/child/notifications` pages + Realtime per-user channel (`recipient_profile_id=eq.<me>`) + toast-on-insert + parent-managed per-channel preferences UI (self + per-child rows on `/profile`). Singleton browser client added; behind the `notifications` flag. Typecheck + build PASS. `notif.*` ×3.
- [x] **N2 — Admin composer (admin-panel):** Administrator-only Notifications module (`notifications.send`; CM excluded) — composer (template picker, audience selector + debounced live recipient count via `get_notification_target_count`, channel toggles, datetime schedule, preview, large-audience confirm) → `admin_send_notification` + audit; broadcast history + detail modal; template CRUD (per code ×3 locales); settings (retention + channel master flags). Audit actions registered. `ntfadmin.*` ×3. Typecheck + build PASS.
- [x] **N3 — Event generators:** olympiad purchased (child+parent), attempt graded (child, with score), subscription canceled (parent) wired via `create_notification` (service-role `getAdminClient`, try/catch-guarded, idempotency-keyed); News published broadcasts to all parents + children (try/catch so publish never breaks). Time/payment-driven events (trial/period ending, charge failed, giveaway ending) intentionally deferred to when the payment provider + scheduled scanners land — they reuse the same producer.
- [x] **N4/N5 — Delivery + mobile:** service-role BFF processor `POST /api/notifications/process` (`NOTIFICATIONS_PROCESSOR_KEY`, constant-time guard) claims pending deliveries (`claim_pending_deliveries`), dispatches per channel via the `delivery.ts` seam, records results, and promotes due scheduled broadcasts — a no-op while the channel flags are off (no delivery rows created). Email seam (`NOTIFICATIONS_SMTP_URL`) + push seam (`EXPO_ACCESS_TOKEN`) are one function-body away. **Mobile foundation FULLY prepared** (`push_tokens` + `push` channel + `upsert_push_token` + `notifications_push` flag + `action_url` deeplink contract) — documented in `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`. Migration 043 put `notifications` in the `supabase_realtime` publication.
- **Next (later, tracked):** `docs/PRODUCT_COMPLETION_BACKLOG.md` items are the follow-up backlog after notifications. Small deferred cleanup: unused `FreeAccessManager` wrapper + a few orphaned `freeAccess.*` keys (harmless; owner OK to leave).
- Docs: MANUAL_TESTING_GUIDE **GG1–GG4**.

### Round 17 (2026-07-08): notification/test/profile fixes + admin editing + backlog audit

Owner punch-list across notifications, the test player, profiles/accounts, plus a full re-verification of `docs/PRODUCT_COMPLETION_BACKLOG.md`.

- [x] **Notification bugs fixed (web):** root cause was un-awaited RPC builders in `useNotifications.ts` (`supabase?.rpc(...)` never executes) — mark-read/mark-all/delete now **await + check error + roll back on failure**, so read/delete persist and survive refresh; the badge is correct after refresh (mark-all/delete also `router.refresh()` to re-sync bell + page). A no-deep-link notification now opens a professional **detail modal** (title, formatted body, category, time, safe `data_json`) instead of a dead click; admin bodies render a **safe markdown subset** (`**bold**`/`*italic*`/`[link]`, escape-then-format).
- [x] **Scheduled-notification cron fixed + multi-recipient (DB migration `2026_07_08_044`):** migration 042 scheduled the notification cron only in the canonical 016 backport, so DEV never got `olympiq_dispatch_scheduled_notifications`/`olympiq_prune_notifications` — 044 schedules them (guarded) and flushes the overdue stuck broadcast. `lb_notify_audience` now resolves `audience_filter.profile_ids` (uuid array) for multi-parent sends (backported to canonical 011). **From-zero rebuild = 55/55.**
- [x] **Admin notification composer (admin):** removed the "Individual person" audience; channel label **Push → "Mobil tətbiq"** (Mobile app / Мобильное приложение); **rich-text** toolbar (Bold/Italic/Link → minimal markdown) with a safe live preview; **multi-parent** selection (searchParents → deduped removable chips → `{profile_ids:[…]}`; live recipient count; server validates/caps the UUID list).
- [x] **Test player + results UI (web):** the flag/report control is now a **bookmark/Save** icon (outline↔filled) with Save/Unsave/Saved labels; the test header shows **Subject · Topic** from the fetched attempt (not hardcoded); palette numbers **perfectly centered** (flex, box-sizing); the legend lays out **one-line/responsive** (no "Current Question" wrap); the review page gained **filter tabs (All/Correct/Wrong/Skipped with counts)** via a new client `TestReviewList`.
- [x] **Profiles + accounts editing:** child profile shows a **read-only** grade/city/school section; **parents can edit a child's info** (`(parent)/children/[id]/edit` + `updateChildProfile`, ownership-checked, internal IDs read-only); **admin can fully edit parent AND child accounts** (`updateParent` +email/phone via service-role auth admin; new `updateChildAccount` with City→School cascade; IDs read-only; both audited).
- [x] **"Today's Round" Start fix (web):** the home hero + per-subject Start buttons no longer call the failing `startPractice` (which bounced to `/child?practice=empty`) — they now **Link to `/child/test/[subjectId]`** (the real test engine's subject page), passing the subject correctly.
- [x] **Backlog audit (verified 2026-07-08):** re-checked all 32 items in `docs/PRODUCT_COMPLETION_BACKLOG.md` against code + DB → **8 done / 8 partial / 14 not-done**; 9 advanced since 2026-07-04 (access-recompute, leaderboard, notifications, ESLint, brand rename, dev cron, phone, + partials A3/B8). MD updated with a verification block + inline ✅ marks. Launch-critical root remains **A1 payment provider + webhook** (A3/A4/A5 depend on it).
- Both apps: typecheck + build PASS. Docs: MANUAL_TESTING_GUIDE **HH1–HH6**.

### 📱 Stage M1 — Mobile Foundation, Admin Control Plane & Authentication (ACTIVE, started 2026-07-09)

**This is the ACTIVE stage.** Source: `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` §M1 + master plan v3. Owner said "start M1".

**Implementation plan:**
1. **DB (migration `2026_07_09_045_mobile_control_plane.sql`):** `mobile_app_versions` table (per-platform min/latest/force/store_url + trilingual message; admin-only RLS; audit + updated_at triggers; ios/android rows seeded) → canonical `008`/`010`/`011`/`012`; `get_mobile_config()` anon-callable whitelist RPC (payment MODE resolved in-DB with paymentMode.ts parity incl. lazy giveaway expiry; flags; maintenance; locales; contact/social; per-platform version block) + `get_mobile_content(p_locale)` (site_content override map for one locale) → canonical `011`; `013` checks #56 (objects + RLS + anon-exec) & #57 (config JSON whitelist shape). Apply dev → smoke → backport → from-zero rebuild.
2. **Admin panel (agent, disjoint):** Admin-only "Mobile App" section — `/mobile-app` page (iOS/Android version-gate cards), `lib/admin/mobileApp.ts` (requireAdmin-first, semver/URL/length validation, audited `admin.mobile_version.update`), nav + audit mapping + trilingual `mobileapp.*` keys.
3. **Web-app BFF (agent, disjoint):** `/api/mobile/v1/auth/child-login` (wraps the childLoginService contract: validate → DB lockout → bare token-mode sign-in via synthetic email → record attempt → returns session tokens; per-IP rate limit + generic errors) and `/api/mobile/v1/auth/register` (wraps the registerParent contract: same validation/rate limits → signUp → `setup_parent` → phone persist → tokens or verify-email status). Response contract `{ok,data}` / `{error:<i18nKey>,retryable}`. Web typecheck+build gate.
4. **Mobile app (main session):** Expo scaffold in `mobile-app/` (TS strict, expo-router, New Arch; scheme `olympiq`, id `ai.olympiq.app`); `eas.json` 3 profiles; theme tokens (light/dark/arena/arena-light + 5 palettes) + ThemeProvider; i18n sync script (web `messages.ts` → generated catalog) + mobile overlay + `getT` + runtime CMS-override layer; SecureStore session adapter (chunked — tokens never in plain AsyncStorage); typed BFF client; deep-link allowlist router + `isSafeRelativeUrl` port (jest-tested); config bootstrap + Maintenance/ForceUpdate gates; root state machine (public stack ↔ parent/student tab scaffolds); parent login/register + child login screens wired end-to-end; design-system primitives + `/gallery` dev screen.
5. **Validation:** mobile `tsc`/lint/jest/`npm audit`; web + admin typecheck/build; from-zero DB 57/57; docs (this file, `MANUAL_TESTING_GUIDE.md` M1 section, `mobile-app/markdowns/API_CONTRACTS.md` new).

**✅ M1 COMPLETE (2026-07-09). Final gate: mobile `tsc --noEmit` PASS · `expo lint` clean · jest 20/20 PASS · `npm audit` 0 (scoped `xcode→uuid` override) · Metro export bundles (3.9MB hbc, full route tree) · admin typecheck+build PASS (32 routes incl. `/mobile-app`) · web typecheck+build PASS (both `/api/mobile/v1/auth/*` routes) · migration 045 applied dev + anon smoke PASS + backported (008/010/011/012/013) · from-zero rebuild = 57/57 PASS. Nothing committed yet.**

- [x] **DB control plane (migration `2026_07_09_045`):** `mobile_app_versions` (per-platform min/latest/force/store_url + trilingual message; admin-only RLS — anon sees 0 rows direct; audit + updated_at triggers; ios/android seeded) + anon-callable whitelist RPCs `get_mobile_config()` (payment MODE resolved in-DB with paymentMode.ts parity incl. lazy giveaway expiry + `giveaway_ends_at`; 6 module flags; maintenance; locales; contact/social; per-platform version block — `013` #57 pins the exact 7-key shape) and `get_mobile_content(p_locale)` (site_content override map, cap 500). Checks #56/#57; function-list check #5 extended.
- [x] **Admin panel — Mobile App section:** `/mobile-app` (Admin-only; Operations nav) — per-platform version-gate cards (semver + https + length validation server-side, requireAdmin-first, diff-aware save, audited `admin.mobile_version.update`, Asia/Baku updated-at); audit page mappings; 30 trilingual `mobileapp.*` keys.
- [x] **Web BFF (auth):** `POST /api/mobile/v1/auth/child-login` (per-IP throttle `mchildlogin` 20/15min + DB lockout + bare token-mode sign-in via synthetic email + attempt recording + generic errors → session tokens) and `POST /api/mobile/v1/auth/register` (extracted shared `parentValidation.ts` — `registerParent` now consumes it, behavior identical; SHARED `register` rate bucket; signUp → `setup_parent` → tolerant phone persist → tokens or `verify_email`). Contracts documented in `mobile-app/markdowns/API_CONTRACTS.md`.
- [x] **Mobile app scaffolded + foundation built** (Expo SDK 57, RN 0.86, TS strict, expo-router, New Arch; scheme `olympiq`, ids `ai.olympiq.app`; eas.json 3 profiles/channels; runtimeVersion appVersion): theme tokens mirroring ALL web palettes (light/dark/arena/arena-light + 5 child palettes) + ThemeProvider; **i18n sync pipeline** (`scripts/sync-i18n.mjs` → 1004 keys ×3 generated from the web catalog + `messages.mobile.ts` overlay + runtime **CMS override layer** via `get_mobile_content`, locale clamped to admin-enabled set, persisted); **chunked SecureStore session adapter** (tokens never in plain AsyncStorage — chunking chosen over the MMKV-ciphertext variant: everything stays in the OS keystore, Expo-Go-testable; master plan §5 updated); supabase client (URL polyfill, foreground auto-refresh); typed BFF client (timeouts, i18n-key errors); **deep-link allowlist router** (`isSafeRelativeUrl` port + role-aware resolve/defer/mismatch + replay-after-login) — jest-tested; **root state machine** (splash → boot-error retry → force-update → maintenance → public stack ↔ parent 5-tab / student 5-tab arena-chrome scaffolds with flag-gated Olympiads/Ranking tabs) with foreground config revalidation; **auth screens** (Welcome; Login w/ Parent|Student segmented tabs, 8-digit grouped ChildIdField; Register w/ searchable-country PhoneField + verify-email state); AccountSheet (language/theme/logout); design-system primitives + `/gallery` dev screen (types/buttons/fields/gates/empties/skeletons/arena palette swatches). Deps: +@supabase/supabase-js, @tanstack/react-query, zustand, expo-secure-store, expo-linear-gradient, react-native-svg, expo-localization, react-native-url-polyfill (dev: jest-expo, eslint-config-expo); @gorhom/bottom-sheet + MMKV persister deliberately deferred to M2 (STATUS-noted per the dependency policy).
- **Deferred in-stage (tracked):** custom app icon/splash artwork (template art still in place — owner approval item; config already brand-cream); Maestro E2E harness lands with M2's first real flows (jest covers the M1 logic); the 3.9MB hbc bundle is measured against the §15 budget properly at M4.
- Docs: MANUAL_TESTING_GUIDE **M1-1…M1-6**; `mobile-app/markdowns/API_CONTRACTS.md` (new); master plan §5/§7.2 synced to as-built.
- **Next recommended stage: M2 — Public surface & complete parent panel.**

### Round 18 (2026-07-11): owner queue — admin Questions/Olympiad rework, question-scope leak, analytics states, olympiad timed tests, leaderboard overhaul, profile fixes

**Final gate: admin typecheck+build+lint PASS (32 routes) · web typecheck+build PASS · migrations `2026_07_11_046`–`049` applied on dev + functional smokes PASS (rolled back) + backported (011/015/013) · from-zero rebuild = 58/58 (new check #58). Nothing committed yet.** Eight owner issues, executed as 2 admin agent passes + 3 web agents (disjoint files, central i18n merge) + main-session DB work.

- [x] **Admin Questions table:** Type column + "All types" filter removed end-to-end; new **Topic** column ("—" fallback) via the `questions.topic_id → topics(name)` embed; column order checkbox·Subject·Grade·Language·Topic·Text·Status·Actions; all other filters/stat-cards/bulk tools preserved.
- [x] **Olympiad packages — create WITH questions:** New-Package page now embeds the bulk-upload section (always visible; template+upload disabled until Subject/Grade chosen; Grade now required); olympiad bulk surfaces ask NO subject/grade (inherited from the package; legacy file values ignored); creation is blocked with zero valid questions (trilingual); safe Option-A flow in ONE action `createOlympiadPackageWithQuestions`: validate file → create package → import → 0 imported ⇒ hard-delete rollback (verified: pool questions CASCADE, purchases RESTRICT, zero-purchase precheck; audited `admin.olympiad.create_rolled_back`) / partial ⇒ keep + "N imported, M skipped". Shared client pre-validation extracted to `lib/bulk-client.ts`. General question-bank bulk upload untouched.
- [x] **Question-scope LEAK root-caused + fixed:** the /questions list+counts were already filtered; the real holes were **admin-bypass paths** — the question edit-page loader (opened pool questions for admins) + 6 mutation paths without the scope clause (`saveQuestion`, `transitionQuestion`, `deleteQuestion`, `bulkDeleteQuestions`, `bulkTransitionQuestions` incl. an explicit `isAdmin ||` bypass, `bulkAssignTopic`) — all now refuse/exclude pool rows (defensive `.is("olympiad_package_id", null)` on every UPDATE/DELETE; edit URL redirects with a notice). PLUS the data-level remnant: **migration 049** backfilled legacy join-table pool questions carrying NULL scope (dev report: 1 leaked row → moved into its package; 0 ambiguous). DB check **#58** permanently asserts the scope filters in `start_practice_attempt`/`start_topic_test_attempt` and the package-scoped olympiad draw.
- [x] **Analytics skipped≠wrong (migration 046):** root cause — the engine pre-inserts an answer row per question and grading marks empty selections `is_correct=false`, so the dashboard's `wrong = NOT is_correct` folded skipped into wrong. `get_child_subject_dashboard` now separates `answered` (non-empty stored selection) / `correct` / `wrong=answered∧¬correct` / `skipped`; accuracy + trend + per-topic + mistakes all use answered denominators; zero-answered topics excluded. Functional smoke (delta-based, rolled back): +1 correct/+1 wrong/+2 skipped classified exactly. **Web:** 6th KPI card "Buraxılmış cavablar" (`.ana-kpis-6` responsive grid), all tiles read RPC fields directly, 0 renders as 0.
- [x] **Olympiad attempts = timed test engine (migration 047):** `olympiad_packages.duration_minutes` (5–240, default 25; admin field in both package forms) + `start_olympiad_attempt` rebuilt on the test-engine contract (jsonb return, TRUE resume, server deadline, pre-inserted rows; purchase-gate + private-pool draw unchanged; enum-cast fix); expiry sweep now hard-expires deadline-carrying olympiad attempts (legacy deadline-less keep the 24h abandon). **Web:** Start/resume routes into the SHARED `/child/test/run` player (additive `modeLabel`/`exitHref` props — no forked runner); package title in the header; result/review back-links → Olympiads; continue-card on the Olympiads page for a live attempt; error mapping noaccess/empty/generic. Regular-test behavior byte-identical. Smoke: start→resume→payload (25q, 1500s, kind olympiad, no key leak) PASS.
- [x] **Leaderboard overhaul (migration 048):** `lb_rows`+`get_leaderboard` DROPped/recreated — rows now carry city/school/grade context and get_leaderboard ALWAYS returns server-formatted **"Firstname L."** (anonymization + 4-digit tag removed; `leaderboard.public_display_names` now inert; no ids exposed). **Web:** single column-config table (points boards add City/School/Grade; subject scope shows the subject once as caption; streak board simple), medals+self-highlight kept, `formatGradeLabel` reuse, mobile stacks context under the name (no overflow); **Subject filter fixed** — root cause: chips only rendered the child's own covered subjects → replaced with a single-select dropdown of ALL active subjects, server-clamped (forged/missing → first subject, never a blank board), URL-as-truth, scope switching resets it.
- [x] **Student profile grade label:** new shared `formatGradeLabel(level, locale, fallback)` (az vowel-harmony ordinals 1-ci…6-cı…9-cu/10-cu…11-ci; en "Grade N"; ru "N-й класс"); applied on the child profile school-info row + both grade dropdowns (edit-child, add-child wizard); "5 — 5. sinif" duplication removed everywhere it existed.
- [x] **Edit-child save bug root-caused:** (1) the first/last-name inputs had NO `name` attribute → FormData posted empty → server validation failed silently → nothing persisted; (2) React 19's native form auto-reset wiped the controlled fields after the action settled → the visible "clear". Fix: state-built FormData in `startTransition` (no native reset), per-field client validation + trilingual errors, pending/double-submit guard, city→school cascade keeps valid selections, `city` free-text sync added, revalidate dashboard+edit paths, success note; server authorization untouched.
- **i18n:** web +11 keys / admin +40 keys ×3 locales (central TSV merges; `lb.anon` + 3 orphaned admin keys pruned). Audit actions registered (`admin.olympiad.create_rolled_back`).
- Docs: MANUAL_TESTING_GUIDE **II1–II8**.

### 📱 Stage M2 — Mobile Public Surface & Complete Parent Panel (ACTIVE, started 2026-07-11)

**This is the ACTIVE stage.** Source: `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` §M2 + master plan v3 (updated with the Round-18 anti-regression notes §7.2b before starting — analytics answered/skipped fields, named-leaderboard contract, timed olympiad engine, gradeLabel port, forms-post-state rule; question-scope is server-enforced).

**Commerce posture (master plan §17/§23 — ADOPTED DEFAULT, owner may override during testing):** `real` mode = read-only on mobile (subscription state + ownership visible; purchase CTAs replaced by neutral "managed from the family's web account" wording — store-compliant); `demo` / `giveaway` / free-access flows run END-TO-END on mobile (no real money moves). All mode resolution stays server-side (`get_mobile_config().payment.mode`).

**Implementation plan:**
1. **BFF (web-app agent):** the 11 privileged endpoints under `/api/mobile/v1/*` wrapping the EXISTING audited services (Bearer-token auth resolution + the same guards/ownership/mode-gates/rate-limits; core-extraction refactors keep web actions byte-identical): `/children` (add-child), `/children/:id/quote|subscribe|subjects|activate-free|edit|reset-password`, `/subscriptions/:id/cancel`, `/olympiads/:pkg/purchase` (Idempotency-Key), `/profile/avatar` (byte-sniffed), `/account/delete`. Web typecheck+build gate; contracts documented in `mobile-app/markdowns/API_CONTRACTS.md`.
2. **Mobile shared infra (main session):** re-run `sync-i18n` (picks up Round 17/18 keys); port `gradeLabel` + the safe minimal-markdown renderer; notifications hook (inbox query + Realtime INSERT channel + unread badge + mark/delete RPC wrappers); countdown-banner hook (giveaway/free-access from config + `current_parent_free_access`); data queries (children, news, pricing, subjects, catalog); BFF client extensions; profile/notifications routes added to the parent stack.
3. **Mobile agents (disjoint):** A = public surface + news stack (landing-lite/pricing/about/FAQ/contact + public & panel news); B = parent Home + Add-Child wizard (mode-driven flows) + Subscription center (payment-first subject editor, cancel) + Olympiads catalog/purchase (posture above); C = Analytics (skipped card, answered-based accuracy) + Notifications suite (bell/inbox/detail/prefs self+per-child) + Profile suite (avatar/password/danger/edit-child/reset) + banners. i18n overlay keys merged centrally.
4. **Validation:** mobile `tsc`/lint/jest/audit + Metro export; web typecheck+build (BFF); MANUAL_TESTING_GUIDE **M2-** section; STATUS completion entry.

**✅ M2 COMPLETE (2026-07-11). Final gate: mobile `tsc --noEmit` PASS · `expo lint` clean · jest 20/20 · `npm audit` 0 · Metro export bundles (4.19MB hbc, full M2 tree) · web typecheck+build PASS (13 `/api/mobile/v1/*` routes). Nothing committed yet.** Executed as 1 web BFF agent + 3 disjoint mobile agents over main-session shared infra; i18n merged centrally (10 overlay keys ×3; agent A needed zero new keys).

- [x] **BFF (11 new endpoints):** shared Bearer resolver (`mobileBearer.ts` — token → parent profile, one service-role query) + house envelope; cookie-free CORES extracted from `subscriptionService`/`olympiadService`/`parentService`/`profileActions` (web actions now delegate — behavior byte-identical, verified by diff re-read): add-child, quote, subscribe (8-digit ID reveal), subjects batch-diff, activate-free, edit-child, child password reset, cancel (student_id-verified), olympiad purchase (Idempotency-Key accepted; RPC idempotency is the real guarantee), avatar upload (2MB byte-sniffed, bearer-client storage write = owner parity) / remove, account delete (`confirm:true`). paidMutationGate parity incl. the caller-scoped per-child free-access RPC via the bearer client. Contracts documented in `mobile-app/markdowns/API_CONTRACTS.md`.
- [x] **Shared mobile infra:** i18n re-synced (1,014 keys ×3) + `gradeLabel` port + RN-safe minimal-markdown renderer (segments, link whitelist, no HTML) + `authStore.profileId` + data-fetcher layer (children/catalogs/pricing/news/olympiads/subscriptions/scoped RPCs; two column-alias bugs caught by agent A and fixed: `amount:price_amount`, `billing_interval:interval`) + 11 BFF client wrappers + `useNotifications` (Realtime INSERT channel per profile, awaited RPCs) + CountdownBanner + HeaderBell + the (parent) group restructured to Stack-over-Tabs (notifications/profile/add-child/children screens push over the tab bar; deep-link targets + tests updated).
- [x] **Public surface (agent A):** Welcome nav chips + giveaway banner; Pricing (interval switcher, per-subject DB prices, promo/sibling callouts); About; FAQ accordion; Contact (config-driven email/phone/socials); News list/article shared components (expo-image covers, once-per-session view beacon, counts-only likes in M2) — public gated by `news_public`, parent tab UNGATED (web parity; article via in-tab modal since the public stack redirects signed-in users). Zero new i18n keys.
- [x] **Parent core + commerce (agent B):** Home (children cards w/ ID + access pills + flag-gated leaderboard chips, carousel, banners, empty/skeleton/refresh); mode-driven Add-Child wizard (demo full flow w/ live authoritative quote + demo-pay sheet + ID reveal; giveaway/free instant-ID; real/off = info-only with the web-plan note; child never duplicated on retries); Subscription center (child chips, live-sub card, payment-first subjects editor per mode, cancel flow w/ reason, DEMO-labeled Billing/Invoices); per-child subscribe screen; Olympiads catalog (covers, duration/question chips, owned pills, detail sheet; buy in demo AND giveaway — packages always paid; real = web-only note).
- [x] **Analytics + notifications + profile (agent C):** Analytics tab (6 KPI tiles incl. SKIPPED — Round-18 rules encoded in helpers; weekly bars + trend via react-native-svg; topic strengths ≥3-answered sample; mistakes; flag-gated leaderboard panel); Notifications screen (category chips, unread dots, tap → markRead + allowlist-routed action_url or detail sheet w/ RichBody markdown + scalar data pairs + delete; mark-all; live Realtime arrival); Profile (identity card w/ avatar display — UPLOAD DEFERRED: expo-image-picker not installed, honest "coming soon" note, `bffUploadAvatar` wired later; password change; per-channel notification prefs self + per-child with revert-on-failure; FAQ/Contact rows; double-confirm account delete); edit-child screen (controlled state, cascade, read-only ID, optional password reset, never-clearing values).
- **Deferred in-stage (tracked):** avatar PICKER (needs expo-image-picker dep — add in M3 alongside the student avatar), news like TOGGLE (counts-only in M2), Maestro E2E harness (still M4), universal links (backlog C1/C2).
- Docs: MANUAL_TESTING_GUIDE **M2-1…M2-7**; API_CONTRACTS.md M2 sections; master plan §7.2b anti-regression notes.
- **Next recommended stage: M3 — Student arena** (needs no owner inputs; the commerce posture note above stands for owner review during M2 testing).

### Round 19 (2026-07-11): owner queue — header wrap, child-login removal, purchase crash, notification sync, skeletons, exam/olympiad module separation (taxonomy + analytics + session UX)

**Final gate: web typecheck+build PASS · admin typecheck+build PASS · migrations 050+051 applied on dev (rolled-back functional smokes PASS) + backported (003/011/013 #59-#60) · non-destructive from-zero rebuild = 60/60 PASS. Testing guide sections JJ1–JJ10. Nothing committed yet.** Executed as 2 direct fixes + 2 migrations (main session) + 4 disjoint agents (web-parent / web-student / skeletons / admin); i18n + CSS merged centrally.

- [x] **DB — migration `2026_07_11_050_taxonomy_module_scope.sql`:** `topics.scope` ('exam' default | 'olympiad'; subtopics inherit via parent — no drift). Both bulk RPCs resolve/create strictly inside their own scope (an olympiad upload reusing an exam topic NAME now creates a separate olympiad-scoped row). Data repair on dev: 8 leaked topics → olympiad scope, 1 mixed-use topic correctly kept in exam scope (real exam questions reference it). Backports 003 + 011; check **#59**.
- [x] **DB — migration `2026_07_11_051_analytics_scope_tests_vs_olympiads.sql`:** `get_child_subject_dashboard` +`p_scope` ('tests' default | 'olympiads'; unknown coerces to tests so all existing web+mobile callers keep working and become olympiad-free automatically); olympiads scope adds `per_package` breakdown (via the attempt questions' private-pool link). Old 3-arg signature dropped (single function — PostgREST-safe); 013 #31/#58 signature refs updated; check **#60**. Rolled-back smoke: synthetic graded olympiad attempt → correct/wrong/skipped split + per_package row + zero leak into tests scope.
- [x] **Issue 3+4 (direct fix):** `OlympiadPurchase` "Maximum update depth exceeded" — success callback was recreated every render inside the effect's deps and added a new Set each call; now `useCallback` (declared before the early return — hooks rule) + same-reference bail-out + fire-once ref. Buy button = plain "Al/Buy/Купить" (`poly.buy` replaces `poly.buyFor`).
- [x] **Issue 1 (agent):** `.pnav` no longer wraps — nav links scroll horizontally (hidden scrollbar), `.pnav-right` pinned to the row; shared classes fix the arena header too.
- [x] **Issue 5 (agent):** notification read-state — `useNotifications` rebuilt on a module-level per-profile store (`useSyncExternalStore`): bell + Notifications page share items/unread; same mark-read/mark-all/delete RPC path; optimistic apply + rollback; server snapshots reconcile via local-read map + delete tombstones + mark-all watermark (stale unread never resurrects); one Realtime channel per store. Hook API unchanged (zero call-site edits).
- [x] **Issue 10 (agent):** analytics `?mode=subjects|olympiads` switch (whitelisted URL param) → `p_scope`; subjects view byte-identical (now olympiad-free); olympiads view reuses the KPI/chart/topic layout + "Results by package" table + trilingual empty state; subject chips hidden in olympiad mode; dashboard component co-located at `(parent)/analytics/AnalyticsDashboard.tsx` (orphaned `components/AnalyticsDashboard.tsx` deleted).
- [x] **Issue 2 (agent):** `/child-login` route deleted (unified `/login` already had Student/Parent tabs); `requireChild` → `/login?tab=student` (server-side whitelist → ArenaLogin `defaultTab`); orphaned CSS (`.arena-brand`, `.arena-auth` split layout) + `child.loginTitle` key pruned; stale comments cleaned.
- [x] **Issue 8 (agent):** test setup = mandatory single-select Topic → Subtopic (subtopic waived only when the topic has none; resets on topic change; disabled Start + click-guard + trilingual warning + `aria-invalid` highlight; **server-side enforcement in `startTopicTest` too**); topics picker filters `scope='exam'`. **Behavior change:** "whole subject" start (no topic selected) no longer exists; a subject with zero topics can't start. Leave-test guard on the shared runner (both kinds): capture-phase anchor interception → shared Modal (Continue/Leave), history-pinning for browser Back, `beforeunload` for refresh/close; runner's own controls (buttons) structurally exempt.
- [x] **Issue 9 (agent):** `ChildNavProvider`/`ChildNavLinks`/`ChildNavActive` — run/result/review pages pass the server-known attempt `kind` so the Olimpiadalar tab is active for olympiad sessions (Exams otherwise); result title/labels use olympiad wording (`test.result.olympiadTitle`). Known minor: hard-refresh of a run URL shows the pathname-derived highlight for the first pre-hydration frame.
- [x] **Issue 6 (agent):** central skeleton system — `components/skeletons/` (18 primitives + shared page compositions, one scoped shimmer keyframe, theme-token fills valid in light/dark/arena palettes, `prefers-reduced-motion` fallback) + **40 route-level `loading.tsx`** (13 parent / 13 child incl. a runner-frame skeleton / 13 public + reworked root fallback), layout-matched to each page (no layout shift). Client-side refetches inside mounted pages are out of scope (would need page edits).
- [x] **Issue 7 admin frontend (agent):** every Exams surface scoped to exam taxonomy — questions filter cascade, question form dropdowns (`question-options.ts`), Manage topics/subtopics lists + cascades + ref dropdowns + direct-URL edit guard (404 on olympiad-scoped rows) + `?topic=` param validation; server-side scope checks in `saveQuestion`/`bulkAssignTopic`/taxonomy `saveRow`/`deleteRow`. Verified read-only: olympiad module sends no topic ids (names resolve in the scope-strict RPC) and lists no taxonomy.
- **Mobile anti-regression:** master plan §7.2b extended to Round-18/19 (items 7–12: analytics/taxonomy scope, loop-safe purchase handlers + plain Buy, single notification store, M3 test-start validation + leave guard, kind-driven active tab); M3 stage bullet added in the execution plan. Mobile M2 analytics needs NO code change (named-args call hits the new default scope).
- **i18n:** +23 new keys ×3 (analytics mode/per-package/empty, test setup picker/warn, leave-test modal, olympiad result title), 6 obsolete keys removed, `test.setup.noTopics` re-worded for the new mandatory-topic rule.

### 📱 Stage M3 — Student Arena (ACTIVE, started 2026-07-11)

**This is the ACTIVE stage.** Source: `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` §M3 + master plan §7.2b items 1–12 (Round-18/19 contracts are MANDATORY here: mandatory topic/subtopic + exam-scope picker, leave-test guard, kind-driven active tab/wording, skipped≠wrong, named leaderboard + context, single notification store, per-screen skeletons).

**Pre-step — Expo SDK pinned to 54 (owner decision 2026-07-11):** downgraded from the scaffolded SDK 57 because the owner's device Expo Go builds run SDK 54 (no newer SDK found in the stores). `expo ~54.0.0` + `npx expo install --fix` (RN 0.81.5, React 19.1.0, expo-router ~6.0.24), dev tooling realigned (jest-expo ~54, eslint-config-expo ^10, @types/react ~19.1, TS ~5.9), clean lockfile reinstall (stale react-server-dom-webpack peer conflict), audit → 0 via two new overrides (`postcss ^8.5.10`, `@expo/ngrok→uuid ^11.1.1`). **New dep: `expo-image-picker ~17.0.11`** (M3 avatar pickers — justification: the only maintained Expo-native photo picker; no service-key exposure). Pin recorded in mobile CLAUDE.md + master plan §runtime + execution plan M1. Gates after downgrade: tsc PASS · jest 20/20 · lint clean · audit 0 · Metro export 3.96MB hbc.

**Shell restructure (main session):** `(student)` group is now Stack-over-Tabs like the parent group — `(student)/(tabs)/{home,tests,olympiads,ranking,news}` (arena→home rename) + stack placeholders `notifications`, `profile`, `test/[subjectId]`, `test/run/[attemptId]` (gesture-locked), `test/result/[attemptId]`, `test/review/[attemptId]`; deep-link targets + tests retargeted; typed routes regenerated; i18n re-synced (1,030 keys ×3 incl. Round-19 test-setup/leave-guard keys). All gates green pre-agents.

**Implementation plan (4 disjoint agents):** W = web BFF student endpoints (bearer resolution for students; avatar upload/remove for child sessions with the same byte-sniff; student name-change endpoint; verify palette/sticker RLS for direct writes; API_CONTRACTS.md). A = student shell/home/news/notifications (tabs polish + StreakChip + bell, arena home hero/ministats/leaderboard card/subject strength/news panel/access-state cards, news tab reusing M2 components, notifications screen on the shared store, AccountSheet student entry). B = the full test engine (tests tab subject cards from the access set + continue-card + history; setup with MANDATORY topic→subtopic pickers scope='exam'; timed runner — server deadline, 30s autosave + resync, palette, bookmark, prev/next, submit-confirm w/ unanswered count, deadline auto-submit, TRUE resume, hardware-back/beforeRemove leave guard; results; review with All/Correct/Wrong/Skipped + explanations; anti-cheat: no keys pre-grading, nothing persisted). C = olympiads tab (planned cards + owned→shared runner via `start_olympiad_attempt`, olympiad wording) + ranking (Points|Streak, scope chips, month|all-time, top-50 "Firstname L." + context, my-rank card, streak card) + student profile (avatar via image-picker→BFF, name, password ≠ID, read-only school info, sticker-theme + palette pickers applied live) + parent avatar picker (replaces the M2 "coming soon" note).

**✅ M3 COMPLETE (2026-07-11). Final gate: mobile `tsc --noEmit` PASS · jest **37/37** (incl. 20 new test-engine logic tests: timer anchor/resync, skipped≠wrong, resume rehydration, setup validation) · `expo lint` clean · `npm audit` 0 · Metro export 4.18MB hbc (full M3 tree, SDK 54) · web typecheck+build PASS (14 `/api/mobile/v1/*` routes incl. the new `profile/name`). Nothing committed yet.**

- [x] **BFF (agent W):** `resolveBearerStudent()`/`resolveBearerUser()` beside the parent resolver (same GoTrue verify + role query, `.in` role filter); `/profile/avatar` now serves parent AND student bearers via the shared byte-sniffing `avatarCore` (student path/media rows byte-match the web child actions; role picks the revalidated route); new `POST /profile/name` (student-only) delegating to the extracted `updateChildOwnNameCore` (web action now delegates — byte-identical). RLS findings documented in API_CONTRACTS.md: palette (`students.palette`, self-row RLS + CHECK), sticker theme (`child_sticker_selections` upsert/delete, enabled-theme WITH CHECK), password (`auth.updateUser` only) — all direct-writable with the child JWT, so mobile writes them directly.
- [x] **Arena shell/home/news/notifications (agent A):** `useArena()` palette hook (child's `students.palette`, 5-slug whitelist, dark theme ignores palette like web) drives both student layouts; header = StreakChip (`get_streak_status`, at-risk red state) + bell + avatar; arena home ports `child/page.tsx` (exact access formula: trialing/active OR giveaway OR `my_free_access_active`; locked cards; hero/ministats/rank panel/today's rounds/strengths/news panel with in-tab article modal); news tab = shared M2 components; student notifications screen on the SAME shared store (read-only prefs, student-audience deep links). Correctly used child-scoped `get_my_leaderboard_rank` (the summary RPC is parent/admin-only).
- [x] **Test engine (agent B):** access set ports `getChildSubjectAccess`; setup enforces Round-19 (mandatory topic→subtopic, scope='exam', zero-subtopic waiver, warn+highlight, consent gate); runner = server-anchored countdown (anchor from `remaining_seconds`, re-anchored on every save response + AppState foreground resync — never a decrementing state), 30s autosave + save-on-navigate + flag-immediate, palette/bookmark/prev/next, submit-confirm w/ unanswered count, deadline auto-submit (0:00 or SQLSTATE 23514 on save), TRUE resume, BackHandler+beforeRemove leave guard w/ best-effort flush; result reads own answer rows so **skipped is classified from empty selections, never folded into wrong**; review = All/Correct/Wrong/Skipped w/ original numbering + explanations, memory-only (`gcTime:0`, no persister exists). Kind-driven wording/exit-tab for olympiad attempts.
- [x] **Olympiads/ranking/profiles (agent C):** olympiad tab (planned cards + detail sheet w/ "ask your parent", owned via `olympiad_purchases` join incl. archived listings = lifetime, start/continue → the SHARED runner with resume handling, loop-safe start); ranking (Points|Streak, child-owned scope chips, subject single-select over ALL active subjects clamped, "Firstname L." + context rendered verbatim, medals/self-highlight/sticky my-rank, streak at-risk card); student profile (avatar picker → BFF w/ client size/type pre-checks, name via `bffUpdateStudentName`, password direct auth ≥8+≠ID, school info via `formatGradeLabel`, grouped ID, sticker+palette pickers writing the RLS-verified tables directly and patching the arena cache for live re-skin); parent avatar picker replaces the M2 "coming soon" note (shared AvatarSection).
- **Tracked follow-ups:** (1) mobile-submitted attempts don't fire the web's "attempt graded" in-app notification (web sends it from its server action, not the RPC) — needs a server-side hook (DB trigger or BFF submit passthrough) later, noted for M4/backlog; (2) sticker DECORATIONS intentionally not rendered (plan §2, web hides them <1280px too); (3) Maestro E2E remains M4.
- Docs: MANUAL_TESTING_GUIDE **M3-1…M3-7** (+ SDK-54 note); API_CONTRACTS.md M3 section; i18n: +1 mobile key ×3 (`mob.arena.streakAtRisk`), `mob.prof.avatarSoon` pruned (picker shipped); agents B/C/W needed zero new keys (synced web catalog covered everything).
- **Next recommended stage: M4 — Push, hardening, compliance & launch** (owner inputs needed per plan: store accounts, sentry on/off, Kids-Category posture, push-in-v1 confirm, `EXPO_ACCESS_TOKEN`).

### Round 20 (ACTIVE, started 2026-07-12): owner mega-queue — districts, terms, daily rounds, 5 options, question flow, leaderboards everywhere, notifications audiences, maintenance latency, typography, cleanups

**THE ACTIVE ROUND. Full owner queue (18 items, verbatim intent) + phased plan + decisions. This block is the source of truth if the session compacts.**

**Queue inventory:**
1. **Olympiad packages — no fixed question count**: a package may hold ANY number of questions; the attempt must draw ALL of the package's questions (remove `questions_per_attempt`-based capping); duration_minutes already admin-editable (form exists) — verify create+edit paths; countdown from per-package duration (shipped in 047).
2. **Practice/subject tests untimed**: remove the countdown from subject (topic) tests; users take unlimited time. Olympiads STAY timed. (Decision: NEW daily rated rounds stay TIMED — they live in the Tests section, not Practice; flag to owner in report.)
3. **Parent panel**: remove the Notifications item from the nav menu; bell + "view all" remain the only entry (page + functionality unchanged; parent panel only).
4. **Leaderboard overhaul**: (a) remove the admin panel's student results/standings view (keep seasons/config); (b) District column between City and School (order Rank→Participant→City→District→School→Grade→Score) + District filter chip; (c) NO medals — numeric ranks only; (d) Top 50 with INTERNAL vertical scroll + sticky header; (e) keep "Your position" (rank + total, e.g. #78 / 1240, filter-aware).
5. **Daily rounds engine**: ONE RATED test per subject per day per student (25Q), backend-enforced (unique rated attempt per student+round; refresh/tabs/API safe); rated results feed the leaderboard once; button flips to attempted-today state. NEW "Previous Day's Rounds" section between Today's and Recent: yesterday's EXACT immutable snapshot, unlimited practice replays, NEVER affects points/streak/stats, visible trilingual notice ("Bu testlər yalnız təkrar üçündür və nəticələr reytinq cədvəlinə təsir etmir."). Rounds are per (subject, grade, date), same 25 questions for every student, stored as an immutable snapshot (IDs + order + full content incl. images so later edits never change history). Page order: Today's / Previous Day's / Recent.
6. **Schools ↔ districts**: `city_districts` managed in admin (CRUD, linked to city); Schools form gets City→District cascade (district REQUIRED when the selected city has districts; backend rejects mismatched city/district); Schools list shows District column + filters. Leaderboard district comes from Student→School→District (school's district is the ONLY source of truth — no duplicate storage). Baku (~300 seeded schools) backfilled from OFFICIAL sources only (research agent running: school_number→rayon TSV w/ confidence+source); unmatched schools = manual-review list (district NULL + admin filter). Other cities with official rayons (e.g. Gəncə: Kəpəz/Nizami) get districts too; никаких artificial districts.
7. **Terms (Rüb)**: topics + subtopics get REQUIRED `term` (1..4 dropdown; replaces the Order/Sıra field in admin); subtopic inherits/must match parent topic term; questions carry term derived from topic (read-only in form; backend rejects mismatch). Cumulative daily-generation pool: `question.term <= current term` (T1→[1], T2→[1,2], T3→[1,2,3], T4→all) with reasonable mixing, no dupes, never future terms. Central CURRENT TERM config (admin Settings; academic year + term 1-4) — rounds snapshot the term at generation; changing term later affects only new rounds. Insufficient pool (<25) → clear admin-visible error (subject/grade/terms/missing count), never silent future-term fill. Existing topics/subtopics/questions: NO random assignment — term NULL = needs review (admin review list), EXCLUDED from generation.
8. **Parent panel Leaderboard page**: new nav item "Reytinq cədvəli"; REUSES the student leaderboard (same components/filters/top-50/district/scroll); below it "Övladlarınızın mövqeyi": one card per linked child (name, #rank / total, score) recomputed under the ACTIVE filters; child not in filter → "Bu filtr üzrə reytinqdə iştirak etmir" (never a fake 0); parent-child link enforced server-side (new RPC).
9. **Exactly 5 answer options (A–E)** everywhere (subject + olympiad): forms show fixed 5 (no add/remove), exactly 1 correct; backend/bulk validators enforce 5; templates/docs updated; existing 4-option questions → demoted to review (in_review status), EXCLUDED from new tests, admin review list to add option E; migration report (counts); historical attempts stay readable.
10. **Admin News**: image upload on the CREATE page (same component/validation as Edit; one-submission create; image optional).
11. **Admin Notifications audiences**: (a) new "Olimpiada paketlərini alanlar" — multi-select of ACTIVE packages, recipients = parents with valid active purchases of ≥1 selected package (dedup; children only if the access model notifies them — ours notifies the purchasing parent + optionally child per existing event patterns), backend-validated package ids, unique-recipient count preview, history stores package ids+names snapshot; (b) new "Bütün istifadəçilər" (ALL eligible users, dedup) at the TOP; (c) reorder: Bütün istifadəçilər → Bütün valideynlər → Bütün uşaqlar → Olimpiada paketlərini alanlar → Müəyyən valideyn → Fənnə görə uşaqlar → rest.
12. **Maintenance mode latency**: owner sees ~1 min propagation; target 0–5s. Find the cache (likely web-app flags/settings read cache TTL / Next revalidate), switch the maintenance gate to no-store/short-TTL + immediate revalidation on admin save + light client polling (3–5s) where needed; Vercel multi-instance-safe (DB is shared state); admin panel must stay accessible; admin UI gets saving/confirmation feedback.
13. **Create/Edit Question overhaul (admin)**: remove "Sual növü" + "Olimpiada növü" fields entirely (type defaults to MCQ single_choice server-side; olympiad_type_id stays nullable/historical); Topic AND Subtopic mandatory + subject/grade/topic/subtopic consistency validated server-side; mandatory Rüb (inherited read-only from topic, mismatch rejected); fixed 5 options; **question IMAGE upload inside the create modal** (optional; existing question-media pipeline: bucket + media_assets + byte-sniff; preview/replace/remove; single-submission create); student panel renders question images in runner/review/result (all modes incl. olympiad); bulk JSON accepts optional image (pre-uploaded URL/media id); field order per owner spec.
14. **Landing page public leaderboard**: new section right under the Hero ("Ümumi Reytinq Cədvəli" + subtitle), overall board only, NO filters, Top 10 (first 5 visible + internal scroll for 6–10, sticky header), anonymized names "Şagird XXXX" (LAST 4 digits of child_unique_id, leading zeros kept, server-generated), columns Sıra|İştirakçı|Şəhər|Rayon|Məktəb|Sinif|Xal, numeric ranks, privacy-safe anon RPC (no names/ids/emails), landing dark design, loading/empty/error states.
15. **Olympiad edit page**: REMOVE the whole bulk-upload/question-pool import section (upload happens ONLY during package creation); backend rejects bulk import into a package that already has questions ("Questions can only be bulk uploaded during Olympiad Package creation." trilingual); existing questions untouched; rest of edit page (duration/price/status/cover/archive) unchanged.
16. **Site Content typography system**: "Sayt şrifti" section — global font from a curated 20-font library (MUST include Mulish + Arial; searchable select with live previews; Google Fonts loaded dynamically, only the selected one, font-display swap, CSP already allows fonts.googleapis/gstatic; VERIFY Azerbaijani ə/İ glyph support per font — exclude or fallback-chain any that fail, per the permanent font rule); base/heading/button size controls + live preview panel; per-content-block font-size (12–48px dropdown) stored per field in site_content and rendered on the public/panel frontends; validation (approved fonts only, 12–72 clamp); responsive min/max clamps.
17. **Remove "Daily tasks" from the whole codebase**: drop the dormant daily_task_* schema (unused per backlog), audit triggers, seed rows, planning references; the attempt kind 'daily' is REPURPOSED for the new daily rounds.
18. **After everything: mobile docs pass** — update mobile plans/CLAUDE against the new platform reality (5 options not 4; terms; daily rated rounds + untimed practice; leaderboard district/no-medals/top-50; parent leaderboard; notifications audiences; landing board; M3 shipped screens needing parity = new M3.1 items: tests tab restructure, untimed runner mode, ranking district column, question images, 5th option display).

**Phased plan:** Phase 0 scout (award/streak fns, test RPCs, leaderboard RPCs, notifications engine, flags caching, schools canonical home, question-media in runner payloads). Phase 1 = migrations 052.. (in order): 052 drop daily_task legacy; 053 city_districts + schools.city_district_id (+seed Baku/Gəncə rayons); 054 terms + current-term setting + review semantics; 055 five-options rule + demotion report; 056 question-flow backend (MCQ default type, general-bank insert trigger for topic/subtopic/term); 057 daily rounds engine (daily_rounds + content snapshot jsonb, start_daily_round_attempt today|yesterday, rated uniqueness, award/streak gated to is_rated, untimed start_topic_test_attempt, olympiad draws ALL pool + is_rated, get_test_attempt/get_test_review serve snapshot content + question image, creation-only olympiad bulk gate); 058 leaderboard (lb_rows district via school, district scope, get_my_leaderboard_rank + total, parent per-child RPC, public anon top-10 RPC); 059 notifications audiences + recipient-count RPC. Apply→smoke→backport→from-zero after each cluster. Phase 2 = agents: AD1 (question/taxonomy/terms/5-options/bulk/review lists), AD2 (districts CRUD, schools cascade+list, settings term, admin leaderboard removal, news create image, olympiad edit cleanup), AD3 (notifications composer audiences, maintenance admin UX, Site-Content typography admin), W1 (student tests page + untimed runner + question images + leaderboard redesign), W2 after W1 (parent nav + parent leaderboard page), W3 (landing public board + typography rendering + maintenance web latency fix). Phase 3 = gates (web/admin build, from-zero), guide **KK1..KK17**, STATUS close, CLAUDE.md rule updates (MCQ=5; olympiad attempt=ALL pool questions; daily rated rounds model), mobile docs pass (item 18), ONE commit message.
**Research agent** (running): official Baku school_number→rayon TSV + other-cities rayon list → data migration (only HIGH/MEDIUM confidence, source recorded; rest = review list).
**Decisions log:** daily rated rounds stay timed (Tests section ≠ Practice; owner may flip). Topic tests become is_rated=false, untimed, no points/streak (points integrity per one-rated-per-day rule) — PROMINENT report note. Streak = rated attempts only. Rounds per (subject, grade, date). 4-option demotion via status in_review. Term NULL = unreviewed, excluded from generation. Districts flow via school only. Old daily_task tables dropped (unused). Mobile M3 divergence tracked as M3.1 (NOT built this round). Landing board = global ALL-TIME points ("Ümumi"). Maintenance: 4s server TTL + splash polling (idle tabs enter on next interaction — accepted).

**✅ ROUND 20 COMPLETE (2026-07-12). Final gate: web typecheck+build PASS · admin typecheck+build PASS · migrations 052–062 applied to dev (daily-rounds functional smoke PASS, rolled back) · backported to canonical 003/004/005/010/011/012/013/015 · non-destructive from-zero rebuild = 64/64 PASS (4 new checks #61–#64). Testing guide sections KK1–KK16. Nothing committed yet.** Executed as 1 research agent (official Baku school→rayon mapping, 334 numbers HIGH-confidence, two official sources, zero conflicts — also caught that Gəncə's rayons were abolished 2022) + my DB layer + 1 backport agent + 5 frontend agents (AD1 question flow / AD2 admin ops / W1 student / W2 parent+landing / W3 typography+maintenance); i18n merged centrally (web +44 keys ×3; admin +20 typography keys ×3; AD1/AD2 strings live via the established local labels.ts pattern).

- [x] **DB (052–062):** daily-task legacy dropped (incl. student_daily_task_progress); `city_districts` + `schools.city_district_id` + guards + Baku 12-rayon seed + **backfill 313/320 schools** from the official BŞTİ directory (7 = manual-review list); terms on topics/subtopics/questions (inherit/cascade/mismatch triggers, `academic.current_term` setting, `current_academic_term()`); single_choice = 5 options/1 correct (127 four-option questions demoted to review; dev type-row drift repaired in place by 062); **daily-rounds engine** (immutable content snapshots incl. all locales/options/correctness/images; `start_daily_round_attempt` today|yesterday; partial-unique one-rated-per-round; snapshot-aware grading + payload serving; `daily_round_readiness()`); engine rewrites (untimed topic tests, all-questions olympiads, rated-only award/streak — cap retired, expiry sweep updated, question `image` in attempt/review payloads); bulk v3 (topic/subtopic/term required, type optional, optional media, creation-only olympiad gate + taxonomy insert guard); leaderboard cluster (lb_rows/get_leaderboard district column via school + 'district' scope; `get_child_leaderboard_position`; anon `get_public_leaderboard` top-10 "Şagird XXXX"); notification audiences (`all_users`, `olympiad_buyers` w/ package validation + dedup).
- [x] **Admin (AD1):** question modal overhaul (no type/olympiad-type; mandatory topic/subtopic; read-only inherited Rüb w/ legacy-topic upgrade; fixed A–E + one radio-correct; one-submission image upload w/ staging→move+sniff+rollback); topics/subtopics Sıra→Rüb (required; lists+filters; subtopic inherits); "Needs option E"/"Needs term" review chips w/ live counts; bulk v3 templates/validators/messages; daily-round readiness panel (subject×grade eligible/25).
- [x] **Admin (AD2):** Districts CRUD section; Schools city→district cascade + list column/filters + needs-district pill; Settings "Cari tədris ili / rüb" card (audited); admin leaderboard standings view removed (seasons/config kept); News one-submission create w/ cover; olympiad edit bulk-upload section removed + creation-only error surfaced + all-questions hints (duration editable both paths); composer: reordered audiences + Bütün istifadəçilər + Olimpiada paketlərini alanlar (searchable multi-select, `{package_ids, package_titles}` history snapshot, live unique-recipient preview, zero-recipient warning).
- [x] **Web student (W1):** Tests page = Today's/Previous-Day's/Recent + per-subject practice entries; attempted-today detection (Baku-local day) + DB unique as backstop; untimed runner mode (∞ pill, no auto-submit) + rated/practice badges + "Günün raundu" wording; `QuestionImage` (zoom modal) in runner+review; result page untimed fixes (no early finalize); leaderboard redesign (district column+scope chips w/ clamping, numeric ranks, `.lb-scroll`/`.lb-table` internal scroll + sticky header, honest my-rank states); arena home routed to the daily flow.
- [x] **Web parent+landing (W2):** parent nav −Notifications +"Reytinq cədvəli" (flag-gated); parent leaderboard page (full filters incl. city→district/school cascades, clamped; top-50 reusing W1's neutral classes) + "Övladlarınızın mövqeyi" per-child cards via the position RPC under active filters (honest not-in-filter state); landing "Ümumi Reytinq Cədvəli" under the hero (anon RPC, top-10, ~5 visible + internal scroll, sticky header, dark/light).
- [x] **Typography + maintenance (W3):** "Sayt şrifti" admin section (curated 20-font library w/ Azerbaijani-glyph previews, base/heading/button sizes, live preview, audited `site.typography` setting, whitelist+clamp validation); per-field CMS font sizes via sibling `<key>#style` rows (backward-compatible); web rendering via body CSS vars + single Google-Fonts link (CSP origins explicit; zero-regression default path); maintenance = 4s-TTL dedicated fetch + anon `/api/maintenance-status` (no-store) + polling splash (enter ≤5s, exit ~4–8s; admin app never gated).
- **Follow-ups (tracked):** 7 Baku schools need manual rayon assignment (admin pill filter); dev term-review backlog (17 topics / 67 subtopics / 177 questions) + option-E backlog (26 general + 101 olympiad) are OWNER CONTENT WORK — daily rounds cannot generate for a subject×grade until ≥25 eligible questions exist (readiness panel shows gaps); migrate AD1/AD2 labels.ts strings into messages.ts opportunistically; `daily_tasks.manage` permission seed + `task_progress_status` enum removal = tiny future migration; W1's orphaned keys (test.home.sub, test.setup.duration/rule1/rule2/scoring) prunable; **mobile M3.1 parity pass required before M4** (master plan §7.2c); owner may flip: rated-round timer, landing board period (all-time vs month).

### Round 21 (ACTIVE, started 2026-07-13): owner queue — olympiad question CRUD, dynamic pool count, Start/Practice fixes, dashboard redesign, add-child district, unified Locations, mobile docs

**Queue (8 items) + investigation verdicts (6 read-only scouts, complete):**
1. **React "cleaning up async info" error** → VERDICT: React DevTools browser-extension bug (stack entirely in `installHook.js`), dev-only, cannot occur in production (hook not injected). Upstream: vercel/next.js discussion #84973 — no framework fix; remedy = update/disable the extension. **NO repo change.**
2. **Olympiad package question CRUD (admin)**: pool questions REUSE the general question tables (`questions.olympiad_package_id` marker, always `status='published'`). No per-question RPCs exist; general `saveQuestion`/`deleteQuestion`/`transitionQuestion` hard-refuse pool rows by design. Attempts read pool questions LIVE (no snapshot) and `test_attempt_answers.question_id` is ON DELETE CASCADE → unguarded delete/option-reinsert silently destroys attempt history. Build: package-scoped save/delete actions + question list/CRUD UI on the package edit page (reuse QuestionForm/Modal pattern, 5 options A–E, one-submission image, router.refresh) + **id-stable option updates** (update in place by order_index, never delete+reinsert) + **DB delete guard** (block question delete when attempt answers reference it; trilingual "archive instead" error).
3. **"25 Questions" hardcode**: the shown number is `olympiad_packages.questions_per_attempt` (DB default 25; admin form never writes it) — not a literal. Fix = new `get_olympiad_pool_counts(uuid[])` SECURITY DEFINER RPC (published pool count; RLS-proof) consumed by parent catalog, child tab, planned-card modal. Mobile has the same bug → M3.1 parity item (mobile stays dormant).
4. **Start/Practice broken**: routing is CORRECT — both are eligibility/data mismatches. (a) Start → daily-round pool demands ≥25 published+termed+5-option+exact-grade questions; short pool → `err=nopool` bounce that reads as "empty page". (b) Practice → Round-20's option-E demotion moved 4-option questions to `in_review`, emptying the published general bank (also shrank purchased olympiad pools!). Fix: **re-promote the demoted 4-option questions to published** (practice + olympiad attempts can serve them; "needs option E" review list re-keyed to option-count, not status; rated daily rounds KEEP the strict 5-option+term bar), **grade-NULL parity** in the daily pool (matches practice), student-facing **round-readiness pre-check** so Start renders a "not ready" state instead of click-bouncing, accurate empty states.
5. **Student dashboard redesign**: remove "Bugünkü raundlar" (inline JSX link-mirror; real UI lives on the Tests page) + "Son xəbərlər" (`ChildNewsPanel` — delete component; news route stays). Rebalance: hero+rank / ticker / lbq-card+subject-strength side by side; **Recent Rounds KEPT** (owner's keep-list is non-exhaustive) as a full-width row; reword `arena.heroEyebrow` (currently literally "Bugünkü raundlar"); wire the rank card's static "—" to `get_my_leaderboard_rank` (all-time); matching `loading.tsx` skeleton.
6. **Add-child district**: NAMING TRAP — `students.district_id` is the CITY (historic). Real rayon is stored nowhere on students; school (mandatory in the form) drives leaderboard district. Build: new `students.city_district_id` (owner wants it stored) + consistency trigger (belongs to city; must match school's rayon when school has one) + backfill from school + `create_child_account` gains `p_city_district_id` (required inside the RPC when the city has districts) + leaderboard functions fall back `coalesce(school.city_district_id, student.city_district_id)` (fixes children of the 7 unassigned schools) + City→District→School cascade in Add/Edit Child (district select only when the city has districts; filters schools incl. NULL-district ones; loading/empty states; edit preselects).
7. **Unified Locations page**: replace nav Cities/Districts/Schools with one `/locations` 3-column master-detail (cities → rayons of selected city → schools) reusing the existing guarded server actions (+ no-redirect variants), search + counts per column, modal create/edit reusing existing forms, **delete-impact preview** (city: cascade-deletes rayons + BLOCKED by schools; rayon: trigger-blocked while schools reference; school: silently SET-NULLs students → show student count), empty states, old routes redirect, responsive stacking (no master-detail pattern exists yet — net-new UI over existing actions; `.admin-content` max-width relaxed for this page).
8. **Mobile docs pass** after implementation: master plan §7.2c/M3.1 += dynamic pool count, arena-home section removals, add-child district field, tests readiness state; mobile CLAUDE/root CLAUDE district-storage rule update.

**Migrations (063–065, dev-first then backport):** 063 = re-promote 055-demoted questions (in_review + exactly 4 options + 1 correct → published; report counts) + question delete guard trigger; 064 = `students.city_district_id` (+FK+trigger+backfill) + `create_child_account` v2 + lb_rows/child-position/public-board district fallback; 065 = daily pool grade-NULL parity + `get_my_round_readiness()` + `get_olympiad_pool_counts()`. 013 checks: adjust any published-5-option data check to rule-level; add new object checks.

**Agent plan (disjoint):** DB = main session. AD1 = olympiad question CRUD (olympiad pages/olympiad.ts/QuestionForm adaptation/questions.ts guard mapping). AD2 = /locations + nav + location services variants. W1 = student (tests readiness, dashboard redesign, child olympiads count, globals.css, testActions). W2 = parent (add/edit-child cascade + services, parent olympiads count, planned card). Web i18n keys pre-merged centrally by main session; admin strings via local labels.ts. Gates: web+admin typecheck+build, from-zero rebuild, guide **LL1..**, STATUS close, mobile docs, ONE commit message (no commit).

**Decisions log (R21):** 4-option re-promotion uses the (in_review ∧ 4 options ∧ 1 correct) proxy — flagged to owner (any question that was ALREADY in review for other reasons and happens to have 4 options gets promoted too). Rated rounds keep the 25Q/5-option/term bar (unchanged R20 spec) — Start shows honest "not ready" until content prep done. Recent Rounds kept on dashboard. District stored on students per owner (Round-20 "never stored" rule superseded; school-derived value still wins in leaderboards, stored value = fallback + guard-enforced consistency). Question hard-delete blocked platform-wide once attempt answers exist (protects history; archive instead).

**✅ ROUND 21 COMPLETE (2026-07-13). Final gate: admin typecheck+build PASS · web typecheck+build PASS · migrations 063–065 applied to dev (functional smoke PASS, rolled back: guard blocks answered-question delete; pool-count RPC returns 50 for the 50-question package; district trigger rejects contradictions; backfill consistent) · backported to canonical 002/011/015 (+ 013 #17 signature refresh) · from-zero rebuild = 67/67 PASS (new checks #65–#67). Testing guide LL1–LL8. Nothing committed yet.** Executed as 6 read-only scouts + main-session DB layer + 4 disjoint agents (AD1 olympiad question CRUD / AD2 unified Locations / W1 student / W2 parent); web i18n pre-merged centrally (+5 keys ×3 + heroEyebrow reword); admin strings via local labels.ts (olyq.* ~60 keys ×3; loc.* replacing cities/districts labels).
- [x] **DB (063–065):** Round-20 four-option demotion ROLLED BACK (25 general + 100 olympiad re-promoted on dev — fixes "Practice: no questions" AND restores purchased-package pools; review lists key off option count now); `trg_question_delete_guard` (answered questions can never be hard-deleted — 23514 + hint `question_has_attempts`; archive instead) + `idx_answers_question`; `students.city_district_id` (+FK/index/backfill-from-school + `trg_student_district_guard`: auto-fill from school, reject wrong-city/school-contradicting rayon); `create_child_account` v2 (11-arg, rayon REQUIRED when the city has active rayons, hint `district_required`); `lb_rows` district = coalesce(school rayon, stored rayon); daily pool + readiness gained grade-NULL parity; new RPCs `get_my_round_readiness()` (student pre-flight booleans) + `get_olympiad_pool_counts(uuid[])` (real published pool counts; both authenticated, counts/booleans only).
- [x] **AD1 (olympiad question CRUD):** pool question list on the package edit page (search, real live count, options-count warn pill, image dot, status) + create/edit modals (`OlympiadQuestionForm`/`Manager`: subject/grade fixed from the package server-side, optional olympiad-scoped taxonomy, trilingual, fixed A–E + one-correct radio, one-submission staged image w/ byte-sniff+rollback) + delete w/ confirm (guard-blocked → trilingual "archive instead") + Archive/Restore; **ID-STABLE option updates** (update in place by order_index — historical `selected_option_ids` keep resolving; missing option E rows inserted); 4 new `requireAdmin`-first actions in olympiad.ts w/ package-ownership re-verify + audit (`admin.olympiad.question.*`); general `deleteQuestion`/`DeleteQuestionButton` now surface the same guard message. Bulk import stays creation-only.
- [x] **AD2 (unified Locations):** nav Cities/Districts/Schools → ONE "Yerlər" `/locations` (old routes = redirects); 3-column URL-driven master-detail (cities+counts → rayons+counts → schools; per-column search/add/edit/delete via modals hosting the existing forms in new stay-mode — `{ok:true}` instead of redirect; router.refresh, no reloads); "Rayon təyin edilməyib" review entry w/ live count; city-without-rayons lists schools directly; **delete-impact modal** via `getLocationDeleteImpact` (city: cascade rayons + blocking schools (confirm disabled) + students; rayon: schools→review; school: students detached) + centralized `deleteLocation`; all validations/audit preserved; responsive stack <1100px; `.admin-content:has(.locations-page)` widened.
- [x] **W1 (student):** Tests page pre-flight via `get_my_round_readiness` (state matrix: live→continue / attempted→pill / not-ready→muted `test.rounds.notReady` pill w/ Practice still active / ready→Start; err-redirect kept as race fallback); dashboard redesign (removed Bugünkü raundlar + Son xəbərlər, `ChildNewsPanel.tsx` DELETED; hero+rank / ticker / [lbq | strength] balanced grid / Son raundlar full-width; rank card wired to REAL all-time global rank w/ honest not-ranked; loading.tsx mirrors; `.arena-cols` 1fr 1fr; dead `.arena .news-*` remap removed); child olympiads page on real pool counts (missing row → 0).
- [x] **W2 (parent):** Add-Child wizard + Edit-Child cascade (City → mandatory Rayon when the city has them → School filtered by rayon incl. NULL-rayon schools; clears correctly; edit preselects; legacy child in rayon-city must pick on next save); services thread `cityDistrictId` end-to-end (`children.ts` UUID check, `createChild` 11-arg RPC + `district_required`/23514 mapping → `addchild.err.districtRequired`, `parentCore` update w/ DB-backed requiredness + guard mapping, same-update school+rayon write); parent olympiads page on real pool counts (PlannedCard/Purchase consume questionsText — no change needed). Main session threaded `city_district_id` through the mobile BFF `/children` + `/children/[id]/edit` routes + API_CONTRACTS.md so M3.1 is client-only.
- [x] **Docs:** root CLAUDE.md rules updated (district stored-with-guards; authored-5-options + re-promotion nuance + delete guard; olympiad CRUD + real counts); mobile master plan **§7.2d** + execution plan **M3.1 (Round-20/21)** + mobile CLAUDE.md; testing guide **LL1–LL8**; React DevTools error documented as no-fix (LL1).
- **Follow-ups (tracked):** mobile M3.1 additions (pool counts `?? 25` kill, readiness pre-flight, arena-home relayout, add-child rayon step — BFF already accepts the field); `bulkDeleteQuestions` still aborts silently when ANY selected question has attempt history (needs feedback plumbing in the bulk bar); old deep link `/schools?district=none` lands on plain `/locations` (review preselection not carried); `addchild.field.noDistricts` key resolved but visually unused (field hidden for rayon-less cities); migrate olyq.*/loc.* labels.ts strings into messages.ts opportunistically; daily-round content prep still OWNER WORK (terms + option E; readiness panel shows gaps).

### Round 22 (ACTIVE, started 2026-07-14): admin question-edit modal + table width · mobile Android crash · FULL MOBILE UI/UX OVERHAUL (this activates a Mobile stage: M3.2)

**Owner queue (3 items):**
1. **Admin Questions**: React "unique key" warning when opening a question's edit page (child passed from EditQuestionPage into QuestionForm) → find+fix the key; REPLACE the separate edit page with an edit MODAL (NewQuestionModal pattern, no reload); old edit route redirects.
2. **Admin Questions table squeezed at full screen** → widen `.admin-content` for the questions page (locations `:has()` mechanism, ~1560px) + let the text column flex/ellipsize so action buttons stop clipping.
3. **Mobile (Android, Expo Go)**: (a) Render Error `cannot add postgres_changes callbacks … after subscribe()` on any navigation/bell/profile tap — ROOT CAUSE: `useNotifications` created a per-consumer Realtime channel with the SAME topic; supabase-js dedupes by topic, so the 2nd consumer's `.on()` hit an already-subscribed channel → **FIXED** (module-level ref-counted singleton channel, unique topic per rebuild, teardown on last release/profile switch; tsc PASS, jest 37/37). (b) NEW PERMANENT RULE: owner manual-tests mobile on a physical ANDROID phone (iOS later) — recorded in root+mobile CLAUDE.md; every change stays iOS-correct. (c) **Full UI/UX redesign** — owner didn't like the current look; wants modern, eye-catching, senior-grade design; colors/component placement follow the web app; Welcome/onboarding screen shows ONLY ONCE per install (persisted flag — never again after login/registration); PLAN FIRST (dedicated design plan doc) then implement across every screen.

**Plan:** admin agent (key fix + edit modal + width) ∥ mobile screen-inventory scout → write `mobile-app/markdowns/MOBILE_UI_REDESIGN_PLAN.md` (design language, per-screen specs, welcome-once flow, Android/iOS parity) → implement via disjoint mobile agents (shared primitives/theme → public+auth → parent tabs → student arena) → gates (tsc/jest/lint/export + admin typecheck+build) → guide MM sections → STATUS close → ONE commit message (no commit). No frontend-design skill exists in this environment (owner offered install permission) — proceeding with the design plan document as the control surface.

**✅ ROUND 22 / M3.2 COMPLETE (2026-07-14). Final gate: admin typecheck+build PASS · mobile `tsc --noEmit` 0 · `expo lint` clean · jest **40/40** (37 + 3 new untimed-engine tests) · `npm audit` 0 · Metro export bundles (android). Testing guide MM1–MM10. Nothing committed yet.** Executed as 1 admin agent + 1 scout + 4 mobile agents (MA foundation → MB parent ∥ MC arena ∥ MD tests; MC recovered from a mid-flight connection drop via resume; MD got a follow-up pass). Design truth: `mobile-app/markdowns/MOBILE_UI_REDESIGN_PLAN.md`.
- [x] **Admin (AD):** key warning root-caused (RSC-boundary `mediaSlot` element from the server edit page lacked React's static-validation flag → keyed Fragment + client-created element); question EDIT = modal on /questions (on-demand `loadQuestionForEdit`, stay-mode save, lifecycle+delete+media carried over, `router.refresh()`); `/questions/[id]/edit` → redirect; QuestionLifecycle/DeleteQuestionButton deleted (deduped into the modal); questions page widened via `:has(.questions-page)` 1560px + wider text column + nowrap actions.
- [x] **Mobile crash (pre-agents):** `useNotifications` per-consumer channels on ONE topic → supabase-js dedupe returned the subscribed channel → `.on()` threw. Fixed: module-level ref-counted singleton (unique topic per rebuild, teardown on last release/profile switch).
- [x] **MA (foundation+public):** `lucide-react-native` (only new dep, audit 0); i18n re-synced (1075 keys ×3 — Round-20/21 web keys now on mobile) + 12 mob.onb/login keys; tokens += display/weight/gradients/`shadow()` helper; Button (scale+ripple+gradient variant), Card variants, NEW Avatar/ListRow/StepDots/ProgressRing/SectionHeader/**AppTabBar** (+appTabPalette/arenaTabPalette); TabIcon → lucide (+`focused`); restyled Segmented/fields/StatusViews/HeaderBell/AccountSheet; HeaderAvatarButton = real initials Avatar; **onboarding 3 slides + `olympiq.seenWelcome` SecureStore flag** (hydrated in RootGate; signed-out → Login when seen; logout lands on Login; "OlympIQ haqqında" replays; ?review=1); login/register/pricing/about/faq/contact + boot screens restyled; gallery updated; StagePlaceholder deleted.
- [x] **MB (parent):** AppTabBar wired; home greeting header + rich child cards + gradient add-child hero; analytics Avatar chips + SectionHeader/legends; olympiads cover-scrim cards + REAL pool counts (parent-owned `useOlympiadPoolCounts`) + gradient buy CTA; subscription GradientBorderCard (demo billing kept, restyled); notifications (BOTH roles) date-grouped SectionList + lucide type icons + ListRow anatomy (+3 mob.notif.* keys ×3); parent profile ListRow sections + DangerZone; **add-child wizard: StepDots + mandatory Rayon between City/School** (client guard + BFF `city_district_id`; school list rayon-filtered incl. NULL-rayon; edit preselects via RLS read; naming trap honored) + summary card + hero success.
- [x] **MC (arena):** arena AppTabBar; **arena home = Round-21 web layout** (hero → gradient ProgressRing with the REAL all-time rank (`get_my_leaderboard_rank` all_time, honest unranked) → ministats → streak-risk → ticker → locked card → monthly quick-look → strengths → recent; today's-rounds mirror + NewsMiniPanel REMOVED); **ranking numeric-only (medals deleted) + district scope chip** (school.city_district_id ?? students.city_district_id — RPC-parity precedence) + Avatar rows + district in context line; **olympiads real counts** (`fetchOlympiadPoolCounts`, `?? 25` ×3 dead, field name `questions` kept); student profile: shared Avatar, palette swatches DERIVED from ARENA_LIGHT (18 hexes deleted), ListRow/lucide sections; arena/ui.tsx restyled (ArenaChip, ARENA_BTN_INK).
- [x] **MD (tests):** ui.tsx/TestsHome/Setup/Runner/Result/Review restyled (readiness state matrix live>attempted>notReady>ready fail-open; AnsweredBar; TimerPill red pulse <60s; letter-chip options; ProgressRing result hero; review filter chips) — engine logic diff-verified untouched in pass 1; **follow-up pass (engine unfreeze, 2 changes): null deadline = UNTIMED** (null anchor → no countdown/auto-submit/resync; isLiveAttempt: untimed in_progress stays live/resumable; fixes practice insta-submit against migration 057) **+ rated daily-round Start wired** (`start_daily_round_attempt('today')` with web-parity error mapping 23505→attempted-flip / P0002→noRoundYet / 23514→noGrade/noAccess; runner rated/practice ModeBadge via is_rated; ∞ noLimit pill; setup wording = practice contract; result accepts kind='daily'). Jest 37→40.
- **Follow-ups (tracked):** mobile previous-day replays (`p_day:'yesterday'`) + question images in mobile runner/review + maintenance short-cadence refetch = the M3.1 remainder (master plan §7.2c/§7.2d — several §7.2d items shipped here: pool counts, readiness, arena-home relayout, add-child rayon); iOS device pass pending (built iOS-correct: shadow() helper, safe areas, ripple/opacity); owner content prep for daily rounds unchanged (terms + option E).

### Round 23 (ACTIVE, started 2026-07-15): mobile auth-surface cleanup + INVESTOR public-copy pass + registration dropdown localization

**Queue:**
1. **Mobile auth surfaces → industry-standard minimal (owner):** onboarding final slide = Log in + Register ONLY (student sign-in button removed — students go through Login's parent|student tabs; parents are the only registrants); the Pricing/About/FAQ/Contact/News chips, the "OlympIQ haqqında" replay link and the __DEV__ Design-gallery button removed from welcome AND login (register was already clean; a single Register link stays on Login since post-onboarding cold starts land there). **DONE pre-plan** (welcome.tsx + login.tsx; mobile tsc PASS). Public info routes stay routable in-app.
2. **Investor Word file** `docs/investor/OlympIQ saytındakı mətnlər checked part.docx` (extracted with highlight markers → scratchpad): yellow = approved AZ copy for Home/Pricing/About + nav/footer. Apply AZ verbatim; EN/RU re-authored to match meaning. ⚠️ CONFLICTS TO FLAG: (a) approved family-package copy says **2nd child -10% / 3rd+ -15%** — the implemented FIXED business rule (and quote engine) is **15% / 20%**; applying copy verbatim + flagging (owner must either change the business rule in the DB quote fn or fix the copy — copy alone changed nothing in billing). (b) Plan prices ≈3/9/90 AZN are highlighted — if the pricing page renders DB `subjects_pricing` amounts, that's CONFIG not copy (scout confirming; would update dev config + note). (c) Copy claims "süni intellekt əsaslı" (AI-based) positioning — marketing only, no product change.
3. **Registration/onboarding dropdown localization:** predefined options must render az/en/ru from dictionaries with canonical stored values (labels never stored; language switch never corrupts selection). NOT in scope: translating user-entered answers (explicit investor correction), new translation APIs, UI redesign.
4. **Mobile impact:** re-run `sync-i18n` after web copy lands (mobile pricing/about/welcome reuse synced keys); mobile docs note for canonical-option rule if screens missing.

**Plan:** scout (copy source map incl. site_content CMS override interplay + dropdown audit + mobile mirror) → apply copy in web messages.ts ×3 (+ dev site_content rows if they shadow) → dropdown fixes per audit → gates (web typecheck+build, mobile tsc + sync-i18n) → STATUS close + concise 6-part report (investor format).

**✅ ROUND 23 COMPLETE (2026-07-15). Final gate: web typecheck+build PASS · admin typecheck+build PASS · mobile tsc 0 + jest 40/40 + lint clean. Nothing committed yet.**
- [x] **Mobile auth minimal (item 1):** onboarding final slide = Log in + Register only (student-login button, info chips, __DEV__ gallery button removed); Login footer = one Register link (chips + "OlympIQ haqqında" replay removed); register already clean. Public info routes stay routable in-app; the gallery stays reachable by URL for devs.
- [x] **Investor copy (item 2):** scout mapped every docx slot → key; NO dev site_content rows shadow the changed keys (only nav.login/register overrides exist, values identical). Applied: 39 keys updated + 9 new (about2.hero.p2–p4 prose section on /about + subj.* labels) ×3 locales (AZ verbatim from the docx yellow text; EN/RU re-authored to match); admin siteContentRegistry defaults updated in lockstep (14 keys); home stats numbers → 25,000+/60+/3,000+/95%; pricing = CONFIG not copy → dev `subjects_pricing` updated to 3/9/90 AZN (12 rows) + canonical 012 seed + web FALLBACK — checkout still reprices server-side.
- [x] **Dropdown localization (item 3):** audit verdict — grades (formatGradeLabel), phone-country (Intl.DisplayNames) and city/rayon/school (proper nouns) were already correct; ONE real defect = subject names rendered az-only in EN/RU (subjects table has no translations). Fixed dictionary-side: `subj.<code>` keys + `subjectLabel(t, code, name)` helpers (web + mobile, gradeLabel pattern, DB-name fallback for unknown codes) wired at ~35 render sites (wizard/subscribe/manage-subjects/analytics tabs/leaderboard+ranking pickers/tests+arena/olympiad chips/pricing rows); ALL stored values remain UUIDs — language switch never corrupts selections. NON-TASK honored: user-entered answers never translated; no translation API; no schema change.
- [x] **Mobile impact (item 4):** catalog re-synced (1084 keys ×3 — pricing2/about2/nav/footer copy flows to mobile pricing/about automatically); mobile subject sites wired via the same helper; jest 40/40.
- **✅ DISCOUNT RULING RESOLVED (owner, 2026-07-16: investor numbers win):** sibling discount changed to **2nd child 10% / 3rd+ 15%** end-to-end — migration `2026_07_16_066_sibling_discount_10_15.sql` (formula in quote_child_subscription / add_subscription_subject / remove_subscription_subject; generated from live defs so nothing else drifted; applied to dev, self-verify PASS) + canonical 011/007 backport + root/supabase/admin CLAUDE.md rules + 9 remaining −15/−20 UI strings (pricing.sibling + FAQ ×3 locales) + mobile catalog re-synced. Historical `sibling_discounts` audit rows keep the percent actually charged. Gates: web tsc PASS · mobile tsc PASS · from-zero 67/67 PASS. Origin of the conflict documented: the investor docx family-package text vs. the owner's 2026-06-27 confirmed model — both owner inputs; latest (investor) wins per the standing rule.
- **✅ 25-QUESTIONS RULING RESOLVED (owner, 2026-07-16): KEEP the current engine** — olympiad attempts continue to draw ALL package questions (Round-20 model); the investor's "25 suallıq" sentences (About + home why-us card) are accepted as marketing wording and stay verbatim. No engine change.

### 📱 Stage M3.1 — Remaining parity tail (ACTIVE, started 2026-07-16)

**This is the ACTIVE stage.** Source: `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` §M3.1 + master plan §7.2c/§7.2d REMAINING markers. Owner mandate: professional implementation, web↔mobile synchronization, admin-panel control preserved, security best practices, UI/colors identical to web (token system).

**Scope (all mobile client — the backend/BFF already serve everything):**
1. **Previous-day round replays** (§7.2c.1 remainder): Tests tab gains the web's "Previous Day's Rounds" section (order: Today's / Previous Day's / Recent) — per-subject Replay via `start_daily_round_attempt(p_subject_id, 'yesterday')` (untimed practice replay of the stored immutable snapshot; never rated), the trilingual "practice only — never affects the leaderboard" notice, `no_data_found` → the noYesterday state (web err=noyest parity; web shows buttons and maps the error on click — same here, the snapshot table is deliberately not client-readable).
2. **Question images in runner + review** (§7.2c.6): extend mobile attempt/review types+mappings with the optional `image {bucket,path}` the payloads already carry; new mobile QuestionImage (expo-image, between body and options, tap = full-screen viewer) matching the web `QuestionImage` behavior — the agent must mirror the WEB's URL construction for the question-media bucket exactly (public URL vs other — verify, don't assume).
3. **Maintenance short-cadence refetch** (§7.2c.9): web = 4s-TTL + polling splash (enter ≤5s); mobile = `mobile-config` query gains an active-state refetch cadence (~30s foreground) + fast ~5s polling WHILE the MaintenanceScreen is shown (fast exit), still fully driven by the admin Settings flag through the anon whitelist RPC. No admin work needed (control plane already exists).
4. iOS device pass = OWNER (code built iOS-correct; untested on device).

**Plan:** one mobile agent (features/tests/** + configQueries/boot; reuse M3.2 primitives + arena tokens; synced i18n keys only) → gates (tsc/jest/lint/audit/export) → guide NN section → STATUS close → ONE commit message.

**✅ M3.1 COMPLETE (2026-07-16). Final gate: mobile `tsc --noEmit` 0 · `expo lint` clean · jest 40/40 · `npm audit` 0 · Metro export bundles. Guide NN1–NN4. Nothing committed yet. NO DB/BFF/admin changes were needed — the whole stage was client parity over the existing admin-controlled backend.**
- [x] **Previous-day replays:** `startDailyRoundAttempt(subject, day)` gained the 'yesterday' path (web-parity error mapping — P0002 → `test.rounds.noYesterday` inline on the row); Tests tab = Today's / **Previous Day's Rounds** (SectionHeader + practice-only Notice + per-subject Replay rows w/ subjectLabel) / Recent; success routes into the shared runner's shipped untimed mode (∞ pill + practice badge); unlimited, click-then-map (snapshot table stays server-only — no new exposure).
- [x] **Question images:** `TestQuestion`/`ReviewQuestion` carry the payload's `image {bucket,path}` (verified against canonical get_test_attempt/get_test_review — both snapshot + legacy branches emit it); new `QuestionImage` (expo-image contain, 220 max, token border, skeleton-until-load, silent-hide-on-error, full-screen Modal viewer w/ Android back + safe areas) rendered between body and options in runner + review; URL mechanism mirrored from the web run/review pages (`storage.getPublicUrl` ≡ mobile `publicStorageUrl`).
- [x] **Maintenance cadence:** `useMobileConfig` refetchInterval fn — **5s while maintenance is ON** (fast exit; the MaintenanceScreen renders exactly then) / **30s foregrounded** (fast enter), gated by an AppState `useSyncExternalStore` mirror + `refetchIntervalInBackground:false` (no background polling); boot fetch + foreground invalidation unchanged; still 100% driven by the admin Settings flag through the anon whitelist `get_mobile_config`.
- i18n: ZERO new keys (all synced web keys). **Remaining mobile work: the iOS device pass (owner) → then M4** (push notifications, MASVS hardening, store compliance/launch).

### 📱 Stage M4 — Push, hardening, compliance & launch (ACTIVE, started 2026-07-16) + M3.1 Android-test hotfixes

**This is the ACTIVE stage.** Source: `MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` §M4 + master plan §13/§15–§19/§21 + `docs/NOTIFICATIONS_MOBILE_CONTRACT.md`. Owner mandate: professional, well-connected, admin-controlled, security best practices.

**Hotfixes first (owner's M3.1 Android pass, FIXED + gated same-day):**
1. **Student login "server error"** — root cause: `EXPO_PUBLIC_BFF_URL=http://localhost:3000`; on a physical phone `localhost` is the phone, so every BFF call (child login, register) died at the network layer while parent login (direct Supabase) worked — hence empty Supabase logs. Fix: dev-only host inference in `src/lib/env.ts` (`localhost` → the Expo dev machine's LAN host from `Constants.expoConfig.hostUri`; release builds unaffected — `__DEV__` false + EAS sets a real origin) + `.env`/`.env.example` comments. Requires the web-app dev server running on the same network.
2. **Notification filter chips rendered as giant pills** — RN `ScrollView` carries implicit `flexGrow:1`, so the horizontal chips row split the screen's free height with the list and default cross-axis `stretch` inflated each chip. Fix in `CategoryChips` (`features/notifications/components.tsx`): `style={{flexGrow:0}}` + centered content — fixes parent AND student screens. Gates: tsc 0 · jest 40/40 · lint clean.

**M4 ground truth (scouted): ZERO DB changes needed.** `get_mobile_config()` already returns `flags.notifications_push`; `upsert_push_token(p_token,p_platform,p_device)` exists (DEFINER, authenticated EXECUTE, upsert-by-token, re-validates); RLS already grants owner SELECT+DELETE on `push_tokens` (logout de-registration = own-row delete); the engine (`create_notification`) already creates `push` delivery rows only when flag ON + recipient `push_enabled`; the processor (`/api/notifications/process`, `x-processor-key`) claims via `claim_pending_deliveries` and calls the `sendPushDelivery` STUB in `web-app/src/lib/notifications/delivery.ts` (`EXPO_ACCESS_TOKEN` seam); the processor runs service-role so token invalidation is a direct update (no new RPC); `notifications_push` is already a toggle in admin Settings; version gate + admin Mobile App page already live.

**Scope & agent plan (disjoint):**
- **Agent M (mobile):** deps `expo-notifications` + `expo-device` + `expo-local-authentication` (npx expo install; justification: push registration/handling, physical-device+ExpoGo detection, biometric app-lock — all Expo-recommended set). Push registration hook (sign-in + token-rotation listener → `upsert_push_token`; gated on `flags.notificationsPush` — flag OFF = zero registration; Android-in-Expo-Go + no-projectId + simulator guards = graceful skip); permission UX (post-login, iOS provisional first, Android 13 runtime); Android channels per category (announcement/olympiad/progress/billing/news/default, brand color); iOS categories registered; foreground = silent (in-app Realtime toast already covers it) + badge sync; tap routing (response listener + cold-start `getLastNotificationResponseAsync` → `action_url` → `isSafeRelativeUrl` → `resolveDeepLink` allowlist w/ deferred-link replay); logout de-registration (own-row DELETE before signOut). Biometric app-lock (opt-in): AccountSheet SECURITY toggle (enroll-checked, authenticate to toggle both ways), lock on cold start + >60s background, logout escape, never bypassable. app.json: expo-notifications plugin (icon/color) + expo-local-authentication plugin (Face ID string), NSFaceIDUsageDescription. Mobile-only strings ×3 in `messages.mobile.ts`. Jest: channel map, app-lock timing logic, `resolveDevBffHost`. Gates: tsc/lint/jest/audit/export.
- **Agent W (web BFF):** implement `sendPushDelivery` (Expo Push API via fetch — NO new dependency: chunked ≤100, `channelId` from category, iOS `badge` = recipient unread count, data = {action_url, notification_id, category, type}; ticket-level `DeviceNotRegistered` → service-role `is_valid=false`, other errors → `failure_count`+1 with invalidate-at-5); processor route: select `action_url`+`category` through, add GET handler for Vercel Cron (`Authorization: Bearer CRON_SECRET`, constant-time) alongside POST `x-processor-key`; `web-app/vercel.json` cron `*/5`; `.env.local.example` documents `EXPO_ACCESS_TOKEN`/`CRON_SECRET`/`NOTIFICATIONS_PROCESSOR_KEY` (names only). Gates: web typecheck+build.
- **Main session (docs/compliance):** launch pack (`mobile-app/markdowns/STORE_LAUNCH_PACK.md`: store metadata ×3 locales, data-safety/privacy inventory, review notes incl. child-account + commerce posture, age rating) + `RELEASE_RUNBOOK.md` (EAS build/submit, staged rollout, OTA policy + rollback, version-gate + incident playbooks, push ops); MASVS §13 sweep results; §16 decision recorded (sentry OFF for v1 — no new tracking dep; owner may revisit); testing guide OO sections; master plan/exec plan/mobile CLAUDE updates; STATUS close; ONE commit message (no commit).

**Known launch constraints (documented, not blockers):** Expo Go on Android (SDK 53+) cannot receive remote push — push testing needs a dev build (`eas build --profile development`) + `eas init` (projectId) + `EXPO_ACCESS_TOKEN`; Vercel Hobby crons are daily-only (runbook offers external-cron alternative hitting the POST endpoint); real-payment IAP stays out of scope (§17 posture: read-only real-money commerce).

**✅ M4 COMPLETE (2026-07-16). Final gates: mobile `tsc --noEmit` 0 · `expo lint` clean · **jest 58/58** (+18 new: push channels, app-lock timing, resolveDevBffHost, push-payload deep-link cases) · `npm audit` 0 · Metro export bundles (entry hbc 6.34MB — over the aspirational §15 3.5MB note, pre-existing scale, flagged on the release checklist) ∥ web typecheck PASS · build PASS (34 routes) · audit 0. ZERO DB changes (contract held: every RPC/flag/RLS piece pre-existed). Nothing committed yet.**
- [x] **Hotfixes (owner's Android pass):** student login from a physical phone (dev-only `localhost`→Expo-host inference in `env.ts`, pure + unit-tested; needs the web-app dev server on the same network) + notification filter chips (ScrollView implicit `flexGrow:1` — fixed in `CategoryChips`, both inboxes).
- [x] **Push, mobile (`src/features/push/`):** flag-gated registration (signed-in + role + `flags.notificationsPush`; flag OFF = zero calls) with graceful skips (simulator / Expo-Go-on-Android / missing projectId / permission denied — never re-nags); iOS provisional-first permission; token → `upsert_push_token` (+SecureStore `olympiq.pushToken`, rotation listener); logout = own-row RLS DELETE **before** `auth.signOut()` + badge clear; Android channels = engine categories (announcement/olympiad HIGH, brand light color) + iOS categories; foreground pushes SILENT (Realtime toast already covers it) with badge sync from the inbox singleton; taps (warm + cold via `getLastNotificationResponseAsync`) route `action_url` → `isSafeRelativeUrl` → `resolveDeepLink` allowlist with deferred-link replay. Deps (SDK-54 set): expo-notifications ~0.32.17, expo-device ~8.0.10, expo-local-authentication ~17.0.8.
- [x] **Push, web (`delivery.ts` + processor):** `sendPushDelivery` = plain fetch to the Expo Push API (NO new dependency; 100-msg chunks, 10s timeout, 180-char word-boundary body truncation, `channelId` from the category whitelist, iOS-only `badge` = recipient unread head-count, data = {action_url, notification_id, category, type} — never `data_json`/PII); ticket-level hygiene (`DeviceNotRegistered` → `is_valid=false` immediately; other ticket errors → `failure_count`+1, retire at 5; ok → reset+`last_used_at`; transport failures never punish tokens); bookkeeping is best-effort (a DB hiccup can't flip a sent push to failed). Processor: select extended (id/type/action_url/category), shared core behind BOTH entrypoints — POST `x-processor-key` (pg_net/external cron) + NEW GET for Vercel Cron (`Authorization: Bearer CRON_SECRET`, constant-time, closed when unset); `web-app/vercel.json` schedules `*/5`; env names documented in `.env.local.example` (EXPO_ACCESS_TOKEN, CRON_SECRET).
- [x] **Biometric app-lock (opt-in, `src/features/applock/`):** AccountSheet SECURITY section (enroll-probed, authenticate-to-toggle in BOTH directions, device-credential fallback allowed); lock on cold start (restored sessions only — a fresh login is its own proof) + >60s background (pure tested `shouldLock`); branded token-driven overlay OVER the never-unmounted Stack (navigation state survives), auto-prompt + retry + logout escape, Android back eaten, safe-areas; SecureStore `olympiq.appLock`; `NSFaceIDUsageDescription` via the plugin (az).
- [x] **Launch pack (docs):** `mobile-app/markdowns/STORE_LAUNCH_PACK.md` (listing metadata ×3 locales, data-safety/privacy inventory feeding both stores' forms, children's-data + Kids-Category posture (comply materially, don't enroll), §17 commerce posture + reviewer notes, age-rating answers, asset checklist, submission blockers) + `RELEASE_RUNBOOK.md` (EAS profiles/commands, staged rollout, signed-OTA policy + `eas update:republish` rollback, push ops incl. enable-order + kill switch + token hygiene + trigger options, version force-gate runbook, incident playbook, backlog intake). §16 DECIDED: sentry OFF for v1 (recorded in master plan). i18n: 14 mobile-only keys ×3 (mob.push.ch.* + mob.lock.*).
- [x] **MASVS §13 sweep (verified against code):** deep links/notification taps = allowlist-only, payloads are display data ✓; tokens/session/prefs SecureStore-only, no PII in logs (dev-only devLog, no crash SDK) ✓; TLS-only, hosts = Supabase + BFF, ATS on + cleartext off ✓; child lockout at the BFF + optional app-lock + logout wipes session/token/badge/queryClient ✓; anti-cheat: options never carry `is_correct`, timers server-authoritative (unchanged) ✓; permissions = photos + notifications (opt-in) + biometrics (opt-in), `allowBackup=false` ✓; Hermes + signed OTA + audit-0 gate ✓; service-role key: never in mobile (registration via DEFINER RPC, invalidation server-side only) ✓; children's-data posture documented in the launch pack ✓.
- **Owner tail to go LIVE (runbook §1/§4 + launch pack §6):** `eas init` → Android dev build (Expo Go can't receive Android push) → store accounts/credentials + privacy-policy URL → deployed BFF env (`EXPO_ACCESS_TOKEN`, `CRON_SECRET`, `NOTIFICATIONS_PROCESSOR_KEY`) → admin Settings `notifications_push` ON → production Supabase + EAS prod env → `eas build/submit` + staged rollout. iOS device pass (NN4/OO checks) still owner-pending. **All mobile stages M1–M4 are now code-complete.**
- **📌 OWNER TODO (noted 2026-07-16, on owner request):** read through `mobile-app/markdowns/RELEASE_RUNBOOK.md` + `STORE_LAUNCH_PACK.md` and execute the Expo setup: 1) create a free account at expo.dev, 2) in `mobile-app/` run `npx expo login` then `eas init` (writes the EAS projectId into app.json — required for push tokens and builds), 3) the **EXPO_ACCESS_TOKEN** (server send credential — NOT the per-device push token, which the app obtains automatically) is created at expo.dev → Account settings → **Access tokens** → "Create token" → put it in `web-app/.env.local` as `EXPO_ACCESS_TOKEN=…` (and later into Vercel project env). Never commit it.

### Round 24 (ACTIVE, started 2026-07-16): notification tap-routing + navigation/anti-bypass audit · live ticker animation · rating-card truncation · in-app info pages (mobile account sheet + web parity)

**Owner queue (5 items, from the Android M4 pass — overall verdict "beautifully implemented"):**
1. **Notification tap-routing:** plain announcements correctly open the detail sheet, but typed notifications route poorly — e.g. a student tapping "Olimpiada paketi alındı" lands on the HOME tab instead of the Olympiads tab. Re-map EVERY server-produced `action_url`/type to the right in-app target per audience (student vs parent); full navigation review.
2. **Navigation + anti-bypass audit:** go over all navigation again — nothing bypassable, especially tests/test-engine surfaces (no way to gain points/replay rated rounds/enter runners via links; server-authoritative posture re-verified client-side).
3. **Student home live ticker:** the web arena home has a live rolling ticker; mobile shows the same row STATIC + truncated ("CANLI · Xal 1 · … BU G…"). Implement a professional seamless marquee (animated, looping, reduce-motion-aware).
4. **Rating card truncation:** the REYTINQ card's stat labels truncate ("REKO…"). Fix the layout professionally — labels never truncate on phone widths.
5. **Profile/account surface:** the Round-23 auth-surface cleanup removed the info links (About/FAQ/Contact/Pricing/News) from welcome/login — correct there, but they must exist INSIDE the app: extend the mobile account sheet (opened from the avatar) with an INFO section linking those pages; add the SAME in-app links to the web app (parent + student authed surfaces) for parity.

**Plan:** Explore scout (server action_urls per type/audience · deeplink RULES gap list · web ticker mechanics · arena home ticker/rating-card files · account-sheet structure + (public) route reachability · web authed-layout link surfaces · test-engine bypass surface) → mobile agent (routing map completion + marquee + rating card + account-sheet INFO section + anti-bypass fixes) ∥ web agent (in-app info links parity) → gates (mobile tsc/lint/jest/audit/export; web typecheck+build) → guide PP sections → STATUS close → commit message(s). No DB changes expected (action_urls live in SQL templates — if any server URL is genuinely wrong, fix via migration workflow; otherwise map client-side).

**✅ ROUND 24 COMPLETE (2026-07-16). Final gates: mobile tsc 0 · lint clean · **jest 63/63** (+5 routing cases) · audit 0 · export bundles ∥ web typecheck PASS · build PASS · audit 0. ZERO DB changes; ZERO new web i18n keys; 1 mobile-only key (`mob.info.section` ×3). Nothing committed yet.**
- [x] **Tap-routing (root cause):** the server URLs were all correct — the mobile RULES map swallowed sub-paths. The bug the owner saw = PARENT `olympiad_purchased` (`/children/{id}/olympiads`) caught by the `/children`→Home rule. Added UUID-validated dynamic rules: `/children/{uuid}/olympiads` → parent Olympiads tab; `/child/test/result|review/{uuid}` → the actual student result/review screens (was: Tests tab — safe to deep-link, both RPCs are owner+graded-gated); `/news/{slug}` role-aware → the article screen for authed users, bare `/news` → the role's news tab (was: bounced to Home via welcome); non-matching suffixes keep the old fallbacks.
- [x] **Navigation/anti-bypass audit — PASS, no fixes needed:** rated-round uniqueness/access all server-side (23505/P0002/23514 mapped to i18n keys); runner NOT deep-linkable (no rule + non-UUID redirect in the route); leave-guard (beforeRemove + hardwareBackPress) with autosave-then-leave; no `is_correct` before grading anywhere (review RPC = owner+graded; gcTime 0, never persisted); notification payloads = display data only.
- [x] **(public) guard scoped to auth surfaces:** signed-in users are bounced ONLY off welcome/login/register; About/FAQ/Contact/News open in-session (fixes the parent profile FAQ/Contact rows that bounced to Home); **Pricing stays blocked for student sessions** (children never see commerce — guard + deep-link `mismatch`); signed-in news article view skips the `news_public` public-surface flag (web parity); cross-group back-arrow fallback added (nested stack has no parent history — iOS-correct).
- [x] **Account sheet INFO section** (between SECURITY and SESSION): About/FAQ/Contact both roles + Pricing parent-only (lucide icons, sheet closes before push, `nav.*` labels).
- [x] **Student home:** live ticker = seamless marquee mirroring the web (content ×2, translateX 0→−width, ~30px/s linear loop, native driver, restarts on text change, reduce-motion → static, a11y-hidden, overflow-hidden fixed-height container); REYTINQ card `MiniStat` labels wrap to 2 centered lines — no truncation at 320px in az/en/ru (hero rank row checked too).
- [x] **Web parity (in-app info):** parent footer + `/help/about` (reuses `about2.*` via getT — CMS overrides apply); child arena `/child/help/{about,faq,contact}` in arena chrome (token remap like `.arena .ntf`) + drawer "Yardım" section; shared `AboutContent`/`ContactInfo`/`buildFaqItems` extracted (public+parent+child render one source — parent /help/contact hardcoded-email defect fixed on the way); NO pricing in the child panel.
- **Follow-ups (tracked, non-blocking):** an authed mobile news-article ROUTE would keep readers in their role shell instead of the shared (public) article screen; expo-router native URL matching can still open (public) routes directly (pre-existing, unchanged).
### Round 25 (ACTIVE, started 2026-07-17): authed news-article routes (mobile) · auth/email-flow report · full web↔mobile↔admin parity audit

**Owner queue:** 1) implement the tracked authed mobile news-article route (both roles, own shell); 2) REPORT-ONLY: state of forgot-password / email-verification / account-deletion flows + SMTP posture (constraint: login-after-registration must work WITHOUT verification now; verification may become required later; Brevo planned as SMTP; owner floated a separate auth.olympiq.ai app like side/UniPrep-Auth-master — assess whether needed); 3) explain "daily-round content prep (terms + option E)"; 4) full parity audit web↔mobile + admin-controls-both verification + the definitive remaining-code list (owner believes only payments+webhook remains); 5) advice: Expo account separation vs the owner's personal Expo login (answer: EXPO_TOKEN env var per project).

**Plan:** mobile agent (authed (parent)/news/[slug] + (student)/news/[slug] reusing the shared fetch/ArticleView, deeplink roleTargets retarget, tests, gates) ∥ Explore agent (auth flows/SMTP investigation) ∥ Explore agent (parity + admin-control + remaining-work audit) → STATUS close + consolidated report. Vercel is LIVE per owner (admin+web tested there) — recorded.

### Round 26 (ACTIVE, started 2026-07-17): close the audit findings — attempt-graded trigger · mobile parent leaderboard · mobile Subjects page · dead-code cleanup · admin subject-pricing editor

**Owner queue (all 3 audit findings, "implement professionally"):**
1. **A-1:** attempt-graded notification as a DB TRIGGER on grading (both platforms covered server-side; web's server-action emitter removed so there is exactly ONE producer; identical idempotency key so no dupes during rollout). Migration `2026_07_17_068`.
2. **A-2/A-3:** mobile parent FULL leaderboard browser (web-parity scopes, reached from the analytics panel + home rank chip) + mobile public Subjects catalog page (+deep-link rule; welcome/login stay minimal per Round 23).
3. **A-5:** delete the dead web practice code (`startPractice`/`PracticeRunner`/`child/practice/[id]` — zero callers).
4. **Pricing editor:** admin `subjects_pricing` editor (Administrator-only, NOT content managers; server actions guard-first; writes via a new `admin_upsert_subject_price` SECURITY DEFINER RPC with in-body admin check + audit row; checkout keeps repricing server-side so client stays untrusted). Migration `2026_07_17_069`.

**Plan:** backend agent (migrations 068+069 → dev apply → backport 011/013 → ONE from-zero rebuild; web edits: remove the emitter call + dead-code delete; web gates) ∥ admin agent (pricing editor UI on the fixed RPC contract; admin gates) ∥ mobile agent (parent leaderboard + subjects page; mobile gates) → guide RR → STATUS close → ONE commit message. VS Code node_modules tsconfig diagnostics (expo-notifications) = editor-only noise, no repo change.

### Round 27 (ACTIVE, started 2026-07-18): INVESTOR round 2 — docx copy pass · Pricing→Services · olympiad sales-window lifecycle · landing/services package listing · Add-Child photo/preset avatars · web+admin+mobile sync

**Source:** `docs/investor/OlympIQ saytındakı mətnlər 2ci və son hissə.docx` (yellow = approved copy; parsed programmatically via zip/XML — dump in session scratchpad). Real copy deltas: FAQ 10 Q&A re-authored, register heading+subtitle, subjects lead, Contact + FAQ mention WhatsApp (placeholder number → implemented as ADMIN-CONFIGURED `contact.whatsapp` setting, hidden while empty; real number = tracked BLOCKER). News/login pages: page-name highlights + test content only — no copy changes (owner rules: never publish sxa/asda or placeholder contacts).

**Feature scope:** (a) Pricing→Services rename ×3 locales, canonical `/services` + permanent `/pricing` redirect, all internal links; (b) olympiad packages gain `sale_starts_at`/`sale_ends_at`/`event_at` — publicly visible/purchasable ONLY while active+window-open (RLS + purchase-RPC enforced, server time), purchasers keep LIFETIME access/attempts after expiry (entitlement ≠ sales window; no entitlement expiry invented), admin keeps full history, nothing deleted; new anon `get_public_olympiad_packages()` feeds a landing + Services active-packages section (server-filtered, empty state, ×3); (c) Add/Edit-Child photo upload (PRIVATE `child-avatars` bucket, signed URLs, sniffed mime, generated paths, parent-owned RLS) OR preset boy/girl avatar (stable keys, `students.avatar_kind/avatar_key/avatar_media_path`; skip-default = existing initials bubble), switching clears the other, displays across parent cards/child header/admin/mobile — never on public leaderboards (stay initials/anonymized); (d) admin: package lifecycle fields + Draft/Scheduled/Active/Expired states + date validation + WhatsApp setting field; (e) mobile: synced labels, Services label, package listing/purchase behaviors via same RPCs/BFF, add-child avatar step, deeplink /services alias.

**Agent plan (phased, disjoint):** P1 DB agent (migrations 2026_07_18_070 sales-window + 071 child-avatars → dev apply → backports 002/009/010/011/012/015 + 013 #71/#72 → from-zero 72/72) ∥ W-copy agent (docx copy + registry lockstep + Services rename + /services route). P2 W-features agent (landing/services olympiad sections + add/edit-child avatar UI + BFF child-avatar endpoint) ∥ Admin agent (package lifecycle UI + child avatar views + WhatsApp setting). P3 Mobile agent (sync-i18n + all mobile touches + tests). P4 close: guide SS, STATUS, ONE commit message. Each phase gates before the next.

### Round 28 (ACTIVE, started 2026-07-19): admin-controlled address · landing top-6 + see-more listing · audit-log coverage/filtering review · ecosystem state report

**Owner queue:** 1) contact ADDRESS becomes admin-controlled (Settings → Support, like WhatsApp) and flows dynamically to the web Contact page AND mobile contact screen (seeded with the current address so nothing changes until edited); 2) landing active-olympiad section capped at the latest/soonest **6** + a "see all" button opening a full listing page (prevents landing overload at 10/15/100 packages) — server-limited via a new optional `p_limit` on the listing RPC; 3) audit logs: verify the MOST IMPORTANT admin/privileged actions are all audited with what-changed (old/new) metadata, and the admin audit viewer supports filtering/finding (actor/action/target/date); close gaps found; 4) deliver the ecosystem/launch-state report incl. the notification-system inventory (which personalized notifications exist today vs seeded-but-unwired).

**📌 TO BE TESTED BY OWNER (from Round 27 — guide SS3):** the olympiad sales-window behavior end-to-end on dev: set a past `sale end` on a test package → it disappears from landing/services/catalogs for NON-buyers and purchase is server-rejected, while a family that bought it keeps seeing it and taking attempts (lifetime access). Also SS5 avatars on web + Android and the rest of SS1–SS6.

**Plan:** Explore scout (audit writers/metadata/viewer + notification emitters + contact rendering + listing call sites + RPC signature) ∥ DB agent (migration 2026_07_19_072: `contact.support_address` seed w/ current address default + `get_mobile_config().contact.address` + `get_public_olympiad_packages(p_limit)` back-compat → backports + 013 + rebuild) → web agent (landing cap 6 + see-more page + address from settings) ∥ admin agent (address Settings field + audit-viewer filters + missing audit writes per scout) ∥ mobile agent (contact address from config + sync). Close: guide TT, STATUS, ONE commit message.

**Note (2026-07-19):** mid-round the Fable 5 subagent limit was hit; work continued on Opus 4.8 (main session wrote/validated migration 073 directly; web/admin/mobile agents relaunched on Sonnet). No functional impact.

**✅ ROUND 28 COMPLETE (2026-07-19). Gates: from-zero rebuild **73/73 PASS** (rolled back; dev intact — 19 audit triggers live; migrations 072+073 applied) · web typecheck+build PASS (routes `/olympiad-packages` + `/services`) · admin typecheck+build PASS (28 routes) · mobile tsc 0 · jest 70/70 · lint clean · audit 0 ×3 apps · i18n resynced 1108 keys ×3. Guide TT1–TT4. Nothing committed yet.**
- [x] **Admin-controlled address (migration 072 + app):** `system_settings.contact.support_address` seeded with the live office address (so behavior unchanged until edited); `get_mobile_config().contact` now `{email,phone,whatsapp,address}`; web `getPublicSiteSettings().address` (whitelist + cache key v2→v3); web `ContactInfo.tsx` + mobile `contact.tsx` render the admin value, hide the block when empty; admin Settings → Support gains the Address field (≤300, empty-allowed, audited via updateSetting). i18n `contact.addressValue` key now unreferenced (harmless).
- [x] **Landing top-6 + see-all (migration 072 + web):** `get_public_olympiad_packages(p_limit int default null)` (≤100 cap; no-arg = all — back-compat proven, single overload); `PublicOlympiadPackages` gained a `limit` prop; landing = `limit={6}` + "see all" link (shown when returned count === limit — heuristic, documented) → NEW public page **/olympiad-packages** (full unlimited list, own hero `polyPub.pageTitle/pageLead`, loading skeleton); /services stays unlimited; mobile services screen unchanged (scroll is fine — no mobile see-more route this round).
- [x] **Audit coverage (migration 073):** generic `fn_audit_row` triggers EXPANDED/ADDED — money trail `subscriptions`/`payments` (u→i,u) + `child_subscriptions` (u→i,u,d) so NEW money rows are captured, `checkout_sessions` (i,u), accounts `students` (i,u,d)/`profiles` (u,d)/`child_credentials` (i,u — verified NO secret columns), config `system_settings` (u)/`feature_flags` (i,u,d — reconciled a dev-only drifted trigger into canonical)/`subjects_pricing` (i,u). Discovered + left alone: vestigial orphan `app_settings` (0 rows, not in canonical, unreferenced — its stray dev trigger ignored). Backported to 011; 013 check **#73**; in-migration functional smoke (system_settings update → before/after row). Web app-level audit rows added (`web-app/src/lib/audit.ts`, actor-explicit, best-effort): `parent.register` (+ mobile register route — the one flow not sharing a core), `parent.account_delete` (critical, before delete), `parent.child_create`, `parent.child_password_reset` (warning), `parent.subscription_create`, `parent.subscription_subjects_change`, `parent.subscription_cancel`, `parent.olympiad_purchase` — mobile BFF covered via shared cores.
- [x] **Audit viewer overhaul (admin):** staff-only hard filter REMOVED (default = all activity incl. null-actor system/user rows); filters (URL-param, whitelisted, AND-combined): entity, action (app codes + `op:table` trigger forms), severity, success, actor-scope (All/Staff/Users&system via `or(actor.is.null,actor.not.in(...))`), date from/to (Baku→UTC bounds), target-id (uuid); pagination 50/page Prev/Next; per-row **details** = computed before/after DIFF (field: old→new, skips churn keys, cap 20) / created / removed / metadata list, with **/password|token|secret|hash/i → •••** redaction; added missing ACTION_KEYS (`admin.site_content.update`, `admin.pricing.subject_price_upsert`) + 8 `parent.*` + entity labels. (Follow-up flagged: several other pre-existing app actions still lack ACTION_KEYS labels — taxonomy CRUD, panel_user.create, etc. — cosmetic, non-blocking.)
- **Blockers:** the real WhatsApp number (still investor-side, unchanged from R27). Address now admin-editable (no blocker).

### Round 29 (2026-07-19): admin-controlled contact MAP · wire 4 dormant notification templates · admin notification bell/inbox · notifications ecosystem report

**Owner queue:** 1) the Contact-page mini-map must be admin-controlled and show the exact configured location (not a hardcoded pin); 2) wire the seeded-but-dormant notification templates that DON'T need a payment provider (subject_expiring + giveaway_ending via pg_cron; personal_best + streak_milestone via the grading path); DEFER subject_charge_failed to payment integration (documented); 3) admin notifications — "no notifications go to admins" gap → industry-standard operational alerts + an admin bell; 4) ecosystem/launch-state + notifications inventory report.

**Note:** the Fable-5 subagent limit was hit at the start; this round ran on Opus 4.8 (main session wrote/validated migrations 074+075 directly) with Sonnet UI agents. No functional impact.

**✅ ROUND 29 COMPLETE (2026-07-19). Gates: from-zero rebuild **75/75 PASS** (rolled back; dev intact — migrations 074+075 applied, pg_cron present so the 2 new scanners are scheduled on dev) · web typecheck+build PASS (39 routes) · admin typecheck+build PASS (29 routes incl. `/alerts`) · mobile tsc 0 · jest 70/70 · lint clean · audit 0 ×3 · i18n resynced 1108×3. Guide UU1–UU4. Nothing committed yet.**
- [x] **Notification producers (migration 074, backported 011 + 015 for the olympiad-purchase trigger [table-ordering] + 016 cron):** `notify_admins()` helper (enumerates administrators, per-admin idempotency key); admin operational-alert INSERT triggers on `parents`/`olympiad_purchases`/`child_subscriptions` (types `admin_new_parent`/`admin_new_purchase`/`admin_new_subscription`, category `admin`, admin-panel action_urls); `notify_progress_milestones_tg` on `test_attempts→graded` (fires AFTER `award_attempt_points` by name order) → **streak_milestone** (3/7/14/30/60/100, once per milestone/day) + **personal_best** (rated attempts only, genuine improvement over prior best, never first-ever); daily cron scanners `notify_expiring_subscriptions()` (parents ~3 days before lapse, once per period) + `notify_giveaway_ending()` (all parents in the final 2 days). All service-role only, all wrap `create_notification` in exception-swallow (never break the business action), all at-most-once via idempotency keys. Functional smokes (rolled back) PASS: streak notif created, admin delivery + idempotency, expiring scanner found 3 dev subs, giveaway=0. 013 check **#74**. **subject_charge_failed stays UNWIRED** by design → documented in `docs/PRODUCT_COMPLETION_BACKLOG.md` §A with the exact wiring recipe for when the payment provider lands.
- [x] **Contact map admin control (migration 075):** `contact.support_map_query` setting (empty default → map derives from `contact.support_address`; set "lat,lng"/place query for an exact pin) + `get_mobile_config().contact.map_query` (took the LIVE plpgsql def verbatim + one line — avoided a reconstruction regression). Web `ContactInfo.tsx` builds the keyless Google embed from `mapQuery || address || GovernmentHouse fallback` (CSP already allows google.com; cache key v3→v4); mobile Contact address row is now tappable → opens the device Google Maps with the same precedence. Admin Settings → Support gains the map field under Address. 013 check **#75**.
- [x] **Admin notification bell + `/alerts` page:** admins now RECEIVE (the platform had zero admin-facing notifications). Reused the existing admin browser Supabase client + the self-scoped RPCs (`get_unread_notification_count`/`mark_notification_read`/`mark_all_notifications_read`/`delete_notification` — zero new RLS, `notif_select` already allows self-read); topbar bell (badge, dropdown, mark-read, action_url→admin route) seeded server-side + 60s poll (reliability over realtime for low-volume admin alerts); full `/alerts` received-inbox page; emoji icons (matches the panel's no-icon-lib convention); local `alerts.*` labels ×3.
- **subject_charge_failed:** DEFERRED (payment provider) — recipe in backlog §A.
- **Ecosystem note:** in-app notifications now cover ALL non-payment events (graded, olympiad purchase, subscription cancel, news, achievements, expiry, giveaway) + admin operational alerts; push (M4) still dormant pending owner Expo setup; email channel still stub pending SMTP. Only launch-blocking CODE remains **real payments + webhook** (A1 cluster).
- **🚑 DEPLOY HOTFIX (2026-07-19):** the owner noticed web-app hadn't redeployed on Vercel since 16 Jul while admin-panel had. Root cause: `web-app/vercel.json` (added in the M3.1/M4 commit 4c56bcc, 17 Jul) scheduled the notifications processor cron every 5 min (`*/5 * * * *`), which the Vercel **Hobby** plan rejects (Hobby caps crons at once-daily) → EVERY web-app deployment failed config validation from 17 Jul on, freezing production at the last good (16 Jul) build. admin-panel has no vercel.json so it was unaffected. Fix: **deleted `web-app/vercel.json`** (the processor cron is a no-op today — push/email dormant), so web-app deploys cleanly again (matches admin-panel). Runbook §4.1 updated: on Hobby use an external cron for the processor; re-add the vercel.json cron only on Vercel Pro. Owner must commit+push the deletion to trigger a fresh (green) web-app deploy.

### Round 30 (2026-07-19): fix admin notification LEAK + rescope admin notifications (owner feedback on the R29 bell)

**Owner feedback:** the admin `/alerts` bell showed irrelevant notifications (student "result ready", parent "olympiad bought") and clicking them 404'd; admins should NOT receive every ecosystem event — only notifications SENT to admins (from the notification center) + relevant types; content managers should be notified when THEIR olympiad package is published; and admin-directed notifications must be private to admins.

**✅ ROUND 30 COMPLETE (2026-07-19). Gates: from-zero rebuild **76/76 PASS** (rolled back; dev intact — migration 076 applied) · admin typecheck+build PASS · web/mobile unaffected. Guide VV. Nothing committed yet.**
- [x] **🔒 PRIVACY FIX — the actual bug (migration 076):** `notif_select` RLS was `recipient = me OR is_admin()`, so an admin session read EVERY notification in the system (the `getAdminInbox` raw select relied on RLS). That leak IS what the owner saw — verified: **zero** admin-addressed operational rows existed on dev; 100% of the bell content was leaked student/parent notifications (also the 404s — they carried web-app deep links). **Tightened `notif_select` to self-only** (`recipient = current_profile_id()`); backported to canonical 010. Admins, like everyone, now read only notifications addressed to them.
- [x] **Removed the R29 auto operational-alerts (migration 076):** dropped the `admin_new_parent`/`admin_new_purchase`/`admin_new_subscription` triggers + functions + `notify_admins` (owner: admins shouldn't be auto-spammed with ecosystem events; purchase/registration counts belong on a future dashboard). Reverted from canonical 011 + 015. Kept the correct R29 producers (personal_best, streak_milestone, subject_expiring, giveaway_ending — student/parent-directed).
- [x] **Admins send to admins (migration 076 + admin UI):** `lb_notify_audience` + `admin_send_notification` whitelist gained `administrators` + `content_managers` audiences (verbatim live defs + minimal edits — no reconstruction); the admin notification composer gains those audience options → an admin sends a notification to all admins / all content managers, delivered privately (recipient-scoped RLS). Backported to canonical 011.
- [x] **Content-manager package-published notification (migration 076):** `trg_notify_package_published` on `olympiad_packages` (→ active) notifies the package's `created_by` with the az title ("«<name>» paketi indi aktivdir"), recipient-scoped + idempotent per package (`pkgpub:<id>`), action_url `/olympiad`. Backported to canonical 015.
- [x] **Admin UI hardening:** explicit `recipient_profile_id = me` filter on the inbox reads (defense-in-depth over the fixed RLS); bell/alerts navigation allowlisted to admin-panel routes only (stray non-admin action_urls no longer 404 — mark-read without navigating); composer staff audiences + labels; `olympiad_package_published` type icon/label; dev cleanup of deprecated admin_new_* rows (0 existed). 013 checks **#74 (rewritten)** + **#76 (new)**.
- **Follow-up (owner idea, noted):** a per-olympiad-package **purchase dashboard** (how many bought each package) instead of purchase notifications — a good analytics feature for a future round; the purchase data (`olympiad_purchases`) is ready.

### Round 31 (2026-07-20): remove admin Daily Tasks · fix parent/student nav width · build the admin Subscriptions section

**Owner queue (investor):** 1) remove the visible Daily Tasks admin section (daily questions are already automatic) WITHOUT touching the automated generation or student-facing daily tasks; 2) parent/student centered nav has too many buttons and scrolls horizontally — fix responsively for AZ/EN/RU; 3) build a production-baseline admin **Subscriptions** section (list/filters/pagination/detail + demo-subscription controls, provider-neutral, ready for a future provider); 4) leave **Payments** completely untouched.

**✅ ROUND 31 COMPLETE (2026-07-20). Gates: from-zero rebuild **77/77 PASS** (rolled back; dev intact) · admin typecheck+build PASS (routes `/subscriptions`, `/subscriptions/[id]`) · web typecheck+build PASS · npm audit **0 in BOTH apps** · mobile untouched. Guide WW1–WW5. Nothing committed yet.**
- [x] **Daily Tasks removed (admin UI only):** it was only a `soon:true` sidebar PLACEHOLDER — no route, no page, no components ever existed, and the legacy `daily_task_*` tables were already dropped back in migration 052. Removed the nav entry + the 3 `nav.dailyTasks` i18n keys. **Untouched (verified):** the daily-rounds engine (`get_or_create_daily_round` / `start_daily_round_attempt`, lazily generated per subject+grade+day), the student-facing daily rounds on web + mobile, and the admin **daily-round readiness grid** on the Questions page (the legitimate admin view of the automated engine). The audit page's `daily_task_packages` entity label was deliberately KEPT so historical audit rows still render.
- [x] **Parent/student nav width fixed:** root cause was `.pnav-links { overflow-x: auto; flex-wrap: nowrap }` + a 1080px `.pnav` cap and NO responsive fallback (no hamburger pattern exists in the app). Fix: (a) the parent nav now uses the SHORT labels `nav.faq`/`nav.contact` ("FAQ"/"Əlaqə") instead of the 23–27-char page titles `help.faqTitle`/`help.contactTitle` (page headings keep the full titles); (b) `.pnav` max-width 1080→**1280px**; (c) `.pnav-links` now **wraps** (`flex-wrap: wrap`, `row-gap`) instead of scrolling sideways. `.pnav` itself stays `nowrap` so the bell/avatar never drop to their own line. Student arena shares the same component → fixed identically. Mobile app untouched (native bottom tab bar; destination parity verified — About/FAQ/Contact reachable via the account sheet for BOTH roles since Round 24).
- [x] **Admin Subscriptions section (NEW, Administrator-only):** built on the canonical `child_subscriptions` model — **no second subscription system**, no schema change. Migration **`2026_07_20_077`** adds ONE centralized, self-auditing lifecycle RPC `admin_manage_child_subscription(p_subscription_id, p_action, p_days)`: in-body `is_admin()` guard, validated transitions only (`activate` incomplete|past_due→active · `cancel` live→canceled keeping access to period end · `expire` →expired revoking access now · `extend` +1..730 days), anything else raises `check_violation`/`invalid_transition`; reconciles `students.access_status` for that child; writes its own `audit_logs` row (`admin.subscription.<action>`, warning severity for cancel/expire); `unique_violation` mapped to `duplicate_live_subscription` (the `uq_child_subscriptions_live` guard). Functional test (rolled back) PASSED: extend/cancel keep access, invalid transition REJECTED, expire downgraded access to `expired`, 3 audit rows written. Backported to canonical 011; 013 check **#77**.
  - UI: `/subscriptions` list (service-role reads, 25/page `.range()` pagination, server-side filters: search child/parent, status, interval, source, date range) + `/subscriptions/[id]` detail (billing block, subjects, sibling-discount rank/percent, trial window, lifecycle buttons) + confirm-gated Activate/Extend/Cancel/Expire showing only the transitions valid for that row's status. Demo/comped clearly badged (`provider 'none'`→**demo**, `'admin_grant'`→**comped**). **Honesty rule:** since NOTHING writes `payments`/`checkout_sessions`/`payment_events` today, the detail view states plainly that there is no provider transaction — it never implies a settled payment. Creation still goes through the existing `admin_grant_child_access` / `create_child_subscription` RPCs (not duplicated). Trilingual `labels.ts` (az/en/ru).
  - Provider-neutral: `provider` / `provider_subscription_id` columns already exist and are surfaced; a real provider can be connected later without replacing this UI.
- [x] **Payments untouched:** the `{ label: "nav.payments", soon: true, adminOnly: true }` placeholder stays byte-identical in `group.comingSoon`; only the `nav.subscriptions` entry moved (into `group.operations` with a real href). No payments code, route, or behavior touched.
- **Dependency note:** `sharp` was pinned via `overrides` (`^0.35.3`) in BOTH apps to clear pre-existing high-severity libvips CVEs without the forbidden `npm audit fix --force` downgrade; `next` stays at the `^15.5.19` floor (lockfiles resolved to 15.5.21, a patch UPGRADE). `npm audit` = 0 in both apps.
- **RLS/security:** no policy change needed — `child_subscriptions` RLS already scopes parents to their own family, admins read all, and there is no client write path; all admin mutations go through the guarded, self-auditing RPC. Students cannot modify subscriptions.
- **Mobile impact:** none required — mobile reads the same canonical `child_subscriptions` statuses; no admin subscription screens added to the consumer app; no payment logic added.

### Round 51 (2026-07-26): olympiad question rotation · full web↔mobile sync pass · Expo/EAS identity (ACTIVE)

**Owner queue:** (1) §15 versioning decision → **self-healing confirmed** (no `package_version`/`question_pool_version`; a rotation-ledger id that left the pool is simply pruned against the live pool on every draw — implemented in 090); (2) `eas init` ran — verify `app.json`, record `ai.olympiq.app` in CLAUDE.md; (3) one last deep web↔mobile 100%-sync check + explain Expo development vs preview; (4) commit message.

**✅ ROUND 51 COMPLETE (2026-07-26). Gates: migrations `090`+`091`+`092` applied to dev (rotation proof **25/25** rolled back · payment-parity proof **5/5** · 092 proof **3/3**) · backports 011/015/013 (checks **#85**, **#86**) · **from-zero rebuild 86/86 PASS** (rolled back; one transient server disconnect retried) · web tsc 0 + vitest 47/47 + build ✓ 39 routes · mobile tsc 0 + jest **183/183** (+31) + lint 0 + i18n 650/650 keys resolve · admin tsc 0 + vitest **45/45** (+14 datetime, +16 per-attempt) + build ✓. Nothing committed.**

**A. Olympiad question rotation (owner spec §1–16; workflow: DB agent authored, main session reviewed/applied):**
- **DB (090):** `questions_per_attempt` is LIVE (bounded 1..500). New `olympiad_question_rotations` — ONE row per (student, package, grade), `NULLS NOT DISTINCT` unique index; the row is both the state and the `FOR UPDATE` lock key, so read-unseen → draw → create attempt → mark consumed is serial per student (two tabs: loser blocks, then RESUMES the winner's attempt). Cycle reset = rewriting `seen_question_ids` (atomic, no junction table); boundary attempts (520/50 → 20+30) never repeat inside one attempt, carried questions count as consumed in the NEW cycle (no question in two consecutive sittings — cycle 2 is correspondingly shorter; flagged to owner). Grade isolation (Round 34) byte-preserved. Self-healing per §15 decision: consumed ids pruned to the live pool every draw. Activation guard (`assert_olympiad_pool_meets_per_attempt` + trigger): a package cannot go active (or raise the count while active) unless EVERY target grade's pool fills one attempt — az message with vowel-harmony ordinals, `hint olympiad_pool_below_per_attempt` + JSON DETAIL for en/ru rendering. **Review fixes on the agent's migration:** (a) PART-B backfill added — existing packages sat on the never-written default 25, so a 50-pool package would have silently started serving 25; backfilled to the largest grade pool (= exact pre-090 behaviour) with the trigger suspended around the repair; dev after: 50-pool packages → 50, 25/0-pool → 25. (b) `v_rot` declared `record`, not the table's composite type — canonical order compiles 011 (functions) before 015 (tables). (c) The trigger DDL moved to canonical **015** (table exists there), functions stay in 011.
- **Admin (workflow agent; reviewed):** required "Sual sayı" after price on create+edit (helper "Şagird hər girişdə bu sayda sual görəcək." + explicit not-the-pool hint); server-side `parsePerAttempt` (digits-only, 1..500) in `parsePackageFields`; activation blocked in `saveOlympiadPackage`/`createOlympiadPackageWithQuestions` (insert-inactive → verify real published counts → flip active; closes a pre-existing hole where create-as-active skipped validation)/`addOlympiadPackageGrade` (a live package can never gain an unservable grade); DB guard errors re-rendered per-locale from hint+DETAIL (`mapPoolGuardError` — the az sentence never leaks into en/ru); shared `OlympiadCycleSummary` (per grade: pool, `ceil(pool/perAttempt)` full-cycle estimate, red shortfall row, per-student note); audit rows carry `questions_per_attempt`; 2 stale strings rewritten, 1 dead key removed; 16 new vitest.
- **Student-facing count (main session):** the pool count STAYS the headline; a new "Hər girişdə sual sayı / Questions per attempt / Вопросов за попытку" row appears ONLY when it is a true subset (per-attempt < pool — equal means the attempt IS the pool). Web: public details modal+page (`buildPublicOlympiadRows`), parent details modal (`OlympiadPurchase`), child playable row ("hər girişdə {n} sual" meta). Mobile: `details.ts` row + catalog enrichment (the RPC predates the column; one RLS read stitches it in). Root CLAUDE.md rules updated (Round-42 olympiad clause superseded; displayed-counts rule gains the per-attempt-row allowance).
- **092 (root fix from the audit):** `start_olympiad_attempt` stamped `is_rated=true` (pre-088 leftover), so both apps' runners showed "Reytinqə təsir edir" on practice runs. Now inserts `false` + backfilled 7 legacy rows; UI additionally gates the badge on kind (belt+braces).

**B. Web↔mobile sync pass (owner: "one last deep check… 100% in sync"). 3 read-only auditors (flows / presentation / config+commerce+security) → findings triaged, fixed by 2 mobile agents + main session on web. Highlights (severity-ordered):**
- **[DB bug in my own 089, caught same-day] 091 payment-mode parity:** `current_payment_mode()` said missing `payments` row = off while `get_mobile_config()`/web said = on (buy buttons that always error); its unguarded `::timestamptz` cast on the SEEDED `'""'` `giveaway.started_at` could poison EVERY paid RPC with `invalid_datetime_format`; no hint for the mappers. Fixed: one semantics (missing = OFF, fail closed — owner launches with payments off anyway), 011-verbatim guarded giveaway parsing, `hint='payments_disabled'` mapped to `gate.paymentsOff` in `olympiadCore`/`subscriptionCore`; web `paymentMode.ts` fallback flipped `real`→`off`; **check #86 asserts the two SQL resolvers agree forever**.
- **[rule violation, both platforms] Olympiads still counted in stats:** student home points/accuracy/rounds/strength queries had no kind filter (`.neq("kind","olympiad")` added web+mobile) and the rated badge lied (092 + kind gates). New `oly5.practiceOnly` line ×3 on both olympiad lists + result screens.
- **[product-rule violation, web] Child saw prices:** the child arena's planned-olympiad modal showed "Qiymət: N AZN" (row deleted — `OlympiadPlannedCard` carries no price fields now); public layout nav/footer offered "Xidmətlər"/register to a signed-in child (filtered via `maySeePurchaseUi`, fail-closed); children now server-redirect off `/services` and `/olympiad-packages*` (mobile already hard-blocked students); landing hero CTAs are session-aware (panel CTA instead of register; olympiad-listing link hidden from children).
- **[security, web] Notification deep links had no route allowlist:** mobile refuses off-list targets, web followed ANY same-origin path — an admin-authored `action_url` could steer a child to pricing. `isAllowedNotificationUrl` (prefix allowlist, pricing/auth routes deliberately absent) now gates `NotificationBell` + `NotificationsPanel`; `safeNext` unified onto the ONE shared predicate (which also gained the missing `@` rejection; mobile port matched).
- **[payments-off UX, both] F4/F5/F7:** web plan-card start/add CTAs, services configurator CTA (`gate.paymentsOff` note), public olympiad CTAs all gate on mode; mobile pricing screen hides all AZN/CTAs when mode=off (fail-closed on config failure); **removals survive payments-off on BOTH platforms** — `ManageSubjects`/`ManageSubjectsEditor` render in removal-only mode (`addsDisabled`) instead of a dead-end notice, honoring the DB's deliberate removals-stay-legal carve-out.
- **[latent i18n break, defused] `pricing2.*`:** mobile's static plan cards use 24 keys web DELETED in Round 49; the next `sync-i18n` (wholesale rewrite) would have rendered raw keys on every card. Moved into `messages.mobile.ts` (overlay wins; runtime unchanged) BEFORE running the sync. Also: ru "минимум {n} ответов" → "не менее {n} ответов" (correct for every n); `nav.back` ×3 added (mobile's BackButton was labelled with the quiz previous-question string).
- **[degradation bug, web] pcfg-seg:** the Round-50 CSS-only `:has()` path left non-`:has()` engines with the pill parked on "Weekly" and NO visual selection. The constraint that forced it (file owned by a concurrent agent) is gone → the interval switcher now renders through the shared `<Segmented>`; all `.pcfg-seg` special cases deleted from globals.css.
- **[dates] Last raw callsites killed:** web+mobile notification detail modals used bare `toLocaleString()` (device locale/tz + the M08 trap) → shared formatter; mobile day-grouping bucketed device-local while titling in Baku → new `bakuDayKey`; mobile `formatLongDate` refactored through `intlFormat`+`tagFor` (outputs test-locked); **admin-panel swept** (10 callsites → hardened `formatBakuDateTime`/`formatBakuDate`, az-Latn-AZ + `/M\d\d/` rejection + manual fallback, 14 new tests). `formatPercent` (both) now uses full BCP-47 tags. Money: parent olympiads page + mobile `fmtMoney` aligned to web `formatAzn` (comma az/ru, dot en).
- **[parity features, mobile] D1/C1–C3/B1–B5:** analytics gains the Fənlər|Olimpiadalar mode + subject chips (`p_scope`/`p_subject_id` wired — the old callless default could include olympiads; deliberate compliance deviation: NO subscribe-CTA locked state in the store binary); ranking gains the notInFilter branch, the web provisional-legend condition, and the full city-rayon district picker; results stop inventing a 25-min limit on untimed attempts; daily runner titles + skips topic flood; usedToday/noRoundYet are info notices, not red errors; recent rows carry kind labels; review/notification chip rows got proper tablist/tab a11y (full Segmented conversion skipped where labels can't fit a 320pt single row — recorded); mobile pricing icons switch on subject.code, not name regex; deeplink allowlist gains `/olympiad-packages` (blockedRoles: student).
- **Round-45/-49 leftovers closed:** web auth pages (login/register/forgot/reset/verify) + child test setup got a shared `BackLink` (history-back with cold-link fallback, token-driven style); mobile `BackBar` renders the shared `BackButton` glyph (iOS chevron / Android arrow — was hardcoded chevron); stale Round-38 comments corrected on both platforms.
- **Accepted differences (deliberate, LOGGED not "fixed"):** web feature flags fail OPEN (public site must not blank on an infra blip; the DB is the enforcement) vs mobile fail CLOSED (boot gate + retry exists) — money gates now fail closed everywhere; mobile config outage = full boot gate vs web silent degrade; parent leaderboard shows one child at a time on mobile (chips pattern); `ArenaChip`/`ChildChips` keep the scrollable-chips pattern (variable-count rows don't fit an equal-width track); analytics `fmtDate` helpers stay local+deterministic on both platforms (byte-equivalent; the tz-converting lib helper would risk hydration/day-shift). **Tech debt logged:** BFF auth register/child-login duplicate the web actions (extract cores later); store-build commerce blockers (§7/F8/F9) remain owner-deferred; `web-app/src/lib/formatDate.ts#formatNumericDate` currently caller-less (kept, documented).

**C. Expo/EAS identity (owner ran `eas init`):** `app.json` verified — `owner: "olimpiadaplatforms-team"` + `extra.eas.projectId` added, biometric permissions materialized, nothing removed; `.expo/` gitignored; `eas.json` already had dev/preview/production profiles. **`ai.olympiq.app` recorded in root CLAUDE.md as permanent** (Play package names can never change) + memory. Claude never runs `eas` account commands (shell resolves to the personal account); the owner deploys all builds.

**Owner decisions surfaced (non-blocking):** 500 ceiling on Sual sayı (one-line change if unwanted); boundary carry-over shortens cycle 2 (alternative: allow a boundary question to reappear next attempt); pool top-ups mid-cycle serve as unseen WITHOUT resetting anyone's cycle; rotation progress ("120/500, cycle 2") is queryable but not surfaced anywhere; no admin "reset student rotation" tool yet. Proof harnesses kept in the session scratchpad (`_proof_090.sql`, `_proof_090_concurrency_live.sql` — the latter is an optional two-terminal live lock demo).

**Round 51 DB close-out (2026-07-26):** migrations **090** (olympiad question rotation), **091** (payment-mode parity + `payments_disabled` hint), **092** (olympiad attempts `is_rated=false` + backfill) applied to dev and backported into canonical `011`/`013`/`015`. Two ordering fixes found only by the rebuild: `v_rot` must be declared `record` (011 compiles before 015 creates the rotation table) and `trg_olympiad_activation_pool_guard` must be armed in **015**, not 011 (the table does not exist yet at 011). **From-zero rebuild = 86/86 PASS, zero errors** (checks #85 rotation + #86 payment-mode parity are new).

**Round 53 (2026-07-28) — "Finish Test clears my answers and needs two taps" (gates: mobile tsc 0 · jest 242/242 · lint 0 · i18n 651/651 · web tsc 0 · vitest 59/59 · build ✓ 39 routes · from-zero rebuild 87/87):**
- **ROOT CAUSE — a stale-cache redirect ping-pong, not a submit failure.** The runner and the result screen share ONE React Query key (`useAttemptRow`), and that query had **no `gcTime` override → the RQ default of 5 minutes**. Sequence: the runner warms the entry with `status:'in_progress'` at open → submit succeeds and the attempt is graded server-side → `router.replace` to the result screen → the result screen reads the **still-cached pre-submit row**, concludes the attempt is live, and bounces straight back to the player → the runner remounts and re-seeds `answers` from `useTestAttempt`, which has `staleTime: Infinity` and so **never refetches** → every selection is gone. The second tap "works" only because `submit_test_attempt` is idempotent: the attempt is already graded, so it early-returns the stored result, and by then the background row refetch has landed `graded`. Verified against dev: deadline nullability makes the bounce fire for **olympiad, practice AND daily** alike, exactly as reported. Note `gcTime: 0` did NOT save us — it schedules a `setTimeout(0)` sweep that `addObserver` cancels when the remount lands in the same scheduler flush.
- **WEB WAS NEVER AFFECTED** — its result page is a server component that re-reads the row from Postgres per request. The mobile port kept the guard and fed it a client cache.
- **Fixes:** the result screen gates every navigating decision on `isFetchedAfterMount` (never acts on a pre-submit copy); `useTestAttempt` gains `refetchOnMount: "always"`; and the working answers moved OUT of component state into a module-level **draft** (`features/tests/draft.ts`, memory-only per master-plan §11, bounded, released on submit/cancel) so a remount is a resume instead of a reset.
- **Three truncation bugs fixed in the same round** (they explain "answers cleared" on >30-question olympiads, independent of the double tap): the client sliced its submit payload to **30** items (`MAX_ANSWERS`) while dev olympiads already carry **50** and Round 51 allows **500**; `flush()` marked **every** dirty id clean while sending only the first 30 (silent permanent loss); and the DB capped both writer RPCs at **100** elements with a silent `exit` and a 200 OK. Both clients now CHUNK (100/call), and **migration 093** raises the DB bound to 1000 in `submit_test_attempt` + `save_test_answers` — patched from their own live definitions, backported to canonical 011, **013 check #87** added. Invariant recorded in the function comments: DB bound (1000) ≥ largest single client payload (500) ≥ per-call chunk (100) — the database must never be the tightest, because its truncation is the only silent one.
- Mobile version **1.1.0 → 1.1.1** (patch: bugfix).

**Round 52 (2026-07-27) — long-text overflow sweep, mobile + web (gates: mobile tsc 0 · jest 204/204 · lint 0 · i18n 651/651 · web tsc 0 · vitest 47/47 · build ✓ 39 routes):**
- **Reported bug (Child → Profile → Məktəb məlumatları):** `ListRow`'s trailing value was hard-clamped `numberOfLines={1}`. Worse than an ellipsis: the title column's `flex: 1` gives it flexBasis 0, and Yoga distributes negative free space by (flexShrink × flexBasis), so the value's shrink weight was its full intrinsic text width and the **label was starved toward zero too** — that is why the row "broke" rather than merely truncating.
- **Fix — `valueWrap` opt-in on `ListRow`** (default OFF): the value moves INTO the title column as a block child, so nothing competes for width, nothing is clamped, and the row grows. Branch rules extracted to pure `components/listRowLayout.ts` (+21 jest tests) so they cannot drift. Verified by the main session: **24 ListRow usages → 5 opted in, 19 on the byte-identical default path**; the only other delta is `gallery.tsx` (dev-only route) whose `"12"` is now also announced. Stacked rows use sans not mono (mono fits ~20% fewer chars) and full-contrast text, because a muted value in the text column would be 3.19:1 — below WCAG AA.
- **WEB: the reported card was ALREADY correct** — `.prof2-row` has stacked to one column at ≤560px since Round 9 and `.prof2-row-value` already carried `overflow-wrap: anywhere`. The real web defects were elsewhere and are fixed: leaderboard + analytics table cells (`overflow-wrap: anywhere` so min-content shrinks and one long school name can no longer widen the whole auto-layout table), numeric columns opted back OUT (`98.75%` must not break), `.plb-kid-body` cards, `.muted` (`break-word`, deliberately not `anywhere`, so no flex/grid track anywhere changes size), and **four `repeat(auto-fill, minmax(280px, 1fr))` grids** that pushed a real horizontal scrollbar at 320px — auto-fill never shrinks a track below its stated minimum, so each floor became `min(280px, 100%)` (no-op at every width ≥ the minimum).
- Adversarial review ran 3 lenses; the regression lens died on an API error and **was re-run manually by the main session** (the ListRow consumer census above). Manual tests **AQ1/AQ2** added.

**Round 51b (2026-07-26) — first `eas build --profile preview` follow-up + app versioning (gates: mobile tsc 0 · jest 183/183 · lint 0 · i18n 651/651 · `npm audit` triaged):**
- **The build "error" was benign:** eas-cli auto-installed `expo-updates` (~29.0.19, SDK-54-aligned), set `updates.url`, and then requires a RE-RUN — nothing failed. Kept the package; **deduped the Android permissions the CLI duplicated** while re-serializing app.json; added `autoIncrement` to the `preview` profile so every internal APK gets a distinct EAS-remote build number (production already had it; `appVersionSource: "remote"` means build numbers are NEVER set locally).
- **Blocker found before it bit:** `mobile-app/.env` is git-ignored (root `*.env`), so EAS build servers never see it — a preview APK would boot with NO Supabase config. The three `EXPO_PUBLIC_*` vars must be created as EAS environment variables for the `preview` (later `production`) environment; `EXPO_PUBLIC_BFF_URL` must be the DEPLOYED web-app URL, not a LAN address (exact commands given to owner).
- **App versioning (new permanent rule in root CLAUDE.md):** `expo.version` bumped **1.0.0 → 1.1.0** (package.json mirrors); every future commit containing mobile changes bumps it (patch=fix, minor=feature); `runtimeVersion: appVersion` consequence documented (a bump = new runtime = OTA updates need a fresh build). New `components/AppVersion.tsx` renders "OlympIQ · Versiya 1.1.0" dynamically (`Constants.expoConfig.version` — never hardcoded; deliberately no `expo-application` build number, which would report Expo Go's own build during owner testing) as the AccountSheet footer; `mob.app.version` ×3 in the mobile overlay.
- **npm audit (was 44):** the postcss override floor raised to `^8.5.23` and `tar` bumped via `npm audit fix` — both cleared. **Remaining 41 "high" are ONE advisory** (`brace-expansion` ≤5.0.7 DoS, GHSA-mh99-v99m-4gvg) in the eslint→minimatch@3 dev chain with NO compatible fix (empirically verified: a global 5.0.8 override reaches audit 0 but breaks minimatch@3's brace expansion — `expand is not a function`; only expo@57 would clear it, and the SDK is pinned to 54). Build-time tooling only, never shipped in the binary — same documented acceptance as web-app/admin-panel's identical chain (Round 49). Re-check when SDK 55+ is owner-approved.

### Round 50 (2026-07-26): clear the deferred review debt · animated segmented controls · active nav (ACTIVE)

**Owner:** "the things you deliberately did not fix — solve them mindfully and logically and optimize professionally to our needs", plus (a) the active nav item must be highlighted, (b) the billing-period switcher must SLIDE, applied across the whole web app and mobile app (iOS + Android).

**Deferred debt from Round 49 — RESOLVED (gates: web tsc 0 · tests 47/47):**
- **🔒 `getChild()` failed OPEN (the important one).** It fired the two role RPCs ONCE and discarded their errors, so a transient hiccup resolved a signed-in CHILD to "not a child" — and since Round 49 that was the sole gate hiding purchase UI on four public surfaces. Root fix: a `RoleResolution = yes | no | unknown` union, with `resolveRole()` (which already retried, and which only the PARENT path used) now serving both roles. The distinction that was missing is that **"the RPCs errored" is not the same as "definitively not this role"** — collapsing them is precisely how a guard fails open. New `maySeePurchaseUi()` returns true only on a definitive `no`, so a child **or an unresolved session** gets no CTA; signed-out guests still do (no session ⇒ definitively not a child). Applied to `/services`, `PublicOlympiadPackages`, the olympiad details page and `/register`. Route guards (`requireParent`/`requireChild`) keep collapsing `unknown` to "no" — there the worst case is a re-login prompt, which is the safe direction.
- **Archived subjects were tickable in the add-child wizard.** Its comment claimed unknown/archived ids were dropped, but `.eq("status","active")` filters the *pricing* row, not the subject — an archived subject with a live price survived, while `/services` correctly dropped it (`lib/pricing.ts` checks `subject.status`). Now selects `subjects(code, name, status)` and filters, so the two catalogs agree; sort aligned to the same `"az"` collation so the hand-off preserves order.
- **`Modal` had no focus trap.** `aria-modal` tells a screen reader the page is inert but does not stop the browser tabbing into it, so a keyboard user could Tab out of an open dialog into the page behind the overlay. Added a Tab/Shift-Tab cycle that re-queries focusable children on every keypress (modal bodies are dynamic — a cached list traps focus on a now-disabled button) and falls back to the panel when nothing is tabbable. Benefits every modal in the app.
- **Configurator dropped keyboard focus on every add/remove.** The clicked button unmounts because the row moves columns, landing focus on `<body>`. Focus now re-homes to the counterpart control (with the list heading as a fallback), and a visually-hidden `role="status"` region announces *which* subject moved — the breakdown's live region only reported numbers.
- **NOT done, deliberately — `.gitattributes` normalization.** The reviewer suggested `* text=auto eol=lf` to stop phantom CRLF diff hunks. Declined for now: the repo has CRLF **committed** across many files with `core.autocrlf=false`, so repo-wide normalization would rewrite nearly every file, produce an enormous diff and shred `git blame`. The cure is currently worse than the symptom — this is an owner decision to schedule deliberately, not a side effect of a UI round.
**Segmented controls + active nav — SHIPPED (web tsc 0 · web tests 47/47 · web build ✓ · mobile tsc 0 · mobile jest 152/152 (+8 new) · expo lint 0):**
- **WEB — one mechanism for both asks.** A single `::before` on the container, painted BEHIND the labels (`z-index` 0 vs 1) with `pointer-events: none`, positioned from four CSS custom properties. Two feeders, same renderer: a new `components/Segmented.tsx` client island MEASURES the active option (`getBoundingClientRect`) so az/en/ru labels of different widths each get a correctly sized pill — a pure `nth-child` split would misplace it; and `.pcfg-seg` (the exact Weekly/Monthly/Yearly switcher the owner reported) is driven by **pure CSS `:has()`** maths with ZERO JS and **zero edits to `PricingConfigurator.tsx`**, which this round's other change owned. **13 controls animated**, listed in the agent report — billing tabs, analytics mode/child/subject, login role tabs, olympiad child chooser, language/theme segments, review filters, notification filters, news sort, leaderboard tabs.
- Details that matter: x AND y are measured so the pill follows an option that wraps to a second line (a line change snaps rather than flying diagonally); `prefers-reduced-motion` disables the travel but still lands it correctly; the entering label's high-contrast colour is `transition-delay`ed so an inverted label is never shown over empty background mid-flight; SSR renders an invisible idle pill so **with JS off nothing changes**; arrow-key roving focus added for real `role="tab"` controls (focus only — activation/tabindex untouched).
- **Active nav:** only the link row was extracted into `PublicNavLinks` (brand, CTA, theme, language, banner, footer stay server-rendered). Prefix matching keeps a section marked on nested routes (`/news/<slug>` → News) with `href === "/"` exact-matched so home is not lit everywhere; `aria-current="page"` + a sliding 2px accent underline, with a CSS `::after` fallback before first measurement.
- **MOBILE — `Segmented.tsx`:** the active chip was the selected cell's own background, so it hopped. Now one absolutely-positioned `Animated.View` slides AND resizes; cells became pure hit targets, so the control's box is pixel-identical and no consumer layout moved. Uses **react-native-reanimated, already a dependency at `~4.1.1`** (verified: `package.json`/lock unchanged, nothing added, SDK 54 untouched) — chosen over the built-in `Animated` because the indicator animates **width**, which is not native-driver-capable; `Animated` would have forced a JS-thread animation or a `scaleX` hack that visibly distorts a 999-radius pill's end caps.
- Platform correctness in one shared style, no `Platform.OS` fork: the track deliberately has **no** `overflow:"hidden"` (it would clip the iOS shadow, and is unnecessary since the indicator is inset and itself fully rounded); on Android the option cells are lifted one elevation above the indicator (derived from the existing `shadow()` helper, not a magic number) because Android paints siblings in elevation order and would otherwise draw the chip OVER the labels — the cells carry no background, so they cast no shadow of their own and iOS ignores `elevation` entirely. First placement snaps (never flies in from x=0); reduced motion honoured via `AccessibilityInfo` + live `reduceMotionChanged` subscription. 8 new jest tests over the pure layout maths (per-option width, first-render null, degenerate measurements, relayout on locale switch).
- Landing hero / footer `/register` CTA gating: still open, tracked below.

### Round 49 (2026-07-26): landing cleanup · public Ətraflı modal · interactive pricing configurator (ACTIVE)

**Owner queue:** (1) public olympiad "Ətraflı" must open a MODAL not a page, and the active-olympiad-packages band must be removed from the LANDING page completely; (2) Play Console package-name review (no code); (3) Expo token/`eas init` guidance (no code); (4) replace the static weekly/monthly/yearly cards on **/services** with an interactive subject-selection + live-price configurator reusing the parent pricing source of truth.

**Spec-conflict resolved (recorded so it is not re-litigated):** item (1) says remove the olympiad band from the landing page; item (4) §8 says "keep the Olympiads section below Services/Pricing". These do NOT conflict — the band renders in three places and only the LANDING copy was removed; `/services` and `/olympiad-packages` keep theirs. Item (1) also supersedes item (4) §9's "Ətraflı opens a details page": the BUTTON opens a modal (matching the parent dashboard, which is what "same UI pattern" means), while the standalone `/olympiad-packages/[code]` route stays for direct links + SEO and is what the card TITLE links to.

**✅ ROUND 49 COMPLETE (2026-07-26). Gates: web tsc 0 · npm test **44/44** (vitest newly configured in web-app) · build ✓ 39 routes · zero `DateTimeFormat` outside `lib/formatDate.ts` · landing has ZERO `PublicOlympiadPackages` refs, `/services` keeps its band · no price literals in the pure pricing module. No DB change. Nothing committed.**

- **(1) Landing + modal:** olympiad band + import removed from `app/(public)/page.tsx` (hero "Olimpiadalara bax" is now the only route in). New `components/PublicOlympiadDetailsButton.tsx` — a small client island that opens the house `Modal` rendering the SAME `OlympiadDetailsRows` body the parent catalog modal and the details page use, so all three surfaces cannot drift. Rows are built server-side and passed in already localized (no i18n/business logic in the island).
- **(4) Pricing configurator (/services):** new pure `lib/pricingConfigurator.ts` (selection + quote maths, dependency-free, testable) + `components/PricingConfigurator.tsx` (client, layout/state/a11y only, zero arithmetic). Prices come from a new `getPublicSubjectPricing()` reading `subjects_pricing` — **the same table the checkout RPCs price from**, so there is one source of truth and no hardcoded prices; a subject not sold for the chosen interval renders "not sold for this period" instead of NaN. Two-column desktop, stacked mobile; loading skeleton + error card; empty state "Qiyməti hesablamaq üçün ən azı bir fənn seçin.". 25 `cfg.*` keys ×3; new `pcfg-*` CSS block.
- **Two constraints imposed on the spec, deliberately** (a public page cannot honestly do what was asked): **(a) the sibling discount is NOT shown** — it depends on how many children a specific parent already has, and a signed-out visitor has none, so any figure would be fiction; `computeQuote` returns `total === subtotal` always (test-asserted across all three intervals) and week/month/year differences are labelled as billing-period list prices, never as a discount. The existing `pricing2.sibling.*` box stays as static explanatory copy. **(b) the authenticated quote RPCs are NOT called** — they require a parent session and a specific child; deriving from `subjects_pricing` satisfies the "reuse the same rules, no hardcoding" intent that the requirement actually protects. `cfg.serverNote` tells the visitor the final amount is computed server-side at checkout.
- **Hand-off:** `buildSelectionHref` → `/register?subjects=<uuid,uuid>&interval=month` (signed out) or `/children/new?...` (parent). The base path is always a server-chosen internal constant — never read from the URL — so it cannot become an open redirect; only ids + interval travel (a test asserts the query never matches `/price|total|amount|discount|AZN/i`). On arrival `parseSelectionParams` drops non-UUIDs, collapses duplicates case-insensitively, drops ids absent from the live catalog (unknown/archived/unpriced), caps at 20 (matching `subscriptionCore`'s server cap) and falls back to `month` on a bad interval. Preselection is **UX-only** — `subscribeChild` still re-validates every id, re-checks ownership and re-prices. **A signed-in CHILD gets `ctaBasePath = null` and no link or button at all.**
- **Test runner:** `web-app` had none. Adopted **vitest** to match `admin-panel` (same version, same convention) rather than introducing a third framework; `environment: "node"`, pure-logic suite only.
- **Dependency note:** `npm audit` in web-app reports 9 pre-existing high advisories in the eslint → minimatch → brace-expansion chain; untouched `admin-panel` reports the identical 9 and the lockfile diff contains zero brace-expansion/minimatch lines. Vitest introduced none.

**🔎 Adversarial review of both concurrent changes (3 lenses: security / collision / correctness) — 9 findings FIXED, gates re-run (tsc 0 · tests 47/47 · build ✓):**
- **[major] False "free" total.** A basket whose subjects are all unsold on the chosen interval summed to 0 and rendered **"0,00 AZN" with an ENABLED Continue button** — it told the visitor the basket was free, and the hand-off then dead-ended because the server quote rejects such a basket. `computeQuote` now returns `allUnpriced`; the UI renders "—" plus an explanation and **disables the CTA**. Regression test added.
- **[major] Breakdown that did not add up.** A mixed priced/unpriced basket showed "2 subjects · 3,00 AZN each · total 3,00 AZN" because `perSubject` came from the priced lines while `count` included the unpriced one. Added `pricedCount`; `perSubject` is suppressed whenever anything is unpriced, and the count row shows `1 / 2`. Regression test added.
- **[major] Duplicated details rows (my own change).** `PublicOlympiadDetailsButton` and the details page each built the same 8-row array by hand while my comment claimed drift was impossible — only the RENDERER was shared. Extracted `buildPublicOlympiadRows()`; both surfaces now call it.
- **[major] Dead see-all path.** Removing the landing band deleted the only caller passing `limit`, leaving `showSeeAll` permanently false plus three comments asserting the opposite. `limit`/`showSeeAll`/the see-all JSX removed; the listing route stays reachable via the hero button.
- **[minor] Child saw a priced basket on /register.** Every other public surface gates on `getChild()`; `/register` resolved no session, so a signed-in child following a shared `?subjects=…` link saw a full priced recap. Now gated — the one place the non-negotiable "children never see purchase UI" rule leaked.
- **[minor] Open-redirect surface hardened.** `buildSelectionHref(basePath: string)` had no validation and a comment claiming it could never be an open redirect (true only by convention at the single call site). Narrowed to `SelectionBasePath = "/register" | "/children/new"` — the compiler now enforces it, and it **immediately caught** a loose `string` prop on the configurator.
- **[minor] Contradictory copy.** `/services` still carried the old "prices shown are samples" line beside exact 2-decimal prices and directly above `cfg.serverNote`. Removed.
- **[minor] Two money formats on one page.** The configurator printed "9,00 AZN" while the olympiad band below printed "25 AZN". `olympiadPublic.priceText` now routes through the shared `formatAzn`.
- **[minor] Tautological test replaced.** `expect(q.total).toBe(q.subtotal)` asserted `total: subtotal` back to itself and could not fail. Replaced with a contract test (independent sum + no `discount`/`discountPercent` field). **[nit] 72 orphaned `pricing2.*` plan-card strings deleted** (including the three `"≈ {price} AZN"` ones the exact-price rule forbids); the still-used `pricing2.title/sub/sibling/popular` keys verified intact. **[nit]** per-card `aria-label` + `aria-haspopup="dialog"` on the modal trigger (a grid of identical "Ətraflı" buttons had one accessible name).
- **Deferred, logged, NOT fixed:** `getChild()` fails OPEN on a transient role-RPC error (pre-existing; `getParent` retries, `getChild` does not — it should fail closed since it now gates three public surfaces); no focus trap in the shared `Modal` and no focus re-homing after add/remove in the configurator; landing hero + footer still show an unconditional `/register` CTA to signed-in users; `children/new` whitelists on `subjects_pricing.status` but not `subjects.status`, so its comment overclaims; public catalog and add-child wizard sort with different collations; duplicate configurator skeletons; two unused `pcfg-*` class hooks; `globals.css` re-serialized to CRLF creating a phantom diff hunk (consider `.gitattributes`).

### Round 48 (2026-07-26): olympiads practice-only · payments kill switch · store blockers · landing + public olympiads (ACTIVE)

**Owner queue:** (1) olympiads freeze-forward **plus** a one-time recompute so no residual advantage remains ("these are demo students, removed before go-live"); (2) harden the payments feature flag safely; (3) document per-platform blockers + answer whether a feature flag over LIVE payments is an Apple problem; (4) landing reorder + public olympiads listing/details; (5) one commit message.

**✅ ROUND 48 COMPLETE (2026-07-26). Gates: migrations `088` + `089` applied to dev · functional **6/6** and **5/5** PASS (rolled back) · backports 011/012/013 (checks **#83**, **#84**, #51 floor 3→2) · from-zero rebuild **84/84 PASS** · web tsc 0 + build ✓ (39 routes + 2 new) · admin tsc 0 + build ✓ + vitest 11/11 · mobile tsc 0 + jest 141/141 + lint 0. Nothing committed.**

- **(1) Olympiads are PRACTICE-ONLY (migration 088).** `award_attempt_points` returns early for `kind='olympiad'` — placed BEFORE the ledger insert, which is what guarantees no points, no percentage/ranking weight, no cached counters, no activity day and no streak, since every one of those writes is downstream of it. Olympiad attempts are still stored, graded and reviewable; they never consume the daily rated slot (that is keyed on `kind='daily'`). **One-time recompute** (owner chose the clean option): deleted the 3 olympiad ledger rows, rebuilt every cached counter on `students` from the remaining ledger, rebuilt `student_activity_days` from non-olympiad graded attempts and recomputed current/best streak via gaps-and-islands. **A recompute was mandatory, not optional:** `lb_rows`' SUBJECT scope aggregates the ledger directly but every other scope reads the `students` cache, so deleting rows alone would have fixed one board and silently corrupted five. `leaderboard.points.olympiad_multiplier` deleted (dead config) + its admin editor and 6 i18n lines removed; 013 #51's `>= 3` floor lowered to `>= 2`.
- **(2) Payments kill switch enforced IN THE DATABASE (migration 089).** New `current_payment_mode()` (same semantics as `get_mobile_config().payment.mode`, so web/mobile/DB can never disagree) + `assert_payments_enabled()` raising `check_violation 'payments: disabled'`, called at the top of `create_child_subscription`, `purchase_olympiad`, `add_subscription_subject`, and `apply_subject_change` (**ADDS only** — a parent must always be able to remove a subject and stop paying). Admin grants and read-only quotes stay allowed. **Nothing was exploitable before this** — all paid RPCs are already revoked from anon+authenticated (verified `EXECUTE=false`) so no client can reach them — but the mode check lived only in TypeScript, i.e. the guarantee depended on every future server action / BFF route remembering it. Now it sits in the layer that cannot be forgotten. Functions patched in place from their own live definitions (regex guard insertion) rather than retyped, avoiding pricing/sibling-discount reconstruction regressions.
- **(3) `docs/STORE_PAYMENTS_COMPLIANCE.md`** gained §7.1 **blockers by platform** (web: ZERO — no store policy applies; Android: 2, both mechanical, then "sound"; iOS: the same 2 + 6 more, with I1 the only *account-termination*-tier item; admin: N/A) and §7.2 answering the owner's question: **the flag is fine, where it lives is the question.** Remote config is routine and 2.3.1(a) is about hidden functionality *in the binary* — a server flag is safe iff the iOS binary contains no purchase path in EITHER state. Also recorded: the iOS risk arrives on the day live payments are switched on, not at launch, even though the app gains no new code. New §9b documents the shipped kill switch.
- **(4) Landing + public olympiads.** Section order now hero → action buttons → feature cards → rating table; buttons reordered **Fənlərə bax → Olimpiadalara bax → Başla**. Routing decision: **reused `/olympiad-packages`** as the public listing (a `(public)/olympiads` route would collide with the existing parent `/olympiads` — route groups do not change the URL), details at `/olympiad-packages/[code]` keyed on the existing unique `code` slug. New shared `OlympiadCover` + `OlympiadDetailsRows` extracted from `OlympiadPurchase` so the public Ətraflı is the SAME component as the parent modal, not a lookalike. Server-side filtering via the anon-callable `get_public_olympiad_packages` RPC (canonical on-sale predicate); extra columns come from a second read restricted to the id whitelist the RPC returned. Question counts use the RPC's published-pool count, never `questions_per_attempt`. 9 new i18n keys ×3. **Child-safety fix found in passing:** the public CTA keyed off bare session presence, so a signed-in CHILD saw "Paketi əldə et" — now role-aware (child → no CTA at all).
- **Fields the spec asked for that do NOT exist in the schema** (omitted per the hide-empty-rows rule, not invented): rules, awards/prizes, organizer, a registration window separate from the sale window. `olympiad_types.name` exists but its RLS is `authenticated`-only, so it is deliberately omitted from public pages to avoid a signed-in/signed-out difference.

### Round 46 (2026-07-26): store payment-policy research + docs · shared date formatter (ACTIVE)

**Owner asks:** (a) "when we integrate payments I want no problem with Play Store / App Store payment policies — we plan to integrate ABB as a 3rd-party provider; check everything and update the documentation professionally"; (b) Manage Subjects still renders "2026 M08 22" — fix, route every subscription date through one shared formatter; (c) scoring/percentage/ranking rules for daily tasks vs purchased olympiads (NOT STARTED — see below).

**(a) Store & payments compliance — NEW `docs/STORE_PAYMENTS_COMPLIANCE.md` (authoritative).** 4-agent sourced research (Apple guidelines, Google Play payments policy, ABB/AzeriCard + Azerbaijani legal layer) + an adversarial reviewer tasked with breaking the proposed architecture. Headline findings:
- **Azerbaijan gets NO anti-steering relief.** The *Epic v. Apple* contempt carve-out is **US-storefront-only** (Apple's own 1 May 2025 note), the DMA is **EEA-only**, and Azerbaijan appears in no Google alternative-billing/User-Choice program. Apple 3.1.1(a) + the Play Payments policy apply in full. Every "you can now link out" headline from 2024–2026 is scoped elsewhere. Google's "rest of world 30 Sep 2027" date lost its contractual basis when Epic/Google jointly withdrew the modification motion on 14–15 July 2026 — not a roadmap milestone.
- **Architecture of record:** purchasing on the WEB only (ABB), mobile purchase-silent, entitlement-reflecting. Google explicitly blesses consumption-only apps; Apple has NO general equivalent (3.1.3(f) is narrow, unpredictable, re-adjudicated every submission — real rejection risk, budget an appeal cycle). Because parent+child share one binary, the **parent tabs must be purchase-free too**.
- **Two traps recorded so they are never repeated:** (1) Guideline **3.1.3(b) Multiplatform Services must never be cited** as the no-IAP justification — its proviso *requires* matching IAP; (2) "only parents buy" grants **zero** relief — 3.1.3(c) names family sales explicitly.
- **🚨 VERIFIED GAP ANALYSIS (compliance doc §7) — the current mobile binary would be rejected today** and one item risks account termination, not rejection. All 8 findings independently confirmed in `mobile-app/src` by the main session: runtime `PaymentMode` flag means the binary always ships `SubscribeFlow`/`DemoPaySheet`/olympiad buy flow with only a server switch hiding them (**Apple 2.3.1(a)**); a full public paywall with live AZN prices + CTA before login (`app/(public)/pricing.tsx`); fake billing data + two fabricated invoices (`subscription.tsx:263-341`); a simulated card `4242 4242 4242 4242` (`DemoPaySheet.tsx:95`); **`RichBody` opens arbitrary admin-supplied `https` URLs with no allowlist on the STUDENT notification screen** (`lib/notifMarkdown.tsx:78-81`) — dynamic steering + an ungated link-out to a minor; `mob.pay.webOnly` naming a destination beside a price; child copy using *almaq* (to buy). **No code changed this round — remediation needs owner decisions (build variants vs investor demos).**
- Docs updated: master plan **§17 superseded** (old text explicitly marked wrong: it permitted demo checkout in store builds and recommended the steering copy), `STORE_LAUNCH_PACK.md` §4 + reviewer note rewritten, root `CLAUDE.md` + `mobile-app/CLAUDE.md` gained non-negotiable rule blocks.
- ABB reality: ePOS/ABBLINK document **no recurring/card-on-file capability publicly**; an "ABB integration" is really the **AzeriCard** gateway (ABB owns it 100%). Largest technical risk = committing to ABB before written confirmation of recurring/COF. Fallbacks with documented recurring: Kapital Bank (`cofProviderRid`), Payriff, Epoint — and note ABB/Payriff share the AzeriCard rail, so a true fallback must come from MilliKart. Plus: CBAR enhanced-authentication (NOT PSD2) must flag the first charge or renewals silently die; e-kassa fiscal receipts required per charge incl. auto-renewals; bill via an AZ-**resident** entity (non-resident → non-creditable withheld VAT, and mandatory local registration from 23 Aug 2026); the 18% VAT "paid educational services" exemption is a ~18% swing needing an advisor ruling.

**(b) Date formatting — FIXED both platforms.** Root cause was NOT a format token: `Intl.DateTimeFormat("az", {month:"long"})` resolves to the CLDR **root** locale on runtimes lacking Azerbaijani data, and root renders a month as the literal pattern `M08` in y-m-d order. Round 42 fixed only 2 web call sites; **5 web sites still passed the bare `"az"` tag**, and — the reason it persisted on device — the 3 remaining mobile sites wrapped Intl in `try/catch`, but **Hermes does not throw**, it silently returns the placeholder, so the catch never fired. New shared `web-app/src/lib/formatDate.ts` mirroring the mobile helper; both export `formatLongDate`/`formatShortDate`(+`formatDayMonth` mobile, `formatNumericDate` web): full BCP-47 tag → detect leaked `/M\d\d/` → fall back to hand-mapped months (ru in genitive), all in Asia/Baku. **Every** date site in both apps now routes through it (`grep DateTimeFormat` returns nothing outside the helpers): web ManageSubjects/both olympiad catalogs/both news views/test page; mobile pricing/news/notification headings. Display-only — no backend value touched.
- Gates: web tsc 0 + build ✓ · mobile tsc 0 · jest **134/134** (+6 new: placeholder fallback, Baku midnight boundary, empty-input per variant) · expo lint 0. Guide **AL1**.

**(c) Scoring/ranking for daily tasks vs olympiads — NOT STARTED.** Blocked on an owner decision: making purchased olympiads award **no** points/percentage/rank reverses shipped behaviour (`leaderboard.points.olympiad_multiplier = 1.5` is live and olympiad attempts feed the ledger), so existing standings change either way — strip historical olympiad points and recompute all boards, or freeze history and apply forward only. The other two parts are largely already shipped in Round 43 (rated-only scoring, DB unique index enforcing one attempt/subject/day, Baku day boundary, "artıq istifadə etmisiniz") → mostly verification.

**Still open from Round 43's investigation:** daily-round diagnosability. Only **1 of 36** subject×grade pairs can generate a round; admin shows "222 published" for informatics while only 198 are round-eligible. Nothing built yet.

### Round 45 (2026-07-25): back-arrow navigation on all secondary screens (ACTIVE)

**Owner prompt:** professional top-left back arrow on all secondary screens/pages, navigating back, native Android/iOS conventions, web-consistent where applicable.

**Audit result:** most of the app already complied — parent/student secondary screens use native Stack headers (platform-correct back chevron/arrow, `headerBackButtonDisplayMode: "minimal"`), public info screens opt into native headers per-screen with a cross-group fallback arrow, and the arena test chain draws its own `BackBar` (runner deliberately exit-confirms instead). The real gaps: Login/Register had NO back affordance, and a cold deep link (push tap / OS link) into a parent/student secondary screen mounted it as the stack ROOT — no back arrow, no tab bar, stranded.

**✅ ROUND 45 COMPLETE (2026-07-25). Gates: NO DB change · mobile tsc 0 · jest 128/128 · expo lint 0 · web tsc 0 + build ✓ · no new i18n keys (reused `arena.quizPrev` / `parent.dash.title`). Nothing committed.**

- **New shared `mobile-app/src/components/BackButton.tsx`:** platform-correct glyph (iOS = HIG chevron, Android = Material arrow — matching what the native headers show elsewhere), 44pt+ hit target, a11y role+label, accent tint with override for header use.
- **Login:** back arrow in the top-left of the header row (LocaleSwitcher stays right) — rendered ONLY when a screen is actually behind (onboarding); after the once-per-install welcome, Login IS the stack root and roots carry no back per platform guidelines.
- **Register:** back arrow always (→ back, or Login when deep-linked as root). The verify-email success screen — previously a DEAD END — now carries the arrow too, going to Login (never back into the submitted form).
- **Deep-link stranding fix:** `unstable_settings = { anchor: "(tabs)" }` on the (parent) and (student) stacks — expo-router now always mounts the tabs beneath a cold-deep-linked secondary screen, so the native back arrow renders and pops to the role home. (Also upgrades the test-setup `goBack` fallback path: `canGoBack` is now true there.)
- **(public) layout:** the inline cross-group fallback arrow replaced with the shared `BackButton` (gains the platform-correct glyph on iOS).
- **Web (consistency where applicable):** `children/[id]/subscribe` was the one child detail page missing the house `wiz-head` ghost link back to the dashboard that its siblings (edit / olympiads / add-child) have — added, reusing `parent.dash.title`. Other web pages keep their existing convention (persistent navbar + established back links: news `← back`, test chain, add-child/edit).
- **Left alone deliberately:** test RUNNER (exit-confirm + `gestureEnabled: false` protects a live attempt — an always-hot back arrow would invite accidental exits), arena `BackBar` styling (in-content affordance, already top-left), tab screens (primary, no back per guidelines), `__DEV__`-only gallery.
- Manual guide: **AK1–AK2**.

### Round 44 (2026-07-25): mobile responsiveness sweep — apply the screen-sizing rules codebase-wide (ACTIVE)

**Owner re-sent the responsive-design guide** (Round-34's rules already live in mobile CLAUDE.md §Screen sizing). This round APPLIES them: audit+fix every violation across mobile-app/src (107 tsx files; recon: 79 numeric width/height hits, 60 flex-row files, 11 absolute positions). Fix targets: fixed-pixel layout containers holding content → flex/%/maxWidth; label+value+action rows missing `flex:1/flexShrink:1/minWidth:0` on the growing cell; long/translated text (az/ru run long) without `numberOfLines`+`ellipsizeMode` or a shrink container; content laid out with absolute positioning (overlays/badges exempt); safe-area gaps. Legit fixed art (icons/avatars/chips/spinners) stays. **`react-native-size-matters` NOT adopted** (standing owner rule: flex + token system is the house standard; guide lists it as an option — flagged in the report). Execution: 4 disjoint area agents + verify/gates (owner's change-list workflow). Web untouched (guide is mobile-focused; web is CSS-responsive).

**✅ ROUND 44 COMPLETE (2026-07-25). Gates: NO DB change · mobile tsc 0 · jest 128/128 · i18n guard 0-missing · expo lint 0 · adversarial diff review = ZERO visual regressions (every hunk additive resilience). 26 files fixed. Nothing committed.**

- **Sweep (4 disjoint area agents + verifier):** 25 files fixed by the sweep + 1 verifier leftover fixed by hand (`ListRow` value cell: RN's default `flexShrink:0` meant its `numberOfLines` never engaged). Fix classes: row-shrink (`flexShrink:1`/`minWidth:0` on label cells next to fixed siblings — pills, section headers, save-state rows, chips), text overflow (`numberOfLines`+`ellipsizeMode` where truncation is OK; `adjustsFontSizeToFit` for NUMBERS that must never truncate — ministat values, demo card number; dates switched to WRAP not truncate), vertical clipping on 320×568 (rules-gate modal, DemoPaySheet, CancelSheet → capped + scrollable bodies, pinned action rows), safe-areas (SelectField full-screen picker was a bare View under the notch), `flexWrap` on fixed chip rows (leaderboard toggles).
- **Explicitly NOT adopted:** `react-native-size-matters` (guide suggestion) — standing owner rule keeps the flex+token house standard; adopting it would rewrite every style for no behavioral gain.
- **Verified exempt:** icon tiles/avatars/chips/spinners/skeletons/dividers/grab-handles, marquee internals, overlay absolutes. BoardList's 34pt rank cell legit (top-50 = ≤2 digits; own big rank renders via the scaling stat).
- **Known minor edge (accepted):** AccountSheet on very short non-notched devices can reach the top edge (scrim ~0) — cosmetic, rare hardware.
- Manual guide: **AJ1–AJ2**.

### Round 43 (2026-07-25): rounds-only leaderboard eligibility + daily "consumed-at-creation" + rules gate + olympiad details/marquee (ACTIVE)

**Owner four-item punch-list.** **(1)** Leaderboard eligibility = ROUNDS ONLY: the Round-36 25-question minimum is removed everywhere; ranked after `min_attempts` (2) completed rounds; question counts stay as secondary stats. **(2)** Sınaq today's cards: remove the "Məşq et" (practice/topic-selection) button entirely — keep only "Başla". **(3)** "Başla" shows an exam-rules + "Qaydaları oxudum və qəbul etdim." gate (NO topic selection), then starts; the daily attempt is consumed AT CREATION (supersedes Round-42 "consumed at submit"): DB unique index → resume in-progress, block completed ("Bu gün üçün sınaq cəhdinizi artıq istifadə etmisiniz. Yeni sınaq sabah aktiv olacaq."), <25 pool errors without consuming. **(4)** Olympiad cards: add "Ətraflı" → responsive details modal (all fields, hide empty rows, az labels); animated right-to-left marquee for the olympiad type when it overflows (pause on hover, respect prefers-reduced-motion); real backend data.

**DB (migration 087, applied + 10/10 functional + rebuild 82/82):** rewrote lb_rows / get_leaderboard / get_my_leaderboard_rank / get_child_leaderboard_position / lb_season_live / leaderboard_month_rollover / get_child_leaderboard_summary → attempts-only provisional, min_questions dropped from every payload; removed the `leaderboard.rank.min_questions` setting; `start_daily_round_attempt` v5 → consumed-at-creation via `uq_rated_daily_live_per_day` (live/graded per subject+day; expired excluded so legacy dupes don't break it), resume in-progress / block completed / raise-before-consume on short pool. Backports 005/011/012/013 (#61 index rename, #81 drops the min_questions requirement).

**Apps:** web + mobile leaderboard messages (rounds-only), Sınaq (remove Practice, add rules gate + blocked message), olympiad details modal + marquee; admin removes the min_questions editor. Olympiad details use existing package fields (registration-deadline / participation-rules columns DON'T exist → not shown, per "hide empty rows"; not adding dead schema).

**✅ ROUND 43 COMPLETE (2026-07-25). Gates: migration `2026_07_25_087` applied · functional **10/10 PASS** (rolled back) · backports 005/011/012/013 (#61 index rename, #81 min-questions requirement dropped) · from-zero rebuild **82/82 PASS** · web tsc 0 + build ✓ · admin tsc 0 + build ✓ + vitest 11/11 · mobile sync 1152×3 + i18n guard 0-missing + tsc 0 + jest **128/128** · repo-wide `min_questions` reads = ZERO. Nothing committed.**

- **Item 1 (rounds-only eligibility):** every leaderboard function drops the question gate (provisional = attempts < min_attempts); `min_questions` gone from all payloads and the setting removed. Web + mobile messages reworded (`lb.provisionalHint` → "…ən azı {n} raund…"; `lb.myRank.provisional` → "{a}/{n} raund"); admin editor removed. Proven: 1 round + 40 questions = provisional, 2 rounds + 6 questions = ranked.
- **Item 2/3 (Sınaq):** "Məşq et" removed from today's cards (web `PracticeGate` deleted; mobile CTA removed); fresh "Başla" opens a rules + "Qaydaları oxudum və qəbul etdim." gate (web `DailyRoundStart`, mobile `DailyRoundRulesGate`) that submits the existing start path — NO topic selection; live → resume; done → dimmed + `test.rounds.usedToday`. Backend: consumed AT CREATION via `uq_rated_daily_live_per_day` (resume in-progress, block completed, DB blocks a 2nd live attempt / races, <25 pool raises without consuming). Proven 6/6 in the daily block.
- **Item 4 (olympiad):** "Ətraflı" details modal on every card (web `OlympiadPurchase` + `OlympiadPlannedCard`; mobile `OlympiadsScreen` + parent tab) showing all available fields with az labels, empty rows hidden, no purchase needed; animated right-to-left type marquee that runs only on overflow, pauses on hover (web) / honors reduce-motion (both), never shifts layout. Real backend data (`olympiad_type` surfaced via `typeName`).
- **Notes:** the topic-setup practice route stays in both apps but is now unlinked from the today cards (kept, not deleted). Registration-deadline / participation-rules columns don't exist in the olympiad model → those detail rows are absent (per "hide empty rows"); adding them is a future DB+admin follow-up. The web agent stalled on a mid-stream API error during its FINAL build step — its work was already complete and independently re-verified (tsc 0, build ✓, 0 min_questions, all components wired).
- Manual guide: **AI1–AI3**.

### Round 42 (2026-07-25): AE2 CORRECTION (untimed daily rounds) + AE4 answer + az date formatting (ACTIVE)

**Owner corrections from manual testing:** (1) **AE2 — daily rounds are UNTIMED** ("There's no time limit and a student can only submit the test once in 24 hours per subject") — this supersedes the 25-min timer + lapse-refresh mechanics from the Round-38 spec; olympiad attempts keep their own timing (untouched). New model: ONE open rated attempt per subject+day, resumed until SUBMITTED; submit remains the only consumption (DB guard unchanged). (2) **AE4 confirmed to the owner:** the peer fallback is grade+subject+date COUNTRY-WIDE (any same-grade student in any city/school) — no change, guide wording clarified. (3) **AH1 — "2026 M08 6" dates:** web passes the bare "az" Intl tag (should be az-Latn-AZ like other pages); mobile's Hermes lacks az month data → ICU fallback "M08" — needs a shared formatter with az/en/ru month-name fallback, applied across subscription surfaces.

**Plan:** migration 086 (`start_daily_round_attempt` v3 — rated attempts get NO deadline; resume ANY open in_progress attempt; legacy timed in-flight attempts get their deadline cleared on resume; fresh draw only when none open) + functional test + backport 011 + rebuild; web (timedBadge values → "no time limit" ×3, card live-detection without deadline, fmtDate az-Latn-AZ, guide AE2/AE4 rewrite, CLAUDE.md model line); mobile agent (Hermes-safe date helper on subscription surfaces, card-state without deadline, badge, jest updates).

**✅ ROUND 42 COMPLETE (2026-07-25). Gates: migration `2026_07_25_086` applied to dev · functional **4/4 PASS** (rolled back) · backport 011 · from-zero rebuild **82/82 PASS** · web tsc 0 + build ✓ · mobile sync 1133×3 + i18n guard 0-missing + tsc 0 + jest **127/127** (+format-date suite, reworked card-state suite). Nothing committed.**

- **(1) Untimed daily rounds (AE2 correction; supersedes the Round-38 timer):** `start_daily_round_attempt` v4 — rated attempts carry NO deadline; ONE open attempt per subject+day RESUMES until submitted (answers kept); legacy timed in-flight attempts shed their deadline on resume; submit stays the only consumption (graded-unique index untouched); olympiad timing untouched. Proven: untimed start ✓ resume-same ✓ legacy-deadline cleared ✓ submit-locks ✓. UI: `timedBadge` values → "vaxt limiti yoxdur" ×3 (+ stale `test.home.sub2` "25 dəqiqə" reworded ×3); web+mobile card `live` = ANY in_progress (Continue); both runners already render the untimed ∞ pill for null deadlines (verified, no code needed). CLAUDE.md model line updated (Round-42 model).
- **(2) AE4 confirmed to owner:** peer fallback = same grade + subject + date, COUNTRY-WIDE (any city/school). No change; guide wording now says so explicitly.
- **(3) "2026 M08 6" dates:** web `ManageSubjects` now uses the full `az-Latn-AZ` tag (bare "az" falls back badly in some engines); mobile got `src/lib/formatDate.ts` — Intl first, and when Hermes's ICU lacks az month data (output matches /M\d\d/ or Intl throws) a manual az/ru/en month-name fallback computed in fixed Asia/Baku. `commerce.fmtDate` AND `fmtBakuDate` (the one the subjects editor actually uses) wrap it — subjects editor, subscription tab, olympiad dates all inherit; the tests-home recent-list formatter routed through it too (same Hermes risk). 6 new jest tests incl. mocked-Hermes fallback and Baku-midnight boundary. Known: real-device proof is the owner's Android check (jest runs on Node's full ICU; the fallback path is what's mock-tested).
- Guide: **AE2 rewritten (untimed), AE4 clarified, AH1 + date-format line**.

### Round 41 (2026-07-25): MANAGE-SUBJECTS SUMMARY REDESIGN (ACTIVE)

**Owner spec:** the mid-cycle subject-change summary (Round 32) reads like a technical status dump — the new total appears in THREE sentences ("Sonra: …", the removal notice, the always-on billing explainer). Target = SaaS-grade structured card: Selected count · Added · Removed · Pay now (single amount) · Next billing (the ONLY place the new rate appears, interval-aware) · Note (price-free removal terms ×3 sentences). Plan: rework web `ManageSubjects` + payment-sheet line + the `subjedit.*` catalog (3 keys retired: thenRate/removalNotice/billingExplainer; noChargeNow goes price-free; +nextBilling/nextBillingLine/noteLabel/noteText ×3), mirror on mobile `ManageSubjectsEditor` (sync-i18n), gates ×2. Behavior/payment flow untouched — display only.

**✅ ROUND 41 COMPLETE (2026-07-25). Gates: NO DB change · web tsc 0 + build ✓ · mobile sync-i18n **1133×3** + i18n guard 0-missing + tsc 0 + jest 121/121. Display-only — quote/apply/payment flows untouched. Nothing committed.**

- **i18n ×3:** retired `subjedit.thenRate` ("Sonra: …"), `subjedit.removalNotice`, `subjedit.billingExplainer` (the three sentences that each repeated the new total); reworded `selectedCount`/`pendingAdd`/`pendingRemove`/`dueNow`; `noChargeNow` now price-free (date only); NEW `nextBilling`, `nextBillingLine` (the ONLY place the new recurring rate appears — interval-aware), `noteLabel`, `noteText` (three price-free removal sentences: active-until date, auto-continue, no refund).
- **Web `ManageSubjects`:** structured card — Selected count → Added (green bullets) → Removed (red bullets) → Pay now (one prominent amount; $0 ⇒ the price-free no-charge line) → Next billing (single sentence) → Note (removals only). Payment sheet's "then" line reuses the same nextBillingLine sentence. New `.subjedit-sum-*` CSS (uppercase muted section labels, soft dividers, token-driven both themes). Always-on billing explainer paragraph removed (superseded by the structured card — supersedes the R32 sentence requirement per this owner spec).
- **Mobile `ManageSubjectsEditor`:** identical card structure with tokens/AppText (320pt-safe flexShrink rows); `DemoPaySheet` gained optional `thenText` (other callers unaffected); zero retired-key references (guard-proven).
- Manual guide: **AH1–AH3**.

### Round 40 (2026-07-25): OLYMPIAD CATALOG BY SELECTED CHILD (ACTIVE)

**Owner spec:** the selected child must be the SINGLE source of truth for the parent olympiad catalog (both apps have a child selector — web segmented buttons in `OlympiadPurchase`, mobile `ChildChips` — but BOTH only scope the Buy button; the list stays the family-grade union from Round 34). Child dashboards are already grade-scoped server-side (unchanged).

**Plan:**
- **DB (migration 085):** `get_my_olympiad_catalog(p_student uuid default null)` — parent + linked child ⇒ rows/counts for THAT child's grade only (link verified server-side; unlinked ⇒ error; grade snapshot of counts = that grade's published pool); parent + null ⇒ family union (back-compat); student callers: self/null only. Old zero-arg signature dropped; 013 #79 updated.
- **Mobile:** `fetchOlympiadCatalog(studentId?)` passes `p_student`; the parent tab's query key gains the selected child id ⇒ automatic refetch on chip switch; server-authoritative scoping.
- **Web:** the page already fetches family-scoped data under RLS (server boundary correct) — the client component now NARROWS by the selected child: items carry their target grade ids + per-grade counts, children carry grade_id; visibility = legacy OR owned-by-selected-child OR targets selected child's grade; counts show the SELECTED child's grade pool; switching children re-renders instantly.
- Owned-by-another-child packages hide under a non-matching selected child (not available for them); owned-by-SELECTED-child packages always show (lifetime access).

**✅ ROUND 40 COMPLETE (2026-07-25). Gates: migration `2026_07_25_085` applied to dev · functional **5/5 PASS** (rolled back) · backports 015 + 013 (#79 → `(uuid)` signature, old zero-arg asserted GONE) · from-zero rebuild **82/82 PASS** · web tsc 0 + build ✓ (39/39 pages) · mobile i18n 0-missing + tsc 0 + jest **121/121** (+4 catalog tests). AF2 guide wording fixed per owner note. Nothing committed.**

- **DB:** `get_my_olympiad_catalog(p_student uuid default null)` — parent + LINKED child ⇒ that child's grade only, `my_question_count` = that grade's pool; link + grade resolved SERVER-side (unlinked id ⇒ `insufficient_privilege`; linked-but-gradeless ⇒ empty feed); parent + null ⇒ Round-34 family union (back-compat); student callers self/null only (foreign id rejected). Proven: Ali(g2)→only g2 pkg count 3; Leyla(g5)→only g5 pkg count 4; union=2; both probes rejected.
- **Web:** server boundary unchanged (page still ships the RLS-scoped FAMILY superset); `OlympiadPurchase` now NARROWS by the selected child — visible = legacy OR owned-by-selected-child OR targets the child's grade; per-card count = `countByGrade[child.gradeId] ?? fallback`; child switch re-renders instantly (no fetch); owned-by-another-child packages hide under a non-matching child; empty → `poly.none`. `PolyChild.gradeId`, `PolyPackage.gradeIds/countByGrade/fallbackCount`, dict `questions` (no new i18n keys).
- **Mobile:** `fetchOlympiadCatalog(locale, studentId?)` passes `p_student`; the parent tab's query key includes the selected child ⇒ ChildChip switch auto-refetches server-scoped rows; query disabled until children load + a selection exists (no family-union flash; childless parent lands on the empty state, not a skeleton); pull-to-refresh follows the scoped query; student surfaces unchanged (`p_student: null`).
- **Accepted edges (documented):** a package owned by the selected child whose grade later changed still shows (lifetime access) with fallback count 0 on web (display-only); per-chip first visit = one RPC, then cached per child.

### Round 39 (2026-07-25): MANDATORY RÜB — DB-level term enforcement + bulk global term selector (ACTIVE)

**Owner activated the last queued spec.** Discovery BEFORE code: most of it already shipped in Rounds 21–27 — the manual form ALWAYS resolves a term (inherited from the topic, or a REQUIRED 1–4 pick that upgrades a legacy topic; `qerr.termRequired` server-side), the bulk RPC requires `meta.term` 1–4 per row, auto-creates topics AND subtopics WITH the term, upgrades legacy topics, and rejects term conflicts; `topics`/`subtopics`/`questions` already carry `term smallint check (1..4)`. Dev data: 74 legacy general-bank NULL-term rows (the "needs term" review queue) + **201 olympiad questions with NULL term BY DESIGN** (Round-21 lesson: never blanket-constrain the olympiad pool).

**Plan:** literal `SET NOT NULL`/`CHECK NOT VALID` would break the 74 legacy rows' status transitions (NOT-VALID checks re-fire on EVERY update) and the olympiad model → enforce with a **trigger guard** (`before insert or update of term`): a general-bank question can never be INSERTED without a term and a term can never be stripped; legacy rows keep working until reviewed; olympiad rows exempt. Plus the spec's index `(subject_id, grade_id, term)` partial on the published general bank (the daily-draw predicate). Bulk modal gains the mandatory global **"Rüb *"** dropdown (1-ci…4-cü rüb) — server action validates it and injects it into EVERY row before validation/RPC (same supersede pattern as Fənn/Sinif), so per-row `meta.term` becomes optional/overridden; help/template texts reworded ×3. Manual form untouched (already compliant). Backports 011/013 (+#82), rebuild, admin gates.

**✅ ROUND 39 COMPLETE (2026-07-25). Gates: migration `2026_07_25_084` applied to dev · functional **6/6 PASS** (rolled back) · backports 011 (merged guard) + 015 (pool index — 015 owns `olympiad_package_id`, run-order) + 013 (**#82**) · from-zero rebuild **82/82 PASS** · admin tsc 0 + build ✓ + vitest 11/11. Web/mobile untouched (authoring is admin-only). Nothing committed.**

- **DB:** the 054 `question_term_guard` is EXTENDED (same fn/trigger — inheritance + topic-mismatch rules preserved verbatim, proven live) with the Round-39 rule: after inheritance, a GENERAL-bank question can never END UP termless (insert blocked; term-strip re-inherits or is rejected). Deliberately NOT a literal `NOT NULL`/`CHECK NOT VALID`: 74 legacy NULL-term rows must keep transitioning through the "needs term" review queue (NOT-VALID checks re-fire on every update) and **201 olympiad pool questions carry NULL term by design** (Round-21 lesson — the pool stays exempt). New `idx_questions_daily_pool (subject_id, grade_id, term) where published+general` = the exact daily-draw predicate.
- **Caught + fixed mid-round:** migration v1 collided with the EXISTING `question_term_guard` name and would have overwritten 054's inheritance/mismatch logic — merged instead; functional test proves inheritance (check 3), mismatch rejection (4), never-null (5), legacy transitions intact (6), olympiad exemption (2).
- **Bulk modal:** mandatory **"Rüb *"** dropdown (1-ci…4-cü rüb) beside Fənn/Sinif; the server action validates 1–4 FIRST and injects it into EVERY row before validation/RPC (supersedes per-row `meta.term`, same contract as subject/grade — per-row term now optional); note text explains the supersede ×3; `bulk.generalMeta` reworded ×3. Olympiad bulk untouched (terms optional there).
- **Already compliant (verified, unchanged):** manual form always resolves a term (topic-inherited read-only or REQUIRED 1–4 pick upgrading the legacy topic; `qerr.termRequired` server-side); the bulk RPC validates term 1–4 per row, auto-creates topics AND subtopics WITH the term, upgrades legacy topics, rejects conflicts; `topics`/`subtopics`/`questions` already carry `term smallint check (1..4)` (spec §3's columns pre-exist since migration 054).
- Manual guide: **AF1–AF3**.

### Round 38 (2026-07-24): TODAY'S/YESTERDAY'S ROUNDS — per-student sets, submit-only consumption, locked practice replays (ACTIVE)

**Owner re-pasted the "Bugünün/Dünənin Raundları" spec — and it RESOLVES the last open ruling: rated daily sets are PER-STUDENT** ("store those exact 25 questions… tied to User A", "fetch a set completed by ANOTHER user", "re-enter → fresh set"). This supersedes the Round-20 "shared by all students" clause; it is now fair because Round 36's percentage ranking normalizes heterogeneous sets. CLAUDE.md rule updated this round.

**Implementation plan (before code):**
- **Model:** rated daily attempt = per-student subtopic-balanced random 25 (the Round-37 draw, extracted as `draw_daily_questions`); attempt stores its own `question_ids` + new `round_date` (Baku); grading = live options (same path as topic tests). The day is consumed ONLY by SUBMIT: new partial unique index on GRADED rated daily attempts per (student, subject, round_date); the old per-round index is dropped. A LIVE in-progress attempt (deadline running) RESUMES — no fresh set on refresh (timer-reset/preview exploit guard); after its 25 min lapse (or abandon), starting again draws a FRESH set and the old attempt never counts.
- **Yesterday:** new `daily_practice_sets` (student, subject, for_date UNIQUE; question_ids; source own|peer|round|generated; RLS read-own, definer-only writes). First open locks the set: own graded attempt's EXACT ordered questions → a peer's graded set (same subject+grade+date, earliest submit) → legacy shared `daily_rounds` row (transition) → system-generated draw. Every "Təkrar həll et" replays the SAME locked set, untimed, `is_rated=false` ⇒ structurally ZERO leaderboard effect.
- **Retired:** `get_or_create_daily_round`, `build_round_snapshot`, `get_my_round_readiness` (the not-ready label is removed by spec; the start action stays the honest gate). `daily_rounds` table kept (history + legacy grading + transition fallback).
- **UI (web+mobile):** today's cards — practice-meta text removed, not-ready pill removed, GRADED card dimmed + "Məşq et" shows alert `test.rounds.doneAlert` ("Bugünkü raundu artıq tamamladınız.") ×3 instead of opening topic setup; only graded consumes the card (expired/abandoned show Start again). Yesterday's cards unchanged visually (backend now serves locked sets).
- **Gates:** migration 083 on dev + functional suite (consumption, resilience/fresh-set, locked replay, peer fallback, rated-vs-practice ledger) → backports 005/010/011/013 (#61/#67 rewrites) → from-zero rebuild → web+mobile builds/tests/i18n.

**✅ ROUND 38 COMPLETE (2026-07-25). Gates: migration `2026_07_24_083` applied to dev · functional **15/15 PASS** (rolled back) · backports 005/010/011/013 (#61+#67 rewritten) · from-zero rebuild **81/81 PASS** · web tsc 0 + build ✓ · mobile sync-i18n 1132×3 + i18n guard 0-missing + tsc 0 + jest **117/117** (+6 card-state tests) · CLAUDE.md Round-20→Round-38 rule updated. Nothing committed.**

Close notes:
- **DB (`2026_07_24_083`):** `test_attempts.round_date` (Baku, backfilled); consumption = partial unique index on GRADED rated daily attempts per (student, subject, date) — the old any-outcome `uq_rated_attempt_per_round` dropped; `draw_daily_questions` (extracted balanced draw, `check_function_bodies` off — 015 column, same trap as the old readiness fn); `start_daily_round_attempt` v2 (today: graded-guard → resume-live → expire-lapsed → FRESH per-student draw; yesterday: locked `daily_practice_sets` own→peer(same grade, earliest submit)→legacy round→generated); `submit_test_attempt` v2 (cross-device race → friendly 'already attempted'; a state-write in the handler would be undone by the raise — savepoint semantics — so none is attempted, the losing attempt just expires); retired `get_or_create_daily_round`/`build_round_snapshot`/`get_my_round_readiness`; `daily_rounds` kept as legacy/history/fallback; RLS read-own on practice sets.
- **Functional proof:** access gate (giveaway off, real subscriptions) ✓ per-student sets differ ✓ live resumes (no timer reset/re-draw — the exploit guard) ✓ lapsed → fresh set, old never counts ✓ real submit → graded 20/25 + Round-36 ledger row at exactly 80% ✓ post-submit start → already ✓ 2nd-device race → friendly error, never graded ✓ yesterday own = EXACT ordered set ✓ unlimited retries on the SAME locked set + ZERO ledger rows ✓ peer fallback ✓ legacy-round fallback ✓ generated fallback locked ✓ empty → no_data_found ✓ structure ✓.
- **Web:** Tests page — practice-meta text off today's cards, not-ready pill + readiness RPC removed (Start is always offered; the action stays the honest gate), GRADED-only card lock, dimmed `.done` palette (score link keeps contrast), `PracticeGate` client component alerts `test.rounds.doneAlert` ("Bugünkü raundu artıq tamamladınız.") ×3 instead of opening topic setup.
- **Mobile:** same states via new pure `dailyCardState` helper (+6 jest tests incl. Baku-midnight boundary); readiness fetch/hook/pill deleted (the RPC no longer exists); `Alert.alert` parity for the done-card practice CTA; today-card meta text removed (yesterday keeps it); no platform forks.
- **Deliberate behavior notes:** a no-grade student now sees Start and gets the trilingual error on tap (web+mobile parity, pre-flight removed by spec); repeated abandon-and-restart lets a student PREVIEW many questions per day — inherent to the owner-specified fresh-set model, mitigated by only the SUBMITTED attempt counting (percentage boards) and the 25-min live-resume rule (no timer reset by refresh).
- Manual guide: **AE1–AE5**.

### Round 37 (2026-07-24): AUTOMATED DAILY-ROUND GENERATION — readiness panel removed, subtopic-balanced draw

**Owner activated the daily-round rework spec.** Discovery resolved the previously-flagged conflict WITHOUT a model change: the engine has been lazy + fully automated since migration 056 (`get_or_create_daily_round` — the FIRST student to start triggers a race-safe random draw; admins never selected or assigned anything; the admin panel only showed a read-only metrics table). Every literal requirement of the spec (automated, initiated-by-student, `ORDER BY RANDOM()`, cumulative rüb, Published-only, no admin prep) is satisfied by the lazy SHARED-snapshot generation — the Round-20 rated model (one immutable shared 25-question snapshot per subject+grade+date, one rated attempt per student, yesterday's untimed replays) is fully preserved. Per-student unique sets were NOT implied by the spec and would have broken replays + shared-fairness + the one-attempt uniqueness key.

**✅ ROUND 37 COMPLETE (2026-07-24). Gates: migration `2026_07_24_082` applied to dev · functional **8/8 PASS** (rolled back) · backports 011 (+readiness fn removed) + 013 (#67 rewritten) · from-zero rebuild **81/81 PASS** · admin typecheck+build+vitest 11/11 ✓ (web/mobile untouched this round). Nothing committed.**

- **DB (`2026_07_24_082`):** `daily_round_readiness()` DROPPED (its only caller was the removed panel); `get_or_create_daily_round` v2 — the draw is now **subtopic-balanced** "where possible": eligible questions rank randomly WITHIN each subtopic bucket (fallback bucket = topic → question), then round-robin across buckets (every subtopic contributes its 1st pick before any 2nd), random inside each pass. Filters unchanged and spec-aligned: subject + student grade (or shared grade-NULL) + published + general bank + cumulative `term <= academic.current_term` (NULL term never served) + 5-option/one-correct. Grade/subject-access/term stay SERVER-derived (never client payload).
- **Functional proof:** 25-question snapshot ✓ filters ✓ equal buckets 5×10 → **5+5+5+5+5** ✓ skewed 30/10 → **15+10** ✓ lazy shared (2nd call = same round) ✓ insufficient-pool `no_data_found` ✓ term shift 2→3 admits term-3, never above ✓ readiness RPC gone / student pre-flight kept ✓.
- **Admin:** the "Günlük raund hazırlığı" panel removed from /questions (JSX + ReadinessRow type + RPC call + ready.* labels ×3 + CSS). The student Tests-page pre-flight (`get_my_round_readiness`) and the `academic.current_term` setting are untouched (they drive the automation).
- **Owner input needed:** the second spec in the same message ("Bugünün/Dünənin Raundları" UI/UX update, web+mobile) arrived with ONLY its objective line — the body was cut off in the paste and is not recoverable from the transcript. Waiting for the full text before implementing.

### Round 36 (2026-07-24): PERCENTAGE LEADERBOARD (#17-spec) — replace points ranking with weighted question-level percentage (ACTIVE)

**Owner activated queued item 1 (full 17.1–17.19 spec).** Discovery DONE before design: engine = `student_points_ledger` (one row per graded RATED attempt, `UNIQUE(attempt_id)` = double-count guard) written ONLY by `award_attempt_points()` (trigger on status→graded), read through ONE row source `lb_rows(board,scope,scope_id,period)` feeding `get_leaderboard`/`get_my_leaderboard_rank`/`get_child_leaderboard_position`/`get_public_leaderboard`/`get_child_leaderboard_summary` + season fns + month rollover. Answer rows are PRE-CREATED for every presented question at attempt start (submit only updates + grades stored rows; unanswered ⇒ `is_correct=false` and stay in the set) — so the presented-question denominator ALREADY exists per attempt. One-attempt-per-day = `uq_rated_attempt_per_round` (DB unique index) — untouched. Expired/abandoned/canceled attempts never reach 'graded' ⇒ never scored (documented; unchanged).

**Implementation plan (before code):**
- **Formula:** per attempt, per presented question q: `w_q = difficulty_weight(q) × kind_weight` (kind_weight = `leaderboard.points.olympiad_multiplier` for olympiad, 1 for daily). Ledger row stores `weighted_num = Σ w_q(correct)`, `weighted_den = Σ w_q(presented)`, `correct/answered/presented counts`, `weights_snapshot` jsonb (17.5). Board value = `100 × Σnum/Σden` over the filtered period (никогда averaging percentages) ⇒ structurally 0–100, coefficients are weights only (17.4).
- **Migration `2026_07_24_081_percentage_leaderboard.sql`:** ledger +7 cols; `students` +pct/count/attempt caches (mirroring the proven points_month/all_time cache pattern, same `points_month_key` rollover); settings `leaderboard.rank.min_questions` (25) + `leaderboard.rank.min_attempts` (2); `award_attempt_points` v2 (points math kept EXACTLY for legacy/rewards — 17.4); `lb_rows` v2 (board 'percent', 'points' kept as deprecated alias; +is_provisional/answered/correct/attempts outputs; subject scope from ledger, others from caches); `get_leaderboard` v2 (competition rank() among NON-provisional; provisional rows follow with rank NULL); rank/position/summary/public/season/rollover/reset fns updated; BACKFILL recalculates every ledger row from stored answers (current difficulty weights + current multiplier — documented intentional 17.15 migration) + rebuilds caches + prints the migration report (inspected/recalculated/no-answer-rows-excluded counts).
- **Apps:** web (child board FAİZ tab/column/own-card, parent board+positions, public top-10, child dashboard quick-look, parent dashboard chip + analytics KPIs), admin (settings section → "Reytinq faizi düsturu": per_correct marked legacy-not-leaderboard, multiplier relabeled bounded weight, +min_questions/min_attempts fields; seasons/reset viewer % labels), mobile (RankingScreen/BoardList, parent leaderboard, arena quick-look, parent home chip, analytics) — trilingual, % formatted to 2 decimals from the UNROUNDED value, provisional badge + explanation everywhere.
- **Tests:** DB functional script on dev (rolled back): scenarios 17.17 A–F + filters + provisional + shared-tie ranks + expired/abandoned exclusion + idempotent double-submit; mobile jest additions; admin loading-state tests already shipped in Round 35 (17.18 last bullet).
- **Gates:** dev-applied migration + functional PASS → backports (002/006/011/012/013) → from-zero rebuild → web/admin/mobile typecheck+build+tests+audit+i18n.

**✅ ROUND 36 COMPLETE (2026-07-24). Gates: migration `2026_07_24_081` applied to dev (backfill **7/7 recalculated, 0 excluded**) · functional suite **36/36 PASS** (rolled back; every 17.17 scenario A–F + weights + ties + provisional + filters + periods + lifecycle + duplicate-guards) · backports 002/006/011/012/013 · from-zero rebuild **81/81 PASS** · web typecheck+build ✓ · admin typecheck+build+vitest 11/11 ✓ · mobile tsc 0 + jest **111/111** (12 suites; +format-percent, +leaderboard-percent) + lint 0 + i18n guard 0-missing (1132×3) · leftover-points sweep across 3 apps = ZERO stale usages. Nothing committed.**

Close notes:
- **Formula (final):** per rated graded attempt, per presented question q: `w_q = difficulty_levels.weight(q) × kind_weight` (kind_weight = olympiad multiplier for olympiad attempts, 1 for daily). Ledger snapshots `weighted_num = Σw_q(correct)`, `weighted_den = Σw_q(presented)`, counts + coefficient snapshot (17.5). Any board/filter/period value = `100 × Σnum/Σden` over matching ledger rows (question-level; NEVER averaged percentages) — structurally 0–100; perfect play = exactly 100 at any coefficient.
- **Engine:** `award_attempt_points` v2 (legacy points math kept EXACTLY — proven: 4×8-correct attempts still = 320 pts); `lb_rows` v2 ('percent' board, 'points' = deprecated alias; +is_provisional/questions/correct/attempts; subject scope from ledger, other scopes from new cached student aggregates rolling on the same `points_month_key`); `get_leaderboard` (competition ranks over the UNROUNDED value — ties share; provisional rows AFTER ranked with rank NULL), my-rank/child-position (+thresholds for the UI explanation), summary (pct primary; points_* deprecated in payload), public top-10 (percent, ranked-only), seasons live/close (percent, ranked-only, `metric:'percent'` marker), month rollover (percent archive + dual cache zeroing), admin reset (pct caches included).
- **Provisional rule:** ranked placement needs `leaderboard.rank.min_questions` (default 25 = one daily round) AND `leaderboard.rank.min_attempts` (default 2) within the period/filter — both admin-editable on /leaderboard (proven configurable in-test: flipping 25→1000 made every student provisional live).
- **Attempt lifecycle (17.11, documented):** answer rows are pre-created per presented question; unanswered ⇒ correctness 0 in the denominator. Only status='graded' rated attempts enter the ledger: in_progress/expired/abandoned/canceled attempts count NOTHING (an expired rated round still consumes the day's one-attempt slot — unchanged Round-20 behavior).
- **Apps:** web (student board FAİZ tab/column + provisional badges/legend/own-card, parent board + positions, public top-10, child dashboard, parent dashboard chip, analytics pct KPIs), admin ("Reytinq faizi düsturu" card: daily-cap editor REMOVED (inert since 057), per_correct marked legacy, "Olimpiada çəkisi" bounded-weight help, +min_questions/min_attempts editors; season standings render %), mobile (ranking screen, parent board, arena quick-look/hero, parent home chip, analytics — new `parse.ts` mappers + `formatPercent`, 2 new jest suites). `formatPercent` = 2 decimals + % with locale separators, everywhere; client never re-sorts or rounds for ranking.
- **Migration report:** 7 ledger rows inspected → 7 recalculated from stored answer rows (0 missing question-level data, 0 missing coefficients — recalc used current difficulty weights + multiplier, the only values that ever existed; documented intentional per 17.15), 2 olympiad + 5 pre-057 practice/test-kind rows, 6 students, 6 caches rebuilt. Nothing destroyed; points history intact.
- **Risks/assumptions (accepted):** seasons frozen BEFORE this round would display point values as % in the admin standings modal — dev has ZERO seasons and prod doesn't exist, so no real record is affected (marker `metric:'percent'` exists on all new closes); `?board=points` URLs silently show the percent board (deliberate alias); admin min-editors require the seeded settings rows (seeded by 081 + 012 — from-zero proven); web parent-board legend omits thresholds when no position payload carries them (never invents numbers); arena ministat "Xal" (attempt-score sum, not the engine metric) intentionally kept.
- Manual guide: **AC1–AC5**.

### Round 35 (2026-07-24): #15 FULL SWEEP — loading states for every async admin button (ACTIVE)

**Owner activated queued item 3 explicitly (one prompt at a time, extra care requested).** The Round-34 "#15 core" shipped only `ActionButton`/`SubmitButton` + CSS + the 3 olympiad flows; this round applies it panel-wide.

**Implementation plan (written before code):**
- Phase 0 (done): 13 generic trilingual pending labels (`pend.saving/creating/updating/deleting/uploading/importing/sending/processing/checking/signingIn/signingOut/downloading/loading`) added to `admin-panel/src/i18n/messages.ts` ×3 locales.
- Phase 1: convert ~55 remaining async surfaces in 8 DISJOINT module groups (questions · taxonomy+locations · news · accounts/users/children · settings/site-content/mobile · stickers/leaderboard/seasons · notifications/subscriptions/pricing/free-access · olympiad-remainder+chrome). Contract: `SubmitButton` inside `<form action>`; `ActionButton type="button" pending={isPending}` for onClick/useTransition flows; per-row `pendingId` scoping (only the acting row spins); modals stay open with close disabled while pending; manual busy state resets in `finally`; existing disabled/confirm logic composed, never replaced; zero behavior changes.
- Phase 2: adversarial audit (leftover raw async buttons, `pend.*` key existence ×3, missing `type="button"`, global tsc) + fix loop.
- Phase 3: FIRST test infra in admin-panel (vitest + Testing Library + jsdom) + the required tests: disabled immediately on submit, spinner shown, rapid clicks → exactly one request, Enter-repeat blocked, re-enabled after failure, no layout shift (ghost label).
- Gates: admin typecheck + build + new tests green + `npm audit` 0.

**✅ ROUND 35 COMPLETE (2026-07-24). Gates: admin typecheck 0 · admin `next build` PASS · NEW admin test suite **11/11 PASS** (first test infra in admin-panel) · npm audit **0 in admin-panel AND web-app** (see below) · i18n: 13 `pend.*` keys ×3 locales. Nothing committed.**

Results:
- **67 buttons converted across 40 admin source files** (63 files changed incl. pages/i18n; +2866/−460). Every async Create/Save/Update/Delete/Upload/Import/Send/Confirm/Sign-out button now uses `ActionButton`/`SubmitButton`: native `disabled` + app-level pending, inline spinner, trilingual pending label, `aria-busy`, ghost-label width lock (no layout shift), re-enable only after settle (manual busy flags reset in `finally`).
- **Scoping:** per-row actions spin only on the acting row (per-form `useFormStatus`, or `busyKey`/`busyId` state: AlertsList, OlympiadQuestionManager, SeasonManager, PriceCell, FreeAccessManager rows). Multi-action forms (NewsLifecycle) stay per-form so scoping is automatic.
- **Destructive/modals:** all `confirm()` guards preserved; modals now stay open + un-dismissable while saving (NewQuestion/EditQuestion/SeasonManager gained `busy` wiring to Modal; BulkUpload/LeaderboardReset/Subscriptions already had it). SettingToggle's dangerous-toggle confirm row now stays open with the spinner until the save settles (was: closed instantly).
- **Adversarial audit loop found + fixed 3 real misses** (2 rounds): AlertsList's 3 raw async buttons (file missed by the group partition), a NewsForm stuck-busy on rejected cover upload (new catch+finally + error string ×3), NotificationBell's mark-all-read. Final audit: 0 violations; all ~100 remaining raw `<button>`s classified as legit (openers/cancels/tabs/GET filters/switch-pattern); zero missing `type="button"`; `pend.*` keys verified ×3.
- **Deliberate visible changes:** locations delete modal label is now "Deleting…" (was "Saving…"); link-styled delete buttons show the inline spinner.
- **NEW test infra (first in admin-panel):** vitest 4.1.10 + @testing-library/react 16.3.2 + jsdom 29.1.1 + user-event 14.6.1 + jest-dom 7.0.0 (`npm test` script; `vitest.config.ts`/`vitest.setup.ts`; test files pass BOTH `tsc --noEmit` and `next build`). 11 tests against the REAL React-19 `<form action>`: disabled+aria-busy immediately · spinner + pendingLabel + aria-hidden ghost · 3 rapid clicks → exactly 1 action call · Enter-repeat blocked while pending · re-enabled after rejection AND success · `disabled` prop wins regardless of pending.
- **Security side-find:** `npm audit` surfaced 2 HIGH postcss vulns (≤8.5.17, GHSA-r28c-9q8g-f849 via next) in BOTH apps — fixed in both by bumping the existing `postcss` override `^8.5.10`→`^8.5.18` (admin installed 8.5.23); Next stays `^15.5.19`, no `--force` downgrade. Both audits now 0. (Mobile unaffected — no postcss.)
- Manual guide: **AB1–AB4**.

### Round 34 (2026-07-23): multi-grade olympiad packages + type-in-flow + grade-scoped visibility, and three proven bug fixes

**Owner asked (items 1–14):** merge Olympiad Types into the package flow (mandatory type + "Other" inline creation, sidebar module removed); one package targets MULTIPLE grades with a SEPARATE question pool per grade; per-grade JSON upload with per-grade validation status; creation blocked while any selected grade lacks a valid pool; students see/receive ONLY their grade's packages/questions; parents see only packages matching their children's grades (deduped, empty-state for childless); safe migration preserving every existing type/package/purchase. Mid-turn additions shipped in the same round: **#15 core** (shared `ActionButton`/`SubmitButton` loading component + applied across the olympiad flow), **#16 root cause** (news images invisible to logged-out visitors), **#17 web root cause** (news-notification "phantom logout"), the **"Əldə et"** CTA rename ×3 locales, and the **iOS contact-map** fix.

**✅ ROUND 34 CORE COMPLETE (2026-07-23). Gates: migrations 079+080 applied to dev · functional test **30/30** (rolled back) · backports 007-era canonical files 015/011/010/013 · from-zero rebuild **80/80 PASS** · web typecheck+build ✓ · admin typecheck+build ✓ (olympiad pages in manifest) · mobile tsc 0 + jest 100/100 + lint 0 · npm audit 0 ×3 · i18n synced 1123×3 + 0 missing keys. Nothing committed.**

- [x] **DB (migration `2026_07_23_079`)**: `olympiad_package_grades` join (backfilled from the legacy single `grade_id` AND from pool-question grades; legacy column trigger-synced: single grade → populated, multi → NULL so old readers never show a WRONG grade); pool-question grade guard trigger; **`olympiad_purchases.grade_id` entitlement SNAPSHOT** (yearly auto-promotion never re-points a lifetime purchase at another grade's pool); `purchase_olympiad` validates + snapshots (hint `package_not_for_grade`); `start_olympiad_attempt` draws ONLY the entitled grade's pool (snapshot → current grade → single-target fallback → error); `bulk_insert_olympiad_package_questions(+p_grade_id)` per-grade CREATION-ONLY; `get_olympiad_pool_counts(+p_grade_id)`; `get_public_olympiad_packages` + `grade_levels int[]`; **`get_my_olympiad_catalog()`** (role-aware, SECURITY DEFINER: student → own grade, parent → children's grades ∪, childless → empty; per-grade counts + caller-relevant `my_question_count`); **`remove_olympiad_package_grade()`** (blocked while purchases entitle the grade / last grade; pool ARCHIVED never deleted). Old RPC signatures dropped (no ambiguity), 013 checks #79+#67 updated. Functional proof incl.: per-grade isolation, wrong-grade purchase rejection, attempt containing ZERO foreign-grade questions, parent dedupe, childless-parent empty feed, removal guards, guard trigger.
- [x] **Admin**: Olympiad Types OUT of the sidebar (records + deep-link route intact); create form = mandatory type select with **"Other"** (case-insensitive dedupe, inline insert) + grade CHECKBOXES + one upload slot PER selected grade with live per-grade status chips (ready n / invalid n / missing) — creation is ALL-OR-NOTHING server-side (any bad grade file → nothing created); edit page = metadata form (type editable) + **Grades & Pools manager** (add-grade REQUIRES its question file in the same action; remove via the guarded RPC with friendly hint mapping) + question manager grade column/filter + per-question grade select; activation gate (status→active requires every grade pool non-empty). All through the new loading buttons.
- [x] **Web**: student catalog grade-filtered server-side + per-grade counts (planned = own grade, owned = purchase snapshot); parent catalog + per-child page filtered by children's grades (owned packages always stay visible); `poly.err.notForGrade`/`oly5.errNotForGrade` hint mappings ×3; landing/services cards render multi-grade range chips (`formatGradeRangeLabel`, e.g. "4–6-cı siniflər").
- [x] **Mobile**: `fetchOlympiadCatalog` switched to `get_my_olympiad_catalog` (grade filtering is now SERVER-enforced for both roles); cards/detail render grade ranges; counts show the caller-relevant `my_question_count`; start-attempt hint mapping.
- [x] **#16 news images (migration `2026_07_23_080`, root cause PROVEN)**: `media_assets` had NO anon select policy — the public site's cover join returned NULL for logged-out visitors (admins/signed-in users saw images, hence "publish worked"). Anon-scoped policy strictly `visibility='public'`; live anon probe now resolves covers; 013 check **#80**. (The WebP conversion/variant pipeline from the same request is scoped to the backlog — see below.)
- [x] **#17 notification "logout" (root cause PROVEN)**: no signOut ever fired — the PUBLIC layout was session-blind (always Login/Register), so a student following a news notification onto `/news/<slug>` read the marketing chrome as "logged out". Fixes: public header is now session-aware (`nav.myPanel` → `/child` or `/dashboard`); public news list+article REDIRECT child sessions to the in-app `/child/news[...]` (repairs every already-stored notification action_url); mobile was already correct (deeplink maps `/news/<slug>` per role in-app).
- [x] **#15 core**: `admin-panel/src/components/ActionButton.tsx` (+`SubmitButton` via useFormStatus): native `disabled` + `aria-busy` + inline spinner + pending label + ghost-label width lock (no layout shift); applied to the olympiad create/edit/grades flows. **Full panel-wide sweep = backlog.**
- [x] **"Əldə et"** (batch-5): `poly.buy`/`poly.buyNow` → Əldə et / Get / Получить (web + synced to both mobile platforms).
- [x] **iOS contact map** (batch-5): Google's embed refuses to be a WKWebView TOP-LEVEL document ("must be used in iframe") — now served through a local `<iframe>` wrapper page (both platforms; lockdown unchanged: top frame local, sub-frame = the embed, external navigation still gated).
- [x] Mobile **CLAUDE.md**: permanent screen-sizing/responsiveness rules (no hardcoded layout sizes, flexShrink text, safe areas, 320pt-first testing).
- **Batch-5 "mobile purchase Server Connection Error"**: not a purchase bug — it is the BFF-unreachable condition fixed in Round 33 (tunnel/localhost) + the deployed-Vercel path proven end-to-end; the fix for testers is `EXPO_PUBLIC_BFF_URL=https://olimpiada-portal-5zga.vercel.app` + Expo restart. Round-33 error classification now says "network" instead of a fake server error.
- **Batch-5 "back arrows"**: already shipped in Round 33 (#2b `headerBackButtonDisplayMode: "minimal"` on all three mobile stacks; iOS-only visual difference).
- [x] **Cross-app synchronization audit (owner request, 2026-07-23):** swept every Round-32→34 fix for web↔mobile parity. Found + fixed TWO desyncs from this round: (a) the mobile public services band ignored `grade_levels` — multi-grade packages showed NO grade chip while web showed the range chip (mobile `pricing.tsx` + `PublicOlympiadPackage` type now mirror web); (b) the web parent catalog showed the TOTAL pool count while mobile showed the family-relevant count — web now sums the children-matching grade pools (my_question_count parity; legacy packages keep the whole-pool number). Verified in-sync everywhere else: endingIds chips (R32), phone editor + BFF (R33), likes, ±notForGrade/Əldə et keys through sync-i18n (1123×3), start/purchase hint mappings, iOS/Android map wrapper, deeplink news routing, and the ONE shared dev DB carrying 079+080 (probed live). Legacy `bulkImportOlympiadQuestions` confirmed UI-unreachable (BulkUploadModal only mounts for the general bank). Re-gated after the fixes: mobile tsc 0 + jest 100/100 + i18n 0-missing · web typecheck+build ✓.

### QUEUED NEXT ROUNDS (owner requests received 2026-07-23, deliberately NOT rushed into this round)

Each of these is a full round with DB + engine + UI ×3 apps; several conflict with shipped owner-approved models and need explicit rulings first:

1. **Percentage leaderboard (#17-spec)**: replace points ranking with weighted question-level percentage (0–100%, snapshots, provisional threshold, ties, migration + report). Touches the rated engine + every leaderboard surface ×3 apps + admin score settings. *Ruling needed:* none — spec is self-contained; biggest single round.
2. **News image WebP pipeline (#16.3–16.13 tail)**: server-side WebP conversion/resize/variants + transactional replace/cleanup + tests. Needs `sharp` in admin-panel + rework of the browser-direct-upload flow. The DISPLAY bug is already fixed this round.
3. **#15 full sweep**: apply `ActionButton`/`SubmitButton` to every remaining async admin surface (news, questions, taxonomy, accounts, settings, stickers…). → **ACTIVATED as Round 35 (2026-07-24).**
4. **Daily-round generation rework**: → **RESOLVED as Round 37 (2026-07-24)** — the conflict dissolved: lazy shared-snapshot generation already satisfies the spec verbatim; panel removed, draw made subtopic-balanced. No model change.
5. **Yesterday's-rounds locked sets + completed-state UI ("Bugünün/Dünənin Raundları" spec)**: → **WAITING on the owner re-pasting the spec body** (the second spec in the Round-37 message arrived with only its objective line; body unrecoverable from the transcript).
6. **Mandatory term (Rüb) enforcement**: *conflicts with the shipped NULL-term = "needs review" model* (blanket `NOT NULL` would break legacy rows + the review workflow). Needs owner ruling: enforce at AUTHORING time only (new/edited questions + bulk global term selector — feasible) vs hard DB constraint (needs legacy backfill plan). Note: topics already carry `term`; the request's `term_number` columns map onto the existing `term` model.

### Round 33 (2026-07-22): investor punch-list — 9 requirements (mobile-heavy) + one platform-wide BFF bug

**Investor asked** (mobile #1–#8, both platforms #9): onboarding/auth language switcher; remove Notification-Settings + Subjects from the mobile parent profile and strip back-button titles; About redesign; the raw `poly.buyFor` key; news like button synced with web; a working Contact map; **critical: cannot remove avatars / edit child / add child / save any form**; pull-to-refresh + "updated" feedback; and a parent phone add/edit module on **both** web and mobile.

**✅ ROUND 33 COMPLETE (2026-07-22). Gates: NO DB migration (every requirement resolved to existing routes/RPCs/RLS) · web typecheck+build PASS (new `/api/mobile/v1/profile/phone` in the manifest) · admin typecheck+build PASS · mobile tsc 0 + jest **91/91** (was 70; +api classifier, +news-likes) + lint 0 + i18n guard 0-missing + audit 0 ×3 apps. Nothing committed yet.**

- [x] **#7 ROOT CAUSE — the whole authenticated mobile BFF was 401ing (found + fixed + proven).** `web-app/src/lib/auth/mobileBearer.ts` resolved the caller's role with an AMBIGUOUS PostgREST embed — `profiles → profile_roles!inner(...)` — but `profile_roles` has TWO FKs to `profiles` (`profile_id`, `assigned_by`), so PostgREST answered HTTP 300 `PGRST201` and the resolver read that as "not a parent" → **401 on every authenticated write** (add/edit child, avatar set/remove, subscribe, subject change, purchase, cancel, delete). Reads worked because they hit Supabase directly — exactly the owner's symptom set. Fixed with the disambiguating hint `profile_roles!profile_id!inner(...)` (same spelling the admin panel already uses, `accounts/page.tsx`) + a server-side query-fault log so it can never silently masquerade as auth again. **Proven end-to-end against dev** by provisioning a throwaway parent and driving the real routes: every op 401→200, unauth stays 401, probe data cleaned up. This is the same two-FK trap STATUS records the Users list hitting once before.
- [x] **#7 remaining half — error classification.** `bffPost`/`bffAuthedPost`/avatar posts used to collapse transport/timeout/401/404/5xx/validation into ONE generic key (why four root causes looked identical). Now classified (`classifyBffResponse`/`classifyBffThrow`, unit-tested): transport→`mob.err.network`, 5xx/non-JSON→`mob.err.serverUnavailable`, 401→session key, else the server's own i18n key; a `__DEV__`-only log reports the resolved BFF origin + failure class; production UI still shows ONLY i18n keys.
- [x] **#1 language switcher** — new `LocaleSwitcher` compact chip (globe + code + caret → bottom-sheet), on `welcome`/`login`/`register`, offering only `get_mobile_config().locales.supported` (RootGate clamps to that set); `setLocale` re-renders instantly, persists to SecureStore. Auth screens now keep the i18n KEY in error state so a visible error follows a live language switch.
- [x] **#2 profile + nav** — removed the mobile Notification-Settings card and the Subjects row (both roles; `/subjects` route + deeplink kept, tests green); dead `PrefRow`/prefs plumbing removed (mobile prefs RPCs stay in DB, WEB keeps its settings — dead `fetchPrefs`/`savePrefs` exports removed from `useNotifications.ts`). Back-button titles stripped app-wide via `headerBackButtonDisplayMode: "minimal"` in each group's Stack `screenOptions` (verified supported by the pinned native-stack 7.17; iOS-only effect, Android already bare).
- [x] **#3 About redesign** — desktop's vector-illustration language ported as `react-native-svg` COMPONENTS (no binary assets, SVG-asset ban respected), scaled-down typography via additive AppText variant + token lineHeight scale, read-more expander (`mob.about.more/less`) to cut scroll; light+dark, CMS copy preserved.
- [x] **#4 poly.buyFor** — new `poly.buyNow` (Satın al / Buy now / Купить), `{name}` dropped at both sites; PLUS a regression guard (`scripts/check-i18n-keys.mjs` + jest assertion) that fails on ANY mobile `t()` key missing from both catalogs. Main-session sweep confirmed `poly.buyFor` was the ONLY missing key.
- [x] **#5 news likes** — `NewsLikeButton` (filled/outline heart) on list cards AND article detail, all three role groups; direct own-JWT `news_likes` insert/delete (grants+RLS already exist, no BFF, `like_count` trigger-owned); optimistic with rollback, counter moves ONLY in the press handler (never on render — web view-beacon discipline), double-tap guarded, list+detail caches kept consistent; signed-out sees a static count chip (web parity).
- [x] **#6 contact map** — `react-native-webview` (installed at the SDK-54 pin; Expo-Go-safe, keyless) rendering the SAME `google.com/maps?...&output=embed` URL the web iframe uses (identical pin), locked down (top-frame nav gated to the maps origin, file access off, encodeURIComponent'd admin value), tap → native directions, failure → `mob.contact.mapUnavailable` with the tap-out fallback still working; dark-theme framed. Also gave the email/phone/WhatsApp/social rows a visible `mob.link.openFailed` message instead of silently no-oping.
- [x] **#8 pull-to-refresh + feedback** — one `usePullRefresh` hook (deliberately NOT react-query's `isRefetching`, which never fires for a never-resolved/`enabled:false` query and clears early on multi-query screens; it awaits EVERY source and treats a resolved-but-`isError` result as failure) + a `Toast` host mounted once in the root layout (top, safe-area, a11y-announced, auto-dismiss), wired across ~33 screens with `mob.refreshed`/`mob.refresh.failed`.
- [x] **#9 parent phone (web + mobile, shared core)** — `phoneCore.updateOwnPhoneCore` (self-row `profiles_update` RLS, no service role, registration E.164 rule REUSED from `parentValidation`, audit `parent.phone_update`, cannot clear to null); web editor section on the parent profile (PhoneField seeded from the existing number via new `initialE164` + `splitE164` longest-dial-prefix split); mobile `PhoneSection` (PasswordSection-shaped) → new BFF `POST /api/mobile/v1/profile/phone` (rate-limited per profile). **Route proven end-to-end on dev**: 401 unauth · 200 add · 200 change (separators normalized) · 400 empty/junk/overlong · stored value matches. Admin audit viewer mapped `parent.phone_update` → `audit.action.parent_phone_update` (×3).
- **NO migration, NO schema/RLS change** anywhere this round. One new dependency: `react-native-webview` (SDK-54-pinned, `npx expo install`, audit 0).
- **Owner-side follow-ups surfaced this round:** (a) Supabase is rejecting new signups with `over_email_send_rate_limit` and "Confirm email" is ON — new parents get `verify_email` instead of a session, contradicting the "log in straight after registering" rule; turn Confirm-email OFF until Brevo/SMTP lands. (b) The Contact map's "exact location" needs the admin to set `contact.support_map_query` to real coordinates (empty today = a text search for the street address). (c) `#2(b)` is only visible on iOS (Android back buttons are already title-less).

### Round 32 (2026-07-20): mid-cycle subject-change billing — prorate on ADD, remove at RENEWAL

**Owner asked:** a parent on a paid plan adds a subject days later — how is the price calculated? I investigated our code + industry practice (Stripe/Recurly/Chargebee/Lago) and recommended the standard model; owner approved it and asked for full implementation across demo payments + a real-provider baseline with TODOs, including removal logic and a short explanatory sentence ×3 on the relevant screens.

**Problem found:** `add_subscription_subject` overwrote the amounts with the FULL period price of the new bundle, changed no dates and created no charge — while the UI showed that recurring rate *inside a payment dialog*. With a real provider that path would bill a whole month for a few remaining days, or grant access free.

**✅ ROUND 32 COMPLETE (2026-07-20). Gates: from-zero rebuild **78/78 PASS** (rolled back; dev intact) · web typecheck+build PASS (new BFF route) · mobile tsc 0 + jest 70/70 + lint + export PASS · admin typecheck PASS · npm audit 0 ×3 · i18n synced 1115×3. Guide XX1–XX6. Nothing committed yet.**
- [x] **Model (owner-approved, industry standard):** **ADD** → immediate access + a **prorated top-up** for the days left (`price × remaining ÷ period`, discounted at the sibling rate in force); **REMOVE** → **never refunds**, access kept until the period end, recurring rate drops at the **next renewal**. **One shared renewal date per child** (never per subject). No proration while `trialing`, none on `week` intervals, amounts < 0.50 AZN waived to 0.
- [x] **DB (migration `2026_07_20_078`):** `subscription_subjects.remove_at` (scheduled removal; INVARIANT = the period end) + immutable **`subscription_changes` ledger** (prorated_amount, recurring_before/after, discount %, remaining_ratio, idempotency_key, empty `provider`/`provider_payment_id` awaiting a PSP) with self-scoped RLS and a replay-guard unique index. Two RPCs, service-role only: **`quote_subject_change()`** — the SINGLE source of the math — and **`apply_subject_change()`** which *calls it*, so a preview can never drift from what is applied (the audit-H7 lesson). Amounts are never accepted from a client. Backported to canonical 007/010/011; 013 check **#78**.
- [x] **Functional proof (rolled back on dev):** 9 AZN subject added on day 10 of 30 → quote `due_now = 6.00`, recurring 27 → 36, access immediate, ledger row 6.00; **replay with the same idempotency key returned `idempotent` without double-charging**; removal scheduled with `remove_at` exactly = `current_period_end`, recurring dropped to 27, **zero refund rows**; removing ALL subjects correctly blocked.
- [x] **Web:** `updateSubscriptionSubjectsCore` now makes ONE atomic `apply_subject_change` call (replacing the per-subject add/remove loop) with a deterministic idempotency key (subscription + sorted diff + 5-min bucket) so a double-submit cannot double-charge; new `quoteSubjectChangeCore`/`quoteSubjectChange`; `ManageSubjects` shows **two numbers** ("Due now" + "Then <rate> from <date>"), a no-charge sentence for trial/weekly/waived, and a removal notice; the demo payment sheet now shows the **due-now** amount, not the recurring rate; removal-only diffs never open it. New BFF `POST /api/mobile/v1/children/[id]/subjects/quote`; the existing apply route inherits the new core unchanged.
- [x] **Scheduled-removal UX (caught in review):** the subscribe page listed ALL `subscription_subjects` rows, so a scheduled removal still rendered as active — making a completed removal look failed and blocking re-ticking. Fixed: `coveredIds` now excludes `remove_at` rows and a new `endingIds` prop renders an "ends at period end" chip; re-ticking cancels the removal (`apply_subject_change` clears `remove_at`).
- [x] **Mobile:** `bffQuoteSubjectChange` + the same two-number preview, removal notice and no-charge case; demo pay sheet shows due-now and its confirm button reads "Confirm" when nothing is charged; reused the SYNCED web keys (no mobile-only duplicates).
- [x] **Explanatory sentence ×3** (`subjedit.billingExplainer`) on both web and mobile manage-subjects screens, natural az/en/ru (not literal translation).
- [x] **Real-provider baseline:** `TODO(real-provider)` markers at the exact capture point in `apply_subject_change` and on the renewal requirement, plus a full integration checklist in `docs/PRODUCT_COMPLETION_BACKLOG.md` §A — capture `due_now` inside the transaction, write `provider`/`provider_payment_id` back onto the ledger + a `payments` row, build the renewal job (**must DELETE `remove_at`-passed rows BEFORE invoicing**), and then add `(remove_at is null or remove_at > now())` to the attempt-RPC subject joins (redundant today only because the subscription expires at the same instant).
- **Superseded (kept, unused):** `add_subscription_subject` / `remove_subscription_subject` — no app caller remains (only an explanatory comment). Left in place rather than dropped destructively.
- **Nothing is charged today** — no payment provider exists; amounts are computed and recorded on the ledger only.

**Round 32 follow-up (2026-07-22) — owner review of the shipped round. Gates: admin typecheck+build PASS (28 pages) · mobile tsc 0 + jest 70/70 + lint PASS. Nothing committed yet.**
- [x] **Admin `/subscriptions` list layout (owner screenshot):** the row has three nowrap timestamp columns plus three pills, so auto-layout paid for them by crushing the wrappable columns — child names broke across two lines, the subject list stacked one word per row, and the tail of the table still fell off the card at the shared 1120px cap. Fixed the way `/locations` and `/questions` already were: `.subscriptions-page` joins the widened `:has()` rule (1560px) and the table gets a `min-width` (so `.table-wrap` scrolls on narrow windows instead of squeezing) plus width floors on the child / parent / subjects cells. No data or query change.
- [x] **Mobile scheduled-removal parity (gap found while answering "is mobile synced?"):** mobile HAD the full Round-32 quote/two-number/removal-notice/explainer work, but not the `endingIds` fix that web got in review — `fetchChildSubscriptions` did not select `remove_at`, so a scheduled removal still rendered ticked-and-active on both mobile manage-subjects surfaces (tab + child subscribe screen). Same failure as web: a completed removal looked failed and could not be re-ticked to cancel. Now `remove_at` is selected and typed on `ChildSubscriptionRow.subjects`, both screens split covered/ending, and `SubjectCheckRow` gained a `chipTone` so the ending chip renders muted-outline like web's `.subjedit-chip-ending`. Reused the already-synced `subjedit.endingChip` key (no new strings).
- **Access queries deliberately unchanged** on both apps: a `remove_at` row still grants access until that instant, which equals the period end — the real-provider renewal job is what deletes it (already a TODO in `docs/PRODUCT_COMPLETION_BACKLOG.md` §A).

**✅ ROUND 27 COMPLETE (2026-07-18). Gates: from-zero rebuild **72/72 PASS** (rolled back, dev intact; migrations 070+071 live on dev) · web typecheck+build PASS (route list: `/services`, no `/pricing` page, new BFF avatar route) · admin typecheck+build PASS (28 pages) · mobile tsc 0 · lint clean · jest **70/70** (+6 avatar, +/services deeplink) · audit 0 ×3 apps · export bundles (preset PNGs in dist). Guide SS1–SS6. Nothing committed yet.**
- [x] **Copy (docx §2):** FAQ q/a1–a10 az investor-verbatim (typo fixes flagged: Olimpiadalırn→Olimpiadaların, missing space, double space, vatsap→WhatsApp) + EN/RU re-authored; `parent.auth.registerNote` + `subjects.lead` updated; registry lockstep (nav.pricing + faq q1–a3 — the only registry-overlapping keys). News/login untouched (test content/placeholders never published).
- [x] **Services rename (§3):** label VALUES ×3 on stable keys (nav.pricing → Xidmətlər/Services/Услуги — mobile synced automatically); page moved to `(public)/services` + permanent 308 `/pricing`→`/services` in next.config.mjs; internal links updated; mobile deeplink gained `/services` (student still blocked, `/pricing` kept). Planning-doc mentions of /pricing left (markdowns, non-user-facing).
- [x] **Olympiad sales window (§4, migration 2026_07_18_070):** `sale_starts_at`/`sale_ends_at` (+CHECK end>start; reused existing `event_starts_at`, aliased `event_at` in the RPC; one-time backfill sale_ends:=event_starts superseding the migration-035 event gate); ONE predicate `olympiad_package_on_sale()`; RLS select on packages+translations = on-sale OR admin OR purchase-family (`can_view_olympiad_package()` — purchasers keep lifetime visibility; `start_olympiad_attempt` verified purchase-gated-only and PRESERVED); `purchase_olympiad` rejects off-sale (hint `package_not_on_sale` → web/mobile `poly.err.notOnSale`, BFF 409); anon `get_public_olympiad_packages()` (trilingual fields, price, subject/grade, dates, real pool count; server-filtered/ordered). Backports 015/011/010(/012) + 013 **#71**. In-migration functional smoke: off-sale excluded + purchase blocked + on-sale purchasable (unwound).
- [x] **Landing/services listing (§5):** shared `PublicOlympiadPackages` server component on landing (below stats band — landing has no pricing section since the move) + `/services`; mobile services screen `PublicPackagesSection`; localized cards + Asia/Baku date-only chips + auth-aware CTA + empty state; `polyPub.*` ×10 ×3 locales; family-visible off-sale rows show "Satış bitib" chip instead of Buy (web catalog + per-child page + mobile catalog/sheet).
- [x] **Child avatars (§6, migration 2026_07_18_071):** `students.avatar_kind/avatar_key/avatar_media_path` (skip-default = preset+null = existing initials bubble); PRIVATE `child-avatars` bucket (2MB, png/jpeg/webp, signed-URL-only, non-enumerable) + `can_access_child_avatar()` storage policies (creator/linked parent RW, student R, admin, NO anon); project-generated flat PNG presets (Pillow, boy purple/girl orange) shipped to web `public/avatars/` + admin + mobile assets; web wizard/edit picker (Default/Boy/Girl/Upload w/ preview/replace/remove; byte-sniffed server-side; parent-session storage writes + service-role row write AFTER ownership re-verify; switching clears the other + best-effort old-object delete); BFF `POST /children/[id]/avatar` (multipart|preset|remove); mobile picker in add/edit-child (expo-image-picker → BFF, best-effort in wizard) + shared ChildAvatar (viewer's-own-session signed URLs, TTL cache) on parent cards/ChildChips/edit header/student header+profile (parent-set wins over legacy self photo); admin accounts show preset avatars + photo-set indicator (no signed-URL preview pattern exists in panel — deliberate, read-only); backports 002/009 + 013 **#72**. Leaderboards remain initials-only.
- [x] **WhatsApp contact:** `contact.support_whatsapp` system setting (seeded empty, 012) + admin Settings Support field + web ContactInfo row + mobile contact row + `get_mobile_config().contact.whatsapp` — all hidden while empty. **BLOCKER (investor-side): no real WhatsApp number provided — placeholder from the docx was never published.**
- [x] **Admin lifecycle UI:** sale-window datetime-local fields (browser-local → UTC hidden-ISO; display via Asia/Baku Intl; 2020–2100 bounds; end>start mirrored), derived state chips (Archived/Inactive/Scheduled/Active/Expired) on list+edit, effective-availability sentences, expired/archived stay listed, deletion protections untouched; `oly2.*` ×24 + settings + accounts strings ×3.
- **Investor test matrix (§10) coverage:** cases 1–4 = migration-070 smoke + 013 #71 · 5–6 = RLS purchase-family + purchase-gated attempts · 7 = admin list unfiltered · 8 = DB CHECK + form validation · 9–13 = sniff/2MB/storage-RLS (#72) + preset render + switch logic (jest 6 avatar cases) · 14 = label tests + jest deeplink · 15 = empty states · 16 = 308 redirect + mobile rule. Web/admin have no jest harness (backlog C4) — SQL/jest/build gates + SS manual checks cover the matrix.
- **Blockers:** real WhatsApp number (investor); everything else shipped.

**✅ ROUND 26 COMPLETE (2026-07-17). Gates: from-zero rebuild **70/70 PASS** (rolled back, dev intact) · web typecheck+build PASS · admin typecheck+build PASS (28 routes, new `/pricing`) · mobile tsc 0 · lint clean · jest **64/64** · audit 0 ×3 apps · export bundles. Migrations 068+069 applied to dev; RPC+trigger verified live. Guide RR1–RR5. Nothing committed yet.**
- [x] **A-1 attempt-graded trigger (068):** `trg_notify_attempt_graded` on `test_attempts` (AFTER UPDATE → 'graded', score/max non-null) calls `create_notification` with the WEB EMITTER'S exact contract (type/title/body incl. trim_scale score, data_json, in_app channel, prio 5, category progress, action_url result link, **idempotency key `attempt:<id>`** — byte-identical, so no double-insert was ever possible during rollout); SECURITY DEFINER, notification failure = WARNING only (grading can never abort); functional smoke in-migration (fake attempt → graded → row asserted field-by-field → unwound). Web emitter call REMOVED (single producer; emitter was kind-agnostic — trigger mirrors that and additionally covers mobile submits, result-page deadline grading and the legacy path). Backported to 011; 013 check **#69**.
- [x] **Pricing RPC (069) + admin editor:** `admin_upsert_subject_price(uuid,text,numeric)` — `is_admin()` guard FIRST (strictly Administrator; no permission escape hatch), interval whitelist (plan_interval values), 0<amount≤10000 ≤2dp, currency never client-set, upsert on `(subject_id,interval)`, self-written `audit_logs` row (`admin.pricing.subject_price_upsert`, old/new amounts); anon revoked, authenticated EXECUTE (in-body-gated). Backported to 011; 013 check **#70**; guard probe in-migration (non-admin → insufficient_privilege). Admin UI: new Administrator-only **Operations → Pricing** page (`/pricing`) — active subjects × week/month/year AZN cells, `requireAdmin()`-first action → the RPC, client+server validation, RLS admin reads (no service-role), trilingual `pricing.*` labels (12×3, local labels.ts convention), reprice-server-side note. Checkout trust boundary unchanged.
- [x] **A-2 mobile parent leaderboard:** new `(parent)/leaderboard` stack screen (web `/leaderboard` parity: points|streak · month|all_time · global/subject/grade/city/rayon/school with catalog-clamped pickers + cascading rayon/school; top-50 via shared `BoardRowList` extracted from RankingScreen — student board visually unchanged; per-child position via `get_child_leaderboard_position` w/ ChildChips picker + not-in-filter state); entries: analytics panel "view full" action + child-card rank row on Home; flag-gated; deep-link `/leaderboard` (parent) added + tests. 1 new key ×3 (`mob.plb.viewFull`).
- [x] **A-3 mobile Subjects page:** `(public)/subjects.tsx` (synced `subjects.*`/`subject.*` keys, zero new), AccountSheet INFO row (both roles) + pricing cross-link card; `/subjects` deep-link rule (public, in-session viewable both roles); welcome/login untouched.
- [x] **A-5 web dead code deleted:** `child/practice/[id]` route + `PracticeRunner.tsx` + `startPractice`/`gradePractice` (zero live references, grep-proven; route count 38, practice route gone).
- **Noticed, not fixed (needs owner approval — destructive):** DB functions `start_practice_attempt`/`grade_practice_attempt` still exist granted to authenticated (harmless, attempt-scoped + RLS-safe; dropping them = a destructive migration to approve separately).

**✅ ROUND 25 COMPLETE (2026-07-17). Gates: mobile tsc 0 · lint clean · jest 63/63 · audit 0 · export bundles ∥ web typecheck PASS. Nothing committed yet.**
- [x] **Authed news-article routes:** `(parent)/news/[slug]` + `(student)/news/[slug]` (thin wrappers — fetch/view-beacon/states already lived in the shared `ArticleView`; student = arena bg, both = themed native header/back); deep-link `/news/{slug}` roleTargets retargeted; news-tab modal UX untouched; ZERO new i18n keys. Guide **QQ1**.
- [x] **Auth/email-flow REPORT (investigation, no code):** everything is code-complete on both platforms — register→immediate login works TODAY (signUp; Supabase "Confirm email" OFF), verify-email UI + BFF `verify_email` branch exist but DORMANT, forgot/reset password flow complete but DEAD-UNTIL-SMTP (no Supabase Auth SMTP configured), account deletion live on web+mobile (no email dependency), child accounts created `email_confirm:true` with synthetic emails → enforcing verification later can never lock children out. **No separate auth.olympiq.ai app needed** (web-app `/auth/callback` + verify-email/forgot/reset pages already cover what UniPrep-Auth does; the only Elmly extra is an "open app" deep-link bounce — add at will later). Micro-fixes applied: stale `parentService.ts` header comment corrected (claimed admin.createUser; real code = signUp) + `NEXT_PUBLIC_SITE_URL` documented in `.env.local.example`. **OWNER SMTP path:** configure Brevo as Supabase Auth SMTP (Dashboard → Auth) + set `NEXT_PUBLIC_SITE_URL` on Vercel + auth-email templates ×3; only AFTER SMTP works may "Confirm email" ever be flipped ON.
- [x] **Full parity + admin-control + remaining-work AUDIT:** apps are feature/logic-synchronized across the whole core loop (shared cookie-free CORE + BFF = one source of truth). Minor gaps catalogued: **A-1** mobile-submitted attempts don't fire the `attempt_graded` notification (web fires it in the server action; mobile calls the RPC directly — fix = DB trigger or BFF passthrough), A-2 mobile parent has rank summaries but no full leaderboard browser (likely by-design), A-3 no mobile public Subjects catalog (folded into pricing), A-5 dead web `startPractice`/PracticeRunner legacy code (no callers — cleanup). Admin control verified end-to-end (flags/payment-mode/maintenance/locales/contact/CMS/versions/term/pricing-reads all reach BOTH apps; mobile only via whitelist RPCs); control gaps: `subjects_pricing` has NO admin editor (prices are seed/migration-only; apps stay in sync regardless) + Subscriptions/Payments admin screens are `soon` placeholders (A4, falls out of A1). **CONFIRMED: real payments + webhook (A1 cluster) is the ONLY launch-blocking code item.** Post-launch/optional: A-1 fix, coupons build-or-retire, daily-tasks engine, achievements, support intake, email-channel body, admin MFA + durable rate limiter, parent/student web idle logout, web/admin jest, sentry, admin polish G6–G9, subject-pricing editor. Owner ops: SMTP+domain (C2), prod DB build + 016 cron (C8), schools beyond Bakı (D1), Expo/store launch (runbook), daily-round content prep (terms + option E per subject+grade).

- [x] **✅ News-notification kind fix (owner-approved follow-up, DONE 2026-07-17):** migration `2026_07_17_067_news_notification_kind.sql` applied to dev (self-verify PASS) — new IMMUTABLE `notify_template_kind(text)` (template code → type/category; service-role-only, authenticated+anon revoked) used by BOTH broadcast fan-outs (`admin_send_notification` immediate + `dispatch_scheduled_notifications` scheduled), so news publishes now store `type=news_published`/`category=news` (newspaper icon + "Xəbərlər" filter chip on web AND mobile — the client code was already in place); plain composer sends keep `admin_announcement`/`announcement`; precise backfill via the linked broadcast's `template_code` (0 rows on dev — no historical news broadcasts). Backported to canonical `011` + new `013` check **#68**. **Non-destructive from-zero rebuild = 68/68 PASS** (post-rollback dev verified intact). No client changes needed.

## 🗺️ FEATURE PLANS — Leaderboard · Test engine · Notifications (2026-07-05)

**Implementation ORDER APPROVED by owner (2026-07-05): Test engine → Leaderboard → Notifications** (graded attempts feed leaderboard points/streak; several notification events fire off attempts/leaderboard). These 3 plans are the **next major work, still REMAINING** (resume after the Round 12 update pass above). Each plan's **Owner-decisions** list must be resolved at the start of that plan.

Three big features were investigated (6-agent recon over OUR schema + the UniPrep reference in `side/`) and turned into detailed, professional implementation plans. **PLAN ONLY — nothing implemented yet.** We execute each separately:
- **`docs/plans/LEADERBOARD_PLAN.md`** — points board (server-computed, anti-manipulation: append-only per-attempt ledger, `UNIQUE(attempt_id)`, RLS-write-protected columns, difficulty-weighted + daily anti-grind cap, config-driven) + streak board (single-writer `is_active` ground truth, tz-aware, lazy expiry) + live `ROW_NUMBER()` board RPCs with deterministic tie-break + admin config/reset/season + monthly pg_cron. Builds on the existing (empty) `leaderboard_*` tables + graded `test_attempts`.
- **`docs/plans/TEST_ENGINE_PLAN.md`** — subject→topic→subtopic selection → instructions gate → timed player (server-authoritative `deadline_at`, palette, prev/next, flag, 30s autosave, submit/cancel, resume) → results + review-with-explanations. Reuses our attempt engine + RPCs; FIXES UniPrep's real gaps (never ship `correct_answer`; server-enforced timer; server-created attempts; single-open + cron expiry). New RPCs: `start_topic_test_attempt`/`get_test_attempt`/`save_test_answers`/`submit_test_attempt`/`cancel_test_attempt`/`expire_stale_test_attempts`.
- **`docs/plans/NOTIFICATIONS_PLAN.md`** — in-app center (parent+child, Realtime + toast) + admin composer/history/templates + event generators + idempotent single producer path (`create_notification` with `UNIQUE idempotency_key`, mark-read via RPC, no client forge, audited admin sends) + email (optional MVP) + push (mobile-stage ready via `push_tokens` from the mobile plan). Collapses UniPrep's ~17-table sprawl into a small native design; no SMS.

Each plan ends with an **Owner-decisions** list to resolve when we start it, and a staged (L#/T#/N#) rollout with the standard validation gates. Reference teardown findings archived in the session scratchpad (`scratchpad/plans/*.md`).

---
## 📋 PRODUCT COMPLETION BACKLOG (2026-07-04)

Full investigation of everything deferred/unfinished across web + admin + DB (STATUS registries cross-checked against CODE reality) now lives in **`docs/PRODUCT_COMPLETION_BACKLOG.md`** — the single source of truth for remaining work. Key code-level findings: the daily-tasks engine has schema but ZERO app code; the leaderboard has no real board (own-row only, entries tables unpopulated); the **access-recompute job referenced in cancel-flow comments does not exist** (trials/subscriptions never auto-expire — launch blocker); web-app ESLint still unconfigured; coupons/achievements/notifications/support tables entirely unused; parent/student panels have no idle logout (admin only). Plus the known registries: real payments+webhook, demo Billing/Invoices, mock olympiad payment, admin subscription/payment monitoring, Vercel/domain/SMTP, package.json rename, admin polish items (G6–G9).

---
## 📱 MOBILE APP TRACK — PLANS REWRITTEN v3 (2026-07-09), READY TO BUILD, DORMANT UNTIL ACTIVATED

Owner confirmed React Native + Expo. **All mobile plans rewritten (v3) against the ACTUAL shipped platform through Round 17** (verified with a fresh code+DB inventory: RPC grant map, route/nav/service inventory, flags/settings, cron, RLS read surface). The old v2 plan predated the test engine, the real leaderboard + seasons, the notification engine, payment modes/free-access, stickers/palettes, the Website-Content CMS, and mandatory phone — v3 folds ALL of it in and consolidates the old M0–M9 micro-stages into **4 BIG build stages** per the owner's delivery preference.

- **`MOBILE_APP_IMPLEMENTATION_EXECUTION_PLAN.md` (root) — THE MAIN PLAN the owner activates to build.** Stages:
  - **M1 — Foundation, admin control plane & authentication:** Expo scaffold + full design system (incl. the 5 arena palettes) + i18n sync + runtime CMS overrides; NEW DB `get_mobile_config()` (payment MODE resolved server-side, flags, maintenance, locales, contact/social, version gate) + `get_mobile_content(locale)` + `mobile_app_versions` + NEW Admin-only "Mobile App" panel section; root state machine + deep-link allowlist router; parent register (E.164 phone)/login + child-login BFF + session lifecycle.
  - **M2 — Public surface & complete parent panel:** public stack + news + deep links; all 5 parent tabs + bell + AccountSheet — dashboard w/ leaderboard chips, mode-aware Add-Child wizard (real/demo/giveaway/free/off flows), real analytics, olympiad purchases, subscription center w/ payment-first subject editor + cancel, notifications inbox/Realtime/prefs (self + per-child), profile + edit-child; full `/api/mobile/v1/*` BFF surface.
  - **M3 — Student arena:** arena home + FULL test engine parity (setup/timed runner w/ server deadline + autosave + resume/results/review filters), olympiads, real leaderboard (scopes/periods/anonymization/streak), news, notifications, profile (read-only school info, sticker-theme + palette pickers; sticker DECORATIONS deliberately not rendered on phones — web hides them <1280px too).
  - **M4 — Push, hardening, compliance & launch:** push end-to-end through the EXISTING delivery seam (`EXPO_ACCESS_TOKEN` + `notifications_push` flag + admin composer's "Mobil tətbiq" channel), commerce-posture finalization, MASVS sweep, biometrics, privacy manifests, budgets/QA, store metadata ×3, EAS production + submission, rollout/OTA/runbooks.
- `mobile-app/markdowns/MOBILE_APP_MASTER_PLAN.md` **v3** — design truth: verified backend contracts (which RPCs mobile calls directly with the user JWT vs which need the BFF — flags/settings/site_content are admin-RLS-locked, hence the config/content RPCs), navigation (parent 5-tab / student 5-tab incl. the Tests tab), deep linking + notification `action_url` (`isSafeRelativeUrl` parity), screen state matrix, offline policy, MASVS security, EAS/OTA, QA, refreshed web-parity-debt table (leaderboard/notifications/access-recompute now SHIPPED and consumed), risk register, owner-decision list.
- Supporting docs synced: `docs/NOTIFICATIONS_MOBILE_CONTRACT.md` (stage refs → M4), `mobile-app/CLAUDE.md` (v3 reading order + rules), `FUTURE_MOBILE_READINESS.md` (marked superseded), root `CLAUDE.md` + `CODING_AGENT_PROMPTS.md` (M1–M4 references).
- **Payment-provider note (owner-confirmed):** the ONLY platform gap relevant to mobile is the real payment provider (backlog **A1**, a WEB deliverable). The mobile plan does NOT block on it and builds no throwaway foundation: commerce is mode-aware via the BFF (giveaway/demo/free flows can run end-to-end; `real` mode ships store-compliant read-only/manage-on-web posture — owner decides the exact wording at M2), the olympiad `processOlympiadPayment` seam + provider-agnostic tables + Idempotency-Key purchase contract are the future integration points, and IAP/RevenueCat becomes a bounded add-on after A1 (master plan §17).
- **To activate:** owner sets "M1 — Foundation, control plane & auth" as the active stage here and runs Prompt 2. Owner inputs: bundle id `ai.olympiq.app` + name confirm (M1); commerce posture (M2); store accounts, sentry on/off, Kids-Category posture, push-in-v1 confirm (M4).

---
## ✅ INVESTOR REVIEW ROUND 10 — COMPLETE & VALIDATED (2026-07-03)

**Final gate: web typecheck+build PASS (35 routes incl. /dashboard/news + /child/news), admin typecheck+build PASS, migration 024 applied on dev + backported (012 + 013 #32), extended `013` = 32/32 PASS incl. non-destructive from-zero rebuild. Nothing committed yet.**

- [x] F1 CM least-privilege VERIFIED both layers, zero gaps (full module→access→guard matrix below via agent audit): nav flags correct; every admin-only page/action `requireAdmin`; content work `requirePermission(content.*)` with per-transition perms; DB seed grants CM only content.create/edit_own/analytics.read_subject_limited. CMs create/edit/submit content but never approve/publish/delete (intentionally stricter).
- [x] F2 Filters added via one reusable searchParams-driven FilterBar (debounced, URL-as-truth, server-validated uuid/status whitelists, LIKE-escaped): News (status+title search), Olympiad (subject+status+title), Manage resources (name search + status where applicable; Topics +subject; Subtopics +subject→topic cascade), Cities (status+name), Schools (city+status+name).
- [x] F3 Schools: **312 verified Bakı schools seeded** (migration `2026_07_03_024`): the EXACT numbered-school union of the official BŞTİ list pages 1–11 (baku.edu.gov.az/az/page/231, retrieved 2026-07-03; 310 numbers between 1–350 with official gaps preserved) + 2 named institutions; per-district duplicate-guard unique index `uq_schools_district_name`; source documented in the migration header + canonical 012 backport (schema has no source column). Legacy sample rows №6/№20 (not on the official list) left untouched — possible FK references. Other cities deliberately deferred until official lists are sourced (no unverified data).
- [x] F4 Olympiad table alignment: `.table-wrap` (responsive horizontal scroll) + `.nowrap` cells applied on /olympiad and every other admin list touched this round.
- [x] F5 Accounts search (query-level `.or(display_name.ilike,email.ilike)` scoped to parent ids; PostgREST-grammar chars stripped + LIKE-escaped).
- [x] F6 Audit log: 21 app action codes + trigger `op:table` format + 17 entities mapped to trilingual labels (clean-text fallback, never raw); QUERY-level scope to administrator/content_manager actors via profile_roles join (system/trigger NULL-actor rows excluded by the IN); entity filter select.
- [x] F7 Settings: SettingsField restructured — label → control → help → footer row with status + Save (`.sfield-foot`), button no longer floats above the input.
- [x] F8 Footer social links render as inline-SVG platform icons (round chips, aria-label + title, focus ring).
- [x] F9 News images: `images.minimumCacheTTL` 31d (optimized covers cached), first page eager + first two priority, shimmer placeholder on `.news-card-media`.
- [x] F10 In-panel News: shared NewsBrowser/NewsArticleView components; new routes /dashboard/news(+[slug]) and /child/news(+[slug]) inside their shells; parent+student nav items added (parent Home now exact-matched); both dashboards' "View all"/article links stay internal. Public /news keeps the news_public gate; in-app news intentionally ungated (flag governs the PUBLIC section per product model).
- [x] F11 "Tezliklə": Tests&Daily Tasks → **Daily Tasks only** (soon; visible to Admin + CM via content.create).
- [x] F12 "Baxışlar" (Reviews) placeholder REMOVED (review queue = Questions in_review filter + stat card); dead i18n keys pruned ×3.
- [x] F13 Leaderboard flag now gates for real: student nav tab hidden when off + /child/leaderboard shows a clear trilingual "ranking disabled by administrator" notice; flag description already matched.
- Tests note (assumption recorded): no JS test framework exists and adding one would violate the no-new-dependencies constraint — permission/audit/flag/routing verification lives in the SQL validation suite (now 32 checks incl. #32 schools) + builds + the Y1–Y13 manual matrix.

Docs updated: MANUAL_TESTING_GUIDE **Y1–Y13**; demo-data registry unchanged (billing/invoices + olympiad mock payment remain the only demo surfaces).

### Original Round 10 plan

Partition: main session = shared files, admin CSS/structure fixes (F4/F7), web tasks (F8 icons, F9 news images, F10 panel news at /dashboard/news + /child/news, F13 leaderboard flag), F3 schools research+seed (migration 024). Agent A = admin filters (news/olympiad/subjects/topics/subtopics/cities/schools) + accounts search (owns admin messages/globals + those pages, incl. applying the new .table-wrap to fix F4 alignment). Agent B = F1 CM least-privilege verification+fixes, F6 audit log (humanized action/entity + query-level admin/CM-actor filter), F11 Upcoming cleanup (keep Daily Tasks only, admin+CM), F12 remove "Baxışlar"/Reviews placeholder (redundant — questions list filters cover the review queue); returns admin i18n TSV for central merge.

- [ ] F1 CM least privilege (UI + server verified) · [ ] F2 filters ×7 sections · [ ] F3 schools data (verified sources, deduped, source documented) · [ ] F4 olympiad table alignment · [ ] F5 accounts search · [ ] F6 audit log humanize + actor scope · [ ] F7 settings save-button placement · [ ] F8 social icons (aria) · [ ] F9 landing news images · [ ] F10 panel news nav + internal View-all · [ ] F11 Upcoming: Daily Tasks only · [ ] F12 Views/Reviews removed · [ ] F13 leaderboard flag gates + notice
- Tests note: no JS test framework exists in the repo (adding one = new dependency); security-sensitive checks continue to live in the SQL validation suite (013) which gains checks where applicable; permission/flag behavior is verified by build + documented manual checks (guide Y-section).

### Original Round 9 plan (all delivered)

Model: main session = shared files (globals.css, messages.ts, layouts, SQL), root-cause bugs, shared Modal; background agents = UniPrep studies + big builds (contract returns for CSS/i18n).

- [ ] T1 Landing language dropdown shows TWO carets (JSX svg + CSS ::after) — keep the animated one.
- [ ] T2 Parent home "Uşağı sil" button styling broken — restyle to match card buttons (danger variant), same behavior.
- [ ] T3 Uploaded avatar not clipped in the nav circle — enforce fixed square + 50% radius + overflow hidden + object-fit cover on every avatar surface.
- [ ] T4 Analytics: remove the "Orta dəqiqlik" stat card → exactly 5 boxes, even responsive grid (executed inside the T6 analytics rebuild).
- [ ] T5 Shared reusable <Modal> (isOpen/onClose/title/children; portal, overlay click-close, Escape, ×, scroll lock, role=dialog/aria-modal/focus) + rebuild the buggy student "Ətraflı" olympiad modal on it + refactor every other web-app modal to it.
- [ ] T6 Study UniPrep analytics architecture (agent) → implement REAL analytics on our schema (SQL RPC migration 022 over test_attempts/answers/questions/topics; wire parent dashboard to real data; admin analytics where needed). Replaces the Round-8 demo numbers where real data exists.
- [ ] T7 Parent "Olimpiadalar" purchase menu: nav item + page (browse all packages w/ admin price, child selector, mock-payment service isolated for a future provider, shared Modal confirm, purchased/loading/success/error states) → unlocks in student "Olimpiadalarım" (existing purchase_olympiad RPC).
- [ ] T8 Study UniPrep admin Questions page (agent) → implement the missing high-value features in our admin Questions.
- [ ] T9a Admin Wallpapers save silently fails (color AND image) — debug the whole flow (form → action → validation → storage/DB → refresh), fix root cause, add visible success/error feedback.
- [ ] T9b Student background templates must be driven by admin wallpapers (verify the Round-8 gallery is fully DB-driven; no hardcoded list).
- [ ] Validation: typecheck/build both apps, migration applied + backported + from-zero, MANUAL_TESTING_GUIDE + STATUS updates.

### Round 6 — still deferred (owner-acknowledged, tracked)
- **Real payments + webhook activation** (needs a payment-provider decision; schema is provider-agnostic and ready).
- **Trial/charge automation** (trial→paid conversion, failed-charge auto-block, expiry recompute job).
- **Admin subscription/payment monitoring** module (read-only finance views).
- **Brand rename in `package.json`/`README`** (non-UI; safe to do anytime — package names `olimpiada-web-app`/`olimpiada-admin-panel` and repo README still use the old name).
- `notifications_email` gate is wired but idle until an email sender exists.

## ✅ INVESTOR REVIEW ROUND 4 — COMPLETE & VALIDATED (2026-07-01)
Bugs-first then redesign. **Final gate: web typecheck+build PASS (28 routes), admin typecheck+build PASS (20 routes), from-zero DB rebuild = 26/26 PASS.** Nothing committed yet.

### Phase 1 — Critical bugs (root-caused + verified)
- [x] **Add-Child "could not be created"** — root cause: the D2 wizard calls the **10-arg** `create_child_account`, which only existed once **migration 017** was applied to dev (done end of Round 3). Verified the full flow (`addChild`→`getParent`→`createChild`→RPC) returns `ok:true` in the running app. Also improved `getParent`/`getChild` with a one-retry so a transient RPC hiccup can't log a valid parent out.
- [x] **"Logs out every minute" (admin) + logout-on-nav** — root cause: **both apps run on localhost and shared the same Supabase auth cookie** (cookies are domain- not port-scoped). Gave each app its own cookie name (`sb-olimpiada-web` / `sb-olimpiada-admin`) in all 6 client factories. (JWT TTL verified 3600s; IdleTimeout correctly 30 min; guards sound.) → **one-time re-login required after this change.**
- [x] Password-eye **vertical centering** (both apps; `display:block` on the input removes the inline descender gap). Admin **Public→"Hər kəsə açıq" / Private→"Gizli"** (az).
- [x] "News/Contact logs me out" was NOT a real logout — parent nav pointed at the **public** pages; fixed by the parent nav restructure (in-app `/help/*`).

### Phase 1b — Admin bugs
- [x] **Audit log** — real bug: `writeAudit` passed `severity:"error"` (not in the `audit_severity` enum) so the INSERT threw and was **silently swallowed** → rows dropped. Fixed (type-constrained severity, null-coerced blank target_id, errors now logged). Timestamps now render in **Asia/Baku** (Intl `timeZone:'Asia/Baku'`).
- [x] **Cities** — Country Code field removed (server defaults `'AZ'`). **Add-News** — featured-image upload added to the Add-News flow (`/news/new` → create → cover upload → Continue).

### Phase 2 — DB + Landing
- [x] **Migration 018**: `news.view_count` + public `bump_news_view(uuid)` RPC (backported to 014/013; from-zero 26/26; applied to dev).
- [x] **Landing redesign**: **light-mode depth/energy** (elevated cards, shadows/borders; dark untouched); **About Us** section + **stat cards** (illustrative placeholders, inline-SVG art); **side-by-side pricing**; **navbar** now holds the theme toggle + a **language dropdown** (root topbar removed); **FAQ chevrons**; **equal-size** contact info/map; **News** list sort chips (Latest/Oldest/Most-Viewed via `?sort=`) + **pagination** (`?page=`, 6/pg) + view badges; detail page counts views.

### Phase 3 — Parent panel
- [x] Independent parent nav (no wordmark): **Home / Analytics / Subscription / FAQ / Contact** + a far-right **profile drawer** (Account = avatar/password/delete/logout, Language, Theme). **In-app** Contact/FAQ at `/help/faq` `/help/contact` (no public-shell "logout"). **Home** = carousel (fixed — one slide, working arrows/dots) + children with **Add-Child on the right**. New **Analytics** page (real per-parent metrics). Generous spacing.

### Phase 4 — Subscription + Settings + Child
- [x] **Subscription Management** = modern SaaS **cards** per child + a **Cancel flow** (confirm → reason → "what you'll lose" → confirm). New `cancelChildSubscription` action (owner-verified, service-role mutation, access kept until period end; demo-safe).
- [x] Admin **Settings** redesigned user-friendly: friendly flag names+descriptions with On/Off switches; typed inputs for known settings (email / Yes-No / locale select / locales checkboxes) + an Advanced JSON fallback; persistence shape unchanged. (Meta maps moved to `settings-meta.ts` — a `"use server"` file can't export objects.)
- [x] **Child/ARENA** panel: wordmark removed (just "ARENA"); theme toggle + language dropdown added to the arena nav; Student nav is independent.

### Round 4 — deferred (unchanged)
- Real payments + webhook, failed-charge/expiry automation, admin subscription/payment monitoring, pg_cron scheduling of `advance_student_grades()`. News **"Most Liked"** (likes model) deferred — **Most Viewed** shipped. Landing **"Energetic" design image** not received — light-mode polish built to the written spec; align to the image when shared.

## ✅ INVESTOR REVIEW ROUND 3 — COMPLETE & VALIDATED (2026-06-29)
Implemented the full Round-3 punch-list (≈24 change requests) across 7 phases of multi-agent work. **Final gate: admin-panel typecheck+build PASS (20/20), web-app typecheck+build PASS (24/24), from-zero DB rebuild = 25/25 PASS** (dev/staging, non-destructive, rolled back). Nothing committed yet (awaiting owner go-ahead). Updated manual testing guide in `docs/MANUAL_TESTING_GUIDE.md`.

### Phase A — Foundations (DB + theme + i18n)
- [x] **DB migration `2026_06_29_017_cities_schools_grade_promotion.sql`** (backported to canonical 002/003/011/012/013; 013 now 25 checks): repurposed empty `districts` as the admin-managed **City** catalog (15 AZ cities seeded); made `schools.district_id` **NOT NULL** (a school must belong to a city) + sample Bakı schools; added `students.graduated boolean`; added service-role-only RPC **`advance_student_grades()`** (Sept promotion, level<11 → +1, level 11 → graduated; documented pg_cron `0 3 1 9 *`, not auto-scheduled); extended `create_child_account` to 10 args (appended optional `p_district_id`, `p_school_id`).
- [x] **Platform light/dark theme** (web-app): `data-theme` on `<html>` (dark default = reference design), `localStorage "theme"`, no-flash inline script, `ThemeToggle` in topbar; all surfaces (public/parent/child-arena) flip via CSS variables.
- [x] **i18n repair**: admin — all ~60 missing keys added (`settings.*`, `accounts.*`, `audit.*`, `group.operations`, `nav.accounts/audit/cities/schools`, `action.*`) so the raw-key screenshot is fixed; web — Russian public-page fixes (pricing period labels etc.) + authored trilingual content (expanded About, 10 FAQ, pricing copy, contact).

### Phase B — Admin panel
- [x] **Settings** redesigned (feature-flags + JSON settings, readable cards) — keys now resolve.
- [x] **Accounts full CRUD** (`lib/admin/accounts.ts`): create parent (admin client + `setup_parent`), edit (name/status), delete parent (cascade) + delete child, child password reset; `requireAdmin` + service-role + audit_logs entries; typed delete confirms.
- [x] **News action buttons moved to TOP** (Save/Publish/Unpublish/Archive/Delete in a top action bar).
- [x] **Questions list** compacted/professional (zebra/hover, refined pills, tighter columns).
- [x] **Session hardening**: no-session → `/login` (not `/unauthorized`); `/unauthorized` only when authenticated-but-no-role; retry on transient profile/role lookup; **30-min inactivity logout** (`IdleTimeout` mounted in protected layout).
- [x] **Cities & Schools admin CRUD** (new `/cities`, `/schools` routes + nav under Taxonomy); creating a school **requires** a city; deleting a city with schools surfaces a friendly error (FK RESTRICT).
- [x] Active/Inactive → **Public/Private** (i18n `status.active`/`status.inactive`).

### Phase C — Public website
- [x] **Sticky footer** (flex column, footer pinned bottom).
- [x] **Pricing** — placeholder numbers (weekly ≈2 / monthly ≈6 (~25% save) / yearly ≈50 (~30% save) AZN per subject) in a real card grid with savings badges + trial/sibling-discount/disclaimer callouts (not plain text).
- [x] **About** — expanded official multi-section trilingual content.
- [x] **FAQ** — collapsible accordion (`FaqAccordion`).
- [x] **Contact** — Google Maps **embed** (keyless iframe, Government House of Baku) + info card.
- [x] **News** added to public nav + footer.

### Phase D — Auth + Add-Child
- [x] **Password show/hide toggle** everywhere (web `PasswordInput` on login/register/reset/child-login; admin `PasswordInput` on login/account-create/child-reset/user-create).
- [x] **Login/register redesign** — visible placeholders + focus rings, readable in both themes.
- [x] **Existence errors** — register "email already registered" (`parent.err.emailExists`); login "no account" vs "wrong password" (admin-client lookup; enumeration tradeoff noted).
- [x] **Add-Child WIZARD** (`AddChildWizard`): Info → Subjects → Plan → **Demo payment** → ID reveal; **mandatory city→school→grade dropdowns** (school filtered by city, structured `district_id`/`school_id`/`grade_id` into the 10-arg RPC).
- [x] **"Save → /login, child not saved" bug FIXED** — root cause: `requireParent()` `redirect("/login")` throws `NEXT_REDIRECT` inside the action, discarding the submission; fix: resolve parent via `getParent()` and return an in-form error instead of redirecting.

### Phase E — Parent/Student panels
- [x] **Compact** "OlympIQ" brand (parent + child).
- [x] **Profile sections** (parent + child): avatar **upload** (`profile-avatars` bucket → `media_assets` → `profiles.avatar_media_id`, initials fallback), **change password** (parent self; child self with password≠ID rule), delete account (parent only) + logout.
- [x] **Information carousel** ported to the parent dashboard (5 numbered onboarding items).
- [x] **News panels** in parent + child dashboards (latest published).
- [x] **Contact + FAQ** links in the parent shell; styled `.link-danger`.

### Phase F — Question types
- [x] **Type-aware answer validation** in admin `saveQuestion` (single = exactly 1 correct; multiple = ≥1; true/false = exactly 2 options / 1 correct; non-MCQ types rejected for now) + per-type form hints. Grading already dispatches correctly by type (verified `PracticeRunner` + `grade_practice_attempt`); no risky changes to the live grading function.

### Round 3 — still DEFERRED (unchanged from Round 2)
- Real payment charge + **webhook activation** (the wizard's payment step is a clearly-labeled **demo** — trial grants access, no charge), failed-charge auto-block + trial/subscription expiry automation, admin subscription/payment monitoring, pg_cron scheduling of `advance_student_grades()`. Close-future: leaderboard ranking, in-app notifications, achievements/streaks engine, advanced analytics.

## ✅ INVESTOR REVIEW ROUND 2 — COMPLETE & INDEPENDENTLY VALIDATED (2026-06-28)
All change-request batches A–J implemented. **admin-panel + web-app typecheck + build PASS; from-zero DB rebuild = 23/23 PASS** (dev/staging, non-destructive). Deferred-to-end items (real payments, failed-charge/expiry automation, admin subscription/payment monitoring) and the close-future backlog (leaderboard, notifications, achievements/streaks, analytics) remain — recorded above + in the execution plan. Next: owner manual testing (guide in `docs/MANUAL_TESTING_GUIDE.md`), then the backlog.

### Batch I — Admin operations tooling — DONE (typecheck + build PASS; audit cols verified vs `008`)
- [x] I1 **/accounts** — parent/child account monitoring + **admin child-password reset** (`lib/admin/accounts.ts` `resetChildPassword`: `requireAdmin` → service-role `updateUserById`, password≠ID guard, records `password_set_*`; `ChildPasswordReset` client).
- [x] I2 **/audit** — audit-log viewer (reads `audit_logs` cols actor_profile_id/action/target_table/target_id/severity/success, resolves actor names, admin-only).
- [x] I3 **/settings** — settings + feature-flags admin (`FeatureFlagToggle`, `SettingEditor`, `lib/admin/settings.ts`). New "Operations" nav group.

### Batch J — Test & Daily-Task engine ("Arena" Claude Design) — DONE (web-app typecheck + build PASS)
- [x] J1 **Arena design implemented** (web-app student app), keeping all logic/RPCs: scoped `.arena` dark theme in `globals.css` (Chivo + JetBrains Mono); `child/layout` Arena nav + real streak chip; `child/page` hero (rounds CTA → `startPractice`, real mini-stats, rank placeholder — no fabricated data), ticker, today's-rounds, subject-strength; `PracticeRunner` stepper (no difficulty tags); new `child/leaderboard` (read-only, real self data, filter chips, "coming soon"); `ArenaLogin` two-tab **Student (8-digit ID) / Parent (email)** only — NO Center/Admin; child-login + public login restyled. Trilingual `arena.*`/`auth.tab.*`. (`ChildLoginForm` now unused, harmless.)

### Remaining batches — implementation notes (existing files to EDIT, not create)
Prior sessions already built Stage 9–14 engines (these files exist, mostly untracked): admin **olympiad** (`components/OlympiadForm.tsx`, `PoolManager.tsx`, `lib/admin/olympiad.ts`), admin **news** (`components/NewsForm.tsx`/`NewsLifecycle.tsx`, `lib/admin/news.ts`), web-app **subscribe** (`components/SubscribeForm.tsx`, `lib/auth/subscriptionService.ts`), **practice/olympiad** runners (`components/PracticeRunner.tsx`, `lib/auth/olympiadService.ts`), and SQL migrations `2026_06_28_011_parent_registration` … `014_olympiad_engine`. So:
- **C (news image):** add a cover-image uploader to `NewsForm` (browser→`news-media` bucket→`media_assets`→`news.cover_media_id`, mirror `QuestionMediaUploader`) + render the cover on `(public)/news` + `[slug]`.
- **D (olympiad):** `OlympiadForm` already exists → remove its `code` input (auto-gen, like `actions.ts`); add a **private per-package question bank** (new table `olympiad_package_question_bank` + translations/options + a package-scoped bulk-insert RPC + UI in `PoolManager`/new component) NOT linked to general `questions`. Migration + backport + validate.
- **H (add-child + subscribe):** edit `AddChildForm` (Grade/School/City dropdowns), re-sequence so the 8-digit ID is allocated **after** the subscribe/purchase step (split allocation out of `create_child_account`), make child-card subjects editable, and rework `SubscribeForm` (subjects-first checkboxes → subtotal → weekly/monthly/yearly → discount in total).
- **B2-bulk:** change `bulk_insert_questions` to resolve subject/type/olympiad **by name** + drop difficulty (migration + backport); update the import template + remove the codes panel.
- **J (Arena):** implement the attached design for the web-app **child/student** app (home/quiz/leaderboard + Student/Parent-only login), keeping our logic; no difficulty tags.

### DEFERRED — integrate at END of platform (saved here per instruction)
- **Real payments** (provider + checkout + **webhook activation**).
- **Failed-charge auto-block + trial/subscription expiry automation** (scheduled job).
- **Admin subscription/payment monitoring** (separate from account monitoring above).

### FUTURE (also added to `IMPLEMENTATION_EXECUTION_PLAN.md`)
- **Leaderboard** (the Arena design includes a leaderboard screen → build a read-only version in J1; full school/rayon/country ranking is future), **in-app notifications**, **achievements/streaks** (streak shown in Arena UI; full engine future), **advanced analytics/exports**.

### Why the "smaller" items are needed (explanation requested)
- **Content review-queue UI:** gives Content Managers a single place to submit drafts and Admins to approve/publish — enforces separation of duties + a quality gate before content goes public. Today the lifecycle exists but review is ad-hoc per question.
- **Launch 1-month promo logic:** the business model promises a ~1-month launch promo (free access) *before* the ongoing 7-day trial, to drive initial signups. The `launch_promo_config` window exists but isn't applied — needs logic to grant the longer free period during the promo window.
- **Add-subjects-later flow:** parents add subjects to a child over time; without an explicit "add subject → next-cycle pricing" path they'd have to recreate a subscription. (Now folded into H3/H4.)
