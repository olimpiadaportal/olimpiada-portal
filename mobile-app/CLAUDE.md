# CLAUDE.md — Future Mobile App Instructions

## Scope

This folder is future-only.

Do not implement the mobile app during the current Web App/Admin Panel MVP.

The new parent/child + child-based subscription + Olympiad Preparation + News model is future-compatible: future mobile reuses the same Supabase backend contracts and RLS, and mobile remains future-only (no current implementation).

## Current Rule

Only maintain future-readiness documentation. Do not create React Native, Flutter, Expo, iOS, Android, or mobile source files unless the user explicitly starts the future mobile phase.

## Future Direction

The future mobile app can use the same Supabase backend:

- Supabase Auth
- PostgreSQL data model
- Supabase Storage media paths
- shared API/service contracts
- notification readiness
- subscriptions
- progress/leaderboard logic

The exact framework can be confirmed later. If React Native is chosen later, update `markdowns/FUTURE_MOBILE_READINESS.md` before implementation.

## First Steps for Future Mobile Phase

When the user explicitly starts mobile work:

1. Open root `STATUS.md`.
2. Read `../IMPLEMENTATION_EXECUTION_PLAN.md`.
3. Read `markdowns/FUTURE_MOBILE_READINESS.md`.
4. Confirm whether mobile will be React Native or Flutter.
5. Create/update a mobile-specific implementation plan before coding.
