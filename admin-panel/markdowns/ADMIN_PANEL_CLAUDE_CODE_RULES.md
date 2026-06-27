# Admin Panel Claude Code Rules


## Repository Placement and Related Files

- Intended path: `admin-panel/markdowns/ADMIN_PANEL_CLAUDE_CODE_RULES.md`
- Folder: `admin-panel/markdowns/`
- Primary readers: Claude Code and AI coding agents
- Related master docs: All Admin Panel master and derived docs
- Scope controlled by this file: Implementation rules for Admin Panel coding sessions
- Source-of-truth level: Derived app-specific AI rules


## Rules

- Read required docs before coding.
- Do not give Content Manager broad admin access.
- Keep News, Olympiad Preparation packages and their question pool, subscriptions, pricing plans, payments, and parent/child monitoring as Admin-only business/payment modules; Content Managers keep only regular educational content/question workflows.
- Do not build a "Discount Settings" / coupons module. The sibling discount is fixed in business logic (2nd child 15%, 3rd+ child 20%) and computed backend-side; never make it admin-configurable.
- Do not implement user-selected difficulty. Tests draw a random mixed set server-side (olympiad attempts select 25 random questions per attempt); easy/medium/hard stay in the model only for auto-mixing.
- Do not delete purchased olympiad packages or purchase records. Auto-archive listings after the olympiad date; purchasers keep lifetime access.
- Do not set payment/subscription activation from the panel; it is backend/webhook-driven. Never let the client/panel override price, discount, subjects, trial dates, or access flags.
- Do not expose sensitive data unnecessarily.
- Do not perform destructive actions without confirmation.
- Do not bypass audit logging (include News, olympiad package, pricing, subscription, payment-monitoring, and parent/child-monitoring actions).
- Keep UI replaceable.
- Keep backend calls typed and validated.
- Store media (news images, olympiad banners) in Supabase Storage; DB holds object path/metadata only.
- Do not place SQL under `admin-panel/`.
- Do not implement Student/Parent Web App flows here.
- Do not use SMS.

## First Admin Panel Checklist

- Set up Next.js structure under `admin-panel/`.
- Implement admin login and protected layout.
- Build permission-aware sidebar.
- Build taxonomy CRUD screens.
- Build question draft/create/edit flow.
- Build review workflow shell.
- Build News management (Admin-only): create/edit/publish/archive with image in Storage.
- Build Olympiad Preparation package management (Admin-only): package metadata + grade/class target, question pool, random 25-question selection, listing archive with lifetime purchaser access, package history.
- Build subscription/pricing-plan visibility, payment monitoring, and parent/child monitoring (Admin-only) once backend modules exist.
- Add audit log calls for sensitive actions, including the new business/monitoring modules.
- Add Content Manager route restrictions (block News, olympiads, subscriptions, pricing, payments, parent/child monitoring).
