// Locks in the CMS prose contract: an admin who types blank lines in the
// "Website Content" editor (or a News body) must get real paragraphs on the
// frontend, and nothing an admin types may ever become markup.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CMS_TEXT_MAX, isMultilineText, toParagraphs } from "@/lib/cmsParagraphs";
import { CmsProse } from "@/components/CmsProse";

describe("toParagraphs", () => {
  it("returns a single paragraph for a single line", () => {
    expect(toParagraphs("Salam dünya")).toEqual([["Salam dünya"]]);
  });

  it("splits blank-line separated text into separate paragraphs", () => {
    expect(toParagraphs("Birinci abzas.\n\nİkinci abzas.")).toEqual([
      ["Birinci abzas."],
      ["İkinci abzas."],
    ]);
  });

  it("treats 3+ consecutive newlines as ONE paragraph boundary", () => {
    expect(toParagraphs("A\n\n\n\nB")).toEqual([["A"], ["B"]]);
    expect(toParagraphs("A\n\nB")).toHaveLength(2);
    expect(toParagraphs("A\n\n\n\nB")).toHaveLength(2);
  });

  it("keeps a SINGLE newline as a line break inside its paragraph", () => {
    // The 3-line legal address case: one paragraph, three lines.
    expect(
      toParagraphs("Azərbaycan Respublikası,\nLerik rayonu,\nPeştətük kəndi"),
    ).toEqual([["Azərbaycan Respublikası,", "Lerik rayonu,", "Peştətük kəndi"]]);
  });

  it("normalizes CRLF and lone CR before splitting", () => {
    // Text submitted through a real <form> POST is newline-normalized to CRLF;
    // /\n{2,}/ would never match it, which is the news one-block bug.
    expect(toParagraphs("A\r\n\r\nB")).toEqual([["A"], ["B"]]);
    expect(toParagraphs("A\r\rB")).toEqual([["A"], ["B"]]);
    expect(toParagraphs("A\r\nB")).toEqual([["A", "B"]]);
    expect(toParagraphs("A\r\n\r\nB")).toEqual(toParagraphs("A\n\nB"));
  });

  it("drops leading/trailing blank lines and trims each line", () => {
    expect(toParagraphs("\n\n  A  \n  B  \n\n  ")).toEqual([["A", "B"]]);
  });

  it("treats a whitespace-only line as a blank line", () => {
    expect(toParagraphs("A\n   \nB")).toEqual([["A"], ["B"]]);
  });

  it("returns [] for empty, blank, null and undefined input", () => {
    expect(toParagraphs("")).toEqual([]);
    expect(toParagraphs("   \n\n  ")).toEqual([]);
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs(undefined)).toEqual([]);
  });

  it("splits az/en/ru identically (rules are pure whitespace rules)", () => {
    const shape = (s: string) => toParagraphs(s).map((p) => p.length);
    expect(shape("Bir\nİki\n\nÜç")).toEqual([2, 1]);
    expect(shape("One\nTwo\n\nThree")).toEqual([2, 1]);
    expect(shape("Один\nДва\n\nТри")).toEqual([2, 1]);
  });

  it("keeps HTML-looking text as literal text — it never parses or strips it", () => {
    expect(toParagraphs("<script>alert(1)</script>\n\n<b>x</b>")).toEqual([
      ["<script>alert(1)</script>"],
      ["<b>x</b>"],
    ]);
  });

  it("truncates rather than throws on oversized input", () => {
    const huge = `${"a".repeat(CMS_TEXT_MAX + 500)}\n\nlost`;
    const out = toParagraphs(huge);
    expect(out).toHaveLength(1);
    expect(out[0][0].length).toBe(CMS_TEXT_MAX);
  });

  it("never truncates in the middle of a surrogate pair", () => {
    // The cap counts UTF-16 units, so an emoji straddling it would leave a lone
    // high surrogate that renders as U+FFFD.
    const straddling = `${"x".repeat(CMS_TEXT_MAX - 1)}\u{1F600}tail`;
    const out = toParagraphs(straddling);
    expect(out[0][0].length).toBe(CMS_TEXT_MAX - 1);
    expect(/[\uD800-\uDFFF]/.test(out[0][0])).toBe(false);
    // A pair that fits entirely inside the cap is kept intact.
    const fitting = `${"x".repeat(CMS_TEXT_MAX - 2)}\u{1F600}tail`;
    expect(toParagraphs(fitting)[0][0].endsWith("\u{1F600}")).toBe(true);
  });

  it("isMultilineText detects paragraphs and line breaks", () => {
    expect(isMultilineText("one line")).toBe(false);
    expect(isMultilineText("two\nlines")).toBe(true);
    expect(isMultilineText("two\n\nparagraphs")).toBe(true);
    expect(isMultilineText("")).toBe(false);
  });
});

describe("CmsProse rendering", () => {
  const html = (props: Parameters<typeof CmsProse>[0]) =>
    renderToStaticMarkup(createElement(CmsProse, props));

  it("emits one <p> per paragraph and <br> for in-paragraph line breaks", () => {
    expect(html({ text: "A\n\nB" })).toBe(
      '<div class="cms-prose"><p>A</p><p>B</p></div>',
    );
    expect(html({ text: "A\nB" })).toBe(
      '<div class="cms-prose"><p>A<br/>B</p></div>',
    );
  });

  it("never emits markup for admin input — <script> is escaped text", () => {
    const out = html({ text: "<script>alert(1)</script>" });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("supports a custom wrapper element and keeps .cms-prose alongside the caller class", () => {
    expect(html({ as: "address", className: "about2-taddr", value: "A\nB" })).toBe(
      '<address class="cms-prose about2-taddr"><p>A<br/>B</p></address>',
    );
  });

  it("applies the admin per-key font size only when a cmsKey is given", () => {
    expect(html({ text: "A", cmsKey: "about2.hero.lead" })).toContain(
      "font-size:var(--cms-fs-about2-hero-lead)",
    );
    expect(html({ text: "A" })).not.toContain("font-size");
  });

  it("renders nothing for empty text", () => {
    expect(html({ text: "" })).toBe("");
    expect(html({ text: null })).toBe("");
  });

  it("uses the caller's size as the var() fallback so the admin always wins", () => {
    // With no admin size the variable is unset and the fallback applies; once
    // the admin configures one, --cms-fs-* resolves and beats the fallback.
    expect(
      html({ text: "A", cmsKey: "about2.hero.lead", fallbackFontSize: 15.5 }),
    ).toContain("font-size:var(--cms-fs-about2-hero-lead, 15.5px)");
  });
});
