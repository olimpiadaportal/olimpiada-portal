"use client";

// Parent-facing REQUIRED gender field (Add-Child wizard + Edit-Child form).
//
// MANDATORY SINCE 2026-09-16 (owner), AND THE SHAPE OF THE CONTROL CHANGED WITH
// IT. Until then this was a three-answer select carrying the "(optional)"
// suffix; a parent could walk past it and the column kept its "never asked"
// NULL. Two answers now, and no way past:
//
//   ""            nothing chosen YET — a display state, never a submission
//   "female"      Qız / Girl
//   "male"        Oğlan / Boy
//
// 'unspecified' ("prefer not to say") IS GONE FROM THE UI AND STILL LIVES IN
// THE DATABASE. Postgres cannot drop an enum label, and the rows already
// holding it recorded something true — a parent who was asked and declined. So
// the export, the admin workbook and lib/studentGender all keep understanding
// it; it is simply no longer OFFERED. A child whose stored value is
// 'unspecified' shows the placeholder here, which means the next save asks the
// question again — the owner's decision, and the reason the edit form seeds
// itself from COLLECTED_STUDENT_GENDERS rather than from the full enum.
//
// THE PLACEHOLDER IS A DISPLAY STATE, NOT A CHOICE (`disabled hidden`): it
// shows while nothing has been chosen and can never be selected BACK. It was
// already unselectable while the field was optional — for a different reason
// then (picking it would have been a silent no-op on the Edit form) and for a
// blunter one now: there is no submittable "no answer" left.
//
// THE ERROR SLOT IS PART OF THE FIELD, not an afterthought for the owning form.
// A required control whose refusal is rendered in a list at the bottom of a
// long wizard step is a control the parent scrolls past; the message belongs
// under the select that caused it. Both owners pass the key they got back —
// from their own pre-flight check or from the server — and the two paths are
// the same two keys (`addchild.err.genderRequired` / `.genderInvalid`).
//
// FULLY CONTROLLED: the owning form holds the state and posts it;
// lib/studentGender re-whitelists it server-side, where it counts.
import { COLLECTED_STUDENT_GENDERS, type CollectedStudentGender } from "@/lib/studentGender";

/** "" = nothing chosen yet. Never write "" to the column, and never submit it. */
export type ChildGenderChoice = "" | CollectedStudentGender;

const OPTION_KEY: Record<CollectedStudentGender, string> = {
  female: "addchild.gender.female",
  male: "addchild.gender.male",
};

// The i18n keys this field needs are listed in each parent page's own KEYS
// array (children/new and children/[id]/edit), the same way the avatar
// picker's are. They cannot be exported from HERE: this is a "use client"
// module, so every export crosses the boundary as a client reference and a
// server component spreading it gets a proxy, not an array.
//
//   addchild.field.gender · addchild.field.genderNone · addchild.field.genderHint
//   addchild.gender.female · addchild.gender.male
//   addchild.err.genderRequired · addchild.err.genderInvalid

export function ChildGenderField({
  value,
  onChange,
  disabled = false,
  error,
  dict,
}: {
  value: ChildGenderChoice;
  onChange: (next: ChildGenderChoice) => void;
  disabled?: boolean;
  /** i18n KEY of the refusal to show under the select, or null/undefined. */
  error?: string | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  return (
    <label className="field">
      <span className="field-label">{tt("addchild.field.gender")} *</span>
      <select
        name="gender"
        value={value}
        onChange={(e) => onChange(e.target.value as ChildGenderChoice)}
        disabled={disabled}
        required
        aria-invalid={!!error}
      >
        <option value="" disabled hidden>
          {tt("addchild.field.genderNone")}
        </option>
        {COLLECTED_STUDENT_GENDERS.map((g) => (
          <option key={g} value={g}>
            {tt(OPTION_KEY[g])}
          </option>
        ))}
      </select>
      {error && <span className="field-error">{tt(error)}</span>}
      <span className="hint">{tt("addchild.field.genderHint")}</span>
    </label>
  );
}
