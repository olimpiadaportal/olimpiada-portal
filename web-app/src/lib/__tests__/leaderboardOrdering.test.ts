// The leaderboard pages must render get_leaderboard's rows in the order the
// database returned them, and must print the same column they were sorted on.
//
// WHY THIS SUITE EXISTS. "Some leaderboard combinations show a higher
// percentage below a lower percentage" was first read as a client bug — a page
// sorting on one field and printing another, or re-indexing a paginated slice.
// It was not: the ordering defect was in public.get_leaderboard, which
// concatenated provisional rows BELOW ranked ones with an offset instead of a
// value (migration 2026_08_29_156). The database is therefore the single
// authority on row order, and these tests pin the property that made that true
// — because the moment a page adds its own `.sort()` or derives a rank from an
// array index, the symptom comes back and the SQL fix stops being verifiable.
//
// Source-reading, in the same idiom as demoPaymentsRemoved.test.ts: what is
// being pinned is the ABSENCE of a construct, which nothing at runtime can
// observe. Comments are stripped first, deliberately — the pages explain the
// ordering contract in prose and must stay free to name the constructs they are
// explaining.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = {
  child: resolve(process.cwd(), "src/app/child/leaderboard/page.tsx"),
  parent: resolve(process.cwd(), "src/app/(parent)/leaderboard/page.tsx"),
} as const;

/** File contents with /* … *​/ and // … comments blanked out. */
function code(abs: string): string {
  return readFileSync(abs, "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

// Every way a page could quietly reimpose its own order on the RPC result.
const REORDERING = [
  ".sort(",
  ".toSorted(",
  ".reverse(",
  ".toReversed(",
  "rows.slice(",
  "[...rows]",
];

describe.each(Object.entries(PAGES))("%s leaderboard page", (_name, path) => {
  const src = code(path);

  it("renders the RPC rows straight through, in order", () => {
    expect(src).toContain("rows.map(");
  });

  it("never re-orders or slices the rows it was given", () => {
    for (const needle of REORDERING) {
      expect(src.includes(needle)).toBe(false);
    }
  });

  it("prints the rank the server computed, never the array index", () => {
    // Provisional rows carry rank null and must render as "—" rather than
    // falling back to a position number, which is what withholding a rank means.
    expect(src).toContain('r.rank !== null ? String(r.rank) : "—"');
    expect(src).not.toContain("String(i + 1)");
  });

  it("prints the same column the board is sorted on", () => {
    // get_leaderboard orders on `value`; the value cell must render `value`.
    // A page that displayed a rounded/derived number here would recreate the
    // original (wrong) hypothesis for the reported bug.
    expect(src).toContain("fmtValue(r.value)");
  });

  it("asks for one page of rows and does not paginate", () => {
    expect(src).toContain("p_limit: 50");
    expect(src).not.toContain("p_offset");
  });
});
