// THE NUMBERING PLAN IS THE LIBRARY'S JOB, NOT OURS (2026-09-10).
//
// One question, one answer: what E.164 number did the parent actually enter?
// This file is BYTE-IDENTICAL in web-app/ and mobile-app/ — a test in
// web-app/src/lib/__tests__/phoneE164.test.ts compares the two files, byte for
// byte, and fails if they drift. That matters more here than almost anywhere
// else in the repo: the web rail is the one that charges cards and the mobile
// rail is the one most parents use, so a number that composes differently on
// the two surfaces is a parent whose account holds a number they never gave.
//
// TWO HAND-ROLLED ATTEMPTS CAME BEFORE THIS ONE. BOTH WERE WRONG, AND BOTH
// FAILED SILENTLY:
//
//   * `national.replace(/^0+/, "")` — country-blind and greedy. Right for
//     Azerbaijan (+994, trunk "0"), right by accident across most of Europe,
//     and wrong for Italy, whose plan has NO trunk prefix at all: Rome's
//     "+39 06 1234 5678" was stored as +39 6 1234 5678. It also did nothing
//     whatsoever for the plans whose trunk digit is not "0".
//   * a TRUNK_PREFIX_BY_DIAL table maintained by hand. It cured Italy and broke
//     Russia, because "the trunk prefix of +7 is 8" is true of the trunk prefix
//     and false of the AREA CODES that begin with 8 — 812 St Petersburg, 831,
//     843, 844, 845, 846, 861, 862, 863, 87xx. A pasted "+7 812 123 45 67" was
//     stored as +7 121 234 567. The same table defaulted every unlisted plan to
//     trunk "0", which eats a real digit in Benin and San Marino, and left
//     Lithuania and Belarus (trunk "8") unstripped.
//
// Both mistakes produced a DIFFERENT, WELL-FORMED number. E164_RE accepted it,
// the server's PHONE_RE accepted it, chk_profiles_phone_e164 accepted it, and
// the parent simply had a stranger's number on file — the worst failure mode
// available, because nothing anywhere rejects it. A national numbering plan is
// not a table anyone maintains by hand: it is ~250 plans with per-area
// exceptions, revised continuously, and Google publishes it. libphonenumber-js
// is that data plus the parser that reads it. NOTHING in this file
// re-implements any of it — every trunk-prefix decision below is made by the
// library, including the ones made while a number is still half typed.
import { AsYouType, Metadata, getCountries, parsePhoneNumberFromString } from "libphonenumber-js";
import { COUNTRIES, DEFAULT_ISO2, type Country } from "./countries";

/** The shape the server (parentValidation.PHONE_RE) and the database
 *  (chk_profiles_phone_e164) accept. Re-spelled nowhere else on the client. */
export const E164_RE = /^\+[1-9][0-9]{6,14}$/;

/**
 * The longest national number any numbering plan the library knows about will
 * accept, ASKED OF THE LIBRARY rather than guessed (17 — Indonesia — at the
 * time of writing, and it moves when the metadata does).
 *
 * This is a cap on DIGITS, not on characters, and the difference was a bug: the
 * old PHONE_MAX_LEN capped the national field at 14 CHARACTERS INCLUDING the
 * spaces people group digits with, so an 11-digit number written out with
 * spaces lost its final digit to the cap and then composed into a perfectly
 * well-formed E.164 number belonging to somebody else. Separators must not
 * consume the budget.
 *
 * An international number pasted into the same field is bounded more tightly
 * still — E.164 allows 15 digits in total — so this one bound covers both.
 */
export const PHONE_MAX_DIGITS: number = (() => {
  const metadata = new Metadata();
  let longest = 0;
  for (const country of getCountries()) {
    metadata.selectNumberingPlan(country);
    for (const length of metadata.numberingPlan?.possibleLengths() ?? []) {
      if (length > longest) longest = length;
    }
  }
  return longest;
})();

/** `text` truncated where its DIGIT count would exceed the cap; separators are
 *  carried along and never charged against the budget. */
export function capPhoneDigits(text: string): string {
  let digits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      digits += 1;
      if (digits > PHONE_MAX_DIGITS) return text.slice(0, i);
    }
  }
  return text;
}

/**
 * Reads one string the LIBRARY's way and returns strict E.164, or null.
 *
 * `options` selects the numbering plan a national number is read in. The bar
 * for accepting a result is `isPossible()` — a LENGTH check against the plan —
 * and deliberately not `isValid()`, which additionally requires the number to
 * fall inside a published RANGE. A range opened after this metadata snapshot is
 * a real number a real parent holds, and `isValid()` would refuse to let them
 * save it; Benin's legacy 8-digit numbers are the same story from the other
 * end. Length is the strongest check that cannot go stale into a false
 * negative.
 *
 * `extract: false` makes the WHOLE string have to be a phone number. Without it
 * the library digs a number out of surrounding prose, which is right for a text
 * scanner and wrong for a field holding one number.
 */
function read(text: string, options: { defaultCallingCode?: string }): string | null {
  try {
    const parsed = parsePhoneNumberFromString(text, { ...options, extract: false });
    return parsed && parsed.isPossible() ? parsed.number : null;
  } catch {
    // A calling code the metadata does not know throws rather than returning
    // undefined. An unreadable number is null, however it failed to read.
    return null;
  }
}

/**
 * The parent's number in strict E.164, or null when the text is not a complete
 * readable number.
 *
 * `nationalOrFull` is whatever is in the field — a national number with or
 * without its trunk prefix, an international one written with "+", the same one
 * written with the "00" IDD prefix, the "(0)" convention half the world prints
 * on business cards, digits grouped with spaces/dashes/parens, or a bare digit
 * string that already carries the country code. `dialCode` is the country the
 * picker is showing, digits only, and it is used ONLY to choose which numbering
 * plan a NATIONAL number is read in — a number carrying its own country code
 * ignores it.
 */
export function parseToE164(nationalOrFull: string, dialCode: string): string | null {
  const text = String(nationalOrFull ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;

  // "+…" carries its own country code, so the picker has no say.
  if (text.startsWith("+")) return read(text, {});

  // "00…" is the same number written with an IDD prefix instead of "+", and the
  // library will NOT strip it for us: `defaultCallingCode` says which plan to
  // read the number in, not which country the caller is dialling FROM, so no
  // IDD is in scope. Substituting the "+" here is the whole of the handling —
  // which country code follows is still the library's decision, and a result it
  // rejects falls through to the national reading below.
  if (/^00\d/.test(digits)) {
    const asPlus = read(`+${digits.slice(2)}`, {});
    if (asPlus) return asPlus;
  }

  const national = read(text, { defaultCallingCode: dialCode });
  if (national) return national;

  // LAST: a bare digit string that already includes the country code, which is
  // what a paste from a contact card looks like once the "+" is lost. Tried
  // last on purpose — an Italian mobile "3906123456" is a real 10-digit
  // NATIONAL number as well as "39" + "06123456", and the national reading is
  // the right one.
  if (digits.startsWith(dialCode)) return read(`+${digits}`, {});
  return null;
}

/** The state of a phone row: which country the chip shows, and the number as
 *  typed — trunk prefix, separators and all. */
export type PhoneValue = {
  /** ISO 3166-1 alpha-2 of the selected country. */
  iso2: string;
  /**
   * National number exactly as typed. The one non-digit it may carry beyond
   * grouping spaces is a LEADING "+", while an international number is being
   * typed and its dial code has not matched a country yet (see `isIntlDraft`).
   */
  national: string;
};

export const EMPTY_PHONE: PhoneValue = { iso2: DEFAULT_ISO2, national: "" };

/** Never null: an unknown iso2 falls back to the default country, then to the
 *  first row, so the trigger always has something to render. */
export function countryFor(iso2: string): Country {
  return (
    COUNTRIES.find((c) => c.iso2 === iso2) ??
    COUNTRIES.find((c) => c.iso2 === DEFAULT_ISO2) ??
    COUNTRIES[0]
  );
}

/**
 * The country whose dial code `digits` begins with, or null.
 *
 * `preferIso2` wins whenever it fits, because a dial code does NOT identify a
 * country: 25 rows share "1" and two share "7". A user who already picked one
 * of them must not be flipped to whichever sibling comes first in the table.
 * With no preference the longest match is taken, which can land the chip on a
 * sibling territory — harmless by definition, since siblings share the dial
 * code and the dial code is the whole of what composition uses.
 */
export function matchDialCode(digits: string, preferIso2?: string): Country | null {
  if (!digits) return null;
  const preferred = preferIso2 ? COUNTRIES.find((c) => c.iso2 === preferIso2) : undefined;
  if (preferred && digits.startsWith(preferred.dial)) return preferred;
  let best: Country | null = null;
  for (const c of COUNTRIES) {
    if (!digits.startsWith(c.dial)) continue;
    if (!best || c.dial.length > best.dial.length) best = c;
  }
  return best;
}

/**
 * True while the field holds an international number the user has not finished
 * typing — "+", "+9", "+99": a "+" whose dial code has not matched a country
 * yet. The "+" is KEPT on screen instead of being deleted from under them.
 */
export function isIntlDraft(national: string): boolean {
  return /^\s*\+/.test(national);
}

/**
 * The digits of an INTERNATIONALLY written number, or null when the text is an
 * ordinary national one.
 *
 * The field holds a number WITHOUT its country code, so a full
 * "+994 50 123 45 67" — exactly what a contact card, a paste and every autofill
 * service deliver — would otherwise be cleaned to "994501234567" and composed
 * into "+994994501234567". A doubled dial code, silently.
 *
 * A leading "+" is unambiguous and always counts. A leading "00" counts only
 * when a real dial code follows it, so someone part-way through typing is never
 * reinterpreted mid-keystroke.
 *
 * A bare "+" returns the EMPTY STRING — international, no digits yet — which is
 * not the same answer as null and must not be collapsed into it: it is what
 * lets `applyPhoneEdit` keep the "+" on screen while the dial code is typed.
 */
function internationalDigits(raw: string): string | null {
  const head = raw.replace(/^[\s(]+/, "");
  const digits = raw.replace(/\D/g, "");
  if (head.startsWith("+")) return digits;
  // Matched against the DIGITS rather than the raw text: "00 994 50 …" is the
  // same number as "00994 50 …", and a space after the IDD must not hide it.
  if (/^00\d/.test(digits)) {
    const rest = digits.slice(2);
    return matchDialCode(rest) ? rest : null;
  }
  return null;
}

function hasDigits(value: string): boolean {
  return /\d/.test(value);
}

/**
 * Turn one reported edit into the next value. Pure, so these rules are testable
 * without a renderer.
 *
 * THE BLANK REFUSAL. A pass that would leave a field that HAD digits with none
 * is refused and the previous value kept, with two exceptions, both requiring
 * that the input actually held keyboard focus — the user is demonstrably doing
 * this themselves:
 *
 *   * the text really arrived empty (backspacing to nothing, or select-all +
 *     delete). Clearing by hand has to keep working: the phone is OPTIONAL
 *     (Apple 5.1.1(v)) and an empty submit is a deliberate clear, so a blanket
 *     "never empty" rule would make the field one-way;
 *   * the digits were not lost, they became the COUNTRY — the keystroke that
 *     completed a dial code the user was TYPING. "+994" reaches this through
 *     the draft branch below; "00994" has no "+" to mark it as a draft and used
 *     to be refused here, which ate the keystroke that completed the dial code
 *     and left the user typing into a field that silently ignored them. Typing
 *     is what the second half of the test establishes: the digits already in
 *     the field are a PREFIX of the digits that just arrived. A bare "+994"
 *     landing on top of a full number extends nothing and stays refused,
 *     whether or not the field happens to hold focus.
 *
 * Everything else that empties a filled field came from the PLATFORM: focus
 * moves to the password, the autofill service fills the dataset the user chose,
 * and the phone it has no value for is written as "". Refuse it.
 *
 * BLANKING IS REFUSED; OVERWRITING IS NOT, and the asymmetry is deliberate. An
 * unfocused write carrying a real number is ordinary autofill — the phone is
 * unfocused for the whole fill — and what it writes is a number the user saved,
 * visible and editable. An empty write carries no information at all, so the
 * only thing it can do is destroy some.
 *
 * NOTHING HERE TOUCHES A TRUNK PREFIX any more, in either branch. Typed text
 * keeps every digit on screen exactly as entered, an international paste keeps
 * the "(0)" it was written with, and the single decision about which digits
 * survive into E.164 is made once, by the library, in `composeE164`. The old
 * international branch stripped a leading trunk digit unconditionally, which is
 * sound only for the "(0)" convention: there is no "+7 (8) …" form, so a real
 * "+7 812 …" lost the 8 of its AREA code.
 */
export function applyPhoneEdit(input: {
  /** Text the input just reported. */
  raw: string;
  /** Value the field held before this edit. */
  prev: PhoneValue;
  /** True only while the national input actually holds keyboard focus. */
  focused: boolean;
}): PhoneValue {
  const { raw, prev, focused } = input;

  const intl = internationalDigits(raw);
  let next: PhoneValue;
  // True when the entire input WAS a dial code the user was extending, so an
  // emptied field means the digits moved into the country chip rather than
  // going missing.
  let consumedByCountry = false;
  if (intl === null) {
    next = { iso2: prev.iso2, national: capPhoneDigits(raw.replace(/[^\d ]/g, "")) };
  } else {
    const match = matchDialCode(intl, prev.iso2);
    if (match) {
      consumedByCountry =
        intl.length === match.dial.length &&
        raw.replace(/\D/g, "").startsWith(prev.national.replace(/\D/g, ""));
      next = { iso2: match.iso2, national: capPhoneDigits(intl.slice(match.dial.length)) };
    } else {
      next = { iso2: prev.iso2, national: `+${capPhoneDigits(intl)}` };
    }
  }

  if (!hasDigits(next.national) && hasDigits(prev.national) && !isIntlDraft(prev.national)) {
    const deliberate = focused && (raw === "" || consumedByCountry);
    if (!deliberate) return prev;
  }
  return next;
}

/**
 * What the account actually receives. "" when there is no national number at
 * all — NOT a bare "+994".
 *
 * This is load-bearing for the optional field: callers test the emitted value
 * for emptiness to decide "no number given". Returning the dial code alone made
 * a field the user typed into and then cleared look like a MALFORMED number
 * rather than an absent one, so an optional field became un-leavable the moment
 * it was touched.
 *
 * A number the library can read composes to the library's own E.164 string. A
 * number it cannot — because it is still being typed, or simply because it is
 * wrong — composes to a DRAFT: non-empty, so a number on screen is never read
 * as "no number given", and carrying NO leading "+" unless the user typed one.
 *
 * That last rule is the whole of the draft's safety. A "+" is a claim that this
 * is a complete international number, and exactly two things may make it: the
 * library, or the person typing. Prefixing the picker's dial code ourselves
 * would be the invention this module exists to refuse, and it is not
 * hypothetical — an Azerbaijani number one digit short used to compose into
 * "+9945012345", which E164_RE, the server's PHONE_RE and
 * chk_profiles_phone_e164 all accept and which belongs to nobody. Without the
 * "+" every one of those checks rejects it and the parent is told to fix their
 * number, which is the honest outcome.
 *
 * The draft's national part is `AsYouType`'s, not ours: the trunk prefix of a
 * half-typed number is as plan-specific as that of a finished one, and this
 * file makes no such judgement of its own anywhere.
 */
export function composeE164(dial: string, national: string): string {
  if (!hasDigits(national)) return "";
  const parsed = parseToE164(national, dial);
  if (parsed) return parsed;
  if (isIntlDraft(national)) {
    // The user typed the "+", so it stays — and the country code it introduces
    // is theirs, which is why the picker's must NOT also be prepended. That
    // doubling ("+994994501234567") is the other half of this module's job.
    const digits = national.replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  const asYouType = new AsYouType({ defaultCallingCode: dial });
  asYouType.input(national);
  const nationalNumber = asYouType.getNationalNumber();
  return nationalNumber ? `${dial}${nationalNumber}` : "";
}

/**
 * A stored E.164 number split back into (country, national) so an EDIT form can
 * open on the number the parent already has.
 *
 * The national half is the library's national SIGNIFICANT number — no trunk
 * prefix, because a stored E.164 number never carried one — so feeding it back
 * through `composeE164` returns the identical string it came from.
 */
export function splitE164(value: string): PhoneValue {
  const text = String(value ?? "").trim();
  if (!text) return EMPTY_PHONE;
  try {
    const parsed = parsePhoneNumberFromString(text, { extract: false });
    if (parsed && parsed.isPossible()) {
      const country =
        COUNTRIES.find((c) => c.iso2 === parsed.country) ??
        matchDialCode(parsed.countryCallingCode);
      if (country) return { iso2: country.iso2, national: parsed.nationalNumber };
    }
  } catch {
    // An unreadable stored value opens the form empty rather than throwing.
  }
  return EMPTY_PHONE;
}
