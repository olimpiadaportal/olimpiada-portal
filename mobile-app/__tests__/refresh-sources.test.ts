// A pull refreshes ONLY what it is handed.
//
// Reported as "when data changes the screen does not refresh automatically;
// the new value appears only after scrolling" — which is a literal description
// of pull-to-refresh, the app's only manual refresh affordance. Two distinct
// defects hid behind it, and this file pins both:
//
//   (a) Screens with NO usePullRefresh at all. Add-Child and Edit-Child read
//       four ADMIN-MANAGED catalogs (grades, cities, rayons, schools) cached
//       for ten minutes and rendered no RefreshControl, so when an admin added
//       a school the parent had no gesture that could reach it.
//   (b) Screens that call usePullRefresh but leave live queries out of
//       `sources`. The hook awaits exactly the array it is given (see its
//       header comment), so an omitted query is refreshed by nothing — not by
//       the pull, and not by the silent refresh-on-focus the hook also drives.
//
// SOURCE-LEVEL on purpose: a dropped source is invisible at runtime (the
// screen just keeps showing older data) and the omission is a deletion, which
// no rendering test can notice. Here it fails in the diff.
//
// AND SOURCE-LEVEL MEANS THE MATCH HAS TO BE STRUCTURAL — which the first
// version of this file got wrong. It asked `expect(text).toContain(name)`
// against the raw text of the array, and a substring is satisfied by a COMMENT
// that merely names a query, and (the reason this was rewritten) by
// `...(giveawayActive ? entQueries : [])` — a one-identifier slip that
// refreshes the two access reads exactly when the pill they feed is NOT on
// screen and skips them when it is. A source that is present but wrongly
// guarded refreshes at the wrong moment, and the old assertion could not tell
// that apart from correct code.
//
// So the array is parsed instead: comments dropped, split into its top-level
// entries, every plain source required to be handed over UNCONDITIONALLY, and
// every conditional source pinned to its actual condition.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..", "src");

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

/** The text INSIDE the `usePullRefresh([ … ])` array literal, brackets matched
 *  so a nested conditional or spread does not truncate it. */
function pullSources(source: string): string {
  const at = source.indexOf("usePullRefresh([");
  if (at < 0) return "";
  const start = source.indexOf("[", at);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return "";
}

/**
 * The array body split into its TOP-LEVEL entries, comments removed and
 * whitespace collapsed — so `...(cond ? q : [])` survives as ONE entry (the
 * scan tracks bracket depth and skips string literals) while the prose written
 * above an entry, which is where half the query names on these screens are
 * explained, disappears before anything is matched against it.
 */
function splitEntries(body: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    const next = body[i + 1];
    if (c === "/" && next === "/") {
      while (i < body.length && body[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < body.length && !(body[i] === "*" && body[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      cur += c;
      i += 1;
      while (i < body.length && body[i] !== c) {
        if (body[i] === "\\") {
          cur += body[i];
          i += 1;
        }
        cur += body[i];
        i += 1;
      }
      cur += c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((e) => e.replace(/\s+/g, " ").trim()).filter((e) => e.length > 0);
}

/**
 * The condition guarding `name` in this entry, or null when the entry is not a
 * guarded one. Exactly two shapes exist in the app, and both read "hand this
 * over only while COND":
 *
 *   `...(COND ? name : [])`   an ARRAY of queries (a useQueries result)
 *   `COND ? name : null`      a single query — usePullRefresh ignores falsy
 *
 * Anything else — the two branches swapped included — returns null and fails
 * the assertion, because a guard in a shape this file cannot read is a guard it
 * cannot vouch for.
 */
function guardOf(entry: string, name: string): string | null {
  const spread = new RegExp(`^\\.\\.\\.\\(\\s*(.+?)\\s*\\?\\s*${name}\\s*:\\s*\\[\\s*\\]\\s*\\)$`);
  const ternary = new RegExp(`^(.+?)\\s*\\?\\s*${name}\\s*:\\s*null$`);
  const m = spread.exec(entry) ?? ternary.exec(entry);
  return m ? (m[1] ?? "").trim() : null;
}

/** True when the entry is refreshed on every pull — no ternary above it.
 *  `??` and `?.` are not conditions on the source and do not count. */
function isUnconditional(entry: string): boolean {
  let depth = 0;
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "?" && depth === 0) {
      if (entry[i + 1] === "?") {
        i += 1;
        continue;
      }
      if (entry[i + 1] === ".") continue;
      return false;
    }
  }
  return true;
}

/** The right-hand side of `const <name> = …;`, or "" when there is none. */
function declOf(source: string, name: string): string {
  return new RegExp(`\\bconst ${name} = ([^;]+);`).exec(source)?.[1]?.trim() ?? "";
}

/** Home's ONE gate, named once because three places have to agree on it: the
 *  two hooks' `enabled` argument and the pull entry. */
const HOME_GATE = "pillReadsOn";

/** What a screen must refresh. A bare name asks only "is this refreshed at
 *  all"; `{ name, onlyWhen }` also pins WHEN, because a conditional source
 *  carrying the wrong condition refreshes at exactly the wrong moment and is
 *  invisible to any check that only looks for the name. */
type Expected = string | { name: string; onlyWhen: string };

/** Every query a screen RENDERS has to be in its sources array. */
const SCREENS: { file: string; sources: Expected[] }[] = [
  // The cleanest match to the report: the olympiad packages band is admin-
  // managed and was cached for five minutes while the pull refreshed only the
  // CMS copy printed around it.
  { file: "app/(public)/pricing.tsx", sources: ["overridesQ", "packagesQ"] },
  // The filters are built out of the scope ids and the subject catalog — an
  // admin renames a subject and the filter keeps naming the old one.
  {
    file: "features/ranking/RankingScreen.tsx",
    sources: [
      "scopeIdsQ",
      "subjectsQ",
      "listQ",
      "meQ",
      // Mounted only for the selection that renders them, so the condition is
      // half of what "refreshes it" means here.
      { name: "districtsQ", onlyWhen: "cityId" },
      { name: "streakQ", onlyWhen: 'board === "streak"' },
    ],
  },
  // Every picker on the parent board is a separate catalog read.
  {
    file: "app/(parent)/leaderboard.tsx",
    sources: [
      "config",
      "subjectsQ",
      "gradesQ",
      "citiesQ",
      "rayonsQ",
      { name: "schoolsQ", onlyWhen: 'scope === "school"' },
      "listQ",
      "childrenQ",
      { name: "posQ", onlyWhen: "childId" },
    ],
  },
  // `profile` feeds the greeting name and the header avatar; `entQueries` and
  // `trialQueries` are the two halves of the access pill that `access_status`
  // cannot see, and they are what a parent comes back to this screen to check
  // after paying or starting a trial. Their guard is pinned because refetch()
  // ignores `enabled`: guarded on anything other than the gate the hooks
  // themselves use, a pull fires 2N RPCs during the very window whose own pill
  // makes their answer irrelevant.
  {
    file: "app/(parent)/(tabs)/home.tsx",
    sources: [
      "children",
      "freeAccess",
      "config",
      "profile",
      "lbQueries",
      { name: "entQueries", onlyWhen: HOME_GATE },
      { name: "trialQueries", onlyWhen: HOME_GATE },
    ],
  },
  { file: "features/olympiads/OlympiadsScreen.tsx", sources: ["config", "catalogQ", "poolCountsQ", "ownedQ", "liveQ"] },
  // The subject access set is derived from the config, so the config has to be
  // re-read with it or the cards can only be as fresh as their input.
  { file: "features/tests/TestsHomeScreen.tsx", sources: ["configQ", "accessQ", "attemptsQ"] },
  // (a) — these two had no hook at all.
  {
    file: "app/(parent)/add-child.tsx",
    sources: [
      "config",
      "freeAccess",
      "grades",
      "cities",
      "districts",
      { name: "schools", onlyWhen: "info.cityId" },
    ],
  },
  {
    file: "app/(parent)/children/[id]/edit.tsx",
    sources: [
      "childrenQ",
      { name: "rayonQ", onlyWhen: "child" },
      "citiesQ",
      "gradesQ",
      "rayonsQ",
      "schools",
    ],
  },
];

describe("usePullRefresh sources cover what the screen renders", () => {
  for (const screen of SCREENS) {
    describe(screen.file, () => {
      const source = read(screen.file);
      const entries = splitEntries(pullSources(source));

      it("calls usePullRefresh", () => {
        expect(entries.length).toBeGreaterThan(0);
      });

      // A complete sources array with no RefreshControl behind it refreshes on
      // focus but gives the user no gesture — half the fix.
      it("wires the pair into its scroll body", () => {
        expect(source).toContain("refreshing={refreshing}");
        expect(source).toContain("onRefresh={onRefresh}");
      });

      for (const expected of screen.sources) {
        const name = typeof expected === "string" ? expected : expected.name;
        const onlyWhen = typeof expected === "string" ? null : expected.onlyWhen;
        // Word-bounded and comment-free: a query the array only TALKS about no
        // longer counts as one the array refreshes.
        const mentions = entries.filter((e) => new RegExp(`\\b${name}\\b`).test(e));

        it(`refreshes ${name}`, () => {
          expect(mentions).not.toHaveLength(0);
        });

        if (onlyWhen === null) {
          it(`refreshes ${name} on every pull`, () => {
            expect(mentions.filter(isUnconditional)).not.toHaveLength(0);
          });
        } else {
          it(`refreshes ${name} only when \`${onlyWhen}\``, () => {
            // The CONDITION is the value under test, so an inverted, renamed or
            // branch-swapped guard prints as a diff instead of passing on the
            // strength of the name appearing somewhere inside the entry.
            const guards = mentions.map((e) => guardOf(e, name) ?? `UNGUARDED: ${e}`);
            expect(guards).toContain(onlyWhen);
          });
        }
      }
    });
  }
});

// The entry above pins WHICH gate guards Home's two access reads. These pin
// what that gate has to mean: one gate shared with the hooks, and a gate that
// does not open before it knows the answer.
describe("home's access reads and their pull entry share ONE gate", () => {
  const source = read("app/(parent)/(tabs)/home.tsx");

  // refetch() ignores `enabled`, so the pull and the hooks are two independent
  // decisions about the same two RPCs. Spelled as the same identifier they
  // cannot drift apart.
  it("hands the same gate to both per-child hooks", () => {
    expect(source).toContain(`useEntitledSubjectsByChild(children.data, ${HOME_GATE})`);
    expect(source).toContain(`useFreeTrialsByChild(children.data, ${HOME_GATE})`);
  });

  // THE GATE MUST NOT WAIT FOR THE WINDOWS TO LOAD.
  //
  // An earlier form of this gate also required both window queries to have
  // SETTLED, so that a cold start inside a giveaway would not pay 2N round
  // trips for a pill the giveaway branch overrides anyway. Correct instinct,
  // wrong direction to fail in: `isPending` stays true for the whole retry
  // backoff (queryClient sets retry: 2), so on a flaky connection the two
  // CORRECTIVE reads were withheld for seconds — and the label they exist to
  // correct is "Giriş yoxdur" / "No access", shown to a parent who has paid, on
  // the screen they land on by default. Twice now that mislabel has been the
  // bug; a wasted round of reads inside a promo has never been one.
  //
  // So the gate may consult what the windows SAY, and must not consult whether
  // they have ANSWERED. Expanded one level so this pins the behaviour rather
  // than the name of whatever intermediate happens to hold it.
  it("suppresses the reads only for a window that is KNOWN active", () => {
    const gate = declOf(source, HOME_GATE);
    expect(gate).not.toBe("");
    const expanded = gate.replace(/[A-Za-z_$][\w$]*/g, (id) => declOf(source, id) || id);
    // It still has to know about both windows — the whole point of the gate.
    expect(expanded).toContain("giveaway");
    expect(expanded).toContain("freeAccess");
    // But never on their load state: that is the seconds-long mislabel.
    expect(expanded).not.toContain("isPending");
    expect(expanded).not.toContain("isLoading");
  });
});

describe("a rename reaches every cache that renders the name", () => {
  // The student profile screen and the arena home greeting read the student's
  // name from DIFFERENT query keys. Invalidating only the profile key renamed
  // the student on the screen they were looking at and left Home greeting them
  // by the old name until the app restarted.
  it("student name change invalidates the arena self key too", () => {
    const source = read("features/profile/studentSections.tsx");
    expect(source).toContain("studentProfileKey(profileId)");
    expect(source).toContain("QK.self(profileId");
  });
});
