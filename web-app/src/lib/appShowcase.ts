// The landing-page mobile-app showcase: store links and the screenshots the
// phone mockup rotates through.
//
// This file is the ONE place to edit when the app's store presence changes.
// It is deliberately plain data, so the future admin panel can replace it with
// a settings row without touching the components that read it.

/** The live App Store listing (bundle ai.olympiq.app, ascAppId 6798527831). */
export const APP_STORE_URL = "https://apps.apple.com/az/app/olympiq-school-olympiad/id6798527831";

/**
 * The Google Play listing (package ai.olympiq.app). Live since Google approved
 * the production release on 2026-10-06.
 *
 * Set to null to fall back to the "Android is next" status line and hide the
 * Play button — do that if the listing is ever unpublished, because a download
 * button that leads nowhere is worse than no button.
 */
export const PLAY_STORE_URL: string | null =
  "https://play.google.com/store/apps/details?id=ai.olympiq.app";

export type AppScreen = {
  /** Served from /public. Local on purpose — never a hotlinked store CDN URL,
   *  which can change or disappear without notice. */
  src: string;
  /** Intrinsic pixel size, so the image reserves its box and never shifts
   *  layout while it loads. */
  width: number;
  height: number;
  /** i18n key for the screen-reader description of the screenshot. */
  altKey: string;
  /** The screenshot's own top-row colour. The store captures carry no status
   *  bar, so the mockup draws one ABOVE the image in this colour — sampled from
   *  the file, so the join is invisible. Re-sample it for any new screen. */
  topColor: string;
};

/**
 * The official iPhone screenshots from the App Store listing (1242x2688
 * originals), re-encoded as 600px-wide WebP for the web — 20–35 KB each.
 *
 * To add a screen: drop a 600x1299 WebP into /public/app-screens/, add a line
 * here (with its sampled top colour) and an `appHero.screen.<name>` alt text
 * in all three locales.
 *
 * Deliberately NOT included from that listing: the news screen (it carries a
 * photograph of real children at an awards ceremony), the result screen (it
 * shows a 0% score), and the olympiad and leaderboard screens (placeholder
 * package names and blurred rows). A landing page carries none of those.
 */
export const APP_SCREENS: readonly AppScreen[] = [
  { src: "/app-screens/home.webp", width: 600, height: 1299, altKey: "appHero.screen.home", topColor: "#151d31" },
  { src: "/app-screens/tests.webp", width: 600, height: 1299, altKey: "appHero.screen.tests", topColor: "#151d31" },
  { src: "/app-screens/question.webp", width: 600, height: 1299, altKey: "appHero.screen.question", topColor: "#090e1a" },
];

/** How long each screenshot stays up before the carousel advances. */
export const SCREEN_INTERVAL_MS = 4500;
