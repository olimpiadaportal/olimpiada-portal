# 03 Authentication, RBAC, Security and Audit


## Repository Placement and Related Files

- Intended path: `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- Folder: `docs/master/`
- Primary readers: Security architect, backend engineer, Supabase implementer, admin-panel developer, QA lead, Claude Code
- Related master docs: `docs/master/00_MASTER_PROJECT_BLUEPRINT.md`, `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`
- Scope controlled by this file: Authentication, authorization, RBAC, RLS, security controls and audit logging
- Source-of-truth level: Master source of truth for security and permissions


## Authentication Flows

### Parent Registration/Login (only self-registering user type)

1. Parent registers with email/password through Supabase Auth (existing parent auth). Parents are the only user type that self-registers, and the only user type that pays.
2. Email verification is used if enabled.
3. Parent profile is created in `profiles` and `parents`.
4. Parent role is assigned through `profile_roles`.
5. Parent registration is free; payment begins only when the parent adds a child and activates access.
6. Parent reads/manages only their own children's data.

### Child/Student Creation (by a parent) and Login

Children do **not** self-register and do **not** log in with email. A child account is **created by a parent** through the multi-step "Add child" flow and logs in with a **8-digit numeric unique ID + a parent-set password**.

1. Parent opens the "Add child" flow from the parent dashboard:
   - Step 1 (child info): first name, last name, city, school, class/grade.
   - Step 2 (separate page): subject selection (`Math`, `Science`, `Məntiq`, `İngilis dili`); pricing preview updates with the selected subject count.
   - Step 3: parent sets the child's password.
   - Then payment/subscription activation.
2. On successful activation, the system assigns a **unique 8-digit numeric ID** (server-side, collision-safe; see credential strategy below) and records it on `students` / `child_unique_ids`.
3. The child profile is created in `profiles` and `students`, with `created_by_parent_profile_id` set; the Student role is assigned through `profile_roles`.
4. The child is **auto-linked** to the creating parent via `parent_student_links` (`link_origin = auto_created`). No separate manual linking step is required in the main flow.
5. Child logs in with the **8-digit ID + parent-set password** — never email, never self-registration.
6. Optional phone is not used for child authentication; no SMS verification.

### Child Credential Strategy (8-digit ID + parent-set password) — CONFIRMED 2026-06-27

Full rationale: `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`.

- The 8-digit ID is generated **server-side only** via collision-safe **random** generation (not sequential, to prevent enumeration), zero-padded, with a DB unique constraint (`students.child_unique_id`, allocation registry `child_unique_ids`). A client-supplied child ID is never trusted.
- **A child is a real Supabase Auth user** with a synthetic, non-routable internal email derived from the 8-digit ID (e.g. `c<8digits>@children.invalid`, an RFC-reserved `.invalid` domain that can never send mail). The parent sets the child's password. `child_credentials` links `student_profile_id`, `child_unique_id`, and the backing `auth_user_id`.
- **Login is server-side**: the child enters only the 8-digit ID + password; the server maps ID → synthetic email → `signInWithPassword` and sets httpOnly cookies. The synthetic email/mapping is never exposed to the client. The child then has a normal Supabase session/JWT, so RLS via `auth.uid()` works exactly like parent/admin.
- **Why this design:** it reuses Supabase Auth's hardened password hashing (bcrypt), sessions, refresh tokens, and RLS — we do NOT hand-roll password storage or session/JWT issuance (the highest-risk custom code). Passwords are stored only by Supabase Auth, never in application tables.
- **Hardening:** rate-limiting + temporary lockout on child (and parent) login (N failures per ID + per IP); minimum child password length (≥8; disallow password == ID); parents view the child's 8-digit ID and reset the child password via **service-role** server actions only; no password-recovery emails for child accounts.
- Capacity note: the 8-digit space is finite (~100,000,000); allocation usage must be monitored, with a future format extension as a planned migration.

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

**Primary flow — auto-link on child creation:** Because every child is created by a parent, the parent-child relationship is established automatically when the child account is created. The backend writes a `parent_student_links` row with `link_origin = auto_created` and `status = active`, and records the creation in the audit log. No code exchange or manual approval is required.

**Secondary / edge concept — manual linking (optional, not the main flow):** A manual link path may exist only for edge cases (e.g. migrating a child to a co-parent). If implemented:

1. Parent submits a verified link request for an existing child.
2. Backend validates the child exists and the link is not already active.
3. Link status becomes `active` or `pending` depending on approval policy, with `link_origin = manual`.
4. Audit log records link creation.

Edge cases: duplicate links, disputed parent access, deactivated child, suspended parent.

## Account Status

- `active`: normal access.
- `pending`: onboarding/verification incomplete.
- `suspended`: access blocked, data retained.
- `deactivated`: user cannot log in, data retained according to policy.
- `deleted`: soft deletion state unless legal hard-delete is required.

## RBAC Model

Use roles + permissions, not hardcoded role-only logic. Common permission naming:

- `users.read`, `users.manage`, `users.suspend`
- `children.create`, `children.manage_own` (parent-scoped child management)
- `content.create`, `content.edit_own`, `content.review`, `content.publish`, `content.archive`
- `tests.manage`, `daily_tasks.manage`
- `payments.read`, `payments.manage`, `subscriptions.manage`
- `news.manage` (Admin only — create/edit/publish/archive News)
- `olympiad.manage` (Admin only — olympiad packages and question pools)
- `analytics.read_admin`, `analytics.read_subject_limited`
- `audit.read`, `settings.manage`, `feature_flags.manage`

There is **no** "Discount Settings" permission or admin module: the sibling discount (2nd child 15%, 3rd+ child 20%) is a fixed business rule computed server-side, not an admin-configurable setting. `news.manage` and `olympiad.manage` are Administrator-only and are explicitly denied to Content Managers.

## Permission Matrix


| Permission area | Child / Student | Parent | Administrator | Teacher / Content Manager | Future School / Partner |
|---|---|---|---|---|---|
| Own profile | Read/update limited (incl. own wallpaper) | Read/update limited | Manage all | Read/update own | Read/update own |
| Child educational data | Own only | Own children only | All | Aggregated assigned subjects only | Future scoped school students |
| Child account creation | No (cannot self-register) | Create/manage own children | All | No | Future none |
| Parent data | None | Own only | All | No sensitive access | Future none/limited |
| Questions | Read published/subscribed | Read published | Full manage | Create/edit assigned drafts, submit review | Future none |
| Correct answers | After valid attempt/result | Own children results only | Full | For assigned content only | Future no |
| Tests/daily tasks | Read published/attempt (paid-gated) | Read own children status | Full manage | Create/prepare if permitted | Future view/assign if later |
| Subscriptions | View own status only; **cannot purchase or edit** | Manage own children subscriptions (subjects/duration), pay | Full monitor/manage | No access | Future no/payment-scoped only |
| Payments | View own paid status only; **cannot pay or edit payment** | Manage own payments only | Full monitor/manage | No access | Future no/payment-scoped only |
| News | Read published | Read published | Full manage (CRUD/publish/archive) | **No** (forbidden) | Future read only |
| Olympiad packages | Access purchased content; **cannot purchase** | Purchase + manage own; access via own children | Full manage (create/publish/archive, question pool) | **No** (forbidden) | Future no |
| Coupons | No | Redeem only | Full manage | No | Future maybe scoped |
| Notifications | Own | Own/children reports | Full manage | Content-related if permitted | Future scoped |
| Audit logs | No | No | Full read | Own submissions only, not audit logs | Future scoped no |
| Roles/permissions | No | No | Full manage | No | No |
| Feature flags/settings | No | No | Full manage | No | No |
| Exports | Own data only if implemented | Own children reports | Permitted exports | Limited educational aggregate only | Future scoped |


## Content Manager Permission Boundary

Content Manager may access only regular educational content workflows (questions, tests, daily tasks per the baseline) and limited educational analytics. Content Manager must not access:

- News management (Admin-only business module).
- Olympiad Preparation package / olympiad question-pool management (Admin-only business module).
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

- Children read/write own attempts/progress and own profile (incl. own wallpaper selection) only.
- Parents read/manage only **their own children** (`students.created_by_parent_profile_id` / `parent_student_links`); never other parents' children.
- Children **cannot** read or write any subscription/payment/checkout/purchase record beyond their own access status; child rows on `child_subscriptions` expose status only, never write.
- Child credentials and 8-digit ID allocation (`child_credentials`, `child_unique_ids`) are service-role/admin only; children cannot read them.
- `child_subscriptions`, `subscription_subjects`, `payments`, `checkout_sessions`, `sibling_discounts`, `coupon_redemptions`: payer parent reads own; service-role writes (webhook/server); admin full. Price/discount/status/access flags are never client-writable.
- News: public read of `published` rows; write/CRUD restricted to Administrators (service role / `news.manage`); Content Managers denied.
- Olympiad packages: public read of `active` listings; purchasers (and their children) read purchased packages and their attempts **even after archive** (lifetime access); write restricted to Administrators (`olympiad.manage`); Content Managers denied.
- `olympiad_purchases` / `olympiad_package_attempts` / `olympiad_attempt_selected_questions`: payer parent + own child read; selection set and scoring written server-side only; purchased records never deleted.
- `wallpapers` catalog is read-only to authenticated users; `child_wallpaper_selections` writable only by the owning child (from the child profile).
- Admins access via server-side privileged operations and admin RLS policies.
- Content Managers manage only assigned/draft regular content and review submissions; no News/Olympiad/payment/subscription access.
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
- `assertParentOwnsChild(parentId, childId)` (parent acts only on own children)
- `assertChildSelf(childId)` (child acts only on own data; never on payment/subscription)
- `assertContentOwnershipOrReviewPermission(contentId)`
- `assertActiveChildSubscription(childId, featureCode)` (paid-gating; blocks on failed charge)
- `assertOlympiadPackageAccess(childId, packageId)` (lifetime access for purchased packages)

## File Storage Security

- Public published question media may be readable.
- Draft content media should be accessible only to Admin/Content Manager.
- Reports, invoices and exports require signed URLs.
- Uploads validate MIME type and size.
- Media deletes should be soft or audited.

## Payment Security

- Only parents pay; children can never initiate checkout, pay, or edit any payment/subscription.
- Stripe secret key is server-only.
- Webhooks are verified with Stripe signature.
- Payment event IDs are idempotency keys.
- Client never decides payment success.
- Child subscription (and olympiad-package) activation happens **only after a verified webhook** — never from the client.
- **Failed charge auto-blocks access:** if a charge fails after trial/renewal, all paid child access is automatically blocked (tests, daily tasks, olympiad preparation, paid content, paid-dependent progress, any subscription-gated feature). The parent account itself stays accessible; the child dashboard shows locked/expired states.
- Olympiad package purchases are separate one-time package purchases granting **lifetime access** after successful payment; purchased records are never deleted, and remain accessible after a package is archived for sale.
- **Sibling discount is computed server-side** (fixed rule: 2nd child 15%, 3rd+ child 20%) and recorded for audit; it is never client-controlled.
- The client can **never** override price, discount, selected subjects, trial dates, subscription status, or access flags. All of these are computed and enforced server-side.

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
- Children are created by a parent and auto-linked to that parent; a parent reads only their own children (no access to other parents' children).
- Child login uses a server-generated 8-digit ID + parent-set password (never email); passwords are never stored in plaintext in application tables.
- Public website pages never expose private child data.
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
- Child account creation by a parent (with 8-digit ID allocation) and child credential/password set or reset.
- Parent/child auto-link creation; manual linking creation, approval, removal or dispute (edge cases).
- Content publish, unpublish, archive, reject or approve.
- Question creation, edit, deletion/archive and explanation changes.
- Test package creation, edit, publish and archive.
- Daily task package creation, edit, publish and archive.
- Child subscription status change (trialing/active/past_due/blocked/canceled) and access block/unblock on failed charge.
- Payment status change.
- Sibling-discount application (server-computed) at checkout.
- Olympiad package creation, edit, publish, archive and olympiad package purchase (lifetime access).
- News publish, archive or deactivation.
- Child wallpaper change (where sensitive).
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
| Parent sees another parent's child | Severe privacy breach | Ownership RLS (`created_by_parent_profile_id`/link) and server-side `assertParentOwnsChild` |
| Child initiates or edits a purchase/subscription | Revenue/access breach | Child role denied payment/subscription writes; server asserts `assertChildSelf`; activation webhook-only |
| Client overrides price/discount/subjects/trial/status/access | Revenue/access breach | All computed server-side; client values ignored; sibling discount fixed in code |
| Client supplies/forges a 8-digit child ID | Account takeover | Server-side generation, DB unique constraint, `child_credentials` service-role only |
| Failed charge not enforced | Revenue leak | Auto-block all paid child access on failed charge |
| Olympiad purchased package deleted/lost after archive | Customer harm | Soft-archive listing only; purchased records never deleted; lifetime-access reads |
| Content Manager accesses News/Olympiad/payments | Financial/PII/business leak | Permission matrix, route guards, RLS deny |
| Client fakes payment success | Revenue/access breach | Webhook-only activation |
| Student fetches correct answers before test | Academic integrity failure | Separate answer visibility policies and service responses |
| Client picks olympiad questions/difficulty | Integrity failure | Server-side random 25-question selection; users never choose difficulty |
| Leaderboard farming | Trust loss | Attempt caps, snapshots, suspicious activity review |
| Service role key leak | Full backend compromise | Never expose to client; env secret controls |
| SQL migration breaks RLS | Data leak/outage | Staging validation and RLS checklist |

## Security Acceptance Criteria

- RLS enabled on all sensitive tables.
- Anonymous users cannot read private data; public website never exposes private child data.
- Child cannot access another child's attempts, and cannot purchase or edit any subscription/payment.
- Parent can only access their own children.
- Server-side generated 8-digit child ID is unique and cannot be client-forged.
- Content Manager cannot access News, Olympiad, payments, subscriptions, settings or audit.
- Failed charge auto-blocks all paid child access.
- Olympiad purchases grant lifetime access and purchased records are never deleted.
- Price, discount, selected subjects, trial dates, subscription status and access flags cannot be set by the client.
- Webhook signature verification is tested.
- Audit logs are written for every required action.
- Service role key is absent from client bundles.

## RLS Testing Checklist

- Test as anonymous, child A, child B, parent (own child) , parent (other parent's child), content manager, admin.
- Attempt cross-user reads and writes (parent reading another parent's child must fail).
- Attempt direct Supabase table access from client.
- Attempt a child writing/initiating a subscription, payment, checkout or olympiad purchase (must fail).
- Attempt reading `child_credentials` / `child_unique_ids` as a child or parent (must fail; service-role only).
- Validate `child_subscriptions`/`payments`/`checkout_sessions`/`sibling_discounts` are not client-writable; parent reads only own.
- Validate News write is admin-only and Content Manager is denied; public reads only `published`.
- Validate Olympiad package write is admin-only and Content Manager is denied; purchasers/children retain read access after archive (lifetime).
- Validate `child_wallpaper_selections` writable only by the owning child.
- Validate correct answer visibility before and after submission.
- Validate payment tables are not client-readable except safe owner (payer parent) history.

## RBAC Testing Checklist

- Admin can perform all expected admin actions, including News and Olympiad management.
- Content Manager sees only regular educational content modules (no News, Olympiad, payments, subscriptions).
- Content Manager cannot reach hidden routes (News/Olympiad/payment) by URL.
- Server rejects forbidden Content Manager API calls (News/Olympiad/payment/subscription).
- Parent can manage only their own children; cannot reach another parent's children by URL/API.
- Child cannot reach any purchase/payment/subscription action by URL or API.
- There is no "Discount Settings" admin module (sibling discount is fixed in code).
- Role changes take effect after session refresh or permission reload.

## SQL Files Implementing Security

- `002_core_profiles_roles_permissions.sql`: roles, permissions and assignments, parents, parent-created children, 8-digit child IDs, child credentials, auto-link.
- `007_subscriptions_payments_coupons.sql`: child subscriptions, selected subjects, payments/checkout, sibling-discount calc, News, olympiad packages/purchases/attempts (RLS for parent-own-children, child-no-purchase, payment service-role only, news admin-only, olympiad lifetime-access).
- `010_rls_policies.sql`: table-level RLS policies (incl. parent-only-own-children, child-own-only, child-no-purchase, payment service-role only, news admin-only, olympiad lifetime-access reads).
- `011_indexes_constraints_functions_triggers.sql`: permission helper functions, collision-safe 8-digit ID generation, server-side pricing/discount/random-selection helpers and audit triggers.
- `012_seed_initial_data.sql`: initial roles/permissions (incl. `news.manage`, `olympiad.manage`, `children.*`), wallpaper catalog, subject pricing placeholders.
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
