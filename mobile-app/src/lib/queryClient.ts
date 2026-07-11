// One QueryClient for the app. M1 keeps everything in memory (no persister);
// the MMKV persister for non-sensitive collections arrives with the M2 content
// screens per the master plan's offline policy (§11).
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
