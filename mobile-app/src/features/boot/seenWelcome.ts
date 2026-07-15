// "Welcome shown once per install" flag (plan §3). Same SecureStore pattern as
// olympiq.theme / olympiq.locale: hydrated during boot (RootGate holds the
// splash until this resolves), set the moment the user leaves the onboarding
// via ANY path (skip, CTA, slide-complete). Signed-out routing then goes
// straight to /(public)/login — the onboarding never auto-shows again.
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const STORE_KEY = "olympiq.seenWelcome";

type SeenWelcomeState = {
  seen: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSeen: () => void;
};

export const useSeenWelcome = create<SeenWelcomeState>((set, get) => ({
  seen: false,
  hydrated: false,
  hydrate: async () => {
    try {
      const v = await SecureStore.getItemAsync(STORE_KEY);
      set({ seen: v === "1", hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  markSeen: () => {
    if (!get().seen) {
      set({ seen: true });
      SecureStore.setItemAsync(STORE_KEY, "1").catch(() => {});
    }
  },
}));
