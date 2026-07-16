# OlympIQ Mobile — UI/UX Redesign Plan (M3.2, 2026-07-14)

> **SHIPPED (Round 22).** This plan was executed in full. **Round 23 then
> superseded parts of §3:** the final onboarding slide offers **Log in +
> Register ONLY** (no student-login CTA, no public info links) and Login
> carries a single Register link — the "OlympIQ haqqında" replay link, footer
> links and gallery button were removed. §6's out-of-pass items: maintenance
> short-cadence refetch is now part of the M3.1 tail; the public top-10 idea
> is DROPPED (see the execution plan's M3.1 section).

Owner mandate (Round 22): the shipped M1–M3 app works but looks plain — redesign
every screen to a modern, eye-catching, senior-grade standard. Colors and
component placement follow the WEB APP (Energetic light `#7c3aed`+`#ff8a00` on
cream `#fffbf5`; dark = owner's reference; the 5 arena palettes for students).
The Welcome/onboarding screen shows **once per install** — never again after
login/registration. Android is the owner's test device; every change ships
iOS-correct in the same pass.

This plan is the single control surface for the redesign. The M3.1 parity items
(master plan §7.2c/§7.2d) that touch redesigned screens are FOLDED IN — we do
not restyle a screen today and rebuild it for parity tomorrow.

---

## 1. Design language — "Energetic Mobile"

The web app's identity, translated to native idioms:

- **Gradient as a brand moment, not wallpaper.** The purple→orange
  `BRAND_GRADIENT` appears deliberately: onboarding hero shapes, ONE primary
  CTA per screen, active step indicators, progress fills, the rank ring. Never
  on body surfaces.
- **Layered surfaces.** bg → surface (cards) → chip/inset, separated by the
  existing token borders + a unified cross-platform shadow (see §2). Radii from
  the web scale: cards `radius.lg (18)`, sheets/heroes `radius.xl (22)`, chips
  full-round.
- **Type hierarchy, system font kept** (Azerbaijani ə-safe rule — NO custom
  fonts). New display tiers for hero numbers/titles (32/40 tight, weight 800),
  clearer label tier (12/16, weight 600, +0.4 letterSpacing, muted). Numbers
  stay mono/tabular.
- **One icon language: `lucide-react-native`** (new dep — justified: coherent
  modern stroke-icon set on top of the already-installed react-native-svg;
  maintained; tree-shakeable). Replaces the hand-rolled TabIcon set, emoji
  glyphs (except the 🔥 streak flame, which stays — it is brand vocabulary),
  and ad-hoc SVGs. Stroke 2, sizes 18/22/26.
- **Micro-motion, subtle and native-driven** (reanimated already installed):
  pressed-scale 0.97 on all buttons/cards, 150ms fade+4px-rise on list mount,
  animated progress bars/rings, layout-animated tab pill. No parallax, no
  scroll-jank; every animation `useNativeDriver`-safe.
- **Dark + arena palettes preserved.** Everything token-driven; the redesign
  adds tokens, never bypasses them. Contrast ≥ WCAG AA in both themes.

## 2. Foundation upgrades (theme + primitives)

`src/theme/tokens.ts` additions (additive — nothing renamed):
- `display` type tier + `weight` map; `shadowCard`/`shadowFloat` presets
  consumed via a new `shadow(level, tokens)` helper that emits
  `elevation` (Android) + `shadow*` (iOS) together — the ONLY sanctioned way to
  cast shadows.
- `gradient` exposed in tokens (light/dark variants of BRAND_GRADIENT).

`src/components/` upgrades:
- **Button** — pressed-scale + `android_ripple`; new `gradient` variant (the
  one-per-screen primary CTA); icon slot.
- **Card** — `flat | raised | hero` variants; `raised` = shadowCard.
- **NEW `Avatar`** — initials from first/last name on a per-user pastel
  (deterministic from profileId) + `expo-image` when an avatar exists. Kills
  the `•` placeholder in `HeaderAvatarButton`.
- **NEW `ListRow`** — icon + title/sub + trailing chevron/value/switch; the
  standard for profile/settings/notification rows.
- **NEW `StepDots`** — wizard/onboarding progress (animated active pill).
- **NEW `ProgressRing`** — SVG ring with animated sweep (result score, rank).
- **NEW `SectionHeader`** — eyebrow label + optional trailing action.
- **NEW `AppTabBar`** — custom `tabBar` for both stacks: solid surface, top
  hairline, safe-area padded; active tab = filled lucide icon inside a soft
  accent pill + label; inactive = outline icon, muted. Parent uses
  accent/purple; student uses the arena palette (lime pill on dark).
- **Segmented / chips / pills / StatusViews / SelectField** — restyled to the
  new radii/spacing/shadow standard; `EmptyState` gets a lucide glyph + one
  action slot.
- **Gallery** (`/gallery`) updated to showcase every new/changed primitive.

i18n: `npm run sync-i18n` FIRST (pulls the Round-20/21 web keys — readiness,
district, plb.* — into `messages.generated.ts`); mobile-only additions live in
`messages.mobile.ts` (az/en/ru, natural phrasing).

## 3. Welcome → onboarding, shown ONCE per install

- New signed-out flow: **3-slide onboarding** (vector/gradient hero shapes, no
  binary assets): ① daily rounds + real rating (arena imagery), ② olympiads &
  lifetime access, ③ parent-controlled safety (subscriptions, no child
  purchases). `StepDots`, swipe + "Keç" (skip), final slide = auth CTAs
  (parent login / student login / register) + the public info links.
- **`olympiq.seenWelcome` SecureStore flag** (same pattern as
  `olympiq.theme`/`olympiq.locale`), hydrated in the boot path. Set the moment
  the user leaves onboarding (skip, CTA, or slide-complete).
- Routing: signed-out + flag set → `/(public)/login` directly (never the
  onboarding again — including after logout). Login keeps a subtle
  "OlympIQ haqqında" link that reopens the onboarding manually, plus the
  footer links (Pricing/About/FAQ/Contact/News) so nothing becomes
  unreachable.
- Login/Register restyle: brand header (BrandMark), card-grouped fields,
  Segmented parent|student kept, gradient primary CTA, inline verify-email
  state restyled as a success card.

## 4. Per-screen specs

### Public
- **Pricing** — highlight the popular interval (gradient border chip "Populyar"),
  per-subject rows with lucide subject icons, disclaimer as muted footnote.
- **About/FAQ/Contact** — content cards; FAQ becomes expandable accordions
  (LayoutAnimation); contact rows = `ListRow` with mail/phone icons.
- **News (public + both apps)** — image-led cards: cover (expo-image, 16:9,
  radius.lg) + category chip + date; article view with proper type scale and
  hero image.

### Parent
- **Home** — greeting header ("Salam, {name}" + Avatar) replacing the default
  nav title; children as rich cards (Avatar initials, mono ID, color-coded
  access Pill, leaderboard chip, two quick actions); Add-Child as a gradient
  hero card when no children / a compact CTA otherwise; carousel restyled.
- **Analytics** — `ChildChips` → Avatar chips; each chart in a `raised` Card
  with `SectionHeader` + legend; consistent empty/loading states.
- **Olympiads (tab)** — cover cards with a bottom gradient scrim (title/price
  chip on image), owned section with attempt state; **question counts = the
  REAL pool count** (fed by `features/olympiads/data.ts` — §6.1). Detail sheet
  restyled (grab handle, KeyRows with icons, gradient buy CTA).
- **Subscription** — active plan card with gradient border, plan rows,
  `ManageSubjectsEditor`/`CancelSheet` restyled; demo Billing/Invoices keep
  their demo data (owner-approved) but adopt the new visual system.
- **Notifications (shared parent+student)** — date-grouped list, unread dot +
  weight, category chips, `ListRow`-based rows, detail sheet restyled,
  mark-all-read as header action.
- **Profile** — `ListRow` sections with lucide icons (identity card up top with
  Avatar + edit), notification `PrefRow` switches, danger zone in a bordered
  red-tinted card.
- **Add-Child wizard** — `StepDots` progress, one clear section per step,
  **NEW District (rayon) step-field between City and School** (M3.1 §7.2d.14:
  `city_districts` public read; required when the city has active rayons;
  filters schools incl. NULL-rayon ones; posts `city_district_id` — the BFF
  already accepts it), summary card before submit, success screen with the
  next-step note.
- **Child edit** — same field system + district preselection.

### Student (arena — palette-aware everywhere)
- **Arena home** — **adopt the Round-21 web layout** (§7.2d.13): hero (welcome
  + today CTA) with the rank panel showing the REAL all-time global rank in a
  `ProgressRing`-framed number; MiniStat row; monthly quick-look + subject
  strengths side-stacked; recent rounds; NO Today's-Rounds mirror and NO news
  panel (news has its own tab). Streak at-risk note kept.
- **Tests** — subject cards with **readiness states** via
  `get_my_round_readiness` (§7.2d.12): ready → gradient Start; attempted →
  check pill + result link; not-ready → muted "raund hazır deyil" pill;
  Previous-day replays + practice entry rows; continue card on top; history
  with status pills.
- **Runner** — visual-only restyle (ENGINE LOGIC UNTOUCHED — timers, autosave,
  resume, guards, anti-cheat stay byte-identical): cleaner top bar (progress
  bar under it), option rows as bordered cards with letter chips (A–E),
  selected = accent fill; palette grid modernized with legend; timer pill gains
  a red pulsing state under 60s; bookmark icon → lucide.
- **Result** — score hero with animated `ProgressRing` + %, stat chips
  (correct/wrong/skipped with icons), `TopicBar`s restyled, review CTA.
- **Review** — filter chips (All/Correct/Wrong/Skipped), question cards with
  verdict accents, image + explanation blocks restyled.
- **Ranking** — **NUMERIC ranks only — medals removed** (web Round-20 rule;
  §7.2c.7); board/scope/period chips restyled; **district scope chip** (child's
  own rayon via student→school); top-50 rows with Avatar initials +
  self-highlight; sticky my-rank card; streak card.
- **Olympiads** — same cover-card system as parent; owned → runner; **real pool
  counts** (kill every `?? 25` — §7.2d.11 via `get_olympiad_pool_counts`).
- **Profile** — Avatar picker with initials fallback; palette picker swatches
  **imported from `ARENA_LIGHT`** (removes the hex duplication in
  `studentSections.tsx`); sticker-theme picker restyled.

### Boot
- Splash/BootError/Maintenance/ForceUpdate/UnknownRole — BrandMark + gradient
  accent, consistent copy, single retry/update CTA. Fast, no animation-gating.

## 5. Cross-cutting standards
- **Android-first verification, iOS-correct always**: `shadow()` helper for
  elevation/shadow parity; `android_ripple` + iOS opacity; safe areas via the
  existing SafeArea provider (tab bar + headers + sheets); keyboard behavior
  via the existing Screen KAV; hardware-back/gesture rules of the runner
  unchanged.
- **A11y**: hit targets ≥44dp, `maxFontSizeMultiplier` kept, contrast AA in
  light+dark+all 5 palettes, `accessibilityRole/Label` on every interactive
  primitive.
- **Perf**: FlatList everywhere a list can grow; expo-image with recycling;
  animations native-driven; no new re-render hot paths (memoized rows).
- **i18n**: every new string az/en/ru in `messages.mobile.ts`; synced catalog
  refreshed first; NO hardcoded UI text.
- **Scope guard**: no business-logic changes beyond the folded parity items
  (§6); BFF/service contracts untouched; anti-cheat and engine timing logic
  untouched.

## 6. Folded M3.1 parity items (functional, in the same pass)
1. Real olympiad pool counts (`get_olympiad_pool_counts`, missing row = 0) in
   `features/olympiads/data.ts` — consumed by BOTH olympiad tabs.
2. Tests readiness pre-flight (`get_my_round_readiness`).
3. Arena home = Round-21 web layout + real all-time rank.
4. Add-child District step + `city_district_id` through the BFF.
5. Ranking: numeric ranks (no medals) + district scope.
6. (Already fixed pre-plan: the Realtime notifications crash — ref-counted
   singleton channel.)
Maintenance short-cadence refetch (§7.2c.9) and the optional public top-10 on
welcome stay OUT of this pass (M4 candidates).

## 7. Dependencies
- `lucide-react-native` (NEW — icon system; peer: react-native-svg already
  installed). `npm audit` must stay 0.
- Everything else uses already-installed packages (reanimated, expo-image,
  expo-linear-gradient, react-native-svg, expo-secure-store).

## 8. Execution & acceptance
Phased agents with disjoint file ownership:
- **MA (foundation + public)**: theme/tokens additions, all `src/components/`
  primitives (incl. AppTabBar, Avatar), lucide adoption in shared chrome,
  i18n sync + `messages.mobile.ts` additions, onboarding + seenWelcome flag +
  login/register/public pages, boot screens, gallery. Runs first.
- **MB (parent)**: parent tabs/home/analytics/olympiads-tab/subscription/
  notifications feature (shared) + both notification route files, parent
  profile, add-child wizard (+district), child edit/subscribe.
- **MC (student arena)**: student tab routes, arena home, ranking, student
  olympiads + `features/olympiads/**` (incl. data.ts pool counts), student
  profile, arena ui primitives.
- **MD (test engine visuals)**: `features/tests/**` (TestsHome/Setup/Runner/
  Result/Review + tests ui.tsx) — visuals + readiness only, logic untouched.
MB/MC/MD run in parallel after MA lands.

**Gates**: `tsc --noEmit` · `expo lint` · jest (all 37 green — engine logic
untouched proves itself here) · `npm audit` = 0 · Metro export bundles.
**Acceptance (owner, Android)**: onboarding appears exactly once per install;
logout lands on Login; every tab/screen matches this plan's look in light,
dark and all 5 arena palettes; runner still resumes/times/submits identically;
ranking shows numeric ranks with the district chip; add-child requires the
rayon for Bakı; olympiad cards show real question counts.
