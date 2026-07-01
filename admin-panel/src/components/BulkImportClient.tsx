"use client";

import { useActionState } from "react";
import { bulkImportQuestions, type BulkImportState } from "@/lib/admin/questions";

// A self-documenting example matching our normalized trilingual import format.
const TEMPLATE = [
  {
    primary_locale: "az",
    meta: {
      subject: "Riyaziyyat",
      grade_level: 5,
      type: "Single choice",
      olympiad_type: "School",
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
      source: "Nümunə",
    },
    translations: {
      az: { body: "2 + 2 = ?", prompt: "Düzgün cavabı seçin", explanation: "2 + 2 = 4" },
      en: { body: "2 + 2 = ?", prompt: "Choose the correct answer" },
      ru: { body: "2 + 2 = ?", prompt: "Выберите правильный ответ" },
    },
    options: [
      { is_correct: true, order_index: 0, text: { az: "4", en: "4", ru: "4" } },
      { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
      { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
    ],
  },
];

export function BulkImportClient({ dict }: { dict: Record<string, string> }) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<BulkImportState, FormData>(
    bulkImportQuestions,
    null,
  );

  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(TEMPLATE, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions-template.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card">
      <form action={action} className="form">
        <label className="field">
          <span className="field-label">{tt("bulk.fileLabel")}</span>
          <input type="file" name="file" accept="application/json,.json" required />
        </label>
        <p className="hint">{tt("bulk.fileHint")}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? tt("bulk.submitting") : tt("bulk.submit")}
          </button>
          <button className="btn-ghost" type="button" onClick={downloadTemplate}>
            {tt("bulk.template")}
          </button>
        </div>
      </form>

      {state?.error && <p className="form-error">{state.error}</p>}

      {state?.ok && state.result && (
        <div style={{ marginTop: 16 }}>
          <h3>{tt("bulk.resultTitle")}</h3>
          <p>
            {tt("bulk.total")}: <b>{state.result.total}</b> · {tt("bulk.successful")}:{" "}
            <b>{state.result.successful}</b> · {tt("bulk.failed")}:{" "}
            <b>{state.result.failed}</b>
          </p>
          {state.result.errors.length > 0 ? (
            <ul className="muted">
              {state.result.errors.map((er, i) => (
                <li key={i}>
                  {tt("bulk.row")} {er.index}: {er.error}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tt("bulk.noErrors")}</p>
          )}
        </div>
      )}
    </section>
  );
}
