// The invariants that cannot be exercised at runtime without a bank, a database
// and a browser — so they are pinned in the source, the same way
// `lib/__tests__/demoPaymentsRemoved.test.ts` pins a deletion.
//
// Each one below is a property whose violation would be silent: the code would
// still compile, the tests would still pass, and the failure would show up as
// money attributed wrongly or access granted from an unauthenticated POST.
//
// COMMENTS ARE STRIPPED before every code sweep. The files here explain at
// length what they deliberately do NOT do — "grants nothing", "no entitlement",
// "never an iframe" — and a sweep that could not tell a mention from a use would
// force those explanations out. The explanation is the part that stops the next
// reader from wiring money to access.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const SRC = resolve(process.cwd(), "src");
const REPO = resolve(process.cwd(), "..");
const MODULE_DIR = join(SRC, "lib", "payments", "azericard");
const CALLBACK_ROUTE = join(SRC, "app", "api", "payments", "azericard", "callback", "route.ts");
const TEST_ROUTE = join(SRC, "app", "api", "payments", "azericard", "test-initiate", "route.ts");

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}

/** Source with block and line comments blanked out. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(abs, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const MODULE_FILES = filesUnder(MODULE_DIR).filter((f) => !f.includes("__tests__"));
const PAYMENT_FILES = [...MODULE_FILES, CALLBACK_ROUTE, TEST_ROUTE];

/**
 * Code with the import block removed. Ordering assertions below compare where
 * things HAPPEN, and an import statement mentions every one of them on line
 * three — comparing raw offsets would silently pass whatever the body did.
 */
function body(text: string): string {
  return code(text).replace(/^\s*import\s[\s\S]*?;\s*$/gm, " ");
}

describe("the callback grants nothing", () => {
  const src = code(read(CALLBACK_ROUTE));
  const flow = body(read(CALLBACK_ROUTE));

  it("issues a TRTYPE 90 status query and acts only on that", () => {
    expect(src).toContain("queryTransactionStatus");
    expect(src).toContain("recordOutcome");
  });

  it("verifies the signature BEFORE any database or network work", () => {
    const verifyAt = flow.indexOf("verifyCallbackSignature");
    const lookupAt = flow.indexOf("findSessionByOrder");
    const queryAt = flow.indexOf("queryTransactionStatus");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(lookupAt);
    expect(verifyAt).toBeLessThan(queryAt);
  });

  it("looks our order up before querying, and stops on an unknown one", () => {
    const lookupAt = flow.indexOf("findSessionByOrder");
    const queryAt = flow.indexOf("queryTransactionStatus");
    expect(lookupAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeLessThan(queryAt);
    expect(flow).toContain("if (!session)");
  });

  it("checks reference reuse before spending an outbound request", () => {
    const conflictAt = flow.indexOf("hasReferenceConflict");
    const queryAt = flow.indexOf("queryTransactionStatus");
    expect(conflictAt).toBeGreaterThan(-1);
    expect(conflictAt).toBeLessThan(queryAt);
  });

  it("does not fall back on the callback's own ACTION when the status query fails", () => {
    // The whole design exists because the callback's verdict is not trustworthy
    // on its own. A fallback here would quietly undo it.
    expect(src).toContain("if (!status.ok)");
    expect(src).not.toMatch(/status\.ok\s*\?\s*[^:]*:\s*shape\.action/);
    expect(src).not.toContain("outcomeFromCodes");
  });

  it("is rate limited on both the address and the order", () => {
    expect(src).toContain('rateLimitAllow("azericardcb"');
    expect(src).toContain('rateLimitAllow("azericardcborder"');
  });

  it("bounds the body it will read", () => {
    expect(src).toContain("CALLBACK_MAX_BODY_BYTES");
  });

  it("echoes no field — the only two answers are the bare page and a redirect", () => {
    // TWO Response constructors, and this count is the assertion: the static
    // dictionary-driven page, and an EMPTY-BODIED 303 for a parent. There is no
    // third — no JSON, no reflected order id, no gateway text, nothing built
    // from a submitted field.
    //
    // (It was one until the parent checkout landed. The bare page is right for
    // the owner's protocol test and a dead end for a parent mid-purchase, so a
    // plan checkout is redirected back into the product instead. The redirect
    // reflects nothing either — see the next test.)
    expect(src.match(/new Response\(/g) ?? []).toHaveLength(2);
    expect(src).toContain("renderResultPage(kind, locale)");
    expect(src).toContain("new Response(null, {");
    expect(src).not.toContain("NextResponse");
  });

  it("redirects a parent only to a path built from the reconciled verdict", () => {
    // The Location comes from parentResultUrl(), whose only argument is the
    // ResultKind this route computed — never a callback field, never the order,
    // never a query parameter. A redirect target that could be steered by the
    // POST body would be an open redirect on a public, unauthenticated endpoint.
    expect(flow).toContain("parentResultUrl(");
    expect(flow).not.toMatch(/parentResultUrl\([^)]*(shape|url|params|fields)/);
    // WHO gets redirected is decided from OUR OWN row, not from the request.
    // Migration 127: the test is the INTENT, and ONLY the intent. Carrying one
    // is exactly what makes a session redeemable, and it is precisely what the
    // owner's protocol test lacks — whereas `kind` gained a third value
    // (olympiad) whose payer needs the same route back into the product.
    expect(flow).toContain("session.intentKind !== null");
    // ...and it must NOT also require a live child profile. That is the column
    // the child-delete FK NULLs, so a child deleted mid-checkout would turn a
    // paid family checkout into "the protocol test": redemption skipped, and a
    // SUCCESS page shown for money that delivered nothing. Whether the child is
    // still there is checkout_redeem_plan's question ('student_gone').
    expect(flow).not.toContain("session.studentProfileId !== null");
    // 303 specifically: it turns the cross-site POST into a same-origin GET, so
    // the parent's SameSite=Lax session cookie rides along and they land signed
    // in. A 307 would replay the POST at our own page with the bank's body.
    expect(src).toContain("status: 303");
  });

  it("marks its responses no-store and noindex", () => {
    expect(src).toContain('"Cache-Control": "no-store"');
    expect(src).toContain('"X-Robots-Tag": "noindex, nofollow"');
  });
});

describe("the payment layer touches access at exactly ONE seam", () => {
  it("keeps the protocol modules free of any access concept at all", () => {
    // docs/STORE_PAYMENTS_COMPLIANCE.md §4.1: access is governed by the
    // provider-agnostic `entitlements` table with ABB as ONE producer. The
    // modules that speak the protocol — MAC, signing, callback shape, status
    // parsing, the ledger writer — must know nothing about any of it. The
    // callback ROUTE is deliberately not in this list: since migration 125 it
    // owns the one seam, asserted separately below.
    const offenders: string[] = [];
    for (const file of [...MODULE_FILES, TEST_ROUTE]) {
      const src = code(read(file));
      for (const needle of [
        ".rpc(",
        "entitlement",
        "create_child_subscription",
        "purchase_olympiad",
        "add_subscription_subject",
        "apply_plan_change",
        "admin_grant_child_access",
        "child_subscriptions",
        "olympiad_purchases",
      ]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("grants only through redeemPlanCheckout, and only after the money is recorded", () => {
    // THE SEAM, pinned. One call, downstream of everything that establishes the
    // payment is real: the signature, the TRTYPE 90 re-query, the transaction
    // identity match and recordOutcome (which is what advances the session to
    // `paid` — and checkout_redeem_plan refuses anything else).
    //
    // Before migration 125 the plan was applied by the parent's own click and
    // the charge came afterwards, through a helper that could not fail it. The
    // ordering below is the inversion, expressed as the only thing a source
    // sweep can see.
    const src = code(read(CALLBACK_ROUTE));
    const flow = body(read(CALLBACK_ROUTE));
    expect(src.match(/redeemPlanCheckout\(/g) ?? []).toHaveLength(1);

    const recordAt = flow.indexOf("recordOutcome({");
    const redeemAt = flow.indexOf("redeemPlanCheckout(");
    const approvedAt = flow.indexOf('recorded.outcome !== "approved"');
    expect(recordAt).toBeGreaterThan(-1);
    expect(approvedAt).toBeGreaterThan(recordAt);
    expect(redeemAt).toBeGreaterThan(approvedAt);

    // It redeems OUR stored order, never a submitted field.
    expect(flow).toContain("redeemPlanCheckout(session.order)");
    // The owner's protocol test has no intent and is never redeemed.
    expect(flow).toContain('if (!parentFlow) return respond("ok")');

    // And the route still improvises nothing: no direct RPC, no entitlement, no
    // producer table. It calls one named function that owns all of it.
    for (const needle of [".rpc(", "entitlement", "apply_plan_change", "child_subscriptions"]) {
      expect(src, needle).not.toContain(needle);
    }
  });

  it("never tells a payer the plan is live unless the redemption applied", () => {
    // A payment we took but could not deliver on is `pending` on the screen and
    // `needs_review` in the database. Saying "ok" there would be the one lie a
    // parent is guaranteed to discover.
    const flow = body(read(CALLBACK_ROUTE));
    expect(flow).toContain('redeemed === "applied" ? "ok" : "pending"');
  });

  it("records the fact that the LEDGER WRITER granted nothing", () => {
    // recordOutcome writes money and stops; the redemption is its own step with
    // its own `redeem:<order>` event. Keeping the two apart is what makes
    // "money without delivery" and "delivery without money" both queryable
    // after the fact (013 check 118).
    const store = code(read(join(MODULE_DIR, "store.ts")));
    expect(store).toContain("granted: false");
    // It READS the redemption columns — that is how an already-decided session
    // is kept out of the "you still owe this" prompt — but it must never CALL
    // the redemption. One writer, one seam.
    expect(store).not.toContain("checkout_redeem_plan");
  });
});

describe("no card data, anywhere, ever", () => {
  it("has no PAN, CVV, expiry or token field in any payment file", () => {
    // The test-card literal is deliberately NOT in this list: the repo-wide
    // sweep in lib/__tests__/demoPaymentsRemoved.test.ts already forbids it
    // everywhere under src, these files included, and repeating the literal here
    // would put the very string that sweep hunts for back into the tree.
    const offenders: string[] = [];
    for (const file of PAYMENT_FILES) {
      const src = code(read(file));
      for (const needle of [
        "cardNumber",
        "card_number",
        "cvv",
        "cvc",
        "expiryMonth",
        "exp_month",
        // Card-on-file / recurring: present in the protocol, NOT approved for
        // this merchant, and deliberately unbuilt. A dormant token path is an
        // unused money surface.
        "TOKEN_ACTION",
        "MERCH_TRAN_STATE",
        "EXT_NET_REF",
      ]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("filters card-shaped names out of both inbound directions", () => {
    const callback = code(read(join(MODULE_DIR, "callback.ts")));
    const status = code(read(join(MODULE_DIR, "statusResponse.ts")));
    expect(callback).toContain("FORBIDDEN_FIELD_SUBSTRINGS");
    expect(status).toContain("isForbiddenFieldName");
  });

  it("never stores or logs the status response body", () => {
    const gateway = code(read(join(MODULE_DIR, "gateway.ts")));
    // The body is read into a local, parsed, and dropped. It must not reach a
    // console call or a row: §8.2 says it carries the masked card number.
    expect(gateway).not.toMatch(/console\.[a-z]+\([^)]*body/);
    expect(code(read(join(MODULE_DIR, "store.ts")))).not.toContain("body");
  });
});

describe("secrets stay server-side", () => {
  it("reads AZERICARD_* only in config.ts", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(SRC)) {
      if (file.includes("__tests__")) continue;
      if (file === join(MODULE_DIR, "config.ts")) continue;
      if (code(read(file)).includes("AZERICARD_")) offenders.push(relative(REPO, file));
    }
    expect(offenders).toEqual([]);
  });

  it("never prefixes a payment secret with NEXT_PUBLIC_", () => {
    for (const file of PAYMENT_FILES) {
      expect(code(read(file))).not.toContain("NEXT_PUBLIC_AZERICARD");
    }
  });

  it("keeps the secret-holding modules server-only", () => {
    for (const name of ["config.ts", "gateway.ts", "store.ts"]) {
      expect(read(join(MODULE_DIR, name))).toContain('import "server-only";');
    }
  });

  it("keeps the protocol half free of server-only, so it stays testable", () => {
    // The planBasket.ts / subscriptionCore.ts split: the rule that decides
    // whether money moves must be unit-testable without a secret in the process.
    for (const name of ["mac.ts", "format.ts", "signing.ts", "callback.ts", "codes.ts", "statusResponse.ts", "resultPage.ts"]) {
      const src = read(join(MODULE_DIR, name));
      expect(src).not.toContain('import "server-only"');
      expect(code(src)).not.toContain("process.env");
    }
  });

  it("never logs a key, a signature source or a reference", () => {
    for (const file of PAYMENT_FILES) {
      const src = code(read(file));
      for (const call of src.match(/console\.[a-z]+\([\s\S]{0,240}?\);/g) ?? []) {
        for (const needle of ["Pem", "privateKey", "publicKey", "macSource", "P_SIGN", "shape.rrn", "shape.intRef", "signatureHex"]) {
          expect(call).not.toContain(needle);
        }
      }
    }
  });
});

describe("the owner-only test route is invisible to real users", () => {
  const src = code(read(TEST_ROUTE));

  it("authorises as the first statement of every handler", () => {
    expect(src.match(/if \(!authorized\(request\)\) return notFound\(\);/g) ?? []).toHaveLength(2);
  });

  it("fails closed when the token is unset, and compares in constant time", () => {
    expect(src).toContain("if (!expected) return false;");
    expect(src).toContain("timingSafeEqual");
  });

  it("answers 404, not 401, so the path is indistinguishable from a typo", () => {
    expect(src).toContain("new Response(null, { status: 404 })");
  });

  it("re-verifies the named profile even after the token passes", () => {
    expect(src).toContain("isParentProfile");
  });

  it("uses its own checkout kind rather than pretending to be a subscription", () => {
    expect(src).toContain('kind: "protocol_test"');
  });
});

describe("the redirect is a redirect, not an embedded form", () => {
  const src = read(join(MODULE_DIR, "resultPage.ts"));

  it("posts a plain form to the acquirer and runs no script", () => {
    expect(src).toContain('<form method="POST"');
    expect(code(src)).not.toContain("<script");
    expect(code(src)).not.toContain("<iframe");
    // No input the cardholder types into — only hidden protocol fields.
    expect(code(src)).not.toMatch(/<input type="(text|tel|number|password)"/);
  });

  it("renders a result page that reflects nothing back", () => {
    // Its only inputs are an enum and a locale; there is no path from a
    // callback field into the HTML.
    expect(src).toContain("export function renderResultPage(kind: ResultKind, locale: Locale)");
    expect(src).toContain("escapeHtml");
  });

  it("carries no price and no purchase call to action", () => {
    const rendered = code(src);
    expect(rendered).not.toMatch(/AZN|₼/);
    for (const key of ["payres.title", "payres.ok", "payres.pending", "payres.failed", "payres.close", "payres.redirect", "payres.continue"]) {
      expect(rendered.includes(key) || rendered.includes("payres.")).toBe(true);
    }
  });

  it("is allowed through the CSP by naming the gateway origins explicitly", () => {
    const config = read(join(REPO, "web-app", "next.config.mjs"));
    expect(config).toContain("form-action 'self'");
    expect(config).toContain("https://testmpi.3dsecure.az");
    expect(config).toContain("https://mpi.3dsecure.az");
    // Never a wildcard.
    expect(config).not.toContain("form-action 'self' *");
  });
});

describe("trilingual copy", () => {
  it("has every payres.* key in az, en and ru", () => {
    const keys = [
      "payres.title",
      "payres.ok",
      "payres.pending",
      "payres.failed",
      "payres.close",
      "payres.redirect",
      "payres.continue",
    ];
    for (const locale of locales) {
      const dict = messages[locale] as unknown as Record<string, string>;
      for (const key of keys) {
        expect(typeof dict[key]).toBe("string");
        expect((dict[key] ?? "").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("says nothing about buying, prices or where to pay", () => {
    const offenders: string[] = [];
    for (const locale of locales) {
      const dict = messages[locale] as unknown as Record<string, string>;
      for (const key of Object.keys(dict)) {
        if (!key.startsWith("payres.")) continue;
        const value = dict[key] ?? "";
        if (/AZN|₼|\bbuy\b|olympiq\.ai/i.test(value)) offenders.push(`${locale}:${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the database change is written, backported and validated", () => {
  const migration = read(
    join(REPO, "supabase", "sql", "migrations", "2026_08_19_123_azericard_order_uniqueness.sql"),
  );

  it("makes ORDER uniqueness the database's job", () => {
    expect(migration).toContain("create unique index if not exists uq_checkout_provider_session");
    expect(migration).toContain("where provider_session_id is not null");
  });

  it("is backported into the canonical files a from-zero build actually runs", () => {
    const canonical007 = read(join(REPO, "supabase", "sql", "007_subscriptions_payments_coupons.sql"));
    const canonical011 = read(
      join(REPO, "supabase", "sql", "011_indexes_constraints_functions_triggers.sql"),
    );
    expect(canonical011).toContain("uq_checkout_provider_session");
    expect(canonical007).toContain("'subscription', 'olympiad', 'protocol_test'");
  });

  it("is checked by 013 on every validation run", () => {
    const validation = read(join(REPO, "supabase", "sql", "013_validation_queries.sql"));
    expect(validation).toContain("110_azericard_order_uniqueness");
  });

  it("adds no column that could hold card data", () => {
    for (const needle of ["pan", "card_number", "cvv", "token"]) {
      expect(migration.toLowerCase()).not.toContain(`add column if not exists ${needle}`);
    }
  });
});

describe("references are bound by the authority, not by the caller", () => {
  const STORE = read(join(MODULE_DIR, "store.ts"));

  it("claims references from the AUTHORITATIVE status answer, never the callback", () => {
    // The callback's signature does not cover ORDER — that is the entire reason
    // this design re-queries. Claiming the CALLBACK's rrn/intref against our
    // order let an unauthenticated caller bind a real transaction's references
    // to an unrelated order: the claim is permanent, so the genuine payment
    // could then never be recorded.
    // code(): the explanatory comment beside this loop NAMES the old
    // `shape.rrn` it warns against, which is deliberate — the reasoning is
    // worthless without the shape it argues against — so the assertion must
    // read code only.
    const loop = code(
      STORE.slice(
        STORE.indexOf("let replay = false;"),
        STORE.indexOf("const outcome = settledOutcome"),
      ),
    );
    expect(loop).toContain("reconciliation.rrn");
    expect(loop).toContain("reconciliation.intRef");
    expect(
      loop.includes("shape.rrn") || loop.includes("shape.intRef"),
      "a fallback to the callback's copy reopens the hole this closes",
    ).toBe(false);
  });

  it("keeps the stored callback re-verifiable", () => {
    // sanitizeCallbackForStorage documents that it retains P_SIGN so a disputed
    // callback can be re-checked months later against their public key. That
    // was untrue while the only caller passed neither P_SIGN nor NONCE.
    const audit = STORE.slice(STORE.indexOf("sanitizeCallbackForStorage({"));
    expect(audit).toContain("P_SIGN: shape.signatureHex");
    expect(audit).toContain("NONCE: shape.nonce");
  });
});
