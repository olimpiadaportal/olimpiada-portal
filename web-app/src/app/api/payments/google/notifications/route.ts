// GOOGLE PLAY REAL-TIME DEVELOPER NOTIFICATIONS — the Pub/Sub push endpoint.
//
// This is the URL configured as the PUSH endpoint of the Pub/Sub subscription on
// the topic named in Play Console → Monetization setup → Real-time developer
// notifications. The subscription must be created WITH AUTHENTICATION (a
// service account, and an audience equal to GOOGLE_PLAY_RTDN_AUDIENCE).
//
//   _lib/notificationRoute.ts  authenticates and bounds (OIDC, rate limit, cap)
//   _lib/notificationCore.ts   decides  (re-query -> shared writer; void -> revoke)
//   _lib/store.ts              writes   (claim/settle, revoke)
//   lib/payments/google/**     verifies (purchases.products.get) and grants
import {
  refuseGoogleNotificationGet,
  serveGoogleNotification,
} from "../_lib/notificationRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return serveGoogleNotification(request);
}

export function GET(): Response {
  return refuseGoogleNotificationGet();
}
