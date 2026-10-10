// A CHILD IS NEVER TOLD TO ASK A PARENT TO *BUY*.
//
// WHY THIS EXISTS. CLAUDE.md's Store & Payments Compliance rule names this
// exact sentence among the things that may never appear in a store build:
// "telling a child to ask a parent to BUY (use access/activation language)".
// The web catalogue says it anyway — correctly, because olympiq.ai is where
// purchasing legitimately happens — so these keys are rewritten for the binary
// in src/i18n/messages.mobile.ts, which wins over the synced web catalogue at
// runtime (src/i18n/index.ts, createT).
//
// It is also an anti-steering problem on both stores. Since the owner decision
// of 2026-10-10 Android sells through Google Play exactly like iOS through
// StoreKit — but ONLY on parent screens: a CHILD has no purchase surface on
// either platform. A purchase imperative in child copy therefore points away
// from the store rail, at a purchase somewhere else, and Azerbaijan gets no
// anti-steering relief (docs/STORE_PAYMENTS_COMPLIANCE.md). Android selling
// changed nothing in this file.
//
// WHY IT IS NOT COVERED BY store-copy.test.ts. That sweep is catalogue-wide, so
// it cannot ban the Azerbaijani buy verb: the imperative is the bare "al", and a
// pattern for it fires on "alt", "alov", "almaq" in innocent sentences — its own
// comment says so and pins the gap. Here the key set is three strings, so the
// stem CAN be banned, and that is the half the global sweep is blind to. The
// English "buy" and the Russian "купить" halves are caught in both places.
//
// IF THIS TEST FAILS: an override was deleted or reworded back into purchasing
// language. Fix the string, not the test.
import { messages } from "../src/i18n/messages.generated";
import { mobileMessages } from "../src/i18n/messages.mobile";

type Locale = "az" | "en" | "ru";
const LOCALES: Locale[] = ["az", "en", "ru"];

/** What the app actually renders: the overlay wins over the synced catalogue. */
function effective(locale: Locale, key: string): string {
  const overlay = mobileMessages[locale]?.[key];
  if (typeof overlay === "string") return overlay;
  return messages[locale]?.[key] ?? "";
}

/**
 * Every child-facing string whose web original tells the reader to have
 * something BOUGHT. All three render inside the student arena:
 *   oly4.buyNote     — the olympiad detail sheet (OlympiadsScreen.tsx)
 *   oly3.childNone   — the empty state of "My olympiads"
 *   oly5.errNoAccess — the refusal when a child opens a package they lack
 */
const CHILD_ACCESS_KEYS = ["oly4.buyNote", "oly3.childNone", "oly5.errNoAccess"];

/**
 * Purchase verbs, per language.
 *
 * `\b` is useless here — it is defined on [A-Za-z0-9_], so /\bкупить/ and
 * /\bƏldə/ never match. Leading `(?:^|[^\p{L}\p{N}])` consumes one separator
 * instead, which is all a boolean test needs.
 *
 * The Azerbaijani list is the inflections of "almaq" (to buy/take) that a
 * purchase sentence actually uses, anchored at a word start so "açılanda",
 * "valideyninlə" and other ordinary words containing the letters cannot trip
 * it. "satın al" (to purchase) and the payment stem "ödə-" are separate.
 */
const BUY_VERBS: [RegExp, string][] = [
  [
    new RegExp(
      "(?:^|[^\\p{L}\\p{N}])al(?:maq|mağ\\p{L}*|ması|ınıb|ıb|dı|ır|ın|sın|arsan)?(?![\\p{L}\\p{N}])",
      "iu",
    ),
    "the Azerbaijani buy verb (almaq)",
  ],
  [/satın\s*al/iu, "satın al (az, purchase)"],
  [/(?:^|[^\p{L}\p{N}])ödə(?:niş|yin|məli|məlidir)?(?![\p{L}\p{N}])/iu, "a payment verb (az)"],
  [/(?:^|[^\p{L}\p{N}])(?:buy|buys|buying|bought|purchase|purchases|purchasing)(?![\p{L}\p{N}])/iu, "buy (en)"],
  [/(?:^|[^\p{L}\p{N}])(?:pay|pays|paying|paid)(?![\p{L}\p{N}])/iu, "pay (en)"],
  [/купит|купи|покуп|приобрет|оплат/iu, "buy or pay (ru)"],
];

describe("child-facing olympiad copy uses access language, never a purchase verb", () => {
  it("has the catalogues loaded at all", () => {
    // Without this a mis-resolved import would make every sweep below
    // vacuously green.
    expect(Object.keys(messages.az).length).toBeGreaterThan(1000);
    expect(Object.keys(mobileMessages.az).length).toBeGreaterThan(0);
  });

  for (const locale of LOCALES) {
    it(`${locale}: no purchase verb in what the child reads`, () => {
      const failures: string[] = [];
      for (const key of CHILD_ACCESS_KEYS) {
        const value = effective(locale, key);
        expect(value.length).toBeGreaterThan(0);
        for (const [pattern, why] of BUY_VERBS) {
          if (pattern.test(value)) failures.push(`${key} contains ${why}: ${JSON.stringify(value)}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("keeps an explicit override for every one of them, in all three locales", () => {
    // The generated catalogue is rebuilt from the web strings by
    // `npm run sync-i18n`, so without an overlay entry these keys silently
    // revert to the purchasing wording on the next sync. Pinned by NAME so a
    // deletion fails here rather than at review time.
    const missing: string[] = [];
    for (const locale of LOCALES) {
      for (const key of CHILD_ACCESS_KEYS) {
        if (typeof mobileMessages[locale]?.[key] !== "string") missing.push(`${locale} ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the patterns really fire on the wording they replaced", () => {
    // A sweep is only worth what its list catches. These are the web strings
    // these three keys override — if any stopped tripping, the test above would
    // be passing by not looking.
    const shouldTrip = [
      "Bu olimpiadaya qatılmaq üçün valideyninizdən paketi almağı xahiş edin.",
      "To join this olympiad, ask your parent to buy the package.",
      "Чтобы участвовать в этой олимпиаде, попросите родителя купить пакет.",
      "Paketi valideyn panelindən satın alın.",
      "Ask your parent to pay for the package.",
    ];
    const missed = shouldTrip.filter((s) => !BUY_VERBS.some(([p]) => p.test(s)));
    expect(missed).toEqual([]);
  });

  it("does not fire on the access wording that replaced it", () => {
    // The other half: a pattern that cries wolf gets relaxed into uselessness.
    const shouldPass = [
      "Bu olimpiadada iştirak etmək üçün valideyninlə danış — paket sənin üçün açılanda burada görünəcək.",
      "Hələ açıq olimpiada paketin yoxdur — valideyninlə danış.",
      "Bu olimpiadaya girişin yoxdur — valideyninlə danış.",
      "To take part in this olympiad, talk to your parent.",
      "Поговори с родителем — пакет появится здесь, когда его откроют для тебя.",
    ];
    const tripped = shouldPass.filter((s) => BUY_VERBS.some(([p]) => p.test(s)));
    expect(tripped).toEqual([]);
  });
});
