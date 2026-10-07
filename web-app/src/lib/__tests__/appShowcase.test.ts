// THE LANDING-PAGE APP SHOWCASE (components/appHero, lib/appShowcase).
//
// What this pins, and why each one is worth a test:
//
//   * THE STORE LINKS. The App Store URL is the one thing on the first screen a
//     visitor acts on; a typo there is invisible until someone complains. It
//     must open in a new tab with noopener + noreferrer (web-app security rule).
//   * NO FAKE ANDROID BUTTON. The Play listing is not public yet. While
//     PLAY_STORE_URL is null the hero must render the status line and NO link
//     to Google Play — a download button that goes nowhere reads as a broken
//     site.
//   * NO APP STORE LINK FOR A CHILD SESSION. The listing shows the app's
//     in-app purchase prices, and this site already withholds every priced
//     listing from a signed-in child.
//   * THE COPY STAYS OFF THE ANDROID BINARY. "Download on the App Store" in a
//     purchase-silent Android bundle is exactly the string a Play reviewer
//     greps for, so appHero.* is a WEB_ONLY prefix in the mobile sync script.
//   * THE SCREENSHOTS ARE LOCAL. A hotlinked store-CDN image can change or
//     vanish without notice; every screen is served from /public and its
//     declared size matches the file, so it reserves its box and never shifts
//     layout.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";
import { APP_SCREENS, APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appShowcase";
import { AppHero } from "@/components/appHero/AppHero";

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), "utf8");

const tFor = (locale: (typeof locales)[number]) => (key: string) => messages[locale][key] ?? key;

function render(opts: { isChild?: boolean; panelHref?: string | null } = {}) {
  return renderToStaticMarkup(
    createElement(AppHero, {
      t: tFor("az"),
      panelHref: opts.panelHref ?? null,
      isChild: opts.isChild ?? false,
      exploreId: "explore",
    }),
  );
}

describe("store links", () => {
  it("points at the live App Store listing", () => {
    expect(APP_STORE_URL).toBe("https://apps.apple.com/az/app/olympiq-school-olympiad/id6798527831");
  });

  it("renders the App Store link in a new tab with noopener and noreferrer", () => {
    const html = render();
    const tag = html.match(/<a[^>]*href="https:\/\/apps\.apple\.com[^"]*"[^>]*>/)?.[0];
    expect(tag, "App Store link must be rendered").toBeTruthy();
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(tag).toMatch(/aria-label="[^"]+"/);
  });

  it("renders the Google Play link in a new tab, and no 'coming soon' line, once the listing is live", () => {
    expect(PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=ai.olympiq.app");
    const html = render();
    const tag = html.match(/<a[^>]*href="https:\/\/play\.google\.com[^"]*"[^>]*>/)?.[0];
    expect(tag, "Google Play link must be rendered").toBeTruthy();
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain(messages.az["appHero.android.lead"]);
  });

  it("shows a signed-in child neither store link", () => {
    const html = render({ isChild: true, panelHref: "/child" });
    expect(html).not.toContain("play.google.com");
  });

  it("gives a signed-in child their panel instead of the App Store link", () => {
    const html = render({ isChild: true, panelHref: "/child" });
    expect(html).not.toContain("apps.apple.com");
    expect(html).toContain('href="/child"');
  });

  it("owns the page's single h1", () => {
    expect(render().match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe("screenshots", () => {
  it("are all local WebP files whose declared size matches the file", () => {
    expect(APP_SCREENS.length).toBeGreaterThanOrEqual(2);
    expect(APP_SCREENS.length).toBeLessThanOrEqual(4);
    for (const screen of APP_SCREENS) {
      expect(screen.src.startsWith("/app-screens/"), screen.src).toBe(true);
      const file = root(`public${screen.src}`);
      expect(existsSync(file), file).toBe(true);
      const buf = readFileSync(file);
      expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
      // VP8X header: canvas width/height minus one, 24-bit little-endian.
      expect(buf.subarray(12, 16).toString("ascii")).toBe("VP8X");
      const w = 1 + buf.readUIntLE(24, 3);
      const h = 1 + buf.readUIntLE(27, 3);
      expect({ w, h }, screen.src).toEqual({ w: screen.width, h: screen.height });
      expect(screen.topColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("renders one slide per screen, each with a translated description", () => {
    const html = render();
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(APP_SCREENS.length);
    for (const screen of APP_SCREENS) {
      expect(html).toContain(`alt="${messages.az[screen.altKey]}"`);
    }
  });
});

describe("carousel controls", () => {
  it("has one dot per screen and no separate pause/play button (owner, 2026-09-26)", () => {
    const html = render();
    const pager = html.slice(html.lastIndexOf('aria-roledescription="slide"'));
    expect(pager.match(/<button/g)).toHaveLength(APP_SCREENS.length);
  });

  it("stops autoplay once a visitor picks a screen — the stop control for touch and keyboard", () => {
    // With the pause button gone, a dot tap is the only way a visitor who
    // cannot hover takes the carousel out of autoplay (WCAG 2.2.2).
    const src = read("src/components/appHero/PhoneShowcase.tsx");
    expect(src).toMatch(/onClick=\{\(\) => \{\s*setActive\(i\);\s*setUserPaused\(true\);/);
    expect(src).toMatch(/const playing = canAutoplay && !userPaused/);
  });
});

describe("copy", () => {
  const keysOf = (loc: (typeof locales)[number]) =>
    Object.keys(messages[loc]).filter((k) => k.startsWith("appHero.")).sort();

  it("exists in all three languages with the same keys, none empty", () => {
    const az = keysOf("az");
    expect(az.length).toBeGreaterThan(20);
    for (const loc of locales) {
      expect(keysOf(loc), loc).toEqual(az);
      for (const k of az) expect(messages[loc][k].trim(), `${loc} ${k}`).not.toBe("");
    }
  });

  it("carries the carousel placeholders in every language", () => {
    for (const loc of locales) {
      for (const k of ["appHero.carousel.slide", "appHero.carousel.show"]) {
        expect(messages[loc][k], `${loc} ${k}`).toContain("{n}");
        expect(messages[loc][k], `${loc} ${k}`).toContain("{total}");
      }
    }
  });

  it("never reaches the mobile bundle", () => {
    const sync = read("../mobile-app/scripts/sync-i18n.mjs");
    const prefixes = sync.match(/const WEB_ONLY_PREFIXES = \[([^\]]*)\]/)?.[1] ?? "";
    expect(prefixes).toContain('"appHero."');
    const generated = read("../mobile-app/src/i18n/messages.generated.ts");
    expect(generated).not.toContain('"appHero.');
  });
});

describe("motion and layout rules", () => {
  const css = read("src/components/appHero/appHero.module.css");

  it("switches every animation off under prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block.length).toBeGreaterThan(40);
    for (const cls of [".rise", ".late", ".phoneEnter", ".phoneFloat", ".cardFloat"]) {
      expect(block, cls).toContain(cls);
    }
    expect(block).toContain("animation: none");
    expect(block).toContain("transition: none");
  });

  it("has no blinking or pulsing indicator — the only looping motion is the gentle float", () => {
    // Owner, 2026-09-26: the pulsing status dot on the Android icon read as
    // generic AI-template decoration and was removed. Anything that loops
    // forever must be the float, never a blink or a ping.
    const loops = [...css.matchAll(/animation:[^;]*\binfinite\b[^;]*;/g)].map((m) => m[0]);
    expect(loops.length).toBeGreaterThan(0);
    for (const rule of loops) expect(rule, rule).toMatch(/\bfloat\b/);
    expect(css).not.toMatch(/@keyframes\s+(ping|pulse|blink)/);
  });

  it("uses only the approved breakpoint scale", () => {
    const widths = [...css.matchAll(/\((?:max|min)-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect([480, 640, 768, 1024, 1280]).toContain(w);
  });

  it("animates with transform and opacity, never with layout properties", () => {
    const keyframes = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?\n)\}/g)].map((m) => m[1]).join("\n");
    for (const prop of ["top:", "left:", "width:", "height:", "margin", "background-position"]) {
      expect(keyframes, prop).not.toContain(prop);
    }
  });
});
