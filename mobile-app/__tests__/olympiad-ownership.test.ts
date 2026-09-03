// An olympiad the family PAID FOR must stay on the parent tab — and getting it
// back must not smuggle a purchase button in with it.
//
// THE DEFECT. get_my_olympiad_catalog() filtered on the sales window and grade
// targeting only, with no ownership branch (015:1183-1190). Migration 070 had
// backfilled `sale_ends_at := event_starts_at`, so every package whose event
// date passed went off-sale, and an admin archiving a finished package did the
// same thing deliberately. Either way the package left the parent's screen —
// while the child kept solving it, because can_view_olympiad_package() grants
// access through the purchase branch and never reads `status`. Web was already
// right (it reads purchases first and widens its query by the owned ids); this
// pins the mobile half.
//
// THE OTHER HALF. The owner asked for the Get/Purchase button back. That is the
// one thing that must NOT happen: the parent olympiad tab has been browse-only
// since 2026-08-18 and Apple rejected this app under Guideline 3.1.1 on
// 2026-08-31. So the second block below is a SOURCE-LEVEL guard — a re-added
// CTA is a diff, not a runtime state, and only a source check fails on it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveOlympiadCardState } from "@/features/olympiads/details";
import type { OlympiadPackageRow } from "@/lib/data";

const NOW = Date.parse("2026-08-31T12:00:00Z");
const LAST_YEAR = "2026-01-15T09:00:00Z";
const NEXT_YEAR = "2027-05-20T09:00:00Z";

/** Only the three fields the resolver reads — the rest of the row is irrelevant
 *  to card state and stubbing it would just rot. */
function row(over: Partial<OlympiadPackageRow>): OlympiadPackageRow {
  return {
    is_owned: false,
    is_on_sale: true,
    event_starts_at: null,
    ...over,
  } as unknown as OlympiadPackageRow;
}

const pillKeys = (s: { pills: { key: string }[] }) => s.pills.map((p) => p.key);

describe("an owned package that is no longer on sale reads as OWNED", () => {
  it("shows the owned pill and NOT the sales-ended pill", () => {
    const state = resolveOlympiadCardState(
      row({ is_owned: true, is_on_sale: false, event_starts_at: LAST_YEAR }),
      false,
      NOW,
    );
    expect(pillKeys(state)).toEqual(["owned", "held"]);
  });

  it("still reports the underlying facts so nothing has to re-derive them", () => {
    const state = resolveOlympiadCardState(
      row({ is_owned: true, is_on_sale: false, event_starts_at: LAST_YEAR }),
      false,
      NOW,
    );
    expect(state.owned).toBe(true);
    expect(state.onSale).toBe(false);
    expect(state.past).toBe(true);
  });

  it("never labels an owned row 'sales ended'", () => {
    const state = resolveOlympiadCardState(
      row({ is_owned: true, is_on_sale: false }),
      false,
      NOW,
    );
    expect(pillKeys(state)).not.toContain("notOnSale");
  });

  it("takes ownership from the purchases query too, for a pre-163 database", () => {
    // The old RPC returned neither flag: `is_on_sale` defaults to true (every
    // row it returned WAS on sale) and `is_owned` to false, so the parent tab's
    // own purchases read is what has to carry the pill.
    const state = resolveOlympiadCardState(row({}), true, NOW);
    expect(pillKeys(state)).toEqual(["owned"]);
  });
});

describe("the other card states", () => {
  it("a live listing carries no pill at all", () => {
    const state = resolveOlympiadCardState(
      row({ event_starts_at: NEXT_YEAR }),
      false,
      NOW,
    );
    expect(pillKeys(state)).toEqual([]);
  });

  it("an unowned withdrawn package says its sales ended", () => {
    const state = resolveOlympiadCardState(
      row({ is_on_sale: false, event_starts_at: NEXT_YEAR }),
      false,
      NOW,
    );
    expect(pillKeys(state)).toEqual(["notOnSale"]);
  });

  it("a held event is 'past' independently of the sale state", () => {
    const state = resolveOlympiadCardState(
      row({ event_starts_at: LAST_YEAR }),
      false,
      NOW,
    );
    expect(pillKeys(state)).toEqual(["held"]);
  });

  it("an undated package is never 'past'", () => {
    expect(resolveOlympiadCardState(row({}), false, NOW).past).toBe(false);
  });

  it("an unparseable event date is never 'past'", () => {
    // Date.parse returns NaN, and NaN <= now is false — assert it rather than
    // trust it, because a `!Number.isFinite` slip would silently mark every
    // package held.
    expect(
      resolveOlympiadCardState(row({ event_starts_at: "not-a-date" }), false, NOW).past,
    ).toBe(false);
  });

  it("every pill carries an i18n KEY, never literal text", () => {
    const state = resolveOlympiadCardState(
      row({ is_owned: true, is_on_sale: false, event_starts_at: LAST_YEAR }),
      false,
      NOW,
    );
    for (const p of state.pills) {
      expect(p.labelKey).toMatch(/^(poly|oly4)\.[a-zA-Z.]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// STORE-COMPLIANCE REGRESSION GUARD
// ---------------------------------------------------------------------------
const TAB = readFileSync(
  resolve(__dirname, "..", "src", "app", "(parent)", "(tabs)", "olympiads.tsx"),
  "utf8",
);

/** The scan runs on CODE, not on prose. The file's own header explains the ban
 *  by naming the banned things ("no price chip, no \"Əldə et\" button"), so a
 *  scan over the raw text would fail on the documentation of the rule it is
 *  enforcing — and the obvious fix, deleting the explanation, is the worst
 *  possible outcome. Comments are stripped; strings and JSX are not. */
const CODE = TAB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Source tokens that would mean a purchase affordance is back. Each is paired
 *  with what it would actually be, so a failure reads as a compliance finding
 *  rather than a mystery regex. */
const BANNED: [RegExp, string][] = [
  [/purchase_olympiad|purchaseOlympiad/, "the purchase RPC"],
  [/checkout|Checkout/, "a checkout flow"],
  [/\bpoly\.buy\b|\boly\.buy\b|buyLabel|buyCta/, "a buy CTA string"],
  [/price_amount|priceText|formatAzn|formatPrice/, "a rendered price"],
  [/\bAZN\b|₼/, "a currency"],
  [/Əldə et|Satın al|Abunə ol/i, "an az purchase CTA"],
  [/\bBuy\b|\bSubscribe\b|\bPurchase now\b/, "an en purchase CTA"],
  [/Купить|Подписаться/i, "a ru purchase CTA"],
  [/openBuy|handleBuy|handlePurchase|setBuying|onPurchase/, "a buy handler"],
  [/olympiq\.ai/i, "the website URL — steering a parent out to pay"],
  [/Linking\.openURL|WebView|openBrowserAsync/, "an out-of-app payment route"],
];

describe("the parent olympiad tab is still browse-only", () => {
  for (const [re, what] of BANNED) {
    it(`contains no ${what}`, () => {
      expect(re.test(CODE)).toBe(false);
    });
  }

  it("offers exactly two button titles, and neither of them sells", () => {
    // Structural, not lexical: a new <Button title={t("…")}> is how a CTA would
    // actually arrive, whatever it were called. Ətraflı and Bağla are the only
    // actions this tab is allowed to have. (Scoped to <Button> on purpose —
    // GateNotice/EmptyState also take a `title`, and those are headings.)
    const titles = [...CODE.matchAll(/<Button[\s\S]{0,400}?title=\{t\("([^"]+)"\)\}/g)].map(
      (m) => m[1],
    );
    expect(titles.sort()).toEqual(["poly.details", "poly.modal.close"]);
  });

  it("uses no i18n key that reads like a purchase", () => {
    // Covers the case where the CTA arrives under a name none of the literal
    // patterns above anticipated.
    const keys = [...CODE.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
    const selling = keys.filter((k) => /buy|purchase|price|subscribe|checkout|pay/i.test(k));
    expect(selling).toEqual([]);
  });

  it("offers no empty-state action other than Add child", () => {
    const labels = [...CODE.matchAll(/label:\s*t\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(labels).toEqual(["poly.addChild"]);
  });

  it("keeps stating that packages are not obtained in the app", () => {
    // The one constant, mode-independent fact this tab prints. Deleting it is
    // how "why is there no button?" turns back into a button.
    expect(CODE).toContain('t("mob.oly.notInApp")');
  });

  it("keeps the browse-only contract in the file header", () => {
    expect(TAB.slice(0, 1600)).toContain("BROWSE-ONLY");
  });
});
