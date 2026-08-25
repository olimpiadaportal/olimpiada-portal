"use client";

// One selectable subject in the Free Trial picker. Presentational: it holds no
// selection logic, no cap arithmetic and no i18n — the parent owns all three.
//
// THE REFUSAL IS VISIBLE, NOT JUST ADVISORY. A `title` attribute is invisible on
// touch, which is most of this audience, so a card past the cap is a genuinely
// `disabled` button carrying `aria-disabled` and a lock glyph, and the picker
// prints one explanatory line under the grid. Both are needed: the attribute for
// pointer users, the line for everyone else.
import { LockIcon } from "@/components/icons/LockIcon";

type Props = {
  id: string;
  name: string;
  selected: boolean;
  /** True when the cap is reached and THIS card is not one of the chosen. */
  locked: boolean;
  /** True while the activation is in flight. */
  busy: boolean;
  lockReason: string;
  selectLabel: string;
  selectedLabel: string;
  selectedChip: string;
  onToggle: (id: string) => void;
};

export function FreeTrialSubjectCard({
  id,
  name,
  selected,
  locked,
  busy,
  lockReason,
  selectLabel,
  selectedLabel,
  selectedChip,
  onToggle,
}: Props) {
  const disabled = (locked && !selected) || busy;

  return (
    <button
      type="button"
      className={`ftrial-card${selected ? " is-selected" : ""}`}
      // aria-pressed is what makes a toggle announce as a toggle rather than as
      // a plain button — the PalettePicker convention.
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={disabled && !busy ? lockReason : undefined}
      aria-label={selected ? selectedLabel : selectLabel}
      onClick={() => {
        if (disabled) return;
        onToggle(id);
      }}
    >
      <span className="ftrial-card-name">{name}</span>

      {selected ? (
        <span className="ftrial-card-chip" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 8.5l3.2 3.2L13 5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {selectedChip}
        </span>
      ) : locked ? (
        <span className="ftrial-card-lock" aria-hidden="true">
          <LockIcon />
        </span>
      ) : null}
    </button>
  );
}
