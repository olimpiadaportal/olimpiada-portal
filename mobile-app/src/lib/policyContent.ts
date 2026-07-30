// Line-oriented parsers for LONG-FORM LEGAL COPY (currently the privacy policy).
//
// PORT OF web-app/src/lib/policyContent.ts — same algorithm, same normalisation,
// same bound, same results. Keep the two in lockstep: ONE i18n string must split
// into the same list items and the same table grid on both platforms, in az, en
// and ru alike. The mobile screen and the web page render the identical
// `privacy.*` keys (synced by scripts/sync-i18n.mjs), so a divergence here would
// show the two platforms different policies from the same source text. The
// shared behaviour is pinned by the SAME fixture table in both test files
// (__tests__/policy-content.test.ts here, src/lib/__tests__/policyContent.test.ts
// on the web) — change one file and the other in the same edit.
//
// WHY THE FORMAT EXISTS
// ---------------------
// The privacy policy is ~90 blocks of prose, bullet lists and small tables, and
// it has to exist THREE times (az / en / ru). Giving every table CELL its own
// key would mean ~270 keys × 3 languages, and the biggest real risk with a
// legal document is TRILINGUAL DRIFT — an edit applied to one language only.
// So a whole list (or a whole table) is ONE key per language:
//
//   privacy.s4.parentTable:
//     "Məlumat | Məcburidir? | Niyə toplayırıq
//      Ad | Bəli | Hesabı tanımaq üçün
//      E-poçt | Bəli | Giriş açarı"
//
// FORMAT
//   * lines are separated by "\n"; blank lines are ignored
//   * for a table the FIRST non-blank line is the header row
//   * cells are separated by "|" and trimmed
//
// SECURITY: same posture as lib/cmsParagraphs.ts — the output is plain strings
// that the renderer emits as React Native <Text> nodes. Nothing here parses or
// emits markup (RN has no innerHTML at all), so a "|"-separated string can
// never become one. Deliberately NOT a markdown subset: no bold, no links.

/**
 * Hard input bound, mirroring lib/cmsParagraphs.ts and the web module's export
 * of the same name. The catalog strings are build-time constants, but an admin
 * "Website Content" override resolves through the same `t()` chain, so a
 * hostile/oversized value must not blow up rendering.
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
 * empty cells and an over-long row is truncated. On mobile a table renders as
 * one stacked "label / value" card per row, pairing cell[i] with head[i] — a
 * ragged row would pair a value with the wrong label, which in a legal document
 * is worse than an ugly layout. Normalising here makes that impossible whatever
 * a future translator types.
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
    return [...row, ...Array<string>(head.length - row.length).fill("")];
  });
  return { head, rows };
}
