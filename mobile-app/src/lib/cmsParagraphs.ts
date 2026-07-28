// CMS prose → paragraph blocks (the PURE half; rendering lives in
// components/CmsProse.tsx).
//
// PORT OF web-app/src/lib/cmsParagraphs.ts — same algorithm, same cap, same
// results. Keep the two in lockstep: one admin string must break identically on
// both platforms, in az, en and ru alike. (The web module also exports an
// `isMultilineText` helper; it has no mobile consumer, so it is not ported.)
//
// THE BUG THIS FIXES on mobile: newlines survive every hop — textarea →
// clean() (trims the ends only) → the `text` column → get_mobile_content() →
// t() — and are then lost at RENDER, because a React Native <Text> has no
// concept of a paragraph: "\n\n" is two soft breaks with no spacing above or
// below and nothing to style. Splitting the string into blocks is the whole
// fix; nothing upstream needs to change.
//
// CONTRACT (locale-independent — pure whitespace rules, never word- or
// punctuation-based):
//   * one or more BLANK lines  → a paragraph boundary
//   * a SINGLE newline         → a line break INSIDE the current paragraph
//   * CRLF / lone CR           → normalised to LF first, so a body saved
//     through a real <form> POST (textareas are CRLF-normalised there) splits
//     exactly like one saved through fetch/FormData — /\n{2,}/ would never
//     match "\r\n\r\n" and the whole article would render as one block
//   * whitespace-only lines count as blank; every line is trimmed
//   * leading/trailing blank lines produce no empty paragraphs
//
// SECURITY: this module returns PLAIN TEXT. It never produces markup and never
// escapes anything — it does not need to, because the renderer emits Text nodes
// (RN has no innerHTML at all), so "<script>" is displayed literally and no HTML
// sink is involved. Same stance as lib/notifMarkdown.tsx.

/**
 * Hard input bound so a hostile/oversized value cannot blow up rendering.
 * Mirrors the web cap: 20000 = the largest server-side cap in the product (news
 * body); the CMS site_content cap is 2000, so no legitimate stored value is ever
 * truncated.
 */
export const CMS_TEXT_MAX = 20000;

/**
 * Split admin text into paragraphs of lines: `[[p1line1, p1line2], [p2line1]]`.
 * The caller renders one block per paragraph and one line break between the
 * lines of a paragraph — so it never has to re-parse the string.
 *
 * Linear-time (no regex over the whole string beyond the CR normalisation), so
 * there is no backtracking risk on hostile input.
 */
export function toParagraphs(raw: string | null | undefined): string[][] {
  if (typeof raw !== "string" || raw.length === 0) return [];

  // slice() counts UTF-16 code UNITS, so a cap landing inside a surrogate pair
  // (an emoji, a rare CJK glyph) would leave a lone high surrogate that renders
  // as U+FFFD. Drop it rather than print a replacement character.
  let bounded = raw.slice(0, CMS_TEXT_MAX);
  if (bounded.length === CMS_TEXT_MAX && /[\uD800-\uDBFF]$/.test(bounded)) {
    bounded = bounded.slice(0, -1);
  }

  const lines = bounded.replace(/\r\n?/g, "\n").split("\n");

  const paragraphs: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // Blank (or whitespace-only) line = paragraph boundary. Consecutive
      // blanks collapse into ONE boundary; a leading blank starts nothing.
      if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }
  if (current.length > 0) paragraphs.push(current);

  return paragraphs;
}
