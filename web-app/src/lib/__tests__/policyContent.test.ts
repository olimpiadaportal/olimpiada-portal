// Two jobs:
//   1. lock the parser contract for the long-form legal copy, and
//   2. prove the privacy policy really is ONE document in THREE languages.
//
// (2) is the point. The policy exists as az/en/ru strings that a future edit
// will touch one at a time, and a policy that says different things to
// different regulators is a legal problem, not a cosmetic one. These checks
// fail the build the moment a language falls behind: a missing key, an empty
// value, a table that lost a column or a row.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  POLICY_TEXT_MAX,
  toPolicyLines,
  toPolicyList,
  toPolicyTable,
} from "@/lib/policyContent";
import { messages } from "@/i18n/messages";
import { locales, defaultLocale } from "@/i18n/config";

describe("toPolicyLines / toPolicyList", () => {
  it("returns one entry per non-blank line, trimmed", () => {
    expect(toPolicyLines("  first \n second\n")).toEqual(["first", "second"]);
  });

  it("drops blank lines instead of emitting empty bullets", () => {
    expect(toPolicyList("a\n\n\nb\n   \nc")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for undefined, null and empty input", () => {
    expect(toPolicyList(undefined)).toEqual([]);
    expect(toPolicyList(null)).toEqual([]);
    expect(toPolicyList("   \n  ")).toEqual([]);
  });

  // ---- PARITY WITH mobile-app/src/lib/policyContent.ts --------------------
  // These three cases exist verbatim in mobile-app/__tests__/policy-content.test.ts.
  // Both platforms render the SAME `privacy.*` strings, and an admin "Website
  // Content" override reaches both through the same t() chain — so if one
  // module normalises or bounds input and the other does not, one source string
  // becomes two different legal texts. Keep the pair identical.
  it("normalises CRLF and lone CR, so no invisible \\r survives into a cell", () => {
    expect(toPolicyLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
    expect(toPolicyTable("H1 | H2\r\nv1 | v2").rows).toEqual([["v1", "v2"]]);
  });

  it("bounds oversized input at POLICY_TEXT_MAX", () => {
    const lines = toPolicyLines("x".repeat(POLICY_TEXT_MAX + 500));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(POLICY_TEXT_MAX);
  });

  it("never truncates inside a surrogate pair", () => {
    // "😀" is two UTF-16 code units; landing the cap between them would leave a
    // lone high surrogate that renders as U+FFFD.
    const lines = toPolicyLines("y".repeat(POLICY_TEXT_MAX - 1) + "😀");
    expect(lines[0]).toHaveLength(POLICY_TEXT_MAX - 1);
    expect(lines[0]).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe("toPolicyTable", () => {
  it("takes the first line as the header and splits cells on |", () => {
    const { head, rows } = toPolicyTable("A | B | C\n1 | 2 | 3\n4 | 5 | 6");
    expect(head).toEqual(["A", "B", "C"]);
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("pads a short row so the renderer can never emit a ragged <tr>", () => {
    const { rows } = toPolicyTable("A | B | C\n1 | 2");
    expect(rows).toEqual([["1", "2", ""]]);
  });

  it("truncates an over-long row to the header's column count", () => {
    const { rows } = toPolicyTable("A | B\n1 | 2 | 3");
    expect(rows).toEqual([["1", "2"]]);
  });

  it("returns an empty table for empty input", () => {
    expect(toPolicyTable("")).toEqual({ head: [], rows: [] });
    expect(toPolicyTable(undefined)).toEqual({ head: [], rows: [] });
  });

  it("never produces markup — a cell holding HTML stays literal text", () => {
    const { rows } = toPolicyTable("A | B\n<script>x</script> | 2");
    expect(rows[0][0]).toBe("<script>x</script>");
  });
});

// ---------------------------------------------------------------------------
// The privacy policy is one document in three languages.
// ---------------------------------------------------------------------------

const PRIVACY_PREFIX = "privacy.";
const privacyKeys = Object.keys(messages[defaultLocale]).filter((k) =>
  k.startsWith(PRIVACY_PREFIX),
);
const otherLocales = locales.filter((l) => l !== defaultLocale);

describe("privacy policy i18n", () => {
  it("has copy to check (guards against the filter silently matching nothing)", () => {
    expect(privacyKeys.length).toBeGreaterThan(80);
    expect(privacyKeys).toContain("privacy.title");
    expect(privacyKeys).toContain("privacy.s13.title");
  });

  it.each(otherLocales)("%s defines every privacy.* key, non-empty", (locale) => {
    const missing = privacyKeys.filter((k) => !messages[locale][k]?.trim());
    expect(missing).toEqual([]);
  });

  it.each(otherLocales)("%s adds no privacy.* key the default locale lacks", (locale) => {
    const extra = Object.keys(messages[locale])
      .filter((k) => k.startsWith(PRIVACY_PREFIX))
      .filter((k) => !privacyKeys.includes(k));
    expect(extra).toEqual([]);
  });

  it("keeps every policy table the same shape in all three languages", () => {
    // Enumerated rather than pattern-matched: a renamed or dropped table must
    // fail here, not quietly leave the set smaller.
    const tableKeys = [
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
    // `.table` or `…Table` — NOT a bare lowercase "table" ending, which would
    // also swallow `privacy.s4.childEditable`.
    expect(privacyKeys.filter((k) => /(\.table|Table)$/.test(k)).sort()).toEqual(
      [...tableKeys].sort(),
    );

    for (const key of tableKeys) {
      const reference = toPolicyTable(messages[defaultLocale][key]);
      expect(reference.head.length, `${key} header`).toBeGreaterThan(1);
      expect(reference.rows.length, `${key} rows`).toBeGreaterThan(0);

      for (const locale of otherLocales) {
        const translated = toPolicyTable(messages[locale][key]);
        expect(translated.head.length, `${key} (${locale}) column count`).toBe(
          reference.head.length,
        );
        expect(translated.rows.length, `${key} (${locale}) row count`).toBe(
          reference.rows.length,
        );
        // A missing "|" collapses a row into one cell and silently loses the
        // rest of the sentence in that language; padding would hide it.
        for (const [i, row] of translated.rows.entries()) {
          expect(
            row.filter((cell) => cell.length > 0).length,
            `${key} (${locale}) row ${i + 1} has an empty cell`,
          ).toBe(reference.head.length);
        }
      }
    }
  });

  it("keeps every policy list the same length in all three languages", () => {
    // Bullet/numbered blocks: one item per line. A translator dropping a line
    // means one language promises less (or more) than the others. Enumerated on
    // purpose — `privacy.s12.never` reads like a list key but is a single
    // sentence, so a pattern would produce a false positive.
    const listKeys = [
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

    for (const key of listKeys) {
      const reference = toPolicyList(messages[defaultLocale][key]);
      expect(reference.length, `${key} items`).toBeGreaterThan(1);
      for (const locale of otherLocales) {
        expect(toPolicyList(messages[locale][key]).length, `${key} (${locale})`).toBe(
          reference.length,
        );
      }
    }
  });

  it("is never read from a client component", () => {
    // src/app/layout.tsx strips `privacy.*` out of the dictionary handed to the
    // client I18nProvider, because the policy body is 30–44 KB and that dict is
    // serialized into EVERY page's HTML. A "use client" file reading one of
    // these keys would silently render the raw key string — and putting them
    // back into the dict would re-add the payload to the whole site. Keys
    // arriving as an explicit prop are fine; this only catches catalog lookups.
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const source = readFileSync(full, "utf8");
        if (!/^\s*["']use client["']/.test(source)) continue;
        if (/["'`]privacy\.[a-zA-Z]/.test(source)) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("keeps the section titles the table of contents links to", () => {
    // <PrivacyPolicy/> renders anchors for s1..s13; a renamed key would render
    // the raw key string in the table of contents.
    for (let i = 1; i <= 13; i += 1) {
      for (const locale of locales) {
        expect(messages[locale][`privacy.s${i}.title`]?.trim()).toBeTruthy();
      }
    }
  });
});
