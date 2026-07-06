# OlympIQ — Full Codebase Audit (2026-07-05)

> ## ✅ REMEDIATION — Round 13 (2026-07-06)
>
> **Every Critical/High and all actionable Medium/Low findings below are FIXED** (migrations `2026_07_06_035` + `036` + backports to canonical 001–016; app fixes across both apps). Validation: from-zero rebuild **49/49 PASS**, dev smoke tests, typecheck both apps.
>
> - **Fixed — DB (migration 035):** C2, H1, H2, H3, H4, H5, H6, H7, M12(+RPC guard), M14, M23, M26, L12 (raw-row RLS; the pseudonymized public board RPC lands with the Leaderboard plan), L17.
> - **Fixed — DB (migration 036):** C1 (lazy `current_period_end` checks in the attempt RPCs + hourly `recompute_child_access` pg_cron; trial-once enforced in `create_child_subscription`), M13+L13 (financial FKs → SET NULL, records survive account deletion).
> - **Fixed — web-app:** H8, H9-web, H11-web, M6, M7, M8, M9, M10, M12-listings, M15, M16, M17, M20 (owner: add to nav), M21, M24, M25, L1–L7, L16, L19, L20 (uuid helper + trFirst), L21.
> - **Fixed — admin-panel:** H9-admin, H10, H11, M1, M2, M3, M4, M5, M15, M18, M19, M22, L8, L9 (sanitized at the exposure point), L10, L11, L21.
> - **Owner-ruled:** M11 — olympiad packages STAY purchasable during a free-access window (deliberate; the child plays listed packages free meanwhile). M20 — page added to the public nav.
> - **Still open (tracked):** L14 (launch-promo sequencing — Stage 11 payments), L15 (subject seed set — owner to confirm), `locked` access state wiring (needs the real payment provider; `expired` is fully wired), the two opportunistic L22 leftovers (olympiad covers via plain `<img>`, admin slugify triplication), and the **"Needs live verification" list** (§ below — esp. the in-memory rate limiter on serverless and `NEXT_PUBLIC_SITE_URL` in prod).

**Scope:** `web-app/`, `admin-panel/`, `supabase/sql/` (canonical 001–016 + migrations 029–034), configs, middleware, i18n — the state of the working tree on 2026-07-05 (Round 12.1, uncommitted).
**Method:** six independent read-only review lenses (web security, admin security, SQL/RLS, business logic, architecture/connectivity, performance), findings then hand-verified where marked. Nothing was changed by this audit — this document is the work list.

**Verification legend**
- ✅ **CONFIRMED** — hand-verified in this session (file read / build manifest / grant grep) or independently reported by 2+ lenses.
- ☑ **agent-verified** — the reviewing lens quoted the offending code; not re-checked by hand.
- ❓ **needs verification** — plausible, but requires a live test / owner input before acting.

**Severity counts:** 2 Critical · 11 High · ~24 Medium · ~25 Low.

---

## Executive summary — the 6 things to fix first

1. **Nothing ever expires access** (C1): trials, cancels, admin N-day grants and `past_due`/`locked` are all dead-ends — a trial is lifetime access today. Already flagged as a launch blocker in `PRODUCT_COMPLETION_BACKLOG.md`; this audit confirms there is no expiry path anywhere (no cron, no lazy check, `trial_ends_at` is never read).
2. **`allocate_child_unique_id` is callable by any logged-in (even anon) session** (H1): the only SECURITY DEFINER RPC in `011` with no `revoke` block — it can mutate any child's 8-digit ID registry.
3. **A content_manager can write into paid olympiad question pools** (H2): the bulk-pool RPC's in-body gate accepts `content.create`, bypassing the panel's `requireAdmin`.
4. **Practice scores are forgeable and per-subject payment isn't enforced** (H5+H6+H3): grading counts client-supplied items without attempt-membership/dedup checks, `start_practice_attempt` never checks the subscribed subject, and students can read `answer_options.is_correct` for published questions.
5. **Middleware never runs in either app** (H9): both `middleware.ts` files are at the package root but the apps use `src/` — build manifests confirm `"middleware": {}`. Admin 30-min idle logout and session-cookie refresh are silently disabled. Fix = move the files to `src/middleware.ts`.
6. **Free-olympiad play is broken by a column typo** (H4): `start_olympiad_attempt` filters on `catalog_status` (the enum's *type* name) instead of `status` — the giveaway/free-access olympiad branch raises at runtime.

Suggested batching is at the end of this file.

---

## CRITICAL

### C1. ✅ No subscription/trial expiry exists anywhere — access never ends
- **Where:** `supabase/sql/016_scheduled_jobs.sql` (only grade promotion is scheduled) · `supabase/sql/011_indexes_constraints_functions_triggers.sql:1573` (`access_status in ('trialing','active')`, no date check) · `web-app/src/lib/auth/subscriptionService.ts` cancel action (comments rely on a "daily access-recompute job" that does not exist).
- **Failure:** start a 7-day trial, never pay → `trialing` forever. Cancel mid-period → "access until period end" that never ends. `admin_grant_child_access(p_days)` → every N-day grant is permanent. "Failed charge auto-blocks access" is unimplemented (`past_due`/`locked` are never set by any code).
- **Fix:** lazy date checks inside the attempt/access RPCs (`now()` vs `trial_ends_at`/`current_period_end`) **plus** a pg_cron recompute job flipping stale subscriptions → `expired` and downgrading `students.access_status`. Natural to land with Stage 11 (payments) or as pre-work for the Test-Engine plan.

### C2. ✅ `create_child_subscription` has no live-plan guard and re-grants trials unconditionally
- **Where:** `supabase/sql/011` (`create_child_subscription`) vs `migrations/2026_07_04_025:216` (the admin-grant RPC HAS the guard, commented "same invariant the parent flow relies on") — the parent flow only has a read-time UI check (`children/[id]/subscribe/page.tsx:64`).
- **Failure:** double-click / two tabs / crafted POST → two live `trialing` rows for one child (then `add/remove_subscription_subject` picks "latest", orphaning the older live row, which still skews sibling ranks). And once C1's expiry exists: cancel → re-subscribe → fresh 7-day trial, forever ("trial once" is enforced nowhere).
- **Fix:** in the RPC, refuse creation when a live (`trialing/active/past_due`) subscription exists (copy the admin-grant guard); add a partial unique index `on child_subscriptions(student_profile_id) where status in ('trialing','active','past_due')`; grant `trialing` only if the child has never had a subscription.

---

## HIGH

### H1. ✅ `allocate_child_unique_id` executable by anon/authenticated (SECURITY DEFINER, no revoke)
- **Where:** `supabase/sql/011:277-304` — the only non-trigger DEFINER function in the file with **no** `revoke execute` block; `010:85`'s default-privileges grant makes it executable by `anon`+`authenticated`.
- **Failure:** any session (even anon) that knows/guesses a student UUID can call it via PostgREST and mutate the RLS-protected `child_unique_ids` registry + `students.child_unique_id` for a child it doesn't own.
- **Fix:** `revoke all ... from public, anon, authenticated; grant execute ... to service_role;` (migration + backport to 011) + a new grant-posture check in `013`.

### H2. ✅ Content manager can inject questions into paid olympiad pools
- **Where:** `supabase/sql/011:1906` — `bulk_insert_olympiad_package_questions` gate is `is_admin() OR has_permission('content.create')`; `012:64-70` grants content_manager `content.create`. The panel's `requireAdmin` (`admin-panel/src/lib/admin/olympiad.ts:183`) is bypassable by calling the RPC directly with the CM's session token.
- **Failure:** CM posts to `/rest/v1/rpc/bulk_insert_olympiad_package_questions` with any package UUID → published questions land in an Admin-only paid pool. Violates the non-negotiable CM boundary.
- **Fix:** change the in-body check to `is_admin()` only (migration + backport + 013 check).

### H3. ✅ Students can read `answer_options.is_correct` for published questions
- **Where:** `supabase/sql/004:112` + `010:371` (`aopt_select` allows published rows; base `grant select` covers all columns; acknowledged as deferred in the 010 header).
- **Failure:** a child in an attempt selects `is_correct` for their 25 question ids and answers perfectly. Combined with H5, every practice score is forgeable. This was a known deferral — it stops being acceptable the moment the test engine/leaderboard ships.
- **Fix:** serve options only via the DEFINER RPCs (reads already work this way) and revoke direct column access: either `revoke select` on the table + view without `is_correct`, or column-level grants.

### H4. ✅ `start_olympiad_attempt` references a nonexistent column → free olympiad play errors
- **Where:** `supabase/sql/011:1833` (also `migrations/027:155`, `migrations/033:219`): `where id = p_package_id and catalog_status = 'active'` — the column is `status` (`015:42`); `catalog_status` is only the enum type name.
- **Failure:** during a giveaway or free-access window, the child olympiad tab lists free packages, but Start → `column "catalog_status" does not exist` → bounced to `?err=1`. Advertised free olympiad access has never worked. (Purchasers unaffected — their branch returns earlier.)
- **Fix:** `and status = 'active'` — migration + backport (one line, three copies).

### H5. ✅ `grade_practice_attempt` — score forgery (no dedup / attempt-membership check)
- **Where:** `supabase/sql/011:1700-1721` — the loop iterates the **client** `p_answers` array; `v_score := v_score + 1` fires whenever computed correctness is true, even if the `UPDATE ... where attempt_id and question_id` matched **zero rows** (question not in this attempt) or the same question was already counted.
- **Failure:** submit one known-correct question 25× (or ids answered elsewhere) → 25/25. Poisons results/analytics and the upcoming leaderboard.
- **Fix:** dedupe on `question_id` and derive the score from rows actually updated (`get diagnostics`/`returning`), or grade from `test_attempt_answers` rows only.

### H6. ✅ Practice never checks subject coverage — one paid subject unlocks all subjects
- **Where:** `supabase/sql/011:1565-1577` — the guard checks only `access_status`/giveaway/free-access; `web-app/src/lib/auth/childActions.ts` passes any client `subject_id` through; the child dashboard's subject list is UI-only filtering.
- **Failure:** parent pays for 1 subject; the child session posts another subject's UUID → practices everything. The per-child **per-subject** paid model collapses to per-child.
- **Fix:** in `start_practice_attempt`, unless giveaway/free-access is active, require `p_subject_id ∈ subscription_subjects` of the child's live subscription.

### H7. ☑ Manage-Subjects preview price ≠ charged price (live rank vs frozen discount)
- **Where:** `web-app/src/components/ManageSubjects.tsx:84-107` quotes via `quote_child_subscription` (recomputes sibling rank NOW) but `add/remove_subscription_subject` re-price at the subscription's **stored** `sibling_discount_percent`.
- **Failure:** child A subscribed first (0% stored); sibling B then subscribes; A's parent edits subjects → preview shows −15%, the write stores 0% → charged more than shown at confirmation (reverse when a sibling cancels).
- **Fix:** one rule on both sides — either a quote-for-edit RPC using the stored percent, or recompute rank in the edit RPCs too.

### H8. ☑ A per-parent free-access window dead-ends newly added children (no login ID)
- **Where:** `web-app/src/lib/auth/subscriptionService.ts` (`paidMutationGate` blocks `subscribeChild`) + `AddChildWizard.tsx:239` (the no-subscription ID path `activateChildGiveaway` is reachable only when `mode === "giveaway"`) + `children/[id]/subscribe/page.tsx:102` (free-access renders only a callout, no form).
- **Failure:** admin grants a parent a 1-month window; parent adds a new child → payment step returns `gate.freeAccess`, no 8-digit ID is ever allocated → the child can't log in during the very window meant to be free.
- **Fix:** extend `activateChildGiveaway` (and the wizard branch) to also accept an active free-access interval for that child (`activate_child_login_id` is already the right RPC).

### H9. ✅ Middleware is never registered in either app (files outside `src/`)
- **Where:** `web-app/middleware.ts` + `admin-panel/middleware.ts` at package root; both apps use the `src/` layout; both fresh `.next/server/middleware-manifest.json` files show `"middleware": {}, "sortedMiddleware": []`.
- **Failure:** the admin panel's server-enforced 30-minute idle logout (Round-7 rule) has never run — only the client UX timer remains; Supabase session-cookie refresh via `updateSession` is dead in both apps (server components can't write cookies; refresh only happens through server-action calls). Page/layout guards still protect every route, so this is session-hygiene, not an authz hole.
- **Fix:** move each file to `src/middleware.ts` (tsconfig's `**/*.ts` include is why the root file typechecked cleanly for weeks); then verify at runtime: admin idles out at 30 min, parent sessions survive >1 h of navigation.

### H10. ☑ Admin Accounts page loads every parent unpaginated
- **Where:** `admin-panel/src/app/(protected)/accounts/page.tsx:61-105` — all parent-role rows → `profiles.in(<all ids>)` → `students.in(<all shown>)`, no `.limit()`, every parent rendered as a card.
- **Failure:** guaranteed multi-second page + giant `.in()` querystrings at the stated scale (thousands of parents).
- **Fix:** server-side pagination (range + exact count, like the questions page) + a single joined query for role membership.

### H11. ☑ `getAuthContext()` (admin) and `getParent()/getChild()` (web) are not `cache()`-memoized
- **Where:** `admin-panel/src/lib/admin/guards.ts:27-81` (4 sequential round-trips: getUser → profile → roles → permissions; runs in the layout AND every page) · `web-app/src/lib/auth/session.ts:27-61` (same double-run pattern).
- **Failure:** ~8 queries + 3 auth calls of pure overhead per admin navigation (~200–500 ms serial); 2× auth validations + 4 RPCs per parent/child navigation.
- **Fix:** wrap in React `cache()` (dedupes layout+page in one request); optionally collapse the admin chain into one DEFINER RPC.

---

## MEDIUM

### Security
- **M1.** ☑ CM can **read** olympiad pool questions (incl. correct answers) via `/questions/<id>/edit` — only the list filters `olympiad_package_id is null`; the edit page + `saveQuestion`/`transitionQuestion` never exclude pool rows (writes blocked by RLS, reads are not). Add `.is("olympiad_package_id", null)` for non-admin + re-verify in the actions. (`admin-panel/src/app/(protected)/questions/[id]/edit/page.tsx:20`)
- **M2.** ☑ `saveQuestion` DoS: `opt_count` is unclamped — `opt_count=1e15` spins a formData loop for hours. Clamp to ≤10. (`admin-panel/src/lib/admin/questions.ts:69`)
- **M3.** ☑ `createPanelUser` (creates admins!) writes **no** audit row — the most privileged panel mutation is unattributed. (`admin-panel/src/lib/admin/users.ts:17-90`)
- **M4.** ☑ Admin login has no app-side rate limiter (web-app auth surfaces do). Port `rateLimit.ts` in front of `signInWithPassword`. (`admin-panel/src/app/login/actions.ts:9`)
- **M5.** ☑ Cities/schools/taxonomy mutations (`saveCity/deleteCity/saveSchool/deleteSchool/saveRow/deleteRow`) write no audit rows and the tables carry no audit trigger. (`admin-panel/src/lib/admin/cities.ts`, `schools.ts`, `actions.ts`)
- **M6.** ☑ Child login has no per-attacker throttle: only the per-ID DB lockout; the `ipHash` param is plumbed but **never populated** by any caller. An attacker sprays one password across the 8-digit ID space at ~8 tries/ID/15min with nothing limiting total rate. Populate `ipHash` from headers + add a `rateLimitAllow("childlogin", ...)` gate. (`web-app/src/lib/auth/childActions.ts:14`, `childLoginService.ts:19`)
- **M7.** ☑ Guard-order regression (introduced in Round 12 pass-2 while scoping free-access per child): `addSubjectAction`, `removeSubjectAction`, `cancelChildSubscription`, `updateSubscriptionSubjectsAction` read FormData and run `paidMutationGate()` (service-role reads) **before** `requireParent()`. No mutation bypass (ownership checked before writes), but it violates the authorize-first rule and exposes a pre-auth mode oracle. Reorder: `requireParent()` literally first. (`web-app/src/lib/auth/subscriptionService.ts:175,200,237,298`)

### Business logic / product
- **M8.** ✅ Displayed prices are hardcoded at ~2/6/50 AZN while `subjects_pricing` seeds 1/3/30 AZN — the `/subscription` Plans tab (`subjects.length * p.price`, no discount) and `pricing2.*` marketing copy contradict actual checkout, and admin price edits never reach them. Render from `subjects_pricing` + quoted discount (or register as owner-approved demo in STATUS.md). (`web-app/src/app/(parent)/subscription/page.tsx:64`, `src/i18n/messages.ts` pricing2.*; found independently by 3 lenses)
- **M9.** ☑ Child olympiads tab honors only the giveaway, not free-access intervals (`const freeNow = giveawayActive || getChildFreeAccessActive()` like the dashboard is missing) — after H4's fix, covered children would still see "ask your parent to buy". (`web-app/src/app/child/olympiads/page.tsx:41`)
- **M10.** ☑ Parent dashboard child pills ignore free-access intervals (special-cases giveaway only) — covered child shows "expired"/"inactive" while actually having access. Use per-child `isChildFreeAccessActive`. (`web-app/src/app/(parent)/dashboard/page.tsx:81`)
- **M11.** ❓ **Owner ruling needed:** olympiad purchases stay chargeable during a free-access window (subscriptions are blocked). Defensible (lifetime outlasts the window) but inconsistent with "no paid records during a free window" — decide, then make one consistent gate. (`web-app/src/lib/auth/olympiadService.ts:26,97`)
- **M12.** ☑ No auto-archive of olympiad listings after `event_starts_at` (admin CLAUDE.md says listings auto-archive; today archiving is manual). Lazy-filter or cron. (`admin-panel/src/lib/admin/olympiad.ts:372`, `015:41`)
- **M13.** ☑ Account deletion hard-cascades financial records: child delete cascades `olympiad_purchases` + `child_subscriptions`; parent delete cascades `payments` — vs the non-negotiable "never delete purchase records". Anonymize/soft-delete accounts or re-point financial FKs to restrict + archive. (`web-app/src/lib/auth/parentService.ts:222`, `admin-panel/src/lib/admin/accounts.ts:570-686`, `015:87`, `007:63`)
- **M14.** ☑ `create_child_subscription` sibling-rank read has no serialization — two simultaneous subscribes for two children can both read rank 1 (inconsistent discounts). Low likelihood; fix alongside C2's guard (`for update` on the parent's live subs).

### Architecture / hygiene
- **M15.** ✅ ESLint is dead in both apps: `"lint": "next lint"` + eslint deps but **no config file at all** — the command drops into an interactive prompt (would hang CI). Add `{"extends": "next/core-web-vitals"}` to both. (Also pre-flagged in the backlog for web-app.)
- **M16.** ☑ The removed **Chivo** font is still fetched on two login pages (`(public)/login/page.tsx:29`, `child-login/page.tsx:28`) — zero CSS references it. Drop the `family=Chivo…&` URL segment. ❓ confirm the owner didn't want a Chivo-styled arena login.
- **M17.** ☑ Orphaned code: `web-app/src/components/AddChildForm.tsx`, `ChildLoginForm.tsx`, `LanguageSwitcher.tsx` (zero imports; superseded by AddChildWizard/ArenaLogin/LanguageDropdown) and `web-app/src/lib/supabase/client.ts` (browser client, never imported). Delete.
- **M18.** ☑ Parent-search sanitization has already drifted between its two copies (`accounts.ts:225` strips `[,()]`, `accounts/page.tsx:80` strips `[,()"']`), and the LIKE-escape core is copy-pasted 8× across admin. Extract one `sanitizeSearch()` helper.
- **M19.** ☑ Three divergent image-validation implementations: web-app `imageSniff.ts` (byte-sniffs, png/jpeg/webp/gif), admin `StickerUploader` (byte-sniffs, png/webp), admin `media-verify.ts` (**no byte sniffing** — trusts Storage mimetype + filename regex). All ban SVG, but the admin attach path is weaker than the web-app's. Share one sniffing module.
- **M20.** ❓ **Owner ruling needed:** `/olympiad-preparation` public page has zero inbound links (not in nav/footer). Wire it into the public nav or retire it.

### Performance
- **M21.** ☑ `I18nProvider` (+ `error.tsx`, `ThemeToggle`) imports the **entire trilingual** catalog into the client bundle of every page (~30–50 KB gz of strings for every visitor). Pass the server-resolved locale dict (or needed keys) instead. (`web-app/src/i18n/I18nProvider.tsx:14`)
- **M22.** ☑ `listFreeAccessIntervals()` selects ALL rows forever (expired kept) → unbounded fetch + client payload growth. `.limit(100)` + show-more. (`admin-panel/src/lib/admin/freeAccess.ts:110`)
- **M23.** ☑ `questions` has no `created_at` index (default list order) and no `type_id`/`subtopic_id` indexes (filters) → seq-scan + sort at tens of thousands of questions. Add `(olympiad_package_id, created_at desc)` (or partial where null) + the two filter indexes; migration + backport to 011. (`admin-panel/src/app/(protected)/questions/page.tsx:131` vs `011:94`)
- **M24.** ☑ Child dashboard + layout chain 5–6 independent awaits serially (≈15–20 round-trips per arena navigation with the session double-runs). `Promise.all` the independent reads; combine with H11's `cache()` fix. (`web-app/src/app/child/page.tsx:16-64`, `child/layout.tsx:44-98`)
- **M25.** ☑ The whole public site is fully dynamic — every anonymous landing view re-reads `site_content` + settings + flags through the service-role client; zero `revalidate`/`unstable_cache` anywhere. Wrap the chrome lookups in `unstable_cache(..., { revalidate: 60 })`. (`web-app/src/lib/flags.ts:74`, `src/i18n/server.ts:13`)
- **M26.** ☑ `allocate_child_unique_id` retries 50× (then raises a misleading error) when the child **already has** a registry row — the PK collision and the random-ID collision share one handler. Pre-check and treat an existing mapping as idempotent success. (`supabase/sql/011:296`)

---

## LOW

**Web-app security/logic**
- **L1.** ☑ `updatePassword` (parent action): no limiter, no max length, no role check — a **child** session can call it and set their password equal to their own 8-digit ID, bypassing `childChangeOwnPassword`'s explicit rule. (`web-app/src/lib/auth/parentService.ts:208`)
- **L2.** ☑ `subscribeChild` spreads the raw RPC payload into the client response — leaks internal fields incl. the child's `auth_user_id`. Whitelist the typed fields. (`subscriptionService.ts:108`)
- **L3.** ☑ `toggleNewsLike`: unvalidated `slug` flows into `revalidatePath`; `news_id` not UUID-checked (unlike `registerNewsView`). (`web-app/src/lib/newsActions.ts:28,55`)
- **L4.** ☑ `subscribeChild`/`quoteSubscription` accept unbounded, non-UUID-checked `subjectIds` (sibling action caps at 20 + regex). Mirror it. (`subscriptionService.ts:66,137`)
- **L5.** ☑ CSP: `script-src 'unsafe-inline'` in prod (nonce work pending — documented), and a missing `NEXT_PUBLIC_SUPABASE_URL` at build silently widens img/connect-src to `*.supabase.co`. Throw on missing env instead. (`web-app/next.config.mjs:15,32`)
- **L6.** ☑ Cancel UI excludes `past_due` although the server action cancels them (harmless until C1 makes `past_due` real). (`subscription/page.tsx:273`)
- **L7.** ☑ Practice page passes the RPC payload as `data as any` to `PracticeRunner` — type boundary erased on the largest child-facing object. (`child/practice/[id]/page.tsx:35`)

**Admin-panel**
- **L8.** ☑ `saveRow`/`deleteRow` read FormData (`__slug`) before `authorize()` — contained (slug only picks a guard from an allowlist) but violates guard-first. (`admin-panel/src/lib/admin/actions.ts:85,129`)
- **L9.** ☑ Bulk imports render raw `SQLERRM` per-row errors to the client (internal constraint/table names). Map to friendly codes in the RPCs. (`BulkImportClient.tsx:83`, `OlympiadBulkImport.tsx:94`, `011:836,2015`)
- **L10.** ☑ `updateParent`'s parent-role check fails **open** if the roles lookup misses; `deleteParent` never verifies the target is a parent (an admin could delete another admin's auth user via it). Fail closed + role-check. (`accounts.ts:528,623`)
- **L11.** ☑ Validation-cap gaps: olympiad titles/descriptions uncapped, `createParent` name/email/password uncapped, `resetChildPassword` no max, `idList` in questions.ts unbounded/non-UUID-checked. Apply the news.ts-style MAX constants. (`olympiad.ts:74`, `accounts.ts:52,127`, `questions.ts:330`)

**SQL / product**
- **L12.** ☑ `leaderboard_entries`/periods/snapshots RLS is `using (true)` for authenticated — exposes every student's id + points; the table comment itself calls for pseudonyms. Restrict raw rows; serve boards via a pseudonymized RPC (fold into the Leaderboard plan). (`010:518`)
- **L13.** ☑ `olympiad_purchases.owner_parent_profile_id ... on delete restrict` blocks parent deletion whenever a purchase exists (opaque failure; interacts with M13's policy question). Document or change deliberately. (`015:90`)
- **L14.** ☑ `launch_promo_config` start/end dates are never read; the "launch promo → then trial" sequencing is not implemented (flag gates marketing copy only; trial granted unconditionally). (`007:160`)
- **L15.** ❓ Seeded subjects (`math, az_language, english, informatics`) diverge from the confirmed product set (Math, Science, Məntiq, İngilis dili). Likely owner-accepted evolution — confirm and update either the seed or the product docs. (`012:126`)
- **L16.** ☑ Playable olympiad rows hardcode "25" instead of `questions_per_attempt` (planned cards use the real value). (`child/olympiads/page.tsx:205`)
- **L17.** ☑ `purchase_olympiad` flips a `refunded` purchase back to `active` without updating `amount` (refund semantics undefined). (`011:1783`)
- **L18.** ☑ `child_access_status` value `locked` is never set by any code (dead state — presumably C1's unimplemented auto-block).

**Architecture / performance (small)**
- **L19.** ☑ Dead exports (riskiest kind: privileged actions): `addSubjectAction`/`removeSubjectAction` (superseded by the combined editor), `canTransact`, `canSendEmailNotifications`, `countryByIso2`, `validateChildId`; plus web-app `/unauthorized` page never targeted by web-app guards. Delete/wire.
- **L20.** ☑ Service-role wrapper drift between apps (`getAdminClient` singleton vs `createAdminClient` per-call); UUID regex duplicated ~14×; AZ slugify triplicated in admin; `trFirst` (not override-aware) coexists with `useT()` in the same drawers; news/sticker read queries live in components (no read service); stale middleware comments. Consolidate opportunistically.
- **L21.** ☑ `siteContentRegistry` defaults hand-mirror web-app i18n strings and will silently drift as messages.ts evolves — note the pairing in both files or generate defaults from the catalog.
- **L22.** ☑ `saveQuestion` rewrites options with ~2×N serial inserts (editor lag); `updateSubscriptionSubjectsAction` loops the RPC per subject (bounded ≤20); `isFeatureEnabled`/`getSystemSetting` not `cache()`d; olympiad covers render originals via plain `<img>` (news uses next/image); schools catalogs serialized whole into two client forms (fine at ~300, revisit if nationwide).

---

## Needs live verification (do before/while fixing)

1. ❓ `rateLimit.ts` is in-memory per-instance — on Vercel serverless the counters reset per lambda/cold-start, so the *stated mitigation* for the owner-accepted login-enumeration UX may be near-zero in production. Decide on a shared-store limiter (or accept).
2. ❓ `paymentMode` falls back to `'real'` when the service-role key is unreadable (documented) — fine today (uncharged trials), matters once a real provider lands.
3. ❓ Admin text search resolves up to 2000 translation ids then `.in()`s them — 2000 UUIDs ≈ 75 KB GET querystring may exceed the PostgREST gateway URL limit on broad searches. Verify; safer as a join RPC or cap ~200.
4. ❓ `test_attempt_answers` learner-update grant has no attempt-status predicate — grading freezes score, but confirm no future reader trusts `selected_option_ids` post-grade.
5. ❓ `NEXT_PUBLIC_SITE_URL` must be set in prod — `siteUrl()` falls back to localhost for auth-email redirects.
6. ❓ Storage orphan objects when attach fails post-upload (public buckets) — verify upload policies + consider periodic cleanup.
7. ❓ pg_trgm indexes on `profiles(display_name,email)` will be needed for the ilike searches well before tens of thousands of profiles.
8. ❓ Confirm Vercel and Supabase regions are co-located (all round-trip estimates in the perf findings scale with that RTT).

---

## Known accepted trade-offs (NOT defects — recorded so nobody "fixes" them)

- Parent login distinguishes "no account" vs "wrong password" (owner UX; limiter is the mitigation — see verification item 1).
- Service-role key as a server-only env var in web-app (ADR).
- Demo data in the billing/invoices sections (registered in STATUS.md). The parent analytics dashboard is now real data.
- Child login = 8-digit ID + parent password; IDs visible to parent/admin.
- Fixed sibling discount (no admin module) — verified correctly implemented server-side.
- Dark theme frozen; `olimpiada` repo/env names; `OLIMPIADA_DEV_DB_URL` name.

---

## What was verified SOLID (high-confidence positives)

- **RLS:** every table across 002–008/014/015 has RLS enabled + ≥1 policy (013 asserts it); no over-broad write policy anywhere; sensitive registries (credentials, unique-IDs, payments, settings, free-access) are admin/service-only. The single `using(true)` read exception is L12 (leaderboard).
- **SECURITY DEFINER posture:** every non-trigger DEFINER RPC **except H1** has explicit revokes + targeted grants and pins `search_path`; in-body auth present on all authenticated-callable RPCs (except H2's over-broad gate).
- **Guard-first discipline:** all 52 admin server actions/loaders guard first (sole exceptions: L8); all 22 admin pages re-guard; all web-app parent/child pages + layouts guard (M7's four subscription actions are the only ordering regressions). No ownership bypass found on any client-supplied id in either app.
- **Service-role isolation:** the key is referenced only in `server-only` modules in both apps; no `"use client"` file can reach an admin client.
- **Money paths:** prices/discounts/trials only from server RPCs; the demo card modal is cosmetic; children can never purchase (UI, actions, RPC grants, RLS all agree); olympiad double-purchase blocked; lifetime access FK-protected (`on delete restrict`).
- **Attempts:** both attempt RPCs select 25 random published questions server-side, no difficulty parameter exists anywhere; private pools excluded from practice; `get_practice_attempt` strips `is_correct` from payloads; double-grading blocked (status check).
- **Migrations↔canonical:** migrations 029–034 (and earlier spot-checks) fully backported; no drift found in either direction. 013's 42 checks pass design review (new checks proposed with H1/H2/C2 fixes).
- **i18n:** az/en/ru key sets exactly identical in both apps (820/820/820 web, 717/717/717 admin); zero used-but-undefined keys; every dynamic enum key family fully covered.
- **Headers/uploads/errors:** Round-7 security header set intact in both `next.config.mjs`; verify-after-upload + SVG ban on all admin media paths and byte-sniffing on web avatar paths (M19 notes the admin gap); no raw DB error text returned anywhere except L9.
- **Perf:** hot columns indexed (students/parent, attempts, subscriptions, audit, news, schools, free-access windows); admin lists mostly bounded/paginated; the heaviest child flows are single RPCs; middleware is lean (once it actually runs — H9); request-level `cache()` already used across flags/locale/payment-mode/free-access lookups.
- **Branding:** zero stale "OlimpIQ"; STATUS demo registry current; removed design system left zero references (013 asserts `design.%` = 0).

---

## Suggested fix batches (for planning, not started)

| Batch | Contents | Size |
|---|---|---|
| **1. DB security hotfix** (one migration + backports + 013 checks) | H1 revoke · H2 `is_admin()` gate · H4 `status` typo · H5 grading dedup · H6 subject-coverage check · C2 live-plan guard + partial unique index (+M14 lock, M26 idempotency) | ~1 migration, high value |
| **2. Access lifecycle** (C1 — launch blocker) | lazy expiry in RPCs + pg_cron recompute + `past_due`/`locked` wiring; natural pre-work for the Test-Engine plan / Stage 11 | medium |
| **3. App-layer security** | H9 move middleware to `src/` · M7 guard order · M6 child-login throttle · M2 opt_count clamp · M4 admin limiter · M3+M5 audit rows · L1–L4, L8–L11 | many small fixes |
| **4. Money/display consistency** | H7 quote-for-edit · M8 DB-driven prices · H8 free-access add-child path · M9+M10 free-access display · M11+M20+L15 owner rulings | medium |
| **5. Performance** | H10 accounts pagination · H11 `cache()` guards · M21 i18n bundle · M22–M25 · L22 | medium |
| **6. Hygiene** | M15 ESLint · M16 Chivo · M17 dead code · M18/M19 shared helpers · L19–L21 | low risk, do opportunistically |

*Batch 1 is small, self-contained, and closes every remotely-exploitable hole — recommend doing it before any new feature work. Batch 2 is the known launch blocker. Everything else can interleave with the Test-Engine → Leaderboard → Notifications roadmap.*
