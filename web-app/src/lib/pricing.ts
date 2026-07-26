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
import {
  PLAN_INTERVALS,
  isPlanInterval,
  type ConfiguratorSubject,
  type PlanInterval,
} from "@/lib/pricingConfigurator";

// PlanInterval is DEFINED in lib/pricingConfigurator (a pure, client-safe
// module) and re-exported here so the historical `@/lib/pricing` import path
// keeps working — one definition, two entry points.
export type { PlanInterval };
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

// ---- Public subject CATALOG with per-interval prices (services configurator) --
//
// The /services configurator needs more than the representative figure above:
// it needs WHICH subjects are sold and what each costs per interval, so the
// visitor can build a basket. Same table, same `status = 'active'` filter, so
// the configurator and checkout can never price from different data.
//
// Service-role client for the same reason getPerSubjectPrices uses it: the page
// renders for anonymous visitors, this module is server-only, the query takes
// NO client input, and unstable_cache cannot wrap the cookie-bound SSR client.
// Only active pricing rows for active subjects are read — exactly the rows the
// public pricing-page RLS policy already exposes. Archived subjects and
// archived prices never enter the catalog, which is also what makes
// `parseSelectionParams` able to drop archived ids by simple catalog lookup.
//
// DISPLAY ONLY: checkout re-prices server-side and applies the sibling
// discount there; nothing here is an authorization to charge.

export type PublicSubjectCatalog =
  | { ok: true; subjects: ConfiguratorSubject[] }
  /** The catalog could not be read — the page shows its error state. */
  | { ok: false; subjects: [] };

const fetchPublicSubjectPricing = unstable_cache(
  async (): Promise<PublicSubjectCatalog> => {
    try {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("subjects_pricing")
        .select("subject_id, interval, price_amount, subjects(id, code, name, status)")
        .eq("status", "active");
      if (error || !data) return { ok: false, subjects: [] };

      const byId = new Map<string, ConfiguratorSubject>();
      // `as any[]`: postgrest-js types an embedded 1:1 relation as an array;
      // the rest of the codebase reads these joins the same way.
      for (const row of data as any[]) {
        const subject = row.subjects as
          | { id: string; code: string | null; name: string; status: string }
          | null;
        // An archived subject keeps its pricing rows; it must not be sellable.
        if (!subject || subject.status !== "active") continue;
        const interval: unknown = row.interval;
        if (!isPlanInterval(interval)) continue;
        const price = Number(row.price_amount);
        if (!Number.isFinite(price) || price < 0) continue;

        const subjectId = String(row.subject_id);
        let entry = byId.get(subjectId);
        if (!entry) {
          entry = {
            id: subjectId,
            code: subject.code ?? null,
            name: subject.name ?? "—",
            prices: {},
          };
          byId.set(subjectId, entry);
        }
        entry.prices[interval] = price;
      }

      // Only offer subjects sellable on at least one interval, in a stable
      // order (the DB returns rows unordered).
      const subjects = Array.from(byId.values())
        .filter((s) => PLAN_INTERVALS.some((iv) => s.prices[iv] !== undefined))
        .sort((a, b) => a.name.localeCompare(b.name, "az"));
      return { ok: true, subjects };
    } catch {
      return { ok: false, subjects: [] };
    }
  },
  ["public-subject-pricing"],
  { revalidate: 60 },
);

/**
 * Active subjects + their per-interval list prices, for the public services
 * configurator and for validating hand-off query params on arrival.
 * Per-request memoized on top of the 60s data cache.
 */
export const getPublicSubjectPricing = cache(fetchPublicSubjectPricing);
