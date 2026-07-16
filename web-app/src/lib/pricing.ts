// M8 — DB-driven per-subject plan prices for DISPLAY surfaces (public pricing
// page + parent subscription Plans tab). The source of truth is the
// `subjects_pricing` table (the same table checkout's RPCs price from), so the
// marketing numbers can never contradict what the parent is actually charged.
//
// Representative price per interval = the LOWEST active subject price (subjects
// can be priced individually; the pages show a "≈" approximate figure). This is
// display-only: the checkout RPCs always reprice server-side, and the sibling
// discount is applied there — never fake-mathed in the UI.
//
// Uses the service-role client because the public pricing page renders for
// anonymous visitors (read-only, no client input, server-only module) and
// unstable_cache cannot wrap the cookie-bound SSR client. Cached for 60s.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";

export type PlanInterval = "week" | "month" | "year";
export type PerSubjectPrices = Record<PlanInterval, number>;

// Display-only fallback when the DB is unreachable — matches the canonical
// seed under supabase/sql (checkout still reprices authoritatively).
// 3/9/90 = the investor-approved public pricing (docx 2026-07-15).
const FALLBACK: PerSubjectPrices = { week: 3, month: 9, year: 90 };

const fetchPerSubjectPrices = unstable_cache(
  async (): Promise<PerSubjectPrices> => {
    try {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("subjects_pricing")
        .select("interval, price_amount")
        .eq("status", "active");
      if (error || !data || data.length === 0) return FALLBACK;
      const out: Partial<Record<PlanInterval, number>> = {};
      for (const row of data as { interval: string; price_amount: number }[]) {
        const iv = row.interval;
        if (iv !== "week" && iv !== "month" && iv !== "year") continue;
        const p = Number(row.price_amount);
        if (!Number.isFinite(p) || p < 0) continue;
        out[iv] = out[iv] === undefined ? p : Math.min(out[iv]!, p);
      }
      return {
        week: out.week ?? FALLBACK.week,
        month: out.month ?? FALLBACK.month,
        year: out.year ?? FALLBACK.year,
      };
    } catch {
      return FALLBACK;
    }
  },
  ["per-subject-prices"],
  { revalidate: 60 },
);

/** Per-request memoized on top of the 60s data cache. */
export const getPerSubjectPrices = cache(fetchPerSubjectPrices);
