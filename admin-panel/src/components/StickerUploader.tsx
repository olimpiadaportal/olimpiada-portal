"use client";

// Multi-file sticker uploader. For EACH selected file the magic bytes are
// sniffed client-side (PNG `89 50 4E 47`, WebP `RIFF....WEBP`) BEFORE the
// upload — `file.type` is never trusted, and the SNIFFED mime drives the
// contentType + extension. The binary goes to the public `sticker-assets`
// bucket at `<themeId>/<random>.<ext>`; attachStickerImage then re-verifies
// the stored object SERVER-side (existence + mime + size from Storage
// metadata) before recording media_assets + sticker_images rows.
//
// Client checks here are UX only — the server action and the bucket whitelist
// (png/webp, 2 MB) are the real enforcement.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { attachStickerImage } from "@/lib/admin/stickers";

const BUCKET = "sticker-assets";
const MAX_SIZE = 2 * 1024 * 1024;

type Strings = {
  button: string;
  uploading: string;
  hint: string;
  transparencyHint: string;
  done: string;
  errType: string;
  errSize: string;
  errUpload: string;
  errGeneric: string;
};

type FileResult = {
  name: string;
  status: "uploading" | "ok" | "error";
  message?: string;
};

// crypto.randomUUID() only exists in secure contexts (https / localhost); fall
// back gracefully when the panel is opened over a LAN IP.
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

// Sniffs the real file type from the first bytes. Returns the mime + extension
// or null when the bytes are neither PNG nor WebP.
async function sniffImage(
  file: File,
): Promise<{ mime: string; ext: string } | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length >= 8) {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a
    ) {
      return { mime: "image/png", ext: "png" };
    }
  }
  if (head.length >= 12) {
    // WebP: "RIFF" .... "WEBP"
    if (
      head[0] === 0x52 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x46 &&
      head[8] === 0x57 &&
      head[9] === 0x45 &&
      head[10] === 0x42 &&
      head[11] === 0x50
    ) {
      return { mime: "image/webp", ext: "webp" };
    }
  }
  return null;
}

function attachErrorText(code: string | undefined, strings: Strings): string {
  if (code === "err.type") return strings.errType;
  if (code === "err.size") return strings.errSize;
  return strings.errGeneric;
}

export function StickerUploader({
  themeId,
  strings,
}: {
  themeId: string;
  strings: Strings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setResults([]);

    const supabase = createClient();
    let anyOk = false;

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      setResults((prev) => [
        ...prev,
        { name: file.name, status: "uploading" },
      ]);
      const finish = (status: "ok" | "error", message?: string) => {
        setResults((prev) =>
          prev.map((r, i) => (i === idx ? { ...r, status, message } : r)),
        );
      };

      try {
        if (file.size > MAX_SIZE) {
          finish("error", strings.errSize);
          continue;
        }
        // Sniff the REAL type from the bytes — reject anything that is not a
        // PNG or WebP regardless of extension or claimed file.type.
        const sniffed = await sniffImage(file);
        if (!sniffed) {
          finish("error", strings.errType);
          continue;
        }

        const path = `${themeId}/${uniqueId()}.${sniffed.ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: sniffed.mime });
        if (upErr) {
          // Never surface raw storage internals.
          console.error("[admin] sticker upload failed", upErr.message);
          finish("error", strings.errUpload);
          continue;
        }

        const fd = new FormData();
        fd.set("theme_id", themeId);
        fd.set("path", path);
        const res = await attachStickerImage(fd);
        if (res?.error) {
          // Best-effort: do not leave an orphaned object behind.
          await supabase.storage.from(BUCKET).remove([path]);
          finish("error", attachErrorText(res.error, strings));
          continue;
        }

        anyOk = true;
        finish("ok", strings.done);
      } catch (err) {
        console.error("[admin] sticker upload unexpected error", err);
        finish("error", strings.errUpload);
      }
    }

    setBusy(false);
    e.target.value = "";
    if (anyOk) router.refresh();
  }

  return (
    <div className="form">
      <label className="btn-ghost media-upload">
        {busy ? strings.uploading : strings.button}
        <input
          type="file"
          accept="image/png,image/webp,.png,.webp"
          multiple
          onChange={onFiles}
          disabled={busy}
          hidden
        />
      </label>
      <p className="hint">{strings.hint}</p>
      <p className="hint">{strings.transparencyHint}</p>
      {results.length > 0 && (
        <ul className="stkadm-upload-list">
          {results.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className={
                r.status === "ok"
                  ? "stkadm-upload-ok"
                  : r.status === "error"
                    ? "stkadm-upload-err"
                    : "stkadm-upload-busy"
              }
            >
              {r.name} —{" "}
              {r.status === "uploading" ? strings.uploading : r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
