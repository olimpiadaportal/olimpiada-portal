"use server";

// Stage 14 — parent buys an olympiad package for a child (one-time, lifetime).
// purchase_olympiad is service-role (computed server-side); the action authorizes
// the parent owns the child first. Real charge is stubbed pending a provider.
//
// Round 9 (T7) adds purchaseOlympiadForChild — the useActionState variant used
// by the parent "Olimpiadalar" catalog (/olympiads): same authorization and RPC
// as buyOlympiad, plus an isolated MOCK payment step (processOlympiadPayment)
// that is the single seam where a real payment provider plugs in later.
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireParent } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getT } from "@/i18n/server";
import { notifyOlympiadPurchased } from "@/lib/notifications/events";

export async function buyOlympiad(formData: FormData): Promise<void> {
  const parent = await requireParent();
  // Server-side gates: a purchase needs the olympiad module AND a transactable
  // payment mode ('real'/'demo'/'giveaway'). Giveaway windows grant free
  // SUBJECT access only — olympiad packages stay purchase-only at full price
  // through the mock payment seam; only mode 'off' blocks purchases.
  if (!(await isFeatureEnabled("olympiad_module"))) return;
  {
    const { mode } = await getPaymentModeInfo();
    if (mode === "off") return;
  }
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!studentId || !packageId) return;

  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) return;

  await admin.rpc("purchase_olympiad", {
    p_student_profile_id: studentId,
    p_package_id: packageId,
  });

  // Notify the child + the owning parent (best-effort; never blocks the buy).
  await notifyOlympiadPurchased({
    studentProfileId: studentId,
    parentProfileId: parent.profileId,
    packageId,
  });

  revalidatePath(`/children/${studentId}/olympiads`);
}

// ---- Round 9 (T7): parent catalog purchase (useActionState) -------------------

export type PurchaseOlympiadState =
  | { ok: true; already?: boolean }
  | { ok: false; error: string }
  | null;

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
 * Parent buys an olympiad package for one of their children, from the parent
 * "Olimpiadalar" catalog. Guard-first (requireParent), server-side flag gates
 * (olympiad_module + payments), ownership re-verified via the admin client,
 * then MOCK payment → purchase_olympiad RPC (service-role, idempotent).
 * Errors are always the generic translated message — never raw DB text.
 */
export async function purchaseOlympiadForChild(
  _prev: PurchaseOlympiadState,
  formData: FormData,
): Promise<PurchaseOlympiadState> {
  const parent = await requireParent();
  const t = await getT();
  const fail: PurchaseOlympiadState = { ok: false, error: t("poly.err.generic") };

  // Server-side gates — the page hides the buy UI too; this stops hand-crafted
  // POSTs when an admin has switched a module off. Purchases proceed in
  // real/demo/giveaway mode (giveaways cover free SUBJECT access only — never
  // olympiad play, so packages sell at full price); 'off' keeps the
  // payments-off message.
  if (!(await isFeatureEnabled("olympiad_module"))) return fail;
  {
    const { mode } = await getPaymentModeInfo();
    if (mode === "off") return { ok: false, error: t("gate.paymentsOff") };
  }

  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!studentId || !packageId) return fail;

  const admin = getAdminClient();

  // Re-verify the parent owns this child (never trust the client's child id).
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) return fail;

  // Package must exist and be purchasable; the admin-defined price is read
  // server-side (client-sent amounts are ignored by design).
  const { data: pkg } = await admin
    .from("olympiad_packages")
    .select("id, status, price_amount, currency")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg || (pkg as { status?: string }).status !== "active") return fail;

  const payment = await processOlympiadPayment({
    parentProfileId: parent.profileId,
    studentProfileId: studentId,
    packageId,
    amount: Number((pkg as { price_amount?: number }).price_amount ?? 0),
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
    if (!already) return fail;
  }

  // Notify the child + the owning parent (best-effort; idempotency keys dedupe a
  // re-purchase of an already-owned package, so this never double-notifies).
  await notifyOlympiadPurchased({
    studentProfileId: studentId,
    parentProfileId: parent.profileId,
    packageId,
  });

  revalidatePath("/olympiads");
  revalidatePath(`/children/${studentId}/olympiads`);
  revalidatePath("/subscription");

  const existing =
    error != null ||
    (data as { existing?: boolean } | null)?.existing === true;
  return existing ? { ok: true, already: true } : { ok: true };
}
