// CmsProse — the ONE renderer for admin-authored CMS prose.
//
// WHY: an admin typing blank lines in the "Website Content" editor used to get a
// single run-on block, because HTML collapses newlines. This component turns the
// stored text into real paragraphs (`\n\n+`) and real line breaks (single `\n`)
// using the pure splitter in src/lib/cmsParagraphs.ts.
//
// SECURITY (owner asked for sanitization): there is nothing to sanitize because
// nothing is ever parsed as HTML. We emit React TEXT NODES plus <br/> ELEMENTS,
// so `<script>alert(1)</script>` renders as the literal characters a visitor
// sees. `dangerouslySetInnerHTML` is deliberately NOT used here — the only
// HTML sink in the app stays the notification markdown renderer, which escapes
// first (src/lib/notifications/markdown.ts). Consequence, by design: admins get
// paragraphs and line breaks, NOT markup — bold/links/HTML tags are not
// supported and are shown verbatim.
//
// SERVER + CLIENT: no hooks and no "use client", so this renders inside server
// components (AboutContent) and inside client trees (CmsText) unchanged.
//
// CMS FONT SIZE: pass `cmsKey` to keep the admin's per-field size working. The
// size is applied to each paragraph as `font-size: var(--cms-fs-<key>)` — when
// the admin has not set a size the variable is unset, the declaration is invalid
// at computed-value time, and the paragraph simply INHERITS (identical to
// today's rendering).
//
// STYLING: the wrapper always carries `.cms-prose` (globals.css) which supplies
// the vertical rhythm — the same 14px paragraph gap `.about2-prose` already
// uses — from tokens/classes only, so light, dark and the student `.arena`
// scope are all covered without a single hardcoded value.
import { Fragment, type CSSProperties, type ElementType } from "react";
import { toParagraphs } from "@/lib/cmsParagraphs";
import { cmsFontSizeStyle } from "@/lib/cmsTypography";

/**
 * Wrappers that may legally contain `<p>` (flow content). Deliberately a closed
 * union rather than `ElementType`: an inline wrapper such as `p`/`span`/`a`
 * would be auto-closed by the HTML parser around the paragraphs, so the DOM the
 * browser builds differs from the tree React rendered → hydration mismatch.
 */
export type CmsProseWrapper =
  | "div"
  | "section"
  | "article"
  | "aside"
  | "address"
  | "blockquote"
  | "figcaption"
  | "li"
  | "td";

export type CmsProseProps = {
  /** Already-resolved CMS/i18n string, e.g. `t("about2.hero.lead")`. */
  text?: string | null;
  /** Alias of `text` (both accepted so call sites can read naturally). */
  value?: string | null;
  /** i18n key — pass it to honour the admin's per-field font size. */
  cmsKey?: string;
  /**
   * Wrapper element (default `div`); e.g. `"address"` for a postal address.
   * Restricted to elements that may contain `<p>` — see `CmsProseWrapper`.
   */
  as?: CmsProseWrapper;
  /** Extra class on the WRAPPER (`.cms-prose` is always added). */
  className?: string;
  /** Extra style on the WRAPPER. */
  style?: CSSProperties;
  /**
   * Size used when the admin has NOT configured one for `cmsKey` — supplied as
   * the CSS `var()` fallback so the admin's choice always wins and the caller's
   * own size still applies until they make one.
   */
  fallbackFontSize?: string | number;
};

export function CmsProse({
  text,
  value,
  cmsKey,
  as,
  className,
  style,
  fallbackFontSize,
}: CmsProseProps) {
  const paragraphs = toParagraphs(text ?? value);
  if (paragraphs.length === 0) return null;

  const Tag: ElementType = as ?? "div";
  // Inline (not on the wrapper) so the admin size beats a class-level
  // font-size on the paragraphs; omitted entirely when no key is given.
  const paragraphStyle = cmsKey
    ? cmsFontSizeStyle(cmsKey, fallbackFontSize)
    : undefined;

  return (
    <Tag className={className ? `cms-prose ${className}` : "cms-prose"} style={style}>
      {paragraphs.map((lines, pi) => (
        <p key={pi} style={paragraphStyle}>
          {lines.map((line, li) => (
            <Fragment key={li}>
              {li > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </Tag>
  );
}

/**
 * Compatibility alias — same component, reads better at call sites that talk
 * about "paragraphs" (e.g. a multi-line legal address).
 */
export const CmsParagraphs = CmsProse;
