"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { detachNewsCover } from "@/lib/admin/news";
import {
  isValidNewsCover,
  uploadAndAttachNewsCover,
} from "@/lib/newsCover";

// Standalone cover uploader for the news EDIT page. The upload/attach plumbing
// is shared with the create form's inline picker (lib/newsCover.ts) so both
// paths use identical validation and the same hardened attach server action.

type Strings = {
  title: string;
  upload: string;
  uploading: string;
  remove: string;
  none: string;
  hint: string;
};

export function NewsCoverUploader({
  newsId,
  current,
  strings,
}: {
  newsId: string;
  current: { url: string; mime: string } | null;
  strings: Strings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!isValidNewsCover(file)) {
      setError(strings.hint);
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const err = await uploadAndAttachNewsCover(newsId, file);
      if (err) {
        setError(err);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("news_id", newsId);
      await detachNewsCover(fd);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-box">
      <h3>{strings.title}</h3>

      {current ? (
        <div className="media-current">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt="" className="media-preview" />
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
          accept="image/*"
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
