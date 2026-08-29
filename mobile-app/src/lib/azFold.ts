// Diacritic-tolerant search for the picker sheets (city / district / school /
// topic). A parent on a phone keyboard types "Haci" and must reach
// "Hacıqabul"; a parent who does type "Hacı" must reach it too. That only
// works if BOTH sides go through the same fold — fold the query alone and a
// label stops matching itself.
//
// The character map is the one already duplicated across the admin panel's
// slugify helpers (news.ts / actions.ts / olympiad.ts / question-types.ts /
// OlympiadCreateForm.tsx). Only the MAP is reused: those helpers also strip to
// [a-z0-9-] and truncate to 80, which would erase the spaces and digits a
// school-name search depends on ("148 nömrəli tam orta məktəb").

const AZ_FOLD: Record<string, string> = {
  ə: "e",
  ö: "o",
  ü: "u",
  ğ: "g",
  ı: "i",
  ç: "c",
  ş: "s",
};

// The NFKD pass only exists for text the map cannot reach: pasted labels with
// precomposed accents, and the "i" + U+0307 that a non-Azerbaijani lowercasing
// of "İ" produces. Hermes ships `String.prototype.normalize`, but this fold
// runs per row per keystroke, so the capability is probed once here rather
// than guarded on every call.
const CAN_NORMALIZE = typeof String.prototype.normalize === "function";

// Combining Diacritical Marks (U+0300–U+036F) — the block NFKD decomposition
// produces for Latin letters. Spelled as an explicit range on purpose: Hermes's
// regex engine is not a place to depend on `\p{M}` Unicode property escapes.
const COMBINING = /[\u0300-\u036f]/g;

/** Lowercase + de-diacritic a label or a query so the two can be compared. */
export function azFold(input: string): string {
  // ORDER IS LOAD-BEARING. `toLocaleLowerCase("az")` maps ASCII "I" to "ı"
  // (dotless i), so mapping characters BEFORE lowercasing leaves that "ı"
  // behind — the map's keys are lowercase — and every query typed with a
  // capital I ("HACIQABUL", "Ismayilli") stops matching. Lowercase first, then
  // map, then decompose.
  const lowered = input.toLocaleLowerCase("az");
  let mapped = "";
  for (const ch of lowered) mapped += AZ_FOLD[ch] ?? ch;
  const decomposed = CAN_NORMALIZE ? mapped.normalize("NFKD") : mapped;
  return decomposed.replace(COMBINING, "");
}

/** 2 = folded prefix, 1 = folded substring, 0 = no match. */
export function azRank(label: string, foldedQuery: string): 0 | 1 | 2 {
  const folded = azFold(label);
  if (folded.startsWith(foldedQuery)) return 2;
  return folded.includes(foldedQuery) ? 1 : 0;
}

/**
 * A search box earns its place only once scrolling stops being the faster way
 * to find a row: ~12 rows is one screenful at 320×568 before the keyboard
 * opens. Below it the box costs a screen of list for nothing (grades, the four
 * subjects); above it — the district list heading for ~80 rows, school lists in
 * the hundreds — the list is unusable without one.
 */
export const SEARCH_MIN_ITEMS = 12;

/**
 * Filter a flat option list. Prefix matches come first so a two-letter query
 * surfaces something useful, but never across group boundaries: `group` keeps
 * each section's rows together, because the sectioned pickers DERIVE their
 * headers from the order of this array and a re-ordered list would repeat them.
 * An empty query returns `items` untouched (same reference).
 */
export function azFilter<T>(
  items: T[],
  query: string,
  label: (item: T) => string,
  group?: (item: T) => string | undefined,
): T[] {
  const q = azFold(query.trim());
  if (!q) return items;
  const groupOrder: string[] = [];
  const kept: { item: T; group: number; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const rank = azRank(label(item), q);
    if (rank === 0) return;
    const key = group?.(item) ?? "";
    let g = groupOrder.indexOf(key);
    if (g === -1) {
      g = groupOrder.length;
      groupOrder.push(key);
    }
    kept.push({ item, group: g, rank, index });
  });
  kept.sort((a, b) => a.group - b.group || b.rank - a.rank || a.index - b.index);
  return kept.map((k) => k.item);
}

/**
 * Filter a list whose group headers are INTERLEAVED rows (the add-child school
 * picker's private/public optgroups). A header whose section filters to empty
 * is dropped with it — a lone "Dövlət məktəbləri" caption over nothing reads
 * as a broken list.
 */
export function azFilterSections<T>(
  items: T[],
  query: string,
  opts: { isHeader: (item: T) => boolean; label: (item: T) => string },
): T[] {
  if (!query.trim()) return items;
  const out: T[] = [];
  let header: T | null = null;
  let run: T[] = [];
  const flush = () => {
    const kept = azFilter(run, query, opts.label);
    if (kept.length > 0) {
      if (header !== null) out.push(header);
      out.push(...kept);
    }
    header = null;
    run = [];
  };
  for (const item of items) {
    if (opts.isHeader(item)) {
      flush();
      header = item;
    } else {
      run.push(item);
    }
  }
  flush();
  return out;
}
