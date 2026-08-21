// EVERY REMAINING ROUTE TO A PAID PLAN WITHOUT A PAYMENT, pinned.
//
// Migration 125 inverted ONE path — the web manage-subjects checkout — so that a
// verified payment causes the plan change. Three doors were still open, and all
// three had the same shape: something reached an APPLY with money owed and no
// money taken. This file pins them shut.
//
//   A  the MOBILE BFF called the apply cores directly, so a parent bearer token
//      reached a full paid plan for free the moment the payment mode became
//      `real`;
//   B  a running TRIAL priced every addition at zero while the apply opened a
//      FULL cycle, so a yearly subject added on day one of a seven-day trial was
//      a free year — with no renewal path that could ever collect it;
//   C  the ADD-CHILD wizard's primary button said "pay now", charged nothing,
//      and printed the plan total under a row captioned "due today";
//   D  a payment whose callback never arrived had no way home, inside a gateway
//      status window that is 24 hours wide and then closes forever.
//
// TWO KINDS OF ASSERTION, and the split is the same one checkout.test.ts makes.
// BEHAVIOUR for the pure predicate that decides whether a signed intent is
// re-used — it can be executed without a bank, a database or a browser. SOURCE
// for the properties that exist only as an arrangement of code: "the mobile
// surface names the free-only RPC", "a trialing add ends at the trial end",
// "the sweep reuses checkout_redeem_plan". Violating one of those leaves
// everything compiling and every other test green, and the failure shows up as
// money charged wrongly, access given away, or a store account terminated.
//
// COMMENTS ARE STRIPPED before every source sweep, for the reason the sibling
// file gives: these modules explain at length what they deliberately do NOT do,
// and a sweep that could not tell a mention from a use would force those
// explanations out of the code that needs them most.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";
import { storedBasketMatches } from "@/lib/planBasket";

const SRC = resolve(process.cwd(), "src");
const REPO = resolve(process.cwd(), "..");
const SQL = join(REPO, "supabase", "sql");

const MOBILE_API = join(SRC, "app", "api", "mobile");
const SUB_CORE = join(SRC, "lib", "auth", "subscriptionCore.ts");
const OLY_CORE = join(SRC, "lib", "auth", "olympiadCore.ts");
const SUB_SERVICE = join(SRC, "lib", "auth", "subscriptionService.ts");
const CHECKOUT_CORE = join(SRC, "lib", "payments", "checkoutCore.ts");
const RECONCILE_CORE = join(SRC, "lib", "payments", "reconcileCore.ts");
const RECONCILE_ROUTE = join(
  SRC, "app", "api", "payments", "azericard", "reconcile", "route.ts",
);
const WIZARD = join(SRC, "components", "AddChildWizard.tsx");
const WIZARD_PAGE = join(SRC, "app", "(parent)", "children", "new", "page.tsx");
const CANONICAL_011 = join(SQL, "011_indexes_constraints_functions_triggers.sql");
const CANONICAL_013 = join(SQL, "013_validation_queries.sql");
const CANONICAL_016 = join(SQL, "016_scheduled_jobs.sql");
const MIGRATION_126 = join(
  SQL, "migrations", "2026_08_20_126_free_only_and_reconcile.sql",
);
const MIGRATION_127 = join(
  SQL, "migrations", "2026_08_21_127_paid_olympiad_and_frozen_price.sql",
);
const OLY_SERVICE = join(SRC, "lib", "auth", "olympiadService.ts");
const CHECKOUT_INTENT = join(SRC, "lib", "payments", "checkoutIntent.ts");
const GATEWAY = join(SRC, "lib", "payments", "azericard", "gateway.ts");

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
// A — a bearer token cannot reach a priced apply
// =============================================================================

describe("the purchase-silent surface cannot buy", () => {
  const mobileFiles = filesUnder(MOBILE_API);

  it("has mobile BFF routes on the app's side of the wire at all", () => {
    // A guard on the guards: every assertion below is a sweep, and a sweep over
    // an empty list passes for the wrong reason.
    expect(mobileFiles.length).toBeGreaterThan(5);
  });

  it("makes every mobile caller of an apply core refuse a priced change", () => {
    // THE FIX, as a rule about call sites. Any route that reaches an apply core
    // must state its posture, and from the app it can only be "refuse".
    const cores = [
      "subscribeChildCore",
      "updateSubscriptionSubjectsCore",
      "purchaseOlympiadForChildCore",
    ];
    const callers: string[] = [];
    for (const file of mobileFiles) {
      const src = code(read(file));
      if (!cores.some((c) => src.includes(`${c}({`))) continue;
      callers.push(relative(REPO, file));
      expect(src, relative(REPO, file)).toContain('paidChanges: "refuse"');
      expect(src, relative(REPO, file)).not.toContain('paidChanges: "allow"');
    }
    // The three routes the audit named: /subscribe, /subjects, /olympiads/purchase.
    expect(callers.length).toBe(3);
  });

  it("names no priced plan RPC anywhere under app/api/mobile", () => {
    // The posture picks a FUNCTION NAME, so a route that wanted the priced
    // behaviour would have to write the priced name. Nothing under the mobile
    // tree may, and that is a thing a reviewer can see in a diff.
    const offenders: string[] = [];
    for (const file of mobileFiles) {
      const src = code(read(file));
      for (const needle of ["create_child_plan", "apply_plan_change", "purchase_olympiad"]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("requires every caller to state a posture — there is no default", () => {
    // A DEFAULT would be the whole defect waiting to come back: a new route
    // would inherit whatever the safe-looking value was on the day it was
    // written. `paidChanges` carries no `?` and no `=`, so TypeScript refuses a
    // call site that has not thought about it.
    for (const file of [SUB_CORE, OLY_CORE]) {
      const src = code(read(file));
      expect(src, relative(REPO, file)).toMatch(/\n\s*paidChanges: PaidChangePosture;/);
      expect(src, relative(REPO, file)).not.toContain("paidChanges?:");
      // ...and no destructuring default either, which is the other way a call
      // site could quietly inherit a posture it never chose.
      expect(src, relative(REPO, file)).not.toMatch(/paidChanges\s*=\s*["']/);
    }
  });

  it("names ONLY the free-only RPCs, on every surface", () => {
    // MIGRATION 127 WENT FURTHER THAN 126, and this is the assertion that says
    // how far. The posture used to SELECT the RPC — priced for the web, free-only
    // for the app — which meant the web still ran the quote-then-apply race:
    // prices, the sibling tier and launch_promo_config.trial_days can all move
    // between a quote and an apply, and READ COMMITTED gives each statement its
    // own snapshot. Both surfaces now name the free-only function
    // unconditionally, so the priced RPCs have NO caller in this codebase at all
    // — they are reached only from inside checkout_redeem_plan, behind a payment
    // the gateway confirmed.
    const src = code(read(SUB_CORE));
    expect(src).toContain('"create_child_plan_if_free"');
    expect(src).toContain('"apply_plan_change_if_free"');
    expect(code(read(OLY_CORE))).toContain('"purchase_olympiad_if_free"');
  });

  it("has no priced apply RPC caller ANYWHERE in the app", () => {
    // The property above, swept over the whole source tree rather than two
    // files. This is what makes "a grant happened" and "a payment happened" the
    // same event by construction: the only thing that can name a priced apply is
    // SQL, inside the redemption function.
    const offenders: string[] = [];
    for (const file of filesUnder(SRC)) {
      if (/__tests__/.test(file)) continue;
      const src = code(read(file));
      for (const priced of ["create_child_plan", "apply_plan_change", "purchase_olympiad"]) {
        if (src.includes('rpc("' + priced + '"') || src.includes("rpc('" + priced + "'")) {
          offenders.push(relative(REPO, file) + " :: " + priced);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("refuses a priced olympiad package BEFORE the RPC, from the app", () => {
    const src = code(read(OLY_CORE));
    const refusalAt = src.indexOf('paidChanges === "refuse"');
    const rpcAt = src.indexOf('rpc("purchase_olympiad_if_free"');
    expect(refusalAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(refusalAt);
    // A price we cannot read is not a price of zero.
    expect(src).toContain("Number.isFinite(amount) && amount <= 0");
  });

  it("keeps the refusal enforced INSIDE the apply's own transaction", () => {
    // A pre-check cannot be made safe from the app server: prices, the sibling
    // tier and launch_promo_config.trial_days can all move between a quote and
    // an apply, and READ COMMITTED gives each statement its own snapshot. Both
    // wrappers therefore call the real function FIRST and raise afterwards,
    // which rolls the apply back.
    const sql = read(MIGRATION_126);
    for (const [wrapper, inner] of [
      ["create_child_plan_if_free", "public.create_child_plan("],
      ["apply_plan_change_if_free", "public.apply_plan_change("],
    ] as const) {
      const body = sqlFunction(sql, wrapper);
      const applyAt = body.indexOf(inner);
      const raiseAt = body.indexOf("raise exception");
      expect(applyAt, wrapper).toBeGreaterThan(-1);
      expect(raiseAt, wrapper).toBeGreaterThan(applyAt);
      expect(body, wrapper).toContain("hint = 'payment_required'");
      // NULL is a refusal, not a zero: an answer we cannot price must never
      // resolve to "so it is probably free".
      expect(body, wrapper).toContain("v_due is null or v_due > 0");
    }
  });

  it("answers a refusal with a trilingual key and never a database message", () => {
    const src = code(read(SUB_CORE));
    expect(src).toContain('const PAID_CHANGE_REFUSED_KEY = "gate.notInApp"');
    expect(src).toContain("isPaymentRequired");
    expect(src).not.toContain("error.message");
  });
});

// =============================================================================
// B — a trial cannot produce a free paid period
// =============================================================================

describe("a trial is a bounded free window, never a free paid period", () => {
  const migration = read(MIGRATION_126);
  const migration127 = read(MIGRATION_127);
  const canonical = read(CANONICAL_011);

  it("ends a trial-time addition at the TRIAL END, not a full cycle", () => {
    // The defect: quote_plan_change priced a trialing add at ZERO and called it
    // "riding the trial", while apply_plan_change anchored it at now() + its
    // FULL cycle. Adding a yearly subject on day one of a seven-day trial
    // therefore bought a year for nothing — repeatable, unrecorded, and
    // uncollectable, because nothing charges at a trial end or a period end.
    for (const [label, sql] of [
      ["migration 127", migration127],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "apply_plan_change"));
      // Inside the ADD loop's period expression. Migration 127 replaced the
      // coalesce chain with the trial end itself, because the predicate it now
      // branches on PROVES that value is non-null and in the future — a legacy
      // trialing row with no dates takes the PAID branch instead, which is the
      // honest answer rather than a zero-length period granted for free.
      expect(body, label).toContain(
        "case when v_trialing\n              then v_sub.trial_ends_at",
      );
    }
  });

  it("counts a trial as running only while its END is in the FUTURE", () => {
    // MIGRATION 127, the other half of the same line. The raw status was read as
    // "a trial is running", and the status is swept by a job rather than by the
    // clock: a subscription whose trial_ends_at had already passed therefore
    // priced every addition at ZERO and applied it as trial-time, for as long as
    // the row stayed stale.
    for (const [label, sql] of [
      ["migration 127", migration127],
      ["canonical 011", canonical],
    ] as const) {
      for (const fn of ["quote_plan_change", "apply_plan_change"] as const) {
        const body = sqlCode(sqlFunction(sql, fn));
        expect(body, label + " " + fn).toContain("v_sub.trial_ends_at > now()");
        // The raw-status branch must be GONE, not merely shadowed.
        expect(body, label + " " + fn).not.toContain("v_sub.status <> 'trialing'");
      }
    }
  });

  it("says the same thing in the quote the parent is shown", () => {
    // The preview and the charge are ONE computation (audit H7) — including the
    // DATES. "Renews in a year" under a subject that dies with the trial is the
    // sentence that made the free-forever add look legitimate.
    for (const [label, sql] of [
      ["migration 127", migration127],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "quote_plan_change"));
      expect(body, label).toContain("when s.state = 'add' and v_trialing");
    }
  });

  it("refuses to open a trial that has already ended", () => {
    // launch_promo_config.trial_days = 0 used to take the `trialing` branch with
    // trial_ends_at = now(): a period that had ALREADY ENDED, while the quote
    // read the same 0 and charged the FULL total.
    for (const [label, sql] of [
      ["migration 126", migration],
      ["canonical 011", canonical],
    ] as const) {
      const body = sqlCode(sqlFunction(sql, "create_child_plan"));
      expect(body, label).toContain("if v_had_any or v_offer <= 0 then");
      // The old branch — on v_had_any ALONE — must be gone, not merely shadowed.
      expect(body, label).not.toContain("v_trial  := (v_q->>'trial_days')::int;");
    }
  });

  it("keeps 013 asserting both halves, so a re-issue cannot undo them", () => {
    // Both fixes are one line inside functions this repository re-issues often.
    // A `create or replace` from an older copy of 011 would undo either in
    // silence, with every other check still green.
    const checks = read(CANONICAL_013);
    expect(checks).toContain("119_purchase_silent_cannot_buy");
    expect(checks).toContain("120_trial_is_not_a_free_paid_period");
    expect(checks).toContain("periods_outliving_their_trial");
    expect(checks).toContain("trials_that_ended_when_they_started");
  });
});

// =============================================================================
// B (continued) — the free half must keep working
// =============================================================================

describe("genuinely free changes still apply with no payment", () => {
  it("refuses only on a PRICE, so removals and reinstatements pass", () => {
    // The reason the zero branch exists at all. A removal, a reinstatement
    // (migration 120), a scheduled cycle change, a giveaway window, an admin
    // free-access interval and a running trial all price at zero — and every one
    // of them is something a parent must be able to do from the app. Never trap
    // a family inside a plan they are trying to leave because the payment rail
    // lives somewhere else.
    const body = sqlFunction(read(MIGRATION_126), "apply_plan_change_if_free");
    const conditions = body.match(/if [^\n]*then/g) ?? [];
    // Exactly two: the idempotent replay short-circuit and the price test.
    // A third would be a rule nobody asked for.
    expect(conditions.length).toBe(2);
    expect(body).toContain("(v_res->>'idempotent')::boolean");
    expect(body).toContain("v_due is null or v_due > 0");
    for (const shouldNotDecide of ["remove_at", "reinstate", "status", "giveaway"]) {
      expect(body, shouldNotDecide).not.toContain(shouldNotDecide);
    }
  });

  it("leaves the giveaway and free-access activation path untouched", () => {
    // activate_child_login_id creates NO subscription row — access during a free
    // window comes from the server-side override — so it is not a plan apply and
    // must not acquire a posture it would only be able to fail.
    const src = code(read(SUB_CORE));
    const at = src.indexOf("export async function activateChildGiveawayCore");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n}", src.indexOf("activate_child_login_id", at)));
    expect(body).not.toContain("paidChanges");
    const route = code(read(join(MOBILE_API, "v1", "children", "[id]", "activate-free", "route.ts")));
    expect(route).not.toContain("paidChanges");
  });

  it("still routes a zero-due web change straight to the apply", () => {
    // The seam migration 125 built. A zero due_now is applied on the spot, and
    // it has to stay that way or a removal would need a payment that does not
    // exist. What changed in 126 is what a ZERO can mean; what changed in 127 is
    // WHO decides it — the RPC, inside the apply's own transaction, instead of
    // this branch a statement earlier.
    const src = code(read(SUB_SERVICE));
    expect(src).toContain("quoted.dueNow > 0");
    expect(src).toContain('paidChanges: "free_only"');
    expect(src).not.toContain('paidChanges: "allow"');
  });
});

// =============================================================================
// C — the Add-Child wizard asks for payment once, honestly
// =============================================================================

describe("the add-child wizard", () => {
  const wizard = read(WIZARD);
  const wizardCode = code(wizard);

  it("prints the amount the gateway is asked for, never the plan total", () => {
    // Audit invariant H7. `total` and `due_now` are DIFFERENT numbers whenever a
    // trial applies, and the row is captioned "due today".
    expect(wizardCode).not.toContain("quote.total");
    expect(wizardCode).toContain("quote.dueNow");
    expect(wizardCode).toContain("dueToday: quote.dueNow");
  });

  it("no longer renders a button that promises a payment it does not make", () => {
    // "İndi ödə" charged nothing: confirming applied the plan and the REAL
    // departure button appeared underneath, so a parent was asked to pay twice
    // and the first ask was a lie.
    expect(wizardCode).not.toContain("pay.payNow");
    expect(wizardCode).toContain("pay.continue");
    expect(wizardCode).toContain("pay.confirmNoCharge");
  });

  it("takes the label from the server quote and disables it until one arrives", () => {
    expect(wizardCode).toContain("const payableNow = !quote || !quote.ok || quote.dueNow > 0");
    expect(wizardCode).toContain("disabled={pending || plan.length === 0 || !quote}");
  });

  it("explains a zero rather than letting it read as free forever", () => {
    expect(wizardCode).toContain("sub.trialNoChargeToday");
  });

  it("has every key it renders in the page's dictionary", () => {
    // A page-scoped dictionary is a KEYS array, and a key missing from it
    // renders as the key itself — in front of a parent, at the payment step.
    const keys = read(WIZARD_PAGE);
    for (const key of ["pay.continue", "pay.confirmNoCharge", "sub.trialNoChargeToday"]) {
      expect(keys, key).toContain(`"${key}"`);
    }
  });
});

// =============================================================================
// D — a lost callback has a way home
// =============================================================================

describe("reconciliation for a payment whose callback never arrived", () => {
  const core = code(read(RECONCILE_CORE));
  const route = code(read(RECONCILE_ROUTE));

  it("redeems through checkout_redeem_plan, never a second copy of it", () => {
    // Everything that makes redemption safe — the row lock, `status = 'paid'`
    // required, the re-price against the amount the gateway confirmed,
    // redeemed_at written in the same transaction as the apply — lives in that
    // function. A sweep that re-implemented any of it would be a second answer
    // to "did this money become a plan?".
    expect(core).toContain("redeemPlanCheckout");
    for (const forbidden of [
      "create_child_plan",
      "apply_plan_change",
      "entitlement",
      "access_status",
    ]) {
      expect(core, forbidden).not.toContain(forbidden);
    }
  });

  it("believes only an answer to a query this server initiated", () => {
    expect(core).toContain("queryTransactionStatus");
    // The gateway's verdict reaches the ledger through recordOutcome, which
    // decides from `reconciliation` alone. There is no callback here to fall
    // back on — that absence is the entire problem being solved.
    expect(core).toContain("shape: null");
    expect(core).toContain("recorded.outcome !== \"approved\"");
  });

  it("grants nothing when it cannot establish what happened", () => {
    // A failed status query, a mismatched answer, an unrecordable outcome: all
    // fall through to `unresolved`, leaving the session pending for the next
    // pass while the 24-hour window is still open.
    expect(core).toContain("if (!status.ok)");
    expect(core).toContain("summary.unresolved++");
    // ...and never invents a verdict of its own.
    expect(core).not.toContain("needs_review");
  });

  it("is bounded, and logs counts rather than identifiers", () => {
    expect(core).toContain("RECONCILE_BATCH");
    // A job that runs every few minutes forever is a place order ids and
    // amounts would accumulate in a log.
    expect(core).toContain("reconciliation queried=");
    expect(core).not.toContain("${order}");
  });

  it("is closed when its secret is unset, on both entrypoints", () => {
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("if (!RECONCILE_KEY || !provided) return false;");
    expect(route).toContain("if (!CRON_SECRET || !authorization) return false;");
    // No user session, and nothing the caller can steer the sweep with.
    expect(route).not.toContain("requireParent");
    expect(route).not.toContain("readJsonBody");
    expect(route).not.toContain("searchParams");
  });

  it("has a pg_cron backstop that skips cleanly where pg_cron is absent", () => {
    const jobs = read(CANONICAL_016);
    expect(jobs).toContain("olympiq_checkout_redeem_sweep");
    expect(jobs).toContain("select public.checkout_redeem_sweep(50);");
    // Inside the file's single `if v_has_cron then` branch — the else arm is the
    // documented skip, and a job scheduled outside it would break a from-zero
    // rebuild on a plain PostgreSQL.
    const guardAt = jobs.indexOf("if v_has_cron then");
    const elseAt = jobs.indexOf("\n  else\n", guardAt);
    const jobAt = jobs.indexOf("olympiq_checkout_redeem_sweep");
    expect(guardAt).toBeGreaterThan(-1);
    expect(jobAt).toBeGreaterThan(guardAt);
    expect(jobAt).toBeLessThan(elseAt);
  });

  it("is not reachable from any mobile route", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(MOBILE_API)) {
      const src = code(read(file));
      for (const needle of ["reconcileCore", "reconcilePendingCheckouts"]) {
        if (src.includes(needle)) offenders.push(`${relative(REPO, file)} :: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// =============================================================================
// E — opening an intent is limited, and does not mint a row per click
// =============================================================================

describe("opening a checkout", () => {
  const core = code(read(CHECKOUT_CORE));

  it("draws on the SAME rate-limit budget as the resume path beside it", () => {
    expect(core).toContain("rateLimitAllow(CHECKOUT_RATE_SCOPE, parentProfileId");
    const service = code(read(join(SRC, "lib", "payments", "checkoutService.ts")));
    expect(service).toContain("rateLimitAllow(CHECKOUT_RATE_SCOPE, parent.profileId");
    // One scope literal, defined once — two buckets would let a caller take the
    // full allowance twice by alternating between the two screens.
    expect(core).toContain('export const CHECKOUT_RATE_SCOPE = "checkoutstart"');
  });

  it("re-signs a pending intent for the same basket instead of minting another", () => {
    const openAt = core.indexOf("openPlanIntent({ studentId, kind, items })");
    const reuseAt = core.indexOf("matchesRequestedIntent(");
    expect(reuseAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(reuseAt);
    // Re-use never carries the old amount forward: the session is re-priced
    // before it is signed, so re-use can change the order id and nothing else.
    expect(core).toContain("repricePlanIntent(open.order)");
  });

  // ---- the behavioural half: which baskets count as the same purchase -------

  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const stored = (pairs: [string, string][]) =>
    pairs.map(([subject_id, interval]) => ({ subject_id, interval }));

  it("matches the same pairs in any order", () => {
    expect(
      storedBasketMatches(stored([[A, "month"], [B, "year"]]), [
        { subjectId: B, interval: "year" },
        { subjectId: A, interval: "month" },
      ]),
    ).toBe(true);
  });

  it("refuses a changed cycle — it is a different purchase at a different price", () => {
    expect(
      storedBasketMatches(stored([[A, "month"]]), [{ subjectId: A, interval: "year" }]),
    ).toBe(false);
  });

  it("refuses a changed, added or removed subject", () => {
    expect(
      storedBasketMatches(stored([[A, "month"]]), [{ subjectId: B, interval: "month" }]),
    ).toBe(false);
    expect(
      storedBasketMatches(stored([[A, "month"]]), [
        { subjectId: A, interval: "month" },
        { subjectId: B, interval: "month" },
      ]),
    ).toBe(false);
    expect(
      storedBasketMatches(stored([[A, "month"], [B, "month"]]), [
        { subjectId: A, interval: "month" },
      ]),
    ).toBe(false);
  });

  it("does not let a duplicated pair stand in for a missing one", () => {
    // [A, A] and [A, B] are both length two and both collapse to a set the
    // other's members test true against. The length-vs-set check is what stops
    // a stored basket for two subjects being re-signed for a basket of one.
    expect(
      storedBasketMatches(stored([[A, "month"], [A, "month"]]), [
        { subjectId: A, interval: "month" },
        { subjectId: B, interval: "month" },
      ]),
    ).toBe(false);
  });

  it("refuses anything it cannot read, rather than guessing", () => {
    const want = [{ subjectId: A, interval: "month" }];
    for (const hostile of [
      null,
      undefined,
      "",
      0,
      {},
      [],
      [{ subject_id: A }],
      [{ interval: "month" }],
      [{ subject_id: 7, interval: "month" }],
      [{ subject_id: A, interval: null }],
    ]) {
      expect(storedBasketMatches(hostile, want), JSON.stringify(hostile) ?? "undefined").toBe(
        false,
      );
    }
  });
});

// =============================================================================
// Copy — trilingual, and legal in a store binary
// =============================================================================

describe("the refusal a parent reads in the app", () => {
  it("exists in az, en and ru", () => {
    for (const locale of locales) {
      const value = (messages as Record<string, Record<string, string>>)[locale]?.[
        "gate.notInApp"
      ];
      expect(value, `${locale} gate.notInApp`).toBeTruthy();
      expect(value.length, `${locale} gate.notInApp`).toBeGreaterThan(20);
    }
  });

  it("names no price, no destination and no purchase verb", () => {
    // docs/STORE_PAYMENTS_COMPLIANCE.md §5. "Manage it on your web account" is
    // specifically the WRONG form (finding I6) — it is the sentence an App Store
    // reviewer screenshots, and it reads as a call to action without a link.
    // This string is a FACT about where subscriptions are managed.
    for (const locale of locales) {
      const value = (messages as Record<string, Record<string, string>>)[locale][
        "gate.notInApp"
      ].toLowerCase();
      for (const banned of [
        "azn",
        "olympiq.ai",
        "http",
        "veb",
        "web",
        "сайт",
        "alın",
        "buy",
        "purchase",
        "subscribe",
        "abunə ol",
        "купи",
        "оплат",
      ]) {
        expect(value.includes(banned), `${locale} contains "${banned}"`).toBe(false);
      }
    }
  });

  it("is a key the mobile catalog will carry, and no web-only checkout string", () => {
    // The mobile catalog is GENERATED from this file, so a `gate.*` key crosses
    // and a `checkout.*` key must never be rendered over there. This is the one
    // new shared key: after merging, `cd mobile-app && npm run sync-i18n`.
    expect(Object.keys(messages.az)).toContain("gate.notInApp");
    expect("gate.notInApp".startsWith("checkout.")).toBe(false);
  });
});
