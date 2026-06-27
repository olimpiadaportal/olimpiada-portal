# Web App Claude Code Rules


## Repository Placement and Related Files

- Intended path: `web-app/markdowns/WEB_APP_CLAUDE_CODE_RULES.md`
- Folder: `web-app/markdowns/`
- Primary readers: Claude Code and AI coding agents
- Related master docs: All Web App master and derived docs
- Scope controlled by this file: Implementation rules for Web App coding sessions
- Source-of-truth level: Derived app-specific AI rules


## Rules

- Read required docs before coding.
- Do not implement Admin Panel features in Web App (incl. News, Olympiad package, and payment management — those are Admin-only). News is read-only here.
- Only parents self-register (email/password). Do not build child/student self-registration or student email login. Children log in with a 8-digit ID + parent-created password.
- Children never purchase. Subjects, subscriptions, sibling discount, checkout, and olympiad purchases are parent-only; never surface purchase flows in a child session.
- Do not bypass backend authorization.
- Do not duplicate business logic in UI components.
- Keep UI replaceable and component-driven.
- Keep backend calls typed and validated.
- Do not expose correct answers before result state.
- Do not trust client score calculations.
- Do not trust client-supplied subject, price, discount, trial, subscription/payment status, access flags, or the 8-digit child ID — all are server-authoritative.
- Do not let users select difficulty; the server provides an auto-mixed set (25 random questions for olympiad attempts).
- Wallpaper customization uses a predefined catalog only (no arbitrary colors/themes).
- Do not use SMS or implement optional bank transfer.
- Do not implement Flutter/mobile app here.
- Do not place SQL files under `web-app/`.

## First Web App Checklist

- Set up Next.js app structure under `web-app/`.
- Add public marketing layout and routes (Home, About, News list/detail, Pricing, Olympiad Preparation overview, Subjects, FAQ, Contact, Login/Register).
- Add parent and child (student) route groups; `/register` is parent-only, child entry is `/student/login` (8-digit ID + password).
- Add Supabase browser/server clients safely; wire parent auth and the documented child-credential (8-digit ID + parent-set password) login.
- Add typed service wrappers (parent register/login, createChild, setChildPassword, child login, dashboards, subject selection + server pricing preview, subscription checkout, wallpapers, olympiads, news).
- Add validation schemas (incl. parent-only purchase guards and server-priced subscription/olympiad inputs).
- Add the add-child wizard (child info → subjects on a separate page with live pricing preview → set child password → checkout → 8-digit ID reveal).
- Add the predefined wallpaper picker on the child profile.
- Add dashboard shells and loading/error/empty/locked-expired states.
- Add protected route middleware (parent vs child role gating).
- Add subscription-required and access-locked state components.
