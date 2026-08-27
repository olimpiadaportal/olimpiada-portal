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
import { useRefreshOnFocus } from "@/lib/queryFocus";

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

  /**
   * The SILENT counterpart, fired when the screen regains focus.
   *
   * Deliberately not `onRefresh`: that one owns the spinner and always ends in
   * a toast, and a toast the user did not ask for on every tab switch is worse
   * than stale data. This re-reads the same sources, shows nothing, and says
   * nothing — react-query keeps the previous data on screen and swaps it when
   * the response lands, so the update is invisible unless something changed.
   *
   * It shares `busy` with the pull, so a focus landing mid-pull is a no-op
   * rather than a second round of identical requests. Failures are swallowed on
   * purpose: this was not a user action, so there is nothing to report — the
   * screen keeps showing the last good data and the next pull will surface a
   * real problem with its toast.
   */
  const onFocusRefresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    void (async () => {
      try {
        await Promise.allSettled(latest.current.map(invoke));
      } finally {
        busy.current = false;
      }
    })();
  }, []);

  // Every screen already using this hook gets tab-switch refresh from here —
  // no per-screen wiring, and no screen can be forgotten. App-foreground
  // refresh is handled separately by react-query's focusManager (lib/queryFocus).
  useRefreshOnFocus(onFocusRefresh);

  return { refreshing, onRefresh };
}
