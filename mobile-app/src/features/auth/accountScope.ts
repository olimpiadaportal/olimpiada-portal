// ACCOUNT SCOPE FOR QUERY KEYS.
//
// The device is shared — that is the normal case for this product, not the edge
// case. A parent signs out (or their token simply expires), a child signs in on
// the same phone, and every React Query entry the previous account left behind
// is still addressable under the same key, so a screen can paint the wrong
// family's data before the first refetch lands.
//
// The fix is structural rather than procedural: every key that carries ACCOUNT
// DATA ends with this marker plus the id of the account it belongs to. Two
// consequences, and both are the point:
//
//   * A DIFFERENT ACCOUNT CANNOT HIT THE SAME KEY. Even if a teardown were
//     missed entirely, a stale entry becomes unreachable rather than merely
//     unlikely to be read.
//   * "Does this entry belong to somebody's session?" becomes a property of the
//     key itself (isAccountScopedKey), so the sign-in cleanup in
//     sessionTeardown.ts can be a PREDICATE instead of a hand-maintained list —
//     and a hand-maintained list is exactly the thing that goes stale the next
//     time a query is added.
//
// THE MARKER GOES AT THE END so prefix invalidation keeps working untouched:
// invalidateQueries({ queryKey: ["arena"] }), ["notifications"],
// ["tests","attempts"], ["parent","subscriptions"] all still match the scoped
// keys nested under them.
//
// WHAT IS DELIBERATELY NOT SCOPED: world-readable catalogue reads — published
// subjects, grades, cities, schools, news, the mobile config. They answer the
// same thing for every account, and scoping them would re-fetch the whole
// public catalogue on every sign-in for nothing (and blank the config RootGate
// gates the tree on). The test to apply is NOT "is this behind a login" but
// "would a DIFFERENT ACCOUNT GET A DIFFERENT ANSWER" — which is why
// ["catalog","active-subjects"] IS scoped (it runs my_taught_subjects, a
// caller-scoped RPC) while ["catalog","public-subjects"] is not (it passes an
// explicit null and skips that rule).
//
// No imports on purpose: authStore -> sessionTeardown -> accountScope, and a
// hook reading the store from here would close that loop.

/** Sentinel segment separating a key from the account id it belongs to. */
export const ACCOUNT_SCOPE = "@account" as const;

/** Signed-out / not-yet-resolved reads park on their own scope — never on the
 *  scope of whoever was signed in a moment ago. */
export const NO_ACCOUNT = "-";

/**
 * Append the account scope to a key. `accountId` is the profiles.id of the
 * account the data belongs to: the signed-in user for their own reads, and the
 * CHILD's profile id for a parent's per-child reads (that id is what makes one
 * family's row unaddressable by another).
 */
export function accountScoped<T extends readonly unknown[]>(
  key: T,
  accountId: string | null | undefined,
): [...T, typeof ACCOUNT_SCOPE, string] {
  return [...key, ACCOUNT_SCOPE, accountId || NO_ACCOUNT];
}

/** True for a key built by accountScoped(), i.e. one holding account data. */
export function isAccountScopedKey(key: readonly unknown[]): boolean {
  return key.includes(ACCOUNT_SCOPE);
}
