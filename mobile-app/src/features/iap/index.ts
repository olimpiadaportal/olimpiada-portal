// Public surface of the Apple in-app-purchase rail.
//
// Screens import from HERE and never reach into the files below. `store.ts` is
// the single StoreKit seam; `purchaseFlow.ts` / `restoreFlow.ts` hold the
// sequence and are pure; `queries.ts` decides what the surface should be doing
// right now. Nothing in this directory does anything at all when
// IAP_PLATFORM_SUPPORTED is false.
export { IAP_PLATFORM_SUPPORTED } from "./platform";
export { IapPanel } from "./IapPanel";
export { RestoreAccessButton } from "./RestoreAccessButton";
export { useIapOffers, type IapOffers, type IapSurfaceState } from "./queries";
export type { IapOffer } from "./catalog";
export type { PurchaseOutcome, RestoreOutcome } from "./types";
