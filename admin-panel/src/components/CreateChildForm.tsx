"use client";

// Round 11 (owner item 7) — admin-created child account with an optional
// payment BYPASS (comped access). Pure UI: all validation/authorization lives
// in the createChildForParent server action; this form only collects input.
//
// The success panel shows the child's 8-digit login ID prominently (when access
// was granted — otherwise the ID stays pending until the parent subscribes) and
// repeats the "this bypass exists only in the admin panel" note.
import { useActionState, useMemo, useState } from "react";
import {
  createChildForParent,
  type CreateChildState,
} from "@/lib/admin/accounts";
import { PasswordInput } from "@/components/PasswordInput";

export type ParentOption = { id: string; label: string };
export type GradeOption = { id: string; name: string };
// intervals = plan intervals this subject has ACTIVE pricing for.
export type SubjectOption = { id: string; name: string; intervals: string[] };

export type CreateChildStrings = {
  open: string;
  title: string;
  intro: string; // "bypass exists only here" explanation shown at the top
  parent: string;
  parentFilter: string;
  parentChoose: string;
  firstName: string;
  lastName: string;
  password: string;
  passwordHint: string;
  grade: string;
  gradeNone: string;
  grant: string;
  grantHelp: string;
  interval: string;
  intervalWeek: string;
  intervalMonth: string;
  intervalYear: string;
  subjects: string;
  subjectsNone: string;
  days: string;
  daysHelp: string;
  submit: string;
  submitting: string;
  done: string;
  idLabel: string;
  idPending: string;
  bypassNote: string;
  close: string;
  cancel: string;
  showPassword: string;
  hidePassword: string;
};

export function CreateChildForm({
  parents,
  grades,
  subjects,
  strings,
}: {
  parents: ParentOption[];
  grades: GradeOption[];
  subjects: SubjectOption[];
  strings: CreateChildStrings;
}) {
  const [open, setOpen] = useState(false);
  // Remount key: closing after a success clears the finished action state so
  // the next open starts with a fresh, empty form.
  const [formKey, setFormKey] = useState(0);

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {strings.open}
      </button>
    );
  }

  return (
    <InnerForm
      key={formKey}
      parents={parents}
      grades={grades}
      subjects={subjects}
      strings={strings}
      onClose={() => {
        setOpen(false);
        setFormKey((k) => k + 1);
      }}
    />
  );
}

function InnerForm({
  parents,
  grades,
  subjects,
  strings,
  onClose,
}: {
  parents: ParentOption[];
  grades: GradeOption[];
  subjects: SubjectOption[];
  strings: CreateChildStrings;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<CreateChildState, FormData>(
    createChildForParent,
    null,
  );

  const [filter, setFilter] = useState("");
  const [grant, setGrant] = useState(true); // "Grant free access" defaults ON
  const [interval, setInterval] = useState<"week" | "month" | "year">("month");

  const filteredParents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((p) => p.label.toLowerCase().includes(q));
  }, [parents, filter]);

  // Only subjects with ACTIVE pricing for the chosen interval are offered —
  // mirrors the server-side RPC check, so a valid selection cannot be rejected.
  const intervalSubjects = useMemo(
    () => subjects.filter((s) => s.intervals.includes(interval)),
    [subjects, interval],
  );

  // ---- Success panel (child created) ----------------------------------------
  if (state?.ok) {
    return (
      <div className="card child-created">
        <p className="form-ok">{strings.done}</p>
        {state.childUniqueId ? (
          <div className="child-created-idbox">
            <span className="child-created-idlabel">{strings.idLabel}</span>
            <span className="child-created-id">{state.childUniqueId}</span>
          </div>
        ) : (
          <p className="muted">{strings.idPending}</p>
        )}
        <p className="child-created-note">{strings.bypassNote}</p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onClose}>
            {strings.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="card"
      style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h3>{strings.title}</h3>
      <p className="muted child-bypass-intro">{strings.intro}</p>

      {/* Parent picker: client-side text filter above a plain select. */}
      <div className="field">
        <span>{strings.parent}</span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={strings.parentFilter}
          autoComplete="off"
          aria-label={strings.parentFilter}
        />
        <select name="parent_profile_id" required defaultValue="">
          <option value="" disabled>
            {strings.parentChoose}
          </option>
          {filteredParents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{strings.firstName}</span>
          <input name="first_name" required maxLength={80} autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.lastName}</span>
          <input name="last_name" required maxLength={80} autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.password}</span>
          <PasswordInput
            name="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            strings={{ show: strings.showPassword, hide: strings.hidePassword }}
          />
          <small className="muted">{strings.passwordHint}</small>
        </label>
        <label className="field">
          <span>{strings.grade}</span>
          <select name="grade_id" defaultValue="">
            <option value="">{strings.gradeNone}</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Grant free access (payment bypass) — default ON. */}
      <input type="hidden" name="grant_access" value={grant ? "true" : "false"} />
      <label className="checkbox-chip child-grant-toggle">
        <input
          type="checkbox"
          checked={grant}
          onChange={(e) => setGrant(e.target.checked)}
        />
        <span>{strings.grant}</span>
      </label>
      <p className="muted child-grant-help">{strings.grantHelp}</p>

      {grant && (
        <div className="child-grant-fields">
          <div className="form-grid">
            <label className="field">
              <span>{strings.interval}</span>
              <select
                name="interval"
                value={interval}
                onChange={(e) =>
                  setInterval(e.target.value as "week" | "month" | "year")
                }
              >
                <option value="week">{strings.intervalWeek}</option>
                <option value="month">{strings.intervalMonth}</option>
                <option value="year">{strings.intervalYear}</option>
              </select>
            </label>
            <label className="field">
              <span>{strings.days}</span>
              <input
                type="number"
                name="days"
                min={1}
                max={730}
                step={1}
                placeholder="—"
              />
              <small className="muted">{strings.daysHelp}</small>
            </label>
          </div>

          <div className="field">
            <span>{strings.subjects}</span>
            {intervalSubjects.length === 0 ? (
              <p className="muted">{strings.subjectsNone}</p>
            ) : (
              <div className="checkbox-row" role="group" aria-label={strings.subjects}>
                {intervalSubjects.map((s) => (
                  <label className="checkbox-chip" key={s.id}>
                    <input type="checkbox" name="subject" value={s.id} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? strings.submitting : strings.submit}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {strings.cancel}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
      </div>
    </form>
  );
}
