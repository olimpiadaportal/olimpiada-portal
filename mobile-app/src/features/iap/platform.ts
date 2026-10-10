// WHICH STORE THIS BINARY SELLS THROUGH, and nothing else.
//
// Its own file so a screen can ask "may this device purchase?" without pulling
// the billing library into the module graph. `store.ts` imports it too, so
// there is exactly ONE definition of the answer.
//
// A BUILD-TIME CONSTANT, NEVER A SERVER FLAG. CLAUDE.md and
// docs/STORE_PAYMENTS_COMPLIANCE.md both say it plainly: a purchase flow sitting
// in a store binary behind a remotely-flippable switch is Apple 2.3.1(a), and
// the penalty is developer-account termination rather than a rejection.
// `Platform.OS` is fixed when the binary is built, so the RAIL a build contains
// can never be changed from a database row. The admin control plane may still
// CLOSE the rail at runtime (giveaway, scheduled free access, payments off —
// see paidAccessAvailable() in features/parent/commerce.ts); it can never open
// a different one.
//
// TWO STORES SINCE 2026-10-10 (owner decision). iOS has sold through StoreKit
// since 1.15.0 (Apple approved the rail and all 21 products on 2026-09-09).
// Android now sells through Google Play Billing on the same terms: the same
// subjects × week/month/year, each purchase bound to ONE child by our intent
// id, verified by our server with Google before any access exists, every price
// Google's own localised string. This retired "Android stays purchase-silent".
// What did NOT change on either platform: no web checkout and no external link
// in the binary, no price of our own, and a CHILD has no purchase surface.
import { Platform } from "react-native";

/** The billing system this build talks to. `null` = no store rail at all. */
export type IapStoreName = "apple" | "google";

export const IAP_STORE: IapStoreName | null =
  Platform.OS === "ios" ? "apple" : Platform.OS === "android" ? "google" : null;

/** May this build show a purchase surface at all? True on iOS and Android. */
export const IAP_PLATFORM_SUPPORTED = IAP_STORE !== null;

/** `iap_products.platform` for this build's store. */
export const IAP_DB_PLATFORM: "ios" | "android" | null =
  IAP_STORE === "apple" ? "ios" : IAP_STORE === "google" ? "android" : null;
