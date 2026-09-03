// APP STORE SERVER NOTIFICATIONS V2 — THE SANDBOX RAIL.
//
// This is the URL entered in App Store Connect as the Sandbox Server URL. It is
// its OWN ROUTE and not a query parameter or a branch, because Apple's
// `SignedDataVerifier` takes the environment in its CONSTRUCTOR — the rail is
// chosen when the verifier is built, not when a payload is read, so the choice
// cannot be steered by anything in a request.
//
// WHY IT EXISTS AT ALL. App Review testers purchase against SANDBOX StoreKit,
// and their transactions reach OUR PRODUCTION SERVER because that is the only
// server their build knows. If production could not verify sandbox data, review
// would fail. So both rails are built in every deployment, always.
//
// ------------------------------------------- A SANDBOX PURCHASE GRANTS NOTHING
// THREE INDEPENDENT LOCKS, and none of them may be removed to make another one
// look redundant:
//
//   1. THE TYPE SYSTEM. Everything downstream is generic in the environment: a
//      `VerifiedTransaction<"Sandbox">` produces an `AppleGrant<"Sandbox">`, and
//      the shared entitlement writer takes an `AppleGrant<"Production">`. There
//      is no assignment between them. The only crossing is
//      `requireProductionGrant()`, which returns null here — one greppable name
//      a reviewer can find.
//   2. THIS ROUTE'S `allowGrants` FLAG, from `APPLE_SANDBOX_GRANTS`, which
//      is UNSET IN PRODUCTION and therefore false. With it off the route
//      verifies, re-queries, records and stops — it never reaches the writer at
//      all. With it on (an internal build) it walks the whole path and stops at
//      lock 1, which is what makes the path testable end to end.
//   3. THE EXTERNAL REF NAMESPACE. This rail writes no grant at all, so the only
//      key it ever computes is the one a REFUND would revoke under — and that is
//      prefixed `apple_sandbox:` (`_lib/externalRef.ts`). Without the prefix, a
//      sandbox transaction id that happened to match a real customer's
//      production ref would revoke THAT CUSTOMER's access on a reviewer's test
//      refund. Sandbox and production are separate id spaces with no guarantee
//      they cannot coincide, so the namespace is what makes the collision
//      unrepresentable rather than merely unlikely.
//
// If you are here to make sandbox purchases grant access on a real deployment:
// that is not a switch, it is a redesign, and lock 1 is the one you would have
// to defeat with a cast. Don't.
//
// WHAT IT DOES DO, and why it is worth having rather than a 404: it RECORDS. A
// reviewer's purchase arriving, verifying and being attributed to a product is
// the single most useful fact to hold when a rejection has to be answered, and
// `iap_notifications` is where it lands.
import { sandboxRail } from "@/lib/payments/apple/rails";
import {
  refuseAppleNotificationGet,
  serveAppleNotification,
} from "../../_lib/notificationRoute";
import { sandboxGrantsEnabled } from "../../_lib/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return serveAppleNotification(request, sandboxRail(), sandboxGrantsEnabled());
}

export function GET(): Response {
  return refuseAppleNotificationGet();
}
