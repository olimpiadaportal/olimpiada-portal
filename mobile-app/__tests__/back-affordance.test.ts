import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("visible back navigation", () => {
  it.each([
    ["parent", "src/app/(parent)/_layout.tsx"],
    ["student", "src/app/(student)/_layout.tsx"],
    ["public information", "src/app/(public)/_layout.tsx"],
  ])("gives the %s stack a custom back arrow with a safe fallback", (_name, path) => {
    const text = source(path);
    expect(text).toContain("<BackButton");
    expect(text).toContain("backOrTo(");
    expect(text).toContain("headerBackVisible: false");
  });

  it("covers every parent and student secondary route through the shared header helper", () => {
    const parent = source("src/app/(parent)/_layout.tsx");
    const student = source("src/app/(student)/_layout.tsx");

    for (const route of [
      "notifications",
      "leaderboard",
      "profile",
      "news/[slug]",
      "add-child",
      "link-child",
      "children/[id]/edit",
      "children/[id]/subscribe",
    ]) {
      expect(parent).toContain(`name="${route}" options={secondary(`);
    }
    for (const route of ["notifications", "profile", "news/[slug]"]) {
      expect(student).toContain(`name="${route}" options={secondary(`);
    }
  });

  it.each([
    "src/features/tests/TestSetupScreen.tsx",
    "src/features/tests/TestRunnerScreen.tsx",
    "src/features/tests/TestResultScreen.tsx",
    "src/features/tests/TestReviewScreen.tsx",
  ])("keeps an explicit arrow in the custom-header exam flow: %s", (path) => {
    expect(source(path)).toContain("<BackBar");
  });
});

// ---------------------------------------------------------------------------
// A ROUTE *TO* HOME FROM THE SCREENS THAT ARE PUSHED OVER THE TABS.
//
// Everything above is about going BACK, and going back is not the problem: the
// header chevron, Android hardware back and the iOS edge swipe already agree
// with each other and all return to the tab the user came FROM
// (`backBehavior="history"` in both tab layouts, chosen after testers reported
// being thrown to Home). What was missing is a route FORWARD, to Home. Every
// route on the two group Stacks is pushed OVER the tab bar, so for as long as
// one is open the tabs are off screen and back only retraces the way in — a
// parent who opened Subscribe from a push notification could reach the
// notification inbox and nothing else.
//
// THE CONTROL SHIPPED ON THE TWO PROFILE SCREENS AND STOPPED THERE. That is the
// regression this pins, and it is why the list below is DERIVED from the two
// layouts rather than typed out: a route added to either group Stack tomorrow
// is covered the moment it is declared, instead of on the day somebody
// remembers that this file exists.
describe("route to home from a trapped screen", () => {
  type Route = { group: "parent" | "student"; name: string; file: string };

  /** Every route its group Stack declares through the shared `secondary()`. */
  function secondaryRoutes(group: "parent" | "student"): Route[] {
    const layout = source(`src/app/(${group})/_layout.tsx`);
    const out: Route[] = [];
    const re = /<Stack\.Screen name="([^"]+)" options=\{secondary\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(layout))) {
      out.push({ group, name: m[1], file: `src/app/(${group})/${m[1]}.tsx` });
    }
    return out;
  }

  const ROUTES = [...secondaryRoutes("parent"), ...secondaryRoutes("student")];

  /**
   * Routes that are STILL OWED the control. All three files were being
   * rewritten by somebody else in the round that added it (2026-09-16) and
   * could not be touched in the same change.
   *
   * THIS LIST MAY ONLY SHRINK. It is not a category of screen that is exempt —
   * every entry is as trapped as the ones already covered, and an entry is
   * deleted the moment its file gains the control, never added to quiet a
   * failure.
   */
  const PENDING = [
    "src/app/(parent)/add-child.tsx",
    "src/app/(parent)/link-child.tsx",
    "src/app/(parent)/children/[id]/edit.tsx",
  ];

  const COVERED = ROUTES.filter((r) => !PENDING.includes(r.file));

  // A sweep that silently matches NOTHING passes every assertion under it. If
  // the layouts stop spelling their options `secondary(...)`, this is the test
  // that says so, rather than the eleven below quietly becoming vacuous.
  it("finds the secondary routes it is supposed to check", () => {
    expect(ROUTES.map((r) => `${r.group}:${r.name}`)).toEqual([
      "parent:notifications",
      "parent:leaderboard",
      "parent:profile",
      "parent:news/[slug]",
      "parent:add-child",
      "parent:link-child",
      "parent:children/[id]/edit",
      "parent:children/[id]/subscribe",
      "student:notifications",
      "student:profile",
      "student:news/[slug]",
    ]);
  });

  it.each(COVERED.map((r) => [r.file, r] as const))(
    "%s offers the header route to its group's home tab",
    (_file, route) => {
      const text = source(route.file);
      expect(text).toContain('from "@/components/HeaderHomeButton"');
      expect(text).toContain("<HeaderHomeButton");
      // Declared through the route's OWN Stack.Screen so it merges into the
      // options the layout already set for it. A screen that redeclared the
      // header wholesale would drop the back chevron pinned further up.
      expect(text).toContain("<Stack.Screen");
      expect(text).toContain("headerRight:");
      expect(text).toContain(`href="/(${route.group})/(tabs)/home"`);
    },
  );

  // The three back affordances must keep AGREEING: adding a way forward must
  // not quietly redirect the way back. A secondary route that declared its own
  // headerLeft, or re-enabled the native chevron, or disabled the swipe, would
  // be answering differently from Android back on that one screen.
  it.each(ROUTES.map((r) => r.file))("%s leaves the back affordances to the layout", (file) => {
    const text = source(file);
    expect(text).not.toContain("headerLeft:");
    expect(text).not.toContain("headerBackVisible");
    expect(text).not.toContain("gestureEnabled");
  });

  it("keeps the pending list honest", () => {
    const files = ROUTES.map((r) => r.file);
    // Every entry still names a route that exists and is still trapped.
    for (const file of PENDING) expect(files).toContain(file);
    // And nothing else is missing the control.
    const missing = ROUTES.filter((r) => !source(r.file).includes("<HeaderHomeButton"));
    expect(missing.map((r) => r.file).filter((f) => !PENDING.includes(f))).toEqual([]);
  });

  // WHY THE EXAM CHAIN IS NOT ON THE LIST, so it reads as a decision and not as
  // an oversight. The four test/* routes are declared `headerShown: false` —
  // they draw their own BackBar — so they never go through `secondary()` and
  // the derivation above cannot pick them up. That is the wanted outcome twice
  // over: a one-tap exit from a LIVE attempt destroys work the student cannot
  // get back (which is also why the runner disables the swipe), and a
  // headerRight on a hidden header would render nowhere at all.
  it("keeps the exam chain off the list on purpose", () => {
    const student = source("src/app/(student)/_layout.tsx");
    for (const route of [
      "test/[subjectId]",
      "test/run/[attemptId]",
      "test/result/[attemptId]",
      "test/review/[attemptId]",
    ]) {
      expect(student).toContain(`name="${route}" options={{ headerShown: false`);
      expect(ROUTES.map((r) => r.name)).not.toContain(route);
    }
    expect(student).toContain("gestureEnabled: false");
  });

  // The button POPS back to the tabs navigator that is already mounted. Pushing
  // a tab route instead mounts a SECOND Tabs navigator over the first, and that
  // one swallows the next back press — lib/navigation.ts writes out why.
  it("reaches the tab by popping to it, never by pushing it", () => {
    const button = source("src/components/HeaderHomeButton.tsx");
    expect(button).toContain("goToTab(router, href)");
    expect(button).not.toContain("router.push(");
    expect(button).not.toContain("router.replace(");
    // A bare glyph: the label exists for the screen reader, not on screen.
    expect(button).toContain("accessibilityLabel={label}");
  });

  it.each([
    ["parent", "src/app/(parent)/(tabs)/_layout.tsx"],
    ["student", "src/app/(student)/(tabs)/_layout.tsx"],
  ])("leaves the %s tab back behaviour alone", (_group, path) => {
    expect(source(path)).toContain('backBehavior="history"');
  });
});
