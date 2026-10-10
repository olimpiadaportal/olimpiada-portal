"use server";

// "Sync store prices" — Administrator-only.
//
// Pushes the CURRENT subjects_pricing AZN amounts to the App Store and Google
// Play, for one subject or for every subject. It never writes subjects_pricing:
// the AZN amount is read, not posted, so a forged form cannot set a store price
// that differs from the panel's own. (Owner decision 2026-10-10 — see
// lib/admin/storePriceSync.ts.)
//
// Why it exists beside the automatic sync in saveSubjectPrice: a store can be
// unreachable, unconfigured or refusing at the moment of a save, and the
// repair must not be "re-type the same price". It is also how the 21 products
// are brought in line the first time (2 / 7 / 70 AZN vs the old USD prices).
//
// AUTHORIZATION: requireAdmin() is the first statement of each action. AUDIT:
// every store write is audited per product inside syncSubjectIntervalToStores,
// plus one summary row per run here.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";
import { PRICE_INTERVALS, type PriceInterval } from "@/lib/admin/pricing-shared";
import {
  describeOutcome,
  loadFxRate,
  loadProductMap,
  syncSubjectIntervalToStores,
  type StoreSyncOutcome,
} from "@/lib/admin/storePriceSync";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StoreSyncState = {
  ok?: boolean;
  error?: string;
  /** One-line summary, already translated. */
  summary?: string;
  /** Translated failure lines (successes are summarised, not listed). */
  failures?: string[];
} | null;

type PricingRow = { subject_id: string; interval: string; price_amount: number | string };

async function run(
  actorProfileId: string | null,
  subjectId: string | null,
): Promise<StoreSyncState> {
  const t = await getT();
  const supabase = await createClient();

  let query = supabase.from("subjects_pricing").select("subject_id, interval, price_amount");
  if (subjectId) query = query.eq("subject_id", subjectId);
  const { data, error } = await query;
  if (error) {
    console.error("[admin] store sync pricing read failed", error.code ?? "unknown");
    return { error: t("err.server") };
  }

  const rows = ((data ?? []) as PricingRow[]).filter(
    (r) =>
      (PRICE_INTERVALS as readonly string[]).includes(r.interval) &&
      Number.isFinite(Number(r.price_amount)) &&
      Number(r.price_amount) > 0,
  );
  const subjectIds = [...new Set(rows.map((r) => String(r.subject_id)))];
  const [rate, products] = await Promise.all([
    loadFxRate(supabase),
    loadProductMap(supabase, subjectIds),
  ]);

  // THREE (subject, interval) pairs in flight, each running its two stores in
  // parallel. Fully sequential does not fit 21 products inside the page's
  // function budget (maxDuration on the Subjects pages); unbounded is the burst
  // shape that trips Apple's rate limit.
  const outcomes: StoreSyncOutcome[] = [];
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const r = rows[next];
      next += 1;
      outcomes.push(
        ...(await syncSubjectIntervalToStores({
          subjectId: String(r.subject_id),
          interval: r.interval as PriceInterval,
          amountAzn: Number(r.price_amount),
          actorProfileId,
          rate,
          products,
        })),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));

  const count = (status: StoreSyncOutcome["status"]) =>
    outcomes.filter((o) => o.status === status).length;
  const failed = outcomes.filter((o) => o.status === "failed");
  const summary = t("subj.store.summary")
    .split("{updated}").join(String(count("updated")))
    .split("{unchanged}").join(String(count("unchanged")))
    .split("{failed}").join(String(failed.length))
    .split("{notMapped}").join(String(count("notMapped")));

  // Deduplicated: "App Store: not updated — the key needs App Manager" once,
  // not 21 times.
  const failures = [
    ...new Set(
      failed.map((o) => {
        const line = describeOutcome(t, o).text;
        return o.productId ? `${o.productId} · ${line}` : line;
      }),
    ),
  ].slice(0, 20);

  await writeAuditLog({
    actorProfileId,
    action: subjectId ? "admin.store.price.sync_subject" : "admin.store.price.sync_all",
    targetTable: "subjects_pricing",
    targetId: subjectId,
    metadata: {
      rate_azn_per_usd: rate,
      updated: count("updated"),
      unchanged: count("unchanged"),
      failed: failed.length,
      not_mapped: count("notMapped"),
    },
    severity: count("updated") > 0 ? "warning" : "info",
    success: failed.length === 0,
  });

  revalidatePath("/manage/subjects");
  if (subjectId) revalidatePath("/manage/subjects/" + subjectId + "/edit");
  return { ok: failed.length === 0, summary, failures };
}

/** Push one subject's three AZN prices to both stores. */
export async function syncSubjectStorePrices(
  _prev: StoreSyncState,
  formData: FormData,
): Promise<StoreSyncState> {
  const ctx = await requireAdmin();
  const subjectId = String(formData.get("subject_id") ?? "").trim();
  if (!UUID_SHAPE.test(subjectId)) {
    const t = await getT();
    return { error: t("err.server") };
  }
  return run(ctx.profileId, subjectId);
}

/** Push every subject's AZN prices to both stores. */
export async function syncAllStorePrices(
  _prev: StoreSyncState,
  _formData: FormData,
): Promise<StoreSyncState> {
  const ctx = await requireAdmin();
  void _formData;
  return run(ctx.profileId, null);
}
