# PRODUCT COMPLETION BACKLOG — what is deferred / not yet implemented

Compiled 2026-07-04 from a full investigation: every STATUS.md deferred registry (Rounds 5–10), the admin "Tezliklə" placeholders, and a CODE-level audit of which schema objects/flows are actually used. This is the single source of truth for remaining work; STATUS.md links here. The mobile master plan builds on ALL of this (its §"Web-parity debt" maps each item).

Legend: 🔴 business-critical before real launch · 🟠 intended module not yet built · 🟡 demo surface to replace · 🔵 platform/ops · ⚪ polish/verify
Status marks (added by the 2026-07-08 verification): ✅ done · ◑ partial · ⬜ not done.

---

## ✅ Verification status — 2026-07-08 (Rounds 11–16 shipped since this backlog was compiled)

Each item below was re-checked against the actual code + dev DB. Summary of the 32 tracked items: **8 done, 8 partial, 14 not done** (+ documented trade-offs). Items marked **✅/◑/⬜** inline reflect this.

**Newly DONE since the 2026-07-04 backlog (9 items advanced):**
- **A2 Access-recompute job** — was "missing entirely"; now `recompute_child_access()` + hourly cron `olympiq_recompute_child_access` (migration 036); trials/subs expire automatically and `past_due` blocks access lazily in the attempt RPCs (035). ✅
- **B2 Real leaderboard** — full engine: append-only points ledger, single-writer trigger, `get_leaderboard`/`get_my_leaderboard_rank`, seasons, child board UI + admin management (migrations 039/041). ✅
- **B4 Notifications center** — full in-app center: producer/broadcast RPCs, bell + parent/child pages, admin composer, event generators, per-channel prefs, retention; email/push architected behind flags (migrations 042/043/044). ✅
- **C3 web-app ESLint** — `.eslintrc.json` added to both apps; `next lint` runs clean non-interactively. ✅
- **C7 Brand rename** — `package.json` names are `olympiq-*`; READMEs say OlympIQ (the AZ word "olimpiada" + `OLIMPIADA_PROD_DB_URL` are deliberately kept). ✅
- **C8 pg_cron (dev)** — 6 jobs live on dev (grade promotion, access recompute, attempt expiry, leaderboard rollover, notification dispatch + prune). Production scheduling remains a deploy-time step. ✅
- **D3 Profiles phone** — `profiles.phone` (E.164 + check) added; parent registration enforces it (migration 025). ✅
- **A3 (partial)** — the *expiry* half of subscription lifecycle is now automated (past_due→expired sweep); charge-at-trial-end / dunning still need a provider. ◑
- **B8 (partial)** — olympiad attempts now reuse the graded test-attempt engine (some results history exists); a dedicated held-event archive + registration lifecycle is still open. ◑

**Still PARTIAL:** A1 payment schema-ready-but-no-provider · A3 (above) · A6 olympiad mock-payment seam · B8 (above) · C5 rate-limiter-yes/MFA-no · G6 filter presets · G7 import queue/dedupe.

**A5 was CLOSED BY DELETION on 2026-08-18** (owner decision), together with the DEMO PAYMENT MODE it belonged to. The fabricated Billing card and invoice history are gone from the parent Subscription page rather than waiting for a provider to replace them, and the platform now has three payment modes — `real` | `giveaway` | `off` — not four. See the A. section below.

**Still NOT DONE (the real remaining backlog):** A4 admin finance monitoring · A7 coupons · B1 Daily Tasks engine · B3 achievements · B5 support intake · B7 question analytics · C1 Vercel deploy · C2 domain+SMTP · C4 JS test framework · C6 error monitoring · D1 schools beyond Bakı · G8 question export · G9 toast system · parent/student idle logout. **The launch-critical cluster is A1 (payment provider + webhook) → then A3/A4/A5 fall out of it.**

---

## A. Payments & subscription lifecycle (the launch blockers)
- 🔴 **Real payment provider + webhook activation.** Schema is provider-agnostic and ready (checkout_sessions, payments, payment_events idempotency); the provider decision is still open. Client-side activation stays forbidden — webhook-verified only.
  - **Since 2026-08-18 there is no stand-in.** The demo payment mode was deleted (migration 121), so the modes are `real` | `giveaway` | `off` and nothing anywhere simulates a charge or collects card data. Production sits in `off` until the owner switches on the giveaway window or the provider lands — which is the honest state, and the one `assert_payments_enabled()` already enforces server-side.
- ✅ **DONE (2026-07-08 verify; migration 036).** ~~🔴 Access-recompute job (missing entirely).~~ `recompute_child_access()` + hourly cron `olympiq_recompute_child_access` now expire ended trials/subs and recompute `students.access_status`; `past_due` is excluded lazily in the attempt-start RPCs (035), so a failed-charge sub blocks access. (Failed-charge *detection* still waits on a real provider — see A3.)
- 🔴 **Trial → paid conversion** (charge at trial end), dunning/past_due handling, launch-promo (~1 month) vs 7-day-trial switchover logic (config exists in `launch_promo_config`; behavior beyond initial trial is not implemented).
- 💳 **WHEN INTEGRATING THE PROVIDER — the per-subject billing model is live end to end; only the CHARGE is missing.** **This bullet was rewritten 2026-08-17: migration 118 RETIRED proration and the single shared renewal date, and migration 120 made an un-cancel free. The previous text described that retired model and would have had the integrator rebuild it.**
  - **Each subject bills on ITS OWN cycle**, from the day it is added. There is no child-wide renewal date and no proration anywhere. `apply_plan_change` writes `current_period_start = now()` and `current_period_end = now() + (7 days | 1 month | 1 year)` per subject row.
  - **ADD** → immediate access + the FULL first period charged today (`quote_plan_change.due_now`). **REMOVE** → no refund ever, access kept until that subject's own `subscription_subjects.remove_at`, recurring rate drops at its own renewal. **REINSTATE** (un-cancel before the period lapses) → charges NOTHING, keeps the period and cycle exactly as they were, logged as `change_type = 'reinstate'` with `prorated_amount = 0`.
  - `public.plan_change_states(subscription, items)` is the SINGLE classifier both RPCs read (`covered | reinstate | add`). Anything that needs to know "must this be bought?" asks it — never re-derive that predicate, which is exactly the drift that caused the double-charge 120 fixed.
  - `quote_plan_change()` is the SINGLE source of the math and `apply_plan_change()` calls it, so a preview can never drift from what is charged (audited invariant H7). **Never accept an amount from a client.**
  - Every change already writes an immutable `public.subscription_changes` ledger row (amount, recurring_before/after, discount %, idempotency_key, and empty `provider`/`provider_payment_id` columns waiting for the PSP).
  - **To wire a provider, do exactly this:** (1) capture `due_now` at the marked `TODO(real-provider)` inside the transaction boundary — note it is ZERO for a reinstatement and for a trial, so a zero amount must be a no-op charge, not an error; (2) write the payment id back onto the ledger rows (`provider`, `provider_payment_id`) and insert the matching `public.payments` row; (3) build the **renewal job** — PER SUBJECT, not per child: it must DELETE `subscription_subjects` rows whose `remove_at` has passed BEFORE invoicing, then charge that subject's own amount and roll ITS `current_period_start/end` forward. Today `current_period_end` is only an access-expiry marker; nothing bills at it.
  - (4) Once renewals exist, also add `(remove_at is null or remove_at > now())` to the subject-access joins in the attempt RPCs — redundant today only because the subscription itself expires at the same instant as `remove_at`.
  - The `p_idempotency_key` replay guard is in place so a retried charge cannot double-apply. It hashes adds, removes, cycles AND reinstatements — extend it, never bypass it, when adding a new kind of change.
  - **ABB / Azericard specifics** (see `docs/STORE_PAYMENTS_COMPLIANCE.md` §8 and `docs/investor/Azericard Sandbox.pdf`): RSA-2048 + SHA-256, hex signature, every MAC field prefixed with its decimal length and an absent field written as `-` (length not counted). Request MAC order: `AMOUNT, CURRENCY, TERMINAL, TRTYPE, TIMESTAMP, NONCE, MERCH_URL`. **The callback MAC covers only `AMOUNT, TERMINAL, APPROVAL, RRN, INT_REF` — `ORDER` is NOT signed, so a valid signature does not prove WHICH order was paid.** Never grant entitlement from the callback: verify the signature, then re-query `TRTYPE=90` for our own ORDER (valid 24h), and only then grant. Store `RRN`/`INT_REF` and reject reuse. Recurring uses `TOKEN_ACTION=REGISTER` + `MERCH_TRAN_STATE='S'` on the first charge (returns a 28-char `TOKEN` + `EXT_NET_REF`), then `MERCH_TRAN_STATE='M'` for merchant-initiated renewals — drive those from OUR per-subject scheduler, not `RECUR_FREQ`, which cannot express a calendar month.
  - **Entitlements table does not exist yet** and `STORE_PAYMENTS_COMPLIANCE.md` §4.1 says build it FIRST: access must read only `entitlements(source ∈ abb_web | apple_iap | google_play | giveaway | manual | school_license)`, with ABB as one producer. Today access reads subscription rows directly — the exact trap that turns "add IAP later" into a rewrite.
- 🔔 **WHEN INTEGRATING THE PROVIDER — wire the `subject_charge_failed` notification.** The template (`notification_templates` code `subject_charge_failed`, az/en/ru) and the whole notification engine are ready; the 4 other dormant templates were wired in Round 29 (personal_best, streak_milestone, subject_expiring, giveaway_ending). Only `subject_charge_failed` was intentionally left dormant because it needs a real failed-charge signal. In the provider's failed-charge webhook handler: after marking the subscription `past_due`, call `create_notification` (service-role) targeting `child_subscriptions.owner_parent_profile_id` with `type='subject_charge_failed'`, `category='billing'`, priority 1 (critical → always reaches the inbox even if the parent muted in-app), `action_url='/subscription'`, idempotency key e.g. `chargefail:<payment_event_id>`. Body per the seeded template ("{{child}} üçün ödəniş uğursuz oldu — giriş bloklandı."). Mirror the Round-29 producers in canonical `011`.
- 🟠 **Admin subscription/payment monitoring** (nav placeholders exist): read-only finance views — subscriptions list w/ status filters, payments/events log, per-family view, refund/cancel ops hooks.
- ✅ **DONE BY DELETION (2026-08-18; migration 121).** ~~🟡 Parent Subscription page Billing + Invoices sections are static demo.~~ The **DEMO PAYMENT MODE IS REMOVED** from the whole platform — the `demo_payments` feature flag row is deleted and the exclusivity trigger now REJECTS its re-insert, `fn_payment_mode_exclusivity` / `current_payment_mode` / `get_mobile_config` resolve `real` | `giveaway` | `off` only, and the cosmetic card sheet (web `DemoPaymentModal`, the Add-Child card fields, mobile `DemoPaySheet`) is gone. `off` deliberately stays: it is the kill switch AND the fail-closed fallback, not a payment method. With it went the fake billing surface — next billing 29/01/2026, MasterCard ****8475, the 2 invoice rows, the inert card buttons and the invoice-email toggle. The Billing panel now prints only the child's REAL per-subject cycles, next charge date and amount (or an empty state), and Invoices shows an honest "none yet". **What a provider still owes this page:** real invoice rows (id/date/amount/status + PDF or e-kassa receipt link) and a payment-method block once a card is actually on file.
- 🟡 **Olympiad purchase payment is a mock seam** (`processOlympiadPayment` in olympiadService.ts — the single plug-in point, by design).
- ⚪ Coupons tables (007) exist and are entirely unused — decide: build promo-code support or explicitly retire.

## B. Learning-product modules intended but not built
- 🟠 **Daily Tasks engine** — schema exists (daily_task_packages/items/student progress, `daily_tasks.manage` permission) and admin nav shows "Gündəlik tapşırıqlar (Tezliklə)", but **zero application code** (no admin CRUD, no student surface, no assignment/scheduling logic). Manageable by Admin + CM per Round-10 decision.
- ✅ **DONE (2026-07-08 verify; migrations 039/041).** ~~🟠 Real leaderboard.~~ Full engine: append-only `student_points_ledger`, single-writer `award_attempt_points` trigger, `get_leaderboard`/`get_my_leaderboard_rank` (global/subject/grade/city/school, month/all-time, privacy-filtered), `leaderboard_seasons` CRUD, monthly rollover cron; real child board UI + admin management + parent per-child view. The `leaderboard` flag stays as the kill-switch (now ON).
- 🟠 **Achievements** — tables exist (achievements, student_achievements), no logic/UI. Design achievement rules or retire.
- ✅ **DONE (2026-07-08 verify; migrations 042/043/044).** ~~🟠 Notifications center.~~ Full in-app center: non-forgeable producer `create_notification` + broadcaster `admin_send_notification`, parent+child bell/inbox with Realtime + toasts, admin composer (audience + multi-parent + rich-text + schedule + history + templates ×3), event generators (olympiad/attempt/subscription/news), per-channel prefs (parent-managed), retention prune. Email + push are architected but OFF behind `notifications_email`/`notifications_push` until an SMTP provider / the mobile app land (the mobile push contract is documented). *(Support/contact intake — B5 — is still separate/not done.)*
- 🟠 **Support/contact intake** — public Contact page is display-only; support tables unused. Decide: contact form → ticket, or keep mailto.
- ⚪ Test packages ("tests" tables + `tests.manage`) — deliberately reduced in Round 10 (Questions cover it); confirm retirement or find a use (e.g., fixed mock exams).
- ⚪ Question analytics table unused — real per-question stats could feed admin content quality later (UniPrep-style "needs review").
- ⚪ Olympiad UX follow-ups: attempt history/results archive for held olympiads; event lifecycle beyond `event_starts_at` (registration windows? held → results publishing) if the owner wants "real event" semantics.

## C. Platform / ops / deployment
- 🔵 **Vercel deployment not connected** (both apps). Includes: prod env vars (incl. `NEXT_PUBLIC_SITE_URL`), CSP verification in prod, HSTS effective, image optimizer behavior in prod.
- 🔵 **Domain (olympiq.ai) + email**: domain not purchased/configured; Supabase Auth SMTP + "Confirm email" enforcement is an OWNER dashboard action (code supports both modes since Round 4/F2); auth-email templates ×3 locales.
- ✅ **DONE (2026-07-08 verify).** ~~🔵 web-app ESLint config missing.~~ `.eslintrc.json` (`next/core-web-vitals`) added to both apps; `next lint` runs clean non-interactively.
- 🔵 **No JS test framework** in web/admin (recorded assumption, Rounds 9–10). Mobile track introduces jest-expo + Maestro; decide whether to backfill Vitest for web/admin.
- 🔵 **Admin MFA + stricter auth rate limiting** (pre-production hardening note since Stage 3); the Round-7 in-memory limiter's serverless caveat → durable store when deploying (documented).
- 🔵 **Error reporting/monitoring**: none in either app (no Sentry). Decide per privacy posture; mobile plan proposes optional sentry-expo behind the same decision.
- ✅ **DONE (2026-07-08 verify).** ~~🔵 Brand rename in `package.json`/READMEs.~~ Package names are `olympiq-web-app`/`olympiq-admin-panel`; READMEs say OlympIQ. (The AZ word "olimpiada" and `OLIMPIADA_PROD_DB_URL` are intentionally kept.)
- ✅ **DONE on dev / 🔵 prod deploy-time (2026-07-08 verify).** 6 cron jobs run on dev (grade promotion, access recompute, attempt expiry, leaderboard rollover, notification dispatch + prune). On production, enable `pg_cron` and run canonical `016` at deploy time (all jobs are backported there).

## D. Data & content
- ⚪ **Schools beyond Bakı** — deliberately deferred until official regional lists are sourced (Round-10 decision; Bakı = 312 verified). Legacy sample rows №6/№20 to archive manually if desired.
- ⚪ Content seeding at scale (questions per subject/grade via bulk import) — operational task, tooling exists.
- ✅ **DONE (2026-07-08 verify; migration 025).** ~~⚪ Profiles have no phone field.~~ `profiles.phone` (E.164 + check constraint) added; parent registration enforces a mandatory, validated phone.

## E. Admin polish (deferred by explicit choice in Round 9/10 gap analyses)
- ⚪ Question JSON **export** (admin-gated + audited — G8), advanced multi-select filter presets (G6), multi-file import queue w/ SHA-256 dedupe + per-type templates (G7), toast system (G9).
- ⚪ Parent-panel idle logout: only the ADMIN panel enforces 30-min idle server-side; web parent/student panels have none (decide if wanted).

## F. Known accepted trade-offs (documented, not bugs)
- Parent login "no account vs wrong password" enumeration UX (owner-requested; mitigated by throttling).
- In-app news intentionally ignores the `news_public` flag (flag governs the PUBLIC site section only).
- View/like counters are manipulable vanity metrics (rate-limited, session-deduped, documented in CLAUDE.md).
