// Line-oriented parsers for LONG-FORM LEGAL COPY (currently the privacy policy).
//
// WHY THIS EXISTS
// ---------------
// The privacy policy is ~90 blocks of prose, bullet lists and small tables, and
// it has to exist THREE times (az / en / ru) — the localization rule is
// non-negotiable and the biggest real risk is TRILINGUAL DRIFT: an edit applied
// to one language only, producing a policy that says different things to
// different regulators.
//
// Giving every table CELL its own i18n key would mean ~270 keys × 3 languages.
// Instead a whole list (or a whole table) is ONE key per language, written the
// way the source document reads:
//
//   privacy.s4.parentTable:
//     "Məlumat | Məcburidir? | Niyə toplayırıq
//      Ad | Bəli | Hesabı tanımaq üçün
//      E-poçt | Bəli | Giriş açarı"
//
// One key per table per language means a translator edits ONE string and the
// integrity test (src/lib/__tests__/policyContent.test.ts) can prove the three
// languages still have the same shape — same columns, same number of rows.
//
// FORMAT
//   * lines are separated by "\n"; blank lines are ignored
//   * for a table the FIRST non-blank line is the header row
//   * cells are separated by "|" and trimmed
//
// SECURITY: this is the same posture as <CmsProse> — the output is plain
// strings that React renders as TEXT NODES. Nothing here parses or emits HTML,
// so a "|"-separated string can never become markup. It is deliberately NOT a
// markdown subset: no bold, no links, no tags.

// PARITY: mobile-app/src/lib/policyContent.ts is the same module, and the two
// must behave identically — both platforms render the SAME `privacy.*` strings
// (synced by mobile-app/scripts/sync-i18n.mjs), so any divergence here would
// show a phone and a browser different legal text from one source. The shared
// behaviour is pinned by fixture tables in BOTH test files; change one file and
// the other in the same edit.

/**
 * Hard input bound. The catalog strings are build-time constants, but an admin
 * "Website Content" override resolves through the same `t()` chain, so a
 * hostile or oversized value must not blow up rendering.
 */
export const POLICY_TEXT_MAX = 20000;

/** Split a multi-line i18n string into trimmed, non-empty lines. */
export function toPolicyLines(text?: string | null): string[] {
  if (typeof text !== "string" || text.length === 0) return [];

  // slice() counts UTF-16 code UNITS, so a cap landing inside a surrogate pair
  // would leave a lone high surrogate that renders as U+FFFD. Drop it instead.
  let bounded = text.slice(0, POLICY_TEXT_MAX);
  if (bounded.length === POLICY_TEXT_MAX && /[\uD800-\uDBFF]$/.test(bounded)) {
    bounded = bounded.slice(0, -1);
  }

  // CRLF / lone CR normalised first: a value edited through a real <form> POST
  // is CRLF-normalised on the way in, and "\r" left on a line would survive the
  // trim as an invisible character inside the last cell of every row.
  return bounded
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * One bullet/numbered item per line. Alias of {@link toPolicyLines} — it exists
 * so call sites read as what they render.
 */
export const toPolicyList = toPolicyLines;

export type PolicyTable = {
  /** Column headers (the first non-blank line). */
  head: string[];
  /** Body rows, every one padded/truncated to `head.length` cells. */
  rows: string[][];
};

/**
 * Parse a table string into a header row plus body rows.
 *
 * Rows are normalised to the header's column count: a short row is padded with
 * empty cells and an over-long row is truncated. That guarantees the renderer
 * can never emit a ragged `<tr>` (which would break the mobile `data-h`
 * stacked layout) no matter what a future translator types.
 */
export function toPolicyTable(text?: string | null): PolicyTable {
  const lines = toPolicyLines(text);
  if (lines.length === 0) return { head: [], rows: [] };

  const cells = (line: string) => line.split("|").map((cell) => cell.trim());
  const head = cells(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const row = cells(line);
    if (row.length === head.length) return row;
    if (row.length > head.length) return row.slice(0, head.length);
    return [...row, ...Array(head.length - row.length).fill("")];
  });
  return { head, rows };
}
