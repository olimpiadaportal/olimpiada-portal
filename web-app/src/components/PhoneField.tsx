"use client";

// Phone field with a COMPACT country dial-code selector (Round 11; item 2 —
// remove the repetitive long country names from the visible selector).
//
// The collapsed trigger shows only the ISO code + dial (e.g. "AZ +994") — no
// long country name. Opening it reveals a searchable list where each row shows
// the full country name + dial code for easy picking. A hidden `phone` input
// carries the composed E.164 value (+dial + national) into FormData. Client
// validity (4–12 digit national part AND the composed value matching the
// server/DB E.164 rule) is enforced via setCustomValidity on the visible
// national input so the browser blocks submit; server-side validation in
// registerParent remains the source of truth.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNTRIES, DEFAULT_ISO2 } from "@/lib/countries";

// Mirrors the server regex in parentService.ts and chk_profiles_phone_e164.
const E164_RE = /^\+[1-9][0-9]{6,14}$/;
const NATIONAL_RE = /^[0-9]{4,12}$/;

// Strip the separators people naturally type (spaces/dashes/parentheses/dots),
// then any leading 0 used in national dialing (e.g. "050 123-45-67" → "501234567").
function sanitizeNational(raw: string): string {
  return raw.replace(/[\s\-().]/g, "").replace(/^0+/, "");
}

// Splits a stored E.164 number back into (country, national) so the EDIT case
// opens on the number the parent already has. Dial codes overlap (+1 vs +1242,
// +7 vs +7…), so the LONGEST matching prefix wins; among countries sharing one
// dial code the first entry is used — the pair still recomposes to the exact
// same E.164 string, which is all that is submitted.
function splitE164(value: string): { iso2: string; national: string } {
  const digits = /^\+[1-9][0-9]{6,14}$/.test(value) ? value.slice(1) : "";
  if (!digits) return { iso2: DEFAULT_ISO2, national: "" };
  let best: { iso2: string; dial: string } | null = null;
  for (const c of COUNTRIES) {
    if (digits.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) {
      best = { iso2: c.iso2, dial: c.dial };
    }
  }
  if (!best) return { iso2: DEFAULT_ISO2, national: "" };
  return { iso2: best.iso2, national: digits.slice(best.dial.length) };
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const seed = useMemo(() => splitE164(initialE164 ?? ""), [initialE164]);
  const [iso2, setIso2] = useState<string>(seed.iso2);
  const [national, setNational] = useState(seed.national);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hl, setHl] = useState(0);

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

  const dial = COUNTRIES.find((c) => c.iso2 === iso2)?.dial ?? "";
  const e164 = national ? `+${dial}${national}` : "";

  // Custom validity on the VISIBLE input so native form validation blocks
  // submit (required covers the empty case with the browser's own message).
  function applyValidity(el: HTMLInputElement, nat: string, d: string) {
    const ok = NATIONAL_RE.test(nat) && E164_RE.test(`+${d}${nat}`);
    el.setCustomValidity(nat && !ok ? invalidMessage : "");
  }

  function selectCountry(nextIso2: string) {
    setIso2(nextIso2);
    setOpen(false);
    setQuery("");
    const d = COUNTRIES.find((c) => c.iso2 === nextIso2)?.dial ?? "";
    if (inputRef.current) applyValidity(inputRef.current, national, d);
    // Return focus to the number field so typing can continue immediately.
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onNationalChange(e: React.ChangeEvent<HTMLInputElement>) {
    // No hard truncation beyond maxLength: an over-long paste should surface
    // the validity message rather than be silently cut to a wrong number.
    const nat = sanitizeNational(e.target.value);
    setNational(nat);
    applyValidity(e.target, nat, dial);
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
        {label} *
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
          required
          maxLength={20}
          value={national}
          onChange={onNationalChange}
          placeholder={placeholder}
        />
      </div>
      {/* Composed E.164 value that actually reaches the server action. */}
      <input type="hidden" name="phone" value={e164} />
    </div>
  );
}
