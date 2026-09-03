// THE NOTIFICATION ENDPOINT'S DECISIONS, exercised without a key, a certificate
// authority, a network or a database.
//
// That is possible because `handleAppleNotification` takes every verifier call,
// every Apple API call and every write as an injected dependency. The tests
// below are therefore about the DECISIONS — which is the half that would fail
// silently — and not about plumbing.
//
// WHAT EACH TEST IS PROTECTING, stated once here so a future reader knows what
// they are breaking:
//   * a message we cannot verify never reaches a claim, a re-query or a write;
//   * a message we have already consumed does nothing the second time;
//   * a REFUND takes access away even when Apple's API is unreachable;
//   * a type that belongs to auto-renewable subscriptions is recorded and
//     dropped, never interpreted;
//   * a sandbox transaction cannot produce a production grant, on any path.
import { describe, expect, it, vi } from "vitest";
import type { AppleEnvironment, AppleTransactionPayload } from "@/lib/payments/apple";
import {
  handleAppleNotification,
  type DecodedNotification,
  type NotificationDeps,
} from "../_lib/notificationCore";
import type { NotificationClaim } from "../_lib/store";

const BUNDLE_ID = "ai.olympiq.app";
const INTENT_ID = "6c4a6f0e-3a1b-4f5c-9b2d-7e8f0a1b2c3d";
const TXN_ID = "2000000912345678";
const PRODUCT_ID = "ai.olympiq.app.sub.math.month";
/** Inside `isPlausiblePurchaseDateMs`'s window, and a real calendar instant. */
const PURCHASE_DATE = Date.UTC(2026, 7, 15, 9, 30, 0);

function transactionPayload(
  overrides: Partial<AppleTransactionPayload> = {},
): AppleTransactionPayload {
  return {
    transactionId: TXN_ID,
    originalTransactionId: TXN_ID,
    bundleId: BUNDLE_ID,
    productId: PRODUCT_ID,
    purchaseDate: PURCHASE_DATE,
    quantity: 1,
    type: "Non-Renewing Subscription",
    appAccountToken: INTENT_ID,
    inAppOwnershipType: "PURCHASED",
    environment: "Production",
    storefront: "AZE",
    ...overrides,
  };
}

function notificationBody(
  notificationType: string,
  uuid = "11111111-2222-4333-8444-555555555555",
): string {
  // The core only ever reads `signedPayload` out of the body; the string itself
  // is opaque to it, because verification is injected.
  return JSON.stringify({ signedPayload: `signed.${notificationType}.${uuid}` });
}

type Harness<E extends AppleEnvironment> = {
  deps: NotificationDeps<E>;
  claims: Map<string, { processed: boolean }>;
  calls: {
    verifyNotification: ReturnType<typeof vi.fn>;
    verifyTransaction: ReturnType<typeof vi.fn>;
    getTransactionInfo: ReturnType<typeof vi.fn>;
    settle: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
};

/**
 * A rail whose every dependency is a spy, wired to the happy path by default.
 *
 * `claims` is a real map so the replay guard behaves like the database does:
 * first call claims, second call sees a processed row.
 */
function harness<E extends AppleEnvironment>(
  environment: E,
  options: {
    notificationType?: string;
    notificationUuid?: string;
    allowGrants?: boolean;
    claimedRail?: AppleEnvironment | null;
    decoded?: DecodedNotification | null;
    requeryOk?: boolean;
    requeriedPayload?: AppleTransactionPayload;
    /** What the shared writer answers. Defaults to a production grant. */
    writeResult?: unknown;
    verifyTransactionReturnsNull?: boolean;
  } = {},
): Harness<E> {
  const notificationType = options.notificationType ?? "ONE_TIME_CHARGE";
  const uuid = options.notificationUuid ?? "11111111-2222-4333-8444-555555555555";
  const claims = new Map<string, { processed: boolean }>();

  const announcedPayload = transactionPayload({ environment });
  const requeriedPayload = options.requeriedPayload ?? transactionPayload({ environment });

  const decoded: DecodedNotification | null =
    options.decoded === undefined
      ? {
          notificationType,
          subtype: null,
          notificationUUID: uuid,
          data: { signedTransactionInfo: "signed.transaction" },
        }
      : options.decoded;

  const calls = {
    verifyNotification: vi.fn(async () => decoded),
    verifyTransaction: vi.fn(async (_signed: string, source: string) => {
      if (options.verifyTransactionReturnsNull) return null;
      return {
        environment,
        source,
        payload: source === "requery" ? requeriedPayload : announcedPayload,
      };
    }),
    getTransactionInfo: vi.fn(async () =>
      options.requeryOk === false
        ? { ok: false as const }
        : { ok: true as const, signedTransactionInfo: "signed.requeried" },
    ),
    settle: vi.fn(async (input: { notificationUuid: string }) => {
      const row = claims.get(input.notificationUuid);
      if (row) row.processed = true;
    }),
    revoke: vi.fn(async () => true),
    // The shared write path (`grantAppleEntitlement`). It owns the catalogue
    // lookup, the expiry, the child behind the appAccountToken and the crossing
    // from "verified" to "may create access" — so a test drives this rail by
    // saying what that ONE function answered, which is exactly the seam the
    // production code has.
    write: vi.fn(async () =>
      options.writeResult ?? {
        ok: true,
        granted: true,
        environment: "Production",
        entitlementId: "ent-1",
        alreadyGranted: false,
        intentId: INTENT_ID,
        studentProfileId: "student-1",
        scope: "subject",
        productId: PRODUCT_ID,
        originalTransactionId: TXN_ID,
        endsAt: null,
      },
    ),
  };

  const claim = vi.fn(async (input: { notificationUuid: string }): Promise<NotificationClaim> => {
    const existing = claims.get(input.notificationUuid);
    if (!existing) {
      claims.set(input.notificationUuid, { processed: false });
      return "claimed";
    }
    return existing.processed ? "replay" : "unfinished";
  });

  const deps = {
    environment,
    allowGrants: options.allowGrants ?? true,
    claimedRail: () =>
      options.claimedRail === undefined ? environment : options.claimedRail,
    verifyNotification: calls.verifyNotification,
    verifyTransaction: calls.verifyTransaction,
    getTransactionInfo: calls.getTransactionInfo,
    claim,
    settle: calls.settle,
    revoke: calls.revoke,
    write: calls.write,
  } as unknown as NotificationDeps<E>;

  return { deps, claims, calls };
}

describe("handleAppleNotification — refusing what it cannot verify", () => {
  it("refuses a body that carries no signedPayload", async () => {
    const h = harness("Production");
    const result = await handleAppleNotification("{}", h.deps);
    expect(result).toEqual({ status: 400, outcome: "no_signed_payload" });
    expect(h.calls.verifyNotification).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON at all", async () => {
    const h = harness("Production");
    const result = await handleAppleNotification("<html>hello</html>", h.deps);
    expect(result.status).toBe(400);
    expect(h.calls.verifyNotification).not.toHaveBeenCalled();
  });

  it("refuses a TAMPERED signature, and does so before claiming or re-querying", async () => {
    // A tampered blob is exactly what `verifyNotification` returning null means:
    // a bad chain, a wrong bundle id and a wrong environment are all "not
    // verified" and must be indistinguishable to a caller.
    const h = harness("Production", { decoded: null });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(result).toEqual({ status: 400, outcome: "unverified" });
    expect(h.claims.size).toBe(0);
    expect(h.calls.getTransactionInfo).not.toHaveBeenCalled();
    expect(h.calls.write).not.toHaveBeenCalled();
    expect(h.calls.revoke).not.toHaveBeenCalled();
  });

  it("refuses a payload claiming the other rail without spending any crypto", async () => {
    const h = harness("Production", { claimedRail: "Sandbox" });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(result).toEqual({ status: 400, outcome: "wrong_rail" });
    expect(h.calls.verifyNotification).not.toHaveBeenCalled();
  });

  it("refuses an envelope whose notification uuid is not a uuid", async () => {
    const h = harness("Production", {
      decoded: {
        notificationType: "ONE_TIME_CHARGE",
        notificationUUID: "not-a-uuid",
        data: { signedTransactionInfo: "signed.transaction" },
      },
    });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);
    expect(result.outcome).toBe("unusable_envelope");
    expect(h.claims.size).toBe(0);
  });
});

describe("handleAppleNotification — the doctrine", () => {
  it("grants only from a RE-QUERIED transaction, never from the notification body", async () => {
    const h = harness("Production");
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "granted" });
    // The body's own transaction was read to learn WHICH id to ask about…
    expect(h.calls.verifyTransaction).toHaveBeenCalledWith("signed.transaction", "notification");
    // …and the answer to our own question is what produced the grant.
    expect(h.calls.getTransactionInfo).toHaveBeenCalledWith(TXN_ID);
    expect(h.calls.verifyTransaction).toHaveBeenCalledWith("signed.requeried", "requery");
    expect(h.calls.write).toHaveBeenCalledTimes(1);
  });

  it("asks to be retried when the re-query cannot be completed, and grants nothing", async () => {
    const h = harness("Production", { requeryOk: false });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(result).toEqual({ status: 500, outcome: "requery_failed" });
    expect(h.calls.write).not.toHaveBeenCalled();
    // Left UNSETTLED so Apple's next delivery re-processes it.
    expect(h.calls.settle).not.toHaveBeenCalled();
    expect(h.claims.get("11111111-2222-4333-8444-555555555555")?.processed).toBe(false);
  });
});

describe("handleAppleNotification — replay", () => {
  it("grants once for a notification delivered twice", async () => {
    const h = harness("Production");
    const body = notificationBody("ONE_TIME_CHARGE");

    const first = await handleAppleNotification(body, h.deps);
    const second = await handleAppleNotification(body, h.deps);

    expect(first).toEqual({ status: 200, outcome: "granted" });
    // A replay is a 200 — Apple must not be asked to send it a third time.
    expect(second).toEqual({ status: 200, outcome: "replay" });
    expect(h.calls.write).toHaveBeenCalledTimes(1);
    // And the replay costs nothing beyond the claim lookup.
    expect(h.calls.getTransactionInfo).toHaveBeenCalledTimes(1);
  });

  it("re-processes a claim that was never settled", async () => {
    // A previous attempt died mid-flight. Every write underneath is idempotent,
    // so processing again converges rather than duplicating — and abandoning it
    // would silently lose the message.
    const h = harness("Production");
    h.claims.set("11111111-2222-4333-8444-555555555555", { processed: false });

    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);
    expect(result).toEqual({ status: 200, outcome: "granted" });
    expect(h.calls.write).toHaveBeenCalledTimes(1);
  });
});

describe("handleAppleNotification — REFUND and REVOKE", () => {
  it("revokes on a REFUND that the re-query confirms", async () => {
    const h = harness("Production", {
      notificationType: "REFUND",
      requeriedPayload: transactionPayload({ revocationDate: PURCHASE_DATE + 86_400_000 }),
    });
    const result = await handleAppleNotification(notificationBody("REFUND"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "revoked" });
    // The external ref is the originalTransactionId verbatim on the production
    // rail — the key `entitlement_grant` upserted under.
    expect(h.calls.revoke).toHaveBeenCalledWith(TXN_ID, "apple_refund");
    expect(h.calls.write).not.toHaveBeenCalled();
  });

  it("revokes on a REVOKE too", async () => {
    const h = harness("Production", {
      notificationType: "REVOKE",
      requeriedPayload: transactionPayload({ revocationDate: PURCHASE_DATE + 1000 }),
    });
    const result = await handleAppleNotification(notificationBody("REVOKE"), h.deps);
    expect(result.outcome).toBe("revoked");
    expect(h.calls.revoke).toHaveBeenCalledWith(TXN_ID, "apple_revoke");
  });

  it("STILL revokes when the re-query cannot be completed", async () => {
    // The deliberate departure from the doctrine, in the fail-safe direction:
    // the message is genuinely Apple's, revoking twice is a no-op, and a dropped
    // REFUND means the money went back and the access stayed.
    const h = harness("Production", { notificationType: "REFUND", requeryOk: false });
    const result = await handleAppleNotification(notificationBody("REFUND"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "revoked_unqueried" });
    expect(h.calls.revoke).toHaveBeenCalledWith(TXN_ID, "apple_refund");
  });

  it("still revokes when the re-query answers without a revocation date, and says so", async () => {
    const h = harness("Production", { notificationType: "REFUND" });
    const result = await handleAppleNotification(notificationBody("REFUND"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "revoked_unconfirmed" });
    expect(h.calls.revoke).toHaveBeenCalledTimes(1);
  });

  it("revokes a purchase-confirming message whose re-query reveals a refund", async () => {
    // Why CONSUMPTION_REQUEST is worth a re-query: it catches a REFUND we were
    // never told about.
    const h = harness("Production", {
      notificationType: "CONSUMPTION_REQUEST",
      requeriedPayload: transactionPayload({ revocationDate: PURCHASE_DATE + 5000 }),
    });
    const result = await handleAppleNotification(notificationBody("CONSUMPTION_REQUEST"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "revoked_on_requery" });
    expect(h.calls.revoke).toHaveBeenCalledTimes(1);
    expect(h.calls.write).not.toHaveBeenCalled();
  });
});

describe("handleAppleNotification — types that do not apply", () => {
  it("ignores an auto-renewable-only type without error and without asking Apple", async () => {
    for (const type of ["DID_RENEW", "GRACE_PERIOD_EXPIRED", "DID_FAIL_TO_RENEW", "EXPIRED"]) {
      const h = harness("Production", { notificationType: type });
      const result = await handleAppleNotification(notificationBody(type), h.deps);

      expect(result).toEqual({ status: 200, outcome: "ignored_auto_renewable" });
      expect(h.calls.getTransactionInfo).not.toHaveBeenCalled();
      expect(h.calls.write).not.toHaveBeenCalled();
      expect(h.calls.revoke).not.toHaveBeenCalled();
      // Recorded, so "Apple sent us something we do not handle" is discoverable.
      expect(h.calls.settle).toHaveBeenCalledTimes(1);
    }
  });

  it("ignores a type Apple has not invented yet", async () => {
    const h = harness("Production", { notificationType: "SOMETHING_NEW" });
    const result = await handleAppleNotification(notificationBody("SOMETHING_NEW"), h.deps);
    expect(result).toEqual({ status: 200, outcome: "ignored_type" });
  });

  it("consumes Apple's TEST notification", async () => {
    const h = harness("Production", { notificationType: "TEST" });
    const result = await handleAppleNotification(notificationBody("TEST"), h.deps);
    expect(result).toEqual({ status: 200, outcome: "test" });
    expect(h.calls.getTransactionInfo).not.toHaveBeenCalled();
  });
});

describe("handleAppleNotification — the sandbox rail cannot grant", () => {
  it("records a sandbox purchase and writes no entitlement, even with grants enabled", async () => {
    // `requireProductionGrant` inside the shared writer is the only crossing, and
    // it returns null here — the writer answers `granted: false` and writes
    // nothing. The flag being TRUE is the point of this test: the structural lock
    // is what stops the grant, not the switch.
    const h = harness("Sandbox", {
      allowGrants: true,
      requeriedPayload: transactionPayload({ environment: "Sandbox" }),
      writeResult: {
        ok: true,
        granted: false,
        environment: "Sandbox",
        intentId: INTENT_ID,
        studentProfileId: "student-1",
        productId: PRODUCT_ID,
        originalTransactionId: TXN_ID,
      },
    });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "sandbox_not_granted" });
  });

  it("never reaches the writer at all when grants are disabled", async () => {
    // The second lock. In production `APPLE_SANDBOX_GRANTS` is unset, so the
    // sandbox route stops here — before any code path that could write.
    const h = harness("Sandbox", {
      allowGrants: false,
      requeriedPayload: transactionPayload({ environment: "Sandbox" }),
    });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(result).toEqual({ status: 200, outcome: "grants_disabled" });
    expect(h.calls.write).not.toHaveBeenCalled();
  });

  it("namespaces a sandbox revocation so it cannot touch a production grant", async () => {
    const h = harness("Sandbox", {
      notificationType: "REFUND",
      requeriedPayload: transactionPayload({
        environment: "Sandbox",
        revocationDate: PURCHASE_DATE + 1000,
      }),
    });
    await handleAppleNotification(notificationBody("REFUND"), h.deps);

    // NOT the bare transaction id: a sandbox id colliding with a real
    // customer's production ref would revoke that customer.
    expect(h.calls.revoke).toHaveBeenCalledWith(`apple_sandbox:${TXN_ID}`, "apple_refund");
  });
});

describe("handleAppleNotification — the shared write path", () => {
  it("hands the RE-QUERIED transaction to the writer, and nothing else", async () => {
    // The catalogue lookup, the expiry, the child behind the appAccountToken and
    // the crossing from "verified" to "may create access" all belong to
    // `grantAppleEntitlement`. This route establishes WHICH transaction; it must
    // not re-decide what that transaction is worth.
    const h = harness("Production");
    await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

    expect(h.calls.write).toHaveBeenCalledTimes(1);
    const passed = h.calls.write.mock.calls[0]?.[0] as { source: string };
    expect(passed.source).toBe("requery");
  });

  it("records, and does not retry, a refusal the writer makes deterministically", async () => {
    // An unknown product, an unknown intent, a deleted child. A retry cannot fix
    // any of them, and asking Apple to redeliver five more times is noise.
    for (const reason of ["unknown_product", "unknown_intent", "child_missing"]) {
      const h = harness("Production", { writeResult: { ok: false, reason } });
      const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

      expect(result).toEqual({ status: 200, outcome: `refuse_${reason}` });
      expect(h.calls.settle).toHaveBeenCalledTimes(1);
    }
  });

  it("asks to be retried when the write outcome is unknown", async () => {
    for (const reason of ["grant_failed", "not_configured"]) {
      const h = harness("Production", { writeResult: { ok: false, reason } });
      const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);

      expect(result).toEqual({ status: 500, outcome: "write_failed" });
      // Left UNSETTLED, so Apple's retry re-processes it.
      expect(h.calls.settle).not.toHaveBeenCalled();
    }
  });

  it("records an outcome kept inside the 40-character column bound", async () => {
    // `iap_notifications.outcome` is capped at 40 by ck_iap_notification_outcome,
    // and the longest thing this route can build is "refuse_" plus the longest
    // rejection reason `toAppleGrant` produces.
    const h = harness("Production", {
      writeResult: { ok: false, reason: "original_transaction_id_malformed" },
    });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);
    expect(result.outcome.length).toBeLessThanOrEqual(40);
  });

  it("reports a grant that was already settled as a success", async () => {
    // A genuine redelivery that overtook our own log, or the redeem route having
    // won the race. Both are successes; the outcome only says which.
    const h = harness("Production", {
      writeResult: {
        ok: true,
        granted: true,
        environment: "Production",
        entitlementId: "ent-1",
        alreadyGranted: true,
        intentId: INTENT_ID,
        studentProfileId: "student-1",
        scope: "subject",
        productId: PRODUCT_ID,
        originalTransactionId: TXN_ID,
        endsAt: null,
      },
    });
    const result = await handleAppleNotification(notificationBody("ONE_TIME_CHARGE"), h.deps);
    expect(result).toEqual({ status: 200, outcome: "granted_already" });
  });
});
