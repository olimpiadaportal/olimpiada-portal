# Admin Panel Content Management


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_CONTENT_MANAGEMENT.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Content lead, Admin Panel developer, Claude Code
- Related master docs: `docs/master/05_ADMIN_PANEL_AND_CONTENT_MANAGEMENT.md`
- Scope controlled by this file: Content lifecycle and CMS implementation guide
- Source-of-truth level: Derived content execution guide


## Content Lifecycle

`draft -> in_review -> approved -> published -> archived` with `rejected` returning to draft after revision.

## Question Management

Fields: grade, subject, topic, subtopic, type, difficulty, olympiad type, source, score, status, translations, media, options, explanation.

Difficulty (easy/medium/hard) is a data-model field used only for internal balancing. Users (students) NEVER choose difficulty. Every test attempt receives an auto-mixed random set; the model keeps difficulty so the system can mix levels, not so a user can select one.

## Answer Option Management

Options support localized text/media and correctness flags. Correctness is never exposed to student before result.

## Explanation Management

Explanations can be text/media and localized. MVP requires Azerbaijani explanations for published core content where feasible.

## Test Package Management

Tests include questions, duration, scoring policy, availability, subscription requirement, randomization and publish status.

Each attempt draws a random mixed set of questions server-side. Users never select difficulty; easy/medium/hard are auto-mixed from available questions. If a difficulty level is short, the system continues with whatever is available rather than failing. There is no admin difficulty-ratio configuration in the MVP.

## Daily Task Package Management

Daily tasks include grade, subject, date, question list, points and status.

## Olympiad Preparation Package Management (Admin-only)

Olympiad Preparation is a SEPARATE paid add-on module, distinct from regular subscriptions. Only Administrators manage these packages; Content Managers are forbidden from them.

Package fields:

- Olympiad name.
- Subject / domain (if relevant).
- Grade/class TARGET — a structured data-model field (not free text), used for filtering and targeting.
- Short description.
- Start date (publish/availability start).
- Olympiad / end date.
- Package price.
- Status (draft / active / archived-for-sale).
- Question/test pool (the trial-test question bank for this package).
- Optional image/banner stored in Supabase Storage (DB stores object path/metadata only).

### Olympiad Question Pool / Trial-Test Management

- Each package owns a question pool (e.g. ~500 questions).
- Each attempt selects 25 random questions server-side, with a NEW random mix on every attempt.
- If fewer than 25 questions exist in the pool, the system uses the available questions instead of failing.
- Difficulty (easy/medium/hard) stays in the model and is auto-mixed; users never choose difficulty.

### Olympiad Lifecycle, Archiving, and Lifetime Access

- A package is active from its publish/start date until the olympiad/end date.
- After the olympiad date the listing AUTO-ARCHIVES for new sales/listing (no longer purchasable or shown as available).
- Purchasers keep LIFETIME access. Purchased packages and purchase records are NEVER deleted and remain fully accessible after archive.
- Only soft-archive listings; never hard-delete a package that has purchases.

### Olympiad Package History

- Admins can view purchase/history records for each package.
- History shows: package name, child, grade/class target, purchase date, olympiad/end date, price paid, and status (active / archived / purchased / expired-for-sale-but-accessible), plus linked question-pool info where relevant.
- Purchased records are permanent and read-only for monitoring.

## News Management (Admin-only)

News is general (no categories in v1), shown on both the public website and in-app. Only Administrators manage News; Content Managers are forbidden.

Fields:

- Title.
- Body, with inline links allowed inside the body.
- Image stored in Supabase Storage (DB stores object path/metadata only).
- Auto `created_at` and auto `updated_at`.
- Publish/active status.

Admins create, edit, publish, archive, or soft-deactivate news items following the existing destructive-action rules (prefer archive/deactivate over delete).

## Multilingual Content

Azerbaijani for MVP. Russian/English translation readiness through translation tables.

## Media Upload Rules

Use Supabase Storage for optimized images, small audio files and avatars. Validate MIME type, file size, image dimensions and audio duration. Store only file metadata/object paths in PostgreSQL; never store binary files in database rows. Keep draft media private and use signed URLs for private files.

## Review Workflow

Content Manager submits; Admin reviews; Admin approves/rejects/publishes. No default self-approval.

## Quality Control

Duplicate detection, high-error review, explanation completeness, taxonomy validation, content status audit.
