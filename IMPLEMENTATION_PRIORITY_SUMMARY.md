# IMPLEMENTATION_PRIORITY_SUMMARY

## 0. Confirmed Product Model (2026-06-27)

These business decisions are CONFIRMED and override older baseline assumptions:

- **Parent-only registration** (email/password). **Children never self-register** and are **created by a parent** via an Add-Child flow.
- **Child login = 8-digit unique numeric ID + parent-created password** (server-issued ID, collision-safe, unique). No child email login.
- **Subscriptions are child-based and subject-based** (subjects: Math, Science, Məntiq, İngilis dili; placeholder pricing 1 AZN/subject, configurable). Weekly/monthly/yearly.
- **Launch ~1-month promo, then ongoing 7-day trial**; failed charge auto-blocks all paid child access. Real webhook-verified payment; never client-activated.
- **Automatic sibling discount** (subscriptions only, fixed): 2nd child 15%, 3rd+ 20%. No "Discount Settings" admin module.
- **Public marketing website** + **News** (public + in-app, Admin-only CRUD) are in scope.
- **Olimpiada Hazırlığı / Olympiad Preparation** is a separate paid add-on (parent-purchased) with **lifetime access**; each attempt = 25 server-side random questions; users never choose difficulty.
- **Child dashboard wallpaper customization** from a predefined set.
- Domain name NOT confirmed (no purchase/email config this phase).

## 1. What Must Be Built First

- Approved repo folders and documentation placement.
- Supabase foundation: extensions/enums, profiles, roles, permissions, RLS and audit foundation.
- **Parent/child account model**: parent profiles, parent-created child profiles, 8-digit child ID + child credential strategy.
- Separate Next.js app shells for `web-app/` and `admin-panel/`.
- Auth, profile onboarding and Content Manager boundary.
- **Public marketing website** shell.

## 2. What Must Be Built Second

- Academic taxonomy.
- Content/question management and review workflow.
- **Child-based subject subscriptions + payments + trial/promo + sibling discount** (server-side, webhook-verified).
- **News** module (public + admin-only CRUD).
- Test and daily task engine.
- Child/parent dashboards (parent-created children auto-linked), child wallpaper.
- **Olimpiada Preparation** module (admin package management, parent purchase, child access, random selection, lifetime access).

## 3. What Can Wait

- Advanced analytics exports.
- Full school/rayon/country leaderboard UI.
- Achievements/certificates UI.
- Redis implementation unless justified.
- Russian/English content publishing beyond readiness.

## 4. Future-Only

- Flutter mobile app implementation.
- School/partner dashboard.
- Video/live lessons.
- AI recommendations.
- WhatsApp/Telegram bots.
- CRM integration.
- Optional bank transfer.
- SMS.

## 5. Highest Security Risks

- RLS misconfiguration causing student data leakage.
- Parent accessing children that are not their own.
- Content Manager privilege creep (esp. into News/Olympiad/payment modules — forbidden).
- Client-side payment activation, or client overriding price/discount/selected-subjects/trial-dates/subscription-status/access flags.
- Child attempting to purchase or change subscription/payment data (must be impossible).
- Correct answer exposure before result.
- 8-digit child ID generated/trusted from the client instead of server-side + unique constraint.
- Service role key exposure.

## 6. Highest Architectural Risks

- Mixing Web App and Admin Panel logic.
- Putting SQL inside app folders.
- Overcoupling leaderboard to raw UI queries.
- Waiting for final UI before building backend.
- Building mobile now and diluting MVP.

## 7. Recommended First Sprint

1. Create folder structure.
2. Add markdown docs.
3. Configure Supabase/Vercel environments.
4. Build SQL files `001`-`003` draft.
5. Implement auth/profile/roles/RLS foundation.
6. Build minimal protected layouts.
7. Add audit helper and initial tests.

## 8. Decisions — Confirmed vs Still Open

Confirmed (2026-06-27): parent-only registration; parent-created children; child 8-digit ID + parent password login; child-based subject subscriptions (parent-paid); launch 1-month promo + 7-day trial; real webhook-verified payment; fixed sibling discount (2nd 15% / 3rd+ 20%, no Discount Settings module); public website + News in scope; Olympiad Preparation as a separate paid lifetime-access module; child wallpaper customization; users never choose difficulty (random 25-question selection).

Still open / to decide later:

- Stripe (or local provider) account/legal readiness for real online payment.
- Initial admin bootstrap method.
- Exact final pricing (current values are placeholders, configurable via admin/config).
- Add-subjects-later **proration/upgrade** rule (business decision; backend-controlled).
- Child credential implementation detail (how 8-digit ID + parent-set password maps to the auth layer).
- Which leaderboard categories visible at launch.
- Domain name (NOT this phase).

## 9. Redis Recommendation

Default: PostgreSQL-first source of truth with leaderboard snapshots and a Redis-ready service interface. Add Redis only after load testing or clear near-real-time leaderboard requirements.

## 10. UI/Design Recommendation

Build backend-first, component-ready frontend now. Final UI polish later should update visual components and design tokens, not rewrite business logic.

## 11. Where to Place Each Generated File

Use the exact paths inside this package. Master docs in `docs/master/`, Supabase guides in `supabase/`, Web App guides in `web-app/markdowns/`, Admin guides in `admin-panel/markdowns/`, future mobile guide in `mobile-app/markdowns/`.

## 12. First Reads for Claude Code

- Web App: `docs/master/00`, `02`, `03`, `04`, `06`, `07` + all `web-app/markdowns`.
- Admin Panel: `docs/master/00`, `02`, `03`, `05`, `06`, `07` + all `admin-panel/markdowns`.
- Supabase: `docs/master/02`, `03`, `06`, `07` + `supabase/README_RUN_ORDER.md` and `supabase/markdowns`.
