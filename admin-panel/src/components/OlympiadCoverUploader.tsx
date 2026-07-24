"use client";

// Cover image upload for olympiad packages — modeled exactly on the news cover
// pattern (NewsCoverUploader): browser uploads to Storage, then a hardened
// server action verifies the object server-side before linking it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { attachOlympiadCover, detachOlympiadCover } from "@/lib/admin/olympiad";
import { ActionButton } from "@/components/ActionButton";

// Cover is image-only to match the olympiad-media bucket's allowed_mime_types.
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX = 5 * 1024 * 1024;
const BUCKET = "olympiad-media";

// crypto.randomUUID() only exists in secure contexts (https / localhost). When
// the app is opened over a LAN IP it is undefined, so fall back gracefully.
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
  /** Pending label while the remove request runs (falls back to `remove`). */
  removing?: string;
  none: string;
  hint: string;
};

export function OlympiadCoverUploader({
  packageId,
  current,
  strings,
}: {
  packageId: string;
  current: { url: string; mime: string } | null;
  strings: Strings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Scopes the remove button's spinner: `busy` is shared with the upload flow.
  const [removing, setRemoving] = useState(false);
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
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `olympiad/${packageId}/${uniqueId()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        return;
      }

      const fd = new FormData();
      fd.set("package_id", packageId);
      fd.set("bucket", BUCKET);
      fd.set("path", path);

      const res = await attachOlympiadCover(fd);
      if (res?.error) {
        setError(res.error);
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
    setRemoving(true);
    try {
      const fd = new FormData();
      fd.set("package_id", packageId);
      await detachOlympiadCover(fd);
      router.refresh();
    } finally {
      setBusy(false);
      setRemoving(false);
    }
  }

  return (
    <div className="media-box">
      <h3>{strings.title}</h3>

      {current ? (
        <div className="media-current">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt="" className="media-preview" />
          <ActionButton
            type="button"
            className="link-danger"
            pending={removing}
            pendingLabel={strings.removing}
            onClick={onRemove}
            disabled={busy}
          >
            {strings.remove}
          </ActionButton>
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
