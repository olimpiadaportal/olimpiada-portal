/**
 * Give the iOS permission strings a DEFAULT-locale entry on Android, so the
 * release build's `lintVitalRelease` stops failing.
 *
 * THE FAILURE THIS FIXES, verbatim from EAS:
 *
 *   Execution failed for task ':app:lintVitalRelease'.
 *   > Lint found fatal errors while assembling a release target.
 *     values-b+az/strings.xml:2: Error: "NSPhotoLibraryUsageDescription" is
 *     translated here but not found in default locale [ExtraTranslation]
 *   Lint found 9 errors.
 *
 * Nine errors = 3 locales (az/en/ru) x 3 keys (photo library, camera, Face ID).
 *
 * WHY IT HAPPENS. `expo.locales` in app.json points at ./locales/{az,en,ru}.json,
 * and those files contain ONLY iOS permission-prompt keys. That config field is
 * not iOS-scoped — there is no `ios.locales` in the Expo schema (checked in
 * @expo/config-types) — so Expo copies every key into Android's localized
 * res/values-b+<locale>/strings.xml as well. Nothing writes them into the
 * DEFAULT res/values/strings.xml, because they mean nothing on Android. Lint
 * sees a string that is translated in three locales but absent from the
 * default, calls it ExtraTranslation, and that check is FATAL for a release
 * build.
 *
 * WHY IT SURFACED ONLY NOW. The localized permission prompts were added in
 * 1.12.3, during the Apple review round, and 1.12.3 was only ever built for
 * iOS. The last Android build was 1.12.0. This is simply the first Android
 * release build to see them.
 *
 * WHY THIS APPROACH RATHER THAN SILENCING THE CHECK. The obvious alternative is
 * `lint { disable 'ExtraTranslation' }` in build.gradle. That would work, and it
 * would also switch off a genuinely useful check — the one that catches a real
 * stale or misspelled translation — for the whole app, forever, to work around
 * three strings. Adding the default entry answers lint's actual complaint
 * instead: the key now exists in the default locale, so it is no longer an
 * "extra" translation, and the check stays fatal for the defects it was written
 * to catch.
 *
 * The values are inert on Android — no Android code reads an NS*UsageDescription,
 * and Android's own permission prompts are system-generated. Only their presence
 * matters. They cost a few hundred bytes and keep the resource set internally
 * consistent, which is what lint is really asking for.
 *
 * `translatable` is deliberately NOT set to false: these keys genuinely DO have
 * translations in values-b+az / values-b+en / values-b+ru, and marking them
 * untranslatable would trade this error for lint's mirror-image complaint.
 */
const path = require("path");
const { withStringsXml, AndroidConfig } = require("@expo/config-plugins");

/** The English text is the fallback for any locale Android does not match. It
 *  is never displayed — see the header — so the choice is about consistency,
 *  not about what a user reads. */
const BASE_LOCALE = path.join(__dirname, "..", "locales", "en.json");

module.exports = function withIosPermissionStringDefaults(config) {
  return withStringsXml(config, (cfg) => {
    // Read at build time rather than hardcoding, so editing locales/en.json
    // cannot silently drift from what lands in the default resources.
    const base = require(BASE_LOCALE);

    for (const [key, value] of Object.entries(base)) {
      if (typeof value !== "string" || !value.trim()) continue;
      cfg.modResults = AndroidConfig.Strings.setStringItem(
        [{ $: { name: key }, _: value }],
        cfg.modResults,
      );
    }
    return cfg;
  });
};
