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

/** Every query a screen RENDERS has to be in its sources array. */
const SCREENS: { file: string; sources: string[] }[] = [
  // The cleanest match to the report: the olympiad packages band is admin-
  // managed and was cached for five minutes while the pull refreshed only the
  // CMS copy printed around it.
  { file: "app/(public)/pricing.tsx", sources: ["overridesQ", "packagesQ"] },
  // The filters are built out of the scope ids and the subject catalog — an
  // admin renames a subject and the filter keeps naming the old one.
  {
    file: "features/ranking/RankingScreen.tsx",
    sources: ["scopeIdsQ", "subjectsQ", "listQ", "meQ", "districtsQ", "streakQ"],
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
      "schoolsQ",
      "listQ",
      "childrenQ",
      "posQ",
    ],
  },
  // `profile` feeds the greeting name and the header avatar.
  {
    file: "app/(parent)/(tabs)/home.tsx",
    sources: ["children", "freeAccess", "config", "profile", "lbQueries"],
  },
  { file: "features/olympiads/OlympiadsScreen.tsx", sources: ["config", "catalogQ", "poolCountsQ", "ownedQ", "liveQ"] },
  // The subject access set is derived from the config, so the config has to be
  // re-read with it or the cards can only be as fresh as their input.
  { file: "features/tests/TestsHomeScreen.tsx", sources: ["configQ", "accessQ", "attemptsQ"] },
  // (a) — these two had no hook at all.
  {
    file: "app/(parent)/add-child.tsx",
    sources: ["config", "freeAccess", "grades", "cities", "districts", "schools"],
  },
  {
    file: "app/(parent)/children/[id]/edit.tsx",
    sources: ["childrenQ", "rayonQ", "citiesQ", "gradesQ", "rayonsQ", "schools"],
  },
];

describe("usePullRefresh sources cover what the screen renders", () => {
  for (const screen of SCREENS) {
    describe(screen.file, () => {
      const source = read(screen.file);
      const sources = pullSources(source);

      it("calls usePullRefresh", () => {
        expect(sources.length).toBeGreaterThan(0);
      });

      // A complete sources array with no RefreshControl behind it refreshes on
      // focus but gives the user no gesture — half the fix.
      it("wires the pair into its scroll body", () => {
        expect(source).toContain("refreshing={refreshing}");
        expect(source).toContain("onRefresh={onRefresh}");
      });

      for (const name of screen.sources) {
        it(`refreshes ${name}`, () => {
          expect(sources).toContain(name);
        });
      }
    });
  }
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
