"use client";

// Phone field with a COMPACT country dial-code selector (Round 11; item 2 —
// remove the repetitive long country names from the visible selector).
//
// The collapsed trigger shows only the ISO code + dial (e.g. "AZ +994") — no
// long country name. Opening it reveals a searchable list where each row shows
// the full country name + dial code for easy picking. A hidden `phone` input
// carries the composed E.164 value into FormData. Client validity is enforced
// via setCustomValidity on the visible national input so the browser blocks
// submit; server-side validation in registerParent remains the source of truth.
//
// THE FIELD IS OPTIONAL (2026-08-31). Apple rejected the iOS build under
// Guideline 5.1.1(v) — an app may not REQUIRE personal information its core
// functionality does not need. So: no `required`, an "(optional)" label suffix
// instead of the " *" required marker, and an EMPTY national number submits ""
// (which the server normalizes to NULL). Leaving it blank on the profile form
// is therefore also how a parent CLEARS a number they gave earlier. Do not put
// `required` back to "make the data cleaner" — it is a store rejection.
//
// AND THE NUMBER ITSELF IS READ BY @/lib/phoneE164 (2026-09-10), a file that is
// byte-identical to the mobile app's copy and hands every numbering-plan
// decision to libphonenumber-js. This component used to carry its own
// `sanitizeNational`, whose `replace(/^0+/, "")` stripped every leading zero
// from every country — right for Azerbaijan, and wrong for Italy, where the 0
// of "+39 06 …" is a digit of the number, for Benin, for San Marino, and inert
// for the plans whose trunk digit is "8". THIS IS THE RAIL THAT CHARGES CARDS,
// and until this change a parent got a DIFFERENT stored number depending on
// whether they signed up on the website or in the app. Both rails now compose
// through the same function, and a shared input matrix
// (src/lib/__tests__/phoneMatrix.ts, consumed by both suites) pins them to the
// same answer row by row.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import {
  applyPhoneEdit,
  composeE164,
  countryFor,
  splitE164,
  E164_RE,
  type PhoneValue,
} from "@/lib/phoneE164";
import { phoneEditorSeed } from "@/lib/phoneEditor";
import { useT } from "@/i18n/I18nProvider";

export function PhoneField({
  locale,
  label,
  countryLabel,
  searchLabel,
  placeholder,
  invalidMessage,
  initialE164,
}: {
  /** Active UI locale (az/en/ru) — drives Intl.DisplayNames country names. */
  locale: string;
  /** Visible label for the field. */
  label: string;
  /** Accessible name for the country selector trigger. */
  countryLabel: string;
  /** Accessible name / placeholder for the country search box. */
  searchLabel: string;
  placeholder: string;
  /** Localized message the browser shows when the number is invalid. */
  invalidMessage: string;
  /**
   * Existing E.164 number to open on (the profile EDIT case). Absent/invalid →
   * the registration case: default country, empty number.
   */
  initialE164?: string;
}) {
  const id = useId();
  // The optional marker is resolved HERE, not passed in: both call sites
  // (registration form, profile card) render the same optional field, and
  // neither should have to remember to say so. `useT` degrades to returning the
  // raw key, so a missing catalogue entry must not leak "field.optional" into
  // the label — fall back to no suffix instead.
  const t = useT();
  const optionalRaw = t("field.optional");
  const optionalSuffix = optionalRaw === "field.optional" ? "" : optionalRaw;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // VERIFIED seed, not a bare splitE164 -- see @/lib/phoneEditor. A stored
  // number libphonenumber cannot read opened this editor EMPTY, and an empty
  // submit is a deliberate CLEAR, so pressing Save without editing deleted
  // the parent's number. phoneEditorSeed recomposes the split and falls back
  // to an international draft when it does not round-trip, so the field can
  // never be blank over a stored value. The mobile rail carries the
  // byte-identical twin.
  const seed = useMemo(() => phoneEditorSeed(initialE164).value, [initialE164]);
  const [value, setValue] = useState<PhoneValue>(seed);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hl, setHl] = useState(0);
  // A ref, not state: `applyPhoneEdit` only READS focus, and re-rendering on
  // focus would buy nothing. A browser's autofill writes into an UNFOCUSED
  // input when a dataset is chosen in a sibling field, so this flag is what
  // separates "the user cleared it" from "something else did".
  const focused = useRef(false);
  const { iso2, national } = value;

  // Localized country names via Intl.DisplayNames, falling back to the stored
  // English name for codes Intl doesn't know (e.g. XK) or older environments.
  const options = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      dn = null;
    }
    const named = COUNTRIES.map((c) => {
      let display = c.name;
      if (dn) {
        try {
          display = dn.of(c.iso2) ?? c.name;
        } catch {
          display = c.name;
        }
      }
      return { iso2: c.iso2, dial: c.dial, display };
    });
    named.sort((a, b) => a.display.localeCompare(b.display, locale));
    return named;
  }, [locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const qDigits = q.replace(/[^0-9]/g, "");
    return options.filter(
      (c) =>
        c.display.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        (qDigits.length > 0 && c.dial.includes(qDigits)),
    );
  }, [options, query]);

  const dial = countryFor(iso2).dial;
  const e164 = composeE164(dial, national);

  // Custom validity on the VISIBLE input so native form validation blocks
  // submit on a HALF-TYPED number. An EMPTY field is valid — the field is
  // optional — which is what the `nat &&` guard below already encodes.
  //
  // ONE check, not two. This used to also demand a 4–12 DIGIT national part,
  // which is a numbering-plan claim of its own and false at both ends (San
  // Marino's 0549 886377 is 10, an Italian landline can be 11). The composed
  // value is now the library's, and a number the library could not read
  // composes to something E164_RE rejects — so the single E.164 check is
  // strictly stronger than the pair it replaces.
  function applyValidity(el: HTMLInputElement, next: PhoneValue) {
    const composed = composeE164(countryFor(next.iso2).dial, next.national);
    el.setCustomValidity(next.national && !E164_RE.test(composed) ? invalidMessage : "");
  }

  function commit(next: PhoneValue, el?: HTMLInputElement | null) {
    setValue(next);
    const target = el ?? inputRef.current;
    if (target) applyValidity(target, next);
  }

  function selectCountry(nextIso2: string) {
    commit({ iso2: nextIso2, national });
    setOpen(false);
    setQuery("");
    // Return focus to the number field so typing can continue immediately.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onNationalChange(e: React.ChangeEvent<HTMLInputElement>) {
    // The trunk prefix stays ON SCREEN — it is how the number is written
    // locally, and deleting it mid-entry moves the caret out from under the
    // user. It comes off once, in `composeE164`, and only where the plan says
    // it is one. An over-long paste is capped by DIGITS, so the separators
    // people group with never cost a digit.
    commit(applyPhoneEdit({ raw: e.target.value, prev: value, focused: focused.current }), e.target);
  }

  // Close on outside click / Escape; focus the search box when opening.
  useEffect(() => {
    if (!open) return;
    setHl(0);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDoc = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the keyboard-highlighted option visible inside the scrolling list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${hl}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [hl, open, filtered]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHl((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHl((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[hl];
      if (pick) selectCountry(pick.iso2);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      // Return focus to the trigger (standard menu-button dismissal) instead of
      // dropping it to <body> when the popover unmounts.
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }

  return (
    <div className="field phone-field">
      <label className="field-label" htmlFor={`${id}-num`}>
        {optionalSuffix ? `${label} ${optionalSuffix}` : label}
      </label>
      <div className="phone-row">
        <div className="phone-cc" ref={rootRef}>
          <button
            ref={triggerRef}
            type="button"
            className="phone-cc-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`${countryLabel}: ${iso2} +${dial}`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="phone-cc-iso">{iso2}</span>
            <span className="phone-cc-dial">+{dial}</span>
            <svg
              className="phone-cc-caret"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {open && (
            <div className="phone-cc-pop">
              <input
                ref={searchRef}
                type="text"
                className="phone-cc-search"
                placeholder={searchLabel}
                aria-label={searchLabel}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHl(0);
                }}
                onKeyDown={onSearchKey}
              />
              <ul
                ref={listRef}
                className="phone-cc-list"
                role="listbox"
                aria-label={countryLabel}
              >
                {filtered.length === 0 && (
                  <li className="phone-cc-empty" aria-disabled="true">
                    —
                  </li>
                )}
                {filtered.map((c, i) => (
                  <li
                    key={c.iso2}
                    role="option"
                    aria-selected={c.iso2 === iso2}
                    data-idx={i}
                  >
                    <button
                      type="button"
                      className={`phone-cc-opt${i === hl ? " hl" : ""}${
                        c.iso2 === iso2 ? " sel" : ""
                      }`}
                      onMouseEnter={() => setHl(i)}
                      onClick={() => selectCountry(c.iso2)}
                    >
                      <span className="phone-cc-opt-name">{c.display}</span>
                      <span className="phone-cc-opt-dial">+{c.dial}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <input
          id={`${id}-num`}
          ref={inputRef}
          className="phone-national"
          type="text"
          inputMode="tel"
          autoComplete="tel-national"
          /* No `maxLength`: a CHARACTER cap counts the spaces people group
             digits with, so a long number written out loses its last digit and
             then composes into a well-formed number belonging to someone else.
             `applyPhoneEdit` caps DIGITS instead, at the longest national
             number any plan the library knows of allows. */
          value={national}
          onChange={onNationalChange}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
          }}
          placeholder={placeholder}
        />
      </div>
      {/* Composed E.164 value that actually reaches the server action. */}
      <input type="hidden" name="phone" value={e164} />
    </div>
  );
}
