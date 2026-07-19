// SERVER-ONLY olympiad purchase CORE (Stage M2) — the cookie-free heart of
// purchaseOlympiadForChild (lib/auth/olympiadService), shared by the web
// action (requireParent + getT) and the mobile BFF purchase endpoint
// (resolveBearerParent + verbatim keys). Validation order, flag gates,
// ownership re-verification, the MOCK payment seam and the purchase_olympiad
// RPC (already idempotent per child/package) are exactly the historical
// action behavior. Errors are i18n KEYS, never localized text.
import "server-only";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { notifyOlympiadPurchased } from "@/lib/notifications/events";
import { writeAuditLog } from "@/lib/audit";

export type PurchaseOlympiadCoreResult =
  | { ok: true; already?: boolean }
  | { ok: false; errorKey: string };

/**
 * MOCK PAYMENT — the single seam for a real provider.
 *
 * This is deliberately the ONLY place in the purchase flow that "talks to a
 * payment provider". Today it is a stub that always approves (no real charge —
 * mirrors the demo subscription payment). When the official provider is chosen,
 * replace ONLY this function body with the real charge call (create payment
 * intent → confirm → verify), keep the same result contract, and the rest of
 * the flow (authorization, flag gates, purchase_olympiad RPC, revalidation)
 * stays untouched. Never activate a purchase from client-submitted data —
 * real activation must remain webhook/server verified.
 */
async function processOlympiadPayment(_input: {
  parentProfileId: string;
  studentProfileId: string;
  packageId: string;
  amount: number;
  currency: string;
}): Promise<{ ok: boolean }> {
  return { ok: true };
}

/**
 * Parent buys an olympiad package for one of their children. Server-side flag
 * gates (olympiad_module + payments), ownership re-verified via the admin
 * client, then MOCK payment → purchase_olympiad RPC (service-role, idempotent).
 * The caller MUST have authorized the parent first.
 */
export async function purchaseOlympiadForChildCore(params: {
  parentProfileId: string;
  studentId: string;
  packageId: string;
}): Promise<PurchaseOlympiadCoreResult> {
  const { parentProfileId, studentId, packageId } = params;
  const fail: PurchaseOlympiadCoreResult = { ok: false, errorKey: "poly.err.generic" };

  // Server-side gates — the page hides the buy UI too; this stops hand-crafted
  // POSTs when an admin has switched a module off. Purchases proceed in
  // real/demo/giveaway mode (giveaways cover free SUBJECT access only — never
  // olympiad play, so packages sell at full price); 'off' keeps the
  // payments-off message.
  if (!(await isFeatureEnabled("olympiad_module"))) return fail;
  {
    const { mode } = await getPaymentModeInfo();
    if (mode === "off") return { ok: false, errorKey: "gate.paymentsOff" };
  }

  if (!studentId || !packageId) return fail;

  const admin = getAdminClient();

  // Re-verify the parent owns this child (never trust the client's child id).
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parentProfileId) return fail;

  // Package must exist and be purchasable; the admin-defined price is read
  // server-side (client-sent amounts are ignored by design).
  const { data: pkg } = await admin
    .from("olympiad_packages")
    .select("id, status, price_amount, currency, sale_starts_at, sale_ends_at")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg || (pkg as { status?: string }).status !== "active") return fail;

  // Sale window pre-check BEFORE the payment seam (never charge for an
  // off-sale package). The purchase_olympiad RPC re-enforces this atomically
  // (check_violation, hint 'package_not_on_sale') — this is the early exit.
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
  const payment = await processOlympiadPayment({
    parentProfileId,
    studentProfileId: studentId,
    packageId,
    amount,
    currency: String((pkg as { currency?: string }).currency ?? "AZN"),
  });
  if (!payment.ok) return fail;

  const { data, error } = await admin.rpc("purchase_olympiad", {
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
      // Sale window: purchase_olympiad rejects off-sale purchases with a
      // check_violation carrying hint 'package_not_on_sale' (server-time
      // authoritative — the UI hiding is only cosmetic). Map it to the
      // specific trilingual key; everything else stays the generic failure.
      const hint = (error as { hint?: string | null }).hint ?? "";
      if (hint === "package_not_on_sale") {
        return { ok: false, errorKey: "poly.err.notOnSale" };
      }
      return fail;
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

  // Only a GENUINE new purchase is audited — a re-purchase of an
  // already-owned package is a no-op (no charge, no new access).
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
