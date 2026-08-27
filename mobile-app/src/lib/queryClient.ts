// One QueryClient for the app. M1 keeps everything in memory (no persister);
// the MMKV persister for non-sensitive collections arrives with the M2 content
// screens per the master plan's offline policy (§11).
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      // TRUE, and it means something now: lib/queryFocus.ts drives React
      // Query's focusManager from AppState, so "window focus" on this
      // platform is "the app came back to the foreground". With the flag
      // false and nothing else in its place, a screen showed whatever it
      // fetched on mount until the user pulled to refresh.
      //
      // Bounded by staleTime above: a foreground within 60s of the last
      // fetch refetches nothing, so app-switching does not hammer the API.
      refetchOnWindowFocus: true,
    },
  },
});
