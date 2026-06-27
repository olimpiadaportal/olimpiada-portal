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

## Answer Option Management

Options support localized text/media and correctness flags. Correctness is never exposed to student before result.

## Explanation Management

Explanations can be text/media and localized. MVP requires Azerbaijani explanations for published core content where feasible.

## Test Package Management

Tests include questions, duration, scoring policy, availability, subscription requirement, randomization and publish status.

## Daily Task Package Management

Daily tasks include grade, subject, date, question list, points and status.

## Multilingual Content

Azerbaijani for MVP. Russian/English translation readiness through translation tables.

## Media Upload Rules

Use Supabase Storage for optimized images, small audio files and avatars. Validate MIME type, file size, image dimensions and audio duration. Store only file metadata/object paths in PostgreSQL; never store binary files in database rows. Keep draft media private and use signed URLs for private files.

## Review Workflow

Content Manager submits; Admin reviews; Admin approves/rejects/publishes. No default self-approval.

## Quality Control

Duplicate detection, high-error review, explanation completeness, taxonomy validation, content status audit.
