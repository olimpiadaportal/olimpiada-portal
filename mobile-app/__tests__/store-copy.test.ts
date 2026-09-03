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
//
// WHY IT NOW SWEEPS EVERYTHING (2026-08-31, after Apple's 3.1.1 rejection).
// It used to check 30 hand-listed FAQ/carousel keys plus `trial.*` — and its own
// BANNED list would have failed a dozen SHIPPED keys had it looked at them
// (`poly.buyNow` = "Əldə et"/"Get it", `sub.discount.hint` = the 10%/15%
// schedule, `ana.locked` = "Subscribe to unlock…"). A sweep that passes by not
// looking is not a check. It now walks the whole effective catalogue, and the
// only way out is an entry in ALLOWED or KNOWN_GAPS below — each of which
// someone had to justify in writing.
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
 * Whole-word match that works in all three languages.
 *
 * JS `\b` is defined on `[A-Za-z0-9_]`, so `/\bƏldə/` and `/\bкупить/` NEVER
 * match — the boundary needs a word character on the ASCII side of it and `Ə`/`к`
 * are not word characters. That is not hypothetical: the Cyrillic entries in the
 * previous version of this list (`/\bкупит/`, `/\bскидк/`, `/\bподписатьс/`)
 * were inert, which is why "Купить" and "скидка" passed a test whose stated job
 * was to catch them. Leading `(?:^|[^\p{L}\p{N}])` consumes one separator
 * instead, which is fine for a boolean test.
 */
function word(alternatives: string): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "iu");
}

/**
 * Tokens that must not appear in copy the binary renders.
 *
 * Percent signs and digit-percent pairs are here because a DISCOUNT SCHEDULE is
 * commercial information about a purchase even though it names no currency —
 * that is precisely what slipped through last time.
 *
 * Stems (`endirim`, `скидк`, `qiymət`) are matched as substrings on purpose:
 * Azerbaijani and Russian inflect, and `endirimi`/`скидках` are the same claim.
 */
const BANNED: [RegExp, string][] = [
  [word("azn"), "currency code"],
  [/₼/u, "manat sign"],
  [/manat/iu, "currency word"],
  [/\d\s*%/u, "a percentage — discount schedules are commercial information"],
  [/olympiq\.ai/iu, "the website URL"],
  [/https?:\/\//iu, "an external URL"],
  [/\{price\}|\{amount\}/iu, "a price placeholder"],
  // `{total}` is deliberately NOT banned: news.page.indicator is "Page {current}
  // of {total}". Pagination is not commerce.
  [/endirim/iu, "discount (az)"],
  [word("discount|discounts|discounted"), "discount (en)"],
  [/скидк/iu, "discount (ru)"],
  // "qiymətləndirmə" is Azerbaijani for ASSESSMENT and is all over the test
  // screens, so the price stem excludes it rather than being dropped entirely.
  [/qiymət(?!ləndir)/iu, "price (az)"],
  [word("price|prices|pricing"), "price (en)"],
  [word("цена|цены|цену|цене|ценам|ценах"), "price (ru)"],
  [/стоимост/iu, "price (ru)"],
  [/abunə ol/iu, "subscribe CTA (az)"],
  [/satın al/iu, "buy (az)"],
  // `poly.buyNow` — the exact string §11 of the compliance doc tells the
  // submitter to grep the release bundle for.
  [/əldə et/iu, "get-it CTA (az)"],
  [word("subscribe"), "subscribe CTA (en)"],
  [word("buy|purchase|purchases"), "buy (en)"],
  [word("get it"), "get-it CTA (en)"],
  [/купит|покупк|приобрест/iu, "buy (ru)"],
  [/подписатьс|подпишит|оформите подписку/iu, "subscribe CTA (ru)"],
  // NOT banned: "получить". It is ordinary Russian for "obtain" and appears in
  // the privacy policy ("получить копию" — request a copy). The CTA it labelled,
  // poly.buyNow, is dropped from the catalogue by sync-i18n.mjs instead. A
  // pattern that fires on innocent copy gets allowlisted into uselessness.
  [/sınaq müddəti|sınağı başlad/iu, "trial promise (az)"],
  [/free trial|start the trial/iu, "trial promise (en)"],
  [/пробный период/iu, "trial promise (ru)"],
  [/pay now|indi ödə|оплатить|к оплате/iu, "pay-now CTA"],
];

/** Every key the app can resolve: the synced web catalogue plus the overlay. */
const CATALOGUE_KEYS: string[] = Array.from(
  new Set([
    ...LOCALES.flatMap((l) => Object.keys(messages[l] ?? {})),
    ...LOCALES.flatMap((l) => Object.keys(mobileMessages[l] ?? {})),
  ]),
).sort();

/**
 * Copy that trips a pattern above and is nonetheless CORRECT in the binary.
 *
 * Every entry needs a reason, and the reason has to be about what the string
 * SAYS, not about how much work it would be to change. The bar: a store
 * reviewer who reads the whole string is reassured by it, not alarmed.
 *
 * Almost all of these are the privacy policy, and they trip the list because
 * they are NEGATIVE statements about commerce — "a child can never buy
 * anything", "no price, no payment option and no purchase button is displayed",
 * "there is no checkout in the mobile app". Deleting them to satisfy a regex
 * would remove the very disclosures that document the posture.
 */
const ALLOWED: Record<string, string> = {
  "privacy.s1.dont":
    "«There is no checkout in the mobile app — purchases happen only on the website.» A statement that the app has no checkout.",
  "privacy.s3.points":
    "«A child can never buy anything. This is enforced on the server, not merely hidden.» The child-safety disclosure itself.",
  "privacy.s5.never":
    "«We never encourage a child to buy anything. No price, no payment option and no purchase button is displayed in a student session.» Names the ban in order to disclaim it.",
  "privacy.s8.list":
    "The payments section of the privacy policy: no card form in the app, a full redirect to the bank, PAN/CVV never reaching our servers, and what the database keeps. It names the currency ('in Azerbaijani manat') as a data-processing fact — no amount, no CTA, no URL. Required disclosure; judged to read as reassurance, not steering.",
  "privacy.s9.erased":
    "The account-deletion inventory — «subscriptions, access entitlements, discount and coupon records» is a category of DATA that gets erased, not an offer.",
  "privacy.s9.survivesTable":
    "The retention table — «Payment and purchase records | Accounting and tax obligations | Anonymised». A legal retention basis, not an offer.",
  "privacy.s10.caveat":
    "«no system on the internet is 100% secure» — the percentage is a security caveat, not a discount.",
  // State words are not offers. The app must be able to SAY what a family
  // already has; it just must not sell them anything.
  "subscription.status.trialing":
    "A STATE label on the parent's existing subscription ('Trial' / 'Sınaq müddəti'), rendered via subStatusKey(). It reports what the server says the family already has; it promises nothing and offers nothing.",
};

/**
 * Real violations that are NOT fixed yet, tracked so they cannot multiply.
 *
 * This is not a second allowlist. Every key here is copy a user can reach that
 * a reviewer would count against us, and each one is fixed by an override in
 * src/i18n/messages.mobile.ts (the same instrument that fixed faq.a7). The test
 * below asserts each entry STILL trips a pattern, so a fixed one has to be
 * deleted from this list rather than left as cover.
 */
/**
 * EMPTY, AND THAT IS THE POINT — as of 2026-09-01 the sweep exempts nothing.
 *
 * It held the two cancel-sheet strings («The price isn't right for me» and
 * «Your current trial period and earned discount»), the last purchasing copy a
 * parent could reach on Android. Both are now rewritten in access language in
 * messages.mobile.ts, so both had to be deleted from here: the assertion below
 * requires every entry to STILL trip a pattern, which means a fixed key cannot
 * be left behind as cover.
 *
 * Keep the mechanism even while it is empty. A new gap found mid-round needs a
 * place to be recorded that is visible and self-expiring, and deleting the list
 * would push the next one into ALLOWED — where nothing ever re-checks it.
 */
const KNOWN_GAPS: Record<string, string> = {};

describe("no copy in the binary sells anything", () => {
  it("has a catalogue to sweep at all", () => {
    // If the sync has not run, every sweep below would be vacuously green.
    expect(CATALOGUE_KEYS.length).toBeGreaterThan(1000);
  });

  for (const locale of LOCALES) {
    it(`${locale}: the whole catalogue is clean`, () => {
      const failures: string[] = [];
      for (const key of CATALOGUE_KEYS) {
        if (key in ALLOWED || key in KNOWN_GAPS) continue;
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

  it("the patterns actually fire on the copy that was removed", () => {
    // A sweep is only as good as its list, and the previous list looked
    // thorough while being blind to every Cyrillic entry in it. These are the
    // real strings that shipped in the rejected build; each must be caught.
    const shouldTrip = [
      "Əldə et", // poly.buyNow (az)
      "Get it", // poly.buyNow (en)
      "Confirm and buy", // poly.modal.confirm (en)
      "Купить", // oly3.buy (ru)
      "Bu fənnin analitikasını açmaq üçün abunə olun.", // ana.locked (az)
      "Subscribe to unlock this subject's analytics.", // ana.locked (en)
      "İkinci övlad üçün 10% endirim", // sub.discount.hint (az)
      "скидка применяется автоматически", // pricing2.sibling.body (ru)
      "Base price", // sub.base (en)
      "Qiymət", // poly.price (az)
      "Цена", // poly.price (ru)
      "27,00 AZN",
      "for the price of a cup of coffee", // about.vision.body (en)
      "Start 7-day free trial", // sub.submit (en)
      "https://olympiq.ai/pricing",
    ];
    const missed = shouldTrip.filter((s) => !BANNED.some(([p]) => p.test(s)));
    expect(missed).toEqual([]);

    // WHAT THIS LIST CANNOT CATCH, and why the keys are DELETED rather than
    // merely swept: the Azerbaijani buy imperative is the bare verb "al"
    // ("Al" = oly3.buy, "Təsdiqlə və al" = poly.modal.confirm). Banning "al" as
    // a word would fire on "almaq", "alın", "alt", ordinary sentences — a
    // pattern nobody could keep. Pattern matching is the second line here; the
    // first is that sync-i18n.mjs does not put these strings in the bundle.
    expect(BANNED.some(([p]) => p.test("Təsdiqlə və al"))).toBe(false);
  });

  it("does not fire on ordinary copy the app legitimately renders", () => {
    // The other half of the same guarantee: a pattern that cries wolf gets
    // allowlisted into uselessness, so the known false-positive shapes are
    // pinned here too.
    const shouldPass = [
      "Qiymətləndirmə", // az for ASSESSMENT, on the test setup screen
      "Mövzunu qiymətləndirmək üçün ən azı 3 cavab lazımdır",
      "Səhifə 2 / 5", // news pagination
      "Page 2 of 5",
      "получить копию", // ru "obtain a copy", privacy policy
      "Fənləri seç",
    ];
    const tripped = shouldPass.filter((s) => BANNED.some(([p]) => p.test(s)));
    expect(tripped).toEqual([]);
  });

  it("keeps the allowlist honest — no entry that is already clean", () => {
    // An allowlist entry for copy that no longer trips anything is dead cover:
    // it silently exempts a key from every FUTURE pattern too.
    const stale: string[] = [];
    for (const key of Object.keys(ALLOWED)) {
      const trips = LOCALES.some((l) => {
        const v = effective(l, key);
        return v.length > 0 && BANNED.some(([p]) => p.test(v));
      });
      if (!trips) stale.push(key);
    }
    expect(stale).toEqual([]);
  });

  it("keeps the known-gap list honest — no entry that is already fixed", () => {
    const fixed: string[] = [];
    for (const key of Object.keys(KNOWN_GAPS)) {
      const trips = LOCALES.some((l) => {
        const v = effective(l, key);
        return v.length > 0 && BANNED.some(([p]) => p.test(v));
      });
      if (!trips) fixed.push(key);
    }
    expect(fixed).toEqual([]);
  });
});

/**
 * Every FAQ entry the FAQ screen renders. `QUESTION_COUNT = 10` in
 * app/(public)/faq.tsx, and it renders q1..q10 / a1..a10 unconditionally for
 * BOTH roles — there is no role gate on that screen. The carousel is the
 * pre-login onboarding, `carousel.i${n}` for n = 1..5.
 *
 * These two families are built from TEMPLATE LITERALS, so nothing else in the
 * toolchain notices when a member goes missing — `t()` returns the key and the
 * user reads "faq.a7" off the screen. The sweep above only proves what exists is
 * clean; this proves the rendered set still exists.
 */
describe("the dynamically-built public surfaces still resolve", () => {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i += 1) keys.push(`faq.q${i}`, `faq.a${i}`);
  for (let i = 1; i <= 5; i += 1) keys.push(`carousel.i${i}.title`, `carousel.i${i}.body`);

  for (const locale of LOCALES) {
    it(`${locale}: every FAQ and carousel slot has copy`, () => {
      const empty = keys.filter((k) => effective(locale, k).length === 0);
      expect(empty).toEqual([]);
    });
  }
});

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

/**
 * The dead commerce strings dropped after Apple's 3.1.1 rejection (2026-08-31).
 *
 * These are NOT rendered by any screen — that was verified key by key before
 * they were removed — so their only effect was to sit in the bundle waiting for
 * the grep that §11 of the compliance doc tells the submitter to run. If someone
 * "restores the missing keys" in sync-i18n.mjs, this is what says no.
 */
describe("the dropped commerce vocabulary stays out of the bundle", () => {
  const MUST_BE_ABSENT = [
    "poly.buyNow", // "Əldə et" / "Get it" — named in the compliance checklist
    "poly.buy",
    "poly.modal.confirm", // "Confirm and buy"
    "poly.det.price",
    "oly3.buy",
    "oly4.price",
    "pricing2.sibling.body", // the 10% / 15% sibling schedule
    "sub.discount.hint", // the same schedule again
    "sub.discount",
    "sub.base",
    "ana.locked", // "Subscribe to unlock this subject's analytics"
    "cfg.childNote",
    "plan.fromPrice",
    "subjedit.dueNowNote",
    "subjedit.startsToday",
    "subjedit.subjectPlanLine",
    "checkout.err.priceChanged",
    "checkout.payNow",
    "payres.title",
    "pay.payNow",
    "about.vision.body", // "for the price of a cup of coffee"
  ];

  it("is absent from the generated catalogue in all three locales", () => {
    const present: string[] = [];
    for (const locale of LOCALES) {
      for (const key of MUST_BE_ABSENT) {
        if (typeof messages[locale]?.[key] === "string") present.push(`${locale} ${key}`);
      }
    }
    expect(present).toEqual([]);
  });

  it("drops the whole web checkout and payment-result vocabulary", () => {
    // Prefix-level, because these are entire web FLOWS: a mobile screen cannot
    // render one of these keys without a checkout existing in the binary, which
    // is Apple 2.3.1(a) territory rather than a copy problem.
    const survivors = LOCALES.flatMap((l) =>
      Object.keys(messages[l] ?? {}).filter(
        (k) => k.startsWith("checkout.") || k.startsWith("payres.") || k.startsWith("terms."),
      ),
    );
    expect(survivors).toEqual([]);
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
