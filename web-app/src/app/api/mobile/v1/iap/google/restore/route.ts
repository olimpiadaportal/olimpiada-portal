// Mobile BFF — RESTORE GOOGLE PLAY PURCHASES. Parent bearer only.
//
// The twin of ../../apple/restore/route.ts. A family that reinstalls, or signs
// in on a second device, gets back what it paid for without paying again.
//
// WHAT THE APP SENDS: the purchases Play Billing still reports on this device
// (`queryPurchasesAsync` — owned, i.e. not yet consumed) as
// [{ product_id, purchase_token }]. Client strings, so each is a QUESTION for
// Google, never a claim.
//
// A FOREIGN PURCHASE IS NOT RESTORED. Each purchase is granted ONLY to the child
// its own obfuscatedExternalAccountId names — never to a child the caller picks
// — and only when that child is THIS parent's (owner of the intent, or an active
// link to its child). No intent id is accepted from the client at all.
//
// SAFE TO CALL REPEATEDLY: the same write path a redeem runs, idempotent on
// (google_play, external_ref). PARTIAL SUCCESS IS A SUCCESS, and the per-item
// outcome is coarse on purpose — the internal codes stay in the server log.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import {
  grantGoogleEntitlement,
  requeryPlayPurchase,
} from "@/lib/payments/google/grantEntitlement";
import { PLAY_PRODUCT_ID_RE, PURCHASE_TOKEN_RE } from "@/lib/payments/google/purchase";
import { rateLimitAllow } from "@/lib/rateLimit";
import {
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same bound as the Apple restore: each item costs an outbound call to Google. */
const MAX_TRANSACTIONS = 25;
const CONCURRENCY = 4;

const RATE_SCOPE = "gprestore";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60_000;

type RestoreItem = { productId: string; purchaseToken: string };

type RestoreOutcome = {
  product_id: string;
  /** Echoed so the app can match each outcome to its own purchase record. */
  purchase_token: string;
  /**
   * granted — a live entitlement exists for it now;
   * pending — genuine but not grantable yet (a delayed payment method, or a
   *           test purchase with test grants off);
   * refused — Google did not confirm it, it is not this parent's, or it was
   *           refunded. The reason is in the server log, never here.
   */
  status: "granted" | "pending" | "refused";
  student_profile_id?: string;
  ends_at?: string | null;
  consumed?: boolean;
};

function readItems(body: Record<string, unknown>): RestoreItem[] {
  const raw = body.purchases;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RestoreItem[] = [];
  for (const entry of raw.slice(0, MAX_TRANSACTIONS * 2)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const productId = typeof row.product_id === "string" ? row.product_id.trim() : "";
    const purchaseToken = typeof row.purchase_token === "string" ? row.purchase_token.trim() : "";
    // Shape only; anything that could never be a real purchase is dropped
    // rather than failing the whole restore.
    if (!PLAY_PRODUCT_ID_RE.test(productId) || !PURCHASE_TOKEN_RE.test(purchaseToken)) continue;
    if (seen.has(purchaseToken)) continue;
    seen.add(purchaseToken);
    out.push({ productId, purchaseToken });
    if (out.length >= MAX_TRANSACTIONS) break;
  }
  return out;
}

async function restoreOne(item: RestoreItem, parentProfileId: string): Promise<RestoreOutcome> {
  const base = { product_id: item.productId, purchase_token: item.purchaseToken };
  const requeried = await requeryPlayPurchase(item.productId, item.purchaseToken);
  if (!requeried.ok) {
    console.error("[google] restore could not confirm a payment:", requeried.reason);
    return { ...base, status: "refused" };
  }
  const result = await grantGoogleEntitlement({
    purchase: requeried.purchase,
    // NO expectedIntentId: the purchase's own obfuscatedExternalAccountId names
    // the intent, and requireParentProfileId keeps it from being a stranger's.
    requireParentProfileId: parentProfileId,
    actorProfileId: parentProfileId,
    via: "restore",
  });
  if (!result.ok) {
    console.error("[google] restore refused a payment:", result.reason);
    return { ...base, status: "refused" };
  }
  if (!result.granted) {
    return { ...base, status: "pending", student_profile_id: result.studentProfileId };
  }
  return {
    ...base,
    status: "granted",
    student_profile_id: result.studentProfileId,
    ends_at: result.endsAt,
    consumed: result.consumed,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before the body is read.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    if (!rateLimitAllow(RATE_SCOPE, parent.profileId, RATE_LIMIT, RATE_WINDOW_MS)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    // Purchase tokens are long; 25 of them do not fit the 4KB house default,
    // and an oversized body reads as EMPTY — which would silently strand a
    // paying family. The work is bounded by MAX_TRANSACTIONS, not the body.
    const body = await readJsonBody(request, 64 * 1024);
    const items = readItems(body);
    if (items.length === 0) {
      return okResponse({ checked: 0, granted: 0, results: [] as RestoreOutcome[] });
    }

    const results: RestoreOutcome[] = [];
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      results.push(...(await Promise.all(batch.map((it) => restoreOne(it, parent.profileId)))));
    }

    return okResponse({
      checked: results.length,
      granted: results.filter((r) => r.status === "granted").length,
      results,
    });
  } catch {
    return errorResponse("iap.err.generic", 500, true);
  }
}
