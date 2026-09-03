// THE KEY A GRANT IS WRITTEN AND WITHDRAWN UNDER.
//
// A mismatch here is silent in the worst way: the grant succeeds, the refund's
// revoke updates zero rows and returns false, and a refunded customer keeps
// their access forever. So both directions are pinned.
import { describe, expect, it } from "vitest";
import {
  appleExternalRef,
  APPLE_SANDBOX_REF_PREFIX,
  isSandboxRef,
} from "../_lib/externalRef";

const TXN = "2000000912345678";

describe("appleExternalRef", () => {
  it("is the originalTransactionId verbatim on the production rail", () => {
    // entitlements.external_ref's own column comment says so: "Apple
    // originalTransactionId". Anything else and a REFUND cannot find the grant.
    expect(appleExternalRef("Production", TXN)).toBe(TXN);
  });

  it("namespaces the sandbox rail", () => {
    // An un-prefixed sandbox id could collide with a real customer's production
    // ref, and entitlement_grant's upsert would MOVE that customer's grant onto
    // a reviewer's test purchase.
    expect(appleExternalRef("Sandbox", TXN)).toBe(`${APPLE_SANDBOX_REF_PREFIX}${TXN}`);
    expect(appleExternalRef("Sandbox", TXN)).not.toBe(appleExternalRef("Production", TXN));
  });

  it("never collides with the producer-mirror namespaces entitlement_grant refuses", () => {
    // `sub:` and `oly:` belong to the ABB producer mirror and are rejected
    // outright by entitlement_grant. A prefix that tripped that check would make
    // every sandbox write fail with a check_violation instead of being recorded.
    for (const env of ["Production", "Sandbox"] as const) {
      const ref = appleExternalRef(env, TXN);
      expect(ref.startsWith("sub:")).toBe(false);
      expect(ref.startsWith("oly:")).toBe(false);
    }
  });

  it("stays inside the 200-character bound entitlement_grant enforces", () => {
    const longest = appleExternalRef("Sandbox", "x".repeat(100));
    expect(longest.length).toBeLessThanOrEqual(200);
  });

  it("recognises its own sandbox namespace", () => {
    expect(isSandboxRef(appleExternalRef("Sandbox", TXN))).toBe(true);
    expect(isSandboxRef(appleExternalRef("Production", TXN))).toBe(false);
  });
});
