"use client";

// Inline "edit your name" control shared by the parent and child profile pages.
//   mode "single" → one full-name field  (parent: profiles.display_name)
//   mode "split"  → first + last fields  (child:  students.first/last_name)
// Shows the current name with an "Edit" affordance; editing reveals the field(s)
// + Save/Cancel. Uses useActionState against the passed server action; on a
// successful save the server revalidates the page so the fresh name flows back
// down as props, and the editor closes itself.
import { useActionState, useEffect, useState } from "react";

type State = { ok?: boolean; error?: string } | null;

export function ProfileNameEditor({
  mode,
  current,
  initialFirst,
  initialLast,
  action,
  labels,
}: {
  mode: "single" | "split";
  /** The name to display when not editing (already-composed). */
  current: string;
  initialFirst?: string;
  initialLast?: string;
  action: (prev: State, formData: FormData) => Promise<State>;
  labels: {
    valueLabel: string; // row label, e.g. "Name"
    edit: string;
    save: string;
    saving: string;
    cancel: string;
    fullName: string;
    firstName: string;
    lastName: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<State, FormData>(action, null);

  // Close the editor once the server confirms the save (props refresh with the
  // new name after revalidation). Key on the state OBJECT identity (not the
  // boolean) so a second consecutive successful save — which returns a fresh
  // {ok:true} — still re-fires the effect and closes the editor.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <div className="prof2-row prof2-row-editable">
        <span className="prof2-row-label">{labels.valueLabel}</span>
        <span className="prof2-row-value">{current || "—"}</span>
        <button
          type="button"
          className="prof2-btn prof2-btn-ghost prof2-row-edit"
          onClick={() => setEditing(true)}
        >
          {labels.edit}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="prof2-name-form">
      {mode === "single" ? (
        <label className="prof2-field">
          <span className="prof2-label">{labels.fullName}</span>
          <input
            className="prof2-input"
            name="display_name"
            defaultValue={current}
            maxLength={120}
            required
            autoComplete="name"
          />
        </label>
      ) : (
        <div className="prof2-name-split">
          <label className="prof2-field">
            <span className="prof2-label">{labels.firstName}</span>
            <input
              className="prof2-input"
              name="first_name"
              defaultValue={initialFirst ?? ""}
              maxLength={80}
              required
              autoComplete="given-name"
            />
          </label>
          <label className="prof2-field">
            <span className="prof2-label">{labels.lastName}</span>
            <input
              className="prof2-input"
              name="last_name"
              defaultValue={initialLast ?? ""}
              maxLength={80}
              required
              autoComplete="family-name"
            />
          </label>
        </div>
      )}

      <div className="prof2-form-actions">
        <button type="submit" className="prof2-btn prof2-btn-primary" disabled={pending}>
          {pending ? labels.saving : labels.save}
        </button>
        <button
          type="button"
          className="prof2-btn prof2-btn-ghost"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          {labels.cancel}
        </button>
      </div>
      {state?.error && <p className="prof2-error">{state.error}</p>}
    </form>
  );
}
