# Supabase Schema Security Plan


## Repository Placement and Related Files

- Intended path: `supabase/markdowns/SUPABASE_SCHEMA_SECURITY_PLAN.md`
- Folder: `supabase/markdowns/`
- Primary readers: Database architect, security engineer, Supabase implementer, Claude Code
- Related master docs: `docs/master/02_ARCHITECTURE_DATABASE_AND_BACKEND.md`, `docs/master/03_AUTH_RBAC_SECURITY_AND_AUDIT.md`
- Scope controlled by this file: Schema grouping and security plan for Supabase
- Source-of-truth level: Derived backend security guide


## Schema Overview

Table groups:

1. Core identity: profiles, roles, permissions, profile_roles. **Parent profiles** self-register via Supabase Auth; **child/student profiles** are created by a parent (never self-register) and carry a server-generated **8-digit unique numeric ID** plus a parent-set password credential. Parent→child links are auto-created (no manual linking as the primary flow). Includes per-child subject selections, the predefined **wallpapers catalog**, and the **per-child wallpaper/background selection**.
2. Academic taxonomy: schools, districts, grades, subjects, topics, subtopics. Subjects anchor the four MVP subjects (Math, Science, Məntiq, İngilis dili).
3. Content: questions, translations, options, explanations, tests. Difficulty (easy/medium/hard) is retained in the data model only and auto-mixed; never user-selected.
4. Learning activity: attempts, daily tasks, progress snapshots. Each attempt records the server-side random 25-question selection.
5. Leaderboards and analytics.
6. Subscriptions, payments, coupons: **child-based subscriptions** (per child: selected subjects, weekly/monthly/yearly duration, status, access flag), **subject-based pricing config** (placeholder 1 AZN/subject + full-package option), **trial** (7-day) and **launch-promo** (first ~1 month free) config, **payment records**, **checkout sessions**, and **sibling-discount calc/audit fields** (1st 0% / 2nd 15% / 3rd+ 20%, backend-computed). No Discount-Settings admin module (fixed business rule).
7. Notifications, support and audit.
8. Storage metadata and policies (avatars, question/explanation media, plus the new wallpaper, news, and olympiad media buckets — DB stores object path/metadata only).
9. Settings and feature flags.
10. **News**: news articles (title, body with inline links, image metadata, created_at/updated_at, publish/active status) and news media metadata. Public + in-app readable; Admin-only CRUD. (Canonical file `014_news.sql`.)
11. **Olympiad Preparation (Olimpiada Hazırlığı)**: packages (name, subject/domain, grade/class-target field, description, start/end dates, price, status, optional banner), package question pool, package purchases (= lifetime access), purchase/attempt records, per-attempt random 25-question selection records, and package archive status. Separate paid add-on, parent-purchased only. (Canonical file `015_olympiad_preparation.sql`.)

## RLS Overview

RLS must enforce:

- Child/student owns own learning data and reads only own profile/content; a child cannot read another child.
- Parent reads/manages only own children (auto-linked); parent cannot read or manage unlinked children.
- A child can never purchase, check out, or edit any payment/subscription/access row; all purchases originate from the parent account.
- A parent can never grant paid access without backend/webhook-confirmed payment; access flags are never client-writable.
- Admin has privileged access through controlled policies/server functions, including News and Olympiad Preparation modules.
- Content Manager only accesses assigned/own content workflow and is **denied** News, Olympiad Preparation, payment, and subscription modules.
- News rows are public/in-app readable but Admin-only for create/update/publish/archive/deactivate.
- Olympiad packages: active listings are readable per status; **purchased packages remain readable (lifetime access) for the owning parent/child even after the listing is archived**; purchase records are never deleted.
- Payment, checkout, and webhook events are service-role only; sibling discount, price, trial dates, and subscription status are computed/written server-side only.
- Audit logs are admin-read-only and append-only.
- The 8-digit child ID is server-generated, unique (DB constraint), and never trusted from the client.

## RBAC Table Strategy

Use `roles`, `permissions`, `role_permissions`, `profile_roles`. Do not rely only on a text role column in profiles.

## Parent/Student Access Strategy

Parent→child ownership is the source of truth for parent access and is **auto-created** when a parent
creates a child (no manual linking as the primary flow; a `parent_student_links`-style link table may
still back this relationship and may retain a secondary manual-link concept only as an edge case).
Policies check the active parent→child relationship.

### Child Credential Strategy

- Children do not self-register and do not log in with email.
- Each child has a server-generated **8-digit numeric unique ID** (zero-padded, DB unique constraint,
  collision-safe generation function — DB sequence or retry-on-collision helper). Never trust a
  client-supplied child ID.
- The child's login secret is a **parent-set password**. Document the implementation as either a
  custom child-credential record (hashed password stored/verified server-side) or a mapped Supabase
  Auth identity provisioned server-side; either way, child credential creation/verification is
  server-side only and the parent sets/resets the password from the parent account.
- Add a capacity/monitoring note: a 8-digit space is finite; monitor utilization. MVP uses 8 digits;
  a future migration may extend the format.

### Subscription, Trial, and Pricing Access Strategy

- Subscriptions are per child. A child's paid features (tests, daily tasks, olympiad prep, paid
  content, paid-dependent progress) are gated by that child's subscription status/access flag.
- Launch promo (first ~1 month free) and a 7-day trial after promo are config-driven, set/evaluated
  server-side. On failed charge after trial/renewal, the backend auto-blocks all paid child access;
  the parent account itself stays accessible and the child dashboard shows locked/expired states.
- Subject-based pricing, sibling discount (2nd 15% / 3rd+ 20%), and proration on later subject
  additions are computed backend-side and never client-controlled.

## Admin/Content Manager Access Strategy

Admin access requires explicit permissions and is the only role that manages News, Olympiad
Preparation packages/pools, and payment/subscription-facing modules. Content Manager access is
limited to content creation/review workflows and assigned subject analytics; Content Managers must
**not** manage News, Olympiad Preparation, or any payment/subscription module. There is no
Discount-Settings admin module — the sibling discount is a fixed business rule.

## Payment Data Protection

- Payments readable only by the owning parent and admin; children can never read or write payment, checkout, or subscription rows.
- Provider payloads restricted to admin/service role.
- Webhook events are append-only and idempotent.
- Subscription activation, blocking, trial dates, price, selected subjects, sibling discount, and access flags are written server-side only (backend/webhook-verified) — never from client redirects.
- Olympiad package purchases are one-time package purchases granting lifetime access after successful payment; purchase records are never deleted.

## Audit Logging Strategy

Audit logs must capture actor, action, target, before/after, timestamp, IP/user agent where available, severity, metadata and success/failure.

## Storage Bucket Security

- No public writes.
- No binary files in PostgreSQL tables; store only storage metadata in database rows.
- Use Supabase Storage for optimized images, small audio files, profile avatars and temporary admin imports.
- New buckets for the business modules (defined in `009_storage_buckets_policies.sql`):
  - `wallpaper-assets` — predefined wallpaper/background images for child dashboards (read-eligible to children per catalog; uploads admin-only).
  - `news-media` — News article images (public-read for published items; writes admin-only).
  - `olympiad-media` — Olympiad package banners/images (writes admin-only).
  - In all cases the DB stores only object path/metadata, never binary data.
- Apply upload limits for MIME type, file size, image dimensions and audio duration.
- Resize/compress images before or during upload.
- Draft content media private to author/admin.
- Signed URLs for private assets.
- Published educational media and published News/wallpaper assets can be public if approved.
- Large PDFs, video lessons and large media libraries are not current MVP storage requirements.

## PII Handling

Minimize PII. Phone optional only. Avoid public full names in leaderboard. Exports audited.

## Validation Expectations

`013_validation_queries.sql` must include checks for RLS, roles, parent→child ownership, payment
visibility, audit immutability and published content access, plus the new-module checks: 8-digit
child ID uniqueness/format, child write-denial on payment/subscription/checkout, child-reads-only-own
isolation, Content Manager denial on News/Olympiad/payment, News admin-only CRUD, subject-pricing /
trial / launch-promo config presence, sibling-discount audit fields, and olympiad lifetime-access
reads surviving listing archive.
