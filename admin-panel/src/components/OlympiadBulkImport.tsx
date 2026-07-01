"use client";

import { useActionState } from "react";
import {
  bulkImportOlympiadQuestions,
  type OlympiadBulkState,
} from "@/lib/admin/olympiad";

// PRIVATE per-package import format. Same trilingual shape as the general
// question import, but every question is scoped to this package (the subject is
// taken from the package itself, so `meta.subject` is optional here).
const TEMPLATE = [
  {
    primary_locale: "az",
    meta: {
      grade_level: 5,
      type: "Single choice",
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
      source: "Olimpiada nümunəsi",
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

export function OlympiadBulkImport({
  packageId,
  dict,
}: {
  packageId: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<OlympiadBulkState, FormData>(
    bulkImportOlympiadQuestions,
    null,
  );

  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(TEMPLATE, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "olympiad-questions-template.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className="muted">{tt("olybulk.note")}</p>
      <form action={action} className="form">
        <input type="hidden" name="__id" value={packageId} />
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
    </div>
  );
}
