// Plain (no "use server") shared module for the admin Subscriptions section.
// Pure derivations only, so it is safe to import from both the "use server"
// data/action module (subscriptions.ts) and Client Components (row/detail
// action buttons) — mirrors the olympiad-lifecycle.ts convention.
//
// The DB is the single source of truth for which lifecycle transitions are
// legal (see supabase/sql/migrations/2026_07_20_077_admin_subscription_lifecycle.sql,
// public.admin_manage_child_subscription). The maps below are a UI-side MIRROR
// of those exact rules so the panel only ever offers buttons the RPC will
// actually accept — the RPC itself remains the enforced authority; a stale
// mirror here would only hide/show a button, never let a bad transition through.

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PLAN_INTERVALS = ["week", "month", "year"] as const;
export type PlanIntervalValue = (typeof PLAN_INTERVALS)[number];

// Only values ever written today (ground truth: provider_subscription_id is
// never populated, no real provider is wired up yet). Kept as a whitelist for
// the filter dropdown; an unforeseen future provider still displays (just
// falls back to its raw value), it is simply not offered as a filter option
// until added here.
export const KNOWN_PROVIDERS = ["none", "admin_grant"] as const;

export const SUBSCRIPTION_ACTIONS = [
  "activate",
  "cancel",
  "expire",
  "extend",
] as const;
export type SubscriptionAction = (typeof SUBSCRIPTION_ACTIONS)[number];

// Shared page size (list query + pager math) — plain module so both the
// server data functions and the page's pager math read the same constant.
export const SUBSCRIPTION_PAGE_SIZE = 25;

// Mirrors admin_manage_child_subscription's transition guards exactly.
const ACTIONS_BY_STATUS: Record<string, readonly SubscriptionAction[]> = {
  incomplete: ["activate"],
  past_due: ["activate", "cancel", "expire", "extend"],
  trialing: ["cancel", "expire", "extend"],
  active: ["cancel", "expire", "extend"],
  canceled: ["expire", "extend"],
  expired: [], // terminal — the RPC accepts no action from this state
};

export function allowedSubscriptionActions(
  status: string,
): SubscriptionAction[] {
  return [...(ACTIONS_BY_STATUS[status] ?? [])];
}

// Pill color class (globals.css: pill-ok/pill-warn/pill-muted) — same
// semantics as accounts.ts's accessPill (active=ok, trialing=muted,
// past_due/expired=warn).
export function statusPillClass(status: string): string {
  switch (status) {
    case "active":
      return "pill-ok";
    case "past_due":
    case "expired":
      return "pill-warn";
    default:
      // trialing | canceled | incomplete
      return "pill-muted";
  }
}

// "demo" = no provider wired up yet (default 'none'); "comped" = an admin
// grant (admin_grant_child_access); anything else is a real future provider.
export type ProviderKind = "demo" | "comped" | "other";

export function providerKind(provider: string | null | undefined): ProviderKind {
  if (!provider || provider === "none") return "demo";
  if (provider === "admin_grant") return "comped";
  return "other";
}

export function providerBadgeClass(kind: ProviderKind): string {
  if (kind === "comped") return "pill-ok";
  if (kind === "other") return "pill-ok"; // a real provider = a real transaction
  return "pill-muted"; // demo
}
