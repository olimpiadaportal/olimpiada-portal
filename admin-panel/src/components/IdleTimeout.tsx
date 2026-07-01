"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut } from "@/app/login/actions";

// Auto sign-out after 30 minutes of no user activity. Mounted once inside the
// protected layout. Purely client-side: any tracked activity resets the timer;
// on timeout we call the server signOut action (clears the Supabase session
// cookie server-side and redirects to /login). SSR-safe — all window/document
// access is inside effects that only run in the browser.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "click",
  "scroll",
  "touchstart",
  "wheel",
] as const;

export function IdleTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const handleTimeout = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    // Server action: signs out of Supabase and redirects to /login.
    void signOut();
  }, []);

  const reset = useCallback(() => {
    if (firedRef.current) return;
    if (typeof window === "undefined") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
  }, [handleTimeout]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Activity in any tab also counts when the tab becomes visible again.
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, reset, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibility);

    reset(); // start the initial timer

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reset]);

  return null;
}
