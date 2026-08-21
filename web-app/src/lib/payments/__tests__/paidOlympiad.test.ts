// MIGRATION 127, pinned: the last free grant, the frozen price, and the two
// silences.
//
// Seven findings, one change, and they are one change because they are one
// sentence: THE PAYMENT CAUSES THE GRANT, THE GRANT IS WHAT WAS AUTHORISED, AND
// NEITHER SIDE MOVES WITHOUT THE OTHER. This file pins the half of that which
// only exists as an ARRANGEMENT of code and SQL — properties that leave
// everything compiling and every other test green when they break, and show up
// instead as money taken for nothing, access given away, or a family's refund
// quietly keeping its entitlement.
//
//   1  the WEB olympiad purchase granted LIFETIME access through a mock that
//      always approved (the mobile half was closed by 126; this is the other);
//   2  the frozen price is HONOURED at redemption (owner decision) instead of
//      sending an ordinary sibling-tier move to a human;
//   5  a stale frozen basket could UN-CANCEL a subject, so a plan_change now
//      freezes the CHANGE and projects it onto current coverage;
//   6  `needs_review` reached nobody but a validation file;
//   7  a gateway REVERSAL was invisible — the ordinary status query reports the
//      original authorisation as approved forever.
//
// (3 and 4 — the web free branch and the two trial edges — are pinned in
// purchaseSilent.test.ts beside the findings they extend.)
//
// COMMENTS ARE STRIPPED before every source sweep, for the reason the sibling
// files give: these modules explain at length what they deliberately do NOT do,
// and a sweep that could not tell a mention from a use would force those
// explanations out of the code that needs them most.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";
import { interpretReversalResponse } from "@/lib/payments/azericard/codes";
import {
  classifyReversalAnswer,
  parseStatusResponse,
  reconcileStatus,
} from "@/lib/payments/azericard/statusResponse";

const SRC = resolve(process.cwd(), "src");
const REPO = resolve(process.cwd(), "..");
const SQL = join(REPO, "supabase", "sql");

const OLY_CORE = join(SRC, "lib", "auth", "olympiadCore.ts");
const OLY_SERVICE = join(SRC, "lib", "auth", "olympiadService.ts");
const CHECKOUT_CORE = join(SRC, "lib", "payments", "checkoutCore.ts");
const CHECKOUT_INTENT = join(SRC, "lib", "payments", "checkoutIntent.ts");
const RECONCILE_CORE = join(SRC, "lib", "payments", "reconcileCore.ts");
const STATUS_RESPONSE = join(SRC, "lib", "payments", "azericard", "statusResponse.ts");
const CALLBACK_ROUTE = join(
  SRC, "app", "api", "payments", "azericard", "callback", "route.ts",
);
const MOBILE_API = join(SRC, "app", "api", "mobile");
const CANONICAL_011 = join(SQL, "011_indexes_constraints_functions_triggers.sql");
const CANONICAL_013 = join(SQL, "013_validation_queries.sql");
const CANONICAL_015 = join(SQL, "015_olympiad_preparation.sql");
const MIGRATION_124 = join(SQL, "migrations", "2026_08_20_124_entitlements.sql");
const MIGRATION_127 = join(
  SQL, "migrations", "2026_08_21_127_paid_olympiad_and_frozen_price.sql",
);

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}

/** Source with block and line comments blanked out. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** SQL with `--` comments blanked out (string literals here contain none). */
function sqlCode(text: string): string {
  return text.replace(/^\s*--[^\n]*$/gm, " ");
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

/** The body of one SQL function, from its CREATE to the `$$;` that closes it. */
function sqlFunction(text: string, name: string): string {
  const at = text.indexOf(`create or replace function public.${name}(`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  const end = text.indexOf("\n$$;", at);
  expect(end, `${name} has no terminator`).toBeGreaterThan(at);
  return text.slice(at, end);
}

// =============================================================================
// 1 — the olympiad package is a PAID product now
// =============================================================================

describe("the olympiad purchase is paid for", () => {
  const core = code(read(OLY_CORE));
  const service = code(read(OLY_SERVICE));
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);

  it("has no mock payment seam left, dormant or otherwise", () => {
    // THE DEFECT, as a property. `processOlympiadPayment` returned
    // `{ ok: true }` unconditionally and had never been wired to a provider, so
    // purchase_olympiad wrote an ACTIVE purchase, migration 124 mirrored it into
    // a LIFETIME entitlement, and no `payments` row existed anywhere. Leaving it
    // DORMANT would have been worse than leaving it wired: a function that
    // approves everything is one call site away from doing it again.
    for (const file of filesUnder(SRC)) {
      // The suites are excluded because THIS one names the dead function in
      // order to forbid it; a sweep that could not tell a prohibition from a use
      // would forbid writing the prohibition down.
      if (/__tests__/.test(file)) continue;
      // COMMENTS ARE STRIPPED, as everywhere in these suites. olympiadCore and
      // olympiadService both NAME the removed function in their headers, to
      // explain what used to be there and why it went; a sweep that could not
      // tell a mention from a use would force that history out of the files
      // that most need to carry it.
      const src = code(read(file));
      expect(src, relative(REPO, file)).not.toContain("processOlympiadPayment");
    }
    expect(core).not.toContain("MOCK PAYMENT");
  });

  it("quotes first and opens an intent when money is owed", () => {
    // The same inversion migration 125 made for the subscription: QUOTE ->
    // INTENT -> redirect -> verified payment -> grant. The branch is the
    // SERVER'S, taken from the quote RPC's own due_now.
    const quoteAt = service.indexOf("quoteOlympiadPurchaseCore(");
    const payAt = service.indexOf("startOlympiadPayment(");
    const applyAt = service.indexOf("purchaseOlympiadForChildCore(");
    expect(quoteAt).toBeGreaterThan(-1);
    expect(payAt).toBeGreaterThan(quoteAt);
    expect(applyAt).toBeGreaterThan(payAt);
    expect(service).toContain("quoted.dueNow > 0");
  });

  it("keeps the checkout OUT of the shared core", () => {
    // The core is shared with the mobile BFF, and a checkout opened inside it
    // would put a purchase path in an app binary. The apps are purchase-silent
    // by ARCHITECTURE (docs/STORE_PAYMENTS_COMPLIANCE.md §4), which is a
    // structural property rather than a flag someone could flip.
    expect(core).not.toContain("startOlympiadPayment");
    expect(core).not.toContain("checkoutCore");
    const offenders: string[] = [];
    for (const file of filesUnder(MOBILE_API)) {
      const src = code(read(file));
      for (const needle of ["startOlympiadPayment", "checkoutCore", "checkoutIntent"]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("redeems through the ONE redemption function, not a second one", () => {
    // A second implementation of "money becomes access" mis-bills silently the
    // day it drifts from the first. The olympiad kind is a BRANCH inside
    // checkout_redeem_plan, which keeps the row lock, the `paid` requirement,
    // the re-price and the exactly-once claim shared.
    const intent = code(read(CHECKOUT_INTENT));
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
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(body, label).toContain("public.quote_olympiad_purchase(");
      expect(body, label).toContain("public.purchase_olympiad(");
    }
  });

  it("records which RAIL paid, so the entitlement is not filed as comped", () => {
    // purchase_olympiad writes provider = 'none' (it has no idea how it was
    // reached) and fn_entitlement_map_purchase reads exactly that column to
    // choose abb_web vs manual. Leaving it would file every paid package as a
    // COMPED one — a provider-agnostic entitlement table with the wrong source
    // is worse than one with no source.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(body, label).toContain("set provider = 'azericard'");
    }
  });

  it("keeps LIFETIME access exactly as it was", () => {
    // CLAUDE.md non-negotiable, and the change most likely to tempt someone into
    // an expiry now that the package is a priced product.
    expect(read(MIGRATION_124)).toContain(
      "constraint ck_entitlement_lifetime check (scope <> 'olympiad_package' or ends_at is null)",
    );
    // can_view_olympiad_package must never read the package's own catalog status
    // outside the sale predicate — an ARCHIVED package a family bought stays
    // visible to them.
    const view = read(CANONICAL_015);
    expect(view).toContain("or public.is_admin()");
    expect(view).toContain("from public.olympiad_purchases pu");
    expect(read(CANONICAL_013)).toContain("package_grant_expiry");
  });

  it("has exactly ONE purchase path in the product", () => {
    // The per-child page used to post to a `buyOlympiad` action that called
    // purchase_olympiad DIRECTLY: no quote, no intent, no payment. Two
    // implementations of one billing rule mis-bill the day they drift.
    for (const file of filesUnder(SRC)) {
      if (/__tests__/.test(file)) continue;
      expect(code(read(file)), relative(REPO, file)).not.toContain("buyOlympiad");
    }
  });
});

// =============================================================================
// 2 — the price we quoted is the price the parent pays
// =============================================================================

describe("the frozen price", () => {
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);

  it("is honoured AFTER the money moves", () => {
    // OWNER DECISION, 2026-08-21. Exact equality fired on ordinary behaviour:
    // paying for child A moves child B's sibling tier, so B's already-signed
    // intent re-priced differently, B's money was taken, and a family waited on
    // a human over a few AZN.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(body, label).toContain("v_honoured := true");
      // The old rule must be GONE from the body, not merely unreachable.
      expect(body, label).not.toContain("price_changed");
      // ...and the decision is written down, so a settlement report can find
      // every charge delivered at a price the catalog had since moved off.
      expect(body, label).toContain("honoured_frozen_price");
    }
  });

  it("is still REFUSED before the money moves", () => {
    // The asymmetry is what bounds the exposure to the signing-to-redeeming
    // window. Refusing before a charge costs the parent nothing; refusing after
    // one costs them their money.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "checkout_intent_price"));
      expect(body, label).toContain("'price_changed'");
    }
  });

  it("still sends a DIFFERENT DELIVERY to a human", () => {
    // The line the owner's decision does NOT cross. A withdrawn subject, a
    // deactivated pricing row, a package off sale, a promoted child, a
    // subscription that vanished — none is a price difference, and delivering
    // something other than what was authorised is the failure this whole family
    // of migrations exists to prevent. A re-price that comes back at ZERO is the
    // other half: keeping money for something now free is dishonest too.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      for (const note of [
        "'student_gone'",
        "'expired'",
        "'plan_already_live'",
        "'subscription_changed'",
        "'grade_changed'",
        "'no_longer_payable'",
        "reprice_failed:",
        "apply_failed:",
      ]) {
        expect(body, `${label} ${note}`).toContain(note);
      }
    }
  });

  it("shows the parent WHICH child earned the discount", () => {
    // The other half of the owner's ask: the saving should be something a parent
    // can SEE at the moment they choose, not a smaller number they have to
    // trust. The tier comes from the quote RPC, never from the browser.
    const summary = code(read(join(SRC, "components", "PlanSummary.tsx")));
    expect(summary).toContain("sub.discount.rank2");
    expect(summary).toContain("sub.discount.rank3");
    expect(summary).toContain("sub.discount.saved");
    // ...and the "you would save more with a second child" line, which is the
    // only place a one-child family learns the rule exists.
    expect(summary).toContain("sub.discount.hint");
    for (const [label, sql] of [
      ["migration 127", read(MIGRATION_127)],
      ["canonical 011", read(CANONICAL_011)],
    ] as const) {
      expect(sqlCode(sqlFunction(sql, "quote_plan_change")), label).toContain("'rank', v_rank");
    }
  });
});

// =============================================================================
// 5 — a payment authorises a CHANGE, not a WORLD
// =============================================================================

describe("a stale checkout cannot un-cancel a subject", () => {
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);

  it("freezes the CHANGE beside the basket", () => {
    // An absolute basket is a claim about the whole plan at one past moment.
    // Applying it later necessarily overwrites everything since: a subject the
    // parent cancelled comes back as a REINSTATEMENT, and one they added is
    // scheduled for removal.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const open = sqlCode(sqlFunction(sql, "checkout_intent_open"));
      expect(open, label).toContain("public.plan_change_delta(");
      const redeem = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(redeem, label).toContain("public.plan_delta_project(");
    }
  });

  it("keeps the frozen change IMMUTABLE, like the price it was quoted at", () => {
    // It is now the field that decides what is delivered, so an UPDATE that
    // moved it would let a signed payment deliver something else with the
    // signature still verifying.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const freeze = sqlCode(sqlFunction(sql, "fn_checkout_intent_immutable"));
      expect(freeze, label).toContain("new.intent_delta         is distinct from old.intent_delta");
    }
  });

  it("projects onto CURRENT coverage rather than restoring a snapshot", () => {
    // Read the projection's rules off the query: live subjects are kept (so one
    // added since is never removed), a frozen remove acts only while the subject
    // is still live, and only a frozen add/reinstate re-injects one.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const project = sqlCode(sqlFunction(sql, "plan_delta_project"));
      expect(project, label).toContain("and ss.remove_at is null");
      expect(project, label).toContain("d.op = 'remove'");
      expect(project, label).toContain("d.op in ('add', 'reinstate')");
    }
  });

  it("will not deliver a session it has no authorised change for", () => {
    // A session opened before the column existed carries no delta. It can still
    // be RE-PRICED against its frozen basket — that is what the fallback below
    // is for — but it cannot show that what would be delivered is what was
    // authorised, and delivering it anyway would be inventing an authorisation.
    // The delivery comparison catches it for exactly that reason, and the money
    // goes in front of a person instead.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const redeem = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(redeem, label).toContain("case when v_s.intent_delta is null");
      expect(redeem, label).toContain("v_delivering is distinct from v_s.intent_delta");
      expect(redeem, label).toContain("'delivery_changed'");
    }
  });
});

// =============================================================================
// The honour rule is about a PRICE, never about a DELIVERY
// =============================================================================

describe("the delivery the parent authorised", () => {
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);
  const pair = [
    ["migration 127", migration],
    ["canonical 011", canonical],
  ] as const;

  it("is what the honour rule is gated on, not the amount", () => {
    // THE DEFECT, and it was one defect wearing two faces. "The frozen price is
    // the price" was implemented as "the amounts differ, therefore the price
    // moved", which is wrong in both directions:
    //
    //   * SHRUNKEN delivery. Two tabs; A froze [add Math, add English] at 18.00,
    //     B froze [add Math] at 9.00 and was paid first. A re-prices at 9.00 and
    //     an amount-only rule charges the parent 18.00 for a 9.00 delivery.
    //   * ENLARGED delivery. A frozen FREE reinstate whose coverage lapsed is
    //     re-classified as a paid add, so the re-price is HIGHER — and the same
    //     rule honours the smaller frozen amount and hands over a full new cycle
    //     for nothing.
    //
    // One fix, not two: re-derive the change with the SAME function that froze
    // it and require the two to be identical. The amount is then honoured as a
    // consequence of that answer rather than as a substitute for it.
    for (const [label, sql] of pair) {
      const redeem = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      const deliverAt = redeem.indexOf("v_delivering := public.plan_change_delta(");
      const honourAt = redeem.indexOf("v_honoured := true");
      expect(deliverAt, label).toBeGreaterThan(-1);
      expect(honourAt, `${label} honour`).toBeGreaterThan(deliverAt);
      // ...and the comparison is against the FROZEN delta, subject for subject.
      expect(redeem, label).toContain("v_delivering is distinct from v_s.intent_delta");
    }
  });

  it("is checked BEFORE the money moves too, where refusing is free", () => {
    // Same question at signing time. Catching it here means the delivery-changed
    // verdict at redemption is the rare leftover (the window between signing and
    // redeeming) rather than the ordinary case.
    for (const [label, sql] of pair) {
      const priced = sqlCode(sqlFunction(sql, "checkout_intent_price"));
      expect(priced, label).toContain("public.plan_change_delta(");
      expect(priced, label).toContain("'delivery_changed'");
    }
    const intent = code(read(CHECKOUT_INTENT));
    expect(intent).toContain('reason === "delivery_changed"');
  });

  it("compares a package against the QUOTE's grade, not the child's row", () => {
    // A LEGACY GRADE-LESS package quotes grade_id = NULL — it sells one pool,
    // not a grade — so comparing the frozen NULL against students.grade_id made
    // every such purchase report `grade_changed`: no checkout could be resumed,
    // and the duplicate-purchase guard that lives on the resume path went with
    // it. Redemption already compared this way; the pricing side did not.
    for (const [label, sql] of pair) {
      const priced = sqlCode(sqlFunction(sql, "checkout_intent_price"));
      expect(priced, label).toContain("v_cur := nullif(v_q ->> 'grade_id', '')::uuid");
      expect(priced, label).not.toContain("select st.grade_id into v_cur");
    }
  });

  it("records what the parent was CHARGED on the purchase row", () => {
    // purchase_olympiad writes today's CATALOG price, which is not necessarily
    // what was taken: an honoured frozen price leaves the purchase row and the
    // payments row disagreeing about the same money, and the purchase row is the
    // one a family and an accountant read.
    for (const [label, sql] of pair) {
      const redeem = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(redeem, label).toContain("amount     = v_s.amount");
      // ...and nothing is stamped at all when nothing was bought, because that
      // purchase belongs to somebody else's payment.
      expect(redeem, label).toContain("'already_owned'");
    }
  });

  it("files the paid rail as the paid rail, by re-firing the mirror", () => {
    // fn_entitlement_map_purchase reads olympiad_purchases.provider and nothing
    // else to choose abb_web over a comped `manual` grant — and the mirror
    // trigger is COLUMN-SCOPED. With `provider` off that list the stamp changed
    // the row and re-fired nothing, so paid revenue was invisible to every
    // report keyed on `source`.
    const trigger = "after insert or update of status, grade_id, student_profile_id, provider";
    expect(read(MIGRATION_127)).toContain(trigger);
    expect(read(CANONICAL_015)).toContain(trigger);
  });
});

// =============================================================================
// 6 — silence is the failure mode
// =============================================================================

describe("a redemption that needs a human reaches one", () => {
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);

  it("files a PRIORITY 1 notification from all three places", () => {
    // Priority 1 is the level create_notification explicitly refuses to let a
    // recipient silence, and this is money we are holding. The three callers are
    // redemption, a flagged follow-up, and a reversal.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const alarm = sqlCode(sqlFunction(sql, "checkout_alert_admins"));
      expect(alarm, label).toContain("'administrators'");
      expect(alarm, label).toContain("public.create_notification(");
      for (const caller of [
        "checkout_redeem_plan",
        "checkout_flag_redemption",
        "checkout_revoke_reversed",
      ] as const) {
        expect(sqlCode(sqlFunction(sql, caller)), `${label} ${caller}`).toContain(
          "public.checkout_alert_admins(",
        );
      }
    }
  });

  it("never lets the alarm roll back the thing it is reporting", () => {
    // Losing the alarm is bad; losing the RECORD of what happened to the money
    // is worse. The whole body sits in an exception block.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const alarm = sqlCode(sqlFunction(sql, "checkout_alert_admins"));
      expect(alarm, label).toContain("exception when others then");
    }
  });

  it("has an admin surface, and it grants nothing", () => {
    const page = join(
      REPO, "admin-panel", "src", "app", "(protected)", "subscriptions",
      "checkouts", "page.tsx",
    );
    const lib = join(REPO, "admin-panel", "src", "lib", "admin", "checkouts.ts");
    expect(existsSync(page)).toBe(true);
    const libSrc = code(read(lib));
    expect(libSrc).toContain("requireAdmin()");
    // There is no "deliver it anyway" button and there must not be: delivering
    // is checkout_redeem_plan's job, behind a verified payment.
    for (const forbidden of [
      "checkout_redeem_plan",
      "create_child_plan",
      "apply_plan_change",
      "purchase_olympiad",
      "entitlement",
    ]) {
      expect(libSrc, forbidden).not.toContain(forbidden);
    }
  });

  it("gives the alarm an OFF SWITCH that does not rewrite history", () => {
    // There are only two redemption statuses and neither means "a person settled
    // this", so without one 013 check 118 goes permanently red seven days after
    // the first genuine case. Moving the status to 'applied' would have been the
    // other option and would be a lie about a refunded case.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const fn = sqlCode(sqlFunction(sql, "admin_resolve_checkout_review"));
      expect(fn, label).toContain("public.is_admin()");
      expect(fn, label).toContain("'resolved:'");
      expect(fn, label).toContain("insert into public.audit_logs");
      // It writes the NOTE and never the status.
      expect(fn, label).not.toContain("redemption_status =");
    }
    const checks = read(CANONICAL_013);
    expect(checks).toContain("not like 'resolved:%'");
  });
});

// =============================================================================
// 7 — money returned must take back what it bought
// =============================================================================

describe("a gateway reversal", () => {
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);
  const gateway = code(read(GATEWAY_PATH()));
  const reconcile = code(read(RECONCILE_CORE));

  function GATEWAY_PATH(): string {
    return join(SRC, "lib", "payments", "azericard", "gateway.ts");
  }

  it("is asked about with TRAN_TRTYPE=22, because nothing else reveals it", () => {
    // Learned from the live bank test on 2026-08-21, not from the spec: a status
    // query with TRAN_TRTYPE=1 reports the ORIGINAL authorisation as
    // actionCode=0 / Approved FOREVER. queryTransactionStatus hardcoded that
    // value, so a refund could never be noticed.
    expect(gateway).toContain("TRTYPE.REVERSAL_ONLINE");
    expect(gateway).toContain("queryReversalStatus");
    expect(reconcile).toContain("queryReversalStatus");
  });

  it("treats the undocumented acknowledgement conservatively", () => {
    // The gateway answered our reversal with the single character "1". That is
    // the entire evidence base, so "1" reports as accepted and EVERYTHING else
    // — including a body that looks like a decline — reports as unknown. It
    // never returns "declined": concluding a reversal failed from an
    // undocumented body would leave a family's money returned at the bank while
    // we kept their access.
    expect(interpretReversalResponse("1")).toBe("accepted");
    expect(interpretReversalResponse(" 1 ")).toBe("accepted");
    for (const hostile of ["", "0", "2", "{}", "ACTION=2", "<html>", "11", "1 1"]) {
      expect(interpretReversalResponse(hostile), JSON.stringify(hostile)).toBe("unknown");
    }
    // Non-strings cannot throw their way through it either.
    for (const hostile of [null, undefined, 1, {}, []]) {
      expect(interpretReversalResponse(hostile as unknown as string)).toBe("unknown");
    }
  });

  it("acts only on a RECONCILED answer, never on the acknowledgement", () => {
    // The same conjunctive test the sale has to pass — our order, our terminal,
    // our amount, our currency — now expressed as a named three-valued verdict
    // rather than as a boolean the sweep interprets. Revoking a family's access
    // on a maybe is its own kind of harm.
    expect(reconcile).toContain("classifyReversalAnswer(");
    expect(reconcile).toContain("checkout_revoke_reversed");
    const classifier = code(read(STATUS_RESPONSE));
    expect(classifier).toContain("reconciliation.approved");
  });

  it("needs POSITIVE evidence, and treats rc -24 as a definitive no", () => {
    // THE EMPIRICAL RESULT, from the live terminal on 2026-08-21, and the whole
    // reason this can be decided at all. A TRAN_TRTYPE=22 query about an order
    // that WAS reversed answers actionCode 0 / Approved; the same query about an
    // order that was NOT answers actionCode 3, rc -24, "Transaction context
    // mismatch". So an approval to that question is a positive statement that
    // the reversal exists, and the error is a definitive statement that it does
    // not — neither one is silence being read as consent.
    const expectation = {
      order: "20260820926794",
      terminal: "12345678",
      amount: "3.00",
      currency: "AZN",
    };
    const verdict = (body: string): string => {
      const parsed = parseStatusResponse(body);
      return classifyReversalAnswer(parsed, reconcileStatus(parsed, expectation), "22");
    };

    // The reversal itself. Note the currency: they answer with the ISO numeric
    // code for the alphabetic one we send.
    expect(
      verdict(
        JSON.stringify({
          terminal: "12345678",
          actionCode: "0",
          responseCode: "00",
          statusMsg: "Approved",
          amount: "3.00",
          currency: "944",
          tranDate: "20260821104700",
        }),
      ),
    ).toBe("reversed");

    // The order with no reversal on it. Both the code and the message are
    // definitive on their own, because a sparse reply may carry either.
    for (const body of [
      JSON.stringify({ actionCode: "3", responseCode: "-24", statusMsg: "Transaction context mismatch" }),
      JSON.stringify({ actionCode: "3", responseCode: "-24" }),
      JSON.stringify({ actionCode: "3", statusMsg: "Transaction context mismatch" }),
    ]) {
      expect(verdict(body), body).toBe("not_reversed");
    }

    // EVERYTHING WE CANNOT CLASSIFY FAILS CLOSED. An empty body, a shape we
    // cannot read, an approval about somebody else's amount, an approval that
    // names a different transaction type: none of them takes access away.
    for (const body of [
      "",
      "<html>gateway error</html>",
      "1",
      JSON.stringify({ actionCode: "0", responseCode: "00", amount: "99.00", currency: "944" }),
      JSON.stringify({ actionCode: "0", responseCode: "00", amount: "3.00", currency: "944", tranTrtype: "1" }),
      JSON.stringify({ actionCode: "2", responseCode: "51", amount: "3.00", currency: "944" }),
    ]) {
      expect(verdict(body), JSON.stringify(body)).toBe("unreadable");
    }
  });

  it("puts an answer it cannot classify in front of a person", () => {
    // Failing closed is only half of it. A body we do not understand ABOUT MONEY
    // is not a thing to drop silently, so the sweep flags the session — through
    // the same seam a failed redemption follow-up uses, which is idempotent per
    // (order, reason) and therefore files one notice rather than one per pass.
    // A query that could not be MADE is different and is deliberately not
    // flagged: that is not an answer, and the next pass asks again.
    expect(reconcile).toContain('flagCheckoutForReview(row.order, "reversal_unreadable")');
    const askFailed = reconcile.indexOf("if (!status.ok)");
    const classifyAt = reconcile.indexOf("classifyReversalAnswer(");
    expect(askFailed).toBeGreaterThan(-1);
    expect(classifyAt).toBeGreaterThan(askFailed);
  });

  it("revokes through the PRODUCER, never by writing entitlements", () => {
    // A direct UPDATE on a mirrored entitlement row is reverted by the next
    // producer write or by the next entitlements_reconcile(); it would look like
    // it worked and quietly come back.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const fn = sqlCode(sqlFunction(sql, "checkout_revoke_reversed"));
      expect(fn, label).toContain("update public.olympiad_purchases");
      expect(fn, label).toContain("update public.subscription_subjects");
      expect(fn, label).not.toContain("update public.entitlements");
      expect(fn, label).not.toContain("insert into public.entitlements");
      // Idempotent: a repeated sweep must not revoke twice or alarm twice.
      expect(fn, label).toContain("status = 'refunded'");
    }
    expect(reconcile).not.toContain("entitlement");
  });

  it("takes back only what THIS money bought", () => {
    // A reinstatement, a cycle move and a removal in the same save cost nothing
    // and are not this payment's to undo.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const fn = sqlCode(sqlFunction(sql, "checkout_revoke_reversed"));
      expect(fn, label).toContain("e.v ->> 'op' = 'add'");
    }
  });

  it("revokes what was DELIVERED, never what was intended", () => {
    // THE DEFECT. The revocation was re-derived from the FROZEN delta — the one
    // set that is provably not what happened whenever anything moved between
    // signing and redeeming. After an honoured price, or after a sibling tab
    // delivered half the basket, the intent names a subject a DIFFERENT payment
    // paid for, and closing its period revokes access a family is owed. The
    // redemption knows what it applied, so it writes it down and this reads it.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const fn = sqlCode(sqlFunction(sql, "checkout_revoke_reversed"));
      expect(fn, label).toContain("v_s.delivered_items");
      expect(fn, label).not.toContain("intent_delta");
      // A redemption decided before the column existed cannot say what it
      // delivered, so it revokes NOTHING and asks for a person.
      expect(fn, label).toContain("if v_s.delivered_items is null then");
      // ...and the redemption is what writes it, exactly once, in the statement
      // that decides the redemption.
      const redeem = sqlCode(sqlFunction(sql, "checkout_redeem_plan"));
      expect(redeem, label).toContain(
        "delivered_items   = case when v_outcome = 'applied' then v_delivering end",
      );
    }
  });

  it("cancels the subscription only when nothing is left covered on it", () => {
    // A plan_start reversal used to cancel the subscription outright, which also
    // killed every subject bought on it later by payments nobody reversed. The
    // honest test is not "which kind of intent was this" but "is any coverage
    // still standing" — one rule for both plan kinds instead of a branch.
    for (const [label, sql] of [
      ["migration 127", migration],
      ["canonical 011", canonical],
    ] as const) {
      const fn = sqlCode(sqlFunction(sql, "checkout_revoke_reversed"));
      expect(fn, label).not.toContain("v_s.intent_kind = 'plan_start'");
      const guardAt = fn.indexOf("and not exists (");
      const cancelAt = fn.indexOf("set status = 'canceled'");
      expect(guardAt, label).toBeGreaterThan(-1);
      expect(cancelAt, `${label} cancel`).toBeGreaterThan(guardAt);
    }
  });
});

// =============================================================================
// The migration and the canonical file say the SAME thing
// =============================================================================

describe("migration 127 and its backport", () => {
  const migration = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);

  /** Every function 127 writes or re-issues. */
  const FUNCTIONS = [
    "fn_checkout_intent_immutable",
    "plan_change_delta",
    "plan_delta_project",
    "quote_plan_change",
    "apply_plan_change",
    "quote_olympiad_purchase",
    "purchase_olympiad",
    "purchase_olympiad_if_free",
    "checkout_alert_admins",
    "checkout_intent_open",
    "checkout_intent_price",
    "checkout_redeem_plan",
    "checkout_flag_redemption",
    "checkout_redeem_sweep",
    "checkout_reversal_candidates",
    "checkout_revoke_reversed",
    "admin_resolve_checkout_review",
  ] as const;

  it("carries every body VERBATIM into 011", () => {
    // A backport that paraphrases is a second implementation with extra steps,
    // and the two only have to disagree once — on a live database that took the
    // migration and a from-zero rebuild that took the canonical file — for the
    // schema to stop being one thing.
    for (const name of FUNCTIONS) {
      expect(canonical, name).toContain(sqlFunction(migration, name));
    }
  });

  it("restates every revoke, because create-or-replace preserves ACLs", () => {
    // The single most expensive thing to forget: replacing a function keeps its
    // grants, so a body that becomes reachable by `authenticated` stays that way
    // silently. Every function is named in both files.
    for (const name of FUNCTIONS) {
      for (const [label, sql] of [
        ["migration 127", migration],
        ["canonical 011", canonical],
      ] as const) {
        expect(sql, `${label} ${name}`).toContain(
          `revoke all on function public.${name}(`,
        );
      }
    }
  });

  it("self-transacts, and the canonical file does not", () => {
    // CLAUDE.md's migration-095 rule: a self-transacting file sourced inside a
    // from-zero rebuild committed the OUTER transaction and lost every row. The
    // migration wraps itself; 011 must never contain a transaction statement,
    // because it IS run inside one.
    expect(migration.match(/^[ 	]*(begin|commit|rollback)[ 	]*;/gm)).toEqual([
      "begin;",
      "commit;",
    ]);
    expect(canonical.match(/^[ 	]*(begin|commit|rollback)[ 	]*;/gm)).toBeNull();
  });

  it("never uses the new enum value in the transaction that adds it", () => {
    // PostgreSQL allows ALTER TYPE ... ADD VALUE inside a transaction but
    // refuses to USE the value until it commits. A "use" is anything the server
    // EVALUATES at migration time: an index predicate, a CHECK, a DO block, and
    // the body of an SQL-language function (which is parse-analysed at CREATE
    // time — unlike plpgsql, which is not). Getting this wrong aborts the whole
    // migration on the FIRST database it touches.
    expect(migration).toContain(
      "alter type public.checkout_intent_kind add value if not exists 'olympiad'",
    );
    // The verification block reads pg_enum as a CATALOG, which is not a use.
    const doBlocks = migration.match(/do \$mig\$[\s\S]*?\$mig\$;/g) ?? [];
    expect(doBlocks.length).toBeGreaterThan(0);
    for (const block of doBlocks) {
      expect(block).not.toContain("'olympiad'::");
      expect(block).not.toContain("intent_kind = 'olympiad'");
    }
    // ...and no SQL-language function mentions it either.
    for (const name of ["plan_change_delta", "plan_delta_project", "checkout_reversal_candidates"]) {
      expect(sqlFunction(migration, name), name).not.toContain("'olympiad'");
    }
  });

  it("adds its 013 checks and amends the one that had no off switch", () => {
    const checks = read(CANONICAL_013);
    expect(checks).toContain("121_olympiad_purchase_is_paid_for");
    expect(checks).toContain("122_frozen_price_frozen_change_real_trial");
    expect(checks).toContain("123_needs_review_reaches_a_person");
    expect(checks).toContain("money_returned_access_kept");
    expect(checks).toContain("a_human_was_never_told");
  });
});

// =============================================================================
// Copy — trilingual, and legal in a store binary
// =============================================================================

describe("the copy this change adds", () => {
  const NEW_KEYS = [
    "sub.err.priceMoved",
    "sub.discount.rank2",
    "sub.discount.rank3",
    "sub.discount.saved",
    "sub.discount.hint",
    "poly.err.alreadyOwned",
    "poly.err.priceMoved",
    "poly.modal.payNote",
  ] as const;

  it("exists in az, en and ru", () => {
    for (const locale of locales) {
      for (const key of NEW_KEYS) {
        const value = (messages as Record<string, Record<string, string>>)[locale]?.[key];
        expect(value, `${locale} ${key}`).toBeTruthy();
        expect(value.length, `${locale} ${key}`).toBeGreaterThan(3);
      }
    }
  });

  it("no longer promises a test payment on the olympiad modal", () => {
    // The old note said "no real charge is made", which stopped being true the
    // moment the mock was removed. A payment screen that lies about whether it
    // charges is the one lie a parent is guaranteed to discover.
    for (const locale of locales) {
      const dict = (messages as Record<string, Record<string, string>>)[locale];
      expect(dict["poly.modal.mockNote"], locale).toBeUndefined();
    }
    const component = code(read(join(SRC, "components", "OlympiadPurchase.tsx")));
    expect(component).not.toContain("modalMockNote");
    expect(component).toContain("modalPayNote");
  });

  it("keeps the app-facing refusal free of a price and a destination", () => {
    // docs/STORE_PAYMENTS_COMPLIANCE.md §5. The WEB refusal is a different
    // sentence for a different situation, and it stays on the web: it is a
    // `sub.*` key, which the app catalog does carry, so it must not name a price
    // or a purchase verb either.
    for (const locale of locales) {
      const value = (messages as Record<string, Record<string, string>>)[locale][
        "sub.err.priceMoved"
      ].toLowerCase();
      for (const banned of ["azn", "olympiq.ai", "http", "manat", "₼"]) {
        expect(value.includes(banned), `${locale} contains "${banned}"`).toBe(false);
      }
    }
  });

  it("is listed in the dictionaries of the pages that render it", () => {
    // A page-scoped dictionary is a KEYS array, and a key missing from it
    // renders as the key itself — in front of a parent, at the payment step.
    const pages = [
      join(SRC, "app", "(parent)", "children", "new", "page.tsx"),
      join(SRC, "app", "(parent)", "children", "[id]", "subscribe", "page.tsx"),
    ];
    for (const page of pages) {
      const src = read(page);
      for (const key of [
        "sub.discount.rank2",
        "sub.discount.rank3",
        "sub.discount.saved",
        "sub.discount.hint",
      ]) {
        expect(src, `${relative(REPO, page)} ${key}`).toContain(`"${key}"`);
      }
    }
  });
});

// =============================================================================
// The callback still decides nothing, with a third product on the rail
// =============================================================================

describe("the callback", () => {
  it("redeems every session that carries an INTENT, whatever it bought", () => {
    // It used to key on `kind === 'subscription'`, which was the same thing
    // right up until the package became payable — a package checkout would then
    // have landed on the bare page AND never been redeemed, so a parent would
    // have paid for something that never arrived.
    const flow = code(read(CALLBACK_ROUTE));
    expect(flow).toContain("session.intentKind !== null");
    expect(flow).toContain("redeemPlanCheckout(session.order)");
    // ...and it still improvises nothing.
    for (const needle of [".rpc(", "entitlement", "purchase_olympiad", "child_subscriptions"]) {
      expect(flow, needle).not.toContain(needle);
    }
  });

  it("never shows success for a checkout whose child is gone", () => {
    // `student_profile_id` is the column the child-delete FK NULLs. The callback
    // used to fold it into "is this a family checkout", so a child deleted
    // mid-flight turned a paid checkout into the owner's protocol test:
    // redemption was skipped ENTIRELY — no needs_review, no alert, nothing —
    // and the parent was shown a SUCCESS page for money that delivered nothing.
    const flow = code(read(CALLBACK_ROUTE));
    expect(flow).not.toContain("session.studentProfileId");
    // The database is where that question is answered, and it answers it by
    // recording the money as undelivered rather than by staying quiet.
    for (const [label, sql] of [
      ["migration 127", read(MIGRATION_127)],
      ["canonical 011", read(CANONICAL_011)],
    ] as const) {
      expect(sqlCode(sqlFunction(sql, "checkout_redeem_plan")), label).toContain(
        "v_note := 'student_gone'",
      );
    }
  });

  it("keeps the two checkout kinds apart in the ledger", () => {
    // A settlement report that cannot tell a subscription from a package from
    // the owner's protocol test is a report nobody can act on.
    const core = code(read(CHECKOUT_CORE));
    expect(core).toContain("OLYMPIAD_CHECKOUT_KIND");
    expect(core).toContain("PLAN_CHECKOUT_KIND");
    // And an outstanding-checkout lookup is scoped by kind, or the subscribe
    // page would offer to finish paying for a package.
    expect(core).toContain("findOutstandingSession(parentProfileId, studentId, PLAN_CHECKOUT_KIND)");
    expect(core).toContain(
      "findOutstandingSession(parentProfileId, studentId, OLYMPIAD_CHECKOUT_KIND)",
    );
  });
});
