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
    // "Narrow" used to mean a narrow VIEWPORT (`@media (max-width: 640px)`),
    // which gave a 514px-wide card at a 600px viewport a 514px-wide button.
    // It now means a narrow CARD: the full-width rule is the unconditional
    // base and the >=480px container query hands the width back.
    expect(pass).toMatch(/\.splan-remove\s*\{[^}]*width:\s*100%[^}]*order:\s*3/);
    expect(blockAt(pass, "@container splan (min-width: 480px)")).toMatch(
      /\.splan-remove\s*\{[^}]*width:\s*auto/,
    );
  });

  it("lets a long Azerbaijani subject name wrap instead of truncating", () => {
    // The chip beside it is `flex: none`, so the name was the only thing left
    // to shrink once the remove control had real width — and it ellipsised.
    expect(pass).toMatch(/\.splan-subject\s*\{[^}]*white-space:\s*normal/);
    expect(pass).toMatch(/\.splan-subject\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(pass).toMatch(/\.splan-name\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  // THE TEST ABOVE PASSED WHILE THE BUTTON SHOWED "plan.removeSubject" ON
  // SCREEN. It proved the key was translated; it could not prove the key ever
  // reached the component. SubjectPlanCard is handed `t` by pages that build a
  // FIXED dict — `tt = (k) => dict[k] ?? k` — so a key the page's KEYS array
  // omits falls through to the key itself, however well translated it is.
  // This closes that gap for every page that hosts the card.
  it("is opted into the KEYS dict of every page that renders the card", () => {
    const hosts = [
      "../(parent)/children/[id]/subscribe/page.tsx",
      "../(parent)/children/new/page.tsx",
    ];
    for (const rel of hosts) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
      // Every key the card renders through the injected `t`. A page missing any
      // of them ships a raw key, which is the defect this guards.
      for (const key of ["plan.removeSubject", "plan.removeAria"]) {
        expect(
          src.includes(`"${key}"`),
          `${rel} builds its dict without "${key}", so the card renders the raw key`,
        ).toBe(true);
      }
    }
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

// ===========================================================================
// P8 — "the subject cards overlap" (Parent Panel -> Add a Child -> Subjects).
//
// The card switched to its three-column row from `@media (min-width: 720px)`,
// a VIEWPORT test, while every host renders it inside a fixed ~520-600px
// column (`.wiz-page .form` is 520px). The two `auto` tracks (cycle rail,
// price) take their max-content first; the name track is `minmax(0, 1fr)` so
// its minimum is 0 and it absorbs the whole shortfall. `.splan-remove` inside
// it is `flex: none; white-space: nowrap` — it could not shrink, so it spilled
// across the cycle rail.
//
// The trigger is LOCALE: the rail's max-content is its widest label times
// three, ~200px in en but ~244px in az and ~318px in ru, which is why the
// English rendering looked fine. These checks pin the container-driven layout
// that replaced it.
// ===========================================================================
describe("subject plan card: container-driven layout (no overlap)", () => {
  it("makes the card's list an inline-size query container", () => {
    // Without this, every `@container splan (...)` rule below is inert and the
    // card silently falls back to the stacked base.
    expect(pass).toMatch(/\.splan-list\s*\{[^}]*container-type:\s*inline-size/);
    expect(pass).toMatch(/\.splan-list\s*\{[^}]*container-name:\s*splan/);
  });

  it("never sizes the card from the viewport", () => {
    // The exact query that shipped the bug. Asserted against the WHOLE file:
    // re-adding it anywhere re-opens the overlap.
    expect(css).not.toMatch(/@media[^{]*min-width:\s*720px/);
    // And no `.splan-card` rule may live inside a width media query at all.
    for (const media of css.matchAll(/@media[^{]*\((?:max|min)-width[^{]*\{/g)) {
      const body = blockAt(css.slice(media.index!), "@media");
      expect(body, "a width media query still lays out .splan-card").not.toMatch(
        /\.splan-card\s*\{/,
      );
    }
  });

  it("puts both multi-column layouts behind a container query", () => {
    // Two rows at >=480px (the name, then the rail and its price together) and
    // the single row at >=640px. Both thresholds are widths the CARD has.
    expect(blockAt(pass, "@container splan (min-width: 480px)")).toMatch(
      /\.splan-card\s*\{[^}]*grid-template-areas:[^}]*"plan\s+price"/,
    );
    const wide = blockAt(pass, "@container splan (min-width: 640px)");
    expect(wide).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto/);
    // The three-track row must exist in exactly one place — the wide container
    // query — so it cannot be reintroduced unconditionally somewhere above.
    const threeTrack = [
      ...css.matchAll(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto/g),
    ];
    expect(threeTrack.length).toBe(1);
  });

  it("caps the unshrinkable children of the name cell so they cannot escape it", () => {
    // `.splan-chip` and `.splan-remove` are both `flex: none`; the pill
    // escaping its collapsed grid column IS the reported overlap. The cap makes
    // that impossible even for a translation longer than any shipped today.
    expect(pass).toMatch(/\.splan-chip,[^{}]*\.splan-remove\s*\{[^}]*max-width:\s*100%/);
    // ...and the pill's label may take a second line rather than push out.
    expect(pass).toMatch(/\.splan-remove\s*\{[^}]*white-space:\s*normal/);
  });

  it("lets the cycle labels wrap on a narrow card instead of ellipsising", () => {
    // `flex: 1 1 0` sizes every segment to the WIDEST label and can then only
    // shrink, so a rail short of room ellipsised — "Еженедельно" became
    // "Еженеде…". An `auto` basis keeps natural widths and wraps instead. The
    // equal thirds come back only in the wide row, where the rail has the space
    // for 3x its widest label.
    expect(pass).toMatch(/\.splan-seg-item\s*\{[^}]*flex:\s*1 1 auto/);
    expect(blockAt(pass, "@container splan (min-width: 640px)")).toMatch(
      /\.splan-seg-item\s*\{[^}]*flex:\s*1 1 0/,
    );
  });

  it("gives the card's cycle rail a fill for the shared sliding pill", () => {
    // `.seg-track[data-seg="on"] > *` strips `.splan-seg-item.is-on`'s own
    // background and hands the highlight to the pill. With no `--seg-fill` the
    // pill is transparent, so once <Segmented> measured, the SELECTED cycle had
    // no fill at all.
    expect(pass).toMatch(/\.splan-seg\[data-seg\]\s*\{[^}]*--seg-fill:/);
  });
});
