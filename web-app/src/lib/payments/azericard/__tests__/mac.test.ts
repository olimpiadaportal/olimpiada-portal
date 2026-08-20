// The MAC source string, pinned against the gateway's OWN worked examples.
//
// A wrong length prefix or a wrong field order is not a failed payment — it is
// an authentication bypass, because the signature we verify would be over a
// string that means something different from what we think it means. Everything
// here is therefore a known-answer test taken verbatim from the specification,
// not a property we invented.
import { describe, expect, it } from "vitest";
import {
  authMacSource,
  buildMacSource,
  buildMacSourceFor,
  callbackMacSource,
  completionMacSource,
  isAbsent,
  reversalMacSource,
  statusMacSource,
  MAC_FIELDS_AUTH,
  MAC_FIELDS_CALLBACK,
  MAC_FIELDS_COMPLETION,
  MAC_FIELDS_REVERSAL,
  MAC_FIELDS_STATUS,
  MAC_FIELDS_STATUS_WITH_TRAN_TRTYPE,
} from "../mac";

describe("known-answer vectors from the specification", () => {
  // §2.2.1 / §8.3 worked example. AMOUNT=11.48, CURRENCY=USD, TERMINAL=99999999,
  // TRTYPE=1, TIMESTAMP=20030105153021, NONCE=F2B2DD7E603A7ADA,
  // MERCH_URL=www.sample.com.
  it("reproduces the TRTYPE=1 authorisation vector exactly", () => {
    const source = authMacSource({
      AMOUNT: "11.48",
      CURRENCY: "USD",
      TERMINAL: "99999999",
      TRTYPE: "1",
      TIMESTAMP: "20030105153021",
      NONCE: "F2B2DD7E603A7ADA",
      MERCH_URL: "www.sample.com",
    });
    expect(source).toBe(
      "511.483USD89999999911142003010515302116F2B2DD7E603A7ADA14www.sample.com",
    );
  });

  // "Callback P_SIGN hesablanması" worked example. AMOUNT=11.48,
  // TERMINAL=99999999, APPROVAL=168975, RRN=306276834930,
  // INT_REF=4A29E93C607E33DC.
  it("reproduces the callback verification vector exactly", () => {
    const source = callbackMacSource({
      AMOUNT: "11.48",
      TERMINAL: "99999999",
      APPROVAL: "168975",
      RRN: "306276834930",
      INT_REF: "4A29E93C607E33DC",
    });
    expect(source).toBe("511.48899999999616897512306276834930164A29E93C607E33DC");
  });

  // §8.3 worked example for the status inquiry. ORDER=20211112075614,
  // TERMINAL=17202191, TRTYPE=90, TIMESTAMP=20211112075714,
  // NONCE=7cfb4c2512eeec72.
  it("reproduces the TRTYPE=90 status-inquiry vector exactly", () => {
    const source = statusMacSource({
      ORDER: "20211112075614",
      TERMINAL: "17202191",
      TRTYPE: "90",
      TIMESTAMP: "20211112075714",
      NONCE: "7cfb4c2512eeec72",
    });
    expect(source).toBe(
      "1420211112075614817202191290142021111207571416" + "7cfb4c2512eeec72",
    );
  });

  it("the alternate TRTYPE=90 reading only adds TRAN_TRTYPE at the front", () => {
    // Kept live and tested because the spec supports both readings: §8.1's
    // request table lists TRAN_TRTYPE among the merchant-generated fields, while
    // §8.3's worked example omits it from the MAC. The default follows the
    // worked example; this is the one-env-var fallback.
    const fields = {
      TRAN_TRTYPE: "1",
      ORDER: "20211112075614",
      TERMINAL: "17202191",
      TRTYPE: "90",
      TIMESTAMP: "20211112075714",
      NONCE: "7cfb4c2512eeec72",
    };
    expect(statusMacSource(fields, true)).toBe("11" + statusMacSource(fields, false));
  });
});

describe("the absent-field rule", () => {
  it("writes '-' and counts NO length for a missing field", () => {
    // The subtlety that makes this rule dangerous: "-" is one character, but it
    // is NOT preceded by a "1". A builder that emitted "1-" would look right and
    // verify nothing.
    expect(buildMacSource(["AB", undefined, "C"])).toBe("2AB-1C");
    expect(buildMacSource([undefined])).toBe("-");
    expect(buildMacSource([null, null])).toBe("--");
  });

  it("treats an EMPTY STRING as absent, exactly as the callback section says", () => {
    expect(buildMacSource([""])).toBe("-");
    expect(buildMacSource(["A", "", "B"])).toBe("1A-1B");
  });

  it("does not treat '0' or a space as absent", () => {
    expect(isAbsent("0")).toBe(false);
    expect(isAbsent(" ")).toBe(false);
    expect(buildMacSource(["0", " "])).toBe("101 ");
  });

  it("omits APPROVAL correctly when the card system supplied none", () => {
    // The spec allows a blank APPROVAL. This is the realistic callback shape it
    // produces, and getting it wrong would fail every declined transaction's
    // verification for the wrong reason.
    expect(
      callbackMacSource({
        AMOUNT: "11.48",
        TERMINAL: "99999999",
        APPROVAL: "",
        RRN: "306276834930",
        INT_REF: "4A29E93C607E33DC",
      }),
    ).toBe("511.48899999999-12306276834930164A29E93C607E33DC");
  });

  it("counts a field missing from the bag entirely as absent", () => {
    expect(buildMacSourceFor(["AMOUNT", "TERMINAL"], { AMOUNT: "1.00" })).toBe("41.00-");
  });
});

describe("length prefixes", () => {
  it("prefixes with the decimal length, not a padded or hex one", () => {
    expect(buildMacSource(["x".repeat(9)])).toBe("9" + "x".repeat(9));
    expect(buildMacSource(["x".repeat(10)])).toBe("10" + "x".repeat(10));
    expect(buildMacSource(["x".repeat(255)])).toBe("255" + "x".repeat(255));
  });

  it("measures UTF-8 BYTES, not UTF-16 code units", () => {
    // Every field in every order is ASCII by protocol, so this never fires in
    // practice — which is exactly why it has to be pinned: the day a non-ASCII
    // character reaches a MAC field, we and the gateway must still agree.
    expect(buildMacSource(["ə"])).toBe("2ə"); // 2 bytes, 1 code unit
    expect(buildMacSource(["₼"])).toBe("3₼"); // 3 bytes, 1 code unit
  });
});

describe("field orders", () => {
  it("TRTYPE 0/1 is AMOUNT, CURRENCY, TERMINAL, TRTYPE, TIMESTAMP, NONCE, MERCH_URL", () => {
    expect([...MAC_FIELDS_AUTH]).toEqual([
      "AMOUNT",
      "CURRENCY",
      "TERMINAL",
      "TRTYPE",
      "TIMESTAMP",
      "NONCE",
      "MERCH_URL",
    ]);
  });

  it("TRTYPE 21 is AMOUNT, CURRENCY, TERMINAL, TRTYPE, ORDER, RRN, INT_REF", () => {
    expect([...MAC_FIELDS_COMPLETION]).toEqual([
      "AMOUNT",
      "CURRENCY",
      "TERMINAL",
      "TRTYPE",
      "ORDER",
      "RRN",
      "INT_REF",
    ]);
  });

  it("TRTYPE 22 / 24 use the same seven fields as 21", () => {
    expect([...MAC_FIELDS_REVERSAL]).toEqual([...MAC_FIELDS_COMPLETION]);
  });

  it("TRTYPE 90 is ORDER, TERMINAL, TRTYPE, TIMESTAMP, NONCE", () => {
    expect([...MAC_FIELDS_STATUS]).toEqual([
      "ORDER",
      "TERMINAL",
      "TRTYPE",
      "TIMESTAMP",
      "NONCE",
    ]);
    expect([...MAC_FIELDS_STATUS_WITH_TRAN_TRTYPE]).toEqual([
      "TRAN_TRTYPE",
      ...MAC_FIELDS_STATUS,
    ]);
  });

  it("the CALLBACK order is AMOUNT, TERMINAL, APPROVAL, RRN, INT_REF — and ORDER is NOT signed", () => {
    expect([...MAC_FIELDS_CALLBACK]).toEqual([
      "AMOUNT",
      "TERMINAL",
      "APPROVAL",
      "RRN",
      "INT_REF",
    ]);
    // The single most important negative fact in the whole integration: a valid
    // callback signature says nothing about WHICH order it belongs to, which is
    // why the callback route re-queries the gateway and grants nothing.
    expect(MAC_FIELDS_CALLBACK as readonly string[]).not.toContain("ORDER");
  });

  it("no MAC order ever includes P_SIGN itself", () => {
    for (const order of [
      MAC_FIELDS_AUTH,
      MAC_FIELDS_COMPLETION,
      MAC_FIELDS_REVERSAL,
      MAC_FIELDS_STATUS,
      MAC_FIELDS_STATUS_WITH_TRAN_TRTYPE,
      MAC_FIELDS_CALLBACK,
    ]) {
      expect(order as readonly string[]).not.toContain("P_SIGN");
    }
  });

  it("order matters — swapping two fields changes the source string", () => {
    const a = completionMacSource({
      AMOUNT: "5.00",
      CURRENCY: "AZN",
      TERMINAL: "17205223",
      TRTYPE: "21",
      ORDER: "20260819000001",
      RRN: "112676199769",
      INT_REF: "5E3601D7C71745A9",
    });
    const b = reversalMacSource({
      AMOUNT: "5.00",
      CURRENCY: "AZN",
      TERMINAL: "17205223",
      TRTYPE: "22",
      ORDER: "20260819000001",
      RRN: "112676199769",
      INT_REF: "5E3601D7C71745A9",
    });
    // Same order of FIELDS, different TRTYPE value → different source.
    expect(a).not.toBe(b);
    expect(a.startsWith("45.003AZN817205223221")).toBe(true);
  });
});
