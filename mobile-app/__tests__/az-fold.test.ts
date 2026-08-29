// Round 53 — the picker search fold. The reported bug was a district list with
// no search box; the fix is only useful if a parent typing on the ASCII half of
// a phone keyboard ("Haci") reaches a row spelled with Azerbaijani letters
// ("Hacıqabul"), and if a parent who does type the diacritics reaches it too.
// These pin the two things that silently break that: the lowercase-then-map
// ORDER, and the header/section handling of the filtered list.
import { azFilter, azFilterSections, azFold, azRank, SEARCH_MIN_ITEMS } from "@/lib/azFold";

const DISTRICTS = [
  // Deliberately ahead of "Bakı": the ranking test below depends on the
  // substring match sitting EARLIER in the source list than the prefix match.
  "Qubadlı",
  "Bakı",
  "Gəncə",
  "Hacıqabul",
  "İsmayıllı",
  "Şabran",
  "Şəki",
  "Ağdaş",
  "Göyçay",
];

describe("azFold", () => {
  it("folds every letter of the Azerbaijani set, lower and upper case", () => {
    expect(azFold("əöüğıçş")).toBe("eougics");
    expect(azFold("ƏÖÜĞIÇŞ")).toBe("eougics");
    // İ (capital dotted i) is the other half of the Turkic i pair: az
    // lowercasing gives "i" directly, a non-az fallback gives "i" + U+0307,
    // and the combining-mark strip lands both on the same "i".
    expect(azFold("İsmayıllı")).toBe("ismayilli");
    // Letters shared with ASCII must pass through untouched.
    expect(azFold("Qax")).toBe("qax");
  });

  it("keeps digits, spaces and punctuation — it is a fold, not a slugify", () => {
    // The admin panel's slugify helpers share this character map but also strip
    // to [a-z0-9-]; borrowing THEM would erase the spaces a school-name search
    // is typed with.
    expect(azFold("148 nömrəli tam orta məktəb")).toBe("148 nomreli tam orta mekteb");
  });

  it("folds a capital I the same way as the ı it lowercases to", () => {
    // THE ORDER TRAP: `toLocaleLowerCase("az")` maps "I" to "ı", so a fold that
    // applied the character map BEFORE lowercasing would leave "hacıqabul"
    // here and never match a query typed "HACI".
    expect(azFold("HACIQABUL")).toBe("haciqabul");
    expect(azFold("Hacıqabul")).toBe("haciqabul");
    expect(azFold("ISMAYILLI")).toBe("ismayilli");
  });

  it("is idempotent, so a folded value can be re-folded harmlessly", () => {
    expect(azFold(azFold("Hacıqabul"))).toBe("haciqabul");
  });
});

describe("azRank", () => {
  it("ranks a prefix above a mere substring", () => {
    expect(azRank("Hacıqabul", azFold("Hacı"))).toBe(2);
    expect(azRank("Hacıqabul", azFold("qabul"))).toBe(1);
    expect(azRank("Hacıqabul", azFold("Gəncə"))).toBe(0);
  });

  it("matches an Azerbaijani label from an ASCII query and back", () => {
    expect(azRank("Hacıqabul", azFold("Haci"))).toBe(2);
    expect(azRank("Hacıqabul", azFold("Haciqabul"))).toBe(2);
    // Both sides folded: a label must always match itself.
    expect(azRank("Hacıqabul", azFold("Hacıqabul"))).toBe(2);
  });
});

describe("azFilter", () => {
  const byName = (s: string) => s;

  it("reaches Hacıqabul from Hacı, Haci and Haciqabul alike", () => {
    for (const q of ["Hacı", "Haci", "Haciqabul", "HACI", "hacı"]) {
      expect(azFilter(DISTRICTS, q, byName)).toContain("Hacıqabul");
    }
  });

  it("matches diacritic rows from an ASCII query", () => {
    expect(azFilter(DISTRICTS, "sek", byName)).toEqual(["Şəki"]);
    expect(azFilter(DISTRICTS, "goycay", byName)).toEqual(["Göyçay"]);
    expect(azFilter(DISTRICTS, "agdas", byName)).toEqual(["Ağdaş"]);
    expect(azFilter(DISTRICTS, "ismayilli", byName)).toEqual(["İsmayıllı"]);
  });

  it("puts prefix matches before substring matches", () => {
    // "ba" starts "Bakı" and sits inside "Qubadlı"; the prefix takes the top
    // slot even though the substring match comes first in the source list, so
    // a two-letter query is still useful.
    expect(azFilter(DISTRICTS, "ba", byName)).toEqual(["Bakı", "Qubadlı"]);
  });

  it("returns the list untouched for an empty or blank query", () => {
    expect(azFilter(DISTRICTS, "", byName)).toBe(DISTRICTS);
    expect(azFilter(DISTRICTS, "   ", byName)).toBe(DISTRICTS);
  });

  it("keeps sections together instead of re-ranking across them", () => {
    // Headers in the profile picker are derived from the order of this array,
    // so hoisting a prefix match out of the second section would print the
    // first section's caption twice.
    type Row = { label: string; section: string };
    const rows: Row[] = [
      { label: "Xəzər liseyi", section: "Özəl" },
      { label: "Zəngi liseyi", section: "Özəl" },
      { label: "Liseyin filialı", section: "Dövlət" },
    ];
    const out = azFilter(rows, "lise", (r) => r.label, (r) => r.section);
    expect(out.map((r) => r.label)).toEqual([
      "Xəzər liseyi",
      "Zəngi liseyi",
      "Liseyin filialı",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(azFilter(DISTRICTS, "zzz", byName)).toEqual([]);
  });
});

describe("azFilterSections", () => {
  type Item = { kind: "header"; label: string } | { kind: "option"; label: string };
  const items: Item[] = [
    { kind: "header", label: "Özəl məktəblər" },
    { kind: "option", label: "Xəzər liseyi" },
    { kind: "header", label: "Dövlət məktəbləri" },
    { kind: "option", label: "Hacıqabul 1 nömrəli məktəb" },
    { kind: "option", label: "Bakı 132 nömrəli məktəb" },
  ];
  const opts = {
    isHeader: (i: Item) => i.kind === "header",
    label: (i: Item) => i.label,
  };

  it("drops a header whose whole section filtered out", () => {
    const out = azFilterSections(items, "haciqabul", opts);
    expect(out).toEqual([
      { kind: "header", label: "Dövlət məktəbləri" },
      { kind: "option", label: "Hacıqabul 1 nömrəli məktəb" },
    ]);
  });

  it("keeps a header whose section still has a row", () => {
    const out = azFilterSections(items, "xezer", opts);
    expect(out).toEqual([
      { kind: "header", label: "Özəl məktəblər" },
      { kind: "option", label: "Xəzər liseyi" },
    ]);
  });

  it("drops every header when nothing matches — no captions over an empty list", () => {
    expect(azFilterSections(items, "zzz", opts)).toEqual([]);
  });

  it("returns the list untouched for an empty query", () => {
    expect(azFilterSections(items, "", opts)).toBe(items);
  });

  it("never matches a header itself", () => {
    // Headers are captions, not options: "Dövlət" must not resurrect a section
    // whose schools all filtered out.
    expect(azFilterSections(items, "dovlet", opts)).toEqual([]);
  });
});

describe("SEARCH_MIN_ITEMS", () => {
  it("leaves short pickers (grades, the four subjects) box-free", () => {
    // 11 grades stay as they were; the ~80-row district list and the school
    // lists cross the line.
    expect(11 >= SEARCH_MIN_ITEMS).toBe(false);
    expect(15 >= SEARCH_MIN_ITEMS).toBe(true);
  });
});
