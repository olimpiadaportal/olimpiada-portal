# Web App Routes and Components


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code, frontend developer
- Related master docs: `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Scope controlled by this file: Web App route and component planning
- Source-of-truth level: Derived app-specific execution guide


## User Model Summary (drives routing)

- **Parent** is the only self-registering user (email/password). Parents pay.
- **Child / Student** accounts are created by a parent and log in with a **8-digit numeric unique ID + parent-created password** (no email login). Children never purchase anything.
- Public marketing site is reachable before login. Authenticated dashboards stay protected.
- Route names below may be adjusted to project conventions (e.g. `/olimpiada-hazirligi` instead of `/olympiad-preparation`) but every flow must be represented.

## Suggested Route Structure

```text
# Public marketing site (no auth)
app/(public)/page.tsx                                       # / (Home)
app/(public)/about/page.tsx                                 # /about
app/(public)/news/page.tsx                                  # /news (public news list)
app/(public)/news/[slug]/page.tsx                           # /news/[slug] (public news detail)
app/(public)/pricing/page.tsx                               # /pricing
app/(public)/olympiad-preparation/page.tsx                  # /olympiad-preparation (or /olimpiada-hazirligi)
app/(public)/subjects/page.tsx                              # /subjects (Math, Science, Məntiq, İngilis dili)
app/(public)/faq/page.tsx                                   # /faq
app/(public)/contact/page.tsx                               # /contact
app/(public)/login/page.tsx                                 # /login (parent login)
app/(public)/register/page.tsx                              # /register (parent self-registration only)

# Parent area (protected, parent role)
app/(parent)/parent/dashboard/page.tsx                      # children list + 8-digit IDs + status
app/(parent)/parent/children/page.tsx                       # /parent/children
app/(parent)/parent/children/new/page.tsx                   # add-child wizard (Step 1: child info)
app/(parent)/parent/children/[childId]/page.tsx             # child detail
app/(parent)/parent/children/[childId]/subjects/page.tsx    # subject selection (live pricing preview)
app/(parent)/parent/children/[childId]/subscription/page.tsx# per-child subscription management
app/(parent)/parent/checkout/page.tsx                       # /parent/checkout (subscription checkout)
app/(parent)/parent/payments/page.tsx                       # /parent/payments (payment history)
app/(parent)/parent/olympiads/page.tsx                      # /parent/olympiads (available + purchased packages)
app/(parent)/parent/olympiads/[packageId]/checkout/page.tsx # olympiad package checkout

# Child / Student area (protected, child role)
app/(student)/student/login/page.tsx                        # /student/login (8-digit ID + password)
app/(student)/student/dashboard/page.tsx                    # /student/dashboard
app/(student)/student/profile/page.tsx                      # /student/profile (incl. wallpaper picker)
app/(student)/student/tests/page.tsx                        # /student/tests
app/(student)/student/results/page.tsx                      # /student/results
app/(student)/student/olympiads/page.tsx                    # /student/olympiads (Available + My Olympiads)
app/(student)/student/olympiads/[packageId]/page.tsx        # purchased package detail
app/(student)/student/olympiads/[packageId]/attempt/page.tsx# attempt (server picks 25 random questions)

# Shared authenticated
app/notifications/page.tsx
app/support/page.tsx
app/unauthorized/page.tsx
```

## Protected Route Rules

- Public routes: `/`, `/about`, `/news`, `/news/[slug]`, `/pricing`, `/olympiad-preparation` (or `/olimpiada-hazirligi`), `/subjects`, `/faq`, `/contact`, `/login`, `/register`.
- `/register` is parent self-registration only. There is no student/child self-registration and no student email login.
- Parent routes (`/parent/*`): only parent role. Purchases, subjects, subscriptions, and checkout live here exclusively.
- Child routes (`/student/*`): only child role, reached via `/student/login` (8-digit ID + parent-created password). Children can never reach checkout/purchase routes.
- Public pages must never expose private student data. Pricing/Subjects pages show the general model and note that final access depends on parent-selected subjects + plan duration.
- Unauthorized: no sensitive data loaded.
- Locked/expired access (failed charge after trial/renewal, or never-paid) renders a locked state on child dashboards and gated routes instead of paid content; the parent account stays accessible.

## Component Structure

```text
components/ui/
components/layout/
components/marketing/        # public site sections
components/news/             # public + in-app news
components/forms/
components/parent/
components/add-child/        # add-child wizard steps
components/checkout/         # subscription + olympiad checkout
components/student/
components/wallpaper/        # predefined wallpaper picker
components/olympiads/        # olympiad cards / states
components/test-solving/
components/progress/
components/subscription/
components/leaderboard/
components/notifications/
```

## Component Groups

- Marketing/public components: HeroSection, FeatureSection, SubjectsOverview, PricingTable (general model, "final access depends on selected subjects + duration" note), OlympiadPreparationOverview, FaqAccordion, ContactSection, PublicHeader/PublicFooter.
- News components: NewsList, NewsCard, NewsDetail (renders title, body with allowed links, Storage-hosted image, created/updated dates). Reused on public `/news` and in-app news.
- Auth/form components: ParentAuthForm (register/login, email/password), ChildLoginForm (8-digit ID + parent-created password), SupportForm. (No student self-registration form; no student email-login form.)
- Add-child wizard components: AddChildWizard, ChildInfoStep (first/last name, city, school, class/grade), SubjectPickerStep (checkboxes for Math/Science/Məntiq/İngilis dili on a SEPARATE page) with LivePricingPreview (updates from subject count, server-priced placeholder), SetChildPasswordStep, ChildIdRevealCard (shows the assigned 8-digit ID after successful payment).
- Parent dashboard components: ChildSummaryCard (8-digit ID, subscription/payment status, selected subjects, access status), AddSubjectsLaterPanel, SiblingDiscountBadge (shows when discount applied).
- Subscription/checkout components: SubscriptionPlanCard (weekly/monthly/yearly by subject count), CheckoutSummary (subject-based price + auto sibling discount + trial/launch-promo notice, all values backend-supplied), PaymentStatusCard, TrialBanner.
- Olympiad components: OlympiadCard (Available / Aktiv Olimpiadalar), MyOlympiadCard (Mənim Olimpiadalarım), OlympiadCheckoutSummary, OlympiadAttemptIntro (notes server selects 25 random questions), LockedStateCard, ExpiredForSaleBadge (archived-but-accessible for purchasers).
- Child dashboard components: ChildDashboardShell, WallpaperPicker (predefined wallpapers/solid backgrounds only, saved per child), AccessLockedNotice (locked/expired states).
- Test-solving components: QuestionCard, AnswerInput, TestTimer, SubmitDialog. No difficulty picker — difficulty is auto-mixed server-side.
- Report/progress components: ProgressChart, TopicStrengthList, MistakesList.
- Notification components: NotificationList, NotificationBadge.

## UI Redesign Readiness

Use design tokens, reusable components, and clean separation from business logic. Later UI changes should not rewrite service calls or permission logic.
