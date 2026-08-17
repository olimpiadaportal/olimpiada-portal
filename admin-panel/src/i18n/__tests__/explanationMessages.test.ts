// A missing i18n key is invisible to tsc AND to `next build`: getDict() returns
// messages[locale] with no cross-locale fallback and every consumer does
// `dict[k] ?? k`, so the key string itself renders on screen. The admin panel's
// known shape of this bug is a page that hands a component a HAND-PICKED key
// list instead of the full dictionary — the translation exists, and the label
// still shows up as "qexpl.perLocaleNote".
//
// These are the keys the multilingual-explanation work added. All three locales
// must carry real text, and the az/en/ru values must actually differ (a key
// "translated" by copying the Azerbaijani string across is the failure this
// repo's trilingual rule exists to prevent).
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

/** Rendered by QuestionForm (question create + edit modals). */
const EDITOR_KEYS = [
  "qfield.explanation",
  "qexpl.perLocaleNote",
  "qexpl.emptyFallback",
] as const;

/** Rendered by the bulk-import surfaces: BulkUploadModal (general bank),
 *  OlympiadCreateForm and OlympiadGradeBulkAppend (package pools), plus the
 *  per-grade JSON format block. */
const BULK_KEYS = ["bulk.explanationRule", "olyjson.rules"] as const;

const ALL = [...EDITOR_KEYS, ...BULK_KEYS];

describe("multilingual-explanation i18n", () => {
  for (const locale of locales) {
    it(`${locale}: every new key resolves to real text`, () => {
      const dict = messages[locale] as Record<string, string | undefined>;
      const missing = ALL.filter((k) => {
        const v = dict[k];
        return typeof v !== "string" || v.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }

  it("is genuinely translated, not the same string three times", () => {
    for (const key of ALL) {
      const values = locales.map((l) => (messages[l] as Record<string, string>)[key]);
      expect(new Set(values).size, `${key} is not translated per locale`).toBe(
        locales.length,
      );
    }
  });

  // The bulk hint names the JSON path an admin has to type. If the key drifts
  // away from the shape the templates emit, the documentation starts lying.
  it("the bulk rule names all three explanation paths", () => {
    for (const locale of locales) {
      const v = (messages[locale] as Record<string, string>)["bulk.explanationRule"];
      for (const loc of ["az", "en", "ru"]) {
        expect(v, `${locale}/${loc}`).toContain(`translations.${loc}.explanation`);
      }
    }
  });
});
