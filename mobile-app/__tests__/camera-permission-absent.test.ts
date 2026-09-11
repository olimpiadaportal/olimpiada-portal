// THE APP DECLARES NO CAMERA PERMISSION, BECAUSE IT HAS NO CAMERA CODE.
//
// This pins a claim the privacy policy makes in all three languages. The
// `privacy.s12.never` string tells parents "the app never opens the camera and
// has no way to take a photo at all", and `privacy.s1.dont` repeats it shorter.
// Until 1.16.0 that sentence sat beside an `NSCameraUsageDescription` in
// app.json and an `android.permission.CAMERA` in the merged Android manifest —
// a homework app for children advertising a camera purpose it never used. A
// reviewer comparing the policy against the manifest sees the app claiming a
// capability it denies having, and the policy is the thing that looks false.
// The fix was to delete the declaration, not to weaken the sentence.
//
// WHAT ACTUALLY PUT THE PERMISSION THERE — read out of node_modules, not assumed:
//
//   * iOS: HAND-WRITTEN. `ios.infoPlist.NSCameraUsageDescription` was typed into
//     app.json, plus a localized copy in each of locales/{az,en,ru}.json, which
//     `expo.locales` turns into InfoPlist.strings. Nothing generated it — and
//     note that the localized copies matter twice, because
//     ./plugins/withIosPermissionStringDefaults reads locales/en.json and copies
//     EVERY key into Android's res/values/strings.xml. Removing the key from
//     app.json alone would have left it greppable in three other files and
//     inside the Android binary.
//
//   * Android: MANIFEST MERGE, not a config plugin. expo-image-picker's own
//     android/src/main/AndroidManifest.xml declares CAMERA (and the two storage
//     permissions), and autolinking merges it into ours. expo-image-picker's
//     config plugin is NOT auto-applied — its expo-module.config.json has no
//     `plugin` field — so the only way to suppress it is to list the plugin
//     explicitly and pass `cameraPermission: false`, which routes through
//     AndroidConfig.Permissions.withBlockedPermissions.
//
// WHY `microphonePermission: false` IS NOT OPTIONAL. Adding the plugin at all is
// what makes it necessary: withImagePicker seeds NSMicrophoneUsageDescription
// and, when the option is anything other than the literal `false`, calls
// withPermissions(['android.permission.RECORD_AUDIO']). Listing the plugin to
// remove one unused permission would therefore have ADDED two others. Both
// options are load-bearing; neither is tidiness.
//
// VERIFIED AGAINST THE EFFECTIVE MANIFESTS, not just the source. `npx expo
// config --type introspect` after this change reports the Info.plist carrying
// only NSPhotoLibraryUsageDescription and NSFaceIDUsageDescription, and the
// Android manifest carrying `android.permission.CAMERA` and
// `android.permission.RECORD_AUDIO` with `tools:node="remove"` — which strips
// them from the merged APK. That command is far too slow for a unit test, so
// what is asserted below are the INPUTS that produce that output.
//
// TWO THINGS THIS DELIBERATELY DOES NOT ASSERT:
//
//   * READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE SURVIVE. They come from
//     the same expo-image-picker manifest and the plugin refuses to block them
//     on purpose ("unclear if we should ... they are used for many other
//     things" — its own comment). So the policy's honest note for Android is
//     now only half true: the picker still declares STORAGE permissions a
//     parent can see in the phone's App info screen, but no longer a camera
//     one. If that note is ever reworded, the camera clause is the stale half,
//     not the storage clause.
//
//   * THE ITMS-90683 RISK IS REAL AND ACCEPTED. expo-image-picker's compiled
//     iOS code references the camera regardless of what JS calls it — ios/
//     ImagePickerModule.swift sets `picker.sourceType = .camera` and ios/
//     ImagePickerPermissionRequesters.swift calls AVCaptureDevice.requestAccess
//     — so Apple's static analysis may email a "Missing Purpose String" warning
//     on upload. It is a warning, not a rejection, and `cameraPermission: false`
//     is Expo's own documented escape hatch for exactly this case. If a future
//     submission is ever actually BLOCKED by it, the rollback is to restore the
//     key in app.json AND all three locale files AND the camera clause of the
//     policy's Android note — never one without the others, which is the whole
//     reason this test names the policy string.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");

const app = JSON.parse(readFileSync(resolve(ROOT, "app.json"), "utf8")).expo;
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const ALL_FILES = walk(SRC);
const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");

/**
 * Source with comments removed.
 *
 * Needed because this file's own subject matter is discussed in prose all over
 * the codebase — the policy screen renders a sentence about the camera, and the
 * avatar pickers explain why they never open one. A bare substring check reads
 * those explanations as the thing they forbid.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const LOCALES = ["az", "en", "ru"] as const;
const localeKeys = (l: string) =>
  Object.keys(JSON.parse(readFileSync(resolve(ROOT, "locales", `${l}.json`), "utf8")));

describe("no camera API is reachable from the app", () => {
  // Every entry point that would make the permission legitimate. Named
  // individually rather than matching /camera/i, because the app renders a
  // lucide icon called `Camera` on the "choose a photo" button, and that is a
  // picture of a camera, not a use of one.
  const CAMERA_APIS: Array<[string, RegExp]> = [
    ["launchCameraAsync", /\blaunchCameraAsync\b/],
    ["requestCameraPermissionsAsync", /\brequestCameraPermissionsAsync\b/],
    ["getCameraPermissionsAsync", /\bgetCameraPermissionsAsync\b/],
    ["useCameraPermissions", /\buseCameraPermissions\b/],
    ["CameraView", /\bCameraView\b/],
    ["an expo-camera import", /["']expo-camera["']/],
  ];

  it.each(CAMERA_APIS)("never calls %s", (_name, pattern) => {
    const hits = ALL_FILES.filter((p) => pattern.test(codeOnly(readFileSync(p, "utf8"))));
    expect(hits.map(rel)).toEqual([]);
  });

  it("does not depend on expo-camera at all", () => {
    // A dependency alone would put camera symbols in the binary and make the
    // policy sentence arguable even with no call site of ours.
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("expo-camera");
  });

  it("uses expo-image-picker only in photo-library mode", () => {
    const importers = ALL_FILES.filter((p) =>
      /(from\s+["']expo-image-picker["']|require\(\s*["']expo-image-picker["']\s*\))/.test(
        codeOnly(readFileSync(p, "utf8")),
      ),
    );
    // If this ever hits zero the picker was removed, and the loop below would
    // pass vacuously while the whole file stopped meaning anything.
    expect(importers.length).toBeGreaterThan(0);
    for (const p of importers) {
      const src = codeOnly(readFileSync(p, "utf8"));
      // Paired with the path so a failure names the file that regressed.
      expect([rel(p), /\blaunchImageLibraryAsync\b/.test(src)]).toEqual([rel(p), true]);
    }
  });
});

describe("app.json declares the permissions the app uses, and no others", () => {
  const infoPlist = app.ios?.infoPlist ?? {};

  it("carries no NSCameraUsageDescription", () => {
    // The sentence in privacy.s12.never depends on this key's absence.
    expect(infoPlist).not.toHaveProperty("NSCameraUsageDescription");
  });

  it("carries no NSMicrophoneUsageDescription", () => {
    expect(infoPlist).not.toHaveProperty("NSMicrophoneUsageDescription");
  });

  it("still declares the photo library, which the app DOES use", () => {
    // The invariant runs both ways: declare what you use, and only that.
    // Deleting this one is the plausible over-correction from here, and it
    // would break avatar picking rather than any policy sentence.
    expect(typeof infoPlist.NSPhotoLibraryUsageDescription).toBe("string");
    expect(infoPlist.NSPhotoLibraryUsageDescription.length).toBeGreaterThan(0);
  });

  it("configures expo-image-picker to block the Android camera permission", () => {
    // This entry is the ONLY thing standing between the library's own
    // AndroidManifest and android.permission.CAMERA in the shipped APK.
    const entry = (app.plugins ?? []).find(
      (p: unknown) => Array.isArray(p) && p[0] === "expo-image-picker",
    );
    expect(entry).toBeDefined();
    const options = (entry as [string, Record<string, unknown>])[1];
    // Literal false, not merely falsy: withImagePicker compares with === false,
    // so 0, "" or null would silently re-enable both permissions.
    expect(options?.cameraPermission).toBe(false);
    expect(options?.microphonePermission).toBe(false);
  });
});

describe("the localized permission strings agree with app.json", () => {
  it.each(LOCALES)("locales/%s.json carries no camera string", (l) => {
    expect(localeKeys(l)).not.toContain("NSCameraUsageDescription");
  });

  it("declares the same keys in all three locales", () => {
    // withIosPermissionStringDefaults copies locales/en.json into Android's
    // DEFAULT strings.xml to answer lint's ExtraTranslation check. A key present
    // in az but not in en is translated-but-absent-from-default: a FATAL error
    // in lintVitalRelease, discovered only on an EAS Android build.
    const [az, en, ru] = LOCALES.map((l) => localeKeys(l).slice().sort());
    expect(az).toEqual(en);
    expect(ru).toEqual(en);
  });
});
