// What a Google Play real-time developer notification does, pinned against
// injected dependencies — no key, no Pub/Sub, no purchase.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleGoogleNotification,
  notificationUuidForMessage,
  type GoogleNotificationDeps,
} from "@/app/api/payments/google/_lib/notificationCore";
import { candidateRefsForVoided } from "@/lib/payments/google/purchase";
import { isUuid } from "@/lib/uuid";

const PKG = "ai.olympiq.app";
const MATH_MONTH = "ai.olympiq.app.sub.math.month";
const TOKEN = "tokentokentoken.AO-J1Oy_ExampleValue-0001";
const ORDER = "GPA.3345-6789-0123-45678";

function push(notification: Record<string, unknown> | string, messageId = "13371337133713"): string {
  const data =
    typeof notification === "string"
      ? notification
      : Buffer.from(JSON.stringify({ version: "1.0", packageName: PKG, eventTimeMillis: "1", ...notification })).toString("base64");
  return JSON.stringify({ message: { data, messageId, publishTime: "2026-10-10T00:00:00Z" }, subscription: "projects/p/subscriptions/s" });
}

const calls = {
  claim: [] as Record<string, unknown>[],
  settle: [] as Record<string, unknown>[],
  requery: [] as [string, string][],
  write: 0,
  revoke: [] as string[][],
};
let claimAnswer: "claimed" | "unfinished" | "replay" | "error" = "claimed";
let requeryAnswer: Record<string, unknown> = { ok: true };
let writeAnswer: Record<string, unknown> = {};
let revokeAnswer: number | null = 1;

const deps: GoogleNotificationDeps = {
  packageName: PKG,
  claim: async (i) => (calls.claim.push(i), claimAnswer),
  settle: async (i) => void calls.settle.push(i),
  requery: async (productId, token) => {
    calls.requery.push([productId, token]);
    return (requeryAnswer.ok === true
      ? { ok: true, purchase: { source: "requery", productId, purchaseToken: token, purchase: {} } }
      : requeryAnswer) as never;
  },
  write: async () => (calls.write++, writeAnswer as never),
  revoke: async (refs) => (calls.revoke.push([...refs]), revokeAnswer),
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  calls.claim.length = 0;
  calls.settle.length = 0;
  calls.requery.length = 0;
  calls.write = 0;
  calls.revoke.length = 0;
  claimAnswer = "claimed";
  requeryAnswer = { ok: true };
  writeAnswer = { ok: true, granted: true, alreadyGranted: false, externalRef: `gp:${ORDER}`, consumed: true };
  revokeAnswer = 1;
});

const purchased = { oneTimeProductNotification: { version: "1.0", notificationType: 1, purchaseToken: TOKEN, sku: MATH_MONTH } };

describe("a PURCHASED notification", () => {
  it("is a ping: Google is re-queried and only its answer reaches the writer", async () => {
    const r = await handleGoogleNotification(push(purchased), deps);
    expect(r).toEqual({ status: 200, outcome: "granted" });
    expect(calls.requery).toEqual([[MATH_MONTH, TOKEN]]);
    expect(calls.write).toBe(1);
    expect(calls.settle[0]).toMatchObject({ outcome: "granted", externalRef: `gp:${ORDER}`, productId: MATH_MONTH });
  });

  it("asks to be told again when Google cannot be reached, and leaves the row unsettled", async () => {
    requeryAnswer = { ok: false, reason: "unavailable" };
    const r = await handleGoogleNotification(push(purchased), deps);
    expect(r.status).toBe(500);
    expect(calls.write).toBe(0);
    expect(calls.settle).toHaveLength(0);
  });

  it("records a pending purchase without granting it", async () => {
    writeAnswer = { ok: true, granted: false, reason: "pending" };
    const r = await handleGoogleNotification(push(purchased), deps);
    expect(r).toEqual({ status: 200, outcome: "pending" });
  });

  it("settles a deterministic refusal with 200 and retries only our own faults", async () => {
    writeAnswer = { ok: false, reason: "unknown_intent", retryable: false };
    expect(await handleGoogleNotification(push(purchased, "1"), deps)).toEqual({ status: 200, outcome: "refuse_unknown_intent" });
    writeAnswer = { ok: false, reason: "grant_failed", retryable: true };
    expect((await handleGoogleNotification(push(purchased, "2"), deps)).status).toBe(500);
  });

  it("never asks Google about a malformed token or product", async () => {
    const r = await handleGoogleNotification(
      push({ oneTimeProductNotification: { notificationType: 1, purchaseToken: "a b", sku: "../x" } }),
      deps,
    );
    expect(r).toEqual({ status: 200, outcome: "unusable_purchase" });
    expect(calls.requery).toHaveLength(0);
  });
});

describe("a VOIDED purchase (refund / chargeback)", () => {
  const voided = { voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: ORDER, productType: 2, refundType: 1 } };

  it("revokes every ref the purchase could have been granted under, without a re-query", async () => {
    const r = await handleGoogleNotification(push(voided), deps);
    expect(r).toEqual({ status: 200, outcome: "revoked" });
    expect(calls.revoke).toEqual([candidateRefsForVoided({ orderId: ORDER, purchaseToken: TOKEN })]);
    expect(calls.requery).toHaveLength(0);
    expect(calls.write).toBe(0);
  });

  it("asks to be told again when the revoke could not be confirmed", async () => {
    revokeAnswer = null;
    const r = await handleGoogleNotification(push(voided), deps);
    expect(r.status).toBe(500);
    expect(calls.settle).toHaveLength(0);
  });
});

describe("everything else", () => {
  it("answers a replay with 200 and does nothing", async () => {
    claimAnswer = "replay";
    expect(await handleGoogleNotification(push(purchased), deps)).toEqual({ status: 200, outcome: "replay" });
    expect(calls.requery).toHaveLength(0);
  });

  it("retries when the replay guard could not be reached", async () => {
    claimAnswer = "error";
    expect((await handleGoogleNotification(push(purchased), deps)).status).toBe(500);
    expect(calls.requery).toHaveLength(0);
  });

  it("ignores another app's notification", async () => {
    const body = JSON.stringify({
      message: { messageId: "9", data: Buffer.from(JSON.stringify({ packageName: "com.other", ...purchased })).toString("base64") },
    });
    expect(await handleGoogleNotification(body, deps)).toEqual({ status: 200, outcome: "wrong_package" });
    expect(calls.requery).toHaveLength(0);
  });

  it("consumes Play Console's test notification", async () => {
    expect(await handleGoogleNotification(push({ testNotification: { version: "1.0" } }), deps)).toEqual({ status: 200, outcome: "test" });
  });

  it("ignores a canceled pending purchase and any subscription message", async () => {
    expect((await handleGoogleNotification(push({ oneTimeProductNotification: { notificationType: 2, purchaseToken: TOKEN, sku: MATH_MONTH } }), deps)).outcome).toBe("ignored_canceled");
    expect((await handleGoogleNotification(push({ subscriptionNotification: { notificationType: 4 } }, "3"), deps)).outcome).toBe("ignored_subscription");
    expect(calls.revoke).toHaveLength(0);
    expect(calls.write).toBe(0);
  });

  it("refuses an envelope it cannot key, and records undecodable data", async () => {
    expect((await handleGoogleNotification("{}", deps)).status).toBe(400);
    expect(await handleGoogleNotification(push("!!!not-base64-json"), deps)).toEqual({ status: 200, outcome: "undecodable" });
  });

  it("derives a stable, valid uuid per Pub/Sub message id", () => {
    const a = notificationUuidForMessage("13371337133713");
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("8");
    expect(notificationUuidForMessage("13371337133713")).toBe(a);
    expect(notificationUuidForMessage("13371337133714")).not.toBe(a);
  });

  it("claims with the derived uuid and the raw message id", async () => {
    await handleGoogleNotification(push(purchased, "42"), deps);
    expect(calls.claim[0]).toEqual({
      notificationUuid: notificationUuidForMessage("42"),
      messageId: "42",
      notificationType: "ONE_TIME_PRODUCT_PURCHASED",
    });
  });
});
