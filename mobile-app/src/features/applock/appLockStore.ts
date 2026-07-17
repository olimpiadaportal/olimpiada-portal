// Opt-in biometric app-lock flag + lock state (master plan §13). Same
// SecureStore pattern as olympiq.seenWelcome: hydrated during boot; the flag
// is a DEVICE preference (survives logout), the `locked` runtime state is not.
// Toggling the flag itself requires a successful biometric prompt in the UI.
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const STORE_KEY = "olympiq.appLock";

type AppLockState = {
  /** Owner opted in on this device. */
  enabled: boolean;
  hydrated: boolean;
  /** Overlay is up right now (cold start / long background). */
  locked: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (v: boolean) => void;
  setLocked: (v: boolean) => void;
};

export const useAppLockStore = create<AppLockState>((set) => ({
  enabled: false,
  hydrated: false,
  locked: false,
  hydrate: async () => {
    try {
      const v = await SecureStore.getItemAsync(STORE_KEY);
      set({ enabled: v === "1", hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setEnabled: (v) => {
    // Turning the lock off also drops an active overlay.
    set(v ? { enabled: true } : { enabled: false, locked: false });
    SecureStore.setItemAsync(STORE_KEY, v ? "1" : "0").catch(() => {});
  },
  setLocked: (v) => set({ locked: v }),
}));
