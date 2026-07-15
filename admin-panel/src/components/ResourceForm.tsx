"use client";

import { useState } from "react";
import { useActionState } from "react";
import { saveRow, type SaveState } from "@/lib/admin/actions";
import type { ResourceField } from "@/lib/admin/resources";

type Options = Record<string, { value: string; label: string }[]>;

function FieldInput({
  field,
  options,
  value,
  selectPlaceholder,
  onReferenceChange,
}: {
  field: ResourceField;
  options?: { value: string; label: string }[];
  value: unknown;
  selectPlaceholder: string;
  // Lets the form observe reference selects (e.g. the subtopic form's parent
  // topic) without making every field controlled.
  onReferenceChange?: (name: string, value: string) => void;
}) {
  if (field.type === "boolean") {
    return (
      <input type="checkbox" name={field.name} defaultChecked={Boolean(value)} />
    );
  }
  if (field.type === "reference" || field.type === "select") {
    const opts = field.type === "reference" ? options ?? [] : field.options ?? [];
    return (
      <select
        name={field.name}
        defaultValue={value == null ? "" : String(value)}
        required={field.required}
        onChange={
          field.type === "reference" && onReferenceChange
            ? (e) => onReferenceChange(field.name, e.target.value)
            : undefined
        }
      >
        <option value="">{selectPlaceholder}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        name={field.name}
        step={field.step ?? "any"}
        defaultValue={value == null ? "" : String(value)}
        required={field.required}
      />
    );
  }
  return (
    <input
      type="text"
      name={field.name}
      defaultValue={value == null ? "" : String(value)}
      required={field.required}
    />
  );
}

export function ResourceForm({
  slug,
  fields,
  optionsByField,
  defaultValues,
  id,
  submitLabel,
  savingLabel,
  selectPlaceholder,
  termByTopic,
}: {
  slug: string;
  fields: ResourceField[];
  optionsByField: Options;
  defaultValues?: Record<string, unknown>;
  id?: string;
  submitLabel: string;
  savingLabel: string;
  selectPlaceholder: string;
  // Subtopics only: parent-topic id → its term (Rüb) or null. When provided,
  // the "term" field is NOT an editable select — it shows the term inherited
  // from the currently selected parent topic (read-only) and posts it via a
  // hidden input so the server payload always matches the parent.
  termByTopic?: Record<string, number | null>;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    saveRow,
    null,
  );
  const [topicSel, setTopicSel] = useState(
    defaultValues?.["topic_id"] == null ? "" : String(defaultValues["topic_id"]),
  );

  const termField = fields.find((f) => f.name === "term");
  const termLabelFor = (n: number): string =>
    termField?.options?.find((o) => o.value === String(n))?.label ?? String(n);
  const inheritedTerm: number | null =
    termByTopic && topicSel ? termByTopic[topicSel] ?? null : null;

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="__slug" value={slug} />
      {id && <input type="hidden" name="__id" value={id} />}

      <div className="form-grid">
        {fields.map((f) => (
          <label className="field" key={f.name}>
            <span className="field-label">
              {f.label}
              {f.required && <span className="req"> *</span>}
            </span>
            {f.name === "term" && termByTopic ? (
              <>
                {/* Inherited from the parent topic — read-only. */}
                <input type="hidden" name="term" value={inheritedTerm ?? ""} />
                <input
                  type="text"
                  value={inheritedTerm != null ? termLabelFor(inheritedTerm) : "—"}
                  readOnly
                  disabled
                />
              </>
            ) : (
              <FieldInput
                field={f}
                options={optionsByField[f.name]}
                value={defaultValues?.[f.name]}
                selectPlaceholder={selectPlaceholder}
                onReferenceChange={
                  termByTopic
                    ? (name, value) => {
                        if (name === "topic_id") setTopicSel(value);
                      }
                    : undefined
                }
              />
            )}
          </label>
        ))}
      </div>

      {state?.error && <p className="form-error">{state.error}</p>}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? savingLabel : submitLabel}
      </button>
    </form>
  );
}
