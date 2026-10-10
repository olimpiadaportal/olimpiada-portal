import "server-only";

// ---------------------------------------------------------------------------
// STORE PRICES FOLLOW THE ADMIN PANEL (owner decision, 2026-10-10).
//
// "Whatever price is set in Admin → Subjects, the mobile apps must display
// that." This module joins one AZN amount (subjects_pricing, the SOURCE OF
// TRUTH) to the two store products that sell the same (subject, interval):
//
//   App Store   → nearest AZE price point to AZN ÷ rate (lib/admin/appStoreConnect.ts)
//   Google Play → AZ region at the AZN amount, or AZN ÷ rate when AZ is
//                 priced in USD (lib/admin/googlePlay.ts)
//
// ORDERING IS THE CONTRACT. Callers save the AZN row FIRST and call this
// AFTER. Nothing here can undo, block or roll back that save: a store failure
// becomes an outcome the panel prints beside "Saved", never an error instead of
// it. Web checkout always reprices from subjects_pricing on the server, so the
// web is right the moment the row is saved, whatever the stores answer.
//
// WHICH PRODUCT. public.iap_products maps (platform, product_id) → (subject,
// interval). The iOS row names the App Store product. Android uses the SAME
// product id by design (`ai.olympiq.app.sub.<slug>.<interval>`); the android
// row is used when it exists and the iOS id is the fallback, so a Play product
// created by mobile-app/scripts/create-play-products.mjs before its android
// row is seeded still follows the panel. A product's `active` flag is NOT
// consulted: an inactive product still has a store price, and it must already
// be right on the day it is switched on.
//
// NO PERSISTED SYNC STATE YET. The panel shows live store prices (read on
// render) rather than a stored copy, and every store write is audited
// (admin.store.price.sync) with product id, old → new price and store. A
// table for "last sync attempt" is requested from the lead in STATUS.md.
// ---------------------------------------------------------------------------
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  readAppStorePrices,
  syncAppStorePrice,
  type ApplePriceProblem,
  type AppleSyncResult,
} from "@/lib/admin/appStoreConnect";
import {
  readGooglePlayPrices,
  syncGooglePlayPrice,
  type PlayPriceProblem,
  type PlaySyncResult,
} from "@/lib/admin/googlePlay";
import {
  aznToUsd,
  chooseNearestPricePoint,
  centsToText,
  FX_SETTING_KEY,
  googleAzTarget,
  parseFxRate,
  sameCents,
  toCents,
  type SyncIndicator,
} from "@/lib/admin/store-pricing-shared";
import { PRICE_INTERVALS, type PriceInterval } from "@/lib/admin/pricing-shared";
import type { T } from "@/i18n/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type StoreName = "app_store" | "google_play";
/** `productMapUnreadable`: iap_products could not be read, so the product is unknown. */
export type StoreProblem = ApplePriceProblem | PlayPriceProblem | "productMapUnreadable";

export type StoreSyncOutcome = {
  store: StoreName;
  interval: PriceInterval;
  productId: string | null;
  status: "updated" | "unchanged" | "failed" | "notMapped";
  problem?: StoreProblem;
  /** Display text, e.g. "USD 1.19" — never a bare number with no unit. */
  from?: string | null;
  to?: string | null;
  /** The write was sent (and then failed or did not verify). */
  attempted?: boolean;
};

/** (subject, interval) → the two store product ids. */
export type ProductIds = { ios: string | null; android: string | null };
export type ProductMap = Map<string, Map<PriceInterval, ProductIds>>;

function isInterval(v: unknown): v is PriceInterval {
  return typeof v === "string" && (PRICE_INTERVALS as readonly string[]).includes(v);
}

/** The FX rate, default 1.70 when the setting is absent or unreadable. */
export async function loadFxRate(supabase: Supabase): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("value_json")
      .eq("key", FX_SETTING_KEY)
      .maybeSingle();
    if (error) {
      console.error("[admin] fx rate read failed", error.code ?? "unknown");
      return parseFxRate(undefined);
    }
    return parseFxRate((data as { value_json?: unknown } | null)?.value_json);
  } catch {
    return parseFxRate(undefined);
  }
}

/** iap_products subject rows → map, or null when the table cannot be read. */
export async function loadProductMap(
  supabase: Supabase,
  subjectIds?: readonly string[],
): Promise<ProductMap | null> {
  let query = supabase
    .from("iap_products")
    .select("platform, product_id, subject_id, interval")
    .eq("scope", "subject");
  if (subjectIds && subjectIds.length > 0) query = query.in("subject_id", [...subjectIds]);
  const { data, error } = await query;
  if (error) {
    console.error("[admin] iap product map read failed", error.code ?? "unknown");
    return null;
  }
  const map: ProductMap = new Map();
  for (const r of (data ?? []) as {
    platform: string | null;
    product_id: string | null;
    subject_id: string | null;
    interval: string | null;
  }[]) {
    if (!r.subject_id || !r.product_id || !isInterval(r.interval)) continue;
    const bySubject = map.get(r.subject_id) ?? new Map<PriceInterval, ProductIds>();
    const ids = bySubject.get(r.interval) ?? { ios: null, android: null };
    if (r.platform === "ios") ids.ios = r.product_id;
    else if (r.platform === "android") ids.android = r.product_id;
    bySubject.set(r.interval, ids);
    map.set(r.subject_id, bySubject);
  }
  return map;
}

/** The Play product id: the android row, else the shared iOS id. */
function playProductId(ids: ProductIds | undefined): string | null {
  return ids?.android ?? ids?.ios ?? null;
}

function money(currency: string, amount: string | number): string {
  const cents = toCents(amount);
  return cents === null ? `${currency} ${amount}` : `${currency} ${centsToText(cents)}`;
}

function appleOutcome(interval: PriceInterval, r: AppleSyncResult): StoreSyncOutcome {
  if (r.ok) {
    return {
      store: "app_store",
      interval,
      productId: r.productId,
      status: r.changed ? "updated" : "unchanged",
      from: r.from === null ? null : money(r.currency, r.from),
      to: money(r.currency, r.to),
    };
  }
  return {
    store: "app_store",
    interval,
    productId: r.productId,
    status: "failed",
    problem: r.problem,
    from: r.from ? money("USD", r.from) : null,
    to: r.to ? money("USD", r.to) : null,
    attempted: r.attempted === true,
  };
}

function playOutcome(interval: PriceInterval, r: PlaySyncResult): StoreSyncOutcome {
  if (r.ok) {
    return {
      store: "google_play",
      interval,
      productId: r.productId,
      status: r.changed ? "updated" : "unchanged",
      from: r.from === null ? null : money(r.currency, r.from),
      to: money(r.currency, r.to),
    };
  }
  const cur = r.currency || "";
  return {
    store: "google_play",
    interval,
    productId: r.productId,
    status: "failed",
    problem: r.problem,
    from: r.from != null && cur ? money(cur, r.from) : null,
    to: r.to != null && cur ? money(cur, r.to) : null,
    attempted: r.attempted === true,
  };
}

/**
 * Push ONE (subject, interval) AZN amount to both stores and audit every write.
 *
 * Never throws: a store being down, unconfigured or refusing is an OUTCOME.
 * The caller has already saved the AZN row and already passed requireAdmin().
 */
export async function syncSubjectIntervalToStores(args: {
  subjectId: string;
  interval: PriceInterval;
  amountAzn: number;
  actorProfileId: string | null;
  rate: number;
  products: ProductMap | null;
}): Promise<StoreSyncOutcome[]> {
  const { subjectId, interval, amountAzn, actorProfileId, rate, products } = args;
  // An unreadable product map is NOT "no product": saying "no App Store product
  // for this cycle" about a live product would send the admin looking for a
  // problem that does not exist.
  if (products === null) {
    return (["app_store", "google_play"] as const).map((store) => ({
      store,
      interval,
      productId: null,
      status: "failed" as const,
      problem: "productMapUnreadable" as const,
    }));
  }
  const ids = products.get(subjectId)?.get(interval);
  const iosId = ids?.ios ?? null;
  const playId = playProductId(ids);

  const [apple, play] = await Promise.all([
    iosId
      ? syncAppStorePrice(iosId, aznToUsd(amountAzn, rate))
          .then((r) => appleOutcome(interval, r))
          .catch((): StoreSyncOutcome => ({
            store: "app_store",
            interval,
            productId: iosId,
            status: "failed",
            problem: "unreachable",
          }))
      : Promise.resolve<StoreSyncOutcome>({
          store: "app_store",
          interval,
          productId: null,
          status: "notMapped",
        }),
    playId
      ? syncGooglePlayPrice(playId, amountAzn, rate)
          .then((r) => playOutcome(interval, r))
          .catch((): StoreSyncOutcome => ({
            store: "google_play",
            interval,
            productId: playId,
            status: "failed",
            problem: "unreachable",
          }))
      : Promise.resolve<StoreSyncOutcome>({
          store: "google_play",
          interval,
          productId: null,
          status: "notMapped",
        }),
  ]);

  // AUDIT EVERY WRITE: a change that landed, and a write that was sent and
  // failed (or did not verify). A read-only "already right" or a refusal that
  // never reached the write endpoint changed nothing at the store.
  for (const o of [apple, play]) {
    if (!(o.status === "updated" || (o.status === "failed" && o.attempted))) continue;
    await writeAuditLog({
      actorProfileId,
      action: "admin.store.price.sync",
      targetTable: "subjects_pricing",
      targetId: subjectId,
      metadata: {
        store: o.store,
        product_id: o.productId,
        interval,
        amount_azn: amountAzn,
        fx_azn_per_usd: rate,
        old_price: o.from ?? null,
        new_price: o.to ?? null,
        problem: o.problem,
      },
      // A store price change is what a family is charged on that platform.
      severity: o.status === "updated" ? "warning" : "info",
      success: o.status === "updated",
    });
  }
  return [apple, play];
}

// ---- wording ---------------------------------------------------------------

/** One line per store outcome, already translated. */
export function describeOutcome(t: T, o: StoreSyncOutcome): { ok: boolean; text: string } {
  const store = t(o.store === "app_store" ? "subj.store.appStore" : "subj.store.googlePlay");
  const fill = (key: string, vars: Record<string, string>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t(key));
  switch (o.status) {
    case "updated":
      return { ok: true, text: fill("subj.store.updated", { store, price: o.to ?? "—" }) };
    case "unchanged":
      return { ok: true, text: fill("subj.store.unchanged", { store, price: o.to ?? "—" }) };
    case "notMapped":
      return { ok: true, text: fill("subj.store.notMapped", { store }) };
    default:
      return {
        ok: false,
        text: fill("subj.store.failed", {
          store,
          reason: t(`subj.store.err.${o.problem ?? "unreachable"}`),
        }),
      };
  }
}

// ---- the live board (read-only, for the Subjects screens) -------------------

export type StoreCell = {
  /** Live store price as display text ("USD 1.19"), null when none is set. */
  live: string | null;
  /** What the panel's AZN amount maps to on this store, display text. */
  expected: string | null;
  indicator: SyncIndicator;
};

export type StoreBoardRow = {
  subjectId: string;
  cycles: Partial<
    Record<PriceInterval, { azn: string; appStore: StoreCell; googlePlay: StoreCell }>
  >;
};

export type StoreBoard = {
  rate: number;
  rows: StoreBoardRow[];
  /** Whole-store problems (credentials, outage), shown once above the table. */
  appStoreProblem: StoreProblem | null;
  googlePlayProblem: StoreProblem | null;
  productMapFailed: boolean;
};

/**
 * Live store prices beside the AZN amounts, for the given subjects. Read-only;
 * the caller has passed requireAdmin(). Each store is read once for the whole
 * board, in parallel with the other.
 */
export async function loadStoreBoard(
  subjects: readonly { id: string; prices: Partial<Record<PriceInterval, string>> }[],
): Promise<StoreBoard> {
  const supabase = await createClient();
  const ids = subjects.map((s) => s.id);
  const [rate, products] = await Promise.all([loadFxRate(supabase), loadProductMap(supabase, ids)]);

  const iosIds: string[] = [];
  for (const s of subjects) {
    for (const iv of PRICE_INTERVALS) {
      const id = products?.get(s.id)?.get(iv)?.ios;
      if (id) iosIds.push(id);
    }
  }
  const [apple, play] = await Promise.all([
    readAppStorePrices(iosIds).catch(() => ({ ok: false as const, problem: "unreachable" as const })),
    readGooglePlayPrices().catch(() => ({ ok: false as const, problem: "unreachable" as const })),
  ]);

  const unknown: StoreCell = { live: null, expected: null, indicator: "unknown" };
  const rows: StoreBoardRow[] = subjects.map((s) => {
    const cycles: StoreBoardRow["cycles"] = {};
    for (const iv of PRICE_INTERVALS) {
      const azn = s.prices[iv];
      if (azn === undefined) continue;
      const amount = Number(azn);
      const pids = products?.get(s.id)?.get(iv);

      // App Store
      let appStore: StoreCell = unknown;
      if (products !== null && apple.ok) {
        const pid = pids?.ios ?? null;
        if (!pid || !apple.prices.has(pid)) {
          appStore = { live: null, expected: null, indicator: "notCreated" };
        } else {
          const live = apple.prices.get(pid) ?? null;
          const point = chooseNearestPricePoint(apple.ladder, aznToUsd(amount, rate));
          appStore = {
            live: live === null ? null : money(apple.currency, live),
            expected: point ? money(apple.currency, point.customerPrice) : null,
            indicator: !point
              ? "unknown"
              : live !== null && sameCents(live, point.customerPrice)
                ? "inSync"
                : "outOfSync",
          };
        }
      }

      // Google Play
      let googlePlay: StoreCell = unknown;
      if (products !== null && play.ok) {
        const pid = playProductId(pids);
        if (!pid || !play.prices.has(pid)) {
          googlePlay = { live: null, expected: null, indicator: "notCreated" };
        } else {
          const live = play.prices.get(pid) ?? null;
          const target = live ? googleAzTarget(amount, live.currency, rate) : null;
          googlePlay = {
            live: live ? money(live.currency, live.amount) : null,
            expected: live && target !== null ? money(live.currency, target) : null,
            indicator: !live
              ? "outOfSync"
              : target === null
                ? "unknown"
                : sameCents(live.amount, target)
                  ? "inSync"
                  : "outOfSync",
          };
        }
      }

      cycles[iv] = { azn, appStore, googlePlay };
    }
    return { subjectId: s.id, cycles };
  });

  return {
    rate,
    rows,
    appStoreProblem: apple.ok ? null : apple.problem,
    googlePlayProblem: play.ok ? null : play.problem,
    productMapFailed: products === null,
  };
}
