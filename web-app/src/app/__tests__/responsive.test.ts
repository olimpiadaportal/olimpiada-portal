// RESPONSIVE CONTRACT GUARD.
//
// There is no browser harness in this repo (vitest, node environment, and jsdom
// has no layout engine), so nothing here can prove a page does not overflow at
// 320px. What it CAN do is pin the specific rules the responsive pass added, so
// a later edit cannot quietly delete them and re-open a fixed bug. Each check
// names the failure it prevents; if one starts failing, read the comment before
// deleting the assertion.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const css = readFileSync(fileURLToPath(new URL("../globals.css", import.meta.url)), "utf8");
const card = readFileSync(
  fileURLToPath(new URL("../../components/SubjectPlanCard.tsx", import.meta.url)),
  "utf8",
);

/** The appended pass. Everything below is asserted against THIS slice, so a
 *  match somewhere else in the 13.7k-line file cannot satisfy a check. */
const pass = css.slice(css.indexOf("RESPONSIVE PASS"));

/** Body of the first at-rule/selector block starting at `marker`, brace-balanced. */
function blockAt(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing block: ${marker}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unbalanced block: ${marker}`);
}

describe("responsive pass is present in globals.css", () => {
  it("appends its own block rather than editing rules above", () => {
    expect(pass.length).toBeGreaterThan(1000);
  });

  it("raises every undersized control to the 44px touch floor, touch-only", () => {
    // These eleven were measured at 26-38px. The floor is applied in ONE
    // `pointer: coarse` rule so desktop cannot be affected — if this block ever
    // loses its media query, or a selector drops out of the list, a control
    // silently goes back under the touch floor with nothing to show for it.
    const coarse = blockAt(pass, "@media (pointer: coarse)");
    // The selector list of the rule that actually carries the floor — not the
    // whole media block. `.lang-btn` and `.ntf-toast-x` are also named by the
    // centring rule beside it, so a block-wide search would keep passing after
    // one of them was dropped from the sizing list.
    const floor = /([^{}]+)\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px[^}]*\}/.exec(coarse);
    expect(floor, "no rule in the coarse block sets the 44px floor").not.toBeNull();
    const sized = floor![1];
    for (const selector of [
      ".splan-remove",
      ".splan-seg-item",
      ".pcfg-seg-item",
      ".theme-toggle",
      ".lang-btn",
      ".pw-eye",
      ".drawer-close",
      ".modal-close",
      ".oly4-close",
      ".ntf-toast-x",
      ".site-foot-social .social-icon",
    ]) {
      expect(sized, `${selector} lost its 44px floor`).toContain(selector);
    }
  });

  it("widens the password gutter wherever the eye button is enlarged", () => {
    // `.pw-eye` is absolutely positioned at `right: 6px` inside an input whose
    // padding-right is 42px. At 44px the button would sit ON the typed
    // password unless the gutter grows with it.
    const coarse = blockAt(pass, "@media (pointer: coarse)");
    expect(coarse).toMatch(/\.pw-field > input\s*\{[^}]*padding-right:\s*5[0-9]px/);
  });

  it("gives the arena a fluid gutter instead of a flat 26px", () => {
    // The old flat 26px each side left 268px of usable width at 320px, which is
    // what forced the `min(280px, 100%)` floors on the arena card grids.
    expect(pass).toMatch(/\.arena-main\s*\{[^}]*padding:\s*26px clamp\(16px,[^)]*\) 64px/);
  });

  it("lets the mini-stats fold instead of crushing three fixed columns", () => {
    expect(pass).toMatch(/\.arena-ministats\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(/);
  });

  it("un-sticks the leaderboard rank card on a short viewport", () => {
    // `position: sticky; bottom: 14px` parks it over the last rows of the board
    // the student came to read.
    expect(pass).toMatch(/@media \(max-width: 640px\)[^}]*\{[^}]*\.lb-me-card\s*\{[^}]*static/s);
  });
});

describe("subject plan card: remove action", () => {
  it("renders a labelled button, not a bare ×", () => {
    // The owner's named ask. The 28px glyph-only circle read as decoration next
    // to a subject name and was 16px under the touch floor.
    expect(card).toContain('t("plan.removeSubject")');
    // Matched as a JSX text node (`>×<`) rather than anywhere in the file — the
    // comment above the button still names the glyph it replaced.
    expect(card).not.toMatch(/>\s*×\s*</);
  });

  it("keeps the subject-specific screen-reader label and the disabled reason", () => {
    // The visible label cannot name the subject without making five stacked
    // cards unreadable, so the aria-label still carries it — and the "at least
    // one subject must remain" tooltip must survive the restyle.
    expect(card).toContain('t("plan.removeAria")');
    expect(card).toContain("removeDisabledReason");
  });

  it("is sized like the .pcfg-add pill it mirrors, and takes its own row when narrow", () => {
    expect(pass).toMatch(/\.splan-remove\s*\{[^}]*min-height:\s*40px/);
    expect(pass).toMatch(/@media \(max-width: 640px\)[^}]*\{[^}]*\.splan-remove\s*\{[^}]*width:\s*100%/s);
  });

  it("lets a long Azerbaijani subject name wrap instead of truncating", () => {
    // The chip beside it is `flex: none`, so the name was the only thing left
    // to shrink once the remove control had real width — and it ellipsised.
    expect(pass).toMatch(/\.splan-subject\s*\{[^}]*white-space:\s*normal/);
    expect(pass).toMatch(/\.splan-subject\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(pass).toMatch(/\.splan-name\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it("has a real translation in all three languages", () => {
    const seen = new Set<string>();
    for (const locale of locales) {
      const text = messages[locale]["plan.removeSubject"];
      expect(text, `plan.removeSubject missing for ${locale}`).toBeTruthy();
      expect(text.trim().length).toBeGreaterThan(0);
      seen.add(text);
    }
    // Catches the usual failure: the az string pasted into en/ru to make the
    // key resolve, which ships an untranslated button.
    expect(seen.size).toBe(locales.length);
  });
});
