# PRODUCT COMPLETION BACKLOG — what is deferred / not yet implemented

Compiled 2026-07-04 from a full investigation: every STATUS.md deferred registry (Rounds 5–10), the admin "Tezliklə" placeholders, and a CODE-level audit of which schema objects/flows are actually used. This is the single source of truth for remaining work; STATUS.md links here. The mobile master plan builds on ALL of this (its §"Web-parity debt" maps each item).

Legend: 🔴 business-critical before real launch · 🟠 intended module not yet built · 🟡 demo surface to replace · 🔵 platform/ops · ⚪ polish/verify

## A. Payments & subscription lifecycle (the launch blockers)
- 🔴 **Real payment provider + webhook activation.** Schema is provider-agnostic and ready (checkout_sessions, payments, payment_events idempotency); the provider decision is still open. Client-side activation stays forbidden — webhook-verified only.
- 🔴 **Access-recompute job (missing entirely).** Cancel-flow comments assume "the daily access-recompute job downgrades access to 'expired' once current_period_end passes" — **no such job exists**. Trials/subscriptions never expire automatically today. Needs a pg_cron daily job (pattern exists: 016) + status/`students.access_status` recompute + failed-charge auto-block once real charges exist.
- 🔴 **Trial → paid conversion** (charge at trial end), dunning/past_due handling, launch-promo (~1 month) vs 7-day-trial switchover logic (config exists in `launch_promo_config`; behavior beyond initial trial is not implemented).
- 🟠 **Admin subscription/payment monitoring** (nav placeholders exist): read-only finance views — subscriptions list w/ status filters, payments/events log, per-family view, refund/cancel ops hooks.
- 🟡 **Parent Subscription page Billing + Invoices sections are static demo** (next billing 29/01/2026, MasterCard ****8475, 2 invoice rows, inert buttons incl. email-notification toggle). Replace with real data when the provider lands; invoice PDFs/email = provider or custom.
- 🟡 **Olympiad purchase payment is a mock seam** (`processOlympiadPayment` in olympiadService.ts — the single plug-in point, by design).
- ⚪ Coupons tables (007) exist and are entirely unused — decide: build promo-code support or explicitly retire.

## B. Learning-product modules intended but not built
- 🟠 **Daily Tasks engine** — schema exists (daily_task_packages/items/student progress, `daily_tasks.manage` permission) and admin nav shows "Gündəlik tapşırıqlar (Tezliklə)", but **zero application code** (no admin CRUD, no student surface, no assignment/scheduling logic). Manageable by Admin + CM per Round-10 decision.
- 🟠 **Real leaderboard.** Student page shows only the child's OWN row + "full board coming soon"; leaderboard_periods/entries/snapshots tables are never populated. Needs: a population job (per period/scope from graded attempts), board query RPC (privacy-respecting via the existing display-names setting), and the flag stays as the kill-switch.
- 🟠 **Achievements** — tables exist (achievements, student_achievements), no logic/UI. Design achievement rules or retire.
- 🟠 **Notifications center** — notifications/support tables (008) unused. `notifications_email` flag is wired to a helper only (**no email sender exists**). Needs: sender infra (provider), templates ×3 locales, per-event triggers (expiry warnings, receipts, news digests?), user prefs; plus the mobile-push sibling (see mobile plan).
- 🟠 **Support/contact intake** — public Contact page is display-only; support tables unused. Decide: contact form → ticket, or keep mailto.
- ⚪ Test packages ("tests" tables + `tests.manage`) — deliberately reduced in Round 10 (Questions cover it); confirm retirement or find a use (e.g., fixed mock exams).
- ⚪ Question analytics table unused — real per-question stats could feed admin content quality later (UniPrep-style "needs review").
- ⚪ Olympiad UX follow-ups: attempt history/results archive for held olympiads; event lifecycle beyond `event_starts_at` (registration windows? held → results publishing) if the owner wants "real event" semantics.

## C. Platform / ops / deployment
- 🔵 **Vercel deployment not connected** (both apps). Includes: prod env vars (incl. `NEXT_PUBLIC_SITE_URL`), CSP verification in prod, HSTS effective, image optimizer behavior in prod.
- 🔵 **Domain (olympiq.ai) + email**: domain not purchased/configured; Supabase Auth SMTP + "Confirm email" enforcement is an OWNER dashboard action (code supports both modes since Round 4/F2); auth-email templates ×3 locales.
- 🔵 **web-app ESLint config missing** (Stage-4 gap; `next lint` prompts interactively). Add flat config aligned with admin panel.
- 🔵 **No JS test framework** in web/admin (recorded assumption, Rounds 9–10). Mobile track introduces jest-expo + Maestro; decide whether to backfill Vitest for web/admin.
- 🔵 **Admin MFA + stricter auth rate limiting** (pre-production hardening note since Stage 3); the Round-7 in-memory limiter's serverless caveat → durable store when deploying (documented).
- 🔵 **Error reporting/monitoring**: none in either app (no Sentry). Decide per privacy posture; mobile plan proposes optional sentry-expo behind the same decision.
- 🔵 Brand rename in `package.json`/READMEs still pending (non-UI; names remain olimpiada-*).
- 🔵 pg_cron jobs on PROD (grade promotion + future recompute) need re-running migrations 016/020 there at deploy time.

## D. Data & content
- ⚪ **Schools beyond Bakı** — deliberately deferred until official regional lists are sourced (Round-10 decision; Bakı = 312 verified). Legacy sample rows №6/№20 to archive manually if desired.
- ⚪ Content seeding at scale (questions per subject/grade via bulk import) — operational task, tooling exists.
- ⚪ Profiles have no phone field (Round-10 accounts search request mentioned phone; schema lacks it) — add column + forms if wanted.

## E. Admin polish (deferred by explicit choice in Round 9/10 gap analyses)
- ⚪ Question JSON **export** (admin-gated + audited — G8), advanced multi-select filter presets (G6), multi-file import queue w/ SHA-256 dedupe + per-type templates (G7), toast system (G9).
- ⚪ Parent-panel idle logout: only the ADMIN panel enforces 30-min idle server-side; web parent/student panels have none (decide if wanted).

## F. Known accepted trade-offs (documented, not bugs)
- Parent login "no account vs wrong password" enumeration UX (owner-requested; mitigated by throttling).
- In-app news intentionally ignores the `news_public` flag (flag governs the PUBLIC site section only).
- View/like counters are manipulable vanity metrics (rate-limited, session-deduped, documented in CLAUDE.md).
