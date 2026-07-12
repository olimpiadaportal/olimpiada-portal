"use server";

// Stage 14 — parent buys an olympiad package for a child (one-time, lifetime).
// purchase_olympiad is service-role (computed server-side); the action authorizes
// the parent owns the child first. Real charge is stubbed pending a provider.
//
// Round 9 (T7) adds purchaseOlympiadForChild — the useActionState variant used
// by the parent "Olimpiadalar" catalog (/olympiads). Since Stage M2 its logic
// lives in lib/auth/olympiadCore.purchaseOlympiadForChildCore (one source of
// truth with the mobile BFF, including the isolated MOCK payment seam where a
// real payment provider plugs in later); this action stays the cookie-session
// wrapper that authorizes via requireParent and localizes the error KEY.
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireParent } from "@/lib/auth/session";
import { purchaseOlympiadForChildCore } from "@/lib/auth/olympiadCore";
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
 * Parent buys an olympiad package for one of their children, from the parent
 * "Olimpiadalar" catalog. Guard-first (requireParent), then the shared core:
 * server-side flag gates (olympiad_module + payments), ownership re-verified
 * via the admin client, MOCK payment → purchase_olympiad RPC (service-role,
 * idempotent). Errors are always the generic translated message — never raw
 * DB text.
 */
export async function purchaseOlympiadForChild(
  _prev: PurchaseOlympiadState,
  formData: FormData,
): Promise<PurchaseOlympiadState> {
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");

  const res = await purchaseOlympiadForChildCore({
    parentProfileId: parent.profileId,
    studentId,
    packageId,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return res;
}
