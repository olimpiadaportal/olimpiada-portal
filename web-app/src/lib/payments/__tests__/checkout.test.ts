// The parent checkout, pinned.
//
// Two kinds of assertion live here, and the split is deliberate:
//
//   * BEHAVIOUR, for the two pure functions the redirect and the result screen
//     both depend on. They decide where a payer lands and what they are told,
//     and both can be executed without a bank, a database or a browser.
//   * SOURCE, for the properties that only exist as an arrangement of code —
//     "the amount is never read from a request", "authorize first", "no card
//     field", "the mobile app cannot reach any of this", and since migration 125
//     the load-bearing one: "NOTHING IS APPLIED BEFORE THE MONEY ARRIVES".
//     Violating one of those leaves everything compiling and every other test
//     passing, and the failure shows up as money charged wrongly, access given
//     away for free, or a store account terminated. Same reasoning as
//     azericard/__tests__/invariants.test.ts, which this file sits beside rather
//     than duplicates.
//
//     The ORDER OF OPERATIONS is exactly such a property. The defect this suite
//     now pins shipped as working, tested code: the plan was applied first and
//     the charge was opened afterwards by a helper that "can only return null —
//     it never fails the change", so a parent could confirm, close the tab, and
//     keep a year of access with no payment. Nothing failed. Nothing logged.
//
// COMMENTS ARE STRIPPED before every code sweep. These files explain at length
// what they deliberately do not do — "never an amount from a client", "grants
// nothing", "not a mobile surface" — and a sweep that could not tell a mention
// from a use would force those explanations out. The explanation is the part
// that stops the next reader from wiring a price into the request.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";
import {
  PARENT_RESULT_PATH,
  parentResultUrl,
  safeResultKind,
} from "@/lib/payments/azericard/resultPage";

const SRC = resolve(process.cwd(), "src");
const REPO = resolve(process.cwd(), "..");

const CORE = join(SRC, "lib", "payments", "checkoutCore.ts");
const INTENT = join(SRC, "lib", "payments", "checkoutIntent.ts");
const SERVICE = join(SRC, "lib", "payments", "checkoutService.ts");
const WIDGET = join(SRC, "components", "CheckoutRedirect.tsx");
const RESULT_PAGE = join(SRC, "app", "checkout", "result", "page.tsx");
const SUBSCRIPTION_SERVICE = join(SRC, "lib", "auth", "subscriptionService.ts");
const CHECKOUT_FILES = [CORE, INTENT, SERVICE, WIDGET, RESULT_PAGE];

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}

/** Source with block and line comments blanked out. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function filesUnder(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(abs, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

describe("where the bank sends a payer back to", () => {
  it("resolves anything unrecognised to PENDING, never to a completed payment", () => {
    expect(safeResultKind("ok")).toBe("ok");
    expect(safeResultKind("failed")).toBe("failed");
    expect(safeResultKind("pending")).toBe("pending");
    for (const hostile of [
      null,
      undefined,
      "",
      "OK",
      " ok ",
      "succeeded",
      "approved",
      "<script>",
      "../../admin",
    ]) {
      expect(safeResultKind(hostile)).toBe("pending");
    }
  });

  it("builds a relative, same-origin path carrying only the verdict", () => {
    expect(parentResultUrl("ok")).toBe(`${PARENT_RESULT_PATH}?status=ok`);
    expect(parentResultUrl("failed")).toBe(`${PARENT_RESULT_PATH}?status=failed`);
    for (const kind of ["ok", "pending", "failed"] as const) {
      const url = parentResultUrl(kind);
      // No scheme, no authority, no protocol-relative form, no backslash — the
      // shapes lib/auth safeNext() rejects, asserted here as unrepresentable
      // rather than filtered.
      expect(url.startsWith("/")).toBe(true);
      expect(url.startsWith("//")).toBe(false);
      expect(url).not.toContain("://");
      expect(url).not.toContain("\\");
      expect(url).not.toContain("@");
    }
  });
});

describe("the client never sets the price", () => {
  const service = code(read(SERVICE));
  const core = code(read(CORE));

  it("reads exactly one field from the request, and it is not an amount", () => {
    // `order` is a lookup key. Everything else about the charge — how much, in
    // what currency, for which plan — is re-read from the row it names.
    const reads = service.match(/formData\.get\("([^"]+)"\)/g) ?? [];
    expect(reads).toEqual(['formData.get("order")']);
    for (const needle of ["amount", "price", "total", "currency", "AZN"]) {
      expect(service).not.toContain(`formData.get("${needle}")`);
    }
  });

  it("has exactly one place where a number becomes a signed field", () => {
    // buildAuthRequest is that place. One call site means one thing to audit,
    // and its `amount` is a local the function was handed — never a parameter
    // that travelled in from a request.
    expect(core.match(/buildAuthRequest\(/g) ?? []).toHaveLength(1);
    const call = core.slice(core.indexOf("buildAuthRequest({"));
    expect(call).toContain("order,");
    expect(call).toContain("amount,");
    expect(core).toContain("isChargeableAmount(amount)");
    // A ceiling no legitimate basket can reach, so a corrupted number cannot be
    // signed even if every other guard were removed.
    expect(core).toContain("MAX_CHECKOUT_AMOUNT");
  });

  it("opens every session through the intent RPC, never a bare insert", () => {
    // createCheckoutSession writes a row with an amount and NO record of what it
    // buys. That is the shape which made the money optional — a payment nothing
    // could be redeemed into, so the plan had to be applied up front. The parent
    // checkout must not be able to reach it; only the owner's protocol test may.
    expect(core).not.toContain("createCheckoutSession");
    expect(core).toContain("openPlanIntent");
  });

  it("takes its amount from the plan RPC's own answer, not from a form", () => {
    const wiring = code(read(SUBSCRIPTION_SERVICE));
    expect(wiring).toContain("startPlanPayment");
    // The retired seam: applied first, charged afterwards, could not fail.
    expect(wiring).not.toContain("openCheckoutForApplied");
    expect(wiring).not.toContain("openPlanCheckout");
    // The apply/create actions must not start reading a posted amount either.
    for (const needle of ["amount", "price", "total"]) {
      expect(wiring).not.toContain(`formData.get("${needle}")`);
    }
  });
});

describe("authorization comes first, and ownership is re-proved", () => {
  it("calls requireParent as the first statement of the action", () => {
    const body = code(read(SERVICE));
    const fn = body.slice(body.indexOf("export async function startPlanCheckout"));
    const authAt = fn.indexOf("await requireParent()");
    const formAt = fn.indexOf("formData.get(");
    expect(authAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(formAt);
  });

  it("re-verifies the named order belongs to this parent, server-side", () => {
    const core = code(read(CORE));
    expect(core).toContain("session.ownerParentProfileId !== parentProfileId");
    // And answers a not-yours order exactly like a non-existent one, so order
    // ids cannot be probed for existence.
    expect(core.match(/errorKey: "checkout\.err\.notFound"/g) ?? []).not.toHaveLength(0);
  });

  it("throttles BOTH ways in, on one shared budget", () => {
    // Migration 126: the resume action was limited and the open path beside it
    // was not, so the cheaper of the two ways to sign an order was the guarded
    // one. Both now draw on the same named scope — two buckets would let a
    // caller take the full allowance twice by alternating between the screens.
    expect(code(read(SERVICE))).toContain("rateLimitAllow(CHECKOUT_RATE_SCOPE");
    expect(code(read(CORE))).toContain("rateLimitAllow(CHECKOUT_RATE_SCOPE");
    expect(code(read(CORE))).toContain('CHECKOUT_RATE_SCOPE = "checkoutstart"');
  });

  it("re-reads the payment mode at signing time", () => {
    // A giveaway window that opened after the session was created must stop the
    // charge; a session row is not a licence to bill.
    const core = code(read(CORE));
    expect(core).toContain("getPaymentModeInfo()");
    expect(core).toContain('errorKey: "gate.paymentsOff"');
    expect(core).toContain('errorKey: "gate.giveawayFree"');
  });
});

describe("a redirect, not an embedded payment form", () => {
  it("posts a plain top-level form to the acquirer and runs no script", () => {
    const widget = read(WIDGET);
    expect(widget).toContain('<form method="POST" action={ready.action}');
    expect(code(widget)).not.toContain("<iframe");
    expect(code(widget)).not.toContain("dangerouslySetInnerHTML");
    // No auto-submit: a redirect that only happens on a real click cannot fire
    // from a prefetch, a crawler or a double-render.
    expect(code(widget)).not.toContain("requestSubmit");
    expect(code(widget)).not.toMatch(/useEffect\s*\(/);
  });

  it("has no field a cardholder could type a card into", () => {
    for (const file of CHECKOUT_FILES) {
      const src = code(read(file));
      expect(src).not.toMatch(/type="(text|tel|number|password)"/);
      // Word-bounded: "pan" as a whole word is the primary account number,
      // "pan" inside <span> is not, and a sweep that cannot tell them apart
      // fails on the first paragraph anyone writes.
      expect(src).not.toMatch(/\b(pan|cvv|cvc|expiry)\b/i);
      for (const needle of ["cardNumber", "card_number", "cardholder"]) {
        expect(src.toLowerCase()).not.toContain(needle.toLowerCase());
      }
    }
  });

  it("is allowed out by the CSP naming the gateway origins explicitly", () => {
    const config = read(join(REPO, "web-app", "next.config.mjs"));
    expect(config).toContain("form-action 'self'");
    expect(config).not.toContain("form-action 'self' *");
  });
});

describe("the payment causes the grant, and nothing else does", () => {
  const wiring = code(read(SUBSCRIPTION_SERVICE));
  const intent = code(read(INTENT));

  it("routes a payable change to the payment and a free one to the apply", () => {
    // THE WHOLE FIX, as one branch. `due_now` comes from the quote RPC, on the
    // server, and decides which of the two happens. Before 125 there was no
    // branch: everything applied, and the charge was an afterthought.
    expect(wiring).toContain("quoted.dueNow > 0");
    expect(wiring).toContain('kind: "plan_start"');
    expect(wiring).toContain('kind: "plan_change"');
    // And the client cannot pick the branch: no posted field feeds it.
    expect(wiring).not.toContain('formData.get("due');
  });

  it("applies nothing on the payable path", () => {
    // From every startPlanPayment call, the next thing that happens is a
    // RETURN — never an apply core. That is the whole inversion expressed as an
    // ordering: money is asked for, and the request ends. Both actions still
    // call an apply core further down, on their FREE path, which is why this
    // walks forward from each call site instead of grepping the file.
    let sites = 0;
    for (let at = wiring.indexOf("startPlanPayment({"); at !== -1;
         at = wiring.indexOf("startPlanPayment({", at + 1)) {
      sites += 1;
      const rest = wiring.slice(at);
      const nextCore = rest.indexOf("Core({");
      const nextReturn = rest.indexOf("return {");
      expect(nextReturn).toBeGreaterThan(-1);
      expect(nextCore === -1 || nextReturn < nextCore).toBe(true);
    }
    // Both paid actions: starting a plan, and changing one.
    expect(sites).toBe(2);
  });

  it("reaches the plan RPCs through exactly four named intent functions", () => {
    // Every grant path is one of these, all service_role-only, all inside a
    // transaction that stamps redeemed_at. An extra `.rpc(` here would be a
    // fifth way for money and access to disagree.
    const calls = (intent.match(/\.rpc\("([a-z_]+)"/g) ?? []).map((m) =>
      m.replace(/^\.rpc\("/, "").replace(/"$/, ""),
    );
    expect(new Set(calls)).toEqual(
      new Set([
        "checkout_intent_open",
        "checkout_intent_price",
        "checkout_redeem_plan",
        "checkout_flag_redemption",
      ]),
    );
  });

  it("writes no entitlement row itself", () => {
    // Access is `entitlements`' job and the producers are the only writers
    // (docs/STORE_PAYMENTS_COMPLIANCE.md section 4.1, migration 124). Redemption
    // goes through create_child_plan / apply_plan_change and lets the mirror
    // triggers do it; a rail writing access directly would be the first drift,
    // with no invoice to reconcile against.
    const offenders: string[] = [];
    for (const file of CHECKOUT_FILES) {
      const src = code(read(file));
      for (const needle of [
        "entitlement",
        "access_status",
        "purchase_olympiad",
        "admin_grant_child_access",
        "activate_child_login_id",
      ]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("re-prices before signing and again before granting", () => {
    // Prices move. Signing a stale number takes money the redemption then
    // refuses to deliver on, and granting on a stale number delivers a plan
    // nobody paid today's price for. Both ends re-quote.
    expect(code(read(CORE))).toContain("repricePlanIntent");
    expect(intent).toContain("checkout_intent_price");
    expect(intent).toContain("checkout_redeem_plan");
  });

  it("bounds how long a signed intent stays redeemable", () => {
    // A forgotten pending session must not be redeemable by a replayed callback
    // weeks later; the payment layer's reference claims stop a tuple being
    // reused, and this stops the SESSION being reused.
    expect(intent).toContain("INTENT_TTL_MINUTES");
    expect(intent).toContain("p_ttl_minutes");
  });

  it("keeps the server-only modules server-only", () => {
    expect(read(CORE)).toContain('import "server-only";');
    expect(read(INTENT)).toContain('import "server-only";');
    expect(read(SERVICE)).toContain('"use server";');
  });

  it("never returns a raw database or gateway message to a payer", () => {
    for (const file of [CORE, INTENT]) {
      const src = code(read(file));
      expect(src, relative(REPO, file)).not.toContain("error.message");
      // Every failure is an i18n KEY, resolved by the action through getT.
      for (const m of src.match(/errorKey: "[^"]+"/g) ?? []) {
        expect(m).toMatch(/errorKey: "(checkout|gate|sub)\./);
      }
    }
  });
});

describe("web only — nothing here can surface in a store binary", () => {
  const MOBILE_API = join(SRC, "app", "api", "mobile");
  const MOBILE_APP = join(REPO, "mobile-app", "src");

  it("is not imported by any mobile BFF route", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(MOBILE_API)) {
      const src = code(read(file));
      for (const needle of ["checkoutCore", "checkoutService", "CheckoutRedirect"]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the plan amount out of every mobile BFF response", () => {
    // The cores now report `dueNow` / `subscriptionId` so the web can open a
    // charge. Both BFF routes build their JSON field by field, and an AZN amount
    // must not be among the fields (section 5: never show a price in the app).
    for (const name of ["subjects", "subscribe"]) {
      const route = join(MOBILE_API, "v1", "children", "[id]", name, "route.ts");
      const src = code(read(route));
      expect(src).toContain("okResponse({");
      expect(src).not.toContain("due_now");
      expect(src).not.toContain("dueNow");
      expect(src).not.toContain("checkout");
    }
  });

  it("has no mobile screen referencing a checkout.* string", () => {
    // The mobile catalog is GENERATED from web-app/src/i18n/messages.ts, so
    // these keys exist over there whether or not anything uses them. Rendering
    // one would put a price, a payment step or a bank page into a store build.
    if (!existsSync(MOBILE_APP)) return;
    const offenders: string[] = [];
    for (const file of filesUnder(MOBILE_APP)) {
      if (file.includes("messages.generated")) continue; // the copy itself
      const src = code(read(file));
      for (const m of src.match(/["'`]checkout\.[a-zA-Z.]+["'`]/g) ?? []) {
        offenders.push(`${relative(REPO, file)} :: ${m}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("trilingual copy", () => {
  const KEYS = [
    "checkout.title",
    "checkout.intro",
    "checkout.amount",
    "checkout.payNow",
    "checkout.starting",
    "checkout.redirectNote",
    "checkout.continue",
    "checkout.err.notFound",
    "checkout.err.alreadyPaid",
    "checkout.err.unavailable",
    "checkout.err.tooMany",
    "checkout.err.priceChanged",
    "checkout.err.expired",
    "checkout.err.planChanged",
    "checkout.resume",
    "checkout.res.ok.title",
    "checkout.res.ok.body",
    "checkout.res.pending.title",
    "checkout.res.pending.body",
    "checkout.res.pending.hint",
    "checkout.res.failed.title",
    "checkout.res.failed.body",
    "checkout.res.back",
  ];

  it("has every checkout.* key in az, en and ru", () => {
    for (const locale of locales) {
      const dict = messages[locale] as unknown as Record<string, string>;
      for (const key of KEYS) {
        expect(typeof dict[key], `${locale}:${key}`).toBe("string");
        expect((dict[key] ?? "").trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("carries no currency literal — the amount is rendered from the server's number", () => {
    // A price baked into a translated string is a price that drifts from what is
    // charged in exactly one locale, which is the hardest kind to notice.
    const offenders: string[] = [];
    for (const locale of locales) {
      const dict = messages[locale] as unknown as Record<string, string>;
      for (const key of Object.keys(dict)) {
        if (!key.startsWith("checkout.")) continue;
        if (/AZN|₼|\d+[.,]\d{2}|olympiq\.ai/i.test(dict[key] ?? "")) {
          offenders.push(`${locale}:${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("says nothing about access on the result screen", () => {
    // The payment layer records money and grants nothing. A result screen that
    // promised a subject was unlocked would be wrong in the way a parent notices.
    const src = code(read(RESULT_PAGE));
    for (const needle of ["entitlement", "access", "unlock"]) {
      expect(src.toLowerCase()).not.toContain(needle);
    }
  });

  it("renders the result screen from a whitelisted verdict only", () => {
    const src = code(read(RESULT_PAGE));
    expect(src).toContain("safeResultKind(");
    // Nothing else from the query string reaches the page.
    const reads = src.match(/params\.[a-zA-Z]+/g) ?? [];
    expect(new Set(reads)).toEqual(new Set(["params.status"]));
  });
});
