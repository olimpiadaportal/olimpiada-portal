"use client";

// Topic create/edit form (Curriculum Structure modals).
//
// Stay-mode: saveTopic returns { ok: true } instead of redirecting, so the host
// tree closes the modal, refreshes in place and raises a toast.
//
// Inline validation runs on submit AND clears per-field as the admin types; it
// is UX only — saveTopic re-validates everything server-side (the two error
// vocabularies are deliberately the same so a server rejection lands on the
// same field the client would have flagged).
//
// TERM is an editable select here (a topic OWNS its term) — unlike the subtopic
// form, where it is inherited. Editing an existing topic shows the cascade
// warning because trg_topic_term_cascade rewrites the term on every subtopic
// AND every question under the topic.
import { useActionState, useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ActionButton";
import { saveTopic, type CurriculumSaveState } from "@/lib/admin/curriculum";
import {
  CURRICULUM_STATUSES,
  NAME_MAX,
  TERM_VALUES,
  normalizeName,
  type GradeItem,
  type SubjectItem,
} from "@/lib/admin/curriculum-shared";

export type TopicFormValues = {
  id?: string;
  subjectId?: string;
  gradeId?: string | null;
  name?: string;
  term?: number | null;
  status?: string;
};

type FieldErrors = { name?: string; subject?: string; term?: string };

function mapServerError(
  code: string | undefined,
  l: (k: string) => string,
): { message: string; field?: keyof FieldErrors } | null {
  if (!code) return null;
  if (code === "missing.name") return { message: l("cur.errName"), field: "name" };
  if (code === "too.long") return { message: l("cur.errTooLong"), field: "name" };
  if (code === "missing.subject")
    return { message: l("cur.errSubject"), field: "subject" };
  if (code === "missing.term") return { message: l("cur.errTerm"), field: "term" };
  if (code === "duplicate")
    return { message: l("cur.errDuplicateTopic"), field: "name" };
  return { message: l("cur.errGeneric") };
}

export function TopicForm({
  values,
  subjects,
  grades,
  l,
  onSaved,
}: {
  values: TopicFormValues;
  subjects: SubjectItem[];
  grades: GradeItem[];
  l: (key: string) => string;
  onSaved: (isEdit: boolean) => void;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction, pending] = useActionState<
    CurriculumSaveState,
    FormData
  >(saveTopic, null);

  const [name, setName] = useState(values.name ?? "");
  const [subjectId, setSubjectId] = useState(values.subjectId ?? "");
  const [term, setTerm] = useState(values.term == null ? "" : String(values.term));
  const [errors, setErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) onSaved(isEdit);
  }, [state, onSaved, isEdit]);

  const server = mapServerError(state?.error, l);

  // A server rejection that maps to a field re-flags it (e.g. the duplicate
  // check, which the client cannot run).
  const errorFor = (field: keyof FieldErrors): string | undefined =>
    errors[field] ?? (server?.field === field ? server.message : undefined);

  function validate(e: React.FormEvent<HTMLFormElement>) {
    const next: FieldErrors = {};
    if (!normalizeName(name)) next.name = l("cur.errName");
    else if (normalizeName(name).length > NAME_MAX)
      next.name = l("cur.errTooLong");
    if (!subjectId) next.subject = l("cur.errSubject");
    if (!term) next.term = l("cur.errTerm");
    setErrors(next);
    if (Object.keys(next).length > 0) {
      e.preventDefault();
      if (next.name) nameRef.current?.focus();
    }
  }

  // Keep an inactive-but-assigned subject selectable when editing an older row.
  const subjectOptions = subjects.filter(
    (s) => s.status === "active" || s.id === values.subjectId,
  );

  return (
    <form action={formAction} className="form" onSubmit={validate} noValidate>
      {values.id && <input type="hidden" name="__id" value={values.id} />}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {l("cur.fSubject")}
            <span className="req"> *</span>
          </span>
          <select
            name="subject_id"
            value={subjectId}
            aria-invalid={errorFor("subject") ? true : undefined}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setErrors((x) => ({ ...x, subject: undefined }));
            }}
          >
            <option value="">{l("manage.select")}</option>
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errorFor("subject") && (
            <span className="cur-field-error">{errorFor("subject")}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">{l("cur.fGrade")}</span>
          <select name="grade_id" defaultValue={values.gradeId ?? ""}>
            <option value="">{l("cur.gradeNone")}</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field cur-field-wide">
          <span className="field-label">
            {l("cur.fName")}
            <span className="req"> *</span>
          </span>
          <input
            ref={nameRef}
            type="text"
            name="name"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            aria-invalid={errorFor("name") ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((x) => ({ ...x, name: undefined }));
            }}
          />
          {errorFor("name") && (
            <span className="cur-field-error">{errorFor("name")}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">
            {l("cur.fTerm")}
            <span className="req"> *</span>
          </span>
          <select
            name="term"
            value={term}
            aria-invalid={errorFor("term") ? true : undefined}
            onChange={(e) => {
              setTerm(e.target.value);
              setErrors((x) => ({ ...x, term: undefined }));
            }}
          >
            <option value="">{l("manage.select")}</option>
            {TERM_VALUES.map((n) => (
              <option key={n} value={String(n)}>
                {l(`term.${n}`)}
              </option>
            ))}
          </select>
          {errorFor("term") && (
            <span className="cur-field-error">{errorFor("term")}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">{l("cur.fStatus")}</span>
          <select name="status" defaultValue={values.status ?? "active"}>
            {CURRICULUM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {l(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isEdit && <p className="cur-form-note">{l("cur.termCascadeWarn")}</p>}

      {server && !server.field && <p className="form-error">{server.message}</p>}

      <ActionButton
        className="btn"
        pending={pending}
        pendingLabel={l("manage.saving")}
      >
        {isEdit ? l("action.save") : l("action.create")}
      </ActionButton>
    </form>
  );
}
