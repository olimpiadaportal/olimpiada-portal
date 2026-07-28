// Pure paragraph/line splitter for admin-authored CMS prose (the "Website
// Content" editor, News bodies — any multi-line string an admin types).
//
// THE BUG THIS FIXES: newlines survive every hop of the pipeline (textarea →
// trim/length-cap → text column → overrides map → t(key)), but HTML collapses
// them to a single space, so an admin who typed blank lines got ONE run-on
// block. Nothing was stripping the newlines; nothing was rendering them.
//
// CONTRACT (locale-independent — az/en/ru behave identically because the rules
// are pure whitespace rules, never word- or punctuation-based):
//   • one or more BLANK lines  → a paragraph boundary
//   • a SINGLE newline         → a line break INSIDE the current paragraph
//   • CRLF / lone CR           → normalized to LF first, so text saved through
//     a real <form> POST (which newline-normalizes textareas to CRLF) splits
//     exactly like text saved through fetch/FormData
//   • whitespace-only lines count as blank; every line is trimmed
//   • leading/trailing blank lines produce no empty paragraphs
//
// SECURITY: this module returns PLAIN TEXT. It never produces HTML, never
// escapes anything (it does not need to — the renderer emits React text nodes,
// so `<script>` is displayed literally and no HTML sink is involved). See
// src/components/CmsProse.tsx.
//
// No React, no server-only imports: usable from server components, client
// components and unit tests alike.

/**
 * Hard input bound so a hostile/oversized value cannot blow up rendering.
 * 20000 = the largest server-side cap in the product (news body); the CMS
 * site_content cap is 2000, so no legitimate stored value is ever truncated.
 */
export const CMS_TEXT_MAX = 20000;

/**
 * Split admin text into paragraphs of lines: `[[p1line1, p1line2], [p2line1]]`.
 * The caller renders one block element per paragraph and one line break between
 * the lines of a paragraph — so it never has to re-parse the string.
 *
 * Linear-time (no regex over the whole string beyond the CR normalization),
 * so there is no backtracking risk on hostile input.
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

/** True when the value renders as more than a single line (paragraphs or breaks). */
export function isMultilineText(raw: string | null | undefined): boolean {
  const paragraphs = toParagraphs(raw);
  return paragraphs.length > 1 || (paragraphs[0]?.length ?? 0) > 1;
}
