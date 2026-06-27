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

1. Core identity: profiles, roles, permissions, profile_roles.
2. Academic taxonomy: schools, districts, grades, subjects, topics, subtopics.
3. Content: questions, translations, options, explanations, tests.
4. Learning activity: attempts, daily tasks, progress snapshots.
5. Leaderboards and analytics.
6. Subscriptions, payments, coupons.
7. Notifications, support and audit.
8. Storage metadata and policies.
9. Settings and feature flags.

## RLS Overview

RLS must enforce:

- Student owns own learning data.
- Parent reads only linked students.
- Admin has privileged access through controlled policies/server functions.
- Content Manager only accesses assigned/own content workflow.
- Payment events are service role only.
- Audit logs are admin-read-only and append-only.

## RBAC Table Strategy

Use `roles`, `permissions`, `role_permissions`, `profile_roles`. Do not rely only on a text role column in profiles.

## Parent/Student Access Strategy

`parent_student_links` is the only source of truth for parent access. Policies should check active link status.

## Admin/Content Manager Access Strategy

Admin access requires explicit permissions. Content Manager access is limited to content creation/review workflows and assigned subject analytics.

## Payment Data Protection

- Payments readable only by owner and admin.
- Provider payloads restricted to admin/service role.
- Webhook events are append-only and idempotent.

## Audit Logging Strategy

Audit logs must capture actor, action, target, before/after, timestamp, IP/user agent where available, severity, metadata and success/failure.

## Storage Bucket Security

- No public writes.
- No binary files in PostgreSQL tables; store only storage metadata in database rows.
- Use Supabase Storage for optimized images, small audio files, profile avatars and temporary admin imports.
- Apply upload limits for MIME type, file size, image dimensions and audio duration.
- Resize/compress images before or during upload.
- Draft content media private to author/admin.
- Signed URLs for private assets.
- Published educational media can be public if approved.
- Large PDFs, video lessons and large media libraries are not current MVP storage requirements.

## PII Handling

Minimize PII. Phone optional only. Avoid public full names in leaderboard. Exports audited.

## Validation Expectations

`013_validation_queries.sql` must include checks for RLS, roles, parent linking, payment visibility, audit immutability and published content access.
