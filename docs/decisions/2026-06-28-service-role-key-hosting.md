# Decision Record — Service-Role Key Hosting (2026-06-28)

Status: **Accepted** (owner confirmed).
Scope: where the Supabase service-role key lives and how privileged server operations are hosted.
Related: `docs/decisions/2026-06-27-child-auth-and-pricing-decisions.md`, `web-app/src/lib/supabase/admin.ts`.

## Decision

The Supabase **service-role key is hosted as a SERVER-ONLY environment variable in the `web-app`** (Next.js) and used only by server code (Server Actions / Route Handlers) for privileged operations that RLS intentionally forbids to normal users:

- child account provisioning (`createChild` → `admin.createUser` + `create_child_account` RPC),
- child password reset (`resetChildPassword` → `admin.updateUserById`),
- login-lockout bookkeeping (`is_child_login_locked` / `record_child_login_attempt`),
- **Stage 11** payment/webhook activation (same pattern).

It is read by exactly one module, `web-app/src/lib/supabase/admin.ts`, which is marked `import "server-only"`.

## Why (and why this is safe)

Creating/altering a Supabase Auth user requires the Auth admin API, which only the service-role key can call — so the key must exist server-side somewhere. Hosting it in the web-app server runtime is safe **because it never reaches the browser**:

- no `NEXT_PUBLIC_` prefix → Next.js never bundles it into client JS;
- `import "server-only"` → the build fails if `admin.ts` is ever pulled into client code;
- on Vercel it is a (non-public) Environment Variable injected only into the serverless/edge runtime.

This is the standard Supabase + Next.js + Vercel pattern. The residual risk is application-level (a privileged action with a weak authorization check), not key exposure.

## Rejected (for now)

Isolating privileged operations in **Supabase Edge Functions** (so the web-app holds only the anon key). More least-privilege and a smaller blast radius, but more infrastructure and another deploy target. May be revisited at production-hardening / security-review time.

## Binding rules

- **Never** prefix the service key with `NEXT_PUBLIC_`. Never commit it (`.env.local` only locally).
- Every privileged server action MUST authenticate + authorize the caller (verify the logged-in parent equals the target `parentProfileId` / owns the child) **before** using the admin client.
- `admin.ts` is the ONLY module that reads the key; keep `import "server-only"`.
- **Vercel deploy:** add `SUPABASE_SERVICE_ROLE_KEY` as a non-public Environment Variable. Use the **dev/staging** project key for Preview and a **separate production project** key for Production. Never share prod keys with preview branches.
- Reuse this exact posture for Stage 11 payment webhooks.
