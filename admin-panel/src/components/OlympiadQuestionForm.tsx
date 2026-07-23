"use client";

// Trilingual editor for ONE olympiad-package pool question (Round 21 item 2).
// Differences vs the general QuestionForm:
//   * subject/grade are FIXED from the package (display-only);
//   * NO term/Rüb field (pool questions never join daily rounds);
//   * topic/subtopic are OPTIONAL and olympiad-scoped;
//   * content is TRILINGUAL via locale tabs — az required, en/ru optional but
//     complete (body + all 5 options) when provided;
//   * the optional question image uses the same deferred one-submission
//     staging pipeline as the general create modal (server verifies, sniffs,
//     moves and links it atomically with the question — also on EDIT).
// The FormData is built programmatically from state so every locale posts even
// when its tab is not mounted.
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  saveOlympiadPackageQuestion,
  type OlympiadQuestionState,
  type OlympiadPoolQuestionData,
} from "@/lib/admin/olympiad";
import { locales, localeNames, type Locale } from "@/i18n/config";

export type OlympiadPoolTopic = { id: string; name: string };
export type OlympiadPoolSubtopic = { id: string; topic_id: string; name: string };

const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;
const OPTION_COUNT = 5;

// Deferred-image constraints (server-side byte-sniff is authoritative).
const IMG_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const IMG_MAX = 5 * 1024 * 1024;
const BUCKET = "question-media";

// crypto.randomUUID() only exists in secure contexts (https / localhost); LAN
// IP access falls back gracefully.
function uniqueId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type LocaleDraft = {
  body: string;
  prompt: string;
  explanation: string;
  options: string[];
};

function emptyDraft(): LocaleDraft {
  return { body: "", prompt: "", explanation: "", options: ["", "", "", "", ""] };
}

function draftsFromDefaults(
  defaults?: OlympiadPoolQuestionData,
): Record<Locale, LocaleDraft> {
  const out = {} as Record<Locale, LocaleDraft>;
  for (const loc of locales) {
    const c = defaults?.content?.[loc];
    const options = (c?.options ?? []).slice(0, OPTION_COUNT);
    while (options.length < OPTION_COUNT) options.push("");
    out[loc] = {
      body: c?.body ?? "",
      prompt: c?.prompt ?? "",
      explanation: c?.explanation ?? "",
      options,
    };
  }
  return out;
}

export function OlympiadQuestionForm({
  dict,
  packageId,
  questionId,
  subjectName,
  packageGrades,
  defaultGradeId,
  topics,
  subtopics,
  defaults,
  onSaved,
  onBusyChange,
}: {
  dict: Record<string, string>;
  packageId: string;
  questionId?: string; // present = edit mode
  subjectName: string; // display-only (the server takes it from the package)
  /** Round 34: the package's target grades — the question belongs to ONE. */
  packageGrades: { value: string; label: string }[];
  defaultGradeId?: string;
  topics: OlympiadPoolTopic[]; // olympiad-scoped, already subject/grade-filtered
  subtopics: OlympiadPoolSubtopic[];
  defaults?: OlympiadPoolQuestionData;
  onSaved?: () => void;
  // Lets the host Modal block dismissal while a save/upload is in flight.
  onBusyChange?: (busy: boolean) => void;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<OlympiadQuestionState, FormData>(
    saveOlympiadPackageQuestion,
    null,
  );

  // Notify the host exactly once per successful save.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (state?.ok) onSavedRef.current?.();
  }, [state]);

  const [tab, setTab] = useState<Locale>("az");
  const [drafts, setDrafts] = useState<Record<Locale, LocaleDraft>>(() =>
    draftsFromDefaults(defaults),
  );
  const [correct, setCorrect] = useState<number>(defaults?.correct ?? -1);
  const [topic, setTopic] = useState(defaults?.topicId ?? "");
  const [gradeId, setGradeId] = useState(
    defaultGradeId ?? (packageGrades.length === 1 ? packageGrades[0].value : ""),
  );
  const [subtopic, setSubtopic] = useState(defaults?.subtopicId ?? "");
  const [localError, setLocalError] = useState("");

  const subtopicsForTopic = subtopics.filter((st) => st.topic_id === topic);

  function patchDraft(loc: Locale, patch: Partial<LocaleDraft>) {
    setDrafts((p) => ({ ...p, [loc]: { ...p[loc], ...patch } }));
  }
  function patchOption(loc: Locale, i: number, value: string) {
    setDrafts((p) => ({
      ...p,
      [loc]: {
        ...p[loc],
        options: p[loc].options.map((x, idx) => (idx === i ? value : x)),
      },
    }));
  }

  // ---- Deferred image (create AND edit) -------------------------------------
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [imgError, setImgError] = useState("");
  const [uploading, setUploading] = useState(false);
  // Edit mode: the admin can mark the CURRENT image for removal (applied on save).
  const [removeCurrent, setRemoveCurrent] = useState(false);
  // A staged upload we can reuse when the server action fails validation and
  // the admin retries with the SAME file (no duplicate upload).
  const stagedRef = useRef<{ key: string; path: string } | null>(null);
  const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    setImgError("");
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;
    if (!IMG_MIME_EXT[f.type] || f.size > IMG_MAX) {
      setImgError(tt("olyq.img.invalid"));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setImage(f);
    setPreview(URL.createObjectURL(f));
  }

  function removeStagedBestEffort(path: string) {
    try {
      void createClient().storage.from(BUCKET).remove([path]);
    } catch {
      // ignore — orphaned staging objects are harmless
    }
  }

  function removeNewImage() {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview("");
    setImgError("");
    if (stagedRef.current) {
      removeStagedBestEffort(stagedRef.current.path);
      stagedRef.current = null;
    }
  }

  async function uploadStaged(f: File): Promise<string | null> {
    const supabase = createClient();
    const path = `staging/${uniqueId()}.${IMG_MIME_EXT[f.type]}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, f, { upsert: false, contentType: f.type });
    return error ? null : path;
  }

  // ---- Client pre-validation (server re-validates everything) ---------------
  // Returns the locale tab to switch to on failure, so the admin sees the gap.
  function validate(): { error: string; tab?: Locale } | null {
    const az = drafts.az;
    if (!az.body.trim()) return { error: tt("olyq.err.azBody"), tab: "az" };
    if (az.options.some((x) => !x.trim())) {
      return { error: tt("olyq.err.fiveOptions"), tab: "az" };
    }
    for (const loc of locales) {
      if (loc === "az") continue;
      const d = drafts[loc];
      const active =
        d.body.trim() ||
        d.prompt.trim() ||
        d.explanation.trim() ||
        d.options.some((x) => x.trim());
      if (active && (!d.body.trim() || d.options.some((x) => !x.trim()))) {
        return {
          error: tt("olyq.err.localeIncomplete").replace("{lang}", localeNames[loc]),
          tab: loc,
        };
      }
    }
    if (correct < 0 || correct >= OPTION_COUNT) {
      return { error: tt("olyq.err.oneCorrect") };
    }
    return null;
  }

  // ---- One-submission save ---------------------------------------------------
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError("");
    const invalid = validate();
    if (invalid) {
      if (invalid.tab) setTab(invalid.tab);
      setLocalError(invalid.error);
      return;
    }

    const fd = new FormData();
    fd.set("__package_id", packageId);
    if (questionId) fd.set("__id", questionId);
    fd.set("grade_id", gradeId);
    fd.set("topic_id", topic);
    fd.set("subtopic_id", topic ? subtopic : "");
    fd.set("correct", String(correct));
    for (const loc of locales) {
      const d = drafts[loc];
      fd.set(`body_${loc}`, d.body);
      fd.set(`prompt_${loc}`, d.prompt);
      fd.set(`explanation_${loc}`, d.explanation);
      for (let i = 0; i < OPTION_COUNT; i++) fd.set(`opt_${loc}_${i}`, d.options[i]);
    }

    if (image) {
      const key = fileKey(image);
      if (stagedRef.current?.key !== key) {
        setUploading(true);
        try {
          const path = await uploadStaged(image);
          if (!path) {
            setImgError(tt("olyq.img.uploadFailed"));
            return;
          }
          if (stagedRef.current) removeStagedBestEffort(stagedRef.current.path);
          stagedRef.current = { key, path };
        } finally {
          setUploading(false);
        }
      }
      fd.set("media_path", stagedRef.current.path);
    } else if (removeCurrent && defaults?.imageUrl) {
      fd.set("media_remove", "1");
    }

    startTransition(() => {
      action(fd);
    });
  }

  const busy = pending || uploading;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  useEffect(() => {
    onBusyChangeRef.current?.(busy);
  }, [busy]);

  const d = drafts[tab];
  const currentImageVisible = Boolean(defaults?.imageUrl) && !image;

  return (
    <form onSubmit={handleSubmit} className="form">
      {/* Fixed package context — the server takes subject/grade from the
          package row, never from the client. */}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">{tt("olyq.subject")}</span>
          <input type="text" value={subjectName} readOnly disabled />
        </label>
        <label className="field">
          <span className="field-label">{tt("olyq.grade")} *</span>
          {packageGrades.length === 1 ? (
            <input type="text" value={packageGrades[0]?.label ?? ""} readOnly disabled />
          ) : (
            <select value={gradeId} required onChange={(e) => setGradeId(e.target.value)}>
              <option value="">{tt("manage.select")}</option>
              {packageGrades.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </label>
        <label className="field">
          <span className="field-label">{tt("olyq.topic")}</span>
          <select
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setSubtopic("");
            }}
          >
            <option value="">{tt("olyq.none")}</option>
            {topics.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
          {topics.length === 0 && <span className="hint">{tt("olyq.noTopics")}</span>}
        </label>
        <label className="field">
          <span className="field-label">{tt("olyq.subtopic")}</span>
          <select
            value={subtopic}
            disabled={!topic}
            onChange={(e) => setSubtopic(e.target.value)}
          >
            <option value="">{tt("olyq.none")}</option>
            {subtopicsForTopic.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">{tt("olyq.fixedNote")}</p>

      {/* Locale tabs — az required; en/ru optional. A filled language shows a
          check so the admin sees translation coverage at a glance. */}
      <div className="row-actions" style={{ marginTop: 12 }}>
        {locales.map((loc) => (
          <button
            key={loc}
            type="button"
            className={tab === loc ? "btn" : "btn-ghost"}
            onClick={() => setTab(loc)}
            disabled={busy}
          >
            {localeNames[loc]}
            {drafts[loc].body.trim() ? " ✓" : ""}
          </button>
        ))}
      </div>
      <p className="hint">{tt("olyq.trilingualNote")}</p>

      <label className="field">
        <span className="field-label">
          {tt("olyq.body")} ({localeNames[tab]}){tab === "az" && <span className="req"> *</span>}
        </span>
        <textarea
          rows={3}
          value={d.body}
          onChange={(e) => patchDraft(tab, { body: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">
          {tt("olyq.prompt")} ({localeNames[tab]})
        </span>
        <textarea
          rows={2}
          value={d.prompt}
          onChange={(e) => patchDraft(tab, { prompt: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">
          {tt("olyq.explanation")} ({localeNames[tab]})
        </span>
        <textarea
          rows={2}
          value={d.explanation}
          onChange={(e) => patchDraft(tab, { explanation: e.target.value })}
        />
      </label>

      {/* Question image — deferred one-submission staging (create AND edit). */}
      <div className="field">
        <span className="field-label">{tt("olyq.img.title")}</span>
        {image && preview ? (
          <div className="media-current">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="media-preview" />
            <button
              type="button"
              className="link-danger"
              onClick={removeNewImage}
              disabled={busy}
            >
              {tt("olyq.img.remove")}
            </button>
          </div>
        ) : currentImageVisible && !removeCurrent ? (
          <div className="media-current">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={defaults!.imageUrl!} alt="" className="media-preview" />
            <button
              type="button"
              className="link-danger"
              onClick={() => setRemoveCurrent(true)}
              disabled={busy}
            >
              {tt("olyq.img.remove")}
            </button>
          </div>
        ) : currentImageVisible && removeCurrent ? (
          <p className="hint">
            {tt("olyq.img.willRemove")}{" "}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setRemoveCurrent(false)}
              disabled={busy}
            >
              {tt("olyq.img.undo")}
            </button>
          </p>
        ) : null}
        <label className="btn-ghost media-upload">
          {image || (currentImageVisible && !removeCurrent)
            ? tt("olyq.img.replace")
            : tt("olyq.img.choose")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={pickImage}
            disabled={busy}
            hidden
          />
        </label>
        <p className="hint">{tt("olyq.img.hint")}</p>
        {imgError && <p className="form-error">{imgError}</p>}
      </div>

      <h3 style={{ marginTop: 18 }}>{tt("olyq.options")}</h3>
      <p className="hint">{tt("olyq.correctHint")}</p>
      <div className="options-editor">
        {OPTION_LETTERS.map((letter, i) => (
          <div className="option-row" key={letter}>
            <span className="option-letter">{letter}</span>
            <input
              type="text"
              value={d.options[i]}
              placeholder={`${letter} (${localeNames[tab]})`}
              onChange={(e) => patchOption(tab, i, e.target.value)}
            />
            <label className="option-correct">
              <input
                type="radio"
                name="correct_ui"
                value={i}
                checked={correct === i}
                onChange={() => setCorrect(i)}
              />
              {tt("olyq.correct")}
            </label>
          </div>
        ))}
      </div>

      {(localError || state?.error) && (
        <p className="form-error">{localError || state?.error}</p>
      )}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? tt("olyq.saving") : tt("olyq.save")}
      </button>
    </form>
  );
}
