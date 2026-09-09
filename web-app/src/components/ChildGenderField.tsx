"use client";

// Parent-facing OPTIONAL gender field (Add-Child wizard + Edit-Child form).
//
// THREE ANSWERS, plus a starting state that is not an answer — which is why
// this is a select with an empty first option rather than two radio buttons:
//
//   ""            nothing chosen yet → nothing is posted, the column is
//                                     untouched (a new child stays NULL —
//                                     "never asked")
//   "female"      Qız / Girl
//   "male"        Oğlan / Boy
//   "unspecified" "prefer not to say" — asked, and declined
//
// THE PLACEHOLDER IS A DISPLAY STATE, NOT A CHOICE (`disabled hidden`): it
// shows while nothing has been chosen and can never be selected BACK. Selecting
// it would be a lie — absent means "leave this column alone" on the wire, so on
// the Edit form a parent could pick "Seçilməyib", be told the save succeeded,
// and watch the field snap straight back to the stored answer. A parent who
// wants to take an answer back picks "prefer not to say", which is a real
// recorded answer instead of a silent no-op.
//
// This is also what makes the two surfaces agree: mobile's SelectField lists
// the three values and shows `mob.child.gender.none` only as placeholder text,
// so there has never been a row to tap there either.
//
// The placeholder and "prefer not to say" stay worded apart
// (`addchild.field.genderNone` vs `addchild.gender.unspecified`) because they
// are different facts about the column; collapsing them would make its own
// distinction unreportable, which is the failure migration 169 was written to
// avoid.
//
// NOT DEFAULTED. There is no pre-selected value and no `required` — the field
// carries the "(optional)" suffix every other optional field uses, plus a hint
// saying what it is for. FULLY CONTROLLED: the owning form holds the state and
// posts it; lib/studentGender re-whitelists it server-side.
import { STUDENT_GENDERS, type StudentGender } from "@/lib/studentGender";

/** "" = nothing chosen yet. Never write "" to the column. */
export type ChildGenderChoice = "" | StudentGender;

const OPTION_KEY: Record<StudentGender, string> = {
  female: "addchild.gender.female",
  male: "addchild.gender.male",
  unspecified: "addchild.gender.unspecified",
};

// The i18n keys this field needs are listed in each parent page's own KEYS
// array (children/new and children/[id]/edit), the same way the avatar
// picker's are. They cannot be exported from HERE: this is a "use client"
// module, so every export crosses the boundary as a client reference and a
// server component spreading it gets a proxy, not an array.
//
//   addchild.field.gender · addchild.field.genderNone · addchild.field.genderHint
//   addchild.gender.female · addchild.gender.male · addchild.gender.unspecified
//   addchild.err.genderInvalid · field.optional

export function ChildGenderField({
  value,
  onChange,
  disabled = false,
  dict,
}: {
  value: ChildGenderChoice;
  onChange: (next: ChildGenderChoice) => void;
  disabled?: boolean;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  return (
    <label className="field">
      <span className="field-label">
        {tt("addchild.field.gender")} {tt("field.optional")}
      </span>
      <select
        name="gender"
        value={value}
        onChange={(e) => onChange(e.target.value as ChildGenderChoice)}
        disabled={disabled}
      >
        <option value="" disabled hidden>
          {tt("addchild.field.genderNone")}
        </option>
        {STUDENT_GENDERS.map((g) => (
          <option key={g} value={g}>
            {tt(OPTION_KEY[g])}
          </option>
        ))}
      </select>
      <span className="hint">{tt("addchild.field.genderHint")}</span>
    </label>
  );
}
