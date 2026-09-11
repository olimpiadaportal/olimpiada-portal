// A SUBJECT RENAMED IN THE ADMIN PANEL MUST REACH THE APP.
//
// WHY THIS TEST EXISTS. subjectLabel() resolved every visible subject name from
// the BUNDLED `subj.<code>` catalog first, falling back to the DB
// `subjects.name` only for a code the catalog did not know. The catalog won for
// every real subject, so renaming one changed nothing on any screen, in any of
// the three languages — and on mobile that is worse than on the web, because a
// binary already in testers' hands cannot be corrected by editing a dictionary.
//
// The names now live per-locale in `subject_translations` (migration 171) and
// arrive through the i18n runtime under their own `subj.db.<code>` namespace, so
// no screen had to change. This pins the two mobile-specific halves: that
// createT actually layers them, and that a failed or absent fetch leaves the
// bundled catalog rendering rather than blanking every subject label.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createT } from "@/i18n";
import {
  sortSubjectsByLabel,
  subjectComparator,
  subjectLabel,
  subjectNameKey,
} from "@/lib/subjectLabel";
import { buildSubjectNameDict, type SubjectNameRow } from "@/lib/subjectNames";

const ROWS: SubjectNameRow[] = [
  {
    code: "english",
    subject_translations: [
      { locale: "az", name: "İngilis dili (yeni)" },
      { locale: "en", name: "English Language" },
      { locale: "ru", name: "Английский (новый)" },
    ],
  },
];

describe("createT layers the admin-managed subject names", () => {
  it("a renamed subject beats the bundled catalog, in every locale", () => {
    for (const [locale, expected] of [
      ["az", "İngilis dili (yeni)"],
      ["en", "English Language"],
      ["ru", "Английский (новый)"],
    ] as const) {
      const t = createT(locale, null, buildSubjectNameDict(ROWS, locale));
      expect(subjectLabel(t, "english", "İngilis dili")).toBe(expected);
    }
  });

  it("the site_content CMS still wins over everything, unchanged", () => {
    // The pre-existing contract. Nothing in the app can currently write a
    // `subj.db.*` CMS row, but the ORDER must not silently invert either.
    const t = createT(
      "en",
      { [subjectNameKey("english")]: "From the CMS" },
      buildSubjectNameDict(ROWS, "en"),
    );
    expect(subjectLabel(t, "english", "İngilis dili")).toBe("From the CMS");
  });

  it("no subject-name layer at all renders exactly as before", () => {
    // A binary running against a database where migration 171 has not been
    // applied, or whose fetch failed, or that is offline at first paint.
    for (const layer of [null, undefined, {}] as const) {
      const t = createT("en", null, layer);
      expect(subjectLabel(t, "english", "İngilis dili")).toBe("English");
      expect(subjectLabel(t, "math", "Riyaziyyat")).toBe("Mathematics");
      // And a subject the catalog never knew still falls back to its column.
      expect(subjectLabel(t, "kimya", "Kimya")).toBe("Kimya");
    }
  });

  it("the layer never shadows an unrelated key", () => {
    // It uses its OWN namespace precisely so it extends the dictionary instead
    // of overwriting it — that is what keeps the catalog available as a
    // fallback and keeps every other string untouched.
    const t = createT("en", null, buildSubjectNameDict(ROWS, "en"));
    expect(t("subj.english")).toBe("English");
    expect(t("nav.home").length).toBeGreaterThan(0);
  });
});

describe("useT feeds the layer in", () => {
  // Source-level: useT is the ONE place a screen's t() comes from, so a hook
  // that fetched the names and forgot to pass them would typecheck, build, ship
  // and reproduce the original bug exactly.
  const src = readFileSync(join(__dirname, "..", "src", "i18n", "useT.ts"), "utf8");

  it("reads the subject names and hands them to createT", () => {
    expect(src).toContain("useSubjectNames");
    expect(src).toMatch(/createT\(\s*locale,\s*overrides\.data \?\? null,\s*subjectNames\.data \?\? null,?\s*\)/);
  });

  it("re-memoizes when they arrive", () => {
    // Without the dependency the first render's t() — built before the fetch
    // resolved — would be kept for the life of the screen.
    expect(src).toMatch(/\[locale, overrides\.data, subjectNames\.data\]/);
  });
});

/** A t() over one plain dictionary, exactly like the app's (key in = key out). */
function tOver(dict: Record<string, string>): (k: string) => string {
  return (k) => dict[k] ?? k;
}

// ===========================================================================
// A SUBJECT LIST IS ORDERED BY WHAT THE READER SEES (2026-09-10)
// ===========================================================================
// The web half of this is pinned in web-app/src/lib/__tests__/subjectRename,
// including the assertion that mobile's lib/subjectLabel.ts is byte-identical
// to the web one — so the HELPER is covered there and is not re-tested here.
// What is mobile's own is the set of screens that call it, and one platform
// fact: Hermes builds Intl from the operating system rather than bundling ICU,
// so the comparator has to survive a device that cannot resolve a locale at
// all. That is a behaviour, not a source string, so it is asserted directly.
describe("the comparator survives Hermes's platform-provided Intl", () => {
  it("still orders a list when the locale cannot be resolved", () => {
    expect(subjectComparator("zz")("Algebra", "Zoology")).toBeLessThan(0);
    expect(subjectComparator("zz")("Zoology", "Algebra")).toBeGreaterThan(0);
  });

  it("gives an az and an en reader genuinely different orders", () => {
    // Azerbaijani is not accented Latin: q sorts before l, x before i. This is
    // why every call site passes the ACTIVE locale rather than a constant.
    const t = tOver({
      [subjectNameKey("l")]: "Latın dili",
      [subjectNameKey("q")]: "Qrammatika",
    });
    const rows = [
      { code: "l", name: "" },
      { code: "q", name: "" },
    ];
    expect(sortSubjectsByLabel(t, "az", rows).map((s) => s.label)).toEqual([
      "Qrammatika",
      "Latın dili",
    ]);
    expect(sortSubjectsByLabel(t, "en", rows).map((s) => s.label)).toEqual([
      "Latın dili",
      "Qrammatika",
    ]);
  });

  it("orders by the RESOLVED label, so a rename reorders the screen", () => {
    const t = tOver({
      [subjectNameKey("english")]: "Zoology",
      [subjectNameKey("math")]: "Algebra",
    });
    const rows = [
      { id: "e", code: "english", name: "İngilis dili" },
      { id: "m", code: "math", name: "Riyaziyyat" },
    ];
    // Ordering on `name` would have put Zoology above Algebra on screen.
    expect(sortSubjectsByLabel(t, "en", rows).map((s) => s.id)).toEqual(["m", "e"]);
  });
});

describe("every mobile subject list orders on the label", () => {
  const src = (rel: string) =>
    readFileSync(join(__dirname, "..", rel), "utf8");

  it("fetchActiveSubjects does not pretend to choose a display order", () => {
    // It is a plain data reader: no translator, no locale. `.order("name")`
    // stays as a deterministic base for the caller's sort, and the comment must
    // say so — an unlabelled `.order("name")` is what every caller copied.
    const data = src("src/lib/data.ts");
    expect(data).toContain("NOT DISPLAY ORDER");
    expect(data).toContain("sortSubjectsByLabel");
  });

  it("the screens that render subject labels sort with the helper", () => {
    for (const rel of [
      "src/app/(public)/subjects.tsx",
      "src/app/(parent)/leaderboard.tsx",
      "src/app/(parent)/(tabs)/analytics.tsx",
      "src/features/ranking/RankingScreen.tsx",
    ]) {
      expect(src(rel)).toContain("sortSubjectsByLabel(");
    }
  });

  it("groupPricing chooses a CACHE order, and says so", () => {
    // It runs inside a react-query queryFn under a locale-less key, so an order
    // decided there freezes at the language of the first fetch — which is why
    // the fix for its locale-less sort is NOT a locale-aware sort in the same
    // place. It sorts on `id`: arbitrary, stable, and openly labelled as such.
    const commerce = src("src/features/parent/commerce.ts");
    expect(commerce).not.toContain("a.name.localeCompare(b.name)");
    expect(commerce).toContain("(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)");
    expect(commerce).toContain("NOT DISPLAY ORDER");
  });

  it("the manage-subjects editor orders the checkboxes it renders", () => {
    // The one component that renders groupPricing's output. It holds the
    // reader's language (useT), so the display order belongs to it — and the
    // locale is in the memo deps because a language switch REORDERS the list.
    const editor = src("src/features/parent/ManageSubjectsEditor.tsx");
    expect(editor).toContain("sortSubjectsByLabel(t, locale, subjectRows)");
    expect(editor).toContain("[subjectRows, t, locale]");
  });

  it("no mobile source reintroduces either defect shape", () => {
    // Both are SHAPES rather than locations — the obvious thing to write, and
    // plausible-looking until a subject is renamed or the reader is not
    // Azerbaijani — so this sweeps the tree instead of listing today's sites.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    const offenders = { guard: [] as string[], collation: [] as string[] };
    for (const file of walk(join(__dirname, "..", "src"))) {
      // COMMENTS ARE STRIPPED, not files skipped. The previous shape of this
      // sweep exempted whole files because subjectLabel.ts quotes the
      // anti-patterns while explaining them; commerce.ts and iap/catalog.ts now
      // do the same, and exempting three files would have been three blind
      // spots — two of which are the very files this round had to fix.
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
        .replace(/\s+/g, " ");
      if (/\.name \? subjectLabel\(/.test(text)) offenders.guard.push(file);
      // ANY locale-less localeCompare, not just one on a variable spelled
      // `label`. The narrow version of this regex is precisely why
      // `a.name.localeCompare(b.name)` in features/parent/commerce.ts and
      // `(a.subjectName ?? "").localeCompare(b.subjectName ?? "")` in
      // features/iap/catalog.ts both survived a sweep that existed to find
      // them: the first sorted a name, and the second put an expression
      // between the field and the call.
      if (/\.localeCompare\(\s*[^,()]*\)/.test(text)) offenders.collation.push(file);
    }
    expect(offenders).toEqual({ guard: [], collation: [] });
  });
});
