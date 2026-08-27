// Silent background refresh — the two signals that actually matter, wired to
// React Query.
//
// THE PROBLEM. `refetchOnWindowFocus` was false and nothing replaced it, so a
// screen showed whatever it fetched when it first mounted until the user pulled
// to refresh. In a tab navigator the tabs stay MOUNTED, so switching away and
// back does not remount and does not refetch either: a parent could sit on a
// stale child list for as long as the app stayed open.
//
// THE TWO SIGNALS, and why these two:
//
//   1. APP FOREGROUND (`AppState`). "Window focus" has no meaning on a phone;
//      React Query's `focusManager` is designed to be driven by the platform's
//      own signal instead, and on React Native that is AppState. This covers the
//      common case by a wide margin — the user leaves the app, something changes
//      server-side, they come back.
//
//   2. SCREEN FOCUS (`useFocusEffect`). Covers switching tabs, which AppState
//      cannot see because the app never backgrounded.
//
// WHAT THIS DELIBERATELY IS NOT. It is not polling and it is not a socket. A
// timer would burn battery and quota on screens nobody is looking at, and a
// realtime subscription per tab is a lot of moving parts for data that is not
// collaborative — nobody else is editing this parent's children while they
// watch. If a screen ever genuinely needs push (a live leaderboard during an
// event), that screen can subscribe on its own; this is the sane default for
// the other twenty.
//
// SILENT BY CONSTRUCTION. A background refetch keeps the previous data on
// screen and swaps it when the new response lands — `isRefetching` is separate
// from `isPending`, so nothing flashes a spinner or unmounts a list. Only add a
// visible indicator where the wait is long enough to need one.
//
// NetInfo (reconnect-triggered refetch, React Query's `onlineManager`) is the
// third signal and is NOT wired here: it needs a native module, which means a
// new build. Worth adding the next time the app is rebuilt anyway.
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { focusManager } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";

/**
 * Wire AppState to React Query's focus manager. Call ONCE, at the app root.
 *
 * Returns the unsubscribe so the root can clean up; in practice the root lives
 * for the whole session, but leaking a listener from a provider is the kind of
 * thing that only shows up under Fast Refresh, as duplicate refetches.
 */
export function installAppStateFocus(): () => void {
  const onChange = (status: AppStateStatus) => {
    // `focused` is what React Query keys `refetchOnWindowFocus` off. On web the
    // browser supplies it; here we do. Guarded on platform because on web the
    // built-in listener is already correct and doubling it causes two refetches.
    if (Platform.OS !== "web") {
      focusManager.setFocused(status === "active");
    }
  };
  const sub = AppState.addEventListener("change", onChange);
  return () => sub.remove();
}

/**
 * Refetch when the SCREEN regains focus — the tab-switch case.
 *
 * Skips the very first focus on purpose: the screen has just mounted and the
 * query is already loading, so refetching there would fire two identical
 * requests for every screen open.
 *
 * Pass the `refetch` from a `useQuery`, or a function that refetches several.
 * The callback is stored in a ref so a caller does not have to memoise it —
 * `useQuery` returns a stable `refetch`, but a hand-written arrow does not, and
 * an unstable dependency here means a refetch on every render.
 */
export function useRefreshOnFocus(refetch: () => unknown): void {
  const first = useRef(true);
  const saved = useRef(refetch);
  useEffect(() => {
    saved.current = refetch;
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      // Fire and forget: the result is rendered through the query itself, and a
      // rejected refetch is already surfaced as that query's error state.
      void saved.current();
    }, []),
  );
}
