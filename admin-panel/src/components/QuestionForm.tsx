"use client";

// Round 21 — question editor overhaul (owner-approved field order):
// language, subject, grade, topic, subtopic, rüb, body, image, options A–E
// (radio-picked single correct), status (read-only), save.
//   * No question-type / olympiad-type selects: saveQuestion resolves the type
//     server-side to single_choice; olympiad_type_id is untouched on edit.
//   * Topic AND subtopic are mandatory; they cascade from subject + grade.
//   * The selected topic's Rüb is shown read-only; a legacy topic (term NULL)
//     requires the admin to pick 1..4 — saveQuestion then upgrades the TOPIC
//     (the DB cascades it to its subtopics/questions).
//   * Exactly 5 fixed options (A–E) with a radio group for the correct one.
//   * Create-modal image: the file is kept locally (preview + remove) and only
//     uploaded to a staging path on SUBMIT, so question + image save in ONE
//     action (saveQuestion verifies, moves and links it — or cleans up).
import {
  Fragment,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { saveQuestion, type QuestionState } from "@/lib/admin/questions";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";
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

const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;
const TERMS = [1, 2, 3, 4] as const;

// Create-modal image constraints (images only — audio stays on the edit
// modal's media box). Server-side verification (magic-number sniff) is
// authoritative.
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

// Pads/truncates the option rows to exactly 5 (A–E).
function fiveTexts(defaults?: Defaults): string[] {
  const texts = (defaults?.options ?? []).map((o) => o.text).slice(0, 5);
  while (texts.length < 5) texts.push("");
  return texts;
}

export function QuestionForm({
  dict,
  options,
  taxonomy,
  defaults,
  id,
  submitLabel,
  statusText,
  stay,
  onSaved,
  withImagePicker,
  mediaSlot,
}: {
  dict: Record<string, string>;
  options: Options; // subject_id / grade_id selects
  taxonomy: QuestionTaxonomy; // exam topics (+term) and subtopics for cascading
  defaults?: Defaults;
  id?: string;
  submitLabel: string;
  // Read-only status display (create: "in review" note; edit: current status).
  statusText: string;
  // Embedded (modal) mode: saveQuestion returns { ok } instead of redirecting;
  // `onSaved` fires so the host can close the modal and refresh the list.
  stay?: boolean;
  onSaved?: () => void;
  // Create modal: local image picker whose upload is deferred until submit.
  withImagePicker?: boolean;
  // Edit modal: the existing immediate-upload media box, rendered in-place
  // (after the body field) to keep the owner's field order.
  mediaSlot?: React.ReactNode;
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

  // All inputs are controlled so values PERSIST across a validation error
  // (React resets uncontrolled form fields after a form action).
  const [lang, setLang] = useState(defaults?.primary_locale ?? "az");
  const [subject, setSubject] = useState(
    (defaults?.meta?.subject_id ?? "") as string,
  );
  const [grade, setGrade] = useState((defaults?.meta?.grade_id ?? "") as string);
  const [topic, setTopic] = useState((defaults?.meta?.topic_id ?? "") as string);
  const [subtopic, setSubtopic] = useState(
    (defaults?.meta?.subtopic_id ?? "") as string,
  );
  const [topicTerm, setTopicTerm] = useState(""); // only for legacy NULL-term topics
  const [body, setBody] = useState(defaults?.body ?? "");
  const [prompt, setPrompt] = useState(defaults?.prompt ?? "");
  const [explanation, setExplanation] = useState(defaults?.explanation ?? "");
  const [optTexts, setOptTexts] = useState<string[]>(() => fiveTexts(defaults));
  const [correct, setCorrect] = useState<number>(() => {
    const i = (defaults?.options ?? []).findIndex((o) => o.is_correct);
    return i >= 0 && i < 5 ? i : -1;
  });

  // ---- Cascades ------------------------------------------------------------
  // Topic belongs to the selected subject AND grade (a topic without a grade
  // matches any grade); subtopic belongs to the selected topic. Stale child
  // selections are cleared on parent change.
  const topicsForSelection = taxonomy.topics.filter(
    (tp) =>
      tp.subject_id === subject &&
      (tp.grade_id == null || tp.grade_id === grade),
  );
  const subtopicsForTopic = taxonomy.subtopics.filter(
    (st) => st.topic_id === topic,
  );
  const selectedTopic = taxonomy.topics.find((tp) => tp.id === topic) ?? null;
  const topicNeedsTerm = selectedTopic != null && selectedTopic.term == null;

  function onSubjectOrGrade(nextSubject: string, nextGrade: string) {
    setSubject(nextSubject);
    setGrade(nextGrade);
    const stillValid = taxonomy.topics.some(
      (tp) =>
        tp.id === topic &&
        tp.subject_id === nextSubject &&
        (tp.grade_id == null || tp.grade_id === nextGrade),
    );
    if (!stillValid) {
      setTopic("");
      setSubtopic("");
      setTopicTerm("");
    }
  }

  // ---- Deferred image (create modal) ----------------------------------------
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [imgError, setImgError] = useState("");
  const [uploading, setUploading] = useState(false);
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
      setImgError(tt("qimg.invalid"));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setImage(f);
    setPreview(URL.createObjectURL(f));
  }

  function removeStagedBestEffort(path: string) {
    // Fire-and-forget cleanup of an abandoned staged object.
    try {
      void createClient().storage.from(BUCKET).remove([path]);
    } catch {
      // ignore — orphaned staging objects are harmless
    }
  }

  function removeImage() {
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

  // ---- One-submission save ---------------------------------------------------
  // The image (if any) is uploaded to a staging path first, then the SAME
  // submission dispatches saveQuestion with the staged path — the server
  // verifies/moves/links it atomically with the question, so the admin still
  // performs exactly one "Save".
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (withImagePicker && image) {
      const key = fileKey(image);
      if (stagedRef.current?.key !== key) {
        setUploading(true);
        try {
          const path = await uploadStaged(image);
          if (!path) {
            setImgError(tt("qimg.uploadFailed"));
            return;
          }
          if (stagedRef.current) removeStagedBestEffort(stagedRef.current.path);
          stagedRef.current = { key, path };
        } finally {
          setUploading(false);
        }
      }
      fd.set("media_path", stagedRef.current.path);
    }
    startTransition(() => {
      action(fd);
    });
  }

  const busy = pending || uploading;
  const termLabel = (n: number) => tt(`term.${n}`);

  return (
    <form onSubmit={handleSubmit} className="form">
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

        <label className="field">
          <span className="field-label">
            {tt("qfield.subject")}
            <span className="req"> *</span>
          </span>
          <select
            name="subject_id"
            required
            value={subject}
            onChange={(e) => onSubjectOrGrade(e.target.value, grade)}
          >
            <option value="">{tt("manage.select")}</option>
            {(options.subject_id ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">
            {tt("qfield.grade")}
            <span className="req"> *</span>
          </span>
          <select
            name="grade_id"
            required
            value={grade}
            onChange={(e) => onSubjectOrGrade(subject, e.target.value)}
          >
            <option value="">{tt("manage.select")}</option>
            {(options.grade_id ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">
            {tt("qfield.topic")}
            <span className="req"> *</span>
          </span>
          <select
            name="topic_id"
            required
            disabled={!subject || !grade}
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setSubtopic("");
              setTopicTerm("");
            }}
          >
            <option value="">{tt("manage.select")}</option>
            {topicsForSelection.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
          {subject && grade && topicsForSelection.length === 0 && (
            <span className="hint">{tt("qform.noTopicsForSelection")}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">
            {tt("qfield.subtopic")}
            <span className="req"> *</span>
          </span>
          <select
            name="subtopic_id"
            required
            disabled={!topic}
            value={subtopic}
            onChange={(e) => setSubtopic(e.target.value)}
          >
            <option value="">{tt("manage.select")}</option>
            {subtopicsForTopic.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </label>

        {/* Rüb: read-only from the topic; a legacy topic (NULL) asks for one. */}
        <label className="field">
          <span className="field-label">
            {tt("qfield.term")}
            {topicNeedsTerm && <span className="req"> *</span>}
          </span>
          {topicNeedsTerm ? (
            <>
              <select
                name="topic_term"
                required
                value={topicTerm}
                onChange={(e) => setTopicTerm(e.target.value)}
              >
                <option value="">{tt("manage.select")}</option>
                {TERMS.map((n) => (
                  <option key={n} value={n}>
                    {termLabel(n)}
                  </option>
                ))}
              </select>
              <span className="hint">{tt("qform.termLegacy")}</span>
            </>
          ) : (
            <input
              type="text"
              value={selectedTopic?.term != null ? termLabel(selectedTopic.term) : "—"}
              readOnly
              disabled
            />
          )}
        </label>
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

      {/* Question image — deferred picker (create modal) or the edit modal's
          immediate-upload media box, in the owner's field position. */}
      {withImagePicker && (
        <div className="field">
          <span className="field-label">
            {tt("qimg.title")} ({tt("qimg.optional")})
          </span>
          {image && preview ? (
            <div className="media-current">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="media-preview" />
              <button
                type="button"
                className="link-danger"
                onClick={removeImage}
                disabled={busy}
              >
                {tt("qimg.remove")}
              </button>
            </div>
          ) : null}
          <label className="btn-ghost media-upload">
            {image ? tt("qimg.replace") : tt("qimg.choose")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={pickImage}
              disabled={busy}
              hidden
            />
          </label>
          <p className="hint">{tt("qimg.hint")}</p>
          {imgError && <p className="form-error">{imgError}</p>}
        </div>
      )}
      {/* Explicit key: mediaSlot is created by the HOST component, so React
          treats it as a dynamic list entry here and demands a key (this exact
          slot caused the "unique key prop … passed a child from
          EditQuestionPage" warning when the old edit page supplied it). */}
      {mediaSlot != null && <Fragment key="media-slot">{mediaSlot}</Fragment>}

      <h3 style={{ marginTop: 18 }}>{tt("qsection.options")}</h3>
      <p className="hint">{tt("qhint.single")}</p>
      <div className="options-editor">
        {OPTION_LETTERS.map((letter, i) => (
          <div className="option-row" key={letter}>
            <span className="option-letter">{letter}</span>
            <input
              type="text"
              name={`opt.${i}.text`}
              required
              value={optTexts[i]}
              placeholder={`${tt("qopt.text")} ${letter}`}
              onChange={(e) =>
                setOptTexts((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))
              }
            />
            <label className="option-correct">
              <input
                type="radio"
                name="correct"
                value={i}
                required
                checked={correct === i}
                onChange={() => setCorrect(i)}
              />
              {tt("qopt.correct")}
            </label>
          </div>
        ))}
      </div>

      {/* Read-only status (lifecycle transitions stay permission-gated). */}
      <label className="field" style={{ marginTop: 14 }}>
        <span className="field-label">{tt("qfield.status")}</span>
        <input type="text" value={statusText} readOnly disabled />
        {!id && <span className="hint">{tt("qform.statusNote")}</span>}
      </label>

      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? tt("qform.saving") : submitLabel}
      </button>
    </form>
  );
}
