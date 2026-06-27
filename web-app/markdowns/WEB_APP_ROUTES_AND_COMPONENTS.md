# Web App Routes and Components


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_ROUTES_AND_COMPONENTS.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code, frontend developer
- Related master docs: `docs/master/04_WEB_APP_PLAN_STUDENT_PARENT.md`
- Scope controlled by this file: Web App route and component planning
- Source-of-truth level: Derived app-specific execution guide


## Suggested Route Structure

```text
app/(public)/page.tsx
app/(public)/login/page.tsx
app/(public)/register/page.tsx
app/(public)/pricing/page.tsx
app/(student)/student/dashboard/page.tsx
app/(student)/student/onboarding/page.tsx
app/(student)/student/daily-tasks/page.tsx
app/(student)/student/tests/page.tsx
app/(student)/student/tests/[testId]/page.tsx
app/(student)/student/attempts/[attemptId]/result/page.tsx
app/(student)/student/mistakes/page.tsx
app/(student)/student/progress/page.tsx
app/(student)/student/leaderboard/page.tsx
app/(student)/student/subscription/page.tsx
app/(parent)/parent/dashboard/page.tsx
app/(parent)/parent/students/page.tsx
app/(parent)/parent/students/[studentId]/progress/page.tsx
app/(parent)/parent/reports/page.tsx
app/(parent)/parent/subscription/page.tsx
app/(parent)/parent/payments/page.tsx
app/notifications/page.tsx
app/support/page.tsx
app/unauthorized/page.tsx
```

## Protected Route Rules

- Public routes: landing, login, register, pricing.
- Student routes: only student role.
- Parent routes: only parent role.
- Shared routes: authenticated student/parent.
- Unauthorized: no sensitive data loaded.

## Component Structure

```text
components/ui/
components/layout/
components/forms/
components/student/
components/parent/
components/test-solving/
components/progress/
components/subscription/
components/leaderboard/
components/notifications/
```

## Component Groups

- Form components: AuthForm, ProfileSetupForm, LinkStudentForm, SupportForm.
- Dashboard components: SummaryCard, ActivityCard, SubscriptionStatusCard.
- Test-solving components: QuestionCard, AnswerInput, TestTimer, SubmitDialog.
- Report/progress components: ProgressChart, TopicStrengthList, MistakesList.
- Notification components: NotificationList, NotificationBadge.

## UI Redesign Readiness

Use design tokens, reusable components, and clean separation from business logic. Later UI changes should not rewrite service calls or permission logic.
