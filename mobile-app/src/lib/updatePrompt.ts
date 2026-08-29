// "Skip this version" memory for the OPTIONAL (non-blocking) update prompt.
//
// Same SecureStore + zustand shape as features/boot/seenWelcome.ts, with one
// deliberate difference: this stores the DISMISSED VERSION STRING, not a
// boolean. A boolean would silence the prompt forever after the first "Later" —
// skipping 1.14.0 must not hide 1.15.0.
//
// Everything here fails toward NOT PROMPTING. A prompt that appears because a
// config fetch blipped, or because a stored value is garbage, turns a server
// hiccup into a support call; a prompt that is missed for one session costs
// nothing (the app is, by definition, still usable — that is what makes this
// gate optional).
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
// Read-only use of the shared, unit-tested comparator: 1.2.0 < 1.10.0.
import { compareSemver } from "@/lib/mobileConfig";

export const UPDATE_PROMPT_KEY = "olympiq.updateDismissed";

/**
 * `major.minor[.patch]`, digits only.
 *
 * Anything else — "", "true", a JSON blob, a pre-release tag, a truncated
 * write — is NOT a version we can compare, so it is treated as absent. On the
 * stored side that means "not dismissed" (the prompt may show); on the server
 * side it means "no usable latest" (the prompt does not show). Both directions
 * are the safe one for their input.
 */
const VERSION_RE = /^\d{1,6}(?:\.\d{1,6}){1,2}$/;

/** A comparable version string, or null when the input cannot be trusted. */
export function normalizeVersion(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  // Length cap first: the regex is bounded, but a multi-megabyte SecureStore
  // value should never reach it.
  if (v.length === 0 || v.length > 32) return null;
  return VERSION_RE.test(v) ? v : null;
}

export type OptionalUpdateInput = {
  /** False until SecureStore has been read — never prompt before we know. */
  hydrated: boolean;
  /** The hard gate's verdict. When it is true the blocking screen owns the UI. */
  forceUpdate: boolean;
  /** evaluateVersionGate(): app version is below the platform's latest_version. */
  updateAvailable: boolean;
  /** The platform's admin-configured latest_version. */
  latestVersion: string;
  /** The platform's admin-configured store URL. */
  storeUrl: string;
  /** Last version the user tapped "Later" on, from this store. */
  dismissedVersion: string | null;
};

/**
 * The whole decision, as one pure function so it can be tested without a
 * renderer (jest here runs `__tests__/**\/*.test.ts` — no JSX).
 */
export function shouldPromptOptionalUpdate(input: OptionalUpdateInput): boolean {
  if (!input.hydrated) return false;
  // Defence in depth. RootGate returns the blocking ForceUpdateScreen before it
  // ever gets here, but the two gates must not be able to disagree if that
  // ordering is ever edited: a dismissible "Later" button next to a mandatory
  // update is a way around the hard gate.
  if (input.forceUpdate) return false;
  if (!input.updateAvailable) return false;

  const latest = normalizeVersion(input.latestVersion);
  if (!latest) return false;

  // No destination, no prompt. The DB allows an empty store_url (and the seeded
  // rows still carry one), and a card whose only action cannot open anything is
  // worse than no card.
  if (!input.storeUrl.startsWith("https://")) return false;

  const dismissed = normalizeVersion(input.dismissedVersion);
  // Silenced only up to the version that was actually skipped — a NEWER
  // latest_version prompts again.
  if (dismissed && compareSemver(latest, dismissed) <= 0) return false;

  return true;
}

type UpdatePromptState = {
  dismissedVersion: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  dismiss: (version: string) => void;
};

export const useUpdatePrompt = create<UpdatePromptState>((set) => ({
  dismissedVersion: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const v = await SecureStore.getItemAsync(UPDATE_PROMPT_KEY);
      set({ dismissedVersion: normalizeVersion(v), hydrated: true });
    } catch {
      // Keychain/Keystore unavailable: behave exactly like "never dismissed".
      set({ dismissedVersion: null, hydrated: true });
    }
  },
  dismiss: (version: string) => {
    const v = normalizeVersion(version);
    // Unreachable while the overlay only renders for a usable version — and
    // deliberately a no-op rather than a write, because persisting an
    // uncomparable string would silence every future prompt.
    if (!v) return;
    set({ dismissedVersion: v });
    SecureStore.setItemAsync(UPDATE_PROMPT_KEY, v).catch(() => {});
  },
}));
