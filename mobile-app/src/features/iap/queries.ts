// React Query wiring for the purchase surface (iOS StoreKit; Android Google
// Play Billing since the owner decision of 2026-10-10).
//
// EVERY HOOK HERE IS INERT WITHOUT A STORE RAIL. `IAP_PLATFORM_SUPPORTED` is a
// build-time platform constant and it gates `enabled` on every query in this
// file. The caller supplies a second, runtime availability gate for
// free-access/payment-off states; that gate can close the store sheet but
// cannot change which payment rail the binary contains.
//
// NEITHER QUERY IS ALLOWED TO LEAVE THE SCREEN IN A SPINNER. Both resolve or
// fail within react-query's own budget, both report failure as a rendered
// sentence rather than a thrown error, and the surface has a manual retry.
import { useQuery } from "@tanstack/react-query";
import { fetchTaughtSubjectIds } from "@/lib/data";
import { buildOffers, fetchIapCatalog, sellableProductIds, type IapOffer } from "./catalog";
import { IAP_DB_PLATFORM } from "./platform";
import { rail } from "./rail";
import { IAP_PLATFORM_SUPPORTED } from "./store";
import type { IapCatalogRow, StoreProduct } from "./types";

/** "ios" / "android" — keys the cache per platform, so the two can never mix. */
const P = IAP_DB_PLATFORM ?? "none";

const QK = {
  catalog: ["iap", P, "catalog"] as const,
  products: (ids: string) => ["iap", P, "store", ids] as const,
  taught: (gradeId: string) => ["iap", P, "taught", gradeId] as const,
};

/**
 * WHAT THE PURCHASE SURFACE SHOULD DO RIGHT NOW.
 *
 *   off       — no store rail in this build, or the rail is closed. Render
 *               nothing at all.
 *   loading   — one of the reads (catalogue, store, grade rule) is still in
 *               flight.
 *   none      — the platform sells nothing yet (every `iap_products` row of
 *               this platform is inactive — Android's state until the owner
 *               creates the Play products and switches the rows on). The surface renders NOTHING
 *               and the screen keeps the sentence it already showed. An empty
 *               "no items available" panel would read to a reviewer as an
 *               unfinished feature — the exact 2.1.0 rejection this app already
 *               collected once.
 *   unavailable — we DO sell something, but the store could not be reached or
 *               returned no priced product. Say so and offer a retry; never a
 *               blank, never a permanent spinner, never a purchase button
 *               without a price.
 *   ready     — offers, each carrying the store's own price string.
 */
export type IapSurfaceState = "off" | "loading" | "none" | "unavailable" | "ready";

export type IapOffers = {
  state: IapSurfaceState;
  offers: IapOffer[];
  refetch: () => void;
};

/** Active catalogue rows for this build's platform (none without a rail). */
function usePlatformCatalog(enabled: boolean) {
  return useQuery<IapCatalogRow[]>({
    queryKey: QK.catalog,
    queryFn: () => (IAP_DB_PLATFORM ? fetchIapCatalog(IAP_DB_PLATFORM) : Promise.resolve([])),
    enabled: IAP_PLATFORM_SUPPORTED && enabled,
    staleTime: 10 * 60_000,
  });
}

/** The store's answer for those SKUs — connection included, failures contained. */
function useStoreProducts(productIds: string[], enabled: boolean) {
  const key = [...productIds].sort().join(",");
  return useQuery<StoreProduct[]>({
    queryKey: QK.products(key),
    queryFn: async () => {
      // The connection is opened here rather than at app start: a store
      // connection is only ever needed by this surface, and opening it lazily
      // keeps the billing library entirely out of a session that never
      // visits it.
      await rail.store.connect();
      return rail.store.fetchProducts(key.length > 0 ? key.split(",") : []);
    },
    enabled: IAP_PLATFORM_SUPPORTED && enabled && key.length > 0,
    staleTime: 10 * 60_000,
    // One retry, not react-query's default three. A device with purchases
    // switched off fails the same way every time, and three rounds of backoff
    // is a long time to hold a parent on a skeleton.
    retry: 1,
  });
}

/**
 * Which subjects THIS CHILD'S GRADE studies (migration 155). The answer is the
 * database's, never re-derived here — the same RPC the child's own screens use,
 * so the two can never disagree about what exists for this child.
 *
 * `null` — no grade on the record, or a failed read — means the rule cannot be
 * applied and nothing is filtered. `fetchTaughtSubjectIds` swallows the RPC
 * error into exactly that null, so this query does not fail and the offers do
 * not vanish because one read hiccuped.
 */
function useTaughtSubjects(gradeId: string | null, enabled: boolean) {
  return useQuery<ReadonlySet<string> | null>({
    queryKey: QK.taught(gradeId ?? "-"),
    queryFn: () => fetchTaughtSubjectIds(gradeId),
    // With the rail closed, and for a child with no grade, nothing is fetched:
    // a closed rail issues no request, and a null grade is already the answer.
    enabled: IAP_PLATFORM_SUPPORTED && enabled && gradeId !== null,
    staleTime: 10 * 60_000,
  });
}

/**
 * The one hook a screen calls. `coveredSubjectIds` are the subjects this child
 * already holds; they are hidden so a parent is never offered something the
 * server would refuse to sell them twice.
 *
 * `gradeId` is the SELECTED CHILD'S grade and is required, not optional: a
 * purchase surface that forgets it sells subjects the grade does not study, and
 * the resulting entitlement is then filtered out by every child screen — the
 * parent pays and the app visibly does nothing. Pass `null` only when the child
 * genuinely has no grade on record.
 */
export function useIapOffers(
  coveredSubjectIds: string[],
  gradeId: string | null,
  enabled = true,
): IapOffers {
  const active = IAP_PLATFORM_SUPPORTED && enabled;
  const catalog = usePlatformCatalog(active);
  const rows = catalog.data ?? [];
  const ids = sellableProductIds(rows);
  const products = useStoreProducts(ids, active);
  const taught = useTaughtSubjects(gradeId, active);

  const refetch = () => {
    if (!active) return;
    void catalog.refetch();
    if (ids.length > 0) void products.refetch();
    // refetch() ignores `enabled`, so the guard is the same one the query has.
    if (gradeId !== null) void taught.refetch();
  };

  if (!active) return { state: "off", offers: [], refetch };

  if (catalog.isPending) return { state: "loading", offers: [], refetch };
  // A catalogue read that FAILED is treated as "nothing to sell", not as an
  // error: the failure is ours, the family did nothing wrong, and the screen
  // still shows their real subscription above. Purchasing simply does not
  // appear this session.
  if (catalog.isError || ids.length === 0) return { state: "none", offers: [], refetch };

  if (products.isPending) return { state: "loading", offers: [], refetch };
  if (products.isError) return { state: "unavailable", offers: [], refetch };

  // THE GRADE RULE LANDS BEFORE THE FIRST PRICE BUTTON DOES. Painting the
  // unfiltered list for the moment this read is in flight is long enough for a
  // parent to tap a subject their child's grade does not study, and the sale
  // that follows is the silent one. `isLoading`, never `isPending`: the query is
  // DISABLED when the rail is closed and for a gradeless child, and a disabled query stays
  // pending forever — the panel would hold a spinner it never leaves.
  if (taught.isLoading) return { state: "loading", offers: [], refetch };

  const offers = buildOffers(rows, products.data ?? [], coveredSubjectIds, taught.data ?? null);
  // Products exist in the catalogue but the store priced none of them (not yet
  // approved/active, wrong bundle id or package, no storefront). Honest sentence + retry.
  if ((products.data ?? []).length === 0) return { state: "unavailable", offers: [], refetch };
  // Everything on offer is already covered for this child. Nothing to sell and
  // nothing is wrong — the plan card above already says what they have.
  if (offers.length === 0) return { state: "none", offers: [], refetch };

  return { state: "ready", offers, refetch };
}
