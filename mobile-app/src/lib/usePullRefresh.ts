// The ONE pull-to-refresh contract every scrollable screen uses.
//
// It deliberately does NOT reuse react-query's `isRefetching`, which is
// `isFetching && !isPending`: a query that has never resolved — including one
// gated by `enabled:false` — stays pending forever, so its flag never turns on
// and the spinner is invisible; and on a screen with several queries the one
// flag clears while the rest of the screen is still loading. The hook owns its
// own boolean and awaits EVERY source instead.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/useT";
import { showToast } from "@/features/toast/toastStore";

/** Anything a pull can re-read: a react-query result, or a bare thunk. */
export type RefreshSource =
  | { refetch: () => Promise<unknown> }
  | (() => Promise<unknown> | unknown)
  | null
  | undefined
  | false;

export type PullRefresh = {
  refreshing: boolean;
  onRefresh: () => void;
};

/**
 * Floor for the spinner. A warm cache answers in ~0ms and the spinner would
 * flash without ever being read as feedback; it also caps how fast a pull can
 * be repeated (the public screens hit anon RPCs). Anything above ~450ms starts
 * reading as jank on Android.
 */
const MIN_SPINNER_MS = 450;

function invoke(source: RefreshSource): Promise<unknown> {
  if (!source) return Promise.resolve();
  if (typeof source === "function") return Promise.resolve(source());
  return Promise.resolve(source.refetch());
}

/**
 * react-query's `refetch()` RESOLVES on failure — the error lives on the
 * resolved result — so a rejected promise alone would miss most failures and
 * the toast would cheerfully claim success over stale data.
 */
function failed(result: PromiseSettledResult<unknown>): boolean {
  if (result.status === "rejected") return true;
  const v = result.value;
  return !!v && typeof v === "object" && (v as { isError?: unknown }).isError === true;
}

/**
 * Returns the `{ refreshing, onRefresh }` pair for a RefreshControl (or for
 * ScreenScroll / ArenaScroll / Screen, which take the same two props).
 *
 * Pass EVERY query the screen shows — a pull that leaves one behind repaints
 * half the screen after the spinner is already gone. Falsy entries are ignored
 * so a conditional source can stay inline.
 */
export function usePullRefresh(sources: RefreshSource[]): PullRefresh {
  const { t } = useT();
  const [refreshing, setRefreshing] = useState(false);

  // Latest-value ref: the callback must never close over the render's query
  // objects, which are recreated on every data change.
  const latest = useRef(sources);
  useEffect(() => {
    latest.current = sources;
  });

  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    void (async () => {
      const [results] = await Promise.all([
        Promise.allSettled(latest.current.map(invoke)),
        new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
      ]);
      busy.current = false;
      if (!mounted.current) return;
      setRefreshing(false);
      const bad = results.some(failed);
      showToast(bad ? t("mob.refresh.failed") : t("mob.refreshed"), bad ? "error" : "ok");
    })();
  }, [t]);

  return { refreshing, onRefresh };
}
