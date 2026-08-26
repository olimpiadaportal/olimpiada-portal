"use server";
// READ-ONLY finance / support reads.
//
// WHAT THIS IS FOR. Answering "what happened with this family's money" during a
// support call. It reads and it grants NOTHING: no refund, no mutation of any
// payment row, no gateway credential (only web-app holds those), and no audit
// row — the audit rule in CLAUDE.md scopes to MUTATIONS, and every one of the
// ~66 writeAuditLog call sites in this panel is a mutation.
//
// Refund issuance stays a documented manual runbook (STATUS.md, "REFERENCE —
// HOW TO REVERSE A CHARGE") by owner decision, because the platform has a
// NO-REFUND policy and the only remaining need is error correction.
//
// WHY EVERY EXPORT RE-GUARDS. `requireAdmin()` is the boundary, and it is ONE
// layer, deliberately stated rather than dressed up as defence-in-depth: the
// service-role client bypasses RLS, and `nav.adminOnly` is a sidebar filter that
// the guards module explicitly disclaims as a boundary. Overstating it is how
// someone later decides it is redundant and removes it.
//
// NOT `requirePermission("payments.read")`. That code is real and grantable, but
// requirePermission falls through requirePanelAccess() — admin OR content
// manager — so a Content Manager holding it would pass. CLAUDE.md forbids
// Content Managers in payment and subscription modules.
//
// Related hazards, so nobody "helpfully" grants a support role later:
// `subscriptions.manage` is a WRITE grant, and `payments.manage` opens both
// payments_write and checkout_write.
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import {
  CHILD_ID_RE,
  ORDER_RE,
  UUID_RE,
  deliveryState,
  isMoneyTakenNothingDelivered,
  moneyState,
  parseEventId,
  projectPayload,
  type DeliveryState,
  type MoneyState,
} from "@/lib/admin/finance-shape";

const SEARCH_LIMIT = 25;
const FAMILY_ROW_CAP = 200;

export type FinanceSearchRow = {
  parentProfileId: string;
  email: string;
  displayName: string;
  children: { name: string; childUniqueId: string | null }[];
};

export type FinanceAttention = {
  paymentMode: string;
  /** Money landed, nothing delivered — this view's own surface. */
  undelivered: number;
  /** Open checkout reviews; a COUNT only, the queue lives elsewhere. */
  openReviews: number;
  loadError: boolean;
};

export type FinanceOrderRow = {
  order: string;
  kind: string;
  intentKind: string | null;
  amount: number | null;
  currency: string;
  createdAt: string;
  money: MoneyState;
  delivery: DeliveryState;
  paidAt: string | null;
  redemptionNote: string | null;
  needsAttention: boolean;
};

export type FinanceFamily = {
  found: boolean;
  parentProfileId: string;
  email: string;
  displayName: string;
  children: { profileId: string; name: string; childUniqueId: string | null }[];
  orders: FinanceOrderRow[];
  /** Access that exists WITHOUT a payment behind it — the other half of the story. */
  grants: { label: string; source: string; endsAt: string | null }[];
  loadError: boolean;
};

export type FinanceOrderDetail = {
  found: boolean;
  order: string;
  row: FinanceOrderRow | null;
  ownerParentProfileId: string | null;
  events: {
    eventId: string;
    kind: string;
    createdAt: string;
    fields: { label: string; value: string }[];
  }[];
  loadError: boolean;
};

const EMPTY_ATTENTION: FinanceAttention = {
  paymentMode: "unknown",
  undelivered: 0,
  openReviews: 0,
  loadError: true,
};

/** The landing strip. Three numbers, each of which has a home nowhere else. */
export async function getFinanceAttention(): Promise<FinanceAttention> {
  await requireAdmin(); // authorize FIRST
  if (!hasServiceRole()) return EMPTY_ATTENTION;

  try {
    const admin = createAdminClient();
    const [mode, paid, reviews] = await Promise.all([
      admin.rpc("current_payment_mode"),
      // PAID BUT NEVER DELIVERED. Structurally invisible to the review queue,
      // which filters `redeemed_at is not null`.
      admin
        .from("checkout_sessions")
        .select("provider_session_id", { count: "exact", head: true })
        .eq("status", "paid")
        .not("intent_kind", "is", null)
        .is("redeemed_at", null),
      admin
        .from("checkout_sessions")
        .select("provider_session_id", { count: "exact", head: true })
        .not("intent_kind", "is", null)
        .not("redeemed_at", "is", null)
        .or("redemption_status.eq.needs_review,redemption_note.not.is.null"),
    ]);

    return {
      paymentMode:
        typeof mode.data === "string" && mode.data ? mode.data : "unknown",
      undelivered: paid.count ?? 0,
      openReviews: reviews.count ?? 0,
      loadError: false,
    };
  } catch {
    console.error("[finance] attention strip failed");
    return EMPTY_ATTENTION;
  }
}

/**
 * Resolve whatever support was given to a FAMILY.
 *
 * A case never starts from an order id, because the platform never shows one:
 * the result page withholds it, the invoices panel is empty, and the bank SMS
 * descriptor is deliberately generic. What arrives is a parent email, a child's
 * 8-digit id, a name, or a date and an amount.
 */
export async function searchFamilies(term: string): Promise<FinanceSearchRow[]> {
  await requireAdmin();
  if (!hasServiceRole()) return [];

  const q = (term ?? "").trim().slice(0, 120);
  if (q.length < 2) return [];
  // PostgREST `or()` takes an unquoted filter string, so anything that could
  // terminate it is removed rather than escaped.
  const safe = q.replace(/[,()*\\"']/g, " ").trim();
  if (!safe) return [];

  try {
    const admin = createAdminClient();
    const parentIds = new Set<string>();

    if (CHILD_ID_RE.test(q)) {
      // EXACT on the unique index — never ilike, which cannot use it.
      const { data } = await admin
        .from("students")
        .select("created_by_parent_profile_id")
        .eq("child_unique_id", q)
        .limit(5);
      for (const r of (data ?? []) as any[]) {
        if (r.created_by_parent_profile_id) parentIds.add(String(r.created_by_parent_profile_id));
      }
    }

    if (parentIds.size < SEARCH_LIMIT) {
      const [profs, studs] = await Promise.all([
        admin
          .from("profiles")
          .select("id")
          .or(`email.ilike.%${safe}%,display_name.ilike.%${safe}%`)
          .limit(SEARCH_LIMIT),
        admin
          .from("students")
          .select("created_by_parent_profile_id")
          .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
          .limit(SEARCH_LIMIT),
      ]);
      for (const r of (profs.data ?? []) as any[]) parentIds.add(String(r.id));
      for (const r of (studs.data ?? []) as any[]) {
        if (r.created_by_parent_profile_id) parentIds.add(String(r.created_by_parent_profile_id));
      }
    }

    const ids = Array.from(parentIds).slice(0, SEARCH_LIMIT);
    if (ids.length === 0) return [];

    const [profiles, children] = await Promise.all([
      admin.from("profiles").select("id, email, display_name").in("id", ids),
      admin
        .from("students")
        .select("created_by_parent_profile_id, first_name, last_name, child_unique_id")
        .in("created_by_parent_profile_id", ids),
    ]);

    const kids = new Map<string, { name: string; childUniqueId: string | null }[]>();
    for (const r of (children.data ?? []) as any[]) {
      const key = String(r.created_by_parent_profile_id);
      const list = kids.get(key) ?? [];
      list.push({
        name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
        // Listed here but NOT rendered in the list column — see the page.
        childUniqueId: r.child_unique_id ? String(r.child_unique_id) : null,
      });
      kids.set(key, list);
    }

    return ((profiles.data ?? []) as any[]).map((p) => ({
      parentProfileId: String(p.id),
      email: String(p.email ?? ""),
      displayName: String(p.display_name ?? ""),
      children: kids.get(String(p.id)) ?? [],
    }));
  } catch {
    console.error("[finance] search failed");
    return [];
  }
}

/** Everything one family's money did, plus the access that had no money behind it. */
export async function getFamilyFinance(parentProfileId: string): Promise<FinanceFamily> {
  await requireAdmin();
  const empty: FinanceFamily = {
    found: false,
    parentProfileId,
    email: "",
    displayName: "",
    children: [],
    orders: [],
    grants: [],
    loadError: false,
  };
  if (!UUID_RE.test(parentProfileId)) return empty;
  if (!hasServiceRole()) return { ...empty, loadError: true };

  try {
    const admin = createAdminClient();
    const [profile, kids, sessions] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, display_name")
        .eq("id", parentProfileId)
        .maybeSingle(),
      admin
        .from("students")
        .select("profile_id, first_name, last_name, child_unique_id")
        .eq("created_by_parent_profile_id", parentProfileId),
      admin
        .from("checkout_sessions")
        .select(
          "provider_session_id, kind, intent_kind, amount, currency, status, created_at, redeemed_at, redemption_status, redemption_note",
        )
        .eq("owner_parent_profile_id", parentProfileId)
        .order("created_at", { ascending: false })
        .limit(FAMILY_ROW_CAP),
    ]);

    if (!profile.data) return empty;

    const orderIds = ((sessions.data ?? []) as any[])
      .map((r) => String(r.provider_session_id))
      .filter(Boolean);

    // The union matters: payments.profile_id is `on delete set null`, so a
    // deleted parent's payments survive DETACHED and are reachable only by
    // order. Reading profile_id alone would show a family as never having paid.
    const [byProfile, byOrder, ents] = await Promise.all([
      admin
        .from("payments")
        .select("provider_ref, status, amount, currency, created_at, updated_at")
        .eq("profile_id", parentProfileId),
      orderIds.length
        ? admin
            .from("payments")
            .select("provider_ref, status, amount, currency, created_at, updated_at")
            .in("provider_ref", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      admin
        .from("entitlements")
        .select("student_profile_id, source, scope, starts_at, ends_at, revoked_at")
        .in(
          "student_profile_id",
          ((kids.data ?? []) as any[]).map((k) => String(k.profile_id)),
        ),
    ]);

    const payByOrder = new Map<string, any>();
    for (const p of [...((byProfile.data ?? []) as any[]), ...((byOrder.data ?? []) as any[])]) {
      if (p.provider_ref) payByOrder.set(String(p.provider_ref), p);
    }

    const now = Date.now();
    const orders: FinanceOrderRow[] = ((sessions.data ?? []) as any[]).map((s) => {
      const pay = payByOrder.get(String(s.provider_session_id));
      const money = moneyState({ kind: s.kind, paymentStatus: pay?.status });
      const delivery = deliveryState({
        kind: s.kind,
        intentKind: s.intent_kind,
        redeemedAt: s.redeemed_at,
        redemptionStatus: s.redemption_status,
        redemptionNote: s.redemption_note,
      });
      const paidAt = pay?.updated_at ? String(pay.updated_at) : null;
      return {
        order: String(s.provider_session_id),
        kind: String(s.kind ?? ""),
        intentKind: s.intent_kind ? String(s.intent_kind) : null,
        amount: s.amount === null || s.amount === undefined ? null : Number(s.amount),
        currency: String(s.currency ?? "AZN"),
        createdAt: String(s.created_at ?? ""),
        money,
        delivery,
        paidAt,
        redemptionNote: s.redemption_note ? String(s.redemption_note) : null,
        needsAttention: isMoneyTakenNothingDelivered({ money, delivery, paidAt, now }),
      };
    });

    // ACCESS WITHOUT A PAYMENT. Rendered beside the money so "no payment found"
    // reads as an ANSWER rather than a defect: a comped grant, a school licence
    // or the 1-day trial all produce real access and no charge.
    const nameById = new Map<string, string>();
    for (const k of (kids.data ?? []) as any[]) {
      nameById.set(
        String(k.profile_id),
        `${k.first_name ?? ""} ${k.last_name ?? ""}`.trim(),
      );
    }
    const grants = ((ents.data ?? []) as any[])
      .filter((e) => !e.revoked_at && e.source !== "abb_web")
      .map((e) => ({
        label: nameById.get(String(e.student_profile_id)) ?? "",
        source: String(e.source ?? ""),
        endsAt: e.ends_at ? String(e.ends_at) : null,
      }));

    return {
      found: true,
      parentProfileId,
      email: String(profile.data.email ?? ""),
      displayName: String(profile.data.display_name ?? ""),
      children: ((kids.data ?? []) as any[]).map((k) => ({
        profileId: String(k.profile_id),
        name: `${k.first_name ?? ""} ${k.last_name ?? ""}`.trim(),
        childUniqueId: k.child_unique_id ? String(k.child_unique_id) : null,
      })),
      orders,
      grants,
      loadError: false,
    };
  } catch {
    console.error("[finance] family read failed");
    return { ...empty, loadError: true };
  }
}

/** One order: the (session, payment) pair and the event narrative behind it. */
export async function getOrderDetail(order: string): Promise<FinanceOrderDetail> {
  await requireAdmin();
  const empty: FinanceOrderDetail = {
    found: false,
    order,
    row: null,
    ownerParentProfileId: null,
    events: [],
    loadError: false,
  };
  if (!ORDER_RE.test(order ?? "")) return empty;
  if (!hasServiceRole()) return { ...empty, loadError: true };

  try {
    const admin = createAdminClient();
    const [session, payment, byId, byPayload] = await Promise.all([
      admin
        .from("checkout_sessions")
        .select(
          "provider_session_id, kind, intent_kind, amount, currency, status, created_at, redeemed_at, redemption_status, redemption_note, owner_parent_profile_id",
        )
        .eq("provider", "azericard")
        .eq("provider_session_id", order)
        .maybeSingle(),
      admin
        .from("payments")
        .select("provider_ref, status, amount, currency, created_at, updated_at")
        .eq("provider", "azericard")
        .eq("provider_ref", order)
        .maybeSingle(),
      admin
        .from("payment_events")
        .select("event_id, payload_json, created_at")
        .eq("provider", "azericard")
        .in("event_id", [
          `cb:${order}`,
          `recon:${order}`,
          `redeem:${order}`,
          `reversed:${order}`,
        ]),
      // The `note:<order>:<md5>` chain and the rrn:/intref: claim rows cannot be
      // named from the order alone; they carry it in the payload instead. This
      // is what the new expression index serves.
      admin
        .from("payment_events")
        .select("event_id, payload_json, created_at")
        .eq("provider", "azericard")
        .eq("payload_json->>order", order),
    ]);

    if (!session.data) return empty;
    const s = session.data as any;
    const pay = payment.data as any;

    const money = moneyState({ kind: s.kind, paymentStatus: pay?.status });
    const delivery = deliveryState({
      kind: s.kind,
      intentKind: s.intent_kind,
      redeemedAt: s.redeemed_at,
      redemptionStatus: s.redemption_status,
      redemptionNote: s.redemption_note,
    });
    const paidAt = pay?.updated_at ? String(pay.updated_at) : null;

    const seen = new Set<string>();
    const events = [...((byId.data ?? []) as any[]), ...((byPayload.data ?? []) as any[])]
      .filter((e) => {
        const id = String(e.event_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((e) => ({
        eventId: String(e.event_id),
        kind: parseEventId(e.event_id).kind,
        createdAt: String(e.created_at ?? ""),
        // Allowlisted on the way OUT as well as on the way in: nothing in the
        // database constrains this column's shape, and the four TypeScript
        // layers that keep card data out of it live in web-app, which this
        // deployment does not inherit.
        fields: projectPayload(e.payload_json),
      }));

    return {
      found: true,
      order,
      ownerParentProfileId: s.owner_parent_profile_id
        ? String(s.owner_parent_profile_id)
        : null,
      row: {
        order: String(s.provider_session_id),
        kind: String(s.kind ?? ""),
        intentKind: s.intent_kind ? String(s.intent_kind) : null,
        amount: s.amount === null || s.amount === undefined ? null : Number(s.amount),
        currency: String(s.currency ?? "AZN"),
        createdAt: String(s.created_at ?? ""),
        money,
        delivery,
        paidAt,
        redemptionNote: s.redemption_note ? String(s.redemption_note) : null,
        needsAttention: isMoneyTakenNothingDelivered({ money, delivery, paidAt }),
      },
      events,
      loadError: false,
    };
  } catch {
    console.error("[finance] order read failed");
    return { ...empty, loadError: true };
  }
}
