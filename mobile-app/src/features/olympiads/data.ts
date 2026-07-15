// Student olympiads data (web child/olympiads page parity). Every read runs on
// the child's OWN Supabase JWT (RLS: active listing is publicly browsable;
// purchases/attempts are owner-scoped). The start RPC is the SAME
// start_olympiad_attempt(p_package_id) the web calls — purchase-gated
// server-side (migration 038) and TRUE-resuming the one open attempt (047).
import { supabase } from "@/lib/supabase";

// ---- real pool counts (Round 21, migration 065) --------------------------------

/**
 * REAL published-question count per olympiad package via
 * get_olympiad_pool_counts (SECURITY DEFINER, counts only) — ONE RPC per load.
 * Attempts include ALL of a package's questions, so this is the number every
 * card shows; a package absent from the result has an empty pool → 0. The
 * display-legacy olympiad_packages.questions_per_attempt is never read here.
 * The server caps the id list at 100; the slice keeps us inside it.
 */
export async function fetchOlympiadPoolCounts(
  packageIds: string[],
): Promise<Record<string, number>> {
  const ids = Array.from(new Set(packageIds.filter(Boolean))).slice(0, 100);
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc("get_olympiad_pool_counts", {
    p_package_ids: ids,
  });
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { package_id?: unknown; question_count?: unknown }[]) {
    if (typeof row.package_id === "string") {
      counts[row.package_id] = Number(row.question_count ?? 0) || 0;
    }
  }
  return counts;
}

// ---- owned packages ("Olimpiadalarım") ---------------------------------------

export type OwnedOlympiad = {
  packageId: string;
  title: string;
  /** REAL pool size (get_olympiad_pool_counts) — never questions_per_attempt. */
  questions: number;
};

type PurchaseRow = {
  olympiad_package_id: string;
  package: {
    olympiad_package_translations: { locale: string; title: string }[] | null;
  } | null;
};

/**
 * The child's ACTIVE purchases with the package title + REAL question count —
 * this is the playable list (packages are purchase-only in every payment mode;
 * free windows cover subjects, never olympiads). The join keeps working for
 * archived listings, so purchasers keep lifetime access exactly like the web.
 */
export async function fetchOwnedOlympiads(
  profileId: string,
  locale: string,
): Promise<OwnedOlympiad[]> {
  const { data, error } = await supabase
    .from("olympiad_purchases")
    .select(
      "olympiad_package_id, package:olympiad_package_id(olympiad_package_translations(locale, title))",
    )
    .eq("student_profile_id", profileId)
    .eq("status", "active");
  if (error) throw error;
  const rows = (data ?? []) as unknown as PurchaseRow[];
  const counts = await fetchOlympiadPoolCounts(rows.map((p) => p.olympiad_package_id));
  return rows.map((p) => {
    const trs = p.package?.olympiad_package_translations ?? [];
    const tr = trs.find((x) => x.locale === locale) ?? trs.find((x) => x.locale === "az");
    return {
      packageId: p.olympiad_package_id,
      title: tr?.title ?? "—",
      questions: counts[p.olympiad_package_id] ?? 0,
    };
  });
}

// ---- live in-progress attempt (continue card) --------------------------------

export type LiveOlympiadAttempt = {
  attemptId: string;
  /** Which owned package the attempt belongs to (via its first drawn question). */
  packageId: string | null;
};

/**
 * The one still-running olympiad attempt (server deadline in the future), plus
 * the package it belongs to — each pool question is PRIVATE to exactly one
 * package, so the first drawn question resolves it (web parity, migration 047).
 */
export async function fetchLiveOlympiadAttempt(
  profileId: string,
): Promise<LiveOlympiadAttempt | null> {
  const { data, error } = await supabase
    .from("test_attempts")
    .select("id, deadline_at, question_ids")
    .eq("student_profile_id", profileId)
    .eq("kind", "olympiad")
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as {
    id: string;
    deadline_at: string | null;
    question_ids: unknown;
  }[]).find((r) => r.deadline_at && Date.parse(r.deadline_at) > Date.now());
  if (!row) return null;

  let packageId: string | null = null;
  const firstQid = Array.isArray(row.question_ids) ? row.question_ids[0] : null;
  if (typeof firstQid === "string" && firstQid) {
    const { data: qRow } = await supabase
      .from("questions")
      .select("olympiad_package_id")
      .eq("id", firstQid)
      .maybeSingle();
    packageId =
      (qRow as { olympiad_package_id?: string | null } | null)?.olympiad_package_id ?? null;
  }
  return { attemptId: row.id, packageId };
}

// ---- start / resume -----------------------------------------------------------

export type StartOlympiadResult =
  | { ok: true; attemptId: string; resumed: boolean }
  | { ok: false; errorKey: string };

/**
 * start_olympiad_attempt(p_package_id) on the child's own JWT. Error mapping is
 * the web childActions.startOlympiad contract: 23514 (check_violation) = no
 * active purchase → oly5.errNoAccess; P0002 (no_data_found) = empty pool →
 * oly5.errEmpty; anything else → the generic test error. Raw Postgres text
 * never surfaces.
 */
export async function startOlympiadAttempt(packageId: string): Promise<StartOlympiadResult> {
  const { data, error } = await supabase.rpc("start_olympiad_attempt", {
    p_package_id: packageId,
  });
  if (error) {
    if (error.code === "23514") return { ok: false, errorKey: "oly5.errNoAccess" };
    if (error.code === "P0002") return { ok: false, errorKey: "oly5.errEmpty" };
    return { ok: false, errorKey: "test.err.generic" };
  }
  const d = (data ?? null) as { attempt_id?: unknown; resumed?: unknown } | null;
  const attemptId = typeof d?.attempt_id === "string" ? d.attempt_id : null;
  if (!attemptId) return { ok: false, errorKey: "test.err.generic" };
  return { ok: true, attemptId, resumed: d?.resumed === true };
}
