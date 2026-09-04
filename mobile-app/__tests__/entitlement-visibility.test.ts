// WHAT A FAMILY WHO HAS JUST PAID SEES — the two places the app could contradict
// itself about a purchase, pinned so neither drifts back.
//
//   1. ONE RPC, ONE PARSE. my_accessible_subjects() is read in two places: the
//      arena gate (features/arena/queries.ts), which decides whether a child is
//      shown the LOCKED screen, and the Tests home (features/tests/api.ts),
//      which decides which subjects they may open. They used to decode its rows
//      separately and disagreed about the row-OBJECT form — both correct against
//      today's `returns setof uuid`, and one `returns table(...)` away from the
//      arena falling closed on a paying child while the Tests tab of the SAME
//      session listed their subjects.
//   2. A BOUGHT SUBJECT LEAVES THE OFFER LIST AT ONCE. The screens' entitlement
//      read refetches after a purchase while already holding data, so it never
//      goes back to `pending` and their loading guard does not cover that
//      window. Without the panel's own optimistic set, the row a parent just
//      bought keeps its price button and a second tap earns the server's
//      double-billing refusal in the danger colour, under the green "done" line.
//
// The second group is SOURCE-LEVEL on purpose (the idiom of
// iap-store-boundary.test.ts): rendering the panel would need a component
// renderer this project does not depend on, and these are properties of the
// diff — a regression should surface in review, not in a rejection weeks later.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseAccessibleSubjectIds } from "../src/lib/coverage";

const SRC = resolve(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");

describe("parseAccessibleSubjectIds reads every encoding the RPC could hand back", () => {
  it("reads the bare uuid array PostgREST returns today", () => {
    expect(parseAccessibleSubjectIds(["a", "b"])).toEqual(["a", "b"]);
  });

  it("reads the row-object form a `returns table(...)` would produce", () => {
    // The encoding change is one migration away, and the ARENA is the reader
    // that would have fallen closed on it — the one that tells a child they are
    // locked out.
    expect(parseAccessibleSubjectIds([{ subject_id: "a" }, { subject_id: "b" }])).toEqual([
      "a",
      "b",
    ]);
  });

  it("drops a row it cannot read rather than trusting it", () => {
    expect(parseAccessibleSubjectIds(["a", null, 7, {}, { id: null }, ""])).toEqual(["a"]);
  });

  it("answers [] for a payload that is not a list", () => {
    // An access read fails CLOSED: a malformed answer must never invent access.
    expect(parseAccessibleSubjectIds(null)).toEqual([]);
    expect(parseAccessibleSubjectIds({ rows: ["a"] })).toEqual([]);
  });
});

describe("both readers of my_accessible_subjects share that parse", () => {
  const CALLERS = walk(SRC).filter((p) =>
    /rpc\(\s*["']my_accessible_subjects["']/.test(readFileSync(p, "utf8")),
  );

  it("is read in the two child-side gates and nowhere else", () => {
    expect(CALLERS.map(rel).sort()).toEqual([
      "features/arena/queries.ts",
      "features/tests/api.ts",
    ]);
  });

  for (const caller of CALLERS) {
    it(`${rel(caller)} decodes the rows through lib/coverage`, () => {
      const code = readFileSync(caller, "utf8");
      // A caller that hand-rolled the parse again is exactly the divergence
      // this file exists to prevent.
      expect(code.includes("parseAccessibleSubjectIds(")).toBe(true);
      expect(/from\s+["']@\/lib\/coverage["']/.test(code)).toBe(true);
    });
  }
});

describe("the purchase panel withdraws what it has just sold", () => {
  const panel = readFileSync(join(SRC, "features", "iap", "IapPanel.tsx"), "utf8");

  it("renders the filtered list, never the raw offers prop", () => {
    expect(panel.includes("visibleOffers.map(")).toBe(true);
    expect(/\boffers\.map\(/.test(panel)).toBe(false);
  });

  it("withdraws an offer only on a GRANT", () => {
    // `recorded` grants nothing, `deferred` is waiting on the family organiser
    // and `pending` could not be confirmed. Hiding a purchase button on any of
    // those would delete a sale that has not happened — the one direction an
    // offer filter must never fail in. `recorded` is NOT the App Review answer:
    // the reviewer buys in SANDBOX and the server grants sandbox purchases by
    // default (APPLE_IAP_SANDBOX_GRANTS), so review sees `granted`. `recorded`
    // is what sandbox becomes once that switch is off.
    expect(/result\.status === "granted"/.test(panel)).toBe(true);
  });

  it("remembers WHICH child it sold to", () => {
    // The subscription tab keeps this panel mounted while the parent switches
    // child chips, so an unscoped set would hide a subject from a sibling who
    // bought nothing.
    expect(panel.includes("sold.studentProfileId === studentProfileId")).toBe(true);
  });

  it("scopes the outcome line to the child it belongs to", () => {
    // Same mount, same hazard: an unscoped outcome renders a green "payment
    // complete" — or a red failure — under a SIBLING's price buttons.
    expect(panel.includes("settled.studentProfileId === studentProfileId")).toBe(true);
    expect(/const \[outcome, setOutcome\]/.test(panel)).toBe(false);
  });
});
