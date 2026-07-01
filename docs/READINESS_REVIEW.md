# Readiness Review — Olimpiada Portal (2026-06-28)

Honest assessment of what's implemented vs. the investor/product plan in
`docs/master/*` and `IMPLEMENTATION_PRIORITY_SUMMARY.md`.

## Verdict

- **Investor demo / MVP core loop: READY.** The full parent→child learning loop works
  end-to-end and both apps build cleanly.
- **Real public launch: NOT YET.** Monetization is stubbed (no real charge), several MVP
  auth flows and admin operational tools are missing, and there's no deployment. These are
  the gaps below.

Think of it as: **the product is built and demoable; it is not yet a business you can take
money with or operate day-to-day.**

---

## ✅ Done & working (validated)

**Accounts/auth**
- Parent registration + login + logout (email/password, server-side).
- Parent-created children; **server-issued, collision-safe 8-digit ID**; child login (ID +
  parent password) with lockout; parent→child auto-link.
- Roles + RBAC (administrator / content-manager / parent / student); **Content-Manager
  boundary** (no News/Olympiad/payment) enforced server-side + in nav.

**Subscriptions**
- Child- + subject-based subscriptions; weekly/monthly/yearly; **7-day trial**;
  **automatic sibling discount** (2nd −15% / 3rd+ −20%) computed server-side; subscribe UI
  with live pricing. (Smoke-tested.)

**Content / admin**
- Taxonomy; full question management + media upload; **bulk import/delete/status/assign-topic**;
  question lifecycle (draft→review→approved→published→archived); News CRUD; Olympiad packages
  + curated pool. All Administrator-gated where required.

**Student learning**
- **Random 25-question** practice (per subject, grade-matched, difficulty never chosen);
  **auto-grading**; results; `is_correct` never exposed before grading.

**Olympiad**
- Admin packages + pool; **parent one-time lifetime purchase**; child "My Olympiads" +
  attempts; never-delete-purchased (archive only).

**Public site + News**
- All public pages (`/`, about, subjects, pricing, olympiad-preparation, faq, contact, news,
  news/[slug], login, register, child-login); published-News read.

**Progress**
- Parent per-child results history + child "Recent results".

**Non-functional**
- **Trilingual az/en/ru** across all UI; content translations supported.
- **Security:** every privileged op is server-side + owner/permission-checked; service-role /
  `content.create` RPCs are not anon/authenticated-executable; **RLS** throughout; **from-zero
  rebuild = 22/22 validation checks**; both apps **build + typecheck clean**.

---

## ❌ Remaining gaps

### A. MVP gaps that block a real launch (should do before going live)
1. **Real payments.** No provider/charge/webhook — subscriptions/olympiad purchases are
   "activated" with **no money taken** (trial/lifetime granted directly). *Docs flag the
   provider + legal + domain as "still open / not this phase," so this is expected-not-ready —
   but you cannot monetize until it's done.*
2. **Failed-charge auto-block + trial/subscription lifecycle automation.** Trials don't
   auto-expire; nothing flips access to `expired`/`locked` over time. Needs a scheduled job +
   the webhook from (1).
3. **Parent password reset** — not built (MVP auth flow per doc 03).
4. **Parent account deletion** — not built (MVP per doc 03; UniPrep has a reference impl).
5. **Email verification for parents** — bypassed (we create the auth user pre-confirmed); fine
   for demo, but real signups should verify email.
6. **Admin operational tooling — none of these exist yet** (admin can manage *content* but not
   *operate the business*):
   - Subscription / payment **monitoring** views.
   - **Parent/child account monitoring** (list parents + their children + 8-digit IDs, reset a
     child password from admin).
   - **Audit-log viewer** (the `audit_logs` table + triggers exist; no UI).
   - **Settings / feature-flags** admin UI.
7. **Test & Daily-Task engine is only partial.** I delivered *ad-hoc random practice*. The plan
   also wants **admin-defined tests** and **scheduled daily-task packages** (tables exist:
   `tests`, `daily_task_packages`) — no admin UI and no daily assignment/scheduling yet.
8. **Content review queue UI.** The lifecycle states + bulk transitions exist, but there's no
   dedicated "Reviews" queue for content-managers→admins (nav shows it as "soon").
9. **Launch 1-month promo** — `launch_promo_config` has the window fields, but only the 7-day
   trial is applied; the promo window isn't used yet.
10. **Add-subjects-later flow** — subscribing creates a fresh subscription each time; there's no
    explicit "add a subject to an existing child subscription (next-cycle pricing)" flow.

### B. Can wait (per `IMPLEMENTATION_PRIORITY_SUMMARY` §3)
- Leaderboard UI (school/rayon/country), in-app notifications, achievements/certificates,
  progress snapshots/streaks aggregation, advanced analytics/exports.

### C. Deployment & quality
- **Vercel deployment** not wired (env + project settings) — needed to actually host it.
- **Automated test suite**: only DB smoke tests inside migrations; no app-level tests
  (CLAUDE.md asks for tests on security-sensitive logic).
- **Design polish:** web-app is intentionally minimal (waiting on the investor "Claude Design");
  admin-panel is clean/functional plain-CSS, not yet a "professional" polished design system.
- **ESLint** isn't configured in either app (`npm run lint` drops into setup); typecheck is the
  gate.

### D. Future-only (correctly NOT built)
- Flutter mobile app, school/partner dashboard, video/live lessons, AI recommendations,
  WhatsApp/Telegram bots, CRM, optional bank transfer, SMS.

---

## Recommendation (suggested order)
1. **Decide the payment provider** → build real checkout + **webhook activation** + failed-charge
   auto-block + trial-expiry job. (Unblocks monetization — the single biggest gap.)
2. **Complete parent auth**: password reset + account deletion (+ optional email verification).
3. **Admin operations**: account/subscription/payment monitoring + audit-log viewer (so you can
   run support and see the business).
4. **Finish the learning engine**: admin-defined tests + scheduled daily tasks (or confirm
   "random practice only" is acceptable for launch).
5. Reviews-queue UI; launch-promo logic; add-subjects-later flow.
6. Then: deployment, design polish (after investor design), tests, leaderboard/notifications.

**Bottom line:** great for an investor demo of the full concept today; ~2–4 focused stages of
work (mostly payments + auth completeness + admin ops + daily-task engine) stand between this
and an operable, money-taking launch.
