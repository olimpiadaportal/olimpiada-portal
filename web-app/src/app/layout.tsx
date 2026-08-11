import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
// Generated from src/lib/theme/palettes.ts — the child light-mode palettes.
// Imported after globals so the rules land later in the sheet; specificity
// ([data-theme="light"] .arena[data-palette=…] = 0,3,1) beats the base light
// arena block (0,2,0) either way.
import "./palettes.generated.css";
import { getLocale, getT } from "@/i18n/server";
import { PATHNAME_HEADER } from "@/lib/supabase/middleware";
import {
  getPublicSiteSettings,
  getContentOverrides,
  getContentFontSizes,
} from "@/lib/flags";
import { getSiteTypography, googleFontHref, fontStackFor } from "@/lib/siteTypography";
import { cmsFontSizeVar, responsiveFontSize } from "@/lib/cmsTypography";
import { I18nProvider } from "@/i18n/I18nProvider";
import { KeyboardInset } from "@/components/KeyboardInset";
import { MaintenanceSplash } from "@/components/MaintenanceSplash";
import { messages } from "@/i18n/messages";
import { defaultLocale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "OlympIQ — Student & Parent",
  description: "OlympIQ — olympiad preparation web app for students and parents.",
};

// The `theme` cookie is authoritative and is rendered onto <html> below, so
// there is nothing left for a boot script to fix. This one is a MIGRATION: a
// visitor whose preference still lives only in localStorage (the pre-cookie
// mechanism) gets it promoted to the cookie and applied before first paint, so
// their very next request is server-painted like everyone else's. It never
// overrides an existing cookie — the server already used it.
//
// Palette needs no boot script at all: data-palette is SSR'd onto .arena from
// students.palette, and the palette CSS only matches once the theme attribute
// says light — which the server also renders. Both halves arrive in the HTML.
const NO_FLASH_THEME = `(function(){try{if(/(^|;\\s*)theme=(light|dark)/.test(document.cookie))return;var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')return;document.cookie='theme='+t+'; path=/; max-age=31536000; samesite=lax'+(location.protocol==='https:'?'; secure':'');document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  // Theme is server-rendered from the `theme` cookie (same transport as
  // `locale`). Anything that is not exactly "light" is dark — the reference
  // default — so a hand-crafted cookie can only ever select one of the two
  // shipped stylesheets. For a CHILD the durable truth is students.theme_pref;
  // the cookie is how it reaches SSR, seeded at login and rewritten whenever
  // the child changes the theme or picks a palette.
  const theme =
    (await cookies()).get("theme")?.value === "light" ? "light" : "dark";

  // M21: build the SINGLE-locale client dictionary on the server — the bundled
  // catalog for the current locale (over the default-locale fallback) merged
  // with the admin "Website Content" DB overrides. The client I18nProvider
  // receives only this dict, so the trilingual catalog never ships client-side.
  const contentOverrides = await getContentOverrides();
  const clientDict: Record<string, string> = {
    ...messages[defaultLocale],
    ...messages[locale],
  };
  for (const [key, tri] of Object.entries(contentOverrides)) {
    const v = tri[locale];
    if (v && v.trim()) clientDict[key] = v;
  }
  // The privacy-policy BODY is ~30 KB of text in az and ~44 KB in ru. This dict
  // is serialized into the HTML of EVERY page, so shipping it everywhere to
  // render it on three would be a site-wide payload regression. Every consumer
  // of `privacy.*` is a SERVER component reading getT() (the /privacy pages,
  // the registration consent line, the parent profile card), so dropping the
  // prefix costs nothing. `nav.privacy` — the one string a CLIENT component
  // needs, for the student drawer's link — does NOT carry the prefix and stays.
  // If a client component ever needs policy copy, pass it as a prop rather than
  // putting the document back into every page.
  for (const key of Object.keys(clientDict)) {
    if (key.startsWith("privacy.")) delete clientDict[key];
  }

  // Maintenance mode (admin Settings → platform.maintenance_mode): the whole
  // web-app (public + parent + student) shows the maintenance notice. The
  // admin panel is a separate app and stays reachable to turn it back off.
  // Item 12: the flag now lives in a 4s server cache (flags.ts) and the splash
  // is a client component polling /api/maintenance-status every 4s, so both
  // entering (on navigation/SSR) and exiting propagate within ~0–5s.
  //
  // ONE EXEMPTION: the public /privacy page. Its URL is what goes into the App
  // Store Connect "Privacy Policy URL" field and the Google Play Data safety
  // form, and BOTH stores re-fetch that URL asynchronously after submission —
  // not only during review. A maintenance window must therefore never turn the
  // store-facing policy URL into a page with no policy on it. The exemption is
  // deliberately narrow: only the public path, so the in-app /help/privacy
  // shells stay gated with the rest of the product. The pathname arrives as the
  // middleware-set x-pathname header (an RSC cannot read the URL); middleware
  // `set`s it on every matched request, so a client-supplied value is always
  // overwritten and this can never be spoofed into bypassing the gate.
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "";
  const isPublicPolicy = pathname === "/privacy" || pathname.startsWith("/privacy/");

  const site = await getPublicSiteSettings();
  let maintenance: React.ReactNode = null;
  if (site.maintenanceMode && !isPublicPolicy) {
    const t = await getT();
    const msg =
      site.maintenanceMessage[locale] ?? site.maintenanceMessage.az ?? "";
    maintenance = (
      <MaintenanceSplash
        title={t("maintenance.title")}
        body={msg || t("maintenance.body")}
        locale={locale}
      />
    );
  }

  // Site typography (owner item 16, admin "Sayt şrifti"): when configured, the
  // selected Google font loads via ONE stylesheet link and <body> carries the
  // typography CSS variables + inline font-family/size (overrides the global
  // Arial stack without touching globals.css). Per-field sizes from the
  // Website Content CMS become `--cms-fs-*` variables (clamp()-wrapped).
  // UNCONFIGURED = nothing injected → renders exactly as today.
  const [typography, fieldSizes] = await Promise.all([
    getSiteTypography(),
    getContentFontSizes(),
  ]);
  const fontHref = typography ? googleFontHref(typography.fontFamily) : null;
  const styleVars: Record<string, string> = {};
  for (const [key, px] of Object.entries(fieldSizes)) {
    styleVars[cmsFontSizeVar(key)] = responsiveFontSize(px);
  }
  if (typography) {
    styleVars["--site-font"] = fontStackFor(typography.fontFamily);
    styleVars["--fs-base"] = `${typography.baseFontSize}px`;
    styleVars["--fs-heading"] = responsiveFontSize(typography.headingFontSize);
    styleVars["--fs-button"] = `${typography.buttonFontSize}px`;
  }
  let bodyStyle: React.CSSProperties | undefined;
  if (typography || Object.keys(styleVars).length > 0) {
    bodyStyle = { ...(styleVars as React.CSSProperties) };
    if (typography) {
      bodyStyle.fontFamily = "var(--site-font)";
      bodyStyle.fontSize = "var(--fs-base)";
    }
  }

  // suppressHydrationWarning: data-theme can still be rewritten before
  // hydration — by the localStorage migration script above, and by the palette
  // picker, which flips the attribute optimistically so the choice is visible
  // before the server action resolves. It only suppresses attribute mismatches
  // on <html> itself, nothing deeper.
  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
        {fontHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="preconnect"
              href="https://fonts.gstatic.com"
              crossOrigin="anonymous"
            />
            <link rel="stylesheet" href={fontHref} />
          </>
        )}
      </head>
      <body
        style={bodyStyle}
        data-site-typography={typography ? "1" : undefined}
      >
        <I18nProvider locale={locale} dict={clientDict}>
          <div className="app-shell">
            {/* Publishes --kb-inset (on-screen-keyboard height) on <html> via
                window.visualViewport. Renders nothing; every consumer of the
                variable is inside a `pointer: coarse` media query, so desktop
                is untouched. */}
            <KeyboardInset />
            {/* Theme + language controls live in each shell's own nav
                (e.g. the public navbar's .navbar-controls), so the root
                topbar no longer renders them — avoids duplicate controls. */}
            {maintenance ?? children}
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
