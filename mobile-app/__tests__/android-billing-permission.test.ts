// THE ANDROID BINARY DECLARES THE PLAY BILLING PERMISSION — ON PURPOSE.
//
// HISTORY. Until 2026-10-10 this file was android-billing-permission-blocked
// and asserted the OPPOSITE: `expo.android.blockedPermissions` listed
// `com.android.vending.BILLING`, because Android was purchase-silent and the
// reviewer note told Google "This Android app contains no purchase
// functionality of any kind" — a manifest declaring Play Billing would have
// contradicted that on a release already rejected once (Metadata policy,
// 2026-09-22).
//
// OWNER DECISION 2026-10-10: ANDROID SELLS through Google Play Billing, exactly
// like the approved iOS StoreKit rail (src/features/iap; platform.ts makes the
// rail a build-time constant on both stores). Play Billing REQUIRES this
// permission in the merged manifest — without it BillingClient cannot connect
// and every purchase fails with BILLING_UNAVAILABLE. expo-iap supplies it twice
// over: its library manifest
// (node_modules/expo-iap/android/src/main/AndroidManifest.xml) and its config
// plugin (plugin/src/withIAP.ts adds it unless Fire OS is enabled). The block
// in app.json would have stripped both (`tools:node="remove"`), so it is gone.
//
// THIS IS NATIVE CONFIG: it ships only in a NEW BUILD (1.17.0), never over the
// air — the runtimeVersion policy is appVersion, so the bump already forecloses
// OTA. The reviewer note claiming "no purchase functionality" must be retired
// in the same release, and Play's Data safety form must declare purchase
// history BEFORE that build is submitted.
//
// IF THIS TEST FAILS because someone re-added the block: Android purchases will
// all fail on device. Either remove the block, or — if the owner has reversed
// the decision — remove the Android rail in features/iap/platform.ts in the
// SAME change and rewrite this file again. Never one without the other.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_JSON = resolve(__dirname, "..", "app.json");
const BILLING = "com.android.vending.BILLING";

type AppConfig = {
  expo: {
    version?: string;
    android?: { permissions?: string[]; blockedPermissions?: string[] };
    ios?: Record<string, unknown> & { bundleIdentifier?: string };
    plugins?: unknown[];
  };
};

function readConfig(): AppConfig {
  return JSON.parse(readFileSync(APP_JSON, "utf8")) as AppConfig;
}

describe("app.json lets Play Billing into the Android manifest", () => {
  it("does NOT block com.android.vending.BILLING any more", () => {
    const blocked = readConfig().expo.android?.blockedPermissions ?? [];
    expect(blocked).not.toContain(BILLING);
    // Nor any spelling of it: a dotless "BILLING" would be rewritten to
    // android.permission.BILLING and block nothing, but a variant of the real
    // name would still strip it.
    expect(blocked.some((n) => n.toLowerCase().includes("billing"))).toBe(false);
  });

  it("keeps the expo-iap plugin, which adds the permission at prebuild", () => {
    const plugins = readConfig().expo.plugins ?? [];
    // A bare "expo-iap" entry: no { isFireOsEnabled: true } option, which is
    // the one configuration in which withIAP.ts REMOVES the permission.
    expect(plugins).toContain("expo-iap");
    const configured = plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-iap",
    ) as [string, Record<string, unknown>] | undefined;
    expect(configured?.[1]?.isFireOsEnabled).toBeUndefined();
  });

  it("relies on expo-iap really declaring it", () => {
    // If expo-iap ever stops shipping this manifest line, re-verify with
    // `npx expo prebuild -p android` and check the merged manifest before
    // trusting a build to sell.
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

  it("does not request it by hand either", () => {
    // The library and the plugin own this permission. Listing it in
    // android.permissions as well would be a second, redundant source that
    // outlives the library if it is ever removed.
    const requested = readConfig().expo.android?.permissions ?? [];
    expect(requested).not.toContain(BILLING);
  });

  it("ships in a version newer than the purchase-silent 1.16.x line", () => {
    // The unblock is native config. A build still on 1.16.x would be the same
    // runtime version as the purchase-silent binaries, which invites an OTA
    // update to carry Android purchase code onto a binary without the
    // permission (and without the Data safety declaration).
    const [major, minor] = (readConfig().expo.version ?? "0.0.0").split(".").map(Number);
    expect(major > 1 || (major === 1 && minor >= 17)).toBe(true);
  });

  it("leaves iOS completely alone", () => {
    // iOS StoreKit is live and approved (1.15.0, 2026-09-09); nothing in this
    // change touches its config.
    const expo = readConfig().expo;
    expect(expo.ios).toBeDefined();
    expect(expo.ios).not.toHaveProperty("blockedPermissions");
    expect(expo.ios?.bundleIdentifier).toBe("ai.olympiq.app");
  });
});
