"use server";

// Admin Subscriptions section — Administrator-only (Content Managers must
// never reach subscription/payment modules).
//
// Reads use the SERVICE-ROLE admin client (bypasses RLS) the same way
// accounts.ts / freeAccess.ts do, even though child_subscriptions RLS already
// grants admins full select — this keeps the module consistent with the rest
// of the Accounts/Free-Access family and avoids relying on RLS alone for a
// cross-parent/cross-child listing query.
//
// Lifecycle WRITES never touch status/dates/amounts directly from here — they
// go exclusively through the SECURITY DEFINER RPC
// public.admin_manage_child_subscription (migration 077), which re-validates
// the Administrator role itself, enforces the legal transitions, and writes
// its OWN audit_logs row — so this file must NOT duplicate that audit write
// (mirrors the pattern in pricing.ts's saveSubjectPrice).
//
// payments / checkout_sessions are written by NO code today (ground truth,
// Round 31) — a demo/comped subscription never produces a payment row, so the
// detail view states that honestly instead of joining a table that would
// always read empty.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "@/app/(protected)/subscriptions/labels";
import {
  KNOWN_PROVIDERS,
  PLAN_INTERVALS,
  SUBSCRIPTION_ACTIONS,
  SUBSCRIPTION_PAGE_SIZE,
  SUBSCRIPTION_STATUSES,
  type SubscriptionAction,
} from "@/lib/admin/subscription-lifecycle";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Interpret a plain YYYY-MM-DD date input as Asia/Baku local time (UTC+4, no
// DST), returning its UTC ISO instant — same convention as the /audit page.
function bakuDateBoundIso(raw: string, endOfDay: boolean): string | null {
  if (!DATE_RE.test(raw)) return null;
  const iso = endOfDay
    ? `${raw}T23:59:59.999+04:00`
    : `${raw}T00:00:00.000+04:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// =====================================================================
// LIST
// =====================================================================

export type SubscriptionListParams = {
  page: number;
  q: string;
  status: string;
  interval: string;
  provider: string;
  periodEndFrom: string; // YYYY-MM-DD or ""
  periodEndTo: string; // YYYY-MM-DD or ""
};

export type SubscriptionListRow = {
  id: string;
  studentProfileId: string;
  ownerParentProfileId: string;
  childName: string;
  parentName: string;
  parentEmail: string | null;
  subjectNames: string[];
  interval: string;
  status: string;
  provider: string;
  currency: string;
  baseAmount: number | null;
  discountPercent: number;
  discountAmount: number | null;
  totalAmount: number | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionListResult = {
  rows: SubscriptionListRow[];
  total: number;
  loadError: boolean;
};

const PAGE_SIZE = SUBSCRIPTION_PAGE_SIZE;

function childName(s: { first_name: string | null; last_name: string | null } | null): string {
  if (!s) return "—";
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
}

export async function listSubscriptions(
  params: SubscriptionListParams,
): Promise<SubscriptionListResult> {
  await requireAdmin(); // authorize FIRST
  if (!hasServiceRole()) return { rows: [], total: 0, loadError: true };

  const page = Number.isFinite(params.page) && params.page >= 1 ? params.page : 1;
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(params.status)
    ? params.status
    : "";
  const interval = (PLAN_INTERVALS as readonly string[]).includes(params.interval)
    ? params.interval
    : "";
  const provider = (KNOWN_PROVIDERS as readonly string[]).includes(params.provider)
    ? params.provider
    : "";
  const fromIso = params.periodEndFrom
    ? bakuDateBoundIso(params.periodEndFrom, false)
    : null;
  const toIso = params.periodEndTo ? bakuDateBoundIso(params.periodEndTo, true) : null;

  const admin = createAdminClient();

  // Free-text search resolves to explicit id lists FIRST (mirrors accounts.ts's
  // multi-step approach) rather than filtering through embedded resources —
  // simpler and avoids PostgREST !inner-embed filter subtleties across TWO
  // different embedded tables (students + profiles) at once.
  const escaped = sanitizeSearchTerm(params.q);
  const orClauses: string[] = [];
  if (escaped) {
    const [profRes, studRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id")
        .or(`display_name.ilike.%${escaped}%,email.ilike.%${escaped}%`),
      admin
        .from("students")
        .select("profile_id")
        .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`),
    ]);
    const parentIds = ((profRes.data ?? []) as { id: string }[]).map((r) => r.id);
    const studentIds = ((studRes.data ?? []) as { profile_id: string }[]).map(
      (r) => r.profile_id,
    );
    if (parentIds.length) {
      orClauses.push(`owner_parent_profile_id.in.(${parentIds.join(",")})`);
    }
    if (studentIds.length) {
      orClauses.push(`student_profile_id.in.(${studentIds.join(",")})`);
    }
    // A search term that matches NEITHER a parent nor a child can never match
    // any subscription — skip the query rather than sending an impossible
    // `.or()` (an empty `in.()` list is rejected by PostgREST).
    if (orClauses.length === 0) return { rows: [], total: 0, loadError: false };
  }

  let qb = admin
    .from("child_subscriptions")
    .select(
      `id, interval, status, provider, currency, base_amount, sibling_discount_percent,
       discount_amount, total_amount, trial_ends_at, current_period_start, current_period_end,
       created_at, updated_at, student_profile_id, owner_parent_profile_id,
       students(first_name, last_name),
       profiles!owner_parent_profile_id(display_name, email),
       subscription_subjects(subjects(name))`,
      { count: "exact" },
    );

  if (orClauses.length) qb = qb.or(orClauses.join(","));
  if (status) qb = qb.eq("status", status);
  if (interval) qb = qb.eq("interval", interval);
  if (provider) qb = qb.eq("provider", provider);
  if (fromIso) qb = qb.gte("current_period_end", fromIso);
  if (toIso) qb = qb.lte("current_period_end", toIso);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count, error } = await qb
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[admin] subscriptions list failed", error.message);
    return { rows: [], total: 0, loadError: true };
  }

  const rows: SubscriptionListRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    studentProfileId: r.student_profile_id,
    ownerParentProfileId: r.owner_parent_profile_id,
    childName: childName(r.students),
    parentName: r.profiles?.display_name || "—",
    parentEmail: r.profiles?.email ?? null,
    subjectNames: ((r.subscription_subjects ?? []) as any[])
      .map((s) => s.subjects?.name)
      .filter(Boolean),
    interval: r.interval,
    status: r.status,
    provider: r.provider ?? "none",
    currency: r.currency ?? "AZN",
    baseAmount: r.base_amount === null ? null : Number(r.base_amount),
    discountPercent: Number(r.sibling_discount_percent ?? 0),
    discountAmount: r.discount_amount === null ? null : Number(r.discount_amount),
    totalAmount: r.total_amount === null ? null : Number(r.total_amount),
    trialEndsAt: r.trial_ends_at,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return { rows, total: count ?? 0, loadError: false };
}

// =====================================================================
// DETAIL
// =====================================================================

export type SubscriptionDetail = SubscriptionListRow & {
  providerSubscriptionId: string | null;
  trialStartedAt: string | null;
  childAccessStatus: string | null;
  childUniqueId: string | null;
  siblingDiscount: {
    childRank: number;
    discountPercent: number;
    appliedAt: string;
  } | null;
};

export async function getSubscriptionDetail(
  id: string,
): Promise<SubscriptionDetail | null> {
  await requireAdmin(); // authorize FIRST
  if (!UUID_RE.test(id)) return null;
  if (!hasServiceRole()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("child_subscriptions")
    .select(
      `id, interval, status, provider, provider_subscription_id, currency, base_amount,
       sibling_discount_percent, discount_amount, total_amount, trial_started_at,
       trial_ends_at, current_period_start, current_period_end, created_at, updated_at,
       student_profile_id, owner_parent_profile_id,
       students(first_name, last_name, access_status, child_unique_id),
       profiles!owner_parent_profile_id(display_name, email),
       subscription_subjects(subjects(name))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[admin] subscription detail load failed", error.message);
    return null;
  }
  const r = data as any;

  const { data: siblingRow } = await admin
    .from("sibling_discounts")
    .select("child_rank, discount_percent, applied_at")
    .eq("child_subscription_id", id)
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: r.id,
    studentProfileId: r.student_profile_id,
    ownerParentProfileId: r.owner_parent_profile_id,
    childName: childName(r.students),
    parentName: r.profiles?.display_name || "—",
    parentEmail: r.profiles?.email ?? null,
    subjectNames: ((r.subscription_subjects ?? []) as any[])
      .map((s) => s.subjects?.name)
      .filter(Boolean),
    interval: r.interval,
    status: r.status,
    provider: r.provider ?? "none",
    providerSubscriptionId: r.provider_subscription_id ?? null,
    currency: r.currency ?? "AZN",
    baseAmount: r.base_amount === null ? null : Number(r.base_amount),
    discountPercent: Number(r.sibling_discount_percent ?? 0),
    discountAmount: r.discount_amount === null ? null : Number(r.discount_amount),
    totalAmount: r.total_amount === null ? null : Number(r.total_amount),
    trialStartedAt: r.trial_started_at,
    trialEndsAt: r.trial_ends_at,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    childAccessStatus: r.students?.access_status ?? null,
    childUniqueId: r.students?.child_unique_id ?? null,
    siblingDiscount: siblingRow
      ? {
          childRank: siblingRow.child_rank,
          discountPercent: Number(siblingRow.discount_percent),
          appliedAt: siblingRow.applied_at,
        }
      : null,
  };
}

// =====================================================================
// LIFECYCLE ACTION — the ONLY way to change a subscription's status/dates.
// =====================================================================

export type ManageSubscriptionState =
  | { error?: string; ok?: boolean; status?: string; currentPeriodEnd?: string | null }
  | null;

// Raw Postgres SQLSTATE codes the RPC can raise (see migration 077). Matches
// the existing convention (stickers.ts/notifications.ts compare error.code
// against the raw SQLSTATE, not the exception NAME).
const CODE_FORBIDDEN = "42501"; // insufficient_privilege
const CODE_NOT_FOUND = "P0002"; // no_data_found
const CODE_CHECK = "23514"; // check_violation
const CODE_UNIQUE = "23505"; // unique_violation

export async function manageSubscription(
  _prev: ManageSubscriptionState,
  formData: FormData,
): Promise<ManageSubscriptionState> {
  await requireAdmin(); // authorize FIRST — before reading FormData

  const t = await getT();
  const lt = localStrings(await getLocale());

  const subscriptionId = String(formData.get("subscription_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const daysRaw = String(formData.get("days") ?? "").trim();

  if (!UUID_RE.test(subscriptionId)) return { error: t("err.server") };
  if (!(SUBSCRIPTION_ACTIONS as readonly string[]).includes(action)) {
    return { error: t("err.server") };
  }
  const typedAction = action as SubscriptionAction;

  let days: number | null = null;
  if (typedAction === "extend") {
    const n = Math.floor(Number(daysRaw));
    if (!Number.isFinite(n) || n < 1 || n > 730) {
      return { error: lt("subs.err.badDays") };
    }
    days = n;
  }

  // Request-scoped (anon-key + cookies) client — EXECUTE is granted to
  // authenticated and the RPC's OWN in-body is_admin() guard gates it, same
  // posture as saveSubjectPrice in pricing.ts.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_manage_child_subscription", {
    p_subscription_id: subscriptionId,
    p_action: typedAction,
    p_days: days,
  });

  if (error) {
    console.error(
      "[admin] subscription lifecycle action failed",
      subscriptionId,
      typedAction,
      error.message,
    );
    const code = (error as { code?: string }).code;
    const hint = (error as { hint?: string }).hint;
    if (code === CODE_FORBIDDEN) return { error: lt("subs.err.forbidden") };
    if (code === CODE_NOT_FOUND) return { error: lt("subs.err.notFound") };
    if (code === CODE_UNIQUE || hint === "duplicate_live_subscription") {
      return { error: lt("subs.err.duplicateLive") };
    }
    if (code === CODE_CHECK) {
      if (hint === "invalid_transition") return { error: lt("subs.err.invalidTransition") };
      if (hint === "bad_days") return { error: lt("subs.err.badDays") };
      if (hint === "unknown_action") return { error: lt("subs.err.unknownAction") };
    }
    return { error: t("err.server") };
  }

  // The RPC self-audits (admin.subscription.<action>) — do NOT duplicate with
  // writeAuditLog() here (same deliberate omission as pricing.ts).
  const result = (data ?? {}) as { status?: string; current_period_end?: string | null };
  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${subscriptionId}`);
  return {
    ok: true,
    status: result.status,
    currentPeriodEnd: result.current_period_end ?? null,
  };
}
