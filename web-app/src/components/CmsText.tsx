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
import type { CSSProperties, ElementType } from "react";
import { useT } from "@/i18n/I18nProvider";
import { cmsFontSizeVar } from "@/lib/cmsTypography";

export function CmsText({
  k,
  as,
  className,
  style,
}: {
  /** i18n / site_content key, e.g. "home.heroTitle". */
  k: string;
  /** Element to render (default <span>). */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useT();
  const Tag: ElementType = as ?? "span";
  return (
    <Tag
      className={className}
      style={{ fontSize: `var(${cmsFontSizeVar(k)})`, ...style }}
    >
      {t(k)}
    </Tag>
  );
}
