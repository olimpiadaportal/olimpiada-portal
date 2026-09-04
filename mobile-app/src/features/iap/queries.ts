// React Query wiring for the iOS purchase surface.
//
// EVERY HOOK HERE IS INERT OFF iOS. `IAP_PLATFORM_SUPPORTED` is a build-time
// platform constant, not a server flag, and it gates `enabled` on every query in
// this file — so on Android nothing is fetched, nothing is rendered and the
// binary behaves exactly as it did before this rail existed. That is a store-policy
// requirement, not a preference (Google's consumption-only test is app-wide and
// the parent tabs share the binary with the child).
//
// NEITHER QUERY IS ALLOWED TO LEAVE THE SCREEN IN A SPINNER. Both resolve or
// fail within react-query's own budget, both report failure as a rendered
// sentence rather than a thrown error, and the surface has a manual retry.
import { useQuery } from "@tanstack/react-query";
import { fetchTaughtSubjectIds } from "@/lib/data";
import { buildOffers, fetchIosIapCatalog, sellableProductIds, type IapOffer } from "./catalog";
import { appleStore, IAP_PLATFORM_SUPPORTED } from "./store";
import type { IapCatalogRow, StoreProduct } from "./types";

const QK = {
  catalog: ["iap", "ios", "catalog"] as const,
  products: (ids: string) => ["iap", "ios", "storekit", ids] as const,
  taught: (gradeId: string) => ["iap", "ios", "taught", gradeId] as const,
};

/**
 * WHAT THE PURCHASE SURFACE SHOULD DO RIGHT NOW.
 *
 *   off       — not iOS. Render nothing at all.
 *   loading   — one of the reads (catalogue, StoreKit, grade rule) is still in
 *               flight.
 *   none      — the platform sells nothing on iOS yet (every `iap_products` row
 *               is inactive, which is production's state until the owner turns
 *               products on in App Store Connect). The surface renders NOTHING
 *               and the screen keeps the sentence it already showed. An empty
 *               "no items available" panel would read to a reviewer as an
 *               unfinished feature — the exact 2.1.0 rejection this app already
 *               collected once.
 *   unavailable — we DO sell something, but StoreKit could not be reached or
 *               returned no priced product. Say so and offer a retry; never a
 *               blank, never a permanent spinner, never a purchase button
 *               without a price.
 *   ready     — offers, each carrying Apple's own price string.
 */
export type IapSurfaceState = "off" | "loading" | "none" | "unavailable" | "ready";

export type IapOffers = {
  state: IapSurfaceState;
  offers: IapOffer[];
  refetch: () => void;
};

/** Active iOS catalogue rows (empty and non-failing off iOS). */
function useIosCatalog() {
  return useQuery<IapCatalogRow[]>({
    queryKey: QK.catalog,
    queryFn: fetchIosIapCatalog,
    enabled: IAP_PLATFORM_SUPPORTED,
    staleTime: 10 * 60_000,
  });
}

/** StoreKit's answer for those SKUs — connection included, failures contained. */
function useStoreProducts(productIds: string[]) {
  const key = [...productIds].sort().join(",");
  return useQuery<StoreProduct[]>({
    queryKey: QK.products(key),
    queryFn: async () => {
      // The connection is opened here rather than at app start: a store
      // connection is only ever needed by this surface, and opening it lazily
      // keeps StoreKit entirely out of a session that never visits it.
      await appleStore.connect();
      return appleStore.fetchProducts(key.length > 0 ? key.split(",") : []);
    },
    enabled: IAP_PLATFORM_SUPPORTED && key.length > 0,
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
function useTaughtSubjects(gradeId: string | null) {
  return useQuery<ReadonlySet<string> | null>({
    queryKey: QK.taught(gradeId ?? "-"),
    queryFn: () => fetchTaughtSubjectIds(gradeId),
    // Off iOS, and for a child with no grade, nothing is fetched: an Android
    // build must issue no request it did not issue yesterday, and a null grade
    // is already the answer.
    enabled: IAP_PLATFORM_SUPPORTED && gradeId !== null,
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
export function useIapOffers(coveredSubjectIds: string[], gradeId: string | null): IapOffers {
  const catalog = useIosCatalog();
  const rows = catalog.data ?? [];
  const ids = sellableProductIds(rows);
  const products = useStoreProducts(ids);
  const taught = useTaughtSubjects(gradeId);

  const refetch = () => {
    void catalog.refetch();
    void products.refetch();
    // refetch() ignores `enabled`, so the guard is the same one the query has.
    if (IAP_PLATFORM_SUPPORTED && gradeId !== null) void taught.refetch();
  };

  if (!IAP_PLATFORM_SUPPORTED) return { state: "off", offers: [], refetch };

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
  // DISABLED off iOS and for a gradeless child, and a disabled query stays
  // pending forever — the panel would hold a spinner it never leaves.
  if (taught.isLoading) return { state: "loading", offers: [], refetch };

  const offers = buildOffers(rows, products.data ?? [], coveredSubjectIds, taught.data ?? null);
  // Products exist in the catalogue but StoreKit priced none of them (not yet
  // approved, wrong bundle id, no storefront). Honest sentence + retry.
  if ((products.data ?? []).length === 0) return { state: "unavailable", offers: [], refetch };
  // Everything on offer is already covered for this child. Nothing to sell and
  // nothing is wrong — the plan card above already says what they have.
  if (offers.length === 0) return { state: "none", offers: [], refetch };

  return { state: "ready", offers, refetch };
}
