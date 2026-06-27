# 03 Authentication, RBAC, Security and Audit


## Repository Placement and Related Files

- Intended path: `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- Folder: `docs/master/`
- Primary readers: Security architect, backend engineer, Supabase implementer, admin-panel developer, QA lead, Claude Code
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- Scope controlled by this file: Authentication, authorization, RBAC, RLS, security controls and audit logging
- Source-of-truth level: Master source of truth for security and permissions


## Authentication Flows

### Student Registration/Login

1. Student registers with email/password through Supabase Auth.
2. Email verification is used if enabled.
3. Student profile is created in `profiles` and `students` with grade selection.
4. Student role is assigned through `profile_roles`.
5. Optional phone is profile metadata only; no SMS verification.

### Parent Registration/Login

1. Parent registers with email/password.
2. Parent profile is created in `profiles` and `parents`.
3. Parent links student through a secure code, invite, or admin-assisted verification.
4. Parent can read only linked student educational data.

### Admin Login

- Admin accounts are created by bootstrap seed or another admin.
- Admin login should use email/password and preferably MFA.
- Admin access must be server-side verified on every privileged route.
- Failed admin login attempts must be logged.

### Content Manager Login

- Created by Administrator.
- Limited role with specific permissions.
- Cannot self-escalate or manage other users.

### Password Reset and Email Verification

Use Supabase Auth email flows. Password reset tokens must be short-lived. Passwords are never stored in application tables.

## Parent/Student Linking Flow

Recommended flow:

1. Student generates a short-lived link code or parent sends link request.
2. Parent submits code/request.
3. Backend validates the student exists and link is not already active.
4. Link status becomes `active` or `pending` depending on approval policy.
5. Audit log records link creation.

Edge cases: duplicate links, disputed parent access, student account created by parent, deactivated student, suspended parent.

## Account Status

- `active`: normal access.
- `pending`: onboarding/verification incomplete.
- `suspended`: access blocked, data retained.
- `deactivated`: user cannot log in, data retained according to policy.
- `deleted`: soft deletion state unless legal hard-delete is required.

## RBAC Model

Use roles + permissions, not hardcoded role-only logic. Common permission naming:

- `users.read`, `users.manage`, `users.suspend`
- `content.create`, `content.edit_own`, `content.review`, `content.publish`, `content.archive`
- `tests.manage`, `daily_tasks.manage`
- `payments.read`, `payments.manage`, `subscriptions.manage`
- `analytics.read_admin`, `analytics.read_subject_limited`
- `audit.read`, `settings.manage`, `feature_flags.manage`

## Permission Matrix


| Permission area | Student | Parent | Administrator | Teacher / Content Manager | Future School / Partner |
|---|---|---|---|---|---|
| Own profile | Read/update limited | Read/update limited | Manage all | Read/update own | Read/update own |
| Student educational data | Own only | Linked students only | All | Aggregated assigned subjects only | Future scoped school students |
| Parent data | None | Own only | All | No sensitive access | Future none/limited |
| Questions | Read published | Read published | Full manage | Create/edit assigned drafts, submit review | Future none |
| Correct answers | After valid attempt/result | Linked student results only | Full | For assigned content only | Future no |
| Tests/daily tasks | Read published/attempt | Read linked status | Full manage | Create/prepare if permitted | Future view/assign if later |
| Payments/subscriptions | View own/linked status | Manage own payments | Full monitor/manage | No access | Future no/payment-scoped only |
| Coupons | No | Redeem only | Full manage | No | Future maybe scoped |
| Notifications | Own | Own/linked reports | Full manage | Content-related if permitted | Future scoped |
| Audit logs | No | No | Full read | Own submissions only, not audit logs | Future scoped no |
| Roles/permissions | No | No | Full manage | No | No |
| Feature flags/settings | No | No | Full manage | No | No |
| Exports | Own data only if implemented | Linked student reports | Permitted exports | Limited educational aggregate only | Future scoped |


## Content Manager Permission Boundary

Content Manager may access only educational content workflows and limited educational analytics. Content Manager must not access:

- Payment management.
- Subscription management.
- System settings.
- Role/permission management.
- Admin account management.
- Full user data exports.
- Security logs.
- Environment/infrastructure settings.
- Payment webhooks or Stripe configuration.
- Sensitive parent/student PII beyond what is needed.
- Audit logs unrelated to their own actions.
- Feature flags.
- Backup/deployment settings.

## Supabase RLS Policy Design

RLS must be enabled on all sensitive tables. Policy principles:

- Students read/write own attempts/progress only.
- Parents read linked students only through `parent_student_links`.
- Admins access via server-side privileged operations and admin RLS policies.
- Content Managers manage only assigned/draft content and review submissions.
- Correct answers are not exposed before result authorization.
- Payment events are service-role only.
- Audit logs are append-only and admin-read-only.

## Server-Side Permission Enforcement

Every privileged service call must:

1. Resolve authenticated user from Supabase session.
2. Load roles/permissions from database.
3. Check permission server-side.
4. Validate target ownership/scope.
5. Execute database action.
6. Write audit log for sensitive action.

UI-only checks are never sufficient.

## API Authorization Middleware

Use shared middleware/helper functions:

- `requireAuth()`
- `requireRole(roleCode)`
- `requirePermission(permissionCode)`
- `assertParentLinkedToStudent(parentId, studentId)`
- `assertContentOwnershipOrReviewPermission(contentId)`
- `assertActiveSubscription(studentId, featureCode)`

## File Storage Security

- Public published question media may be readable.
- Draft content media should be accessible only to Admin/Content Manager.
- Reports, invoices and exports require signed URLs.
- Uploads validate MIME type and size.
- Media deletes should be soft or audited.

## Payment Security

- Stripe secret key is server-only.
- Webhooks are verified with Stripe signature.
- Payment event IDs are idempotency keys.
- Client never decides payment success.
- Subscription activation happens only after verified webhook.

## Rate Limiting and CAPTCHA Strategy

- Rate limit login, password reset, support requests, payment session creation and answer submissions.
- CAPTCHA can be introduced on registration/login abuse or support forms.
- Do not add CAPTCHA to every child-facing learning flow unless abuse requires it.

## Abuse Prevention and Leaderboard Anti-Manipulation

- Limit leaderboard contribution from repeated attempts.
- Track answer speed and impossible patterns.
- Snapshot scores from PostgreSQL source data.
- Admin can review suspicious entries.
- Redis cache, if added, must never be source of truth.

## Children’s Data and PII Handling

- Collect minimum necessary data.
- Avoid public display of full student names in leaderboards.
- Parent access must require verified link.
- Exports must be permission-gated and audited.
- Phone is optional and not used for authentication.

## Audit Log Plan

Audit log columns:

| Field | Purpose |
|---|---|
| `actor_profile_id` | Who performed the action |
| `action` | Machine-readable action code |
| `target_table`, `target_id` | Entity affected |
| `before_json`, `after_json` | Change diff where appropriate |
| `created_at` | Timestamp |
| `ip_address` | Request origin if available |
| `user_agent` | Browser/client metadata |
| `severity` | info/warning/critical |
| `metadata_json` | Extra context |
| `success` | Whether action succeeded or failed |

Actions that must always be audited:


- Admin login and failed admin login.
- Permission change and role assignment.
- User suspension, deactivation or deletion.
- Parent/student linking creation, approval, removal or dispute.
- Content publish, unpublish, archive, reject or approve.
- Question creation, edit, deletion/archive and explanation changes.
- Test package creation, edit, publish and archive.
- Daily task package creation, edit, publish and archive.
- Payment status change and subscription status change.
- Stripe webhook processing success/failure.
- Coupon creation, update and usage.
- Leaderboard recalculation and suspicious activity review.
- Data export.
- System setting or feature flag change.
- Admin-created user account.
- Content Manager submissions and review decisions.


## Threat Model and Mitigations

| Threat | Risk | Mitigation |
|---|---|---|
| Parent sees unrelated student | Severe privacy breach | Link-table RLS and server-side assertions |
| Content Manager accesses payments | Financial/PII leak | Permission matrix, route guards, RLS |
| Client fakes payment success | Revenue/access breach | Webhook-only activation |
| Student fetches correct answers before test | Academic integrity failure | Separate answer visibility policies and service responses |
| Leaderboard farming | Trust loss | Attempt caps, snapshots, suspicious activity review |
| Service role key leak | Full backend compromise | Never expose to client; env secret controls |
| SQL migration breaks RLS | Data leak/outage | Staging validation and RLS checklist |

## Security Acceptance Criteria

- RLS enabled on all sensitive tables.
- Anonymous users cannot read private data.
- Student cannot access another student’s attempts.
- Parent can only access linked students.
- Content Manager cannot access payments/settings/audit.
- Webhook signature verification is tested.
- Audit logs are written for every required action.
- Service role key is absent from client bundles.

## RLS Testing Checklist

- Test as anonymous, student A, student B, parent linked, parent unlinked, content manager, admin.
- Attempt cross-user reads and writes.
- Attempt direct Supabase table access from client.
- Validate correct answer visibility before and after submission.
- Validate payment tables are not client-readable except safe owner history.

## RBAC Testing Checklist

- Admin can perform all expected admin actions.
- Content Manager sees only content modules.
- Content Manager cannot reach hidden routes by URL.
- Server rejects forbidden Content Manager API calls.
- Role changes take effect after session refresh or permission reload.

## SQL Files Implementing Security

- `002_core_profiles_roles_permissions.sql`: roles, permissions and assignments.
- `010_rls_policies.sql`: table-level RLS policies.
- `011_indexes_constraints_functions_triggers.sql`: permission helper functions and audit triggers.
- `012_seed_initial_data.sql`: initial roles/permissions.
- `013_validation_queries.sql`: RLS/RBAC validation checks.


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
