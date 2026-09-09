// Two jobs:
//   1. lock the parser contract for the long-form legal copy, and
//   2. prove the privacy policy really is ONE document in THREE languages.
//
// (2) is the point. The policy exists as az/en/ru strings that a future edit
// will touch one at a time, and a policy that says different things to
// different regulators is a legal problem, not a cosmetic one. These checks
// fail the build the moment a language falls behind: a missing key, an empty
// value, a table that lost a column or a row.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  POLICY_TEXT_MAX,
  toPolicyLines,
  toPolicyList,
  toPolicyTable,
} from "@/lib/policyContent";
import { toParagraphs } from "@/lib/cmsParagraphs";
import { messages } from "@/i18n/messages";
import { locales, defaultLocale } from "@/i18n/config";
import { validateParentRegistration } from "@/lib/auth/parentValidation";

describe("toPolicyLines / toPolicyList", () => {
  it("returns one entry per non-blank line, trimmed", () => {
    expect(toPolicyLines("  first \n second\n")).toEqual(["first", "second"]);
  });

  it("drops blank lines instead of emitting empty bullets", () => {
    expect(toPolicyList("a\n\n\nb\n   \nc")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for undefined, null and empty input", () => {
    expect(toPolicyList(undefined)).toEqual([]);
    expect(toPolicyList(null)).toEqual([]);
    expect(toPolicyList("   \n  ")).toEqual([]);
  });

  // ---- PARITY WITH mobile-app/src/lib/policyContent.ts --------------------
  // These three cases exist verbatim in mobile-app/__tests__/policy-content.test.ts.
  // Both platforms render the SAME `privacy.*` strings, and an admin "Website
  // Content" override reaches both through the same t() chain — so if one
  // module normalises or bounds input and the other does not, one source string
  // becomes two different legal texts. Keep the pair identical.
  it("normalises CRLF and lone CR, so no invisible \\r survives into a cell", () => {
    expect(toPolicyLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
    expect(toPolicyTable("H1 | H2\r\nv1 | v2").rows).toEqual([["v1", "v2"]]);
  });

  it("bounds oversized input at POLICY_TEXT_MAX", () => {
    const lines = toPolicyLines("x".repeat(POLICY_TEXT_MAX + 500));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(POLICY_TEXT_MAX);
  });

  it("never truncates inside a surrogate pair", () => {
    // "😀" is two UTF-16 code units; landing the cap between them would leave a
    // lone high surrogate that renders as U+FFFD.
    const lines = toPolicyLines("y".repeat(POLICY_TEXT_MAX - 1) + "😀");
    expect(lines[0]).toHaveLength(POLICY_TEXT_MAX - 1);
    expect(lines[0]).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe("toPolicyTable", () => {
  it("takes the first line as the header and splits cells on |", () => {
    const { head, rows } = toPolicyTable("A | B | C\n1 | 2 | 3\n4 | 5 | 6");
    expect(head).toEqual(["A", "B", "C"]);
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("pads a short row so the renderer can never emit a ragged <tr>", () => {
    const { rows } = toPolicyTable("A | B | C\n1 | 2");
    expect(rows).toEqual([["1", "2", ""]]);
  });

  it("truncates an over-long row to the header's column count", () => {
    const { rows } = toPolicyTable("A | B\n1 | 2 | 3");
    expect(rows).toEqual([["1", "2"]]);
  });

  it("returns an empty table for empty input", () => {
    expect(toPolicyTable("")).toEqual({ head: [], rows: [] });
    expect(toPolicyTable(undefined)).toEqual({ head: [], rows: [] });
  });

  it("never produces markup — a cell holding HTML stays literal text", () => {
    const { rows } = toPolicyTable("A | B\n<script>x</script> | 2");
    expect(rows[0][0]).toBe("<script>x</script>");
  });
});

// ---------------------------------------------------------------------------
// The privacy policy is one document in three languages.
// ---------------------------------------------------------------------------

const PRIVACY_PREFIX = "privacy.";
const privacyKeys = Object.keys(messages[defaultLocale]).filter((k) =>
  k.startsWith(PRIVACY_PREFIX),
);
const otherLocales = locales.filter((l) => l !== defaultLocale);

describe("privacy policy i18n", () => {
  it("has copy to check (guards against the filter silently matching nothing)", () => {
    expect(privacyKeys.length).toBeGreaterThan(80);
    expect(privacyKeys).toContain("privacy.title");
    expect(privacyKeys).toContain("privacy.s13.title");
  });

  it.each(otherLocales)("%s defines every privacy.* key, non-empty", (locale) => {
    const missing = privacyKeys.filter((k) => !messages[locale][k]?.trim());
    expect(missing).toEqual([]);
  });

  it.each(otherLocales)("%s adds no privacy.* key the default locale lacks", (locale) => {
    const extra = Object.keys(messages[locale])
      .filter((k) => k.startsWith(PRIVACY_PREFIX))
      .filter((k) => !privacyKeys.includes(k));
    expect(extra).toEqual([]);
  });

  it("keeps every policy table the same shape in all three languages", () => {
    // Enumerated rather than pattern-matched: a renamed or dropped table must
    // fail here, not quietly leave the set smaller.
    const tableKeys = [
      "privacy.s4.parentTable",
      "privacy.s4.childTable",
      "privacy.s4.techTable",
      "privacy.s5.lb1Table",
      "privacy.s5.avatarTable",
      "privacy.s7.table",
      "privacy.s9.survivesTable",
      "privacy.s11.table",
      "privacy.s12.table",
    ];
    // `.table` or `…Table` — NOT a bare lowercase "table" ending, which would
    // also swallow `privacy.s4.childEditable`.
    expect(privacyKeys.filter((k) => /(\.table|Table)$/.test(k)).sort()).toEqual(
      [...tableKeys].sort(),
    );

    for (const key of tableKeys) {
      const reference = toPolicyTable(messages[defaultLocale][key]);
      expect(reference.head.length, `${key} header`).toBeGreaterThan(1);
      expect(reference.rows.length, `${key} rows`).toBeGreaterThan(0);

      for (const locale of otherLocales) {
        const translated = toPolicyTable(messages[locale][key]);
        expect(translated.head.length, `${key} (${locale}) column count`).toBe(
          reference.head.length,
        );
        expect(translated.rows.length, `${key} (${locale}) row count`).toBe(
          reference.rows.length,
        );
        // A missing "|" collapses a row into one cell and silently loses the
        // rest of the sentence in that language; padding would hide it.
        for (const [i, row] of translated.rows.entries()) {
          expect(
            row.filter((cell) => cell.length > 0).length,
            `${key} (${locale}) row ${i + 1} has an empty cell`,
          ).toBe(reference.head.length);
        }
      }
    }
  });

  it("keeps every policy list the same length in all three languages", () => {
    // Bullet/numbered blocks: one item per line. A translator dropping a line
    // means one language promises less (or more) than the others. Enumerated on
    // purpose — `privacy.s12.never` reads like a list key but is a single
    // sentence, so a pattern would produce a false positive.
    const listKeys = [
      "privacy.s1.do",
      "privacy.s1.dont",
      "privacy.s3.points",
      "privacy.s4.deviceList",
      "privacy.s4.cookiesList",
      "privacy.s5.never",
      "privacy.s5.removeList",
      "privacy.s6.use",
      "privacy.s6.not",
      "privacy.s7.other",
      "privacy.s8.list",
      "privacy.s9.erased",
      "privacy.s10.list",
    ];

    for (const key of listKeys) {
      const reference = toPolicyList(messages[defaultLocale][key]);
      expect(reference.length, `${key} items`).toBeGreaterThan(1);
      for (const locale of otherLocales) {
        expect(toPolicyList(messages[locale][key]).length, `${key} (${locale})`).toBe(
          reference.length,
        );
      }
    }
  });

  it("is never read from a client component", () => {
    // src/app/layout.tsx strips `privacy.*` out of the dictionary handed to the
    // client I18nProvider, because the policy body is 30–44 KB and that dict is
    // serialized into EVERY page's HTML. A "use client" file reading one of
    // these keys would silently render the raw key string — and putting them
    // back into the dict would re-add the payload to the whole site. Keys
    // arriving as an explicit prop are fine; this only catches catalog lookups.
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const source = readFileSync(full, "utf8");
        if (!/^\s*["']use client["']/.test(source)) continue;
        if (/["'`]privacy\.[a-zA-Z]/.test(source)) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("keeps the section titles the table of contents links to", () => {
    // <PrivacyPolicy/> renders anchors for s1..s13; a renamed key would render
    // the raw key string in the table of contents.
    for (let i = 1; i <= 13; i += 1) {
      for (const locale of locales) {
        expect(messages[locale][`privacy.s${i}.title`]?.trim()).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The enumeration and the fields actually collected cannot drift apart.
// ---------------------------------------------------------------------------
//
// `privacy.s4.childTable` and `privacy.s5.stored` are not a summary. They are an
// EXHAUSTIVE answer to "what is stored about my child", served at /privacy,
// /help/privacy and /child/help/privacy — the URL filed in App Store Connect's
// Privacy Policy field and standing behind the Play Data-safety declaration. A
// field that is collected but not listed does not leave the policy silent; it
// makes the policy FALSE, to parents and to two store reviewers.
//
// That is exactly what happened with the optional gender: migration 169's own
// header says "THE PRIVACY POLICY MUST SAY SO before the field is collected",
// and nothing enforced it, so the field shipped and the enumeration did not.
//
// ChildInfo is the anchor because it is the shape both Add-Child forms fill and
// the shape both mobile BFF routes accept — every parent-entered fact about a
// child passes through it. A new member fails the first test below BY NAME, and
// the fix is to disclose it in all three languages, never to widen the map.

/** The word that must appear in the policy, per language. */
type Disclosure = { az: string; en: string; ru: string };

// `null` = disclosed by another entry rather than undisclosed: the catalog ids
// are the SAME fact as the human field they resolve (districts = cities under
// the historic naming; see children.ts), and first/last name share one row.
const CHILD_FIELDS: Record<string, Disclosure | null> = {
  firstName: { az: "soyad", en: "last name", ru: "фамили" },
  lastName: null,
  city: { az: "şəhər", en: "city", ru: "город" },
  districtId: null,
  cityDistrictId: { az: "rayon", en: "district", ru: "район" },
  schoolName: { az: "məktəb", en: "school", ru: "школ" },
  schoolId: null,
  classGrade: { az: "sinif", en: "grade", ru: "класс" },
  gradeId: null,
  gender: { az: "cins", en: "gender", ru: "пол" },
};

/** Member names of `export type ChildInfo` in src/lib/auth/children.ts. */
function childInfoMembers(): string[] {
  const source = readFileSync(
    join(process.cwd(), "src", "lib", "auth", "children.ts"),
    "utf8",
  );
  const start = source.indexOf("export type ChildInfo = {");
  expect(start, "ChildInfo was renamed or moved — repoint this test").toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("};", start));
  // Property lines only: the `export type …` line has no `:` after an
  // identifier, and `//` comment lines never start with one.
  return [...body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]);
}

/** The row of a policy table whose first cell names `token`. */
function rowNaming(table: string, token: string): string[] | undefined {
  return toPolicyTable(table).rows.find((r) => r[0].toLowerCase().includes(token));
}

describe("privacy policy discloses every field collected about a child", () => {
  it("knows about every member of ChildInfo", () => {
    // The whole guard. Collecting one more thing about a minor now fails here
    // until someone decides — in writing, in three languages — what parents are
    // told about it.
    expect(childInfoMembers().sort()).toEqual(Object.keys(CHILD_FIELDS).sort());
  });

  it.each(locales)("%s names each disclosed field in both enumerations", (locale) => {
    const table = messages[locale]["privacy.s4.childTable"].toLowerCase();
    const stored = messages[locale]["privacy.s5.stored"].toLowerCase();
    for (const [field, disclosure] of Object.entries(CHILD_FIELDS)) {
      if (!disclosure) continue;
      const token = disclosure[locale];
      expect(table, `${field} missing from privacy.s4.childTable`).toContain(token);
      expect(stored, `${field} missing from privacy.s5.stored`).toContain(token);
    }
  });
});

// Shared by the two describes below, because the policy paragraph and the
// point-of-collection hint have to disclose the SAME two facts and must not be
// allowed to drift apart by being checked against different words.
//
// This is the thing that was got wrong first: the paragraph originally ended
// "used ONLY for overall statistics", which the admin Accounts export
// falsifies: sheet 1 prints each named child's gender on their own row, beside
// their 8-digit login id and their parent's email. Naming staff visibility is a
// statement of fact about internal access — the same access privacy.s7.staff
// already discloses — and nothing more: no legal basis, no retention period, no
// recipient.
const staffToken: Disclosure = { az: "əməkdaş", en: "staff", ru: "сотрудник" };
// The export itself, matched across inflections rather than as a fixed phrase:
// az declines it ("hesabatları" / "hesabatlarda") and ru declines both words
// ("внутренние отчёты" / "внутренних отчётах").
const reportToken: Record<"az" | "en" | "ru", RegExp> = {
  az: /daxili hesabat/,
  en: /internal account report/,
  ru: /внутренн[а-яё]* отчёт/,
};
// The half a parent came for: the ranking is the last item in "no effect on
// access, tasks, questions or ranking" in all three languages, so it is the
// word a shortened rewrite drops first.
const noEffect: Record<"az" | "en" | "ru", RegExp> = {
  az: /reytinq/,
  en: /ranking/,
  ru: /рейтинг/,
};

describe("the optional gender is described as optional and inert", () => {
  // Migration 169 makes three promises the column cannot make for itself: it is
  // optional, a parent may decline, and NO access, content or ranking rule
  // reads it. The policy is the only place a parent is ever told any of that,
  // so a language that lost the promise has a consent gap, not a copy nit.
  const genderToken = CHILD_FIELDS.gender as Disclosure;
  // Both spellings of the false claim, per language, so a rewrite cannot walk
  // back into it in one locale while the other two stay honest.
  const exclusivity: Record<"az" | "en" | "ru", RegExp> = {
    az: /yalnız ümumi statistika/,
    en: /only for overall statistics|overall statistics only/,
    ru: /только для общей статистики/,
  };
  // The opposite overclaim, and the one section 6 actually shipped: a promise
  // that the REPORT — not the gender answer — is never about one child. Sheet 1
  // of the Accounts export is per-named-child and carries each child's login
  // and access status precisely so staff CAN act on an individual, so this
  // sentence was false in the other direction. Pinned per language for the same
  // reason as `exclusivity`.
  const nonIndividualReport: Record<"az" | "en" | "ru", RegExp> = {
    az: /fərdi uşaq haqqında qərar vermək üçün yox/,
    en: /never to make a decision about an individual child/,
    ru: /не для решений в отношении конкретного ребёнка/,
  };
  // Canonical rows to compare the gender row's "Required?" cell against, so the
  // check pins the ANSWER rather than the three words that spell it — renaming
  // "Xeyr" must not fail this, dropping the "No" must.
  const optionalRow: Disclosure = { az: "avatar", en: "avatar", ru: "аватар" };

  it.each(locales)("%s marks the gender row not-required", (locale) => {
    const table = messages[locale]["privacy.s4.childTable"];
    const gender = rowNaming(table, genderToken[locale]);
    const optional = rowNaming(table, optionalRow[locale]);
    expect(gender, "no gender row in privacy.s4.childTable").toBeDefined();
    expect(optional, "no avatar row to take the optional marker from").toBeDefined();
    expect(gender![1], "gender is not marked optional").toBe(optional![1]);
    // A mandatory field's marker would be a different word; if it is the same
    // one, the table has stopped distinguishing required from optional at all.
    const grade = rowNaming(table, CHILD_FIELDS.classGrade![locale]);
    expect(grade![1]).not.toBe(gender![1]);
  });

  it.each(locales)("%s states the purpose and the limits in their own paragraph", (locale) => {
    // The blank line in privacy.s5.stored is a real paragraph break on both
    // platforms (toParagraphs / its mobile port), so this is what a parent
    // actually reads under "What is stored about a child".
    const paragraphs = toParagraphs(messages[locale]["privacy.s5.stored"]);
    expect(paragraphs.length, "the gender promise lost its paragraph").toBeGreaterThan(1);
    const promise = paragraphs[1].join(" ");
    expect(promise.toLowerCase()).toContain(genderToken[locale]);
    expect(promise.toLowerCase(), "staff visibility dropped").toContain(staffToken[locale]);
    // Five things have to be said — optional, a parent may decline, where the
    // answer sits and who reads it, the aggregate purpose, and no effect on
    // access/content/ranking. None of them fits, in any of these languages, in
    // a sentence this short.
    expect(promise.length, "too short to carry the five promises").toBeGreaterThan(200);
  });

  it.each(locales)("%s never re-narrows the purpose to statistics alone", (locale) => {
    // Every place the purpose is stated — including the Add-Child hint, which
    // is where the parent actually decides. Any one of them saying "only for
    // overall statistics" is a claim the Accounts export contradicts, in a
    // document filed with two store reviewers as the answer to what we do with
    // a minor's data. If the export's per-child Gender column is ever removed,
    // this is the check to relax — deliberately, not by editing a sentence back.
    for (const key of [
      "privacy.s4.childTable",
      "privacy.s5.stored",
      "privacy.s6.use",
      "addchild.field.genderHint",
    ]) {
      expect(messages[locale][key].toLowerCase(), key).not.toMatch(exclusivity[locale]);
    }
  });

  it.each(locales)("%s scopes the section-6 promise to the gender, not the report", (locale) => {
    // privacy.s6.use is the policy's exhaustive "what we use the data for", so
    // the internal account reports are named in it. The promise attached to
    // that line has to be about the gender answer — which no access, content or
    // ranking rule reads (migration 169, and no code does) — and never about
    // the report, which is per-named-child on purpose.
    const line = toPolicyList(messages[locale]["privacy.s6.use"]).find((l) =>
      reportToken[locale].test(l.toLowerCase()),
    );
    expect(line, "no section-6 line names the internal account reports").toBeDefined();
    const lower = line!.toLowerCase();
    // Not CHILD_FIELDS.gender here: its ru token "пол" is a substring of
    // "платформой" one clause earlier, so the loose token would pass on a line
    // that never mentions the gender at all. The lookahead pins the word.
    expect(lower, "the no-decision promise is not tied to the gender").toMatch(
      { az: /cins/, en: /gender/, ru: /пол(?![а-яё])/ }[locale],
    );
    expect(lower, "the promise stops short of the ranking").toMatch(noEffect[locale]);
    expect(
      messages[locale]["privacy.s6.use"].toLowerCase(),
      "the report as a whole is promised non-individual again",
    ).not.toMatch(nonIndividualReport[locale]);
  });
});

// ---------------------------------------------------------------------------
// The point of collection may not undersell the policy.
// ---------------------------------------------------------------------------
//
// `addchild.field.genderHint` sits under the select in the Add-Child wizard and
// the Edit-Child form, and its mobile twin `mob.child.gender.hint` under the
// same control on the phone. That hint — not /privacy — is what a parent reads
// at the moment they decide whether to answer, so a hint narrower than the
// policy is a consent problem even while the policy page is word-perfect.
//
// Web/mobile parity is pinned from the mobile side, in
// mobile-app/__tests__/child-gender-optional.test.ts, where both catalogs are
// already read.
describe("the Add-Child gender hint discloses what the policy discloses", () => {
  const genderHint = (locale: "az" | "en" | "ru") =>
    messages[locale]["addchild.field.genderHint"].toLowerCase();

  it.each(locales)("%s names who reads the answer", (locale) => {
    // The thing the hint used to omit: authorised staff read this per child, in
    // an exported internal report. Same statement of fact as privacy.s5.stored
    // and privacy.s7.staff — no legal basis, no retention period, no recipient.
    expect(genderHint(locale), "staff visibility dropped").toContain(staffToken[locale]);
    expect(genderHint(locale), "the internal reports went unnamed").toMatch(
      reportToken[locale],
    );
  });

  it.each(locales)("%s keeps the reassurance a parent came for", (locale) => {
    // Disclosure without it reads as a warning. The field changes nothing about
    // the child's access, tasks or ranking, and that has to survive every
    // rewrite of this string.
    expect(genderHint(locale), "the no-effect promise is gone").toMatch(noEffect[locale]);
  });

  it.each(locales)("%s stays a hint, not a policy section", (locale) => {
    // Long enough to carry both halves, short enough that it is still read
    // under a select. privacy.s5.stored is where the long form lives.
    const hint = messages[locale]["addchild.field.genderHint"];
    expect(hint.length, "too short to say who reads it").toBeGreaterThan(120);
    expect(hint.length, "a paragraph under a select is read by nobody").toBeLessThan(280);
  });
});

// ---------------------------------------------------------------------------
// The location denial cannot outlive the location we actually keep.
// ---------------------------------------------------------------------------
//
// `privacy.s5.notCollected` listed a bare "location" among the things we never
// collect about a child. Two tables earlier the SAME document lists that child's
// city and rayon — parent-typed, mandatory, and the thing every regional
// leaderboard groups by — and the store forms declare exactly that (Apple Coarse
// Location, Play Approximate location). The three could not all be true, and the
// false one was the sentence a parent actually reads.
//
// The repair is a DISTINCTION, not a quieter denial, so this guard pins both
// halves of it: the enumeration may deny only the DEVICE's location, and the
// paragraph after it has to admit the city and the rayon in the same breath.
// Denying one without admitting the other is how the contradiction got in, so
// neither check is sufficient alone.
//
// The block is scoped to the fact that keeps it honest. If the platform ever
// stops collecting a city or a rayon, the first check below fails, and the right
// response then is to DELETE this block rather than edit it — a bare denial
// would have become true.
describe("the location denial matches the location actually collected", () => {
  /** The bare word, per language, as a list of never-collected things spells it. */
  const locationWord: Record<"az" | "en" | "ru", RegExp> = {
    az: /məkan/,
    en: /location/,
    ru: /геолокац|местополож/,
  };
  /** The only form the enumeration may use: the DEVICE's location. Global —
   *  every occurrence is stripped before the bare word is hunted for. */
  const deviceLocation: Record<"az" | "en" | "ru", RegExp> = {
    az: /cihazın məkanı/g,
    en: /device location/g,
    ru: /геолокацию устройства/g,
  };
  // The three mechanisms whose absence is the whole of what "we do not collect
  // location" can honestly mean here. Each was checked in the repository, not
  // assumed: mobile-app/app.json requests no location permission (its
  // android.permissions list is biometric only, and neither the iOS infoPlist
  // nor plugins/withIosPermissionStringDefaults carries an NSLocation* string),
  // nothing depends on expo-location or calls navigator.geolocation, and
  // public.students has no coordinate column.
  const noPermission: Record<"az" | "en" | "ru", RegExp> = {
    az: /məkan icazəsi/,
    en: /location permission/,
    ru: /разрешение на геолокацию/,
  };
  const noSensor: Record<"az" | "en" | "ru", RegExp> = {
    az: /gps/,
    en: /gps/,
    ru: /gps/,
  };
  const noCoordinate: Record<"az" | "en" | "ru", RegExp> = {
    az: /koordinat/,
    en: /coordinate/,
    ru: /координат/,
  };

  /** The two paragraphs of privacy.s5.notCollected, lowercased. */
  const parts = (locale: "az" | "en" | "ru") =>
    toParagraphs(messages[locale]["privacy.s5.notCollected"]).map((p) =>
      p.join(" ").toLowerCase(),
    );

  it("still collects the city and the rayon that make the distinction necessary", () => {
    // CHILD_FIELDS is the enumeration of what Add-Child actually sends; a null
    // entry means "disclosed under another row", and a MISSING one would mean
    // the field is gone. Either of these going null/absent is the one situation
    // in which the old bare denial would have been the honest sentence.
    expect(CHILD_FIELDS.city, "the city stopped being collected").not.toBeNull();
    expect(CHILD_FIELDS.cityDistrictId, "the rayon stopped being collected").not.toBeNull();
  });

  it.each(locales)("%s denies the device's location, never location as such", (locale) => {
    const [enumeration] = parts(locale);
    expect(enumeration, "the never-collect list vanished").toBeTruthy();
    // Strip the qualified phrase; anything still saying "location" is the bare
    // denial walking back in.
    const unqualified = enumeration.replace(deviceLocation[locale], "");
    expect(unqualified, "an unqualified location denial is back").not.toMatch(
      locationWord[locale],
    );
  });

  it.each(locales)("%s admits the city and the rayon in the same statement", (locale) => {
    const paragraphs = parts(locale);
    expect(paragraphs.length, "the distinction lost its paragraph").toBeGreaterThan(1);
    const distinction = paragraphs[1];
    expect(distinction, "the city goes unmentioned").toContain(
      (CHILD_FIELDS.city as Disclosure)[locale],
    );
    expect(distinction, "the rayon goes unmentioned").toContain(
      (CHILD_FIELDS.cityDistrictId as Disclosure)[locale],
    );
  });

  it.each(locales)("%s names the three mechanisms that are genuinely absent", (locale) => {
    // Without these the paragraph would be an admission with no reassurance —
    // the half a parent came for, and the half a store reviewer checks against
    // the manifest.
    const distinction = parts(locale)[1];
    expect(distinction, "the permission claim is gone").toMatch(noPermission[locale]);
    expect(distinction, "the sensor claim is gone").toMatch(noSensor[locale]);
    expect(distinction, "the coordinate claim is gone").toMatch(noCoordinate[locale]);
  });
});

// ---------------------------------------------------------------------------
// The parent phone stopped being required on 2026-08-31.
// ---------------------------------------------------------------------------
//
// Apple rejected the build under Guideline 5.1.1(v) — an app may not REQUIRE
// personal information its core functionality does not need — so registration
// began accepting a blank number and lib/auth/phoneCore began clearing one back
// to NULL. lib/auth/__tests__/parentPhoneOptional.test.ts pins the CODE. Nothing
// pinned the POLICY, so privacy.s4.parentTable went on answering "Required? Yes"
// in all three languages — in the one document a parent or a store reviewer
// would consult to find out.
//
// The row is therefore pinned to the VALIDATOR rather than to a word, and the
// answer is read off the table's own markers, so renaming "Xeyr" cannot fail
// this and re-requiring the phone in code cannot pass it.
describe("the parent phone row matches the validator", () => {
  const phoneRow: Disclosure = { az: "telefon", en: "phone", ru: "телефон" };
  // Two rows whose markers define what this table's "required" and "optional"
  // look like, so the check pins the ANSWER and not the three words spelling it.
  const requiredRow: Disclosure = { az: "e-poçt", en: "email", ru: "электронной почты" };
  const optionalRow: Disclosure = { az: "avatar", en: "avatar", ru: "аватар" };

  it("registration really does accept a parent with no phone", () => {
    const res = validateParentRegistration({
      firstName: "Aysel",
      lastName: "Məmmədova",
      email: "aysel@example.com",
      password: "Şəkil!2026",
      phone: "",
    });
    expect(res.ok, "the phone is mandatory again — then fix the policy, not this").toBe(
      true,
    );
    expect(res.ok === true && res.phone, "a blank phone must normalize to NULL").toBeNull();
  });

  it.each(locales)("%s marks the phone row not-required", (locale) => {
    const table = messages[locale]["privacy.s4.parentTable"];
    const phone = rowNaming(table, phoneRow[locale]);
    const required = rowNaming(table, requiredRow[locale]);
    const optional = rowNaming(table, optionalRow[locale]);
    expect(phone, "no phone row in privacy.s4.parentTable").toBeDefined();
    expect(required, "no email row to take the required marker from").toBeDefined();
    expect(optional, "no avatar row to take the optional marker from").toBeDefined();
    expect(phone![1], "the phone is still marked required").toBe(optional![1]);
    expect(
      phone![1],
      "the table has stopped distinguishing required from optional",
    ).not.toBe(required![1]);
  });
});
