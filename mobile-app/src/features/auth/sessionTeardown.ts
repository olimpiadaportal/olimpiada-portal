// SESSION TEARDOWN — one place, because the drift WAS the defect.
//
// A session ends in TWO ways and both have to do the same thing:
//
//   1. the explicit Log out button (authStore.signOut), and
//   2. supabase-js firing SIGNED_OUT because a refresh failed or a token was
//      revoked — the INVOLUNTARY exit, at least as common as the button.
//
// (2) used to flip the store's status and nothing else. The query cache and the
// in-flight answer drafts survived it, so on a family phone a parent's session
// could expire, a child could sign in, and the cache could serve the previous
// account's data plus its half-finished test. Both paths now call
// clearAccountState(), and it lives here — rather than being written out twice —
// precisely so they cannot drift apart again.
import { queryClient } from "@/lib/queryClient";
import { setAppBadge } from "@/features/push/badge";
import { clearPendingLink } from "@/lib/deeplink";
import { clearAllDrafts } from "@/features/tests/draft";
import { isAccountScopedKey } from "./accountScope";

/**
 * Everything the ending session owned.
 *
 * `queryClient.clear()` is deliberately the blunt instrument on the way OUT:
 * nothing is worth keeping, no screen is left to flicker, and it therefore does
 * not depend on any single key having been classified correctly.
 *
 * `clearAllDrafts()` is the half React Query cannot reach — in-flight test
 * answers live in a module-level Map (features/tests/draft.ts), so they outlive
 * the cache and would otherwise be merged straight into the next account's
 * runner.
 *
 * `clearPendingLink()` drops a deferred deep link: it was addressed to the
 * session that just ended.
 */
export function clearAccountState(): void {
  clearPendingLink();
  queryClient.clear();
  clearAllDrafts();
  // The app-icon badge is the one piece of account state that OUTLIVES the app,
  // so a stale one is visible before anybody signs in. It is set locally and
  // needs no session, which is why it belongs here rather than beside
  // deregisterPushToken(): that call deletes a push_tokens row under an own-row
  // RLS policy and therefore needs a still-valid JWT, so it can only run on the
  // deliberate Log out. On the involuntary path the session is already gone and
  // the row is left for the server to invalidate on DeviceNotRegistered — but
  // the badge would otherwise sit on the icon showing the previous account's
  // unread count.
  void setAppBadge(0);
}

/**
 * The SIGN-IN side of the same problem. A session can end without any teardown
 * running at all — the OS kills the app, or the persisted supabase session is
 * only found to be invalid later — and whatever sits in the cache at that
 * moment is addressable by whoever signs in next.
 *
 * NOT clearAccountState(), for two separate reasons:
 *
 *   * It must not blow away the ACCOUNT-AGNOSTIC reads. RootGate gates the
 *     entire tree on the mobile config, so clearing that here would replace the
 *     login screen with the splash for as long as the config RPC takes. Only
 *     entries carrying account data are dropped, identified by the key marker
 *     (accountScope.ts) rather than by a list that would go stale.
 *   * It must NOT clear the pending deep link, and that one is load-bearing: a
 *     link that arrived while signed out is stored for replay and consumed by
 *     RootGate the moment this sign-in resolves a role. Clearing it here would
 *     swallow the very link the user is signing in to open.
 */
export function resetAccountStateForSignIn(): void {
  queryClient.removeQueries({ predicate: (q) => isAccountScopedKey(q.queryKey) });
  clearAllDrafts();
}
