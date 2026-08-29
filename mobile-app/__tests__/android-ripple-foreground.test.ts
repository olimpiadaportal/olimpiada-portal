// An Android ripple on a view that paints its own background MUST be a
// FOREGROUND ripple, or that view stops repainting when the theme changes.
//
// REPORTED BY THE OWNER, with screenshots: switching light<->dark while sitting
// on Parent > Analytics left the subject filter chips painted in the PREVIOUS
// theme — dark chips with dark text in light mode, light chips with pale text
// in dark mode — until the tab was left and re-entered.
//
// IT IS NOT A REACT STALENESS BUG, and the screenshots prove it: the chip's
// TEXT colour and its BACKGROUND colour are read from the same `tokens` object
// one line apart, and the text was correct while the background was not. The
// component re-rendered with fresh tokens; only the native view failed to
// repaint. There is no StyleSheet.create anywhere in this app, no captured
// tokens, and ThemeProvider memoizes correctly — all of which was checked.
//
// THE MECHANISM: `android_ripple` without `foreground` becomes
// nativeBackgroundAndroid, which routes to
// BackgroundStyleApplicator.setFeedbackUnderlay. On the New Architecture that
// function builds a fresh CompositeBackgroundDrawable and DISCARDS the result.
// LayerDrawable adopts the callback of every child it wraps, so the drawable the
// view is actually painting now reports to an orphan owned by no View. The next
// setBackgroundColor writes the new colour and calls invalidateSelf(), the
// invalidation goes to the orphan, and Android never redraws. Leaving the tab
// destroys and rebuilds the views, which is exactly why that "fixed" it.
//
// A foreground ripple goes to view.foreground instead and never touches the
// background composite. It paints OVER the label, so its colour must be
// translucent — which is why the fixed call sites use rgba()/tint() rather than
// an opaque palette token.
//
// This test pins the rule for every ripple that sits on a coloured view. Sites
// whose rippled view has NO background of its own are genuinely unaffected and
// are listed explicitly below — the list is the argument, so adding to it
// requires making that argument again.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "..", "src");

/** Rippled views that paint no background of their own, so the discarded
 *  composite carries nothing that needs to repaint. Verified individually. */
const NO_BACKGROUND_OF_ITS_OWN = [
  // The active pill is a CHILD View; the rippled Pressable is transparent.
  // This is also why the owner reported the tab bar switching theme correctly.
  "components/AppTabBar.tsx",
  // Rippled rows with no backgroundColor in their own style.
  "app/(parent)/(tabs)/home.tsx",
  "app/(public)/faq.tsx",
  // ListRow's `layout` carries no colours, and no caller passes a coloured
  // style. If one ever does, move this entry out and add foreground.
  "components/ListRow.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Source with comments blanked, so prose about `android_ripple` is not scanned. */
function code(abs: string): string {
  return readFileSync(abs, "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

type Site = { file: string; snippet: string };

function ripplesIn(abs: string): Site[] {
  const src = code(abs);
  const file = relative(SRC, abs).split("\\").join("/");
  const out: Site[] = [];
  let i = src.indexOf("android_ripple");
  while (i !== -1) {
    // The prop value plus the style that follows it on the same element. 900
    // chars comfortably spans the largest of these call sites.
    out.push({ file, snippet: src.slice(i, i + 900) });
    i = src.indexOf("android_ripple", i + 1);
  }
  return out;
}

const SITES = walk(SRC).flatMap(ripplesIn);

describe("android_ripple and theme repainting", () => {
  it("finds the ripple call sites at all", () => {
    // Guards the scanner itself: a rename or a moved folder must fail loudly
    // rather than silently vacuously passing.
    expect(SITES.length).toBeGreaterThanOrEqual(15);
  });

  it("uses a foreground ripple wherever the rippled view has a background", () => {
    const offenders = SITES.filter((s) => {
      if (NO_BACKGROUND_OF_ITS_OWN.includes(s.file)) return false;
      if (!/backgroundColor\s*:/.test(s.snippet)) return false;
      return !/foreground\s*:\s*true/.test(s.snippet);
    }).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("keeps the reported screen's chips on a foreground ripple", () => {
    // The exact surface from the bug report, pinned by name so a refactor that
    // moves these chips cannot quietly drop the fix.
    const analytics = SITES.filter((s) => s.file === "features/analytics/AnalyticsDashboard.tsx");
    expect(analytics.length).toBe(2);
    for (const s of analytics) {
      expect(/foreground\s*:\s*true/.test(s.snippet)).toBe(true);
    }
  });

  it("gives the chips fixed in this round a translucent ripple", () => {
    // A foreground ripple paints OVER the label, so these sites use rgba()/
    // tint() rather than an opaque palette token.
    //
    // Scoped to the sites this round changed, ON PURPOSE. It is tempting to
    // assert translucency for EVERY foreground ripple, but the app already
    // ships opaque ones that predate this rule and look fine — Button.tsx
    // (`ripple`), features/arena/ui.tsx (`arena.panel2`) and ContactMap.tsx
    // (`tokens.chipBg`). A test whose allowlist is longer than its signal is
    // not worth having, and widening this one would mean changing working code
    // that has nothing to do with the theme-repaint bug.
    const CHANGED = [
      "features/analytics/AnalyticsDashboard.tsx",
      "features/parent/ui.tsx",
      "app/(parent)/leaderboard.tsx",
      "features/notifications/components.tsx",
      "components/LocaleSwitcher.tsx",
    ];
    const opaque = SITES.filter((s) => {
      if (!CHANGED.includes(s.file)) return false;
      const m = /color\s*:\s*([^\n]*)/.exec(s.snippet);
      if (!m) return false;
      // Whole expression to end of line: these are often ternaries, so stopping
      // at the first comma would read the condition instead of the colour.
      return !/rgba\(|tint\(/.test(m[1]);
    }).map((s) => s.file);
    expect(opaque).toEqual([]);
  });
});
