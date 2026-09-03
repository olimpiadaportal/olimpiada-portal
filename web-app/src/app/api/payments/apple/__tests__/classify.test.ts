// The notification vocabulary, pinned.
//
// Every entry in this file is a decision that would be SILENT if it were wrong:
// the code would compile, the endpoint would answer 200, and the failure would
// appear months later as a refunded customer who still has access, or as a
// DID_RENEW quietly extending a subscription that cannot renew.
import { describe, expect, it } from "vitest";
import {
  classifyNotification,
  isAutoRenewableOnly,
  NOTIFICATION_VOCABULARY,
} from "../_lib/classify";

describe("classifyNotification", () => {
  it("treats REFUND and REVOKE as revocations", () => {
    expect(classifyNotification("REFUND")).toBe("revoke");
    expect(classifyNotification("REVOKE")).toBe("revoke");
  });

  it("treats the purchase-confirming types as a reason to go and ask Apple", () => {
    // ONE_TIME_CHARGE is the notification a NON-RENEWING product actually
    // produces; REFUND_REVERSED brings access back; CONSUMPTION_REQUEST costs
    // one re-query and buys a second chance to notice a refund.
    expect(classifyNotification("ONE_TIME_CHARGE")).toBe("grant");
    expect(classifyNotification("REFUND_REVERSED")).toBe("grant");
    expect(classifyNotification("CONSUMPTION_REQUEST")).toBe("grant");
  });

  it("ignores every auto-renewable-only type", () => {
    // Our products are NON-RENEWING by owner decision (2026-08-31). None of
    // these can occur for them, so handling one would be code that acts on an
    // event that only reaches us by mistake.
    for (const type of NOTIFICATION_VOCABULARY.autoRenewableOnly) {
      expect(classifyNotification(type)).toBe("ignore");
      expect(isAutoRenewableOnly(type)).toBe(true);
    }
  });

  it("names DID_RENEW and GRACE_PERIOD_EXPIRED explicitly", () => {
    // Spelled out rather than left to the loop above, because these two are the
    // ones a reader is most likely to "fix" into a renewal handler.
    expect(classifyNotification("DID_RENEW")).toBe("ignore");
    expect(classifyNotification("GRACE_PERIOD_EXPIRED")).toBe("ignore");
    expect(classifyNotification("DID_FAIL_TO_RENEW")).toBe("ignore");
    expect(classifyNotification("EXPIRED")).toBe("ignore");
  });

  it("ignores an unknown type rather than rejecting it", () => {
    // Apple adds notification types without asking. A default of "refuse" would
    // turn the next addition into a 500 and an endless retry loop.
    expect(classifyNotification("SOMETHING_APPLE_ADDS_IN_2027")).toBe("ignore");
    expect(classifyNotification("")).toBe("ignore");
    expect(isAutoRenewableOnly("SOMETHING_APPLE_ADDS_IN_2027")).toBe(false);
  });

  it("recognises Apple's reachability probe", () => {
    expect(classifyNotification("TEST")).toBe("test");
  });

  it("does not treat REFUND_DECLINED as a purchase", () => {
    // The customer asked for a refund and Apple said no. Nothing changed.
    expect(classifyNotification("REFUND_DECLINED")).toBe("ignore");
  });

  it("keeps the revoke vocabulary immutable", () => {
    // A caller that could mutate this set could make a REFUND stop being a
    // refund from anywhere in the process.
    expect(Object.isFrozen(NOTIFICATION_VOCABULARY)).toBe(true);
    expect(Object.isFrozen(NOTIFICATION_VOCABULARY.revoke)).toBe(true);
    expect([...NOTIFICATION_VOCABULARY.revoke].sort()).toEqual(["REFUND", "REVOKE"]);
  });
});
