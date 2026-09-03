// WIRING: a rail plus the database becomes a set of dependencies — SERVER ONLY.
//
// `notificationCore.ts` and `reconcileCore.ts` decide; this file supplies. The
// split exists so the deciding halves import no secret, no network client and no
// database handle, and can therefore be exercised in full without a key, a
// certificate authority or a purchase.
//
// It is also the only place the two rails are named. The production and sandbox
// notification routes differ in exactly one argument to
// `buildNotificationDeps`, so they cannot drift into behaving differently —
// which is the bug that would surface during App Review, when a reviewer's
// sandbox purchase hits our production server.
//
// THE WRITER IS IMPORTED, NEVER REIMPLEMENTED. `grantAppleEntitlement` is the
// one place a verified Apple transaction becomes access; the redeem route, the
// restore route and both notification routes all reach it through here. Its own
// header says so, and the reason is the ordinary one: a rule enforced in three
// places is a rule that will be enforced in two.
import "server-only";
import { getAppleIapConfig } from "@/lib/payments/apple/config";
import { grantAppleEntitlement } from "@/lib/payments/apple/grantEntitlement";
import { productionRail } from "@/lib/payments/apple/rails";
import { railForSignedData } from "@/lib/payments/apple/verifier";
import type { AppleRail } from "@/lib/payments/apple/rails";
import type { AppleEnvironment } from "@/lib/payments/apple";
import type { NotificationDeps, TransactionInfoResult } from "./notificationCore";
import type { ReconcileDeps } from "./reconcileCore";
import {
  claimNotification,
  countUnattributableIntents,
  listUnconsumedIntents,
  revokeAppleEntitlement,
  settleNotification,
} from "./store";

/**
 * MAY THE SANDBOX RAIL WRITE ACCESS? — the second lock, unset in production.
 *
 * Read from the environment and never from a database setting: a payment posture
 * that can be flipped at runtime is exactly what
 * `docs/STORE_PAYMENTS_COMPLIANCE.md` forbids for the store binary, and the same
 * reasoning applies to the server half of the rail. Unset means off.
 *
 * DELIBERATELY NOT NAMED `APPLE_IAP_*`. That prefix is the CREDENTIAL namespace
 * — issuer id, key id, private key, root certificates — and
 * `lib/payments/apple/__tests__/invariants.test.ts` enforces that it is read in
 * exactly one module, `config.ts`, so a secret cannot acquire a second reader by
 * accident. This is a posture switch and not a secret; giving it that prefix
 * would either break the invariant or force it to be weakened, and the invariant
 * is worth more than the naming symmetry.
 *
 * WHAT IT DOES NOT DO. It cannot make the sandbox rail grant production access.
 * `grantAppleEntitlement` calls `requireProductionGrant`, which returns null for
 * a sandbox transaction, and answers `{ ok: true, granted: false }` without
 * writing anything. Turning this on in an internal build only lets the sandbox
 * route walk the whole path up to that refusal, which is what makes the path
 * testable end to end.
 */
export function sandboxGrantsEnabled(): boolean {
  const raw = (process.env.APPLE_SANDBOX_GRANTS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/**
 * THE "go and check" call, bound to one rail and reduced to ok / not-ok.
 *
 * RAIL-BOUND ON PURPOSE, and this is where it differs from
 * `requeryVerifiedTransaction` in the shared module. That function tries
 * production and then sandbox, because it serves a CLIENT-SUPPLIED transaction
 * id whose rail is unknown. Here the rail is not in question: a notification
 * arrived at the production URL and was verified by the production verifier, so
 * production is the only host that may answer for it. Falling back to sandbox
 * would be asking a second question after the first one said no.
 */
function requeryOn<E extends AppleEnvironment>(rail: AppleRail<E>) {
  return async (transactionId: string): Promise<TransactionInfoResult> => {
    const result = await rail.api.getTransactionInfo(transactionId);
    if (!result.ok) {
      console.error(
        `[apple] ${rail.environment} transaction re-query failed: ${result.error}` +
          (result.status === null ? "" : ` status=${result.status}`),
      );
      return { ok: false };
    }
    return { ok: true, signedTransactionInfo: result.data.signedTransactionInfo };
  };
}

/**
 * Build the dependency set for one notification rail.
 *
 * `allowGrants` is a parameter rather than something read in here, so that each
 * route states its own posture at its own call site where a reviewer sees it.
 */
export function buildNotificationDeps<E extends AppleEnvironment>(
  rail: AppleRail<E>,
  allowGrants: boolean,
): NotificationDeps<E> {
  return {
    environment: rail.environment,
    allowGrants,

    claimedRail: railForSignedData,
    verifyNotification: (signed) => rail.verifier.verifyNotification(signed),
    verifyTransaction: (signed, source) => rail.verifier.verifyTransaction(signed, source),
    getTransactionInfo: requeryOn(rail),

    claim: claimNotification,
    settle: settleNotification,
    revoke: revokeAppleEntitlement,

    // `via: "notification"` and a null actor, because Apple is not a parent and
    // has no profile. No `expectedIntentId` and no `requireParentProfileId`
    // either: those two exist to stop a CLIENT aiming a genuine transaction at
    // an intent of its choosing, and there is no client here — the intent comes
    // from the appAccountToken inside Apple's own signed payload.
    write: (transaction) =>
      grantAppleEntitlement({ transaction, via: "notification", actorProfileId: null }),
  };
}

/**
 * Build the dependency set for the reconciliation sweep.
 *
 * PRODUCTION RAIL ONLY, and hard-coded rather than parameterised. There is
 * nothing for the sandbox rail to reconcile: a sandbox transaction cannot become
 * access on any path, so a sweep for it would be a loop that always decides
 * nothing. Making the rail an argument would only create the possibility of
 * calling it with the wrong one.
 *
 * Returns null when the app is not configured for Apple IAP — the sweep then
 * reports that it did nothing, rather than asking Apple questions it cannot
 * sign.
 */
export function buildReconcileDeps(): ReconcileDeps | null {
  if (!getAppleIapConfig()) return null;
  const rail = productionRail();
  return {
    listCandidates: listUnconsumedIntents,
    countUnattributable: countUnattributableIntents,
    getTransactionInfo: requeryOn(rail),
    verifyTransaction: (signed, source) => rail.verifier.verifyTransaction(signed, source),
    revoke: revokeAppleEntitlement,
    write: (transaction) =>
      grantAppleEntitlement({ transaction, via: "notification", actorProfileId: null }),
  };
}
