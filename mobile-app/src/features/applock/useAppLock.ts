// App-lock lifecycle, mounted once from RootGate. Locks a RESTORED session at
// cold start and any session backgrounded past the grace window (pure timing
// rules in lockLogic.ts). A fresh interactive login is itself the identity
// proof — only the first auth settle after process start can cold-start-lock.
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuthStore } from "@/features/auth/authStore";
import { useAppLockStore } from "./appLockStore";
import { shouldLock } from "./lockLogic";

export function useAppLock(): void {
  const status = useAuthStore((s) => s.status);
  const hydrated = useAppLockStore((s) => s.hydrated);
  const enabled = useAppLockStore((s) => s.enabled);

  // Cold start: evaluated exactly once, at the first settle of BOTH the
  // SecureStore flag and the session restore.
  const coldStartChecked = useRef(false);
  useEffect(() => {
    if (!hydrated || status === "restoring" || coldStartChecked.current) return;
    coldStartChecked.current = true;
    if (
      shouldLock({
        enabled,
        signedIn: status === "signedIn",
        coldStart: true,
        backgroundedAt: null,
        now: Date.now(),
      })
    ) {
      useAppLockStore.getState().setLocked(true);
    }
  }, [hydrated, status, enabled]);

  // Sign-out clears the lock so the next login never opens onto the overlay.
  useEffect(() => {
    if (status === "signedOut") useAppLockStore.getState().setLocked(false);
  }, [status]);

  // Timestamp on "background", decide on "active" (state read fresh from the
  // stores — the listener closure outlives login/logout and toggles).
  useEffect(() => {
    let backgroundedAt: number | null = null;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt = Date.now();
      } else if (state === "active") {
        const lock = useAppLockStore.getState();
        const auth = useAuthStore.getState();
        if (
          shouldLock({
            enabled: lock.enabled,
            signedIn: auth.status === "signedIn",
            coldStart: false,
            backgroundedAt,
            now: Date.now(),
          })
        ) {
          lock.setLocked(true);
        }
        backgroundedAt = null;
      }
    });
    return () => sub.remove();
  }, []);
}
