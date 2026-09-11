// Navigation helpers — the ONE place that knows the SHAPE of this route tree.
//
// THE SHAPE. `(parent)` and `(student)` are Stacks whose FIRST route is the
// `(tabs)` navigator — both group layouts pin it with
// `unstable_settings = { anchor: "(tabs)" }`, so `(tabs)` is at index 0 of that
// stack even on a cold deep link. Every secondary screen (notifications,
// profile, leaderboard, the whole test setup → runner → result → review chain)
// is PUSHED ON TOP of that single `(tabs)` route. `(public)` is a THIRD group,
// a sibling of those two on the ROOT stack — profile → FAQ and the account
// sheet's info rows push it OVER the group the user is signed into.
//
// THE BUG THIS FILE EXISTS FOR — "back from a submenu goes home instead of to
// the menu" (owner, tester reports). From one of those stacked screens,
// navigating to a TAB route with push()/replace() does NOT switch the tab
// underneath. expo-router computes the divergence point between the target and
// the live state (getNavigateAction → findDivergentState) and finds it at the
// GROUP STACK — the stack's top route is `notifications`, the target's route
// there is `(tabs)` — so it dispatches PUSH / REPLACE of the whole `(tabs)`
// route on that stack, and React Navigation's StackRouter mounts a SECOND COPY
// of the tab navigator above the one already mounted. (REPLACE is no safer:
// it mints a NEW route key, so the original `(tabs)` stays underneath.)
//
// From inside that duplicate, the deepest FOCUSED navigator is a Tabs
// navigator. GO_BACK — Android hardware back, the iOS swipe-back gesture and
// router.back() all dispatch it from the deepest focused navigator upward — is
// therefore offered to TabRouter FIRST, and with React Navigation's default
// `backBehavior: "firstRoute"` TabRouter does not decline it: it jumps to the
// FIRST tab, which is Home (parent) / Arena (student). The stack never pops, so
// the screen the user came from is still sitting under two tab navigators and a
// SECOND back press is what finally reaches it. Exactly the reported symptom.
//
// THE RULE, and it has no exceptions: a tab route is never PUSHED and never
// REPLACED. It is POPPED BACK TO. `router.dismissTo()` dispatches POP_TO, which
// finds the `(tabs)` route already in the stack, pops everything above it, and
// hands that route fresh `{ screen: "<tab>" }` params — which the ALREADY
// MOUNTED Tabs navigator consumes and jumps to (useNavigationBuilder applies a
// nested `params.screen` it has not consumed yet). One tab navigator, ever, so
// every back affordance agrees: back pops the stack, because there is no
// phantom tab navigator left to swallow it.
//
// THE CROSS-GROUP HALF, and why the rule needs one line of help from the ROOT
// LAYOUT. POP_TO pops back to a route inside THE STACK IT IS DISPATCHED AT, and
// expo-router picks that stack by finding where the target and the live state
// first differ. From a secondary screen inside the group that is the GROUP
// stack, and the rule holds on its own. But from a `(public)` screen — profile
// → FAQ, an account-sheet info row — the first thing that differs is the ROOT
// route itself, `(public)` vs `(parent)`. POP_TO is dispatched at the ROOT: it
// drops `(public)`, KEEPS the `(parent)` route that is already there, and hands
// it fresh `{ screen: "(tabs)", params: { screen: "<tab>" } }` params.
//
// That is where the second tab navigator came back, and why it survived the
// first fix — it needs a secondary screen above `(tabs)` AND a `(public)`
// screen above the group, both at once. The group Stack was told nothing; it is
// still showing `profile`. React Navigation's useNavigationBuilder then sees
// unconsumed nested params on its own route and DERIVES the action itself —
// `NAVIGATE { name: "(tabs)" }` — and StackRouter answers NAVIGATE by PUSHING
// whenever the target is not the route currently on top. `(tabs)` is at index
// 0, `profile` is on top, so a second `(tabs)` is pushed and the whole tab tree
// mounts twice; back lands on `profile` instead of leaving.
//
// The derived action is React Navigation's to build, not ours, and no `router.*`
// call can address the group Stack while a foreign group holds focus — the
// group is not in the focused chain, so an untargeted POP / POP_TO_TOP never
// reaches it, and a targeted one only ever lands where the divergence put it.
// StackRouter does read ONE flag off the group route's own params, though:
// `pop`. `NAVIGATE { pop: true }` looks the target up in the stack
// (`routes.findLast`) and, when it is there, keeps everything UP TO it and
// discards the rest — POP_TO's behaviour wearing NAVIGATE's name. And a route's
// params are seeded by the `initialParams` its parent navigator declares for it
// (`createParamsFromAction` merges `routeParamList[name]` UNDER the action's
// own params). So the root layout declares GROUP_ENTRY_PARAMS on `(parent)` and
// `(student)`, and the derived NAVIGATE pops back to the mounted `(tabs)`
// instead of pushing a copy: one dispatch, one tab navigator, `profile` gone,
// and back leaves the app instead of surfacing a screen the user had left.
//
// The flag reaches nothing else. Only a ROOT-LEVEL entry into a group carries
// it, the only ones the app makes are these two helpers' POP_TO, and a
// navigation that starts INSIDE the group diverges below the root and never
// rewrites the group route's params at all. push() at the root still pushes —
// PUSH ignores `pop` — so a cross-group deep link onto a secondary screen keeps
// its back target.
//
// Pure module (types only from expo-router) so it is unit-testable — see
// __tests__/back-to-parent-menu.test.ts.
import type { Href, Router } from "expo-router";

/** Prefixes of the two bottom-tab groups. Kept as literals, not a regex over
 *  "(tabs)", so a future non-tab group named similarly cannot match. */
const TAB_PREFIXES = ["/(parent)/(tabs)/", "/(student)/(tabs)/"] as const;

/**
 * Params the ROOT layout seeds onto the `(parent)` and `(student)` routes.
 *
 * Read THE CROSS-GROUP HALF above before touching this. `pop` is what turns the
 * nested NAVIGATE that React Navigation derives from those routes' params into
 * a pop-back instead of a push, and it is the only thing standing between a
 * cross-group tab jump and a second tab navigator. It lives here, beside the
 * rule it serves; it is wired in `features/boot/RootGate.tsx`.
 */
export const GROUP_ENTRY_PARAMS = { pop: true } as const;

/** An Href is either a path string or `{ pathname, params }`. */
function hrefPath(href: Href): string {
  if (typeof href === "string") return href;
  const pathname = (href as { pathname?: unknown }).pathname;
  return typeof pathname === "string" ? pathname : "";
}

/** True when the target is a screen INSIDE a bottom-tab navigator. */
export function isTabsHref(href: Href): boolean {
  const path = hrefPath(href);
  return TAB_PREFIXES.some((p) => path.startsWith(p));
}

/** Drop `(group)` segments: they organise the route tree and never appear in a
 *  URL, so `usePathname()` reports `/notifications` for the screen the deep-link
 *  allowlist calls `/(parent)/notifications`. Empty segments go with them, so a
 *  trailing slash cannot make two identical paths compare unequal. */
function withoutGroups(path: string): string {
  const kept = path
    .split("/")
    .filter((seg) => seg.length > 0 && !(seg.startsWith("(") && seg.endsWith(")")));
  return `/${kept.join("/")}`;
}

/** True when two hrefs address the SAME screen, one written as a URL and the
 *  other as a grouped route path. */
export function isSameScreen(a: string, b: string): boolean {
  return withoutGroups(a) === withoutGroups(b);
}

/**
 * Go to a bottom-tab screen WITHOUT mounting a second tab navigator.
 *
 * `canDismiss()` answers "is there a stack in the focused chain holding more
 * than one route" — i.e. "is anything stacked over the tabs, here or at the
 * root". When there is, POP back down to the `(tabs)` route that is already
 * mounted; the new params make it switch tab, and from a foreign group
 * GROUP_ENTRY_PARAMS carries the same pop-back one level down (see THE
 * CROSS-GROUP HALF above). When there is not, we are already on a tab screen
 * and the divergence point is the Tabs navigator itself, where expo-router
 * downgrades PUSH to NAVIGATE anyway — so a plain navigate() is the correct,
 * non-duplicating jump. dismissTo() would be dispatched at a navigator that
 * cannot handle POP_TO, and would be a dead tap.
 */
export function goToTab(router: Router, href: Href): void {
  if (router.canDismiss()) router.dismissTo(href);
  else router.navigate(href);
}

/**
 * Go to a route that must exist EXACTLY ONCE in the stack — goToTab()'s rule
 * one level UP, on the ROOT stack, where the groups live.
 *
 * Same mechanism, three call sites. (a) The `(public)` guard bouncing a
 * SIGNED-IN user off an auth screen: `<Redirect>` is a replace, and a replace
 * mints a NEW route key, so the authenticated group the user was already in
 * stays underneath and a SECOND copy lands on top — back then pops between two
 * identical Home screens. (b) The post-registration screen sending the user to
 * Login when Login is ALREADY the route below it: replace leaves
 * `[…, login, login]` and the first back press looks like a dead tap. (c) A
 * DEFERRED deep link — an auth-required link opened while signed out — sending
 * the user to Login from a stack that may already be showing Login.
 *
 * POP_TO answers all three because StackRouter defines it for both cases: when
 * the target IS in the stack it pops back to it (one copy, everything above
 * discarded); when it is NOT, it drops the current route and appends the
 * target — `routes.slice(0, currentIndex).concat(route)` — which is a replace.
 *
 * That second half is what keeps the DELIBERATE RESETS intact. Signing in from
 * `[(public)]` pops to a `(parent)` that is not there, so the ENTIRE
 * `(public)` group — login screen and all — is dropped from the root stack,
 * exactly as the replace did: a signed-out screen holding a child's credentials
 * can never be swiped back into. `replace()` is the fallback only for the one
 * state POP_TO cannot be dispatched from (a lone route with nothing to
 * dismiss), where it does the same thing.
 *
 * NEVER navigate() here — that is the difference from goToTab(). At the root
 * stack NAVIGATE PUSHES when the group is absent, which would leave the auth
 * screen mounted beneath the authenticated group, and every back press would
 * land on it and be bounced again.
 */
export function popToOrReplace(router: Router, href: Href): void {
  if (router.canDismiss()) router.dismissTo(href);
  else router.replace(href);
}

/**
 * "Go back, or to the parent route if there is no history."
 *
 * This is what every Geri / back-bar / back-arrow in the app means. `back()`
 * returns to whatever the user actually came from — the menu, the result
 * screen, the tab they started on — and is the ONLY variant that agrees with
 * Android hardware back and the iOS swipe, because those dispatch the same
 * GO_BACK. The fallback is for the histories that genuinely have no previous
 * screen: a cold deep link, a push-notification tap that launched the app.
 */
export function backOrTo(router: Router, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  if (isTabsHref(fallback)) {
    goToTab(router, fallback);
    return;
  }
  router.replace(fallback);
}

/**
 * Open an ALLOWLISTED target (deep link, push `action_url`, notification-inbox
 * row). `resolveDeepLink()` hands back a plain string, so this takes a string
 * and casts at the boundary — typed routes cannot type a value the allowlist
 * built at runtime, which is why every one of these call sites already carried
 * an `as never`. The cast is here now instead of in five screens, and the tab
 * targets among them (`/child/news` → the news TAB, `/analytics` → the
 * analytics TAB, …) stop duplicating the tab navigator.
 *
 * `currentPath` is `usePathname()` at the call site, and it is REQUIRED rather
 * than optional so that a new caller cannot quietly reintroduce the defect it
 * closes: a notification whose target is the screen ALREADY ON TOP used to be
 * PUSHED, stacking an identical copy of it. Nothing on screen changed, so the
 * first back press looked dead — it only popped the duplicate. Tab targets are
 * de-duplicated by goToTab()'s POP_TO; this is the same guarantee for the
 * stacked screens, which are the ones push() would double.
 */
export function openTarget(router: Router, target: string, currentPath: string): void {
  const href = target as never;
  if (isTabsHref(href)) {
    goToTab(router, href);
    return;
  }
  if (isSameScreen(currentPath, target)) return;
  router.push(href);
}
