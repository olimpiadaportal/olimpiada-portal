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
//
// SCOPE, AND WHY IT IS NARROW. This action writes ONE (subject, interval)
// amount. It never reads a name and never reads a status, so a reprice cannot
// rename or publish a subject no matter what a forged form posts. Its
// counterparts — createSubject / updateSubject in lib/admin/actions.ts — own
// the subject ROW and (since the /pricing merge, 2026-09-10) no longer write
// prices on edit at all. Two tables, two actions, no overlap.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import {
  PRICE_INTERVALS,
  parsePriceAmount,
  type PriceInterval,
} from "@/lib/admin/pricing-shared";

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
    const t = await getT();
    // CELL-SCOPED WORDING. This state is rendered inside the ONE cell that
    // submitted it, under that one input — "each price must be…" reads there
    // as a rule about all three cycles and sends the admin to inspect the two
    // amounts beside it, which are fine. subj.err.price keeps the plural
    // phrasing for the create form, where all three fields really are
    // validated together.
    return { error: t("subj.err.priceCell") };
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
  //
  // Both Subjects screens print these amounts and the "not sellable" flag
  // derived from them, so a reprice must not leave either showing the old
  // figure. (/pricing is gone — it now redirects here.)
  revalidatePath("/manage/subjects");
  revalidatePath("/manage/subjects/" + subjectId + "/edit");
  return { ok: true };
}
