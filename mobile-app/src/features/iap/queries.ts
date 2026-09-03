// React Query wiring for the iOS purchase surface.
//
// EVERY HOOK HERE IS INERT OFF iOS. `IAP_PLATFORM_SUPPORTED` is a build-time
// platform constant, not a server flag, and it gates `enabled` on both queries —
// so on Android nothing is fetched, nothing is rendered and the binary behaves
// exactly as it did before this rail existed. That is a store-policy
// requirement, not a preference (Google's consumption-only test is app-wide and
// the parent tabs share the binary with the child).
//
// NEITHER QUERY IS ALLOWED TO LEAVE THE SCREEN IN A SPINNER. Both resolve or
// fail within react-query's own budget, both report failure as a rendered
// sentence rather than a thrown error, and the surface has a manual retry.
import { useQuery } from "@tanstack/react-query";
import { buildOffers, fetchIosIapCatalog, sellableProductIds, type IapOffer } from "./catalog";
import { appleStore, IAP_PLATFORM_SUPPORTED } from "./store";
import type { IapCatalogRow, StoreProduct } from "./types";

const QK = {
  catalog: ["iap", "ios", "catalog"] as const,
  products: (ids: string) => ["iap", "ios", "storekit", ids] as const,
};

/**
 * WHAT THE PURCHASE SURFACE SHOULD DO RIGHT NOW.
 *
 *   off       — not iOS. Render nothing at all.
 *   loading   — one of the two reads is still in flight.
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
 * The one hook a screen calls. `coveredSubjectIds` are the subjects this child
 * already holds; they are hidden so a parent is never offered something the
 * server would refuse to sell them twice.
 */
export function useIapOffers(coveredSubjectIds: string[]): IapOffers {
  const catalog = useIosCatalog();
  const rows = catalog.data ?? [];
  const ids = sellableProductIds(rows);
  const products = useStoreProducts(ids);

  const refetch = () => {
    void catalog.refetch();
    void products.refetch();
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

  const offers = buildOffers(rows, products.data ?? [], coveredSubjectIds);
  // Products exist in the catalogue but StoreKit priced none of them (not yet
  // approved, wrong bundle id, no storefront). Honest sentence + retry.
  if ((products.data ?? []).length === 0) return { state: "unavailable", offers: [], refetch };
  // Everything on offer is already covered for this child. Nothing to sell and
  // nothing is wrong — the plan card above already says what they have.
  if (offers.length === 0) return { state: "none", offers: [], refetch };

  return { state: "ready", offers, refetch };
}
