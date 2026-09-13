// "The user has chosen a language" flag — the whole state behind the
// FIRST-LAUNCH LANGUAGE PICKER (owner request: the first screen of a fresh
// install is a language choice, and every onboarding/registration screen after
// it is already in that language).
//
// WHY IT IS ITS OWN KEY, AND NOT `olympiq.locale`'s PRESENCE. RootGate clamps
// the hydrated locale to the admin-enabled set and calls setLocale() ITSELF
// when it is outside that set, which writes `olympiq.locale` before the user
// has seen a single screen. On a device whose language the admin has not
// enabled, the key would therefore already exist on first launch and the
// picker would never appear. Presence cannot mean "chosen"; only a flag set by
// the picker can.
//
// AND WHY IT IS NOT FOLDED INTO `olympiq.seenWelcome`. Two independent flags is
// exactly what "picked a language, then killed the app" needs:
//
//   chosen, welcome unset  -> skip the picker, still show the carousel
//   chosen unset, welcome  -> cannot happen through this flow; degrades to
//                             asking once, and nothing else moves
//   both set               -> straight to Login, today's behaviour unchanged
//
// Same SecureStore shape as seenWelcome.ts (and olympiq.theme / olympiq.appLock):
// hydrated during boot behind the splash, written fire-and-forget, and a
// SecureStore failure reads as "not chosen" — the app asks again rather than
// locking someone into a language they never picked. That is the safe
// direction, and it is the direction the sibling flags already fail in.
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { isLocale, locales, type Locale } from "@/i18n";

/** Exported so the tests can pin it as DISTINCT from olympiq.seenWelcome. */
export const LOCALE_CHOSEN_KEY = "olympiq.localeChosen";

type LocaleChoiceState = {
  chosen: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Set ONLY by the picker screen. Never by setLocale(): the clamp effect in
   *  RootGate calls that too, and it would mark a choice nobody made. */
  markChosen: () => void;
};

export const useLocaleChoice = create<LocaleChoiceState>((set, get) => ({
  chosen: false,
  hydrated: false,
  hydrate: async () => {
    try {
      const v = await SecureStore.getItemAsync(LOCALE_CHOSEN_KEY);
      set({ chosen: v === "1", hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  markChosen: () => {
    if (!get().chosen) {
      set({ chosen: true });
      SecureStore.setItemAsync(LOCALE_CHOSEN_KEY, "1").catch(() => {});
    }
  },
}));

/**
 * The languages the picker offers: the ADMIN-ENABLED set, in the admin's order.
 *
 * It has to be that set and not the compiled `locales`, because RootGate clamps
 * the persisted locale to it — offering a language the admin has disabled would
 * hand the user a choice that snaps back to something else a frame later.
 * An empty/garbage config degrades to all three rather than to nothing: a
 * picker with no rows is worse than one that offers a language the clamp will
 * tidy up.
 */
export function localeChoiceOptions(supported: readonly string[] | null | undefined): Locale[] {
  const sup = (supported ?? []).filter(isLocale);
  return sup.length > 0 ? sup : [...locales];
}

/**
 * Does the boot sequence still owe the user a language screen?
 *
 * Pure so it can be tested at all — mobile jest has no renderer harness, so a
 * rule embedded in the gate's JSX is untestable by construction.
 *
 *  * `hydrated` false means the flag has not been read yet. RootGate holds the
 *    splash until it has, so this is belt-and-braces: answering "yes" early
 *    would flash the picker for one frame on EVERY launch, including the
 *    thousandth.
 *  * `optionCount < 2` is not a choice. A single admin-enabled language leaves
 *    nothing to pick, and a screen whose only control confirms the only option
 *    is a speed bump on every fresh install. (LocaleSwitcher hides itself on
 *    the same test.)
 */
export function shouldAskForLanguage(input: {
  hydrated: boolean;
  chosen: boolean;
  optionCount: number;
}): boolean {
  if (!input.hydrated) return false;
  if (input.chosen) return false;
  return input.optionCount >= 2;
}
