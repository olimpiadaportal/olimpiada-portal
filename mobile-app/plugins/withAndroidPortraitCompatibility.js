/**
 * Preserve the app's portrait-only contract on Android 16 large screens.
 *
 * Android 16 ignores both android:screenOrientation and the runtime
 * setRequestedOrientation() call on displays whose smallest width is at least
 * 600dp. API 36 provides one temporary compatibility opt-out for apps that are
 * not yet landscape-ready: PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY.
 * Expo has no app.json field for that property, so this local config plugin
 * writes it at the application level during prebuild.
 *
 * Android removes the opt-out for apps targeting API 37. Until this product is
 * redesigned for landscape, the release checklist must re-evaluate the lock
 * before any target-SDK 37 upgrade.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const PROPERTY = "android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY";

module.exports = function withAndroidPortraitCompatibility(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;

    const properties = application.property ?? [];
    const existing = properties.find((entry) => entry.$?.["android:name"] === PROPERTY);
    if (existing) {
      existing.$["android:value"] = "true";
    } else {
      properties.push({
        $: {
          "android:name": PROPERTY,
          "android:value": "true",
        },
      });
    }
    application.property = properties;
    return cfg;
  });
};
