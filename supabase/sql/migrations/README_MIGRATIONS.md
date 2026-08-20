# Supabase Migrations README

## Repository Placement and Related Files

- Intended path: `supabase/sql/migrations/README_MIGRATIONS.md`
- Folder: `supabase/sql/migrations/`
- Primary readers: Supabase implementer, Claude Code, database reviewer
- Related files: `supabase/sql/README_DATABASE_VERSIONING_WORKFLOW.md`, `supabase/README_RUN_ORDER.md`, `supabase/markdowns/SUPABASE_SQL_RUN_ORDER.md`
- Scope controlled by this file: incremental SQL migration rules
- Source-of-truth level: derived migration execution guide

## Purpose

This folder stores incremental SQL changes after the canonical root SQL files already exist.

Use this folder for:

- hotfixes
- schema changes
- RLS fixes
- new indexes
- function/trigger updates
- seed updates
- data backfills
- production patches

## Naming

```text
YYYY_MM_DD_NNN_short_description.sql
```

Example:

```text
2026_01_18_001_fix_parent_student_rls.sql
```

## Required Header

Every migration must begin with:

```sql
-- Migration: YYYY_MM_DD_NNN_short_description.sql
-- Purpose:
-- Environment first applied:
-- Related root SQL file(s):
-- Backport status: pending | completed
-- Destructive change: no | yes
-- Rollback notes:
```

## Backport Requirement

After a migration is tested and accepted, update the relevant root SQL file in `supabase/sql/` so the complete database can be rebuilt from scratch.

Example:

- Migration file: `migrations/2026_01_18_001_fix_parent_student_rls.sql`
- Backport target: `010_rls_policies.sql`

Update `STATUS.md` after backporting.

## Production Safety

Do not run untested migrations in production.

Required order:

1. development/staging
2. validation queries
3. backup check
4. production migration
5. production validation
6. `STATUS.md` update

## Never Do This

- Do not leave dashboard-only SQL changes undocumented.
- Do not create random SQL files outside `supabase/sql/`.
- Do not change production first.
- Do not skip backporting.
- Do not run destructive SQL without written approval in `STATUS.md`.

## Migration Log

Older migrations document themselves in their own file headers; this log starts
where it was introduced.

| # | Date | Purpose | Backported into |
|---|------|---------|-----------------|
| 115 | 2026-08-15 | "Report a problem": `question_reports` table, the BEFORE INSERT trigger that derives every context column and enforces the 5/hour + 20/day throttle, the freeze trigger that keeps a filed report immutable, `submit_question_report()`, RLS (reporter reads own / admin reads all and moves status, no delete policy). | `001` (enums), `008` (table), `010` (RLS + policies), `011` (indexes, triggers, RPC, grants), `015` (the olympiad-package FK, which cannot live in `008` — `olympiad_packages` does not exist yet at that point in the run order), `013` (check `103`) |
| 116 | 2026-08-16 | Contact addresses become settings (`contact.info_email` beside the existing `contact.support_email`, both seeded with the real olympiq.ai addresses) plus a platform-wide `bug_reports` feature: table, derive/freeze triggers, `submit_bug_report()`, RLS, three enums, and a Brevo transactional-mail path. **Withdrawn one day later by 117** — see that row before reading this one. | `001`, `008`, `010`, `011`, `012` (the two contact settings, which SURVIVE), `013` (check `104`) |
| 117 | 2026-08-17 | Withdraws `bug_reports` (owner decision: ONE reports section, no email anywhere). Drops the table, its policies/indexes/triggers, `submit_bug_report()` and the three enums that were exclusively its own — `report_platform` is KEPT because `question_reports.platform` shares it, and `012`'s two contact settings are untouched. In its place, question-report triage now tells the reporter: an AFTER UPDATE trigger notifies them in the language they filed in when a report is taken into review, resolved or dismissed, idempotent per (report, status). Also fixes two pre-existing defects on `question_reports`: the freeze trigger was reverting its own `on delete set null` cascade into a dangling reporter id, and `qreports_select` let a reporter read `admin_note`/`handled_by` through PostgREST column selection. | `001` (enums), `008` (table), `010` (`qreports_select` now admin-only), `011` (notifier + freeze carve-out), `013` (check `104` rewritten as `104_bug_reports_withdrawn`) |
| 118 | 2026-08-17 | Retires PRORATION and the single shared renewal date per child (owner decision reversing an earlier one): drops `quote_subject_change` and `apply_subject_change`, the two add/remove wrappers that were the last reachable route into that model. Migration `109` had already moved the billing itself — `apply_plan_change` opens each subject's OWN period at `now()` and charges it in full — so nothing about pricing changes here; what changes is that a caller which sends only subject ids can no longer reach a different, prorating RPC. The web app derives the per-subject basket server-side instead (`web-app/src/lib/planBasket.ts`), in one place, and always calls the plan pair. No CASCADE: a dependency must abort the migration loudly. | `007` (ledger comment), `010` (policy comment), `011` (both bodies + their grants removed, `assert_payments_enabled` comment reworded), `013` (checks `78`/`84`/`91`/`95` re-pointed at `apply_plan_change`, new check `105` asserts both wrappers stay GONE) |
| 119 | 2026-08-17 | Makes the question EXPLANATION genuinely trilingual. **No schema change** — `question_explanations` has had per-locale rows, `uq_explanation_locale` and locale-agnostic RLS since `004`; the gap was the write path and the disclosure. (a) BOTH bulk importers nested the `question_explanations` insert INSIDE the `translations->loc->>'body' <> ''` guard, so a row supplying an `en`/`ru` explanation with no body in that locale lost it with **no row and no error** — the guard now wraps the translation row only. The payload contract is unchanged (`translations.<locale>.explanation`), so legacy az-only files and the 2897 live az rows import and behave exactly as before; the fix is purely additive. (b) `get_test_review` resolved reader-locale-then-az correctly but returned one string with no hint which locale produced it — both branches now also emit `explanation_locale` and `explanation_is_fallback`. Additive keys only: `explanation` stays a nullable STRING because the shipped mobile binary casts this payload without validating it and expo-updates cannot cross a runtimeVersion. The server flag is authoritative where the apps' own probe cannot be — SECURITY DEFINER sees an archived question's rows that `qexpl_select` hides, and it reads a legacy daily round's FROZEN `content_snapshot` directly. (c) Adds `ck_qexpl_body_len` (20000) as an abuse ceiling — `NOT VALID`, so legacy rows are never scanned. | `011` (all three function bodies + their revoke/grant lines re-issued verbatim, item-shape comment), `004` (the ceiling, inline+VALID on a fresh build), `013` (new check `106`) |
| 120 | 2026-08-17 | Cancelling a scheduled subject removal becomes an UN-CANCEL, not a purchase. Both plan RPCs used one hand-copied `not exists (… and ss.remove_at is null)` to answer two different questions ("is this on the go-forward plan?" vs "must this be bought?"), so a removal-scheduled subject — still paid for to its own period end — was billed a second full period today and had `current_period_start/end` reset to `now()`, destroying the remaining prepaid time. Replaced by ONE shared classifier `plan_change_states()` returning `covered`/`reinstate`/`add`; a reinstatement clears `remove_at` and nothing else, charges zero, and is logged as `change_type = 'reinstate'` with `prorated_amount = 0`. A LAPSED row is still a true add. Matches the standard un-cancel semantics (Stripe `cancel_at_period_end = false`). | `007` (the change_type CHECK gains 'reinstate'), `011` (classifier + both RPCs), `013` (new check `107`; check `95` re-pointed off the retired `left join public.subscription_subjects ss` anchor) |
| 121 | 2026-08-18 | DELETES the demo payment mode (owner decision). The platform had FOUR modes resolved from three mutually-exclusive feature flags — real (`payments`), demo (`demo_payments`), giveaway (`giveaway_period`), off — and demo was the temporary "cosmetic card form, nothing is charged" stand-in for a payment provider. The flag ROW is deleted; `fn_payment_mode_exclusivity()` now enforces exclusivity over the PAIR and **rejects** any `demo_payments` row on insert (`check_violation`, hint `demo_payments_removed`), with the trigger's WHEN clause routing such a row into the guard REGARDLESS of `enabled` so a disabled row cannot reappear either; both SQL resolvers (`current_payment_mode`, `get_mobile_config`) lose their demo branch. Both are patched from their OWN live definition per the house rule, never retyped. `off` deliberately STAYS — it is the kill switch and the fail-closed fallback, not a payment method — so the surviving modes are real \| giveaway \| off. The migration does NOT enable `giveaway_period` (that stamps `giveaway.started_at` and starts the free-window clock — an owner decision made from /settings), so production legitimately lands in `off`; `giveaway.duration_days` is untouched. | `011` (exclusivity function + trigger, both resolvers, the comment blocks that described a trio), `012` (the `demo_payments` seed row is GONE — a from-zero build that seeded it would now abort on the guard), `013` (check `33` asserts the PAIR, check `57`'s mode whitelist drops `demo`, new check `108`) |
| 122 | 2026-08-19 | The ADMINISTRATOR writes the answer a student receives. Migration `117` gave the reporter a reply loop with FIXED copy — the same sentence for a wrong answer key, a broken image and a misunderstanding — so it answered none of them. Closing a report now carries an admin-written body, stored on the report as the new nullable `question_reports.resolution_message` (CHECK: trimmed, 10..1000; TRIMMED before measuring so ten spaces is not a ten-character answer). New `question_report_reply_text(locale, created_at, body)` is the ONE definition of what is delivered: a generated opening line naming the filing date and time in **Asia/Baku** (`DD.MM.YYYY` / `HH24:MI`), the body, and a generated closing line, joined by BLANK lines, all in the locale the report was filed in (`question_reports.locale`, never the admin's UI). The admin panel's live preview is a pinned TypeScript port of it. Two behaviour reversals, both owner decisions: (a) the send is REQUIRED — a `resolved`/`dismissed` transition with nothing to say RAISES; (b) migration `117`'s `exception when others then raise warning` swallow is REMOVED, so a failed send aborts the transition and the status does not change. A SUPPRESSED notification is not a failure: `create_notification` returning NULL (recipient has in-app notifications off, or the key was already used) commits normally and the reply is still stored. The idempotency key gains an `md5(reply)` discriminator so a CORRECTED answer after a reopen is not deduped against the wrong one. `question_report_freeze` is re-issued for COMMENTS ONLY — `resolution_message` is writable precisely because it is absent from the restore list, and "completing" that list would discard every reply with nothing failing. Deliberately NO table-level `resolved implies a message` CHECK: it would be re-evaluated on the `on delete set null` cascade and make deleting a pre-122 reporter's account fail. | `008` (the column, its CHECK and its comment), `011` (new `question_report_reply_text` + revokes; `notify_question_report_status_tg` rewritten; `question_report_freeze` re-commented), `013` (new check `109`) |
| 123 | 2026-08-19 | Prepares the ledger for the first AzeriCard/ABB transaction on the bank's sandbox terminal. Two changes. (a) NEW partial unique index `uq_checkout_provider_session` on `checkout_sessions (provider, provider_session_id)` — the gateway spec makes the last six digits of a merchant ORDER the system trace audit number and requires them to be unique per terminal per day; we mint `YYYYMMDD` (UTC) + six CSPRNG digits, which leaves only the six digits to chance (~39% odds of at least one collision at a thousand orders a day), and a collision would let the TRTYPE 90 status query for one payment answer about another. "Check then insert" cannot close it — two concurrent requests both see the gap — so the mint loop inserts and retries on SQLSTATE 23505 and the index is what makes that correct. Partial and provider-keyed so providers can never collide with each other's id space. (b) `checkout_sessions.kind` gains `'protocol_test'`: an acquirer integration test is neither a subscription nor an olympiad, and recording it as one would leave a sale nobody can explain in every future reconciliation report. The CHECK is dropped and re-added under its auto-generated name so a from-zero build from `007` and a live database patched here agree. Deliberately NOT in this migration: any entitlement table, grant path, card column or token/recurring column — access must be governed by the provider-agnostic `entitlements` table of `docs/STORE_PAYMENTS_COMPLIANCE.md` §4.1, which is its own piece of work, and the payment layer shipping alongside records money and grants nothing. | `007` (the widened inline `kind` CHECK), `011` (the unique index), `013` (new check `110`) |
