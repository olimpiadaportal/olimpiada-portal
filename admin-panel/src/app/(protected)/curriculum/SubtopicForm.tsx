"use client";

// Subtopic create/edit form (Curriculum Structure modals).
//
// TERM IS NOT AN INPUT. `trg_subtopic_term_guard` derives a subtopic's Rüb from
// its parent topic and rejects a mismatch, so the field is rendered read-only
// from the selected topic and saveSubtopic writes term = NULL to let the DB
// inherit it. That is also what makes MOVING a subtopic to a topic in another
// term work — writing the old term would be rejected by the guard.
//
// The parent-topic picker is narrowed by two throwaway selects (subject +
// grade) that never leave the browser: with 260 topics a flat <select> is
// unusable, and this keeps the whole picker in one round-trip-free component.
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "@/components/ActionButton";
import { saveSubtopic, type CurriculumSaveState } from "@/lib/admin/curriculum";
import {
  CURRICULUM_STATUSES,
  NAME_MAX,
  normalizeName,
  type GradeItem,
  type SubjectItem,
  type TopicOption,
} from "@/lib/admin/curriculum-shared";

export type SubtopicFormValues = {
  id?: string;
  topicId?: string;
  name?: string;
  status?: string;
};

type FieldErrors = { name?: string; topic?: string };

function mapServerError(
  code: string | undefined,
  l: (k: string) => string,
): { message: string; field?: keyof FieldErrors } | null {
  if (!code) return null;
  if (code === "missing.name") return { message: l("cur.errName"), field: "name" };
  if (code === "too.long") return { message: l("cur.errTooLong"), field: "name" };
  if (code === "missing.topic")
    return { message: l("cur.errTopic"), field: "topic" };
  if (code === "duplicate")
    return { message: l("cur.errDuplicateSubtopic"), field: "name" };
  return { message: l("cur.errGeneric") };
}

export function SubtopicForm({
  values,
  topics,
  subjects,
  grades,
  l,
  onSaved,
}: {
  values: SubtopicFormValues;
  /** Every exam-scoped topic (compact shape) — the picker source. */
  topics: TopicOption[];
  subjects: SubjectItem[];
  grades: GradeItem[];
  l: (key: string) => string;
  onSaved: (isEdit: boolean) => void;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction, pending] = useActionState<
    CurriculumSaveState,
    FormData
  >(saveSubtopic, null);

  const preselected = useMemo(
    () => topics.find((t) => t.id === values.topicId) ?? null,
    [topics, values.topicId],
  );

  const [topicId, setTopicId] = useState(values.topicId ?? "");
  const [subjectFilter, setSubjectFilter] = useState(preselected?.subjectId ?? "");
  const [gradeFilter, setGradeFilter] = useState(preselected?.gradeId ?? "");
  const [name, setName] = useState(values.name ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) onSaved(isEdit);
  }, [state, onSaved, isEdit]);

  const server = mapServerError(state?.error, l);
  const errorFor = (field: keyof FieldErrors): string | undefined =>
    errors[field] ?? (server?.field === field ? server.message : undefined);

  // Narrowed picker list. The currently selected topic is always kept in the
  // list so a filter change can never silently drop the admin's own choice.
  const visibleTopics = useMemo(() => {
    return topics.filter((t) => {
      if (t.id === topicId) return true;
      if (subjectFilter && t.subjectId !== subjectFilter) return false;
      if (gradeFilter && (t.gradeId ?? "") !== gradeFilter) return false;
      return true;
    });
  }, [topics, topicId, subjectFilter, gradeFilter]);

  const selectedTopic = topics.find((t) => t.id === topicId) ?? null;
  const inheritedTerm = selectedTopic?.term ?? null;

  const gradeName = (id: string | null): string =>
    (id ? grades.find((g) => g.id === id)?.name : undefined) ??
    l("cur.gradeShared");

  function validate(e: React.FormEvent<HTMLFormElement>) {
    const next: FieldErrors = {};
    if (!normalizeName(name)) next.name = l("cur.errName");
    else if (normalizeName(name).length > NAME_MAX)
      next.name = l("cur.errTooLong");
    if (!topicId) next.topic = l("cur.errTopic");
    setErrors(next);
    if (Object.keys(next).length > 0) {
      e.preventDefault();
      if (next.name) nameRef.current?.focus();
    }
  }

  return (
    <form action={formAction} className="form" onSubmit={validate} noValidate>
      {values.id && <input type="hidden" name="__id" value={values.id} />}

      <fieldset className="cur-picker">
        <legend className="cur-picker-legend">{l("cur.topicPickerFilter")}</legend>
        <div className="cur-picker-row">
          <select
            aria-label={l("cur.fSubject")}
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setGradeFilter("");
            }}
          >
            <option value="">{l("cur.allSubjects")}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label={l("cur.fGrade")}
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="">{l("cur.allGrades")}</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <div className="form-grid">
        <label className="field cur-field-wide">
          <span className="field-label">
            {l("cur.fTopic")}
            <span className="req"> *</span>
          </span>
          <select
            name="topic_id"
            value={topicId}
            aria-invalid={errorFor("topic") ? true : undefined}
            onChange={(e) => {
              setTopicId(e.target.value);
              setErrors((x) => ({ ...x, topic: undefined }));
            }}
          >
            <option value="">{l("manage.select")}</option>
            {visibleTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.name} — ${gradeName(t.gradeId)}${
                  t.term ? ` · ${l(`term.${t.term}`)}` : ""
                }`}
              </option>
            ))}
          </select>
          {visibleTopics.length === 0 && (
            <span className="cur-field-hint">{l("cur.noTopicsForSelection")}</span>
          )}
          {errorFor("topic") && (
            <span className="cur-field-error">{errorFor("topic")}</span>
          )}
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
          <span className="field-label">{l("cur.fTerm")}</span>
          {/* Read-only: derived from the parent topic by the DB. */}
          <input
            type="text"
            value={inheritedTerm ? l(`term.${inheritedTerm}`) : "—"}
            readOnly
            disabled
          />
          <span className="cur-field-hint">{l("cur.termInherited")}</span>
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
