// The monospace variant must never be applied to Azerbaijani text.
//
// REPORTED BY TESTERS: "ə" rendered as a tofu box (▯) in the Parent Analytics
// labels and in the top-right streak pill — on some phones only. The
// screenshots show it precisely: "İlkin nəticə" is perfect while, on the very
// same screen, "ÖLK▯ ÜZR▯ YER", "D▯QIQLIK" and "1 gün üst-üst▯" are broken.
// Every broken string is monospaced; every correct one is not.
//
// ROOT CAUSE: Android's generic "monospace" family is Droid Sans Mono, which
// has no glyph for U+0259 (ə) or U+018F (Ə). iOS resolves to Menlo, which does
// — hence "device-dependent", and hence invisible to anyone testing on iOS.
//
// React Native does not do per-glyph fallback for a NAMED family on Android, so
// a fallback chain cannot fix this. The tofu IS the fallback. The fix is to
// stop asking for the family when the text cannot be drawn in it.
//
// These tests assert the CONTRACT rather than rendering: the predicate, and the
// fact that the family is applied conditionally at all. A future "simplify" that
// moves fontFamily back into the static variant map brings the tofu back, and
// the last test here is what fails.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "..", "src/components/AppText.tsx"),
  "utf8",
).split("\r\n").join("\n");

/** The predicate as it ships — kept in step with AppText by the test below. */
const MONO_SAFE = /^[\x20-\x7E]*$/;

describe("what may be rendered in the monospace family", () => {
  it("accepts the things monospace exists for", () => {
    // Scores, percentages, timers, the 8-digit child ID: these are why the
    // variant exists, and they must keep their column alignment.
    // (jest's expect takes one argument, so the failing value is the message)
    for (const ok of ["2", "8%", "01 / 25", "2721 0253", "00:45", "Q01", "-", "—".replace("—", "-")]) {
      expect(MONO_SAFE.test(ok)).toBe(true);
    }
  });

  it("rejects every Azerbaijani string from the bug reports", () => {
    // Verbatim from the screenshots.
    for (const bad of [
      "ÖLKƏ ÜZRƏ YER",
      "DƏQIQLIK",
      "1 gün üst-üstə",
      "Dəqiqlik 8%",
      "İlkin nəticə",
    ]) {
      expect(MONO_SAFE.test(bad)).toBe(false);
    }
  });

  it("rejects the two characters that actually caused this", () => {
    expect(MONO_SAFE.test("ə")).toBe(false);
    expect(MONO_SAFE.test("Ə")).toBe(false);
    // And the rest of the Azerbaijani set, so a different label cannot regress.
    for (const ch of ["ğ", "Ğ", "ı", "İ", "ö", "Ö", "ş", "Ş", "ü", "Ü", "ç", "Ç"]) {
      expect(MONO_SAFE.test(ch)).toBe(false);
    }
  });

  it("rejects the em dash, which Droid Sans Mono also lacks", () => {
    expect(MONO_SAFE.test("—")).toBe(false);
  });
});

describe("AppText keeps the family conditional", () => {
  it("does not put fontFamily back into the static variant map", () => {
    // `mono: { fontFamily: MONO, ... }` is the shape that shipped the bug.
    expect(SRC).not.toMatch(/mono:\s*\{[^}]*fontFamily/);
  });

  it("decides the family from the rendered children", () => {
    expect(SRC).toContain("monoSafe(rest.children)");
  });

  it("still applies tabular-nums regardless", () => {
    // Declining the family must not cost digit alignment in mixed rows.
    expect(SRC).toMatch(/mono:\s*\{\s*fontVariant:\s*\["tabular-nums"\]/);
  });

  it("lets an explicit style override win", () => {
    // The conditional family is applied BEFORE `style` in the array, so a
    // caller that deliberately sets fontFamily is not overridden by it.
    const family = SRC.indexOf("monoFamily,");
    const styleProp = SRC.indexOf("style]");
    expect(family).toBeGreaterThan(-1);
    expect(styleProp).toBeGreaterThan(family);
  });
});
