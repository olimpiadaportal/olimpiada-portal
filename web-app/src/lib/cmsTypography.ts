// Client-safe typography helpers shared by the root layout (server) and the
// CmsText component (client). NO server-only imports here.
//
// Per-field font sizes (admin "Website Content" → per-entry "Font size") are
// exposed to CSS as custom properties on <body>: one var per overridden i18n
// key, e.g. `home.heroTitle` → `--cms-fs-home-heroTitle`. Consumers reference
// the var; when it is unset the declaration is invalid at computed-value time,
// which for the inherited `font-size` property resolves to the INHERITED size
// — i.e. exactly today's rendering (zero regression until an admin opts in).

import type { CSSProperties } from "react";

/** CSS custom-property name carrying a field's admin-chosen font size. */
export function cmsFontSizeVar(key: string): string {
  return `--cms-fs-${key.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/**
 * Responsive px size: small sizes apply as-is; larger ones scale down on
 * narrow viewports via clamp() (full size from ~1200px wide, ~72% of it on a
 * 360px phone, never below 16px).
 */
export function responsiveFontSize(px: number): string {
  if (px <= 20) return `${px}px`;
  const min = Math.min(px, 16);
  const base = Math.round(px * 0.6 * 10) / 10; // px part (60%)
  const vw = Math.round((px / 30) * 100) / 100; // reaches 100% at 1200px vw
  return `clamp(${min}px, calc(${base}px + ${vw}vw), ${px}px)`;
}

/**
 * Inline style applying a field's admin-chosen size (server or client
 * components): `<h1 style={cmsFontSizeStyle("home.heroTitle")}>` — inherits
 * (renders exactly as today) whenever no size is configured for the key.
 */
export function cmsFontSizeStyle(key: string): CSSProperties {
  return { fontSize: `var(${cmsFontSizeVar(key)})` };
}
