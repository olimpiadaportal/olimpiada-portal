// APP STORE SERVER NOTIFICATIONS V2 — THE PRODUCTION RAIL.
//
// This is the URL entered in App Store Connect as the Production Server URL. Its
// sandbox twin lives one directory down, and it is a SEPARATE ROUTE rather than
// a branch because Apple's `SignedDataVerifier` takes the environment in its
// CONSTRUCTOR: one route, one verifier, one API host, no runtime decision that
// could be got wrong in the direction that grants a sandbox purchase real
// access.
//
// PUBLIC BY NECESSITY. Apple calls it and carries no credential of ours, so it
// must be safe when called by anyone. Everything that makes it safe is in the
// modules it calls:
//
//   _lib/notificationRoute.ts  bounds the request  (rate limit, body cap)
//   _lib/notificationCore.ts   decides             (verify -> RE-QUERY -> act)
//   _lib/store.ts              writes              (claim/settle, revoke)
//   lib/payments/apple/**      verifies            (Apple's own chain checker)
//
// THE ONE THING TO KNOW BEFORE CHANGING ANYTHING HERE: a verified notification
// is a "go and check" ping and nothing more — the posture
// `azericard/callback.ts` takes toward the bank. The body is read to learn WHICH
// transaction to ask Apple about; the answer to that question is the only thing
// this platform grants on. `toAppleGrant` enforces it by refusing any
// transaction whose source is not `"requery"`.
//
// GRANTS ARE ON HERE. This is the rail that sells; `allowGrants` is true, and a
// production grant reaching the shared writer is the entire point of the file.
import { productionRail } from "@/lib/payments/apple/rails";
import {
  refuseAppleNotificationGet,
  serveAppleNotification,
} from "../_lib/notificationRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return serveAppleNotification(request, productionRail(), true);
}

export function GET(): Response {
  return refuseAppleNotificationGet();
}
