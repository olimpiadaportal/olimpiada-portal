"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { attachWallpaperImage } from "@/lib/admin/wallpapers";

// Image-only to match the wallpaper-assets bucket allowed_mime_types (png/jpeg/webp, 3MB).
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX = 3 * 1024 * 1024;
const BUCKET = "wallpaper-assets";

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
  name: string;
  upload: string;
  uploading: string;
  hint: string;
  saved: string;
};

export function WallpaperImageUploader({ strings }: { strings: Strings }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError(strings.name);
      e.target.value = "";
      return;
    }
    if (!ALLOWED.includes(file.type) || file.size > MAX) {
      setError(strings.hint);
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `wallpapers/${uniqueId()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        return;
      }

      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("bucket", BUCKET);
      fd.set("path", path);
      fd.set("mime", file.type);
      fd.set("size", String(file.size));

      const res = await attachWallpaperImage(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      // R9 (T9a): explicit success feedback — no more guessing whether it saved.
      setSaved(true);
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="form">
      <label className="field">
        <span className="field-label">{strings.name}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="btn-ghost media-upload">
        {busy ? strings.uploading : strings.upload}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFile}
          disabled={busy}
          hidden
        />
      </label>
      <p className="hint">{strings.hint}</p>
      {saved && <p className="form-ok">{strings.saved}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
