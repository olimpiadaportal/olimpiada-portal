# Mobile BFF — API contracts (`/api/mobile/v1/*`, hosted by web-app)

Documented as built, one section per endpoint (master plan §7.3). Conventions
for EVERY endpoint: Bearer/Supabase-session-free unless stated (auth endpoints
mint the session); request/response bodies are JSON; success = `{ok:true,
data}`; failure = `{error:"<i18nKey>", retryable:boolean}` (the app translates
the key locally — raw server text never renders); `Cache-Control: no-store`;
only POST is exported (anything else 405s); oversized or non-JSON bodies fall
through to normal validation errors. The BFF wraps the SAME audited web service
functions — validation, rate limits, lockouts and generic-error discipline are
identical to the web.

## POST /api/mobile/v1/auth/child-login  (added M1)

Child sign-in: 8-digit ID + parent-set password → session tokens. Server-side:
per-IP throttle (`mchildlogin`, sha256(ip), 20/15min) → format validation → DB
lockout gate (`is_child_login_locked`, ≥8 fails/15min) → bare token-mode
`signInWithPassword` against the synthetic email → `record_child_login_attempt`
(always). Body cap 2048 bytes.

Request: `{"child_id":"12345678","password":"..."}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"access_token","refresh_token","expires_in","expires_at","token_type","user_id","role":"student"}}` |
| 400 | `{"error":"auth.child.err.idFormat"\|"auth.child.err.passwordRequired","retryable":false}` |
| 401 | `{"error":"auth.child.err.invalidCredentials","retryable":false}` — generic, no ID/password disambiguation |
| 423 | `{"error":"auth.child.err.locked","retryable":false}` — DB lockout |
| 429 | `{"error":"auth.child.err.locked","retryable":true}` — per-IP throttle |
| 503/500 | `{"error":"auth.child.err.serverError","retryable":true}` |

Client: `supabase.auth.setSession({access_token, refresh_token})` then resolve
the role server-side (`has_role`).

## POST /api/mobile/v1/auth/register  (added M1)

Parent registration (parity with the web `registerParent` action): validation
order required→email→phone→password with the same regexes/caps (E.164 phone
mandatory), SHARED rate-limit bucket `register` (email, 5/15min — web + mobile
share one budget), `signUp` (email-confirmation aware) → `setup_parent` RPC →
error-tolerant phone persist. Body cap 4096 bytes.

Request: `{"first_name","last_name","email","password","phone"}` (phone = E.164)

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{...tokens...,"role":"parent"}}` — project has email confirmation OFF |
| 200 | `{"ok":true,"data":{"verify_email":true}}` — confirmation required; the app shows the check-inbox notice |
| 400 | `{"error":"parent.err.required"\|"parent.err.email"\|"parent.err.phone"\|"parent.err.password"\|"parent.err.createFailed","retryable":false}` |
| 409 | `{"error":"parent.err.emailExists","retryable":false}` |
| 429 | `{"error":"parent.err.tooMany","retryable":true}` |
| 503/500 | `{"error":"parent.err.createFailed","retryable":true}` |

## M2 conventions (all endpoints below)

Added M2. All require `Authorization: Bearer <supabase access_token>` of a
PARENT account — missing/invalid token or a non-parent account always gets
`401 {"error":"parent.err.invalid","retryable":false}`, resolved BEFORE the
body is read. Path params (`:id` = student profile id unless stated, `:pkg` =
olympiad package id, cancel's `:id` = subscription id) must be UUIDs → else
400. Ownership of every client-supplied id is re-verified server-side →
`403 *.notYourChild`. Payment-mode / free-access gates → `409 gate.*`
(`gate.paymentsOff` | `gate.giveawayFree` | `gate.freeAccess`; same resolution
order as the web — the per-child probe is the caller-scoped
`is_child_free_access_active` RPC via the bearer token). Unexpected failure →
`500 {"error":"<domain generic key>","retryable":true}`. JSON body cap 4096
bytes. Each endpoint wraps the SAME core the web server action delegates to —
validation order, caps, RPCs and side-effects (notifications, revalidation)
are identical to the web.

## POST /api/mobile/v1/children  (added M2)

Add a child (web `addChild` parity via `createChild`): names trimmed/capped at
80, district/school/grade MANDATORY UUIDs, password ≥8 chars; atomic
`create_child_account` RPC with saga cleanup. Batch H: NO login ID yet — it is
allocated on subscribe (or activate-free).

Request: `{"first_name","last_name","grade_id","district_id","city_district_id"?,
"school_id","city"?,"school_name"?,"class_grade"?,"password"}`

Round 21: `city_district_id` (intra-city rayon, from the public-readable
`city_districts` table) is REQUIRED by the server whenever the chosen city
(`district_id` — naming trap: that field is the CITY) has active rayons; the
failure maps to `addchild.err.districtRequired`. The M3.1 wizard must add the
District select between City and School.

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"student_profile_id":"<uuid>"}}` |
| 400 | `{"error":"<first key>","retryable":false,"errors":[...]}` — all keys: `auth.child.err.firstNameRequired\|lastNameRequired\|nameTooLong\|passwordTooShort`, `addchild.err.cityRequired\|schoolRequired\|gradeRequired`, `auth.child.err.createFailed` |
| 500 | `{"error":"auth.child.err.createFailed","retryable":true}` |

## POST /api/mobile/v1/children/:id/quote  (added M2)

Server-side price preview (web `quoteSubscription` parity): authoritative
`quote_child_subscription` RPC — sibling discount is never computed
client-side. Read-only; no payment-mode gate.

Request: `{"interval":"week"|"month"|"year","subject_ids":["<uuid>",...]}` (1–20 subjects)

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"base","discount_percent","discount","total","trial_days","currency"}}` |
| 400 | `{"error":"sub.err.invalid"\|"sub.err.noSubjects"\|"sub.err.failed","retryable":false}` |
| 403 | `{"error":"sub.err.notYourChild","retryable":false}` |
| 500 | `{"error":"sub.err.failed","retryable":true}` |

## POST /api/mobile/v1/children/:id/subscribe  (added M2)

Start a subscription (web `subscribeChild` parity): payment gate FIRST, then
validation → ownership → `create_child_subscription` RPC (server-computed
price/discount/trial) → allocates the deferred 8-digit login ID + sets the
child's synthetic auth email. `child_unique_id` is revealed HERE (null when a
previous plan already allocated it) — show it to the parent once.

Request: `{"interval":"week"|"month"|"year","subject_ids":["<uuid>",...]}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"child_unique_id":"12345678"\|null,"base","discount_percent","discount","total","trial_days","currency"}}` |
| 400 | `{"error":"sub.err.invalid"\|"sub.err.noSubjects"\|"sub.err.failed"\|"sub.err.idFailed","retryable":false}` |
| 403 | `{"error":"sub.err.notYourChild","retryable":false}` |
| 409 | `{"error":"gate.paymentsOff"\|"gate.giveawayFree"\|"gate.freeAccess","retryable":false}` |
| 500 | `{"error":"sub.err.failed","retryable":true}` |

## POST /api/mobile/v1/children/:id/subjects  (added M2)

Batch subject edit (web `updateSubscriptionSubjectsAction` parity): post the
DESIRED full set; the server diffs against the live subscription and applies
adds/removes via the re-pricing RPCs (≥1 subject must remain; additions first
so coverage never drops to 0). Server semantics identical to the web — in
REAL payment mode the mobile CLIENT enforces its read-only posture; the
server-side gate handles modes as usual. `interval` is accepted and ignored.

Request: `{"subject_ids":["<uuid>",...],"interval"?}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"added":n,"removed":n}}` |
| 400 | `{"error":"sub.err.invalid"\|"subjedit.minOne"\|"subjedit.err.addFailed"\|"subjedit.err.removeFailed","retryable":false}` |
| 403 | `{"error":"sub.err.notYourChild","retryable":false}` |
| 409 | `{"error":"gate.paymentsOff"\|"gate.giveawayFree"\|"gate.freeAccess","retryable":false}` |
| 500 | `{"error":"sub.err.failed","retryable":true}` |

## POST /api/mobile/v1/children/:id/activate-free  (added M2)

Activate a child during a FREE window (web `activateChildGiveaway` parity):
only while the global giveaway is running OR an active per-child free-access
interval covers THIS child (server-verified). `activate_child_login_id`
allocates the 8-digit ID with NO subscription row — access comes from the
server-side override. No request body.

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"child_unique_id":"12345678"\|null}}` — null if already allocated |
| 400 | `{"error":"sub.err.invalid","retryable":false}` — bad id OR no free window is active |
| 400 | `{"error":"sub.err.idFailed","retryable":false}` |
| 403 | `{"error":"sub.err.notYourChild","retryable":false}` |
| 500 | `{"error":"sub.err.failed","retryable":true}` |

## POST /api/mobile/v1/children/:id/edit  (added M2)

Edit a child's human-facing info (web `updateChildProfile` parity): ownership
re-verified, same caps (names 80, school 160, class 40, city 120), same
`validateChildInfo` rules (district/school/grade mandatory UUIDs). Internal
identifiers (child_unique_id, profile ids) are never editable.

Request: `{"first_name","last_name","grade_id","district_id","city_district_id"?,
"school_id","city"?,"school_name"?,"class_grade"?}`

Round 21: same `city_district_id` rule as POST /children (required when the
city has active rayons; guard-checked against the school's rayon).

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"updated":true}}` |
| 400 | `{"error":"childedit.err.generic","retryable":false}` OR validation `{"error":"<first key>","retryable":false,"errors":[...]}` (same keys as /children) |
| 403 | `{"error":"childedit.err.notYourChild","retryable":false}` |
| 500 | `{"error":"childedit.err.generic","retryable":true}` |

## POST /api/mobile/v1/children/:id/reset-password  (added M2)

Parent resets the child's password (web `resetChildPasswordAction` parity via
`resetChildPassword`): ownership (creator or active link), min 8 chars, and
the password ≠ the child's 8-digit ID. Never logged.

Request: `{"password":"..."}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"updated":true}}` |
| 400 | `{"error":"auth.child.err.childNotFound"\|"auth.child.err.passwordTooShort"\|"auth.child.err.passwordEqualsId"\|"auth.child.err.updateFailed","retryable":false}` |
| 403 | `{"error":"auth.child.err.notYourChild","retryable":false}` |
| 500 | `{"error":"auth.child.err.updateFailed","retryable":true}` |

## POST /api/mobile/v1/subscriptions/:id/cancel  (added M2)

Cancel a live subscription (web `cancelChildSubscription` parity). `:id` =
subscription id. The subscription is re-verified to belong to the posted
child and be cancelable (trialing/active/past_due). Access is KEPT until the
current period end (an already-expired period downgrades immediately); the
parent gets the idempotent in-app notification.

Request: `{"student_id":"<uuid>","reason"?}` (reason capped at 60, demo UX only)

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"canceled":true}}` |
| 400 | `{"error":"sub.err.invalid"\|"cancel.err","retryable":false}` |
| 403 | `{"error":"sub.err.notYourChild","retryable":false}` |
| 500 | `{"error":"cancel.err","retryable":true}` |

## POST /api/mobile/v1/olympiads/:pkg/purchase  (added M2)

Buy an olympiad package for a child (web `purchaseOlympiadForChild` parity):
gates `olympiad_module` + payment mode (only 'off' blocks — giveaway windows
cover free SUBJECT access only, packages sell at full price), ownership +
active-package re-verified, admin-defined price read server-side, MOCK
payment seam, then the `purchase_olympiad` RPC. Lifetime access.

An optional `Idempotency-Key` header is accepted for retry ergonomics, but
the real guarantee is server-side: `purchase_olympiad` is idempotent per
(child, package) — a re-purchase or a concurrent race returns
`"already":true` instead of double-charging.

Request: `{"student_profile_id":"<uuid>"}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"already":false}}` — purchased now |
| 200 | `{"ok":true,"data":{"already":true}}` — child already owned the package |
| 400 | `{"error":"poly.err.generic","retryable":false}` — bad ids, module off, not your child, or package not purchasable |
| 409 | `{"error":"gate.paymentsOff","retryable":false}` |
| 500 | `{"error":"poly.err.generic","retryable":true}` |

## POST /api/mobile/v1/profile/avatar  (added M2; changed M3 — see the M3 section: now also accepts STUDENT bearers)

Parent avatar set/remove (web `setOwnAvatar`/`removeOwnAvatar` parity). The
upload runs on the BEARER client — Storage owner-write semantics
(`storage.objects.owner = auth.uid()`), public `profile-avatars` bucket under
`{auth_user_id}/…`, `media_assets` metadata row + `profiles.avatar_media_id`
link, all under the user's own RLS (no service role). ≤2MB; type comes from
magic-byte sniffing (png/jpeg/webp/gif — SVG banned), never the declared mime.

Request (set): `multipart/form-data` with field `file`.
Request (remove): JSON `{"remove":true}`.

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"url":"<public url>"}}` (set) / `{"ok":true,"data":{"removed":true}}` (remove) |
| 400 | `{"error":"profile.err.uploadFailed"\|"profile.err.fileType"\|"profile.err.fileTooLarge"\|"profile.err.updateFailed","retryable":false}` |
| 500 | `{"error":"profile.err.updateFailed","retryable":true}` |

## POST /api/mobile/v1/account/delete  (added M2)

DANGER ZONE — self-serve account deletion (web `deleteParentAccount` parity):
deletes the parent's children (auth users → cascade
students/credentials/links) then the parent auth user (cascades
profile/parents/links). Irreversible. The body MUST be `{"confirm":true}` — a
bare POST never deletes. On success the app must drop its stored tokens (they
stop verifying server-side immediately).

Request: `{"confirm":true}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{"deleted":true}}` |
| 400 | `{"error":"parent.err.required","retryable":false}` — missing confirmation |
| 500 | `{"error":"profile.err.updateFailed","retryable":true}` |

## M3 conventions — STUDENT (child) session endpoints

Added M3. Student-capable endpoints require `Authorization: Bearer <supabase
access_token>` of a STUDENT account (minted by /auth/child-login); the shared
/profile/avatar endpoint accepts a parent OR a student token. A missing/invalid
token — or a token of any other role (a parent posting to a student-only
endpoint included) — always gets the SAME generic M2 envelope
`401 {"error":"parent.err.invalid","retryable":false}` (one 401 key app-wide,
no role disambiguation), resolved BEFORE the body is read. All writes run on
the BEARER client under the child's OWN RLS — the BFF wraps the same cores the
web child actions delegate to; no service role in any student flow. JSON body
cap 4096 bytes.

Direct-RLS student surfaces (NO BFF endpoint — the app writes these with the
child JWT via supabase-js, exactly like the web child pages do with the
child's session client):

- **Palette** (web `selectPalette`): `update public.students set palette
  where profile_id = <own profile id>` — allowed by the `students_write`
  self-row policy (`profile_id = current_profile_id()`). Slugs
  `sky|bubblegum|mint|sunset|rainbow` or `null` = default; the DB CHECK
  `students_palette_chk` is the server-side whitelist.
- **Sticker theme** (web `selectStickerTheme`/`clearStickerTheme`):
  upsert `{student_profile_id: <own>, theme_id}` into
  `public.child_sticker_selections` (onConflict `student_profile_id`) /
  delete the own row — the `css_write` policy allows only the own row AND its
  WITH CHECK only accepts ENABLED themes.
- **Password** (web `childChangeOwnPassword`): after client-side validation
  (≥8 chars AND ≠ the child's 8-digit login ID), the only mutation is
  `supabase.auth.updateUser({password})` on the child's own session.

## POST /api/mobile/v1/profile/name  (added M3)

Student updates their OWN first/last name (web `childUpdateOwnName` parity via
`updateChildOwnNameCore`): both names required after trim, capped at 80 chars;
authoritative self-row `students` update (`first_name`, `last_name`) then a
best-effort `profiles.display_name` sync. STUDENT bearers ONLY — parents get
the generic 401.

Request: `{"first_name":"...","last_name":"..."}`

| Status | Body |
|---|---|
| 200 | `{"ok":true,"data":{}}` |
| 400 | `{"error":"profile.err.nameRequired"\|"profile.err.updateFailed","retryable":false}` |
| 401 | `{"error":"parent.err.invalid","retryable":false}` — no/invalid token OR a non-student (e.g. parent) token |
| 500 | `{"error":"profile.err.updateFailed","retryable":true}` |

## POST /api/mobile/v1/profile/avatar  (changed M3 — parent OR student)

Same endpoint, same contract as the M2 entry above, now for BOTH roles: the
student flow is web `setChildOwnAvatar`/`removeChildOwnAvatar` parity through
the SAME shared avatarCore on the caller's own bearer client — multipart field
`file` ≤2MB, type from magic-byte sniffing (png/jpeg/webp/gif — SVG banned),
public `profile-avatars` bucket under `{auth_user_id}/…`, `media_assets`
metadata row + `profiles.avatar_media_id` link; JSON `{"remove":true}` =
unlink only (object/row kept; old avatar objects are never deleted — identical
to both web actions). The role only decides which web routes are revalidated
(parent `/dashboard`, student `/child`). Statuses/bodies/error keys unchanged
from the M2 table.
