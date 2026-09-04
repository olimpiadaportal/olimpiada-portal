// THE BOUNDARIES AROUND THE APPLE RAIL, checked at source level.
//
// Three of them, and each one is a rejection or a regression if it slips:
//
//   1. ANDROID STAYS PURCHASE-SILENT. Google's consumption-only test is
//      app-wide and this single binary serves the parent tabs and the child
//      tabs alike, so every purchase affordance must sit behind the build-time
//      platform constant. Not behind a payment mode, not behind a feature flag:
//      a purchase flow in a store binary switchable from a server is Apple
//      2.3.1(a), and that penalty is account termination.
//   2. ONE StoreKit SEAM. expo-iap may be imported in exactly one file, so
//      Android has one thing to exclude and a future Google rail has one place
//      to live.
//   3. NO PRICE IN OUR SOURCE. Apple owns the amount. A number or a currency
//      token in this module would be wrong in most storefronts the day it was
//      typed and wrong everywhere the day a tier changes.
//
// Source-level on purpose: these are properties of the DIFF, so a regression
// shows up in review and in this failure rather than in a rejection weeks later.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildOffers, sellableProductIds } from "../src/features/iap/catalog";
import { mobileMessages } from "../src/i18n/messages.mobile";
import type { IapCatalogRow, StoreProduct } from "../src/features/iap/types";

// catalog.ts builds the Supabase client at module scope and the client refuses
// to construct without env. Nothing here touches the network — only the pure
// merge functions are exercised.
jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));

const SRC = resolve(__dirname, "..", "src");
const IAP_DIR = join(SRC, "features", "iap");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const ALL_FILES = walk(SRC);
const IAP_FILES = walk(IAP_DIR);
const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");

/** Source with comments removed — for assertions about CODE, not prose. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("expo-iap lives behind exactly one seam", () => {
  it("is imported in exactly one file, and that file is the store", () => {
    const importers = ALL_FILES.filter((p) =>
      /(from\s+["']expo-iap["']|require\(\s*["']expo-iap["']\s*\))/.test(readFileSync(p, "utf8")),
    ).map(rel);
    expect(importers).toEqual(["features/iap/store.ts"]);
  });

  it("keeps the seam inside one directory", () => {
    const outside = IAP_FILES.map(rel).filter((p) => !p.startsWith("features/iap/"));
    expect(outside).toEqual([]);
  });

  it("is never driven from outside the module", () => {
    // Screens call the panel and the restore button; nothing else may reach for
    // the flows or the store object directly.
    const offenders = ALL_FILES.filter((p) => !rel(p).startsWith("features/iap/"))
      .filter((p) => /\b(runPurchase|runRestore|appleStore)\b/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("the platform gate is a build-time constant", () => {
  it("is defined once, as Platform.OS", () => {
    const platform = readFileSync(join(IAP_DIR, "platform.ts"), "utf8");
    expect(codeOnly(platform).includes('Platform.OS === "ios"')).toBe(true);
  });

  it("is never derived from a server value", () => {
    // The rail must not consult the payment mode, the commerce posture, the
    // config RPC or a feature flag. Any of those would make a store binary's
    // purchase surface switchable from a database row.
    const offenders = IAP_FILES.filter((p) =>
      /useMobileConfig|resolvePosture|posture\.|payment\.mode|feature_flags|flags\./.test(
        codeOnly(readFileSync(p, "utf8")),
      ),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("neutralises the payment-state sentence instead of rendering it", () => {
    // The server's kill switch answers `gate.paymentsOff` — the exact string
    // Apple rejected the 2026-08-26 build over. The refusal is honoured; the
    // wording is swapped for the neutral catalogue key. (That no screen calls
    // t("gate.paymentsOff") directly is pinned by no-payment-state.test.ts.)
    const keys = codeOnly(readFileSync(join(IAP_DIR, "errorKeys.ts"), "utf8"));
    expect(/"gate\.paymentsOff":\s*"iap\.err\.unavailable"/.test(keys)).toBe(true);
  });
});

describe("Android shows no purchase affordance at all", () => {
  const SCREENS = [
    join(SRC, "app", "(parent)", "(tabs)", "subscription.tsx"),
    join(SRC, "app", "(parent)", "children", "[id]", "subscribe.tsx"),
  ];

  for (const screen of SCREENS) {
    const name = rel(screen);
    const code = codeOnly(readFileSync(screen, "utf8"));

    it(`${name}: every purchase element sits behind the platform guard`, () => {
      const uses = (code.match(/<IapPanel|<RestoreAccessButton/g) ?? []).length;
      // POSITIVE guards only. `!IAP_PLATFORM_SUPPORTED ? (` gates the
      // Android-only sentence below and contains this same substring, so
      // without the lookbehind it is counted as if it guarded a purchase
      // element and the two totals diverge for the wrong reason.
      const guards = (code.match(/(?<!!)IAP_PLATFORM_SUPPORTED \? \(/g) ?? []).length;
      // One guard per element. A bare element would make the counts diverge.
      expect(guards).toBe(uses);
    });

    it(`${name}: the "not managed in this app" sentence is ANDROID-ONLY`, () => {
      // On Android the sentence is true and policy-safe: the build is
      // consumption-only by Google's rules and it points nowhere.
      //
      // On iOS the same sentence is a written 3.1.1 CONFESSION shown to the
      // reviewer, and it used to render there whenever the catalogue came back
      // empty — which is exactly the state a forgotten activation leaves us in,
      // with no other visible symptom. iOS now renders nothing instead; the
      // obvious alternative ("not available right now") is the 2.1.0 App
      // Completeness rejection this app already took in August.
      const line = code
        .split("\n")
        .find((l) => /t\(\s*["']mob\.pay\.notInApp["']/.test(l));
      expect(line).toBeTruthy();

      // Walk back to the conditional that decides whether it renders.
      const idx = code.indexOf(String(line));
      const preceding = code.slice(Math.max(0, idx - 400), idx);
      const gate = preceding.slice(preceding.lastIndexOf("{"));
      expect(gate).toContain("IAP_PLATFORM_SUPPORTED");
    });

    it(`${name}: actually renders the purchase surface on iOS`, () => {
      // The other half of the same guarantee — a screen that guards nothing
      // because it renders nothing would pass the check above.
      expect(uses(code)).toBeGreaterThan(0);
    });

    it(`${name}: still carries the unchanging Android sentence`, () => {
      expect(/t\(\s*["']mob\.pay\.notInApp["']/.test(code)).toBe(true);
    });
  }

  function uses(code: string): number {
    return (code.match(/<IapPanel|<RestoreAccessButton/g) ?? []).length;
  }

  it("the restore control exists at all — Apple requires it", () => {
    // Its ABSENCE is itself a rejection reason, so its presence is pinned here
    // rather than left to whoever next tidies a screen.
    const usedIn = ALL_FILES.filter((p) => /<RestoreAccessButton/.test(readFileSync(p, "utf8"))).map(
      rel,
    );
    expect(usedIn.length).toBeGreaterThan(0);
  });
});

describe("no price is written anywhere in this module", () => {
  // Apple owns the amount. `displayPrice` arrives from StoreKit already
  // localised and is rendered verbatim; the app must hold no number it could
  // format, and no formatter it could reach for.
  const BANNED: [RegExp, string][] = [
    [/₼|€|£|₽|¥|₺/u, "a currency symbol"],
    [/\b(AZN|USD|EUR|GBP|TRY|RUB)\b/, "a currency code"],
    [/\bmanat\b/i, "a currency word"],
    [/\btoFixed\b/, "a number formatter"],
    [/\bNumberFormat\b/, "a number formatter"],
    [/\bcurrency\s*:/, "a currency field being written"],
    [/\d+[.,]\d{2}\b/, "a decimal amount"],
  ];

  for (const file of IAP_FILES) {
    it(`${rel(file)} holds no amount`, () => {
      const code = codeOnly(readFileSync(file, "utf8"));
      const hits = BANNED.filter(([p]) => p.test(code)).map(([, why]) => why);
      expect(hits).toEqual([]);
    });
  }

  it("renders StoreKit's own string as the button label", () => {
    const panel = codeOnly(readFileSync(join(IAP_DIR, "IapPanel.tsx"), "utf8"));
    expect(panel.includes("title={o.displayPrice}")).toBe(true);
  });

  it("passes the price through the catalogue untouched", () => {
    const catalog: IapCatalogRow[] = [
      {
        productId: "p.month",
        scope: "subject",
        subjectId: "s1",
        packageId: null,
        interval: "month",
        subjectCode: "math",
        subjectName: "Riyaziyyat",
      },
    ];
    const products: StoreProduct[] = [
      { id: "p.month", displayPrice: "9,99 ₼", title: "Maths, one month" },
    ];
    expect(buildOffers(catalog, products, [])[0]?.displayPrice).toBe("9,99 ₼");
  });
});

describe("only priced, sellable, uncovered subject products are offered", () => {
  const row = (over: Partial<IapCatalogRow>): IapCatalogRow => ({
    productId: "p",
    scope: "subject",
    subjectId: "s1",
    packageId: null,
    interval: "month",
    subjectCode: "math",
    subjectName: "Riyaziyyat",
    ...over,
  });

  it("drops a product StoreKit could not price", () => {
    // Otherwise the screen would show a purchase button with no price on it.
    expect(buildOffers([row({})], [], [])).toEqual([]);
  });

  it("drops a subject the child already holds", () => {
    const products: StoreProduct[] = [{ id: "p", displayPrice: "X", title: null }];
    expect(buildOffers([row({})], products, ["s1"])).toEqual([]);
  });

  it("drops a subject this child's grade does not study", () => {
    // The silent sale: Fizika is taught in grades 7-11, so a grade-3 family
    // could buy it and every child screen — which applies the SAME rule last —
    // then dropped the entitlement it produced. Money in, nothing on screen.
    const products: StoreProduct[] = [{ id: "p", displayPrice: "X", title: null }];
    expect(buildOffers([row({})], products, [], new Set(["s9"]))).toEqual([]);
    expect(buildOffers([row({})], products, [], new Set(["s1"])).length).toBe(1);
  });

  it("keeps a held subject out of the offer list whatever the grade rule says", () => {
    // This list is what may be ADDED, so a held subject is absent from it for
    // its own reason and not as a side effect of the grade rule: both answers
    // below are the covered filter's, and they stay the same when the rule
    // agrees and when it disagrees. The third assertion is the control — it is
    // what makes the two empties above evidence rather than a fixture that
    // could not have produced a row in the first place.
    const products: StoreProduct[] = [{ id: "p", displayPrice: "X", title: null }];
    expect(buildOffers([row({})], products, ["s1"], new Set(["s1"]))).toEqual([]);
    expect(buildOffers([row({})], products, ["s1"], new Set(["s9"]))).toEqual([]);
    expect(buildOffers([row({})], products, [], new Set(["s1"])).length).toBe(1);
  });

  it("filters nothing when the grade rule is unknown", () => {
    // No grade on the record, or a failed read. Hiding the whole catalogue
    // because one RPC hiccuped costs a family the thing they came for — and
    // leaves a store reviewer with no purchase button.
    const products: StoreProduct[] = [{ id: "p", displayPrice: "X", title: null }];
    expect(buildOffers([row({})], products, [], null).length).toBe(1);
    expect(buildOffers([row({})], products, []).length).toBe(1);
  });

  it("never offers an olympiad package here", () => {
    // The olympiad tab is browse-only by an owner decision that survived the
    // 3.1.1 rejection, and a package is grade-targeted — selling one from a
    // screen that never named the grade would take money for nothing.
    const pkg = row({ scope: "olympiad_package", subjectId: null, packageId: "k1", interval: null });
    const products: StoreProduct[] = [{ id: "p", displayPrice: "X", title: null }];
    expect(buildOffers([pkg], products, [])).toEqual([]);
    expect(sellableProductIds([pkg])).toEqual([]);
  });

  it("orders the rows by subject, then shortest period first", () => {
    const rows = [
      row({ productId: "b.year", subjectId: "s2", subjectName: "Zoologiya", interval: "year" }),
      row({ productId: "a.month", subjectId: "s1", subjectName: "Ana dili", interval: "month" }),
      row({ productId: "a.week", subjectId: "s1", subjectName: "Ana dili", interval: "week" }),
    ];
    const products: StoreProduct[] = rows.map((r) => ({
      id: r.productId,
      displayPrice: "X",
      title: null,
    }));
    expect(buildOffers(rows, products, []).map((o) => o.productId)).toEqual([
      "a.week",
      "a.month",
      "b.year",
    ]);
  });
});

describe("every new string ships in all three languages", () => {
  const KEYS = Object.keys(mobileMessages.az).filter((k) => k.startsWith("mob.iap."));

  it("has keys to check at all", () => {
    expect(KEYS.length).toBeGreaterThan(10);
  });

  for (const locale of ["az", "en", "ru"] as const) {
    it(`${locale}: no key is missing or empty`, () => {
      const missing = KEYS.filter((k) => (mobileMessages[locale][k] ?? "").length === 0);
      expect(missing).toEqual([]);
    });

    it(`${locale}: no string carries an amount`, () => {
      // The copy explains what activation IS; the number always comes from
      // StoreKit at runtime.
      const bad = KEYS.filter((k) =>
        /₼|€|£|\b(AZN|USD|EUR)\b|\d+[.,]\d{2}\b/u.test(mobileMessages[locale][k] ?? ""),
      );
      expect(bad).toEqual([]);
    });
  }

  it("says plainly that nothing renews by itself", () => {
    // Our products are NON-RENEWING subscriptions. A family must be told that
    // before they pay, and a reviewer reads it in the same place.
    const missing = (["az", "en", "ru"] as const).filter(
      (l) => (mobileMessages[l]["mob.iap.noRenew"] ?? "").length === 0,
    );
    expect(missing).toEqual([]);
  });
});
