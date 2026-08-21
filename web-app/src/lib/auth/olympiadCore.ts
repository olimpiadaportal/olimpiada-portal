// SERVER-ONLY olympiad purchase CORE (Stage M2) — the cookie-free heart of
// purchaseOlympiadForChild (lib/auth/olympiadService), shared by the web
// action (requireParent + getT) and the mobile BFF purchase endpoint
// (resolveBearerParent + verbatim keys). Validation order, flag gates and
// ownership re-verification are exactly the historical action behavior. Errors
// are i18n KEYS, never localized text.
//
// THE MOCK IS GONE (migration 127). This file used to carry
// `processOlympiadPayment`, a documented seam that returned `{ ok: true }`
// unconditionally and had never been wired to a provider. Everything downstream
// believed it: `purchase_olympiad` wrote an ACTIVE purchase, migration 124
// mirrored that into a LIFETIME entitlement, and no `payments` row existed
// anywhere. It was the single remaining reason the payment mode could not be
// switched to `real`.
//
// WHAT REPLACED IT. The package now runs on the same intent-first rail as the
// subscription: QUOTE (mutating nothing) -> INTENT -> full-page redirect ->
// verified payment -> `checkout_redeem_plan` grants. That inversion lives in the
// WEB ACTION (lib/auth/olympiadService), deliberately not here: this core is
// shared with the mobile BFF, and a checkout opened inside it would put a
// purchase path in an app binary. The apps stay purchase-silent by architecture
// (docs/STORE_PAYMENTS_COMPLIANCE.md §4), which is a structural property rather
// than a flag someone could flip.
//
// WHAT REMAINS HERE is the FREE half: a package the owner priced at zero, and a
// repeated click on a package the child already owns. Both go through
// `purchase_olympiad_if_free`, which grants and then rolls the whole statement
// back if its own answer priced the purchase above zero.
import "server-only";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { notifyOlympiadPurchased } from "@/lib/notifications/events";
import { writeAuditLog } from "@/lib/audit";
import { isUuid } from "@/lib/uuid";

export type PurchaseOlympiadCoreResult =
  | { ok: true; already?: boolean }
  | { ok: false; errorKey: string };

// ---- WHO IS ALLOWED TO REACH A PRICED PURCHASE (migrations 126, 127) --------
//
// The same posture the plan cores take, for the same reason: this core is
// shared by the web action and the MOBILE BFF, and the apps are purchase-silent
// BY ARCHITECTURE (docs/STORE_PAYMENTS_COMPLIANCE.md section 4). Google's
// consumption-only test is APP-WIDE, so a parent tab that can buy an olympiad
// package fails it exactly as a parent tab that can buy a subject would.
//
//   "free_only"  the WEB. It has already quoted; anything priced went to the
//                bank and never reached this function. A refusal here means the
//                price moved under that quote, and "look again" is the honest
//                thing to say about it.
//   "refuse"     the purchase-silent surface: a package whose SERVER-READ price
//                is above zero is refused BEFORE the RPC is reached at all, with
//                a sentence that names no price, no destination and no URL.
//
// BOTH CALL `purchase_olympiad_if_free`. The pre-check below is a courtesy that
// gives the app a better message; the guarantee is the wrapper's, inside the
// apply's own transaction, because a price read here and a price applied there
// are two statements under READ COMMITTED.
export type PaidChangePosture = "free_only" | "refuse";

/** SQLSTATE + hint `purchase_olympiad_if_free` raises for a priced package. */
const PG_CHECK_VIOLATION = "23514";
const HINT_PAYMENT_REQUIRED = "payment_required";

export type OlympiadQuoteCoreResult =
  | { ok: true; dueNow: number; currency: string; packageId: string }
  | { ok: false; errorKey: string };

/**
 * What ONE package costs THIS child, from the server, mutating nothing.
 *
 * It is `quote_olympiad_purchase` and nothing else — the same computation the
 * intent is opened for and the same one redemption re-runs (audit invariant H7:
 * the preview and the charge are one computation). The web action calls it to
 * decide whether a payment is required BEFORE anything is applied.
 *
 * NOT A MOBILE SURFACE: no route under app/api/mobile imports it, and none may.
 * An AZN amount must not cross into an app binary
 * (docs/STORE_PAYMENTS_COMPLIANCE.md §5).
 *
 * The caller MUST have authorized the parent and proven they own this child.
 */
export async function quoteOlympiadPurchaseCore(params: {
  parentProfileId: string;
  studentId: string;
  packageId: string;
}): Promise<OlympiadQuoteCoreResult> {
  const { parentProfileId, studentId, packageId } = params;
  if (!isUuid(studentId) || !isUuid(packageId)) {
    return { ok: false, errorKey: "poly.err.generic" };
  }
  if (!(await isFeatureEnabled("olympiad_module"))) {
    return { ok: false, errorKey: "poly.err.generic" };
  }
  {
    const { mode } = await getPaymentModeInfo();
    if (mode === "off") return { ok: false, errorKey: "gate.paymentsOff" };
  }
  if (!(await ownsChild(parentProfileId, studentId))) {
    return { ok: false, errorKey: "poly.err.generic" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("quote_olympiad_purchase", {
    p_student_profile_id: studentId,
    p_package_id: packageId,
  });
  if (error) return { ok: false, errorKey: olympiadErrorKey(error) };

  const row = (data ?? {}) as Record<string, unknown>;
  const dueNow = Number(row.due_now);
  if (!Number.isFinite(dueNow) || dueNow < 0) {
    console.error("[olympiad] quote returned no usable amount");
    return { ok: false, errorKey: "poly.err.generic" };
  }
  return {
    ok: true,
    dueNow,
    currency: typeof row.currency === "string" ? row.currency : "AZN",
    packageId,
  };
}

/**
 * Parent activates an olympiad package for one of their children — FREE ONLY.
 *
 * Server-side flag gates (olympiad_module + payments), ownership re-verified via
 * the admin client, then `purchase_olympiad_if_free` (service-role, idempotent
 * per child/package). The caller MUST have authorized the parent first.
 *
 * A PRICED PACKAGE NEVER GETS THROUGH HERE. On the web it went to the bank
 * before this was called; from the app it is refused before the RPC. And if the
 * price moves between the quote and this call, the wrapper rolls the grant back.
 */
export async function purchaseOlympiadForChildCore(params: {
  parentProfileId: string;
  studentId: string;
  packageId: string;
  /** REQUIRED, no default — see PaidChangePosture above. */
  paidChanges: PaidChangePosture;
}): Promise<PurchaseOlympiadCoreResult> {
  const { parentProfileId, studentId, packageId } = params;
  const fail: PurchaseOlympiadCoreResult = { ok: false, errorKey: "poly.err.generic" };

  // Server-side gates — the page hides the buy UI too; this stops hand-crafted
  // POSTs when an admin has switched a module off. Purchases proceed in
  // real or giveaway mode (giveaways cover free SUBJECT access only — never
  // olympiad play, so packages sell at full price); 'off' keeps the
  // payments-off message.
  if (!(await isFeatureEnabled("olympiad_module"))) return fail;
  {
    const { mode } = await getPaymentModeInfo();
    if (mode === "off") return { ok: false, errorKey: "gate.paymentsOff" };
  }

  if (!isUuid(studentId) || !isUuid(packageId)) return fail;

  const admin = getAdminClient();

  // Re-verify the parent owns this child (never trust the client's child id).
  if (!(await ownsChild(parentProfileId, studentId))) return fail;

  // Package must exist and be purchasable; the admin-defined price is read
  // server-side (client-sent amounts are ignored by design).
  const { data: pkg } = await admin
    .from("olympiad_packages")
    .select("id, status, price_amount, currency, sale_starts_at, sale_ends_at")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg || (pkg as { status?: string }).status !== "active") return fail;

  // Sale window pre-check. The purchase_olympiad RPC re-enforces this
  // atomically (check_violation, hint 'package_not_on_sale') — this is the
  // early exit that keeps the UI honest.
  {
    const p = pkg as { sale_starts_at?: string | null; sale_ends_at?: string | null };
    const saleStart = p.sale_starts_at ? Date.parse(p.sale_starts_at) : NaN;
    const saleEnd = p.sale_ends_at ? Date.parse(p.sale_ends_at) : NaN;
    if (
      (Number.isFinite(saleStart) && saleStart > Date.now()) ||
      (Number.isFinite(saleEnd) && saleEnd <= Date.now())
    ) {
      return { ok: false, errorKey: "poly.err.notOnSale" };
    }
  }

  const amount = Number((pkg as { price_amount?: number }).price_amount ?? 0);

  // Migration 126 — the purchase-silent surface may not reach a priced package.
  // A package the owner has priced at zero (a free or comped one) still works
  // from the app, which is the only kind an entitlement-reflecting binary should
  // ever be able to activate. A non-finite price is refused too: "we could not
  // tell what this costs" must never resolve to "so it is probably free".
  if (params.paidChanges === "refuse" && !(Number.isFinite(amount) && amount <= 0)) {
    return { ok: false, errorKey: "gate.notInApp" };
  }

  // Migration 127: the free-only wrapper, on BOTH surfaces. It grants and then
  // raises check_violation/payment_required if its own answer priced the
  // purchase above zero — which rolls back the purchase row and the entitlement
  // row the producer trigger wrote. There is no window in which a paid package
  // exists without a payment.
  const { data, error } = await admin.rpc("purchase_olympiad_if_free", {
    p_student_profile_id: studentId,
    p_package_id: packageId,
  });
  if (error) {
    // Purchase race: a concurrent insert hitting the child+package unique
    // constraint means the child ALREADY owns the package — treat as owned,
    // not as a failure (lifetime access, purchases are never deleted).
    const already =
      (error as { code?: string }).code === "23505" ||
      /duplicate key|unique/i.test(error.message ?? "");
    if (!already) {
      const hint = (error as { hint?: string | null }).hint ?? "";
      if (
        (error as { code?: string }).code === PG_CHECK_VIOLATION &&
        hint === HINT_PAYMENT_REQUIRED
      ) {
        // The package is priced. From the app that is a fact about where
        // purchases are managed; on the web it means the price moved between
        // the quote and this call, so "check again" is what happened.
        return {
          ok: false,
          errorKey: params.paidChanges === "refuse" ? "gate.notInApp" : "poly.err.priceMoved",
        };
      }
      return { ok: false, errorKey: olympiadErrorKey(error) };
    }
  }

  // Notify the child + the owning parent (best-effort; idempotency keys dedupe a
  // re-purchase of an already-owned package, so this never double-notifies).
  await notifyOlympiadPurchased({
    studentProfileId: studentId,
    parentProfileId,
    packageId,
  });

  const existing =
    error != null ||
    (data as { existing?: boolean } | null)?.existing === true;

  // Only a GENUINE new activation is audited — a repeat on an already-owned
  // package is a no-op (no charge, no new access).
  if (!existing) {
    await writeAuditLog(parentProfileId, "parent.olympiad_purchase", {
      targetTable: "olympiad_packages",
      targetId: packageId,
      metadata: { package_id: packageId, amount },
    });
  }

  revalidatePath("/olympiads");
  revalidatePath(`/children/${studentId}/olympiads`);
  revalidatePath("/subscription");

  return existing ? { ok: true, already: true } : { ok: true };
}

/** True when the parent created this child. Re-checked server-side, always. */
async function ownsChild(parentProfileId: string, studentId: string): Promise<boolean> {
  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  return !!student && student.created_by_parent_profile_id === parentProfileId;
}

/**
 * A raised olympiad error, as an i18n KEY.
 *
 * quote_olympiad_purchase re-states purchase_olympiad's guards and raises the
 * SAME hints, so one mapper serves both and a parent meets the sentences they
 * always did. Anything unrecognised becomes the generic failure — never the
 * database's own text.
 */
function olympiadErrorKey(error: { code?: string; hint?: string | null }): string {
  const hint = error.hint ?? "";
  // Sale window: server-time authoritative (the UI hiding is only cosmetic).
  if (hint === "package_not_on_sale") return "poly.err.notOnSale";
  // Round 34: the package's target grades do not include this child's grade.
  if (hint === "package_not_for_grade") return "poly.err.notForGrade";
  // Round 51 (audit F6): the DB payment kill switch (migrations 089/091).
  if (hint === "payments_disabled") return "gate.paymentsOff";
  // Migration 127: the child already holds lifetime access.
  if (hint === "already_owned") return "poly.err.alreadyOwned";
  return "poly.err.generic";
}
