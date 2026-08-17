"use client";

// New-Package workspace (Round 34): the package fields AND every selected
// grade's MANDATORY question upload live in ONE form and submit to ONE server
// action — a package can never be created while any selected grade lacks a
// valid pool. The olympiad type is chosen here too ("Other" creates a new
// type inline); grades are a multi-select; each selected grade gets its own
// file slot with live client-side validation (UX only — the server action +
// SECURITY DEFINER RPC stay the authority).
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  createOlympiadPackageWithQuestions,
  type OlympiadCreateState,
} from "@/lib/admin/olympiad";
import { ActionButton } from "@/components/ActionButton";
import { DateTimeLocalField } from "@/components/DateTimeLocalField";
import { OlympiadCycleSummary } from "@/components/OlympiadCycleSummary";
import { OlympiadJsonFormat } from "@/components/OlympiadJsonFormat";
import { localeNames, locales, type Locale } from "@/i18n/config";
import {
  downloadBulkTemplate,
  validateBulkRowsClient,
  type ClientTypeRule,
  type RowIssue,
} from "@/lib/bulk-client";
import {
  PER_ATTEMPT_DEFAULT,
  PER_ATTEMPT_MAX,
  PER_ATTEMPT_MIN,
  parsePerAttempt,
  poolMeetsPerAttempt,
} from "@/lib/admin/olympiad-per-attempt";
import { discardUploadedMedia } from "@/lib/bulk-upload-media";
import { makeZipRefChecker } from "@/lib/zip-bulk";
// The parse + media phase are the SAME ones the two single-file surfaces run
// (lib/useBulkFilePicker.ts); only the per-grade bookkeeping lives here.
import {
  EMPTY_BULK_PICK,
  jsonImportFile,
  parseBulkPick,
  runBulkMediaPhase,
  type BulkPickState,
} from "@/lib/useBulkFilePicker";

type Opt = { value: string; label: string };
/** A grade option carries its level so the summary can name it per locale. */
type GradeOpt = Opt & { level: number };

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

/** One grade slot: the shared pick state plus the row issues this form renders
 *  under each slot. `items`/`zip` are what the MIXED media phase consumes. */
type FileState = BulkPickState & { rowIssues: RowIssue[] };

const EMPTY_FILE: FileState = { ...EMPTY_BULK_PICK, rowIssues: [] };

export function OlympiadCreateForm({
  dict,
  locale,
  subjects,
  grades,
  olympiadTypes,
  typeNames,
  typeRules,
  submitLabel,
}: {
  dict: Record<string, string>;
  locale: Locale;
  subjects: Opt[];
  grades: GradeOpt[];
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
    perAttempt: String(PER_ATTEMPT_DEFAULT),
  });
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(() => new Set());
  // Migration 106 — per-grade overrides, keyed by grade id.
  //
  // Deliberately EMPTY until the admin types something: an empty field posts
  // nothing and the server inherits the package value. Seeding these with the
  // package default instead would freeze whatever the default happened to be
  // when the grade was ticked, so later editing the default above would
  // silently not apply — the exact surprise "leave empty to inherit" avoids.
  const [perGrade, setPerGrade] = useState<Record<string, { q: string; d: string }>>({});
  const setPG = (id: string, k: "q" | "d", v: string) =>
    setPerGrade((p) => ({ ...p, [id]: { ...(p[id] ?? { q: "", d: "" }), [k]: v } }));
  const [tr, setTr] = useState<Record<string, { title: string; desc: string }>>(() => {
    const o: Record<string, { title: string; desc: string }> = {};
    for (const l of locales) o[l] = { title: "", desc: "" };
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Per-grade file state (client pre-validation mirror). File inputs are
  // uncontrolled; deselecting a grade clears its slot via the ref map.
  const [files, setFiles] = useState<Record<string, FileState>>({});
  // Round 53 — ONE mandatory import type for the whole package. No default:
  // defaulting to "text" would import a mixed file with every image silently
  // dropped and still look successful. The grade slots stay hidden until it is
  // chosen, so there is no partially-usable state to misread.
  const [questionMode, setQuestionMode] = useState<"" | "text" | "mixed">("");
  const modeChosen = questionMode !== "";
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Separate from the action's `pending` so the button can say "uploading
  // images" during the part that happens BEFORE the action is dispatched —
  // otherwise a large mixed batch looks frozen.
  const [uploading, setUploading] = useState(false);

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
        // Drop its per-grade config too, or a re-tick would resurrect values
        // the admin never sees (the inputs only render for selected grades).
        setPerGrade((p) => {
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

  // Switching the import type clears EVERY grade's file and input. The two
  // modes accept different file types, so a .zip left in a slot would otherwise
  // be posted through the text-only path without a re-pick.
  useEffect(() => {
    setFiles({});
    for (const input of Object.values(inputRefs.current)) {
      if (input) input.value = "";
    }
  }, [questionMode]);

  async function onFileChange(gradeId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || questionMode === "") {
      setFiles((p) => ({ ...p, [gradeId]: EMPTY_FILE }));
      return;
    }
    const pick = await parseBulkPick(file, questionMode, tt);
    setFiles((p) => ({
      ...p,
      [gradeId]: {
        ...pick,
        rowIssues:
          pick.items.length === 0
            ? []
            : validateBulkRowsClient(pick.items, tt, typeRules, "olympiad", null, {
                mixed: questionMode === "mixed",
                zipHas: pick.zip ? makeZipRefChecker(pick.zip) : undefined,
              }),
      },
    }));
  }

  function onTemplate() {
    const subj = subjects.find((o) => o.value === f.subject_id)?.label ?? "";
    // Template rows carry NO subject/grade meta — the server injects the
    // package's subject and each slot's grade — so only the subject shows in
    // the filename; the SAME template serves every grade slot.
    downloadBulkTemplate(
      `olympiad-questions-${slugLabel(subj)}-${questionMode || "text"}.${
        questionMode === "mixed" ? "zip" : "json"
      }`,
      "olympiad",
      questionMode === "mixed" ? "mixed" : "text",
    );
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
    if (
      fs.fileError ||
      fs.rowIssues.length > 0 ||
      fs.zipIssues.length > 0 ||
      fs.items.length === 0
    ) {
      return "invalid";
    }
    return "ready";
  };
  const allReady =
    selectedGrades.size > 0 &&
    Array.from(selectedGrades).every((id) => gradeState(id) === "ready");
  // Round 49: creating the package ACTIVE additionally requires every grade's
  // uploaded pool to be able to fill one attempt (server-enforced; mirrored
  // here so the admin sees the blocker before submitting).
  const perAttemptNum = parsePerAttempt(f.perAttempt);

  // Migration 106: the per-grade panel only appears for 2+ grades. With one
  // grade the single pair of fields above IS the configuration, so there is
  // nothing to override and no second set of inputs to explain.
  const multiGrade = selectedGrades.size > 1;

  /** The count that will actually apply to a grade: its own, else the package's. */
  const gradeCount = (id: string): number | null =>
    parsePerAttempt(perGrade[id]?.q ?? "") ?? perAttemptNum;

  /** Same for the clock. Returns null when the typed value is out of range. */
  const gradeDuration = (id: string): number | null => {
    const raw = (perGrade[id]?.d ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 5 && n <= 240 ? n : null;
  };

  // Every override the admin HAS typed must be valid — an unparseable one is
  // rejected server-side, so blocking here keeps the failure visible early.
  const overridesValid = Array.from(selectedGrades).every((id) => {
    const q = (perGrade[id]?.q ?? "").trim();
    const d = (perGrade[id]?.d ?? "").trim();
    return (q === "" || parsePerAttempt(q) !== null) && (d === "" || gradeDuration(id) !== null);
  });

  // Round 49 + 106: activating requires every grade's pool to fill one attempt
  // OF THAT GRADE'S SIZE — a 40-question grade and a 10-question grade have
  // different thresholds against the same package.
  const activeReady =
    f.status !== "active" ||
    Array.from(selectedGrades).every((id) => {
      const need = gradeCount(id);
      return need !== null && poolMeetsPerAttempt(files[id]?.items.length ?? 0, need);
    });
  const canSubmit =
    modeChosen &&
    !pending && !uploading && targetsChosen && allReady && perAttemptNum !== null &&
    overridesValid && activeReady;

  /**
   * MIXED submit: read each grade's images out of its ZIP, upload them, and
   * post the rewritten rows on the same per-grade `file_<gradeId>` fields the
   * server action already expects. Text-only returns immediately and the form
   * submits natively, byte-for-byte as before.
   *
   * The browser's own `required` validation on the file inputs runs BEFORE this
   * handler, so a missing file is still blocked without any help from here.
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (questionMode !== "mixed") return; // native submit
    e.preventDefault();
    const form = e.currentTarget;
    const ids = Array.from(selectedGrades);
    setUploading(true);

    // ONE batch for the whole submit: verifyImportImage confines the object to
    // imports/<batchId>/ and accepts any uuid filename, so per-grade batches
    // would buy nothing and complicate the cleanup below.
    const batchId = crypto.randomUUID();
    const rewritten: Record<string, unknown[]> = {};
    const uploadedPaths: string[] = [];

    // Sequential on purpose: the media phase already fans out four wide
    // internally, so running eleven grades at once would multiply timeouts
    // rather than finish sooner.
    for (const id of ids) {
      const fs = files[id];
      // Fail closed: without a parsed archive the original .zip would be posted
      // on the file field and the server would try to JSON.parse it.
      if (!fs?.zip) {
        setUploading(false);
        await discardUploadedMedia(uploadedPaths);
        return;
      }
      const phase = await runBulkMediaPhase(fs.items, fs.zip, tt, batchId);
      uploadedPaths.push(...phase.uploadedPaths);

      if (!phase.ok) {
        // All-or-nothing across grades, matching the rule that a bad file in
        // one grade blocks the whole creation: everything uploaded so far, for
        // every grade, is discarded before returning.
        setFiles((p) => ({
          ...p,
          [id]: { ...(p[id] ?? EMPTY_FILE), rowIssues: phase.issues },
        }));
        setUploading(false);
        await discardUploadedMedia(uploadedPaths);
        return;
      }
      rewritten[id] = phase.items;
    }
    setUploading(false);

    const fd = new FormData(form);
    for (const id of ids) {
      const items = rewritten[id];
      if (!items) continue;
      fd.set(`file_${id}`, jsonImportFile(items, files[id]?.fileName ?? ""));
    }
    startTransition(() => action(fd));
  }

  const codesHint = tt("bulk.codesHint").replace(
    "{types}",
    typeNames.join(", ") || "—",
  );

  const orderedSelected = grades.filter((g) => selectedGrades.has(g.value));

  return (
    <form action={action} onSubmit={handleSubmit} className="form">
      {/* ---- MANDATORY import type — before every other control ---------- */}
      <fieldset className="bulk-mode">
        <legend className="field-label">
          {tt("bulk.mode.label")}
          <span className="req"> *</span>
        </legend>
        <div className="bulk-mode-options">
          {(
            [
              { v: "text", label: "bulk.mode.text", hint: "bulk.mode.textHint" },
              { v: "mixed", label: "bulk.mode.mixed", hint: "bulk.mode.mixedHint" },
            ] as const
          ).map((o) => (
            <label
              key={o.v}
              className={`bulk-mode-opt${questionMode === o.v ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="question_mode"
                value={o.v}
                checked={questionMode === o.v}
                onChange={() => setQuestionMode(o.v)}
                disabled={pending}
              />
              <span className="bulk-mode-opt-body">
                <span className="bulk-mode-opt-title">{tt(o.label)}</span>
                <span className="hint">{tt(o.hint)}</span>
              </span>
            </label>
          ))}
        </div>
        {!modeChosen && <p className="hint">{tt("bulk.mode.required")}</p>}
        {questionMode === "mixed" && <p className="hint">{tt("bulk.mode.mixedNote")}</p>}
      </fieldset>

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
      {/* Round 49 — questions served per attempt. NOT the uploaded pool total
          (each grade's file count is shown in its slot and in the cycle
          summary below); min/max are UX only, the server action re-validates. */}
      <label className="field">
        <span className="field-label">{tt("oly2.perAttempt")} *</span>
        <input
          name="questions_per_attempt"
          type="number"
          min={PER_ATTEMPT_MIN}
          max={PER_ATTEMPT_MAX}
          step={1}
          required
          value={f.perAttempt}
          onChange={(e) => set("perAttempt", e.target.value)}
        />
        <span className="hint">{tt("oly2.perAttemptHelp")}</span>
        <span className="hint">{tt("oly2.perAttemptDistinct")}</span>
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

      {/* ---- Migration 106: per-grade question count + duration -------------
          Only for 2+ grades. Each row posts qpa_<gradeId> / dur_<gradeId>;
          an empty field posts "" and the server falls back to the package
          value above, which is what the hint promises. */}
      {multiGrade && (
        <div className="field">
          <span className="field-label">{tt("oly2.perGradeTitle")}</span>
          <span className="hint">{tt("oly2.perGradeDefaultNote")}</span>
          <span className="hint">{tt("oly2.perGradeCfgHint")}</span>
          <div className="oly-grade-cfg">
            {orderedSelected.map((g) => (
              <div key={g.value} className="oly-grade-cfg-row">
                <span className="oly-grade-cfg-name">{g.label}</span>
                <label className="oly-grade-cfg-field">
                  <span>{tt("oly2.perGradeCount")}</span>
                  <input
                    name={`qpa_${g.value}`}
                    type="number"
                    min={PER_ATTEMPT_MIN}
                    max={PER_ATTEMPT_MAX}
                    step={1}
                    inputMode="numeric"
                    placeholder={f.perAttempt}
                    value={perGrade[g.value]?.q ?? ""}
                    disabled={pending}
                    onChange={(e) => setPG(g.value, "q", e.target.value)}
                  />
                </label>
                <label className="oly-grade-cfg-field">
                  <span>{tt("oly2.perGradeDuration")}</span>
                  <input
                    name={`dur_${g.value}`}
                    type="number"
                    min={5}
                    max={240}
                    step={1}
                    inputMode="numeric"
                    placeholder={f.duration}
                    value={perGrade[g.value]?.d ?? ""}
                    disabled={pending}
                    onChange={(e) => setPG(g.value, "d", e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ---- Per-grade question pools (all mandatory) ---------------------
          Hidden until the import type is chosen: a greyed-out row of file
          inputs still reads as "the next step", while an absent one makes the
          single required action obvious. */}
      {modeChosen && (
      <div style={{ marginTop: 16 }}>
        <h3>{tt("oly2.pool")} *</h3>
        <p className="muted">{tt("oly2.perGradeNote")}</p>
        <p className="hint">{tt("oly2.poolAppendNote")}</p>
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
                      {tt("oly2.gradeReady").replace("{n}", String(fs.items.length))}
                    </span>
                  )}
                  {stateKind === "invalid" && (
                    <span className="pill pill-sm pill-warn">
                      {fs.fileError ||
                        tt("oly2.gradeInvalid").replace("{n}", String(invalidRows || fs.items.length))}
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
                  accept={
                    questionMode === "mixed"
                      ? ".zip,application/zip"
                      : "application/json,.json"
                  }
                  required
                  disabled={pending || uploading}
                  onChange={(e) => void onFileChange(g.value, e)}
                />
              </label>
              {/* The format for THIS grade, collapsed. Sits above the errors so
                  an admin fixing a rejected file sees the reference and the
                  problem together. */}
              <OlympiadJsonFormat
                gradeLabel={g.label}
                dict={dict}
                questionMode={questionMode === "mixed" ? "mixed" : "text"}
              />
              {fs.fileName !== "" && <p className="hint">{fs.fileName}</p>}
              {fs.fileError !== "" && <p className="form-error">{fs.fileError}</p>}
              {fs.zipIssues.length > 0 && (
                <div className="bulk-issues" role="alert">
                  <span className="bulk-issues-title">{tt("bulk.fileProblems")}</span>{" "}
                  — {tt("bulk.fixFile")}
                  <ul>
                    {fs.zipIssues.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
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

        {/* Live cycle summary — recomputed as files land and as the admin
            changes the per-attempt count above. */}
        <OlympiadCycleSummary
          dict={dict}
          locale={locale}
          perAttemptRaw={f.perAttempt}
          grades={orderedSelected.map((g) => ({
            key: g.value,
            name: g.label,
            level: g.level,
            pool: gradeState(g.value) === "ready" ? files[g.value]?.items.length ?? 0 : 0,
            // Migration 106: estimate each grade's cycle from ITS count.
            perAttemptRaw: perGrade[g.value]?.q ?? "",
          }))}
        />

        <p className="hint">
          {tt(questionMode === "mixed" ? "bulk.fileHintZip" : "bulk.fileHint")}
        </p>
        {questionMode === "mixed" && (
          <pre className="bulk-zip-layout">{tt("bulk.zipLayout")}</pre>
        )}
        {/* v3: five A–E options / exactly one correct (was 4 pre-055). */}
        <p className="hint">{tt("bulk.fiveRule")}</p>
        <p className="hint">{tt("bulk.explanationRule")}</p>
        <p className="hint">{tt("olybulk.optionalMeta")}</p>
        <p className="hint">{codesHint}</p>
        {!allReady && selectedGrades.size > 0 && (
          <p className="hint">{tt("oly2.err.needQuestions")}</p>
        )}
      </div>
      )}

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

      <ActionButton
        pending={pending || uploading}
        pendingLabel={tt(uploading ? "bulk.uploadingMedia" : "manage.saving")}
        disabled={!canSubmit}
      >
        {submitLabel}
      </ActionButton>
    </form>
  );
}
