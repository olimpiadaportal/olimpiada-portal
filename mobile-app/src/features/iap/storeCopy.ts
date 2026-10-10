// WHICH SENTENCE NAMES WHICH STORE. Pure: no react, no react-native.
//
// The rail's copy was written for iOS and a handful of its sentences name the
// App Store or an Apple ID by name. On Android (owner decision 2026-10-10) the
// same sentence must name Google Play instead — telling an Android parent to
// "check the App Store" is wrong and, to a Play reviewer, reads as a copy-paste
// port. Each such key has a `mob.iap.play.*` twin in all three languages; every
// other key is store-neutral and used as-is on both platforms.
//
// The mapping is by KEY, never by rewriting text: a translated sentence is a
// sentence somebody wrote on purpose, in each language.
import type { IapStoreName } from "./platform";

/** Store-specific twins. Keys absent here are the same on both stores. */
const GOOGLE_TWINS: Record<string, string> = {
  "mob.iap.title": "mob.iap.play.title",
  "mob.iap.intro": "mob.iap.play.intro",
  "mob.iap.loading": "mob.iap.play.loading",
  // iOS: Ask-to-Buy waiting on the family organiser. Android: a payment method
  // Google has not confirmed yet. Same outcome, different reason.
  "mob.iap.deferred": "mob.iap.play.deferred",
  "mob.iap.err.unavailable": "mob.iap.play.err.unavailable",
  "mob.iap.err.notAllowed": "mob.iap.play.err.notAllowed",
  "mob.iap.restoreNothing": "mob.iap.play.restoreNothing",
  // A SERVER key whose shared wording names the App Store.
  "iap.err.notVerified": "mob.iap.play.err.notVerified",
};

/** The i18n key to render for `key` on `store`. Unknown keys pass through. */
export function storeCopyKey(key: string, store: IapStoreName | null): string {
  if (store === "google") return GOOGLE_TWINS[key] ?? key;
  return key;
}

/** Every Google twin key — exported for the copy tests. */
export const GOOGLE_COPY_KEYS: readonly string[] = Object.values(GOOGLE_TWINS);
