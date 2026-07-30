// src/lib/policyContent.ts is a PORT of web-app/src/lib/policyContent.ts, and
// the privacy screen renders the SAME catalog strings the web page renders. Two
// things therefore have to hold, and neither is checked by the type system:
//
//   1. the parser behaves like its web twin (same splitting, same row
//      normalisation), and
//   2. the synced az/en/ru copies of every table key still have the same shape.
//
// (2) matters more on mobile than it does on the web. The web draws a real
// <table>, so a row with a missing cell is merely ugly. The mobile renderer
// stacks each row and pairs cell[i] with head[i] — a language that lost a
// column would silently label a value with the WRONG heading, which in a legal
// document about children's data is a false statement rather than a layout bug.
import {
  POLICY_TEXT_MAX,
  toPolicyLines,
  toPolicyList,
  toPolicyTable,
} from "@/lib/policyContent";
import { messages } from "@/i18n/messages.generated";

const LOCALES = ["az", "en", "ru"] as const;

describe("toPolicyLines / toPolicyList", () => {
  it("trims, drops blank lines and survives empty input", () => {
    expect(toPolicyLines("  a  \n\n\n  b \n   \n c")).toEqual(["a", "b", "c"]);
    expect(toPolicyLines("")).toEqual([]);
    expect(toPolicyLines(null)).toEqual([]);
    expect(toPolicyLines(undefined)).toEqual([]);
  });

  it("normalises CRLF and lone CR, so no invisible \\r survives into a cell", () => {
    expect(toPolicyLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
    expect(toPolicyTable("H1 | H2\r\nv1 | v2").rows).toEqual([["v1", "v2"]]);
  });

  // Mirrored verbatim in web-app/src/lib/__tests__/policyContent.test.ts — the
  // two modules must bound and normalise input identically, or one admin
  // "Website Content" override becomes two different legal texts.
  it("bounds oversized input at POLICY_TEXT_MAX", () => {
    const lines = toPolicyLines("x".repeat(POLICY_TEXT_MAX + 500));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(POLICY_TEXT_MAX);
  });

  it("never truncates inside a surrogate pair", () => {
    const lines = toPolicyLines("y".repeat(POLICY_TEXT_MAX - 1) + "😀");
    expect(lines[0]).toHaveLength(POLICY_TEXT_MAX - 1);
    expect(lines[0]).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("toPolicyList is the same function under a name that reads at the call site", () => {
    expect(toPolicyList).toBe(toPolicyLines);
  });
});

describe("toPolicyTable", () => {
  it("takes the first line as the header and splits cells on |", () => {
    const { head, rows } = toPolicyTable("Data | Required | Why\nName | Yes | To greet you");
    expect(head).toEqual(["Data", "Required", "Why"]);
    expect(rows).toEqual([["Name", "Yes", "To greet you"]]);
  });

  it("pads a short row and truncates a long one to the header width", () => {
    const { rows } = toPolicyTable("A | B | C\nonly-one\n1 | 2 | 3 | 4");
    expect(rows).toEqual([
      ["only-one", "", ""],
      ["1", "2", "3"],
    ]);
  });

  it("returns an empty table for empty input rather than throwing", () => {
    expect(toPolicyTable("")).toEqual({ head: [], rows: [] });
    expect(toPolicyTable(null)).toEqual({ head: [], rows: [] });
    // Header with no body rows: the renderer skips it instead of drawing a
    // headless card.
    expect(toPolicyTable("H1 | H2")).toEqual({ head: ["H1", "H2"], rows: [] });
  });
});

// The keys the privacy screen feeds to <PolicyTable>. Kept explicit so adding a
// table to the screen without adding it here is a visible omission.
const TABLE_KEYS = [
  "privacy.s4.parentTable",
  "privacy.s4.childTable",
  "privacy.s4.techTable",
  "privacy.s5.lb1Table",
  "privacy.s5.avatarTable",
  "privacy.s7.table",
  "privacy.s9.survivesTable",
  "privacy.s11.table",
  "privacy.s12.table",
];

// The keys fed to <PolicyList>.
const LIST_KEYS = [
  "privacy.s1.do",
  "privacy.s1.dont",
  "privacy.s3.points",
  "privacy.s4.deviceList",
  "privacy.s4.cookiesList",
  "privacy.s5.never",
  "privacy.s5.removeList",
  "privacy.s6.use",
  "privacy.s6.not",
  "privacy.s7.other",
  "privacy.s8.list",
  "privacy.s9.erased",
  "privacy.s10.list",
];

describe("synced privacy catalog", () => {
  it.each(TABLE_KEYS)("%s has the same grid in az, en and ru", (key) => {
    // locale → "<columns>x<rows>", so a failure prints which language drifted
    // and in which direction instead of just "expected 3, got 2".
    const shape = Object.fromEntries(
      LOCALES.map((l) => {
        const { head, rows } = toPolicyTable(messages[l][key]);
        return [l, `${head.length}x${rows.length}`];
      }),
    );

    // Every language must actually HAVE the table — an az-only table renders
    // as nothing at all for an en/ru reader, and a 1-column or 0-row parse
    // means the "cell | cell" separators were lost in translation.
    const { head, rows } = toPolicyTable(messages.az[key]);
    expect(head.length).toBeGreaterThan(1);
    expect(rows.length).toBeGreaterThan(0);

    expect(shape).toEqual({ az: shape.az, en: shape.az, ru: shape.az });
  });

  it.each(LIST_KEYS)("%s has the same item count in az, en and ru", (key) => {
    const counts = Object.fromEntries(
      LOCALES.map((l) => [l, toPolicyList(messages[l][key]).length]),
    );

    expect(counts.az).toBeGreaterThan(0);
    expect(counts).toEqual({ az: counts.az, en: counts.az, ru: counts.az });
  });
});
