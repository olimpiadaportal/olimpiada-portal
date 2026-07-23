"use client";

// New-Package workspace (Round 34): the package fields AND every selected
// grade's MANDATORY question upload live in ONE form and submit to ONE server
// action — a package can never be created while any selected grade lacks a
// valid pool. The olympiad type is chosen here too ("Other" creates a new
// type inline); grades are a multi-select; each selected grade gets its own
// file slot with live client-side validation (UX only — the server action +
// SECURITY DEFINER RPC stay the authority).
import { useActionState, useRef, useState } from "react";
import {
  createOlympiadPackageWithQuestions,
  type OlympiadCreateState,
} from "@/lib/admin/olympiad";
import { ActionButton } from "@/components/ActionButton";
import { DateTimeLocalField } from "@/components/DateTimeLocalField";
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

type FileState = {
  fileName: string;
  fileError: string;
  rowIssues: RowIssue[];
  itemCount: number;
};

const EMPTY_FILE: FileState = { fileName: "", fileError: "", rowIssues: [], itemCount: 0 };

export function OlympiadCreateForm({
  dict,
  subjects,
  grades,
  olympiadTypes,
  typeNames,
  typeRules,
  submitLabel,
}: {
  dict: Record<string, string>;
  subjects: Opt[];
  grades: Opt[];
  /** Existing olympiad types for the mandatory type select. */
  olympiadTypes: Opt[];
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
    olympiad_type_id: "",
    olympiad_type_other: "",
    price: "0",
    status: "inactive",
    duration: "25",
  });
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(() => new Set());
  const [tr, setTr] = useState<Record<string, { title: string; desc: string }>>(() => {
    const o: Record<string, { title: string; desc: string }> = {};
    for (const l of locales) o[l] = { title: "", desc: "" };
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Per-grade file state (client pre-validation mirror). File inputs are
  // uncontrolled; deselecting a grade clears its slot via the ref map.
  const [files, setFiles] = useState<Record<string, FileState>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function toggleGrade(id: string) {
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setFiles((p) => {
          const q = { ...p };
          delete q[id];
          return q;
        });
        const input = inputRefs.current[id];
        if (input) input.value = "";
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function onFileChange(gradeId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setFiles((p) => ({ ...p, [gradeId]: EMPTY_FILE }));
      return;
    }
    const next: FileState = { ...EMPTY_FILE, fileName: file.name };
    const parsed = await parseBulkFile(file, tt);
    if ("error" in parsed) {
      next.fileError = parsed.error;
    } else {
      next.rowIssues = validateBulkRowsClient(parsed.items, tt, typeRules, "olympiad");
      next.itemCount = parsed.items.length;
    }
    setFiles((p) => ({ ...p, [gradeId]: next }));
  }

  function onTemplate() {
    const subj = subjects.find((o) => o.value === f.subject_id)?.label ?? "";
    // Template rows carry NO subject/grade meta — the server injects the
    // package's subject and each slot's grade — so only the subject shows in
    // the filename; the SAME template serves every grade slot.
    downloadBulkTemplate(`olympiad-questions-${slugLabel(subj)}.json`, "olympiad");
  }

  const typeChosen =
    f.olympiad_type_id !== "" &&
    (f.olympiad_type_id !== "__other" || f.olympiad_type_other.trim() !== "");
  const targetsChosen = f.subject_id !== "" && selectedGrades.size > 0 && typeChosen;

  // A grade slot is READY when its file parsed cleanly with ≥1 row and no
  // invalid rows. Creation requires EVERY selected grade to be ready.
  const gradeState = (id: string): "missing" | "invalid" | "ready" => {
    const fs = files[id];
    if (!fs || !fs.fileName) return "missing";
    if (fs.fileError || fs.rowIssues.length > 0 || fs.itemCount === 0) return "invalid";
    return "ready";
  };
  const allReady =
    selectedGrades.size > 0 &&
    Array.from(selectedGrades).every((id) => gradeState(id) === "ready");
  const canSubmit = !pending && targetsChosen && allReady;

  const codesHint = tt("bulk.codesHint").replace(
    "{types}",
    typeNames.join(", ") || "—",
  );

  const orderedSelected = grades.filter((g) => selectedGrades.has(g.value));

  return (
    <form action={action} className="form">
      {/* ---- Mandatory olympiad type (first field; "Other" adds a new one) --- */}
      <label className="field">
        <span className="field-label">{tt("oly2.type")} *</span>
        <select
          name="olympiad_type_id"
          value={f.olympiad_type_id}
          required
          onChange={(e) => set("olympiad_type_id", e.target.value)}
        >
          <option value="">{tt("manage.select")}</option>
          {olympiadTypes.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          <option value="__other">{tt("oly2.typeOther")}</option>
        </select>
      </label>
      {f.olympiad_type_id === "__other" && (
        <label className="field">
          <span className="field-label">{tt("oly2.typeOtherLabel")} *</span>
          <input
            name="olympiad_type_other"
            value={f.olympiad_type_other}
            maxLength={120}
            required
            placeholder={tt("oly2.typeOtherPh")}
            onChange={(e) => set("olympiad_type_other", e.target.value)}
          />
        </label>
      )}

      <label className="field">
        <span className="field-label">{tt("oly2.subject")} *</span>
        <select name="subject_id" value={f.subject_id} required onChange={(e) => set("subject_id", e.target.value)}>
          <option value="">{tt("manage.select")}</option>
          {subjects.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>

      {/* ---- Multi-grade selection (each grade owns its pool below) --------- */}
      <div className="field">
        <span className="field-label">{tt("oly2.grades")} *</span>
        <span className="hint">{tt("oly2.gradesHint")}</span>
        <div className="oly-grade-grid">
          {grades.map((g) => (
            <label key={g.value} className="oly-grade-check">
              <input
                type="checkbox"
                name="grade_ids"
                value={g.value}
                checked={selectedGrades.has(g.value)}
                onChange={() => toggleGrade(g.value)}
              />
              <span>{g.label}</span>
            </label>
          ))}
        </div>
      </div>

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
      {/* Planned event date + public sale window — hidden-ISO convention
          documented in lib/admin/datetime.ts (shared DateTimeLocalField). */}
      <DateTimeLocalField
        name="event_starts_at"
        label={tt("oly2.eventAt")}
        clearLabel={tt("oly2.eventClear")}
        hint={tt("oly2.eventAtHint")}
      />
      <DateTimeLocalField
        name="sale_starts_at"
        label={tt("oly2.saleStart")}
        clearLabel={tt("oly2.eventClear")}
      />
      <DateTimeLocalField
        name="sale_ends_at"
        label={tt("oly2.saleEnd")}
        clearLabel={tt("oly2.eventClear")}
        hint={tt("oly2.saleHint")}
      />
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

      {/* ---- Per-grade question pools (all mandatory) --------------------- */}
      <div style={{ marginTop: 16 }}>
        <h3>{tt("oly2.pool")} *</h3>
        <p className="muted">{tt("oly2.perGradeNote")}</p>
        <p className="hint">{tt("oly2.err.creationOnly")}</p>
        <p className="hint">{tt("olybulk.fromPackage")}</p>
        {selectedGrades.size === 0 && <p className="hint">{tt("olybulk.pickFirst")}</p>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn-ghost"
            type="button"
            onClick={onTemplate}
            disabled={pending || f.subject_id === ""}
          >
            {tt("bulk.template")}
          </button>
        </div>

        {orderedSelected.map((g) => {
          const fs = files[g.value] ?? EMPTY_FILE;
          const stateKind = gradeState(g.value);
          const invalidRows = new Set(fs.rowIssues.map((r) => r.row)).size;
          return (
            <div key={g.value} className="oly-grade-pool">
              <label className="field" style={{ marginTop: 8 }}>
                <span className="field-label">
                  {tt("oly2.gradePool").replace("{grade}", g.label)}
                  <span className="req"> *</span>{" "}
                  {stateKind === "ready" && (
                    <span className="pill pill-sm pill-ok">
                      {tt("oly2.gradeReady").replace("{n}", String(fs.itemCount))}
                    </span>
                  )}
                  {stateKind === "invalid" && (
                    <span className="pill pill-sm pill-warn">
                      {fs.fileError ||
                        tt("oly2.gradeInvalid").replace("{n}", String(invalidRows || fs.itemCount))}
                    </span>
                  )}
                  {stateKind === "missing" && (
                    <span className="pill pill-sm">{tt("oly2.gradeMissing")}</span>
                  )}
                </span>
                <input
                  ref={(el) => {
                    inputRefs.current[g.value] = el;
                  }}
                  type="file"
                  name={`file_${g.value}`}
                  accept="application/json,.json"
                  required
                  disabled={pending}
                  onChange={(e) => void onFileChange(g.value, e)}
                />
              </label>
              {fs.fileName !== "" && <p className="hint">{fs.fileName}</p>}
              {fs.fileError !== "" && <p className="form-error">{fs.fileError}</p>}
              {fs.rowIssues.length > 0 && (
                <div className="bulk-issues" role="alert">
                  <span className="bulk-issues-title">{tt("bulk.fileProblems")}</span>{" "}
                  — {tt("bulk.fixFile")}
                  <ul>
                    {fs.rowIssues.map((is, i) => (
                      <li key={i}>
                        {tt("bulk.row")} {is.row}: {is.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        <p className="hint">{tt("bulk.fileHint")}</p>
        {/* v3: five A–E options / exactly one correct (was 4 pre-055). */}
        <p className="hint">{tt("bulk.fiveRule")}</p>
        <p className="hint">{tt("olybulk.optionalMeta")}</p>
        <p className="hint">{codesHint}</p>
        {!allReady && selectedGrades.size > 0 && (
          <p className="hint">{tt("oly2.err.needQuestions")}</p>
        )}
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

      <ActionButton pending={pending} pendingLabel={tt("manage.saving")} disabled={!canSubmit}>
        {submitLabel}
      </ActionButton>
    </form>
  );
}
