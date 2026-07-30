"use client";

import { useActionState } from "react";
import { saveRow, type SaveState } from "@/lib/admin/actions";
import type { ResourceField } from "@/lib/admin/resources";
import { ActionButton } from "@/components/ActionButton";

// Generic create/edit form for the allowlisted registry resources.
// Round 52: the `termByTopic` escape hatch (a read-only Rüb derived from the
// selected parent topic) was removed together with the topics/subtopics
// resources — that behaviour now lives in the Curriculum Structure screen's own
// SubtopicForm, where the term is derived by the DB. Nothing left in the
// registry needs a field to depend on another field's value.

type Options = Record<string, { value: string; label: string }[]>;

function FieldInput({
  field,
  options,
  value,
  selectPlaceholder,
}: {
  field: ResourceField;
  options?: { value: string; label: string }[];
  value: unknown;
  selectPlaceholder: string;
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
}: {
  slug: string;
  fields: ResourceField[];
  optionsByField: Options;
  defaultValues?: Record<string, unknown>;
  id?: string;
  submitLabel: string;
  savingLabel: string;
  selectPlaceholder: string;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    saveRow,
    null,
  );

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
            <FieldInput
              field={f}
              options={optionsByField[f.name]}
              value={defaultValues?.[f.name]}
              selectPlaceholder={selectPlaceholder}
            />
          </label>
        ))}
      </div>

      {state?.error && <p className="form-error">{state.error}</p>}

      <ActionButton className="btn" pending={pending} pendingLabel={savingLabel}>
        {submitLabel}
      </ActionButton>
    </form>
  );
}
