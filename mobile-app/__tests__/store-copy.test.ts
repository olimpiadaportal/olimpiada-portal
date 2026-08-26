// The copy that ships in the store binary must not sell anything.
//
// WHY THIS TEST EXISTS. The apps are PURCHASE-SILENT BY ARCHITECTURE
// (docs/STORE_PAYMENTS_COMPLIANCE.md §4/§5): purchasing happens on the web only,
// so no price, no purchase verb and no discount schedule may appear in the
// binary — and since parent and child share ONE binary, that applies to every
// surface, not just the child's.
//
// The 2026-08-18 compliance pass rewrote the FAQ entries it knew about (q3/a3,
// q6/a6) and MISSED two. `faq.a7` went on shipping the sibling-discount schedule
// — "10% for the 2nd child and 15% for the 3rd and subsequent children" — in all
// three languages, and the FAQ row in the account sheet is not role-gated, so a
// signed-in CHILD reached a discount table in two taps.
//
// A hand audit found that once. This test is what stops it coming back: it
// checks the EFFECTIVE copy (the generated web catalogue with the mobile overlay
// applied, exactly as the app resolves it), so a leak reintroduced upstream in
// the shared web strings fails here unless the overlay covers it.
import { messages } from "../src/i18n/messages.generated";
import { mobileMessages } from "../src/i18n/messages.mobile";

type Locale = "az" | "en" | "ru";
const LOCALES: Locale[] = ["az", "en", "ru"];

/** What the app actually renders: overlay wins over the generated catalogue. */
function effective(locale: Locale, key: string): string {
  const overlay = mobileMessages[locale]?.[key];
  if (typeof overlay === "string") return overlay;
  return messages[locale]?.[key] ?? "";
}

/**
 * Tokens that must not appear in copy the binary renders.
 *
 * Percent signs and digit-percent pairs are here because a DISCOUNT SCHEDULE is
 * commercial information about a purchase even though it names no currency —
 * that is precisely what slipped through last time.
 */
const BANNED: [RegExp, string][] = [
  [/\bAZN\b/i, "currency code"],
  [/₼/, "manat sign"],
  [/\bmanat\b/i, "currency word"],
  [/\d\s*%/, "a percentage — discount schedules are commercial information"],
  [/olympiq\.ai/i, "the website URL"],
  [/https?:\/\//i, "an external URL"],
  [/\bendirim\b/i, "discount (az)"],
  [/\bdiscount\b/i, "discount (en)"],
  [/\bскидк/i, "discount (ru)"],
  [/\babunə ol\b/i, "subscribe CTA (az)"],
  [/\bsatın al/i, "buy (az)"],
  [/\bsubscribe\b/i, "subscribe CTA (en)"],
  [/\bкупит/i, "buy (ru)"],
  [/\bподписатьс/i, "subscribe CTA (ru)"],
  [/\bsınaq müddəti|\bsınağı başlad/i, "trial promise (az)"],
  [/\bstart the trial\b|\bfree trial\b/i, "trial promise (en)"],
  [/пробный период/i, "trial promise (ru)"],
];

/**
 * Every FAQ entry the FAQ screen renders. `QUESTION_COUNT = 10` in
 * app/(public)/faq.tsx, and it renders q1..q10 / a1..a10 unconditionally for
 * BOTH roles — there is no role gate on that screen.
 */
const FAQ_KEYS: string[] = [];
for (let i = 1; i <= 10; i += 1) {
  FAQ_KEYS.push(`faq.q${i}`, `faq.a${i}`);
}

/**
 * The pre-login onboarding carousel. Included because the SAME miss happened
 * here: the 2026-08-18 pass overrode slide 2's BODY and left its TITLE reading
 * "Choose subjects & start the trial" -- a commerce promise in the first thing a
 * reviewer sees, in a binary whose review note says nothing can be purchased.
 */
const CAROUSEL_KEYS: string[] = [];
for (let i = 1; i <= 5; i += 1) {
  CAROUSEL_KEYS.push(`carousel.i${i}.title`, `carousel.i${i}.body`);
}

describe("copy shipped in the binary sells nothing", () => {
  for (const locale of LOCALES) {
    for (const key of [...FAQ_KEYS, ...CAROUSEL_KEYS]) {
      it(`${locale} ${key}`, () => {
        const value = effective(locale, key);
        expect(value.length).toBeGreaterThan(0);
        for (const [pattern, why] of BANNED) {
          if (pattern.test(value)) {
            throw new Error(
              `${locale} ${key} contains ${why}: ${JSON.stringify(value)}`,
            );
          }
        }
      });
    }
  }
});

/**
 * The 1-day free access strings (web migrations 139-142).
 *
 * WHY THESE NEED THEIR OWN SWEEP. sync-i18n.mjs copies the web catalogue
 * WHOLESALE, so any web string lands in the binary — and the swept set above is
 * a hardcoded 30 keys, which is exactly how "Choose subjects & start the trial"
 * shipped unswept last time. Every `trial.*` key that survives the sync is
 * checked here, derived from the catalogue rather than listed by hand, so a new
 * one cannot be added without being covered.
 */
describe("the free-access copy sells nothing either", () => {
  const trialKeys = Array.from(
    new Set(
      LOCALES.flatMap((l) => Object.keys(messages[l] ?? {})).filter((k) =>
        k.startsWith("trial."),
      ),
    ),
  ).sort();

  it("has trial keys to check at all", () => {
    // If this fails the sync has not been run since the web keys were added,
    // and the sweep below would be vacuously green.
    expect(trialKeys.length).toBeGreaterThan(0);
  });

  for (const locale of LOCALES) {
    it(`${locale}: no purchase language in any trial string`, () => {
      const failures: string[] = [];
      for (const key of trialKeys) {
        const value = effective(locale, key);
        if (!value) continue;
        for (const [pattern, why] of BANNED) {
          if (pattern.test(value)) {
            failures.push(`${key} contains ${why}: ${JSON.stringify(value)}`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("keeps the WEB-ONLY activation vocabulary out of the binary entirely", () => {
    // Activation happens on the web. Its hero, picker, confirm, success and
    // error strings are correct there and have no business inside a store
    // build — `trial.hero.body` reads "before you subscribe" in English.
    // sync-i18n.mjs drops them rather than trusting that no screen renders
    // them; if that exclusion is removed, this fails.
    const leaked: string[] = [];
    for (const locale of LOCALES) {
      for (const key of [
        "trial.hero.body",
        "trial.hero.title",
        "trial.cta.activate",
        "trial.confirm.ok",
        "trial.expired.body",
        "trial.expired.cta",
      ]) {
        if (typeof messages[locale]?.[key] === "string") {
          leaked.push(`${locale} ${key}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });
});

describe("the two entries the earlier compliance pass missed", () => {
  it("overrides faq.a5 and faq.a7 in all three locales", () => {
    // Pinned by NAME as well as by content: the generated catalogue is
    // regenerated from the web strings, so without an overlay entry these two
    // would silently revert to the versions that named a discount schedule.
    // Jest's `expect` takes exactly ONE argument — the second-argument message
    // form is vitest's. Collect the misses and report them by name instead.
    const missing: string[] = [];
    for (const locale of LOCALES) {
      for (const key of ["faq.q5", "faq.a5", "faq.q7", "faq.a7"]) {
        if (typeof mobileMessages[locale]?.[key] !== "string") {
          missing.push(`${locale} ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("answers the multi-child question without pricing it", () => {
    // The question is still useful — a parent genuinely wants to know how
    // several children work. It just answers with mechanics, not money.
    expect(effective("en", "faq.a7")).toMatch(/8-digit ID/);
    expect(effective("en", "faq.a7")).not.toMatch(/\d\s*%/);
  });
});
