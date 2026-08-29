import "server-only";

// Server-side reads shared by the three Subjects screens (list, new, edit).
//
// A subject is TWO tables. `subjects` holds the identity and the publication
// status; `subjects_pricing` holds one row per (subject_id, interval) and is
// what every family-facing surface actually keys on. Loading them separately in
// each page is how the panel ended up with a Subjects screen that could not
// tell an admin a published subject was unsellable — so both come from here,
// together, with `sellable` already decided.
import { createClient } from "@/lib/supabase/server";
import {
  PRICE_INTERVALS,
  type PriceInterval,
} from "@/app/(protected)/pricing/shared";

export type SubjectPriceMap = Partial<Record<PriceInterval, string>>;

export type SubjectRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  /** Stored amounts as canonical 2-decimal TEXT ("3.00") — never a float. */
  prices: SubjectPriceMap;
  /**
   * True when all three cycles have an ACTIVE pricing row. This is the real
   * answer to "can a family buy this?", and it is why the flag lives beside the
   * status rather than on the separate Pricing page where nobody saw it.
   */
  sellable: boolean;
};

type PricingRow = {
  subject_id: string;
  interval: string;
  price_amount: number | string;
  status: string;
};

// numeric(12,2) arrives as a string over PostgREST; normalise to one canonical
// 2-decimal text form so comparisons and inputs never go near float maths.
function amountText(v: number | string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function buildRow(
  subject: { id: string; name: string; code: string | null; status: string | null },
  pricing: PricingRow[],
): SubjectRow {
  const prices: SubjectPriceMap = {};
  const active = new Set<string>();
  for (const p of pricing) {
    if (!(PRICE_INTERVALS as readonly string[]).includes(p.interval)) continue;
    const iv = p.interval as PriceInterval;
    const text = amountText(p.price_amount);
    if (text === "") continue;
    // The stored amount is shown even when the row is not active, so the edit
    // form never blanks a price the database still holds.
    prices[iv] = text;
    if (p.status === "active") active.add(iv);
  }
  return {
    id: String(subject.id),
    name: String(subject.name ?? ""),
    code: String(subject.code ?? ""),
    status: String(subject.status ?? ""),
    prices,
    sellable: PRICE_INTERVALS.every((iv) => active.has(iv)),
  };
}

/**
 * The Subjects list. `search` is already sanitised by the caller; `status` is
 * whitelisted there too — this function does not re-validate URL input, it
 * takes values the page has validated.
 */
export async function loadSubjects(opts: {
  search?: string;
  status?: string;
}): Promise<{ rows: SubjectRow[]; failed: boolean }> {
  const supabase = await createClient();

  let qb = supabase.from("subjects").select("id, name, code, status");
  if (opts.search) qb = qb.ilike("name", `%${opts.search}%`);
  if (opts.status) qb = qb.eq("status", opts.status);

  const [subjectsRes, pricingRes] = await Promise.all([
    qb.order("name"),
    supabase
      .from("subjects_pricing")
      .select("subject_id, interval, price_amount, status"),
  ]);

  if (subjectsRes.error || pricingRes.error) {
    // Never surface a raw Postgres message; the page renders its own notice.
    console.error(
      "[admin] subjects load failed",
      subjectsRes.error?.code ?? pricingRes.error?.code ?? "unknown",
    );
    return { rows: [], failed: true };
  }

  const bySubject = new Map<string, PricingRow[]>();
  for (const p of (pricingRes.data ?? []) as PricingRow[]) {
    const list = bySubject.get(String(p.subject_id)) ?? [];
    list.push(p);
    bySubject.set(String(p.subject_id), list);
  }

  const rows = ((subjectsRes.data ?? []) as {
    id: string;
    name: string;
    code: string | null;
    status: string | null;
  }[]).map((s) => buildRow(s, bySubject.get(String(s.id)) ?? []));

  return { rows, failed: false };
}

/** One subject with its prices, or null when the id matches nothing. */
export async function loadSubject(id: string): Promise<SubjectRow | null> {
  const supabase = await createClient();
  const [subjectRes, pricingRes] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, code, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("subjects_pricing")
      .select("subject_id, interval, price_amount, status")
      .eq("subject_id", id),
  ]);
  if (subjectRes.error) {
    console.error("[admin] subject load failed", subjectRes.error.code ?? "unknown");
    return null;
  }
  if (!subjectRes.data) return null;
  return buildRow(
    subjectRes.data as {
      id: string;
      name: string;
      code: string | null;
      status: string | null;
    },
    (pricingRes.data ?? []) as PricingRow[],
  );
}
