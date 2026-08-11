# Per-Subject Billing Plans & Child Theme Palettes — investor specification

**Source:** `docs/investor/Platform_Per_Subject_Billing_and_Theme_Palettes_Claude_Prompt.docx` (received 2026-08-11).
**Status:** transcribed here verbatim in substance so the requirements are reviewable and diffable. The `.docx` remains the original; this file is the working copy the implementation is checked against.

The investor's closing rule, which governs how every item below is read:

> Treat these requirements as product behavior, not a visual prototype. Update frontend, backend, validation, persistence, and data models together so the experience is reliable after refresh and across sessions.

Anything implemented as frontend-only state fails the specification, regardless of how it looks.

---

## 1. Separate billing plan for each selected subject

The current pricing interface applies one payment cycle to all selected subjects. That is replaced by independent billing configuration per subject — Mathematics weekly, Informatics yearly and Azerbaijani monthly can all be true at the same time.

- Every selected subject supports **Weekly, Monthly, Yearly**.
- There is **no single global "Ödəniş dövrü" control** for the selected set.
- Each selected-subject card shows: subject name, base/current price, selected billing cycle, the calculated price for that cycle, and a remove action.
- Changing one subject's plan must never alter another's.
- The pricing summary lists each subject with its own cycle and price. **If one combined total would mislead because the periods differ, show a breakdown instead of forcing a generic payment period.**
- The selected plan is stored **separately per subject** in the data model and backend logic.

### Example

| Subject | Billing plan | Displayed price |
| --- | --- | --- |
| Riyaziyyat | Həftəlik | weekly calculated price |
| İnformatika | İllik | yearly calculated price |
| Azərbaycan dili | Aylıq | monthly calculated price |

## 2. Selected-subject pricing UI

- Stays easy to scan when several subjects are selected; must remain clean and understandable at **5+ subjects**.
- Strong hierarchy, compact controls, obvious separation between subject name, plan and price.
- A segmented control (`Həftəlik / Aylıq / İllik`) inside each subject card is acceptable.
- Smooth add/remove transitions; prices update immediately with no full-page reload.
- Subtle micro-animations on cycle change — premium and restrained, not distracting.

## 3. Child profile colour palettes

- Under **Profilim**, offer **more than 20** professionally designed palettes.
- Suggested set: Ocean Blue, Royal Indigo, Violet Dream, Lavender, Sakura, Coral, Sunset Orange, Amber, Emerald, Mint, Forest, Aqua, Cyan, Arctic, Sky, Navy, Graphite, Rose, Peach, Lime, Teal, Berry, Sand, Aurora — plus more if useful.
- Each palette defines a **complete UI theme**, not one accent colour: page background, cards, borders, primary and secondary accents, buttons, active navigation, text hierarchy, hover states, focus states.
- Every palette maintains good readability and sufficient contrast.

## 4. Palettes ↔ Dark Mode (bug)

Current behaviour is wrong: selecting a palette while Dark Mode is active leaves the interface dark, and the palette only appears after returning to Light Mode.

Required:

- Selecting any custom palette **automatically disables Dark Mode** and applies the palette immediately.
  Flow: Dark Mode on → Profilim → Rəng paleti → Aurora → Dark Mode turns off → Aurora applies instantly across the child interface.
- The palette **persists** across refresh, navigation, logout/login and future sessions.
- Enabling Dark Mode later **may** temporarily override the palette, but must **not delete or reset** it. Turning Dark Mode off restores the saved palette automatically.
- Model these as **two separate preferences**: `selectedPalette` and `darkModeEnabled`. Selecting a palette sets `selectedPalette` and sets `darkModeEnabled = false`.

## 5. Palette picker UI

- Not a long, messy list — a polished responsive grid.
- Each option may show the palette name, 3–5 colour-preview circles, a miniature UI preview, and a clear selected state.
- Smooth hover and selection animations; an elegant border/check indicator on the active palette.
- Optionally grouped into categories: Bright, Calm, Nature, Pastel, Bold, Neutral.
- Playful enough for a child profile while still reading as a professional commercial product.

## 6. Persistence, state and edge cases

Update state management, preference storage, pricing calculations, validation, APIs and persistence so behaviour survives refreshes and future sessions. Edge cases that must be handled explicitly:

- removing a subject, changing its plan, adding it back
- switching plans repeatedly
- rapidly switching themes
- toggling Dark Mode after selecting a palette
- restoring saved preferences after login

UI state and backend state stay synchronised at all times. No stale totals, race conditions, duplicate selections or inconsistent theme rendering.

## 7. Design quality

- Keep the existing visual identity; increase clarity, spacing consistency, hierarchy and perceived polish.
- Professional loading states and micro-interactions, without distracting motion.
- Every control has clear hover, focus, disabled, selected and loading states.
- Responsive and comfortable on desktop and smaller screens.
- Prioritise accessibility, readable typography, contrast, keyboard focus visibility and predictable interaction.

---

## Implementation notes (added by the implementation round, 2026-08-11)

Two constraints from this repository that shape how §1 and §4 can be satisfied:

- **§1 needs a schema change.** `child_subscriptions.interval` is a single value covering the whole subscription, and `subscription_subjects` carries no interval at all
  (`supabase/sql/007_subscriptions_payments_coupons.sql`). "Stored separately per subject" therefore means the interval moves onto `subscription_subjects`. The consequence the
  spec does not address is the renewal period: a weekly subject and a yearly subject cannot share one `current_period_end`, so the period model has to be decided explicitly
  rather than inherited.
- **§4's two preferences live in two different places today.** `selectedPalette` is server-persisted (`students.palette`), while dark mode is client-only — `localStorage["theme"]`
  plus `data-theme` on `<html>`, applied by the no-flash script in `web-app/src/app/layout.tsx`. The investor's "persists across future sessions" is only literally true for the
  palette unless `darkModeEnabled` also moves server-side; the trade-off is recorded with the implementation.

Neither note changes the requirements — they record where the work had to make a decision the specification left open.

### §1 decisions taken when the per-subject billing landed (migration 109, 2026-08-11)

- **Per-subject intervals required per-subject PERIODS.** An interval alone could not be honoured: a weekly and a yearly subject cannot share one renewal date. So
  `subscription_subjects` gained `interval`, `pending_interval`, `current_period_start`, `current_period_end`, `price_amount` and `currency`, all nullable and backfilled once, so
  every existing row and every existing caller kept working.
- **`child_subscriptions` was redefined, not replaced.** `interval` is now the DEFAULT cycle for newly added subjects (and the fallback for a legacy `NULL`);
  `current_period_end` is the **MAX** of the subject period ends — "coverage ends" — and a new `next_renewal_at` is the **MIN** — "next charge"; `base/discount/total_amount` are
  the **next invoice**. MAX, not MIN, is what keeps a lapsing weekly subject from expiring a paid yearly one. All five are written by one trigger.
- **Mid-cycle proration for ADDITIONS was retired.** With per-subject periods there is no shared period to prorate into: a newly added subject opens its own full cycle at
  `now()` and is charged the full first-cycle price — and receives that full cycle. Removals are unchanged (no refund, access to that subject's own period end).
- **Changing an already-paid subject's cycle is SCHEDULED,** into `pending_interval`, applying at that subject's own renewal — in both directions. No refund, no surprise charge,
  and no second charge path to review.
- **Pre-purchase basket persistence has a documented limit.** A basket built on the signed-out /services page has no owner, so it round-trips through the URL
  (`?plan=<uuid>:week,…`) and survives refresh, navigation and the register → add-child hand-off. Once a child exists the plan is DB-authoritative and survives logout/login and
  future sessions, which is the case §6 actually cares about. A cross-session anonymous draft would need a new `plan_drafts` table and was left out of scope.
