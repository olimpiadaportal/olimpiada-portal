"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveQuestion, type QuestionState } from "@/lib/admin/questions";
import type { QuestionTypeRule } from "@/lib/admin/question-options";
import { typeRuleSummary } from "@/lib/admin/type-rules";
import { localeNames, locales } from "@/i18n/config";

type Opt = { value: string; label: string };
type Options = Record<string, Opt[]>;
type Defaults = {
  meta: Record<string, string | null>;
  primary_locale: string;
  body: string;
  prompt: string;
  explanation: string;
  options: { text: string; is_correct: boolean }[];
};

const META: { name: string; key: string; required?: boolean }[] = [
  { name: "subject_id", key: "qfield.subject", required: true },
  { name: "grade_id", key: "qfield.grade", required: true },
  { name: "type_id", key: "qfield.type", required: true },
  { name: "topic_id", key: "qfield.topic" },
  { name: "subtopic_id", key: "qfield.subtopic" },
  { name: "olympiad_type_id", key: "qfield.olympiad" },
  { name: "source_id", key: "qfield.source" },
];

type OptRow = { text: string; correct: boolean };

// Resize the option rows to an exact count (fixed-structure types): keep
// existing texts, pad with empty rows, truncate extras.
function resizeOpts(rows: OptRow[], n: number): OptRow[] {
  if (rows.length === n) return rows;
  if (rows.length > n) return rows.slice(0, n);
  return [
    ...rows,
    ...Array.from({ length: n - rows.length }, () => ({
      text: "",
      correct: false,
    })),
  ];
}

export function QuestionForm({
  dict,
  options,
  typeRules,
  defaults,
  id,
  submitLabel,
  stay,
  onSaved,
}: {
  dict: Record<string, string>;
  options: Options;
  // Maps each question type id → its stable `code` + structure rules (status,
  // options_required, correct_required) so the editor can restrict NEW
  // questions to active types, render a fixed option count, and show the
  // per-type rules line — all from the same config saveQuestion enforces.
  typeRules: Record<string, QuestionTypeRule>;
  defaults?: Defaults;
  id?: string;
  submitLabel: string;
  // Embedded (modal) mode: saveQuestion returns { ok } instead of redirecting;
  // `onSaved` fires so the host can close the modal and refresh the list.
  stay?: boolean;
  onSaved?: () => void;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<QuestionState, FormData>(
    saveQuestion,
    null,
  );

  // Notify the host exactly once per successful stay-mode save (ref keeps the
  // effect from re-firing when only the callback identity changes).
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (state?.ok) onSavedRef.current?.();
  }, [state]);

  const initialTypeId = (defaults?.meta?.type_id ?? "") as string;

  // All inputs are controlled so values PERSIST across a validation error
  // (React resets uncontrolled form fields after a form action).
  const [meta, setMeta] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of META) init[m.name] = (defaults?.meta?.[m.name] ?? "") as string;
    return init;
  });
  const [lang, setLang] = useState(defaults?.primary_locale ?? "az");
  const [body, setBody] = useState(defaults?.body ?? "");
  const [prompt, setPrompt] = useState(defaults?.prompt ?? "");
  const [explanation, setExplanation] = useState(defaults?.explanation ?? "");
  const [opts, setOpts] = useState<OptRow[]>(() => {
    const initial: OptRow[] =
      defaults?.options?.map((o) => ({ text: o.text, correct: o.is_correct })) ?? [
        { text: "", correct: false },
        { text: "", correct: false },
      ];
    // A fixed-structure type (options_required set) always shows exactly that
    // many rows — including legacy questions saved before the rule existed.
    const req = typeRules[initialTypeId]?.options_required;
    return req != null ? resizeOpts(initial, req) : initial;
  });

  // The chosen type's structure rules drive the option editor.
  const rule = typeRules[meta.type_id ?? ""];
  const typeCode = rule?.code ?? "";
  const isTrueFalse = typeCode === "true_false";
  const fixedCount = rule?.options_required ?? null;
  // Exactly-one-correct types behave like radios: checking one unchecks the
  // rest. (single_choice/true_false keep this even without the config column.)
  const exclusiveCorrect =
    rule?.correct_required === 1 ||
    typeCode === "single_choice" ||
    isTrueFalse;

  // The rules line under the type select, built from the config values
  // ("5 answer options, 1 correct answer" style).
  const rulesLine = rule ? typeRuleSummary(tt, rule) : "";

  // An existing question may carry a type that has since been deactivated: it
  // stays visible but LOCKED (muted hint below). New questions only ever see
  // active types in the select.
  const currentTypeInactive = Boolean(
    id && initialTypeId && typeRules[initialTypeId] &&
      typeRules[initialTypeId].status !== "active",
  );
  const typeOptions = (options.type_id ?? []).filter(
    (o) => typeRules[o.value]?.status === "active" || o.value === initialTypeId,
  );

  const optionHint = isTrueFalse
    ? tt("qhint.trueFalse")
    : typeCode === "single_choice"
      ? tt("qhint.single")
      : typeCode === "multiple_choice"
        ? tt("qhint.multiple")
        : "";

  function markCorrect(i: number, checked: boolean) {
    setOpts((p) =>
      p.map((x, idx) =>
        idx === i
          ? { ...x, correct: checked }
          : exclusiveCorrect && checked
            ? { ...x, correct: false }
            : x,
      ),
    );
  }

  // Apply a newly selected type's structure: True/False seeds its fixed
  // locale-labelled pair; fixed-count types resize to exactly N rows.
  function applyTypeStructure(typeId: string) {
    const next = typeRules[typeId];
    if (next?.code === "true_false") {
      setOpts((p) => {
        const base = p.length === 2 && p[0].text && p[1].text
          ? p
          : [
              { text: tt("qopt.true"), correct: p[0]?.correct ?? false },
              { text: tt("qopt.false"), correct: p[1]?.correct ?? false },
            ];
        return next.options_required != null
          ? resizeOpts(base, next.options_required)
          : base;
      });
      return;
    }
    if (next?.options_required != null) {
      setOpts((p) => resizeOpts(p, next.options_required as number));
    }
  }

  return (
    <form action={action} className="form">
      {id && <input type="hidden" name="__id" value={id} />}
      {stay && <input type="hidden" name="__stay" value="1" />}

      <h3>{tt("qsection.metadata")}</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {tt("qfield.language")}
            <span className="req"> *</span>
          </span>
          <select
            name="primary_locale"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeNames[l]}
              </option>
            ))}
          </select>
        </label>

        {META.map((m) => (
          <label className="field" key={m.name}>
            <span className="field-label">
              {tt(m.key)}
              {m.required && <span className="req"> *</span>}
            </span>
            {m.name === "type_id" && currentTypeInactive && (
              // The locked select would not post a value — submit the current
              // type explicitly so edits keep it unchanged.
              <input type="hidden" name="type_id" value={initialTypeId} />
            )}
            <select
              name={m.name === "type_id" && currentTypeInactive ? undefined : m.name}
              required={m.required}
              disabled={m.name === "type_id" && currentTypeInactive}
              value={meta[m.name] ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setMeta((p) => ({ ...p, [m.name]: value }));
                if (m.name === "type_id") applyTypeStructure(value);
              }}
            >
              <option value="">{tt("manage.select")}</option>
              {(m.name === "type_id" ? typeOptions : options[m.name] ?? []).map(
                (o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ),
              )}
            </select>
            {m.name === "type_id" && rulesLine && (
              <span className="hint">{rulesLine}</span>
            )}
            {m.name === "type_id" && currentTypeInactive && (
              <span className="hint muted">{tt("qform.typeLocked")}</span>
            )}
          </label>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>{tt("qsection.contentAz")}</h3>
      <p className="hint">{tt("qform.localesNote")}</p>
      <label className="field">
        <span className="field-label">
          {tt("qfield.bodyAz")}
          <span className="req"> *</span>
        </span>
        <textarea
          name="body"
          rows={3}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">{tt("qfield.promptAz")}</span>
        <textarea
          name="prompt"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">{tt("qfield.explanationAz")}</span>
        <textarea
          name="explanation"
          rows={2}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />
      </label>

      <h3 style={{ marginTop: 18 }}>{tt("qsection.options")}</h3>
      {optionHint && <p className="hint">{optionHint}</p>}
      <input type="hidden" name="opt_count" value={opts.length} />
      <div className="options-editor">
        {opts.map((o, i) => (
          <div className="option-row" key={i}>
            <input
              type="text"
              name={`opt.${i}.text`}
              value={o.text}
              placeholder={tt("qopt.text")}
              readOnly={isTrueFalse}
              onChange={(e) =>
                setOpts((p) =>
                  p.map((x, idx) =>
                    idx === i ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
            />
            <label className="option-correct">
              <input
                type="checkbox"
                name={`opt.${i}.correct`}
                checked={o.correct}
                onChange={(e) => markCorrect(i, e.target.checked)}
              />
              {tt("qopt.correct")}
            </label>
            {fixedCount == null && !isTrueFalse && (
              <button
                type="button"
                className="link-danger"
                onClick={() => setOpts((p) => p.filter((_, idx) => idx !== i))}
              >
                {tt("qopt.remove")}
              </button>
            )}
          </div>
        ))}
      </div>
      {fixedCount == null && !isTrueFalse && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            setOpts((p) =>
              p.length >= 10 ? p : [...p, { text: "", correct: false }],
            )
          }
        >
          {tt("qopt.add")}
        </button>
      )}

      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("qform.saving") : submitLabel}
      </button>
    </form>
  );
}
