"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { attachQuestionMedia, detachQuestionMedia } from "@/lib/admin/media";

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
];
const MAX = 5 * 1024 * 1024;
const BUCKET = "question-media";

// crypto.randomUUID() only exists in secure contexts (https / localhost). When the
// app is opened over a LAN IP it is undefined, so fall back gracefully.
function uniqueId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore and use the fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type Strings = {
  title: string;
  upload: string;
  uploading: string;
  remove: string;
  none: string;
  hint: string;
};

export function QuestionMediaUploader({
  questionId,
  locale,
  current,
  strings,
  onChanged,
}: {
  questionId: string;
  locale: string;
  current: { url: string; mime: string } | null;
  strings: Strings;
  // Fired after a successful attach/detach. The edit modal passes its reload
  // here because `current` is client state there — router.refresh() alone
  // would not update the preview.
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED.includes(file.type) || file.size > MAX) {
      setError(strings.hint);
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".")
        ? file.name.split(".").pop()
        : "bin";
      const path = `questions/${questionId}/${uniqueId()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        return;
      }

      const fd = new FormData();
      fd.set("question_id", questionId);
      fd.set("locale", locale);
      fd.set("bucket", BUCKET);
      fd.set("path", path);
      fd.set("mime", file.type);
      fd.set("size", String(file.size));

      const res = await attachQuestionMedia(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onChanged?.();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("question_id", questionId);
      fd.set("locale", locale);
      await detachQuestionMedia(fd);
      router.refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-box">
      <h3>{strings.title}</h3>

      {current ? (
        <div className="media-current">
          {current.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt="" className="media-preview" />
          ) : (
            <audio src={current.url} controls />
          )}
          <button
            type="button"
            className="link-danger"
            onClick={onRemove}
            disabled={busy}
          >
            {strings.remove}
          </button>
        </div>
      ) : (
        <p className="muted">{strings.none}</p>
      )}

      <label className="btn-ghost media-upload">
        {busy ? strings.uploading : strings.upload}
        <input
          type="file"
          accept="image/*,audio/*"
          onChange={onFile}
          disabled={busy}
          hidden
        />
      </label>
      <p className="hint">{strings.hint}</p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
