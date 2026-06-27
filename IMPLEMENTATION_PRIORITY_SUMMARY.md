# IMPLEMENTATION_PRIORITY_SUMMARY

## 1. What Must Be Built First

- Approved repo folders and documentation placement.
- Supabase foundation: extensions/enums, profiles, roles, permissions, RLS and audit foundation.
- Separate Next.js app shells for `web-app/` and `admin-panel/`.
- Auth, profile onboarding and Content Manager boundary.

## 2. What Must Be Built Second

- Academic taxonomy.
- Content/question management and review workflow.
- Test and daily task engine.
- Student/parent dashboards and parent linking.

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
- Parent/student link abuse.
- Content Manager privilege creep.
- Client-side payment activation.
- Correct answer exposure before result.
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

## 8. Decisions to Confirm Before Coding

- Stripe account/legal readiness.
- Initial admin bootstrap method.
- Parent-paid vs student-paid subscriptions.
- Initial content volume.
- Which leaderboard categories visible at launch.
- Whether coupon/trial is MVP.

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
