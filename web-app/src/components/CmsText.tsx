"use client";

// CmsText — renders an admin-editable "Website Content" string WITH its
// admin-chosen per-field font size (owner item 16).
//
// The root layout exposes each configured size as a `--cms-fs-<key>` CSS
// variable on <body> (already clamp()-wrapped for mobile). This component
// simply references the variable: when it is unset the font-size declaration
// is invalid at computed-value time and resolves to the INHERITED size — i.e.
// exactly today's rendering. Text comes from the override-aware client dict
// (I18nProvider).
//
// Server components don't need this component: pair `t(key)` with
// `cmsFontSizeStyle(key)` from src/lib/cmsTypography.ts instead:
//   <h1 style={cmsFontSizeStyle("home.heroTitle")}>{t("home.heroTitle")}</h1>
//
// PROSE: for a field where the admin may type blank lines (any `multiline: true`
// registry entry — leads, hints, addresses), pass `multiline` and the text is
// rendered as real paragraphs/line breaks by <CmsProse> (text nodes only, no
// HTML sink). It stays opt-in because the default element here is an inline
// <span>, which cannot legally contain <p>.
import type { CSSProperties, ElementType } from "react";
import { useT } from "@/i18n/I18nProvider";
import { CmsProse, type CmsProseWrapper } from "@/components/CmsProse";
import { cmsFontSizeStyle } from "@/lib/cmsTypography";

type CmsTextBase = {
  /** i18n / site_content key, e.g. "home.heroTitle". */
  k: string;
  className?: string;
  style?: CSSProperties;
};

// `as` is typed against `multiline` so the prose branch can never be handed an
// inline wrapper: `<CmsText multiline as="p"/>` would render <p><p>…</p></p>,
// which the HTML parser auto-closes into a DIFFERENT tree than React rendered
// — a hydration mismatch. The union makes that a compile error.
export type CmsTextProps = CmsTextBase &
  (
    | {
        /** Render blank lines as paragraphs and single newlines as line breaks. */
        multiline: true;
        /** Block wrapper (default <div>) — must be able to contain <p>. */
        as?: CmsProseWrapper;
      }
    | {
        multiline?: false;
        /** Element to render (default <span>). */
        as?: ElementType;
      }
  );

export function CmsText({ k, as, className, style, multiline }: CmsTextProps) {
  const t = useT();
  const text = t(k);

  // ONE precedence rule on both branches (they used to disagree): the admin's
  // configured size wins; the caller's own `style.fontSize` is the fallback
  // used until the admin sets one. See cmsFontSizeStyle().
  const sized = cmsFontSizeStyle(k, style?.fontSize);

  if (multiline) {
    const { fontSize: _dropped, ...wrapperStyle } = style ?? {};
    return (
      <CmsProse
        text={text}
        cmsKey={k}
        as={(as as CmsProseWrapper) ?? "div"}
        className={className}
        style={wrapperStyle}
        fallbackFontSize={style?.fontSize}
      />
    );
  }

  const Tag: ElementType = as ?? "span";
  return (
    <Tag className={className} style={{ ...style, ...sized }}>
      {text}
    </Tag>
  );
}
