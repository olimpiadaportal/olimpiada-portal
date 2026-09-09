// PORTRAIT WHERE IT CAN STILL BE ENFORCED, AND A CONTENT COLUMN ON TABLETS.
//
// Pinned here because every mechanism that enforces orientation is one deletable
// line in app.json, and each fails SILENTLY on a device nobody here owns.
//
// WHAT ACTUALLY WRITES THE MANIFESTS — read out of node_modules, not assumed:
//
//   * The TOP-LEVEL `orientation` is the only key Expo reads, and it feeds BOTH
//     platforms. `@expo/config-plugins/build/android/Orientation.js` derives
//     `android:screenOrientation` from `config.orientation` alone; `ios/
//     Orientation.js` derives `UISupportedInterfaceOrientations` from the same
//     field. There is no per-platform orientation key — `screenOrientation` is
//     absent from `@expo/config-types`, so an `android.screenOrientation` entry
//     is dropped with no warning. One was added, and removed again; the second
//     test below is what stops it coming back looking like a lock.
//
//   * `ios.requireFullScreen` does two things and the SECOND is the load-bearing
//     one. It writes `UIRequiresFullScreen`, and it stops Expo overwriting
//     `UISupportedInterfaceOrientations~ipad` with all four orientations — which
//     `RequiresFullScreen.js` does whenever tablet support is on WITHOUT it, on
//     purpose, because iPad multitasking support is an App Store validation
//     requirement (ITMS-90474). So `supportsTablet: true` on its own does not
//     merely fail to lock an iPad; it actively declares every orientation.
//
// NEITHER IS PERMANENT. A passing test here is not a guarantee on a tablet:
//
//   * Apple deprecated `UIRequiresFullScreen` in iPadOS 26 — "deprecated and
//     will be ignored in a future release" — and it stops working "starting in
//     iOS 27 and iPadOS 27 ... when you build your app with the iOS 27 SDK or
//     later" (TN3192). Expo 54 builds against the iOS 26 SDK, so it still binds
//     today and stops the moment we take an SDK built on Xcode 27. Its
//     replacement, `prefersInterfaceOrientationLocked`, is one Apple says the
//     system "does not guarantee" it will honor.
//
//   * Android 16 ignores `screenOrientation` on displays sw600dp and wider for
//     apps targeting SDK 36, which Expo 54 does. An Android TABLET rotates and
//     no app.json key prevents it. A runtime lock is not the way out either:
//     Google's own table of ignored APIs lists `setRequestedOrientation()` —
//     the exact call `expo-screen-orientation` makes — beside the manifest
//     attribute, which is why that dependency was NOT added. The only supported
//     opt-out is the `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` manifest
//     property; it is an owner decision, and Google removes it at API 37.
//
// The gutter is pinned in the same file because it is the same class of thing:
// a phone layout on a 1024pt-wide window does not crash or clip, it just looks
// wrong, so nothing except a human with a tablet notices it going missing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const app = JSON.parse(readFileSync(resolve(ROOT, "app.json"), "utf8")).expo;

const read = (rel: string) => readFileSync(resolve(ROOT, "src", rel), "utf8");

/**
 * Source with comments removed.
 *
 * Needed because these files EXPLAIN what they deliberately do not do — the
 * gutter hook's own header says "keyed on WIDTH, not on `Platform.isPad`" — and
 * a bare substring check reads that sentence as the thing it forbids. A test
 * that a comment can satisfy is a test that cannot fail for the right reason,
 * and this file exists to catch a silent regression on a device nobody here has.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("orientation is declared through the keys Expo actually reads", () => {
  it("declares portrait once, at the top level, covering both platforms", () => {
    // This single field is what writes android:screenOrientation AND
    // UISupportedInterfaceOrientations. Losing it unlocks every phone.
    expect(app.orientation).toBe("portrait");
  });

  it("does not carry `android.screenOrientation`, which Expo never reads", () => {
    // Not a tidiness rule. The key is not in Expo's schema and no plugin looks
    // it up, so it reads to a human as an Android lock while doing nothing —
    // and it hid the fact that Android tablets have no app-side lock at all.
    expect(app.android).not.toHaveProperty("screenOrientation");
  });

  it("keeps the iPad opt-out, WITHOUT WHICH THE IPAD DECLARES ALL FOUR ORIENTATIONS", () => {
    // Deprecated on iPadOS 26 but still honored by an iOS 26 SDK build, and it
    // is also what suppresses Expo's forced ~ipad orientation list. Keep it
    // until the iOS 27 SDK, then migrate — do not simply drop it.
    expect(app.ios?.supportsTablet).toBe(true);
    expect(app.ios?.requireFullScreen).toBe(true);
  });

  it("never pairs tablet support with multitasking", () => {
    // Stated as the invariant as well as the fact, so that turning
    // supportsTablet back off is a clean edit: this stays true, and the
    // assertion above is the one to delete with it.
    if (app.ios?.supportsTablet === true) {
      expect(app.ios?.requireFullScreen).toBe(true);
    }
  });
});

describe("every screen gets a centred content column on a tablet", () => {
  // All three scroll bodies, because a screen reaches exactly one of them and a
  // gutter applied to two of three is a layout that changes shape as you
  // navigate.
  const BODIES = [
    "components/Screen.tsx",
    "features/parent/ui.tsx",
    "features/arena/ui.tsx",
  ];

  it.each(BODIES)("%s consumes the shared gutter", (file) => {
    const src = code(file);
    expect(src).toContain("useContentGutter");
    // Applied to the horizontal padding, not merely computed and dropped.
    expect(/padding(Horizontal|Left|Right)[^\n]*gutter/.test(src)).toBe(true);
  });

  it("computes the gutter from window WIDTH, not from a platform flag", () => {
    // Platform.isPad would give an iPad in a narrow Split View slot the tablet
    // layout it does not have room for, and would give a large Android tablet
    // the phone one. Width is what the layout actually depends on — and on
    // Android a tablet CAN be landscape, so width is the only honest input.
    const src = code("lib/useContentWidth.ts");
    expect(src).toContain("useWindowDimensions");
    expect(src).not.toContain("Platform.isPad");
    expect(src).not.toContain("Platform.OS");
  });

  it("is exactly 0 on a phone-width window, so phones cannot regress", () => {
    const src = code("lib/useContentWidth.ts");
    // The early return is the whole safety argument for touching three shared
    // containers at once: below the cap the branch cannot alter a phone layout.
    expect(src).toContain("width <= MAX_CONTENT_WIDTH) return 0");
  });
});
