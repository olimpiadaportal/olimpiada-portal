"use client";

import { useActionState, useState } from "react";
import { saveQuestion, type QuestionState } from "@/lib/admin/questions";
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
  { name: "difficulty_id", key: "qfield.difficulty", required: true },
  { name: "topic_id", key: "qfield.topic" },
  { name: "subtopic_id", key: "qfield.subtopic" },
  { name: "olympiad_type_id", key: "qfield.olympiad" },
  { name: "source_id", key: "qfield.source" },
];

export function QuestionForm({
  dict,
  options,
  defaults,
  id,
  submitLabel,
}: {
  dict: Record<string, string>;
  options: Options;
  defaults?: Defaults;
  id?: string;
  submitLabel: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<QuestionState, FormData>(
    saveQuestion,
    null,
  );

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
  const [opts, setOpts] = useState<{ text: string; correct: boolean }[]>(
    defaults?.options?.map((o) => ({ text: o.text, correct: o.is_correct })) ?? [
      { text: "", correct: false },
      { text: "", correct: false },
    ],
  );

  return (
    <form action={action} className="form">
      {id && <input type="hidden" name="__id" value={id} />}

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
            <select
              name={m.name}
              required={m.required}
              value={meta[m.name] ?? ""}
              onChange={(e) =>
                setMeta((p) => ({ ...p, [m.name]: e.target.value }))
              }
            >
              <option value="">{tt("manage.select")}</option>
              {(options[m.name] ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
      <input type="hidden" name="opt_count" value={opts.length} />
      <div className="options-editor">
        {opts.map((o, i) => (
          <div className="option-row" key={i}>
            <input
              type="text"
              name={`opt.${i}.text`}
              value={o.text}
              placeholder={tt("qopt.text")}
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
                onChange={(e) =>
                  setOpts((p) =>
                    p.map((x, idx) =>
                      idx === i ? { ...x, correct: e.target.checked } : x,
                    ),
                  )
                }
              />
              {tt("qopt.correct")}
            </label>
            <button
              type="button"
              className="link-danger"
              onClick={() => setOpts((p) => p.filter((_, idx) => idx !== i))}
            >
              {tt("qopt.remove")}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpts((p) => [...p, { text: "", correct: false }])}
      >
        {tt("qopt.add")}
      </button>

      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("qform.saving") : submitLabel}
      </button>
    </form>
  );
}
