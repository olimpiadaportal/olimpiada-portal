"use client";

// The Free Trial activation flow: hero -> picker -> summary -> confirm -> success.
//
// Dictionary-driven. Every string arrives already translated from the server
// component, so this file holds no i18n and no business rule — the cap it
// enforces is a UX affordance, and the database enforces the real one
// (`ck_free_trial_subjects` plus a guard inside `activate_free_trial`). A
// hand-crafted POST that skips this component still cannot produce a third
// subject or a second trial.
import { useActionState, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { FreeTrialCountdown } from "@/components/FreeTrialCountdown";
import { FreeTrialSubjectCard } from "@/components/FreeTrialSubjectCard";
import { activateFreeTrialAction, type ActivateTrialState } from "@/lib/auth/freeTrialActions";
import { TRIAL_MAX_SUBJECTS } from "@/lib/freeTrialShared";

export type PickableSubject = { id: string; name: string };

type Dict = Record<string, string>;

type Props = {
  studentId: string;
  childName: string;
  subjects: PickableSubject[];
  /** Pre-formatted "ends at" preview for the summary, computed server-side. */
  endsAtPreview: string;
  d: Dict;
};

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v),
    template,
  );
}

export function FreeTrialActivation({
  studentId,
  childName,
  subjects,
  endsAtPreview,
  d,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<ActivateTrialState, FormData>(
    activateFreeTrialAction,
    {},
  );

  const atCap = selected.length >= TRIAL_MAX_SUBJECTS;
  const chosen = useMemo(
    () => subjects.filter((s) => selected.includes(s.id)),
    [subjects, selected],
  );

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= TRIAL_MAX_SUBJECTS
          ? prev
          : [...prev, id],
    );
  }

  // ---- SUCCESS ------------------------------------------------------------
  if (state.ok) {
    return (
      <section className="ftrial-done" aria-live="polite">
        <div className="ftrial-done-mark" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12.5l5 5L20 6.5"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="ftrial-done-title">{d["trial.done.title"]}</h2>
        <p className="ftrial-done-body">{fill(d["trial.done.body"], { child: childName })}</p>
        <ul className="ftrial-done-list">
          {chosen.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
        <p className="ftrial-status-endsin">
          <span>{d["trial.status.endsIn"]}</span>{" "}
          <FreeTrialCountdown
            endsAt={state.endsAt}
            units={{ h: d["trial.time.h"], m: d["trial.time.m"], s: d["trial.time.s"] }}
            endedLabel={d["trial.expired.title"]}
          />
        </p>
        <p className="ftrial-note">{d["trial.note.unrated"]}</p>
        <a className="btn btn-primary" href="/dashboard">
          {d["trial.done.next"]}
        </a>
      </section>
    );
  }

  // ---- PICKER -------------------------------------------------------------
  return (
    <section className="ftrial">
      <div className="ftrial-hero">
        <div className="ftrial-hero-head">
          <h2 className="ftrial-hero-title">{d["trial.hero.title"]}</h2>
          <span className="ftrial-hero-pill">{d["trial.hero.duration"]}</span>
        </div>
        <p className="ftrial-hero-body">{d["trial.hero.body"]}</p>
        <ul className="ftrial-hero-points">
          <li>{d["trial.hero.p1"]}</li>
          <li>{d["trial.hero.p2"]}</li>
          <li>{d["trial.hero.p3"]}</li>
          <li>{d["trial.hero.p4"]}</li>
        </ul>
      </div>

      <form
        action={formAction}
        onSubmit={(e) => {
          // The confirm sheet is the gate; a direct submit (Enter key) must not
          // bypass it.
          if (!confirming) {
            e.preventDefault();
            if (selected.length > 0) setConfirming(true);
          }
        }}
      >
        <input type="hidden" name="student_id" value={studentId} />
        {selected.map((id) => (
          <input key={id} type="hidden" name="subject_id" value={id} />
        ))}

        <h3 className="ftrial-pick-title">{d["trial.pick.title"]}</h3>
        <p className="ftrial-pick-hint">{d["trial.pick.hint"]}</p>

        <div className="ftrial-grid">
          {subjects.map((s) => (
            <FreeTrialSubjectCard
              key={s.id}
              id={s.id}
              name={s.name}
              selected={selected.includes(s.id)}
              locked={atCap}
              busy={pending}
              lockReason={d["trial.pick.locked"]}
              selectLabel={fill(d["trial.pick.aria.select"], { subject: s.name })}
              selectedLabel={fill(d["trial.pick.aria.selected"], { subject: s.name })}
              selectedChip={d["trial.pick.selected"]}
              onToggle={toggle}
            />
          ))}
        </div>

        {/* The cap explained where everyone can see it — a `title` attribute is
            invisible on touch, and the spec asks for a visible refusal. */}
        <p className="ftrial-caphint" aria-live="polite">
          {atCap ? d["trial.pick.done"] : d["trial.pick.cap"]}
        </p>

        {selected.length > 0 ? (
          <div className="ftrial-summary">
            <h4 className="ftrial-summary-title">{d["trial.summary.title"]}</h4>
            <ul className="ftrial-summary-list">
              {chosen.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ul>
            <p className="ftrial-summary-meta">
              <span>{fill(d["trial.summary.count"], { n: String(selected.length) })}</span>
              <span>{fill(d["trial.summary.endsAt"], { when: endsAtPreview })}</span>
            </p>
          </div>
        ) : null}

        {state.error ? <p className="form-error">{state.error}</p> : null}

        <button
          type="submit"
          className="btn btn-primary ftrial-submit"
          disabled={selected.length === 0 || pending}
        >
          {pending ? d["trial.cta.pending"] : d["trial.cta.activate"]}
        </button>

        <Modal
          isOpen={confirming}
          onClose={() => setConfirming(false)}
          title={d["trial.confirm.title"]}
        >
          <p className="modal-message">
            {fill(d["trial.confirm.body"], { child: childName })}
          </p>
          <ul className="ftrial-summary-list">
            {chosen.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
          <p className="ftrial-summary-meta">
            {fill(d["trial.summary.endsAt"], { when: endsAtPreview })}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {d["trial.confirm.cancel"]}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? d["trial.cta.pending"] : d["trial.confirm.ok"]}
            </button>
          </div>
        </Modal>
      </form>
    </section>
  );
}
