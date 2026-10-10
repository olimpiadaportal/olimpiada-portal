// THE ANDROID BINARY MUST NOT DECLARE THE PLAY BILLING PERMISSION.
//
// WHY THIS EXISTS. `expo-iap` ships its own library manifest
// (node_modules/expo-iap/android/src/main/AndroidManifest.xml) whose single line
// is `<uses-permission android:name="com.android.vending.BILLING"/>`. Android's
// manifest merger folds every library manifest into the app's, so that
// permission lands in the merged manifest of our Android build even though this
// app never calls StoreKit's Android twin: `src/features/iap/platform.ts` pins
// IAP_PLATFORM_SUPPORTED to `Platform.OS === "ios"` and every entry point in
// `src/features/iap/store.ts` refuses to run without it.
//
// `com.android.vending.BILLING` is the signal Google uses to treat an app as
// billing-capable, and the reviewer note this repo tells the owner to paste says
// "This Android app contains no purchase functionality of any kind."
// A reviewer who opens the manifest sees those two statements contradict each
// other — on a release that was ALREADY rejected once (Metadata policy,
// 2026-09-22). Android is purchase-silent by architecture
// (docs/STORE_PAYMENTS_COMPLIANCE.md), so the manifest has to say so too.
//
// HOW IT IS BLOCKED. `expo.android.blockedPermissions` in app.json. At prebuild,
// @expo/prebuild-config runs AndroidConfig.Permissions.withInternalBlockedPermissions,
// which adds `xmlns:tools` and rewrites the entry as
// `<uses-permission android:name="com.android.vending.BILLING" tools:node="remove"/>`
// so the merger drops it. The name is written FULLY QUALIFIED on purpose:
// prefixAndroidPermissionsIfNecessary() only prepends `android.permission.` to
// names that contain no dot, so a dotted name passes through verbatim. (The
// uppercasing done by ensurePermissionNameFormat() is not on the blocked path.)
//
// THIS IS NATIVE CONFIG, so it needs a rebuild — it cannot ride an OTA update.
//
// IF THIS TEST FAILS: someone removed the entry from app.json. Do not delete the
// test; put the entry back. Removing it silently re-declares Play Billing in a
// binary that sells nothing.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_JSON = resolve(__dirname, "..", "app.json");
const BILLING = "com.android.vending.BILLING";

type AppConfig = {
  expo: {
    android?: { permissions?: string[]; blockedPermissions?: string[] };
    ios?: Record<string, unknown> & { bundleIdentifier?: string };
    plugins?: unknown[];
  };
};

function readConfig(): AppConfig {
  return JSON.parse(readFileSync(APP_JSON, "utf8")) as AppConfig;
}

describe("app.json blocks the Play Billing permission on Android", () => {
  it("lists com.android.vending.BILLING in android.blockedPermissions", () => {
    const blocked = readConfig().expo.android?.blockedPermissions ?? [];
    expect(blocked).toContain(BILLING);
  });

  it("spells it fully qualified, so the Expo plugin does not rewrite it", () => {
    // prefixAndroidPermissionsIfNecessary() turns a dotless name like
    // "USE_BIOMETRIC" into "android.permission.USE_BIOMETRIC". A name written
    // as "BILLING" or "vending.BILLING" would therefore block a permission that
    // does not exist, and the real one would still merge in.
    const blocked = readConfig().expo.android?.blockedPermissions ?? [];
    for (const name of blocked) {
      expect(name.includes(".")).toBe(true);
    }
    expect(blocked.some((n) => n.toLowerCase().includes("billing") && n !== BILLING)).toBe(false);
  });

  it("never REQUESTS the permission it blocks", () => {
    // withBlockedPermissions() strips a blocked name out of android.permissions
    // anyway, so having it in both places would not break the build — it would
    // just be a contradictory statement of intent sitting in the config.
    const requested = readConfig().expo.android?.permissions ?? [];
    expect(requested).not.toContain(BILLING);
  });

  it("is justified: expo-iap really does declare the permission", () => {
    // The whole point of the block. If expo-iap ever stops shipping this
    // manifest, re-verify with `npx expo prebuild -p android` and check
    // android/app/build/intermediates/merged_manifest/ before relaxing anything.
    const libManifest = resolve(
      __dirname,
      "..",
      "node_modules",
      "expo-iap",
      "android",
      "src",
      "main",
      "AndroidManifest.xml",
    );
    expect(existsSync(libManifest)).toBe(true);
    expect(readFileSync(libManifest, "utf8")).toContain(BILLING);
  });

  it("leaves iOS completely alone", () => {
    // blockedPermissions is an ANDROID-only Expo config field:
    // withInternalBlockedPermissions() reads config.android.blockedPermissions
    // and applies withAndroidManifest() only. iOS StoreKit is live and approved
    // (1.15.0, 2026-09-09) and nothing here may touch it.
    const expo = readConfig().expo;
    expect(expo.ios).toBeDefined();
    expect(expo.ios).not.toHaveProperty("blockedPermissions");
    expect(expo.ios?.bundleIdentifier).toBe("ai.olympiq.app");
    // The IAP plugin itself stays installed — iOS needs it.
    expect(expo.plugins).toContain("expo-iap");
  });
});
