// THE INPUT MATRIX BOTH RAILS ARE HELD TO.
//
// One table, consumed by web-app/src/lib/__tests__/phoneE164.test.ts (vitest)
// and mobile-app/__tests__/phone-e164.test.ts (jest), and BYTE-IDENTICAL in the
// two checkouts — the web suite asserts that too. A parent who enters the same
// number on the website and in the app must end up with the same E.164 string
// on their account, and a shared expectation is the only way to state that
// without writing it down twice and letting the two copies drift.
//
// Every `e164` below was produced by libphonenumber-js and then READ, plan by
// plan, against how numbers are actually written in that country. They are not
// snapshots of whatever the code happened to emit: the rows exist because the
// two hand-rolled predecessors of this code got exactly these rows wrong, in
// both directions —
//
//   * stripping a leading zero that is PART of the number (Italy, San Marino,
//     Benin, Côte d'Ivoire),
//   * failing to strip a trunk prefix that is not "0" (Russia and Kazakhstan's
//     "8", Lithuania's and Belarus's "8", Hungary's "06", the NANP's "1"),
//   * and stripping a "trunk 8" that was really the first digit of an AREA code
//     (Russia's 812, St Petersburg) — the failure that made a pasted
//     "+7 812 123 45 67" into the different, entirely well-formed +7 121 234 567.
//
// Nothing in the app has to be told any of that any more; the rows are here so
// that a future change which quietly reintroduces a hand-rolled rule cannot
// pass.

export type PhoneMatrixRow = {
  /** Exactly what a parent types, pastes, or autofill delivers. */
  readonly input: string;
  /** Dial code the country chip is showing at the time, digits only. */
  readonly dial: string;
  /** Strict E.164, or null when the text is not a complete readable number. */
  readonly e164: string | null;
  /** Why this row is in the table. */
  readonly why: string;
};

export const PHONE_MATRIX: readonly PhoneMatrixRow[] = [
  // -------------------------------------------------------------------------
  // Azerbaijan — the primary market. Trunk "0", nine national digits, six
  // operator codes.
  // -------------------------------------------------------------------------
  {
    input: "050 123 45 67",
    dial: "994",
    e164: "+994501234567",
    why: "AZ local form: the trunk zero comes off, nothing else does",
  },
  {
    input: "051 234 56 78",
    dial: "994",
    e164: "+994512345678",
    why: "AZ operator 051",
  },
  {
    input: "055 345 67 89",
    dial: "994",
    e164: "+994553456789",
    why: "AZ operator 055",
  },
  {
    input: "070 456 78 90",
    dial: "994",
    e164: "+994704567890",
    why: "AZ operator 070",
  },
  {
    input: "077 567 89 01",
    dial: "994",
    e164: "+994775678901",
    why: "AZ operator 077",
  },
  {
    input: "099 678 90 12",
    dial: "994",
    e164: "+994996789012",
    why: "AZ operator 099",
  },
  {
    input: "50 123 45 67",
    dial: "994",
    e164: "+994501234567",
    why: "AZ written without the trunk zero — the same number",
  },
  {
    input: "+994 50 123 45 67",
    dial: "994",
    e164: "+994501234567",
    why: "AZ international form pasted into a national field",
  },
  {
    input: "+994 (0)50 123 45 67",
    dial: "994",
    e164: "+994501234567",
    why: 'the "(0)" convention: written for both audiences at once',
  },
  {
    input: "00994 50 123 45 67",
    dial: "994",
    e164: "+994501234567",
    why: '"00" is the IDD prefix, not two digits of the number',
  },
  {
    input: "00994 0 50 123 45 67",
    dial: "994",
    e164: "+994501234567",
    why: "IDD prefix and trunk prefix in the same string",
  },
  {
    input: "994501234567",
    dial: "994",
    e164: "+994501234567",
    why: "bare digits that already carry the country code",
  },
  {
    input: "+994 12 498 76 54",
    dial: "994",
    e164: "+994124987654",
    why: "AZ landline (Baku 12), not a mobile code",
  },

  // -------------------------------------------------------------------------
  // Italy — the plan with NO trunk prefix. The leading zero of an area code IS
  // a digit of the number, and stripping it invents a different one.
  // -------------------------------------------------------------------------
  {
    input: "+39 06 1234 5678",
    dial: "39",
    e164: "+390612345678",
    why: "Rome: the 0 is part of the number, and +39 6 … is somebody else",
  },
  {
    input: "06 1234 5678",
    dial: "39",
    e164: "+390612345678",
    why: "the same Rome number typed nationally",
  },
  {
    input: "02 1234 5678",
    dial: "39",
    e164: "+390212345678",
    why: "Milan keeps its zero too",
  },
  {
    input: "+39 02 1234 5678",
    dial: "39",
    e164: "+390212345678",
    why: "Milan, international form",
  },
  {
    input: "3906123456",
    dial: "39",
    e164: "+393906123456",
    why: "a real 10-digit Italian MOBILE, not '39' + '06123456' — the national reading wins",
  },

  // -------------------------------------------------------------------------
  // Russia and Kazakhstan (+7) — trunk "8", and the trap: several AREA codes
  // begin with 8 as well (812 St Petersburg, 831, 843, 846, 861, 863, 87xx).
  // -------------------------------------------------------------------------
  {
    input: "8 926 123 45 67",
    dial: "7",
    e164: "+79261234567",
    why: "RU mobile dialled nationally: the trunk 8 comes off",
  },
  {
    input: "+7 926 123 45 67",
    dial: "7",
    e164: "+79261234567",
    why: "the same RU mobile, international form",
  },
  {
    input: "+7 812 123 45 67",
    dial: "7",
    e164: "+78121234567",
    why: "St Petersburg: the 8 is the AREA code, and losing it was the blocker",
  },
  {
    input: "8 812 123 45 67",
    dial: "7",
    e164: "+78121234567",
    why: "trunk 8 AND area code 812 — exactly one 8 comes off",
  },
  {
    input: "812 123 45 67",
    dial: "7",
    e164: "+78121234567",
    why: "St Petersburg without the trunk digit: nothing may be stripped",
  },
  {
    input: "8 701 123 45 67",
    dial: "7",
    e164: "+77011234567",
    why: "Kazakhstan shares the +7 plan and its trunk digit",
  },

  // -------------------------------------------------------------------------
  // Benin (+229) and San Marino (+378) — no trunk prefix, and national numbers
  // that legitimately begin with 0. The old table defaulted them to "0".
  // -------------------------------------------------------------------------
  {
    input: "+229 01 23 45 67",
    dial: "229",
    e164: "+22901234567",
    why: "Benin legacy 8-digit number: the leading 0 is real",
  },
  {
    input: "01 23 45 67",
    dial: "229",
    e164: "+22901234567",
    why: "the same Benin number typed nationally",
  },
  {
    input: "+229 01 21 30 12 34",
    dial: "229",
    e164: "+2290121301234",
    why: "Benin's current 10-digit format, also written with its 0",
  },
  {
    input: "0549 886377",
    dial: "378",
    e164: "+3780549886377",
    why: "San Marino: 0549 is the number, not a trunk prefix",
  },
  {
    input: "+378 0549 886377",
    dial: "378",
    e164: "+3780549886377",
    why: "San Marino, international form",
  },

  // -------------------------------------------------------------------------
  // Lithuania (+370) and Belarus (+375) — trunk "8", which the "0" default
  // never stripped, so the trunk digit travelled as part of the number.
  // -------------------------------------------------------------------------
  {
    input: "8 612 34567",
    dial: "370",
    e164: "+37061234567",
    why: "Lithuania dials 8, not 0",
  },
  {
    input: "612 34567",
    dial: "370",
    e164: "+37061234567",
    why: "the same Lithuanian number without the trunk digit",
  },
  {
    input: "+370 612 34567",
    dial: "370",
    e164: "+37061234567",
    why: "Lithuania, international form",
  },
  {
    input: "8 029 123 45 67",
    dial: "375",
    e164: "+375291234567",
    why: "Belarus dials 8 and then 0 — both come off",
  },
  {
    input: "29 123 45 67",
    dial: "375",
    e164: "+375291234567",
    why: "the same Belarusian number, bare",
  },

  // -------------------------------------------------------------------------
  // The NANP (+1) — trunk "1", and an area code may never begin with 0 or 1,
  // so removing one leading 1 is unambiguous.
  // -------------------------------------------------------------------------
  {
    input: "415 555 1234",
    dial: "1",
    e164: "+14155551234",
    why: "NANP 10-digit form",
  },
  {
    input: "1 415 555 1234",
    dial: "1",
    e164: "+14155551234",
    why: "NANP 11-digit form, typed out of habit",
  },
  {
    input: "(415) 555-1234",
    dial: "1",
    e164: "+14155551234",
    why: "parens and a dash are how this number is printed",
  },

  // -------------------------------------------------------------------------
  // Plans whose trunk prefix is two digits, or is written with "(0)".
  // -------------------------------------------------------------------------
  {
    input: "06 20 123 4567",
    dial: "36",
    e164: "+36201234567",
    why: "Hungary dials 06, so a one-digit rule leaves a 6 behind",
  },
  {
    input: "20 123 4567",
    dial: "36",
    e164: "+36201234567",
    why: "the same Hungarian mobile, bare",
  },
  {
    input: "+44 (0)7911 123456",
    dial: "44",
    e164: "+447911123456",
    why: 'the UK "(0)" form, printed on half the business cards in Britain',
  },
  {
    input: "07911 123456",
    dial: "44",
    e164: "+447911123456",
    why: "the same UK mobile typed nationally",
  },
  {
    input: "+44 20 7946 0958",
    dial: "44",
    e164: "+442079460958",
    why: "London landline, international form",
  },
  {
    input: "0532 111 22 33",
    dial: "90",
    e164: "+905321112233",
    why: "Türkiye: ordinary trunk zero",
  },
  {
    input: "532 111 22 33",
    dial: "90",
    e164: "+905321112233",
    why: "the same Turkish mobile without it",
  },
  {
    input: "030 12345678",
    dial: "49",
    e164: "+493012345678",
    why: "Germany: Berlin landline behind a trunk zero",
  },
  {
    input: "0151 12345678",
    dial: "49",
    e164: "+4915112345678",
    why: "German mobile, 11 national digits — the old 14-CHARACTER cap ate one",
  },
  {
    input: "07 12 34 56 78",
    dial: "225",
    e164: "+2250712345678",
    why: "Côte d'Ivoire: every 10-digit number is written with its leading 0",
  },

  // -------------------------------------------------------------------------
  // Nothing, and not-yet-a-number. `null` here is what stops a half-typed
  // number from being stored, and "" is what makes an OPTIONAL field leavable.
  // -------------------------------------------------------------------------
  { input: "", dial: "994", e164: null, why: "an untouched field" },
  { input: "   ", dial: "994", e164: null, why: "separators only" },
  { input: "+", dial: "994", e164: null, why: "a bare + is a draft, not a number" },
  { input: "0", dial: "994", e164: null, why: "a lone trunk prefix is no number at all" },
  { input: "50", dial: "994", e164: null, why: "still being typed" },
  {
    input: "050 123 45",
    dial: "994",
    e164: null,
    why: "two digits short of an AZ number — length is the one check that catches this",
  },
];
