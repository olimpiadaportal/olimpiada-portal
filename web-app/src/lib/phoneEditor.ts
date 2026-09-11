// Seeding the parent's phone EDITOR from the number already stored on the
// profile.
//
// WHY THIS EXISTS — DATA LOSS (2026-09-10). `PhoneSection` opened its editor
// from `usePhoneValue()` with no argument and `useState("")` for the composed
// value, so the field was EMPTY however long the parent's number had been on
// file. That was harmless right up until 2026-08-31, when the phone became
// OPTIONAL for Apple Guideline 5.1.1(v) and an empty submit stopped meaning "no
// change" and started meaning "delete it" (the BFF writes NULL). From that day
// on, a parent who opened the editor to CHECK their number and pressed Save
// lost it — silently, with the success message shown. Neither change is wrong
// on its own; the defect lived in the gap between two of them made months
// apart, and the section's own header still described the world before the
// second one.
//
// THE SPLIT ITSELF IS NOT DONE HERE. `splitE164` in `@/lib/phoneE164` asks
// libphonenumber-js for the national significant number, which is the only
// honest way to undo a composition that dropped a trunk prefix: two hand-rolled
// attempts at those rules have now produced DIFFERENT, WELL-FORMED numbers that
// nothing downstream rejects (a greedy `^0+` strip broke Rome; a hand-kept
// trunk table broke St Petersburg). This file adds the two things a form needs
// on top of that and nothing else.
//
// ONE — THE TWO HALVES ARE RETURNED TOGETHER AND ARE GUARANTEED TO AGREE.
// `value` is what the parent sees; `e164` is what the section submits when they
// change nothing. Handing back a pair, rather than letting the screen keep two
// pieces of state that each get derived somewhere, is what makes "Save without
// an edit is a no-op" a property instead of a hope.
//
// TWO — THE SPLIT IS VERIFIED BY RECOMPOSING IT. `composeE164` is what the
// field will run on the next keystroke, so the seed is only trustworthy if
// putting it back together yields the stored string byte for byte. Where it
// does not — an unreadable stored value, or metadata that has moved on since
// the number was saved — the seed falls back to an INTERNATIONAL DRAFT: a
// leading "+" and every digit, which `composeE164` returns verbatim, and which
// therefore round-trips for any stored value at all. The parent still sees
// their whole number and can still edit it. What must never happen is the two
// silent alternatives: an empty field over a stored number (delete it by
// pressing Save) or a field that recomposes into somebody else's number.
import {
  composeE164,
  countryFor,
  splitE164,
  EMPTY_PHONE,
  type PhoneValue,
} from "@/lib/phoneE164";

/** The two halves of the editor's state, guaranteed to agree with each other. */
export type PhoneEditorSeed = {
  /** What `PhoneField` renders: the country chip plus the national number. */
  value: PhoneValue;
  /**
   * What the section submits if the parent changes nothing — the stored number
   * verbatim, or "" when there is nothing stored (which every server path reads
   * as the deliberate clear the optional field needs).
   */
  e164: string;
};

/** What the field composes to — the exact call `PhoneField` makes on an edit. */
function recompose(value: PhoneValue): string {
  return composeE164(countryFor(value.iso2).dial, value.national);
}

/**
 * Editor state for a stored E.164 number, or for no number at all.
 *
 * `stored` is `profiles.phone` as `useOwnProfile` reports it: an E.164 string,
 * or null on an account that never gave one. Text with no digits in it cannot
 * be a phone number and is treated as no number — the column's constraint makes
 * that unreachable in practice.
 */
export function phoneEditorSeed(stored: string | null | undefined): PhoneEditorSeed {
  const e164 = (stored ?? "").trim();
  const digits = e164.replace(/\D/g, "");
  if (!digits) return { value: EMPTY_PHONE, e164: "" };

  const split = splitE164(e164);
  if (split.national && recompose(split) === e164) return { value: split, e164 };

  // Degraded but exact: an international draft composes to itself, so the
  // number survives even when nothing could read it.
  return { value: { iso2: split.iso2, national: `+${digits}` }, e164 };
}
