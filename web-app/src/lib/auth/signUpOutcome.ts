// Reading a Supabase sign-up response correctly. PURE — no imports, unit-tested
// in __tests__/signUpOutcome.test.ts, and shared by the web register action and
// the mobile BFF so the two can never disagree about what "already registered"
// looks like.
//
// THE PROBLEM
// -----------
// With "Confirm email" enabled, signing up an address that already belongs to a
// CONFIRMED account is not an error. GoTrue answers HTTP 200 with a user object
// and sends no mail. It does this on purpose: an error would let anyone probe
// which addresses have accounts.
//
// The obfuscated object is not empty — it carries a plausible id, the submitted
// email and timestamps — so every ordinary success check passes and the caller
// walks straight into "check your inbox" for a mail that will never arrive.
// That is exactly the dead end this module exists to prevent: the user cannot
// distinguish it from slow delivery, retries produce the same silence, and the
// resend flow is equally silent because there is nothing to resend.
//
// THE MARKER
// ----------
// `identities` comes back as an EMPTY ARRAY. A genuine new sign-up always has
// at least one identity (the email provider). Supabase documents this as the
// way to detect the case, and it is the only signal present in the response.
//
// WHY THE SHAPE IS CHECKED SO DEFENSIVELY
// ---------------------------------------
// A MISSING `identities` (undefined/null) must NOT be read as "already exists".
// Older GoTrue versions, and any future response change, could omit the field —
// and treating an omission as a duplicate would block legitimate registrations
// outright, which is far worse than the dead end above. Only an array that is
// present AND empty counts.

/** The slice of a Supabase sign-up response this decision depends on. */
export type SignUpLike = {
  user?: { identities?: unknown } | null;
} | null;

/**
 * True when the response is GoTrue's obfuscated "this address already has a
 * confirmed account" answer rather than a real new sign-up.
 *
 * Returns false for anything ambiguous — an absent user, an absent `identities`
 * field, or a non-array value. Fail OPEN: a false negative sends one unnecessary
 * confirmation email, a false positive locks a real person out of registering.
 */
export function isExistingAccountSignUp(signUp: SignUpLike): boolean {
  const identities = signUp?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}
