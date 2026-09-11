// RENAMING A SUBJECT MUST CHANGE WHAT A FAMILY SEES.
//
// WHY THIS TEST EXISTS. The owner asked for a rename ("İngilis dili → English /
// İngilis dili") and got a silent no-op. subjectLabel() resolved a label as
// `subj.<code>` from the shipped i18n catalog, falling back to the DB
// `subjects.name` only for an UNKNOWN code — so the catalog WON. Every seeded
// subject has such a key, which means the one operation an admin would actually
// perform saved the row, wrote an audit entry and changed nothing anywhere, in
// any of the three languages. CREATING a subject worked perfectly (no key for a
// freshly slugified code), which is exactly why it survived review.
//
// The fix is not "prefer subjects.name" — one column cannot hold Riyaziyyat,
// Mathematics and Математика at once, and preferring it would have traded a
// broken rename for a monolingual product. The names live per-locale in
// `subject_translations` (migration 171) and reach this pure function through
// the SAME t() every caller already passes, under their own `subj.db.<code>`
// namespace.
//
// Two halves can regress independently, so both are pinned:
//
//   * the PRECEDENCE inside subjectLabel, branch by branch. Each branch is
//     reachable on its own because the DB layer has its own key namespace — if
//     it had simply overwritten `subj.<code>` there would be no way to tell
//     "renamed" from "shipped catalog" here, and no way to fall back to the
//     catalog when the database read fails;
//   * the SHAPE of the dictionary the i18n layer publishes. The layer writing
//     one key and the resolver reading another is a failure mode that typechecks
//     perfectly and renders Azerbaijani forever, which is the original bug with
//     extra steps. subjectNameKey() is the single source of that spelling and
//     both sides are asserted against it.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NO_SUBJECT_LABEL,
  sortSubjectsByLabel,
  subjectComparator,
  subjectLabel,
  subjectLabelOrNull,
  subjectNameKey,
} from "@/lib/subjectLabel";
import { buildSubjectNameDict, type SubjectNameRow } from "@/lib/subjectNames";
import { messages } from "@/i18n/messages";

/** A t() over one plain dictionary, exactly like the app's (key in = key out). */
function tOver(dict: Record<string, string>): (k: string) => string {
  return (k) => dict[k] ?? k;
}

const CATALOG_EN = messages.en as Record<string, string>;

describe("subjectLabel precedence, branch by branch", () => {
  it("1. the per-locale DATABASE name wins over the shipped catalog", () => {
    // The whole feature. `subj.english` says "English" in the bundled catalog;
    // an admin who renamed the subject must beat it.
    const t = tOver({
      ...CATALOG_EN,
      [subjectNameKey("english")]: "English Language",
    });
    expect(subjectLabel(t, "english", "İngilis dili")).toBe("English Language");
  });

  it("2. the shipped catalog wins over the raw column when there is no DB name", () => {
    // The pre-171 behaviour, kept: a database where the migration has not been
    // applied, or an unreadable table, must render exactly as it does today
    // rather than showing Azerbaijani to every English reader.
    const t = tOver(CATALOG_EN);
    expect(subjectLabel(t, "english", "İngilis dili")).toBe("English");
  });

  it("3. the raw subjects.name is used for a code neither layer knows", () => {
    // A freshly created subject before anyone translates it. This branch always
    // worked, which is why the defect went unnoticed.
    const t = tOver(CATALOG_EN);
    expect(subjectLabel(t, "kimya", "Kimya")).toBe("Kimya");
  });

  it("4. the code itself is the last resort, and a raw i18n key is never shown", () => {
    const t = tOver(CATALOG_EN);
    expect(subjectLabel(t, "kimya", "")).toBe("kimya");
    expect(subjectLabel(t, "kimya", null)).toBe("kimya");
    // No code at all: the name, then the em dash — never "subj.undefined".
    expect(subjectLabel(t, null, "Kimya")).toBe("Kimya");
    expect(subjectLabel(t, null, null)).toBe("—");
  });

  it("a blank DB name falls through instead of rendering an empty label", () => {
    // ck_subject_tr_name_not_blank makes this unreachable from the database and
    // the admin form stores the az value rather than "", but a resolver that
    // returned "" here would blank a subject everywhere at once.
    const t = tOver({ ...CATALOG_EN, [subjectNameKey("english")]: "   " });
    expect(subjectLabel(t, "english", "İngilis dili")).toBe("English");
  });

  it("the rename reaches every locale, not just the default one", () => {
    for (const [locale, renamed] of [
      ["az", "İngilis dili (yeni)"],
      ["en", "English Language"],
      ["ru", "Английский (новый)"],
    ] as const) {
      const t = tOver({
        ...(messages[locale] as Record<string, string>),
        [subjectNameKey("english")]: renamed,
      });
      expect(subjectLabel(t, "english", "İngilis dili")).toBe(renamed);
    }
  });
});

describe("the dictionary the i18n layer publishes", () => {
  const ROWS: SubjectNameRow[] = [
    {
      code: "english",
      subject_translations: [
        { locale: "az", name: "İngilis dili" },
        { locale: "en", name: "English Language" },
        { locale: "ru", name: "Английский язык" },
      ],
    },
    {
      code: "math",
      subject_translations: [
        { locale: "az", name: "Riyaziyyat" },
        { locale: "en", name: "Mathematics" },
        { locale: "ru", name: "Математика" },
      ],
    },
  ];

  it("keys on exactly what subjectLabel reads", () => {
    const dict = buildSubjectNameDict(ROWS, "en");
    expect(Object.keys(dict).sort()).toEqual(
      [subjectNameKey("english"), subjectNameKey("math")].sort(),
    );
    // End to end through the real resolver, not just the key spelling.
    expect(subjectLabel(tOver(dict), "english", "İngilis dili")).toBe(
      "English Language",
    );
  });

  it("selects ONE locale — the reader's — and never mixes them", () => {
    expect(buildSubjectNameDict(ROWS, "ru")).toEqual({
      [subjectNameKey("english")]: "Английский язык",
      [subjectNameKey("math")]: "Математика",
    });
  });

  it("never publishes an empty label, whatever the database returned", () => {
    // Every one of these degrades to "no override", which lets the shipped
    // catalog render. A published "" would blank the subject on every surface.
    const junk: SubjectNameRow[] = [
      { code: "english", subject_translations: [{ locale: "en", name: "  " }] },
      { code: "math", subject_translations: [{ locale: "en", name: null }] },
      { code: "  ", subject_translations: [{ locale: "en", name: "Nameless" }] },
      { code: null, subject_translations: [{ locale: "en", name: "Nameless" }] },
      { code: "elm", subject_translations: null },
      { code: "fizika" },
    ];
    expect(buildSubjectNameDict(junk, "en")).toEqual({});
    expect(buildSubjectNameDict(null, "en")).toEqual({});
    expect(buildSubjectNameDict(undefined, "en")).toEqual({});
    expect(Object.values(buildSubjectNameDict(junk, "en"))).not.toContain("");
  });

  it("an unreadable table leaves the shipped catalog in charge", () => {
    // What flags.ts / configQueries.ts return on failure, and on a deploy that
    // reaches production before the migration does.
    const t = tOver({ ...CATALOG_EN, ...buildSubjectNameDict([], "en") });
    expect(subjectLabel(t, "english", "İngilis dili")).toBe("English");
  });
});

describe("the two apps resolve a subject identically", () => {
  it("web and mobile subjectLabel are the same file", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const web = readFileSync(
      resolve(process.cwd(), "src/lib/subjectLabel.ts"),
      "utf8",
    );
    const mobile = readFileSync(
      resolve(process.cwd(), "../mobile-app/src/lib/subjectLabel.ts"),
      "utf8",
    );
    // Byte-identical on purpose: a subject that reads one way on the website and
    // another in the app is the same class of confusion as a rename that does
    // not take.
    expect(mobile).toBe(web);
  });

  it("web and mobile subjectNames are the same file, header included", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const web = readFileSync(
      resolve(process.cwd(), "src/lib/subjectNames.ts"),
      "utf8",
    );
    const mobile = readFileSync(
      resolve(process.cwd(), "../mobile-app/src/lib/subjectNames.ts"),
      "utf8",
    );
    // The HEADER is asserted too, and that is the point rather than tidiness.
    // This pair used to be compared with the header stripped off, and the web
    // copy's header claimed the two were "mirrored byte-for-byte" while they
    // were not — a comment nothing could contradict. Comparing the whole file
    // makes the claim checkable, and leaves "identical" as a rule a human can
    // apply without reading this test.
    expect(mobile).toBe(web);
  });
});

describe("the read path is wired at every chokepoint", () => {
  // Source-level, in the style of lib/__tests__/reinstateSubject: these two
  // files are the ONLY places a t()/dict is built for the whole app, and a
  // subject label rendered by a client component reads the layout's dictionary
  // rather than calling the i18n layer. Wiring only getT() would have left the
  // rename working on server-rendered pages and silently not working on the
  // Add-Child wizard, the subscribe form and the pricing configurator — the
  // exact screens where a parent picks a subject.
  it("getT() layers the subject names in", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "src/i18n/server.ts"),
      "utf8",
    );
    expect(src).toContain("getSubjectNameRows");
    expect(src).toContain("buildSubjectNameDict");
  });

  it("the root layout merges them into the CLIENT dictionary too", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    expect(src).toContain("getSubjectNameRows");
    expect(src).toContain("buildSubjectNameDict");
  });
});

// ===========================================================================
// THE TWO PARENT-FACING SURFACES A RENAME DID NOT REACH
// ===========================================================================
// Migration 171 routed ~50 label call sites through subjectLabel() at once, by
// publishing the DB name into the dictionary rather than threading it through.
// That works for every surface that ALREADY called subjectLabel. The free-trial
// screens never did — they printed `subjects.name` straight from the query —
// so they were not fixed by 171 and, once `subjects.name` became the frozen
// import key, they became the only parent-facing place in the product showing a
// name that no longer follows a rename. The defect predates renaming: that same
// column is one Azerbaijani string, so an English or Russian parent read
// Azerbaijani subjects here while every other screen spoke their language.
//
// Source-level, in the style of the chokepoint tests above: the bug is a MISSING
// call, and a missing call is invisible to a rendering test that stubs the data
// it would have transformed.
describe("the subscribe screen resolves subject labels like every other screen", () => {
  const read = async (rel: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), rel), "utf8");
  };
  const PAGE = "src/app/(parent)/children/[id]/subscribe/page.tsx";
  const PANEL = "src/components/FreeTrialStatusPanel.tsx";

  it("routes the trial picker through subjectLabel, not the raw column", async () => {
    const src = await read(PAGE);
    expect(src).toContain('from "@/lib/subjectLabel"');
    // The picker is handed the RESOLVED label. `name: s.name` is the defect.
    expect(src).toContain("subjects={subjects.map((s) => ({ id: s.id, name: s.label }))}");
    expect(src).not.toContain("subjects.map((s: any) => ({ id: s.id, name: s.name }))");
  });

  it("resolves the status panel's subjects and hands them down as a prop", async () => {
    const page = await read(PAGE);
    const panel = await read(PANEL);
    expect(page).toContain("const trialSubjects = sortSubjectsByLabel(t, locale, trial.subjects)");
    expect(page).toContain("subjects={trialSubjects}");
    // The panel must not be able to fall back to the raw RPC names: that is the
    // bug, and a default would let a future caller reintroduce it silently.
    expect(panel).toContain("subjects: { id: string; name: string }[];");
    // `trial.subjects` survives in the prop DOC (it names what the prop
    // replaced); what must be gone is the RENDER of it.
    expect(panel).not.toContain("trial.subjects.map");
    expect(panel).not.toContain("trial.subjects.length");
  });

  it("orders the catalog by the LABEL, with a locale-aware collator", async () => {
    const src = await read(PAGE);
    // Sorting on the frozen import key while rendering the translation is what
    // made the list order look arbitrary after a rename.
    expect(src).not.toContain("a.name.localeCompare(b.name)");
    // This page hand-rolled the collator first. It now shares the one in
    // lib/subjectLabel with every other subject list in both apps — which is
    // also how it picked up the full BCP-47 tag ("az-Latn-AZ", not a bare "az"
    // that resolves to CLDR root wherever Azerbaijani data is missing).
    expect(src).toContain("sortSubjectsByLabel(");
    expect(src).not.toContain("new Intl.Collator(");
  });
});

describe("subject ordering is Azerbaijani-correct", () => {
  // The page builds its comparator from the ACTIVE locale. A bare
  // localeCompare() — or a hard-coded "en" — collates by the runtime default,
  // and Azerbaijani's alphabet is not the Latin one: q sorts BEFORE l, and x
  // before i. Both orders below are what a parent reading that language expects,
  // and the two disagree, which is the whole reason the locale is passed.
  const order = (labels: string[], locale: string) =>
    [...labels].sort(new Intl.Collator(locale, { numeric: true }).compare);

  it("puts q before l and x before i for an Azerbaijani reader", () => {
    expect(order(["Latın dili", "Qrammatika"], "az")).toEqual([
      "Qrammatika",
      "Latın dili",
    ]);
    expect(order(["İnformatika", "Xarici dil"], "az")).toEqual([
      "Xarici dil",
      "İnformatika",
    ]);
  });

  it("orders the SAME labels differently for an English reader", () => {
    // Not a curiosity — it is the assertion that the locale argument is doing
    // work. Drop it and this test still passes for `en` while `az` regresses.
    expect(order(["Latın dili", "Qrammatika"], "en")).toEqual([
      "Latın dili",
      "Qrammatika",
    ]);
    expect(order(["İnformatika", "Xarici dil"], "en")).toEqual([
      "İnformatika",
      "Xarici dil",
    ]);
  });

  it("orders by the RESOLVED label, so a rename reorders the list", () => {
    // The end-to-end shape of the page's comparator: resolve, then sort.
    const t = tOver({
      ...CATALOG_EN,
      [subjectNameKey("english")]: "Zoology",   // renamed by an admin
      [subjectNameKey("math")]: "Algebra",
    });
    const rows = [
      { code: "english", name: "İngilis dili" },
      { code: "math", name: "Riyaziyyat" },
    ];
    const collator = new Intl.Collator("en", { numeric: true });
    const sorted = rows
      .map((s) => ({ ...s, label: subjectLabel(t, s.code, s.name) }))
      .sort((a, b) => collator.compare(a.label, b.label))
      .map((s) => s.label);
    // Sorting on `name` would have given İngilis dili -> Riyaziyyat, i.e.
    // Zoology before Algebra on screen.
    expect(sorted).toEqual(["Algebra", "Zoology"]);
  });
});

// ===========================================================================
// THE SAME DEFECT INSIDE THE DATABASE (migration 172)
// ===========================================================================
// Two notification producers build their text in SQL, where there is no
// subjectLabel(): the 3/2/1-day manual-renewal chain (in-app + email — the
// entire retention mechanism, since ABB has not approved recurring billing) and
// the free-trial chain. Both named the subject from `subjects.name`, so after a
// rename the most consequential message the platform sends a paying parent
// identified the subject by an internal import key.
describe("the notification producers read the display name", () => {
  const canonical = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(
      resolve(process.cwd(), "../supabase/sql/011_indexes_constraints_functions_triggers.sql"),
      "utf8",
    );
  };
  const fn = (sql: string, name: string) => {
    const start = sql.indexOf(`create or replace function public.${name}()`);
    expect(start, `${name} not found in 011`).toBeGreaterThan(-1);
    const end = sql.indexOf("\n$$;", start);
    return sql.slice(start, end);
  };

  it("notify_expiring_subscriptions joins subject_translations", async () => {
    const body = fn(await canonical(), "notify_expiring_subscriptions");
    expect(body).toContain("public.subject_translations");
    // az only, deliberately: profiles.preferred_locale is unused and these
    // bodies are Azerbaijani literals. Fixing the NAME must not quietly turn
    // into localizing the notification.
    expect(body).toContain("tr_az.locale = 'az'");
    // The column stays as the fallback — string_agg drops NULLs, so an
    // unguarded read would silently shorten the list of lapsing subjects.
    expect(body).toContain("nullif(btrim(subj.name), '')");
  });

  it("notify_free_trial_ending reads the locale the notice is written in", async () => {
    const body = fn(await canonical(), "notify_free_trial_ending");
    expect(body).toContain("public.subject_translations");
    // free_trial_notice() already renders az/en/ru from free_trials.locale, so
    // the subject names inside that sentence follow the same locale.
    expect(body).toContain("v_row.locale in ('az', 'en', 'ru')");
    expect(body).toContain("::public.content_locale");
    expect(body).toContain("nullif(btrim(sub.name), '')");
  });

  it("ships as migration 172, idempotent and self-contained", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const path = resolve(
      process.cwd(),
      "../supabase/sql/migrations/2026_09_10_172_notification_subject_names.sql",
    );
    const sql = readFileSync(path, "utf8");
    // CREATE OR REPLACE, never DROP: both functions are named inside pg_cron
    // command strings created by 016, and a drop would also discard the grants.
    expect(sql).toContain("create or replace function public.notify_expiring_subscriptions()");
    expect(sql).toContain("create or replace function public.notify_free_trial_ending()");
    expect(sql).not.toMatch(/drop\s+function\s+public\.notify_/i);
    // No self-transaction: a `commit` inside a sourced file commits the OUTER
    // transaction, which is how this repository once lost every row.
    expect(sql).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
  });
});

// ===========================================================================
// A SUBJECT LIST IS ORDERED BY WHAT THE READER SEES (2026-09-10)
// ===========================================================================
// Migration 171 routed every subject NAME through subjectLabel(), but several
// catalogs kept SORTING on `subjects.name` — the column that same migration
// froze as the bulk-import match key. The two agreed only because 171 seeded
// subject_translations from those very strings, so the defect was invisible
// until the first rename and permanent after it.
//
// A second, quieter variant survived the same pass: pages that resolved each
// label correctly and then compared the results with a BARE localeCompare(),
// i.e. in the runtime's default collation, on a product whose default reader is
// Azerbaijani. Two of them carried comments claiming they had solved exactly
// the problem they were demonstrating.
//
// Both variants are pinned here — the behaviour through the shared helper, and
// the SHAPE of each defect swept across the whole source tree, because this is
// a mistake that reappears wherever someone writes the obvious sort.
describe("sortSubjectsByLabel orders by the RESOLVED label", () => {
  it("a rename changes the ORDER, not merely the text", () => {
    const t = tOver({
      ...CATALOG_EN,
      [subjectNameKey("english")]: "Zoology", // renamed by an admin
      [subjectNameKey("math")]: "Algebra",
    });
    const rows = [
      { id: "e", code: "english", name: "İngilis dili" },
      { id: "m", code: "math", name: "Riyaziyyat" },
    ];
    // Sorting on `name` gives İngilis dili → Riyaziyyat, i.e. Zoology above
    // Algebra on screen. That is the bug, and it is invisible until a rename.
    expect(sortSubjectsByLabel(t, "en", rows).map((s) => s.id)).toEqual(["m", "e"]);
    expect(sortSubjectsByLabel(t, "en", rows).map((s) => s.label)).toEqual([
      "Algebra",
      "Zoology",
    ]);
  });

  it("names a subject whose frozen `name` column is blank", () => {
    // `subjects.name` is an import key, not a display string, and nothing
    // requires it to be filled in. The translation is what a parent reads.
    const t = tOver({ [subjectNameKey("math")]: "Riyaziyyat" });
    expect(sortSubjectsByLabel(t, "az", [{ code: "math", name: "" }])[0].label).toBe(
      "Riyaziyyat",
    );
  });

  it("carries the label it sorted by, so the caller renders the same string", () => {
    // Re-resolving at render is how a list's ORDER and its TEXT drift apart.
    const t = tOver({ ...CATALOG_EN, [subjectNameKey("math")]: "Algebra" });
    const [first] = sortSubjectsByLabel(t, "en", [{ code: "math", name: "Riyaziyyat" }]);
    expect(first.label).toBe(subjectLabel(t, "math", "Riyaziyyat"));
  });

  it("leaves every other field on the row untouched", () => {
    const t = tOver(CATALOG_EN);
    const [row] = sortSubjectsByLabel(t, "en", [
      { id: "x", code: "math", name: "Riyaziyyat", prices: { month: 9 } },
    ]);
    expect(row).toMatchObject({ id: "x", code: "math", prices: { month: 9 } });
  });
});

describe("the comparator is keyed on the reader's alphabet", () => {
  // THE ASSERTION THAT MATTERS: one input, two locales, two different orders.
  // Drop the locale argument and the `en` expectations still pass while `az` —
  // the DEFAULT language of this product — silently regresses.
  const LABELS = tOver({
    [subjectNameKey("l")]: "Latın dili",
    [subjectNameKey("q")]: "Qrammatika",
    [subjectNameKey("i")]: "İnformatika",
    [subjectNameKey("x")]: "Xarici dil",
  });
  const order = (codes: string[], locale: string) =>
    sortSubjectsByLabel(
      LABELS,
      locale,
      codes.map((code) => ({ code, name: "" })),
    ).map((s) => s.label);

  it("puts q before l and x before i for an Azerbaijani reader", () => {
    expect(order(["l", "q"], "az")).toEqual(["Qrammatika", "Latın dili"]);
    expect(order(["i", "x"], "az")).toEqual(["Xarici dil", "İnformatika"]);
  });

  it("orders the SAME labels the other way for an English reader", () => {
    expect(order(["l", "q"], "en")).toEqual(["Latın dili", "Qrammatika"]);
    expect(order(["i", "x"], "en")).toEqual(["İnformatika", "Xarici dil"]);
  });

  it("builds each locale's comparator once and never mixes two up", () => {
    expect(subjectComparator("az")).toBe(subjectComparator("az"));
    expect(subjectComparator("az")).not.toBe(subjectComparator("en"));
  });

  it("degrades to a usable order for a locale the runtime cannot resolve", () => {
    // Hermes builds Intl from the platform, so a device without the data must
    // still get a sorted list rather than a crash.
    expect(subjectComparator("zz")("Algebra", "Zoology")).toBeLessThan(0);
    expect(subjectComparator("zz")("Zoology", "Algebra")).toBeGreaterThan(0);
  });
});

describe("subjectLabelOrNull guards on the resolved label", () => {
  it("resolves a subject the OLD raw-column guard threw away", () => {
    // The shipped shape was `name ? subjectLabel(...) : null`, which rejected
    // the row before the resolver could find the translation naming it.
    const t = tOver({ [subjectNameKey("math")]: "Riyaziyyat" });
    const oldGuard = (code: string, name: string) =>
      name ? subjectLabel(t, code, name) : null;
    expect(oldGuard("math", "")).toBeNull();
    expect(subjectLabelOrNull(t, "math", "")).toBe("Riyaziyyat");
  });

  it("is null only when there is genuinely nothing to print", () => {
    const t = tOver({});
    expect(subjectLabelOrNull(t, null, null)).toBeNull();
    expect(subjectLabelOrNull(t, "", "   ")).toBeNull();
    // A code with no translation anywhere is still better than blank.
    expect(subjectLabelOrNull(t, "unknown_code", "")).toBe("unknown_code");
  });

  it("never hands a caller the em-dash placeholder to print", () => {
    // Callers append this into sentences ("Round of the day — <subject>"); a
    // literal "—" there reads as a broken string, which is why the placeholder
    // is folded to null rather than passed through.
    const t = tOver({});
    expect(subjectLabel(t, null, null)).toBe(NO_SUBJECT_LABEL);
    expect(subjectLabelOrNull(t, null, null)).toBeNull();
  });
});

describe("the deferred sort sites are fixed, not just re-documented", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("the Add-Child catalogue sorts on the label", () => {
    const src = read("src/app/(parent)/children/new/page.tsx");
    expect(src).toContain("sortSubjectsByLabel(");
    expect(src).not.toContain('a.name.localeCompare(b.name, "az")');
    // The deferral note must leave with the deferral.
    expect(src).not.toContain("KNOWN LIMITATION");
  });

  it("getPublicSubjectPricing does NOT choose a display order", () => {
    const src = read("src/lib/pricing.ts");
    expect(src).not.toContain("KNOWN LIMITATION");
    // Its unstable_cache carries no locale in the key and serves anonymous
    // visitors, so any locale-aware sort here is one visitor's alphabet handed
    // to the other two for the next 60 seconds.
    expect(src).toContain('["public-subject-pricing"]');
    expect(src).not.toContain("localeCompare");
    // Nor may it resolve display names to sort by them: a display name is
    // per-locale and would have to enter the cache KEY, turning one shared
    // catalog into three. It must not reach for the subject-name reader in
    // @/lib/flags either.
    expect(src).not.toContain("subjectLabel");
    expect(src).not.toContain("getLocale");
    expect(src).not.toContain('from "@/lib/flags"');
  });

  it("the configurator orders the catalog it renders", () => {
    const src = read("src/components/PricingConfigurator.tsx");
    // It has the reader's language (useT + useLocale); lib/pricing.ts does not.
    expect(src).toContain("sortSubjectsByLabel(");
    expect(src).toContain("availableSubjects(subjects, selected)");
  });

  it("both public subject catalogues pass a locale to their comparator", () => {
    const web = read("src/app/(public)/subjects/page.tsx");
    expect(web).toContain("sortSubjectsByLabel(");
    expect(web).toContain("getLocale");
    // The original: a comment claiming the locale alphabet was handled, sitting
    // directly above a comparison that used the runtime default.
    expect(web).not.toContain("localeCompare(b.label)");
  });

  it("the leaderboard subject pickers order by the label", () => {
    for (const rel of [
      "src/app/(parent)/leaderboard/page.tsx",
      "src/app/child/leaderboard/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("sortSubjectsByLabel(");
      // `.order("name")` may STAY — as a deterministic base for the stable sort
      // — but it must no longer be what the picker's order is read from.
      expect(src).not.toContain("name: subjectLabel(t, s.code, s.name),");
    }
  });

  it("the analytics tab labels are collated for the reader", () => {
    const src = read("src/app/(parent)/analytics/page.tsx");
    expect(src).toContain("subjectComparator(locale)");
    expect(src).not.toContain("platformSubjects.sort((a, b) => a.name.localeCompare(b.name))");
  });

  it("the screens that print one subject guard on the resolved label", () => {
    for (const rel of [
      "src/app/child/test/run/[attemptId]/page.tsx",
      "src/app/child/test/result/[attemptId]/page.tsx",
      "src/app/(parent)/olympiads/page.tsx",
      "src/app/child/olympiads/page.tsx",
      "src/app/(parent)/subscription/page.tsx",
    ]) {
      expect(read(rel)).toContain("subjectLabelOrNull(");
    }
  });
});

describe("neither defect shape can come back anywhere in web-app/src", () => {
  // Source-level and REPO-WIDE, because both of these are shapes rather than
  // locations: each one is the obvious thing to write, each typechecks, and
  // each renders plausibly until a subject is renamed or the reader is not
  // Azerbaijani. Pinning only the sites fixed today would leave the next
  // call site free to reintroduce them.
  const sources = () => {
    const out: { rel: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          // COMMENTS ARE STRIPPED rather than whole files skipped. Several
          // files — subjectLabel.ts loudest of all — quote the anti-patterns in
          // the prose explaining why they are wrong, and exempting each of them
          // turns the explanation into a blind spot.
          out.push({
            rel: full,
            text: readFileSync(full, "utf8")
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
              .replace(/\s+/g, " "),
          });
        }
      }
    };
    walk("src");
    return out;
  };

  it("nothing guards on the raw subjects.name before resolving the label", () => {
    const bad = sources().filter((f) => /\.name \? subjectLabel\(/.test(f.text));
    expect(bad.map((f) => f.rel)).toEqual([]);
  });

  it("nothing sorts resolved labels with a locale-less localeCompare", () => {
    // ANY locale-less localeCompare, not merely one on a variable spelled
    // `label` or `subjectName`. The narrow version of this pattern is exactly
    // how the mobile twins of this defect survived the sweep that existed to
    // find them: one sorted `a.name`, and the other wrote
    // `(a.subjectName ?? "").localeCompare(…)`, putting an expression between
    // the field and the call. Every comparison in web-app/src that needs a
    // collation already passes one — a locale, or a deliberate hard-coded tag
    // where the order must not follow the reader (the topic-standing
    // tie-break, the country base list) — so this needs no exemption list.
    const bad = sources().filter((f) =>
      /\.localeCompare\(\s*[^,()]*\)/.test(f.text),
    );
    expect(bad.map((f) => f.rel)).toEqual([]);
  });
});
