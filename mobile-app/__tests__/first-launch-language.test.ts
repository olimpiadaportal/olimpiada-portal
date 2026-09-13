// FIRST-LAUNCH LANGUAGE SELECTION.
//
// OWNER REQUEST: the first screen a freshly installed app opens on is a
// language choice, shown as clear selectable cards; every onboarding and
// registration screen after it is already in that language; the choice survives
// killing the app; the in-app switcher still overrides it later.
//
// FOUR THINGS CAN QUIETLY BREAK THAT, and none of them shows up in a type:
//
//   * ORDER. The picker only means "first" while it is decided BEFORE the
//     router Stack mounts. Move it below the Stack, or turn it into a
//     `(public)` route, and it becomes a screen the onboarding carousel and
//     three deep-link rules (lib/deeplink.ts opens /(public)/welcome directly)
//     can all get in front of. The ordering assertion is therefore
//     MUTATION-TESTED below: the same predicate is run against a deliberately
//     reordered copy of the source and must fail on it, or it is proving
//     nothing about the real file.
//
//   * THE KEY. `olympiq.locale`'s presence cannot stand in for "the user
//     chose": RootGate's clamp effect calls setLocale() by itself when the
//     hydrated locale is outside the admin-enabled set, so on a device whose
//     language is not enabled that key exists before the user has seen
//     anything. And folding the flag into `olympiq.seenWelcome` would make
//     "picked a language, then killed the app mid-carousel" re-ask.
//
//   * THE OFFER. All three locales, each named in its own language, or the
//     screen fails the one person it exists for — someone who cannot read the
//     language the device happened to be set to.
//
//   * THE SWITCHER. The first-launch pick is a default, not a lock: both
//     existing switches must keep working, and neither may set the flag.
//
// Source assertions where the subject is .tsx (this suite is .ts-only per
// package.json testMatch, and there is no renderer harness), pure-function
// assertions everywhere the decision could be extracted — which is why
// shouldAskForLanguage() and localeChoiceOptions() exist as exported functions
// rather than as expressions inside the gate.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LOCALE_CHOSEN_KEY,
  localeChoiceOptions,
  shouldAskForLanguage,
  useLocaleChoice,
} from "@/features/boot/localeChoice";
import { LOCALE_NAMES, locales } from "@/i18n";
import { mobileMessages } from "../src/i18n/messages.mobile";

// In-memory SecureStore. The `mock` name prefix is what lets jest's hoisted
// factory reference these (optional-update.test.ts precedent).
const mockStore = new Map<string, string>();
let mockThrows = false;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => {
    if (mockThrows) throw new Error("keystore unavailable");
    return mockStore.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (mockThrows) throw new Error("keystore unavailable");
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  mockThrows = false;
  useLocaleChoice.setState({ chosen: false, hydrated: false });
});

const SRC = resolve(__dirname, "..", "src");

/** Source with comments blanked: prose ABOUT a gate must never satisfy a test
 *  that the gate is there. The `[^:]` guard keeps `https://` intact. */
function code(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Raw source, comments intact — for asserting on a string literal. */
function raw(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

// ---------------------------------------------------------------------------
// 1. The picker is decided ahead of the onboarding, and the guard is mutated
// ---------------------------------------------------------------------------

/**
 * THE ORDERING PREDICATE, extracted so it can be run against a MUTATED copy of
 * the source as well as the real one.
 *
 * "Ahead of the onboarding" is exactly "ahead of the <Stack>": the carousel is
 * `/(public)/welcome`, a route, and routes only exist once RootGate renders the
 * navigator. A gate that returns before that is unreachable-past by
 * construction — no route, no back gesture, no deep link.
 */
function gateDecidedBeforeTheStack(src: string): boolean {
  const gate = src.indexOf("<LanguageChoiceScreen");
  const stack = src.indexOf("<Stack");
  return gate !== -1 && stack !== -1 && gate < stack;
}

/** The picker must not be able to flash before its own flag has hydrated. */
function splashHeldBeforeTheGate(src: string): boolean {
  const splash = src.indexOf("choiceHydrated ||");
  const gate = src.indexOf("<LanguageChoiceScreen");
  return splash !== -1 && gate !== -1 && splash < gate;
}

describe("the language screen is IN the entry decision, ahead of onboarding", () => {
  const rootGate = code("features/boot/RootGate.tsx");

  it("returns the picker instead of the router Stack, not inside it", () => {
    expect(gateDecidedBeforeTheStack(rootGate)).toBe(true);
    // `return`ed, so nothing is mounted behind it — the same shape as the
    // force-update and maintenance gates, and the reason there is nothing to
    // deep-link past. An overlay (the optional-update card) would not do.
    expect(rootGate).toContain("return <LanguageChoiceScreen");
  });

  it("MUTATION: the same assertion fails when the gate moves below the Stack", () => {
    // Without this, "gate < stack" could be passing because of where the two
    // strings happen to sit rather than because the order is real. Move the
    // gate's return AFTER the navigator and the predicate must go false.
    // Matched by SHAPE, not by the exact argument expression: the options are
    // built inline from the config, and pinning that call verbatim made this
    // test fail for a refactor that did not move the gate at all. What must hold
    // is that the return exists and sits above the Stack.
    const gateMatch = rootGate.match(/return <LanguageChoiceScreen[^;]*;/);
    expect(gateMatch).not.toBeNull();
    const gateLine = (gateMatch as RegExpMatchArray)[0];
    const moved = rootGate
      .replace(gateLine, "")
      .replace("</Stack>", `</Stack>${gateLine}`);
    expect(gateDecidedBeforeTheStack(moved)).toBe(false);
  });

  it("MUTATION: and when the gate is deleted outright", () => {
    const deleted = rootGate.replace(/<LanguageChoiceScreen/g, "<Nothing");
    expect(gateDecidedBeforeTheStack(deleted)).toBe(false);
  });

  it("holds the splash until the flag has hydrated, so it cannot flash", () => {
    expect(splashHeldBeforeTheGate(rootGate)).toBe(true);
    // MUTATION: drop it from the splash condition and the predicate goes false.
    expect(splashHeldBeforeTheGate(rootGate.replace("choiceHydrated ||", ""))).toBe(false);
  });

  it("hydrates the flag in the same boot effect as the sibling flags", () => {
    // A flag nobody reads from storage is a picker on every launch.
    expect(rootGate).toContain("void hydrateLocaleChoice();");
  });

  it("asks AFTER the config gates, so the offer matches the admin-enabled set", () => {
    // Before them, the picker would offer compiled locales and RootGate's clamp
    // effect would snap a disabled pick back a frame later.
    const configGate = rootGate.indexOf("config.isPending");
    const gate = rootGate.indexOf("<LanguageChoiceScreen");
    expect(configGate).toBeGreaterThan(-1);
    expect(configGate).toBeLessThan(gate);
    expect(rootGate).toContain("localeChoiceOptions(cfg?.locales.supported)");
  });

  it("asks BEFORE force-update and maintenance, whose copy is admin-authored", () => {
    // Those two screens print a trilingual admin message. Asking first is what
    // makes them render in the language the user just picked.
    const gate = rootGate.indexOf("<LanguageChoiceScreen");
    expect(gate).toBeLessThan(rootGate.indexOf("<ForceUpdateScreen"));
    expect(gate).toBeLessThan(rootGate.indexOf("<MaintenanceScreen"));
  });

  it("leaves the onboarding sequence itself untouched", () => {
    // The owner asked for the picker BEFORE the existing flow, not for a new
    // flow: index.tsx still routes a signed-out user to the carousel on a first
    // launch and to Login afterwards, on the same seenWelcome flag.
    const index = code("app/index.tsx");
    expect(index).toContain('seenWelcome ? "/(public)/login" : "/(public)/welcome"');
    expect(index).not.toContain("LanguageChoiceScreen");
  });
});

// ---------------------------------------------------------------------------
// 2. The persistence key, and why it is not one of the two that already exist
// ---------------------------------------------------------------------------

describe("the choice persists under its own key", () => {
  it("is distinct from olympiq.seenWelcome and olympiq.locale", () => {
    expect(LOCALE_CHOSEN_KEY).toBe("olympiq.localeChosen");
    // Read the siblings out of their own sources rather than restating them:
    // renaming one of those has to fail here, not silently collide.
    expect(raw("features/boot/seenWelcome.ts")).toContain('"olympiq.seenWelcome"');
    expect(raw("i18n/index.ts")).toContain('"olympiq.locale"');
    expect(LOCALE_CHOSEN_KEY).not.toBe("olympiq.seenWelcome");
    expect(LOCALE_CHOSEN_KEY).not.toBe("olympiq.locale");
  });

  it("round-trips through SecureStore: choose, kill the app, do not re-ask", () => {
    useLocaleChoice.getState().markChosen();
    expect(useLocaleChoice.getState().chosen).toBe(true);
    return Promise.resolve().then(async () => {
      // The write is fire-and-forget; let it settle, then boot from scratch.
      expect(mockStore.get(LOCALE_CHOSEN_KEY)).toBe("1");
      useLocaleChoice.setState({ chosen: false, hydrated: false });
      await useLocaleChoice.getState().hydrate();
      expect(useLocaleChoice.getState().chosen).toBe(true);
      expect(useLocaleChoice.getState().hydrated).toBe(true);
    });
  });

  it("does not touch the onboarding flag, so the carousel still shows", () => {
    // The required case: language chosen, app killed before the carousel ends.
    useLocaleChoice.getState().markChosen();
    expect([...mockStore.keys()]).toEqual([LOCALE_CHOSEN_KEY]);
  });

  it("is idempotent — a second confirm writes nothing new", () => {
    useLocaleChoice.getState().markChosen();
    mockStore.delete(LOCALE_CHOSEN_KEY);
    useLocaleChoice.getState().markChosen();
    expect(mockStore.has(LOCALE_CHOSEN_KEY)).toBe(false);
  });

  it("reads a SecureStore failure as NOT chosen, and boots anyway", () => {
    mockThrows = true;
    return useLocaleChoice
      .getState()
      .hydrate()
      .then(() => {
        // Asking again is the safe direction to fail in (the sibling flags fail
        // the same way); a locked-in language nobody picked is not.
        expect(useLocaleChoice.getState().chosen).toBe(false);
        expect(useLocaleChoice.getState().hydrated).toBe(true);
      });
  });
});

// ---------------------------------------------------------------------------
// 3. The decision itself
// ---------------------------------------------------------------------------

describe("shouldAskForLanguage", () => {
  it("asks exactly once: on a hydrated first launch", () => {
    expect(shouldAskForLanguage({ hydrated: true, chosen: false, optionCount: 3 })).toBe(true);
    expect(shouldAskForLanguage({ hydrated: true, chosen: true, optionCount: 3 })).toBe(false);
  });

  it("never before the flag is read, so it cannot flash on launch 1000", () => {
    expect(shouldAskForLanguage({ hydrated: false, chosen: false, optionCount: 3 })).toBe(false);
  });

  it("never when there is nothing to choose between", () => {
    // One admin-enabled language is not a choice — LocaleSwitcher hides itself
    // on the same test rather than rendering a dead control.
    expect(shouldAskForLanguage({ hydrated: true, chosen: false, optionCount: 1 })).toBe(false);
    expect(shouldAskForLanguage({ hydrated: true, chosen: false, optionCount: 0 })).toBe(false);
    expect(shouldAskForLanguage({ hydrated: true, chosen: false, optionCount: 2 })).toBe(true);
  });
});

describe("localeChoiceOptions", () => {
  it("offers the admin-enabled set, in the admin's order", () => {
    expect(localeChoiceOptions(["ru", "az"])).toEqual(["ru", "az"]);
  });

  it("degrades to all three rather than to an empty picker", () => {
    expect(localeChoiceOptions(undefined)).toEqual(["az", "en", "ru"]);
    expect(localeChoiceOptions([])).toEqual(["az", "en", "ru"]);
    expect(localeChoiceOptions(["xx", "de"])).toEqual(["az", "en", "ru"]);
  });

  it("drops garbage without dropping the real entries beside it", () => {
    expect(localeChoiceOptions(["az", "tr", "ru"])).toEqual(["az", "ru"]);
  });
});

// ---------------------------------------------------------------------------
// 4. The screen: all three languages, named in their own language
// ---------------------------------------------------------------------------

describe("the picker offers every language, readably", () => {
  const screen = code("features/boot/LanguageChoiceScreen.tsx");

  it("names each language IN ITS OWN language", () => {
    // The whole reason the picker is usable by someone who cannot read the
    // device language. Deliberately never translated.
    expect(LOCALE_NAMES).toEqual({ az: "Azərbaycan", en: "English", ru: "Русский" });
    expect(locales).toEqual(["az", "en", "ru"]);
    // And there is exactly ONE copy of that map: a second would drift.
    expect(screen).toContain("LOCALE_NAMES[locale]");
    expect(screen).not.toContain('az: "Azərbaycan"');
    expect(code("components/LocaleSwitcher.tsx")).toContain("LOCALE_NAMES");
  });

  it("renders one card per offered locale, not a hardcoded three", () => {
    // The offer comes from config, so a disabled locale must not appear.
    expect(screen).toContain("options.map((l)");
    expect(screen).toContain("<LanguageCard");
  });

  it("is a radiogroup of radios that report their selected state", () => {
    expect(screen).toContain('accessibilityRole="radiogroup"');
    expect(screen).toContain('accessibilityRole="radio"');
    expect(screen).toContain("accessibilityState={{ selected }}");
    // The state is spoken as well as drawn.
    expect(screen).toContain("selectedNote");
  });

  it("highlights something before the user has chosen anything", () => {
    // The store hydrates to the persisted locale, else the device language,
    // else az — and the screen falls back to the first offered option if that
    // value is not in the admin-enabled set (one frame before the clamp).
    expect(screen).toContain("options.includes(locale) ? locale : (options[0] ?? locale)");
  });

  it("switches the app's language on tap, so the choice is READ, not trusted", () => {
    expect(screen).toContain("onPress={() => setLocale(l)}");
  });

  it("puts its one action in the shared ActionArea", () => {
    // This gate replaces the navigator: the button is the only way out, and
    // three cards at 1.3x on a 320pt phone must not be able to push it off.
    // CenteredShell routes `actions` into ActionAreaShell.
    expect(screen).toContain("<CenteredShell");
    expect(screen).toContain("actions={");
    expect(code("features/boot/screens.tsx")).toContain("export function CenteredShell");
  });

  it("sizes with flex and tokens — no width, no height, both themes", () => {
    // mobile-app/CLAUDE.md: a fixed pixel box that fits a Pro Max overflows an
    // SE, and az/ru labels run long. minHeight is a touch-target floor, which
    // is why it is the one dimension allowed here.
    expect(/\bwidth:/.test(screen)).toBe(false);
    expect(/\bheight:/.test(screen)).toBe(false);
    expect(screen).toContain("minHeight: 56");
    expect(screen).toContain("flex: 1, minWidth: 0");
    // Every colour is a theme token, so light and dark both work with no fork.
    expect(screen).toContain("tokens.accent");
    expect(screen).toContain("tokens.surface");
    expect(/#[0-9a-fA-F]{3,8}\b/.test(screen)).toBe(false);
  });

  it("keeps the choice LOCAL — nothing writes profiles.preferred_locale", () => {
    expect(screen).not.toContain("preferred_locale");
    expect(code("features/boot/localeChoice.ts")).not.toContain("preferred_locale");
    expect(code("features/boot/RootGate.tsx")).not.toContain("preferred_locale");
  });

  it("carries its copy in all three locales", () => {
    for (const key of ["mob.lang.body", "mob.lang.continue", "mob.lang.selected"]) {
      for (const loc of ["az", "en", "ru"] as const) {
        expect(mobileMessages[loc][key]?.length ?? 0).toBeGreaterThan(0);
      }
      // Not the same string three times — that is what an untranslated key
      // looks like once it has been copy-pasted into all three blocks.
      const values = new Set(["az", "en", "ru"].map((l) => mobileMessages[l as "az"][key]));
      expect(values.size).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The first-launch pick is a default, not a lock
// ---------------------------------------------------------------------------

describe("the in-app switchers keep working, and keep overriding it", () => {
  it("both existing switches are still mounted where they were", () => {
    // Signed-out funnel.
    for (const rel of ["app/(public)/welcome.tsx", "app/(public)/login.tsx", "app/(public)/register.tsx"]) {
      expect(code(rel)).toContain("<LocaleSwitcher");
    }
    // Signed-in: the account sheet's segmented control.
    const sheet = code("components/AccountSheet.tsx");
    expect(sheet).toContain("onChange={setLocale}");
    expect(sheet).toContain('t("drawer2.language")');
  });

  it("a later switch is permanent: every switcher writes the same store", () => {
    // One persisted locale, so a change from the sheet outlives the app the
    // same way the first-launch pick does.
    expect(code("components/LocaleSwitcher.tsx")).toContain("useLocaleStore");
    expect(code("components/AccountSheet.tsx")).toContain("useLocaleStore");
    expect(raw("i18n/index.ts")).toContain("SecureStore.setItemAsync(STORE_KEY, l)");
  });

  it("setLocale does NOT mark the choice — the clamp effect calls it too", () => {
    // RootGate calls setLocale() by itself to clamp a locale outside the
    // admin-enabled set. If that marked the flag, a first launch on a device
    // language the admin disabled would silently skip the picker.
    const i18n = code("i18n/index.ts");
    expect(i18n).not.toContain("localeChoice");
    expect(i18n).not.toContain("markChosen");
    const rootGate = code("features/boot/RootGate.tsx");
    expect(rootGate).toContain("setLocale(clamped)");
    expect(rootGate).not.toContain("markChosen");
  });

  it("only the picker sets the flag", () => {
    // Named here so a future caller has to change this list and read the
    // sentence above it.
    expect(code("features/boot/LanguageChoiceScreen.tsx")).toContain("markChosen()");
  });
});
