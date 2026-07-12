"use client";

// New-Package workspace: the package fields AND the (mandatory) question bulk
// upload live in ONE form and submit to ONE server action, so a package can
// never be created with zero questions. Subject/Grade are chosen once in the
// package fields; the imported rows inherit them server-side (the bulk section
// has no selectors of its own). Template download + file upload stay disabled
// until Subject and Grade are picked. Client-side row validation mirrors the
// server (UX only — the server action + SECURITY DEFINER RPC stay the
// authority).
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createOlympiadPackageWithQuestions,
  type OlympiadCreateState,
} from "@/lib/admin/olympiad";
import { localeNames, locales, type Locale } from "@/i18n/config";
import {
  downloadBulkTemplate,
  parseBulkFile,
  validateBulkRowsClient,
  type ClientTypeRule,
  type RowIssue,
} from "@/lib/bulk-client";

type Opt = { value: string; label: string };

// Safe ascii-ish slug for the template filename (mirrors the server's code
// slug so "Riyaziyyat" → "riyaziyyat").
const AZ_MAP: Record<string, string> = {
  ə: "e", ö: "o", ü: "u", ğ: "g", ı: "i", ç: "c", ş: "s",
};
function slugLabel(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[əöügıçş]/g, (c) => AZ_MAP[c] ?? c)
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "olympiad"
  );
}

export function OlympiadCreateForm({
  dict,
  subjects,
  grades,
  typeNames,
  typeRules,
  submitLabel,
}: {
  dict: Record<string, string>;
  subjects: Opt[];
  grades: Opt[];
  typeNames: string[];
  typeRules: ClientTypeRule[];
  submitLabel: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<OlympiadCreateState, FormData>(
    createOlympiadPackageWithQuestions,
    null,
  );

  const [f, setF] = useState({
    subject_id: "",
    grade_id: "",
    price: "0",
    status: "inactive",
    duration: "25",
  });
  const [tr, setTr] = useState<Record<string, { title: string; desc: string }>>(() => {
    const o: Record<string, { title: string; desc: string }> = {};
    for (const l of locales) o[l] = { title: "", desc: "" };
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Optional planned event date/time — same hidden-ISO pattern as OlympiadForm.
  const [eventIso, setEventIso] = useState("");
  const [eventLocal, setEventLocal] = useState("");
  const onEvent = (v: string) => {
    setEventLocal(v);
    const d = v ? new Date(v) : null;
    setEventIso(d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
  };

  // ---- Bulk file state (client pre-validation mirror) ---------------------
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [rowIssues, setRowIssues] = useState<RowIssue[]>([]);
  const [itemCount, setItemCount] = useState(0);

  const targetsChosen = f.subject_id !== "" && f.grade_id !== "";
  // Partial success = the package ALREADY exists: block a re-submit (it would
  // create a duplicate) and steer the admin to the edit page instead.
  const created = Boolean(state?.ok && state.packageId);

  function resetFileState() {
    setFileName("");
    setFileError("");
    setRowIssues([]);
    setItemCount(0);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetFileState();
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const parsed = await parseBulkFile(file, tt);
    if ("error" in parsed) {
      setFileError(parsed.error);
      return;
    }
    setRowIssues(validateBulkRowsClient(parsed.items, tt, typeRules));
    setItemCount(parsed.items.length);
  }

  function onTemplate() {
    const subj = subjects.find((o) => o.value === f.subject_id)?.label ?? "";
    const grade = grades.find((o) => o.value === f.grade_id)?.label ?? "";
    // Template rows carry NO subject/grade meta — the server injects the
    // package's values — so the selection is reflected in the filename.
    downloadBulkTemplate(
      `olympiad-questions-${slugLabel(subj)}-${slugLabel(grade)}.json`,
    );
  }

  const invalidRows = new Set(rowIssues.map((r) => r.row)).size;
  const fileReady =
    fileName !== "" && fileError === "" && rowIssues.length === 0 && itemCount > 0;
  const canSubmit = !pending && targetsChosen && fileReady && !created;

  const codesHint = tt("bulk.codesHint").replace(
    "{types}",
    typeNames.join(", ") || "—",
  );

  return (
    <form action={action} className="form">
      <label className="field">
        <span className="field-label">{tt("oly2.subject")} *</span>
        <select name="subject_id" value={f.subject_id} required onChange={(e) => set("subject_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {subjects.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.grade")} *</span>
        <select name="grade_id" value={f.grade_id} required onChange={(e) => set("grade_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {grades.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.price")}</span>
        <input name="price_amount" type="number" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.duration")} *</span>
        <input
          name="duration_minutes"
          type="number"
          min={5}
          max={240}
          step={1}
          required
          value={f.duration}
          onChange={(e) => set("duration", e.target.value)}
        />
        <span className="hint">{tt("oly2.durationHelp")}</span>
      </label>
      <label className="field">
        <span className="field-label">{tt("oly2.statusLabel")}</span>
        <select name="status" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="inactive">{tt("oly2.status.inactive")}</option>
          <option value="active">{tt("oly2.status.active")}</option>
          <option value="archived">{tt("oly2.status.archived")}</option>
        </select>
      </label>
      <div className="field">
        <span className="field-label">{tt("oly2.eventAt")}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="datetime-local"
            value={eventLocal}
            onChange={(e) => onEvent(e.target.value)}
          />
          {eventLocal !== "" && (
            <button type="button" className="btn-ghost" onClick={() => onEvent("")}>
              {tt("oly2.eventClear")}
            </button>
          )}
        </div>
        <p className="hint">{tt("oly2.eventAtHint")}</p>
        <input type="hidden" name="event_starts_at" value={eventIso} />
      </div>
      {locales.map((l) => (
        <div key={l} style={{ marginTop: 12 }}>
          <h3>
            {localeNames[l as Locale]}
            {l === "az" && <span className="req"> *</span>}
          </h3>
          <label className="field">
            <span className="field-label">{tt("oly2.title")}</span>
            <input name={`title_${l}`} value={tr[l].title} onChange={(e) => setTr((p) => ({ ...p, [l]: { ...p[l], title: e.target.value } }))} />
          </label>
          <label className="field">
            <span className="field-label">{tt("oly2.desc")}</span>
            <textarea name={`desc_${l}`} rows={3} value={tr[l].desc} onChange={(e) => setTr((p) => ({ ...p, [l]: { ...p[l], desc: e.target.value } }))} />
          </label>
        </div>
      ))}

      {/* ---- Mandatory question upload (inline, always visible) ---------- */}
      <div style={{ marginTop: 16 }}>
        <h3>{tt("oly2.pool")} *</h3>
        <p className="muted">{tt("olybulk.note")}</p>
        <p className="hint">{tt("olybulk.fromPackage")}</p>
        {!targetsChosen && <p className="hint">{tt("olybulk.pickFirst")}</p>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn-ghost"
            type="button"
            onClick={onTemplate}
            disabled={pending || !targetsChosen}
          >
            {tt("bulk.template")}
          </button>
        </div>

        <label className="field" style={{ marginTop: 8 }}>
          <span className="field-label">
            {tt("bulk.fileLabel")}
            <span className="req"> *</span>
          </span>
          <input
            type="file"
            name="file"
            accept="application/json,.json"
            required
            disabled={pending || !targetsChosen || created}
            onChange={onFileChange}
          />
        </label>
        {fileName !== "" && <p className="hint">{fileName}</p>}
        {fileError !== "" && <p className="form-error">{fileError}</p>}
        {fileName !== "" && fileError === "" && itemCount > 0 && (
          <p className="hint">
            {tt("bulk.itemsFound").replace("{n}", String(itemCount))}{" "}
            {tt("bulk.rowsSummary")
              .replace("{n}", String(itemCount - invalidRows))
              .replace("{m}", String(invalidRows))}
          </p>
        )}

        {rowIssues.length > 0 && (
          <div className="bulk-issues" role="alert">
            <span className="bulk-issues-title">{tt("bulk.fileProblems")}</span>{" "}
            — {tt("bulk.fixFile")}
            <ul>
              {rowIssues.map((is, i) => (
                <li key={i}>
                  {tt("bulk.row")} {is.row}: {is.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="hint">{tt("bulk.fileHint")}</p>
        <p className="hint">{tt("bulk.mcqRule")}</p>
        <p className="hint">{codesHint}</p>
        {!fileReady && <p className="hint">{tt("oly2.err.needQuestions")}</p>}
      </div>

      {state?.error && (
        <div>
          <p className="form-error">{state.error}</p>
          {state.result && state.result.errors.length > 0 && (
            <ul className="muted">
              {state.result.errors.map((er, i) => (
                <li key={i}>
                  {tt("bulk.row")} {er.index}: {er.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state?.ok && state.result && state.packageId && (
        <div className="form-ok" role="status">
          <p>
            {tt("oly2.createdPartial")
              .replace("{n}", String(state.result.successful))
              .replace("{m}", String(state.result.failed))}
          </p>
          {state.result.errors.length > 0 && (
            <ul className="muted">
              {state.result.errors.map((er, i) => (
                <li key={i}>
                  {tt("bulk.row")} {er.index}: {er.error}
                </li>
              ))}
            </ul>
          )}
          <Link className="btn-ghost" href={`/olympiad/${state.packageId}/edit`}>
            {tt("oly2.goEdit")}
          </Link>
        </div>
      )}

      {!created && (
        <button className="btn" type="submit" disabled={!canSubmit}>
          {pending ? tt("manage.saving") : submitLabel}
        </button>
      )}
    </form>
  );
}
