// A LIST OF LABELS IS ORDERED IN THE READER'S ALPHABET (2026-09-10)
//
// Two shapes of the same defect, both of which survived a repo-wide sweep of
// this exact bug because both LOOK sorted:
//
//   labels.sort((a, b) => a.label.localeCompare(b.label))   // runtime default
//   labels.sort()                                           // UTF-16 code units
//
// The first collates in whatever locale the SERVER happens to default to — one
// order for every admin, in nobody's alphabet. The second put "10-cu sinif"
// above "3-cü sinif" in the confirmation dialog of a bulk DELETE, which is the
// one list on that screen an admin is asked to read carefully before agreeing
// to destroy something.
//
// The behaviour is pinned first, then the SHAPE is swept across src/, because
// this is the obvious thing to write and it typechecks.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  displayLabelComparator,
  sortByDisplayLabel,
} from "@/lib/admin/subject-display";

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8").split("\r\n").join("\n");

/**
 * Source with its comments removed.
 *
 * Every assertion below runs over this rather than the raw file, and it is not
 * a convenience: the fixed sites and subject-display.ts both QUOTE the two
 * anti-patterns in the comments explaining why they are wrong. A test that
 * cannot tell prose from code would demand those explanations be deleted, which
 * is exactly the knowledge a future reader needs to not rewrite the bug.
 */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const readCode = (rel: string) => stripComments(read(rel));

describe("displayLabelComparator collates for the reader", () => {
  const order = (labels: string[], locale: string) =>
    [...labels].sort(displayLabelComparator(locale));

  it("puts q before l and x before i for an Azerbaijani reader", () => {
    // Azerbaijani is not the Latin alphabet with accents on it.
    expect(order(["Latın dili", "Qrammatika"], "az")).toEqual([
      "Qrammatika",
      "Latın dili",
    ]);
    expect(order(["İnformatika", "Xarici dil"], "az")).toEqual([
      "Xarici dil",
      "İnformatika",
    ]);
  });

  it("orders the SAME labels differently for an English reader", () => {
    // Not a curiosity: it is the assertion that the locale argument does work.
    // Drop it and `en` still passes while `az` silently regresses.
    expect(order(["Latın dili", "Qrammatika"], "en")).toEqual([
      "Latın dili",
      "Qrammatika",
    ]);
  });

  it("orders grade labels by their NUMBER, not their digits as text", () => {
    // The bulk dialog's list. Code-unit order gives 10, 11, 3.
    expect(order(["3-cü sinif", "10-cu sinif", "11-ci sinif"], "az")).toEqual([
      "3-cü sinif",
      "10-cu sinif",
      "11-ci sinif",
    ]);
  });

  it("falls back to a usable order for an unknown locale instead of throwing", () => {
    // Both fallbacks in the comparator are deliberate: a runtime missing the
    // locale's collation data must degrade, never crash a page.
    expect(order(["b", "a"], "xx-nonsense")).toEqual(["a", "b"]);
  });

  it("sortByDisplayLabel does not mutate its input", () => {
    const rows = [{ label: "Zoologiya" }, { label: "Ana dili" }];
    const sorted = sortByDisplayLabel(rows, "az", (r) => r.label);
    expect(sorted.map((r) => r.label)).toEqual(["Ana dili", "Zoologiya"]);
    expect(rows.map((r) => r.label)).toEqual(["Zoologiya", "Ana dili"]);
  });
});

describe("the olympiad pool manager orders its labels for the reader", () => {
  const MANAGER = "src/components/OlympiadQuestionManager.tsx";
  const PAGE = "src/app/(protected)/olympiad/[id]/edit/page.tsx";

  it("builds ONE collator from the locale prop and sorts with it", () => {
    const src = readCode(MANAGER);
    expect(src).toContain("displayLabelComparator(locale)");
    // The grade filter, and BOTH bulk-dialog previews (delete + archive).
    expect(src).toContain("byLabel(a.label, b.label)");
    expect(src.match(/\.sort\(byLabel\)/g) ?? []).toHaveLength(2);
    // Neither defect shape may remain anywhere in the file.
    expect(src).not.toContain(".localeCompare(");
    expect(src).not.toMatch(/\.sort\(\)/);
  });

  it("is a REQUIRED prop, fed by the page that knows the admin's locale", () => {
    // A defaulted locale is a call site that silently orders a Russian admin's
    // list in Azerbaijani, so the prop carries no default.
    expect(readCode(MANAGER)).toContain("locale: string;");
    expect(readCode(MANAGER)).not.toContain("locale = ");
    expect(readCode(PAGE)).toContain("locale={locale}");
  });
});

describe("no locale-less localeCompare comes back into admin-panel/src", () => {
  // Source-level and repo-wide, because this is a SHAPE rather than a location.
  const sources = () => {
    const out: { rel: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          out.push({
            rel: full.replace(/\\/g, "/").replace(/^.*?\/src\//, "src/"),
            text: stripComments(readFileSync(full, "utf8")),
          });
        }
      }
    };
    walk(resolve(process.cwd(), "src"));
    return out;
  };

  /**
   * Locale-less by DESIGN, each for the same reason: what it compares is not a
   * label anybody reads in their own language, and the order has to be
   * identical for every admin.
   *
   * Adding a file here is a claim about that file, not a way to quiet the test.
   */
  const MACHINE_KEY_SORTS = new Set([
    // ISO-8601 timestamps: one order in every locale, and a collator would only
    // make it slower.
    "src/lib/admin/finance.ts",
    "src/lib/admin/checkouts.ts",
    // Status enum values ("active", "pending") as a tie-break, plus ISO dates —
    // a deterministic order so two exports of the same data diff cleanly.
    "src/lib/admin/accounts-export.ts",
    // Parent display names and e-mail addresses, ordered inside a SPREADSHEET
    // snapshot with no reader attached: this module has no locale and the file
    // it produces is downloaded, not rendered. Worth revisiting the day the
    // export learns who asked for it.
    "src/lib/admin/accounts-export-read.ts",
    // Notification template CODES — machine identifiers, and the code is
    // literally what the table prints in that column.
    "src/components/NotificationTemplates.tsx",
  ]);

  it("only machine-key sorts compare without a locale", () => {
    const bad = sources()
      .filter((f) => /\.localeCompare\(\s*[^,()]*\)/.test(f.text))
      .map((f) => f.rel)
      .filter((rel) => !MACHINE_KEY_SORTS.has(rel));
    expect(bad).toEqual([]);
  });

  it("nothing bare-sorts a list of grade or subject labels", () => {
    const bad = sources()
      .filter((f) => /\b(labels?|names?|titles?|grades)\b[^\n;]*\.sort\(\)/.test(f.text))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });
});
