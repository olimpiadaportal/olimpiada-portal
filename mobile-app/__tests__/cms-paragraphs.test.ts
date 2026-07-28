// Mobile half of the CMS paragraph contract. The web app runs the same cases
// against web-app/src/lib/cmsParagraphs.ts — if one side changes, both suites
// must be updated together, or an admin's text renders differently per platform.
import { CMS_TEXT_MAX, toParagraphs } from "@/lib/cmsParagraphs";

describe("toParagraphs (web parity)", () => {
  it("returns nothing for empty or non-string input", () => {
    expect(toParagraphs("")).toEqual([]);
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs(undefined)).toEqual([]);
    expect(toParagraphs("   \n  \n ")).toEqual([]);
    expect(toParagraphs(42 as unknown as string)).toEqual([]);
  });

  it("keeps a single line as one paragraph", () => {
    expect(toParagraphs("Komandamız")).toEqual([["Komandamız"]]);
  });

  it("splits on a blank line", () => {
    expect(toParagraphs("first\n\nsecond")).toEqual([["first"], ["second"]]);
  });

  it("treats any run of blank lines as ONE break", () => {
    expect(toParagraphs("a\n\n\n\nb")).toEqual([["a"], ["b"]]);
    expect(toParagraphs("a\n\n\n\n\n\n\nb")).toEqual([["a"], ["b"]]);
  });

  it("treats a whitespace-only line as blank", () => {
    expect(toParagraphs("a\n   \nb")).toEqual([["a"], ["b"]]);
    expect(toParagraphs("a\n\t\nb")).toEqual([["a"], ["b"]]);
  });

  it("keeps a single newline INSIDE its paragraph", () => {
    // The three-line legal address (about2.team.addrValue) — one paragraph.
    expect(
      toParagraphs("Azərbaycan Respublikası,\nLerik rayonu,\nPeştətük kəndi"),
    ).toEqual([["Azərbaycan Respublikası,", "Lerik rayonu,", "Peştətük kəndi"]]);
  });

  it("normalises CRLF and lone CR before splitting", () => {
    // Bodies posted through a real <form> arrive CRLF-normalised; "\r\n\r\n"
    // must behave exactly like "\n\n" or the article renders as one block.
    expect(toParagraphs("a\r\n\r\nb")).toEqual([["a"], ["b"]]);
    expect(toParagraphs("a\r\rb")).toEqual([["a"], ["b"]]);
    expect(toParagraphs("a\r\nb")).toEqual([["a", "b"]]);
    expect(toParagraphs("a\rb")).toEqual([["a", "b"]]);
  });

  it("drops leading/trailing blank lines and trims every line", () => {
    expect(toParagraphs("\n\n  a  \n  b  \n\n\n")).toEqual([["a", "b"]]);
    expect(toParagraphs("\na\n")).toEqual([["a"]]);
  });

  it("never emits an empty paragraph", () => {
    const out = toParagraphs("a\n\n\n\nb\n\nc");
    expect(out).toHaveLength(3);
    for (const lines of out) expect(lines.some((l) => l.length > 0)).toBe(true);
  });

  it("breaks az/en/ru identically (same shape, same spacing)", () => {
    const az = "Birinci abzas.\nİkinci sətir.\n\nİkinci abzas.";
    const en = "First paragraph.\nSecond line.\n\nSecond paragraph.";
    const ru = "Первый абзац.\nВторая строка.\n\nВторой абзац.";
    const shape = (s: string) => toParagraphs(s).map((p) => p.length);
    expect(shape(az)).toEqual([2, 1]);
    expect(shape(en)).toEqual(shape(az));
    expect(shape(ru)).toEqual(shape(az));
  });

  it("renders markup-looking text literally (no HTML is ever produced)", () => {
    expect(toParagraphs("<script>alert(1)</script>")).toEqual([
      ["<script>alert(1)</script>"],
    ]);
  });

  it("truncates rather than throwing on an over-cap string", () => {
    // The cap is above every server-side length cap in the product, so a real
    // stored value never reaches it.
    const long = `${"a".repeat(CMS_TEXT_MAX)}\n\ntail`;
    const out = toParagraphs(long);
    expect(out).toHaveLength(1);
    expect(out[0][0]).toHaveLength(CMS_TEXT_MAX);
  });

  it("never truncates in the middle of a surrogate pair", () => {
    // The cap counts UTF-16 units; a straddling emoji would otherwise leave a
    // lone high surrogate, which renders as U+FFFD. Same rule as the web.
    const straddling = `${"x".repeat(CMS_TEXT_MAX - 1)}\u{1F600}tail`;
    const out = toParagraphs(straddling);
    expect(out[0][0]).toHaveLength(CMS_TEXT_MAX - 1);
    expect(/[\uD800-\uDFFF]/.test(out[0][0])).toBe(false);

    const fitting = `${"x".repeat(CMS_TEXT_MAX - 2)}\u{1F600}tail`;
    expect(toParagraphs(fitting)[0][0].endsWith("\u{1F600}")).toBe(true);
  });
});
