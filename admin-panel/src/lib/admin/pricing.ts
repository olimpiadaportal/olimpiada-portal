"use server";

// Subscription pricing (subjects_pricing) — Administrator-only.
//
// The write goes through the SECURITY DEFINER RPC admin_upsert_subject_price
// (in-body Administrator guard, interval whitelist, 0 < amount ≤ 10000 with
// ≤ 2 decimals, upsert + its OWN audit row) via the request-scoped
// (anon-key + cookies) client — EXECUTE is granted to authenticated and the
// in-body guard gates it. requireAdmin() still runs FIRST here (defence in
// depth + a friendly redirect instead of a DB exception for non-admins).
//
// NOTE: the sibling discount is a FIXED business rule (2nd 10% / 3rd+ 15%) —
// it is intentionally NOT editable here and must never become a setting.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import {
  PRICE_INTERVALS,
  parsePriceAmount,
  type PriceInterval,
} from "@/app/(protected)/pricing/shared";
import { localStrings } from "@/app/(protected)/pricing/labels";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PriceSaveState = { error?: string; ok?: boolean } | null;

// Saves ONE subject × interval price. Each pricing cell is its own form, so
// the returned state is already scoped to the cell that submitted it.
export async function saveSubjectPrice(
  _prev: PriceSaveState,
  formData: FormData,
): Promise<PriceSaveState> {
  await requireAdmin();

  const subjectId = String(formData.get("subject_id") ?? "").trim();
  const interval = String(formData.get("interval") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");

  // Server-side validation (client attributes are UX only): uuid shape,
  // interval whitelist, amount 0 < x ≤ 10000 with ≤ 2 decimals.
  if (!UUID_SHAPE.test(subjectId)) {
    const t = await getT();
    return { error: t("err.server") };
  }
  if (!(PRICE_INTERVALS as readonly string[]).includes(interval)) {
    const t = await getT();
    return { error: t("err.server") };
  }
  const amount = parsePriceAmount(amountRaw);
  if (amount === null) {
    const lt = localStrings(await getLocale());
    return { error: lt("pricing.err.amount") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_subject_price", {
    p_subject_id: subjectId,
    p_interval: interval as PriceInterval,
    p_amount: amount,
  });
  if (error) {
    // Never leak raw Postgres/Supabase details to the client — generic
    // trilingual message; the detail goes to server logs only.
    console.error(
      "[admin] subject price save failed",
      subjectId,
      interval,
      error.message,
    );
    const t = await getT();
    return { error: t("err.server") };
  }

  // Audit: the RPC writes its own audit row (SECURITY DEFINER), so no
  // duplicate writeAuditLog() here.
  revalidatePath("/pricing");
  return { ok: true };
}
