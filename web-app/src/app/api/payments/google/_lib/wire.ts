// WIRING: Google + the database become a set of dependencies — SERVER ONLY.
//
// notificationCore.ts and reconcileCore.ts decide; this file supplies, so the
// deciding halves import no secret, no network client and no database handle.
//
// THE WRITER IS IMPORTED, NEVER REIMPLEMENTED: grantGoogleEntitlement is the one
// place a verified Play purchase becomes access, for redeem, restore and the
// notification consumer alike.
import "server-only";
import { getGooglePlayConfig } from "@/lib/payments/google/config";
import { listVoidedPurchases } from "@/lib/payments/google/client";
import {
  grantGoogleEntitlement,
  requeryPlayPurchase,
} from "@/lib/payments/google/grantEntitlement";
import type { GoogleNotificationDeps } from "./notificationCore";
import type { GoogleReconcileDeps } from "./reconcileCore";
import {
  claimGoogleNotification,
  findLiveGoogleRefs,
  revokeGoogleRefs,
  settleGoogleNotification,
} from "./store";

/** Null when the Play API is not configured — the route then answers 503. */
export function buildGoogleNotificationDeps(): GoogleNotificationDeps | null {
  const config = getGooglePlayConfig();
  if (!config) return null;
  return {
    packageName: config.packageName,
    claim: claimGoogleNotification,
    settle: settleGoogleNotification,
    requery: requeryPlayPurchase,
    // Google is not a parent: no expectedIntentId and no requireParentProfileId.
    // The intent comes from obfuscatedExternalAccountId in Google's own answer.
    write: (purchase) =>
      grantGoogleEntitlement({ purchase, via: "notification", actorProfileId: null }),
    revoke: revokeGoogleRefs,
  };
}

/** Null when the Play API is not configured — the sweep then does nothing. */
export function buildGoogleReconcileDeps(): GoogleReconcileDeps | null {
  if (!getGooglePlayConfig()) return null;
  return {
    listVoided: async (pageToken) => {
      const page = await listVoidedPurchases(pageToken);
      if (!page.ok) {
        console.error(
          `[google] voided purchase list failed: ${page.error}` +
            (page.status === null ? "" : ` status=${page.status}`),
        );
        return { ok: false };
      }
      return { ok: true, items: page.data.voidedPurchases, nextPageToken: page.data.nextPageToken };
    },
    findLiveRefs: findLiveGoogleRefs,
    revoke: revokeGoogleRefs,
  };
}
