# Decision Record — Child Authentication, ID Size, Proration, Payment Provider (2026-06-27)

Status: **Accepted** (confirmed by the owner, "yes to all").
Scope: child login model, child ID size, add-subjects-later pricing, payment-provider posture.
Supersedes: the older open questions logged in `STATUS.md` and the earlier "6-digit" references.

## 1. Child ID size — 8 digits

- Child login ID is **8 numeric digits**, zero-padded → ~**100,000,000** ID space.
- Rejected 6 digits (~1,000,000): too small — collision pressure during random generation past ~100–200k children, and the whole space is trivially enumerable.
- 8 digits is future-proof for the platform's realistic scale (millions of children), keeps collisions negligible, and is still memorable for a child.
- **Generation:** server-side only, **random** (NOT sequential — sequential is enumerable), zero-padded, DB unique constraint, retry-on-conflict. Capacity monitoring with an alert before exhaustion. A future migration may extend the format without breaking existing IDs.
- The ID is a **public username, not a secret.** Security comes from the password + rate-limiting/lockout, not from ID secrecy.

## 2. Child credential strategy — reuse Supabase Auth (no hand-rolled auth)

- A child is a **real Supabase Auth user** created by the parent (service role) with a **synthetic, non-routable internal email** derived from the 8-digit ID, e.g. `c<8digits>@children.invalid` (`.invalid` is RFC 2606 reserved → can never send mail). The **parent sets the child's password**.
- **Login is server-side:** the child enters only **8-digit ID + password**; the server maps ID → synthetic email → `signInWithPassword`, setting httpOnly cookies. The synthetic email/mapping is never exposed to the client. The child then has a normal Supabase session/JWT → RLS via `auth.uid()` works like parent/admin.
- **Why:** delegating password hashing (bcrypt), sessions, refresh tokens, and JWT/RLS to Supabase Auth removes the highest-risk custom security code. We never store the child password in our tables.
- **Rejected:** a custom `child_credentials` table with hand-rolled password hashing + custom JWT/session issuing — too much bespoke security-critical code, too easy to get wrong.
- **Hardening:** rate-limiting + temporary lockout on child (and parent) login (N failures per ID + per IP); minimum child password length (≥8; disallow password == ID); parents view the child's 8-digit ID and reset the child password via **service-role** server actions only; no password-recovery emails for child accounts. RLS scopes the child to its own data; the child can never purchase or edit payment/subscription.
- Honest framing: this is not "unbreakable" (nothing is) — it minimizes attack surface and is defensible in a security review.

## 3. Add-subjects-later pricing — next-cycle pricing (MVP)

- When a parent adds a subject to an existing child subscription, the child gets **access immediately**, and the **new total applies at the next renewal** (no mid-cycle proration math in MVP).
- Simple, user-friendly, bug-free; all pricing computed server-side; the client can never set price/subjects.
- Configurable business rule — we can switch to provider-native proration (e.g. Stripe) later.

## 4. Payment provider — provider-agnostic

- **Pricing/plans live in OUR database** (subject pricing, plan durations, launch-promo/trial config). The provider is only the charging mechanism behind a `PaymentService` abstraction (provider field + provider_ref + webhook handler).
- **Stage 7 builds the pricing/subscription/payment/checkout SCHEMA provider-agnostically. No real provider, no API keys, no domain.** Real integration (Stripe or a local AZ provider: Kapital/Azericard/ePoint/Portmanat) is **Stage 11**. "Stripe-first" remains the planning example only; the final provider is not yet chosen.

## Defaults (unless changed later)

- Child password ≥ 8 chars; lockout after ~5–10 failed attempts.
- Placeholder pricing 1 AZN/subject, admin-configurable.
- Final pricing numbers and the actual payment provider are decided before Stage 11.
