// Back from a submenu returns to the MENU, never to Home.
//
// REPORTED BY TESTERS, on real devices: "when someone enters a menu and clicks
// another menu inside of that menu — a submenu — and when they want to go back
// with the navigation button, they go to the home screen, but they should go to
// the main menu."
//
// THE MECHANISM (read lib/navigation.ts for the long version). `(parent)` and
// `(student)` are Stacks anchored on their `(tabs)` navigator, and every
// secondary screen is pushed ON TOP of that one `(tabs)` route. Navigating to a
// TAB route from such a screen with push()/replace() therefore does not switch
// a tab: expo-router finds the divergence point at the GROUP STACK and
// dispatches PUSH/REPLACE of the whole `(tabs)` route there, mounting a SECOND
// tab navigator above the first. GO_BACK is dispatched from the deepest FOCUSED
// navigator upward, so it now reaches that duplicate Tabs navigator first, and
// React Navigation's default backBehavior ("firstRoute") does not decline it —
// it jumps to the FIRST tab, Home/Arena. The stack never pops. A second back
// press is what finally reaches the screen the user came from.
//
// Because the duplicate sits in NAVIGATION STATE, every affordance breaks
// together — the on-screen back bar, Android hardware back and the iOS
// swipe-back gesture all dispatch the same GO_BACK — which is why the fix is
// one rule rather than one handler: A TAB ROUTE IS NEVER PUSHED OR REPLACED.
// It is popped back to (POP_TO / router.dismissTo).
//
// Two halves below. First the helpers are exercised for real (lib/navigation.ts
// is a pure module — types only from expo-router — so a stub router pins which
// method each helper actually calls). Then the call sites are scanned as source
// text, because the defect is a WORD (`push` where `dismissTo` belongs) that no
// unit test can see from outside, and because the whole point is that the next
// screen to copy one of these lines fails here instead of on a tester's phone.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { StackRouter, TabActions, TabRouter } from "@react-navigation/routers";
import {
  GROUP_ENTRY_PARAMS,
  backOrTo,
  goToTab,
  isSameScreen,
  isTabsHref,
  openTarget,
  popToOrReplace,
} from "@/lib/navigation";
import { resolveDeepLink } from "@/lib/deeplink";

const SRC = resolve(__dirname, "..", "src");

// ---------------------------------------------------------------------------
// Part 1 — the helpers
// ---------------------------------------------------------------------------

type Call = { method: string; arg?: unknown };

/** Minimal stand-in for expo-router's Router: records what was called. */
function stubRouter(state: { canGoBack: boolean; canDismiss: boolean }) {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (arg?: unknown): void => {
      calls.push({ method, arg });
    };
  return {
    calls,
    router: {
      canGoBack: () => state.canGoBack,
      canDismiss: () => state.canDismiss,
      back: record("back"),
      push: record("push"),
      navigate: record("navigate"),
      replace: record("replace"),
      dismissTo: record("dismissTo"),
      dismiss: record("dismiss"),
      dismissAll: record("dismissAll"),
      setParams: record("setParams"),
      reload: record("reload"),
      prefetch: record("prefetch"),
    } as never,
  };
}

const PARENT_HOME = "/(parent)/(tabs)/home";
const STUDENT_TESTS = "/(student)/(tabs)/tests";

describe("isTabsHref", () => {
  it("recognises both tab groups, as strings and as href objects", () => {
    expect(isTabsHref(PARENT_HOME)).toBe(true);
    expect(isTabsHref(STUDENT_TESTS)).toBe(true);
    expect(isTabsHref("/(student)/(tabs)/olympiads")).toBe(true);
    expect(isTabsHref({ pathname: "/(parent)/(tabs)/news" } as never)).toBe(true);
  });

  it("does not claim the stacked screens that merely live in the same group", () => {
    // These are the SUBMENUS. Treating one as a tab would pop the menu it was
    // opened from — the opposite of the bug, and just as wrong.
    expect(isTabsHref("/(parent)/notifications")).toBe(false);
    expect(isTabsHref("/(parent)/leaderboard")).toBe(false);
    expect(isTabsHref("/(student)/profile")).toBe(false);
    expect(isTabsHref("/(public)/faq")).toBe(false);
    expect(
      isTabsHref({ pathname: "/(student)/test/result/[attemptId]", params: {} } as never),
    ).toBe(false);
  });
});

describe("goToTab", () => {
  it("POPS back to the mounted tab navigator when stacked above it", () => {
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    goToTab(router, PARENT_HOME);
    expect(calls).toEqual([{ method: "dismissTo", arg: PARENT_HOME }]);
  });

  it("never pushes or replaces a tab route — that is the bug itself", () => {
    for (const canDismiss of [true, false]) {
      const { router, calls } = stubRouter({ canGoBack: true, canDismiss });
      goToTab(router, STUDENT_TESTS);
      expect(calls.map((c) => c.method)).not.toContain("push");
      expect(calls.map((c) => c.method)).not.toContain("replace");
    }
  });

  it("plain-navigates when there is nothing to pop (already on a tab screen)", () => {
    // Here the divergence point IS the Tabs navigator, where expo-router
    // downgrades PUSH to NAVIGATE anyway; dismissTo would be dispatched at a
    // navigator that cannot handle POP_TO and would be a dead tap.
    const { router, calls } = stubRouter({ canGoBack: false, canDismiss: false });
    goToTab(router, STUDENT_TESTS);
    expect(calls).toEqual([{ method: "navigate", arg: STUDENT_TESTS }]);
  });
});

describe("popToOrReplace (the same rule one level up, on the ROOT stack)", () => {
  it("POPS back to the group that is already mounted instead of minting a second copy", () => {
    // The `(public)` guard bouncing a signed-in user off an auth screen. The
    // root stack holds [(parent), (public)], so there is something to dismiss.
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    popToOrReplace(router, PARENT_HOME);
    expect(calls).toEqual([{ method: "dismissTo", arg: PARENT_HOME }]);
  });

  it("REPLACES when there is nothing to pop — this is the login reset", () => {
    // Signing in from a cold [(public)] root: the target group is not in the
    // stack, so the auth screen must be DESTROYED, not left underneath.
    const { router, calls } = stubRouter({ canGoBack: false, canDismiss: false });
    popToOrReplace(router, PARENT_HOME);
    expect(calls).toEqual([{ method: "replace", arg: PARENT_HOME }]);
  });

  it("never pushes and never navigates", () => {
    // navigate() is the difference from goToTab(): at the ROOT stack NAVIGATE
    // PUSHES when the group is absent, which leaves the login screen mounted
    // beneath the authenticated group and bounces the guard forever.
    for (const canDismiss of [true, false]) {
      const { router, calls } = stubRouter({ canGoBack: true, canDismiss });
      popToOrReplace(router, "/(student)/(tabs)/home");
      const methods = calls.map((c) => c.method);
      expect(methods).not.toContain("push");
      expect(methods).not.toContain("navigate");
    }
  });
});

describe("backOrTo", () => {
  it("goes BACK whenever there is history — the same GO_BACK the hardware button and the swipe dispatch", () => {
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    backOrTo(router, STUDENT_TESTS);
    expect(calls).toEqual([{ method: "back", arg: undefined }]);
  });

  it("falls back through goToTab for a tab target, so the fallback cannot duplicate the tabs either", () => {
    const { router, calls } = stubRouter({ canGoBack: false, canDismiss: true });
    backOrTo(router, STUDENT_TESTS);
    expect(calls).toEqual([{ method: "dismissTo", arg: STUDENT_TESTS }]);
  });

  it("replaces for a NON-tab fallback (a cold deep link straight onto a leaf screen)", () => {
    const href = { pathname: "/(student)/test/result/[attemptId]", params: { attemptId: "x" } };
    const { router, calls } = stubRouter({ canGoBack: false, canDismiss: false });
    backOrTo(router, href as never);
    expect(calls).toEqual([{ method: "replace", arg: href }]);
  });
});

describe("isSameScreen (a URL vs a grouped route path)", () => {
  it("sees through the (group) segments, which never appear in a URL", () => {
    // usePathname() reports the left-hand side; the deep-link allowlist speaks
    // the right-hand side. Comparing them raw would never match, and the
    // de-duplication below would silently never fire.
    expect(isSameScreen("/notifications", "/(parent)/notifications")).toBe(true);
    expect(isSameScreen("/news/abc", "/(student)/news/abc")).toBe(true);
    expect(isSameScreen("/leaderboard/", "/(parent)/leaderboard")).toBe(true);
  });

  it("does not collapse different screens", () => {
    expect(isSameScreen("/notifications", "/(parent)/leaderboard")).toBe(false);
    expect(isSameScreen("/news/abc", "/(student)/news/xyz")).toBe(false);
    expect(isSameScreen("/news", "/(student)/news/abc")).toBe(false);
  });
});

describe("openTarget (deep links, push taps, notification rows)", () => {
  it("routes an allowlisted TAB target through goToTab", () => {
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    openTarget(router, "/(parent)/(tabs)/news", "/leaderboard");
    expect(calls).toEqual([{ method: "dismissTo", arg: "/(parent)/(tabs)/news" }]);
  });

  it("still PUSHES a non-tab target, so a deep-linked screen keeps a back target", () => {
    // /(parent)/leaderboard opened from Notifications must leave Notifications
    // in the stack — popping it would be the mirror image of the reported bug.
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    openTarget(router, "/(parent)/leaderboard", "/notifications");
    expect(calls).toEqual([{ method: "push", arg: "/(parent)/leaderboard" }]);
  });

  it("does NOTHING when the non-tab target is the screen already on top", () => {
    // A second notification for the article you are reading used to push an
    // identical copy: the screen does not change, so the back press that only
    // pops the duplicate reads as a dead tap.
    for (const path of ["/leaderboard", "/(parent)/leaderboard"]) {
      const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
      openTarget(router, "/(parent)/leaderboard", path);
      expect(calls).toEqual([]);
    }
  });

  it("still opens a DIFFERENT screen of the same kind (two articles are two screens)", () => {
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    openTarget(router, "/(student)/news/abc", "/news/xyz");
    expect(calls).toEqual([{ method: "push", arg: "/(student)/news/abc" }]);
  });

  it("re-opens a TAB target even when that tab is showing — goToTab cannot duplicate", () => {
    // The de-duplication is deliberately NOT applied to tabs: dismissTo() on
    // the tab you are already on pops the secondary screens above it, which is
    // the point of the notification tap.
    const { router, calls } = stubRouter({ canGoBack: true, canDismiss: true });
    openTarget(router, "/(parent)/(tabs)/news", "/news");
    expect(calls).toEqual([{ method: "dismissTo", arg: "/(parent)/(tabs)/news" }]);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — the call sites
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Drop block comments and whole-line `//` comments. Deliberately does NOT
 *  strip a trailing `//` on a code line: a URL literal would be truncated and
 *  the scan would read a mangled statement. Every comment this file needs to
 *  ignore is on its own line or inside a block. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/** The balanced-paren argument text of every `<callee>(` call. */
function callArgsOf(source: string, callee: string): string[] {
  const out: string[] = [];
  const needle = `${callee}(`;
  let at = source.indexOf(needle);
  while (at !== -1) {
    let depth = 0;
    const start = at + needle.length - 1;
    for (let i = start; i < source.length; i += 1) {
      const c = source[i];
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) {
          out.push(source.slice(start + 1, i));
          break;
        }
      }
    }
    at = source.indexOf(needle, at + needle.length);
  }
  return out;
}

/** The balanced-paren argument text of every `router.<method>(` call. */
function callArgs(source: string, method: string): string[] {
  return callArgsOf(source, `router.${method}`);
}

/** Split an argument list on TOP-LEVEL commas, so a nested call or an object
 *  literal counts as one argument rather than several. */
function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of args) {
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim() !== "" || parts.length > 0) parts.push(current);
  return parts;
}

const FILES = walk(SRC).map((p) => ({ path: p, rel: relative(SRC, p).replace(/\\/g, "/") }));
const TAB_PATH = /\/\((?:parent|student)\)\/\(tabs\)\//;

/**
 * Identifiers in this file that hold a tab route.
 *
 * The scan below would otherwise be blind to the exact shape the bug shipped
 * in: the test chain writes `const TESTS_TAB = "/(student)/(tabs)/tests"` and
 * then `const homeTab = isOlympiad ? OLYMPIADS_TAB : TESTS_TAB`, so the
 * offending call read `router.replace(homeTab)` and carried no literal at all.
 * Two passes — direct literals, then ternaries over names already known — are
 * enough for every alias in this codebase.
 */
function tabIdentifiers(source: string): string[] {
  const names = new Set<string>();
  const direct = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`]+)["'`]/g;
  for (const m of source.matchAll(direct)) {
    if (TAB_PATH.test(m[2])) names.add(m[1]);
  }
  const alias = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\?([^;\n]*):([^;\n]*);/g;
  for (const m of source.matchAll(alias)) {
    const branches = [m[2], m[3]].map((b) => b.trim());
    if (branches.every((b) => names.has(b))) names.add(m[1]);
  }
  return [...names];
}

it("finds the app sources (a broken walk must fail loudly, not vacuously pass)", () => {
  expect(FILES.length).toBeGreaterThan(60);
});

describe("no tab route is ever pushed or replaced", () => {
  it.each(["push", "replace"])("router.%s() never carries a (tabs) path", (method) => {
    const offenders: string[] = [];
    for (const { path, rel } of FILES) {
      if (rel === "lib/navigation.ts") continue; // the helper itself holds no literals
      const text = stripComments(readFileSync(path, "utf8"));
      const aliases = tabIdentifiers(text);
      for (const arg of callArgs(text, method)) {
        const carriesTab =
          TAB_PATH.test(arg) ||
          aliases.some((name) => new RegExp(`\\b${name}\\b`).test(arg));
        if (carriesTab) offenders.push(`${rel}: router.${method}(${arg.trim()})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("<Redirect> carries a tab route ONLY from a group layout or the entry route", () => {
    // A redirect issued from a LAYOUT (or app/index.tsx) diverges at the ROOT
    // stack and replaces the whole group — that is the login / logout / role
    // reset, and it MUST stay a replace so a signed-out user cannot swipe back
    // into an authenticated screen. Issued from a SCREEN inside the group it is
    // the duplicate-tabs bug wearing a different hat, and uses <TabRedirect>.
    // `app/(public)/_layout.tsx` used to be on this list and is deliberately
    // NOT any more: its bounce fires on the ROOT stack, where a replace mints a
    // new route key and leaves a SECOND copy of the authenticated group. It
    // uses <GroupRedirect> now — see the popToOrReplace block above.
    const allowed = new Set([
      "app/index.tsx",
      "app/(parent)/_layout.tsx",
      "app/(student)/_layout.tsx",
    ]);
    const offenders: string[] = [];
    for (const { path, rel } of FILES) {
      const text = stripComments(readFileSync(path, "utf8"));
      const hits = text.match(/<Redirect\s+href=\{?["'][^"']*["']/g) ?? [];
      for (const hit of hits) {
        if (TAB_PATH.test(hit) && !allowed.has(rel)) offenders.push(`${rel}: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the corrected call sites use the helpers", () => {
  const uses = (rel: string, fn: string) => {
    const text = readFileSync(join(SRC, rel), "utf8");
    expect(text).toContain('from "@/lib/navigation"');
    expect(text).toMatch(new RegExp(`\\b${fn}\\(\\s*router`));
  };

  it("every allowlisted target opens through openTarget (deep link, push tap, both inboxes)", () => {
    // These four are where a notification or an OS link lands on a TAB while a
    // secondary screen is open — the exact reported sequence.
    for (const rel of [
      "app/(parent)/notifications.tsx",
      "app/(student)/notifications.tsx",
      "features/boot/RootGate.tsx",
      "features/push/usePush.ts",
    ]) {
      uses(rel, "openTarget");
      expect(readFileSync(join(SRC, rel), "utf8")).not.toContain("router.push(resolved.target");
    }
  });

  it("every openTarget call passes the CURRENT PATH, so the de-duplication cannot be skipped", () => {
    // The third argument is what tells "open this" from "you are already
    // looking at this". TypeScript requires it, and this is the reader-facing
    // half of that: a call site that let it drift to `undefined` or a constant
    // would type-check and quietly push duplicates again.
    const offenders: string[] = [];
    for (const { path, rel } of FILES) {
      if (rel === "lib/navigation.ts") continue; // the declaration, not a call
      const text = stripComments(readFileSync(path, "utf8"));
      for (const arg of callArgsOf(text, "openTarget")) {
        const parts = splitTopLevel(arg);
        if (parts.length !== 3 || parts[2].trim() === "" || parts[2].trim() === "undefined") {
          offenders.push(`${rel}: openTarget(${arg.trim()})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a DEFERRED deep link pops to Login instead of pushing a second one", () => {
    // Signed out, an auth-required link is stored and the user is sent to
    // Login — which is very often the screen they are already on, so push()
    // left `[login, login]` and a back arrow that re-rendered the same screen.
    const gate = stripComments(readFileSync(join(SRC, "features/boot/RootGate.tsx"), "utf8"));
    expect(gate).toContain('popToOrReplace(router, "/(public)/login"');
    expect(gate).not.toContain('router.push("/(public)/login"');
  });

  it("the test chain leaves through backOrTo / goToTab, never a tab replace", () => {
    for (const rel of [
      "features/tests/TestSetupScreen.tsx",
      "features/tests/TestRunnerScreen.tsx",
      "features/tests/TestResultScreen.tsx",
      "features/tests/TestReviewScreen.tsx",
    ]) {
      const text = readFileSync(join(SRC, rel), "utf8");
      expect(text).toContain('from "@/lib/navigation"');
      expect(text).not.toContain("router.replace(homeTab)");
    }
  });

  it("the parent flows that end on a tab pop to it", () => {
    uses("app/(parent)/add-child.tsx", "goToTab");
    uses("app/(parent)/children/[id]/edit.tsx", "goToTab");
  });

  it("the student arena's tab shortcuts go through goToTab too", () => {
    uses("app/(student)/(tabs)/home.tsx", "goToTab");
  });
});

describe("every back affordance defers to the router", () => {
  it("the only hardware-back handler that navigates is the runner's leave guard, and it replays the router's own action", () => {
    // Android back, the header arrow and the iOS swipe all end up as the SAME
    // GO_BACK, so a handler that navigates on its own is how they drift apart.
    // The runner intercepts to ASK (beforeRemove + hardwareBackPress), then
    // dispatches the pending navigation action verbatim, or falls back to
    // backOrTo — never to a hand-picked destination.
    const runner = stripComments(
      readFileSync(join(SRC, "features/tests/TestRunnerScreen.tsx"), "utf8"),
    );
    expect(runner).toContain("BackHandler.addEventListener");
    expect(runner).toContain("(navigation as any).dispatch(action)");
    expect(runner).toContain("backOrTo(router, homeTab)");

    // The two other BackHandler subscriptions are overlay-scoped and navigate
    // nowhere: the app-lock swallows back, the optional-update card dismisses
    // itself. Pinned so neither grows a navigation call.
    for (const rel of ["features/applock/LockOverlay.tsx", "features/boot/screens.tsx"]) {
      const text = stripComments(readFileSync(join(SRC, rel), "utf8"));
      expect(text).toContain("BackHandler.addEventListener");
      for (const method of ["push", "replace", "navigate", "dismissTo", "back"]) {
        expect(callArgs(text, method)).toEqual([]);
      }
    }
  });

  it("every Modal still handles Android back, so closing a sheet never falls through to the navigator", () => {
    // A <Modal> is its own native window; without onRequestClose the back press
    // reaches the navigator underneath and pops the screen behind the sheet.
    const offenders: string[] = [];
    for (const { path, rel } of FILES) {
      // Comments stripped first: several of these files DOCUMENT the Modal
      // contract in prose, and a mention in a header comment is not a window.
      const text = stripComments(readFileSync(path, "utf8"));
      const modals = (text.match(/<Modal\b/g) ?? []).length;
      if (modals === 0) continue;
      const closes = (text.match(/onRequestClose=/g) ?? []).length;
      if (closes < modals) offenders.push(`${rel}: ${modals} <Modal>, ${closes} onRequestClose`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the deliberate stack resets are preserved", () => {
  it("logout / role guards still REPLACE the whole group", () => {
    // Non-negotiable: after signing out you must not be able to swipe back into
    // an authenticated screen. These redirects diverge at the ROOT stack, so
    // they replace the entire (parent)/(student) group — untouched by the fix.
    const parent = readFileSync(join(SRC, "app/(parent)/_layout.tsx"), "utf8");
    const student = readFileSync(join(SRC, "app/(student)/_layout.tsx"), "utf8");
    expect(parent).toContain('<Redirect href="/(public)/welcome" />');
    expect(student).toContain('<Redirect href="/(public)/welcome" />');
  });

  it("finishing the onboarding still REPLACES it, so it cannot be swiped back into", () => {
    const welcome = readFileSync(join(SRC, "app/(public)/welcome.tsx"), "utf8");
    expect(welcome).toContain("if (replace) router.replace(href);");
    // All three exits (skip, Log in, Register) pass replace = true.
    expect(
      (welcome.match(/leaveTo\("\/\(public\)\/(?:login|register)", true\)/g) ?? []).length,
    ).toBe(3);
  });

  it("submitting an attempt still REPLACES the runner with the result", () => {
    // Not a tab route, and deliberately unpoppable: back from the result must
    // never re-enter a graded attempt.
    const runner = readFileSync(join(SRC, "features/tests/TestRunnerScreen.tsx"), "utf8");
    expect(runner).toContain('pathname: "/(student)/test/result/[attemptId]"');
    expect(runner).toContain("router.replace({");
  });
});

// ---------------------------------------------------------------------------
// Part 3 — where BACK LANDS once it is no longer swallowed (backBehavior)
// ---------------------------------------------------------------------------
//
// Part 1 and 2 fixed the state CORRUPTION: a tab route is never pushed, so
// there is no phantom tab navigator to eat GO_BACK. That left the owner's
// literal complaint standing, because the tab navigator that remains answers
// GO_BACK itself — and React Navigation's TabRouter defaults to
// `backBehavior: "firstRoute"`, i.e. "jump to routes[0]". `home` is declared
// FIRST in both groups, so back from ANY tab went to Home / Arena no matter
// where the user came from. Fixing the duplicate and leaving the default is the
// same bug in a new costume.
//
// These tests drive the REAL @react-navigation/routers TabRouter — no renderer,
// no re-implementation — with the tab names and the backBehavior READ OUT OF
// THE LAYOUT FILES. That is what makes them a pin rather than a restatement:
// set either layout to "order", "firstRoute" or "none" and the behavioural
// assertions below fail with the destination that choice actually produces.

type Behavior = "firstRoute" | "initialRoute" | "order" | "history" | "fullHistory" | "none";

function layoutSource(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}

/** The backBehavior the layout actually ships. Absent = the buggy default. */
function backBehaviorOf(rel: string): Behavior {
  const m = /backBehavior=["']([a-zA-Z]+)["']/.exec(stripComments(layoutSource(rel)));
  if (!m) throw new Error(`${rel} does not set backBehavior — TabRouter defaults to firstRoute`);
  return m[1] as Behavior;
}

/** Tab names IN DECLARATION ORDER — routes[0] is what "firstRoute" would pick. */
function tabRouteNames(rel: string): string[] {
  return [...layoutSource(rel).matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
}

type RouterState = { index: number; routes: { name: string }[] };

/**
 * A live TabRouter configured exactly like the shipped layout.
 *
 * `back()` returns the newly focused tab, or `null` when the router DECLINES
 * the action — which is not a dead end but the whole point: React Navigation
 * then offers GO_BACK to the group Stack, then to the root Stack, and when
 * nothing takes it Android's BackHandler falls through to its default and the
 * app closes. Android hardware back, the iOS swipe-back gesture, the header
 * chevron and router.back() all dispatch this one action, so one model covers
 * every affordance at once.
 */
function tabs(rel: string, startOn?: string) {
  const routeNames = tabRouteNames(rel);
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} } as never;
  const router = TabRouter({ backBehavior: backBehaviorOf(rel) });
  let state = router.getInitialState(options) as unknown as RouterState;
  const focused = (): string => state.routes[state.index].name;
  const apply = (action: never): boolean => {
    const next = router.getStateForAction(state as never, action, options);
    if (next == null) return false;
    state = next as unknown as RouterState;
    return true;
  };
  // A deep link or a notification pop lands on a tab exactly the way a tap
  // does: the mounted navigator consumes the target and jumps to it.
  const jump = (name: string): void => {
    if (!apply(TabActions.jumpTo(name) as never)) throw new Error(`no tab named ${name}`);
  };
  if (startOn) jump(startOn);
  return {
    routeNames,
    focused,
    jump,
    /** null = declined, i.e. handed up to the Stack above (and then the OS). */
    back: (): string | null => (apply({ type: "GO_BACK" } as never) ? focused() : null),
  };
}

const PARENT_TABS = "app/(parent)/(tabs)/_layout.tsx";
const STUDENT_TABS = "app/(student)/(tabs)/_layout.tsx";

describe("both tab groups declare a deliberate backBehavior", () => {
  it.each([PARENT_TABS, STUDENT_TABS])("%s sets it to history", (rel) => {
    expect(backBehaviorOf(rel)).toBe("history");
  });

  it("home is still declared first, which is why the default was wrong", () => {
    // Not a style assertion — it is the premise. "firstRoute" answers GO_BACK
    // with routes[0], so for as long as `home` leads the list the DEFAULT is
    // the reported bug, and this is what the next block measures against.
    expect(tabRouteNames(PARENT_TABS)[0]).toBe("home");
    expect(tabRouteNames(STUDENT_TABS)[0]).toBe("home");
  });
});

describe("back returns to the tab the user came from", () => {
  it("PARENT: notification inbox → a TAB → back lands on the tab they were on, not Home", () => {
    // The reported sequence: a tab → bell → Notifications → tap a notification
    // whose action_url is a tab. goToTab() pops the inbox off the group Stack
    // and hands the mounted tab navigator the target, so the thing that answers
    // the next back press is the TabRouter — this one.
    const t = tabs(PARENT_TABS, "analytics");
    t.jump("news"); // ← the notification's /dashboard/news
    expect(t.back()).toBe("analytics");
  });

  it("STUDENT: leaving the test chain returns to the tab the attempt started from", () => {
    // Result "Yeni test", Review "Testlərə qayıt", the runner's cancel and the
    // leave guard's fallback all pop back onto the Tests / Olympiads tab.
    const t = tabs(STUDENT_TABS, "tests");
    t.jump("olympiads"); // an olympiad attempt starts here…
    expect(t.back()).toBe("tests"); // …and back is where it started, not Arena
  });

  it("still lands on Home / Arena when Home / Arena IS the tab they came from", () => {
    // Stated positively so nobody "fixes" it later: a child who opened Tests
    // FROM Arena is supposed to get Arena back. What changed is that the
    // destination is the previous tab rather than a hard-coded routes[0].
    const t = tabs(STUDENT_TABS);
    expect(t.focused()).toBe("home");
    t.jump("tests");
    expect(t.back()).toBe("home");
  });

  it("the default really would have jumped to Home from anywhere", () => {
    // Without this, the assertions above could pass for the wrong reason.
    const routeNames = tabRouteNames(PARENT_TABS);
    const options = { routeNames, routeParamList: {}, routeGetIdList: {} } as never;
    const router = TabRouter({}); // ← no backBehavior: the state that shipped
    let state = router.getInitialState(options) as unknown as RouterState;
    const step = (action: never): void => {
      state = router.getStateForAction(state as never, action, options) as unknown as RouterState;
    };
    step(TabActions.jumpTo("analytics") as never);
    step(TabActions.jumpTo("news") as never);
    step({ type: "GO_BACK" } as never);
    expect(state.routes[state.index].name).toBe("home");
  });
});

describe("Android hardware back still leaves the app", () => {
  it.each([PARENT_TABS, STUDENT_TABS])("%s: back at the entry tab is DECLINED, so it reaches the OS", (rel) => {
    // Declined → the group Stack sees it (one route, declines) → the root Stack
    // sees it (one route, declines) → BackHandler falls through and Android
    // closes the app. "history" seeds the history with the focused tab alone,
    // which is exactly why the first press already bubbles.
    expect(tabs(rel).back()).toBeNull();
  });

  it.each([PARENT_TABS, STUDENT_TABS])("%s: a DEEP-LINKED tab bubbles immediately too", (rel) => {
    // A cold link or push tap opens the app straight on a tab. There is no tab
    // history behind it, so back leaves rather than inventing a Home the user
    // never visited — and anything the link pushed ABOVE the tabs still pops
    // first, because the Stack is offered the action before the OS is.
    const routeNames = tabRouteNames(rel);
    const options = { routeNames, routeParamList: {}, routeGetIdList: {} } as never;
    const router = TabRouter({ backBehavior: backBehaviorOf(rel) });
    const seeded = router.getRehydratedState(
      { index: routeNames.indexOf("news"), routes: routeNames.map((name) => ({ name })) } as never,
      options,
    );
    expect((seeded as unknown as RouterState).routes[(seeded as unknown as RouterState).index].name).toBe("news");
    expect(router.getStateForAction(seeded as never, { type: "GO_BACK" } as never, options)).toBeNull();
  });

  it.each([PARENT_TABS, STUDENT_TABS])("%s: back can never cycle — it bottoms out in under one press per tab", (rel) => {
    // The reason "fullHistory" was rejected: it keeps duplicates, so bouncing
    // between two tabs ten times costs ten back presses to escape. "history"
    // de-duplicates, so the history holds at most one entry per tab.
    const t = tabs(rel);
    for (let i = 0; i < 20; i += 1) t.jump(t.routeNames[i % t.routeNames.length]);
    let presses = 0;
    while (t.back() !== null) {
      presses += 1;
      expect(presses).toBeLessThan(t.routeNames.length);
    }
  });
});

describe("the root-stack duplicates are closed too", () => {
  it("a signed-in session never resolves an AUTH deep link to a public screen", () => {
    // Pushing /(public)/login while signed in put a second copy of the whole
    // authenticated group on the ROOT stack: the guard bounced it with a
    // replace, and a replace mints a new route key. Resolving the link to the
    // session's own home means the auth screen is never mounted at all.
    for (const path of ["/login", "/register", "/child-login", "/"]) {
      expect(resolveDeepLink(path, "parent")).toEqual({
        kind: "open",
        target: "/(parent)/(tabs)/home",
      });
      expect(resolveDeepLink(path, "student")).toEqual({
        kind: "open",
        target: "/(student)/(tabs)/home",
      });
      // Signed OUT, every one of them still opens the public screen.
      expect((resolveDeepLink(path, null) as { target: string }).target).toContain("/(public)/");
    }
  });

  it("the (public) guard bounces through GroupRedirect, not a raw replace", () => {
    const layout = stripComments(readFileSync(join(SRC, "app/(public)/_layout.tsx"), "utf8"));
    expect(layout).toContain('import { GroupRedirect } from "@/lib/TabRedirect"');
    expect(layout).toContain('<GroupRedirect href="/(parent)/(tabs)/home" />');
    expect(layout).toContain('<GroupRedirect href="/(student)/(tabs)/home" />');
    expect(layout).not.toMatch(/<Redirect\s/);
  });

  it("the post-registration back button pops to Login instead of minting a second one", () => {
    // Register is normally PUSHED from Login, so replace() left [… login,
    // login] and the first back press re-rendered the same screen.
    const register = stripComments(readFileSync(join(SRC, "app/(public)/register.tsx"), "utf8"));
    expect(register).toContain('popToOrReplace(router, "/(public)/login")');
    expect(register).not.toContain('router.replace("/(public)/login")');
  });

  it("both redirect components swallow a throw from the navigation call, as <Redirect> does", () => {
    // expo-router's <Redirect> wraps its router.replace in try/catch because
    // linkTo() throws outright when the navigator is not ready. Uncaught inside
    // a focus effect, that takes the screen down with a red box instead of
    // leaving the user on the page they were already looking at.
    const redirects = readFileSync(join(SRC, "lib/TabRedirect.tsx"), "utf8");
    expect(redirects).toMatch(
      /try \{\s*go\(router, href\);\s*\} catch \(error\) \{\s*console\.error\(error\);/,
    );
    expect(redirects).toContain("export function TabRedirect");
    expect(redirects).toContain("export function GroupRedirect");
  });
});

// ---------------------------------------------------------------------------
// Part 4 — the CROSS-GROUP entry, driven through the real StackRouter
// ---------------------------------------------------------------------------
//
// Parts 1–3 close the case where the tab jump starts inside the group. This is
// the one that survived them, and it needs TWO things to be true at once:
//
//   avatar → Profile              (a secondary screen ABOVE `(tabs)`)
//   → FAQ                         (a `(public)` screen ABOVE the whole group,
//                                  on the ROOT stack — app/(parent)/profile.tsx
//                                  pushes it, and (public)/_layout.tsx says so)
//   → a push tap / OS deep link whose target is a TAB
//
// From there `dismissTo()` still dispatches POP_TO, but expo-router finds the
// divergence at the ROOT — `(public)` vs `(parent)` — so POP_TO lands on the
// ROOT stack. It drops `(public)`, KEEPS the `(parent)` route, and hands it
// `{ screen: "(tabs)", params: { screen: "<tab>" } }`. The group Stack, still
// showing `profile`, was told nothing; React Navigation then DERIVES a
// `NAVIGATE { name: "(tabs)" }` from those params, and StackRouter answers
// NAVIGATE by PUSHING whatever is not already on top. Second tab navigator,
// back lands on `profile`.
//
// The fix is one flag StackRouter reads off the group route's own params —
// `pop` — seeded by `initialParams` on the root layout's `(parent)`/`(student)`
// screens (GROUP_ENTRY_PARAMS, declared in lib/navigation.ts, wired in
// features/boot/RootGate.tsx). These tests drive the REAL StackRouter with the
// route names read out of the layout FILES and the seed read out of RootGate,
// so deleting either makes them fail with the state the router actually
// produces — `["(tabs)", "profile", "(tabs)"]`, and a back press that lands on
// `profile` — rather than with a restatement of the rule.

type StackState = {
  key: string;
  index: number;
  routes: { key: string; name: string; params?: Record<string, unknown> }[];
};

/** A live StackRouter configured like one of the app's stacks. */
function stack(
  routeNames: string[],
  opts: { anchor?: string; routeParamList?: Record<string, object | undefined> } = {},
) {
  const router = StackRouter(opts.anchor ? { initialRouteName: opts.anchor } : {});
  const options = {
    routeNames,
    routeParamList: opts.routeParamList ?? {},
    routeGetIdList: {},
  } as never;
  let state = router.getInitialState(options) as unknown as StackState;
  return {
    names: (): string[] => state.routes.map((r) => r.name),
    top: () => state.routes[state.index],
    key: (): string => state.key,
    /** false = the router DECLINED, i.e. the action is handed to the navigator
     *  above (and, when nothing takes it, to Android's BackHandler). */
    apply(action: never): boolean {
      const next = router.getStateForAction(state as never, action, options);
      if (next == null) return false;
      state = next as unknown as StackState;
      return true;
    },
  };
}

const push = (name: string, params?: Record<string, unknown>) =>
  ({ type: "PUSH", payload: { name, params } }) as never;
const goBack = () => ({ type: "GO_BACK" }) as never;

/** The root stack's route names, read from the FILE SYSTEM — `app/` is the
 *  navigator's configuration, so a new root group joins this list by existing. */
function rootRouteNames(): string[] {
  return readdirSync(join(SRC, "app"))
    .map((entry) => entry.replace(/\.tsx$/, ""))
    .filter((name) => name !== "_layout");
}

/** `initialParams` the ROOT layout seeds onto each root route. Parsed out of
 *  RootGate rather than assumed: remove the wiring and this returns `{}`, and
 *  the sequences below start pushing a second `(tabs)` again. */
function rootRouteParamList(): Record<string, object | undefined> {
  const source = stripComments(readFileSync(join(SRC, "features/boot/RootGate.tsx"), "utf8"));
  const list: Record<string, object | undefined> = {};
  const declared = /<Stack\.Screen\s+name="([^"]+)"\s+initialParams=\{GROUP_ENTRY_PARAMS\}/g;
  for (const m of source.matchAll(declared)) list[m[1]] = GROUP_ENTRY_PARAMS;
  return list;
}

/** A group Stack's route names, in declaration order — `(tabs)` leads, which is
 *  what `unstable_settings = { anchor: "(tabs)" }` guarantees at runtime. */
function groupRouteNames(rel: string): string[] {
  return [...layoutSource(rel).matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The action expo-router dispatches for `router.dismissTo("/(group)/(tabs)/x")`
 * when the divergence lands on the ROOT stack — i.e. when a `(public)` screen
 * is on top, so the first thing that differs is the root route itself.
 * (getNavigateAction → findDivergentState → POP_TO at that navigator, with the
 * rest of the path folded into nested `screen`/`params`.)
 */
function crossGroupPopTo(href: string, target: string) {
  const [group, tabs, tab] = href.split("/").filter(Boolean);
  return {
    type: "POP_TO",
    target,
    payload: { name: group, params: { screen: tabs, params: { screen: tab } } },
  } as never;
}

/** The same call when the group IS the focused root route: the divergence is
 *  the GROUP stack, and POP_TO is dispatched there instead. This is the path
 *  Parts 1–3 already covered; it is here as the contrast. */
function inGroupPopTo(href: string, target: string) {
  const [, tabs, tab] = href.split("/").filter(Boolean);
  return { type: "POP_TO", target, payload: { name: tabs, params: { screen: tab } } } as never;
}

/**
 * What React Navigation DERIVES when a navigator finds unconsumed nested params
 * on its own route (core useNavigationBuilder: `typeof route.params.screen ===
 * "string"` → a NAVIGATE carrying `pop: route.params.pop`). Nobody dispatches
 * this; the library builds it, which is exactly why the fix has to reach it
 * through params rather than through a `router.*` call.
 */
function derivedNestedAction(params: Record<string, unknown> | undefined) {
  const p = (params ?? {}) as Record<string, unknown>;
  return {
    type: "NAVIGATE",
    payload: {
      name: p.screen,
      params: p.params,
      path: p.path,
      merge: p.merge,
      pop: p.pop,
    },
  } as never;
}

const PARENT_GROUP = "app/(parent)/_layout.tsx";
const STUDENT_GROUP = "app/(student)/_layout.tsx";

describe("the root layout seeds the pop-back flag on both tab groups", () => {
  it("GROUP_ENTRY_PARAMS is the `pop` flag StackRouter reads, nothing else", () => {
    expect(GROUP_ENTRY_PARAMS).toEqual({ pop: true });
  });

  it("RootGate declares it on (parent) AND (student)", () => {
    // One group seeded and the other not is the worst outcome: the defect
    // survives for half the users and looks like a device-specific glitch.
    expect(Object.keys(rootRouteParamList()).sort()).toEqual(["(parent)", "(student)"]);
  });

  it("declaring those two screens does not hide the rest of the root stack", () => {
    // expo-router appends every file-system route the layout did not list, so
    // `index`, `(public)` and `gallery` are still there — but if that ever
    // stopped being true, the app would boot into an Unmatched screen, and
    // this is where it should be caught.
    const names = rootRouteNames();
    expect(names).toEqual(expect.arrayContaining(["index", "(public)", "(parent)", "(student)"]));
  });
});

describe("a tab jump from ANOTHER root group mounts no second tab navigator", () => {
  const sequence = (group: string, groupName: string, href: string, secondary: string) => {
    // avatar → Profile: a secondary screen pushed over the anchored `(tabs)`.
    const inner = stack(groupRouteNames(group), { anchor: "(tabs)" });
    expect(inner.apply(push(secondary))).toBe(true);
    expect(inner.names()).toEqual(["(tabs)", secondary]);

    // → FAQ: `(public)` pushed over the whole group, on the ROOT stack.
    const root = stack(rootRouteNames(), {
      anchor: groupName,
      routeParamList: rootRouteParamList(),
    });
    expect(root.apply(push("(public)", { screen: "faq" }))).toBe(true);
    expect(root.names()).toEqual([groupName, "(public)"]);

    return { inner, root };
  };

  it.each([
    [PARENT_GROUP, "(parent)", "/(parent)/(tabs)/news", "profile"],
    [STUDENT_GROUP, "(student)", "/(student)/(tabs)/tests", "profile"],
  ])(
    "%s: profile → FAQ → a TAB target pops back to the ONE mounted (tabs)",
    (group, groupName, href, secondary) => {
      const { inner, root } = sequence(group, groupName, href, secondary);

      // goToTab(): canDismiss() is true — the ROOT holds two routes — so
      // dismissTo() dispatches POP_TO, and it lands on the ROOT.
      expect(root.apply(crossGroupPopTo(href, root.key()))).toBe(true);
      expect(root.names()).toEqual([groupName]); // `(public)` is gone
      const handedDown = root.top().params;
      expect(handedDown).toMatchObject({
        pop: true, // ← the seed; without it the next line pushes a copy
        screen: "(tabs)",
        params: { screen: href.split("/").filter(Boolean)[2] },
      });

      // The group Stack was told nothing by that action. It consumes the params
      // itself, and this is the action it builds.
      expect(inner.apply(derivedNestedAction(handedDown))).toBe(true);
      expect(inner.names()).toEqual(["(tabs)"]); // one tab navigator, `profile` popped
      expect(inner.top().params).toEqual({ screen: href.split("/").filter(Boolean)[2] });

      // And back now leaves: the group Stack declines (one route), the root
      // Stack declines (one route), and Android's BackHandler closes the app.
      expect(inner.apply(goBack())).toBe(false);
      expect(root.apply(goBack())).toBe(false);
    },
  );

  it("WITHOUT the seed the same sequence pushes a second (tabs), and back lands on profile", () => {
    // The defect itself, so the assertions above cannot pass for the wrong
    // reason — and so the failure message names the real destination.
    const inner = stack(groupRouteNames(PARENT_GROUP), { anchor: "(tabs)" });
    inner.apply(push("profile"));
    const root = stack(rootRouteNames(), { anchor: "(parent)", routeParamList: {} });
    root.apply(push("(public)", { screen: "faq" }));

    root.apply(crossGroupPopTo("/(parent)/(tabs)/news", root.key()));
    expect(root.top().params).not.toHaveProperty("pop");

    inner.apply(derivedNestedAction(root.top().params));
    expect(inner.names()).toEqual(["(tabs)", "profile", "(tabs)"]);
    expect(inner.apply(goBack())).toBe(true);
    expect(inner.top().name).toBe("profile");
  });

  it("the IN-GROUP path is untouched: POP_TO lands on the group Stack and pops it", () => {
    // No `(public)` on top, so the divergence is the group Stack itself. The
    // seed is never consulted, and the behaviour Parts 1–3 pinned still holds.
    const inner = stack(groupRouteNames(PARENT_GROUP), { anchor: "(tabs)" });
    inner.apply(push("notifications"));
    expect(inner.apply(inGroupPopTo("/(parent)/(tabs)/news", inner.key()))).toBe(true);
    expect(inner.names()).toEqual(["(tabs)"]);
    expect(inner.top().params).toEqual({ screen: "news" });
  });

  it("a cross-group push of a NON-tab screen still keeps its back target", () => {
    // The seed rides on every root-level entry into the group, so this is the
    // check that it changed nothing for the pushes: PUSH does not read `pop`,
    // and a deep-linked secondary screen must still be poppable back to
    // whatever was under it.
    const inner = stack(groupRouteNames(PARENT_GROUP), { anchor: "(tabs)" });
    inner.apply(push("profile"));
    inner.apply(derivedNestedAction({ ...GROUP_ENTRY_PARAMS, screen: "leaderboard" }));
    expect(inner.names()).toEqual(["(tabs)", "profile", "leaderboard"]);
    expect(inner.apply(goBack())).toBe(true);
    expect(inner.top().name).toBe("profile");
  });
});

describe("the login and logout resets still collapse the root stack", () => {
  it("signing in from a lone (public) stack DROPS it — POP_TO replaces when the target is absent", () => {
    // Non-negotiable: a signed-out screen holding a child's credentials must
    // not be reachable by a back press afterwards. popToOrReplace() leans on
    // StackRouter's own fallback — `routes.slice(0, currentIndex).concat(route)`
    // — so the whole `(public)` group leaves the stack, seed or no seed.
    const root = stack(rootRouteNames(), {
      anchor: "(public)",
      routeParamList: rootRouteParamList(),
    });
    expect(root.names()).toEqual(["(public)"]);
    expect(root.apply(crossGroupPopTo("/(parent)/(tabs)/home", root.key()))).toBe(true);
    expect(root.names()).toEqual(["(parent)"]);
    expect(root.apply(goBack())).toBe(false); // nothing to swipe back into
  });

  it("logging out replaces the group with (public), leaving one root route", () => {
    // The group layouts' `<Redirect href="/(public)/welcome" />` diverges at the
    // root, so it REPLACES the whole authenticated group rather than stacking
    // over it. Same guarantee, opposite direction.
    const root = stack(rootRouteNames(), {
      anchor: "(parent)",
      routeParamList: rootRouteParamList(),
    });
    expect(
      root.apply({
        type: "REPLACE",
        payload: { name: "(public)", params: { screen: "welcome" } },
      } as never),
    ).toBe(true);
    expect(root.names()).toEqual(["(public)"]);
    expect(root.apply(goBack())).toBe(false);
  });
});
