# 01 Requirements and Scope Mapping


## Repository Placement and Related Files

- Intended path: `docs/master/01_REQUIREMENTS_AND_SCOPE_MAPPING.md`
- Folder: `docs/master/`
- Primary readers: Product analyst, solution architect, Claude Code, project manager, QA lead
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`
- Scope controlled by this file: Maps Azerbaijani Scope of Work and approved plan into MVP/future requirements
- Source-of-truth level: Master source of truth for scope interpretation


## Source Interpretation Rules

The Azerbaijani Scope of Work defines broad product ambitions: student, parent, admin, content manager and future school/partner roles; daily tasks, tests, progress analytics, ranking, subscription payments, multilingual readiness and notifications. The approved Technical & Commercial Plan gives the preferred stack: Supabase + Vercel, Next.js, Flutter later, Redis optional, and web MVP first.

When documents conflict, this plan chooses the safest current-MVP interpretation:

- SMS is excluded even if the documents mention SMS/OTP.
- Optional bank transfer is excluded.
- Mobile app implementation is future-only.
- Stripe-first card payment is used now, with abstraction for future local providers.
- Redis is optional and not required for correctness.
- Supabase + Vercel is the current infrastructure direction.

The canonical product model overrides older baseline assumptions (see the "Overridden Baseline Assumptions" section below). In summary:

- Only **parents** self-register (email/password) and pay. **Children/students are created by parents** and never self-register.
- A child logs in with a server-generated **8-digit numeric ID + a parent-set password**, never email.
- Subscriptions are **child-based and subject-priced** (not a single parent-level paid account), with a launch one-month promo, an ongoing 7-day trial and an automatic fixed sibling discount.
- A separate paid **Olympiad Preparation** module sells packages with lifetime access, distinct from subscriptions.
- A **public marketing website** and **News** (public + in-app, Admin-only CRUD) are in scope.
- Difficulty is **never user-selected**; each attempt is a server-side random 25-question selection.

## Extracted Feature List from Scope of Work

| Area | Extracted requirement | Current interpretation | Priority |
|---|---|---|---|
| Public website | Marketing/info site before login | Public Next.js pages: Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register; no private student data exposed | Must-have MVP |
| Parent account | Parent-only registration/login | Parent self-registers with email/password Supabase Auth; only user type that pays | Must-have MVP |
| Add child | Parent creates each child profile | Multi-step add-child flow: child info → separate subject-selection step with live pricing preview → parent-set password → payment/activation; on success a server-generated 8-digit ID is assigned and the child is auto-linked | Must-have MVP |
| Child account | Child login and access | Child logs in with 8-digit numeric ID + parent-set password (never email); cannot purchase; access depends on the parent's active payments | Must-have MVP |
| Child wallpaper | Personalize child dashboard | Child picks from a predefined wallpaper/background set; saved per child profile; editable only from child profile/settings | Must-have MVP |
| Subjects | Subject catalog | Exactly four subjects: Math, Science, Məntiq, İngilis dili | Must-have MVP |
| Daily practice | Daily tasks by grade and subject | Admin-created/scheduled daily task packages; child progress tracked | Must-have MVP |
| Tests/exams | Timed, topic-based, mixed, olympiad simulation | Test engine with server-side random 25-question selection from the pool (auto-mixed difficulty), auto grading and result history | Must-have MVP |
| Results | Immediate results and explanations | Auto-grade objective types; show explanations after submission | Must-have MVP |
| Mistakes | Wrong answers list and retry | Mistakes review screen and retry policy | Must-have MVP |
| Progress | Daily/weekly/monthly performance | Snapshot tables and dashboard metrics | Must-have MVP |
| Parent dashboard | Manage children, view reports, payments | Parent dashboard shows each child's 8-digit ID, selected subjects, subscription/payment/access status, reports and payment history | Must-have MVP |
| Subscriptions | Child-based, subject-priced plans | Per-child, per-subject pricing; weekly/monthly/yearly; launch one-month promo; ongoing 7-day trial; auto sibling discount; failed charge blocks paid access | Must-have MVP |
| Sibling discount | Automatic family discount | Fixed backend-computed discount: 1st 0%, 2nd 15%, 3rd+ 20%; no admin discount-settings module | Must-have MVP |
| Olympiad Preparation | Separate paid add-on module | Admin-created packages with question pools; random 25-question attempts; parent-only purchase; lifetime access; archive listing after end date | Must-have MVP |
| News | General news, public + in-app | Admin-only CRUD; title/body(links)/image/timestamps/publish status; images in Storage | Must-have MVP |
| Payments | Real online subscription + package payment, payment history | Stripe-first card checkout, checkout sessions, subscription/package records, webhook idempotency, webhook-only activation | Must-have MVP |
| Leaderboard | Grade, subject, school, rayon, country, period rankings | PostgreSQL snapshot leaderboard; full school/rayon/country readiness | MVP initial + later expansion |
| Notifications | In-app, email, SMS, WhatsApp/Telegram, push | Only in-app/email/admin alerts now; future push readiness | Must-have without SMS |
| Admin content | Manage grades, subjects, topics, questions, tests, tasks | Admin Panel modules with audit logging | Must-have MVP |
| Admin business modules | Manage News, Olympiad packages, payments/subscriptions | Admin-only modules; Content Managers excluded | Must-have MVP |
| Content manager | Create/edit regular content and submit for approval | Limited Admin Panel role, no sensitive access, no News/Olympiad/payment modules | Must-have MVP if team needs it |
| Multilingual | AZ first, RU/EN later | Data model ready; UI i18n-ready; AZ implementation first | MVP readiness + later content |
| School/partner | Future school/partner dashboard | Schema readiness only | Future-only |

## Child / Student Requirements

Children are created by parents and never self-register. A child logs in with a server-generated 8-digit numeric ID + a parent-set password and can never purchase anything.

| Source requirement | Current interpretation | Web App impact | Admin Panel impact | Backend/database impact | Security considerations | Priority |
|---|---|---|---|---|---|---|
| Giriş (6-rəqəmli ID) | Child logs in with 8-digit numeric ID + parent-set password (never email); profile created by parent | Child login + dashboard screens | Admin can view/suspend child accounts | `child_profiles`, 8-digit unique ID, child-credential strategy mapped to Supabase Auth or custom child credential | Server-generated collision-safe ID; child reads only own profile; child cannot self-register | Must-have |
| Sinif/fənn (valideyn təyini) | Grade and subjects are set by the parent during the add-child flow; child does not choose subjects | Read-only grade/subjects on child dashboard | Admin manages grade/subject taxonomy | `grades`, the four `subjects`, per-child subject selections | Child cannot change own subjects or access | Must-have |
| İş masası fonu | Child picks a dashboard wallpaper from a predefined set | Child profile/settings wallpaper picker | Admin manages predefined wallpaper catalog | `predefined_wallpapers` catalog, per-child wallpaper selection; images in Storage | Only the child edits own wallpaper; no arbitrary uploads | Must-have |
| Gündəlik tapşırıqlar | Child receives packages active for grade/subject/date | Daily task page, progress state | Admin schedules packages | `daily_task_packages`, `daily_task_items`, `child_daily_task_progress` | Subscription gating; attempt ownership | Must-have |
| Testlər və olimpiada sualları | Each attempt is a server-side random selection of 25 questions from the pool; difficulty auto-mixed, never user-chosen | Test list, solver, results | Admin creates tests and question pools | `tests`, `test_questions`, question pools, `attempts`, `answers`, per-attempt random selections | Prevent answer leakage before submission; selection is server-side; if fewer than 25 exist use available | Must-have |
| Nəticə/izah/səhvlər | Show score, explanations, wrong answer list | Result and mistakes screens | Admin can inspect aggregate errors | Attempt answer tables, explanations | Children only see own results | Must-have |
| Reytinq | Show child rank in permitted categories | Leaderboard page/card | Admin reviews suspicious activity | `leaderboard_entries`, snapshots | Avoid exposing child PII; anti-manipulation | MVP initial |
| Olimpiada hazırlığı | Child accesses olympiad packages the parent purchased; cannot buy | Olympiad list + attempt screens | Admin manages packages | Olympiad package purchases, attempts, lifetime-access records | Child cannot purchase; access tied to parent purchase | Must-have |
| Sertifikat/nailiyyət | Badges readiness | Badge placeholders | Admin config later | `achievements`, `child_achievements` | Avoid false official certification claims | Should-have/later |

## Parent Requirements

Parents are the only paying, self-registering user type. A parent-created child is auto-linked to the parent; manual linking is not the primary flow (it may remain only as a secondary/edge concept if ever needed).

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| Parent registration/login | Supabase Auth parent role (email/password); parent registration is free | Parent dashboard | Must-have |
| Add child | Multi-step add-child flow: child info → separate subject-selection step with live pricing preview → parent-set password → payment/activation; server assigns 8-digit ID | Add-child wizard, `child_profiles` | Must-have |
| Auto-link children | Parent-created children are auto-linked to the parent (no manual linking step) | `parent_child_links` (auto-populated) | Must-have |
| Add subjects later | Parent may add subjects to an existing child subscription; pricing update/proration is backend-controlled | Subject-management screen + backend proration service (rule TBD) | Must-have flow; proration rule to confirm |
| Track progress | Parent can read own children only | RLS join-based access | Must-have |
| Reports | Weekly/monthly summaries | Snapshot/report service | Must-have basic; advanced later |
| Subscription/payment | Parent selects per-child subjects and duration and pays; child-based, subject-priced; launch promo + 7-day trial + sibling discount; failed charge blocks paid access | Stripe checkout + child subscription records + payment history | Must-have |
| Olympiad purchases | Parent buys separate Olympiad Preparation packages (lifetime access) for a child | Olympiad checkout + package purchase history | Must-have |
| Notifications | Email/in-app only | Preferences and deliveries | Must-have without SMS |

## Admin Requirements

Admin can manage the whole platform: parent and child accounts, content, taxonomy, daily tasks, tests, subscriptions, payments, coupons, analytics, support, audit logs, settings and feature flags. Admins also own the new business modules: News management (CRUD/publish/archive), Olympiad Preparation package management (packages, grade/class targeting, question pools, trial test pools), Olympiad question pool / trial test management, subscription/pricing plan visibility/config where appropriate, payment/subscription monitoring and parent/child account monitoring. There is NO "Discount Settings" admin module — the sibling discount is fixed in business logic. Every sensitive admin action must be audited. Admin-only access must not leak into the Web App. Purchased records are never deleted; listings are soft-archived only.

## Teacher / Content Manager Requirements

Content Manager may:

- Create new questions.
- Edit own draft questions.
- Add explanations.
- Create test packages if permission is granted.
- Prepare daily task packages if permission is granted.
- Submit content for approval.
- View limited subject-level analytics and high-error questions.

Content Manager must not access payments, subscriptions, full PII exports, audit logs, security settings, roles/permissions, feature flags, Stripe configuration, deployment settings or destructive platform-wide actions. Content Managers also must NOT manage the new business/payment modules: News, Olympiad Preparation packages, Olympiad question pools used for paid packages, or any payment/subscription module. Those are Admin-only; Content Managers keep regular educational content and question workflows.

## Public Website Requirements

A public marketing website precedes login and exposes no private student data.

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| Marketing pages | Home, About, Subjects, FAQ, Contact | Public Next.js pages in `web-app/` | Must-have |
| Pricing page | Shows the general subscription model and notes final access depends on parent-selected subjects + plan duration | Public pricing page (no private data) | Must-have |
| Olympiad Preparation overview | Public overview of the separate paid module | Public olympiad-preparation page | Must-have |
| Public News | Reads published News (same content available in-app) | Public news list + detail (`/news`, `/news/[slug]`) | Must-have |
| Login / Register | Parent register + parent/child login entry points | Public auth pages; children log in by 8-digit ID + password | Must-have |

## News Requirements

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| General news | Single general feed, no categories in v1; public + in-app | News tables; public + authenticated reads | Must-have |
| Fields | title, body (links allowed in body), image, auto created_at/updated_at, publish/active status | `news`, `news_media` metadata; images in Storage | Must-have |
| Admin CRUD | Admin-only create/edit/publish/archive/(soft-)deactivate per destructive-action rules | Admin News module; Content Managers excluded | Must-have |

## Subscription, Trial and Pricing Requirements

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| Child-based subscriptions | Per child, per subject; weekly/monthly/yearly duration; subject-count pricing | Per-child subscription + subject selection tables | Must-have |
| Subject pricing | Placeholder 1 AZN/subject (1/2/3/4 → 1/2/3/4 AZN); all-4 "full package" placeholder; configurable later | Pricing config (placeholder), checkout preview | Must-have (values configurable) |
| Live pricing preview | Subject-selection step updates price automatically by subject count | Add-child wizard step 2 | Must-have |
| Launch promo | Roughly first month free at platform launch | Launch-promo config | Must-have |
| 7-day trial | After promo, new paid child subscriptions get a 7-day trial before billing | Trial start/end dates per subscription | Must-have |
| Sibling discount | Fixed, automatic, backend-computed: 1st 0%, 2nd 15%, 3rd+ 20%; shown at checkout/dashboard | Discount calc/audit fields; no admin discount module | Must-have |
| Failed charge handling | Auto-block all paid child access (tests, daily tasks, olympiad prep, paid content/progress, any gated feature) | Access-status flags driven by webhooks | Must-have |
| Proration on add subjects | Backend-controlled pricing update/upgrade when adding subjects later | Backend proration service (rule TBD) | Must-have flow; rule to confirm |

## Payment and Webhook Requirements

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| Real online payment | No manual admin approval; Stripe-first card flow via provider abstraction | Checkout sessions, payment records | Must-have |
| Webhook-only activation | Subscription/package activation happens only via verified webhook, never client | Webhook handler, idempotency, audit | Must-have |
| No client-trusted fields | Client can never set price, discount, selected subjects, trial dates, subscription status or access flags | Server-side validation + RLS | Must-have |
| Olympiad purchases | Separate one-time/package purchase = lifetime access after successful payment | Package purchase + lifetime-access records | Must-have |

## Olympiad Preparation Requirements

A separate paid add-on module, distinct from subscriptions. Only parents purchase; children access purchased content but cannot buy.

| Requirement | Current interpretation | Impact | Priority |
|---|---|---|---|
| Two areas | "Available Olympiads" (Aktiv Olimpiadalar) and "My Olympiad Packages" (Mənim Olimpiadalarım) | Parent + child olympiad screens | Must-have |
| Package fields | Name, subject/domain (if relevant), class/grade target (data-model field), short description, start date, olympiad/end date, price, status, question/test pool, optional image/banner | Admin package module; images in Storage | Must-have |
| Random attempts | Server-side random 25 questions per attempt from the pool (e.g. ~500), new mix each attempt; if fewer than 25 exist use available | Per-attempt random selection records | Must-have |
| Lifecycle | Active from publish/start until end date; after end date auto-archive for NEW sales/listing only | Package archive status | Must-have |
| Lifetime access | Purchasers keep lifetime access; purchased packages never deleted, remain accessible after archive | Lifetime-access records | Must-have |
| Package history | Permanently visible: package name, child, grade target, purchase date, end date, price paid, status, linked pool info; admin can view records | Purchase/history tables; soft-archive only | Must-have |

## Schema and Security Mapping (Documentation)

Tables/concepts to plan (SQL created later under `supabase/sql/` only): parent profiles; parent-created child/student profiles; child 8-digit unique ID; child auth-credential strategy (8-digit ID + parent-set password mapped to Supabase Auth or a custom child-credential approach); predefined wallpapers catalog + per-child wallpaper selection; per-child subject selections; per-child subscription plan/duration/status; trial start/end dates; launch-promo config; payment records; checkout sessions; sibling-discount calc/audit fields; news + news media metadata; olympiad packages; olympiad grade/class targeting; olympiad question pools; olympiad package purchases; olympiad package attempts; olympiad random question selections; package archive status; lifetime-access records.

Security boundaries (enforced by RLS + server-side checks): a parent reads/manages only own children; a child reads only own profile/content and cannot purchase or edit payment/subscription data; a parent cannot grant access without payment confirmation; Admin manages business modules; Content Managers cannot manage News/Olympiad/payment modules; the service role is used only for trusted payment/webhook/admin operations. Images/wallpapers/news images live in Supabase Storage; the database stores only object path/metadata.

## Future School / Partner Requirements

Future-only readiness includes:

- `schools`, `districts`, optional student-school relationships.
- School/rayon/country leaderboard grouping.
- Future partner permissions and school-level reporting boundaries.
- No current partner dashboard implementation.

## MVP vs Later-Phase Classification

### Must-Have for MVP

- Public marketing website (Home, About, News, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register).
- Parent-only registration; parent-created children; child login by 8-digit ID + parent-set password.
- Parent/Child/Admin/Content Manager RBAC.
- Multi-step add-child flow with a separate subject-selection step and live pricing preview; auto-linking of parent-created children.
- Child dashboard wallpaper customization (predefined set).
- Grades, the four subjects (Math, Science, Məntiq, İngilis dili), topics, subtopics.
- Question bank with review workflow.
- Daily task engine.
- Test engine with server-side random 25-question selection and auto grading (no user-selected difficulty).
- Progress dashboard basic metrics.
- Child-based, subject-priced subscriptions with launch promo, 7-day trial, automatic sibling discount and failed-charge access blocking.
- Olympiad Preparation module: packages, question pools, random 25-question attempts, lifetime access, package history, archive-on-expiry for listings.
- News (public + in-app, Admin-only CRUD).
- Real online payments (Stripe-first) with webhook-only activation.
- In-app/email notifications.
- Initial leaderboard.
- Admin content management plus Admin-only News and Olympiad package management and payment/account monitoring.
- Audit logging and RLS.

### Should-Have After MVP

- Advanced analytics and exports.
- Advanced leaderboard categories and anti-fraud dashboards.
- Achievement/certificate UI.
- Russian/English content expansion.
- Coupon automation and trial experiments.
- Redis if load tests justify it.

### Future-Only

- Mobile app implementation.
- School/partner dashboard.
- Video/live lesson modules.
- AI recommendation system.
- WhatsApp/Telegram bots.
- CRM integration.
- Teacher classroom management.
- Optional bank transfer.
- SMS.

## Explicit Exclusions

- SMS OTP, SMS notifications and SMS costs.
- Optional bank transfer implementation.
- Mobile app implementation in the current phase.
- Video lessons, live lessons, AI recommendations and bots.
- School corporate panel and teacher classroom management.
- CRM integration.
- Child self-registration and child email login (children are parent-created and log in by 8-digit ID + password).
- User-selected difficulty (difficulty is auto-mixed via server-side random selection).
- A "Discount Settings" admin module (sibling discount is a fixed business rule).
- Deletion of purchased olympiad packages (listings archive; purchasers keep lifetime access).
- Domain purchase and email-domain configuration in this phase.

> Note: A public marketing website is now IN scope and is no longer an exclusion.

## Ambiguities and Assumptions

| Ambiguity | Assumption for planning | Confirmation needed |
|---|---|---|
| Who pays for child subscriptions? | Settled: child-based subscriptions paid only by the parent; children never pay | Settled — recorded for reference |
| Subject pricing | Placeholder 1 AZN/subject; all-4 "full package" placeholder; configurable later | Final price points, durations and bundle discount |
| Proration on adding subjects later | Backend-controlled pricing update/upgrade | Exact proration/upgrade rule and whether it is MVP or later |
| 8-digit ID capacity | 8-digit numeric space is finite; MVP uses 8 digits | Future migration path if namespace nears capacity |
| Domain | No final domain; no purchase/email-domain config this phase | A future phase picks one domain for site + corporate email |
| Initial content size | System supports large bank, launch can start curated | Exact first content upload count |
| Stripe vs local providers | Stripe-first now; local providers later via abstraction | Business/legal feasibility |
| Leaderboard categories | MVP starts grade/subject/time; school/rayon/country ready | Which categories must be public at launch |
| Content Manager scope | Limited content role, not full admin, no News/Olympiad/payment modules | Exact permissions per team member |

## Overridden Baseline Assumptions

These older assumptions are explicitly replaced by the canonical product model. Documentation must not reintroduce them:

| Old assumption (removed) | Replacement (canonical) |
|---|---|
| Student self-registration | Parent-created child accounts; children never self-register |
| Student email login | Child login via server-generated 8-digit numeric ID + parent-set password |
| Parent/student manual linking as the main flow | Auto-linking of parent-created children (manual linking only a possible secondary/edge concept) |
| "Discount Settings" admin module | Fixed sibling-discount business rule (no admin module) |
| User-selected difficulty | Server-side random mixed selection (25 questions per attempt) |
| Olympiad package deletion after expiry | Archive listing after end date + lifetime access for purchasers; purchased records never deleted |
| Parent-level paid account | Child-based, per-subject subscriptions |

Kept excluded/unchanged: SMS excluded; optional bank transfer excluded; mobile future-only; Supabase/PostgreSQL source of truth; Redis optional; media in Supabase Storage (DB stores object path/metadata only); payment/security enforced server-side.


## Non-Negotiable Project Decisions

1. The current implementation scope is **Web App + Admin Panel + shared Supabase backend** only.
2. The **Mobile App is future-only**. Current work may only include backend/API readiness for future Flutter compatibility.
3. Web App and Admin Panel are separate Next.js applications under `web-app/` and `admin-panel/`.
4. Supabase is shared infrastructure under the root-level `supabase/` folder. SQL files must never be placed inside `web-app/` or `admin-panel/`.
5. Supabase PostgreSQL is the source of truth for content, users, subscriptions, attempts, progress, leaderboard and audit data.
6. Supabase Auth is used for authentication, with role and permission data enforced through PostgreSQL/RLS and server-side checks.
7. SMS is excluded from the current plan. No SMS OTP, no SMS notification channel, no SMS cost assumptions.
8. Payments are **Stripe-first card payments** with a provider abstraction for future local Azerbaijani providers. Optional bank transfer is excluded.
9. Redis is not required for correctness. The MVP should be PostgreSQL-first with a Redis-ready `LeaderboardService` abstraction.
10. UI approval is not a blocker. Build a clean, simple, responsive, accessible, component-ready frontend that can later be restyled.
